import React, { useState, useMemo } from "react";

const PALLET_SIZES = [
  { id: "08x12", label: "0.8 × 1.2m", w: 0.8, d: 1.2 },
  { id: "10x12", label: "1.0 × 1.2m", w: 1.0, d: 1.2 },
  { id: "11x11", label: "1.1 × 1.1m", w: 1.1, d: 1.1 },
  { id: "12x11", label: "1.2 × 1.1m", w: 1.2, d: 1.1 },
  { id: "13x11", label: "1.3 × 1.1m", w: 1.3, d: 1.1 },
];

const TRUCKS = [
  { id: "1ton",    name: "1톤",    L: 2.8,  W: 1.50, maxKg: 1000,  type: "카고" },
  { id: "2.5ton",  name: "2.5톤",  L: 4.5,  W: 1.90, maxKg: 2500,  type: "카고" },
  { id: "3.5ton",  name: "3.5톤",  L: 5.2,  W: 2.10, maxKg: 3500,  type: "카고/윙" },
  { id: "5ton",    name: "5톤",    L: 6.2,  W: 2.35, maxKg: 5000,  type: "카고/윙" },
  { id: "5tonP",   name: "5톤+",   L: 7.4,  W: 2.35, maxKg: 5500,  type: "카고/윙" },
  { id: "11ton",   name: "11톤",   L: 9.1,  W: 2.35, maxKg: 11000, type: "카고/윙" },
  { id: "18ton",   name: "18톤",   L: 10.1, W: 2.40, maxKg: 18000, type: "카고/윙" },
  { id: "25ton",   name: "25톤",   L: 11.2, W: 2.45, maxKg: 25000, type: "카고/윙" },
  { id: "trailer", name: "추레라", L: 13.6, W: 2.45, maxKg: 27000, type: "추레라" },
];

// Calculate how many pallets fit using guillotine algorithm
function calcFit(truckL, truckW, palletW, palletD, mode) {
  const fit = (l, w, pw, pd) => {
    const cols = Math.floor(w / pw);
    const rows = Math.floor(l / pd);
    return { cols, rows, count: cols * rows, pw, pd };
  };
  const a = fit(truckL, truckW, palletW, palletD);
  const b = fit(truckL, truckW, palletD, palletW); // rotated

  if (mode === "최적") {
    return a.count >= b.count ? a : b;
  }
  // 최대: try both orientations, also try mixed rows
  if (a.count >= b.count) {
    // try remaining space with rotated
    const remL = truckL - a.rows * a.pd;
    const extra = fit(remL, truckW, palletD, palletW);
    return { ...a, count: a.count + extra.count, mixed: extra.count > 0 ? { rows: extra.rows, cols: extra.cols, pw: extra.pw, pd: extra.pd, offsetL: a.rows * a.pd } : null };
  } else {
    const remL = truckL - b.rows * b.pd;
    const extra = fit(remL, truckW, palletW, palletD);
    return { ...b, count: b.count + extra.count, mixed: extra.count > 0 ? { rows: extra.rows, cols: extra.cols, pw: extra.pw, pd: extra.pd, offsetL: b.rows * b.pd } : null };
  }
}

// Isometric 3D projection helpers
const S3 = Math.sqrt(3) / 2; // ≈ 0.866

function isoPoint(wx, wy, wz, sc) {
  return [
    (wx - wy) * S3 * sc,
    (wx + wy) * 0.5 * sc - wz * sc,
  ];
}

function isoPath(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
}

// Draw a single isometric box face
function IsoBox({ ox, oy, wx, wy, wz, ww, wd, wh, sc, topColor, leftColor, rightColor, stroke = "rgba(255,255,255,0.6)", sw = 0.5 }) {
  const p = (x, y, z) => {
    const [sx, sy] = isoPoint(ox + x, oy + y, wz + z, sc);
    return [sx, sy];
  };
  // top face: (0,0,wh) (ww,0,wh) (ww,wd,wh) (0,wd,wh)
  const top = [p(0, 0, wh), p(ww, 0, wh), p(ww, wd, wh), p(0, wd, wh)];
  // left face: (0,wd,0) (ww,wd,0) (ww,wd,wh) (0,wd,wh)
  const left = [p(0, wd, 0), p(ww, wd, 0), p(ww, wd, wh), p(0, wd, wh)];
  // right face: (ww,0,0) (ww,wd,0) (ww,wd,wh) (ww,0,wh)
  const right = [p(ww, 0, 0), p(ww, wd, 0), p(ww, wd, wh), p(ww, 0, wh)];

  return (
    <g>
      <path d={isoPath(left)} fill={leftColor} stroke={stroke} strokeWidth={sw} />
      <path d={isoPath(right)} fill={rightColor} stroke={stroke} strokeWidth={sw} />
      <path d={isoPath(top)} fill={topColor} stroke={stroke} strokeWidth={sw} />
    </g>
  );
}

