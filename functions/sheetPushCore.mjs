// ======================= functions/sheetPushCore.mjs =======================
// 🔁 2026-11-14 프로그램 → 구글시트 반영(시트 실시간 반영의 반대 방향) — 계산만 하는 부분(시트 · DB를 직접 건드리지 않는다)
//  · 프로그램에서 오더를 등록 · 수정 · 삭제하면, 그 오더가 있는(또는 들어갈) 탭의 줄에 무엇을 쓸지 정한다
//  · 원칙 ① 쓰기 전에 "쓴 뒤의 줄"을 가져오기 규칙(carrierMigrateCore)으로 다시 읽어 본다 — 프로그램 값과 똑같이 읽히는 칸만 쓴다
//         ② 수식이 든 칸(합계 · 이익 등)은 쓰지 않는다
//         ③ 시트에 쓸 수 없는 값(칸이 없거나 똑같이 읽히지 않는 값)은 오더의 _programKeys 에 적어 둔다 — 실시간 반영이 그 값을 시트 값으로 되돌리지 않는다
//  · 삭제 = 그 줄의 값만 비운다(줄은 남긴다 · 수식 칸은 그대로)
import { buildMigration, tabLayout, parseDate, parseMoney, parseTime, splitVehicle, nm, colLetter, SHEET_CORE_KEYS, DEFAULT_PRESET } from "./carrierMigrateCore.mjs";

const cell = (v) => String(v ?? "").trim();
const tabOf = (src) => String(src || "").split("!")[0];
const ns = (v) => String(v ?? "").replace(/\s+/g, "");
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const uniq = (a) => [...new Set(a)];
const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);

// 시트에 쓸 수 있는 칸(탭 양식에 그 칸이 있을 때)
export const PUSH_FIELDS = ["상차일", "하차일", "상차시간", "하차시간", "상차지명", "상차지주소", "하차지명", "하차지주소", "화물내용", "차량톤수", "차량종류", "차량번호", "이름", "전화번호", "청구운임", "기사운임", "배차방식", "배차상태", "메모"];
// 바뀌어도 시트와 견주지 않는 칸(연동 표시 · 탭 이름에서 오는 값)
const NOT_WATCHED = new Set(["이전출처", "담당노선구분", "등록일", "_sheetKeys", "_programKeys", "_sheetBase", "importBatchId", "작성자", "등록기기", "companyName", "_id"]);
const MONEY = new Set(["청구운임", "기사운임", "수수료", "특수기사차감", "특수청구추가", "외부지급합"]);

