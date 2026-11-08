// ======================= src/acctChart.js =======================
// 📒 2026-11-08 계정과목표(순수 계산 — Firebase 없이 · 단위 테스트용) · 화면 쪽은 src/acctAccounts.js
// 지출결의에서 고를 기본 비용 계정(예전 목록 + 자주 쓰는 계정)
export const EXPENSE_ACCOUNTS = [
  "복리후생비", "여비교통비", "차량유지비", "운반비", "접대비", "소모품비", "통신비", "지급수수료", "교육훈련비", "도서인쇄비",
  "유류비", "세금과공과", "지급임차료", "수도광열비", "수선비", "보험료", "광고선전비", "기타",
];

// 계정과목표 — 일반기업회계기준(K-GAAP) 계정 체계를 운송사에 맞게 줄인 것
//  kind: asset(자산) · liability(부채) · equity(자본) · revenue(수익) · cogs(매출원가) · expense(판매비와관리비) · other(영업외)
//  normal: 잔액이 생기는 쪽(D 차변 · C 대변)
export const CHART = [
  { code: "101", name: "현금", kind: "asset" },
  { code: "103", name: "보통예금", kind: "asset" },
  { code: "108", name: "외상매출금", kind: "asset" },
  { code: "120", name: "미수금", kind: "asset" },
  { code: "131", name: "선급금", kind: "asset" },
  { code: "134", name: "가지급금", kind: "asset" },
  { code: "135", name: "부가세대급금", kind: "asset" },
  { code: "208", name: "차량운반구", kind: "asset" },
  { code: "212", name: "비품", kind: "asset" },
  { code: "251", name: "외상매입금", kind: "liability" },
  { code: "253", name: "미지급금", kind: "liability" },
  { code: "254", name: "예수금", kind: "liability" },
  { code: "255", name: "부가세예수금", kind: "liability" },
  { code: "259", name: "선수금", kind: "liability" },
  { code: "260", name: "단기차입금", kind: "liability" },
  { code: "293", name: "장기차입금", kind: "liability" },
  { code: "331", name: "자본금", kind: "equity" },
  { code: "375", name: "이월이익잉여금", kind: "equity" },
  { code: "404", name: "운송수입", kind: "revenue" },
  { code: "451", name: "운송원가(기사운임)", kind: "cogs" },
  { code: "801", name: "급여·상여", kind: "expense" },
  { code: "806", name: "퇴직급여", kind: "expense" },
  { code: "811", name: "복리후생비", kind: "expense" },
  { code: "812", name: "여비교통비", kind: "expense" },
  { code: "813", name: "접대비", kind: "expense" },
  { code: "814", name: "통신비", kind: "expense" },
  { code: "815", name: "수도광열비", kind: "expense" },
  { code: "817", name: "세금과공과", kind: "expense" },
  { code: "819", name: "지급임차료", kind: "expense" },
  { code: "820", name: "수선비", kind: "expense" },
  { code: "821", name: "보험료", kind: "expense" },
  { code: "822", name: "차량유지비", kind: "expense" },
  { code: "823", name: "유류비", kind: "expense" },
  { code: "824", name: "운반비", kind: "expense" },
  { code: "825", name: "교육훈련비", kind: "expense" },
  { code: "826", name: "도서인쇄비", kind: "expense" },
  { code: "830", name: "소모품비", kind: "expense" },
  { code: "831", name: "지급수수료", kind: "expense" },
  { code: "833", name: "광고선전비", kind: "expense" },
  { code: "848", name: "기타", kind: "expense" },
  { code: "901", name: "이자수익", kind: "other", normal: "C" },
  { code: "930", name: "잡이익", kind: "other", normal: "C" },
  { code: "951", name: "이자비용", kind: "other" },
  { code: "980", name: "잡손실", kind: "other" },
];
export const KIND_LABEL = { asset: "자산", liability: "부채", equity: "자본", revenue: "수익", cogs: "매출원가", expense: "판매비와관리비", other: "영업외손익" };
const BY_NAME = Object.fromEntries(CHART.map((a) => [a.name, a]));
// 이름 → 계정(목록에 없는 이름·회사가 추가한 계정은 판매비와관리비 "9xx"로 본다)
export function accountOf(name) {
  const n = String(name || "").trim();
  const hit = BY_NAME[n] || BY_NAME[{ 사무용품비: "소모품비", 비품구입: "비품", 급여: "급여·상여", 기업업무추진비: "접대비", 임차료: "지급임차료", 이자수입: "이자수익", 기타수입: "잡이익", 보조금: "잡이익", 환급: "잡이익" }[n]];
  if (hit) return hit;
  return { code: "899", name: n || "기타", kind: "expense", custom: true };
}
// 잔액이 쌓이는 쪽 — 자산·비용·원가는 차변, 부채·자본·수익은 대변
export const normalSide = (a) => a.normal || (["asset", "expense", "cogs"].includes(a.kind) ? "D" : a.kind === "other" ? "D" : "C");

