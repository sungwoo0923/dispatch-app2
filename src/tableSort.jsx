// ⭐ 표 머리글(컬럼명) 클릭 정렬 — 모든 목록 표가 함께 쓰는 공용 도구.
//
//  - 클릭할 때마다: 오름차순(▲) → 내림차순(▼) → 정렬 해제(원래 순서)
//  - 정렬 상태는 "이 브라우저·이 사용자"에게만 남는다(localStorage). Firestore에는 절대 저장하지 않는다.
//  - 렉 방지: 이미 걸러진(검색·필터 후) 목록만, useMemo로 한 번 정렬한다.
//    비교할 값(정렬 키)을 행마다 딱 한 번만 미리 계산해 두고(decorate → sort → undecorate),
//    숫자 컬럼은 숫자 비교, 글자 컬럼은 한국어 사전순(Intl.Collator, 재사용)으로 비교한다.
//    정렬이 꺼져 있으면 원래 배열을 그대로 돌려줘 복사조차 하지 않는다.
import React from "react";

const LS_PREFIX = "kp.tableSort.";

// 한국어 사전순 + 숫자는 크기순("2톤" < "11톤", "2026-01-02" < "2026-01-10")
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

// "1,200,000원" / "2.5톤" / "11t" / "30%" / "-5,000" 같은 값을 숫자로. 숫자가 아니면 null.
const NUM_RE = /^[-+]?[\d,]*\.?\d+\s*(원|톤|t|T|%|건|대|명|일|회|kg|KG|㎏)?$/;
export const toSortNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v ?? "").trim();
  if (!s || !NUM_RE.test(s)) return null;
  const n = parseFloat(s.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const isEmpty = (v) => v == null || v === "" || (typeof v === "string" && !v.trim());

const readSaved = (storageKey) => {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(LS_PREFIX + storageKey);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && typeof o.key === "string" && o.key && (o.dir === "asc" || o.dir === "desc")) return { key: o.key, dir: o.dir };
  } catch { /* 저장소를 못 쓰는 환경이면 그냥 정렬 없음으로 시작 */ }
  return null;
};

/**
 * 머리글 클릭 정렬 상태.
 * @param {string} storageKey 화면별 이름(예: "realtime"). 비우면 저장하지 않는다.
 * @returns {{ sort: {key:string, dir:"asc"|"desc"} | null, toggle: (key:string)=>void, reset: ()=>void }}
 */
export function useTableSort(storageKey) {
  const [sort, setSort] = React.useState(() => readSaved(storageKey));
  React.useEffect(() => {
    if (!storageKey) return;
    try {
      if (sort) localStorage.setItem(LS_PREFIX + storageKey, JSON.stringify(sort));
      else localStorage.removeItem(LS_PREFIX + storageKey);
    } catch { /* 무시 */ }
  }, [storageKey, sort]);
  const toggle = React.useCallback((key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // 세 번째 클릭 → 해제
    });
  }, []);
  const reset = React.useCallback(() => setSort(null), []);
  return { sort, toggle, reset };
}

// "09:30" / "9:00" / "오전 9시" / "오후 2시 30분" / "오후 2:30" → 하루 중 분(分). 시간이 아니면 null.
const TIME_HM = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const TIME_KO = /^(오전|오후|AM|PM|am|pm)\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2})?\s*분?)?\s*$/;
export const toSortTime = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = TIME_HM.exec(s);
  if (m) { const h = +m[1], mi = +m[2]; return h < 48 && mi < 60 ? h * 60 + mi : null; }
  m = TIME_KO.exec(s);
  if (m) {
    let h = +m[2] % 12; const mi = m[3] ? +m[3] : 0;
    if (/오후|PM|pm/.test(m[1])) h += 12;
    return mi < 60 ? h * 60 + mi : null;
  }
  return null;
};
const LEAD_NUM = /^\s*(\d+(?:\.\d+)?)/; // "2.5톤", "3.5톤광폭", "11톤축" 처럼 숫자로 시작하는 값

/**
 * 정렬된 새 배열(정렬 꺼짐이면 원본 그대로).
 * 칸의 값을 보고 비교 방식을 정한다:
 *   전부 숫자/금액 → 숫자 크기 · 대부분 시간 → 시각 순 · 대부분 숫자로 시작(톤수) → 앞 숫자 크기
 *   그 밖 → 한국어 사전순(숫자는 크기순). 빈 값은 오름·내림 상관없이 항상 맨 아래.
 * @param {Array} rows 이미 걸러진 목록
 * @param {{key,dir}|null} sort
 * @param {(row, key, index)=>any} [getValue] 컬럼 값 꺼내기(기본: row[key])
 */
