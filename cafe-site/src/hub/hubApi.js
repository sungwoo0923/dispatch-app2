// ======================= cafe-site/src/hub/hubApi.js =======================
// ⭐ 2026-11-06 로지스웹 허브 콜(차주·화주·운송사) — Firestore/Storage 접근 함수 모음.
//
//  데이터 구조(규칙: firestore.rules "로지스웹 허브 콜" 부분)
//   hubMembers/{uid}                 회원(역할 · 출처 · 승인상태 · 차량 · 서류 경로 · 알림설정). 본인 + 관리자만 열람
//   hubStats/{uid}                   완료 건수 · 평점 · 취소 기록(서버 함수만 씀 — 없으면 화면이 오더에서 계산)
//   hubQuota/{uid}                   등록 횟수 제한(20초 간격 · 하루 30건) — 규칙이 서버 시간으로 확인
//   hubOrders/{id}                   공개 오더(시·군·구까지만, 연락처·상세주소 없음). 승인 회원 전체 열람
//   hubOrders/{id}/private/detail    상세주소·현장 담당자·등록자 연락처 — 등록자 + (10초 확정 후) 배차된 회원
//   hubOrders/{id}/private/match     배차된 회원 정보(이름·연락처·차량·인증) — 등록자 + 배차된 회원
//   hubOrders/{id}/private/settle_{uid}  각자 정산 메모(본인만)
//   hubNotices/{id}                  알림(받는 사람만)
//   hubReports/{id}                  노쇼·허위 신고(신고자 + 관리자)
//  Storage: hub/members/{uid}/…(서류: 본인+관리자) · hub/photos/{uid}/…(프로필: 로그인 회원) · hub/pod/{orderId}/…(인수증: 당사자)
import {
  collection, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, onSnapshot, query, where, orderBy, limit,
  serverTimestamp, runTransaction, setDoc, updateDoc, writeBatch, increment, addDoc, deleteField, Timestamp,
} from "firebase/firestore";
import { ref as sref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { tonValue, estimateKm, ROLE_DOCS, routeText, CANCEL_WINDOW_MS, tsMs } from "./hubConstants";

export const M = "hubMembers";
export const O = "hubOrders";
export const memberRef = (uid) => doc(db, M, uid);
const oref = (id) => doc(db, O, id);
const pref = (id, k) => doc(db, O, id, "private", k);

// ───────────────────────── 회원 ─────────────────────────
export function subscribeMember(uid, cb) {
  return onSnapshot(memberRef(uid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null));
}
export async function getMember(uid) {
  try { const s = await getDoc(memberRef(uid)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch { return null; }
}
// 서류 1개 업로드 → { path, name, type, size }
export async function uploadMemberFile(uid, key, file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = key === "photo" ? `hub/photos/${uid}/profile_${Date.now()}.${ext}` : `hub/members/${uid}/${key}_${Date.now()}.${ext}`;
  await uploadBytes(sref(storage, path), file, { contentType: file.type || "application/octet-stream" });
  return { path, name: file.name.slice(0, 120), type: file.type || "", size: file.size || 0 };
}
export const fileUrl = (path) => (path ? getDownloadURL(sref(storage, path)) : Promise.resolve(""));

// 허브 가입 신청(승인 대기) — 이미 거절된 신청이면 다시 제출(pending)
export async function submitApplication(uid, data, existing) {
  const base = {
    ...data,
    uid,
    source: "signup",
    status: "pending",
    appliedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (existing) await updateDoc(memberRef(uid), { ...base, rejectReason: existing.rejectReason || "", resubmittedAt: serverTimestamp() });
  else await setDoc(memberRef(uid), { ...base, createdAt: serverTimestamp(), prefs: {} });
}
export function missingDocs(role, docs = {}) {
  return (ROLE_DOCS[role]?.required || []).filter((k) => !docs?.[k]?.path);
}

// 한 계정 한 기기 — 로그인할 때 기기 번호를 남기고, 다른 기기에서 로그인하면 먼저 쓰던 기기는 로그아웃된다(계정 공유 방지)
const SESSION_KEY = "hubSession";
export function localSession() { try { return localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; } }
export async function claimSession(uid) {
  const sid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try { localStorage.setItem(SESSION_KEY, sid); } catch { /* 무시 */ }
  await updateDoc(memberRef(uid), { activeSession: sid, lastLoginAt: serverTimestamp() }).catch(() => {});
  return sid;
}
export const updatePrefs = (uid, prefs) => updateDoc(memberRef(uid), { prefs, updatedAt: serverTimestamp() });

// ───────────────────────── 신뢰도(완료·평점) ─────────────────────────
// hubStats/{uid}(서버 함수)가 있으면 그것, 없으면 오더에서 바로 계산
export function subscribeStats(uid, cb) {
  if (!uid) return () => {};
  let fallbackOff = null;
  const off = onSnapshot(doc(db, "hubStats", uid), async (s) => {
    if (s.exists()) { fallbackOff?.(); fallbackOff = null; cb(s.data()); return; }
    if (fallbackOff) return;
    const calc = (rowsT, rowsP) => {
      const done = rowsT.filter((o) => o.status === "delivered");
      const r1 = rowsT.map((o) => o.ratingByPoster?.score).filter(Boolean);
      const r2 = rowsP.map((o) => o.ratingByTaker?.score).filter(Boolean);
      const all = [...r1, ...r2];
      cb({ completed: done.length, posted: rowsP.length, ratingCount: all.length, ratingSum: all.reduce((a, b) => a + b, 0), computed: true });
    };
    let t = [], p = [];
    const u1 = onSnapshot(query(collection(db, O), where("takerUid", "==", uid), limit(300)), (q) => { t = q.docs.map((d) => d.data()); calc(t, p); }, () => {});
    const u2 = onSnapshot(query(collection(db, O), where("posterUid", "==", uid), limit(300)), (q) => { p = q.docs.map((d) => d.data()); calc(t, p); }, () => {});
    fallbackOff = () => { u1(); u2(); };
  }, () => cb(null));
  return () => { off(); fallbackOff?.(); };
}
export const ratingAvg = (st) => (st?.ratingCount ? st.ratingSum / st.ratingCount : 0);

// ───────────────────────── 오더 보드 ─────────────────────────
const boardQuery = () => query(collection(db, O), where("status", "==", "open"), orderBy("createdAt", "desc"), limit(300));
export function subscribeBoard(cb, onAdded) {
  let first = true;
  return onSnapshot(boardQuery(), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!first && onAdded) {
      snap.docChanges().filter((c) => c.type === "added" && !c.doc.metadata.hasPendingWrites).forEach((c) => onAdded({ id: c.doc.id, ...c.doc.data() }));
    }
    first = false;
    cb(rows);
  }, () => cb([]));
}
export async function refreshBoard() {
  const s = await getDocsFromServer(boardQuery());
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export function subscribeMine(uid, field, cb) {
  return onSnapshot(query(collection(db, O), where(field, "==", uid), limit(300)), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.updatedAt) - tsMs(a.updatedAt)));
  }, () => cb([]));
}
export function subscribeOrder(id, cb) {
  return onSnapshot(oref(id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null));
}
export async function fetchPrivate(id, key) {
  try { const s = await getDocFromServer(pref(id, key)); return s.exists() ? s.data() : null; } catch { return null; }
}
export function subscribePrivate(id, key, cb) {
  return onSnapshot(pref(id, key), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}

// ───────────────────────── 오더 등록 ─────────────────────────
export const PUBLIC_EDIT_KEYS = ["상차시도", "상차시군구", "하차시도", "하차시군구", "상차일", "상차시간", "하차일", "하차시간", "화물내용", "중량", "파레트", "차량종류", "차량톤수", "톤수값", "상차방법", "하차방법", "운임", "수수료", "지급방식", "긴급", "운행유형", "적재", "공개메모", "거리km"];
const DETAIL_KEYS = ["상차지명", "상차지주소", "상차담당자", "상차연락처", "하차지명", "하차지주소", "하차담당자", "하차연락처", "메모"];

export function splitForm(f) {
  const pub = {};
  PUBLIC_EDIT_KEYS.forEach((k) => { if (f[k] !== undefined) pub[k] = f[k]; });
  pub.운임 = Number(String(f.운임 || "").replace(/[^\d]/g, "")) || 0;
  pub.수수료 = Number(String(f.수수료 || "").replace(/[^\d]/g, "")) || 0;
  pub.파레트 = Number(String(f.파레트 || "").replace(/[^\d]/g, "")) || 0;
  pub.톤수값 = tonValue(f.차량톤수);
  pub.거리km = estimateKm(f.상차시도, f.상차시군구, f.하차시도, f.하차시군구);
  pub.긴급 = !!f.긴급;
  const detail = {};
  DETAIL_KEYS.forEach((k) => { detail[k] = String(f[k] || "").trim(); });
  return { pub, detail };
}

export async function postOrder(member, form) {
  const { pub, detail } = splitForm(form);
  const ref = doc(collection(db, O));
  const qref = doc(db, "hubQuota", member.uid);
  await runTransaction(db, async (tx) => {
    const q = await tx.get(qref);
    const today = new Date(); // 서버 규칙이 날짜를 다시 확인한다(요청 시각 기준)
    const prev = q.exists() ? q.data() : null;
    const sameDay = prev?.day && tsMs(prev.day) === Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (prev?.lastPostAt && Date.now() - tsMs(prev.lastPostAt) < 20000) throw new Error("오더는 20초에 한 건씩 등록할 수 있습니다. 잠시 후 다시 눌러 주세요.");
    if (sameDay && (prev.count || 0) >= 30) throw new Error("하루 등록 한도(30건)를 넘었습니다. 관리자에게 문의해 주세요.");
    tx.set(qref, { uid: member.uid, count: sameDay ? (prev.count || 0) + 1 : 1, day: Timestamp.fromMillis(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), lastPostAt: serverTimestamp() });
    tx.set(ref, {
      ...pub,
      v: 3,
      posterUid: member.uid,
      posterRole: member.role,
      posterSource: member.source || "signup",
      posterCompany: member.companyName || "",
      posterName: member.name || "",
      posterVerified: member.docsVerified === true,
      status: "open",
      takerUid: null, takerRole: null, assignedAt: null,
      cancelCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(pref(ref.id, "detail"), { ...detail, posterPhone: member.phone || "", posterName: member.name || "", posterCompany: member.companyName || "" });
  });
  return ref.id;
}
export async function updateOrder(id, form) {
  const { pub, detail } = splitForm(form);
  const b = writeBatch(db);
  b.update(oref(id), { ...pub, updatedAt: serverTimestamp() });
  b.set(pref(id, "detail"), detail, { merge: true });
  await b.commit();
}

// ───────────────────────── 배차신청 · 10초 취소 ─────────────────────────
export function matchSnapshot(m) {
  return {
    takerUid: m.uid,
    role: m.role || "",
    source: m.source || "signup",
    name: m.name || "",
    phone: m.phone || "",
    companyName: m.companyName || "",
    vehicle: m.vehicle || null,
    docsVerified: m.docsVerified === true,
    bizStatus: m.bizStatus || "",
    photoPath: m.photoPath || "",
    at: serverTimestamp(),
  };
}
// 먼저 신청한 1명만 성공(트랜잭션 + 서버 규칙: 모집중일 때만) → { at: 성공한 순간(내 기기 시각) }
export async function requestDispatch(order, member) {
  if (order.posterUid === member.uid) throw new Error("내가 올린 오더는 신청할 수 없습니다.");
  await runTransaction(db, async (tx) => {
    const s = await tx.get(oref(order.id));
    if (!s.exists()) throw new Error("삭제된 오더입니다.");
    const d = s.data();
    if (d.status !== "open") throw new Error("이미 다른 차량이 배차되었습니다.");
    if ((d.cancelCount || 0) >= 5) throw new Error("취소가 반복된 오더라 더 이상 신청할 수 없습니다. 등록자에게 전화해 주세요.");
    tx.update(oref(order.id), { status: "assigned", takerUid: member.uid, takerRole: member.role, assignedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(pref(order.id, "match"), matchSnapshot(member));
  });
  notify({ toUid: order.posterUid, from: member, orderId: order.id, type: "assigned", title: "배차되었습니다", body: `${member.name || "차주"}님이 ${routeText(order)} 오더에 배차신청했습니다. 10초 뒤 확정됩니다.` });
  return { at: Date.now() };
}
// 10초 안에만 — 서버 규칙이 (요청 시각 < 배차 시각 + 10초)로 막는다
export async function cancelDispatch(order, member) {
  const b = writeBatch(db);
  b.update(oref(order.id), { status: "open", takerUid: null, takerRole: null, assignedAt: null, cancelCount: increment(1), lastCancelUid: member.uid, lastCancelAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.delete(pref(order.id, "match"));
  await b.commit();
  notify({ toUid: order.posterUid, from: member, orderId: order.id, type: "quickCancel", title: "배차신청이 취소되었습니다", body: `${routeText(order)} 오더가 다시 모집중으로 바뀌었습니다(10초 내 취소).` });
}
// 10초가 지나면 확정 표시(배차된 회원 · 등록자 누구 화면이든 먼저 본 쪽이) — 서버 규칙이 10초 경과를 다시 확인한다
export async function confirmDispatch(order) {
  await updateDoc(oref(order.id), { confirmed: true, confirmedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export const windowLeft = (order, localAt) => {
  const base = localAt || tsMs(order.assignedAt);
  return base ? Math.max(0, CANCEL_WINDOW_MS - (Date.now() - base)) : 0;
};

// 등록자 — 배차 취소하고 다시 모집(상차 전까지) / 오더 취소
export async function releaseTaker(order, member, reason = "") {
  const prevTaker = order.takerUid;
  const b = writeBatch(db);
  b.update(oref(order.id), { status: "open", takerUid: null, takerRole: null, assignedAt: null, confirmed: false, confirmedAt: null, releaseCount: increment(1), lastReleaseReason: String(reason).slice(0, 100), updatedAt: serverTimestamp() });
  b.delete(pref(order.id, "match"));
  await b.commit();
  notify({ toUid: prevTaker, from: member, orderId: order.id, type: "released", title: "배차가 취소되었습니다", body: `등록자가 ${routeText(order)} 오더 배차를 취소했습니다.${reason ? ` 사유: ${reason}` : ""}` });
}
export async function cancelOrder(order, member) {
  await updateDoc(oref(order.id), { status: "cancelled", cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (order.takerUid) notify({ toUid: order.takerUid, from: member, orderId: order.id, type: "cancelled", title: "오더가 취소되었습니다", body: `${routeText(order)} 오더를 등록자가 취소했습니다.` });
}

// ───────────────────────── 운송 진행 ─────────────────────────
export async function uploadPod(orderId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `hub/pod/${orderId}/pod_${Date.now()}.${ext}`;
  await uploadBytes(sref(storage, path), file, { contentType: file.type || "image/jpeg" });
  return path;
}
export async function markLoaded(order, member) {
  await updateDoc(oref(order.id), { status: "loaded", loadedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  notify({ toUid: order.posterUid, from: member, orderId: order.id, type: "loaded", title: "상차완료", body: `${routeText(order)} 화물을 상차했습니다.` });
}
export async function markDelivered(order, member, podFile) {
  const podPath = podFile ? await uploadPod(order.id, podFile) : "";
  await updateDoc(oref(order.id), { status: "delivered", deliveredAt: serverTimestamp(), ...(podPath ? { podPath } : {}), updatedAt: serverTimestamp() });
  notify({ toUid: order.takerUid === member.uid ? order.posterUid : order.takerUid, from: member, orderId: order.id, type: "delivered", title: "운송완료", body: `${routeText(order)} 운송이 완료되었습니다.${podPath ? " 인수증 사진이 등록되었습니다." : ""}` });
}
export async function rateOrder(order, asPoster, score, comment = "") {
  await updateDoc(oref(order.id), { [asPoster ? "ratingByPoster" : "ratingByTaker"]: { score: Math.max(1, Math.min(5, Math.round(score))), comment: String(comment).trim().slice(0, 200) }, updatedAt: serverTimestamp() });
}
export const saveSettleNote = (orderId, uid, text) => setDoc(pref(orderId, `settle_${uid}`), { text: String(text).slice(0, 1000), updatedAt: serverTimestamp() });

// ───────────────────────── 알림 · 신고 ─────────────────────────
export function notify({ toUid, from, orderId, type, title, body }) {
  if (!toUid || toUid === from?.uid) return Promise.resolve();
  return addDoc(collection(db, "hubNotices"), { toUid, fromUid: from?.uid || "", fromName: from?.name || "", orderId, type, title, body, read: false, createdAt: serverTimestamp() }).catch(() => {});
}
export function subscribeNotices(uid, cb) {
  return onSnapshot(query(collection(db, "hubNotices"), where("toUid", "==", uid), limit(100)), (s) => {
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)));
  }, () => cb([]));
}
export const markRead = (id) => updateDoc(doc(db, "hubNotices", id), { read: true }).catch(() => {});
export const reportParty = (me, order, targetUid, type, text) => addDoc(collection(db, "hubReports"), {
  reporterUid: me.uid, reporterName: me.name || "", targetUid, orderId: order.id, type, text: String(text || "").slice(0, 500), status: "open", createdAt: serverTimestamp(),
});

// ───────────────────────── 관리자(최고관리자) ─────────────────────────
export function subscribeAllMembers(cb) {
  return onSnapshot(query(collection(db, M), limit(1000)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}
export function subscribeReports(cb) {
  return onSnapshot(query(collection(db, "hubReports"), limit(300)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))), () => cb([]));
}
export async function reviewMember(uid, admin, decision, { reason = "", verified = {}, bizStatus = "" } = {}) {
  const docsVerified = decision === "approved" && Object.values(verified).length > 0 && Object.values(verified).every(Boolean);
  await updateDoc(memberRef(uid), {
    status: decision,
    reviewedAt: serverTimestamp(),
    reviewedBy: admin?.email || admin?.uid || "",
    rejectReason: decision === "rejected" || decision === "suspended" ? String(reason).trim() : deleteField(),
    ...(decision === "approved" ? { approvedAt: serverTimestamp(), verified, docsVerified, bizStatus: bizStatus || "확인 전" } : {}),
  });
}
export const getDocsOnce = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
