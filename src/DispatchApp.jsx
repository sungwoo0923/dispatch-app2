// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/* -------------------------------------------------
   유틸: 안전한 JSON 로드/저장
--------------------------------------------------*/
const safeLoad = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const safeSave = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/* -------------------------------------------------
   거래처 정규화
--------------------------------------------------*/
function normalizeClient(row) {
  if (!row) return null;
  if (typeof row === "string") {
    return { 거래처명: row, 사업자번호: "", 사업자명: "", 메모: "" };
  }
  return {
    거래처명:
      row.거래처명 ||
      row.name ||
      row.상호 ||
      row.회사명 ||
      row.title ||
      "",
    사업자번호:
      row.사업자번호 ||
      row.사업자등록증 ||
      row.사업자등록번호 ||
      "",
    사업자명: row.사업자명 || row.대표자명 || row.ceo || "",
    메모: row.메모 || row.memo || "",
  };
}
function normalizeClients(arr) {
  if (!Array.isArray(arr)) return [];
  const mapped = arr
    .map(normalizeClient)
    .filter(Boolean)
    .map((c) => ({
      거래처명: c.거래처명 || "",
      사업자번호: c.사업자번호 || "",
      사업자명: c.사업자명 || "",
      메모: c.메모 || "",
    }));
  const map = new Map();
  mapped.forEach((c) => map.set(c.거래처명, c));
  return Array.from(map.values());
}

/* -------------------------------------------------
   Firestore 사용자 등록 / 승인 확인
--------------------------------------------------*/
const registerUserInFirestore = async (user) => {
  if (!user) return false;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      name: user.displayName || "이름없음",
      role: "user",
      approved: false,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
    alert("회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
    await signOut(auth);
    return false;
  } else {
    const data = snap.data();
    if (!data.approved) {
      alert("관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.");
      await signOut(auth);
      return false;
    }
    await setDoc(ref, { lastLogin: serverTimestamp() }, { merge: true });
    return true;
  }
};
// ===================== DispatchApp.jsx (PART 1/8) — END =====================
// ===================== DispatchApp.jsx (PART 2/8) — START =====================
/* -------------------------------------------------
   공통 스타일 & 컴포넌트
--------------------------------------------------*/
const cellBase =
  "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[100px]";
const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100";
const inputBase = "border p-1 rounded w-36 text-center";

const StatusBadge = ({ s }) => (
  <span
    className={`px-2 py-1 rounded text-xs ${
      s === "배차완료"
        ? "bg-green-100 text-green-700"
        : s === "취소"
        ? "bg-red-100 text-red-700"
        : "bg-yellow-100 text-yellow-700"
    }`}
  >
    {s || ""}
  </span>
);

const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const compareDate = (a, b) => String(a || "").localeCompare(String(b || ""));

