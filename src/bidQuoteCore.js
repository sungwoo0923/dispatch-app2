// ======================= src/bidQuoteCore.js =======================
// 🧮 2026-11-23 입찰견적 계산기(단가표 › 입찰견적) — 순수 함수만(firebase · 화면 없음). scripts/bidQuote.test.mjs 가 시험한다.
//  · 원가(기사에게 줄 돈)를 아래에서 쌓는다: 실적 기사운임 ↔ 거리 요율 → 화물 할증(위험물 · 냉장 · 냉동 · 냉난방)
//    → 지역(귀로 어려움) → ALL-IN 기대비용(야간 · 휴일 × 발생 비율) → 건당 비용(수작업 · 지게차 · 항만 대기 · 기타)
//  · 가격 3단: 하한(손익분기+최소마진) · 권장(목표마진) · 공격(수주 우선). 마진 = (매출 − 원가) ÷ 매출 — 배차표 수수료율과 같은 식
//  · 검사: 손해 · 마진 부족 · 무거운 구간이 더 쌈 · 할증 규칙과 안 맞음 · 거리 대비 튀는 값
//  · 양식이 달라도: 엑셀에서 복사한 표(탭 구분)를 붙여 넣으면 도착지 축 · 규격(톤수/중량/파렛) 축 · 물량 묶음을 알아서 찾는다
import { VEHICLE_TYPES } from "./tmapFareCalc.js";

// ───────────── 기본 설정(회사관리처럼 회사마다 고칠 수 있음) ─────────────
export const BID_DEFAULTS = {
  tableToCost: 90,      // 거리 요율표(전국운임조회 기준) → 기사운임 환산 %
  targetMargin: 12,     // 권장가 마진 %
  minMargin: 3,         // 하한가 마진 %
  aggressiveMargin: 6,  // 공격가 마진 %
  roundUnit: 1000,      // 단가 올림 단위(원)
  dangerPct: 25,        // 위험물 할증 %
  coldPct: 20,          // 냉장 %
  frozenPct: 30,        // 냉동 %
  hvacPct: 30,          // 냉난방 %
  handworkCase: 30000,  // 수작업 건당
  handworkPerTon: 10000,// 수작업 톤당
  forkliftEach: 50000,  // 지게차 1회
  nightPct: 20, nightShare: 10,     // 야간 할증 % × 발생 비율 %
  holidayPct: 30, holidayShare: 5,  // 휴일 할증 % × 발생 비율 %
  backhaulPct: 10,      // 귀로 짐 잡기 어려운 지역 %
  backhaulRegions: "강원,전남,제주,울릉,신안,완도,진도,고흥,해남,태안",
  portWait: 20000,      // 항만 · 보세 상차 대기(건당)
  mixRefTon: 11,        // 혼적 기준 차량 톤수
  mixLoad: 80,          // 혼적 평균 적재율 %
  mixMinShare: 10,      // 혼적 최소 비율 %(아주 가벼운 짐도 이만큼은 받는다)
  mixFixed: 70000,      // 혼적 집하 · 배송 고정비(건당 — 소형차 픽업 · 배송, 거리와 크게 상관없음)
  histMax: 80,          // 실적 반영 최대 %(실적이 많아도 거리 요율을 이만큼은 섞는다)
};

export const CARGO_TYPES = ["일반", "위험물", "냉장", "냉동", "냉난방"];
export const cargoPct = (cargo, p = BID_DEFAULTS) =>
  ({ 위험물: p.dangerPct, 냉장: p.coldPct, 냉동: p.frozenPct, 냉난방: p.hvacPct }[cargo] || 0);

export const toNum = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
export const money = (v) => { const s = String(v ?? "").replace(/[^\d]/g, ""); return s ? Number(s) : 0; };
export const roundUp = (n, unit = 1000) => (n > 0 ? Math.ceil(n / unit) * unit : 0);
export const marginOf = (sale, cost) => (sale > 0 ? (sale - cost) / sale : 0);
export const priceForMargin = (cost, pct, unit = 1000) => roundUp(cost / (1 - Math.min(90, pct) / 100), unit);

