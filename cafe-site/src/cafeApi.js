// ======================= cafe-site/src/cafeApi.js =======================
// 로지스웹 허브(예전 배차마당) — Firestore 접근 공용 함수.
//
// ⭐ 2026-11-06 운송사 간 오더 거래(v2) 데이터 구조
//  cafeOrders/{id}                 공개 게시글(로그인 회원 전체 열람). 상·하차는 시/구까지만, 연락처·정확한 주소 없음.
//                                  status: open(모집중) → matched(매칭완료) → dispatched(배차완료) → delivered(운송완료) | cancelled
//                                  requesterUids: 잡기 요청한 운송사 계정 uid 목록(내 요청 목록용) · takerUid/takerCompany: 매칭된 운송사
//                                  takerOrderId: 받은 운송사 프로그램에 복사된 오더(orders/mkt_{id}) · posterOrderId: 올린 운송사의 원래 오더
//  cafeOrders/{id}/private/detail  상·하차지명·정확한 주소·현장 담당자·연락처 — 올린 운송사 + 매칭된 운송사만 열람
//  cafeOrders/{id}/private/settle  올린 운송사만 보는 정산 메모(청구 운임·수수료)
//  cafeOrders/{id}/requests/{uid}  잡기 요청(제안 차량·기사·메시지) — 요청한 운송사 본인 + 올린 운송사만 열람
//  marketNotices/{id}              알림(받는 사람 본인만 열람)
//  orders/mkt_{id}                 수락되면 받은 운송사 프로그램에 생기는 오더(source: "ordermarket")
//
//  예전 게시글(v 없음)은 cafeOrders 본문 + contact/info(연락처) 구조와 10초 배차신청 흐름을 그대로 쓴다.

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, runTransaction, setDoc,
  writeBatch, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { APPLY_CANCEL_WINDOW_MS, STATUS_META, fareNum, tonNum, toRegion, MARKET_NAME } from "./cafeConstants";

export const CAFE_ORDERS_COL = "cafeOrders";
export const NOTICE_COL = "marketNotices";
export const takerOrderDocId = (listingId) => `mkt_${listingId}`;
const lref = (id) => doc(db, CAFE_ORDERS_COL, id);
const pref = (id, k) => doc(db, CAFE_ORDERS_COL, id, "private", k);
const rref = (id, uid) => doc(db, CAFE_ORDERS_COL, id, "requests", uid);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// ───────────────────────── 공개/비공개 나누기 ─────────────────────────
const PUBLIC_KEYS = ["상차일", "상차시간", "하차일", "하차시간", "화물내용", "차량톤수", "차량종류", "리프트", "지급방식", "상차방법", "하차방법", "혼적", "운행유형", "긴급", "경유여부", "협의", "공개메모"];
const DETAIL_KEYS = ["상차지명", "상차지주소", "하차지명", "하차지주소", "상차지담당자", "상차지담당자번호", "하차지담당자", "하차지담당자번호", "메모"];

// 입력 폼 → { pub: 공개 본문, detail: 매칭 후 공개 }
export function splitOrderFields(form) {
  const pub = {};
  PUBLIC_KEYS.forEach((k) => { if (form[k] !== undefined) pub[k] = form[k]; });
  const up = toRegion(form.상차지주소);
  const dn = toRegion(form.하차지주소);
  pub.상차시도 = up.sido; pub.상차시군구 = up.sigungu;
  pub.하차시도 = dn.sido; pub.하차시군구 = dn.sigungu;
  pub.운임 = form.협의 ? "협의" : (form.운임 || "");
  pub.운임값 = form.협의 ? 0 : fareNum(form.운임);
  pub.톤수값 = tonNum(form.차량톤수);
  const detail = {};
  DETAIL_KEYS.forEach((k) => { detail[k] = form[k] || ""; });
  return { pub, detail };
}

