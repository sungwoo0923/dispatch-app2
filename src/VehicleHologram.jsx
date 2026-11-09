// ======================= src/VehicleHologram.jsx =======================
// ⭐ 2026-11-09 차량 디지털 트윈(홀로그램) — 차량관리 › 차량 정보에서 [◈ 3D 차량 분석]
//  · 입력한 톤수·차량종류·제원으로 차량을 홀로그램처럼 그린다(드래그하면 회전)
//  · 제원을 다 입력하지 않았으면 톤수의 "일반 기준 제원"을 기본값으로 채워 보여 준다(기본값 표시)
//  · 타이어 위치별 교체 기록 — 교체한 타이어는 초록, 교체 시기가 지난 타이어는 빨간색으로 깜빡인다
//  · 스마트 분석: 차량 상태 점수 · 점검/소모품 경고 · 정비비 · 차령 · 장비
//  저장 위치: 차량관리대장 문서(vehicleLedger) — spec: { 제원 키: 값 }, tires: { 위치키: { date, km, brand, size, memo } }
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { specFor, tonClass, CARE_ITEMS, itemStatus, careSummary, vehicleDefaults, CLASS_LABEL } from "./vehicleCare";

const H = { bg: "#050B18", cyan: "#38E1FF", teal: "#2DF5C4", red: "#FF3B5C", amber: "#FFB547", line: "rgba(56,225,255,.28)", text: "#DDF6FF", sub: "#8FB7CC" };
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif";
const TAB = { fontVariantNumeric: "tabular-nums" };

// ── 톤수 표준화: "11.5톤" "11" "트랙터" → 제원표 키 ──
const TON_KEYS = ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "8톤", "9.5톤", "11톤", "14톤", "18톤", "22톤", "25톤"];
export function normTonKey(ton = "") {
  const t = String(ton || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/트랙터|추레라|트레일러/.test(t)) return "추레라";
  if (specFor(t)) return t; // "5톤 축" 같은 정확한 키
  const n = parseFloat(t.replace(/[^\d.]/g, ""));
  if (!n) return "";
  let best = TON_KEYS[0];
  TON_KEYS.forEach((k) => { if (parseFloat(k) <= n + 0.01) best = k; });
  return best;
}
// ── 톤급별 일반 차량 제원(참고값) — 국내 대표 차종 카탈로그 기준 근사치 ──
const GEN = {
  "1톤": { 전장: 5175, 전폭: 1740, 전고: 1970, 출력: 159, 총중량: 3300, 연료탱크: 65 },
  "1.4톤": { 전장: 5530, 전폭: 1740, 전고: 2010, 출력: 136, 총중량: 3700, 연료탱크: 65 },
  "2.5톤": { 전장: 6200, 전폭: 2040, 전고: 2300, 출력: 150, 총중량: 5500, 연료탱크: 100 },
  "3.5톤": { 전장: 6880, 전폭: 2170, 전고: 2380, 출력: 170, 총중량: 7200, 연료탱크: 100 },
  "5톤": { 전장: 8400, 전폭: 2490, 전고: 2890, 출력: 280, 총중량: 11000, 연료탱크: 200 },
  "8톤": { 전장: 9600, 전폭: 2490, 전고: 3050, 출력: 380, 총중량: 16000, 연료탱크: 300 },
  "9.5톤": { 전장: 10200, 전폭: 2490, 전고: 3200, 출력: 420, 총중량: 19500, 연료탱크: 300 },
  "11톤": { 전장: 10800, 전폭: 2490, 전고: 3300, 출력: 520, 총중량: 25000, 연료탱크: 400 },
  "14톤": { 전장: 11200, 전폭: 2490, 전고: 3350, 출력: 540, 총중량: 25000, 연료탱크: 400 },
  "18톤": { 전장: 11800, 전폭: 2490, 전고: 3400, 출력: 570, 총중량: 32000, 연료탱크: 400 },
  "22톤": { 전장: 12000, 전폭: 2490, 전고: 3450, 출력: 570, 총중량: 35000, 연료탱크: 400 },
  "25톤": { 전장: 12000, 전폭: 2490, 전고: 3500, 출력: 590, 총중량: 40000, 연료탱크: 400 },
  "추레라": { 전장: 16700, 전폭: 2490, 전고: 4000, 출력: 590, 총중량: 40000, 연료탱크: 400 },
};
const genFor = (key) => GEN[key] || GEN[String(key).split(" ")[0]] || null;

// 제원 항목 — [키, 이름, 단위, 기사앱 vehicle 키]
const SPEC_FIELDS = [
  ["전장", "전장(차 길이)", "mm"], ["전폭", "전폭(차 폭)", "mm"], ["전고", "전고(차 높이)", "mm"],
  ["적재함길이", "적재함 길이", "cm", "길이"], ["적재함폭", "적재함 폭", "cm", "폭"], ["적재함높이", "적재함 높이", "cm", "높이"],
  ["최대적재", "최대 적재", "kg", "최대적재"], ["총중량", "차량 총중량", "kg"], ["출력", "엔진 출력", "마력"],
  ["연료탱크", "연료탱크", "L"], ["축", "축 구성", "", "축"], ["타이어수", "타이어 개수", "개", "타이어"], ["타이어규격", "타이어 규격", "", "타이어규격"],
];

