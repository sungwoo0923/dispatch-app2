// ======================= functions/driverAuthCore.js =======================
// 🔐 2026-11-08 기사앱 로그인 규칙(순수 함수 — 단위 테스트 scripts/driverAuthCore.test.cjs)
//  · 아이디 = 차량번호, 비밀번호 = 가입 때(또는 회사가 기사관리에) 등록한 휴대폰번호
//  · 본인 휴대폰에서만 — 처음 로그인한 기기를 등록하고, 다른 기기는 회사(기사관리 › 기기 초기화)가 풀어 줘야 로그인된다
//  · 실제 로그인 비밀번호(Firebase Auth)는 서버만 아는 임의 값 — 로그인할 때마다 새로 바꿔서 화면에 한 번만 준다
//    (예전엔 비밀번호가 차량번호라 번호판만 보면 누구나 그 기사로 로그인할 수 있었다)
"use strict";
const crypto = require("crypto");

const DOMAIN = "driver.run25.kr";
// 화면(src/driver/driverEmail.js)과 똑같이 만든다
const plateLocal = (carNo) => String(carNo || "").replace(/ /g, "");
const coHash = (co) => {
  let h = 5381;
  for (const ch of String(co || "").replace(/\s+/g, "")) h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};
const legacyDriverEmail = (carNo) => `${plateLocal(carNo)}@${DOMAIN}`.toLowerCase();
const scopedDriverEmail = (co, carNo) => `${plateLocal(carNo)}.c${coHash(co)}@${DOMAIN}`.toLowerCase();

const digits = (v) => String(v || "").replace(/\D/g, "");
const normText = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
const phoneInputOk = (v) => /^0\d{9,10}$/.test(digits(v));
const deviceIdOk = (v) => typeof v === "string" && /^[a-z0-9-]{16,80}$/i.test(v);
const deviceHash = (id) => crypto.createHash("sha256").update(`kpdrv:${id}`).digest("hex").slice(0, 40);

// 등록된 번호(여러 칸 중 하나라도) — "none" | "match" | "mismatch"
function phoneCheck(input, ...stored) {
  const want = stored.map(digits).filter((d) => d.length >= 9);
  if (!want.length) return "none";
  return want.includes(digits(input)) ? "match" : "mismatch";
}

// 등록 기기 판정 — rec: driverDevices/{uid} 데이터(없으면 null)
//  "new"(처음 · 회사가 초기화함) | "same"(등록 기기) | "other"(다른 휴대폰)
function deviceCheck(rec, hash) {
  if (!rec || !rec.id) return "new";
  return rec.id === hash ? "same" : "other";
}

const randomPassword = () => crypto.randomBytes(24).toString("base64url");

module.exports = { DOMAIN, plateLocal, coHash, legacyDriverEmail, scopedDriverEmail, digits, normText, phoneInputOk, deviceIdOk, deviceHash, phoneCheck, deviceCheck, randomPassword };
