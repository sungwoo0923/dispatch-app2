// ======================= src/execAnalyticsCore.js =======================
// 📈 2026-11-08 임원 화면 · 경영 분석(손익 · 거래처 · 기사·차량 · 단가 · 현금흐름 · 영업) — 계산만 하는 순수 함수
//  · 매출·수익 기준은 일일 경영 보고(dailyReportCore)와 같다: 취소·운송사 전송 제외 오더, 청구운임 = 매출, 기사운임 = 매입, 상차일 기준
//  · 매입 구분: 소속 차량(drivers 등급 지입·직영·임대)의 차량번호면 "기사 운임", 아니면 "용차"
//  · 판관비: 수입·지출 장부(acctLedger) 지출 중 운송 원가(기사운송료·운반비·용차 등 — 오더 기사운임과 겹침)를 뺀 계정
//    장부가 없는 달은 고정비(acctRecurring 지출)로 대신 채우고 "추정"으로 표시
//  · 미수: 올해 배차완료 + 고정거래처 청구액(부가세 포함) − 수금 기록(acctPayments) · 오래된 청구부터 수금된 것으로 본다(src/arAging.js 공용)
import { receivablesOf } from "./arAging"; // ⭐ 2026-11-07 미수금 공용 계산
import { addDay, dayDiff, rangeDays, isBizDay, toWon, dateOf, isCancelledOrder, isDone, normPlate, prevYm } from "./dailyReportCore";

export const FLEET_TYPES = ["지입", "직영", "임대"];
// 운송 원가 계정(오더 기사운임과 겹치므로 판관비에서 뺀다)
export const COGS_ACCOUNTS = ["기사운송료", "운반비", "용차비", "용차료", "지입료", "운송원가", "외주운송비"];
const SIDO = { 서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종", 경기도: "경기", 강원도: "강원", 강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주" };

export const liveRows = (rows) => {
  const seen = new Set(); const out = [];
  for (const r of rows || []) {
    const d = dateOf(r); if (!d) continue;
    const k = r._id ? `${r.__col || ""}/${r._id}` : null;
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    if (r.source === "transport_transmit" || isCancelledOrder(r)) continue;
    out.push(r);
  }
  return out;
};
export const clientOf = (r) => String(r?.거래처명 || "").trim() || "미지정";
export const ymOf = (d) => String(d || "").slice(0, 7);
export const monthsBack = (endYm, n) => { const out = [endYm]; for (let i = 1; i < n; i++) out.unshift(prevYm(out[0])); return out; };
export const ymLabel = (ym) => `${Number(ym.slice(5, 7))}월`;
export const ymFull = (ym) => `${ym.slice(2, 4)}.${ym.slice(5, 7)}`;
const lastDayOf = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);

// 지역(상차·하차) — 주소가 있으면 "시도 시군구", 없으면 장소 이름 첫 단어
export function regionOf(addr, name) {
  const a = String(addr || "").trim().split(/\s+/).filter(Boolean);
  if (a.length >= 2) {
    const s = SIDO[a[0]] || a[0].replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, "");
    const g = a[1].length > 2 ? a[1].replace(/(시|군|구)$/, "") : a[1];
    return ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"].includes(s) ? `${s} ${g}` : g;
  }
  return String(name || "").trim().split(/[\s(]/)[0] || "-";
}
export const routeOf = (r) => `${regionOf(r.상차지주소, r.상차지명)}→${regionOf(r.하차지주소, r.하차지명)}`;
export const tonOf = (r) => String(r?.차량톤수 || "").trim();

// 소속 차량 표
export function fleetIndex(drivers) {
  const m = new Map();
  (drivers || []).forEach((d) => {
    const t = String(d?.등급 || "").trim(); if (!FLEET_TYPES.includes(t)) return;
    const p = normPlate(d.차량번호); if (!p) return;
    m.set(p, { plate: d.차량번호, type: t, name: String(d.이름 || d.name || "").trim(), ton: String(d.톤수 || d.차량톤수 || "").trim(), id: d.id || d._id || p });
  });
  return m;
}

