// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import FixedClients from "./FixedClients";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import AdminMenu from "./AdminMenu";


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

function useRealtimeCollections(user){
  const [dispatchData, setDispatchData] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);

  useEffect(()=>{
    if(!user) { setDispatchData([]); setDrivers([]); setClients([]); return; }

    const unsubs = [];
    unsubs.push(onSnapshot(collection(db, COLL.dispatch), (snap)=>{
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


  const upsertDriver = async (driver)=>{
    const id = driver.차량번호 || driver.id || crypto?.randomUUID?.();
    await setDoc(doc(db, COLL.drivers, id), { ...driver, id }, { merge: true });
  };
  const removeDriver = async (id)=> deleteDoc(doc(db, COLL.drivers, id));

  const upsertClient = async (client)=>{
    const id = client.거래처명 || client.id || crypto?.randomUUID?.();
    await setDoc(doc(db, COLL.clients, id), { ...client, id }, { merge: true });
  };
  const removeClient = async (id)=> deleteDoc(doc(db, COLL.clients, id));

  return {
    dispatchData, drivers, clients,
    addDispatch, patchDispatch, removeDispatch,
    upsertDriver, removeDriver,
    upsertClient, removeClient,
  };
}

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

  // ---------------- Firestore 실시간 훅 ----------------
  const {
    dispatchData,
    drivers,
    clients,
    addDispatch,
    patchDispatch,
    removeDispatch,
    upsertDriver,
    removeDriver,
    upsertClient,
    removeClient,
  } = useRealtimeCollections(user);

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
        <h1 className="text-2xl font-bold">배차 프로그램</h1>
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
            dispatchData={dispatchData}
            drivers={drivers}
            clients={clients}
            addDispatch={addDispatch}
            upsertDriver={upsertDriver}
            upsertClient={upsertClient}
            role={role}
          />
        )}

        {menu === "실시간배차현황" && (
          <RealtimeStatus
            role={role}
            dispatchData={dispatchData}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            patchDispatch={patchDispatch}
            removeDispatch={removeDispatch}
            upsertDriver={upsertDriver}
          />
        )}

        {menu === "배차현황" && (
          <DispatchStatus
            role={role}
            dispatchData={dispatchData}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            patchDispatch={patchDispatch}
            removeDispatch={removeDispatch}
            upsertDriver={upsertDriver}
          />
        )}

        {menu === "미배차현황" && (
          <UnassignedStatus role={role} dispatchData={dispatchData} />
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
  addDispatch, upsertDriver, upsertClient,
  role = "admin",          // 🔒 권한: "admin" | "user"
}) {
  const isAdmin = role === "admin";

  // ---------- 🔧 안전 폴백 유틸(다른 파트 미정의 시 자체 사용) ----------
  const _todayStr = (typeof todayStr === "function")
    ? todayStr
    : () => new Date().toISOString().slice(0, 10);
  const _tomorrowStr = (typeof tomorrowStr === "function")
    ? tomorrowStr
    : () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  const _safeLoad = (typeof safeLoad === "function")
    ? safeLoad
    : (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
  const _safeSave = (typeof safeSave === "function")
    ? safeSave
    : (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

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
    하차지명: "",
    하차지주소: "",
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    차량번호: "",
    이름: "",
    전화번호: "",
    상차방법: "",
    하차방법: "",
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    청구운임: "",
    기사운임: "",
    수수료: "",
    지급방식: "",
    배차방식: "",
    메모: "",
    배차상태: "배차중",
  };

  const [form, setForm] = React.useState(() => ({ ...emptyForm, ..._safeLoad("dispatchForm", {}) }));
  React.useEffect(() => _safeSave("dispatchForm", form), [form]);

  // ✅ 거래처 자동매칭용
  const norm = (s = "") => String(s).trim().toLowerCase();
  const clientMap = React.useMemo(() => {
    const m = new Map();
    (clients || []).forEach((c) => {
      const name = c.거래처명 || c.name || c.title || "";
      if (!name) return;
      m.set(norm(name), c);
    });
    return m;
  }, [clients]);
  const findClient = (name) => clientMap.get(norm(name));

  // ✅ 주소 자동매칭 뱃지
  const [autoPickMatched, setAutoPickMatched] = React.useState(false);
  const [autoDropMatched, setAutoDropMatched] = React.useState(false);

  // 거래처 콤보
  const [clientQuery, setClientQuery] = React.useState(form.거래처명 || "");
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

  const clientOptions = (clients || []).map((c) => ({
    거래처명: c.거래처명 || c.name || c.title || "",
    주소: c.주소 || "",
  }));
  const filteredClients = React.useMemo(() => {
    const q = norm(clientQuery);
    if (!q) return clientOptions;
    return clientOptions.filter((c) => norm(c.거래처명).includes(q));
  }, [clientQuery, clientOptions]);

  const onChange = (key, value) => {
    if (isAdmin && (key === "청구운임" || key === "기사운임")) {
      setForm((p) => {
        const next = { ...p, [key]: value };
        const sale = parseInt(next.청구운임 || 0, 10) || 0;
        const drv  = parseInt(next.기사운임 || 0, 10) || 0;
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

  // ✅ 거래처 선택 → 상차지/주소 자동
  const applyClientSelect = (name) => {
    const selected = findClient(name);
    setForm((p) => ({
      ...p,
      거래처명: name,
      상차지명: p.상차지명 || name,
      상차지주소: (p.상차지명 || name) && selected?.주소 && norm(p.상차지명 || name) === norm(name)
        ? selected.주소
        : p.상차지주소,
    }));
    setAutoPickMatched((p) => !!(selected?.주소 && norm((form.상차지명 || name)) === norm(name)));
    setClientQuery(name);
    setIsClientOpen(false);
    setClientActive(0);
  };

  // ✅ 상/하차지명 변경 시 주소 자동매칭
  const handlePickupName = (value) => {
    const pickClient = findClient(value);
    setForm((p) => ({ ...p, 상차지명: value, 상차지주소: pickClient?.주소 || p.상차지주소 }));
    setAutoPickMatched(!!pickClient?.주소);
  };
  const handleDropName = (value) => {
    const dropClient = findClient(value);
    setForm((p) => ({ ...p, 하차지명: value, 하차지주소: dropClient?.주소 || p.하차지주소 }));
    setAutoDropMatched(!!dropClient?.주소);
  };
  const handlePickupAddrManual = (v) => { setForm((p) => ({ ...p, 상차지주소: v })); setAutoPickMatched(false); };
  const handleDropAddrManual  = (v) => { setForm((p) => ({ ...p, 하차지주소: v })); setAutoDropMatched(false); };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateRequired(form)) return;

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
  };

  // ------------------ 오더복사 ------------------
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [copyQ, setCopyQ] = React.useState("");
  const copyList = React.useMemo(() => {
    const q = copyQ.trim().toLowerCase();
    const arr = (dispatchData || []).slice().sort((a, b) =>
      (a.상차일 || "").localeCompare(b.상차일 || "") ||
      (a.상차시간 || "").localeCompare(b.상차시간 || "")
    );
    if (!q) return arr;
    return arr.filter((r) =>
      ["거래처명", "상차지명", "하차지명", "화물내용"].some((k) =>
        String(r[k] || "").toLowerCase().includes(q)
      )
    );
  }, [dispatchData, copyQ]);

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
  };

  // ------------------ 초기화 ------------------
  const resetForm = () => {
    const reset = { ...emptyForm, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, 등록일: _todayStr() };
    setForm(reset);
    setClientQuery("");
    setAutoPickMatched(false);
    setAutoDropMatched(false);
  };

  // =========================================================
  // 📤 공유 (모바일: 카톡 공유창 / PC: 텍스트 복사)
  // =========================================================
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const shareTextForRow = (r) => {
    const dStr = r.상차일 || _todayStr(); // YYYY-MM-DD 유지
    const plate = r.차량번호 || "-";
    const name  = r.이름 || "-";
    const url   = `${location.origin}/upload?id=${encodeURIComponent(r._id || "")}`;
    return `[RUN25 운송장 업로드 안내]

✅ 상차일: ${dStr}
✅ 거래처: ${r.거래처명 || "-"}
✅ 차량: ${plate} (${name})

아래 링크에서 운송장/인수증 사진을 업로드해주세요👇
📎 ${url}`;
  };
  const shareDispatch = async (r) => {
    const text = shareTextForRow(r);
    const url  = `${location.origin}/upload?id=${encodeURIComponent(r._id || "")}`;
    if (isMobile && navigator.share) {
      try { await navigator.share({ title: "RUN25 업로드 안내", text, url }); } catch {}
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
    try { window.dispatchEvent(new CustomEvent("RUN25_OPEN_ATTACH", { detail: row })); } catch {}
    if (typeof window.RUN25_OPEN_ATTACH_CB === "function") {
      try { window.RUN25_OPEN_ATTACH_CB(row); } catch {}
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
        <button onClick={() => setCopyOpen(true)} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">📄 오더복사</button>
        <button onClick={resetForm} className="px-3 py-2 rounded bg-gray-200 text-sm">🔄 초기화</button>
        <button onClick={() => setBulkOpen(true)} className="px-3 py-2 rounded bg-emerald-600 text-white text-sm">📂 대용량 업로드</button>
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
                  if (!isClientOpen && (e.key === "ArrowDown" || e.key === "Enter")) { setIsClientOpen(true); return; }
                  if (!filteredClients.length) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setClientActive((i) => Math.min(i + 1, filteredClients.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setClientActive((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); const pick = filteredClients[clientActive]; if (pick) applyClientSelect(pick.거래처명); }
                  else if (e.key === "Escape") setIsClientOpen(false);
                }}
              />
              {isClientOpen && (
                <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-auto bg-white border rounded shadow-lg z-50">
                  {filteredClients.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">검색 결과 없음</div>
                  ) : (
                    filteredClients.map((c, idx) => (
                      <div
                        key={c.거래처명}
                        className={`px-3 py-2 text-sm cursor-pointer ${idx === clientActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        onMouseEnter={() => setClientActive(idx)}
                        onMouseDown={(e) => { e.preventDefault(); applyClientSelect(c.거래처명); }}
                      >
                        <div className="font-medium">{c.거래처명}</div>
                        {c.주소 ? <div className="text-[11px] text-gray-500">{c.주소}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={()=>{
              const 거래처명 = (clientQuery || "").trim();
              if (!거래처명) return alert("거래처명을 입력하세요.");
              const 주소 = prompt("거래처 주소 (선택)") || "";
              const 담당자 = prompt("담당자 (선택)") || "";
              const 연락처 = prompt("연락처 (선택)") || "";
              upsertClient?.({ 거래처명, 주소, 담당자, 연락처 });
              alert("신규 거래처가 등록되었습니다.");
            }} className="px-3 py-2 border rounded text-sm">
              + 신규등록
            </button>
          </div>
        </div>

        {/* 상/하차지명 & 주소 */}
        <div>
          <label className={labelCls}>상차지명 {reqStar}</label>
          <input className={inputCls} value={form.상차지명} onChange={(e) => handlePickupName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>상차지주소 <AutoBadge show={autoPickMatched} /></label>
          <input className={inputCls} value={form.상차지주소} onChange={(e) => handlePickupAddrManual(e.target.value)} placeholder="자동매칭 또는 수기입력" />
        </div>
        <div>
          <label className={labelCls}>하차지명 {reqStar}</label>
          <input className={inputCls} value={form.하차지명} onChange={(e) => handleDropName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>하차지주소 <AutoBadge show={autoDropMatched} /></label>
          <input className={inputCls} value={form.하차지주소} onChange={(e) => handleDropAddrManual(e.target.value)} placeholder="자동매칭 또는 수기입력" />
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
              <input className={inputCls} value={form.청구운임} onChange={(e) => onChange("청구운임", e.target.value.replace(/[^\d-]/g,""))} />
            </div>
            <div>
              <label className={labelCls}>기사운임</label>
              <input className={inputCls} value={form.기사운임} onChange={(e) => onChange("기사운임", e.target.value.replace(/[^\d-]/g,""))} />
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

        {/* 날짜/시간 */}
        <div>
          <label className={labelCls}>상차일</label>
          <input type="date" className={inputCls} value={form.상차일} onChange={(e) => onChange("상차일", lockYear(e.target.value))}/>
          <div className="flex gap-1 mt-1">
            <button type="button" className="px-2 py-1 bg-gray-200 rounded text-xs" onClick={() => onChange("상차일", _todayStr())}>당일상차</button>
            <button type="button" className="px-2 py-1 bg-gray-200 rounded text-xs" onClick={() => onChange("상차일", _tomorrowStr())}>내일상차</button>
          </div>
        </div>
        <div>
          <label className={labelCls}>상차시간</label>
          <select className={inputCls} value={form.상차시간} onChange={(e) => onChange("상차시간", e.target.value)}>
            <option value="">선택 ▾</option>
            {localTimeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>하차일</label>
          <input type="date" className={inputCls} value={form.하차일} onChange={(e) => onChange("하차일", lockYear(e.target.value))}/>
          <div className="flex gap-1 mt-1">
            <button type="button" className="px-2 py-1 bg-gray-200 rounded text-xs" onClick={() => onChange("하차일", _todayStr())}>당일하차</button>
            <button type="button" className="px-2 py-1 bg-gray-200 rounded text-xs" onClick={() => onChange("하차일", _tomorrowStr())}>내일하차</button>
          </div>
        </div>
        <div>
          <label className={labelCls}>하차시간</label>
          <select className={inputCls} value={form.하차시간} onChange={(e) => onChange("하차시간", e.target.value)}>
            <option value="">선택 ▾</option>
            {localTimeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>상차방법</label>
          <select className={inputCls} value={form.상차방법} onChange={(e) => onChange("상차방법", e.target.value)}>
            <option value="">선택 ▾</option>
            {["지게차","수작업","직접수작업","수도움"].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>하차방법</label>
          <select className={inputCls} value={form.하차방법} onChange={(e) => onChange("하차방법", e.target.value)}>
            <option value="">선택 ▾</option>
            {["지게차","수작업","직접수작업","수도움"].map(v => <option key={v} value={v}>{v}</option>)}
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
        </div>
      </form>

      {/* ───────── 오더복사 모달 ───────── */}
      {copyOpen && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-[1200px] max-h-[85vh] overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <b>오더복사</b>
              <button onClick={() => setCopyOpen(false)} className="text-gray-500">✕</button>
            </div>
            <div className="p-4">
              <input
                className="border p-2 rounded w-80"
                placeholder="상차지명/거래처명/하차지명/화물내용 검색"
                value={copyQ}
                onChange={(e) => setCopyQ(e.target.value)}
              />
              <div className="overflow-auto mt-3">
                <table className="min-w-[1100px] text-sm border">
                  <thead>
                    <tr>
                      {["상차일","상차시간","거래처명","상차지명","상차지주소","하차지명","하차지주소","화물내용","차량종류","차량톤수","메모","복사"].map((h)=>(
                        <th key={h} className="border px-2 py-2 bg-gray-100 text-center whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {copyList.map((r,i)=>(
                      <tr key={r._id || i} className={i%2? "bg-gray-50":""}>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.상차일}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.상차시간}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.거래처명}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.상차지명}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.상차지주소}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.하차지명}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.하차지주소}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.화물내용}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.차량종류}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.차량톤수}</td>
                        <td className="border px-2 py-1 text-center whitespace-nowrap">{r.메모}</td>
                        <td className="border px-2 py-1 text-center">
                          <button onClick={()=>applyCopy(r)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">복사</button>
                        </td>
                      </tr>
                    ))}
                    {copyList.length===0 && (
                      <tr><td className="text-center text-gray-500 py-6" colSpan={12}>검색 결과가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right">
              <button onClick={()=>setCopyOpen(false)} className="px-3 py-2 rounded border">닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  /* -------------------------------------------------
   ✅ 하단부 실시간배차현황 (배차관리 전용)
   - 메뉴와 동일한 UX
   - 상차 2시간 전 + 미배차 경고 기능 포함
--------------------------------------------------*/
const RealtimeStatusEmbed = () => {
  const today = _todayStr();

  // 🔎 필터 상태
  const [q, setQ] = React.useState("");
  const [filterType, setFilterType] = React.useState("전체");
  const [filterValue, setFilterValue] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  // ✏️ 편집/삭제 모드
  const [editMode, setEditMode] = React.useState(false);
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());

  // 편집 저장용
  const [editedRows, setEditedRows] = React.useState({});

  // 상차 2시간 전 경고
  const [warningList, setWarningList] = React.useState([]);

  // 숫자 변환
  const toInt = (v) => {
    const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };

  // ================================
  // 🔥 필터링/정렬
  // ================================
  const filtered = React.useMemo(() => {
    let data = [...(dispatchData || [])];

    // 날짜 필터
    if (!startDate && !endDate) {
      data = data.filter((r) => (r.상차일 || "") === today);
    } else {
      if (startDate) data = data.filter((r) => (r.상차일 || "") >= startDate);
      if (endDate) data = data.filter((r) => (r.상차일 || "") <= endDate);
    }

    // 필드 검색
    if (filterType !== "전체" && filterValue) {
      data = data.filter((r) =>
        String(r[filterType] || "").includes(filterValue)
      );
    }

    // 통합 검색
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) =>
          String(v || "").toLowerCase().includes(lower)
        )
      );
    }

    // 정렬: 배차중 → 배차완료
    data.sort((a, b) => {
      if (a.배차상태 === "배차중" && b.배차상태 !== "배차중") return -1;
      if (a.배차상태 !== "배차중" && b.배차상태 === "배차중") return 1;
      return (a.상차일 || "").localeCompare(b.상차일 || "");
    });

    return data;
  }, [dispatchData, q, filterType, filterValue, startDate, endDate]);

  // ================================
  // ⚠ 상차 2시간 전 + 차량번호 없음 감지
  // ================================
  React.useEffect(() => {
    if (!filtered.length) {
      setWarningList([]);
      return;
    }

    const now = new Date();
    const temp = [];

    filtered.forEach((r) => {
      if (r.차량번호 && String(r.차량번호).trim() !== "") return;
      if (!r.상차일 || !r.상차시간) return;

      try {
        const t = String(r.상차시간).padStart(5, "0");
        const dt = new Date(`${r.상차일}T${t}:00`);
        const diff = dt.getTime() - now.getTime();

        if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
          temp.push(r);
        }
      } catch (_) {}
    });

    setWarningList(temp);
  }, [filtered]);

  // ================================
  // KPI
  // ================================
  const kpi = React.useMemo(() => {
    const sale = filtered.reduce((a, r) => a + toInt(r.청구운임), 0);
    const drv = filtered.reduce((a, r) => a + toInt(r.기사운임), 0);
    return { cnt: filtered.length, sale, drv, fee: sale - drv };
  }, [filtered]);

  // ================================
  // 선택/체크박스
  // ================================
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map((r) => r._id).filter(Boolean)));
  };

  const clearSelect = () => setSelected(new Set());

  // ================================
  // 편집값 저장
  // ================================
  const changeCell = (id, key, value) => {
    setEditedRows((prev) => {
      const base = prev[id] ? { ...prev[id] } : {};
      let next = { ...base, [key]: value };

      // 금액 자동 계산
      if (key === "청구운임" || key === "기사운임") {
        const sale = toInt(key === "청구운임" ? value : base.청구운임 ?? "");
        const drv = toInt(key === "기사운임" ? value : base.기사운임 ?? "");
        next.수수료 = String(sale - drv);
      }

      return { ...prev, [id]: next };
    });
  };

  // ================================
  // 상위 patch/remove 연동
  // ================================
  const patchOne = async (id, updates) => {
    try {
      if (typeof window?.RUN25_PATCH === "function") {
        await window.RUN25_PATCH(id, updates);
        return true;
      }
    } catch (e) {}

    window.dispatchEvent(
      new CustomEvent("RUN25_REQUEST_PATCH", { detail: { id, updates } })
    );
    alert("수정 요청이 전송되었습니다.");
    return true;
  };

  const removeOne = async (id) => {
    try {
      if (typeof window?.RUN25_REMOVE === "function") {
        await window.RUN25_REMOVE(id);
        return true;
      }
    } catch (e) {}

    window.dispatchEvent(
      new CustomEvent("RUN25_REQUEST_REMOVE", { detail: { id } })
    );
    return true;
  };

  const saveSelectedEdits = async () => {
    const ids = [...selected];
    if (!ids.length) return alert("선택된 항목이 없습니다.");

    for (const id of ids) {
      const updates = editedRows[id];
      if (updates) await patchOne(id, updates);
    }

    alert("선택 항목 저장 완료");
    setEditedRows({});
    clearSelect();
    setEditMode(false);
  };

  const saveAllEdits = async () => {
    const entries = Object.entries(editedRows);
    if (!entries.length) return alert("변경된 내용이 없습니다.");

    for (const [id, updates] of entries) await patchOne(id, updates);

    alert("전체 저장 완료");
    setEditedRows({});
    setEditMode(false);
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return alert("선택된 항목이 없습니다.");
    if (!confirm(`${ids.length}건을 삭제하시겠습니까?`)) return;

    for (const id of ids) await removeOne(id);

    alert("삭제 완료");
    clearSelect();
    setDeleteMode(false);
  };

  // ================================
  // 주소 더보기/접기
  // ================================
  const [expandedAddr, setExpandedAddr] = React.useState({});
  const AddressCell = ({ id, field, value }) => {
    const key = `${id}:${field}`;
    const expanded = !!expandedAddr[key];
    const text = String(value || "");
    const tooLong = text.length > 9;

    if (editMode) return <span>{text}</span>;

    return (
      <div className="flex items-center justify-center gap-1">
        <span
          className={
            expanded
              ? ""
              : "max-w-[9ch] overflow-hidden text-ellipsis whitespace-nowrap"
          }
        >
          {text}
        </span>
        {tooLong && (
          <button
            className="text-[11px] underline text-blue-600"
            onClick={() =>
              setExpandedAddr((p) => ({ ...p, [key]: !expanded }))
            }
          >
            {expanded ? "접기" : "더보기"}
          </button>
        )}
      </div>
    );
  };

  // ================================
  // 테이블 스타일
  // ================================
  const head =
    "border px-2 py-2 bg-gray-100 text-center whitespace-nowrap";
  const cell =
    "border px-2 py-1 text-center whitespace-nowrap align-middle";

  // ================================
  // 렌더링
  // ================================
  // 엑셀 다운로드
const exportExcel = () => {
  try {
    const rows = filtered.map(r => ({
      순번: r.순번, 등록일: r.등록일, 상차일: r.상차일, 상차시간: r.상차시간,
      하차일: r.하차일, 하차시간: r.하차시간, 거래처명: r.거래처명,
      상차지명: r.상차지명, 상차지주소: r.상차지주소, 하차지명: r.하차지명, 하차지주소: r.하차지주소,
      화물내용: r.화물내용, 차량종류: r.차량종류, 차량톤수: r.차량톤수,
      차량번호: r.차량번호, 이름: r.이름, 전화번호: r.전화번호,
      배차상태: r.배차상태, 청구운임: r.청구운임, 기사운임: r.기사운임, 수수료: r.수수료,
      지급방식: r.지급방식, 배차방식: r.배차방식, 메모: r.메모,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "실시간배차현황");
    XLSX.writeFile(wb, `실시간배차현황_${_todayStr()}.xlsx`);
  } catch (e) {
    console.error(e);
    alert("엑셀 내보내기 중 오류가 발생했습니다.");
  }
};

  return (
    <div className="mt-8">

      {/* ⚠ 경고창 */}
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

      {/* KPI */}
      <div className="flex flex-wrap items-center gap-5 text-sm mb-3 mt-1">
        <div>총 <b>{kpi.cnt}</b>건</div>
        <div>청구 <b className="text-blue-600">{kpi.sale.toLocaleString()}</b>원</div>
        <div>기사 <b className="text-green-600">{kpi.drv.toLocaleString()}</b>원</div>
        <div>수수료 <b className="text-amber-600">{kpi.fee.toLocaleString()}</b>원</div>
      </div>

      {/* 필터바 */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select
          className="border p-1 rounded text-sm"
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setFilterValue("");
          }}
        >
          <option value="전체">필터 없음</option>
          <option value="거래처명">거래처명</option>
          <option value="상차지명">상차지명</option>
          <option value="하차지명">하차지명</option>
          <option value="차량번호">차량번호</option>
        </select>

        {filterType !== "전체" && (
          <input
            className="border p-1 rounded text-sm"
            placeholder={`${filterType} 검색`}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
          />
        )}

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

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색..."
          className="border p-2 rounded w-56"
        />

        <button
          onClick={() => {
            setQ("");
            setFilterType("전체");
            setFilterValue(""); 
            setStartDate("");
            setEndDate("");
          }}
          className="ml-auto bg-gray-200 px-3 py-1 rounded"
        >
          초기화
        </button>

        {/* 편집/삭제/엑셀 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditMode((v) => !v);
              setDeleteMode(false);
            }}
            className={`px-3 py-1 rounded ${
              editMode ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
          >
            수정
          </button>

          <button
            onClick={() => {
              setDeleteMode((v) => !v);
              setEditMode(false);
              clearSelect();
            }}
            className={`px-3 py-1 rounded ${
              deleteMode ? "bg-red-600 text-white" : "bg-gray-200"
            }`}
          >
            삭제
          </button>

          {deleteMode && (
            <>
              <button onClick={selectAll} className="px-3 py-1 rounded border">
                전체선택
              </button>
              <button onClick={clearSelect} className="px-3 py-1 rounded border">
                선택해제
              </button>
              <button
                onClick={deleteSelected}
                className="px-3 py-1 rounded bg-red-600 text-white"
              >
                선택삭제
              </button>
            </>
          )}

          {editMode && (
            <>
              <button
                onClick={saveSelectedEdits}
                className="px-3 py-1 rounded bg-emerald-600 text-white"
              >
                선택저장
              </button>
              <button
                onClick={saveAllEdits}
                className="px-3 py-1 rounded bg-emerald-700 text-white"
              >
                전체저장
              </button>
            </>
          )}

          <button
            onClick={exportExcel}
            className="px-3 py-1 rounded border"
          >
            엑셀다운
          </button>
        </div>
      </div>

      {/* 안내 */}
      <div className="w-full bg-blue-600/90 text-white text-xs px-3 py-1 rounded mb-2">
        👉 좌우 스크롤: <b>Shift</b> + 마우스 휠 / 터치패드 제스처
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-[2000px] text-sm border">
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
    ].map((h) => (
      <th key={h} className={head}>
        {h}
      </th>
    ))}
  </tr>
</thead>


          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  className="text-center text-gray-500 py-6"
                  colSpan={deleteMode ? 27 : 26}
                >
                  📭 조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            )}

            {filtered.map((r, idx) => {
              const id = r._id;
              const sale = toInt(r.청구운임);
              const drv = toInt(r.기사운임);
              const fee = sale - drv;

              const val = (k) => editedRows[id]?.[k] ?? r[k] ?? "";

              const textCell = (k, extra = "") =>
                editMode ? (
                  <input
                    className={`border rounded px-2 py-1 w-full ${extra}`}
                    value={val(k)}
                    onChange={(e) =>
                      changeCell(id, k, e.target.value)
                    }
                  />
                ) : (
                  <span>{r[k] || ""}</span>
                );

              const numCell = (k) =>
                editMode ? (
                  <input
                    className="border rounded px-2 py-1 w-full text-right"
                    value={val(k)}
                    onChange={(e) =>
                      changeCell(
                        id,
                        k,
                        e.target.value.replace(/[^\d-]/g, "")
                      )
                    }
                  />
                ) : (
                  <span>{toInt(r[k]).toLocaleString()}</span>
                );

              const selCell = (k, opts) =>
                editMode ? (
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={val(k)}
                    onChange={(e) => changeCell(id, k, e.target.value)}
                  >
                    <option value="">선택 ▾</option>
                    {opts.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{r[k] || ""}</span>
                );

              return (
                <tr key={id} className={idx % 2 ? "bg-gray-50" : ""}>
                  {deleteMode && (
                    <td className={cell}>
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleSelect(id)}
                      />
                    </td>
                  )}

                  <td className={`${cell} w-[50px]`}>{idx + 1}</td>
                  <td className={cell}>{textCell("등록일")}</td>
                  <td className={cell}>{textCell("상차일")}</td>
                  <td className={cell}>{textCell("상차시간")}</td>
                  <td className={cell}>{textCell("하차일")}</td>
                  <td className={cell}>{textCell("하차시간")}</td>

                  <td className={cell}>{textCell("거래처명")}</td>
                  <td className={cell}>{textCell("상차지명")}</td>

                  <td className={cell}>
                    {editMode ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={val("상차지주소")}
                        onChange={(e) =>
                          changeCell(id, "상차지주소", e.target.value)
                        }
                      />
                    ) : (
                      <AddressCell
                        id={id}
                        field="상차지주소"
                        value={r.상차지주소}
                      />
                    )}
                  </td>

                  <td className={cell}>{textCell("하차지명")}</td>

                  <td className={cell}>
                    {editMode ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={val("하차지주소")}
                        onChange={(e) =>
                          changeCell(id, "하차지주소", e.target.value)
                        }
                      />
                    ) : (
                      <AddressCell
                        id={id}
                        field="하차지주소"
                        value={r.하차지주소}
                      />
                    )}
                  </td>

                  <td className={cell}>{textCell("화물내용")}</td>

                  <td className={cell}>{textCell("차량종류")}</td>
                  <td className={cell}>{textCell("차량톤수")}</td>
                  <td className={cell}>{textCell("차량번호")}</td>
                  <td className={cell}>{textCell("이름")}</td>
                  <td className={cell}>{textCell("전화번호")}</td>

                  <td className={cell}>
                    {editMode
                      ? selCell("배차상태", ["배차중", "배차완료", "미배차"])
                      : r.배차상태}
                  </td>

                  <td className={`${cell} text-right pr-2`}>
                    {numCell("청구운임")}
                  </td>
                  <td className={`${cell} text-right pr-2`}>
                    {numCell("기사운임")}
                  </td>
                  <td
                    className={`${cell} text-right pr-2 ${
                      fee < 0 ? "text-red-500" : ""
                    }`}
                  >
                    {(fee).toLocaleString()}
                  </td>

                  <td className={cell}>
                    {editMode ? selCell("지급방식", PAY_TYPES) : r.지급방식}
                  </td>

                  <td className={cell}>
                    {editMode ? selCell("배차방식", DISPATCH_TYPES) : r.배차방식}
                  </td>

                  <td className={cell}>{textCell("메모")}</td>

                  {/* 첨부 */}
                  <td className={cell}>
                    <button
                      className="px-2 py-0.5 rounded border hover:bg-gray-100 text-sm"
                      onClick={() => openAttachModal(r)}
                    >
                      📎 {attachCount[r._id] ?? 0}
                    </button>
                  </td>

                  {/* 공유 */}
                  <td className={cell}>
                    <button
                      className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
                      onClick={() => shareDispatch(r)}
                    >
                      📨
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};


  /* ------------------ 대용량 업로드 ------------------ */
const [bulkOpen, setBulkOpen] = React.useState(false);
const [bulkRows, setBulkRows] = React.useState([]);

const driverByCar = React.useMemo(() => {
  const m = new Map();
  (drivers || []).forEach((d) => {
    const key = String(d.차량번호 || "").replace(/\s+/g, "");
    if (key) m.set(key, { 이름: d.이름 || "", 전화번호: d.전화번호 || "" });
  });
  return m;
}, [drivers]);

const toInt2 = (v) => {
  const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

// 엑셀 날짜 변환
const excelDateToISO = (value) => {
  if (!value) return "";
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    const offset = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return offset.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    let v = value.trim();
    const onlyNums = v.replace(/[^0-9]/g, "");
    if (onlyNums.length === 4) {
      const mm = onlyNums.slice(0, 2);
      const dd = onlyNums.slice(2, 4);
      return `${new Date().getFullYear()}-${mm}-${dd}`;
    }
    if (onlyNums.length === 3) {
      const mm = onlyNums.slice(0, 1);
      const dd = onlyNums.slice(1, 3);
      return `${new Date().getFullYear()}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
    }
    const cleaned = v.replace(/[^\d]/g, "-").replace(/--+/g, "-");
    if (/^\d{1,2}-\d{1,2}$/.test(cleaned)) {
      const [m, d] = cleaned.split("-");
      return `${new Date().getFullYear()}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) return cleaned;
  }
  return "";
};

const onBulkFile = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
      const sheet = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
        header: 1,
        defval: "",
        blankrows: false,
      });

      const normalize = (v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "number") return String(v).trim();
        return String(v || "").trim();
      };

      const mapped = rows.slice(1).map((r, i) => {
        const cols = r.slice(0, 21).concat(Array(21).fill("")).slice(0, 21);
        const [
          상차일, 상차시간, 하차일, 하차시간,
          거래처명, 상차지명, 상차지주소, 하차지명, 하차지주소,
          화물내용, 차량종류, 차량톤수, 차량번호, 이름, 전화번호,
          청구운임, 기사운임, 수수료, 지급방식, 배차방식, 메모,
        ] = cols.map(normalize);

        const cn = String(차량번호 || "").replace(/\s+/g, "");
        const found = driverByCar.get(cn);

        const 청 = toInt2(청구운임);
        const 기 = toInt2(기사운임);
        const 수 = toInt2(수수료 || 청 - 기);

        return {
          _tmp_id: `${Date.now()}-${i}`,
          상차일: excelDateToISO(상차일),
          상차시간,
          하차일: excelDateToISO(하차일),
          하차시간,
          거래처명,
          상차지명,
          상차지주소,
          하차지명,
          하차지주소,
          화물내용,
          차량종류,
          차량톤수,
          차량번호: cn,
          이름: 이름 || found?.이름 || "",
          전화번호: 전화번호 || found?.전화번호 || "",
          청구운임: String(청),
          기사운임: String(기),
          수수료: String(수),
          지급방식,
          배차방식,
          메모,
          배차상태: cn && (found?.이름 || found?.전화번호) ? "배차완료" : "배차중",
        };
      });

      setBulkRows(mapped);
      alert(`대용량 업로드 완료 (${mapped.length}건)`);
    } catch (err) {
      console.error(err);
      alert("엑셀 업로드 오류");
    }
  };
  reader.readAsArrayBuffer(file);
};

const setBulk = (id, k, v) => {
  setBulkRows(prev => prev.map(r => {
    if (r._tmp_id !== id) return r;

    if (k === "상차지명") {
      const c = findClient(v);
      return { ...r, 상차지명: v, 상차지주소: c?.주소 || r.상차지주소 || "" };
    }
    if (k === "하차지명") {
      const c = findClient(v);
      return { ...r, 하차지명: v, 하차지주소: c?.주소 || r.하차지주소 || "" };
    }
    if (k === "청구운임" || k === "기사운임") {
      const sale = toInt2(k==="청구운임" ? v : r.청구운임);
      const drv  = toInt2(k==="기사운임" ? v : r.기사운임);
      return { ...r, [k]: v, 수수료: String(sale - drv) };
    }

    return { ...r, [k]: v };
  }));
};

  const saveBulk = async () => {
    if (!bulkRows.length) return alert("저장할 데이터가 없습니다.");
    for (const row of bulkRows) {
      const cn = String(row.차량번호 || "").replace(/\s+/g, "");
      if (!cn) continue;
      const found = driverByCar.get(cn);
      if (!found) {
        if (confirm(`차량번호 ${cn} 기사정보가 없습니다. 신규 등록할까요?`)) {
          const 이름 = prompt("기사 이름:") || "";
          const 전화번호 = prompt("전화번호:") || "";
          await upsertDriver?.({ 이름, 차량번호: cn, 전화번호 });
        }
      }
    }
    for (const row of bulkRows) {
      const rec = {
        _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        순번: nextSeq(),
        등록일: _todayStr(),
        거래처명: row.거래처명 || "",
        상차지명: row.상차지명 || "",
        상차지주소: row.상차지주소 || "",
        하차지명: row.하차지명 || "",
        하차지주소: row.하차지주소 || "",
        화물내용: row.화물내용 || "",
        차량종류: row.차량종류 || "",
        차량톤수: row.차량톤수 || "",
        차량번호: row.차량번호 || "",
        이름: row.이름 || "",
        전화번호: row.전화번호 || "",
        상차방법: row.상차방법 || "",
        하차방법: row.하차방법 || "",
        상차일: lockYear(row.상차일 || ""),
        상차시간: row.상차시간 || "",
        하차일: lockYear(row.하차일 || ""),
        하차시간: row.하차시간 || "",
        청구운임: isAdmin ? (row.청구운임 || "0") : "0",
        기사운임: isAdmin ? (row.기사운임 || "0") : "0",
        수수료: isAdmin ? String(toInt2(row.청구운임) - toInt2(row.기사운임)) : "0",
        지급방식: row.지급방식 || "",
        배차방식: row.배차방식 || "",
        메모: row.메모 || "",
        배차상태: row.차량번호 && (row.이름 || row.전화번호) ? "배차완료" : "배차중",
      };
      await addDispatch(rec);
    }
    alert(`총 ${bulkRows.length}건 저장 완료`);
    window.dispatchEvent(new Event("RUN25_REFRESH"));
    setBulkRows([]);
    setBulkOpen(false);
  };

  // ────────────────────────────────────────────────

  return (
    <div className="p-3">
      {/* ✅ 위: 입력폼 (원래 UI 그대로) */}
      {renderForm()}

      <hr className="my-6 border-t-2 border-gray-300" />

      {/* ✅ 아래: 실시간배차현황 (메뉴와 동일 기능) */}
      <RealtimeStatusEmbed />

      {/* 대용량 업로드 모달 */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-[1300px] max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <b>대용량 업로드</b>
              <div className="flex items-center gap-2">
                <input type="file" accept=".xlsx,.xls" onChange={onBulkFile} />
                <button onClick={saveBulk} className="px-3 py-2 rounded bg-emerald-600 text-white">저장</button>
                <button onClick={()=>{ setBulkRows([]); setBulkOpen(false); }} className="px-3 py-2 border rounded">닫기</button>
              </div>
            </div>
            <div className="p-4 overflow-auto">
              <table className="min-w-[1800px] text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    {[
                      "상차일","상차시간","하차일","하차시간",
                      "거래처명","상차지명","상차지주소","하차지명","하차지주소","화물내용",
                      "차량종류","차량톤수","차량번호","이름","전화번호",
                      ...(isAdmin ? ["청구운임","기사운임","수수료"] : []),
                      "지급방식","배차방식","메모"
                    ].map(h=>(<th key={h} className="border px-2 py-2">{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.length===0 ? (
                    <tr><td className="text-center text-gray-500 py-8" colSpan={isAdmin?22:19}>엑셀을 업로드하면 미리보기가 표시됩니다.</td></tr>
                  ) : bulkRows.map(r=>(
                    <tr key={r._tmp_id} className="odd:bg-white even:bg-gray-50">
                      <td className="border px-2 py-1"><input className="border rounded px-2 py-1 w-full" value={r.상차일} onChange={(e)=>setBulk(r._tmp_id,"상차일", lockYear(e.target.value))} placeholder="YYYY-MM-DD 또는 MM-DD"/></td>
                      <td className="border px-2 py-1">
                        <select className="border rounded px-2 py-1 w-full" value={r.상차시간} onChange={(e)=>setBulk(r._tmp_id,"상차시간", e.target.value)}>
                          <option value="">선택 ▾</option>{localTimeOptions.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="border px-2 py-1"><input className="border rounded px-2 py-1 w-full" value={r.하차일} onChange={(e)=>setBulk(r._tmp_id,"하차일", lockYear(e.target.value))} placeholder="YYYY-MM-DD 또는 MM-DD"/></td>
                      <td className="border px-2 py-1">
                        <select className="border rounded px-2 py-1 w-full" value={r.하차시간} onChange={(e)=>setBulk(r._tmp_id,"하차시간", e.target.value)}>
                          <option value="">선택 ▾</option>{localTimeOptions.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>

                      {["거래처명","상차지명","상차지주소","하차지명","하차지주소","화물내용","차량종류","차량톤수","차량번호","이름","전화번호","지급방식","배차방식","메모"].map(k=>(
                        <td key={k} className="border px-2 py-1">
                          <input className="border rounded px-2 py-1 w-full" value={r[k]||""} onChange={(e)=>setBulk(r._tmp_id,k, e.target.value)} />
                        </td>
                      ))}

                      {isAdmin && (
                        <>
                          <td className="border px-2 py-1"><input className="border rounded px-2 py-1 w-full text-right" value={r.청구운임} onChange={(e)=>setBulk(r._tmp_id,"청구운임", e.target.value.replace(/[^\d-]/g,""))} /></td>
                          <td className="border px-2 py-1"><input className="border rounded px-2 py-1 w-full text-right" value={r.기사운임} onChange={(e)=>setBulk(r._tmp_id,"기사운임", e.target.value.replace(/[^\d-]/g,""))} /></td>
                          <td className="border px-2 py-1 text-right text-blue-700 font-semibold">{(toInt2(r.청구운임)-toInt2(r.기사운임)).toLocaleString()}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 3/8) — END =====================
// ===================== DispatchApp.jsx (PART 4/8 — START) =====================
function RealtimeStatus({
  dispatchData,
  drivers,
  patchDispatch,
  removeDispatch,
  upsertDriver,
  role = "admin",
}) {
  const [q, setQ] = React.useState("");
  const [filterType, setFilterType] = React.useState("거래처명");
  const [filterValue, setFilterValue] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [rows, setRows] = React.useState(dispatchData || []);
  const [selected, setSelected] = React.useState([]);
  const [selectedEditMode, setSelectedEditMode] = React.useState(false);
  const [edited, setEdited] = React.useState({});

  // 삭제건 재등장 방지
  const [deletedIds, setDeletedIds] = React.useState(() => new Set());
  // 하이라이트
  const [highlightIds, setHighlightIds] = React.useState(() => new Set());
  const [savedHighlightIds, setSavedHighlightIds] = React.useState(() => new Set());

  // 신규 기사 등록 중복 방지
  const [isRegistering, setIsRegistering] = React.useState(false);

  // 주소 더보기
  const [expandedAddr, setExpandedAddr] = React.useState({});

  // 상차 임박 경고
  const [warningList, setWarningList] = React.useState([]);

  // -----------------------------------------------------
  //   ⬇⬇⬇⬇⬇  🔥 추가 ① : 첨부파일 개수 로딩
  // -----------------------------------------------------
  const [attachCount, setAttachCount] = React.useState({});

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
        } catch (e) {
          result[row._id] = 0;
        }
      }
      setAttachCount(result);
    };

    load();
  }, [dispatchData]);

  // -----------------------------------------------------
  //   ⬇⬇⬇⬇⬇  🔥 추가 ② : 공유 기능 shareDispatch
  // -----------------------------------------------------
const shareDispatch = (row) => {
  const uploadUrl = `${window.location.origin}/upload?id=${row._id}`;

  const msg = `
📦 [배차 정보]

🟦 거래처: ${row.거래처명 || ""}
📍 상차지: ${row.상차지명 || ""} / ${row.상차지주소 || ""}
📍 하차지: ${row.하차지명 || ""} / ${row.하차지주소 || ""}

⏰ 상차: ${row.상차일 || ""} ${row.상차시간 || ""}
⏰ 하차: ${row.하차일 || ""} ${row.하차시간 || ""}

🚚 차량: ${row.차량번호 || ""} / ${row.이름 || ""} (${row.전화번호 || ""})
💰 운임: ${(row.청구운임 || 0).toLocaleString()}원

📝 메모:
${row.메모 || ""}

📎 사진 업로드 링크:
${uploadUrl}
  `.trim();

  navigator.clipboard.writeText(msg);
  alert("📋 공유 메시지가 복사되었습니다!");
};

  // -----------------------------------------------------
  //   🔥 여기까지 추가 끝. 아래는 네 기존 코드 그대로 유지
  // -----------------------------------------------------


  // 🔥 Firestore → rows 동기화
  React.useEffect(() => {
    const base = (dispatchData || []).filter(
      (r) => !!r && !deletedIds.has(r._id)
    );

    setRows((prev) => {
      const map = new Map(base.map((r) => [r._id, r]));

      const merged = prev
        .filter((r) => map.has(r._id))
        .map((r) => ({ ...r, ...map.get(r._id) }));

      const newOnes = base.filter((r) => !prev.some((p) => p._id === r._id));

      return [...merged, ...newOnes];
    });
  }, [dispatchData, deletedIds]);


  // =================================
  // 한국시간(KST)
  // =================================
  const todayKST = () => {
    const now = new Date();
    now.setHours(now.getHours() + 9);
    return now.toISOString().slice(0, 10);
  };


  const toInt = (v) => {
    const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };
  const formatComma = (num) => {
    const n = toInt(num);
    return n ? n.toLocaleString() : "";
  };

  // 차량번호 정규화
  const normalizePlate = React.useCallback(
    (s) => String(s || "").replace(/\s+/g, "").replace(/[-.]/g, "").trim(),
    []
  );

  // 최신 driverMap
  const driverMap = (() => {
    const m = new Map();
    (drivers || []).forEach((d) => {
      const key = normalizePlate(d.차량번호);
      if (key) m.set(key, d);
    });
    return m;
  })();


  // ========================
  // 📌 차량번호 입력 처리
  // ========================
  const handleCarInput = async (id, rawVal, keyEvent) => {
    if (keyEvent && keyEvent.key !== "Enter") return;
    if (isRegistering) return;

    const v = normalizePlate(rawVal);
    const idx = rows.findIndex((r) => r._id === id);
    if (idx === -1) return;
    const oldRow = rows[idx];

    // 차량번호 삭제
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
      return;
    }

    // 기존 기사 자동매칭
    const match = driverMap.get(v);
    if (match) {
      const isStatusChanging = oldRow.배차상태 !== "배차완료";

      const updated = {
        차량번호: match.차량번호,
        이름: match.이름,
        전화번호: match.전화번호,
        배차상태: "배차완료",
      };

      setRows((prev) => {
        const updatedRows = prev.map((r) =>
          r._id === id ? { ...r, ...updated } : r
        );

        const target = updatedRows.find((r) => r._id === id);
        const done = updatedRows.filter(
          (r) => r._id !== id && r.배차상태 === "배차완료"
        );
        const wait = updatedRows.filter((r) => r.배차상태 !== "배차완료");
        return [target, ...done, ...wait];
      });

      await patchDispatch?.(id, updated);

      if (isStatusChanging) {
        setHighlightIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });

        setTimeout(() => {
          setHighlightIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 1000);
      }

      return;
    }

    // 신규 기사 등록
    const ok = confirm(`차량번호 [${rawVal}] 신규 기사로 등록할까요?`);
    if (!ok) return;

    setIsRegistering(true);

    const 입력이름 = prompt("신규 기사 이름을 입력하세요");
    if (!입력이름) {
      setIsRegistering(false);
      return;
    }

    const 입력전화 = prompt("전화번호를 입력하세요");
    if (!입력전화) {
      setIsRegistering(false);
      return;
    }

    const newDriver = { 이름: 입력이름, 차량번호: rawVal, 전화번호: 입력전화 };
    await upsertDriver?.(newDriver);

    const updated = {
      차량번호: rawVal,
      이름: 입력이름,
      전화번호: 입력전화,
      배차상태: "배차완료",
    };

    setRows((prev) => {
      const next = prev.map((r) => (r._id === id ? { ...r, ...updated } : r));
      const done = next.filter((r) => r.배차상태 === "배차완료");
      const wait = next.filter((r) => r.배차상태 !== "배차완료");
      return [...done, ...wait];
    });

    await patchDispatch?.(id, updated);

    setHighlightIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setHighlightIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1000);

    setIsRegistering(false);

    alert("신규 기사 등록 완료");
  };


  // ========================
  // 📌 필터 + KPI 처리
  // ========================
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
      data = data.filter((r) => isInRange(r.상차일, startDate, endDate));
    }

    if (filterType && filterValue) {
      data = data.filter((r) =>
        String(r[filterType] || "").includes(filterValue)
      );
    }

    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) =>
          String(v || "").toLowerCase().includes(lower)
        )
      );
    }

    const order = { 배차중: 0, 배차완료: 1 };
    const indexMap = new Map(rows.map((r, i) => [r._id, i]));

    data.sort((a, b) => {
      const oa = order[a.배차상태] ?? 99;
      const ob = order[b.배차상태] ?? 99;
      if (oa !== ob) return oa - ob;
      return (indexMap.get(a._id) ?? 0) - (indexMap.get(b._id) ?? 0);
    });

    return data;
  }, [rows, q, filterType, filterValue, startDate, endDate]);


  const kpi = React.useMemo(() => {
    const sale = filtered.reduce((a, r) => a + toInt(r.청구운임), 0);
    const drv = filtered.reduce((a, r) => a + toInt(r.기사운임), 0);
    return { cnt: filtered.length, sale, drv, fee: sale - drv };
  }, [filtered]);


  // =========================================
  //  ⚠ 상차 2시간 전 경고
  // =========================================
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

      const timeStr = String(r.상차시간).padStart(5, "0");
      const dt = new Date(`${r.상차일}T${timeStr}:00`);
      if (isNaN(dt.getTime())) return;

      const diff = dt.getTime() - now.getTime();
      if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
        temp.push(r);
      }
    });

    setWarningList(temp);
  }, [rows]);


  // ========================
  // 📌 선택 체크
  // ========================
  const toggleSelect = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );


  // ========================
  // 📌 선택 삭제
  // ========================
  const handleDeleteSelected = async () => {
    if (!selected.length) return alert("삭제할 항목을 선택하세요.");
    if (!confirm(`${selected.length}건을 삭제하시겠습니까?`)) return;

    for (const id of selected) {
      try {
        await removeDispatch(id);
      } catch (e) {}
    }

    setRows((prev) => prev.filter((r) => !selected.includes(r._id)));

    setDeletedIds((prev) => {
      const next = new Set(prev);
      selected.forEach((id) => next.add(id));
      return next;
    });

    alert("삭제 완료");
    setSelected([]);
  };


  // ========================
  // 📌 선택수정 저장
  // ========================
  const handleEditChange = (id, key, value) => {
    setEdited((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: value },
    }));
  };

  const handleSaveSelected = async () => {
    const ids = selected.length ? selected : Object.keys(edited);
    if (!ids.length) return alert("변경된 내용이 없습니다.");

    for (const id of ids) {
      const changes = edited[id];
      if (changes && Object.keys(changes).length) {
        await patchDispatch?.(id, changes);
      }
    }

    setSavedHighlightIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    setTimeout(() => {
      setSavedHighlightIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, 1000);

    alert("저장 완료");
    setEdited({});
    setSelectedEditMode(false);
  };


  // ------------------------------------------
  // 📌 엑셀다운
  // ------------------------------------------
  const handleExcel = () => {
    if (!filtered.length) return alert("내보낼 데이터가 없습니다.");

    const headers = [
      "순번",
      "등록일",
      "상차일",
      "하차일",
      "거래처명",
      "상차지명",
      "하차지명",
      "화물내용",
      "차량종류",
      "차량톤수",
      "차량번호",
      "기사명",
      "전화번호",
      "배차상태",
      "청구운임",
      "기사운임",
      "수수료",
      "지급방식",
      "배차방식",
      "메모",
    ];

    const rowsForExcel = filtered.map((r, idx) => ({
      순번: idx + 1,
      등록일: r.등록일 || "",
      상차일: r.상차일 || "",
      하차일: r.하차일 || "",
      거래처명: r.거래처명 || "",
      상차지명: r.상차지명 || "",
      하차지명: r.하차지명 || "",
      화물내용: r.화물내용 || "",
      차량종류: r.차량종류 || "",
      차량톤수: r.차량톤수 || "",
      차량번호: r.차량번호 || "",
      기사명: r.이름 || "",
      전화번호: r.전화번호 || "",
      배차상태: r.배차상태 || "",
      청구운임: formatComma(r.청구운임),
      기사운임: formatComma(r.기사운임),
      수수료: formatComma(toInt(r.청구운임) - toInt(r.기사운임)),
      지급방식: r.지급방식 || "",
      배차방식: r.배차방식 || "",
      메모: r.메모 || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rowsForExcel, { header: headers });
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "실시간배차현황");
    XLSX.writeFile(wb, "실시간배차현황.xlsx");
  };


  // ------------------------------------------
  // 📌 수정 가능 여부
  // ------------------------------------------
  const canEdit = (key, id) => {
    if (!(selectedEditMode && selected.includes(id))) return false;
    const readOnly = ["등록일", "순번", "차량번호", "배차상태", "이름", "전화번호"];
    return !readOnly.includes(key);
  };

  // ------------------------------------------
  // 📌 editable input
  // ------------------------------------------
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
          <option value="24(외주업체)">24(외주업체)</option>
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
    const stateKey = `${rowId}_${key}`;
    const isExpanded = !!expandedAddr[stateKey];

    const display =
      text.length <= 12 || isExpanded ? text : text.slice(0, 12) + "...";

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
                [stateKey]: !prev[stateKey],
              }))
            }
          >
            {isExpanded ? "접기" : "더보기"}
          </button>
        )}
      </div>
    );
  };

  const head =
    "border px-2 py-2 bg-gray-100 text-center whitespace-nowrap";
  const cell =
    "border px-2 py-[2px] text-center align-middle whitespace-nowrap overflow-hidden text-ellipsis leading-tight";
  const addrCell = `${cell} min-w-[80px] max-w-[160px]`;


  // ------------------------------------------
  // 📌 화면 렌더
  // ------------------------------------------
  return (
    <div className="p-3 w-full">
      <h2 className="text-lg font-bold mb-2">실시간 배차현황</h2>

      {/* 경고 */}
      {warningList.length > 0 && (
        <div className="bg-red-100 border border-red-400 text-red-800 p-3 rounded mb-3 text-sm">
          <b>⚠ 배차 경고!</b>{" "}
          상차 2시간 이하 남았는데 차량번호가 없는 건이{" "}
          <b>{warningList.length}</b>건 있습니다.
          <ul className="list-disc ml-5 mt-1 space-y-0.5">
            {warningList.map((r) => (
              <li key={r._id}>
                [{r.상차일} {r.상차시간}] {r.상차지명 || "-"} (거래처:{" "}
                {r.거래처명 || "-"})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI */}
      <div className="flex flex-wrap items-center gap-5 text-sm mb-3 mt-1">
        <div>
          총 <b>{kpi.cnt}</b>건
        </div>
        <div>
          청구{" "}
          <b className="text-blue-600">{kpi.sale.toLocaleString()}</b>원
        </div>
        <div>
          기사{" "}
          <b className="text-green-600">{kpi.drv.toLocaleString()}</b>원
        </div>
        <div>
          수수료{" "}
          <b className="text-amber-600">{kpi.fee.toLocaleString()}</b>
          원
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border p-2 rounded"
        >
          {["거래처명", "상차지명", "하차지명", "차량번호", "이름"].map(
            (f) => (
              <option key={f} value={f}>
                {f}
              </option>
            )
          )}
        </select>

        <input
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          placeholder={`${filterType} 검색`}
          className="border p-2 rounded"
        />

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border p-2 rounded"
        />
        <span>~</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border p-2 rounded"
        />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="통합 검색..."
          className="border p-2 rounded w-64"
        />

        <button
          onClick={() => {
            setFilterType("거래처명");
            setFilterValue("");
            setStartDate("");
            setEndDate("");
            setQ("");
          }}
          className="border px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200"
        >
          초기화
        </button>
      </div>

      {/* 상단 버튼 */}
      <div className="flex justify-end gap-2 mb-2">
        <button
          onClick={() => {
            if (selected.length === 0)
              return alert("수정할 항목을 먼저 선택하세요.");
            setSelectedEditMode(true);
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

        <button
          onClick={handleExcel}
          className="bg-green-600 text-white px-3 py-1 rounded"
        >
          엑셀다운
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

              const highlightCell = highlightIds.has(r._id)
                ? "animate-pulse bg-green-200"
                : "";

              return (
                <tr
                  key={r._id}
                  className={`
                    ${idx % 2 ? "bg-gray-50" : ""}
                    ${
                      selected.includes(r._id)
                        ? "animate-pulse bg-yellow-100"
                        : ""
                    }
                    ${
                      highlightIds.has(r._id)
                        ? "animate-pulse bg-green-200"
                        : ""
                    }
                    ${
                      savedHighlightIds.has(r._id)
                        ? "animate-pulse bg-yellow-200"
                        : ""
                    }
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

                  <td className={cell}>
                    {editableInput("상차일", r.상차일, r._id)}
                  </td>

                  <td className={cell}>
                    {editableInput("상차시간", r.상차시간, r._id)}
                  </td>

                  <td className={cell}>
                    {editableInput("하차일", r.하차일, r._id)}
                  </td>
                  <td className={cell}>
                    {editableInput("하차시간", r.하차시간, r._id)}
                  </td>

                  <td className={cell}>
                    {editableInput("거래처명", r.거래처명, r._id)}
                  </td>
                  <td className={cell}>
                    {editableInput("상차지명", r.상차지명, r._id)}
                  </td>

                  <td className={addrCell}>
                    {renderAddrCell("상차지주소", r.상차지주소, r._id)}
                  </td>

                  <td className={cell}>
                    {editableInput("하차지명", r.하차지명, r._id)}
                  </td>
                  <td className={addrCell}>
                    {renderAddrCell("하차지주소", r.하차지주소, r._id)}
                  </td>

                  <td className={cell}>
                    {editableInput("화물내용", r.화물내용, r._id)}
                  </td>
                  <td className={cell}>
                    {editableInput("차량종류", r.차량종류, r._id)}
                  </td>
                  <td className={cell}>
                    {editableInput("차량톤수", r.차량톤수, r._id)}
                  </td>

                  {/* 차량번호 */}
                  <td className={`${cell} ${highlightCell}`}>
                    <input
                      type="text"
                      className="border p-1 rounded w-[110px]"
                      defaultValue={r.차량번호 || ""}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handleCarInput(r._id, e.currentTarget.value, e)
                      }
                      onBlur={(e) =>
                        handleCarInput(r._id, e.currentTarget.value)
                      }
                    />
                  </td>

                  <td className={`${cell} ${highlightCell}`}>{r.이름}</td>
                  <td className={`${cell} ${highlightCell}`}>
                    {r.전화번호}
                  </td>

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
                          handleEditChange(
                            r._id,
                            "청구운임",
                            e.target.value
                          )
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
                          handleEditChange(
                            r._id,
                            "기사운임",
                            e.target.value
                          )
                        }
                      />
                    ) : (
                      formatComma(r.기사운임)
                    )}
                  </td>

                  <td className={`${cell} text-right pr-2`}>
                    <span
                      className={
                        fee < 0 ? "text-red-600" : "text-blue-600"
                      }
                    >
                      {formatComma(fee)}
                    </span>
                  </td>

                  <td className={cell}>
                    {editableInput("지급방식", r.지급방식, r._id)}
                  </td>
                  <td className={cell}>
                    {editableInput("배차방식", r.배차방식, r._id)}
                  </td>

                  <td className={cell}>
                    {editableInput("메모", r.메모, r._id)}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 4/8 — END) =====================

// ===================== DispatchApp.jsx (PART 5/8 — 차량번호 항상 활성화 + 선택수정→수정완료 통합버튼 + 주소 더보기 완전본 + 대용량업로드 추가) =====================
function DispatchStatus({
  dispatchData = [],
  setDispatchData,
  drivers = [],
  patchDispatch,
  removeDispatch,
  upsertDriver,
}) {
  const [q, setQ] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [editMode, setEditMode] = React.useState(false);
  const [edited, setEdited] = React.useState({});
  const [justSaved, setJustSaved] = React.useState([]);
  const [carInputLock, setCarInputLock] = React.useState(false);
  const [bulkRows, setBulkRows] = React.useState([]);

  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const getId = (r) => r._id || r.id || r._fsid;

  // =============================================
// ✅ 대용량 업로드 (엑셀 → Firestore + 상태 반영 완전본)
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

    const mapped = json.map((row) => ({
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
    }));

    if (!mapped.length) {
      alert("❌ 엑셀 데이터가 없습니다.");
      return;
    }

    if (!confirm(`${mapped.length}건을 업로드하시겠습니까?`)) return;

    try {
      for (const item of mapped) {
        if (patchDispatch) {
          await patchDispatch(item._id, item);
        }
      }

      setDispatchData((prev) => [...prev, ...mapped]);

      alert("✅ 대용량 업로드 완료되었습니다.");
    } catch (err) {
      console.error(err);
      alert("❌ 업로드 중 오류 발생");
    }
  };

  reader.readAsArrayBuffer(file);
};


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

  // ✅ 차량번호 입력 → 기사/전화 자동 채움 + 배차완료로 전환 + Firestore 즉시 저장 + 로컬 상태 반영
  const handleCarInput = async (row, val) => {
    if (carInputLock) return;
    setCarInputLock(true);
    try {
      const v = (val || "").trim().replace(/\s+/g, "");
      const id = getId(row);

      // 공란 → 배차중으로 복귀
      if (!v) {
        const patch = { 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중" };
        if (patchDispatch) await patchDispatch(id, patch);
        setDispatchData((p) => p.map((r) => (getId(r) === id ? { ...r, ...patch } : r)));
        return;
      }

      const f = drivers.find(
        (d) => String(d.차량번호 || "").replace(/\s+/g, "") === v
      );

      if (f) {
        const patch = {
          차량번호: f.차량번호,
          이름: f.이름 || "",
          전화번호: f.전화번호 || "",
          배차상태: "배차완료",
        };
        if (patchDispatch) await patchDispatch(id, patch);
        setDispatchData((p) => p.map((r) => (getId(r) === id ? { ...r, ...patch } : r)));
        return;
      }

      // 신규 기사 등록 플로우
      const 이름 = prompt("신규 기사 이름:");
      if (!이름) return;
      const 전화번호 = prompt("전화번호:") || "";
      await upsertDriver?.({ 이름, 차량번호: v, 전화번호 });

      const patch = { 차량번호: v, 이름, 전화번호, 배차상태: "배차완료" };
      if (patchDispatch) await patchDispatch(id, patch);
      setDispatchData((p) => p.map((r) => (getId(r) === id ? { ...r, ...patch } : r)));
      alert("신규 기사 등록 완료!");
    } finally {
      setTimeout(() => setCarInputLock(false), 300);
    }
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

  // ✅ 선택수정 → 수정완료 시 하이라이트 + 자동 스크롤
const handleEditToggle = async () => {
  if (!editMode) {
    if (!selected.size) return alert("수정할 항목을 선택하세요.");
    setEditMode(true);
  } else {
    const ids = Object.keys(edited);
    if (!ids.length) {
      setEditMode(false);
      return alert("변경된 내용이 없습니다.");
    }
    if (!confirm("수정된 내용을 저장하시겠습니까?")) return;

    // 🔹 Firestore 및 로컬 상태에 반영
    for (const id of ids) await _patch(id, edited[id]);

    // 🔹 하이라이트 표시할 ID 기록
    setJustSaved(ids);
    setEdited({});
    setEditMode(false);

    // 🔹 자동 스크롤: 첫 수정된 행으로 이동
    if (ids.length > 0) {
      const firstId = ids[0];
      const el = document.getElementById(`row-${firstId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // 🔹 하이라이트 유지 1.2초 후 제거
    setTimeout(() => setJustSaved([]), 1200);
    alert("수정 완료 ✅");
  }
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

  const downloadExcel = () => {
    const rows = dispatchData.map((r, i) => ({
      순번: i + 1,
      등록일: r.등록일,
      상차일: r.상차일,
      상차시간: r.상차시간,
      하차일: r.하차일,
      하차시간: r.하차시간,
      거래처명: r.거래처명,
      상차지명: r.상차지명,
      상차지주소: r.상차지주소,
      하차지명: r.하차지명,
      하차지주소: r.하차지주소,
      화물내용: r.화물내용,
      차량종류: r.차량종류,
      차량톤수: r.차량톤수,
      차량번호: r.차량번호,
      기사명: r.이름,
      전화번호: r.전화번호,
      배차상태: r.배차상태,
      청구운임: toInt(r.청구운임).toLocaleString("ko-KR"),
      기사운임: toInt(r.기사운임).toLocaleString("ko-KR"),
      수수료: toInt(r.수수료).toLocaleString("ko-KR"),
      지급방식: r.지급방식,
      배차방식: r.배차방식,
      메모: r.메모,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "배차현황");
    XLSX.writeFile(wb, "배차현황.xlsx");
  };

  // ✅ 정렬: 배차중 먼저, 그 다음 배차완료(최신일자/시간 내림차순)
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
      // 1) 배차중 우선
      if (a.배차상태 === "배차중" && b.배차상태 !== "배차중") return -1;
      if (a.배차상태 !== "배차중" && b.배차상태 === "배차중") return 1;
      // 2) 동일 상태 내에서는 상차일/상차시간 최신순 (내림차순)
      const ad = a.상차일 || "";
      const bd = b.상차일 || "";
      if (ad !== bd) return bd.localeCompare(ad);
      const at = a.상차시간 || "";
      const bt = b.상차시간 || "";
      if (at !== bt) return bt.localeCompare(at);
      // 3) 마지막으로 등록일 최신순
      return (b.등록일 || "").localeCompare(a.등록일 || "");
    });
    return data;
  }, [dispatchData, q, startDate, endDate]);

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

  return (
    <div className="p-3">
      <h2 className="text-lg font-bold mb-3">배차현황</h2>

      <div className="flex flex-wrap items-center gap-5 text-sm mb-2">
        <div>
          총 <b>{summary.totalCount}</b>건
        </div>
        <div>
          청구{" "}
          <b className="text-blue-600">
            {summary.totalSale.toLocaleString()}
          </b>
          원
        </div>
        <div>
          기사{" "}
          <b className="text-green-600">
            {summary.totalDriver.toLocaleString()}
          </b>
          원
        </div>
        <div>
          수수료{" "}
          <b className="text-amber-600">
            {summary.totalFee.toLocaleString()}
          </b>
          원
        </div>
      </div>

      <div className="flex justify-between items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <input
            className="border p-2 rounded w-52"
            placeholder="검색어"
            value={q}
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
        </div>

        <div className="flex items-center gap-2">
          {/* ✅ 대용량 업로드 버튼 */}
          <label className="px-3 py-2 rounded bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700">
            대용량 업로드
            <input type="file" accept=".xlsx,.xls" hidden onChange={handleBulkFile} />
          </label>
          <button className="px-3 py-2 rounded bg-yellow-500 text-white" onClick={handleEditToggle}>
            {editMode ? "수정완료" : "선택수정"}
          </button>
          <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={removeSelectedRows}>
            선택삭제
          </button>
          <button className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={downloadExcel}>
            엑셀다운
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-auto min-w-max text-sm border table-auto">
          <thead className="bg-gray-100">
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
                "차량번호",
                "기사명",
                "전화번호",
                "배차상태",
                "청구운임",
                "기사운임",
                "수수료",
                "지급방식",
                "배차방식",
                "메모",
              ].map((h) => (
                <th key={h} className="border px-2 py-2 text-center whitespace-nowrap">
                  {h === "선택" ? (
                    <input
                      type="checkbox"
                      onChange={() => toggleAll(filtered)}
                      checked={filtered.length && filtered.every((r) => selected.has(getId(r)))}
                    />
                  ) : (
                    h
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r, i) => {
              const id = getId(r);
              const row = edited[id] ? { ...r, ...edited[id] } : r;
              const fee = toInt(row.청구운임) - toInt(row.기사운임);
              const editableKeys = [
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
                "지급방식",
                "배차방식",
                "메모",
                "청구운임",
                "기사운임",
              ];

              return (
                <tr
  id={`row-${id}`}  // ✅ 행 식별용 ID 추가
  key={id || i}
  className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${
    justSaved.includes(id) ? "animate-pulse bg-emerald-200" : ""
  }`}
>
                  <td className="border text-center">
                    <input type="checkbox" checked={selected.has(id)} onChange={() => toggleOne(id)} />
                  </td>
                  <td className="border text-center">{i + 1}</td>
                  <td className="border text-center whitespace-nowrap">{row.등록일}</td>

                  {[
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
                  ].map((key) => (
                    <td key={key} className="border text-center whitespace-nowrap">
                      {editMode && selected.has(id) && editableKeys.includes(key) ? (
                        <input
                          className="border rounded px-1 py-0.5 w-full text-center"
                          defaultValue={row[key] || ""}
                          onChange={(e) => updateEdited(row, key, e.target.value)}
                        />
                      ) : key === "상차지주소" || key === "하차지주소" ? (
                        <AddressCell text={row[key] || ""} max={5} />
                      ) : (
                        row[key]
                      )}
                    </td>
                  ))}

                  {/* 차량번호 항상 활성화 */}
                  <td className="border text-center">
                    <input
                      className="border rounded px-1 py-0.5 text-center w-[90px]"
                      defaultValue={row.차량번호 || ""}
                      onKeyDown={(e) => e.key === "Enter" && handleCarInput(row, e.target.value)}
                      onBlur={(e) => handleCarInput(row, e.target.value)}
                    />
                  </td>

                  <td className="border text-center">{row.이름}</td>
                  <td className="border text-center">{row.전화번호}</td>
                  <td className="border text-center">
                    <StatusBadge s={row.배차상태} />
                  </td>

                  {["청구운임", "기사운임"].map((key) => (
                    <td key={key} className="border text-right pr-2">
                      {editMode && selected.has(id) ? (
                        <input
                          className="border rounded px-1 py-0.5 text-right w-full"
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

                  {["지급방식", "배차방식"].map((key) => (
                    <td key={key} className="border text-center">
                      {editMode && selected.has(id) ? (
                        <input
                          className="border rounded px-1 py-0.5 w-full text-center"
                          defaultValue={row[key] || ""}
                          onChange={(e) => updateEdited(row, key, e.target.value)}
                        />
                      ) : (
                        row[key]
                      )}
                    </td>
                  ))}

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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ✅ 주소 더보기 */
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
              <button onClick={() => setOpen(false)} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ✅ 메모 더보기 */
function MemoCell({ text }) {
  const [showFull, setShowFull] = React.useState(false);
  if (!text) return <span className="text-gray-400">-</span>;
  const isLong = String(text).length > 5;
  const short = isLong ? String(text).slice(0, 5) + "…" : String(text);

  return (
    <div className="relative inline-block">
      <span>{showFull ? text : short}</span>
      {isLong && !showFull && (
        <button onClick={() => setShowFull(true)} className="text-blue-600 text-xs ml-1 underline">
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
            <div className="text-sm whitespace-pre-wrap break-words">{String(text)}</div>
            <div className="text-right mt-4">
              <button onClick={() => setShowFull(false)} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 5/8 — END) =====================



// ===================== DispatchApp.jsx (PART 6/8) — START =====================


function Settlement({ dispatchData }){
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
  const [clientFilter,setClientFilter]=useState("");

  const toInt=(v)=>{ const n=parseInt(String(v||"0").replace(/[^\d-]/g,""),10); return isNaN(n)?0:n; };
  const todayStrLocal=()=>new Date().toISOString().slice(0,10);
  const monthKey=()=>new Date().toISOString().slice(0,7);
  const prevMonthKey=()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); };
  const isInRange=(d,s,e)=>{ if(!d) return false; if(s && d<s) return false; if(e && d>e) return false; return true; };

  const baseRows = Array.isArray(dispatchData)?dispatchData:[];
  const rangeRows = useMemo(()=>{
    let rows=baseRows.filter(r=>(r.배차상태||"")==="배차완료");
    if(clientFilter) rows=rows.filter(r=>(r.거래처명||"")===clientFilter);
    if(startDate||endDate) rows=rows.filter(r=>isInRange((r.상차일||""),startDate,endDate));
    return rows.sort((a,b)=>(a.상차일||"").localeCompare(b.상차일||""));
  },[baseRows,startDate,endDate,clientFilter]);

  const mKey=monthKey(); const pKey=prevMonthKey(); const today=todayStrLocal();
  const monthRows=useMemo(()=>baseRows.filter(r=>(r.배차상태||"")==="배차완료" && String(r.상차일||"").startsWith(mKey)),[baseRows,mKey]);
  const prevMonthRows=useMemo(()=>baseRows.filter(r=>(r.배차상태||"")==="배차완료" && String(r.상차일||"").startsWith(pKey)),[baseRows,pKey]);
  const todayRows=useMemo(()=>baseRows.filter(r=>(r.배차상태||"")==="배차완료" && (r.상차일||"")===today),[baseRows,today]);

  const sumBy=(rows,key)=>rows.reduce((a,r)=>a+toInt(r[key]),0);
  const kpi = {
    월매출: sumBy(monthRows,"청구운임"),
    월기사: sumBy(monthRows,"기사운임"),
    당일매출: sumBy(todayRows,"청구운임"),
    당일기사: sumBy(todayRows,"기사운임"),
    전월매출: sumBy(prevMonthRows,"청구운임"),
  };
  kpi.월수수료 = kpi.월매출 - kpi.월기사;
  kpi.당일수수료 = kpi.당일매출 - kpi.당일기사;
  kpi.전월증감 = kpi.월매출 - kpi.전월매출;
  kpi.전월증감률 = kpi.전월매출 ? ((kpi.전월증감 / kpi.전월매출) * 100) : 0;
  const monthProfitRate = kpi.월매출>0 ? (kpi.월수수료/kpi.월매출)*100 : 0;

  const rangeTotals = useMemo(()=>{
    const 매출=sumBy(rangeRows,"청구운임");
    const 기사=sumBy(rangeRows,"기사운임");
    const 수수료=매출-기사;
    return { 매출, 기사, 수수료 };
  },[rangeRows]);

  const clients = useMemo(()=>{
    const s=new Set(); baseRows.forEach(r=>{ if(r.거래처명) s.add(r.거래처명); }); return Array.from(s).sort((a,b)=>a.localeCompare(b,'ko'));
  },[baseRows]);

  const clientAgg = useMemo(()=>{
    const map=new Map();
    for(const r of rangeRows){
      const c=r.거래처명||"미지정"; const sale=toInt(r.청구운임); const driver=toInt(r.기사운임); const fee=sale-driver;
      const prev=map.get(c)||{ 거래처명:c, 건수:0, 매출:0, 기사:0, 수수료:0 };
      prev.건수+=1; prev.매출+=sale; prev.기사+=driver; prev.수수료+=fee;
      map.set(c,prev);
    }
    const arr=Array.from(map.values()); arr.sort((a,b)=>b.매출-a.매출);
    return arr;
  },[rangeRows]);

  const topClients = useMemo(()=>clientAgg.slice(0,5),[clientAgg]);
  const riskyClients = useMemo(()=>{
    const arr = clientAgg.map(r=>({ ...r, rate: r.매출>0 ? (r.수수료/r.매출)*100 : 0 }))
      .filter(r=>r.매출>0 && r.rate<10).sort((a,b)=>b.매출-a.매출).slice(0,5);
    return arr;
  },[clientAgg]);

  const monthDaily = useMemo(()=>{
    const add=(rows, yyyymm)=>{
      const m=new Map();
      rows.forEach(r=>{
        const d=r.상차일||""; if(!d.startsWith(yyyymm)) return;
        const day=parseInt(d.slice(8,10),10)||0; const sale=toInt(r.청구운임);
        m.set(day, (m.get(day)||0)+sale);
      });
      return Array.from(m.entries()).map(([day,sum])=>({ day, sum })).sort((a,b)=>a.day-b.day);
    };
    const cur=add(monthRows,mKey); const prev=add(prevMonthRows,pKey);
    const maxDay=Math.max(cur.at(-1)?.day||0, prev.at(-1)?.day||0, 1);
    const xs=Array.from({length:maxDay},(_,i)=>i+1);
    const y1=xs.map(d=>cur.find(x=>x.day===d)?.sum||0);
    const y2=xs.map(d=>prev.find(x=>x.day===d)?.sum||0);
    return xs.map((d,i)=>({ x:String(d).padStart(2,"0"), y1:y1[i], y2:y2[i] }));
  },[monthRows,prevMonthRows,mKey,pKey]);

  const dailyTrend = useMemo(()=>{
    const m=new Map();
    for(const r of rangeRows){
      const d=r.상차일||""; if(!d) continue;
      const sale=toInt(r.청구운임); const driver=toInt(r.기사운임); const fee=sale-driver;
      const prev=m.get(d)||{ date:d, 매출:0, 기사:0, 수수료:0 };
      prev.매출+=sale; prev.기사+=driver; prev.수수료+=fee; m.set(d,prev);
    }
    return Array.from(m.values()).sort((a,b)=>a.date.localeCompare(b.date));
  },[rangeRows]);

  const won=(n)=>`${(n||0).toLocaleString()}원`;

  const downloadExcel=()=>{
    try{
      if(!window.XLSX && typeof XLSX==="undefined"){ alert("엑셀 라이브러리가 로드되지 않았습니다. (XLSX)"); return; }
      const summaryRows=[
        { 항목:"기간시작", 값:startDate||"-" },{ 항목:"기간종료", 값:endDate||"-" },{ 항목:"거래처", 값:clientFilter||"전체" },{},
        { 항목:"기간 매출", 값:rangeTotals.매출 },{ 항목:"기간 기사운반비", 값:rangeTotals.기사 },{ 항목:"기간 수수료", 값:rangeTotals.수수료 },{},
        { 항목:"이번달 매출", 값:kpi.월매출 },{ 항목:"이번달 기사운반비", 값:kpi.월기사 },{ 항목:"이번달 수수료", 값:kpi.월수수료 },
        { 항목:"이번달 평균 이익률(%)", 값:Number(monthProfitRate.toFixed(1)) },{},
        { 항목:"전월 매출", 값:kpi.전월매출 },{ 항목:"전월 대비 증감", 값:kpi.전월증감 },{ 항목:"전월 대비 증감률(%)", 값:Number(kpi.전월증감률.toFixed(1)) },
      ];
      const wsSummary=XLSX.utils.json_to_sheet(summaryRows);
      const wsClients=XLSX.utils.json_to_sheet(clientAgg.map(r=>({ 거래처명:r.거래처명, 건수:r.건수, 매출:r.매출, 기사운반비:r.기사, 수수료:r.수수료, 이익률:r.매출>0?Number(((r.수수료/r.매출)*100).toFixed(1)):0 })));
      const wsDetail=XLSX.utils.json_to_sheet(rangeRows.map((r,i)=>({ 순번:i+1, 상차일:r.상차일||"", 거래처명:r.거래처명||"", 차량번호:r.차량번호||"", 기사이름:r.이름||"", 청구운임:toInt(r.청구운임), 기사운임:toInt(r.기사운임), 수수료:toInt(r.청구운임)-toInt(r.기사운임), 메모:r.메모||"" })));
      const wsTrend=XLSX.utils.json_to_sheet(dailyTrend.map(d=>({ 일자:d.date, 매출:d.매출, 기사운반비:d.기사, 수수료:d.수수료 })));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, "요약");
      XLSX.utils.book_append_sheet(wb, wsClients, "거래처별집계");
      XLSX.utils.book_append_sheet(wb, wsDetail, "상세목록");
      XLSX.utils.book_append_sheet(wb, wsTrend, "일자트렌드");
      XLSX.writeFile(wb, `매출관리_${startDate||"all"}~${endDate||"all"}.xlsx`);
    }catch(err){ console.error(err); alert("엑셀 내보내기 중 오류가 발생했습니다."); }
  };

  const headBaseLocal = typeof headBase==="string" ? headBase : "px-3 py-2 border bg-gray-50 text-center";
  const cellBaseLocal = typeof cellBase==="string" ? cellBase : "px-3 py-2 border text-center";

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">매출관리</h2>
      {monthProfitRate<15 && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2"><span className="font-semibold">⚠ 이번달 평균 이익률 {monthProfitRate.toFixed(1)}%</span><span className="text-rose-600"> (목표 15% 미만)</span></div>}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">시작일</label><input type="date" className="border p-2 rounded" value={startDate} onChange={(e)=>setStartDate(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">종료일</label><input type="date" className="border p-2 rounded" value={endDate} onChange={(e)=>setEndDate(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">거래처</label>
          <select className="border p-2 rounded min-w-[200px]" value={clientFilter} onChange={(e)=>setClientFilter(e.target.value)}>
            <option value="">전체</option>{clients.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="button" onClick={()=>{setStartDate(""); setEndDate(""); setClientFilter("");}} className="px-3 py-2 rounded bg-gray-200">필터 초기화</button>
        <button type="button" onClick={downloadExcel} className="ml-auto px-3 py-2 rounded bg-blue-600 text-white">엑셀 다운로드</button>
      </div>

      <div className="grid grid-cols-3 xl:grid-cols-8 gap-3 mb-4">
        <KpiCard title="월 매출" value={kpi.월매출} />
        <KpiCard title="월 기사운반비" value={kpi.월기사} />
        <KpiCard title="월 수수료" value={kpi.월수수료} accent />
        <KpiMiniRate title="이번달 평균 이익률" rate={monthProfitRate} />
        <KpiCard title="전월 매출" value={kpi.전월매출} subtle />
        <KpiDeltaCard title="전월 대비" diff={kpi.전월증감} rate={kpi.전월증감률} />
        <KpiCard title="당일 매출" value={kpi.당일매출} />
        <KpiCard title="당일 수수료" value={kpi.당일수수료} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <SumCard label="기간 매출" value={won(rangeTotals.매출)} />
        <SumCard label="기간 기사운반비" value={won(rangeTotals.기사)} />
        <SumCard label="기간 수수료" value={won(rangeTotals.수수료)} highlight />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ChartPanel title="🏆 Top5 거래처 (매출 기준)">
          {topClients.length===0 ? <div className="text-gray-500 text-sm">표시할 데이터가 없습니다.</div> :
            <SimpleBars data={topClients.map(d=>({ label:d.거래처명, value:d.매출 }))} max={Math.max(1,...topClients.map(d=>d.매출))} valueLabel={(v)=>won(v)} />}
        </ChartPanel>
        <ChartPanel title="⚠ 주의 거래처 (이익률 10% 미만)">
          {riskyClients.length===0 ? <div className="text-gray-500 text-sm">이익률 10% 미만 거래처가 없습니다.</div> :
            <div className="space-y-2">
              {riskyClients.map(d=>(
                <div key={d.거래처명} className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <div className="truncate font-medium text-rose-700">{d.거래처명}</div>
                  <div className="text-xs text-rose-700">매출 {d.매출.toLocaleString()}원 · 수수료 {d.수수료.toLocaleString()}원 · 이익률 {(d.rate).toFixed(1)}%</div>
                </div>
              ))}
            </div>}
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ChartPanel title={`전월 대비 일자 매출 (이번달 ${mKey} vs 전월 ${pKey})`}>
          <SimpleLine data={monthDaily.map(d=>({ x:d.x, y1:d.y1, y2:d.y2 }))} series={[{key:"y1",name:"이번달 매출"},{key:"y2",name:"전월 매출"}]} />
        </ChartPanel>
        <ChartPanel title="기간 일자 트렌드 (매출/수수료/기사)">
          <SimpleLine data={dailyTrend.map(d=>({ x:d.date.slice(5), y1:d.매출, y2:d.수수료, y3:d.기사 }))} series={[{key:"y1",name:"매출"},{key:"y2",name:"수수료"},{key:"y3",name:"기사운반비"}]} />
        </ChartPanel>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold mb-2">거래처별 기간 집계</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className={headBaseLocal}>거래처명</th><th className={headBaseLocal}>건수</th><th className={headBaseLocal}>매출</th>
                <th className={headBaseLocal}>기사운반비</th><th className={headBaseLocal}>수수료</th><th className={headBaseLocal}>이익률</th>
              </tr>
            </thead>
            <tbody>
              {clientAgg.length===0 ? (
                <tr><td className="text-center text-gray-500 py-6" colSpan={6}>조건에 맞는 데이터가 없습니다.</td></tr>
              ) : clientAgg.map(r=>{
                const rateNum=r.매출>0?(r.수수료/r.매출)*100:0; const rateStr=r.매출>0?rateNum.toFixed(1)+"%":"-";
                const colorClass=r.매출>0 && rateNum<10 ? "text-red-600 font-semibold" : "text-gray-700";
                return (
                  <tr key={r.거래처명} className="odd:bg-white even:bg-gray-50 text-center">
                    <td className={cellBaseLocal}>{r.거래처명}</td>
                    <td className={cellBaseLocal}>{r.건수}</td>
                    <td className={cellBaseLocal}>{r.매출.toLocaleString()}</td>
                    <td className={cellBaseLocal}>{r.기사.toLocaleString()}</td>
                    <td className={`${cellBaseLocal} text-blue-600 font-semibold`}>{r.수수료.toLocaleString()}</td>
                    <td className={`${cellBaseLocal} ${colorClass}`}>{rateStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">기간 상세 목록</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead>
              <tr>
                <th className={headBaseLocal}>순번</th><th className={headBaseLocal}>상차일</th><th className={headBaseLocal}>거래처명</th>
                <th className={headBaseLocal}>차량번호</th><th className={headBaseLocal}>이름</th>
                <th className={headBaseLocal}>청구운임</th><th className={headBaseLocal}>기사운임</th><th className={headBaseLocal}>수수료</th>
              </tr>
            </thead>
            <tbody>
              {rangeRows.length===0 ? (
                <tr><td className="text-center text-gray-500 py-6" colSpan={8}>기간/거래처 조건에 맞는 데이터가 없습니다.</td></tr>
              ) : rangeRows.map((r,i)=>(
                <tr key={r._id||i} className={i%2===0?"bg-white":"bg-gray-50"}>
                  <td className={cellBaseLocal}>{i+1}</td>
                  <td className={cellBaseLocal}>{r.상차일||""}</td>
                  <td className={cellBaseLocal}>{r.거래처명||""}</td>
                  <td className={cellBaseLocal}>{r.차량번호||""}</td>
                  <td className={cellBaseLocal}>{r.이름||""}</td>
                  <td className={cellBaseLocal}>{(toInt(r.청구운임)).toLocaleString()}</td>
                  <td className={cellBaseLocal}>{(toInt(r.기사운임)).toLocaleString()}</td>
                  <td className={cellBaseLocal}>{(toInt(r.청구운임)-toInt(r.기사운임)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* 보조 카드/차트 컴포넌트 (동일) */
function KpiCard({ title, value, accent, subtle }){
  const base = subtle ? "bg-gray-50 border-gray-200" : accent ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200";
  return <div className={`rounded-2xl p-3 border shadow-sm ${base}`}><p className="text-xs text-gray-500">{title}</p><p className="text-xl font-bold mt-1">{Number(value||0).toLocaleString()}원</p></div>;
}
function KpiMiniRate({ title, rate }){
  const danger=rate<10, warn=rate>=10 && rate<15;
  const base = danger?"bg-rose-50 border-rose-200 text-rose-700" : warn?"bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return <div className={`rounded-2xl p-3 border shadow-sm ${base}`}><p className="text-xs">{title}</p><p className="text-xl font-bold mt-1">{(rate||0).toFixed(1)}%</p></div>;
}
function KpiDeltaCard({ title, diff, rate }){
  const up=diff>=0;
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${up?"bg-blue-50 border-blue-200":"bg-rose-50 border-rose-200"}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`text-xl font-bold mt-1 ${up?"text-blue-700":"text-rose-700"}`}>{`${diff>=0?"+":""}${Number(diff||0).toLocaleString()}원`}</p>
      <p className={`text-xs ${up?"text-blue-700":"text-rose-700"}`}>{`${rate>=0?"+":""}${(rate||0).toFixed(1)}%`}</p>
    </div>
  );
}
function SumCard({ label, value, highlight }){
  return <div className={`rounded-2xl p-4 text-center border ${highlight?"bg-blue-50 border-blue-200":"bg-white border-gray-200"} shadow-sm`}><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>;
}
function ChartPanel({ title, children }){ return <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4"><h4 className="font-semibold mb-3">{title}</h4>{children}</div>; }
function SimpleBars({ data, max, barClass="bg-blue-500", valueLabel }){
  const safeMax=Math.max(1,max||1);
  return (
    <div className="space-y-2">
      {data.length===0 ? <div className="text-gray-500 text-sm">표시할 데이터가 없습니다.</div> :
        data.map(d=>{
          const pct=Math.round((d.value/safeMax)*100);
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-36 truncate text-xs text-gray-700" title={d.label}>{d.label}</div>
              <div className="flex-1 h-4 bg-gray-100 rounded"><div className={`h-4 rounded ${barClass}`} style={{width:`${pct}%`}} /></div>
              <div className="w-28 text-right text-xs text-gray-600">{valueLabel?valueLabel(d.value):d.value}</div>
            </div>
          );
        })}
    </div>
  );
}
function SimpleLine({ data, series }){
  const width=560, height=280, padding={left:40,right:10,top:10,bottom:24};
  const xs=data.map(d=>d.x); const xCount=xs.length||1;
  const allY=[]; data.forEach(d=>series.forEach(s=>allY.push(d[s.key]||0)));
  const yMax=Math.max(1,...allY), yMin=0;
  const xScale=(i)=>padding.left + (i*(width-padding.left-padding.right))/Math.max(1,xCount-1);
  const yScale=(v)=>padding.top + (height-padding.top-padding.bottom)*(1-(v-yMin)/(yMax-yMin));
  const makePath=(key)=> data.length===0 ? "" : data.map((d,i)=>`${i===0?"M":"L"} ${xScale(i)} ${yScale(d[key]||0)}`).join(" ");
  const colors=["#2563eb","#ef4444","#10b981","#6b7280"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[300px]">
      {Array.from({length:5}).map((_,i)=>{ const yVal=yMin+((yMax-yMin)*i)/4; const y=yScale(yVal);
        return (<g key={i}><line x1={padding.left} x2={width-padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" /><text x={4} y={y+4} fontSize="10" fill="#6b7280">{Math.round(yVal).toLocaleString()}</text></g>);
      })}
      {xs.map((d,i)=>{ const show=i===0 || i===xCount-1 || i%Math.ceil(xCount/6)===0; if(!show) return null; const x=xScale(i);
        return (<text key={i} x={x} y={height-2} fontSize="10" textAnchor="middle" fill="#6b7280">{d}</text>);
      })}
      {series.map((s,idx)=><path key={s.key} d={makePath(s.key)} fill="none" stroke={colors[idx%colors.length]} strokeWidth="2" />)}
      {series.map((s,idx)=>(<g key={s.key} transform={`translate(${padding.left + idx*140}, ${padding.top + 8})`}><rect width="12" height="12" fill={colors[idx%colors.length]} rx="2" /><text x="16" y="11" fontSize="12" fill="#374151">{s.name}</text></g>))}
    </svg>
  );
}
// ===================== DispatchApp.jsx (PART 6/8) — END =====================
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

      {/* ========== 탭: 거래명세서 (기존 그대로) ========== */}
      {tab === "invoice" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">거래처</label>
              <select className="border p-2 rounded min-w-[220px]" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">거래처 선택</option>
                {clients.map((c) => (<option key={c.거래처명} value={c.거래처명}>{c.거래처명}</option>))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">시작일</label>
              <input type="date" className="border p-2 rounded" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">종료일</label>
              <input type="date" className="border p-2 rounded" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>

            <div className="ml-auto flex gap-2">
              <button onClick={downloadInvoiceExcel} className="bg-emerald-600 text-white px-3 py-2 rounded">📊 엑셀 다운로드</button>
              <button onClick={savePDF} className="bg-blue-600 text-white px-3 py-2 rounded">📄 PDF 저장</button>
              <button onClick={() => setShowEdit(true)} className="border px-3 py-2 rounded">거래처 정보</button>
            </div>
          </div>

          <div id="invoiceArea" className="w-[1200px] mx-auto bg-white border-2 border-blue-400 rounded-2xl shadow-md overflow-hidden text-[15px]">
            <h2 className="text-3xl font-extrabold text-blue-800 text-center mt-6 mb-1">거래명세서</h2>
            {(start || end) && (
              <p className="text-center text-gray-600 font-medium mb-2">
                거래기간 : {start || "시작일"} ~ {end || "종료일"}
              </p>
            )}
            <p className="text-center text-gray-500 mb-4">(공급자 및 공급받는자 기재)</p>

            <div className="grid grid-cols-2 border-t-2 border-blue-400 mx-6 mb-6 rounded overflow-hidden">
              <table className="w-full border border-blue-200 text-sm">
                <thead>
                  <tr><th colSpan="2" className="bg-blue-100 text-blue-900 font-bold text-center p-2 border-b">공급받는자</th></tr>
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
                      <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center w-28">{k}</td>
                      <td className="border p-2">{v || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="w-full border border-blue-200 text-sm">
                <thead>
                  <tr><th colSpan="2" className="bg-blue-100 text-blue-900 font-bold text-center p-2 border-b">공급자</th></tr>
                </thead>
                <tbody>
                  <tr><td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center w-28">상호</td><td className="border p-2">{COMPANY_PRINT.name}</td></tr>
                  <tr>
                    <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">대표자</td>
                    <td className="border p-2 relative">
                      {COMPANY_PRINT.ceo} (인)
                      <img src={COMPANY_PRINT.seal} alt="seal" className="absolute right-4 top-1 h-8 w-8 opacity-80" />
                    </td>
                  </tr>
                  <tr><td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">사업자번호</td><td className="border p-2">{COMPANY_PRINT.bizNo}</td></tr>
                  <tr><td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">주소</td><td className="border p-2">{COMPANY_PRINT.addr}</td></tr>
                  <tr><td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">업태</td><td className="border p-2">{COMPANY_PRINT.type}</td></tr>
                  <tr><td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">종목</td><td className="border p-2">{COMPANY_PRINT.item}</td></tr>
                </tbody>
              </table>
            </div>

            {/* 상세 내역 */}
            <div className="overflow-x-auto px-6 pb-6">
              <table className="w-full text-sm border border-blue-300">
                <thead>
                  <tr className="bg-blue-50 text-blue-900 font-semibold text-center">
                    {["No", "상하차지", "화물명", "기사명", "공급가액", "세액(10%)"].map((h) => (
                      <th key={h} className="border border-blue-300 p-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapped.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-gray-500 py-8">표시할 내역이 없습니다.</td></tr>
                  ) : (
                    mapped.map((m) => (
                      <tr key={m.idx} className="odd:bg-white even:bg-blue-50">
                        <td className="border border-blue-300 p-2 text-center">{m.idx}</td>
                        <td className="border border-blue-300 p-2">{m.상하차지}</td>
                        <td className="border border-blue-300 p-2">{m.화물명}</td>
                        <td className="border border-blue-300 p-2 text-center">{m.기사명}</td>
                        <td className="border border-blue-300 p-2 text-right">{won(m.공급가액)}</td>
                        <td className="border border-blue-300 p-2 text-right">{won(m.세액)}</td>
                      </tr>
                    ))
                  )}
                  {mapped.length > 0 && (
                    <tr className="bg-blue-100 font-bold">
                      <td colSpan={4} className="border border-blue-300 p-2 text-center">합계</td>
                      <td className="border border-blue-300 p-2 text-right">{won(합계공급가)}</td>
                      <td className="border border-blue-300 p-2 text-right">{won(합계세액)}</td>
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
                {["거래처명", "사업자번호", "대표자", "업태", "종목", "주소", "담당자", "연락처"].map((k) => (
                  <div key={k} className="mb-3">
                    <label className="block text-sm font-medium mb-1">{k}</label>
                    <input className="border p-2 w-full rounded" value={editInfo[k] || ""} onChange={(e) => setEditInfo({ ...editInfo, [k]: e.target.value })} />
                  </div>
                ))}
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowEdit(false)} className="px-3 py-2 border rounded">닫기</button>
                  <button onClick={saveEdit} className="px-3 py-2 bg-blue-600 text-white rounded">저장</button>
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
              <select className="border p-2 rounded min-w-[220px]" value={selClient} onChange={(e)=>{ setSelClient(e.target.value); clearSel(); }}>
                <option value="">거래처 선택</option>
                {clientOptions8.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">월</label>
              <select className="border p-2 rounded min-w-[120px]" value={monthFilter} onChange={(e)=>setMonthFilter(e.target.value)}>
                <option value="all">전체</option>
                {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>(
                  <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">정산상태</label>
              <select className="border p-2 rounded min-w-[120px]" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
                <option value="전체">전체</option>
                <option value="미정산">미정산</option>
                <option value="정산완료">정산완료</option>
              </select>
            </div>

            <button
              onClick={()=>{ setSelClient(""); setMonthFilter("all"); setStatusFilter("전체"); clearSel(); }}
              className="px-3 py-2 rounded bg-gray-200"
            >필터 초기화</button>

            <div className="ml-auto flex gap-2">
              <button
                onClick={settleSelected}
                className={`px-3 py-2 rounded text-white ${selectedMonths.size ? "bg-emerald-600" : "bg-emerald-600/50 cursor-not-allowed"}`}
                disabled={!selectedMonths.size}
              >선택 정산완료</button>
              <button
                onClick={settleAll}
                className={`px-3 py-2 rounded text-white ${monthRows.length ? "bg-emerald-700" : "bg-emerald-700/50 cursor-not-allowed"}`}
                disabled={!monthRows.length}
              >전체 정산완료</button>
              <button onClick={downloadMonthExcel} className="px-3 py-2 rounded bg-blue-600 text-white">📥 엑셀 다운로드</button>
            </div>
          </div>

          {/* KPI */}
          <div className="flex flex-wrap gap-2 text-xs md:text-sm mb-3">
            <span className="px-2 py-1 rounded bg-gray-100">연도 <b>{THIS_YEAR}</b></span>
            <span className="px-2 py-1 rounded bg-blue-50 text-blue-800">거래처 <b>{selClient || "-"}</b></span>
            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-800">표시 월 <b>{monthFilter==="all" ? "전체" : `${THIS_YEAR}-${monthFilter}`}</b></span>
            <span className="px-2 py-1 rounded bg-rose-50 text-rose-700">총 청구금액 <b>{kpi.amt.toLocaleString()}</b>원</span>
            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">선택 월 <b>{selectedMonths.size}</b>개</span>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="min-w-[900px] text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 border text-center">
                    <input
                      type="checkbox"
                      onChange={()=>toggleAllMonths(monthRows)}
                      checked={selectedMonths.size>0 && selectedMonths.size===monthRows.length}
                      aria-label="전체선택"
                    />
                  </th>
                  {["순번","청구월","거래처명","총 청구금액","정산상태","정산일","메모"].map(h=>(
                    <th key={h} className="px-3 py-2 border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!selClient ? (
                  <tr><td className="text-center text-gray-500 py-6" colSpan={8}>거래처를 선택하세요.</td></tr>
                ) : monthRows.length===0 ? (
                  <tr><td className="text-center text-gray-500 py-6" colSpan={8}>표시할 데이터가 없습니다.</td></tr>
                ) : (
                  monthRows.map((row, idx)=>(
                    <tr key={row.yyyymm} className={idx%2===0 ? "bg-white" : "bg-gray-50"}>
                      {/* 선택 */}
                      <td className="px-3 py-2 border text-center">
                        <input type="checkbox" checked={selectedMonths.has(row.yyyymm)} onChange={()=>toggleMonthSelect(row.yyyymm)} />
                      </td>
                      <td className="px-3 py-2 border text-center">{idx+1}</td>
                      <td className="px-3 py-2 border text-center">{row.yyyymm}</td>
                      <td className="px-3 py-2 border text-center">{row.거래처명}</td>
                      <td className="px-3 py-2 border text-right">{won(row.총청구금액)}</td>

                      {/* 정산상태 — 클릭 토글 */}
                      <td
                        className="px-3 py-2 border text-center cursor-pointer select-none"
                        title="클릭하여 미정산/정산완료 전환"
                        onClick={()=>toggleMonthStatus(row)}
                      >
                        <StatusBadge status={row.정산상태} />
                      </td>

                      <td className="px-3 py-2 border text-center">{row.정산일 || ""}</td>
                      <td className="px-3 py-2 border"></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            · 상태 클릭 시 해당 <b>거래처·월</b>의 모든 오더에
            <code className="mx-1 px-1 bg-gray-100 rounded">정산상태["YYYY-MM"]</code> / 
            <code className="mx-1 px-1 bg-gray-100 rounded">정산일["YYYY-MM"]</code>이 저장됩니다. (상차일 기준)
          </div>
        </div>
      )}
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 8/8) — 거래명세서 + 미수금관리(월집계/토글/선택/전체정산) — END =====================





// ===================== DispatchApp.jsx (PART 9/9 — 지급관리 V3 최종) — START =====================
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

  // ---------- 드롭다운 옵션 ----------
  const PAY_METHODS = ["계산서","선불","착불"];
  const DISPATCH_METHODS = ["24시","직접배차","인성"];

  // 거래처 옵션(목록만)
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
    const seen = new Set(); const res = [];
    for (const r of rows) {
      if (!seen.has(r.차량번호)) { seen.add(r.차량번호); res.push(r.차량번호); }
      if (res.length >= 80) break;
    }
    return res;
  }, [dispatchData]);

  // 기사 인덱스 (차량번호 → {이름,전화})
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
  const filtered = useMemo(()=>{
    let rows = [...base];
    if (statusFilter !== "전체") rows = rows.filter(r => (r.지급상태 || "지급중") === statusFilter);
    if (payStart) rows = rows.filter(r => (r.지급일 || "") >= payStart);
    if (payEnd)   rows = rows.filter(r => (r.지급일 || "") <= payEnd);
    if (loadStart) rows = rows.filter(r => (r.상차일 || "") >= loadStart);
    if (loadEnd)   rows = rows.filter(r => (r.상차일 || "") <= loadEnd);
    const car = carNoQ.trim().toLowerCase();
    const name = nameQ.trim().toLowerCase();
    const client = clientQ.trim().toLowerCase();
    if (car)    rows = rows.filter(r => String(r.차량번호||"").toLowerCase().includes(car));
    if (name)   rows = rows.filter(r => String(r.이름||"").toLowerCase().includes(name));
    if (client) rows = rows.filter(r => String(r.거래처명||"").toLowerCase().includes(client));
    rows.sort((a,b)=> (a.상차일||"").localeCompare(b.상차일||"") || (toInt(a.순번)-toInt(b.순번)));
    return rows;
  }, [base, statusFilter, payStart, payEnd, carNoQ, nameQ, clientQ, loadStart, loadEnd]);

  // ---------- 선택/지급 ----------
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(r => r._id)));
  };
  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const nxt = new Set(prev);
      if (nxt.has(id)) nxt.delete(id); else nxt.add(id);
      return nxt;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkPayDone = async (ids) => {
    if (!ids.length) return alert("선택된 항목이 없습니다.");
    const now = todayStr9();
    for (const id of ids) {
      await patchDispatchDirect(id, { 지급상태: "지급완료", 지급일: now });
    }
    alert(`지급완료 처리: ${ids.length}건`);
  };
  const bulkPayUndone = async (ids) => {
    if (!ids.length) return alert("선택된 항목이 없습니다.");
    for (const id of ids) {
      await patchDispatchDirect(id, { 지급상태: "지급중", 지급일: "" });
    }
    alert(`미지급 처리: ${ids.length}건`);
  };

  // ---------- 지급상태 토글 (행 단위, 수정모드와 무관) ----------
  const togglePayStatus = async (row) => {
    const cur = row.지급상태 || "지급중";
    const next = (cur === "지급중") ? "지급완료" : "지급중";
    const patch = { 지급상태: next, 지급일: (next === "지급완료" ? todayStr9() : "") };
    await patchDispatchDirect(row._id, patch);
  };

  // ---------- 수정 모드 (상단 버튼 1개로 전체 전환) ----------
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({}); // { id: {필드:값} }

  const enterEdit = () => {
    const d = {};
    filtered.forEach(r => {
      d[r._id] = {
        상차일: r.상차일 || "",
        거래처명: r.거래처명 || "",
        상차지명: r.상차지명 || "",
        상차지주소: r.상차지주소 || "",
        하차지명: r.하차지명 || "",
        하차지주소: r.하차지주소 || "",
        차량번호: r.차량번호 || "",
        // 이름/전화번호는 수정불가(자동매칭 전용)
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
  const cancelEdit = () => { setEditMode(false); setDraft({}); };
  const setD = (id,k,v)=> setDraft(prev=>({ ...prev, [id]: { ...(prev[id]||{}), [k]: v }}));

  // 차량번호 입력 후 Enter → 기사 자동매칭 / 미등록시 팝업
  const openDriverRegisterModal = (carNo, row) => {
    if (typeof showDriverRegisterModal === "function") {
      try { showDriverRegisterModal({ 차량번호: carNo, 이름: row?.이름||"", 전화번호: row?.전화번호||"" }); return; } catch {}
    }
    if (typeof openRegisterDriverModal === "function") {
      try { openRegisterDriverModal({ 차량번호: carNo, 이름: row?.이름||"", 전화번호: row?.전화번호||"" }); return; } catch {}
    }
    alert("신규 기사 등록창을 연결해 주세요. (showDriverRegisterModal 사용)");
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

  const saveAll = async () => {
    const jobs = [];
    filtered.forEach(r => {
      const cur = draft[r._id]; if (!cur) return;
      const patch = {};
      const keys = [
        "상차일","거래처명","상차지명","상차지주소","하차지명","하차지주소",
        "차량번호","이름","전화번호","지급방식","배차방식",
        "청구운임","기사운임","지급일","메모"
      ];
      keys.forEach(k=>{
        const orig = (k==="청구운임"||k==="기사운임") ? String(r[k]||"") : (r[k]||"");
        const val  = cur[k] ?? "";
        if (String(val) !== String(orig)) patch[k] = val;
      });
      if (Object.keys(patch).length) jobs.push(patchDispatchDirect(r._id, patch));
    });
    if (jobs.length) await Promise.all(jobs);
    setEditMode(false); setDraft({});
    alert("저장되었습니다");
  };

  // ---------- KPI ----------
  const kpi = useMemo(()=>{
    const cnt = filtered.length;
    const sale = filtered.reduce((s,r)=> s + toInt(r.청구운임), 0);
    const driver = filtered.reduce((s,r)=> s + toInt(r.기사운임), 0);
    const fee = sale - driver;
    const done = filtered.filter(r => (r.지급상태||"지급중")==="지급완료").length;
    return { cnt, sale, driver, fee, done };
  }, [filtered]);

  // ---------- 엑셀 다운 (주소 포함) ----------
  const downloadExcel = () => {
    if (!filtered.length) { alert("내보낼 데이터가 없습니다."); return; }
    const rows = filtered.map((r,i)=>({
      순번: r.순번 || i+1,
      상차일: r.상차일 || "",
      거래처명: r.거래처명 || "",
      상차지명: r.상차지명 || "",
      상차지주소: r.상차지주소 || "",
      하차지명: r.하차지명 || "",
      하차지주소: r.하차지주소 || "",
      차량번호: r.차량번호 || "",
      이름: r.이름 || "",
      전화번호: r.전화번호 || "",
      지급방식: r.지급방식 || "",
      배차방식: r.배차방식 || "",
      청구운임: toInt(r.청구운임),
      기사운임: toInt(r.기사운임),
      수수료: toInt(r.청구운임) - toInt(r.기사운임),
      지급상태: r.지급상태 || "지급중",
      지급일: r.지급일 || "",
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
        <span className="px-2 py-1 rounded bg-gray-100">총 건수 <b>{kpi.cnt.toLocaleString()}</b>건</span>
        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">총 청구 <b>{kpi.sale.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">총 기사 <b>{kpi.driver.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700">총 수수료 <b>{kpi.fee.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800">지급완료 <b>{kpi.done.toLocaleString()}</b>건</span>
      </div>

      {/* 필터/액션 바 */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급상태</label>
          <select className="border p-2 rounded min-w-[140px]" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
            <option value="전체">전체</option>
            <option value="지급중">지급중</option>
            <option value="지급완료">지급완료</option>
          </select>
        </div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">지급일 시작</label><input type="date" className="border p-2 rounded" value={payStart} onChange={(e)=>setPayStart(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">지급일 종료</label><input type="date" className="border p-2 rounded" value={payEnd} onChange={(e)=>setPayEnd(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">상차일 시작</label><input type="date" className="border p-2 rounded" value={loadStart} onChange={(e)=>setLoadStart(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">상차일 종료</label><input type="date" className="border p-2 rounded" value={loadEnd} onChange={(e)=>setLoadEnd(e.target.value)} /></div>
        <input className="border p-2 rounded" placeholder="차량번호" value={carNoQ} onChange={(e)=>setCarNoQ(e.target.value)} />
        <input className="border p-2 rounded" placeholder="기사명" value={nameQ} onChange={(e)=>setNameQ(e.target.value)} />
        <input className="border p-2 rounded" placeholder="거래처명" value={clientQ} onChange={(e)=>setClientQ(e.target.value)} />
        <button
          onClick={()=>{ setStatusFilter("전체"); setPayStart(""); setPayEnd(""); setCarNoQ(""); setNameQ(""); setClientQ(""); setLoadStart(""); setLoadEnd(""); }}
          className="px-3 py-2 rounded bg-gray-200"
        >필터 초기화</button>

        <div className="ml-auto flex gap-2">
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

      {/* 선택 표시 줄 */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={toggleAll} className="px-3 py-2 rounded border">전체선택/해제</button>
        <button onClick={clearSelection} className="px-3 py-2 rounded border">선택해제</button>
        <span className="text-sm text-gray-600">선택: {selectedIds.size}건</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1700px] text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className={head}>
                <input type="checkbox" onChange={toggleAll} checked={selectedIds.size>0 && selectedIds.size===filtered.length} aria-label="전체선택"/>
              </th>
              {[
                "순번","상차일","거래처명","상차지명","상차지주소","하차지명","하차지주소",
                "차량번호","이름","전화번호","지급방식","배차방식",
                "청구운임","기사운임","수수료","지급상태","지급일","메모"
              ].map(h=>(<th key={h} className={head}>{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 ? (
              <tr><td className="text-center text-gray-500 py-6" colSpan={19}>표시할 데이터가 없습니다.</td></tr>
            ) : filtered.map((r, i) => {
              const d = draft[r._id] || {};
              const fee = toInt(editMode ? d.청구운임 : r.청구운임) - toInt(editMode ? d.기사운임 : r.기사운임);

              return (
                <tr key={r._id||i} className={i%2===0 ? "bg-white" : "bg-gray-50"}>
                  {/* 선택 */}
                  <td className={cell}>
                    <input type="checkbox" checked={selectedIds.has(r._id)} onChange={()=>toggleOne(r._id)} />
                  </td>

                  {/* 순번 (읽기전용) */}
                  <td className={cell}>{r.순번 || i+1}</td>

                  {/* 상차일 */}
                  <td className={cell}>
                    {!editMode ? roText(r.상차일||"") : (
                      <input type="date" className={`${input} ${editableCls}`} value={d.상차일 ?? ""} onChange={(e)=>setD(r._id,"상차일", e.target.value)} />
                    )}
                  </td>

                  {/* 거래처명 (드롭다운) */}
                  <td className={cell}>
                    {!editMode ? roText(r.거래처명||"") : (
                      <select className={`${input} ${editableCls}`} value={d.거래처명 ?? ""} onChange={(e)=>setD(r._id,"거래처명", e.target.value)}>
                        <option value="">선택</option>
                        {clientOptions.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    )}
                  </td>

                  {/* 상차지/주소 */}
                  <td className={cell}>
                    {!editMode ? roText(r.상차지명||"") : (
                      <input className={`${input} ${editableCls}`} value={d.상차지명 ?? ""} onChange={(e)=>setD(r._id,"상차지명", e.target.value)} />
                    )}
                  </td>
                  <td className={cell}>
                    {!editMode ? roText(r.상차지주소||"") : (
                      <input className={`${input} ${editableCls}`} value={d.상차지주소 ?? ""} onChange={(e)=>setD(r._id,"상차지주소", e.target.value)} />
                    )}
                  </td>

                  {/* 하차지/주소 */}
                  <td className={cell}>
                    {!editMode ? roText(r.하차지명||"") : (
                      <input className={`${input} ${editableCls}`} value={d.하차지명 ?? ""} onChange={(e)=>setD(r._id,"하차지명", e.target.value)} />
                    )}
                  </td>
                  <td className={cell}>
                    {!editMode ? roText(r.하차지주소||"") : (
                      <input className={`${input} ${editableCls}`} value={d.하차지주소 ?? ""} onChange={(e)=>setD(r._id,"하차지주소", e.target.value)} />
                    )}
                  </td>

                  {/* 차량번호 — 수정모드에서만 입력 + Enter 자동매칭, 평상시 텍스트 */}
                  <td className={cell}>
                    {!editMode ? roText(r.차량번호||"") : (
                      <>
                        <input
                          list="carNos-list"
                          className={`${input} ${editableCls}`}
                          value={d.차량번호 ?? ""}
                          onChange={(e)=>setD(r._id,"차량번호", e.target.value)}
                          onKeyDown={onCarKeyDown(r)}
                          placeholder="차량번호"
                        />
                        <datalist id="carNos-list">
                          {recentCarNos.map(cn => (<option key={cn} value={cn} />))}
                        </datalist>
                      </>
                    )}
                  </td>

                  {/* 이름/전화번호 — 항상 읽기전용(자동매칭 전용) */}
                  <td className={cell}>{roText(editMode ? (d.이름 ?? r.이름) : (r.이름||""))}</td>
                  <td className={cell}>{roText(editMode ? (d.전화번호 ?? r.전화번호) : (r.전화번호||""))}</td>

                  {/* 지급방식/배차방식 */}
                  <td className={cell}>
                    {!editMode ? roText(r.지급방식||"") : (
                      <select className={`${input} ${editableCls}`} value={d.지급방식 ?? ""} onChange={(e)=>setD(r._id,"지급방식", e.target.value)}>
                        <option value="">선택</option>
                        {PAY_METHODS.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </td>
                  <td className={cell}>
                    {!editMode ? roText(r.배차방식||"") : (
                      <select className={`${input} ${editableCls}`} value={d.배차방식 ?? ""} onChange={(e)=>setD(r._id,"배차방식", e.target.value)}>
                        <option value="">선택</option>
                        {DISPATCH_METHODS.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </td>

                  {/* 금액 */}
                  <td className={cell}>
                    {!editMode ? roText(won(r.청구운임)) : (
                      <input className={`${input} text-right ${editableCls}`} value={d.청구운임 ?? ""} onChange={(e)=>setD(r._id,"청구운임", e.target.value.replace(/[^\d-]/g,""))} inputMode="numeric" placeholder="0" />
                    )}
                  </td>
                  <td className={cell}>
                    {!editMode ? roText(won(r.기사운임)) : (
                      <input className={`${input} text-right ${editableCls}`} value={d.기사운임 ?? ""} onChange={(e)=>setD(r._id,"기사운임", e.target.value.replace(/[^\d-]/g,""))} inputMode="numeric" placeholder="0" />
                    )}
                  </td>

                  {/* 수수료(읽기전용) */}
                  <td className={`${cell} text-blue-700 font-semibold`}>{won(editMode ? (toInt(d.청구운임)-toInt(d.기사운임)) : (toInt(r.청구운임)-toInt(r.기사운임)))}</td>

                  {/* 지급상태 — 항상 즉시 토글 가능 */}
                  <td className={cell}>
                    <button
                      onClick={()=>togglePayStatus(r)}
                      className={`px-2 py-1 rounded text-sm ${ (r.지급상태||"지급중")==="지급완료" ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"}`}
                      title="클릭하여 지급상태 전환"
                    >
                      {(r.지급상태||"지급중")==="지급완료" ? "✅ 지급완료" : "🔵 지급중"}
                    </button>
                  </td>

                  {/* 지급일 */}
                  <td className={cell}>
                    {!editMode ? roText(r.지급일||"") : (
                      <input type="date" className={`${input} ${editableCls}`} value={d.지급일 ?? ""} onChange={(e)=>setD(r._id,"지급일", e.target.value)} />
                    )}
                  </td>

                  {/* 메모 */}
                  <td className={cell}>
                    {!editMode ? roText(r.메모||"") : (
                      <input className={`${input} ${editableCls}`} value={d.메모 ?? ""} onChange={(e)=>setD(r._id,"메모", e.target.value)} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 9/9 — 지급관리 V3 최종) — END =====================
// ===================== DispatchApp.jsx (PART 10/10) — START =====================
// 기사관리 (DriverManagement) — 예전 방식 그대로: 검색/신규등록/수정/삭제/엑셀업로드
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
    const id = row.차량번호 || row.id;
    const patch = { ...row, [key]: val };
    // 차량번호가 키. 사용자가 차량번호를 바꾼 경우도 merge로 처리
    const keyId = patch.차량번호 || id || crypto?.randomUUID?.();
    await upsertDriver?.({ ...patch, id: keyId });
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
            {filtered.length===0 ? (
              <tr><td className="text-center text-gray-500 py-6" colSpan={5}>표시할 데이터가 없습니다.</td></tr>
            ) : filtered.map((r,i)=> {
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
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 10/10) — END =====================



// ===================== DispatchApp.jsx (PART 11/11) — START =====================
// 거래처관리 (ClientManagement) — 예전 방식 그대로: 검색/신규등록/수정/삭제/엑셀업로드
function ClientManagement({ clients = [], upsertClient, removeClient }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(() =>
    (clients || []).map(c => ({ ...c }))
  );
  const [selected, setSelected] = React.useState(new Set());
  const [newForm, setNewForm] = React.useState({
    거래처명:"", 사업자번호:"", 대표자:"", 업태:"", 종목:"", 주소:"", 담당자:"", 연락처:"", 메모:""
  });

  React.useEffect(() => {
    // normalizeClients 유틸을 통해 중복정리
    const normalized = normalizeClients ? normalizeClients(clients) : (clients || []);
    setRows(normalized.map(c => ({ ...c })));
  }, [clients]);

  const norm = (s="") => String(s).toLowerCase().replace(/\s+/g,"");
  const filtered = React.useMemo(() => {
    if (!q.trim()) return rows;
    const nq = norm(q);
    return rows.filter(r =>
      ["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처","메모"].some(k => norm(r[k]||"").includes(nq))
    );
  }, [rows, q]);

  const toggleOne = (name) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.거래처명).filter(Boolean)));
  };

  const handleBlur = async (row, key, val) => {
    const patch = { ...row, [key]: val };
    const id = patch.거래처명 || row.id || crypto?.randomUUID?.();
    await upsertClient?.({ ...patch, id });
  };

  const addNew = async () => {
    const 거래처명 = (newForm.거래처명||"").trim();
    if (!거래처명) return alert("거래처명은 필수입니다.");
    await upsertClient?.({ ...newForm, id: 거래처명 });
    setNewForm({ 거래처명:"", 사업자번호:"", 대표자:"", 업태:"", 종목:"", 주소:"", 담당자:"", 연락처:"", 메모:"" });
    alert("등록 완료");
  };

  const removeSelected = async () => {
    if (!selected.size) return alert("선택된 항목이 없습니다.");
    if (!confirm(`${selected.size}건 삭제할까요?`)) return;
    for (const name of selected) await removeClient?.(name);
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
          // 다양한 헤더명 커버
          const row = normalizeClient ? normalizeClient(r) : {
            거래처명: r.거래처명 || r["상호"] || r["회사명"] || r["업체명"] || r["거래처"] || "",
            사업자번호: r.사업자번호 || r["사업자 등록번호"] || r["사업자등록번호"] || "",
            대표자: r.대표자 || r["대표자명"] || r["대표"] || "",
            업태: r.업태 || "",
            종목: r.종목 || "",
            주소: r.주소 || "",
            담당자: r.담당자 || r["담당"] || "",
            연락처: r.연락처 || r["전화"] || r["휴대폰"] || "",
            메모: r.메모 || r["비고"] || "",
          };
          const 거래처명 = (row?.거래처명 || "").trim();
          if (!거래처명) continue;
          await upsertClient?.({ ...row, id: 거래처명 });
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
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>

      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="border p-2 rounded w-80"
          placeholder="검색 (거래처/대표자/주소/담당자/연락처...)"
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
          <div className="text-xs text-gray-500 mb-1">거래처명*</div>
          <input className="border p-2 rounded w-full" value={newForm.거래처명} onChange={e=>setNewForm(p=>({...p,거래처명:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">사업자번호</div>
          <input className="border p-2 rounded w-full" value={newForm.사업자번호} onChange={e=>setNewForm(p=>({...p,사업자번호:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">대표자</div>
          <input className="border p-2 rounded w-full" value={newForm.대표자} onChange={e=>setNewForm(p=>({...p,대표자:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">담당자</div>
          <input className="border p-2 rounded w-full" value={newForm.담당자} onChange={e=>setNewForm(p=>({...p,담당자:e.target.value}))}/>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-gray-500 mb-1">주소</div>
          <input className="border p-2 rounded w-full" value={newForm.주소} onChange={e=>setNewForm(p=>({...p,주소:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">연락처</div>
          <input className="border p-2 rounded w-full" value={newForm.연락처} onChange={e=>setNewForm(p=>({...p,연락처:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">업태</div>
          <input className="border p-2 rounded w-full" value={newForm.업태} onChange={e=>setNewForm(p=>({...p,업태:e.target.value}))}/>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">종목</div>
          <input className="border p-2 rounded w-full" value={newForm.종목} onChange={e=>setNewForm(p=>({...p,종목:e.target.value}))}/>
        </div>
        <div className="col-span-4">
          <div className="text-xs text-gray-500 mb-1">메모</div>
          <input className="border p-2 rounded w-full" value={newForm.메모} onChange={e=>setNewForm(p=>({...p,메모:e.target.value}))}/>
        </div>
        <div className="col-span-4 flex justify-end">
          <button onClick={addNew} className="px-4 py-2 rounded bg-blue-600 text-white">+ 신규등록</button>
        </div>
      </div>

      {/* 표 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1400px] text-sm border">
          <thead>
            <tr>
              <th className={head}>
                <input type="checkbox"
                  onChange={toggleAll}
                  checked={filtered.length>0 && selected.size===filtered.length}
                />
              </th>
              {["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처","메모","삭제"].map(h=>(
                <th key={h} className={head}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 ? (
              <tr><td className="text-center text-gray-500 py-6" colSpan={10}>표시할 데이터가 없습니다.</td></tr>
            ) : filtered.map((r,i)=> {
              const id = r.거래처명 || r.id || `${i}`;
              return (
                <tr key={id} className={i%2? "bg-gray-50":""}>
                  <td className={cell}>
                    <input type="checkbox" checked={selected.has(id)} onChange={()=>toggleOne(id)} />
                  </td>
                  <td className={`${cell} min-w-[180px]`}>
                    <input className={`${input} w-48`} defaultValue={r.거래처명||""}
                      onBlur={(e)=>handleBlur(r,"거래처명", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.사업자번호||""}
                      onBlur={(e)=>handleBlur(r,"사업자번호", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.대표자||""}
                      onBlur={(e)=>handleBlur(r,"대표자", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.업태||""}
                      onBlur={(e)=>handleBlur(r,"업태", e.target.value)} />
                  </td>
                  <td className={`${cell} min-w-[260px]`}>
                    <input className={`${input} w-64 text-left`} defaultValue={r.주소||""}
                      onBlur={(e)=>handleBlur(r,"주소", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.담당자||""}
                      onBlur={(e)=>handleBlur(r,"담당자", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <input className={input} defaultValue={r.연락처||""}
                      onBlur={(e)=>handleBlur(r,"연락처", e.target.value)} />
                  </td>
                  <td className={`${cell} min-w-[220px]`}>
                    <input className={`${input} w-56 text-left`} defaultValue={r.메모||""}
                      onBlur={(e)=>handleBlur(r,"메모", e.target.value)} />
                  </td>
                  <td className={cell}>
                    <button
                      onClick={()=>{ if(confirm("삭제하시겠습니까?")) removeClient?.(id); }}
                      className="px-2 py-1 bg-red-600 text-white rounded"
                    >삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 11/11) — END =====================