// ───────────── 차량 표(톤수 → 거리 요율) ─────────────
const VT = Object.fromEntries(VEHICLE_TYPES.map((v) => [v.id, v]));
const TON_POINTS = [["damas", 0.5], ["1ton", 1], ["1.4ton", 1.4], ["2.5ton", 2.5], ["3.5ton", 3.5], ["5ton", 5], ["11ton", 11], ["18ton", 18], ["25ton", 25]]
  .filter(([id]) => VT[id]).map(([id, ton]) => ({ ton, ...VT[id] }));
const STD_TONS = [1, 1.4, 2.5, 3.5, 5, 11, 18, 25];
const PALLET_CAP = { 1: 2, 1.4: 4, 2.5: 6, 3.5: 9, 5: 12, 11: 20, 18: 24, 25: 28 };
export const capKg = (ton) => ton * 1100; // 적재 여유 10%

// 톤수 숫자 → { base, perKm, min } (표에 없는 8톤 · 15톤은 앞뒤 톤수 사이를 비율로)
export function rateForTon(ton, label = "") {
  const s = String(label || "");
  if (/트레일러|추레라/.test(s) && VT.trailer) return VT.trailer;
  if (/로베드|로우베드/.test(s) && VT.lowbed) return VT.lowbed;
  if (/축/.test(s) && ton >= 4.5 && ton < 6.5 && VT["5tonAx"]) return VT["5tonAx"];
  if (/광폭/.test(s) && ton >= 3 && ton < 4.5 && VT["3.5tonW"]) return VT["3.5tonW"];
  const t = Math.max(0.5, Number(ton) || 1);
  const pts = TON_POINTS;
  if (t <= pts[0].ton) return pts[0];
  if (t >= pts[pts.length - 1].ton) return pts[pts.length - 1];
  const hi = pts.findIndex((p) => p.ton >= t);
  const a = pts[hi - 1], b = pts[hi];
  if (b.ton === t) return b;
  const k = (t - a.ton) / (b.ton - a.ton);
  const mix = (x, y) => Math.round(x + (y - x) * k);
  return { base: mix(a.base, b.base), perKm: mix(a.perKm, b.perKm), min: mix(a.min, b.min) };
}
// 거리 요율로 본 기사운임(독차 1대)
export function tableCost(ton, km, p = BID_DEFAULTS, label = "") {
  const r = rateForTon(ton, label);
  const fare = Math.max(r.min, r.base + r.perKm * Math.max(0, Number(km) || 0));
  return Math.round(fare * (p.tableToCost / 100));
}
// 무게(kg)를 실을 수 있는 가장 작은 표준 차량 톤수
export function tonForKg(kg) { return STD_TONS.find((t) => capKg(t) >= kg) || 25; }
export function tonForPallet(n) { return STD_TONS.find((t) => (PALLET_CAP[t] || 0) >= n) || 25; }

// ───────────── 규격 이름 읽기 ─────────────
// "1 TON" · "2.5톤" · "5T" → 톤 / "300 미만" · "1,000" → kg / "3파렛" → 파렛 / "17500 이상 시 ton당 추가비용" → 톤당 추가
export function parseSizeLabel(label, kindHint = "") {
  const s = String(label ?? "").replace(/\s+/g, " ").trim();
  const num = toNum((s.match(/\d[\d,]*(?:\.\d+)?/) || [""])[0]);
  const cargo = /냉난방/.test(s) ? "냉난방" : /냉동/.test(s) ? "냉동" : /냉장/.test(s) ? "냉장" : /위험/.test(s) ? "위험물" : "";
  const perTon = /(톤|ton)\s*당/i.test(s);
  let kind = kindHint;
  if (!kind) {
    if (/(파렛|파레트|팔레트|plt|pallet|\dp\b)/i.test(s)) kind = "pallet";
    else if (/kg|㎏/i.test(s) || num >= 100) kind = "weight";
    else if (/\d\s*(톤|ton|t)\b/i.test(s) || /톤/.test(s)) kind = "ton";
    else kind = num >= 100 ? "weight" : "ton";
  }
  return { label: s, value: num, kind, cargo, perTon, trailer: /트레일러|추레라/.test(s) };
}
export const looksLikeSize = (label) => {
  const s = String(label ?? "").trim();
  return /^\d[\d,.]*\s*(톤|ton|t|kg|㎏|파렛|plt)?\s*$/i.test(s) || /^\d[\d,.]*\s*(톤|ton|t)\b/i.test(s);
};