function TruckVisualization({ truck, fit, palletW, palletD, stackLayers, truckType, palletCount }) {
  const sc = Math.min(36 / Math.max(truck.L, 3), 24);
  const viewW = 520;
  const viewH = 280;
  const cx = viewW * 0.18;
  const cy = viewH * 0.72;

  const tL = truck.L;
  const tW = truck.W;
  const tH = 0.35; // floor thickness
  const wallH = 0.05;
  const sideH = stackLayers === "2단" ? 2.4 : 1.4;

  // Colors
  const bodyColor = truckType === "윙" ? "#2563EB" : "#1B2B4B";
  const bodyLight = truckType === "윙" ? "#3b82f6" : "#243a60";
  const bodyDark = truckType === "윙" ? "#1d4ed8" : "#0f1e38";
  const floorTop = "#d4a853";
  const floorLeft = "#b8922f";
  const floorRight = "#c9a040";

  // Pallet colors
  const palTop = "#f5c842";
  const palLeft = "#c9a030";
  const palRight = "#dab838";

  // Count loaded pallets
  const maxFit = fit.count * stackLayers === "2단" ? 2 : 1;
  const loadedCount = Math.min(palletCount, fit.count * (stackLayers === "2단" ? 2 : 1));

  // Build pallet grid positions
  const pallets = [];
  const pw = fit.pw || palletW;
  const pd = fit.pd || palletD;
  let idx = 0;
  for (let layer = 0; layer < (stackLayers === "2단" ? 2 : 1); layer++) {
    for (let r = 0; r < fit.rows; r++) {
      for (let c = 0; c < fit.cols; c++) {
        if (idx >= palletCount) break;
        pallets.push({ x: r * pd, y: c * pw, z: layer * 0.15, pw, pd, layer });
        idx++;
      }
      if (idx >= palletCount) break;
    }
    // mixed area
    if (fit.mixed) {
      const m = fit.mixed;
      for (let r = 0; r < m.rows && idx < palletCount; r++) {
        for (let c = 0; c < m.cols && idx < palletCount; c++) {
          pallets.push({ x: m.offsetL + r * m.pd, y: c * m.pw, z: layer * 0.15, pw: m.pw, pd: m.pd, layer });
          idx++;
        }
      }
    }
    if (idx >= palletCount) break;
  }

  // Pallet height
  const pH = 0.14;
  // Cargo height above floor
  const cargoZ = tH;

  // Cab dimensions
  const cabL = 1.8;
  const cabW = tW;
  const cabH = 2.2;

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-full" style={{ userSelect: "none" }}>
      <defs>
        <filter id="truckShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="2" dy="4" stdDeviation="6" floodColor="#1B2B4B" floodOpacity="0.25" />
        </filter>
        <linearGradient id="cabGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bodyLight} />
          <stop offset="100%" stopColor={bodyDark} />
        </linearGradient>
      </defs>

      <g transform={`translate(${cx},${cy})`} filter="url(#truckShadow)">
        {/* Floor */}
        <IsoBox ox={0} oy={0} wx={0} wy={0} wz={0} ww={tL} wd={tW} wh={tH} sc={sc}
          topColor={floorTop} leftColor={floorLeft} rightColor={floorRight} />

        {/* Side walls */}
        {truckType === "윙" && (
          <>
            {/* Left wall */}
            <IsoBox ox={0} oy={tW} wx={0} wy={0} wz={tH} ww={tL} wd={0.04} wh={sideH} sc={sc}
              topColor={bodyLight} leftColor={bodyDark} rightColor={bodyColor} sw={0.3} />
            {/* Right wall */}
            <IsoBox ox={0} oy={0} wx={0} wy={0} wz={tH} ww={tL} wd={0.04} wh={sideH} sc={sc}
              topColor={bodyLight} leftColor={bodyDark} rightColor={bodyColor} sw={0.3} />
          </>
        )}

        {/* Pallets */}
        {pallets.map((p, i) => (
          <IsoBox
            key={i}
            ox={p.x} oy={p.y} wx={0} wy={0}
            wz={cargoZ + p.layer * (pH + 0.01)}
            ww={p.pd} wd={p.pw} wh={pH}
            sc={sc}
            topColor={i < loadedCount ? palTop : "#e5e7eb"}
            leftColor={i < loadedCount ? palLeft : "#d1d5db"}
            rightColor={i < loadedCount ? palRight : "#d1d5db"}
            sw={0.4}
          />
        ))}

        {/* Cab */}
        <IsoBox ox={-cabL} oy={0} wx={0} wy={0} wz={0} ww={cabL} wd={cabW} wh={cabH} sc={sc}
          topColor={bodyLight} leftColor={bodyDark} rightColor={bodyColor} sw={0.5} />

        {/* Cab window */}
        {(() => {
          const winW = cabL * 0.55;
          const winH = 0.8;
          const winZ = cabH - 1.1;
          const p = (x, y, z) => {
            const [sx, sy] = isoPoint(-cabL + x, y, z, sc);
            return `${sx.toFixed(1)},${sy.toFixed(1)}`;
          };
          return (
            <polygon
              points={`${p(winW * 0.15, cabW, winZ)} ${p(winW, cabW, winZ)} ${p(winW, cabW, winZ + winH)} ${p(winW * 0.15, cabW, winZ + winH)}`}
              fill="#93c5fd" fillOpacity="0.7" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"
            />
          );
        })()}
      </g>

      {/* Truck type badge */}
      <rect x={viewW - 90} y={8} width={80} height={24} rx={12} fill={truckType === "윙" ? "#2563EB" : "#1B2B4B"} />
      <text x={viewW - 50} y={24} textAnchor="middle" fill="white" fontSize="12" fontWeight="700">{truckType} 바디</text>
    </svg>
  );
}

