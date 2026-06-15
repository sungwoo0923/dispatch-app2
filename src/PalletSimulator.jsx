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

// Truck size markers for the comparison chart
const MARKERS = [
  { label: "5톤",           L: 6.2  },
  { label: "5톤+, 5톤+축",  L: 7.4  },
  { label: "11~15톤",       L: 9.1  },
  { label: "18톤, 22~25톤", L: 10.1 },
  { label: "추레라",        L: 13.6 },
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

// ── 트럭 3D 뷰 SVG (다불러 참고 스타일) ─────────────────────────────────────
function TruckSideView({ truck, fit, stacking, palletCount, pSize, bodyType }) {
  const VW = 900, VH = 400;
  const GY = 244;   // 지면 y

  // ── 화물칸 기하학 ────────────────────────────────────────────
  const BLX = 190;   // 화물칸 시작 x
  const BRX = 856;   // 추레라(13.6m) 끝 x
  const MAX_L = 13.6;
  const PX_M = (BRX - BLX) / MAX_L;  // ~48.97 px/m

  const BNY = GY;       // 가까운 모서리(하단) y
  const BSX = 20;       // 먼 모서리 x 오프셋(우)
  const BSY = 64;       // 먼 모서리 y 오프셋(상)
  const BFY = BNY - BSY; // 먼 모서리 y = 180

  const MAX_W = 2.45;
  const SX_M = BSX / MAX_W;
  const SY_M = BSY / MAX_W;

  const TRUCK_END_X = BLX + truck.L * PX_M;
  const isWing = bodyType === "윙바디";
  const WALL_H = 82;  // 윙바디 박스 벽 높이(px)

  // ── 파렛트 기하학 ────────────────────────────────────────────
  const palD   = fit.pd;
  const palDpx = palD * PX_M;
  const palWshX = (pSize.w / MAX_W) * BSX;
  const palWshY = (pSize.w / MAX_W) * BSY;
  const PAL_H  = Math.max(22, Math.min(42, palWshY * 0.88));
  const GAP    = 2;
  const layers = stacking === "2단" ? 2 : 1;

  // 파렛트 위치 생성
  const pallets = [];
  let cnt = 0;

  const pushPal = (bx, by) => {
    pallets.push({ bx, by, pw: palDpx - GAP, ph: PAL_H, dx: palWshX, dy: -palWshY });
    cnt++;
  };

  outer:
  for (let layer = 0; layer < layers; layer++) {
    for (let row = 0; row < fit.rows; row++) {
      for (let col = 0; col < fit.cols; col++) {
        if (cnt >= palletCount) break outer;
        pushPal(
          BLX + row * palDpx + col * palWshX,
          BNY - col * palWshY - layer * (PAL_H + GAP)
        );
      }
    }
    if (fit.mixed) {
      const m = fit.mixed;
      const mDpx = m.pd * PX_M;
      for (let row = 0; row < m.rows; row++) {
        for (let col = 0; col < m.cols; col++) {
          if (cnt >= palletCount) break outer;
          pushPal(
            BLX + m.offsetL * PX_M + row * mDpx + col * palWshX,
            BNY - col * palWshY - layer * (PAL_H + GAP)
          );
        }
      }
    }
  }

  // 먼 파렛트부터 먼저 그려야 앞쪽 파렛트가 위에 나옴
  pallets.sort((a, b) => a.by - b.by);

  // ── 바퀴 ─────────────────────────────────────────────────────
  const WR = 20;
  const WY = GY + WR + 1;
  const frontWX = 152;
  const rearFracs = truck.wc === 1 ? [0.55] : truck.wc === 2 ? [0.28, 0.68] : [0.2, 0.5, 0.8];
  const rearWXs   = rearFracs.map(f => BLX + truck.L * PX_M * f);

  const Wheel = ({ cx }) => (
    <g>
      <ellipse cx={cx} cy={WY} rx={WR} ry={WR * 0.9} fill="#3a3a3a"/>
      <ellipse cx={cx} cy={WY} rx={WR * 0.63} ry={WR * 0.56} fill="#555"/>
      <ellipse cx={cx} cy={WY} rx={WR * 0.23} ry={WR * 0.21} fill="#888"/>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full" style={{ userSelect: "none" }}>

      {/* ── 화물칸 표면 (평행사변형) ── */}
      <polygon
        points={`${BLX},${BNY} ${BRX},${BNY} ${BRX+BSX},${BFY} ${BLX+BSX},${BFY}`}
        fill="#CECECE" stroke="#B0B0B0" strokeWidth="1"/>

      {/* 화물칸 깊이 가이드선 */}
      {[0.2, 0.4, 0.6, 0.8].map((f, i) => {
        const x = BLX + (BRX - BLX) * f;
        return <line key={i} x1={x} y1={BNY} x2={x + BSX} y2={BFY}
          stroke="#C0C0C0" strokeWidth="0.6" strokeDasharray="4,3"/>;
      })}

      {/* 가까운 레일(굵게) */}
      <line x1={BLX} y1={BNY} x2={BRX} y2={BNY} stroke="#A8A8A8" strokeWidth="2.5"/>
      {/* 먼 레일 */}
      <line x1={BLX+BSX} y1={BFY} x2={BRX+BSX} y2={BFY} stroke="#B8B8B8" strokeWidth="1.2"/>
      {/* 왼쪽 세로 레일 */}
      <line x1={BLX} y1={BNY} x2={BLX+BSX} y2={BFY} stroke="#B0B0B0" strokeWidth="1.2"/>
      {/* 현재 트럭 끝 표시 */}
      <line x1={TRUCK_END_X} y1={BNY} x2={TRUCK_END_X+BSX} y2={BFY}
        stroke="#909090" strokeWidth="1.5"/>

      {/* 오른쪽 끝 레일 */}
      <line x1={BRX} y1={BNY} x2={BRX+BSX} y2={BFY} stroke="#B0B0B0" strokeWidth="1.2"/>

      {/* ── 차종별 길이 마커 (말풍선 박스) ── */}
      {MARKERS.map((m, i) => {
        const mx = BLX + m.L * PX_M;
        if (mx > BRX + 5) return null;
        const isCur = Math.abs(m.L - truck.L) < 0.05;
        const BW = 68, BH = 32;
        // 2줄로 엇갈려 아래에 배치
        const row = i % 2;
        const by = GY + 16 + row * 44;
        const bx = Math.max(BLX - 4, Math.min(BRX - BW + 4, mx - BW / 2));
        const lineTip = bx + BW / 2;
        return (
          <g key={i}>
            <line x1={mx} y1={GY + 2} x2={lineTip} y2={by - 1}
              stroke={isCur ? "#1B2B4B" : "#BBBBBB"} strokeWidth={isCur ? 1.6 : 1}/>
            <rect x={bx} y={by} width={BW} height={BH} rx={5}
              fill={isCur ? "#1B2B4B" : "white"}
              stroke={isCur ? "#1B2B4B" : "#CCCCCC"} strokeWidth={isCur ? 1.5 : 1}/>
            <text x={bx + BW / 2} y={by + 12} textAnchor="middle"
              fill={isCur ? "white" : "#555"} fontSize="8" fontWeight={isCur ? "bold" : "600"}
              fontFamily="sans-serif">{m.label}</text>
            <text x={bx + BW / 2} y={by + 25} textAnchor="middle"
              fill={isCur ? "rgba(255,255,255,0.9)" : "#888"} fontSize="9.5" fontWeight="bold"
              fontFamily="sans-serif">{m.L.toFixed(2)}m</text>
          </g>
        );
      })}

      {/* ── 파렛트 (3D 박스, 빨간색) ── */}
      {pallets.map((p, i) => (
        <g key={i}>
          {/* 윗면 — 4th point must use by-ph+dy, not by+dy */}
          <polygon
            points={`${p.bx},${p.by-p.ph} ${p.bx+p.pw},${p.by-p.ph} ${p.bx+p.pw+p.dx},${p.by-p.ph+p.dy} ${p.bx+p.dx},${p.by-p.ph+p.dy}`}
            fill="#E74C3C" stroke="#C0392B" strokeWidth="0.7"/>
          {/* 앞면 */}
          <rect x={p.bx} y={p.by-p.ph} width={p.pw} height={p.ph}
            fill="#C0392B" stroke="#922B21" strokeWidth="0.7"/>
          {/* 오른쪽 측면 */}
          <polygon
            points={`${p.bx+p.pw},${p.by-p.ph} ${p.bx+p.pw+p.dx},${p.by-p.ph+p.dy} ${p.bx+p.pw+p.dx},${p.by+p.dy} ${p.bx+p.pw},${p.by}`}
            fill="#922B21" stroke="#922B21" strokeWidth="0.7"/>
        </g>
      ))}

      {/* 파렛 수량 표시 */}
      {cnt > 0 && (() => {
        const last = pallets.reduce((m, p) => (p.bx + p.pw > m.bx + m.pw ? p : m), pallets[0]);
        return (
          <text x={last.bx + last.pw * 0.5} y={last.by + 5}
            textAnchor="middle" fill="white" fontSize="14" fontWeight="900"
            stroke="#922B21" strokeWidth="0.5" fontFamily="sans-serif">
            {cnt}
          </text>
        );
      })()}

      {/* ── 윙바디 박스 (파렛 위에 덮어 그림) ── */}
      {isWing && (() => {
        const ex = TRUCK_END_X;
        const nt = BNY - WALL_H;      // near side top y
        const ft = BFY - WALL_H;      // far side top y
        return (
          <g>
            {/* 먼 쪽 벽 (배경) */}
            <polygon
              points={`${BLX+BSX},${BFY} ${ex+BSX},${BFY} ${ex+BSX},${ft} ${BLX+BSX},${ft}`}
              fill="#AAAAAA" stroke="#999" strokeWidth="1"/>
            {/* 지붕 */}
            <polygon
              points={`${BLX},${nt} ${ex},${nt} ${ex+BSX},${ft} ${BLX+BSX},${ft}`}
              fill="#CCCCCC" stroke="#AAAAAA" strokeWidth="1.2"/>
            {/* 가까운 쪽 벽 (반투명 — 안의 파렛 보임) */}
            <rect x={BLX} y={nt} width={ex - BLX} height={WALL_H}
              fill="rgba(210,210,210,0.50)" stroke="#BBBBBB" strokeWidth="1.4"/>
            {/* 패널 구분선 */}
            {[0.33, 0.66].map((f, i) => (
              <line key={i}
                x1={BLX + (ex - BLX) * f} y1={nt}
                x2={BLX + (ex - BLX) * f} y2={BNY}
                stroke="#B8B8B8" strokeWidth="0.9" strokeDasharray="4,4"/>
            ))}
            {/* 윙 힌지선 (중간 가로선) */}
            <line x1={BLX} y1={nt + WALL_H * 0.5} x2={ex} y2={nt + WALL_H * 0.5}
              stroke="#A0A0A0" strokeWidth="1" strokeDasharray="7,4"/>
            {/* 후면 벽 */}
            <polygon
              points={`${ex},${BNY} ${ex+BSX},${BFY} ${ex+BSX},${ft} ${ex},${nt}`}
              fill="#B8B8B8" stroke="#999" strokeWidth="1"/>
          </g>
        );
      })()}

      {/* ── 바퀴 ── */}
      <Wheel cx={frontWX}/>
      {rearWXs.map((cx, i) => <Wheel key={i} cx={cx}/>)}

      {/* ── 격벽 (캡↔화물칸 구분) ── */}
      <rect x={186} y={GY - 112} width={14} height={112} fill="#E0E0E0" stroke="#C0C0C0" strokeWidth="1"/>
      <rect x={187} y={GY - 108} width={12} height={104} fill="#F4F4F4" stroke="none"/>

      {/* ── 캡 본체 ── */}
      {/* 캡 윗면 (3D top face) */}
      <polygon
        points={`20,${GY-118} 186,${GY-118} ${186+BSX},${GY-118-BSY} ${20+BSX},${GY-118-BSY}`}
        fill="#E2E2E2" stroke="#C4C4C4" strokeWidth="1"/>
      {/* 에어 디플렉터 줄 */}
      {[0.3, 0.6].map((f, i) => (
        <line key={i}
          x1={20 + f * 166} y1={GY - 118}
          x2={20 + BSX + f * 166} y2={GY - 118 - BSY}
          stroke="#CCCCCC" strokeWidth="0.7"/>
      ))}
      {/* 캡 측면 */}
      <rect x={20} y={GY - 118} width={166} height={118} fill="#DCDCDC" stroke="#C0C0C0" strokeWidth="1.5" rx={6}/>
      {/* 앞유리 */}
      <path d={`M 60,${GY-108} L 186,${GY-113} L 186,${GY-52} L 60,${GY-48} Z`}
        fill="#D8E8F4" stroke="#B8C8D8" strokeWidth="1.2"/>
      {/* 사이드 윈도 */}
      <rect x={22} y={GY-108} width={36} height={44} fill="#D8E8F4" stroke="#B8C8D8" strokeWidth="1" rx={2}/>
      {/* 도어선 */}
      <line x1={60} y1={GY-112} x2={60} y2={GY-6} stroke="#C0C0C0" strokeWidth="1.2"/>
      {/* 도어 핸들 */}
      <rect x={72} y={GY-46} width={18} height={5} fill="#B8B8B8" rx={2}/>
      {/* 미러 */}
      <rect x={186} y={GY-94} width={16} height={10} fill="#C8C8C8" stroke="#B0B0B0" strokeWidth="0.8" rx={1}/>
      <line x1={194} y1={GY-90} x2={200} y2={GY-90} stroke="#B0B0B0" strokeWidth="1"/>
      {/* 헤드라이트 */}
      <rect x={21} y={GY-56} width={17} height={12} fill="#FFFFCC" stroke="#CCCC00" strokeWidth="0.5" rx={1}/>
      <rect x={21} y={GY-42} width={17} height={9} fill="#FFF8CC" stroke="#CCCC00" strokeWidth="0.5" rx={1}/>
      {/* 그릴 */}
      <rect x={21} y={GY-30} width={26} height={22} fill="#555" rx={2}/>
      {[0.32, 0.66].map(f => (
        <line key={f} x1={22} y1={GY-30+22*f} x2={45} y2={GY-30+22*f} stroke="#777" strokeWidth="0.8"/>
      ))}
      {/* 캡 하단 스커트 */}
      <rect x={20} y={GY-10} width={168} height={10} fill="#C8C8C8" stroke="#B0B0B0" strokeWidth="0.8"/>
      {/* 번호판 */}
      <rect x={48} y={GY-20} width={60} height={18} fill="#E8E8E8" stroke="#AAA" strokeWidth="0.5" rx={1}/>

      {/* ── 배지 ── */}
      <rect x={VW-198} y={6} width={190} height={44} rx={20} fill="rgba(15,30,56,0.82)"/>
      <text x={VW-103} y={25} textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">
        {`파렛 ${cnt}개 적재`}
      </text>
      <text x={VW-103} y={41} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="10" fontFamily="sans-serif">
        {`최대 ${fit.count * layers}개 · ${fit.cols}열 × ${fit.rows}행`}
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
  const [palletCount, setPalletCount]= useState(4);
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

  // 적재 길이 계산
  const loadedRows = displayRes
    ? Math.min(displayRes.fit.rows, Math.ceil(palletCount / Math.max(1, displayRes.fit.cols)))
    : 0;
  const loadedLength    = displayRes ? (loadedRows * displayRes.fit.pd).toFixed(2) : "0.00";
  const remainingLength = displayRes ? Math.max(0, displayRes.truck.L - loadedRows * displayRes.fit.pd).toFixed(2) : "0.00";

  const reset = () => {
    setPalletSize("10x12"); setMode("최적"); setStacking("1단");
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

      <div className="flex gap-5" style={{ height: "calc(100vh - 188px)", minHeight: "580px" }}>

        {/* ── 왼쪽 입력 (36%) ── */}
        <div className="flex-[36] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

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

            {/* 파렛 수량 — +/- 버튼 + 슬라이더 */}
            <div className="text-[11px] text-gray-500 font-semibold mb-2">파렛 수량</div>
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

        {/* ── 오른쪽 결과 (64%) ── */}
        <div className="flex-[64] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 트럭 시각화 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-shrink-0">
            {/* 헤더: 차종 선택 탭 */}
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

            {/* SVG */}
            <div className="h-[340px]" style={{ background: "linear-gradient(160deg,#f6f8fc 0%,#eef1f7 100%)" }}>
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
            <div className="space-y-2">
              {results.map(r => {
                const isActive = selectedId === r.truck.id || (!selectedId && r === (okResults[0] || results[0]));
                const loadedPct = r.maxPal > 0 ? Math.min(100, (palletCount / r.maxPal) * 100) : 100;
                return (
                  <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition text-left ${isActive ? "border-[#1B2B4B] bg-[#1B2B4B]/4" : r.ok ? "border-gray-100 hover:border-gray-300 hover:bg-gray-50" : "border-gray-100 hover:bg-gray-50 opacity-75"}`}>
                    <div className={`w-[80px] text-[14px] font-black flex-shrink-0 ${isActive?"text-[#1B2B4B]":"text-gray-700"}`}>
                      {r.truck.name}
                    </div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div className="h-full rounded-lg transition-all duration-300"
                        style={{ width: `${loadedPct}%`, background: r.ok ? (isActive ? "#1B2B4B" : "#2d4a7a") : "#ef4444" }}/>
                      <div className="absolute inset-0 flex items-center px-2.5">
                        <span className={`text-[11px] font-semibold ${loadedPct > 48 ? "text-white" : r.ok ? "text-gray-600" : "text-red-700"}`}>
                          {r.truck.L}m · {r.fit.cols}열 × {r.fit.rows}행
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-[44px] text-right">
                      <div className={`text-[15px] font-black ${r.ok ? "text-[#1B2B4B]" : "text-red-500"}`}>{r.maxPal}개</div>
                    </div>
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
