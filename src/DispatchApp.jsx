// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import FixedClients from "./FixedClients";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import AdminMenu from "./AdminMenu";
import { calcFare } from "./fareUtil";
import StandardFare from "./StandardFare";
const sendOrderTo24 = async (row) => {
  const res = await fetch("/api/send24", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
  });
  return await res.json();
};





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
   Firebase
--------------------------------------------------*/
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, collection, getDocs,
  onSnapshot, deleteDoc
} from "firebase/firestore";

/* -------------------------------------------------
   Firestore 사용자 등록/승인 확인
--------------------------------------------------*/
const registerUserInFirestore = async (user) => {
  if (!user) return false;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid, email: user.email, name: user.displayName || "이름없음",
      role: "user", approved: false, createdAt: serverTimestamp(), lastLogin: serverTimestamp(),
    });
    alert("회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
    await signOut(auth);
    window.location.reload();
    return false;
  } else {
    const data = snap.data();
    if (!data.approved) {
      alert("관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.");
      await signOut(auth);
      window.location.reload();
      return false;
    }
    await setDoc(ref, { lastLogin: serverTimestamp() }, { merge: true });
    return true;
  }
};

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

  const addDispatch = async (record)=>{
    const _id = record._id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    await setDoc(doc(db, COLL.dispatch, _id), { ...record, _id });
  };
  const patchDispatch = async (_id, patch)=>{
    if(!_id) return;
    await setDoc(doc(db, COLL.dispatch, _id), patch, { merge: true });
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
}  // ← ⭐ 이거 반드시 필요!!
/* -------------------------------------------------
   하차지 저장 (upsertPlace) — Firestore
--------------------------------------------------*/
const upsertPlace = async (place) => {
  try {
    if (!place?.업체명) return;

    const key =
      String(place.업체명).trim().replace(/\s+/g, "_") +
      "_" +
      String(place.주소 || "").trim().replace(/\s+/g, "_");

    await setDoc(doc(db, "places", key), {
      업체명: place.업체명 || "",
      주소: place.주소 || "",
      담당자: place.담당자 || "",
      담당자번호: place.담당자번호 || "",
    });

    console.log("🔥 하차지 저장됨:", place);
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

export {
  COMPANY, VEHICLE_TYPES, PAY_TYPES, DISPATCH_TYPES,
  headBase, cellBase, inputBase, todayStr
};

// ===================== DispatchApp.jsx (PART 1/8) — END =====================
// ===================== DispatchApp.jsx (PART 2/8) — START =====================
export default function DispatchApp() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // ❌ 삭제 (중복 선언 오류 원인)
  // const [dispatchData, setDispatchData] = useState([]);

  // ---------------- 로그인 상태 ----------------
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const ok = await registerUserInFirestore(u);
        if (ok) setUser(u);
      } else setUser(null);
    });
    return () => unsub();
  }, []);

  // ---------------- Firestore role 자동 로드 ----------------
  useEffect(() => {
    const loadRole = async () => {
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        localStorage.setItem("role", data.role || "user");
      }
    };
    loadRole();
  }, [user]);

  // ---------------- 권한 ----------------
  const role = localStorage.getItem("role") || "user";
const isTest = role === "test";
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

