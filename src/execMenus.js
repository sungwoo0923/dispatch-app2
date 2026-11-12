import { bizMenuLabel } from "./bizModules"; // 🧭 2026-11-12 업무 영역 메뉴("biz:container:new" → "오더등록")
// 📈 2026-11-08 임원 화면 새 메뉴(경영 분석 · 결재 대기 · 직원 정보) — PC 상단 메뉴 이름(키) ↔ 보이는 글자
//  보이는 사람: 임원 화면(deptMode "exec" · 기존 임원 판정 isExec 그대로). 다른 역할 메뉴에는 넣지 않는다.
export const EXEC_MENUS = ["경영분석", "결재대기", "직원정보"];
export const EXEC_MENU_LABEL = { 경영분석: "경영 분석", 결재대기: "결재 대기", 직원정보: "직원 정보" };
// 🏷 2026-11-10 보이는 이름만 바꾼 메뉴 — 키("배차관리")는 권한·저장된 설정·바로가기가 그대로 쓰므로 바꾸지 않는다
export const MENU_DISPLAY = { 배차관리: "오더등록" };
export const menuName = (m) => EXEC_MENU_LABEL[m] || MENU_DISPLAY[m] || bizMenuLabel(m) || m;
export const execMenuLabel = (m, fallback) => EXEC_MENU_LABEL[m] || MENU_DISPLAY[m] || bizMenuLabel(m) || fallback || m;
