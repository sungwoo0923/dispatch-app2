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
export async function signInDriver(auth, db, companyName, carNo) {
  const password = String(carNo || "").trim();
  const co = String(companyName || "").trim();
  let lastErr = null;
  for (const email of [legacyDriverEmail(carNo), scopedDriverEmail(co, carNo)]) {
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", res.user.uid)).catch(() => null);
      const owner = (snap?.exists() ? snap.data().companyName || "" : "").trim();
      if (owner && owner !== co) {
        await signOut(auth).catch(() => {});
        lastErr = Object.assign(new Error("other company"), { code: "driver/other-company" });
        continue;
      }
      return { uid: res.user.uid, email };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("login failed");
}

// 예전 계정이 이미 있을 때 그 계정의 소속 회사 확인(같은 회사면 진짜 중복)
export async function legacyOwnerCompany(auth, db, carNo) {
  try {
    const res = await signInWithEmailAndPassword(auth, legacyDriverEmail(carNo), String(carNo || "").trim());
    const snap = await getDoc(doc(db, "users", res.user.uid)).catch(() => null);
    const owner = (snap?.exists() ? snap.data().companyName || "" : "").trim();
    await signOut(auth).catch(() => {});
    return owner;
  } catch {
    return "";
  }
}
