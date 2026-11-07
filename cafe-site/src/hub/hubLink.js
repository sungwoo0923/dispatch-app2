// ======================= cafe-site/src/hub/hubLink.js =======================
// ⭐ 2026-11-06 기존 로지스웹 계정으로 허브 로그인(새로 가입하지 않음)
//  · 운송사 직원 — 운송사 로그인(src/TransportLogin.jsx)과 같은 확인: 회사명 · 회사코드 · 승인 · 정지 · 계약종료
//  · 소속 기사   — 기사앱 로그인(src/driver/DriverLogin.jsx · driverEmail.js)과 같은 계정: 회사 + 차량번호 + 이름
//  · 화주사      — 화주 로그인(src/shipper/ShipperLogin.jsx)과 같은 확인: 회사명 · 회사코드
//  확인되면 users/{uid}의 기존 정보로 허브 회원(hubMembers/{uid})을 바로 "승인" 상태로 만든다
//  (서버 규칙 hubLinkOk가 users 문서와 같은지 다시 확인 — 화면 조작으로 다른 회사 이름을 넣을 수 없다).
//  허브에서 정보를 바꾸지 않는다 — 차량·연락처는 로지스웹 프로그램에서 고친다.
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { M } from "./hubApi";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const norm = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
const sameText = (a, b) => norm(a) === norm(b);
const fail = async (msg) => { await signOut(auth).catch(() => {}); throw Object.assign(new Error(msg), { hub: true }); };

// ── 기사 계정 이메일(src/driver/driverEmail.js 와 같은 규칙)
const DOMAIN = "driver.run25.kr";
const plate = (carNo) => String(carNo || "").replace(/ /g, "");
const coHash = (co) => {
  let h = 5381;
  for (const ch of String(co || "").replace(/\s+/g, "")) h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};
const driverEmails = (co, carNo) => [`${plate(carNo)}@${DOMAIN}`, `${plate(carNo)}.c${coHash(co)}@${DOMAIN}`];
const driverPasswords = (carNo) => [...new Set([String(carNo || "").trim(), plate(String(carNo || "").trim())])].filter(Boolean);

export function authErrorText(e) {
  if (e?.hub) return e.message;
  const c = e?.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(c)) return "아이디 또는 비밀번호가 올바르지 않아요.";
  if (c === "auth/too-many-requests") return "로그인 시도가 너무 많아 잠시 잠겼어요. 몇 분 뒤 다시 시도해 주세요.";
  if (c === "auth/network-request-failed") return "인터넷 연결이 불안정해요. 잠시 후 다시 시도해 주세요.";
  if (c === "auth/user-disabled") return "사용이 중지된 계정이에요.";
  if (c === "auth/email-already-in-use") return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (c === "auth/weak-password") return "비밀번호는 6자 이상이어야 해요.";
  return e?.message || "처리 중 오류가 생겼어요.";
}

async function ensureLinkedMember(uid, data) {
  const ref = doc(db, M, uid);
  const s = await getDoc(ref).catch(() => null);
  if (s?.exists()) {
    const m = s.data();
    if (m.status === "suspended") await fail(`허브 이용이 정지된 계정이에요.${m.rejectReason ? ` 사유: ${m.rejectReason}` : ""}`);
    return { id: uid, ...m };
  }
  const rec = { ...data, uid, status: "approved", docsVerified: true, prefs: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), linkedAt: serverTimestamp() };
  await setDoc(ref, rec);
  return { id: uid, ...rec };
}

// 운송사 직원(→ 허브 "운송사")
export async function loginLogiswebStaff({ companyName, companyCode, email, password }) {
  if (!companyName.trim() || !companyCode.trim() || !email.trim() || !password) throw Object.assign(new Error("회사명, 회사코드, 이메일, 비밀번호를 모두 입력해 주세요."), { hub: true });
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const uid = cred.user.uid;
  const us = await getDoc(doc(db, "users", uid)).catch(() => null);
  if (!us?.exists()) await fail("로지스웹에 등록된 계정 정보가 없어요.");
  const u = us.data();
  const OTHER = { shipper: "화주사 탭", driver: "소속 기사 탭", cafeUser: "허브 회원 로그인" };
  if (OTHER[u.role]) await fail(`운송사 직원 계정이 아닙니다. ${OTHER[u.role]}에서 로그인해 주세요.`);
  const isSub = u.role === "totalMaster" && u.subAdmin === true;
  const master = cred.user.email === TOTAL_MASTER_EMAIL;
  if (!master && !isSub && !sameText(u.companyName, companyName)) await fail("회사명이 일치하지 않아요.");
  if (!master && !isSub && u.companyCode && u.companyCode !== companyCode.trim()) await fail("회사코드가 일치하지 않아요.");
  if (u.userStatus === "banned" || u.userStatus === "suspended") await fail("정지된 계정이에요. 관리자에게 문의하세요.");
  if (u.approved === false) await fail("로지스웹 관리자 승인 대기 중인 계정이에요.");
  if (u.employmentStatus === "퇴사") await fail("퇴사 처리된 계정이에요.");
  const plan = await getDoc(doc(db, "companyPlans", String(u.companyName || "돌캐").trim() || "돌캐")).catch(() => null);
  if (u.role !== "totalMaster" && plan?.exists() && plan.data()?.status === "ended") await fail("계약이 종료된 운송사이에요.");
  return ensureLinkedMember(uid, {
    role: "carrier", source: "logisweb-staff", email: cred.user.email || "",
    name: u.name || "", phone: u.phone || "", companyName: u.companyName || "", bizNo: u.bizNo || u.사업자번호 || "",
  });
}