// ───────────── 붙여넣기(엑셀에서 복사한 표) 읽기 ─────────────
const cellText = (v) => String(v ?? "").replace(/\r/g, "").trim();
export function splitPasted(text) {
  const rows = []; let row = [], cur = "", q = false;
  const s = String(text || "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"' && cur === "") { q = true; continue; }
    if (ch === "\t") { row.push(cur); cur = ""; continue; }
    if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
    cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ""));
}
const LABEL_HEAD = /구분|중량|톤수|차종|차량|kg|㎏|b\/l|구간|지역|도착|하차|공장|사업장|목적지|규격|파렛/i;
const isNumCell = (c) => /^-?[\d,\s.]+원?$/.test(c);
const isMoneyCell = (c) => isNumCell(c) && toNum(c) > 0;

// rows(2차원 글자) → { destOn, sizeKind, dests, sizes, cells } — 머리줄 = 맨 윗줄, 머리줄 앞 빈칸 · "구분" 칸 = 이름 칸
export function parseBidGrid(rows, opt = {}) {
  const R = (rows || []).filter((r) => r && r.some((c) => cellText(c)));
  if (R.length < 2) return null;
  // 머리줄: 글자가 2칸 이상이고 숫자만 있는 줄이 아닌 첫 줄
  let hi = R.findIndex((r) => r.filter((c) => cellText(c) && !isMoneyCell(cellText(c))).length >= 2);
  if (hi < 0) hi = 0;
  // 머리줄이 여러 줄(예: KCC / KCC실리콘 → 공장 이름)이면 단가가 시작되기 바로 위 줄을 머리줄로
  for (let i = hi + 1; i < Math.min(R.length, hi + 4); i++) {
    const r = R[i];
    const filled = r.filter((c) => cellText(c));
    if (filled.length >= 2 && filled.filter((c) => !isMoneyCell(cellText(c))).length >= filled.length - 1 && !r.slice(1).some((c) => isMoneyCell(cellText(c)))) hi = i;
    else break;
  }
  const head = R[hi].map(cellText);
  const body = R.slice(hi + 1);
  const width = Math.max(head.length, ...body.map((r) => r.length));
  // 이름 칸 수
  let labelCols = opt.labelCols ?? -1;
  if (labelCols < 0) {
    labelCols = 0;
    for (let c = 0; c < width; c++) {
      const h = cellText(head[c]);
      const bodyText = body.some((r) => { const v = cellText(r[c]); return v && !isNumCell(v) && v !== "-"; });
      if (!h || LABEL_HEAD.test(h) || (bodyText && c === labelCols)) labelCols = c + 1; else break;
    }
    if (!labelCols) labelCols = 1;
  }
  // 이름 칸 병합(위 칸 값 이어 쓰기)
  const filled = body.map((r) => r.slice());
  for (let c = 0; c < labelCols - 1; c++) for (let i = 1; i < filled.length; i++) if (!cellText(filled[i][c]) && filled.slice(i).length) filled[i][c] = filled[i - 1][c];
  const rowLabels = filled.map((r) => r.slice(0, labelCols).map(cellText).filter(Boolean).join(" "));
  const colLabels = []; for (let c = labelCols; c < width; c++) colLabels.push({ c, label: cellText(head[c]) });
  const usedCols = colLabels.filter((x) => x.label);
  // 같은 이름이 다시 나오면 앞 묶음 = 물량, 뒤 묶음 = 단가
  const seen = new Map(); let split = -1;
  usedCols.forEach((x, i) => { if (split < 0 && seen.has(x.label)) split = i; seen.set(x.label, i); });
  const volCols = split > 0 ? usedCols.slice(0, split) : [];
  const priceCols = split > 0 ? usedCols.slice(split).filter((x) => volCols.some((v) => v.label === x.label)) : usedCols;
  // 방향: 머리줄이 톤수 모양이면 열 = 규격, 행 = 도착지
  const sizeLike = priceCols.filter((x) => looksLikeSize(x.label)).length;
  const destOn = opt.destOn || (sizeLike >= Math.max(2, priceCols.length * 0.6) ? "row" : "col");
  const sizeLabels = destOn === "col" ? rowLabels : priceCols.map((x) => x.label);
  const destLabels = destOn === "col" ? priceCols.map((x) => x.label) : rowLabels;
  const kinds = sizeLabels.map((l) => parseSizeLabel(l).kind);
  const sizeKind = opt.sizeKind || (["weight", "ton", "pallet"].map((k) => [k, kinds.filter((x) => x === k).length]).sort((a, b) => b[1] - a[1])[0][0]);
  const dests = destLabels.map((label, i) => ({ key: `d${i}`, label: label.replace(/\n/g, " "), address: "", km: 0, backhaul: false }));
  const sizes = sizeLabels.map((label, i) => {
    const s = parseSizeLabel(label, sizeKind);
    return { key: `s${i}`, label: s.label, value: s.value, cargo: s.cargo, perTon: s.perTon, trailer: s.trailer };
  });
  const cells = {};
  filled.forEach((r, ri) => {
    priceCols.forEach((pc, ci) => {
      const vc = volCols.find((v) => v.label === pc.label);
      const price = money(r[pc.c]); const vol = vc ? toNum(r[vc.c]) : 0;
      const sKey = destOn === "col" ? `s${ri}` : `s${ci}`; const dKey = destOn === "col" ? `d${ci}` : `d${ri}`;
      if (price || vol) cells[`${sKey}|${dKey}`] = { prev: price, bid: price, vol };
    });
  });
  return { destOn, sizeKind, labelCols, dests, sizes, cells, hasVolume: volCols.length > 0 };
}
// 물량만 따로 붙여 넣을 때(같은 모양 표) — cells 에 vol 을 채운다
export function mergeVolumes(project, rows) {
  const g = parseBidGrid(rows, { destOn: project.destOn, sizeKind: project.sizeKind });
  if (!g) return project;
  const cells = { ...(project.cells || {}) };
  const byLabel = (list, label) => list.find((x) => x.label === label);
  Object.entries(g.cells).forEach(([k, v]) => {
    const [sk, dk] = k.split("|");
    const s = byLabel(project.sizes, g.sizes.find((x) => x.key === sk)?.label);
    const d = byLabel(project.dests, g.dests.find((x) => x.key === dk)?.label);
    if (!s || !d) return;
    const key = `${s.key}|${d.key}`;
    cells[key] = { ...(cells[key] || {}), vol: toNum(v.prev || v.vol) };
  });
  return { ...project, cells };
}

