// ======================= src/driverEvents.jsx =======================
// ⭐ 2026-11-05 기사앱 이벤트 알림 — 배차 담당자가 "모달 없이" 바로 알아채게
//
//  ▸ 무엇을 알리나
//   · 오더 수락/거절 — 기사앱(src/driver/DriverHome.jsx)이 오더 문서에 쓰는 칸:
//       기사확인상태: "수락" | "거절"(| "대기" | "완료"), 기사확인일시(serverTimestamp), 기사거절사유,
//       기사타임라인[ { type:"수락"|"거절", at, by(기사 이름), detail(거절 사유) } ]
//     거절하면 차량번호·이름·전화번호가 지워지므로 기사 이름은 타임라인에서 꺼낸다.
//   · 기사 서류 업로드 — driver_documents { status:"제출", uploadedAt, driverId, docLabel }
//   · 긴급상황(SOS) — emergency_alerts { resolved:false, timestamp, driverName, carNo }
//
//  ▸ 읽기 비용
//   · 수락/거절: 새 구독 없음. 화면이 이미 구독 중인 "어제~내일" 오더 배열(recentDispatchData)을
//     publishDriverOrderRows()로 넘기면, 바뀐 배열일 때 한 번 훑어 이벤트를 만든다(줄마다 구독하지 않음).
//   · 서류: driver_documents 중 status=="제출"(검토 대기)만 — 승인 권한자만 구독
//   · 긴급: emergency_alerts 중 resolved==false 만
//
//  ▸ "안 본 것" 기준 — 사람마다 종류별 마지막 확인 시각(seen)을 이 브라우저(localStorage)와 users/{uid}.driverEventsSeen
//    두 곳에 저장하고 큰 값을 쓴다(다른 PC·휴대폰에서 본 것도 반영). 메뉴 숫자 = seen 이후 생긴 이벤트 수.
//
//  ▸ 보여 주는 방법(포커스를 뺏지 않음 — 입력 중에도 방해 없음)
//   · 토스트: PC 오른쪽 아래 / 모바일 위쪽 배너, 8초 뒤 자동으로 사라짐(마우스를 올리면 멈춤), [보기] = 그 오더 줄로 이동 + 반짝
//   · 줄의 상태 옆 칩: 수락(초록) / 거절(빨강 · 마우스 올리면 사유) — 안 본 것은 잠깐 맥박
//   · 메뉴 빨간 숫자(카카오톡 스타일 #FF3B30) · 머리말 종(알림함)
//   · 짧은 알림음(종 패널에서 끄기)
import React from "react";
import { createPortal } from "react-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { subscribeUsersLive } from "./usersLive"; // 서류 올린 기사 이름(앱 공용 users 구독 재사용 — 추가 읽기 없음)

export const KAKAO_RED = "#FF3B30";
const TOAST_MS = 8000;
const TOAST_WINDOW = 10 * 60 * 1000; // 새로 연 화면에서도 최근 10분 안의 "안 본" 이벤트는 토스트로
const MAX_TOASTS = 3;

const tsMs = (t) => {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "string") { const n = Date.parse(t); return Number.isFinite(n) ? n : 0; }
  return 0;
};
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
};
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k) || "[]"); } catch { return []; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v.slice(-200))); } catch { /* 무시 */ } },
};