// ── 1. 손익(월별) ──
export function plMonthly({ rows, fleet, ledger, recurring, months }) {
  const set = new Set(months);
  const out = Object.fromEntries(months.map((m) => [m, { m, sale: 0, own: 0, hire: 0, cnt: 0, sga: {}, sgaTotal: 0, est: false }]));
  rows.forEach((r) => {
    const m = ymOf(dateOf(r)); if (!set.has(m)) return;
    const e = out[m]; const pay = toWon(r.기사운임);
    e.sale += toWon(r.청구운임); e.cnt += 1;
    if (fleet.has(normPlate(r.차량번호))) e.own += pay; else e.hire += pay;
  });
  const hasLedger = {};
  (ledger || []).forEach((x) => {
    const m = ymOf(x.date); if (!set.has(m) || (x.type || "지출") !== "지출") return;
    const acc = String(x.account || "기타").trim() || "기타";
    if (COGS_ACCOUNTS.includes(acc)) return;
    const v = toWon(x.amount); hasLedger[m] = true;
    out[m].sga[acc] = (out[m].sga[acc] || 0) + v;
  });
  const fixed = (recurring || []).filter((x) => x.active !== false && (x.type || "지출") === "지출" && !COGS_ACCOUNTS.includes(String(x.account || "")) && !/운송료|기사/.test(String(x.name || "")));
  months.forEach((m) => {
    const e = out[m];
    if (!hasLedger[m] && fixed.length) { e.est = true; fixed.forEach((x) => { const k = String(x.account || x.name || "고정비"); e.sga[k] = (e.sga[k] || 0) + toWon(x.amount); }); }
    e.sgaTotal = Object.values(e.sga).reduce((s, v) => s + v, 0);
    e.cost = e.own + e.hire;
    e.gross = e.sale - e.cost;
    e.op = e.gross - e.sgaTotal;
    e.gm = e.sale ? (e.gross / e.sale) * 100 : 0;
    e.om = e.sale ? (e.op / e.sale) * 100 : 0;
  });
  return months.map((m) => out[m]);
}

// ── 미수(거래처별) — 남은 청구의 경과일 · 평균 미수일(금액 가중) · 30일 넘은 금액 ──
// ⭐ 2026-11-07 청구액 부가세 포함 · 고정거래처 포함(회계관리 · 일일 경영 보고 · AI 비서와 같은 계산 — functions/arCore.mjs)
export function receivables(rows, arPay, today, fixedRows = []) {
  if (!arPay) return {};
  const res = {};
  receivablesOf({ orders: rows, fixedRows, paid: arPay, today }).forEach((x) => {
    const out = x.open.reduce((s, o) => s + o.amt, 0);
    const wsum = x.open.reduce((s, o) => s + o.amt * o.age, 0);
    res[x.client] = { outstanding: x.outstanding, avgAge: out ? wsum / out : 0, over30: x.open.filter((o) => o.age > 30).reduce((s, o) => s + o.amt, 0), oldest: x.oldest, open: x.open };
  });
  return res;
}
// 거래처별 평균 입금 기간(DSO) — 미수 ÷ 최근 90일 일평균 매출 · 15~120일로 자른다
export function dsoOf(rows, rec, today) {
  const from = addDay(today, -90); const s = {};
  rows.forEach((r) => { const d = dateOf(r); if (d < from || d > today) return; const c = clientOf(r); s[c] = (s[c] || 0) + toWon(r.청구운임); });
  const out = {};
  Object.keys({ ...s, ...rec }).forEach((c) => { const daily = (s[c] || 0) / 90; const o = rec[c]?.outstanding || 0; out[c] = daily > 0 ? Math.max(15, Math.min(120, o / daily)) : 60; });
  return out;
}

