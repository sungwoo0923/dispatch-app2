// ======================= src/dailyReportCharts.js =======================
// 📊 일일 경영 보고 차트(SVG 문자열) — 폭(W)은 화면이 재서 넘긴다.
//  👑 2026-11-17 임원 디자인(딥 네이비 + 골드) — 모든 차트가 th(차트 색 묶음)를 받는다.
//     CT_DARK = 화면(임원 다크) · CT_PAPER = PDF 저장용 흰 종이(인쇄해도 잘 읽히게). th 를 안 주면 CT_PAPER.
//  ※ C · esc · niceStep 은 execCharts.js · TeamReport · ExecAnalytics · ExecStaffInfo 가 같이 쓴다(이름·값 그대로 둔다).
import { fmt, md, DOW, dowOf } from "./dailyReportCore";

export const C = {
  n0: "#0B1428", n1: "#0F1A30", n2: "#1B2B4B", n3: "#2D4C82", sky: "#8FB0F0",
  page: "#F3F5F9", card: "#FFFFFF", line: "#E4E8F0", grid: "#EDF0F5",
  t1: "#0F1A30", t2: "#4A5568", t3: "#667085",
  // 증감 색(한국 금융 관례): 상승 = 빨강, 하락 = 파랑, 변화 없음 = 회색 · 글자색으로만 쓴다(배경 없음)
  up: "#D92D20", down: "#1E5BD8", flat: "#6B7588", upL: "#FF9A92", downL: "#93B8FF",
  pos: "#D92D20", neg: "#1E5BD8", err: "#B42318",
  red: "#C53030", redBg: "#FDECEC", amber: "#B7791F", amberBg: "#FDF4E3",
  s1: "#2a78d6", s2: "#eb6834", s3: "#6250d6", base: "#A0A8B8",
};
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 보기 좋은 눈금 간격
export function niceStep(max, n = 3) {
  if (!(max > 0)) return 1;
  const raw = max / n; const p = 10 ** Math.floor(Math.log10(raw)); const k = raw / p;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p;
}

// ── 차트 색 묶음 ──
export const CT_DARK = {
  id: "d", text: "#F4F6FB", sub: "rgba(232,238,250,0.72)", mute: "rgba(232,238,250,0.52)", faint: "rgba(232,238,250,0.30)",
  grid: "rgba(255,255,255,0.07)", zero: "rgba(255,255,255,0.20)", bg: "#0A1328",
  gold: "#D7BC82", goldHi: "#F1DDAE", goldDeep: "#A8874A", ice: "#8FB0F0", iceDeep: "#4B6CB7",
  bar: "#8FB0F0", barOp: 0.42, barOff: "rgba(143,176,240,0.14)", base: "rgba(232,238,250,0.38)",
  up: "#FF8A7A", down: "#7FB0FF", band: "rgba(215,188,130,0.09)", warn: "#F5C46B",
};
export const CT_PAPER = {
  id: "p", text: "#0A1328", sub: "#3B4560", mute: "#646C82", faint: "#A3A9B8",
  grid: "#ECE8DF", zero: "#C9C3B5", bg: "#FFFFFF",
  gold: "#B08E4E", goldHi: "#8C6B2E", goldDeep: "#8C6B2E", ice: "#4B6CB7", iceDeep: "#2D4C82",
  bar: "#7F9BD6", barOp: 0.5, barOff: "#E6EBF5", base: "#9AA0AE",
  up: "#D92D20", down: "#1E5BD8", band: "rgba(176,142,78,0.09)", warn: "#B7791F",
};
const FONT_ATTR = `font-family="Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif" style="display:block;font-variant-numeric:tabular-nums"`;
const svgOpen = (W, H) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT_ATTR}>`;
const gid = (th, name) => `drc-${th.id}-${name}`;
// 위쪽만 둥근 막대
const barPath = (x, y, w, h, r) => { const rr = Math.max(0, Math.min(r, w / 2, h)); return `M${x} ${y + h} V${y + rr} Q${x} ${y} ${x + rr} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h} Z`; };
const vGrad = (id, color, a = 0.9, b = 0.25) => `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="${a}"/><stop offset="100%" stop-color="${color}" stop-opacity="${b}"/></linearGradient>`;
const goldGrad = (id, th) => `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${th.goldHi}"/><stop offset="55%" stop-color="${th.gold}"/><stop offset="100%" stop-color="${th.goldDeep}"/></linearGradient>`;

