import React, { useState, useMemo } from "react";

const PALLET_SIZES = [
  { id: "08x12", label: "0.8 × 1.2m", w: 0.8, d: 1.2 },
  { id: "10x12", label: "1.0 × 1.2m", w: 1.0, d: 1.2 },
  { id: "11x11", label: "1.1 × 1.1m", w: 1.1, d: 1.1 },
  { id: "12x11", label: "1.2 × 1.1m", w: 1.2, d: 1.1 },
  { id: "13x11", label: "1.3 × 1.1m", w: 1.3, d: 1.1 },
];

const TRUCKS = [
  { id: "1ton",    name: "1톤",       L: 2.8,  W: 1.50, maxKg: 1000,  sz: "sm" },
  { id: "2.5ton",  name: "2.5톤",     L: 4.5,  W: 1.90, maxKg: 2500,  sz: "sm" },
  { id: "3.5ton",  name: "3.5톤",     L: 5.2,  W: 2.10, maxKg: 3500,  sz: "md" },
  { id: "3.5tonW", name: "3.5톤광폭", L: 5.2,  W: 2.35, maxKg: 3800,  sz: "md" },
  { id: "5ton",    name: "5톤",       L: 6.2,  W: 2.35, maxKg: 5000,  sz: "md" },
  { id: "5tonP",   name: "5톤+",      L: 7.4,  W: 2.35, maxKg: 5500,  sz: "md" },
  { id: "11ton",   name: "11톤",      L: 9.1,  W: 2.35, maxKg: 11000, sz: "lg" },
  { id: "18ton",   name: "18톤",      L: 10.1, W: 2.40, maxKg: 18000, sz: "lg" },
  { id: "25ton",   name: "25톤",      L: 11.2, W: 2.45, maxKg: 25000, sz: "lg" },
  { id: "trailer", name: "추레라",    L: 13.6, W: 2.45, maxKg: 27000, sz: "xl" },
];

function calcFit(truckL, truckW, palletW, palletD, mode) {
  const fit = (l, w, pw, pd) => ({ cols: Math.floor(w / pw), rows: Math.floor(l / pd), count: Math.floor(w / pw) * Math.floor(l / pd), pw, pd });
  const a = fit(truckL, truckW, palletW, palletD);
  const b = fit(truckL, truckW, palletD, palletW);
  if (mode === "최적") return a.count >= b.count ? a : b;
  if (a.count >= b.count) {
    const extra = fit(truckL - a.rows * a.pd, truckW, palletD, palletW);
    return { ...a, count: a.count + extra.count, mixed: extra.count > 0 ? { ...extra, offsetL: a.rows * a.pd } : null };
  } else {
    const extra = fit(truckL - b.rows * b.pd, truckW, palletW, palletD);
    return { ...b, count: b.count + extra.count, mixed: extra.count > 0 ? { ...extra, offsetL: b.rows * b.pd } : null };
  }
}

