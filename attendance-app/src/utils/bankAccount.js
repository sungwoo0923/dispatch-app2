// 은행 선택 목록 + 계좌번호 자동 하이픈 포맷터.
//
// KOREAN_BANKS는 <select> 드롭다운에 쓰는 "흔히 쓰는 은행 이름" 목록일 뿐,
// 실명확인/계좌실명조회를 위한 화이트리스트가 아니다. constants/hr.js의
// BANK_OPTIONS(급여은행 select에서 기존에 쓰던 좀 더 상세한 은행명 목록,
// 예: "KB국민은행")와 표기가 다를 수 있다는 점에 유의 — 이 파일은 신규
// BankAccountFields 컴포넌트 전용으로 별도 요청된 목록을 따른다.
export const KOREAN_BANKS = [
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "기업은행",
  "SC제일은행",
  "씨티은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "새마을금고",
  "신협",
  "우체국",
  "수협은행",
  "대구은행",
  "부산은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
];

// 은행별 계좌번호 자릿수 그룹핑(하이픈 위치) 표 — 실제 은행별 체계를 100%
// 그대로 반영한 "공식" 표가 아니라, 흔히 알려진 일반적인 패턴을 참고해 만든
// 근사치다(은행마다, 그리고 같은 은행 안에서도 계좌 종류에 따라 자릿수가
// 다를 수 있다). 목록에 없는 은행이거나 패턴이 다른 계좌라도 등록 자체를
// 막지는 않도록, 아래 DEFAULT_GROUPS(4자리씩 구분)로 대체 처리한다.
const ACCOUNT_FORMATS = {
  국민은행: { groups: [6, 2, 6], max: 14 },
  신한은행: { groups: [3, 3, 6], max: 12 },
  우리은행: { groups: [4, 3, 6], max: 13 },
  하나은행: { groups: [3, 6, 5], max: 14 },
  농협은행: { groups: [3, 4, 4, 2], max: 13 },
  기업은행: { groups: [3, 6, 2, 3], max: 14 },
  SC제일은행: { groups: [3, 3, 6], max: 12 },
  씨티은행: { groups: [6, 6], max: 12 },
  카카오뱅크: { groups: [4, 2, 7], max: 13 },
  케이뱅크: { groups: [3, 2, 6], max: 11 },
  토스뱅크: { groups: [4, 4, 4], max: 12 },
  새마을금고: { groups: [4, 4, 4, 1], max: 13 },
  신협: { groups: [4, 3, 6], max: 13 },
  우체국: { groups: [6, 2, 6], max: 14 },
  수협은행: { groups: [3, 2, 6, 1], max: 12 },
  대구은행: { groups: [3, 6, 5], max: 14 },
  부산은행: { groups: [3, 2, 6, 1], max: 12 },
  경남은행: { groups: [3, 2, 6, 1], max: 12 },
  광주은행: { groups: [3, 6, 5], max: 14 },
  전북은행: { groups: [3, 6, 5], max: 14 },
  제주은행: { groups: [3, 6, 5], max: 14 },
};

// 목록에 없는 은행(또는 은행 미선택) 입력 시 쓰는 기본 그룹핑 — 4자리마다
// 하이픈을 넣고 최대 16자리까지만 받는다.
const DEFAULT_GROUP_SIZE = 4;
const DEFAULT_MAX_DIGITS = 16;

// 참고: 실제 계좌 존재/예금주 일치 여부를 확인하는 계좌실명조회(오픈뱅킹 등)
// API 연동은 별도의 유료 구독 + 여신금융협회/금융결제원 심사(사업자 등록,
// 이용기관 등록 등)가 필요해 이 프로젝트에서는 자격/계약이 없다. 따라서 이
// 파일은 "자릿수가 그 은행의 통상적인 자릿수와 맞는지"만 검사하는 형식
// 검증만 제공하며, 실제 계좌 실재 여부 검증은 범위 밖이다.
export function formatAccountNumber(bankName, rawDigits) {
  const digits = String(rawDigits || "").replace(/\D/g, "");
  const format = ACCOUNT_FORMATS[bankName];

  if (!format) {
    const capped = digits.slice(0, DEFAULT_MAX_DIGITS);
    const chunks = [];
    for (let i = 0; i < capped.length; i += DEFAULT_GROUP_SIZE) {
      chunks.push(capped.slice(i, i + DEFAULT_GROUP_SIZE));
    }
    return chunks.join("-");
  }

  const capped = digits.slice(0, format.max);
  const chunks = [];
  let idx = 0;
  for (const size of format.groups) {
    if (idx >= capped.length) break;
    chunks.push(capped.slice(idx, idx + size));
    idx += size;
  }
  return chunks.join("-");
}

// 은행별 예상 총 자릿수와 현재 입력된 순수 숫자 자릿수가 일치하는지만 보는
// "형식" 검증. 계좌가 실제로 존재하는지는 확인하지 않는다(위 주석 참고).
export function isPlausibleAccountLength(bankName, rawDigits) {
  const digits = String(rawDigits || "").replace(/\D/g, "");
  if (!digits) return true; // 빈 값은 별도 필수값 검사에서 다룬다
  const format = ACCOUNT_FORMATS[bankName];
  const expected = format?.max;
  if (!expected) return true; // 매핑에 없는 은행은 자릿수 강제하지 않음
  return digits.length === expected;
}
