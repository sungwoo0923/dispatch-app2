// ======================= src/ledgerAuto.js =======================
// 🔗 경리 자동 연동(2026-11-01) — 다른 화면에서 처리한 돈의 흐름을 수입·지출 장부(acctLedger)에 자동으로 남긴다.
//  · 기사 지급: 정산관리 › 지급관리에서 [지급완료] → 지급일별 "기사운임 지급" 지출 한 줄(합계·건수 누적, 되돌리면 빠짐)
//  · 거래처 수금: 회계관리 › 미수금에서 [입금 처리] → 그날 "거래처 수금" 수입 한 줄 (초기화하면 그 거래처 자동 수금 기록 삭제)
//  · 비품 구입: 비품 등록 때 구입가가 있으면 "비품 구입" 지출 한 줄
//  · 퇴직금 지급: 퇴직 정산에서 [지급 완료]면 "퇴직금" 지출 한 줄
//  자금 현황에서 "기본 통장"으로 정한 통장(기사 지급·거래처 입금)이 있으면 그 통장에 자동 연결 → 잔액에 바로 반영.
//  자동 줄은 auto 필드로 구분되며, 장부에서 일반 내역처럼 고칠 수 있다(통장 바꾸기 등).
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, where, addDoc, updateDoc, arrayUnion } from "firebase/firestore";
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

// 💸 2026-11-27 출금 통장 고르기(용차지급관리 · 외부 지급 [지급완료] 확인창)
//  → { readable: 통장 목록을 읽을 수 있는지, funds: 쓸 수 있는 통장(대출 · 신용카드 제외), def: 그 용도의 기본 통장 | null }
export async function payFundInfo(db, company, purpose = "drvpay") {
  try {
    const s = await getDocs(query(collection(db, "acctFunds"), where("companyName", "==", coOf(company))));
    const all = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f.active !== false);
    const funds = all.filter((f) => f.kind !== "대출" && !(String(f.kind || "").includes("카드") && f.payType !== "체크"));
    return { readable: true, funds, def: all.find((f) => (f.useFor || []).includes(purpose)) || null };
  } catch { return { readable: false, funds: [], def: null }; }
}
// 고른 통장을 그 용도의 기본 통장으로(자금관리 › 통장 설정의 '자동 연동 기본 통장'과 같은 칸) — 권한이 없으면 false
export async function setPayFundDefault(db, fundId, purpose = "drvpay") {
  if (!fundId) return false;
  try { await updateDoc(doc(db, "acctFunds", fundId), { useFor: arrayUnion(purpose), updatedAt: serverTimestamp() }); return true; } catch { return false; }
}

