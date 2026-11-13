// ======================= src/planCore.js =======================
// 💳 요금제 데이터·기능 잠금 규칙(순수 JS, firebase 없음) — plans.jsx가 다시 내보내고, scripts/planGateTest.mjs가 가상 테스트한다.
export const PLAN_IDS = ["lite", "basic", "standard", "pro"];
// ⭐ 2026-11-09 요금표 재설정(2차) — 기능 범위(배차·정산·그룹웨어·인사·급여·지입 GPS·AI·화주 포털)에 맞춰 상향
//  가격 사다리: 89,000 / 199,000 / 349,000 / 590,000 (VAT 별도)
//  · seats 직원 계정(초과 가입은 막힘 — 추가 계정을 사야 열림) · orders 월 오더 · fleet 포함 지입차(GPS 관리) 대수 · storageGB 포함 저장 용량 · setupFee 초기 도입비(12개월 약정 시 면제)
//  · 지입차 포함 대수 기준: 지입차관리 메뉴가 열리는 스탠다드부터 — 직원 1명당 지입차 약 1.5대(스탠다드 10명 → 15대, 프로 25명 → 40대). 라이트·베이직은 메뉴 자체가 없음(–)
//  · 이미 저장된 요금(요금제 관리)은 그대로 둔다 — 관리센터 › 영업 › 요금제 관리 [추천 요금표 적용] → [저장]을 눌러야 바뀐다(RECOMMENDED_PLAN_VERSION)
//  · 이 값이 기본값으로 쓰이는 곳: 저장된 요금이 아직 없을 때(신규 설치) · 공개 요금(publicPricing) 문서가 없을 때 · 가입 화면
// 월 추가 옵션 기본 단가(요금제 관리 SALES_DEFAULT가 이 값을 쓴다)
export const PLAN_RATES = { extraSeat: 20000, extraOrder: 50, fleetPerVehicle: 7000, storagePerGB: 3000 };
export const RECOMMENDED_PLAN_VERSION = "2026-11b";
// 🧭 2026-11-13 업무 영역 추가 요금 — 기본료에는 업무 영역 1개(내륙 · 컨테이너 · 해상 · 항공 중 하나)가 들어 있고, 영역을 더 쓰면 요금제별 추가 요금이 붙는다
//  · 1개 추가 단가(월): 기본료의 약 30%(라이트 3만 · 베이직 6만 · 스탠다드 10만 · 프로 17만)
//  · 여러 개 묶음 할인: 2개째 추가부터 10%, 통합(4개 모두 = 3개 추가)은 20% → 1개 ×1.0 · 2개 ×1.8 · 3개(통합) ×2.4
//  · 근거: 해외 포워딩 전용 프로그램이 사용자 1명당 월 75~200달러(약 10~28만 원) 선. 스탠다드 통합(349,000 + 240,000 = 589,000원 / 10명)은 1명당 약 5.9만 원으로
//    그보다 낮게 잡았다(통관 · EDI 연동이 없는 일정 · 마감 · 손익 관리 범위이기 때문)
export const MODULE_ADDON = { lite: 30000, basic: 60000, standard: 100000, pro: 170000 };
export const MODULE_BUNDLE = [0, 1, 1.8, 2.4]; // 추가 영역 수 → 단가 배수
export const MODULE_NAMES = { inland: "내륙", container: "컨테이너", sea: "해상", air: "항공" };
// 업무 영역 수(1~4) → 월 추가 요금. addon: 요금제 관리에서 바꾼 단가가 있으면 그 값
export function moduleAddonFee(planId, moduleCount, addon = MODULE_ADDON) {
  const extra = Math.max(0, Math.min(3, Math.floor(Number(moduleCount) || 1) - 1));
  const unit = Number((addon || MODULE_ADDON)[planId] ?? MODULE_ADDON[planId] ?? 0) || 0;
  return Math.round((unit * MODULE_BUNDLE[extra]) / 1000) * 1000;
}
export const moduleAddonLabel = (moduleCount) => { const n = Math.max(1, Math.min(4, Math.floor(Number(moduleCount) || 1))); return n >= 4 ? "통합(4개 영역)" : n > 1 ? `업무 영역 ${n}개` : "업무 영역 1개"; };
export const PLAN_DEFAULTS = [
  { id: "lite", name: "라이트", en: "LITE", price: 89000, seats: 3, orders: 1000, fleet: 0, storageGB: 10, setupFee: 0, target: "1인 주선 · 2~3인 (일 30건 안팎)" },
  { id: "basic", name: "베이직", en: "BASIC", price: 199000, seats: 6, orders: 3000, fleet: 0, storageGB: 30, setupFee: 300000, target: "소규모 운송사 · 4~6인 (일 100건 안팎)" },
  { id: "standard", name: "스탠다드", en: "STANDARD", price: 349000, seats: 10, orders: 6000, fleet: 15, storageGB: 50, setupFee: 500000, target: "일반 운송사 · 7~10인 (일 200건 안팎)", recommended: true },
  { id: "pro", name: "프로", en: "PRO", price: 590000, seats: 25, orders: 15000, fleet: 40, storageGB: 200, setupFee: 1000000, target: "중견 운송사 · 11인 이상 (일 500건 안팎)" },
];

