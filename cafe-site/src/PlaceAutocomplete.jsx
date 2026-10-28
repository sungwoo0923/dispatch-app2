// ======================= cafe-site/src/PlaceAutocomplete.jsx =======================
// 상/하차지명 + 주소를 한 쌍으로 검색/선택하는 자동완성.
// - 지명 칸: 배차마당에 그동안 올라온 오더들의 상/하차지(자주 쓰는 장소) 검색
// - 주소 칸: 운송 프로그램 "전국운임조회"와 동일하게 TMAP 주소/POI 검색을 해서
//   "인천 서구 북항로 28-29"처럼 입력하면 실제 주소를 드롭다운으로 골라 넣을 수 있다.
//   (자주 쓰는 장소도 함께 위쪽에 보여준다)
import React from "react";

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

// TMAP 주소(searchAddress) + 장소(pois) 동시 검색 → [{ name, addr, src: "tmap" }]
async function searchTmap(keyword) {
  const kw = (keyword || "").trim();
  if (kw.length < 2) return [];
  const headers = { Accept: "application/json" };
  const [saData, poiData] = await Promise.all([
    fetch(`https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(kw)}&countPerPage=10&appKey=${TMAP_KEY}`, { headers }).then(r => r.json()).catch(() => null),
    fetch(`https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(kw)}&count=10&appKey=${TMAP_KEY}`, { headers }).then(r => r.json()).catch(() => null),
  ]);

  const seen = new Set();
  const results = [];

  // 1. 주소 검색 결과 (도로명/지번)
  const saRaw = saData?.searchAddressInfo?.addressInfo;
  const saArr = Array.isArray(saRaw) ? saRaw : (saRaw ? [saRaw] : []);
  for (const it of saArr) {
    const newAddrList = it?.newAddressList?.newAddress;
    const newAddr = Array.isArray(newAddrList) ? newAddrList[0] : newAddrList;
    const road = newAddr?.fullAddressRoad || it.fullAddressRoad || "";
    const full = road || it.fullAddress || "";
    if (!full || seen.has(full)) continue;
    seen.add(full);
    results.push({ name: full, addr: it.fullAddress && it.fullAddress !== full ? it.fullAddress : "", value: full, src: "tmap" });
  }

  // 2. 장소(POI) 검색 결과 — 상호명 + 도로명주소
  const poiRaw = poiData?.searchPoiInfo?.pois?.poi;
  const pois = Array.isArray(poiRaw) ? poiRaw : (poiRaw ? [poiRaw] : []);
  for (const p of pois) {
    const na = p?.newAddressList?.newAddress;
    const n0 = Array.isArray(na) ? na[0] : na;
    const road = n0?.fullAddressRoad || "";
    const jibun = [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.detailAddrName].filter(Boolean).join(" ")
      + (p.firstNo ? ` ${p.firstNo}${p.secondNo && p.secondNo !== "0" ? `-${p.secondNo}` : ""}` : "");
    const full = road || jibun.trim();
    if (!full) continue;
    const key = `${p.name}|${full}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name: p.name || full, addr: full, value: full, poiName: p.name, src: "tmap" });
  }
  return results.slice(0, 15);
}

export default function PlaceAutocomplete({
  nameValue, addrValue, onChangeName, onChangeAddr, places, namePlaceholder, addrPlaceholder,
}) {
  const [open, setOpen] = React.useState(null); // null | "name" | "addr"
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [tmapResults, setTmapResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const wrapRef = React.useRef(null);
  const typedAddr = React.useRef(false); // 사용자가 주소칸에 직접 타이핑했을 때만 TMAP 검색

  React.useEffect(() => {
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // 주소칸 입력 → 0.35초 디바운스 후 TMAP 검색
  React.useEffect(() => {
    if (!typedAddr.current) return;
    const kw = (addrValue || "").trim();
    if (kw.length < 2) { setTmapResults([]); setSearching(false); return; }
    setSearching(true);
    let alive = true;
    const t = setTimeout(() => {
      searchTmap(kw).then(r => { if (alive) { setTmapResults(r); setSearching(false); } });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [addrValue]);

  const options = React.useMemo(() => {
    const q = ((open === "addr" ? addrValue : nameValue) || "").trim().toLowerCase();
    const pool = (q
      ? places.filter(p => (p.name || "").toLowerCase().includes(q) || (p.addr || "").toLowerCase().includes(q))
      : places
    ).slice(0, open === "addr" ? 3 : 8).map(p => ({ ...p, src: "pool" }));
    return open === "addr" ? [...pool, ...tmapResults] : pool;
  }, [open, nameValue, addrValue, places, tmapResults]);

  const pick = (p) => {
    if (p.src === "pool") {
      onChangeName(p.name);
      onChangeAddr(p.addr);
    } else {
      onChangeAddr(p.value);
      // 지명이 비어 있으면 상호명(POI)으로 채워준다
      if (!(nameValue || "").trim() && p.poiName) onChangeName(p.poiName);
    }
    typedAddr.current = false;
    setTmapResults([]);
    setOpen(null);
  };

  const onKeyDown = (e) => {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(options[activeIdx]); }
    else if (e.key === "Escape") setOpen(null);
  };

  const field = "w-full h-11 border border-[#DCE3EE] rounded-xl px-3.5 text-[13.5px] font-semibold text-[#0F1A30] bg-white outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 transition placeholder:text-[#9AA9C3] placeholder:font-medium";

  return (
    <div className="relative" ref={wrapRef}>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={field}
          value={nameValue}
          placeholder={namePlaceholder}
          onFocus={() => { setOpen("name"); setActiveIdx(0); }}
          onChange={e => { onChangeName(e.target.value); setOpen("name"); setActiveIdx(0); }}
          onKeyDown={onKeyDown}
        />
        <div className="relative">
          <input
            className={`${field} pr-8`}
            value={addrValue}
            placeholder={addrPlaceholder}
            onFocus={() => { setOpen("addr"); setActiveIdx(0); }}
            onChange={e => { typedAddr.current = true; onChangeAddr(e.target.value); setOpen("addr"); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
          />
          {searching && open === "addr" && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
          )}
        </div>
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-[#DCE3EE] rounded-xl shadow-[0_18px_40px_rgba(15,26,48,0.18)] max-h-72 overflow-auto">
          {options.map((p, i) => (
            <div key={p.src + p.name + p.addr + i}
              className={`px-3 py-2 text-[13px] cursor-pointer border-b border-gray-50 last:border-0 ${i === activeIdx ? "bg-[#1B2B4B]/10" : "hover:bg-gray-50"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={e => { e.preventDefault(); pick(p); }}>
              <div className="flex items-center gap-1.5">
                {p.src === "pool" && <span className="text-[10px] font-bold px-1.5 py-px rounded border border-[#1B2B4B]/30 text-[#1B2B4B] shrink-0">자주쓰는</span>}
                <span className="font-bold text-gray-900 truncate">{p.name || "(이름 없음)"}</span>
              </div>
              {p.addr && <div className="text-[11px] text-gray-500 truncate">{p.addr}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
