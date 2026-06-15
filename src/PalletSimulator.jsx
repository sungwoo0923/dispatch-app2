import React, { useState, useMemo } from "react";

const PALLET_SIZES = [
  { id: "08x12", label: "0.8 × 1.2m", w: 0.8, d: 1.2 },
  { id: "10x12", label: "1.0 × 1.2m", w: 1.0, d: 1.2 },
  { id: "11x11", label: "1.1 × 1.1m", w: 1.1, d: 1.1 },
  { id: "12x11", label: "1.2 × 1.1m", w: 1.2, d: 1.1 },
  { id: "13x11", label: "1.3 × 1.1m", w: 1.3, d: 1.1 },
];

const TRUCKS = [
  { id: "1ton",    name: "1톤",       L: 2.8,  W: 1.50, maxKg: 1000,  wc: 1 },
  { id: "2.5ton",  name: "2.5톤",     L: 4.5,  W: 1.90, maxKg: 2500,  wc: 1 },
  { id: "3.5ton",  name: "3.5톤",     L: 5.2,  W: 2.10, maxKg: 3500,  wc: 2 },
  { id: "3.5tonW", name: "3.5톤광폭", L: 5.2,  W: 2.35, maxKg: 3800,  wc: 2 },
  { id: "5ton",    name: "5톤",       L: 6.2,  W: 2.35, maxKg: 5000,  wc: 2 },
  { id: "5tonP",   name: "5톤+",      L: 7.4,  W: 2.35, maxKg: 5500,  wc: 2 },
  { id: "11ton",   name: "11톤",      L: 9.1,  W: 2.35, maxKg: 11000, wc: 3 },
  { id: "18ton",   name: "18톤",      L: 10.1, W: 2.40, maxKg: 18000, wc: 3 },
  { id: "25ton",   name: "25톤",      L: 11.2, W: 2.45, maxKg: 25000, wc: 3 },
  { id: "trailer", name: "추레라",    L: 13.6, W: 2.45, maxKg: 27000, wc: 3 },
];

function calcFit(truckL, truckW, pw, pd, mode) {
  const f = (l, w, a, b) => ({
    cols: Math.floor(w / a), rows: Math.floor(l / b),
    count: Math.floor(w / a) * Math.floor(l / b), pw: a, pd: b,
  });
  const a = f(truckL, truckW, pw, pd);
  const b = f(truckL, truckW, pd, pw);
  if (mode === "최적") return a.count >= b.count ? a : b;
  if (a.count >= b.count) {
    const ex = f(truckL - a.rows * a.pd, truckW, pd, pw);
    return { ...a, count: a.count + ex.count, mixed: ex.count > 0 ? { ...ex, offsetL: a.rows * a.pd } : null };
  } else {
    const ex = f(truckL - b.rows * b.pd, truckW, pw, pd);
    return { ...b, count: b.count + ex.count, mixed: ex.count > 0 ? { ...ex, offsetL: b.rows * b.pd } : null };
  }
}

