// src/driver/driverEmail.js
// ⭐ 2026-11-01 기사 로그인 계정 — 예전엔 "차량번호@driver.run25.kr" 하나뿐이라
// 다른 운송사에 같은 차량번호 기사가 이미 있으면 두 번째 기사는 가입이 막혔다.
// 그런 경우에만 회사별 계정(차량번호.회사코드@driver.run25.kr)을 쓴다.
// 기존 기사는 예전 계정 그대로 로그인된다.
import { signInWithEmailAndPassword } from "firebase/auth";

const DOMAIN = "driver.run25.kr";
const plate = (carNo) => String(carNo || "").replace(/ /g, "");
const coHash = (co) => {
  let h = 5381;
  for (const ch of String(co || "").replace(/\s+/g, "")) h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};

export const legacyDriverEmail = (carNo) => `${plate(carNo)}@${DOMAIN}`;
export const scopedDriverEmail = (companyName, carNo) => `${plate(carNo)}.c${coHash(companyName)}@${DOMAIN}`;

// 🔐 2026-11-08 로그인 — 아이디 = 차량번호, 비밀번호 = 등록한 휴대폰번호, 본인 휴대폰(처음 로그인한 기기)에서만.
//  서버(functions/driverAuth.js driverSignIn)가 차량번호·휴대폰번호·기기를 확인하고, 그 계정의 로그인 비밀번호를
//  새 임의 값으로 바꿔 한 번만 준다 → 바로 그 값으로 로그인. (예전엔 비밀번호가 차량번호라 번호판만 알면 누구나 로그인됐다)
//  실패 코드(err.code): driver/not-registered · driver/other-company · driver/phone-mismatch · driver/no-phone
//   · driver/device-mismatch · driver/bad-phone · auth/user-disabled · auth/too-many-requests · driver/network
const DEVICE_KEY = "kpDriverDeviceId";
export function driverDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[a-z0-9-]{16,80}$/i.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
const deviceLabel = () => { try { return String(navigator.userAgent || "").replace(/\s+/g, " ").slice(0, 160); } catch { return ""; } };

const CODE = {
  NOT_FOUND: "driver/not-registered", OTHER_COMPANY: "driver/other-company", PHONE_MISMATCH: "driver/phone-mismatch",
  NO_PHONE: "driver/no-phone", DEVICE_MISMATCH: "driver/device-mismatch", BAD_PHONE: "driver/bad-phone", DISABLED: "auth/user-disabled",
};
async function callSignIn(functionsBase, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let r;
  try {
    r = await fetch(`${functionsBase}/driverSignIn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw Object.assign(new Error("network"), { code: "driver/network", cause: e });
  } finally { clearTimeout(timer); }
  if (r.status === 429) throw Object.assign(new Error("too many"), { code: "auth/too-many-requests" });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw Object.assign(new Error("server"), { code: "driver/network" });
  return j;
}

export async function signInDriver(auth, functionsBase, { companyName, carNo, phone }) {
  const deviceId = driverDeviceId();
  if (!deviceId) throw Object.assign(new Error("no storage"), { code: "driver/network" });
  const j = await callSignIn(functionsBase, { companyName: String(companyName || "").trim(), carNo: String(carNo || "").trim(), phone, deviceId, label: deviceLabel() });
  if (!j.ok) throw Object.assign(new Error(j.code || "fail"), { code: CODE[j.code] || "driver/not-registered" });
  const res = await signInWithEmailAndPassword(auth, j.email, j.password);
  return { uid: res.user.uid, email: j.email, device: j.device };
}

// 가입 화면 — 기본 계정(차량번호@)이 이미 있으면 { exists, sameCompany }
export async function legacyOwnerCheck(functionsBase, companyName, carNo) {
  const j = await callSignIn(functionsBase, { mode: "owner", companyName: String(companyName || "").trim(), carNo: String(carNo || "").trim() });
  return { exists: !!j.exists, sameCompany: !!j.sameCompany };
}

// 가입할 때 만드는 계정 비밀번호 — 아무도 모르는 임의 값(로그인은 늘 서버가 새 값을 준다)
export function randomDriverPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
}