// 🔍 role 따라 표시 데이터 필터링
const dispatchDataFiltered = useMemo(() => {
  if (!dispatchData) return [];

  // admin & user → 전체 표시
  if (role !== "test") {
    return dispatchData;
  }

  // test 계정 → "테스트" 거래처만 표시
  return dispatchData.filter(o => o.거래처명 === "테스트");
}, [dispatchData, role]);


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

  // ---------------- 로그인 전 화면 ----------------
  if (!user)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <h1 className="text-xl mb-4 font-bold">회사 배차 시스템</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const email = e.target.email.value;
            const password = e.target.password.value;
            try {
              const result = await signInWithEmailAndPassword(auth, email, password);
              const ok = await registerUserInFirestore(result.user);
              if (!ok) return;
              alert("로그인 성공!");
              navigate("/app");
            } catch (err) {
              alert("로그인 실패: " + err.message);
            }
          }}
          className="flex flex-col gap-3 w-64"
        >
          <input name="email" type="email" placeholder="이메일" className="border p-2 rounded" required />
          <input name="password" type="password" placeholder="비밀번호" className="border p-2 rounded" required />
          <button type="submit" className="bg-blue-600 text-white py-2 rounded">로그인</button>
          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="text-blue-600 text-sm hover:underline mt-2"
          >
            회원가입 하러가기
          </button>
        </form>
      </div>
    );

  // ---------------- 메뉴 UI ----------------
  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">RUN25 배차프로그램</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-700 text-sm">{user?.email}</span>
          <button onClick={logout} className="bg-gray-300 px-3 py-1 rounded text-sm">
            로그아웃
          </button>
        </div>
      </header>

      <nav className="flex gap-2 mb-3 overflow-x-auto whitespace-nowrap">
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
              className={`px-3 py-2 rounded border text-sm ${
                isBlocked
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : isActive
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black"
              }`}
            >
              {m}
            </button>
          );
        })}
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
          <FixedClients drivers={drivers} upsertDriver={upsertDriver} />
        )}

        {menu === "매출관리" && role === "admin" && (
          <Settlement dispatchData={dispatchData} />
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


    const isAdmin = role === "admin";


    // ⭐ 여기 맨 위에 오도록
    const [clientQuery, setClientQuery] = React.useState("");
    const [isClientOpen, setIsClientOpen] = React.useState(false);
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
    // ===================== 하차지(placeRows) + 로컬(hachaPlaces_v1) 병합 =====================

    // 문자열 정규화(공백 제거 + 소문자)
    const normalizeKey = (s = "") =>
      String(s).toLowerCase().replace(/\s+/g, "");

    // Firestore + localStorage 통합 placeList 생성
    const placeList = React.useMemo(() => {
      const fromFirestore = Array.isArray(placeRows) ? placeRows : [];

      let fromLocal = [];
      try {
        fromLocal = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
      } catch {
        fromLocal = [];
      }

      // 공통 포맷 통일 함수
      const toRow = (p = {}) => ({
        업체명: p.업체명 || p.거래처명 || "",
        주소: p.주소 || "",
        담당자: p.담당자 || p.인수자 || "",
        담당자번호: p.담당자번호 || p.연락처 || "",
      });

      // 주소 + 업체명으로 중복제거
      const map = new Map();
      [...fromFirestore, ...fromLocal].forEach((raw) => {
        const row = toRow(raw);
        const key =
          normalizeKey(row.업체명 || "") + "|" + normalizeKey(row.주소 || "");
        if (!key.trim()) return;
        if (!map.has(key)) map.set(key, row);
      });

      const merged = Array.from(map.values());

      // 최신 합본을 localStorage에도 저장(테스트/배포 동일하게 유지)
      try {
        localStorage.setItem("hachaPlaces_v1", JSON.stringify(merged));
      } catch { }

      return merged;
    }, [placeRows]);

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
      "라보/다마스", "카고", "윙바디", "탑차", "냉장탑", "냉동탑", "오토바이", "기타"
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
      if (!q) return placeRows || [];
      return (placeRows || []).filter((p) =>
        norm(p.업체명 || "").includes(q)
      );
    }, [clientQuery, placeRows]);

    // 선택 시 상차지 자동 입력
    const applyClientSelect = (name) => {
      const p = (placeRows || []).find(
        (x) => norm(x.업체명 || "") === norm(name)
      );

      setForm((prev) => ({
        ...prev,
        거래처명: name,
        상차지명: name,               // ⭐ 상차지명 자동 입력
        상차지주소: p?.주소 || "",      // ⭐ 주소 자동 입력
        상차지담당자: p?.담당자 || "",
        상차지담당자번호: p?.담당자번호 || "",
      }));

      setClientQuery(name);
      setIsClientOpen(false);
    };



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
          전화번호: found.전화번호,
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
          전화번호: found.전화번호,
          배차상태: "배차완료",
        }));
      } else {
        const 이름 = prompt("신규 기사 이름:") || "";
        if (!이름) return;
        const 전화번호 = prompt("전화번호:") || "";
        upsertDriver?.({ 이름, 차량번호: clean, 전화번호 });
        alert("신규 기사 등록 완료!");
        setForm((p) => ({ ...p, 차량번호: clean, 이름, 전화번호, 배차상태: "배차완료" }));
      }
    };


    const nextSeq = () => Math.max(0, ...(dispatchData || []).map((r) => Number(r.순번) || 0)) + 1;

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

      const status = form.차량번호 && (form.이름 || form.전화번호) ? "배차완료" : "배차중";
      const moneyPatch = isAdmin ? {} : { 청구운임: "0", 기사운임: "0", 수수료: "0" };
      const rec = {
        ...form, ...moneyPatch,
        상차일: lockYear(form.상차일),
        하차일: lockYear(form.하차일),
        순번: nextSeq(),
        배차상태: status,
      };
      await addDispatch(rec);

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
      alert("등록되었습니다.");
      try { localStorage.removeItem("dispatchForm"); } catch {}
    };
    // ⭐ 운임조회 (업그레이드 버전: 화물내용 없어도 동작 + 최근 화물내용 포함)
    
    // ⭐ 운임조회 팝업 상태
    const [fareModalOpen, setFareModalOpen] = React.useState(false);
    const [fareResult, setFareResult] = React.useState(null);
    // ⭐ 운임조회 (송원 전용 자동요율 → 그 다음 AI 통계)
    const handleFareSearch = () => {
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

      let filtered = (dispatchData || []).filter((r) => {
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
        filtered = (dispatchData || []).filter((r) => {
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
        .sort((a, b) => (b.상차일 || "").localeCompare(a.상차일 || ""))[0];

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

      // 검색어 없으면 아무것도 안 보여줌
      if (!q) return [];

      let arr = (dispatchData || []);

      // 날짜 필터
      if (copyStart) arr = arr.filter((r) => (r.상차일 || "") >= copyStart);
      if (copyEnd) arr = arr.filter((r) => (r.상차일 || "") <= copyEnd);

      // 필드 필터
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

      // 정렬
      arr = arr.slice().sort((a, b) =>
        (a.상차일 || "").localeCompare(b.상차일 || "") ||
        (a.상차시간 || "").localeCompare(b.상차시간 || "")
      );

      return arr;
    }, [dispatchData, copyQ, copyStart, copyEnd, copyFilterType]);
    const [copySelected, setCopySelected] = React.useState([]);

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
      setCopySelected([]); // ⭐ 체크 초기화
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
    const inputCls = "border p-2 rounded w-full text-left";
    const labelCls = "text-xs text-gray-600 mb-1 block";
    const reqStar = <span className="text-red-500">*</span>;
    const AutoBadge = ({ show }) => show ? <span className="ml-2 text-[12px] text-emerald-700">(📌 자동매칭됨)</span> : null;

    const renderForm = () => (
      <>
        <h2 className="text-lg font-bold mb-3">배차관리</h2>

        {/* 상단 액션 */}
        <div className="flex items-center gap-2 mb-3">
          <button
             onClick={() => {
            setCopyOpen(true);
            setCopySelected([]); // ⭐ 모달 열 때 초기화
}}

            className="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
          >
            📄 오더복사
          </button>

          <button
            onClick={resetForm}
            className="px-3 py-2 rounded bg-gray-200 text-sm"
          >
            🔄 초기화
          </button>

          <button
            onClick={() => setBulkOpen(true)}
            className="px-3 py-2 rounded bg-emerald-600 text-white text-sm"
          >
            📂 대용량 업로드
          </button>

          {/* ⭐ 운임조회 버튼 (상단 공통 버튼으로 추가) */}
          <button
            type="button"
            onClick={handleFareSearch}
            className="px-3 py-2 rounded bg-amber-500 text-white text-sm"
          >
            운임조회
          </button>


          {/* ⭐ 독차 / 혼적 체크박스 — 버튼 옆으로 배치 */}
          <div className="flex items-center gap-4 ml-4">
            <label className="flex items-center gap-1 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.독차}
                onChange={(e) => onChange("독차", e.target.checked)}
                className="w-4 h-4"
              />
              독차
            </label>

            <label className="flex items-center gap-1 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.혼적}
                onChange={(e) => onChange("혼적", e.target.checked)}
                className="w-4 h-4"
              />
              혼적
            </label>
            
          </div>
          {/* 📌 상차일 + 상차시간 */}
<div className="col-span-6 bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
  <div className="flex items-end gap-6">

    {/* 상차 */}
    <div className="flex flex-col">
      <label className="text-[12px] font-semibold text-gray-600 mb-1">상차일 / 시간</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={form.상차일}
          onChange={(e) => onChange("상차일", e.target.value)}
          className="border rounded-md px-2 py-[4px] text-sm w-[130px] focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => onChange("상차일", _todayStr())}
          className="bg-blue-100 text-blue-700 px-2 py-[4px] rounded text-[11px]"
        >
          당일
        </button>
        <button
          type="button"
          onClick={() => onChange("상차일", _tomorrowStr())}
          className="bg-blue-100 text-blue-700 px-2 py-[4px] rounded text-[11px]"
        >
          내일
        </button>

        {/* ⭐ 상차시간 */}
        <select
          value={form.상차시간}
          onChange={(e) => onChange("상차시간", e.target.value)}
          className="border rounded-md px-2 py-[4px] text-sm w-[130px]"
        >
          <option value="">시간 ▾</option>
          {localTimeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>

    {/* 하차 */}
    <div className="flex flex-col">
      <label className="text-[12px] font-semibold text-gray-600 mb-1">하차일 / 시간</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={form.하차일}
          onChange={(e) => onChange("하차일", e.target.value)}
          className="border rounded-md px-2 py-[4px] text-sm w-[130px] focus:ring-green-500"
        />
        <button
          type="button"
          onClick={() => onChange("하차일", _todayStr())}
          className="bg-green-100 text-green-700 px-2 py-[4px] rounded text-[11px]"
        >
          당일
        </button>
        <button
          type="button"
          onClick={() => onChange("하차일", _tomorrowStr())}
          className="bg-green-100 text-green-700 px-2 py-[4px] rounded text-[11px]"
        >
          내일
        </button>

        {/* ⭐ 하차시간 */}
        <select
          value={form.하차시간}
          onChange={(e) => onChange("하차시간", e.target.value)}
          className="border rounded-md px-2 py-[4px] text-sm w-[130px]"
        >
          <option value="">시간 ▾</option>
          {localTimeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>

  </div>
</div>

        </div>

        {/* 입력 폼 */}
        <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3">
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
    if (pick) {
      applyClientSelect(pick.업체명); // 주소까지 자동매칭!
    }
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
                  <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-auto bg-white border rounded shadow-lg z-50">
                    {filteredClients.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">검색 결과 없음</div>
                    ) : (
                      filteredClients.map((p, idx) => (
                        <div
                          key={p.업체명}
                          className={`px-3 py-2 text-sm cursor-pointer ${idx === clientActive ? "bg-blue-50" : "hover:bg-gray-50"
                            }`}
                          onMouseEnter={() => setClientActive(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyClientSelect(p.업체명);
                          }}
                        >
                          <div className="font-medium">{p.업체명}</div>
                          {p.주소 ? (
                            <div className="text-[11px] text-gray-500">{p.주소}</div>
                          ) : null}
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

                  // ⭐⭐ 하차지거래처 등록 함수 사용 ⭐⭐
                  if (typeof upsertPlace === "function") {
                    upsertPlace({ 업체명, 주소, 담당자, 담당자번호 });
                  } else {
                    // ⭐ upsertPlace 없을 때 localStorage 직접 저장
                    try {
                      const list = JSON.parse(localStorage.getItem("hachaPlaces_v1") || "[]");
                      list.push({ 업체명, 주소, 담당자, 담당자번호 });
                      localStorage.setItem("hachaPlaces_v1", JSON.stringify(list));
                    } catch (e) {
                      console.error(e);
                    }
                  }

                  alert("하차지거래처에 신규 등록되었습니다.");
                }}
                className="px-3 py-2 border rounded text-sm"
              >
                + 신규등록
              </button>

            </div>
          </div>

          {/* ⭐ 상차지명 + 자동완성 (독립) */}
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

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPickupActive((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setPickupActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
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
      }
    }}
    onBlur={() => setTimeout(() => setShowPickupDropdown(false), 200)}
  />

  {showPickupDropdown && pickupOptions.length > 0 && (
    <div className="absolute z-50 bg-white border rounded shadow w-full max-h-48 overflow-auto">
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
          {p.주소 ? <div className="text-xs text-gray-500">{p.주소}</div> : null}
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

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPlaceActive((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPlaceActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
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
    }
  }}
  onBlur={() => setTimeout(() => setShowPlaceDropdown(false), 200)}
/>


            {showPlaceDropdown && placeOptions.length > 0 && (
  <div className="absolute z-50 bg-white border rounded shadow w-full max-h-48 overflow-auto">
    {placeOptions.map((p, i) => (
      <div
        key={i}
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
        {p.주소 ? (
          <div className="text-xs text-gray-500">{p.주소}</div>
        ) : null}
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

          {/* 🔒 금액 (admin 전용) */}
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

          <div>
            <label className={labelCls}>차량번호</label>
            <input
              className={inputCls}
              value={form.차량번호}
              onChange={(e) => handleCarNoChange(e.target.value)}  // ✅ 차량번호 변경 시 즉시 자동매칭
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCarNoEnter(e.currentTarget.value); } }}
              onBlur={(e) => handleCarNoEnter(e.currentTarget.value)}  // ✅ 포커스 아웃 시에도 자동매칭
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

          

          <div>
            <label className={labelCls}>상차방법</label>
            <select className={inputCls} value={form.상차방법} onChange={(e) => onChange("상차방법", e.target.value)}>
              <option value="">선택 ▾</option>
              {["지게차", "수작업", "직접수작업", "수도움"].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>하차방법</label>
            <select className={inputCls} value={form.하차방법} onChange={(e) => onChange("하차방법", e.target.value)}>
              <option value="">선택 ▾</option>
              {["지게차", "수작업", "직접수작업", "수도움"].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

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


          <div className="col-span-6">
            <label className={labelCls}>메모</label>
            <textarea className={`${inputCls} h-20`} value={form.메모} onChange={(e) => onChange("메모", e.target.value)} />
          </div>

          <div className="col-span-6 flex justify-end mt-2">
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700">저장</button>
            <button
              type="button"
              onClick={async () => {
                const {
                  거래처명, 상차지명, 하차지명,
                  상차일, 상차시간,
                  하차일, 하차시간
                } = form;

                if (!거래처명 || !상차지명 || !하차지명)
                  return alert("거래처/상차지명/하차지명을 입력해주세요.");
                if (!상차일 || !하차일)
                  return alert("상차일/하차일은 반드시 필요합니다.");

                const res = await sendOrderTo24(row);
                if (res?.success) {
                  alert(
                    `📡 24시콜 전송 완료!\n\n전송건수: 1건\n실패건수: 0건\n메시지: ${res?.message || "성공"}`
                  );
                } else {
                  alert(
                    `⛔ 전송 실패!\n\n전송건수: 0건\n실패건수: 1건\n사유: ${res?.message || "알 수 없는 오류"}`
                  );
                }
              }}
              className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-sm text-white rounded"
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
            <div className="bg-white w-[900px] p-5 rounded shadow-xl">

              {/* 헤더 */}
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-bold">오더복사</h2>
                <button onClick={() => {
  setCopyOpen(false);
+ setCopySelected([]); // ⭐ 체크 초기화
}}>
  ✕
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

                    // 🔥 오더 복사 적용
setForm(p => ({
  ...p,
  거래처명: r.거래처명 || "",
  상차지명: r.상차지명 || "",
  하차지명: r.하차지명 || "",
  화물내용: r.화물내용 || "",
  차량종류: r.차량종류 || "",
  차량톤수: r.차량톤수 || "",
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

// ⭐ 하차지 자동매칭 로직 직접 호출
applyClientSelect(r.거래처명);

// UI 동기화
setClientQuery(r.거래처명 || "");
setAutoPickMatched(false);
setAutoDropMatched(false);



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
                          <tr key={row._id} className="border-b hover:bg-gray-50">
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
        {renderForm()}
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
        />
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
  addDispatch,     // ⭐⭐⭐⭐⭐ 요거 반드시 필요!!!
  patchDispatch,
  removeDispatch,
  upsertDriver,
  role = "admin",
}) {

  const isAdmin = role === "admin";
  
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

const formatPhone = (phone) => {
  const digits = (phone || "").replace(/\D/g, ""); // 숫자만 추출

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  // fallback (자리수 불명)
  return phone;
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

    // 1️⃣ 기본
    if (mode === "basic") {
      return `${plate} ${name} ${phone}`;
    }

    // 2️⃣ 운임 포함
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
  }).join("\n\n");

  navigator.clipboard.writeText(text);
  setCopyModalOpen(false);
  alert("📋 복사되었습니다!");
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
const [driverSelectOpen, setDriverSelectOpen] = React.useState(false);
const [driverSelectList, setDriverSelectList] = React.useState([]);
const [driverSelectRowId, setDriverSelectRowId] = React.useState(null);

  // 주소 더보기
  const [expandedAddr, setExpandedAddr] = React.useState({});

  // 상차 임박 경고
  const [warningList, setWarningList] = React.useState([]);

  // 첨부파일 개수
  const [attachCount, setAttachCount] = React.useState({});

  // ------------------------
  // 한국 시간
  // ------------------------
  const todayKST = () => {
    const now = new Date();
    now.setHours(now.getHours() + 9);
    return now.toISOString().slice(0, 10);
  };

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
}, [dispatchData, showCreate]);   // ← rows 제거 !!!



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
  // 🚨 엔터 입력 시 → 기본동작 + 이벤트 전파 모두 차단!!
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
    setDriverSelectRowId(id);
    setDriverSelectList(matches);
    setDriverSelectOpen(true);
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
    }, 1000);

    alert("저장 완료");
    setEdited({});
    setSelectedEditMode(false);
  };

  // ------------------------
  // 📌 선택 삭제
  // ------------------------
  const handleDeleteSelected = async () => {
    if (!selected.length) return alert("삭제할 항목을 선택하세요.");
    if (!confirm(`${selected.length}건 삭제할까요?`)) return;

    for (const id of selected) {
      try {
        await removeDispatch(id);
      } catch {}
    }

    setRows((prev) => prev.filter((r) => !selected.includes(r._id)));

    setDeletedIds((prev) => {
      const n = new Set(prev);
      selected.forEach((id) => n.add(id));
      return n;
    });

    alert("삭제 완료");
    setSelected([]);
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
    "border px-2 py-2 bg-gray-100 text-center whitespace-nowrap";
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
  onClick={() => setCopyModalOpen(true)}
  className="px-3 py-1 rounded bg-indigo-600 text-white"
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

      // 🔽 여기에 수정!!
      if (!row.상차지주소 || !row.하차지주소) {
        alert("상차/하차 주소를 입력하세요.");
        continue;
      }

      const res = await sendOrderTo24(row);
      if (res?.code === "0") success++;
      else fail++;
    }

    alert(`📡 24시콜 선택전송 완료\n\n성공: ${success}건\n실패: ${fail}건`);
  }}
  className="px-3 py-1 rounded bg-orange-600 text-white"
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
    className="px-3 py-1 rounded bg-amber-500 text-white"
  >
    선택수정
  </button>

        <button
          onClick={handleSaveSelected}
          className="px-3 py-1 rounded bg-emerald-600 text-white"
        >
          저장
        </button>

        <button
          onClick={handleDeleteSelected}
          className="bg-red-500 text-white px-3 py-1 rounded"
        >
          선택삭제
        </button>
        {/* ⭐⭐⭐ 선택초기화 버튼 추가 */}
<button
  onClick={() => setSelected([])}
  className="px-3 py-1 rounded bg-gray-500 text-white"
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

          className="bg-green-600 text-white px-3 py-1 rounded"
        >
          엑셀다운
        </button>

        {/* 신규 오더 버튼 */}
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-500 text-white px-3 py-1 rounded"
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
                    ${selected.includes(r._id) ? "animate-pulse bg-yellow-100" : ""}
                    ${highlightIds.has(r._id) ? "animate-pulse bg-green-200" : ""}
                    ${savedHighlightIds.has(r._id) ? "animate-pulse bg-yellow-200" : ""}
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

                  <td className={cell}>{r.전화번호}</td>

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
                    <option value="탑차">탑차</option>
                    <option value="냉장탑">냉장탑</option>
                    <option value="냉동탑">냉동탑</option>
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
      <option value="라보">라보</option>
      <option value="다마스">다마스</option>
      <option value="카고">카고</option>
      <option value="윙바디">윙바디</option>
      <option value="탑차">탑차</option>
      <option value="냉장탑">냉장탑</option>
      <option value="냉동탑">냉동탑</option>
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
            await patchDispatch(editTarget._id, editTarget);
            alert("수정이 저장되었습니다.");
            setEditPopupOpen(false);
            setSelected([]);
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
{driverSelectOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white p-5 rounded-xl shadow-xl w-[360px] max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-bold mb-3">🚚 기사 선택</h3>
      
      {driverSelectList.map(d => (
        <button
          key={d._id}
          className="w-full text-left border p-2 mb-2 rounded hover:bg-blue-50"
          onClick={async () => {
            const updated = {
              차량번호: d.차량번호,
              이름: d.이름,
              전화번호: d.전화번호,
              배차상태: "배차완료",
            };

            await patchDispatch?.(driverSelectRowId, updated);
            setDriverSelectOpen(false);
            setDriverSelectList([]);
          }}
        >
          {d.차량번호} / {d.이름} / {d.전화번호}
        </button>
      ))}

      <button
        onClick={() => setDriverSelectOpen(false)}
        className="mt-3 w-full py-2 bg-gray-200 rounded"
      >
        취소
      </button>
    </div>
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

// 📌 이번 달 1일 ~ 말일 정확히 반환
const getMonthRange = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0~11
  const first = new Date(y, m, 1).toISOString().slice(0, 10);
  const last = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { first, last };
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
  const digits = (phone || "").replace(/\D/g, ""); // 숫자만 추출

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  // fallback (자리수 불명)
  return phone;
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
      const phone = formatPhone(r.전화번호 || "");
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
      
// ================================
// 🔵 자동완성 검색 함수 (★ 여기에 추가)
// ================================
const filterPlaces = (text) => {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return [];
  return (placeRows || []).filter((p) =>
    String(p.업체명 || "")
      .toLowerCase()
      .includes(q)
  );
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

  // 1) 수정 모드 OFF → 선택수정 버튼 처음 누른 상태
  if (!editMode) {
    if (!selected.size) return alert("수정할 항목을 선택하세요.");

    // 선택된 항목 중 첫 번째 row 찾기
    const first = filtered.find((r) => selected.has(getId(r)));

    if (first) {
      setEditTarget(first);        // 팝업에 전달
      setEditPopupOpen(true);      // 팝업 열기
    }
    return;   // 🔥 여기서 끝 (기존 setEditMode 켜지지 않음)
  }

  // 2) 전체수정 모드일 때는 기존 저장 로직 그대로 적용
  const ids = Object.keys(edited);
  if (!ids.length) {
    setEditMode(false);
    return alert("변경된 내용이 없습니다.");
  }

  if (!confirm("수정된 내용을 저장하시겠습니까?")) return;

  for (const id of ids) await _patch(id, edited[id]);

  setJustSaved(ids);
  setEdited({});
  setEditMode(false);
  setSelected(new Set());

  if (ids.length > 0) {
    const firstId = ids[0];
    const el = document.getElementById(`row-${firstId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  setTimeout(() => setJustSaved([]), 1200);
  alert("수정 완료되었습니다.");
};


  const removeSelectedRows = async () => {
    if (!selected.size) return alert("삭제할 항목이 없습니다.");
    if (!confirm(`${selected.size}건 삭제할까요?`)) return;
    for (const id of selected) {
      const row = dispatchData.find((r) => getId(r) === id);
      if (row) await _remove(row);
    }
    setSelected(new Set());
    alert("삭제 완료 ✅");
  };
// 🔥 금액 변환 함수 (이거 추가!!)
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

      // 🔽 여기에 수정!!
      if (!row.상차지주소 || !row.하차지주소) {
        alert("상차/하차 주소를 입력하세요.");
        continue;
      }

      const res = await sendOrderTo24(row);
      if (res?.code === "0") success++;
      else fail++;
    }

    alert(`📡 24시콜 선택전송 완료\n\n성공: ${success}건\n실패: ${fail}건`);
  }}
  className="px-3 py-1 rounded bg-orange-600 text-white"
>
  📡 선택전송(24시콜)
</button>


{/* 📋 기사복사 */}
<button
  onClick={() => setCopyModalOpen(true)}
  className="px-3 py-2 rounded bg-purple-600 text-white hover:bg-purple-700"
>
  
  📋 기사복사
</button>
    <button
      onClick={() => setShowCreate(true)}
      className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      
    >
      
      + 신규 오더 등록
    </button>

    <label className="px-3 py-2 rounded bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700">
      대용량 업로드
      <input type="file" accept=".xlsx,.xls" hidden onChange={handleBulkFile} />
    </label>

    <button
      className="px-3 py-2 rounded bg-yellow-500 text-white"
      onClick={handleEditToggle}
    >
      {editMode ? "수정완료" : "선택수정"}
    </button>

    <button
      className="px-3 py-2 rounded bg-red-600 text-white"
      onClick={removeSelectedRows}
    >
      선택삭제
    </button>

    <button
      className="px-3 py-2 rounded bg-gray-500 text-white"
      onClick={() => setSelected(new Set())}
    >
      선택초기화
    </button>

    <button
      className="px-3 py-2 rounded bg-emerald-600 text-white"
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
${selected.has(id) ? "bg-yellow-100" : ""}
${i % 2 === 0 ? "bg-white" : "bg-gray-50"}
${justSaved.includes(id) ? "flash-highlight" : ""}

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
      <option value="">선택없음</option>
      <option value="라보">라보</option>
      <option value="다마스">다마스</option>
      <option value="카고">카고</option>
      <option value="윙바디">윙바디</option>
      <option value="탑차">탑차</option>
      <option value="냉장탑">냉장탑</option>
      <option value="냉동탑">냉동탑</option>
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
            await patchDispatch(editTarget._id, editTarget);
            alert("수정이 저장되었습니다.");
            setEditPopupOpen(false);
            setSelected(new Set());
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
    <option value="">선택없음</option>
    <option value="냉장탑">냉장탑</option>
    <option value="냉동탑">냉동탑</option>
    <option value="윙바디">윙바디</option>
    <option value="탑차">탑차</option>
    <option value="라보/다마스">라보/다마스</option>
    <option value="오토바이">오토바이</option>
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
// ===================== DispatchApp.jsx (PART 6/8 — 매출관리 리디자인 v2) — START =====================

function Settlement({ dispatchData }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const toInt = (v) => {
    const n = parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };
  const todayStrLocal = () => new Date().toISOString().slice(0, 10);
  const monthKey = () => new Date().toISOString().slice(0, 7);
  const prevMonthKey = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  };
  const isInRange = (d, s, e) => {
    if (!d) return false;
    if (s && d < s) return false;
    if (e && d > e) return false;
    return true;
  };

  const baseRows = Array.isArray(dispatchData) ? dispatchData : [];

  // 🔍 기간 필터 + 거래처 필터
  const rangeRows = useMemo(() => {
    let rows = baseRows.filter((r) => (r.배차상태 || "") === "배차완료");
    if (clientFilter)
      rows = rows.filter((r) => (r.거래처명 || "") === clientFilter);
    if (startDate || endDate)
      rows = rows.filter((r) =>
        isInRange(r.상차일 || "", startDate, endDate)
      );
    return rows.sort((a, b) =>
      (a.상차일 || "").localeCompare(b.상차일 || "")
    );
  }, [baseRows, startDate, endDate, clientFilter]);

  const mKey = monthKey();
  const pKey = prevMonthKey();
  const today = todayStrLocal();

  // 🔹 이번달 / 전월 / 오늘 데이터 분리
  const monthRows = useMemo(
    () =>
      baseRows.filter(
        (r) =>
          (r.배차상태 || "") === "배차완료" &&
          String(r.상차일 || "").startsWith(mKey)
      ),
    [baseRows, mKey]
  );
  const prevMonthRows = useMemo(
    () =>
      baseRows.filter(
        (r) =>
          (r.배차상태 || "") === "배차완료" &&
          String(r.상차일 || "").startsWith(pKey)
      ),
    [baseRows, pKey]
  );
  const todayRows = useMemo(
    () =>
      baseRows.filter(
        (r) =>
          (r.배차상태 || "") === "배차완료" && (r.상차일 || "") === today
      ),
    [baseRows, today]
  );

  const sumBy = (rows, key) => rows.reduce((a, r) => a + toInt(r[key]), 0);

  // ✅ 핵심 KPI 계산
  const kpi = {
    월매출: sumBy(monthRows, "청구운임"),
    월기사: sumBy(monthRows, "기사운임"),
    당일매출: sumBy(todayRows, "청구운임"),
    당일기사: sumBy(todayRows, "기사운임"),
    전월매출: sumBy(prevMonthRows, "청구운임"),
  };
  kpi.월수수료 = kpi.월매출 - kpi.월기사;
  kpi.당일수수료 = kpi.당일매출 - kpi.당일기사;
  kpi.전월증감 = kpi.월매출 - kpi.전월매출;
  kpi.전월증감률 = kpi.전월매출
    ? (kpi.전월증감 / kpi.전월매출) * 100
    : 0;
  const monthProfitRate =
    kpi.월매출 > 0 ? (kpi.월수수료 / kpi.월매출) * 100 : 0;

  // ✅ 조회 기간 합계
  const rangeTotals = useMemo(() => {
    const 매출 = sumBy(rangeRows, "청구운임");
    const 기사 = sumBy(rangeRows, "기사운임");
    const 수수료 = 매출 - 기사;
    return { 매출, 기사, 수수료 };
  }, [rangeRows]);

  // ✅ 거래처 목록 (필터용)
  const clients = useMemo(() => {
    const s = new Set();
    baseRows.forEach((r) => {
      if (r.거래처명) s.add(r.거래처명);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
  }, [baseRows]);

  // ✅ 거래처별 집계 (기간 기준)
  const clientAgg = useMemo(() => {
    const map = new Map();
    for (const r of rangeRows) {
      const c = r.거래처명 || "미지정";
      const sale = toInt(r.청구운임);
      const driver = toInt(r.기사운임);
      const fee = sale - driver;
      const prev =
        map.get(c) || { 거래처명: c, 건수: 0, 매출: 0, 기사: 0, 수수료: 0 };
      prev.건수 += 1;
      prev.매출 += sale;
      prev.기사 += driver;
      prev.수수료 += fee;
      map.set(c, prev);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => b.매출 - a.매출);
    return arr;
  }, [rangeRows]);

  const topClients = useMemo(
    () => clientAgg.slice(0, 5),
    [clientAgg]
  );
  const riskyClients = useMemo(() => {
    const arr = clientAgg
      .map((r) => ({
        ...r,
        rate: r.매출 > 0 ? (r.수수료 / r.매출) * 100 : 0,
      }))
      .filter((r) => r.매출 > 0 && r.rate < 10)
      .sort((a, b) => b.매출 - a.매출)
      .slice(0, 5);
    return arr;
  }, [clientAgg]);

  // ✅ 전월 대비 / 기간 트렌드 차트 데이터
  const monthDaily = useMemo(() => {
    const add = (rows, yyyymm) => {
      const m = new Map();
      rows.forEach((r) => {
        const d = r.상차일 || "";
        if (!d.startsWith(yyyymm)) return;
        const day = parseInt(d.slice(8, 10), 10) || 0;
        const sale = toInt(r.청구운임);
        m.set(day, (m.get(day) || 0) + sale);
      });
      return Array.from(m.entries())
        .map(([day, sum]) => ({ day, sum }))
        .sort((a, b) => a.day - b.day);
    };
    const cur = add(monthRows, mKey);
    const prev = add(prevMonthRows, pKey);
    const maxDay = Math.max(cur.at(-1)?.day || 0, prev.at(-1)?.day || 0, 1);
    const xs = Array.from({ length: maxDay }, (_, i) => i + 1);
    const y1 = xs.map((d) => cur.find((x) => x.day === d)?.sum || 0);
    const y2 = xs.map((d) => prev.find((x) => x.day === d)?.sum || 0);
    return xs.map((d, i) => ({
      x: String(d).padStart(2, "0"),
      y1: y1[i],
      y2: y2[i],
    }));
  }, [monthRows, prevMonthRows, mKey, pKey]);

  const dailyTrend = useMemo(() => {
    const m = new Map();
    for (const r of rangeRows) {
      const d = r.상차일 || "";
      if (!d) continue;
      const sale = toInt(r.청구운임);
      const driver = toInt(r.기사운임);
      const fee = sale - driver;
      const prev =
        m.get(d) || { date: d, 매출: 0, 기사: 0, 수수료: 0 };
      prev.매출 += sale;
      prev.기사 += driver;
      prev.수수료 += fee;
      m.set(d, prev);
    }
    return Array.from(m.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [rangeRows]);

  const won = (n) => `${(n || 0).toLocaleString()}원`;

  const headBaseLocal =
    typeof headBase === "string"
      ? headBase
      : "px-3 py-2 border bg-gray-50 text-center";
  const cellBaseLocal =
    typeof cellBase === "string"
      ? cellBase
      : "px-3 py-2 border text-center";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-bold mb-1">매출관리</h2>
          <p className="text-xs text-gray-500">
            배차완료 건 기준 · 상차일로 집계
          </p>
        </div>
      </div>

      {/* 🔎 필터 영역 */}
      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">시작일</label>
          <input
            type="date"
            className="border p-2 rounded"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">종료일</label>
          <input
            type="date"
            className="border p-2 rounded"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">거래처</label>
          <select
            className="border p-2 rounded min-w-[200px]"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="">전체</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setStartDate("");
            setEndDate("");
            setClientFilter("");
          }}
          className="px-3 py-2 rounded bg-gray-100 text-sm border border-gray-300 hover:bg-gray-200"
        >
          필터 초기화
        </button>
      </div>

      {/* ⚠ 이익률 경고 */}
      {monthProfitRate < 15 && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2 text-sm">
          <span className="font-semibold">
            ⚠ 이번달 평균 이익률 {monthProfitRate.toFixed(1)}%
          </span>
          <span className="text-rose-600"> (목표 15% 미만)</span>
        </div>
      )}

      {/* 1) 최상단 메인 KPI 4개 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          이번달 핵심 요약
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard title="월 매출" value={kpi.월매출} accent />
          <KpiCard title="월 수수료" value={kpi.월수수료} accent />
          <KpiMiniRate title="이번달 평균 이익률" rate={monthProfitRate} />
          <KpiDeltaCard
            title="전월 대비 매출"
            diff={kpi.전월증감}
            rate={kpi.전월증감률}
          />
        </div>
      </section>

      {/* 2) 월 / 오늘 / 기간 블록 요약 */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* 이번달 상세 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              이번달 요약
            </p>
            <KpiRow label="월 매출" value={won(kpi.월매출)} />
            <KpiRow label="월 기사운임" value={won(kpi.월기사)} />
            <KpiRow label="월 수수료" value={won(kpi.월수수료)} highlight />
          </div>

          {/* 오늘 기준 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              오늘 기준
            </p>
            <KpiRow label="오늘 매출" value={won(kpi.당일매출)} />
            <KpiRow label="오늘 기사운임" value={won(kpi.당일기사)} />
            <KpiRow
              label="오늘 수수료"
              value={won(kpi.당일수수료)}
              highlight
            />
          </div>

          {/* 조회기간 기준 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              조회 기간 요약
            </p>
            <KpiRow label="기간 매출" value={won(rangeTotals.매출)} />
            <KpiRow label="기간 기사운임" value={won(rangeTotals.기사)} />
            <KpiRow
              label="기간 수수료"
              value={won(rangeTotals.수수료)}
              highlight
            />
          </div>
        </div>
      </section>

      {/* 3) Top5 / 위험 거래처 */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartPanel title="🏆 Top5 거래처 (매출 기준)">
            {topClients.length === 0 ? (
              <div className="text-gray-500 text-sm">
                표시할 데이터가 없습니다.
              </div>
            ) : (
              <SimpleBars
                data={topClients.map((d) => ({
                  label: d.거래처명,
                  value: d.매출,
                }))}
                max={Math.max(1, ...topClients.map((d) => d.매출))}
                valueLabel={(v) => won(v)}
              />
            )}
          </ChartPanel>

          <ChartPanel title="⚠ 이익률 10% 미만 거래처">
            {riskyClients.length === 0 ? (
              <div className="text-gray-500 text-sm">
                이익률 10% 미만 거래처가 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {riskyClients.map((d) => (
                  <div
                    key={d.거래처명}
                    className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"
                  >
                    <div className="truncate font-medium text-rose-700">
                      {d.거래처명}
                    </div>
                    <div className="text-xs text-rose-700">
                      매출 {d.매출.toLocaleString()}원 · 수수료{" "}
                      {d.수수료.toLocaleString()}원 · 이익률{" "}
                      {d.rate.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartPanel>
        </div>
      </section>

      {/* 4) 차트 2개 */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartPanel
            title={`전월 대비 일자 매출 (이번달 ${mKey} vs 전월 ${pKey})`}
          >
            <SimpleLine
              data={monthDaily.map((d) => ({
                x: d.x,
                y1: d.y1,
                y2: d.y2,
              }))}
              series={[
                { key: "y1", name: "이번달 매출" },
                { key: "y2", name: "전월 매출" },
              ]}
            />
          </ChartPanel>

          <ChartPanel title="기간 일자 트렌드 (매출 / 수수료 / 기사운임)">
            <SimpleLine
              data={dailyTrend.map((d) => ({
                x: d.date.slice(5),
                y1: d.매출,
                y2: d.수수료,
                y3: d.기사,
              }))}
              series={[
                { key: "y1", name: "매출" },
                { key: "y2", name: "수수료" },
                { key: "y3", name: "기사운임" },
              ]}
            />
          </ChartPanel>
        </div>
      </section>

      {/* 5) 거래처별 기간 집계 테이블 */}
      <section className="mb-6">
        <h3 className="font-semibold mb-2 text-sm">
          거래처별 기간 집계 (조회 조건 기준)
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className={headBaseLocal}>거래처명</th>
                <th className={headBaseLocal}>건수</th>
                <th className={headBaseLocal}>매출</th>
                <th className={headBaseLocal}>기사운임</th>
                <th className={headBaseLocal}>수수료</th>
                <th className={headBaseLocal}>이익률</th>
              </tr>
            </thead>
            <tbody>
              {clientAgg.length === 0 ? (
                <tr>
                  <td
                    className="text-center text-gray-500 py-6"
                    colSpan={6}
                  >
                    조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                clientAgg.map((r) => {
                  const rateNum =
                    r.매출 > 0 ? (r.수수료 / r.매출) * 100 : 0;
                  const rateStr =
                    r.매출 > 0 ? rateNum.toFixed(1) + "%" : "-";
                  const colorClass =
                    r.매출 > 0 && rateNum < 10
                      ? "text-red-600 font-semibold"
                      : "text-gray-700";
                  return (
                    <tr
                      key={r.거래처명}
                      className="odd:bg-white even:bg-gray-50 text-center"
                    >
                      <td className={cellBaseLocal}>{r.거래처명}</td>
                      <td className={cellBaseLocal}>{r.건수}</td>
                      <td className={cellBaseLocal}>
                        {r.매출.toLocaleString()}
                      </td>
                      <td className={cellBaseLocal}>
                        {r.기사.toLocaleString()}
                      </td>
                      <td
                        className={`${cellBaseLocal} text-blue-600 font-semibold`}
                      >
                        {r.수수료.toLocaleString()}
                      </td>
                      <td
                        className={`${cellBaseLocal} ${colorClass}`}
                      >
                        {rateStr}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ===================== 보조 UI 컴포넌트 ===================== */

function KpiRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-gray-600">{label}</span>
      <span
        className={
          highlight
            ? "font-semibold text-blue-600"
            : "font-semibold text-gray-800"
        }
      >
        {value}
      </span>
    </div>
  );
}

function KpiCard({ title, value, accent, subtle }) {
  const base = subtle
    ? "bg-gray-50 border-gray-200"
    : accent
    ? "bg-blue-50 border-blue-200"
    : "bg-white border-gray-200";
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${base}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-xl font-bold mt-1">
        {Number(value || 0).toLocaleString()}원
      </p>
    </div>
  );
}

function KpiMiniRate({ title, rate }) {
  const danger = rate < 10,
    warn = rate >= 10 && rate < 15;
  const base = danger
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : warn
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${base}`}>
      <p className="text-xs">{title}</p>
      <p className="text-xl font-bold mt-1">
        {(rate || 0).toFixed(1)}%
      </p>
    </div>
  );
}

function KpiDeltaCard({ title, diff, rate }) {
  const up = diff >= 0;
  return (
    <div
      className={`rounded-2xl p-3 border shadow-sm ${
        up
          ? "bg-blue-50 border-blue-200"
          : "bg-rose-50 border-rose-200"
      }`}
    >
      <p className="text-xs text-gray-500">{title}</p>
      <p
        className={`text-xl font-bold mt-1 ${
          up ? "text-blue-700" : "text-rose-700"
        }`}
      >
        {`${diff >= 0 ? "+" : ""}${Number(diff || 0).toLocaleString()}원`}
      </p>
      <p
        className={`text-xs ${
          up ? "text-blue-700" : "text-rose-700"
        }`}
      >
        {`${rate >= 0 ? "+" : ""}${(rate || 0).toFixed(1)}%`}
      </p>
    </div>
  );
}

function ChartPanel({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <h4 className="font-semibold mb-3 text-sm">{title}</h4>
      {children}
    </div>
  );
}

function SimpleBars({ data, max, barClass = "bg-blue-500", valueLabel }) {
  const safeMax = Math.max(1, max || 1);
  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="text-gray-500 text-sm">
          표시할 데이터가 없습니다.
        </div>
      ) : (
        data.map((d) => {
          const pct = Math.round((d.value / safeMax) * 100);
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div
                className="w-36 truncate text-xs text-gray-700"
                title={d.label}
              >
                {d.label}
              </div>
              <div className="flex-1 h-4 bg-gray-100 rounded">
                <div
                  className={`h-4 rounded ${barClass}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-28 text-right text-xs text-gray-600">
                {valueLabel ? valueLabel(d.value) : d.value}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function SimpleLine({ data, series }) {
  const width = 560,
    height = 280,
    padding = { left: 40, right: 10, top: 10, bottom: 24 };
  const xs = data.map((d) => d.x);
  const xCount = xs.length || 1;
  const allY = [];
  data.forEach((d) => series.forEach((s) => allY.push(d[s.key] || 0)));
  const yMax = Math.max(1, ...allY),
    yMin = 0;

  const xScale = (i) =>
    padding.left +
    (i * (width - padding.left - padding.right)) /
      Math.max(1, xCount - 1);
  const yScale = (v) =>
    padding.top +
    (height - padding.top - padding.bottom) *
      (1 - (v - yMin) / (yMax - yMin));

  const makePath = (key) =>
    data.length === 0
      ? ""
      : data
          .map(
            (d, i) =>
              `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(d[key] || 0)}`
          )
          .join(" ");

  const colors = ["#2563eb", "#ef4444", "#10b981", "#6b7280"];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[300px]"
    >
      {/* Y축 가이드라인 */}
      {Array.from({ length: 5 }).map((_, i) => {
        const yVal = yMin + ((yMax - yMin) * i) / 4;
        const y = yScale(yVal);
        return (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text
              x={4}
              y={y + 4}
              fontSize="10"
              fill="#6b7280"
            >
              {Math.round(yVal).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* X축 라벨 */}
      {xs.map((d, i) => {
        const show =
          i === 0 || i === xCount - 1 || i % Math.ceil(xCount / 6) === 0;
        if (!show) return null;
        const x = xScale(i);
        return (
          <text
            key={i}
            x={x}
            y={height - 2}
            fontSize="10"
            textAnchor="middle"
            fill="#6b7280"
          >
            {d}
          </text>
        );
      })}

      {/* 라인 */}
      {series.map((s, idx) => (
        <path
          key={s.key}
          d={makePath(s.key)}
          fill="none"
          stroke={colors[idx % colors.length]}
          strokeWidth="2"
        />
      ))}

      {/* 범례 */}
      {series.map((s, idx) => (
        <g
          key={s.key}
          transform={`translate(${
            padding.left + idx * 140
          }, ${padding.top + 8})`}
        >
          <rect
            width="12"
            height="12"
            fill={colors[idx % colors.length]}
            rx="2"
          />
          <text
            x="16"
            y="11"
            fontSize="12"
            fill="#374151"
          >
            {s.name}
          </text>
        </g>
      ))}
    </svg>
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
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.차량번호 || r.id).filter(Boolean)));
  };

  const handleBlur = async (row, key, val) => {
    const id = row.id; // ← 반드시 문서 ID로 고정
const patch = { ...row, [key]: val };
await upsertDriver?.({ ...patch, id });

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
    if (!confirm(`${selected.size}건 삭제할까요?`)) return;
    for (const id of selected) await removeDriver?.(id);
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

  const head = headBase || "border px-2 py-2 bg-gray-100 text-center whitespace-nowrap";
  const cell = cellBase || "border px-2 py-1 text-center whitespace-nowrap align-middle";
  const input = inputBase || "border p-1 rounded w-36 text-center";

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
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">차량번호*</div>
          <input className="border p-2 rounded w-full" value={newForm.차량번호} onChange={e=>setNewForm(p=>({...p,차량번호:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">이름</div>
          <input className="border p-2 rounded w-full" value={newForm.이름} onChange={e=>setNewForm(p=>({...p,이름:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">전화번호</div>
          <input className="border p-2 rounded w-full" value={newForm.전화번호} onChange={e=>setNewForm(p=>({...p,전화번호:e.target.value}))}/>
        </div>
        <div className="flex items-end">
          <button onClick={addNew} className="px-4 py-2 rounded bg-blue-600 text-white w-full">+ 신규등록</button>
        </div>
        <div className="col-span-4">
          <div className="text-xs text-gray-500 mb-1">메모</div>
          <input className="border p-2 rounded w-full" value={newForm.메모} onChange={e=>setNewForm(p=>({...p,메모:e.target.value}))}/>
        </div>
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
            {paged.length===0 ? (
              <tr><td className="text-center text-gray-500 py-6" colSpan={5}>표시할 데이터가 없습니다.</td></tr>
            ) : paged.map((r,i)=> {
              const id = r.차량번호 || r.id || `${i}`;
              return (
                <tr key={id} className={i%2? "bg-gray-50":""}>
                  <td className={cell}>
                    <input type="checkbox" checked={selected.has(id)} onChange={()=>toggleOne(id)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.차량번호||""}
                      onBlur={(e)=>handleBlur(r,"차량번호", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.이름||""}
                      onBlur={(e)=>handleBlur(r,"이름", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.전화번호||""}
                      onBlur={(e)=>handleBlur(r,"전화번호", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={`${input} w-64`} defaultValue={r.메모||""}
                      onBlur={(e)=>handleBlur(r,"메모", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <button
                      onClick={()=>{ if(confirm("삭제하시겠습니까?")) removeDriver?.(id); }}
                      className="px-2 py-1 bg-red-600 text-white rounded"
                    >삭제</button>
                  </td>
                </tr>
              );
            })}
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
                              if (!confirm("삭제하시겠습니까?")) return;
                              removeClient?.(id);
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
          </div>

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