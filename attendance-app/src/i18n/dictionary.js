// 모바일 근로자 화면의 다국어 지원 사전. 관리자(PC)쪽은 한국인 담당자가
// 쓰는 것을 전제로 번역 대상에서 제외했다. 지금은 하단 탭/헤더/체크 홈
// 화면까지 영어 번역을 넣었고, 나머지 화면은 이 구조를 그대로 확장해
// 이어서 채워나갈 수 있다 — dictionary에 언어를 하나 더 추가하려면
// SUPPORTED_LANGUAGES에 항목을 넣고 아래 두 사전과 동일한 키를 채우면 된다.
export const SUPPORTED_LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];

export const DICTIONARY = {
  ko: {
    "nav.workInfo": "근무정보",
    "nav.history": "출근현황",
    "nav.check": "체크",
    "nav.board": "공지사항",
    "nav.myInfo": "내정보",
    "layout.greeting": "안녕하세요",
    "layout.nameSuffix": "{{name}}님",
    "myInfo.language": "언어 설정",
    "home.checkedInAt": "출근완료 · {{time}}",
    "home.checkedOutSuffix": " · 퇴근 {{time}}",
    "home.checkInHint": "근무지 반경 {{radius}}m 이내에서 출근 버튼을 눌러주세요",
    "home.noConfirmedSchedule": "관리자가 오늘 출근확정 처리한 스케줄이 없습니다",
    "home.checkIn": "출근",
    "home.checkOut": "퇴근",
    "home.workSiteInfo": "근무지 정보",
    "home.distanceLabel": "현재 위치까지 약 {{distance}}m",
    "home.inRadius": "반경 안",
    "home.outOfRadius": "반경 밖",
    "home.loadingLocation": "불러오는 중...",
  },
  en: {
    "nav.workInfo": "Work Info",
    "nav.history": "Attendance",
    "nav.check": "Check",
    "nav.board": "Notices",
    "nav.myInfo": "My Info",
    "layout.greeting": "Hello",
    "layout.nameSuffix": "{{name}}",
    "myInfo.language": "Language",
    "home.checkedInAt": "Checked in · {{time}}",
    "home.checkedOutSuffix": " · Out {{time}}",
    "home.checkInHint": "Tap Check In within {{radius}}m of your work site",
    "home.noConfirmedSchedule": "No schedule confirmed for today",
    "home.checkIn": "Check In",
    "home.checkOut": "Check Out",
    "home.workSiteInfo": "Work Site Info",
    "home.distanceLabel": "About {{distance}}m from current location",
    "home.inRadius": "In range",
    "home.outOfRadius": "Out of range",
    "home.loadingLocation": "Loading...",
  },
};
