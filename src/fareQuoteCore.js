// ======================= src/fareQuoteCore.js =======================
// ⭐ 2026-11-24 운임조회 › 운임 산출 — 계산만 하는 부분(화면 없음 · scripts/fareQuote.test.mjs 가 검사)
//  거래처 · 상차지 · 하차지 · 톤급 · 도착 구분(당착/야상/익착/월착) · 경유 개소 → 청구운임(매출) · 기사운임(매입) · 매출총이익
//   ① 기본 운임 = 단가표(multiRateSheets — 오더등록 "단가표 자동 입력"과 같은 고르기) → 없으면 자사 실거래 최빈값
//   ② 부대비용 = 고정노선운임(functions/routePresetCore.mjs planRoutePreset — 오더등록 자동 적용과 같은 계산)
//   ③ 합계 = applyPlanToRec(서버 · 구글시트 가져오기와 같은 계산)
import { aliasKeys, aliasKey } from "./jyAliases.js";
import { isManse, quoteManse } from "./manseRateCore.js";
import { planRoutePreset, applyPlanToRec, itemName, itemPayee, itemMode, nk, num } from "../functions/routePresetCore.mjs";

export const ARRIVALS = ["당착", "야상", "익착", "월착"];
const normRate = (s) => String(s || "").replace(/[\s()（）·]/g, "").toLowerCase();
const tonKey = (v) => normRate(v).replace(/톤$/, "");

