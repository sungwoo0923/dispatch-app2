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
function TruckSideView({ truck, fit, stacking, bodyType, palletCount }) {
  const VW = 900, VH = 310;
  const groundY = 278;

  const isLg = truck.maxKg >= 11000;
  const isSm = truck.maxKg <= 2500;

  const wheelR    = isSm ? 22 : isLg ? 34 : 28;
  const cabW      = isSm ? 118 : isLg ? 188 : 158;
  const cabH      = isSm ? 126 : isLg ? 186 : 158;
  const cabX      = 28;
  const cabEndX   = cabX + cabW;

  const axleY      = groundY - wheelR;
  const bedTopY    = axleY - wheelR - 2;
  const bedH       = 16;
  const cargoStartX = cabEndX - 12;
  const cargoEndX  = VW - 18;
  const cargoW     = cargoEndX - cargoStartX;
  const scale      = cargoW / truck.L;

  const isWing   = bodyType === "윙바디";
  const layers   = stacking === "2단" ? 2 : 1;
  const singleH  = Math.min(isSm ? 78 : 108, bedTopY - (groundY - cabH) - 8);
  const cargoH   = singleH * (stacking === "2단" ? 1.82 : 1);
  const cargoTopY = bedTopY - cargoH;

  const palLayerH = (singleH - 6) / layers;
  const depthPx   = fit.pd * scale;

  const pallets = [];
  let cnt = 0;
  for (let layer = 0; layer < layers && cnt < palletCount; layer++) {
    for (let r = 0; r < fit.rows && cnt < palletCount; r++) {
      const px = cargoStartX + 8 + r * (depthPx + 1.5);
      if (px + depthPx > cargoEndX - 6) break;
      pallets.push({ x: px, y: bedTopY - (layer + 1) * (palLayerH + 3) - 1, w: depthPx - 1, h: palLayerH });
      cnt++;
    }
    if (fit.mixed) {
      const m = fit.mixed;
      const md = m.pd * scale;
      for (let r = 0; r < m.rows && cnt < palletCount; r++) {
        const px = cargoStartX + 8 + m.offsetL * scale + r * (md + 1.5);
        if (px + md > cargoEndX - 6) break;
        pallets.push({ x: px, y: bedTopY - (layer + 1) * (palLayerH + 3) - 1, w: md - 1, h: palLayerH });
        cnt++;
      }
    }
  }

  const frontWheelX = cabX + cabW * 0.67;
  const rearCnt = truck.wc;
  const rearWheels = Array.from({ length: rearCnt }, (_, i) =>
    cargoStartX + cargoW * (rearCnt === 1 ? 0.52 : rearCnt === 2 ? (i === 0 ? 0.35 : 0.68) : (0.22 + i * 0.28))
  );

  const Wheel = ({ cx }) => (
    <g>
      <circle cx={cx} cy={axleY} r={wheelR} fill="#333333"/>
      <circle cx={cx} cy={axleY} r={wheelR * 0.62} fill="#4a4a4a"/>
      <circle cx={cx} cy={axleY} r={wheelR * 0.22} fill="#888"/>
      {[0,60,120,180,240,300].map(d => {
        const rad = d * Math.PI / 180;
        return <circle key={d} cx={cx + Math.cos(rad)*wheelR*0.41} cy={axleY + Math.sin(rad)*wheelR*0.41} r={wheelR*0.082} fill="#aaa"/>;
      })}
    </g>
  );

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full" style={{ userSelect:"none" }}>

      {/* ── 화물칸 바닥 ── */}
      <rect x={cargoStartX} y={bedTopY} width={cargoW} height={bedH} fill="#C8C8C8" stroke="#9a9a9a" strokeWidth="1" rx="2"/>
      {/* 바닥 상단 레일 */}
      <rect x={cargoStartX + 4} y={bedTopY - 7} width={cargoW - 8} height={5} fill="#B4B4B4" stroke="#9a9a9a" strokeWidth="0.5" rx="1"/>
      {/* 크로스 멤버 */}
      {Array.from({ length: Math.min(12, Math.ceil(cargoW / 58)) }).map((_, i) => {
        const x = cargoStartX + 8 + i * ((cargoW - 16) / Math.max(1, Math.ceil(cargoW / 58) - 1));
        return <rect key={i} x={x - 1} y={bedTopY + 4} width={3} height={bedH - 5} fill="#9a9a9a" rx="1"/>;
      })}

      {/* ── 윙바디 / 카고 박스 ── */}
      {isWing ? (
        <>
          {/* 옆면 패널 */}
          <rect x={cargoStartX + 6} y={cargoTopY} width={cargoW - 12} height={cargoH}
            fill="rgba(208,218,230,0.18)" stroke="#B0B8C4" strokeWidth="1.5" rx="2"/>
          {/* 지붕 */}
          <rect x={cargoStartX + 6} y={cargoTopY} width={cargoW - 12} height={9} fill="#C0C6CE" stroke="#A8B0B8" strokeWidth="1" rx="2"/>
          {/* 하단 실 */}
          <rect x={cargoStartX + 6} y={bedTopY - 10} width={cargoW - 12} height={7} fill="#A8AEAD" stroke="#909898" strokeWidth="0.5"/>
          {/* 윙 패널 힌지선 */}
          {[0.33, 0.66].map(f => (
            <line key={f}
              x1={cargoStartX + 6 + (cargoW - 12) * f} y1={cargoTopY + 9}
              x2={cargoStartX + 6 + (cargoW - 12) * f} y2={bedTopY - 10}
              stroke="#C0C6CE" strokeWidth="1" strokeDasharray="4,3"/>
          ))}
        </>
      ) : (
        /* 카고 — 오픈 사이드레일만 */
        <>
          <rect x={cargoStartX + 6} y={cargoTopY} width={8} height={cargoH} fill="#C0C0C0" stroke="#A0A0A0" strokeWidth="1" rx="1"/>
          <rect x={cargoEndX - 14} y={cargoTopY} width={8} height={cargoH} fill="#C0C0C0" stroke="#A0A0A0" strokeWidth="1" rx="1"/>
          <rect x={cargoStartX + 6} y={cargoTopY} width={cargoW - 12} height={6} fill="#B8B8B8" stroke="#A0A0A0" strokeWidth="0.5"/>
        </>
      )}

      {/* ── 파렛트 ── */}
      {pallets.map((p, i) => (
        <g key={i}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h}
            fill="#4E81B4" stroke="#3A6A9A" strokeWidth="0.8" rx="1"/>
          <rect x={p.x + 1} y={p.y + 1} width={p.w - 2} height={Math.min(6, p.h * 0.22)}
            fill="rgba(255,255,255,0.22)" rx="1"/>
          <line x1={p.x + 1} y1={p.y + p.h * 0.38} x2={p.x + p.w - 1} y2={p.y + p.h * 0.38}
            stroke="rgba(255,255,255,0.18)" strokeWidth="0.7"/>
          <line x1={p.x + 1} y1={p.y + p.h * 0.72} x2={p.x + p.w - 1} y2={p.y + p.h * 0.72}
            stroke="rgba(255,255,255,0.18)" strokeWidth="0.7"/>
        </g>
      ))}

      {/* ── 바퀴 ── */}
      <Wheel cx={frontWheelX}/>
      {rearWheels.map((cx, i) => (
        <g key={i}>
          <Wheel cx={cx - (isSm ? 0 : 3.5)}/>
          {!isSm && <Wheel cx={cx + 4.5}/>}
        </g>
      ))}

      {/* 프레임 / 샤시 라인 */}
      <line x1={cargoStartX} y1={bedTopY + bedH} x2={cargoEndX} y2={bedTopY + bedH} stroke="#888" strokeWidth="2"/>

      {/* ── 캡 ── */}
      {/* 후드 */}
      <rect x={cabX} y={groundY - cabH * 0.30} width={cabW * 0.36} height={cabH * 0.30}
        fill="#D0D0D0" stroke="#A8A8A8" strokeWidth="1.2" rx="3"/>
      {/* 캡 바디 */}
      <rect x={cabX + cabW * 0.24} y={groundY - cabH} width={cabW * 0.76} height={cabH}
        fill="#D0D0D0" stroke="#A8A8A8" strokeWidth="1.2" rx="5"/>
      {/* 앞부분 연결 */}
      <rect x={cabX} y={groundY - cabH * 0.30} width={cabW * 0.30} height={cabH * 0.30}
        fill="#D0D0D0" stroke="none"/>

      {/* 캡 루프 에어 디플렉터 */}
      <rect x={cabX + cabW * 0.26} y={groundY - cabH - (isSm ? 3 : 8)} width={cabW * 0.72} height={isSm ? 8 : 14}
        fill="#C4C4C4" stroke="#A8A8A8" strokeWidth="1" rx="3"/>

      {/* 배기관 (대형) */}
      {isLg && <rect x={cabX + cabW * 0.28} y={groundY - cabH - 36} width={10} height={32} fill="#909090" stroke="#777" strokeWidth="0.8" rx="3"/>}

      {/* 앞유리 */}
      {(() => {
        const wx  = cabX + cabW * 0.32, wy  = groundY - cabH + 13;
        const wx2 = cabEndX - 5,        wy2 = groundY - cabH + 10;
        const wh  = cabH * 0.50;
        return (
          <path d={`M ${wx},${wy} L ${wx2},${wy2} L ${wx2},${wy2+wh} L ${wx},${wy+wh*1.04} Z`}
            fill="#AED6F1" stroke="#89C0DE" strokeWidth="1.2"/>
        );
      })()}

      {/* 사이드 윈도 */}
      <rect x={cabX + cabW * 0.27} y={groundY - cabH + 22} width={cabW * 0.20} height={cabH * 0.26}
        fill="#AED6F1" stroke="#89C0DE" strokeWidth="1" rx="2"/>

      {/* 도어선 */}
      <line x1={cabX + cabW * 0.32} y1={groundY - cabH * 0.58} x2={cabX + cabW * 0.32} y2={groundY - 5}
        stroke="#B0B0B0" strokeWidth="1"/>
      {/* 도어 핸들 */}
      <rect x={cabX + cabW * 0.37} y={groundY - cabH * 0.28} width={14} height={5} fill="#A0A0A0" rx="2"/>

      {/* 사이드 미러 */}
      <rect x={cabEndX - 5} y={groundY - cabH * 0.76} width={13} height={8}
        fill="#B8B8B8" stroke="#999" strokeWidth="0.8" rx="1"/>
      <line x1={cabEndX + 2} y1={groundY - cabH * 0.72} x2={cabEndX + 8} y2={groundY - cabH * 0.72}
        stroke="#999" strokeWidth="1"/>

      {/* 헤드라이트 */}
      <rect x={cabX + 1} y={groundY - cabH * 0.33} width={13} height={10} fill="#FEFEB0" stroke="#D4A800" strokeWidth="0.5" rx="1"/>
      <rect x={cabX + 1} y={groundY - cabH * 0.20} width={13} height={8} fill="#F0F0A0" stroke="#C4A000" strokeWidth="0.5" rx="1"/>

      {/* 그릴 */}
      <rect x={cabX + 1} y={groundY - cabH * 0.14} width={22} height={cabH * 0.13} fill="#444" stroke="#333" strokeWidth="0.5" rx="2"/>
      {[0.35, 0.68].map(f => (
        <line key={f} x1={cabX + 2} y1={groundY - cabH * 0.14 + cabH * 0.13 * f}
          x2={cabX + 21} y2={groundY - cabH * 0.14 + cabH * 0.13 * f}
          stroke="#666" strokeWidth="0.8"/>
      ))}

      {/* ── 정보 배지 ── */}
      <rect x={VW - 186} y={8} width={174} height={42} rx="20" fill="rgba(15,30,56,0.82)"/>
      <text x={VW - 99} y={26} textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">
        {`파렛 ${Math.min(palletCount, fit.count * layers)}개 적재`}
      </text>
      <text x={VW - 99} y={41} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="sans-serif">
        {`최대 ${fit.count * layers}개 · ${fit.cols}열 × ${fit.rows}행`}
      </text>

      {/* 치수선 */}
      <line x1={cargoStartX} y1={groundY + 18} x2={cargoEndX} y2={groundY + 18} stroke="#94a3b8" strokeWidth="1"/>
      <line x1={cargoStartX} y1={groundY + 12} x2={cargoStartX} y2={groundY + 24} stroke="#94a3b8" strokeWidth="1"/>
      <line x1={cargoEndX}   y1={groundY + 12} x2={cargoEndX}   y2={groundY + 24} stroke="#94a3b8" strokeWidth="1"/>
      <text x={(cargoStartX + cargoEndX) / 2} y={groundY + 34} textAnchor="middle"
        fill="#64748b" fontSize="11" fontWeight="600" fontFamily="sans-serif">
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