// 기사 지급(지급일별 합계) — delta: +금액(지급완료) / −금액(지급 취소)
//  💸 2026-11-27 amount = 실제 이체액(세금계산서 받는 기사는 부가세 포함). supply · vat 를 주면 공급가 · 부가세를 따로 누적한다
//   (이 기능 전에 생긴 그날 줄은 공급가 칸이 없어 나누지 않는다 — 금액은 그대로 쌓인다)
//  fundId: 지급완료 때 고른 출금 통장(없으면 자금관리 기본 통장 · 그것도 없으면 빈칸). 이미 있는 줄이 빈칸이면 이번 통장으로 채운다
//  합계가 0이 되면 줄을 지운다(지급완료 → 지급 취소로 0원 줄이 남던 것)
export async function bumpDriverPayout(db, { date, amount, count = 1, company, fundId: pickFund, supply, vat }) {
  const co = coOf(company); const d = String(date || kstDay()).slice(0, 10); const amt = toInt(amount);
  if (!co || !amt) return;
  const ref = doc(db, "acctLedger", `auto_drvpay_${safeId(co)}_${d}`);
  let fresh = false; let cur = null;
  try { const snap = await getDoc(ref); fresh = !snap.exists(); cur = fresh ? null : snap.data(); } catch { fresh = false; }
  // ⭐ 2026-11-02 점검 — 자동 장부 기능 이전에 지급완료된 오더를 '지급 취소'하면 그날 줄이 없어서
  //  음수 금액 "기사운임 지급" 지출 줄이 새로 생기던 문제: 없는 줄을 빼는 경우(취소)는 기록하지 않는다
  if (fresh && amt < 0) return;
  if (cur && toInt(cur.amount) + amt === 0) { await deleteDoc(ref).catch(() => {}); return; }
  const needFund = fresh || (cur && !cur.fundId);
  const fundId = needFund ? (pickFund || await defaultFundId(db, co, "drvpay")) : undefined;
  const split = supply != null || vat != null;
  const sup = split ? toInt(supply ?? amt - toInt(vat)) : 0; const tax = split ? toInt(vat) : 0;
  // 예전 줄(공급가 칸 없음)은 나누지 않는다 — 여러 건을 한꺼번에 지급할 때 서로 덮어쓰지 않게(금액은 그대로 이체액)
  const splitPatch = !split || (cur && cur.supply == null) ? {} : { supply: increment(sup), vat: increment(tax) };
  await setDoc(ref, {
    companyName: co, date: d, type: "지출", account: "운반비", item: "기사운임 지급(정산관리 자동)", method: "계좌이체", vendor: "기사",
    memo: "정산관리 › 지급관리 [지급완료] 합계: 자동 반영(세금계산서 받는 기사는 부가세 포함 이체액)", evidence: "자동", auto: "drvpay",
    amount: increment(amt), count: increment(count), updatedAt: serverTimestamp(), ...splitPatch,
    ...(fresh ? { fundId: fundId || "", receipt: "", createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" } : (needFund && fundId ? { fundId } : {})),
  }, { merge: true });
}

// 💸 2026-11-25 지급 후 운임 변경 — 오더별 조정 한 줄(누적 조정액, 0이면 지움 · 여러 번 눌러도 같은 값)
//  + 추가 지급 · − 환수(지출을 줄이는 음수 금액) · 💸 2026-11-27 vat: 세금계산서 받는 기사면 조정액의 부가세(이체액 = 조정액 + vat)
export async function setDriverPayAdjust(db, { orderId, amount, date, company, who = "", vat = 0, fundId = "" }) {
  const amt = toInt(amount); const tax = toInt(vat);
  return upsertAutoEntry(db, orderId, {
    company, date, type: "지출", account: "운반비", amount: amt + tax, vendor: who || "기사", auto: "drvpayadj", purpose: "drvpay", fundId,
    ...(tax ? { supply: amt, vat: tax } : {}),
    item: amt >= 0 ? `기사운임 추가 지급(정산관리)${who ? ` · ${who}` : ""}` : `기사운임 환수(정산관리)${who ? ` · ${who}` : ""}`,
    memo: "용차지급관리 › 지급 후 운임 변경 [추가 지급]/[환수 처리]: 오더 한 건의 누적 차액",
  });
}
// 💸 2026-11-25 지입차 일괄 지급명세서 [지급 완료] — 기사님 × 달 한 줄(실지급액 · 0이면 지움)
export async function setFleetStatementPayout(db, { stmtId, amount, date, company, who = "", memo = "" }) {
  return upsertAutoEntry(db, stmtId, {
    company, date, type: "지출", account: "운반비", amount, vendor: who || "지입 기사", auto: "fleetpay", purpose: "drvpay",
    item: `지입 기사 지급(지급명세서)${who ? ` · ${who}` : ""}`, memo: memo || "지입차관리 › 일괄 지급명세서 [지급 완료]: 자동 반영",
  });
}

// 🏗 2026-11-09 지게차 기사 지급(지급일별 합계) — 정산관리 › 지게차 지급 [지급완료]/[지급 취소]
export async function bumpForkliftPayout(db, { date, amount, count = 1, company }) {
  const co = coOf(company); const d = String(date || kstDay()).slice(0, 10); const amt = toInt(amount);
  if (!co || !amt) return;
  const ref = doc(db, "acctLedger", `auto_fkpay_${safeId(co)}_${d}`);
  let fresh = false;
  try { fresh = !(await getDoc(ref)).exists(); } catch { fresh = false; }
  if (fresh && amt < 0) return;
  const fundId = fresh ? await defaultFundId(db, co, "drvpay") : undefined;
  await setDoc(ref, {
    companyName: co, date: d, type: "지출", account: "운반비", item: "지게차비 지급(정산관리 자동)", method: "계좌이체", vendor: "지게차 기사",
    memo: "정산관리 › 지게차 지급 [지급완료] 합계: 자동 반영", evidence: "자동", auto: "fkpay",
    amount: increment(amt), count: increment(count), updatedAt: serverTimestamp(),
    ...(fresh ? { fundId: fundId || "", receipt: "", createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" } : {}),
  }, { merge: true });
}

// 💳 2026-11-25 외부 지급(특수운임 받는사람 "외부" 한 항목) — 정산관리 › 지게차 · 외부 지급 › 외부 지급 [지급완료]/[지급 취소]
//  오더 × 항목 한 줄(auto_extpay_회사_오더ID_항목키 · src/forkliftCore.js extLedgerDocId) — 금액 = 지급액, 0이면 지움(여러 번 눌러도 같은 값)
export async function setExtPayout(db, { orderId, itemKey, amount, date, company, to = "", name = "", fundId = "" }) {
  return upsertAutoEntry(db, `${orderId}_${itemKey}`, {
    company, date, type: "지출", account: "운반비", amount, vendor: to || "외부", auto: "extpay", purpose: "drvpay", fundId,
    item: `외부 지급(정산관리)${to ? ` · ${to}` : ""}${name && name !== to ? ` · ${name}` : ""}`,
    memo: "정산관리 › 지게차 · 외부 지급 › 외부 지급 [지급완료]: 자동 반영",
  });
}
// 💸 2026-11-25 외부 지급 · 지급 후 금액 변경 — 오더 × 항목 조정 한 줄(auto_extpayadj_회사_오더ID_항목키 · src/forkliftCore.js extAdjLedgerDocId)
//  금액 = 누적 조정액(+ 추가 지급 · − 환수: 지출을 줄이는 음수), 0이면 지움(여러 번 눌러도 같은 값) — setDriverPayAdjust 와 같은 방식
export async function setExtPayAdjust(db, { orderId, itemKey, amount, date, company, to = "", name = "", fundId = "" }) {
  const amt = toInt(amount);
  const tail = `${to ? ` · ${to}` : ""}${name && name !== to ? ` · ${name}` : ""}`;
  return upsertAutoEntry(db, `${orderId}_${itemKey}`, {
    company, date, type: "지출", account: "운반비", amount: amt, vendor: to || "외부", auto: "extpayadj", purpose: "drvpay", fundId,
    item: amt >= 0 ? `외부 지급 추가 지급(정산관리)${tail}` : `외부 지급 환수(정산관리)${tail}`,
    memo: "정산관리 › 지게차 · 외부 지급 › 외부 지급 [추가 지급]/[환수 처리]: 항목 한 개의 누적 차액",
  });
}

// 거래처 수금 1건
export async function addClientCollection(db, { name, amount, year, company }) {
  const co = coOf(company); const amt = toInt(amount);
  if (!co || !amt) return;
  const fundId = await defaultFundId(db, co, "collect");
  await addDoc(collection(db, "acctLedger"), {
    companyName: co, date: kstDay(), type: "수입", account: "운송수입", item: `거래처 수금 · ${name}`, method: "계좌이체", vendor: name,
    memo: "회계관리 › 미수금 [입금 처리]: 자동 반영", evidence: "자동", receipt: "", fundId, auto: "collect", payName: name, payYear: Number(year) || 0,
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
export async function upsertAutoEntry(db, key, { company, date, type = "지출", account, item, amount, vendor = "", memo = "", auto = "etc", purpose = "expense", fundId: pickFund = "", supply, vat }) {
  const co = coOf(company); const amt = toInt(amount);
  const ref = doc(db, "acctLedger", `auto_${safeId(auto)}_${safeId(co)}_${safeId(key)}`);
  if (!amt) { await deleteDoc(ref).catch(() => {}); return; }
  let fresh = false; let cur = null;
  try { const snap = await getDoc(ref); fresh = !snap.exists(); cur = fresh ? null : snap.data(); } catch { fresh = false; }
  const needFund = fresh || (cur && !cur.fundId); // 💸 2026-11-27 빈칸 통장은 이번에 고른 통장 · 기본 통장으로 채운다
  const fundId = needFund ? (pickFund || await defaultFundId(db, co, purpose)) : undefined;
  await setDoc(ref, {
    companyName: co, date: String(date || kstDay()).slice(0, 10), type, account, item, amount: amt, method: "계좌이체", vendor, memo, evidence: "자동", auto,
    updatedAt: serverTimestamp(), ...(supply != null ? { supply: toInt(supply), vat: toInt(vat) } : {}),
    ...(fresh ? { fundId: fundId || "", receipt: "", createdAt: serverTimestamp(), createdBy: auth.currentUser?.email || "" } : (needFund && fundId ? { fundId } : {})),
  }, { merge: true });
}
