// ======================= src/StandardFare.jsx =======================
import React, { useState, useEffect, useRef, useMemo } from "react";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

const VEHICLE_TYPES = [
  "전체","다마스","라보","라보/다마스","카고","윙바디",
  "냉장탑","냉동탑","리프트","오토바이",
];

const clean = (s) => String(s || "").replace(/\s+/g, "").trim().toLowerCase();

function toYMD(v) {
  if (!v) return "";
  if (v?.toDate && typeof v.toDate === "function") {
    const d = v.toDate();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    const d = new Date(v);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return "";
  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${String(m1[2]).padStart(2,"0")}-${String(m1[3]).padStart(2,"0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  return s;
}

const extractCargoNumber = (text) => {
  const m = String(text).match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const extractTon = (text) => {
  const m = String(text).replace(/톤|t/gi, "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

function normalizeVehicleGroup(v = "") {
  if (/냉장|냉동/.test(v)) return "COLD";
  if (/오토바이/.test(v)) return "BIKE";
  if (/카고|윙/.test(v)) return "TRUCK";
  return "ETC";
}

const HOLIDAYS = [
  "2025-01-01","2025-02-09","2025-02-10","2025-02-11","2025-03-01",
  "2025-05-05","2025-06-06","2025-08-15","2025-09-16","2025-09-17",
  "2025-09-18","2025-10-03","2025-10-09","2025-12-25",
];
const isHoliday = (d) => HOLIDAYS.includes(String(d).slice(0,10));
const isFriday = (d) => d && new Date(d).getDay() === 5;
const isSpecialDay = (d) => isHoliday(d) || isFriday(d);

function classifyFare(fare, avg, row) {
  if (!fare || !avg) return "UNKNOWN";
  const ratio = fare / avg;
  const boost = isSpecialDay(row?.상차일) ? 0.1 : 0;
  if (ratio <= 1.15 + boost) return "NORMAL";
  if (ratio <= 1.3 + boost) return "TIGHT";
  return "SPIKE";
}

function isTransitStop(r) {
  const name = r.하차지명 || "";
  return /^\d+\./.test(name) || name.includes("경유");
}

// 거래처 자동완성 컴포넌트
function ClientSearch({ value, onChange, clients }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = clean(query);
    if (!q) return clients.slice(0, 10);
    return clients.filter(c => clean(c).includes(q)).slice(0, 10);
  }, [query, clients]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[activeIdx];
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const select = (val) => {
    setQuery(val);
    onChange(val);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="w-full px-2.5 py-1.5 text-[13px] font-medium rounded border border-gray-300 bg-white focus:border-[#1B2B4B] focus:outline-none focus:ring-1 focus:ring-[#1B2B4B]/20 placeholder:text-gray-300 transition"
        placeholder="거래처 검색..."
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value === "" ? "전체" : e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i+1, filtered.length-1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i-1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); if (filtered[activeIdx]) select(filtered[activeIdx]); }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          <div className="px-3 py-2 text-[12px] font-medium cursor-pointer hover:bg-gray-50 text-gray-400" onMouseDown={() => { setQuery(""); onChange("전체"); setOpen(false); }}>
            전체
          </div>
          {filtered.map((c, i) => (
            <div key={c} className={`px-3 py-2 text-[13px] font-medium cursor-pointer transition ${i === activeIdx ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`} onMouseDown={() => select(c)}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 운임 레벨 뱃지
function FareLevelBadge({ level }) {
  if (level === "NORMAL") return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">표준</span>;
  if (level === "TIGHT")  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">▲ 상승</span>;
  if (level === "SPIKE")  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">프리미엄</span>;
  return <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-400">-</span>;
}

// 통계 카드
function StatCard({ label, value, sub, color = "blue" }) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    red: "bg-red-50 border-red-200 text-red-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
    navy: "bg-[#1B2B4B]/5 border-[#1B2B4B]/20 text-[#1B2B4B]",
  };
  return (
    <div className={`border rounded-xl p-3 ${colors[color]}`}>
      <div className="text-[11px] font-semibold opacity-70 mb-1">{label}</div>
      <div className="text-[17px] font-bold">{value}</div>
      {sub && <div className="text-[11px] font-medium opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function StandardFare() {
  const [dispatchData, setDispatchData] = useState([]);
  const [activeTab, setActiveTab] = useState("표준운임"); // "표준운임" | "전국운임표"

  // 표준운임 상태
  const [sortKey, setSortKey] = useState("date_desc");
  const [pickup, setPickup] = useState(localStorage.getItem("sf_pickup") || "");
  const [drop, setDrop] = useState(localStorage.getItem("sf_drop") || "");
  const [cargo, setCargo] = useState(localStorage.getItem("sf_cargo") || "");
  const [ton, setTon] = useState(localStorage.getItem("sf_ton") || "");
  const [vehicle, setVehicle] = useState(localStorage.getItem("sf_vehicle") || "전체");
  const [pickupAddr, setPickupAddr] = useState(localStorage.getItem("sf_pickupAddr") || "");
  const [dropAddr, setDropAddr] = useState(localStorage.getItem("sf_dropAddr") || "");
  const [client, setClient] = useState(localStorage.getItem("sf_client") || "전체");
  const [result, setResult] = useState([]);
  const [aiFare, setAiFare] = useState(null);
  const [searched, setSearched] = useState(false);
  const [resetKey, setResetKey] = useState(0); // ClientSearch remount key

  // ── 전국운임 조회 (T-Map API 기반) ──
  const [nfFrom, setNfFrom] = useState("");
  const [nfTo, setNfTo] = useState("");
  const [nfLoading, setNfLoading] = useState(false);
  const [nfResult, setNfResult] = useState(null); // { km, from, to }
  const [nfError, setNfError] = useState("");

  const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

  // 차종별 운임 공식 (1800-5017 79km 데이터 역산 + 거리별 체감율 적용)
  // Rate(km) = base + perKm * km, 5000원 단위 반올림
  const FARE_TYPES = [
    { label: "라보",   base: 58000,  perKm: 405  },
    { label: "1톤",   base: 82000,  perKm: 608  },
    { label: "1.4톤", base: 95000,  perKm: 700  },
    { label: "2.5톤", base: 108000, perKm: 792  },
    { label: "3.5톤", base: 126000, perKm: 873  },
    { label: "5톤",   base: 146000, perKm: 1000 },
    { label: "5톤축", base: 161000, perKm: 1063 },
    { label: "11톤",  base: 191000, perKm: 1253 },
    { label: "14톤",  base: 211000, perKm: 1316 },
    { label: "18톤",  base: 230000, perKm: 1392 },
    { label: "25톤",  base: 241000, perKm: 1443 },
    { label: "장재물", base: null,   perKm: null  },
  ];

  const calcFare = (km, { base, perKm }) => {
    if (!base) return null;
    // 거리 체감: 100km 이상은 10%씩 perKm 감소 (최대 30% 감소)
    let effectivePerKm = perKm;
    if (km > 100) effectivePerKm = perKm * (1 - Math.min(0.3, (km - 100) / 1000));
    const raw = base + Math.round(effectivePerKm * km);
    return Math.round(raw / 5000) * 5000;
  };

  const geocodeTmap = async (addr) => {
    const url = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(addr)}`;
    const res = await fetch(url, { headers: { appKey: TMAP_KEY, Accept: "application/json" } });
    const data = await res.json();
    const coord = data?.coordinateInfo?.coordinate?.[0];
    if (!coord) throw new Error(`"${addr}" 주소를 찾을 수 없습니다`);
    return { lat: parseFloat(coord.lat), lon: parseFloat(coord.lon) };
  };

  const getRouteKm = async (from, to) => {
    const body = new URLSearchParams({
      startX: String(from.lon), startY: String(from.lat),
      endX: String(to.lon),   endY: String(to.lat),
      reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", searchOption: "0",
    });
    const res = await fetch("https://apis.openapi.sk.com/tmap/routes?version=1", {
      method: "POST",
      headers: { appKey: TMAP_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    const dist = data?.features?.[0]?.properties?.totalDistance;
    if (!dist) throw new Error("경로를 찾을 수 없습니다 (주소를 더 정확히 입력해 주세요)");
    return Math.round(dist / 1000);
  };

  const lookupNationalFare = async () => {
    if (!nfFrom.trim() || !nfTo.trim()) { setNfError("출발지와 도착지 주소를 모두 입력하세요"); return; }
    setNfLoading(true); setNfError(""); setNfResult(null);
    try {
      const [fromCoord, toCoord] = await Promise.all([geocodeTmap(nfFrom), geocodeTmap(nfTo)]);
      const km = await getRouteKm(fromCoord, toCoord);
      setNfResult({ km, from: nfFrom, to: nfTo });
    } catch (err) {
      setNfError(err.message || "조회 중 오류가 발생했습니다");
    } finally { setNfLoading(false); }
  };

  useEffect(() => {
    let dispatchCache = [];
    let ordersCache = [];

    const merge = () => {
      const map = new Map();
      dispatchCache.forEach(r => map.set(r._id, r));
      ordersCache.forEach(r => map.set(r._id, r));
      setDispatchData(Array.from(map.values()));
    };

    const mapDoc = (d) => {
      const data = d.data();
      return {
        _id: d.id,
        ...data,
        등록일: toYMD(data.등록일),
        상차일: toYMD(data.상차일),
        하차일: toYMD(data.하차일),
      };
    };

    const unsub1 = onSnapshot(collection(db, "dispatch"), (snap) => {
      dispatchCache = snap.docs.map(mapDoc);
      merge();
    });
    const unsub2 = onSnapshot(collection(db, "orders"), (snap) => {
      ordersCache = snap.docs.map(mapDoc);
      merge();
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    localStorage.setItem("sf_pickup", pickup);
    localStorage.setItem("sf_drop", drop);
    localStorage.setItem("sf_cargo", cargo);
    localStorage.setItem("sf_ton", ton);
    localStorage.setItem("sf_vehicle", vehicle);
    localStorage.setItem("sf_pickupAddr", pickupAddr);
    localStorage.setItem("sf_dropAddr", dropAddr);
    localStorage.setItem("sf_client", client);
  }, [pickup, drop, cargo, ton, vehicle, pickupAddr, dropAddr, client]);

  const clientList = useMemo(() =>
    [...new Set(dispatchData.map(r => r.거래처명).filter(Boolean))].sort(),
    [dispatchData]
  );

  const calcAiFare = (rows) => {
    if (!rows.length) return null;
    const fares = rows.map(r => Number(String(r.청구운임||0).replace(/[^\d]/g,""))).filter(n=>n>0);
    if (!fares.length) return null;
    const avg = Math.round(fares.reduce((a,b)=>a+b,0)/fares.length);
    const min = Math.min(...fares);
    const max = Math.max(...fares);
    const latest = rows.slice().sort((a,b)=>(toYMD(b.상차일)||"").localeCompare(toYMD(a.상차일)||""))[0];
    const latestFare = Number(String(latest?.청구운임||0).replace(/[^\d]/g,""));
    const latestLevel = classifyFare(latestFare, avg, latest);
    let aiValue = avg;
    let message = "";
    if (latestLevel === "SPIKE") {
      aiValue = avg;
      message = "최근 운임은 연휴·수배 지연으로 일시적으로 상승한 프리미엄 운임입니다. 표준 운임 기준으로 견적을 산정하는 것을 권장합니다.";
    } else if (latestLevel === "TIGHT") {
      aiValue = Math.round(avg*0.6+latestFare*0.4);
      message = "현재 차량 수급이 다소 빡빡한 구간입니다. 표준 운임 대비 소폭 상향 견적이 적정합니다.";
    } else {
      aiValue = Math.round(avg*0.5+latestFare*0.5);
      message = "최근 운임 흐름이 안정적입니다. 표준 운임 기준 견적을 사용하셔도 무리가 없습니다.";
    }
    return { avg, min, max, latestFare, aiValue, confidence: Math.min(95, 60+rows.length*5), message };
  };

  const search = () => {
    if (!pickup.trim() && !pickupAddr.trim()) { alert("상차지명 또는 주소를 입력하세요."); return; }
    if (!drop.trim() && !dropAddr.trim()) { alert("하차지명 또는 주소를 입력하세요."); return; }

    let list = [...dispatchData];
    list = list.filter(r => {
      const name = clean(r.상차지명||""), addr = clean(r.상차지주소||"");
      const p = clean(pickup), pa = clean(pickupAddr);
      if (!p && !pa) return true;
      return (p && (name.includes(p)||addr.includes(p))) || (pa && (name.includes(pa)||addr.includes(pa)));
    });
    list = list.filter(r => {
      const name = clean(r.하차지명||""), addr = clean(r.하차지주소||"");
      const d = clean(drop), da = clean(dropAddr);
      if (!d && !da) return true;
      return (d && (name.includes(d)||addr.includes(d))) || (da && (name.includes(da)||addr.includes(da)));
    });
    if (cargo.trim()) {
      const cargoNum = extractCargoNumber(cargo);
      const cargoText = clean(cargo);
      list = list.filter(r => {
        const rowNum = extractCargoNumber(r.화물내용);
        const rowText = clean(r.화물내용);
        return cargoNum !== null ? rowNum === cargoNum : rowText.includes(cargoText);
      });
    }
    if (ton.trim()) {
      const tonNum = extractTon(ton);
      list = list.filter(r => { const rt = extractTon(r.차량톤수); return rt && Math.abs(rt-tonNum)<=0.7; });
    }
    if (vehicle !== "전체") {
      const vg = normalizeVehicleGroup(vehicle);
      list = list.filter(r => normalizeVehicleGroup(r.차량종류) === vg);
    }
    if (client !== "전체" && client !== "") {
      list = list.filter(r => clean(r.거래처명) === clean(client));
    }

    const 기준차량그룹 = vehicle === "전체" ? null : normalizeVehicleGroup(vehicle);
    const 기준파렛트 = cargo ? extractCargoNumber(cargo) : null;
    const baseGroup = list.filter(r =>
      !isTransitStop(r) &&
      (!기준차량그룹 || normalizeVehicleGroup(r.차량종류) === 기준차량그룹) &&
      (!기준파렛트 || extractCargoNumber(r.화물내용) === 기준파렛트)
    );
    const rawFares = baseGroup.map(r => Number(String(r.청구운임||0).replace(/[^\d]/g,""))).filter(n=>n>0);
    const roughAvg = rawFares.length > 0 ? rawFares.reduce((a,b)=>a+b,0)/rawFares.length : null;
    const normalFares = baseGroup.filter(r => {
      if (!roughAvg) return false;
      const fare = Number(String(r.청구운임||0).replace(/[^\d]/g,""));
      return classifyFare(fare, roughAvg, r) !== "SPIKE";
    }).map(r => Number(String(r.청구운임||0).replace(/[^\d]/g,"")));
    const avgFare = normalFares.length > 0 ? Math.round(normalFares.reduce((a,b)=>a+b,0)/normalFares.length) : null;

    const withLevel = list.map(r => ({
      ...r,
      fareLevel: avgFare ? classifyFare(Number(String(r.청구운임||0).replace(/[^\d]/g,"")), avgFare, r) : "UNKNOWN",
    }));

    const levelRank = { NORMAL:1, TIGHT:2, SPIKE:3 };
    withLevel.sort((a,b) => {
      switch(sortKey) {
        case "date_desc": return (toYMD(b.상차일)||"").localeCompare(toYMD(a.상차일)||"");
        case "date_asc":  return (toYMD(a.상차일)||"").localeCompare(toYMD(b.상차일)||"");
        case "cargo_asc": { const an=extractCargoNumber(a.화물내용),bn=extractCargoNumber(b.화물내용); if(an!=null&&bn!=null)return an-bn; if(an!=null)return -1; if(bn!=null)return 1; return(a.화물내용||"").localeCompare(b.화물내용||""); }
        case "vehicle_asc": { const ag=normalizeVehicleGroup(a.차량종류),bg=normalizeVehicleGroup(b.차량종류); return ag!==bg?ag.localeCompare(bg):(a.차량종류||"").localeCompare(b.차량종류||""); }
        case "fare_asc":  return Number(a.청구운임||0)-Number(b.청구운임||0);
        case "fare_desc": return Number(b.청구운임||0)-Number(a.청구운임||0);
        case "driver_desc": return Number(b.기사운임||0)-Number(a.기사운임||0);
        case "fee_desc":  return Number(b.수수료||0)-Number(a.수수료||0);
        case "level":     return levelRank[a.fareLevel]-levelRank[b.fareLevel];
        case "level_spike":return levelRank[b.fareLevel]-levelRank[a.fareLevel];
        default: return 0;
      }
    });

    setResult(withLevel);
    setAiFare(calcAiFare(baseGroup));
    setSearched(true);
    if (withLevel.length === 0) alert("조회된 데이터가 없습니다.");
  };

  const reset = () => {
    setPickup(""); setDrop(""); setCargo(""); setTon(""); setVehicle("전체");
    setPickupAddr(""); setDropAddr(""); setClient("전체"); setResult([]); setAiFare(null); setSearched(false);
    setResetKey(k => k + 1);
    ["sf_pickup","sf_drop","sf_cargo","sf_ton","sf_vehicle","sf_pickupAddr","sf_dropAddr","sf_client"].forEach(k=>localStorage.removeItem(k));
  };

  const stats = useMemo(() => {
    if (!result.length) return null;
    const fares = result.map(r=>Number(String(r.청구운임||0).replace(/[^\d]/g,""))).filter(n=>n>0);
    if (!fares.length) return null;
    const avg = Math.round(fares.reduce((a,b)=>a+b,0)/fares.length);
    const drivers = result.map(r=>Number(String(r.기사운임||0).replace(/[^\d]/g,""))).filter(n=>n>0);
    const avgDriver = drivers.length ? Math.round(drivers.reduce((a,b)=>a+b,0)/drivers.length) : 0;
    const normal = result.filter(r=>r.fareLevel==="NORMAL").length;
    const spike = result.filter(r=>r.fareLevel==="SPIKE").length;
    return { count: result.length, avg, min: Math.min(...fares), max: Math.max(...fares), avgDriver, normal, spike };
  }, [result]);


  const inputCls = "w-full px-2.5 py-1.5 text-[13px] font-medium rounded border border-gray-300 bg-white focus:border-[#1B2B4B] focus:outline-none focus:ring-1 focus:ring-[#1B2B4B]/20 placeholder:text-gray-300 transition";
  const labelCls = "block text-[12px] font-semibold text-gray-500 mb-0.5";

  return (
    <div className="p-5 bg-gray-50 min-h-screen">

      {/* 페이지 헤더 */}
      <div className="mb-4">
        <h2 className="text-[18px] font-bold text-[#1B2B4B]">표준 운임표</h2>
        <p className="text-[12px] text-gray-500 mt-0.5">배차 데이터 기반 운임 조회 및 노선별 평균 운임 분석</p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { key: "표준운임", label: "표준운임 조회" },
          { key: "전국운임표", label: "전국운임 조회" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-[13px] font-semibold border-b-2 transition ${
              activeTab === tab.key
                ? "border-[#1B2B4B] text-[#1B2B4B]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ====== 표준운임 조회 탭 ====== */}
      {activeTab === "표준운임" && (
        <>
          {/* 검색 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
            <div className="p-4">
              {/* 노선 */}
              <div className="mb-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">노선 정보</div>
                <div className="grid grid-cols-2 gap-3">
                  {/* 상차지 */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[11px] font-bold text-[#1B2B4B] mb-2 uppercase tracking-wider">상차지</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>지명 <span className="text-red-400">*</span></label>
                        <input className={inputCls} placeholder="예: 송원" value={pickup} onChange={e=>setPickup(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} />
                      </div>
                      <div>
                        <label className={labelCls}>주소 (선택)</label>
                        <input className={inputCls} placeholder="예: 인천 서구" value={pickupAddr} onChange={e=>setPickupAddr(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} />
                      </div>
                    </div>
                  </div>
                  {/* 하차지 */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[11px] font-bold text-[#1B2B4B] mb-2 uppercase tracking-wider">하차지</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>지명 <span className="text-red-400">*</span></label>
                        <input className={inputCls} placeholder="예: 유통센터" value={drop} onChange={e=>setDrop(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} />
                      </div>
                      <div>
                        <label className={labelCls}>주소 (선택)</label>
                        <input className={inputCls} placeholder="예: 서울 송파구" value={dropAddr} onChange={e=>setDropAddr(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 조건 */}
              <div className="mb-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">조건</div>
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className={labelCls}>거래처</label>
                    <ClientSearch key={resetKey} value={client === "전체" ? "" : client} onChange={v=>setClient(v||"전체")} clients={clientList} />
                  </div>
                  <div>
                    <label className={labelCls}>차량종류</label>
                    <select className={inputCls} value={vehicle} onChange={e=>setVehicle(e.target.value)}>
                      {VEHICLE_TYPES.map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>차량톤수</label>
                    <input className={inputCls} placeholder="예: 1, 5" value={ton} onChange={e=>setTon(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} />
                  </div>
                  <div>
                    <label className={labelCls}>화물내용</label>
                    <input className={inputCls} placeholder="예: 5파레트" value={cargo} onChange={e=>setCargo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} />
                  </div>
                  <div>
                    <label className={labelCls}>정렬방식</label>
                    <select className={inputCls} value={sortKey} onChange={e=>setSortKey(e.target.value)}>
                      <option value="date_desc">최신순</option>
                      <option value="date_asc">오래된순</option>
                      <option value="cargo_asc">화물내용 (숫자순)</option>
                      <option value="vehicle_asc">차량종류순</option>
                      <option value="fare_desc">청구운임 높은순</option>
                      <option value="fare_asc">청구운임 낮은순</option>
                      <option value="level">운임레벨 (표준→프리미엄)</option>
                      <option value="level_spike">운임레벨 (프리미엄우선)</option>
                      <option value="driver_desc">기사운임 높은순</option>
                      <option value="fee_desc">수수료 높은순</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 액션 */}
              <div className="flex items-center gap-2">
                <button onClick={search} className="px-6 py-2 bg-[#1B2B4B] text-white text-[13px] font-semibold rounded-lg hover:bg-[#243a60] transition">조회</button>
                <button onClick={reset} className="px-4 py-2 bg-white text-gray-500 text-[13px] font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition">초기화</button>
                <span className="text-[12px] text-gray-400 ml-1">Enter 키로도 조회</span>
                {searched && stats && (
                  <span className="ml-auto text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                    총 <b className="text-[#1B2B4B]">{stats.count}</b>건 조회됨
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 통계 요약 */}
          {stats && (
            <div className="grid grid-cols-6 gap-3 mb-4">
              <StatCard label="조회 건수" value={`${stats.count}건`} color="gray" />
              <StatCard label="평균 청구운임" value={`${stats.avg.toLocaleString()}원`} color="navy" />
              <StatCard label="최저 운임" value={`${stats.min.toLocaleString()}원`} color="green" />
              <StatCard label="최고 운임" value={`${stats.max.toLocaleString()}원`} color="orange" />
              <StatCard label="평균 기사운임" value={`${stats.avgDriver.toLocaleString()}원`} sub={`마진 ${(stats.avg-stats.avgDriver).toLocaleString()}원`} color="gray" />
              <StatCard label="프리미엄 건수" value={`${stats.spike}건`} sub={`표준 ${stats.normal}건`} color={stats.spike > 0 ? "red" : "gray"} />
            </div>
          )}

          {/* AI 추천 */}
          {aiFare && (
            <div className="bg-white border border-amber-200 rounded-xl p-5 mb-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[15px] font-bold text-amber-700">AI 추천 운임</span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-[11px] rounded-full font-semibold">신뢰도 {aiFare.confidence}%</span>
                  </div>
                  <p className="text-[13px] text-gray-600 leading-relaxed">{aiFare.message}</p>
                </div>
                <div className="ml-6 text-right">
                  <div className="text-[13px] text-gray-500 mb-0.5">추천 운임</div>
                  <div className="text-[22px] font-bold text-amber-600">{aiFare.aiValue.toLocaleString()}원</div>
                  <div className="text-[12px] text-gray-500 mt-1">
                    범위: {aiFare.min.toLocaleString()} ~ {aiFare.max.toLocaleString()}원
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 결과 테이블 */}
          {searched && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B]">
                      {["상차일","상차지명","상차지주소","하차지명","하차지주소","화물내용","차량종류","차량톤수","청구운임","운임레벨","기사운임","수수료","메모"].map(h=>(
                        <th key={h} className="px-3 py-3 text-center text-[13px] font-bold text-white whitespace-nowrap border-b border-white/10">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-16 text-center text-gray-400 text-[13px]">조회된 데이터가 없습니다.</td>
                      </tr>
                    ) : (
                      result.map((r, i) => (
                        <tr key={r._id} className={`border-b border-gray-100 transition hover:bg-blue-50/40 ${i%2===0?"bg-white":"bg-gray-50/40"}`}>
                          <td className="px-3 py-2.5 text-center text-[13px] text-gray-700 font-medium whitespace-nowrap">{r.상차일}</td>
                          <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-800 whitespace-nowrap">{r.상차지명}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-600 max-w-[160px] truncate" title={r.상차지주소}>{r.상차지주소}</td>
                          <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-800 whitespace-nowrap">{r.하차지명}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-600 max-w-[160px] truncate" title={r.하차지주소}>{r.하차지주소}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-700 text-center">{r.화물내용}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-700 text-center whitespace-nowrap">{r.차량종류}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-700 text-center">{r.차량톤수}</td>
                          <td className="px-3 py-2.5 text-right text-[13px] font-bold text-gray-800">{Number(r.청구운임||0).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-center"><FareLevelBadge level={r.fareLevel} /></td>
                          <td className="px-3 py-2.5 text-right text-[13px] text-gray-700 font-medium">{Number(r.기사운임||0).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-[13px] text-gray-700 font-medium">{Number(r.수수료||0).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-600 max-w-[120px] truncate" title={r.메모}>{r.메모}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ====== 전국운임 조회 탭 (T-Map 도로거리 기반) ====== */}
      {activeTab === "전국운임표" && (
        <>
          {/* 주소 입력 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 p-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[12px] font-bold text-gray-500 mb-1">출발지 주소</label>
                <input
                  className={inputCls}
                  placeholder="예: 인천광역시 서구 원창동"
                  value={nfFrom}
                  onChange={e => setNfFrom(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && lookupNationalFare()}
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-gray-500 mb-1">도착지 주소</label>
                <input
                  className={inputCls}
                  placeholder="예: 경기도 용인시 처인구"
                  value={nfTo}
                  onChange={e => setNfTo(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && lookupNationalFare()}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={lookupNationalFare}
                disabled={nfLoading}
                className="px-8 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] disabled:opacity-50 transition flex items-center gap-2"
              >
                {nfLoading ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/>
                    </svg>
                    거리 계산 중...
                  </>
                ) : "조회하기"}
              </button>
              <button
                onClick={() => { setNfFrom(""); setNfTo(""); setNfResult(null); setNfError(""); }}
                className="px-5 py-2 bg-white text-gray-500 text-[13px] font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition"
              >
                다시 입력
              </button>
              {nfResult && (
                <div className="ml-auto flex items-center gap-2 text-[13px] font-semibold text-[#1B2B4B]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12h18M3 6h18M3 18h18"/>
                  </svg>
                  도로거리: <span className="text-[15px] font-bold">{nfResult.km} km</span>
                </div>
              )}
            </div>
            {nfError && (
              <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-600">{nfError}</div>
            )}
          </div>

          {/* 운임 결과 테이블 */}
          {nfResult && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
              {/* 헤더 */}
              <div className="bg-[#1B2B4B] px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-white font-bold text-[14px]">{nfResult.from} → {nfResult.to}</div>
                  <div className="text-white/60 text-[12px] mt-0.5">도로거리 {nfResult.km}km 기준 예상 운임</div>
                </div>
                <div className="text-white/80 text-[13px] font-semibold">차량별 운임 현황</div>
              </div>

              {/* 차종 × 운임 그리드 */}
              <div className="p-4">
                <div className="grid grid-cols-4 gap-0 border border-gray-200 rounded-lg overflow-hidden">
                  {FARE_TYPES.map((ft, i) => {
                    const fare = calcFare(nfResult.km, ft);
                    return (
                      <div key={ft.label} className={`border-b border-r border-gray-100 last:border-r-0 ${i % 4 === 3 ? "border-r-0" : ""}`}>
                        <div className="bg-[#1B2B4B] text-white text-[12px] font-bold text-center py-2 px-3">{ft.label}</div>
                        <div className="text-center py-3 px-3 text-[14px] font-bold text-gray-800">
                          {fare ? fare.toLocaleString() : <span className="text-[12px] text-gray-400 font-normal">별도협의</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 면책 고지 */}
              <div className="px-5 pb-4 space-y-1">
                <div className="text-[11px] text-gray-400 flex items-start gap-1.5">
                  <span className="text-gray-400 mt-0.5 shrink-0">●</span>
                  예상단가로 실제 운임은 수작업·상하차 조건·계절·수급 상황에 따라 변동될 수 있습니다.
                </div>
                <div className="text-[11px] text-gray-400 flex items-start gap-1.5">
                  <span className="text-gray-400 mt-0.5 shrink-0">●</span>
                  T-Map 도로거리 기준으로 산정되며, 실제 경로에 따라 차이가 있을 수 있습니다.
                </div>
              </div>
            </div>
          )}

          {/* 초기 안내 */}
          {!nfResult && !nfLoading && (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mb-4 opacity-25">
                <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
              <div className="text-[14px] font-semibold mb-1">출발지와 도착지 주소를 입력하세요</div>
              <div className="text-[12px]">T-Map 도로거리를 기반으로 차종별 예상 운임을 계산합니다</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
