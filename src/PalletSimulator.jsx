import React, { useState, useMemo } from "react";

const PALLET_SIZES = [
  { id: "08x12", label: "0.8 × 1.2m", w: 0.8, d: 1.2 },
  { id: "10x12", label: "1.0 × 1.2m", w: 1.0, d: 1.2 },
  { id: "11x11", label: "1.1 × 1.1m", w: 1.1, d: 1.1 },
  { id: "12x11", label: "1.2 × 1.1m", w: 1.2, d: 1.1 },
  { id: "13x11", label: "1.3 × 1.1m", w: 1.3, d: 1.1 },
];

const TRUCKS = [
  { id: "1ton",    name: "1톤",       L: 2.8,  W: 1.50, maxKg: 1000  },
  { id: "2.5ton",  name: "2.5톤",     L: 4.5,  W: 1.90, maxKg: 2500  },
  { id: "3.5ton",  name: "3.5톤",     L: 5.2,  W: 2.10, maxKg: 3500  },
  { id: "3.5tonW", name: "3.5톤광폭", L: 5.2,  W: 2.35, maxKg: 3800  },
  { id: "5ton",    name: "5톤",       L: 6.2,  W: 2.35, maxKg: 5000  },
  { id: "5tonP",   name: "5톤+",      L: 7.4,  W: 2.35, maxKg: 5500  },
  { id: "11ton",   name: "11톤",      L: 9.1,  W: 2.35, maxKg: 11000 },
  { id: "18ton",   name: "18톤",      L: 10.1, W: 2.40, maxKg: 18000 },
  { id: "25ton",   name: "25톤",      L: 11.2, W: 2.45, maxKg: 25000 },
  { id: "trailer", name: "추레라",    L: 13.6, W: 2.45, maxKg: 27000 },
];

function calcFit(truckL, truckW, pw, pd, mode) {
  const f = (l, w, a, b) => ({ cols: Math.floor(w / a), rows: Math.floor(l / b), count: Math.floor(w / a) * Math.floor(l / b), pw: a, pd: b });
  const a = f(truckL, truckW, pw, pd);
  const b = f(truckL, truckW, pd, pw);
  if (mode === "최적") return a.count >= b.count ? a : b;
  if (a.count >= b.count) {
    const extra = f(truckL - a.rows * a.pd, truckW, pd, pw);
    return { ...a, count: a.count + extra.count, mixed: extra.count > 0 ? { ...extra, offsetL: a.rows * a.pd } : null };
  } else {
    const extra = f(truckL - b.rows * b.pd, truckW, pw, pd);
    return { ...b, count: b.count + extra.count, mixed: extra.count > 0 ? { ...extra, offsetL: b.rows * b.pd } : null };
  }
}

// ── 3D 이소메트릭 투영 (트럭 길이=X, 높이=Y, 폭=Z) ──────────────────────
// 시점: 우측 전면 위에서 바라봄 (카트그래프 스타일)
const SC_BASE = 40; // 기본 스케일 (1m → px)
const IX = [0.866, 0.25];  // X축 방향벡터 (오른쪽 + 약간 아래)
const IY = [0, -1.0];      // Y축 방향벡터 (위로)
const IZ = [-0.5, 0.29];   // Z축 방향벡터 (왼쪽 + 아래 = 깊이감)

function iso(x, y, z, sc) {
  return [
    (x * IX[0] + y * IY[0] + z * IZ[0]) * sc,
    (x * IX[1] + y * IY[1] + z * IZ[1]) * sc,
  ];
}