export function sameValue(k, a, b) {
  if (MONEY.has(k)) return (Number(a) || 0) === (Number(b) || 0);
  if (k === "전화번호") return digits(a) === digits(b);
  if (k === "차량번호") return ns(a) === ns(b);
  if (empty(a) && empty(b)) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
  if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
  return cell(a) === cell(b);
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
export function findRow(ctx, data, { taken = new Set() } = {}) {
  const tab = tabOf(data?.이전출처);
  if (!tab) return null;
  const pool = ctx.built.orders.filter((o) => o.__tab === tab && !taken.has(`${o.__tab}!${o.__row}`));
  for (const key of KEYS) {
    const k = key(data); if (!k) continue;
    const hit = pool.find((o) => key(o) === k);
    if (hit) return hit;
  }
  return null;
}
// 지운 오더(보류 · 실패한 삭제) ↔ 시트에서 읽은 줄 — 실시간 반영이 그 줄을 오더로 다시 만들지 않게 할 때 쓴다
export function matchesDeleted(before, rec) {
  if (!before || !rec || tabOf(before.이전출처) !== tabOf(rec.이전출처)) return false;
  return KEYS.some((key) => { const k = key(before); return !!k && key(rec) === k; });
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
function fieldEdits(k, o, env) {
  const { L, rule, preset, tab, row } = env;
  const arrival = (preset.arrivalDateTabs || []).includes(tab);
  const col = (c) => (c === undefined || c < 0 ? null : c);
  const one = (c, v) => (col(c) == null ? null : [{ c, v: cell(v) }]);
  switch (k) {
    case "상차일": return arrival ? null : one(L.cols.date, o.상차일);
    case "하차일": return arrival ? one(L.cols.date, o.하차일) : one(L.cols.arriveDate, o.하차일);
    case "상차시간": return one(L.cols.time, o.상차시간);
    case "하차시간": { const c = col(L.cols.arriveTime); if (c == null) return null; const cur = cell(row[c]); return cur && !parseTime(cur) ? null : [{ c, v: cell(o.하차시간) }]; } // "당착" · "야상" 같은 글자가 적힌 칸은 건드리지 않는다
    case "차량번호": return one(L.cols.plate, o.차량번호);
    case "이름": return one(L.cols.name, o.이름);
    case "전화번호": return one(L.cols.phone, o.전화번호);
    case "배차방식": return one(L.cols.carrier, o.배차방식);
    case "배차상태": return one(L.cols.status, o.배차상태);
    case "청구운임": return fareEdits(L.sale, row, o.청구운임);
    case "기사운임": return fareEdits(L.buy, row, o.기사운임);
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
  fields.forEach((k) => {
    const e = fieldEdits(k, target, env); if (!e) return;
    const usable = [];
    // 수식 칸: 꼭 써야 하는 칸이면 이 값은 못 옮긴다. 합계처럼 시트가 계산해 주는 칸(optional)은 쓰지는 않고, 계산될 값으로 미리 읽어만 본다(virtual)
    for (const x of e) { if (isFormula(ctx, title, rowNo, x.c)) { if (x.optional) { usable.push({ ...x, virtual: true }); continue; } return; } usable.push(x); }
    byField.set(k, usable);
  });
  for (;;) {
    const row = [...baseRow];
    byField.forEach((list) => list.forEach((x) => { row[x.c] = x.v; }));
    const d = deriveWith(ctx, title, rowNo, row);
    // writeRow = 실제로 시트에 쓸 줄(수식 칸은 원래 값 그대로)
    const writeRow = [...baseRow];
    byField.forEach((list) => list.forEach((x) => { if (!x.virtual) writeRow[x.c] = x.v; }));
    if (!d.o) return { row, writeRow, d, fields: [...byField.keys()] }; // 줄 자체가 오더로 읽히지 않는다 — 부른 쪽이 되돌린다
    const bad = [...byField.keys()].filter((k) => !sameValue(k, d.o[k], target[k]));
    if (!bad.length) return { row, writeRow, d, fields: [...byField.keys()] };
    d.undo();
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
  const fit = fitEdits(ctx, title, rowNo, base, after, changed.filter((k) => PUSH_FIELDS.includes(k)), env);
  if (!fit || !fit.d.o) { fit?.d.undo(); return fail("고친 값을 쓰면 시트의 그 줄을 오더로 읽을 수 없게 됩니다"); }
  ctx.built = fit.d.built;
  const o = fit.d.o;
  // 프로그램 값 그대로 두는 칸: 예전 것 중 이번에 시트와 같아진 것은 빼고, 이번에 고쳤는데 시트로는 못 옮긴 것을 더한다
  const pk = new Set(Array.isArray(before._programKeys) ? before._programKeys : []);
  const sb = { ...(before._sheetBase || {}) };
  changed.forEach((k) => { if (sameValue(k, o[k], after[k])) { pk.delete(k); delete sb[k]; } else { pk.add(k); sb[k] = o[k] ?? ""; } });
  const cells = cellsOf(title, rowNo, base, fit.writeRow);
  return { ok: true, kind: "update", tab: title, row: rowNo, cells, pushed: fit.fields.filter((k) => sameValue(k, o[k], after[k])), unpushed: changed.filter((k) => !sameValue(k, o[k], after[k])),
    // _sheetKeys: 지금 시트에서 읽히는 칸 — 프로그램에서 배차해 시트에 쓴 차량 · 기사를 나중에 시트에서 지우면 프로그램에서도 비워지게(없으면 "시트에 원래 없던 값"으로 보고 남겨 뒀다)
    docPatch: { 이전출처: `${title}!${rowNo}`, _programKeys: [...pk], _sheetBase: sb, _sheetKeys: uniq([...(Array.isArray(before._sheetKeys) ? before._sheetKeys : []), ...Object.keys(o).filter((k) => !k.startsWith("__") && !empty(o[k]))]) } };
}

// ── 등록(프로그램에서 만든 오더 → 탭 맨 아래 빈 줄) ───────────────────────────
export function planCreate(ctx, order, title, { rowCount = 0 } = {}) {
  const L = layoutOf(ctx, title);
  if (!L) return fail(`"${title}" 탭의 칸 배치를 읽지 못했습니다`);
  const t = tabIn(ctx, title);
  const width = L.header.length;
  let last = L.headerRow;
  t.rows.forEach((r, i) => { if (i > L.headerRow && parseDate(r?.[L.cols.date])) last = i; });
  let i = last + 1;
  // 빈 줄 = 날짜 · 구간 · 차량 · 운임 칸에 사람이 넣은 값이 없는 줄(미리 깔아 둔 수식 · 체크박스만 있는 줄은 빈 줄로 본다)
  const keyCols = [L.cols.date, L.cols.from, L.cols.to, L.cols.consignee, L.cols.plate, L.cols.name, L.sale?.base, L.buy?.base].filter((c) => c !== undefined && c >= 0);
  const busy = (r) => keyCols.some((c) => cell(r?.[c]) && !isFormula(ctx, title, i + 1, c));
  while (busy(t.rows[i])) i += 1;
  const rowNo = i + 1;
  if (rowCount && rowNo > rowCount) return fail("탭에 빈 줄이 없습니다", { needRows: rowNo - rowCount });
  const base = padRow(t.rows[i], width);
  const env = envFor(ctx, title, rowNo, base, null);
  const fields = PUSH_FIELDS.filter((k) => !empty(order[k]) || k === "상차일");
  const fit = fitEdits(ctx, title, rowNo, base, order, fields, env);
  const arrival = (ctx.preset.arrivalDateTabs || []).includes(title);
  if (!fit || !fit.d.o) { fit?.d.undo(); return fail("이 탭에 줄을 만들지 못했습니다(날짜 · 구간을 시트 양식으로 옮길 수 없음)"); }
  const o = fit.d.o;
  if (!arrival && o.상차일 !== order.상차일) { fit.d.undo(); return fail("상차일을 시트에 그대로 쓸 수 없습니다"); }
  if (Number(o.이전줄수) > 1) { fit.d.undo(); return fail("같은 날 같은 구간 줄과 한 오더로 묶이는 탭입니다(회전) — 시트에 직접 입력해 주세요"); }
  ctx.built = fit.d.built;
  const keys = Object.keys(o).filter((k) => !k.startsWith("__") && !empty(o[k]));
  const pk = []; const sb = {};
  // 시트에서 읽히는 값이 프로그램 값과 다른 칸은 프로그램 값을 둔다(등록일 · 하차일 · 거래처명 등) — 탭에서 오는 값(이전출처 · 담당노선구분)만 시트를 따른다
  keys.forEach((k) => { if (k === "이전출처" || k === "담당노선구분") return; if (!sameValue(k, order[k], o[k])) { pk.push(k); sb[k] = o[k]; } });
  return { ok: true, kind: "create", tab: title, row: rowNo, cells: cellsOf(title, rowNo, base, fit.writeRow), pushed: fit.fields.filter((k) => sameValue(k, o[k], order[k])), unpushed: fields.filter((k) => !sameValue(k, o[k], order[k])),
    docPatch: { 이전출처: `${title}!${rowNo}`, 담당노선구분: title, 시트연동: true, _sheetKeys: keys, _programKeys: pk, _sheetBase: sb } };
}

// ── 삭제(그 줄의 값만 비운다 · 수식 칸은 그대로) ──────────────────────────
export function planDelete(ctx, before, opts = {}) {
  const cur = findRow(ctx, before, opts);
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