// ── 단가표 고르기(src/DispatchApp.jsx autoRate와 같은 순서) ──────────────
//  하차지명이 맞는 줄 + 톤수 칸 → 기준지(거래처 · 상차지)가 맞는 것 > 하차지 이름이 똑같은 것
//  가장 맞는 후보들의 금액이 서로 다르면 ambiguous(직접 확인)
//  aliases(JY): 같은 곳의 다른 이름(평택초저온 = 베베숲 평택 · 에브리데이 시화 = 트레이더스 시화 · 에이제이 = 제이글로벌)도 맞는 것으로 본다
// 🗺 2026-11-26 지역 단가표(예: 롯데베르살리스 — 줄 이름이 "양산 · 김해 · 충남" 같은 지역) — 하차지명이 업체명이어도
//  하차지 주소의 시 · 도 · 시군구 이름으로 줄을 찾는다. 기준지(거래처 · 상차지)가 맞는 단가표에서만 · 이름으로 찾은 줄이 있으면 그쪽이 먼저
const PROV_SHORT = { 서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산",
  세종특별자치시: "세종", 경기도: "경기", 강원도: "강원", 강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북",
  전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주", 제주도: "제주" };
export function regionTokens(addr = "") {
  return String(addr || "").replace(/\(.*?\)|（.*?）/g, " ").split(/[\s,]+/).filter(Boolean).slice(0, 3)
    .map((t) => { if (PROV_SHORT[t]) return PROV_SHORT[t]; const c = t.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/, ""); return c.length >= 2 ? c : t; }) // "대구" · "중구"는 자르지 않음
    .map(normRate).filter((t) => t.length >= 2);
}
// 📏 2026-11-26 단가표에 없는 톤수는 "바로 위 톤수" 칸으로(JY 롯데베르살리스 10월 이후 172건 전부 이 규칙 — 6 · 7톤 → 8톤, 12~14톤 → 15톤, 20~24톤 → 25톤)
const tonNumK = (k) => { const m = /^(\d+(?:\.\d+)?)/.exec(String(k || "")); return m ? parseFloat(m[1]) : NaN; };
function colFor(sheet, ton, up) {
  const cols = sheet.columns || [];
  const exact = cols.find((c) => tonKey(c.label) === ton);
  if (exact || !up) return exact ? { col: exact, up: false } : null;
  const want = tonNumK(ton);
  if (!Number.isFinite(want)) return null;
  const higher = cols.map((c) => ({ c, n: tonNumK(tonKey(c.label)) })).filter((x) => Number.isFinite(x.n) && x.n > want).sort((a, b) => a.n - b.n);
  return higher.length ? { col: higher[0].c, up: true } : null;
}
export function findRate(sheets = [], q = {}, { aliases = false } = {}) {
  const ton = tonKey(q.톤수);
  const drop = normRate(q.하차지명);
  if (!ton || !drop) return null;
  const bases = [q.거래처명, q.상차지명].map(normRate).filter(Boolean);
  const dropA = aliases ? aliasKeys(q.하차지명) : [];
  const baseA = aliases ? [q.거래처명, q.상차지명].flatMap(aliasKeys) : [];
  const cands = [];
  (sheets || []).forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      const rName = normRate(row.name);
      // 낱말 순서만 다른 이름도 같은 곳("용인 네이버" = "네이버용인") — 오더등록 단가표 자동 입력과 같은 규칙(JY)
      const words = String(q.하차지명 || "").trim().split(/\s+/).map(normRate).filter(Boolean);
      const wordHit = aliases && words.length > 1 && rName.length === drop.length && words.every((w) => rName.includes(w));
      const aliasHit = aliases && (dropA.includes(aliasKey(row.name)) || wordHit);
      if (!rName || !(rName.includes(drop) || drop.includes(rName) || aliasHit)) return;
      const cf = colFor(sheet, ton, aliases); const col = cf?.col;
      const sale = col ? num(row.prices?.[col.id]) : 0;
      if (!sale) return;
      const buy = num(row.buyPrices?.[col.id]);
      const bn = normRate(sheet.baseName);
      const baseHit = !!bn && (bases.some((x) => x.includes(bn) || bn.includes(x)) || (aliases && baseA.includes(aliasKey(sheet.baseName))));
      cands.push({ sale, buy, baseHit, exact: rName === drop || aliasHit, tonUp: !!cf?.up, sheetName: String(sheet.baseName || "").trim(), rowName: String(row.name || "").trim(), ton: col.label });
    });
  });
  // 🗺 지역으로 찾기(JY · 기준지가 맞는 단가표만) — 주소의 더 작은 단위(시군구)가 맞는 줄이 먼저(경남 양산시 → "양산" > "경남")
  const regs = aliases ? regionTokens(q.하차지주소) : [];
  if (regs.length) {
    (sheets || []).forEach((sheet) => {
      const bn = normRate(sheet.baseName);
      const baseHit = !!bn && (bases.some((x) => x.includes(bn) || bn.includes(x)) || baseA.includes(aliasKey(sheet.baseName)));
      if (!baseHit) return;
      const cf = colFor(sheet, ton, true); const col = cf?.col;
      if (!col) return;
      (sheet.rows || []).forEach((row) => {
        const lvl = regs.indexOf(normRate(row.name));
        if (lvl < 0) return;
        const sale = num(row.prices?.[col.id]);
        if (!sale) return;
        if (cands.some((c) => c.baseHit && c.sheetName === String(sheet.baseName || "").trim() && c.rowName === String(row.name || "").trim())) return; // 이름으로 이미 찾은 줄
        cands.push({ sale, buy: num(row.buyPrices?.[col.id]), baseHit: true, exact: false, region: true, lvl, tonUp: !!cf.up, sheetName: String(sheet.baseName || "").trim(), rowName: String(row.name || "").trim(), ton: col.label });
      });
    });
  }
  if (!cands.length) return null;
  // 기준지 맞음 > 이름으로 찾음 > 이름이 똑같음 > (지역이면) 더 작은 단위
  const rank = (c) => (c.baseHit ? 16 : 0) + (c.tonUp ? 0 : 8) + (c.region ? 0 : 4) + (c.exact ? 2 : 0) + (c.region ? Math.min(c.lvl, 2) * 0.5 : 0);
  const top = Math.max(...cands.map(rank));
  const best = cands.filter((c) => rank(c) === top);
  if (new Set(best.map((c) => `${c.sale}/${c.buy}`)).size > 1) return { ambiguous: true, cands: best };
  return best[0];
}
// 단가표에 있는 톤급(칸 이름) — 화면 칩
export function rateTons(sheets = []) {
  const s = new Set();
  (sheets || []).forEach((sh) => (sh.columns || []).forEach((c) => { const l = String(c.label || "").trim(); if (/\d/.test(l)) s.add(l); }));
  return [...s].sort((a, b) => parseFloat(a) - parseFloat(b));
}

