// ======================= src/guideLibrary.js =======================
// 📚 2026-11-25 사용법 보관함(관리자센터 › 운영) — 업체에 보내려고 만든 사용법 이미지를 한곳에 모아 둔다.
//  · 이미지: public/howto/<id>.png · 작은 그림: public/howto/thumb/<id>.jpg (위쪽 640×400)
//  · 새 사용법을 만들면 이미지를 위 자리에 넣고 아래 GUIDES 맨 위에 한 줄 추가한다(CLAUDE.md "사용법 이미지 보관" 참고)
//  · message 는 업체에 이미지와 함께 보낼 글(없으면 [안내 글 복사] 단추가 안 보인다)
export const GUIDE_CATS = [
  { key: "order", label: "오더 · 배차", en: "ORDER" },
  { key: "driver", label: "기사앱", en: "DRIVER APP" },
  { key: "approval", label: "전자결재 · 지급", en: "APPROVAL" },
  { key: "account", label: "계정 · 권한", en: "ACCOUNT" },
  { key: "fleet", label: "지입차 · 관제", en: "FLEET" }, // 📍 2026-11-26
  { key: "hr", label: "인사 · 연차", en: "HR" }, // 🔕 2026-11-26
];

export const GUIDES = [
  { id: "fleet-control-update", cat: "fleet", device: "PC · 모바일", date: "2026-11-26", title: "관제현황 업데이트: 기사앱 · 웹 배지와 위치 설정 요청",
    desc: "기사님이 앱으로 쓰는지 웹으로 쓰는지, 휴대폰 설정 때문에 위치가 끊겼는지 보이고, [위치 설정 요청]으로 기사님께 알림을 보내요.",
    tags: ["관제현황", "기사앱", "웹", "위치 설정 요청", "위치 권한", "배터리", "신호 없음"],
    message: "관제현황이 업데이트되었습니다.\n1. 기사 이름 옆에 [기사앱] / [웹] 배지가 보입니다. [기사앱]은 앱을 닫아도 위치가 오고, [웹]은 화면을 끄면 위치가 끊깁니다. [웹]으로 보이는 기사님께는 기사앱 설치를 안내해 주세요.\n2. 기사님 휴대폰 설정(위치 '항상 허용' · 배터리 절전) 때문에 위치가 안 오면 빨간 [위치 설정 필요]가 뜹니다.\n3. 차량을 눌러 따라가기 카드의 [위치 설정 요청]을 누르면 기사님 휴대폰에 알림이 가고, 앱을 열면 설정 확인 창이 뜹니다. 기사님은 [설정 열기] · [허용하기]를 누르고 [다 했어요]만 누르면 됩니다.\n4. 기사님이 확인하면 카드에 '기사님이 설정을 확인했어요'로 바뀝니다.\n휴대폰에서도 지입차관리 › 지도에서 기사를 누르면 똑같이 쓸 수 있습니다.\n\n※ 휴대폰 권한은 관리자가 원격으로 바꿀 수 없어요(안드로이드 보안). 휴대폰을 껐다 켰다면 기사앱을 한 번 열어야 위치가 다시 갑니다." },
  { id: "leave-promo-popup-off", cat: "hr", device: "PC", date: "2026-11-26", title: "연차 사용 촉진 팝업 끄기",
    desc: "인사관리부 › 연차 관리 › [연차 사용 촉진] › 설정에서 [직원 화면에 팝업 띄우기]를 끄면 회사 전체에 팝업이 안 떠요.",
    tags: ["연차", "연차 촉진", "팝업", "인사관리부"],
    message: "연차 사용 촉진 팝업은 회사 설정에서 끌 수 있습니다.\n1. 인사관리부 → 연차 관리 → 위쪽 [연차 사용 촉진] 탭을 엽니다.\n2. 설정 칸의 [✓ 직원 화면에 팝업 띄우기]를 눌러 체크를 뺍니다.\n3. 오른쪽 위 [저장]을 누르면 회사 직원 모두에게 팝업이 뜨지 않습니다(PC · 휴대폰).\n\n팝업만 안 뜨고 알림 목록 · 사내메일 · 발송 기록은 그대로 남습니다. 통지를 받았다는 근거가 중요하니 [이메일도 보내기]는 켜 두시는 걸 권합니다." },
  { id: "rotation-order", cat: "order", device: "PC · 모바일", date: "2026-11-25", title: "같은 노선 하루 여러 번(회전) 한 번에 등록",
    desc: "[운행 옵션] › 왕복 › 회전 수 — 한 오더로 묶기 · N건으로 나누기. 대용량 업로드는 '회전' 열로 한 번에 올려요.",
    tags: ["회전", "왕복", "묶기", "나누기", "대용량 업로드"],
    message: "네, 가능합니다. 같은 노선을 하루에 여러 번 도는 경우 오더를 한 번만 넣으시면 됩니다.\n1. 오더 등록 칸에 거래처 · 상차지 · 하차지 · 날짜를 평소처럼 입력합니다.\n2. 위쪽 [운행 옵션]을 눌러 '왕복'을 체크합니다.\n3. 옆에 생기는 '회전' 칸에서 ＋를 눌러 횟수(예: 4)를 맞춥니다.\n4. [한 오더로 묶기] 또는 [4건으로 나누기]를 고르고 [등록]을 누릅니다.\n\n여러 날짜를 한꺼번에 올릴 때는 배차현황 › [엑셀 관리] › [대용량 업로드] 양식의 '회전' 열에 횟수를 적으면, 그 날짜에 횟수만큼 오더가 등록됩니다." },
  { id: "fixed-route-pc", cat: "order", device: "PC", date: "2026-11-23", title: "고정노선 자동 등록 사용방법 (PC)",
    desc: "매주 같은 요일 · 같은 노선 오더를 한 번 저장하면 정한 요일마다 배차가 자동으로 만들어져요.", tags: ["고정노선", "자동 등록", "지입차관리"] },
  { id: "fixed-route-mobile", cat: "order", device: "모바일", date: "2026-11-23", title: "고정노선 자동 등록 사용방법 (모바일)",
    desc: "휴대폰에서 고정노선을 만들고 켜고 끄는 방법이에요.", tags: ["고정노선", "자동 등록"] },
  { id: "dispatch-team-control", cat: "order", device: "PC", date: "2026-11-23", title: "배차팀 오더 관리 · 관제",
    desc: "지입 · 직영 · 임대 기사에게 오더를 보내고, 수락 · 거절과 위치를 실시간으로 확인해요.", tags: ["배차팀", "관제", "기사앱", "승인대기"] },
  { id: "driver-app-install-android", cat: "driver", device: "안드로이드", date: "2026-11-23", title: "기사앱 설치 (안드로이드)",
    desc: "안드로이드 휴대폰에 기사앱을 설치하는 방법이에요.", tags: ["기사앱", "설치", "안드로이드"] },
  { id: "driver-app-install-ios", cat: "driver", device: "아이폰", date: "2026-11-23", title: "기사앱 설치 (아이폰)",
    desc: "아이폰 홈 화면에 기사앱을 추가하는 방법이에요.", tags: ["기사앱", "설치", "아이폰"] },
  { id: "driver-app-login-android", cat: "driver", device: "안드로이드", date: "2026-11-23", title: "기사앱 로그인 (안드로이드)",
    desc: "기사앱에 처음 로그인하는 방법이에요.", tags: ["기사앱", "로그인", "안드로이드"] },
  { id: "driver-app-login-ios", cat: "driver", device: "아이폰", date: "2026-11-23", title: "기사앱 로그인 (아이폰)",
    desc: "아이폰에서 기사앱에 처음 로그인하는 방법이에요.", tags: ["기사앱", "로그인", "아이폰"] },
  { id: "driver-app-order", cat: "driver", device: "기사앱", date: "2026-11-23", title: "기사앱 오더 받기 · 취소 안내",
    desc: "새 오더 승인 / 거절 → 상차완료 → 운송완료까지, 알림이 오면 무엇을 누르는지 알려 줘요.", tags: ["기사앱", "오더", "승인", "거절", "운송완료"] },
  { id: "driver-app-menu", cat: "driver", device: "기사앱", date: "2026-11-23", title: "기사앱 메뉴 설명",
    desc: "기사앱 화면마다 무엇을 하는 곳인지 한 장에 모았어요.", tags: ["기사앱", "메뉴"] },
  { id: "payout-done", cat: "approval", device: "PC · 모바일", date: "2026-11-23", title: "지출결의서 「지급 완료」 처리하는 곳",
    desc: "결재가 모두 끝난 지출결의서에서 지급 완료를 누르는 자리와 순서예요.", tags: ["전자결재", "지출결의서", "지급 완료"] },
  { id: "stamp-image", cat: "approval", device: "PC · 모바일", date: "2026-11-23", title: "결재란에 내 도장 이미지 넣기",
    desc: "도장 사진을 한 번 올려 두면 내가 승인하는 모든 결재 문서에 찍혀요.", tags: ["전자결재", "도장", "서명"] },
  { id: "role-change-pc", cat: "account", device: "PC", date: "2026-11-23", title: "직원 권한 변경 (PC)",
    desc: "직원의 권한(등급)을 바꾸는 방법이에요.", tags: ["권한", "직원", "회원 관리"] },
  { id: "role-change-mobile", cat: "account", device: "모바일", date: "2026-11-23", title: "직원 권한 변경 (모바일)",
    desc: "휴대폰에서 직원 권한을 바꾸는 방법이에요.", tags: ["권한", "직원"] },
  { id: "company-switch-pc", cat: "account", device: "PC", date: "2026-11-24", title: "회사 전환 사용방법 (PC)",
    desc: "여러 회사를 맡은 대표 계정이 로그아웃 없이 회사를 오가는 방법이에요.", tags: ["회사 전환", "여러 회사 계정"] },
  { id: "company-switch-mobile", cat: "account", device: "모바일", date: "2026-11-24", title: "회사 전환 사용방법 (모바일)",
    desc: "휴대폰에서 회사를 오가는 방법이에요.", tags: ["회사 전환", "여러 회사 계정"] },
];

export const guideImage = (g) => `/howto/${g.id}.png`;
export const guideThumb = (g) => `/howto/thumb/${g.id}.jpg`;
export const guideCat = (key) => GUIDE_CATS.find((c) => c.key === key) || GUIDE_CATS[0];

// 검색 — 제목 · 설명 · 태그 · 기기에서 띄어쓰기 무시하고 찾는다
export function filterGuides(list, { cat = "all", q = "" } = {}) {
  const k = String(q || "").replace(/\s+/g, "").toLowerCase();
  return list.filter((g) => (cat === "all" || g.cat === cat)
    && (!k || [g.title, g.desc, g.device, ...(g.tags || [])].join(" ").replace(/\s+/g, "").toLowerCase().includes(k)));
}
