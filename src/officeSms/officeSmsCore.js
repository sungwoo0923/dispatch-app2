// ======================= src/officeSms/officeSmsCore.js =======================
// 💬 2026-11-18 사내문자(업무폰 문자 연결) — 화면 · 테스트가 같이 쓰는 순수 함수(Firestore 없음)
//  데이터: smsBox/{uid}            업무폰 상태(linked · device · serviceAt · perm) — 휴대폰 앱이 1분마다 적는다
//          smsBox/{uid}/msgs/{id}   문자 한 건 { peer, dir: in|out, body, status, from: pc|phone, at(ms), read, err, name }
//  🔒 본인만 읽고 쓴다(firestore.rules smsBox) — 최고관리자도 다른 사람 문자를 볼 수 없다.

export const OFFICE_SMS_STALE_MS = 3 * 60 * 1000; // 업무폰이 3분 넘게 소식이 없으면 "연결 끊김"
export const OFFICE_SMS_QUEUE_LIMIT_MS = 30 * 60 * 1000; // 휴대폰 앱이 30분 넘은 대기 문자는 보내지 않는다(KpSmsService와 같은 값)

// +82 10-1234-5678 → 01012345678 (KpSmsService.normPeer와 같은 규칙)
export function normPeer(raw) {
  let d = String(raw ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("82") && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

export function fmtPhone(p) {
  const d = normPeer(p);
  if (/^02\d{7,8}$/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (/^\d{10,11}$/.test(d)) return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (/^1\d{7}$/.test(d)) return d.replace(/^(\d{4})(\d{4})$/, "$1-$2");
  return d || String(p ?? "");
}

// 문자 바이트(한글 2) — 90바이트 넘으면 장문
export const smsBytesOf = (s) => [...String(s || "")].reduce((a, ch) => a + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);

const toMs = (v) => {
  if (typeof v === "number") return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
};
export { toMs };

/** 업무폰 상태 — { state: "none" | "off" | "on" | "auth", label, device, lastMs } */
export function phoneState(box, now = Date.now()) {
  if (!box || box.linked === false) return { state: "none", label: "업무폰 연결 전", device: "", lastMs: 0 };
  const last = toMs(box.serviceAt);
  const device = String(box.device || "");
  if (!last) return { state: "off", label: "업무폰 응답 기다리는 중", device, lastMs: 0 };
  if (now - last > OFFICE_SMS_STALE_MS) return { state: "off", label: "업무폰 연결 끊김", device, lastMs: last };
  if (box.perm && box.perm.send === false) return { state: "auth", label: "업무폰 문자 권한 꺼짐", device, lastMs: last };
  return { state: "on", label: "업무폰 연결됨", device, lastMs: last };
}

/** 이름 찾기 표 — [{ name, phone }] → { 번호: 이름 } */
export function buildNameBook(list) {
  const book = {};
  (list || []).forEach((x) => {
    const p = normPeer(x?.phone);
    const n = String(x?.name || "").trim();
    if (p && n && !book[p]) book[p] = n;
  });
  return book;
}

/** 문자 목록 → 대화방 목록(최근 순) — [{ peer, name, last, lastAt, unread, count }] */
export function groupThreads(msgs, book = {}) {
  const map = new Map();
  (msgs || []).forEach((m) => {
    const peer = normPeer(m.peer);
    if (!peer) return;
    let t = map.get(peer);
    if (!t) { t = { peer, name: "", last: null, lastAt: 0, unread: 0, count: 0 }; map.set(peer, t); }
    t.count += 1;
    const at = toMs(m.at);
    if (!t.last || at >= t.lastAt) { t.last = m; t.lastAt = at; }
    if (m.dir === "in" && m.read !== true) t.unread += 1;
    if (!t.name && m.name) t.name = String(m.name);
  });
  const out = [...map.values()];
  out.forEach((t) => { t.name = book[t.peer] || t.name || ""; });
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/** 한 대화방의 문자(오래된 → 최근) */
export function threadMessages(msgs, peer) {
  const p = normPeer(peer);
  return (msgs || []).filter((m) => normPeer(m.peer) === p).sort((a, b) => toMs(a.at) - toMs(b.at));
}

export const STATUS_LABEL = { queued: "대기", sending: "보내는 중", sent: "보냄", failed: "실패", received: "" };

/** 보낸 문자 상태 글자 — 대기 문자가 너무 오래되면 "업무폰 꺼짐"으로 */
export function statusText(m, now = Date.now()) {
  if (m.dir !== "out") return "";
  if (m.status === "queued" && now - toMs(m.at) > OFFICE_SMS_QUEUE_LIMIT_MS) return "업무폰 꺼짐";
  return STATUS_LABEL[m.status] ?? "";
}

/** 검색(이름 · 번호 · 마지막 내용) */
export function filterThreads(threads, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return threads;
  const d = s.replace(/[^\d]/g, "");
  return threads.filter((t) => (t.name && t.name.toLowerCase().includes(s)) || (d && t.peer.includes(d)) || String(t.last?.body || "").toLowerCase().includes(s));
}

export function timeLabel(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms); const n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === n.toDateString()) return hm;
  const y = new Date(now - 86400000);
  if (d.toDateString() === y.toDateString()) return `어제 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