// ── 트럭 측면 뷰 (SVG) ────────────────────────────────────────────────────
function TruckSideView({ truck, fit, palletD, stacking, bodyType, palletCount }) {
  const W = 920, H = 370;
  const groundY = 330;

  const isSm = truck.sz === "sm";
  const isLg = truck.sz === "lg" || truck.sz === "xl";
  const wheelR = isSm ? 23 : isLg ? 37 : 30;
  const cabW   = isSm ? 118 : isLg ? 192 : 158;
  const cabH   = isSm ? 128 : isLg ? 192 : 162;

  const cabX    = 28;
  const axleY   = groundY - wheelR;
  const flatTopY = axleY - wheelR - 2;
  const flatH   = 18;
  const cabTopY = flatTopY - cabH;
  const flatStartX = cabX + cabW - 12;
  const flatPx  = W - flatStartX - 22;
  const sc      = flatPx / truck.L;   // px per metre

  // Cargo box height
  const singleH = Math.min(isSm ? 82 : 118, flatTopY - cabTopY - 8);
  const cargoH  = stacking === "2단" ? singleH * 1.82 : singleH;
  const cargoTopY = flatTopY - cargoH;

  // Pallets (side view = rows along length)
  const palLayerH = (singleH - 8) / (stacking === "2단" ? 2 : 1);
  const depthPx = fit.pd * sc;
  const layers  = stacking === "2단" ? 2 : 1;
  const pallets = [];
  let cnt = 0;
  for (let layer = 0; layer < layers && cnt < palletCount; layer++) {
    for (let r = 0; r < fit.rows && cnt < palletCount; r++) {
      const px = flatStartX + 8 + r * (depthPx + 1.5);
      if (px + depthPx > W - 25) break;
      pallets.push({ x: px, y: flatTopY - (layer + 1) * (palLayerH + 3), w: depthPx - 1.5, h: palLayerH });
      cnt++;
    }
    if (fit.mixed) {
      const m = fit.mixed;
      const mDepth = m.pd * sc;
      for (let r = 0; r < m.rows && cnt < palletCount; r++) {
        const px = flatStartX + 8 + m.offsetL * sc + r * (mDepth + 1.5);
        if (px + mDepth > W - 25) break;
        pallets.push({ x: px, y: flatTopY - (layer + 1) * (palLayerH + 3), w: mDepth - 1.5, h: palLayerH });
        cnt++;
      }
    }
  }

  // Rear axle positions
  const rearAxles = isSm ? [0.55] : isLg ? [0.3, 0.55, 0.78] : [0.38, 0.68];
  const rearWheels = rearAxles.map(f => flatStartX + flatPx * f);
  const frontWheelX = cabX + cabW * 0.64;

  const Wheel = ({ cx, cy, r }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#1c1c1c"/>
      <circle cx={cx} cy={cy} r={r * 0.64} fill="#444"/>
      <circle cx={cx} cy={cy} r={r * 0.22} fill="#888"/>
      {[0,60,120,180,240,300].map(deg => {
        const rd = deg * Math.PI / 180;
        return <circle key={deg} cx={cx + Math.cos(rd)*r*0.43} cy={cy + Math.sin(rd)*r*0.43} r={r*0.08} fill="#aaa"/>;
      })}
    </g>
  );

  const isWing = bodyType === "윙바디";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ userSelect:"none" }}>
      <defs>
        <linearGradient id="cabG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4d8e0"/><stop offset="100%" stopColor="#9ba3b0"/>
        </linearGradient>
        <linearGradient id="flatG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ccc"/><stop offset="100%" stopColor="#aaa"/>
        </linearGradient>
        <linearGradient id="palRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f87171"/><stop offset="40%" stopColor="#ef4444"/><stop offset="100%" stopColor="#b91c1c"/>
        </linearGradient>
        <linearGradient id="palTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fca5a5"/><stop offset="100%" stopColor="#f87171"/>
        </linearGradient>
        <filter id="shadow" x="-5%" y="-5%" width="110%" height="120%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#0f1e38" floodOpacity="0.22"/>
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx={flatStartX + flatPx * 0.45} cy={groundY + 18} rx={flatPx * 0.52 + 60} ry={16} fill="rgba(0,0,0,0.12)"/>

      {/* ── Flatbed ── */}
      <rect x={flatStartX - 6} y={flatTopY} width={flatPx + 8} height={flatH} fill="url(#flatG)" rx={3}/>
      <rect x={flatStartX - 6} y={flatTopY} width={flatPx + 8} height={5} fill="rgba(255,255,255,0.38)"/>
      {/* Cross members */}
      {Array.from({ length: Math.min(10, Math.ceil(flatPx / 58)) }).map((_, i) => {
        const x = flatStartX + 10 + i * ((flatPx - 20) / Math.max(1, Math.ceil(flatPx / 58) - 1));
        return <rect key={i} x={x} y={flatTopY + 4} width={3} height={flatH - 5} fill="#999" rx={1}/>;
      })}
      {/* Front bulkhead */}
      <rect x={flatStartX - 2} y={cargoTopY} width={10} height={flatTopY - cargoTopY} fill="#888" rx={2}/>

      {/* ── Wing body / Cargo frame ── */}
      {isWing ? (
        <>
          <rect x={flatStartX + 8} y={cargoTopY} width={flatPx - 15} height={cargoH}
            fill="rgba(27,43,75,0.04)" stroke="#1B2B4B" strokeWidth="1.8" rx={3}/>
          <rect x={flatStartX + 8} y={cargoTopY} width={flatPx - 15} height={9} fill="#1B2B4B" opacity={0.65} rx={2}/>
          <rect x={flatStartX + 8} y={flatTopY - 8} width={flatPx - 15} height={8} fill="#2d4060"/>
          {/* Wing hinge lines */}
          {[0.33, 0.66].map(f => (
            <line key={f} x1={flatStartX + 8 + (flatPx - 15)*f} y1={cargoTopY} x2={flatStartX + 8 + (flatPx - 15)*f} y2={flatTopY}
              stroke="rgba(27,43,75,0.25)" strokeWidth={1} strokeDasharray="4,3"/>
          ))}
        </>
      ) : (
        <rect x={flatStartX + 8} y={flatTopY - 14} width={flatPx - 15} height={5} fill="#aaa" rx={1}/>
      )}

      {/* ── Pallets ── */}
      {pallets.map((p, i) => {
        const shear = 6; // 3D top shear px
        return (
          <g key={i}>
            {/* 3D top face */}
            <polygon
              points={`${p.x},${p.y} ${p.x+p.w},${p.y} ${p.x+p.w+shear},${p.y-shear} ${p.x+shear},${p.y-shear}`}
              fill="url(#palTop)" stroke="rgba(239,68,68,0.6)" strokeWidth={0.6}/>
            {/* Front face */}
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="url(#palRed)" stroke="#b91c1c" strokeWidth={0.6} rx={1}/>
            {/* Shine */}
            <rect x={p.x+1} y={p.y+1} width={p.w-2} height={Math.min(7, p.h*0.18)} fill="rgba(255,255,255,0.28)" rx={1}/>
            {/* Plank lines */}
            {[0.34, 0.67].map(f => (
              <line key={f} x1={p.x} y1={p.y+p.h*f} x2={p.x+p.w} y2={p.y+p.h*f}
                stroke="rgba(153,27,27,0.5)" strokeWidth={0.7}/>
            ))}
            {/* Right depth face */}
            <polygon
              points={`${p.x+p.w},${p.y} ${p.x+p.w+shear},${p.y-shear} ${p.x+p.w+shear},${p.y-shear+p.h} ${p.x+p.w},${p.y+p.h}`}
              fill="rgba(153,27,27,0.55)" stroke="none"/>
          </g>
        );
      })}

      {/* Empty space guide */}
      {cnt < fit.count * layers && (
        <rect x={flatStartX + 8 + cnt / layers * depthPx}
          y={flatTopY - singleH} width={(fit.count - cnt / layers) * depthPx}
          height={singleH - 4} fill="rgba(16,185,129,0.07)"
          stroke="#10b981" strokeWidth={1.2} strokeDasharray="5,3" rx={2}/>
      )}

      {/* ── Wheels ── */}
      <Wheel cx={frontWheelX} cy={axleY} r={wheelR}/>
      {rearWheels.map((cx, i) => (
        <g key={i}>
          <Wheel cx={cx - 4} cy={axleY} r={wheelR}/>
          {!isSm && <Wheel cx={cx + 4} cy={axleY} r={wheelR}/>}
        </g>
      ))}

      {/* Axle lines */}
      <line x1={frontWheelX} y1={flatTopY + flatH} x2={frontWheelX} y2={axleY} stroke="#555" strokeWidth={2}/>
      {rearWheels.map((cx, i) => (
        <line key={i} x1={cx} y1={flatTopY + flatH} x2={cx} y2={axleY} stroke="#555" strokeWidth={2}/>
      ))}

      {/* ── Cab ── */}
      <rect x={cabX} y={cabTopY} width={cabW} height={groundY - cabTopY} fill="url(#cabG)" rx={6} filter="url(#shadow)"/>

      {/* Cab roof */}
      <rect x={cabX + 22} y={cabTopY - (isSm ? 0 : 4)} width={cabW - 22} height={isSm ? 10 : 16} fill="#c8cdd8" rx={4}/>

      {/* Exhaust */}
      {!isSm && <rect x={cabX + 14} y={cabTopY - 28} width={11} height={34} fill="#666" rx={3}/>}

      {/* Windshield */}
      <path d={`M ${cabX+cabW*0.30},${cabTopY+12} L ${cabX+cabW-4},${cabTopY+8} L ${cabX+cabW-4},${cabTopY+cabH*0.50} L ${cabX+cabW*0.34},${cabTopY+cabH*0.54} Z`}
        fill="#93c5fd" fillOpacity={0.62} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}/>
      <path d={`M ${cabX+cabW*0.33},${cabTopY+15} L ${cabX+cabW-7},${cabTopY+12} L ${cabX+cabW-7},${cabTopY+cabH*0.26} L ${cabX+cabW*0.36},${cabTopY+cabH*0.29} Z`}
        fill="rgba(255,255,255,0.12)"/>

      {/* Side window */}
      <rect x={cabX+6} y={cabTopY+28} width={cabW*0.24} height={cabH*0.26} fill="#9ec6e8" fillOpacity={0.5} rx={3} stroke="rgba(255,255,255,0.4)" strokeWidth={1}/>

      {/* Door line */}
      <line x1={cabX+cabW*0.30} y1={cabTopY+cabH*0.44} x2={cabX+cabW*0.30} y2={groundY-5} stroke="rgba(0,0,0,0.12)" strokeWidth={1.5}/>

      {/* Door handle */}
      <rect x={cabX+cabW*0.34} y={cabTopY+cabH*0.72} width={16} height={5} fill="#777" rx={2}/>

      {/* Headlights */}
      <rect x={cabX+3} y={cabTopY+cabH*0.70} width={13} height={10} fill="#fde68a" rx={2}/>
      <rect x={cabX+3} y={cabTopY+cabH*0.82} width={13} height={7} fill="#fed7aa" rx={2}/>

      {/* Grille */}
      <rect x={cabX+2} y={cabTopY+cabH*0.86} width={26} height={cabH*0.12} fill="#3a3a3a" rx={2}/>
      {[0.2,0.4,0.6,0.8].map(f => (
        <line key={f} x1={cabX+3} y1={cabTopY+cabH*(0.86+f*0.12)} x2={cabX+26} y2={cabTopY+cabH*(0.86+f*0.12)}
          stroke="#666" strokeWidth={0.8}/>
      ))}

      {/* Cab shine */}
      <rect x={cabX+6} y={cabTopY+4} width={cabW-10} height={8} fill="rgba(255,255,255,0.22)" rx={2}/>

      {/* ── Info badges ── */}
      <rect x={W-160} y={10} width={148} height={38} rx={19} fill="rgba(15,30,56,0.82)"/>
      <text x={W-86} y={24} textAnchor="middle" fill="white" fontSize={12} fontWeight="700">
        {`적재 ${Math.min(palletCount, fit.count * layers)}개 / 최대 ${fit.count * layers}개`}
      </text>
      <text x={W-86} y={38} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={10}>
        {`${fit.cols}열 × ${fit.rows}행 · ${stacking}`}
      </text>

      {/* Dimension label */}
      <line x1={flatStartX} y1={groundY+22} x2={flatStartX+flatPx} y2={groundY+22} stroke="#94a3b8" strokeWidth={1}/>
      <line x1={flatStartX} y1={groundY+16} x2={flatStartX} y2={groundY+28} stroke="#94a3b8" strokeWidth={1}/>
      <line x1={flatStartX+flatPx} y1={groundY+16} x2={flatStartX+flatPx} y2={groundY+28} stroke="#94a3b8" strokeWidth={1}/>
      <text x={flatStartX+flatPx/2} y={groundY+37} textAnchor="middle" fill="#64748b" fontSize={11} fontWeight="600">
        {truck.L}m × {truck.W}m
      </text>
    </svg>
  );
}