// ───────────── 실적(배차 데이터)에서 기사운임 · 청구운임 ─────────────
const clean = (s) => String(s || "").replace(/\(주\)|㈜|주식회사|\s/g, "").toLowerCase();
const tonOf = (t) => { const m = String(t || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/); if (!m) return null; const n = Number(m[1]); return /kg/i.test(t) ? n / 1000 : n; };
function trimmedMedian(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)], q3 = s[Math.floor(s.length * 0.75)], iqr = q3 - q1;
  const f = s.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  const u = f.length ? f : s;
  return u[Math.floor(u.length / 2)];
}
// 도착지 이름(또는 주소 조각) · 톤수 · 상차지(선택)로 예전 오더를 찾아 중앙값
export function historyStats(orders = [], { dest = "", origin = "", ton = null } = {}) {
  const dk = clean(dest).replace(/공장|센터|물류센터|본사|연구소|\(.*?\)/g, "");
  if (!dk || dk.length < 2) return { n: 0, cost: 0, sale: 0 };
  const ok = clean(origin).replace(/發|발|항|신항/g, "");
  const costs = [], sales = [];
  for (const r of orders) {
    const dm = clean(r.하차지명) + clean(r.하차지주소);
    if (!dm.includes(dk)) continue;
    if (ok && ok.length >= 2 && !(clean(r.상차지명) + clean(r.상차지주소)).includes(ok)) continue;
    if (ton != null) { const t = tonOf(r.차량톤수); if (t == null || Math.abs(t - ton) > Math.max(0.3, ton * 0.15)) continue; }
    const c = money(r.기사운임), s = money(r.청구운임);
    if (c) costs.push(c); if (s) sales.push(s);
  }
  return { n: costs.length, cost: trimmedMedian(costs), sale: trimmedMedian(sales), saleN: sales.length };
}

