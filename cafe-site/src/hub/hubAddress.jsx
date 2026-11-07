// ======================= cafe-site/src/hub/hubAddress.jsx =======================
// ⭐ 2026-11-07 (3차) 주소 · 상하차지명 자동완성
//  · 주소: "인천 서구" → 지역 후보(시·도 · 시·군·구, 내장 행정구역 목록) + 상세 주소(도로명 · 지번)
//          "인천 서구 검단" → 더 좁혀서. 상세 검색은 배차 프로그램 "전국운임조회"와 같은 TMAP 주소 · 장소 검색(같은 키)을 쓴다.
//          TMAP을 쓸 수 없으면(네트워크 · 키 문제) 지역 후보와 "입력한 그대로 쓰기"만 보여 준다(조용히 줄여서 동작).
//  · 상하차지명: 고객관리(허브 전용 회원) 또는 로지스웹 상하차지거래처(로지스웹 계정)에서 고르면 주소 · 담당자 · 연락처까지 채운다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { HI, inputCls } from "./hubUi";
import { SIDO_LIST, sigunguOf, regionFromAddress } from "./hubConstants";

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer"; // 배차 프로그램(src/FreightRateInquiry.jsx · cafe-site/src/PlaceAutocomplete.jsx)과 같은 키
const cache = new Map();
let tmapDown = 0; // 실패하면 1분 동안은 다시 부르지 않는다

