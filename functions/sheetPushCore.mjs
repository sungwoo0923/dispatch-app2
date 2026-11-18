// ======================= functions/sheetPushCore.mjs =======================
// 🔁 2026-11-14 프로그램 → 구글시트 반영(시트 실시간 반영의 반대 방향) — 계산만 하는 부분(시트 · DB를 직접 건드리지 않는다)
//  · 프로그램에서 오더를 등록 · 수정 · 삭제하면, 그 오더가 있는(또는 들어갈) 탭의 줄에 무엇을 쓸지 정한다
//  · 원칙 ① 쓰기 전에 "쓴 뒤의 줄"을 가져오기 규칙(carrierMigrateCore)으로 다시 읽어 본다 — 프로그램 값과 똑같이 읽히는 칸만 쓴다
//         ② 수식이 든 칸(합계 · 이익 등)은 쓰지 않는다
//         ③ 시트에 쓸 수 없는 값(칸이 없거나 똑같이 읽히지 않는 값)은 오더의 _programKeys 에 적어 둔다 — 실시간 반영이 그 값을 시트 값으로 되돌리지 않는다
//  · 삭제 = 그 줄의 값만 비운다(줄은 남긴다 · 수식 칸은 그대로)
import { buildMigration, tabLayout, parseDate, parseMoney, parseTime, splitVehicle, nm, colLetter, SHEET_CORE_KEYS, DEFAULT_PRESET, pairExtras, sameSpecials, normSpecials } from "./carrierMigrateCore.mjs";

const cell = (v) => String(v ?? "").trim();
const tabOf = (src) => String(src || "").split("!")[0];
const ns = (v) => String(v ?? "").replace(/\s+/g, "");
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const uniq = (a) => [...new Set(a)];
const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);

// 시트에 쓸 수 있는 칸(탭 양식에 그 칸이 있을 때)
//  ⭐ 2026-11-17 특수운임 · 지게차비용 — 매출 · 매입 추가 칸(야상 · 대행료 …)에 가져오기 규칙의 거꾸로 쓴다(moneyPlan · JY처럼 extrasAsSpecial 회사)
export const PUSH_FIELDS = ["상차일", "하차일", "상차시간", "하차시간", "상차지명", "상차지주소", "하차지명", "하차지주소", "화물내용", "차량톤수", "차량종류", "차량번호", "이름", "전화번호", "청구운임", "기사운임", "특수운임", "지게차비용", "배차방식", "배차상태", "메모", "마감월"];
const MONEY_FIELDS = ["청구운임", "기사운임", "특수운임", "지게차비용"];

// 🗓 2026-11-16 입고시간 칸 — 시간이 있으면 시간, 없으면 날짜로 당착 · 야상 · 월착 · 익착(시트에서 읽는 규칙과 같은 말)
const dayN = (a, b) => { const A = Date.parse(`${a}T00:00:00Z`), B = Date.parse(`${b}T00:00:00Z`); return Number.isFinite(A) && Number.isFinite(B) ? Math.round((B - A) / 86400000) : null; };
const dowOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const hourOf = (t) => { const m = /^(\d{1,2}):/.exec(cell(t)); return m ? Number(m[1]) : null; };
//  ⭐ 2026-11-18 사용자 규칙 — 같은 날 상차 · 하차 = 당착, 저녁 6시 이후 상차 = 야상(입고시간 칸이 있는 탭만 · 그 탭이 다시 읽어도 같은 날짜가 되는 경우만)
//   · 날짜 칸 = 상차일인 탭: 같은 날 하차 + 18시 이후 상차 → 야상(다시 읽으면 같은 날 · 야상 꼬리표)
//   · 야상 = 다음 날 하차로 읽는 탭(yasangNext · 대원전선): 다음 날 하차 + 18시 이후 상차 → 야상
//   · 날짜 칸 = 하차일인 탭(arrival · 에이제이): 전날 18시 이후 상차 → 야상(예전 그대로)
export function arriveTag(o, arrival = false, yasangNext = false) {
  const up = cell(o?.상차일), down = cell(o?.하차일 || o?.상차일);
  const d = up && down ? dayN(up, down) : null;
  const h = hourOf(o?.상차시간);
  const evening = h != null && h >= 18;
  if (d === 0) return !arrival && !yasangNext && evening ? "야상" : "당착";
  if (d === 1 && yasangNext && !arrival && evening) return "야상";
  if (d === 1 && arrival && h != null && (h >= 18 || h < 5)) return "야상";
  if (d === 3 && dowOf(up) === 5 && dowOf(down) === 1) return "월착";
  if (d === 1) return arrival ? "야상" : "익착";
  return "";
}
// 마감월 "2026-11" → 시트 글 "26년11월"
export const closeLabel = (ym) => { const m = /^(\d{4})-(\d{2})$/.exec(cell(ym)); return m ? `${m[1].slice(2)}년${Number(m[2])}월` : ""; };
// 시트 줄에 넣을 오더 — 마감월이 없으면 그 날짜 칸의 달(해당 월)로
const withClose = (o, arrival) => (cell(o?.마감월) ? o : { ...o, 마감월: String((arrival ? o?.하차일 || o?.상차일 : o?.상차일) || "").slice(0, 7) });
// 바뀌어도 시트와 견주지 않는 칸(연동 표시 · 탭 이름에서 오는 값)
const NOT_WATCHED = new Set(["이전출처", "담당노선구분", "등록일", "_sheetKeys", "_programKeys", "_sheetBase", "importBatchId", "작성자", "등록기기", "companyName", "_id"]);
const MONEY = new Set(["청구운임", "기사운임", "수수료", "특수기사차감", "특수청구추가", "외부지급합"]);