/* -------------------------------------------------
   메인 앱
--------------------------------------------------*/
export default function DispatchApp() {
  const [user, setUser] = useState(null);

  const [menu, setMenu] = useState("배차관리");
  const [dispatchData, setDispatchData] = useState(() => {
    const loaded = safeLoad("dispatchData", []);
    // _id 주입(없을 경우)
    return (loaded || []).map((r) =>
      r && r._id ? r : { ...r, _id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`) }
    );
  });
  const [drivers, setDrivers] = useState(() => safeLoad("drivers", []));
  const [clients, setClients] = useState(() =>
    normalizeClients(
      safeLoad("clients", [
        { 거래처명: "반찬단지", 사업자번호: "", 사업자명: "", 메모: "" },
        { 거래처명: "리앤뉴", 사업자번호: "", 사업자명: "", 메모: "" },
      ])
    )
  );

  // 로그인 상태 감시
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const ok = await registerUserInFirestore(u);
        if (ok) setUser(u);
      } else setUser(null);
    });
    return () => unsub();
  }, []);

  // 로컬 저장 동기화
  useEffect(() => safeSave("dispatchData", dispatchData), [dispatchData]);
  useEffect(() => safeSave("drivers", drivers), [drivers]);
  useEffect(() => safeSave("clients", clients), [clients]);

  const logout = () => signOut(auth);

  // 공통 옵션
  const timeOptions = useMemo(
    () =>
      Array.from({ length: 24 * 6 }, (_, i) => {
        const h = String(Math.floor(i / 6)).padStart(2, "0");
        const m = String((i % 6) * 10).padStart(2, "0");
        return `${h}:${m}`;
      }),
    []
  );
  const tonOptions = useMemo(
    () => Array.from({ length: 25 }, (_, i) => `${i + 1}톤`),
    []
  );

  // 로그인 UI
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
            } catch (err) {
              if (err.code === "auth/user-not-found") {
                if (confirm("등록된 사용자가 없습니다. 회원가입하시겠습니까?")) {
                  const newUser = await createUserWithEmailAndPassword(auth, email, password);
                  await registerUserInFirestore(newUser.user);
                }
              } else {
                alert("로그인 실패: " + err.message);
              }
            }
          }}
          className="flex flex-col gap-3 w-64"
        >
          <input name="email" type="email" placeholder="이메일" className="border p-2 rounded" required />
          <input name="password" type="password" placeholder="비밀번호" className="border p-2 rounded" required />
          <button type="submit" className="bg-blue-600 text-white py-2 rounded">로그인</button>
        </form>
      </div>
    );

  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">배차 프로그램</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-700 text-sm">{user?.email}</span>
          <button onClick={logout} className="bg-gray-300 px-3 py-1 rounded text-sm">로그아웃</button>
        </div>
      </header>

      <nav className="flex gap-2 mb-3">
        {["배차관리","실시간배차현황","배차현황","정산","미배차현황","기사관리","거래처관리"].map((m) => (
          <button
            key={m}
            onClick={() => setMenu(m)}
            className={`px-3 py-2 rounded ${menu === m ? "bg-blue-600 text-white" : "bg-white border"}`}
          >
            {m}
          </button>
        ))}
      </nav>

      <main className="bg-white rounded shadow p-4">
        {menu === "배차관리" && (
          <DispatchManagement
            dispatchData={dispatchData}
            setDispatchData={setDispatchData}
            drivers={drivers}
            clients={clients}
            setClients={setClients}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
          />
        )}
        {menu === "실시간배차현황" && (
          <RealtimeStatus
            dispatchData={dispatchData}
            setDispatchData={setDispatchData}
            drivers={drivers}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
          />
        )}
        {menu === "배차현황" && (
          <DispatchStatus
            dispatchData={dispatchData}
            setDispatchData={setDispatchData}
            drivers={drivers}
            clients={clients}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
          />
        )}
        {menu === "정산" && <Settlement dispatchData={dispatchData} />}
        {menu === "미배차현황" && (
          <UnassignedStatus dispatchData={dispatchData} setDispatchData={setDispatchData} />
        )}
        {menu === "기사관리" && <DriverManagement drivers={drivers} setDrivers={setDrivers} />}
        {menu === "거래처관리" && <ClientManagement clients={clients} setClients={setClients} />}
      </main>
    </>
  );
}
// ===================== DispatchApp.jsx (PART 2/8) — END =====================
// ===================== DispatchApp.jsx (PART 3/8) — START =====================
function DispatchManagement({
  dispatchData,
  setDispatchData,
  drivers,
  clients,
  setClients,
  timeOptions,
  tonOptions,
}) {
  const emptyForm = {
    _id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    순번: "",
    등록일: todayStr(),
    거래처명: "",
    상차지명: "",
    하차지명: "",
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

  const [form, setForm] = useState(() => ({ ...emptyForm, ...safeLoad("dispatchForm", {}) }));
  useEffect(() => safeSave("dispatchForm", form), [form]);

  const autoFillByCar = (carNo) => {
    const normalized = (carNo || "").replace(/\s+/g, "");
    const d = drivers.find((x) => (x.차량번호 || "").replace(/\s+/g, "") === normalized);
    if (d) {
      setForm((p) => ({ ...p, 차량번호: carNo, 이름: d.이름 || "", 전화번호: d.전화번호 || "" , 배차상태:"배차완료"}));
    } else {
      setForm((p) => ({ ...p, 차량번호: carNo, 이름: "", 전화번호: "", 배차상태: carNo ? "배차중" : "배차중" }));
    }
  };

  const onChange = (name, value) => {
    if (name === "차량번호") return autoFillByCar(value);
    if (name === "청구운임" || name === "기사운임") {
      setForm((prev) => {
        const next = { ...prev, [name]: value };
        const fare = parseInt(next.청구운임 || 0) || 0;
        const driverFare = parseInt(next.기사운임 || 0) || 0;
        next.수수료 = String(fare - driverFare);
        return next;
      });
      return;
    }
    setForm((p) => ({ ...p, [name]: value }));
  };

  const addClientQuick = () => {
    const 거래처명 = prompt("신규 거래처명:");
    if (!거래처명) return;
    const 사업자번호 = prompt("사업자번호(선택):") || "";
    const 사업자명 = prompt("사업자명(선택):") || "";
    const 메모 = prompt("메모(선택):") || "";
    const newClient = normalizeClient({ 거래처명, 사업자번호, 사업자명, 메모 });
    setClients((prev) => normalizeClients([...(prev || []), newClient]));
    setForm((p) => ({ ...p, 거래처명, 상차지명: 거래처명 }));
  };

  const nextSeq = () => {
    // 삭제로 인한 중복 방지: 현재 최대값 + 1
    const max = Math.max(0, ...((dispatchData || []).map(r => Number(r.순번) || 0)));
    return max + 1;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.거래처명) return alert("거래처명을 입력하세요.");

    const status = form.차량번호 && form.이름 && form.전화번호 ? "배차완료" : "배차중";
    const newRecord = { ...form, 배차상태: status, 순번: nextSeq() };

    setDispatchData((prev) => [...prev, newRecord]);
    alert("등록되었습니다.");

    const reset = { ...emptyForm, 등록일: todayStr() };
    setForm(reset);
    safeSave("dispatchForm", reset);
  };

  const clientOptions = (clients || []).map(normalizeClient);

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3">
        {/* 거래처 선택 */}
        <div className="col-span-2 flex gap-2">
          <select
            className="border p-2 rounded w-full"
            value={form.거래처명}
            onChange={(e) => {
              const val = e.target.value;
              onChange("거래처명", val);
              setForm((prev) => ({ ...prev, 상차지명: val }));
            }}
          >
            <option value="">거래처 선택 ▾</option>
            {clientOptions.map((c) => (
              <option key={c.거래처명} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
          <button type="button" onClick={addClientQuick} className="px-3 rounded bg-green-600 text-white">
            신규
          </button>
        </div>

        <input className="border p-2 rounded" placeholder="상차지명" value={form.상차지명} onChange={(e) => onChange("상차지명", e.target.value)} />
        <input className="border p-2 rounded" placeholder="하차지명" value={form.하차지명} onChange={(e) => onChange("하차지명", e.target.value)} />
        <input className="border p-2 rounded" placeholder="화물내용" value={form.화물내용} onChange={(e) => onChange("화물내용", e.target.value)} />

        <select className="border p-2 rounded" value={form.차량종류} onChange={(e) => onChange("차량종류", e.target.value)}>
          <option value="">차량종류 ▾</option>
          {["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select className="border p-2 rounded" value={form.차량톤수} onChange={(e) => onChange("차량톤수", e.target.value)}>
          <option value="">톤수 ▾</option>
          {tonOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <input className="border p-2 rounded" placeholder="청구운임" value={form.청구운임} onChange={(e) => onChange("청구운임", e.target.value)} />
        <input className="border p-2 rounded" placeholder="기사운임" value={form.기사운임} onChange={(e) => onChange("기사운임", e.target.value)} />
        <input className="border p-2 rounded bg-gray-100" placeholder="수수료" value={form.수수료} readOnly />

        <input className="border p-2 rounded" placeholder="차량번호" value={form.차량번호} onChange={(e) => onChange("차량번호", e.target.value)} />
        <input className="border p-2 rounded bg-gray-100" placeholder="기사이름" value={form.이름} readOnly />
        <input className="border p-2 rounded bg-gray-100" placeholder="핸드폰번호" value={form.전화번호} readOnly />

        {/* 상차일 + 퀵버튼 */}
        <div className="flex gap-2 items-center">
          <input type="date" className="border p-2 rounded" value={form.상차일} onChange={(e) => onChange("상차일", e.target.value)} />
          <div className="flex gap-1">
            <button type="button" onClick={() => onChange("상차일", todayStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">당일상차</button>
            <button type="button" onClick={() => onChange("상차일", tomorrowStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">내일상차</button>
          </div>
        </div>
        <select className="border p-2 rounded" value={form.상차시간} onChange={(e) => onChange("상차시간", e.target.value)}>
          <option value="">상차시간 ▾</option>
          {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* 하차일 + 퀵버튼 */}
        <div className="flex gap-2 items-center">
          <input type="date" className="border p-2 rounded" value={form.하차일} onChange={(e) => onChange("하차일", e.target.value)} />
          <div className="flex gap-1">
            <button type="button" onClick={() => onChange("하차일", todayStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">당일하차</button>
            <button type="button" onClick={() => onChange("하차일", tomorrowStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">내일하차</button>
          </div>
        </div>
        <select className="border p-2 rounded" value={form.하차시간} onChange={(e) => onChange("하차시간", e.target.value)}>
          <option value="">하차시간 ▾</option>
          {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="border p-2 rounded" value={form.상차방법} onChange={(e) => onChange("상차방법", e.target.value)}>
          <option value="">상차방법 ▾</option>
          {["지게차","수작업","직접수작업","수도움"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.하차방법} onChange={(e) => onChange("하차방법", e.target.value)}>
          <option value="">하차방법 ▾</option>
          {["지게차","수작업","직접수작업","수도움"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select className="border p-2 rounded" value={form.지급방식} onChange={(e) => onChange("지급방식", e.target.value)}>
          <option value="">지급방식 ▾</option>
          {["계산서","착불","선불","계좌이체"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select className="border p-2 rounded" value={form.배차방식} onChange={(e) => onChange("배차방식", e.target.value)}>
          <option value="">배차방식 ▾</option>
          {["24시","인성","직접배차","24시(외부업체)"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <textarea className="border p-2 rounded col-span-6 h-20" placeholder="메모" value={form.메모} onChange={(e) => onChange("메모", e.target.value)} />

        <button type="submit" className="col-span-6 bg-blue-600 text-white p-2 rounded">저장</button>
      </form>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 3/8) — END =====================
// ===================== DispatchApp.jsx (PART 4/8) — START =====================
/* -------------------------------------------------
   공통 상수(메뉴 전역 재사용)
--------------------------------------------------*/
const VEHICLE_TYPES = ["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑"];
const PAY_TYPES = ["계산서","착불","선불","계좌이체"];
const DISPATCH_TYPES = ["24시","인성","직접배차","24시(외부업체)"];

/* -------------------------------------------------
   실시간 배차현황 (상차일=오늘)
   - 신규 기사등록 모달 통합 버전
--------------------------------------------------*/
function RealtimeStatus({ dispatchData, setDispatchData, drivers, timeOptions, tonOptions }) {
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [edited, setEdited] = useState({});
  const [filterType, setFilterType] = useState("전체");
  const [filterValue, setFilterValue] = useState("");

  // 🚗 신규기사 등록 모달용 상태
  const [showModal, setShowModal] = useState(false);
  const [pendingCarNo, setPendingCarNo] = useState("");
  const [modalRow, setModalRow] = useState(null);

  // 🔎 검색 + 필터
  const filtered = useMemo(() => {
    let data = (dispatchData || []).filter((r) => (r.상차일 || "") === today);
    if (filterType !== "전체" && filterValue) {
      if (filterType === "상차일" || filterType === "하차일") {
        data = data.filter((r) => String(r[filterType] || "").startsWith(filterValue));
      } else {
        data = data.filter((r) => String(r[filterType] || "").includes(filterValue));
      }
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }
    return data.sort((a, b) => (a.상차시간 || "").localeCompare(b.상차시간 || ""));
  }, [dispatchData, q, filterType, filterValue]);

  // 🚗 차량번호 입력 처리 (Blur + Enter 공통)
  const handleCarNoInput = (row, rawValue) => {
    const trimmed = (rawValue || "").trim();
    if (!trimmed) {
      setDispatchData((prev) =>
        prev.map((x) =>
          x._id === row._id
            ? { ...x, 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중" }
            : x
        )
      );
      return;
    }

    const allDrivers = safeLoad("drivers", []);
    const found = allDrivers.find(
      (d) => (d.차량번호 || "").replace(/\s+/g, "") === trimmed
    );

    if (found) {
      // ✅ 기존 기사
      setDispatchData((prev) =>
        prev.map((x) =>
          x._id === row._id
            ? {
                ...x,
                차량번호: found.차량번호,
                이름: found.이름,
                전화번호: found.전화번호,
                배차상태: "배차완료",
              }
            : x
        )
      );
    } else {
      // 🚨 신규 기사 등록 모달 표시
      setPendingCarNo(trimmed);
      setModalRow(row);
      setShowModal(true);
    }
  };

  // 💾 수정 저장
  const applyAllChanges = () => {
    const next = (dispatchData || []).map((r) => ({ ...r, ...(edited[r._id] || {}) }));
    setDispatchData(next);
    setEditIdx(null);
    alert("저장되었습니다!");
  };

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명",
    "차량종류","차량톤수","차량번호","이름","전화번호",
    "배차상태","지급방식","배차방식",
    "청구운임","기사운임","수수료","메모","수정"
  ];

  const renderInput = (row, key, def, type="text") => (
    <input
      className={inputBase}
      defaultValue={def || ""}
      type={type}
      onBlur={(e) => setEdited((p) => ({
        ...p,
        [row._id]: { ...(p[row._id] || {}), [key]: e.target.value },
      }))}
    />
  );

  const renderSelect = (row, key, value, options) => (
    <select
      className={inputBase}
      defaultValue={value || ""}
      onBlur={(e) => setEdited((p) => ({
        ...p,
        [row._id]: { ...(p[row._id] || {}), [key]: e.target.value },
      }))}
    >
      <option value="">선택 ▾</option>
      {options.map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  );

  return (
    <div>
      {/* 🔹 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">실시간 배차현황 (오늘 상차일)</h2>
        <div className="flex gap-2">
          <select
            className="border p-1 rounded text-sm"
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setFilterValue(""); }}
          >
            <option value="전체">필터 없음</option>
            <option value="배차상태">배차상태</option>
            <option value="거래처명">거래처명</option>
            <option value="지급방식">지급방식</option>
            <option value="배차방식">배차방식</option>
            <option value="상차일">상차일</option>
            <option value="하차일">하차일</option>
          </select>
          {filterType !== "전체" && (
            <input
              className="border p-1 rounded text-sm"
              placeholder={`${filterType} 값`}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            />
          )}
          <button onClick={() => setQ("")} className="bg-gray-200 px-3 py-1 rounded">초기화</button>
          <button onClick={applyAllChanges} className="bg-blue-600 text-white px-3 py-1 rounded">저장</button>
        </div>
      </div>

      {/* 🔹 검색 */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색..."
        className="border p-2 rounded w-80 mb-3"
      />

      {/* 🔹 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1400px] text-sm border">
          <thead>
            <tr>{headers.map((h) => <th key={h} className={headBase}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const editable = editIdx === idx;
              return (
                <tr key={r._id} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{idx + 1}</td>
                  <td className={cellBase}>{r.등록일}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"상차일",r.상차일,"date") : r.상차일}</td>
                  <td className={cellBase}>{editable ? renderSelect(r,"상차시간",r.상차시간,timeOptions) : r.상차시간}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"하차일",r.하차일,"date") : r.하차일}</td>
                  <td className={cellBase}>{editable ? renderSelect(r,"하차시간",r.하차시간,timeOptions) : r.하차시간}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"거래처명",r.거래처명) : r.거래처명}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"상차지명",r.상차지명) : r.상차지명}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"하차지명",r.하차지명) : r.하차지명}</td>
                  <td className={cellBase}>{editable ? renderSelect(r,"차량종류",r.차량종류,VEHICLE_TYPES) : r.차량종류}</td>
                  <td className={cellBase}>{editable ? renderSelect(r,"차량톤수",r.차량톤수,tonOptions) : r.차량톤수}</td>
                  <td className={cellBase}>
                    <input
                      className={inputBase}
                      defaultValue={r.차량번호}
                      onBlur={(e) => handleCarNoInput(r, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCarNoInput(r, e.currentTarget.value);
                        }
                      }}
                    />
                  </td>
                  <td className={cellBase}>{r.이름}</td>
                  <td className={cellBase}>{r.전화번호}</td>
                  <td className={cellBase}><StatusBadge s={r.배차상태} /></td>
                  <td className={cellBase}>{editable ? renderSelect(r,"지급방식",r.지급방식,PAY_TYPES) : r.지급방식}</td>
                  <td className={cellBase}>{editable ? renderSelect(r,"배차방식",r.배차방식,DISPATCH_TYPES) : r.배차방식}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"청구운임",r.청구운임,"number") : r.청구운임}</td>
                  <td className={cellBase}>{editable ? renderInput(r,"기사운임",r.기사운임,"number") : r.기사운임}</td>
                  <td className={cellBase}>{r.수수료}</td>
                  <td className={cellBase}>
                    {editable ? (
                      <textarea
                        className={`${inputBase} h-12`}
                        defaultValue={r.메모}
                        onBlur={(e) =>
                          setEdited((p) => ({
                            ...p,
                            [r._id]: { ...(p[r._id] || {}), 메모: e.target.value },
                          }))
                        }
                      />
                    ) : r.메모}
                  </td>
                  <td className={cellBase}>
                    {editable ? (
                      <button onClick={() => setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                    ) : (
                      <button onClick={() => setEditIdx(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 🧩 신규 기사 등록 모달 */}
      {showModal && (
        <RegisterDriverModal
          carNo={pendingCarNo}
          onClose={() => setShowModal(false)}
          onSubmit={(newDriver) => {
            const next = [...(safeLoad("drivers", []) || []), newDriver];
            localStorage.setItem("drivers", JSON.stringify(next));
            setShowModal(false);
            alert("신규 기사 등록 완료!");

            setDispatchData((prev) =>
              prev.map((x) =>
                x._id === modalRow._id
                  ? { ...x, ...newDriver, 배차상태: "배차완료" }
                  : x
              )
            );
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------
   신규 기사 등록 모달 컴포넌트
--------------------------------------------------*/
function RegisterDriverModal({ carNo, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 animate-fadeIn">
        <h3 className="text-xl font-bold mb-2 text-center text-gray-800">
          신규 기사 등록
        </h3>
        <p className="text-center text-gray-500 text-sm mb-4">
          차량번호 <span className="font-semibold text-blue-600">{carNo}</span>의 기사 정보를 입력해주세요.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              placeholder="예: 김기사"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border w-full p-2 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input
              type="text"
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border w-full p-2 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
          >
            취소
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return alert("이름을 입력하세요.");
              onSubmit({ 이름: name.trim(), 차량번호: carNo, 전화번호: phone.trim() });
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 4/8) — END =====================

// ===================== DispatchApp.jsx (PART 5/8) — START =====================
/* -------------------------------------------------
   배차현황 (전체)
   - 요구사항 반영:
     1) 수정 버튼 시 하차시간/차량종류/톤수/지급방식/배차방식 등도 수정 가능
     2) 차량 미등록 상태에서 Blur/Enter 시 신규등록 confirm → 등록
     3) 표시 순번은 화면상 항상 1부터(index+1)
--------------------------------------------------*/
function DispatchStatus({ dispatchData, setDispatchData, drivers, timeOptions, tonOptions }) {
  const [q, setQ] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [edited, setEdited] = useState({});
  const [filterType, setFilterType] = useState("전체");
  const [filterValue, setFilterValue] = useState("");

  // 🔎 검색 + 필터
  const filtered = useMemo(() => {
    let data = [...(dispatchData || [])];
    if (filterType !== "전체" && filterValue) {
      if (filterType === "상차일" || filterType === "하차일") {
        data = data.filter((r) => String(r[filterType] || "").startsWith(filterValue));
      } else {
        data = data.filter((r) => String(r[filterType] || "").includes(filterValue));
      }
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }
    // 상차일 오름차순
    return data.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [dispatchData, q, filterType, filterValue]);

// 🚗 신규기사 등록
const registerNewDriver = (carNo) => {
  const name = prompt(`"${carNo}" 차량의 기사 이름을 입력하세요:`);
  if (!name) return null;
  const phone = prompt("전화번호를 입력하세요:") || "";
  const newDriver = { 이름: name, 차량번호: carNo, 전화번호: phone };
  const next = [...(safeLoad("drivers", []) || []), newDriver];
  localStorage.setItem("drivers", JSON.stringify(next));
  alert("신규 기사 등록 완료!");
  return newDriver;
};

const ignoreNextBlur = useRef(false);

// 🚗 차량번호 입력 처리 (Blur + Enter 공통)
const handleCarNoInput = (row, rawValue) => {
  if (ignoreNextBlur.current) {
    // ✅ 이전 confirm 이후 발생한 불필요한 blur 이벤트 무시
    ignoreNextBlur.current = false;
    return;
  }

  console.log("🚗 handleCarNoInput 실행됨", rawValue);
  const trimmed = (rawValue || "").trim();

  if (!trimmed) {
    console.log("⚠️ 차량번호가 비어있음 → 초기화 처리");
    setDispatchData((prev) =>
      prev.map((x) =>
        x._id === row._id
          ? { ...x, 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중" }
          : x
      )
    );
    return;
  }

  const allDrivers = safeLoad("drivers", []);
  const found = allDrivers.find(
    (d) =>
      String(d.차량번호 || "").replace(/\s+/g, "") === trimmed
  );

  if (found) {
    console.log("✅ 기존 기사 발견:", found);
    setDispatchData((prev) =>
      prev.map((x) =>
        x._id === row._id
          ? {
              ...x,
              차량번호: found.차량번호,
              이름: found.이름 || "",
              전화번호: found.전화번호 || "",
              배차상태: "배차완료",
            }
          : x
      )
    );
  } else {
    console.log("🚨 신규 차량 감지! confirm() 실행 예정");
    try {
      ignoreNextBlur.current = true; // ✅ blur 보호막 ON
      const confirmed = window.confirm(
        `${trimmed} 차량이 등록되어 있지 않습니다. 신규로 등록하시겠습니까?`
      );
      if (!confirmed) {
        console.log("❌ 신규 등록 취소됨 — confirm 이후 종료");
        return;
      }

      registerNewDriver(trimmed, row);
      console.log("🆕 신규 등록 모달 호출 완료");
    } catch (err) {
      console.error("⚠️ confirm 호출 실패:", err);
    } finally {
      // ✅ confirm이 끝난 후 한 프레임 뒤에 blur 보호 해제
      setTimeout(() => (ignoreNextBlur.current = false), 200);
    }
  }
};


  // ✏️ 수정 시작/변경/저장
  const startEdit = (idx) => { setEditIdx(idx); setEdited({}); };
  const handleEditChange = (row, key, val) => {
    setEdited((p) => ({ ...p, [row._id]: { ...(p[row._id] || {}), [key]: val } }));
  };
  const applyAllChanges = () => {
    const next = (dispatchData || []).map((r) => ({ ...r, ...(edited[r._id] || {}) }));
    setDispatchData(next);
    setEditIdx(null);
    alert("저장되었습니다!");
  };

  const remove = (row) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const next = (dispatchData || []).filter((x) => x._id !== row._id);
    setDispatchData(next);
  };

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명",
    "차량종류","차량톤수","차량번호","이름","전화번호",
    "배차상태","지급방식","배차방식",
    "청구운임","기사운임","수수료","메모","수정","삭제"
  ];

  const renderInput = (row, key, def, type="text") => (
    <input className={inputBase} defaultValue={def || ""} type={type}
      onBlur={(e) => handleEditChange(row, key, e.target.value)} />
  );
  const renderSelect = (row, key, value, options) => (
    <select className={inputBase} defaultValue={value || ""}
      onBlur={(e) => handleEditChange(row, key, e.target.value)}>
      <option value="">선택 ▾</option>
      {options.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">배차현황 (전체)</h2>
        <div className="flex gap-2">
          <select
            className="border p-1 rounded text-sm"
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setFilterValue(""); }}
          >
            <option value="전체">필터 없음</option>
            <option value="배차상태">배차상태</option>
            <option value="거래처명">거래처명</option>
            <option value="지급방식">지급방식</option>
            <option value="배차방식">배차방식</option>
            <option value="상차일">상차일(YYYY-MM-DD)</option>
            <option value="하차일">하차일(YYYY-MM-DD)</option>
          </select>
          {filterType !== "전체" && (
            <input className="border p-1 rounded text-sm"
              placeholder={`${filterType} 값`}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)} />
          )}
          <button onClick={() => setQ("")} className="bg-gray-200 px-3 py-1 rounded">초기화</button>
          <button onClick={applyAllChanges} className="bg-blue-600 text-white px-3 py-1 rounded">저장</button>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색어 (거래처/차량/이름 등)"
        className="border p-2 rounded w-80 mb-3"
      />

      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full text-sm border">
          <thead>
            <tr>{headers.map((h) => <th key={h} className={headBase}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const editable = editIdx === idx;
              return (
                <tr key={r._id} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{idx + 1}</td>
                  <td className={cellBase}>{r.등록일}</td>

                  <td className={cellBase}>
                    {editable ? renderInput(r, "상차일", r.상차일, "date") : r.상차일}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r, "상차시간", r.상차시간, timeOptions) : r.상차시간}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r, "하차일", r.하차일, "date") : r.하차일}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r, "하차시간", r.하차시간, timeOptions) : r.하차시간}
                  </td>

                  <td className={cellBase}>
                    {editable ? renderInput(r, "거래처명", r.거래처명) : r.거래처명}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r, "상차지명", r.상차지명) : r.상차지명}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r, "하차지명", r.하차지명) : r.하차지명}
                  </td>

                  <td className={cellBase}>
                    {editable ? renderSelect(r, "차량종류", r.차량종류, VEHICLE_TYPES) : r.차량종류}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r, "차량톤수", r.차량톤수, tonOptions) : r.차량톤수}
                  </td>

                  <td className={cellBase}>
                    <input
                      className={inputBase}
                      defaultValue={r.차량번호}
                      onBlur={(e) => handleCarNoInput(r, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCarNoInput(r, e.currentTarget.value);
                        }
                      }}
                    />
                  </td>

                  <td className={cellBase}>{r.이름}</td>
                  <td className={cellBase}>{r.전화번호}</td>
                  <td className={cellBase}><StatusBadge s={r.배차상태} /></td>

                  <td className={cellBase}>
                    {editable ? renderSelect(r, "지급방식", r.지급방식, PAY_TYPES) : r.지급방식}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r, "배차방식", r.배차방식, DISPATCH_TYPES) : r.배차방식}
                  </td>

                  <td className={cellBase}>
                    {editable ? renderInput(r, "청구운임", r.청구운임, "number") : r.청구운임}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r, "기사운임", r.기사운임, "number") : r.기사운임}
                  </td>
                  <td className={cellBase}>{r.수수료}</td>

                  <td className={cellBase}>
                    {editable ? (
                      <textarea
                        className={`${inputBase} h-12`}
                        defaultValue={r.메모}
                        onBlur={(e) => handleEditChange(r, "메모", e.target.value)}
                      />
                    ) : (r.메모)}
                  </td>

                  <td className={cellBase}>
                    {editable ? (
                      <button onClick={() => setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                    ) : (
                      <button onClick={() => startEdit(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                    )}
                  </td>
                  <td className={cellBase}>
                    <button onClick={() => remove(r)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
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
// ===================== DispatchApp.jsx (PART 5/8) — END =====================
// ===================== DispatchApp.jsx (PART 6/8) — START =====================
/* -------------------------------------------------
   정산 (요약)
   - 요구사항 반영: 순번은 화면상 1부터(index+1)
--------------------------------------------------*/
function Settlement({ dispatchData }) {
  const [filter, setFilter] = useState("전체");

  const filtered = useMemo(() => {
    let rows = (dispatchData || []).filter((r) => (r.배차상태 || "") === "배차완료");
    if (filter === "지급") rows = rows.filter((r) => r.지급여부 === "지급");
    if (filter === "미지급") rows = rows.filter((r) => r.지급여부 !== "지급");
    return rows.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [dispatchData, filter]);

  const total = filtered.reduce(
    (acc, r) => {
      const fare = parseInt(r.청구운임 || 0) || 0;
      const driverFare = parseInt(r.기사운임 || 0) || 0;
      const fee = fare - driverFare;
      acc.청구 += fare; acc.기사 += driverFare; acc.수익 += fee;
      return acc;
    }, { 청구: 0, 기사: 0, 수익: 0 }
  );

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">정산</h2>
      <div className="flex gap-3 mb-3">
        <select className="border p-2 rounded" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="전체">전체 보기</option>
          <option value="지급">지급 완료</option>
          <option value="미지급">미지급</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="border p-3 rounded text-center">
          <p className="text-gray-500 text-sm">총 청구운임</p>
          <p className="text-xl font-bold">{total.청구.toLocaleString()}원</p>
        </div>
        <div className="border p-3 rounded text-center">
          <p className="text-gray-500 text-sm">총 기사운임</p>
          <p className="text-xl font-bold">{total.기사.toLocaleString()}원</p>
        </div>
        <div className="border p-3 rounded text-center">
          <p className="text-gray-500 text-sm">총 수익(수수료)</p>
          <p className="text-xl font-bold">{total.수익.toLocaleString()}원</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              <th className={headBase}>순번</th>
              <th className={headBase}>상차일</th>
              <th className={headBase}>거래처명</th>
              <th className={headBase}>차량번호</th>
              <th className={headBase}>이름</th>
              <th className={headBase}>청구운임</th>
              <th className={headBase}>기사운임</th>
              <th className={headBase}>수수료</th>
              <th className={headBase}>지급여부</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r._id || i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className={cellBase}>{i + 1}</td>
                <td className={cellBase}>{r.상차일 || ""}</td>
                <td className={cellBase}>{r.거래처명 || ""}</td>
                <td className={cellBase}>{r.차량번호 || ""}</td>
                <td className={cellBase}>{r.이름 || ""}</td>
                <td className={cellBase}>{r.청구운임 || ""}</td>
                <td className={cellBase}>{r.기사운임 || ""}</td>
                <td className={cellBase}>{(parseInt(r.청구운임 || 0) - parseInt(r.기사운임 || 0)).toLocaleString()}</td>
                <td className={cellBase}>{r.지급여부 || "미지급"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 6/8) — END =====================
// ===================== DispatchApp.jsx (PART 7/8) — START =====================
/* -------------------------------------------------
   미배차현황
   - 요구사항 반영: 순번은 화면상 1부터(index+1)
--------------------------------------------------*/
function UnassignedStatus({ dispatchData, setDispatchData }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const result = (dispatchData || []).filter((r) => (r.배차상태 || "") === "배차중");
    if (!q.trim()) return result;
    const lower = q.toLowerCase();
    return result.filter((r) =>
      Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
    );
  }, [dispatchData, q]);

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">미배차현황</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색 (거래처명 / 상차지명 / 차량번호)"
        className="border p-2 rounded w-80 mb-3"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              {["순번","등록일","상차일","거래처명","상차지명","하차지명","차량톤수","차량종류","화물내용","배차상태","메모"].map((h) => (
                <th key={h} className={headBase}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="text-center py-4" colSpan={11}>모든 오더가 배차완료 상태입니다 🎉</td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r._id || i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className={cellBase}>{i + 1}</td>
                  <td className={cellBase}>{r.등록일 || ""}</td>
                  <td className={cellBase}>{r.상차일 || ""}</td>
                  <td className={cellBase}>{r.거래처명 || ""}</td>
                  <td className={cellBase}>{r.상차지명 || ""}</td>
                  <td className={cellBase}>{r.하차지명 || ""}</td>
                  <td className={cellBase}>{r.차량톤수 || ""}</td>
                  <td className={cellBase}>{r.차량종류 || ""}</td>
                  <td className={cellBase}>{r.화물내용 || ""}</td>
                  <td className={cellBase}><StatusBadge s={r.배차상태} /></td>
                  <td className={cellBase}>{r.메모 || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 7/8) — END =====================
// ===================== DispatchApp.jsx (PART 8/8) — START =====================
/* -------------------------------------------------
   기사관리 (Driver Management)
--------------------------------------------------*/
function DriverManagement({ drivers, setDrivers }) {
  const [form, setForm] = useState({ 이름: "", 차량번호: "", 전화번호: "" });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return drivers;
    const lower = q.toLowerCase();
    return drivers.filter((d) =>
      Object.values(d).some((v) => String(v || "").toLowerCase().includes(lower))
    );
  }, [drivers, q]);

  const addDriver = () => {
    if (!form.이름 || !form.차량번호) return alert("이름과 차량번호는 필수입니다.");
    if (drivers.some((d) => (d.차량번호 || "").replace(/\s+/g, "") === (form.차량번호 || "").replace(/\s+/g, "")))
      return alert("이미 등록된 차량번호입니다.");
    const next = [...drivers, form];
    setDrivers(next);
    localStorage.setItem("drivers", JSON.stringify(next)); // 실시간/배차현황 prompt용
    setForm({ 이름: "", 차량번호: "", 전화번호: "" });
    alert("등록 완료!");
  };

  const remove = (v) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const next = drivers.filter((d) => (d.차량번호 || "") !== (v.차량번호 || ""));
    setDrivers(next);
    localStorage.setItem("drivers", JSON.stringify(next));
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">기사관리</h2>
      <div className="flex gap-2 mb-3">
        <input className="border p-2 rounded" placeholder="이름" value={form.이름} onChange={(e)=>setForm({...form,이름:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="차량번호" value={form.차량번호} onChange={(e)=>setForm({...form,차량번호:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="전화번호" value={form.전화번호} onChange={(e)=>setForm({...form,전화번호:e.target.value})}/>
        <button onClick={addDriver} className="bg-blue-600 text-white px-3 py-1 rounded">등록</button>
      </div>

      <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="검색 (이름 / 차량번호)" className="border p-2 rounded w-80 mb-3" />

      <table className="w-full text-sm border">
        <thead>
          <tr><th className={headBase}>이름</th><th className={headBase}>차량번호</th><th className={headBase}>전화번호</th><th className={headBase}>삭제</th></tr>
        </thead>
        <tbody>
          {filtered.map((d)=>(<tr key={d.차량번호} className="odd:bg-white even:bg-gray-50">
            <td className={cellBase}>{d.이름}</td>
            <td className={cellBase}>{d.차량번호}</td>
            <td className={cellBase}>{d.전화번호}</td>
            <td className={cellBase}><button onClick={()=>remove(d)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button></td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------
   거래처관리 (Client Management)
--------------------------------------------------*/
function ClientManagement({ clients, setClients }) {
  const [form, setForm] = useState({ 거래처명: "", 사업자번호: "", 사업자명: "", 메모: "" });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return clients;
    const lower = q.toLowerCase();
    return clients.filter((c) =>
      Object.values(c).some((v) => String(v || "").toLowerCase().includes(lower))
    );
  }, [clients, q]);

  const addClient = () => {
    if (!form.거래처명) return alert("거래처명을 입력하세요.");
    if (clients.some((c) => c.거래처명 === form.거래처명))
      return alert("이미 등록된 거래처입니다.");
    const next = [...clients, form];
    setClients(next);
    setForm({ 거래처명: "", 사업자번호: "", 사업자명: "", 메모: "" });
    alert("등록 완료!");
  };

  const remove = (c) => {
    if (!confirm("삭제하시겠습니까?")) return;
    setClients(clients.filter((x) => x.거래처명 !== c.거래처명));
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>
      <div className="grid grid-cols-5 gap-2 mb-3">
        <input className="border p-2 rounded" placeholder="거래처명" value={form.거래처명} onChange={(e)=>setForm({...form,거래처명:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="사업자번호" value={form.사업자번호} onChange={(e)=>setForm({...form,사업자번호:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="사업자명" value={form.사업자명} onChange={(e)=>setForm({...form,사업자명:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="메모" value={form.메모} onChange={(e)=>setForm({...form,메모:e.target.value})}/>
        <button onClick={addClient} className="bg-blue-600 text-white rounded px-3 py-2 col-span-1">추가</button>
      </div>

      <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="검색 (거래처명 / 사업자명)" className="border p-2 rounded w-80 mb-3" />

      <table className="w-full text-sm border">
        <thead><tr>{["거래처명","사업자번호","사업자명","메모","삭제"].map(h=><th key={h} className={headBase}>{h}</th>)}</tr></thead>
        <tbody>
          {(filtered||[]).map((c)=>(
            <tr key={c.거래처명} className="odd:bg-white even:bg-gray-50">
              <td className={cellBase}>{c.거래처명}</td>
              <td className={cellBase}>{c.사업자번호}</td>
              <td className={cellBase}>{c.사업자명}</td>
              <td className={cellBase}>{c.메모}</td>
              <td className={cellBase}><button onClick={()=>remove(c)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 8/8) — END =====================