const SIDO_FULL = { 서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도" };

// 내장 지역 후보 — "인천" → 인천의 시·군·구, "인천 서구" → 그 지역, "서구" → 서구가 있는 시·도
export function regionSuggest(text) {
  const t = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return [];
  const r = regionFromAddress(t.join(" "));
  const out = [];
  if (r.sido && r.sigungu) out.push({ kind: "region", sido: r.sido, sigungu: r.sigungu, label: `${r.sido} ${r.sigungu}` });
  else if (r.sido) sigunguOf(r.sido).filter((g) => !t[1] || g.startsWith(t[1])).slice(0, 8).forEach((g) => out.push({ kind: "region", sido: r.sido, sigungu: g, label: `${r.sido} ${g}` }));
  else {
    const w = t[0];
    SIDO_LIST.filter((s) => s.startsWith(w) || (SIDO_FULL[s] || "").startsWith(w)).forEach((s) => out.push({ kind: "region", sido: s, sigungu: "", label: s }));
    SIDO_LIST.forEach((s) => sigunguOf(s).filter((g) => w.length >= 2 && g.startsWith(w)).forEach((g) => out.push({ kind: "region", sido: s, sigungu: g, label: `${s} ${g}` })));
  }
  return out.slice(0, 8);
}

// TMAP 주소(도로명 · 지번) + 장소 검색 → [{ kind: "road" | "jibun" | "poi", label, sub }]
export async function searchDetailAddress(keyword) {
  const kw = String(keyword || "").trim();
  if (kw.length < 2) return [];
  if (cache.has(kw)) return cache.get(kw);
  if (Date.now() - tmapDown < 60000) return [];
  const headers = { Accept: "application/json" };
  try {
    const [sa, poi] = await Promise.all([
      fetch(`https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(kw)}&countPerPage=10&appKey=${TMAP_KEY}`, { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(kw)}&count=8&appKey=${TMAP_KEY}`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const out = [];
    const seen = new Set();
    const add = (x) => { if (x.label && !seen.has(`${x.kind}|${x.label}`)) { seen.add(`${x.kind}|${x.label}`); out.push(x); } };
    const raw = sa?.searchAddressInfo?.addressInfo;
    for (const it of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const nl = it?.newAddressList?.newAddress;
      const road = (Array.isArray(nl) ? nl[0] : nl)?.fullAddressRoad || it.fullAddressRoad || "";
      if (road) add({ kind: "road", label: road, sub: it.fullAddress || "" });
      if (it.fullAddress) add({ kind: "jibun", label: it.fullAddress, sub: road });
    }
    const praw = poi?.searchPoiInfo?.pois?.poi;
    for (const p of (Array.isArray(praw) ? praw : praw ? [praw] : []).slice(0, 6)) {
      const nl = p?.newAddressList?.newAddress;
      const road = (Array.isArray(nl) ? nl[0] : nl)?.fullAddressRoad || "";
      const jibun = [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.detailAddrName, p.firstNo ? `${p.firstNo}${p.secondNo && p.secondNo !== "0" ? `-${p.secondNo}` : ""}` : ""].filter(Boolean).join(" ");
      if (road || jibun) add({ kind: "poi", label: road || jibun, sub: p.name || "", name: p.name || "" });
    }
    cache.set(kw, out);
    return out;
  } catch {
    tmapDown = Date.now();
    return [];
  }
}

const KIND = { road: "도로명", jibun: "지번", poi: "장소", region: "지역", typed: "직접" };

function useOutside(ref, onOut) {
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener("mousedown", f);
    document.addEventListener("touchstart", f);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("touchstart", f); };
  }, [ref, onOut]);
}

// 주소 입력(자동완성) — onPick({ address, sido, sigungu, name? })
export function AddressInput({ value, onChange, onPick, placeholder = "예: 인천 서구 검단", testid }) {
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(false);
  const box = useRef(null);
  useOutside(box, () => setOpen(false));
  useEffect(() => {
    if (!open) return undefined;
    const kw = String(value || "").trim();
    if (kw.length < 2) { setRemote([]); return undefined; }
    let stop = false;
    setLoading(true);
    const t = setTimeout(() => { searchDetailAddress(kw).then((r) => { if (!stop) { setRemote(r); setLoading(false); } }); }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [value, open]);
  const regions = useMemo(() => (open ? regionSuggest(value) : []), [value, open]);
  const items = [
    ...regions.filter((r) => r.label !== String(value || "").trim()),
    ...remote,
    ...(String(value || "").trim().length >= 4 ? [{ kind: "typed", label: String(value).trim(), sub: "입력한 주소 그대로 쓰기" }] : []),
  ];
  const pick = (it) => {
    if (it.kind === "region") { onChange(`${it.label} `); setOpen(true); return; }
    const r = regionFromAddress(it.label);
    onChange(it.label);
    onPick?.({ address: it.label, sido: r.sido, sigungu: r.sigungu, name: it.name || "" });
    setOpen(false);
  };
  return (
    <div className="relative" ref={box}>
      <div className="relative">
        <HI name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8592A8] pointer-events-none" />
        <input className={`${inputCls} pl-10`} value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={placeholder} autoComplete="off" data-testid={testid} />
      </div>
      {open && items.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white rounded-2xl ring-1 ring-inset ring-[#D6DEEA] shadow-[0_18px_40px_rgba(15,26,48,.16)] max-h-[320px] overflow-y-auto hub-scroll" data-testid={testid ? `${testid}-list` : undefined}>
          {items.map((it, i) => (
            <button key={`${it.kind}-${it.label}-${i}`} type="button" onClick={() => pick(it)} className="w-full text-left px-4 py-3 flex items-start gap-2.5 border-b border-[#EEF1F6] last:border-0 hover:bg-[#F5F8FD]" data-testid="addr-item" data-kind={it.kind}>
              <span className={`shrink-0 mt-0.5 h-6 px-2 rounded-md text-[12.5px] font-bold inline-flex items-center ${it.kind === "road" ? "bg-[#0F1A30] text-white" : it.kind === "jibun" ? "bg-[#EAF0FA] text-[#1B2B4B]" : "bg-[#F2F5FA] text-[#55657F]"}`}>{KIND[it.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[#0F1A30] break-keep">{it.label}</span>
                {it.sub && <span className="block text-[13.5px] text-[#8592A8] truncate">{it.sub}</span>}
              </span>
            </button>
          ))}
          {loading && <div className="px-4 py-2.5 text-[13.5px] text-[#8592A8]">주소를 찾고 있어요</div>}
        </div>
      )}
    </div>
  );
}

// 상하차지명(저장한 곳에서 고르기) — places: [{ 이름, 주소, 담당자, 연락처 }]
export function PlaceInput({ value, onChange, places = [], onPick, placeholder = "선택 사항", testid, source = "고객관리" }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useOutside(box, () => setOpen(false));
  const q = String(value || "").trim().replace(/\s+/g, "");
  const list = useMemo(() => {
    if (!open) return [];
    const rows = q ? places.filter((p) => `${p.이름} ${p.주소}`.replace(/\s+/g, "").includes(q)) : places;
    return rows.slice(0, 12);
  }, [open, q, places]);
  return (
    <div className="relative" ref={box}>
      <input className={inputCls} value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} autoComplete="off" data-testid={testid} />
      {open && list.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white rounded-2xl ring-1 ring-inset ring-[#D6DEEA] shadow-[0_18px_40px_rgba(15,26,48,.16)] max-h-[300px] overflow-y-auto hub-scroll" data-testid={testid ? `${testid}-list` : undefined}>
          <div className="px-4 pt-2.5 pb-1 text-[12.5px] font-bold text-[#8592A8]">{source}</div>
          {list.map((p) => (
            <button key={p.id || `${p.이름}${p.주소}`} type="button" onClick={() => { onPick?.(p); setOpen(false); }} className="w-full text-left px-4 py-2.5 border-t border-[#EEF1F6] hover:bg-[#F5F8FD]" data-testid="place-item">
              <span className="block text-[15px] font-extrabold text-[#0F1A30] truncate">{p.이름 || p.주소}</span>
              <span className="block text-[13.5px] text-[#55657F] truncate">{p.주소}{p.담당자 ? `  ${p.담당자}` : ""}{p.연락처 ? ` ${p.연락처}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