export default function PalletSimulator() {
  const [palletSize, setPalletSize] = useState("10x12");
  const [mode, setMode] = useState("최적");
  const [stacking, setStacking] = useState("1단");
  const [weightVal, setWeightVal] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [palletCount, setPalletCount] = useState(10);
  const [truckType, setTruckType] = useState("윙");
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const pSize = PALLET_SIZES.find(p => p.id === palletSize) || PALLET_SIZES[1];

  const weightKg = useMemo(() => {
    const v = parseFloat(weightVal) || 0;
    return weightUnit === "톤" ? v * 1000 : v;
  }, [weightVal, weightUnit]);

  const totalWeightKg = weightKg * palletCount;

  const results = useMemo(() => {
    return TRUCKS.map(truck => {
      const fit = calcFit(truck.L, truck.W, pSize.w, pSize.d, mode);
      const layers = stacking === "2단" ? 2 : 1;
      const maxPallets = fit.count * layers;
      const canFitCount = Math.min(palletCount, maxPallets);
      const weightOk = totalWeightKg <= truck.maxKg;
      const palletOk = palletCount <= maxPallets;
      return { truck, fit, maxPallets, canFitCount, weightOk, palletOk, ok: weightOk && palletOk };
    });
  }, [pSize, mode, stacking, palletCount, totalWeightKg]);

  const okTrucks = results.filter(r => r.ok);
  const visTruck = selectedTruck
    ? results.find(r => r.truck.id === selectedTruck)
    : (okTrucks[0] || results[0]);

  return (
    <div className="w-full">
      <div className="mb-5">
        <h2 className="text-[20px] font-black text-[#1B2B4B] leading-tight">차량 제원 · 파렛트 적재</h2>
        <p className="text-[12px] text-gray-400 font-medium mt-0.5">파렛트 규격과 수량을 입력해 최적 차량을 확인하세요</p>
      </div>

      <div className="flex gap-5" style={{ height: "calc(100vh - 185px)", minHeight: "560px" }}>
        {/* ── 왼쪽 입력 패널 (40%) ── */}
        <div className="flex-[4] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 파렛트 규격 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">파렛트 규격</div>
            <div className="grid grid-cols-1 gap-2">
              {PALLET_SIZES.map(ps => (
                <button
                  key={ps.id}
                  onClick={() => setPalletSize(ps.id)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-[13px] font-semibold transition ${palletSize === ps.id ? "border-[#1B2B4B] bg-[#1B2B4B] text-white" : "border-gray-100 bg-gray-50 text-gray-700 hover:border-[#1B2B4B]/30"}`}
                >
                  <span>{ps.label}</span>
                  {palletSize === ps.id && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 적재 옵션 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">적재 옵션</div>
            <div className="flex flex-col gap-3">
              {/* 최적/최대 */}
              <div>
                <div className="text-[12px] text-gray-500 font-semibold mb-2">배치 방식</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {["최적", "최대"].map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 py-2.5 text-[13px] font-bold transition ${mode === m ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      {m}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  {mode === "최적" ? "단일 방향 배치 · 안정적 하차" : "혼합 방향 배치 · 최대 적재량"}
                </p>
              </div>

              {/* 1단/2단 */}
              <div>
                <div className="text-[12px] text-gray-500 font-semibold mb-2">적재 단수</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {["1단", "2단"].map(s => (
                    <button key={s} onClick={() => setStacking(s)}
                      className={`flex-1 py-2.5 text-[13px] font-bold transition ${stacking === s ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 중량 / 수량 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">중량 · 수량</div>
            <div className="flex flex-col gap-3">
              {/* 파렛당 중량 */}
              <div>
                <div className="text-[12px] text-gray-500 font-semibold mb-2">파렛당 중량</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={weightVal}
                    onChange={e => setWeightVal(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-[14px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none transition"
                  />
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    {["kg", "톤"].map(u => (
                      <button key={u} onClick={() => setWeightUnit(u)}
                        className={`px-4 py-2.5 text-[13px] font-bold transition ${weightUnit === u ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                {weightKg > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    파렛 1개 = {weightKg.toLocaleString()}kg
                  </p>
                )}
              </div>

              {/* 파렛 수량 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] text-gray-500 font-semibold">파렛 수량</div>
                  <div className="text-[13px] font-black text-[#1B2B4B]">{palletCount}개</div>
                </div>
                <input
                  type="range"
                  min="1" max="20" value={palletCount}
                  onChange={e => setPalletCount(Number(e.target.value))}
                  className="w-full accent-[#1B2B4B]"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>1개</span><span>10개</span><span>20개</span>
                </div>
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {[2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(n => (
                    <button key={n} onClick={() => setPalletCount(n)}
                      className={`py-1.5 text-[11px] font-bold rounded-lg transition ${palletCount === n ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-600 hover:bg-[#1B2B4B]/10"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {totalWeightKg > 0 && (
                <div className="rounded-xl bg-[#1B2B4B]/5 px-4 py-3 flex justify-between">
                  <span className="text-[12px] text-gray-500 font-semibold">총 중량</span>
                  <span className="text-[13px] font-black text-[#1B2B4B]">
                    {totalWeightKg >= 1000 ? `${(totalWeightKg / 1000).toFixed(2)}톤` : `${totalWeightKg.toLocaleString()}kg`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 보기 버튼 */}
          <button
            onClick={() => { setShowResult(true); setSelectedTruck(null); }}
            className="w-full py-4 rounded-2xl text-white font-black text-[16px] shadow-lg transition active:scale-95"
            style={{ background: "linear-gradient(135deg,#1B2B4B 0%,#2d4a7a 100%)" }}
          >
            적재 시뮬레이션 보기
          </button>
        </div>

        {/* ── 오른쪽 결과 패널 (60%) ── */}
        <div className="flex-[6] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">
          {!showResult ? (
            <div className="flex-1 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-4 bg-gray-50/50">
              <div className="w-20 h-20 rounded-2xl bg-[#1B2B4B]/8 flex items-center justify-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="1.5" opacity="0.4">
                  <rect x="1" y="7" width="22" height="10" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="12" strokeWidth="3" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-[14px] font-bold text-gray-400">파렛트 정보를 입력하고</div>
                <div className="text-[14px] font-bold text-gray-400">보기를 눌러주세요</div>
              </div>
            </div>
          ) : (
            <>
              {/* 차량 선택 탭 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">차량별 적재 결과</div>
                <div className="flex flex-wrap gap-2">
                  {results.map(r => (
                    <button
                      key={r.truck.id}
                      onClick={() => setSelectedTruck(r.truck.id)}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border-2 transition ${
                        (selectedTruck === r.truck.id || (!selectedTruck && r === (okTrucks[0] || results[0])))
                          ? "border-[#1B2B4B] bg-[#1B2B4B] text-white"
                          : r.ok
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
                      }`}
                    >
                      {r.truck.name}
                      {r.ok && <span className="ml-1 text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {visTruck && (
                <>
                  {/* 3D 시각화 */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* 차량 타입 선택 */}
                    <div className="flex border-b border-gray-100">
                      {["윙", "카고"].map(t => (
                        <button key={t} onClick={() => setTruckType(t)}
                          className={`flex-1 py-2.5 text-[13px] font-bold transition ${truckType === t ? "bg-[#1B2B4B] text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                          {t} 바디
                        </button>
                      ))}
                    </div>

                    <div className="h-[240px] p-2" style={{ background: "linear-gradient(150deg,#f8fafc 0%,#f1f5f9 100%)" }}>
                      <TruckVisualization
                        truck={visTruck.truck}
                        fit={visTruck.fit}
                        palletW={pSize.w}
                        palletD={pSize.d}
                        stackLayers={stacking}
                        truckType={truckType}
                        palletCount={palletCount}
                      />
                    </div>
                  </div>

                  {/* 적재 결과 카드 */}
                  <div className={`rounded-2xl overflow-hidden shadow-lg border ${visTruck.ok ? "border-[#1B2B4B]/10" : "border-red-200"}`}
                    style={{ background: visTruck.ok ? "linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)" : "linear-gradient(150deg,#450a0a 0%,#7f1d1d 100%)" }}>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="text-[24px] font-black text-white leading-tight">{visTruck.truck.name}</div>
                          <div className="text-[12px] text-white/60 mt-0.5">{visTruck.truck.L}m × {visTruck.truck.W}m 적재함 · {visTruck.truck.type}</div>
                        </div>
                        <div className={`px-3 py-1.5 rounded-full text-[12px] font-black ${visTruck.ok ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30" : "bg-red-400/20 text-red-300 border border-red-400/30"}`}>
                          {visTruck.ok ? "적재 가능" : "초과"}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/8 rounded-xl p-3">
                          <div className="text-[11px] text-white/50 font-semibold mb-1">최대 적재 파렛</div>
                          <div className="text-[20px] font-black text-white">{visTruck.maxPallets}<span className="text-[14px] text-white/60 ml-1">개</span></div>
                          <div className="text-[10px] text-white/40 mt-0.5">{stacking} 기준 ({visTruck.fit.count}개/단)</div>
                        </div>
                        <div className="bg-white/8 rounded-xl p-3">
                          <div className="text-[11px] text-white/50 font-semibold mb-1">요청 수량</div>
                          <div className={`text-[20px] font-black ${visTruck.palletOk ? "text-emerald-300" : "text-red-300"}`}>
                            {palletCount}<span className="text-[14px] ml-1 opacity-60">개</span>
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {visTruck.palletOk ? `여유 ${visTruck.maxPallets - palletCount}개` : `${palletCount - visTruck.maxPallets}개 초과`}
                          </div>
                        </div>
                        <div className="bg-white/8 rounded-xl p-3">
                          <div className="text-[11px] text-white/50 font-semibold mb-1">파렛 배치</div>
                          <div className="text-[16px] font-black text-white">{visTruck.fit.cols}열 × {visTruck.fit.rows}행</div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {pSize.w}×{pSize.d}m {visTruck.fit.pw !== pSize.w ? "(90° 회전)" : ""}
                          </div>
                        </div>
                        <div className="bg-white/8 rounded-xl p-3">
                          <div className="text-[11px] text-white/50 font-semibold mb-1">적재 중량</div>
                          <div className={`text-[16px] font-black ${totalWeightKg === 0 ? "text-white/40" : visTruck.weightOk ? "text-emerald-300" : "text-red-300"}`}>
                            {totalWeightKg === 0 ? "—" : totalWeightKg >= 1000 ? `${(totalWeightKg / 1000).toFixed(1)}톤` : `${totalWeightKg.toLocaleString()}kg`}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {totalWeightKg > 0 ? (visTruck.weightOk ? `가능 (최대 ${(visTruck.truck.maxKg / 1000).toFixed(0)}톤)` : `중량 초과 (+${((totalWeightKg - visTruck.truck.maxKg) / 1000).toFixed(1)}톤)`) : "중량 미입력"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 전체 차량 비교표 */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">전체 비교</div>
                    <div className="space-y-2">
                      {results.map(r => {
                        const pct = Math.min(100, (palletCount / Math.max(r.maxPallets, 1)) * 100);
                        return (
                          <button key={r.truck.id} onClick={() => setSelectedTruck(r.truck.id)}
                            className={`w-full text-left transition ${selectedTruck === r.truck.id ? "opacity-100" : "opacity-80 hover:opacity-100"}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-[52px] text-[12px] font-black text-[#1B2B4B] text-right flex-shrink-0">{r.truck.name}</div>
                              <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                                <div
                                  className="h-full rounded-lg transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    background: r.ok ? "linear-gradient(90deg,#1B2B4B,#2d4a7a)" : "linear-gradient(90deg,#dc2626,#ef4444)",
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center px-2">
                                  <span className={`text-[11px] font-bold ${pct > 40 ? "text-white" : r.ok ? "text-[#1B2B4B]" : "text-red-600"}`}>
                                    {r.maxPallets}개 적재 가능 · {r.truck.L}m
                                  </span>
                                </div>
                              </div>
                              <div className={`w-[44px] text-[11px] font-black text-right ${r.ok ? "text-emerald-600" : "text-red-500"}`}>
                                {r.ok ? "가능" : "초과"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
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