// 작은 추이선(타일 아래) — 마지막 점 강조
export function spark(vals, w = 120, h = 30, { color, th = CT_PAPER, fill = true, hiLast = true } = {}) {
  const v = vals && vals.length > 1 ? vals : [0, 0];
  const col = color || th.ice;
  const mn = Math.min(...v), mx = Math.max(...v), pad = 4;
  const x = (i) => pad + (i * (w - 2 * pad)) / (v.length - 1), y = (q) => h - pad - ((q - mn) / (mx - mn || 1)) * (h - 2 * pad);
  const d = v.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(q).toFixed(1)}`).join(" ");
  const area = `${d} L${x(v.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`;
  const id = gid(th, `sp${col.replace(/[^0-9a-z]/gi, "")}`);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;max-width:100%"><defs>${vGrad(id, col, 0.32, 0)}</defs>${fill ? `<path d="${area}" fill="url(#${id})"/>` : ""}<path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>${hiLast ? `<circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="3.2" fill="${col}" stroke="${th.bg}" stroke-width="1.6"/>` : ""}</svg>`;
}

// 매출(막대) + 수익률(선) — 같은 x축 두 칸(이중 축 없음) · days: [{ d, sale, margin, off, inBasis }]
export function revMargin(W, days, avg, { barH = 190, lineH = 74, labelEvery = 3, compact = false, th = CT_PAPER, valueLabels = false } = {}) {
  if (!(W >= 160) || !days?.length) return "";
  const L = compact ? 40 : 52, R = compact ? 50 : 78, T = valueLabels ? 34 : 28, gap = compact ? 44 : 50;
  const n = days.length || 1, iw = W - L - R, step = iw / n, bw = Math.max(3, Math.min(34, step * (n > 20 ? 0.62 : 0.56)));
  const vals = days.map((d) => d.sale / 1e4);
  const st = niceStep(Math.max(...vals, avg / 1e4, 1) * 1.08);
  const max = st * Math.ceil((Math.max(...vals, avg / 1e4, 1) * 1.08) / st);
  const yb = (v) => T + barH - (v / max) * barH;
  const fs = compact ? 11.5 : 12.5;
  const H = T + barH + gap + lineH + 34;
  const gB = gid(th, "rmB"), gG = gid(th, "rmG"), gL = gid(th, "rmL");
  let s = `${svgOpen(W, H)}<defs>${vGrad(gB, th.bar, th.barOp + 0.3, th.barOp - 0.15)}${goldGrad(gG, th)}${vGrad(gL, th.ice, 0.22, 0)}</defs>`;
  for (let v = 0; v <= max + 1e-6; v += st) {
    s += `<line x1="${L}" x2="${W - R}" y1="${yb(v)}" y2="${yb(v)}" stroke="${v ? th.grid : th.zero}" stroke-width="1" ${v ? `stroke-dasharray="3 6"` : ""}/>`;
    s += `<text x="${L - 10}" y="${yb(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${v ? fmt(v) : "0"}</text>`;
  }
  s += `<text x="${L - 10}" y="${T - 14}" font-size="${fs - 0.5}" fill="${th.faint}" text-anchor="end">만원</text>`;
  const tx = L + (n - 1) * step;
  s += `<rect x="${tx}" y="${T - 6}" width="${step}" height="${barH + gap + lineH + 8}" fill="${th.band}" rx="6"/>`;
  days.forEach((d, i) => {
    const x = L + i * step + (step - bw) / 2, last = i === n - 1;
    const v = d.sale / 1e4; const y = yb(v);
    const fill = last || d.inBasis ? `url(#${gG})` : d.off ? th.barOff : `url(#${gB})`;
    if (v > 0) s += `<path d="${barPath(x, y, bw, T + barH - y, Math.min(5, bw / 2))}" fill="${fill}"/>`;
    if (last) s += `<text x="${x + bw / 2}" y="${y - 9}" font-size="${fs + 3}" font-weight="900" fill="${th.goldHi}" text-anchor="${valueLabels ? "middle" : "end"}">${fmt(v)}</text>`;
    else if (valueLabels && v > 0 && step >= 34) s += `<text x="${x + bw / 2}" y="${y - 7}" font-size="${fs - 1}" font-weight="700" fill="${d.off ? th.faint : th.mute}" text-anchor="middle">${fmt(v)}</text>`;
  });
  const a = avg / 1e4;
  if (a > 0) {
    s += `<line x1="${L}" x2="${W - R}" y1="${yb(a)}" y2="${yb(a)}" stroke="${th.gold}" stroke-opacity=".75" stroke-dasharray="5 5" stroke-width="1.2"/>`;
    s += `<text x="${W - R + 8}" y="${yb(a) - 2}" font-size="${fs}" fill="${th.mute}">${compact ? "평균" : "평일 평균"}</text><text x="${W - R + 8}" y="${yb(a) + 14}" font-size="${fs + 0.5}" fill="${th.gold}" font-weight="800">${fmt(a)}</text>`;
  }
  // 수익률
  const T2 = T + barH + gap;
  const ms = days.filter((d) => d.sale > 0).map((d) => d.margin);
  let mn = ms.length ? Math.min(...ms) : 0, mx = ms.length ? Math.max(...ms) : 10;
  mn = Math.floor(mn - 1); mx = Math.ceil(mx + 0.5); if (mx - mn < 3) mx = mn + 3;
  const yl = (v) => T2 + lineH - ((v - mn) / (mx - mn)) * lineH;
  const ticks = [mn + 1, Math.round((mn + mx) / 2), mx - 0.5].map((v) => Math.round(v));
  [...new Set(ticks)].forEach((v) => { s += `<line x1="${L}" x2="${W - R}" y1="${yl(v)}" y2="${yl(v)}" stroke="${th.grid}" stroke-dasharray="3 6"/><text x="${L - 10}" y="${yl(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${v}%</text>`; });
  s += `<text x="${L}" y="${T2 - 16}" font-size="${fs}" font-weight="800" fill="${th.ice}" letter-spacing="0.5">매출총이익률</text>`;
  const pts = days.map((d, i) => (d.sale > 0 ? [L + i * step + step / 2, yl(d.margin)] : null));
  let path = ""; let pen = false; let first = null; let lastPt = null;
  pts.forEach((p) => { if (!p) { pen = false; return; } path += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)} `; pen = true; if (!first) first = p; lastPt = p; });
  if (path && first && lastPt && !pts.includes(null)) s += `<path d="${path} L${lastPt[0].toFixed(1)} ${T2 + lineH} L${first[0].toFixed(1)} ${T2 + lineH} Z" fill="url(#${gL})"/>`;
  if (path) s += `<path d="${path}" fill="none" stroke="${th.ice}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (n <= 16) pts.forEach((p, i) => { if (p && i < n - 1) s += `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${th.bg}" stroke="${th.ice}" stroke-width="1.6"/>`; });
  const lp = pts[n - 1];
  if (lp) {
    s += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" fill="${th.gold}" stroke="${th.bg}" stroke-width="2"/>`;
    const lbl = `${days[n - 1].margin.toFixed(1)}%`;
    s += compact ? `<text x="${lp[0] + 2}" y="${lp[1] - 10}" font-size="${fs + 2}" font-weight="900" fill="${th.goldHi}" text-anchor="middle">${lbl}</text>` : `<text x="${lp[0] + 12}" y="${lp[1] + 5}" font-size="${fs + 3}" font-weight="900" fill="${th.goldHi}">${lbl}</text>`;
  }
  days.forEach((d, i) => {
    const last = i === n - 1;
    if (i % labelEvery === (n - 1) % labelEvery || last) s += `<text x="${L + i * step + step / 2}" y="${T2 + lineH + 26}" font-size="${fs}" fill="${last ? th.goldHi : d.off ? th.faint : th.mute}" font-weight="${last ? 800 : 600}" text-anchor="middle">${md(d.d)}${compact || step * labelEvery < 64 ? "" : `(${DOW[dowOf(d.d)]})`}</text>`;
  });
  return `${s}</svg>`;
}

