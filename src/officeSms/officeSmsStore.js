// ======================= src/officeSms/officeSmsStore.js =======================
// 💬 2026-11-18 사내문자 — Firestore 읽기 · 쓰기와 "창 열기" 신호
//  · 모든 경로는 smsBox/{내 uid} 아래 — 보안 규칙이 본인만 허용한다(최고관리자 포함 다른 사람은 읽기 · 쓰기 모두 거절)
//  · 문자 보내기 = 대기열에 넣기(status "queued") → 업무폰 앱(KpSmsService)이 몇 초 안에 가져가 보낸다
import { collection, doc, onSnapshot, query, orderBy, limit, addDoc, updateDoc, writeBatch, serverTimestamp, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { normPeer } from "./officeSmsCore";

const MSG_LIMIT = 600;
export const OFFICE_SMS_OPEN_EVENT = "kp-office-sms-open";
export const OFFICE_SMS_ROUTE_EVENT = "kp-office-sms-route";

export const myUid = () => auth.currentUser?.uid || "";
const msgsCol = (uid) => collection(db, "smsBox", uid, "msgs");

export function watchBox(uid, cb) {
  if (!uid) return () => {};
  return onSnapshot(doc(db, "smsBox", uid), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}

export function watchMsgs(uid, cb, onErr) {
  if (!uid) return () => {};
  return onSnapshot(query(msgsCol(uid), orderBy("at", "desc"), limit(MSG_LIMIT)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { onErr?.(e); });
}

/** PC → 업무폰 대기열. 받는 사람마다 한 건씩 */
export async function queueSms(uid, list, body, opts = {}) {
  const text = String(body || "").trim();
  if (!uid || !text) return 0;
  let n = 0;
  for (const x of list || []) {
    const peer = normPeer(typeof x === "object" ? x.phone : x);
    if (!peer) continue;
    await addDoc(msgsCol(uid), {
      peer, dir: "out", body: text, status: "queued", from: "pc", at: Date.now(), read: true,
      name: (typeof x === "object" && x.name) || "", createdAt: serverTimestamp(), ...(opts.source ? { source: opts.source } : {}),
    });
    n += 1;
  }
  return n;
}

export function resendSms(uid, m) {
  return updateDoc(doc(db, "smsBox", uid, "msgs", m.id), { status: "queued", err: "", at: Date.now() });
}

export async function markRead(uid, msgs) {
  const ids = (msgs || []).filter((m) => m.dir === "in" && m.read !== true).map((m) => m.id);
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.update(doc(db, "smsBox", uid, "msgs", id), { read: true }));
    await b.commit();
  }
}

/** 대화방 지우기 — 프로그램에서만 지운다(휴대폰 문자함은 그대로) */
export async function deleteThread(uid, msgs) {
  const ids = (msgs || []).map((m) => m.id);
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, "smsBox", uid, "msgs", id)));
    await b.commit();
  }
}
export const deleteMsg = (uid, m) => deleteDoc(doc(db, "smsBox", uid, "msgs", m.id));

// ── 내 문자 보내기 방식(처음 한 번 고른다) — userSettings/{uid}.officeSmsRoute = "phone"(휴대폰과 연결) | "office"(사내문자) ──
let _route = { uid: "", v: null };
export async function getSmsRoute(uid = myUid()) {
  if (!uid) return null;
  if (_route.uid === uid && _route.v) return _route.v;
  try {
    const s = await getDoc(doc(db, "userSettings", uid));
    const v = s.exists() ? s.data()?.officeSmsRoute : null;
    _route = { uid, v: v === "office" || v === "phone" ? v : null };
  } catch { _route = { uid, v: null }; }
  return _route.v;
}
export async function setSmsRoute(v, uid = myUid()) {
  if (!uid || !["office", "phone"].includes(v)) return;
  _route = { uid, v };
  await setDoc(doc(db, "userSettings", uid), { officeSmsRoute: v, officeSmsRouteAt: serverTimestamp() }, { merge: true });
  try { window.dispatchEvent(new CustomEvent(OFFICE_SMS_ROUTE_EVENT, { detail: v })); } catch { /* 무시 */ }
}
export const cachedSmsRoute = () => (_route.uid === myUid() ? _route.v : null);

/** 사내문자 창 열기(어디서든) — peer를 주면 그 대화방으로 */
export function openOfficeSms(detail = {}) {
  try { window.dispatchEvent(new CustomEvent(OFFICE_SMS_OPEN_EVENT, { detail })); } catch { /* 무시 */ }
}

export async function getBox(uid = myUid()) {
  if (!uid) return null;
  try { const s = await getDoc(doc(db, "smsBox", uid)); return s.exists() ? s.data() : null; } catch { return null; }
}
