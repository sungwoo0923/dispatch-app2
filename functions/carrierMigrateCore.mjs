// ======================= functions/carrierMigrateCore.mjs =======================
// 🚚 2026-11-12 운송사 일괄 이전 — 새 운송사가 쓰던 구글시트(배차일지 탭 여러 개 + 상하차지 · 기사 정보 탭)를
//  한 번에 읽어서 프로그램 데이터(오더 · 거래처 · 상하차지 · 기사 · 고정노선 후보 · 회사 배차방식 목록)로 바꾼다.
//  화면(src/CarrierMigratePanel.jsx)과 테스트(scripts/carrierMigrate.test.mjs)가 같이 쓴다 — import 없음(브라우저 · Node 공용).
//
//  입력: tabs = [{ title, rows }]  — rows는 맨 윗줄(1행)부터, 병합 칸은 값을 펼친 상태(sheetProfileCore.applyMerges)
//        preset = 회사별 설정(아래 DEFAULT_PRESET 참고 · 화면에서 고칠 수 있음)
//  출력: buildMigration(tabs, preset) → { tabs:[탭 요약], orders, clients, places, drivers, routes, dispatchOptions, payOptions, issues }
//
//  탭 종류(자동 판단)
//   · 오더 탭: 위쪽 몇 줄은 메모(상차지 · 하차지 주소 · 담당자 · 배차 금지 차량), 그 아래 머리줄, 그 아래 한 줄 = 오더 1건
//     머리줄 위(또는 머리줄)에 "매출" · "매입" 묶음 이름이 있고, 묶음 안 = 기본 운임 · 추가 칸들(야상 · 경유 · 추가비용…) · 합계
//   · 상하차지 탭(이름에 "상하차지" · "주소"): 업체명 · 주소 · 연락처 · 담당자 표(여러 묶음이 옆으로 붙어 있어도 됨)
//   · 기사 탭(이름에 "기사"): 구분(분양 · 고정차 · 직영차 · 임대) · 차량번호 · 기사명 · 연락처 표
//   · 건너뛰는 탭: 이름에 "AI" · "추천" · "요약" · "통계" (다른 탭에서 계산한 결과)
//
//  규칙(운송사 JY로지스틱스 시트를 기준으로 정함 · 다른 운송사도 같은 모양이면 그대로 쓴다)
//   · 거래처명: 줄에 "화주" 칸이 있으면 그 값, 없으면 탭별 거래처(기본 = 탭 이름 · 화면에서 고침)
//     "거래처" 칸은 이 회사 시트에서 하차처(받는 곳)라서 하차지명으로 쓴다(도착지 칸은 주소 · 지역)
//   · 운송사 칸 → 배차방식(별칭: 전국특송 → 24시콜 등). 나온 값 전부를 이 회사의 배차방식 목록으로 만든다(고정값 아님)
//   · 기사명 "김수범/미소" → 기사명 김수범 · 소속 미소물류(운송사 칸에 나온 업체 중 "미소"로 시작하는 이름)
//   · 매출 · 매입 추가 칸 → 특수운임(오더.특수운임 · src/forkliftCore.js 규칙). 매출에만 있는 추가금은 청구운임에 두고 메모에 적는다
//   · 날짜는 YYYY-MM-DD · 시간은 HH:MM · 마감월은 YYYY-MM(상차월과 다르면 마감이월)
//   · 빈 줄(날짜만 · 0원 · 마감월만 있는 줄)은 가져오지 않는다

export const DEFAULT_PRESET = {
  dispatchAliases: { 전국특송: "24시콜", 웥콜: "원콜", 월콜: "원콜", "24시": "24시콜", "24": "24시콜", 직사직통: "기사직통", 직통기사: "기사직통", 기사직통: "기사직통" },
  optionMinCount: 3, // 회사 배차방식 목록에는 이만큼 이상 나온 값만(나머지는 오더에만 그대로)
  // 회사 차량 구분(운송사 칸 · 기사 탭 구분 칸에 나오는 값) → 기사관리 등급
  vehicleGrades: { 고정차: "지입", 지입: "지입", 지입차: "지입", 직영차: "직영", 직영: "직영", 임대: "임대", 임대차: "임대", 분양: "분양", 분양차: "분양" },
  defaultPayMethod: "계산서",
  tabClients: {}, // { 탭이름: 거래처명 } — 비우면 탭 이름
  skipTabs: [], // 가져오지 않을 탭
  routeMinCount: 30, // 같은 구간 · 같은 운임이 이만큼 이상이면 고정노선 후보
  extraNames: {}, // { 탭이름: { 열글자: "이름" } } — 머리줄 이름이 없는 추가 칸
  // 🚚 2026-11-12 탭별 규칙(만세보령 등)
  fromAliases: {}, // { 탭이름: { 시트의 출발지: 상차지명 } } — 예) 만세보령 탭의 "보령" → "만세보령"
  etcExtraTabs: [], // 추가비용 칸을 특수운임 "기타"로만 넣는 탭
  // ⚠ 아래 규칙들은 기본이 모두 꺼짐 — 회사별 시작 설정(PRESET_SUGGESTIONS)에서 켠 회사(JY로지스틱스)에만 적용된다
  multiDropStops: false, // 하차지명에 여러 곳("롯데상사,의왕") → 첫 곳 = 하차지 · 나머지 = 하차 경유지
  extrasAsSpecial: false, // 매출에만 있는 추가비용 · 금액이 다른 추가비용도 특수운임으로(청구만 · 회사 부담으로 나눠서)
  placeAliases: {}, // { 탭이름: { 시트의 이름: 통일할 이름 } } — 출발지 · 도착지 · 납품처 이름 통일(예: 에이제이 탭 "베베숲 평택" → "평택초저온")
  extraPlaces: [], // 프로그램에 이미 등록된 상하차지 [{ name, address, phone, person, memo }] — 시트에 주소가 없어도 여기서 찾는다(화면이 넣어 준다)
  unifyNames: false, // 띄어쓰기 · 기호만 다른 이름("평택 초저온" · "평택초저온")을 한 이름으로 — 상하차지 정보에 있는 이름이 먼저, 없으면 가장 많이 쓴 표기
  lookupAliases: {}, // { 탭이름: { 오더에 적힌 이름: 상하차지 정보에 적힌 이름 } } — 이름은 그대로 두고 주소만 그 이름으로 찾는다(예: "에브리데이 여주" → "트레이더스 여주")
  arrivalDateTabs: [], // 날짜 칸이 상차일이 아니라 하차일인 탭 — 당착 = 같은 날 상차 · 야상 = 전날 18시 이후 상차 · 금상차월하차 = 그 전 금요일 상차
  unknownExtraName: "", // 이름을 알 수 없는 추가비용의 이름(예: "기타") — 비우면 "추가비용"
  dropOptions: [], // 회사 배차방식 목록에서 뺄 이름(예: JY는 "직접배차" 대신 "기사직통")
  groupTripsTabs: [], // 같은 날 · 같은 구간 · 같은 운임 · 같은 차량 줄을 한 오더로 묶는 탭(녹수셔틀) — N줄이면 왕복 N회전, 운임은 합계
  feeRowNames: [], // 출발지 · 도착지 · 입고시간 칸에 이 글자가 적힌 줄은 운행이 아니라 따로 받는 돈(예: "유류지원비") — 그 이름의 오더 한 건으로
  fromDate: "", // 이 날짜(YYYY-MM-DD)부터의 줄만 가져온다(비우면 전부)
  tabCargo: {}, // { 탭이름: 화물내용 } — 그 탭의 화물내용을 이 글자로(예: 만세보령 = "쌀")
  weightTonTabs: [], // 중량(kg) 칸을 톤수로 바꿔 차량톤수에 넣는 탭(소계 · 중량 칸 ÷ 1,000)
  nextDayTabs: [], // 입고시간(당착 · 월착) 칸이 비어 있으면 다음 날 도착으로 보는 탭
  defaultVehicleKind: "", // 차종 칸에 차량종류가 없으면(톤수만 적힌 줄) 넣을 차량종류
  forceVehicleKind: "", // 시트에 뭐라고 적혀 있든 차량종류를 이 값으로 — 예: JY "윙바디"(차종 칸에 적힌 말은 톤수만 쓴다)
  // 🧩 2026-11-13 탭별 규칙 — 양식이 탭마다 다른 시트(JY)용. 한 줄을 오더로 만든 뒤 마지막에 적용한다(applyTabRule)
  //  { 탭이름: { client, fromFixed, toNameCol, toAddrCol, cargo:[[칸,단위]], tonCol, vehicleKind, places:{시트이름:[이름,주소]}, viaAlias, splitVia, shortAddrName, feeRow, maxCol } }
  tabRules: {},
  commonOptions: [], // 어느 탭에서나 쓰는 배차방식(탭 전용으로 묶지 않는다)
  placeOverrides: {}, // { "탭이름|약칭": "주소" } · "*|약칭" = 모든 탭 — 시트에 주소가 없는 곳을 화면에서 직접 넣은 값
};

// 처음 이전할 때 쓰는 회사별 시작 설정(화면에서 고칠 수 있고, 고친 설정은 migrationPresets/{회사}에 저장)
export const PRESET_SUGGESTIONS = {
  JY로지스틱스: {
    // 에이제이 탭 매출 H~K · 매입 L~O 사이 칸은 머리줄 이름이 없다(비고의 "대행료/50,000"과 같은 금액)
    //  2026-11-12: I칸(매출 2만원)은 이름을 정하지 않는다 — 입고시간이 야상인 줄이면 "야상", 아니면 "기타"
    extraNames: { 에이제이: { J: "대행료", M: "대행료" } },
    // 에이제이 탭: 상차일자 칸 = 하차일 · 베베숲 평택 = 평택초저온 · 에이제이 후문 = 에이제이 · 기사직통을 배차방식으로(직접배차는 뺌)
    arrivalDateTabs: ["에이제이"],
    placeAliases: { 에이제이: { "베베숲 평택": "평택초저온", 베베숲평택: "평택초저온", "평택 초저온": "평택초저온", "에이제이 후문": "에이제이", "에이제이 정문": "에이제이", "구성리 창고": "구성리창고", 구성리: "구성리창고", 구성창고: "구성리창고",
      그린피엔티: "그린피앤티", "마켓컬리 창원/8층": "마켓컬리 창원", "쿠팡밀크런-안성5센터": "쿠팡 안성5센터", 제이와이로지스: "JY로지스틱스" } },
    // 주소 찾기용 다른 이름 — 상하차지 정보 탭(에이제이주소)에는 이 이름으로 적혀 있다(같은 물류센터)
    lookupAliases: { 에이제이: { 평택초저온: "베베숲 평택", "에브리데이 여주": "트레이더스 여주", "에브리데이 시화": "트레이더스 시화", "트레이더스 평택": "에브리데이평택", "에브리데이 평택": "에브리데이평택", "이마트 평택": "에브리데이평택", 유심물류: "유심물류(전원물류)" } },
    unknownExtraName: "기타",
    unifyNames: true,
    // 녹수셔틀 탭: 한 줄 = 한 번 운행 → 같은 날 같은 구간은 한 오더(왕복 N회전) · 유류지원비 줄 = 유류지원비 오더 · 봉산/덕산/고덕 = 공장 주소
    groupTripsTabs: ["녹수셔틀"],
    feeRowNames: ["유류지원비"],
    placeOverrides: { "녹수셔틀|봉산": "충남 예산군 봉산면 황금뜰로 67 봉산공장", "녹수셔틀|덕산": "충남 예산군 덕산면 남은들로 177 덕산공장", "녹수셔틀|고덕": "충남 예산군 고덕면 삽교평야로 467 고덕공장" },
    dropOptions: ["직접배차"],
    // 만세보령 탭: 출발지 "보령" = 만세보령(거래처도 만세보령) · 입고시간이 비면 내일착
    fromAliases: { 만세보령: { 보령: "만세보령" } },
    nextDayTabs: ["만세보령"],
    // 만세보령: 화물은 전부 쌀 · 소계(중량) kg → 톤수 · 운송사 칸 "분양" = 지입 · 한 번만 나온 운송사도 배차방식 목록에
    tabCargo: { 만세보령: "쌀" },
    weightTonTabs: ["만세보령"],
    multiDropStops: true,
    extrasAsSpecial: true,
    // 프로그램의 배차방식 이름은 "24시" · 분양 = 지입
    //  운송사 칸 "JY" = 제이와이 자차(정선태 기사 등) → 직영차
    dispatchAliases: { 분양: "지입", 전국특송: "24시", "24시콜": "24시", "24": "24시", "24시": "24시", JY: "직영차" },
    vehicleGrades: { 분양: "지입", JY: "직영" },
    optionMinCount: 1,
    // 🛠 2026-11-13 차종 칸에 톤수만 있는 줄은 윙바디(차량종류가 적힌 줄은 그대로 — 예: "11톤장축" → 장축)
    forceVehicleKind: "윙바디", // 2026-11-13 사용자 요청 — JY 시트에서 오는 오더는 일단 전부 윙바디
    // 🧩 2026-11-13 사용자가 탭마다 설명한 규칙
    //  · 대원전선 · 카고LCL 은 아직 가져오지 않는다(확인할 것이 남음)
    //  · 녹수 · 아산 KDF · 보령 KDF · 녹수 내수 · 아산 내수 · 보령 내수 · 녹수셔틀 = 거래처는 모두 "녹수"(탭 이름은 상/하차지)
    skipTabs: ["카고LCL"],
    // 예전에 [제외]로 저장해 둔 탭이라도 아래 탭은 다시 가져온다(사용자가 양식을 설명한 탭)
    includeTabs: ["롯데베르살리스", "보령 KDF", "아산 KDF", "녹수", "녹수 내수", "대원전선"],
    commonOptions: ["기사직통", "화물맨", "24시", "원콜", "개인콜", "지입", "직영차", "고정차", "임대", "고정기사"],
    tabRules: {
      // 상차지 = 롯데베르살리스(탭 위쪽 주소) · 화주 칸 = 하차지명 · 하차지 칸 = 하차지주소 · BOX = 화물내용 · TON = 톤수 · 지역/청구 요율 톤수는 안 씀
      롯데베르살리스: { client: "롯데베르살리스", fromFixed: "롯데베르살리스", toNameCol: "화주", toAddrCol: "하차지", cargo: [["BOX", "박스"]], tonCol: "TON", maxCol: "청구월" },
      "보령 KDF": { client: "녹수", places: { 보령: ["보령공장"], 팬스타: ["팬스타 물류센터"] } },
      "아산 KDF": { client: "녹수", places: { 아산: ["아산공장-KDF"], 대진: ["대진공장-KDF", "충남 아산시 음봉면 연암율금로 176-10"], 팬스타: ["팬스타 물류센터"] } },
      녹수: { client: "녹수", places: { 고덕: ["고덕공장"], 덕산: ["덕산공장", "충남 예산군 덕산면 남은들로 177"], 칼트SKU: ["칼트 SKU"], 칼트비유디: ["칼트 비유디"] } },
      // 출발지 "예산"(7월까지) = "고덕"(8월부터) = 고덕면 · "예산+신암" = 고덕면 상차 → 신암면 경유 · "경유" = 같은 뜻
      //  박스 · 롤 = 화물내용("700박스+24롤") · 차종 = 톤수 · 차량종류는 카고 · 도착지가 주소뿐이면 "구 동 번지"를 하차지명으로 · 유류비 지원금 줄은 그 이름의 오더
      "녹수 내수": { client: "녹수", vehicleKind: "카고", maxCol: "특이사항", cargo: [["박스", "박스"], ["롤", "롤"]], splitVia: true, viaAlias: { 경유: "고덕+신암" }, shortAddrName: true, feeRow: "유류비\\s*지원금", memoDrop: "^(\\S \\S|행선지|녹수 (롤|박스).*운송비)$",
        places: { 예산: ["고덕면", "충남 예산군 고덕면 용고길 189"], 고덕: ["고덕면", "충남 예산군 고덕면 용고길 189"], 사리: ["고덕면", "충남 예산군 고덕면 용고길 189"], 신암: ["신암면", "충남 예산군 신암면 오신로 688"], 덕산: ["덕산공장", "충남 예산군 덕산면 남은들로 177"], 봉산: ["봉산공장", "충남 예산군 봉산면 황금뜰로 67"] } },
      "아산 내수": { client: "녹수", shortAddrName: true },
      "보령 내수": { client: "녹수", shortAddrName: true },
      녹수셔틀: { client: "녹수" },
      // 🧩 2026-11-13 대원전선 — 거래처는 대원전선 · 출발지(자동차전선 · 시판/직판 · 한전/수출 …) = 상차지명(주소는 모두 탭 위쪽의 대원전선 주소)
      //  거래처 칸 = 하차지명 · 도착지 칸 = 하차지주소 · 파렛트 = 화물내용 · 차종 = 톤수 · 야상 = 상차일 상차 → 다음 날 하차 · 오른쪽 단가표는 가져오지 않는다
      //  상차지 담당자 이름 · 전화번호는 코드에 적지 않고, 탭 맨 위 메모("○○ 상차 담당자 / 이름 010-…")에서 읽는다(memoContacts)
      대원전선: { client: "대원전선", toNameCol: "거래처", toAddrCol: "도착지", cargo: [["파렛트", ""]], maxCol: "비고", maxColLast: true, yasangNextDay: true, noRates: true,
        fromAddress: "충남 예산군 고덕면 오추리 134-7",
        fromContactsFromMemo: true },
    },
  },
};