const axisMan = (v) => (v >= 1e4 ? `${+(v / 1e4).toFixed(1)}억` : v ? `${fmt(v)}만` : "0");
const eokLbl = (v) => { const e = Math.floor(v / 1e4); const r = Math.round(v % 1e4); return e ? `${e}억${r ? ` ${fmt(r)}만` : ""}` : `${fmt(r)}만`; };
// 이번 달 누계 vs 전월(영업일 기준) — 값은 만원
export function cumChart(W, H, { cur = [], prev = [], target = 0, forecast = 0, total = 21, curLabel = "", prevLabel = "" }, { compact = false, th = CT_PAPER } = {}) {
  const L = compact ? 46 : 56, R = compact ? 80 : 96, T = 24, B = 34, iw = W - L - R, ih = H - T - B;
  const N = Math.max(total, prev.length, cur.length, 2);
  const top = Math.max(target, forecast, prev[prev.length - 1] || 0, cur[cur.length - 1] || 0, 1) * 1.08;
  if (!(W >= 160)) return "";
  const st = niceStep(top, 3); const max = st * Math.ceil(top / st);
  const x = (i) => L + (i * iw) / (N - 1), y = (v) => T + ih - (v / max) * ih; const fs = compact ? 11.5 : 12.5;
  const gA = gid(th, "cumA");
  let s = `${svgOpen(W, H)}<defs>${vGrad(gA, th.gold, 0.28, 0)}</defs>`;
  s += `<text x="${W - R}" y="${H - 10}" font-size="${fs}" fill="${th.faint}" text-anchor="start" dx="8">영업일</text>`;
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? th.grid : th.zero}" ${v ? `stroke-dasharray="3 6"` : ""}/><text x="${L - 8}" y="${y(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${axisMan(v)}</text>`;
  if (target > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="${th.sub}" stroke-opacity=".7" stroke-dasharray="2 4"/><text x="${L + 6}" y="${y(target) - 7}" font-size="${fs}" font-weight="700" fill="${th.sub}">목표 ${eokLbl(target)}</text>`;
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  if (prev.length) s += `<path d="${line(prev)}" fill="none" stroke="${th.base}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  const k = cur.length - 1;
  if (k >= 0 && N - 1 > k && forecast > 0) s += `<path d="M${x(k)} ${y(cur[k])} L${x(N - 1)} ${y(forecast)}" fill="none" stroke="${th.gold}" stroke-width="1.8" stroke-dasharray="5 5" opacity=".8"/>`;
  if (k >= 1) s += `<path d="${line(cur)} L${x(k).toFixed(1)} ${T + ih} L${x(0).toFixed(1)} ${T + ih} Z" fill="url(#${gA})"/>`;
  if (cur.length) s += `<path d="${line(cur)}" fill="none" stroke="${th.gold}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (k >= 0) {
    s += `<circle cx="${x(k)}" cy="${y(cur[k])}" r="5" fill="${th.gold}" stroke="${th.bg}" stroke-width="2"/>`;
    s += `<text x="${x(k) + 9}" y="${y(cur[k]) - 11}" font-size="${fs + 3}" font-weight="900" fill="${th.goldHi}">${esc(curLabel || `${fmt(cur[k])}만`)}</text>`;
  }
  // 예상·전월 끝 라벨이 겹치지 않게(가까우면 위·아래로 벌림)
  const pvLast = prev.length ? prev[prev.length - 1] : null;
  let fy = y(forecast); let py = pvLast != null ? y(pvLast) : null;
  if (forecast > 0 && py != null && py < fy + 12 && py > fy - 54) { if (fy <= py) py = fy + 12; else fy = py + 54; }
  if (forecast > 0) s += `<text x="${x(N - 1) + 8}" y="${fy - 5}" font-size="${fs}" fill="${th.mute}">월말 예상</text><text x="${x(N - 1) + 8}" y="${fy + 12}" font-size="${fs + 0.5}" font-weight="900" fill="${th.gold}">${eokLbl(forecast)}</text>`;
  if (pvLast != null) s += `<text x="${x(prev.length - 1) + 8}" y="${py + 17}" font-size="${fs}" fill="${th.mute}">${esc(prevLabel)}</text><text x="${x(prev.length - 1) + 8}" y="${py + 33}" font-size="${fs}" font-weight="800" fill="${th.sub}">${eokLbl(pvLast)}</text>`;
  [1, 5, 10, 15, 20, N].filter((d, i, a) => d <= N && a.indexOf(d) === i && !(d === 20 && N - 20 < 2 && N !== 20)).forEach((d) => { s += `<text x="${x(d - 1)}" y="${H - 10}" font-size="${fs}" fill="${th.mute}" text-anchor="middle">${d}</text>`; });
  return `${s}</svg>`;
}

