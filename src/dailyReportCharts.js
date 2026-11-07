// ======================= src/dailyReportCharts.js =======================
// 📊 일일 경영 보고 차트(SVG 문자열) — 승인된 시안(exec-report v1) 차트를 그대로 옮김. 폭(W)은 화면이 재서 넘긴다.
import { fmt, md, DOW, dowOf } from "./dailyReportCore";

export const C = {
  n0: "#0B1428", n1: "#0F1A30", n2: "#1B2B4B", n3: "#2D4C82", sky: "#8FB0F0",
  page: "#F3F5F9", card: "#FFFFFF", line: "#E4E8F0", grid: "#EDF0F5",
  t1: "#0F1A30", t2: "#4A5568", t3: "#7A8496",
  pos: "#15803D", posBg: "#E8F5EC", neg: "#B42318", negBg: "#FDECEA",
  red: "#C53030", redBg: "#FDECEC", amber: "#B7791F", amberBg: "#FDF4E3",
  s1: "#2a78d6", s2: "#eb6834", s3: "#6250d6", base: "#A0A8B8",
};
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FONT = "font-family=\"'Noto Sans KR','Apple SD Gothic Neo',sans-serif\"";
// 보기 좋은 눈금 간격
export function niceStep(max, n = 3) {
  if (!(max > 0)) return 1;
  const raw = max / n; const p = 10 ** Math.floor(Math.log10(raw)); const k = raw / p;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p;
}

export function spark(vals, w = 120, h = 30, { color = C.n3, fill = true, hiLast = true } = {}) {
  const v = vals && vals.length > 1 ? vals : [0, 0];
  const mn = Math.min(...v), mx = Math.max(...v), pad = 3;
  const x = (i) => pad + (i * (w - 2 * pad)) / (v.length - 1), y = (q) => h - pad - ((q - mn) / (mx - mn || 1)) * (h - 2 * pad);
  const d = v.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(q).toFixed(1)}`).join(" ");
  const area = `${d} L${x(v.length - 1)} ${h} L${x(0)} ${h} Z`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;max-width:100%">${fill ? `<path d="${area}" fill="${C.sky}" opacity=".18"/>` : ""}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>${hiLast ? `<circle cx="${x(v.length - 1)}" cy="${y(v[v.length - 1])}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"/>` : ""}</svg>`;
}

