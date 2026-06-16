import React, { useState, useMemo } from "react";

const PALLET_SIZES = [
  // ── KPP 한국파렛트풀 (logisall.com 공식 제품) ─────────────────────────
  { id: "kpp-n11", label: "1,100 × 1,100", sub: "N11 · 의약품·식품·유통",    w: 1.1,  d: 1.1,  cat: "KPP", model: "N11" },
  { id: "kpp-n12", label: "1,200 × 1,000", sub: "N12 · 제약·음료회사",       w: 1.2,  d: 1.0,  cat: "KPP", model: "N12" },
  { id: "kpp-n15", label: "1,460 × 1,130", sub: "N15 · 사료·전자·물류창고",  w: 1.46, d: 1.13, cat: "KPP", model: "N15" },
  { id: "kpp-p11", label: "1,100 × 1,100", sub: "P11 · 비료업계 (강화형)",   w: 1.1,  d: 1.1,  cat: "KPP", model: "P11" },
  // ── 아주파레트 (AJ Networks · ajnetworks.co.kr) ───────────────────────
  { id: "aj-t11",  label: "1,100 × 1,100", sub: "T-11형 · 국내표준",         w: 1.1,  d: 1.1,  cat: "아주", model: "T-11" },
  { id: "aj-t12",  label: "1,200 × 1,000", sub: "T-12형 · 국제표준",         w: 1.2,  d: 1.0,  cat: "아주", model: "T-12" },
  { id: "aj-lg",   label: "1,300 × 1,100", sub: "대형 · 사료·전자",           w: 1.3,  d: 1.1,  cat: "아주", model: "대형" },
  { id: "aj-sm",   label: "1,100 × 800",   sub: "소형 · 편의점·화장품",       w: 1.1,  d: 0.8,  cat: "아주", model: "소형" },
  // ── 기타 규격 ─────────────────────────────────────────────────────────
  { id: "etc-08x12", label: "800 × 1,200",   sub: "소형 규격",         w: 0.8,  d: 1.2, cat: "기타" },
  { id: "etc-09x09", label: "900 × 900",     sub: "소형 정방형",        w: 0.9,  d: 0.9, cat: "기타" },
  { id: "etc-10x12", label: "1,000 × 1,200", sub: "중형 규격",         w: 1.0,  d: 1.2, cat: "기타" },
  { id: "etc-12x08", label: "1,200 × 800",   sub: "EUR 유럽표준 파렛트", w: 1.2,  d: 0.8, cat: "기타" },
  { id: "etc-12x11", label: "1,200 × 1,100", sub: "대형 규격",         w: 1.2,  d: 1.1, cat: "기타" },
];

const PALLET_COMPANIES = [
  { id: "KPP",  label: "KPP 파레트",  desc: "한국파렛트풀 표준" },
  { id: "아주", label: "아주파레트", desc: "ISO 국제규격" },
  { id: "기타", label: "기타 규격",  desc: "소형 · 대형 · 특수" },
];