// 도넛 — parts: [{ v, c }] · track: 빈 칸 색
export function donut(size, parts, { thick = 18, center = "", track = null } = {}) {
  const r = size / 2 - thick / 2 - 1, cx = size / 2, cy = size / 2, tot = parts.reduce((a, q) => a + q.v, 0) || 1;
  let a0 = -Math.PI / 2; let s = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${FONT_ATTR}>`;
  if (track) s += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${track}" stroke-width="${thick}" fill="none"/>`;
  const live = parts.filter((q) => q.v > 0);
  const gapA = live.length > 1 ? 0.04 : 0;
  if (live.length === 1) s += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${live[0].c}" stroke-width="${thick}" fill="none"/>`;
  else live.forEach((q) => {
    const a1 = a0 + (q.v / tot) * Math.PI * 2; const s0 = a0 + gapA / 2, s1 = a1 - gapA / 2; const la = s1 - s0 > Math.PI ? 1 : 0;
    s += `<path d="M${cx + r * Math.cos(s0)} ${cy + r * Math.sin(s0)} A${r} ${r} 0 ${la} 1 ${cx + r * Math.cos(s1)} ${cy + r * Math.sin(s1)}" stroke="${q.c}" stroke-width="${thick}" fill="none"/>`; a0 = a1;
  });
  return `${s}${center}</svg>`;
}

