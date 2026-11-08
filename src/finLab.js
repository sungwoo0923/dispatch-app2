// 🧪 2026-11-08 경리 시범 기능 스위치 — 전표·재무제표 · 자금 예측은 테스트운송사에서만 보인다(다른 운송사는 실무 중)
//  메뉴만 판단하는 가벼운 파일(무거운 화면 src/FinanceLab.jsx는 열 때 불러온다)
export const FIN_LAB_COMPANY = "테스트운송사";
export const finLabOn = (company) => String(company || "").trim() === FIN_LAB_COMPANY;