// ── 축·타이어 배치: 타이어 수·축 구성으로 [{ dual, trailer }] ──
function axleLayout(tires, axleText = "", isTrailer = false) {
  const n = Number(tires) || 0;
  if (isTrailer || n >= 18) return [{ dual: false }, { dual: true }, { dual: true }, { dual: true, trailer: true }, { dual: true, trailer: true }, { dual: true, trailer: true }];
  if (n === 8) return [{ dual: false }, { dual: false, lift: true }, { dual: true }];
  if (n === 10) return [{ dual: false }, { dual: true }, { dual: true }];
  if (n === 12) return [{ dual: false }, { dual: false }, { dual: true }, { dual: true }];
  if (n >= 14) return [{ dual: false }, { dual: false }, { dual: false }, { dual: true }, { dual: true }];
  if (n === 4) return [{ dual: false }, { dual: false }];
  if (/3축/.test(axleText)) return [{ dual: false }, { dual: true }, { dual: true }];
  return [{ dual: false }, { dual: true }];
}
// 위치 키 목록 — A1-L(1축 좌) / A2-LO(2축 좌 바깥) / A2-LI(2축 좌 안쪽) …
function tirePositions(axles) {
  const out = [];
  axles.forEach((a, i) => {
    const ax = i + 1;
    const sides = a.dual ? [["LO", "좌 바깥"], ["LI", "좌 안쪽"], ["RI", "우 안쪽"], ["RO", "우 바깥"]] : [["L", "좌"], ["R", "우"]];
    sides.forEach(([s, l]) => out.push({ key: `A${ax}-${s}`, axle: ax, side: s[0], inner: s[1] === "I", label: `${ax}축 ${l}${a.trailer ? "(트레일러)" : ""}` }));
  });
  return out;
}
const levelColor = (lv) => (lv === 2 ? H.red : lv === 1 ? H.amber : lv === 0 ? H.teal : "rgba(143,183,204,.55)");
const levelText = (lv) => (lv === 2 ? "교체 시기 지남" : lv === 1 ? "곧 교체" : lv === 0 ? "정상" : "기록 없음");