// 수입 vs 지출 묶음 막대(최근 영업일) — data: [[라벨, 수입(만), 지출(만)]]
export function cashBars(W, H, data, { compact = false, th = CT_PAPER } = {}) {
  if (!(W >= 120)) return "";
  const L = compact ? 44 : 52, R = 6, T = 22, B = 32, iw = W - L - R, ih = H - T - B, fs = compact ? 11.5 : 12.5;
  const top = Math.max(1, ...data.flatMap((d) => [d[1], d[2]])) * 1.15; const st = niceStep(top, 2); const max = st * Math.ceil(top / st);
  const y = (v) => T + ih - (v / max) * ih; const gw = iw / Math.max(1, data.length), bw = Math.min(22, gw * 0.28);
  let s = svgOpen(W, H);
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? th.grid : th.zero}"/><text x="${L - 6}" y="${y(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${fmt(v)}</text>`;
  const bar = (x, v, c) => (v > 0 ? `<path d="${barPath(x, y(v), bw, y(0) - y(v), 3)}" fill="${c}"/>` : "");
  data.forEach((d, i) => {
    const cx = L + gw * i + gw / 2, last = i === data.length - 1;
    s += bar(cx - bw - 1, d[1], th.gold) + bar(cx + 1, d[2], th.ice);
    s += `<text x="${cx}" y="${H - 8}" font-size="${fs}" fill="${last ? th.text : th.mute}" font-weight="${last ? 700 : 500}" text-anchor="middle">${esc(d[0])}</text>`;
  });
  return `${s}</svg>`;
}

// 월요일 — 지난주 요일별 매출 vs 전주(값 원) · hi: 강조할 요일 인덱스(이번 보고 구간)
export function weekBars(W, H, days, hi = [], { compact = false, th = CT_PAPER } = {}) {
  if (!(W >= 160)) return "";
  const L = compact ? 44 : 56, R = 12, T = 36, B = 40, iw = W - L - R, ih = H - T - B;
  const vals = days.flatMap((d) => [d.cur / 1e4, d.prev / 1e4]);
  const top = Math.max(1, ...vals) * 1.12; const st = niceStep(top, 3); const max = st * Math.ceil(top / st);
  const y = (v) => T + ih - (v / max) * ih; const gw = iw / 7, bw = Math.min(28, gw * 0.3); const fs = compact ? 11.5 : 12.5;
  const gG = gid(th, "wkG");
  let s = `${svgOpen(W, H)}<defs>${goldGrad(gG, th)}</defs>`;
  for (let v = 0; v <= max + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? th.grid : th.zero}" ${v ? `stroke-dasharray="3 6"` : ""}/><text x="${L - 8}" y="${y(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${fmt(v)}</text>`;
  if (hi.length) { const a = Math.min(...hi), b = Math.max(...hi); s += `<rect x="${L + gw * a + 2}" y="${T - 28}" width="${gw * (b - a + 1) - 4}" height="${ih + 28}" rx="8" fill="${th.band}"/><text x="${L + gw * ((a + b + 1) / 2)}" y="${T - 12}" font-size="${fs}" font-weight="800" fill="${th.gold}" text-anchor="middle">보고 기준 ${hi.length}일 합산 구간</text>`; }
  const bar = (x, v, c) => (v > 0 ? `<path d="${barPath(x, y(v), bw, y(0) - y(v), 4)}" fill="${c}"/>` : "");
  days.forEach((d, i) => {
    const cx = L + gw * i + gw / 2; const c = d.cur / 1e4, p = d.prev / 1e4;
    s += bar(cx - bw - 1, p, th.barOff) + bar(cx + 1, c, `url(#${gG})`);
    if (p > 0) { const dd = (c / p - 1) * 100; s += `<text x="${cx}" y="${y(Math.max(c, p)) - 8}" font-size="${fs}" font-weight="800" text-anchor="middle" fill="${dd > 0 ? th.up : dd < 0 ? th.down : th.mute}">${dd > 0 ? "▲" : dd < 0 ? "▼" : ""}${Math.abs(dd).toFixed(compact ? 0 : 1)}%</text>`; }
    s += `<text x="${cx}" y="${H - 12}" font-size="${fs}" fill="${hi.includes(i) ? th.text : th.mute}" font-weight="${hi.includes(i) ? 800 : 500}" text-anchor="middle">${DOW[dowOf(d.d)]}${compact ? "" : ` ${md(d.d)}`}</text>`;
  });
  return `${s}</svg>`;
}

// 순현금흐름(입금 − 출금) 막대 — 0선 위 = 빨강(순유입), 아래 = 파랑(순유출) · data: [[라벨, 순액(만)]]
export function netFlowBars(W, H, data, { compact = false, labelEvery = 1, th = CT_PAPER } = {}) {
  if (!(W >= 160) || !data?.length) return "";
  const L = compact ? 52 : 60, R = 10, T = 26, B = 34, iw = W - L - R, ih = H - T - B, fs = compact ? 11.5 : 12.5;
  const vals = data.map((d) => d[1]);
  const top = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const st = niceStep(top * 1.15, 2);
  const hi = Math.max(st, st * Math.ceil((Math.max(0, ...vals) * 1.15) / st));
  const lo = -st * Math.ceil((Math.max(0, ...vals.map((v) => -v)) * 1.15) / st);
  const y = (v) => T + ((hi - v) / (hi - lo || 1)) * ih;
  const gw = iw / data.length, bw = Math.max(4, Math.min(24, gw * 0.56));
  let s = svgOpen(W, H);
  for (let v = lo; v <= hi + 1e-6; v += st) { const zero = Math.abs(v) < 1e-6; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${zero ? th.zero : th.grid}" stroke-width="${zero ? 1.4 : 1}" ${zero ? "" : `stroke-dasharray="3 6"`}/><text x="${L - 8}" y="${y(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}</text>`; }
  data.forEach((d, i) => {
    const x = L + gw * i + (gw - bw) / 2, v = d[1], last = i === data.length - 1;
    const y0 = y(0), y1 = y(v);
    if (v) s += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1.5, Math.abs(y1 - y0))}" rx="3" fill="${v > 0 ? th.up : th.down}" opacity="${last ? 1 : 0.55}"/>`;
    if (last && v) s += `<text x="${x + bw / 2}" y="${v > 0 ? y1 - 8 : y1 + 18}" font-size="${fs + 1.5}" font-weight="900" fill="${v > 0 ? th.up : th.down}" text-anchor="end">${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}</text>`;
    if (i % labelEvery === (data.length - 1) % labelEvery || last) s += `<text x="${x + bw / 2}" y="${H - 10}" font-size="${fs}" fill="${last ? th.text : th.mute}" font-weight="${last ? 800 : 500}" text-anchor="middle">${esc(d[0])}</text>`;
  });
  return `${s}</svg>`;
}

// 선 하나 추이(가동률 등) — pts: [[라벨, 값]] · 끝값 직접 표시 · 평균선
export function trendLine(W, H, pts, { unit = "%", compact = false, labelEvery = 2, min = null, max = null, color, th = CT_PAPER } = {}) {
  if (!(W >= 160) || !pts?.length) return "";
  const col = color || th.ice;
  const L = compact ? 46 : 54, R = compact ? 66 : 84, T = 28, B = 34, iw = W - L - R, ih = H - T - B, fs = compact ? 11.5 : 12.5;
  const vals = pts.map((p) => p[1]);
  const lo = min != null ? min : Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10); let hi = max != null ? max : Math.min(100, Math.ceil((Math.max(...vals) + 5) / 10) * 10);
  if (hi - lo < 10) hi = lo + 10;
  const n = pts.length; const x = (i) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
  const gA = gid(th, `tl${col.replace(/[^0-9a-z]/gi, "")}`);
  let s = `${svgOpen(W, H)}<defs>${vGrad(gA, col, 0.26, 0)}</defs>`;
  const st = niceStep(hi - lo, 2);
  for (let v = lo; v <= hi + 1e-6; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${th.grid}" stroke-dasharray="3 6"/><text x="${L - 8}" y="${y(v) + 4}" font-size="${fs}" fill="${th.mute}" text-anchor="end">${fmt(v)}${unit}</text>`;
  const avg = vals.reduce((a, v) => a + v, 0) / n;
  s += `<line x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}" stroke="${th.gold}" stroke-opacity=".7" stroke-dasharray="5 5"/>`;
  s += `<text x="${L + 8}" y="${y(avg) - 7}" font-size="${fs}" font-weight="700" fill="${th.gold}">평균 ${avg.toFixed(0)}${unit}</text>`;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  s += `<path d="${d} L${x(n - 1)} ${T + ih} L${x(0)} ${T + ih} Z" fill="url(#${gA})"/>`;
  s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach((p, i) => { const last = i === n - 1; s += `<circle cx="${x(i)}" cy="${y(p[1])}" r="${last ? 5 : 2.6}" fill="${last ? th.gold : th.bg}" stroke="${last ? th.bg : col}" stroke-width="${last ? 2 : 1.6}"/>`; });
  s += `<text x="${x(n - 1) + 11}" y="${y(vals[n - 1]) + 5}" font-size="${fs + 3}" font-weight="900" fill="${th.goldHi}">${vals[n - 1].toFixed(1)}${unit}</text>`;
  pts.forEach((p, i) => { const last = i === n - 1; if (i % labelEvery === (n - 1) % labelEvery || last) s += `<text x="${x(i)}" y="${H - 10}" font-size="${fs}" fill="${last ? th.text : th.mute}" font-weight="${last ? 800 : 500}" text-anchor="middle">${esc(p[0])}</text>`; });
  return `${s}</svg>`;
}
