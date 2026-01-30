// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis
} from "recharts";
import * as XLSX from "xlsx";
import { sendOrderTo24Proxy as sendOrderTo24 } from "../api/24CallProxy";
import AdminMenu from "./AdminMenu";
import { calcFare } from "./fareUtil";
import FixedClients from "./FixedClients";
import FleetManagement from "./FleetManagement";
import HomeDashboard from "./HomeDashboard";
import StandardFare from "./StandardFare";

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
const VEHICLE_TYPES = ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑"];
const PAY_TYPES = ["계산서", "착불", "선불", "계좌이체"];
const DISPATCH_TYPES = ["24시", "인성", "직접배차", "24시(외부업체)"];

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
const safeSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

/* -------------------------------------------------
   거래처 정규화
--------------------------------------------------*/
function normalizeClient(row) {
  if (!row) return null;
  if (typeof row === "string") return { 거래처명: row, 사업자번호: "", 사업자명: "", 메모: "" };
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
function normalizeClients(arr) {
  if (!Array.isArray(arr)) return [];
  const mapped = arr.map(normalizeClient).filter(Boolean).map(c => ({
    거래처명: c.거래처명 || "", 사업자번호: c.사업자번호 || "", 대표자: c.대표자 || c.사업자명 || "",
    업태: c.업태 || "", 종목: c.종목 || "", 주소: c.주소 || "", 담당자: c.담당자 || "", 연락처: c.연락처 || "", 메모: c.메모 || ""
  }));
  const map = new Map(); mapped.forEach(c => map.set(c.거래처명, c));
  return Array.from(map.values());
}
/* -------------------------------------------------
   배차 수정 이력 생성 함수 (⭐ 반드시 필요)
--------------------------------------------------*/
function makeDispatchHistory({ userEmail, field, before, after }) {
  return {
    at: Date.now(),
    user: userEmail || "unknown",
    field,
    before,
    after,
  };
}
/* -------------------------------------------------
   🔕 수정이력 제외 필드 (전역 공통)  ⭐⭐⭐ 여기!!!
--------------------------------------------------*/
const IGNORE_HISTORY_FIELDS = new Set([
  "history",
  "updatedAt",
  "createdAt",
  "lastUpdated",
  "__system",
  "배차상태",
  "이름",
  "전화번호",
]);

/* -------------------------------------------------
   Firebase
--------------------------------------------------*/
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "./firebase";


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


function useRealtimeCollections(user) {
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

  useEffect(() => {
    if (!user) { setDispatchData([]); setDrivers([]); setClients([]); return; }

    const unsubs = [];
    const userRole = localStorage.getItem("role") || "user";
    const collName = getCollectionName(userRole);

    unsubs.push(
      onSnapshot(collection(db, collName), (snap) => {
        const arr = snap.docs.map(d => {
          const data = d.data() || {};
          return {
            _id: d.id, // ⭐⭐⭐ 이게 핵심
            ...data,
            경유지_상차: Array.isArray(data.경유지_상차) ? data.경유지_상차 : [],
            경유지_하차: Array.isArray(data.경유지_하차) ? data.경유지_하차 : [],
          };
        });

        setDispatchData(arr);
        safeSave("dispatchData", arr);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, COLL.drivers), (snap) => {
        const arr = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        }));
        setDrivers(arr);
        safeSave("drivers", arr);
      })
    );
    unsubs.push(onSnapshot(collection(db, COLL.clients), (snap) => {
      const arr = snap.docs.map(d => d.data());
      setClients(normalizeClients(arr));
      safeSave("clients", arr);
    }));

    return () => unsubs.forEach(u => u && u());
  }, [user]);

  const addDispatch = async (record) => {
    const _id =
      record._id ||
      crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`;

    // 🔥 undefined 제거 (이게 핵심)
    const cleanRecord = stripUndefinedDeep({
      ...record,
      _id,
      작성자: auth.currentUser?.email || "",
    });

    await setDoc(
      doc(db, COLL.dispatch, _id),
      cleanRecord
    );
  };
  // 🔥 undefined 깊이 제거 (중첩 객체까지 안전)
  const stripUndefinedDeep = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;

    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)])
    );
  };

  const patchDispatch = async (_id, patch) => {
    if (!_id) return;

    const ref = doc(db, COLL.dispatch, _id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const prev = snap.data();

    const cleanPatch = stripUndefinedDeep({
      ...patch,
      경유지_상차: Array.isArray(patch.경유지_상차)
        ? patch.경유지_상차
        : prev.경유지_상차 || [],
      경유지_하차: Array.isArray(patch.경유지_하차)
        ? patch.경유지_하차
        : prev.경유지_하차 || [],
    });


    const histories = [];

    Object.keys(cleanPatch).forEach((key) => {
      if (IGNORE_HISTORY_FIELDS.has(key)) return;
      if (cleanPatch.__system === true) return;

      // 🔥 전달상태 변경은 이력에 남기지 않음 (정렬 고정)
      if (key === "업체전달상태") return;
      if (key === "업체전달일시") return;

      if (prev[key] !== cleanPatch[key]) {
        histories.push(
          makeDispatchHistory({
            userEmail: auth.currentUser?.email,
            field: key,
            before: prev[key] ?? null,
            after: cleanPatch[key] ?? null,
          })
        );
      }
    });


    // ✅ updateDoc 사용 (merge + undefined 문제 제거)
    await updateDoc(ref, {
      ...cleanPatch,
      작성자: auth.currentUser?.email || "",
      history: [...(prev.history || []), ...histories],
    });
  };


  const removeDispatch = async (arg) => {
    const id = typeof arg === "string" ? arg : arg?._id;
    if (!id) return;
    await deleteDoc(doc(db, COLL.dispatch, id));
  };


  const upsertDriver = async (driver) => {
  const id = driver.id || crypto.randomUUID();
  if (!id) throw new Error("driver id 없음");

  const data = {
    ...driver,
    id,
    updatedAt: serverTimestamp(),
    createdAt: driver.createdAt || serverTimestamp(),
  };

  await setDoc(
    doc(db, COLL.drivers, id),
    data,
    { merge: true }
  );

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
      contacts: Array.isArray(place.contacts)
   ? place.contacts
   : [{
       name: (place.담당자 || "").trim(),
       phone: (place.담당자번호 || "").trim(),
       isPrimary: true,
     }],
      isActive: place.isActive !== false, // ⭐ 추가
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
  <span className={`px-2 py-1 rounded text-xs ${s === "배차완료" ? "bg-green-100 text-green-700"
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
// ===================== TOAST SYSTEM (GLOBAL) =====================
const ToastContext = React.createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const showToast = (message, type = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* 오른쪽 하단 배너 알림 */}
      <div className="fixed bottom-6 right-6 z-[9999] space-y-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className="bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const useToast = () => React.useContext(ToastContext);
// ===================== TOAST SYSTEM END =====================

export {
  cellBase, COMPANY, DISPATCH_TYPES,
  headBase, inputBase, PAY_TYPES, todayStr, VEHICLE_TYPES
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
  /* =================================================
     📌 전달상태 계산 (오늘 이전 자동 전달완료)
     👉 DispatchStatus 내부 / 날짜 유틸 바로 아래
  ================================================= */
  const getDeliveryStatus = (row) => {
    const today = todayStr();      // ← 이미 쓰고 있는 todayStr 그대로 사용
    const d =
      row?.상차일자 ||
      row?.상차일 ||
      row?.상차 ||
      "";

    // 1️⃣ DB에 명시된 값이 있으면 그걸 최우선
    if (row.업체전달상태) return row.업체전달상태;

    // 2️⃣ 오늘 이전 상차 → 자동 전달완료
    if (d && d < today) return "전달완료";

    // 3️⃣ 오늘 / 미래
    return "미전달";
  };
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
  // ⭐ 오늘 미배차 = 처리 필요 건수
  const pendingToday = useMemo(() => {
    if (!dispatchData || !user) return 0;

    const todayStrKST = today;

    return dispatchData.filter((d) => {
      // 날짜 파싱
      const dt = parseDate(d?.상차일자 || d?.상차일 || d?.상차);
      if (!dt) return false;

      const dateKST = toYMD_KST(dt);

      // admin은 전체, user는 본인 것만
      const isMine =
        role === "admin" ? true : (!d?.작성자 || d.작성자 === user.email);

      // ⭐ 핵심: 오늘 + 차량번호 없음 = 미배차
      return (
        isMine &&
        dateKST === todayStrKST &&
        (!d.차량번호 || !String(d.차량번호).trim())
      );
    }).length;
  }, [dispatchData, user, role, today]);

  // ===================== 홈 트렌드 데이터 (시간대별 오더 수) =====================
  const trendData = useMemo(() => {
    const hourly = {};

    dispatchData.forEach((r) => {
      const h = String(r?.상차시간 || "").match(/(\d+)/);
      const hour = h ? Number(h[1]) : null;

      if (hour !== null && hour >= 0 && hour <= 23) {
        hourly[hour] = (hourly[hour] || 0) + 1;
      }
    });

    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}시`,
      count: hourly[i] || 0,
    }));
  }, [dispatchData]);

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

  const [menu, setMenu] = useState("HOME");

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
    <ToastProvider>
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
            "HOME",
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
            ${isBlocked
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
        {menu === "HOME" && (
          <HomeDashboard
            role={role}
            user={user}
            todayStats={todayStats}
            myStats={myStats}
            pending={pendingToday}
            delayed={0}
            dispatchData={dispatchDataFiltered}
          />
        )}

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
            placeRows={places}
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
            places={places}
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
                className={`px-3 py-1 text-sm rounded ${subMenu === "고정거래처관리"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200"
                  }`}
                onClick={() => setSubMenu("고정거래처관리")}
              >
                고정거래처관리
              </button>

              <button
                className={`px-3 py-1 text-sm rounded ${subMenu === "지입차관리"
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
    </ToastProvider>
  );
}
// ===================== DispatchApp.jsx (PART 2/8) — END =====================

// ===================== DispatchApp.jsx (PART 3/8) — START =====================
function ToggleBadge({ active, onClick, activeCls, inactiveCls, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-1.5
        rounded-full
        text-xs font-semibold
        border
        transition
        active:scale-95
        ${active ? activeCls : inactiveCls}
      `}
    >
      {children}
    </button>
  );
}
  function DispatchManagement({
    dispatchData, drivers, clients, timeOptions, tonOptions,
    addDispatch, upsertDriver, upsertClient, upsertPlace,
    patchDispatch, removeDispatch,
    placeRows = [],
    role = "admin",
    isTest = false,  // ★ 추가!
  }) {
    function getAiRecommendedFare({ historyList, form }) {
  if (!historyList || historyList.length === 0) {
    return { fare: null, reason: "NO_HISTORY" };
  }

  const curPallet = getPalletFromCargoText(form.화물내용);
  const curTon = extractTonNum(form.차량톤수);
  const curCarType = form.차량종류 || "";
  const isCold = /냉장|냉동/.test(curCarType);

  // 🔹 1. 거의 동일 + 최신
  const exact = historyList
    .filter(r => {
      const p = getPalletFromCargoText(r.화물내용);
      const t = extractTonNum(r.차량톤수);
      const sameCold = /냉장|냉동/.test(r.차량종류 || "") === isCold;

      return (
        sameCold &&
        p != null &&
        curPallet != null &&
        p === curPallet &&
        t != null &&
        curTon != null &&
        Math.abs(t - curTon) <= 0.5
      );
    })
    .sort((a, b) => new Date(b.상차일) - new Date(a.상차일));

  if (exact.length > 0) {
    const fare = Math.round(Number(exact[0].청구운임) / 10000) * 10000;
    return { fare, reason: "EXACT" };
  }

  // 🔹 2. 전체 유사도
  const scored = historyList.map(r => {
    let score = 0;

    const p = getPalletFromCargoText(r.화물내용);
    const t = extractTonNum(r.차량톤수);
    const sameCold = /냉장|냉동/.test(r.차량종류 || "") === isCold;

    if (sameCold) score += 50;
    if (p != null && curPallet != null) {
      const d = Math.abs(p - curPallet);
      if (d === 0) score += 40;
      else if (d === 1) score += 20;
    }
    if (t != null && curTon != null) {
      const d = Math.abs(t - curTon);
      if (d === 0) score += 30;
      else if (d <= 0.5) score += 15;
    }

    return { r, score };
  });

  const best = scored
    .filter(s => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.r.상차일) - new Date(a.r.상차일);
    })[0];

  if (!best) return { fare: null, reason: "NO_MATCH" };

  const fare = Math.round(Number(best.r.청구운임) / 10000) * 10000;
  return { fare, reason: "GLOBAL_SIMILAR" };
}

    const [placeRowsTrigger, setPlaceRowsTrigger] = React.useState(0);
      const [aiRecommend, setAiRecommend] = React.useState(null);
      const [aiPopupOpen, setAiPopupOpen] = React.useState(false);
      const [areaFareHint, setAreaFareHint] = React.useState(null);
      const [fareHistoryOpen, setFareHistoryOpen] = React.useState(false);
      const [guideHistoryList, setGuideHistoryList] = React.useState([]);

      // ================================
  // 🔑 업체명 Key 정규화 함수(추가!)
  // ================================
  function normalizeKey(str = "") {
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9가-힣]/g, "")
.replace(/쉬/g, "시")
.replace(/씨제이/g, "cj")
.replace(/제이/g, "j")
.replace(/프레쉬/g, "프레시")
.replace(/물류/g, "")
.replace(/유통/g, "")
  }
  // ================================
// 📍 주소 → 검색 키워드 세트 생성 (곤지암 / 강서구 대응)
// ================================
function extractAreaTokens(addr = "") {
  const s = String(addr).trim();
  if (!s) return [];

  // 공백, 특수문자 제거
  const clean = s.replace(/[^\w가-힣]/g, "");

  const tokens = new Set();

  // 1️⃣ 시/도
  const sido = clean.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/
  )?.[1];
  if (sido) tokens.add(sido);

  // 2️⃣ 시/군/구
  const sigungu = clean.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/)?.[1];
  if (sigungu) tokens.add(sigungu);
  // ⭐️ [추가] "강남" → "강남구" 보정
if (!sigungu && clean.length >= 2) {
  tokens.add(clean);        // 강남
  tokens.add(clean + "구"); // 강남구
}

  // 3️⃣ 읍/면/동 (곤지암, 장지동 같은 케이스)
  const eupmyeondong = clean.match(/([가-힣]+읍|[가-힣]+면|[가-힣]+동|[가-힣]{2,})/g);
  if (eupmyeondong) {
    eupmyeondong.forEach(t => {
      if (t.length >= 2) tokens.add(t);
    });
  }
   return Array.from(tokens);
}
// ================================
// 🔍 두 주소가 같은 지역인지 판단
// ================================
function isAreaMatch(inputAddr, rowAddr) {
  const inputTokens = extractAreaTokens(inputAddr);
  const rowText = String(rowAddr || "").replace(/\s+/g, "");

  return inputTokens.some(t => rowText.includes(t));
}
 // ================================
// 📍 주소 → 조회용 행정구 단위로 축소
// 예: "인천 서구 북항로 28-29" → "인천 서구"
// ================================
function normalizeAreaForSearch(addr = "") {
  const s = String(addr).trim();
  if (!s) return "";

  const sido =
    s.match(
      /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/
    )?.[1] || "";

  const sigungu =
    s.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/)?.[1] || "";

  // ⭐ 핵심: 행정구 추출 실패 시 → 원문 그대로
  if (!sido && !sigungu) {
    return s;
  }

  return `${sido} ${sigungu}`.trim();
}

// ================================
// 🚚 차량종류 그룹화 (최종)
// ================================
function normalizeVehicleGroup(type = "") {
  const t = String(type).replace(/\s+/g, "");

  // 🛵 오토바이 (완전 분리)
  if (t.includes("오토바이") || t.includes("바이크")) {
    return "MOTOR";
  }

  // ❄ 냉장 / 냉동 계열 (톤수·형태 무시)
  if (t.includes("냉장") || t.includes("냉동")) {
    return "COLD";
  }

  // 🚐 소형차
  if (t.includes("라보") || t.includes("다마스")) {
    return "SMALL";
  }

  // 🚚 일반 화물차
  if (
    t.includes("카고") ||
    t.includes("윙") ||
    t.includes("윙바디") ||
    t.includes("탑") ||
    t.includes("탑차") ||
    t.includes("리프트")
  ) {
    return "GENERAL";
  }

  return "ETC";
}

// ================================
// 🚛 차량톤수 숫자 추출 (전역 공용)
// ================================
function extractTonNum(text = "") {
  if (!text) return null;

  const s = String(text).replace(/\s+/g, "");

  // 1️⃣ "1톤", "2.5톤"
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);

  return null;
}

  // ================================
// 🔍 날짜 문자열 판별 (오더복사용)
// ================================
const isDateLike = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
// ===============================
// 📤 즉시공유 텍스트 생성
// ===============================
function makeInstantShareText(form) {
  // 날짜: 1월 15일 목요일
  const d = form.상차일 ? new Date(form.상차일) : null;
  const dateStr = d
    ? `${d.getMonth() + 1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일`
    : "";

  // 시간 기본값 처리
  const pickupTime = form.상차시간?.trim() || "즉시";
  const dropTime   = form.하차시간?.trim() || "즉시";

  // 중량 / 파렛트
  const weight = form.차량톤수 || "3,000kg";
  const pallet = form.화물내용 || "";

  return `${dateStr}

상차지 :
${form.상차지명 || "-"}
주소 : ${form.상차지주소 || "-"}
${form.상차지담당자 || ""}${form.상차지담당자번호 ? ` (${form.상차지담당자번호})` : ""}

상차시간 : ${pickupTime}
하차시간 : ${dropTime}

하차지 : ${form.하차지명 || "-"}
${form.하차지주소 || "-"}
담당자 : ${form.하차지담당자 || "-"}
${form.하차지담당자번호 || "-"}

중량 : ${weight}${pallet ? ` / ${pallet}` : ""}
${form.차량종류 || ""}
// 🔽 기사 전달사항 (있을 때만 출력)
${form.전달사항?.trim()
  ? `\n\n📢 기사 전달사항\n${form.전달사항.trim()}`
  : ""
}

${form.차량번호 || "-"} ${form.이름 || "-"} ${form.전화번호 || "-"}
${Number(form.청구운임 || 0).toLocaleString()}원 부가세별도 배차되었습니다.`.trim();
}

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
  담당자목록: Array.isArray(p.담당자목록)
    ? p.담당자목록
    : p.담당자 && p.담당자번호
    ? [{
        이름: p.담당자,
        번호: p.담당자번호,
        대표: true,
      }]
    : [],
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
if (!firestoreKeys.has(key) && !raw.__temp) return;
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
// ⭐ 실시간배차현황(하단 테이블) 상태 변경 확인 팝업
const [confirmChange, setConfirmChange] = React.useState(null);
/*
{
  rowId,
  key,
  before,
  after
}
*/

// ================================
// 🔥 거래처/하차지 중복 확인 팝업 상태
// ================================
const [dupPopup, setDupPopup] = React.useState({
  open: false,
  input: null,      // { name, addr, manager, phone }
  candidates: [],   // normalizeKey 기준 유사 업체 목록
});

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
const stripUndefined = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
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
// 🚗 차량종류 자동완성 상태
const [vehicleQuery, setVehicleQuery] = React.useState("");
const [showVehicleDropdown, setShowVehicleDropdown] = React.useState(false);
const [vehicleActive, setVehicleActive] = React.useState(0);
const vehicleItemRefs = React.useRef([]);
React.useEffect(() => {
  if (!showVehicleDropdown) return;

  const el = vehicleItemRefs.current[vehicleActive];
  if (el) {
    el.scrollIntoView({
      block: "nearest",   // 드롭다운 내부에서만 이동
      inline: "nearest",
    });
  }
}, [vehicleActive, showVehicleDropdown]);
const [pickupActive, setPickupActive] = React.useState(0);

const [showPlaceDropdown, setShowPlaceDropdown] = React.useState(false);
const [placeOptions, setPlaceOptions] = React.useState([]);
const [placeActive, setPlaceActive] = React.useState(0);
    // ---------- 🔧 안전 폴백 유틸(다른 파트 미정의 시 자체 사용) ----------
    const _todayStr = (typeof todayStr === "function")
      ? todayStr
      : () => new Date().toISOString().slice(0, 10);
    
       // ===================== 하차지(placeRows) + 로컬 병합 placeList 끝 =====================

// ⭐ 업체명 "완전 동일"만 기존으로 판단
const findPlaceByName = (name) => {
  const nk = normalizeKey(name);
  return placeList.find(
    (p) => normalizeKey(p.업체명 || "") === nk
  );
};
// ⭐ 대표 담당자 추출 유틸 (🔥 반드시 필요)
function getPrimaryManager(place) {
  if (!place || !Array.isArray(place.담당자목록)) return null;
  return place.담당자목록.find(m => m.대표) || null;
}
const openNewPlacePrompt = (name) => {
  const addr = prompt("주소 (선택)");
  if (addr === null) return;

  const manager = prompt("담당자 (선택)");
  if (manager === null) return;

  const phone = prompt("연락처 (선택)");
  if (phone === null) return;

  // 🔥 최종 확인
  const ok = window.confirm(
    `신규 거래처를 등록하시겠습니까?\n\n` +
    `업체명: ${name}\n` +
    `주소: ${addr || "-"}\n` +
    `담당자: ${manager || "-"}\n` +
    `연락처: ${phone || "-"}`
  );

  if (!ok) return; // ❌ 여기서 완전 중단

  savePlaceSmart(
    name,
    addr || "",
    manager || "",
    phone || ""
  );

  alert("신규 거래처 등록이 완료되었습니다.");
};

// ⭐ 업체 업데이트 + 신규 생성 자동 처리
const savePlaceSmart = (name, addr, manager, phone) => {
  // ================================
// ➕ 상차지 신규 담당자 등록
// ================================
const handleRegisterPickupManager = async () => {
  if (!pickupPlace) return;

  await upsertPlace({
    업체명: pickupPlace.업체명,
    주소: pickupPlace.주소,
    담당자: form.상차지담당자,
    담당자번호: form.상차지담당자번호,
  });

  try {
    setPlaceRowsTrigger(Date.now());
  } catch {}

  alert("상차지 신규 담당자가 등록되었습니다.");
};
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
// 🔥 신규/업데이트 후 자동완성 즉시 반영
const newLocal = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
setPickupOptions(newLocal);
setPlaceOptions(newLocal);
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
// ✅ 신규 업체 생성 (담당자까지 같이 저장해야 함)
upsertPlace({
  업체명: name,
  주소: addr,
  담당자목록: manager && phone
    ? [{
        이름: manager,
        번호: phone,
        대표: true,
      }]
    : [],
});

// 🔥 신규 생성 후에도 반드시 트리거
try {
  setPlaceRowsTrigger(Date.now());
} catch {}

};

    // 기본 clients + 하차지 모두 포함한 통합 검색 풀
const mergedClients = React.useMemo(() => {
  const map = new Map();

  // ✅ 1️⃣ placeList를 먼저 넣는다 (주소/담당자 기준)
  placeList.forEach(p => {
    const key = normalizeKey(p.업체명);
    if (key) map.set(key, p);
  });

  // ✅ 2️⃣ clients는 "보조 검색용"으로만 사용
  clients.forEach(c => {
    const key = normalizeKey(c.업체명);
    if (!key) return;

    // placeList에 없을 때만 추가
    if (!map.has(key)) {
      map.set(key, {
        업체명: c.업체명,
        주소: "",
        담당자: "",
        담당자번호: "",
      });
    }
  });

  return Array.from(map.values());
}, [placeList, clients]);

    // 이름 기준으로 하차지/기본거래처 찾기
    const findClient = (name = "") => {
      const n = normalizeKey(name);
      return mergedClients.find(
        (c) => normalizeKey(c.업체명 || "").includes(n)
      );
    };
    // 🚗 차량종류 자동완성 필터 (★ 반드시 전역)
const filterVehicles = (q) => {
  const query = String(q || "").trim();
  if (!query) return VEHICLE_TYPES;

  const nq = normalizeKey(query);
  return VEHICLE_TYPES.filter((v) =>
    normalizeKey(v).includes(nq)
  );
};
    // 🔍 하차지 자동완성 필터 함수
    const filterPlaces = (q) => {
      
  const query = String(q || "").trim();
  if (!query) return [];

  const nq = normalizeKey(query);
  const nLower = query.toLowerCase();

  return mergedClients
    .map((p) => {
      const name = p.업체명 || "";
      const nName = name.toLowerCase();
      const nk = normalizeKey(name);

      let score = 0;

      // 1️⃣ 완전 동일
      if (name === query) score = 100;
      // 2️⃣ normalizeKey 동일 (띄어쓰기/철자차이)
      else if (nk === nq) score = 90;
      // 3️⃣ 시작 문자열
      else if (nName.startsWith(nLower)) score = 80;
      else if (nk.startsWith(nq)) score = 70;
      // 4️⃣ 포함
      else if (nName.includes(nLower)) score = 60;
      else if (nk.includes(nq)) score = 50;

      return score > 0 ? { ...p, __score: score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.__score - a.__score);
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
      운행유형: "편도",   // ⭐ 추가 (기본값)
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
      메모중요도: "NORMAL",
      전달사항: "",
      전달사항고정: false,
      배차상태: "배차중",
      독차: false,
      혼적: false,
      긴급: false,
      운임보정: null,
    };

    const [form, setForm] = React.useState(() => {
  try {
    const saved = localStorage.getItem("dispatchForm");
    if (saved) {
      return {
        ...emptyForm,
        ...JSON.parse(saved),
      };
    }
  } catch {}
  return { ...emptyForm };
});
// ===============================
// 💡 주소/조건 기반 자동 운임 가이드
// ===============================
React.useEffect(() => {
  if (!form.상차지주소 || !form.하차지주소) {
    setAreaFareHint(null);
    return;
  }

  const ton = extractTonNum(form.차량톤수);

  const hint = calcNationwideAvgFare({
    pickupAddr: form.상차지주소,
    dropAddr: form.하차지주소,
    ton,
    cargo: form.화물내용,
    vehicle: form.차량종류,
    dispatchData,
  });

  setAreaFareHint(hint);
}, [
  form.상차지주소,
  form.하차지주소,
  form.화물내용,
  form.차량톤수,
  form.차량종류,
  dispatchData,
]);

    React.useEffect(() => _safeSave("dispatchForm", form), [form]);
    // ===============================
// ⭐ 폼 최초 로딩 시 날짜 자동 보정
// ===============================
React.useEffect(() => {
  const today = _todayStr();

  if (form.상차일 && form.상차일 < today) {
    setForm((p) => ({
      ...p,
      등록일: today,
      상차일: today,
      하차일: today,
    }));
  }
  // eslint-disable-next-line
}, []);
// ===============================
// 💰 주소 기반 전국 평균 운임 계산 (정확 톤수 기준)
// ===============================
function calcNationwideAvgFare({
  pickupAddr,
  dropAddr,
  ton,
  cargo,
  vehicle,
  dispatchData,
}) {

  // 1️⃣ 주소 기준 (무조건)
let base = (dispatchData || []).filter(r => {
  const pickupOk = isAreaMatch(
    pickupAddr,
    r.상차지주소 || r.상차지명
  );

  const dropOk = isAreaMatch(
    dropAddr,
    r.하차지주소 || r.하차지명
  );

  return pickupOk && dropOk && r.청구운임;
});


  if (base.length < 2) return null;

  let list = base;
  let level = "주소";
  // ⭐ 주소 기준이라도 차량종류는 반드시 고정 (중요!!)
if (vehicle) {
  const vg = normalizeVehicleGroup(vehicle);
  list = list.filter(
    r => normalizeVehicleGroup(r.차량종류) === vg
  );
}
  // 2️⃣ 차량종류
  if (vehicle) {
    const vg = normalizeVehicleGroup(vehicle);
    const f = list.filter(
      r => normalizeVehicleGroup(r.차량종류) === vg
    );
    if (f.length >= 2) {
      list = f;
      level = "차량";
    }
  }
  // 3️⃣ 톤수 (이전 단계 list 기준)
  if (ton != null) {
    const f = list.filter(r => {
      const rt = extractTonNum(r.차량톤수);
      return rt != null && Math.abs(rt - ton) <= 0.5;
    });
    if (f.length >= 2) {
      list = f;
      level = "톤수";
    }
  }

  // 4️⃣ 화물내용 (파렛트)
  const pallet = getPalletFromCargoText(cargo);
  if (pallet != null) {
    const f = list.filter(r => {
      const rp = getPalletFromCargoText(r.화물내용);
      return rp != null && Math.abs(rp - pallet) <= 1;
    });
    if (f.length >= 2) {
      list = f;
      level = "화물";
    }
  }

  const fares = list.map(r =>
    Number(String(r.청구운임).replace(/[^\d]/g, ""))
  );

return {
  level,
  min: Math.min(...fares),
  max: Math.max(...fares),
  avg: Math.round(fares.reduce((a,b)=>a+b,0) / fares.length),
  count: fares.length,

pickupLabel: normalizeAreaForSearch(pickupAddr),
dropLabel: normalizeAreaForSearch(dropAddr),
};
}
// ===============================
// 🤖 AI 배차/운임 추천 (HERE)
// ===============================
React.useEffect(() => {
  const pickup = form.상차지명?.trim();
  const drop   = form.하차지명?.trim();
  const ton    = extractTonNum(form.차량톤수);
  const vehicle = form.차량종류;

  if (!pickup || !drop || !ton) {
    setAiRecommend(null);
    return;
  }

const similar = (dispatchData || []).filter(r =>
  (r.운행유형 || "편도") === form.운행유형 &&   // ⭐ 추가
  normalizeKey(r.상차지명) === normalizeKey(pickup) &&
  normalizeKey(r.하차지명) === normalizeKey(drop) &&
  extractTonNum(r.차량톤수) === ton &&
  r.청구운임 &&
  r.기사운임
);

  if (similar.length < 1) {
    setAiRecommend(null);
    return;
  }

  const fares = similar.map(r => Number(String(r.청구운임).replace(/[^\d]/g, "")));
  const drivers = similar.map(r => Number(String(r.기사운임).replace(/[^\d]/g, "")));

  const avg = (arr) => Math.round(arr.reduce((a,b)=>a+b,0) / arr.length);

  const fareAvg = avg(fares);
  const driverAvg = avg(drivers);

const inputFare = Number(form.청구운임 || 0);

setAiRecommend({
  vehicle: vehicle || "자동",
  fareAvg,
  fareMin: Math.round(fareAvg * 0.9),
  fareMax: Math.round(fareAvg * 1.1),
  driverAvg,
  marginPercent: Math.round(((fareAvg - driverAvg) / fareAvg) * 100),
  sampleCount: similar.length,

  hasInputFare: inputFare > 0,   // ⭐ 핵심

  isOutlier:
    inputFare > 0 &&
    Math.abs((inputFare - fareAvg) / fareAvg) >= 0.25,
});



}, [
  form.상차지명,
  form.하차지명,
  form.차량톤수,
  form.차량종류,
  dispatchData,
]);
// ===============================
// 🤖 AI 설명 문장 생성
// ===============================
function makeAiExplain(ai) {
  if (!ai) return "";

  // ① 운임 미입력
  if (!ai.hasInputFare) {
    return (
      `최근 동일 조건 운송 ${ai.sampleCount}건 기준 ` +
      `추천 운임 범위는 ${ai.fareMin.toLocaleString()} ~ ` +
      `${ai.fareMax.toLocaleString()}원 입니다.`
    );
  }

  // ② 이상치
  if (ai.isOutlier) {
    return (
      `최근 동일 조건 운송 ${ai.sampleCount}건 기준 ` +
      `평균 운임은 ${ai.fareAvg.toLocaleString()}원이며, ` +
      `입력한 운임은 평균 대비 차이가 큽니다.`
    );
  }

  // ③ 정상
  return (
    `최근 동일 조건 운송 ${ai.sampleCount}건 기준 ` +
    `평균 운임은 ${ai.fareAvg.toLocaleString()}원이며, ` +
    `입력한 운임은 통계 범위 내의 적정 금액입니다.`
  );
}


    // =====================
    // ⭐ 거래처 = 하차지거래처 기반으로 자동완성
    // =====================
    const norm = (s = "") => String(s).trim().toLowerCase();

    // placeRows = [{업체명, 주소, 담당자, 담당자번호}]
    const filteredClients = React.useMemo(() => {
  const q = norm(clientQuery);
  if (!q) return placeList;

  const nq = normalizeKey(q);

  return placeList
    .map(p => {
      const name = p.업체명 || "";
      const nName = norm(name);
      const nk = normalizeKey(name);

      let score = 0;

      // 1️⃣ 완전 동일
      if (name === clientQuery) score = 100;
      // 2️⃣ normalizeKey 동일
      else if (nk === nq) score = 90;
      // 3️⃣ 시작 문자열
      else if (nName.startsWith(q)) score = 80;
      // 4️⃣ normalizeKey 시작
      else if (nk.startsWith(nq)) score = 70;
      // 5️⃣ 포함
      else if (nName.includes(q)) score = 60;
      else if (nk.includes(nq)) score = 50;
      else score = 0;

      return { ...p, __score: score };
    })
    .filter(p => p.__score > 0)
    .sort((a, b) => b.__score - a.__score);
}, [clientQuery, placeList]);

// ⭐ 거래처 선택 시 → 어디에 적용할지 팝업 오픈
function applyClientSelect(name) {
  const p = placeList.find(
    x => norm(x.업체명 || "") === norm(name)
  );
const primary = getPrimaryManager(p);
  // ✅ 거래처 → 상차지 자동 적용
  if (p) {
    setForm(prev => ({
      ...prev,
      거래처명: p.업체명,

      // 🔥 상차지 자동 세팅
      상차지명: p.업체명,
      상차지주소: p.주소 || "",
      상차지담당자: primary?.이름 || "",
      상차지담당자번호: primary?.번호 || "",
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
  const primary = getPrimaryManager(place); // ⭐ 핵심

  setForm(prev => ({
    ...prev,
    거래처명: place.업체명,
    상차지명: place.업체명,
    상차지주소: place.주소 || "",
    상차지담당자: primary?.이름 || "",
    상차지담당자번호: primary?.번호 || "",
  }));

  setPlaceTargetPopup({ open: false, place: null });
}

// ⭐ 하차지에 적용 (applyToPickup 바로 아래)
function applyToDrop(place) {
  const primary = getPrimaryManager(place);

  setForm(prev => ({
    ...prev,
    거래처명: place.업체명,
    하차지명: place.업체명,
    하차지주소: place.주소,
    하차지담당자: primary?.이름 || "",
    하차지담당자번호: primary?.번호 || "",
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
// ================================
// 🚚 상/하차지 경유 파싱 유틸
// ================================

// 1원진 / 1.원진 / 1 원진 모두 허용
function parseStops(text = "") {
  const raw = String(text).trim();
  if (!raw) return [];

  // ① "1.원진 2.우리유통" / "1 원진 2 우리유통"
  const regex = /(\d+)\s*\.?\s*([^\d]+)/g;
  const matches = [...raw.matchAll(regex)];

  if (matches.length > 0) {
    return matches
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map(m => m[2].trim());
  }

  // ② 숫자 패턴 없으면 단일
  return [raw];
}

// 경유 개수 라벨
function getStopLabel(stops = []) {
  return stops.length > 1 ? `경유 ${stops.length}곳` : "단일";
}
// ================================
// 🏷 메모 자동 태그 추출
// ================================
function extractMemoTags(memo = "") {
  const text = String(memo);

  const rules = [
    {
      key: "대기",
      match: /대기|대기시간|상차대기|하차대기/,
      className: "bg-blue-100 text-blue-700",
    },
    {
      key: "야간",
      match: /야간|심야|밤|야간작업/,
      className: "bg-purple-100 text-purple-700",
    },
    {
      key: "추가비",
      match: /추가|추가비|할증|추가요금/,
      className: "bg-rose-100 text-rose-700",
    },
  ];

  return rules
    .filter(r => r.match.test(text))
    .map(r => ({
      label: r.key,
      className: r.className,
    }));
}


const getPalletFromCargoText = (cargo = "") => {
  const m = cargo.match(/(\d+)\s*(p|P|파|팔|파레|파렛|파렛트|팔레트|PL)/i);
  if (m) return Number(m[1]);
  const m2 = cargo.match(/^\s*(\d+)\s*$/);
  if (m2) return Number(m2[1]);
  return null;
};
// ================================
// ⭐ 오더복사용 조건 Key 생성 (중복 제거 기준)
// ================================
function makeCopyOrderKey(r) {
  return [
    r.운행유형 || "편도",                     // ⭐ 편도/왕복 구분
    normalizeKey(r.상차지명 || ""),
    normalizeKey(r.하차지명 || ""),
    extractTonNum(r.차량톤수) ?? "",           // ⭐ 톤수 숫자화
    r.차량종류 || "",
    getPalletFromCargoText(r.화물내용) ?? "TON"
  ].join("|");
}

const getDropCountFromText = (dropName = "") => {
  const list = ["푸드플래닛", "신미"];
  return list.filter((key) =>
    isLike(dropName, key)
  ).length || 1;
};

// ================================
// ⭐ 운임조회 유사도 점수 계산
// ================================
function calcFareMatchScore(row, input) {
  let score = 0;

  // 상차지 / 하차지 (가장 중요)
  if (normalizeKey(row.상차지명) === normalizeKey(input.pickup)) score += 40;
  if (normalizeKey(row.하차지명) === normalizeKey(input.drop)) score += 40;

  // 파렛트 수
  if (input.pallet != null) {
    const rowPallet = getPalletFromCargoText(row.화물내용);
    if (rowPallet === input.pallet) score += 30;
    else if (rowPallet != null && Math.abs(rowPallet - input.pallet) === 1)
      score += 15;
  }

  // 차량종류
  if (input.vehicle && row.차량종류 === input.vehicle) score += 20;

  // 톤수 (±0.5)
  if (input.ton != null) {
    const rowTon = extractTonNum(row.차량톤수);
    if (rowTon != null && Math.abs(rowTon - input.ton) <= 0.5)
      score += 10;
  }

  return score;
}
// ================================
// ⭐ 운임 중복 제거용 Key 생성
// ================================
function makeFareDedupKey(row) {
  const pallet = getPalletFromCargoText(row.화물내용);
  const fare = Number(String(row.청구운임 || "0").replace(/[^\d]/g, ""));

  return [
    normalizeKey(row.상차지명),
    normalizeKey(row.하차지명),
    pallet ?? "",              // ⭐ 파렛트 수
    row.차량종류 || "",        // ⭐ 차량종류
    fare                        // ⭐ 청구운임
  ].join("|");
}



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
// ⭐ 긴급 단가 보정 (rec 생성 전에!)
const fareAdjustment = form.긴급
  ? {
      type: "긴급",
      rate: 0.2,        // ← 가산율 (나중에 바꿔도 됨)
      memo: "긴급 오더",
    }
  : null;
  // ⭐ 메모 prefix 자동 보정
const autoPriority =
  form.메모?.startsWith("!!") ? "CRITICAL" :
  form.메모?.startsWith("!")  ? "HIGH" :
  form.메모중요도 || "NORMAL";
 
const rec = {
  ...form,
  메모중요도: autoPriority,
  운임보정: fareAdjustment,
  
  ...moneyPatch,
  상차일: lockYear(form.상차일),
  하차일: lockYear(form.하차일),
  순번: nextSeq(),
  배차상태: status,

  // ===============================
  // 🤖 AI 판단 로그 (영구 저장)
  // ===============================
  aiLog: aiRecommend
    ? {
        pickup: form.상차지명,
        drop: form.하차지명,
        vehicle: aiRecommend.vehicle,
        fareAvg: aiRecommend.fareAvg,
        fareMin: aiRecommend.fareMin,
        fareMax: aiRecommend.fareMax,
        driverAvg: aiRecommend.driverAvg,
        marginPercent: aiRecommend.marginPercent,
        sampleCount: aiRecommend.sampleCount,
        isOutlier: aiRecommend.isOutlier,
        appliedFare: Number(form.청구운임 || 0),
        at: new Date().toISOString(),
      }
    : null,
};

let needPlaceUpdate = false;
let nextManagers = pickupManagers;

if (
  pickupPlace &&
  form.상차지담당자 &&
  form.상차지담당자번호
) {
  const name = form.상차지담당자.trim();
  const phone = form.상차지담당자번호.trim();

  const exactIdx = pickupManagers.findIndex(
    (m) => m.이름 === name && m.번호 === phone
  );

  const sameNameIdx = pickupManagers.findIndex(
    (m) => m.이름 === name && m.번호 !== phone
  );

  if (exactIdx === -1 && sameNameIdx === -1) {
    nextManagers = [
      ...pickupManagers,
      { 이름: name, 번호: phone, 대표: false },
    ];
    needPlaceUpdate = true;
  } else if (sameNameIdx !== -1) {
    nextManagers = pickupManagers.map((m, i) =>
      i === sameNameIdx ? { ...m, 번호: phone } : m
    );
    needPlaceUpdate = true;
  }
}

// ✅ 이제 오더 저장
await addDispatch(rec);

// ✅ 2️⃣ 담당자 업데이트는 실패해도 무시
if (needPlaceUpdate) {
  try {
    await upsertPlace({
      업체명: pickupPlace.업체명,
      주소: pickupPlace.주소,
      담당자목록: nextManagers,
    });
    setPlaceRowsTrigger(Date.now());
  } catch (e) {
    console.error("상차지 담당자 업데이트 실패 (무시됨):", e);
  }
}


// ⭐ 상/하차지 담당자 정보 → 기존 업체 있으면 업데이트만 함
if (typeof upsertPlace === "function") {

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
  setVehicleQuery(""); 
  setClientQuery("");
  setAutoPickMatched(false);
  setAutoDropMatched(false);
  setConfirmOpen(false);
  try { localStorage.removeItem("dispatchForm"); } catch {}

  alert("등록되었습니다.");
};
const isRoundTrip = form.운행유형 === "왕복";
const ROUND_DISCOUNT = 0.9; // ⭐ 10% 할인 (조정 가능)
    // ⭐ 운임조회 팝업 상태
    const [fareModalOpen, setFareModalOpen] = React.useState(false);
    const [fareResult, setFareResult] = React.useState(null);
    const [expandedMemo, setExpandedMemo] = React.useState(null);
    // ⭐ 운임조회 (송원 전용 자동요율 → 그 다음 AI 통계)
const handleFareSearch = () => {
  // ✅ 반드시 맨 위
  const pickup = (form.상차지명 || "").trim();
  const drop   = (form.하차지명 || "").trim();
  const tonStr = (form.차량톤수 || "").trim();
  const cargo  = (form.화물내용 || "").trim();
  const vehicle = (form.차량종류 || "").trim();

  if (!pickup || !drop) {
    alert("상차지명과 하차지명을 입력해주세요.");
    return;
  }

  // ⭐ 전체 데이터
  const fullData = Array.isArray(dispatchData) ? [...dispatchData] : [];
  // ================================
// 📜 순수 과거 운송 기록
// ================================
const pastHistoryList = fullData
  .filter(r => {
    if ((r.운행유형 || "편도") !== form.운행유형) return false;
    if (!r.상차지명 || !r.하차지명) return false;

    const inputPickupStops = parseStops(pickup);
    const inputDropStops   = parseStops(drop);
    const rowPickupStops   = parseStops(r.상차지명);
    const rowDropStops     = parseStops(r.하차지명);

    if (inputPickupStops.length !== rowPickupStops.length) return false;
    if (inputDropStops.length !== rowDropStops.length) return false;

    const sameStops = (a, b) =>
      a.length === b.length &&
      a.every((name, i) =>
        normalizeKey(name) === normalizeKey(b[i])
      );

    if (!sameStops(inputPickupStops, rowPickupStops)) return false;
    if (!sameStops(inputDropStops, rowDropStops)) return false;

    return true;
  })
  .sort((a, b) =>
    String(b.상차일 || "").localeCompare(String(a.상차일 || ""))
  );

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

      

      const inputPallets = extractPalletNum(cargo);
      const inputCargoNum = extractLeadingNum(cargo);
      const inputTonNum = extractTonNum(tonStr);
// ================================
// 🔑 화물 유형 판별
// ================================
// pallet: 파렛트 수가 명확한 경우
// ton: 파렛트 아님 → 톤수 기준
const cargoType =
  inputPallets != null
    ? "PALLET"
    : inputTonNum != null
    ? "TON"
    : "UNKNOWN";

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

      let filtered = fullData.filter((r) => {
          // ⭐⭐⭐ 이 줄이 핵심 ⭐⭐⭐
  if ((r.운행유형 || "편도") !== form.운행유형) return false;
        // ================================
// 🚨 경유/단일 운송 판별 (가장 먼저)
// ================================
const inputPickupStops = parseStops(pickup);
const inputDropStops   = parseStops(drop);

const rowPickupStops = parseStops(r.상차지명);
const rowDropStops   = parseStops(r.하차지명);

// ❌ 경유 개수 다르면 같은 운송 아님
if (inputPickupStops.length !== rowPickupStops.length) return false;
if (inputDropStops.length !== rowDropStops.length) return false;

// ❌ 경유 구성 다르면 제외 (순서 포함)
const sameStops = (a, b) =>
  a.length === b.length &&
  a.every((name, i) =>
    normalizeKey(name) === normalizeKey(b[i])
  );

if (!sameStops(inputPickupStops, rowPickupStops)) return false;
if (!sameStops(inputDropStops, rowDropStops)) return false;

        if (!r.상차지명 || !r.하차지명) return false;

        const rPickup = String(r.상차지명).trim();
        const rDrop = String(r.하차지명).trim();

// ✅ 상차 / 하차 "완전 동일"만 허용
const matchPickup =
  normalizeKey(rPickup) === normalizeKey(pickup);

const matchDrop =
  normalizeKey(rDrop) === normalizeKey(drop);

if (!matchPickup || !matchDrop) return false;

        if (!matchPickup || !matchDrop) return false;

        const matchVehicle =
  !vehicle
    ? true
    : normalizeVehicleGroup(r.차량종류) ===
      normalizeVehicleGroup(vehicle);

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

      if (!filtered.length) {
  filtered = fullData.filter((r) => {

    // ⭐⭐⭐ 반드시 동일하게 ⭐⭐⭐
    if ((r.운행유형 || "편도") !== form.운행유형) return false;
    if (!r.상차지명 || !r.하차지명) return false;

    // 🔴 경유/단일 판별 다시 강제
    const inputPickupStops = parseStops(pickup);
    const inputDropStops   = parseStops(drop);
    const rowPickupStops   = parseStops(r.상차지명);
    const rowDropStops     = parseStops(r.하차지명);

    if (inputPickupStops.length !== rowPickupStops.length) return false;
    if (inputDropStops.length !== rowDropStops.length) return false;

    const sameStops = (a, b) =>
      a.length === b.length &&
      a.every((name, i) =>
        normalizeKey(name) === normalizeKey(b[i])
      );

    if (!sameStops(inputPickupStops, rowPickupStops)) return false;
    if (!sameStops(inputDropStops, rowDropStops)) return false;

    // 그 다음에야 문자열 비교
    const rPickup = String(r.상차지명).trim();
    const rDrop = String(r.하차지명).trim();

    return (
  normalizeKey(rPickup) === normalizeKey(pickup) &&
  normalizeKey(rDrop) === normalizeKey(drop)
);
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
// ================================
// ⭐ 입력 조건 정리
// ================================
const inputCond = {
  pickup,
  drop,
  pallet: palletCount,
  vehicle,
  ton: inputTonNum,
};

// ⭐ 유사도 점수 부여
const scoredList = filtered.map(r => ({
  ...r,
  __score: calcFareMatchScore(r, inputCond),
}));

// ⭐ 거의 동일 / 유사 분리
const exactLike = scoredList.filter(r => {
  const rowPallet = getPalletFromCargoText(r.화물내용);

  return (
    r.__score >= 90 &&
    rowPallet === inputCond.pallet   // ⭐ 파렛트 완전 일치
  );
});

const similarTop = scoredList
  .filter(r => r.__score >= 60 && r.__score < 90)
  .sort((a, b) => b.__score - a.__score)
  .slice(0, 3);

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

// ================================
// ⭐ 운임 결과 중복 제거 (조건 + 청구운임 기준)
// ================================
const dedupMap = new Map();

// 최신순 정렬 → 먼저 들어온 것만 유지
filtered
  .slice()
  .sort((a, b) =>
    String(b.상차일 || "").localeCompare(String(a.상차일 || ""))
  )
  .forEach((r) => {
    const key = makeFareDedupKey(r);
    if (!dedupMap.has(key)) {
      dedupMap.set(key, r);
    }
  });

const dedupedList = Array.from(dedupMap.values());
// ================================
// ⭐ 과거 운송 기록도 동일 기준으로 중복 제거
// ================================
const pastDedupMap = new Map();

pastHistoryList
  .slice()
  .sort((a, b) =>
    String(b.상차일 || "").localeCompare(String(a.상차일 || ""))
  )
  .forEach((r) => {
    const key = makeFareDedupKey(r);
    if (!pastDedupMap.has(key)) {
      pastDedupMap.set(key, r);
    }
  });

const pastDedupedList = Array.from(pastDedupMap.values());

// ================================
// ⭐ 최종 운임 결과 세팅 (단 한 번만!)
// ================================
setFareResult({
  pickupStops: parseStops(pickup),
  dropStops: parseStops(drop),
  count: dedupedList.length,

  avg,
  min,
  max,
  latestFare: latestRow.청구운임,
  latestDate: latestRow.상차일,
  latestCargo,

  exactLike,
  similarTop,

  filteredList: dedupedList,   // 💰 운임 계산 후보
  pastHistoryList: pastDedupedList,
});


// 모달 오픈
setFareModalOpen(true);
};

    // ------------------ 오더복사 ------------------

// 🔎 오더복사용 상태
const [copyOpen, setCopyOpen] = React.useState(false);
const [copyQ, setCopyQ] = React.useState("");
const [copyStart, setCopyStart] = React.useState("");
const [copyEnd, setCopyEnd] = React.useState("");
const [copyFilterType, setCopyFilterType] = React.useState("전체");
const [onlyRoundTrip, setOnlyRoundTrip] = React.useState(false);


// 🔍 오더복사 리스트
const copyList = React.useMemo(() => {
  const q = copyQ.trim().toLowerCase();

  // 검색어 없으면 비표시 (기존 기능 유지)
  if (!q) return [];

  // ⭐ 전체 데이터 사용
  let arr = Array.isArray(dispatchData) ? [...dispatchData] : [];
  // ⭐ 왕복만 보기 필터
if (onlyRoundTrip) {
  arr = arr.filter(r => r.운행유형 === "왕복");
}

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

  // ⭐ 조건 기준 중복 제거 (대표 1건만)
const dedupMap = new Map();

// 최신순이므로, 먼저 들어온 것이 대표
arr.forEach((r) => {
  const key = makeCopyOrderKey(r);
  if (!dedupMap.has(key)) {
    dedupMap.set(key, r);
  }
});

return Array.from(dedupMap.values());
}, [dispatchData, copyQ, copyFilterType, filterType, filterValue, onlyRoundTrip]);

const [copySelected, setCopySelected] = React.useState([]);

// 🔥 오더 복사 전용 (유일한 진입점)
const applyCopy = (r) => {
  // placeList에서 업체 찾기
  const pickupPlace = findPlaceByName(r.상차지명);
  const dropPlace   = findPlaceByName(r.하차지명);

  // 대표 담당자 추출
  const pickupPrimary = getPrimaryManager(pickupPlace);
  const dropPrimary   = getPrimaryManager(dropPlace);

  const today = _todayStr();

  const keep = {
    거래처명: isDateLike(r.거래처명) ? "" : (r.거래처명 || ""),

    // ✅ 상차지
    상차지명: r.상차지명 || "",
    상차지주소: r.상차지주소 || pickupPlace?.주소 || "",
    상차지담당자:
      r.상차지담당자 ||
      pickupPrimary?.이름 ||
      "",
    상차지담당자번호:
      r.상차지담당자번호 ||
      pickupPrimary?.번호 ||
      "",

    // ✅ 하차지
    하차지명: r.하차지명 || "",
    하차지주소: r.하차지주소 || dropPlace?.주소 || "",
    하차지담당자:
      r.하차지담당자 ||
      dropPrimary?.이름 ||
      "",
    하차지담당자번호:
      r.하차지담당자번호 ||
      dropPrimary?.번호 ||
      "",

    // 기타
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
    운행유형: r.운행유형 || "편도",
    긴급: r.긴급 === true,
    운임보정: r.운임보정 || null,
  };

  setForm((p) => ({ ...p, ...keep }));

  // 🔥 UI 동기화
  setClientQuery(keep.거래처명);
  setVehicleQuery(keep.차량종류 || "");
  setAutoPickMatched(true);
  setAutoDropMatched(true);

  setCopyOpen(false);
  setCopySelected([]);
};

    // ------------------ 초기화 ------------------
    const resetForm = () => {
      const reset = { ...emptyForm, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, 등록일: _todayStr() };
      setForm(reset);
      setClientQuery("");
      setVehicleQuery("");
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
// ================================
// 🔑 상차지 담당자 파생 상태
// ================================
const pickupPlace = useMemo(() => {
  return placeList.find(
    (p) => normalizeKey(p.업체명) === normalizeKey(form.상차지명)
  );
}, [placeList, form.상차지명]);

const pickupManagers = useMemo(() => {
  if (!pickupPlace) return [];

  if (Array.isArray(pickupPlace.담당자목록)) {
    return pickupPlace.담당자목록.map((m) => ({
      이름: m.이름,
      번호: m.번호,
      대표: !!m.대표,
    }));
  }

  // 🔥 구형 데이터 대응
  if (pickupPlace.담당자 && pickupPlace.담당자번호) {
    return [{
      이름: pickupPlace.담당자,
      번호: pickupPlace.담당자번호,
      대표: true,
    }];
  }

  return [];
}, [pickupPlace]);
const hasMultiplePickupManagers = pickupManagers.length > 1;
const isNewPickupManager = useMemo(() => {
  if (!form.상차지담당자번호) return false;

  // ✅ 번호 기준으로 먼저 판단
  const samePhone = pickupManagers.some(
    (m) => m.번호 === form.상차지담당자번호
  );

  if (samePhone) return false;

  return !!form.상차지담당자;
}, [pickupManagers, form.상차지담당자, form.상차지담당자번호]);
// ================================
// 🔑 하차지 담당자 파생 상태 (추가)
// ================================
const dropPlace = useMemo(() => {
  return placeList.find(
    (p) => normalizeKey(p.업체명) === normalizeKey(form.하차지명)
  );
}, [placeList, form.하차지명]);

const dropManagers = useMemo(() => {
  if (!dropPlace) return [];

  if (Array.isArray(dropPlace.담당자목록)) {
    return dropPlace.담당자목록.map((m) => ({
      이름: m.이름,
      번호: m.번호,
      대표: !!m.대표,
    }));
  }

  // 🔥 구형 데이터 대응
  if (dropPlace.담당자 && dropPlace.담당자번호) {
    return [{
      이름: dropPlace.담당자,
      번호: dropPlace.담당자번호,
      대표: true,
    }];
  }

  return [];
}, [dropPlace]);

const hasMultipleDropManagers = dropManagers.length > 1;

const isNewDropManager = useMemo(() => {
  if (!form.하차지담당자번호) return false;

  const samePhone = dropManagers.some(
    (m) => m.번호 === form.하차지담당자번호
  );

  if (samePhone) return false;
  return !!form.하차지담당자;
}, [dropManagers, form.하차지담당자, form.하차지담당자번호]);
function calcHistoryScore(row, form) {
  let score = 0;

  // 1️⃣ 날짜 최신 (가중치)
  const d = new Date(row.상차일 || row.등록일 || 0).getTime();
  score += d / 1e10;

  // 2️⃣ 화물 동일
  if (row.화물내용 && form.화물내용 && row.화물내용 === form.화물내용) {
    score += 1000;
  }

  // 3️⃣ 톤수 유사
  const rt = extractTonNum(row.차량톤수);
  const ft = extractTonNum(form.차량톤수);
  if (rt != null && ft != null) {
    const diff = Math.abs(rt - ft);
    score += Math.max(0, 500 - diff * 100);
  }

  // 4️⃣ 파렛트 유사 (5P / 5파 / 5파렛)
  const rp = getPalletFromCargoText(row.화물내용);
  const fp = getPalletFromCargoText(form.화물내용);
  if (rp != null && fp != null) {
    const diff = Math.abs(rp - fp);
    score += Math.max(0, 500 - diff * 80);
  }

  return score;
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
    <button className="premium-btn yellow" onClick={handleFareSearch}>
      💰 운임조회
    </button>
     {/* ⭐ 여기 추가 */}
  <button
    type="button"
    disabled={!aiRecommend}
    onClick={() => setAiPopupOpen(true)}
    className="premium-btn blue disabled:opacity-40"
  >
    🤖 AI 추천
  </button>
</div>

  {/* 구분선 */}
  <div className="flex items-center gap-2">

  {/* 독차 */}
  <ToggleBadge
    active={form.독차}
    onClick={() => onChange("독차", !form.독차)}
    activeCls="bg-indigo-600 text-white border-indigo-600"
    inactiveCls="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
  >
     독차
  </ToggleBadge>

  {/* 혼적 */}
  <ToggleBadge
    active={form.혼적}
    onClick={() => onChange("혼적", !form.혼적)}
    activeCls="bg-emerald-600 text-white border-emerald-600"
    inactiveCls="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
  >
     혼적
  </ToggleBadge>

  {/* 왕복 */}
  <ToggleBadge
    active={form.운행유형 === "왕복"}
    onClick={() =>
      onChange("운행유형", form.운행유형 === "왕복" ? "편도" : "왕복")
    }
    activeCls="bg-purple-600 text-white border-purple-600"
    inactiveCls="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
  >
     왕복
  </ToggleBadge>

  {/* 🚨 긴급 (기존 유지, 통일감만) */}
  <ToggleBadge
    active={form.긴급}
    onClick={() => onChange("긴급", !form.긴급)}
    activeCls="bg-red-600 text-white border-red-600 animate-pulse"
    inactiveCls="bg-red-50 text-red-600 border-red-300 hover:bg-red-100"
  >
     긴급
  </ToggleBadge>
  {areaFareHint && (
    <div
      className="
        mt-2
        flex items-center gap-4
        border border-blue-200
        bg-blue-50
        rounded-lg
        px-4 py-2
        text-sm
        cursor-pointer
        hover:bg-blue-100
        transition
      "
      onClick={() => {
        const inputTon = extractTonNum(form.차량톤수);
        const inputPallet = getPalletFromCargoText(form.화물내용);

        const history = (dispatchData || []).filter(r => {
          if (!r.청구운임) return false;

          if (
            !isAreaMatch(
              form.상차지주소,
              r.상차지주소 || r.상차지명
            ) ||
            !isAreaMatch(
              form.하차지주소,
              r.하차지주소 || r.하차지명
            )
          ) {
            return false;
          }

          if (
            normalizeVehicleGroup(r.차량종류) !==
            normalizeVehicleGroup(form.차량종류)
          ) {
            return false;
          }

          if (inputTon != null) {
            const rowTon = extractTonNum(r.차량톤수);
            if (rowTon == null) return false;
            if (Math.abs(rowTon - inputTon) > 0.5) return false;
          }

          if (inputPallet != null) {
            const rowPallet = getPalletFromCargoText(r.화물내용);
            if (rowPallet == null) return false;
            if (Math.abs(rowPallet - inputPallet) > 1) return false;
          }

          return true;
        });

        setGuideHistoryList(history);
        setFareHistoryOpen(true);
      }}
    >
      <span className="font-semibold text-gray-800">
        {areaFareHint.pickupLabel} → {areaFareHint.dropLabel}
      </span>

      <span className="text-gray-500">
        기준: {areaFareHint.level}
        <span className="ml-1 text-xs">
          ({areaFareHint.count}건)
        </span>
      </span>

      <span className="ml-auto font-bold text-blue-700">
        {areaFareHint.min.toLocaleString()} ~{" "}
        {areaFareHint.max.toLocaleString()}원
      </span>
    </div>
  )}
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
          value={clientQuery || form.거래처명}
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

  if (e.key === "Enter") {
    e.preventDefault();

    // 🔥 1️⃣ 검색 결과 없음 → 중복 확인 → 신규 여부 판단
    if (list.length === 0) {
      const name = clientQuery.trim();
      if (!name) return;

      const key = normalizeKey(name);
    const similar = placeList.filter((p) => {
  const k = normalizeKey(p.업체명);
  return k.includes(key) || key.includes(k);
});


      if (similar.length > 0) {
        setDupPopup({
          open: true,
          input: { name },   // ← 여기 중요
          candidates: similar,
        });
      } else {
        openNewPlacePrompt(name);
      }
      return;
    }

    // 🔹 2️⃣ 검색 결과 있을 때 → 선택
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
    const name = (clientQuery || "").trim();
    if (!name) return alert("업체명을 입력하세요.");

  const nk = normalizeKey(name);

const similar = placeList.filter(p => {
  const pk = normalizeKey(p.업체명);
  return pk.includes(nk) || nk.includes(pk);
});

    // 🔥 1️⃣ 비슷한 거래처 있으면 → 중복 팝업 먼저
    if (similar.length > 0) {
      setDupPopup({
        open: true,
        input: { name },
        candidates: similar,
      });
      return;
    }

    // 🔥 2️⃣ 진짜 없을 때만 신규 입력 팝업
    openNewPlacePrompt(name);
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
const primary = getPrimaryManager(p);

setForm((prev) => ({
  ...prev,
  상차지명: p.업체명,
  상차지주소: p.주소,
  상차지담당자: primary?.이름 || "",
  상차지담당자번호: primary?.번호 || "",
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
  const primary = getPrimaryManager(p);

  setForm((prev) => ({
    ...prev,
    상차지명: p.업체명,
    상차지주소: p.주소,
    상차지담당자: primary?.이름 || "",
    상차지담당자번호: primary?.번호 || "",
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
  <label className={labelCls}>
    상차지 담당자
    {isNewPickupManager && (
      <span className="ml-2 text-xs text-emerald-600 font-semibold">
        신규 담당자
      </span>
    )}
  </label>

  {/* 여러 명일 때 드롭다운 */}
  {hasMultiplePickupManagers && (
    <select
      className={`${inputCls} mb-1`}
      value={`${form.상차지담당자}|${form.상차지담당자번호}`}
      onChange={(e) => {
        const [이름, 번호] = e.target.value.split("|");
        setForm((p) => ({
          ...p,
          상차지담당자: 이름,
          상차지담당자번호: 번호,
        }));
      }}
    >
      {pickupManagers.map((m, i) => (
        <option key={i} value={`${m.이름}|${m.번호}`}>
          {m.이름}{m.대표 ? " (대표)" : ""}
        </option>
      ))}
    </select>
  )}

  {/* ✅ 입력 + 대표담당자 버튼 (하나만 존재) */}
  <div className="relative">
    <input
      className={`${inputCls} pr-20`}
      value={form.상차지담당자}
      onChange={(e) =>
        onChange("상차지담당자", e.target.value)
        
      }
      placeholder="담당자 이름"
    />

    {pickupPlace && form.상차지담당자 && (
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <ToggleBadge
          active={pickupManagers.some(
            (m) =>
              m.이름 === form.상차지담당자 &&
              m.번호 === form.상차지담당자번호 &&
              m.대표
          )}
          onClick={async () => {
  const exists = pickupManagers.some(
    (m) =>
      m.이름 === form.상차지담당자 &&
      m.번호 === form.상차지담당자번호
  );

  const nextManagers = exists
    ? pickupManagers.map((m) => ({
        ...m,
        대표:
          m.이름 === form.상차지담당자 &&
          m.번호 === form.상차지담당자번호,
      }))
    : [
        ...pickupManagers.map((m) => ({ ...m, 대표: false })),
        {
          이름: form.상차지담당자,
          번호: form.상차지담당자번호,
          대표: true,
        },
      ];

  await upsertPlace({
    업체명: pickupPlace.업체명,
    주소: pickupPlace.주소,
    담당자목록: nextManagers,
  });

  setPlaceRowsTrigger(Date.now());
  alert("대표 담당자로 지정되었습니다.");
}}

          activeCls="bg-blue-600 text-white border-blue-600"
          inactiveCls="bg-blue-50 text-blue-700 border-blue-200"
        >
          대표
        </ToggleBadge>
      </div>
    )}
  </div>
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
          const primary = getPrimaryManager(p);

setForm((prev) => ({
  ...prev,
  하차지명: p.업체명,
  하차지주소: p.주소,
  하차지담당자: primary?.이름 || "",
  하차지담당자번호: primary?.번호 || "",
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
              const primary = getPrimaryManager(p);

setForm((prev) => ({
  ...prev,
  하차지명: p.업체명,
  하차지주소: p.주소,
  하차지담당자: primary?.이름 || "",
  하차지담당자번호: primary?.번호 || "",
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
  <label className={labelCls}>
    하차지 담당자
    {isNewDropManager && (
      <span className="ml-2 text-xs text-emerald-600 font-semibold">
        신규 담당자
      </span>
    )}
  </label>

  {/* 여러 명일 때 드롭다운 */}
  {hasMultipleDropManagers && (
    <select
      className={`${inputCls} mb-1`}
      value={`${form.하차지담당자}|${form.하차지담당자번호}`}
      onChange={(e) => {
        const [이름, 번호] = e.target.value.split("|");
        setForm((p) => ({
          ...p,
          하차지담당자: 이름,
          하차지담당자번호: 번호,
        }));
      }}
    >
      {dropManagers.map((m, i) => (
        <option key={i} value={`${m.이름}|${m.번호}`}>
          {m.이름}{m.대표 ? " (대표)" : ""}
        </option>
      ))}
    </select>
  )}

  {/* 입력 + 대표 버튼 */}
  <div className="relative">
    <input
      className={`${inputCls} pr-20`}
      value={form.하차지담당자}
      onChange={(e) =>
        onChange("하차지담당자", e.target.value)
      }
      placeholder="담당자 이름"
    />

    {dropPlace && form.하차지담당자 && (
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <ToggleBadge
          active={dropManagers.some(
            (m) =>
              m.이름 === form.하차지담당자 &&
              m.번호 === form.하차지담당자번호 &&
              m.대표
          )}
          onClick={async () => {
            const exists = dropManagers.some(
              (m) =>
                m.이름 === form.하차지담당자 &&
                m.번호 === form.하차지담당자번호
            );

            const nextManagers = exists
              ? dropManagers.map((m) => ({
                  ...m,
                  대표:
                    m.이름 === form.하차지담당자 &&
                    m.번호 === form.하차지담당자번호,
                }))
              : [
                  ...dropManagers.map((m) => ({ ...m, 대표: false })),
                  {
                    이름: form.하차지담당자,
                    번호: form.하차지담당자번호,
                    대표: true,
                  },
                ];

            await upsertPlace({
              업체명: dropPlace.업체명,
              주소: dropPlace.주소,
              담당자목록: nextManagers,
            });

            setPlaceRowsTrigger(Date.now());
            alert("대표 담당자로 지정되었습니다.");
          }}
          activeCls="bg-blue-600 text-white border-blue-600"
          inactiveCls="bg-blue-50 text-blue-700 border-blue-200"
        >
          대표
        </ToggleBadge>
      </div>
    )}
  </div>
</div>
<div>
  <label className={labelCls}>하차지 연락처</label>
  <input
    className={inputCls}
    value={form.하차지담당자번호}
    onChange={(e) =>
      onChange(
        "하차지담당자번호",
        e.target.value.replace(/[^\d-]/g, "")
      )
    }
    placeholder="010-0000-0000"
  />
</div>
  {/* 화물내용 */}
  <div>
    <label className={labelCls}>화물내용</label>
    <input className={inputCls} value={form.화물내용} onChange={(e) => onChange("화물내용", e.target.value)} />
  </div>

 <div className="relative">
  <label className={labelCls}>차량종류</label>

  <input
    className={inputCls}
    placeholder="차량종류 입력 또는 선택 (예: 냉동윙)"
    value={vehicleQuery || form.차량종류}
    onChange={(e) => {
      const v = e.target.value;
      setVehicleQuery(v);          // 👉 입력 상태
      onChange("차량종류", v);     // 👉 form에는 항상 반영
      setShowVehicleDropdown(true);
      setVehicleActive(0);
    }}
    onFocus={() => {
      setShowVehicleDropdown(true); // 👉 클릭만 해도 목록 표시
    }}
    onKeyDown={(e) => {
      const list = filterVehicles(vehicleQuery);

      if (!list.length) return;

      if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === "Enter") {
        // 🔹 Enter → 선택지가 있으면 선택, 없으면 그냥 수기입력 유지
        const pick = list[vehicleActive];
        if (pick) {
          onChange("차량종류", pick);
          setVehicleQuery(pick);
        }
        setShowVehicleDropdown(false);
      } else if (e.key === "ArrowDown") {
        setVehicleActive((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        setVehicleActive((i) => Math.max(i - 1, 0));
      }
    }}
    onBlur={() => {
      // 🔹 수기 입력 허용 → 그냥 닫기만
      setTimeout(() => setShowVehicleDropdown(false), 150);
    }}
  />

  {showVehicleDropdown && (
    <div className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
      {filterVehicles(vehicleQuery).map((v, i) => (
        <div
          key={`${v}-${i}`}
          ref={(el) => (vehicleItemRefs.current[i] = el)}
          className={`px-3 py-2 cursor-pointer text-sm ${
            i === vehicleActive ? "bg-blue-50" : "hover:bg-gray-50"
          }`}
          onMouseEnter={() => setVehicleActive(i)}
          onMouseDown={() => {
            // 🔹 마우스로 선택
            onChange("차량종류", v);
            setVehicleQuery(v);
            setShowVehicleDropdown(false);
          }}
        >
          {v}
        </div>
      ))}
    </div>
  )}
  
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
      <input
        className={inputCls}
        value={form.청구운임}
        onChange={(e) =>
          onChange("청구운임", e.target.value.replace(/[^\d-]/g, ""))
        }
      />
    </div>

    <div>
      <label className={labelCls}>기사운임</label>
      <input
        className={inputCls}
        value={form.기사운임}
        onChange={(e) =>
          onChange("기사운임", e.target.value.replace(/[^\d-]/g, ""))
        }
      />
    </div>

    <div>
      <label className={labelCls}>수수료</label>
      <input
        className={`${inputCls} bg-gray-100`}
        value={form.수수료}
        readOnly
      />
    </div>
  </>
)}
{/* ===============================
    🤖 AI 배차 추천 (FULL ROW)
   =============================== */}
{/* ================= 🤖 AI 추천 팝업 ================= */}
{aiPopupOpen && aiRecommend && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-xl p-6 w-[520px] shadow-2xl border">

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">🤖 AI 배차 추천</h3>
        <button
          onClick={() => setAiPopupOpen(false)}
          className="text-gray-400 hover:text-black text-xl"
        >
          ×
        </button>
      </div>

      {/* 요약 */}
      <div className="mb-4 text-sm leading-relaxed text-gray-700">
        {makeAiExplain(aiRecommend)}
      </div>

      {/* 추천 수치 */}
      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
  차량:
  <b className="ml-1">
    {aiRecommend.vehicle} / {form.차량톤수 || "톤수 미입력"}
  </b>
</div>
        <div>표본: <b>{aiRecommend.sampleCount}건</b></div>
        <div>
          청구:
          <b className="ml-1">
            {aiRecommend.fareMin.toLocaleString()} ~{" "}
            {aiRecommend.fareMax.toLocaleString()}
          </b>
        </div>
        <div>
          기사:
          <b className="ml-1">
            {aiRecommend.driverAvg.toLocaleString()}
          </b>
        </div>
        <div className="col-span-2">
          마진:
          <b className="ml-1 text-emerald-600">
            {aiRecommend.marginPercent}%
          </b>
        </div>
      </div>

      {/* 경고 */}
      {aiRecommend.isOutlier && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-xs">
          ⚠ 평균 대비 운임 차이가 큽니다
        </div>
      )}

      {/* 적용 버튼 */}
      <div className="flex justify-end gap-2">
        <button
          className="px-4 py-2 rounded bg-gray-200"
          onClick={() => setAiPopupOpen(false)}
        >
          닫기
        </button>

        <button
          className="px-4 py-2 rounded bg-blue-600 text-white"
          onClick={() => {
            onChange("청구운임", String(aiRecommend.fareAvg));
            onChange("기사운임", String(aiRecommend.driverAvg));
            setAiPopupOpen(false);
          }}
        >
          추천 운임 적용
        </button>
      </div>
    </div>
  </div>
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

{/* ===============================
    📝 메모 / 📢 전달사항 (입력폼)
   =============================== */}
<div className="col-span-8">
  <div className="grid grid-cols-2 gap-4">

    {/* ▶ 왼쪽 : 메모 */}
    <div>
      <label className={labelCls}>메모</label>

      <div className="flex items-center gap-2 mb-1">
        <ToggleBadge
          active={form.메모중요도 === "NORMAL"}
          onClick={() => onChange("메모중요도", "NORMAL")}
          activeCls="bg-gray-600 text-white border-gray-600"
          inactiveCls="bg-gray-100 text-gray-600 border-gray-200"
        >
          일반
        </ToggleBadge>

        <ToggleBadge
          active={form.메모중요도 === "HIGH"}
          onClick={() => onChange("메모중요도", "HIGH")}
          activeCls="bg-orange-600 text-white border-orange-600"
          inactiveCls="bg-orange-100 text-orange-700 border-orange-200"
        >
          중요
        </ToggleBadge>

        <ToggleBadge
          active={form.메모중요도 === "CRITICAL"}
          onClick={() => onChange("메모중요도", "CRITICAL")}
          activeCls="bg-red-600 text-white border-red-600"
          inactiveCls="bg-red-100 text-red-600 border-red-200"
        >
          긴급
        </ToggleBadge>
      </div>

      <textarea
        className={`${inputCls} h-20`}
        placeholder="내부 메모"
        value={form.메모}
        onChange={(e) => onChange("메모", e.target.value)}
      />
    </div>

    {/* ▶ 오른쪽 : 전달사항 */}
    <div>
      <label className={labelCls}>전달사항</label>

      {/* 🔒 고정 버튼 */}
      <div className="flex items-center gap-2 mb-1">
        <ToggleBadge
          active={form.전달사항고정}
          onClick={() => onChange("전달사항고정", !form.전달사항고정)}
          activeCls="bg-blue-600 text-white border-blue-600"
          inactiveCls="bg-blue-100 text-blue-700 border-blue-200"
        >
          고정
        </ToggleBadge>
      </div>

      <textarea
        className={`${inputCls} h-20 bg-blue-50`}
        placeholder="기사 전달사항"
        value={form.전달사항}
        onChange={(e) => onChange("전달사항", e.target.value)}
      />
    </div>

  </div>
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
              <div className="flex items-center justify-between pb-2 mb-3 border-b">
  {/* 왼쪽: 제목 */}
  <div>
    <h2 className="text-lg font-bold">📄 오더복사</h2>
    <p className="text-xs text-gray-500">
      더블클릭: 수정 | 체크 후 복사
    </p>
  </div>

  {/* 오른쪽: 옵션 + 닫기 */}
  <div className="flex items-center gap-4">
    {/* ⭐ 왕복만 보기 (상단 고정) */}
    <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={onlyRoundTrip}
        onChange={(e) => setOnlyRoundTrip(e.target.checked)}
      />
      왕복만 보기
    </label>

    {/* 닫기 버튼 */}
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

                {/* 🔥 복사 버튼 (최종 정답) */}
<button
  className="px-4 py-2 bg-blue-600 text-white rounded"
  onClick={() => {
    if (copySelected.length === 0)
      return alert("복사할 항목을 선택하세요.");

    const r = copySelected[0];
    const today = new Date().toISOString().slice(0, 10);

    // 1️⃣ 핵심: 담당자/번호 포함 복사 (단일 진입점)
    applyCopy(r);

    // 2️⃣ 오더복사용 공통 초기화 (여기서만 처리)
    setForm((p) => ({
      ...p,
      상차일: today,
      하차일: today,
      차량번호: "",
      이름: "",
      전화번호: "",
      배차상태: "배차중",
    }));

    // 3️⃣ UI 상태 동기화
    setIsCopyMode(true);
    setCopyOpen(false);

    alert("오더 내용이 입력창에 복사되었습니다!");
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
                            <td className="p-2">
  <div className="inline-flex items-center gap-1">
    <span>{row.상차지명}</span>

    {row.운행유형 === "왕복" && (
      <span
        className="
          px-1.5 py-0.5
          text-[10px] font-semibold
          rounded-full
          bg-indigo-100 text-indigo-700
          border border-indigo-300
          whitespace-nowrap
        "
      >
        왕복
      </span>
    )}
  </div>
</td>
                            <td className="p-2">{row.하차지명}</td>
                            <td className="p-2">{row.화물내용}</td>
                            <td className="p-2">{row.차량종류}</td>
                            <td className="p-2">{row.차량톤수}</td>
                            <td className="p-2">
  {row.메모}

  {row.긴급 === true && (
    <span
      className="ml-1 px-1.5 py-0.5 text-[10px]
      rounded-full bg-red-100 text-red-600 border border-red-300"
    >
      🚨 긴급
    </span>
  )}
</td>
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
{/* ================= 실시간배차 상태 변경 확인 팝업 ================= */}
{confirmChange && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-xl p-6 w-[360px] shadow-xl border">

      <h3 className="text-base font-bold mb-4">
        상태를 변경하시겠습니까?
      </h3>

      <div className="text-sm text-gray-700 mb-5">
        <div className="mb-1 font-semibold">
          {confirmChange.key}
        </div>
        <div>
          {confirmChange.before || "미설정"}
          {" → "}
          <b className="text-blue-600">
            {confirmChange.after || "미설정"}
          </b>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          className="px-3 py-1.5 bg-gray-200 rounded"
          onClick={() => setConfirmChange(null)}
        >
          취소
        </button>

        <button
          className="px-3 py-1.5 bg-blue-600 text-white rounded"
          onClick={async () => {
            await patchDispatch(confirmChange.rowId, {
              [confirmChange.key]: confirmChange.after,
            });
            setConfirmChange(null);
          }}
        >
          확인
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
        <p>
  {form.운행유형 === "왕복"
    ? `${form.상차지명} ↔ ${form.하차지명}`
    : `${form.상차지명} → ${form.하차지명}`}
</p>
        {isAdmin && (
          <p>청구운임: <b>{Number(form.청구운임 || 0).toLocaleString()}원</b></p>
        )}
      </div>


  {/* ⭐ 즉시공유 */}
  <button
    type="button"
    className="px-3 py-1.5 bg-emerald-600 text-white rounded"
    onClick={async () => {
      const text = makeInstantShareText(form);

      try {
        await navigator.clipboard.writeText(text);
        alert("📋 즉시공유 내용이 복사되었습니다.");
      } catch {
        prompt("아래 내용을 복사하세요.", text);
      }
    }}
  >
    즉시공유
  </button>
  
      <div className="flex justify-end gap-2">
  <button
    className="px-3 py-1.5 bg-gray-200 rounded"
    onClick={() => setConfirmOpen(false)}
  >
    취소
  </button>
  {/* 기존 저장 */}
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
{/* ================= 거래처/하차지 중복 확인 팝업 ================= */}
{dupPopup.open && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl border">

      <h3 className="text-base font-bold mb-3">
        비슷한 거래처가 있습니다
      </h3>

      <p className="text-sm text-gray-700 mb-4">
        신규로 등록하시겠습니까?
      </p>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 mb-4">
        {/* 예 → 신규 등록 */}
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={() => {
  const { name } = dupPopup.input;

  setDupPopup({ open: false, input: null, candidates: [] });

  // 🔥 여기서 신규 입력 팝업을 연다
  setTimeout(() => {
    openNewPlacePrompt(name);
  }, 0);
}}

        >
          예
        </button>

        {/* 아니오 */}
        <button
  className="px-4 py-2 bg-gray-200 rounded"
  onClick={() => {
    // 🔥 신규 등록 거부 → 팝업만 닫기
    setDupPopup({ open: false, input: null, candidates: [] });
  }}
>
  아니오
</button>

      </div>

      {/* 기존 업체 선택 */}
      <div className="border-t pt-3 space-y-2">
        {dupPopup.candidates.map((p, i) => (
          <div
            key={i}
            className="p-2 border rounded cursor-pointer hover:bg-gray-50"
            onClick={() => {
  applyClientSelect(p.업체명); // 🔥 이게 정답
  setDupPopup({ open: false, input: null, candidates: [] });
}}

          >
            <div className="font-medium">{p.업체명}</div>
            {p.주소 && (
              <div className="text-xs text-gray-500">{p.주소}</div>
            )}
          </div>
        ))}
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
{/* ================= 📜 과거 운송 이력 (운임 가이드 클릭) ================= */}
{fareHistoryOpen && (
  <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-xl w-[720px] max-h-[80vh] overflow-hidden shadow-xl">

      {/* 헤더 */}
      <div className="flex justify-between items-center px-5 py-3 border-b">
        <h3 className="font-semibold text-lg">📜 과거 운송 이력</h3>
        <button
          onClick={() => setFareHistoryOpen(false)}
          className="text-gray-400 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      {/* 리스트 */}
      <div className="p-4 overflow-y-auto max-h-[60vh] text-sm">
          <div className="text-xs text-gray-500 mb-2">
    현재 조건과 유사한 운송 이력만 표시됩니다
  </div>
       {guideHistoryList.length > 0 ? (
  [...guideHistoryList]
    .map((r) => {
      const sameCargo =
        r.화물내용 && form.화물내용 && r.화물내용 === form.화물내용;

      const sameTon =
        extractTonNum(r.차량톤수) === extractTonNum(form.차량톤수);

      const samePallet =
        getPalletFromCargoText(r.화물내용) ===
        getPalletFromCargoText(form.화물내용);

      return {
        ...r,
        __score: calcHistoryScore(r, form),
        __sameCargo: sameCargo,
        __sameTon: sameTon,
        __samePallet: samePallet,
      };
    })
    .sort((a, b) => b.__score - a.__score)
    .map((r, idx) => (
      <div
        key={idx}
        className="p-4 mb-3 border rounded-xl bg-white hover:bg-gray-50"
      >
        {/* 🔹 상단: 날짜 + 뱃지 */}
        <div className="flex justify-between items-center mb-1">
          <div className="text-sm font-bold text-gray-900">
            {r.상차일 || r.등록일}
          </div>

          <div className="flex gap-1">
            {r.__sameCargo && r.__sameTon && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 border border-red-300">
                최적매칭
              </span>
            )}
            {r.__sameTon && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 border border-blue-300">
                톤수동일
              </span>
            )}
            {r.__sameCargo && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                화물동일
              </span>
            )}
          </div>
        </div>

        {/* 🔹 루트 */}
        <div className="text-base font-semibold text-gray-800">
          {r.상차지명} → {r.하차지명}
        </div>

        {/* 🔹 차량 */}
        <div className="mt-1 text-sm text-gray-700">
          🚚 {r.차량종류} / {r.차량톤수}
        </div>

        {/* 🔹 화물 */}
        <div className="text-sm text-gray-700">
          📦 {r.화물내용 || "-"}
        </div>

        {/* 🔹 기사 / 운임 */}
        <div className="mt-2 flex justify-between items-center">
          <div className="text-base font-bold text-blue-700">
            기사 {r.이름 || "-"} ·{" "}
            {Number(r.기사운임 || 0).toLocaleString()}원
          </div>
        </div>
      </div>
    ))
) : (
  <div className="text-center text-gray-400 py-10">
    과거 이력이 없습니다.
  </div>
)}

      </div>

      {/* 푸터 */}
      <div className="px-5 py-3 border-t text-right">
        <button
          onClick={() => setFareHistoryOpen(false)}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-sm"
        >
          닫기
        </button>
      </div>
    </div>
  </div>
)}

        {/* ⭐ 운임조회 결과 모달 */}
{fareModalOpen && fareResult && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-xl p-6 w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto">

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">운임 조회 결과</h3>
        <button
          onClick={() => setFareModalOpen(false)}
          className="text-gray-400 hover:text-black text-xl"
        >
          ×
        </button>
      </div>
{/* ================= 요약 정보 (Grid) ================= */}
<div className="mb-6 grid grid-cols-2 gap-3 text-sm">

  <div className="p-3 rounded-lg bg-gray-50">
    <div className="text-xs text-gray-500">조회된 데이터</div>
    <div className="text-lg font-bold">{fareResult.count}건</div>
  </div>

  <div className="p-3 rounded-lg bg-gray-50">
    <div className="text-xs text-gray-500">차량톤수</div>
    <div className="text-lg font-bold">{form.차량톤수 || "-"}</div>
  </div>

  <div className="p-3 rounded-lg bg-gray-50">
    <div className="text-xs text-gray-500">최소 운임</div>
    <div className="font-semibold">
      {fareResult.min.toLocaleString()}원
    </div>
  </div>

  <div className="p-3 rounded-lg bg-gray-50">
    <div className="text-xs text-gray-500">최대 운임</div>
    <div className="font-semibold">
      {fareResult.max.toLocaleString()}원
    </div>
  </div>

  <div className="p-3 rounded-lg bg-gray-50">
    <div className="text-xs text-gray-500">최신 운임</div>
    <div className="font-semibold text-blue-700">
      {fareResult.latestFare?.toLocaleString()}원
    </div>
  </div>

  <div className="p-3 rounded-lg bg-gray-50">
    <div className="text-xs text-gray-500">최신 상차일</div>
    <div className="font-semibold">
      {fareResult.latestDate}
    </div>
  </div>

  <div className="p-3 rounded-lg bg-gray-50 col-span-2">
    <div className="text-xs text-gray-500">최근 화물</div>
    <div className="font-semibold">
      {fareResult.latestCargo}
    </div>
  </div>

</div>

{(() => {
  const aiResult = getAiRecommendedFare({
    historyList: fareResult.pastHistoryList,
    form,
  });

  if (!aiResult.fare) return null;

  return (
    <div className="border rounded-xl p-4 mb-6 bg-white">
      <div className="text-sm font-semibold mb-1">AI 추천 운임</div>

      <div className="text-2xl font-extrabold text-blue-700">
        {aiResult.fare.toLocaleString()}원
      </div>

      {aiResult.reason === "GLOBAL_SIMILAR" && (
        <div className="mt-1 text-xs text-gray-500">
          ⚠️ 유사 이력이 없어 전체 운송 데이터를 기준으로 추천된 운임입니다.
        </div>
      )}

      <button
        onClick={() => {
          setForm(p => ({ ...p, 청구운임: String(aiResult.fare) }));
          setFareModalOpen(false);
        }}
        className="mt-3 w-full py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
      >
        추천운임 적용
      </button>
    </div>
  );
})()}
      {/* 📜 과거 운송 기록 */}
      {fareResult.pastHistoryList?.length > 0 && (() => {
        // 🔥 유사도 계산
        const calcScore = (r) => {
          let score = 0;

          const pRow = getPalletFromCargoText(r.화물내용);
          const pCur = getPalletFromCargoText(form.화물내용);
          const tRow = extractTonNum(r.차량톤수);
          const tCur = extractTonNum(form.차량톤수);

          if (pRow != null && pCur != null) {
            const d = Math.abs(pRow - pCur);
            if (d === 0) score += 100;
            else if (d === 1) score += 70;
            else if (d === 2) score += 40;
          }

          if (tRow != null && tCur != null) {
            const d = Math.abs(tRow - tCur);
            if (d === 0) score += 30;
            else if (d <= 0.5) score += 15;
          }

          return score;
        };

        // 🔥 정렬: 유사도 → 최신순
        const sortedHistory = [...fareResult.pastHistoryList].sort((a, b) => {
          const sa = calcScore(a);
          const sb = calcScore(b);
          if (sa !== sb) return sb - sa;
          return new Date(b.상차일) - new Date(a.상차일);
        });

        return (
          <div>
            <h4 className="font-semibold mb-3">과거 운송 기록</h4>

            <div className="space-y-4">
              {sortedHistory.map((r, idx) => {
                const sameCargo =
                  getPalletFromCargoText(r.화물내용) ===
                  getPalletFromCargoText(form.화물내용);

                const sameTon =
                  extractTonNum(r.차량톤수) ===
                  extractTonNum(form.차량톤수);

                return (
                  <div
                    key={idx}
                    className="border rounded-2xl p-4 bg-white shadow-sm"
                  >
                    {/* 날짜 + 뱃지 */}
                    <div className="flex justify-between items-center mb-1">
                      <div className="text-sm font-bold">{r.상차일}</div>
                      <div className="flex gap-1">
                        {sameCargo && sameTon && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 border">
                            최적 매칭
                          </span>
                        )}
                        {sameTon && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 border">
                            톤수 동일
                          </span>
                        )}
                        {sameCargo && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 border">
                            화물 동일
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 루트 */}
                    <div className="text-base font-semibold">
                      {r.상차지명 || "-"} → {r.하차지명 || "-"}
                    </div>

                    {/* 차량 / 화물 */}
                    <div className="mt-1 text-sm text-gray-700">
                      {r.차량종류 || "-"} / {r.차량톤수 || "-"}
                    </div>
                    <div className="text-sm text-gray-700">
                      {r.화물내용 || "-"}
                    </div>

                    {/* 기사 / 기사운임 */}
                    <div className="mt-2 text-sm text-gray-600">
                      기사: <b>{r.기사명 || r.이름 || "-"}</b> · 기사운임{" "}
                      <b className="text-emerald-700">
                        {Number(r.기사운임 || 0).toLocaleString()}원
                      </b>
                    </div>

                    {/* 청구운임 + 적용 */}
                    <div className="mt-3 flex justify-between items-center">
                      <div className="text-xl font-extrabold text-blue-700">
                        {Number(r.청구운임).toLocaleString()}원
                      </div>

                      <button
                        onClick={() => {
                          setForm(p => ({
                            ...p,
                            청구운임: String(r.청구운임),
                          }));
                          setFareModalOpen(false);
                        }}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                      >
                        적용
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 닫기 */}
      <div className="text-right mt-6">
        <button
          onClick={() => setFareModalOpen(false)}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-sm"
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
    setConfirmChange={setConfirmChange}
   PAY_TYPES={PAY_TYPES}
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
// ✅ RealtimeStatus 컴포넌트 위 (또는 아래)

const RoundTripBadge = () => (
  <span
    className="
      ml-1 px-1.5 py-0.5
      text-[10px] font-bold
      rounded-full
      bg-indigo-100 text-indigo-700
      border border-indigo-300
      whitespace-nowrap
    "
  >
    왕복
  </span>
);

function StopBadge({ count = 0, list = [] }) {
  const [open, setOpen] = React.useState(false);
  if (!count) return null;

  return (
    <span
      className="relative ml-1 inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* 뱃지 */}
      <span className="
        px-1.5 py-0.5
        text-[10px] font-semibold
        rounded-full
        bg-indigo-100 text-indigo-700
        border border-indigo-300
        whitespace-nowrap
      ">
        경유 {count}
      </span>

      {/* hover 팝업 */}
      {open && (
        <div className="
          absolute top-full left-0 mt-1
          z-50
          bg-white border rounded-md shadow-lg
          text-xs text-gray-700
          p-2
          min-w-[220px]
        ">
          {list.map((s, i) => (
            <div key={i} className="mb-1 last:mb-0">
              <div className="font-semibold">
                {i + 1}. {s.업체명 || "-"}
              </div>
              {s.주소 && (
                <div className="text-gray-500">
                  {s.주소}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}


function DeliveryStatusBadge({ row, onConfirm }) {
  const status = row.업체전달상태 || "미전달";

  const styleMap = {
    미전달: "bg-yellow-100 text-yellow-700 border-yellow-400",
    전달완료: "bg-green-100 text-green-700 border-green-400",
  };

  return (
    <button
      type="button"
      className={`px-2 py-0.5 rounded text-xs font-semibold border ${styleMap[status]}`}
      onClick={() => {
        onConfirm({
          rowId: row._id,
          before: status,
          after: status === "전달완료" ? "미전달" : "전달완료",
        });
      }}
    >
      {status}
    </button>
  );
}
function StopCountBadge({ count }) {
  if (!count || count <= 0) return null;

  return (
    <span
      className="
        ml-1
        px-1.5 py-0.5
        text-[10px] font-bold
        rounded-full
        bg-indigo-100 text-indigo-700
        border border-indigo-300
        whitespace-nowrap
      "
    >
      경유 {count}
    </span>
  );
}

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
  upsertClient,
  role = "admin",
}) {
  // ❄️ 냉장 / 냉동 차량 판별
  const isColdVehicle = (type = "") => {
    const t = String(type);
    return t.includes("냉장") || t.includes("냉동");
  };
  // =======================
  // 🚚 기사 전달용 공통 문구
  // =======================
  // ❄️ 냉장/냉동 차량 안내 (끝에 줄바꿈 ❌)
  const COLD_NOTICE = `★★★필독★★★ 냉장(0~10도 유지), 냉동(-18도 이하)

인수증 및 거래명세서, 타코메타 기록지까지 꼭!! 한 장씩 찍어서 보내주세요. 인수증은 증명서입니다. 
반드시 사진 촬영 후 문자 전송 부탁드립니다. 
미공유 시 운임 지급이 지연될 수 있습니다.

만약 서류가 없으면 상/하차 사진이라도 꼭 전송 부탁드립니다.
상/하차지 이슈 발생 시 반드시 사전 연락 바랍니다.
(사진 전송 후 전화는 안 주셔도 됩니다)`;

  // 🚚 일반 차량용
  const NORMAL_NOTICE = `★★★필독★★★ 미공유 시 운임 지급이 지연될 수 있습니다.

인수증(파렛전표) 또는 거래명세서는 반드시 서명 후 문자 전송 바랍니다. 하차지에 전달하는 경우 사진 먼저 촬영 후 업체에 전달해 주시면 됩니다.

인수증이 없는 경우 문자로 내용만 전달주세요.
상·하차 이슈 발생 시 반드시 사전 연락 바랍니다. 감사합니다.`;

  // 📤 업체 전달 상태 변경 확인 팝업
  const [deliveryConfirm, setDeliveryConfirm] = React.useState(null);
  /*
  {
    rowId,
    before, // "미전달"
    after   // "전달완료"
  }
  */
  // 🚫 Firestore 저장용: undefined 필드 제거
  const stripUndefined = (obj) =>
    Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    );
  const isAdmin = role === "admin";
  // ==========================
  // 🔥 거래처 자동완성 전체 풀 (clients + dispatchData)
  // ==========================
  const allClientPool = React.useMemo(() => {
    const map = new Map();

    // 1️⃣ 거래처 관리
    (clients || []).forEach((c) => {
      const name =
        c.거래처명 || c.name || c.회사명 || c.상호 || c.title || "";
      if (!name) return;

      map.set(name, {
        거래처명: name,
        주소: c.주소 || "",
        담당자: c.담당자 || "",
        연락처: c.연락처 || "",
      });
    });

    // 2️⃣ 기존 배차 데이터에서 거래처 보강
    (dispatchData || []).forEach((r) => {
      const name = r.거래처명;
      if (!name || map.has(name)) return;

      map.set(name, {
        거래처명: name,
        주소: "",
        담당자: "",
        연락처: "",
      });
    });

    return Array.from(map.values());
  }, [clients, dispatchData]);


  // ==========================
  // 📌 날짜 유틸 (반드시 최상단)
  // ==========================
  const yesterdayKST = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

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

  // ==========================
  // 🔍 선택수정 거래처 자동완성 필터 (추가해야 함)
  // ==========================
  const normalizeClientKey = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[()㈜.,\-]/g, "")   // ❗ 법인표기 제거
      .replace(/주식회사|유한회사/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  const filterEditClients = (q) => {
    if (!q) return [];

    const nq = normalizeClientKey(q);

    return allClientPool
      .map((c) => {
        const name = c.거래처명 || "";
        const nk = normalizeClientKey(name);
        if (!nk) return null;

        let score = 0;
        if (nk === nq) score = 100;
        else if (nk.startsWith(nq)) score = 80;
        else if (nk.includes(nq)) score = 50;

        return score > 0 ? { ...c, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  };

  const normalizeKey = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  const filterEditPlaces = (q) => {
    if (!q) return [];

    const nq = normalizeKey(q);

    return (placeRows || [])
      .map((p) => {
        const nk = normalizeKey(p.업체명);
        let score = 0;

        if (nk === nq) score = 100;
        else if (nk.startsWith(nq)) score = 80;
        else if (nk.includes(nq)) score = 50;

        return { ...p, score };
      })
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  };

  // ==========================
  // 🔵 선택수정 상/하차지 자동완성 상태
  // ==========================
  const [editPlaceOptions, setEditPlaceOptions] = React.useState([]);
  const [showEditPlaceDropdown, setShowEditPlaceDropdown] = React.useState(false);
  const [editPlaceType, setEditPlaceType] = React.useState(null); // "pickup" | "drop"
  const [editActiveIndex, setEditActiveIndex] = React.useState(0);
  // ==========================
  // 🔵 선택수정 거래처 자동완성 상태 (추가)
  // ==========================
  const [editClientOptions, setEditClientOptions] = React.useState([]);
  const [showEditClientDropdown, setShowEditClientDropdown] = React.useState(false);
  const [editClientActiveIndex, setEditClientActiveIndex] = React.useState(0);

  // ------------------------
  // 상태들
  // ------------------------
  // 🔎 상태 필터
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  // ALL | UNASSIGNED | ASSIGNED | URGENT | UNDELIVERED

  const [q, setQ] = React.useState("");
  const [filterType, setFilterType] = React.useState("거래처명");
  // 🔒 실시간 배차 날짜 모드
  const [dayMode, setDayMode] = React.useState("today");
  // "yesterday" | "today" | "tomorrow"
  // 🔔 업로드 알림 리스트
  const [uploadAlerts, setUploadAlerts] = React.useState([]);
  {/* =================== 기사복사 모달 상태 =================== */ }
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const getYoil = (dateStr) => {
    const date = new Date(dateStr);
    return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][
      date.getDay()
    ];
  };

  // 📦 화물내용에서 파렛트 수 추출
  const getPalletCount = (text = "") => {
    const m = String(text).match(/(\d+)\s*파렛/);
    return m ? Number(m[1]) : null;
  };

  // 🔁 운임 중복 제거 Key
  const makeFareDedupKey = (r) => {
    const pallet = getPalletCount(r.화물내용);
    const fare = Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
    return [
      r.상차지명,
      r.하차지명,
      pallet,
      fare,
    ].join("|");
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
  const buildContactLine = (name, phone) => {
    if (!name && !phone) return "";
    if (phone) {
      return `담당자 : ${name || ""} (${formatPhone(phone)})`;
    }
    return `담당자 : ${name}`;
  };

  const copyMessage = (mode) => {
    if (!selected.length) {
      alert("복사할 항목을 선택하세요.");
      return;
    }

    const text = selected
      .map((id) => {
        const r = rows.find((x) => x._id === id);
        if (!r) return "";

        const plate = r.차량번호 || "";
        const name = r.이름 || "";
        const phone = formatPhone(r.전화번호);
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
        if (mode === "driver") {
          const yoil = getYoil(r.상차일);
          const dateText = `${r.상차일 || ""} ${yoil}`;
          let dateNotice = "";
          let dropTimeText = r.하차시간 || "즉시";

          if (r.상차일 && r.하차일) {
            const s = new Date(r.상차일);
            const e = new Date(r.하차일);

            const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
            const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

            const diffDays = Math.round(
              (e0 - s0) / (1000 * 60 * 60 * 24)
            );

            const sm = s.getMonth() + 1;
            const sd = s.getDate();
            const em = e.getMonth() + 1;
            const ed = e.getDate();

            if (diffDays === 1) {
              dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
              dropTimeText = `${em}/${ed} ${dropTimeText}`;
            } else if (diffDays >= 2) {
              dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
              dropTimeText = `${em}/${ed} ${dropTimeText}`;
            }
          }

          // ❄️ 차량종류 기준 필독 문구 선택
          const DRIVER_NOTICE = isColdVehicle(r.차량종류)
            ? COLD_NOTICE
            : NORMAL_NOTICE;

          // 전달사항
          const driverNote =
            edited[r._id]?.전달사항 ??
            r.전달사항 ??
            "";

          const driverNoteText = driverNote.trim()
            ? `\n\n📢 전달사항\n${driverNote.trim()}`
            : "";

          return `${DRIVER_NOTICE}

${dateNotice}${dateText}

상차지 : ${r.상차지명 || "-"}
${r.상차지주소 || "-"}
${(() => {
              const line = buildContactLine(r.상차지담당자, r.상차지담당자번호);
              return line ? `${line}\n` : "";
            })()}상차시간 : ${r.상차시간 || "즉시"}

하차지 : ${r.하차지명 || "-"}
${r.하차지주소 || "-"}
${(() => {
              const line = buildContactLine(r.하차지담당자, r.하차지담당자번호);
              return line ? `${line}\n` : "";
            })()}하차시간 : ${dropTimeText}

중량 : ${r.차량톤수 || "-"}${r.화물내용 ? ` / ${r.화물내용}` : ""
            } ${r.차량종류 || ""}${driverNoteText}`;
        }
        /* =======================
           FULL MODE (기사복사)
        ======================= */

        const pickupTime = r.상차시간?.trim() || "즉시";
        const dropTimeRaw = r.하차시간?.trim() || "즉시";

        let dateNotice = "";
        let dropTimeText = dropTimeRaw;

        if (r.상차일 && r.하차일) {
          const s = new Date(r.상차일);
          const e = new Date(r.하차일);

          const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
          const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

          const diffDays = Math.round(
            (e0 - s0) / (1000 * 60 * 60 * 24)
          );

          const sm = s.getMonth() + 1;
          const sd = s.getDate();
          const em = e.getMonth() + 1;
          const ed = e.getDate();

          if (diffDays === 1) {
            dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
            dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
          } else if (diffDays >= 2) {
            dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
            dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
          }
        }

        return `${dateNotice}${r.상차일 || ""} ${yoil}

상차지 : ${r.상차지명 || "-"}
${r.상차지주소 || "-"}
${(() => {
            const line = buildContactLine(
              r.상차지담당자,
              r.상차지담당자번호
            );
            return line ? `${line}\n` : "";
          })()}상차시간 : ${pickupTime}

하차지 : ${r.하차지명 || "-"}
${r.하차지주소 || "-"}
${(() => {
            const line = buildContactLine(
              r.하차지담당자,
              r.하차지담당자번호
            );
            return line ? `${line}\n` : "";
          })()}하차시간 : ${dropTimeText}

중량 : ${r.차량톤수 || "-"}${r.화물내용 ? ` / ${r.화물내용}` : ""
          } ${r.차량종류 || ""}

${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(text);
    setCopyModalOpen(false);
    // 🔥 복사 완료 후 "전달상태 변경" 확인 팝업 띄우기
    const rowId = selected[0];
    const row = rows.find(r => r._id === rowId);

    setDeliveryConfirm({
      rowId,
      before: row?.업체전달상태 || "미전달",
      after: "전달완료",
      reason: "copy", // ⭐ 기사복사에서 왔다는 표시
    });

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
  const [rows, setRows] = React.useState(dispatchData || []);
  const [selected, setSelected] = React.useState([]);
  const [selectedEditMode, setSelectedEditMode] = React.useState(false);
  const [edited, setEdited] = React.useState({});
  // =======================
  // 🔥 즉시변경 확인 팝업 (PART 5 이식)
  // =======================
  const [confirmChange, setConfirmChange] = React.useState(null);
  /*
  {
    rowId,
    key,
    before,
    after
  }
  */

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

    const targetCargo = String(row.화물내용 || "").trim();
    const targetTon = String(row.차량톤수 || "").trim();

    // 🔥 1단계: 상/하차지만으로 무조건 수집
    const base = (dispatchData || []).filter(r => {
      if (!r.청구운임) return false;
      return (
        String(r.상차지명 || "").includes(pickup) &&
        String(r.하차지명 || "").includes(drop)
      );
    });

    if (!base.length) {
      alert("📭 동일 상/하차지 운임 이력이 없습니다.");
      return;
    }

    // 🔥 2단계: 우선순위 점수 부여
    const scored = base.map(r => {
      const cargoMatch =
        targetCargo &&
        r.화물내용 &&
        r.화물내용.includes(targetCargo);

      const tonMatch =
        targetTon &&
        r.차량톤수 &&
        r.차량톤수 === targetTon;

      return {
        ...r,

        // 점수
        _score: (cargoMatch ? 100 : 0) + (tonMatch ? 100 : 0),

        // 🔥 표시용 메타
        _match: {
          cargo: cargoMatch,
          ton: tonMatch,
        },

        _time: r.updatedAt || r.등록일 || 0,
      };
    });


    // 🔥 3단계: 정렬
    scored.sort((a, b) => {
      // 1️⃣ 화물/톤 매칭 우선
      if (b._score !== a._score) return b._score - a._score;

      // 2️⃣ 최신순
      return b._time - a._time;
    });

    // 🔥 4단계: 통계
    const fares = scored.map(r =>
      Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""))
    );

    setFareResult({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
      latest: scored[0],
    });
setFarePanelOpen(true);
  };
  const [editPopupOpen, setEditPopupOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState(null);
  const [farePanelOpen, setFarePanelOpen] = React.useState(false);
  const [driverPick, setDriverPick] = React.useState(null);
  const [markDeliveredOnSave, setMarkDeliveredOnSave] = React.useState(false);
  // 🔥 운임조회 모달 ESC 닫기
React.useEffect(() => {
  if (!farePanelOpen) return;

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setFarePanelOpen(false);
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [farePanelOpen]);

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

  // ==========================
  // 🆕 신규 오더 거래처 자동완성 상태
  // ==========================
  const [newClientOptions, setNewClientOptions] = React.useState([]);
  const [showNewClientDropdown, setShowNewClientDropdown] = React.useState(false);
  const [newClientActiveIndex, setNewClientActiveIndex] = React.useState(0);

  // 신규 오더 등록 팝업
  const [showCreate, setShowCreate] = React.useState(false);
  const [fareResult, setFareResult] = React.useState(null);
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
    경유지_상차: [],
    하차지명: "",
    하차지주소: "",
    경유지_하차: [],
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
    메모중요도: "NORMAL",
    운행유형: "편도",
    혼적: false,
    독차: false,
    긴급: false,
  });
  // ==========================
  // 🆕 신규 오더 상/하차지 자동완성 상태
  // ==========================
  const [newPlaceOptions, setNewPlaceOptions] = React.useState([]);
  const [showNewPlaceDropdown, setShowNewPlaceDropdown] = React.useState(false);
  const [newPlaceType, setNewPlaceType] = React.useState(null); // "pickup" | "drop"
  const [newPlaceActiveIndex, setNewPlaceActiveIndex] = React.useState(0);
  const newPlaceListRef = React.useRef(null);

  React.useEffect(() => {
    if (!newPlaceListRef.current) return;

    const list = newPlaceListRef.current;
    const item = list.children[newPlaceActiveIndex];
    if (!item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    // ⬇️ 아래로 벗어남
    if (itemBottom > viewBottom) {
      list.scrollTop = itemBottom - list.clientHeight;
    }

    // ⬆️ 위로 벗어남
    if (itemTop < viewTop) {
      list.scrollTop = itemTop;
    }
  }, [newPlaceActiveIndex]);

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
        .map(r => ({
          ...r,
          ...map.get(r._id),

          // 🔥 경유지 유지
          경유지_상차:
            map.get(r._id)?.경유지_상차 ?? r.경유지_상차 ?? [],

          경유지_하차:
            map.get(r._id)?.경유지_하차 ?? r.경유지_하차 ?? [],
        }));

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
          ? {
            ...r,
            ...edited[r._id],

            // 🔥 경유지는 기존 값 유지
            경유지_상차:
              edited[r._id].경유지_상차 ?? r.경유지_상차,

            경유지_하차:
              edited[r._id].경유지_하차 ?? r.경유지_하차,
          }
          : r
      )
    );
  }, [edited]);
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
          audio.play().catch(() => { });
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
  // =====================
  // 🔑 거래처명 정렬 전용 normalize (공통)
  // =====================
  // =====================
  // 🔑 거래처명 통합 normalize (정렬/검색/자동완성 공용)
  // =====================
  const normalizeClient = (s = "") =>
    String(s)
      .normalize("NFC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width 제거
      .replace(/\u00A0/g, " ")               // NBSP
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/주식회사|유한회사|\(주\)|㈜/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[0-9]/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");


  // =====================
  // 🔽 정렬 비교 함수 (필수)
  // =====================
  const compareBy = (key, dir = "asc") => (a, b) => {
    // 🔥 edited 값이 있으면 그걸 기준으로
    let av = edited[a._id]?.[key] ?? a[key];
    let bv = edited[b._id]?.[key] ?? b[key];

    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    if (key === "거래처명") {
      av = normalizeClient(av);
      bv = normalizeClient(bv);
    }

    return dir === "asc"
      ? String(av).localeCompare(String(bv), "ko")
      : String(bv).localeCompare(String(av), "ko");
  };

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

  // 🔽 정렬 상태
  const [sortKey, setSortKey] = React.useState("");
  const [sortDir, setSortDir] = React.useState("asc"); // asc | desc
  const [sortModalOpen, setSortModalOpen] = React.useState(false);
  const [tempSortKey, setTempSortKey] = React.useState("");
  const [tempSortDir, setTempSortDir] = React.useState("asc");

  // ------------------------
  // 📌 필터 + 검색 + 정렬
  // ------------------------
  const filtered = React.useMemo(() => {
    let data = [...rows];

    let targetDate = todayKST();
    if (dayMode === "yesterday") targetDate = yesterdayKST();
    if (dayMode === "tomorrow") targetDate = tomorrowKST();

    // 🔒 실시간배차현황은 하루만 조회
    data = data.filter((r) => r.상차일 === targetDate);
    // 🔎 상태 필터 적용
    if (statusFilter === "UNASSIGNED") {
      data = data.filter(r => r.배차상태 !== "배차완료");
    }

    if (statusFilter === "ASSIGNED") {
      data = data.filter(r => r.배차상태 === "배차완료");
    }

    if (statusFilter === "URGENT") {
      data = data.filter(
        r => r.긴급 === true && r.배차상태 !== "배차완료"
      );
    }

    if (statusFilter === "UNDELIVERED") {
      data = data.filter(
        r => r.업체전달상태 !== "전달완료"
      );
    }

    // 검색
    if (q.trim()) {
      const key = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) =>
          String(v || "").toLowerCase().includes(key)
        )
      );
    }

    // 정렬
    if (sortKey) {
      data.sort(compareBy(sortKey, sortDir));
    }

    return data;
  }, [rows, q, sortKey, sortDir, dayMode, statusFilter]);
  // =========================
  // 📊 상태 요약 (추가 위치)
  // =========================
  const statusSummary = React.useMemo(() => {
    const 미배차 = filtered.filter(
      r => r.배차상태 !== "배차완료"
    ).length;

    const 배차완료 = filtered.filter(
      r => r.배차상태 === "배차완료"
    ).length;

    const 긴급미배차 = filtered.filter(
      r => r.긴급 === true && r.배차상태 !== "배차완료"
    ).length;

    const 업체미전달 = filtered.filter(
      r => r.업체전달상태 !== "전달완료"
    ).length;

    return {
      미배차,
      배차완료,
      긴급미배차,
      업체미전달,
    };
  }, [filtered]);


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
        await patchDispatch?.(id, stripUndefined(ch));
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
    // 🔥 이 3개는 항상 드롭다운 (PART 5와 동일)
    if (
      !canEdit(key, rowId) &&
      !["차량종류", "지급방식", "배차방식"].includes(key)
    ) {
      return val;
    }

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
          value={val || ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next === val) return;

            setConfirmChange({
              rowId,
              key: "지급방식",
              before: val || "",
              after: next,
            });
          }}
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
          value={val || ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next === val) return;

            setConfirmChange({
              rowId,
              key: "배차방식",
              before: val || "",
              after: next,
            });
          }}
        >

          <option value="">선택</option>
          <option value="24시">24시</option>
          <option value="직접배차">직접배차</option>
          <option value="인성">인성</option>
          <option value="24시(외주업체)">24시(외주업체)</option>
        </select>
      );
    }
    if (key === "차량종류") {
      return (
        <select
          className="border p-1 rounded w-full"
          value={val || ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next === val) return;

            setConfirmChange({
              rowId,
              key: "차량종류",
              before: val || "",
              after: next,
            });
          }}
        >
          <option value="">선택</option>
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
        {/* 🔍 검색 */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어"
          className="border px-2 py-1 rounded text-sm"
        />

        {/* 🕘 날짜 모드 버튼 */}
        <button
          onClick={() => setDayMode("yesterday")}
          className={`px-3 py-1 rounded text-sm ${dayMode === "yesterday"
            ? "bg-gray-700 text-white"
            : "bg-gray-200"
            }`}
        >
          어제
        </button>

        <button
          onClick={() => setDayMode("today")}
          className={`px-3 py-1 rounded text-sm ${dayMode === "today"
            ? "bg-blue-600 text-white"
            : "bg-gray-200"
            }`}
        >
          당일
        </button>

        <button
          onClick={() => setDayMode("tomorrow")}
          className={`px-3 py-1 rounded text-sm ${dayMode === "tomorrow"
            ? "bg-emerald-600 text-white"
            : "bg-gray-200"
            }`}
        >
          내일
        </button>
        {/* 👉 상태 필터 */}
        <div className="flex items-center gap-1 ml-3 text-[11px] font-semibold">

          {/* 전체 */}
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-2 py-1 rounded-full border
      ${statusFilter === "ALL"
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-gray-100 text-gray-600 border-gray-300"}
    `}
          >
            전체 {filtered.length}
          </button>

          {/* 미배차 */}
          <button
            onClick={() => setStatusFilter("UNASSIGNED")}
            className={`px-2 py-1 rounded-full border
      ${statusFilter === "UNASSIGNED"
                ? "bg-yellow-500 text-white border-yellow-500"
                : "bg-yellow-50 text-yellow-700 border-yellow-300"}
    `}
          >
            미배차 {statusSummary.미배차}
          </button>

          {/* 배차완료 */}
          <button
            onClick={() => setStatusFilter("ASSIGNED")}
            className={`px-2 py-1 rounded-full border
      ${statusFilter === "ASSIGNED"
                ? "bg-green-600 text-white border-green-600"
                : "bg-green-50 text-green-700 border-green-300"}
    `}
          >
            완료 {statusSummary.배차완료}
          </button>

          {/* 긴급 */}
          {statusSummary.긴급미배차 > 0 && (
            <button
              onClick={() => setStatusFilter("URGENT")}
              className={`px-2 py-1 rounded-full border animate-pulse
        ${statusFilter === "URGENT"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-700 border-red-300"}
      `}
            >
              긴급 {statusSummary.긴급미배차}
            </button>
          )}

          {/* 업체 미전달 */}
          {statusSummary.업체미전달 > 0 && (
            <button
              onClick={() => setStatusFilter("UNDELIVERED")}
              className={`px-2 py-1 rounded-full border
        ${statusFilter === "UNDELIVERED"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-indigo-50 text-indigo-700 border-indigo-300"}
      `}
            >
              미전달 {statusSummary.업체미전달}
            </button>
          )}
        </div>
      </div>

      {/* 상단 버튼 */}
      <div className="flex justify-end gap-2 mb-2">
        <button
          onClick={() => {
            setTempSortKey(sortKey || "");
            setTempSortDir(sortDir || "asc");
            setSortModalOpen(true);
          }}
          className="px-4 py-2 rounded-lg bg-slate-500 text-white text-sm font-semibold shadow hover:opacity-90"
        >
          정렬
        </button>

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
                "전달상태",
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
                  id={`row-${r._id}`}

                  className={`
    ${r.긴급 === true &&
                      r.배차상태 === "배차중" &&
                      (!r.차량번호 || String(r.차량번호).trim() === "")
                      ? "bg-red-50 border-l-4 border-red-500"
                      : idx % 2
                        ? "bg-gray-50"
                        : "bg-white"
                    }

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
                  <td className={cell}>
                    <div className="inline-flex items-center gap-1">
                      <span>{r.상차지명}</span>

                      {Array.isArray(r.경유지_상차) && r.경유지_상차.length > 0 && (
                        <StopBadge
                          count={r.경유지_상차.length}
                          list={r.경유지_상차}
                        />
                      )}

                      {r.운행유형 === "왕복" && <RoundTripBadge />}
                    </div>
                  </td>
                  <td className={addrCell}>
                    {renderAddrCell("상차지주소", r.상차지주소, r._id)}
                  </td>

                  <td className={cell}>
                    <div className="inline-flex items-center gap-1">
                      <span>{r.하차지명}</span>

                      {Array.isArray(r.경유지_하차) && r.경유지_하차.length > 0 && (
                        <StopBadge
                          count={r.경유지_하차.length}
                          list={r.경유지_하차}
                        />
                      )}
                    </div>
                  </td>
                  <td className={addrCell}>
                    {renderAddrCell("하차지주소", r.하차지주소, r._id)}
                  </td>

                  <td className={cell}>{editableInput("화물내용", r.화물내용, r._id)}</td>
                  <td className={cell}>
                    {editableInput(
                      "차량종류",
                      edited[r._id]?.차량종류 ?? r.차량종류,
                      r._id
                    )}
                  </td>
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
                      value={r.차량번호 || ""}
                      className="border p-1 rounded w-[110px]"
                      onChange={(e) => {
                        const v = e.target.value;

                        setRows(prev =>
                          prev.map(row =>
                            row._id === r._id
                              ? {
                                ...row,
                                차량번호: v,
                                ...(v.trim() === "" && {
                                  이름: "",
                                  전화번호: "",
                                  배차상태: "배차중",
                                }),
                              }
                              : row
                          )
                        );
                      }}
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
                    <div className="flex items-center justify-center gap-1">
                      {/* 배차상태 */}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${r.배차상태 === "배차완료"
                          ? "bg-green-100 text-green-700 border border-green-400"
                          : "bg-yellow-100 text-yellow-700 border border-yellow-400"
                          }`}
                      >
                        {r.배차상태}
                      </span>

                      {/* 🚨 긴급 뱃지 (배차중일 때만 표시) */}
                      {r.긴급 && r.배차상태 !== "배차완료" && (
                        <span
                          className="
          px-2 py-0.5 rounded-full
          text-[10px] font-bold
          bg-red-600 text-white
          animate-pulse
        "
                        >
                          긴급
                        </span>
                      )}
                    </div>
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
                    {/* 🔴 메모 중요도 뱃지 */}
                    {r.메모중요도 === "CRITICAL" && (
                      <span className="mr-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white">
                        긴급
                      </span>
                    )}
                    {r.메모중요도 === "HIGH" && (
                      <span className="mr-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-orange-200 text-orange-800">
                        중요
                      </span>
                    )}

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
                  {/* 전달상태 */}
                  <td className={cell}>
                    <DeliveryStatusBadge
                      row={r}
                      onConfirm={setDeliveryConfirm}
                    />
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
              {/* 🚨 긴급 오더 */}
              <div className="flex items-center gap-2 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newOrder.긴급 === true}
                    onChange={(e) =>
                      setNewOrder((p) => ({
                        ...p,
                        긴급: e.target.checked,
                      }))
                    }
                  />
                  <span className="font-semibold text-red-600">🚨 긴급 오더</span>
                </label>
              </div>

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

                {/* ===================== 신규 오더 거래처 자동완성 ===================== */}
                <div className="relative">
                  <label className="font-semibold text-sm">거래처명</label>

                  <input
                    type="text"
                    className="border p-2 rounded w-full"
                    value={newOrder.거래처명}
                    placeholder="거래처 검색"
                    onChange={(e) => {
                      const v = e.target.value;

                      setNewOrder((prev) => ({
                        ...prev,
                        거래처명: v,
                      }));

                      const list = filterEditClients(v);
                      setNewClientOptions(list);
                      setShowNewClientDropdown(true);
                      setNewClientActiveIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (!showNewClientDropdown) return;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setNewClientActiveIndex((i) =>
                          Math.min(i + 1, newClientOptions.length - 1)
                        );
                      }

                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setNewClientActiveIndex((i) => Math.max(i - 1, 0));
                      }

                      if (e.key === "Enter") {
                        e.preventDefault();
                        const c = newClientOptions[newClientActiveIndex];
                        if (!c) return;

                        setNewOrder((prev) => ({
                          ...prev,
                          거래처명: c.거래처명,
                          상차지명: c.거래처명,
                          상차지주소: c.주소 || "",
                        }));

                        setShowNewClientDropdown(false);
                      }
                    }}
                    onBlur={() =>
                      setTimeout(() => setShowNewClientDropdown(false), 150)
                    }
                  />

                  {showNewClientDropdown && (
                    <div className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                      {newClientOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-400">
                          검색 결과 없음
                        </div>
                      ) : (
                        newClientOptions.map((c, i) => (
                          <div
                            key={i}
                            className={`px-3 py-1 cursor-pointer ${i === newClientActiveIndex ? "bg-blue-100" : ""
                              }`}
                            onMouseDown={() => {
                              setNewOrder((prev) => ({
                                ...prev,
                                거래처명: c.거래처명,
                                상차지명: c.거래처명,
                                상차지주소: c.주소 || "",
                              }));
                              setShowNewClientDropdown(false);
                            }}
                          >
                            <div className="font-semibold">{c.거래처명}</div>
                            {c.주소 && (
                              <div className="text-xs text-gray-500">{c.주소}</div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

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
                      "오전 6:00", "오전 6:30",
                      "오전 7:00", "오전 7:30",
                      "오전 8:00", "오전 8:30",
                      "오전 9:00", "오전 9:30",
                      "오전 10:00", "오전 10:30",
                      "오전 11:00", "오전 11:30",
                      "오후 12:00", "오후 12:30",
                      "오후 1:00", "오후 1:30",
                      "오후 2:00", "오후 2:30",
                      "오후 3:00", "오후 3:30",
                      "오후 4:00", "오후 4:30",
                      "오후 5:00", "오후 5:30",
                      "오후 6:00", "오후 6:30",
                      "오후 7:00", "오후 7:30",
                      "오후 8:00", "오후 8:30",
                      "오후 9:00", "오후 9:30",
                      "오후 10:00", "오후 10:30",
                      "오후 11:00", "오후 11:30",
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
                      "오전 6:00", "오전 6:30",
                      "오전 7:00", "오전 7:30",
                      "오전 8:00", "오전 8:30",
                      "오전 9:00", "오전 9:30",
                      "오전 10:00", "오전 10:30",
                      "오전 11:00", "오전 11:30",
                      "오후 12:00", "오후 12:30",
                      "오후 1:00", "오후 1:30",
                      "오후 2:00", "오후 2:30",
                      "오후 3:00", "오후 3:30",
                      "오후 4:00", "오후 4:30",
                      "오후 5:00", "오후 5:30",
                      "오후 6:00", "오후 6:30",
                      "오후 7:00", "오후 7:30",
                      "오후 8:00", "오후 8:30",
                      "오후 9:00", "오후 9:30",
                      "오후 10:00", "오후 10:30",
                      "오후 11:00", "오후 11:30",
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
                  {/* ===================== 신규 오더 상차지명 ===================== */}
                  <div className="mb-2 relative">
                    <label>상차지명</label>
                    <input
                      className="border p-2 rounded w-full"
                      value={newOrder.상차지명}
                      onChange={(e) => {
                        const v = e.target.value;

                        setNewOrder((p) => ({ ...p, 상차지명: v }));
                        setNewPlaceType("pickup");

                        const list = filterEditPlaces(v);
                        setNewPlaceOptions(list);
                        setShowNewPlaceDropdown(true);
                        setNewPlaceActiveIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (!showNewPlaceDropdown || newPlaceType !== "pickup") return;

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setNewPlaceActiveIndex((i) =>
                            Math.min(i + 1, newPlaceOptions.length - 1)
                          );
                        }

                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setNewPlaceActiveIndex((i) => Math.max(i - 1, 0));
                        }

                        if (e.key === "Enter") {
                          e.preventDefault();
                          const p = newPlaceOptions[newPlaceActiveIndex];
                          if (!p) return;

                          setNewOrder((prev) => ({
                            ...prev,
                            상차지명: p.업체명,
                            상차지주소: p.주소 || "",
                          }));

                          setShowNewPlaceDropdown(false);

                          // 🔥 다음 필드(상차지주소)로 포커스 이동
                          setTimeout(() => {
                            document.getElementById("new-pickup-addr")?.focus();
                          }, 0);
                        }
                      }}
                      onBlur={() =>
                        setTimeout(() => setShowNewPlaceDropdown(false), 150)
                      }
                    />

                    {showNewPlaceDropdown && newPlaceType === "pickup" && (
                      <div
                        ref={newPlaceListRef}
                        className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto"
                      >
                        {newPlaceOptions.map((p, i) => (
                          <div
                            key={i}
                            className={`px-3 py-1 cursor-pointer ${i === newPlaceActiveIndex ? "bg-blue-100" : ""
                              }`}
                            onMouseDown={() => {
                              setNewOrder((prev) => ({
                                ...prev,
                                상차지명: p.업체명,
                                상차지주소: p.주소 || "",
                              }));
                              setShowNewPlaceDropdown(false);
                            }}
                          >
                            <div className="font-semibold">{p.업체명}</div>
                            <div className="text-xs text-gray-500">{p.주소}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* 상차지주소 */}
                <div>
                  <label>상차지주소</label>
                  <input
                    id="new-pickup-addr"
                    type="text"
                    className="border p-2 rounded w-full"
                    value={newOrder.상차지주소}
                    onChange={(e) =>
                      setNewOrder((p) => ({ ...p, 상차지주소: e.target.value }))
                    }
                  />

                </div>

                {/* 하차지명 */}
                <div>
                  {/* ===================== 신규 오더 하차지명 ===================== */}
                  <div className="mb-2 relative">
                    <label>하차지명</label>
                    <input
                      className="border p-2 rounded w-full"
                      value={newOrder.하차지명}
                      onChange={(e) => {
                        const v = e.target.value;

                        setNewOrder((p) => ({ ...p, 하차지명: v }));
                        setNewPlaceType("drop");

                        const list = filterEditPlaces(v);
                        setNewPlaceOptions(list);
                        setShowNewPlaceDropdown(true);
                        setNewPlaceActiveIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (!showNewPlaceDropdown || newPlaceType !== "drop") return;

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setNewPlaceActiveIndex((i) =>
                            Math.min(i + 1, newPlaceOptions.length - 1)
                          );
                        }

                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setNewPlaceActiveIndex((i) => Math.max(i - 1, 0));
                        }

                        if (e.key === "Enter") {
                          e.preventDefault();
                          const p = newPlaceOptions[newPlaceActiveIndex];
                          if (!p) return;

                          setNewOrder((prev) => ({
                            ...prev,
                            하차지명: p.업체명,
                            하차지주소: p.주소 || "",
                          }));

                          setShowNewPlaceDropdown(false);

                          // 🔥 다음 필드(하차지주소) 포커스
                          setTimeout(() => {
                            document.getElementById("new-drop-addr")?.focus();
                          }, 0);
                        }
                      }}
                      onBlur={() =>
                        setTimeout(() => setShowNewPlaceDropdown(false), 150)
                      }
                    />

                    {showNewPlaceDropdown && newPlaceType === "drop" && (
                      <div
                        ref={newPlaceListRef}
                        className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto"
                      >
                        {newPlaceOptions.map((p, i) => (
                          <div
                            key={i}
                            className={`px-3 py-1 cursor-pointer ${i === newPlaceActiveIndex ? "bg-blue-100" : ""
                              }`}
                            onMouseDown={() => {
                              setNewOrder((prev) => ({
                                ...prev,
                                하차지명: p.업체명,
                                하차지주소: p.주소 || "",
                              }));
                              setShowNewPlaceDropdown(false);
                            }}
                          >
                            <div className="font-semibold">{p.업체명}</div>
                            <div className="text-xs text-gray-500">{p.주소}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* 하차지주소 */}
                <div>
                  <label>하차지주소</label>
                  <input
                    id="new-drop-addr"
                    type="text"
                    className="border p-2 rounded w-full"
                    value={newOrder.하차지주소}
                    onChange={(e) =>
                      setNewOrder((p) => ({ ...p, 하차지주소: e.target.value }))
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
                    const payload = stripUndefined({
                      ...newOrder,
                      경유지_상차: Array.isArray(newOrder.경유지_상차)
                        ? newOrder.경유지_상차
                        : [],

                      경유지_하차: Array.isArray(newOrder.경유지_하차)
                        ? newOrder.경유지_하차
                        : [],
                      메모중요도: memoPriority,
                      운행유형: newOrder.운행유형 || "편도",
                      긴급: newOrder.긴급 === true,

                      운임보정: newOrder.긴급
                        ? {
                          type: "긴급",
                          rate: 0.2,
                          memo: "긴급 오더",
                        }
                        : null,

                      등록일: new Date().toISOString().slice(0, 10),
                      배차상태: "배차중",
                      차량번호: "",
                      이름: "",
                      전화번호: "",
                      업체전달상태: "미전달",
                      업체전달일시: null,
                      업체전달방법: null,
                      업체전달자: null,
                    });

                    await addDispatch?.(payload);

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
            {/* ===================== 📦 운임조회 중앙 모달 ===================== */}
{farePanelOpen && fareResult && (
  
  <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50">
    <div className="bg-white w-[520px] max-h-[80vh] rounded-xl shadow-2xl p-6 overflow-y-auto">

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">📦 운임 조회 결과</h3>
        <button
          className="px-3 py-1 text-sm bg-gray-200 rounded"
          onClick={() => setFarePanelOpen(false)}
        >
          닫기
        </button>
      </div>

      {/* 요약 */}
      <div className="text-base mb-4 leading-relaxed">
        <div>총 <b>{fareResult.count}</b>건</div>
        <div>평균 운임: <b className="text-blue-600">
          {fareResult.avg.toLocaleString()}원
        </b></div>
        <div className="text-sm text-gray-600">
          범위: {fareResult.min.toLocaleString()}원 ~{" "}
          {fareResult.max.toLocaleString()}원
        </div>
      </div>

      {/* 리스트 */}
      <div className="space-y-4 border-t pt-4">
  {fareResult.records.map((rec) => (
    <div
      key={rec._id}
      className="p-4 border rounded-xl bg-white hover:bg-blue-50"
    >
      {/* 1️⃣ 상단: 날짜 + 매칭 뱃지 */}
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm font-semibold text-gray-700">
          {rec.상차일}
        </div>

        <div className="flex gap-1">
          {(rec._match?.cargo || rec._match?.ton) && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-600 text-white">
              최적 매칭
            </span>
          )}
          {rec._match?.cargo && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-200 text-indigo-900">
              화물 동일
            </span>
          )}
          {rec._match?.ton && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-200 text-emerald-900">
              톤수 동일
            </span>
          )}
        </div>
      </div>

      {/* 2️⃣ 상/하차 */}
      <div className="text-sm font-medium mb-1">
        {rec.상차지명} → {rec.하차지명}
      </div>

      {/* 3️⃣ 차량 / 화물 */}
      <div className="text-sm text-gray-700 mb-1">
        {rec.차량종류 || "-"} / {rec.차량톤수 || "-"}
      </div>

      <div className="text-sm text-gray-800 mb-2">
        화물: <b>{rec.화물내용 || "-"}</b>
      </div>

      {/* 4️⃣ 기사 정보 */}
      <div className="text-sm text-gray-700 mb-2">
        기사: <b>{rec.이름 || "-"}</b> / 기사운임{" "}
        <b className="text-green-700">
          {(rec.기사운임 || 0).toLocaleString()}원
        </b>
      </div>

      {/* 5️⃣ 금액 + 적용 */}
      <div className="flex justify-between items-center mt-2">
        <div className="text-lg font-bold text-blue-700">
          {(rec.청구운임 || 0).toLocaleString()}원
        </div>

        <button
          className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-semibold"
          onClick={() => {
            setEditTarget((p) => ({
              ...p,
              청구운임: Number(rec.청구운임 || 0),
              수수료:
                Number(rec.청구운임 || 0) -
                Number(p.기사운임 || 0),
            }));
            setFarePanelOpen(false);
          }}
        >
          적용
        </button>
      </div>
    </div>
  ))}
</div>

      {/* 평균 적용 */}
      <button
        className="mt-5 w-full py-3 bg-emerald-600 text-white text-base font-semibold rounded-lg"
        onClick={() => {
          setEditTarget((p) => ({
            ...p,
            청구운임: fareResult.avg,
            수수료:
              Number(fareResult.avg || 0) -
              Number(p.기사운임 || 0),
          }));
          setFarePanelOpen(false);
        }}
      >
        평균 운임 적용
      </button>
    </div>
  </div>
)}

            {/* ================= 선택수정: 상태 버튼 그룹 ================= */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">

              {/* 🚨 긴급 */}
              <button
                type="button"
                onClick={() =>
                  setEditTarget((p) => ({
                    ...p,
                    긴급: !p.긴급,
                    운임보정: !p.긴급
                      ? { type: "긴급", rate: 0.2, memo: "긴급 오더" }
                      : null,
                  }))
                }
                className={`
      px-3 py-1.5 rounded-full text-xs font-semibold border
      ${editTarget.긴급
                    ? "bg-red-600 text-white border-red-600 animate-pulse"
                    : "bg-red-50 text-red-600 border-red-300 hover:bg-red-100"}
    `}
              >
                🚨 긴급
              </button>

              <button
                type="button"
                onClick={() =>
                  setEditTarget((p) => {
                    const next = p.운행유형 === "왕복" ? "편도" : "왕복";

                    // 🔥 추가된 딱 한 군데 (저장되게 만드는 핵심)
                    setEdited((prev) => ({
                      ...prev,
                      [p._id]: {
                        ...(prev[p._id] || {}),
                        운행유형: next,
                      },
                    }));

                    return {
                      ...p,
                      운행유형: next,
                    };
                  })
                }
                className={`
    px-3 py-1.5 rounded-full text-xs font-semibold border
    ${editTarget.운행유형 === "왕복"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"}
  `}
              >
                🔁 왕복
              </button>


              {/* 📦 혼적 */}
              <button
                type="button"
                onClick={() =>
                  setEditTarget((p) => ({
                    ...p,
                    혼적: !p.혼적,
                    독차: p.혼적 ? p.독차 : false, // ⭐ 혼적 켜면 독차 해제
                  }))
                }
                className={`
      px-3 py-1.5 rounded-full text-xs font-semibold border
      ${editTarget.혼적
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"}
    `}
              >
                📦 혼적
              </button>
              {/* 📤 업체 전달 */}
              <button
                type="button"
                onClick={() => {
                  setDeliveryConfirm({
                    rowId: editTarget._id,
                    before: editTarget.업체전달상태 || "미전달",
                    after:
                      editTarget.업체전달상태 === "전달완료"
                        ? "미전달"
                        : "전달완료",
                  });
                }}
                className="
    px-3 py-1.5 rounded-full text-xs font-semibold border
    bg-green-50 text-green-700 border-green-300 hover:bg-green-100
  "
              >
                📤 업체 전달
              </button>
            </div>

            {/* ------------------------------------------------ */}
            {/* 🔵 거래처명 */}
            {/* ------------------------------------------------ */}
            {/* ===================== 거래처명 ===================== */}
            <div className="mb-3 relative">
              <label>거래처명</label>
              <input
                className="border p-2 rounded w-full"
                value={editTarget.거래처명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setShowEditPlaceDropdown(false); // 🔥 충돌 방지
                  setEditTarget((p) => ({ ...p, 거래처명: v }));
                  setEditClientOptions(filterEditClients(v));
                  setShowEditClientDropdown(true);
                  setEditClientActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showEditClientDropdown) return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setEditClientActiveIndex((i) =>
                      Math.min(i + 1, editClientOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setEditClientActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const c = editClientOptions[editClientActiveIndex];
                    if (!c) return;

                    setEditTarget((prev) => ({
                      ...prev,

                      // 거래처
                      거래처명: c.거래처명,
                      거래처주소: c.주소 || prev.거래처주소,
                      거래처담당자: c.담당자 || prev.거래처담당자,
                      거래처연락처: c.연락처 || prev.거래처연락처,

                      // 🔥 핵심 추가: 거래처 선택 = 상차지 자동 세팅
                      상차지명: c.거래처명,
                      상차지주소: c.주소 || prev.상차지주소,
                    }));
                    setShowEditClientDropdown(false);
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowEditClientDropdown(false), 150)
                }
              />

              {showEditClientDropdown && (
                <div className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {editClientOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      검색 결과 없음
                    </div>
                  ) : (
                    editClientOptions.map((c, i) => (
                      <div
                        key={i}
                        className={`px-3 py-1 cursor-pointer ${i === editClientActiveIndex ? "bg-blue-100" : ""
                          }`}
                        onMouseDown={() => {
                          setEditTarget((prev) => ({
                            ...prev,

                            거래처명: c.거래처명,
                            거래처주소: c.주소 || prev.거래처주소,
                            거래처담당자: c.담당자 || prev.거래처담당자,
                            거래처연락처: c.연락처 || prev.거래처연락처,

                            // 🔥 여기
                            상차지명: c.거래처명,
                            상차지주소: c.주소 || prev.상차지주소,
                          }));
                          setShowEditClientDropdown(false);
                        }}
                      >
                        <div className="font-semibold">{c.거래처명}</div>
                        {c.주소 && (
                          <div className="text-xs text-gray-500">{c.주소}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
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
                    "오전 6:00", "오전 6:30",
                    "오전 7:00", "오전 7:30",
                    "오전 8:00", "오전 8:30",
                    "오전 9:00", "오전 9:30",
                    "오전 10:00", "오전 10:30",
                    "오전 11:00", "오전 11:30",
                    "오후 12:00", "오후 12:30",
                    "오후 1:00", "오후 1:30",
                    "오후 2:00", "오후 2:30",
                    "오후 3:00", "오후 3:30",
                    "오후 4:00", "오후 4:30",
                    "오후 5:00", "오후 5:30",
                    "오후 6:00", "오후 6:30",
                    "오후 7:00", "오후 7:30",
                    "오후 8:00", "오후 8:30",
                    "오후 9:00", "오후 9:30",
                    "오후 10:00", "오후 10:30",
                    "오후 11:00", "오후 11:30",
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
                    "오전 6:00", "오전 6:30",
                    "오전 7:00", "오전 7:30",
                    "오전 8:00", "오전 8:30",
                    "오전 9:00", "오전 9:30",
                    "오전 10:00", "오전 10:30",
                    "오전 11:00", "오전 11:30",
                    "오후 12:00", "오후 12:30",
                    "오후 1:00", "오후 1:30",
                    "오후 2:00", "오후 2:30",
                    "오후 3:00", "오후 3:30",
                    "오후 4:00", "오후 4:30",
                    "오후 5:00", "오후 5:30",
                    "오후 6:00", "오후 6:30",
                    "오후 7:00", "오후 7:30",
                    "오후 8:00", "오후 8:30",
                    "오후 9:00", "오후 9:30",
                    "오후 10:00", "오후 10:30",
                    "오후 11:00", "오후 11:30"
                  ].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ------------------------------------------------ */}
            {/* 🔵 상하차지 */}
            {/* ------------------------------------------------ */}
            {/* ===================== 상차지 ===================== */}
            <div className="mb-3 relative">
              <label>상차지명</label>
              <input
                className="border p-2 rounded w-full"
                value={editTarget.상차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;

                  setEditTarget((p) => ({ ...p, 상차지명: v }));
                  setEditPlaceType("pickup");
                  setEditPlaceOptions(filterEditPlaces(v));
                  setShowEditPlaceDropdown(true);
                  setEditActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showEditPlaceDropdown || editPlaceType !== "pickup") return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setEditActiveIndex((i) =>
                      Math.min(i + 1, editPlaceOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setEditActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = editPlaceOptions[editActiveIndex];
                    if (!p) return;

                    setEditTarget((prev) => ({
                      ...prev,
                      상차지명: p.업체명,
                      상차지주소: p.주소 || "",
                    }));

                    setShowEditPlaceDropdown(false);
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowEditPlaceDropdown(false), 150)
                }
              />

              {showEditPlaceDropdown && editPlaceType === "pickup" && (
                <div className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {editPlaceOptions.map((p, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 cursor-pointer ${i === editActiveIndex ? "bg-blue-100" : ""
                        }`}
                      onMouseDown={() => {
                        setEditTarget((prev) => ({
                          ...prev,
                          상차지명: p.업체명,
                          상차지주소: p.주소 || "",
                        }));
                        setShowEditPlaceDropdown(false);
                      }}
                    >
                      <div className="font-semibold">{p.업체명}</div>
                      <div className="text-xs text-gray-500">{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
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
            {/* ===================== 하차지 ===================== */}
            <div className="mb-3 relative">
              <label>하차지명</label>
              <input
                className="border p-2 rounded w-full"
                value={editTarget.하차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;

                  setEditTarget((p) => ({ ...p, 하차지명: v }));
                  setEditPlaceType("drop");
                  setEditPlaceOptions(filterEditPlaces(v));
                  setShowEditPlaceDropdown(true);
                  setEditActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showEditPlaceDropdown || editPlaceType !== "drop") return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setEditActiveIndex((i) =>
                      Math.min(i + 1, editPlaceOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setEditActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = editPlaceOptions[editActiveIndex];
                    if (!p) return;

                    setEditTarget((prev) => ({
                      ...prev,
                      하차지명: p.업체명,
                      하차지주소: p.주소 || "",
                    }));

                    setShowEditPlaceDropdown(false);
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowEditPlaceDropdown(false), 150)
                }
              />

              {showEditPlaceDropdown && editPlaceType === "drop" && (
                <div className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {editPlaceOptions.map((p, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 cursor-pointer ${i === editActiveIndex ? "bg-blue-100" : ""
                        }`}
                      onMouseDown={() => {
                        setEditTarget((prev) => ({
                          ...prev,
                          하차지명: p.업체명,
                          하차지주소: p.주소 || "",
                        }));
                        setShowEditPlaceDropdown(false);
                      }}
                    >
                      <div className="font-semibold">{p.업체명}</div>
                      <div className="text-xs text-gray-500">{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
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

                  setEditTarget((p) => ({
                    ...p,
                    차량번호: raw,

                    // 🔥 차량번호를 전부 지우면 기사정보도 즉시 제거
                    ...(raw.trim() === "" && {
                      이름: "",
                      전화번호: "",
                      배차상태: "배차중",
                    }),
                  }));
                }}
                onKeyDown={(e) => {
  if (e.key !== "Enter") return;

  const raw = e.target.value.trim();
  const clean = raw.replace(/\s+/g, "");
  if (!clean) return;

  const matches = drivers.filter(
    (d) => String(d.차량번호 || "").replace(/\s+/g, "") === clean
  );

  // 1명 → 바로 적용
  if (matches.length === 1) {
    const d = matches[0];
    setEditTarget((p) => ({
      ...p,
      차량번호: raw,
      이름: d.이름 || "",
      전화번호: d.전화번호 || "",
      배차상태: "배차완료",
    }));
    setDriverPick(null);
    return;
  }

  // 여러 명 → 선택 UI 띄우기
  if (matches.length > 1) {
    setDriverPick({
      plate: raw,
      list: matches,
    });
    return;
  }

  // 0명 → 신규 등록
  const ok = window.confirm(
    `[${raw}] 등록된 기사가 없습니다.\n신규 기사로 추가할까요?`
  );
  if (!ok) return;

  const 이름 = prompt("기사명 입력");
  if (!이름) return;

  const 전화번호 = prompt("전화번호 입력");
  if (!전화번호) return;

  upsertDriver({ 차량번호: raw, 이름, 전화번호 });

  setEditTarget((p) => ({
    ...p,
    차량번호: raw,
    이름,
    전화번호,
    배차상태: "배차완료",
  }));
}}
              />
              {driverPick && (
  <div className="mt-2 border rounded-md bg-white shadow-sm">
    <div className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-b">
      동일 차량번호 기사 선택
    </div>

    {driverPick.list.map((d) => (
      <button
        key={d.id}
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
        onClick={() => {
          setEditTarget((p) => ({
            ...p,
            차량번호: driverPick.plate,
            이름: d.이름,
            전화번호: d.전화번호,
            배차상태: "배차완료",
          }));
          setDriverPick(null);
        }}
      >
        <div className="font-medium">{d.이름}</div>
        <div className="text-xs text-gray-500">{d.전화번호}</div>
      </button>
    ))}
  </div>
)}
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
            {/* 🔵 메모 + 메모 중요도 */}
            {/* ------------------------------------------------ */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold">메모</label>

                {/* 🔴 메모 중요도 버튼 */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEditTarget((p) => ({ ...p, 메모중요도: "NORMAL" }))
                    }
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border
          ${editTarget.메모중요도 === "NORMAL"
                        ? "bg-gray-700 text-white border-gray-700"
                        : "bg-gray-100 text-gray-600 border-gray-300"}
        `}
                  >
                    일반
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditTarget((p) => ({ ...p, 메모중요도: "HIGH" }))
                    }
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border
          ${editTarget.메모중요도 === "HIGH"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-orange-100 text-orange-700 border-orange-300"}
        `}
                  >
                    중요
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditTarget((p) => ({ ...p, 메모중요도: "CRITICAL" }))
                    }
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border
          ${editTarget.메모중요도 === "CRITICAL"
                        ? "bg-red-600 text-white border-red-600 animate-pulse"
                        : "bg-red-100 text-red-600 border-red-300"}
        `}
                  >
                    긴급
                  </button>
                </div>
              </div>

              <textarea
                className="border p-2 rounded w-full h-20"
                value={editTarget.메모 || ""}
                onChange={(e) =>
                  setEditTarget((p) => ({ ...p, 메모: e.target.value }))
                }
              />
            </div>

            {/* ===============================
    🕘 수정 이력
=============================== */}
            {Array.isArray(editTarget.history) &&
              editTarget.history.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="text-sm font-semibold mb-2 text-gray-700">
                    🕘 수정 이력
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {editTarget.history
                      .filter(h => !IGNORE_HISTORY_FIELDS.has(h.field)) // ⭐ 여기!
                      .slice()
                      .reverse()
                      .map((h, i) => (

                        <div
                          key={i}
                          className="text-xs text-gray-700 border-b pb-1"
                        >
                          <div className="text-gray-500">
                            {new Date(h.at).toLocaleString()} · {h.user}
                          </div>

                          <div>
                            <b>{h.field}</b> :{" "}
                            <span className="text-red-600">
                              {String(h.before ?? "없음")}
                            </span>
                            {" → "}
                            <span className="text-blue-600">
                              {String(h.after ?? "없음")}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

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
                  const ALLOWED_FIELDS = [
                    "등록일",
                    "상차일", "상차시간",
                    "하차일", "하차시간",
                    "거래처명",
                    "상차지명", "상차지주소",
                    "하차지명", "하차지주소",
                    "경유지_상차",
                    "경유지_하차",
                    "화물내용",
                    "차량종류", "차량톤수",
                    "차량번호", "이름", "전화번호",
                    "청구운임", "기사운임",
                    "지급방식", "배차방식",
                    "메모",
                    "메모중요도",
                    "전달사항",
                    "운행유형",
                    "혼적", "독차",
                    "긴급", "운임보정",
                    "배차상태",
                  ];

                  const sender =
                    auth?.currentUser?.email ??
                    auth?.currentUser?.uid ??
                    "unknown";

                  const payload = stripUndefined({
                    ...ALLOWED_FIELDS.reduce((acc, k) => {
                      if (editTarget[k] !== undefined) {
                        acc[k] = editTarget[k];
                      }
                      return acc;
                    }, {}),

                    // ✅ 📤 업체 전달 버튼 눌렀을 때만 추가
                    ...(markDeliveredOnSave && {
                      업체전달상태: "전달완료",
                      업체전달일시: Date.now(),
                      업체전달방법: "선택수정",
                      업체전달자: sender,
                    }),
                  });

                  await patchDispatch(editTarget._id, payload);
                  // ===============================
                  // 🔥 거래처 정보 최신화 (선택수정 시)
                  // ===============================
                  if (editTarget.거래처명) {
                    const clientPayload = {
                      거래처명: editTarget.거래처명,
                      주소: editTarget.상차지주소 || "",
                      담당자: editTarget.거래처담당자 || "",
                      연락처: editTarget.거래처연락처 || "",
                      updatedAt: Date.now(),
                    };

                    // 🔥 거래처 마스터 최신화
                    await upsertClient?.(clientPayload);
                  }

                  // 🔥 중요: 다음 편집을 위해 초기화
                  setMarkDeliveredOnSave(false);
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
                className={`flex-1 py-2 rounded-lg text-white ${driverConfirmInfo.type === "new"
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

      {/* ===================== 기사 선택 모달 (PART 5 동일) ===================== */}
      {driverSelectInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999]">
          <div className="bg-white p-5 rounded-xl shadow-xl w-[380px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-3">🚚 기사 선택</h3>

            {driverSelectInfo.list.map((d) => (
              <button
                key={d._id}
                className={`w-full text-left border p-2 mb-2 rounded
            ${driverSelectInfo.selectedDriver === d
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
                          className={`font-semibold ${fee < 0 ? "text-red-600" : "text-orange-600"
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
              <button
                onClick={() => copyMessage("driver")}
                className="w-full py-2 bg-emerald-200 rounded hover:bg-emerald-300 font-semibold text-emerald-900"
              >
                기사 전달용 (상세 + 전달메시지)
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
      {/* ===================== 🔥 즉시 변경 확인 팝업 (PART 5 이식) ===================== */}
      {confirmChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000]">
          <div className="bg-white rounded-2xl p-6 w-[380px] shadow-2xl">
            <h3 className="text-lg font-bold text-center mb-4">
              상태를 변경하시겠습니까?
            </h3>

            <div className="text-center text-sm mb-6">
              <div className="font-semibold mb-1">
                {confirmChange.key}
              </div>
              <div className="text-gray-500">
                {confirmChange.before || "없음"} →
                <span className="ml-1 text-blue-600 font-bold">
                  {confirmChange.after}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                onClick={() => setConfirmChange(null)}
              >
                취소
              </button>

              <button
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                onClick={async () => {
                  const patch = {
                    [confirmChange.key]: confirmChange.after,
                  };

                  if (confirmChange.key === "업체전달상태") {
                    patch.업체전달일시 =
                      confirmChange.after === "전달완료"
                        ? Date.now()
                        : null;
                    patch.업체전달방법 = "수동";
                  }

                  await patchDispatch(confirmChange.rowId, patch);
                  setConfirmChange(null);
                }}
              >
                변경
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===================== 📤 업체 전달 상태 변경 팝업 ===================== */}
      {deliveryConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100001]"
          tabIndex={-1}
          ref={(el) => el && el.focus()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDeliveryConfirm(null);
            }

            if (e.key === "Enter") {
              e.preventDefault();

              const sender =
                auth?.currentUser?.email ??
                auth?.currentUser?.uid ??
                "unknown";

              patchDispatch(deliveryConfirm.rowId, {
                업체전달상태: deliveryConfirm.after,
                업체전달일시:
                  deliveryConfirm.after === "전달완료" ? Date.now() : null,
                업체전달방법:
                  deliveryConfirm.after === "전달완료" ? "수동" : null,
                업체전달자:
                  deliveryConfirm.after === "전달완료" ? sender : null,
              });

              setDeliveryConfirm(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl p-6 w-[360px] shadow-xl">
            <h3 className="text-lg font-bold text-center mb-2">
              {deliveryConfirm.reason === "copy"
                ? "📋 복사되었습니다"
                : "변경하시겠습니까?"}
            </h3>

            <div className="text-center text-sm mb-5">
              {deliveryConfirm.reason === "copy" ? (
                <div className="text-gray-700">
                  전달상태를 <b className="text-blue-600">전달완료</b>로 변경할까요?
                </div>
              ) : (
                <>
                  <div className="font-semibold mb-1">업체전달상태</div>
                  <div className="text-gray-500">
                    {deliveryConfirm.before} →
                    <span className="ml-1 text-blue-600 font-bold">
                      {deliveryConfirm.after}
                    </span>
                  </div>
                </>
              )}
            </div>


            <div className="flex gap-3">
              <button
                className="flex-1 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                onClick={() => setDeliveryConfirm(null)}
              >
                아니오 (ESC)
              </button>

              <button
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  const sender =
                    auth?.currentUser?.email ??
                    auth?.currentUser?.uid ??
                    "unknown";

                  patchDispatch(deliveryConfirm.rowId, {
                    업체전달상태: deliveryConfirm.after,
                    업체전달일시:
                      deliveryConfirm.after === "전달완료" ? Date.now() : null,
                    업체전달방법: "수동",
                    업체전달자: sender,
                  });

                  setDeliveryConfirm(null);
                }}
              >
                확인 (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== 🔽 정렬 설정 팝업 ===================== */}
      {sortModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[99999]">
          <div className="bg-white rounded-xl p-5 w-[360px] shadow-xl">
            <h3 className="text-lg font-bold mb-4">정렬 설정</h3>

            {/* 정렬 기준 */}
            <div className="mb-3">
              <label className="text-sm font-semibold">정렬 기준</label>
              <select
                className="border p-2 rounded w-full mt-1"
                value={tempSortKey}
                onChange={(e) => setTempSortKey(e.target.value)}
              >
                <option value="">선택 안함</option>
                {[
                  "등록일",
                  "상차일",
                  "하차일",
                  "거래처명",
                  "상차지명",
                  "하차지명",
                  "차량번호",
                  "배차상태",
                  "청구운임",
                  "기사운임",
                  "수수료",
                ].map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            {/* 정렬 방향 */}
            <div className="mb-4">
              <label className="text-sm font-semibold">정렬 방향</label>
              <div className="flex gap-2 mt-1">
                <button
                  className={`flex-1 py-2 rounded ${tempSortDir === "asc"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200"
                    }`}
                  onClick={() => setTempSortDir("asc")}
                >
                  오름차순
                </button>
                <button
                  className={`flex-1 py-2 rounded ${tempSortDir === "desc"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200"
                    }`}
                  onClick={() => setTempSortDir("desc")}
                >
                  내림차순
                </button>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200"
                onClick={() => setSortModalOpen(false)}
              >
                취소
              </button>

              <button
                className="px-3 py-1 rounded bg-gray-400 text-white"
                onClick={() => {
                  setSortKey("");
                  setSortModalOpen(false);
                }}
              >
                정렬 해제
              </button>

              <button
                className="px-3 py-1 rounded bg-blue-600 text-white"
                onClick={() => {
                  setSortKey(tempSortKey);
                  setSortDir(tempSortDir);
                  setSortModalOpen(false);
                }}
              >
                적용
              </button>
            </div>
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
  // ==========================
  // 🔥 거래처 자동완성 전체 풀 (clients + dispatchData)
  // ==========================
  const allClientPool = React.useMemo(() => {
    const map = new Map();

    // 거래처 관리
    (clients || []).forEach((c) => {
      const name =
        c.거래처명 || c.name || c.회사명 || c.상호 || c.title || "";
      if (!name) return;

      map.set(name, {
        거래처명: name,
        주소: c.주소 || "",
        담당자: c.담당자 || "",
        연락처: c.연락처 || "",
      });
    });

    // 기존 배차 데이터에서 보강
    (dispatchData || []).forEach((r) => {
      const name = r.거래처명;
      if (!name || map.has(name)) return;

      map.set(name, {
        거래처명: name,
        주소: "",
        담당자: "",
        연락처: "",
      });
    });

    return Array.from(map.values());
  }, [clients, dispatchData]);

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
  const [searchType, setSearchType] = React.useState("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [sortKey, setSortKey] = React.useState("");
  const [sortDir, setSortDir] = React.useState("asc");
  const [sortKey2, setSortKey2] = React.useState("");
  const [sortDir2, setSortDir2] = React.useState("asc");
  const [sortModalOpen, setSortModalOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());
  const [editMode, setEditMode] = React.useState(false);
  // 🔔 즉시 변경 확인 팝업 + 히스토리
  const [confirmChange, setConfirmChange] = React.useState(null);
  /*
  {
    id,
    field,
    before,
    after
  }
  */

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
  const [matchedDrivers, setMatchedDrivers] = React.useState([]);

  // 🔵 선택수정 팝업 상태 (★ 여기에 추가!)
  // ⭐ 페이지네이션 상태
  const [page, setPage] = React.useState(0);
  const pageSize = 100;
  // 🔵 거래처 자동완성 상태
  const [clientOptions, setClientOptions] = React.useState([]);
  const [showClientDropdown, setShowClientDropdown] = React.useState(false);
  // 🔵 자동완성(상/하차지) 상태  ← ★★★ 여기 추가
  const [placeQuery, setPlaceQuery] = React.useState("");
  const [placeOptions, setPlaceOptions] = React.useState([]);
  // 🔥 PART 4와 동일한 구조
  const [activePlaceField, setActivePlaceField] = React.useState(null);
  // "상차" | "하차" | null
  // 🔽 상/하차 자동완성 키보드 네비게이션용
  const [placeActiveIndex, setPlaceActiveIndex] = React.useState(0);
  const placeListRef = React.useRef(null);
  // 🔥 방향키 이동 시 드롭다운 내부 스크롤 자동 이동
  React.useEffect(() => {
    if (!placeListRef.current) return;

    const list = placeListRef.current;
    const item = list.children[placeActiveIndex];

    if (!item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    // ⬇️ 아래로 벗어나면
    if (itemBottom > viewBottom) {
      list.scrollTop = itemBottom - list.clientHeight;
    }

    // ⬆️ 위로 벗어나면
    if (itemTop < viewTop) {
      list.scrollTop = itemTop;
    }
  }, [placeActiveIndex]);

  // ==========================
  // 🔍 거래처 자동완성 유틸
  // ==========================
  const normalizeClientKey = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[()㈜.,\-]/g, "")
      .replace(/주식회사|유한회사/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  const filterClients = (q) => {
    if (!q) return [];

    const nq = normalizeClientKey(q);

    return allClientPool
      .map((c) => {
        const name = c.거래처명 || "";
        const nk = normalizeClientKey(name);
        if (!nk) return null;

        let score = 0;
        if (nk === nq) score = 100;
        else if (nk.startsWith(nq)) score = 80;
        else if (nk.includes(nq)) score = 50;

        return score > 0 ? { ...c, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  };

  // 🔵 자동완성 검색 함수 (FIX)
  const filterPlaces = (text) => {
    const q = String(text || "").trim().toLowerCase();
    if (!q) return [];

    return (places || []).filter((p) =>
      String(p.업체명 || p.name || "")
        .toLowerCase()
        .includes(q)
    );
  };
  // 🔥 입력값과 가장 유사한 항목을 위로 정렬
  // 완전일치 > 시작일치 > 포함일치
  const rankPlaces = (list, query) => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return list;

    return list
      .map((p) => {
        const name = String(p.업체명 || "").toLowerCase();

        let score = 0;
        if (name === q) score = 100;            // 완전일치 (반찬단지)
        else if (name.startsWith(q)) score = 80; // 앞글자 일치
        else if (name.includes(q)) score = 50;   // 포함

        return score > 0 ? { ...p, __score: score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.__score - a.__score);
  };



  // ==========================
  // 📦 운임 조회 모달 상태 추가
  // ==========================
  const [fareModalOpen, setFareModalOpen] = React.useState(false);
  const [fareResult, setFareResult] = React.useState(null);
  const [fareSourceData, setFareSourceData] = React.useState([]);
  // 🔥 운임조회용 원본 데이터 (날짜 필터 무시)
  React.useEffect(() => {
    setFareSourceData(dispatchData);
  }, [dispatchData]);
  // ===================== 📋 기사복사 모달 상태 =====================
  const [copyModalOpen, setCopyModalOpen] = React.useState(false);
  // 🚚 기사 선택 / 확인 팝업 상태 추가  ⭐⭐
  const [driverConfirmInfo, setDriverConfirmInfo] = React.useState(null);
  const [driverSelectInfo, setDriverSelectInfo] = React.useState(null);
    React.useEffect(() => {
    if (!fareModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setFareModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fareModalOpen]);
  /*
  {
    rowId,
    plate,
    list: [],
    selectedDriver: null
  }
  */

  // 요일 계산
  const getYoil = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][date.getDay()];
  };
// 📦 화물내용에서 파렛트 수 추출 (운임조회용) ✅ 최종본
const getPalletCount = (text = "") => {
  const m = String(text).match(/(\d+)\s*(파렛트|파렛|파|p|P)/);
  return m ? Number(m[1]) : null;
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
  // =======================
  // 📞 담당자 라인 생성 (기사복사용)
  // =======================
  const buildContactLine = (name, phone) => {
    if (!name && !phone) return "";

    const cleanName = String(name || "").trim();
    const cleanPhone = String(phone || "").trim();

    if (cleanPhone) {
      return `담당자 : ${cleanName} (${formatPhone(cleanPhone)})`;
    }

    return `담당자 : ${cleanName}`;
  };
  // ===============================
  // 📋 기사복사 (PART 5 최종)
  // ===============================
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

        // =====================
        // 기본 / 운임 모드
        // =====================
        if (mode === "basic") {
          return `${plate} ${name} ${phone}`;
        }

        if (mode === "fare") {
          return `${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
        }
        // =====================
        // 🚚 기사 전달용 (DRIVER)
        // =====================
        if (mode === "driver") {

          // ❄️ 냉장/냉동 차량 안내 (끝에 줄바꿈 ❌)
          const COLD_NOTICE = `★★★필독★★★ 냉장(0~10도 유지), 냉동(-18도 이하)

인수증 및 거래명세서, 타코메타 기록지까지 꼭!! 한 장씩 찍어서 보내주세요. 인수증은 증명서입니다. 
반드시 사진 촬영 후 문자 전송 부탁드립니다. 
미공유 시 운임 지급이 지연될 수 있습니다.

만약 서류가 없으면 상/하차 사진이라도 꼭 전송 부탁드립니다.
상/하차지 이슈 발생 시 반드시 사전 연락 바랍니다.
(사진 전송 후 전화는 안 주셔도 됩니다)`;

          // 🚚 일반 차량용
          const NORMAL_NOTICE = `★★★필독★★★ 미공유 시 운임 지급이 지연될 수 있습니다.

인수증(파렛전표) 또는 거래명세서는 반드시 서명 후 문자 전송 바랍니다. 하차지에 전달하는 경우 사진 먼저 촬영 후 업체에 전달해 주시면 됩니다.

인수증이 없는 경우 문자로 내용만 전달주세요.
상·하차 이슈 발생 시 반드시 사전 연락 바랍니다. 감사합니다.`;

          const vehicleType = String(r.차량종류 || "").trim();

          const isColdVehicle =
            vehicleType.includes("냉장") || vehicleType.includes("냉동");

          const DRIVER_NOTICE =
            vehicleType === ""
              ? ""
              : isColdVehicle
                ? COLD_NOTICE
                : NORMAL_NOTICE;

          const yoil = getYoil(r.상차일 || "");
          const dateText = `${r.상차일 || ""} ${yoil}`;
          // ==========================
          // 🔥 익일 / 지정 하차 판별 (FULL MODE와 동일)
          // ==========================
          let dateNotice = "";
          let dropTimeText = r.하차시간 || "즉시";

          if (r.상차일 && r.하차일) {
            const s = new Date(r.상차일);
            const e = new Date(r.하차일);

            const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
            const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

            const diffDays = Math.round(
              (e0 - s0) / (1000 * 60 * 60 * 24)
            );

            const sm = s.getMonth() + 1;
            const sd = s.getDate();
            const em = e.getMonth() + 1;
            const ed = e.getDate();

            if (diffDays === 1) {
              dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
              dropTimeText = `${em}/${ed} ${dropTimeText}`;
            } else if (diffDays >= 2) {
              dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
              dropTimeText = `${em}/${ed} ${dropTimeText}`;
            }
          }
          const driverNote =
            edited[id]?.전달사항 ??
            r.전달사항 ??
            "";

          const driverNoteText = driverNote.trim()
            ? `\n\n📢 전달사항\n${driverNote.trim()}`
            : "";

          return `${DRIVER_NOTICE}

${dateNotice}${dateText}

상차지 : ${r.상차지명 || "-"}
${r.상차지주소 || "-"}${(() => {
              const line = buildContactLine(
                r.상차지담당자,
                r.상차지담당자번호
              );
              return line ? `\n${line}` : "";
            })()
            }
상차시간 : ${r.상차시간 || "즉시"}

하차지 : ${r.하차지명 || "-"}
${r.하차지주소 || "-"}${(() => {
              const line = buildContactLine(
                r.하차지담당자,
                r.하차지담당자번호
              );
              return line ? `\n${line}` : "";
            })()
            }
하차시간 : ${dropTimeText}

중량 : ${r.차량톤수 || "-"}${r.화물내용 ? ` / ${r.화물내용}` : ""}
차량 : ${r.차량종류 || "-"}

${driverNoteText}`;
        }

        // =====================
        // 전체 상세 (기사복사)
        // =====================
        const pickupTime = r.상차시간?.trim() || "즉시";
        const dropTimeRaw = r.하차시간?.trim() || "즉시";

        let dateNotice = "";
        let dropTimeText = dropTimeRaw;

        if (r.상차일 && r.하차일) {
          const s = new Date(r.상차일);
          const e = new Date(r.하차일);

          const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
          const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

          const diffDays = Math.round(
            (e0 - s0) / (1000 * 60 * 60 * 24)
          );

          const sm = s.getMonth() + 1;
          const sd = s.getDate();
          const em = e.getMonth() + 1;
          const ed = e.getDate();

          if (diffDays === 1) {
            dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
            dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
          } else if (diffDays >= 2) {
            dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
            dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
          }
        }

        return `${dateNotice}${r.상차일 || ""} ${yoil}

상차지 : ${r.상차지명 || "-"}
${r.상차지주소 || "-"}${r.상차지담당자 || r.상차지담당자번호
            ? `\n담당자 : ${r.상차지담당자 || ""}${r.상차지담당자번호
              ? ` (${formatPhone(r.상차지담당자번호)})`
              : ""
            }`
            : ""
          }
상차시간 : ${pickupTime}

하차지 : ${r.하차지명 || "-"}
${r.하차지주소 || "-"}${r.하차지담당자 || r.하차지담당자번호
            ? `\n담당자 : ${r.하차지담당자 || ""}${r.하차지담당자번호
              ? ` (${formatPhone(r.하차지담당자번호)})`
              : ""
            }`
            : ""
          }
하차시간 : ${dropTimeText}

중량 : ${r.차량톤수 || "-"}${r.화물내용 ? ` / ${r.화물내용}` : ""
          } ${r.차량종류 || ""}

${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(text);
    setCopyModalOpen(false);

    // 🔔 기사복사 후 전달상태 변경 팝업
    const rowId = [...selected][0];
    const row = dispatchData.find((d) => getId(d) === rowId);

    setConfirmChange({
      id: rowId,
      field: "업체전달상태",
      before: row?.업체전달상태 || "미전달",
      after: "전달완료",
      reason: "copy",
    });
  };


  // 🚀 운임 조회 실행 함수
  const handleFareSearch = () => {
    if (!editTarget) return;

    const pickup = String(editTarget.상차지명 || "");
    const drop = String(editTarget.하차지명 || "");
    const cargo = String(editTarget.화물내용 || "");
    const ton = String(editTarget.차량톤수 || "");

    // 1️⃣ 필터: 상/하차지만
    const base = fareSourceData.filter((r) =>
      String(r.상차지명 || "").includes(pickup) &&
      String(r.하차지명 || "").includes(drop)
    );

    if (!base.length) {
      alert("📭 유사 운임 데이터가 없습니다.");
      return;
    }

    // 2️⃣ 매칭 정보 + 정렬 점수
    const records = base
      .map((r) => {
const basePallet = getPalletCount(editTarget.화물내용);
const recPallet  = getPalletCount(r.화물내용);
const cargoMatch =
  editTarget.화물내용 &&
  r.화물내용 &&
  r.화물내용.includes(editTarget.화물내용);

const tonMatch =
  String(editTarget.차량톤수 || "") === String(r.차량톤수 || "");

const palletDiff =
  basePallet != null && recPallet != null
    ? Math.abs(basePallet - recPallet)
    : null;

let priority = 0;

// 🔥 PART 4와 동일한 우선순위
if (cargoMatch && tonMatch) priority = 4;
else if (cargoMatch) priority = 3;
else if (tonMatch) priority = 2;
else if (palletDiff !== null) priority = 1;
        return {
          ...r,
          _match: { cargo: cargoMatch, ton: tonMatch },
          _priority: priority,
          _date: r.상차일 || "",
        };
      })
.sort((a, b) => {
  if (b._priority !== a._priority) {
    return b._priority - a._priority;   // 유사도 우선
  }
  // ✅ 최신 → 과거
  return String(b._date).localeCompare(String(a._date));
});


    const vals = records.map((r) => Number(r.청구운임 || 0));
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    setFareResult({ count: records.length, avg, min, max, records });
    setFareModalOpen(true);
  };

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
    운행유형: "편도",
    혼적: false,
    독차: false,
  });

  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const getId = (r) => r._id || r.id || r._fsid;
  // 🕘 변경 이력 1건 생성
  const makeHistory = ({ field, before, after }) => ({
    field,
    before: before ?? "",
    after: after ?? "",
    at: new Date().toISOString(),
    user: "관리자", // 🔥 나중에 로그인 사용자로 교체 가능
  });
  // ⚡ select 즉시 변경 → 확인 팝업용
  const handleImmediateSelectChange = (row, field, nextValue) => {
    const id = getId(row);
    const before = row[field] ?? "";

    if (before === nextValue) return;

    setConfirmChange({
      id,
      field,
      before,
      after: nextValue,
    });
  };
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

  // ======================= 차량번호 입력 처리 (최종 안정판) =======================
  const handleCarInput = async (id, rawVal) => {
    const v = (rawVal || "").trim();

    // 현재 row 찾기
    const idx = dispatchData.findIndex((r) => getId(r) === id);
    if (idx === -1) return;
    const row = dispatchData[idx];

    // =====================================================
    // 1️⃣ 차량번호를 "완전히 삭제"했을 때
    // =====================================================
    if (!v) {
      // 🔥 팝업 전부 강제 종료
      setDriverConfirmInfo(null);
      setDriverSelectInfo(null);

      // 🔥 기사 정보 완전 초기화
      await patchDispatch(id, {
        차량번호: "",
        이름: "",
        전화번호: "",
        배차상태: "배차중",
        긴급: row.긴급 === true, // 긴급 플래그 유지
        lastUpdated: new Date().toISOString(),

      });

      return;
    }

    // 공백 제거한 차량번호 (비교용)
    const clean = v.replace(/\s+/g, "");

    // =====================================================
    // 2️⃣ 동일 차량번호 기사 검색
    // =====================================================
    const matches = drivers.filter(
      (d) =>
        String(d.차량번호 || "")
          .replace(/\s+/g, "") === clean
    );

    // =====================================================
    // 3️⃣ 기사 여러 명 → 기사 선택 팝업
    // =====================================================
    if (matches.length > 1) {
      setDriverSelectInfo({
        rowId: id,
        plate: v,
        list: matches,
        selectedDriver: null,
      });
      return;
    }

    // =====================================================
    // 4️⃣ 기사 1명 → 기사 확인 팝업
    // =====================================================
    if (matches.length === 1) {
      setDriverConfirmInfo({
        type: "select",
        rowId: id,
        driver: matches[0],
      });
      return;
    }

    // =====================================================
    // 5️⃣ 기사 없음 → 신규 기사 등록 유도 팝업
    // =====================================================
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
    const n = Number(String(v).replace(/[^\d-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  };
  const downloadExcel = () => {
    const headers = [
      "순번", "등록일", "상차일", "상차시간", "하차일", "하차시간",
      "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소",
      "화물내용", "차량종류", "차량톤수", "차량번호", "기사명", "전화번호",
      "배차상태", "청구운임", "기사운임", "수수료", "지급방식", "배차방식", "메모"
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
      // ------------------------------------
      if (["S", "T", "U"].includes(col)) {

        if (row === 1) return;

        const num = Number(String(ws[cell].v).replace(/[^\d-]/g, ""));
        ws[cell].v = isNaN(num) ? 0 : num;
        ws[cell].t = "n";

        // 🔥 여기 추가/교체
        ws[cell].z = "#,##0;[Red]-#,##0";
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
  // =====================
  // 🔑 거래처명 정규화 (정렬용)
  // =====================
  const normalizeClient = (s = "") =>
    String(s)
      .normalize("NFC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/주식회사|유한회사|\(주\)|㈜/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[0-9]/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  // =====================
  // 🔽 정렬 비교 함수 (최종 확정본)
  // =====================
  const compareBy = (key, dir = "asc") => (a, b) => {

    // ✅ 기본 정렬 (정렬 해제 상태)
    if (!key) {
      // 1️⃣ 배차중 최우선
      if (a.배차상태 === "배차중" && b.배차상태 !== "배차중") return -1;
      if (a.배차상태 !== "배차중" && b.배차상태 === "배차중") return 1;

      // 2️⃣ 상차일 내림차순 (미래 → 과거)
      const d1 = a.상차일 || "";
      const d2 = b.상차일 || "";
      if (d1 !== d2) return d2.localeCompare(d1);

      // 3️⃣ 상차시간 내림차순 (늦은 시간 → 이른 시간)
      const t1 = a.상차시간 || "";
      const t2 = b.상차시간 || "";
      return t2.localeCompare(t1);
    }

    // ✅ 사용자 선택 정렬
    let av = a[key];
    let bv = b[key];

    if (key === "거래처명") {
      av = normalizeClient(av);
      bv = normalizeClient(bv);
    }

    return dir === "asc"
      ? String(av ?? "").localeCompare(String(bv ?? ""), "ko")
      : String(bv ?? "").localeCompare(String(av ?? ""), "ko");
  };


  // ===================== 필터 + 정렬 (최종 단일본) =====================
  const filtered = React.useMemo(() => {
    let data = [...dispatchData];

    // 📅 날짜 필터
    if (startDate) data = data.filter(r => (r.상차일 || "") >= startDate);
    if (endDate) data = data.filter(r => (r.상차일 || "") <= endDate);

    // 🔍 검색 필터
    if (q.trim()) {
      const keyword = q.toLowerCase();

      data = data.filter((r) => {
        const get = (v) => String(v || "").toLowerCase();

        switch (searchType) {
          case "client":
            return get(r.거래처명).includes(keyword);
          case "pickup":
            return get(r.상차지명).includes(keyword);
          case "drop":
            return get(r.하차지명).includes(keyword);
          case "pay":
            return get(r.지급방식).includes(keyword);
          case "dispatch":
            return get(r.배차방식).includes(keyword);
          case "car":
            return get(r.차량번호).includes(keyword);
          case "driver":
            return get(r.이름).includes(keyword);
          case "all":
          default:
            return (
              get(r.거래처명).includes(keyword) ||
              get(r.상차지명).includes(keyword) ||
              get(r.하차지명).includes(keyword) ||
              get(r.차량번호).includes(keyword) ||
              get(r.이름).includes(keyword) ||
              get(r.지급방식).includes(keyword) ||
              get(r.배차방식).includes(keyword)
            );
        }
      });
    }

    // 🔽 정렬
    data.sort(compareBy(sortKey, sortDir));

    return data;
  }, [
    dispatchData,
    q,
    searchType,
    startDate,
    endDate,
    sortKey,
    sortDir,
  ]);
  // ⭐⭐⭐ 페이지 데이터 (정렬된 filtered 기준)
  const pageRows = React.useMemo(() => {
    const start = page * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  }, [filtered, page]);

  const statusSummary = React.useMemo(() => {
    let 미배차 = 0;
    let 완료 = 0;
    let 미전달 = 0;

    filtered.forEach(r => {
      if (r.배차상태 === "배차중") 미배차++;
      if (r.배차상태 === "배차완료") 완료++;

      if ((r.업체전달상태 || "미전달") !== "전달완료") {
        미전달++;
      }
    });

    return {
      전체: filtered.length,
      미배차,
      완료,
      미전달,
    };
  }, [filtered]);


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
      {/* 🔵 상태 요약 칩 (PART 5 추가) */}
      <div className="flex items-center gap-1 text-[11px] font-semibold mb-2">

        <span className="px-2 py-1 rounded-full bg-slate-800 text-white">
          전체 {statusSummary.전체}
        </span>

        <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300">
          미배차 {statusSummary.미배차}
        </span>

        <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-300">
          완료 {statusSummary.완료}
        </span>

        <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-300">
          미전달 {statusSummary.미전달}
        </span>

      </div>
      <div className="flex flex-wrap items-center gap-5 text-sm mb-2">
        <div>총 <b>{summary.totalCount}</b>건</div>
        <div>청구 <b className="text-blue-600">{summary.totalSale.toLocaleString()}</b>원</div>
        <div>기사 <b className="text-green-600">{summary.totalDriver.toLocaleString()}</b>원</div>
        <div>수수료 <b className="text-amber-600">{summary.totalFee.toLocaleString()}</b>원</div>
      </div>

      <div className="flex justify-between items-center gap-3 mb-3">

        <div className="flex items-center gap-2">
          {/* 🔍 검색 필터 */}
          <select
            className="border p-2 rounded text-sm"
            value={searchType}
            onChange={(e) => {
              setSearchType(e.target.value);
              setQ("");      // 필터 변경 시 검색어 초기화 (권장)
              setPage(0);
            }}
          >
            <option value="all">통합검색</option>
            <option value="client">거래처명</option>
            <option value="pickup">상차지명</option>
            <option value="drop">하차지명</option>
            <option value="pay">지급방식</option>
            <option value="dispatch">배차방식</option>
            <option value="car">차량번호</option>
            <option value="driver">기사명</option>
          </select>

          {/* 🔍 검색어 */}
          <input
            className="border p-2 rounded w-52"
            placeholder="검색어"
            value={loaded ? q : ""}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
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
          <button
            onClick={() => setSortModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white shadow-md hover:bg-slate-700"
          >
            정렬
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
          <thead className="bg-slate-100 text-slate-800">
            <tr>
              {[
                "선택", "순번", "등록일", "상차일", "상차시간", "하차일", "하차시간",
                "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소",
                "화물내용", "차량종류", "차량톤수", "혼적", "차량번호", "기사명", "전화번호",
                "배차상태", "청구운임", "기사운임", "수수료", "지급방식", "배차방식", "메모", "전달상태",

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
                "상차일", "상차시간", "하차일", "하차시간",
                "거래처명", "상차지명", "상차지주소",
                "하차지명", "하차지주소", "화물내용", "차량종류",
                "차량톤수", "지급방식", "배차방식", "메모", "청구운임", "기사운임",
              ];

              return (
                <tr
                  key={id}
                  id={`row-${id}`}
                  className={`
    ${r.긴급 === true && row.배차상태 === "배차중"
                      ? "bg-red-50 border-l-4 border-red-400"
                      : i % 2 === 0
                        ? "bg-white"
                        : "bg-gray-50"
                    }

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
                    "상차일", "상차시간", "하차일", "하차시간",
                    "거래처명", "상차지명", "상차지주소",
                    "하차지명", "하차지주소",
                    "화물내용", "차량종류", "차량톤수",
                  ].map((key) => (
                    <td key={`${id}-${key}`} className="border text-center whitespace-nowrap">

                      {/* ✅ 차량종류 즉시변경 드롭다운 */}
                      {key === "차량종류" ? (
                        <select
                          className="border rounded px-1 py-0.5 w-full text-center"
                          value={row.차량종류 || ""}
                          onChange={(e) =>
                            handleImmediateSelectChange(row, "차량종류", e.target.value)
                          }
                        >
                          <option value="">선택없음</option>
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

                      ) : key === "상차지주소" || key === "하차지주소" ? (
                        <AddressCell text={row[key] || ""} max={5} />

                      ) : editMode && selected.has(id) && editableKeys.includes(key) ? (
                        <div className="relative w-full">
                          <input
                            className="border rounded px-1 py-0.5 w-full text-center"
                            defaultValue={row[key] || ""}
                            onChange={(e) => {
                              updateEdited(row, key, e.target.value);
                            }}
                          />
                        </div>

                      ) : key === "상차지명" ? (
                        <div className="inline-flex items-center gap-1">
                          <span>{row.상차지명}</span>

                          {/* 왕복 */}
                          {row.운행유형 === "왕복" && (
                            <span
                              className="
          px-1.5 py-0.5
          text-[10px] font-bold
          rounded-full
          bg-indigo-100 text-indigo-700
          border border-indigo-300
          whitespace-nowrap
        "
                            >
                              왕복
                            </span>
                          )}

                          {/* 경유 (상차 기준) */}
                          {Array.isArray(row.경유지_상차) && row.경유지_상차.length > 0 && (
                            <span
                              className="
          px-1.5 py-0.5
          text-[10px] font-bold
          rounded-full
          bg-emerald-100 text-emerald-700
          border border-emerald-300
          whitespace-nowrap
        "
                            >
                              경유 {row.경유지_상차.length}
                            </span>
                          )}
                        </div>
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
                      value={row.차량번호 || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        // 화면 값만 변경 (저장은 아직 X)
                        setEdited(prev => ({
                          ...prev,
                          [id]: {
                            ...(prev[id] || {}),
                            차량번호: v,
                          }
                        }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleCarInput(id, row.차량번호);
                        }
                      }}
                      onBlur={() => {
                        handleCarInput(id, row.차량번호);
                      }}
                    />
                  </td>
                  <td className="border text-center">{row.이름}</td>
                  <td className="border text-center">{row.전화번호}</td>

                  <td className="border text-center">
                    <div className="flex items-center justify-center gap-1">
                      <StatusBadge s={row.배차상태} />

                      {/* 🚨 긴급 (PART 4와 동일한 스타일 + 느린 깜빡임) */}
                      {row.긴급 && row.배차상태 === "배차중" && (
                        <span
                          className="
          px-2 py-0.5 rounded-full
          text-[10px] font-bold
          bg-red-600 text-white
          animate-pulse
        "
                          style={{ animationDuration: "2.5s" }}
                        >
                          긴급
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 금액 */}
                  {["청구운임", "기사운임"].map((key) => (
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
                    <select
                      className="border rounded px-1 py-0.5 w-full text-center"
                      value={row.지급방식 || ""}
                      onChange={(e) =>
                        handleImmediateSelectChange(row, "지급방식", e.target.value)
                      }
                    >
                      <option value="">선택없음</option>
                      <option value="계산서">계산서</option>
                      <option value="착불">착불</option>
                      <option value="선불">선불</option>
                      <option value="손실">손실</option>
                      <option value="개인">개인</option>
                      <option value="기타">기타</option>
                    </select>
                  </td>


                  <td className="border text-center">
                    <select
                      className="border rounded px-1 py-0.5 w-full text-center"
                      value={row.배차방식 || ""}
                      onChange={(e) =>
                        handleImmediateSelectChange(row, "배차방식", e.target.value)
                      }
                    >
                      <option value="">선택없음</option>
                      <option value="24시">24시</option>
                      <option value="직접배차">직접배차</option>
                      <option value="인성">인성</option>
                      <option value="24시(외주업체)">24시(외주업체)</option>
                    </select>
                  </td>

                  <td className="border px-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">

                      {/* ⭐ 중요도 뱃지 (항상 먼저, 고정) */}
                      {(() => {
                        const level = row.메모중요도;

                        if (level === "CRITICAL") {
                          return (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white animate-pulse">
                              긴급
                            </span>
                          );
                        }

                        if (level === "HIGH") {
                          return (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-orange-500 text-white">
                              중요
                            </span>
                          );
                        }
                        return null;
                      })()}

                      {/* 메모 */}
                      <MemoCell text={row.메모 || ""} />
                    </div>
                  </td>

                  {/* 전달상태 (버튼) */}
                  <td className="border text-center whitespace-nowrap">
                    {(() => {
                      const today = todayKST();
                      const d =
                        row?.상차일자 ||
                        row?.상차일 ||
                        row?.상차 ||
                        "";

                      const deliveryStatus =
                        row.업체전달상태
                          ? row.업체전달상태
                          : d && d < today
                            ? "전달완료"
                            : "미전달";

                      return (
                        <button
                          className={`px-2 py-0.5 text-xs font-semibold rounded border
          ${deliveryStatus === "전달완료"
                              ? "bg-green-100 text-green-700 border-green-400"
                              : "bg-yellow-100 text-yellow-700 border-yellow-400"
                            }`}
                          onClick={() => {
                            const next =
                              deliveryStatus === "전달완료" ? "미전달" : "전달완료";

                            setConfirmChange({
                              id,
                              field: "업체전달상태",
                              before: deliveryStatus,
                              after: next,
                            });
                          }}
                        >
                          {deliveryStatus}
                        </button>
                      );
                    })()}
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
            {/* ================= 선택한 오더 수정 타이틀 ================= */}
            <h3 className="text-lg font-bold mb-3">
              선택한 오더 수정
            </h3>

            {/* ================= 상태 버튼 그룹 ================= */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">

              {/* 🚨 긴급 */}
              <button
                type="button"
                onClick={() =>
                  setEditTarget((p) => ({
                    ...p,
                    긴급: !p.긴급,
                  }))
                }
                className={`
      px-3 py-1.5 rounded-full text-xs font-semibold border
      ${editTarget.긴급
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-red-50 text-red-600 border-red-300 hover:bg-red-100"}
    `}
              >
                🚨 긴급
              </button>

              {/* 🔁 왕복 */}
              <button
                type="button"
                onClick={() =>
                  setEditTarget((p) => ({
                    ...p,
                    운행유형: p.운행유형 === "왕복" ? "편도" : "왕복",
                  }))
                }
                className={`
      px-3 py-1.5 rounded-full text-xs font-semibold border
      ${editTarget.운행유형 === "왕복"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"}
    `}
              >
                🔁 왕복
              </button>

              {/* 📦 혼적 */}
              <button
                type="button"
                onClick={() =>
                  setEditTarget((p) => ({
                    ...p,
                    혼적: !p.혼적,
                    독차: p.혼적 ? p.독차 : false, // 혼적 ON → 독차 OFF
                  }))
                }
                className={`
      px-3 py-1.5 rounded-full text-xs font-semibold border
      ${editTarget.혼적
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"}
    `}
              >
                📦 혼적
              </button>

            </div>
            {/* ================= 업체 전달 상태 ================= */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">
                업체 전달 상태
              </label>

              {(() => {
                const today = todayKST();

                const d =
                  editTarget?.상차일 ||
                  "";

                const deliveryStatus =
                  editTarget.업체전달상태
                    ? editTarget.업체전달상태
                    : d && d < today
                      ? "전달완료"
                      : "미전달";

                return (
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-semibold rounded border
          ${deliveryStatus === "전달완료"
                        ? "bg-green-100 text-green-700 border-green-400"
                        : "bg-yellow-100 text-yellow-700 border-yellow-400"
                      }`}
                    onClick={() => {
                      const next =
                        deliveryStatus === "전달완료"
                          ? "미전달"
                          : "전달완료";

                      setConfirmChange({
                        id: getId(editTarget),          // ⭐ 중요
                        field: "업체전달상태",
                        before: deliveryStatus,
                        after: next,
                      });
                    }}
                  >
                    {deliveryStatus}
                  </button>
                );
              })()}
            </div>


            {/* ------------------------------------------------ */}
            {/* 🔵 거래처명 */}
            {/* ------------------------------------------------ */}
            <div className="mb-3 relative">
              <label>거래처명</label>
              <input
                className="border p-2 rounded w-full"
                value={editTarget.거래처명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({ ...p, 거래처명: v }));
                  setClientOptions(filterClients(v));
                  setShowClientDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              />

              {showClientDropdown && clientOptions.length > 0 && (
                <div className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {clientOptions.map((c, i) => (
                    <div
                      key={i}
                      className="px-3 py-1 cursor-pointer hover:bg-gray-100"
                      onMouseDown={() => {
                        setEditTarget((p) => ({ ...p, 거래처명: c.거래처명 }));
                        setShowClientDropdown(false);
                      }}
                    >
                      {c.거래처명}
                    </div>
                  ))}
                </div>
              )}
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
                    "오전 6:00", "오전 6:30",
                    "오전 7:00", "오전 7:30",
                    "오전 8:00", "오전 8:30",
                    "오전 9:00", "오전 9:30",
                    "오전 10:00", "오전 10:30",
                    "오전 11:00", "오전 11:30",
                    "오후 12:00", "오후 12:30",
                    "오후 1:00", "오후 1:30",
                    "오후 2:00", "오후 2:30",
                    "오후 3:00", "오후 3:30",
                    "오후 4:00", "오후 4:30",
                    "오후 5:00", "오후 5:30",
                    "오후 6:00", "오후 6:30",
                    "오후 7:00", "오후 7:30",
                    "오후 8:00", "오후 8:30",
                    "오후 9:00", "오후 9:30",
                    "오후 10:00", "오후 10:30",
                    "오후 11:00", "오후 11:30"
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
                    "오전 6:00", "오전 6:30",
                    "오전 7:00", "오전 7:30",
                    "오전 8:00", "오전 8:30",
                    "오전 9:00", "오전 9:30",
                    "오전 10:00", "오전 10:30",
                    "오전 11:00", "오전 11:30",
                    "오후 12:00", "오후 12:30",
                    "오후 1:00", "오후 1:30",
                    "오후 2:00", "오후 2:30",
                    "오후 3:00", "오후 3:30",
                    "오후 4:00", "오후 4:30",
                    "오후 5:00", "오후 5:30",
                    "오후 6:00", "오후 6:30",
                    "오후 7:00", "오후 7:30",
                    "오후 8:00", "오후 8:30",
                    "오후 9:00", "오후 9:30",
                    "오후 10:00", "오후 10:30",
                    "오후 11:00", "오후 11:30"
                  ].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ------------------------------------------------ */}
            {/* 🔵 상하차지 (자동완성 동일 UX) */}
            {/* ------------------------------------------------ */}

            {/* ================= 상차지명 ================= */}
            <div className="mb-3 relative">
              <label>상차지명</label>
              <input
                className="border p-2 rounded w-full"
                value={editTarget.상차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({ ...p, 상차지명: v }));

                  const ranked = rankPlaces(filterPlaces(v), v);
                  setPlaceOptions(ranked);
                  setPlaceActiveIndex(0);
                  setActivePlaceField("상차");
                }}
                onFocus={(e) => {
                  const v = e.target.value;
                  const ranked = rankPlaces(filterPlaces(v), v);
                  setPlaceOptions(ranked);
                  setPlaceActiveIndex(0);
                  setActivePlaceField("상차");
                }}
                onKeyDown={(e) => {
                  if (!placeOptions.length) return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) =>
                      Math.min(i + 1, placeOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = placeOptions[placeActiveIndex];
                    if (!p) return;

                    setEditTarget((prev) => ({
                      ...prev,
                      상차지명: p.업체명,
                      상차지주소: p.주소 || "",
                    }));
                    setActivePlaceField(null);
                  }
                }}
                onBlur={() => setTimeout(() => setActivePlaceField(null), 200)}
              />

              {activePlaceField === "상차" && placeOptions.length > 0 && (
                <div
                  ref={placeListRef}
                  className="absolute left-0 top-full z-50 bg-white border rounded shadow-lg w-full max-h-40 overflow-y-auto"
                >
                  {placeOptions.slice(0, 12).map((p, idx) => (
                    <div
                      key={idx}
                      className={
                        "px-3 py-1 cursor-pointer " +
                        (idx === placeActiveIndex ? "bg-blue-100" : "hover:bg-gray-100")
                      }
                      onMouseDown={() => {
                        setEditTarget((prev) => ({
                          ...prev,
                          상차지명: p.업체명,
                          상차지주소: p.주소 || "",
                        }));
                        setActivePlaceField(null);
                      }}
                    >
                      <div className="font-medium">{p.업체명}</div>
                      <div className="text-xs text-gray-500">{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ================= 상차지주소 ================= */}
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

            {/* ================= 하차지명 ================= */}
            <div className="mb-3 relative">
              <label>하차지명</label>
              <input
                className="border p-2 rounded w-full"
                value={editTarget.하차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({ ...p, 하차지명: v }));

                  const ranked = rankPlaces(filterPlaces(v), v);
                  setPlaceOptions(ranked);
                  setPlaceActiveIndex(0);
                  setActivePlaceField("하차");
                }}
                onFocus={(e) => {
                  const v = e.target.value;
                  const ranked = rankPlaces(filterPlaces(v), v);
                  setPlaceOptions(ranked);
                  setPlaceActiveIndex(0);
                  setActivePlaceField("하차");
                }}
                onKeyDown={(e) => {
                  if (!placeOptions.length) return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) =>
                      Math.min(i + 1, placeOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = placeOptions[placeActiveIndex];
                    if (!p) return;

                    setEditTarget((prev) => ({
                      ...prev,
                      하차지명: p.업체명,
                      하차지주소: p.주소 || "",
                    }));
                    setActivePlaceField(null);
                  }
                }}
                onBlur={() => setTimeout(() => setActivePlaceField(null), 200)}
              />

              {activePlaceField === "하차" && placeOptions.length > 0 && (
                <div
                  ref={placeListRef}
                  className="absolute left-0 top-full z-50 bg-white border rounded shadow-lg w-full max-h-40 overflow-y-auto"
                >
                  {placeOptions.slice(0, 12).map((p, idx) => (
                    <div
                      key={idx}
                      className={
                        "px-3 py-1 cursor-pointer " +
                        (idx === placeActiveIndex ? "bg-blue-100" : "hover:bg-gray-100")
                      }
                      onMouseDown={() => {
                        setEditTarget((prev) => ({
                          ...prev,
                          하차지명: p.업체명,
                          하차지주소: p.주소 || "",
                        }));
                        setActivePlaceField(null);
                      }}
                    >
                      <div className="font-medium">{p.업체명}</div>
                      <div className="text-xs text-gray-500">{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ================= 하차지주소 ================= */}
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
                  const v = e.target.value;

                  setEditTarget((p) => ({
                    ...p,
                    차량번호: v,

                    // 🔥 차량번호를 전부 지우면 기사정보 즉시 초기화
                    ...(v.trim() === "" && {
                      이름: "",
                      전화번호: "",
                      배차상태: "배차중",
                    }),
                  }));
                }}
                onKeyDown={(e) => {
  if (e.key !== "Enter") return;

  const raw = e.target.value.trim();
  if (!raw) return;

  const clean = raw.replace(/\s+/g, "");

  // 🔍 동일 차량번호 기사 전부 찾기
  const matches = drivers.filter(
    (d) => String(d.차량번호).replace(/\s+/g, "") === clean
  );

  // ✅ 1명만 있으면 바로 자동 매칭
  if (matches.length === 1) {
    const d = matches[0];
    setMatchedDrivers([]);
    setEditTarget((p) => ({
      ...p,
      이름: d.이름,
      전화번호: d.전화번호,
      배차상태: "배차완료",
    }));
    return;
  }

  // 🔽 2명 이상이면 → 드롭다운 선택
  if (matches.length > 1) {
    setMatchedDrivers(matches);
    return;
  }

  // ❌ 아무도 없으면 신규 등록
  const ok = window.confirm(
    `[${raw}] 등록된 기사가 없습니다.\n신규 기사로 추가할까요?`
  );
  if (!ok) return;

  const 이름 = prompt("기사명 입력:");
  const 전화번호 = prompt("전화번호 입력:");
  if (!이름 || !전화번호) return;

  upsertDriver({ 차량번호: raw, 이름, 전화번호 });

  setMatchedDrivers([]);
  setEditTarget((p) => ({
    ...p,
    이름,
    전화번호,
    배차상태: "배차완료",
  }));
}}

              />
{matchedDrivers.length > 1 && (
  <div className="mt-2 border rounded bg-white shadow">
    <div className="text-xs px-2 py-1 text-gray-500 border-b">
      동일 차량번호 기사 선택
    </div>

    {matchedDrivers.map((d, i) => (
      <button
        key={i}
        type="button"
        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
        onClick={() => {
          setEditTarget((p) => ({
            ...p,
            이름: d.이름,
            전화번호: d.전화번호,
            배차상태: "배차완료",
          }));
          setMatchedDrivers([]);
        }}
      >
        <div className="font-medium">{d.이름}</div>
        <div className="text-xs text-gray-500">{d.전화번호}</div>
      </button>
    ))}
  </div>
)}
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
            {/* 🔵 메모 + 메모 중요도 */}
            {/* ------------------------------------------------ */}
            <div className="mb-3">
              {/* 라벨 + 중요도 버튼 */}
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold">메모</label>

                <div className="flex items-center gap-1">
                  {/* 일반 */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditTarget((p) => ({ ...p, 메모중요도: "일반" }));

                      setEdited((prev) => ({
                        ...prev,
                        [getId(editTarget)]: {
                          ...(prev[getId(editTarget)] || {}),
                          메모중요도: "일반",
                        },
                      }));
                    }}
                    className={`
          px-2 py-0.5 rounded-full text-[11px] font-semibold border
          ${editTarget.메모중요도 === "일반"
                        ? "bg-gray-700 text-white border-gray-700"
                        : "bg-gray-100 text-gray-600 border-gray-300"
                      }
        `}
                  >
                    일반
                  </button>

                  {/* 중요 */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditTarget((p) => ({ ...p, 메모중요도: "HIGH" }));

                      setEdited((prev) => ({
                        ...prev,
                        [getId(editTarget)]: {
                          ...(prev[getId(editTarget)] || {}),
                          메모중요도: "HIGH",
                        },
                      }));
                    }}
                    className={`
    px-2 py-0.5 rounded-full text-[11px] font-semibold border
    ${editTarget.메모중요도 === "HIGH"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-orange-100 text-orange-700 border-orange-300"
                      }
  `}
                  >
                    중요
                  </button>

                  {/* 긴급 */}
                  <button
                    type="button"
                    onClick={() => {
                      // ✅ ENUM으로만 저장
                      setEditTarget((p) => ({ ...p, 메모중요도: "CRITICAL" }));

                      setEdited((prev) => ({
                        ...prev,
                        [getId(editTarget)]: {
                          ...(prev[getId(editTarget)] || {}),
                          메모중요도: "CRITICAL",
                        },
                      }));
                    }}
                    className={`
    px-2 py-0.5 rounded-full text-[11px] font-semibold border
    ${editTarget.메모중요도 === "CRITICAL"
                        ? "bg-red-600 text-white border-red-600 animate-pulse"
                        : "bg-red-100 text-red-600 border-red-300"
                      }
  `}
                  >
                    긴급
                  </button>
                </div>
              </div>

              {/* 메모 입력 */}
              <textarea
                className="border p-2 rounded w-full h-20"
                value={editTarget.메모 || ""}
                onChange={(e) =>
                  setEditTarget((p) => ({ ...p, 메모: e.target.value }))
                }
              />
            </div>

            {/* ===============================
    🕘 수정 이력
=============================== */}
            {Array.isArray(editTarget.history) &&
              editTarget.history.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="text-sm font-semibold mb-2 text-gray-700">
                    🕘 수정 이력
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {editTarget.history
                      .filter(h => !IGNORE_HISTORY_FIELDS.has(h.field)) // ⭐⭐⭐ 이 줄 추가
                      .slice()
                      .reverse()
                      .map((h, i) => (

                        <div
                          key={i}
                          className="text-xs text-gray-700 border-b pb-1"
                        >
                          <div className="text-gray-500">
                            {new Date(h.at).toLocaleString()} · {h.user}
                          </div>

                          <div>
                            <b>{h.field}</b> :{" "}
                            <span className="text-red-600">
                              {String(h.before ?? "없음")}
                            </span>
                            {" → "}
                            <span className="text-blue-600">
                              {String(h.after ?? "없음")}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
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
                  const ALLOWED_FIELDS = [
                    "등록일",
                    "상차일", "상차시간",
                    "하차일", "하차시간",
                    "거래처명",
                    "상차지명", "상차지주소",
                    "하차지명", "하차지주소",
                    "화물내용",
                    "차량종류", "차량톤수",
                    "차량번호", "이름", "전화번호",
                    "청구운임", "기사운임",
                    "지급방식", "배차방식",
                    "메모",
                    "메모중요도",
                    "전달사항",
                    "운행유형",
                    "혼적", "독차",
                    "긴급",          // 🔥 여기
                    "운임보정",
                    "배차상태",
                  ];

                  const merged = {
                    ...editTarget,
                    ...(edited[getId(editTarget)] || {}),
                  };

                  const payload = ALLOWED_FIELDS.reduce((acc, k) => {
                    const v = merged[k];
                    if (v !== undefined) {
                      acc[k] = v;
                    }
                    return acc;
                  }, {});
                  if (payload.배차상태 === "배차중") {
                    delete payload.차량번호;
                    delete payload.이름;
                    delete payload.전화번호;
                  }
                  const targetId = getId(editTarget);
                  if (!targetId) {
                    alert("❌ 저장 실패: 오더 ID를 찾을 수 없습니다.");
                    return;
                  }

                  await patchDispatch(targetId, payload);


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
                  const savedId = targetId;

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
    <div className="bg-white p-5 rounded-xl w-[560px] max-w-[90vw] shadow-2xl h-[90vh] flex flex-col">
      {/* 헤더 */}
      <h3 className="font-bold text-xl mb-2">📦 운임 조회 결과</h3>

      {/* 요약 정보 */}
      <div className="text-base text-gray-700 mb-4 space-y-1">
        <div>건수: <b>{fareResult.count}</b>건</div>
        <div>평균 운임: <b>{fareResult.avg.toLocaleString()}원</b></div>
        <div>
          범위: {fareResult.min.toLocaleString()}원 ~{" "}
          {fareResult.max.toLocaleString()}원
        </div>
      </div>

     {/* 과거 운송 목록 */}
<div className="mt-3 border-t pt-3 flex flex-col flex-1 min-h-0">
  <p className="font-semibold mb-2 text-base shrink-0">
    📜 과거 운송 기록
  </p>

  {/* ✅ 스크롤 영역 */}
  <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0">
    {fareResult.records?.length > 0 ? (
      fareResult.records.map((rec) => (
        <div
          key={rec._id || rec.id}
          className="p-3 border rounded-lg bg-white hover:bg-blue-50 transition max-w-full overflow-hidden"
        >
          {/* 상단: 날짜 + 뱃지 */}
          <div className="flex justify-between items-center mb-1">
            <div className="text-sm font-semibold text-gray-700">
              {rec.상차일}
            </div>

            <div className="flex gap-1">
              {rec._priority === 4 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-600 text-white">
                  최적매칭
                </span>
              )}
              {rec._match?.cargo && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-200 text-indigo-900">
                  화물동일
                </span>
              )}
              {rec._match?.ton && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-200 text-emerald-900">
                  톤수동일
                </span>
              )}
            </div>
          </div>

          {/* 상/하차 */}
          <div className="text-base font-semibold text-gray-900 break-words">
            {rec.상차지명} → {rec.하차지명}
          </div>

          {/* 차량 */}
          <div className="text-base text-gray-700">
            {rec.차량종류 || "-"} / {rec.차량톤수 || "-"}
          </div>

          {/* 화물 */}
          <div className="text-base text-gray-900 break-all">
            화물: <b>{rec.화물내용 || "-"}</b>
          </div>

          {/* 기사 */}
          <div className="text-base text-gray-800">
            기사: <b>{rec.이름 || "-"}</b> / 기사운임{" "}
            <b className="text-green-700">
              {(rec.기사운임 || 0).toLocaleString()}원
            </b>
          </div>

          {/* 하단: 금액 + 적용 */}
          <div className="flex justify-between items-center mt-2">
            <div className="text-xl font-bold text-blue-700">
              {(rec.청구운임 || 0).toLocaleString()}원
            </div>

            <button
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-semibold"
              onClick={() => {
                setEditTarget((p) => ({
                  ...p,
                  청구운임: Number(rec.청구운임 || 0),
                  수수료:
                    Number(rec.청구운임 || 0) -
                    Number(p.기사운임 || 0),
                }));
                setFareModalOpen(false);
              }}
            >
              적용
            </button>
          </div>
        </div>
      ))
    ) : (
      <div className="text-sm text-gray-500 text-center py-10">
        유사 운임 데이터 {fareResult.count}건 참고됨
      </div>
    )}
  </div>
</div>


      {/* 하단 버튼 */}
<div className="flex justify-end gap-2 mt-4">
  <button
    className="px-4 py-1.5 bg-gray-300 rounded text-sm"
    onClick={() => setFareModalOpen(false)}
  >
    닫기
  </button>

         <button
    className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold"
    onClick={() => {
      setEditTarget((p) => ({
        ...p,
        청구운임: fareResult.avg,
        수수료:
          fareResult.avg - Number(p.기사운임 || 0),
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
            if (e.key === "Enter" && driverConfirmInfo.type !== "new") {
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
                className={`flex-1 py-2 rounded-lg text-white ${driverConfirmInfo.type === "new"
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
      {/* ===================== 기사선택 팝업 (적용/취소 방식) ===================== */}
      {driverSelectInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
          <div className="bg-white p-5 rounded-lg w-[380px] shadow-xl">
            <h3 className="text-lg font-bold mb-3 text-center">🚚 기사 선택</h3>

            {driverSelectInfo.list.map((d, i) => (
              <button
                key={i}
                onClick={() =>
                  setDriverSelectInfo(p => ({ ...p, selectedDriver: d }))
                }
                className={`w-full text-left px-3 py-2 mb-2 rounded border
            ${driverSelectInfo.selectedDriver === d
                    ? "bg-blue-100 border-blue-500"
                    : "hover:bg-gray-100"
                  }
          `}
              >
                {d.이름} ({d.차량번호}) {d.전화번호}
              </button>
            ))}

            <div className="flex gap-2 mt-4">
              {/* 취소 */}
              <button
                className="flex-1 py-2 rounded bg-gray-200"
                onClick={() => setDriverSelectInfo(null)}
              >
                취소
              </button>

              {/* 적용 */}
              <button
                disabled={!driverSelectInfo.selectedDriver}
                className="flex-1 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
                onClick={async () => {
                  const d = driverSelectInfo.selectedDriver;
                  const rowId = driverSelectInfo.rowId;

                  // 1️⃣ Firestore 저장
                  await patchDispatch(rowId, {
                    차량번호: d.차량번호,
                    이름: d.이름,
                    전화번호: d.전화번호,
                    배차상태: "배차완료",
                    lastUpdated: new Date().toISOString(),
                  });

                  // 2️⃣ 팝업 닫기
                  setDriverSelectInfo(null);

                  // 3️⃣ 🔥 정렬 반영 후 해당 행으로 스크롤 이동 (← 여기!)
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


      {/* ========================== 선택삭제 팝업 ========================== */}
      {showDeletePopup && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[99999]"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              deleteRowsWithUndo();
            }
            if (e.key === "Escape") {
              setShowDeletePopup(false);
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
              {[...selected].map((id, idx) => {
                const r = dispatchData.find(d => getId(d) === id);
                if (!r) return null;

                const sale = r.청구운임 || 0;
                const drv = r.기사운임 || 0;
                const fee = sale - drv;

                return (
                  <div key={id} className="border rounded-lg p-3 bg-gray-50">
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
                          className={`font-semibold ${fee < 0 ? "text-red-600" : "text-orange-600"
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
                onClick={() => setShowDeletePopup(false)}
                className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
              >
                취소 (ESC)
              </button>

              <button
                onClick={deleteRowsWithUndo}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                삭제 실행 (Enter)
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
              <button
                onClick={() => copyMessage("driver")}
                className="w-full py-2 bg-emerald-200 rounded hover:bg-emerald-300"
              >
                기사 전달용 (상세 + 전달메시지)
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
      {confirmChange && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100000]"
          tabIndex={-1}
          ref={(el) => {
            if (el) setTimeout(() => el.focus(), 0);
          }}
          onKeyDown={async (e) => {
            // ESC → 취소
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setConfirmChange(null);
              return;
            }

            // Enter → 확인
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();

              const patch = {
                [confirmChange.field]: confirmChange.after,
                lastUpdated: new Date().toISOString(),
              };

              if (confirmChange.field === "업체전달상태") {
                patch.업체전달일시 =
                  confirmChange.after === "전달완료" ? Date.now() : null;
                patch.업체전달방법 =
                  confirmChange.after === "전달완료" ? "기사복사" : null;
              }

              await patchDispatch(confirmChange.id, patch);
              setConfirmChange(null);
            }
          }}
        >
          <div className="bg-white rounded-xl p-6 w-[360px] shadow-xl">
            <h3 className="font-bold text-lg mb-4 text-center">
              {confirmChange.reason === "copy"
                ? "📋 복사되었습니다"
                : "변경하시겠습니까?"}
            </h3>

            <div className="text-sm mb-4 text-center">
              {confirmChange.reason === "copy" ? (
                <div className="text-gray-700">
                  전달상태를{" "}
                  <b className="text-blue-600">전달완료</b>로 변경할까요?
                </div>
              ) : (
                <>
                  <b>{confirmChange.field}</b>
                  <div className="text-gray-500 mt-1">
                    {String(confirmChange.before || "없음")} →{" "}
                    <span className="text-blue-600 font-semibold">
                      {String(confirmChange.after || "없음")}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2 rounded bg-gray-200"
                onClick={() => setConfirmChange(null)}
              >
                아니오 (ESC)
              </button>

              <button
                className="flex-1 py-2 rounded bg-blue-600 text-white"
                onClick={async () => {
                  const patch = {
                    [confirmChange.field]: confirmChange.after,
                    lastUpdated: new Date().toISOString(),
                  };

                  if (confirmChange.field === "업체전달상태") {
                    patch.업체전달일시 =
                      confirmChange.after === "전달완료" ? Date.now() : null;
                    patch.업체전달방법 =
                      confirmChange.after === "전달완료" ? "기사복사" : null;
                  }

                  await patchDispatch(confirmChange.id, patch);
                  setConfirmChange(null);
                }}
              >
                확인 (Enter)
              </button>
            </div>
          </div>
        </div>
      )}
      {sortModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100000]">
          <div className="bg-white rounded-xl w-[420px] p-6 shadow-xl">
            {/* 제목 */}
            <h3 className="text-lg font-bold mb-4">정렬 설정</h3>
            {/* 정렬 기준 */}
            <div className="mb-5">
              <div className="text-sm font-semibold mb-2">정렬 기준</div>
              <select
                className="w-full border rounded p-2"
                value={sortKey || ""}
                onChange={(e) => setSortKey(e.target.value)}
              >
                <option value="">선택 안함</option>
                {[
                  "등록일",
                  "상차일",
                  "하차일",
                  "거래처명",
                  "상차지명",
                  "하차지명",
                  "차량번호",
                  "배차상태",
                  "청구운임",
                  "기사운임",
                  "수수료",
                ].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>


            {/* 정렬 방향 */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-2">정렬 방향</div>
              <div className="flex gap-2">
                <button
                  className={`flex-1 py-2 rounded ${sortDir === "asc"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200"
                    }`}
                  onClick={() => setSortDir("asc")}
                >
                  오름차순
                </button>
                <button
                  className={`flex-1 py-2 rounded ${sortDir === "desc"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200"
                    }`}
                  onClick={() => setSortDir("desc")}
                >
                  내림차순
                </button>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-200"
                onClick={() => setSortModalOpen(false)}
              >
                취소
              </button>

              <button
                className="px-4 py-2 rounded bg-gray-300"
                onClick={() => {
                  setSortKey("");
                  setSortDir("asc");
                  setSortModalOpen(false);
                }}
              >
                정렬 해제
              </button>

              <button
                className="px-4 py-2 rounded bg-blue-600 text-white"
                onClick={() => setSortModalOpen(false)}
              >
                적용
              </button>
            </div>

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
  const short = clean.length > 5 ? clean.slice(0, 5) + "…" : clean;

  return (
    <>
      <span>{showFull ? clean : short}</span>

      {clean.length > 5 && !showFull && (
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
          onClick={() => setShowFull(false)}   // ✅ 바깥 클릭 닫기
        >
          <div
            className="bg-white p-4 rounded-lg shadow-lg w-[400px]"
            onClick={(e) => e.stopPropagation()} // ✅ 내부 클릭 전파 차단
          >
            <h3 className="font-semibold mb-2">메모 내용</h3>

            <div className="text-sm whitespace-pre-wrap">
              {clean}
            </div>

            <div className="text-right mt-3">
              <button
                onClick={() => setShowFull(false)} // ✅ 🔥 이게 핵심
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
        // ⭐⭐⭐ 이 두 줄이 핵심 (이거 없어서 안 떴던 거다)
        경유지_상차: Array.isArray(newOrder.경유지_상차)
          ? newOrder.경유지_상차
          : [],

        경유지_하차: Array.isArray(newOrder.경유지_하차)
          ? newOrder.경유지_하차
          : [],
        메모중요도: "일반",
        운행유형: newOrder.운행유형 || "편도",
        등록일: new Date().toISOString().slice(0, 10),
        배차상태: "배차중",
        차량번호: "",
        이름: "",
        전화번호: "",
        긴급: false, // ⭐ 이거 꼭

        업체전달상태: "미전달",
        업체전달일시: null,
        업체전달방법: null,
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
        메모중요도: "일반",
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
                <option value="">선택없음</option>

                <option value="오전 6:00">오전 6:00</option>
                <option value="오전 6:30">오전 6:30</option>

                <option value="오전 7:00">오전 7:00</option>
                <option value="오전 7:30">오전 7:30</option>

                <option value="오전 8:00">오전 8:00</option>
                <option value="오전 8:30">오전 8:30</option>

                <option value="오전 9:00">오전 9:00</option>
                <option value="오전 9:30">오전 9:30</option>

                <option value="오전 10:00">오전 10:00</option>
                <option value="오전 10:30">오전 10:30</option>

                <option value="오전 11:00">오전 11:00</option>
                <option value="오전 11:30">오전 11:30</option>

                <option value="오후 12:00">오후 12:00</option>
                <option value="오후 12:30">오후 12:30</option>

                <option value="오후 1:00">오후 1:00</option>
                <option value="오후 1:30">오후 1:30</option>

                <option value="오후 2:00">오후 2:00</option>
                <option value="오후 2:30">오후 2:30</option>

                <option value="오후 3:00">오후 3:00</option>
                <option value="오후 3:30">오후 3:30</option>

                <option value="오후 4:00">오후 4:00</option>
                <option value="오후 4:30">오후 4:30</option>

                <option value="오후 5:00">오후 5:00</option>
                <option value="오후 5:30">오후 5:30</option>

                <option value="오후 6:00">오후 6:00</option>
                <option value="오후 6:30">오후 6:30</option>

                <option value="오후 7:00">오후 7:00</option>
                <option value="오후 7:30">오후 7:30</option>

                <option value="오후 8:00">오후 8:00</option>
                <option value="오후 8:30">오후 8:30</option>

                <option value="오후 9:00">오후 9:00</option>
                <option value="오후 9:30">오후 9:30</option>

                <option value="오후 10:00">오후 10:00</option>
                <option value="오후 10:30">오후 10:30</option>

                <option value="오후 11:00">오후 11:00</option>
                <option value="오후 11:30">오후 11:30</option>


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
                <option value="">선택없음</option>

                <option value="오전 6:00">오전 6:00</option>
                <option value="오전 6:30">오전 6:30</option>

                <option value="오전 7:00">오전 7:00</option>
                <option value="오전 7:30">오전 7:30</option>

                <option value="오전 8:00">오전 8:00</option>
                <option value="오전 8:30">오전 8:30</option>

                <option value="오전 9:00">오전 9:00</option>
                <option value="오전 9:30">오전 9:30</option>

                <option value="오전 10:00">오전 10:00</option>
                <option value="오전 10:30">오전 10:30</option>

                <option value="오전 11:00">오전 11:00</option>
                <option value="오전 11:30">오전 11:30</option>

                <option value="오후 12:00">오후 12:00</option>
                <option value="오후 12:30">오후 12:30</option>

                <option value="오후 1:00">오후 1:00</option>
                <option value="오후 1:30">오후 1:30</option>

                <option value="오후 2:00">오후 2:00</option>
                <option value="오후 2:30">오후 2:30</option>

                <option value="오후 3:00">오후 3:00</option>
                <option value="오후 3:30">오후 3:30</option>

                <option value="오후 4:00">오후 4:00</option>
                <option value="오후 4:30">오후 4:30</option>

                <option value="오후 5:00">오후 5:00</option>
                <option value="오후 5:30">오후 5:30</option>

                <option value="오후 6:00">오후 6:00</option>
                <option value="오후 6:30">오후 6:30</option>

                <option value="오후 7:00">오후 7:00</option>
                <option value="오후 7:30">오후 7:30</option>

                <option value="오후 8:00">오후 8:00</option>
                <option value="오후 8:30">오후 8:30</option>

                <option value="오후 9:00">오후 9:00</option>
                <option value="오후 9:30">오후 9:30</option>

                <option value="오후 10:00">오후 10:00</option>
                <option value="오후 10:30">오후 10:30</option>

                <option value="오후 11:00">오후 11:00</option>
                <option value="오후 11:30">오후 11:30</option>


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

  const [selectedYear, setSelectedYear] = React.useState(
    new Date().getFullYear()
  );

  const [detailClient, setDetailClient] = React.useState(null);
  const [aiMode, setAiMode] = React.useState(null);
  // null | "summary" | "suggest" | "report"
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const sum = (list, key) => list.reduce((a, r) => a + toInt(r[key]), 0);

  const profitRate = (sale, profit) =>
    sale === 0 ? 0 : (profit / sale) * 100;

  const ratePct = (n) => `${n.toFixed(1)}%`;

  // ================================
  // 📸 매출관리 화면 전체 캡쳐 (PNG / PDF)
  // ================================
  const exportSettlementCapture = async (type = "png") => {
    const el = document.getElementById("settlement-capture");
    if (!el) {
      alert("캡쳐 영역을 찾을 수 없습니다.");
      return;
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    if (type === "png") {
      const link = document.createElement("a");
      link.download = `매출관리_${targetMonth}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = 210;
    const pdfHeight = 297;
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`매출관리_${targetMonth}.pdf`);
  };

  const [yearKey, monthNum] = targetMonth.split("-").map(Number);
  const monthKey = targetMonth;

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

  const dispatchRows = Array.isArray(dispatchData)
    ? dispatchData.filter(
      (r) =>
        (r.배차상태 || "") === "배차완료" &&
        !String(r.거래처명 || "").includes("채석강")
    )
    : [];

  const fixedMapped = (fixedRows || []).map((r) => ({
    상차일: r.날짜,
    출발지: r.출발지 || "",
    도착지: r.도착지 || "",
    거래처명: r.거래처명 || "",
    청구운임: r.청구운임 || 0,
    기사운임: r.기사운임 || 0,
    수수료: r.수수료 || 0,
    배차상태: "배차완료",
  }));

  const rows = [...dispatchRows, ...fixedMapped];

  const dayRows = rows.filter((r) => (r.상차일 || "") === kpiDay);
  const monthRows = rows.filter((r) =>
    (r.상차일 || "").startsWith(monthKey)
  );

  const yearRows = rows.filter((r) => {
    const d = r.상차일;
    if (!d) return false;
    const endOfMonth = new Date(yearKey, monthNum, 0)
      .toISOString()
      .slice(0, 10);
    return d >= `${yearKey}-01-01` && d <= endOfMonth;
  });

  const prevMonthRows = rows.filter((r) =>
    (r.상차일 || "").startsWith(prevMonthKey)
  );

  const isValidClientName = (c) =>
    c &&
    !/^2\d{1,2}년/.test(c) &&
    !c.includes("후레쉬물류");

  const firstAppearMap = new Map();

  rows.forEach((r) => {
    const c = r.거래처명 || "";
    const d = r.상차일 || "";
    if (!isValidClientName(c) || !d) return;

    if (!firstAppearMap.has(c) || d < firstAppearMap.get(c)) {
      firstAppearMap.set(c, d);
    }
  });

  const newClients = [];

  firstAppearMap.forEach((firstDate, client) => {
    if (firstDate.startsWith(monthKey)) {
      const clientRows = monthRows.filter(
        (r) => r.거래처명 === client
      );

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

  const isFresh = (r) =>
    String(r.거래처명 || "").includes("후레쉬물류");
const isExcludedClient = (name = "") =>
  name.includes("후레쉬물류") || name.includes("채석강");
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

  const today = new Date().toISOString().slice(0, 10);
  const daysInMonth = new Date(yearKey, monthNum, 0).getDate();

  const elapsedDays =
    new Set(
      monthRows
        .map((r) => r.상차일)
        .filter((d) => d && d <= today)
    ).size || 1;

  const curSale = m.sale;
  const curProfit = m.profit;
  const curCnt = monthRows.length;

  const avgSalePerDay = curSale / elapsedDays;
  const avgProfitPerDay = curProfit / elapsedDays;
  const avgCntPerDay = curCnt / elapsedDays;

  const forecast = {
    sale: Math.round(avgSalePerDay * daysInMonth),
    profit: Math.round(avgProfitPerDay * daysInMonth),
    count: Math.round(avgCntPerDay * daysInMonth),
  };

  // ================================
  // 🔹 순수 운송 / 후레쉬 분리
  // ================================

  const pmPure = stat(prevMonthRows.filter((r) => !isFresh(r)));

  const dPure = stat(dayRows.filter((r) => !isFresh(r)));
  const mPure = stat(monthRows.filter((r) => !isFresh(r)));
  const yPure = stat(yearRows.filter((r) => !isFresh(r)));

  // ================================
  // 🔮 2026 매출 예측 (BEST PRACTICE)
  // ================================

  const baseYear = yearKey - 1;

  const lastYearRows = rows.filter((r) => {
    const d = r.상차일;
    if (!d) return false;
    return d.startsWith(String(baseYear));
  });

  // ================================
  // 📦 작년 월별 후레쉬물류 지입 매출
  // ================================

  const lastYearFreshByMonth = Array.from({ length: 12 }, (_, i) => ({
    month: `${i + 1}월`,
    sale: 0,
    profit: 0,
  }));

  lastYearRows.forEach((r) => {
    if (!isFresh(r)) return;
    const d = r.상차일;
    if (!d) return;

    const mIdx = Number(d.slice(5, 7)) - 1;
    const sale = toInt(r.청구운임);
    const driver = toInt(r.기사운임);

    lastYearFreshByMonth[mIdx].sale += sale;
    lastYearFreshByMonth[mIdx].profit += sale - driver;
  });

  const lastYearPure = stat(
    lastYearRows.filter((r) => !isFresh(r))
  );

  // ================================
  // 🎯 연간 목표 대비 실적
  // ================================

  const PURE_TARGET_2026 = 2098451820;

  const lastYearFresh = stat(
    lastYearRows.filter((r) => isFresh(r))
  );

  const yFresh = stat(yearRows.filter((r) => isFresh(r)));

  const FRESH_GROWTH_RATE = 0.03;

  const FRESH_TARGET_2026 = Math.round(
    lastYearFresh.sale * (1 + FRESH_GROWTH_RATE)
  );

  const achieveRate = (cur, target) =>
    target > 0 ? (cur / target) * 100 : 0;

  const baseYearSale = lastYearPure.sale;

  const growth2026 = {
    conservative: 0.05,
    normal: 0.1,
    aggressive: 0.18,
  };

  const forecast2026 = {
    conservative: Math.round(
      baseYearSale * (1 + growth2026.conservative)
    ),
    normal: Math.round(
      baseYearSale * (1 + growth2026.normal)
    ),
    aggressive: Math.round(
      baseYearSale * (1 + growth2026.aggressive)
    ),
  };

  // ================================
  // 📉 전월 대비
  // ================================
  // === [당일 vs 전월 동일일 비교 TOP10용] ===
  const todayDate = new Date();
  const todayKey2 = todayDate.toISOString().slice(0, 10);

  const prevMonthSameDay = (() => {
    const y = todayDate.getFullYear();
    const m = todayDate.getMonth(); // 0-based
    const d = todayDate.getDate();
    const lastDay = new Date(y, m, 0).getDate();
    return new Date(y, m - 1, Math.min(d, lastDay))
      .toISOString()
      .slice(0, 10);
  })();

  const groupByClientDay = (list) => {
    const map = {};
    list.forEach((r) => {
      const c = r.거래처명 || "미지정";
      if (!map[c]) map[c] = { sale: 0, cnt: 0 };
      map[c].sale += toInt(r.청구운임);
      map[c].cnt += 1;
    });
    return map;
  };

  const todayMap = groupByClientDay(
    rows.filter((r) => r.상차일 === todayKey2)
  );

  const prevMap = groupByClientDay(
    rows.filter((r) => r.상차일 === prevMonthSameDay)
  );

  const dayDropTop10 = Object.keys({ ...todayMap, ...prevMap })
    .map((client) => {
      const t = todayMap[client] || { sale: 0, cnt: 0 };
      const p = prevMap[client] || { sale: 0, cnt: 0 };
      return {
        client,
        todaySale: t.sale,
        todayCnt: t.cnt,
        prevSale: p.sale,
        prevCnt: p.cnt,
        diff: t.sale - p.sale,
      };
    })
    .filter((r) => r.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 10);

  const diffRate = (cur, prev) =>
    prev === 0 ? 0 : ((cur - prev) / prev) * 100;

  const vr = {
    month: diffRate(m.profit, pm.profit),
  };

  const vrPure = {
    month: diffRate(mPure.profit, pmPure.profit),
  };

  const rateText = (n) =>
    `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1)}%`;

  const rateClass = (n) =>
    n >= 0 ? "text-emerald-600" : "text-rose-600";

  // ================================
  // 🧩 UI RENDER START
  // ================================

  return (
    <div
      id="settlement-capture"
      className="bg-gray-50 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* ================= LEFT PANEL ================= */}
      <div className="space-y-6 flex-1">

        {/* 캡쳐 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={() => exportSettlementCapture("png")}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700"
          >
            PNG 캡쳐
          </button>
          <button
            onClick={() => exportSettlementCapture("pdf")}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500"
          >
            PDF 저장
          </button>
        </div>
        <SettlementMonthlyHeader
          targetMonth={targetMonth}
          setTargetMonth={setTargetMonth}
          monthRows={monthRows}
          forecast={forecast}
          forecast2026={forecast2026}
        />

        {/* ================= 🎯 연간 목표 대비 실적 · 2026 매출 전망 ================= */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-8">

          <h3 className="text-base font-bold text-gray-900">
            연간 목표 대비 실적 · 2026 매출 전망
          </h3>

          {/* ================= 순수 운송 매출 ================= */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">
              순수 운송 매출
            </p>

            <div className="grid grid-cols-4 gap-4 text-center">
              <Metric label="작년" value={won(lastYearPure.sale)} />
              <Metric
                label="목표"
                value={won(PURE_TARGET_2026)}
                valueClass="text-indigo-700"
              />
              <Metric
                label="현재"
                value={won(yPure.sale)}
                valueClass="text-gray-900"
              />
              <Metric
                label="달성률"
                value={`${achieveRate(yPure.sale, PURE_TARGET_2026).toFixed(1)}%`}
                valueClass="text-indigo-800"
              />
            </div>
          </div>

          {/* ================= 후레쉬 물류 매출 ================= */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">
              후레쉬 물류 매출
            </p>

            <div className="grid grid-cols-4 gap-4 text-center">
              <Metric label="작년" value={won(lastYearFresh.sale)} />
              <Metric
                label="목표"
                value={won(FRESH_TARGET_2026)}
                valueClass="text-indigo-700"
              />
              <Metric
                label="현재"
                value={won(yFresh.sale)}
                valueClass="text-gray-900"
              />
              <Metric
                label="달성률"
                value={`${achieveRate(yFresh.sale, FRESH_TARGET_2026).toFixed(1)}%`}
                valueClass="text-indigo-800"
              />
            </div>
          </div>

          {/* ================= 구분선 ================= */}
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold text-gray-500">
              2026 매출 전망 (순수 운송)
            </span>
            <div className="flex-1 border-t border-gray-300" />
          </div>

          {/* ================= 2026 매출 전망 ================= */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <ScenarioCard
              title="보수적 시나리오"
              value={forecast2026.conservative}
              tone="gray"
            />
            <ScenarioCard
              title="기준 시나리오"
              value={forecast2026.normal}
              tone="indigo"
              highlight
            />
            <ScenarioCard
              title="공격적 시나리오"
              value={forecast2026.aggressive}
              tone="gray"
            />
          </div>
        </div>

        {/* ================= KPI – 총 운송료 ================= */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">
              총 운송료 (후레쉬 포함)
            </h3>
            <span className="text-[11px] text-gray-400">
              배차 + 고정거래처
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
                <th className="border p-2">전월대비</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["월", m, "month"],
                ["년", y, null],
              ].map(([label, data, key], i) => (
                <tr key={i} className="font-semibold">
                  <td className="border p-2 bg-gray-50">{label}</td>
                  <td className="border p-2 text-indigo-700">
                    {won(data.sale)}
                  </td>
                  <td className="border p-2 text-gray-600">
                    {won(data.driver)}
                  </td>
                  <td className="border p-2 text-emerald-600">
                    {won(data.profit)}
                  </td>
                  <td className="border p-2 text-indigo-700">
                    {ratePct(profitRate(data.sale, data.profit))}
                  </td>
                  <td
                    className={`border p-2 ${key ? rateClass(vr[key]) : "text-gray-400"
                      }`}
                  >
                    {key ? rateText(vr[key]) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ================= KPI – 순수 운송 ================= */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold mb-4 text-emerald-700">
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
                <th className="border p-2">전월대비</th>
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
                  <td className="border p-2 text-indigo-700">
                    {won(data.sale)}
                  </td>
                  <td className="border p-2 text-gray-600">
                    {won(data.driver)}
                  </td>
                  <td className="border p-2 text-emerald-600">
                    {won(data.profit)}
                  </td>
                  <td className="border p-2 text-indigo-700">
                    {ratePct(profitRate(data.sale, data.profit))}
                  </td>
                  <td
                    className={`border p-2 ${key ? rateClass(vrPure[key]) : "text-gray-400"
                      }`}
                  >
                    {key ? rateText(vrPure[key]) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       <SettlementClientAnalysis
  topRows={monthRows.filter(
    (r) => !isExcludedClient(r.거래처명)
  )}
  dropRows={rows.filter(
    (r) => !isExcludedClient(r.거래처명)
  )}
  newClients={newClients}
  targetMonth={targetMonth}
/>

      </div>
      {/* ================= RIGHT PANEL ================= */}
      <div className="flex flex-col gap-6 flex-1 h-full self-stretch">

        {/* 상단 정렬 슬롯 (왼쪽 버튼 높이 맞춤) */}
        <div className="h-[44px] flex items-center justify-end">
          <span className="text-sm text-gray-400">
            매출관리 리포트
          </span>
        </div>

        {/* 실제 리포트 카드 */}
        <div className="flex-1">
          <YearlySummaryChart
            rows={rows}
            year={selectedYear}
            setYear={setSelectedYear}
            onAI={(mode) => setAiMode(mode)}
          />
        </div>

      </div>

      {/* ================= DETAIL POPUP ================= */}
      {detailClient && (
        <SettlementDetailPopup
          client={detailClient}
          rows={monthRows.filter(
            (r) => r.거래처명 === detailClient
          )}
          onClose={() => setDetailClient(null)}
        />
      )}
      {aiMode && (
        <AIInsightModal
          mode={aiMode}
          monthRows={monthRows}
          forecast2026={forecast2026}
          onClose={() => setAiMode(null)}
        />
      )}
    </div>
  );
}


/* ================================================================= */
/* ================== 이하 컴포넌트 정의 (디자인만 정리) ================= */
/* ================================================================= */
function AIInsightModal({ mode, monthRows = [], forecast2026, onClose }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const sale = monthRows.reduce(
    (a, r) => a + toInt(r.청구운임),
    0
  );
  const driver = monthRows.reduce(
    (a, r) => a + toInt(r.기사운임),
    0
  );
  const profit = sale - driver;
  const rate = sale ? (profit / sale) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-2xl w-[520px] p-6 shadow-xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-800">
            {mode === "summary" && "AI 요약"}
            {mode === "suggest" && "AI 액션 제안"}
            {mode === "report" && "AI 보고서"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {mode === "summary" && (
          <p className="text-sm text-gray-700 leading-relaxed">
            당월 매출 <b>{sale.toLocaleString()}원</b>,
            수익 <b>{profit.toLocaleString()}원</b>,
            수익률 <b>{rate.toFixed(1)}%</b>입니다.
            <br />
            현재 추세 기준 2026년 예상 매출은{" "}
            <b className="text-indigo-700">
              {forecast2026.normal.toLocaleString()}원
            </b>
            입니다.
          </p>
        )}

        {mode === "suggest" && (
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            <li>상위 거래처 운임 재협상 검토</li>
            <li>수익률 10% 미만 거래처 관리 필요</li>
            <li>고정 거래처 비중 확대 권장</li>
          </ul>
        )}

        {mode === "report" && (
          <textarea
            readOnly
            className="w-full h-40 border rounded-lg p-3 text-sm"
            value={`2026년 매출 요약 보고

총 매출: ${sale.toLocaleString()}원
총 수익: ${profit.toLocaleString()}원
수익률: ${rate.toFixed(1)}%

전반적으로 안정적인 성장 흐름을 유지 중입니다.`}
          />
        )}
      </div>
    </div>
  );
}

function SettlementClientAnalysis({
  topRows = [],
  dropRows = [],
  newClients = [],
  targetMonth,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-8">

      {/* 카드 타이틀 */}
      <h3 className="text-sm font-semibold text-gray-800">
        거래처 분석 요약
      </h3>

      {/* ================= ① 월 매출 Top 10 ================= */}
      <section>
        <h4 className="text-xs font-semibold text-gray-600 mb-3">
          월 매출 Top 10 거래처
        </h4>
        <SettlementTop10
          rows={topRows}
          allRows={dropRows} // 🔥 전체 rows 전달 (전월 비교용)
          targetMonth={targetMonth}
        />

      </section>

      {/* 구분선 */}
      <div className="border-t border-gray-200" />

      {/* ================= ② 전월 대비 매출 감소 ================= */}
      <section>
        <div className="flex justify-between items-end mb-3">
          <h4 className="text-xs font-semibold text-gray-600">
            전월 대비 매출 감소 TOP10
          </h4>
          <span className="text-[11px] text-gray-400">

          </span>
        </div>
        <SettlementTop10Drop
  rows={dropRows}
  targetMonth={targetMonth}
/>
      </section>

      {/* 구분선 */}
      <div className="border-t border-gray-200" />

      {/* ================= ③ 신규 거래처 ================= */}
      <section>
        <h4 className="text-xs font-semibold text-gray-600 mb-3">
          신규 거래처 (당월)
        </h4>

        {newClients.length ? (
          <SettlementNewClients rows={newClients} />
        ) : (
          <div className="text-sm text-gray-400 text-center py-4">
            신규 거래처가 없습니다
          </div>
        )}
      </section>
    </div>
  );
}

function SettlementMonthlyHeader({
  targetMonth,
  setTargetMonth,
  monthRows,
  forecast,
  forecast2026,
}) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const totalSale = monthRows.reduce(
    (a, r) => a + toInt(r.청구운임),
    0
  );
  const totalCnt = monthRows.length;
  const avgSale = totalCnt ? totalSale / totalCnt : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">

      {/* ✅ 섹션 타이틀 (연간 목표 대비 실적과 동일) */}
      <h3 className="text-base font-bold text-gray-900">
        누적현황 및 월 예상지표
      </h3>

      {/* 조회 월 */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-1">
          조회 월
        </p>
        <select
          className="border border-gray-300 rounded-lg p-2 w-full text-sm"
          value={targetMonth}
          onChange={(e) => setTargetMonth(e.target.value)}
        >
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return (
              <option key={i}>
                {d.toISOString().slice(0, 7)}
              </option>
            );
          })}
        </select>
      </div>

      {/* ===== 현재 누적 실적 ===== */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <StatCard
          title="총 매출"
          value={`${totalSale.toLocaleString()}원`}
        />
        <StatCard
          title="총 오더수"
          value={`${totalCnt}건`}
        />
        <StatCard
          title="평균매출/건"
          value={`${Math.round(avgSale).toLocaleString()}원`}
        />
      </div>

      {/* ===== 구분선 ===== */}
      <div className="flex items-center gap-3 my-2">
        <span className="text-xs font-semibold text-indigo-600">
          예상 지표
        </span>
        <div className="flex-1 border-t border-dashed border-indigo-300" />
      </div>

      {/* ===== 월 예상 ===== */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <StatCard
          title="예상 매출"
          value={`${forecast.sale.toLocaleString()}원`}
          variant="forecast"
        />
        <StatCard
          title="예상 건수"
          value={`${forecast.count}건`}
          variant="forecast"
        />
        <StatCard
          title="예상 수익"
          value={`${forecast.profit.toLocaleString()}원`}
          variant="forecast"
        />
      </div>
      {/* ===== AI 프리미엄 인사이트 ===== */}
      <AIPremiumInsight
        rows={monthRows}
        targetMonth={targetMonth}
        forecast2026={forecast2026}
        yPure={null}
      />
    </div>
  );
}

function SettlementTop10({ rows = [], allRows = [], targetMonth }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  // ===============================
  // 📅 전월 동일 기간 계산
  // ===============================
const [y, m] = targetMonth.split("-").map(Number);

const curStart = `${y}-${String(m).padStart(2, "0")}-01`;
const curEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;

const prev = new Date(y, m - 2, 1);
const py = prev.getFullYear();
const pm = prev.getMonth() + 1;

const prevStart = `${py}-${String(pm).padStart(2, "0")}-01`;
const prevEnd = `${py}-${String(pm).padStart(2, "0")}-${new Date(py, pm, 0).getDate()}`;


  // ===============================
  // 📦 거래처별 집계 함수
  // ===============================
  const groupByClient = (list) => {
    const map = {};
    list.forEach((r) => {
      const c = r.거래처명 || "미지정";
      if (!map[c]) map[c] = { sale: 0, profit: 0, cnt: 0 };

      const sale = toInt(r.청구운임);
      const driver = toInt(r.기사운임);

      map[c].sale += sale;
      map[c].profit += sale - driver;
      map[c].cnt += 1;
    });
    return map;
  };

  // 당월 / 전월 맵
  const curMap = groupByClient(
    allRows.filter((r) => r.상차일 >= curStart && r.상차일 <= curEnd)
  );
  const prevMap = groupByClient(
    allRows.filter((r) => r.상차일 >= prevStart && r.상차일 <= prevEnd)
  );

  // ===============================
  // 📊 당월 Top10 + ▲▼ 계산
  // ===============================
  const top10 = Object.keys(curMap)
    .map((client) => {
      const cur = curMap[client];
      const prev = prevMap[client] || { sale: 0, profit: 0, cnt: 0 };

      return {
        client,
        sale: cur.sale,
        profit: cur.profit,
        cnt: cur.cnt,
        saleRate:
          prev.sale === 0 ? 0 : ((cur.sale - prev.sale) / prev.sale) * 100,
        profitRate:
          prev.profit === 0
            ? 0
            : ((cur.profit - prev.profit) / prev.profit) * 100,
        cntDiff: cur.cnt - prev.cnt,
      };
    })
    .sort((a, b) => b.sale - a.sale)
    .slice(0, 10);

  const won = (n) => `${n.toLocaleString()}원`;
  const arrow = (n) => (n >= 0 ? "▲" : "▼");
  const rateCls = (n) =>
    n >= 0 ? "text-emerald-600" : "text-rose-600";

  // ===============================
  // 🧩 UI
  // ===============================
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">
        월 매출 Top 10 거래처 (전월/전일대비)
      </h3>

      <table className="w-full text-sm border-collapse text-center">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="border p-2">순위</th>
            <th className="border p-2">거래처</th>
            <th className="border p-2">매출</th>
            <th className="border p-2">수익</th>
            <th className="border p-2">건수</th>
          </tr>
        </thead>
        <tbody>
          {top10.map((r, i) => (
            <tr key={r.client} className="hover:bg-gray-50">
              <td className="border p-2 font-semibold">{i + 1}</td>

              <td className="border p-2 text-indigo-700 font-semibold">
                {r.client}
              </td>

              <td className="border p-2">
                <span className="inline-flex items-center gap-1">
                  <span>{won(r.sale)}</span>
                  <span className={`text-xs ${rateCls(r.saleRate)}`}>
                    {arrow(r.saleRate)}{Math.abs(r.saleRate).toFixed(1)}%
                  </span>
                </span>
              </td>

              <td className="border p-2 text-emerald-600">
                <span className="inline-flex items-center gap-1">
                  <span>{won(r.profit)}</span>
                  <span className={`text-xs ${rateCls(r.profitRate)}`}>
                    {arrow(r.profitRate)}{Math.abs(r.profitRate).toFixed(1)}%
                  </span>
                </span>
              </td>

              <td className="border p-2">
                <span className="inline-flex items-center gap-1">
                  <span>{r.cnt}</span>
                  <span
                    className={`text-xs ${r.cntDiff >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                      }`}
                  >
                    ({r.cntDiff >= 0 ? "+" : ""}
                    {r.cntDiff})
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettlementTop10Drop({ rows = [], targetMonth }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  // ===============================
  // 📅 전월 동일 기간 계산
  // ===============================
const [y, m] = targetMonth.split("-").map(Number);

const curStart = `${y}-${String(m).padStart(2, "0")}-01`;
const curEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;

const prev = new Date(y, m - 2, 1);
const py = prev.getFullYear();
const pm = prev.getMonth() + 1;

const prevStart = `${py}-${String(pm).padStart(2, "0")}-01`;
const prevEnd = `${py}-${String(pm).padStart(2, "0")}-${new Date(py, pm, 0).getDate()}`;
  // ===============================
  // 📦 거래처별 누적 매출 집계
  // ===============================
  const groupByClient = (list) => {
    const map = {};
    list.forEach((r) => {
      const c = r.거래처명 || "미지정";
      if (!map[c]) map[c] = { sale: 0, cnt: 0 };
      map[c].sale += toInt(r.청구운임);
      map[c].cnt += 1;
    });
    return map;
  };

  const curMap = groupByClient(
    rows.filter((r) => r.상차일 >= curStart && r.상차일 <= curEnd)
  );
  const prevMap = groupByClient(
    rows.filter((r) => r.상차일 >= prevStart && r.상차일 <= prevEnd)
  );

  // ===============================
  // 🏷 원인 분석 태깅
  // ===============================
  const reasonTag = ({ prevCnt, curCnt, prevSale, curSale }) => {
    if (prevCnt > 0 && curCnt === 0) return "거래 중단 의심";
    if (curCnt <= prevCnt * 0.6) return "거래량 급감";
    if (
      curCnt > 0 &&
      curSale / curCnt < (prevSale / Math.max(prevCnt, 1)) * 0.7
    )
      return "단가 하락";
    return "기타";
  };

  // ===============================
  // 📉 전월 대비 매출 감소 TOP10 (누적)
  // ===============================
  const drops = Object.keys({ ...curMap, ...prevMap })
    .map((client) => {
      const cur = curMap[client] || { sale: 0, cnt: 0 };
      const prev = prevMap[client] || { sale: 0, cnt: 0 };

      return {
        client,
        prevSale: prev.sale,
        curSale: cur.sale,
        prevCnt: prev.cnt,
        curCnt: cur.cnt,
        diff: cur.sale - prev.sale,
        reason: reasonTag({
          prevCnt: prev.cnt,
          curCnt: cur.cnt,
          prevSale: prev.sale,
          curSale: cur.sale,
        }),
      };
    })
    .filter((r) => r.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  if (!drops.length) return null;

  // ===============================
  // 🧩 UI
  // ===============================
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex justify-between items-end mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          전월 대비 매출 감소 TOP10
        </h3>
        <span className="text-[11px] font-medium text-indigo-600">
          기준: 해당 월 1일 ~ 말일 (선택 월 기준)
        </span>
      </div>

      <table className="w-full text-sm border-collapse text-center">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="border p-2">순위</th>
            <th className="border p-2">거래처</th>
            <th className="border p-2">전월 누적 매출</th>
            <th className="border p-2">당월 누적 매출</th>
            <th className="border p-2">거래량</th>
            <th className="border p-2">감소액</th>
            <th className="border p-2">원인 분석</th>
          </tr>
        </thead>
        <tbody>
          {drops.map((r) => (
            <tr key={r.client} className="hover:bg-gray-50">
              <td className="border p-2 font-semibold">
                {r.rank}
              </td>
              <td className="border p-2 font-semibold">
                {r.client}
              </td>
              <td className="border p-2 text-indigo-600 font-semibold">
                {r.prevSale.toLocaleString()}원
              </td>
              <td className="border p-2 text-rose-600 font-semibold">
                {r.curSale.toLocaleString()}원
              </td>
              <td className="border p-2">
                {r.prevCnt} → {r.curCnt}
              </td>
              <td className="border p-2 text-rose-600 font-bold">
                {r.diff.toLocaleString()}원
              </td>
              <td className="border p-2 text-xs font-medium text-gray-700">
                {r.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function SettlementNewClients({ rows = [] }) {
  if (!rows.length) return null;

  return (
    <div className="bg-white rounded-2xl border p-6">
      <h3 className="text-sm font-semibold text-indigo-700 mb-3">
        신규 거래처 (당월)
      </h3>

      <table className="w-full text-sm text-center border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="border p-2">거래처</th>
            <th className="border p-2">첫 거래일</th>
            <th className="border p-2">건수</th>
            <th className="border p-2">매출</th>
            <th className="border p-2">수익</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.client}>
              <td className="border p-2 font-semibold">{r.client}</td>
              <td className="border p-2">{r.firstDate}</td>
              <td className="border p-2">{r.cnt}</td>
              <td className="border p-2">
                {r.sale.toLocaleString()}원
              </td>
              <td className="border p-2 text-emerald-600">
                {r.profit.toLocaleString()}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function SettlementOverallStats({ rows }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) ||
    0;
  const won = (n) => `${(n || 0).toLocaleString()}원`;

  const totalCnt = rows.length;
  const totalSale = rows.reduce(
    (a, r) => a + toInt(r.청구운임),
    0
  );
  const avgSale = totalCnt ? totalSale / totalCnt : 0;

  return (
    <div className="grid grid-cols-3 gap-4 text-center">
      <StatCard title="총 매출" value={won(totalSale)} />
      <StatCard title="총 오더수" value={`${totalCnt}건`} />
      <StatCard
        title="평균매출/오더"
        value={won(avgSale)}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  variant = "current", // current | forecast
}) {
  const isForecast = variant === "forecast";

  return (
    <div
      className={`
        rounded-xl border p-4
        ${isForecast
          ? "bg-indigo-50 border-indigo-200"
          : "bg-white border-gray-200"}
      `}

    >
      {/* 라벨 */}
      <p
        className={`
          text-sm font-semibold tracking-tight
          ${isForecast ? "text-indigo-700" : "text-gray-800"}
        `}
      >
        {title}
      </p>

      {/* 값 */}
      <p
        className={`
          mt-1 tracking-tight
          ${isForecast
            ? "text-lg font-semibold text-indigo-800"
            : "text-xl font-bold text-gray-900"}
        `}
      >
        {value}
      </p>
    </div>
  );
}
function Metric({ label, value, valueClass = "text-gray-900" }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-600">{label}</p>
      <p className={`text-lg font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function ScenarioCard({ title, value, tone, highlight = false }) {
  const toneMap = {
    gray: "bg-gray-50 border-gray-300 text-gray-900",
    indigo: "bg-indigo-50 border-indigo-300 text-indigo-800",
    emerald: "bg-emerald-50 border-emerald-300 text-emerald-800",
  };

  return (
    <div
      className={`
        rounded-xl border p-4
        ${toneMap[tone]}
        ${highlight ? "ring-2 ring-indigo-300" : ""}
      `}
    >
      <p className="text-sm font-semibold mb-1">{title}</p>
      <p className="text-lg font-bold">
        {value.toLocaleString()}원
      </p>
    </div>
  );
}

function AIPremiumInsight({
  rows = [],
  targetMonth,
  forecast2026,
  yPure,
}) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const totalSale = rows.reduce(
    (a, r) => a + toInt(r.청구운임),
    0
  );
  const totalDriver = rows.reduce(
    (a, r) => a + toInt(r.기사운임),
    0
  );
  const profit = totalSale - totalDriver;

  const profitRate =
    totalSale === 0 ? 0 : (profit / totalSale) * 100;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-200 shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-semibold text-indigo-700">
        AI 프리미엄 인사이트
      </h3>

      <p className="text-sm text-gray-700 leading-relaxed">
        {targetMonth} 기준 순수 운송 매출은{" "}
        <b>{totalSale.toLocaleString()}원</b>,
        수익은 <b>{profit.toLocaleString()}원</b>으로
        수익률 <b>{profitRate.toFixed(1)}%</b>를 기록 중입니다.
      </p>

      <p className="text-sm text-gray-700 leading-relaxed">
        현재 추세가 유지될 경우 2026년 예상 매출은
        <b className="text-indigo-700">
          {" "}
          {forecast2026.normal.toLocaleString()}원
        </b>{" "}
        수준으로 예상됩니다.
      </p>

      <div className="bg-white border rounded-xl p-4 text-sm">
        <p className="font-semibold text-gray-800 mb-1">
          AI 요약 코멘트
        </p>
        <p className="text-gray-600">
          고정 거래처 비중이 안정적이며,
          전년 대비 성장 여력이 충분합니다.
          상위 거래처 집중 관리 시
          연간 목표 달성 가능성이 높습니다.
        </p>
      </div>
    </div>
  );
}

function YearlySummaryChart({ rows = [], year, setYear, onAI }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const isFresh = (r) =>
    String(r.거래처명 || "").includes("후레쉬물류");

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const summary = months.map((m) => {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const list = rows.filter((r) =>
      (r.상차일 || "").startsWith(key)
    );

    const sale = list.reduce((a, r) => a + toInt(r.청구운임), 0);
    const driver = list.reduce((a, r) => a + toInt(r.기사운임), 0);
    const profit = sale - driver;

    const pureList = list.filter((r) => !isFresh(r));
    const pureSale = pureList.reduce(
      (a, r) => a + toInt(r.청구운임),
      0
    );
    const pureDriver = pureList.reduce(
      (a, r) => a + toInt(r.기사운임),
      0
    );
    const pureProfit = pureSale - pureDriver;

    const freshList = list.filter((r) => isFresh(r));
    const freshSale = freshList.reduce(
      (a, r) => a + toInt(r.청구운임),
      0
    );
    const freshDriver = freshList.reduce(
      (a, r) => a + toInt(r.기사운임),
      0
    );
    const freshProfit = freshSale - freshDriver;

    return {
      month: `${m}월`,
      sale,
      profit,
      rate: sale ? (profit / sale) * 100 : 0,
      pureSale,
      pureProfit,
      pureRate: pureSale ? (pureProfit / pureSale) * 100 : 0,
      freshSale,
      freshProfit,
      freshRate: freshSale ? (freshProfit / freshSale) * 100 : 0,
    };
  });

  const total = summary.reduce(
    (a, r) => ({
      sale: a.sale + r.sale,
      profit: a.profit + r.profit,
      pureSale: a.pureSale + r.pureSale,
      pureProfit: a.pureProfit + r.pureProfit,
      freshSale: a.freshSale + r.freshSale,
      freshProfit: a.freshProfit + r.freshProfit,
    }),
    { sale: 0, profit: 0, pureSale: 0, pureProfit: 0, freshSale: 0, freshProfit: 0 }
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">
          {year}년 월별 매출 · 수익 · 수익률 요약
        </h3>

        <div className="flex items-center gap-2">
          {/* 🤖 AI 버튼 */}
          <button
            onClick={() => onAI("summary")}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-500"
          >
            요약
          </button>

          <button
            onClick={() => onAI("suggest")}
            className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs hover:bg-emerald-200"
          >
            제안
          </button>

          <button
            onClick={() => onAI("report")}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs hover:bg-gray-200"
          >
            보고서
          </button>


          {/* 연도 선택 */}
          <select
            className="border rounded-lg px-2 py-1 text-sm ml-1"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from(
              new Set(
                rows
                  .map((r) => r.상차일?.slice(0, 4))
                  .filter(Boolean)
              )
            )
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={Number(y)}>
                  {y}년
                </option>
              ))}
          </select>
        </div>
      </div>
      <table className="w-full text-sm border-collapse text-center">
        <thead>
          {/* ===== 1줄: 그룹 헤더 ===== */}
          <tr className="bg-gray-100 text-gray-700 text-sm">
            <th rowSpan={2} className="border p-2">월</th>

            <th colSpan={3} className="border p-2 bg-indigo-50">
              전체 매출
            </th>

            <th colSpan={3} className="border p-2 bg-emerald-50">
              순수 운송 (후레쉬 제외)
            </th>

            <th colSpan={3} className="border p-2 bg-rose-50">
              후레쉬 물류
            </th>
          </tr>

          {/* ===== 2줄: 실제 컬럼 ===== */}
          <tr className="bg-gray-50 text-gray-600 text-xs">
            <th className="border p-2">매출</th>
            <th className="border p-2">수익</th>
            <th className="border p-2">수익률</th>

            <th className="border p-2">매출</th>
            <th className="border p-2">수익</th>
            <th className="border p-2">수익률</th>

            <th className="border p-2">매출</th>
            <th className="border p-2">수익</th>
            <th className="border p-2">수익률</th>
          </tr>
        </thead>

        <tbody>
          {summary.map((r) => (
            <tr key={r.month}>
              <td className="border p-2 font-semibold">{r.month}</td>
              <td className="border p-2 text-indigo-600">
                {r.sale.toLocaleString()}원
              </td>
              <td className="border p-2 text-emerald-600">
                {r.profit.toLocaleString()}원
              </td>
              <td className="border p-2">
                {r.rate.toFixed(1)}%
              </td>
              <td className="border p-2 text-indigo-600">
                {r.pureSale.toLocaleString()}원
              </td>
              <td className="border p-2 text-emerald-600">
                {r.pureProfit.toLocaleString()}원
              </td>
              <td className="border p-2">
                {r.pureRate.toFixed(1)}%
              </td>
              <td className="border p-2 text-rose-600">
                {r.freshSale.toLocaleString()}원
              </td>
              <td className="border p-2 text-rose-600">
                {r.freshProfit.toLocaleString()}원
              </td>
              <td className="border p-2">
                {r.freshRate.toFixed(1)}%
              </td>
            </tr>
          ))}

          <tr className="font-bold bg-gray-50">
            <td className="border p-2">합계</td>
            <td className="border p-2 text-indigo-700">
              {total.sale.toLocaleString()}원
            </td>
            <td className="border p-2 text-emerald-700">
              {total.profit.toLocaleString()}원
            </td>
            <td className="border p-2">
              {total.sale
                ? ((total.profit / total.sale) * 100).toFixed(1)
                : "0.0"}
              %
            </td>
            <td className="border p-2 text-indigo-700">
              {total.pureSale.toLocaleString()}원
            </td>
            <td className="border p-2 text-emerald-700">
              {total.pureProfit.toLocaleString()}원
            </td>
            <td className="border p-2">
              {total.pureSale
                ? ((total.pureProfit / total.pureSale) * 100).toFixed(1)
                : "0.0"}
              %
            </td>
            <td className="border p-2 text-rose-600">
              {total.freshSale.toLocaleString()}원
            </td>
            <td className="border p-2 text-rose-600">
              {total.freshProfit.toLocaleString()}원
            </td>
            <td className="border p-2">
              {total.freshSale
                ? ((total.freshProfit / total.freshSale) * 100).toFixed(1)
                : "0.0"}
              %
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ClientInsight({ rows = [] }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  if (!rows.length) {
    return (
      <div className="text-sm text-gray-400 text-center py-6">
        데이터가 없습니다
      </div>
    );
  }

  const sale = rows.reduce(
    (a, r) => a + toInt(r.청구운임),
    0
  );
  const driver = rows.reduce(
    (a, r) => a + toInt(r.기사운임),
    0
  );
  const profit = sale - driver;
  const rate = sale === 0 ? 0 : (profit / sale) * 100;

  return (
    <div className="bg-gray-50 border rounded-xl p-4 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">매출</span>
        <span className="font-semibold">
          {sale.toLocaleString()}원
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">운반비</span>
        <span>
          {driver.toLocaleString()}원
        </span>
      </div>
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-gray-700">수익</span>
        <span className="text-emerald-600">
          {profit.toLocaleString()}원
        </span>
      </div>
      <div className="text-xs text-gray-500 text-right">
        수익률 {rate.toFixed(1)}%
      </div>
    </div>
  );
}
function SettlementDetailPopup({ client, rows = [], onClose }) {
  const toInt = (v) =>
    parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const sale = rows.reduce(
    (a, r) => a + toInt(r.청구운임),
    0
  );
  const driver = rows.reduce(
    (a, r) => a + toInt(r.기사운임),
    0
  );
  const profit = sale - driver;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-2xl w-[420px] max-h-[80vh] overflow-auto p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-800">
            거래처 상세 · {client}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span>총 매출</span>
            <span className="font-semibold">
              {sale.toLocaleString()}원
            </span>
          </div>
          <div className="flex justify-between">
            <span>총 운반비</span>
            <span>
              {driver.toLocaleString()}원
            </span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>총 수익</span>
            <span className="text-emerald-600">
              {profit.toLocaleString()}원
            </span>
          </div>
        </div>

        <table className="w-full text-xs border-collapse text-center">
          <thead className="bg-gray-50">
            <tr>
              <th className="border p-1">상차일</th>
              <th className="border p-1">매출</th>
              <th className="border p-1">수익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border p-1">{r.상차일}</td>
                <td className="border p-1">
                  {toInt(r.청구운임).toLocaleString()}
                </td>
                <td className="border p-1 text-emerald-600">
                  {(toInt(r.청구운임) - toInt(r.기사운임)).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ===================== DispatchApp.jsx (PART 6/8 — END) =====================

// ===================== DispatchApp.jsx (PART 7/8 — 거래처명/차량종류 필터 추가 완성) =====================
function UnassignedStatus({ dispatchData, drivers = [] }) {
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
  const [openMemos, setOpenMemos] = React.useState(new Set());
  const [quickAssignOpen, setQuickAssignOpen] = React.useState(false);
  // 🚚 차량 / 기사 자동매칭
  const [vehicleNo, setVehicleNo] = React.useState("");
  const [driverName, setDriverName] = React.useState("");
  const [driverPhone, setDriverPhone] = React.useState("");

  const [matchedDriver, setMatchedDriver] = React.useState(null);
  const [newDriverPopup, setNewDriverPopup] = React.useState(false);
  const [selectedOrder, setSelectedOrder] = React.useState(null);
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
    "순번", "등록일", "상차일", "상차시간", "하차시간", "거래처명",
    "상차지명", "상차지주소", "하차지명", "하차지주소",
    "차량종류", "차량톤수", "화물내용", "배차상태", "메모",
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
  // 🚚 차량번호 정규화
  function normalizeVehicleNo(v = "") {
    return String(v)
      .toUpperCase()
      .replace(/[\s\-]/g, "")   // 공백 + 하이픈 제거
      .replace(/[^0-9A-Z가-힣]/g, ""); // 기타 문자 제거
  }

  // 🚚 차량번호로 기사 찾기
  function findDriverByVehicleNo(vehicleNo) {
    const key = normalizeVehicleNo(vehicleNo);
    if (!key) return null;

    return drivers.find(d => {
      const candidates = [
        d.차량번호,
        d.carNo,
        d.vehicle,
        d.차량,

        // 🔥 중첩 구조 대응
        d.car?.number,
        d.car?.차량번호,
        d.차량정보?.차량번호,
        d.vehicleInfo?.number,
      ];

      return candidates.some(v =>
        normalizeVehicleNo(v) === key
      );
    }) || null;
  }


  const headBase =
    "border bg-gray-100 text-center text-sm font-semibold px-2 py-2 whitespace-nowrap";
  const cellBase =
    "border text-center px-2 py-1 whitespace-nowrap align-middle";

  return (
    <div className="relative">
      {/* 🔔 토스트 */}
      {toast && (
        <div
          className={`fixed right-5 top-20 z-50 px-4 py-2 rounded shadow ${toast.type === "ok"
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
                    onClick={() => {
                      if (deleteMode) return;

                      setSelectedOrder(r);

                      // 🔥 이전 상태 완전 초기화
                      setVehicleNo("");
                      setDriverName("");
                      setDriverPhone("");
                      setMatchedDriver(null);
                      setNewDriverPopup(false);

                      setQuickAssignOpen(true);
                    }}

                    className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} cursor-pointer hover:bg-indigo-50`}
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
                    <td className={`${cellBase} max-w-[260px]`}>
                      {r.메모 && r.메모.length > 40 ? (
                        openMemos.has(r._id) ? (
                          <span className="whitespace-pre-wrap">
                            {r.메모}{" "}
                            <button
                              onClick={() =>
                                setOpenMemos(prev => {
                                  const next = new Set(prev);
                                  next.delete(r._id);
                                  return next;
                                })
                              }
                              className="text-blue-600 underline text-xs ml-1"
                            >
                              접기
                            </button>
                          </span>
                        ) : (
                          <span>
                            {r.메모.slice(0, 40)}...
                            <button
                              onClick={() =>
                                setOpenMemos(prev => new Set(prev).add(r._id))
                              }
                              className="text-blue-600 underline text-xs ml-1"
                            >
                              더보기
                            </button>
                          </span>
                        )
                      ) : (
                        r.메모 || ""
                      )}
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {/* ✅ 여기부터 빠른 배차 팝업 */}
      {quickAssignOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-[520px] p-6">
            <h3 className="text-lg font-bold mb-4">
              🚚 빠른 배차 등록
            </h3>

            <div className="text-sm mb-3 text-gray-600">
              <b>{selectedOrder.거래처명}</b> /
              {selectedOrder.상차지명} → {selectedOrder.하차지명}
            </div>

            <input
              placeholder="차량번호"
              value={vehicleNo}
              onChange={(e) => {
                const v = e.target.value;
                setVehicleNo(v);

                const found = findDriverByVehicleNo(v);

                if (found) {
                  setMatchedDriver(found);
                  setDriverName(found.name || found.기사명 || "");
                  setDriverPhone(found.phone || found.전화번호 || "");
                  setNewDriverPopup(false);
                } else {
                  setMatchedDriver(null);
                  setDriverName("");
                  setDriverPhone("");
                  setNewDriverPopup(normalizeVehicleNo(v).length >= 6);
                }

              }}
              className="border p-2 rounded w-full mb-2"
            />


            <input
              placeholder="기사명"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="border p-2 rounded w-full mb-2"
            />

            <input
              placeholder="기사 연락처"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              className="border p-2 rounded w-full mb-2"
            />
            {matchedDriver && (
              <div className="text-xs text-emerald-600 mb-2">
                ✔ 기존 등록 차량 / 기사 자동 매칭됨
              </div>
            )}

            {!matchedDriver && newDriverPopup && (
              <div className="text-xs text-amber-600 mb-2">
                ➕ 등록되지 않은 차량입니다. 신규 기사로 등록됩니다.
              </div>
            )}
            <input
              placeholder="지불운임"
              className="border p-2 rounded w-full mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQuickAssignOpen(false)}
                className="px-4 py-2 border rounded"
              >
                취소
              </button>
              <button
                onClick={() => {
                  // 👉 patchDispatch 여기서 호출
                  setQuickAssignOpen(false);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded"
              >
                배차완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

// ===================== DispatchApp.jsx (PART 7/8) — END =====================

// ===================== DispatchApp.jsx (PART 8/8) — 거래명세서 + 미수금관리(월집계/토글/선택/전체정산) — START =====================
function ClientSettlement({ dispatchData, clients = [], setClients }) {
  // ---------------- 공통 유틸 ----------------
  const todayStr8 = () => new Date().toISOString().slice(0, 10);
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
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
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
    const base = list.filter(r => (r.배차상태 || "") === "배차완료" && (r.거래처명 || "") === selClient);

    // 01..12 생성
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
    return months.map(mm => {
      const yyyymm = `${THIS_YEAR}-${mm}`;
      const rows = base.filter(r => String(r.상차일 || "").startsWith(yyyymm));
      const total = rows.reduce((s, r) => s + toInt(r.청구운임), 0);
      const allDone = rows.length > 0 && rows.every(r => r.정산상태 && r.정산상태[yyyymm] === "정산완료");
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
    const amt = monthRows.reduce((s, r) => s + toInt(r.총청구금액), 0);
    return { cnt, amt };
  }, [monthRows]);

  // 상태 배지
  const StatusBadge = ({ status }) => (
    <span className={`px-2 py-1 rounded text-xs ${status === "정산완료" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
      {status === "정산완료" ? "🟩 정산완료" : "🟥 미정산"}
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
    const rows = monthRows.map((row, idx) => ({
      선택: selectedMonths.has(row.yyyymm) ? "Y" : "",
      순번: idx + 1,
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
          className={`px-4 py-2 rounded border ${tab === "invoice" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          onClick={() => setTab("invoice")}
        >
          거래명세서
        </button>
        <button
          className={`px-4 py-2 rounded border ${tab === "unsettledMonth" ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          onClick={() => setTab("unsettledMonth")}
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
                className={`px-3 py-2 rounded text-white ${selectedMonths.size
                  ? "bg-emerald-600"
                  : "bg-emerald-600/50 cursor-not-allowed"
                  }`}
                disabled={!selectedMonths.size}
              >
                선택 정산완료
              </button>
              <button
                onClick={settleAll}
                className={`px-3 py-2 rounded text-white ${monthRows.length
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
    try { return typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0, 10); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const toInt = (v) => { const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10); return isNaN(n) ? 0 : n; };
  const won = (n) => (toInt(n)).toLocaleString();
  const head = typeof headBase === "string" ? headBase : "px-3 py-2 border";
  const cell = typeof cellBase === "string" ? cellBase : "px-3 py-2 border text-center";
  const input = typeof inputBase === "string" ? inputBase : "border rounded px-2 py-1";
  // 🔒 지급관리 임시 비활성화 플래그
  const PAYMENT_DISABLED = true;

  // ---------- Firestore ----------
  const patchDispatchDirect = async (id, patch) => {
    // 🔒 지급관리 비활성화 상태에서는 저장 금지
    if (PAYMENT_DISABLED) {
      console.warn("지급관리 비활성화 상태: 저장 차단", { id, patch });
      return;
    }

    if (!id || !patch) return;
    await setDoc(doc(db, COLL.dispatch, id), patch, { merge: true });
  };

  // ---------- 지급일 공통 달력 ----------
  const [selectedPayDate, setSelectedPayDate] = React.useState(todayStr9());
  const [memoPopup, setMemoPopup] = useState({ open: false, text: "" });

  // ---------- 드롭다운 옵션 ----------
  const PAY_METHODS = ["계산서", "선불", "착불"];
  const DISPATCH_METHODS = ["24시", "직접배차", "인성"];

  // 지급방식 / 배차방식 필터 추가
  const [payMethodFilter, setPayMethodFilter] = useState("전체");
  const [dispatchMethodFilter, setDispatchMethodFilter] = useState("전체");

  // 거래처 옵션
  const clientOptions = useMemo(() => {
    const set = new Set((clients || []).map(c => c.거래처명).filter(Boolean));
    if (set.size === 0) (dispatchData || []).forEach(r => r.거래처명 && set.add(r.거래처명));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [clients, dispatchData]);

  // 최근 차량번호 datalist
  const recentCarNos = useMemo(() => {
    const rows = (dispatchData || [])
      .filter(r => r.차량번호)
      .sort((a, b) => (b.상차일 || "").localeCompare(a.상차일 || ""));
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
    (drivers || []).forEach(d => {
      const car = String(d.차량번호 || "").trim();
      if (car) m.set(car, { 이름: d.이름 || "", 전화번호: d.전화번호 || "" });
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
    () => Array.isArray(dispatchData) ? dispatchData.filter(r => (r.배차상태 || "") === "배차완료") : [],
    [dispatchData]
  );

  const filtered = useMemo(() => {
    let rows = [...base];

    if (statusFilter !== "전체")
      rows = rows.filter(r => (r.지급상태 || "지급중") === statusFilter);

    if (payStart) rows = rows.filter(r => (r.지급일 || "") >= payStart);
    if (payEnd) rows = rows.filter(r => (r.지급일 || "") <= payEnd);

    if (loadStart) rows = rows.filter(r => (r.상차일 || "") >= loadStart);
    if (loadEnd) rows = rows.filter(r => (r.상차일 || "") <= loadEnd);

    const car = carNoQ.trim().toLowerCase();
    const name = nameQ.trim().toLowerCase();
    const client = clientQ.trim().toLowerCase();

    if (car) rows = rows.filter(r => String(r.차량번호 || "").toLowerCase().includes(car));
    if (name) rows = rows.filter(r => String(r.이름 || "").toLowerCase().includes(name));
    if (client) rows = rows.filter(r => String(r.거래처명 || "").toLowerCase().includes(client));

    // 지급방식/배차방식 필터
    if (payMethodFilter !== "전체")
      rows = rows.filter(r => r.지급방식 === payMethodFilter);

    if (dispatchMethodFilter !== "전체")
      rows = rows.filter(r => r.배차방식 === dispatchMethodFilter);

    rows.sort(
      (a, b) =>
        (a.상차일 || "").localeCompare(b.상차일 || "") ||
        (toInt(a.순번) - toInt(b.순번))
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
      } catch { }
    }
    if (typeof openRegisterDriverModal === "function") {
      try {
        openRegisterDriverModal({
          차량번호: carNo,
          이름: row?.이름 || "",
          전화번호: row?.전화번호 || "",
        });
        return;
      } catch { }
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
        "상차일", "거래처명", "상차지명", "하차지명",
        "차량번호", "이름", "전화번호",
        "지급방식", "배차방식",
        "청구운임", "기사운임",
        "지급일", "메모"
      ];

      keys.forEach(k => {
        const orig = (k === "청구운임" || k === "기사운임")
          ? String(r[k] || "")
          : (r[k] || "");
        const val = cur[k] ?? "";

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
    const sale = filtered.reduce((s, r) => s + toInt(r.청구운임), 0);
    const driver = filtered.reduce((s, r) => s + toInt(r.기사운임), 0);
    const fee = sale - driver;
    const done = filtered.filter(r => (r.지급상태 || "지급중") === "지급완료").length;
    return { cnt, sale, driver, fee, done };
  }, [filtered]);

  // ---------- 엑셀 다운로드 ----------
  const downloadExcel = () => {
    if (!filtered.length) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    const rows = filtered.map((r, i) => ({
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
  const roText = (v) => <span className="whitespace-pre">{String(v ?? "")}</span>;
  const editableCls = "bg-yellow-50";
  if (PAYMENT_DISABLED) {
    return (
      <div className="p-6 border rounded bg-gray-50 text-center">
        <h2 className="text-lg font-bold mb-2 text-gray-700">
          지급관리
        </h2>
        <p className="text-sm text-gray-500">
          현재 사용하지 않는 메뉴입니다.<br />
          추후 활성화 예정입니다.
        </p>
      </div>
    );
  }
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
            onChange={(e) => setStatusFilter(e.target.value)}
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
            onChange={(e) => setPayMethodFilter(e.target.value)}
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
            onChange={(e) => setDispatchMethodFilter(e.target.value)}
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
            onChange={(e) => setPayStart(e.target.value)}
          />
        </div>

        {/* 지급일 종료 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급일 종료</label>
          <input type="date" className="border p-2 rounded"
            value={payEnd}
            onChange={(e) => setPayEnd(e.target.value)}
          />
        </div>

        {/* 상차일 필터 */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">상차일 시작</label>
          <input type="date" className="border p-2 rounded"
            value={loadStart}
            onChange={(e) => setLoadStart(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">상차일 종료</label>
          <input type="date" className="border p-2 rounded"
            value={loadEnd}
            onChange={(e) => setLoadEnd(e.target.value)}
          />
        </div>

        {/* 검색 */}
        <input className="border p-2 rounded" placeholder="차량번호"
          value={carNoQ} onChange={(e) => setCarNoQ(e.target.value)}
        />
        <input className="border p-2 rounded" placeholder="기사명"
          value={nameQ} onChange={(e) => setNameQ(e.target.value)}
        />
        <input className="border p-2 rounded" placeholder="거래처명"
          value={clientQ} onChange={(e) => setClientQ(e.target.value)}
        />

        {/* 필터 초기화 */}
        <button
          onClick={() => {
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
              onChange={(e) => setSelectedPayDate(e.target.value)}
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

          <button onClick={() => bulkPayDone(Array.from(selectedIds))} className="px-3 py-2 rounded bg-emerald-600 text-white">선택 지급</button>
          <button onClick={() => bulkPayUndone(Array.from(selectedIds))} className="px-3 py-2 rounded bg-red-600 text-white">선택 미지급</button>
          <button onClick={() => bulkPayDone(filtered.map(r => r._id))} className="px-3 py-2 rounded bg-emerald-700 text-white">전체 지급</button>
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
                        onChange={() => toggleOne(r._id)}
                      />
                    </td>

                    {/* 순번 */}
                    <td className={cell}>{r.순번 || i + 1}</td>

                    {/* 상차일 */}
                    <td className={cell}>
                      {!editMode ? roText(r.상차일 || "") : (
                        <input type="date" className={`${input} ${editableCls}`}
                          value={d.상차일 ?? ""}
                          onChange={(e) => setD(r._id, "상차일", e.target.value)}
                        />
                      )}
                    </td>

                    {/* 지급상태 (앞으로 이동) */}
                    <td className={cell}>
                      <button
                        onClick={() => togglePayStatus(r)}
                        className={`px-2 py-1 rounded text-sm ${(r.지급상태 || "지급중") === "지급완료"
                          ? "bg-emerald-600 text-white"
                          : "bg-blue-600 text-white"
                          }`}
                      >
                        {(r.지급상태 || "지급중") === "지급완료" ? "✅ 지급완료" : "🔵 지급중"}
                      </button>
                    </td>

                    {/* 지급일 (앞으로 이동) */}
                    <td className={cell}>
                      {!editMode ? roText(r.지급일 || "") : (
                        <input type="date" className={`${input} ${editableCls}`}
                          value={d.지급일 ?? ""}
                          onChange={(e) => setD(r._id, "지급일", e.target.value)}
                        />
                      )}
                    </td>

                    {/* 거래처명 */}
                    <td className={cell}>
                      {!editMode ? roText(r.거래처명 || "") : (
                        <select className={`${input} ${editableCls}`}
                          value={d.거래처명 ?? ""}
                          onChange={(e) => setD(r._id, "거래처명", e.target.value)}
                        >
                          <option value="">선택</option>
                          {clientOptions.map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 상차지명 */}
                    <td className={cell}>
                      {!editMode ? roText(r.상차지명 || "") : (
                        <input className={`${input} ${editableCls}`}
                          value={d.상차지명 ?? ""}
                          onChange={(e) => setD(r._id, "상차지명", e.target.value)}
                        />
                      )}
                    </td>

                    {/* 하차지명 */}
                    <td className={cell}>
                      {!editMode ? roText(r.하차지명 || "") : (
                        <input className={`${input} ${editableCls}`}
                          value={d.하차지명 ?? ""}
                          onChange={(e) => setD(r._id, "하차지명", e.target.value)}
                        />
                      )}
                    </td>

                    {/* 차량번호 */}
                    <td className={cell}>
                      {!editMode ? roText(r.차량번호 || "") : (
                        <>
                          <input
                            list="carNos-list"
                            className={`${input} ${editableCls}`}
                            value={d.차량번호 ?? ""}
                            onChange={(e) => setD(r._id, "차량번호", e.target.value)}
                            onKeyDown={onCarKeyDown(r)}
                          />
                          <datalist id="carNos-list">
                            {recentCarNos.map(cn => (
                              <option key={cn} value={cn} />
                            ))}
                          </datalist>
                        </>
                      )}
                    </td>

                    {/* 이름 */}
                    <td className={cell}>
                      {roText(editMode ? (d.이름 ?? r.이름) : (r.이름 || ""))}
                    </td>

                    {/* 전화번호 */}
                    <td className={cell}>
                      {roText(editMode ? (d.전화번호 ?? r.전화번호) : (r.전화번호 || ""))}
                    </td>

                    {/* 청구운임 */}
                    <td className={cell}>
                      {!editMode ? roText(won(r.청구운임)) : (
                        <input className={`${input} text-right ${editableCls}`}
                          value={d.청구운임 ?? ""}
                          onChange={(e) => setD(r._id, "청구운임", e.target.value.replace(/[^\d]/g, ""))}
                        />
                      )}
                    </td>

                    {/* 기사운임 */}
                    <td className={cell}>
                      {!editMode ? roText(won(r.기사운임)) : (
                        <input className={`${input} text-right ${editableCls}`}
                          value={d.기사운임 ?? ""}
                          onChange={(e) => setD(r._id, "기사운임", e.target.value.replace(/[^\d]/g, ""))}
                        />
                      )}
                    </td>

                    {/* 수수료 */}
                    <td className={`${cell} text-blue-700 font-semibold`}>
                      {won(fee)}
                    </td>

                    {/* 지급방식 */}
                    <td className={cell}>
                      {!editMode ? roText(r.지급방식 || "") : (
                        <select className={`${input} ${editableCls}`}
                          value={d.지급방식 ?? ""}
                          onChange={(e) => setD(r._id, "지급방식", e.target.value)}
                        >
                          <option value="">선택</option>
                          {PAY_METHODS.map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 배차방식 */}
                    <td className={cell}>
                      {!editMode ? roText(r.배차방식 || "") : (
                        <select className={`${input} ${editableCls}`}
                          value={d.배차방식 ?? ""}
                          onChange={(e) => setD(r._id, "배차방식", e.target.value)}
                        >
                          <option value="">선택</option>
                          {DISPATCH_METHODS.map(o => (
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
                          onChange={(e) => setD(r._id, "메모", e.target.value)}
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
  const [selected, setSelected] = React.useState(new Set());
  const [newForm, setNewForm] = React.useState({
    차량번호: "",
    이름: "",
    전화번호: "",
    메모: "",
  });

  // ===================== 검색 정규화 (⚠ 반드시 위에 있어야 함) =====================
  const norm = (s = "") =>
    String(s).toLowerCase().replace(/\s+/g, "");

  // ===================== 검색 필터 =====================
  const filtered = React.useMemo(() => {
    if (!q.trim()) return drivers;
    const nq = norm(q);
    return drivers.filter((r) =>
      ["차량번호", "이름", "전화번호", "메모"].some((k) =>
        norm(r[k] || "").includes(nq)
      )
    );
  }, [drivers, q]);

  // ===================== 페이지네이션 =====================
  const [page, setPage] = React.useState(1);
  const perPage = 100;

  React.useEffect(() => {
    setPage(1);
  }, [q]);

  const paged = React.useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / perPage);
  // =====================================================

  // ===================== 선택 =====================
  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    const allIds = filtered
      .map((r) => r.id)
      .filter(Boolean);
    if (selected.size === allIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  // ===================== 인라인 수정 =====================
  const handleBlur = async (row, key, val) => {
    const oldId = row.id; // ⭐ Firestore 문서 ID
    if (!oldId) {
      alert("문서 ID가 없어 수정/삭제할 수 없습니다.");
      return;
    }
const handleBlur = async (row, key, val) => {
  const oldId = row.id;
  if (!oldId) {
    alert("문서 ID가 없어 수정/삭제할 수 없습니다.");
    return;
  }

  await upsertDriver({
    ...row,
    [key]: val,
  });
};

    // 일반 필드 수정
    await upsertDriver({
      ...row,
      [key]: val,
    });
  };

  // ===================== 신규 추가 =====================
  const addNew = async () => {
    const 차량번호 = (newForm.차량번호 || "").replace(/\s+/g, "");
    if (!차량번호) return alert("차량번호는 필수입니다.");
    await upsertDriver({
  id: crypto.randomUUID(), // ✅ 여기
  차량번호,
  이름: newForm.이름,
  전화번호: newForm.전화번호,
  메모: newForm.메모,
});
    setNewForm({ 차량번호: "", 이름: "", 전화번호: "", 메모: "" });
    alert("등록 완료");
  };

  // ===================== 선택 삭제 =====================
  const removeSelected = async () => {
    if (!selected.size) return alert("선택된 항목이 없습니다.");
    if (!window.confirm(`${selected.size}건 삭제할까요?`)) return;

    for (const id of selected) {
      await removeDriver(id);
    }
    setSelected(new Set());
    alert("삭제 완료");
  };

  // ===================== 엑셀 업로드 =====================
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
          const 차량번호 = String(
            r.차량번호 || r["차량 번호"] || r["차량번호 "] || ""
          ).replace(/\s+/g, "");
          if (!차량번호) continue;

          await upsertDriver({
  id: crypto.randomUUID(), // ✅ 여기
  차량번호,
  이름: r.이름 || r["기사명"] || "",
  전화번호: r.전화번호 || r["전화"] || r["휴대폰"] || "",
  메모: r.메모 || r["비고"] || "",
});

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

  // ===================== 스타일 =====================
  const head =
    "border px-2 py-1 bg-slate-100 text-slate-700 text-xs font-semibold text-center whitespace-nowrap";
  const cell =
    "border px-2 py-[2px] text-sm text-slate-800 text-center whitespace-nowrap align-middle";
  const input =
    inputBase ||
    "border px-1 py-[2px] text-sm rounded-sm w-28 text-center";

  // ===================== UI =====================
  return (
    <div>
      <h2 className="text-lg font-bold mb-3">기사관리</h2>

      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="border p-2 rounded w-64"
          placeholder="검색 (차량번호/이름/전화/메모)"
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
          onClick={removeSelected}
          className="px-3 py-1 rounded bg-red-600 text-white text-sm"
        >
          선택삭제
        </button>
      </div>

      {/* 신규 등록 */}
      <div className="flex items-end gap-2 mb-4 bg-slate-50 px-2 py-1.5 rounded-md border">
        <input
          className="border px-2 py-1 rounded text-sm w-40"
          placeholder="차량번호*"
          value={newForm.차량번호}
          onChange={(e) =>
            setNewForm((p) => ({ ...p, 차량번호: e.target.value }))
          }
        />
        <input
          className="border px-2 py-1 rounded text-sm w-28"
          placeholder="이름"
          value={newForm.이름}
          onChange={(e) =>
            setNewForm((p) => ({ ...p, 이름: e.target.value }))
          }
        />
        <input
          className="border px-2 py-1 rounded text-sm w-36"
          placeholder="전화번호"
          value={newForm.전화번호}
          onChange={(e) =>
            setNewForm((p) => ({ ...p, 전화번호: e.target.value }))
          }
        />
        <input
          className="border px-2 py-1 rounded text-sm w-64"
          placeholder="메모"
          value={newForm.메모}
          onChange={(e) =>
            setNewForm((p) => ({ ...p, 메모: e.target.value }))
          }
        />
        <button
          onClick={addNew}
          className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm"
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
                <input
                  type="checkbox"
                  onChange={toggleAll}
                  checked={
                    filtered.length > 0 &&
                    selected.size === filtered.length
                  }
                />
              </th>
              {["차량번호", "이름", "전화번호", "메모", "삭제"].map((h) => (
                <th key={h} className={head}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  className="text-center text-gray-500 py-6"
                  colSpan={6}
                >
                  표시할 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              paged.map((r, i) => {
                const docId = r.id;
                if (!docId) return null;

                return (
                  <tr key={`${docId}_${i}`}>
                    <td className={cell}>
                      <input
                        type="checkbox"
                        checked={selected.has(docId)}
                        onChange={() => toggleOne(docId)}
                      />
                    </td>

                    <td className={cell}>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) =>
                          handleBlur(
                            r,
                            "차량번호",
                            e.currentTarget.innerText.trim()
                          )
                        }
                      >
                        {r.차량번호 || "-"}
                      </span>
                    </td>

                    <td className={cell}>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) =>
                          handleBlur(r, "이름", e.currentTarget.innerText)
                        }
                      >
                        {r.이름 || "-"}
                      </span>
                    </td>

                    <td className={cell}>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) =>
                          handleBlur(
                            r,
                            "전화번호",
                            e.currentTarget.innerText.trim()
                          )
                        }
                      >
                        {r.전화번호 || "-"}
                      </span>
                    </td>

                    <td className={cell}>
                      <input
                        className={`${input} w-48 text-left`}
                        defaultValue={r.메모 || ""}
                        onBlur={(e) =>
                          handleBlur(r, "메모", e.target.value)
                        }
                      />
                    </td>

                    <td className={cell}>
                      <button
                        className="px-2 py-[2px] text-xs border border-red-400 text-red-600 rounded"
                        onClick={() => {
                          if (
                            window.confirm("삭제하시겠습니까?")
                          ) {
                            removeDriver(docId);
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

      {/* 페이지 버튼 */}
      <div className="flex items-center justify-center gap-4 mt-4 text-sm">
        <button
          className="px-4 py-1 border rounded"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ◀ 이전
        </button>
        <span>
          {page} / {totalPages || 1}
        </span>
        <button
          className="px-4 py-1 border rounded"
          disabled={page === totalPages || totalPages === 0}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
  // 🔧 주소 정규화 (ID / 중복판단 / 저장 전부 공통)
  const normalizePlace = (s = "") =>
    s
      .toString()
      .normalize("NFC")                      // ★ 유니코드 정규화
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // ★ zero-width 제거
      .replace(/[‐-‒–—−]/g, "-")             // ★ 모든 하이픈 통일
      .replace(/[０-９]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0xFEE0)
      )                                      // ★ 전각 숫자 → 반각
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^\w가-힣-]/g, "");

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
    const currentId = row.id;
    const correctId = row.차량번호;

    if (!currentId || !correctId) return;

    // ⭐ 이름/전화/메모 수정
    if (key !== "차량번호") {
      await upsertDriver({
        ...row,
        id: correctId,
        [key]: val,
      });

      // 🔥 과거 random ID 문서 제거
      if (currentId !== correctId) {
        await removeDriver(currentId);
      }
      return;
    }

    // ⭐ 차량번호 변경 = 문서 이동
    const newId = val.trim();
    if (!newId || newId === correctId) return;

    await upsertDriver({
      ...row,
      id: newId,
      차량번호: newId,
    });
    await removeDriver(currentId);
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
  // 🔑 주소 → Firestore 문서 ID (유일 키)
  const makePlaceId = (addr = "") =>
    normalizePlace(addr)
      .replace(/(대한민국|한국|경기도|서울특별시)/g, "")
      .slice(0, 120);
  const upsertPlace = async (row) => {
    const addr = row.주소?.trim();
    if (!addr) return;

    const id = makePlaceId(addr); // ★ 여기서 ID 고정

    console.log("UPSERT PLACE ID =", id); // ← 디버그용 (확인 후 제거 가능)

    await setDoc(
      doc(db, PLACES_COLL, id),
      {
        id,
        업체명: row.업체명 || "",
        주소: addr,
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
  // 🔥 중복 미리보기에서 선택한 삭제 대상
  const [dupSelected, setDupSelected] = React.useState(new Set());

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
      normalizePlace(s)
        .replace(/(대한민국|한국|경기도|서울특별시)/g, "")
        .replace(/[^\w가-힣]/g, "");

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

        // 1️⃣ 완전 동일
        const isSame = aAddr === bAddr;

        // 2️⃣ 포함 관계 (광역 ↔ 상세)
        const isInclude =
          aAddr.includes(bAddr) || bAddr.includes(aAddr);

        if (isSame || isInclude) {
          group.push(b);
          used.add(b.id);
        }
      }

      if (group.length > 1) {
        group.forEach((p) => used.add(p.id));

        group.sort((a, b) => {
          const aHasContact = !!(a.담당자 || a.담당자번호);
          const bHasContact = !!(b.담당자 || b.담당자번호);

          // 1️⃣ 담당자/번호 있는 쪽 우선
          if (aHasContact !== bHasContact) {
            return bHasContact - aHasContact;
          }

          // 2️⃣ 주소 길이 긴 쪽 우선
          return (b.주소 || "").length - (a.주소 || "").length;
        });

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
      const arr = [];
      const addrMap = new Map(); // 🔥 주소 ID 기준

      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const addr = (data.주소 || "").trim();
        if (!addr) return;

        const addrId = makePlaceId(addr);

        // 이미 같은 주소가 있으면 스킵 (과거 찌꺼기 제거)
        if (addrMap.has(addrId)) return;

        const row = {
          id: d.id,
          업체명: data.업체명 || "",
          주소: addr,
          담당자: data.담당자 || "",
          담당자번호: data.담당자번호 || data.연락처 || "",
          메모: data.메모 || "",
        };

        addrMap.set(addrId, row);
        arr.push(row);
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
    await upsertPlace({
      ...row,
      [key]: val,
    });
  };

  const addNewPlace = async () => {
    const 업체명 = (placeNewForm.업체명 || "").trim();
    if (!업체명) return alert("업체명은 필수입니다.");

    if (!placeNewForm.주소?.trim()) {
      alert("주소는 필수입니다.");
      return;
    }

    // 🔥 그냥 저장 (같은 주소면 덮어씀)
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
    if (dupSelected.size === 0) {
      alert("삭제할 중복 항목을 선택하세요.");
      return;
    }

    let removed = 0;

    for (const id of dupSelected) {
      await deleteDoc(doc(db, PLACES_COLL, id));
      removed++;
    }

    setDupSelected(new Set());
    alert(`선택한 중복 ${removed}건 삭제 완료`);
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
                              if (!r.id) {
                                alert("문서 ID가 없어 삭제할 수 없습니다.\n(과거 데이터)");
                                return;
                              }
                              if (window.confirm("삭제하시겠습니까?")) {
                                removeDriver(r.id);
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
                                  {isKeep ? (
                                    "유지"
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={dupSelected.has(p.id)}
                                      onChange={() => {
                                        setDupSelected((prev) => {
                                          const n = new Set(prev);
                                          n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                                          return n;
                                        });
                                      }}
                                    />
                                  )}
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