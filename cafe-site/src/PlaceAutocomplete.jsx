// ======================= cafe-site/src/PlaceAutocomplete.jsx =======================
// 상/하차지명 + 주소를 한 쌍으로 검색/선택하는 자동완성. 배차마당은 운송
// 프로그램의 사설 거래처 DB(clients/places)에 접근하지 않으므로(다른 회사가
// 함부로 열람하면 안 되는 데이터라 의도적으로 공유하지 않는다), 대신 배차마당에
// 그동안 올라온 모든 오더의 상/하차지 이름+주소를 모아 "자주 쓰는 장소" 검색
// 풀로 쓴다 — 같은 노선을 반복 등록할 때 클릭 한 번으로 채울 수 있다.
// 실제 도로명주소는 Daum(카카오) 우편번호 서비스 팝업으로 검색해 정확한 주소를
// 바로 채워넣을 수 있다(API 키 없이 쓸 수 있는 공식 무료 스크립트).
import React from "react";

let daumPostcodeLoading = null;
function loadDaumPostcodeScript() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (daumPostcodeLoading) return daumPostcodeLoading;
  daumPostcodeLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return daumPostcodeLoading;
}

function openAddressSearch(onPick) {
  loadDaumPostcodeScript().then(() => {
    new window.daum.Postcode({
      oncomplete: (data) => {
        const addr = data.roadAddress || data.jibunAddress || data.address;
        onPick(addr);
      },
    }).open();
  }).catch(() => alert("주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."));
}

export default function PlaceAutocomplete({
  nameValue, addrValue, onChangeName, onChangeAddr, places, namePlaceholder, addrPlaceholder,
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const q = `${nameValue || ""} ${addrValue || ""}`.trim().toLowerCase();
  const options = React.useMemo(() => {
    if (!q) return places.slice(0, 8);
    return places.filter(p =>
      (p.name || "").toLowerCase().includes(q) || (p.addr || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [q, places]);

  const pick = (p) => {
    onChangeName(p.name);
    onChangeAddr(p.addr);
    setOpen(false);
  };

  const field = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";

  return (
    <div className="relative" ref={wrapRef}>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={field}
          value={nameValue}
          placeholder={namePlaceholder}
          onFocus={() => setOpen(true)}
          onChange={e => { onChangeName(e.target.value); setOpen(true); setActiveIdx(0); }}
          onKeyDown={e => {
            if (!open || options.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(options[activeIdx]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        <div className="relative">
          <input
            className={`${field} pr-[70px]`}
            value={addrValue}
            placeholder={addrPlaceholder}
            onFocus={() => setOpen(true)}
            onChange={e => { onChangeAddr(e.target.value); setOpen(true); setActiveIdx(0); }}
            onKeyDown={e => {
              if (!open || options.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(options[activeIdx]); }
              else if (e.key === "Escape") setOpen(false);
            }}
          />
          <button type="button"
            onClick={() => openAddressSearch((addr) => { onChangeAddr(addr); setOpen(false); })}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#1B2B4B] border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50 transition">
            주소검색
          </button>
        </div>
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-auto">
          {options.map((p, i) => (
            <div key={p.name + p.addr + i}
              className={`px-3 py-2 text-[13px] cursor-pointer border-b border-gray-50 last:border-0 ${i === activeIdx ? "bg-[#1B2B4B]/10" : "hover:bg-gray-50"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={e => { e.preventDefault(); pick(p); }}>
              <div className="font-bold text-[#1B2B4B]">{p.name || "(이름 없음)"}</div>
              {p.addr && <div className="text-[11px] text-gray-500 truncate">{p.addr}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
