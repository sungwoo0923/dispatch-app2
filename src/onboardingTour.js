// ======================= src/onboardingTour.js =======================
// 🧭 2026-11-10 첫 방문 안내(메뉴별 말풍선) · [?] 도움말 — 설정 표(이 파일 한 곳)
//  · 보이는 기간: TOUR_WINDOWS(회사 이름별 임시 기간) → 없으면 회사 승인 후 24시간(companySettings/{회사}.onboarding.approvedAt)
//  · 단계: MENU_TOURS[메뉴] = [{ tour, find, title, text }]
//      tour: data-tour="키" 요소를 먼저 찾고, 없으면 find(버튼 글자)가 들어간 보이는 버튼을 찾는다. 둘 다 없으면 그 단계는 건너뜀.
//      tour·find 둘 다 없는 단계 = 화면 가운데 안내(메뉴 소개).
//  · [?] 도움말: HELP_TEXT[키] — 기간 안에는 data-tour 요소 오른쪽 위에 작은 ?가 붙는다(누르면 한 줄 설명).
//  · 본 기록: localStorage kpTourSeen:{uid}:{메뉴} (사용자·메뉴별 1회, 기기마다)
//  ⚠ node 테스트에서도 읽을 수 있게 다른 파일을 가져오지 않는다.

// ⭐ 2026-11-11 사용자 요청 — "이제부터 신규로 가입하는 운송사만, 1번만"
//  · 테스트운송사 · 큐런네트웍스 등 예전 임시 기간은 모두 뺐다(TOUR_WINDOWS 비움 → 안내 · [사용법 다시 보기] 버튼 모두 안 보임)
//  · NEW_SINCE 이후에 승인된 운송사만 안내가 켜진다(승인 뒤 ACTIVE_DAYS일 동안 [사용법 다시 보기] 버튼이 보인다)
//  · 메뉴마다 사용자별 딱 1번 자동으로 뜨고, 본 기록은 서버(userProfiles/{uid}.tourSeen)에도 남겨 다른 PC · 휴대폰에서도 다시 안 뜬다
//    (그다음부터는 [사용법 다시 보기]를 눌렀을 때만)
export const TOUR_WINDOWS = {};
export const NEW_SINCE = Date.parse("2026-11-12T00:00:00+09:00"); // 이 시각 이후 승인된 운송사 = 신규
export const ACTIVE_DAYS = 14;
export const AUTO_HOURS = ACTIVE_DAYS * 24; // (예전 이름 호환)

export const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

// 지금 안내를 보여 줄지 — company: 회사 이름, approvedMs: 회사 승인 시각(ms, 모르면 0)
export function tourActive(company, approvedMs = 0, now = Date.now()) {
  const co = String(company || "").trim();
  if (!co) return false;
  const w = TOUR_WINDOWS[co];
  if (w) { const d = kstYmd(now); return d >= w.from && d <= w.to; }
  if (!approvedMs || approvedMs < NEW_SINCE) return false; // 예전부터 쓰던 운송사(테스트운송사 포함)는 안 띄운다
  return now >= approvedMs && now - approvedMs < ACTIVE_DAYS * 86400e3;
}

export const seenKey = (uid, menu) => `kpTourSeen:${uid || "anon"}:${menu}`;

