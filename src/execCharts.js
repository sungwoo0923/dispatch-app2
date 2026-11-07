// ======================= src/execCharts.js =======================
// 📈 2026-11-08 경영 분석 차트(SVG 문자열) — 일일 경영 보고 차트(dailyReportCharts)와 같은 색·글자 크기·눈금 규칙
//  · 축은 하나(이중 축 없음) · 끝값·최댓값만 직접 표시 · 막대/점 위에 마우스를 올리면 값(<title>)
import { C, esc, niceStep } from "./dailyReportCharts";
import { fmt } from "./dailyReportCore";

const FONT = "font-family=\"'Noto Sans KR','Apple SD Gothic Neo',sans-serif\"";
const man = (v) => Math.round((v || 0) / 1e4);
const eokS = (m) => (Math.abs(m) >= 1e4 ? `${(m / 1e4).toFixed(Math.abs(m) >= 1e5 ? 0 : 1)}억` : fmt(m));

// 월별 막대(값 원) — 위: 매출 · 아래: 영업이익(0선 위아래) · 같은 x축 두 칸
export function plBars(W, months, { compact = false, barH = 200, lowH = 110 } = {}) {
  if (!(W >= 200) || !months?.length) return "";
  const L = compact ? 46 : 62, R = 12, T = 30, gap = 34, B = 34, n = months.length, iw = W - L - R, step = iw / n, bw = Math.max(6, Math.min(44, step * 0.58));
  const fs = compact ? 13 : 14;
  const sale = months.map((m) => man(m.sale)); const op = months.map((m) => man(m.op));
  const st = niceStep(Math.max(1, ...sale) * 1.1, 3); const max = st * Math.ceil((Math.max(1, ...sale) * 1.1) / st);
  const yb = (v) => T + barH - (v / max) * barH;
  const oHi = Math.max(1, ...op.map((v) => Math.max(0, v))), oLo = Math.max(0, ...op.map((v) => Math.max(0, -v)));
  const ost = niceStep((oHi + oLo) * 1.15 || 1, 2); const top = ost * Math.ceil((oHi * 1.15) / ost); const bot = oLo ? ost * Math.ceil((oLo * 1.15) / ost) : 0;
  const y2t = T + barH + gap; const yo = (v) => y2t + ((top - v) / (top + bot || 1)) * lowH;
  const H = y2t + lowH + B;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${yb(v)}" y2="${yb(v)}" stroke="${v ? C.grid : "#CBD2DE"}"/><text x="${L - 8}" y="${yb(v) + 5}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${eokS(v)}</text>`;
  s += `<text x="${L}" y="${T - 12}" font-size="${fs}" font-weight="700" fill="${C.t2}">매출</text>`;
  s += `<text x="${L}" y="${y2t - 10}" font-size="${fs}" font-weight="700" fill="${C.t2}">영업이익</text>`;
  for (let v = -bot; v <= top + 1e-6; v += ost) { const z = Math.abs(v) < 1e-6; s += `<line x1="${L}" x2="${W - R}" y1="${yo(v)}" y2="${yo(v)}" stroke="${z ? "#AEB7C6" : C.grid}"/><text x="${L - 8}" y="${yo(v) + 5}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${v < 0 ? "−" : ""}${eokS(Math.abs(v))}</text>`; }
  const iMax = sale.indexOf(Math.max(...sale));
  months.forEach((m, i) => {
    const x = L + i * step + (step - bw) / 2, last = i === n - 1, v = sale[i], y = yb(v);
    const tip = `<title>${esc(m.m)} 매출 ${fmt(v)}만 · 영업이익 ${fmt(op[i])}만 (${m.om.toFixed(1)}%)${m.est ? " · 판관비 추정" : ""}</title>`;
    if (v > 0) s += `<path d="M${x} ${T + barH} V${Math.min(y + 4, T + barH)} q0 -4 4 -4 H${x + bw - 4} q4 0 4 4 V${T + barH} Z" fill="${last ? C.n3 : "#B8C8E6"}">${tip}</path>`;
    if (last || i === iMax) s += `<text x="${x + bw / 2}" y="${y - 8}" font-size="${fs + (last ? 2 : 0)}" font-weight="800" fill="${C.t1}" text-anchor="middle">${eokS(v)}</text>`;
    const o = op[i]; const y0 = yo(0), y1 = yo(o);
    if (o) s += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(2, Math.abs(y1 - y0))}" rx="3" fill="${o > 0 ? (last ? C.n3 : "#8EA6D3") : "#C9CFDA"}">${tip}</rect>`;
    if (last || (!compact && n <= 12)) s += `<text x="${x + bw / 2}" y="${o >= 0 ? y1 - 6 : y1 + 17}" font-size="${compact ? 12 : 13}" font-weight="${last ? 800 : 600}" fill="${last ? C.t1 : C.t2}" text-anchor="middle">${o < 0 ? "−" : ""}${fmt(Math.abs(o))}</text>`;
    if (!compact || i % 2 === (n - 1) % 2) s += `<text x="${x + bw / 2}" y="${H - 10}" font-size="${fs}" fill="${last ? C.t1 : C.t2}" font-weight="${last ? 700 : 400}" text-anchor="middle">${Number(m.m.slice(5, 7))}월</text>`;
  });
  return `${s}</svg>`;
}

