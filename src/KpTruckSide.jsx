// ======================= src/KpTruckSide.jsx =======================
// 🚚 2026-11-14 옆모습 트럭(사진 트럭을 프로그램용으로 다시 그림) — 로딩 화면 · 계정 선택 화면
//  · 짐칸 가로 골판 · 로고 판 · 큰 창 운전석 · 검은 차대 · 바퀴(휠 회전)를 사진 비율대로
//  · design: "white"(사진 그대로 흰 차) | "navy"(흰 짐칸 + 남색 로고 판 · 남색 운전석) | "dark"(어두운 화면에 맞춘 남색 메탈) | "line"(빛나는 선)
//  · 🎲 design="random"(기본): 새로고침 · 로그인 화면이 열릴 때마다 A~D 중 하나 — 바로 전에 나온 것은 피한다(사용자 요청)
//  · 움직임은 CSS transform 만(저사양 폰에서도 부드럽게)
import React from "react";

const WM_LIGHT = "/brand/logisweb-wordmark-light.png";
const WM_DARK = "/brand/logisweb-wordmark-dark.png";
const WM_RATIO = 8.0256;

const THEMES = {
  white: {
    box: ["#FFFFFF", "#D5D9E0"], rib: "rgba(120,128,142,0.28)", ribHi: "rgba(255,255,255,0.9)", post: "#C9CED6", cap: "#EEF0F3",
    panel: "#E6E8EC", panelEdge: "#C3C8D0", wm: WM_DARK,
    cab: ["#FFFFFF", "#CDD2DA"], cabEdge: "#AEB4BE", glass: ["#9DB0CE", "#3A4A66"], door: "rgba(90,98,112,0.45)",
    chassis: "#141922", stripe: null, beam: false, glow: false,
  },
  navy: {
    box: ["#FFFFFF", "#C7D3EA"], rib: "rgba(75,108,183,0.22)", ribHi: "rgba(255,255,255,0.85)", post: "#B9C7E2", cap: "#F1F5FC",
    panel: "#0F1A30", panelEdge: "#4B6CB7", wm: WM_LIGHT,
    cab: ["#3B5E9E", "#1B2B4B"], cabEdge: "#4A6CAE", glass: ["#CFE0FF", "#2D4C82"], door: "rgba(207,224,255,0.28)",
    chassis: "#0B1222", stripe: ["#1B2B4B", "#6E95E8"], beam: true, glow: false,
  },
  dark: {
    box: ["#2A3F6B", "#121D36"], rib: "rgba(143,176,240,0.16)", ribHi: "rgba(143,176,240,0.10)", post: "#1A2A4C", cap: "#3B5590",
    panel: "rgba(6,13,28,0.55)", panelEdge: "rgba(143,176,240,0.55)", wm: WM_LIGHT,
    cab: ["#33528E", "#14213E"], cabEdge: "#5B7FC9", glass: ["#CFE0FF", "#2D4C82"], door: "rgba(143,176,240,0.30)",
    chassis: "#050A15", stripe: ["#0F1A30", "#8FB0F0"], beam: true, glow: true,
  },
  line: {
    box: ["rgba(143,176,240,0.10)", "rgba(143,176,240,0.03)"], rib: "rgba(143,176,240,0.22)", ribHi: "transparent", post: "rgba(143,176,240,0.35)", cap: "rgba(143,176,240,0.25)",
    panel: "rgba(6,13,28,0.6)", panelEdge: "#8FB0F0", wm: WM_LIGHT,
    cab: ["rgba(143,176,240,0.14)", "rgba(143,176,240,0.04)"], cabEdge: "#8FB0F0", glass: ["rgba(207,224,255,0.55)", "rgba(110,149,232,0.15)"], door: "rgba(143,176,240,0.45)",
    chassis: "rgba(143,176,240,0.5)", stripe: null, beam: true, glow: true, outline: "#8FB0F0",
  },
};

const KEYS = ["white", "navy", "dark", "line"];
export function pickTruckDesign() {
  let last = ""; try { last = localStorage.getItem("kpTruckLast") || ""; } catch { /* 무시 */ }
  const pool = KEYS.filter((k) => k !== last);
  const k = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem("kpTruckLast", k); } catch { /* 무시 */ }
  return k;
}