// ───────────── 원가 계산(한 칸) ─────────────
export function isBackhaulAddr(addr, p = BID_DEFAULTS) {
  const s = String(addr || "");
  return String(p.backhaulRegions || "").split(/[,\s]+/).filter(Boolean).some((k) => s.includes(k));
}
// proj: { mode: "독차"|"혼적", sizeKind, opts: { cargo, handwork, forklift(0~2), allIn, port, extraPerCase } }
// hist: historyStats 결과(선택)
export function cellCost(proj, size, dest, p = BID_DEFAULTS, hist = null) {
  const o = proj.opts || {};
  const km = Number(dest.km) || 0;
  const mix = proj.mode === "혼적";
  let ton, share = 1, how = "";
  const v = Number(size.value) || 0;
  if (proj.sizeKind === "ton") ton = v || 1;
  else if (proj.sizeKind === "pallet") ton = tonForPallet(v || 1);
  else ton = tonForKg(v || 1000);
  const label = `${size.label || ""}`;
  // 1) 독차 1대 기사운임: 실적 ↔ 거리 요율
  const tCost = tableCost(ton, km, p, label);
  let base = tCost, histW = 0;
  if (hist && hist.n > 0 && !mix) {
    histW = Math.min(p.histMax / 100, hist.n / (hist.n + 4));
    base = Math.round(hist.cost * histW + tCost * (1 - histW));
  }
  how = histW ? `실적 ${hist.n}건 ${Math.round(histW * 100)}% + 거리 요율` : km ? "거리 요율" : "거리 없음(최저운임)";
  // 2) 혼적: 기준 차량 1대 원가 × 차지 비율 + 집하 · 배송 고정비(독차보다 비싸지면 독차로)
  if (mix) {
    const refCost = tableCost(p.mixRefTon, km, p);
    const capacity = proj.sizeKind === "pallet" ? (PALLET_CAP[p.mixRefTon] || 20) : capKg(p.mixRefTon) / 1.1 * (p.mixLoad / 100);
    if (size.perTon) {
      const perTon = refCost / (capKg(p.mixRefTon) / 1.1 * (p.mixLoad / 100) / 1000);
      return finish(perTon, 0, "혼적 톤당 추가");
    }
    share = Math.max(p.mixMinShare / 100, (v || 0) / capacity);
    const mixCost = p.mixFixed + refCost * share;
    if (mixCost < tCost) { base = Math.round(mixCost); how = `혼적 ${Math.round(share * 100)}% 차지`; }
    else how = "혼적보다 독차가 싸서 독차 기준";
  } else if (size.perTon) {
    const perTon = tCost / Math.max(1, ton);
    return finish(perTon, 0, "톤당 추가");
  }
  return finish(base, 1, how);

  function finish(b, withCase, why) {
    const cargo = size.cargo || o.cargo || "일반";
    const cPct = cargo === "일반" ? 0 : (o.rulePct && size.cargo ? Number(o.rulePct) : cargoPct(cargo, p));
    const back = (dest.backhaul ? p.backhaulPct : 0);
    const allIn = o.allIn ? (p.nightPct * p.nightShare + p.holidayPct * p.holidayShare) / 100 : 0;
    const pct = cPct + back + allIn;
    const loadTon = proj.sizeKind === "weight" ? v / 1000 : proj.sizeKind === "ton" ? ton : (v || 1) * 0.5;
    const fixed = withCase ? ((o.handwork ? p.handworkCase + p.handworkPerTon * loadTon : 0)
      + (Number(o.forklift) || 0) * p.forkliftEach + (o.port ? p.portWait : 0) + (Number(o.extraPerCase) || 0)) : 0;
    const cost = Math.round(b * (1 + pct / 100) + fixed);
    return { cost, base: Math.round(b), ton, share, how: why, pct, cargo, fixed: Math.round(fixed), histW, tableCost: tCost };
  }
}

// 입찰마다 다른 목표 마진(비어 있으면 회사 기본값)
export const targetOf = (opts = {}, p = BID_DEFAULTS) => (opts.targetMargin === "" || opts.targetMargin == null || !Number.isFinite(Number(opts.targetMargin)) ? Number(p.targetMargin) : Number(opts.targetMargin));
export function tiers(cost, p = BID_DEFAULTS, opts = {}) {
  const unit = Number(p.roundUnit) || 1000;
  const target = targetOf(opts, p);
  return {
    floor: priceForMargin(cost, p.minMargin, unit),
    rec: priceForMargin(cost, target, unit),
    aggr: priceForMargin(cost, Math.min(target, p.aggressiveMargin), unit),
  };
}