// ── 2. 거래처 수익성 ──
export function clientTable(rows, from, to, prevFrom, prevTo, rec = {}) {
  const m = {};
  const add = (key, r) => { const c = clientOf(r); const e = m[c] || (m[c] = { n: c, sale: 0, profit: 0, cnt: 0, pSale: 0, pProfit: 0, pCnt: 0, routes: {}, last: "" }); const s = toWon(r.청구운임), p = s - toWon(r.기사운임); if (key === "c") { e.sale += s; e.profit += p; e.cnt += 1; const rt = routeOf(r); const x = e.routes[rt] || (e.routes[rt] = { rt, sale: 0, profit: 0, cnt: 0 }); x.sale += s; x.profit += p; x.cnt += 1; } else { e.pSale += s; e.pProfit += p; e.pCnt += 1; } if (dateOf(r) > e.last) e.last = dateOf(r); };
  rows.forEach((r) => { const d = dateOf(r); if (d >= from && d <= to) add("c", r); else if (d >= prevFrom && d <= prevTo) add("p", r); });
  return Object.values(m).filter((e) => e.cnt > 0).map((e) => {
    const ar = rec[e.n] || { outstanding: 0, avgAge: 0, over30: 0 };
    const margin = e.sale ? (e.profit / e.sale) * 100 : 0;
    const pMargin = e.pSale ? (e.pProfit / e.pSale) * 100 : null;
    const avg = e.cnt ? e.sale / e.cnt : 0; const pAvg = e.pCnt ? e.pSale / e.pCnt : 0;
    const risk = ar.over30 > 0 && (ar.avgAge > 45 || ar.over30 >= 10e6) ? "높음" : ar.over30 > 0 || ar.avgAge > 30 ? "주의" : "정상";
    return { ...e, margin, pMargin, avg, pAvg, dAvg: pAvg ? ((avg - pAvg) / pAvg) * 100 : null, dSale: e.pSale ? ((e.sale - e.pSale) / e.pSale) * 100 : null, ar, risk, routes: Object.values(e.routes).sort((a, b) => b.sale - a.sale) };
  });
}

// ── 3. 기사·차량 수익성 ──
export function vehicleTable(rows, fleet, from, to) {
  const days = rangeDays(from, to); const biz = days.filter(isBizDay).length || 1;
  const m = new Map();
  fleet.forEach((v, p) => m.set(p, { ...v, key: p, sale: 0, pay: 0, cnt: 0, days: new Set(), last: "" }));
  const lastRun = {};
  rows.forEach((r) => {
    const p = normPlate(r.차량번호); if (!p || !m.has(p)) return;
    const d = dateOf(r); if (!lastRun[p] || d > lastRun[p]) lastRun[p] = d;
    if (d < from || d > to) return;
    const e = m.get(p); e.sale += toWon(r.청구운임); e.pay += toWon(r.기사운임); e.cnt += 1; e.days.add(d);
  });
  return [...m.values()].map((e) => ({ ...e, days: e.days.size, profit: e.sale - e.pay, margin: e.sale ? ((e.sale - e.pay) / e.sale) * 100 : 0, util: Math.min(100, ([...e.days].filter(isBizDay).length / biz) * 100), last: lastRun[e.key] || "", bizDays: biz }));
}

