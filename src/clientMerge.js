// ======================= src/clientMerge.js =======================
// ⭐ 2026-11-17 거래처 합치기(순수 함수) — 같은 회사가 이름 둘로 등록됐을 때(예: "큐런" · "큐런네트웍스 주식회사") 하나로
//  화면은 src/ClientMergeModal.jsx(거래처관리 › 기본거래처 › [거래처 합치기]) · 테스트 scripts/clientMerge.test.mjs
//  · 남길 거래처(target)에 합칠 거래처(sources)의 빈 칸을 채우고, 옛 이름은 aliases(다른 이름)로 남긴다
//  · aliases 는 앞으로 옛 이름으로 들어오는 오더(오더 등록 · 시트 가져오기)를 남길 이름으로 바꿔 준다(resolveClientAlias)
//  · 최종마감(경리 확인)된 달의 오더 · 명세서 기록은 기본으로 건드리지 않는다(planOrders · planArDesk)
import { isFinalLocked } from "./closeFlow.js";
import { monthOf } from "./settleCore.js";

export const normName = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
const isEmpty = (v) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const clientName = (c) => String(c?.거래처명 || "").trim();

// 채우지 않는 칸 — 문서 정보 · 이름 · 합치기 기록 · 따로 합치는 칸(담당자 목록 · 메모)
const SKIP_FIELDS = new Set(["id", "_id", "거래처명", "companyName", "createdAt", "updatedAt", "aliases", "mergedFrom", "mergedAt",
  "contacts", "메모", "importBatchId", "_dragOver", "_rawContacts"]);

// Firestore 값(Timestamp 등)을 배열에 넣을 수 있는 평범한 값으로 — 합친 거래처의 원래 내용을 남길 때
export function plainValue(v, depth = 0) {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object") return typeof v === "function" ? undefined : v;
  if (typeof v.toMillis === "function") { try { return v.toMillis(); } catch { return null; } }
  if (v instanceof Date) return v.getTime();
  if (depth > 4) return null;
  if (Array.isArray(v)) return v.map((x) => plainValue(x, depth + 1)).filter((x) => x !== undefined && !Array.isArray(x));
  if (Object.getPrototypeOf(v) !== Object.prototype) return null; // serverTimestamp 같은 특수 값
  const out = {};
  Object.entries(v).forEach(([k, x]) => { const p = plainValue(x, depth + 1); if (p !== undefined) out[k] = p; });
  return out;
}

const contactKey = (c) => `${normName(c?.name)}|${String(c?.phone || "").replace(/\D/g, "")}`;

// 담당자 목록 합치기 — 이름 + 전화번호가 같으면 한 번만. 남길 거래처의 대표 담당자는 그대로
export function mergeContacts(target, sources) {
  const base = Array.isArray(target?.contacts) ? target.contacts.filter((c) => c && (c.name || c.phone)) : [];
  // 예전 문서는 contacts 없이 담당자 · 연락처 칸만 있다
  const flat = (c) => (Array.isArray(c?.contacts) && c.contacts.length ? c.contacts : (c?.담당자 || c?.연락처) ? [{ name: c.담당자 || "", phone: c.연락처 || "" }] : []);
  const out = base.length ? [...base] : flat(target).map((c, i) => ({ ...c, ...(i === 0 ? { isPrimary: true } : {}) }));
  const seen = new Set(out.map(contactKey));
  (sources || []).forEach((s) => flat(s).forEach((c) => {
    if (!c || !(c.name || c.phone)) return;
    const k = contactKey(c);
    if (seen.has(k)) return;
    seen.add(k);
    const { isPrimary, ...rest } = c; void isPrimary;
    out.push(rest);
  }));
  if (out.length && !out.some((c) => c.isPrimary)) out[0] = { ...out[0], isPrimary: true };
  return out;
}