// 30일 매출(막대) + 수익률(선) — 같은 x축 두 칸(이중 축 없음)
export function revMargin(W, days, avg, { barH = 190, lineH = 74, labelEvery = 3, compact = false } = {}) {
  if (!(W >= 160) || !days?.length) return "";
  const L = compact ? 34 : 44, R = compact ? 40 : 56, T = 22, gap = compact ? 30 : 34;
  const n = days.length || 1, iw = W - L - R, step = iw / n, bw = Math.max(3, step * 0.62);
  const vals = days.map((d) => d.sale / 1e4);
  const st = niceStep(Math.max(...vals, avg / 1e4, 1) * 1.08);
  const max = st * Math.ceil((Math.max(...vals, 1) * 1.08) / st);
  const yb = (v) => T + barH - (v / max) * barH;
  const fs = compact ? 10 : 11;
  const H = T + barH + gap + lineH + 26;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  for (let v = 0; v <= max + 1e-6; v += st) {
    s += `<line x1="${L}" x2="${W - R}" y1="${yb(v)}" y2="${yb(v)}" stroke="${v ? C.grid : "#CBD2DE"}" stroke-width="1"/>`;
    s += `<text x="${L - 8}" y="${yb(v) + 4}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${v ? fmt(v) : "0"}</text>`;
  }
  s += `<text x="${L - 8}" y="${T - 10}" font-size="${fs}" fill="${C.t3}" text-anchor="end">만원</text>`;
  const tx = L + (n - 1) * step;
  s += `<rect x="${tx}" y="${T - 4}" width="${step}" height="${barH + gap + lineH + 4}" fill="${C.sky}" opacity=".10" rx="4"/>`;
  days.forEach((d, i) => {
    const x = L + i * step + (step - bw) / 2, last = i === n - 1;
    const v = d.sale / 1e4; const y = yb(v);
    const col = last || d.inBasis ? C.n3 : d.off ? "#DCE3EF" : "#B8C8E6";
    if (v > 0) s += `<path d="M${x} ${T + barH} V${Math.min(y + 3, T + barH)} q0 -3 3 -3 H${x + bw - 3} q3 0 3 3 V${T + barH} Z" fill="${col}"/>`;
    if (last) s += `<text x="${x + bw / 2}" y="${y - 8}" font-size="${fs + 1}" font-weight="800" fill="${C.t1}" text-anchor="end">${fmt(v)}</text>`;
  });
  const a = avg / 1e4;
  if (a > 0) {
    s += `<line x1="${L}" x2="${W - R}" y1="${yb(a)}" y2="${yb(a)}" stroke="${C.t3}" stroke-dasharray="3 3" stroke-width="1"/>`;
    s += `<text x="${W - R + 6}" y="${yb(a) + 4}" font-size="${fs}" fill="${C.t2}">${compact ? "평균" : "평일 평균"}</text><text x="${W - R + 6}" y="${yb(a) + 17}" font-size="${fs}" fill="${C.t2}" font-weight="700">${fmt(a)}</text>`;
  }
  // 수익률
  const T2 = T + barH + gap;
  const ms = days.filter((d) => d.sale > 0).map((d) => d.margin);
  let mn = ms.length ? Math.min(...ms) : 0, mx = ms.length ? Math.max(...ms) : 10;
  mn = Math.floor(mn - 1); mx = Math.ceil(mx + 0.5); if (mx - mn < 3) mx = mn + 3;
  const yl = (v) => T2 + lineH - ((v - mn) / (mx - mn)) * lineH;
  const ticks = [mn + 1, Math.round((mn + mx) / 2), mx - 0.5].map((v) => Math.round(v));
  [...new Set(ticks)].forEach((v) => { s += `<line x1="${L}" x2="${W - R}" y1="${yl(v)}" y2="${yl(v)}" stroke="${C.grid}"/><text x="${L - 8}" y="${yl(v) + 4}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${v}%</text>`; });
  s += `<text x="${L}" y="${T2 - 12}" font-size="${fs + 1}" font-weight="700" fill="${C.t2}">수익률</text>`;
  const pts = days.map((d, i) => (d.sale > 0 ? [L + i * step + step / 2, yl(d.margin)] : null));
  let path = ""; let pen = false;
  pts.forEach((p) => { if (!p) { pen = false; return; } path += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)} `; pen = true; });
  if (path) s += `<path d="${path}" fill="none" stroke="${C.n3}" stroke-width="2" stroke-linejoin="round"/>`;
  const lp = pts[n - 1];
  if (lp) {
    s += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" fill="${C.n3}" stroke="#fff" stroke-width="2"/>`;
    const lbl = `${days[n - 1].margin.toFixed(1)}%`;
    s += compact ? `<text x="${lp[0] + 2}" y="${lp[1] - 10}" font-size="${fs + 1}" font-weight="800" fill="${C.t1}" text-anchor="middle">${lbl}</text>` : `<text x="${lp[0] + 9}" y="${lp[1] + 4}" font-size="${fs + 1}" font-weight="800" fill="${C.t1}">${lbl}</text>`;
  }
  days.forEach((d, i) => {
    const last = i === n - 1;
    if (i % labelEvery === (n - 1) % labelEvery || last) s += `<text x="${L + i * step + step / 2}" y="${T2 + lineH + 18}" font-size="${fs}" fill="${last ? C.t1 : C.t3}" font-weight="${last ? 700 : 400}" text-anchor="middle">${md(d.d)}${compact ? "" : `(${DOW[dowOf(d.d)]})`}</text>`;
  });
  return `${s}</svg>`;
}