// ───────────── 전체 계산 + 검사 ─────────────
// 신호: loss(원가 미만) · thin(최소 마진 미만) · low(목표의 절반 미만) · ok · high(목표 + 15%p 이상 — 수주 위험)
export function marginLevel(m, p = BID_DEFAULTS, target = p.targetMargin) {
  if (m < 0) return "loss";
  if (m < p.minMargin / 100) return "thin";
  if (m < target / 200) return "low";
  if (m > (target + 15) / 100) return "high";
  return "ok";
}
export const LEVEL_TEXT = { loss: "손해", thin: "마진 부족", low: "마진 낮음", ok: "적정", high: "높음(수주 위험)", none: "단가 없음", nokm: "거리 입력 필요" };

export function evaluateBid(proj, p = BID_DEFAULTS, histFn = null) {
  const opts = proj.opts || {};
  const target = targetOf(opts, p);
  const out = {}; const warns = [];
  const sizes = proj.sizes || [], dests = proj.dests || [];
  sizes.forEach((s) => dests.forEach((d) => {
    const key = `${s.key}|${d.key}`; const c = (proj.cells || {})[key] || {};
    const hist = histFn ? histFn(s, d) : null;
    const k = cellCost(proj, s, d, p, hist);
    const t = tiers(k.cost, p, opts);
    const bid = money(c.bid);
    const m = bid ? marginOf(bid, k.cost) : null;
    const noKm = !Number(d.km) && !(hist && hist.n);
    out[key] = { ...k, ...t, bid, prev: money(c.prev), vol: toNum(c.vol), margin: m, level: noKm ? "nokm" : bid ? marginLevel(m, p, target) : "none", hist, sale: hist?.sale || 0, noKm };
    if (noKm) return;
    if (bid && m < 0) warns.push({ key, type: "loss", text: `${d.label} · ${s.label}: 원가 ${won(k.cost)}원보다 ${won(k.cost - bid)}원 낮아요` });
    else if (bid && m < p.minMargin / 100) warns.push({ key, type: "thin", text: `${d.label} · ${s.label}: 마진 ${pct1(m)}%예요(최소 ${p.minMargin}%)` });
  }));
  // 무거운(큰) 구간이 더 싸요 — 같은 도착지 · 같은 화물 종류에서 규격 순서대로
  dests.forEach((d) => {
    const groups = {};
    sizes.filter((s) => !s.perTon).forEach((s) => { const g = s.cargo || "일반"; (groups[g] = groups[g] || []).push(s); });
    Object.values(groups).forEach((list) => {
      const sorted = [...list].sort((a, b) => a.value - b.value);
      let prev = null;
      sorted.forEach((s) => {
        const r = out[`${s.key}|${d.key}`]; if (!r?.bid) return;
        if (prev && r.bid < prev.r.bid && s.value > prev.s.value)
          warns.push({ key: `${s.key}|${d.key}`, type: "order", text: `${d.label}: ${s.label}(${won(r.bid)}원)이 ${prev.s.label}(${won(prev.r.bid)}원)보다 싸요` });
        prev = { s, r };
      });
    });
  });
  // 할증 규칙과 안 맞아요 — 같은 규격의 일반 ↔ 냉난방 · 냉장 · 냉동 · 위험물
  sizes.filter((s) => s.cargo).forEach((s) => {
    const baseRow = sizes.filter((x) => !x.cargo && x.value === s.value)[0]
      || sizes.slice(0, sizes.indexOf(s)).reverse().find((x) => !x.cargo);
    if (!baseRow) return;
    const rule = opts.rulePct ? Number(opts.rulePct) : cargoPct(s.cargo, p);
    dests.forEach((d) => {
      const a = out[`${baseRow.key}|${d.key}`]?.bid, b = out[`${s.key}|${d.key}`]?.bid;
      if (!a || !b) return;
      const expect = Math.round(a * (1 + rule / 100) / 1000) * 1000;
      if (Math.abs(b - expect) / expect > 0.03)
        warns.push({ key: `${s.key}|${d.key}`, type: "rule", text: `${d.label} · ${s.label}: ${won(a)}원 × ${rule}% 할증이면 ${won(expect)}원인데 ${won(b)}원이에요(${pct1(b / a - 1)}% 할증)` });
    });
  });
  // 거리 대비 튀어요 — 같은 규격 줄에서 (제출가 ÷ 권장가)가 다른 도착지 중앙값보다 25% 넘게 차이
  sizes.forEach((s) => {
    const ratios = dests.map((d) => { const r = out[`${s.key}|${d.key}`]; return r?.bid && d.km ? { d, v: r.bid / r.rec } : null; }).filter(Boolean);
    if (ratios.length < 3) return;
    const med = [...ratios].sort((a, b) => a.v - b.v)[Math.floor(ratios.length / 2)].v;
    ratios.forEach(({ d, v }) => {
      const dev = v / med - 1;
      if (Math.abs(dev) > 0.25) warns.push({ key: `${s.key}|${d.key}`, type: "km", text: `${d.label} · ${s.label}: 거리(${d.km}km) 대비 다른 지역보다 ${Math.round(Math.abs(dev) * 100)}% ${dev > 0 ? "비싸요" : "싸요"}` });
    });
  });
  const sum = summarize(out);
  return { cells: out, warns, sum };
}

