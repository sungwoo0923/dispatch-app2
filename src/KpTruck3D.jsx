// ======================= src/KpTruck3D.jsx =======================
// 🚚 입체(3D 느낌) 트럭 — 계정선택 화면·로딩 화면 공용.
//  옆면·윗면·앞면을 다른 밝기로 칠해 입체감을 주고, 유리·헤드라이트·바닥 그림자·바퀴 회전을 넣었다.
//  움직임은 전부 CSS transform이라 저사양 폰에서도 부드럽다.
import React from "react";

let uid = 0;
export default function KpTruck3D({ width = 120, moving = true, beam = true, className = "", style }) {
  const id = React.useMemo(() => `kpt${(uid += 1)}`, []);
  const wheel = (cx) => (
    <g key={cx}>
      <circle cx={cx} cy="50" r="6.4" fill="#070D1A" />
      <g className={moving ? "kpt-spin" : ""} style={{ transformOrigin: `${cx}px 50px` }}>
        <circle cx={cx} cy="50" r="3.6" fill={`url(#${id}rim)`} />
        <path d={`M${cx - 3.4} 50h6.8M${cx} 46.6v6.8`} stroke="#0F1A30" strokeWidth="0.9" />
      </g>
      <circle cx={cx} cy="50" r="1.1" fill="#E8EEF9" />
    </g>
  );
  return (
    <svg width={width} height={width * 0.56} viewBox="0 0 128 72" className={className} style={{ display: "block", overflow: "visible", ...style }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}side`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#C7D3EA" /></linearGradient>
        <linearGradient id={`${id}top`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F4F7FD" /><stop offset="1" stopColor="#DCE5F5" /></linearGradient>
        <linearGradient id={`${id}cab`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B5E9E" /><stop offset="1" stopColor="#1B2B4B" /></linearGradient>
        <linearGradient id={`${id}front`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#24396A" /><stop offset="1" stopColor="#0F1A30" /></linearGradient>
        <linearGradient id={`${id}glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#CFE0FF" /><stop offset="0.5" stopColor="#7FA6E8" /><stop offset="1" stopColor="#2D4C82" /></linearGradient>
        <radialGradient id={`${id}rim`}><stop offset="0" stopColor="#E8EEF9" /><stop offset="1" stopColor="#7F93B8" /></radialGradient>
        <radialGradient id={`${id}shadow`}><stop offset="0" stopColor="#000" stopOpacity="0.55" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}beam`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#CFE0FF" stopOpacity="0.55" /><stop offset="1" stopColor="#CFE0FF" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}glow`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6E95E8" stopOpacity="0" /><stop offset="0.5" stopColor="#8FB0F0" stopOpacity="0.9" /><stop offset="1" stopColor="#6E95E8" stopOpacity="0" /></linearGradient>
      </defs>
      <style>{`
        @keyframes kptSpin { to { transform: rotate(360deg); } }
        @keyframes kptBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-0.7px); } }
        .kpt-spin { animation: kptSpin .45s linear infinite; }
        .kpt-bob { animation: kptBob .38s ease-in-out infinite; }
      `}</style>

      {/* 바닥 그림자 + 아래 빛줄 */}
      <ellipse cx="60" cy="57" rx="56" ry="5" fill={`url(#${id}shadow)`} />
      <rect x="6" y="57.5" width="104" height="1.2" rx="0.6" fill={`url(#${id}glow)`} />
      {beam && <path d="M112 38 L128 33 L128 47 L112 43 Z" fill={`url(#${id}beam)`} />}

      <g className={moving ? "kpt-bob" : ""}>
        {/* 짐칸 — 윗면 / 옆면 / 로고 띠 */}
        <path d="M6 16 L16 9 L84 9 L74 16 Z" fill={`url(#${id}top)`} />
        <rect x="6" y="16" width="68" height="30" rx="1.6" fill={`url(#${id}side)`} />
        <path d="M74 16 L84 9 V39 L74 46 Z" fill="#AEBEDB" />
        <rect x="6" y="38" width="68" height="2.6" fill="#1B2B4B" />
        <rect x="6" y="40.6" width="68" height="1" fill="#6E95E8" />
        <text x="12" y="31" fontSize="8.5" fontWeight="900" letterSpacing="1.4" fill="#1B2B4B" fontFamily="'JetBrains Mono','SF Mono',ui-monospace,monospace">KP-FLOW</text>
        <rect x="12" y="33.5" width="22" height="1.3" rx="0.6" fill="#4B6CB7" />

        {/* 운전석 — 옆면 / 윗면 / 앞면 / 유리 */}
        <path d="M76 22 H94 L101 31 V46 H76 Z" fill={`url(#${id}cab)`} />
        <path d="M76 22 L85 16 H103 L94 22 Z" fill="#4A6CAE" />
        <path d="M94 22 L103 16 L110 25 V40 L101 46 V31 Z" fill={`url(#${id}front)`} />
        <path d="M80 25 H92.6 L98 31.6 H80 Z" fill={`url(#${id}glass)`} />
        <path d="M81.5 26.2 H86 L84 30.4 H81.5 Z" fill="#fff" opacity="0.55" />
        <path d="M95.5 23.5 L102.5 18.8 L107.6 25.4 L100.6 30.2 Z" fill={`url(#${id}glass)`} opacity="0.85" />
        <rect x="88" y="34" width="5" height="1.2" rx="0.6" fill="#8FB0F0" />
        {/* 헤드라이트 */}
        <path d="M105.5 36.2 L109.6 33.4 V36.6 L105.5 39.4 Z" fill="#FFFFFF" />
        <circle cx="107.6" cy="36.4" r="3.2" fill="#CFE0FF" opacity="0.35" />

        {/* 차대 */}
        <rect x="6" y="46" width="96" height="3" rx="1" fill="#0B1222" />
        <path d="M101 46 L110 40 V43 L102 49 Z" fill="#070D1A" />
        {[20, 34, 90].map(wheel)}
      </g>
    </svg>
  );
}
