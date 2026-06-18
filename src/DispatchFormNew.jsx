import { useState, useMemo, useEffect, useRef } from "react";
// ✅ 서버 카카오 경로 계산 (컴포넌트 밖!)
const calcRouteByServer = async (fromAddr, toAddr) => {
  const res = await fetch("/api/route-calc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromAddr, toAddr }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "경로 계산 실패");
  return data;
};

// DispatchFormNew.jsx
const VEHICLE_TYPES = [
  "라보/다마스",
  "카고",
  "윙바디",
  "리프트",
  "탑차",
  "냉장탑",
  "냉동탑",
  "냉장윙",
  "냉동윙",
  "오토바이",
  "기타",
];

const LOAD_TYPES = ["지게차", "수작업", "직접수작업", "수도움","크레인"];
const PAY_TYPES = ["계산서", "착불","선불", "손실","개인","기타"];
const DISPATCH_TYPES = ["24시", "직접배차", "인성","2고정기사"];
function isLikelyFullAddress(addr) {
  return /\d/.test(addr) && addr.length >= 8;
}
// ===============================
// 📅 날짜 퀵 버튼 유틸
// ===============================
const formatDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getToday = () => formatDate(new Date());

const getTomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDate(d);
};

const getNextMonday = () => {
  const d = new Date();
  const day = d.getDay(); // 0=일, 1=월 ...
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
};
const normalizePlate = (v = "") =>
  v.replace(/\s/g, "").toUpperCase();