export default function PalletSimulator() {
  const [palletSize, setPalletSize] = useState("10x12");
  const [mode,       setMode]       = useState("최적");
  const [stacking,   setStacking]   = useState("1단");
  const [weightVal,  setWeightVal]  = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [palletCount,setPalletCount]= useState(10);
  const [bodyType,   setBodyType]   = useState("윙바디");
  const [selectedId, setSelectedId] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [rotateY,    setRotateY]    = useState(0);

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

  const okResults   = results.filter(r => r.ok);
  const displayRes  = selectedId
    ? results.find(r => r.truck.id === selectedId)
    : (okResults[0] || results[0]);

  const layers = stacking === "2단" ? 2 : 1;

  return (
    <div className="w-full">
      <div className="mb-5">
        <h2 className="text-[20px] font-black text-[#1B2B4B] leading-tight">차량 제원 · 파렛트 적재</h2>
        <p className="text-[12px] text-gray-400 font-medium mt-0.5">파렛트 규격과 수량을 입력해 최적 차량을 확인하세요</p>
      </div>

      <div className="flex gap-5" style={{ height: "calc(100vh - 185px)", minHeight: "580px" }}>

        {/* ── 왼쪽 입력 (40%) ── */}
        <div className="flex-[4] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 파렛트 규격 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">파렛트 규격</div>
            <div className="grid grid-cols-1 gap-1.5">
              {PALLET_SIZES.map(ps => (
                <button key={ps.id} onClick={() => setPalletSize(ps.id)}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-[13px] font-semibold transition ${palletSize === ps.id ? "border-[#1B2B4B] bg-[#1B2B4B] text-white" : "border-gray-100 bg-gray-50 text-gray-700 hover:border-[#1B2B4B]/30"}`}>
                  <span>{ps.label}</span>
                  {palletSize === ps.id && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
              ))}
            </div>
          </div>

          {/* 적재 옵션 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">적재 옵션</div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="text-[11px] text-gray-500 font-semibold mb-1.5">배치 방식</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {["최적","최대"].map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 py-2 text-[12px] font-bold transition ${mode===m?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 font-semibold mb-1.5">적재 단수</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {["1단","2단"].map(s => (
                    <button key={s} onClick={() => setStacking(s)}
                      className={`flex-1 py-2 text-[12px] font-bold transition ${stacking===s?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">{mode==="최적"?"단일 방향 배치 · 안정적 하차":"혼합 방향 배치 · 최대 적재량"}</p>
          </div>

          {/* 중량·수량 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">중량 · 수량</div>

            <div className="text-[11px] text-gray-500 font-semibold mb-1.5">파렛당 중량</div>
            <div className="flex gap-2 mb-3">
              <input type="number" value={weightVal} onChange={e=>setWeightVal(e.target.value)} placeholder="0" min="0"
                className="flex-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none transition"/>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {["kg","톤"].map(u => (
                  <button key={u} onClick={()=>setWeightUnit(u)}
                    className={`px-4 py-2.5 text-[12px] font-bold transition ${weightUnit===u?"bg-[#1B2B4B] text-white":"bg-white text-gray-500"}`}>{u}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] text-gray-500 font-semibold">파렛 수량</div>
              <div className="text-[15px] font-black text-[#1B2B4B]">{palletCount}<span className="text-[12px] text-gray-400 ml-1">개</span></div>
            </div>
            <input type="range" min="1" max="20" value={palletCount} onChange={e=>setPalletCount(Number(e.target.value))} className="w-full accent-[#1B2B4B] mb-2"/>
            <div className="grid grid-cols-5 gap-1">
              {[2,4,6,8,10,12,14,16,18,20].map(n => (
                <button key={n} onClick={()=>setPalletCount(n)}
                  className={`py-1 text-[11px] font-bold rounded-lg transition ${palletCount===n?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-600 hover:bg-[#1B2B4B]/10"}`}>{n}</button>
              ))}
            </div>

            {totalKg > 0 && (
              <div className="mt-2.5 rounded-xl bg-[#1B2B4B]/5 px-3 py-2 flex justify-between">
                <span className="text-[11px] text-gray-500 font-semibold">총 중량</span>
                <span className="text-[12px] font-black text-[#1B2B4B]">
                  {totalKg >= 1000 ? `${(totalKg/1000).toFixed(2)}톤` : `${totalKg.toLocaleString()}kg`}
                </span>
              </div>
            )}
          </div>

          {/* 보기 버튼 */}
          <button onClick={() => { setShowResult(true); setSelectedId(null); }}
            className="w-full py-4 rounded-2xl text-white font-black text-[15px] shadow-lg transition active:scale-95"
            style={{ background: "linear-gradient(135deg,#1B2B4B 0%,#2d4a7a 100%)" }}>
            적재 시뮬레이션 보기
          </button>
        </div>

        {/* ── 오른쪽 결과 (60%) ── */}
        <div className="flex-[6] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">
          {!showResult ? (
            <div className="flex-1 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-3xl bg-[#1B2B4B]/6 flex items-center justify-center">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="1.3" opacity="0.35">
                  <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[14px] font-bold text-gray-400">파렛트 정보를 입력하고</p>
                <p className="text-[14px] font-bold text-gray-400">보기를 눌러주세요</p>
              </div>
            </div>
          ) : (
            <>
              {/* 3D 트럭 시각화 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* 바디 선택 + 회전 */}
                <div className="flex items-center border-b border-gray-100">
                  <div className="flex">
                    {["윙바디","카고"].map(t => (
                      <button key={t} onClick={()=>setBodyType(t)}
                        className={`px-5 py-2.5 text-[13px] font-bold transition border-b-2 ${bodyType===t?"border-[#1B2B4B] text-[#1B2B4B] bg-[#1B2B4B]/3":"border-transparent text-gray-400 hover:text-gray-600"}`}>{t}</button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2 pr-3">
                    <span className="text-[11px] text-gray-400 font-semibold">회전</span>
                    {[-30,-15,0,15,30].map(deg => (
                      <button key={deg} onClick={()=>setRotateY(deg)}
                        className={`w-7 h-7 rounded-lg text-[11px] font-bold transition ${rotateY===deg?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                        {deg===0?"0":deg>0?`+${deg}`:deg}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SVG 컨테이너 */}
                <div className="h-[260px]" style={{ background:"linear-gradient(160deg,#f8fafc 0%,#eef2f7 100%)", perspective:"1200px" }}>
                  <div style={{ transform:`rotateY(${rotateY}deg)`, transition:"transform 0.35s cubic-bezier(.4,0,.2,1)", transformStyle:"preserve-3d", width:"100%", height:"100%" }}>
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
              </div>

              {/* 결과 카드 */}
              {displayRes && (
                <div className={`rounded-2xl overflow-hidden shadow-lg border ${displayRes.ok?"border-[#1B2B4B]/10":"border-red-200"}`}
                  style={{ background: displayRes.ok ? "linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)" : "linear-gradient(150deg,#450a0a,#7f1d1d)" }}>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="text-[26px] font-black text-white">{displayRes.truck.name}</div>
                        <div className="text-[12px] text-white/50 mt-0.5">{displayRes.truck.L}m × {displayRes.truck.W}m · {bodyType}</div>
                      </div>
                      <span className={`px-3 py-1.5 rounded-full text-[12px] font-black border ${displayRes.ok?"bg-emerald-400/18 text-emerald-300 border-emerald-400/30":"bg-red-400/18 text-red-300 border-red-400/30"}`}>
                        {displayRes.ok ? "적재 가능" : "초과"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { label:"최대 적재", val:`${displayRes.maxPal}개`, sub:`${stacking} 기준 (${displayRes.fit.count}개/단)`, ok:true },
                        { label:"요청 수량", val:`${palletCount}개`, sub:displayRes.palletOk?`여유 ${displayRes.maxPal-palletCount}개`:`${palletCount-displayRes.maxPal}개 초과`, ok:displayRes.palletOk },
                        { label:"파렛 배치", val:`${displayRes.fit.cols}열 × ${displayRes.fit.rows}행`, sub:`${pSize.w}×${pSize.d}m ${displayRes.fit.pw!==pSize.w?"(90° 회전)":""}`, ok:true },
                        { label:"적재 중량", val:totalKg===0?"—":totalKg>=1000?`${(totalKg/1000).toFixed(1)}톤`:`${totalKg.toLocaleString()}kg`,
                          sub:totalKg===0?"중량 미입력":displayRes.weightOk?`최대 ${(displayRes.truck.maxKg/1000).toFixed(0)}톤`:`+${((totalKg-displayRes.truck.maxKg)/1000).toFixed(1)}톤 초과`, ok:displayRes.weightOk },
                      ].map(({ label, val, sub, ok }) => (
                        <div key={label} className="bg-white/8 rounded-xl p-3">
                          <div className="text-[10px] text-white/45 font-semibold mb-1">{label}</div>
                          <div className={`text-[18px] font-black leading-tight ${ok?"text-white":"text-red-300"}`}>{val}</div>
                          <div className="text-[10px] text-white/35 mt-0.5">{sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 전체 비교 — 카드 그리드 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">전체 차량 비교</div>
                <div className="grid grid-cols-2 gap-2">
                  {results.map(r => {
                    const isSelected = selectedId === r.truck.id || (!selectedId && r === (okResults[0] || results[0]));
                    const pct = Math.round((Math.min(palletCount, r.maxPal) / Math.max(r.maxPal, 1)) * 100);
                    return (
                      <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                        className={`text-left p-3 rounded-xl border-2 transition ${isSelected ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : r.ok ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-[14px] font-black text-[#1B2B4B]">{r.truck.name}</div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.ok?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-600"}`}>
                            {r.ok?"가능":"초과"}
                          </span>
                        </div>
                        {/* Mini progress */}
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
                          <div className="h-full rounded-full transition-all"
                            style={{ width:`${pct}%`, background: r.ok ? "#1B2B4B" : "#ef4444" }}/>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[11px] text-gray-500">{palletCount}개 요청</span>
                          <span className="text-[11px] font-bold text-gray-700">{r.maxPal}개 가능</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{r.truck.L}m · {r.fit.cols}열×{r.fit.rows}행</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-gray-400 text-center">
        적재함 내부 치수 기준입니다. 실제 차량에 따라 달라질 수 있습니다.
      </div>
    </div>
  );
}