const axisMan = (v) => (v >= 1e4 ? `${+(v / 1e4).toFixed(1)}억` : v ? `${fmt(v)}만` : "0");
const eokLbl = (v) => { const e = Math.floor(v / 1e4); const r = Math.round(v % 1e4); return e ? `${e}억${r ? fmt(r) : ""}` : `${fmt(r)}만`; };
// 이번 달 누계 vs 전월(영업일 기준) — 값은 만원
export function cumChart(W, H, { cur = [], prev = [], target = 0, forecast = 0, total = 21, curLabel = "", prevLabel = "" }, { compact = false } = {}) {
  const L = compact ? 40 : 46, R = compact ? 62 : 66, T = 18, B = 30, iw = W - L - R, ih = H - T - B;
  const N = Math.max(total, prev.length, cur.length, 2);
  const top = Math.max(target, forecast, prev[prev.length - 1] || 0, cur[cur.length - 1] || 0, 1) * 1.08;
  if (!(W >= 160)) return "";
  const st = niceStep(top, 3); const max = st * Math.ceil(top / st);
  const x = (i) => L + (i * iw) / (N - 1), y = (v) => T + ih - (v / max) * ih; const fs = compact ? 10 : 11;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  s += `<text x="${W - R}" y="${H - 10}" font-size="${fs}" fill="${C.t3}" text-anchor="start" dx="6">영업일</text>`;
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? C.grid : "#CBD2DE"}"/><text x="${L - 6}" y="${y(v) + 4}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${axisMan(v)}</text>`;
  if (target > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="${C.t2}" stroke-dasharray="2 3"/><text x="${L + 4}" y="${y(target) - 6}" font-size="${fs}" fill="${C.t2}">목표 ${eokLbl(target)}</text>`;
  const p = (arr, col, w, dash = "") => (arr.length ? `<path d="${arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round" stroke-linecap="round"/>` : "");
  s += p(prev, C.base, 2);
  const k = cur.length - 1;
  if (k >= 0 && N - 1 > k && forecast > 0) s += `<path d="M${x(k)} ${y(cur[k])} L${x(N - 1)} ${y(forecast)}" fill="none" stroke="${C.s1}" stroke-width="2" stroke-dasharray="4 4" opacity=".7"/>`;
  s += p(cur, C.s1, 2.5);
  if (k >= 0) {
    s += `<circle cx="${x(k)}" cy="${y(cur[k])}" r="4.5" fill="${C.s1}" stroke="#fff" stroke-width="2"/>`;
    s += `<text x="${x(k) + 8}" y="${y(cur[k]) - 8}" font-size="${fs + 1}" font-weight="800" fill="${C.t1}">${esc(curLabel || `${fmt(cur[k])}만`)}</text>`;
  }
  // 예상·전월 끝 라벨이 겹치지 않게(가까우면 위·아래로 벌림)
  const pvLast = prev.length ? prev[prev.length - 1] : null;
  let fy = y(forecast); let py = pvLast != null ? y(pvLast) : null;
  if (forecast > 0 && py != null && py < fy + 9 && py > fy - 44) { if (fy <= py) py = fy + 9; else fy = py + 44; }
  if (forecast > 0) s += `<text x="${x(N - 1) + 6}" y="${fy - 4}" font-size="${fs}" fill="${C.t2}">예상</text><text x="${x(N - 1) + 6}" y="${fy + 9}" font-size="${fs}" font-weight="700" fill="${C.t1}">${eokLbl(forecast)}</text>`;
  if (pvLast != null) s += `<text x="${x(prev.length - 1) + 6}" y="${py + 14}" font-size="${fs}" fill="${C.t3}">${esc(prevLabel)}</text><text x="${x(prev.length - 1) + 6}" y="${py + 27}" font-size="${fs}" font-weight="700" fill="${C.t2}">${eokLbl(pvLast)}</text>`;
  [1, 5, 10, 15, 20, N].filter((d, i, a) => d <= N && a.indexOf(d) === i && !(d === 20 && N - 20 < 2 && N !== 20)).forEach((d) => { s += `<text x="${x(d - 1)}" y="${H - 10}" font-size="${fs}" fill="${C.t3}" text-anchor="middle">${d}</text>`; });
  return `${s}</svg>`;
}

export function donut(size, parts, { thick = 18, center = "" } = {}) {
  const r = size / 2 - thick / 2 - 1, cx = size / 2, cy = size / 2, tot = parts.reduce((a, q) => a + q.v, 0) || 1;
  let a0 = -Math.PI / 2; let s = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block" ${FONT}>`;
  const live = parts.filter((q) => q.v > 0);
  const gapA = live.length > 1 ? 0.035 : 0;
  if (live.length === 1) s += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${live[0].c}" stroke-width="${thick}" fill="none"/>`;
  else live.forEach((q) => {
    const a1 = a0 + (q.v / tot) * Math.PI * 2; const s0 = a0 + gapA / 2, s1 = a1 - gapA / 2; const la = s1 - s0 > Math.PI ? 1 : 0;
    s += `<path d="M${cx + r * Math.cos(s0)} ${cy + r * Math.sin(s0)} A${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(s1)} ${cy + r * Math.sin(s1)}" stroke="${q.c}" stroke-width="${thick}" fill="none"/>`; a0 = a1;
  });
  return `${s}${center}</svg>`;
}

