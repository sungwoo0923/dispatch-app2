// src/seenBadges.js — 메뉴 숫자를 "내가 아직 안 본 것"으로(PC·모바일 공용)
// ⭐ 2026-11-06 계정별 안 본 숫자 — 예전엔 미배차·고정노선 숫자가 "전체 건수"라서 이미 확인한 오더도 계속 숫자로 남았다.
//  ▸ 사람(uid)마다 · 숫자 종류(kind)마다 "본 오더 id" 목록을 둔다.
//      unassigned — 미배차 오더(PC 배차현황·미배차현황 탭 / 모바일 등록내역·미배차현황 · 같은 오더라 한 목록)
//      fixed      — 고정노선 미배차 오더(PC·모바일 고정노선현황)
//  ▸ 이 브라우저(localStorage, 바로 반영) + users/{uid}.badgeSeen.{kind}(다른 기기와 맞춤 · 2초 모아서 저장)
//    서버 값과 이 기기 값은 합친다(어느 기기에서 봤든 본 것). 문서가 커지지 않게 짧은 해시를 쉼표로 이어 한 문자열,
//    지금 있는 오더 + 최근 것 합쳐 최대 500개만 남긴다.
//  ▸ useUnseenCount(kind, items) → 안 본 건수 · markSeen(kind, items) → 지금 목록을 다 봤음으로
//  ▸ useMarkSeenOnView(active, kind, items) → 그 화면에 1.5초 머물면 지금 목록을 봤음으로
import React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export const SEEN_CAP = 500;
// 오더 한 건의 키 — pickUnassignedOrders와 같은 기준(컬렉션/문서 id)
export const badgeItemKey = (r) => (r && typeof r === "object" ? `${r.__col || ""}/${r._id || r.id || ""}` : String(r || ""));
// 짧은 해시(FNV-1a 32bit, base36 · 6~7자) — 500개라도 몇 KB
const h = (s) => {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  return (x >>> 0).toString(36);
};
const itemHash = (r) => h(badgeItemKey(r));

const ls = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};
const lsKey = (uid, kind) => `kpBadgeSeen:${uid || "anon"}:${kind}`;
const split = (s) => (typeof s === "string" && s ? s.split(",").filter(Boolean) : Array.isArray(s) ? s.map(String) : []);

// ─── 스토어 ───────────────────────────────────────────────────────────────
const S = { uid: "", server: {}, seen: {}, ver: 0 }; // seen[kind] = string[](오래된 것 → 최근 것)
const sets = {}; // kind → Set(빠른 조회)
const subs = new Set();
const emit = () => { S.ver++; subs.forEach((f) => { try { f(); } catch { /* 무시 */ } }); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const useVer = () => React.useSyncExternalStore(subscribe, () => S.ver, () => S.ver);

// 이 기기 + 서버 합치기(순서 유지, 중복 없음)
function mergeLists(a, b) {
  const out = []; const seen = new Set();
  [...a, ...b].forEach((x) => { if (x && !seen.has(x)) { seen.add(x); out.push(x); } });
  return out.slice(-SEEN_CAP * 2);
}
function loadKind(kind) {
  const list = mergeLists(split(ls.get(lsKey(S.uid, kind))), split(S.server?.[kind]));
  S.seen[kind] = list;
  sets[kind] = new Set(list);
}
function kindOf(kind) { if (!S.seen[kind]) loadKind(kind); return sets[kind]; }

// 로그인한 사람 · 서버 값(users/{uid}.badgeSeen) 알려 주기 — 앱 맨 위에서 한 번
export function setBadgeSeenUser(uid, server) {
  const u = uid || "";
  const sv = server && typeof server === "object" ? server : {};
  if (u === S.uid && sv === S.server) return;
  const userChanged = u !== S.uid;
  S.uid = u; S.server = sv;
  if (userChanged) { Object.keys(S.seen).forEach((k) => delete S.seen[k]); Object.keys(sets).forEach((k) => delete sets[k]); }
  else Object.keys(S.seen).forEach((k) => loadKind(k));
  emit();
}
export function useBadgeSeenSync(uid, server) {
  React.useEffect(() => { setBadgeSeenUser(uid, server); }, [uid, server]);
}

// 안 본 것만 골라 주기
export function pickUnseen(kind, items) {
  if (!S.uid) return items || [];
  const st = kindOf(kind);
  return (items || []).filter((r) => !st.has(itemHash(r)));
}
export function useUnseenItems(kind, items) {
  const v = useVer();
  return React.useMemo(() => pickUnseen(kind, items), [v, kind, items]); // eslint-disable-line react-hooks/exhaustive-deps
}
export function useUnseenCount(kind, items) { return useUnseenItems(kind, items).length; }
// 여러 종류의 안 본 것을 합친 건수(같은 오더는 한 번 · 햄버거·상단 메뉴 합계용)
export function unionCount(...lists) {
  const k = new Set();
  lists.forEach((l) => (l || []).forEach((r) => k.add(badgeItemKey(r))));
  return k.size;
}

const _timers = {};
export function markSeen(kind, items) {
  if (!S.uid || !items || !items.length) return;
  const st = kindOf(kind);
  const now = items.map(itemHash);
  if (now.every((x) => st.has(x))) return;
  // 지금 있는 것은 맨 뒤(최근)로 · 나머지 오래된 것부터 잘라 최대 500개
  const cur = new Set(now);
  const rest = S.seen[kind].filter((x) => !cur.has(x));
  const keep = Math.max(0, SEEN_CAP - cur.size);
  const list = [...(keep > 0 ? rest.slice(-keep) : []), ...cur];
  S.seen[kind] = list;
  sets[kind] = new Set(list);
  const str = list.join(",");
  ls.set(lsKey(S.uid, kind), str);
  emit();
  // 서버에도(2초에 한 번 · 그 종류 칸만) — 실패해도(권한·둘러보기) 이 브라우저 기록은 남는다
  const uid = S.uid;
  clearTimeout(_timers[kind]);
  _timers[kind] = setTimeout(() => {
    if (!uid || uid === "preview" || uid !== S.uid) return;
    updateDoc(doc(db, "users", uid), { [`badgeSeen.${kind}`]: S.seen[kind].join(",") }).catch(() => {});
  }, 2000);
}

// 그 화면을 보고 있으면(active) 1.5초 뒤 지금 목록을 봤음으로 — 머무는 동안 새로 생긴 것도 다시 1.5초 뒤
export function useMarkSeenOnView(active, kind, items, delay = 1500) {
  const unseen = useUnseenCount(kind, items);
  const ref = React.useRef(items);
  ref.current = items;
  React.useEffect(() => {
    if (!active || !unseen) return undefined;
    const t = setTimeout(() => markSeen(kind, ref.current), delay);
    return () => clearTimeout(t);
  }, [active, kind, unseen, delay]);
}