// 제원 출처: 실차 기준 업계 표준 (1단 적재 기준 최대치)
const TRUCKS = [
  { id: "1ton",    name: "1톤",       L: 2.8,  W: 1.60, maxKg: 1000,  wc: 1 },
  { id: "1.4ton",  name: "1.4톤",     L: 3.1,  W: 1.60, maxKg: 1400,  wc: 1 },
  { id: "2.5ton",  name: "2.5톤",     L: 4.2,  W: 1.80, maxKg: 2500,  wc: 1 },
  { id: "3.5ton",  name: "3.5톤",     L: 4.4,  W: 2.00, maxKg: 3500,  wc: 2 },
  { id: "3.5tonW", name: "3.5톤광폭", L: 4.4,  W: 2.35, maxKg: 3800,  wc: 2 },
  { id: "5ton",    name: "5톤",       L: 6.2,  W: 2.30, maxKg: 5000,  wc: 2 },
  { id: "5tonP",   name: "5톤+",      L: 7.3,  W: 2.30, maxKg: 5500,  wc: 2 },
  { id: "11ton",   name: "11톤",      L: 9.1,  W: 2.35, maxKg: 11000, wc: 3 },
  { id: "18ton",   name: "18톤",      L: 10.2, W: 2.35, maxKg: 18000, wc: 3 },
  { id: "25ton",   name: "25톤",      L: 10.2, W: 2.35, maxKg: 25000, wc: 3 },
  { id: "trailer", name: "추레라",    L: 12.0, W: 2.40, maxKg: 27000, wc: 3 },
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

// ── 탑다운 화물 적재 시각화 ──────────────────────────────────────────────────
function TruckSideView({ truck, fit, stacking, palletCount, pSize, bodyType }) {
  const VW = 920, VH = 380;
  const TM = 52, BM = 52, LM = 68, RM = 32, CAB_W = 44;
  const availW = VW - LM - RM;
  const availH = VH - TM - BM;
  const scale = Math.min(availW / truck.L, availH / truck.W);
  const CL = truck.L * scale;
  const CW = truck.W * scale;
  const CX = LM + (availW - CL) / 2;
  const CY = TM + (availH - CW) / 2;

  const palD_px = fit.pd * scale;
  const palW_px = fit.pw * scale;
  const GAP = Math.max(1.5, scale * 0.015);
  const layers = stacking === "2단" ? 2 : 1;

  const slots = {};
  const addSlot = (key, x, y, w, h) => {
    if (!slots[key]) slots[key] = { x, y, w, h, layerCount: 0 };
    slots[key].layerCount++;
  };

  let cnt = 0;
  outer:
  for (let layer = 0; layer < layers; layer++) {
    for (let row = 0; row < fit.rows; row++) {
      for (let col = 0; col < fit.cols; col++) {
        if (cnt >= palletCount) break outer;
        addSlot(`${row},${col}`,
          CX + row * palD_px + GAP, CY + col * palW_px + GAP,
          palD_px - GAP * 2, palW_px - GAP * 2);
        cnt++;
      }
    }
    if (fit.mixed) {
      const m = fit.mixed;
      const mDpx = m.pd * scale, mWpx = m.pw * scale;
      for (let row = 0; row < m.rows; row++) {
        for (let col = 0; col < m.cols; col++) {
          if (cnt >= palletCount) break outer;
          addSlot(`mx${row},${col}`,
            CX + m.offsetL * scale + row * mDpx + GAP, CY + col * mWpx + GAP,
            mDpx - GAP * 2, mWpx - GAP * 2);
          cnt++;
        }
      }
    }
  }

  // Empty slot positions for visual outlines
  const emptySlots = [];
  for (let row = 0; row < fit.rows; row++) {
    for (let col = 0; col < fit.cols; col++) {
      if (!slots[`${row},${col}`]) {
        emptySlots.push({
          x: CX + row * palD_px + GAP, y: CY + col * palW_px + GAP,
          w: palD_px - GAP * 2, h: palW_px - GAP * 2,
        });
      }
    }
  }
  if (fit.mixed) {
    const m = fit.mixed;
    const mDpx = m.pd * scale, mWpx = m.pw * scale;
    for (let row = 0; row < m.rows; row++) {
      for (let col = 0; col < m.cols; col++) {
        if (!slots[`mx${row},${col}`]) {
          emptySlots.push({
            x: CX + m.offsetL * scale + row * mDpx + GAP,
            y: CY + col * mWpx + GAP,
            w: mDpx - GAP * 2, h: mWpx - GAP * 2,
          });
        }
      }
    }
  }

  const slotList = Object.values(slots);
  const filledRows = Math.min(fit.rows, Math.ceil(palletCount / Math.max(1, fit.cols)));
  const loadedM = filledRows * fit.pd;
  const loadedPx = loadedM * scale;
  const remainM = Math.max(0, truck.L - loadedM);
  const isWing = bodyType === "윙바디";

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full" style={{ userSelect: "none" }}>
      <defs>
        <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5F6FA"/>
          <stop offset="100%" stopColor="#ECEEF4"/>
        </linearGradient>
        <linearGradient id="loadZone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FEF3F3"/>
          <stop offset="100%" stopColor="#FCE8E8"/>
        </linearGradient>
        <linearGradient id="palG1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D73535"/>
          <stop offset="100%" stopColor="#A51C1C"/>
        </linearGradient>
        <linearGradient id="palG2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B1A1A"/>
          <stop offset="100%" stopColor="#5F1212"/>
        </linearGradient>
        <linearGradient id="cabG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B4B4B4"/>
          <stop offset="100%" stopColor="#DCDCDC"/>
        </linearGradient>
        <filter id="palShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1.5" dy="2" stdDeviation="2.5" floodColor="#00000022"/>
        </filter>
      </defs>

      {/* Background */}
      <rect width={VW} height={VH} fill="#E4E8F0"/>

      {/* Cargo floor */}
      <rect x={CX} y={CY} width={CL} height={CW} fill="url(#floorGrad)" rx={5}/>

      {/* Floor plank texture */}
      {Array.from({ length: Math.floor(CW / 11) }).map((_, i) => (
        <line key={`plk${i}`}
          x1={CX + 3} y1={CY + i * 11 + 5.5}
          x2={CX + CL - 3} y2={CY + i * 11 + 5.5}
          stroke="#DBDDE8" strokeWidth="0.7"/>
      ))}

      {/* Loaded zone tint */}
      {loadedPx > 0 && (
        <rect x={CX} y={CY} width={Math.min(loadedPx, CL)} height={CW}
          fill="url(#loadZone)" rx={5}/>
      )}

      {/* Wing body side rails */}
      {isWing && <>
        <rect x={CX} y={CY - 12} width={CL} height={12} fill="#C6C6C6" stroke="#ABABAB" strokeWidth="1"/>
        {Array.from({ length: Math.floor(CL / 28) }).map((_, i) => (
          <line key={`wr${i}`}
            x1={CX + i * 28 + 14} y1={CY - 12}
            x2={CX + i * 28 + 14} y2={CY}
            stroke="#B8B8B8" strokeWidth="0.7"/>
        ))}
        <rect x={CX} y={CY + CW} width={CL} height={12} fill="#C6C6C6" stroke="#ABABAB" strokeWidth="1"/>
        {Array.from({ length: Math.floor(CL / 28) }).map((_, i) => (
          <line key={`wb${i}`}
            x1={CX + i * 28 + 14} y1={CY + CW}
            x2={CX + i * 28 + 14} y2={CY + CW + 12}
            stroke="#B8B8B8" strokeWidth="0.7"/>
        ))}
      </>}

      {/* Empty slot outlines */}
      {emptySlots.map((s, i) => (
        <rect key={`es${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill="rgba(190,195,218,0.12)" stroke="#BEC2D4" strokeWidth="1"
          strokeDasharray="4,3" rx={2}/>
      ))}

      {/* Loaded pallets */}
      {slotList.map((p, i) => {
        if (p.layerCount === 0) return null;
        const double = p.layerCount >= 2;
        const slatH = Math.max(5, p.h / 6);
        const numSlats = Math.floor(p.h / slatH);
        return (
          <g key={i} filter="url(#palShadow)">
            <rect x={p.x} y={p.y} width={p.w} height={p.h}
              fill={double ? "url(#palG2)" : "url(#palG1)"} rx={2.5}/>
            {/* Top highlight */}
            <rect x={p.x} y={p.y} width={p.w} height={Math.min(9, p.h * 0.22)}
              fill="rgba(255,255,255,0.26)" rx={2.5}/>
            {/* Slat lines (deck texture) */}
            {Array.from({ length: numSlats }).map((_, si) => (
              <line key={si}
                x1={p.x + 4} y1={p.y + (si + 0.5) * slatH}
                x2={p.x + p.w - 4} y2={p.y + (si + 0.5) * slatH}
                stroke="rgba(0,0,0,0.09)" strokeWidth="0.9"/>
            ))}
            {/* Center vertical divider */}
            {p.w > 18 && (
              <line x1={p.x + p.w / 2} y1={p.y + 4} x2={p.x + p.w / 2} y2={p.y + p.h - 4}
                stroke="rgba(0,0,0,0.08)" strokeWidth="0.9"/>
            )}
            {/* Bottom shadow strip */}
            <rect x={p.x} y={p.y + p.h - Math.min(7, p.h * 0.18)} width={p.w}
              height={Math.min(7, p.h * 0.18)} fill="rgba(0,0,0,0.16)" rx={2.5}/>
            {/* 2단 badge */}
            {double && p.w > 18 && p.h > 16 && (
              <>
                <rect x={p.x + p.w - 18} y={p.y + 2.5} width={16} height={12} rx={3.5}
                  fill="rgba(0,0,0,0.38)"/>
                <text x={p.x + p.w - 10} y={p.y + 12} textAnchor="middle"
                  fontSize="8" fill="white" fontWeight="bold" fontFamily="sans-serif">2단</text>
              </>
            )}
          </g>
        );
      })}

      {/* Container border */}
      <rect x={CX} y={CY} width={CL} height={CW} fill="none" stroke="#8E92B2" strokeWidth="2.2" rx={5}/>

      {/* Grid lines */}
      {Array.from({ length: fit.rows + 1 }).map((_, i) => {
        const x = CX + i * palD_px;
        return x <= CX + CL + 1
          ? <line key={`v${i}`} x1={x} y1={CY} x2={x} y2={CY + CW} stroke="#C5C8DA" strokeWidth="0.8"/>
          : null;
      })}
      {Array.from({ length: fit.cols + 1 }).map((_, i) => {
        const y = CY + i * palW_px;
        return y <= CY + CW + 1
          ? <line key={`h${i}`} x1={CX} y1={y} x2={CX + CL} y2={y} stroke="#C5C8DA" strokeWidth="0.8"/>
          : null;
      })}

      {/* Cab block */}
      <rect x={CX - CAB_W - 5} y={CY - 13} width={CAB_W} height={CW + 26}
        fill="url(#cabG)" stroke="#ACACAC" strokeWidth="1.5" rx={7}/>
      <rect x={CX - CAB_W + 2} y={CY + CW * 0.08} width={CAB_W - 16} height={CW * 0.44}
        fill="rgba(150,205,245,0.80)" stroke="#85B9DC" strokeWidth="1" rx={3}/>
      <rect x={CX - 5} y={CY - 2} width={5} height={CW + 4} fill="#C0C0C0"/>

      {/* Loaded length annotation */}
      {loadedPx > 0 && loadedPx < CL - 3 && (
        <g>
          <line x1={CX + loadedPx} y1={CY - 24} x2={CX + loadedPx} y2={CY + CW + 10}
            stroke="#E74C3C" strokeWidth="1.5" strokeDasharray="5,3"/>
          <rect x={CX} y={CY - 35} width={loadedPx} height={13} rx={6.5}
            fill="rgba(231,76,60,0.10)"/>
          <line x1={CX + 5} y1={CY - 29} x2={CX + loadedPx - 5} y2={CY - 29}
            stroke="#E74C3C" strokeWidth="1.2"/>
          <polygon points={`${CX+5},${CY-29} ${CX+12},${CY-26} ${CX+12},${CY-32}`} fill="#E74C3C"/>
          <polygon points={`${CX+loadedPx-5},${CY-29} ${CX+loadedPx-12},${CY-26} ${CX+loadedPx-12},${CY-32}`} fill="#E74C3C"/>
          <text x={CX + loadedPx / 2} y={CY - 23} textAnchor="middle"
            fontSize="9.5" fill="#E74C3C" fontWeight="bold" fontFamily="sans-serif">
            {loadedM.toFixed(2)}m
          </text>
        </g>
      )}
      {(loadedPx <= 3 || loadedPx >= CL - 3) && (
        <text x={CX + CL / 2} y={CY - 16} textAnchor="middle"
          fontSize="10" fill="#AAAAAA" fontFamily="sans-serif">{truck.L.toFixed(1)}m</text>
      )}

      {/* Bottom ruler */}
      {(() => {
        const step = truck.L <= 4 ? 0.5 : truck.L <= 8 ? 1 : 2;
        const marks = [];
        for (let m = 0; m <= truck.L + 0.01; m += step) {
          const rx = CX + m * scale;
          const major = Math.round(m / step) % 2 === 0;
          marks.push(
            <g key={`r${m}`}>
              <line x1={rx} y1={CY + CW + 5} x2={rx} y2={CY + CW + (major ? 13 : 7)}
                stroke="#B0B0C0" strokeWidth={major ? 1 : 0.7}/>
              {major && (
                <text x={rx} y={CY + CW + 27} textAnchor="middle"
                  fontSize="9.5" fill="#9898A8" fontFamily="sans-serif">{m}m</text>
              )}
            </g>
          );
        }
        return marks;
      })()}
      <line x1={CX} y1={CY + CW + 5} x2={CX + CL} y2={CY + CW + 5} stroke="#BBBBC8" strokeWidth="1"/>

      {/* Width annotation */}
      <line x1={CX - CAB_W - 18} y1={CY} x2={CX - CAB_W - 18} y2={CY + CW} stroke="#C0C0C0" strokeWidth="1"/>
      <line x1={CX - CAB_W - 22} y1={CY} x2={CX - CAB_W - 14} y2={CY} stroke="#C0C0C0" strokeWidth="1"/>
      <line x1={CX - CAB_W - 22} y1={CY + CW} x2={CX - CAB_W - 14} y2={CY + CW} stroke="#C0C0C0" strokeWidth="1"/>
      <text x={CX - CAB_W - 28} y={CY + CW / 2 + 4} textAnchor="middle" fontSize="9.5" fill="#A0A0A8"
        fontFamily="sans-serif" transform={`rotate(-90,${CX-CAB_W-28},${CY+CW/2})`}>{truck.W}m</text>

      {/* Header badge */}
      <rect x={CX} y={5} width={CL} height={30} rx={15} fill="rgba(10,22,50,0.90)"/>
      <text x={CX + CL / 2} y={24} textAnchor="middle" fill="white" fontSize="11.5"
        fontWeight="700" fontFamily="sans-serif">
        {`${truck.name} · ${bodyType}  ·  파렛 ${cnt}개 적재  ·  ${fit.cols}열 × ${fit.rows}행  ·  최대 ${fit.count * layers}개`}
      </text>

      {/* Remaining space label */}
      {remainM > 0.05 && (
        <text x={CX + CL - 6} y={CY + CW / 2 + 4} textAnchor="end"
          fontSize="9" fill="#AEAEBF" fontFamily="sans-serif">
          여유 {remainM.toFixed(2)}m
        </text>
      )}
    </svg>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function PalletSimulator() {
  const [palletCompany, setPalletCompany] = useState("KPP");
  const [palletSize,    setPalletSize]    = useState("kpp-n11");
  const [mode,          setMode]          = useState("최적");
  const [stacking,      setStacking]      = useState("1단");
  const [weightVal,     setWeightVal]     = useState("");
  const [weightUnit,    setWeightUnit]    = useState("kg");
  const [palletCount,   setPalletCount]   = useState(4);
  const [bodyType,      setBodyType]      = useState("윙바디");
  const [selectedId,    setSelectedId]    = useState(null);

  const handleCompanyChange = (compId) => {
    setPalletCompany(compId);
    const first = PALLET_SIZES.find(ps => ps.cat === compId);
    if (first) setPalletSize(first.id);
  };

  const pSize = PALLET_SIZES.find(p => p.id === palletSize) || PALLET_SIZES[0];

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

  const loadedRows = displayRes
    ? Math.min(displayRes.fit.rows, Math.ceil(palletCount / Math.max(1, displayRes.fit.cols)))
    : 0;
  const loadedLength    = displayRes ? (loadedRows * displayRes.fit.pd).toFixed(2) : "0.00";
  const remainingLength = displayRes ? Math.max(0, displayRes.truck.L - loadedRows * displayRes.fit.pd).toFixed(2) : "0.00";

  const reset = () => {
    setPalletCompany("KPP"); setPalletSize("kpp-n11"); setMode("최적"); setStacking("1단");
    setWeightVal(""); setWeightUnit("kg"); setPalletCount(4);
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

      <div className="flex gap-5" style={{ height: "calc(100vh - 188px)", minHeight: "600px" }}>

        {/* ── 왼쪽 입력 (34%) ── */}
        <div className="flex-[34] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 파렛트 규격 — 2단계 (파레트사 → 크기) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[12px] font-bold text-[#1B2B4B]/50 mb-3 tracking-widest uppercase">파렛트 규격</div>

            {/* Step 1: 파레트사 선택 */}
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">① 파레트사 선택</div>
            <div className="flex flex-col gap-1.5 mb-4">
              {PALLET_COMPANIES.map(co => (
                <button key={co.id} onClick={() => handleCompanyChange(co.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    palletCompany === co.id
                      ? "border-[#1B2B4B] bg-[#1B2B4B]"
                      : "border-gray-200 bg-gray-50 hover:border-[#1B2B4B]/30 hover:bg-gray-100"
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                    palletCompany === co.id ? "border-white bg-white" : "border-gray-400 bg-white"
                  }`}>
                    {palletCompany === co.id && <div className="w-full h-full rounded-full bg-[#1B2B4B] scale-50"/>}
                  </div>
                  <div>
                    <div className={`text-[14px] font-bold leading-tight ${palletCompany === co.id ? "text-white" : "text-[#1B2B4B]"}`}>
                      {co.label}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${palletCompany === co.id ? "text-white/55" : "text-gray-400"}`}>
                      {co.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Step 2: 크기 선택 */}
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">② 크기 선택</div>
            <div className="flex flex-col gap-1.5">
              {PALLET_SIZES.filter(ps => ps.cat === palletCompany).map(ps => (
                <button key={ps.id} onClick={() => setPalletSize(ps.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    palletSize === ps.id
                      ? "border-[#1B2B4B] bg-[#1B2B4B]"
                      : "border-gray-200 bg-gray-50 hover:border-[#1B2B4B]/25 hover:bg-gray-100"
                  }`}>
                  {/* 모델 배지 */}
                  {ps.model && (
                    <span className={`flex-shrink-0 text-[11px] font-black px-2 py-0.5 rounded-lg min-w-[36px] text-center ${
                      palletSize === ps.id ? "bg-white/20 text-white" : "bg-[#1B2B4B]/10 text-[#1B2B4B]"
                    }`}>
                      {ps.model}
                    </span>
                  )}
                  <div className="flex-1">
                    <div className={`text-[14px] font-bold leading-tight ${palletSize === ps.id ? "text-white" : "text-[#1B2B4B]"}`}>
                      {ps.label} <span className={`text-[10px] font-normal ${palletSize === ps.id ? "text-white/50" : "text-gray-400"}`}>mm</span>
                    </div>
                    <div className={`text-[11px] mt-0.5 ${palletSize === ps.id ? "text-white/55" : "text-gray-400"}`}>
                      {ps.sub}
                    </div>
                  </div>
                  {palletSize === ps.id && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 적재 옵션 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[12px] font-bold text-[#1B2B4B]/50 mb-3 tracking-widest uppercase">적재 옵션</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">배치 방식</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden h-10">
                  {["최적","최대"].map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 text-[13px] font-bold transition ${mode===m?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">적재 단수</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden h-10">
                  {["1단","2단"].map(s => (
                    <button key={s} onClick={() => setStacking(s)}
                      className={`flex-1 text-[13px] font-bold transition ${stacking===s?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 중량·수량 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[12px] font-bold text-[#1B2B4B]/50 mb-3 tracking-widest uppercase">중량 · 수량</div>

            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1.5">파렛당 중량</div>
            <div className="flex gap-2 mb-4">
              <input type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)}
                placeholder="0" min="0"
                className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 text-[15px] font-bold text-[#1B2B4B] focus:border-[#1B2B4B] outline-none transition"/>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {["kg","톤"].map(u => (
                  <button key={u} onClick={() => setWeightUnit(u)}
                    className={`px-3 py-2 text-[13px] font-bold transition ${weightUnit===u?"bg-[#1B2B4B] text-white":"bg-white text-gray-500"}`}>{u}</button>
                ))}
              </div>
            </div>

            <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">파렛 수량</div>
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => setPalletCount(p => Math.max(1, p - 1))}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-[#1B2B4B] hover:text-white text-[18px] font-black flex items-center justify-center transition">−</button>
              <input type="number" min="1" max="20" value={palletCount}
                onChange={e => setPalletCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="flex-1 text-center py-1.5 text-[20px] font-black text-[#1B2B4B] border-2 border-[#1B2B4B]/20 rounded-xl focus:border-[#1B2B4B] outline-none"/>
              <button onClick={() => setPalletCount(p => Math.min(20, p + 1))}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-[#1B2B4B] hover:text-white text-[18px] font-black flex items-center justify-center transition">+</button>
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

        {/* ── 오른쪽 결과 (66%) ── */}
        <div className="flex-[66] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 트럭 시각화 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-shrink-0">
            {/* 차종 선택 탭 */}
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

            {/* 적재 길이 표시 */}
            {displayRes && (
              <div className="flex items-baseline justify-center gap-2 pt-3 pb-1">
                <span className="text-[13px] font-bold text-gray-600">적재 길이</span>
                <span className="text-[22px] font-black text-[#1B2B4B] underline underline-offset-2">{loadedLength}</span>
                <span className="text-[13px] font-bold text-gray-600">m</span>
                <span className="text-[12px] text-gray-400 ml-1">({displayRes.truck.name} 기준 여유길이 {remainingLength} m)</span>
              </div>
            )}

            {/* SVG 컨테이너 */}
            <div className="h-[360px]" style={{ background: "linear-gradient(160deg,#f3f5fa 0%,#e8ecf4 100%)" }}>
              {displayRes && (
                <TruckSideView
                  truck={displayRes.truck}
                  fit={displayRes.fit}
                  stacking={stacking}
                  bodyType={bodyType}
                  palletCount={palletCount}
                  pSize={pSize}
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

          {/* 전체 차량 비교 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">전체 차량 비교</div>
            <div className="grid grid-cols-5 gap-2">
              {results.map(r => {
                const isActive = selectedId === r.truck.id || (!selectedId && r === (okResults[0] || results[0]));
                const pct = r.maxPal > 0 ? Math.min(100, (palletCount / r.maxPal) * 100) : 100;
                return (
                  <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                    className={`flex flex-col gap-1.5 py-3.5 px-3 rounded-2xl border-2 transition-all text-left ${
                      isActive
                        ? "border-[#1B2B4B] bg-[#1B2B4B] shadow-md"
                        : r.ok
                          ? "border-gray-100 bg-white hover:border-[#1B2B4B]/25 hover:bg-gray-50"
                          : "border-gray-100 bg-gray-50/60 opacity-50 hover:opacity-75"
                    }`}>
                    <div className={`text-[12px] font-black leading-tight ${isActive ? "text-white" : "text-[#1B2B4B]"}`}>
                      {r.truck.name}
                    </div>
                    <div className={`text-[28px] font-black leading-none tracking-tight ${
                      isActive ? "text-white" : r.ok ? "text-[#1B2B4B]" : "text-red-500"
                    }`}>
                      {r.maxPal}
                      <span className={`text-[10px] font-semibold ml-0.5 ${isActive ? "text-white/50" : "text-gray-400"}`}>개</span>
                    </div>
                    <div className={`text-[9px] font-medium leading-tight ${isActive ? "text-white/50" : "text-gray-400"}`}>
                      {r.fit.cols}열×{r.fit.rows}행<br/>{r.truck.L}m
                    </div>
                    <div className={`w-full h-[3px] rounded-full overflow-hidden ${isActive ? "bg-white/20" : "bg-gray-100"}`}>
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          background: isActive ? "rgba(255,255,255,0.75)" : r.ok ? "#1B2B4B" : "#ef4444"
                        }}/>
                    </div>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full self-start ${
                      isActive
                        ? r.ok ? "bg-emerald-500/25 text-emerald-200" : "bg-red-500/25 text-red-200"
                        : r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    }`}>
                      {r.ok ? "가능" : "초과"}
                    </span>
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