let uid = 0;
export default function KpTruckSide({ width = 160, design: designProp = "random", moving = true, beam: beamProp, className = "", style }) {
  const id = React.useMemo(() => `kps${(uid += 1)}`, []);
  const [design] = React.useState(() => (designProp === "random" ? pickTruckDesign() : designProp));
  const T = THEMES[design] || THEMES.navy;
  const beam = beamProp ?? T.beam;
  const ol = T.outline;
  const sw = ol ? { stroke: ol, strokeWidth: 1.1 } : {};
  const ribs = [];
  for (let y = 19; y <= 65; y += 3.2) ribs.push(y);

  const wheel = (cx) => (
    <g key={cx}>
      <circle cx={cx} cy="80" r="12.5" fill={ol ? "rgba(6,13,28,0.9)" : "#0C0F15"} {...(ol ? { stroke: ol, strokeWidth: 1.2 } : {})} />
      <circle cx={cx} cy="80" r="10.2" fill="none" stroke={ol ? "rgba(143,176,240,0.35)" : "#232833"} strokeWidth="1.1" />
      <g className={moving ? "kps-spin" : ""} style={{ transformOrigin: `${cx}px 80px` }}>
        <circle cx={cx} cy="80" r="6.6" fill={ol ? "rgba(143,176,240,0.18)" : `url(#${id}rim)`} {...(ol ? { stroke: ol, strokeWidth: 0.9 } : {})} />
        {[0, 72, 144, 216, 288].map((a) => {
          const r = (a * Math.PI) / 180;
          return <circle key={a} cx={cx + Math.cos(r) * 3.9} cy={80 + Math.sin(r) * 3.9} r="0.95" fill={ol ? ol : "#5A6476"} />;
        })}
        <path d={`M${cx - 6} 80h12`} stroke={ol ? ol : "#8C96A8"} strokeWidth="0.6" opacity="0.5" />
      </g>
      <circle cx={cx} cy="80" r="1.8" fill={ol ? ol : "#2B313C"} />
    </g>
  );

  return (
    <svg width={width} height={width * 0.5} viewBox="0 0 200 100" className={className} style={{ display: "block", overflow: "visible", ...style }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}box`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T.box[0]} /><stop offset="1" stopColor={T.box[1]} /></linearGradient>
        <linearGradient id={`${id}cab`} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor={T.cab[0]} /><stop offset="1" stopColor={T.cab[1]} /></linearGradient>
        <linearGradient id={`${id}glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={T.glass[0]} /><stop offset="1" stopColor={T.glass[1]} /></linearGradient>
        <radialGradient id={`${id}rim`} cx="0.4" cy="0.35"><stop offset="0" stopColor="#F2F4F7" /><stop offset="1" stopColor="#8E97A6" /></radialGradient>
        <radialGradient id={`${id}shadow`}><stop offset="0" stopColor="#000" stopOpacity="0.5" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}beam`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#CFE0FF" stopOpacity="0.55" /><stop offset="1" stopColor="#CFE0FF" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}glow`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6E95E8" stopOpacity="0" /><stop offset="0.5" stopColor="#8FB0F0" stopOpacity="0.9" /><stop offset="1" stopColor="#6E95E8" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}sheen`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`${id}boxclip`}><rect x="6" y="14" width="126" height="55" rx="2.4" /></clipPath>
      </defs>
      <style>{`
        @keyframes kpsSpin { to { transform: rotate(360deg); } }
        @keyframes kpsBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-0.8px); } }
        .kps-spin { animation: kpsSpin .5s linear infinite; }
        .kps-bob { animation: kpsBob .4s ease-in-out infinite; }
      `}</style>

      {/* 바닥 그림자 · 빛줄 · 헤드라이트 빛 */}
      <ellipse cx="100" cy="93" rx="96" ry="5.5" fill={`url(#${id}shadow)`} />
      {T.glow && <rect x="8" y="93" width="180" height="1.4" rx="0.7" fill={`url(#${id}glow)`} />}
      {beam && <path d="M193 57 L222 50 L222 70 L193 63 Z" fill={`url(#${id}beam)`} />}

      <g className={moving ? "kps-bob" : ""}>
        {/* 차대 · 뒤 범퍼 · 연료통 */}
        <rect x="4" y="67" width="184" height="6" rx="1.2" fill={T.chassis} />
        <rect x="0" y="71" width="16" height="5" rx="1" fill={T.chassis} />
        <rect x="94" y="72" width="30" height="10" rx="1.6" fill={T.chassis} {...(ol ? { fill: "rgba(6,13,28,0.9)", ...sw } : {})} />

        {/* 짐칸 */}
        <rect x="6" y="14" width="126" height="55" rx="2.4" fill={`url(#${id}box)`} {...sw} />
        <g clipPath={`url(#${id}boxclip)`}>
          {ribs.map((y) => (
            <g key={y}>
              <rect x="6" y={y} width="126" height="0.7" fill={T.rib} />
              <rect x="6" y={y + 0.7} width="126" height="0.5" fill={T.ribHi} />
            </g>
          ))}
          <rect x="6" y="14" width="126" height="3.4" fill={T.cap} />
          <rect x="6" y="14" width="3.2" height="55" fill={T.post} />
          <rect x="128.8" y="14" width="3.2" height="55" fill={T.post} />
          {T.stripe && <><rect x="6" y="62.5" width="126" height="3" fill={T.stripe[0]} /><rect x="6" y="65.5" width="126" height="1.1" fill={T.stripe[1]} /></>}
          {!ol && <rect x="6" y="14" width="126" height="55" fill={`url(#${id}sheen)`} opacity="0.6" />}
        </g>
        {/* 로고 판 + 글자 로고 */}
        <rect x="16" y="26" width="106" height="28" rx="2.4" fill={T.panel} stroke={T.panelEdge} strokeWidth={ol ? 1 : 1.2} />
        {T.glow && <rect x="16" y="26" width="106" height="28" rx="2.4" fill="none" stroke="#8FB0F0" strokeOpacity="0.25" strokeWidth="3" />}
        <image href={T.wm} x="24" y={40 - 90 / WM_RATIO / 2} width="90" height={90 / WM_RATIO} preserveAspectRatio="xMidYMid meet" />

        {/* 운전석 */}
        <path d="M134 74 V31 Q134 26 139 26 H160 Q164 26 166.5 29.5 L178 46 L188 49.5 Q193 51.5 193 57 V70 Q193 74 189 74 Z" fill={`url(#${id}cab)`} stroke={ol || T.cabEdge} strokeWidth={ol ? 1.1 : 0.7} />
        <path d="M144 31 H159.5 Q161.6 31 162.8 32.8 L172.5 47 H144 Z" fill={`url(#${id}glass)`} />
        <path d="M146.5 33 H152 L148.8 44.5 H146.5 Z" fill="#fff" opacity="0.4" />
        <path d="M141.5 29 V72 M176 47.5 V72 M141.5 72 H176" fill="none" stroke={T.door} strokeWidth="0.8" />
        <rect x="144.5" y="52" width="7" height="2.2" rx="1.1" fill={ol ? ol : T.door} />
        <rect x="174" y="38" width="2.4" height="8" rx="1" fill={ol ? ol : T.chassis} opacity="0.85" />
        {T.stripe && <rect x="134" y="62.5" width="59" height="1.6" fill={T.stripe[1]} opacity="0.85" />}
        {/* 헤드라이트 · 앞 범퍼 */}
        <rect x="188.5" y="55" width="4.5" height="6.5" rx="1.4" fill="#FFFFFF" />
        <circle cx="191" cy="58.3" r="4.6" fill="#CFE0FF" opacity={beam ? 0.4 : 0.15} />
        <rect x="180" y="70" width="15" height="5" rx="1.4" fill={T.chassis} />
        {/* 바퀴 아치 */}
        <path d="M146 74 Q146 63.5 160 63.5 Q174 63.5 174 74" fill={ol ? "rgba(6,13,28,0.85)" : T.chassis} {...(ol ? sw : {})} />
        <path d="M34 74 Q34 64 48 64 Q62 64 62 74" fill={ol ? "rgba(6,13,28,0.85)" : T.chassis} {...(ol ? sw : {})} />
        {[48, 160].map(wheel)}
      </g>
    </svg>
  );
}

export const TRUCK_DESIGNS = [
  { key: "white", label: "A · 실사 화이트", desc: "사진 그대로 흰 트럭 · 밝은 로고 판" },
  { key: "navy", label: "B · 브랜드 네이비", desc: "흰 짐칸 + 남색 로고 판 · 남색 운전석" },
  { key: "dark", label: "C · 다크 메탈", desc: "어두운 로딩 화면에 녹아드는 남색 차체" },
  { key: "line", label: "D · 라인 글로우", desc: "빛나는 선으로만 그린 가벼운 트럭" },
];