// 메뉴별 단계(PC·모바일 공용 — 모바일은 화면에 있는 것만 보인다)
export const MENU_TOURS = {
  HOME: [
    { title: "LogisWeb에 오신 걸 환영합니다", text: "처음 들어가는 메뉴마다 핵심 버튼을 2~3개씩 짚어 드려요. 언제든 왼쪽 아래 [사용법 다시 보기]로 다시 볼 수 있어요." },
    { tour: "nav-menu", title: "메뉴", text: "위쪽(또는 ☰) 메뉴에서 오더등록 · 배차현황 · 기사관리 · 정산 등으로 이동해요. F1 오더등록 · F2 실시간 · F3 배차현황." },
    { find: "출근하기", title: "출근", text: "브라우저를 켜면 자동 출근돼요. 안 됐으면 여기서 눌러 주세요." },
  ],
  배차관리: [
    { tour: "order-client", title: "1 · 거래처 입력", text: "거래처명을 입력하면 등록된 거래처가 목록으로 떠요. 그다음 상차지 → 하차지 → 날짜·시간 → 차량 → 운임 순서로 채워요." },
    { find: "특수운임", title: "2 · 특수운임", text: "지게차·대기료·할증처럼 특별한 비용이 있으면 여기서 넣어요(누가 부담할지 선택)." },
    { tour: "order-save", find: "오더등록", title: "3 · 저장", text: "다 채웠으면 등록 → 기사를 고르면 기사앱으로 바로 배차돼요. 여러 건은 [다중등록], 카톡 오더는 오른쪽 아래 ✨ AI 비서에 붙여넣기." },
  ],
  실시간배차현황: [
    { title: "실시간배차현황", text: "어제·오늘·내일 오더를 실시간으로 봐요. 기사가 수락·거절하면 바로 표시돼요." },
    { find: "오늘", title: "날짜 바꾸기", text: "어제 / 오늘 / 내일을 눌러 날짜를 바꿔요." },
    { title: "여러 건 한 번에", text: "오더를 여러 개 체크하고 마우스 오른쪽 버튼 → [일괄수정·복사]로 한 번에 고치거나 다른 날짜로 복사해요." },
  ],
  배차현황: [
    { find: "세부검색", title: "1 · 찾기", text: "기간·거래처·기사로 지난 오더를 찾아요." },
    { find: "엑셀다운", title: "2 · 엑셀", text: "지금 보이는 목록을 엑셀로 내려받아요." },
    { find: "인수증관리", title: "3 · 인수증관리", text: "기사가 올린 인수증·전표를 모아 보고, 사무실에서 직접 올릴 수도 있어요." },
  ],
  기사관리: [
    { find: "신규등록", title: "1 · 기사 등록", text: "기사를 한 명씩 등록해요. 여러 명은 [대용량 업로드]로 엑셀 한 번에." },
    { find: "기사 앱 계정", title: "2 · 기사앱 계정", text: "기사가 기사앱으로 가입하면 여기서 승인하고 배차담당자를 정해요." },
  ],
  거래처관리: [
    { find: "신규등록", title: "1 · 거래처 등록", text: "상하차지와 기본거래처(청구처)를 등록해요. 여러 곳은 [대용량 업로드]." },
    { find: "대용량 업로드", title: "2 · 엑셀로 한 번에", text: "양식을 내려받아 채운 뒤 올리면 한 번에 등록돼요." },
  ],
  지입차관리: [
    { title: "지입차관리", text: "지입·직영·임대 차량의 실시간 위치(관제), 노선, 차량 점검·정비를 관리해요." },
    { find: "관제", title: "관제현황", text: "지금 운행 중인 차량 위치와 상태를 봐요. 기사를 누르면 상세가 열려요." },
  ],
  매출관리: [
    { title: "매출관리", text: "기간별 매출·매입·수익을 봐요. 비밀번호를 걸어 둘 수 있어요." },
  ],
  정산관리: [
    { title: "정산관리", text: "거래처 정산(거래명세서·미수금)과 기사 지급, 지게차 지급을 처리해요." },
    { find: "거래명세서", title: "거래명세서", text: "거래처를 고르고 기간을 정하면 거래명세서가 만들어져요. 회사 메일로 바로 보낼 수 있어요." },
  ],
  전자결재: [
    { title: "전자결재", text: "휴가·지출결의·기안을 작성해 결재선으로 올리고, 받은 결재를 처리해요." },
    { find: "결재 대기", title: "결재 대기", text: "내가 결재할 차례인 문서가 여기 모여요." },
  ],
  회사관리: [
    { find: "회사정보", title: "1 · 회사정보", text: "대표·사업자번호·직인·계좌를 넣으면 거래명세서·청구서에 자동으로 들어가요." },
    { find: "내정보", title: "2 · 내정보", text: "내 정보·급여명세서·연차를 볼 수 있어요." },
  ],
  관리자메뉴: [
    { find: "회원 관리", title: "직원 승인 · 권한", text: "직원이 가입하면 여기서 부서·직책·권한을 정해 승인해요. 마스터는 다른 직원에게 마스터를 위임할 수 있어요." },
  ],
};

// [?] 도움말 — data-tour 키별 한 줄 설명
export const HELP_TEXT = {
  "nav-menu": "메뉴를 눌러 화면을 바꿔요. 자물쇠가 있는 메뉴는 요금제에 없는 기능이에요.",
  "order-client": "거래처명을 입력하면 등록된 거래처가 목록으로 떠요.",
  "order-save": "입력한 오더를 저장해요. 저장 후 기사를 고르면 기사앱으로 배차돼요.",
  "special-fare": "지게차·대기료·할증 같은 특별 비용을 넣어요.",
};