// ── 트럭 측면뷰 SVG ────────────────────────────────────────────────────────
// 참고 이미지(다불러) 스타일: 좌=캡, 우=화물칸, 약간 입체감
function TruckSideView({ truck, fit, palletD, stacking, bodyType, palletCount }) {
  const W = 900, H = 320;
  const groundY = 294;

  // 트럭 사이즈별 치수
  const isLg = truck.maxKg >= 11000;
  const isSm = truck.maxKg <= 2500;
  const wheelR  = isSm ? 22 : isLg ? 36 : 29;
  const cabW    = isSm ? 128 : isLg ? 198 : 162;
  const cabH    = isSm ? 140 : isLg ? 198 : 168;
  const cabX    = 28;
  const cabEndX = cabX + cabW;

  // 화물칸
  const axleY     = groundY - wheelR;
  const flatTopY  = axleY - wheelR - 2;   // 화물칸 바닥 상단
  const flatH     = 18;                    // 바닥 두께
  const flatStartX = cabEndX - 14;
  const flatEndX  = W - 20;
  const flatPx    = flatEndX - flatStartX;
  const scale     = flatPx / truck.L;

  // 윙바디
  const isWing   = bodyType === "윙바디";
  const layers   = stacking === "2단" ? 2 : 1;
  const singleH  = Math.min(isSm ? 76 : 108, flatTopY - (groundY - cabH) - 10);
  const cargoH   = singleH * (stacking === "2단" ? 1.85 : 1);
  const cargoTopY = flatTopY - cargoH;

  // 파렛 위치 계산 (측면에서 보면 row = 길이방향)
  const palLayerH = (singleH - 8) / layers;
  const depthPx   = fit.pd * scale;

  const pallets = [];
  let cnt = 0;
  for (let layer = 0; layer < layers && cnt < palletCount; layer++) {
    for (let r = 0; r < fit.rows && cnt < palletCount; r++) {
      const px = flatStartX + 8 + r * (depthPx + 1);
      if (px + depthPx > flatEndX - 4) break;
      pallets.push({ x: px, y: flatTopY - (layer + 1) * (palLayerH + 3) - 2, w: depthPx - 1, h: palLayerH });
      cnt++;
    }
    if (fit.mixed) {
      const m = fit.mixed;
      const md = m.pd * scale;
      for (let r = 0; r < m.rows && cnt < palletCount; r++) {
        const px = flatStartX + 8 + m.offsetL * scale + r * (md + 1);
        if (px + md > flatEndX - 4) break;
        pallets.push({ x: px, y: flatTopY - (layer + 1) * (palLayerH + 3) - 2, w: md - 1, h: palLayerH });
        cnt++;
      }
    }
  }

  // 바퀴 위치
  const frontWheelX = cabX + cabW * 0.66;
  const rearCnt = truck.wc;
  const rearWheels = Array.from({ length: rearCnt }, (_, i) =>
    flatStartX + flatPx * (rearCnt === 1 ? 0.52 : rearCnt === 2 ? (i === 0 ? 0.36 : 0.68) : (0.24 + i * 0.27))
  );

  const Wheel = ({ cx }) => {
    const cy = axleY;
    return (
      <g>
        <circle cx={cx} cy={cy} r={wheelR} fill="#1c1c1c"/>
        <circle cx={cx} cy={cy} r={wheelR * 0.63} fill="#3a3a3a"/>
        <circle cx={cx} cy={cy} r={wheelR * 0.23} fill="#888"/>
        {[0, 60, 120, 180, 240, 300].map(d => {
          const r2 = d * Math.PI / 180;
          return <circle key={d} cx={cx + Math.cos(r2) * wheelR * 0.43} cy={cy + Math.sin(r2) * wheelR * 0.43} r={wheelR * 0.085} fill="#aaa"/>;
        })}
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ userSelect: "none" }}>
      <defs>
        <linearGradient id="cabGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d6dae4"/><stop offset="100%" stopColor="#a0a6b4"/>
        </linearGradient>
        <linearGradient id="flatGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8cbcc"/><stop offset="100%" stopColor="#989c9c"/>
        </linearGradient>
        <linearGradient id="palGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f87171"/><stop offset="45%" stopColor="#dc2626"/><stop offset="100%" stopColor="#991b1b"/>
        </linearGradient>
        <filter id="dropS" x="-5%" y="-5%" width="110%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1B2B4B" floodOpacity="0.18"/>
        </filter>
      </defs>

      {/* 그림자 */}
      <ellipse cx={flatStartX + flatPx * 0.45 + 40} cy={groundY + 16} rx={flatPx * 0.52 + 70} ry={13} fill="rgba(0,0,0,0.1)"/>

      {/* ── 화물칸 바닥 ── */}
      <rect x={flatStartX - 8} y={flatTopY} width={flatPx + 9} height={flatH} fill="url(#flatGrad)" rx={2}/>
      <rect x={flatStartX - 8} y={flatTopY} width={flatPx + 9} height={4} fill="rgba(255,255,255,0.32)"/>
      {/* 크로스 멤버 */}
      {Array.from({ length: Math.min(10, Math.ceil(flatPx / 62)) }).map((_, i) => {
        const x = flatStartX + 6 + i * ((flatPx - 12) / Math.max(1, Math.ceil(flatPx / 62) - 1));
        return <rect key={i} x={x} y={flatTopY + 4} width={3} height={flatH - 5} fill="#8a8e8e" rx={1}/>;
      })}
      {/* 상단 레일 */}
      <rect x={flatStartX + 5} y={flatTopY - 11} width={flatPx - 10} height={4} fill="#b0b4b4" rx={1}/>
      {/* 앞 벌크헤드 */}
      <rect x={flatStartX - 2} y={cargoTopY} width={10} height={flatTopY - cargoTopY} fill="#7a8090" rx={1}/>

      {/* ── 윙바디 프레임 ── */}
      {isWing && (
        <>
          <rect x={flatStartX + 8} y={cargoTopY} width={flatPx - 16} height={cargoH}
            fill="rgba(27,43,75,0.03)" stroke="#1B2B4B" strokeWidth="1.6" rx={2}/>
          {/* 지붕 */}
          <rect x={flatStartX + 8} y={cargoTopY} width={flatPx - 16} height={8} fill="rgba(27,43,75,0.6)" rx={2}/>
          {/* 하단 실 */}
          <rect x={flatStartX + 8} y={flatTopY - 8} width={flatPx - 16} height={8} fill="#3d4455"/>
          {/* 윙 힌지선 */}
          {[0.34, 0.67].map(f => (
            <line key={f}
              x1={flatStartX + 8 + (flatPx - 16) * f} y1={cargoTopY + 8}
              x2={flatStartX + 8 + (flatPx - 16) * f} y2={flatTopY - 8}
              stroke="rgba(27,43,75,0.2)" strokeWidth={1} strokeDasharray="5,3"/>
          ))}
        </>
      )}

      {/* ── 파렛트 ── */}
      {pallets.map((p, i) => {
        const sh = Math.min(7, p.w * 0.12); // 상단면 시어(깊이감)
        return (
          <g key={i}>
            {/* 상단면 (입체감) */}
            <polygon
              points={`${p.x},${p.y} ${p.x + p.w},${p.y} ${p.x + p.w + sh},${p.y - sh * 0.55} ${p.x + sh},${p.y - sh * 0.55}`}
              fill="#fca5a5" stroke="rgba(185,28,28,0.55)" strokeWidth={0.5}/>
            {/* 앞면 */}
            <rect x={p.x} y={p.y} width={p.w} height={p.h}
              fill="url(#palGrad)" stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} rx={1}/>
            {/* 광택 */}
            <rect x={p.x + 1} y={p.y + 1} width={p.w - 2} height={Math.min(8, p.h * 0.18)}
              fill="rgba(255,255,255,0.28)" rx={1}/>
            {/* 수평 목재선 */}
            {[0.36, 0.68].map(f => (
              <line key={f} x1={p.x + 1} y1={p.y + p.h * f} x2={p.x + p.w - 1} y2={p.y + p.h * f}
                stroke="rgba(153,27,27,0.4)" strokeWidth={0.7}/>
            ))}
            {/* 우측 측면 (깊이) */}
            <polygon
              points={`${p.x + p.w},${p.y} ${p.x + p.w + sh},${p.y - sh * 0.55} ${p.x + p.w + sh},${p.y - sh * 0.55 + p.h} ${p.x + p.w},${p.y + p.h}`}
              fill="rgba(153,27,27,0.4)" stroke="none"/>
          </g>
        );
      })}

      {/* ── 바퀴 ── */}
      <Wheel cx={frontWheelX}/>
      {rearWheels.map((cx, i) => (
        <g key={i}>
          <Wheel cx={cx - (isSm ? 0 : 3)}/>
          {!isSm && <Wheel cx={cx + 5}/>}
        </g>
      ))}

      {/* 축 */}
      <line x1={frontWheelX} y1={flatTopY + flatH - 2} x2={frontWheelX} y2={axleY} stroke="#555" strokeWidth={2}/>
      {rearWheels.map((cx, i) => (
        <line key={i} x1={cx} y1={flatTopY + flatH - 2} x2={cx} y2={axleY} stroke="#555" strokeWidth={2}/>
      ))}

      {/* ── 캡 ── */}
      <rect x={cabX} y={groundY - cabH} width={cabW} height={cabH} fill="url(#cabGrad)" rx={6} filter="url(#dropS)"/>

      {/* 캡 루프 */}
      <rect x={cabX + 20} y={groundY - cabH - (isSm ? 2 : 6)} width={cabW - 22} height={isSm ? 9 : 14} fill="#c4c9d8" rx={4}/>

      {/* 배기관 */}
      {isLg && <rect x={cabX + 16} y={groundY - cabH - 32} width={10} height={36} fill="#5a6070" rx={3}/>}

      {/* 앞유리 */}
      {(() => {
        const wx = cabX + cabW * 0.3, wy = groundY - cabH + 14;
        const wx2 = cabEndX - 4, wy2 = groundY - cabH + 10;
        const wh = cabH * 0.52;
        return (
          <path d={`M ${wx},${wy} L ${wx2},${wy2} L ${wx2},${wy2 + wh} L ${wx},${wy + wh * 1.04} Z`}
            fill="#93c5fd" fillOpacity={0.58} stroke="rgba(255,255,255,0.55)" strokeWidth={1.4}/>
        );
      })()}
      {/* 앞유리 하이라이트 */}
      {(() => {
        const wx = cabX + cabW * 0.34, wy = groundY - cabH + 17;
        const wx2 = cabEndX - 7, wy2 = groundY - cabH + 13;
        const wh = cabH * 0.24;
        return (
          <path d={`M ${wx},${wy} L ${wx2},${wy2} L ${wx2},${wy2 + wh} L ${wx},${wy + wh * 1.02} Z`}
            fill="rgba(255,255,255,0.11)"/>
        );
      })()}

      {/* 사이드 윈도 */}
      <rect x={cabX + 5} y={groundY - cabH + 26} width={cabW * 0.24} height={cabH * 0.25}
        fill="#96c4e8" fillOpacity={0.5} rx={3} stroke="rgba(255,255,255,0.35)" strokeWidth={1}/>

      {/* 도어선 */}
      <line x1={cabX + cabW * 0.30} y1={groundY - cabH * 0.56} x2={cabX + cabW * 0.30} y2={groundY - 6}
        stroke="rgba(0,0,0,0.1)" strokeWidth={1.5}/>
      {/* 도어 핸들 */}
      <rect x={cabX + cabW * 0.35} y={groundY - cabH * 0.30} width={15} height={5} fill="#7a8090" rx={2}/>

      {/* 사이드 미러 */}
      <rect x={cabEndX - 6} y={groundY - cabH * 0.78} width={10} height={7} fill="#6a7280" rx={2} stroke="#555" strokeWidth={0.5}/>
      <line x1={cabEndX - 2} y1={groundY - cabH * 0.75} x2={cabEndX + 4} y2={groundY - cabH * 0.75} stroke="#666" strokeWidth={1}/>

      {/* 헤드라이트 */}
      <rect x={cabX + 2} y={groundY - cabH * 0.32} width={14} height={10} fill="#fef08a" rx={2} stroke="#d97706" strokeWidth={0.5}/>
      <rect x={cabX + 2} y={groundY - cabH * 0.21} width={14} height={8} fill="#fde68a" rx={2}/>

      {/* 그릴 */}
      <rect x={cabX + 2} y={groundY - cabH * 0.16} width={24} height={cabH * 0.14} fill="#2d323e" rx={2}/>
      {[0.3, 0.6, 0.85].map(f => (
        <line key={f} x1={cabX + 3} y1={groundY - cabH * (0.16 - f * 0.14)} x2={cabX + 24} y2={groundY - cabH * (0.16 - f * 0.14)}
          stroke="#555" strokeWidth={0.8}/>
      ))}

      {/* 캡 루프 광택 */}
      <rect x={cabX + 8} y={groundY - cabH + 5} width={cabW - 14} height={7} fill="rgba(255,255,255,0.2)" rx={2}/>

      {/* ── 정보 배지 ── */}
      <rect x={W - 180} y={8} width={168} height={40} rx={20} fill="rgba(15,30,56,0.83)"/>
      <text x={W - 96} y={24} textAnchor="middle" fill="white" fontSize={12} fontWeight="700" fontFamily="sans-serif">
        {`파렛 ${Math.min(palletCount, fit.count * layers)}개 적재`}
      </text>
      <text x={W - 96} y={39} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={10} fontFamily="sans-serif">
        {`최대 ${fit.count * layers}개 · ${fit.cols}열 × ${fit.rows}행`}
      </text>

      {/* 치수 표기 */}
      <line x1={flatStartX} y1={groundY + 20} x2={flatEndX} y2={groundY + 20} stroke="#94a3b8" strokeWidth={1}/>
      <line x1={flatStartX} y1={groundY + 14} x2={flatStartX} y2={groundY + 26} stroke="#94a3b8" strokeWidth={1}/>
      <line x1={flatEndX}   y1={groundY + 14} x2={flatEndX}   y2={groundY + 26} stroke="#94a3b8" strokeWidth={1}/>
      <text x={(flatStartX + flatEndX) / 2} y={groundY + 35} textAnchor="middle"
        fill="#64748b" fontSize={11} fontWeight="600" fontFamily="sans-serif">
        {truck.L}m × {truck.W}m
      </text>
    </svg>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function PalletSimulator() {
  const [palletSize, setPalletSize] = useState("10x12");
  const [mode,        setMode]       = useState("최적");
  const [stacking,    setStacking]   = useState("1단");
  const [weightVal,   setWeightVal]  = useState("");
  const [weightUnit,  setWeightUnit] = useState("kg");
  const [palletCount, setPalletCount]= useState(8);
  const [bodyType,    setBodyType]   = useState("윙바디");
  const [selectedId,  setSelectedId] = useState(null);

  const pSize = PALLET_SIZES.find(p => p.id === palletSize) || PALLET_SIZES[1];

  const weightKg = useMemo(() => {
    const v = parseFloat(weightVal) || 0;
    return weightUnit === "톤" ? v * 1000 : v;
  }, [weightVal, weightUnit]);
  const totalKg = weightKg * palletCount;

  const results = useMemo(() => TRUCKS.map(truck => {
    const fit      = calcFit(truck.L, truck.W, pSize.w, pSize.d, mode);
    const layers   = stacking === "2단" ? 2 : 1;
    const maxPal   = fit.count * layers;
    const palletOk = palletCount <= maxPal;
    const weightOk = totalKg === 0 || totalKg <= truck.maxKg;
    return { truck, fit, maxPal, palletOk, weightOk, ok: palletOk && weightOk };
  }), [pSize, mode, stacking, palletCount, totalKg]);

  const okResults  = results.filter(r => r.ok);
  const displayRes = selectedId
    ? results.find(r => r.truck.id === selectedId)
    : (okResults[0] || results[0]);

  const layers = stacking === "2단" ? 2 : 1;

  const reset = () => {
    setPalletSize("10x12"); setMode("최적"); setStacking("1단");
    setWeightVal(""); setWeightUnit("kg"); setPalletCount(8);
    setBodyType("윙바디"); setSelectedId(null);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[20px] font-black text-[#1B2B4B] leading-tight">차량 제원 · 파렛트 적재</h2>
          <p className="text-[12px] text-gray-400 font-medium mt-0.5">파렛트 규격과 수량을 입력하면 즉시 시뮬레이션됩니다</p>
        </div>
        <button onClick={reset}
          className="px-4 py-2 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-500 hover:bg-gray-100 hover:text-[#1B2B4B] transition">
          초기화
        </button>
      </div>

      <div className="flex gap-5" style={{ height: "calc(100vh - 188px)", minHeight: "580px" }}>

        {/* ── 왼쪽 입력 (38%) ── */}
        <div className="flex-[38] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 파렛트 규격 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[10px] font-bold text-[#1B2B4B]/35 mb-2.5 tracking-widest uppercase">파렛트 규격</div>
            <div className="flex flex-col gap-1.5">
              {PALLET_SIZES.map(ps => (
                <button key={ps.id} onClick={() => setPalletSize(ps.id)}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-[13px] font-semibold transition ${palletSize === ps.id ? "border-[#1B2B4B] bg-[#1B2B4B] text-white" : "border-gray-100 bg-gray-50 text-gray-700 hover:border-[#1B2B4B]/25"}`}>
                  <span>{ps.label}</span>
                  {palletSize === ps.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
              ))}
            </div>
          </div>

          {/* 적재 옵션 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[10px] font-bold text-[#1B2B4B]/35 mb-2.5 tracking-widest uppercase">적재 옵션</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-gray-500 font-semibold mb-1.5">배치 방식</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden h-9">
                  {["최적","최대"].map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 text-[12px] font-bold transition ${mode===m?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 font-semibold mb-1.5">적재 단수</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden h-9">
                  {["1단","2단"].map(s => (
                    <button key={s} onClick={() => setStacking(s)}
                      className={`flex-1 text-[12px] font-bold transition ${stacking===s?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 중량·수량 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[10px] font-bold text-[#1B2B4B]/35 mb-2.5 tracking-widest uppercase">중량 · 수량</div>

            <div className="text-[11px] text-gray-500 font-semibold mb-1.5">파렛당 중량</div>
            <div className="flex gap-2 mb-4">
              <input type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)}
                placeholder="0" min="0"
                className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none transition"/>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {["kg","톤"].map(u => (
                  <button key={u} onClick={() => setWeightUnit(u)}
                    className={`px-3 py-2 text-[12px] font-bold transition ${weightUnit===u?"bg-[#1B2B4B] text-white":"bg-white text-gray-500"}`}>{u}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] text-gray-500 font-semibold">파렛 수량</div>
              <input type="number" min="1" max="20" value={palletCount}
                onChange={e => setPalletCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="w-16 text-center py-1 text-[16px] font-black text-[#1B2B4B] border-2 border-[#1B2B4B]/20 rounded-xl focus:border-[#1B2B4B] outline-none"/>
            </div>
            <input type="range" min="1" max="20" value={palletCount}
              onChange={e => setPalletCount(Number(e.target.value))} className="w-full accent-[#1B2B4B] mb-2"/>
            <div className="grid grid-cols-5 gap-1">
              {[2,4,6,8,10,12,14,16,18,20].map(n => (
                <button key={n} onClick={() => setPalletCount(n)}
                  className={`py-1 text-[11px] font-bold rounded-lg transition ${palletCount===n?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-600 hover:bg-[#1B2B4B]/10"}`}>{n}</button>
              ))}
            </div>

            {totalKg > 0 && (
              <div className="mt-3 rounded-xl bg-[#1B2B4B]/5 px-3 py-2 flex justify-between">
                <span className="text-[12px] text-gray-500 font-semibold">총 중량</span>
                <span className="text-[13px] font-black text-[#1B2B4B]">
                  {totalKg >= 1000 ? `${(totalKg/1000).toFixed(2)}톤` : `${totalKg.toLocaleString()}kg`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽 결과 (62%) ── */}
        <div className="flex-[62] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 트럭 시각화 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-shrink-0">
            {/* 바디 탭 + 차량 선택 */}
            <div className="flex items-center border-b border-gray-100 px-3 gap-1">
              {["윙바디","카고"].map(t => (
                <button key={t} onClick={() => setBodyType(t)}
                  className={`px-4 py-2.5 text-[13px] font-bold transition border-b-2 ${bodyType===t?"border-[#1B2B4B] text-[#1B2B4B]":"border-transparent text-gray-400 hover:text-gray-600"}`}>{t}</button>
              ))}
              <div className="ml-auto flex items-center gap-1 py-1 flex-wrap">
                {okResults.slice(0, 6).map(r => (
                  <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${(selectedId===r.truck.id||(selectedId===null&&r===okResults[0]))?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {r.truck.name}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG */}
            <div className="h-[260px]" style={{ background: "linear-gradient(160deg,#f6f8fc 0%,#eaeff6 100%)" }}>
              {displayRes && (
                <TruckSideView
                  truck={displayRes.truck}
                  fit={displayRes.fit}
                  palletD={pSize.d}
                  stacking={stacking}
                  bodyType={bodyType}
                  palletCount={palletCount}
                />
              )}
            </div>
          </div>

          {/* 결과 카드 */}
          {displayRes && (
            <div className={`rounded-2xl overflow-hidden shadow-lg border flex-shrink-0 ${displayRes.ok?"border-[#1B2B4B]/10":"border-red-200"}`}
              style={{ background: displayRes.ok ? "linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)" : "linear-gradient(150deg,#450a0a,#7f1d1d)" }}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[22px] font-black text-white">{displayRes.truck.name}</span>
                    <span className="text-[12px] text-white/45 ml-3">{displayRes.truck.L}m × {displayRes.truck.W}m · {bodyType}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[12px] font-black border ${displayRes.ok?"bg-emerald-400/18 text-emerald-300 border-emerald-400/30":"bg-red-400/18 text-red-300 border-red-400/30"}`}>
                    {displayRes.ok ? "적재 가능" : "초과"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { l:"최대 적재", v:`${displayRes.maxPal}개`, s:`${stacking} / ${displayRes.fit.count}개/단`, ok:true },
                    { l:"요청 수량", v:`${palletCount}개`, s:displayRes.palletOk?`여유 ${displayRes.maxPal-palletCount}개`:`${palletCount-displayRes.maxPal}개 초과`, ok:displayRes.palletOk },
                    { l:"배치", v:`${displayRes.fit.cols}열 × ${displayRes.fit.rows}행`, s:`${pSize.w}×${pSize.d}m`, ok:true },
                    { l:"총 중량", v:totalKg===0?"—":totalKg>=1000?`${(totalKg/1000).toFixed(1)}t`:`${totalKg.toLocaleString()}kg`,
                      s:totalKg===0?"미입력":displayRes.weightOk?`최대 ${(displayRes.truck.maxKg/1000).toFixed(0)}t`:`초과`, ok:displayRes.weightOk },
                  ].map(({ l, v, s, ok }) => (
                    <div key={l} className="bg-white/8 rounded-xl p-2.5">
                      <div className="text-[10px] text-white/40 font-semibold mb-1">{l}</div>
                      <div className={`text-[16px] font-black leading-tight ${ok?"text-white":"text-red-300"}`}>{v}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 전체 차량 비교 — 세로 목록 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">전체 차량 비교</div>
            <div className="space-y-2">
              {results.map(r => {
                const isActive = selectedId === r.truck.id || (!selectedId && r === (okResults[0] || results[0]));
                const loadedPct = r.maxPal > 0 ? Math.min(100, (palletCount / r.maxPal) * 100) : 100;
                return (
                  <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition text-left ${isActive ? "border-[#1B2B4B] bg-[#1B2B4B]/4" : r.ok ? "border-gray-100 hover:border-gray-300 hover:bg-gray-50" : "border-gray-100 hover:bg-gray-50 opacity-75"}`}>
                    {/* 차량명 */}
                    <div className={`w-[80px] text-[14px] font-black flex-shrink-0 ${isActive?"text-[#1B2B4B]":"text-gray-700"}`}>
                      {r.truck.name}
                    </div>
                    {/* 진행바 */}
                    <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div className="h-full rounded-lg transition-all duration-300"
                        style={{ width: `${loadedPct}%`, background: r.ok ? (isActive ? "#1B2B4B" : "#2d4a7a") : "#ef4444" }}/>
                      <div className="absolute inset-0 flex items-center px-2.5">
                        <span className={`text-[11px] font-semibold ${loadedPct > 48 ? "text-white" : r.ok ? "text-gray-600" : "text-red-700"}`}>
                          {r.truck.L}m · {r.fit.cols}열 × {r.fit.rows}행
                        </span>
                      </div>
                    </div>
                    {/* 최대 수량 */}
                    <div className="flex-shrink-0 w-[44px] text-right">
                      <div className={`text-[15px] font-black ${r.ok ? "text-[#1B2B4B]" : "text-red-500"}`}>{r.maxPal}개</div>
                    </div>
                    {/* 가능/초과 */}
                    <div className={`flex-shrink-0 w-[36px] text-center text-[11px] font-black py-0.5 rounded-lg ${r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {r.ok ? "가능" : "초과"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-gray-400 text-center">
        적재함 내부 치수 기준입니다. 실제 차량에 따라 달라질 수 있습니다.
      </div>
    </div>
  );
}