// 여러 선(같은 단위) — series: [{ name, color, vals, dash }] · 끝에 이름+값 직접 표시
export function lines(W, H, labels, series, { unit = "%", compact = false, labelEvery = 1, min = null, dp = 1 } = {}) {
  if (!(W >= 200) || !labels?.length) return "";
  const L = compact ? 46 : 56, R = compact ? 64 : series.length === 1 ? 80 : 132, T = 22, B = 34, iw = W - L - R, ih = H - T - B, fs = compact ? 13 : 14, n = labels.length;
  const all = series.flatMap((s) => s.vals).filter((v) => v != null && Number.isFinite(v));
  const st = niceStep((Math.max(1, ...all) - Math.min(0, ...all)) * 1.12, 3);
  let lo = min != null ? min : Math.min(0, Math.floor(Math.min(...all) / st) * st); let hi = st * Math.ceil((Math.max(1, ...all) * 1.12) / st);
  const x = (i) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); const y = (v) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  for (let v = lo; v <= hi + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v) < 1e-6 ? "#AEB7C6" : C.grid}"/><text x="${L - 8}" y="${y(v) + 5}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${fmt(v)}${unit}</text>`;
  const ends = [];
  series.forEach((se) => {
    const d = se.vals.map((v, i) => (v == null ? null : `${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p}`).join(" ");
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.5" ${se.dash ? 'stroke-dasharray="6 4"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
    se.vals.forEach((v, i) => { if (v == null) return; const last = i === n - 1; s += `<circle cx="${x(i)}" cy="${y(v)}" r="${last ? 5 : 3.5}" fill="${last ? se.color : "#fff"}" stroke="${se.color}" stroke-width="2"><title>${esc(labels[i])} ${esc(se.name)} ${v.toFixed(dp)}${unit}</title></circle>`; });
    const lv = se.vals[n - 1]; if (lv != null) ends.push({ y: y(lv), t: compact || series.length === 1 ? `${lv.toFixed(dp)}${unit}` : `${se.name} ${lv.toFixed(dp)}${unit}`, c: se.color });
  });
  ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 18) ends[i].y = ends[i - 1].y + 18;
  ends.forEach((e) => { s += `<text x="${x(n - 1) + 10}" y="${e.y + 5}" font-size="${fs}" font-weight="800" fill="${C.t1}">${esc(e.t)}</text>`; });
  labels.forEach((l, i) => { const last = i === n - 1; if (i % labelEvery === (n - 1) % labelEvery || last) s += `<text x="${x(i)}" y="${H - 10}" font-size="${fs}" fill="${last ? C.t1 : C.t2}" font-weight="${last ? 700 : 400}" text-anchor="middle">${esc(l)}</text>`; });
  return `${s}</svg>`;
}

