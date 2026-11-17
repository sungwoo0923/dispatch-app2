// ======================= src/CashFlowChart.jsx =======================
// ⭐ 2026-11-17 수입·지출 장부 › 일별 수입 · 지출 · 누계 그래프 새로 그림(손으로 그린 SVG — 프로그램의 다른 경영 차트(execCharts)와 같은 결)
//  · 위로 수입 막대 · 아래로 지출 막대(0선 기준 거울처럼) · 누계 차액(이 달 수입 − 지출을 날마다 더한 값) 선 + 옅은 면
//  · 축은 하나(만원) — 세 값 모두 같은 "원" 단위라 같은 눈금에 둔다(이중 축 없음)
//  · 주말 · 공휴일 옅은 칸 · 오늘 표시 · 최대 지출일 표시 · 마우스를 올리면 그날 값(말풍선) · 범례 · 위에 이 달 요약 4칸
//  · 색: 수입 #3F63B5(파랑) · 지출 #C8772F(주황) — 색약 검사(색 구분 ΔE 24 이상) 통과 · 누계 선은 글자색(남색)
//  ⚠ 데이터 계산은 OfficeBooks.jsx CashBook(M.daily)이 한다 — 여기는 그리기만
import React from "react";
import { isHoliday } from "./attendanceUtils";
import { profitColor } from "./marginPct"; // ⭐ 2026-11-17 순이익 · 차액 색(플러스 빨강 · 마이너스 파랑)