// 회사 이름으로 시작 설정 찾기 — 띄어쓰기 · (주) · 한글 표기("제이와이로지스틱스")가 달라도 같은 회사로 본다
const coKeyOf = (v) => String(v || "").toLowerCase().replace(/\(주\)|㈜|주식회사/g, "").replace(/[^0-9a-z가-힣]/g, "").replace(/제이와이/g, "jy");
export function presetSuggestionFor(company) {
  const k = coKeyOf(company);
  if (!k) return null;
  const hit = Object.keys(PRESET_SUGGESTIONS).find((n) => coKeyOf(n) === k);
  return hit ? PRESET_SUGGESTIONS[hit] : null;
}

// ── 작은 도구 ─────────────────────────────────────────────
const cell = (v) => String(v ?? "").replace(/ /g, " ").trim();
export const nm = (s) => cell(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const pad = (n) => String(n).padStart(2, "0");
export function colLetter(i) { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
export function colIndex(letter) { let n = 0; for (const ch of String(letter).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
const uniq = (a) => [...new Set(a.filter(Boolean))];
export const PLATE_RE = /^[가-힣]{0,3}\d{2,3}[가-힣]\d{4}$/;
export const normPlate = (s) => cell(s).replace(/\s+/g, "").replace(/-/g, "");
const PHONE_RE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
export function fmtPhone(s) {
  const d = cell(s).replace(/\D/g, "");
  if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^02\d{7,8}$/.test(d)) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `02-${d.slice(2, 5)}-${d.slice(5)}`;
  if (/^0\d{9,10}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return cell(s);
}
const PROVINCE = "(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주)";
// 주소: 시·군·구 이름이 있고, 도로명+번호(…로 12 · …길45) 또는 번지(…리 447 · 134-7)가 있어야 함
export const looksAddress = (v) => {
  const s = cell(v).split("\n")[0];
  if (!s || PHONE_RE.test(s) || /[가-힣]{0,3}\d{2,3}[가-힣]\d{4}/.test(s)) return false;
  const area = new RegExp(`^${PROVINCE}|[가-힣]{1,6}(시|군|구)\\s`).test(s);
  const num = /([가-힣0-9]+(로|길))\s*\d+|[가-힣]+(동|리|가)\s*\d+(-\d+)?|\d+(-\d+)?\s*번지/.test(s);
  return area && num;
};
// 지역: "경기도 시흥시 목감동" · "광주광역시 북구" · "대전 학하동" — 번지 없이 행정구역만
export const looksRegion = (v) => {
  const s = cell(v);
  if (!s || s.length > 30 || /\d/.test(s)) return false;
  const toks = s.split(/\s+/);
  const admin = (t) => /^[가-힣]{1,6}(시|군|구|읍|면|동|리|가)$/.test(t);
  if (toks.length === 1) return /^[가-힣]{1,5}(시|군|구)$/.test(toks[0]); // "목포시" · "강남구"
  return (new RegExp(`^${PROVINCE}`).test(toks[0]) && toks.slice(1).every((t) => admin(t) || /^[가-힣]{2,4}$/.test(t))) || (admin(toks[0]) && /(시|군|구)$/.test(toks[0]) && toks.slice(1).every(admin)); // "하남시 감일동"
};

// 날짜 → YYYY-MM-DD ("2026. 7. 1" · "2026-07-01" · "26.7.1" · "7/1"(hint 연도) · 엑셀 일련번호)
export function parseDate(v, hintYear = new Date().getFullYear()) {
  const s = cell(v);
  if (!s) return "";
  const ok = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "");
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})$/);
  if (m) return ok(2000 + +m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[./월]\s*(\d{1,2})\s*일?$/);
  if (m) return ok(hintYear, +m[1], +m[2]);
  if (/^\d{5}$/.test(s) && +s > 40000 && +s < 60000) { const d = new Date(Math.round((+s - 25569) * 86400000)); return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  return "";
}
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// 시간 → HH:MM ("1600" · "16:00" · "8:30" · "9시30분" · "오후 3시") — 아니면 ""
export function parseTime(v) {
  const s = cell(v).replace(/\s+/g, "");
  if (!s) return "";
  let m = s.match(/^(오전|오후)?(\d{1,2})[:시](\d{1,2})?분?$/);
  if (m) { let h = +m[2]; const mi = +(m[3] || 0); if (m[1] === "오후" && h < 12) h += 12; if (m[1] === "오전" && h === 12) h = 0; return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : ""; }
  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${pad(+m[1])}:${m[2]}`;
  return "";
}
// 마감월 → YYYY-MM ("2026년07월" · "26년7월" · "2026-07" · "7월"(hint))
export function parseMonth(v, hintYear) {
  const s = cell(v);
  let m = s.match(/(\d{2,4})\s*[년.\-/]\s*(\d{1,2})\s*월?/);
  if (m) { const y = m[1].length === 2 ? 2000 + +m[1] : +m[1]; return +m[2] >= 1 && +m[2] <= 12 ? `${y}-${pad(+m[2])}` : ""; }
  m = s.match(/^(\d{1,2})\s*월$/);
  if (m && hintYear) return `${hintYear}-${pad(+m[1])}`;
  return "";
}
// 금액 → { n, note } ("151,000" · "3만" · "3.5만" · "-" · "180,000 착불" · "회차진행")
export function parseMoney(v) {
  const s = cell(v);
  if (!s || /^[-–—]$/.test(s)) return { n: 0, note: "" };
  const man = s.match(/^(\d+(?:\.\d+)?)\s*만\s*원?$/);
  if (man) return { n: Math.round(+man[1] * 10000), note: "" };
  const digits = s.match(/-?[\d,]+(\.\d+)?/);
  if (!digits) return { n: 0, note: s };
  const n = Math.round(Number(digits[0].replace(/,/g, "")));
  const rest = s.replace(digits[0], "").replace(/원/g, "").trim();
  return { n: Number.isFinite(n) ? n : 0, note: rest };
}
const isZeroish = (v) => { const s = cell(v); return !s || /^[-–—]$/.test(s) || /^0+$/.test(s.replace(/[,원\s]/g, "")); };
const cleanStatus = (s) => cell(s).replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, "").trim();

// ── 탭 종류 ──────────────────────────────────────────────
const SKIP_TAB_RE = /(AI|추천|요약|통계|대시보드|피벗)/i;
const HEADER_WORDS = ["출발지", "도착지", "운송사", "차량번호", "이름", "기사명", "상차지", "하차지", "연락처", "상차일자", "상차일"];
export function findHeaderRow(rows, maxScan = 15) {
  let best = -1, bestScore = 1;
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const cs = (rows[i] || []).map((c) => nm(c));
    const hit = new Set(HEADER_WORDS.filter((w) => cs.includes(nm(w)))).size;
    if (hit > bestScore) { best = i; bestScore = hit; }
  }
  return best;
}
export function classifyTab(t) {
  const title = cell(t.title);
  if (SKIP_TAB_RE.test(title)) return "skip";
  if (/상하차지|주소록|업체주소|거래처정보/.test(title)) return "places";
  if (/기사/.test(title) && /정보|목록|명단|리스트/.test(title)) return "drivers";
  return findHeaderRow(t.rows || []) >= 0 ? "orders" : "skip";
}

// ── 오더 탭 칸 배치 ───────────────────────────────────────
//  role: date · time(상차시간) · arriveDay(도착일자: 당착/익착 또는 날짜) · arriveTime(입고시간) · from · to · consignee · client
//        vehicle(차종) · cargo(화물 수량 칸들) · memo · status · carrier · plate · name · phone · close(마감월) · cod(착불)
//        region(지역) · ignore · sale/buy(묶음)
const ROLE_SYN = [
  ["date", ["상차일자", "상차일", "날짜", "일자", "배차일"]],
  ["time", ["입차시간", "상차시간"]],
  ["arriveDate", ["입고일자", "하차일", "하차일자"]],
  ["arriveDay", ["도착일자", "도착일"]],
  ["arriveTime", ["입고시간", "하차시간", "도착시간", "입고타입"]],
  ["from", ["출발지", "상차지", "상차지명", "상차처"]],
  ["to", ["도착지", "하차지", "하차지명", "하차처", "납품처"]],
  ["client", ["화주", "화주명", "화주사", "청구처"]],
  ["consignee", ["거래처", "거래처명", "업체", "업체명"]],
  ["vehicle", ["차종", "차량종류", "차량"]],
  ["cargo", ["파렛트", "파렛갯수", "박스", "box", "롤", "톤수", "ton", "중량톤", "중량", "kg", "개수", "소계중량", "제품유형", "품목", "화물", "청구요율톤수"]],
  ["memo", ["비고", "비고1", "비고2", "비고단가표", "특이사항", "메모", "비고특이사항"]],
  ["status", ["배차상태", "상태"]],
  ["carrier", ["운송사", "운송업체", "배차방식"]],
  ["plate", ["차량번호", "차량넘버", "차번"]],
  ["name", ["이름", "기사명", "기사"]],
  ["phone", ["연락처", "전화번호", "기사연락처"]],
  ["close", ["마감월", "청구월", "마감"]],
  ["cod", ["착불입금예정", "착불"]],
  ["region", ["지역"]],
  ["profit", ["이익", "수익", "마진"]],
];
function roleOf(header) {
  const h = nm(header);
  if (!h) return "";
  for (const [role, syn] of ROLE_SYN) if (syn.some((s) => nm(s) === h)) return role;
  // 셀 안에 메모가 섞인 머리줄("아신 신규창고 신봉리447 운송사" · "타일 도착지") → 끝 단어로
  const last = cell(header).split(/\s+/).pop();
  if (last && last !== header) { const r = roleOf(last); if (r) return r; }
  return "";
}

// 매출 · 매입 묶음 찾기 — 머리줄과 그 위 3줄에서 "매출" · "매입"(또는 "매출가" · "매입가")
function findGroups(rows, hi) {
  const hdr = rows[hi] || [];
  const firstCol = (re) => {
    for (const r of [hi - 1, hi - 2, hi - 3, hi]) {
      if (r < 0) continue;
      const cs = rows[r] || [];
      for (let c = 0; c < cs.length; c++) if (re.test(nm(cs[c]))) return c;
    }
    return -1;
  };
  let s = firstCol(/^매출(가|운임|운송료)?$/);
  let b = firstCol(/^매입(가|운임|운송료)?$/);
  if (s < 0 || b < 0 || b <= s) return null;
  // 묶음 끝 = 이익 칸 앞 · 아니면 머리줄에서 매입 다음으로 나오는 다른 칸 앞
  let end = -1;
  for (let c = b + 1; c < Math.max(hdr.length, b + 6); c++) {
    const r = roleOf(hdr[c]);
    if (r && r !== "memo" && r !== "cargo") { end = c - 1; break; }
  }
  if (end < 0) end = b + 3;
  // 매입 묶음 길이는 매출 묶음 길이를 넘지 않게(이익 칸을 못 찾은 경우)
  const lenS = b - s;
  if (end - b + 1 > lenS + 1) end = b + lenS - 1;
  return { sale: [s, b - 1], buy: [b, end] };
}
// 묶음 안의 칸 — base(첫 칸) · extras(사이 칸) · total(합계 칸, 없으면 -1)
function splitGroup(hdr, [a, z], names = {}) {
  const cols = []; for (let c = a; c <= z; c++) cols.push(c);
  let total = -1;
  for (let i = cols.length - 1; i >= 1; i--) if (/합계|소계|총액/.test(cell(hdr[cols[i]]))) { total = cols[i]; break; }
  if (total < 0 && cols.length >= 3) total = cols[cols.length - 1]; // 이름 없는 마지막 칸 = 합계
  // 추가 칸 = 기본 칸과 합계 칸 사이(합계 뒤 칸은 보지 않는다). 이름 없는 칸은 순서대로 추가비용1 · 추가비용2(매출 · 매입 같은 순서끼리 짝)
  let k = 0;
  const extras = cols.filter((c) => c > a && (total < 0 || c < total)).map((c) => {
    if (names[colLetter(c)]) return { col: c, name: names[colLetter(c)] };
    const n = extraName(hdr[c]);
    return { col: c, name: n || `추가비용${++k}` };
  });
  if (k === 1) extras.forEach((e) => { if (e.name === "추가비용1") e.name = "추가비용"; });
  return { base: a, extras, total };
}
function extraName(h) {
  const s = cell(h);
  if (!s || /^(매출|매입)/.test(s) || /운송료|운임/.test(s)) return "";
  if (/^(추가비용|추가비|기타비용|추가|기타)$/.test(s.replace(/\s+/g, ""))) return "추가비용";
  return s.replace(/\s+/g, "");
}
export function detectLayout(rows, hi, opts = {}) {
  const hdr = (rows[hi] || []).map(cell);
  const groups = findGroups(rows, hi);
  const inGroup = (c) => groups && ((c >= groups.sale[0] && c <= groups.sale[1]) || (c >= groups.buy[0] && c <= groups.buy[1]));
  const cols = {}; const cargo = []; const memo = []; const notes = [];
  const width = Math.max(hdr.length, groups ? groups.buy[1] + 1 : 0);
  for (let c = 0; c < width; c++) {
    if (inGroup(c)) continue;
    const forced = opts.columns?.[colLetter(c)];
    const role = forced || roleOf(hdr[c]);
    if (!role || role === "profit" || role === "ignore") continue;
    if (role === "cargo") { cargo.push({ col: c, name: hdr[c] }); continue; }
    if (role === "memo") { memo.push(c); continue; }
    if (cols[role] === undefined) cols[role] = c; else if (role === "consignee" || role === "region") notes.push(c);
  }
  // 이름 없는 칸이 도착지 바로 옆에 있고 값이 업체명이면 = 하차처(만세보령 E칸)
  if (cols.to !== undefined && cols.consignee === undefined && !cell(hdr[cols.to + 1]) && !inGroup(cols.to + 1)) {
    const vals = rows.slice(hi + 1, hi + 60).map((r) => cell(r?.[cols.to + 1])).filter(Boolean);
    if (vals.length >= 5 && vals.filter((v) => /[가-힣A-Za-z]/.test(v) && !PHONE_RE.test(v) && !parseDate(v)).length / vals.length > 0.8) cols.consignee = cols.to + 1;
  }
  const sale = groups ? splitGroup(hdr, groups.sale, opts.extraNames || {}) : null;
  const buy = groups ? splitGroup(hdr, groups.buy, opts.extraNames || {}) : null;
  return { headerRow: hi, header: hdr, cols, cargo, memo, notes, sale, buy };
}

// ── 메모 영역(머리줄 위) → 상차지 · 하차지 · 담당자 · 배차금지 ─────
//  "상차지 고덕공장\n충남 예산군 …\n담당자 010-…" · "하차지 칼트 SKU\n경남 …" · "주소 : 충청남도 …"
//  "예산군 봉산면 황금뜰로 67, 봉산공장" · "보령컨테이너출하담당 010-2248-4691" · "경기91자5882 박종은 배차금지"
export function parseMemoArea(rows, hi) {
  const texts = [];
  const places = []; const contacts = []; const blocked = []; const notes = []; let defaultFrom = null;
  const pairUsed = new Set();
  for (let r = 0; r < hi; r++) {
    const cs = (rows[r] || []).map(cell);
    cs.forEach((s, c) => {
      if (!s) return;
      // 옆 칸 짝: [고덕면][예산군 고덕면 용고길 189] — 짧은 이름 칸 바로 오른쪽(병합으로 같은 값이 이어지면 그다음)이 주소
      if (!looksAddress(s) && s.length <= 12 && !/\n/.test(s) && !PHONE_RE.test(s) && !/^(매출|매입|이익)$/.test(s)) {
        let n = c + 1; while (n < cs.length && cs[n] === s) n++;
        if (looksAddress(cs[n])) { places.push({ role: "", name: s, address: cs[n].split("\n")[0].trim(), phone: "", person: "" }); pairUsed.add(s); pairUsed.add(cs[n]); return; }
      }
      if (!texts.includes(s)) texts.push(s);
    });
  }
  for (let i = texts.length - 1; i >= 0; i--) if (pairUsed.has(texts[i])) texts.splice(i, 1);
  const addrLine = (s) => s.replace(/^(주소|상차지주소|하차지주소)\s*[:：]?\s*/, "").trim();
  for (const t of texts) {
    if (/^[▣■◆]/.test(t)) { notes.push(t.replace(/^[▣■◆]\s*/, "")); continue; }
    if (/^(매출|매입|이익|타일|고무)$/.test(t) || /^\d+$/.test(t)) continue;
    const lines = t.split(/\n|\s\/\s/).map((x) => x.trim()).filter(Boolean);
    const m = lines[0].match(/^(상차지|하차지|상차|하차)\s*[:：]?\s*(.+)$/);
    if (m) {
      const role = m[1].startsWith("상") ? "상차" : "하차";
      const addr = lines.slice(1).find((x) => looksAddress(x)) || "";
      const ph = lines.map((x) => (x.match(PHONE_RE) || [])[0]).find(Boolean) || "";
      const person = (lines.find((x) => PHONE_RE.test(x)) || "").replace(PHONE_RE, "").replace(/담당자|담장자|[:：]/g, "").trim();
      places.push({ role, name: m[2].trim(), address: addrLine(addr), phone: ph ? fmtPhone(ph) : "", person });
      continue;
    }
    if (/(배차\s*금지|배차\s*정지|배차제외)/.test(t)) { blocked.push(t.replace(/\s+/g, " ")); continue; }
    const ph = t.match(PHONE_RE);
    const first = addrLine(lines[0]);
    if (looksAddress(first)) {
      // "주소, 이름" · "주소 이름(공장/센터/창고)" · 이름이 없으면 탭 기본 상차지 주소
      const named = first.match(/^(.*?(?:\d+(?:-\d+)?|번지))\s*[,，]?\s*((?:\(주\)|㈜)?\s*[가-힣A-Za-z()]+(?:공장|센터|창고|물류센터|물류))\s*$/);
      if (named) places.push({ role: "", name: named[2], address: named[1].trim(), phone: "", person: "" });
      else if (!defaultFrom) defaultFrom = { address: first.replace(/\s*\(.*$/, "").trim(), memo: [first.match(/\((.*)\)/)?.[1], ...lines.slice(1)].filter(Boolean).join(" / ") };
      else notes.push(t.replace(/\s+/g, " "));
      if (ph) contacts.push(t.replace(/\s+/g, " "));
      continue;
    }
    if (ph) { contacts.push(t.replace(/\s+/g, " ")); continue; }
    notes.push(t.replace(/\s+/g, " "));
  }
  return { places, contacts, blocked, notes, defaultFrom };
}

// ── 상하차지 탭 → 장소 목록 ────────────────────────────────
//  머리줄(주소 칸이 있는 줄)마다 [이름 칸, 주소 칸, (연락처), (담당자)] 묶음을 옆으로 찾는다.
//  묶음 위 줄에 "만세보령주소" · "에이제이주소"가 있으면 그 묶음의 주인(탭 이름)
export function parsePlaceBook(rows) {
  const out = [];
  const isHdr = (r) => (r || []).filter((c) => /^주소$|도착지\s*주소/.test(cell(c))).length >= 1 && (r || []).some((c) => /명$|^업체$|화주/.test(cell(c)));
  for (let ri = 0; ri < rows.length; ri++) {
    if (!isHdr(rows[ri])) continue;
    const h = rows[ri].map(cell);
    const blocks = [];
    h.forEach((x, c) => {
      if (/주소/.test(x) && c > 0 && /명|업체/.test(h[c - 1])) {
        const b = { name: c - 1, addr: c, phone: -1, person: -1, memo: -1, owner: -1, ownerName: "" };
        for (let k = c + 1; k < Math.min(h.length, c + 4); k++) {
          if (/명|업체|주소/.test(h[k])) break;
          if (/연락처|전화|hp/i.test(h[k]) && b.phone < 0) b.phone = k;
          else if (/담당/.test(h[k]) && b.person < 0) b.person = k;
          else if (/비고|특이/.test(h[k]) && b.memo < 0) b.memo = k;
        }
        if (/화주/.test(h[c - 2] || "")) b.owner = c - 2;
        const above = cell(rows[ri - 1]?.[c - 1]) || cell(rows[ri - 1]?.[c - 2]);
        if (/주소$/.test(above)) b.ownerName = above.replace(/주소$/, "").trim();
        blocks.push(b);
      }
    });
    // 첫 묶음 뒤에 "하차지 명 · 주소"가 또 있으면 같은 줄의 두 번째 묶음(같은 화주)
    let owner = "";
    for (let r = ri + 1; r < rows.length && !isHdr(rows[r]); r++) {
      const cs = (rows[r] || []).map(cell);
      blocks.forEach((b, bi) => {
        if (b.owner >= 0 && cs[b.owner]) owner = cs[b.owner];
        const name = cs[b.name];
        if (!name || /주소$/.test(name)) return;
        const raw = cs[b.addr] || "";
        const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
        const address = lines.find((x) => looksAddress(x) || /\d/.test(x)) || lines[0] || "";
        const restLines = lines.filter((x) => x !== address);
        const phoneTxt = [b.phone >= 0 ? cs[b.phone] : "", ...restLines].join(" ");
        const ph = (phoneTxt.match(PHONE_RE) || [])[0] || "";
        const person = [b.person >= 0 ? cs[b.person] : "", ...restLines.map((x) => x.replace(PHONE_RE, "").trim())].filter(Boolean).join(" ").trim();
        const memo = [b.memo >= 0 ? cs[b.memo] : "", b.phone >= 0 && !PHONE_RE.test(cs[b.phone]) ? cs[b.phone] : ""].filter(Boolean).join(" / ");
        const own = b.ownerName || (bi === 0 || b.owner >= 0 ? owner : owner);
        out.push({ name, address: address.replace(/\s+/g, " "), phone: ph ? fmtPhone(ph) : "", person, memo, owner: own });
        // 칸 안에 "이름 : 주소 / 이름 : 주소"가 여러 개 들어 있는 경우(녹수 하차지)
        [cs[b.phone] || "", raw].forEach((txt) => txt.split(/\s\/\s|\n/).forEach((part) => {
          const m = part.match(/^\s*([가-힣A-Za-z ]{2,20}?)\s*[:：]\s*(.+)$/);
          if (m && looksAddress(m[2])) out.push({ name: m[1].replace(/물류센터$/, "").trim(), address: m[2].trim(), phone: "", person: "", memo: "", owner: own });
        }));
      });
    }
  }
  return out;
}

// ── 기사 탭 → 기사 목록 ─────────────────────────────────────
//  [구분 · 차량 넘버 · 기사명 · 연락처 · 비고 · 배차 순서] 표와 [차량번호 · 기사명 · 연락처] 표가 옆으로 붙어 있다
export function parseDriverBook(rows, preset = DEFAULT_PRESET) {
  const out = [];
  const hi = rows.findIndex((r) => (r || []).some((c) => /차량\s*(넘버|번호)/.test(cell(c))));
  if (hi < 0) return out;
  const h = rows[hi].map(cell);
  const blocks = [];
  h.forEach((x, c) => {
    if (/차량\s*(넘버|번호)/.test(x)) {
      const b = { plate: c, name: -1, phone: -1, grade: -1, memo: -1, order: -1 };
      if (/구분/.test(h[c - 1] || "")) b.grade = c - 1;
      for (let k = c + 1; k < Math.min(h.length, c + 5); k++) {
        if (/차량/.test(h[k])) break;
        if (/기사|이름/.test(h[k]) && b.name < 0) b.name = k;
        else if (/연락처|전화/.test(h[k]) && b.phone < 0) b.phone = k;
        else if (/비고/.test(h[k]) && b.memo < 0) b.memo = k;
        else if (/순서|순위/.test(h[k]) && b.order < 0) b.order = k;
      }
      blocks.push(b);
    }
  });
  // 차량번호 칸 머리 없이 차량번호가 이어지는 셋째 묶음(머리줄 오른쪽 끝) — 값으로 찾기
  const used = new Set(blocks.flatMap((b) => [b.plate, b.name, b.phone, b.grade, b.memo, b.order]));
  const maxW = Math.max(...rows.slice(hi, hi + 50).map((r) => (r || []).length));
  for (let c = 0; c < maxW; c++) {
    if (used.has(c)) continue;
    const vals = rows.slice(hi, hi + 40).map((r) => normPlate(r?.[c] || "").split(/[,\s]/)[0]).filter(Boolean);
    if (vals.length >= 5 && vals.filter((v) => PLATE_RE.test(v)).length / vals.length > 0.8) { blocks.push({ plate: c, name: c + 1, phone: c + 2, grade: -1, memo: -1, order: -1 }); used.add(c); used.add(c + 1); used.add(c + 2); }
  }
  for (let r = hi; r < rows.length; r++) {
    const cs = (rows[r] || []).map(cell);
    blocks.forEach((b) => {
      const raw = cs[b.plate] || "";
      const plates = raw.split(/[\n,\s]+/).map(normPlate).filter((p) => PLATE_RE.test(p));
      if (!plates.length) return;
      const g = b.grade >= 0 ? cs[b.grade] : "";
      plates.forEach((p, i) => out.push({
        plate: p, rawName: (b.name >= 0 ? cs[b.name] : "").split(/\n/)[i] || (b.name >= 0 ? cs[b.name] : ""),
        phone: fmtPhone(((b.phone >= 0 ? cs[b.phone] : "").match(new RegExp(PHONE_RE.source, "g")) || [])[i] || ""),
        vehicleClass: g, grade: preset.vehicleGrades?.[g] || "",
        memo: [b.memo >= 0 ? cs[b.memo] : "", b.order >= 0 ? cs[b.order] : ""].filter(Boolean).join(" / "),
      }));
    });
  }
  return out;
}

// ── 장소 찾기(약칭 → 주소) ─────────────────────────────────
const STRIP_RE = /(국제)?물류센터|센터|공장|창고|본사|사업장|-?kdf|㈜|\(주\)|주식회사/gi;
const core = (s) => nm(cell(s).replace(STRIP_RE, ""));
function matchScore(q, cand) {
  const a = nm(q), b = nm(cand);
  if (!a || !b) return 0;
  if (a === b) return 4;
  const ca = core(q), cb = core(cand);
  if (ca && ca === cb) return 3;
  if (ca.length >= 2 && cb.length >= 2 && (cb.startsWith(ca) || ca.startsWith(cb))) return 2;
  if (a.length >= 2 && b.includes(a)) return 1.5;
  return 0;
}
export function makePlaceResolver(globalBook = []) {
  return (name, local = [], owner = "") => {
    const q = cell(name);
    if (!q) return null;
    let best = null, bestS = 0;
    const consider = (list, bonus) => list.forEach((p) => {
      if (!p.address) return;
      const s = matchScore(q, p.name);
      if (s > 0 && s + bonus > bestS) { best = p; bestS = s + bonus; }
    });
    consider(local, 10); // 이 탭 위쪽 메모에 적힌 곳이 언제나 먼저(녹수 내수 "고덕" = 그 탭의 고덕면 주소, 녹수 탭 고덕공장 아님)
    consider(globalBook.filter((p) => owner && (matchScore(owner, p.owner) >= 2 || matchScore(p.owner, owner) >= 2)), 0.5);
    if (bestS < 2.5) consider(globalBook.filter((p) => matchScore(q, p.name) >= 3), 0); // 전체 목록은 거의 같은 이름일 때만
    return bestS >= 2 ? best : null;
  };
}

// ── 운송사 · 기사 소속 ─────────────────────────────────────
export const normCarrier = (v, preset = DEFAULT_PRESET) => { const s = cell(v).replace(/\s+/g, ""); return preset.dispatchAliases?.[s] || cell(v); };
// "김수범/미소" → { name:"김수범", affiliation:"미소물류" } · "이도원/임화연" → 앞이 업체면 { name:"임화연", affiliation:"이도원" }
export function splitDriverName(raw, carriers = []) {
  const s = cell(raw);
  if (!s.includes("/")) return { name: s, affiliation: "", extra: "" };
  const parts = s.split("/").map((x) => x.trim()).filter(Boolean);
  const findCarrier = (p) => {
    if (p.length < 2) return "";
    const hit = carriers.filter((c) => nm(c) === nm(p) || (nm(c).startsWith(nm(p)) && nm(c).length > nm(p).length));
    return hit[0] || "";
  };
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = findCarrier(parts[i]);
    if (c) { const rest = parts.filter((_, k) => k !== i); return { name: rest[0] || "", affiliation: c, extra: rest.slice(1).join("/") }; }
  }
  return { name: parts[0], affiliation: "", extra: parts.slice(1).join("/") };
}

// 차종 → { 톤수, 종류 } ("5톤" · "2.5톤" · "11톤장축" · "5톤플축카고" · "8톤 / 회차" · "1.4톤")
export function splitVehicle(v) {
  const s = cell(v);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(톤|t|T)/);
  if (!m) return { ton: "", kind: s };
  const kind = s.replace(m[0], "").replace(/^[\s/·,]+|[\s/·,]+$/g, "").trim();
  return { ton: `${m[1]}톤`, kind };
}
const SPECIAL_KIND = (n) => (/야상|야간|심야|주말|휴일|긴급|할증/.test(n) ? "할증" : /경유/.test(n) ? "경유" : /대기/.test(n) ? "대기료" : /수작업|인력/.test(n) ? "수작업" : /통행|톨|주차/.test(n) ? "통행료" : "기타");

// 이름 없는 추가 칸 → 메모에 적힌 말로 이름 붙이기(만세보령 "계근비" · 에이제이 "대행료")
const MEMO_FEE = [[/계근/, "계근비"], [/대행/, "대행료"], [/회차/, "회차비"], [/대기/, "대기료"], [/수작업|인력/, "수작업"], [/경유/, "경유"], [/야상|야간/, "야상"]];
// 매출 추가 칸 ↔ 매입 추가 칸 짝 — 같은 이름끼리 먼저, 남은 칸은 순서대로(대원전선: 매출 "야상" ↔ 매입 "기타비용")
export function pairExtras(L) {
  if (!L.sale || !L.buy) return [];
  const S = L.sale.extras.map((e) => ({ ...e })), B = L.buy.extras.map((e) => ({ ...e }));
  const out = [];
  const generic = (n) => /^추가비용\d*$/.test(n);
  uniq(S.map((e) => e.name)).forEach((n) => {
    if (generic(n)) return;
    const bs = B.filter((e) => e.name === n && !e.used); if (!bs.length) return;
    const ss = S.filter((e) => e.name === n && !e.used);
    ss.forEach((e) => { e.used = true; }); bs.forEach((e) => { e.used = true; });
    out.push({ name: n, sale: ss.map((e) => e.col), buy: bs.map((e) => e.col) });
  });
  const rs = S.filter((e) => !e.used), rb = B.filter((e) => !e.used);
  for (let i = 0; i < Math.max(rs.length, rb.length); i++) {
    const x = rs[i], y = rb[i];
    const name = x && !generic(x.name) ? x.name : y && !generic(y.name) ? y.name : (x || y).name;
    out.push({ name, sale: x ? [x.col] : [], buy: y ? [y.col] : [] });
  }
  return out;
}

// "신봉길101" · "윗공장" → 메모 주소 "충남 아산시 영인면 신봉길 110-3 (윗공장)"와 같은 곳(도로명 · 별칭이 들어 있으면)
const inDefault = (name, d) => { const q = nm(name).replace(/\d+$/, ""); return q.length >= 3 && nm(`${d.address} ${d.memo}`).includes(q); };

// ── 오더 탭 한 줄 → 오더 ────────────────────────────────────
function rowToOrder(r, L, ctx) {
  const g = (c) => (c === undefined || c < 0 ? "" : cell(r[c]));
  const date = parseDate(g(L.cols.date), ctx.year);
  if (!date) return { skip: g(L.cols.date) ? "날짜 아님" : "빈 줄" };
  ctx.year = +date.slice(0, 4);
  if (ctx.preset.fromDate && date < ctx.preset.fromDate) return { skip: "기간 밖" };
  const money = (grp) => {
    if (!grp) return { base: 0, extras: [], total: 0, notes: [] };
    const notes = [];
    const b = parseMoney(g(grp.base)); if (b.note) notes.push(b.note);
    // 💸 2026-11-13 "180,000 착불" — 착불은 기사가 도착지에서 직접 받는 돈이라 거래처 청구(매출)가 아니다. 시트도 그 줄의 합계를 비워 둔다
    //  → 금액은 청구 · 특수운임에 넣지 않고 메모("착불 180,000원")와 지급방식 "착불"로만 남긴다(예전엔 청구에 더해져 시트 합계보다 커졌다)
    const cods = [];
    const extras = grp.extras.map((e) => { const p = parseMoney(g(e.col)); if (/착불/.test(p.note)) { if (p.n) cods.push(p.n); notes.push(`착불 ${p.n ? `${p.n.toLocaleString("ko-KR")}원` : ""}`.trim()); return { name: e.name, n: 0, raw: "" }; } if (p.note && !/^[-–]$/.test(p.note)) notes.push(`${e.name} ${p.note}`); return { name: e.name, n: p.n, raw: g(e.col) }; }).filter((e) => e.n);
    const t = grp.total >= 0 ? parseMoney(g(grp.total)) : { n: 0 };
    const sum = b.n + extras.reduce((a, e) => a + e.n, 0);
    return { base: b.n, extras, total: t.n || sum, notes, hasTotal: grp.total >= 0 && !!t.n };
  };
  const S = money(L.sale), B = money(L.buy);
  const plate = normPlate(g(L.cols.plate));
  const pa = ctx.preset.placeAliases?.[ctx.tab] || {};
  // 이름 통일: ① 정해 둔 이름(placeAliases — 띄어쓰기가 달라도) ② 띄어쓰기 · 기호만 다른 표기는 한 이름으로(ctx.canon)
  const paN = ctx.paNorm || (ctx.paNorm = new Map(Object.entries(pa).map(([k, v]) => [nm(k), v])));
  const alias = (v0) => { const v = cell(v0); if (!v) return v; const a = cell(pa[v] ?? paN.get(nm(v)) ?? v); return ctx.canon?.get(nm(a)) || a; };
  const to = alias(g(L.cols.to)), consignee = alias(g(L.cols.consignee)), from = alias(g(L.cols.from));
  const anything = to || consignee || plate || S.total || B.total || g(L.cols.name);
  if (!anything) return { skip: "빈 줄" };
  const memo = [];
  const tags = [];
  // 거래처 · 상차지 · 하차지
  // 화주 칸 "태성화학/오전9시상차" → 거래처 태성화학 · 메모 오전9시상차
  const clientRaw = cell(g(L.cols.client));
  const client = clientRaw.split("/")[0].trim() || ctx.client;
  if (clientRaw.includes("/")) tags.push(clientRaw.split("/").slice(1).join("/").trim());
  let 상차지명 = cell(ctx.preset.fromAliases?.[ctx.tab]?.[from]) || from, 상차지주소 = "";
  let 하차지명 = to, 하차지주소 = "";
  const fromAddr = looksAddress(from);
  if (fromAddr) { 상차지주소 = from; 상차지명 = ""; }
  let 하차지역 = "";
  if (consignee) { 하차지명 = consignee; if (to && to !== consignee) { if (looksAddress(to)) 하차지주소 = to; else 하차지역 = to; } }
  else if (looksAddress(to)) { 하차지주소 = to; 하차지명 = g(L.cols.region) || ""; }
  else if (looksRegion(to)) { 하차지역 = to; }
  const multi = (s) => /[,，+]/.test(s);
  // 상차지 찾는 순서: ① 이 탭 메모의 이름 붙은 곳 ② 이 탭 메모의 주소 하나(탭의 기본 상차지) ③ 상하차지 탭 · 다른 탭
  const fromName = 상차지명.split(/[,，+]/)[0];
  const memoFrom = ctx.memo.places.filter((p) => p.role !== "하차");
  const localHit = 상차지명 && memoFrom.some((p) => matchScore(fromName, p.name) >= 2);
  const D0 = ctx.memo.defaultFrom;
  const useDefault = !상차지주소 && D0 && !localHit && ((ctx.fewFrom && !memoFrom.some((p) => p.role === "상차")) || !상차지명 || nm(fromName) === ctx.topFrom || matchScore(fromName, ctx.client) >= 2 || inDefault(fromName, D0));
  const fromOv = ctx.override(fromName);
  // 🔎 2026-11-12 주소 찾기 — 그 이름으로 없으면 "주소 찾기용 다른 이름"(preset.lookupAliases)으로 한 번 더
  const la = ctx.preset.lookupAliases?.[ctx.tab] || {};
  const find = (name, list) => ctx.resolve(name, list, ctx.owner) || (la[cell(name)] ? ctx.resolve(la[cell(name)], list, ctx.owner) : null);
  // 출발지가 거래처 자신이 아니고 상하차지 정보에 그 이름의 주소가 따로 있으면, 탭의 기본 상차지보다 그 주소가 먼저다(예: 에이제이 탭의 평택초저온)
  //  (이름이 똑같거나 "주소 찾기용 다른 이름"으로 찾은 곳만 — 비슷한 이름으로 잘못 붙지 않게)
  const ownHit = 상차지명 && !fromOv && nm(fromName) !== nm(ctx.client) ? find(fromName, memoFrom) : null;
  const own = ownHit && (nm(ownHit.name) === nm(fromName) || la[cell(fromName)]) ? ownHit : null;
  const fp = own || (상차지명 && !useDefault && !fromOv ? find(fromName, memoFrom) : null);
  if (fromOv && !상차지주소) 상차지주소 = fromOv;
  else if (fp) { 상차지주소 = 상차지주소 || fp.address; ctx.used.add(fp); }
  else if (useDefault) 상차지주소 = D0.address;
  if (!상차지명) 상차지명 = fp?.name || (상차지주소 ? 상차지주소.split(/\s+/).slice(0, 3).join(" ") : "");
  if (multi(상차지명)) tags.push(`상차 ${상차지명}`);
  const toOv = 하차지명 ? ctx.override(하차지명.split(/[,，+]/)[0]) : "";
  const tp = 하차지명 && !toOv ? find(하차지명.split(/[,，+]/)[0], ctx.memo.places.filter((p) => p.role !== "상차")) : null;
  if (toOv && !하차지주소) 하차지주소 = toOv;
  else if (tp) { 하차지주소 = 하차지주소 || tp.address; ctx.used.add(tp); }
  // 하차지가 이 탭의 거래처 자신(예: 에이제이로 돌아오는 오더)이면 탭 위쪽에 적힌 그 회사 주소
  else if (!하차지주소 && D0 && 하차지명 && (nm(하차지명) === nm(ctx.client) || nm(하차지명) === ctx.topFrom)) 하차지주소 = D0.address;
  // 이름 칸에 주소가 괄호로 같이 적힌 경우 — "비엠솔루션 ( 구미시 화신로4길57 010-4053-6610)" → 이름 비엠솔루션 · 주소 구미시 화신로4길57
  if (!하차지주소 && 하차지명) {
    const pm = 하차지명.match(/^(.{2,}?)\s*\(\s*([^()]*?(?:로|길|동|리)\s*\d[^()]*)\)\s*$/);
    if (pm) { 하차지명 = pm[1].trim(); 하차지주소 = pm[2].split(/\s*\/\s*|\s+0\d{1,2}[-\s]?\d{3,4}/)[0].trim(); }
  }
  if (!하차지주소 && 하차지역) 하차지주소 = 하차지역; // 주소를 못 찾으면 지역이라도(대전 학하동 · 경기도 시흥시 목감동)
  if (!하차지명) 하차지명 = 하차지주소 ? 하차지주소.split(/\s+/).slice(0, 3).join(" ") : "";
  // 🚚 2026-11-12 하차지명에 여러 곳("롯데상사,의왕")이 적혀 있으면 첫 곳 = 하차지, 나머지 = 하차 경유지(주소는 상하차지 정보에서 찾음)
  let 경유하차 = [];
  if (multi(하차지명) && !ctx.preset.multiDropStops) tags.push(`경유 ${하차지명}`); // 다른 회사는 예전 그대로(메모만)
  else if (multi(하차지명)) {
    const parts = 하차지명.split(/[,，+]/).map((x) => x.trim()).filter(Boolean);
    const toPlaces = ctx.memo.places.filter((p) => p.role !== "상차");
    // 도착지 칸도 같은 순서로 여러 지역("화성,의왕")이면 주소를 못 찾은 곳은 그 지역이라도 넣는다 · "창동식/회수 80포" → 이름 창동식 + 메모
    const regions = multi(to) ? to.split(/[,，+]/).map((x) => x.trim()) : [];
    경유하차 = parts.slice(1).map((raw, i) => {
      const [n, ...rest] = raw.split("/").map((x) => x.trim()); if (rest.join("")) tags.push(`${n} ${rest.join("/")}`);
      const o = ctx.override(n); const hit = o ? null : find(n, toPlaces); if (hit) ctx.used.add(hit);
      return { 업체명: n || raw, 주소: o || hit?.address || regions[i + 1] || "", 담당자: "", 담당자번호: "" };
    });
    tags.push(`경유 ${하차지명}`);
    하차지명 = parts[0] || 하차지명;
    if (regions.length && 하차지주소 === 하차지역) 하차지주소 = regions[0] || 하차지주소; // 주소를 못 찾은 첫 하차지 = 첫 지역만
  }
  // 시간 · 하차일
  let 상차시간 = parseTime(g(L.cols.time)), 하차일 = date, 하차시간 = "";
  const ad = g(L.cols.arriveDate); if (ad) { const d = parseDate(ad, ctx.year); if (d) 하차일 = d; }
  for (const v of [g(L.cols.arriveDay), g(L.cols.arriveTime)]) {
    if (!v) continue;
    const t = parseTime(v);
    if (t) { 하차시간 = t; continue; }
    if (/^익착|익일/.test(v)) { 하차일 = addDays(date, 1); tags.push("익착"); }
    else if (/^월착/.test(v)) { const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); 하차일 = addDays(date, ((8 - dow) % 7) || 7); tags.push("월착"); }
    else if (/^당착/.test(v)) { /* 같은 날 */ }
    else if (/야상|야간/.test(v)) tags.push("야상");
    else if (parseDate(v, ctx.year)) 하차일 = parseDate(v, ctx.year);
    else tags.push(v);
  }
  // 🚚 2026-11-12 날짜 칸이 하차일인 탭(preset.arrivalDateTabs · 에이제이): 하차일 = 그 날짜, 상차일을 거꾸로 정한다
  //  · 당착(또는 빈칸) = 같은 날 상차 · 야상 = 전날 오후 6시 이후 상차 · "금상차월하차" = 그 전 금요일 상차 · 월착 = 그 전 금요일 상차
  let 상차일 = date, 상차시간기준 = "";
  if ((ctx.preset.arrivalDateTabs || []).includes(ctx.tab)) {
    const av = [g(L.cols.arriveDay), g(L.cols.arriveTime)].join(" ");
    const noteAll = [...L.memo.map((c) => g(c)), ...L.notes.map((c) => g(c))].join(" ");
    const prevFri = () => { const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); return addDays(date, -(((dow + 2) % 7) || 7)); };
    하차일 = date;
    if (/금\s*상차\s*월\s*하차/.test(noteAll) || /월착/.test(av)) 상차일 = prevFri();
    else if (/야상|야간/.test(av)) { 상차일 = addDays(date, -1); if (!상차시간) { 상차시간 = "18:00"; 상차시간기준 = "이후"; } }
    else 상차일 = date;
  }
  // 입고시간 칸이 있는 탭인데 비어 있으면 다음 날 도착(preset.nextDayTabs)
  if ((ctx.preset.nextDayTabs || []).includes(ctx.tab) && (L.cols.arriveDay >= 0 || L.cols.arriveTime >= 0) && !g(L.cols.arriveDay) && !g(L.cols.arriveTime) && !g(L.cols.arriveDate)) 하차일 = addDays(date, 1);
  // 차량 · 화물
  const veh = splitVehicle(g(L.cols.vehicle));
  if (/회차/.test(veh.kind)) { tags.push("회차"); veh.kind = veh.kind.replace(/회차/g, "").replace(/^[\s/]+|[\s/]+$/g, ""); }
  const cargo = L.cargo.map((c) => { const v = g(c.col); if (!v || isZeroish(v)) return ""; const h = cell(c.name).replace(/\s+/g, ""); return /^\d[\d,.]*$/.test(v) ? `${h} ${v}` : v; }).filter(Boolean);
  // 탭 화물내용(쌀 등) · 중량(kg) → 톤수
  const fixedCargo = cell(ctx.preset.tabCargo?.[ctx.tab]);
  if ((ctx.preset.weightTonTabs || []).includes(ctx.tab) && !veh.ton) {
    const wc = L.cargo.filter((c) => /소계|총중량|중량/.test(cell(c.name))).pop();
    const kg = wc ? parseMoney(g(wc.col)).n : 0;
    if (kg > 0) veh.ton = `${String(Math.round(kg / 10) / 100)}톤`; // 12,000kg → 12톤 · 6,300kg → 6.3톤
  }
  // 메모
  L.memo.forEach((c) => { const v = g(c); if (v) memo.push(v); });
  L.notes.forEach((c) => { const v = g(c); if (v) memo.push(v); });
  // 배차방식(운송사) · 기사
  const carrierRaw = g(L.cols.carrier);
  const carrier = normCarrier(carrierRaw, ctx.preset);
  const grade = ctx.preset.vehicleGrades?.[cell(carrierRaw)] || "";
  const nameSplit = splitDriverName(g(L.cols.name), ctx.carriers);
  if (nameSplit.extra) tags.push(`공동운행 ${nameSplit.extra}`);
  // 상태
  const st = cleanStatus(g(L.cols.status));
  let 배차상태 = /취소/.test(st) ? "배차취소" : /미배차|대기|배차중/.test(st) ? "배차중" : /완료/.test(st) ? "배차완료" : "";
  if (!배차상태) 배차상태 = plate ? "배차완료" : "배차중";
  if (배차상태 === "배차완료" && !plate && !nameSplit.name) 배차상태 = "배차중";
  // 착불
  let 지급방식 = ctx.preset.defaultPayMethod || "";
  const codTxt = [g(L.cols.cod), ...S.notes, ...B.notes].join(" ");
  if (/착불/.test(codTxt)) { 지급방식 = "착불"; const c = g(L.cols.cod); if (c) memo.push(c.replace(/[\u{1F300}-\u{1FAFF}☀-➿️🔺]/gu, "").trim()); }
  // 💸 착불 줄인데 시트의 매출 합계 칸이 비어 있으면 청구 0(시트 그대로) — 운송료 칸의 금액은 단가 표시라 메모로만 남긴다
  if (지급방식 === "착불" && L.sale && L.sale.total >= 0 && !S.hasTotal && S.total) { memo.push(`운송료 ${S.total.toLocaleString("ko-KR")}원(착불 · 청구 안 함)`); S.total = 0; S.base = 0; S.extras = []; }
  [...S.notes, ...B.notes].forEach((n) => { if (!n) return; if (/착불/.test(n)) { if (/\d/.test(n) && !memo.includes(n)) memo.push(n); } else tags.push(n); });
  // 특수운임 — 매출 추가 칸과 매입 추가 칸을 짝지어(같은 이름끼리, 남은 칸은 순서대로 · pairExtras)
  const noteText = [...L.memo.map((c) => g(c)), ...L.notes.map((c) => g(c))].join(" ");
  const memoText = [noteText, ...tags].join(" ");
  const items = [];
  (L.pairs || (L.pairs = pairExtras(L))).forEach((p) => {
    const amt = (c) => { const m = parseMoney(g(c)); return /착불/.test(m.note) ? 0 : m.n; }; // 착불 금액은 특수운임(청구)에 넣지 않는다
    const a = p.sale.reduce((s0, c) => s0 + amt(c), 0);
    const b = p.buy.reduce((s0, c) => s0 + amt(c), 0);
    let n = p.name;
    // 이름 없는 추가비용 → 비고에 적힌 말로(계근비 · 대행료 · 경유 …). 비고에 없으면 오더 꼬리표(경유 등), 그래도 없으면 "추가비용"
    // (같은 줄에서 이름 있는 칸이 이미 쓴 이름 — 예: 대행료 칸에 금액이 있으면 — 은 다시 쓰지 않는다)
    const taken = new Set(L.pairs.filter((q) => q !== p && !/^추가비용\d*$/.test(q.name) && (q.sale.some((c) => parseMoney(g(c)).n) || q.buy.some((c) => parseMoney(g(c)).n))).map((q) => q.name));
    if (/^추가비용\d*$/.test(n)) { const free = MEMO_FEE.filter(([, nm2]) => !taken.has(nm2)); const hit = free.find(([re]) => re.test(noteText)) || free.find(([re]) => re.test(memoText)); n = hit ? hit[1] : (cell(ctx.preset.unknownExtraName) || "추가비용"); }
    const kind = (ctx.preset.etcExtraTabs || []).includes(ctx.tab) ? "기타" : SPECIAL_KIND(n);
    const won = (x) => x.toLocaleString("ko-KR");
    // 🧾 2026-11-12 매출(거래처 청구) · 매입(기사 지급) 추가비용을 그대로 특수운임으로
    //  · 둘 다 있으면: 겹치는 금액 = 기사에게 주고 거래처에 청구 · 매출이 더 크면 남는 금액 = 청구만(지급 없음) · 매입이 더 크면 남는 금액 = 회사 부담
    //  · 매출만: 청구만(지급 없음) · 매입만: 기사에게 주고 회사 부담
    if (!ctx.preset.extrasAsSpecial) {
      // 예전 그대로: 매입 추가비용이 있을 때만 특수운임, 매출에만 있으면 메모
      if (b > 0) items.push({ 종류: kind, 이름: n, 금액: b, 받는사람: "기사", 부담: a > 0 ? "청구" : "회사", 메모: a > 0 && a !== b ? `구글시트 이전 · 청구 ${won(a)}` : "구글시트 이전" });
      else if (a > 0) tags.push(`${n} +${won(a)}(청구)`);
      else if (b < 0 || a < 0) tags.push(`${n} ${won(a || b)}`);
      return;
    }
    const both = Math.min(Math.max(a, 0), Math.max(b, 0));
    if (both > 0) items.push({ 종류: kind, 이름: n, 금액: both, 받는사람: "기사", 부담: "청구", 메모: "구글시트 이전" });
    if (a > both) items.push({ 종류: kind, 이름: n, 금액: a - both, 받는사람: "없음", 부담: "청구", 메모: both ? `구글시트 이전 · 청구 ${won(a)} 중 기사 지급 ${won(both)}` : "구글시트 이전 · 청구만" });
    if (b > both) items.push({ 종류: kind, 이름: n, 금액: b - both, 받는사람: "기사", 부담: "회사", 메모: both ? `구글시트 이전 · 기사 지급 ${won(b)} 중 청구 ${won(both)}` : "구글시트 이전 · 회사 부담" });
    if (b < 0 || a < 0) tags.push(`${n} ${won(a < 0 ? a : b)}`);
  });
  if (items.some((it) => /야상/.test(it.이름)) || tags.some((t) => /^야상 [+-]/.test(t))) { const i = tags.indexOf("야상"); if (i >= 0) tags.splice(i, 1); }
  let D = 0, C = 0;
  items.forEach((it) => { if (it.받는사람 !== "없음") D -= it.금액; if (it.부담 === "청구") C += it.금액; });
  // 마감월
  const closeRaw = g(L.cols.close);
  const 마감월 = parseMonth(closeRaw, ctx.year);
  const rec = {
    상차일, 상차시간, 하차일, 하차시간, 등록일: 상차일,
    거래처명: client, 상차지명, 상차지주소, 하차지명, 하차지주소,
    화물내용: fixedCargo || cargo.join(" · "), 차량톤수: veh.ton, 차량종류: ctx.preset.forceVehicleKind || veh.kind || ctx.preset.defaultVehicleKind || "",
    차량번호: plate, 이름: nameSplit.name, 전화번호: fmtPhone(g(L.cols.phone)),
    청구운임: String(S.total), 기사운임: String(B.total), 수수료: String(S.total - B.total),
    지급방식, 배차방식: carrier, 배차상태,
    메모: uniq([...tags, ...memo]).join(" · "),
  };
  if (상차시간기준) rec.상차시간기준 = 상차시간기준;
  if (경유하차.length) { rec.경유하차목록 = 경유하차; rec.경유지_하차 = 경유하차; }
  if (items.length) Object.assign(rec, { 특수운임: items, 특수기사차감: D, 특수청구추가: C, 외부지급합: 0 });
  if (마감월) { rec.마감월 = 마감월; if (마감월 !== date.slice(0, 7)) rec.마감이월 = true; } // 날짜 칸의 달과 다르면 이월
  if (nameSplit.affiliation) rec.기사소속 = nameSplit.affiliation;
  if (grade) rec.차량구분 = cell(carrierRaw);
  return { rec, driver: plate ? { plate, name: nameSplit.name, phone: rec.전화번호, affiliation: nameSplit.affiliation, grade, vehicleClass: grade ? cell(carrierRaw) : "" } : null, checkSale: S.hasTotal ? S.total : null };
}

// ── 🧩 탭별 규칙(preset.tabRules) — 한 줄을 오더로 만든 뒤 그 탭의 양식에 맞게 고친다 ─────────────────
// 주소뿐인 도착지의 짧은 이름: "서울특별시 은평구 녹번동 197" → "은평구 녹번동 197" · "경기도 하남시 감일동 361-7" → "하남시 감일동 361-7"
const SIDO_RE = /^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)\s+/;
export function shortAddressName(addr) {
  const a = cell(addr).replace(/\s+/g, " ").replace(/번지$/, "");
  if (!/\d/.test(a)) return "";
  const cut = a.replace(SIDO_RE, "");
  return (cut.split(" ").length >= 2 ? cut : a).slice(0, 40);
}
export function applyTabRule(rec, r, L, rule, ctx) {
  if (!rule) return rec;
  const col = (name) => (name ? L.header.findIndex((h) => nm(h) === nm(name)) : -1);
  const g = (name) => { const c = col(name); return c < 0 ? "" : cell(r[c]); };
  const memo = String(rec.메모 || "").split(" · ").filter(Boolean);
  if (rule.client) rec.거래처명 = rule.client;
  // 유류비 지원금처럼 운행이 아닌 줄 → 그 이름의 오더 한 건
  if (rule.feeRow) {
    const re = new RegExp(rule.feeRow); const hit = [rec.하차지명, rec.상차지명, ...memo].find((v) => re.test(String(v || "")));
    if (hit) { const n = (String(hit).match(re) || [""])[0].replace(/\s+/g, " "); Object.assign(rec, { 상차지명: n, 하차지명: n, 상차지주소: "", 하차지주소: "", 화물내용: cell(hit), 차량종류: "", 차량톤수: "" }); return rec; }
  }
  // 상차지 고정(탭 위쪽 주소) — 상차지 칸에 다른 주소가 적힌 줄(회차 등)은 그 주소를 그대로
  if (rule.fromFixed) {
    const base = cell(ctx.memo?.defaultFrom?.address);
    const cur = cell(rec.상차지주소);
    if (!cur || !base || nm(cur) === nm(base)) { rec.상차지명 = rule.fromFixed; rec.상차지주소 = cur || base; }
    else rec.상차지명 = shortAddressName(cur) || rec.상차지명;
  }
  // 상차지 주소 통일(이름은 시트의 출발지 그대로) + 상차지 담당자
  if (rule.fromAddress && rec.상차지명 && !looksAddress(rec.상차지명) && !looksRegion(rec.상차지명)) rec.상차지주소 = rule.fromAddress; // 출발지에 다른 지역 · 주소가 적힌 줄은 그대로
  if (rule.fromContactsFromMemo && ctx.fromContacts) { const c = ctx.fromContacts[nm(rec.상차지명)]; if (c) { rec.상차지담당자 = c[0]; rec.상차지담당자번호 = c[1]; } }
  // 야상 = 상차일에 상차 → 다음 날 하차(당착 = 같은 날)
  if (rule.yasangNextDay && /야상|야간/.test(g("입고시간")) && rec.하차일 === rec.상차일) rec.하차일 = addDays(rec.상차일, 1);
  // 하차지명 = 이름 칸(비면 빈칸) · 하차지주소 = 주소 칸
  if (rule.toNameCol) {
    rec.하차지명 = g(rule.toNameCol); if (rule.toAddrCol) rec.하차지주소 = g(rule.toAddrCol);
    // 회차(하차지 칸이 탭의 기본 상차지 주소) → 하차지 = 그 상차지, 화주 칸에 적힌 말은 메모로
    const base = cell(ctx.memo?.defaultFrom?.address);
    if (rule.fromFixed && base && nm(rec.하차지주소) === nm(base)) { if (rec.하차지명) memo.push(rec.하차지명); rec.하차지명 = rule.fromFixed; }
  }
  if (rule.memoDrop) { const re = new RegExp(rule.memoDrop); for (let i = memo.length - 1; i >= 0; i -= 1) if (re.test(memo[i])) memo.splice(i, 1); }
  // 화물내용: 박스 · 롤 → "700박스+24롤"
  if (rule.cargo) rec.화물내용 = rule.cargo.map(([c, unit]) => { const v = g(c).replace(/,/g, ""); return v && !isZeroish(v) ? (/^[\d.]+$/.test(v) ? `${Number(v).toLocaleString("ko-KR")}${unit}` : v) : ""; }).filter(Boolean).join("+");
  if (rule.tonCol) { const v = g(rule.tonCol).replace(/,/g, ""); rec.차량톤수 = v && !isZeroish(v) ? (/^[\d.]+$/.test(v) ? `${v}톤` : v) : ""; }
  if (rule.vehicleKind) rec.차량종류 = rule.vehicleKind;
  // 이름 정리 + 경유("예산+신암" → 상차지 고덕면 · 상차 경유지 신암면)
  const P = rule.places || {};
  const fix = (name, addr) => { const h = P[cell(name)] || P[cell(name).replace(/\s+/g, "")]; return h ? { n: h[0], a: h[1] || addr } : { n: name, a: addr }; };
  let from = cell(rule.viaAlias?.[cell(rec.상차지명)] || rec.상차지명);
  if (rule.splitVia && /[+,，]/.test(from)) {
    const parts = from.split(/[+,，]/).map((x) => x.trim()).filter(Boolean);
    const first = fix(parts[0], ""); rec.상차지명 = first.n; rec.상차지주소 = first.a || (parts[0] === rec.상차지명 ? rec.상차지주소 : "");
    const via = parts.slice(1).map((x) => { const f = fix(x, ""); return { 업체명: f.n, 주소: f.a || "", 담당자: "", 담당자번호: "" }; });
    if (via.length) { rec.경유상차목록 = via; rec.경유지_상차 = via; }
    const i = memo.findIndex((m) => /^상차 /.test(m)); if (i >= 0) memo.splice(i, 1);
    memo.unshift(`경유 ${[rec.상차지명, ...via.map((v) => v.업체명)].join(" → ")}`);
  } else { const f = fix(from, rec.상차지주소); rec.상차지명 = f.n; rec.상차지주소 = f.a; }
  { const f = fix(rec.하차지명, rec.하차지주소); rec.하차지명 = f.n; rec.하차지주소 = f.a; }
  // 도착지가 주소뿐인 줄: 하차지명 = "구 동 번지"(짧게) · 하차지주소 = 전체 주소
  if (rule.shortAddrName && /\d/.test(rec.하차지주소 || "") && looksAddress(rec.하차지주소) && (!rec.하차지명 || nm(rec.하차지주소).startsWith(nm(rec.하차지명)) || looksAddress(rec.하차지명))) rec.하차지명 = shortAddressName(rec.하차지주소) || rec.하차지명;
  rec.메모 = uniq(memo).join(" · ");
  return rec;
}
// 탭 맨 위 메모에서 상차지 담당자 읽기 — "자동차전선 상차 담당자 ⏎ 홍길동기사 010-1234-5678" · "한전/수출 상차 담당자 ⏎ 김철수 기사님 : 010-…"
//  → { 자동차전선: [이름, 전화], "한전/수출": […], 한전: […], 수출: […] } (키는 nm() 으로 맞춘다)
export function memoContacts(rows, headerRow) {
  const out = {};
  (rows || []).slice(0, Math.max(0, headerRow)).forEach((r) => (r || []).forEach((c) => {
    const m = cell(c).replace(/\s+/g, " ").match(/^(.+?)\s*상차\s*담당자\s*[:：]?\s*(.+?)\s*(?:기사님|기사|님)?\s*[:：]?\s*(01\d[-\s]?\d{3,4}[-\s]?\d{4})/);
    if (!m) return;
    const v = [m[2].trim(), fmtPhone(m[3])];
    [m[1], ...m[1].split("/")].map((k) => nm(k)).filter(Boolean).forEach((k) => { out[k] = v; });
  }));
  return out;
}
// 탭 오른쪽에 붙은 표(단가표 등)가 메모로 섞이지 않게 — rule.maxCol 칸까지만 오더로 읽는다
function trimTabRows(t, rule) {
  if (!rule?.maxCol) return t;
  const hi = findHeaderRow(t.rows); const H = t.rows[hi] || [];
  const c = rule.maxColLast ? H.reduce((a, h, i) => (nm(h) === nm(rule.maxCol) ? i : a), -1) : H.findIndex((h) => nm(h) === nm(rule.maxCol)); // maxColLast: 같은 이름 칸이 여러 개면 맨 오른쪽 것까지
  return c < 0 ? t : { ...t, rows: t.rows.map((r) => (r || []).slice(0, c + 1)) };
}

// ── 전체 ────────────────────────────────────────────────
export function buildMigration(tabsIn, presetIn = {}) {
  const fullTabs = tabsIn;
  const tabs = tabsIn.map((t) => trimTabRows(t, presetIn.tabRules?.[t.title]));
  const preset = { ...DEFAULT_PRESET, ...presetIn, dispatchAliases: { ...DEFAULT_PRESET.dispatchAliases, ...(presetIn.dispatchAliases || {}) }, vehicleGrades: { ...DEFAULT_PRESET.vehicleGrades, ...(presetIn.vehicleGrades || {}) } };
  const kinds = tabs.map((t) => (preset.skipTabs?.includes(t.title) ? "skip" : classifyTab(t)));
  // 1) 상하차지 · 기사 탭
  const book = [];
  const driverBook = [];
  tabs.forEach((t, i) => { if (kinds[i] === "places") book.push(...parsePlaceBook(t.rows)); if (kinds[i] === "drivers") driverBook.push(...parseDriverBook(t.rows, preset)); });
  // 2) 오더 탭 칸 배치 · 메모 · 운송사 목록(소속 판단용)
  const layouts = tabs.map((t, i) => {
    if (kinds[i] !== "orders") return null;
    const hi = findHeaderRow(t.rows);
    const L = detectLayout(t.rows, hi, { extraNames: preset.extraNames?.[t.title] || {}, columns: preset.columns?.[t.title] || {} });
    const memo = parseMemoArea(t.rows, hi);
    // 메모 영역의 장소는 전체 목록에도 넣는다(다른 탭이 같은 이름을 쓸 때)
    memo.places.forEach((p) => book.push({ ...p, owner: preset.tabClients?.[t.title] || t.title, memo: "" }));
    return { L, memo };
  });
  const carrierCount = new Map();
  tabs.forEach((t, i) => {
    const x = layouts[i]; if (!x || x.L.cols.carrier === undefined) return;
    t.rows.slice(x.L.headerRow + 1).forEach((r) => { const v = normCarrier(r?.[x.L.cols.carrier], preset); if (v && !preset.vehicleGrades[cell(r?.[x.L.cols.carrier])]) carrierCount.set(v, (carrierCount.get(v) || 0) + 1); });
  });
  const carriers = [...carrierCount.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).filter((v) => !/^\d|^[가-힣]{0,3}\d{2,3}[가-힣]\d{4}$/.test(v));
  // 🏢 2026-11-12 프로그램에 이미 등록된 상하차지도 주소 찾기에 쓴다(시트의 상하차지 정보가 먼저)
  const known = (preset.extraPlaces || []).filter((p) => p && cell(p.name) && cell(p.address)).map((p) => ({ name: cell(p.name), address: cell(p.address), phone: cell(p.phone), person: cell(p.person), memo: "", owner: "", registered: true }));
  const bookN = new Set(book.map((p) => nm(p.name)));
  const lookBook = [...book, ...known.filter((p) => !bookN.has(nm(p.name)))];
  const resolve = makePlaceResolver(lookBook);
  // 3) 오더
  const orders = []; const tabSummary = []; const issues = [];
  const driverMap = new Map();
  const addDriver = (d, src) => {
    if (!d?.plate || !PLATE_RE.test(d.plate)) return;
    const cur = driverMap.get(d.plate) || { 차량번호: d.plate, 이름: "", 전화번호: "", 소속: "", 등급: "", 차량구분: "", 메모: [], 건수: 0, 출처: new Set() };
    if (d.name && !cur.이름) cur.이름 = d.name;
    if (d.phone && !cur.전화번호) cur.전화번호 = d.phone;
    if (d.affiliation && !cur.소속) cur.소속 = d.affiliation;
    if (d.grade && !cur.등급) { cur.등급 = d.grade; cur.차량구분 = d.vehicleClass || ""; }
    if (d.memo) cur.메모.push(d.memo);
    if (src === "order") cur.건수 += 1;
    cur.출처.add(src);
    driverMap.set(d.plate, cur);
  };
  tabs.forEach((t, i) => {
    const kind = kinds[i];
    if (kind !== "orders") { tabSummary.push({ title: t.title, kind, rows: (t.rows || []).length }); return; }
    const { L, memo } = layouts[i];
    const client = cell(preset.tabClients?.[t.title]) || t.title;
    // 출발지 값이 몇 개 안 되면(사업부 이름 등) 메모의 주소 하나가 이 탭의 상차지
    const fromList = t.rows.slice(L.headerRow + 1).map((r) => nm(r?.[L.cols.from])).filter(Boolean);
    const fromVals = new Set(fromList);
    const fc = new Map(); fromList.forEach((v) => fc.set(v, (fc.get(v) || 0) + 1));
    const [topV, topN] = [...fc.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
    // 화면에서 직접 넣은 주소(preset.placeOverrides["탭|이름"]) — 시트 어디에도 주소가 없는 약칭(녹수 내수 "예산" 등)
    const ov = preset.placeOverrides || {};
    const override = (name) => cell(ov[`${t.title}|${cell(name)}`] || ov[`*|${cell(name)}`] || "");
    // 🔤 2026-11-12 이름 통일표(preset.unifyNames) — 이 탭의 출발지 · 도착지 · 납품처에서 띄어쓰기 · 기호만 다른 표기를 한 이름으로
    let canon = null;
    if (preset.unifyNames) {
      const pa0 = preset.placeAliases?.[t.title] || {}; const paN0 = new Map(Object.entries(pa0).map(([k, v]) => [nm(k), v]));
      const seen = new Map(); // nm → Map(표기 → 횟수)
      t.rows.slice(L.headerRow + 1).forEach((r) => [L.cols.from, L.cols.to, L.cols.consignee].forEach((c) => {
        if (c === undefined || c < 0) return;
        const raw = cell(r?.[c]); if (!raw || /[,，+]/.test(raw)) return;
        const v = cell(pa0[raw] ?? paN0.get(nm(raw)) ?? raw); const k = nm(v); if (!k) return;
        if (!seen.has(k)) seen.set(k, new Map()); const m = seen.get(k); m.set(v, (m.get(v) || 0) + 1);
      }));
      const bookName = new Map(lookBook.map((p) => [nm(p.name), cell(p.name)]));
      canon = new Map();
      seen.forEach((m, k) => { const best = bookName.get(k) && m.size > 1 ? ([...m.keys()].find((x) => x === bookName.get(k)) || [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]) : [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; if (m.size > 1) canon.set(k, best); });
    }
    const fromContacts = preset.tabRules?.[t.title]?.fromContactsFromMemo ? memoContacts(fullTabs[i].rows, L.headerRow) : null;
    const ctx = { fromContacts, canon, year: preset.year || new Date().getFullYear(), client, owner: client, memo, resolve, preset, carriers, used: new Set(), override, tab: t.title, fewFrom: fromVals.size > 0 && fromVals.size <= 4, topFrom: topN / Math.max(1, fromList.length) >= 0.8 ? topV : "" };
    let made = 0; const skipped = {}; let mismatch = 0; const unresolved = new Map();
    t.rows.slice(L.headerRow + 1).forEach((r, k) => {
      const out = rowToOrder(r || [], L, ctx);
      if (out.skip) { skipped[out.skip] = (skipped[out.skip] || 0) + 1; return; }
      applyTabRule(out.rec, r || [], L, preset.tabRules?.[t.title], ctx);
      const rowNo = L.headerRow + 2 + k;
      out.rec.이전출처 = `${t.title}!${rowNo}`;
      out.rec.담당노선구분 = t.title; // 🗂 2026-11-13 시트 탭 = 담당노선구분(src/routeGroups.jsx)
      out.rec.__tab = t.title; out.rec.__row = rowNo;
      orders.push(out.rec); made += 1;
      if (out.driver) addDriver(out.driver, "order");
      if (!out.rec.상차지주소 && out.rec.상차지명) unresolved.set(`상:${out.rec.상차지명}`, (unresolved.get(`상:${out.rec.상차지명}`) || 0) + 1);
      if (!out.rec.하차지주소 && out.rec.하차지명) unresolved.set(`하:${out.rec.하차지명}`, (unresolved.get(`하:${out.rec.하차지명}`) || 0) + 1);
      if (out.checkSale != null && +out.rec.청구운임 !== out.checkSale) mismatch += 1;
    });
    tabSummary.push({
      title: t.title, kind, client, headerRow: L.headerRow + 1, orders: made, skipped,
      columns: describeLayout(L), memo: { places: memo.places, contacts: memo.contacts, blocked: memo.blocked, notes: memo.notes, defaultFrom: memo.defaultFrom },
      unresolved: [...unresolved.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ role: k[0] === "상" ? "상차" : "하차", name: k.slice(2), n })),
      mismatch,
    });
    if (!L.sale) issues.push(`${t.title}: 매출 · 매입 칸을 찾지 못했어요(운임 없이 가져옴)`);
  });
  // 3-1) 🔤 같은 이름인데 어떤 줄은 주소를 찾고 어떤 줄은 못 찾은 경우(예: 한 줄에만 괄호로 주소가 적힌 "비엠솔루션") — 찾은 주소를 같은 이름 줄에 채운다
  if (preset.unifyNames) {
    const full = (a) => /\d/.test(String(a || ""));
    const addrOf = new Map();
    orders.forEach((o) => { if (full(o.상차지주소) && o.상차지명) addrOf.set(nm(o.상차지명), o.상차지주소); if (full(o.하차지주소) && o.하차지명) addrOf.set(nm(o.하차지명), o.하차지주소); });
    orders.forEach((o) => { if (!full(o.상차지주소) && addrOf.has(nm(o.상차지명))) o.상차지주소 = addrOf.get(nm(o.상차지명)); if (!full(o.하차지주소) && addrOf.has(nm(o.하차지명))) o.하차지주소 = addrOf.get(nm(o.하차지명)); });
    tabSummary.forEach((ts) => { if (Array.isArray(ts.unresolved)) ts.unresolved = ts.unresolved.filter((u) => !addrOf.has(nm(u.name))); });
  }
  // 3-2) 🚚 2026-11-12 회전 운행 묶기(preset.groupTripsTabs · 녹수셔틀) — 시트는 한 줄이 한 번 운행이라, 같은 날 같은 구간을 한 오더(왕복 N회전)로
  //   · 묶는 기준: 상차일 · 상차지 · 하차지 · 한 번 운임(청구 · 기사) · 차량번호 · 메모가 모두 같은 줄
  //   · 운임은 합계(청구 = 한 번 운임 × N, 기사도 같게) · 메모 맨 앞에 "N회전 왕복 오더 입니다"(프로그램의 회전 표시와 같은 문구)
  //   · 입고시간 칸에 "4회전"처럼 적힌 줄은 그 줄 하나가 이미 N회전 합계 — 운임은 그대로 두고 회전수만 넣는다
  //   · 유류지원비 줄(preset.feeRowNames)은 묶지 않고 그 이름의 오더 한 건으로(화물내용 = 그 이름)
  (preset.groupTripsTabs || []).forEach((title) => {
    const fee = (o) => (preset.feeRowNames || []).find((n) => [o.상차지명, o.하차지명, o.메모].some((v) => String(v || "").includes(n)));
    const mine = orders.filter((o) => o.__tab === title); if (!mine.length) return;
    const groups = new Map(); const out = [];
    mine.forEach((o) => {
      const f = fee(o);
      if (f) { out.push({ ...o, 상차지명: f, 하차지명: f, 상차지주소: "", 하차지주소: "", 화물내용: f, 메모: uniq(String(o.메모 || "").split(" · ").filter((x) => x && x !== f)).join(" · ") }); return; }
      const m = String(o.메모 || "").match(/(\d+)\s*회전/);
      if (m) { const n = +m[1]; out.push({ ...o, 운행유형: "왕복", 회전수: n, 회전방식: "묶기", 메모: [`${n}회전 왕복 오더 입니다`, String(o.메모).replace(/\s*·?\s*\d+\s*회전/, "").replace(/^\s*·\s*/, "").trim()].filter(Boolean).join(" ") }); return; }
      const k = [o.상차일, o.상차지명, o.하차지명, o.청구운임, o.기사운임, o.차량번호, o.메모, o.배차방식].join("|");
      if (!groups.has(k)) { const g = { first: o, n: 0 }; groups.set(k, g); out.push(g); }
      groups.get(k).n += 1;
    });
    const merged = out.map((x) => {
      if (!x.first) return x;
      const o = x.first, n = x.n;
      if (n <= 1) return o;
      const sale = +o.청구운임 * n, buy = +o.기사운임 * n;
      return { ...o, 운행유형: "왕복", 회전수: n, 회전방식: "묶기", 청구운임: String(sale), 기사운임: String(buy), 수수료: String(sale - buy), 메모: [`${n}회전 왕복 오더 입니다`, o.메모].filter(Boolean).join(" "), 이전줄수: n };
    });
    const rest = orders.filter((o) => o.__tab !== title);
    orders.length = 0; orders.push(...rest, ...merged);
    const ts = tabSummary.find((x) => x.title === title); if (ts) { ts.rowsRead = ts.orders; ts.orders = merged.length; }
  });
  // 4) 기사(오더 + 기사 탭)
  driverBook.forEach((d) => { const sp = splitDriverName(d.rawName, carriers); addDriver({ plate: d.plate, name: sp.name, phone: d.phone, affiliation: sp.affiliation, grade: d.grade, vehicleClass: d.vehicleClass, memo: [d.vehicleClass && `구분 ${d.vehicleClass}`, d.memo].filter(Boolean).join(" / ") }, "book"); });
  const drivers = [...driverMap.values()].map((d) => ({ ...d, 등급: d.등급 || "일반", 메모: uniq([d.소속 && `소속 ${d.소속}`, ...d.메모]).join(" / "), 출처: [...d.출처] }));
  // 5) 거래처
  const clientMap = new Map();
  orders.forEach((o) => { if (!o.거래처명) return; const c = clientMap.get(o.거래처명) || { 거래처명: o.거래처명, 건수: 0, 탭: new Set() }; c.건수 += 1; c.탭.add(o.__tab); clientMap.set(o.거래처명, c); });
  const clients = [...clientMap.values()].map((c) => {
    const memos = tabSummary.filter((s) => c.탭.has(s.title) && s.client === c.거래처명).flatMap((s) => [...s.memo.contacts, ...s.memo.blocked.map((b) => `⚠ ${b}`)]);
    return { 거래처명: c.거래처명, 건수: c.건수, 탭: [...c.탭], 메모: uniq(memos).join("\n") };
  });
  // 6) 상하차지(주소가 있는 곳만 · 이름 기준 하나)
  const placeMap = new Map();
  const addPlace = (name, address, extra = {}) => {
    const n = cell(name); if (!n || !address) return;
    const k = nm(n); const cur = placeMap.get(k) || { 업체명: n, 주소: address, 담당자: "", 담당자번호: "", 메모: "" };
    if (!cur.담당자 && extra.person) cur.담당자 = extra.person;
    if (!cur.담당자번호 && extra.phone) cur.담당자번호 = extra.phone;
    if (!cur.메모 && extra.memo) cur.메모 = extra.memo;
    placeMap.set(k, cur);
  };
  book.forEach((p) => addPlace(p.name, p.address, p)); // (이미 등록된 곳 known은 넣지 않는다 — 새로 만들 목록이므로)
  Object.entries(preset.placeOverrides || {}).forEach(([k, a]) => { const n = k.split("|").slice(1).join("|"); if (n && cell(a)) addPlace(n, cell(a), { memo: "직접 입력한 주소" }); });
  // 오더에서 나온 곳은 이름이 업체명일 때만(지역 · 주소를 이름으로 쓴 줄은 장소로 만들지 않는다)
  const goodName = (n, a) => n && a && nm(n) !== nm(a) && !looksAddress(n) && !looksRegion(n) && !nm(a).startsWith(nm(n)) && looksAddress(a);
  orders.forEach((o) => { if (goodName(o.상차지명, o.상차지주소)) addPlace(o.상차지명, o.상차지주소, { person: o.상차지담당자, phone: o.상차지담당자번호 }); if (goodName(o.하차지명, o.하차지주소)) addPlace(o.하차지명, o.하차지주소); });
  const places = [...placeMap.values()];
  // 7) 고정노선 후보 — 같은 거래처 · 상차지 · 하차지 · 청구/기사 운임이 반복되는 구간
  const routes = findRouteCandidates(orders, preset);
  // 8) 회사 배차방식 · 지급방식 목록(이 회사 시트에 나온 값 · 많이 쓴 순)
  const dc = new Map(); orders.forEach((o) => { if (o.배차방식) dc.set(o.배차방식, (dc.get(o.배차방식) || 0) + 1); });
  const dispatchOptions = [...dc.entries()].sort((a, b) => b[1] - a[1]).filter(([v]) => !(preset.dropOptions || []).includes(v)).map(([v, n]) => ({ value: v, n, use: n >= (preset.optionMinCount || 1) && !(preset.optionMinCount <= 1 && PLATE_RE.test(normPlate(v))) })); // 운송사 칸에 잘못 적힌 차량번호는 목록에 넣지 않는다
  // 8-1) 🧩 탭 전용 배차방식 — 그 탭에서만 쓰는 운송사(오창길 · 이도원…)는 그 탭의 상차지 · 거래처 오더에서만 보이게(공통은 어디서나)
  //   dispatchScopes = { 배차방식: [상차지명 · 거래처명…] } — 여기에 없는 배차방식은 공통
  const dispatchScopes = {};
  {
    const common = new Set(preset.commonOptions || []);
    const byTab = new Map(); // 탭 → { n, from: Map, client: Map, opts: Map }
    orders.forEach((o) => { const t = byTab.get(o.__tab) || { n: 0, from: new Map(), client: new Map(), opts: new Set() }; t.n += 1; if (o.상차지명) t.from.set(o.상차지명, (t.from.get(o.상차지명) || 0) + 1); if (o.거래처명) t.client.set(o.거래처명, (t.client.get(o.거래처명) || 0) + 1); if (o.배차방식) t.opts.add(o.배차방식); byTab.set(o.__tab, t); });
    const clientTabs = new Map(); byTab.forEach((t, title) => t.client.forEach((_, c) => clientTabs.set(c, (clientTabs.get(c) || new Set()).add(title))));
    const keysOf = (t) => [...[...t.from.entries()].filter(([, n]) => n >= Math.max(2, t.n * 0.03)).map(([v]) => v), ...[...t.client.keys()].filter((c) => clientTabs.get(c).size === 1)];
    const optTabs = new Map(); byTab.forEach((t, title) => t.opts.forEach((v) => optTabs.set(v, (optTabs.get(v) || new Set()).add(title))));
    if (Object.keys(preset.tabRules || {}).length) optTabs.forEach((ts, v) => {
      if (common.has(v) || ts.size >= 4 || PLATE_RE.test(normPlate(v))) return;
      const keys = uniq([...ts].flatMap((title) => keysOf(byTab.get(title))));
      if (keys.length) dispatchScopes[v] = keys;
    });
  }
  const pc = new Map(); orders.forEach((o) => { if (o.지급방식) pc.set(o.지급방식, (pc.get(o.지급방식) || 0) + 1); });
  const payOptions = [...pc.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ value: v, n }));
  const grades = uniq(drivers.map((d) => d.등급)).filter((g) => g !== "일반");
  // 9) 단가표 — 오더 탭은 오더 칸 오른쪽에서, 이름에 "단가"가 들어간 탭은 전체에서
  const rateSheets = [];
  fullTabs.forEach((t, i) => {
    if (preset.skipTabs?.includes(t.title) || preset.tabRules?.[t.title]?.noRates) return; // noRates: 그 탭의 단가표는 가져오지 않는다(대원전선)
    let minCol = -1; let client = cell(preset.tabClients?.[t.title]) || t.title; let base = "";
    if (kinds[i] === "orders") {
      const { L, memo } = layouts[i];
      const used = [...Object.values(L.cols), ...L.cargo.map((c) => c.col), ...L.memo, ...L.notes, L.sale?.base ?? -1, L.buy?.total ?? -1, L.buy?.base ?? -1, ...(L.buy?.extras || []).map((e) => e.col)];
      minCol = Math.max(...used) + 1;
      const fc = new Map(); orders.filter((o) => o.__tab === t.title && o.상차지주소).forEach((o) => fc.set(o.상차지주소, (fc.get(o.상차지주소) || 0) + 1));
      base = memo.defaultFrom?.address || [...fc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    } else if (/단가|운임표|요율/.test(t.title)) minCol = 0;
    if (minCol < 0) return;
    const tbs = parseRateTables(t.rows, { minCol });
    const first = tbs[0];
    // 표 옆 설명 글(경유비 · 중량별 적용 · 추가 운임 규칙) → 첫 표 메모에 "참고"로
    const inTable = (c) => tbs.some((x) => c >= x.nameCol && c <= Math.max(...x.tonCols.map((y) => y.col)));
    const side = [];
    if (first) {
      const r0 = Math.min(...tbs.map((x) => x.startRow)) - 2, r1 = Math.max(...tbs.map((x) => x.lastRow));
      for (let r = Math.max(0, r0); r <= r1; r++) {
        let prev = "";
        (t.rows[r] || []).forEach((v, c) => { const x = cell(v).replace(/\s+/g, " "); if (c < minCol || inTable(c) || !x || x === prev) { prev = x; return; } prev = x; if (!side.includes(x) && side.length < 60) side.push(x); });
      }
    }
    tbs.forEach((tb, k) => {
      const labels = uniq(tb.tonCols.map((x) => x.label));
      const notes = [`구글시트 "${t.title}" 탭 ${colLetter(tb.nameCol)}열 단가표`];
      if (tb.title) notes.unshift(tb.title);
      if (k > 0 && first) { // 첫 표와 금액 차이가 늘 같으면 적어 둔다(대원전선 오른쪽 표 = 5,000원 낮음)
        const diffs = new Set();
        tb.rows.forEach((r) => { const f = first.rows.find((x) => x.name === r.name && x.group === r.group); if (f) Object.entries(r.prices).forEach(([l, n]) => { if (f.prices[l]) diffs.add(n - f.prices[l]); }); });
        if (diffs.size === 1) { const d = [...diffs][0]; if (d) notes.push(`${first.title || "첫 번째 표"}보다 ${Math.abs(d).toLocaleString("ko-KR")}원 ${d < 0 ? "낮음" : "높음"}`); }
      }
      // 제목 없는 표 이름: 다음 표가 "○○부터 적용"이면 그 전 단가 · 첫 표와 금액 차이가 늘 같으면 그 차이
      const nextT = tbs[k + 1]?.title || "";
      const since = nextT.match(/(\d{4}[-.]\s*\d{1,2}[-.]\s*\d{1,2}).*부터/);
      const diffNote = notes.find((x) => /보다 .*원 (낮음|높음)$/.test(x));
      const label = tb.title || (since ? `${since[1]} 전 단가` : diffNote || (tbs.length > 1 ? `단가표 ${k + 1}` : "단가표"));
      if (!tb.title && since) notes.unshift(`${since[1]} 전까지 쓰던 단가`);
      const name = `${client} · ${label}`;
      if (k === 0 && side.length) notes.push(`참고: ${side.join(" / ")}`.slice(0, 1500));
      rateSheets.push({ tab: t.title, baseName: name.slice(0, 60), baseAddress: base, note: notes.join(" · "), labels, rows: tb.rows, groups: uniq(tb.groups) });
    });
  });
  return { tabs: tabSummary, orders, clients, places, drivers, routes, dispatchOptions, dispatchScopes, payOptions, grades, carriers, issues, rateSheets };
}

export function describeLayout(L) {
  const names = { date: "상차일", time: "상차시간", arriveDate: "하차일", arriveDay: "도착일자", arriveTime: "입고시간", from: "상차지", to: "하차지", client: "거래처(화주)", consignee: "하차처", vehicle: "차종", status: "배차상태", carrier: "배차방식(운송사)", plate: "차량번호", name: "기사명", phone: "연락처", close: "마감월", cod: "착불", region: "지역" };
  const out = Object.entries(L.cols).map(([k, c]) => ({ col: colLetter(c), header: L.header[c] || "(이름 없음)", to: names[k] || k }));
  L.cargo.forEach((c) => out.push({ col: colLetter(c.col), header: c.name, to: "화물정보" }));
  L.memo.forEach((c) => out.push({ col: colLetter(c), header: L.header[c], to: "메모" }));
  if (L.sale) {
    out.push({ col: colLetter(L.sale.base), header: "매출 운임", to: "청구운임" });
    L.sale.extras.forEach((e) => out.push({ col: colLetter(e.col), header: `매출 ${e.name}`, to: "특수운임(청구)" }));
    if (L.sale.total >= 0) out.push({ col: colLetter(L.sale.total), header: "매출 합계", to: "청구운임(합계 확인)" });
    out.push({ col: colLetter(L.buy.base), header: "매입 운임", to: "기사운임" });
    L.buy.extras.forEach((e) => out.push({ col: colLetter(e.col), header: `매입 ${e.name}`, to: "특수운임(기사)" }));
    if (L.buy.total >= 0) out.push({ col: colLetter(L.buy.total), header: "매입 합계", to: "기사운임(합계 확인)" });
  }
  return out.sort((a, b) => colIndex(a.col) - colIndex(b.col));
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function findRouteCandidates(orders, preset = DEFAULT_PRESET) {
  const groups = new Map();
  orders.forEach((o) => {
    if (!o.상차지명 || !o.하차지명 || !o.거래처명) return;
    const k = [o.거래처명, nm(o.상차지명), nm(o.하차지명)].join("|");
    const g = groups.get(k) || { list: [] };
    g.list.push(o); groups.set(k, g);
  });
  const out = [];
  groups.forEach((g) => {
    const L = g.list;
    if (L.length < (preset.routeMinCount || 30)) return;
    const fares = new Map(); L.forEach((o) => { const f = `${o.청구운임}|${o.기사운임}`; fares.set(f, (fares.get(f) || 0) + 1); });
    const [topFare, topN] = [...fares.entries()].sort((a, b) => b[1] - a[1])[0];
    const clientFares = new Map(); L.forEach((o) => clientFares.set(o.청구운임, (clientFares.get(o.청구운임) || 0) + 1));
    const [topClient, topClientN] = [...clientFares.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topClientN / L.length < 0.6) return; // 운임이 매번 다르면 콜
    const [fc, fd] = topFare.split("|");
    const dowN = new Array(7).fill(0); L.forEach((o) => { dowN[new Date(`${o.상차일}T00:00:00Z`).getUTCDay()] += 1; });
    const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => dowN[d] / L.length >= 0.08).map((d) => DOW[d]);
    const drv = new Map(); L.forEach((o) => { if (o.차량번호) drv.set(o.차량번호, (drv.get(o.차량번호) || 0) + 1); });
    const topDrivers = [...drv.entries()].sort((a, b) => b[1] - a[1]);
    const onlyDriver = topDrivers[0] && topDrivers[0][1] / L.length >= 0.8 ? L.find((o) => o.차량번호 === topDrivers[0][0]) : null;
    const tons = new Map(); L.forEach((o) => { if (o.차량톤수) tons.set(o.차량톤수, (tons.get(o.차량톤수) || 0) + 1); });
    const ton = [...tons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const s = L[0];
    const perDay = new Map(); L.forEach((o) => perDay.set(o.상차일, (perDay.get(o.상차일) || 0) + 1));
    const avgPerDay = Math.round((L.length / perDay.size) * 10) / 10;
    out.push({
      name: `${s.거래처명} ${s.상차지명}→${s.하차지명}`, client: s.거래처명,
      stops: [{ type: "상차", name: s.상차지명, addr: s.상차지주소 || "" }, { type: "하차", name: s.하차지명, addr: s.하차지주소 || "" }],
      days, tonnage: ton, fareClient: topClient, fareDriver: fd === undefined ? "" : (topFare.startsWith(`${topClient}|`) ? fd : ""), fareShare: Math.round((topN / L.length) * 100),
      count: L.length, avgPerDay, driver: onlyDriver ? { carNo: onlyDriver.차량번호, name: onlyDriver.이름, phone: onlyDriver.전화번호 } : null,
      from: L[0].상차일, to: L[L.length - 1].상차일, fc,
    });
  });
  return out.sort((a, b) => b.count - a.count);
}

// ── 저장 문서 모양 ─────────────────────────────────────────
// 오더 → orders 문서(화면 전용 칸 __tab · __row 빼고, 빈 값 빼고, 회사 · 가져오기 묶음 표시)
export function forOrderDoc(o, { company, batchId, me = "" }) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("__") || v === "" || v == null) continue;
    out[k] = v;
  }
  return { ...out, companyName: company, 작성자: me, 등록기기: "구글시트 이전", importBatchId: batchId, _sheetKeys: Object.keys(out) }; // _sheetKeys: 시트에서 온 칸(다시 가져올 때 비교)
}
// 고정노선 후보 → fixedRoutes 문서(운행 OFF로 만든다 — 요일 · 기사 확인 후 사람이 켠다)
export function forRouteDoc(rt, { company, batchId, me = "", payMethod = "계산서" }) {
  return {
    companyName: company, name: rt.name, client: rt.client, color: "",
    stops: rt.stops.map((s) => ({ type: s.type, name: s.name, addr: s.addr || "", time: "", contact: "", memo: "" })),
    days: rt.days, startTime: "", tonnage: rt.tonnage || "", vehicleType: "",
    fareMode: "base", fareClient: String(rt.fareClient || ""), fareDriver: String(rt.fareDriver || ""), payMethod,
    driverKey: "", driverName: rt.driver?.name || "", carNo: rt.driver?.carNo || "", phone: rt.driver?.phone || "",
    startDate: "", endDate: "", autoDispatch: false, active: false,
    memo: `구글시트 이전 후보 — ${rt.from} ~ ${rt.to} ${rt.count}건(하루 평균 ${rt.avgPerDay}대) · 같은 운임 ${rt.fareShare}%. 요일 · 기사 확인 후 운행을 켜 주세요.`,
    importBatchId: batchId, updatedBy: me,
  };
}

// ── 단가표(오른쪽에 붙어 있는 톤수별 운임표) → 단가표 메뉴 › 다목적지 단가표(multiRateSheets) ──
//  머리줄 = 톤수 글자("1T" · "2.5톤" · "11TON" · "F/C,T/C")가 옆으로 3개 이상 이어진 줄. 그 왼쪽 칸 = 하차지(지역) 이름 칸.
//  같은 칸 위치에서 머리줄이 다시 나오면(충청남도 · 충청북도 … 지역 묶음) 같은 표로 이어 붙이고, 묶음 이름은 하차지 주소 칸에.
//  표 위 3줄 안의 글(예: "JY사용 시 (청구, 하불 동일)" · "2026-10-01 상차분부터 적용")이 표 제목.
// 단가표 메뉴 표준 톤수(src/RateCard.jsx STANDARD_TON_LABELS와 같아야 함 — 기본 칸으로 만든다)
export const RATE_STANDARD_TONS = ["다마스/라보", "1톤", "1.4톤", "2.5톤", "3.5톤", "3.5톤광폭", "5톤", "5톤축", "5톤플축", "8톤", "11톤", "11톤축", "15톤", "18톤", "25톤"];
const TON_CELL = /^\s*(\d+(?:\.\d+)?)\s*(t|톤|ton)\s*$/i;
export function rateTonLabel(v) {
  const s = cell(v);
  const m = s.match(TON_CELL);
  if (m) return `${+m[1]}톤`;
  if (/^(f\/c|t\/c)/i.test(s)) return s.replace(/\s+/g, "").replace(/,/g, "·").toUpperCase();
  if (/다마스|라보/.test(s)) return "다마스/라보";
  return "";
}
export function parseRateTables(rows, { minCol = 0 } = {}) {
  const tables = new Map(); // 열 위치(이름 칸) → 표
  for (let ri = 0; ri < rows.length; ri++) {
    const r = (rows[ri] || []).map(cell);
    for (let c = minCol; c < r.length; c++) {
      if (!rateTonLabel(r[c])) continue;
      // 톤수 칸이 이어진 묶음
      let e = c; const labels = [];
      while (e < r.length && rateTonLabel(r[e])) { labels.push(rateTonLabel(r[e])); e++; }
      const distinct = new Set(labels);
      if (distinct.size >= 3) {
        // 이름 칸: 바로 왼쪽부터 글자가 있는 칸 · 병합으로 같은 글자가 이어지면 그 시작 칸
        let n = c - 1; while (n >= minCol && !r[n]) n--;
        if (n >= minCol) {
          while (n - 1 >= minCol && r[n - 1] === r[n]) n--;
          const key = `${n}`;
          const group = /^하차지|^지역|^도착지/.test(r[n]) ? "" : r[n];
          let tb = tables.get(key);
          if (!tb) {
            let title = "";
            for (let up = 1; up <= 3 && !title; up++) { const above = (rows[ri - up] || []).map(cell); for (let k = n; k < e && !title; k++) if (above[k] && !rateTonLabel(above[k]) && !/^\(단위/.test(above[k])) title = above[k]; }
            tb = { nameCol: n, tonCols: [], title, startRow: ri, rows: [], groups: [] };
            tables.set(key, tb);
          } else if (ri - tb.lastRow > 3 && (() => {
            // 같은 자리에 떨어져서 다시 나온 표 — 위에 제목이 있으면 새 표(롯데: "2026-10-01 상차분부터 적용"), 없으면 지역 묶음(대원전선 충청남도 …)
            for (let up = 1; up <= 3; up++) { const above = (rows[ri - up] || []).map(cell); for (let k = n; k < e; k++) if (above[k] && !rateTonLabel(above[k]) && !/^\(단위/.test(above[k])) return true; }
            return false;
          })()) {
            let title = "";
            for (let up = 1; up <= 3 && !title; up++) { const above = (rows[ri - up] || []).map(cell); for (let k = n; k < e && !title; k++) if (above[k] && !rateTonLabel(above[k]) && !/^\(단위/.test(above[k])) title = above[k]; }
            const old = tb;
            tables.set(`${key}@${old.startRow}`, old);
            tb = { nameCol: n, tonCols: [], title, startRow: ri, rows: [], groups: [], prevTitle: old.title };
            tables.set(key, tb);
          }
          for (let k = c; k < e; k++) if (!tb.tonCols.some((x) => x.col === k)) tb.tonCols.push({ col: k, label: rateTonLabel(r[k]) });
          if (group) tb.groups.push(group);
          tb.curGroup = group; tb.lastRow = ri;
          // 아래 줄들 = 값
          let rr = ri + 1;
          for (; rr < rows.length; rr++) {
            const x = (rows[rr] || []).map(cell);
            const name = x[n];
            if (!name) break;
            if (rateTonLabel(x[c])) break; // 다음 머리줄
            const prices = {};
            tb.tonCols.filter((t) => t.col >= c && t.col < e).forEach((t) => { const p = parseMoney(x[t.col]); if (p.n > 0) prices[t.label] = p.n; });
            if (!Object.keys(prices).length) continue;
            tb.rows.push({ name, group: tb.curGroup, prices });
            tb.lastRow = rr;
          }
          ri = Math.max(ri, 0); // 같은 줄의 다른 표도 보도록 줄은 그대로
        }
      }
      c = e;
    }
  }
  return [...tables.values()].filter((t) => t.rows.length >= 3).sort((a, b) => a.startRow - b.startRow || a.nameCol - b.nameCol);
}
// 단가표 → multiRateSheets 문서(표준 톤수 칸은 늘 만들고, 시트에만 있는 칸(9톤 · F/C·T/C …)은 추가 칸)
export function forRateSheetDoc(rt, { company, batchId, uid = () => Math.random().toString(36).slice(2, 10) }) {
  const columns = RATE_STANDARD_TONS.map((label) => ({ id: uid(), label, isDefault: true }));
  rt.labels.forEach((l) => { if (!columns.some((c) => c.label === l)) columns.push({ id: uid(), label: l, isDefault: false }); });
  const idOf = Object.fromEntries(columns.map((c) => [c.label, c.id]));
  return {
    companyName: company, baseName: rt.baseName, baseAddress: rt.baseAddress || "", note: rt.note || "",
    columns,
    rows: rt.rows.map((r) => ({ id: uid(), name: r.name, address: r.group || "", prices: Object.fromEntries(Object.entries(r.prices).map(([l, n]) => [idOf[l], String(n)])) })),
    importBatchId: batchId,
  };
}

// ── 🔁 2026-11-13 다시 가져오기 = 시트 그대로 맞추기 ─────────────────────────
//  시트에서만 입력 · 수정하는 회사: 같은 시트를 다시 가져오면 새로 만들지 않고, 이미 가져온 오더를 시트 내용으로 고친다.
//  같은 줄 찾는 순서(앞에서 못 찾은 것만 다음 단계로):
//   ① 탭!줄 번호 + 상차일이 같다 ② 탭 + 상차일 + 상차지 + 하차지 + 차량번호가 같다(줄이 밀린 경우)
//   ③ 탭 + 상차일 + 상차지 + 하차지가 같다(차량 · 운임을 고친 경우 — 같은 구간이 여러 줄이면 위에서부터 차례로) ④ 탭!줄 번호만 같다(날짜를 고친 경우)
//  고칠 칸 = 시트에서 온 칸만(첨부 · 기사 수락 기록 · 정산 표시처럼 프로그램에서 생긴 칸은 건드리지 않는다)
//  시트에서 지워진 값(예: 차량번호를 지움)은 빈 값으로 — 지난번에 시트에서 왔던 칸(_sheetKeys)을 기억해 두고 비교한다
export const SHEET_CORE_KEYS = ["차량번호", "이름", "전화번호", "청구운임", "기사운임", "수수료", "메모", "특수운임", "특수기사차감", "특수청구추가", "외부지급합", "경유하차목록", "경유지_하차", "상차시간", "하차시간", "차량종류", "차량톤수", "화물내용", "배차방식", "지급방식", "배차상태", "마감월", "마감이월"];
const tabOf = (src) => String(src || "").split("!")[0];
const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
// existing: [{ id, data }] (이 회사의 "구글시트 이전" 오더) · incoming: forOrderDoc 을 거치기 전 오더(rec) 목록
// → { create: [rec], update: [{ id, rec, patch }], same: n, missing: [{ id, data }] }
export function reconcileOrders(existing = [], incoming = [], { keepKeys = ["importBatchId", "작성자", "등록기기", "companyName", "_id"] } = {}) {
  const left = new Map(existing.map((e) => [e.id, e]));
  const pairs = new Map(); // incoming index → existing
  const take = (i, e) => { pairs.set(i, e); left.delete(e.id); };
  const pass = (keyIn, keyEx) => {
    const idx = new Map();
    [...left.values()].forEach((e) => { const k = keyEx(e.data); if (!k) return; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(e); });
    incoming.forEach((o, i) => { if (pairs.has(i)) return; const k = keyIn(o); const l = k ? idx.get(k) : null; if (l && l.length) take(i, l.shift()); });
  };
  const n = (v) => String(v ?? "").replace(/\s+/g, "");
  const full = (x) => (x.이전출처 ? [x.이전출처, x.상차일, n(x.상차지명), n(x.하차지명), n(x.차량번호)].join("|") : "");
  pass(full, full); // ⓪ 줄 · 날짜 · 구간 · 차량이 모두 같다(안 바뀐 줄을 먼저 묶어 둔다)
  pass((o) => [tabOf(o.이전출처), o.상차일, n(o.상차지명), n(o.하차지명), n(o.차량번호)].join("|"), (d) => [tabOf(d.이전출처), d.상차일, n(d.상차지명), n(d.하차지명), n(d.차량번호)].join("|"));
  // 🛠 2026-11-13 이름 규칙이 바뀌고(보령 → 보령공장) 줄도 밀린 경우 — 이름을 빼고 탭 · 날짜 · 차량 · 운임으로 찾는다(같은 조건이 여러 줄이면 위에서부터 차례로)
  //  이 단계가 없으면 그런 줄이 새 오더로 또 만들어져 중복이 생겼다
  const veh = (x) => [tabOf(x.이전출처), x.상차일, n(x.차량번호), String(x.청구운임 ?? ""), String(x.기사운임 ?? "")].join("|");
  pass(veh, veh);
  pass((o) => (o.이전출처 ? `${o.이전출처}|${o.상차일}` : ""), (d) => (d.이전출처 ? `${d.이전출처}|${d.상차일}` : ""));
  const veh2 = (x) => (n(x.차량번호) ? [tabOf(x.이전출처), x.상차일, n(x.차량번호)].join("|") : "");
  pass(veh2, veh2);
  pass((o) => [tabOf(o.이전출처), o.상차일, n(o.상차지명), n(o.하차지명)].join("|"), (d) => [tabOf(d.이전출처), d.상차일, n(d.상차지명), n(d.하차지명)].join("|"));
  pass((o) => o.이전출처 || "", (d) => d.이전출처 || "");
  const create = []; const update = []; let sameN = 0;
  incoming.forEach((o, i) => {
    const e = pairs.get(i);
    if (!e) { create.push(o); return; }
    const next = {}; Object.entries(o).forEach(([k, v]) => { if (!k.startsWith("__") && v !== "" && v != null) next[k] = v; });
    const patch = {};
    Object.entries(next).forEach(([k, v]) => { if (!keepKeys.includes(k) && !same(e.data[k], v)) patch[k] = v; });
    // 시트에서 사라진 값 → 비운다
    const before = new Set([...(Array.isArray(e.data._sheetKeys) ? e.data._sheetKeys : SHEET_CORE_KEYS)]);
    before.forEach((k) => { if (!(k in next) && !keepKeys.includes(k) && e.data[k] != null && e.data[k] !== "" && !(Array.isArray(e.data[k]) && !e.data[k].length)) patch[k] = Array.isArray(e.data[k]) ? [] : (typeof e.data[k] === "number" ? 0 : typeof e.data[k] === "boolean" ? false : ""); });
    if (Object.keys(patch).length) update.push({ id: e.id, rec: o, patch: { ...patch, _sheetKeys: Object.keys(next) } }); else sameN += 1;
  });
  return { create, update, same: sameN, missing: [...left.values()] };
}