// ── 자사 실거래(같은 상차지 · 하차지 · 톤급) ─────────────────────────
const CANCEL = /취소/;
const tonOf = (o) => tonKey(o?.차량톤수) || (/^\d+(\.\d+)?\s*톤/.test(String(o?.차량종류 || "").trim()) ? tonKey(o.차량종류) : "");
const mode = (arr) => { const m = new Map(); arr.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0; };
// 🔧 2026-11-24 이름은 넉넉하게 맞춘다(오더등록 [운임조회]처럼) — 띄어쓰기 · 기호 무시 + 한쪽이 다른 쪽을 포함(2글자 이상)
//  상차지를 비우면 거래처(또는 거래처 = 상차지인 기록)로 찾는다 · 같은 톤급 기록이 없으면 톤급을 풀고 찾는다(tonRelaxed)
const nameHit = (a, b) => { const x = nk(a), y = nk(b); if (!x || !y) return false; return x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x))); };
const tonNum = (v) => { const m = /(\d+(?:\.\d+)?)/.exec(String(v || "")); return m ? Number(m[1]) : null; };
export function historyStats(orders = [], q = {}, { today = "" } = {}) {
  const t = nk(q.하차지명), c = nk(q.거래처명), f = nk(q.상차지명);
  if (!t || (!f && !c)) return null;
  const tq = tonNum(q.톤수);
  const base = (orders || []).filter((o) => o && nameHit(o.하차지명, q.하차지명)
    && (f ? nameHit(o.상차지명, q.상차지명) : (nameHit(o.거래처명, q.거래처명) || nameHit(o.상차지명, q.거래처명)))
    && !CANCEL.test(String(o.배차상태 || "")) && !CANCEL.test(String(o.상태 || "")) && num(o.청구운임) > 0
    && (!today || String(o.상차일 || "").slice(0, 10) < today));
  const sameTon = tq == null ? base : base.filter((o) => { const n = tonNum(o.차량톤수) ?? tonNum(o.차량종류); return n != null && Math.abs(n - tq) < 0.01; });
  const tonRelaxed = tq != null && !sameTon.length && base.length > 0;
  const rows = tonRelaxed ? base : sameTon;
  // 같은 거래처 기록이 있으면 그것만 · 이름이 똑같은 기록이 있으면 그것 먼저
  const mine = c ? rows.filter((o) => nk(o.거래처명) === c) : [];
  const pool = mine.length ? mine : rows;
  const exact = pool.filter((o) => nk(o.하차지명) === t && (!f || nk(o.상차지명) === f));
  const list = (exact.length ? exact : pool).sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")));
  if (!list.length) return { count: 0, recent: [] };
  // 부대비용을 뺀 기본 운임(특수운임으로 더해진 금액 · 지게차 청구분을 되돌린다)
  const baseSale = (o) => num(o.청구운임) - num(o.특수청구추가) - num(o.지게차청구추가);
  const baseBuy = (o) => num(o.기사운임) + num(o.특수기사차감) + num(o.지게차기사차감);
  const sales = list.map(baseSale).filter((v) => v > 0);
  const buys = list.map(baseBuy).filter((v) => v > 0);
  const stat = (a) => (a.length ? { avg: Math.round(a.reduce((s, v) => s + v, 0) / a.length), min: Math.min(...a), max: Math.max(...a), mode: mode(a) } : null);
  const sb = stat(buys);
  let bins = [];
  if (sb && buys.length > 1 && sb.max > sb.min) {
    const N = 9; const w = (sb.max - sb.min) / N;
    bins = Array.from({ length: N }, (_, i) => ({ from: sb.min + w * i, to: sb.min + w * (i + 1), n: 0 }));
    buys.forEach((v) => { const i = Math.min(N - 1, Math.floor((v - sb.min) / w)); bins[i].n += 1; });
  }
  const sd = sb && buys.length > 1 ? Math.sqrt(buys.reduce((s, v) => s + (v - sb.avg) ** 2, 0) / buys.length) : 0;
  return {
    count: list.length, sameClient: mine.length > 0, tonRelaxed, fuzzy: !exact.length, sale: stat(sales), buy: sb, bins, spread: sb && sb.avg ? Math.round((sd / sb.avg) * 100) : 0,
    recent: list.slice(0, 3).map((o) => ({ date: String(o.상차일 || "").slice(5, 10).replace("-", "/"), way: String(o.배차방식 || "").trim(), car: String(o.차량번호 || "").trim(), sale: num(o.청구운임), buy: num(o.기사운임) })),
  };
}