export function sortRows(rows, sort, getValue) {
  if (!sort || !sort.key || !Array.isArray(rows) || rows.length < 2) return rows;
  const { key, dir } = sort;
  const n = rows.length;
  const vals = new Array(n);
  let filled = 0, numCnt = 0, timeCnt = 0, leadCnt = 0;
  for (let i = 0; i < n; i++) {
    const v = getValue ? getValue(rows[i], key, i) : rows[i]?.[key];
    if (isEmpty(v)) { vals[i] = null; continue; }
    vals[i] = v; filled++;
    if (toSortNumber(v) !== null) numCnt++;
    else if (typeof v === "string") {
      if (toSortTime(v) !== null) timeCnt++;
      else if (LEAD_NUM.test(v)) leadCnt++;
    }
  }
  if (!filled) return rows;
  const mode = numCnt === filled ? "num"
    : timeCnt > 0 && timeCnt + numCnt >= filled * 0.8 ? "time"
    : leadCnt + numCnt >= filled * 0.8 ? "lead" : "str";
  // 정렬 키를 행마다 한 번만 계산 — 비교 중에는 가공하지 않는다. k1: 숫자(없으면 null) · k2: 글자
  const k1 = new Array(n), k2 = new Array(n), empty = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (v === null) { empty[i] = 1; continue; }
    const str = String(v).trim();
    k2[i] = str;
    if (mode === "num") k1[i] = toSortNumber(v);
    else if (mode === "time") k1[i] = toSortTime(str);
    else if (mode === "lead") { const m = LEAD_NUM.exec(str); k1[i] = m ? parseFloat(m[1]) : null; }
    else k1[i] = null;
  }
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const sign = dir === "desc" ? -1 : 1;
  idx.sort((a, b) => {
    if (empty[a] || empty[b]) return empty[a] === empty[b] ? a - b : empty[a] ? 1 : -1;
    let c = 0;
    const na = k1[a], nb = k1[b];
    if (na !== null && na !== undefined && nb !== null && nb !== undefined) c = na - nb;
    else if (mode !== "str" && (na == null) !== (nb == null)) c = na == null ? 1 : -1; // 숫자·시간으로 못 읽은 값은 그 뒤에
    if (c === 0) c = collator.compare(k2[a], k2[b]);
    return c !== 0 ? c * sign : a - b; // 같은 값이면 원래 순서 유지(안정 정렬)
  });
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = rows[idx[i]];
  return out;
}

/** useMemo로 감싼 sortRows — getValue는 가능하면 컴포넌트 밖 상수/useCallback으로. */
export function useSortedRows(rows, sort, getValue) {
  return React.useMemo(() => sortRows(rows, sort, getValue), [rows, sort, getValue]);
}

/** 정렬 표시(▲/▼). 정렬 중이 아닐 때는 흐린 ↕ 로 "누르면 정렬된다"는 힌트만. */
export function SortMark({ active, dir }) {
  if (!active) return <span aria-hidden className="kp-sort-mark ml-0.5 text-[9px] opacity-0 group-hover:opacity-60 transition-opacity">▲</span>;
  return <span aria-hidden className="kp-sort-mark ml-0.5 text-[10px] font-black">{dir === "asc" ? "▲" : "▼"}</span>;
}

/**
 * 정렬 머리글 칸. <th> 대신 그대로 쓰면 된다.
 *  <SortTh k="거래처명" sort={sort} onSort={toggle} className={head}>거래처명</SortTh>
 * k 를 비우면(또는 noSort) 평범한 th.
 */
export const SortTh = React.memo(function SortTh({ k, sort, onSort, className = "", children, noSort, title, style, align, ...rest }) {
  const sortable = !!k && !noSort && typeof onSort === "function";
  if (!sortable) return <th className={className} style={style} title={title} {...rest}>{children}</th>;
  const active = !!sort && sort.key === k;
  const dir = active ? sort.dir : null;
  const justify = align === "right" ? "justify-end" : align === "left" ? "justify-start" : "justify-center";
  return (
    <th
      className={`${className} group cursor-pointer select-none`}
      style={style}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      title={title || (active ? (dir === "asc" ? "오름차순 — 한 번 더 누르면 내림차순" : "내림차순 — 한 번 더 누르면 정렬 해제") : "눌러서 정렬")}
      onClick={() => onSort(k)}
      {...rest}
    >
      <span className={`inline-flex items-center gap-0.5 ${justify} w-full`}>
        {children}
        <SortMark active={active} dir={dir} />
      </span>
    </th>
  );
});