// 메모 합치기 — 같은 글은 한 번만, 합친 거래처 메모 앞에 [옛 이름] 표시
export function mergeMemo(target, sources) {
  const lines = [];
  const seen = new Set();
  const add = (txt, tag = "") => {
    const t = String(txt || "").trim();
    if (!t || seen.has(normName(t))) return;
    seen.add(normName(t));
    lines.push(tag ? `[${tag}] ${t}` : t);
  };
  add(target?.메모);
  (sources || []).forEach((s) => add(s?.메모, clientName(s)));
  return lines.join("\n");
}

// 남길 거래처 문서에 덮어쓸 내용
//  mode: "fill"(빈 칸을 합칠 거래처 값으로 채움 · 담당자 · 메모 합침) | "keep"(남길 거래처 정보 그대로 — 다른 이름만 남김)
//  → { patch, filled: [채운 칸 이름] }
export function buildMergePatch(target, sources, { mode = "fill", by = "", at = Date.now() } = {}) {
  const tName = clientName(target);
  const srcs = (sources || []).filter((s) => s && normName(clientName(s)) !== normName(tName));
  const patch = {};
  const filled = [];
  if (mode === "fill") {
    srcs.forEach((s) => Object.entries(s).forEach(([k, v]) => {
      if (SKIP_FIELDS.has(k) || k.startsWith("_") || isEmpty(v)) return;
      if (!isEmpty(target?.[k]) || k in patch) return;
      const p = plainValue(v);
      if (p === undefined || p === null) return;
      patch[k] = p;
      filled.push(k);
    }));
    const contacts = mergeContacts(target, srcs);
    const before = Array.isArray(target?.contacts) ? target.contacts.length : (target?.담당자 || target?.연락처 ? 1 : 0);
    if (contacts.length > before) {
      patch.contacts = contacts;
      const primary = contacts.find((c) => c.isPrimary) || contacts[0];
      if (isEmpty(target?.담당자) && primary?.name) patch.담당자 = primary.name;
      if (isEmpty(target?.연락처) && primary?.phone) patch.연락처 = primary.phone;
      filled.push("담당자 목록");
    }
    const memo = mergeMemo(target, srcs);
    if (memo !== String(target?.메모 || "").trim() && memo) { patch.메모 = memo; filled.push("메모"); }
  }
  // 다른 이름(옛 이름) — 합친 거래처 이름 + 그 거래처가 갖고 있던 다른 이름. 남길 이름 자신은 빼고, 같은 이름은 한 번만
  const aliases = [];
  const seen = new Set([normName(tName)]);
  [...(target?.aliases || []), ...srcs.flatMap((s) => [clientName(s), ...(s.aliases || [])])].forEach((a) => {
    const t = String(a || "").trim();
    if (!t || seen.has(normName(t))) return;
    seen.add(normName(t));
    aliases.push(t);
  });
  patch.aliases = aliases;
  patch.mergedFrom = [
    ...(Array.isArray(target?.mergedFrom) ? target.mergedFrom : []),
    ...srcs.map((s) => ({ name: clientName(s), id: String(s.id || ""), at, by, data: plainValue(Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("_")))) })),
  ].slice(-20);
  return { patch, filled: [...new Set(filled)] };
}