export default function DispatchFormNew({
  form,
  onChange,
  doSave,
  placeRows = [],
  drivers = [],
  upsertDriver
}) {
  // 📅 날짜 퀵버튼 활성 상태
const [pickupQuick, setPickupQuick] = useState(null); // "today" | "tomorrow" | "monday"
const [dropQuick, setDropQuick] = useState(null);     // "today" | "tomorrow" | "monday"
// ✅ 최초 진입 시 상/하차일 무조건 오늘로 셋팅
useEffect(() => {
  const today = getToday();

  if (!form.상차일) {
    onChange("상차일", today);
    setPickupQuick("today");
  }

  if (!form.하차일) {
    onChange("하차일", today);
    setDropQuick("today");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
// ✅ 자정(00:00) 넘어가면 날짜 자동 갱신
useEffect(() => {
  let timerId;

  const scheduleMidnightUpdate = () => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0, 0, 1
    );

    const delay = nextMidnight.getTime() - now.getTime();

    timerId = setTimeout(() => {
      const today = getToday();

      // 🔒 "지금도" today 상태일 때만 갱신
      setPickupQuick((prev) => {
        if (prev === "today") {
          onChange("상차일", today);
          return "today";
        }
        return prev;
      });

      setDropQuick((prev) => {
        if (prev === "today") {
          onChange("하차일", today);
          return "today";
        }
        return prev;
      });

      scheduleMidnightUpdate();
    }, delay);
  };

  scheduleMidnightUpdate();

  return () => {
    if (timerId) clearTimeout(timerId);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const [routeError, setRouteError] = useState(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
const [pendingPlate, setPendingPlate] = useState("");
  const [fareResult, setFareResult] = useState({
  distanceKm: null,
  durationMin: null,
  baseFare: 0,
});
const handleResetAll = () => {
  const today = getToday();

  Object.keys(form).forEach((key) => {
    if (key === "상차일" || key === "하차일") return;
    onChange(key, "");
  });

  onChange("상차일", today);
  onChange("하차일", today);
  setPickupQuick("today");
  setDropQuick("today");

  setRouteError(null);
  setFareResult({
    distanceKm: null,
    durationMin: null,
    baseFare: 0,
  });

  setActivePlaceType(null);
  setHighlightIndex(-1);
};
const handleSwapPickupDrop = () => {
  const swapPairs = [
    ["상차지명", "하차지명"],
    ["상차지주소", "하차지주소"],
    ["상차담당자", "하차담당자"],
    ["상차연락처", "하차연락처"],
  ];

  swapPairs.forEach(([a, b]) => {
    const temp = form[a];
    onChange(a, form[b] || "");
    onChange(b, temp || "");
  });
};
const handleFareLookup = () => {
  const { 차량종류 } = form;

  if (!차량종류) {
    alert("차량종류를 선택해주세요.");
    return;
  }

  const baseFareTable = {
    "오토바이": 30000,
    "라보/다마스": 50000,
    "카고": 70000,
    "윙바디": 90000,
    "탑차": 80000,
  };

  const baseFare = baseFareTable[차량종류] || 0;

setFareResult((prev) => ({
  ...prev,
  baseFare,
}));

  onChange("청구운임", baseFare);
};
// ===============================
// 📏 상차/하차 주소 기반 자동 거리 계산
// ===============================
const handleAutoRouteCalc = async () => {
  if (!form.상차지주소 || !form.하차지주소) return;

  try {
    const result = await calcRouteByServer(
      form.상차지주소,
      form.하차지주소
    );

    setRouteError(null);
    setFareResult(prev => ({
      ...prev,
      distanceKm: result.distanceKm,
      durationMin: result.durationMin,
    }));
  } catch (e) {
    setRouteError("주소 기반 거리 계산 실패");
    setFareResult(prev => ({
      ...prev,
      distanceKm: null,
      durationMin: null,
    }));
  }
};
 const checkDriverMatch = () => {
    const plate = normalizePlate(form.차량번호 || "");

    if (!plate) return;

    const match = (drivers || []).find(
      d => normalizePlate(d.차량번호) === plate
    );

    if (match) {
      onChange("기사명", match.이름 || "");
      onChange("기사연락처", match.전화번호 || "");
    } else {
      setPendingPlate(form.차량번호);
      setShowNewDriverModal(true);
    }
  };
// const calcRouteByServer = async (fromAddr, toAddr) => {
//   try {
//     const res = await fetch(
//       `/api/route?from=${encodeURIComponent(fromAddr)}&to=${encodeURIComponent(toAddr)}`
//     );
//     const data = await res.json();
//   } catch (e) {
//     console.error(e);
//   }
// };
  const upNameRef = useRef(null);
const upAddrRef = useRef(null);
const upManRef = useRef(null);
const upTelRef = useRef(null);
const downNameRef = useRef(null);

  // 🔹 상/하차 자동완성 구분용
  const [activePlaceType, setActivePlaceType] = useState(null); // "상차" | "하차" | "거래처"
const [highlightIndex, setHighlightIndex] = useState(-1);
const handlePlaceKeyDown = (e) => {
  if (!filteredPlaces.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setHighlightIndex((i) =>
      i < filteredPlaces.length - 1 ? i + 1 : 0
    );
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    setHighlightIndex((i) =>
      i > 0 ? i - 1 : filteredPlaces.length - 1
    );
  }

  if (e.key === "Enter" && highlightIndex >= 0) {
    e.preventDefault();
    selectPlace(filteredPlaces[highlightIndex]);
    setHighlightIndex(-1);
  }
};
const lineInput =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 " +
  "bg-gray-100 placeholder:text-gray-400 " +
  "focus:outline-none focus:border-blue-500 focus:bg-white transition";
const dateQuickBtnBase =
  "px-2.5 py-1 text-xs rounded-md border transition";

const dateQuickBtnInactive =
  "border-gray-200 text-gray-600 bg-white hover:bg-gray-100";

const dateQuickBtnActive =
  "border-blue-500 text-blue-600 bg-blue-50";

  const select = lineInput + " cursor-pointer";

// ✅ Firestore 하차지 거래처 기반 자동완성 풀
const placePool = useMemo(() => {
  
  return (placeRows || []).map((p) => ({
    지명: p.업체명 || "",
    주소: p.주소 || "",
    담당자: p.담당자 || "",
    연락처: p.담당자번호 || "",
  }));
}, [placeRows]);
// ✅ 거래처 자동완성 풀 (상차지 기준)
const clientPool = useMemo(() => {
  const map = new Map();

  (placeRows || []).forEach((p) => {
    if (!p.업체명) return;

    map.set(p.업체명, {
      거래처명: p.업체명,
      지명: p.업체명,
      주소: p.주소 || "",
      담당자: p.담당자 || "",
      연락처: p.담당자번호 || "",
    });
  });

  return Array.from(map.values());
}, [placeRows]);

  // ✅ 기존 로직 그대로
  const selectPlace = (place) => {
    if (activePlaceType === "거래처") {
  // 거래처명 세팅
  onChange("거래처명", place.거래처명);

  // 🔥 상차지 자동 주입
  onChange("상차지명", place.지명);
  onChange("상차지주소", place.주소);
  onChange("상차담당자", place.담당자);
  onChange("상차연락처", place.연락처);
}
    if (activePlaceType === "상차") {
      onChange("상차지명", place.지명);
      onChange("상차지주소", place.주소);
      onChange("상차담당자", place.담당자);
      onChange("상차연락처", place.연락처);
    }

    if (activePlaceType === "하차") {
      onChange("하차지명", place.지명);
      onChange("하차지주소", place.주소);
      onChange("하차담당자", place.담당자);
      onChange("하차연락처", place.연락처);
    }

    setActivePlaceType(null);
  };
  // ✅ 자동완성 결과만 계산
const filteredPlaces = useMemo(() => {
  let raw = "";
  let source = [];

  if (activePlaceType === "상차") {
    raw = form.상차지명;
    source = placePool;
  }

  if (activePlaceType === "하차") {
    raw = form.하차지명;
    source = placePool;
  }

  if (activePlaceType === "거래처") {
    raw = form.거래처명;
    source = clientPool;
  }

  const keyword = (raw || "").trim().toLowerCase();
  if (!keyword) return [];

  return source
    .map((p) => {
      const name = (p.지명 || p.거래처명 || "").toLowerCase();
      let score = 0;

      if (name === keyword) score = 100;
      else if (name.startsWith(keyword)) score = 80;
      else if (name.includes(keyword)) score = 50;

      return { ...p, __score: score };
    })
    .filter((p) => p.__score > 0)
    .sort((a, b) => b.__score - a.__score);
}, [
  activePlaceType,
  form.상차지명,
  form.하차지명,
  form.거래처명,
  placePool,
  clientPool,
]);
// ✅ 신규 거래처 여부 판단 (여기!)
const isNewClient =
  activePlaceType === "거래처" &&
  form.거래처명?.trim() &&
  filteredPlaces.length === 0;
// 🔹 외부 클릭 / ESC 시 드롭다운 닫기
useEffect(() => {
  const handler = (e) => {
    if (e.target.closest(".place-autocomplete")) return;
    setActivePlaceType(null);
    setHighlightIndex(-1);
  };

  const keyHandler = (e) => {
    if (e.key === "Escape") {
      setActivePlaceType(null);
      setHighlightIndex(-1);
    }
  };

  document.addEventListener("mousedown", handler);
  document.addEventListener("keydown", keyHandler);

  return () => {
    document.removeEventListener("mousedown", handler);
    document.removeEventListener("keydown", keyHandler);
  };
}, []);
// 상차/하차 주소 바뀌면 자동 거리 계산
useEffect(() => {
  if (!form.상차지주소 || !form.하차지주소) return;

  const t = setTimeout(() => {
    handleAutoRouteCalc();
  }, 800); // ⭐ 중요

  return () => clearTimeout(t);
}, [form.상차지주소, form.하차지주소]);


  return (
    <form autoComplete="off" onSubmit={e => e.preventDefault()}>
      {showNewClientModal && (
        <NewClientModal
          initialName={form.거래처명}
          onClose={() => setShowNewClientModal(false)}
          onSave={(client) => {
            onChange("거래처명", client.업체명);
            onChange("상차지명", client.업체명);
            onChange("상차지주소", client.주소);
            onChange("상차담당자", client.담당자);
            onChange("상차연락처", client.담당자연락처);
            setShowNewClientModal(false);
          }}
        />
      )}
      {showNewDriverModal && (
        <NewDriverModal
          plate={pendingPlate}
          onClose={() => setShowNewDriverModal(false)}
          onSave={(driver) => {
            onChange("차량번호", driver.차량번호);
            onChange("기사명", driver.이름);
            onChange("기사연락처", driver.전화번호);
            const plateId = normalizePlate(driver.차량번호);
            upsertDriver?.({
              id: plateId,
              차량번호: plateId,
              이름: driver.이름,
              전화번호: driver.전화번호
            });
            setShowNewDriverModal(false);
          }}
        />
      )}

      <div className="space-y-0 divide-y divide-gray-100">

        {/* 기본 정보 */}
        <section className="py-5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">기본 정보</div>
          <div className="grid grid-cols-3 gap-5">
            <div className="relative place-autocomplete">
              <label className="block text-[11px] text-gray-400 mb-1">거래처명</label>
              <div className="relative">
                <input className={lineInput} value={form.거래처명 || ""} onFocus={() => setActivePlaceType("거래처")} onChange={(e) => { onChange("거래처명", e.target.value); setActivePlaceType("거래처"); }} onKeyDown={handlePlaceKeyDown}/>
                {isNewClient && <button type="button" onClick={() => setShowNewClientModal(true)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 text-gray-500 hover:border-[#1B2B4B] hover:text-[#1B2B4B] bg-white">신규</button>}
              </div>
              {activePlaceType === "거래처" && filteredPlaces.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-sm text-[12px]">
                  {filteredPlaces.map((p, idx) => (
                    <li key={idx} onMouseDown={() => selectPlace(p)} onMouseEnter={() => setHighlightIndex(idx)}
                      className={"px-3 py-1.5 cursor-pointer " + (idx === highlightIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50")}>
                      {p.거래처명}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-gray-400">상차일</label>
                <div className="flex gap-0.5">
                  {[["당일","today",getToday],["내일","tomorrow",getTomorrow],["월상","monday",getNextMonday]].map(([lbl,key,fn]) => (
                    <button key={key} type="button" onClick={() => { onChange("상차일", fn()); setPickupQuick(key); }}
                      className={"px-2 py-0.5 text-[10px] rounded border transition " + (pickupQuick === key ? "border-[#1B2B4B] text-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 text-gray-500 hover:border-gray-400")}>{lbl}</button>
                  ))}
                </div>
              </div>
              <input type="date" className={lineInput} value={form.상차일 || ""} onChange={e => { onChange("상차일", e.target.value); setPickupQuick(null); }}/>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-gray-400">하차일</label>
                <div className="flex gap-0.5">
                  {[["당일","today",getToday],["내일","tomorrow",getTomorrow],["월착","monday",getNextMonday]].map(([lbl,key,fn]) => (
                    <button key={key} type="button" onClick={() => { onChange("하차일", fn()); setDropQuick(key); }}
                      className={"px-2 py-0.5 text-[10px] rounded border transition " + (dropQuick === key ? "border-[#1B2B4B] text-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 text-gray-500 hover:border-gray-400")}>{lbl}</button>
                  ))}
                </div>
              </div>
              <input type="date" className={lineInput} value={form.하차일 || ""} onChange={e => { onChange("하차일", e.target.value); setDropQuick(null); }}/>
            </div>
          </div>
        </section>

        {/* 상/하차 정보 */}
        <section className="py-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">상/하차 정보</span>
            <button type="button" onClick={handleSwapPickupDrop}
              className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-0.5 hover:border-[#1B2B4B] hover:text-[#1B2B4B] transition">상하차 전환</button>
            <button type="button" onClick={handleResetAll}
              className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-0.5 hover:border-red-300 hover:text-red-500 transition">초기화</button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#1B2B4B]"/>
                <span className="text-[11px] font-semibold text-[#1B2B4B]">상차지</span>
              </div>
              <div className="relative place-autocomplete">
                <input ref={upNameRef} className={lineInput} placeholder="상차지명" value={form.상차지명 || ""} onFocus={() => setActivePlaceType("상차")} onChange={(e) => { const v = e.target.value; onChange("상차지명", v); setActivePlaceType("상차"); if (!v.trim()) { onChange("상차지주소", ""); onChange("상차담당자", ""); onChange("상차연락처", ""); } }} onKeyDown={(e) => { handlePlaceKeyDown(e); if (e.key !== "Tab") return; const empty = [{v: form.상차지주소, ref: upAddrRef},{v: form.상차담당자, ref: upManRef},{v: form.상차연락처, ref: upTelRef}].filter(x => !x.v?.trim()); e.preventDefault(); if (empty.length > 0) empty[0].ref.current?.focus(); else downNameRef.current?.focus(); }}/>
                {activePlaceType === "상차" && filteredPlaces.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-sm text-[12px]">
                    {filteredPlaces.map((p, idx) => (
                      <li key={idx} onMouseDown={() => selectPlace(p)} onMouseEnter={() => setHighlightIndex(idx)}
                        className={"px-3 py-1.5 cursor-pointer " + (idx === highlightIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50")}>
                        <div className="font-medium">{p.지명}</div>
                        <div className="text-[10px] text-gray-400">{p.주소}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <input ref={upAddrRef} className={lineInput} placeholder="상차지 주소" value={form.상차지주소 || ""} onChange={e => onChange("상차지주소", e.target.value)}/>
              <div className="grid grid-cols-2 gap-2">
                <input ref={upManRef} className={lineInput} placeholder="담당자" value={form.상차담당자 || ""} onChange={e => onChange("상차담당자", e.target.value)}/>
                <input ref={upTelRef} className={lineInput} placeholder="연락처" value={form.상차연락처 || ""} onChange={e => onChange("상차연락처", e.target.value)}/>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-400"/>
                <span className="text-[11px] font-semibold text-orange-500">하차지</span>
              </div>
              <div className="relative place-autocomplete">
                <input ref={downNameRef} className={lineInput} placeholder="하차지명" value={form.하차지명 || ""} onFocus={() => setActivePlaceType("하차")} onChange={(e) => { const v = e.target.value; onChange("하차지명", v); setActivePlaceType("하차"); if (!v.trim()) { onChange("하차지주소", ""); onChange("하차담당자", ""); onChange("하차연락처", ""); } }} onKeyDown={handlePlaceKeyDown}/>
                {activePlaceType === "하차" && filteredPlaces.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-sm text-[12px]">
                    {filteredPlaces.map((p, idx) => (
                      <li key={idx} onMouseDown={() => selectPlace(p)} onMouseEnter={() => setHighlightIndex(idx)}
                        className={"px-3 py-1.5 cursor-pointer " + (idx === highlightIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50")}>
                        <div className="font-medium">{p.지명}</div>
                        <div className="text-[10px] text-gray-400">{p.주소}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <input className={lineInput} placeholder="하차지 주소" value={form.하차지주소 || ""} onChange={e => onChange("하차지주소", e.target.value)}/>
              <div className="grid grid-cols-2 gap-2">
                <input className={lineInput} placeholder="담당자" value={form.하차담당자 || ""} onChange={e => onChange("하차담당자", e.target.value)}/>
                <input className={lineInput} placeholder="연락처" value={form.하차연락처 || ""} onChange={e => onChange("하차연락처", e.target.value)}/>
              </div>
            </div>
          </div>
        </section>

        {/* 화물 / 차량 */}
        <section className="py-5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">화물 / 차량</div>
          <div className="grid grid-cols-2 gap-5 mb-4">
            <input className={lineInput} placeholder="화물내용" value={form.화물내용 || ""} onChange={e => onChange("화물내용", e.target.value)}/>
            <input className={lineInput} placeholder="차량톤수 (예: 1톤 / 2.5톤)" value={form.차량톤수 || ""} onChange={e => onChange("차량톤수", e.target.value)}/>
          </div>
          <label className="text-[11px] text-gray-400 block mb-1.5">차량종류</label>
          <div className="flex flex-wrap gap-1.5">
            {VEHICLE_TYPES.map(v => (
              <button key={v} type="button" onClick={() => onChange("차량종류", form.차량종류 === v ? "" : v)}
                className={"px-3 py-1.5 text-[12px] font-medium rounded border transition " + (form.차량종류 === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200 hover:border-[#1B2B4B] hover:text-[#1B2B4B]")}>
                {v}
              </button>
            ))}
          </div>
        </section>

        {/* 작업 방식 */}
        <section className="py-5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">작업 방식</div>
          <div className="space-y-3">
            {[
              {label:"상차방법", field:"상차방법", opts:LOAD_TYPES},
              {label:"하차방법", field:"하차방법", opts:LOAD_TYPES},
              {label:"지급방식", field:"지급방식", opts:PAY_TYPES},
              {label:"배차방식", field:"배차방식", opts:DISPATCH_TYPES},
            ].map(({label, field, opts}) => (
              <div key={field} className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] text-gray-400 w-14 shrink-0">{label}</span>
                <div className="flex flex-wrap gap-1">
                  {opts.map(o => (
                    <button key={o} type="button" onClick={() => onChange(field, form[field] === o ? "" : o)}
                      className={"px-2.5 py-1 text-[11px] font-medium rounded border transition " + (form[field] === o ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]")}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 차량 / 기사 */}
        <section className="py-5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">차량 / 기사</div>
          <div className="grid grid-cols-3 gap-5">
            <input className={lineInput} placeholder="차량번호" value={form.차량번호 || ""} onChange={(e) => { const v = e.target.value; onChange("차량번호", v); if (!v.trim()) { onChange("기사명", ""); onChange("기사연락처", ""); } }} onBlur={checkDriverMatch} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); checkDriverMatch(); e.target.blur(); } }}/>
            <input className={lineInput + " bg-gray-50"} placeholder="기사명" value={form.기사명 || ""} readOnly/>
            <input className={lineInput + " bg-gray-50"} placeholder="기사 연락처" value={form.기사연락처 || ""} readOnly/>
          </div>
        </section>

        {/* 운임 정보 */}
        <section className="py-5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">운임 정보</div>
          {routeError && <div className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded px-3 py-1.5 mb-3">{routeError}</div>}
          {(fareResult.distanceKm !== null || fareResult.durationMin !== null) && (
            <div className="flex gap-4 text-[11px] text-gray-400 mb-3">
              {fareResult.distanceKm !== null && <span>거리 <strong className="text-gray-700">{fareResult.distanceKm} km</strong></span>}
              {fareResult.durationMin !== null && <span>소요 <strong className="text-gray-700">{fareResult.durationMin} 분</strong></span>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-5">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">청구운임</label>
              <input className={lineInput} placeholder="0" value={form.청구운임 || ""} onChange={e => onChange("청구운임", e.target.value)}/>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">기사운임</label>
              <input className={lineInput} placeholder="0" value={form.기사운임 || ""} onChange={e => onChange("기사운임", e.target.value)}/>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">수수료</label>
              <input className={lineInput} placeholder="0" value={form.수수료 || ""} onChange={e => onChange("수수료", e.target.value)}/>
            </div>
          </div>
        </section>

        {/* 메모 */}
        <section className="py-5">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">메모</div>
          <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-800 bg-gray-50 focus:outline-none focus:border-[#1B2B4B] focus:bg-white transition resize-none" rows={3} value={form.메모 || ""} onChange={e => onChange("메모", e.target.value)}/>
        </section>

        {/* 저장 */}
        <div className="py-5">
          <button onClick={doSave}
            className="w-full py-3 bg-[#1B2B4B] text-white text-[14px] font-semibold rounded-xl hover:bg-[#0f1e38] transition tracking-wide">
            저장
          </button>
        </div>
      </div>
    </form>
  );
}
function NewClientModal({ initialName, onClose, onSave }) {
  const [form, setForm] = useState({
    업체명: initialName || "",
    주소: "",
    담당자: "",
    담당자연락처: "",
    메모: "",
  });

  const change = (k, v) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="relative w-[420px] bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-base font-bold mb-5">
          신규 거래처 등록
        </h3>

        <div className="space-y-4">
          <input
            className="w-full border rounded-md px-3 py-2 text-sm bg-gray-100"
            value={form.업체명}
            readOnly
          />

          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="주소"
            value={form.주소}
            onChange={(e) => change("주소", e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="담당자명"
              value={form.담당자}
              onChange={(e) => change("담당자", e.target.value)}
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="담당자 연락처"
              value={form.담당자연락처}
              onChange={(e) =>
                change("담당자연락처", e.target.value)
              }
            />
          </div>

          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm"
            rows={3}
            placeholder="메모"
            value={form.메모}
            onChange={(e) => change("메모", e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
function NewDriverModal({ plate, onClose, onSave }) {

  const [form,setForm] = useState({
    차량번호: plate || "",
    이름:"",
    전화번호:"",
  });

  const change = (k,v)=>{
    setForm(prev=>({...prev,[k]:v}))
  }

  return (
<div className="fixed inset-0 z-50 flex items-center justify-center">

<div
className="absolute inset-0 bg-black/40"
onClick={onClose}
/>

<div className="relative w-[380px] bg-white rounded-xl shadow-lg p-6">

<h3 className="text-base font-bold mb-5">
신규 기사 등록
</h3>

<div className="space-y-4">

<input
className="w-full border rounded-md px-3 py-2 text-sm bg-gray-100"
value={form.차량번호}
readOnly
/>

<input
className="w-full border rounded-md px-3 py-2 text-sm"
placeholder="기사명"
value={form.이름}
onChange={(e)=>change("이름",e.target.value)}
/>

<input
className="w-full border rounded-md px-3 py-2 text-sm"
placeholder="연락처"
value={form.전화번호}
onChange={(e)=>change("전화번호",e.target.value)}
/>

</div>

<div className="flex justify-end gap-2 mt-6">

<button
onClick={onClose}
className="px-4 py-2 text-sm rounded-md border bg-gray-100"
>
취소
</button>

<button
onClick={()=>onSave(form)}
className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white"
>
등록
</button>

</div>

</div>
</div>
  );
}