// ───────────────────────── 등록/수정/삭제 ─────────────────────────
// 오더 등록(v2) — 공개 본문 + 비공개 상세 + (선택) 정산 메모를 한 번에 저장
export async function createMarketOrder({ pub, detail, settle, profile, posterOrderId = "", source = "market" }) {
  const ref = doc(collection(db, CAFE_ORDERS_COL));
  const b = writeBatch(db);
  b.set(ref, {
    ...pub,
    v: 2,
    source,
    companyName: profile.companyName,
    posterUid: profile.uid,
    posterName: profile.name || "",
    posterNickname: profile.nickname || "",
    posterOrderId: posterOrderId || "",
    status: "open",
    requesterUids: [],
    takerUid: null, takerCompany: null, takerName: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  b.set(pref(ref.id, "detail"), { ...detail, posterPhone: profile.phone || "", posterName: profile.name || "", posterCompany: profile.companyName });
  if (settle) b.set(pref(ref.id, "settle"), { ...settle, updatedAt: serverTimestamp() });
  await b.commit();
  return ref.id;
}

export async function updateMarketOrder(id, { pub, detail, settle }) {
  const b = writeBatch(db);
  b.update(lref(id), { ...pub, updatedAt: serverTimestamp() });
  if (detail) b.set(pref(id, "detail"), detail, { merge: true });
  if (settle) b.set(pref(id, "settle"), { ...settle, updatedAt: serverTimestamp() }, { merge: true });
  await b.commit();
}

// (예전 게시글) 본문 수정
export async function updateCafeOrder(id, fields) {
  await updateDoc(lref(id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteCafeOrder(id) {
  // 비공개 문서까지 함께 정리(베스트에포트 — 실패해도 상위 글 삭제는 진행)
  for (const k of ["detail", "settle"]) { try { await deleteDoc(pref(id, k)); } catch { /* 무시 */ } }
  try { await deleteDoc(doc(db, CAFE_ORDERS_COL, id, "contact", "info")); } catch { /* 무시 */ }
  await deleteDoc(lref(id));
}

export async function cancelCafeOrder(id) {
  await updateDoc(lref(id), { status: "cancelled", updatedAt: serverTimestamp() });
}

// ───────────────────────── 구독 ─────────────────────────
export function subscribeCafeOrders(cb) {
  const q = query(collection(db, CAFE_ORDERS_COL), orderBy("createdAt", "desc"), limit(500));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => cb([]));
}

export function subscribeMyCafeOrders(uid, cb) {
  const q = query(collection(db, CAFE_ORDERS_COL), where("posterUid", "==", uid));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(rows);
  }, () => {});
}

// 비공개 상세 — 올린 운송사 / 매칭된 운송사만 규칙에서 허용(그 외엔 null)
export async function fetchPrivate(id, key = "detail") {
  try {
    const snap = await getDoc(pref(id, key));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// ───────────────────────── 잡기 요청 ─────────────────────────
// [이 오더 잡기] — 요청 문서 + 게시글의 요청자 목록에 내 uid 추가(한 번에)
export async function requestOrder(listing, profile, offer = {}) {
  if (listing.posterUid === profile.uid || listing.companyName === profile.companyName) throw new Error("우리 회사가 올린 오더는 잡을 수 없습니다.");
  if (listing.status !== "open") throw new Error("이미 마감된 오더입니다.");
  const b = writeBatch(db);
  b.set(rref(listing.id, profile.uid), {
    takerUid: profile.uid,
    takerCompany: profile.companyName,
    takerName: profile.name || profile.nickname || "",
    takerPhone: profile.phone || "",
    차량번호: (offer.차량번호 || "").trim(),
    기사명: (offer.기사명 || "").trim(),
    기사연락처: (offer.기사연락처 || "").trim(),
    차량정보: (offer.차량정보 || "").trim(),
    메시지: (offer.메시지 || "").trim(),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  b.update(lref(listing.id), { requesterUids: arrayUnion(profile.uid), updatedAt: serverTimestamp() });
  await b.commit();
  sendNotice({
    toUid: listing.posterUid, fromProfile: profile, orderId: listing.id, type: "request",
    title: "새 잡기 요청", body: `${profile.companyName}에서 ${routeLabel(listing)} 오더를 잡겠다고 요청했습니다.`,
  });
}

export async function withdrawRequest(listing, profile) {
  const b = writeBatch(db);
  b.update(rref(listing.id, profile.uid), { status: "withdrawn", updatedAt: serverTimestamp() });
  b.update(lref(listing.id), { requesterUids: arrayRemove(profile.uid), updatedAt: serverTimestamp() });
  await b.commit();
}

export function subscribeRequests(listingId, cb) {
  return onSnapshot(collection(db, CAFE_ORDERS_COL, listingId, "requests"), (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)));
  }, () => cb([]));
}
export function subscribeMyRequest(listingId, uid, cb) {
  return onSnapshot(rref(listingId, uid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null));
}

// [수락] — 올린 운송사가 요청 하나를 고르면 매칭완료. 같은 오더의 다른 요청은 "마감"으로 정리한다.
export async function acceptRequest(listing, req, profile, others = []) {
  await runTransaction(db, async (tx) => {
    const s = await tx.get(lref(listing.id));
    if (!s.exists()) throw new Error("존재하지 않는 오더입니다.");
    if (s.data().status !== "open") throw new Error("이미 매칭되었거나 마감된 오더입니다.");
    const r = await tx.get(rref(listing.id, req.id));
    if (!r.exists() || r.data().status !== "pending") throw new Error("요청이 취소되었습니다.");
    tx.update(lref(listing.id), {
      status: "matched",
      takerUid: req.id,
      takerCompany: r.data().takerCompany || "",
      takerName: r.data().takerName || "",
      matchedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(rref(listing.id, req.id), { status: "accepted", decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  sendNotice({
    toUid: req.id, fromProfile: profile, orderId: listing.id, type: "accepted",
    title: "잡기 요청이 수락되었습니다", body: `${profile.companyName}이(가) ${routeLabel(listing)} 오더를 귀사에 맡겼습니다. 상세 주소·연락처가 공개되었고 귀사 배차 프로그램에 오더가 등록됩니다.`,
  });
  others.filter((o) => o.id !== req.id && o.status === "pending").forEach((o) => {
    updateDoc(rref(listing.id, o.id), { status: "closed", decidedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
    sendNotice({ toUid: o.id, fromProfile: profile, orderId: listing.id, type: "closed", title: "다른 운송사와 매칭되었습니다", body: `${routeLabel(listing)} 오더가 다른 운송사와 매칭되어 마감되었습니다.` });
  });
}

export async function rejectRequest(listing, req, profile) {
  await updateDoc(rref(listing.id, req.id), { status: "rejected", decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  sendNotice({ toUid: req.id, fromProfile: profile, orderId: listing.id, type: "rejected", title: "잡기 요청이 거절되었습니다", body: `${routeLabel(listing)} 오더 요청이 거절되었습니다.` });
}

// 매칭 취소(배차 전까지만) — 올린 운송사. 받은 운송사 프로그램의 오더는 "오더마켓 매칭취소"로 표시만 남는다.
export async function cancelMatch(listing, profile) {
  if (listing.status !== "matched") throw new Error("배차가 진행된 오더는 매칭을 취소할 수 없습니다. 상대 운송사와 먼저 협의해 주세요.");
  const takerUid = listing.takerUid;
  const b = writeBatch(db);
  b.update(lref(listing.id), { status: "open", takerUid: null, takerCompany: null, takerName: null, takerOrderId: null, matchedAt: null, requesterUids: arrayRemove(takerUid), updatedAt: serverTimestamp() });
  b.update(rref(listing.id, takerUid), { status: "cancelled", decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await b.commit();
  sendNotice({ toUid: takerUid, fromProfile: profile, orderId: listing.id, type: "unmatched", title: "매칭이 취소되었습니다", body: `${profile.companyName}이(가) ${routeLabel(listing)} 오더 매칭을 취소했습니다. 귀사 배차 프로그램에 등록된 오더를 확인해 주세요.` });
}

// ───────────────────────── 받은 운송사 프로그램으로 복사 ─────────────────────────
// 서버 함수(functions/orderMarket.js)가 매칭 즉시 만들어 주지만, 함수가 아직 배포되지 않았거나 늦을 때를 대비해
// 받은 운송사가 이 사이트를 열면 직접 만든다. 문서 이름이 같아(orders/mkt_{id}) 두 번 생기지 않는다.
export function buildTakerOrder(listing, detail, req, takerCompany, takerEmail = "") {
  const car = (req?.차량번호 || "").trim();
  const memo = [`[${MARKET_NAME}] ${listing.companyName || ""} 오더`, req?.메시지 ? `요청메모: ${req.메시지}` : "", detail?.메모 || "", listing.공개메모 || ""].filter(Boolean).join("\n");
  return {
    _id: takerOrderDocId(listing.id),
    companyName: takerCompany,
    등록일: kstToday(),
    등록기기: MARKET_NAME,
    작성자: takerEmail,
    source: "ordermarket",
    오더마켓Id: listing.id,
    오더마켓원청: listing.companyName || "",
    오더마켓원청Uid: listing.posterUid || "",
    오더마켓원청오더Id: listing.posterOrderId || "",
    오더마켓상태: car ? "배차완료" : "매칭완료",
    거래처명: listing.companyName || "",
    상차일: listing.상차일 || kstToday(), 상차시간: listing.상차시간 || "",
    하차일: listing.하차일 || listing.상차일 || kstToday(), 하차시간: listing.하차시간 || "",
    상차지명: detail?.상차지명 || "", 상차지주소: detail?.상차지주소 || "",
    하차지명: detail?.하차지명 || "", 하차지주소: detail?.하차지주소 || "",
    상차지담당자: detail?.상차지담당자 || "", 상차지담당자번호: detail?.상차지담당자번호 || "",
    하차지담당자: detail?.하차지담당자 || "", 하차지담당자번호: detail?.하차지담당자번호 || "",
    화물내용: listing.화물내용 || "", 차량톤수: listing.차량톤수 || "", 차량종류: listing.차량종류 || "",
    지급방식: listing.지급방식 || "", 상차방법: listing.상차방법 || "", 하차방법: listing.하차방법 || "",
    혼적: !!listing.혼적, 운행유형: listing.운행유형 || "편도", 긴급: !!listing.긴급,
    메모: memo,
    청구운임: Number(listing.운임값) || 0,
    기사운임: 0,
    배차상태: car ? "배차완료" : "배차중",
    차량번호: car, 이름: (req?.기사명 || "").trim(), 전화번호: (req?.기사연락처 || "").trim(),
    ...(car ? { 배차완료일시: Date.now() } : {}),
  };
}

export async function importToMyProgram(listing, profile) {
  if (listing.takerUid !== profile.uid) return null;
  const orderId = takerOrderDocId(listing.id);
  if (listing.takerOrderId === orderId) return orderId;
  const [detail, reqSnap] = await Promise.all([fetchPrivate(listing.id, "detail"), getDoc(rref(listing.id, profile.uid)).catch(() => null)]);
  const req = reqSnap?.exists?.() ? reqSnap.data() : null;
  await runTransaction(db, async (tx) => {
    const o = await tx.get(doc(db, "orders", orderId));
    if (!o.exists()) tx.set(doc(db, "orders", orderId), { ...buildTakerOrder(listing, detail, req, profile.companyName, profile.email), createdAt: serverTimestamp() });
    tx.update(lref(listing.id), { takerOrderId: orderId, updatedAt: serverTimestamp() });
  });
  return orderId;
}

// 받은 운송사 프로그램 오더의 진행 단계 → 게시글 단계
export function stageOfOrder(o) {
  if (!o) return null;
  if (o.배차상태 === "배차취소") return null;
  if (o.기사확인상태 === "완료" || o.기사완료일시) return "delivered";
  if (String(o.차량번호 || "").trim()) return "dispatched";
  return "matched";
}
export const maskPlate = (p) => { const s = String(p || "").replace(/\s+/g, ""); return s.length > 2 ? `${s.slice(0, -2)}**` : s; };

// 받은 운송사 — 내 프로그램 오더의 배차/운송 상태를 게시글에 반영(서버 함수와 같은 일 · 앞으로만 진행)
export async function syncTakerStatus(listing, profile) {
  if (listing.takerUid !== profile.uid || !listing.takerOrderId) return;
  const s = await getDoc(doc(db, "orders", listing.takerOrderId)).catch(() => null);
  if (!s?.exists()) return;
  const o = s.data();
  const stage = stageOfOrder(o);
  if (!stage || STATUS_META[stage].step <= (STATUS_META[listing.status]?.step ?? 0)) return;
  await updateDoc(lref(listing.id), {
    status: stage,
    ...(stage === "dispatched" || stage === "delivered" ? { driverMasked: maskPlate(o.차량번호), dispatchedAt: listing.dispatchedAt || serverTimestamp() } : {}),
    ...(stage === "delivered" ? { deliveredAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}

// 올린 운송사 — 내 원래 오더에 진행 상태와 받은 운송사 기사를 반영(서버 함수와 같은 일)
export async function syncPosterMirror(listing, profile) {
  if (listing.posterUid !== profile.uid || !listing.posterOrderId || !["matched", "dispatched", "delivered"].includes(listing.status)) return;
  const [ps, ts] = await Promise.all([
    getDoc(doc(db, "orders", listing.posterOrderId)).catch(() => null),
    listing.takerOrderId ? getDoc(doc(db, "orders", listing.takerOrderId)).catch(() => null) : null,
  ]);
  if (!ps?.exists()) return;
  const patch = posterMirrorPatch(ps.data(), ts?.exists?.() ? ts.data() : null, listing);
  if (patch) await updateDoc(doc(db, "orders", listing.posterOrderId), patch).catch(() => {});
}
// (서버 함수 functions/orderMarket.js 의 mirrorPatch 와 같은 규칙)
export function posterMirrorPatch(po, to, listing) {
  const label = STATUS_META[listing.status]?.label || "";
  const patch = {};
  if (po.오더마켓상태 !== label) patch.오더마켓상태 = label;
  if (po.오더마켓수행사 !== (listing.takerCompany || "")) patch.오더마켓수행사 = listing.takerCompany || "";
  if (po.오더마켓Id !== listing.id) patch.오더마켓Id = listing.id;
  const linked = po.오더마켓기사연동 === true || !String(po.차량번호 || "").trim();
  if (to && linked && String(to.차량번호 || "").trim()) {
    if (po.차량번호 !== to.차량번호) patch.차량번호 = to.차량번호;
    if (po.이름 !== (to.이름 || "")) patch.이름 = to.이름 || "";
    if (po.전화번호 !== (to.전화번호 || "")) patch.전화번호 = to.전화번호 || "";
    if (po.배차상태 !== "배차완료") { patch.배차상태 = "배차완료"; if (!po.배차완료일시) patch.배차완료일시 = Date.now(); }
    if (po.오더마켓기사연동 !== true) patch.오더마켓기사연동 = true;
    if (listing.status === "delivered" && po.기사확인상태 !== "완료") { patch.기사확인상태 = "완료"; if (!po.기사완료일시) patch.기사완료일시 = Date.now(); }
  }
  return Object.keys(patch).length ? patch : null;
}

// ───────────────────────── 평가 ─────────────────────────
export async function rateParty(listing, asRole, score, comment = "") {
  const key = asRole === "poster" ? "ratingByPoster" : "ratingByTaker";
  await updateDoc(lref(listing.id), { [key]: { score: Number(score), comment: comment.trim().slice(0, 200), at: Date.now() }, updatedAt: serverTimestamp() });
}

// ───────────────────────── 알림 ─────────────────────────
export function sendNotice({ toUid, fromProfile, orderId, type, title, body }) {
  if (!toUid || toUid === fromProfile?.uid) return Promise.resolve();
  return addDoc(collection(db, NOTICE_COL), {
    toUid, fromUid: fromProfile?.uid || "", fromCompany: fromProfile?.companyName || "",
    orderId, type, title, body, read: false, createdAt: serverTimestamp(),
  }).catch(() => {});
}
export function subscribeNotices(uid, cb) {
  const q = query(collection(db, NOTICE_COL), where("toUid", "==", uid));
  return onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 60)), () => cb([]));
}
export const markNoticeRead = (id) => updateDoc(doc(db, NOTICE_COL, id), { read: true, readAt: serverTimestamp() }).catch(() => {});

export const routeLabel = (o) => {
  const a = [o.상차시도, o.상차시군구].filter(Boolean).join(" ") || o.상차지명 || "상차지";
  const b = [o.하차시도, o.하차시군구].filter(Boolean).join(" ") || o.하차지명 || "하차지";
  return `${a} → ${b}`;
};

// ───────────────────────── 예전 게시글(v 없음) 흐름 — 그대로 유지 ─────────────────────────
// 배차신청 — "open" 상태에서만 성공, 트랜잭션으로 동시신청 경합을 막는다.
export async function applyToCafeOrder(orderId, applicant) {
  const ref = lref(orderId);
  const contactRef = doc(db, CAFE_ORDERS_COL, orderId, "contact", "info");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("존재하지 않는 오더입니다.");
    const data = snap.data();
    if (data.status !== "open") throw new Error("이미 신청되었거나 마감된 오더입니다.");
    tx.update(ref, {
      status: "applying",
      applicantUid: applicant.uid,
      applicantName: applicant.name || "",
      applicantNickname: applicant.nickname || "",
      applyRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(contactRef, { applicantPhone: applicant.phone || "", applicantName: applicant.name || "" }, { merge: true });
  });
}

export async function cancelCafeApply(orderId, uid) {
  const ref = lref(orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "applying" || data.applicantUid !== uid) return;
    tx.update(ref, { status: "open", applicantUid: null, applicantName: null, applicantNickname: null, applyRequestedAt: null, updatedAt: serverTimestamp() });
  });
}

export async function finalizeCafeApplyIfDue(orderId) {
  const ref = lref(orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "applying") return;
    const requestedMs = data.applyRequestedAt?.toMillis ? data.applyRequestedAt.toMillis() : 0;
    if (!requestedMs || Date.now() - requestedMs < APPLY_CANCEL_WINDOW_MS) return;
    tx.update(ref, { status: "confirmed", confirmedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

// 확정(배차완료) 상태일 때만 firestore.rules가 조회를 허용한다.
export async function fetchCafeContact(orderId) {
  try {
    const snap = await getDoc(doc(db, CAFE_ORDERS_COL, orderId, "contact", "info"));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}
