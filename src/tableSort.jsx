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

/**
 * 정렬된 새 배열(정렬 꺼짐이면 원본 그대로).
 * @param {Array} rows 이미 걸러진 목록
 * @param {{key,dir}|null} sort
 * @param {(row, key, index)=>any} [getValue] 컬럼 값 꺼내기(기본: row[key])
 */
export function sortRows(rows, sort, getValue) {
  if (!sort || !sort.key || !Array.isArray(rows) || rows.length < 2) return rows;
  const { key, dir } = sort;
  const n = rows.length;
  const vals = new Array(n);
  let allNum = true, anyVal = false;
  for (let i = 0; i < n; i++) {
    const v = getValue ? getValue(rows[i], key, i) : rows[i]?.[key];
    vals[i] = v;
    if (isEmpty(v)) continue;
    anyVal = true;
    if (allNum && toSortNumber(v) === null) allNum = false;
  }
  if (!anyVal) return rows;
  // 정렬 키를 미리 한 번만 계산 — 비교 중에는 가공하지 않는다.
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    keys[i] = isEmpty(v) ? null : allNum ? toSortNumber(v) : String(v).trim();
  }
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const sign = dir === "desc" ? -1 : 1;
  idx.sort((a, b) => {
    const ka = keys[a], kb = keys[b];
    if (ka === null || kb === null) {
      if (ka === kb) return a - b;
      return ka === null ? 1 : -1; // 빈 값은 오름·내림 상관없이 항상 맨 아래
    }
    const c = allNum ? ka - kb : collator.compare(ka, kb);
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