export function sameValue(k, a, b) {
  if (MONEY.has(k) || k === "지게차비용") return (Number(a) || 0) === (Number(b) || 0);
  if (k === "특수운임") return sameSpecials(a, b); // 메모 · 자동 표시 · 순서는 견주지 않는다
  if (k === "전화번호") return digits(a) === digits(b);
  if (k === "차량번호") return ns(a) === ns(b);
  if (empty(a) && empty(b)) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
  if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
  return cell(a) === cell(b);
}

// ⭐ 2026-11-18 시트에 썼는지 확인할 때의 특수운임 비교 — 금액 · 받는사람 · 부담만 본다(종류 · 이름은 보지 않음)
//  시트의 이름 없는 추가 칸(에이제이 I · N)은 다시 읽으면 입고시간 · 비고로 "야상" · "기타" 이름이 붙는다.
//  예전엔 프로그램 이름("대기료" · 이름 없음)과 달라 "똑같이 읽히지 않는다"고 보고 추가 칸을 포기 → 운송료 칸에 합친 금액만 썼다(사용자 신고).
//  이름은 프로그램 값을 그대로 둔다(_programKeys — 시트에서 다시 가져와도 덮어쓰지 않음)
const looseSpecials = (list) => normSpecials(list).map((x) => x.split("|").slice(2).join("|")).sort();
export function pushSame(k, a, b) {
  if (k === "특수운임") return JSON.stringify(looseSpecials(a)) === JSON.stringify(looseSpecials(b));
  return sameValue(k, a, b);
}

// 이 오더가 바뀌었을 때 시트와 맞춰 봐야 하는 칸
export function watchedKeys(data = {}) {
  return uniq([...PUSH_FIELDS, ...SHEET_CORE_KEYS, ...(Array.isArray(data._sheetKeys) ? data._sheetKeys : [])]).filter((k) => !NOT_WATCHED.has(k) && !k.startsWith("__"));
}
export function changedKeys(before = {}, after = {}) {
  return uniq([...watchedKeys(before), ...watchedKeys(after)]).filter((k) => !sameValue(k, before[k], after[k]));
}

// ── 시트 한 벌(모든 탭의 값) + 설정 → 계산용 묶음 ─────────────────────────
//  tabs: [{ title, rows }] (병합 칸을 펼친 값) · formulas: { 탭이름: rows } (수식 그대로 읽은 값 — "="로 시작하면 수식 칸)
export function makePushContext(tabs, preset = {}, formulas = {}) {
  const ctx = { tabs: tabs.map((t) => ({ ...t, rows: (t.rows || []).map((r) => [...(r || [])]) })), preset: { ...DEFAULT_PRESET, ...preset }, formulas, layouts: new Map(), built: null };
  ctx.built = buildMigration(ctx.tabs, ctx.preset);
  return ctx;
}
const tabIn = (ctx, title) => ctx.tabs.find((t) => t.title === title) || null;
function layoutOf(ctx, title) {
  if (ctx.layouts.has(title)) return ctx.layouts.get(title);
  const t = tabIn(ctx, title);
  const isOrderTab = ctx.built.tabs ? ctx.built.tabs.some((x) => x.title === title && x.kind === "orders") : true;
  const L = t && isOrderTab ? tabLayout(t, ctx.preset) : null;
  ctx.layouts.set(title, L && L.cols.date !== undefined ? L : null);
  return ctx.layouts.get(title);
}
const isFormula = (ctx, title, rowNo, c) => cell(ctx.formulas?.[title]?.[rowNo - 1]?.[c]).startsWith("=");

