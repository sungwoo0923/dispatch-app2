// ======================= src/fleetGradesCore.js =======================
// 🚛 2026-11-12 지입차 구분(기사관리 등급) 한 곳 — 예전에는 ["지입", "직영", "임대"]가 화면마다 따로 적혀 있었다.
//  · 기본 구분: 지입 · 직영 · 임대 (모든 회사)
//  · 회사 전용 구분: 분양 — 회사 설정(companySettings/{회사}.fleetGrades)에 있는 회사만 선택 목록에 보인다
//    (운송사 일괄 이전 때 시트의 "분양" 차량이 있으면 그 회사 설정에 넣는다 · src/CarrierMigratePanel.jsx)
//  · 지입차로 볼지(isFleetGrade)는 회사와 상관없이 같다 — 분양 등급 기사는 그 회사에만 있으므로 다른 회사 화면은 그대로
//  이 파일은 import가 없다(테스트 · 서버 계산 파일에서도 읽음). 화면용 훅은 src/fleetGrades.jsx
export const BASE_FLEET_GRADES = ["지입", "직영", "임대"];
export const COMPANY_FLEET_GRADES = ["분양"];
export const FLEET_GRADES = [...BASE_FLEET_GRADES, ...COMPANY_FLEET_GRADES];
export const isFleetGrade = (g) => FLEET_GRADES.includes(String(g ?? "").trim());