// ── 4. 단가 변동 ──
//  노선(상차 지역→하차 지역 · 톤수)별 평균 단가 · 수익률 — 이번 기간 vs 전 기간
export function priceWatch(rows, cur, prev) {
  const r0 = {}; const c0 = {};
  const put = (m, k, key, r, extra) => { const e = m[k] || (m[k] = { k, ...extra, c: [0, 0, 0], p: [0, 0, 0] }); const s = toWon(r.청구운임); const a = e[key]; a[0] += s; a[1] += s - toWon(r.기사운임); a[2] += 1; };
  rows.forEach((r) => {
    const d = dateOf(r); const key = d >= cur[0] && d <= cur[1] ? "c" : d >= prev[0] && d <= prev[1] ? "p" : null; if (!key) return;
    const rt = routeOf(r); const ton = tonOf(r);
    put(r0, `${rt}|${ton}`, key, r, { rt, ton });
    put(c0, clientOf(r), key, r, { n: clientOf(r) });
  });
  const fin = (e) => { const avg = e.c[2] ? e.c[0] / e.c[2] : 0; const pAvg = e.p[2] ? e.p[0] / e.p[2] : 0; return { ...e, cnt: e.c[2], pCnt: e.p[2], sale: e.c[0], avg, pAvg, d: pAvg && avg ? ((avg - pAvg) / pAvg) * 100 : null, margin: e.c[0] ? (e.c[1] / e.c[0]) * 100 : 0, pMargin: e.p[0] ? (e.p[1] / e.p[0]) * 100 : null }; };
  return { routes: Object.values(r0).map(fin), clients: Object.values(c0).map(fin) };
}

// ── 5. 현금흐름 예측(주 단위) ──
//  보유 자금 + 예상 수금(남은 미수를 청구일 + 거래처 평균 입금 기간에, 이미 지났으면 앞 2주에 나눠) + 정기 수입
//  − 고정비·정기 지급(acctRecurring 매달 n일) − 카드 대금(이번 달 사용액, 다음 달 결제일에) − 운송료 지급(최근 3개월 월평균, 매달 지급일)
export function cashForecast({ today, cash, rec, dso, recurring, cardDue, cardDay = 15, driverPay = 0, driverPayDay = 10, weeks = 8, newSalesDaily = 0, newDso = 45 }) {
  const end = addDay(today, weeks * 7 - 1);
  const ev = [];
  Object.entries(rec || {}).forEach(([c, r]) => {
    const lag = Math.round(dso[c] || 60);
    const late = [];
    r.open.forEach(({ d, amt }) => { const due = addDay(d, lag); if (due <= today) late.push(amt); else if (due <= end) ev.push({ d: due, amt, kind: "in", label: `${c} 수금` }); });
    const lateSum = late.reduce((s, v) => s + v, 0);
    if (lateSum > 0) { ev.push({ d: addDay(today, 3), amt: lateSum * 0.5, kind: "in", label: `${c} 지연 미수 수금`, late: true }); ev.push({ d: addDay(today, 10), amt: lateSum * 0.3, kind: "in", label: `${c} 지연 미수 수금`, late: true }); }
  });
  // 앞으로 생길 매출의 수금(평균 입금 기간 뒤부터)
  if (newSalesDaily > 0) for (let d = addDay(today, Math.round(newDso)); d <= end; d = addDay(d, 1)) if (isBizDay(addDay(d, -Math.round(newDso)))) ev.push({ d, amt: newSalesDaily, kind: "in", label: "신규 매출 수금", soft: true });
  const monthsAhead = []; for (let d = today; d <= end; d = addDay(d, 1)) { const m = ymOf(d); if (!monthsAhead.includes(m)) monthsAhead.push(m); }
  const dayIn = (m, day) => { const last = lastDayOf(m); const dd = `${m}-${String(Math.min(Number(day) || 1, Number(last.slice(8)))).padStart(2, "0")}`; return dd; };
  (recurring || []).filter((x) => x.active !== false).forEach((x) => {
    monthsAhead.forEach((m) => { const d = dayIn(m, x.day); if (d < today || d > end) return; ev.push({ d, amt: toWon(x.amount), kind: (x.type || "지출") === "수입" ? "in" : "out", label: x.name || x.account || "고정비", payroll: /급여/.test(`${x.name || ""}${x.account || ""}`), fixed: true }); });
  });
  if (cardDue > 0) { const m = monthsAhead[1] || monthsAhead[0]; const d = dayIn(m, cardDay); if (d >= today && d <= end) ev.push({ d, amt: cardDue, kind: "out", label: "카드 대금", card: true }); }
  if (driverPay > 0) monthsAhead.forEach((m) => { const d = dayIn(m, driverPayDay); if (d >= today && d <= end) ev.push({ d, amt: driverPay, kind: "out", label: "기사 운송료 지급", driver: true }); });
  ev.sort((a, b) => a.d.localeCompare(b.d));
  // 주별
  let bal = cash; let min = { bal: cash, d: today };
  const wk = [];
  for (let w = 0; w < weeks; w++) {
    const a = addDay(today, w * 7), b = addDay(a, 6);
    const list = ev.filter((e) => e.d >= a && e.d <= b);
    const inS = list.filter((e) => e.kind === "in").reduce((s, e) => s + e.amt, 0);
    const outS = list.filter((e) => e.kind === "out").reduce((s, e) => s + e.amt, 0);
    // 주 안의 가장 낮은 잔액(날짜 순)
    let run = bal; let low = bal;
    rangeDays(a, b).forEach((d) => { list.filter((e) => e.d === d).forEach((e) => { run += e.kind === "in" ? e.amt : -e.amt; }); low = Math.min(low, run); });
    bal = run;
    if (low < min.bal) min = { bal: low, d: a };
    wk.push({ w, a, b, in: inS, out: outS, end: bal, low, list });
  }
  return { weeks: wk, events: ev, start: cash, min };
}

