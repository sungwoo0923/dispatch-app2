// ======================= src/orderSkins.js =======================
// 🎨 2026-11-26 오더등록 디자인 시안(스킨) — 최고관리자만 [디자인 변경]으로 돌려 보며 고른다(사용자 요청)
//  · 입력칸 · 버튼 · 기능 · 순서는 그대로 — 화면 모양(색 · 테두리 · 그림자 · 둥글기 · 글씨)만 CSS로 덮어쓴다
//  · 바깥 틀(.of-skin-<id>) 안의 오더등록 카드(.kp-order-card) · 입력 격자(.kp-order-form) · 달력(.kp-order-cal)에만 적용
//  · 이 PC에만 기억(localStorage kpOrderSkin) — 다른 계정 · 다른 PC는 그대로
export const ORDER_SKINS = [
  { id: "base", name: "기본", desc: "지금 쓰는 화면" },
  // 🎨 구성이 바뀌는 시안(src/orderLayouts.jsx) — 입력칸은 그대로, 놓이는 자리 · 카드 · 경로 정보만
  { id: "route", name: "A 루트 보드", desc: "상차 · 하차 카드 나란히 + 가운데 거리 · 시간 · 오른쪽 운임 요약" },
  { id: "sheet", name: "B 섹션 시트", desc: "기본 · 상차 · 하차 · 화물 · 기사 · 운임 묶음 제목 + 4칸씩 정렬" },
  { id: "cockpit", name: "C 3단 콕핏", desc: "왼쪽 상하차 · 가운데 화물 · 기사 · 오른쪽 운임, 어두운 화면" },
  { id: "aurora", name: "D 오로라", desc: "밝은 화면에 은은한 오로라 빛(색만)" },
];
export const nextSkin = (id) => { const i = ORDER_SKINS.findIndex((s) => s.id === id); return ORDER_SKINS[(i + 1) % ORDER_SKINS.length].id; };
export const skinName = (id) => (ORDER_SKINS.find((s) => s.id === id) || ORDER_SKINS[0]).name;

const IN = (r) => `${r} .kp-order-form input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),${r} .kp-order-form textarea`;
const FIELD = (r) => `${r} .kp-order-form > div:not(.col-span-full)`;
const HEAD = (r) => `${r} .kp-order-form > .col-span-full:first-child > div`;