const C_IN = "#3F63B5";
const C_OUT = "#C8772F";
const C_CUM = "#0F1A30";
// ⭐ 2026-11-17 숫자 글꼴 — 고정폭(디지털) 글꼴 대신 앱 기본 글꼴 · 자리 맞춤(tabular-nums)만 유지
const NUM_FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUM = { fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
// 만원 눈금 글자(1억 이상은 억)
const manLabel = (v) => { const a = Math.abs(v); const s = v < 0 ? "−" : ""; if (a >= 1e8) return `${s}${(a / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`; if (a >= 1e4) return `${s}${Math.round(a / 1e4).toLocaleString("ko-KR")}만`; return a ? `${s}${won(a)}` : "0"; };
const manShort = (v) => { const a = Math.abs(v); if (a >= 1e8) return `${(a / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}만`; return won(a); };
function niceStep(range, ticks = 4) {
  const raw = Math.max(1, range) / ticks; const p = 10 ** Math.floor(Math.log10(raw)); const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function useWidth(initial = 0) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(initial);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// 이 달 요약 4칸 — 총수입 · 총지출 · 순이익(수지) · 최대 지출일
export function cashFlowSummary(daily = []) {
  let tin = 0, tout = 0, max = null, active = 0;
  for (const x of daily) { tin += x.in; tout += x.out; if (x.out > 0 && (!max || x.out > max.out)) max = x; if (x.in || x.out) active++; }
  return { tin, tout, net: tin - tout, max, active };
}

export default function CashFlowChart({ daily = [], ym = "", today = "", compact = false, initialWidth = 0 }) {
  const [wrapRef, W] = useWidth(initialWidth);
  const [hover, setHover] = React.useState(-1);
  const S = React.useMemo(() => cashFlowSummary(daily), [daily]);
  const n = daily.length;
  // ⭐ 같은 x축(날짜) 위에 두 칸 — 위: 일별 수입 · 지출(크게) / 아래: 누계 차액(면 그래프). 누계는 날마다 커져서 한 칸에 두면 막대가 납작해졌다
  const H = compact ? 300 : 352;
  const L = compact ? 52 : 64, R = 14, T = 22, B = 28, G = 40;
  const h1 = Math.round((H - T - B - G) * 0.62), h2 = H - T - B - G - h1;
  const T2 = T + h1 + G;
  const ih = H - T - B; // 두 칸 전체 높이(주말 칸 · 오늘 선 · 마우스 칸)
  const scale = (hi, lo, nt) => {
    if (!hi && !lo) return { top: 1, bot: 1, ticks: [0] }; // 내역 없는 달 — 0선만 가운데
    const step = niceStep((hi + lo) * 1.04, nt);
    const top = hi ? step * Math.max(1, Math.ceil((hi * 1.04) / step)) : (lo ? 0 : step);
    const bot = lo ? step * Math.ceil((lo * 1.04) / step) : 0;
    const ticks = []; for (let v = -bot; v <= top + 1e-6; v += step) ticks.push(Math.round(v));
    return { top, bot, ticks };
  };
  const geo = React.useMemo(() => scale(Math.max(0, ...daily.map((x) => x.in)), Math.max(0, ...daily.map((x) => x.out)), compact ? 4 : 6), [daily, compact]); // eslint-disable-line react-hooks/exhaustive-deps
  const isToday = (i) => today && `${ym}-${String(i + 1).padStart(2, "0")}` === today;
  const todayIdx = daily.findIndex((_, i) => isToday(i));
  // 누계 선은 오늘까지만(앞날은 아직 안 일어난 날) — 눈금도 그 구간으로
  const lastIdx = todayIdx >= 0 ? todayIdx : (today && today.slice(0, 7) < ym ? -1 : n - 1);
  const geoC = React.useMemo(() => { const seen = daily.slice(0, lastIdx + 1); return scale(Math.max(0, ...seen.map((x) => x.cum)), Math.max(0, ...seen.map((x) => -x.cum)), 3); }, [daily, lastIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = W > 120 && n > 0;
  const iw = Math.max(1, W - L - R);
  const stepX = iw / Math.max(1, n);
  const bw = Math.max(3, Math.min(16, stepX * 0.36));
  const y = (v) => T + ((geo.top - v) / (geo.top + geo.bot || 1)) * h1;
  const y0 = y(0);
  const yc = (v) => T2 + ((geoC.top - v) / (geoC.top + geoC.bot || 1)) * h2;
  const yc0 = yc(0);
  const cx = (i) => L + stepX * i + stepX / 2;
  const linePts = lastIdx >= 0 ? daily.slice(0, lastIdx + 1).map((x, i) => [cx(i), yc(x.cum)]) : [];
  const lineD = linePts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const areaD = linePts.length ? `${lineD} L${linePts[linePts.length - 1][0].toFixed(1)} ${yc0.toFixed(1)} L${linePts[0][0].toFixed(1)} ${yc0.toFixed(1)} Z` : "";
  const every = stepX >= 26 ? 1 : stepX >= 15 ? 2 : 5;
  const showLabel = (i) => i === 0 || i === n - 1 || (every === 5 ? (i + 1) % 5 === 0 && i < n - 2 : i % every === 0 && i < n - 1);
  const maxIdx = S.max ? S.max.d - 1 : -1;
  const gid = React.useId().replace(/:/g, "");
  const h = hover >= 0 ? daily[hover] : null;
  const dateOf = (i) => `${ym}-${String(i + 1).padStart(2, "0")}`;
  const dowOf = (i) => new Date(`${dateOf(i)}T00:00:00`).getDay();

  const kpis = [
    ["총수입", `${won(S.tin)}원`, C_IN, null],
    ["총지출", `${won(S.tout)}원`, C_OUT, null],
    ["순이익(수지)", `${S.net >= 0 ? "+" : "−"}${won(Math.abs(S.net))}원`, null, S.net < 0, undefined, S.net],
    ["최대 지출일", S.max ? `${Number(ym.slice(5))}.${S.max.d} (${DOW[dowOf(S.max.d - 1)]})` : "–", null, false, S.max ? `−${won(S.max.out)}원` : "지출 없음"],
  ];
  return (
    <div data-testid="cashflow-chart">
      {/* 이 달 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {kpis.map(([l, v, dot, neg, sub, profit]) => (
          <div key={l} className="rounded-2xl bg-[#F7F9FC] border border-[#E9EEF5] px-3 py-2.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#5B6B85] whitespace-nowrap">{dot && <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: dot }} />}{l}</div>
            <div className={`mt-0.5 text-[17px] md:text-[19px] font-black whitespace-nowrap truncate ${neg ? "text-[#B42318]" : "text-[#0F1A30]"}`} style={{ ...NUM, ...(profit != null && profitColor(profit) ? { color: profitColor(profit) } : {}) }}>{v}</div>
            {sub && <div className="text-[12px] font-bold text-[#7A879C] truncate" style={NUM}>{sub}</div>}
          </div>
        ))}
      </div>
      {/* 범례 */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12.5px] font-bold text-[#3A4A66] mb-1.5">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px]" style={{ background: C_IN }} />수입(위)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px]" style={{ background: C_OUT }} />지출(아래)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-[2.5px] rounded-full" style={{ background: C_CUM }} />누계 차액</span>
        <span className="inline-flex items-center gap-1.5 text-[#7A879C]"><span className="w-3 h-3 rounded-[3px] bg-[#EEF1F6] border border-[#E3E8F0]" />주말 · 공휴일</span>
        <span className="ml-auto text-[12px] text-[#9AA9C3]">단위 · 만원</span>
      </div>
      <div ref={wrapRef} className="relative w-full select-none" style={{ height: H }} onMouseLeave={() => setHover(-1)}>
        {ready && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} role="img" aria-label={`${ym} 일별 수입 · 지출 · 누계 차액 그래프`}>
            <defs>
              <linearGradient id={`cumA${gid}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={C_CUM} stopOpacity="0.16" />
                <stop offset="100%" stopColor={C_CUM} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {/* 주말 · 공휴일 칸 */}
            {daily.map((_, i) => { const dw = dowOf(i); return (dw === 0 || dw === 6 || isHoliday(dateOf(i))) ? <g key={`w${i}`}><rect x={L + stepX * i} y={T} width={stepX} height={h1} fill="#F1F4F9" /><rect x={L + stepX * i} y={T2} width={stepX} height={h2} fill="#F1F4F9" /></g> : null; })}
            {/* 눈금 */}
            {[[geo, y, "t"], [geoC, yc, "c"]].map(([g, fy, k]) => g.ticks.map((v) => (
              <g key={`${k}${v}`}>
                <line x1={L} x2={W - R} y1={fy(v)} y2={fy(v)} stroke={v === 0 ? "#9AA9C3" : "#E9EEF5"} strokeWidth={v === 0 ? 1.2 : 1} strokeDasharray={v === 0 ? undefined : "2 3"} />
                <text x={L - 8} y={fy(v) + 4} fontSize={compact ? 11 : 12} fill="#7A879C" textAnchor="end" style={NUM}>{manLabel(v)}</text>
              </g>
            )))}
            {/* 칸 이름 */}
            <text x={L} y={T - 8} fontSize="12" fontWeight="800" fill="#3A4A66">일별 수입 · 지출</text>
            <text x={L} y={T2 - 9} fontSize="12" fontWeight="800" fill="#3A4A66">누계 차액 <tspan fontWeight="600" fill="#7A879C">(1일부터 수입 − 지출을 더한 값)</tspan></text>
            {/* 오늘 */}
            {todayIdx >= 0 && <g>
              <line x1={cx(todayIdx)} x2={cx(todayIdx)} y1={T - 2} y2={T + ih} stroke="#2D4C82" strokeWidth="1.2" strokeDasharray="3 3" />
              <rect x={cx(todayIdx) - 17} y={T - 18} width="34" height="17" rx="8.5" fill="#2D4C82" />
              <text x={cx(todayIdx)} y={T - 5.5} fontSize="11" fontWeight="800" fill="#fff" textAnchor="middle">오늘</text>
            </g>}
            {/* 호버 띠 */}
            {hover >= 0 && <g opacity="0.07"><rect x={L + stepX * hover} y={T} width={stepX} height={h1} fill="#2D4C82" /><rect x={L + stepX * hover} y={T2} width={stepX} height={h2} fill="#2D4C82" /></g>}
            {/* 막대 — 0선에서 위(수입) · 아래(지출), 끝만 둥글게 */}
            {daily.map((x, i) => {
              const bx = cx(i) - bw / 2; const r = Math.min(3, bw / 2);
              const hiIn = x.in ? Math.max(2, y0 - y(x.in)) : 0; const hiOut = x.out ? Math.max(2, y(-x.out) - y0) : 0;
              const dim = hover >= 0 && hover !== i ? 0.45 : 1;
              return (
                <g key={`b${i}`} opacity={dim}>
                  {hiIn > 0 && <path d={`M${bx} ${y0 - 1} V${y0 - hiIn + r} Q${bx} ${y0 - hiIn} ${bx + r} ${y0 - hiIn} H${bx + bw - r} Q${bx + bw} ${y0 - hiIn} ${bx + bw} ${y0 - hiIn + r} V${y0 - 1} Z`} fill={C_IN} />}
                  {hiOut > 0 && <path d={`M${bx} ${y0 + 1} V${y0 + hiOut - r} Q${bx} ${y0 + hiOut} ${bx + r} ${y0 + hiOut} H${bx + bw - r} Q${bx + bw} ${y0 + hiOut} ${bx + bw} ${y0 + hiOut - r} V${y0 + 1} Z`} fill={C_OUT} />}
                </g>
              );
            })}
            {/* 최대 지출일 표시 */}
            {maxIdx >= 0 && hover < 0 && (() => { const yy = y(-S.max.out) + 15; const xx = Math.min(W - R - 30, Math.max(L + 30, cx(maxIdx))); return <text x={xx} y={Math.min(T + h1 + 14, yy)} fontSize="11.5" fontWeight="800" fill="#3A4A66" textAnchor="middle" style={NUM}>최대 −{manShort(S.max.out)}</text>; })()}
            {/* 누계 차액 — 면 + 선 */}
            {areaD && <path d={areaD} fill={`url(#cumA${gid})`} />}
            {lineD && <path d={lineD} fill="none" stroke={C_CUM} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {linePts.length > 0 && (() => { const [px, py] = linePts[linePts.length - 1]; const v = daily[linePts.length - 1].cum; const right = px > W - R - 70; return <g><circle cx={px} cy={py} r="4.5" fill="#fff" stroke={C_CUM} strokeWidth="2" /><text x={right ? px - 8 : px + 8} y={py - 8} fontSize="12" fontWeight="800" fill={C_CUM} textAnchor={right ? "end" : "start"} style={NUM}>{v < 0 ? "−" : "+"}{manShort(v)}</text></g>; })()}
            {hover >= 0 && hover <= lastIdx && <circle cx={cx(hover)} cy={yc(daily[hover].cum)} r="4" fill={C_CUM} stroke="#fff" strokeWidth="2" />}
            {/* x축 날짜 */}
            {daily.map((_, i) => (showLabel(i) || i === hover) ? <text key={`x${i}`} x={cx(i)} y={H - 10} fontSize={compact ? 11 : 12} fontWeight={i === hover || isToday(i) ? 800 : 500} fill={i === hover || isToday(i) ? "#0F1A30" : dowOf(i) === 0 ? "#B0603A" : "#7A879C"} textAnchor="middle" style={NUM}>{i + 1}</text> : null)}
            {/* 마우스 받는 칸(막대보다 넓게) */}
            {daily.map((_, i) => <rect key={`h${i}`} x={L + stepX * i} y={T} width={stepX} height={ih + B - 4} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />)}
          </svg>
        )}
        {/* 말풍선 */}
        {ready && h && (() => {
          const left = cx(hover); const flip = left > W * 0.62; const net = h.in - h.out;
          return (
            <div className="absolute z-[2] pointer-events-none rounded-xl bg-white border border-[#E3E8F0] shadow-[0_12px_28px_rgba(15,26,48,0.16)] px-3 py-2.5 min-w-[176px]" style={{ top: 6, ...(flip ? { right: W - left + 12 } : { left: left + 12 }) }}>
              <div className="text-[13px] font-black text-[#0F1A30] mb-1.5">{Number(ym.slice(5))}월 {hover + 1}일 ({DOW[dowOf(hover)]}){isToday(hover) ? " · 오늘" : ""}</div>
              {[["수입", h.in, C_IN, "+"], ["지출", h.out, C_OUT, "−"]].map(([l, v, c, sg]) => (
                <div key={l} className="flex items-center gap-2 text-[12.5px] font-bold text-[#3A4A66] py-0.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />{l}<span className="ml-auto font-black text-[#0F1A30]" style={NUM}>{v ? `${sg}${won(v)}` : "–"}</span></div>
              ))}
              <div className="flex items-center gap-2 text-[12.5px] font-bold text-[#3A4A66] py-0.5 border-t border-[#EEF1F6] mt-1 pt-1.5">이날 차액<span className="ml-auto font-black text-[#0F1A30]" style={{ ...NUM, color: profitColor(net) }}>{net ? `${net > 0 ? "+" : "−"}${won(Math.abs(net))}` : "0"}</span></div>
              {hover <= lastIdx && <div className="flex items-center gap-2 text-[12.5px] font-bold text-[#3A4A66] py-0.5"><span className="w-3 h-[2.5px] rounded-full" style={{ background: C_CUM }} />누계 차액<span className="ml-auto font-black text-[#0F1A30]" style={{ ...NUM, color: profitColor(h.cum) }}>{h.cum < 0 ? "−" : "+"}{won(Math.abs(h.cum))}</span></div>}
            </div>
          );
        })()}
        {!ready && <div className="h-full rounded-xl bg-[#F7F9FC]" />}
        {ready && !S.tin && !S.tout && <div className="absolute inset-0 grid place-items-center pointer-events-none"><span className="px-3 py-1.5 rounded-xl bg-white/90 border border-[#E3E8F0] text-[13.5px] font-bold text-[#7A879C]">이 달 수입 · 지출 내역이 없어요</span></div>}
      </div>
      {/* 표로 보기(읽기 도구용) */}
      <table className="sr-only"><caption>{ym} 일별 수입 · 지출 · 누계 차액</caption><thead><tr><th>일</th><th>수입</th><th>지출</th><th>누계 차액</th></tr></thead><tbody>{daily.filter((x) => x.in || x.out).map((x) => <tr key={x.d}><td>{x.d}일</td><td>{won(x.in)}</td><td>{won(x.out)}</td><td>{won(x.cum)}</td></tr>)}</tbody></table>
    </div>
  );
}