// ── 다른 이름(alias) → 남길 이름 ─────────────────────────────────
//  clients: 거래처 문서 목록 → Map(정규화한 옛 이름 → 남길 거래처명)
//  지금 살아 있는 거래처 이름과 같은 alias 는 쓰지 않는다(그 이름의 거래처가 다시 등록됐으면 그쪽이 우선)
export function buildAliasMap(clients) {
  const live = new Set((clients || []).map((c) => normName(clientName(c))).filter(Boolean));
  const m = new Map();
  (clients || []).forEach((c) => {
    const to = clientName(c);
    if (!to || !Array.isArray(c?.aliases)) return;
    c.aliases.forEach((a) => { const k = normName(a); if (k && !live.has(k) && !m.has(k)) m.set(k, to); });
  });
  return m;
}
// name 이 옛 이름이면 남길 이름, 아니면 그대로. aliasMapOrClients: buildAliasMap 결과 또는 거래처 목록
export function resolveClientAlias(name, aliasMapOrClients) {
  const raw = String(name ?? "");
  const k = normName(raw);
  if (!k) return raw;
  const m = aliasMapOrClients instanceof Map ? aliasMapOrClients : buildAliasMap(aliasMapOrClients);
  return m.get(k) || raw;
}
// 오더 한 건 — 거래처명이 옛 이름이면 바꾼 새 객체, 아니면 같은 객체
export function resolveOrderClient(order, aliasMapOrClients) {
  if (!order || typeof order !== "object") return order;
  const cur = order.거래처명;
  if (typeof cur !== "string" || !cur.trim()) return order;
  const to = resolveClientAlias(cur, aliasMapOrClients);
  return to === cur ? order : { ...order, 거래처명: to };
}

// ── 잠긴 달(최종마감) ─────────────────────────────────────────
//  closeDocs: arDesk kind "close" 문서들 → Set("거래처|YYYY-MM") 최종마감(경리 확인 · 일시해제 아님)
export function lockedSet(closeDocs) {
  const s = new Set();
  (closeDocs || []).forEach((d) => { if (d && d.kind === "close" && isFinalLocked(d)) s.add(`${String(d.client || "").trim()}|${String(d.yyyymm || "").slice(0, 7)}`); });
  return s;
}
// 이 달을 건드리면 안 되나 — 합칠 거래처나 남길 거래처 둘 중 하나라도 그 달이 최종마감이면
export const isLockedYm = (locks, source, target, ym) => !!ym && (locks.has(`${source}|${ym}`) || locks.has(`${target}|${ym}`));

// 오더 나누기 — orders: [{ id, 거래처명, 상차일, 마감월, ... }] (이미 합칠 거래처 이름으로 찾은 것)
//  → { update: [오더], locked: [오더], bySource: { 이름: { total, update, locked, lockedYms: [] } } }
export function planOrders(orders, { sources = [], target = "", locks = new Set(), includeLocked = false } = {}) {
  const srcSet = new Map(sources.map((s) => [normName(s), String(s).trim()]));
  const out = { update: [], locked: [], bySource: {} };
  sources.forEach((s) => { out.bySource[String(s).trim()] = { total: 0, update: 0, locked: 0, lockedYms: [] }; });
  (orders || []).forEach((o) => {
    const src = srcSet.get(normName(o?.거래처명));
    if (!src || normName(src) === normName(target)) return;
    const b = out.bySource[src];
    b.total += 1;
    const ym = monthOf(o);
    if (!includeLocked && isLockedYm(locks, src, target, ym)) {
      b.locked += 1;
      if (!b.lockedYms.includes(ym)) b.lockedYms.push(ym);
      out.locked.push(o);
      return;
    }
    b.update += 1;
    out.update.push(o);
  });
  Object.values(out.bySource).forEach((b) => b.lockedYms.sort());
  return out;
}

// ── 정산 기록(arDesk) 옮기기 ─────────────────────────────────
//  kind 별로 "한 거래처에 하나"인 기준 — 같은 기준의 기록이 남길 거래처에 이미 있으면 겹침(옮기지 않음)
const AR_KINDS = {
  stmt: (d) => [d.biz || "", d.yyyymm],
  stmtSub: (d) => [d.biz || "", d.yyyymm, d.sub],
  client: (d) => [d.biz || ""],
  close: (d) => [d.yyyymm],
  form: () => [],
  "form-off": () => [],
};
const arKey = (d) => `${d.kind === "form-off" ? "form" : d.kind}|${AR_KINDS[d.kind](d).map((x) => String(x ?? "")).join("|")}`;
// 새 문서 이름 — 화면이 새로 저장할 때 쓰는 이름과 같아야 한다(SettleDesk arDeskId)
export const arDocIdParts = (d, client) => {
  if (d.kind === "stmt") return ["stmt", d.biz || "", client, d.yyyymm];
  if (d.kind === "stmtSub") return ["stmtSub", d.biz || "", client, d.yyyymm, d.sub];
  if (d.kind === "client") return ["client", d.biz || "", client];
  if (d.kind === "close") return ["close", client, d.yyyymm];
  return ["form", client]; // form · form-off
};