// ─── 스토어(모듈 하나 · 화면 어디서든 같은 값) ─────────────────────────────────
const S = {
  uid: "",
  me: null,
  orderEvents: [],      // { key, id, col, kind:"accept"|"reject", at, driver, reason, row }
  docs: [],             // { key, id, at, driver, label }
  sos: [],              // { key, id, at, driver, carNo }
  seen: { orders: 0, docs: 0, sos: 0 },
  server: null,
  toasts: [],           // { ...event, tid, born }
  ver: 0,
};
const subs = new Set();
const emit = () => { S.ver++; subs.forEach((f) => { try { f(); } catch { /* 무시 */ } }); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const useStoreVer = () => React.useSyncExternalStore(subscribe, () => S.ver, () => S.ver);

const seenKey = (uid) => `kpDrvSeen:${uid || "anon"}`;
const toastedKey = (uid) => `kpDrvToasted:${uid || "anon"}`;
export const DRV_PREFS_KEY = "kpDrvEvtPrefs";
export function readDriverEventPrefs() {
  const p = ls.get(DRV_PREFS_KEY, {});
  return { sound: p.sound !== false, adminAll: p.adminAll === true, toast: p.toast !== false };
}
export function setDriverEventPrefs(patch) {
  ls.set(DRV_PREFS_KEY, { ...readDriverEventPrefs(), ...patch });
  emit();
  if ("adminAll" in patch && S._lastRows) { const r = S._lastRows; S._lastRows = null; publishDriverOrderRows(r, S.me); }
}

function loadSeen(uid) {
  const l = ls.get(seenKey(uid), {});
  const sv = S.server || {};
  return { orders: Math.max(+l.orders || 0, tsMs(sv.orders)), docs: Math.max(+l.docs || 0, tsMs(sv.docs)), sos: Math.max(+l.sos || 0, tsMs(sv.sos)) };
}
function ensureUser(uid) {
  if (!uid || S.uid === uid) return;
  S.uid = uid;
  S.seen = loadSeen(uid);
  S.toasts = [];
}
// users/{uid}.driverEventsSeen — 다른 기기에서 확인한 시각(myProfileDoc에서 넘겨 준다)
export function setDriverSeenServer(v) {
  if (!v || typeof v !== "object") return;
  S.server = v;
  if (!S.uid) return;
  const n = loadSeen(S.uid);
  if (n.orders !== S.seen.orders || n.docs !== S.seen.docs || n.sos !== S.seen.sos) { S.seen = n; emit(); }
}
let _srvTimer = null;
export function markDriverSeen(kind) {
  if (!S.uid) return;
  const kinds = Array.isArray(kind) ? kind : [kind];
  const now = Date.now();
  let changed = false;
  kinds.forEach((k) => {
    const latest = Math.max(0, ...(k === "orders" ? S.orderEvents : k === "docs" ? S.docs : S.sos).map((e) => e.at));
    if (latest > (S.seen[k] || 0)) { S.seen = { ...S.seen, [k]: now }; changed = true; }
  });
  if (!changed) return;
  ls.set(seenKey(S.uid), S.seen);
  emit();
  // 서버에도(여러 번 눌러도 2초에 한 번) — 실패해도(권한·둘러보기) 이 브라우저 기록은 남는다
  clearTimeout(_srvTimer);
  const uid = S.uid;
  _srvTimer = setTimeout(() => {
    if (uid === "preview") return;
    updateDoc(doc(db, "users", uid), { driverEventsSeen: { ...S.seen } }).catch(() => {});
  }, 2000);
}

// ─── 수락/거절 이벤트 만들기 ─────────────────────────────────────────────────
const MINE_EMAIL_KEYS = ["createdByEmail", "작성자", "등록자이메일", "createdBy", "authorEmail", "author"];
const MINE_NAME_KEYS = ["배차확정자", "등록자명", "createdByName", "등록자"];
export function isMyOrder(r, me) {
  if (!r || !me) return false;
  if (me.uid && r.createdByUid === me.uid) return true;
  const em = String(me.email || "").trim().toLowerCase();
  if (em && MINE_EMAIL_KEYS.some((k) => String(r[k] || "").trim().toLowerCase() === em)) return true;
  const nm = String(me.name || "").trim();
  if (nm && MINE_NAME_KEYS.some((k) => String(r[k] || "").trim() === nm)) return true;
  return false;
}
function lastTimeline(r, type) {
  const tl = Array.isArray(r?.기사타임라인) ? r.기사타임라인 : [];
  for (let i = tl.length - 1; i >= 0; i--) if (tl[i]?.type === type) return tl[i];
  return null;
}
export function driverAckOf(r) {
  const st = r?.기사확인상태;
  if (st !== "수락" && st !== "거절") return null;
  const kind = st === "수락" ? "accept" : "reject";
  const tl = lastTimeline(r, st);
  const at = tsMs(r.기사확인일시) || tsMs(tl?.at) || 0;
  if (!at) return null;
  return {
    kind, at,
    driver: String(tl?.by || r.이름 || r.기사명 || "").trim(),
    reason: kind === "reject" ? String(r.기사거절사유 || tl?.detail || "").trim() : "",
  };
}
const EVENT_MAX_AGE = 3 * 86400000;

// rows = 이미 받아 둔 오더 배열(어제~내일), me = { uid, email, name, isAdmin }
export function publishDriverOrderRows(rows, me) {
  if (!Array.isArray(rows) || !me?.uid) return;
  if (rows === S._lastRows && S.me && S.me.uid === me.uid && S.me.name === me.name) return;
  S._lastRows = rows;
  S.me = me;
  ensureUser(me.uid);
  const prefs = readDriverEventPrefs();
  const all = me.isAdmin && prefs.adminAll;
  const now = Date.now();
  const out = [];
  for (const r of rows) {
    if (!r || (r.기사확인상태 !== "수락" && r.기사확인상태 !== "거절")) continue;
    const a = driverAckOf(r);
    if (!a || now - a.at > EVENT_MAX_AGE) continue;
    if (!all && !isMyOrder(r, me)) continue;
    out.push({ key: `${r._id}:${a.kind}:${a.at}`, id: r._id, col: r.__col || "orders", ...a, row: r });
  }
  out.sort((x, y) => y.at - x.at);
  const prevKeys = S.orderEvents.map((e) => e.key).join("|");
  const nextKeys = out.map((e) => e.key).join("|");
  S.orderEvents = out;
  if (prevKeys !== nextKeys) { queueToasts(out, "orders"); emit(); }
}

function queueToasts(list, kind) {
  if (!S.uid) return;
  const prefs = readDriverEventPrefs();
  const done = new Set(ss.get(toastedKey(S.uid)));
  const now = Date.now();
  const fresh = list.filter((e) => !done.has(e.key) && e.at > (S.seen[kind] || 0) && now - e.at < TOAST_WINDOW);
  if (!fresh.length) return;
  fresh.forEach((e) => done.add(e.key));
  ss.set(toastedKey(S.uid), [...done]);
  if (!prefs.toast || S._muted) return;
  const born = Date.now();
  const add = fresh.slice(0, MAX_TOASTS).map((e, i) => ({ ...e, src: kind, tid: `${e.key}#${born}`, born: born + i }));
  S.toasts = [...add, ...S.toasts].slice(0, MAX_TOASTS);
  if (prefs.sound) playDing(fresh.some((e) => e.kind === "reject" || e.kind === "sos") ? "alert" : "soft");
}
export function dismissDriverToast(tid) {
  S.toasts = S.toasts.filter((t) => t.tid !== tid);
  emit();
}
// 앱의 "알림 끄기"(종 버튼)가 꺼져 있으면 토스트·소리는 내지 않는다(숫자는 그대로)
export function setDriverToastsMuted(m) { S._muted = !!m; }

// ─── 짧은 알림음(WebAudio · 파일 없음) ────────────────────────────────────────
let _ac = null;
let _lastDing = 0;
function playDing(tone = "soft") {
  try {
    if (Date.now() - _lastDing < 1500) return;
    _lastDing = Date.now();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    _ac = _ac || new AC();
    if (_ac.state === "suspended") _ac.resume().catch(() => {});
    const t0 = _ac.currentTime + 0.01;
    const notes = tone === "alert" ? [[740, 0], [554, 0.14]] : [[880, 0], [1175, 0.12]];
    notes.forEach(([f, d]) => {
      const o = _ac.createOscillator(); const g = _ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
      o.connect(g).connect(_ac.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.25);
    });
  } catch { /* 무시 */ }
}

// ─── 서류·긴급 구독(앱 머리말에서 한 번) ───────────────────────────────────────
export function useDriverEventFeeds({ uid, company, canDocs = false, canSos = true }) {
  React.useEffect(() => { if (uid) { ensureUser(uid); emit(); } }, [uid]);
  const co = String(company || "").trim();
  const [names, setNames] = React.useState(null);
  React.useEffect(() => {
    if (!uid || !canDocs) return undefined;
    return subscribeUsersLive((_l, raw) => {
      const m = new Map();
      (raw || []).forEach(({ id, data }) => { if (data?.role === "driver") m.set(id, `${data.name || data.이름 || ""}${data.carNo ? ` (${data.carNo})` : ""}`.trim()); });
      setNames(m);
    });
  }, [uid, canDocs]);
  const namesRef = React.useRef(names);
  namesRef.current = names;
  React.useEffect(() => {
    if (!S.docs.length || !names) return;
    S.docs = S.docs.map((d) => (d.driver ? d : { ...d, driver: names.get(d.driverId) || "" }));
    S.toasts = S.toasts.map((t) => (t.kind === "doc" && !t.driver ? { ...t, driver: names.get(t.driverId) || "" } : t));
    emit();
  }, [names]);
  React.useEffect(() => {
    if (!uid || !canDocs || !co) { if (S.docs.length) { S.docs = []; emit(); } return undefined; }
    return onSnapshot(query(collection(db, "driver_documents"), where("status", "==", "제출")), (s) => {
      const list = [];
      s.docs.forEach((x) => {
        const d = x.data() || {};
        if (d.status !== "제출") return;
        if (d.companyName && d.companyName !== co && !(co === DEFAULT_COMPANY && !d.companyName)) return;
        if (String(d.by || "").includes("대신 등록")) return;
        const at = tsMs(d.submittedAt) || tsMs(d.uploadedAt);
        if (!at) return;
        list.push({ key: `doc:${x.id}`, id: x.id, at, kind: "doc", driverId: d.driverId || "", driver: d.driverName || namesRef.current?.get(d.driverId) || "", label: d.docLabel || d.docType || "서류" });
      });
      list.sort((a, b) => b.at - a.at);
      S.docs = list;
      queueToasts(list, "docs");
      emit();
    }, () => { S.docs = []; emit(); });
  }, [uid, canDocs, co]);
  React.useEffect(() => {
    if (!uid || !canSos || !co) { if (S.sos.length) { S.sos = []; emit(); } return undefined; }
    return onSnapshot(query(collection(db, "emergency_alerts"), where("resolved", "==", false)), (s) => {
      const list = [];
      s.docs.forEach((x) => {
        const d = x.data() || {};
        if (d.resolved) return;
        if (d.companyName && d.companyName !== co) return;
        const at = tsMs(d.timestamp) || Date.now();
        list.push({ key: `sos:${x.id}`, id: x.id, at, kind: "sos", driver: d.driverName || "", carNo: d.carNo || "" });
      });
      list.sort((a, b) => b.at - a.at);
      S.sos = list;
      queueToasts(list, "sos");
      emit();
    }, () => { S.sos = []; emit(); });
  }, [uid, canSos, co]);
}

// 메뉴 숫자 — { orders, docs, sos, total }
export function useDriverEventCounts() {
  useStoreVer();
  const o = S.orderEvents.filter((e) => e.at > (S.seen.orders || 0)).length;
  const d = S.docs.filter((e) => e.at > (S.seen.docs || 0)).length;
  // 긴급은 처리(resolved)될 때까지 계속 센다 — 봤다고 숫자가 사라지면 놓칠 수 있다
  const s = S.sos.length;
  return { orders: o, docs: d, sos: s, sosUnseen: S.sos.filter((e) => e.at > (S.seen.sos || 0)).length, total: o + d + s };
}
export function useDriverEventList() {
  useStoreVer();
  return { orders: S.orderEvents, docs: S.docs, sos: S.sos, seen: S.seen };
}

// ─── 카카오톡 스타일 빨간 숫자 ─────────────────────────────────────────────────
export function KakaoBadge({ n, className = "", style, title, size = "md" }) {
  if (!n || n <= 0) return null;
  const sz = size === "sm" ? { minWidth: 16, height: 16, fontSize: 10, padding: "0 4px" } : size === "lg" ? { minWidth: 22, height: 22, fontSize: 12, padding: "0 6px" } : { minWidth: 18, height: 18, fontSize: 11, padding: "0 5px" };
  return (
    <span title={title} className={`kp-kakao-badge ${className}`}
      style={{ display: "inline-grid", placeItems: "center", borderRadius: 999, background: KAKAO_RED, color: "#fff", fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: 0, boxShadow: "0 1px 2px rgba(0,0,0,.18)", ...sz, ...style }}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

// ─── 오더 줄 찾아가기 + 반짝 ──────────────────────────────────────────────────
ensureStyles();
export function focusOrderRow(id, tries = 24) {
  if (!id || typeof document === "undefined") return;
  const el = document.getElementById(`row-${id}`) || document.querySelector(`[data-order-id="${CSS.escape(String(id))}"]`);
  if (!el) { if (tries > 0) setTimeout(() => focusOrderRow(id, tries - 1), 150); return; }
  try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { el.scrollIntoView(); }
  el.classList.remove("kp-evt-flash");
  void el.offsetWidth;
  el.classList.add("kp-evt-flash");
  setTimeout(() => el.classList.remove("kp-evt-flash"), 2600);
}

function ensureStyles() {
  if (typeof document === "undefined" || document.querySelector("style[data-kp='drv-evt']")) return;
  const s = document.createElement("style");
  s.setAttribute("data-kp", "drv-evt");
  s.textContent = `
@keyframes kpEvtIn{from{opacity:0;transform:translateX(24px) scale(.98)}to{opacity:1;transform:none}}
@keyframes kpEvtInTop{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
@keyframes kpEvtBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes kpEvtPulse{0%{box-shadow:0 0 0 0 var(--kp-pc)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes kpEvtFlash{0%,100%{background-color:transparent}20%,60%{background-color:rgba(143,176,240,.38)}}
tr.kp-evt-flash>td,.kp-evt-flash{animation:kpEvtFlash 1.3s ease-in-out 2}
.kp-ack{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap;vertical-align:middle;line-height:1;cursor:default}
.kp-ack.ok{background:#E7F8EF;color:#067647;border:1px solid #9BE1BC;--kp-pc:rgba(18,183,106,.55)}
.kp-ack.no{background:#FDECEC;color:#B42318;border:1px solid #F5B5B0;--kp-pc:rgba(255,59,48,.55)}
.kp-ack.new{animation:kpEvtPulse 1.4s ease-out 4}
.kp-ack i{width:6px;height:6px;border-radius:999px;background:currentColor;display:inline-block}
.kp-evt-toast{pointer-events:auto;position:relative;overflow:hidden;width:340px;max-width:calc(100vw - 24px);border-radius:16px;color:#fff;
  background:linear-gradient(150deg,#0F1A30 0%,#1B2B4B 100%);border:1px solid rgba(143,176,240,.28);box-shadow:0 18px 44px rgba(5,10,25,.42);animation:kpEvtIn .32s cubic-bezier(.2,.8,.2,1)}
.kp-evt-toast.m{width:auto;animation:kpEvtInTop .28s cubic-bezier(.2,.8,.2,1)}
.kp-evt-toast .bar{position:absolute;left:0;bottom:0;height:3px;width:100%;transform-origin:left;background:#8FB0F0;opacity:.7}
.kp-evt-toast:hover .bar{animation-play-state:paused!important}
.kp-evt-btn{height:30px;padding:0 12px;border-radius:9px;font-size:12.5px;font-weight:800;white-space:nowrap}
`;
  document.head.appendChild(s);
}

// ─── 줄의 수락/거절 칩 ────────────────────────────────────────────────────────
export function DriverAckChip({ row, className = "", hideAccept = false }) {
  useStoreVer();
  const a = driverAckOf(row);
  if (!a) return null;
  if (hideAccept && a.kind === "accept") return null; // ⭐ 2026-11-08 모바일 등록내역은 "수락" 칩을 안 보인다(거절만)
  // 거절 칩은 다시 배차하기 전(차량번호 빈 칸)까지만 · 수락 칩은 배차완료 동안
  if (a.kind === "reject" && String(row.차량번호 || "").trim()) return null;
  if (a.kind === "accept" && row.배차상태 && row.배차상태 !== "배차완료") return null;
  const unseen = a.at > (S.seen.orders || 0) && S.orderEvents.some((e) => e.id === row._id);
  const when = new Date(a.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const title = a.kind === "reject"
    ? `기사 거절${a.driver ? ` · ${a.driver}` : ""} · ${when}\n사유: ${a.reason || "-"}`
    : `기사 수락${a.driver ? ` · ${a.driver}` : ""} · ${when}`;
  return (
    <span className={`kp-ack ${a.kind === "accept" ? "ok" : "no"} ${unseen ? "new" : ""} ${className}`} title={title} data-kp-ack={a.kind}>
      <i />{a.kind === "accept" ? "수락" : "거절"}
    </span>
  );
}

// ─── 토스트(포커스를 가져가지 않는다 · 입력 중 방해 없음) ─────────────────────────
const KIND_UI = {
  accept: { label: "기사 수락", en: "ACCEPTED", c: "#34D399", bg: "rgba(52,211,153,.14)" },
  reject: { label: "기사 거절", en: "REJECTED", c: "#FF6B61", bg: "rgba(255,59,48,.16)" },
  doc: { label: "서류 제출", en: "DOCUMENT", c: "#8FB0F0", bg: "rgba(143,176,240,.16)" },
  sos: { label: "긴급 상황", en: "EMERGENCY", c: "#FF6B61", bg: "rgba(255,59,48,.2)" },
};
const hm = (ms) => new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
function orderSummary(r) {
  if (!r) return "";
  const d = String(r.상차일 || "").slice(5).replace("-", "/");
  return [d && `${d}${r.상차시간 ? ` ${r.상차시간}` : ""}`, r.거래처명, [r.상차지명, r.하차지명].filter(Boolean).join(" → ")].filter(Boolean).join(" · ");
}
export function driverEventText(e) {
  if (e.kind === "accept") return { head: `${e.driver || "기사"}님이 오더를 수락했습니다`, sub: orderSummary(e.row) };
  if (e.kind === "reject") return { head: `${e.driver || "기사"}님이 오더를 거절했습니다`, sub: orderSummary(e.row), reason: e.reason };
  if (e.kind === "doc") return { head: `${e.driver || "기사"}님이 ${e.label}을(를) 올렸습니다`, sub: "기사관리 › 기사 제출 서류에서 확인" };
  return { head: `긴급 상황 · ${e.driver || ""} ${e.carNo || ""}`.trim(), sub: "지입차관리 › 관제현황에서 위치 확인" };
}

function Toast({ t, mobile, onView }) {
  const ui = KIND_UI[t.kind] || KIND_UI.doc;
  const tx = driverEventText(t);
  const [hover, setHover] = React.useState(false);
  const left = React.useRef(TOAST_MS);
  const started = React.useRef(Date.now());
  React.useEffect(() => {
    if (hover) { left.current -= Date.now() - started.current; return undefined; }
    started.current = Date.now();
    const h = setTimeout(() => dismissDriverToast(t.tid), Math.max(400, left.current));
    return () => clearTimeout(h);
  }, [hover, t.tid]);
  const keep = (e) => e.preventDefault(); // 버튼을 눌러도 입력칸의 포커스를 빼앗지 않는다
  return (
    <div role="status" aria-live="polite" className={`kp-evt-toast ${mobile ? "m" : ""}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onMouseDown={keep}
      data-kp-toast={t.kind}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: 4, background: ui.c }} />
      <div style={{ padding: mobile ? "11px 12px 12px 16px" : "13px 14px 14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: ui.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
          {t.kind === "accept" ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ui.c} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            : t.kind === "reject" ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ui.c} strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            : t.kind === "doc" ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ui.c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 14h6M9 17h4" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ui.c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></svg>}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: ui.c }}>{ui.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: "rgba(143,176,240,.6)" }}>{ui.en}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)", fontVariantNumeric: "tabular-nums" }}>{hm(t.at)}</span>
          </div>
          <div style={{ marginTop: 3, fontSize: 14.5, fontWeight: 800, lineHeight: 1.35, wordBreak: "keep-all" }}>{tx.head}</div>
          {tx.sub && <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 600, color: "rgba(226,234,248,.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={tx.sub}>{tx.sub}</div>}
          {tx.reason && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#FFD3CF", background: "rgba(255,59,48,.12)", border: "1px solid rgba(255,107,97,.3)", borderRadius: 8, padding: "5px 8px", wordBreak: "keep-all" }}>사유 · {tx.reason}</div>}
          <div style={{ marginTop: 9, display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" tabIndex={-1} className="kp-evt-btn" onMouseDown={keep} onClick={() => dismissDriverToast(t.tid)}
              style={{ background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.75)", border: "1px solid rgba(255,255,255,.12)" }}>닫기</button>
            <button type="button" tabIndex={-1} className="kp-evt-btn" onMouseDown={keep} onClick={() => { dismissDriverToast(t.tid); onView?.(t); }}
              style={{ background: "#fff", color: "#0F1A30" }}>보기</button>
          </div>
        </div>
      </div>
      <div className="bar" style={{ animation: `kpEvtBar ${TOAST_MS}ms linear forwards` }} />
    </div>
  );
}

// PC: 오른쪽 아래 쌓임 / 모바일: 위쪽 배너(가장 최근 1개 + "외 N건")
export function DriverEventToasts({ mobile = false, onView }) {
  useStoreVer();
  ensureStyles();
  const list = S.toasts;
  if (!list.length || typeof document === "undefined") return null;
  const box = mobile
    ? { position: "fixed", left: 10, right: 10, top: "calc(env(safe-area-inset-top, 0px) + 8px)", zIndex: 2147482500, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }
    : { position: "fixed", right: 20, bottom: 76, zIndex: 2147482500, display: "flex", flexDirection: "column-reverse", gap: 10, pointerEvents: "none" };
  const shown = mobile ? list.slice(0, 1) : list;
  return createPortal(
    <div style={box} data-kp-toasts="1">
      {shown.map((t) => <Toast key={t.tid} t={t} mobile={mobile} onView={onView} />)}
      {mobile && list.length > 1 && (
        <div style={{ pointerEvents: "none", alignSelf: "center", fontSize: 11.5, fontWeight: 800, color: "#fff", background: "rgba(15,26,48,.85)", borderRadius: 999, padding: "3px 10px" }}>외 {list.length - 1}건</div>
      )}
    </div>,
    document.body,
  );
}

// ─── 머리말 종 — 숫자 + 기사 알림함(최근 이벤트 · 설정) ─────────────────────────
export function DriverEventBell({ enabled, onToggleEnabled, onView, isAdmin = false, className = "kp-icon-btn transition relative", dark = true, mobile = false }) {
  const c = useDriverEventCounts();
  const L = useDriverEventList();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 60, right: 16 });
  const btn = React.useRef(null);
  const panel = React.useRef(null);
  const prefs = readDriverEventPrefs();
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (panel.current?.contains(e.target) || btn.current?.contains(e.target)) return; setOpen(false); };
    window.addEventListener("mousedown", h, true);
    window.addEventListener("touchstart", h, true);
    return () => { window.removeEventListener("mousedown", h, true); window.removeEventListener("touchstart", h, true); };
  }, [open]);
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    setOpen((v) => !v);
  };
  const items = [
    ...L.sos.map((e) => ({ ...e, src: "sos", unseen: true })),
    ...L.orders.map((e) => ({ ...e, src: "orders", unseen: e.at > (L.seen.orders || 0) })),
    ...L.docs.map((e) => ({ ...e, src: "docs", unseen: e.at > (L.seen.docs || 0) })),
  ].sort((a, b) => (b.kind === "sos") - (a.kind === "sos") || b.at - a.at).slice(0, 30);
  const total = c.orders + c.docs + c.sos;
  const stroke = dark ? "white" : "#1B2B4B";
  return (
    <>
      <button ref={btn} type="button" onClick={toggle} className={className} data-kp-bell="1"
        title={total ? `기사 알림 ${total}건 — 눌러서 보기` : enabled ? "기사 알림 · 알림 켜짐" : "기사 알림 · 알림 꺼짐"} aria-label="기사 알림">
        {enabled ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0" /><path d="M18.63 13A17.89 17.89 0 0 1 18 8a6 6 0 0 0-9.33-5" /><path d="M6.26 6.26A6 6 0 0 0 6 8c0 7-3 9-3 9h14" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
        )}
        <KakaoBadge n={total} size="sm" style={{ position: "absolute", top: -4, right: -4, boxShadow: "0 0 0 2px #14203A" }} />
      </button>
      {open && createPortal(
        <div ref={panel} style={mobile ? { position: "fixed", left: 10, right: 10, top: pos.top, zIndex: 2147482600 } : { position: "fixed", top: pos.top, right: pos.right, width: 380, zIndex: 2147482600 }}>
          <div style={{ borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 24px 60px rgba(5,10,25,.35)", border: "1px solid #E3E8F0" }}>
            <div style={{ padding: "14px 16px 12px", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 70%,#2D4C82 100%)", color: "#fff" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".26em", color: "#8FB0F0" }}>DRIVER EVENTS</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>기사 알림</span>
                <KakaoBadge n={total} />
                <button type="button" onClick={() => markDriverSeen(["orders", "docs", "sos"])} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#CFE0FF", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, height: 26, padding: "0 9px" }}>모두 읽음</button>
              </div>
            </div>
            <div style={{ maxHeight: mobile ? "55vh" : 380, overflowY: "auto", overscrollBehavior: "contain" }}>
              {!items.length && <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13.5, fontWeight: 700, color: "#7A879C" }}>새 기사 알림이 없습니다</div>}
              {items.map((e) => {
                const ui = KIND_UI[e.kind] || KIND_UI.doc; const tx = driverEventText(e);
                return (
                  <button key={e.key} type="button" onClick={() => { setOpen(false); onView?.(e); }}
                    style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, padding: "11px 16px", borderBottom: "1px solid #EEF2F8", background: e.unseen ? "#F5F8FD" : "#fff" }}>
                    <span style={{ marginTop: 5, width: 8, height: 8, borderRadius: 999, background: e.unseen ? (e.kind === "accept" ? "#12B76A" : e.kind === "doc" ? "#2D4C82" : KAKAO_RED) : "#CBD5E1", flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: e.kind === "accept" ? "#067647" : e.kind === "doc" ? "#2D4C82" : "#B42318" }}>{ui.label}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "#9AA9C3", fontVariantNumeric: "tabular-nums" }}>{hm(e.at)}</span>
                      </span>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#0F1A30", marginTop: 1 }}>{tx.head}</span>
                      {tx.sub && <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5B6B85", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.sub}</span>}
                      {tx.reason && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#B42318", marginTop: 2 }}>사유 · {tx.reason}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "10px 16px 12px", borderTop: "1px solid #E3E8F0", background: "#F8FAFD", display: "grid", gap: 7 }}>
              {[
                ["알림 켜기(토스트·소리)", enabled, () => onToggleEnabled?.(!enabled)],
                ["알림음", prefs.sound, () => setDriverEventPrefs({ sound: !prefs.sound })],
                ...(isAdmin ? [["관리자 — 모든 담당자 오더의 수락/거절 받기", prefs.adminAll, () => setDriverEventPrefs({ adminAll: !prefs.adminAll })]] : []),
              ].map(([l, on, fn]) => (
                <label key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                  <span onClick={fn} role="switch" aria-checked={!!on} style={{ width: 34, height: 20, borderRadius: 999, background: on ? "#1B2B4B" : "#CBD5E1", position: "relative", transition: "background .15s", flexShrink: 0 }}>
                    <span style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
                  </span>
                  <span onClick={fn}>{l}</span>
                </label>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
