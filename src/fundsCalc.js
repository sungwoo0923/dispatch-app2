// ======================= src/fundsCalc.js =======================
// 💰 자금 계산(2026-10-31) — 자금 현황(FundsBoard)과 수입·지출 장부(OfficeBooks)가 함께 쓴다.
//  · 통장·현금: 잔액 = 기준일(또는 마지막 잔액 맞추기) 잔액 + 그 뒤 장부에서 이 계좌로 지정한 입출금
//  · 카드(법인카드·일반카드)
//      - 체크(통장 연결): 장부에서 이 카드를 고르면 연결한 통장 잔액에서 빠진다(통장이 없으면 카드 자체 잔액에서)
//      - 신용(한도): 이번 달 남은 한도 = 월 한도 − 이번 달 카드 사용액(환불은 더함). 결제일에 통장에서 나가는 돈은 장부에 따로 적는다
//  · 대출: 남은 대출금(잔액 맞추기로 갱신)
import { BANK_NAMES, formatAccount, onlyDigits } from "./bankUtil";

export const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const ymAgo = (n) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };

export const FUND_KINDS = ["보통예금", "정기예금·적금", "현금", "법인카드", "일반카드", "대출"];
export const CARD_COMPANIES = ["신한카드", "삼성카드", "KB국민카드", "현대카드", "롯데카드", "하나카드", "우리카드", "BC카드", "NH농협카드", "IBK기업카드", "씨티카드", "카카오뱅크", "토스뱅크", "기타"];
export const BANK_OPTIONS = BANK_NAMES;
export const isCard = (f) => String(f?.kind || "").includes("카드");
// 예전 "법인카드 한도"는 신용카드로 본다
export const isCredit = (f) => isCard(f) && (f.kind === "법인카드 한도" || f.payType !== "체크");
export const isLinkedCheck = (f, byId) => isCard(f) && f.payType === "체크" && f.linkFundId && byId?.[f.linkFundId];
export const fundBadge = (f) => (f?.kind === "대출" ? "LOAN" : f?.kind === "현금" ? "CASH" : isCard(f) ? "CARD" : "BANK");
// 화면 표시용 번호 — 카드는 0000-0000-0000-0000, 계좌는 은행 형식대로
export const formatCardNo = (v) => onlyDigits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1-");
export const fundNumber = (f) => (!f?.number ? "" : isCard(f) ? formatCardNo(f.number) : formatAccount(f.bank, f.number));
export const last4 = (f) => { const d = onlyDigits(f?.number); return d ? `···${d.slice(-4)}` : ""; };

export function computeFunds(funds = [], ledger = []) {
  const active = funds.filter((f) => f.active !== false);
  const byId = Object.fromEntries(active.map((f) => [f.id, f]));
  const thisM = ymAgo(0);
  // 장부의 fundId → 실제로 돈이 움직이는 곳(통장 연결 체크카드는 연결 통장)
  const target = (id) => { const f = byId[id]; return f && isLinkedCheck(f, byId) ? f.linkFundId : id; };
  const sign = (r) => (r.type === "수입" ? 1 : -1) * toInt(r.amount);
  const cardUse = (f) => { const m = ledger.filter((r) => r.fundId === f.id && String(r.date || "").startsWith(thisM)); return { usedMonth: -m.reduce((s, r) => s + sign(r), 0), usesMonth: m.length }; };
  const baseOf = (f) => { const checks = [...(f.checks || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.at || 0) - (b.at || 0)); return checks.length ? checks[checks.length - 1] : { date: f.openingDate || "", balance: toInt(f.openingBalance), opening: true }; };
  // ⭐ 2026-11-01 기준일 "당일" 입출금도 반영 — 처음 잔액은 그날 시작 잔액, 잔액 맞추기는 맞춘 시각 이후 등록분만
  const tsOf = (r) => (r.createdAt?.toMillis ? r.createdAt.toMillis() : r.createdAt?.seconds ? r.createdAt.seconds * 1000 : Date.now());
  const after = (r, base) => { const d = String(r.date || ""); const b = String(base.date || ""); return d > b || (d === b && (base.opening || tsOf(r) > (base.at || 0))); };
  const out = {};
  // 1) 통장·현금·대출·연결 안 된 체크카드
  active.filter((f) => !isCredit(f) && !isLinkedCheck(f, byId)).forEach((f) => {
    const base = baseOf(f);
    const moves = ledger.filter((r) => r.fundId && target(r.fundId) === f.id && after(r, base));
    const net = moves.reduce((s, r) => s + sign(r), 0);
    out[f.id] = { ...f, base, balance: toInt(base.balance) + (f.kind === "대출" ? 0 : net), moves: moves.length, ...(isCard(f) ? cardUse(f) : {}) };
  });
  // 2) 신용카드 — 이번 달 남은 한도
  active.filter((f) => isCredit(f)).forEach((f) => {
    const u = cardUse(f);
    out[f.id] = { ...f, base: { date: `${thisM}-01`, balance: toInt(f.openingBalance) }, limit: toInt(f.openingBalance), balance: toInt(f.openingBalance) - u.usedMonth, moves: u.usesMonth, ...u };
  });
  // 3) 통장 연결 체크카드 — 연결 통장 잔액을 그대로 보여준다
  active.filter((f) => isLinkedCheck(f, byId)).forEach((f) => {
    const link = out[f.linkFundId];
    out[f.id] = { ...f, base: link?.base || { date: "" }, balance: link?.balance || 0, linkName: link?.name || "", moves: 0, ...cardUse(f) };
  });
  const list = active.map((f) => out[f.id]).filter(Boolean);
  // 보유 자금 = 통장·현금·연결 안 된 체크카드(신용카드 한도·연결 카드·대출 제외 — 중복·빚 제외)
  const inCash = (f) => f.kind !== "대출" && !isCredit(f) && !isLinkedCheck(f, byId);
  const cash = list.filter(inCash).reduce((s, f) => s + f.balance, 0);
  const loan = list.filter((f) => f.kind === "대출").reduce((s, f) => s + f.balance, 0);
  const cardMonth = list.filter(isCard).reduce((s, f) => s + (f.usedMonth || 0), 0);
  const months = [2, 1, 0].map(ymAgo);
  const flow = (m) => ledger.filter((r) => String(r.date || "").startsWith(m)).reduce((a, r) => { const v = toInt(r.amount); if (r.type === "수입") a.in += v; else a.out += v; return a; }, { in: 0, out: 0 });
  const monthly = months.map((m) => ({ m, ...flow(m) }));
  const past = [3, 2, 1].map(ymAgo).map(flow).filter((x) => x.out > 0);
  const avgOut = past.length ? past.reduce((s, x) => s + x.out, 0) / past.length : monthly[2].out;
  const runway = avgOut > 0 ? cash / avgOut : null;
  return { list, byId: out, inCash, cash, loan, cardMonth, monthly, avgOut, runway, thisMonth: monthly[2] };
}