export function summarize(cells) {
  let rev = 0, cost = 0, vol = 0, filled = 0, count = 0, skippedVol = 0; const lv = {};
  Object.values(cells).forEach((c) => {
    count++; if (c.bid) filled++;
    lv[c.level] = (lv[c.level] || 0) + 1;
    if (c.vol && c.bid && !c.noKm) { rev += c.vol * c.bid; cost += c.vol * c.cost; vol += c.vol; }
    if (c.vol && c.noKm) skippedVol += c.vol;
  });
  return { rev, cost, profit: rev - cost, margin: rev ? (rev - cost) / rev : 0, vol, filled, count, levels: lv, skippedVol };
}

// ───────────── 채우기 전략 ─────────────
// tier: floor | rec | aggr | prev / mode: all | empty / "smart" = 물량 많은 칸(상위 topPct%)은 공격가, 나머지 권장가
export function fillBids(proj, evald, tier, { onlyEmpty = false, topPct = 20 } = {}) {
  const cells = { ...(proj.cells || {}) };
  const entries = Object.entries(evald.cells);
  let topSet = new Set();
  if (tier === "smart") {
    const withVol = entries.filter(([, c]) => c.vol > 0).sort((a, b) => b[1].vol - a[1].vol);
    topSet = new Set(withVol.slice(0, Math.max(1, Math.ceil(withVol.length * topPct / 100))).map(([k]) => k));
  }
  entries.forEach(([k, c]) => {
    const cur = cells[k] || {};
    if (onlyEmpty && money(cur.bid)) return;
    const v = tier === "smart" ? (topSet.has(k) ? c.aggr : c.rec) : tier === "prev" ? c.prev : c[tier];
    if (v) cells[k] = { ...cur, bid: v };
  });
  return { ...proj, cells };
}
export function adjustBids(proj, pct, unit = 1000) {
  const cells = {};
  Object.entries(proj.cells || {}).forEach(([k, c]) => { const b = money(c.bid); cells[k] = { ...c, bid: b ? roundUp(b * (1 + pct / 100), unit) : c.bid }; });
  return { ...proj, cells };
}

// ───────────── 내보내기: 원래 양식 방향 그대로 탭 구분 글자(엑셀에 그대로 붙여 넣기) ─────────────
export function bidToTsv(proj, { withLabels = true } = {}) {
  const S = proj.sizes || [], D = proj.dests || [];
  const v = (s, d) => { const b = money(proj.cells?.[`${s.key}|${d.key}`]?.bid); return b ? String(b) : ""; };
  const lines = [];
  if (proj.destOn === "row") {
    if (withLabels) lines.push(["", ...S.map((s) => s.label)].join("\t"));
    D.forEach((d) => lines.push([...(withLabels ? [d.label] : []), ...S.map((s) => v(s, d))].join("\t")));
  } else {
    if (withLabels) lines.push(["", ...D.map((d) => d.label)].join("\t"));
    S.forEach((s) => lines.push([...(withLabels ? [s.label] : []), ...D.map((d) => v(s, d))].join("\t")));
  }
  return lines.join("\n");
}

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const pct1 = (m) => (Math.round(m * 1000) / 10).toFixed(1);
export const fmtWon = won;
export const fmtPct = pct1;