// ── 차량 측면 홀로그램(SVG · 의사 3D 돌출) ──
function TruckHolo({ kind = "", axles, tireState, ry, selected, onTire, reefer }) {
  const W = 760, HGT = 300, ground = 238;
  const trailer = axles.some((a) => a.trailer);
  const box = /탑|윙|냉장|냉동|박스|내장/.test(kind);
  const wing = /윙/.test(kind);
  const depth = 120; // 돌출 깊이(px) — 회전 각도에 따라 뒤쪽 면이 보인다
  const rad = (ry * Math.PI) / 180;
  const dx = Math.sin(rad) * depth, dy = -Math.abs(Math.cos(rad)) * 14 - 22;
  // 차체 기본 좌표
  const cabX = 40, cabW = trailer ? 150 : 132, bodyX = cabX + cabW + 10, bodyEnd = W - 40;
  const cabTop = trailer ? 70 : 92, bodyTop = box ? 56 : 150, deck = 176;
  const rTire = trailer ? 22 : 25;
  // 축 x 위치
  const front = axles.filter((a) => !a.trailer && !a.dual && !a.lift);
  const xs = [];
  if (trailer) {
    const t = [cabX + 60, cabX + cabW - 6, cabX + cabW + 50]; const tr = [bodyEnd - 160, bodyEnd - 105, bodyEnd - 50];
    axles.forEach((_, i) => xs.push(i < 3 ? t[i] : tr[i - 3]));
  } else {
    let fi = 0, ri = 0; const rears = axles.filter((a) => a.dual || a.lift).length;
    axles.forEach((a) => {
      if (!a.dual && !a.lift) { xs.push(cabX + 70 + fi * 62); fi += 1; } else { xs.push(bodyEnd - 70 - (rears - 1 - ri) * 60); ri += 1; }
    });
  }
  void front;
  const P = (pts, off = 0) => pts.map(([x, y]) => `${x + (off ? dx : 0)},${y + (off ? dy : 0)}`).join(" ");
  const cab = [[cabX, ground - 30], [cabX, cabTop + 40], [cabX + 18, cabTop], [cabX + cabW, cabTop], [cabX + cabW, ground - 30]];
  const body = trailer
    ? [[bodyX + 4, deck - 4], [bodyX + 4, 50], [bodyEnd, 50], [bodyEnd, deck - 4]]
    : box ? [[bodyX, deck], [bodyX, bodyTop], [bodyEnd, bodyTop], [bodyEnd, deck]] : [[bodyX, deck], [bodyX, bodyTop], [bodyEnd, bodyTop], [bodyEnd, deck]];
  const chassis = [[cabX - 6, ground - 30], [bodyEnd + 4, ground - 30], [bodyEnd + 4, ground - 46], [cabX - 6, ground - 46]];
  const shape = (pts, cls, extra = {}) => (
    <g>
      <polygon points={P(pts, 1)} className="vh-back" {...extra} />
      {pts.map((p, i) => <line key={i} x1={p[0]} y1={p[1]} x2={p[0] + dx} y2={p[1] + dy} className="vh-edge" />)}
      <polygon points={P(pts)} className={cls} {...extra} />
    </g>
  );
  const wheel = (x, key, far) => {
    const st = tireState[key] || { level: -1 };
    const col = levelColor(st.level); const sel = selected.has(key);
    return (
      <g key={`${key}${far ? "f" : ""}`} transform={far ? `translate(${dx},${dy})` : undefined} onClick={far ? undefined : (e) => { e.stopPropagation(); onTire(key); }} style={{ cursor: far ? "default" : "pointer" }} opacity={far ? 0.35 : 1}>
        <circle cx={x} cy={ground - rTire + 2} r={rTire} fill="rgba(5,11,24,.85)" stroke={col} strokeWidth={sel ? 4 : 2.4} className={st.level === 2 && !far ? "vh-alert" : ""} filter="url(#vhGlow)" />
        <circle cx={x} cy={ground - rTire + 2} r={rTire * 0.45} fill="none" stroke={col} strokeWidth="1.4" opacity=".8" />
        {!far && sel && <circle cx={x} cy={ground - rTire + 2} r={rTire + 7} fill="none" stroke={H.cyan} strokeDasharray="4 4" className="vh-spin" style={{ transformOrigin: `${x}px ${ground - rTire + 2}px` }} />}
      </g>
    );
  };
  // 측면에서 보이는 타이어 = 각 축의 좌측 바깥(가까운 쪽) / 우측 바깥(먼 쪽)
  const nearKey = (i) => (axles[i].dual ? `A${i + 1}-LO` : `A${i + 1}-L`);
  const farKey = (i) => (axles[i].dual ? `A${i + 1}-RO` : `A${i + 1}-R`);
  return (
    <svg viewBox={`0 0 ${W} ${HGT}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <filter id="vhGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="vhFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(56,225,255,.26)" /><stop offset="1" stopColor="rgba(56,225,255,.04)" /></linearGradient>
      </defs>
      {/* 먼 쪽 타이어 */}
      {axles.map((_, i) => wheel(xs[i], farKey(i), true))}
      <g filter="url(#vhGlow)">
        {shape(chassis, "vh-face")}
        {shape(cab, "vh-face")}
        {shape(body, "vh-face")}
        {/* 창문 */}
        <polygon points={P([[cabX + 22, cabTop + 8], [cabX + cabW - 12, cabTop + 8], [cabX + cabW - 12, cabTop + 52], [cabX + 8, cabTop + 52]])} className="vh-glass" />
        {/* 적재함 디테일 */}
        {!trailer && box && Array.from({ length: 6 }, (_, i) => <line key={i} x1={bodyX + ((bodyEnd - bodyX) / 7) * (i + 1)} y1={bodyTop + 6} x2={bodyX + ((bodyEnd - bodyX) / 7) * (i + 1)} y2={deck - 6} className="vh-rib" />)}
        {!trailer && wing && <path d={`M${bodyX + 6} ${bodyTop + 4} L${(bodyX + bodyEnd) / 2} ${bodyTop - 26} L${bodyEnd - 6} ${bodyTop + 4}`} className="vh-rib" strokeDasharray="6 5" />}
        {!trailer && !box && Array.from({ length: 3 }, (_, i) => <line key={i} x1={bodyX + ((bodyEnd - bodyX) / 4) * (i + 1)} y1={bodyTop} x2={bodyX + ((bodyEnd - bodyX) / 4) * (i + 1)} y2={deck} className="vh-rib" />)}
        {reefer && !trailer && <rect x={bodyX + 4} y={bodyTop - 30} width={54} height={28} rx={4} className="vh-face" />}
        {trailer && Array.from({ length: 8 }, (_, i) => <line key={i} x1={bodyX + 4 + ((bodyEnd - bodyX - 4) / 9) * (i + 1)} y1={56} x2={bodyX + 4 + ((bodyEnd - bodyX - 4) / 9) * (i + 1)} y2={deck - 10} className="vh-rib" />)}
        {/* 전조등 */}
        <rect x={cabX - 2} y={ground - 62} width={10} height={12} rx={2} fill={H.amber} opacity=".9" />
      </g>
      {/* 가까운 쪽 타이어(누르면 선택) */}
      {axles.map((_, i) => wheel(xs[i], nearKey(i), false))}
      {/* 축 번호 */}
      {axles.map((_, i) => <text key={i} x={xs[i]} y={ground + 26} textAnchor="middle" fontSize="13" fontWeight="800" fill={H.sub} style={{ fontFamily: MONO }}>{i + 1}축</text>)}
    </svg>
  );
}

// ── 위에서 본 타이어 배치(타이어 하나하나 선택) ──
function TireMap({ axles, positions, tireState, selected, onTire }) {
  const W = 220; const gap = 66; const top = 34; const Hh = top + axles.length * gap + 30;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" style={{ display: "block", maxHeight: 460 }}>
      <text x={W / 2} y={16} textAnchor="middle" fontSize="12.5" fontWeight="800" fill={H.sub}>▲ 앞(운전석)</text>
      <rect x={W / 2 - 34} y={top - 10} width={68} height={axles.length * gap} rx={12} fill="rgba(56,225,255,.06)" stroke={H.line} strokeDasharray="5 4" />
      <text x={14} y={Hh - 8} fontSize="12.5" fontWeight="800" fill={H.sub}>좌</text>
      <text x={W - 24} y={Hh - 8} fontSize="12.5" fontWeight="800" fill={H.sub}>우</text>
      {axles.map((a, i) => {
        const y = top + i * gap + 14;
        const ps = positions.filter((p) => p.axle === i + 1);
        const xOf = (p) => (a.dual ? { LO: 22, LI: 54, RI: W - 54 - 22, RO: W - 22 - 22 }[p.key.split("-")[1]] : p.side === "L" ? 38 : W - 38 - 22);
        return (
          <g key={i}>
            <line x1={50} y1={y + 18} x2={W - 50} y2={y + 18} stroke={H.line} strokeWidth="3" />
            <text x={W / 2} y={y + 22} textAnchor="middle" fontSize="12" fontWeight="900" fill={H.cyan}>{i + 1}축{a.trailer ? "·T" : ""}</text>
            {ps.map((p) => {
              const st = tireState[p.key] || { level: -1 }; const col = levelColor(st.level); const sel = selected.has(p.key);
              return (
                <g key={p.key} onClick={() => onTire(p.key)} style={{ cursor: "pointer" }}>
                  <title>{`${p.label} · ${levelText(st.level)}${st.text ? ` · ${st.text}` : ""}`}</title>
                  <rect x={xOf(p)} y={y} width={22} height={36} rx={6} fill={st.level === 2 ? "rgba(255,59,92,.22)" : "rgba(5,11,24,.9)"} stroke={col} strokeWidth={sel ? 3.4 : 2} className={st.level === 2 ? "vh-alert" : ""} />
                  {sel && <rect x={xOf(p) - 4} y={y - 4} width={30} height={44} rx={8} fill="none" stroke={H.cyan} strokeDasharray="3 3" />}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ── 본 창 ──
export default function VehicleHologram({ v, linkRaw, canEdit, onClose, onSave, DateField, narrow }) {
  const av = linkRaw?.vehicle || {};
  const care = linkRaw?.care || {};
  const tonRaw = v.톤수 || av.톤 || "";
  const kind = v.용도 || v.차량종류 || av.적재함 || "";
  const key = normTonKey(tonRaw);
  const std = specFor(key, kind) || {};
  const gen = genFor(key) || {};
  const isTrailer = key === "추레라" || /추레라|트레일러|트랙터/.test(kind);
  const spec = v.spec || {};
  // 값 = 대장에 입력한 값 > 기사앱 제원 > 톤수 일반 기준(기본값)
  const defOf = (k) => ({ 전장: gen.전장, 전폭: gen.전폭, 전고: gen.전고, 적재함길이: std.l, 적재함폭: std.w, 적재함높이: std.h || "", 최대적재: std.maxKg, 총중량: gen.총중량, 출력: gen.출력, 연료탱크: gen.연료탱크, 축: std.axle, 타이어수: std.tires, 타이어규격: "" }[k]);
  const valOf = (k, appK) => {
    if (spec[k] !== undefined && spec[k] !== "") return { v: spec[k], src: "입력" };
    if (appK && av[appK] !== undefined && av[appK] !== "" && av[appK] !== null) return { v: av[appK], src: "기사앱" };
    const d = defOf(k);
    return d !== undefined && d !== "" && d !== null ? { v: d, src: "기본값" } : { v: "", src: "" };
  };
  const vals = Object.fromEntries(SPEC_FIELDS.map(([k, , , appK]) => [k, valOf(k, appK)]));
  const axles = useMemo(() => axleLayout(vals.타이어수.v, String(vals.축.v || ""), isTrailer), [vals.타이어수.v, vals.축.v, isTrailer]); // eslint-disable-line react-hooks/exhaustive-deps
  const positions = useMemo(() => tirePositions(axles), [axles]);

  // 타이어 상태 — 위치별 기록 > 점검·소모품의 '타이어 교체' 기록(전체 기준)
  const cls = tonClass(key || tonRaw, kind);
  const tireItem = (() => { const it = CARE_ITEMS.find((x) => x.key === "tire"); const [km, months] = it[cls]; const ov = care.intervals?.tire || {}; return { ...it, km: ov.km ?? km, months: ov.months ?? months }; })();
  const tires = v.tires || {};
  const tireState = useMemo(() => {
    const out = {};
    positions.forEach((p) => {
      const rec = tires[p.key];
      if (rec && (rec.date || rec.km)) out[p.key] = { ...itemStatus(tireItem, { odometer: care.odometer, items: { tire: { km: rec.km, date: rec.date } } }), rec, base: "위치별 기록" };
      else if (care.items?.tire && (care.items.tire.date || care.items.tire.km)) out[p.key] = { ...itemStatus(tireItem, care), rec: care.items.tire, base: "점검·소모품 전체 기록" };
      else out[p.key] = { level: -1, text: "", base: "" };
    });
    return out;
  }, [positions, tires, care]); // eslint-disable-line react-hooks/exhaustive-deps

  // 회전(드래그) — 놓으면 천천히 흔들림
  const [ry, setRy] = useState(-18);
  const [drag, setDrag] = useState(null);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return undefined;
    let raf; const t0 = performance.now();
    const step = (t) => { setRy(-18 + Math.sin((t - t0) / 2200) * 22); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [auto]);
  const onDown = (e) => { setAuto(false); setDrag({ x: e.clientX, ry }); };
  const onMove = (e) => { if (drag) setRy(Math.max(-60, Math.min(60, drag.ry + (e.clientX - drag.x) * 0.35))); };
  const onUp = () => setDrag(null);

  // 타이어 선택·교체 기록
  const [selected, setSelected] = useState(new Set());
  const toggle = (k) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [tf, setTf] = useState({ date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), km: care.odometer ? String(care.odometer) : "", brand: "", size: "", memo: "" });
  const [busy, setBusy] = useState(false);
  const saveTires = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const rec = { date: tf.date, km: String(tf.km || "").replace(/[^\d]/g, ""), brand: tf.brand.trim(), size: tf.size.trim(), memo: tf.memo.trim(), at: Date.now() };
      const labels = positions.filter((p) => selected.has(p.key)).map((p) => p.label);
      await onSave((d) => {
        const next = { ...(d.tires || {}) }; selected.forEach((k) => { next[k] = rec; });
        const log = { id: Math.random().toString(36).slice(2, 10), 일자: rec.date, 내용: "타이어 교체", 구분: "이력", 날짜: rec.date, 세부내용: `${labels.join(", ")}${rec.brand ? ` · ${rec.brand}` : ""}${rec.size ? ` ${rec.size}` : ""}${rec.km ? ` · ${Number(rec.km).toLocaleString()}km` : ""}`, 비고: rec.memo, createdAt: Date.now() };
        return { tires: next, logs: [...(d.logs || []), log] };
      }, `타이어 ${selected.size}개 교체를 기록했습니다`);
      setSelected(new Set());
    } finally { setBusy(false); }
  };
  const clearTires = async () => {
    if (!selected.size) return;
    setBusy(true);
    try { await onSave((d) => { const next = { ...(d.tires || {}) }; selected.forEach((k) => { delete next[k]; }); return { tires: next }; }, "선택한 타이어 기록을 지웠습니다"); setSelected(new Set()); } finally { setBusy(false); }
  };

  // 제원 수정
  const [specEdit, setSpecEdit] = useState(null);
  const saveSpec = async () => {
    const clean = Object.fromEntries(Object.entries(specEdit).map(([k, x]) => [k, String(x ?? "").trim()]).filter(([, x]) => x !== ""));
    await onSave(() => ({ spec: clean }), "제원을 저장했습니다");
    setSpecEdit(null);
  };

  // 스마트 분석
  const cs = linkRaw ? careSummary({ vehicle: vehicleDefaults(linkRaw), care }) : null;
  const tireOver = positions.filter((p) => tireState[p.key]?.level === 2).length;
  const tireSoon = positions.filter((p) => tireState[p.key]?.level === 1).length;
  const tireNone = positions.filter((p) => tireState[p.key]?.level === -1).length;
  const yr = Number(av.연식 || v.연식) || 0;
  const age = yr ? new Date().getFullYear() - yr : null;
  const reps = v.repairs || [];
  const y0 = String(new Date().getFullYear());
  const yearCost = reps.filter((r) => String(r.일자 || "").startsWith(y0)).reduce((s, r) => s + (Number(String(r.공가 || 0).replace(/[^\d-]/g, "")) || 0) * 1.1, 0);
  let score = 100;
  score -= (cs?.over || 0) * 12 + (cs?.soon || 0) * 4 + tireOver * 6 + tireSoon * 2;
  if (age != null && age > 10) score -= Math.min(15, (age - 10) * 2);
  if (!linkRaw) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? ["최상", H.teal] : score >= 70 ? ["양호", H.cyan] : score >= 50 ? ["주의", H.amber] : ["위험", H.red];
  const defCount = SPEC_FIELDS.filter(([k]) => vals[k].src === "기본값").length;

  useEffect(() => {
    // 안쪽 달력·확인창이 떠 있으면 그것 먼저(이 창 자신의 data-kp-popup은 제외)
    const k = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-kp-dialog], [data-ls-menu], [data-vt-menu]") || [...document.querySelectorAll("[data-kp-popup]")].some((n) => !n.hasAttribute("data-vh-root"))) return;
      e.preventDefault(); e.stopPropagation(); onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);

  const card = { border: `1px solid ${H.line}`, borderRadius: 16, background: "linear-gradient(180deg, rgba(56,225,255,.06), rgba(56,225,255,.015))", padding: 14, position: "relative" };
  const cap = { fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.14em", color: H.cyan, marginBottom: 8 };
  const inpH = { height: 38, padding: "0 10px", borderRadius: 9, border: `1px solid ${H.line}`, background: "rgba(5,11,24,.8)", color: H.text, fontSize: 14.5, width: "100%", boxSizing: "border-box", outline: "none" };
  const hbtn = (on) => ({ height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${on ? H.cyan : H.line}`, background: on ? "rgba(56,225,255,.18)" : "rgba(255,255,255,.04)", color: H.text, fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" });
  const selList = positions.filter((p) => selected.has(p.key));

  return createPortal(
    <div data-kp-popup="" data-vh-root="" style={{ position: "fixed", inset: 0, zIndex: 9700, background: "rgba(2,6,14,.78)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: narrow ? 0 : 16 }}>
      <div className="vh-root" style={{ width: "min(1240px, 100%)", height: narrow ? "100%" : "min(860px, calc(100vh - 32px))", borderRadius: narrow ? 0 : 22, background: `radial-gradient(1200px 500px at 30% 20%, rgba(56,225,255,.12), transparent 60%), ${H.bg}`, border: `1px solid ${H.line}`, boxShadow: "0 0 60px rgba(56,225,255,.18), inset 0 0 80px rgba(56,225,255,.05)", color: H.text, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* 머리 */}
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${H.line}`, flexWrap: "wrap" }}>
          <span className="vh-dot" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.18em", color: H.cyan }}>DIGITAL TWIN · 차량 3D 분석</div>
            <div style={{ fontSize: 21, fontWeight: 900, marginTop: 2, ...TAB }}>{v.차량번호 || "-"} <span style={{ fontSize: 15, fontWeight: 700, color: H.sub }}>{[kind, tonRaw, [av.제조사 || v.제조사, av.모델 || v.모델].filter(Boolean).join(" "), yr ? `${yr}년식` : ""].filter(Boolean).join(" · ")}</span></div>
          </div>
          <button type="button" onClick={onClose} style={hbtn(false)}>✕ 닫기</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1.7fr) minmax(300px,1fr)", gap: 14, alignContent: "start", gridAutoRows: "max-content" }}>
          {/* 홀로그램 무대 */}
          <div style={{ ...card, gridColumn: narrow ? "auto" : "1 / 2", overflow: "hidden", padding: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 0", flexWrap: "wrap" }}>
              <div style={{ ...cap, marginBottom: 0, flex: 1 }}>HOLOGRAM · 드래그해서 돌려 보기</div>
              <button type="button" style={hbtn(auto)} onClick={() => setAuto(!auto)}>{auto ? "⏸ 회전 멈춤" : "▶ 자동 회전"}</button>
              <button type="button" style={hbtn(false)} onClick={() => { setAuto(false); setRy(0); }}>측면</button>
              <button type="button" style={hbtn(false)} onClick={() => { setAuto(false); setRy(-45); }}>사선</button>
            </div>
            <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} style={{ position: "relative", padding: narrow ? "20px 6px 30px" : "28px 26px 40px", cursor: drag ? "grabbing" : "grab", touchAction: "pan-y", userSelect: "none" }}>
              <div className="vh-scan" />
              <div style={{ transform: `perspective(1100px) rotateX(6deg) rotateY(${ry * 0.35}deg)`, transformStyle: "preserve-3d" }}>
                <TruckHolo kind={kind} axles={axles} tireState={tireState} ry={ry} selected={selected} onTire={toggle} reefer={/냉장|냉동/.test(kind) || !!av.냉동기} />
              </div>
              {/* 바닥 링 */}
              <div style={{ position: "absolute", left: "8%", right: "8%", bottom: 14, height: 46, borderRadius: "50%", border: `1.5px solid ${H.line}`, boxShadow: `0 0 30px rgba(56,225,255,.25), inset 0 0 26px rgba(56,225,255,.18)`, pointerEvents: "none" }} />
              {/* 치수 표시 */}
              <div style={{ position: "absolute", left: 18, top: 12, fontFamily: MONO, fontSize: 13, fontWeight: 800, color: H.sub, lineHeight: 1.6, pointerEvents: "none", ...TAB }}>
                <div>L {vals.전장.v ? `${Number(vals.전장.v).toLocaleString()}mm` : "-"}</div>
                <div>W {vals.전폭.v ? `${Number(vals.전폭.v).toLocaleString()}mm` : "-"}</div>
                <div>H {vals.전고.v ? `${Number(vals.전고.v).toLocaleString()}mm` : "-"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, padding: "0 14px 12px", flexWrap: "wrap", fontSize: 13.5, fontWeight: 800 }}>
              {[[0, "정상"], [1, "곧 교체"], [2, "교체 시기 지남"], [-1, "기록 없음"]].map(([lv, l]) => <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 99, border: `2.5px solid ${levelColor(lv)}`, boxShadow: `0 0 8px ${levelColor(lv)}` }} />{l}</span>)}
              <span style={{ color: H.sub, fontWeight: 700 }}>· 타이어를 누르면 선택됩니다</span>
            </div>
          </div>

          {/* 스마트 분석 */}
          <div style={{ ...card }}>
            <div style={cap}>SMART ANALYSIS · 상태 분석</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <svg width="112" height="112" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(56,225,255,.12)" strokeWidth="10" />
                <circle cx="56" cy="56" r="46" fill="none" stroke={grade[1]} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * 289} 289`} transform="rotate(-90 56 56)" style={{ filter: `drop-shadow(0 0 6px ${grade[1]})` }} />
                <text x="56" y="56" textAnchor="middle" fontSize="28" fontWeight="900" fill={H.text} style={TAB}>{score}</text>
                <text x="56" y="78" textAnchor="middle" fontSize="13" fontWeight="800" fill={grade[1]}>{grade[0]}</text>
              </svg>
              <div style={{ flex: 1, display: "grid", gap: 6, fontSize: 14, fontWeight: 700 }}>
                <Row l="점검 지남" r={cs ? `${cs.over}건` : "기사 미연결"} c={cs?.over ? H.red : H.text} />
                <Row l="곧 점검" r={cs ? `${cs.soon}건` : "-"} c={cs?.soon ? H.amber : H.text} />
                <Row l="타이어 교체 필요" r={`${tireOver}개`} c={tireOver ? H.red : H.text} />
                <Row l="주행거리" r={care.odometer ? `${Number(care.odometer).toLocaleString()}km` : "-"} />
                <Row l="차령" r={age != null ? `${age}년` : "-"} c={age > 10 ? H.amber : H.text} />
                <Row l={`${y0} 정비비`} r={`${Math.round(yearCost).toLocaleString()}원`} />
              </div>
            </div>
            {cs?.alerts?.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {cs.alerts.slice(0, 8).map((a) => <span key={a.key} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 13.5, fontWeight: 800, border: `1px solid ${levelColor(a.level)}`, color: levelColor(a.level), background: a.level === 2 ? "rgba(255,59,92,.12)" : "rgba(255,181,71,.08)" }} className={a.level === 2 ? "vh-alert-text" : ""}>{a.label} · {a.text}</span>)}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 13.5, color: H.sub, lineHeight: 1.6 }}>
              {CLASS_LABEL[cls]} 정비 기준 · 타이어 교체 주기 {tireItem.km ? `${tireItem.km.toLocaleString()}km` : ""}{tireItem.km && tireItem.months ? " / " : ""}{tireItem.months ? `${tireItem.months}개월` : ""} 중 먼저 오는 쪽
              {tireNone > 0 && <><br />타이어 {tireNone}개는 교체 기록이 없습니다</>}
            </div>
          </div>

          {/* 타이어 배치 + 교체 기록 */}
          <div style={{ ...card, gridColumn: narrow ? "auto" : "1 / 2", display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "220px minmax(0,1fr)", gap: 16 }}>
            <div>
              <div style={cap}>TIRE MAP · 타이어 {positions.length}개</div>
              <TireMap axles={axles} positions={positions} tireState={tireState} selected={selected} onTire={toggle} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" style={hbtn(false)} onClick={() => setSelected(new Set(positions.map((p) => p.key)))}>전체 선택</button>
                <button type="button" style={hbtn(false)} onClick={() => setSelected(new Set(positions.filter((p) => tireState[p.key]?.level === 2).map((p) => p.key)))}>교체 필요만</button>
                <button type="button" style={hbtn(false)} onClick={() => setSelected(new Set())}>선택 해제</button>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={cap}>TIRE LOG · 위치별 교체 기록</div>
              <div style={{ display: "grid", gap: 6, maxHeight: 280, overflowY: "auto", paddingRight: 4 }}>
                {positions.map((p) => {
                  const st = tireState[p.key] || {}; const r = st.rec;
                  return (
                    <button key={p.key} type="button" onClick={() => toggle(p.key)} style={{ textAlign: "left", display: "grid", gridTemplateColumns: "104px 1fr auto", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 10, border: `1px solid ${selected.has(p.key) ? H.cyan : "rgba(56,225,255,.14)"}`, background: selected.has(p.key) ? "rgba(56,225,255,.12)" : "rgba(5,11,24,.6)", color: H.text, cursor: "pointer", fontSize: 13.5 }}>
                      <b style={{ fontWeight: 900 }}>{p.label}</b>
                      <span style={{ color: H.sub, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...TAB }}>{r ? [r.date, r.km ? `${Number(r.km).toLocaleString()}km` : "", r.brand, r.size, st.base === "위치별 기록" ? "" : "(전체 기록)"].filter(Boolean).join(" · ") : "기록 없음"}</span>
                      <span style={{ fontWeight: 900, color: levelColor(st.level), whiteSpace: "nowrap" }} className={st.level === 2 ? "vh-alert-text" : ""}>{levelText(st.level)}</span>
                    </button>
                  );
                })}
              </div>
              {canEdit && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px dashed ${selected.size ? H.cyan : H.line}`, opacity: selected.size ? 1 : 0.6 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>{selected.size ? `선택한 타이어 ${selected.size}개 교체 기록 — ${selList.map((p) => p.label).join(", ")}` : "위에서 교체한 타이어를 먼저 고르세요"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 800, color: H.sub }}>교체일<div className="vh-date" style={{ marginTop: 3 }}>{DateField ? <DateField value={tf.date} onChange={(x) => setTf({ ...tf, date: x })} /> : <input type="date" value={tf.date} onChange={(e) => setTf({ ...tf, date: e.target.value })} style={inpH} />}</div></label>
                    <label style={{ fontSize: 13, fontWeight: 800, color: H.sub }}>교체 시 주행거리(km)<input inputMode="numeric" value={tf.km ? Number(String(tf.km).replace(/[^\d]/g, "") || 0).toLocaleString() : ""} onChange={(e) => setTf({ ...tf, km: e.target.value.replace(/[^\d]/g, "") })} style={{ ...inpH, marginTop: 3 }} placeholder="예) 152,000" /></label>
                    <label style={{ fontSize: 13, fontWeight: 800, color: H.sub }}>브랜드<input value={tf.brand} onChange={(e) => setTf({ ...tf, brand: e.target.value })} style={{ ...inpH, marginTop: 3 }} placeholder="예) 한국타이어" /></label>
                    <label style={{ fontSize: 13, fontWeight: 800, color: H.sub }}>규격<input value={tf.size} onChange={(e) => setTf({ ...tf, size: e.target.value })} style={{ ...inpH, marginTop: 3 }} placeholder={vals.타이어규격.v || "예) 12R22.5"} /></label>
                    <label style={{ fontSize: 13, fontWeight: 800, color: H.sub, gridColumn: "1 / -1" }}>메모<input value={tf.memo} onChange={(e) => setTf({ ...tf, memo: e.target.value })} style={{ ...inpH, marginTop: 3 }} placeholder="업체·금액 등" /></label>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button type="button" disabled={!selected.size || busy} onClick={clearTires} style={{ ...hbtn(false), opacity: selected.size ? 1 : 0.5 }}>기록 지우기</button>
                    <button type="button" disabled={!selected.size || busy} onClick={saveTires} style={{ ...hbtn(true), background: "linear-gradient(135deg, rgba(56,225,255,.35), rgba(45,245,196,.25))", opacity: selected.size ? 1 : 0.5 }}>{busy ? "저장 중…" : "교체 기록 저장"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 제원 */}
          <div style={{ ...card, gridColumn: narrow ? "auto" : "2 / 3", gridRow: narrow ? "auto" : "2 / span 1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ ...cap, marginBottom: 0, flex: 1 }}>SPEC · 제원</div>
              {canEdit && !specEdit && <button type="button" style={hbtn(false)} onClick={() => setSpecEdit(Object.fromEntries(SPEC_FIELDS.map(([k]) => [k, spec[k] ?? ""])))}>✎ 제원 입력</button>}
              {specEdit && <><button type="button" style={hbtn(false)} onClick={() => setSpecEdit(null)}>취소</button><button type="button" style={hbtn(true)} onClick={saveSpec}>저장</button></>}
            </div>
            {defCount > 0 && !specEdit && <div style={{ fontSize: 13, color: H.amber, fontWeight: 800, marginBottom: 8 }}>입력하지 않은 {defCount}개 항목은 {key || "톤수"} 일반 기준값(기본값)으로 보여 줍니다</div>}
            {!key && <div style={{ fontSize: 13, color: H.amber, fontWeight: 800, marginBottom: 8 }}>톤수를 입력하면 일반 제원이 자동으로 채워집니다</div>}
            <div style={{ display: "grid", gap: 4 }}>
              {SPEC_FIELDS.map(([k, l, unit]) => {
                const x = vals[k];
                return (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "118px 1fr", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(56,225,255,.08)" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: H.sub }}>{l}</span>
                    {specEdit ? (
                      <input value={specEdit[k] ?? ""} onChange={(e) => setSpecEdit({ ...specEdit, [k]: unit && unit !== "" && !["축", "타이어규격"].includes(k) ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })} placeholder={defOf(k) ? `기본 ${defOf(k)}${unit}` : unit} style={{ ...inpH, height: 34 }} />
                    ) : (
                      <span style={{ fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, ...TAB }}>
                        {x.v !== "" ? `${typeof x.v === "number" || /^\d+(\.\d+)?$/.test(String(x.v)) ? Number(x.v).toLocaleString() : x.v}${unit && x.v !== "" && !["축", "타이어규격"].includes(k) ? unit : ""}` : "-"}
                        {x.src && <span style={{ fontSize: 11.5, fontWeight: 900, padding: "1px 6px", borderRadius: 6, border: `1px solid ${x.src === "기본값" ? H.amber : x.src === "기사앱" ? H.teal : H.cyan}`, color: x.src === "기본값" ? H.amber : x.src === "기사앱" ? H.teal : H.cyan }}>{x.src}</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, ...cap }}>EQUIPMENT · 장비</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[["하이패스", v.하이패스], ["유류카드", v.유류카드사], ["GPS", v.GPS], ["덮개", v.덮개], ["박스", v.박스], ["냉동기", av.냉동기 || /냉장|냉동/.test(kind) ? "있음" : ""]].map(([l, x]) => {
                const on = x && !/없음|미장착|^-$/.test(String(x));
                return <span key={l} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 13.5, fontWeight: 800, border: `1px solid ${on ? H.teal : "rgba(143,183,204,.3)"}`, color: on ? H.teal : H.sub }}>{l}{on ? ` · ${x}` : " · 없음"}</span>;
              })}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .vh-root .vh-face{fill:url(#vhFill);stroke:${H.cyan};stroke-width:1.8}
        .vh-root .vh-back{fill:rgba(56,225,255,.04);stroke:rgba(56,225,255,.35);stroke-width:1.2}
        .vh-root .vh-edge{stroke:rgba(56,225,255,.35);stroke-width:1}
        .vh-root .vh-glass{fill:rgba(56,225,255,.16);stroke:${H.cyan};stroke-width:1.2}
        .vh-root .vh-rib{stroke:rgba(56,225,255,.5);stroke-width:1.1;fill:none}
        .vh-root .vh-alert{animation:vhBlink 1s ease-in-out infinite}
        .vh-root .vh-alert-text{animation:vhBlinkT 1s ease-in-out infinite}
        .vh-root .vh-spin{animation:vhSpin 3s linear infinite}
        .vh-root .vh-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg, rgba(56,225,255,.05) 0 1px, transparent 1px 4px);}
        .vh-root .vh-scan::after{content:"";position:absolute;left:0;right:0;height:60px;background:linear-gradient(180deg,transparent,rgba(56,225,255,.16),transparent);animation:vhScan 3.6s linear infinite}
        .vh-root .vh-dot{width:12px;height:12px;border-radius:99px;background:${H.teal};box-shadow:0 0 12px ${H.teal};animation:vhBlinkT 1.6s ease-in-out infinite}
        .vh-root .vh-date input{background:rgba(5,11,24,.8)!important;color:${H.text}!important;border-color:${H.line}!important}
        @keyframes vhBlink{0%,100%{stroke:${H.red};filter:drop-shadow(0 0 2px ${H.red})}50%{stroke:#ff9aab;filter:drop-shadow(0 0 10px ${H.red})}}
        @keyframes vhBlinkT{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes vhSpin{to{transform:rotate(360deg)}}
        @keyframes vhScan{0%{top:-60px}100%{top:100%}}
      `}</style>
    </div>,
    document.body,
  );
}
const Row = ({ l, r, c = H.text }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: H.sub }}>{l}</span><b style={{ color: c, ...TAB }}>{r}</b></div>
);
