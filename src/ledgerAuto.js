// ======================= src/ledgerAuto.js =======================
// 🔗 경리 자동 연동(2026-11-01) — 다른 화면에서 처리한 돈의 흐름을 수입·지출 장부(acctLedger)에 자동으로 남긴다.
//  · 기사 지급: 정산관리 › 지급관리에서 [지급완료] → 지급일별 "기사운임 지급" 지출 한 줄(합계·건수 누적, 되돌리면 빠짐)
//  · 거래처 수금: 회계관리 › 미수금에서 [입금 처리] → 그날 "거래처 수금" 수입 한 줄 (초기화하면 그 거래처 자동 수금 기록 삭제)
//  · 비품 구입: 비품 등록 때 구입가가 있으면 "비품 구입" 지출 한 줄
//  · 퇴직금 지급: 퇴직 정산에서 [지급 완료]면 "퇴직금" 지출 한 줄
//  자금 현황에서 "기본 통장"으로 정한 통장(기사 지급·거래처 입금)이 있으면 그 통장에 자동 연결 → 잔액에 바로 반영.
//  자동 줄은 auto 필드로 구분되며, 장부에서 일반 내역처럼 고칠 수 있다(통장 바꾸기 등).
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, where, addDoc } from "firebase/firestore";
import { auth, DEFAULT_COMPANY } from "./firebase";
import { getTenant } from "./fsTenant";

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const coOf = (company) => String(company || getTenant() || DEFAULT_COMPANY || "").trim();
const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;

// 자금 현황 › 통장 설정의 "기본 통장"(useFor: ["drvpay" | "collect" | "expense"])
export async function defaultFundId(db, company, purpose) {
  try {
    const s = await getDocs(query(collection(db, "acctFunds"), where("companyName", "==", coOf(company))));
    const hit = s.docs.map((d) => ({ id: d.id, ...d.data() })).find((f) => f.active !== false && (f.useFor || []).includes(purpose));
    return hit ? hit.id : "";
  } catch { return ""; } // 자금 열람 권한이 없는 계정(배차 실무자 등)은 통장 없이 기록
}

// 기사 지급(지급일별 합계) — delta: +금액(지급완료) / −금액(지급 취소)
export async function bumpDriverPayout(db, { date, amount, count = 1, company }) {
  const co = coOf(company); const d = String(date || kstDay()).slice(0, 10); const amt = toInt(amount);
  if (!co || !amt) return;
  const ref = doc(db, "acctLedger", `auto_drvpay_${safeId(co)}_${d}`);
  let fresh = false;
  try { fresh = !(await getDoc(ref)).exists(); } catch { fresh = false; }
  const fundId = fresh ? await defaultFundId(db, co, "drvpay") : undefined;
  await setDoc(ref, {
    companyName: co, date: d, type: "지출", account: "운반비", item: "기사운임 지급(정산관리 자동)", method: "계좌이체", vendor: "기사",
    memo: "정산관리 › 지급관리 [지급완료] 합계 — 자동 반영", evidence: "자동", auto: "drvpay",
    amount: increment(amt), count: increment(count), updatedAt: serverTimestamp(),
    ...(fresh ? { fundId: fundId || "", receipt: "", createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" } : {}),
  }, { merge: true });
}

// 거래처 수금 1건
export async function addClientCollection(db, { name, amount, year, company }) {
  const co = coOf(company); const amt = toInt(amount);
  if (!co || !amt) return;
  const fundId = await defaultFundId(db, co, "collect");
  await addDoc(collection(db, "acctLedger"), {
    companyName: co, date: kstDay(), type: "수입", account: "운송수입", item: `거래처 수금 · ${name}`, method: "계좌이체", vendor: name,
    memo: "회계관리 › 미수금 [입금 처리] — 자동 반영", evidence: "자동", receipt: "", fundId, auto: "collect", payName: name, payYear: Number(year) || 0,
    amount: amt, createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "",
  });
}
// 거래처 수금 초기화 → 그 거래처·연도의 자동 수금 줄 삭제
export async function removeClientCollections(db, { name, year, company }) {
  const co = coOf(company);
  try {
    const s = await getDocs(query(collection(db, "acctLedger"), where("companyName", "==", co), where("auto", "==", "collect")));
    await Promise.all(s.docs.filter((d) => d.data().payName === name && Number(d.data().payYear) === Number(year)).map((d) => deleteDoc(d.ref)));
  } catch { /* 권한 없음 등은 무시 */ }
}

// 고정 키로 한 줄(비품 구입·퇴직금 등) — 같은 원본은 한 줄만, amount 0이면 지운다
export async function upsertAutoEntry(db, key, { company, date, type = "지출", account, item, amount, vendor = "", memo = "", auto = "etc", purpose = "expense" }) {
  const co = coOf(company); const amt = toInt(amount);
  const ref = doc(db, "acctLedger", `auto_${safeId(auto)}_${safeId(co)}_${safeId(key)}`);
  if (!amt) { await deleteDoc(ref).catch(() => {}); return; }
  let fresh = false;
  try { fresh = !(await getDoc(ref)).exists(); } catch { fresh = false; }
  const fundId = fresh ? await defaultFundId(db, co, purpose) : undefined;
  await setDoc(ref, {
    companyName: co, date: String(date || kstDay()).slice(0, 10), type, account, item, amount: amt, method: "계좌이체", vendor, memo, evidence: "자동", auto,
    updatedAt: serverTimestamp(),
    ...(fresh ? { fundId: fundId || "", receipt: "", createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" } : {}),
  }, { merge: true });
}
