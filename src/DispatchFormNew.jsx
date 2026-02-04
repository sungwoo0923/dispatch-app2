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
const DISPATCH_TYPES = ["24시", "직접배차", "인성","24시(외주업체)"];
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

export default function DispatchFormNew({
  form,
  onChange,
  doSave,
  placeRows = [],   // ⭐ 추가
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
    <div className="grid grid-cols-[1fr_minmax(420px,520px)] gap-10">
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

      {/* ================= LEFT : 입력 ================= */}
      <div className="space-y-12">

        {/* ================= 거래 / 날짜 ================= */}
<section className="pl-6 py-5 border-l-4 border-blue-200">
  <h3 className="text-base font-bold mb-6">오더 정보</h3>

  <div className="grid grid-cols-3 gap-8 max-w-[760px]">

    {/* ===== 거래처명 ===== */}
    <div className="relative place-autocomplete">
      {/* 라벨 + 신규 버튼 */}
      <div className="flex items-center justify-between h-6 mb-1">
        <span className="text-xs text-gray-500">거래처명</span>

        {/* 🔥 신규 거래처 버튼 (기존에 없을 때만) */}
        {isNewClient && (
          <button
            type="button"
            onClick={() => setShowNewClientModal(true)}
            className="
              px-2 py-0.5
              text-xs
              rounded-md
              border
              border-blue-400
              text-blue-600
              bg-blue-50
              hover:bg-blue-100
            "
          >
            신규
          </button>
        )}
      </div>

      <input
        className={lineInput}
        value={form.거래처명 || ""}
        onFocus={() => setActivePlaceType("거래처")}
        onChange={(e) => {
          onChange("거래처명", e.target.value);
          setActivePlaceType("거래처");
        }}
        onKeyDown={handlePlaceKeyDown}
      />

      {/* 🔽 거래처 드롭다운 */}
      {activePlaceType === "거래처" && filteredPlaces.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow">
          {filteredPlaces.map((p, idx) => (
            <li
              key={idx}
              onMouseDown={() => selectPlace(p)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={
                "px-3 py-2 text-sm cursor-pointer " +
                (idx === highlightIndex
                  ? "bg-blue-100"
                  : "hover:bg-blue-50")
              }
            >
              {p.거래처명}
            </li>
          ))}
        </ul>
      )}
    </div>
    {/* ===== 상차일 ===== */}
    <div>
      {/* 1줄: 라벨 + 버튼 */}
      <div className="flex items-center justify-between h-6 mb-1">
        <span className="text-xs text-gray-500">상차일</span>
        <div className="flex gap-1">
          <button
            type="button"
            className={`${dateQuickBtnBase} ${
              pickupQuick === "today" ? dateQuickBtnActive : dateQuickBtnInactive
            }`}
            onClick={() => {
              onChange("상차일", getToday());
              setPickupQuick("today");
            }}
          >
            당일
          </button>
          <button
            type="button"
            className={`${dateQuickBtnBase} ${
              pickupQuick === "tomorrow" ? dateQuickBtnActive : dateQuickBtnInactive
            }`}
            onClick={() => {
              onChange("상차일", getTomorrow());
              setPickupQuick("tomorrow");
            }}
          >
            내일
          </button>
          <button
            type="button"
            className={`${dateQuickBtnBase} ${
              pickupQuick === "monday" ? dateQuickBtnActive : dateQuickBtnInactive
            }`}
            onClick={() => {
              onChange("상차일", getNextMonday());
              setPickupQuick("monday");
            }}
          >
            월상
          </button>
        </div>
      </div>

      {/* 2줄: input */}
      <input
        type="date"
        className={lineInput}
        value={form.상차일 || ""}
        onChange={(e) => {
          onChange("상차일", e.target.value);
          setPickupQuick(null);
        }}
      />
    </div>

    {/* ===== 하차일 (상차일과 구조 100% 동일) ===== */}
    <div>
      <div className="flex items-center justify-between h-6 mb-1">
        <span className="text-xs text-gray-500">하차일</span>
        <div className="flex gap-1">
          <button
            type="button"
            className={`${dateQuickBtnBase} ${
              dropQuick === "today" ? dateQuickBtnActive : dateQuickBtnInactive
            }`}
            onClick={() => {
              onChange("하차일", getToday());
              setDropQuick("today");
            }}
          >
            당일
          </button>
          <button
            type="button"
            className={`${dateQuickBtnBase} ${
              dropQuick === "tomorrow" ? dateQuickBtnActive : dateQuickBtnInactive
            }`}
            onClick={() => {
              onChange("하차일", getTomorrow());
              setDropQuick("tomorrow");
            }}
          >
            내일
          </button>
          <button
            type="button"
            className={`${dateQuickBtnBase} ${
              dropQuick === "monday" ? dateQuickBtnActive : dateQuickBtnInactive
            }`}
            onClick={() => {
              onChange("하차일", getNextMonday());
              setDropQuick("monday");
            }}
          >
            월착
          </button>
        </div>
      </div>

      <input
        type="date"
        className={lineInput}
        value={form.하차일 || ""}
        onChange={(e) => {
          onChange("하차일", e.target.value);
          setDropQuick(null);
        }}
      />
    </div>

  </div>
</section>

        {/* ================= 상/하차 ================= */}
        <section className="pl-6 py-5 border-l-4 border-blue-200">
          <h3 className="flex items-center gap-2 text-base font-bold mb-4">
  <span>
    상 · 하차 정보 <span className="text-red-500">*</span>
  </span>

  {/* 🔄 초기화 */}
  <button
    type="button"
    onClick={handleResetAll}
    tabIndex={-1}
    className="
      flex items-center gap-1
      px-2 py-1
      text-xs font-normal
      text-gray-500
      border border-gray-200
      rounded
      hover:bg-gray-100
      hover:text-gray-700
      transition
    "
  >
    🔄 초기화
  </button>

  {/* 🔁 상/하차 바꾸기 */}
  <button
    type="button"
    onClick={handleSwapPickupDrop}
    tabIndex={-1}
    className="
      flex items-center gap-1
      px-2 py-1
      text-xs font-normal
      text-blue-600
      border border-blue-300
      rounded
      bg-blue-50
      hover:bg-blue-100
      transition
    "
  >
    🔁 상·하차 바꾸기
  </button>
</h3>


          <div className="grid grid-cols-2 gap-10 max-w-[760px]">

            {/* ================= 상차 ================= */}
<div className="space-y-5">
  <div className="relative">
    <input
      ref={upNameRef}
      className={lineInput}
      placeholder="상차지명"
      value={form.상차지명 || ""}
      onFocus={() => setActivePlaceType("상차")}
      onChange={(e) => {
        const v = e.target.value;
        onChange("상차지명", v);
        setActivePlaceType("상차");

        if (!v.trim()) {
          onChange("상차지주소", "");
          onChange("상차담당자", "");
          onChange("상차연락처", "");
        }
      }}
      onKeyDown={(e) => {
        // 🔹 자동완성 방향키 / Enter
        handlePlaceKeyDown(e);

        // 🔹 TAB 이동 로직
        if (e.key !== "Tab") return;

        const emptyTargets = [
          { v: form.상차지주소, ref: upAddrRef },
          { v: form.상차담당자, ref: upManRef },
          { v: form.상차연락처, ref: upTelRef },
        ].filter(x => !x.v?.trim());

        e.preventDefault();

        if (emptyTargets.length > 0) {
          emptyTargets[0].ref.current?.focus();
        } else {
          downNameRef.current?.focus();
        }
      }}
    />

    {activePlaceType === "상차" && filteredPlaces.length > 0 && (
      <ul className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow">
        {filteredPlaces.map((p, idx) => (
          <li
            key={idx}
            onMouseDown={() => selectPlace(p)}
            onMouseEnter={() => setHighlightIndex(idx)}
            className={
              "px-3 py-2 text-sm cursor-pointer " +
              (idx === highlightIndex
                ? "bg-blue-100"
                : "hover:bg-blue-50")
            }
          >
            <div className="font-medium text-gray-900">{p.지명}</div>
            <div className="text-xs text-gray-500">{p.주소}</div>
          </li>
        ))}
      </ul>
    )}
  </div>

  <input
    ref={upAddrRef}
    className={lineInput}
    placeholder="상차지 주소"
    value={form.상차지주소 || ""}
    onChange={(e) => onChange("상차지주소", e.target.value)}
  />

  <div className="grid grid-cols-2 gap-4">
    <input
      ref={upManRef}
      className={lineInput}
      placeholder="상차 담당자"
      value={form.상차담당자 || ""}
      onChange={(e) => onChange("상차담당자", e.target.value)}
    />
    <input
      ref={upTelRef}
      className={lineInput}
      placeholder="상차 연락처"
      value={form.상차연락처 || ""}
      onChange={(e) => onChange("상차연락처", e.target.value)}
    />
  </div>
</div>
            {/* ================= 하차 ================= */}
<div className="space-y-5">
  <div className="relative">
    <input
      ref={downNameRef}
      className={lineInput}
      placeholder="하차지명"
      value={form.하차지명 || ""}
      onFocus={() => setActivePlaceType("하차")}
      onChange={(e) => {
        const v = e.target.value;
        onChange("하차지명", v);
        setActivePlaceType("하차");

        if (!v.trim()) {
          onChange("하차지주소", "");
          onChange("하차담당자", "");
          onChange("하차연락처", "");
        }
      }}
      onKeyDown={handlePlaceKeyDown}
    />

    {activePlaceType === "하차" && filteredPlaces.length > 0 && (
      <ul className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow">
        {filteredPlaces.map((p, idx) => (
          <li
            key={idx}
            onMouseDown={() => selectPlace(p)}
            onMouseEnter={() => setHighlightIndex(idx)}
            className={
              "px-3 py-2 text-sm cursor-pointer " +
              (idx === highlightIndex
                ? "bg-blue-100"
                : "hover:bg-blue-50")
            }
          >
            <div className="font-medium text-gray-900">{p.지명}</div>
            <div className="text-xs text-gray-500">{p.주소}</div>
          </li>
        ))}
      </ul>
    )}
  </div>

  <input
    className={lineInput}
    placeholder="하차지 주소"
    value={form.하차지주소 || ""}
    onChange={(e) => onChange("하차지주소", e.target.value)}
  />

  <div className="grid grid-cols-2 gap-4">
    <input
      className={lineInput}
      placeholder="하차 담당자"
      value={form.하차담당자 || ""}
      onChange={(e) => onChange("하차담당자", e.target.value)}
    />
    <input
      className={lineInput}
      placeholder="하차 연락처"
      value={form.하차연락처 || ""}
      onChange={(e) => onChange("하차연락처", e.target.value)}
    />
  </div>
</div>
          </div>
        </section>
        {/* ================= 화물 / 차량 ================= */}
        <section className="pl-6 py-5 border-l-4 border-blue-200">
          <h3 className="text-base font-bold mb-6">
            화물 · 차량 정보
          </h3>

          <div className="grid grid-cols-3 gap-8 max-w-[760px]">
            <input
              className={lineInput}
              placeholder="화물내용"
              value={form.화물내용 || ""}
              onChange={(e) => onChange("화물내용", e.target.value)}
            />

            <input
              className={lineInput}
              placeholder="차량톤수 (예: 1톤 / 2.5톤)"
              value={form.차량톤수 || ""}
              onChange={(e) => onChange("차량톤수", e.target.value)}
            />

            <select
              className={select}
              value={form.차량종류 || ""}
              onChange={(e) => onChange("차량종류", e.target.value)}
            >
              <option value="">차량종류 선택</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ================= 상/하차 방법 ================= */}
        <section className="pl-6 py-5 border-l-4 border-blue-200">
          <h3 className="text-base font-bold mb-6">
            작업 방식
          </h3>


          <div className="grid grid-cols-4 gap-6 max-w-[760px]">
            <select
              className={select}
              value={form.상차방법 || ""}
              onChange={(e) => onChange("상차방법", e.target.value)}
            >
              <option value="">상차방법</option>
              {LOAD_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>

            <select
              className={select}
              value={form.하차방법 || ""}
              onChange={(e) => onChange("하차방법", e.target.value)}
            >
              <option value="">하차방법</option>
              {LOAD_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>

            <select
              className={select}
              value={form.지급방식 || ""}
              onChange={(e) => onChange("지급방식", e.target.value)}
            >
              <option value="">지급방식</option>
              {PAY_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>

            <select
              className={select}
              value={form.배차방식 || ""}
              onChange={(e) => onChange("배차방식", e.target.value)}
            >
              <option value="">배차방식</option>
              {DISPATCH_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </section>
{/* ================= 차량 정보 ================= */}
<section className="pl-6 py-5 border-l-4 border-blue-200">
  <h3 className="text-base font-bold mb-6">
    차량 정보
  </h3>

  <div className="grid grid-cols-3 gap-8 max-w-[760px]">
    <input
      className={lineInput}
      placeholder="차량번호"
      value={form.차량번호 || ""}
      onChange={(e) => onChange("차량번호", e.target.value)}
    />

    <input
      className={lineInput}
      placeholder="기사명"
      value={form.기사명 || ""}
      onChange={(e) => onChange("기사명", e.target.value)}
    />

    <input
      className={lineInput}
      placeholder="기사 연락처"
      value={form.기사연락처 || ""}
      onChange={(e) => onChange("기사연락처", e.target.value)}
    />
  </div>
</section>
{/* ================= 운임 정보 ================= */}
<section className="pl-6 py-5 border-l-4 border-blue-200">
  <h3 className="text-base font-bold mb-6">
    운임 정보
  </h3>

  <div className="grid grid-cols-3 gap-8 max-w-[760px]">
    <input
      className={lineInput}
      placeholder="청구운임"
      value={form.청구운임 || ""}
      onChange={(e) => onChange("청구운임", e.target.value)}
    />

    <input
      className={lineInput}
      placeholder="기사운임"
      value={form.기사운임 || ""}
      onChange={(e) => onChange("기사운임", e.target.value)}
    />

    <input
      className={lineInput}
      placeholder="수수료"
      value={form.수수료 || ""}
      onChange={(e) => onChange("수수료", e.target.value)}
    />
  </div>
</section>

        {/* ================= 메모 ================= */}
        <section>
          <h3 className="text-base font-bold mb-4">
            메모
          </h3>

          <div className="max-w-[760px]">
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-600"
              rows={4}
              value={form.메모 || ""}
              onChange={(e) => onChange("메모", e.target.value)}
            />
          </div>
        </section>

        {/* ================= 저장 ================= */}
        <div>
          <button
            onClick={doSave}
            className="px-12 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </div>

      {/* ================= RIGHT : 요약 ================= */}
<aside className="sticky top-[120px] h-fit">
  <div className="border rounded-2xl p-6 bg-white shadow-sm space-y-6">

    {/* 제목 */}
    <div className="flex items-center justify-between">
      <h4 className="text-lg font-bold text-gray-900">예상 운임료</h4>
      <button
        type="button"
        className="text-sm text-blue-600 hover:underline"
      >
        초기화
      </button>
    </div>
{routeError && (
  <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">
    {routeError}
  </div>
)}
    {/* 기본 정보 */}
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-gray-500">
        <span>총거리(예상)</span>
        <span>
{fareResult.distanceKm !== null
  ? `${fareResult.distanceKm} km`
  : "-"}
</span>
      </div>
      <div className="flex justify-between text-gray-500">
        <span>소요시간(예상)</span>
        <span>
{fareResult.durationMin !== null
  ? `${fareResult.durationMin} 분`
  : "-"}
</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">차량</span>
        <span className="font-bold text-gray-900">
          {form.차량종류 || "-"}
        </span>
      </div>
    </div>

    {/* 옵션 버튼 (1번째 이미지 느낌) */}
    <div className="flex gap-2 flex-wrap">
      {["주간", "평일", "일반", "편도"].map((v) => (
        <button
          key={v}
          type="button"
          className="px-3 py-1.5 rounded-full border text-xs font-semibold
                     border-blue-500 text-blue-600 bg-blue-50"
        >
          {v}
        </button>
      ))}
    </div>

    {/* 운임 정보 */}
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-gray-600">
        <span>기본 운임</span>
        <span>{fareResult.baseFare.toLocaleString()}원</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>추가 운임</span>
        <span>0원</span>
      </div>
    </div>

    {/* 실시간 예상 운임 */}
    <div className="border-t pt-4">
      <div className="text-sm text-gray-500 mb-1">
        실시간 예상 운임
      </div>
      <div className="text-3xl font-extrabold text-blue-600">
        {fareResult.baseFare.toLocaleString()}원
      </div>
    </div>

    {/* CTA 버튼 */}
    <button
  type="button"
  onClick={handleFareLookup}
  className="w-full mt-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
>
  운임 조회
</button>
  </div>
</aside>

    </div>
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
