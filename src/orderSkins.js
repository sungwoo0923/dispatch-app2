// ======================= src/orderSkins.js =======================
// 🎨 2026-11-27 오더등록 화면 모양 — 사용자 결정: "오더등록은 지금 기본으로만 쓰자" → 모든 계정 기본 입력창 · [디자인 변경] 버튼도 끔(SKIN_SWITCH)
//  · A 루트 보드 코드(src/orderLayouts.jsx)는 남겨 둠 — 다시 쓰려면 SKIN_SWITCH = true · DEFAULT_SKIN = "route"
//  · 최고관리자만 [디자인 변경]으로 A 루트 보드 ↔ 예전 기본 입력창을 오갈 수 있다(이 기기에만 기억 — localStorage kpOrderSkin)
//  · 입력칸 · 버튼 · 기능 · 순서는 그대로 — 놓이는 자리 · 카드 · 경로 정보만 바뀐다
//  · (2026-11-26에 돌려 본 B 섹션 시트 · C 3단 콕핏 · D 오로라는 A로 정해져 뺐다)
export const ORDER_SKINS = [
  { id: "k", name: "K 카드형", desc: "상차 · 하차 카드 + 화물 · 운행 옵션 · 기타 + 기사 · 운임 · 메모 카드, 달력은 입력창 안(2026-11-27 사용자 확정)" },
  { id: "route", name: "A 루트 보드", desc: "상차 · 하차 카드 나란히 + 가운데 거리 · 시간 · 오른쪽 운임 요약" },
  { id: "base", name: "기본 입력창", desc: "예전 입력창" },
];
export const SKIN_SWITCH = false;
export const DEFAULT_SKIN = "k"; // 🎨 2026-11-27 사용자 확정 — 시안 K 를 모든 계정 기본으로
export const cleanSkin = (id) => (ORDER_SKINS.some((s) => s.id === id) ? id : DEFAULT_SKIN);
export const nextSkin = (id) => { const i = ORDER_SKINS.findIndex((s) => s.id === cleanSkin(id)); return ORDER_SKINS[(i + 1) % ORDER_SKINS.length].id; };
export const skinName = (id) => (ORDER_SKINS.find((s) => s.id === cleanSkin(id)) || ORDER_SKINS[0]).name;
// 지금 쓸 모양 — 최고관리자는 고른 것, 다른 계정은 늘 A
export const readSkin = (allowed) => { if (!allowed) return DEFAULT_SKIN; try { return cleanSkin(localStorage.getItem("kpOrderSkin")); } catch { return DEFAULT_SKIN; } };
export const saveSkin = (id) => { try { localStorage.setItem("kpOrderSkin", id); } catch { /* 무시 */ } };

export const ORDER_SKIN_CSS = `
.of-skin .kp-order-form > div,.of-skin .kp-order-form input,.of-skin .kp-order-form textarea{transition:background-color .18s,border-color .18s,box-shadow .18s}
/* 자동완성 · 드롭다운이 옆 칸 뒤로 숨지 않게 — 누르고 있는 칸을 맨 앞으로 */
.of-skin .kp-order-form > div:focus-within{position:relative;z-index:40}
`;
