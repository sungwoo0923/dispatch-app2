// 📈 2026-11-08 임원 화면 새 메뉴(경영 분석 · 결재 대기 · 직원 정보) — PC 상단 메뉴 이름(키) ↔ 보이는 글자
//  보이는 사람: 임원 화면(deptMode "exec" · 기존 임원 판정 isExec 그대로). 다른 역할 메뉴에는 넣지 않는다.
export const EXEC_MENUS = ["경영분석", "결재대기", "직원정보"];
export const EXEC_MENU_LABEL = { 경영분석: "경영 분석", 결재대기: "결재 대기", 직원정보: "직원 정보" };
export const execMenuLabel = (m, fallback) => EXEC_MENU_LABEL[m] || fallback || m;
