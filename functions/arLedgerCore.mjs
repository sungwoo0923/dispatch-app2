// ======================= functions/arLedgerCore.mjs =======================
// 🔗 2026-11-25 입금 기록(arPayments) → 자금관리 수입·지출 장부(acctLedger) — 순수 함수(서버 트리거 functions/index.js arPaymentLedger)
//  · 어느 길로 넣은 입금이든(회계관리 [입금 처리] · 거래처정산 미수금관리 입금 · 은행 엑셀 · 은행 자동 매칭 · 입금 확인 확정)
//    arPayments 기록이 생기면 장부에 "거래처 수금" 수입 한 줄, 지우면(되돌리기 · 초기화) 그 줄도 지운다
//  · 입금 한 번이 여러 달에 나눠 들어가도(입금 기록 여러 건) 장부는 입금 한 번 = 한 줄(합계) — 통장 내역 대조(날짜 · 금액)와 맞게
//    묶는 키 = depositKey(새 기록) → 없으면 은행 거래 id(bankTxnId) → 없으면 기록 id
//  · 장부 문서 id = auto_ar_{회사}_{묶는 키} → 같은 입금은 몇 번 불려도 한 줄(ledgerAuto.upsertAutoEntry 와 같은 id 모양)
//  · 입금확인 [입금완료](잡은 콜 오더)는 오더에 남는 기록이라 따로 calldep_{오더 id} 줄을 쓴다(src/CallPay.jsx) — 겹치지 않는다
const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
// 긴 키(은행 거래 id 등)는 잘리면 겹칠 수 있어 짧은 해시로
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const shortKey = (k) => { const s = String(k || ""); return s.length <= 60 ? s : `${s.slice(0, 40)}~${fnv(s)}`; };

export const arDepositKeyOf = (p, id) => String(p?.depositKey || "") || (p?.bankTxnId ? `bank_${p.bankTxnId}` : String(id || ""));
export const arLedgerDocId = (company, key) => `auto_ar_${safeId(company)}_${safeId(shortKey(key))}`;
const SRC_MEMO = {
  acct: "회계관리 › 미수금 [입금 처리]: 자동 반영",
  bank: "은행 입금 자동 매칭 · 입금 확인: 자동 반영",
  excel: "거래처정산 › 미수금관리 입금내역 대조: 자동 반영",
};
// 같은 입금(묶는 키)의 기록들 → 장부 줄(없으면 null = 지운다)
export function arLedgerEntry(list, key, now = Date.now()) {
  const rows = (Array.isArray(list) ? list : [list]).filter((p) => p && Number(p.amount) > 0 && String(p.company || "").trim() && String(p.client || "").trim());
  if (!rows.length || !key) return null;
  const p = rows[0];
  const co = String(p.company).trim(); const client = String(p.client).trim();
  const amount = Math.round(rows.reduce((a, x) => a + (Number(x.amount) || 0), 0));
  if (amount <= 0) return null;
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(p.depositDate || "")) ? String(p.depositDate).slice(0, 10) : kstDay(now);
  const yms = [...new Set(rows.map((x) => String(x.yyyymm || "").slice(0, 7)).filter(Boolean))].sort();
  const mLabel = yms.length ? ` (${yms.map((ym) => `${Number(ym.slice(5))}월`).join("·")}분)` : "";
  return {
    companyName: co, date, type: "수입", account: "운송수입", item: `거래처 수금 · ${client}${mLabel}`,
    method: "계좌이체", vendor: client, memo: SRC_MEMO[p.source] || "거래처정산 › 미수금관리 [입금 처리]: 자동 반영", evidence: "자동",
    auto: "ar", payName: client, payKey: String(key), payYms: yms, paySource: String(p.source || "settle"), amount,
  };
}