//  docs: 회사 arDesk 문서 [{ id, kind, client, yyyymm, biz, sub, ... }] · idOf(...parts) → 새 문서 이름
//  → { move: [{ from: 문서, toId, data }], conflict: [문서], lockedSkip: [문서] }
export function planArDesk(docs, { sources = [], target = "", locks = new Set(), includeLocked = false, idOf = (...p) => p.join("__") } = {}) {
  const srcSet = new Map(sources.map((s) => [normName(s), String(s).trim()]));
  const tgt = String(target).trim();
  const taken = new Set((docs || []).filter((d) => d && AR_KINDS[d.kind] && String(d.client || "").trim() === tgt).map(arKey));
  const takenIds = new Set((docs || []).map((d) => d?.id).filter(Boolean));
  const out = { move: [], conflict: [], lockedSkip: [] };
  (docs || []).forEach((d) => {
    if (!d || !AR_KINDS[d.kind]) return;
    const src = srcSet.get(normName(d.client));
    if (!src || normName(src) === normName(tgt)) return;
    const ym = String(d.yyyymm || "").slice(0, 7);
    if (ym && !includeLocked && isLockedYm(locks, src, tgt, ym)) { out.lockedSkip.push(d); return; }
    const k = arKey(d);
    const toId = idOf(...arDocIdParts(d, tgt));
    if (taken.has(k) || (takenIds.has(toId) && toId !== d.id)) { out.conflict.push(d); return; }
    taken.add(k);
    takenIds.add(toId);
    const { id, ...rest } = d; void id;
    out.move.push({ from: d, toId, data: { ...rest, client: tgt, mergedFromClient: src } });
  });
  return out;
}

// 고정노선 한 개 — 노선 거래처 · 정류지 청구처에서 옛 이름을 남길 이름으로. 바뀐 게 없으면 null
export function renameRouteDoc(route, sources, target) {
  const srcSet = new Set(sources.map(normName));
  let changed = false;
  const patch = {};
  if (srcSet.has(normName(route?.client)) && String(route.client).trim()) { patch.client = target; changed = true; }
  if (Array.isArray(route?.stops)) {
    const stops = route.stops.map((s) => (s && String(s.client || "").trim() && srcSet.has(normName(s.client)) ? ((changed = true), { ...s, client: target }) : s));
    if (changed && stops.some((s, i) => s !== route.stops[i])) patch.stops = stops;
  }
  return changed ? patch : null;
}

// 비공개 운임 설정(privateFareSettings.clients[{ name, mode, value }]) — 옛 이름 규칙을 남길 이름으로(남길 이름 규칙이 이미 있으면 옛 것은 뺀다)
export function renamePrivateFareRules(rules, sources, target) {
  const srcSet = new Set(sources.map(normName));
  const list = Array.isArray(rules) ? rules : [];
  if (!list.some((r) => srcSet.has(normName(r?.name)))) return null;
  const hasTarget = list.some((r) => normName(r?.name) === normName(target));
  const out = [];
  let added = hasTarget;
  list.forEach((r) => {
    if (!srcSet.has(normName(r?.name))) { out.push(r); return; }
    if (added) return;
    added = true;
    out.push({ ...r, name: target });
  });
  return out;
}

// n 개씩 자르기(쓰기 묶음 400개)
export const chunks = (arr, n = 400) => { const out = []; for (let i = 0; i < (arr || []).length; i += n) out.push(arr.slice(i, i + n)); return out; };