// 오더(프로그램 문서) ↔ 시트에서 읽은 오더가 같은 줄인가 — 실시간 반영의 대조(reconcileOrders)와 같은 순서
const KEYS = [
  (x) => (x.이전출처 ? [x.이전출처, x.상차일, ns(x.상차지명), ns(x.하차지명), ns(x.차량번호)].join("|") : ""),
  (x) => [tabOf(x.이전출처), x.상차일, ns(x.상차지명), ns(x.하차지명), ns(x.차량번호)].join("|"),
  (x) => [tabOf(x.이전출처), x.상차일, ns(x.차량번호), String(Number(x.청구운임) || 0), String(Number(x.기사운임) || 0)].join("|"),
  (x) => (x.이전출처 ? `${x.이전출처}|${x.상차일}` : ""),
];
// ⭐ 2026-11-17 프로그램 값을 둔 칸(_programKeys — 시트와 일부러 다른 칸)은 시트에 적힌 값(_sheetBase)으로 줄을 찾는다
//  예전엔 프로그램 값(예: 프로그램에서 고친 차량번호)으로 찾아 시트 줄과 안 맞음 → "줄 번호 + 날짜"로만 찾게 되어,
//  줄이 밀렸을 때 엉뚱한 줄에 쓰거나 · 지울 줄을 못 찾아(시트에 이미 없음으로 보고) 지운 오더가 시트에서 다시 살아났다
const asSheet = (data) => {
  const pk = Array.isArray(data?._programKeys) ? data._programKeys : []; const sb = data?._sheetBase || {};
  if (!pk.length) return data;
  const out = { ...data }; pk.forEach((k) => { if (k in sb) out[k] = sb[k]; }); return out;
};
// 이 오더(data)가 시트에서 읽은 그 줄(rec)과 같은 줄인가 — strict: 날짜 · 구간 · 차량까지 같아야 한다(줄 번호 + 날짜만으로는 안 됨)
export function rowMatches(data, rec, { strict = false } = {}) {
  if (!data || !rec || tabOf(data.이전출처) !== tabOf(rec.이전출처)) return false;
  const d = asSheet(data);
  return (strict ? KEYS.slice(0, 2) : KEYS).some((key) => { const k = key(d); return !!k && key(rec) === k; });
}
export function findRow(ctx, data0, { taken = new Set(), strict = false } = {}) {
  const tab = tabOf(data0?.이전출처);
  if (!tab) return null;
  const data = asSheet(data0);
  const pool = ctx.built.orders.filter((o) => o.__tab === tab && !taken.has(`${o.__tab}!${o.__row}`));
  // strict(삭제): 날짜 · 구간 · 차량까지 같은 줄만 — "같은 줄 번호 + 같은 날짜"만으로 찾으면 줄이 밀렸을 때 엉뚱한 줄(새로 입력한 줄)을 지웠다
  for (const key of strict ? KEYS.slice(0, 2) : KEYS) {
    const k = key(data); if (!k) continue;
    const hit = pool.find((o) => key(o) === k);
    if (hit) return hit;
  }
  return null;
}
// 지운 오더(보류 · 실패한 삭제) ↔ 시트에서 읽은 줄 — 실시간 반영이 그 줄을 오더로 다시 만들지 않게 할 때 쓴다
export function matchesDeleted(before, rec) {
  return rowMatches(before, rec);
}