// 기능표 — min: 이 요금제부터 사용 가능
export const FEATURE_ROWS = [
  { key: "dispatch", label: "오더등록 · 실시간배차현황 · 배차현황", min: "lite" },
  { key: "master", label: "거래처 · 하차지 · 기사 관리", min: "lite" },
  { key: "fare", label: "단가표 · 전국 운임조회", min: "lite" },
  { key: "driverApp", label: "기사앱 · 업로드링크 · 기사복사", min: "lite" },
  { key: "settlement", label: "매출관리 · 정산관리 · 지급관리", min: "lite" },
  { key: "shipperPortal", label: "화주사 전용 포털 연동", min: "basic" },
  { key: "groupware", label: "전자결재 · 사내메일 · 게시판 · 인수인계", min: "basic" },
  { key: "hr", label: "인사관리부 · 출근기록부 · 연차 · 증명서", min: "basic" },
  { key: "office", label: "회계 · 급여 · 자금 · 비품 관리", min: "basic" },
  { key: "fleet", label: "지입차관리 (GPS · 운행기록 · 사진)", min: "standard" },
  { key: "export", label: "경영분석 · 일일 경영보고 (임원 화면)", min: "standard" },
  { key: "insight", label: "수익성 인사이트 (거래처·노선 마진 · 저마진 경고 · 이상 운임 감지)", min: "pro", star: true },
  { key: "shipperReport", label: "화주 월간 운송 리포트 (화주에게 보내는 원클릭 PDF)", min: "pro", star: true },
  { key: "call24", label: "화물정보망(24시콜) 오더 자동 전송", min: "pro", star: true },
  { key: "support", label: "우선 기술지원 · 분기별 운영 점검 미팅", min: "pro" },
];
export const FEATURE_BY_KEY = Object.fromEntries(FEATURE_ROWS.map((f) => [f.key, f]));

// 상단 메뉴 → 기능 (여기 없는 메뉴는 모든 요금제에서 사용)
// ⭐ 2026-11-09 회사관리(회사정보·내정보)는 모든 요금제 — 안의 출근기록부·인사관리부 탭만 베이직부터(회사관리 화면이 직접 거른다)
export const MENU_FEATURE = {
  지입차관리: "fleet", 인사이트: "insight", 전자결재: "groupware", 결재함: "groupware", 결재대기: "groupware", 자금현황: "office",
  인사관리부: "hr", 출근기록부: "hr", 직원관리: "hr", 연차관리: "hr", 입퇴사관리: "hr", 증명서발급: "hr",
  회계관리: "office", 자금관리: "office", 비품관리: "office",
  경영분석: "export", 일일경영보고: "export",
};
// 홈 왼쪽 사이드바 항목 → 기능
export const homeItemFeature = (key) => (/^(ap:|mail|board:)/.test(String(key)) || key === "인수인계" ? "groupware" : null);

const rank = (id) => PLAN_IDS.indexOf(id);
export const planIncludes = (planId, featureKey) => {
  if (!planId) return true; // 요금제 미지정(기존 고객) → 전부 사용
  const f = FEATURE_BY_KEY[featureKey];
  if (!f) return true;
  return rank(planId) >= rank(f.min);
};
// 👥 직원 계정 한도 — 승인된 직원 계정만 센다(기사·화주·최고관리자·퇴사자·계정 없는 인사 기록 제외)
export const countsAsSeat = (u) => !!u && u.approved === true && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role)
  && u.email !== "tjddnqkf@naver.com" && u.employmentStatus !== "퇴사" && !u.noAccount;
export function seatCheck(plan, extraSeats, users) {
  const base = Number(plan?.seats) || 0, extra = Math.max(0, Number(extraSeats) || 0), limit = base + extra;
  const used = (users || []).filter(countsAsSeat).length;
  return { ok: used < limit, used, limit, base, extra };
}