// ── 6. 신규 거래처 · 영업 추이 ──
export function salesTrend(rows, today, months) {
  const first = {}; const last = {}; const byM = {}; const cntAll = {};
  rows.forEach((r) => {
    const c = clientOf(r); if (c === "미지정") return; const d = dateOf(r); const m = ymOf(d);
    if (!first[c] || d < first[c]) first[c] = d; if (!last[c] || d > last[c]) last[c] = d;
    const e = byM[c] || (byM[c] = {}); e[m] = (e[m] || 0) + toWon(r.청구운임); cntAll[c] = (cntAll[c] || 0) + 1;
  });
  const span0 = months[0];
  // 데이터 시작 달은 "처음"인지 알 수 없어 신규로 세지 않는다
  const dataStart = Object.values(first).sort()[0] || today;
  const perMonth = months.map((m) => ({ m, n: Object.entries(first).filter(([, d]) => ymOf(d) === m && ymOf(d) > ymOf(dataStart)).map(([c]) => c) }));
  const fresh = Object.entries(first).filter(([, d]) => ymOf(d) >= span0 && ymOf(d) > ymOf(dataStart)).map(([c, d]) => {
    const m0 = ymOf(d); const ms = [m0]; for (let i = 1; i < 3; i++) { const x = new Date(`${ms[i - 1]}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + 1); ms.push(x.toISOString().slice(0, 7)); }
    const ramp = ms.map((m) => (m <= ymOf(today) ? byM[c][m] || 0 : null));
    const total = Object.values(byM[c]).reduce((s, v) => s + v, 0);
    return { n: c, first: d, last: last[c], ramp, total, cnt: cntAll[c], active: dayDiff(last[c], today) <= 30 };
  }).sort((a, b) => b.first.localeCompare(a.first));
  const churn = Object.keys(last).filter((c) => dayDiff(last[c], today) > 60 && cntAll[c] >= 3).map((c) => {
    const tot = Object.values(byM[c]).reduce((s, v) => s + v, 0);
    const ms = Object.keys(byM[c]).length || 1;
    return { n: c, first: first[c], last: last[c], gap: dayDiff(last[c], today), monthly: tot / ms, total: tot, cnt: cntAll[c] };
  }).sort((a, b) => b.monthly - a.monthly);
  const activeBy = months.map((m) => ({ m, n: Object.keys(byM).filter((c) => byM[c][m] > 0).length }));
  return { perMonth, fresh, churn, activeBy };
}
