// ======================= functions/gsheetLegacy.js =======================
// 🧾 2026-11-07 돌캐 배차현황 시트(월별 탭 "26년11월") 고정 설정 — index.js에서 그대로 옮겨 왔다(동작 같음)
//  · 시트 프로필(functions/sheetProfileCore.mjs)이 나오기 전 한 회사 전용으로 만든 연동이라 칸 이름·탭 이름이 정해져 있다.
//  · 화면의 "구글시트 연동" 목록에는 이 설정이 프로필(legacy_dolcae)로 보이고, 가져오기·보내기는 예전 서버 함수(gsheetMine)를 그대로 쓴다.
//  · "이 회사가 만든 오더만" 기준(isProfileOwnOrder)은 모든 시트 프로필이 같이 쓴다.

// 이 시트 전용 동기화 대상 회사명 — 다른 회사 데이터가 섞이지 않도록 반드시 필터링한다.
const GSHEET_TARGET_COMPANY = "돌캐";

// 시트로 보낼 오더인가 — 프로필의 회사가 만든 오더만, 배차표(구글시트 고정노선) · 지입차관리 고정노선 오더는 뺀다.
//  scope = { companyName, defaultCompany, includeFixed }
function isProfileOwnOrder(scope, d) {
  if (!d || !scope || !scope.companyName) return false;
  if ((d.companyName || scope.defaultCompany || "") !== scope.companyName) return false;
  if (!scope.includeFixed && (d.배차표Id || d._autoSheet || d.고정노선Id || d.등록기기 === "배차표")) return false;
  return true;
}
const LEGACY_DOLCAE_SCOPE = Object.freeze({ companyName: GSHEET_TARGET_COMPANY, defaultCompany: GSHEET_TARGET_COMPANY, includeFixed: false });

// ⭐ 2026-11-06 돌캐 시트에는 돌캐 오더만 — "내 오더만 보내기"가 작성자 이메일만 보고 회사를 안 봐서,
//  최고관리자가 다른 운송사(예: 태진)에서 고정노선·배차표 오더를 만들면 그 오더까지 돌캐 시트에 들어갔다.
//  다른 회사 오더 · 배차표(구글시트 고정노선) 오더 · 지입차관리 고정노선 오더는 전송 대상에서 뺀다.
function isGsheetDolcaeOrder(d) {
  return isProfileOwnOrder(LEGACY_DOLCAE_SCOPE, d);
}

// 내부 필드명 → 시트에 실제로 쓰여있을 수 있는 헤더 텍스트 후보(앞에 있는 후보를 우선)
const GSHEET_FIELD_HEADER_CANDIDATES = {
  순번: ["순번"],
  등록일: ["등록일"],
  상차일: ["상차일"],
  상차시간: ["상차시간"],
  하차일: ["하차일"],
  하차시간: ["하차시간"],
  거래처명: ["거래처명"],
  상차지: ["상차지명", "상차지"],
  경유지: ["경유지"],
  상차지주소: ["상차지주소", "상하지주소"],
  하차지: ["하차지명", "하차지"],
  하차지주소: ["하차지주소"],
  화물정보: ["화물내용", "화물정보"],
  차량종류: ["차량종류"],
  차량톤수: ["차량톤수"],
  혼적: ["혼적"],
  차량번호: ["차량번호"],
  기사명: ["이름", "기사명"],
  전화번호: ["전화번호"],
  배차상태: ["배차상태"],
  청구운임: ["청구운임"],
  기사운임: ["기사운임", "기사님요금"],
  수수료: ["수수료"],
  매익율: ["매익율"],
  지급방식: ["지급방식", "선/착불"],
  프로그램: ["배차방식", "프로그램"],
  메모: ["메모"],
  // 시트 행 ↔ 프로그램 오더를 1:1로 잇는 열(숨김)
  오더ID: ["오더ID"],
};

// 백필이 다시 써 주는 머리줄(순서 = 시트 열 순서)
const GSHEET_MONTH_HEADER_COLUMNS = [
  "순번", "등록일", "상차일", "상차시간", "하차일", "하차시간",
  "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소",
  "화물내용", "차량종류", "차량톤수", "혼적", "차량번호",
  "이름", "전화번호", "배차상태", "청구운임", "기사운임",
  "수수료", "지급방식", "배차방식", "메모", "오더ID",
];

// 머리줄 글자 → { 내부 필드명: 열 번호(0부터) } — index.js getGsheetColumnMapFor와 같은 규칙(앞 후보 우선 · 같은 글자는 왼쪽 열)
function legacyColumnIndexMap(headerRow, candidatesMap = GSHEET_FIELD_HEADER_CANDIDATES) {
  const idxByText = {};
  (headerRow || []).forEach((h, i) => { const t = String(h || "").trim(); if (t && !(t in idxByText)) idxByText[t] = i; });
  const map = {};
  for (const [field, candidates] of Object.entries(candidatesMap)) {
    for (const c of candidates) { if (idxByText[c] != null) { map[field] = idxByText[c]; break; } }
  }
  return map;
}

module.exports = {
  GSHEET_TARGET_COMPANY, LEGACY_DOLCAE_SCOPE, isProfileOwnOrder, isGsheetDolcaeOrder,
  GSHEET_FIELD_HEADER_CANDIDATES, GSHEET_MONTH_HEADER_COLUMNS, legacyColumnIndexMap,
};