// 소속 기사(→ 허브 "차주")
export async function loginLogiswebDriver({ companyName, carNo, name }) {
  const co = String(companyName || "").trim(), car = String(carNo || "").trim(), nm = String(name || "").trim();
  if (!co || !car || !nm) throw Object.assign(new Error("소속 운송사, 차량번호, 이름을 모두 입력해 주세요."), { hub: true });
  let found = null, lastErr = null;
  for (const email of driverEmails(co, car)) {
    for (const pw of driverPasswords(car)) {
      try {
        const r = await signInWithEmailAndPassword(auth, email, pw);
        const s = await getDoc(doc(db, "users", r.user.uid)).catch(() => null);
        const u = s?.exists() ? s.data() : null;
        if (u && u.companyName && !sameText(u.companyName, co)) { await signOut(auth).catch(() => {}); lastErr = Object.assign(new Error("소속 운송사가 다른 차량번호이에요."), { hub: true }); break; }
        found = { uid: r.user.uid, email, u };
        break;
      } catch (e) { lastErr = e; if (e?.code === "auth/user-not-found" || e?.code === "auth/too-many-requests" || e?.code === "auth/network-request-failed") break; }
    }
    if (found) break;
  }
  if (!found) {
    if (lastErr?.hub) throw lastErr;
    throw Object.assign(new Error("등록된 기사 계정이 없어요. 먼저 로지스웹 기사앱에서 로그인(등록)해 주세요."), { hub: true });
  }
  const u = found.u;
  if (!u || u.role !== "driver") await fail("기사 계정이 아닙니다.");
  if (u.name && !sameText(u.name, nm)) await fail("이름이 등록된 정보와 다릅니다.");
  if (u.employmentStatus === "퇴사" || u.status === "퇴사") await fail("퇴사 처리된 기사 계정이에요.");
  if (u.approved !== true) await fail("소속 운송사의 승인 대기 중이에요.");
  return ensureLinkedMember(found.uid, {
    role: "driver", source: "logisweb-driver", email: found.email,
    name: u.name || nm, phone: u.phone || u.전화번호 || "", companyName: u.companyName || co,
    vehicle: { plate: u.carNo || u.차량번호 || car, type: u.차량종류 || u.vehicleType || "", ton: u.차량톤수 || "", length: u.적재함길이 || "", width: u.적재함폭 || "" },
    regions: u.거주지 ? [u.거주지] : [],
  });
}

// 화주사(→ 허브 "화주")
export async function loginLogiswebShipper({ companyName, companyCode, email, password }) {
  if (!companyName.trim() || !companyCode.trim() || !email.trim() || !password) throw Object.assign(new Error("회사명, 회사코드, 이메일, 비밀번호를 모두 입력해 주세요."), { hub: true });
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const us = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
  if (!us?.exists()) await fail("로지스웹에 등록된 화주 계정이 없어요.");
  const u = us.data();
  if (u.role !== "shipper") await fail("화주사 계정이 아닙니다.");
  if (!sameText(u.companyName, companyName)) await fail("회사명이 일치하지 않아요.");
  if ((u.companyCode || "") !== companyCode.trim()) await fail("회사코드가 일치하지 않아요.");
  if (u.approved === false) await fail("화주사 승인 대기 중이에요.");
  return ensureLinkedMember(cred.user.uid, {
    role: "shipper", source: "logisweb-shipper", email: cred.user.email || "",
    name: u.name || u.managerName || "", phone: u.phone || "", companyName: u.companyName || "", bizNo: u.bizNo || u.사업자번호 || "",
  });
}

// 허브 회원(가입 신청한 계정) 로그인 — 승인 상태는 화면(HubApp)이 보고 안내한다
export async function loginHubMember({ email, password, role }) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const s = await getDoc(doc(db, M, cred.user.uid)).catch(() => null);
  if (!s?.exists()) {
    const us = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
    if (us?.exists()) await fail("로지스웹 계정이에요. [로지스웹 계정으로 로그인]을 눌러 로그인해 주세요.");
    await fail("허브 회원 정보가 없어요. 회원가입을 먼저 해 주세요.");
  }
  const m = s.data();
  if (role && m.role !== role) await fail(`${{ driver: "차주", shipper: "화주", carrier: "운송사" }[m.role] || "다른 유형"} 계정이에요. 위에서 맞는 유형을 골라 주세요.`);
  return { id: s.id, ...m };
}