// ── 새 오더가 들어갈 탭 고르기 — 같은 거래처 · 상차지 · 하차지로 시트에 이미 있는 탭 ──────────
//  → { tab } 하나로 정해짐 · { candidates: [탭…] } 여러 개(사람이 고른다)
export function pickTab(ctx, order, pushTabs = []) {
  const allow = pushTabs.length ? new Set(pushTabs) : null;
  const pool = ctx.built.orders.filter((o) => !allow || allow.has(o.__tab));
  const count = (f) => { const m = new Map(); pool.forEach((o) => { if (f(o)) m.set(o.__tab, (m.get(o.__tab) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); };
  const c = nm(order.거래처명), f = nm(order.상차지명), t = nm(order.하차지명);
  const steps = [
    (o) => !!c && !!f && !!t && nm(o.거래처명) === c && nm(o.상차지명) === f && nm(o.하차지명) === t,
    (o) => !!c && !!f && nm(o.거래처명) === c && nm(o.상차지명) === f,
    (o) => !!c && nm(o.거래처명) === c,
  ];
  for (const s of steps) {
    const tabs = count(s);
    if (tabs.length === 1) return { tab: tabs[0] };
    if (tabs.length > 1) return { candidates: tabs };
  }
  const orderTabs = uniq(pool.map((o) => o.__tab));
  return { candidates: allow ? pushTabs.filter((x) => layoutOf(ctx, x)) : orderTabs };
}

// ── 오더의 한 칸 → 시트의 어느 칸에 무엇을 쓰나 ──────────────────────────
//  → [{ c, v, optional }] (optional: 수식 칸이면 그 칸만 건너뛴다) · null = 이 탭 양식으로는 쓸 수 없음
function sheetPlaceName(env, name) {
  const P = env.rule?.places || {};
  const keys = Object.keys(P).filter((k) => P[k][0] === name);
  if (!keys.length) return name;
  return keys.sort((a, b) => (env.fromFreq.get(b) || 0) - (env.fromFreq.get(a) || 0))[0];
}
const headerCol = (L, name) => (name ? L.header.findIndex((h) => nm(h) === nm(name)) : -1);
function fareEdits(grp, row, total) {
  if (!grp) return null;
  const n = Number(total) || 0;
  const extras = grp.extras.reduce((a, e) => { const p = parseMoney(row[e.col]); return a + (/착불/.test(p.note) ? 0 : p.n); }, 0);
  const base = n - extras;
  if (base < 0) return null;
  const out = [{ c: grp.base, v: base ? String(base) : (n === 0 && !cell(row[grp.base]) ? "" : "0") }];
  if (grp.total >= 0) out.push({ c: grp.total, v: n ? String(n) : "", optional: true });
  return out;
}
// ⭐ 2026-11-17 운임 + 특수운임 + 지게차비용을 한꺼번에 — 가져오기(carrierMigrateCore rowToOrder, extrasAsSpecial)의 거꾸로
//  · 매출 · 매입 추가 칸 짝(pairExtras)마다 금액을 정한다
//     지게차비용(부담 "청구"만) → 지게차 이름 칸(preset.forkliftExtraNames — JY "대행료") 매출 · 매입에 같은 금액
//     특수운임: 받는사람 기사 · 부담 청구 → 매출 · 매입 둘 다 / 받는사람 없음(청구만) → 매출만 / 받는사람 기사 · 부담 회사 → 매입만
//       칸 찾기 = 같은 이름 칸(머리줄 "야상" 등) → 없으면 이름 없는 칸(추가비용 — 가져올 때 입고시간 · 비고로 "야상" · "기타" 이름이 붙는다)
//  · 운송료 칸 = 청구운임 − 매출 추가 합 · 매입 운송료 = 기사운임 + 지게차비용 − 매입 추가 합(가져올 때 기사운임 = 매입 합계 − 지게차비용)
//  · 사람이 적은 글이 섞인 칸("180,000 착불" 등)은 금액이 같을 때만 그대로 두고, 다르면 쓰지 않는다(null → 운임만 예전 방식)
//  → [{ c, v, optional, side }] · null = 이 오더는 이 방식으로 못 쓴다
const n0 = (v) => { const x = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(x) ? Math.round(x) : 0; };
const SP_DEF = { 대기료: ["기사", "청구"], 수작업: ["외부", "청구"], 경유: ["기사", "청구"], 할증: ["기사", "청구"], 통행료: ["기사", "청구"], 기타: ["기사", "청구"] };
function moneyPlan(env, o) {
  const { L, preset, row } = env;
  if (!preset.extrasAsSpecial || !L.sale || !L.buy) return null;
  const pairs = pairExtras(L);
  const forkNames = (preset.forkliftExtraNames || []).map(nm);
  const generic = (n) => /^추가비용\d*$/.test(n);
  const amt = pairs.map(() => ({ sale: 0, buy: 0 }));
  const F = Math.max(0, n0(o.지게차비용));
  if (F > 0) {
    const i = pairs.findIndex((p) => forkNames.includes(nm(p.name)) && p.sale.length && p.buy.length);
    if (i < 0 || o.지게차부담 !== "청구") return null;
    amt[i].sale += F; amt[i].buy += F;
  }
  const genericName = new Map();
  for (const x of Array.isArray(o.특수운임) ? o.특수운임 : []) {
    const a = n0(x?.금액); if (!(a > 0)) continue;
    const t = SP_DEF[x.종류] ? x.종류 : "기타";
    const payee = ["기사", "외부", "없음"].includes(x.받는사람) ? x.받는사람 : SP_DEF[t][0];
    const mode = payee === "없음" ? "청구" : ["기사", "회사", "청구"].includes(x.부담) ? x.부담 : SP_DEF[t][1];
    const name = nm(x.이름);
    let i = name ? pairs.findIndex((p) => !generic(p.name) && !forkNames.includes(nm(p.name)) && nm(p.name) === name) : -1;
    if (i < 0) {
      i = pairs.findIndex((p, k) => generic(p.name) && (!genericName.has(k) || genericName.get(k) === name));
      if (i < 0) return null;
      genericName.set(i, name);
    }
    if (payee === "기사" && mode === "청구") { amt[i].sale += a; amt[i].buy += a; }
    else if (payee === "없음") amt[i].sale += a;
    else if (payee === "기사" && mode === "회사") amt[i].buy += a;
    else return null; // 외부(회사가 따로 지급) · 기사 차감은 시트 칸으로 나타낼 수 없다
    if ((amt[i].sale && !pairs[i].sale.length) || (amt[i].buy && !pairs[i].buy.length)) return null;
  }
  const out = []; let saleX = 0, buyX = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    for (const [side, cols, want] of [["sale", pairs[i].sale, amt[i].sale], ["buy", pairs[i].buy, amt[i].buy]]) {
      for (let k = 0; k < cols.length; k += 1) {
        const c = cols[k]; const v = k === 0 ? want : 0;
        const raw = cell(row[c]); const p = parseMoney(raw);
        const cur = /착불/.test(p.note) ? 0 : p.n;
        if (cur === v) continue; // 그대로(사람이 적은 글 포함)
        if ((p.note && !/^[-–—]$/.test(raw)) || p.n < 0) return null;
        out.push({ c, v: v ? String(v) : "", side });
      }
      if (side === "sale") saleX += want; else buyX += want;
    }
  }
  const sale = n0(o.청구운임), buyTotal = n0(o.기사운임) + F;
  const sb = sale - saleX, bb = buyTotal - buyX;
  if (sb < 0 || bb < 0) return null;
  // 이미 같은 금액이 적혀 있으면("270,000") 그대로 둔다 — 쓸데없이 칸 모양을 바꾸지 않게
  const put = (c, n, v, extra) => { const p = parseMoney(row[c]); if (cell(row[c]) && !p.note && p.n === n) return; out.push({ c, v, ...extra }); };
  put(L.sale.base, sb, sb ? String(sb) : (sale === 0 && !cell(row[L.sale.base]) ? "" : "0"), { side: "sale" });
  if (L.sale.total >= 0) put(L.sale.total, sale, sale ? String(sale) : "", { optional: true, side: "sale" });
  put(L.buy.base, bb, bb ? String(bb) : (buyTotal === 0 && !cell(row[L.buy.base]) ? "" : "0"), { side: "buy" });
  if (L.buy.total >= 0) put(L.buy.total, buyTotal, buyTotal ? String(buyTotal) : "", { optional: true, side: "buy" });
  return out;
}
function moneyEdits(k, o, env) {
  const { L, row } = env;
  if (env.money !== "legacy") {
    const m = moneyPlan(env, o);
    if (m) {
      // 이번에 바꾸는 칸 쪽만 쓴다 — 청구운임만 고쳤으면 매출 쪽만(매입 칸은 그대로), 특수운임 · 지게차비용이면 둘 다
      const f = new Set(env.fields || MONEY_FIELDS);
      const both = f.has("특수운임") || f.has("지게차비용");
      const want = k === "청구운임" ? ["sale"] : k === "기사운임" ? ["buy"] : ["sale", "buy"];
      const sides = new Set(want.filter((sd) => both || (sd === "sale" ? f.has("청구운임") : f.has("기사운임"))));
      return m.filter((x) => sides.has(x.side)).map(({ side, ...x }) => x);
    }
  }
  if (k === "청구운임") return fareEdits(L.sale, row, o.청구운임);
  if (k === "기사운임") return fareEdits(L.buy, row, o.기사운임);
  return null; // 특수운임 · 지게차비용은 추가 칸으로만
}
function fieldEdits(k, o, env) {
  const { L, rule, preset, tab, row } = env;
  const arrival = (preset.arrivalDateTabs || []).includes(tab);
  const col = (c) => (c === undefined || c < 0 ? null : c);
  const one = (c, v) => (col(c) == null ? null : [{ c, v: cell(v) }]);
  switch (k) {
    case "상차일": return arrival ? null : one(L.cols.date, o.상차일);
    case "하차일": return arrival ? one(L.cols.date, o.하차일) : one(L.cols.arriveDate, o.하차일);
    case "상차시간": return one(L.cols.time, o.상차시간);
    case "하차시간": { // 🗓 2026-11-16 시간이면 시간, 아니면 날짜로 당착 · 야상 · 월착(프로그램 날짜가 기준)
      const c = col(L.cols.arriveTime); if (c == null) return null; // 입고시간 칸이 있는 탭만
      const v = cell(o.하차시간) || arriveTag(o, arrival, !!rule?.yasangNextDay);
      if (!v) { const cur = cell(row[c]); return cur && !parseTime(cur) ? null : [{ c, v: "" }]; }
      return [{ c, v }];
    }
    case "마감월": { const v = closeLabel(o.마감월); return v ? one(L.cols.close, v) : null; }
    case "차량번호": return one(L.cols.plate, o.차량번호);
    case "이름": return one(L.cols.name, o.이름);
    case "전화번호": return one(L.cols.phone, o.전화번호);
    case "배차방식": { // 🟪 2026-11-16 시트 운송사 칸에 이미 업체가 적혀 있으면 덮지 않는다 — 프로그램 값이 우선(오더에 _programKeys로 남고 화면에 보라색)
      const c = col(L.cols.carrier); if (c == null) return null;
      // ⭐ 2026-11-18 기사(차량번호)를 바꾸거나 뺐으면 운송사 칸도 같이 바꾼다(비운다) — 예전 기사의 운송사가 시트에 그대로 남았다(사용자 신고)
      const driverSwap = (env.fields || []).includes("차량번호");
      return cell(row[c]) && !driverSwap ? null : [{ c, v: cell(o.배차방식) }];
    }
    case "배차상태": return one(L.cols.status, o.배차상태);
    case "청구운임":
    case "기사운임":
    case "특수운임":
    case "지게차비용": return moneyEdits(k, o, env);
    case "상차지명": {
      if (rule?.fromFixed) return null;
      const via = rule?.splitVia && Array.isArray(o.경유상차목록) ? o.경유상차목록.map((v) => cell(v?.업체명)).filter(Boolean) : [];
      return one(L.cols.from, [o.상차지명, ...via].map((n) => sheetPlaceName(env, cell(n))).filter(Boolean).join("+"));
    }
    case "상차지주소": return rule?.fromFixed ? one(L.cols.from, o.상차지주소) : null;
    case "하차지명": {
      if (rule?.toNameCol) return one(headerCol(L, rule.toNameCol), o.하차지명);
      if (col(L.cols.consignee) != null) return one(L.cols.consignee, o.하차지명);
      if (rule?.shortAddrName && cell(o.하차지주소)) return null; // 이름은 주소에서 만들어진다
      return one(L.cols.to, sheetPlaceName(env, cell(o.하차지명)));
    }
    case "하차지주소": {
      if (rule?.toAddrCol) return one(headerCol(L, rule.toAddrCol), o.하차지주소);
      if (rule?.shortAddrName && cell(o.하차지주소)) return one(L.cols.to, o.하차지주소);
      if (col(L.cols.consignee) != null && cell(o.하차지주소)) return one(L.cols.to, o.하차지주소);
      return null;
    }
    case "화물내용": {
      const txt = cell(o.화물내용);
      if (rule?.cargo) { // "700박스+24롤" → 박스 칸 700 · 롤 칸 24
        let rest = txt; const out = [];
        for (const [name, unit] of rule.cargo) {
          const c = headerCol(L, name); if (c < 0) return null;
          const m = unit ? rest.match(new RegExp(`([\\d,.]+)\\s*${unit}`)) : rest.match(/^([\d,.]+)$/);
          out.push({ c, v: m ? m[1].replace(/,/g, "") : "" });
          if (m) rest = rest.replace(m[0], "");
        }
        return rest.replace(/[+\s·]/g, "") ? null : out;
      }
      if (cell(preset.tabCargo?.[tab])) return null;
      if (L.cargo.length !== 1) return txt ? null : L.cargo.map((c) => ({ c: c.col, v: "" }));
      const h = cell(L.cargo[0].name).replace(/\s+/g, "");
      return [{ c: L.cargo[0].col, v: txt.startsWith(`${h} `) ? txt.slice(h.length + 1) : txt }];
    }
    case "차량톤수":
    case "차량종류": {
      if (rule?.tonCol) { if (k !== "차량톤수") return null; const c = headerCol(L, rule.tonCol); return c < 0 ? null : [{ c, v: cell(o.차량톤수).replace(/톤$/, "") }]; }
      const c = col(L.cols.vehicle); if (c == null) return null;
      const fixedKind = !!(preset.forceVehicleKind || rule?.vehicleKind);
      if (k === "차량종류" && fixedKind) return null;
      const kind = fixedKind ? splitVehicle(row[c]).kind : cell(o.차량종류);
      return [{ c, v: `${cell(o.차량톤수)}${kind}` }];
    }
    case "메모": {
      const c = L.memo[0]; if (c === undefined) return null;
      const cur = cell(row[c]); const others = [...L.memo.slice(1), ...L.notes].some((x) => cell(row[x]));
      const was = cell(env.derived?.메모);
      // 지금 메모가 그 칸의 글 그대로일 때만 고쳐 쓴다(가져올 때 덧붙는 말 — 경유 · 착불 · 추가비 — 이 섞인 메모는 거꾸로 풀 수 없다)
      if (others || (was && was !== cur)) return null;
      return [{ c, v: cell(o.메모) }];
    }
    default: return null;
  }
}

function envFor(ctx, title, rowNo, row, derived) {
  const L = layoutOf(ctx, title);
  if (!L) return null;
  const t = tabIn(ctx, title);
  const fromFreq = new Map();
  if (L.cols.from !== undefined) t.rows.slice(-300).forEach((r) => { const v = cell(r?.[L.cols.from]); if (v) v.split(/[+,，]/).forEach((x) => fromFreq.set(x.trim(), (fromFreq.get(x.trim()) || 0) + 1)); });
  return { L, rule: ctx.preset.tabRules?.[title] || null, preset: ctx.preset, tab: title, row, derived, fromFreq, rowNo };
}
const lastLayoutCol = (L) => Math.max(...Object.values(L.cols), ...L.cargo.map((c) => c.col), ...L.memo, ...L.notes, L.buy ? Math.max(L.buy.base, L.buy.total, ...L.buy.extras.map((e) => e.col)) : -1, L.sale ? Math.max(L.sale.base, L.sale.total) : -1);

// 줄을 바꿔 놓고 가져오기 규칙으로 다시 읽는다 → 그 줄에서 읽힌 오더(없으면 null)
function deriveWith(ctx, title, rowNo, newRow) {
  const t = tabIn(ctx, title); const i = rowNo - 1;
  while (t.rows.length <= i) t.rows.push([]);
  const old = t.rows[i];
  t.rows[i] = newRow;
  const built = buildMigration(ctx.tabs, ctx.preset);
  return { o: built.orders.find((x) => x.__tab === title && x.__row === rowNo) || null, built, undo: () => { t.rows[i] = old; } };
}
const padRow = (row, width) => { const r = [...(row || [])].map((v) => (v == null ? "" : String(v))); while (r.length < width) r.push(""); return r; };

// 여러 칸의 쓰기를 넣어 보고, 프로그램 값과 똑같이 읽히지 않는 칸은 빼고 다시 — 끝까지 남은 것만 쓴다
function fitEdits(ctx, title, rowNo, baseRow, target, fields, env) {
  const byField = new Map();
  env.fields = fields; env.money = "";
  const add = (k) => {
    const e = fieldEdits(k, target, env); if (!e) return;
    const usable = [];
    // 수식 칸: 꼭 써야 하는 칸이면 이 값은 못 옮긴다. 합계처럼 시트가 계산해 주는 칸(optional)은 쓰지는 않고, 계산될 값으로 미리 읽어만 본다(virtual)
    for (const x of e) { if (isFormula(ctx, title, rowNo, x.c)) { if (x.optional) { usable.push({ ...x, virtual: true }); continue; } return; } usable.push(x); }
    byField.set(k, usable);
  };
  fields.forEach(add);
  for (;;) {
    const row = [...baseRow];
    byField.forEach((list) => list.forEach((x) => { row[x.c] = x.v; }));
    const d = deriveWith(ctx, title, rowNo, row);
    // writeRow = 실제로 시트에 쓸 줄(수식 칸은 원래 값 그대로)
    const writeRow = [...baseRow];
    byField.forEach((list) => list.forEach((x) => { if (!x.virtual) writeRow[x.c] = x.v; }));
    if (!d.o) return { row, writeRow, d, fields: [...byField.keys()] }; // 줄 자체가 오더로 읽히지 않는다 — 부른 쪽이 되돌린다
    const bad = [...byField.keys()].filter((k) => !pushSame(k, d.o[k], target[k]) || (k === "하차시간" && (!sameValue("하차일", d.o.하차일, target.하차일) || !sameValue("상차일", d.o.상차일, target.상차일))));
    if (!bad.length) return { row, writeRow, d, fields: [...byField.keys()] };
    d.undo();
    // ⭐ 2026-11-17 운임 · 특수운임을 추가 칸까지 같이 써 봤는데 똑같이 읽히지 않으면 → 예전 방식(운송료 칸만)으로 한 번 더
    if (env.money !== "legacy" && bad.some((k) => MONEY_FIELDS.includes(k))) {
      env.money = "legacy";
      MONEY_FIELDS.forEach((k) => byField.delete(k));
      fields.filter((k) => MONEY_FIELDS.includes(k)).forEach(add);
      continue;
    }
    bad.forEach((k) => byField.delete(k));
  }
}
const cellsOf = (title, rowNo, before, after) => after.map((v, c) => ({ c, v })).filter((x) => cell(before[x.c]) !== cell(x.v)).map((x) => ({ a1: `${colLetter(x.c)}${rowNo}`, value: x.v, was: cell(before[x.c]) }));
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

// ── 수정 ─────────────────────────────────────────────────────
export function planUpdate(ctx, before, after, opts = {}) {
  const cur = findRow(ctx, before, opts);
  if (!cur) return fail("시트에서 이 오더의 줄을 찾지 못했습니다");
  if (Number(cur.이전줄수) > 1) return fail("여러 줄을 한 오더로 묶은 줄(회전)은 시트에 반영하지 않습니다");
  const title = cur.__tab, rowNo = cur.__row;
  const changed = changedKeys(before, after);
  const base = padRow(tabIn(ctx, title).rows[rowNo - 1], layoutOf(ctx, title)?.header.length || 0);
  const env = envFor(ctx, title, rowNo, base, cur);
  if (!env) return fail("이 탭의 칸 배치를 읽지 못했습니다");
  const pushKeys = changed.filter((k) => PUSH_FIELDS.includes(k));
  if ((changed.includes("상차일") || changed.includes("하차일") || changed.includes("상차시간")) && !pushKeys.includes("하차시간")) pushKeys.push("하차시간"); // 날짜가 바뀌면 입고시간(당착 · 야상 · 월착)도
  const fit = fitEdits(ctx, title, rowNo, base, after, pushKeys, env);
  if (!fit || !fit.d.o) { fit?.d.undo(); return fail("고친 값을 쓰면 시트의 그 줄을 오더로 읽을 수 없게 됩니다"); }
  ctx.built = fit.d.built;
  const o = fit.d.o;
  // 프로그램 값 그대로 두는 칸: 예전 것 중 이번에 시트와 같아진 것은 빼고, 이번에 고쳤는데 시트로는 못 옮긴 것을 더한다
  const pk = new Set(Array.isArray(before._programKeys) ? before._programKeys : []);
  const sb = { ...(before._sheetBase || {}) };
  changed.forEach((k) => { if (sameValue(k, o[k], after[k])) { pk.delete(k); delete sb[k]; } else { pk.add(k); sb[k] = o[k] ?? ""; } });
  const cells = cellsOf(title, rowNo, base, fit.writeRow);
  return { ok: true, kind: "update", tab: title, row: rowNo, cells, pushed: fit.fields.filter((k) => pushSame(k, o[k], after[k])), unpushed: changed.filter((k) => !pushSame(k, o[k], after[k])),
    // _sheetKeys: 지금 시트에서 읽히는 칸 — 프로그램에서 배차해 시트에 쓴 차량 · 기사를 나중에 시트에서 지우면 프로그램에서도 비워지게(없으면 "시트에 원래 없던 값"으로 보고 남겨 뒀다)
    docPatch: { 이전출처: `${title}!${rowNo}`, _programKeys: [...pk], _sheetBase: sb, _sheetKeys: uniq([...(Array.isArray(before._sheetKeys) ? before._sheetKeys : []), ...Object.keys(o).filter((k) => !k.startsWith("__") && !empty(o[k]))]) } };
}

// 🗓 2026-11-14 새 오더를 날짜 순서에 맞는 자리에 — 그 날짜보다 늦은 줄이 이미 있으면(예: 12일까지 있는데 11일 오더)
//  그 날짜(이하) 마지막 줄 바로 아래에 줄을 끼워 넣을 번호를 돌려준다. 가장 늦은 날짜(이후)면 0 = 지금처럼 맨 아래 빈 줄
//  날짜 칸이 하차일인 탭(arrivalDateTabs · 에이제이)은 하차일로 견준다
export function insertRowFor(ctx, order, title) {
  const arrival = (ctx.preset.arrivalDateTabs || []).includes(title);
  const dk = arrival ? "하차일" : "상차일";
  const want = String((arrival ? order.하차일 || order.상차일 : order.상차일) || "");
  if (!want) return 0;
  const rows = ctx.built.orders.filter((o) => o.__tab === title && o[dk]);
  const before = rows.filter((o) => String(o[dk]) <= want);
  if (!before.length) return 0; // 가장 이른 날짜보다도 앞 — 머리줄 근처에 끼우지 않고 맨 아래에
  const last = Math.max(...before.map((o) => o.__row + Math.max(0, (Number(o.이전줄수) || 1) - 1)));
  if (!rows.some((o) => String(o[dk]) > want && o.__row > last)) return 0; // 아래에 더 늦은 날짜 줄이 없다 → 맨 아래 빈 줄
  return last + 1;
}

// ── 등록(프로그램에서 만든 오더 → 탭 맨 아래 빈 줄 · atRow: 방금 끼워 넣은 줄) ───────────────────────────
export function planCreate(ctx, order, title, { rowCount = 0, atRow = 0, taken = new Set() } = {}) {
  const L = layoutOf(ctx, title);
  if (!L) return fail(`"${title}" 탭의 칸 배치를 읽지 못했습니다`);
  const t = tabIn(ctx, title);
  const width = L.header.length;
  let last = L.headerRow;
  t.rows.forEach((r, i) => { if (i > L.headerRow && parseDate(r?.[L.cols.date])) last = i; });
  let i = atRow ? atRow - 1 : last + 1;
  // 빈 줄 = 날짜 · 구간 · 차량 · 운임 칸에 사람이 넣은 값이 없는 줄(미리 깔아 둔 수식 · 체크박스만 있는 줄은 빈 줄로 본다)
  const keyCols = [L.cols.date, L.cols.from, L.cols.to, L.cols.consignee, L.cols.plate, L.cols.name, L.sale?.base, L.buy?.base].filter((c) => c !== undefined && c >= 0);
  // ⭐ 2026-11-17 이번 차례에 이미 쓰기로 한 줄(taken — 특히 곧 지울 줄)은 빈 줄로 보지 않는다
  //  예전엔 맨 아래 줄 오더를 지우고(값을 비운 셈) 같은 차례에 새 오더를 등록하면, 새 오더를 그 줄에 써 놓고 끝에서 그 줄을 지웠다(새 오더가 시트에서 사라짐)
  const busy = (r) => taken.has(`${title}!${i + 1}`) || keyCols.some((c) => cell(r?.[c]) && !isFormula(ctx, title, i + 1, c));
  if (atRow && busy(t.rows[i])) return fail("끼워 넣은 줄이 비어 있지 않습니다");
  while (busy(t.rows[i])) i += 1;
  const rowNo = i + 1;
  if (rowCount && rowNo > rowCount) return fail("탭에 빈 줄이 없습니다", { needRows: rowNo - rowCount });
  const base = padRow(t.rows[i], width);
  const env = envFor(ctx, title, rowNo, base, null);
  const arrival = (ctx.preset.arrivalDateTabs || []).includes(title);
  const order0 = order; order = withClose(order, arrival); // 마감월 = 해당 월(26년11월)
  const fields = PUSH_FIELDS.filter((k) => !empty(order[k]) || k === "상차일" || k === "하차시간");
  const fit = fitEdits(ctx, title, rowNo, base, order, fields, env);
  if (!fit || !fit.d.o) { fit?.d.undo(); return fail("이 탭에 줄을 만들지 못했습니다(날짜 · 구간을 시트 양식으로 옮길 수 없음)"); }
  const o = fit.d.o;
  if (!arrival && o.상차일 !== order.상차일) { fit.d.undo(); return fail("상차일을 시트에 그대로 쓸 수 없습니다"); }
  if (Number(o.이전줄수) > 1) { fit.d.undo(); return fail("같은 날 같은 구간 줄과 한 오더로 묶이는 탭입니다(회전) — 시트에 직접 입력해 주세요"); }
  ctx.built = fit.d.built;
  const keys = Object.keys(o).filter((k) => !k.startsWith("__") && !empty(o[k]));
  const pk = []; const sb = {};
  // 시트에서 읽히는 값이 프로그램 값과 다른 칸은 프로그램 값을 둔다(등록일 · 하차일 · 거래처명 등) — 탭에서 오는 값(이전출처 · 담당노선구분)만 시트를 따른다
  keys.forEach((k) => { if (k === "이전출처" || k === "담당노선구분") return; if (!sameValue(k, order[k], o[k])) { pk.push(k); sb[k] = o[k]; } });
  return { ok: true, kind: "create", tab: title, row: rowNo, cells: cellsOf(title, rowNo, base, fit.writeRow), pushed: fit.fields.filter((k) => pushSame(k, o[k], order[k])), unpushed: fields.filter((k) => !pushSame(k, o[k], order[k])),
    docPatch: { 이전출처: `${title}!${rowNo}`, 담당노선구분: title, 시트연동: true, _sheetKeys: keys, _programKeys: pk, _sheetBase: sb, ...(!cell(order0.마감월) && cell(o.마감월) === cell(order.마감월) ? { 마감월: order.마감월 } : {}) } };
}

// ── 삭제(그 줄의 값만 비운다 · 수식 칸은 그대로) ──────────────────────────
export function planDelete(ctx, before, opts = {}) {
  const cur = findRow(ctx, before, { ...opts, strict: true });
  if (!cur) return { ok: true, kind: "delete", gone: true, cells: [] }; // 시트에 이미 없다
  if (Number(cur.이전줄수) > 1) return fail("여러 줄을 한 오더로 묶은 줄(회전)은 시트에서 비우지 않습니다");
  const title = cur.__tab, rowNo = cur.__row;
  const L = layoutOf(ctx, title);
  if (!L) return fail("이 탭의 칸 배치를 읽지 못했습니다");
  const base = padRow(tabIn(ctx, title).rows[rowNo - 1], L.header.length);
  const row = [...base]; const lastCol = lastLayoutCol(L);
  for (let c = 0; c <= lastCol; c += 1) if (cell(row[c]) && !isFormula(ctx, title, rowNo, c)) row[c] = "";
  const d = deriveWith(ctx, title, rowNo, row);
  if (d.o) { d.undo(); return fail("줄을 비워도 시트에서 오더로 읽힙니다(수식 칸에 값이 남음)"); }
  ctx.built = d.built;
  return { ok: true, kind: "delete", tab: title, row: rowNo, cells: cellsOf(title, rowNo, base, row) };
}
