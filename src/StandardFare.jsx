// ======================= src/StandardFare.jsx (PREMIUM UPGRADE) =======================
import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

// 차량종류 옵션
const VEHICLE_TYPES = [
  "전체",
  "다마스",
  "라보",
  "라보/다마스",
  "카고",
  "윙바디",
  "냉장탑",
  "냉동탑",
  "리프트",
  "오토바이",
];

// 문자열 정규화
const clean = (s) => String(s || "").replace(/\s+/g, "").trim().toLowerCase();

// ✅ 날짜 정규화: 어떤 타입이 와도 YYYY-MM-DD 로 변환
function toYMD(v) {
  if (!v) return "";

  // Firestore Timestamp (toDate 지원)
  if (v?.toDate && typeof v.toDate === "function") {
    const d = v.toDate();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  // Date
  if (v instanceof Date) {
    const d = new Date(v);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  // string
  const s = String(v).trim();
  if (!s) return "";

  // YYYY-MM-DD / YYYY-M-D / YYYY.MM.DD / YYYY/MM/DD
  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) {
    const yyyy = m1[1];
    const mm = String(m1[2]).padStart(2, "0");
    const dd = String(m1[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // MM-DD (4월부터 이런 식으로 저장된 데이터가 있으면 최신 판단이 3월로 깨짐)
  const m2 = s.match(/^(\d{1,2})[-./](\d{1,2})$/);
  if (m2) {
    const yyyy = String(new Date().getFullYear());
    const mm = String(m2[1]).padStart(2, "0");
    const dd = String(m2[2]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // 그 외: 파싱 시도
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  return s; // 마지막 폴백(그래도 값은 보여주기)
}

// 화물내용 숫자 추출
const extractCargoNumber = (text) => {
  const m = String(text).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

// =======================
// 📅 공휴일 / 특이일 판별
// =======================

const HOLIDAYS = [
  "2025-01-01",
  "2025-02-09", "2025-02-10", "2025-02-11",
  "2025-03-01",
  "2025-05-05",
  "2025-06-06",
  "2025-08-15",
  "2025-09-16", "2025-09-17", "2025-09-18",
  "2025-10-03",
  "2025-10-09",
  "2025-12-25",
];

function isHoliday(dateStr) {
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return HOLIDAYS.includes(d);
}


function isFriday(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).getDay() === 5;
}

function isSpecialDay(dateStr) {
  return isHoliday(dateStr) || isFriday(dateStr);
}
// =======================
// 💰 운임 레벨 판정
// =======================

function classifyFare(fare, avg, row) {
  if (!fare || !avg) return "UNKNOWN";

  const ratio = fare / avg;
  const holidayBoost = isSpecialDay(row?.상차일) ? 0.1 : 0;

  if (ratio <= 1.15 + holidayBoost) return "NORMAL"; // 표준
  if (ratio <= 1.3 + holidayBoost) return "TIGHT";   // 상승
  return "SPIKE";                                    // 프리미엄
}

// 톤수 추출
const extractTon = (text) => {
  const m = String(text).replace(/톤|t/gi, "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
// =======================
// 🚚 차량종류 그룹화
// =======================
function normalizeVehicleGroup(v = "") {
  if (/냉장|냉동/.test(v)) return "COLD";     // 냉장/냉동
  if (/오토바이/.test(v)) return "BIKE";     // 오토바이
  if (/카고|윙/.test(v)) return "TRUCK";     // 카고/윙
  return "ETC";
}

// =======================
// ⚖️ 톤수 구간
// =======================
function tonBucket(ton) {
  if (ton == null) return null;
  if (ton <= 1) return "≤1T";
  if (ton <= 2) return "1~2T";
  if (ton <= 3) return "2~3T";
  return "3T+";
}
// =======================
// 🚫 경유지 판별
// =======================
function isTransitStop(r) {
  const name = r.하차지명 || "";
  const addr = r.하차지주소 || "";

  // 숫자. 으로 시작하거나, 여러 지역이 나열된 경우
  return (
    /^\d+\./.test(name) ||
    /^\d+\./.test(addr) ||
    name.includes("경유") ||
    addr.includes("경유")
  );
}

function calcImplicitFare(dispatchData, {
  client,
  vehicle,
  ton,
}) {
  const TON_GAP = 0.5;

  const rows = dispatchData.filter(r => {
    if (!r.거래처명 || !r.청구운임) return false;
    if (r.거래처명 !== client) return false;
    if (vehicle && r.차량종류 !== vehicle) return false;

    const rowTon = extractTon(r.차량톤수);
    return rowTon && Math.abs(rowTon - ton) <= TON_GAP;
  });

  if (rows.length < 3) return null;

  const fares = rows.map(r =>
    Number(String(r.청구운임).replace(/[^\d]/g, ""))
  );

  const avg = Math.round(fares.reduce((a, b) => a + b, 0) / fares.length);

  return {
    avg,
    min: Math.min(...fares),
    max: Math.max(...fares),
    count: rows.length,
  };
}

export default function StandardFare() {
  const [dispatchData, setDispatchData] = useState([]);
  const [sortKey, setSortKey] = useState("date_desc");

  // 검색 입력값
  const [pickup, setPickup] = useState(localStorage.getItem("sf_pickup") || "");
  const [drop, setDrop] = useState(localStorage.getItem("sf_drop") || "");
  const [cargo, setCargo] = useState(localStorage.getItem("sf_cargo") || "");
  const [ton, setTon] = useState(localStorage.getItem("sf_ton") || "");
  const [vehicle, setVehicle] = useState(localStorage.getItem("sf_vehicle") || "전체");

  // 신규 추가 필터
const [pickupAddr, setPickupAddr] = useState(localStorage.getItem("sf_pickupAddr") || "");
const [dropAddr, setDropAddr] = useState(localStorage.getItem("sf_dropAddr") || "");
const [client, setClient] = useState(localStorage.getItem("sf_client") || "전체");

  // 결과
  const [result, setResult] = useState([]);
  const [aiFare, setAiFare] = useState(null);
const implicitFare = React.useMemo(() => {
  const tonNum = extractTon(ton);
  if (!client || !vehicle || !tonNum) return null;

  return calcImplicitFare(dispatchData, {
    client,
    vehicle,
    ton: tonNum,
  });
}, [client, vehicle, ton, dispatchData]);

  // Firestore 실시간 구독
useEffect(() => {
  const unsub = onSnapshot(collection(db, "dispatch"), (snap) => {
    const arr = snap.docs.map((d) => {
      const data = d.data();
      return {
        _id: d.id,
        ...data,

        // ✅ 날짜 필드 무조건 문자열(YYYY-MM-DD)로 통일
        등록일: toYMD(data.등록일),
        상차일: toYMD(data.상차일),
        하차일: toYMD(data.하차일),
      };
    });

    setDispatchData(arr);
  });

  return () => unsub();
}, []);
  // 입력값 localStorage 저장
  useEffect(() => {
    localStorage.setItem("sf_pickup", pickup);
    localStorage.setItem("sf_drop", drop);
    localStorage.setItem("sf_cargo", cargo);
    localStorage.setItem("sf_ton", ton);
    localStorage.setItem("sf_vehicle", vehicle);
  }, [pickup, drop, cargo, ton, vehicle]);
  // 🔥 주소 + 거래처 저장
useEffect(() => {
  localStorage.setItem("sf_pickupAddr", pickupAddr);
  localStorage.setItem("sf_dropAddr", dropAddr);
  localStorage.setItem("sf_client", client);
}, [pickupAddr, dropAddr, client]);

  // AI 추천 운임 계산
  const calcAiFare = (rows) => {
  if (!rows.length) return null;

  const fares = rows
    .map(r => Number(String(r.청구운임 || 0).replace(/[^\d]/g, "")))
    .filter(n => n > 0);

  if (!fares.length) return null;

  const avg = Math.round(fares.reduce((a, b) => a + b, 0) / fares.length);
  const min = Math.min(...fares);
  const max = Math.max(...fares);

const latest = rows
  .slice()
  .sort((a, b) => (toYMD(b.상차일) || "").localeCompare(toYMD(a.상차일) || ""))[0];

  const latestFare = Number(
    String(latest?.청구운임 || 0).replace(/[^\d]/g, "")
  );

  const latestLevel = classifyFare(latestFare, avg, latest);

  let aiValue = avg;
  let message = "";

  if (latestLevel === "SPIKE") {
    aiValue = avg;
    message =
      "최근 운임은 연휴·수배 지연으로 일시적으로 상승한 프리미엄 운임입니다. " +
      "표준 운임 기준으로 견적을 산정하는 것을 권장합니다.";
  } else if (latestLevel === "TIGHT") {
    aiValue = Math.round(avg * 0.6 + latestFare * 0.4);
    message =
      "현재 차량 수급이 다소 빡빡한 구간입니다. " +
      "표준 운임 대비 소폭 상향 견적이 적정합니다.";
  } else {
    aiValue = Math.round(avg * 0.5 + latestFare * 0.5);
    message =
      "최근 운임 흐름이 안정적입니다. " +
      "표준 운임 기준 견적을 사용하셔도 무리가 없습니다.";
  }

  const confidence = Math.min(95, 60 + rows.length * 5);

  return {
    avg,
    min,
    max,
    latestFare,
    aiValue,
    confidence,
    message,
  };
};


  // 검색 실행
const search = () => {
  // 상차 조건 검사 (명칭 또는 주소 둘 중 하나만 있어도 통과)
  if (!pickup.trim() && !pickupAddr.trim()) {
    alert("상차지명 또는 상차지 주소 중 하나는 반드시 입력해야 합니다.");
    return;
  }
  

  // 하차 조건 검사 (명칭 또는 주소 둘 중 하나만 있어도 통과)
  if (!drop.trim() && !dropAddr.trim()) {
    alert("하차지명 또는 하차지 주소 중 하나는 반드시 입력해야 합니다.");
    return;
  }

    let list = [...dispatchData];

  // ✅ 상차지 OR 조건 (이름 + 주소 + 둘 다 허용)
  list = list.filter((r) => {
    const name = clean(r.상차지명 || "");
    const addr = clean(r.상차지주소 || "");
    const p = clean(pickup);
    const pa = clean(pickupAddr);

    // 아무 것도 안 넣으면 통과 (위에서 이미 최소 1개 입력 체크했음)
    if (!p && !pa) return true;

    return (
      (p && (name.includes(p) || addr.includes(p))) ||
      (pa && (name.includes(pa) || addr.includes(pa)))
    );
  });

  // ✅ 하차지 OR 조건 (이름 + 주소 + 둘 다 허용)
  list = list.filter((r) => {
    const name = clean(r.하차지명 || "");
    const addr = clean(r.하차지주소 || "");
    const d = clean(drop);
    const da = clean(dropAddr);

    if (!d && !da) return true;

    return (
      (d && (name.includes(d) || addr.includes(d))) ||
      (da && (name.includes(da) || addr.includes(da)))
    );
  });


    // 화물내용
    if (cargo.trim()) {
  const cargoNum = extractCargoNumber(cargo); // 입력된 숫자
  const cargoText = clean(cargo);             // 입력된 텍스트

  list = list.filter((r) => {
    const rowNum = extractCargoNumber(r.화물내용);   // 실제 row 숫자
    const rowText = clean(r.화물내용);              // 실제 row 텍스트

    // 1) 숫자를 입력한 경우 → 정확한 숫자 일치만 허용
    if (cargoNum !== null) {
      return rowNum === cargoNum;
    }

    // 2) 숫자 없이 문자만 입력한 경우 → 텍스트 포함 검색
    return rowText.includes(cargoText);
  });
}


    // 톤수
    if (ton.trim()) {
      const tonNum = extractTon(ton);
      list = list.filter((r) => {
        const rowTon = extractTon(r.차량톤수);
        return rowTon && Math.abs(rowTon - tonNum) <= 0.7;
      });
    }
    

    // 차량종류
   // 차량종류 (냉장/냉동 묶음)
if (vehicle !== "전체") {
  const vg = normalizeVehicleGroup(vehicle);
  list = list.filter(
    (r) => normalizeVehicleGroup(r.차량종류) === vg
  );
}

    // 신규 추가: 거래처명 필터
    if (client !== "전체") {
      list = list.filter((r) => clean(r.거래처명) === clean(client));
    }

// =======================
// 평균 운임 계산 (조건 동일 집단 기준)
// =======================

// 기준값 (현재 검색 조건 기준)
const 기준차량그룹 =
  vehicle === "전체" ? null : normalizeVehicleGroup(vehicle);
const 기준파렛트 = cargo ? extractCargoNumber(cargo) : null;

// 🔹 1단계: 비교 가능한 집단만 추림
const baseGroup = list.filter(r => {
  return (
    !isTransitStop(r) &&               // 🔥 경유지 제외
    (!기준차량그룹 ||
      normalizeVehicleGroup(r.차량종류) === 기준차량그룹) &&
    (!기준파렛트 ||
      extractCargoNumber(r.화물내용) === 기준파렛트)
  );
});



// 🔹 2단계: 1차 평균
const rawFares = baseGroup
  .map(r => Number(String(r.청구운임 || 0).replace(/[^\d]/g, "")))
  .filter(n => n > 0);

const roughAvg =
  rawFares.length > 0
    ? rawFares.reduce((a, b) => a + b, 0) / rawFares.length
    : null;

// 🔹 3단계: 프리미엄 제외 평균
const normalFares = baseGroup
  .filter(r => {
    if (!roughAvg) return false;
    const fare = Number(String(r.청구운임 || 0).replace(/[^\d]/g, ""));
    return classifyFare(fare, roughAvg, r) !== "SPIKE";
  })
  .map(r => Number(String(r.청구운임 || 0).replace(/[^\d]/g, "")));

const avgFare =
  normalFares.length > 0
    ? Math.round(normalFares.reduce((a, b) => a + b, 0) / normalFares.length)
    : null;
// 🔹 4단계: 운임 레벨 주입 (전체 결과에 적용)
const withFareLevel = list.map(r => {
  const fare = Number(String(r.청구운임 || 0).replace(/[^\d]/g, ""));
  return {
    ...r,
    fareLevel: avgFare
      ? classifyFare(fare, avgFare, r)
      : "UNKNOWN",
  };
});
const levelRank = {
  NORMAL: 1,
  TIGHT: 2,
  SPIKE: 3,
};

withFareLevel.sort((a, b) => {
  switch (sortKey) {
case "date_desc":
  return (toYMD(b.상차일) || "").localeCompare(toYMD(a.상차일) || "");
case "date_asc":
  return (toYMD(a.상차일) || "").localeCompare(toYMD(b.상차일) || "");


    // 🔥 화물내용 순 (숫자 우선)
    case "cargo_asc": {
      const an = extractCargoNumber(a.화물내용);
      const bn = extractCargoNumber(b.화물내용);

      if (an != null && bn != null) return an - bn;
      if (an != null) return -1;
      if (bn != null) return 1;

      return (a.화물내용 || "").localeCompare(b.화물내용 || "");
    }

    // 🔥 차량종류 순 (그룹 기준)
    case "vehicle_asc": {
      const ag = normalizeVehicleGroup(a.차량종류);
      const bg = normalizeVehicleGroup(b.차량종류);

      if (ag !== bg) return ag.localeCompare(bg);
      return (a.차량종류 || "").localeCompare(b.차량종류 || "");
    }

    case "fare_asc":
      return Number(a.청구운임 || 0) - Number(b.청구운임 || 0);

    case "fare_desc":
      return Number(b.청구운임 || 0) - Number(a.청구운임 || 0);

    case "driver_desc":
      return Number(b.기사운임 || 0) - Number(a.기사운임 || 0);

    case "fee_desc":
      return Number(b.수수료 || 0) - Number(a.수수료 || 0);

    case "level":
      return levelRank[a.fareLevel] - levelRank[b.fareLevel];

    case "level_spike":
      return levelRank[b.fareLevel] - levelRank[a.fareLevel];

    default:
      return 0;
  }
});
setResult(withFareLevel);
setAiFare(calcAiFare(baseGroup));

    if (list.length === 0) alert("조회된 데이터가 없습니다.");
  };

  // 초기화
  const reset = () => {
    setPickup("");
    setDrop("");
    setCargo("");
    setTon("");
    setVehicle("전체");
    setPickupAddr("");
    setDropAddr("");
    setClient("전체");
    setResult([]);
    setAiFare(null);

    localStorage.removeItem("sf_pickup");
    localStorage.removeItem("sf_drop");
    localStorage.removeItem("sf_cargo");
    localStorage.removeItem("sf_ton");
    localStorage.removeItem("sf_vehicle");
    localStorage.removeItem("sf_pickupAddr");
localStorage.removeItem("sf_dropAddr");
localStorage.removeItem("sf_client");
  };

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">📘 표준 운임표 (Premium UI)</h2>

      {/* 검색 카드 */}
      <div className="bg-white p-6 border rounded-2xl shadow-lg mb-6">
        
        {/* 1줄차 입력 */}
        <div className="grid grid-cols-6 gap-4 mb-4">

          <div>
            <label className="text-sm text-gray-600 font-medium">상차지 *</label>
            <input
              className="border p-2 rounded-lg w-full shadow"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">상차지 주소</label>
            <input
              className="border p-2 rounded-lg w-full shadow"
              value={pickupAddr}
              onChange={(e) => setPickupAddr(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">하차지 *</label>
            <input
              className="border p-2 rounded-lg w-full shadow"
              value={drop}
              onChange={(e) => setDrop(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">하차지 주소</label>
            <input
              className="border p-2 rounded-lg w-full shadow"
              value={dropAddr}
              onChange={(e) => setDropAddr(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">거래처</label>
            <select
              className="border p-2 rounded-lg w-full shadow"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="전체">전체</option>
              {[...new Set(dispatchData.map((r) => r.거래처명).filter(Boolean))].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">차량종류</label>
            <select
              className="border p-2 rounded-lg w-full shadow"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* 2줄차 입력 */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-gray-600 font-medium">화물내용</label>
            <input
              className="border p-2 rounded-lg w-full shadow"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
            <div>
  <label className="text-sm text-gray-600 font-medium">정렬방식</label>
  <select
    className="border p-2 rounded-lg w-full shadow"
    value={sortKey}
    onChange={(e) => setSortKey(e.target.value)}
  >
  <option value="date_desc">상차일 최신순</option>
  <option value="date_asc">상차일 오래된순</option>

  <option value="cargo_asc">화물내용 순 (숫자)</option>
  <option value="vehicle_asc">차량종류 순</option>

  <option value="fare_desc">청구운임 높은순</option>
  <option value="fare_asc">청구운임 낮은순</option>

  <option value="level">운임레벨 (표준 → 상승 → 프리미엄)</option>
  <option value="level_spike">운임레벨 (프리미엄 우선)</option>

  <option value="driver_desc">기사운임 높은순</option>
  <option value="fee_desc">수수료 높은순</option>
  </select>
</div>

          </div>

          <div>
            <label className="text-sm text-gray-600 font-medium">차량톤수</label>
            <input
              className="border p-2 rounded-lg w-full shadow"
              value={ton}
              onChange={(e) => setTon(e.target.value)}
            />
          </div>

          <div className="flex items-end gap-3">
            <button
              className="bg-blue-600 text-white px-5 py-2 rounded-lg shadow font-semibold"
              onClick={search}
            >
              🔍 조회
            </button>

            <button
              className="bg-gray-500 text-white px-5 py-2 rounded-lg shadow font-semibold"
              onClick={reset}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {/* 검색 결과 요약 */}
      {result.length > 0 && (
        <div className="p-3 bg-blue-100 border border-blue-300 rounded-lg mb-5 text-gray-800">
          총 <b>{result.length}</b> 건의 과거 데이터를 찾았습니다.
        </div>
      )}

      {/* AI 추천 박스 */}
      {aiFare && (
  <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-300 shadow mb-6">
    <h3 className="text-xl font-bold mb-2 text-yellow-700">
      🤖 AI 추천운임
    </h3>

    <div className="mb-4 text-sm text-gray-700 leading-relaxed">
      {aiFare.message}
    </div>

    <p>평균 운임: <b>{aiFare.avg.toLocaleString()}</b> 원</p>
    <p>최소~최대: <b>{aiFare.min.toLocaleString()} ~ {aiFare.max.toLocaleString()}</b> 원</p>
    <p>최근 동일구간: <b>{aiFare.latestFare.toLocaleString()}</b> 원</p>

    <div className="mt-4 p-4 bg-white border rounded shadow">
      <div className="text-2xl text-yellow-700 font-bold mb-1">
        📌 {aiFare.aiValue.toLocaleString()} 원
      </div>
      <div className="text-gray-600">
        신뢰도: <b>{aiFare.confidence}%</b>
      </div>
    </div>
  </div>
)}


      {/* 결과 테이블 */}
<div className="overflow-auto border rounded-xl shadow-lg">
  <table className="min-w-[1500px] text-sm border">
    <thead className="bg-gray-200">
      <tr>
        {[
          "상차일",
          "상차지명",
          "상차지주소",
          "하차지명",
          "하차지주소",
          "화물내용",
          "차량종류",
          "차량톤수",
          "청구운임",
          "운임레벨",
          "기사운임",
          "수수료",
          "메모",
        ].map((t) => (
          <th
            key={t}
            className="border px-3 py-2 text-center font-semibold text-gray-700"
          >
            {t}
          </th>
        ))}
      </tr>
    </thead>

    <tbody>
      {result.length === 0 ? (
        <tr>
          <td colSpan={12} className="py-6 text-center text-gray-500">
            데이터가 없습니다.
          </td>
        </tr>
      ) : (
        result.map((r) => (
          <tr key={r._id} className="odd:bg-white even:bg-gray-50">
            <td className="border px-3 py-2 text-center">{r.상차일}</td>
            <td className="border px-3 py-2">{r.상차지명}</td>
            <td className="border px-3 py-2">{r.상차지주소}</td>
            <td className="border px-3 py-2">{r.하차지명}</td>
            <td className="border px-3 py-2">{r.하차지주소}</td>
            <td className="border px-3 py-2">{r.화물내용}</td>
            <td className="border px-3 py-2">{r.차량종류}</td>
            <td className="border px-3 py-2">{r.차량톤수}</td>
            <td className="border px-3 py-2 text-right">
              {Number(r.청구운임 || 0).toLocaleString()}
            </td>
            <td className="border px-3 py-2 text-center font-semibold">
  {r.fareLevel === "NORMAL" && "표준"}
  {r.fareLevel === "TIGHT" && <span className="text-orange-600">▲ 상승</span>}
  {r.fareLevel === "SPIKE" && <span className="text-red-600">⚠ 프리미엄</span>}
</td>

            <td className="border px-3 py-2 text-right">
              {Number(r.기사운임 || 0).toLocaleString()}
            </td>
            <td className="border px-3 py-2 text-right">
              {Number(r.수수료 || 0).toLocaleString()}
            </td>
            <td className="border px-3 py-2">{r.메모}</td>
          </tr>
        ))
      )}
    </tbody>
  </table>
</div>

    </div>
  );
}