// 수입 vs 지출 묶음 막대(최근 영업일) — data: [[라벨, 수입(만), 지출(만)]]
export function cashBars(W, H, data, { compact = false } = {}) {
  if (!(W >= 120)) return "";
  const L = compact ? 34 : 40, R = 6, T = 14, B = 26, iw = W - L - R, ih = H - T - B, fs = compact ? 10 : 11;
  const top = Math.max(1, ...data.flatMap((d) => [d[1], d[2]])) * 1.15; const st = niceStep(top, 2); const max = st * Math.ceil(top / st);
  const y = (v) => T + ih - (v / max) * ih; const gw = iw / Math.max(1, data.length), bw = Math.min(22, gw * 0.28);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? C.grid : "#CBD2DE"}"/><text x="${L - 6}" y="${y(v) + 4}" font-size="${fs}" fill="${C.t3}" text-anchor="end">${fmt(v)}</text>`;
  const bar = (x, v, c) => (v > 0 ? `<path d="M${x} ${y(0)} V${Math.min(y(v) + 3, y(0))} q0 -3 3 -3 H${x + bw - 3} q3 0 3 3 V${y(0)} Z" fill="${c}"/>` : "");
  data.forEach((d, i) => {
    const cx = L + gw * i + gw / 2, last = i === data.length - 1;
    s += bar(cx - bw - 1, d[1], C.s1) + bar(cx + 1, d[2], C.s2);
    if (last) s += `<text x="${cx}" y="${y(d[1]) - 5}" font-size="${fs}" font-weight="700" fill="${C.t1}" text-anchor="end">${fmt(d[1])}</text><text x="${cx + 4}" y="${y(d[2]) - 5}" font-size="${fs}" font-weight="700" fill="${C.t1}" text-anchor="start">${fmt(d[2])}</text>`;
    s += `<text x="${cx}" y="${H - 8}" font-size="${fs}" fill="${last ? C.t1 : C.t3}" font-weight="${last ? 700 : 400}" text-anchor="middle">${esc(d[0])}</text>`;
  });
  return `${s}</svg>`;
}

// 월요일 — 지난주 요일별 매출 vs 전주(값 원) · hi: 강조할 요일 인덱스(이번 보고 구간)
export function weekBars(W, H, days, hi = [], { compact = false } = {}) {
  if (!(W >= 160)) return "";
  const L = compact ? 36 : 48, R = 12, T = 24, B = 34, iw = W - L - R, ih = H - T - B;
  const vals = days.flatMap((d) => [d.cur / 1e4, d.prev / 1e4]);
  const top = Math.max(1, ...vals) * 1.12; const st = niceStep(top, 3); const max = st * Math.ceil(top / st);
  const y = (v) => T + ih - (v / max) * ih; const gw = iw / 7, bw = Math.min(26, gw * 0.3); const fs = compact ? 10 : 11.5;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block" ${FONT}>`;
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? C.grid : "#CBD2DE"}"/><text x="${L - 8}" y="${y(v) + 4}" font-size="11" fill="${C.t3}" text-anchor="end">${fmt(v)}</text>`;
  if (hi.length) { const a = Math.min(...hi), b = Math.max(...hi); s += `<rect x="${L + gw * a + 2}" y="${T - 18}" width="${gw * (b - a + 1) - 4}" height="${ih + 18}" rx="8" fill="${C.sky}" opacity=".10"/><text x="${L + gw * ((a + b + 1) / 2)}" y="${T - 6}" font-size="11" font-weight="700" fill="${C.n3}" text-anchor="middle">이번 보고 ${hi.length}일 합산 구간</text>`; }
  const bar = (x, v, c) => (v > 0 ? `<path d="M${x} ${y(0)} V${Math.min(y(v) + 4, y(0))} q0 -4 4 -4 H${x + bw - 4} q4 0 4 4 V${y(0)} Z" fill="${c}"/>` : "");
  days.forEach((d, i) => {
    const cx = L + gw * i + gw / 2; const c = d.cur / 1e4, p = d.prev / 1e4;
    s += bar(cx - bw - 1, p, "#C3CAD6") + bar(cx + 1, c, C.s1);
    if (p > 0) { const dd = (c / p - 1) * 100; s += `<text x="${cx}" y="${y(Math.max(c, p)) - 8}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${dd >= 0 ? C.pos : C.neg}">${dd >= 0 ? "▲" : "▼"}${Math.abs(dd).toFixed(1)}%</text>`; }
    s += `<text x="${cx}" y="${H - 12}" font-size="${compact ? 10 : 12}" fill="${hi.includes(i) ? C.t1 : C.t2}" font-weight="${hi.includes(i) ? 700 : 400}" text-anchor="middle">${DOW[dowOf(d.d)]}${compact ? "" : ` ${md(d.d)}`}</text>`;
  });
  return `${s}</svg>`;
}
