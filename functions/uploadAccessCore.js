// functions/uploadAccessCore.js
// ⭐ 2026-11-08 보안 — 기사 업로드 링크·기사 로그인·로그인 전 공개 함수의 "순수 계산" 부분.
//  Firestore·Auth를 건드리지 않아 단위 테스트(scripts/uploadAccess.test.cjs)에서 그대로 불러 쓴다.
//  · 서명 토큰(g1.…): 서버 비밀값(UPLOAD_TOKEN_SECRET)으로 HMAC-SHA256 서명한 짧은 수명의 업로드 허가증
//  · 오더 업로드 토큰(업로드토큰): 운송사 화면이 만든 무작위 값(오더 문서에 저장) — 발급 시각(업로드토큰발급) + 유효기간
//  · 요청 수 제한(rate limit): 고정 창(window) 방식 — 메모리용·Firestore용이 같은 계산을 쓴다
"use strict";
const crypto = require("crypto");

const DEFAULT_CO = "돌캐";
// 업로드 링크(오더 토큰) 유효기간 — 운송사 화면은 만료 2일 전부터 링크를 복사하면 새 토큰을 발급한다(src/uploadTokenClient.js)
const UPLOAD_TOKEN_TTL_MS = 30 * 24 * 3600e3;
// 예전 형식 링크(발급 시각 없는 토큰 · 토큰 없이 오더 id만 있는 링크)를 받아 주는 마지막 날(한국 시간 기준 끝)
//  환경변수 UPLOAD_LEGACY_UNTIL(YYYY-MM-DD)로 바꿀 수 있다. 이 날이 지나면 예전 링크는 "만료"로 안내된다.
const LEGACY_UNTIL_DEFAULT = "2027-01-31";
// 기사 통합 검색(driverSearch)이 돌려주는 허가증 수명
const GRANT_TTL_MS = 6 * 3600e3;
// 업로드한 사진을 기사가 직접 지울 수 있는 시간(업로드한 그 화면에서만 — 세션 키 필요)
const DELETE_WINDOW_MS = 2 * 3600e3;
const UPLOAD_COLS = ["orders", "dispatch", "dispatch_test", "fixedClients"];

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  if (x.length === 0 || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function hmac(secret, data) {
  return b64u(crypto.createHmac("sha256", String(secret)).update(data).digest());
}

// payload: { o: 오더id, c: 컬렉션, co: 회사, a: ["view","upload"], exp: ms, n: 무작위 }
function signGrant(secret, payload) {
  if (!secret || String(secret).length < 16) throw new Error("UPLOAD_TOKEN_SECRET 이 없거나 너무 짧습니다(16자 이상).");
  const body = b64u(JSON.stringify(payload));
  return `g1.${body}.${hmac(secret, `g1.${body}`)}`;
}

// 서명·만료 확인 — 통과하면 payload, 아니면 null
function verifyGrant(secret, token, now = Date.now()) {
  if (!secret || typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "g1") return null;
  const expect = hmac(secret, `g1.${parts[1]}`);
  if (!safeEqual(expect, parts[2])) return null;
  let p;
  try { p = JSON.parse(unb64u(parts[1]).toString("utf8")); } catch { return null; }
  if (!p || typeof p !== "object") return null;
  if (!(Number(p.exp) > now)) return null;
  return p;
}

function newGrant(secret, { orderId, col, co, now = Date.now(), ttlMs = GRANT_TTL_MS, actions = ["view", "upload"] }) {
  return signGrant(secret, { o: String(orderId), c: String(col), co: String(co || ""), a: actions, exp: now + ttlMs, n: b64u(crypto.randomBytes(9)) });
}

function legacyUntilMs(s) {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : LEGACY_UNTIL_DEFAULT;
  // 그날 23:59:59 KST
  return Date.parse(`${v}T23:59:59+09:00`);
}

function toMs(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?._seconds === "number") return v._seconds * 1000;
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

// 업로드 링크로 이 오더에 접근해도 되는지 — { ok, reason, mode, locked }
//  order: 오더 문서 데이터 / orderId·col: 실제 문서 위치 / t: 링크의 업로드토큰 / grant: verifyGrant 결과(또는 null)
//  · grant(서명 허가증)는 같은 오더·컬렉션일 때만. 잠긴(업로드 완료) 오더는 열지 못한다.
//  · t는 오더의 업로드토큰과 같아야 한다. 발급 시각이 있으면 유효기간(30일), 없으면(예전 링크) 전환 기간까지만.
//  · 오더에 토큰이 아예 없으면(예전 "오더 id만" 링크) 전환 기간까지만.
//  ignoreLock: 방금 올린 사진 지우기처럼 잠금과 상관없는 동작
function evaluateAccess(order, { orderId, col, t, grant, now = Date.now(), legacyUntil = legacyUntilMs(), ttlMs = UPLOAD_TOKEN_TTL_MS, ignoreLock = false } = {}) {
  if (!order) return { ok: false, reason: "NOT_FOUND" };
  let mode = "";
  if (grant) {
    if (grant.o !== orderId || grant.c !== col) return { ok: false, reason: "BAD_TOKEN" };
    mode = "grant";
  } else if (order.업로드토큰) {
    if (!safeEqual(order.업로드토큰, t)) return { ok: false, reason: "BAD_TOKEN" };
    const at = toMs(order.업로드토큰발급);
    if (at > 0) {
      if (now - at > ttlMs) return { ok: false, reason: "EXPIRED" };
      mode = "token";
    } else {
      if (now > legacyUntil) return { ok: false, reason: "EXPIRED" };
      mode = "legacy-token";
    }
  } else {
    if (now > legacyUntil) return { ok: false, reason: "EXPIRED" };
    mode = "legacy-id";
  }
  const unlockUntil = toMs(order.업로드잠금해제만료);
  const locked = order.업로드잠금 === true && !(unlockUntil > now);
  if (locked && !ignoreLock) return { ok: false, reason: "LOCKED", mode };
  return { ok: true, mode, locked };
}

// 업로드 화면에 보여줄 칸만(업로드토큰·운임·메모·화주 정보 등은 내려주지 않는다)
const VIEW_FIELDS = ["상차일", "날짜", "상차시간", "하차시간", "상차지명", "하차지명", "거래처명", "이름", "차량번호", "전화번호",
  "차량종류", "차량톤수", "화물내용", "지급방식", "상차지담당자번호", "companyName", "company"];
function pickView(order) {
  const out = {};
  for (const k of VIEW_FIELDS) if (order[k] !== undefined && order[k] !== null && typeof order[k] !== "object") out[k] = order[k];
  if (!out.상차일 && out.날짜) out.상차일 = out.날짜;
  delete out.날짜;
  out.업로드잠금 = order.업로드잠금 === true;
  return out;
}

// 원본 ↔ 화주사 전송사본(첨부·잠금을 양쪽에 같이 반영)
function mirrorOf(order) {
  if (order?._transmittedOrderId && typeof order._transmittedOrderId === "string") return { col: "orders", id: order._transmittedOrderId };
  if (order?.originCol && order?.originId && UPLOAD_COLS.includes(order.originCol) && typeof order.originId === "string") return { col: order.originCol, id: order.originId };
  return null;
}

// 첨부 파일 검사 — data URL(image/* 또는 PDF), 1.3MB(base64) 이하
const MAX_B64 = 1_400_000;
function checkFile(f) {
  if (!f || typeof f !== "object") return "NO_FILE";
  const b = String(f.base64 || "");
  if (!/^data:(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(b)) return "BAD_FILE";
  if (b.length > MAX_B64) return "TOO_LARGE";
  return "";
}

// ── 요청 수 제한 — 고정 창: { n, start } ──
function rateStep(entry, now, limit, windowMs) {
  const e = entry && now - Number(entry.start || 0) < windowMs ? { n: Number(entry.n || 0), start: Number(entry.start) } : { n: 0, start: now };
  if (e.n >= limit) return { allowed: false, entry: e, retryAfterMs: e.start + windowMs - now };
  return { allowed: true, entry: { n: e.n + 1, start: e.start }, retryAfterMs: 0 };
}

// 인스턴스 메모리 제한(빠른 1차 거름 — 인스턴스가 여러 개면 각자 센다, 최종 판단은 Firestore 쪽)
function createMemoryLimiter({ max = 5000 } = {}) {
  const m = new Map();
  return {
    hit(key, limit, windowMs, now = Date.now()) {
      const r = rateStep(m.get(key), now, limit, windowMs);
      m.delete(key);
      m.set(key, r.entry);
      if (m.size > max) { const first = m.keys().next().value; m.delete(first); }
      return r;
    },
    size: () => m.size,
  };
}

const keyHash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 40);
const plateOf = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
const normText = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
const coDocKey = (co, key) => { const c = String(co || "").trim(); return c && c !== DEFAULT_CO ? `${c}__${key}` : key; };

// 기사 로그인 선등록 문서 판정(서버) — pre: drivers/{회사__차량번호} 데이터 / legacy: drivers/{차량번호} 데이터 (없으면 null)
//  결과: { ok:true, use:"pre"|"legacy" } | { ok:false, code }
function judgePreRegistered({ pre, legacy, name, companyName, uid }) {
  let use = pre ? "pre" : null;
  let d = pre;
  if (!d && legacy && normText(legacy.companyName) === normText(companyName)) { d = legacy; use = "legacy"; }
  if (!d) {
    if (legacy && String(legacy.companyName || "").trim()) return { ok: false, code: "COMPANY_MISMATCH" };
    return { ok: false, code: "NOT_FOUND" };
  }
  if (d.uid && d.uid !== uid) return { ok: false, code: "NOT_FOUND" };
  if (normText(d.이름 || d.name) !== normText(name)) return { ok: false, code: "NAME_MISMATCH" };
  if (normText(d.companyName) !== normText(companyName)) return { ok: false, code: "COMPANY_MISMATCH" };
  return { ok: true, use };
}

module.exports = {
  DEFAULT_CO, UPLOAD_TOKEN_TTL_MS, LEGACY_UNTIL_DEFAULT, GRANT_TTL_MS, DELETE_WINDOW_MS, UPLOAD_COLS, MAX_B64,
  safeEqual, signGrant, verifyGrant, newGrant, legacyUntilMs, toMs, evaluateAccess, pickView, mirrorOf, checkFile,
  rateStep, createMemoryLimiter, keyHash, plateOf, normText, coDocKey, judgePreRegistered, b64u,
};