// 현금 잔액 예측 — 주별 최저 잔액(선) · 주 끝 잔액(점선) · 안전 잔액(가로 점선) 밑은 경고 표시
export function cashLine(W, H, weeks, start, safe, { compact = false } = {}) {
  if (!(W >= 200) || !weeks?.length) return "";
  const L = compact ? 52 : 66, R = compact ? 70 : 96, T = 26, B = 36, iw = W - L - R, ih = H - T - B, fs = compact ? 13 : 14;
  const pts = [{ lbl: "오늘", end: start, low: start }, ...weeks.map((w) => ({ lbl: `${Number(w.a.slice(5, 7))}.${w.a.slice(8)}`, end: w.end, low: w.low }))];
  const vals = pts.flatMap((p) => [man(p.end), man(p.low)]).concat(man(safe));
  let lo = Math.min(0, ...vals); let hi = Math.max(...vals) * 1.1;
  const st = niceStep(hi - lo, 3); hi = st * Math.ceil(hi / st); lo = lo < 0 ? -st * Math.ceil(-lo / st) : 0;
  const n = pts.length; const x = (i) => L + (i * iw) / (n - 1); const y = (v) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  for (let v = lo; v <= hi + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v) < 1e-6 ? "#AEB7C6" : C.grid}"/><text x="${L - 8}" y="${y(v) + 5}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${v < 0 ? "−" : ""}${eokS(Math.abs(v))}</text>`;
  if (safe > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(man(safe))}" y2="${y(man(safe))}" stroke="${C.err}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R + 6}" y="${y(man(safe)) + 5}" font-size="${fs}" font-weight="700" fill="${C.err}">안전 잔액</text>`;
  const path = (k) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(man(p[k])).toFixed(1)}`).join(" ");
  s += `<path d="${path("end")}" fill="none" stroke="#9FB0CF" stroke-width="2" stroke-dasharray="6 4"/>`;
  s += `<path d="${path("low")}" fill="none" stroke="${C.n3}" stroke-width="2.5" stroke-linejoin="round"/>`;
  pts.forEach((p, i) => {
    const warn = safe > 0 && p.low < safe; const v = man(p.low);
    s += `<circle cx="${x(i)}" cy="${y(v)}" r="${warn ? 6 : 4}" fill="${warn ? C.err : "#fff"}" stroke="${warn ? C.err : C.n3}" stroke-width="2"><title>${esc(p.lbl)} 주 최저 ${fmt(v)}만 · 주말 ${fmt(man(p.end))}만</title></circle>`;
    if (warn || i === n - 1) s += `<text x="${x(i)}" y="${y(v) + (warn ? 24 : -10)}" font-size="${fs}" font-weight="800" fill="${warn ? C.err : C.t1}" text-anchor="middle">${eokS(v)}</text>`;
    if (!compact || i % 2 === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 10}" font-size="${fs}" fill="${i ? C.t2 : C.t1}" font-weight="${i ? 400 : 700}" text-anchor="middle">${esc(p.lbl)}</text>`;
  });
  return `${s}</svg>`;
}

// 단순 세로 막대(건수) — data: [[라벨, 값]] · 값은 막대 위에 직접
export function countBars(W, H, data, { compact = false, unit = "곳", color = C.n3 } = {}) {
  if (!(W >= 160) || !data?.length) return "";
  const L = 10, R = 10, T = 28, B = 34, iw = W - L - R, ih = H - T - B, fs = compact ? 13 : 14, n = data.length;
  const max = Math.max(1, ...data.map((d) => d[1])); const gw = iw / n, bw = Math.max(6, Math.min(40, gw * 0.56));
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  s += `<line x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}" stroke="#CBD2DE"/>`;
  data.forEach((d, i) => {
    const x = L + gw * i + (gw - bw) / 2, h = (d[1] / max) * ih, last = i === n - 1;
    if (d[1] > 0) s += `<path d="M${x} ${T + ih} V${T + ih - h + 4} q0 -4 4 -4 H${x + bw - 4} q4 0 4 4 V${T + ih} Z" fill="${last ? color : "#B8C8E6"}"><title>${esc(d[0])} ${d[1]}${unit}</title></path>`;
    s += `<text x="${x + bw / 2}" y="${T + ih - h - 7}" font-size="${fs}" font-weight="${last ? 800 : 600}" fill="${d[1] ? C.t1 : C.t3}" text-anchor="middle">${d[1]}</text>`;
    if (!compact || i % 2 === (n - 1) % 2) s += `<text x="${x + bw / 2}" y="${H - 10}" font-size="${fs}" fill="${last ? C.t1 : C.t2}" font-weight="${last ? 700 : 400}" text-anchor="middle">${esc(d[0])}</text>`;
  });
  return `${s}</svg>`;
}