export const ORDER_SKIN_CSS = `
/* ───────── 공통: 부드러운 움직임 ───────── */
.of-skin .kp-order-form > div,.of-skin .kp-order-form input,.of-skin .kp-order-form textarea{transition:background-color .18s,border-color .18s,box-shadow .18s,transform .18s}
@keyframes ofSweep{0%,58%{transform:translateX(-260px) skewX(-20deg)}100%{transform:translateX(1900px) skewX(-20deg)}}
@keyframes ofAurora{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@media (prefers-reduced-motion:reduce){.of-skin *{animation:none!important}}
/* 자동완성 · 드롭다운이 옆 칸 뒤로 숨지 않게 — 누르고 있는 칸을 맨 앞으로 */
.of-skin .kp-order-form > div:focus-within{position:relative;z-index:40}

/* ───────── A 프리미엄 타일 ───────── */
.of-skin-lux .kp-order-card{border:0!important;border-radius:22px!important;background:linear-gradient(180deg,#FFFFFF,#FAFBFE)!important;box-shadow:0 1px 2px rgba(15,26,48,.05),0 18px 40px rgba(15,26,48,.08),inset 0 0 0 1px rgba(214,222,236,.9)!important}
.of-skin-lux .kp-order-card button{border-radius:12px!important}
.of-skin-lux .kp-order-form{background:linear-gradient(180deg,#F6F8FC,#F1F4FA)!important;border:0!important;box-shadow:inset 0 0 0 1px #E4E9F2,0 18px 40px rgba(15,26,48,.07)!important;column-gap:12px!important;row-gap:12px!important;padding-bottom:20px!important}
${FIELD(".of-skin-lux")}{background:#fff;border-radius:14px;padding:9px 9px 5px;box-shadow:0 1px 2px rgba(15,26,48,.05),inset 0 0 0 1px #E7ECF4}
${FIELD(".of-skin-lux")}:hover{box-shadow:0 6px 16px rgba(15,26,48,.07),inset 0 0 0 1px #D9E1EE}
${FIELD(".of-skin-lux")}:focus-within{box-shadow:0 10px 24px rgba(75,108,208,.16),inset 0 0 0 1.5px #4B6CD0}
.of-skin-lux .kp-order-form > div:has(#pickup-place-input){box-shadow:inset 3px 0 0 #7C8CF8,0 1px 2px rgba(15,26,48,.05),inset 0 0 0 1px #E7ECF4}
.of-skin-lux .kp-order-form > div:has(#drop-place-input){box-shadow:inset 3px 0 0 #38BDF8,0 1px 2px rgba(15,26,48,.05),inset 0 0 0 1px #E7ECF4}
${IN(".of-skin-lux")}{border-color:transparent!important;background:transparent!important;box-shadow:none!important;font-weight:700!important}
.of-skin-lux .kp-order-form label{font-size:12px!important;font-weight:800!important;color:#6E7F9F!important;letter-spacing:.01em}
${HEAD(".of-skin-lux")}{background:linear-gradient(120deg,#0B1428,#14244A 55%,#2D4C82)!important;border-radius:0 0 18px 18px}
.of-skin-lux .kp-order-form > .col-span-full:not(:first-child) > div{background:#fff;border-radius:16px;box-shadow:0 1px 2px rgba(15,26,48,.05),inset 0 0 0 1px #E7ECF4}
.of-skin-lux .kp-order-cal{border:0!important;border-radius:22px!important;box-shadow:0 1px 2px rgba(15,26,48,.05),0 18px 40px rgba(15,26,48,.08),inset 0 0 0 1px rgba(214,222,236,.9)!important}

/* ───────── B 클린 시트 ───────── */
.of-skin-clean .kp-order-card{border:1px solid #ECEEF2!important;box-shadow:none!important;border-radius:18px!important;background:#fff!important}
.of-skin-clean .kp-order-card button{box-shadow:none!important;border-radius:10px!important}
.of-skin-clean .kp-order-card button[class*="bg-[#0F1A30]"]{background:#111827!important}
.of-skin-clean .kp-order-card button[class*="bg-white"]{border-color:transparent!important;background:transparent!important;color:#374151!important}
.of-skin-clean .kp-order-card button[class*="bg-white"]:hover{background:#F3F4F6!important}
.of-skin-clean .kp-order-form{background:#fff!important;border:1px solid #ECEEF2!important;box-shadow:none!important;border-radius:18px!important}
${HEAD(".of-skin-clean")}{background:#fff!important;border-bottom:1px solid #F0F1F4}
${HEAD(".of-skin-clean")} > span.absolute{display:none!important}
${HEAD(".of-skin-clean")} span{color:#111827!important}
${HEAD(".of-skin-clean")} span[class*="tracking"]{color:#9CA3AF!important}
${HEAD(".of-skin-clean")} button{background:#F3F4F6!important;color:#111827!important;border-color:#E5E7EB!important;box-shadow:none!important}
${IN(".of-skin-clean")}{border:1px solid #E5E7EB!important;border-radius:10px!important;background:#fff!important;padding-left:10px!important;box-shadow:0 1px 1px rgba(17,24,39,.03)!important}
${IN(".of-skin-clean")}:focus{border-color:#111827!important;box-shadow:0 0 0 4px rgba(17,24,39,.07)!important}
.of-skin-clean .kp-order-form label{font-size:12px!important;font-weight:600!important;color:#6B7280!important}
.of-skin-clean .kp-order-cal{border:1px solid #ECEEF2!important;box-shadow:none!important;border-radius:18px!important}
.of-skin-clean .kp-order-cal > div:first-child{background:#fff!important;border-bottom:1px solid #F0F1F4}
.of-skin-clean .kp-order-cal > div:first-child *{color:#111827!important}

/* ───────── C 다크 콕핏(남는 흰 칸은 다크 지킴이가 바꾼다) ───────── */
.of-skin-dark{background:#070C1C;border-radius:26px;padding:14px;box-shadow:0 24px 60px rgba(3,8,22,.35);color:#E6EDF8}
.of-skin-dark .kp-order-card,.of-skin-dark .kp-order-form,.of-skin-dark .kp-order-cal{background:#0C1631!important;border:1px solid rgba(143,168,255,.16)!important;box-shadow:0 20px 48px rgba(3,8,22,.45),inset 0 1px 0 rgba(255,255,255,.05)!important;color:#E6EDF8}
.of-skin-dark .kp-order-form{position:relative}
.of-skin-dark .kp-order-form::after{content:"";position:absolute;top:-20%;bottom:-20%;left:0;width:140px;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(175,195,255,.06) 45%,rgba(225,232,255,.1) 50%,rgba(175,195,255,.06) 55%,transparent);animation:ofSweep 10s cubic-bezier(.45,.05,.3,1) infinite}
${FIELD(".of-skin-dark")}{background:rgba(255,255,255,.035);border-radius:14px;padding:9px 9px 5px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
${FIELD(".of-skin-dark")}:focus-within{box-shadow:inset 0 0 0 1.5px #8FA8FF,0 0 22px rgba(110,142,255,.25)}
.of-skin-dark .kp-order-form > div:has(#pickup-place-input){box-shadow:inset 3px 0 0 #A78BFA,inset 0 0 0 1px rgba(255,255,255,.07)}
.of-skin-dark .kp-order-form > div:has(#drop-place-input){box-shadow:inset 3px 0 0 #5CC8FF,inset 0 0 0 1px rgba(255,255,255,.07)}
${IN(".of-skin-dark")}{background:transparent!important;border-color:rgba(255,255,255,.12)!important;color:#EEF2FF!important;box-shadow:none!important}
${IN(".of-skin-dark")}::placeholder{color:#5D6E8C!important}
.of-skin-dark .kp-order-form label,.of-skin-dark .kp-order-form label *{color:#93A3C8!important}
.of-skin-dark .kp-order-card button[class*="bg-[#0F1A30]"]{background:linear-gradient(120deg,#6E8EFF,#8B7BF5)!important;box-shadow:0 8px 22px rgba(110,142,255,.4)!important;color:#fff!important}
.of-skin-dark .kp-order-card button[class*="bg-white"]{background:rgba(255,255,255,.06)!important;border-color:rgba(255,255,255,.12)!important;color:#D0D8F0!important}
${HEAD(".of-skin-dark")}{background:linear-gradient(120deg,#060B19,#101E42 60%,#1F3A80)!important}

/* ───────── D 오로라 ───────── */
.of-skin-aurora .kp-order-card,.of-skin-aurora .kp-order-form,.of-skin-aurora .kp-order-cal{border:0!important;border-radius:24px!important;position:relative;isolation:isolate;
  background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#A5B4FC,#67E8F9,#C4B5FD,#93C5FD) border-box!important;background-size:100% 100%,300% 300%!important;border:1.5px solid transparent!important;animation:ofAurora 14s ease-in-out infinite;
  box-shadow:0 20px 50px rgba(99,102,241,.12),0 2px 6px rgba(15,26,48,.05)!important}
.of-skin-aurora .kp-order-form{background:linear-gradient(180deg,#FBFCFF,#F5F7FF) padding-box,linear-gradient(120deg,#A5B4FC,#67E8F9,#C4B5FD,#93C5FD) border-box!important;background-size:100% 100%,300% 300%!important}
.of-skin-aurora .kp-order-form::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;background:radial-gradient(600px 220px at 12% 0%,rgba(129,140,248,.10),transparent 70%),radial-gradient(520px 200px at 92% 100%,rgba(34,211,238,.10),transparent 70%)}
${FIELD(".of-skin-aurora")}{background:rgba(255,255,255,.82);border-radius:16px;padding:9px 9px 5px;box-shadow:inset 0 0 0 1px rgba(165,180,252,.35)}
${FIELD(".of-skin-aurora")}:focus-within{box-shadow:inset 0 0 0 1.5px #818CF8,0 10px 30px rgba(129,140,248,.25)}
${IN(".of-skin-aurora")}{border-color:transparent!important;background:transparent!important;box-shadow:none!important}
.of-skin-aurora .kp-order-form label{font-size:12px!important;font-weight:800!important;color:#4F46E5!important}
${HEAD(".of-skin-aurora")}{background:linear-gradient(120deg,#312E81,#4338CA 40%,#0E7490)!important;background-size:200% 200%!important;animation:ofAurora 12s ease-in-out infinite}
.of-skin-aurora .kp-order-card button[class*="bg-[#0F1A30]"]{background:linear-gradient(120deg,#4F46E5,#0891B2)!important;box-shadow:0 8px 20px rgba(79,70,229,.3)!important}
`;
