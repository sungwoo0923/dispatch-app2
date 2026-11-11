// src/driver/driverEmail.js
// ⭐ 2026-11-01 기사 로그인 계정 — 예전엔 "차량번호@driver.run25.kr" 하나뿐이라
// 다른 운송사에 같은 차량번호 기사가 이미 있으면 두 번째 기사는 가입이 막혔다.
// 그런 경우에만 회사별 계정(차량번호.회사코드@driver.run25.kr)을 쓴다.
// 기존 기사는 예전 계정 그대로 로그인된다.
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const DOMAIN = "driver.run25.kr";
const plate = (carNo) => String(carNo || "").replace(/ /g, "");
const coHash = (co) => {
  let h = 5381;
  for (const ch of String(co || "").replace(/\s+/g, "")) h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};

export const legacyDriverEmail = (carNo) => `${plate(carNo)}@${DOMAIN}`;
export const scopedDriverEmail = (companyName, carNo) => `${plate(carNo)}.c${coHash(companyName)}@${DOMAIN}`;

// 예전 계정 → 회사별 계정 순서로 로그인. 예전 계정이 다른 회사 기사면 로그아웃하고 회사별 계정 시도.
// 성공: { uid, email } / 실패: 마지막 오류를 던짐
// ⭐ 2026-11-03 가입 화면이 차량번호를 띄어쓰기 없이 저장(비밀번호도 띄어쓰기 없음) — 로그인 때 띄어 써도 되게 둘 다 시도
const driverPasswords = (carNo) => [...new Set([String(carNo || "").trim(), plate(String(carNo || "").trim())])].filter(Boolean);
async function signInAnyPassword(auth, email, carNo) {
  let err = null;
  for (const pw of driverPasswords(carNo)) {
    try { return await signInWithEmailAndPassword(auth, email, pw); } catch (e) { err = e; if (e?.code === "auth/user-not-found" || e?.code === "auth/too-many-requests") break; }
  }
  throw err;
}

export async function signInDriver(auth, db, companyName, carNo) {
  const co = String(companyName || "").trim();
  let lastErr = null;
  let otherCoErr = null;
  const sameCo = (a, b) => String(a || "").replace(/\s+/g, "") === String(b || "").replace(/\s+/g, "");
  for (const email of [legacyDriverEmail(carNo), scopedDriverEmail(co, carNo)]) {
    try {
      const res = await signInAnyPassword(auth, email, carNo);
      const snap = await getDoc(doc(db, "users", res.user.uid)).catch(() => null);
      const owner = (snap?.exists() ? snap.data().companyName || "" : "").trim();
      if (owner && !sameCo(owner, co)) {
        await signOut(auth).catch(() => {});
        otherCoErr = Object.assign(new Error("other company"), { code: "driver/other-company" });
        continue;
      }
      return { uid: res.user.uid, email };
    } catch (e) {
      lastErr = e;
      // ⭐ 2026-11-05 인터넷 끊김·시도 과다는 다음 계정을 시도해도 같다 — 바로 알린다
      if (e?.code === "auth/network-request-failed" || e?.code === "auth/too-many-requests" || e?.code === "auth/user-disabled") break;
    }
  }
  // ⭐ 2026-11-05 예전엔 "다른 회사 계정" 오류가 다음 시도(회사별 계정 없음) 오류에 덮여, 운송사가 다르다는 이유를 알 수 없었다
  if (otherCoErr && !["auth/network-request-failed", "auth/too-many-requests", "auth/user-disabled"].includes(lastErr?.code)) throw otherCoErr;
  throw lastErr || new Error("login failed");
}

// 예전 계정이 이미 있을 때 그 계정의 소속 회사 확인(같은 회사면 진짜 중복)
export async function legacyOwnerCompany(auth, db, carNo) {
  try {
    const res = await signInAnyPassword(auth, legacyDriverEmail(carNo), carNo);
    const snap = await getDoc(doc(db, "users", res.user.uid)).catch(() => null);
    const owner = (snap?.exists() ? snap.data().companyName || "" : "").trim();
    await signOut(auth).catch(() => {});
    return owner;
  } catch {
    return "";
  }
}

// ⭐ 2026-11-11 휴대폰번호 로그인 — 차량이 바뀌어도 기사님은 같은 정보(운송사 · 휴대폰번호 · 이름)로 로그인한다.
//  서버(driverPhoneLogin)가 그 기사의 지금 로그인 계정을 찾아 주고, 화면은 그 계정으로 로그인한다.
export const phoneDigits = (v) => String(v || "").replace(/\D/g, "");
// 입력값이 휴대폰번호인지(한글이 없고 01x로 시작하는 10~11자리) — 아니면 차량번호로 본다
export const isPhoneLoginId = (v) => !/[가-힣A-Za-z]/.test(String(v || "")) && /^01[016789]\d{7,8}$/.test(phoneDigits(v));
// 숫자만 넣다 만 휴대폰번호인지(안내용) — 01로 시작하는 숫자뿐인데 자릿수가 모자라거나 넘침
export const isPartialPhone = (v) => !/[가-힣A-Za-z]/.test(String(v || "")) && /^01\d*$/.test(phoneDigits(v)) && !isPhoneLoginId(v);

// 결과: { ok:true, email, carNo } | { ok:true, pre:true, carNo } | { ok:false, code } | { error: "network" | "rate" | "server" }
export async function resolveDriverPhone(base, { companyName, phone, name }) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(`${base}/driverPhoneLogin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, phone: phoneDigits(phone), name }),
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (!r.ok) return { error: r.status === 429 ? "rate" : "server" };
    return await r.json();
  } catch (cause) {
    return { error: "network", cause };
  }
}

// 서버가 알려준 계정으로 로그인 — 비밀번호는 차량번호(미배정 계정은 메일 앞부분)
export async function signInDriverAccount(auth, email, carNo) {
  const local = String(email || "").split("@")[0];
  if (/^nocar\./i.test(local)) return signInWithEmailAndPassword(auth, email, local.toLowerCase());
  return signInAnyPassword(auth, email, carNo);
}