function pts(points) {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// 3D 박스 그리기 (x,y,z = 원점, lx,ly,lz = 크기)
function Box3D({ ox, oy, oz, lx, ly, lz, sc, top, left, right, stroke = "rgba(0,0,0,0.18)", sw = 0.6 }) {
  const p = (x, y, z) => iso(ox + x, oy + y, oz + z, sc);
  // Top face: (0,ly,0) (lx,ly,0) (lx,ly,lz) (0,ly,lz)
  const top4 = [p(0,ly,0), p(lx,ly,0), p(lx,ly,lz), p(0,ly,lz)];
  // Left face (near, z=0): (0,0,0) (lx,0,0) (lx,ly,0) (0,ly,0)
  // Actually "front" face facing viewer = z=0 face... let me reconsider.
  // With our projection, z=0 is "near". The face at z=0 faces viewer.
  // Front face (z=0): (0,0,0) (lx,0,0) (lx,ly,0) (0,ly,0)
  const front4 = [p(0,0,0), p(lx,0,0), p(lx,ly,0), p(0,ly,0)];
  // Right face (x=lx): (lx,0,0) (lx,0,lz) (lx,ly,lz) (lx,ly,0)
  const right4 = [p(lx,0,0), p(lx,0,lz), p(lx,ly,lz), p(lx,ly,0)];
  return (
    <g>
      <polygon points={pts(front4)} fill={left} stroke={stroke} strokeWidth={sw}/>
      <polygon points={pts(right4)} fill={right} stroke={stroke} strokeWidth={sw}/>
      <polygon points={pts(top4)} fill={top} stroke={stroke} strokeWidth={sw}/>
    </g>
  );
}

// ── 트럭 3D SVG 시각화 ────────────────────────────────────────────────────
function TruckView3D({ truck, fit, palW, palD, stacking, bodyType, palletCount }) {
  const W = 900, H = 360;

  // 트럭 치수 (m 단위)
  const tL = truck.L;   // 화물칸 길이
  const tW = truck.W;   // 화물칸 폭
  const bedH = 0.2;     // 바닥 두께
  const bedY = 0.9;     // 지면에서 화물칸 바닥까지
  const singleCargoH = stacking === "2단" ? 2.6 : 1.4; // 화물 높이
  const cabL = 2.0;     // 캡 길이 (앞으로 음수)
  const cabH = 2.6;     // 캡 높이
  const tireR = 0.45;   // 타이어 반지름

  // 동적 스케일: 트럭 길이에 맞게
  const maxL = 14;
  const sc = Math.min(SC_BASE * 13 / maxL, SC_BASE * 13 / tL) * (tL <= 5 ? 1.15 : 1);
  const scaledSC = Math.max(24, Math.min(sc, 52));

  // 원점 (캡 앞면 하단)을 SVG 중앙-왼쪽에 배치
  const originX = W * 0.13;
  const originY = H * 0.80;

  const P = (x, y, z) => {
    const [sx, sy] = iso(x, y, z, scaledSC);
    return [originX + sx, originY + sy];
  };
  const PTS = (...args) => pts(args.map(([x,y,z]) => P(x,y,z)));

  // 파렛 배치 계산
  const palH = 0.15;  // 파렛 두께 (m)
  const layers = stacking === "2단" ? 2 : 1;
  const loaded = Math.min(palletCount, fit.count * layers);

  // 파렛 목록 생성 (x=트럭길이, z=폭 방향)
  const pallets = [];
  let cnt = 0;
  for (let layer = 0; layer < layers && cnt < loaded; layer++) {
    for (let r = 0; r < fit.rows && cnt < loaded; r++) {
      for (let c = 0; c < fit.cols && cnt < loaded; c++) {
        pallets.push({
          ox: r * fit.pd,
          oy: bedY + bedH + layer * (palH + 0.02),
          oz: c * fit.pw,
          lx: fit.pd - 0.04,
          ly: palH,
          lz: fit.pw - 0.04,
        });
        cnt++;
      }
    }
    if (fit.mixed) {
      const m = fit.mixed;
      for (let r = 0; r < m.rows && cnt < loaded; r++) {
        for (let c = 0; c < m.cols && cnt < loaded; c++) {
          pallets.push({
            ox: m.offsetL + r * m.pd,
            oy: bedY + bedH + layer * (palH + 0.02),
            oz: c * m.pw,
            lx: m.pd - 0.04,
            ly: palH,
            lz: m.pw - 0.04,
          });
          cnt++;
        }
      }
    }
  }

  // 바퀴 위치
  const wheels = [];
  const tirePositions = [
    ...(truck.maxKg <= 3800 ? [0.6, 0.82] : [0.28, 0.50, 0.74]),
  ];
  tirePositions.forEach(f => wheels.push(tL * f));

  const isWing = bodyType === "윙바디";

  // 색상
  const bedTopC  = "#c8c8c8";
  const bedFaceC = "#b0b0b0";
  const bedSideC = "#a0a0a0";
  const cabTopC  = "#d0d5de";
  const cabFaceC = "#bcc2cc";
  const cabSideC = "#a8aeb8";
  const wingC    = "#e8edf5";
  const wingDarkC= "#c0c8d8";
  const palTopC  = "#f87171";
  const palFaceC = "#dc2626";
  const palSideC = "#b91c1c";

  // SVG 좌표 도우미
  const box = (ox, oy, oz, lx, ly, lz, top, left, right, sw = 0.5) => (
    <Box3D key={`${ox}-${oy}-${oz}`} ox={ox} oy={oy} oz={oz} lx={lx} ly={ly} lz={lz} sc={scaledSC}
      top={top} left={left} right={right}
      stroke="rgba(0,0,0,0.15)" sw={sw}
    />
  );

  // 바퀴 그리기 (3D 실린더 근사)
  function Wheel({ xPos }) {
    const wr = tireR;
    const wt = tW * 0.12; // 타이어 두께
    const cy = bedY - wr; // 바퀴 중심 높이
    // 앞면 타이어 원
    const [cx1, cy1] = P(xPos, cy, 0);
    const [cx2, cy2] = P(xPos, cy, tW);
    // isometric circle → ellipse 근사
    const rx = wr * scaledSC * 0.5;
    const ry = wr * scaledSC;
    return (
      <g>
        {/* 타이어 측면 */}
        <polygon fill="#1a1a1a" stroke="none"
          points={PTS([xPos, cy - wr, 0.05], [xPos, cy + wr, 0.05], [xPos, cy + wr, tW * 0.22], [xPos, cy - wr, tW * 0.22])}/>
        {/* 앞면 타이어 */}
        <ellipse cx={cx1} cy={cy1} rx={rx * 0.72} ry={ry} fill="#222" stroke="#333" strokeWidth={0.5}/>
        <ellipse cx={cx1} cy={cy1} rx={rx * 0.42} ry={ry * 0.6} fill="#555"/>
        <ellipse cx={cx1} cy={cy1} rx={rx * 0.16} ry={ry * 0.22} fill="#888"/>
        {/* 뒷면 타이어 (쌍 타이어) */}
        {truck.maxKg > 2500 && (
          <>
            <ellipse cx={cx2} cy={cy2} rx={rx * 0.72} ry={ry} fill="#222" stroke="#333" strokeWidth={0.5}/>
            <ellipse cx={cx2} cy={cy2} rx={rx * 0.42} ry={ry * 0.6} fill="#555"/>
          </>
        )}
        {/* 축 */}
        <line x1={cx1} y1={cy1} x2={cx2} y2={cy2} stroke="#666" strokeWidth={1.5}/>
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ userSelect: "none" }}>
      <defs>
        <filter id="groundShadow">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.2 0" in="blur" result="shadow"/>
          <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="groundGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.12)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
        </radialGradient>
      </defs>

      {/* 그림자 */}
      <ellipse cx={originX + iso(tL * 0.5, 0, tW * 0.5, scaledSC)[0]}
               cy={originY + iso(tL * 0.5, 0, tW * 0.5, scaledSC)[1] + 8}
               rx={(tL + cabL) * scaledSC * 0.5} ry={(tW) * scaledSC * 0.15}
               fill="url(#groundGrad)"/>

      <g>
        {/* ── 화물칸 바닥 ── */}
        {box(0, bedY, 0, tL, bedH, tW, bedTopC, bedFaceC, bedSideC, 0.6)}

        {/* ── 윙바디 벽/지붕 ── */}
        {isWing && (
          <>
            {/* 뒷판 */}
            {box(tL, bedY + bedH, 0, 0.05, singleCargoH, tW, wingC, wingDarkC, wingC)}
            {/* 앞판 */}
            {box(0, bedY + bedH, 0, 0.05, singleCargoH, tW, wingC, wingDarkC, wingC)}
            {/* 지붕 */}
            {box(0, bedY + bedH + singleCargoH, 0, tL, 0.08, tW, wingC, wingDarkC, wingDarkC, 0.4)}
            {/* 옆벽 (z=tW 면, 뷰어 반대쪽) */}
            {box(0, bedY + bedH, tW - 0.05, tL, singleCargoH, 0.05, wingC, wingDarkC, wingDarkC, 0.3)}
          </>
        )}

        {/* ── 파렛트 ── (후면부터 그려서 앞면이 위에 오도록) */}
        {[...pallets].reverse().map((p, i) => (
          <Box3D key={i} ox={p.ox} oy={p.oy} oz={p.oz} lx={p.lx} ly={p.ly} lz={p.lz}
            sc={scaledSC} top={palTopC} left={palFaceC} right={palSideC} sw={0.5}
            stroke="rgba(0,0,0,0.25)"/>
        ))}

        {/* ── 바퀴 ── */}
        {wheels.map((x, i) => <Wheel key={i} xPos={x}/>)}
        {/* 앞바퀴 */}
        <Wheel xPos={-0.5}/>

        {/* ── 캡 ── */}
        {/* 캡 본체 */}
        {box(-cabL, 0, 0, cabL, cabH, tW, cabTopC, cabFaceC, cabSideC, 0.7)}

        {/* 앞 범퍼 */}
        {box(-cabL - 0.15, 0, 0.05, 0.15, 0.55, tW - 0.1, "#aaa", "#888", "#999", 0.5)}

        {/* 앞유리 (캡 앞면 x = -cabL 위치) */}
        {(() => {
          const glassY0 = cabH * 0.48, glassY1 = cabH * 0.94;
          const glassZ0 = tW * 0.05, glassZ1 = tW * 0.95;
          return (
            <polygon
              points={PTS([-cabL, glassY0, glassZ0], [-cabL, glassY0, glassZ1], [-cabL, glassY1, glassZ1], [-cabL, glassY1, glassZ0])}
              fill="#93c5fd" fillOpacity={0.55} stroke="rgba(255,255,255,0.6)" strokeWidth={1}/>
          );
        })()}

        {/* 사이드 미러 */}
        {(() => {
          const [mx, my] = P(-cabL * 0.08, cabH * 0.78, 0);
          return <rect x={mx - 8} y={my - 4} width={14} height={9} fill="#888" rx={2} stroke="#666" strokeWidth={0.5}/>;
        })()}

        {/* 헤드라이트 */}
        {(() => {
          const [lx1, ly1] = P(-cabL - 0.15, 0.75, tW * 0.12);
          const [lx2, ly2] = P(-cabL - 0.15, 0.75, tW * 0.72);
          return (
            <>
              <ellipse cx={lx1} cy={ly1} rx={scaledSC * 0.18} ry={scaledSC * 0.1} fill="#fef08a" stroke="#d97706" strokeWidth={0.5}/>
              <ellipse cx={lx2} cy={ly2} rx={scaledSC * 0.18} ry={scaledSC * 0.1} fill="#fef08a" stroke="#d97706" strokeWidth={0.5}/>
            </>
          );
        })()}

        {/* ── 배지: 적재 정보 ── */}
        <rect x={W - 172} y={8} width={160} height={40} rx={20} fill="rgba(15,30,56,0.85)"/>
        <text x={W - 92} y={24} textAnchor="middle" fill="white" fontSize={12} fontWeight="700" fontFamily="sans-serif">
          {`파렛 ${loaded}개 적재`}
        </text>
        <text x={W - 92} y={38} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={10} fontFamily="sans-serif">
          {`최대 ${fit.count * layers}개 · ${fit.cols}열 × ${fit.rows}행`}
        </text>

        {/* ── 치수 표기 ── */}
        {(() => {
          const [ax, ay] = P(0, -0.05, tW * 0.5);
          const [bx, by] = P(tL, -0.05, tW * 0.5);
          return (
            <>
              <line x1={ax} y1={ay + 18} x2={bx} y2={by + 18} stroke="#94a3b8" strokeWidth={1}/>
              <line x1={ax} y1={ay + 12} x2={ax} y2={ay + 24} stroke="#94a3b8" strokeWidth={1}/>
              <line x1={bx} y1={by + 12} x2={bx} y2={by + 24} stroke="#94a3b8" strokeWidth={1}/>
              <text x={(ax + bx) / 2} y={Math.max(ay, by) + 34} textAnchor="middle" fill="#64748b" fontSize={11} fontWeight="600" fontFamily="sans-serif">
                {truck.L}m × {truck.W}m
              </text>
            </>
          );
        })()}
      </g>
    </svg>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function PalletSimulator() {
  const [palletSize, setPalletSize] = useState("10x12");
  const [mode,       setMode]       = useState("최적");
  const [stacking,   setStacking]   = useState("1단");
  const [weightVal,  setWeightVal]  = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [palletCount,setPalletCount]= useState(8);
  const [bodyType,   setBodyType]   = useState("윙바디");
  const [selectedId, setSelectedId] = useState(null);

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

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-[20px] font-black text-[#1B2B4B] leading-tight">차량 제원 · 파렛트 적재</h2>
        <p className="text-[12px] text-gray-400 font-medium mt-0.5">파렛트 규격과 수량을 입력하면 즉시 시뮬레이션됩니다</p>
      </div>

      <div className="flex gap-5" style={{ height: "calc(100vh - 178px)", minHeight: "590px" }}>

        {/* ── 왼쪽 입력 (38%) ── */}
        <div className="flex-[38] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 파렛트 규격 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[10px] font-bold text-[#1B2B4B]/35 mb-2.5 tracking-widest uppercase">파렛트 규격</div>
            <div className="grid grid-cols-1 gap-1.5">
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
                <div className="text-[11px] text-gray-500 font-semibold mb-1.5">배치</div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden h-9">
                  {["최적","최대"].map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`flex-1 text-[12px] font-bold transition ${mode===m?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 font-semibold mb-1.5">단수</div>
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
            <div className="flex gap-2 mb-3">
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
                className="w-16 text-center text-[15px] font-black text-[#1B2B4B] border-2 border-[#1B2B4B]/20 rounded-xl focus:border-[#1B2B4B] outline-none"/>
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
              <div className="mt-2.5 rounded-xl bg-[#1B2B4B]/5 px-3 py-2 flex justify-between">
                <span className="text-[11px] text-gray-500 font-semibold">총 중량</span>
                <span className="text-[12px] font-black text-[#1B2B4B]">
                  {totalKg >= 1000 ? `${(totalKg / 1000).toFixed(2)}톤` : `${totalKg.toLocaleString()}kg`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽 결과 (62%) ── */}
        <div className="flex-[62] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 3D 트럭 시각화 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-shrink-0">
            {/* 상단: 바디 타입 선택 + 차량 탭 */}
            <div className="flex items-center border-b border-gray-100 px-3">
              {["윙바디","카고"].map(t => (
                <button key={t} onClick={() => setBodyType(t)}
                  className={`px-4 py-2.5 text-[12px] font-bold transition border-b-2 ${bodyType===t?"border-[#1B2B4B] text-[#1B2B4B]":"border-transparent text-gray-400 hover:text-gray-600"}`}>{t}</button>
              ))}
              <div className="ml-auto flex items-center gap-1 py-1">
                {results.filter(r=>r.ok).slice(0,5).map(r => (
                  <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${selectedId===r.truck.id||(!selectedId&&r===okResults[0])?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {r.truck.name}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG 3D 뷰 */}
            <div className="h-[260px]" style={{ background: "linear-gradient(160deg,#f5f8fc 0%,#e8eef5 100%)" }}>
              {displayRes && (
                <TruckView3D
                  truck={displayRes.truck}
                  fit={displayRes.fit}
                  palW={pSize.w}
                  palD={pSize.d}
                  stacking={stacking}
                  bodyType={bodyType}
                  palletCount={palletCount}
                />
              )}
            </div>
          </div>

          {/* 결과 상세 카드 */}
          {displayRes && (
            <div className={`rounded-2xl shadow-lg border flex-shrink-0 ${displayRes.ok?"border-[#1B2B4B]/10":"border-red-200"}`}
              style={{ background: displayRes.ok ? "linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)" : "linear-gradient(150deg,#450a0a,#7f1d1d)" }}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[22px] font-black text-white">{displayRes.truck.name}</div>
                    <div className="text-[11px] text-white/50">{displayRes.truck.L}m × {displayRes.truck.W}m · {bodyType}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[12px] font-black border ${displayRes.ok?"bg-emerald-400/18 text-emerald-300 border-emerald-400/30":"bg-red-400/18 text-red-300 border-red-400/30"}`}>
                    {displayRes.ok ? "적재 가능" : "초과"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { l:"최대 적재", v:`${displayRes.maxPal}개`, s:`${stacking}/${displayRes.fit.count}/단`, ok:true },
                    { l:"요청 수량", v:`${palletCount}개`, s:displayRes.palletOk?`여유 ${displayRes.maxPal-palletCount}개`:`${palletCount-displayRes.maxPal}개 초과`, ok:displayRes.palletOk },
                    { l:"배치", v:`${displayRes.fit.cols}×${displayRes.fit.rows}`, s:`열×행`, ok:true },
                    { l:"총 중량", v:totalKg===0?"—":totalKg>=1000?`${(totalKg/1000).toFixed(1)}t`:`${totalKg.toLocaleString()}kg`,
                      s:totalKg===0?"미입력":displayRes.weightOk?`최대${(displayRes.truck.maxKg/1000).toFixed(0)}t`:`초과`, ok:displayRes.weightOk },
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
            <div className="text-[10px] font-bold text-[#1B2B4B]/35 mb-3 tracking-widest uppercase">전체 차량 비교</div>
            <div className="space-y-1.5">
              {results.map(r => {
                const isActive = selectedId === r.truck.id || (!selectedId && r === (okResults[0] || results[0]));
                const loaded = Math.min(palletCount, r.maxPal);
                const pct = r.maxPal > 0 ? (loaded / r.maxPal) * 100 : 0;
                return (
                  <button key={r.truck.id} onClick={() => setSelectedId(r.truck.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${isActive?"border-[#1B2B4B] bg-[#1B2B4B]/5":"border-gray-100 hover:border-gray-200 hover:bg-gray-50"}`}>
                    {/* 차량명 */}
                    <div className={`w-[70px] text-[12px] font-black text-left flex-shrink-0 ${isActive?"text-[#1B2B4B]":"text-gray-700"}`}>
                      {r.truck.name}
                    </div>
                    {/* 진행바 */}
                    <div className="flex-1 h-5 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div className="h-full rounded-lg transition-all duration-300"
                        style={{ width: `${pct}%`, background: r.ok ? (isActive ? "#1B2B4B" : "#334d6e") : "#ef4444" }}/>
                      <div className="absolute inset-0 flex items-center px-2">
                        <span className={`text-[10px] font-bold ${pct > 45 ? "text-white" : r.ok ? "text-gray-600" : "text-red-700"}`}>
                          {r.truck.L}m · {r.fit.cols}열×{r.fit.rows}행
                        </span>
                      </div>
                    </div>
                    {/* 수량 */}
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-[13px] font-black ${r.ok ? "text-[#1B2B4B]" : "text-red-500"}`}>{r.maxPal}개</div>
                      <div className="text-[9px] text-gray-400">최대</div>
                    </div>
                    {/* 상태 */}
                    <div className={`flex-shrink-0 w-[34px] text-[10px] font-black text-center py-0.5 rounded-lg ${r.ok?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-600"}`}>
                      {r.ok?"가능":"초과"}
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
