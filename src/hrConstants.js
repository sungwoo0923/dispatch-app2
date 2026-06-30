// 인사관리부 / 회원관리 공용 상수 — 직책, 팀 구분
export const POSITION_OPTIONS = [
  "사원", "주임", "대리", "과장", "차장", "부장", "이사", "대표이사", "팀장", "파트장", "인턴",
];

export const TEAM_OPTIONS = [
  "운영팀", "운송팀", "경리/회계팀", "개발팀", "법무팀", "인사팀",
];

export const TEAM_COLORS = {
  "운영팀": "bg-blue-50 text-blue-700 border-blue-200",
  "운송팀": "bg-amber-50 text-amber-700 border-amber-200",
  "경리/회계팀": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "개발팀": "bg-violet-50 text-violet-700 border-violet-200",
  "법무팀": "bg-rose-50 text-rose-700 border-rose-200",
  "인사팀": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "미배정": "bg-gray-100 text-gray-500 border-gray-200",
};