// ── 도착 구분 → 계산용 날짜 · 시간(오늘 기준) ─────────────────────────
const addDays = (ymd, d) => { const x = new Date(`${ymd}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
export function arrivalDates(arrival, today) {
  const t = today || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  if (arrival === "야상") return { 상차일: t, 하차일: addDays(t, 1), 상차시간: "20:00" };
  if (arrival === "익착") return { 상차일: t, 하차일: addDays(t, 1), 상차시간: "" };
  if (arrival === "월착") { const dow = new Date(`${t}T00:00:00Z`).getUTCDay(); const fri = addDays(t, (5 - dow + 7) % 7); return { 상차일: fri, 하차일: addDays(fri, 3), 상차시간: "" }; }
  return { 상차일: t, 하차일: t, 상차시간: "" };
}

// ── 운임 산출 ─────────────────────────────────────────────
//  q = { 거래처명, 상차지명, 하차지명, 톤수, 도착, 경유 }
//  → { base: { sale, buy, src: "rate"|"history"|"none", label }, lines: [{ key, name, tag, why, sale, pay, payTo }], total: { sale, driver, external, pay, profit, margin } }
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
//  manse(JY · learnManse 결과): 거래처가 만세보령이면 지역 × 수량(포) 단가표로 기본 운임 · 비고 추가요금을 정한다(q.수량 · q.반품 · q.경유원거리)
export function quoteFare({ q = {}, sheets = [], presets = [], hist = null, today = "", aliases = false, manse = null } = {}) {
  const mq = manse && isManse(q) ? quoteManse({ ...q, 경유: Number(q.경유) || 0 }, manse) : null;
  const rate = mq ? null : findRate(sheets, q, { aliases });
  let base = { sale: 0, buy: 0, src: "none", label: "" };
  if (mq) base = { sale: mq.sale, buy: mq.buy, src: "manse", label: mq.lines[0].why, buySrc: mq.buySrc === "기록" ? "history" : mq.buySrc ? "margin" : "none" };
  else if (rate && !rate.ambiguous) base = { sale: rate.sale, buy: rate.buy || (hist?.buy?.mode || 0), src: "rate", label: `${rate.sheetName ? `${rate.sheetName} 단가표` : "단가표"} · ${rate.ton} 기준`, buySrc: rate.buy ? "rate" : hist?.buy ? "history" : "none" };
  else if (hist?.sale) base = { sale: hist.sale.mode, buy: hist.buy?.mode || 0, src: "history", label: `자사 실거래 ${hist.count}건 최빈값`, buySrc: hist.buy ? "history" : "none" };
  const stops = Math.max(0, Math.min(9, Number(q.경유) || 0));
  const order = {
    거래처명: q.거래처명 || "", 상차지명: q.상차지명 || q.거래처명 || "", 하차지명: q.하차지명 || "", ...arrivalDates(q.도착, today), // 상차지를 비우면 거래처 = 상차지
    경유하차목록: Array.from({ length: stops }, (_, i) => ({ 업체명: `경유${i + 1}` })), 청구운임: String(base.sale), 기사운임: String(base.buy),
  };
  const plan = planRoutePreset(order, presets);
  const rec = plan ? applyPlanToRec(order, plan) : { ...order, 외부지급합: 0 };
  const lines = [];
  if (mq) mq.lines.forEach((l, i) => lines.push({ ...l, why: i === 0 ? `${l.why}${mq.buySrc === "기록" ? " · 기사운임 시트 기록 최빈값" : mq.buySrc === "마진" ? " · 기사운임 = 청구 − 지역 마진(시트 기록)" : ""}` : l.why, pay: i === 0 ? Math.max(0, mq.buy - mq.lines.filter((x) => x.key !== "base").reduce((t, x) => t + x.pay, 0)) : l.pay, payTo: "기사" }));
  else if (base.sale || base.buy) lines.push({ key: "base", name: "기본 운임", tag: base.src === "rate" ? "단가표" : "실거래", why: base.label + (base.src === "rate" && base.buySrc === "history" ? " · 매입은 실거래 최빈값" : ""), sale: base.sale, pay: base.buy, payTo: "기사" });
  if (plan?.fork && num(plan.fork.지게차비용) > 0) {
    const F = num(plan.fork.지게차비용); const m = plan.fork.지게차부담;
    lines.push({ key: "fork", name: "지게차 대행료", tag: "노선 규칙", why: m === "청구" ? "청구액 동일 지급 · 지게차 기사 정산" : m === "기사" ? "기사운임에서 차감 · 지게차 기사 정산" : "회사 부담 · 지게차 기사 정산", sale: m === "청구" ? F : 0, pay: F, payTo: "외부", driverDelta: m === "기사" ? -F : 0 });
  }
  (plan?.items || []).filter((x) => num(x.금액) > 0).forEach((it, i) => {
    const a = num(it.금액); const payee = itemPayee(it); const md = itemMode(it);
    const sale = md === "청구" ? a : 0;
    const pay = payee === "없음" ? 0 : a;
    const why = payee === "없음" ? `${condWhy(it)}${md === "기사" ? "기사운임에서 차감" : "청구 단독 적용"}` : payee === "기사" ? `${condWhy(it)}${md === "청구" ? "청구 · 기사 동일 지급" : "회사 부담 · 기사 지급"}` : `${condWhy(it)}${md === "청구" ? "청구액 동일 외부 지급" : md === "기사" ? "기사운임에서 차감 · 외부 지급" : "회사 부담 · 외부 지급"}`;
    lines.push({ key: `sp${i}`, name: itemName(it), tag: "노선 규칙", why: it.메모 && /경유 \d+곳/.test(it.메모) ? `${it.메모} · ${why}` : why, sale, pay, payTo: payee, driverDelta: (payee === "외부" || payee === "없음") && md === "기사" ? -a : 0 });
  });
  const sale = num(rec.청구운임), driver = num(rec.기사운임), external = num(rec.외부지급합);
  const profit = sale - driver - external;
  return { rate, manse: mq, base, lines, plan, stops, order: rec, total: { sale, driver, external, pay: driver + external, profit, margin: sale ? Math.round((profit / sale) * 1000) / 10 : 0 } };
}
function condWhy(it) {
  const c = it.조건;
  return c === "야간" ? "야간 상차 할증 · " : c === "익착" ? "익착 조건 · " : c === "월착" ? "월착 조건 · " : "";
}

// 견적서 문구(복사)
export function quoteText(q, r) {
  const L = [`[운임 견적] ${q.거래처명 ? `${q.거래처명} · ` : ""}${q.상차지명} → ${q.하차지명}`, `차종 ${q.톤수 || "-"} · ${q.도착 || "당착"}${r.stops ? ` · 경유 ${r.stops}곳` : ""}`];
  r.lines.forEach((l) => { if (l.sale) L.push(`· ${l.name} ${won(l.sale)}원`); });
  L.push(`청구운임 합계 ${won(r.total.sale)}원 (VAT 별도)`);
  return L.join("\n");
}
