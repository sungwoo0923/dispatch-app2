// 인사관리부 / 회원관리 공용 상수 — 직책, 팀 구분
export const POSITION_OPTIONS = [
  "사원", "주임", "대리", "과장", "차장", "부장", "이사", "대표이사", "팀장", "파트장", "인턴",
];

export const TEAM_OPTIONS = [
  "운영팀", "운송팀", "경리/회계팀", "개발팀", "법무팀", "인사팀",
];

// 팀 배지는 알록달록한 색 대신 프로그램 톤(네이비/그레이)에 맞춘 단일 톤으로 통일
export const TEAM_BADGE_CLASS = "bg-[#1B2B4B]/5 text-[#1B2B4B] border-[#1B2B4B]/15";
export const TEAM_BADGE_CLASS_UNASSIGNED = "bg-gray-100 text-gray-400 border-gray-200";

export const EMPLOYMENT_STATUS_OPTIONS = ["재직", "휴직", "퇴사"];
