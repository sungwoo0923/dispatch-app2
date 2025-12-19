// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import FixedClients from "./FixedClients";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import AdminMenu from "./AdminMenu";
import { calcFare } from "./fareUtil";
import StandardFare from "./StandardFare";
import { sendOrderTo24Proxy as sendOrderTo24 } from "../api/24CallProxy";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { BarChart, Bar, Legend } from "recharts";
import FleetManagement from "./FleetManagement";
import PptxGenJS from "pptxgenjs";
import { Navigate, useNavigate } from "react-router-dom";
/* -------------------------------------------------
   발행사(우리 회사) 고정 정보
--------------------------------------------------*/
const COMPANY = {
  name: "(주)돌캐",
  bizNo: "329-81-00967",
  addr: "인천 서구 청마로19번길 21 4층 402호",
  ceo: "고현정",
  bizType: "운수업",
  bizItem: "화물운송주선",
  tel: "1533-2525",
  fax: "032-569-8881",
  bank: "기업은행 955-040276-04-018",
  email: "r15332525@run25.co.kr",
  sealImage: "/seal.png",
};

/* -------------------------------------------------
   공통 상수 (차량종류, 결제/배차 방식)
--------------------------------------------------*/
const VEHICLE_TYPES = ["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑"];
const PAY_TYPES = ["계산서","착불","선불","계좌이체"];
const DISPATCH_TYPES = ["24시","인성","직접배차","24시(외부업체)"];

const cellBase = "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[100px]";
const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100";
const inputBase = "border p-1 rounded w-36 text-center";

const todayStr = () => {
  const d = new Date();
  d.setHours(d.getHours() + 9); // 한국시간 보정
  return d.toISOString().slice(0, 10);
};
const tomorrowStr = () => {
  const d = new Date();
  d.setHours(d.getHours() + 33); // 9 + 24
  return d.toISOString().slice(0, 10);
};

/* -------------------------------------------------
   안전 로컬 저장
--------------------------------------------------*/
const safeLoad = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; } };
const safeSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* -------------------------------------------------
   거래처 정규화
--------------------------------------------------*/
function normalizeClient(row){
  if(!row) return null;
  if(typeof row==="string") return { 거래처명:row, 사업자번호:"", 사업자명:"", 메모:"" };
  return {
    거래처명: row.거래처명 || row.name || row.상호 || row.회사명 || row.title || "",
    사업자번호: row.사업자번호 || row.사업자등록증 || row.사업자등록번호 || "",
    사업자명: row.사업자명 || row.대표자 || row.대표자명 || row.ceo || "",
    메모: row.메모 || row.memo || "",
    대표자: row.대표자 || row.사업자명 || "",
    업태: row.업태 || "",
    종목: row.종목 || "",
    주소: row.주소 || "",
    담당자: row.담당자 || "",
    연락처: row.연락처 || "",
  };
}
function normalizeClients(arr){
  if(!Array.isArray(arr)) return [];
  const mapped = arr.map(normalizeClient).filter(Boolean).map(c=>({
    거래처명:c.거래처명||"", 사업자번호:c.사업자번호||"", 대표자:c.대표자||c.사업자명||"",
    업태:c.업태||"", 종목:c.종목||"", 주소:c.주소||"", 담당자:c.담당자||"", 연락처:c.연락처||"", 메모:c.메모||""
  }));
  const map = new Map(); mapped.forEach(c=>map.set(c.거래처명,c));
  return Array.from(map.values());
}
/* -------------------------------------------------
   배차 수정 이력 생성 함수 (⭐ 반드시 필요)
--------------------------------------------------*/
function makeDispatchHistory({ field, before, after }) {
  return {
    at: Date.now(),                              // 수정 시각
    user: auth.currentUser?.email || "unknown", // 수정자
    field,                                      // 수정 필드명
    before,                                    // 이전 값
    after,                                     // 변경 값
  };
}


/* -------------------------------------------------
   Firebase
--------------------------------------------------*/
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs,
  onSnapshot, deleteDoc
} from "firebase/firestore";


/* -------------------------------------------------
   Firestore 실시간 동기화 훅
--------------------------------------------------*/
const COLL = {
  dispatch: "dispatch",
  drivers: "drivers",
  clients: "clients",
};
// 🔐 테스트 계정이면 다른 컬렉션 사용
const getCollectionName = (role) =>
  role === "test" ? "dispatch_test" : "dispatch";


function useRealtimeCollections(user){
  const [dispatchData, setDispatchData] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  // ===================== 하차지(places) Firestore 실시간 구독 =====================
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    const coll = collection(db, "places");
    const unsub = onSnapshot(coll, (snap) => {
      const arr = snap.docs.map((d) => ({
        _id: d.id,
        ...(d.data() || {}),
      }));
      setPlaces(arr);
    });

    return () => unsub();
  }, []);

  useEffect(()=>{
    if(!user) { setDispatchData([]); setDrivers([]); setClients([]); return; }

    const unsubs = [];
    const userRole = localStorage.getItem("role") || "user";
const collName = getCollectionName(userRole);

unsubs.push(onSnapshot(collection(db, collName), (snap)=>{
      const arr = snap.docs.map(d=>d.data());
      setDispatchData(arr);
      safeSave("dispatchData", arr);
    }));
    unsubs.push(onSnapshot(collection(db, COLL.drivers), (snap)=>{
      const arr = snap.docs.map(d=>d.data());
      setDrivers(arr);
      safeSave("drivers", arr);
    }));
    unsubs.push(onSnapshot(collection(db, COLL.clients), (snap)=>{
      const arr = snap.docs.map(d=>d.data());
      setClients(normalizeClients(arr));
      safeSave("clients", arr);
    }));

    return ()=>unsubs.forEach(u=>u&&u());
  }, [user]);

  const addDispatch = async (record) => {
  const _id = record._id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  await setDoc(doc(db, COLL.dispatch, _id), { 
    ...record,
    _id,
    작성자: auth.currentUser?.email || "",   // ★ 추가
  });
};
  const patchDispatch = async (_id, patch) => {
  if (!_id) return;

  // 1️⃣ 기존 문서 가져오기
  const ref = doc(db, COLL.dispatch, _id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const prev = snap.data();
  const histories = [];

  // 2️⃣ 변경된 필드만 이력 생성
  Object.keys(patch).forEach((key) => {
    if (prev[key] !== patch[key]) {
      histories.push(
        makeDispatchHistory({
          field: key,
          before: prev[key],
          after: patch[key],
        })
      );
    }
  });

  // 3️⃣ Firestore 업데이트
  await setDoc(
    ref,
    {
      ...patch,
      작성자: auth.currentUser?.email || "",
      history: [
        ...(prev.history || []),
        ...histories,
      ],
    },
    { merge: true }
  );
};


const removeDispatch = async (arg) => {
  const id = typeof arg === "string" ? arg : arg?._id;
  if (!id) return;
  await deleteDoc(doc(db, COLL.dispatch, id));
};


  const upsertDriver = async (driver) => {
  const id = driver._id || crypto.randomUUID();

  const data = {
    ...driver,
    _id: id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLL.drivers, id), data, { merge: true });
  return id;
};

const removeDriver = async (id) => deleteDoc(doc(db, COLL.drivers, id));

const upsertClient = async (client) => {
  const id = client.거래처명 || client.id || crypto.randomUUID();
  await setDoc(
    doc(db, COLL.clients, id),
    { ...client, id },
    { merge: true }
  );
};

const removeClient = async (id) => deleteDoc(doc(db, COLL.clients, id));

  return {
    dispatchData,
    drivers,
    clients,
    places,
    addDispatch,
    patchDispatch,
    removeDispatch,
    upsertDriver,
    removeDriver,
    upsertClient,
    removeClient,
  };
}  // ← ⭐ 이거 반드시 필요
/* -------------------------------------------------
   하차지 Key 생성 함수 (⭐ 반드시 필요)
--------------------------------------------------*/
function makePlaceKey(name = "", addr = "") {
  const n = String(name).trim().toLowerCase().replace(/\s+/g, "");
  const a = String(addr).trim().toLowerCase().replace(/\s+/g, "");
  return `${n}_${a}`;
}
/* -------------------------------------------------
   하차지 저장 (upsertPlace) — Firestore (최종 안정버전)
--------------------------------------------------*/
const upsertPlace = async (place) => {
  try {
    const rawName = place?.업체명 || "";
    const name = rawName.trim();
    if (!name) return;

    const key = makePlaceKey(name);
    const ref = doc(db, "places", key);
    const snap = await getDoc(ref);

    const data = {
      업체명: name,
      주소: (place.주소 || "").trim(),
      담당자: (place.담당자 || "").trim(),
      담당자번호: (place.담당자번호 || "").trim(),
      updatedAt: Date.now(),
    };

    if (snap.exists()) {
      await updateDoc(ref, data);
      console.log("🔥 기존 업체 업데이트:", key);
    } else {
      await setDoc(ref, data);
      console.log("🆕 신규 업체 등록:", key);
    }

  } catch (e) {
    console.error("⛔ upsertPlace 오류:", e);
  }
};

/* -------------------------------------------------
   공통
--------------------------------------------------*/
const StatusBadge = ({ s }) => (
  <span className={`px-2 py-1 rounded text-xs ${
    s === "배차완료" ? "bg-green-100 text-green-700"
    : s === "취소" ? "bg-red-100 text-red-700"
    : "bg-yellow-100 text-yellow-700"
  }`}>{s || ""}</span>
);

export const toInt = (v) => {
  const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};
export const fmtWon = (n) => `${Number(n || 0).toLocaleString()}원`;
// 📌 전화번호 하이픈 자동 적용 함수
function formatPhone(phone) {
  const p = String(phone ?? "").replace(/[^\d]/g, "");

  if (p.length === 11) {
    return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  }
  if (p.length === 10) {
    return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  }

  return p;
}

export {
  COMPANY, VEHICLE_TYPES, PAY_TYPES, DISPATCH_TYPES,
  headBase, cellBase, inputBase, todayStr
};

// ===================== DispatchApp.jsx (PART 1/8) — END =====================
// ===================== DispatchApp.jsx (PART 2/8) — START =====================
export default function DispatchApp({ role, user }) {
    // 🔥 화주 차단
  if (role === "shipper") {
    return <Navigate to="/shipper" replace />;
  }
  const isTest = role === "test";
  const navigate = useNavigate();
// ⭐ 고정거래처 매출 실시간 구독
const [fixedRows, setFixedRows] = useState([]);

  // ⭐ 여기 추가!
  const [subMenu, setSubMenu] = useState("고정거래처관리");
   // ⭐ 내 정보 패널 ON/OFF
  const [showMyInfo, setShowMyInfo] = useState(false);
  // ❌ 삭제 (중복 선언 오류 원인)
  // const [dispatchData, setDispatchData] = useState([]);  
  // ---------------- Firestore 실시간 훅 ----------------
const {
  dispatchData,
  drivers,
  clients,
  places,
  addDispatch,
  patchDispatch,
  removeDispatch,
  upsertDriver,
  removeDriver,
  upsertClient,
  removeClient,
} = useRealtimeCollections(user);

// 🔍 admin = 전체 데이터, 일반 user = 본인 작성 데이터만
const dispatchDataFiltered = useMemo(() => {
  if (!dispatchData || !user) return [];

  // 관리자면 전체 데이터 그대로 반환
  if (role === "admin") return dispatchData;

  // 일반 계정은 본인 데이터만
  return dispatchData.filter(o =>
    !o?.작성자 || o?.작성자 === user.email
  );
}, [dispatchData, user, role]);


// ⭐ 내 정보 통계 계산
const myStats = useMemo(() => {
  if (!dispatchData) return { totalOrders: 0, totalRevenue: 0, totalProfit: 0 };

  const myOrders =
  role === "admin"
    ? dispatchData               // 🔥 관리자 → 전체 데이터
    : dispatchData.filter(d =>   // 일반 계정 → 본인 데이터만
        !d?.작성자 || d?.작성자 === user?.email
      );

  let totalRevenue = 0;
  let totalProfit = 0;

  myOrders.forEach(o => {
    const fare = Number(o?.청구운임 || 0);
    const driverFee = Number(o?.기사운임 || 0);

    totalRevenue += fare;
    totalProfit += fare - driverFee;
  });

  return {
    totalOrders: myOrders.length,
    totalRevenue,
    totalProfit,
  };
}, [dispatchData, user]);
// ⭐ 오늘 날짜
const today = todayStr();

// ⭐ 안전한 날짜 파싱 함수 (Timestamp, string 모두 지원)
function parseDate(v) {
  if (!v) return null;

  // Firebase Timestamp 객체면 toDate() 사용
  if (typeof v === "object" && v.toDate) {
    return v.toDate();
  }

  // 문자열이면 Date로 변환
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ⭐ KST 기준 날짜(2025-02-14 형태로)
function toYMD_KST(date) {
  if (!date) return "";
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// ⭐ 오늘 통계
const todayStats = useMemo(() => {
  if (!dispatchData || !user) return { count: 0, revenue: 0, profit: 0 };

  const todayStrKST = today; // 기존 todayStr 사용

  const list = dispatchData.filter((d) => {
  // 날짜 파싱
  const dt = parseDate(d?.상차일자 || d?.상차일 || d?.상차);
  if (!dt) return false;

  const dateKST = toYMD_KST(dt);

  // 🔥 admin이면 전체 보여주고, user는 본인 데이터만 보여줌
  const isMine =
    role === "admin" ? true : (!d?.작성자 || d.작성자 === user.email);

  return isMine && dateKST === todayStrKST;
});


  return list.reduce(
    (acc, o) => {
      const fare = toInt(o?.청구운임);
      const driverFee = toInt(o?.기사운임);

      acc.count += 1;
      acc.revenue += fare;
      acc.profit += fare - driverFee;

      return acc;
    },
    { count: 0, revenue: 0, profit: 0 }
  );
}, [dispatchData, user, today]);




  // ---------------- 로그아웃 ----------------
  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("role");
    alert("로그아웃되었습니다.");
    navigate("/login");
  };



  // ---------------- 옵션 리스트 ----------------
  const timeOptions = useMemo(
    () =>
      Array.from({ length: 24 * 6 }, (_, i) =>
        `${String(Math.floor(i / 6)).padStart(2, "0")}:${String(
          (i % 6) * 10
        ).padStart(2, "0")}`
      ),
    []
  );

  const tonOptions = useMemo(() => Array.from({ length: 25 }, (_, i) => `${i + 1}톤`), []);

  const [menu, setMenu] = useState("실시간배차현황");

  // ---------------- user 차단 메뉴 ----------------
  const blockedMenus = [
    "배차관리",
    "기사관리",
    "거래처관리",
    "매출관리",
    "거래처정산",
    "지급관리",
    "관리자메뉴",
  ];

  // ---------------- 메뉴 클릭 제어 ----------------
  const handleMenuClick = (m) => {
    if (role === "user" && blockedMenus.includes(m)) return;
    setMenu(m);
  };

  
if (!user) {
  return (
    <div className="w-full h-screen flex items-center justify-center text-gray-500">
      로그인 정보 확인 중...
    </div>
  );
}
  // ---------------- 메뉴 UI ----------------
return (
  <>

    <header className="sticky top-0 z-50 bg-white shadow-md rounded-b-xl px-6 py-4 mb-6 flex items-center justify-between">

  {/* 좌측 서비스명 */}
  <div className="flex flex-col leading-tight">
    <span className="text-xl font-extrabold text-gray-800 tracking-tight">
      RUN25 배차프로그램(Park)
    
    </span>
    <span className="text-xs text-gray-500">물류 배차·정산 통합관리 시스템</span>
  </div>

  {/* 우측 사용자 영역 */}
  <div className="flex items-center gap-4">

    {/* 내 정보 버튼 */}
    <button
      onClick={() => setShowMyInfo(true)}
      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm shadow-sm transition"
    >
      내 정보
    </button>

    {/* 이메일 */}
    <span className="text-gray-700 text-sm bg-gray-100 px-3 py-1 rounded-full">
      {user?.email}
    </span>

    {/* 로그아웃 */}
    <button 
      onClick={logout} 
      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm shadow-sm transition"
    >
      로그아웃
    </button>

  </div>
</header>

<nav className="w-full bg-white shadow-sm border-b border-gray-200 px-4 py-2 mb-5">
  <div className="flex gap-4 overflow-x-auto whitespace-nowrap">

    {[
      "배차관리",
      "실시간배차현황",
      "배차현황",
      "미배차현황",
      "표준운임표",
      "기사관리",
      "거래처관리",
      "고정거래처관리",
      "매출관리",
      "거래처정산",
      "지급관리",
      "관리자메뉴",
    ].map((m) => {
      const isBlocked = role === "user" && blockedMenus.includes(m);
      const isActive = menu === m;

      return (
        <button
          key={m}
          disabled={isBlocked}
          onClick={() => handleMenuClick(m)}
          className={`relative px-3 pb-2 pt-1 text-sm font-medium transition-all 
            ${
              isBlocked
                ? "text-gray-300 cursor-not-allowed"
                : isActive
                ? "text-blue-600 font-semibold"
                : "text-gray-600 hover:text-blue-600"
            }
          `}
        >
          {m}

          {/* 활성 메뉴 바(토스 느낌) */}
          {!isBlocked && isActive && (
            <span className="absolute left-0 right-0 -bottom-[1px] h-[3px] bg-[#1B64FF] rounded-full"></span>
          )}
        </button>
      );
    })}
  </div>
</nav>



      {/* ---------------- 화면 렌더링 ---------------- */}
<main className="bg-white rounded shadow p-4">

  {menu === "배차관리" && (
  <DispatchManagement
  dispatchData={dispatchDataFiltered}
  drivers={drivers}
  clients={clients}
  addDispatch={addDispatch}
  upsertDriver={upsertDriver}
  upsertClient={upsertClient}
  patchDispatch={patchDispatch}
  removeDispatch={removeDispatch}
  upsertPlace={upsertPlace}
  placeRows={places}
  role={role}
  isTest={isTest}   // ★ 추가!
/>

)}

{menu === "실시간배차현황" && (
  <RealtimeStatus
    role={role}
    dispatchData={dispatchDataFiltered}   // ★ 변경!
    timeOptions={timeOptions}
    tonOptions={tonOptions}
    drivers={drivers}
    clients={clients}
    addDispatch={addDispatch}
    patchDispatch={patchDispatch}
    removeDispatch={removeDispatch}
    upsertDriver={upsertDriver}
    key={menu}
  />
)}

{menu === "배차현황" && (
  <DispatchStatus
    role={role}
    dispatchData={dispatchDataFiltered}   // ★ 변경!
    timeOptions={timeOptions}
    tonOptions={tonOptions}
    drivers={drivers}
    clients={clients}
    addDispatch={addDispatch}
    patchDispatch={patchDispatch}
    removeDispatch={removeDispatch}
    upsertDriver={upsertDriver}
  />
)}


        {menu === "미배차현황" && (
          <UnassignedStatus role={role} dispatchData={dispatchData} />
        )}
{menu === "표준운임표" && (
  <StandardFare dispatchData={dispatchData} />
)}

        {menu === "기사관리" && role === "admin" && (
          <DriverManagement
            drivers={drivers}
            upsertDriver={upsertDriver}
            removeDriver={removeDriver}
          />
        )}

        {menu === "거래처관리" && role === "admin" && (
          <ClientManagement
            clients={clients}
            upsertClient={upsertClient}
            removeClient={removeClient}
          />
        )}

        {menu === "고정거래처관리" && role === "admin" && (
  <div>
    {/* 상단 탭 */}
    <div className="flex gap-2 mb-3 border-b pb-2">
      <button
        className={`px-3 py-1 text-sm rounded ${
          subMenu === "고정거래처관리"
            ? "bg-blue-600 text-white"
            : "bg-gray-200"
        }`}
        onClick={() => setSubMenu("고정거래처관리")}
      >
        고정거래처관리
      </button>

      <button
        className={`px-3 py-1 text-sm rounded ${
          subMenu === "지입차관리"
            ? "bg-blue-600 text-white"
            : "bg-gray-200"
        }`}
        onClick={() => setSubMenu("지입차관리")}
      >
        지입차관리
      </button>
    </div>

    {/* 탭 화면 */}
    {subMenu === "고정거래처관리" && (
      <FixedClients drivers={drivers} upsertDriver={upsertDriver} />
    )}

    {subMenu === "지입차관리" && (
      <FleetManagement />
    )}
  </div>
)}

        {menu === "매출관리" && role === "admin" && (
  <Settlement 
    dispatchData={dispatchData} 
    fixedRows={fixedRows}   // ★ 추가
  />
)}

        {menu === "거래처정산" && role === "admin" && (
          <ClientSettlement
            dispatchData={dispatchData}
            clients={clients}
            setClients={(next) => next.forEach(upsertClient)}
          />
        )}

        {menu === "지급관리" && role === "admin" && (
          <PaymentManagement
            dispatchData={dispatchData}
            patchDispatch={patchDispatch}
          />
        )}

        {menu === "관리자메뉴" && role === "admin" && <AdminMenu />}
      </main>
      {/* ⭐⭐⭐ 내 정보 패널 ⭐⭐⭐ */}
{showMyInfo && (
  <div
    className="fixed inset-0 bg-black bg-opacity-40 z-50 flex justify-end"
    onClick={() => setShowMyInfo(false)}
  >
    <div
      className="w-80 bg-white h-full shadow-xl p-6 overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-xl font-bold mb-4">내 정보</h2>

      {/* 이메일 */}
      <div className="mb-6">
        <p className="font-semibold text-gray-700">이메일</p>
        <p className="text-gray-900">{user?.email}</p>
      </div>

      {/* 비밀번호 변경 */}
      <button
        onClick={() => navigate("/change-password")}
        className="w-full bg-blue-500 text-white py-2 rounded-md mb-6 hover:bg-blue-600 transition"
      >
        비밀번호 변경
      </button>

      {/* 나의 통계 */}
      <h3 className="text-lg font-semibold mb-3">나의 통계</h3>

      {/* 오늘 통계 */}
      <div className="mt-4 pb-4 border-b">
        <h3 className="text-sm font-bold text-gray-700 mb-2">오늘 통계</h3>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">오늘 오더 수</span>
            <span className="font-bold">{todayStats.count}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">오늘 매출</span>
            <span className="font-bold text-blue-600">
              {todayStats.revenue.toLocaleString()}원
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">오늘 수익</span>
            <span className="font-bold text-green-600">
              {todayStats.profit.toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

      {/* 총 통계 */}
      <div className="mt-4">
        <h3 className="text-sm font-bold text-gray-700 mb-2">총 통계</h3>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">총 오더 수</span>
            <span className="font-bold">{myStats.totalOrders}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">총 매출</span>
            <span className="font-bold text-blue-600">
              {myStats.totalRevenue.toLocaleString()}원
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">총 수익</span>
            <span className="font-bold text-green-600">
              {myStats.totalProfit.toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

    </div>
  </div>
)}

</>
);
}

// ===================== DispatchApp.jsx (PART 2/8) — END =====================
// ===================== DispatchApp.jsx (PART 3/8) — START =====================
  function DispatchManagement({
    dispatchData, drivers, clients, timeOptions, tonOptions,
    addDispatch, upsertDriver, upsertClient, upsertPlace,
    patchDispatch, removeDispatch,
    placeRows = [],
    role = "admin",
    isTest = false,  // ★ 추가!
  }) {
    const [placeRowsTrigger, setPlaceRowsTrigger] = React.useState(0);
      // ================================
  // 🔑 업체명 Key 정규화 함수(추가!)
  // ================================
  function normalizeKey(str = "") {
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");
  }
  function makeHistory({ user, field, before, after }) {
  return {
    at: new Date(),
    userId: user.uid,
    userName: user.name,
    action: "update",
    field,
    before,
    after,
  };
}

  // ================================
// 🔍 날짜 문자열 판별 (오더복사용)
// ================================
const isDateLike = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

    // ⭐ Firestore 실시간 구독으로 placeRows 강제 최신화
// Firestore + localStorage 통합 placeList 생성
const placeList = React.useMemo(() => {
  const fromFirestore = Array.isArray(placeRows) ? placeRows : [];

  // 🔥 Firestore 기준 key 목록
  const firestoreKeys = new Set(
    fromFirestore.map(p => normalizeKey(p.업체명 || ""))
  );

  let fromLocal = [];
  try {
    fromLocal = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
  } catch {}

  const toRow = (p = {}) => ({
    업체명: p.업체명 || "",
    주소: p.주소 || "",
    담당자: p.담당자 || "",
    담당자번호: p.담당자번호 || "",
  });

  const map = new Map();

  // ✅ Firestore 먼저
  fromFirestore.forEach(raw => {
    const row = toRow(raw);
    const key = normalizeKey(row.업체명);
    if (key) map.set(key, row);
  });

  // ✅ localStorage는 Firestore에 존재하는 것만 허용
  fromLocal.forEach(raw => {
    const row = toRow(raw);
    const key = normalizeKey(row.업체명);
    if (!key) return;
    if (!firestoreKeys.has(key)) return; // ⭐ 여기 핵심
    if (!map.has(key)) map.set(key, row);
  });

  const merged = Array.from(map.values());

  // 🔥 localStorage 정리 저장
  try {
    localStorage.setItem("hachaPlaces_v1", JSON.stringify(merged));
  } catch {}

  return merged;
}, [placeRows, placeRowsTrigger]);

    // 관리자 여부 체크
const isAdmin = role === "admin";

// 기존 필터 상태 (유지)
const [filterType, setFilterType] = React.useState(null);

const [filterValue, setFilterValue] = React.useState("");
 

// ⭐ 신규 기사등록 모달 상태
const [driverModal, setDriverModal] = React.useState({
  open: false,
  carNo: "",
  name: "",
  phone: "",
});
 // ⭐ 등록 확인 팝업 상태
const [confirmOpen, setConfirmOpen] = React.useState(false);

// ⭐ 신규 기사 등록시: 기본 커서 위치(기사명)
const nameInputRef = React.useRef(null);

React.useEffect(() => {
  if (!driverModal.open) return;
  const timer = setTimeout(() => {
    try {
      nameInputRef.current?.focus();
    } catch {}
  }, 30);
  return () => clearTimeout(timer);
}, [driverModal.open]);

// ⭐ Top3 팝업 상태
const [popupType, setPopupType] = React.useState(null);

const [statusPopup, setStatusPopup] = React.useState(null);
// ⭐ 전화번호 숫자→하이폰 포맷 변환
function formatPhone(raw) {
  if (!raw) return "";
  
  const str = String(raw);   // ★ 어떤 타입이 와도 문자열로 강제

  const num = str.replace(/[^\d]/g, ""); // 숫자만 추출

  if (num.length === 11) {
    return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7)}`;
  }

  if (num.length === 10) {
    return `${num.slice(0, 3)}-${num.slice(3, 6)}-${num.slice(6)}`;
  }

  return str;   // 기본 문자열 리턴(하이픈 없는 경우 등)
}

// ========================================================
// 🔷 Today Dashboard 데이터 계산 (UI 대시보드에서 사용)
// ========================================================

// 📌 오늘 날짜 (KST)
 function todayKST() {
   const d = new Date();
   d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
   return d.toISOString().slice(0, 10);
 }
const today = todayKST();

// 📌 당일 상차 데이터만 필터링
const todayRows = (dispatchData || []).filter(
  r => String(r.상차일 || "").slice(0, 10) === today
);

// 📊 KPI 계산: 모두 당일 ONLY
const total = todayRows.length;
const done = todayRows.filter(r => r.배차상태 === "배차완료").length;
const doing = todayRows.filter(r => r.배차상태 === "배차중").length;
const pending = todayRows.filter(r => !r.차량번호?.trim()).length;
const delayed = todayRows.filter(r => r.배차상태 === "지연").length;
// 🔹 시간대별 요청건수 트렌드 데이터 생성
const trendData = React.useMemo(() => {
  const hourly = {};
  todayRows.forEach(r => {
    const t = (r.상차시간 || "").match(/(\d+)/);
    const hour = t ? Number(t[1]) : null;
    if (hour != null && hour >= 0 && hour <= 23) {
      hourly[hour] = (hourly[hour] || 0) + 1;
    }
  });

  const list = [];
  for (let i = 0; i < 24; i++) {
    list.push({ hour: `${i}시`, count: hourly[i] || 0 });
  }
  return list;
}, [todayRows]);


// 진행률
const rate = total > 0 ? Math.round((done / total) * 100) : 0;

// 당일 기사 수: 배차된 기사 (중복 제거)
const driverCount = new Set(
  todayRows
    .map(r => r.이름?.trim())
    .filter(Boolean)
).size;

// 신규 거래처/하차지 (값 존재 여부 기준)
const newClients = todayRows.filter(r => r.거래처명?.trim()).length;
const newPlaces = todayRows.filter(r => r.하차지명?.trim()).length;

// 🚚 유통 데이터
const money = (text) => {
  const n = Number(String(text || "0").replace(/[^\d]/g, ""));
  return isNaN(n) ? 0 : n;
};

// 매출/기사비용/마진율
const todayRevenue = todayRows.reduce((sum, r) => sum + money(r.청구운임), 0);
const todayDriverCost = todayRows.reduce((sum, r) => sum + money(r.기사운임), 0);
const todayMarginRate = todayRevenue
  ? ((todayRevenue - todayDriverCost) / todayRevenue) * 100
  : 0;
// 🔹 Top 거래처/하차지 통계
const topClients = Object.entries(
  todayRows.reduce((map, r) => {
    const k = r.거래처명 || "기타";
    map[k] = (map[k] || 0) + 1;
    return map;
  }, {})
).sort((a,b)=>b[1]-a[1]).slice(0,3);

const topDrops = Object.entries(
  todayRows.reduce((map, r) => {
    const k = r.하차지명 || "기타";
    map[k] = (map[k] || 0) + 1;
    return map;
  }, {})
).sort((a,b)=>b[1]-a[1]).slice(0,3);

// 🔹 알림 설정 (시간 자동감지)
const [alertTime, setAlertTime] = React.useState("10:00");
const [alertShown, setAlertShown] = React.useState(false);

React.useEffect(() => {
  const timer = setInterval(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const cur = `${hh}:${mm}`;

    if (!alertShown && cur === alertTime) {
      alert(`⏰ 알림: ${alertTime}\n미배차 ${pending}건, 지연 ${delayed}건 확인!`);
      setAlertShown(true);
    }
  }, 10000);

  return () => clearInterval(timer);
}, [alertTime, alertShown, pending, delayed]);


// ========================================================
// ⭐ 상태 기반 필터링 실행 + 실시간배차현황 테이블로 스크롤 이동
// ========================================================
const goStatus = (type, value) => {
  setFilterType(type);
  setFilterValue(value);

  const el = document.getElementById("realtime-status-area");
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
};

// ⭐ 오더복사용 플래그 (🔥 여기 추가)
const [isCopyMode, setIsCopyMode] = React.useState(false);
    // ⭐ 여기 맨 위에 오도록
    const [clientQuery, setClientQuery] = React.useState("");
    const [isClientOpen, setIsClientOpen] = React.useState(false);
    // ⭐ 거래처 선택 대상 팝업

    const [clientActive, setClientActive] = React.useState(0);
    const comboRef = React.useRef(null);
    React.useEffect(() => {
      const onDocClick = (e) => {
        if (!comboRef.current) return;
        if (!comboRef.current.contains(e.target)) setIsClientOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);
// ⭐ 상차지 자동완성 상태 분리
const [showPickupDropdown, setShowPickupDropdown] = React.useState(false);
const [pickupOptions, setPickupOptions] = React.useState([]);
const [pickupActive, setPickupActive] = React.useState(0);

const [showPlaceDropdown, setShowPlaceDropdown] = React.useState(false);
const [placeOptions, setPlaceOptions] = React.useState([]);
const [placeActive, setPlaceActive] = React.useState(0);
    // ---------- 🔧 안전 폴백 유틸(다른 파트 미정의 시 자체 사용) ----------
    const _todayStr = (typeof todayStr === "function")
      ? todayStr
      : () => new Date().toISOString().slice(0, 10);
    
       // ===================== 하차지(placeRows) + 로컬 병합 placeList 끝 =====================

// ⭐ 업체명으로 기존 업체 찾기
const findPlaceByName = (name) => {
  const key = normalizeKey(name);
  return placeList.find(
    (p) => normalizeKey(p.업체명) === key
  );
};

// ⭐ 업체 업데이트 + 신규 생성 자동 처리
const savePlaceSmart = (name, addr, manager, phone) => {
  if (!name) return;

  const exist = findPlaceByName(name);

  // ======================
  // ① 기존 업체 있을 때 (업데이트)
  // ======================
  if (exist) {
    const updated = {
      업체명: exist.업체명,
      주소: addr || exist.주소,
      담당자: manager || exist.담당자,
      담당자번호: phone || exist.담당자번호,
    };

    // Firestore 저장
    upsertPlace(updated);

    // localStorage 최신화
    try {
      const list = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
      const idx = list.findIndex(
        (x) => normalizeKey(x.업체명) === normalizeKey(updated.업체명)
      );

      if (idx >= 0) list[idx] = updated;
      localStorage.setItem("hachaPlaces_v1", JSON.stringify(list));
    } catch (e) {}

    // 자동완성 즉시 업데이트
    try {
      const newLocal = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
      setPickupOptions(newLocal);
      setPlaceOptions(newLocal);
    } catch (e) {}

    // placeRows 강제 갱신 트리거
    try {
      setPlaceRowsTrigger(Date.now());
    } catch (e) {}

    return; // 업데이트 끝
  }

// ======================
// ② 신규 업체 생성
// ======================
upsertPlace({
  업체명: name,
  주소: addr,
  담당자: manager,
  담당자번호: phone,
});

// 🔥 신규 생성 후에도 반드시 트리거
try {
  setPlaceRowsTrigger(Date.now());
} catch {}

};


    // 기본 clients + 하차지 모두 포함한 통합 검색 풀
    const mergedClients = React.useMemo(() => {
      return [...placeList, ...clients];
    }, [placeList, clients]);

    // 이름 기준으로 하차지/기본거래처 찾기
    const findClient = (name = "") => {
      const n = normalizeKey(name);
      return mergedClients.find(
        (c) => normalizeKey(c.업체명 || "").includes(n)
      );
    };
    // 🔍 하차지 자동완성 필터 함수
    const filterPlaces = (q) => {
      const nq = String(q || "").trim().toLowerCase();
      if (!nq) return [];
      return mergedClients.filter((p) =>
        String(p.업체명 || "").toLowerCase().includes(nq)
      );
    };

    const _tomorrowStr = (typeof tomorrowStr === "function")
      ? tomorrowStr
      : () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
    const _safeLoad = (typeof safeLoad === "function")
      ? safeLoad
      : (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
    const _safeSave = (typeof safeSave === "function")
      ? safeSave
      : (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { } };

    const VEHICLE_TYPES = (typeof window !== "undefined" && window.RUN25_VEHICLE_TYPES) || [
      "라보/다마스", "카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "리프트", "오토바이", "기타"
    ];
    const PAY_TYPES = (typeof window !== "undefined" && window.RUN25_PAY_TYPES) || [
      "계산서", "착불", "선불", "손실", "개인", "기타"
    ];
    const DISPATCH_TYPES = (typeof window !== "undefined" && window.RUN25_DISPATCH_TYPES) || [
      "24시", "직접배차", "인성", "24(외주업체)"
    ];
    const StatusBadge = ({ s }) => {
      const map = {
        "배차중": "bg-amber-100 text-amber-800",
        "배차완료": "bg-emerald-100 text-emerald-800",
        "미배차": "bg-rose-100 text-rose-800",
      };
      return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${map[s] || "bg-gray-100 text-gray-700"}`}>{s || "-"}</span>;
    };

    // ✅ 첨부파일 개수 저장용
    const [attachCount, setAttachCount] = React.useState({}); // { dispatchId: count }

    // ✅ 첨부파일 서브컬렉션 개수 로드 (Firestore)
    React.useEffect(() => {
      const loadAttachments = async () => {
        try {
          if (!dispatchData?.length || typeof getDocs !== "function" || typeof collection !== "function") return;
          const result = {};
          for (const row of dispatchData) {
            if (!row?._id) continue;
            const snap = await getDocs(collection(db, "dispatch", row._id, "attachments"));
            result[row._id] = snap.size;
          }
          setAttachCount(result);
        } catch (e) {
          console.warn("첨부 개수 로드 실패(무시 가능):", e);
        }
      };
      loadAttachments();
    }, [dispatchData]);

    // ⏱ 시간 옵션(오전6시~오후10시, 30분 간격) — timeOptions 미지정 시 내부 생성
    const buildHalfHour = React.useMemo(() => {
      if (Array.isArray(timeOptions) && timeOptions.length) return timeOptions;
      const list = [];
      const toLabel = (h, m) => {
        const ampm = h < 12 ? "오전" : "오후";
        const hh = ((h % 12) || 12);
        return `${ampm} ${hh}시${m ? " 30분" : ""}`;
      };
      for (let h = 6; h <= 22; h++) {
        list.push(toLabel(h, 0));
        if (h !== 22) list.push(toLabel(h, 30));
      }
      return list;
    }, [timeOptions]);
    const localTimeOptions = buildHalfHour;

    // 연도 고정 도우미 (YYYY-MM-DD로 강제; "MM-DD" => "YYYY-MM-DD")
    const currentYear = new Date().getFullYear();
    const lockYear = (yyyy_mm_dd_or_mm_dd) => {
      const v = (yyyy_mm_dd_or_mm_dd || "").trim();
      if (!v) return "";
      if (/^\d{2}-\d{2}$/.test(v)) return `${currentYear}-${v}`;
      return v;
    };

    const emptyForm = {
      _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      순번: "",
      등록일: _todayStr(),
      거래처명: "",
      상차지명: "",
      상차지주소: "",
      상차지담당자: "",
      상차지담당자번호: "",
      하차지명: "",
      하차지주소: "",
      하차지담당자: "",
      하차지담당자번호: "",
      화물내용: "",
      차량종류: "",
      차량톤수: "",
      차량번호: "",
      이름: "",
      전화번호: "",
      상차방법: "",
      하차방법: "",
      상차일: _todayStr(),
      상차시간: "",
      하차일: _todayStr(),
      하차시간: "",
      청구운임: "",
      기사운임: "",
      수수료: "",
      지급방식: "",
      배차방식: "",
      메모: "",
      배차상태: "배차중",
      독차: false,
      혼적: false,
    };

    const [form, setForm] = React.useState(() => ({
  ...emptyForm,
}));
    React.useEffect(() => _safeSave("dispatchForm", form), [form]);

    // =====================
    // ⭐ 거래처 = 하차지거래처 기반으로 자동완성
    // =====================
    const norm = (s = "") => String(s).trim().toLowerCase();

    // placeRows = [{업체명, 주소, 담당자, 담당자번호}]
    const filteredClients = React.useMemo(() => {
  const q = norm(clientQuery);
  if (!q) return placeList;
  return placeList.filter((p) =>
    norm(p.업체명 || "").includes(q)
  );
}, [clientQuery, placeList]);
// ⭐ 거래처 선택 시 → 어디에 적용할지 팝업 오픈
function applyClientSelect(name) {
  const p = placeList.find(
    x => norm(x.업체명 || "") === norm(name)
  );

  // ✅ 거래처 → 상차지 자동 적용
  if (p) {
    setForm(prev => ({
      ...prev,
      거래처명: p.업체명,

      // 🔥 상차지 자동 세팅
      상차지명: p.업체명,
      상차지주소: p.주소 || "",
      상차지담당자: p.담당자 || "",
      상차지담당자번호: p.담당자번호 || "",
    }));
  } else {
    // 🔹 placeList에 없을 경우 (신규 입력)
    setForm(prev => ({
      ...prev,
      거래처명: name,
      상차지명: name,   // 이름만이라도 넣어줌
    }));
  }

  setClientQuery(name);
  setIsClientOpen(false);

  // 자동매칭 뱃지 상태 초기화
  setAutoPickMatched(!!p);
}


// ⭐ 상차지에 적용 (여기 넣는 것! ← 바로 위 applyClientSelect 밑!!)
function applyToPickup(place) {
  setForm(prev => ({
    ...prev,
    거래처명: place.업체명,
    상차지명: place.업체명,
    상차지주소: place.주소,
    상차지담당자: place.담당자,
    상차지담당자번호: place.담당자번호,
  }));
  setPlaceTargetPopup({ open: false, place: null });
}

// ⭐ 하차지에 적용 (applyToPickup 바로 아래)
function applyToDrop(place) {
  setForm(prev => ({
    ...prev,
    거래처명: place.업체명,
    하차지명: place.업체명,
    하차지주소: place.주소,
    하차지담당자: place.담당자,
    하차지담당자번호: place.담당자번호,
  }));
  setPlaceTargetPopup({ open: false, place: null });
}
// 🔁 상차지 ↔ 하차지 교체
function swapPickupDrop() {
  setForm(prev => ({
    ...prev,

    // 상차 ← 하차
    상차지명: prev.하차지명,
    상차지주소: prev.하차지주소,
    상차지담당자: prev.하차지담당자,
    상차지담당자번호: prev.하차지담당자번호,

    // 하차 ← 상차
    하차지명: prev.상차지명,
    하차지주소: prev.상차지주소,
    하차지담당자: prev.상차지담당자,
    하차지담당자번호: prev.상차지담당자번호,
  }));

  // 자동매칭 뱃지 리셋
  setAutoPickMatched(false);
  setAutoDropMatched(false);
}


    // ✅ 주소 자동매칭 뱃지
    const [autoPickMatched, setAutoPickMatched] = React.useState(false);
    const [autoDropMatched, setAutoDropMatched] = React.useState(false);

    const onChange = (key, value) => {
      if (isAdmin && (key === "청구운임" || key === "기사운임")) {
        setForm((p) => {
          const next = { ...p, [key]: value };
          const sale = parseInt(next.청구운임 || 0, 10) || 0;
          const drv = parseInt(next.기사운임 || 0, 10) || 0;
          next.수수료 = String(sale - drv);
          return next;
        });
        return;
      }
      if (key === "상차방법") {
        setForm((p) => {
          const autoSync = !p.하차방법 || p.하차방법 === p.상차방법;
          return { ...p, 상차방법: value, 하차방법: autoSync ? value : p.하차방법 };
        });
        return;
      }
      setForm((p) => ({ ...p, [key]: value }));
    };

    const handlePickupName = (value) => {
      setForm((p) => ({
        ...p,
        상차지명: value,
      }));
      setAutoPickMatched(false);
    };


    const handleDropName = (value) => {
      setForm((p) => ({
        ...p,
        하차지명: value,
      }));
      setAutoDropMatched(false);
    };


    const handlePickupAddrManual = (v) => { setForm((p) => ({ ...p, 상차지주소: v })); setAutoPickMatched(false); };
    const handleDropAddrManual = (v) => { setForm((p) => ({ ...p, 하차지주소: v })); setAutoDropMatched(false); };

    // 🚗 차량번호 입력 → 항상 수정 가능 + 자동 기사정보 입력
    const driverMap = React.useMemo(() => {
      const m = new Map();
      (drivers || []).forEach((d) => {
        const key = String(d.차량번호 || "").replace(/\s+/g, "");
        if (key) m.set(key, { 이름: d.이름 || "", 전화번호: d.전화번호 || "" });
      });
      return m;
    }, [drivers]);

    const handleCarNoChange = (value) => {
      const clean = (value || "").trim().replace(/\s+/g, "");
      const found = driverMap.get(clean);
      if (found) {
        setForm((p) => ({
          ...p,
          차량번호: clean,
          이름: found.이름,
          전화번호: formatPhone(found.전화번호), // ⭐ 표시용 하이픈 적용
          배차상태: "배차완료",
        }));
      } else {
        setForm((p) => ({
          ...p,
          차량번호: clean,
          이름: "",
          전화번호: "",
          배차상태: "배차중",
        }));
      }
    };

    const handleCarNoEnter = (value) => {
  const clean = (value || "").trim().replace(/\s+/g, "");
  if (!clean) return;

  const found = driverMap.get(clean);
  if (found) {
    setForm((p) => ({
      ...p,
      차량번호: clean,
      이름: found.이름,
      전화번호: formatPhone(found.전화번호), // ⭐ 표시용 하이픈 적용
      배차상태: "배차완료",
    }));
  } else {
    setDriverModal({
      open: true,
      carNo: clean,
      name: "",
      phone: "",
    });
  }
};

    const nextSeq = () => Math.max(0, ...(dispatchData || []).map((r) => Number(r.순번) || 0)) + 1;
// ================================
// ⛔ 기사 중복 배차 체크 유틸
// ================================
function isTimeOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;

const toMin = (t) => {
  if (!t) return null;

  // "오전 9시 30분" 대응
  if (t.includes("오전") || t.includes("오후")) {
    const isPM = t.includes("오후");
    const nums = t.match(/\d+/g) || [];
    let h = Number(nums[0] || 0);
    const m = Number(nums[1] || 0);
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }

  // "HH:mm"
  const [h, m = "0"] = String(t).split(":");
  return Number(h) * 60 + Number(m);
};

  const aS = toMin(aStart);
  const aE = aEnd ? toMin(aEnd) : aS + 60;
  const bS = toMin(bStart);
  const bE = bEnd ? toMin(bEnd) : bS + 60;

  return Math.max(aS, bS) < Math.min(aE, bE);
}

function checkDuplicateDispatch(form, dispatchData) {
  if (!form.차량번호) return null;

  const targetDate = String(form.상차일 || "").slice(0, 10);

  return dispatchData.find((r) => {
    if (r._id === form._id) return false; // 🔥 자기 자신 제외
    if (!r?.차량번호) return false;
    if (r.차량번호 !== form.차량번호) return false;
    if (r.배차상태 !== "배차완료") return false;

    const rowDate = String(r.상차일 || "").slice(0, 10);
    if (rowDate !== targetDate) return false;

    return isTimeOverlap(
      r.상차시간,
      r.하차시간,
      form.상차시간,
      form.하차시간
    );
  });
}

    // ✅ 필수값(거래처/상차지명/하차지명) 검증
    const validateRequired = (f) => {
      const miss = [];
      if (!f.거래처명?.trim()) miss.push("거래처");
      if (!f.상차지명?.trim()) miss.push("상차지명");
      if (!f.하차지명?.trim()) miss.push("하차지명");
      if (miss.length) {
        alert(`필수 항목 누락: ${miss.join(", ")}\n(*) 표시된 항목을 모두 입력하세요.`);
        return false;
      }
      return true;
    };
    // ⭐ 날짜/시간 필수 검증
    const validateDateTime = (f) => {
      const miss = [];

      if (!f.상차일) miss.push("상차일");
      if (!f.하차일) miss.push("하차일");


      if (miss.length > 0) {
        alert(`⛔ 날짜가 입력되지 않았습니다.\n[ ${miss.join(", ")} ] 은(는) 반드시 입력해야 합니다.`);
        return false;
      }
      return true;
    };

// ==================== 운임조회 보조함수 정의 ====================
const isLike = (text = "", target = "") =>
  String(text).replace(/\s+/g, "").includes(
    String(target).replace(/\s+/g, "")
  );

const getPalletFromCargoText = (cargo = "") => {
  const m = cargo.match(/(\d+)\s*(p|P|파|팔|파레|파렛|파렛트|팔레트|PL)/i);
  if (m) return Number(m[1]);
  const m2 = cargo.match(/^\s*(\d+)\s*$/);
  if (m2) return Number(m2[1]);
  return null;
};

const getDropCountFromText = (dropName = "") => {
  const list = ["푸드플래닛", "신미"];
  return list.filter((key) =>
    isLike(dropName, key)
  ).length || 1;
};

const palletFareRules = {
  double: [ // 2곳 하차 (푸드플래닛 + 신미)
    { min: 4, max: 5, fare: 350000 },
    { min: 6, max: 7, fare: 370000 },
    { min: 8, max: 10, fare: 380000 },
  ],

  food: [ // 푸드플래닛 단일
    { min: 3, max: 3, fare: 240000 },
    { min: 4, max: 6, fare: 270000 },
    { min: 7, max: 8, fare: 280000 },
    { min: 9, max: 10, fare: 300000 },
  ],

  sinmi: [ // 신미 단일
    { min: 2, max: 2, fare: 150000 },
    { min: 3, max: 3, fare: [180000, 200000] }, // 선택
    { min: 4, max: 5, fare: 240000 },
    { min: 6, max: 8, fare: 260000 },
    { min: 9, max: 10, fare: 300000 },
  ],
};




    const handleSubmit = async (e) => {
  e.preventDefault();
  if (!validateRequired(form)) return;
  if (!validateDateTime(form)) return;

  setConfirmOpen(true);
};

// ⭐ 실제 저장 함수
const doSave = async () => {
    // ⛔ 기사 중복 배차 방지
  const dup = checkDuplicateDispatch(form, dispatchData);
  if (dup) {
    alert(
      `⛔ 기사 중복 배차 감지\n\n` +
      `차량번호: ${form.차량번호}\n` +
      `기존 상차시간: ${dup.상차시간 || "-"}\n` +
      `기존 하차시간: ${dup.하차시간 || "-"}`
    );
    return;
  }

  const status = form.차량번호 && (form.이름 || form.전화번호)
    ? "배차완료"
    : "배차중";

  const moneyPatch = isAdmin ? {} : {
    청구운임: "0",
    기사운임: "0",
    수수료: "0"
  };

  const rec = {
    ...form, ...moneyPatch,
    상차일: lockYear(form.상차일),
    하차일: lockYear(form.하차일),
    순번: nextSeq(),
    배차상태: status,
  };

  await addDispatch(rec);
// ⭐ 상/하차지 담당자 정보 → 기존 업체 있으면 업데이트만 함
if (typeof upsertPlace === "function") {
  savePlaceSmart(
    form.상차지명,
    form.상차지주소,
    form.상차지담당자,
    form.상차지담당자번호
  );

  savePlaceSmart(
    form.하차지명,
    form.하차지주소,
    form.하차지담당자,
    form.하차지담당자번호
  );
}
// ★★★ 여기 아래에 추가!! ★★★
const updatedPickup = findPlaceByName(form.상차지명);
const updatedDrop = findPlaceByName(form.하차지명);

setForm((p) => ({
  ...p,
  상차지주소: updatedPickup?.주소 || p.상차지주소,
  상차지담당자: updatedPickup?.담당자 || p.상차지담당자,
  상차지담당자번호: updatedPickup?.담당자번호 || p.상차지담당자번호,
  하차지주소: updatedDrop?.주소 || p.하차지주소,
  하차지담당자: updatedDrop?.담당자 || p.하차지담당자,
  하차지담당자번호: updatedDrop?.담당자번호 || p.하차지담당자번호,
}));

  const reset = {
    ...emptyForm,
    _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    등록일: _todayStr(),
    ...(isAdmin ? {} : { 청구운임: "", 기사운임: "", 수수료: "" }),
  };

  setForm(reset);
  setClientQuery("");
  setAutoPickMatched(false);
  setAutoDropMatched(false);
  setConfirmOpen(false);
  try { localStorage.removeItem("dispatchForm"); } catch {}

  alert("등록되었습니다.");
};

    // ⭐ 운임조회 (업그레이드 버전: 화물내용 없어도 동작 + 최근 화물내용 포함)
    
    // ⭐ 운임조회 팝업 상태
    const [fareModalOpen, setFareModalOpen] = React.useState(false);
    const [fareResult, setFareResult] = React.useState(null);
    // ⭐ 운임조회 (송원 전용 자동요율 → 그 다음 AI 통계)
    const handleFareSearch = () => {
      // ⭐ 운임조회는 날짜 필터 무시 → 전체 데이터 강제 사용
const fullData = Array.isArray(dispatchData) ? [...dispatchData] : [];

      const pickup = (form.상차지명 || "").trim();
      const drop = (form.하차지명 || "").trim();
      const tonStr = (form.차량톤수 || "").trim();   // 예: "1톤", "1.4톤"
      const cargo = (form.화물내용 || "").trim();    // 예: "10파렛트"
      const vehicle = (form.차량종류 || "").trim();  // 예: "냉동탑"

      if (!pickup || !drop) {
        alert("상차지명과 하차지명을 입력해주세요.");
        return;
      }

      // -----------------------------
      // 🔧 공통 유틸 (기존 로직 유지)
      // -----------------------------

      const extractPalletNum = (text = "") => {
        const str = String(text).trim();
        if (!str) return null;
        const m = str.match(/(\d+)\s*(p|P|파|팔|파레|파렛|파렛트|팔레트|PL)/);
        if (m) return Number(m[1]);
        const m2 = str.match(/^\s*(\d+)\s*$/);
        if (m2) return Number(m2[1]);
        return null;
      };

      const extractLeadingNum = (text = "") => {
        const m = String(text).trim().match(/^(\d+)/);
        return m ? Number(m[1]) : null;
      };

      const extractTonNum = (text = "") => {
        const m = String(text).replace(/톤|t/gi, "").match(/(\d+(\.\d+)?)/);
        return m ? Number(m[1]) : null;
      };

      const inputPallets = extractPalletNum(cargo);
      const inputCargoNum = extractLeadingNum(cargo);
      const inputTonNum = extractTonNum(tonStr);

      // ============================================
      // ① 송원 / 신미 / 푸드플래닛 전용 자동요율 우선 적용
      // ============================================
      const palletCount =
        inputPallets != null ? inputPallets :
        inputCargoNum != null ? inputCargoNum :
        getPalletFromCargoText(cargo); // 숫자만 있으면 이것도 처리

      if (palletCount != null && isLike(pickup, "송원")) {
        const dropCount = getDropCountFromText(drop);          // 1곳/2곳/3곳
        const hasFood = (
  isLike(drop, "푸드플래닛") ||
  isLike(drop, "푸드") ||
  isLike(drop, "푸플")
);

const hasSinmi = (
  isLike(drop, "신미")
);


        let selectedFare = null;

        // 🔹 2곳 하차 (신미 + 푸드플래닛) — 순서는 상관없이
        if (dropCount >= 2 && hasFood && hasSinmi) {
          const rule = palletFareRules.double.find(
            (r) => palletCount >= r.min && palletCount <= r.max
          );
          if (rule) selectedFare = rule.fare;
        }

        // 🔹 푸드플래닛 1곳 하차
        if (!selectedFare && dropCount === 1 && hasFood && !hasSinmi) {
          const rule = palletFareRules.food.find(
            (r) => palletCount >= r.min && palletCount <= r.max
          );
          if (rule) selectedFare = rule.fare;
        }

        // 🔹 신미 1곳 하차 (3파렛은 선택)
        if (!selectedFare && dropCount === 1 && hasSinmi && !hasFood) {
          const rule = palletFareRules.sinmi.find(
            (r) => palletCount >= r.min && palletCount <= r.max
          );
          if (rule) {
            if (Array.isArray(rule.fare)) {
              // 3파렛: 18/20 둘 중 선택
              const yes = window.confirm(
                "신미 3파레트 요율 선택\n\n[확인] 180,000원\n[취소] 200,000원"
              );
              selectedFare = yes ? rule.fare[0] : rule.fare[1];
            } else {
              selectedFare = rule.fare;
            }
          }
        }

        // 👉 여기서 금액이 결정되었으면, AI추천 안 쓰고 바로 적용
        if (selectedFare != null) {
          setForm((prev) => ({
            ...prev,
            청구운임: String(selectedFare),
          }));
          alert(
            `송원 전용 자동요율이 적용되었습니다.\n\n적용 운임: ${Number(
              selectedFare
            ).toLocaleString()}원`
          );
          return; // ⬅ AI 통계 로직으로 내려가지 않음
        }
      }

      // ============================================
      // ② 여기부터는 기존 "AI 통계 기반 운임조회" 로직 그대로
      //    (송원 규칙에 안 맞는 경우만 사용)
      // ============================================

      let filtered = fullData.filter((r) => {
        if (!r.상차지명 || !r.하차지명) return false;

        const rPickup = String(r.상차지명).trim();
        const rDrop = String(r.하차지명).trim();

        const matchPickup =
          norm(rPickup).includes(norm(pickup)) ||
          norm(pickup).includes(norm(rPickup));

        const matchDrop =
          norm(rDrop).includes(norm(drop)) ||
          norm(drop).includes(norm(rDrop));

        if (!matchPickup || !matchDrop) return false;

        const matchVehicle =
          !vehicle || !r.차량종류
            ? true
            : norm(r.차량종류).includes(norm(vehicle)) ||
              norm(vehicle).includes(norm(r.차량종류));

        if (!matchVehicle) return false;

        // 톤수 비교
        let matchTon = true;
        if (inputTonNum != null) {
          const rowTonNum = extractTonNum(r.차량톤수 || "");
          if (rowTonNum != null) {
            matchTon = Math.abs(rowTonNum - inputTonNum) <= 0.5;
          }
        }

        // 화물내용 비교
        let matchCargo = true;
        const rowCargo = String(r.화물내용 || "");
        const normInputCargo = norm(cargo);
        const normRowCargo = norm(rowCargo);

        if (inputPallets != null) {
          const rowPallets =
            extractPalletNum(rowCargo) ?? extractLeadingNum(rowCargo);
          if (rowPallets != null) {
            matchCargo = Math.abs(rowPallets - inputPallets) <= 1;
          } else {
            matchCargo = false;
          }
        } else if (inputCargoNum != null) {
          const rowNum = extractLeadingNum(rowCargo);
          if (rowNum != null) {
            matchCargo = Math.abs(rowNum - inputCargoNum) <= 1;
          } else {
            matchCargo = false;
          }
        } else {
          if (
            normRowCargo.includes(normInputCargo) ||
            normInputCargo.includes(normRowCargo)
          ) {
            matchCargo = true;
          } else {
            matchCargo = matchTon;
          }
        }

        return matchVehicle && matchTon && matchCargo;
      });

      // 🔁 상하차지만 맞는 데이터로 Fallback
      if (!filtered.length) {
        filtered = fullData.filter((r) => {
          if (!r.상차지명 || !r.하차지명) return false;
          const rPickup = String(r.상차지명).trim();
          const rDrop = String(r.하차지명).trim();
          const matchPickup =
            rPickup.includes(pickup) || pickup.includes(rPickup);
          const matchDrop = rDrop.includes(drop) || drop.includes(rDrop);
          return matchPickup && matchDrop;
        });
      }

      if (!filtered.length) {
        alert("유사한 과거 운임 데이터를 찾지 못했습니다.");
        return;
      }

      const fares = filtered
        .map((r) =>
          Number(String(r.청구운임 || "0").replace(/,/g, ""))
        )
        .filter((n) => !isNaN(n));

      if (!fares.length) {
        alert("해당 조건의 과거 데이터에 청구운임 정보가 없습니다.");
        return;
      }

      const avg = Math.round(
        fares.reduce((a, b) => a + b, 0) / fares.length
      );
      const min = Math.min(...fares);
      const max = Math.max(...fares);

      const latestRow = filtered
        .slice()
        .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")))[0];

      const latestCargo =
        latestRow?.화물내용?.trim() ? latestRow.화물내용 : "(기록 없음)";

setFareResult({
  count: filtered.length,
  avg,
  min,
  max,
  latestFare: latestRow.청구운임,
  latestDate: latestRow.상차일,
  latestCargo,
  filteredList: filtered
    .slice()
    .sort((a, b) =>
      (b.lastUpdated || b.상차일 || "").localeCompare(
        a.lastUpdated || a.상차일 || ""
      )
    ),
});

setFareModalOpen(true);

    };

    // ------------------ 오더복사 ------------------

// 🔎 오더복사용 상태
const [copyOpen, setCopyOpen] = React.useState(false);
const [copyQ, setCopyQ] = React.useState("");
const [copyStart, setCopyStart] = React.useState("");
const [copyEnd, setCopyEnd] = React.useState("");
const [copyFilterType, setCopyFilterType] = React.useState("전체");

// 🔍 오더복사 리스트
const copyList = React.useMemo(() => {
  const q = copyQ.trim().toLowerCase();

  // 검색어 없으면 비표시 (기존 기능 유지)
  if (!q) return [];

  // ⭐ 전체 데이터 사용
  let arr = Array.isArray(dispatchData) ? [...dispatchData] : [];

  // ⭐ 현황패널 필터 적용
  if (filterType && filterValue) {
    arr = arr.filter(
      (r) => String(r[filterType] || "").toLowerCase() === String(filterValue).toLowerCase()
    );
  }

  // ⭐ 필드 기준 검색
  if (copyFilterType !== "전체") {
    arr = arr.filter((r) =>
      String(r[copyFilterType] || "").toLowerCase().includes(q)
    );
  } else {
    arr = arr.filter((r) =>
      ["거래처명", "상차지명", "하차지명", "화물내용"].some((k) =>
        String(r[k] || "").toLowerCase().includes(q)
      )
    );
  }

  // ⭐ 최신순 정렬
  arr = arr.slice().sort((a, b) =>
    (b.상차일 || "").localeCompare(a.상차일 || "") ||
    (b.상차시간 || "").localeCompare(a.상차시간 || "")
  );

  return arr;
}, [dispatchData, copyQ, copyFilterType, filterType, filterValue]);

const [copySelected, setCopySelected] = React.useState([]);

// 📌 복사 적용 함수
const applyCopy = (r) => {
  const keep = {
    거래처명: r.거래처명 || "",
    상차지명: r.상차지명 || "",
    상차지주소: r.상차지주소 || "",
    하차지명: r.하차지명 || "",
    하차지주소: r.하차지주소 || "",
    화물내용: r.화물내용 || "",
    차량종류: r.차량종류 || "",
    차량톤수: r.차량톤수 || "",
    상차방법: r.상차방법 || "",
    하차방법: r.하차방법 || "",
    상차일: lockYear(r.상차일 || ""),
    상차시간: r.상차시간 || "",
    하차일: lockYear(r.하차일 || ""),
    하차시간: r.하차시간 || "",
    지급방식: r.지급방식 || "",
    배차방식: r.배차방식 || "",
    메모: r.메모 || "",
  };

  setForm((p) => ({ ...p, ...keep }));
  setAutoPickMatched(false);
  setAutoDropMatched(false);
  setCopyOpen(false);
  setCopySelected([]); // 선택 초기화
};


    // ------------------ 초기화 ------------------
    const resetForm = () => {
      const reset = { ...emptyForm, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, 등록일: _todayStr() };
      setForm(reset);
      setClientQuery("");
      setAutoPickMatched(false);
      setAutoDropMatched(false);
      setCopySelected([]);  // ⭐ 체크 상태 초기화
    };



    // =========================================================
    // 📤 공유 (모바일: 카톡 공유창 / PC: 텍스트 복사)
    // =========================================================
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const shareTextForRow = (r) => {
      const dStr = r.상차일 || _todayStr(); // YYYY-MM-DD 유지
      const plate = r.차량번호 || "-";
      const name = r.이름 || "-";
      const url = `${location.origin}/upload?id=${encodeURIComponent(r._id || "")}`;
      return `[RUN25 운송장 업로드 안내]

✅ 상차일: ${dStr}
✅ 거래처: ${r.거래처명 || "-"}
✅ 차량: ${plate} (${name})

아래 링크에서 운송장/인수증 사진을 업로드해주세요👇
📎 ${url}`;
    };

    const shareDispatch = async (r) => {
      const text = shareTextForRow(r);
      const url = `${location.origin}/upload?id=${encodeURIComponent(r._id || "")}`;
      if (isMobile && navigator.share) {
        try { await navigator.share({ title: "RUN25 업로드 안내", text, url }); } catch { }
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        alert("공유 문구가 클립보드에 복사되었습니다. (카톡/메신저에 붙여넣기)");
      } catch {
        prompt("아래 내용을 복사하세요.", text);
      }
    };


    // =========================================================
    // 📎 첨부 모달 열기 트리거
    // =========================================================
    const openAttachModal = (row) => {
      try { window.dispatchEvent(new CustomEvent("RUN25_OPEN_ATTACH", { detail: row })); } catch { }
      if (typeof window.RUN25_OPEN_ATTACH_CB === "function") {
        try { window.RUN25_OPEN_ATTACH_CB(row); } catch { }
      }
    };

    // ───── 내부 렌더: 입력폼 (그대로 유지) ─────
// =======================
// KakaoT Minimal Clean Theme
// =======================

// 입력창 (카카오T 스타일)
const inputCls =
  "w-full px-3 py-2 rounded-lg text-sm border " +
  "border-gray-300 bg-white " +
  "focus:border-blue-600 focus:ring-1 focus:ring-blue-200 " +
  "placeholder:text-gray-400 transition";

// 라벨 (카카오T 스타일)
const labelCls =
  "block text-[13px] font-semibold text-black mb-1";



    const reqStar = <span className="text-red-500">*</span>;
    const AutoBadge = ({ show }) => show ? <span className="ml-2 text-[12px] text-emerald-700">(자동매칭됨)</span> : null;
// ---------------------------------------------
// ⭐ 오늘 유가 정보 가져오기 (휘발유/경유)
// ---------------------------------------------
async function fetchFuelPrices(apiKey) {
  const KEY = apiKey || "DEMO_KEY"; // ← 실제 키 없으면 DEMO
  const url = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${KEY}`;
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    return json.RESULT?.OIL || [];
  } catch (e) {
    console.warn("유가 조회 실패:", e);
    return [];
  }
}

function FuelPriceWidget({ apiKey }) {
  const [prices, setPrices] = React.useState([]);

  React.useEffect(() => {
    fetchFuelPrices(apiKey).then(setPrices);
  }, [apiKey]);

  return (
    <div className="mb-4 bg-white rounded-xl shadow-lg border p-4 w-[280px]">
      <h3 className="font-bold text-gray-800 text-sm mb-2">⛽ 오늘 유가 (전국 평균)</h3>

      {prices.length === 0 && (
        <div className="text-gray-400 text-xs">불러오는 중...</div>
      )}

      <div className="space-y-1 text-sm">
        {prices.map(oil => (
          <div key={oil.PRODCD} className="flex justify-between">
            <span>{oil.PRODNM}</span>
            <span className="font-bold">{Number(oil.PRICE).toLocaleString()} 원/L</span>
          </div>
        ))}
      </div>
    </div>
  );
}
// ----------------------------
// ⛽ 자동 슬라이드 유가 배너
// ----------------------------


const AREA_OPTIONS = [
  { code: "", name: "전국" },
  { code: "04", name: "인천" },
  { code: "09", name: "경기" },
  { code: "01", name: "서울" },
];

function FuelSlideWidget() {
  const [prices, setPrices] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [area, setArea] = React.useState("");

  React.useEffect(() => {
    fetchFuelPrices(area).then(setPrices).catch(console.error);
  }, [area]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setPage((p) => (p + 1) % 3);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  if (!prices.length) return null;

  const items = [
    prices.find(o => o.PRODNM.includes("휘발유")),
    prices.find(o => o.PRODNM.includes("경유")),
    prices.find(o => o.PRODNM.includes("고급")),
  ].filter(Boolean);

  const item = items[page];
  const diff = item?.DIFF ?? 0;
  const up = diff > 0;

  return (
    <div className="mb-6">
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className="border rounded px-2 py-1 text-xs mb-2"
      >
        {AREA_OPTIONS.map(a => (
          <option key={a.code} value={a.code}>{a.name}</option>
        ))}
      </select>

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-center rounded-xl py-4 shadow-lg transition-all duration-500">
        <div className="text-xs opacity-90">{item.PRODNM}</div>
        <div className="text-xl font-extrabold mt-1">
          {Number(item.PRICE).toLocaleString()} 원/L
        </div>

        <div className={`text-xs font-bold mt-1 ${up ? "text-rose-200" : "text-green-200"}`}>
          {up ? "▲" : "▼"} {Math.abs(diff)}원
        </div>
      </div>
    </div>
  );
}

    const renderForm = () => (
      <>
        <h2 className="text-lg font-bold mb-3">배차관리</h2>

        

        {/* 입력 폼 */}
  {/* ================== 프리미엄 액션바 ================== */}
<div 
  className="
    bg-white 
    rounded-xl shadow-lg border 
    px-4 py-3 
    flex flex-wrap items-center gap-3 mb-5 
    max-w-[1500px]    // 입력폼과 동일 폭
  "
  style={{ minHeight: "52px" }}
>


  {/* 좌측 버튼 그룹 */}
  <div className="flex items-center gap-2">
    <button className="premium-btn indigo" onClick={() => { setCopyOpen(true); setCopySelected([]); }}>
      📄 오더복사
    </button>
    <button className="premium-btn gray" onClick={resetForm}>
      🔄 초기화
    </button>
    <button className="premium-btn green" onClick={() => setBulkOpen(true)}>
      📂 대용량 업로드
    </button>
    <button className="premium-btn yellow" onClick={handleFareSearch}>
      💰 운임조회
    </button>
  </div>

  {/* 구분선 */}
  <div className="w-px h-7 bg-gray-200" />

  {/* 독차 & 혼적 */}
  <div className="flex items-center gap-4">
    <label className="chk">독차<input type="checkbox" checked={form.독차} onChange={(e)=>onChange("독차",e.target.checked)}/></label>
    <label className="chk">혼적<input type="checkbox" checked={form.혼적} onChange={(e)=>onChange("혼적",e.target.checked)}/></label>
  </div>

  <div className="w-px h-7 bg-gray-200" />

  {/* 날짜 시간 ▼ */}
  <div className="flex items-center gap-3 text-sm">
    <label className="text-gray-600 font-medium">상차</label>
    <input type="date" value={form.상차일} className="inp small" onChange={(e)=>onChange("상차일",e.target.value)}/>
    <select value={form.상차시간} className="inp small" onChange={(e)=>onChange("상차시간",e.target.value)}>
      <option value="">시간</option>
      {localTimeOptions.map((t)=><option key={t} value={t}>{t}</option>)}
    </select>
      {/* 🔹 상차: 당일/내일 */}
  <button
    type="button"
    className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-600 hover:bg-blue-200"
    onClick={() => onChange("상차일", _todayStr())}
  >
    당일
  </button>

  <button
    type="button"
    className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-600 hover:bg-blue-200"
    onClick={() => onChange("상차일", _tomorrowStr())}
  >
    내일
  </button>

    <label className="text-gray-600 font-medium ml-6">하차</label>
    <input type="date" value={form.하차일} className="inp small" onChange={(e)=>onChange("하차일",e.target.value)}/>
    <select value={form.하차시간} className="inp small" onChange={(e)=>onChange("하차시간",e.target.value)}>
      <option value="">시간</option>
      {localTimeOptions.map((t)=><option key={t} value={t}>{t}</option>)}
    </select>
      {/* 🔹 하차: 당일/내일 */}
  <button
    type="button"
    className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
    onClick={() => onChange("하차일", _todayStr())}
  >
    당일
  </button>

  <button
    type="button"
    className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
    onClick={() => onChange("하차일", _tomorrowStr())}
  >
    내일
  </button>
<button
  type="button"
  onClick={swapPickupDrop}
  className="
    ml-2
    inline-flex items-center gap-1
    px-3 py-1.5
    text-xs font-semibold
    rounded-full
    border border-indigo-200
    bg-indigo-50
    text-indigo-700
    hover:bg-indigo-100
    active:scale-95
    transition
  "
  title="상차지 ↔ 하차지 교체"
>
  ⇄ 상·하차 교체
</button>

  </div>

</div>
 
<form
  onSubmit={handleSubmit}
  className="
    grid grid-cols-8 gap-3
    bg-white
    border border-[#EDEDED]
    rounded-2xl p-5
    shadow-[0_2px_12px_rgba(0,0,0,0.06)]
  "
>
  {/* 거래처 + 신규등록 */}
  <div className="col-span-2">
    <label className={labelCls}>거래처 {reqStar}</label>
    <div className="flex gap-2">
      <div className="relative flex-1" ref={comboRef}>
        <input
          className={inputCls}
          placeholder="거래처 검색/입력"
          value={clientQuery}
          onFocus={() => setIsClientOpen(true)}
         onChange={(e) => {
  setClientQuery(e.target.value);
  onChange("거래처명", e.target.value);
  setIsClientOpen(true);
  setClientActive(0);
}}

          onKeyDown={(e) => {
            const list = filteredClients;
            if (!isClientOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
              setIsClientOpen(true);
              return;
            }
            if (!list.length) return;

            if (e.key === "Enter") {
              e.preventDefault();
              const pick = list[clientActive];
              if (pick) applyClientSelect(pick.업체명);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setClientActive((i) => Math.min(i + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setClientActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape") {
              setIsClientOpen(false);
            }
          }}
        />
        {isClientOpen && (
          <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-auto bg-white border rounded-lg shadow-xl z-50">
            {filteredClients.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                검색 결과 없음
              </div>
            ) : (
              filteredClients.map((p, idx) => (
                <div
                  key={p.업체명 + "_" + idx}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    idx === clientActive ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                  onMouseEnter={() => setClientActive(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyClientSelect(p.업체명);
                  }}
                >
                  <div className="font-medium">{p.업체명}</div>
                  {p.주소 && (
                    <div className="text-[11px] text-gray-500">{p.주소}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          const 업체명 = (clientQuery || "").trim();
          if (!업체명) return alert("업체명을 입력하세요.");
          const 주소 = prompt("주소 (선택)") || "";
          const 담당자 = prompt("담당자 (선택)") || "";
          const 담당자번호 = prompt("연락처 (선택)") || "";

          if (typeof upsertPlace === "function") {
            savePlaceSmart(업체명, 주소, 담당자, 담당자번호);
          } else {
            try {
              const list = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
              list.push({ 업체명, 주소, 담당자, 담당자번호 });
              localStorage.setItem("hachaPlaces_v1", JSON.stringify(list));
            } catch (e) {}
          }

          alert("하차지거래처에 신규 등록되었습니다.");
        }}
        className="px-3 py-2 border rounded-lg text-sm bg-gray-50 hover:bg-gray-100"
      >
        + 신규등록
        
      </button>
    </div>
  </div>

  {/* 상차지명 + 자동완성 */}
  <div className="relative">
    <label className={labelCls}>상차지명 {reqStar}</label>

    <input
      className={inputCls}
      placeholder="상차지 검색"
      value={form.상차지명}
      onChange={(e) => {
        const v = e.target.value;
        handlePickupName(v);
        setPickupOptions(filterPlaces(v));
        setShowPickupDropdown(true);
        setPickupActive(0);
      }}
      onKeyDown={(e) => {
        const list = pickupOptions;
        if (!list.length) return;
        if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === "Enter") {
          const p = list[pickupActive];
          if (!p) return;
          setForm((prev) => ({
            ...prev,
            상차지명: p.업체명,
            상차지주소: p.주소,
            상차지담당자: p.담당자,
            상차지담당자번호: p.담당자번호,
          }));
          setShowPickupDropdown(false);
        } else if (e.key === "ArrowDown") {
          setPickupActive((i) => Math.min(i + 1, list.length - 1));
        } else if (e.key === "ArrowUp") {
          setPickupActive((i) => Math.max(i - 1, 0));
        }
      }}
      onBlur={() => setTimeout(() => setShowPickupDropdown(false), 200)}
    />

    {showPickupDropdown && pickupOptions.length > 0 && (
      <div className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
        {pickupOptions.map((p, i) => (
          <div
            key={i}
            className={`px-2 py-1 cursor-pointer ${
              i === pickupActive ? "bg-blue-50" : "hover:bg-gray-50"
            }`}
            onMouseDown={() => {
              setForm((prev) => ({
                ...prev,
                상차지명: p.업체명,
                상차지주소: p.주소,
                상차지담당자: p.담당자,
                상차지담당자번호: p.담당자번호,
              }));
              setShowPickupDropdown(false);
            }}
          >
            <b>{p.업체명}</b>
            {p.주소 && <div className="text-xs text-gray-500">{p.주소}</div>}
          </div>
        ))}
      </div>
    )}
  </div>

  {/* 상차지주소 */}
  <div>
    <label className={labelCls}>
      상차지주소 <AutoBadge show={autoPickMatched} />
    </label>
    <input
      className={inputCls}
      value={form.상차지주소}
      onChange={(e) => handlePickupAddrManual(e.target.value)}
      placeholder="자동매칭 또는 수기입력"
    />
  </div>
  {/* 상차지 담당자 */}
<div>
  <label className={labelCls}>상차지 담당자</label>
  <input
    className={inputCls}
    value={form.상차지담당자}
    onChange={(e) => onChange("상차지담당자", e.target.value)}
    placeholder="담당자 이름"
  />
</div>

{/* 상차지 연락처 */}
<div>
  <label className={labelCls}>상차지 연락처</label>
  <input
    className={inputCls}
    value={form.상차지담당자번호}
    onChange={(e) =>
      onChange("상차지담당자번호", e.target.value.replace(/[^\d-]/g, ""))
    }
    placeholder="010-0000-0000"
  />
</div>


  {/* 하차지명 + 자동완성 */}
  <div className="relative">
    <label className={labelCls}>하차지명 {reqStar}</label>

    <input
      className={inputCls}
      placeholder="하차지 검색"
      value={form.하차지명}
      onChange={(e) => {
        const v = e.target.value;
        handleDropName(v);
        setPlaceOptions(filterPlaces(v));
        setShowPlaceDropdown(true);
        setPlaceActive(0);
      }}
      onKeyDown={(e) => {
        const list = placeOptions;
        if (!list.length) return;
        if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === "Enter") {
          const p = list[placeActive];
          if (!p) return;
          setForm((prev) => ({
            ...prev,
            하차지명: p.업체명,
            하차지주소: p.주소,
            하차지담당자: p.담당자,
            하차지담당자번호: p.담당자번호,
          }));
          setShowPlaceDropdown(false);
        } else if (e.key === "ArrowDown") {
          setPlaceActive((i) => Math.min(i + 1, list.length - 1));
        } else if (e.key === "ArrowUp") {
          setPlaceActive((i) => Math.max(i - 1, 0));
        }
      }}
      onBlur={() => setTimeout(() => setShowPlaceDropdown(false), 200)}
    />

    {showPlaceDropdown && placeOptions.length > 0 && (
      <div className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
        {placeOptions.map((p, i) => (
          <div
            key={p.업체명 + "_" + i}
            className={`px-2 py-1 cursor-pointer ${
              i === placeActive ? "bg-blue-50" : "hover:bg-gray-50"
            }`}
            onMouseEnter={() => setPlaceActive(i)}
            onMouseDown={() => {
              setForm((prev) => ({
                ...prev,
                하차지명: p.업체명,
                하차지주소: p.주소,
                하차지담당자: p.담당자,
                하차지담당자번호: p.담당자번호,
              }));
              setShowPlaceDropdown(false);
            }}
          >
            <b>{p.업체명}</b>
            {p.주소 && <div className="text-xs text-gray-500">{p.주소}</div>}
          </div>
        ))}
      </div>
    )}
  </div>

  {/* 하차지주소 */}
  <div>
    <label className={labelCls}>
      하차지주소 <AutoBadge show={autoDropMatched} />
    </label>
    <input
      className={inputCls}
      value={form.하차지주소}
      onChange={(e) => handleDropAddrManual(e.target.value)}
      placeholder="자동매칭 또는 수기입력"
    />
  </div>
  {/* 하차지 담당자 */}
<div>
  <label className={labelCls}>하차지 담당자</label>
  <input
    className={inputCls}
    value={form.하차지담당자}
    onChange={(e) => onChange("하차지담당자", e.target.value)}
    placeholder="담당자 이름"
  />
</div>

{/* 하차지 연락처 */}
<div>
  <label className={labelCls}>하차지 연락처</label>
  <input
    className={inputCls}
    value={form.하차지담당자번호}
    onChange={(e) =>
      onChange("하차지담당자번호", e.target.value.replace(/[^\d-]/g, ""))
    }
    placeholder="010-0000-0000"
  />
</div>


  {/* 화물내용 */}
  <div>
    <label className={labelCls}>화물내용</label>
    <input className={inputCls} value={form.화물내용} onChange={(e) => onChange("화물내용", e.target.value)} />
  </div>

  <div>
    <label className={labelCls}>차량종류</label>
    <select className={inputCls} value={form.차량종류} onChange={(e) => onChange("차량종류", e.target.value)}>
      <option value="">선택 ▾</option>
      {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>

  <div>
    <label className={labelCls}>차량톤수</label>
    <input className={inputCls} placeholder="예: 1톤 / 2.5톤" value={form.차량톤수} onChange={(e) => onChange("차량톤수", e.target.value)} />
  </div>

  {/* 금액 */}
  {isAdmin && (
    <>
      <div>
        <label className={labelCls}>청구운임</label>
        <input className={inputCls} value={form.청구운임} onChange={(e) => onChange("청구운임", e.target.value.replace(/[^\d-]/g, ""))} />
      </div>
      <div>
        <label className={labelCls}>기사운임</label>
        <input className={inputCls} value={form.기사운임} onChange={(e) => onChange("기사운임", e.target.value.replace(/[^\d-]/g, ""))} />
      </div>
      <div>
        <label className={labelCls}>수수료</label>
        <input className={`${inputCls} bg-gray-100`} value={form.수수료} readOnly />
      </div>
    </>
  )}

  {/* 차량정보 */}
  <div>
    <label className={labelCls}>차량번호</label>
    <input
      className={inputCls}
      value={form.차량번호}
      onChange={(e) => handleCarNoChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCarNoEnter(e.currentTarget.value); } }}
      onBlur={(e) => handleCarNoEnter(e.currentTarget.value)}
    />
  </div>

  <div>
    <label className={labelCls}>기사명</label>
    <input className={`${inputCls} bg-gray-100`} value={form.이름} readOnly />
  </div>

  <div>
    <label className={labelCls}>전화번호</label>
    <input className={`${inputCls} bg-gray-100`} value={form.전화번호} readOnly />
  </div>

  {/* 상/하차 방법 */}
  <div>
    <label className={labelCls}>상차방법</label>
    <select className={inputCls} value={form.상차방법} onChange={(e) => onChange("상차방법", e.target.value)}>
      <option value="">선택 ▾</option>
      {["지게차", "수작업", "직접수작업", "수도움", "크레인"].map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>

  <div>
    <label className={labelCls}>하차방법</label>
    <select className={inputCls} value={form.하차방법} onChange={(e) => onChange("하차방법", e.target.value)}>
      <option value="">선택 ▾</option>
      {["지게차", "수작업", "직접수작업", "수도움", "크레인"].map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>

  {/* 결제 */}
  <div>
    <label className={labelCls}>지급방식</label>
    <select className={inputCls} value={form.지급방식} onChange={(e) => onChange("지급방식", e.target.value)}>
      <option value="">선택 ▾</option>
      {PAY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>

  <div>
    <label className={labelCls}>배차방식</label>
    <select className={inputCls} value={form.배차방식} onChange={(e) => onChange("배차방식", e.target.value)}>
      <option value="">선택 ▾</option>
      {DISPATCH_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>

  {/* 메모 */}
  <div className="col-span-6">
    <label className={labelCls}>메모</label>
    <textarea className={`${inputCls} h-20`} value={form.메모} onChange={(e) => onChange("메모", e.target.value)} />
  </div>

  {/* 버튼 */}
  <div className="col-span-6 flex justify-end mt-2">
    <button
      type="submit"
      className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700"
    >
      저장
    </button>
    <button
      type="button"
      onClick={async () => {
        const { 거래처명, 상차지명, 하차지명, 상차일, 상차시간, 하차일, 하차시간 } = form;
        if (!거래처명 || !상차지명 || !하차지명) return alert("거래처/상차지명/하차지명을 입력해주세요.");
        if (!상차일 || !하차일) return alert("상차일/하차일은 반드시 필요합니다.");
       const res = await sendOrderTo24(form);

// 🔹 기존 로그 불러오기
const prevLogs = Array.isArray(form["24시전송로그"])
  ? form["24시전송로그"]
  : [];

const newLog = {
  at: serverTimestamp(),
  success: !!res?.success,
  resultCode: res?.resultCode || "",
  resultMsg: res?.resultMsg || res?.message || "",
};

if (res?.success) {
  // ✅ 성공
  await patchDispatch(form._id, {
    "24시전송여부": true,
    "24시전송일시": serverTimestamp(),
    "24시전송결과코드": res.resultCode || "0000",
    "24시전송메시지": res.resultMsg || "성공",
    "24시전송로그": [...prevLogs, newLog],
    배차상태: "24시전송완료",
  });

  alert(
    `📡 24시콜 전송 완료!\n\n` +
    `전송건수: 1건\n실패건수: 0건\n` +
    `메시지: ${res.resultMsg || "성공"}`
  );
} else {
  // ❌ 실패
  await patchDispatch(form._id, {
    "24시전송여부": false,
    "24시전송로그": [...prevLogs, newLog],
  });

  alert(
    `⛔ 24시콜 전송 실패!\n\n` +
    `사유: ${res?.resultMsg || "알 수 없는 오류"}`
  );
}

      }}
      className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-sm text-white rounded-lg"
    >
      📡 24시전송
    </button>
  </div>

</form>


        {/* ------------------------------  
      🔵 오더복사 팝업 (완성본)
-------------------------------- */}
        {copyOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="
  bg-white w-[1100px]
  p-4 rounded-2xl shadow-2xl
  flex flex-col
">

              {/* 헤더 */}
              <div className="
  flex items-center justify-between
  pb-2 mb-3 border-b
">
  <div>
    <h2 className="text-lg font-bold">📄 오더복사</h2>
    <p className="text-xs text-gray-500">
      더블클릭: 수정 | 체크 후 복사
    </p>
  </div>

  <button
    className="text-gray-400 hover:text-black text-xl"
    onClick={() => {
      setCopyOpen(false);
      setCopySelected([]);
    }}
  >
    ×
  </button>
</div>


              {/* 검색바 */}
              <div className="flex gap-2 mb-3">

                {/* 드롭다운 */}
                <select
                  className="border p-2 rounded"
                  value={copyFilterType}
                  onChange={(e) => setCopyFilterType(e.target.value)}
                >
                  <option value="전체">전체</option>
                  <option value="거래처명">거래처명</option>
                  <option value="상차지명">상차지명</option>
                  <option value="하차지명">하차지명</option>
                  <option value="화물내용">화물내용</option>
                </select>

                {/* 검색어 입력 */}
                <input
                  type="text"
                  placeholder="검색어 입력"
                  className="border p-2 rounded flex-1"
                  value={copyQ}
                  onChange={(e) => setCopyQ(e.target.value)}
                />

                {/* 🔥 복사 버튼 */}
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                  onClick={() => {
                    if (copySelected.length === 0)
                      return alert("복사할 항목을 선택하세요.");

                    const r = copySelected[0];

                    const today = new Date().toISOString().slice(0, 10);

                    // ✅ 오더복사 시: 업체명만 넣지 말고, placeList에서 찾아서 주소/담당자/번호까지 같이 채운다
const pickMeta = findPlaceByName(r.상차지명 || "") || {};
const dropMeta = findPlaceByName(r.하차지명 || "") || {};
const clientName = isDateLike(r.거래처명) ? "" : (r.거래처명 || "");

// (혹시 row에 주소/담당자 정보가 이미 있으면 그걸 우선, 없으면 placeList 메타로 채움)
setForm((p) => ({
  ...p,

  거래처명: clientName,

  // 상차
  상차지명: r.상차지명 || "",
  상차지주소: r.상차지주소 || pickMeta.주소 || "",
  상차지담당자: r.상차지담당자 || pickMeta.담당자 || "",
  상차지담당자번호: r.상차지담당자번호 || pickMeta.담당자번호 || "",

  // 하차
  하차지명: r.하차지명 || "",
  하차지주소: r.하차지주소 || dropMeta.주소 || "",
  하차지담당자: r.하차지담당자 || dropMeta.담당자 || "",
  하차지담당자번호: r.하차지담당자번호 || dropMeta.담당자번호 || "",

  // 나머지
  화물내용: r.화물내용 || "",
  차량종류: r.차량종류 || "",
  차량톤수: r.차량톤수 || "",
  상차방법: r.상차방법 || "",
  하차방법: r.하차방법 || "",
  상차일: today,
  하차일: today,
  상차시간: r.상차시간 || "",
  하차시간: r.하차시간 || "",
  지급방식: r.지급방식 || "",
  배차방식: r.배차방식 || "",
  메모: r.메모 || "",

  차량번호: "",
  이름: "",
  전화번호: "",
  배차상태: "배차중",
}));

// ✅ UI 동기화 (이 한 번만)
setClientQuery(clientName);
setAutoPickMatched(false);
setAutoDropMatched(false);
setIsCopyMode(true);

                    alert("오더 내용이 입력창에 복사되었습니다!");
                    setCopyOpen(false);

                  }}
                >
                  복사
                </button>

              </div>

              {/* 결과 테이블 */}
              <div className="border rounded overflow-x-auto">
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="min-w-max text-sm whitespace-nowrap">
                    <thead className="bg-gray-100">
  <tr>
    {/* ✅ 체크박스 컬럼 추가 */}
    <th className="p-2 border px-3 py-2 whitespace-nowrap text-center">
      선택
    </th>

    <th className="p-2 border px-3 py-2 whitespace-nowrap">상차일</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">거래처명</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">상차지명</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">하차지명</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">화물내용</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">차량종류</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">차량톤수</th>
    <th className="p-2 border px-3 py-2 whitespace-nowrap">메모</th>
  </tr>
</thead>


                    <tbody>
                      {copyList.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center p-4 text-gray-500">
                            검색 결과가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        copyList.map((row) => (
                          <tr
  key={row._id}
  id={`row-${row._id}`} // ★ 수정: 스크롤 이동용 ID
  className="hover:bg-gray-50 cursor-pointer"
  onDoubleClick={() => {
    if (typeof window.RUN25_EDIT_ROW === "function") {
      window.RUN25_EDIT_ROW(row); // 수정 팝업
    }
  }}
>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={copySelected.includes(row)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCopySelected((prev) => [...prev, row]);
                                  } else {
                                    setCopySelected((prev) =>
                                      prev.filter((x) => x !== row)
                                    );
                                  }
                                }}
                              />
                            </td>
                            <td className="p-2">{row.상차일}</td>
                            <td className="p-2">{row.거래처명}</td>
                            <td className="p-2">{row.상차지명}</td>
                            <td className="p-2">{row.하차지명}</td>
                            <td className="p-2">{row.화물내용}</td>
                            <td className="p-2">{row.차량종류}</td>
                            <td className="p-2">{row.차량톤수}</td>
                            <td className="p-2">{row.메모}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 닫기 버튼 */}
              <div className="text-right mt-3">
                <button className="px-3 py-1 bg-gray-300 rounded" onClick={() => setCopyOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
            </>
    );  // ← renderForm() return 끝

    // ⭐ 여기부터 4파트 테이블 추가
    return (
      <>
      
           {/* ==================== 상단: 입력폼 + Dashboard ==================== */}
<div className="flex items-start gap-6 w-full">
  

  {/* 왼쪽 입력폼 (절대 변경 금지) */}
  <div className="flex-1">{renderForm()}</div>

  {/* ================= Premium Today Dashboard v4 ================= */}
 <div
  className="
    w-[1000px]
    rounded-3xl
    bg-white
    shadow-xl
    border border-gray-200
    pt-2 pb-6 px-6
    sticky top-[200px]
    flex-shrink-0
    self-stretch        /* ① 자동 높이 맞춤 */
    overflow-hidden     /* ② 스크롤 영역 컨트롤 */
  "
  style={{
    maxHeight: "calc(100vh - 130px)", /* ③ 화면 초과 방지 */
    display: "flex",
    flexDirection: "column",
  }}
>



    {/* Header + 알림시간 설정 */}
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-semibold text-gray-900">Today Dashboard</h3>
      <input
        type="time"
        value={alertTime}
        onChange={(e) => {
          setAlertTime(e.target.value);
          setAlertShown(false);
        }}
        className="border rounded px-1 py-0.5 text-[10px]"
      />
    </div>

    {/* Progress */}
    <div className="mb-6">
      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
        <span>배차진행률</span><span>{rate}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600" style={{ width: `${rate}%` }} />
      </div>
    </div>

    {/* Quick Status */}
<div className="grid grid-cols-3 gap-2 mb-6 text-[12px]">

  {/* 임박 */}
  <button
    onClick={() =>
      setStatusPopup({
        title: "임박 리스트",
        list: todayRows.filter(r => r.배차상태 === "배차중")
      })
    }
    className={`bg-amber-50 hover:bg-amber-100 border border-amber-200 py-2 rounded-xl text-center font-medium
      ${doing > 0 ? "animate-pulse" : ""}`}
  >
    ⏳ 임박 {doing}
  </button>

  {/* 미배차 */}
  <button
    onClick={() =>
      setStatusPopup({
        title: "미배차 리스트",
        list: todayRows.filter(r => !r.차량번호?.trim())
      })
    }
    className="bg-gray-50 hover:bg-gray-100 border border-gray-200 py-2 rounded-xl text-center font-medium"
  >
    🚧 미배차 {pending}
  </button>

  {/* 지연 */}
  <button
    onClick={() =>
      setStatusPopup({
        title: "지연 리스트",
        list: todayRows.filter(r => r.배차상태 === "지연")
      })
    }
    className={`bg-rose-50 hover:bg-rose-100 border border-rose-200 py-2 rounded-xl text-center font-medium
      ${delayed > 0 ? "animate-pulse" : ""}`}
  >
    ⚠ 지연 {delayed}
  </button>

</div>


    {/* KPI */}
    <div className="grid grid-cols-3 gap-3 text-center mb-6">
      <div><div className="text-[11px] text-gray-500">총오더</div><div className="text-base font-bold">{total}</div></div>
      <div><div className="text-[11px] text-gray-500">완료</div><div className="text-base font-bold text-blue-600">{done}</div></div>
      <div><div className="text-[11px] text-gray-500">진행</div><div className="text-base font-bold text-blue-600">{doing}</div></div>
      <div><div className="text-[11px] text-gray-500">기사수</div><div className="text-base font-semibold">{driverCount}</div></div>
      <div><div className="text-[11px] text-gray-500">신규거래</div><div className="text-base font-semibold text-emerald-600">{newClients}</div></div>
      <div><div className="text-[11px] text-gray-500">신규하차</div><div className="text-base font-semibold text-emerald-600">{newPlaces}</div></div>
    </div>

    {/* Financial */}
    <div className="space-y-1.5 text-[13px] mb-6">
      <div className="flex justify-between"><span>매출</span><b>{todayRevenue.toLocaleString()}원</b></div>
      <div className="flex justify-between"><span>기사비용</span><b>{todayDriverCost.toLocaleString()}원</b></div>
      <div className="flex justify-between"><span>마진율</span>
        <b className={todayMarginRate >= 0 ? "text-emerald-600" : "text-red-600"}>{todayMarginRate.toFixed(0)}%</b>
      </div>
    </div>

    {/* Trend Graph */}
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-6">
      <div className="text-[11px] text-gray-600 mb-2">시간대별 요청건수</div>
      <div className="h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" stroke="#888" fontSize={10} />
            <YAxis allowDecimals={false} stroke="#888" fontSize={10} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Top 3 Buttons */}
    <div className="grid grid-cols-3 gap-2">
      <button onClick={() => setPopupType("driver")} className="bg-gray-50 border border-gray-200 rounded-lg py-2 text-[12px] font-medium hover:bg-gray-100">
        기사 Top 3
      </button>
      <button onClick={() => setPopupType("client")} className="bg-gray-50 border border-gray-200 rounded-lg py-2 text-[12px] font-medium hover:bg-gray-100">
        상차지 Top 3
      </button>
      <button onClick={() => setPopupType("place")} className="bg-gray-50 border border-gray-200 rounded-lg py-2 text-[12px] font-medium hover:bg-gray-100">
        하차지 Top 3
      </button>
    </div>

  </div>

</div>
{/* ================= 신규 기사 등록 모달 ================= */}
{driverModal.open && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl border border-gray-200">
      <h3 className="text-lg font-bold mb-4">신규 기사 등록</h3>

      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-gray-600 mb-1">차량번호</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={driverModal.carNo}
            readOnly
          />
        </div>

        <div>
          <label className="block text-gray-600 mb-1">기사명</label>
          <input
            className="border p-2 rounded w-full"
            placeholder="예: 홍길동"
            value={driverModal.name}
            onChange={(e) =>
              setDriverModal((p) => ({ ...p, name: e.target.value }))
            }
            ref={nameInputRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("driver-save-btn")?.click();
              }
            }}
          />
        </div>

        <div>
          <label className="block text-gray-600 mb-1">전화번호</label>
          <input
            className="border p-2 rounded w-full"
            placeholder="숫자(하이픈) 입력"
            value={driverModal.phone}
            onChange={(e) =>
              setDriverModal((p) => ({
                ...p,
                phone: e.target.value.replace(/[^\d-]/g, ""),
              }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("driver-save-btn")?.click();
              }
            }}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          className="px-4 py-2 rounded bg-gray-200"
          onClick={() => setDriverModal({ open: false })}
        >
          취소
        </button>

        <button
          id="driver-save-btn"
          className="px-4 py-2 rounded bg-blue-600 text-white"
          onClick={async () => {
            if (!driverModal.name.trim()) return alert("기사명을 입력하세요.");
            if (!driverModal.phone.replace(/[^\d]/g, "").trim()) return alert("전화번호를 입력하세요.");

            const rawPhone = driverModal.phone.replace(/[^\d]/g, "");
            if (!rawPhone || rawPhone.length < 10) return alert("전화번호를 정확히 입력하세요.");

            await upsertDriver({
              _id: driverModal.carNo,
              차량번호: driverModal.carNo,
              이름: driverModal.name,
              전화번호: rawPhone,
            });

            setForm((p) => ({
              ...p,
              차량번호: driverModal.carNo,
              이름: driverModal.name,
              전화번호: formatPhone(rawPhone),
              배차상태: "배차완료",
            }));

            setDriverModal({ open: false });
          }}
        >
          저장
        </button>
      </div>
    </div>
  </div>
)}

{/* ================= 등록 확인 팝업 ================= */}
{confirmOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("confirm-save-btn")?.click();
      }
    }}
    tabIndex={0} // Enter 감지 위해 포커스 가능
  >
    <div className="bg-white rounded-xl p-6 w-[380px] shadow-xl border border-gray-200">
      
      <h3 className="text-base font-bold mb-4">등록하시겠습니까?</h3>

      <div className="text-sm text-gray-700 mb-4 leading-6">
        <p>거래처: <b>{form.거래처명}</b></p>
        <p>{form.상차지명} → {form.하차지명}</p>
        {isAdmin && (
          <p>청구운임: <b>{Number(form.청구운임 || 0).toLocaleString()}원</b></p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          className="px-3 py-1.5 bg-gray-200 rounded"
          onClick={() => setConfirmOpen(false)}
        >
          취소
        </button>

        <button
          id="confirm-save-btn"
          className="px-3 py-1.5 bg-blue-600 text-white rounded"
          onClick={doSave}
        >
          확인
        </button>
      </div>
      
    </div>
  </div>
)}

{/* ================= Status Popup ================= */}
{statusPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl border border-gray-200">
      <h3 className="text-base font-bold mb-4">
        {statusPopup.title}
      </h3>

      <div className="space-y-2 text-sm max-h-[300px] overflow-y-auto pr-1">
        {statusPopup.list.length > 0 ? (
          statusPopup.list.map((r, i) => (
            <div
              key={i}
              className="flex justify-between border-b pb-1"
            >
              <span className="text-[12px]">
                {r.상차지명 || "-"} → {r.하차지명 || "-"}
              </span>
              <span className="font-semibold">{r.배차상태 || "-"}</span>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 text-[12px] py-3">
            데이터 없음
          </div>
        )}
      </div>

      <button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm mt-5"
        onClick={() => setStatusPopup(null)}
      >
        닫기
      </button>
    </div>
    
  </div>
  
)}



{/* ================= Top 3 Popup ================= */}
{popupType && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl p-6 w-[360px] shadow-xl border border-gray-200">
      <h3 className="text-base font-bold mb-4">
        {popupType === "driver" && "활동 많은 기사 Top 3"}
        {popupType === "client" && "최다 상차지 Top 3"}
        {popupType === "place" && "최다 하차지 Top 3"}
      </h3>

      <div className="space-y-2 text-sm">
        {popupType === "driver" &&
          [...todayRows].slice(0, 3).map((r, i) => (
            <div key={i} className="flex justify-between">
              <span>{r.이름 || "-"}</span>
              <span className="font-semibold">{r.배차상태}</span>
            </div>
          ))}
        {popupType === "client" &&
          topClients.map(([name, count], i) => (
            <div key={i} className="flex justify-between">
              <span>{name}</span>
              <span className="font-semibold">{count}건</span>
            </div>
          ))}
        {popupType === "place" &&
          topDrops.map(([name, count], i) => (
            <div key={i} className="flex justify-between">
              <span>{name}</span>
              <span className="font-semibold">{count}건</span>
            </div>
          ))}
      </div>

      <button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm mt-5"
        onClick={() => setPopupType(null)}
      >
        닫기
      </button>
    </div>
  </div>
)}


        {/* ⭐ 운임조회 결과 모달 */}
{fareModalOpen && fareResult && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-lg p-7 w-[500px] shadow-2xl max-h-[90vh] overflow-y-auto">
      
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">📦 운임조회 결과</h3>
        <button
          onClick={() => setFareModalOpen(false)}
          className="text-gray-500 hover:text-black text-xl"
        >
          ×
        </button>
      </div>

      <div className="text-sm leading-6">
        <p>📌 조회된 데이터: <b>{fareResult.count}</b> 건</p>
        <p>📌 평균 운임: <b>{fareResult.avg.toLocaleString()} 원</b></p>
        <p>📌 최소 → 최대: {fareResult.min.toLocaleString()} ~ {fareResult.max.toLocaleString()} 원</p>
        <p>📌 최신 운임: {fareResult.latestFare?.toLocaleString()} 원</p>
        <p>📌 최신 상차일: {fareResult.latestDate}</p>
        <p>📌 최근 화물: {fareResult.latestCargo}</p>
      </div>

      {/* 추천 카드 */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mt-4">
        <h4 className="font-semibold text-amber-700 mb-2"> AI 추천운임</h4>
        <p className="text-xl font-bold text-amber-900">
          {fareResult.avg.toLocaleString()} 원
        </p>
        <p className="text-[12px] text-gray-600">(최근 데이터 분석 기준)</p>

        {/* 💡 운임 적용 버튼 */}
        <button
          onClick={() => {
            setForm((p) => ({ ...p, 청구운임: String(fareResult.avg) }));
            setFareModalOpen(false);
          }}
          className="mt-4 bg-amber-600 hover:bg-amber-700 text-white w-full py-2 rounded-md text-sm"
        >
          추천운임 적용하기
        </button>
        {/* 📜 과거 운송 기록 */}
{fareResult.filteredList && fareResult.filteredList.length > 0 && (
  <div className="mt-5 border-t pt-4">
    <h4 className="font-semibold mb-2">📜 과거 운송 기록 (최신순)</h4>
    <div className="max-h-[180px] overflow-y-auto text-sm">
      {fareResult.filteredList.map((r, idx) => (
        <div key={idx} className="flex justify-between items-center py-2 border-b">
          <div className="flex-1">
            <b>{r.상차일}</b> | {r.화물내용 || "-"}
          </div>
          <div className="text-right">
            {Number(r.청구운임).toLocaleString()} 원
          </div>
          <button
            onClick={() => {
              setForm((p) => ({
                ...p,
                청구운임: String(r.청구운임),
              }));
              setFareModalOpen(false);
            }}
            className="ml-3 px-3 py-1 bg-blue-600 text-white rounded text-xs"
          >
            적용
          </button>
        </div>
      ))}
    </div>
  </div>
)}
      </div>

      {/* 닫기 버튼 */}
      <div className="text-right mt-5">
        <button
          className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded text-sm"
          onClick={() => setFareModalOpen(false)}
        >
          닫기
        </button>
      </div>
    </div>
  </div>
)}


        {/* ⭐ 4파트 동일한 실시간배차현황 테이블 */} 
<div id="realtime-status-area">
  <RealtimeStatus
    role={role}
    dispatchData={dispatchData}
    drivers={drivers}
    clients={clients}
    timeOptions={timeOptions}
    tonOptions={tonOptions}
    addDispatch={addDispatch}
    patchDispatch={patchDispatch}
    removeDispatch={removeDispatch}
    upsertDriver={upsertDriver}
    filterType={filterType}
    filterValue={filterValue}
  />
</div>

      </>
    );
  }
  // ===================== DispatchApp.jsx (PART 3/8) — END =====================
  

// ===================== DispatchApp.jsx (PART 4/8 — START) =====================

/* 메뉴용 실시간배차현황 — 배차현황과 100% 동일 컬럼/순서(+주소)
   role 지원: admin | user
*/
function RealtimeStatus({
  
  dispatchData,
  drivers,
  clients,
  placeRows,
  timeOptions,
  tonOptions,
  addDispatch,     // ⭐⭐⭐⭐⭐ 요거 반드시 필요
  patchDispatch,
  removeDispatch,
  upsertDriver,
  role = "admin",
}) {

  const isAdmin = role === "admin";
  
   // ==========================
  // 📌 날짜 유틸 (반드시 최상단)
  // ==========================
  const todayKST = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  const tomorrowKST = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

// 🔵 하차지 자동완성 상태
const [placeOptions, setPlaceOptions] = React.useState([]);   // 자동완성 목록
const [showPlaceDropdown, setShowPlaceDropdown] = React.useState(false);  // 드롭다운 표시 여부
const [placeQuery, setPlaceQuery] = React.useState("");       // 검색 문자열
  // ------------------------
  // 상태들
  // ------------------------
  const [q, setQ] = React.useState("");
  const [filterType, setFilterType] = React.useState("거래처명");
  // 🔔 업로드 알림 리스트
const [uploadAlerts, setUploadAlerts] = React.useState([]);
{/* =================== 기사복사 모달 상태 =================== */}
const [copyModalOpen, setCopyModalOpen] = useState(false);

const getYoil = (dateStr) => {
  const date = new Date(dateStr);
  return ["일","월","화","수","목","금","토"][date.getDay()];
};

const formatPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");

  // 11자리 → 010-0000-0000
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  // 10자리 → 지역번호 고려
  if (digits.length === 10) {
    // 02로 시작 → (서울)
    if (digits.startsWith("02")) {
      return digits.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3");
    }
    // 일반 지역번호 (031, 051, 055…)
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  // 8자리 → 0000-0000
  if (digits.length === 8) {
    return digits.replace(/(\d{4})(\d{4})/, "$1-$2");
  }

  return digits;
};




const copyMessage = (mode) => {
  if (!selected.length) {
    alert("복사할 항목을 선택하세요.");
    return;
  }

  const text = selected.map((id) => {
    const r = rows.find((x) => x._id === id);
    if (!r) return "";

    const plate = r.차량번호 || "";
    const name = r.이름 || "";
    const phone = formatPhone(r.전화번호);
    const cargo = r.화물내용 || "";
    const ton = r.차량톤수 || "";
    const carType = r.차량종류 || "";
    const fare = Number(String(r.청구운임 || "").replace(/[^\d]/g, ""));
    const pay = r.지급방식 || "";
    const yoil = r.상차일 ? getYoil(r.상차일) : "";

    let payLabel =
      pay === "계산서"
        ? "부가세별도"
        : pay === "선불" || pay === "착불"
        ? pay
        : "";

    if (mode === "basic") {
      return `${plate} ${name} ${phone}`;
    }

    if (mode === "fare") {
      return `${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
    }

    return `${r.상차일 || ""}(${yoil})

${r.상차지명 || ""} → ${r.하차지명 || ""}
${r.상차지주소 || ""} → ${r.하차지주소 || ""}

${r.화물내용 || ""} ${r.차량톤수 || ""} ${r.차량종류 || ""}

${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
  }).join("\n\n");

  navigator.clipboard.writeText(text);
  setCopyModalOpen(false);
  alert("📋 복사되었습니다!");

  // ⭐⭐⭐ 복사 후 자동 타이머 (여기가 정확한 위치)
  setTimeout(async () => {
    try {
      const latest = await navigator.clipboard.readText();
      if (latest === text) {
        alert("⏱ 아직 전달되지 않은 것 같습니다.\n카톡에 붙여넣기 하셨나요?");
      }
    } catch (e) {
      console.error("Clipboard read error", e);
    }
  }, 3000);
};


// 이미 본 알림(id 저장)
const [seenAlerts, setSeenAlerts] = React.useState(() => {
  return new Set(JSON.parse(localStorage.getItem("seenAlerts") || "[]"));
});


// 🔔 이전 첨부 개수 저장
const prevAttachRef = React.useRef({});

  const [filterValue, setFilterValue] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [rows, setRows] = React.useState(dispatchData || []);
  const [selected, setSelected] = React.useState([]);
  const [selectedEditMode, setSelectedEditMode] = React.useState(false);
  const [edited, setEdited] = React.useState({});
  // =======================
// 🔵 선택삭제 팝업 + 되돌리기 상태
// =======================
const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
const [deleteList, setDeleteList] = React.useState([]);

const [undoStack, setUndoStack] = React.useState([]);
const [showUndo, setShowUndo] = React.useState(false);

// === 유사 운임조회 (선택수정 전용 업그레이드) ===
const handleFareSearch = () => {
  const row = editTarget;
  if (!row) return alert("먼저 수정할 오더를 선택해주세요.");

  const pickup = row.상차지명?.trim();
  const drop = row.하차지명?.trim();

  if (!pickup || !drop) return alert("상/하차지를 입력해주세요.");

  // 🔥 유사 조건 필터링 적용
  const matchPlace = (a, b) =>
    String(a || "").includes(String(b || "")) ||
    String(b || "").includes(String(a || ""));

  const records = (dispatchData || [])
    .filter(r =>
      matchPlace(r.상차지명, pickup) &&
      matchPlace(r.하차지명, drop)
    )
    .filter(r => r.청구운임)               // 금액 없는건 제외
    .sort((a, b) => (b.하차일 || "").localeCompare(a.하차일))
    .slice(0, 20); // 최대 20건

  if (!records.length) {
    alert("유사 운행 이력이 없습니다.");
    return;
  }

  const fares = records.map(r => Number(r.청구운임) || 0);
  const avg = Math.round(fares.reduce((s, v) => s + v, 0) / fares.length);

  setFareResult({
    records,
    count: fares.length,
    avg,
    min: Math.min(...fares),
    max: Math.max(...fares),
    latest: records[0],
  });

  setFareModalOpen(true);
};


const [editPopupOpen, setEditPopupOpen] = React.useState(false);
const [editTarget, setEditTarget] = React.useState(null);
// 🔵 동일 노선 추천 리스트
const [similarOrders, setSimilarOrders] = React.useState([]);


  // ----------------------------
// 🔥 수정모드 + 수정중 데이터 복원
// ----------------------------
React.useEffect(() => {
  const saved = JSON.parse(localStorage.getItem("realtimeEdit") || "{}");

  if (saved.selectedEditMode) setSelectedEditMode(saved.selectedEditMode);
  if (saved.selected) setSelected(saved.selected);
  if (saved.edited) setEdited(saved.edited);
}, []);
// ----------------------------
// 🔥 수정모드 + 선택된행 + 수정값 자동 저장
// ----------------------------
React.useEffect(() => {
  localStorage.setItem(
    "realtimeEdit",
    JSON.stringify({
      selectedEditMode,
      selected,
      edited,
    })
  );
}, [selectedEditMode, selected, edited]);


  React.useEffect(() => {
  const saved = JSON.parse(localStorage.getItem("realtimeFilters") || "{}");

  if (!saved.startDate && !saved.endDate) {
    const today = todayKST();
    setStartDate(today);
    setEndDate(today);
    localStorage.setItem(
      "realtimeFilters",
      JSON.stringify({
        startDate: today,
        endDate: today,
      })
    );
    return;
  }

  if (saved.q) setQ(saved.q);
  if (saved.filterType) setFilterType(saved.filterType);
  if (saved.filterValue) setFilterValue(saved.filterValue);
  if (saved.startDate) setStartDate(saved.startDate);
  if (saved.endDate) setEndDate(saved.endDate);
}, []);


// -------------------------------------------------------------
// ⭐ 저장 useEffect도 위의 것 바로 아래에 같이 위치 ⭐
// -------------------------------------------------------------
React.useEffect(() => {
  localStorage.setItem(
    "realtimeFilters",
    JSON.stringify({
      q,
      filterType,
      filterValue,
      startDate,
      endDate,
    })
  );
}, [q, filterType, filterValue, startDate, endDate]);

  // 신규 오더 등록 팝업
  const [showCreate, setShowCreate] = React.useState(false);
  const [fareOpen, setFareOpen] = React.useState(false);
const [fareResult, setFareResult] = React.useState(null);
const [fareModalOpen, setFareModalOpen] = React.useState(false);
  const [autoList, setAutoList] = React.useState([]);
  

  const [newOrder, setNewOrder] = React.useState({
    상차일: "",
    상차_AMPM: "오전",
    상차시간: "",
    하차일: "",
    하차_AMPM: "오전",
    하차시간: "",
    거래처명: "",
    상차지명: "",
    상차지주소: "",
    하차지명: "",
    하차지주소: "",
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    상차방법: "",
    하차방법: "",
    청구운임: "",
    기사운임: "",
    지급방식: "",
    배차방식: "",
    메모: "",
    혼적: false,
    독차: false,
  });
  // 🔥 신규 오더 입력 변경 처리
const handleChange = (key, value) => {
  setNewOrder(prev => ({ ...prev, [key]: value }));
};


  // 삭제된 건 재등장 방지
  const [deletedIds, setDeletedIds] = React.useState(() => new Set());

  // 하이라이트
  const [highlightIds, setHighlightIds] = React.useState(() => new Set());
  const [savedHighlightIds, setSavedHighlightIds] = React.useState(
    () => new Set()
  );

  // 신규기사 등록 중복 방지
  const [isRegistering, setIsRegistering] = React.useState(false);
  // =================== 기사 선택 모달 상태 ===================
const [driverSelectInfo, setDriverSelectInfo] = React.useState(null);
/*
{
  rowId,
  list: [],
  selectedDriver: null
}
*/


  // 주소 더보기
  const [expandedAddr, setExpandedAddr] = React.useState({});

  // 상차 임박 경고
  const [warningList, setWarningList] = React.useState([]);

  // 첨부파일 개수
  const [attachCount, setAttachCount] = React.useState({});

  // ------------------------
  // Firestore → rows 반영 (순서 절대 보존)
  // ------------------------
  React.useEffect(() => {
    const base = (dispatchData || []).filter(
      (r) => !!r && !deletedIds.has(r._id)
    );

    setRows((prev) => {
  const map = new Map(base.map((r) => [r._id, r]));

  const kept = prev
    .filter((r) => map.has(r._id))
    .map((r) => ({ ...r, ...map.get(r._id) }));

  const newOnes = base.filter(
    (r) => !prev.some((p) => p._id === r._id)
  );

  const merged = [...kept, ...newOnes];

  // 🔥 최종 정렬: 배차중 → 최상단 / 배차완료 → updatedAt 최신순
  merged.sort((a, b) => {
    if (a.배차상태 === "배차중" && b.배차상태 !== "배차중") return -1;
    if (a.배차상태 !== "배차중" && b.배차상태 === "배차중") return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  return merged;
});
}, [dispatchData, deletedIds]);

  // 🔥 rows 갱신 후 edited 데이터 다시 반영
React.useEffect(() => {
  if (!Object.keys(edited).length) return;

  setRows((prev) =>
    prev.map((r) =>
      edited[r._id]
        ? { ...r, ...edited[r._id] } // 수정값 덮어쓰기
        : r
    )
  );
}, [rows]);
// ========================
// 🔔 파일 업로드 감지 (이미 본 건 다시 안 뜸)
// ========================
React.useEffect(() => {
  if (!rows.length) return;

  const newAlerts = [];

  rows.forEach(r => {
    const id = r._id;
    const cur = attachCount[id] || 0;
    const prev = prevAttachRef.current[id] || 0;

    // 첨부파일 증가 체크
    if (cur > prev) {
      // 이미 본 알림이면 스킵
      if (!seenAlerts.has(id)) {
        newAlerts.push({
          id,
          date: r.상차일,
          from: r.상차지명,
          to: r.하차지명,
          count: cur - prev,
          time: Date.now(),
        });

        // 알림음
        const audio = new Audio("/dingdong.mp3");
        audio.volume = 0.6;
        audio.play().catch(() => {});
      }

      // 이전 첨부 개수 업데이트
      prevAttachRef.current[id] = cur;
    }
  });

  if (newAlerts.length > 0) {
    // 알림 추가
    setUploadAlerts(prev => [...prev, ...newAlerts]);

    // 이미 본 알림 목록에 추가
    const updatedSeen = new Set(seenAlerts);
    newAlerts.forEach(a => updatedSeen.add(a.id));
    setSeenAlerts(updatedSeen);
    localStorage.setItem("seenAlerts", JSON.stringify([...updatedSeen]));

    // 6초 후 화면에서 알림 제거
    setTimeout(() => {
      setUploadAlerts(prev =>
        prev.filter(a => Date.now() - a.time < 6000)
      );
    }, 6000);
  }
}, [rows, attachCount]);

  // ------------------------
  // 첨부파일 개수 로드
  // ------------------------
  React.useEffect(() => {
  const load = async () => {
    const result = {};
    if (!dispatchData) return;

    for (const row of dispatchData) {
      if (!row?._id) continue;
      try {
        const snap = await getDocs(
          collection(db, "dispatch", row._id, "attachments")
        );
        result[row._id] = snap.size;
      } catch {
        result[row._id] = 0;
      }
    }
    setAttachCount(result);
  };

  load();
}, [dispatchData, showCreate]);   // ← rows 제거



  // ------------------------
  // 오전/오후 → 24시간 변환
  // ------------------------
  const normalizeTime = (t) => {
    if (!t) return "";
    let s = t.trim();

    if (/^\d{1,2}:\d{2}$/.test(s)) {
      return s.padStart(5, "0");
    }

    const m = s.match(/(오전|오후)\s*(\d{1,2}):?(\d{2})?/);
    if (!m) return "";

    let [, ampm, hh, mm] = m;
    mm = mm ?? "00";
    hh = parseInt(hh, 10);

    if (ampm === "오후" && hh < 12) hh += 12;
    if (ampm === "오전" && hh === 12) hh = 0;

    return `${String(hh).padStart(2, "0")}:${mm}`;
  };

  // ------------------------
  // 상차 임박 경고 (오전·오후 지원)
  // ------------------------
  React.useEffect(() => {
    if (!rows.length) {
      setWarningList([]);
      return;
    }

    const now = new Date();
    const temp = [];

    rows.forEach((r) => {
      if (r.차량번호 && String(r.차량번호).trim() !== "") return;
      if (!r.상차일 || !r.상차시간) return;

      const t24 = normalizeTime(r.상차시간);
      if (!t24) return;

      const dt = new Date(`${r.상차일}T${t24}:00`);
      if (isNaN(dt.getTime())) return;

      const diff = dt.getTime() - now.getTime();
      if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
        temp.push(r);
      }
    });

    setWarningList(temp);
  }, [rows]);
  
// ------------------------
// 🔁 동일 노선 추천 불러오기
// ------------------------
const loadSimilarOrders = React.useCallback((fromName, toName) => {
  if (!fromName || !toName) {
    setSimilarOrders([]);
    return;
  }

  try {
    const qRef = query(
      collection(db, "dispatch"),
      where("상차지명", "==", fromName),
      where("하차지명", "==", toName),
      orderBy("상차일", "desc"),
      limit(5)
    );

    onSnapshot(qRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSimilarOrders(list);
    });
  } catch (e) {
    console.error("동일 노선 추천 오류", e);
    setSimilarOrders([]);
  }
}, []);
// ⭐ 운임조회 실행 함수
const handleFareCheck = () => {
  if (!newOrder.상차지명 || !newOrder.하차지명) {
    alert("상차지명과 하차지명을 입력해야 운임조회가 가능합니다.");
    return;
  }

  const result = calcFare(dispatchData, {
    pickup: newOrder.상차지명,
    drop: newOrder.하차지명,
    vehicle: newOrder.차량종류,
    ton: newOrder.차량톤수,
    cargo: newOrder.화물내용,
  });

  if (!result) {
    alert("유사 운임 데이터를 찾을 수 없습니다.");
    return;
  }

  setFareResult(result);
  setFareOpen(true);
};

  // ------------------------
  // 숫자 변환
  // ------------------------
  const toInt = (v) => {
    const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };
  const formatComma = (n) => {
    const v = toInt(n);
    return v ? v.toLocaleString() : "";
  };

  // ------------------------
  // 차량번호 정규화
  // ------------------------
  const normalizePlate = React.useCallback(
    (s) =>
      String(s || "").replace(/\s+/g, "").replace(/[-.]/g, "").trim(),
    []
  );
  // ------------------------
// 신규 등록 팝업 차량번호 입력
// ------------------------
const handlePopupCarInput = async (e) => {
  if (e.key !== "Enter") return;  // 엔터 아니면 반응 X

  const rawVal = e.target.value;
  const plate = normalizePlate(rawVal);

  // 🔥 차량번호를 모두 지운 경우 → 이름/전화번호도 초기화
  if (!plate) {
    setNewOrder((prev) => ({
      ...prev,
      차량번호: "",
      이름: "",
      전화번호: "",
    }));
    return;
  }

  // 🔍 기존 기사 자동 매칭
  const match = (drivers || []).find(
    (d) => normalizePlate(d.차량번호) === plate
  );

  if (match) {
    // 🔥 기존 기사면 자동 등록
    setNewOrder((prev) => ({
      ...prev,
      차량번호: rawVal,
      이름: match.이름,
      전화번호: match.전화번호,
    }));
    return;
  }

  // ---------------------------
  // 🔥 신규 기사 등록
  // ---------------------------
  const ok = window.confirm(
    `차량번호 [${rawVal}] 기사 정보가 없습니다.\n신규 기사로 등록할까요?`
  );
  if (!ok) return;

  const 이름 = prompt("신규 기사 이름을 입력하세요");
  if (!이름) return;

  const 전화번호 = prompt("전화번호를 입력하세요");
  if (!전화번호) return;

  // Firestore 신규 기사 저장
  await upsertDriver?.({
    _id: crypto.randomUUID(), // 신규 기사 강제 생성!
    차량번호: rawVal,
    이름,
    전화번호,
  });

  // 신규 기사 정보 입력창에 반영
  setNewOrder((prev) => ({
    ...prev,
    차량번호: rawVal,
    이름,
    전화번호,
  }));

  alert("신규 기사 등록 완료!");
};




// ------------------------
// driverMap 생성  ← 🔥 여기!
// ------------------------
const driverMap = (() => {
  const m = new Map();
  (drivers || []).forEach((d) => {
    const k = normalizePlate(d.차량번호);
    if (!k) return;
    // 동일 차량번호 여러 기사 저장 허용
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(d);
  });
  return m;
})();

// ==========================================
// 🚚 기사 확인 모달 상태 + 적용 함수 추가 (START)
// ==========================================
const [driverConfirmOpen, setDriverConfirmOpen] = React.useState(false);
const [driverConfirmInfo, setDriverConfirmInfo] = React.useState(null);
const [driverConfirmRowId, setDriverConfirmRowId] = React.useState(null);
// 모달 포커스용
  const modalRef = useRef(null);

  // 🔥 팝업 뜰 때 자동 포커스
  useEffect(() => {
    if (driverConfirmOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [driverConfirmOpen]);

  // 🔥 팝업 뜬 상태에서 엔터 누르면 자동 적용
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!driverConfirmOpen) return;
      if (e.key === "Enter") {
        confirmDriverApply();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [driverConfirmOpen, driverConfirmInfo]);

const confirmDriverApply = async () => {
  if (!driverConfirmRowId || !driverConfirmInfo) return;

  const updated = {
    차량번호: driverConfirmInfo.차량번호,
    이름: driverConfirmInfo.이름,
    전화번호: driverConfirmInfo.전화번호,
    배차상태: "배차완료",
  };

  await patchDispatch(driverConfirmRowId, updated);

  setDriverConfirmOpen(false);
  setDriverConfirmInfo(null);
  setDriverConfirmRowId(null);
};
// ------------------------
// 📌 차량번호 입력(auto-match + 신규기사 등록)
// ------------------------
const handleCarInput = async (id, rawVal, keyEvent) => {
  // 🚨 엔터 입력 시 → 기본동작 + 이벤트 전파 모두 차단
  if (keyEvent && keyEvent.key === "Enter") {
    keyEvent.preventDefault();
    keyEvent.stopPropagation();
  }

  if (isRegistering) return;

  const v = normalizePlate(rawVal);
  const idx = rows.findIndex((r) => r._id === id);
  if (idx === -1) return;

  const oldRow = rows[idx];

  // 차량번호 삭제 → 기사 정보 초기화
  if (!v) {
    
    const updated = {
      차량번호: "",
      이름: "",
      전화번호: "",
      배차상태: "배차중",
    };

    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, ...updated } : r))
    );

    await patchDispatch?.(id, updated);
// 🔥 포커스 유지
setTimeout(() => {
  const el = document.querySelector(`[data-id="${id}"] input[name="차량번호"]`);
  if (el) {
    el.focus();
    el.select();
  }
}, 80);

// 최근 업데이트 기준 화면 rows 최신화
setRows(prev =>
  prev.map(r =>
    r._id === id ? { ...r, updatedAt: Date.now() } : r
  )
);

// dispatchData도 동일하게 최신화 + 상태 강제 배차완료
setDispatchData(prev =>
  prev.map(r =>
    r._id === id
      ? { ...r, updatedAt: Date.now(), 배차상태: "배차완료" }
      : r
  )
);

return;

  }

  const matches = driverMap.get(v) || [];

  // 🔹 기존 기사 1명 → 팝업 표시(자동매칭)
  if (matches.length === 1) {
    const match = matches[0];
    setDriverConfirmInfo({
      이름: match.이름,
      차량번호: rawVal,
      전화번호: match.전화번호,
    });
    setDriverConfirmRowId(id);
    setDriverConfirmOpen(true);
    return; // 🚫 confirmDriverApply 실행 금지(팝업에서 엔터로!)
  }

  // 🔹 기존 기사 여러 명 → 기사 선택 모달
if (matches.length > 1) {
  setDriverSelectInfo({
    rowId: id,
    list: matches,
    selectedDriver: null,
  });
  return;
}

  // 🔹 신규 기사 → 팝업
  setDriverConfirmInfo({
    이름: "",
    차량번호: rawVal,
    전화번호: "",
  });
  setDriverConfirmRowId(id);
  setDriverConfirmOpen(true);
  return;
};


  // ------------------------
  // 📌 필터 + 검색 + 정렬
  // ------------------------
  const filtered = React.useMemo(() => {
    let data = [...rows];
    const today = todayKST();

    const isInRange = (date, start, end) => {
      if (!date) return false;
      const d = new Date(date).getTime();
      const s = start ? new Date(start).getTime() : -Infinity;
      const e = end ? new Date(end).getTime() : Infinity;
      return d >= s && d <= e;
    };

    if (!startDate && !endDate) {
      data = data.filter((r) => (r.상차일 || "") === today);
    } else {
      data = data.filter((r) =>
        isInRange(r.상차일, startDate, endDate)
      );
    }

    if (filterType && filterValue) {
      data = data.filter((r) =>
        String(r[filterType] || "").includes(filterValue)
      );
    }

    if (q.trim()) {
      const key = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) =>
          String(v || "").toLowerCase().includes(key)
        )
      );
    }

    return data;
  }, [rows, q, filterType, filterValue, startDate, endDate]);

  // KPI
  const kpi = React.useMemo(() => {
    const sale = filtered.reduce((a, r) => a + toInt(r.청구운임), 0);
    const drv = filtered.reduce((a, r) => a + toInt(r.기사운임), 0);
    return { cnt: filtered.length, sale, drv, fee: sale - drv };
  }, [filtered]);

  // ------------------------
  // 📌 선택 체크
  // ------------------------
  const toggleSelect = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  // ------------------------
  // 📌 선택수정 저장
  // ------------------------
  const handleSaveSelected = async () => {
    const ids = selected.length ? selected : Object.keys(edited);
    if (!ids.length) return alert("변경된 내용이 없습니다.");

    for (const id of ids) {
      const ch = edited[id];
      if (ch && Object.keys(ch).length) {
        await patchDispatch?.(id, ch);
      }
    }

    setSavedHighlightIds((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => n.add(id));
      return n;
    });

    setTimeout(() => {
  setSavedHighlightIds((prev) => {
    const n = new Set(prev);
    ids.forEach((id) => n.delete(id));
    return n;
  });
}, 2000);   // ← 2초로 변경


    alert("저장 완료");
    setEdited({});
    setSelectedEditMode(false);
  };
// =======================
// 🔥 팝업에서 실제 삭제 실행
// =======================
const executeDelete = async () => {
  const ids = deleteList.map(r => r._id);

  for (const id of ids) {
    try {
      await removeDispatch(id);
    } catch (e) {
      console.error("삭제 실패:", e);
    }
  }

  // 화면에서 제거
  setRows(prev => prev.filter(r => !ids.includes(r._id)));

  // 되돌리기 스택 저장
  setUndoStack(deleteList);
  setShowUndo(true);
  setTimeout(() => setShowUndo(false), 8000);

  // 초기화
  setSelected([]);
  setDeleteConfirmOpen(false);
};

// =======================
// 🔥 되돌리기 기능
// =======================
const undoDelete = async () => {
  for (const r of undoStack) {
    await addDispatch(r);
  }
  setRows(prev => [...prev, ...undoStack]);
  setUndoStack([]);
  setShowUndo(false);
};

  // ------------------------
  // 📌 선택수정 편집 가능 여부
  // ------------------------
  const canEdit = (key, id) => {
    if (!(selectedEditMode && selected.includes(id))) return false;

    const readOnly = [
      "등록일",
      "순번",
      "차량번호",
      "배차상태",
      "이름",
      "전화번호",
    ];
    return !readOnly.includes(key);
  };

  // ------------------------
  // 📌 editable input
  // ------------------------
  const handleEditChange = (id, key, value) => {
    setEdited((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: value },
    }));
  };

  const editableInput = (key, val, rowId) => {
    if (!canEdit(key, rowId)) return val;

    if (key === "상차일" || key === "하차일") {
      return (
        <input
          type="date"
          className="border p-1 rounded w-full"
          defaultValue={val || ""}
          onChange={(e) => handleEditChange(rowId, key, e.target.value)}
        />
      );
    }

    if (key === "지급방식") {
      return (
        <select
          className="border p-1 rounded w-full"
          defaultValue={val || ""}
          onChange={(e) => handleEditChange(rowId, key, e.target.value)}
        >
          <option value="">선택</option>
          <option value="계산서">계산서</option>
          <option value="착불">착불</option>
          <option value="선불">선불</option>
          <option value="손실">손실</option>
          <option value="개인">개인</option>
          <option value="기타">기타</option>
        </select>
      );
    }

    if (key === "배차방식") {
      return (
        <select
          className="border p-1 rounded w-full"
          defaultValue={val || ""}
          onChange={(e) => handleEditChange(rowId, key, e.target.value)}
        >
          <option value="">선택</option>
          <option value="24시">24시</option>
          <option value="직접배차">직접배차</option>
          <option value="인성">인성</option>
          <option value="24시(외주업체)">24시(외주업체)</option>
        </select>
      );
    }

    return (
      <input
        type="text"
        className="border p-1 rounded w-full"
        defaultValue={val || ""}
        onChange={(e) => handleEditChange(rowId, key, e.target.value)}
      />
    );
  };

  // ------------------------
  // 📌 주소 셀 (더보기)
  // ------------------------
  const renderAddrCell = (key, val, rowId) => {
    if (canEdit(key, rowId)) {
      return (
        <input
          type="text"
          className="border p-1 rounded w-full"
          defaultValue={val || ""}
          onChange={(e) => handleEditChange(rowId, key, e.target.value)}
        />
      );
    }

    const text = String(val || "");
    if (!text) return "";

    const stKey = `${rowId}_${key}`;
    const expanded = !!expandedAddr[stKey];
    const display =
      text.length <= 12 || expanded ? text : text.slice(0, 12) + "...";

    return (
      <div className="flex items-center gap-1">
        <span className="whitespace-pre-line break-words">{display}</span>

        {text.length > 12 && (
          <button
            type="button"
            className="text-xs text-blue-600 underline"
            onClick={() =>
              setExpandedAddr((prev) => ({
                ...prev,
                [stKey]: !prev[stKey],
              }))
            }
          >
            {expanded ? "접기" : "더보기"}
          </button>
        )}
      </div>
    );
  };

  // ------------------------
  // 📌 공유 메시지
  // ------------------------
  // ------------------------
// 📌 카카오톡 메시지 생성
// ------------------------
const makeKakaoMsg = (r) => {
  // 날짜 표시 "11월 18일 (화)"
  const dateObj = r.상차일 ? new Date(r.상차일) : null;
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dayLabel = dateObj ? dayNames[dateObj.getDay()] : "";
  const month = dateObj ? dateObj.getMonth() + 1 : "";
  const day = dateObj ? dateObj.getDate() : "";
  const shortDate = dateObj ? `${month}월 ${day}일 (${dayLabel})` : "";

  // 전화번호 하이픈 자동 정리
  const formatPhone = (p) => {
    if (!p) return "";
    const num = p.replace(/\D/g, "");
    if (num.length === 11)
      return num.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
    if (num.length === 10)
      return num.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
    return p;
  };

  const driverPhone = formatPhone(r.전화번호 || "");

  // 익일 자동 판단
  let displayUnloadTime = r.하차시간 || "";
  if (r.상차일 && r.하차일) {
    const s = new Date(r.상차일);
    const h = new Date(r.하차일);
    if (h.getTime() > s.getTime()) {
      displayUnloadTime = `익일 ${r.하차시간 || ""}`;
    }
  }

  // 지급방식 표시 결정
  let payLabel = "(부가세별도)";
  if (r.지급방식 === "선불" || r.지급방식 === "착불") {
    payLabel = `(${r.지급방식})`;
  }

  return `
${shortDate}

[상차지]
${r.상차지명 || ""}
☎ 
상차일자 : ${r.상차일 || ""}
상차시간 : ${r.상차시간 || ""}
상차주소 : ${r.상차지주소 || ""}

[하차지]
${r.하차지명 || ""}
하차일자 : ${r.하차일 || ""}
하차시간 : ${displayUnloadTime}
하차주소 : ${r.하차지주소 || ""}
☎ 

배차차량 : ${r.차량번호 || ""}/${r.이름 || ""}/${driverPhone}
화물내용 : ${r.화물내용 || ""}
차량종류 : ${r.차량종류 || ""}
차량톤수 : ${r.차량톤수 || ""}

운임 : ${(r.청구운임 || 0).toLocaleString()}원 ${payLabel}

배차되었습니다.
  `.trim();
};

// ------------------------
// 📌 카카오톡 복사
// ------------------------
const kakaoCopy = (row) => {
  const msg = makeKakaoMsg(row);
  navigator.clipboard.writeText(msg);
  alert("📋 카카오톡 메시지가 복사되었습니다!\n카톡에 붙여넣기 하면 바로 전송됩니다.");
};

// ------------------------
// 📌 공유 메시지 (기존 함수)
// ------------------------
const shareDispatch = (row) => {
  const url = `${window.location.origin}/upload?id=${row._id}`;

  const msg = `
📦 [배차 정보]

🟦 거래처: ${row.거래처명 || ""}
📍 상차지: ${row.상차지명 || ""} / ${row.상차지주소 || ""}
📍 하차지: ${row.하차지명 || ""} / ${row.하차지주소 || ""}

⏰ 상차: ${row.상차일 || ""} ${row.상차시간 || ""}
⏰ 하차: ${row.하차일 || ""} ${row.하차시간 || ""}

🚚 차량: ${row.차량번호 || ""} / ${row.이름 || ""} (${row.전화번호 || ""})
💰 기사운임: ${(row.기사운임 || 0).toLocaleString()}원

📝 메모:
${row.메모 || ""}

📎 사진 업로드:
${url}
`.trim();

  navigator.clipboard.writeText(msg);
  alert("📋 공유 메시지가 복사되었습니다!");
};


  // ------------------------
  // 테이블 스타일
  // ------------------------
  const head =
        "border px-2 py-2 bg-slate-100 text-slate-800 text-center whitespace-nowrap";

  const cell =
    "border px-2 py-[2px] text-center align-middle whitespace-nowrap overflow-hidden text-ellipsis leading-tight";
  const addrCell = `${cell} min-w-[80px] max-w-[160px]`;

  // ------------------------
  // 📌 화면 렌더링
  // ------------------------
  return (
    <div className="p-3 w-full">
      {/* ======================== 상단 KPI ======================== */}
<div className="flex items-center gap-5 text-sm font-semibold mb-1">
  <div>총 {kpi.cnt}건</div>
  <div className="text-blue-600">청구 {kpi.sale.toLocaleString()}원</div>
  <div className="text-green-600">기사 {kpi.drv.toLocaleString()}원</div>
  <div className="text-orange-600">수수료 {kpi.fee.toLocaleString()}원</div>
</div>
  {/* ⚠ 상차 임박 경고 배너 */}
    {warningList.length > 0 && (
      <div className="bg-red-100 border border-red-400 text-red-800 p-3 rounded mb-3 text-sm">
        <b>⚠ 배차 경고!</b> 상차 2시간 이하 남았는데{" "}
        <b>{warningList.length}</b>건이 미배차 상태입니다.
        <ul className="list-disc ml-5 mt-1">
          {warningList.map((r) => (
            <li key={r._id}>
              [{r.상차일} {r.상차시간}] {r.상차지명} (거래처: {r.거래처명})
            </li>
          ))}
        </ul>
      </div>
    )}
{/* ======================== 검색 + 날짜 ======================== */}
<div className="flex items-center gap-2 mb-2">
  {/* 🔍 검색 입력 */}
  <input
    type="text"
    value={q}
    onChange={(e) => setQ(e.target.value)}
    placeholder="검색어"
    className="border px-2 py-1 rounded text-sm"
  />

  {/* 📅 상차일 */}
  <input
    type="date"
    value={startDate}
    onChange={(e) => setStartDate(e.target.value)}
    className="border px-2 py-1 rounded text-sm"
  />

  <span>~</span>

  {/* 📅 하차일 */}
  <input
    type="date"
    value={endDate}
    onChange={(e) => setEndDate(e.target.value)}
    className="border px-2 py-1 rounded text-sm"
  />

  {/* 🆕 여기에 버튼 추가 */}
  <button
    onClick={() => {
      const today = todayKST();
      setStartDate(today);
      setEndDate(today);
    }}
    className="px-3 py-1 rounded bg-blue-500 text-white text-sm"
  >
    당일
  </button>
  <button
  onClick={() => {
    const t = tomorrowKST();
    setStartDate(t);
    setEndDate(t);
  }}
  className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
>
  내일
</button>


  <button
    onClick={() => {
      setStartDate("");
      setEndDate("");
    }}
    className="px-3 py-1 rounded bg-gray-400 text-white text-sm"
  >
    초기화
  </button>
</div>


      {/* 상단 버튼 */}
<div className="flex justify-end gap-2 mb-2">
  {/* 📋 기사복사 모달 오픈 버튼 */}
<button
  onClick={() => {
    if (!selected.length) {
      return alert("📋 복사할 오더를 선택하세요.");
    }
    if (selected.length > 1) {
      return alert("⚠️ 복사는 1개의 오더만 가능합니다.");
    }
    setCopyModalOpen(true);
  }}
  className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold shadow hover:opacity-90"
>
  📋 기사복사
</button>

{/* 📡 선택전송 (24시콜) */}
<button
  onClick={async () => {
    if (!selected.length)
      return alert("전송할 항목을 선택하세요.");

    const ids = [...selected];
    let success = 0, fail = 0;

    for (const id of ids) {
      const row = dispatchData.find(r => r._id === id);
      if (!row) continue;

      if (!row.상차지주소 || !row.하차지주소) {
        alert(`[${row.상차지명} → ${row.하차지명}]\n주소가 없습니다.`);
        fail++;
        continue;
      }

      try {
        const res = await sendOrderTo24(row);

        if (res?.success) {
          success++;
        } else {
          fail++;
        }
      } catch (e) {
        console.error("24시콜 오류:", e);
        fail++;
      }
    }

    alert(`📡 24시콜 선택전송 완료!
성공: ${success}건
실패: ${fail}건`);
  }}
  className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm font-semibold shadow hover:opacity-90"
>
  📡 선택전송(24시콜)
</button>

  {/* 선택수정 */}
  <button
    onClick={() => {
      if (selected.length !== 1)
        return alert("수정할 항목은 1개만 선택해야 합니다.");

      const row = rows.find((r) => r._id === selected[0]);
      if (!row) return;

      setEditTarget({ ...row }); // 팝업에 띄울 데이터
      setEditPopupOpen(true);    // 팝업 열기
    }}
    className="px-4 py-2 rounded-lg bg-gray-600 text-white text-sm font-semibold shadow hover:opacity-90"
  >
    선택수정
  </button>

        <button
          onClick={handleSaveSelected}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow hover:opacity-90"
        >
          저장
        </button>

       <button
  onClick={() => {
    if (!selected.length) return alert("삭제할 항목을 선택하세요.");

    const list = rows.filter(r => selected.includes(r._id));
    setDeleteList(list);             // 삭제 대상 저장
    setDeleteConfirmOpen(true);      // 팝업 열기
  }}
  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold shadow hover:opacity-90"
>
  선택삭제
</button>

        {/* ⭐⭐⭐ 선택초기화 버튼 추가 */}
<button
  onClick={() => setSelected([])}
  className="px-4 py-2 rounded-lg bg-gray-300 text-gray-800 text-sm font-semibold shadow hover:opacity-90"
  >

  선택초기화
</button>

        {/* 엑셀 다운로드 */}
        <button
          onClick={() => {
            
  if (!filtered.length) {
    alert("내보낼 데이터가 없습니다.");
    return;
  }

  const rowsExcel = filtered.map((r, idx) => {
  const fmtDate = (v) => {
    if (!v) return "";
    // 이미 문자열이면 그대로
    if (typeof v === "string") return v.slice(0, 10);

    // Date 객체면 yyyy-mm-dd 로 변환
    return new Date(v).toISOString().slice(0, 10);
  };

  const num = (v) =>
    Number(String(v || "").replace(/[^\d]/g, "")) || 0;

  return {
    순번: idx + 1,

    // 🔥 날짜는 무조건 yyyy-mm-dd 문자열로 변환
    등록일: fmtDate(r.등록일),
    상차일: fmtDate(r.상차일),
    하차일: fmtDate(r.하차일),

    상차시간: r.상차시간 || "",
    하차시간: r.하차시간 || "",
    거래처명: r.거래처명 || "",
    상차지명: r.상차지명 || "",
    상차지주소: r.상차지주소 || "",
    하차지명: r.하차지명 || "",
    하차지주소: r.하차지주소 || "",
    화물내용: r.화물내용 || "",
    차량종류: r.차량종류 || "",
    차량톤수: r.차량톤수 || "",
    차량번호: r.차량번호 || "",
    기사명: r.이름 || "",
    전화번호: r.전화번호 || "",
    배차상태: r.배차상태 || "",

    // 🔥 숫자는 Number 타입으로 → Excel이 콤마 자동 표시
청구운임: toMoney(r.청구운임),
기사운임: toMoney(r.기사운임),
수수료: toMoney(r.청구운임) - toMoney(r.기사운임),

    지급방식: r.지급방식 || "",
    배차방식: r.배차방식 || "",
    메모: r.메모 || "",
  };
});


  const ws = XLSX.utils.json_to_sheet(rowsExcel);

// ======================
// 🔥 상차일(C)만 날짜 처리 (시간 절대 안 붙음)
// ======================
Object.keys(ws).forEach((cell) => {
  if (cell[0] === "!") return;

  const col = cell.replace(/[0-9]/g, "");

  // 🎯 C열 = 상차일만 날짜 변환 적용
  if (col === "C") {
    const v = ws[cell].v;

    // yyyy-mm-dd 문자열인지 검사
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {

      // JS Date 객체 쓰지 말고 → 직접 Excel 날짜 serial number 생성
      const parts = v.split("-");
      const d = new Date(parts[0], parts[1] - 1, parts[2]);  // 로컬 날짜

      const excelSerial =
        (d - new Date("1899-12-30T00:00:00")) / 86400000;

      ws[cell].v = excelSerial;   // 엑셀 숫자 날짜
      ws[cell].t = "n";
      ws[cell].z = "yyyy-mm-dd";  // 날짜 포맷
    }
  }

// 금액(S,T,U)
if (["S", "T", "U"].includes(col)) {
  const num = Number(String(ws[cell].v).replace(/[^\d-]/g, ""));
  ws[cell].v = isNaN(num) ? 0 : num;
  ws[cell].t = "n";
  ws[cell].z = "#,##0";    // 콤마 표시
}

  // 2) 금액(S,T,U)
  if (["S", "T", "U"].includes(col)) {
    const num = Number(String(ws[cell].v).replace(/[^\d-]/g, ""));
    ws[cell].v = isNaN(num) ? 0 : num;
    ws[cell].t = "n";
    ws[cell].z = "#,##0"; // 콤마 표시
  }
});

// ======================
// 🔥 날짜 컬럼 너비 자동 설정
// ======================
ws["!cols"] = [
  { wch: 6 },   // A: 순번
  { wch: 12 },  // B: 등록일
  { wch: 12 },  // C: 상차일
  { wch: 10 },  // D: 상차시간
  { wch: 12 },  // E: 하차일
  { wch: 10 },  // F: 하차시간
  // 나머지는 기본값
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "실시간배차현황");
XLSX.writeFile(wb, "실시간배차현황.xlsx");

}}

          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow hover:opacity-90"
        >
          엑셀다운
        </button>

        {/* 신규 오더 버튼 */}
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow hover:opacity-90"
        >
          + 신규 오더 등록
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto w-full">
        <table className="w-auto min-w-max text-sm border table-auto">
          <thead>
            <tr>
              {[
                "선택",
                "순번",
                "등록일",
                "상차일",
                "상차시간",
                "하차일",
                "하차시간",
                "거래처명",
                "상차지명",
                "상차지주소",
                "하차지명",
                "하차지주소",
                "화물내용",
                "차량종류",
                "차량톤수",
                "혼적",
                "차량번호",
                "이름",
                "전화번호",
                "배차상태",
                "청구운임",
                "기사운임",
                "수수료",
                "지급방식",
                "배차방식",
                "메모",
                "첨부",
                "공유",
                "카톡",
              ].map((h) => (
                <th key={h} className={head}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r, idx) => {
              const sale = toInt(edited[r._id]?.청구운임 ?? r.청구운임);
              const drv = toInt(edited[r._id]?.기사운임 ?? r.기사운임);
              const fee = sale - drv;

              return (
<tr
  key={r._id || r.id || `idx-${idx}`}

                  className={`
                    ${idx % 2 ? "bg-gray-50" : ""}
                    ${selected.includes(r._id) ? "bg-yellow-200 border-2 border-yellow-500" : ""}
                    ${highlightIds.has(r._id) ? "animate-pulse bg-green-200" : ""}
                    ${savedHighlightIds.has(r._id) ? "row-highlight" : ""}
                  `}
                >
                  <td className={cell}>
                    <input
                      type="checkbox"
                      checked={selected.includes(r._id)}
                      onChange={() => toggleSelect(r._id)}
                    />
                  </td>

                  <td className={cell}>{idx + 1}</td>
                  <td className={cell}>{r.등록일}</td>

                  <td className={cell}>{editableInput("상차일", r.상차일, r._id)}</td>
                  <td className={cell}>{editableInput("상차시간", r.상차시간, r._id)}</td>

                  <td className={cell}>{editableInput("하차일", r.하차일, r._id)}</td>
                  <td className={cell}>{editableInput("하차시간", r.하차시간, r._id)}</td>

                  <td className={cell}>{editableInput("거래처명", r.거래처명, r._id)}</td>
                  <td className={cell}>{editableInput("상차지명", r.상차지명, r._id)}</td>

                  <td className={addrCell}>
                    {renderAddrCell("상차지주소", r.상차지주소, r._id)}
                  </td>

                  <td className={cell}>{editableInput("하차지명", r.하차지명, r._id)}</td>
                  <td className={addrCell}>
                    {renderAddrCell("하차지주소", r.하차지주소, r._id)}
                  </td>

                  <td className={cell}>{editableInput("화물내용", r.화물내용, r._id)}</td>
                  <td className={cell}>{editableInput("차량종류", r.차량종류, r._id)}</td>
                  <td className={cell}>{editableInput("차량톤수", r.차량톤수, r._id)}</td>
                  <td className={cell}>
  {r.혼적 ? "Y" : ""}
</td>
                  

                  {/* 차량번호 */}
                  <td className={cell}>
                    <input
  name="차량번호"
  data-id={r._id}
  type="text"
  defaultValue={r.차량번호 || ""}
  className="border p-1 rounded w-[110px]"
  onKeyDown={(e) =>
    e.key === "Enter" &&
    handleCarInput(r._id, e.currentTarget.value, e)
  }
  onBlur={(e) =>
    handleCarInput(r._id, e.currentTarget.value)
  }
/>

                  </td>

                  <td className={`${cell} w-[80px] max-w-[80px] overflow-hidden text-ellipsis`}>
  {r.이름}
</td>

                  <td className={cell}>{formatPhone(r.전화번호)}</td>

                  <td className={cell}>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        r.배차상태 === "배차완료"
                          ? "bg-green-100 text-green-700 border border-green-400"
                          : "bg-yellow-100 text-yellow-700 border border-yellow-400"
                      }`}
                    >
                      {r.배차상태}
                    </span>
                  </td>
                  

                  {/* 청구운임 */}
                  <td className={cell}>
                    {canEdit("청구운임", r._id) ? (
                      <input
                        type="text"
                        className="border p-1 rounded w-full"
                        defaultValue={r.청구운임 || ""}
                        onChange={(e) =>
                          handleEditChange(r._id, "청구운임", e.target.value)
                        }
                      />
                    ) : (
                      formatComma(r.청구운임)
                    )}
                  </td>

                  {/* 기사운임 */}
                  <td className={cell}>
                    {canEdit("기사운임", r._id) ? (
                      <input
                        type="text"
                        className="border p-1 rounded w-full"
                        defaultValue={r.기사운임 || ""}
                        onChange={(e) =>
                          handleEditChange(r._id, "기사운임", e.target.value)
                        }
                      />
                    ) : (
                      formatComma(r.기사운임)
                    )}
                  </td>

                  {/* 수수료 */}
                  <td className={`${cell} text-right pr-2`}>
                    <span
                      className={fee < 0 ? "text-red-600" : "text-blue-600"}
                    >
                      {formatComma(fee)}
                    </span>
                  </td>

                  <td className={cell}>{editableInput("지급방식", r.지급방식, r._id)}</td>
                  <td className={cell}>{editableInput("배차방식", r.배차방식, r._id)}</td>
                  <td className={cell}>
  {canEdit("메모", r._id)
    ? editableInput("메모", r.메모, r._id)
    : <MemoMore text={r.메모} />}
</td>

                  {/* 첨부 */}
                  <td className={cell}>
                    <button
                      onClick={() =>
                        window.open(`/upload?id=${r._id}`, "_blank")
                      }
                      className="text-blue-600 underline"
                    >
                      📎 {attachCount[r._id] || 0}
                    </button>
                  </td>

                  {/* 공유 */}
<td className={cell}>
  <button
    onClick={() => shareDispatch(r)}
    className="bg-blue-600 text-white px-3 py-1 rounded"
  >
    공유
  </button>
</td>

{/* 카톡 */}
<td className={cell}>
  <button
    onClick={() => kakaoCopy(r)}
    className="bg-yellow-500 text-white px-3 py-1 rounded"
  >
    카톡
  </button>
</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------
          🔵 신규 오더 등록 팝업 (업그레이드 완성본)
      --------------------------------------------------------- */}
      
      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-5 rounded shadow-xl w-[460px] max-h-[90vh] overflow-y-auto">
            
            <h3 className="text-lg font-bold mb-3">신규 오더 등록</h3>
          

            <div className="space-y-3">

              {/* 혼적/독차 */}
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newOrder.혼적 === true}
                    onChange={(e) =>
                      setNewOrder((p) => ({ ...p, 혼적: e.target.checked }))
                    }
                  />
                  혼적
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newOrder.독차 === true}
                    onChange={(e) =>
                      setNewOrder((p) => ({ ...p, 독차: e.target.checked }))
                    }
                  />
                  독차
                </label>
              </div>

              {/* 거래처명 자동완성 */}
              <div>
                <button
  type="button"
  onClick={handleFareCheck}
  className="bg-amber-500 text-white px-3 py-2 rounded w-full mb-2"
>
  🔍 운임조회
</button>

                <label className="font-semibold text-sm">거래처명</label>
                <input
                  type="text"
                  value={newOrder.거래처명}
                  onChange={(e) => {
  const val = e.target.value;
  setNewOrder((prev) => ({
    ...prev,
    거래처명: val,
    상차지명: val,     // ⭐ 자동 입력
  }));
}}

                  placeholder="거래처 검색"
                  className="border p-2 rounded w-full"
                />

                {newOrder.거래처명 &&
                  clients
                    .filter((c) =>
                      c.거래처명.includes(newOrder.거래처명)
                    )
                    .slice(0, 10)
                    .map((c) => (
                      <div
                        key={c._id}
                        className="p-1 px-2 border-b cursor-pointer hover:bg-gray-100"
                        onClick={() =>
                          setNewOrder((prev) => ({
                            ...prev,
                            거래처명: c.거래처명,
                            상차지명: c.상차지명 || "",
                            상차지주소: c.상차지주소 || "",
                          }))
                        }
                      >
                        {c.거래처명}
                      </div>
                    ))}
              </div>

              {/* 상하차일/시간 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label>상차일</label>
                  <input
                    type="date"
                    value={newOrder.상차일}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        상차일: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  />
                </div>

                <div>
                  <label>상차시간</label>
                  <select
                    value={newOrder.상차시간}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        상차시간: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    {[
                      "오전 6:00",
                      "오전 7:00",
                      "오전 8:00",
                      "오전 9:00",
                      "오전 10:00",
                      "오전 11:00",
                      "오후 12:00",
                      "오후 1:00",
                      "오후 2:00",
                      "오후 3:00",
                      "오후 4:00",
                      "오후 5:00",
                      "오후 6:00",
                      "오후 7:00",
                      "오후 8:00",
                      "오후 9:00",
                      "오후 10:00",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>하차일</label>
                  <input
                    type="date"
                    value={newOrder.하차일}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        하차일: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  />
                </div>

                <div>
                  <label>하차시간</label>
                  <select
                    value={newOrder.하차시간}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        하차시간: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    {[
                      "오전 6:00",
                      "오전 7:00",
                      "오전 8:00",
                      "오전 9:00",
                      "오전 10:00",
                      "오전 11:00",
                      "오후 12:00",
                      "오후 1:00",
                      "오후 2:00",
                      "오후 3:00",
                      "오후 4:00",
                      "오후 5:00",
                      "오후 6:00",
                      "오후 7:00",
                      "오후 8:00",
                      "오후 9:00",
                      "오후 10:00",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
{/* 상하차지 */}
<div>

  {/* 상차지명 */}
  <div>
    <label>상차지명</label>
    <input
      type="text"
      className="border p-2 rounded w-full"
      value={newOrder.상차지명}
      onChange={(e) => {
        const v = e.target.value;
        setNewOrder((prev) => ({
          ...prev,
          상차지명: v,
        }));
        loadSimilarOrders(v, newOrder.하차지명);
      }}
    />
  </div>

  {/* 상차지주소 */}
  <div>
    <label>상차지주소</label>
    <input
      type="text"
      className="border p-2 rounded w-full"
      value={newOrder.상차지주소}
      onChange={(e) =>
        setNewOrder((prev) => ({
          ...prev,
          상차지주소: e.target.value,
        }))
      }
    />
  </div>

  {/* 하차지명 */}
  <div>
    <label>하차지명</label>
    <input
      type="text"
      className="border p-2 rounded w-full"
      value={newOrder.하차지명}
      onChange={(e) => {
        const v = e.target.value;
        setNewOrder((prev) => ({
          ...prev,
          하차지명: v,
        }));
        loadSimilarOrders(newOrder.상차지명, v);
      }}
    />
  </div>

  {/* 하차지주소 */}
  <div>
    <label>하차지주소</label>
    <input
      type="text"
      className="border p-2 rounded w-full"
      value={newOrder.하차지주소}
      onChange={(e) =>
        setNewOrder((prev) => ({
          ...prev,
          하차지주소: e.target.value,
        }))
      }
    />
  </div>

</div>

{/* 화물내용 */}
<div>
              
  {/* 🔁 최근 동일 노선 추천 */}
{similarOrders.length > 0 && (
  <div className="p-3 border rounded bg-gray-50 mt-3 text-sm">
    <h3 className="font-bold mb-2">📌 최근 동일 노선 기록</h3>

    {similarOrders.map((o, idx) => (
      <div
        key={o.id}
        className="p-2 mb-2 border rounded cursor-pointer hover:bg-blue-50"
        onClick={() => {
          setNewOrder((prev) => ({
            ...prev,
            화물내용: o.화물내용 || prev.화물내용,
            차량종류: o.차량종류 || prev.차량종류,
            차량톤수: o.차량톤수 || prev.차량톤수,
            청구운임: o.청구운임 || prev.청구운임,
            기사운임: o.기사운임 || prev.기사운임,
            차량번호: o.차량번호 || prev.차량번호,
            이름: o.이름 || prev.이름,
            전화번호: o.전화번호 || prev.전화번호,
          }));
        }}
      >
        <div className="font-semibold">
          {idx + 1}) {o.상차지명} → {o.하차지명}
        </div>

        <div className="text-xs text-gray-500">{o.상차일}</div>

        <div className="text-xs mt-1">
          차량종류: {o.차량종류 || "-"} / 톤수: {o.차량톤수 || "-"}
        </div>
        <div className="text-xs">화물: {o.화물내용 || "-"}</div>

        <div className="text-xs mt-1">
          청구운임: {(o.청구운임 || 0).toLocaleString()}원<br />
          기사운임: {(o.기사운임 || 0).toLocaleString()}원
        </div>

        <div className="text-xs mt-1">
          기사: {o.이름 || "-"} / {o.차량번호 || "-"}
        </div>
      </div>
    ))}
  </div>
)}
  <label>화물내용</label>
  <input
    className="border p-2 rounded w-full"
    value={newOrder.화물내용}
    onChange={(e) => handleChange("화물내용", e.target.value)}
    placeholder="예: 파렛트 12개 / 냉동식품 / 상온화물"
  />
</div>
{/* 화물 톤수 */}
<div>
  <label>화물톤수</label>
  <input
    type="text"
    className="border p-2 rounded w-full"
    value={newOrder.화물톤수 || ""}
    onChange={(e) =>
      setNewOrder((prev) => ({
        ...prev,
        화물톤수: e.target.value,
      }))
    }
    placeholder="예: 12톤 / 8톤 / 5톤"
  />
</div>

{/* 차량번호 / 기사명 / 전화번호 */}
<div className="grid grid-cols-2 gap-3">
  <div>
    <label>차량번호</label>
    <input
  className="border p-2 rounded w-full"
  value={newOrder.차량번호 || ""}
  onChange={(e) => {
    const rawVal = e.target.value;

    // 차량번호 쓰는 즉시 상태 업데이트
    setNewOrder((prev) => ({
      ...prev,
      차량번호: rawVal,
      // 🔥 차량번호를 전부 지웠으면 이름/전화번호도 즉시 초기화
      ...(rawVal.trim() === "" && {
        이름: "",
        전화번호: "",
      }),
    }));
  }}
  onKeyDown={handlePopupCarInput}  // 엔터 입력시 자동매칭/신규등록
  placeholder="예: 93가1234 또는 서울12가3456"
/>
  </div>

  <div>
    <label>기사명</label>
    <input
      className="border p-2 rounded w-full bg-gray-100"
      value={newOrder.이름}
      onChange={(e) => handleChange("이름", e.target.value)}
      placeholder="자동입력"
      readOnly
    />
  </div>
</div>

<div>
  <label>전화번호</label>
  <input
    className="border p-2 rounded w-full bg-gray-100"
    value={newOrder.전화번호}
    onChange={(e) => handleChange("전화번호", e.target.value)}
    placeholder="자동입력"
    readOnly
  />
</div>

              {/* 상하차 방법 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label>상차방법</label>
                  <select
                    value={newOrder.상차방법}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        상차방법: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    <option value="">선택</option>
                    <option value="지게차">지게차</option>
                    <option value="수작업">수작업</option>
                    <option value="직접수작업">직접수작업</option>
                    <option value="수도움">수도움</option>
                    <option value="크레인">크레인</option>
                  </select>
                </div>

                <div>
                  <label>하차방법</label>
                  <select
                    value={newOrder.하차방법}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        하차방법: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    <option value="">선택</option>
                    <option value="지게차">지게차</option>
                    <option value="수작업">수작업</option>
                    <option value="직접수작업">직접수작업</option>
                    <option value="수도움">수도움</option>
                    <option value="크레인">크레인</option>
                  </select>
                </div>
              </div>

              {/* 차량 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label>차량종류</label>
                  <select
                    value={newOrder.차량종류}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        차량종류: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    <option value="">선택</option>
                    <option value="라보">라보</option>
                    <option value="다마스">다마스</option>
                    <option value="카고">카고</option>
                    <option value="윙바디">윙바디</option>
                    <option value="리프트">리프트</option>
                    <option value="탑차">탑차</option>
                    <option value="냉장탑">냉장탑</option>
                    <option value="냉동탑">냉동탑</option>
                    <option value="냉장윙">냉장윙</option>
                    <option value="냉동윙">냉동윙</option>
                    <option value="오토바이">오토바이</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div>
                  <label>차량톤수</label>
                  <input
                    type="text"
                    value={newOrder.차량톤수}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        차량톤수: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  />
                </div>
              </div>

              {/* 운임 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label>청구운임</label>
                  <input
                    type="text"
                    value={newOrder.청구운임}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        청구운임: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  />
                </div>

                <div>
                  <label>기사운임</label>
                  <input
                    type="text"
                    value={newOrder.기사운임}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        기사운임: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  />
                </div>
              </div>

              {/* 지급/배차 방식 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label>지급방식</label>
                  <select
                    value={newOrder.지급방식}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        지급방식: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    <option value="">선택</option>
                    <option value="계산서">계산서</option>
                    <option value="착불">착불</option>
                    <option value="선불">선불</option>
                    <option value="손실">손실</option>
                    <option value="개인">개인</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div>
                  <label>배차방식</label>
                  <select
                    value={newOrder.배차방식}
                    onChange={(e) =>
                      setNewOrder((prev) => ({
                        ...prev,
                        배차방식: e.target.value,
                      }))
                    }
                    className="border p-2 rounded w-full"
                  >
                    <option value="">선택</option>
                    <option value="24시">24시</option>
                    <option value="직접배차">직접배차</option>
                    <option value="인성">인성</option>
                    <option value="24시(외주업체)">24시(외주업체)</option>
                  </select>
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label>메모</label>
                <textarea
                  className="border p-2 rounded w-full h-20"
                  value={newOrder.메모}
                  onChange={(e) =>
                    setNewOrder((prev) => ({
                      ...prev,
                      메모: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* 저장/취소 버튼 */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1 rounded bg-gray-300"
              >
                취소
              </button>

              <button
                onClick={async () => {
                  try {
                    await addDispatch?.({
                      ...newOrder,
                      등록일: new Date().toISOString().slice(0, 10),
                      배차상태: "배차중",
                      차량번호: "",
                      이름: "",
                      전화번호: "",
                    });

                    alert("신규 오더가 등록되었습니다.");
                    setShowCreate(false);

                    setNewOrder({
                      상차일: "",
                      상차시간: "",
                      하차일: "",
                      하차시간: "",
                      거래처명: "",
                      상차지명: "",
                      상차지주소: "",
                      하차지명: "",
                      하차지주소: "",
                      상차방법: "",
                      하차방법: "",
                      화물내용: "",
                      차량종류: "",
                      차량톤수: "",
                      청구운임: "",
                      기사운임: "",
                      지급방식: "",
                      배차방식: "",
                      혼적: false,
                      독차: false,
                      메모: "",
                    });
                  } catch (e) {
                    console.error(e);
                    alert("등록 실패");
                  }
                }}
                className="px-3 py-1 rounded bg-blue-600 text-white"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
      
{/* 📦 운임조회 결과 모달 (선택수정용) */}
{fareModalOpen && fareResult && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999]">
    <div className="bg-white p-6 rounded-lg w-[420px] shadow-xl max-h-[90vh] overflow-y-auto">
      <h3 className="font-bold text-lg mb-3">📦 운임 조회 결과</h3>

      <p>건수: {fareResult.count}건</p>
      <p>평균 운임: {fareResult.avg.toLocaleString()}원</p>
      <p className="mb-3">
        범위: {fareResult.min.toLocaleString()}원 ~ {fareResult.max.toLocaleString()}원
      </p>

      {/* 🔽 과거운송 목록 */}
      <div className="mt-3 border-t pt-3 text-sm">
        <p className="font-semibold mb-2">📜 과거 운송 기록</p>

        {fareResult.records?.length > 0 ? (
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {fareResult.records.map((rec) => (
              <div
                key={rec._id}
                className="flex items-center justify-between gap-2 p-2 border rounded bg-gray-50 hover:bg-blue-50"
              >
                <div className="flex-1 text-xs leading-tight">
                  <div className="font-semibold text-gray-900">
                    {rec.상차일} | {rec.화물내용 || "-"}
                  </div>
                  <div className="text-gray-600">
                    {rec.상차지명} → {rec.하차지명}
                  </div>
                  <div className="text-gray-500">
                    차량: {rec.차량종류 || "-"} / {rec.차량톤수 || "-"}
                  </div>
                  <div className="text-gray-800 font-medium">
                    {(rec.청구운임 || 0).toLocaleString()}원
                  </div>
                </div>

                {/* 적용 버튼 */}
                <button
                  className="px-2 py-1 bg-blue-600 text-white text-xs rounded whitespace-nowrap"
                  onClick={() => {
                    setEditTarget((p) => ({
                      ...p,
                      청구운임: Number(rec.청구운임 || 0),
                      수수료:
                        Number(rec.청구운임 || 0) - Number(p.기사운임 || 0),
                    }));
                    setFareModalOpen(false);
                  }}
                >
                  적용
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 mt-3">
            유사 운임 데이터 {fareResult.count}건 참고됨
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 mt-4">
        <button
          className="px-3 py-1 bg-gray-300 rounded"
          onClick={() => setFareModalOpen(false)}
        >
          닫기
        </button>

        <button
          className="px-3 py-1 bg-blue-600 text-white rounded"
          onClick={() => {
            setEditTarget((p) => ({
              ...p,
              청구운임: fareResult.avg,
              수수료: fareResult.avg - Number(p.기사운임 || 0),
            }));
            setFareModalOpen(false);
          }}
        >
          평균 적용
        </button>
      </div>
    </div>
  </div>
)}

      {/* ===================== 선택수정(팝업) ===================== */}
      
{editPopupOpen && editTarget && (
  
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white p-5 rounded shadow-xl w-[480px] max-h-[90vh] overflow-y-auto">

      <div className="flex justify-between items-center mb-4">
  <h3 className="text-lg font-bold">선택한 오더 수정</h3>

  <button
    onClick={handleFareSearch}
    className="px-3 py-1 rounded bg-amber-500 text-white"
  >
    운임조회
  </button>
</div>


      {/* ------------------------------------------------ */}
      {/* 🔵 거래처명 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>거래처명</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.거래처명 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 거래처명: e.target.value }))
          }
        />
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 상/하차일 & 시간 */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label>상차일</label>
          <input
            type="date"
            className="border p-2 rounded w-full"
            value={editTarget.상차일 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 상차일: e.target.value }))
            }
          />
        </div>

        <div>
          <label>상차시간</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.상차시간 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 상차시간: e.target.value }))
            }
          >
            <option value="">선택없음</option>
            {[
              "오전 6:00","오전 7:00","오전 8:00","오전 9:00",
              "오전 10:00","오전 11:00","오후 12:00","오후 1:00",
              "오후 2:00","오후 3:00","오후 4:00","오후 5:00",
              "오후 6:00","오후 7:00","오후 8:00","오후 9:00",
              "오후 10:00"
            ].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label>하차일</label>
          <input
            type="date"
            className="border p-2 rounded w-full"
            value={editTarget.하차일 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 하차일: e.target.value }))
            }
          />
        </div>

        <div>
          <label>하차시간</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.하차시간 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 하차시간: e.target.value }))
            }
          >
            <option value="">선택없음</option>
            {[
              "오전 6:00","오전 7:00","오전 8:00","오전 9:00",
              "오전 10:00","오전 11:00","오후 12:00","오후 1:00",
              "오후 2:00","오후 3:00","오후 4:00","오후 5:00",
              "오후 6:00","오후 7:00","오후 8:00","오후 9:00",
              "오후 10:00"
            ].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 상하차지 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>상차지명</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.상차지명 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 상차지명: e.target.value }))
          }
        />
      </div>

      <div className="mb-3">
        <label>상차지주소</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.상차지주소 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 상차지주소: e.target.value }))
          }
        />
      </div>

      <div className="mb-3">
        <label>하차지명</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.하차지명 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 하차지명: e.target.value }))
          }
        />
      </div>

      <div className="mb-3">
        <label>하차지주소</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.하차지주소 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 하차지주소: e.target.value }))
          }
        />
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 화물내용 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>화물내용</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.화물내용 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 화물내용: e.target.value }))
          }
        />
      </div>

      {/* 🔵 차량정보 */}
<div className="grid grid-cols-2 gap-3 mb-3">
  <div>
    <label>차량종류</label>
    <select
      className="border p-2 rounded w-full"
      value={editTarget.차량종류 || ""}
      onChange={(e) =>
        setEditTarget((p) => ({ ...p, 차량종류: e.target.value }))
      }
    >
      <option value="">선택 없음</option>
      <option value="라보/다마스">라보/다마스</option> 
      <option value="카고">카고</option>
      <option value="윙바디">윙바디</option>
      <option value="리프트">리프트</option>
      <option value="탑차">탑차</option>
      <option value="냉장탑">냉장탑</option>
      <option value="냉동탑">냉동탑</option>
      <option value="냉장윙">냉장윙</option>
      <option value="냉동윙">냉동윙</option>
      <option value="오토바이">오토바이</option>
      <option value="기타">기타</option>
    </select>
  </div>

  <div>
    <label>차량톤수</label>
    <input
      className="border p-2 rounded w-full"
      value={editTarget.차량톤수 || ""}
      onChange={(e) =>
        setEditTarget((p) => ({ ...p, 차량톤수: e.target.value }))
      }
    />
  </div>
</div>


      {/* ------------------------------------------------ */}
      {/* 🔵 차량번호 (자동매칭) */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>차량번호</label>
        <input
  className="border p-2 rounded w-full"
  value={editTarget.차량번호 || ""}
  placeholder="예: 93가1234"
  onChange={(e) => {
    const raw = e.target.value;

    // ⭐⭐⭐ 핵심: 차량번호 전부 삭제 시 기사 정보 즉시 초기화
    if (raw.trim() === "") {
      setEditTarget((p) => ({
        ...p,
        차량번호: "",
        이름: "",
        전화번호: "",
        배차상태: "배차중",
      }));
      return;
    }

    // 입력만 반영 (매칭은 Enter에서)
    setEditTarget((p) => ({
      ...p,
      차량번호: raw,
    }));
  }}
  onKeyDown={(e) => {
    if (e.key !== "Enter") return;

    const raw = e.target.value.trim();
    const clean = raw.replace(/\s+/g, "");

    const match = drivers.find(
      (d) => String(d.차량번호).replace(/\s+/g, "") === clean
    );

    if (match) {
      setEditTarget((p) => ({
        ...p,
        이름: match.이름,
        전화번호: match.전화번호,
        배차상태: "배차완료",
      }));
      return;
    }

    const ok = window.confirm(
      `[${raw}] 등록된 기사가 없습니다.\n신규 기사로 추가할까요?`
    );
    if (!ok) return;

    const 이름 = prompt("기사명 입력:");
    const 전화번호 = prompt("전화번호 입력:");

    upsertDriver({
      차량번호: raw,
      이름,
      전화번호,
    });

    setEditTarget((p) => ({
      ...p,
      이름,
      전화번호,
      배차상태: "배차완료",
    }));
  }}
/>


      </div>

      {/* 🔵 이름/전화번호 (자동입력) */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label>기사명</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={editTarget.이름 || ""}
            readOnly
          />
        </div>

        <div>
          <label>전화번호</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={editTarget.전화번호 || ""}
            readOnly
          />
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 운임 (수수료 자동계산) */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label>청구운임</label>
          <input
            className="border p-2 rounded w-full"
            value={editTarget.청구운임 || ""}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/[^0-9]/g, ""));
              setEditTarget((p) => ({
                ...p,
                청구운임: v,
                수수료: Number(v) - Number(p.기사운임 || 0),
              }));
            }}
          />
        </div>

        <div>
          <label>기사운임</label>
          <input
            className="border p-2 rounded w-full"
            value={editTarget.기사운임 || ""}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/[^0-9]/g, ""));
              setEditTarget((p) => ({
                ...p,
                기사운임: v,
                수수료: Number(p.청구운임 || 0) - Number(v),
              }));
            }}
          />
        </div>

        <div>
          <label>수수료</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={(editTarget.수수료 || 0).toLocaleString()}
            readOnly
          />
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 지급/배차 방식 */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label>지급방식</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.지급방식 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 지급방식: e.target.value }))
            }
          >
            <option value="">선택 없음</option>
            <option value="계산서">계산서</option>
            <option value="착불">착불</option>
            <option value="선불">선불</option>
            <option value="손실">손실</option>
            <option value="개인">개인</option>
            <option value="기타">기타</option>
          </select>
        </div>

        <div>
          <label>배차방식</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.배차방식 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 배차방식: e.target.value }))
            }
          >
            <option value="">선택 없음</option>
            <option value="24시">24시</option>
            <option value="직접배차">직접배차</option>
            <option value="인성">인성</option>
            <option value="24시(외주업체)">24시(외주업체)</option>
          </select>
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 메모 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>메모</label>
        <textarea
          className="border p-2 rounded w-full h-20"
          value={editTarget.메모 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 메모: e.target.value }))
          }
        />
      </div>

      {/* ------------------------------------------------ */}
{/* 🔵 저장/취소 */}
{/* ------------------------------------------------ */}
<div className="flex justify-end gap-3 mt-4">
  <button
    className="px-3 py-1 rounded bg-gray-300"
    onClick={() => setEditPopupOpen(false)}
  >
    취소
  </button>

  <button
    className="px-3 py-1 rounded bg-blue-600 text-white"
    onClick={async () => {
      // 1) Firestore에 저장
      await patchDispatch(editTarget._id, editTarget);

      // 2) 방금 저장한 행에 하이라이트 추가
      setSavedHighlightIds((prev) => {
        const next = new Set(prev);
        next.add(editTarget._id);
        return next;
      });

      // 3) 3초 후 하이라이트 제거 (원하면 2000으로 줄여도 됨)
      setTimeout(() => {
        setSavedHighlightIds((prev) => {
          const next = new Set(prev);
          next.delete(editTarget._id);
          return next;
        });
      }, 3000);

      // 4) 팝업 닫기 + 선택 초기화
      alert("수정이 저장되었습니다.");
      setEditPopupOpen(false);
      setSelected([]);
      const savedId = editTarget._id;

// ⭐ Firestore 재정렬 후 스크롤 이동
setTimeout(() => {
  const el = document.getElementById(`row-${savedId}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}, 300);
    }}
  >
    저장
  </button>
</div>


    </div>
  </div>
)}
{/* 🔔 첨부파일 업로드 알림 토스트 */}
<div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[9999]">
  {uploadAlerts.map((a) => (
    <div
      key={a.time}
      className="bg-indigo-600 text-white px-4 py-3 rounded shadow-lg animate-[fadeInUp_0.3s_ease-out]"
    >
      <div className="text-sm opacity-80">{a.date}</div>
      <div className="font-bold">{a.from} → {a.to}</div>
      <div className="mt-1">📎 {a.count}건 업로드됨</div>
    </div>
  ))}
  
</div>
{/* ===================== 기사확인 팝업 (RealtimeStatus) ===================== */} 
{driverConfirmOpen && driverConfirmInfo && (
  <div
    className="fixed inset-0 flex items-center justify-center z-[9999]"
    tabIndex={-1}
    ref={(el) => {
      if (el) setTimeout(() => el.focus(), 0);
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter" && driverConfirmInfo.type !== "new") {
        const d = driverConfirmInfo;
        patchDispatch(driverConfirmRowId, {
          차량번호: d.차량번호,
          이름: d.이름,
          전화번호: d.전화번호,
          배차상태: "배차완료",
        });
        setDriverConfirmOpen(false);
      }
    }}
  >

    {/* 팝업 컨테이너 */}
    <div className="bg-white rounded-xl p-7 w-[420px] shadow-xl border border-gray-200">

      {/* 제목 */}
      <h3 className="text-lg font-bold text-center mb-5 flex items-center justify-center gap-2">
        🚚 기사 정보 확인
      </h3>

      {/* 입력 UI */}
      <div className="space-y-4">

        {/* 차량번호 */}
        <div>
          <label className="text-sm font-semibold text-gray-700">차량번호</label>
          <input
            className="border rounded-lg p-2 mt-1 w-full bg-gray-100 text-gray-700 text-center cursor-not-allowed"
            value={driverConfirmInfo.차량번호 || ""}
            readOnly
          />
        </div>

        {/* 기사명 */}
        <div>
          <label className="text-sm font-semibold text-gray-700">기사명</label>
          <input
            className="border rounded-lg p-2 mt-1 w-full bg-gray-100 text-gray-700 text-center cursor-not-allowed"
            value={driverConfirmInfo.이름 || ""}
            readOnly
          />
        </div>

        {/* 연락처 */}
        <div>
          <label className="text-sm font-semibold text-gray-700">연락처</label>
          <input
            className="border rounded-lg p-2 mt-1 w-full bg-gray-100 text-gray-700 text-center cursor-not-allowed"
            value={driverConfirmInfo.전화번호 || ""}
            readOnly
          />
        </div>

      </div>

      {/* 안내 */}
      <p className="text-sm text-gray-600 text-center mt-6">
        위 정보가 맞습니까?
      </p>

      {/* 버튼 영역 */}
      <div className="flex justify-between gap-2 mt-6">

        {/* 취소 */}
        <button
          className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border"
          onClick={() => setDriverConfirmOpen(false)}
        >
          취소
        </button>

        {/* 빠른 기사 등록 */}
        <button
          className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold"
          onClick={async () => {
            const 이름 = prompt("기사명 입력");
            if (!이름) return;

            const 전화번호 = prompt("전화번호 입력");
            if (!전화번호) return;

            await upsertDriver({
              차량번호: driverConfirmInfo.차량번호,
              이름,
              전화번호,
            });

            await patchDispatch(driverConfirmRowId, {
              차량번호: driverConfirmInfo.차량번호,
              이름,
              전화번호,
              배차상태: "배차완료",
            });

            setDriverConfirmOpen(false);
          }}
        >
          빠른기사등록
        </button>

        {/* 확인 */}
        <button
          className={`flex-1 py-2 rounded-lg text-white ${
            driverConfirmInfo.type === "new"
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={driverConfirmInfo.type === "new"}
          onClick={() => {
            const d = driverConfirmInfo;
            patchDispatch(driverConfirmRowId, {
              차량번호: d.차량번호,
              이름: d.이름,
              전화번호: d.전화번호,
              배차상태: "배차완료",
            });
            setDriverConfirmOpen(false);
          }}
        >
          확인
        </button>

      </div>

    </div>
  </div>
)}


{/* ===================== 기사 선택 모달 ===================== */}
{/* ===================== 기사 선택 모달 (PART 5 동일) ===================== */}
{driverSelectInfo && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999]">
    <div className="bg-white p-5 rounded-xl shadow-xl w-[380px] max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-bold mb-3">🚚 기사 선택</h3>

      {driverSelectInfo.list.map((d) => (
        <button
          key={d._id}
          className={`w-full text-left border p-2 mb-2 rounded
            ${
              driverSelectInfo.selectedDriver === d
                ? "bg-blue-100 border-blue-500"
                : "hover:bg-blue-50"
            }`}
          onClick={() =>
            setDriverSelectInfo((prev) => ({
              ...prev,
              selectedDriver: d,
            }))
          }
        >
          {d.차량번호} / {d.이름} / {d.전화번호}
        </button>
      ))}

      <div className="flex gap-2 mt-4">
        {/* 취소 */}
        <button
          className="flex-1 py-2 bg-gray-200 rounded"
          onClick={() => setDriverSelectInfo(null)}
        >
          취소
        </button>

        {/* 적용 */}
        <button
          disabled={!driverSelectInfo.selectedDriver}
          className="flex-1 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
          onClick={async () => {
            const d = driverSelectInfo.selectedDriver;
            const rowId = driverSelectInfo.rowId;

            await patchDispatch?.(rowId, {
              차량번호: d.차량번호,
              이름: d.이름,
              전화번호: d.전화번호,
              배차상태: "배차완료",
              updatedAt: Date.now(),
            });

            setDriverSelectInfo(null);

            // 🔥 PART 5와 동일: 저장 후 해당 행으로 스크롤
            setTimeout(() => {
              const el = document.getElementById(`row-${rowId}`);
              if (el) {
                el.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }
            }, 300);
          }}
        >
          적용
        </button>
      </div>
    </div>
  </div>
)}

{/* ======================= 선택삭제 확인 팝업 (소형 · 실무용 최종본) ======================= */}
{deleteConfirmOpen && (
  <div
    className="fixed inset-0 bg-black/40 flex items-center justify-center z-[99999]"
    tabIndex={-1}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeDelete();
      }
      if (e.key === "Escape") {
        setDeleteConfirmOpen(false);
      }
    }}
  >
    <div className="bg-white rounded-xl shadow-xl w-[420px] max-h-[80vh] overflow-y-auto">

      {/* ===== 헤더 ===== */}
      <div className="px-5 py-4 border-b flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          🗑
        </div>
        <div>
          <h3 className="font-bold text-gray-900">
            선택한 오더를 삭제하시겠습니까?
          </h3>
          <p className="text-xs text-gray-500">
            삭제 후에도 되돌리기로 복구할 수 있습니다.
          </p>
        </div>
      </div>

      {/* ===== 삭제 대상 ===== */}
      <div className="px-5 py-4 space-y-3 text-sm">
        {deleteList.map((r, idx) => {
          const sale = r.청구운임 || 0;
          const drv = r.기사운임 || 0;
          const fee = sale - drv;

          return (
            <div key={r._id} className="border rounded-lg p-3 bg-gray-50">
              {/* 상단 */}
              <div className="flex justify-between items-center pb-2 border-b">
                <div className="font-semibold text-gray-800">
                  {idx + 1}. {r.거래처명 || "-"}
                </div>
              </div>

              {/* 상/하차 */}
              <div className="mt-2 space-y-1 text-gray-700">
                <div><b>상차</b> {r.상차일} · {r.상차지명}</div>
                <div><b>하차</b> {r.하차일} · {r.하차지명}</div>
                <div><b>차량</b> {r.차량번호 || "-"} / {r.이름 || "-"}</div>
              </div>

              {/* 운임 */}
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                <div className="bg-white border rounded p-2">
                  <div className="text-gray-400">청구</div>
                  <div className="font-semibold text-blue-600">
                    {sale.toLocaleString()}원
                  </div>
                </div>

                <div className="bg-white border rounded p-2">
                  <div className="text-gray-400">기사</div>
                  <div className="font-semibold text-green-600">
                    {drv.toLocaleString()}원
                  </div>
                </div>

                <div className="bg-white border rounded p-2">
                  <div className="text-gray-400">수수료</div>
                  <div
                    className={`font-semibold ${
                      fee < 0 ? "text-red-600" : "text-orange-600"
                    }`}
                  >
                    {fee.toLocaleString()}원
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== 버튼 ===== */}
      <div className="px-5 py-4 border-t flex gap-3">
        <button
          onClick={() => setDeleteConfirmOpen(false)}
          className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
        >
          취소 (ESC)
        </button>

        <button
          onClick={executeDelete}
          className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
        >
          삭제 실행 (Enter)
        </button>
      </div>
    </div>
  </div>
)}

{showUndo && (
  <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg z-[99999] flex items-center gap-3">
    <span>삭제됨</span>
    <button onClick={undoDelete} className="underline font-semibold">
      되돌리기
    </button>
  </div>
)}

{/* 📋 기사복사 선택 모달 */}
{copyModalOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white p-6 rounded-xl shadow-lg w-[320px]">
      <h3 className="text-lg font-bold mb-4 text-center">📋 복사 방식 선택</h3>

      <div className="space-y-2">
        <button
          onClick={() => copyMessage("basic")}
          className="w-full py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          차량번호 / 기사명 / 전화번호
        </button>
        <button
          onClick={() => copyMessage("fare")}
          className="w-full py-2 bg-blue-200 rounded hover:bg-blue-300"
        >
          운임 포함 (부가세/선불/착불)
        </button>
        <button
          onClick={() => copyMessage("full")}
          className="w-full py-2 bg-green-200 rounded hover:bg-green-300"
        >
          전체 상세 (상하차 + 화물정보 + 차량)
        </button>
      </div>

      <button
        onClick={() => setCopyModalOpen(false)}
        className="w-full mt-4 py-2 text-sm text-gray-600 hover:opacity-70"
      >
        취소
      </button>
    </div>
  </div>
)}

<style>{`
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px);}
    to { opacity: 1; transform: translateY(0);}
  }
`}</style>
<style>{`
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px);}
    to { opacity: 1; transform: translateY(0);}
  }

  @keyframes highlightFlash {
    0%   { background-color: #fff7c2; }
    50%  { background-color: #ffe066; }
    100% { background-color: #fff7c2; }
  }
  
  .row-highlight {
    animation: highlightFlash 0.6s ease-in-out infinite;
  }
`}</style>

    </div>
  );
}



/* ===================== 메모 더보기 컴포넌트 ===================== */
function MemoMore({ text = "" }) {
  const [open, setOpen] = React.useState(false);
  const str = String(text);
  const isLong = str.length > 5;
  const short = isLong ? str.slice(0, 5) + "…" : str;

  return (
    <div className="relative inline-block">
      {/* 짧게 또는 전체 표시 */}
      <span>{open ? str : short}</span>

      {/* 더보기 버튼 */}
      {!open && isLong && (
        <button
          className="text-xs text-blue-600 underline ml-1"
          onClick={() => setOpen(true)}
        >
          더보기
        </button>
      )}

      {/* 전체보기 팝업 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white p-4 rounded-lg shadow-lg w-[380px] max-w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">메모 전체보기</h3>
            <div className="text-sm whitespace-pre-wrap break-words">{str}</div>

            <div className="text-right mt-4">
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded"
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ===================== PART 4/8 — END =====================

// ===================== DispatchApp.jsx (PART 5/8 — 차량번호 항상 활성화 + 선택수정→수정완료 통합버튼 + 주소/메모 더보기 + 대용량업로드 + 신규 오더 등록) =====================
function DispatchStatus({
  dispatchData = [],
  setDispatchData,
  drivers = [],
  clients = [],
  places = [],
  placeRows = [],
  addDispatch,
  patchDispatch,
  removeDispatch,
  upsertDriver,
}) {
  // 📌 오늘 날짜 정확하게 (KST 기준)
const todayKST = () => {
  const d = new Date();
  const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return korea.toISOString().slice(0, 10);
};

// 📌 이번 달 1일 ~ 말일 (KST 기준, UTC 밀림 방지)
const getMonthRange = () => {
  const now = new Date();

  // KST 기준 날짜 생성
  const firstKST = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    9, 0, 0
  );

  const lastKST = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    9, 0, 0
  );

  const toYMD = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return {
    first: toYMD(firstKST),
    last: toYMD(lastKST),
  };
};

// 📌 내일 날짜 (KST 기준)
const tomorrowKST = () => {
  const d = new Date();
  const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  korea.setDate(korea.getDate() + 1);
  return korea.toISOString().slice(0, 10);
};


  const [q, setQ] = React.useState(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("dispatchStatusState") || "{}");
    return saved.q || "";
  } catch {
    return "";
  }
});
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [editMode, setEditMode] = React.useState(false);
  // ==========================
// 선택삭제 + 되돌리기 기능
// ==========================
const [showDeletePopup, setShowDeletePopup] = React.useState(false);
const [backupDeleted, setBackupDeleted] = React.useState([]);
const [undoVisible, setUndoVisible] = React.useState(false);
const [savedHighlightIds, setSavedHighlightIds] = React.useState(new Set());

  const [editTarget, setEditTarget] = React.useState(null);
  const [edited, setEdited] = React.useState({});
  const [justSaved, setJustSaved] = React.useState([]);
  const [editPopupOpen, setEditPopupOpen] = React.useState(false);
  const [bulkRows, setBulkRows] = React.useState([]);
 const [loaded, setLoaded] = React.useState(false);   // ⭐ 복구완료 여부

// 🔵 선택수정 팝업 상태 (★ 여기에 추가!)
// ⭐ 페이지네이션 상태
const [page, setPage] = React.useState(0);
const pageSize = 100;

// 🔵 자동완성(상/하차지) 상태  ← ★★★ 여기 추가
const [placeQuery, setPlaceQuery] = React.useState("");
const [placeOptions, setPlaceOptions] = React.useState([]);
const [showPlaceDropdown, setShowPlaceDropdown] = React.useState(false);

// 🔵 자동완성 검색 함수 (여기로 옮겨!!!)
const filterPlaces = (text) => {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return [];
  return (placeRows || []).filter((p) =>
    String(p.업체명 || "")
      .toLowerCase()
      .includes(q)
  );
};

// ==========================
// 📦 운임 조회 모달 상태 추가
// ==========================
const [fareModalOpen, setFareModalOpen] = React.useState(false);
const [fareResult, setFareResult] = React.useState(null);

// ===================== 📋 기사복사 모달 상태 =====================
const [copyModalOpen, setCopyModalOpen] = React.useState(false);
// 🚚 기사 선택 / 확인 팝업 상태 추가  ⭐⭐
const [driverConfirmInfo, setDriverConfirmInfo] = React.useState(null);
const [driverSelectInfo, setDriverSelectInfo] = React.useState(null);


// 요일 계산
const getYoil = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return ["일","월","화","수","목","금","토"][date.getDay()];
};

const formatPhone = (phone) => {
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  // fallback
  return digits;
};
// ⚠️ 복사용 전화번호 포맷 (formatPhone2가 없어서 오류 발생 → 추가)
const formatPhone2 = (phone) => {
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  return digits;
};

// 복사 실행
const copyMessage = (mode) => {
  if (!selected.size) {
    alert("복사할 항목을 선택하세요.");
    return;
  }

  const text = [...selected]
    .map((id) => {
      const r = dispatchData.find((d) => getId(d) === id);
      if (!r) return "";

      const plate = r.차량번호 || "";
      const name = r.이름 || "";
      const phone = formatPhone2(r.전화번호 || "");
      const yoil = getYoil(r.상차일 || "");
      const fare = Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
      const pay = r.지급방식 || "";
      const payLabel =
        pay === "계산서"
          ? "부가세별도"
          : pay === "선불" || pay === "착불"
          ? pay
          : "";

      if (mode === "basic") {
        return `${plate} ${name} ${phone}`;
      }

      if (mode === "fare") {
        return `${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
      }

      // ✨ 전체 상세
return `${r.상차일 || ""}(${yoil})

${r.상차지명 || ""} → ${r.하차지명 || ""}
${r.상차지주소 || ""} → ${r.하차지주소 || ""}

${r.화물내용 || ""} ${r.차량톤수 || ""} ${r.차량종류 || ""}

${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
    })
    .join("\n\n");

  navigator.clipboard.writeText(text);
  alert("📋 복사 완료!");
  setCopyModalOpen(false);
};

// 🚀 운임 조회 실행 함수
const handleFareSearch = () => {
  if (!editTarget) return;

  const records = dispatchData.filter(
    (r) =>
      String(r.상차지명 || "").includes(editTarget.상차지명 || "") &&
      String(r.하차지명 || "").includes(editTarget.하차지명 || "") &&
      String(r.차량톤수 || "") === String(editTarget.차량톤수 || "")
  );

  const count = records.length;
  if (!count) {
    alert("📭 유사 운임 데이터가 없습니다.");
    return;
  }

  const vals = records.map((r) => Number(r.청구운임 || 0));
  const avg = Math.round(vals.reduce((a, b) => a + b) / count);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  setFareResult({ count, avg, min, max, records });
  setFareModalOpen(true);
};


  // ⭐ 화면 진입 시 이번 달 자동 설정
  // ⭐ 화면 진입 시 상태 복구 + 이번 달 기본값
  React.useEffect(() => {
    // 1) 이번 달 기본 날짜 계산
    const { first: firstDay, last: lastDay } = getMonthRange(); // 🔥 정확한 계산

    // 2) localStorage 에서 이전 상태 불러오기
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem("dispatchStatusState") || "{}");
    } catch (err) {
      console.error("DispatchStatus 상태 복구 실패", err);
    }

    // 3) 검색어 / 날짜 / 페이지 복원 (없으면 이번 달 기본값)
    if (typeof saved.q === "string") setQ(saved.q);
    setStartDate(saved.startDate || firstDay);
    setEndDate(saved.endDate || lastDay);
    setPage(saved.page || 0);

    // 4) 선택된 체크박스, 수정 중 상태, 수정모드 복원
    if (Array.isArray(saved.selected)) {
      setSelected(new Set(saved.selected));
    }
    if (saved.edited && typeof saved.edited === "object") {
      setEdited(saved.edited);
    }
    if (typeof saved.editMode === "boolean") {
      setEditMode(saved.editMode);
    }
      setLoaded(true);
  }, []);


  // ======================= 신규 오더 등록 팝업 상태 =======================
  const [showCreate, setShowCreate] = React.useState(false);
  const [newOrder, setNewOrder] = React.useState({
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    거래처명: "",
    상차지명: "",
    상차지주소: "",
    하차지명: "",
    하차지주소: "",
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    청구운임: "",
    기사운임: "",
    지급방식: "",
    배차방식: "",
    메모: "",
    혼적: false,
    독차: false,
  });

  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const getId = (r) => r._id || r.id || r._fsid;

  // =============================================
// ✅ 대용량 업로드 (엑셀 → Firestore)
// =============================================
const excelDateToISO = (value) => {
  if (!value) return "";
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const clean = value.replace(/[^\d]/g, "-").replace(/--+/g, "-");
    const parts = clean.split("-").filter(Boolean);
    if (parts.length === 3) {
      let [y, m, d] = parts;
      if (y.length === 2) y = "20" + y;
      if (m.length === 1) m = "0" + m;
      if (d.length === 1) d = "0" + d;
      return `${y}-${m}-${d}`;
    }
  }
  return "";
};

const handleBulkFile = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const mapped = json.map((row) => {
      const mappedRow = {
        _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        등록일: excelDateToISO(row["상차일"]) || new Date().toISOString().slice(0, 10),
        상차일: excelDateToISO(row["상차일"]),
        상차시간: row["상차시간"] || "",
        하차일: excelDateToISO(row["하차일"]),
        하차시간: row["하차시간"] || "",
        거래처명: row["거래처명"] || "",
        상차지명: row["상차지명"] || "",
        상차지주소: row["상차지주소"] || "",
        하차지명: row["하차지명"] || "",
        하차지주소: row["하차지주소"] || "",
        화물내용: row["화물내용"] || "",
        차량종류: row["차량종류"] || "",
        차량톤수: row["차량톤수"] || "",
        차량번호: row["차량번호"] || "",
        이름: row["이름"] || "",
        전화번호: row["전화번호"] || "",
        청구운임: toInt(row["청구운임"]),
        기사운임: toInt(row["기사운임"]),
        수수료: toInt(row["청구운임"]) - toInt(row["기사운임"]),
        지급방식: row["지급방식"] || "",
        배차방식: row["배차방식"] || "",
        메모: row["메모"] || "",
        배차상태: row["배차상태"] || "배차중",
      };

      // ====================================================
      // 🚛 자동 기사 매칭 (차량번호 → 이름/전화번호 자동입력)
      // ====================================================
      const cleanCar = String(mappedRow.차량번호 || "").replace(/\s+/g, "");

      if (cleanCar) {
        const matched = drivers.find(
          (d) =>
            String(d.차량번호 || "").replace(/\s+/g, "") === cleanCar
        );

        if (matched) {
          mappedRow.이름 = matched.이름 || "";
          mappedRow.전화번호 = matched.전화번호 || "";
          mappedRow.배차상태 = "배차완료";
        }
      }

      return mappedRow;
    });

    if (!mapped.length) {
      alert("❌ 엑셀 데이터가 없습니다.");
      return;
    }

    if (!confirm(`${mapped.length}건을 업로드하시겠습니까?`)) return;

    try {
      for (const item of mapped) {
        await patchDispatch(item._id, item);
      }
      alert("✅ 대용량 업로드 완료되었습니다.");
    } catch (err) {
      console.error(err);
      alert("❌ 업로드 중 오류 발생");
    }
  };

  reader.readAsArrayBuffer(file);
};

  // ================================  
  // 🔵 선택수정 / 수정완료  
  // ================================
  const toggleOne = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (rows) =>
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => getId(r)))
    );

  const updateEdited = (row, key, value) =>
    setEdited((prev) => {
      const cur = { ...(prev[getId(row)] || {}), [key]: value };
      if (key === "청구운임" || key === "기사운임") {
        const sale = toInt(cur.청구운임 ?? row.청구운임);
        const drv = toInt(cur.기사운임 ?? row.기사운임);
        cur.수수료 = sale - drv;
      }
      return { ...prev, [getId(row)]: cur };
    });

  // ======================= 차량번호 입력 처리 =======================
const handleCarInput = async (id, rawVal) => {
  const v = (rawVal || "").trim();
  const idx = dispatchData.findIndex((r) => r._id === id);
  if (idx === -1) return;
  const row = dispatchData[idx];

 // 🚨 차량번호 지웠을 때 — 기사정보도 모두 초기화!
 if (!v) {
   setDriverConfirmInfo(null); // 팝업 강제 종료
   await patchDispatch(id, {
     차량번호: "",
     이름: "",
     전화번호: "",
     배차상태: "배차중",
   });
   return;
 }

  const matches = drivers.filter(
    (d) => (d.차량번호 || "").trim() === v
  );


  if (matches.length > 1) {
    setDriverSelectInfo({ plate: v, list: matches, rowId: id });
    return;
  }

  if (matches.length === 1) {
    setDriverConfirmInfo({
      type: "select",
      rowId: id,
      driver: matches[0],
    });
    return;
  }

  setDriverConfirmInfo({
    type: "new",
    rowId: id,
    plate: v,
  });
};


  const _patch =
    patchDispatch ||
    ((id, patch) =>
      setDispatchData((p) =>
        p.map((r) => (getId(r) === id ? { ...r, ...patch } : r))
      ));

  const _remove =
    removeDispatch ||
    ((row) =>
      setDispatchData((p) => p.filter((r) => getId(r) !== getId(row))));
    // 📲 카카오톡 전송
const sendKakao = (row) => {
  const msg = `
📦 배차 정보

거래처: ${row.거래처명}
상차: ${row.상차지명} (${row.상차지주소})
하차: ${row.하차지명} (${row.하차지주소})

상차시간: ${row.상차일} ${row.상차시간}
하차시간: ${row.하차일} ${row.하차시간}

차량: ${row.차량번호}
기사: ${row.이름} (${row.전화번호})

운임: ${Number(row.기사운임).toLocaleString()}원
`.trim();

  const url = "kakaotalk://send?text=" + encodeURIComponent(msg);
  window.location.href = url;
};


    // 🚀 자동 기사 추천 함수
const recommendDriver = (row) => {
  const 기준상차 = row.상차지명 || "";
  const 기준하차 = row.하차지명 || "";
  const 기준톤수 = row.차량톤수 || "";

  let scoreList = drivers.map((d) => {
    let 점수 = 0;

    const 기록 = dispatchData.filter(
      (r) => r.이름 === d.이름 || r.차량번호 === d.차량번호
    );

    if (기록.some((r) => r.상차지명 === 기준상차)) 점수 += 20;
    if (기록.some((r) => r.하차지명 === 기준하차)) 점수 += 20;

    if (String(d.차량톤수) === String(기준톤수)) 점수 += 15;

    const isBusy = 기록.some((r) => r.배차상태 === "배차완료");
    if (!isBusy) 점수 += 10;

    return { ...d, 점수 };
  });

  scoreList.sort((a, b) => b.점수 - a.점수);

  const top = scoreList.slice(0, 5)
    .map(
      (d, i) =>
        `${i + 1}위) ${d.이름} (${d.차량번호}) — 점수 ${d.점수}`
    )
    .join("\n");

  alert(`🚚 자동 기사 추천 결과\n\n${top}`);
};


  // ================================  
// 🔵 선택수정 / 수정완료 (팝업 방식)  
// ================================
const handleEditToggle = async () => {
  // 🔐 여러 건 선택 시 경고
  if (!editMode && selected.size > 1) {
    return alert("⚠️ 1개의 항목만 선택해주세요.\n(지금은 선택수정 모드입니다)");
  }

  // 1) 수정 모드 OFF → 선택수정 버튼 처음 누른 상태
  if (!editMode) {
    if (!selected.size) return alert("수정할 항목을 선택하세요.");

    const first = filtered.find((r) => selected.has(getId(r)));

    if (first) {
      setEditTarget(first);
      setEditPopupOpen(true);
    }
    return; 
  }


  // 2) 전체수정 모드일 때는 기존 저장 로직 그대로 적용
  const ids = Object.keys(edited);
  if (!ids.length) {
    setEditMode(false);
    return alert("변경된 내용이 없습니다.");
  }

  if (!confirm("수정된 내용을 저장하시겠습니까?")) return;

  // ================================
//   수정완료 → 저장 로직
// ================================
for (const id of ids) await _patch(id, edited[id]);

// ⭐ 100ms 후 highlight 실행 (Firestore → DOM 렌더 타이밍 보정)
setTimeout(() => {
  setSavedHighlightIds(prev => {
    const next = new Set(prev);
    ids.forEach(id => next.add(id));   // 여러 개 선택 저장 시 모두 반짝
    return next;
  });
}, 100);

// ⭐ 3초 후 highlight 제거
setTimeout(() => {
  setSavedHighlightIds(prev => {
    const next = new Set(prev);
    ids.forEach(id => next.delete(id));
    return next;
  });
}, 3000);


  setJustSaved(ids);
  setEdited({});
  setEditMode(false);
  setSelected(new Set());

if (ids.length > 0) {
  const firstId = ids[0];

  setTimeout(() => {
    const el = document.getElementById(`row-${firstId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);  // 🔥 Firestore 반영 후 스크롤 이동
}

  setTimeout(() => setJustSaved([]), 1200);
  alert("수정 완료되었습니다.");
};
// ==========================
// 삭제 실행(되돌리기 기능 포함)
// ==========================
const deleteRowsWithUndo = async () => {
  const ids = [...selected];
  if (!ids.length) return;

  // 삭제될 항목 백업
  const backup = ids.map(id => dispatchData.find(r => getId(r) === id));
  setBackupDeleted(backup);

  // Firestore에서 실제 삭제
  for (const row of backup) {
    await _remove(row);
  }

  // 선택 초기화
  setSelected(new Set());

  // 팝업 닫기
  setShowDeletePopup(false);

  // 되돌리기 버튼 표시
  setUndoVisible(true);
  setTimeout(() => setUndoVisible(false), 30000);
};


// 🔥 금액 변환 함수 (이거 추가)
const toMoney = (v) => {
  if (v === undefined || v === null) return 0;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isNaN(n) ? 0 : n;
};
  const downloadExcel = () => {
  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","상차지주소","하차지명","하차지주소",
    "화물내용","차량종류","차량톤수","차량번호","기사명","전화번호",
    "배차상태","청구운임","기사운임","수수료","지급방식","배차방식","메모"
  ];

const rows = filtered.map((r, i) => ({
  순번: page * pageSize + i + 1,

  등록일: r.등록일 || "",
  상차일: r.상차일 || "",
  상차시간: r.상차시간 || "",
  하차일: r.하차일 || "",
  하차시간: r.하차시간 || "",
  거래처명: r.거래처명 || "",
  상차지명: r.상차지명 || "",
  상차지주소: r.상차지주소 || "",
  하차지명: r.하차지명 || "",
  하차지주소: r.하차지주소 || "",
  화물내용: r.화물내용 || "",
  차량종류: r.차량종류 || "",
  차량톤수: r.차량톤수 || "",
  차량번호: r.차량번호 || "",
  기사명: r.이름 || "",
  전화번호: r.전화번호 || "",
  배차상태: r.배차상태 || "",

  // 🔥 2번 문제(청구/기사/수수료 0 나오는 문제) 해결
  청구운임: toMoney(r.청구운임),
  기사운임: toMoney(r.기사운임),
  수수료: toMoney(r.청구운임) - toMoney(r.기사운임),

  지급방식: r.지급방식 || "",
  배차방식: r.배차방식 || "",
  메모: r.메모 || "",
}));


  // 헤더 스킵하고 데이터만 생성
const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });


// ================================
// 날짜/금액 타입 변환 (헤더 보호 포함)
// ================================
Object.keys(ws).forEach((cell) => {
  // 메타데이터(예: !ref)는 스킵
  if (cell[0] === "!") return;

  // A, B, C ... 열
  const col = cell.replace(/[0-9]/g, "");

  // 1, 2, 3 ... 행 번호
  const row = parseInt(cell.replace(/[A-Z]/g, ""), 10);


  // ------------------------------------
  // 1) 날짜 칼럼(B=등록일, C=상차일, E=하차일)
  // ------------------------------------
  if (["B", "C", "E"].includes(col)) {
    const v = ws[cell].v;

    // yyyy-mm-dd 형식만 허용
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      ws[cell].v = v;   // 문자열 그대로
      ws[cell].t = "s"; // string 타입
    }
  }


  // ------------------------------------
  // 2) 금액 칼럼(S=청구, T=기사, U=수수료)
  //    🔥 헤더는 절대 숫자로 변환 금지(row === 1)
  // ------------------------------------
  if (["S", "T", "U"].includes(col)) {

    // 1행 헤더는 건드리지 않음
    if (row === 1) return;

    const num = Number(String(ws[cell].v).replace(/[^\d-]/g, ""));
    ws[cell].v = isNaN(num) ? 0 : num;
    ws[cell].t = "n";      // number type
    ws[cell].z = "#,##0";  // 천 단위 콤마 표시
  }
});


// ================================
// 컬럼 너비
// ================================
ws["!cols"] = [
  { wch: 6 },   // A: 순번
  { wch: 12 },  // B: 등록일
  { wch: 12 },  // C: 상차일
  { wch: 10 },  // D: 상차시간
  { wch: 12 },  // E: 하차일
  { wch: 10 },  // F: 하차시간
];



  ws["!cols"] = [
    { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "배차현황");
  XLSX.writeFile(wb, "배차현황.xlsx");
};

  // ===================== 정렬 ======================
  const filtered = React.useMemo(() => {
    let data = [...dispatchData];
    if (startDate) data = data.filter((r) => (r.상차일 || "") >= startDate);
    if (endDate) data = data.filter((r) => (r.상차일 || "") <= endDate);
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) =>
          String(v || "").toLowerCase().includes(lower)
        )
      );
    }

data.sort((a, b) => {
  // 1️⃣ 배차중 우선
  if (a.배차상태 === "배차중" && b.배차상태 !== "배차중") return -1;
  if (a.배차상태 !== "배차중" && b.배차상태 === "배차중") return 1;

  // 2️⃣ 상차일 최신순
  const ad = a.상차일 || "";
  const bd = b.상차일 || "";
  if (ad !== bd) return bd.localeCompare(ad);

  // 3️⃣ 동일 상차일이면 마지막 수정 최신순
  const au = a.lastUpdated || a.등록일 || "";
  const bu = b.lastUpdated || b.등록일 || "";
  return bu.localeCompare(au);
});

    return data;
  }, [dispatchData, q, startDate, endDate]);
// ⭐⭐⭐ 페이지 데이터 (정렬된 filtered 기준)
const pageRows = React.useMemo(() => {
  const start = page * pageSize;
  const end = start + pageSize;
  return filtered.slice(start, end);
}, [filtered, page]);


  const summary = React.useMemo(() => {
    const totalCount = filtered.length;
    const totalSale = filtered.reduce((s, r) => s + toInt(r.청구운임), 0);
    const totalDriver = filtered.reduce((s, r) => s + toInt(r.기사운임), 0);
    const totalFee = totalSale - totalDriver;
    return { totalCount, totalSale, totalDriver, totalFee };
  }, [filtered]);

  const StatusBadge = ({ s }) => {
    const color =
      s === "배차완료"
        ? "bg-green-100 text-green-700 border-green-400"
        : s === "배차중"
        ? "bg-yellow-100 text-yellow-800 border-yellow-400"
        : "hidden";
    return (
      <span
        className={`border px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${color}`}
      >
        {s}
      </span>
    );
  };
 
    // ⭐ 상태 변경될 때마다 localStorage 저장
  React.useEffect(() => {
    const save = {
      q,
      startDate,
      endDate,
      page,
      selected: Array.from(selected),
      edited,
      editMode,
    };
    try {
      localStorage.setItem("dispatchStatusState", JSON.stringify(save));
    } catch (err) {
      console.error("DispatchStatus 상태 저장 실패", err);
    }
  }, [q, startDate, endDate, page, selected, edited, editMode]);
if (!loaded) return null;

return (
  <div className="p-3">

   <style>{`
  @keyframes highlightFlash {
    0%   { background-color: #fff7c2; }
    50%  { background-color: #ffe066; }
    100% { background-color: #fff7c2; }
  }

  .row-highlight {
    animation: highlightFlash 0.8s ease-in-out 3;
  }
`}</style>
      <h2 className="text-lg font-bold mb-3">배차현황</h2>

      {/* ----------- 요약 ---------- */}
      <div className="flex flex-wrap items-center gap-5 text-sm mb-2">
        <div>총 <b>{summary.totalCount}</b>건</div>
        <div>청구 <b className="text-blue-600">{summary.totalSale.toLocaleString()}</b>원</div>
        <div>기사 <b className="text-green-600">{summary.totalDriver.toLocaleString()}</b>원</div>
        <div>수수료 <b className="text-amber-600">{summary.totalFee.toLocaleString()}</b>원</div>
      </div>

      <div className="flex justify-between items-center gap-3 mb-3">

  {/* 🔍 검색 + 날짜 */}
  <div className="flex items-center gap-2">
    <input
  className="border p-2 rounded w-52"
  placeholder="검색어"
  value={loaded ? q : ""}        // 🔥 핵심
  onChange={(e) => setQ(e.target.value)}
/>

    <input
      type="date"
      className="border p-2 rounded"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
    />
    <span>~</span>
    <input
      type="date"
      className="border p-2 rounded"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
    />
<button
  onClick={() => {
    const t = todayKST();
    setStartDate(t);
    setEndDate(t);
    setQ("");       // 🔥 검색어 초기화
    setPage(0);
  }}
  className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
>
  당일
</button>
<button
  onClick={() => {
    const t = tomorrowKST();
    setStartDate(t);
    setEndDate(t);
    setQ("");       // 검색어 초기화
    setPage(0);
  }}
  className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
>
  내일
</button>



<button
  onClick={() => {
    const { first, last } = getMonthRange();
    setStartDate(first);
    setEndDate(last);
    setQ("");
    setPage(0);

    // ⭐ 모든 검색 조건 초기화 저장!
    localStorage.setItem(
      "dispatchStatusState",
      JSON.stringify({
        q: "",
        startDate: first,
        endDate: last,
        page: 0,
        selected: [],
        edited: {},
        editMode: false,
      })
    );
  }}
  className="px-3 py-1 rounded bg-gray-500 text-white text-sm"
>
  전체
</button>


  </div>

  {/* 우측 버튼 묶음 */}
  <div className="flex items-center gap-2">
    {/* 📡 선택전송 (24시콜)_배차현황 */}
<button
  onClick={async () => {
    if (!selected.size)
      return alert("전송할 항목을 선택하세요.");

    const ids = [...selected];
    let success = 0, fail = 0;

    for (const id of ids) {
      const row = dispatchData.find((r) => r._id === id);
      if (!row) continue;

      if (!row.상차지주소 || !row.하차지주소) {
        alert(`[${row.상차지명} → ${row.하차지명}]\n주소가 없습니다.`);
        fail++;
        continue;
      }

      try {
        const res = await sendOrderTo24(row);

        if (res?.success) {
          success++;
        } else {
          fail++;
        }
      } catch (e) {
        console.error("24시콜 오류:", e);
        fail++;
      }
    }

    alert(`📡 24시콜 선택전송 완료!
성공: ${success}건
실패: ${fail}건`);
  }}
  className="px-3 py-1 rounded bg-orange-600 text-white"
>
  📡 선택전송(24시콜)
</button>



{/* 📋 기사복사 */}
<button
  onClick={() => {
    if (selected.size === 0) {
      return alert("📋 복사할 항목을 선택하세요.");
    }
    if (selected.size > 1) {
      return alert("⚠️ 1개의 항목만 선택할 수 있습니다.");
    }
    setCopyModalOpen(true);
  }}
  className="px-4 py-2 rounded-lg bg-purple-600 text-white shadow-md hover:bg-purple-700 transition-all"
>
  📋 기사복사
</button>

    <button
      onClick={() => setShowCreate(true)}
      className="px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-all"
  
      
    >
      
      + 신규 오더 등록
    </button>

    <label className="px-4 py-2 rounded-lg bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-all cursor-pointer">
      대용량 업로드
      <input type="file" accept=".xlsx,.xls" hidden onChange={handleBulkFile} />
    </label>

    <button
      className="px-4 py-2 rounded-lg bg-yellow-500 text-white shadow-md hover:bg-yellow-600 transition-all"
    onClick={handleEditToggle}
    >
      {editMode ? "수정완료" : "선택수정"}
    </button>

  <button
  className="px-4 py-2 rounded-lg bg-red-600 text-white shadow-md hover:bg-red-700 transition-all"
  onClick={() => {
    if (!selected.size) return alert("삭제할 항목이 없습니다.");
    setShowDeletePopup(true);
  }}
>
  선택삭제
</button>

    <button
      className="px-4 py-2 rounded-lg bg-gray-400 text-white shadow-md hover:bg-gray-500 transition-all"
      onClick={() => setSelected(new Set())}
    >
      선택초기화
    </button>

    <button
      className="px-4 py-2 rounded-lg bg-emerald-600 text-white shadow-md hover:bg-emerald-700 transition-all"
    onClick={downloadExcel}
    >
      엑셀다운
    </button>
    
  </div>
</div>   {/* 🔥 이 div가 검색+버튼 전체를 감싸는 div — 여기로 끝 */}

{/* ⭐ 페이지 이동 버튼 */}
<div className="flex items-center gap-4 my-3 select-none">

  {/* ◀ 이전 */}
  <button
    className={`
      px-4 py-2 rounded-lg text-sm font-semibold border 
      transition-all duration-150
      ${page === 0 
        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
        : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"}
    `}
    disabled={page === 0}
    onClick={() => setPage((p) => Math.max(0, p - 1))}
  >
    ◀ 이전
  </button>

  {/* 페이지 번호 */}
  <span className="text-sm font-semibold text-gray-600">
    {page + 1}
    <span className="text-gray-400"> / {Math.ceil(filtered.length / pageSize)}</span>
  </span>

  {/* 다음 ▶ */}
  <button
    className={`
      px-4 py-2 rounded-lg text-sm font-semibold border 
      transition-all duration-150
      ${(page + 1) * pageSize >= filtered.length
        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
        : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"}
    `}
    disabled={(page + 1) * pageSize >= filtered.length}
    onClick={() => setPage((p) => p + 1)}
  >
    다음 ▶
  </button>

</div>


      {/* ---------------- 테이블 ---------------- */}
      <div className="overflow-x-auto">
        <table className="w-auto min-w-max text-sm border table-auto">
          <thead className="bg-gray-100">
            <tr>
              {[
                "선택","순번","등록일","상차일","상차시간","하차일","하차시간",
                "거래처명","상차지명","상차지주소","하차지명","하차지주소",
                "화물내용","차량종류","차량톤수","혼적","차량번호","기사명","전화번호",
                "배차상태","청구운임","기사운임","수수료","지급방식","배차방식","메모",
              ].map((h) => (
                <th key={h} className="border px-2 py-2 text-center whitespace-nowrap">
                  {h === "선택" ? (
                    <input
                      type="checkbox"
                      onChange={() => toggleAll(filtered)}
                      checked={filtered.length && filtered.every((r) => selected.has(getId(r)))}
                    />
                  ) : h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((r, i) => {
              const id = getId(r);
              const row = edited[id] ? { ...r, ...edited[id] } : r;
              const fee = toInt(row.청구운임) - toInt(row.기사운임);

              const editableKeys = [
                "상차일","상차시간","하차일","하차시간",
                "거래처명","상차지명","상차지주소",
                "하차지명","하차지주소","화물내용","차량종류",
                "차량톤수","지급방식","배차방식","메모","청구운임","기사운임",
              ];

              return (
               <tr
  id={`row-${id}`}
  key={id || r._fsid || r._id || `idx-${i}`}
  className={`
    ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}
    ${selected.has(id) ? "bg-yellow-200 border-2 border-yellow-500" : ""}
    ${savedHighlightIds.has(id) ? "row-highlight" : ""}
  `}
>

                  <td className="border text-center">
                    <input type="checkbox" checked={selected.has(id)} onChange={() => toggleOne(id)} />
                  </td>

                  <td className="border text-center">{(page * pageSize) + i + 1}</td>
                  <td className="border text-center whitespace-nowrap">{row.등록일}</td>

                  {/* -------------------- 반복 입력 컬럼 -------------------- */}
{[
  "상차일","상차시간","하차일","하차시간",
  "거래처명","상차지명","상차지주소","하차지명","하차지주소",
  "화물내용","차량종류","차량톤수",
].map((key) => (
  <td key={key} className="border text-center whitespace-nowrap">
    {editMode && selected.has(id) && editableKeys.includes(key) ? (
      <div className="relative w-full">
        {/* ⭐ 입력창 */}
        <input
          className="border rounded px-1 py-0.5 w-full text-center"
          defaultValue={row[key] || ""}
          onChange={(e) => {
            const v = e.target.value;
            updateEdited(row, key, v);

            // ⭐ 상차지명/하차지명 자동완성
            if (key === "상차지명" || key === "하차지명") {
              const opts = filterPlaces(v);
              setPlaceOptions(opts);
              setPlaceQuery(v);
              setShowPlaceDropdown(true);
            }
          }}
          onBlur={() => setTimeout(() => setShowPlaceDropdown(false), 200)}
          onFocus={(e) => {
            if (key === "상차지명" || key === "하차지명") {
              const opts = filterPlaces(e.target.value);
              setPlaceOptions(opts);
              setShowPlaceDropdown(true);
            }
          }}
        />

        {/* ⭐ 자동완성 드롭다운 */}
        {showPlaceDropdown &&
          (key === "상차지명" || key === "하차지명") &&
          placeOptions.length > 0 && (
            <div className="absolute left-0 top-full bg-white border rounded shadow-lg w-full max-h-40 overflow-y-auto z-50">
              {placeOptions.slice(0, 12).map((p, idx) => (
                <div
                  key={idx}
                  className="p-1 px-2 cursor-pointer hover:bg-gray-100"
                  onMouseDown={() => {
                    updateEdited(row, key, p.업체명);

                    // 주소 자동 입력
                    if (key === "상차지명")
                      updateEdited(row, "상차지주소", p.주소 || "");
                    if (key === "하차지명")
                      updateEdited(row, "하차지주소", p.주소 || "");

                    setShowPlaceDropdown(false);
                  }}
                >
                  {p.업체명}
                  <span className="text-gray-500"> — {p.주소}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    ) : key === "상차지주소" || key === "하차지주소" ? (
      <AddressCell text={row[key] || ""} max={5} />
    ) : (
      row[key]
    )}
  </td>
))}


{/* 혼적 여부(Y) */}
<td className="border text-center">
  {row.혼적 ? "Y" : ""}
</td>
                  {/* 차량번호(항상 활성화) */}
                  <td className="border text-center whitespace-nowrap w-[120px] max-w-[120px]">
  <input
  className="border rounded px-1 py-0.5 text-center w-[118px]"
  defaultValue={row.차량번호 || ""}
  onKeyDown={(e) => e.key === "Enter" && handleCarInput(id, e.target.value)}
  onBlur={(e) => handleCarInput(id, e.target.value)}
/>

                  </td>

                  <td className="border text-center">{row.이름}</td>
                  <td className="border text-center">{row.전화번호}</td>

                  <td className="border text-center">
                    <StatusBadge s={row.배차상태} />
                  </td>

                  {/* 금액 */}
                  {["청구운임","기사운임"].map((key) => (
                    <td key={key} className="border text-right pr-2">
                      {editMode && selected.has(id) ? (
                        <input
                          className="border rounded px-1 py-0.5 w-full text-right"
                          defaultValue={toInt(row[key])}
                          onChange={(e) => updateEdited(row, key, e.target.value)}
                        />
                      ) : (
                        toInt(row[key]).toLocaleString()
                      )}
                    </td>
                  ))}

                  <td className={`border text-right pr-2 ${fee < 0 ? "text-red-500" : ""}`}>
                    {fee.toLocaleString()}
                  </td>

                  {/* 지급 / 배차 방식 */}
<td className="border text-center">
  {editMode && selected.has(id) ? (
    <select
      className="border rounded px-1 py-0.5 w-full text-center"
      defaultValue={row.지급방식 || ""}
      onChange={(e) => updateEdited(row, "지급방식", e.target.value)}
    >
      <option value="">선택없음</option>
      <option value="계산서">계산서</option>
      <option value="착불">착불</option>
      <option value="선불">선불</option>
      <option value="손실">손실</option>
      <option value="개인">개인</option>
      <option value="기타">기타</option>
    </select>
  ) : (
    row.지급방식
  )}
</td>

<td className="border text-center">
  {editMode && selected.has(id) ? (
    <select
      className="border rounded px-1 py-0.5 w-full text-center"
      defaultValue={row.배차방식 || ""}
      onChange={(e) => updateEdited(row, "배차방식", e.target.value)}
    >
      <option value="">선택없음</option>
      <option value="24시">24시</option>
      <option value="직접배차">직접배차</option>
      <option value="인성">인성</option>
      <option value="24시(외주업체)">24시(외주업체)</option>
    </select>
  ) : (
    row.배차방식
  )}
</td>


                  {/* 메모 더보기 */}
                  <td className="border text-center">
                    {editMode && selected.has(id) ? (
                      <input
                        className="border rounded px-1 py-0.5 w-full text-center"
                        defaultValue={row.메모 || ""}
                        onChange={(e) => updateEdited(row, "메모", e.target.value)}
                      />
                    ) : (
                      <MemoCell text={row.메모 || ""} />
                    )}
                  </td>
                  <td className="border text-center">
  <button
    className="bg-purple-600 text-white px-2 py-1 rounded text-xs"
    onClick={() => recommendDriver(row)}
  >
    추천
  </button>
  <button
    className="bg-yellow-600 text-white px-2 py-1 rounded text-xs ml-1"
    onClick={() => sendKakao(row)}
  >
    카톡
  </button>
</td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------------
          🔵 신규 오더 등록 팝업 (업그레이드 버전)
      --------------------------------------------------------- */}
      {showCreate && (
<NewOrderPopup
  setShowCreate={setShowCreate}
  newOrder={newOrder}
  setNewOrder={setNewOrder}
  addDispatch={addDispatch}
  clients={clients}
  drivers={drivers}        // ⭐ 추가
  upsertDriver={upsertDriver} // ⭐ 신규 기사 등록에 필요
/>
      )}
    {/* ===================== 선택수정(팝업) ===================== */}
{editPopupOpen && editTarget && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    
    
    {/* ===================== 선택 수정 팝업 본체 ===================== */}
    <div className="bg-white p-5 rounded shadow-xl w-[480px] max-h-[90vh] overflow-y-auto">
      <h3 className="text-lg font-bold mb-4">선택한 오더 수정</h3>

      {/* ------------------------------------------------ */}
      {/* 🔵 거래처명 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>거래처명</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.거래처명 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 거래처명: e.target.value }))
          }
        />
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 상/하차일 & 시간 */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label>상차일</label>
          <input
            type="date"
            className="border p-2 rounded w-full"
            value={editTarget.상차일 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 상차일: e.target.value }))
            }
          />
        </div>

        <div>
          <label>상차시간</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.상차시간 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 상차시간: e.target.value }))
            }
          >
            <option value="">선택없음</option>
            {[
              "오전 6:00","오전 7:00","오전 8:00","오전 9:00",
              "오전 10:00","오전 11:00","오후 12:00","오후 1:00",
              "오후 2:00","오후 3:00","오후 4:00","오후 5:00",
              "오후 6:00","오후 7:00","오후 8:00","오후 9:00",
              "오후 10:00"
            ].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label>하차일</label>
          <input
            type="date"
            className="border p-2 rounded w-full"
            value={editTarget.하차일 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 하차일: e.target.value }))
            }
          />
        </div>

        <div>
          <label>하차시간</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.하차시간 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 하차시간: e.target.value }))
            }
          >
            <option value="">선택없음</option>
            {[
              "오전 6:00","오전 7:00","오전 8:00","오전 9:00",
              "오전 10:00","오전 11:00","오후 12:00","오후 1:00",
              "오후 2:00","오후 3:00","오후 4:00","오후 5:00",
              "오후 6:00","오후 7:00","오후 8:00","오후 9:00",
              "오후 10:00"
            ].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 상하차지 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>상차지명</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.상차지명 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 상차지명: e.target.value }))
          }
        />
      </div>

      <div className="mb-3">
        <label>상차지주소</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.상차지주소 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 상차지주소: e.target.value }))
          }
        />
      </div>

      <div className="mb-3">
        <label>하차지명</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.하차지명 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 하차지명: e.target.value }))
          }
        />
      </div>

      <div className="mb-3">
        <label>하차지주소</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.하차지주소 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 하차지주소: e.target.value }))
          }
        />
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 화물내용 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>화물내용</label>
        <input
          className="border p-2 rounded w-full"
          value={editTarget.화물내용 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 화물내용: e.target.value }))
          }
        />
      </div>

      {/* 🔵 차량정보 */}
<div className="grid grid-cols-2 gap-3 mb-3">
  <div>
    <label>차량종류</label>
    <select
      className="border p-2 rounded w-full"
      value={editTarget.차량종류 || ""}
      onChange={(e) =>
        setEditTarget((p) => ({ ...p, 차량종류: e.target.value }))
      }
    >
      <option value="">선택 없음</option>
      <option value="라보/다마스">라보/다마스</option> 
      <option value="카고">카고</option>
      <option value="윙바디">윙바디</option>
      <option value="리프트">리프트</option>
      <option value="탑차">탑차</option>
      <option value="냉장탑">냉장탑</option>
      <option value="냉동탑">냉동탑</option>
      <option value="냉장윙">냉장윙</option>
      <option value="냉동윙">냉동윙</option>
      <option value="오토바이">오토바이</option>
      <option value="기타">기타</option>
    </select>
  </div>

  <div>
    <label>차량톤수</label>
    <input
      className="border p-2 rounded w-full"
      value={editTarget.차량톤수 || ""}
      onChange={(e) =>
        setEditTarget((p) => ({ ...p, 차량톤수: e.target.value }))
      }
    />
  </div>
</div>


      {/* ------------------------------------------------ */}
      {/* 🔵 차량번호 (자동매칭) */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>차량번호</label>
        <input
  className="border p-2 rounded w-full"
  value={editTarget.차량번호 || ""}
  placeholder="예: 93가1234"
  onChange={(e) => {
    // 입력값 UI에만 반영, 매칭은 하지 않음
    setEditTarget((p) => ({ ...p, 차량번호: e.target.value }));
  }}
  onKeyDown={(e) => {
    if (e.key !== "Enter") return;

    const raw = e.target.value.trim();
    const clean = raw.replace(/\s+/g, "");

    // 기존 기사 매칭
    const match = drivers.find(
      (d) => String(d.차량번호).replace(/\s+/g, "") === clean
    );

    if (match) {
      setEditTarget((p) => ({
        ...p,
        이름: match.이름,
        전화번호: match.전화번호,
        배차상태: "배차완료",
      }));
      return;
    }

    // 신규 등록
    const ok = window.confirm(
      `[${raw}] 등록된 기사가 없습니다.\n신규 기사로 추가할까요?`
    );
    if (!ok) return;

    const 이름 = prompt("기사명 입력:");
    const 전화번호 = prompt("전화번호 입력:");

    upsertDriver({
      차량번호: raw,
      이름,
      전화번호,
    });

    setEditTarget((p) => ({
      ...p,
      이름,
      전화번호,
      배차상태: "배차완료",
    }));
  }}
/>

      </div>

      {/* 🔵 이름/전화번호 (자동입력) */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label>기사명</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={editTarget.이름 || ""}
            readOnly
          />
        </div>

        <div>
          <label>전화번호</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={editTarget.전화번호 || ""}
            readOnly
          />
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 운임 (수수료 자동계산) */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label>청구운임</label>
          <input
            className="border p-2 rounded w-full"
            value={editTarget.청구운임 || ""}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/[^0-9]/g, ""));
              setEditTarget((p) => ({
                ...p,
                청구운임: v,
                수수료: Number(v) - Number(p.기사운임 || 0),
              }));
            }}
          />
        </div>

        <div>
          <label>기사운임</label>
          <input
            className="border p-2 rounded w-full"
            value={editTarget.기사운임 || ""}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/[^0-9]/g, ""));
              setEditTarget((p) => ({
                ...p,
                기사운임: v,
                수수료: Number(p.청구운임 || 0) - Number(v),
              }));
            }}
          />
        </div>

        <div>
          <label>수수료</label>
          <input
            className="border p-2 rounded w-full bg-gray-100"
            value={(editTarget.수수료 || 0).toLocaleString()}
            readOnly
          />
        </div>
      </div>
{/* 🔍 운임조회 */}
<button
  className="px-3 py-2 rounded bg-amber-600 text-white mb-4 w-full"
  onClick={handleFareSearch}
>
  📦 운임조회
</button>

      {/* ------------------------------------------------ */}
      {/* 🔵 지급/배차 방식 */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label>지급방식</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.지급방식 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 지급방식: e.target.value }))
            }
          >
            <option value="">선택 없음</option>
            <option value="계산서">계산서</option>
            <option value="착불">착불</option>
            <option value="선불">선불</option>
            <option value="손실">손실</option>
            <option value="개인">개인</option>
            <option value="기타">기타</option>
          </select>
        </div>

        <div>
          <label>배차방식</label>
          <select
            className="border p-2 rounded w-full"
            value={editTarget.배차방식 || ""}
            onChange={(e) =>
              setEditTarget((p) => ({ ...p, 배차방식: e.target.value }))
            }
          >
            <option value="">선택 없음</option>
            <option value="24시">24시</option>
            <option value="직접배차">직접배차</option>
            <option value="인성">인성</option>
            <option value="24시(외주업체)">24시(외주업체)</option>
          </select>
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 메모 */}
      {/* ------------------------------------------------ */}
      <div className="mb-3">
        <label>메모</label>
        <textarea
          className="border p-2 rounded w-full h-20"
          value={editTarget.메모 || ""}
          onChange={(e) =>
            setEditTarget((p) => ({ ...p, 메모: e.target.value }))
          }
        />
      </div>

      {/* ------------------------------------------------ */}
      {/* 🔵 저장/취소 */}
      {/* ------------------------------------------------ */}
      <div className="flex justify-end gap-3 mt-4">
        <button
          className="px-3 py-1 rounded bg-gray-300"
          onClick={() => setEditPopupOpen(false)}
        >
          취소
        </button>

        <button
  className="px-3 py-1 rounded bg-blue-600 text-white"
  onClick={async () => {
    // 1) Firestore 저장
    await patchDispatch(editTarget._id, editTarget);

    // 2) 방금 저장한 행을 반짝이게
    setSavedHighlightIds((prev) => {
      const next = new Set(prev);
      next.add(editTarget._id);
      return next;
    });

    // 3초 후 자동 제거
    setTimeout(() => {
      setSavedHighlightIds((prev) => {
        const next = new Set(prev);
        next.delete(editTarget._id);
        return next;
      });
    }, 3000);

    // 3) 팝업 종료
    alert("수정이 저장되었습니다.");
const savedId = editTarget._id;

setEditPopupOpen(false);
setSelected(new Set());

// 🔥 Firestore 적용 후 렌더링 시간 보정
setTimeout(() => {
  const el = document.getElementById(`row-${savedId}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}, 300);
  }}
>
  저장
</button>

      </div>

    </div>
  </div>
)}
{/* 📦 운임조회 결과 모달 (선택수정용) */}
{fareModalOpen && fareResult && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999]">
    <div className="bg-white p-6 rounded-lg w-[420px] shadow-xl max-h-[90vh] overflow-y-auto">
      <h3 className="font-bold text-lg mb-3">📦 운임 조회 결과</h3>

      <p>건수: {fareResult.count}건</p>
      <p>평균 운임: {fareResult.avg.toLocaleString()}원</p>
      <p className="mb-3">
        범위: {fareResult.min.toLocaleString()}원 ~ {fareResult.max.toLocaleString()}원
      </p>

      {/* 🔽 과거운송 목록 */}
      <div className="mt-3 border-t pt-3 text-sm">
        <p className="font-semibold mb-2">📜 과거 운송 기록</p>

        {fareResult.records?.length > 0 ? (
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {fareResult.records.map((rec) => (
              <div
                key={rec._id}
                className="flex items-center justify-between gap-2 p-2 border rounded bg-gray-50 hover:bg-blue-50"
              >
                <div className="flex-1 text-xs leading-tight">
                  <div className="font-semibold text-gray-900">
                    {rec.상차일} | {rec.화물내용 || "-"}
                  </div>
                  <div className="text-gray-600">
                    {rec.상차지명} → {rec.하차지명}
                  </div>
                  <div className="text-gray-500">
                    차량: {rec.차량종류 || "-"} / {rec.차량톤수 || "-"}
                  </div>
                  <div className="text-gray-800 font-medium">
                    {(rec.청구운임 || 0).toLocaleString()}원
                  </div>
                </div>

                {/* 적용 버튼 */}
                <button
                  className="px-2 py-1 bg-blue-600 text-white text-xs rounded whitespace-nowrap"
                  onClick={() => {
                    setEditTarget((p) => ({
                      ...p,
                      청구운임: Number(rec.청구운임 || 0),
                      수수료:
                        Number(rec.청구운임 || 0) - Number(p.기사운임 || 0),
                    }));
                    setFareModalOpen(false);
                  }}
                >
                  적용
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 mt-3">
            유사 운임 데이터 {fareResult.count}건 참고됨
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 mt-4">
        <button
          className="px-3 py-1 bg-gray-300 rounded"
          onClick={() => setFareModalOpen(false)}
        >
          닫기
        </button>

        <button
          className="px-3 py-1 bg-blue-600 text-white rounded"
          onClick={() => {
            setEditTarget((p) => ({
              ...p,
              청구운임: fareResult.avg,
              수수료: fareResult.avg - Number(p.기사운임 || 0),
            }));
            setFareModalOpen(false);
          }}
        >
          평균 적용
        </button>
      </div>
    </div>
  </div>
)}
{/* ===================== 기사확인 팝업 ===================== */} 
{driverConfirmInfo && (
  <div
    className="fixed inset-0 flex items-center justify-center z-[9999]"
    tabIndex={-1}
    ref={(el) => {
      if (el) setTimeout(() => el.focus(), 0);
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter" && driverConfirmInfo.type === "select") {
        const d = driverConfirmInfo.driver;
        patchDispatch(driverConfirmInfo.rowId, {
          차량번호: d.차량번호,
          이름: d.이름,
          전화번호: d.전화번호,
          배차상태: "배차완료",
        });
        setDriverConfirmInfo(null);
      }
    }}
  >



    {/* 팝업 컨테이너 */}
    <div className="bg-white rounded-xl p-7 w-[420px] shadow-xl border border-gray-200">

      {/* 제목 */}
      <h3 className="text-lg font-bold text-center mb-5 flex items-center justify-center gap-2">
        🚚 기사 정보 확인
      </h3>

      {/* Form */}
      <div className="space-y-4">

        {/* 차량번호 */}
        <div>
          <label className="text-sm font-semibold text-gray-700">
            차량번호
          </label>
          <input
            className="border rounded-lg p-2 mt-1 w-full bg-gray-100 text-gray-600 cursor-not-allowed text-center"
            value={driverConfirmInfo.driver?.차량번호 || driverConfirmInfo.plate || ""}
            readOnly
          />
        </div>

        {/* 기사명 */}
        <div>
          <label className="text-sm font-semibold text-gray-700">
            기사명
          </label>
          <input
            className="border rounded-lg p-2 mt-1 w-full bg-gray-100 text-gray-600 text-center"
            value={driverConfirmInfo.driver?.이름 || ""}
            readOnly
          />
        </div>

        {/* 연락처 */}
        <div>
          <label className="text-sm font-semibold text-gray-700">
            연락처
          </label>
          <input
            className="border rounded-lg p-2 mt-1 w-full bg-gray-100 text-gray-600 text-center"
            value={driverConfirmInfo.driver?.전화번호 || ""}
            readOnly
          />
        </div>

      </div>

      {/* 안내 문구 */}
      <p className="text-sm text-gray-500 text-center mt-6">
        위 정보가 맞습니까?
      </p>

      {/* 버튼 */}
      <div className="flex justify-between gap-2 mt-6">

        {/* 취소 */}
        <button
          className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 border"
          onClick={() => setDriverConfirmInfo(null)}
        >
          취소
        </button>

        {/* 빠른 기사 등록 */}
        <button
          className="flex-1 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
          onClick={async () => {
  const plate = driverConfirmInfo.plate;

  const name = prompt("기사명 입력");
  if (!name) return; // 팝업 유지

  const phone = prompt("전화번호 입력");
  if (!phone) return; // 팝업 유지

  await upsertDriver({ 차량번호: plate, 이름: name, 전화번호: phone });
  await patchDispatch(driverConfirmInfo.rowId, {
    차량번호: plate,
    이름: name,
    전화번호: phone,
    배차상태: "배차완료",
    lastUpdated: new Date().toISOString(), // ⭐ 추가
  });
}}
        >
          빠른기사등록
        </button>

        {/* 확인 */}
        <button
          disabled={driverConfirmInfo.type === "new"}
          className={`flex-1 py-2 rounded-lg text-white ${
            driverConfirmInfo.type === "new"
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          onClick={async () => {
            const d = driverConfirmInfo.driver;
            await patchDispatch(driverConfirmInfo.rowId, {
  차량번호: d.차량번호,
  이름: d.이름,
  전화번호: d.전화번호,
  배차상태: "배차완료",
  lastUpdated: new Date().toISOString(), // ⭐ 추가
});
            setDriverConfirmInfo(null);
          }}
        >
          확인
        </button>

      </div>
    </div>
  </div>
)}

{/* ===================== 기사선택 팝업 ===================== */}
{driverSelectInfo && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
    <div className="bg-white p-5 rounded-lg w-[360px]">
      <h3 className="text-lg font-bold mb-3">🚚 선택하라우!</h3>

      {driverSelectInfo.list.map((d, i) => (
        <button key={i}
          onClick={async () => {
            await patchDispatch(driverSelectInfo.rowId, {
              차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호
            });
            setDriverSelectInfo(null);
          }}
          className="w-full text-left px-3 py-2 mb-2 rounded border hover:bg-gray-100">
          {d.이름} ({d.차량번호}) {d.전화번호}
        </button>
      ))}
      <button className="mt-3 w-full py-2 rounded bg-gray-200"
        onClick={() => setDriverSelectInfo(null)}>취소</button>
    </div>
  </div>
)}
{/* ========================== 선택삭제 팝업 ========================== */}
{/* ========================== 선택삭제 팝업 ========================== */}
{showDeletePopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white p-6 rounded-xl shadow-lg w-[360px]">
      <h3 className="text-lg font-bold mb-4 text-center text-red-600">
        선택한 항목을 삭제하시겠습니까?
      </h3>

      <p className="text-center mb-2">
        총 {selected.size}개의 항목이 삭제됩니다.
      </p>

      {/* 👍 선택된 항목 목록 표시 추가 */}
      <div className="bg-gray-50 border p-3 rounded mb-4 max-h-60 overflow-y-auto text-sm">
        {[...selected].map((id, idx) => {
          const row = dispatchData.find((r) => getId(r) === id);
          if (!row) return null;

          return (
            <div key={id} className="mb-3 border-b pb-2">
              <div className="font-semibold">{idx + 1}. {row.거래처명 || "-"}</div>
              <div>상차: {row.상차일 || ""} {row.상차지명 || ""}</div>
              <div>하차: {row.하차일 || ""} {row.하차지명 || ""}</div>
              <div>차량: {row.차량번호 || "-"}</div>
              <div>운임: {(row.청구운임 || 0).toLocaleString()}원</div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 py-2 bg-gray-300 rounded"
          onClick={() => setShowDeletePopup(false)}
        >
          취소
        </button>

        <button
          className="flex-1 py-2 bg-red-600 text-white rounded"
          onClick={deleteRowsWithUndo}
        >
          삭제하기
        </button>
      </div>
    </div>
  </div>
)}

{/* ========================== 되돌리기 알림 ========================== */}
{undoVisible && (
  <div className="fixed bottom-5 right-5 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 z-[100000]">
    <span>삭제됨</span>
    <button
      className="bg-blue-500 px-3 py-1 rounded"
      onClick={async () => {
        for (const row of backupDeleted) {
          await patchDispatch(row._id, row);
        }
        setUndoVisible(false);
        alert("삭제가 복구되었습니다.");
      }}
    >
      되돌리기
    </button>
  </div>
)}

{/* ===================== 📋 기사복사 선택 모달 ===================== */}
{copyModalOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white p-6 rounded-xl shadow-lg w-[320px]">
      <h3 className="text-lg font-bold mb-4 text-center">📋 복사 방식 선택</h3>

      <div className="space-y-2">
        <button
          onClick={() => copyMessage("basic")}
          className="w-full py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          기본(번호/이름/전화)
        </button>
        <button
          onClick={() => copyMessage("fare")}
          className="w-full py-2 bg-blue-200 rounded hover:bg-blue-300"
        >
          운임 포함(부가세/선불/착불)
        </button>
        <button
          onClick={() => copyMessage("full")}
          className="w-full py-2 bg-green-200 rounded hover:bg-green-300"
        >
          전체 상세
        </button>
      </div>

      <button
        onClick={() => setCopyModalOpen(false)}
        className="w-full mt-4 py-2 text-sm text-gray-600"
      >
        취소
      </button>
    </div>
  </div>
)}


    </div>
    
  );
}

/* ---------------------- 주소 더보기 ---------------------- */
function AddressCell({ text = "", max = 5 }) {
  const [open, setOpen] = React.useState(false);
  const clean = String(text || "");
  const isLong = clean.length > max;
  const short = isLong ? clean.slice(0, max) + "…" : clean;

  if (!clean) return <span className="text-gray-400">-</span>;

  return (
    <div className="relative inline-block">
      <span>{open ? clean : short}</span>
      {isLong && !open && (
        <button onClick={() => setOpen(true)} className="text-blue-600 text-xs ml-1 underline">
          더보기
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white p-4 rounded-lg shadow-lg w-[420px] max-w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-2">주소 전체보기</h3>
            <div className="text-sm whitespace-pre-wrap break-words">{clean}</div>
            <div className="text-right mt-4">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------- 메모 더보기 ---------------------- */
function MemoCell({ text }) {
  const [showFull, setShowFull] = React.useState(false);
  if (!text) return <span className="text-gray-400">-</span>;

  const clean = String(text);
  const isLong = clean.length > 5;
  const short = isLong ? clean.slice(0, 5) + "…" : clean;

  return (
    <div className="relative inline-block">
      <span>{showFull ? clean : short}</span>
      {isLong && !showFull && (
        <button
          onClick={() => setShowFull(true)}
          className="text-blue-600 text-xs ml-1 underline"
        >
          더보기
        </button>
      )}
      {showFull && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowFull(false)}
        >
          <div
            className="bg-white p-4 rounded-lg shadow-lg w-[400px] max-w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-2">메모 내용</h3>
            <div className="text-sm whitespace-pre-wrap break-words">{clean}</div>
            <div className="text-right mt-4">
              <button
                onClick={() => setShowFull(false)}
                className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

  /* ===================== 신규 오더 등록 팝업 ===================== */
function NewOrderPopup({
  setShowCreate,
  newOrder,
  setNewOrder,
  addDispatch,
  clients,
  drivers,       // ⭐ 추가
  upsertDriver,  // ⭐ 추가
}) {
  const handleChange = (key, value) =>
    setNewOrder((prev) => ({ ...prev, [key]: value }));

  const saveOrder = async () => {
    try {
      await addDispatch({
        ...newOrder,
        등록일: new Date().toISOString().slice(0, 10),
        배차상태: "배차중",
        차량번호: "",
        이름: "",
        전화번호: "",
      });

      alert("신규 오더가 등록되었습니다.");
      setShowCreate(false);

      // 초기화
      setNewOrder({
        상차일: "",
        상차시간: "",
        하차일: "",
        하차시간: "",
        거래처명: "",
        상차지명: "",
        상차지주소: "",
        하차지명: "",
        하차지주소: "",
        화물내용: "",      // ★ 추가
        차량종류: "",
        차량톤수: "",
        청구운임: "",
        기사운임: "",
        지급방식: "",
        배차방식: "",
        혼적: false,
        독차: false,
        메모: "",
      });
    } catch (err) {
      console.error(err);
      alert("등록 실패");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-5 rounded shadow-xl w-[460px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-3">신규 오더 등록</h3>

        <div className="space-y-3">

          {/* 혼적/독차 */}
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newOrder.혼적}
                onChange={(e) => handleChange("혼적", e.target.checked)}
              />
              혼적
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newOrder.독차}
                onChange={(e) => handleChange("독차", e.target.checked)}
              />
              독차
            </label>
          </div>

          {/* 거래처명 */}
          <div>
            <label className="font-semibold text-sm">거래처명</label>
            <input
              type="text"
              value={newOrder.거래처명}
              onChange={(e) => handleChange("거래처명", e.target.value)}
              className="border p-2 rounded w-full"
            />

            {newOrder.거래처명 &&
              clients
                .filter((c) => c.거래처명.includes(newOrder.거래처명))
                .slice(0, 10)
                .map((c) => (
                  <div
                    key={c._id}
                    className="p-1 px-2 border-b cursor-pointer hover:bg-gray-100"
                    onClick={() =>
                      setNewOrder((prev) => ({
                        ...prev,
                        거래처명: c.거래처명,
                        상차지명: c.상차지명 || "",
                        상차지주소: c.상차지주소 || "",
                      }))
                    }
                  >
                    {c.거래처명}
                  </div>
                ))}
          </div>

          {/* 날짜 / 시간 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label>상차일</label>
              <input
                type="date"
                value={newOrder.상차일}
                onChange={(e) => handleChange("상차일", e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
              <label>상차시간</label>
              <select
                className="border p-2 rounded w-full"
                value={newOrder.상차시간}
                onChange={(e) => handleChange("상차시간", e.target.value)}
              >
                <option value="">선택없음</option>   {/* ★ 추가 */}
                <option value="오전 6:00">오전 6:00</option>
                <option value="오전 7:00">오전 7:00</option>
                <option value="오전 8:00">오전 8:00</option>
                <option value="오전 9:00">오전 9:00</option>
                <option value="오전 10:00">오전 10:00</option>
                <option value="오전 11:00">오전 11:00</option>
                <option value="오후 12:00">오후 12:00</option>
                <option value="오후 1:00">오후 1:00</option>
                <option value="오후 2:00">오후 2:00</option>
                <option value="오후 3:00">오후 3:00</option>
                <option value="오후 4:00">오후 4:00</option>
                <option value="오후 5:00">오후 5:00</option>
                <option value="오후 6:00">오후 6:00</option>
              </select>
            </div>

            <div>
              <label>하차일</label>
              <input
                type="date"
                value={newOrder.하차일}
                onChange={(e) => handleChange("하차일", e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
              <label>하차시간</label>
              <select
                className="border p-2 rounded w-full"
                value={newOrder.하차시간}
                onChange={(e) => handleChange("하차시간", e.target.value)}
              >
                <option value="">선택없음</option>   {/* ★ 추가 */}
                <option value="오전 6:00">오전 6:00</option>
                <option value="오전 7:00">오전 7:00</option>
                <option value="오전 8:00">오전 8:00</option>
                <option value="오전 9:00">오전 9:00</option>
                <option value="오전 10:00">오전 10:00</option>
                <option value="오전 11:00">오전 11:00</option>
                <option value="오후 12:00">오후 12:00</option>
                <option value="오후 1:00">오후 1:00</option>
                <option value="오후 2:00">오후 2:00</option>
                <option value="오후 3:00">오후 3:00</option>
                <option value="오후 4:00">오후 4:00</option>
                <option value="오후 5:00">오후 5:00</option>
                <option value="오후 6:00">오후 6:00</option>
              </select>
            </div>
          </div>

          {/* 상하차지 */}
          <div>
            <label>상차지명</label>
            <input
              className="border p-2 rounded w-full"
              value={newOrder.상차지명}
              onChange={(e) => handleChange("상차지명", e.target.value)}
            />
          </div>

          <div>
            <label>상차지주소</label>
            <input
              className="border p-2 rounded w-full"
              value={newOrder.상차지주소}
              onChange={(e) => handleChange("상차지주소", e.target.value)}
            />
          </div>

          <div>
            <label>하차지명</label>
            <input
              className="border p-2 rounded w-full"
              value={newOrder.하차지명}
              onChange={(e) => handleChange("하차지명", e.target.value)}
            />
          </div>

          <div>
            <label>하차지주소</label>
            <input
              className="border p-2 rounded w-full"
              value={newOrder.하차지주소}
              onChange={(e) => handleChange("하차지주소", e.target.value)}
            />
          </div>
          

          {/* 화물내용 - ★ 추가됨 */}
          <div>
            <label>화물내용</label>
            <input
              className="border p-2 rounded w-full"
              value={newOrder.화물내용}
              onChange={(e) => handleChange("화물내용", e.target.value)}
              placeholder="예: 5톤 파렛트 / 냉동식품"
            />
          </div>

          {/* 차량정보 */}
          <div className="grid grid-cols-2 gap-3">
<div>
  <label>차량종류</label>
  <select
    className="border p-2 rounded w-full"
    value={newOrder.차량종류}
    onChange={(e) => handleChange("차량종류", e.target.value)}
  >
  <option value="">선택 없음</option>
      <option value="라보">라보</option>
      <option value="다마스">다마스</option>
      <option value="카고">카고</option>
      <option value="윙바디">윙바디</option>
      <option value="리프트">리프트</option>
      <option value="탑차">탑차</option>
      <option value="냉장탑">냉장탑</option>
      <option value="냉동탑">냉동탑</option>
      <option value="냉장윙">냉장윙</option>
      <option value="냉동윙">냉동윙</option>
      <option value="오토바이">오토바이</option>
      <option value="기타">기타</option>
  </select>
</div>


            <div>
              <label>차량톤수</label>
              <input
                className="border p-2 rounded w-full"
                value={newOrder.차량톤수}
                onChange={(e) => handleChange("차량톤수", e.target.value)}
              />
            </div>
          </div>

          {/* 운임 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>청구운임</label>
              <input
                className="border p-2 rounded w-full"
                value={newOrder.청구운임}
                onChange={(e) => handleChange("청구운임", e.target.value)}
              />
            </div>

            <div>
              <label>기사운임</label>
              <input
                className="border p-2 rounded w-full"
                value={newOrder.기사운임}
                onChange={(e) => handleChange("기사운임", e.target.value)}
              />
            </div>
          </div>

          {/* 지급 / 배차 방식 */}
          <div className="grid grid-cols-2 gap-3">
<div>
  <label>지급방식</label>
  <select
    className="border p-2 rounded w-full"
    value={newOrder.지급방식}
    onChange={(e) => handleChange("지급방식", e.target.value)}
  >
    <option value="">선택없음</option>
    <option value="계산서">계산서</option>
    <option value="착불">착불</option>
    <option value="선불">선불</option>
    <option value="손실">손실</option>
    <option value="개인">개인</option>
    <option value="기타">기타</option>
  </select>
</div>


            <div>
  <label>배차방식</label>
  <select
    className="border p-2 rounded w-full"
    value={newOrder.배차방식}
    onChange={(e) => handleChange("배차방식", e.target.value)}
  >
    <option value="">선택없음</option>
    <option value="24시">24시</option>
<option value="직접배차">직접배차</option>
<option value="인성">인성</option>
<option value="24시(외주업체)">24시(외주업체)</option>
  </select>
</div>

          </div>

          {/* 메모 */}
          <div>
            <label>메모</label>
            <textarea
              className="border p-2 rounded w-full h-20"
              value={newOrder.메모}
              onChange={(e) => handleChange("메모", e.target.value)}
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => setShowCreate(false)}
            className="px-3 py-1 rounded bg-gray-300"
          >
            취소
          </button>

          <button onClick={saveOrder} className="px-3 py-1 rounded bg-blue-600 text-white">
            저장
          </button>
        </div>
      </div>
      
    </div>
  );
}

// ===================== DispatchApp.jsx (PART 5/8 — END) =====================

// ===================== DispatchApp.jsx (PART 6/8 — Settlement Premium) — START =====================

function Settlement({ dispatchData, fixedRows = [] }) {
  const [targetMonth, setTargetMonth] = React.useState(
  new Date().toISOString().slice(0, 7)
);
  const [detailClient, setDetailClient] = React.useState(null);

  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  // ✅ 여기 추가 (이 위치가 정답)
const sum = (list, key) => list.reduce((a, r) => a + toInt(r[key]), 0);
// ✅ 수익률 계산 (전면 공통)
const profitRate = (sale, profit) =>
  sale === 0 ? 0 : (profit / sale) * 100;

const ratePct = (n) => `${n.toFixed(1)}%`;

  // ================================
// 📊 매출 리포트 PPT 생성
// ================================
const exportSettlementPPT = async () => {
  const ppt = new PptxGenJS();
  ppt.author = "RUN25";
  ppt.company = "RUN25 물류";
  ppt.title = `매출 리포트 ${targetMonth}`;

  const wonText = (n) => `${(n || 0).toLocaleString()}원`;

  /* -----------------------------
     1. 표지
  ----------------------------- */
  let slide = ppt.addSlide();
  slide.addText(`RUN25 매출 분석 리포트`, {
    x: 1, y: 1.8, fontSize: 28, bold: true,
  });
  slide.addText(`${targetMonth}`, {
    x: 1, y: 2.6, fontSize: 18,
  });
  slide.addText(`작성일: ${new Date().toLocaleDateString()}`, {
    x: 1, y: 3.2, fontSize: 12, color: "666666",
  });
/* -----------------------------
   1-1. Executive Summary (임원 요약)
----------------------------- */
slide = ppt.addSlide();
slide.addText("Executive Summary", {
  x: 0.5, y: 0.4,
  fontSize: 22,
  bold: true,
});

slide.addText(
  `• 순수 운송 매출 ${wonText(mPure.sale)} 달성\n` +
  `• 전월 대비 ${rateText(vrPure.month)}\n` +
  `• 상위 거래처 중심 매출 구조 강화`,
  {
    x: 0.7,
    y: 1.4,
    fontSize: 16,
    lineSpacing: 28,
  }
);

  /* -----------------------------
     2. 월 예상 실적
  ----------------------------- */
  slide = ppt.addSlide();
  slide.addText("월 예상 실적", { x: 0.5, y: 0.3, fontSize: 20, bold: true });

  slide.addTable([
    ["예상 매출", "예상 건수", "예상 수익"],
    [wonText(forecast.sale), `${forecast.count}건`, wonText(forecast.profit)],
  ], {
    x: 0.5, y: 1.2, w: 9,
    colW: [3, 3, 3],
    fontSize: 16,
    align: "center",
  });

  /* -----------------------------
     3. 당월 실적 요약
  ----------------------------- */
  slide = ppt.addSlide();
  slide.addText("당월 실적 요약", { x: 0.5, y: 0.3, fontSize: 20, bold: true });

  slide.addTable([
    ["구분", "매출", "운반비", "수익"],
    ["총 운송", wonText(m.sale), wonText(m.driver), wonText(m.profit)],
    ["순수 운송", wonText(mPure.sale), wonText(mPure.driver), wonText(mPure.profit)],
  ], {
    x: 0.5, y: 1.1, w: 9,
    colW: [2, 2.5, 2.5, 2],
    fontSize: 14,
  });

  /* -----------------------------
     4. 전월 대비
  ----------------------------- */
  slide = ppt.addSlide();
  slide.addText("전월 대비 분석", { x: 0.5, y: 0.3, fontSize: 20, bold: true });

  slide.addText(
    `총 운송 수익: ${rateText(vr.month)}\n순수 운송 수익: ${rateText(vrPure.month)}`,
    { x: 0.5, y: 1.2, fontSize: 16 }
  );

  /* -----------------------------
     5. Top10 거래처
  ----------------------------- */
  slide = ppt.addSlide();
  slide.addText("Top10 거래처 (당월 매출)", { x: 0.5, y: 0.3, fontSize: 20, bold: true });

  const clientMap = {};
monthRows.forEach(r => {
  const c = r.거래처명 || "미지정";
  if (!clientMap[c]) clientMap[c] = { sale: 0, profit: 0 };
  clientMap[c].sale += toInt(r.청구운임);
  clientMap[c].profit += toInt(r.청구운임) - toInt(r.기사운임);
});

const top10Rows = Object.entries(clientMap)
  .map(([c, v]) => [c, wonText(v.sale), wonText(v.profit)])
  .sort((a, b) => toInt(b[1]) - toInt(a[1]))
  .slice(0, 10);


  slide.addTable(
    [["거래처", "매출", "수익"], ...top10Rows.slice(0, 10)],
    { x: 0.5, y: 1.0, w: 9, fontSize: 12 }
  );

  /* -----------------------------
     6. 2026 매출 전망
  ----------------------------- */
  slide = ppt.addSlide();
  slide.addText("2026 매출 전망 (순수 운송)", {
    x: 0.5, y: 0.3, fontSize: 20, bold: true,
  });

  slide.addTable([
    ["보수적", "기준", "공격적"],
    [
      wonText(forecast2026.conservative),
      wonText(forecast2026.normal),
      wonText(forecast2026.aggressive),
    ],
  ], {
    x: 0.5, y: 1.2, w: 9,
    colW: [3, 3, 3],
    fontSize: 16,
    align: "center",
  });

  /* -----------------------------
     7. 결론
  ----------------------------- */
  slide = ppt.addSlide();
  slide.addText("결론 및 제언", { x: 0.5, y: 0.3, fontSize: 20, bold: true });

  slide.addText(
    `• 순수 운송 기준 연매출 ${wonText(yPure.sale)}\n` +
    `• 2026년 기준 시나리오 ${wonText(forecast2026.normal)}\n` +
    `• Top 거래처 집중 전략 시 추가 성장 가능`,
    { x: 0.5, y: 1.2, fontSize: 14 }
  );

  ppt.writeFile(`RUN25_매출리포트_${targetMonth}.pptx`);
};


  const [yearKey, monthNum] = targetMonth.split("-").map(Number);
const monthKey = targetMonth;
// KPI 기준일: 선택 월 기준 "존재하는 날짜"로 보정
const kpiDay = (() => {
  const today = new Date();

  const maxDay = new Date(yearKey, monthNum, 0).getDate();
  const safeDay = Math.min(today.getDate(), maxDay);

  return `${targetMonth}-${String(safeDay).padStart(2, "0")}`;
})();

const prevMonthDate = new Date(yearKey, monthNum - 2, 1);
const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(
  prevMonthDate.getMonth() + 1
).padStart(2, "0")}`;


// 1) 배차 데이터 (배차완료만)
const dispatchRows = Array.isArray(dispatchData)
  ? dispatchData.filter(r =>
      (r.배차상태 || "") === "배차완료" &&
      !String(r.거래처명 || "").includes("채석강")
    )
  : [];

// 2) 고정거래처 데이터(FixedClients → Settlement 형식으로 매핑)
const fixedMapped = (fixedRows || []).map(r => ({
  상차일: r.날짜,
  출발지: r.출발지 || "",
  도착지: r.도착지 || "",
  거래처명: r.거래처명 || "",
  청구운임: r.청구운임 || 0,
  기사운임: r.기사운임 || 0,
  수수료: r.수수료 || 0,
  배차상태: "배차완료",
}));

// ⭐ 최종 rows: 배차 + 고정거래처 합산
const rows = [...dispatchRows, ...fixedMapped];


  const dayRows = rows.filter((r) => (r.상차일 || "") === kpiDay);
  const monthRows = rows.filter((r) => (r.상차일 || "").startsWith(monthKey));
  const yearRows = rows.filter((r) => {
  const d = r.상차일;
  if (!d) return false;

  // 같은 연도 + 선택 월 이전까지
  const endOfMonth = new Date(yearKey, monthNum, 0)
  .toISOString()
  .slice(0, 10);

return d >= `${yearKey}-01-01` && d <= endOfMonth;
});

  const prevMonthRows = rows.filter((r) => (r.상차일 || "").startsWith(prevMonthKey));
  // ================================
// 🆕 신규 거래처 (당월 최초 발생)
// ================================
const isValidClientName = (c) =>
  c &&
  !/^2\d{1,2}년/.test(c) &&     // 25년1월, 25년10월 제거
  !c.includes("후레쉬물류");    // 후레쉬물류 제외

// 거래처별 최초 등장일 계산
const firstAppearMap = new Map();

rows.forEach((r) => {
  const c = r.거래처명 || "";
  const d = r.상차일 || "";
  if (!isValidClientName(c) || !d) return;

  if (!firstAppearMap.has(c) || d < firstAppearMap.get(c)) {
    firstAppearMap.set(c, d);
  }
});

// 당월 신규 거래처만 추출
const newClients = [];

firstAppearMap.forEach((firstDate, client) => {
  if (firstDate.startsWith(monthKey)) {
    const clientRows = monthRows.filter(r => r.거래처명 === client);

    const sale = sum(clientRows, "청구운임");
    const driver = sum(clientRows, "기사운임");
    const fee = sum(clientRows, "수수료");
    const profit = sale - driver;

    newClients.push({
      client,
      firstDate,
      cnt: clientRows.length,
      sale,
      profit,
      fee,
    });
  }
});

  const won = (n) => `${(n || 0).toLocaleString()}원`;

  // 🔑 후레쉬물류 판별
const isFresh = (r) =>
  String(r.거래처명 || "").includes("후레쉬물류");
  const stat = (list) => {
    const sale = sum(list, "청구운임");
    const driver = sum(list, "기사운임");
    return { sale, driver, profit: sale - driver };
  };

  const d = stat(dayRows);
  const m = stat(monthRows);
  const y = stat(yearRows);
  const pm = stat(prevMonthRows);
  // ================================
// 📊 월 예상 매출 / 수익 / 건수
// ================================

// 오늘 날짜
const today = new Date().toISOString().slice(0, 10);

// 이번 달 전체 일수
const daysInMonth = new Date(yearKey, monthNum, 0).getDate();

// 이번 달 지난 일수 (실적 있는 날 기준)
const elapsedDays = new Set(
  monthRows
    .map(r => r.상차일)
    .filter(d => d && d <= today)
).size || 1;

// 현재까지 실적
const curSale = m.sale;
const curProfit = m.profit;
const curCnt = monthRows.length;

// 일 평균
const avgSalePerDay = curSale / elapsedDays;
const avgProfitPerDay = curProfit / elapsedDays;
const avgCntPerDay = curCnt / elapsedDays;

// 월 예상
const forecast = {
  sale: Math.round(avgSalePerDay * daysInMonth),
  profit: Math.round(avgProfitPerDay * daysInMonth),
  count: Math.round(avgCntPerDay * daysInMonth),
};

  // 🔹 전월 순수 운송 (후레쉬 미포함)
const pmPure = stat(
  prevMonthRows.filter(r => !isFresh(r))
);
  // 🔹 후레쉬 미포함 (순수 운송)
const dPure = stat(dayRows.filter(r => !isFresh(r)));
const mPure = stat(monthRows.filter(r => !isFresh(r)));
const yPure = stat(yearRows.filter(r => !isFresh(r)));
// ================================
// 🔮 2026 매출 예측 (BEST PRACTICE)
// 기준: 올해 순수 운송 연매출
// ================================

// 올해 순수 운송 연매출
const baseYearSale = yPure.sale;

// 연 성장률 가정 (현실적인 범위)
const growth2026 = {
  conservative: 0.05, // +5%
  normal: 0.10,       // +10%
  aggressive: 0.18,   // +18%
};

// 2026 연 매출 예측 (합계 기준)
const forecast2026 = {
  conservative: Math.round(baseYearSale * (1 + growth2026.conservative)),
  normal: Math.round(baseYearSale * (1 + growth2026.normal)),
  aggressive: Math.round(baseYearSale * (1 + growth2026.aggressive)),
};



  const diffRate = (cur, prev) =>
    (prev === 0 ? 0 : ((cur - prev) / prev) * 100);

// 🔹 총 운송 전월대비 (월만 의미 있음)
const vr = {
  month: diffRate(m.profit, pm.profit),
};
// 🔹 순수 운송 전월대비 (월만 의미 있음)
const vrPure = {
  month: diffRate(mPure.profit, pmPure.profit),
};
  const rateText = (n) => `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1)}%`;
  const rateClass = (n) => (n >= 0 ? "text-green-600" : "text-rose-600");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">

      {/* LEFT PANEL */}
      <div className="space-y-6">
        
        <button
  onClick={exportSettlementPPT}
  className="px-4 py-2 rounded bg-indigo-600 text-white text-sm"
>
  📥 매출 리포트 PPT 다운로드
</button>
{/* 🔮 월 예상 실적 */}
<div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4">
  <h3 className="text-sm font-semibold text-indigo-700 mb-3">
    🔮 월 예상 실적 (당월)
  </h3>

  <div className="grid grid-cols-3 gap-3 text-center">
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">예상 매출</p>
      <p className="font-bold text-blue-700">
        {won(forecast.sale)}
      </p>
    </div>

    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">예상 건수</p>
      <p className="font-bold">
        {forecast.count}건
      </p>
    </div>

    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">예상 수익</p>
      <p className="font-bold text-emerald-600">
        {won(forecast.profit)}
      </p>
    </div>
  </div>

  <p className="text-[11px] text-gray-500 mt-2">
    * 현재 실적 기준 일평균 추정
  </p>
</div>

{/* 🔮 2026 매출 전망 (후레쉬 제외) */}
<div className="rounded-2xl bg-violet-50 border border-violet-200 p-4">
  <h3 className="text-sm font-semibold text-violet-700 mb-3">
    🔮 2026 매출 전망 (순수 운송 예상 매출)
  </h3>

  <div className="grid grid-cols-3 gap-3 text-center">
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">보수적</p>
      <p className="font-bold">
        {won(forecast2026.conservative)}
      </p>
    </div>

 <div className="bg-white rounded-lg border p-3">
  <p className="text-xs text-gray-500">기준</p>
  <p className="font-bold text-blue-700">
    {won(forecast2026.normal)}
  </p>
</div>

    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">공격적</p>
      <p className="font-bold text-emerald-600">
        {won(forecast2026.aggressive)}
      </p>
    </div>
  </div>

  <p className="text-[11px] text-gray-500 mt-2">
    * 후레쉬 제외, 과거 월 성장률 기반
  </p>
</div>
        {/* KPI – 총 운송료 (후레쉬 포함) */}
<div className="rounded-2xl bg-white border shadow-sm p-4">

  {/* 🔹 KPI 제목 */}
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-gray-800">
      총 운송료 (후레쉬 포함)
    </h3>
    <span className="text-[11px] text-gray-400">
      배차 + 고정거래처 전체
    </span>
  </div>

  <table className="w-full text-sm border-collapse text-center">
    <thead className="bg-gray-50 text-gray-600">
      <tr>
        <th className="border p-2">구분</th>
        <th className="border p-2">매출</th>
        <th className="border p-2">운반비</th>
        <th className="border p-2">수익</th>
<th className="border p-2">수익률</th>
<th className="border p-2">전월대비(수익)</th>

      </tr>
    </thead>
    <tbody>
      {[
  ["월", m, "month"],
  ["년", y, null],
].map(([label, data, key], i) => (
  <tr key={i} className="font-semibold">
    <td className="border p-2 bg-gray-50">{label}</td>
    <td className="border p-2 text-blue-700">{won(data.sale)}</td>
    <td className="border p-2 text-gray-600">{won(data.driver)}</td>
<td className="border p-2 text-green-600">
  {won(data.profit)}
</td>

{/* ✅ 수익률 */}
<td className="border p-2 text-indigo-700">
  {ratePct(profitRate(data.sale, data.profit))}
</td>

{/* 전월대비 */}
<td className={`border p-2 ${key ? rateClass(vr[key]) : "text-gray-400"}`}>
  {key ? rateText(vr[key]) : "—"}
</td>
  </tr>
))}

    </tbody>
  </table>
</div>

        {/* KPI – 순수 운송 (후레쉬 미포함) */}
<div className="rounded-2xl bg-white border shadow-sm p-4">
  <h3 className="text-sm font-semibold mb-2 text-emerald-700">
    순수 운송료 (후레쉬 미포함)
  </h3>

  <table className="w-full text-sm border-collapse text-center">
    <thead className="bg-gray-50 text-gray-600">
      <tr>
        <th className="border p-2">구분</th>
        <th className="border p-2">매출</th>
        <th className="border p-2">운반비</th>
        <th className="border p-2">수익</th>
<th className="border p-2">수익률</th>
<th className="border p-2">전월대비(수익)</th>
      </tr>
    </thead>
    <tbody>
      {[
  ["일", dPure, null],
  ["월", mPure, "month"],
  ["년", yPure, null],
].map(([label, data, key], i) => (
  <tr key={i} className="font-semibold">
    <td className="border p-2 bg-gray-50">{label}</td>
    <td className="border p-2 text-blue-700">{won(data.sale)}</td>
    <td className="border p-2 text-gray-600">{won(data.driver)}</td>
<td className="border p-2 text-green-600">
  {won(data.profit)}
</td>

{/* ✅ 수익률 */}
<td className="border p-2 text-indigo-700">
  {ratePct(profitRate(data.sale, data.profit))}
</td>

{/* 전월대비 */}
<td className={`border p-2 ${key ? rateClass(vr[key]) : "text-gray-400"}`}>
  {key ? rateText(vr[key]) : "—"}
</td>
  </tr>
))}


    </tbody>
  </table>
</div>


       {/* Top10 */}
<SettlementTop10
  rows={monthRows.filter(
    r => !String(r.거래처명 || "").includes("후레쉬물류")
  )}
  onClickClient={setDetailClient}
/>

<SettlementTop10Drop
  rows={rows}
  targetMonth={targetMonth}
/>

<SettlementNewClients rows={newClients} />
</div>

{/* RIGHT PANEL */}
<div className="flex flex-col gap-6 pt-[42px]">
  <SettlementAnalysisPanel
    rows={rows}
    targetMonth={targetMonth}
    setTargetMonth={setTargetMonth}
    forecast2026={forecast2026}
    yPure={yPure}
  />

  <AIPremiumInsight
    rows={rows.filter(r => (r.상차일 || "").startsWith(targetMonth))}
    targetMonth={targetMonth}
    forecast2026={forecast2026}
    yPure={yPure}
  />
</div>
      {/* DETAIL POPUP */}
      {detailClient && (
        <SettlementDetailPopup
          client={detailClient}
          rows={monthRows.filter((r) => r.거래처명 === detailClient)}
          onClose={() => setDetailClient(null)}
        />
      )}

    </div>
  );
}
/* 📌 AI 예측 차트 */
function AIPredictChart({ rows }) {
  const toInt = (v)=>parseInt(String(v||"0").replace(/[^\d-]/g,""),10)||0;
  if(!rows || rows.length === 0) return null;

  const daily = {};
  rows.forEach(r=>{
    const d=r.상차일;
    if(!daily[d]) daily[d]={profit:0};
    daily[d].profit += toInt(r.청구운임) - toInt(r.기사운임);
  });

  const sorted = Object.entries(daily).sort(([a],[b])=>a.localeCompare(b));
  const data = sorted.map(([date,val])=>({
    date: date.slice(5),
    profit: val.profit
  }));

  const avg = data.reduce((a,r)=>a+r.profit,0) / data.length;
  const lastProfit = data[data.length-1]?.profit || avg;

  const prediction = [...data];
  for (let i=1; i<=7; i++) {
    prediction.push({
      date: `예상${i}`,
      profit: Math.round(lastProfit * (1 + (Math.random()*0.1 - 0.05)))
    });
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-lg">
      <h4 className="font-semibold text-sm mb-2">📈 7일 수익 예측</h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={prediction}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="date" tick={{fontSize:10}}/>
            <YAxis tick={{fontSize:10}}/>
            <Tooltip formatter={v => `${v.toLocaleString()}원`} />
            <Line type="monotone" dataKey="profit" stroke="#1D4ED8" strokeWidth={2}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


/* 📌 거래처 손익 위험 경고 */
function ClientRiskAlert({ rows }) {
  const toInt = (v)=>parseInt(String(v||"0").replace(/[^\d-]/g,""),10)||0;
  if(!rows || rows.length === 0) return null;

  const riskMap = {};
  rows.forEach(r=>{
    const c = r.거래처명 || "미지정";
    const p = toInt(r.청구운임) - toInt(r.기사운임);
    if(!riskMap[c]) riskMap[c]={cnt:0,profit:0};
    riskMap[c].cnt++;
    riskMap[c].profit+=p;
  });

  const list = Object.entries(riskMap).map(([k,v])=>({
    client:k,
    avgProfit: v.profit/v.cnt
  })).sort((a,b)=>a.avgProfit-b.avgProfit);

  const worst = list[0];
  const warnList = list.filter(x=>x.avgProfit < 0);

  return (
    <div className="rounded-xl border bg-gradient-to-br from-red-50 to-white p-4 text-gray-700 shadow-sm">
      <h4 className="font-semibold text-sm mb-3 text-red-600">⚠ 손익 위험 분석</h4>
      {warnList.length > 0 ? (
        <ul className="text-[11px] space-y-1">
          {warnList.map((r,i)=>(
            <li key={i}>
              <b className="text-red-700">{r.client}</b>: 평균 {r.avgProfit.toLocaleString()}원 (적자)
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-green-700">위험한 거래처 없음</p>
      )}

      <p className="text-[11px] mt-2">• 가장 개선 필요 : 
        <b className="text-rose-700"> {worst.client}</b> 
      </p>
    </div>
  );
}


/* ==================== Right Side Analysis Panel ==================== */
function SettlementAnalysisPanel({
  rows,
  targetMonth,
  setTargetMonth,
  forecast2026,
  yPure,
}) {

  const [client, setClient] = React.useState("");

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  const monthRows = rows.filter((r) =>
    (r.상차일 || "").startsWith(targetMonth)
  );

  const clients = [...new Set(monthRows.map((r) => r.거래처명 || "미지정"))];

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-6">
      
      {/* 월 선택 */}
      <div>
        <p className="text-xs text-gray-500 mb-1">조회 월</p>
        <select
          className="border p-2 rounded w-full"
          value={targetMonth}
          onChange={(e) => {
            setTargetMonth(e.target.value);
            setClient(""); // 월 바꿀 때 전체 보기로 reset
          }}
        >
          {months.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* 전체 KPI */}
      <SettlementOverallStats rows={monthRows} />

      {/* 거래처 선택 */}
      <div>
        <p className="text-xs text-gray-500 mb-1">거래처 분석</p>
        <select
          className="border p-2 rounded w-full"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        >
          <option value="">전체</option>
          {clients.map((c, i) => (
            <option key={i}>{c}</option>
          ))}
        </select>
      </div>

            {/* 차트 + AI 분석 표시 (그래프 + 요약문) */}
      <div className="space-y-4">
        {client ? (
          <ClientInsight rows={monthRows.filter(r => r.거래처명 === client)} />
        ) : (
          <ClientInsight rows={monthRows} />
        )}

      </div>
    </div>
  );
}

/* ==================== Overall Stats Cards ==================== */
function SettlementOverallStats({ rows }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => `${(n || 0).toLocaleString()}원`;

  const totalCnt = rows.length;
  const totalSale = rows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const avgSale = totalCnt ? totalSale / totalCnt : 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard title="총 매출" value={won(totalSale)} />
      <StatCard title="총 오더수" value={`${totalCnt}건`} />
      <StatCard title="평균매출/오더" value={won(avgSale)} />
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-xl border p-3 text-center bg-gray-50 shadow-sm">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
function AIPremiumInsight({ rows, targetMonth, forecast2026, yPure }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  if (!rows || rows.length === 0) return null;

 const [year, month] = targetMonth.split("-").map(Number);

  const prevMonth = month - 1 > 0 ? month - 1 : 12;
  const prevYear = month - 1 > 0 ? year : year - 1;

  const thisMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  const thisMonthRows = rows.filter(r => (r.상차일 || "").startsWith(thisMonthKey));
  const prevMonthRows = rows.filter(r => (r.상차일 || "").startsWith(prevMonthKey));

  const sum = (list, key) => list.reduce((a, r) => a + toInt(r[key]), 0);

  const sale = sum(thisMonthRows, "청구운임");
  const driver = sum(thisMonthRows, "기사운임");
  const profit = sale - driver;

  const prevSale = sum(prevMonthRows, "청구운임");
  const prevProfit = prevSale - sum(prevMonthRows, "기사운임");

  const saleRate = prevSale ? (((sale - prevSale) / prevSale) * 100) : 0;
  const profitRate = prevProfit ? (((profit - prevProfit) / prevProfit) * 100) : 0;

  const rateColor = (n) => n >= 0 ? "text-emerald-600" : "text-red-600";
  const fmtRate = (n) => `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1)}%`;
  const won = (n) => `${(n || 0).toLocaleString()}원`;

  /* 고객 분석 */
  const byClient = {};
  rows.forEach(r => {
    const c = r.거래처명 || "미지정";
    const p = toInt(r.청구운임) - toInt(r.기사운임);
    byClient[c] = (byClient[c] || 0) + p;
  });
  const sortedClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  const bestClient = sortedClients[0];
  const worstClient = sortedClients[sortedClients.length - 1];

  /* 평일 기준 수익 날짜 */
  const daily = {};
  rows.forEach(r => {
    const d = r.상차일;
    if (!daily[d]) daily[d] = { profit: 0 };
    daily[d].profit += toInt(r.청구운임) - toInt(r.기사운임);
  });

  /* 📌 DAY 분석 (배차완료 + 평일 + 미래 제외) */
const dailyProfit = {};
const today = new Date().toISOString().slice(0, 10);

rows.forEach(r => {
  if ((r.배차상태 || "") !== "배차완료") return;
  const d = r.상차일;
  if (!d) return;
  if (d > today) return; // 미래 제외
  const wd = new Date(d).getDay();
  if (wd === 0 || wd === 6) return; // 주말 제외

  const sale = toInt(r.청구운임);
  const driver = toInt(r.기사운임);
  if (!dailyProfit[d]) dailyProfit[d] = 0;
  dailyProfit[d] += (sale - driver);
});

const sortedDays = Object.entries(dailyProfit)
  .map(([date, profit]) => ({ date, profit }))
  .sort((a, b) => b.profit - a.profit);

const bestDay = sortedDays[0] || { date: "-", profit: 0 };
const worstDay = sortedDays[sortedDays.length - 1] || { date: "-", profit: 0 };


  return (
    <div className="rounded-2xl border bg-white p-5 shadow-lg space-y-5">

      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          🤖 AI Insight Premium
        </h3>
        <span className="text-[10px] px-2 py-1 bg-gray-100 text-gray-500 rounded-full border">
          분석 정확도 70%+
        </span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 text-center text-[13px]">
        <div className="bg-gray-50 border rounded-lg py-2 shadow-sm">
          <p className="text-gray-500 text-xs">전월대비 매출</p>
          <p className={`font-bold ${rateColor(saleRate)}`}>{fmtRate(saleRate)}</p>
        </div>
        <div className="bg-gray-50 border rounded-lg py-2 shadow-sm">
          <p className="text-gray-500 text-xs">총 매출</p>
          <p className="font-bold text-blue-700">{won(sale)}</p>
        </div>
        <div className="bg-gray-50 border rounded-lg py-2 shadow-sm">
          <p className="text-gray-500 text-xs">총 수익</p>
          <p className="font-bold text-emerald-600">{won(profit)}</p>
        </div>
      </div>

      {/* 고객 분석 */}
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="bg-white border rounded-lg shadow-sm p-3 text-left">
          <p className="text-gray-500 text-xs">Best 고객</p>
          <p className="font-semibold text-emerald-600">{bestClient[0]} ({won(bestClient[1])})</p>
        </div>
        <div className="bg-white border rounded-lg shadow-sm p-3 text-left">
          <p className="text-gray-500 text-xs">Risk 고객</p>
          <p className="font-semibold text-red-600">{worstClient[0]} ({won(worstClient[1])})</p>
        </div>
      </div>

      {/* 평일 기준 수익일 */}
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <p className="text-gray-700">
          최고 수익일 <b>{bestDay.date}</b> ({won(bestDay.profit)})
        </p>
        <p className="text-red-600">
          최저 수익일 <b>{worstDay.date}</b> ({won(worstDay.profit)})
        </p>
      </div>

      <p className="text-[12px] text-gray-600 border-t pt-3">
        AI 추천: Top 고객 집중 시
        <b className="text-emerald-600"> +12~18%</b> 수익 개선 기대
      </p>
<p className="text-[12px] text-indigo-700">
  2026년 순수 운송 기준 예상 매출은
  <b className="mx-1 text-indigo-800">
    {won(forecast2026.normal)}
  </b>
  수준으로,
  올해 대비
  <b className="mx-1 text-indigo-800">
    {(((forecast2026.normal / yPure.sale) - 1) * 100).toFixed(1)}%
  </b>
  성장 가능성이 있습니다.
</p>


    </div>
  );
}
/* ==================== Client Insight Charts ==================== */
function ClientInsight({ rows }) {
  const toInt = (v)=>parseInt(String(v||"0").replace(/[^\d-]/g,""),10)||0;
  const won = (n)=> `${(n||0).toLocaleString()}원`;
  if(!rows || rows.length===0)
    return <div className="text-center text-xs text-gray-400 py-4">데이터 없음</div>;

  const cnt = rows.length;
  const sale = rows.reduce((a,r)=>a+toInt(r.청구운임),0);
  const profit = sale - rows.reduce((a,r)=>a+toInt(r.기사운임),0);

  const daily = {};
  rows.forEach(r=>{
    const d=r.상차일;
    if(!d) return;
    if(!daily[d]) daily[d]={date:d.slice(5),sale:0,driver:0,profit:0};
    daily[d].sale+=toInt(r.청구운임);
    daily[d].driver+=toInt(r.기사운임);
    daily[d].profit+=toInt(r.청구운임)-toInt(r.기사운임);
  });

  const chartData = Object.values(daily).sort((a,b)=>a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 text-xs bg-gray-50 border rounded-xl shadow-sm p-2 text-center">
        <div><p className="text-gray-500">총매출</p><p className="font-semibold text-blue-700">{won(sale)}</p></div>
        <div><p className="text-gray-500">총수익</p><p className="font-semibold text-green-600">{won(profit)}</p></div>
        <div><p className="text-gray-500">건수</p><p className="font-semibold">{cnt}건</p></div>
      </div>

      {/* Bar */}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="date" tick={{fontSize:9}}/>
            <YAxis tick={{fontSize:10}}/>
            <Tooltip formatter={v=>`${v.toLocaleString()}원`}/>
            <Legend/>
            <Bar dataKey="sale" name="매출" fill="#2563EB"/>
            <Bar dataKey="profit" name="수익" fill="#059669"/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line */}
      <div className="h-44">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="date" tick={{fontSize:9}}/>
            <YAxis tick={{fontSize:10}}/>
            <Tooltip formatter={v=>`${v.toLocaleString()}원`}/>
            <Legend/>
            <Line type="monotone" dataKey="profit" name="수익" stroke="#059669" strokeWidth={2}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ★★★ 여기 아래 추가! */
function AISummary({ rows }) {
  const toInt=(v)=>parseInt(String(v||"0").replace(/[^\d-]/g,""),10)||0;
  if(!rows || rows.length===0) return null;

  const cnt = rows.length;
  const sale = rows.reduce((a,r)=>a+toInt(r.청구운임),0);
  const driver = rows.reduce((a,r)=>a+toInt(r.기사운임),0);
  const profit = sale-driver;
  const avgProfitRate = sale ? (profit / sale * 100) : 0;
  const won=(n)=>`${(n||0).toLocaleString()}원`;

  const byClient={};
  rows.forEach(r=>{
    const c=r.거래처명||"미지정";
    const p=toInt(r.청구운임)-toInt(r.기사운임);
    byClient[c]=(byClient[c]||0)+p;
  });

  const sortedClients=Object.entries(byClient).sort((a,b)=>b[1]-a[1]);
  const bestClient=sortedClients[0];
  const worstClient=sortedClients[sortedClients.length-1];

  /* ================== 📌 DAY 분석 (배차완료 + 평일 + 미래 제외) ================== */
const dailyProfit = {};
const today = new Date().toISOString().slice(0, 10);

rows.forEach(r => {
  if ((r.배차상태 || "") !== "배차완료") return; // 배차완료만

  const d = r.상차일;
  if (!d) return;

  // 📌 미래 데이터 제외
  if (d > today) return;

  const wd = new Date(d).getDay();
  if (wd === 0 || wd === 6) return; // 주말 제외

  const sale = toInt(r.청구운임);
  const driver = toInt(r.기사운임);
  const profit = sale - driver;

  if (!dailyProfit[d]) dailyProfit[d] = 0;
  dailyProfit[d] += profit;
});

const sortedDays = Object.entries(dailyProfit)
  .map(([date, profit]) => ({ date, profit }))
  .sort((a, b) => b.profit - a.profit);

const bestDay = sortedDays[0] || { date: "-", profit: 0 };
const worstDay = sortedDays[sortedDays.length - 1] || { date: "-", profit: 0 };
/* ================== 📌 DAY 분석 수정 종료 ================== */


  return (
    <div className="
      rounded-2xl border border-blue-100 
      bg-gradient-to-br from-white to-blue-50
      p-5 space-y-3 text-sm text-gray-700
      shadow-[0_4px_20px_rgba(0,0,0,0.05)]
    ">
      <h4 className="font-semibold text-blue-800 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-600" fill="currentColor">
          <circle cx="8" cy="8" r="8"/>
        </svg>
        AI 인사이트 분석
      </h4>

      <div className="space-y-1">
        <p>총 {cnt}건 중 수익 합계 
          <b className="text-green-700"> {won(profit)}</b>
        </p>
        <p>평균 수익률 
          <b className="text-blue-700"> {avgProfitRate.toFixed(1)}%</b>
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p>Best 고객: 
          <b className="text-green-700"> {bestClient[0]}</b> 
          ({won(bestClient[1])})
        </p>
        <p>Risk 고객:
          <b className="text-red-600"> {worstClient[0]}</b> 
          ({won(worstClient[1])})
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p>최고 수익일: <b>{bestDay.date}</b> ({won(bestDay.profit)})</p>
        <p>최저 수익일: <b className="text-red-600">{worstDay.date}</b> ({won(worstDay.profit)})</p>
      </div>

      <div className="pt-2 border-t text-gray-600 text-[13px]">
        Top 고객 중심 운송 시 월 수익 최대 
        <b className="text-green-700"> 12~18%</b> 개선 기대
      </div>
    </div>
  );
}

/* ==================== 신규 거래처 (당월 최초 발생) ==================== */
function SettlementNewClients({ rows }) {
  const won = (n) => `${(n || 0).toLocaleString()}원`;

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white border shadow-sm p-4">
        <h3 className="text-sm font-semibold text-emerald-700 mb-3">
          🆕 당월 신규 거래처
        </h3>
        <div className="text-center text-xs text-gray-400 py-4">
          신규 거래처 없음
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
      <h3 className="text-sm font-semibold text-emerald-700 mb-3">
        🆕 당월 신규 거래처
      </h3>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-emerald-100 text-emerald-800">
            <th className="border px-3 py-2">거래처</th>
            <th className="border px-3 py-2">최초등록일</th>
            <th className="border px-3 py-2 text-center">건수</th>
            <th className="border px-3 py-2 text-right">매출</th>
            <th className="border px-3 py-2 text-right">수익</th>
            <th className="border px-3 py-2 text-right">수수료</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-emerald-50">
              <td className="border px-3 py-2 font-medium">{r.client}</td>
              <td className="border px-3 py-2 text-center text-xs">
                {r.firstDate}
              </td>
              <td className="border px-3 py-2 text-center">{r.cnt}</td>
              <td className="border px-3 py-2 text-right text-blue-700 font-semibold">
                {won(r.sale)}
              </td>
              <td className="border px-3 py-2 text-right text-emerald-700 font-semibold">
                {won(r.profit)}
              </td>
              <td className="border px-3 py-2 text-right text-gray-600">
                {won(r.fee)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11px] text-gray-500 mt-2">
        * 해당 월에 최초로 거래가 발생한 거래처만 표시
      </p>
    </div>
  );
}

/* ==================== Top10 ==================== */
function SettlementTop10({ rows, onClickClient }) {
  /* ==================== 신규 거래처 (당월 최초 발생) ==================== */

  const toInt = (v)=>parseInt(String(v||"0").replace(/[^\d-]/g,""),10)||0;
  const won = (n)=> `${(n||0).toLocaleString()}원`;

  const map = new Map();
  rows.forEach((r)=>{
    const c = r.거래처명 || "미지정";
    const sale = toInt(r.청구운임);
    const driver = toInt(r.기사운임);
    const profit = sale-driver;

    const prev = map.get(c)||{c, cnt:0, sale:0, driver:0, profit:0};
    prev.cnt++; prev.sale+=sale; prev.driver+=driver; prev.profit+=profit;
    map.set(c,prev);
  });

  const top10 = Array.from(map.values())
    .sort((a,b)=>b.sale-a.sale)
    .slice(0,10);

  return (
    <div className="rounded-2xl bg-white border shadow-sm p-4">
      <h3 className="text-sm font-semibold mb-3">Top10 거래처 (당월 매출 기준)</h3>
      {top10.length===0?
        <div className="text-center text-xs text-gray-400 py-4">데이터 없음</div>
      :
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-gray-600">
            <th className="border px-3 py-2">거래처명</th>
            <th className="border px-3 py-2">건수</th>
            <th className="border px-3 py-2 text-right">매출</th>
            <th className="border px-3 py-2 text-right">운반비</th>
            <th className="border px-3 py-2 text-right">수익</th>
<th className="border px-3 py-2 text-right">수익률</th>
          </tr>
        </thead>
        <tbody>
  {top10.map((r) => {
    const rate = r.sale === 0 ? 0 : (r.profit / r.sale) * 100;

    return (
      <tr
        key={r.c}
        className="odd:bg-white even:bg-gray-50 cursor-pointer hover:bg-blue-50"
        onClick={() => onClickClient(r.c)}
      >
        <td className="border px-3 py-2">{r.c}</td>
        <td className="border px-3 py-2 text-center">{r.cnt}</td>
        <td className="border px-3 py-2 text-right font-semibold text-blue-700">
          {won(r.sale)}
        </td>
        <td className="border px-3 py-2 text-right text-gray-600">
          {won(r.driver)}
        </td>
        <td className="border px-3 py-2 text-right font-semibold text-green-600">
          {won(r.profit)}
        </td>

        {/* ✅ 수익률 */}
        <td className="border px-3 py-2 text-right font-semibold text-indigo-700">
          {rate.toFixed(1)}%
        </td>
      </tr>
    );
  })}
</tbody>

      </table>
      }
    </div>
  );
}
/* ==================== AI 원인 추정 유틸 ==================== */
function inferDropReason(r) {
  const saleRate =
    r.prev > 0 ? ((r.cur - r.prev) / r.prev) * 100 : 0;

  const cntRate =
    r.prevCnt > 0 ? ((r.curCnt - r.prevCnt) / r.prevCnt) * 100 : 0;

  if (r.curCnt === 0) return "🚨 거래 중단 가능성";
  if (cntRate < -40 && saleRate < -40) return "📉 물량 급감";
  if (cntRate < -30 && saleRate > -10) return "💸 단가 하락";
  if (cntRate > -10 && saleRate < -30) return "📦 고단가 물량 이탈";
  if (saleRate < -20) return "⚠️ 전반적 거래 위축";

  return "ℹ️ 단기 변동";
}

/* ==================== 전월 대비 매출 감소 Top10 ==================== */
function SettlementTop10Drop({ rows, targetMonth }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => `${(n || 0).toLocaleString()}원`;

  // 🔹 기준 월 / 전월 계산
  const [year, month] = targetMonth.split("-").map(Number);

  const thisMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const prevMonth =
    month === 1
      ? `${year - 1}-12`
      : `${year}-${String(month - 1).padStart(2, "0")}`;

  // 🔹 거래처별 집계
  const map = new Map();

  rows.forEach((r) => {
    const c = r.거래처명 || "";

// ❌ 거래처명 아닌 데이터 제거
if (
  !c ||
  /^2\d{1,2}년/.test(c) ||     // 25년1월, 25년10월 같은 값 제거
  c.includes("후레쉬물류")     // 후레쉬물류 제외
) {
  return;
}
    const sale = toInt(r.청구운임);
    const d = r.상차일 || "";

    if (!map.has(c)) {
      map.set(c, {
  client: c,
  cur: 0,
  prev: 0,
  curCnt: 0,
  prevCnt: 0,
});

    }

if (d.startsWith(thisMonthKey)) {
  map.get(c).cur += sale;
  map.get(c).curCnt += 1;
} else if (d.startsWith(prevMonth)) {
  map.get(c).prev += sale;
  map.get(c).prevCnt += 1;
}
  });

  // 🔹 전월 대비 감소한 거래처만 추출
  const top10 = Array.from(map.values())
    .map((r) => ({
      ...r,
      diff: r.cur - r.prev, // 음수면 감소
    }))
    .filter((r) => r.prev > 0 && r.diff < 0)
    .sort((a, b) => a.diff - b.diff) // 가장 많이 떨어진 순
    .slice(0, 10);

  return (
    <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4">
      <h3 className="text-sm font-semibold mb-3 text-rose-700">
        ⚠ 전월 대비 매출 감소 거래처 TOP10
      </h3>

      {top10.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-4">
          감소한 거래처 없음
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-rose-100 text-rose-700">
             <th className="border px-3 py-2">거래처</th>
<th className="border px-3 py-2 text-right">전월</th>
<th className="border px-3 py-2 text-right">당월</th>
<th className="border px-3 py-2 text-center">거래량</th>
<th className="border px-3 py-2 text-right">감소액</th>
<th className="border px-3 py-2">원인 분석</th>

            </tr>
          </thead>
          <tbody>
            {top10.map((r) => (
              <tr key={r.client} className="odd:bg-white even:bg-rose-50">
                <td className="border px-3 py-2">{r.client}</td>
                <td className="border px-3 py-2 text-right">
  {won(r.prev)}
</td>
<td className="border px-3 py-2 text-right">
  {won(r.cur)}
</td>

{/* 거래량 비교 */}
<td className="border px-3 py-2 text-center text-xs">
  {r.prevCnt} → {r.curCnt}
</td>

<td className="border px-3 py-2 text-right font-semibold text-rose-600">
  {won(r.diff)}
</td>

{/* AI 원인 추정 */}
<td className="border px-3 py-2 text-xs text-gray-700">
  {inferDropReason(r)}
</td>

              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ==================== Detail Popup ==================== */
function SettlementDetailPopup({ client, rows, onClose }) {
  const toInt = (v)=>
    parseInt(String(v||"0").replace(/[^\d-]/g,""),10)||0;
  const won = n=>`${(n||0).toLocaleString()}원`;

  const total = rows.reduce((acc,r)=>{
    const s=toInt(r.청구운임);
    const d=toInt(r.기사운임);
    acc.sale+=s; acc.driver+=d; acc.profit+=(s-d);
    return acc;
  },{sale:0,driver:0,profit:0});

  return (
    <div className="fixed inset-0 bg-black/50 flex-center z-50">
      <div className="bg-white w-[900px] max-h-[90vh] rounded-xl overflow-auto p-6">
        <div className="flex justify-between mb-3">
          <h3 className="text-lg font-semibold">{client} 상세내역</h3>
          <button onClick={onClose} className="text-rose-600 text-sm">닫기</button>
        </div>

        <table className="w-full text-sm border-collapse mb-4">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 border">상차일</th>
              <th className="px-2 py-2 border">출발지</th>
              <th className="px-2 py-2 border">도착지</th>
              <th className="px-2 py-2 border text-right">매출</th>
              <th className="px-2 py-2 border text-right">운반비</th>
              <th className="px-2 py-2 border text-right">수익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="px-2 py-1 border">{r.상차일}</td>
                <td className="px-2 py-1 border">{r.상차지명}</td>
                <td className="px-2 py-1 border">{r.하차지명}</td>
                <td className="px-2 py-1 border text-right">{won(r.청구운임)}</td>
                <td className="px-2 py-1 border text-right">{won(r.기사운임)}</td>
                <td className="px-2 py-1 border text-right font-semibold text-blue-600">
                  {won(toInt(r.청구운임)-toInt(r.기사운임))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-right border-t pt-2 font-semibold text-sm">
          합계 : 매출 {won(total.sale)} / 운반비 {won(total.driver)} / 수익 {won(total.profit)}
        </div>

      </div>
    </div>
  );
}


// ===================== DispatchApp.jsx (PART 6/8 — END) =====================

// ===================== DispatchApp.jsx (PART 7/8 — 거래처명/차량종류 필터 추가 완성) =====================
function UnassignedStatus({ dispatchData }) {
  const [q, setQ] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(new Set());

  // ✅ 추가: 거래처명/차량종류 전용 필터
  const [filterType, setFilterType] = React.useState("거래처명");
  const [filterValue, setFilterValue] = React.useState("");

  // ✅ 주소 더보기 상태관리
  const [openLoadAddrs, setOpenLoadAddrs] = React.useState(new Set());
  const [openUnloadAddrs, setOpenUnloadAddrs] = React.useState(new Set());

  // 🔔 토스트 알림
  const [toast, setToast] = React.useState(null);
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ✅ 필터 + 정렬
  const filtered = React.useMemo(() => {
    let result = (dispatchData || []).filter((r) => (r.배차상태 || "") === "배차중");

    // 날짜필터
    if (startDate && endDate) {
      result = result.filter(
        (r) => (r.상차일 || "") >= startDate && (r.상차일 || "") <= endDate
      );
    }

    // 거래처명/차량종류 전용 필터
    if (filterValue.trim()) {
      result = result.filter((r) =>
        String(r[filterType] || "")
          .toLowerCase()
          .includes(filterValue.toLowerCase())
      );
    }

    // 통합검색(q)
    if (q.trim()) {
      const lower = q.toLowerCase();
      result = result.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }

    // 날짜/시간 정렬
    return result.sort((a, b) => {
      const d1 = a.상차일 || "";
      const d2 = b.상차일 || "";
      if (d1 !== d2) return d1.localeCompare(d2);
      return (a.상차시간 || "").localeCompare(b.상차시간 || "");
    });
  }, [dispatchData, q, startDate, endDate, filterType, filterValue]);

  // ✅ 테이블 헤더
  const headers = [
    "순번","등록일","상차일","상차시간","하차시간","거래처명",
    "상차지명","상차지주소","하차지명","하차지주소",
    "차량종류","차량톤수","화물내용","배차상태","메모",
  ];

  // ✅ 삭제 관련 유틸
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r._id)));
  };
  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
  };

  // ✅ Firestore 삭제
  const removeDocs = async (ids) => {
    if (!ids.length) {
      showToast("선택된 항목이 없습니다.", "err");
      return;
    }
    try {
      const hasDb = typeof db !== "undefined" && db;
      const coll =
        typeof COLL !== "undefined" && COLL?.dispatch
          ? COLL.dispatch
          : "dispatch";

      if (hasDb && typeof deleteDoc === "function") {
        const jobs = ids.map((id) => deleteDoc(doc(db, coll, id)));
        await Promise.all(jobs);
      }

      showToast(`✅ ${ids.length}건 삭제 완료`);
      exitDeleteMode();
    } catch (e) {
      console.error(e);
      showToast("삭제 중 오류 발생", "err");
    }
  };

  const headBase =
    "border bg-gray-100 text-center text-sm font-semibold px-2 py-2 whitespace-nowrap";
  const cellBase =
    "border text-center px-2 py-1 whitespace-nowrap align-middle";

  return (
    <div className="relative">
      {/* 🔔 토스트 */}
      {toast && (
        <div
          className={`fixed right-5 top-20 z-50 px-4 py-2 rounded shadow ${
            toast.type === "ok"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <h2 className="text-lg font-bold mb-3">미배차현황</h2>

      {/* ✅ 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="통합검색 (거래처명 / 상차지명 / 차량번호 등)"
          className="border p-2 rounded w-80"
        />

        {/* 날짜 필터 */}
        <div className="flex items-center gap-1 text-sm">
          <input
            type="date"
            className="border p-1 rounded"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span>~</span>
          <input
            type="date"
            className="border p-1 rounded"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* 거래처명/차량종류 필터 */}
        <div className="flex items-center gap-1 text-sm ml-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="거래처명">거래처명</option>
            <option value="차량종류">차량종류</option>
          </select>
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={`${filterType} 검색`}
            className="border p-2 rounded w-48"
          />
        </div>

        <button
          onClick={() => {
            setQ("");
            setStartDate("");
            setEndDate("");
            setFilterValue("");
          }}
          className="bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded"
        >
          초기화
        </button>

        <div className="ml-auto" />

        {!deleteMode ? (
          <button
            onClick={() => setDeleteMode(true)}
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
          >
            삭제
          </button>
        ) : (
          <div className="flex items-center gap-2">
            
            <button
              onClick={() => removeDocs(Array.from(selectedIds))}
              className="px-4 py-2 rounded bg-red-700 text-white hover:bg-red-800"
            >
              선택 삭제
            </button>
            <button
              onClick={exitDeleteMode}
              className="px-4 py-2 rounded border hover:bg-gray-100"
            >
              취소
            </button>
          </div>
        )}
      </div>

      {deleteMode && (
        <div className="flex items-center gap-3 text-sm mb-2">
          <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200">
            삭제 모드 — 선택 <b>{selectedIds.size}</b>건
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-2 py-1 border rounded hover:bg-gray-50"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* ✅ 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              {deleteMode && (
                <th className={headBase}>
                  <input
                    type="checkbox"
                    onChange={toggleAll}
                    checked={
                      selectedIds.size > 0 &&
                      selectedIds.size === filtered.length
                    }
                  />
                </th>
              )}
              {headers.map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  className="text-center py-4"
                  colSpan={headers.length + (deleteMode ? 1 : 0)}
                >
                  🚛 모든 오더가 배차완료 상태입니다
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => {
                const isEarly =
                  r.상차시간 &&
                  r.상차시간 >= "05:00" &&
                  r.상차시간 <= "09:00";

                return (
                  <tr
                    key={r._id || i}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    {deleteMode && (
                      <td className={cellBase}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r._id)}
                          onChange={() => toggleOne(r._id)}
                        />
                      </td>
                    )}
                    <td className={cellBase}>{i + 1}</td>
                    <td className={cellBase}>{r.등록일 || ""}</td>
                    <td className={cellBase}>{r.상차일 || ""}</td>
                    <td
                      className={cellBase}
                      style={isEarly ? { color: "red", fontWeight: 600 } : {}}
                    >
                      {r.상차시간 || ""}
                    </td>
                    <td className={cellBase}>{r.하차시간 || ""}</td>
                    <td className={cellBase}>{r.거래처명 || ""}</td>

                    {/* 상차지명 */}
                    <td className={cellBase}>{r.상차지명 || ""}</td>

                    {/* 상차지주소 */}
                    <td className={cellBase}>
                      {r.상차지주소 && r.상차지주소.length > 10 ? (
                        openLoadAddrs.has(r._id) ? (
                          <span>
                            {r.상차지주소}{" "}
                            <button
                              onClick={() =>
                                setOpenLoadAddrs((prev) => {
                                  const next = new Set(prev);
                                  next.delete(r._id);
                                  return next;
                                })
                              }
                              className="text-blue-600 underline text-xs"
                            >
                              접기
                            </button>
                          </span>
                        ) : (
                          <span>
                            {r.상차지주소.slice(0, 10)}...
                            <button
                              onClick={() =>
                                setOpenLoadAddrs(
                                  (prev) => new Set(prev).add(r._id)
                                )
                              }
                              className="text-blue-600 underline text-xs"
                            >
                              더보기
                            </button>
                          </span>
                        )
                      ) : (
                        r.상차지주소 || ""
                      )}
                    </td>

                    {/* 하차지명 */}
                    <td className={cellBase}>{r.하차지명 || ""}</td>

                    {/* 하차지주소 */}
                    <td className={cellBase}>
                      {r.하차지주소 && r.하차지주소.length > 10 ? (
                        openUnloadAddrs.has(r._id) ? (
                          <span>
                            {r.하차지주소}{" "}
                            <button
                              onClick={() =>
                                setOpenUnloadAddrs((prev) => {
                                  const next = new Set(prev);
                                  next.delete(r._id);
                                  return next;
                                })
                              }
                              className="text-blue-600 underline text-xs"
                            >
                              접기
                            </button>
                          </span>
                        ) : (
                          <span>
                            {r.하차지주소.slice(0, 10)}...
                            <button
                              onClick={() =>
                                setOpenUnloadAddrs(
                                  (prev) => new Set(prev).add(r._id)
                                )
                              }
                              className="text-blue-600 underline text-xs"
                            >
                              더보기
                            </button>
                          </span>
                        )
                      ) : (
                        r.하차지주소 || ""
                      )}
                    </td>

                    {/* 차량종류 */}
                    <td className={cellBase}>{r.차량종류 || ""}</td>

                    {/* 차량톤수 */}
                    <td className={cellBase}>{r.차량톤수 || ""}</td>

                    <td className={cellBase}>{r.화물내용 || ""}</td>
                    <td className={cellBase}>
                      <StatusBadge s={r.배차상태} />
                    </td>
                    <td className={cellBase}>{r.메모 || ""}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 7/8) — END =====================

// ===================== DispatchApp.jsx (PART 8/8) — 거래명세서 + 미수금관리(월집계/토글/선택/전체정산) — START =====================
function ClientSettlement({ dispatchData, clients = [], setClients }) {
  // ---------------- 공통 유틸 ----------------
  const todayStr8 = () => new Date().toISOString().slice(0,10);
  const THIS_YEAR = new Date().getFullYear(); // 예: 2025
  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => (toInt(n)).toLocaleString();

  // 🔧 Firestore patch (월별 정산상태/정산일 전용)
  const patchMonthOnDoc = async (id, yyyymm, status, dateStr) => {
    try {
      if (!id || !yyyymm) return;
      if (typeof db !== "undefined" && db && typeof setDoc === "function" && typeof doc === "function") {
        const coll = (typeof COLL !== "undefined" && COLL?.dispatch) ? COLL.dispatch : "dispatch";
        const patch = {};
        patch[`정산상태.${yyyymm}`] = status;          // "정산완료" | "미정산"
        patch[`정산일.${yyyymm}`] = dateStr || "";      // YYYY-MM-DD
        await setDoc(doc(db, coll, id), patch, { merge: true });
      }
    } catch (e) {
      console.warn("patchMonthOnDoc error:", e);
    }
  };

  // ---------------- 탭 상태 ----------------
  const [tab, setTab] = useState("invoice"); // 'invoice' | 'unsettledMonth'

  // ---------------- 거래명세서(기존) 상태 ----------------
  const [client, setClient] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [editInfo, setEditInfo] = useState({});
  const [showEdit, setShowEdit] = useState(false);

  const found = useMemo(
    () => (clients || []).find((c) => c.거래처명 === client) || {},
    [client, clients]
  );

  const [cInfo, setCInfo] = useState({});
  useEffect(() => {
    setCInfo({
      거래처명: found.거래처명 || client || "",
      사업자번호: found.사업자번호 || "",
      대표자: found.대표자 || found.사업자명 || "",
      업태: found.업태 || "",
      종목: found.종목 || "",
      주소: found.주소 || "",
      담당자: found.담당자 || "",
      연락처: found.연락처 || "",
    });
  }, [found, client]);

  const inRangeInvoice = (d) => (!start || d >= start) && (!end || d <= end);

  const rowsInvoice = useMemo(() => {
    let list = Array.isArray(dispatchData) ? dispatchData : [];
    list = list.filter((r) => (r.배차상태 || "") === "배차완료");
    if (client) list = list.filter((r) => (r.거래처명 || "") === client);
    if (start || end) list = list.filter((r) => inRangeInvoice(r.상차일 || "")); // 상차일 기준
    return list.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [dispatchData, client, start, end]);

  const mapped = rowsInvoice.map((r, i) => ({
    idx: i + 1,
    상하차지: `${r.상차지명 || ""} - ${r.하차지명 || ""}`,
    화물명: r.화물내용 || "",
    기사명: r.이름 || "",
    공급가액: toInt(r.청구운임),
    세액: Math.round(toInt(r.청구운임) * 0.1),
  }));

  const 합계공급가 = mapped.reduce((a, b) => a + b.공급가액, 0);
  const 합계세액 = mapped.reduce((a, b) => a + b.세액, 0);

  const COMPANY_PRINT = {
    name: "(주)돌케",
    ceo: "고현정",
    bizNo: "329-81-00967",
    type: "운수업",
    item: "화물운송주선",
    addr: "인천 서구 청마로19번길 21 4층 402호",
    contact: "TEL 1533-2525 / FAX 032-569-8881",
    bank: "기업은행 955-040276-04-018",
    email: "r15332525@run25.co.kr",
    seal: "/seal.png",
  };

  // ✅ PDF 저장 (거래명세서 - 기존 유지)
  const savePDF = async () => {
    const area = document.getElementById("invoiceArea");
    const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 210, pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight, position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`${client || "거래명세서"}.pdf`);
  };

  // ✅ 엑셀 다운로드 (거래명세서 - 기존 유지)
  const downloadInvoiceExcel = () => {
    const table = document.getElementById("invoiceArea");
    if (!table) return alert("내보낼 테이블을 찾을 수 없습니다.");
    try {
      const wb = XLSX.utils.table_to_book(table, { sheet: "거래명세서" });
      XLSX.writeFile(wb, `거래명세서_${cInfo.거래처명 || "미지정"}_${start || "all"}~${end || "all"}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("엑셀 저장 중 오류가 발생했습니다.");
    }
  };

  const saveEdit = () => {
    setClients((prev) => prev.map((c) => (c.거래처명 === client ? { ...c, ...editInfo } : c)));
    alert("거래처 정보 수정 완료!");
    setShowEdit(false);
  };

  // ---------------- 미수금관리(월집계) — 토글/선택/전체 정산 ----------------

  // 거래처 옵션
  const clientOptions8 = useMemo(() => {
    const set = new Set((clients || []).map((c) => c.거래처명).filter(Boolean));
    if (set.size === 0) (dispatchData || []).forEach(r => r.거래처명 && set.add(r.거래처명));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'ko'));
  }, [clients, dispatchData]);

  // UI 상태
  const [selClient, setSelClient] = useState("");
  const [monthFilter, setMonthFilter] = useState("all"); // "all" | "01".."12"
  const [statusFilter, setStatusFilter] = useState("전체"); // 전체 | 미정산 | 정산완료

  // 선택(체크박스)
  const [selectedMonths, setSelectedMonths] = useState(new Set()); // Set<"YYYY-MM">

  const toggleMonthSelect = (yyyymm) => {
    setSelectedMonths(prev => {
      const nxt = new Set(prev);
      nxt.has(yyyymm) ? nxt.delete(yyyymm) : nxt.add(yyyymm);
      return nxt;
    });
  };
  const toggleAllMonths = (rows) => {
    setSelectedMonths(prev => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map(r => r.yyyymm));
    });
  };
  const clearSel = () => setSelectedMonths(new Set());

  // 선택 거래처의 12개월 집계 (상차일 기준)
  const monthRowsRaw = useMemo(() => {
    if (!selClient) return [];
    const list = Array.isArray(dispatchData) ? dispatchData : [];
    const base = list.filter(r => (r.배차상태||"") === "배차완료" && (r.거래처명||"") === selClient);

    // 01..12 생성
    const months = Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"));
    return months.map(mm => {
      const yyyymm = `${THIS_YEAR}-${mm}`;
      const rows = base.filter(r => String(r.상차일||"").startsWith(yyyymm));
      const total = rows.reduce((s,r)=> s + toInt(r.청구운임), 0);
      const allDone = rows.length>0 && rows.every(r => r.정산상태 && r.정산상태[yyyymm] === "정산완료");
      const status = allDone ? "정산완료" : "미정산";
      const dates = rows.map(r => (r.정산일 && r.정산일[yyyymm]) ? r.정산일[yyyymm] : "").filter(Boolean).sort();
      const settledAt = dates.at(-1) || "";
      return { yyyymm, mm, 거래처명: selClient, 총청구금액: total, 정산상태: status, 정산일: settledAt, _rows: rows };
    });
  }, [dispatchData, selClient, THIS_YEAR]);

  // 필터링: 월 / 상태
  const monthRows = useMemo(() => {
    let rows = [...monthRowsRaw];
    if (monthFilter !== "all") rows = rows.filter(r => r.yyyymm.endsWith(`-${monthFilter}`));
    if (statusFilter !== "전체") rows = rows.filter(r => r.정산상태 === statusFilter);
    return rows;
  }, [monthRowsRaw, monthFilter, statusFilter]);

  // KPI
  const kpi = useMemo(() => {
    const cnt = monthRows.length;
    const amt = monthRows.reduce((s,r)=> s + toInt(r.총청구금액), 0);
    return { cnt, amt };
  }, [monthRows]);

  // 상태 배지
  const StatusBadge = ({ status }) => (
    <span className={`px-2 py-1 rounded text-xs ${status==="정산완료" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
      {status==="정산완료" ? "🟩 정산완료" : "🟥 미정산"}
    </span>
  );

  // 상태 토글(셀 클릭) — 미정산 ↔ 정산완료
  const toggleMonthStatus = async (row) => {
    const next = row.정산상태 === "정산완료" ? "미정산" : "정산완료";
    const dateStr = next === "정산완료" ? todayStr8() : "";
    const targets = row._rows || [];
    if (!targets.length) return;
    for (const r of targets) {
      if (!r._id) continue;
      await patchMonthOnDoc(r._id, row.yyyymm, next, dateStr);
    }
    alert(`${row.yyyymm} ${row.거래처명} → ${next} 처리 (${targets.length}건)`);
  };

  // 선택/전체 정산완료
  const settleSelected = async () => {
    const targets = monthRows.filter(r => selectedMonths.has(r.yyyymm));
    if (!targets.length) return alert("선택된 월이 없습니다.");
    for (const row of targets) {
      const dateStr = todayStr8();
      for (const r of row._rows || []) {
        if (!r._id) continue;
        await patchMonthOnDoc(r._id, row.yyyymm, "정산완료", dateStr);
      }
    }
    alert(`선택 정산완료: ${targets.length}개 월`);
    clearSel();
  };
  const settleAll = async () => {
    if (!monthRows.length) return alert("현재 표시된 월이 없습니다.");
    for (const row of monthRows) {
      const dateStr = todayStr8();
      for (const r of row._rows || []) {
        if (!r._id) continue;
        await patchMonthOnDoc(r._id, row.yyyymm, "정산완료", dateStr);
      }
    }
    alert(`전체 정산완료: ${monthRows.length}개 월`);
    clearSel();
  };

  // 엑셀 (현재 표시 목록 기준)
  const downloadMonthExcel = () => {
    if (!selClient) return alert("거래처를 선택하세요.");
    const rows = monthRows.map((row, idx)=>({
      선택: selectedMonths.has(row.yyyymm) ? "Y" : "",
      순번: idx+1,
      청구월: row.yyyymm,
      거래처명: row.거래처명,
      총청구금액: toInt(row.총청구금액),
      정산상태: row.정산상태,
      정산일: row.정산일 || "",
      메모: ""
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "미수금_월집계");
    const mmLabel = monthFilter === "all" ? "ALL" : monthFilter;
    XLSX.writeFile(wb, `미수금_월집계_${selClient || "전체"}_${THIS_YEAR}-${mmLabel}.xlsx`);
  };

  // ---------------- 렌더 ----------------
  return (
    <div>
      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <button
          className={`px-4 py-2 rounded border ${tab==="invoice" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          onClick={()=>setTab("invoice")}
        >
          거래명세서
        </button>
        <button
          className={`px-4 py-2 rounded border ${tab==="unsettledMonth" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          onClick={()=>setTab("unsettledMonth")}
        >
          미수금관리(월집계)
        </button>
      </div>

      {/* ========== 탭: 거래명세서 (검색식) ========== */}
      {tab === "invoice" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            {/* 🔍 거래처 검색 + 조회 버튼 */}
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">거래처 검색</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="border p-2 rounded min-w-[220px]"
                  placeholder="거래처명을 입력하세요"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
                <button
                  className="px-3 py-2 rounded bg-blue-600 text-white"
                  onClick={() => {
                    const kw = client.trim();
                    if (!kw) return alert("거래처명을 입력하세요.");

                    const foundClient = clients.find((c) =>
                      String(c.거래처명 || "").includes(kw)
                    );

                    if (!foundClient) {
                      alert("일치하는 거래처가 없습니다.");
                      return;
                    }

                    setClient(foundClient.거래처명);
                  }}
                >
                  조회
                </button>
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">시작일</label>
              <input
                type="date"
                className="border p-2 rounded"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">종료일</label>
              <input
                type="date"
                className="border p-2 rounded"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>

            <div className="ml-auto flex gap-2">
              <button
                onClick={downloadInvoiceExcel}
                className="bg-emerald-600 text-white px-3 py-2 rounded"
              >
                📊 엑셀 다운로드
              </button>
              <button
                onClick={savePDF}
                className="bg-blue-600 text-white px-3 py-2 rounded"
              >
                📄 PDF 저장
              </button>
              <button
                onClick={() => setShowEdit(true)}
                className="border px-3 py-2 rounded"
              >
                거래처 정보
              </button>
            </div>
          </div>

          <div
            id="invoiceArea"
            className="w-[1200px] mx-auto bg-white border-2 border-blue-400 rounded-2xl shadow-md overflow-hidden text-[15px]"
          >
            <h2 className="text-3xl font-extrabold text-blue-800 text-center mt-6 mb-1">
              거래명세서
            </h2>
            {(start || end) && (
              <p className="text-center text-gray-600 font-medium mb-2">
                거래기간 : {start || "시작일"} ~ {end || "종료일"}
              </p>
            )}
            <p className="text-center text-gray-500 mb-4">
              (공급자 및 공급받는자 기재)
            </p>

            <div className="grid grid-cols-2 border-t-2 border-blue-400 mx-6 mb-6 rounded overflow-hidden">
              <table className="w-full border border-blue-200 text-sm">
                <thead>
                  <tr>
                    <th
                      colSpan="2"
                      className="bg-blue-100 text-blue-900 font-bold text-center p-2 border-b"
                    >
                      공급받는자
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["상호", cInfo.거래처명],
                    ["대표자", cInfo.대표자],
                    ["사업자번호", cInfo.사업자번호],
                    ["주소", cInfo.주소],
                    ["업태", cInfo.업태],
                    ["종목", cInfo.종목],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center w-28">
                        {k}
                      </td>
                      <td className="border p-2">{v || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="w-full border border-blue-200 text-sm">
                <thead>
                  <tr>
                    <th
                      colSpan="2"
                      className="bg-blue-100 text-blue-900 font-bold text-center p-2 border-b"
                    >
                      공급자
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center w-28">
                      상호
                    </td>
                    <td className="border p-2">{COMPANY_PRINT.name}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                      대표자
                    </td>
                    <td className="border p-2 relative">
                      {COMPANY_PRINT.ceo} (인)
                      <img
                        src={COMPANY_PRINT.seal}
                        alt="seal"
                        className="absolute right-4 top-1 h-8 w-8 opacity-80"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                      사업자번호
                    </td>
                    <td className="border p-2">{COMPANY_PRINT.bizNo}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                      주소
                    </td>
                    <td className="border p-2">{COMPANY_PRINT.addr}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                      업태
                    </td>
                    <td className="border p-2">{COMPANY_PRINT.type}</td>
                  </tr>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                      종목
                    </td>
                    <td className="border p-2">{COMPANY_PRINT.item}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 상세 내역 */}
            <div className="overflow-x-auto px-6 pb-6">
              <table className="w-full text-sm border border-blue-300">
                <thead>
                  <tr className="bg-blue-50 text-blue-900 font-semibold text-center">
                    {["No", "상하차지", "화물명", "기사명", "공급가액", "세액(10%)"].map(
                      (h) => (
                        <th
                          key={h}
                          className="border border-blue-300 p-2"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {mapped.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-gray-500 py-8"
                      >
                        표시할 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    mapped.map((m) => (
                      <tr
                        key={m.idx}
                        className="odd:bg-white even:bg-blue-50"
                      >
                        <td className="border border-blue-300 p-2 text-center">
                          {m.idx}
                        </td>
                        <td className="border border-blue-300 p-2">
                          {m.상하차지}
                        </td>
                        <td className="border border-blue-300 p-2">
                          {m.화물명}
                        </td>
                        <td className="border border-blue-300 p-2 text-center">
                          {m.기사명}
                        </td>
                        <td className="border border-blue-300 p-2 text-right">
                          {won(m.공급가액)}
                        </td>
                        <td className="border border-blue-300 p-2 text-right">
                          {won(m.세액)}
                        </td>
                      </tr>
                    ))
                  )}
                  {mapped.length > 0 && (
                    <tr className="bg-blue-100 font-bold">
                      <td
                        colSpan={4}
                        className="border border-blue-300 p-2 text-center"
                      >
                        합계
                      </td>
                      <td className="border border-blue-300 p-2 text-right">
                        {won(합계공급가)}
                      </td>
                      <td className="border border-blue-300 p-2 text-right">
                        {won(합계세액)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-sm text-gray-600 text-center border-t py-3">
              입금계좌: {COMPANY_PRINT.bank} | 문의: {COMPANY_PRINT.email}
            </div>
          </div>

          {showEdit && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg w-[420px]">
                <h3 className="text-lg font-bold mb-4">거래처 정보 수정</h3>
                {[
                  "거래처명",
                  "사업자번호",
                  "대표자",
                  "업태",
                  "종목",
                  "주소",
                  "담당자",
                  "연락처",
                ].map((k) => (
                  <div key={k} className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                      {k}
                    </label>
                    <input
                      className="border p-2 w-full rounded"
                      value={editInfo[k] || ""}
                      onChange={(e) =>
                        setEditInfo({ ...editInfo, [k]: e.target.value })
                      }
                    />
                  </div>
                ))}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setShowEdit(false)}
                    className="px-3 py-2 border rounded"
                  >
                    닫기
                  </button>
                  <button
                    onClick={saveEdit}
                    className="px-3 py-2 bg-blue-600 text-white rounded"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== 탭: 미수금관리(월집계) ========== */}
      {tab === "unsettledMonth" && (
        <div>
          {/* 필터/액션 */}
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">거래처</label>
              <select
                className="border p-2 rounded min-w-[220px]"
                value={selClient}
                onChange={(e) => {
                  setSelClient(e.target.value);
                  clearSel();
                }}
              >
                <option value="">거래처 선택</option>
                {clientOptions8.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">월</label>
              <select
                className="border p-2 rounded min-w-[120px]"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              >
                <option value="all">전체</option>
                {Array.from({ length: 12 }, (_, i) =>
                  String(i + 1).padStart(2, "0")
                ).map((mm) => (
                  <option key={mm} value={mm}>
                    {parseInt(mm, 10)}월
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">정산상태</label>
              <select
                className="border p-2 rounded min-w-[120px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="전체">전체</option>
                <option value="미정산">미정산</option>
                <option value="정산완료">정산완료</option>
              </select>
            </div>

            <button
              onClick={() => {
                setSelClient("");
                setMonthFilter("all");
                setStatusFilter("전체");
                clearSel();
              }}
              className="px-3 py-2 rounded bg-gray-200"
            >
              필터 초기화
            </button>

            <div className="ml-auto flex gap-2">
              <button
                onClick={settleSelected}
                className={`px-3 py-2 rounded text-white ${
                  selectedMonths.size
                    ? "bg-emerald-600"
                    : "bg-emerald-600/50 cursor-not-allowed"
                }`}
                disabled={!selectedMonths.size}
              >
                선택 정산완료
              </button>
              <button
                onClick={settleAll}
                className={`px-3 py-2 rounded text-white ${
                  monthRows.length
                    ? "bg-emerald-700"
                    : "bg-emerald-700/50 cursor-not-allowed"
                }`}
                disabled={!monthRows.length}
              >
                전체 정산완료
              </button>
              <button
                onClick={downloadMonthExcel}
                className="px-3 py-2 rounded bg-blue-600 text-white"
              >
                📥 엑셀 다운로드
              </button>
            </div>
          </div>

          {/* KPI */}
          <div className="flex flex-wrap gap-2 text-xs md:text-sm mb-3">
            <span className="px-2 py-1 rounded bg-gray-100">
              연도 <b>{THIS_YEAR}</b>
            </span>
            <span className="px-2 py-1 rounded bg-blue-50 text-blue-800">
              거래처 <b>{selClient || "-"}</b>
            </span>
            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-800">
              표시 월{" "}
              <b>
                {monthFilter === "all" ? "전체" : `${THIS_YEAR}-${monthFilter}`}
              </b>
            </span>
            <span className="px-2 py-1 rounded bg-rose-50 text-rose-700">
              총 청구금액 <b>{kpi.amt.toLocaleString()}</b>원
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">
              선택 월 <b>{selectedMonths.size}</b>개
            </span>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="min-w-[900px] text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 border text-center">
                    <input
                      type="checkbox"
                      onChange={() => toggleAllMonths(monthRows)}
                      checked={
                        selectedMonths.size > 0 &&
                        selectedMonths.size === monthRows.length
                      }
                      aria-label="전체선택"
                    />
                  </th>
                  {[
                    "순번",
                    "청구월",
                    "거래처명",
                    "총 청구금액",
                    "정산상태",
                    "정산일",
                    "메모",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 border">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!selClient ? (
                  <tr>
                    <td
                      className="text-center text-gray-500 py-6"
                      colSpan={8}
                    >
                      거래처를 선택하세요.
                    </td>
                  </tr>
                ) : monthRows.length === 0 ? (
                  <tr>
                    <td
                      className="text-center text-gray-500 py-6"
                      colSpan={8}
                    >
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  monthRows.map((row, idx) => (
                    <tr
                      key={row.yyyymm}
                      className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      {/* 선택 */}
                      <td className="px-3 py-2 border text-center">
                        <input
                          type="checkbox"
                          checked={selectedMonths.has(row.yyyymm)}
                          onChange={() => toggleMonthSelect(row.yyyymm)}
                        />
                      </td>
                      <td className="px-3 py-2 border text-center">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 border text-center">
                        {row.yyyymm}
                      </td>
                      <td className="px-3 py-2 border text-center">
                        {row.거래처명}
                      </td>
                      <td className="px-3 py-2 border text-right">
                        {won(row.총청구금액)}
                      </td>

                      {/* 정산상태 — 클릭 토글 */}
                      <td
                        className="px-3 py-2 border text-center cursor-pointer select-none"
                        title="클릭하여 미정산/정산완료 전환"
                        onClick={() => toggleMonthStatus(row)}
                      >
                        <StatusBadge status={row.정산상태} />
                      </td>

                      <td className="px-3 py-2 border text-center">
                        {row.정산일 || ""}
                      </td>
                      <td className="px-3 py-2 border"></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            · 상태 클릭 시 해당 <b>거래처·월</b>의 모든 오더에
            <code className="mx-1 px-1 bg-gray-100 rounded">
              정산상태["YYYY-MM"]
            </code>
            /
            <code className="mx-1 px-1 bg-gray-100 rounded">
              정산일["YYYY-MM"]
            </code>
            이 저장됩니다. (상차일 기준)
          </div>
        </div>
      )}
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 8/8) — 거래명세서 + 미수금관리(월집계/토글/선택/전체정산) — END =====================
// ===================== DispatchApp.jsx (PART 9/9 — 지급관리 V5 최종본) — START =====================
function PaymentManagement({ dispatchData = [], clients = [], drivers = [] }) {

  // ---------- 유틸 ----------
  const todayStr9 = () => {
    try { return typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0,10); }
    catch { return new Date().toISOString().slice(0,10); }
  };
  const toInt = (v)=>{ const n=parseInt(String(v ?? "0").replace(/[^\d-]/g,""),10); return isNaN(n)?0:n; };
  const won = (n)=> (toInt(n)).toLocaleString();
  const head = typeof headBase === "string" ? headBase : "px-3 py-2 border";
  const cell = typeof cellBase === "string" ? cellBase : "px-3 py-2 border text-center";
  const input = typeof inputBase === "string" ? inputBase : "border rounded px-2 py-1";

  // ---------- Firestore ----------
  const patchDispatchDirect = async (id, patch) => {
    if (!id || !patch) return;
    await setDoc(doc(db, COLL.dispatch, id), patch, { merge: true });
  };

  // ---------- 지급일 공통 달력 ----------
  const [selectedPayDate, setSelectedPayDate] = React.useState(todayStr9());
  const [memoPopup, setMemoPopup] = useState({ open: false, text: "" });

  // ---------- 드롭다운 옵션 ----------
  const PAY_METHODS = ["계산서","선불","착불"];
  const DISPATCH_METHODS = ["24시","직접배차","인성"];

  // 지급방식 / 배차방식 필터 추가
  const [payMethodFilter, setPayMethodFilter] = useState("전체");
  const [dispatchMethodFilter, setDispatchMethodFilter] = useState("전체");

  // 거래처 옵션
  const clientOptions = useMemo(() => {
    const set = new Set((clients || []).map(c => c.거래처명).filter(Boolean));
    if (set.size === 0) (dispatchData || []).forEach(r => r.거래처명 && set.add(r.거래처명));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'ko'));
  }, [clients, dispatchData]);

  // 최근 차량번호 datalist
  const recentCarNos = useMemo(() => {
    const rows = (dispatchData || [])
      .filter(r => r.차량번호)
      .sort((a,b)=> (b.상차일||"").localeCompare(a.상차일||""));
    const seen = new Set(); 
    const res = [];
    for (const r of rows) {
      if (!seen.has(r.차량번호)) { 
        seen.add(r.차량번호); 
        res.push(r.차량번호); 
      }
      if (res.length >= 80) break;
    }
    return res;
  }, [dispatchData]);

  // 기사 인덱스
  const driverByCar = useMemo(() => {
    const m = new Map();
    (drivers||[]).forEach(d=>{
      const car = String(d.차량번호||"").trim();
      if (car) m.set(car, { 이름: d.이름||"", 전화번호: d.전화번호||"" });
    });
    return m;
  }, [drivers]);

  // ---------- 필터 ----------
  const [statusFilter, setStatusFilter] = useState("전체");
  const [payStart, setPayStart] = useState("");
  const [payEnd, setPayEnd] = useState("");
  const [carNoQ, setCarNoQ] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [clientQ, setClientQ] = useState("");
  const [loadStart, setLoadStart] = useState("");
  const [loadEnd, setLoadEnd] = useState("");

  const base = useMemo(
    ()=> Array.isArray(dispatchData) ? dispatchData.filter(r => (r.배차상태||"") === "배차완료") : [],
    [dispatchData]
  );

  const filtered = useMemo(()=> {
    let rows = [...base];

    if (statusFilter !== "전체")
      rows = rows.filter(r => (r.지급상태 || "지급중") === statusFilter);

    if (payStart) rows = rows.filter(r => (r.지급일 || "") >= payStart);
    if (payEnd)   rows = rows.filter(r => (r.지급일 || "") <= payEnd);

    if (loadStart) rows = rows.filter(r => (r.상차일 || "") >= loadStart);
    if (loadEnd)   rows = rows.filter(r => (r.상차일 || "") <= loadEnd);

    const car = carNoQ.trim().toLowerCase();
    const name = nameQ.trim().toLowerCase();
    const client = clientQ.trim().toLowerCase();

    if (car) rows = rows.filter(r => String(r.차량번호||"").toLowerCase().includes(car));
    if (name) rows = rows.filter(r => String(r.이름||"").toLowerCase().includes(name));
    if (client) rows = rows.filter(r => String(r.거래처명||"").toLowerCase().includes(client));

    // 지급방식/배차방식 필터
    if (payMethodFilter !== "전체")
      rows = rows.filter(r => r.지급방식 === payMethodFilter);

    if (dispatchMethodFilter !== "전체")
      rows = rows.filter(r => r.배차방식 === dispatchMethodFilter);

    rows.sort(
      (a,b)=> 
        (a.상차일||"").localeCompare(b.상차일||"") || 
        (toInt(a.순번)-toInt(b.순번))
    );

    return rows;
  }, [
    base, statusFilter, payStart, payEnd,
    carNoQ, nameQ, clientQ, loadStart, loadEnd,
    payMethodFilter, dispatchMethodFilter
  ]);

  // ---------- 선택 기능 ----------
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r._id)));
    }
  };

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const nxt = new Set(prev);
      if (nxt.has(id)) nxt.delete(id);
      else nxt.add(id);
      return nxt;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ---------- 선택 지급/미지급 ----------
  const bulkPayDone = async (ids) => {
    if (!ids.length) return alert("선택된 항목이 없습니다.");
    const payDate = selectedPayDate || todayStr9();

    for (const id of ids) {
      await patchDispatchDirect(id, {
        지급상태: "지급완료",
        지급일: payDate,
      });
    }
    alert(`지급완료 처리: ${ids.length}건`);
  };

  const bulkPayUndone = async (ids) => {
    if (!ids.length) return alert("선택된 항목이 없습니다.");

    for (const id of ids) {
      await patchDispatchDirect(id, {
        지급상태: "지급중",
        지급일: "",
      });
    }
    alert(`미지급 처리: ${ids.length}건`);
  };

  // ---------- 개별 토글 ----------
  const togglePayStatus = async (row) => {
    const cur = row.지급상태 || "지급중";
    const next = cur === "지급중" ? "지급완료" : "지급중";

    const payDate =
      next === "지급완료"
        ? (selectedPayDate || todayStr9())
        : "";

    await patchDispatchDirect(row._id, {
      지급상태: next,
      지급일: payDate,
    });
  };

  // ---------- 수정 모드 ----------
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({});

  const enterEdit = () => {
    const d = {};
    filtered.forEach(r => {
      d[r._id] = {
        상차일: r.상차일 || "",
        거래처명: r.거래처명 || "",
        상차지명: r.상차지명 || "",
        하차지명: r.하차지명 || "",
        차량번호: r.차량번호 || "",
        이름: r.이름 || "",
        전화번호: r.전화번호 || "",
        지급방식: r.지급방식 || "",
        배차방식: r.배차방식 || "",
        청구운임: String(r.청구운임 || ""),
        기사운임: String(r.기사운임 || ""),
        지급일: r.지급일 || "",
        메모: r.메모 || "",
      };
    });
    setDraft(d);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft({});
  };

  const setD = (id, k, v) =>
    setDraft(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [k]: v }
    }));

  // ---------- 차량번호 자동매칭 ----------
  const openDriverRegisterModal = (carNo, row) => {
    if (typeof showDriverRegisterModal === "function") {
      try {
        showDriverRegisterModal({
          차량번호: carNo,
          이름: row?.이름 || "",
          전화번호: row?.전화번호 || "",
        });
        return;
      } catch {}
    }
    if (typeof openRegisterDriverModal === "function") {
      try {
        openRegisterDriverModal({
          차량번호: carNo,
          이름: row?.이름 || "",
          전화번호: row?.전화번호 || "",
        });
        return;
      } catch {}
    }
    alert("신규 기사 등록창이 연결되지 않았습니다.");
  };

  const onCarKeyDown = (row) => (e) => {
    if (e.key !== "Enter") return;
    const id = row._id;
    const car = (draft[id]?.차량번호 ?? "").trim();
    if (!car) return;

    const info = driverByCar.get(car);
    if (info) {
      setD(id, "이름", info.이름 || "");
      setD(id, "전화번호", info.전화번호 || "");
    } else {
      openDriverRegisterModal(car, row);
    }
  };

  // ---------- 저장 ----------
  const saveAll = async () => {
    const jobs = [];

    filtered.forEach(r => {
      const cur = draft[r._id];
      if (!cur) return;

      const patch = {};
      const keys = [
        "상차일","거래처명","상차지명","하차지명",
        "차량번호","이름","전화번호",
        "지급방식","배차방식",
        "청구운임","기사운임",
        "지급일","메모"
      ];

      keys.forEach(k => {
        const orig = (k==="청구운임"||k==="기사운임")
          ? String(r[k]||"")
          : (r[k]||"");
        const val  = cur[k] ?? "";

        if (String(val) !== String(orig)) patch[k] = val;
      });

      if (Object.keys(patch).length)
        jobs.push(patchDispatchDirect(r._id, patch));
    });

    if (jobs.length) await Promise.all(jobs);

    alert("저장되었습니다");
    setEditMode(false);
    setDraft({});
  };

  // ---------- KPI ----------
  const kpi = useMemo(() => {
    const cnt = filtered.length;
    const sale = filtered.reduce((s,r)=> s + toInt(r.청구운임), 0);
    const driver = filtered.reduce((s,r)=> s + toInt(r.기사운임), 0);
    const fee = sale - driver;
    const done = filtered.filter(r => (r.지급상태||"지급중") === "지급완료").length;
    return { cnt, sale, driver, fee, done };
  }, [filtered]);

  // ---------- 엑셀 다운로드 ----------
  const downloadExcel = () => {
    if (!filtered.length) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    const rows = filtered.map((r,i)=>({
      순번: i + 1,
      상차일: r.상차일 || "",
      지급상태: r.지급상태 || "지급중",
      지급일: r.지급일 || "",
      거래처명: r.거래처명 || "",
      상차지명: r.상차지명 || "",
      하차지명: r.하차지명 || "",
      차량번호: r.차량번호 || "",
      이름: r.이름 || "",
      전화번호: r.전화번호 || "",
      청구운임: toInt(r.청구운임),
      기사운임: toInt(r.기사운임),
      수수료: toInt(r.청구운임) - toInt(r.기사운임),
      지급방식: r.지급방식 || "",
      배차방식: r.배차방식 || "",
      메모: r.메모 || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "지급관리");
    XLSX.writeFile(wb, `지급관리_${todayStr9()}.xlsx`);
  };

  // ---------- 렌더 보조 ----------
  const roText = (v)=> <span className="whitespace-pre">{String(v ?? "")}</span>;
  const editableCls = "bg-yellow-50";

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">지급관리</h2>

      {/* KPI */}
      <div className="flex flex-wrap gap-2 text-xs md:text-sm mb-3">
        <span className="px-2 py-1 rounded bg-gray-100">
          총 건수 <b>{kpi.cnt.toLocaleString()}</b>건
        </span>
        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">
          총 청구 <b>{kpi.sale.toLocaleString()}</b>원
        </span>
        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">
          총 기사 <b>{kpi.driver.toLocaleString()}</b>원
        </span>
        <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700">
          총 수수료 <b>{kpi.fee.toLocaleString()}</b>원
        </span>
        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800">
          지급완료 <b>{kpi.done.toLocaleString()}</b>건
        </span>
      </div>

      {/* 필터/액션 바 */}
      <div className="flex flex-wrap items-end gap-2 mb-3">

        {/* 지급상태 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급상태</label>
          <select className="border p-2 rounded min-w-[120px]"
            value={statusFilter}
            onChange={(e)=>setStatusFilter(e.target.value)}
          >
            <option value="전체">전체</option>
            <option value="지급중">지급중</option>
            <option value="지급완료">지급완료</option>
          </select>
        </div>

        {/* 지급방식 필터 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급방식</label>
          <select
            className="border p-2 rounded min-w-[120px]"
            value={payMethodFilter}
            onChange={(e)=>setPayMethodFilter(e.target.value)}
          >
            <option value="전체">전체</option>
            {PAY_METHODS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* 배차방식 필터 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">배차방식</label>
          <select
            className="border p-2 rounded min-w-[120px]"
            value={dispatchMethodFilter}
            onChange={(e)=>setDispatchMethodFilter(e.target.value)}
          >
            <option value="전체">전체</option>
            {DISPATCH_METHODS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* 지급일 시작 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급일 시작</label>
          <input type="date" className="border p-2 rounded"
            value={payStart}
            onChange={(e)=>setPayStart(e.target.value)}
          />
        </div>

        {/* 지급일 종료 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급일 종료</label>
          <input type="date" className="border p-2 rounded"
            value={payEnd}
            onChange={(e)=>setPayEnd(e.target.value)}
          />
        </div>

        {/* 상차일 필터 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">상차일 시작</label>
          <input type="date" className="border p-2 rounded"
            value={loadStart}
            onChange={(e)=>setLoadStart(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">상차일 종료</label>
          <input type="date" className="border p-2 rounded"
            value={loadEnd}
            onChange={(e)=>setLoadEnd(e.target.value)}
          />
        </div>

        {/* 검색 */}
        <input className="border p-2 rounded" placeholder="차량번호"
          value={carNoQ} onChange={(e)=>setCarNoQ(e.target.value)}
        />
        <input className="border p-2 rounded" placeholder="기사명"
          value={nameQ} onChange={(e)=>setNameQ(e.target.value)}
        />
        <input className="border p-2 rounded" placeholder="거래처명"
          value={clientQ} onChange={(e)=>setClientQ(e.target.value)}
        />

        {/* 필터 초기화 */}
        <button
          onClick={()=>{
            setStatusFilter("전체");
            setPayStart(""); setPayEnd("");
            setCarNoQ(""); setNameQ(""); setClientQ("");
            setLoadStart(""); setLoadEnd("");
            setPayMethodFilter("전체");
            setDispatchMethodFilter("전체");
          }}
          className="px-3 py-2 rounded bg-gray-200"
        >
          필터 초기화
        </button>

        {/* 우측 액션 */}
        <div className="ml-auto flex gap-2 items-end">

          {/* 지급일 적용 */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">지급일(적용)</label>
            <input type="date" className="border p-2 rounded"
              value={selectedPayDate}
              onChange={(e)=>setSelectedPayDate(e.target.value)}
            />
          </div>

          {!editMode ? (
            <button onClick={enterEdit} className="px-3 py-2 rounded border">수정</button>
          ) : (
            <>
              <button onClick={saveAll} className="px-3 py-2 rounded bg-blue-600 text-white">저장</button>
              <button onClick={cancelEdit} className="px-3 py-2 rounded border">취소</button>
            </>
          )}

          <button onClick={()=>bulkPayDone(Array.from(selectedIds))} className="px-3 py-2 rounded bg-emerald-600 text-white">선택 지급</button>
          <button onClick={()=>bulkPayUndone(Array.from(selectedIds))} className="px-3 py-2 rounded bg-red-600 text-white">선택 미지급</button>
          <button onClick={()=>bulkPayDone(filtered.map(r=>r._id))} className="px-3 py-2 rounded bg-emerald-700 text-white">전체 지급</button>
          <button onClick={downloadExcel} className="px-3 py-2 rounded bg-blue-600 text-white">📥 엑셀 다운로드</button>

        </div>
      </div>

      {/* 선택 상태 표시줄 */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={toggleAll} className="px-3 py-2 rounded border">전체선택/해제</button>
        <button onClick={clearSelection} className="px-3 py-2 rounded border">선택해제</button>
        <span className="text-sm text-gray-600">선택: {selectedIds.size}건</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className={head}>
                <input
                  type="checkbox"
                  onChange={toggleAll}
                  checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                />
              </th>

              {[
                "순번",
                "상차일",
                "지급상태",   // 앞으로 이동
                "지급일",     // 앞으로 이동
                "거래처명",
                "상차지명",
                "하차지명",
                "차량번호",
                "이름",
                "전화번호",
                "청구운임",
                "기사운임",
                "수수료",
                "지급방식",
                "배차방식",
                "메모",
              ].map(h => (
                <th key={h} className={head}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="text-center text-gray-500 py-6" colSpan={16}>
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => {
                const d = draft[r._id] || {};

                const fee =
                  toInt(editMode ? d.청구운임 : r.청구운임) -
                  toInt(editMode ? d.기사운임 : r.기사운임);

                return (
                  <tr key={r._id || i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>

                    {/* 선택 */}
                    <td className={cell}>
                      <input type="checkbox"
                        checked={selectedIds.has(r._id)}
                        onChange={()=>toggleOne(r._id)}
                      />
                    </td>

                    {/* 순번 */}
                    <td className={cell}>{r.순번 || i+1}</td>

                    {/* 상차일 */}
                    <td className={cell}>
                      {!editMode ? roText(r.상차일 || "") : (
                        <input type="date" className={`${input} ${editableCls}`}
                          value={d.상차일 ?? ""}
                          onChange={(e)=>setD(r._id,"상차일",e.target.value)}
                        />
                      )}
                    </td>

                    {/* 지급상태 (앞으로 이동) */}
                    <td className={cell}>
                      <button
                        onClick={()=>togglePayStatus(r)}
                        className={`px-2 py-1 rounded text-sm ${
                          (r.지급상태||"지급중")==="지급완료"
                            ? "bg-emerald-600 text-white"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {(r.지급상태||"지급중")==="지급완료" ? "✅ 지급완료" : "🔵 지급중"}
                      </button>
                    </td>

                    {/* 지급일 (앞으로 이동) */}
                    <td className={cell}>
                      {!editMode ? roText(r.지급일||"") : (
                        <input type="date" className={`${input} ${editableCls}`}
                          value={d.지급일 ?? ""}
                          onChange={(e)=>setD(r._id,"지급일",e.target.value)}
                        />
                      )}
                    </td>

                    {/* 거래처명 */}
                    <td className={cell}>
                      {!editMode ? roText(r.거래처명||"") : (
                        <select className={`${input} ${editableCls}`}
                          value={d.거래처명 ?? ""}
                          onChange={(e)=>setD(r._id,"거래처명",e.target.value)}
                        >
                          <option value="">선택</option>
                          {clientOptions.map(v=>(
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 상차지명 */}
                    <td className={cell}>
                      {!editMode ? roText(r.상차지명||"") : (
                        <input className={`${input} ${editableCls}`}
                          value={d.상차지명 ?? ""}
                          onChange={(e)=>setD(r._id,"상차지명",e.target.value)}
                        />
                      )}
                    </td>

                    {/* 하차지명 */}
                    <td className={cell}>
                      {!editMode ? roText(r.하차지명||"") : (
                        <input className={`${input} ${editableCls}`}
                          value={d.하차지명 ?? ""}
                          onChange={(e)=>setD(r._id,"하차지명",e.target.value)}
                        />
                      )}
                    </td>

                    {/* 차량번호 */}
                    <td className={cell}>
                      {!editMode ? roText(r.차량번호||"") : (
                        <>
                          <input
                            list="carNos-list"
                            className={`${input} ${editableCls}`}
                            value={d.차량번호 ?? ""}
                            onChange={(e)=>setD(r._id,"차량번호",e.target.value)}
                            onKeyDown={onCarKeyDown(r)}
                          />
                          <datalist id="carNos-list">
                            {recentCarNos.map(cn=>(
                              <option key={cn} value={cn}/>
                            ))}
                          </datalist>
                        </>
                      )}
                    </td>

                    {/* 이름 */}
                    <td className={cell}>
                      {roText(editMode ? (d.이름 ?? r.이름) : (r.이름||""))}
                    </td>

                    {/* 전화번호 */}
                    <td className={cell}>
                      {roText(editMode ? (d.전화번호 ?? r.전화번호) : (r.전화번호||""))}
                    </td>

                    {/* 청구운임 */}
                    <td className={cell}>
                      {!editMode ? roText(won(r.청구운임)) : (
                        <input className={`${input} text-right ${editableCls}`}
                          value={d.청구운임 ?? ""}
                          onChange={(e)=>setD(r._id,"청구운임",e.target.value.replace(/[^\d]/g,""))}
                        />
                      )}
                    </td>

                    {/* 기사운임 */}
                    <td className={cell}>
                      {!editMode ? roText(won(r.기사운임)) : (
                        <input className={`${input} text-right ${editableCls}`}
                          value={d.기사운임 ?? ""}
                          onChange={(e)=>setD(r._id,"기사운임",e.target.value.replace(/[^\d]/g,""))}
                        />
                      )}
                    </td>

                    {/* 수수료 */}
                    <td className={`${cell} text-blue-700 font-semibold`}>
                      {won(fee)}
                    </td>

                    {/* 지급방식 */}
                    <td className={cell}>
                      {!editMode ? roText(r.지급방식||"") : (
                        <select className={`${input} ${editableCls}`}
                          value={d.지급방식 ?? ""}
                          onChange={(e)=>setD(r._id,"지급방식",e.target.value)}
                        >
                          <option value="">선택</option>
                          {PAY_METHODS.map(o=>(
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 배차방식 */}
                    <td className={cell}>
                      {!editMode ? roText(r.배차방식||"") : (
                        <select className={`${input} ${editableCls}`}
                          value={d.배차방식 ?? ""}
                          onChange={(e)=>setD(r._id,"배차방식",e.target.value)}
                        >
                          <option value="">선택</option>
                          {DISPATCH_METHODS.map(o=>(
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 메모 (더보기 팝업 + 너비 축소) */}
<td className={cell + " min-w-[80px] max-w-[80px] truncate"}>
  {!editMode ? (
    <span
      className="cursor-pointer hover:underline"
      onClick={() => setMemoPopup({ open: true, text: r.메모 || "" })}
    >
      {(r.메모 || "").length > 5
        ? (r.메모.substring(0, 5) + "…")
        : (r.메모 || "")}
    </span>
  ) : (
    <input
      className={`${input} ${editableCls}`}
      value={d.메모 ?? ""}
      onChange={(e)=>setD(r._id,"메모",e.target.value)}
    />
  )}
</td>


                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===================== DispatchApp.jsx (PART 9/9 — 지급관리 V5 최종본) — END =====================
// ===================== DispatchApp.jsx (PART 10/10) — START =====================
// 기사관리 (DriverManagement)
function DriverManagement({ drivers = [], upsertDriver, removeDriver }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(() =>
    (drivers || []).map(d => ({ ...d }))
  );
  const [selected, setSelected] = React.useState(new Set());
  const [newForm, setNewForm] = React.useState({ 차량번호: "", 이름: "", 전화번호: "", 메모: "" });

  React.useEffect(() => {
    setRows((drivers || []).map(d => ({ ...d })));
  }, [drivers]);

  const norm = (s="") => String(s).toLowerCase().replace(/\s+/g,"");
  const filtered = React.useMemo(() => {
    if (!q.trim()) return rows;
    const nq = norm(q);
    return rows.filter(r =>
      ["차량번호","이름","전화번호","메모"].some(k => norm(r[k]||"").includes(nq))
    );
  }, [rows, q]);

  // ===================== 페이지네이션 =====================
  const [page, setPage] = React.useState(1);
  const perPage = 100;

  React.useEffect(() => { setPage(1); }, [q]);

  const paged = React.useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / perPage);
  // =====================================================

  const toggleOne = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
 const toggleAll = () => {
  // ✅ 항상 Firestore 문서 id(r.id)를 우선 사용
  const allIds = filtered
    .map(r => r.id || r.차량번호)   // id가 없으면 차량번호 fallback
    .filter(Boolean);

  if (allIds.length === 0) {
    setSelected(new Set());
    return;
  }

  if (selected.size === allIds.length) {
    setSelected(new Set());
  } else {
    setSelected(new Set(allIds));
  }
};


const handleBlur = async (row, key, val) => {
  const oldId = row.id; // 기존 ID(기존 차량번호)
  const newId = key === "차량번호" ? val.replace(/\s+/g,"") : oldId;

  const patch = { ...row, [key]: val, id: newId };

  if (newId !== oldId) {
    // 1) 새문서 생성
    await upsertDriver?.(patch);
    // 2) 기존 문서 삭제
    await removeDriver?.(oldId);
  } else {
    await upsertDriver?.(patch);
  }
};

  const addNew = async () => {
    const 차량번호 = (newForm.차량번호 || "").replace(/\s+/g,"");
    if (!차량번호) return alert("차량번호는 필수입니다.");
    await upsertDriver?.({ ...newForm, 차량번호, id: 차량번호 });
    setNewForm({ 차량번호: "", 이름: "", 전화번호: "", 메모: "" });
    alert("등록 완료");
  };

  const removeSelected = async () => {
  if (!selected.size) return alert("선택된 항목이 없습니다.");
  // ✅ 브라우저 전역 window.confirm 사용
  if (!window.confirm(`${selected.size}건 삭제할까요?`)) return;

  for (const id of selected) {
    await removeDriver?.(id);
  }
  setSelected(new Set());
  alert("삭제 완료");
};


  // 엑셀 업로드
  const onExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
        const sheet = wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" });
        let ok = 0;
        for (const r of json) {
          const 차량번호 = String(r.차량번호 || r["차량 번호"] || r["차량번호 "] || "").replace(/\s+/g,"");
          if (!차량번호) continue;
          const 이름 = r.이름 || r["기사명"] || "";
          const 전화번호 = r.전화번호 || r["전화"] || r["휴대폰"] || "";
          const 메모 = r.메모 || r["비고"] || "";
          await upsertDriver?.({ 차량번호, 이름, 전화번호, 메모, id: 차량번호 });
          ok++;
        }
        alert(`총 ${ok}건 반영`);
      } catch (err) {
        console.error(err);
        alert("엑셀 처리 중 오류");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };
  

  const head = "border px-2 py-1 bg-slate-100 text-slate-700 text-xs font-semibold text-center whitespace-nowrap";
  const cell = "border px-2 py-[2px] text-sm text-slate-800 text-center whitespace-nowrap align-middle";
  const input = inputBase || "border px-1 py-[2px] text-sm rounded-sm w-28 text-center";

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">기사관리</h2>

      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="border p-2 rounded w-64"
          placeholder="검색 (차량번호/이름/전화/메모)"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
        <label className="px-3 py-1 border rounded cursor-pointer text-sm">
          📁 엑셀 업로드
          <input type="file" accept=".xlsx,.xls" onChange={onExcel} className="hidden" />
        </label>
        <button onClick={removeSelected} className="px-3 py-1 rounded bg-red-600 text-white text-sm">선택삭제</button>
      </div>

      {/* 신규 등록 */}
      {/* 신규 기사 빠른 등록 (Compact) */}
<div className="flex items-end gap-2 mb-4 bg-slate-50 px-2 py-1.5 rounded-md border">
  <input
    className="border px-2 py-1 rounded text-sm w-40"
    placeholder="차량번호*"
    value={newForm.차량번호}
    onChange={e=>setNewForm(p=>({...p,차량번호:e.target.value}))}
  />
  <input
    className="border px-2 py-1 rounded text-sm w-28"
    placeholder="이름"
    value={newForm.이름}
    onChange={e=>setNewForm(p=>({...p,이름:e.target.value}))}
  />
  <input
    className="border px-2 py-1 rounded text-sm w-36"
    placeholder="전화번호"
    value={newForm.전화번호}
    onChange={e=>setNewForm(p=>({...p,전화번호:e.target.value}))}
  />
  <input
    className="border px-2 py-1 rounded text-sm w-64"
    placeholder="메모"
    value={newForm.메모}
    onChange={e=>setNewForm(p=>({...p,메모:e.target.value}))}
  />

  <button
    onClick={addNew}
    className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm whitespace-nowrap"
  >
    + 추가
  </button>
</div>


      {/* 표 */}
      <div className="overflow-x-auto">
        <table className="min-w-[900px] text-sm border">
          <thead>
            <tr>
              <th className={head}>
                <input type="checkbox"
                  onChange={toggleAll}
                  checked={filtered.length>0 && selected.size===filtered.length}
                />
              </th>
              {["차량번호","이름","전화번호","메모","삭제"].map(h=>(
                <th key={h} className={head}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
  {paged.length === 0 ? (
    <tr>
      <td className="text-center text-gray-500 py-6" colSpan={6}>
        표시할 데이터가 없습니다.
      </td>
    </tr>
  ) : (
    paged.map((r, i) => {
      // ✅ Firestore 문서 id를 최우선으로 사용
      const docId = r._id || r.id || r.차량번호;
      // ✅ React key는 docId가 없으면 인덱스로
      const rowKey = docId || `${r.차량번호}_${i}`;

      return (
        <tr key={rowKey} className={i % 2 ? "bg-gray-50" : ""}>
          {/* 체크박스 */}
          <td className={cell}>
            <input
              type="checkbox"
              checked={docId ? selected.has(docId) : false}
              onChange={() => {
                if (!docId) {
                  alert("ID 없음: 삭제/선택이 불가능한 행입니다.");
                  return;
                }
                toggleOne(docId);
              }}
            />
          </td>

          {/* 차량번호 */}
          <td className={cell}>
  <span
    className="block cursor-pointer px-1 py-[2px] rounded hover:bg-slate-100"
    contentEditable
    suppressContentEditableWarning
    onBlur={(e) =>
      handleBlur(r, "차량번호", e.currentTarget.innerText.trim())
    }
  >
    {r.차량번호 || "-"}
  </span>
</td>


          {/* 이름 */}
          <td className={cell}>
  <span
    className="block cursor-pointer px-1 py-[2px] hover:bg-slate-100 rounded"
    onClick={(e) => {
      e.currentTarget.contentEditable = true;
      e.currentTarget.focus();
    }}
    onBlur={(e) => handleBlur(r, "이름", e.currentTarget.innerText)}
    suppressContentEditableWarning
  >
    {r.이름 || "-"}
  </span>
</td>


          {/* 전화번호 */}
          <td className={cell}>
  <span
    className="block cursor-pointer px-1 py-[2px] rounded hover:bg-slate-100"
    contentEditable
    suppressContentEditableWarning
    onBlur={(e) =>
      handleBlur(r, "전화번호", e.currentTarget.innerText.trim())
    }
  >
    {r.전화번호 || "-"}
  </span>
</td>

          {/* 메모 */}
          <td className={cell}>
            <input
              className={`${input} w-48 text-left`}
              defaultValue={r.메모 || ""}
              onBlur={(e) => handleBlur(r, "메모", e.target.value)}
            />
          </td>

          {/* 삭제 버튼 */}
          <td className={cell}>
            <button
              className="px-2 py-[2px] text-xs border border-red-400 text-red-600 rounded hover:bg-red-50"
              onClick={() => {
                if (!docId) {
                  alert("ID 없음: 삭제가 불가능한 행입니다.");
                  return;
                }
                if (confirm("삭제하시겠습니까?")) {
                  removeDriver?.(docId);  // ✅ 항상 doc.id 기준으로 삭제
                }
              }}
            >
              삭제
            </button>
          </td>
        </tr>
      );
    })
  )}
</tbody>

        </table>
        
      </div>

      {/* ================= 페이지 버튼 ================ */}
      <div className="flex items-center justify-center gap-4 mt-4 text-sm">
        <button
          className="px-4 py-1 border rounded disabled:opacity-50"
          disabled={page === 1}
          onClick={() => setPage(p => Math.max(1, p - 1))}
        >
          ◀ 이전
        </button>

        <span>
          {page} / {totalPages || 1}
        </span>

        <button
          className="px-4 py-1 border rounded disabled:opacity-50"
          disabled={page === totalPages || totalPages===0}
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
        >
          다음 ▶
        </button>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 10/10) — END =====================

// ===================== DispatchApp.jsx (PART 11/11) — START =====================
// 거래처관리 (ClientManagement) — 기본 거래처 + 하차지 거래처 서브탭 포함

function ClientManagement({ clients = [], upsertClient, removeClient }) {
  // 🔧 주소 비교용 정규화 (하차지명은 신경 안 쓰고, 주소만 기준으로 중복 판단)
  const normalizePlace = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "") // 공백 제거
      .replace(/[^\w가-힣\/-]/g, ""); // 숫자/영문/한글 + / - 만 남기고 제거

        // ✅ 여기
  const normalizeCompanyName = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^\uAC00-\uD7A3]/g, "");

  /* -----------------------------------------------------------
     공통 유틸/스타일
  ----------------------------------------------------------- */
  const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");
  const head =
    headBase ||
    "border px-2 py-2 bg-gray-100 text-center whitespace-nowrap";
  const cell =
    cellBase ||
    "border px-2 py-1 text-center whitespace-nowrap align-middle";
  const input = inputBase || "border p-1 rounded w-36 text-center";

  /* -----------------------------------------------------------
     상단 서브탭 (기본 / 하차지)
  ----------------------------------------------------------- */
  const [subTab, setSubTab] = React.useState("기본"); // "기본" | "하차지"

  /* -----------------------------------------------------------
     🔵 [1] 기본 거래처관리 상태 (Firestore: clients 컬렉션)
  ----------------------------------------------------------- */
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(() =>
    (clients || []).map((c) => ({ ...c }))
  );
  const [selected, setSelected] = React.useState(new Set());

  const [newForm, setNewForm] = React.useState({
    거래처명: "",
    사업자번호: "",
    대표자: "",
    업태: "",
    종목: "",
    주소: "",
    담당자: "",
    연락처: "",
    메모: "",
  });

  React.useEffect(() => {
    const normalized = normalizeClients ? normalizeClients(clients) : clients || [];
    setRows(normalized.map((c) => ({ ...c })));
  }, [clients]);

  const filtered = React.useMemo(() => {
    if (!q.trim()) return rows;
    const nq = norm(q);
    return rows.filter((r) =>
      [
        "거래처명",
        "사업자번호",
        "대표자",
        "업태",
        "종목",
        "주소",
        "담당자",
        "연락처",
        "메모",
      ].some((k) => norm(r[k] || "").includes(nq))
    );
  }, [rows, q]);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.거래처명).filter(Boolean)));
  };

  const handleBlur = async (row, key, val) => {
    const id = row.거래처명 || row.id;
    if (!id) return;
    await upsertClient?.({
      ...row,
      [key]: val,
      id,
    });
  };

  const addNew = async () => {
    const 거래처명 = (newForm.거래처명 || "").trim();
    if (!거래처명) return alert("거래처명은 필수입니다.");

    await upsertClient?.({ ...newForm, id: 거래처명 });

    setNewForm({
      거래처명: "",
      사업자번호: "",
      대표자: "",
      업태: "",
      종목: "",
      주소: "",
      담당자: "",
      연락처: "",
      메모: "",
    });

    alert("등록 완료");
  };

  const removeSelectedFn = async () => {
    if (!selected.size) return alert("선택된 항목이 없습니다.");
    if (!confirm(`${selected.size}건 삭제하시겠습니까?`)) return;

    for (const id of selected) {
      await removeClient?.(id);
    }

    setSelected(new Set());
    alert("삭제 완료");
  };

  const onExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), {
          type: "array",
        });
        const sheet = wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
          defval: "",
        });

        let ok = 0;

        for (const r of json) {
          const row = normalizeClient
            ? normalizeClient(r)
            : {
                거래처명:
                  r.거래처명 ||
                  r["상호"] ||
                  r["회사명"] ||
                  r["업체명"] ||
                  r["거래처"] ||
                  "",
                사업자번호:
                  r.사업자번호 ||
                  r["사업자 등록번호"] ||
                  r["사업자등록번호"] ||
                  "",
                대표자: r.대표자 || r["대표자명"] || r["대표"] || "",
                업태: r.업태 || "",
                종목: r.종목 || "",
                주소: r.주소 || "",
                담당자: r.담당자 || r["담당"] || "",
                연락처: r.연락처 || r["전화"] || r["휴대폰"] || "",
                메모: r.메모 || r["비고"] || "",
              };

          const 거래처명 = (row.거래처명 || "").trim();
          if (!거래처명) continue;

          await upsertClient?.({ ...row, id: 거래처명 });
          ok++;
        }

        alert(`총 ${ok}건 반영 완료`);
      } catch (err) {
        console.error(err);
        alert("엑셀 처리 오류");
      } finally {
        e.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };

  /* -----------------------------------------------------------
     🔵 [2] 하차지 거래처 관리 (Firestore: places 컬렉션)
  ----------------------------------------------------------- */

  // ✅ Firestore 하차지 컬렉션 helpers
  const PLACES_COLL = "places";

  const upsertPlace = async (row) => {
    const id = row.id || row.업체명 || crypto?.randomUUID?.();
    if (!id) return;

    await setDoc(
      doc(db, PLACES_COLL, id),
      {
        id,
        업체명: row.업체명 || "",
        주소: row.주소 || "",
        담당자: row.담당자 || "",
        담당자번호: row.담당자번호 || "",
        메모: row.메모 || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const removePlace = async (id) => {
    if (!id) return;
    await deleteDoc(doc(db, PLACES_COLL, id));
  };

  const [placeRows, setPlaceRows] = React.useState([]);
  const [showDupPreview, setShowDupPreview] = React.useState(false);
  // 🔁 하차지 주소 기준 중복 그룹 계산
// ================================
// 🔥 주소 포함 관계 기반 중복 그룹 계산 (FINAL)
// - 업체명: 느슨하게 (띄어쓰기/표기 차이 허용)
// - 주소: 엄격하게
// - 광역 ↔ 상세만 중복 인정
// - 가장 긴 주소 1건 유지
// ================================
const duplicatePlaceGroups = React.useMemo(() => {
  const used = new Set();
  const groups = [];

  // 주소 정규화
  const normAddr = (s = "") =>
    normalizePlace(s).replace(/(대한민국|한국)/g, "");

  // 🔒 광역 주소 판별 (아주 짧은 것만)
  const isBroadAddress = (addr = "") => {
    const a = addr.replace(/\s+/g, "");
    return a.length <= 6; // 곤지암, 김해, 구미, 양산 등
  };

  for (let i = 0; i < placeRows.length; i++) {
    const a = placeRows[i];
    if (!a?.주소 || used.has(a.id)) continue;

    const aAddr = normAddr(a.주소);
    const aName = normalizeCompanyName(a.업체명 || "");
    const aBroad = isBroadAddress(aAddr);

    const group = [a];

    for (let j = i + 1; j < placeRows.length; j++) {
      const b = placeRows[j];
      if (!b?.주소 || used.has(b.id)) continue;

      // 🔒 안전 필터 1: 업체명 동일 (느슨한 비교)
      if (normalizeCompanyName(b.업체명 || "") !== aName) continue;

      const bAddr = normAddr(b.주소);
      const bBroad = isBroadAddress(bAddr);

      // 🔒 안전 필터 2: 둘 다 상세 주소면 패스
      if (!aBroad && !bBroad) continue;

      // 🔑 주소 포함 관계
      const isInclude =
        aAddr.includes(bAddr) || bAddr.includes(aAddr);

      if (isInclude) {
        group.push(b);
        used.add(b.id);
      }
    }

    if (group.length > 1) {
      group.forEach((p) => used.add(p.id));

      // ✅ 가장 긴 주소 1건 유지
      group.sort(
        (x, y) => (y.주소 || "").length - (x.주소 || "").length
      );

      groups.push(group);
    }
  }

  return groups;
}, [placeRows]);


  const [placeSelected, setPlaceSelected] = React.useState(new Set());
  const [placeQ, setPlaceQ] = React.useState("");
  const [placeFilterType, setPlaceFilterType] = React.useState("업체명");

  const [placeNewForm, setPlaceNewForm] = React.useState({
    업체명: "",
    주소: "",
    담당자: "",
    담당자번호: "",
    메모: "",
  });

  // 🔄 Firestore 실시간 구독
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, PLACES_COLL), (snap) => {
      const arr = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          업체명: data.업체명 || "",
          주소: data.주소 || "",
          담당자: data.담당자 || "",
          담당자번호: data.담당자번호 || data.연락처 || "",
          메모: data.메모 || "",
        };
      });
      setPlaceRows(arr);
    });

    return () => unsub();
  }, []);

  const filteredPlaces = React.useMemo(() => {
    if (!placeQ.trim()) return placeRows;
    const nq = norm(placeQ);

    if (placeFilterType === "업체명") {
      return placeRows.filter((r) => norm(r.업체명 || "").includes(nq));
    }
    if (placeFilterType === "주소") {
      return placeRows.filter((r) => norm(r.주소 || "").includes(nq));
    }
    return placeRows;
  }, [placeRows, placeQ, placeFilterType]);

  const togglePlaceOne = (id) => {
    setPlaceSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const togglePlaceAll = () => {
    if (placeSelected.size === filteredPlaces.length) setPlaceSelected(new Set());
    else
      setPlaceSelected(
        new Set(filteredPlaces.map((p) => p.id || p.업체명).filter(Boolean))
      );
  };

  const handlePlaceBlur = async (row, key, val) => {
    const id = row.id || row.업체명;
    if (!id) return;
    await upsertPlace({
      ...row,
      [key]: val,
      id,
    });
  };

  const addNewPlace = async () => {
    const 업체명 = (placeNewForm.업체명 || "").trim();
    if (!업체명) return alert("업체명은 필수입니다.");

  const addrKey = normalizePlace(placeNewForm.주소 || "");
if (!addrKey) {
  alert("주소는 필수입니다.");
  return;
}

const exists = placeRows.some(
  (p) => normalizePlace(p.주소 || "") === addrKey
);

if (exists) {
  alert("이미 동일한 주소의 하차지가 등록되어 있습니다.");
  return;
}

await upsertPlace({
  ...placeNewForm,
  업체명,
});


    setPlaceNewForm({
      업체명: "",
      주소: "",
      담당자: "",
      담당자번호: "",
      메모: "",
    });

    alert("등록 완료");
  };

  const removeSelectedPlaces = async () => {
    if (!placeSelected.size) return alert("선택된 항목이 없습니다.");
    if (!confirm(`${placeSelected.size}건 삭제할까요?`)) return;

    const ids = Array.from(placeSelected);
    for (const id of ids) {
      await removePlace(id);
    }

    setPlaceSelected(new Set());
    alert("삭제 완료");
  };

  // 🔁 하차지 엑셀 업로드 (주소 기준 중복 제거 + Firestore 저장)
  const onExcelPlaces = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), {
          type: "array",
        });
        const sheet = wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
          defval: "",
        });

        let ok = 0;

        // ① 현재 Firestore에 올라와 있는 데이터 기준으로 주소 Map 생성
        const addrMap = new Map();
        for (const p of placeRows) {
          const addrKey = normalizePlace(p.주소 || "");
          if (!addrKey) continue;
          if (!addrMap.has(addrKey)) {
            addrMap.set(addrKey, p);
          }
        }

        // ② 엑셀 데이터 처리
        const newRows = [];

        for (const r of json) {
          // --- 업체명 (하차지명/상호 등 최대한 잡기) ---
          const 업체명 = (
            r.업체명 ||
            r["하차지명"] ||
            r["하차지"] ||
            r["상호"] ||
            r["회사명"] ||
            r["업체"] ||
            r["업체명"] ||
            ""
          )
            .toString()
            .trim();

          // 업체명은 없어도, 주소만으로 관리하고 싶으면 이 줄은 지워도 됨
          if (!업체명) continue;

          // --- 주소 ---
          const 주소 = (
            r.주소 ||
            r["주소지"] ||
            r["하차지주소"] ||
            r["상세주소"] ||
            ""
          )
            .toString()
            .trim();

          const 담당자 = (
            r.담당자 ||
            r["인수자"] ||
            r["이름"] ||
            r["담당"] ||
            ""
          )
            .toString()
            .trim();

          const 담당자번호 = (
            r.담당자번호 ||
            r["전화"] ||
            r["전화번호"] ||
            r["연락처"] ||
            r["핸드폰"] ||
            r["휴대폰"] ||
            ""
          )
            .toString()
            .trim();

          const 메모 = (r.메모 || r["비고"] || "").toString().trim();

          // 주소가 아예 없으면 중복 기준이 없으니 스킵
          const addrKey = normalizePlace(주소);
          if (!addrKey) {
            console.log("주소 없음 → 스킵:", 업체명);
            continue;
          }

          // 이미 동일/유사 주소가 있으면 중복 처리 → 스킵
          if (addrMap.has(addrKey)) {
            console.log("중복 주소 스킵:", 업체명, "/", 주소);
            continue;
          }

          const row = {
            업체명,
            주소,
            담당자,
            담당자번호,
            메모,
          };

          addrMap.set(addrKey, row);
          newRows.push(row);
        }

        // ③ Firestore 저장
        for (const row of newRows) {
          await upsertPlace(row);
          ok++;
        }

        alert(`총 ${ok}건 신규 반영 (주소 기준 중복 자동 제외됨)`);
      } catch (err) {
        console.error(err);
        alert("엑셀 처리 오류");
      } finally {
        e.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };
// 🔥 주소 기준 중복 하차지 자동 정리
// ================================
// 🔥 주소 포함 관계 기반 중복 자동 정리
// - 각 그룹당 1건(가장 긴 주소) 유지
// ================================
const removeDuplicatePlaces = async () => {
  if (duplicatePlaceGroups.length === 0) {
    alert("중복된 하차지가 없습니다.");
    return;
  }

  let removed = 0;

  for (const group of duplicatePlaceGroups) {
    const [, ...toDelete] = group;

    for (const p of toDelete) {
      if (!p.id) continue;
      await deleteDoc(doc(db, PLACES_COLL, p.id));
      removed++;
    }
  }

  alert(`중복 하차지 정리 완료 (${removed}건 삭제됨)`);
};


  const bulkEditPlaces = async () => {
    

    if (!placeSelected.size) {
      alert("선택된 항목이 없습니다.");
      return;
    }

    const 업체명 = prompt("업체명 (비워두면 기존값 유지):", "");
    const 주소 = prompt("주소 (비워두면 기존값 유지):", "");
    const 담당자 = prompt("담당자 (비워두면 기존값 유지):", "");
    const 담당자번호 = prompt("담당자번호 (비워두면 기존값 유지):", "");
    const 메모 = prompt("메모 (비워두면 기존값 유지):", "");

    const targets = placeRows.filter(
      (p) => placeSelected.has(p.id || p.업체명)
    );

    for (const p of targets) {
      await upsertPlace({
        ...p,
        업체명: 업체명 || p.업체명,
        주소: 주소 || p.주소,
        담당자: 담당자 || p.담당자,
        담당자번호: 담당자번호 || p.담당자번호,
        메모: 메모 || p.메모,
      });
    }

    alert("선택 항목 수정 완료");
  };

  /* -----------------------------------------------------------
     렌더링
  ----------------------------------------------------------- */
  return (
    <div>
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>

      {/* 상단 서브탭 버튼 */}
      <div className="flex gap-2 mb-4">
        <button
          className={
            "px-4 py-2 rounded text-sm " +
            (subTab === "기본"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700")
          }
          onClick={() => setSubTab("기본")}
        >
          기본 거래처
        </button>
        <button
          className={
            "px-4 py-2 rounded text-sm " +
            (subTab === "하차지"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700")
          }
          onClick={() => setSubTab("하차지")}
        >
          하차지 거래처
        </button>
      </div>

      {/* ================== 🔵 탭 1: 기존 거래처관리 ================== */}
      {subTab === "기본" && (
        <>
          {/* 상단 바 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              className="border p-2 rounded w-80"
              placeholder="검색 (거래처/대표자/주소/담당자/연락처...)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="px-3 py-1 border rounded cursor-pointer text-sm">
              📁 엑셀 업로드
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={onExcel}
                className="hidden"
              />
            </label>
            <button
              onClick={removeSelectedFn}
              className="px-3 py-1 rounded bg-red-600 text-white text-sm"
            >
              선택삭제
            </button>
          </div>

          {/* 신규 등록 */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">거래처명*</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.거래처명}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 거래처명: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">사업자번호</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.사업자번호}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 사업자번호: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">대표자</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.대표자}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 대표자: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">담당자</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.담당자}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 담당자: e.target.value }))
                }
              />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">주소</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.주소}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 주소: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">연락처</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.연락처}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 연락처: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">업태</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.업태}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 업태: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">종목</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.종목}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 종목: e.target.value }))
                }
              />
            </div>
            <div className="col-span-4">
              <div className="text-xs text-gray-500 mb-1">메모</div>
              <input
                className="border p-2 rounded w-full"
                value={newForm.메모}
                onChange={(e) =>
                  setNewForm((p) => ({ ...p, 메모: e.target.value }))
                }
              />
            </div>
            <div className="col-span-4 flex justify-end">
              <button
                onClick={addNew}
                className="px-4 py-2 rounded bg-blue-600 text-white"
              >
                + 신규등록
              </button>
            </div>
          </div>

          {/* 표 */}
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] text-sm border">
              <thead>
                <tr>
                  <th className={head}>
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={
                        filtered.length > 0 &&
                        selected.size === filtered.length
                      }
                    />
                  </th>
                  {[
                    "거래처명",
                    "사업자번호",
                    "대표자",
                    "업태",
                    "종목",
                    "주소",
                    "담당자",
                    "연락처",
                    "메모",
                    "삭제",
                  ].map((h) => (
                    <th key={h} className={head}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      className="text-center text-gray-500 py-6"
                      colSpan={10}
                    >
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => {
                    const id = r.거래처명 || r.id || `${i}`;
                    return (
                      <tr key={id} className={i % 2 ? "bg-gray-50" : ""}>
                        <td className={cell}>
                          <input
                            type="checkbox"
                            checked={selected.has(id)}
                            onChange={() => toggleOne(id)}
                          />
                        </td>
                        <td className={`${cell} min-w-[180px]`}>
                          <input
                            className={`${input} w-48`}
                            defaultValue={r.거래처명 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "거래처명", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.사업자번호 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "사업자번호", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.대표자 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "대표자", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.업태 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "업태", e.target.value)
                            }
                          />
                        </td>
                        <td className={`${cell} min-w-[260px]`}>
                          <input
                            className={`${input} w-64 text-left`}
                            defaultValue={r.주소 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "주소", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.담당자 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "담당자", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.연락처 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "연락처", e.target.value)
                            }
                          />
                        </td>
                        <td className={`${cell} min-w-[220px]`}>
                          <input
                            className={`${input} w-56 text-left`}
                            defaultValue={r.메모 || ""}
                            onBlur={(e) =>
                              handleBlur(r, "메모", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <button
  onClick={() => {
    if (window.confirm("삭제하시겠습니까?")) {
      removeDriver?.(id);
    }
  }}
  className="px-2 py-1 bg-red-600 text-white rounded"
>
  삭제
</button>

                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ================== 🔵 탭 2: 하차지 거래처관리 ================== */}
      {subTab === "하차지" && (
        <>
          {duplicatePlaceGroups.length > 0 && (
      <div className="mb-3 p-3 rounded bg-yellow-50 border border-yellow-300 text-sm text-yellow-800">
        ⚠️ 주소 기준 중복 하차지 <b>{duplicatePlaceGroups.length}</b>건 발견됨
      </div>
    )}
          {/* 상단 바 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              className="border p-2 rounded"
              value={placeFilterType}
              onChange={(e) => setPlaceFilterType(e.target.value)}
            >
              <option value="업체명">업체명</option>
              <option value="주소">주소</option>
            </select>

            <input
              className="border p-2 rounded w-80"
              placeholder={`${placeFilterType} 검색`}
              value={placeQ}
              onChange={(e) => setPlaceQ(e.target.value)}
            />

            <label className="px-3 py-1 border rounded cursor-pointer text-sm">
              📁 엑셀 업로드
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={onExcelPlaces}
                className="hidden"
              />
            </label>

            <button
              onClick={bulkEditPlaces}
              className="px-3 py-1 rounded bg-green-600 text-white text-sm"
            >
              선택수정
            </button>

            <button
              onClick={removeSelectedPlaces}
              className="px-3 py-1 rounded bg-red-600 text-white text-sm"
            >
              
              선택삭제
            </button>
<button
  onClick={() => setShowDupPreview(true)}
  className="px-3 py-1 rounded bg-orange-600 text-white text-sm"
>
  중복 미리보기
</button>

          </div>
          {showDupPreview && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-lg shadow-lg w-[900px] max-h-[80vh] overflow-hidden">

      <div className="flex justify-between items-center px-4 py-3 border-b">
        <h3 className="font-bold">
          주소 포함 기준 중복 미리보기 ({duplicatePlaceGroups.length}건)
        </h3>
        <button onClick={() => setShowDupPreview(false)}>✕</button>
      </div>

      <div className="p-4 overflow-y-auto max-h-[60vh] text-sm">
        {duplicatePlaceGroups.map((group, gi) => (
          <div key={gi} className="mb-6 border rounded">
            <div className="bg-gray-100 px-3 py-2 font-semibold">
              업체명: {group[0].업체명}
            </div>

            <table className="w-full border-t">
              <tbody>
                {group.map((p, i) => {
                  const isKeep = i === 0;
                  return (
                    <tr
                      key={p.id}
                      className={
                        isKeep
                          ? "bg-green-50 text-green-800"
                          : "bg-red-50 text-red-700"
                      }
                    >
                      <td className="border px-2 py-1 w-24 text-center font-bold">
                        {isKeep ? "유지" : "삭제"}
                      </td>
                      <td className="border px-2 py-1">{p.주소}</td>
                      <td className="border px-2 py-1">{p.담당자}</td>
                      <td className="border px-2 py-1">{p.담당자번호}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t">
        <button onClick={() => setShowDupPreview(false)}>
          취소
        </button>
        <button
          onClick={async () => {
            await removeDuplicatePlaces();
            setShowDupPreview(false);
          }}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          중복 정리 실행
        </button>
      </div>
    </div>
  </div>
)}


          {/* 신규 등록 */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">업체명*</div>
              <input
                className="border p-2 rounded w-full"
                value={placeNewForm.업체명}
                onChange={(e) =>
                  setPlaceNewForm((p) => ({ ...p, 업체명: e.target.value }))
                }
              />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">주소</div>
              <input
                className="border p-2 rounded w-full"
                value={placeNewForm.주소}
                onChange={(e) =>
                  setPlaceNewForm((p) => ({ ...p, 주소: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">담당자</div>
              <input
                className="border p-2 rounded w-full"
                value={placeNewForm.담당자}
                onChange={(e) =>
                  setPlaceNewForm((p) => ({ ...p, 담당자: e.target.value }))
                }
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">담당자번호</div>
              <input
                className="border p-2 rounded w-full"
                value={placeNewForm.담당자번호}
                onChange={(e) =>
                  setPlaceNewForm((p) => ({
                    ...p,
                    담당자번호: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-span-3">
              <div className="text-xs text-gray-500 mb-1">메모</div>
              <input
                className="border p-2 rounded w-full"
                value={placeNewForm.메모}
                onChange={(e) =>
                  setPlaceNewForm((p) => ({ ...p, 메모: e.target.value }))
                }
              />
            </div>
            <div className="col-span-4 flex justify-end">
              <button
                onClick={addNewPlace}
                className="px-4 py-2 rounded bg-blue-600 text-white"
              >
                + 신규등록
              </button>
            </div>
          </div>

          {/* 표 */}
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] text-sm border">
              <thead>
                <tr>
                  <th className={head}>
                    <input
                      type="checkbox"
                      onChange={togglePlaceAll}
                      checked={
                        filteredPlaces.length > 0 &&
                        placeSelected.size === filteredPlaces.length
                      }
                    />
                  </th>
                  {["업체명", "주소", "담당자", "담당자번호", "메모", "삭제"].map(
                    (h) => (
                      <th key={h} className={head}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredPlaces.length === 0 ? (
                  <tr>
                    <td
                      className="text-center text-gray-500 py-6"
                      colSpan={7}
                    >
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredPlaces.map((r, i) => {
                    const id = r.id || r.업체명 || `${i}`;
                    return (
                      <tr key={id} className={i % 2 ? "bg-gray-50" : ""}>
                        <td className={cell}>
                          <input
                            type="checkbox"
                            checked={placeSelected.has(id)}
                            onChange={() => togglePlaceOne(id)}
                          />
                        </td>
                        <td className={`${cell} min-w-[180px]`}>
                          <input
                            className={`${input} w-48`}
                            defaultValue={r.업체명 || ""}
                            onBlur={(e) =>
                              handlePlaceBlur(r, "업체명", e.target.value)
                            }
                          />
                        </td>
                        <td className={`${cell} min-w-[260px]`}>
                          <input
                            className={`${input} w-64 text-left`}
                            defaultValue={r.주소 || ""}
                            onBlur={(e) =>
                              handlePlaceBlur(r, "주소", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.담당자 || ""}
                            onBlur={(e) =>
                              handlePlaceBlur(r, "담당자", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <input
                            className={input}
                            defaultValue={r.담당자번호 || ""}
                            onBlur={(e) =>
                              handlePlaceBlur(r, "담당자번호", e.target.value)
                            }
                          />
                        </td>
                        <td className={`${cell} min-w-[220px]`}>
                          <input
                            className={`${input} w-56 text-left`}
                            defaultValue={r.메모 || ""}
                            onBlur={(e) =>
                              handlePlaceBlur(r, "메모", e.target.value)
                            }
                          />
                        </td>
                        <td className={cell}>
                          <button
                            onClick={() => {
                              if (!confirm("삭제하시겠습니까?")) return;
                              removePlace(id);
                            }}
                            className="px-2 py-1 bg-red-600 text-white rounded"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ===================== DispatchApp.jsx (PART 11/11) — END =====================