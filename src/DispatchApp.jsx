// ===================== DispatchApp.jsx (PART 1/8 + 2/8 with 관리자메뉴 추가) — START =====================
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

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
  // 도장 이미지를 public/seal.png 로 넣으면 자동 표시됨
  sealImage: "/seal.png",
};

/* -------------------------------------------------
   공통 상수 (차량종류, 결제방식 등)
--------------------------------------------------*/
const VEHICLE_TYPES = ["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙"];
const PAY_TYPES = ["계산서","착불","선불","계좌이체"];

import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs
} from "firebase/firestore";

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
  const navigate = useNavigate();

  const [menu, setMenu] = useState("배차관리");
  const [dispatchData, setDispatchData] = useState(() => {
    const loaded = safeLoad("dispatchData", []);
    return (loaded || []).map((r) =>
      r && r._id ? r : { ...r, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` }
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

  // 로그아웃
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      localStorage.removeItem("dispatchData");
      localStorage.removeItem("drivers");
      localStorage.removeItem("clients");
      alert("로그아웃되었습니다.");
      navigate("/login");
    } catch (err) {
      console.error("로그아웃 오류:", err);
      alert("로그아웃 중 문제가 발생했습니다.");
    }
  };

  const timeOptions = useMemo(
    () => Array.from({ length: 24 * 6 }, (_, i) => `${String(Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}`),
    []
  );
  const tonOptions = useMemo(() => Array.from({ length: 25 }, (_, i) => `${i + 1}톤`), []);

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

          <button type="button" onClick={() => navigate("/signup")} className="text-blue-600 text-sm hover:underline mt-2">
            회원가입 하러가기
          </button>
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
        {["배차관리","실시간배차현황","배차현황","미배차현황","기사관리","거래처관리","매출관리","거래처정산","관리자메뉴"].map((m) => (
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
          <DispatchManagement dispatchData={dispatchData} setDispatchData={setDispatchData} drivers={drivers} clients={clients} setClients={setClients} timeOptions={timeOptions} tonOptions={tonOptions} />
        )}
        {menu === "실시간배차현황" && (
          <RealtimeStatus dispatchData={dispatchData} setDispatchData={setDispatchData} drivers={drivers} timeOptions={timeOptions} tonOptions={tonOptions} />
        )}
        {menu === "배차현황" && (
          <DispatchStatus dispatchData={dispatchData} setDispatchData={setDispatchData} drivers={drivers} clients={clients} timeOptions={timeOptions} tonOptions={tonOptions} />
        )}
        {menu === "미배차현황" && <UnassignedStatus dispatchData={dispatchData} setDispatchData={setDispatchData} />}
        {menu === "기사관리" && <DriverManagement drivers={drivers} setDrivers={setDrivers} />}
        {menu === "거래처관리" && <ClientManagement clients={clients} setClients={setClients} />}
        {menu === "매출관리" && <Settlement dispatchData={dispatchData} />}
        {menu === "거래처정산" && (<ClientSettlement dispatchData={dispatchData} clients={clients} setClients={setClients}/>)}
        {menu === "관리자메뉴" && <AdminMenu />}
      </main>
    </>
  );
}

/* -------------------------------------------------
   관리자 메뉴 컴포넌트
--------------------------------------------------*/
function AdminMenu() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setUsers(list);
        safeSave("users", list);
      } catch (err) {
        console.error("⚠️ Firestore 오류:", err);
        alert("사용자 목록을 불러오는 중 오류가 발생했습니다.");
      }
    };
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const lower = search.toLowerCase();
    return users.filter((u) =>
      Object.values(u).some((v) =>
        String(v || "").toLowerCase().includes(lower)
      )
    );
  }, [users, search]);

  const toggleApprove = async (u) => {
    const newStatus = !u.approved;
    if (!window.confirm(`${u.email} 사용자를 ${newStatus ? "승인" : "미승인"} 처리하시겠습니까?`)) return;
    try {
      const ref = doc(db, "users", u.id);
      await setDoc(ref, { approved: newStatus }, { merge: true });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, approved: newStatus } : x)));
      alert(`✅ ${u.email}님이 ${newStatus ? "승인" : "미승인"} 처리되었습니다.`);
    } catch (err) {
      console.error("승인 변경 오류:", err);
      alert("승인 변경 중 문제가 발생했습니다.");
    }
  };

  const toggleRole = async (u) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    if (!window.confirm(`${u.email} 권한을 ${newRole}로 변경하시겠습니까?`)) return;
    try {
      const ref = doc(db, "users", u.id);
      await setDoc(ref, { role: newRole }, { merge: true });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
      alert(`✅ ${u.email}님의 권한이 ${newRole}으로 변경되었습니다.`);
    } catch (err) {
      console.error("권한 변경 오류:", err);
      alert("권한 변경 중 문제가 발생했습니다.");
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">관리자 메뉴</h2>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="사용자 검색"
        className="border p-2 rounded w-80 mb-3"
      />

      <table className="w-full text-sm border">
        <thead>
          <tr>
            <th className={headBase}>이메일</th>
            <th className={headBase}>권한</th>
            <th className={headBase}>승인여부</th>
            <th className={headBase}>최근 로그인</th>
            <th className={headBase}>관리</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-4 text-gray-500">
                등록된 사용자가 없습니다.
              </td>
            </tr>
          ) : (
            filtered.map((u) => (
              <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{u.email}</td>
                <td className={cellBase}>
                  <span
                    className={`${
                      u.role === "admin"
                        ? "text-blue-600 font-semibold"
                        : "text-gray-700"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className={cellBase}>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      u.approved
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {u.approved ? "승인" : "대기중"}
                  </span>
                </td>
                <td className={cellBase}>
                  {u.lastLogin
                    ? new Date(u.lastLogin.seconds * 1000).toLocaleString()
                    : "-"}
                </td>
                <td className={cellBase}>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => toggleApprove(u)}
                      className="bg-blue-500 text-white px-2 py-1 rounded text-xs"
                    >
                      {u.approved ? "승인해제" : "승인"}
                    </button>
                    <button
                      onClick={() => toggleRole(u)}
                      className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
                    >
                      권한변경
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 1/8 + 2/8 with 관리자메뉴 추가) — END =====================



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
    _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
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

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...safeLoad("dispatchForm", {}),
  }));
  useEffect(() => safeSave("dispatchForm", form), [form]);

  // ✅ 배차관리 전용 신규기사 모달 상태
  const [showModalDM, setShowModalDM] = useState(false);
  const [pendingCarNoDM, setPendingCarNoDM] = useState("");

  // ✅ 차량번호 입력 후 엔터 시 기사 자동채움 or 신규등록 팝업
  const handleCarNoEnter = (value) => {
    const v = (value || "").trim();
    const normalized = v.replace(/\s+/g, "");
    if (!normalized) {
      setForm((p) => ({
        ...p,
        차량번호: "",
        이름: "",
        전화번호: "",
        배차상태: "배차중",
      }));
      return;
    }

    const allDrivers = safeLoad("drivers", drivers || []);
    const found = (allDrivers || []).find(
      (x) => (x.차량번호 || "").replace(/\s+/g, "") === normalized
    );

    if (found) {
      setForm((p) => ({
        ...p,
        차량번호: found.차량번호,
        이름: found.이름 || "",
        전화번호: found.전화번호 || "",
        배차상태: "배차완료",
      }));
    } else {
      setPendingCarNoDM(normalized);
      setShowModalDM(true);
    }
  };

  // ✅ 청구/기사운임 자동 수수료 계산
  const onChange = (name, value) => {
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
    const newClient = normalizeClient({
      거래처명,
      사업자번호,
      사업자명,
      메모,
    });
    setClients((prev) => normalizeClients([...(prev || []), newClient]));
    setForm((p) => ({ ...p, 거래처명, 상차지명: 거래처명 }));
  };

  const nextSeq = () => {
    const max = Math.max(
      0,
      ...((dispatchData || []).map((r) => Number(r.순번) || 0))
    );
    return max + 1;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.거래처명) return alert("거래처명을 입력하세요.");

    const status =
      form.차량번호 && form.이름 && form.전화번호 ? "배차완료" : "배차중";
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
      <div className="bg-gray-50 p-6 rounded-xl shadow-sm border border-gray-200"></div>
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
          <button
            type="button"
            onClick={addClientQuick}
            className="px-3 rounded bg-green-600 text-white"
          >
            신규
          </button>
        </div>

        <input
          className="border p-2 rounded"
          placeholder="상차지명"
          value={form.상차지명}
          onChange={(e) => onChange("상차지명", e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="하차지명"
          value={form.하차지명}
          onChange={(e) => onChange("하차지명", e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="화물내용"
          value={form.화물내용}
          onChange={(e) => onChange("화물내용", e.target.value)}
        />

        <select
          className="border p-2 rounded"
          value={form.차량종류}
          onChange={(e) => onChange("차량종류", e.target.value)}
        >
          <option value="">차량종류 ▾</option>
          {[
            "라보",
            "다마스",
            "오토바이",
            "윙바디",
            "탑",
            "카고",
            "냉장윙",
            "냉동윙",
            "냉장탑",
            "냉동탑",
          ].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={form.차량톤수}
          onChange={(e) => onChange("차량톤수", e.target.value)}
        >
          <option value="">톤수 ▾</option>
          {tonOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          className="border p-2 rounded"
          placeholder="청구운임"
          value={form.청구운임}
          onChange={(e) => onChange("청구운임", e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="기사운임"
          value={form.기사운임}
          onChange={(e) => onChange("기사운임", e.target.value)}
        />
        <input
          className="border p-2 rounded bg-gray-100"
          placeholder="수수료"
          value={form.수수료}
          readOnly
        />

        {/* ✅ 차량번호 입력 후 엔터 시에만 신규등록 팝업 */}
        <input
          className="border p-2 rounded"
          placeholder="차량번호"
          value={form.차량번호}
          onChange={(e) => setForm({ ...form, 차량번호: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCarNoEnter(e.currentTarget.value);
            }
          }}
          onBlur={(e) => {
            const value = e.currentTarget.value.trim();
            if (!value) {
              setForm((p) => ({
                ...p,
                차량번호: "",
                이름: "",
                전화번호: "",
                배차상태: "배차중",
              }));
            }
          }}
        />
        <input
          className="border p-2 rounded bg-gray-100"
          placeholder="기사이름"
          value={form.이름}
          readOnly
        />
        <input
          className="border p-2 rounded bg-gray-100"
          placeholder="핸드폰번호"
          value={form.전화번호}
          readOnly
        />

        {/* 상차일 */}
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="border p-2 rounded"
            value={form.상차일}
            onChange={(e) => onChange("상차일", e.target.value)}
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onChange("상차일", todayStr())}
              className="px-2 py-1 bg-gray-200 rounded text-xs"
            >
              당일상차
            </button>
            <button
              type="button"
              onClick={() => onChange("상차일", tomorrowStr())}
              className="px-2 py-1 bg-gray-200 rounded text-xs"
            >
              내일상차
            </button>
          </div>
        </div>
        <select
          className="border p-2 rounded"
          value={form.상차시간}
          onChange={(e) => onChange("상차시간", e.target.value)}
        >
          <option value="">상차시간 ▾</option>
          {timeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* 하차일 */}
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="border p-2 rounded"
            value={form.하차일}
            onChange={(e) => onChange("하차일", e.target.value)}
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onChange("하차일", todayStr())}
              className="px-2 py-1 bg-gray-200 rounded text-xs"
            >
              당일하차
            </button>
            <button
              type="button"
              onClick={() => onChange("하차일", tomorrowStr())}
              className="px-2 py-1 bg-gray-200 rounded text-xs"
            >
              내일하차
            </button>
          </div>
        </div>
        <select
          className="border p-2 rounded"
          value={form.하차시간}
          onChange={(e) => onChange("하차시간", e.target.value)}
        >
          <option value="">하차시간 ▾</option>
          {timeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={form.상차방법}
          onChange={(e) => onChange("상차방법", e.target.value)}
        >
          <option value="">상차방법 ▾</option>
          {["지게차", "수작업", "직접수작업", "수도움"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="border p-2 rounded"
          value={form.하차방법}
          onChange={(e) => onChange("하차방법", e.target.value)}
        >
          <option value="">하차방법 ▾</option>
          {["지게차", "수작업", "직접수작업", "수도움"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={form.지급방식}
          onChange={(e) => onChange("지급방식", e.target.value)}
        >
          <option value="">지급방식 ▾</option>
          {["계산서", "착불", "선불", "계좌이체"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          className="border p-2 rounded"
          value={form.배차방식}
          onChange={(e) => onChange("배차방식", e.target.value)}
        >
          <option value="">배차방식 ▾</option>
          {["24시", "인성", "직접배차", "24시(외부업체)"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <textarea
          className="border p-2 rounded col-span-6 h-20"
          placeholder="메모"
          value={form.메모}
          onChange={(e) => onChange("메모", e.target.value)}
        />
<div className="col-span-6 flex justify-end mt-4">
  <button
    type="submit"
    className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 transition-all"
  >
    저장
  </button>
</div>
    
      </form>
<hr className="my-6 border-t-2 border-gray-300" />
<div className="text-sm text-gray-500 mb-2 font-semibold">▼ 실시간 배차현황</div>

{/* ✅ RealtimeStatus 전체 기능 포함 (수정/삭제/신규등록) */}
<RealtimeStatus
  dispatchData={dispatchData}
  setDispatchData={setDispatchData}
  drivers={drivers}
  timeOptions={timeOptions}
  tonOptions={tonOptions}
/>

      {/* ✅ 배차관리 전용 신규기사 등록 팝업 */}
      {showModalDM && (
        <RegisterDriverModalDM
          carNo={pendingCarNoDM}
          onClose={() => setShowModalDM(false)}
          onSubmit={(newDriver) => {
            const base = safeLoad("drivers", drivers || []);
            const next = [...(base || []), newDriver];
            localStorage.setItem("drivers", JSON.stringify(next));

            setForm((p) => ({
              ...p,
              차량번호: newDriver.차량번호,
              이름: newDriver.이름,
              전화번호: newDriver.전화번호,
              배차상태: "배차완료",
            }));

            setShowModalDM(false);
            alert("신규 기사 등록 완료!");
          }}
        />
      )}
    </div>
  );
}

/* ✅ 배차관리 전용 모달 컴포넌트 (이름 충돌 방지) */
function RegisterDriverModalDM({ carNo, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6">
        <h3 className="text-xl font-bold mb-2 text-center text-gray-800">
          신규 기사 등록
        </h3>
        <p className="text-center text-gray-500 text-sm mb-4">
          차량번호{" "}
          <span className="font-semibold text-blue-600">{carNo}</span> 의 기사
          정보를 입력해주세요.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름
            </label>
            <input
              type="text"
              placeholder="예: 김기사"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border w-full p-2 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              전화번호
            </label>
            <input
              type="text"
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border w-full p-2 rounded-lg"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) return alert("이름을 입력하세요.");
              onSubmit({
                이름: name.trim(),
                차량번호: carNo,
                전화번호: phone.trim(),
              });
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 3/확인 👌  

// ===================== DispatchApp.jsx (PART 4/8 - RegisterDriverModalRS 개선완성) — START =====================
/* -------------------------------------------------
   공통 상수(메뉴 전역 재사용)
--------------------------------------------------*/
const DISPATCH_TYPES = ["24시","인성","직접배차","24시(외부업체)"];

/* -------------------------------------------------
   실시간 배차현황 (상차일=오늘)
   - 신규 기사등록 모달 통합 버전 (배차관리 팝업 동일)
   - 📅 날짜범위 필터 + 🔽 드롭다운 필터 추가
--------------------------------------------------*/
function RealtimeStatus({ dispatchData, setDispatchData, drivers, timeOptions, tonOptions }) {
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [edited, setEdited] = useState({});
  const [filterType, setFilterType] = useState("전체");
  const [filterValue, setFilterValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ✅ 신규기사등록 모달
  const [showModalRS, setShowModalRS] = useState(false);
  const [pendingCarNo, setPendingCarNo] = useState("");
  const [modalRow, setModalRow] = useState(null);

  // ✅ 상태 확인 로그
  useEffect(() => console.log("✅ showModalRS 상태:", showModalRS), [showModalRS]);

  // ✅ 검색 + 기간 + 필터
  const filtered = useMemo(() => {
    let data = (dispatchData || []).filter((r) => (r.상차일 || "") === today);

    // 📅 날짜범위 필터
    if (startDate && endDate) {
      data = data.filter((r) => {
        const d = r.상차일 || "";
        return d >= startDate && d <= endDate;
      });
    }

    // 🔽 드롭다운 필터
    if (filterType !== "전체" && filterValue) {
      data = data.filter((r) => String(r[filterType] || "").includes(filterValue));
    }

    // 🔍 일반 검색
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }

    return data.sort((a, b) => (a.상차시간 || "").localeCompare(b.상차시간 || ""));
  }, [dispatchData, q, filterType, filterValue, startDate, endDate]);

  // 삭제
  const remove = (row) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const next = (dispatchData || []).filter((x) => x._id !== row._id);
    setDispatchData(next);
    localStorage.setItem("dispatchData", JSON.stringify(next));
    alert("삭제되었습니다.");
  };

  // 🚗 차량번호 입력 시 기사 자동매칭 + 신규등록 팝업
  const handleCarNoInput = (row, rawValue) => {
    const trimmed = (rawValue || "").replace(/\s+/g, "");
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
      setPendingCarNo(trimmed);
      setModalRow(row);
      setShowModalRS(true);
    }
  };

  const applyAllChanges = () => {
    const next = (dispatchData || []).map((r) => ({
      ...r,
      ...(edited[r._id] || {}),
    }));
    setDispatchData(next);
    setEditIdx(null);
    alert("저장되었습니다!");
  };

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명","차량종류","차량톤수",
    "차량번호","이름","전화번호","배차상태","지급방식","배차방식",
    "청구운임","기사운임","수수료","메모","수정","삭제",
  ];

  const renderInput = (row, key, def, type = "text") => (
    <input
      className={inputBase}
      defaultValue={def || ""}
      type={type}
      onBlur={(e) =>
        setEdited((p) => ({
          ...p,
          [row._id]: { ...(p[row._id] || {}), [key]: e.target.value },
        }))
      }
    />
  );

  const renderSelect = (row, key, value, options) => (
    <select
      className={inputBase}
      defaultValue={value || ""}
      onBlur={(e) =>
        setEdited((p) => ({
          ...p,
          [row._id]: { ...(p[row._id] || {}), [key]: e.target.value },
        }))
      }
    >
      <option value="">선택 ▾</option>
      {options.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold">실시간 배차현황 (오늘 상차일)</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* 🔽 드롭다운 */}
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
            <option value="차량번호">차량번호</option>
            <option value="차량종류">차량종류</option>
            <option value="배차상태">배차상태</option>
            <option value="지급방식">지급방식</option>
            <option value="배차방식">배차방식</option>
          </select>

          {filterType !== "전체" && (
            <input
              className="border p-1 rounded text-sm"
              placeholder={`${filterType} 검색`}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            />
          )}

          {/* 📅 날짜범위 필터 */}
          <div className="flex items-center gap-1 text-sm">
            <input type="date" className="border p-1 rounded" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span>~</span>
            <input type="date" className="border p-1 rounded" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <button
            onClick={() => {
              setQ("");
              setStartDate("");
              setEndDate("");
              setFilterType("전체");
              setFilterValue("");
            }}
            className="bg-gray-200 px-3 py-1 rounded"
          >
            초기화
          </button>
          <button
            onClick={applyAllChanges}
            className="bg-blue-600 text-white px-3 py-1 rounded"
          >
            저장
          </button>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색..."
        className="border p-2 rounded w-80 mb-3"
      />

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
                  <td className={cellBase}>{editable ? renderInput(r, "상차일", r.상차일, "date") : r.상차일}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "상차시간", r.상차시간, timeOptions) : r.상차시간}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "하차일", r.하차일, "date") : r.하차일}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "하차시간", r.하차시간, timeOptions) : r.하차시간}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "거래처명", r.거래처명) : r.거래처명}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "상차지명", r.상차지명) : r.상차지명}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "하차지명", r.하차지명) : r.하차지명}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "차량종류", r.차량종류, VEHICLE_TYPES) : r.차량종류}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "차량톤수", r.차량톤수, tonOptions) : r.차량톤수}</td>
                  <td className={cellBase}>
                    <input
                      className={inputBase}
                      defaultValue={r.차량번호}
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
                  <td className={cellBase}>{editable ? renderSelect(r, "지급방식", r.지급방식, PAY_TYPES) : r.지급방식}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "배차방식", r.배차방식, DISPATCH_TYPES) : r.배차방식}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "청구운임", r.청구운임, "number") : r.청구운임}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "기사운임", r.기사운임, "number") : r.기사운임}</td>
                  <td className={cellBase}>{r.수수료}</td>
                  <td className={cellBase}>
                    {editable ? (
                      <textarea className={`${inputBase} h-12`} defaultValue={r.메모} onBlur={(e) => setEdited((p) => ({ ...p, [r._id]: { ...(p[r._id] || {}), 메모: e.target.value } }))} />
                    ) : r.메모}
                  </td>
                  <td className={cellBase}>
                    {editable ? (
                      <button onClick={() => setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                    ) : (
                      <button onClick={() => setEditIdx(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
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

      {/* ✅ 신규기사 등록 팝업 */}
      {showModalRS && (
        <RegisterDriverModalRS
          carNo={pendingCarNo}
          onClose={() => setShowModalRS(false)}
          onSubmit={(newDriver) => {
            const next = [...(safeLoad("drivers", []) || []), newDriver];
            localStorage.setItem("drivers", JSON.stringify(next));
            setShowModalRS(false);
            alert("신규 기사 등록 완료!");
            setDispatchData((prev) =>
              prev.map((x) =>
                x._id === modalRow._id ? { ...x, ...newDriver, 배차상태: "배차완료" } : x
              )
            );
          }}
        />
      )}
    </div>
  );
}

/* ✅ 신규 기사 등록 모달 (배차관리 동일 스타일) */
function RegisterDriverModalRS({ carNo, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] transition-all duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6">
        <h3 className="text-xl font-bold mb-2 text-center text-gray-800">신규 기사 등록</h3>
        <p className="text-center text-gray-500 text-sm mb-4">
          차량번호 <span className="font-semibold text-blue-600">{carNo}</span>의 기사 정보를 입력해주세요.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input type="text" placeholder="예: 김기사" value={name} onChange={(e) => setName(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input type="text" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700">취소</button>
          <button
            onClick={() => {
              if (!name.trim()) return alert("이름을 입력하세요.");
              onSubmit({ 이름: name.trim(), 차량번호: carNo, 전화번호: phone.trim() });
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 4/8 - RegisterDriverModalRS 개선완성) — END =====================

// ===================== DispatchApp.jsx (PART 6/8 - Driver & Client Management 복원) — START =====================
function DriverManagement({ drivers, setDrivers }) {
  const [form, setForm] = useState({ 이름: "", 차량번호: "", 전화번호: "" });
  const [search, setSearch] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editForm, setEditForm] = useState({});

  // 🔎 검색 필터
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) =>
      Object.values(d).some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [drivers, search]);

  // ➕ 신규 등록
  const addDriver = () => {
    if (!form.이름) return alert("이름을 입력하세요.");
    if (!form.차량번호) return alert("차량번호를 입력하세요.");
    const exists = drivers.some((d) => d.차량번호 === form.차량번호);
    if (exists) return alert("이미 등록된 차량번호입니다.");
    setDrivers([...drivers, form]);
    setForm({ 이름: "", 차량번호: "", 전화번호: "" });
    alert("기사 등록 완료!");
  };

  // ✏ 수정 저장
  const saveEdit = () => {
    const next = [...drivers];
    next[editIdx] = editForm;
    setDrivers(next);
    setEditIdx(null);
    alert("수정 완료!");
  };

  // ❌ 삭제
  const remove = (idx) => {
    if (!confirm("삭제하시겠습니까?")) return;
    setDrivers(drivers.filter((_, i) => i !== idx));
  };

  // 📁 엑셀 업로드
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        const normalized = json.map((r) => ({
          이름: r.이름 || "",
          차량번호: r.차량번호 || "",
          전화번호: r.전화번호 || "",
        }));
        setDrivers((prev) => [...prev, ...normalized]);
        alert(`${normalized.length}명의 기사 데이터를 추가했습니다.`);
      } catch {
        alert("엑셀 파일 읽기 오류");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 📤 엑셀 다운로드
  const handleDownload = () => {
    if (!drivers.length) return alert("다운로드할 데이터가 없습니다.");
    const ws = XLSX.utils.json_to_sheet(drivers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "기사목록");
    XLSX.writeFile(wb, "기사관리.xlsx");
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">기사관리</h2>

      <div className="flex gap-2 mb-4">
        <label className="bg-green-600 text-white px-3 py-2 rounded cursor-pointer">
          📁 엑셀 업로드
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
        </label>
        <button onClick={handleDownload} className="bg-blue-600 text-white px-3 py-2 rounded">
          📤 엑셀 다운로드
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <input className="border p-2 rounded" placeholder="이름" value={form.이름} onChange={(e) => setForm({ ...form, 이름: e.target.value })} />
        <input className="border p-2 rounded" placeholder="차량번호" value={form.차량번호} onChange={(e) => setForm({ ...form, 차량번호: e.target.value })} />
        <input className="border p-2 rounded" placeholder="전화번호" value={form.전화번호} onChange={(e) => setForm({ ...form, 전화번호: e.target.value })} />
        <button onClick={addDriver} className="bg-blue-600 text-white rounded px-3 py-2 col-span-1">추가</button>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색 (이름 / 차량번호 / 전화번호)" className="border p-2 rounded w-80 mb-3" />

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className={headBase}>이름</th>
            <th className={headBase}>차량번호</th>
            <th className={headBase}>전화번호</th>
            <th className={headBase}>관리</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              {editIdx === i ? (
                <>
                  <td className={cellBase}>
                    <input className="border p-1 rounded w-full" value={editForm.이름} onChange={(e) => setEditForm({ ...editForm, 이름: e.target.value })} />
                  </td>
                  <td className={cellBase}>
                    <input className="border p-1 rounded w-full" value={editForm.차량번호} onChange={(e) => setEditForm({ ...editForm, 차량번호: e.target.value })} />
                  </td>
                  <td className={cellBase}>
                    <input className="border p-1 rounded w-full" value={editForm.전화번호} onChange={(e) => setEditForm({ ...editForm, 전화번호: e.target.value })} />
                  </td>
                  <td className={cellBase}>
                    <button onClick={saveEdit} className="bg-blue-500 text-white px-2 py-1 rounded mr-1">저장</button>
                    <button onClick={() => setEditIdx(null)} className="border px-2 py-1 rounded">취소</button>
                  </td>
                </>
              ) : (
                <>
                  <td className={cellBase}>{d.이름}</td>
                  <td className={cellBase}>{d.차량번호}</td>
                  <td className={cellBase}>{d.전화번호}</td>
                  <td className={cellBase}>
                    <button onClick={() => { setEditIdx(i); setEditForm(d); }} className="bg-yellow-400 text-white px-2 py-1 rounded mr-1">수정</button>
                    <button onClick={() => remove(i)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------
   거래처관리 — 등록/검색/수정/삭제/엑셀 업로드 완전 복원
--------------------------------------------------*/
function ClientManagement({ clients, setClients }) {
  const [form, setForm] = useState({
    거래처명: "", 사업자번호: "", 대표자: "", 업태: "", 종목: "", 주소: "", 담당자: "", 연락처: ""
  });
  const [search, setSearch] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editForm, setEditForm] = useState({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      Object.values(c).some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [clients, search]);

  const addClient = () => {
    if (!form.거래처명) return alert("거래처명을 입력하세요.");
    setClients([...clients, form]);
    setForm({ 거래처명: "", 사업자번호: "", 대표자: "", 업태: "", 종목: "", 주소: "", 담당자: "", 연락처: "" });
    alert("거래처 등록 완료!");
  };

  const saveEdit = () => {
    const next = [...clients];
    next[editIdx] = editForm;
    setClients(next);
    setEditIdx(null);
    alert("수정 완료!");
  };

  const remove = (idx) => {
    if (!confirm("삭제하시겠습니까?")) return;
    setClients(clients.filter((_, i) => i !== idx));
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        const normalized = json.map((r) => ({
          거래처명: r.거래처명 || "",
          사업자번호: r.사업자번호 || "",
          대표자: r.대표자 || "",
          업태: r.업태 || "",
          종목: r.종목 || "",
          주소: r.주소 || "",
          담당자: r.담당자 || "",
          연락처: r.연락처 || "",
        }));
        setClients((prev) => [...prev, ...normalized]);
        alert(`${normalized.length}건의 거래처 데이터를 추가했습니다.`);
      } catch {
        alert("엑셀 파일 읽기 오류");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownload = () => {
    if (!clients.length) return alert("다운로드할 데이터가 없습니다.");
    const ws = XLSX.utils.json_to_sheet(clients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래처목록");
    XLSX.writeFile(wb, "거래처관리.xlsx");
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>

      <div className="flex gap-2 mb-4">
        <label className="bg-green-600 text-white px-3 py-2 rounded cursor-pointer">
          📁 엑셀 업로드
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
        </label>
        <button onClick={handleDownload} className="bg-blue-600 text-white px-3 py-2 rounded">
          📤 엑셀 다운로드
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <input className="border p-2 rounded" placeholder="거래처명" value={form.거래처명} onChange={(e) => setForm({ ...form, 거래처명: e.target.value })} />
        <input className="border p-2 rounded" placeholder="사업자번호" value={form.사업자번호} onChange={(e) => setForm({ ...form, 사업자번호: e.target.value })} />
        <input className="border p-2 rounded" placeholder="대표자" value={form.대표자} onChange={(e) => setForm({ ...form, 대표자: e.target.value })} />
        <input className="border p-2 rounded" placeholder="연락처" value={form.연락처} onChange={(e) => setForm({ ...form, 연락처: e.target.value })} />
        <button onClick={addClient} className="bg-blue-600 text-white rounded px-3 py-2 col-span-1">추가</button>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색 (거래처명 / 대표자 / 연락처)" className="border p-2 rounded w-80 mb-3" />

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            {["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처","관리"].map((h)=>(
              <th key={h} className={headBase}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c,i)=>(
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              {editIdx===i?(
                <>
                  {Object.keys(editForm).slice(0,8).map((k)=>(
                    <td key={k} className={cellBase}>
                      <input className="border p-1 rounded w-full" value={editForm[k]||""} onChange={(e)=>setEditForm({...editForm,[k]:e.target.value})}/>
                    </td>
                  ))}
                  <td className={cellBase}>
                    <button onClick={saveEdit} className="bg-blue-500 text-white px-2 py-1 rounded mr-1">저장</button>
                    <button onClick={()=>setEditIdx(null)} className="border px-2 py-1 rounded">취소</button>
                  </td>
                </>
              ):(
                <>
                  {["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처"].map((k)=>
                    <td key={k} className={cellBase}>{c[k]||"-"}</td>
                  )}
                  <td className={cellBase}>
                    <button onClick={()=>{setEditIdx(i);setEditForm(c);}} className="bg-yellow-400 text-white px-2 py-1 rounded mr-1">수정</button>
                    <button onClick={()=>remove(i)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 6/8 - Driver & Client Management 복원) — END =====================


// ===================== DispatchApp.jsx (PART 5/8 - RegisterDriverModalDS + 대용량업로드 추가) — START =====================
/* -------------------------------------------------
   배차현황 (전체 데이터)
   - 신규 기사등록 팝업 포함 (배차관리 팝업 동일 디자인)
   - 📅 날짜범위 필터 + 🔽 드롭다운 필터
   - 📤 대용량 업로드 (날짜/업체명/하차지/화물정보/차량번호/기사명/전화번호/청구운임/기사님요금/수수료/배차방식/지급방식)
--------------------------------------------------*/
function DispatchStatus({ dispatchData, setDispatchData, drivers, timeOptions, tonOptions }) {
  const [q, setQ] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [edited, setEdited] = useState({});
  const [filterType, setFilterType] = useState("전체");
  const [filterValue, setFilterValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showModalDS, setShowModalDS] = useState(false);
  const [pendingCarNo, setPendingCarNo] = useState("");
  const [modalRow, setModalRow] = useState(null);

  // ✅ 검색 + 날짜범위 + 드롭다운 필터
  const filtered = useMemo(() => {
    let data = [...(dispatchData || [])];

    // 📅 날짜범위 필터
    if (startDate && endDate) {
      data = data.filter((r) => (r.상차일 || "") >= startDate && (r.상차일 || "") <= endDate);
    }

    // 🔽 드롭다운 필터
    if (filterType !== "전체" && filterValue) {
      data = data.filter((r) => String(r[filterType] || "").includes(filterValue));
    }

    // 🔍 일반 검색
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }

    return data;
  }, [dispatchData, q, filterType, filterValue, startDate, endDate]);

  // 🚗 차량번호 입력 + 엔터 시 신규등록 팝업
  const handleCarNoInput = (row, rawValue) => {
    const trimmed = (rawValue || "").replace(/\s+/g, "");
    if (!trimmed) {
      setDispatchData((prev) =>
        prev.map((x) =>
          x._id === row._id ? { ...x, 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중" } : x
        )
      );
      return;
    }

    const allDrivers = safeLoad("drivers", []);
    const found = allDrivers.find(
      (d) => (d.차량번호 || "").replace(/\s+/g, "") === trimmed
    );

    if (found) {
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
      setPendingCarNo(trimmed);
      setModalRow(row);
      setShowModalDS(true);
    }
  };

  const remove = (row) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const next = (dispatchData || []).filter((x) => x._id !== row._id);
    setDispatchData(next);
    localStorage.setItem("dispatchData", JSON.stringify(next));
    alert("삭제되었습니다.");
  };

  const applyAllChanges = () => {
    const next = (dispatchData || []).map((r) => ({ ...r, ...(edited[r._id] || {}) }));
    setDispatchData(next);
    setEditIdx(null);
    alert("저장되었습니다!");
  };

  // 📤 대용량 업로드 핸들러 (엑셀 날짜 자동 변환 포함)
const handleBulkUpload = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    // 🔹 엑셀 시리얼 날짜 → YYYY-MM-DD 로 변환하는 함수
    const excelDateToJS = (num) => {
      if (!num || isNaN(num)) return num; // 이미 문자열이면 그대로
      const date = new Date((num - 25569) * 86400 * 1000);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const normalized = json.map((r, idx) => {
      const rawDate = r["날짜"];
      const parsedDate =
        typeof rawDate === "number" ? excelDateToJS(rawDate) : rawDate;

      const fare = parseInt(r["청구운임"]) || 0;
      const driverFare = parseInt(r["기사님요금"]) || 0;

      return {
        _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        순번: idx + 1,
        등록일: parsedDate || todayStr(),
        상차일: parsedDate || "",
        상차시간: "",
        하차일: "",
        하차시간: "",
        거래처명: r["업체명"] || "",
        상차지명: r["업체명"] || "",
        하차지명: r["하차지"] || "",
        화물내용: r["화물정보"] || "",
        차량번호: r["차량번호"] || "",
        이름: r["이름"] || r["기사명"] || "",
        전화번호: r["전화번호"] || "",
        청구운임: r["청구운임"] || "",
        기사운임: r["기사님요금"] || "",
        수수료:
          r["수수료"] || String(fare - driverFare),
        배차방식: r["배차방식"] || "",
        지급방식: r["지급방식"] || "",
        배차상태: "배차완료",
      };
    });

    setDispatchData((prev) => [...(prev || []), ...normalized]);
    alert(`✅ ${normalized.length}건의 오더가 등록되었습니다.`);
    e.target.value = "";
  };

  reader.readAsArrayBuffer(file);
};

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명","차량종류","차량톤수",
    "차량번호","이름","전화번호","배차상태","지급방식","배차방식",
    "청구운임","기사운임","수수료","메모","수정","삭제",
  ];

  const renderInput = (row, key, def, type = "text") => (
    <input
      className={inputBase}
      defaultValue={def || ""}
      type={type}
      onBlur={(e) =>
        setEdited((p) => ({
          ...p,
          [row._id]: { ...(p[row._id] || {}), [key]: e.target.value },
        }))
      }
    />
  );

  const renderSelect = (row, key, value, options) => (
    <select
      className={inputBase}
      defaultValue={value || ""}
      onBlur={(e) =>
        setEdited((p) => ({
          ...p,
          [row._id]: { ...(p[row._id] || {}), [key]: e.target.value },
        }))
      }
    >
      <option value="">선택 ▾</option>
      {options.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold">배차현황</h2>
        <div className="flex flex-wrap gap-2 items-center">
          {/* 🔽 드롭다운 */}
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
            <option value="차량번호">차량번호</option>
            <option value="차량종류">차량종류</option>
            <option value="배차상태">배차상태</option>
            <option value="지급방식">지급방식</option>
            <option value="배차방식">배차방식</option>
          </select>

          {filterType !== "전체" && (
            <input
              className="border p-1 rounded text-sm"
              placeholder={`${filterType} 검색`}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            />
          )}

          {/* 📅 날짜범위 필터 */}
          <div className="flex items-center gap-1 text-sm">
            <input type="date" className="border p-1 rounded" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span>~</span>
            <input type="date" className="border p-1 rounded" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          {/* 📤 대용량 업로드 (구조 유지, 버튼만 추가) */}
          <label className="bg-blue-600 text-white px-3 py-1 rounded cursor-pointer">
            📤 대용량 등록
            <input type="file" accept=".xlsx,.xls" hidden onChange={handleBulkUpload} />
          </label>

          <button
            onClick={() => {
              setQ("");
              setStartDate("");
              setEndDate("");
              setFilterType("전체");
              setFilterValue("");
            }}
            className="bg-gray-200 px-3 py-1 rounded"
          >
            초기화
          </button>
          <button
            onClick={applyAllChanges}
            className="bg-blue-600 text-white px-3 py-1 rounded"
          >
            저장
          </button>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색..."
        className="border p-2 rounded w-80 mb-3"
      />

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
                  <td className={cellBase}>{editable ? renderInput(r, "상차일", r.상차일, "date") : r.상차일}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "상차시간", r.상차시간, timeOptions) : r.상차시간}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "하차일", r.하차일, "date") : r.하차일}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "하차시간", r.하차시간, timeOptions) : r.하차시간}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "거래처명", r.거래처명) : r.거래처명}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "상차지명", r.상차지명) : r.상차지명}</td>
                  <td className={cellBase}>{editable ? renderInput(r, "하차지명", r.하차지명) : r.하차지명}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "차량종류", r.차량종류, VEHICLE_TYPES) : r.차량종류}</td>
                  <td className={cellBase}>{editable ? renderSelect(r, "차량톤수", r.차량톤수, tonOptions) : r.차량톤수}</td>
                  <td className={cellBase}>
                    <input
                      className={inputBase}
                      defaultValue={r.차량번호}
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
                      <textarea className={`${inputBase} h-12`} defaultValue={r.메모} onBlur={(e) => setEdited((p) => ({ ...p, [r._id]: { ...(p[r._id] || {}), 메모: e.target.value } }))} />
                    ) : r.메모}
                  </td>
                  <td className={cellBase}>
                    {editable ? (
                      <button onClick={() => setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                    ) : (
                      <button onClick={() => setEditIdx(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
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

      {/* ✅ 신규기사 등록 팝업 */}
      {showModalDS && (
        <RegisterDriverModalDS
          carNo={pendingCarNo}
          onClose={() => setShowModalDS(false)}
          onSubmit={(newDriver) => {
            const next = [...(safeLoad("drivers", []) || []), newDriver];
            localStorage.setItem("drivers", JSON.stringify(next));
            setShowModalDS(false);
            alert("신규 기사 등록 완료!");
            setDispatchData((prev) =>
              prev.map((x) =>
                x._id === modalRow._id ? { ...x, ...newDriver, 배차상태: "배차완료" } : x
              )
            );
          }}
        />
      )}
    </div>
  );
}

/* ✅ 신규 기사 등록 모달 */
function RegisterDriverModalDS({ carNo, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] transition-all duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6">
        <h3 className="text-xl font-bold mb-2 text-center text-gray-800">신규 기사 등록</h3>
        <p className="text-center text-gray-500 text-sm mb-4">
          차량번호 <span className="font-semibold text-blue-600">{carNo}</span>의 기사 정보를 입력해주세요.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input type="text" placeholder="예: 김기사" value={name} onChange={(e) => setName(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input type="text" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700">취소</button>
          <button
            onClick={() => {
              if (!name.trim()) return alert("이름을 입력하세요.");
              onSubmit({ 이름: name.trim(), 차량번호: carNo, 전화번호: phone.trim() });
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 5/8 - RegisterDriverModalDS + 대용량업로드 추가) — END =====================



// ===================== DispatchApp.jsx (PART 6/8) — START =====================
/* -------------------------------------------------
   매출관리 (대표용 대시보드 강화)
   - 대표 요약 덱(KPI + 전월 비교)
   - 이익률 경고 배너(목표 15% 미만)
   - Top5 거래처 / 주의 거래처(이익률 10% 미만)
   - 그래프① 전월 대비 일자 매출 라인 (이번달 vs 전월)
   - 그래프② 기간 일자 트렌드 라인 (매출/수수료/기사)
   - 기간/거래처 필터 + 합계 요약
   - 거래처별 집계(이익률 10% 미만 빨강)
   - 상세 목록
   - 엑셀 다운로드(요약/거래처별/상세/일자트렌드)
   ※ 기존 시그니처 유지: function Settlement({ dispatchData })
--------------------------------------------------*/
function Settlement({ dispatchData }) {
  // 📅 필터 상태
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  // 🧮 안전 변환
  const toInt = (v) => {
    const n = parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };

  // 📆 날짜 유틸
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const monthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM
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

  // 📚 원본 데이터 가드
  const baseRows = Array.isArray(dispatchData) ? dispatchData : [];

  // 🔎 기간/거래처 필터 적용 데이터(정산은 배차완료만)
  const rangeRows = useMemo(() => {
    let rows = baseRows.filter((r) => (r.배차상태 || "") === "배차완료");
    if (clientFilter) rows = rows.filter((r) => (r.거래처명 || "") === clientFilter);
    if (startDate || endDate) {
      rows = rows.filter((r) => isInRange((r.상차일 || ""), startDate, endDate));
    }
    return rows.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [baseRows, startDate, endDate, clientFilter]);

  // 🗓️ 월 / 전월 / 당일 집계 (전체 데이터 기준, 거래처 필터 미적용)
  const mKey = monthKey();
  const pKey = prevMonthKey();
  const today = todayStr();

  const monthRows = useMemo(
    () => baseRows.filter((r) => (r.배차상태 || "") === "배차완료" && String(r.상차일 || "").startsWith(mKey)),
    [baseRows, mKey]
  );
  const prevMonthRows = useMemo(
    () => baseRows.filter((r) => (r.배차상태 || "") === "배차완료" && String(r.상차일 || "").startsWith(pKey)),
    [baseRows, pKey]
  );
  const todayRows = useMemo(
    () => baseRows.filter((r) => (r.배차상태 || "") === "배차완료" && (r.상차일 || "") === today),
    [baseRows, today]
  );

  const sumBy = (rows, key) => rows.reduce((acc, r) => acc + toInt(r[key]), 0);

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
  kpi.전월증감률 = kpi.전월매출 ? ((kpi.전월증감 / kpi.전월매출) * 100) : 0;
  const monthProfitRate = kpi.월매출 > 0 ? (kpi.월수수료 / kpi.월매출) * 100 : 0;

  // 📈 기간 집계(현재 필터 반영)
  const rangeTotals = useMemo(() => {
    const 매출 = sumBy(rangeRows, "청구운임");
    const 기사 = sumBy(rangeRows, "기사운임");
    const 수수료 = 매출 - 기사;
    return { 매출, 기사, 수수료 };
  }, [rangeRows]);

  // 💼 거래처 목록 (셀렉트용)
  const clients = useMemo(() => {
    const set = new Set();
    baseRows.forEach((r) => { if (r.거래처명) set.add(r.거래처명); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseRows]);

  // 🔎 거래처별(기간필터 적용) 집계
  const clientAgg = useMemo(() => {
    const map = new Map();
    for (const r of rangeRows) {
      const c = r.거래처명 || "미지정";
      const sale = toInt(r.청구운임);
      const driver = toInt(r.기사운임);
      const fee = sale - driver;
      const prev = map.get(c) || { 거래처명: c, 건수: 0, 매출: 0, 기사: 0, 수수료: 0 };
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

  // 🏆 Top5 거래처 (매출 기준)
  const topClients = useMemo(() => clientAgg.slice(0, 5), [clientAgg]);

  // ⚠ 주의 거래처 (이익률 10% 미만) — 상위 5개: 매출 큰 순
  const riskyClients = useMemo(() => {
    const arr = clientAgg
      .map((r) => ({ ...r, rate: r.매출 > 0 ? (r.수수료 / r.매출) * 100 : 0 }))
      .filter((r) => r.매출 > 0 && r.rate < 10);
    // 매출 큰 순으로 Top5 (관리 임팩트 큰 곳부터)
    arr.sort((a, b) => b.매출 - a.매출);
    return arr.slice(0, 5);
  }, [clientAgg]);

  // 📉 그래프 데이터 ①: 전월 대비 "일자" 매출 라인 (이번달 vs 전월)
  const monthDaily = useMemo(() => {
    const add = (rows, monthYYYYMM) => {
      const map = new Map(); // day(1..31) -> sum
      rows.forEach((r) => {
        const d = (r.상차일 || "");
        if (!d.startsWith(monthYYYYMM)) return;
        const day = parseInt(d.slice(8, 10), 10) || 0;
        const sale = toInt(r.청구운임);
        map.set(day, (map.get(day) || 0) + sale);
      });
      // 1~31 중 값 있는 날만 정렬
      return Array.from(map.entries())
        .map(([day, sum]) => ({ day, sum }))
        .sort((a, b) => a.day - b.day);
    };
    const cur = add(monthRows, mKey);
    const prev = add(prevMonthRows, pKey);
    // x축: 1..maxDay
    const maxDay = Math.max(cur.at(-1)?.day || 0, prev.at(-1)?.day || 0, 1);
    const xs = Array.from({ length: maxDay }, (_, i) => i + 1);
    const y1 = xs.map((d) => cur.find((x) => x.day === d)?.sum || 0);
    const y2 = xs.map((d) => prev.find((x) => x.day === d)?.sum || 0);
    return xs.map((d, i) => ({ x: String(d).padStart(2, "0"), y1: y1[i], y2: y2[i] }));
  }, [monthRows, prevMonthRows, mKey, pKey]);

  // 📉 그래프 데이터 ②: 기간 일자 트렌드 (매출/수수료/기사)
  const dailyTrend = useMemo(() => {
    const map = new Map(); // date -> {date, 매출, 기사, 수수료}
    for (const r of rangeRows) {
      const d = r.상차일 || "";
      if (!d) continue;
      const sale = toInt(r.청구운임);
      const driver = toInt(r.기사운임);
      const fee = sale - driver;
      const prev = map.get(d) || { date: d, 매출: 0, 기사: 0, 수수료: 0 };
      prev.매출 += sale;
      prev.기사 += driver;
      prev.수수료 += fee;
      map.set(d, prev);
    }
    const arr = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [rangeRows]);

  // 💳 숫자 포맷
  const won = (n) => `${(n || 0).toLocaleString()}원`;

  // 📤 엑셀 다운로드 (필터 반영)
  const downloadExcel = () => {
    try {
      if (!window.XLSX && typeof XLSX === "undefined") {
        alert("엑셀 라이브러리가 로드되지 않았습니다. (XLSX)");
        return;
      }
      // 1) 요약 시트
      const summaryRows = [
        { 항목: "기간시작", 값: startDate || "-" },
        { 항목: "기간종료", 값: endDate || "-" },
        { 항목: "거래처", 값: clientFilter || "전체" },
        {},
        { 항목: "기간 매출", 값: rangeTotals.매출 },
        { 항목: "기간 기사운반비", 값: rangeTotals.기사 },
        { 항목: "기간 수수료", 값: rangeTotals.수수료 },
        {},
        { 항목: "이번달 매출", 값: kpi.월매출 },
        { 항목: "이번달 기사운반비", 값: kpi.월기사 },
        { 항목: "이번달 수수료", 값: kpi.월수수료 },
        { 항목: "이번달 평균 이익률(%)", 값: Number(monthProfitRate.toFixed(1)) },
        {},
        { 항목: "전월 매출", 값: kpi.전월매출 },
        { 항목: "전월 대비 증감", 값: kpi.전월증감 },
        { 항목: "전월 대비 증감률(%)", 값: Number(kpi.전월증감률.toFixed(1)) },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

      // 2) 거래처별 집계 시트
      const wsClients = XLSX.utils.json_to_sheet(
        clientAgg.map((r) => ({
          거래처명: r.거래처명,
          건수: r.건수,
          매출: r.매출,
          기사운반비: r.기사,
          수수료: r.수수료,
          이익률: r.매출 > 0 ? Number(((r.수수료 / r.매출) * 100).toFixed(1)) : 0,
        }))
      );

      // 3) 상세 목록 시트
      const wsDetail = XLSX.utils.json_to_sheet(
        rangeRows.map((r, i) => ({
          순번: i + 1,
          상차일: r.상차일 || "",
          거래처명: r.거래처명 || "",
          차량번호: r.차량번호 || "",
          기사이름: r.이름 || "",
          청구운임: toInt(r.청구운임),
          기사운임: toInt(r.기사운임),
          수수료: toInt(r.청구운임) - toInt(r.기사운임),
          메모: r.메모 || "",
        }))
      );

      // 4) 일자 트렌드 시트(기간 필터 반영)
      const wsTrend = XLSX.utils.json_to_sheet(
        dailyTrend.map((d) => ({
          일자: d.date,
          매출: d.매출,
          기사운반비: d.기사,
          수수료: d.수수료,
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, "요약");
      XLSX.utils.book_append_sheet(wb, wsClients, "거래처별집계");
      XLSX.utils.book_append_sheet(wb, wsDetail, "상세목록");
      XLSX.utils.book_append_sheet(wb, wsTrend, "일자트렌드");
      XLSX.writeFile(wb, `매출관리_${startDate || "all"}~${endDate || "all"}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("엑셀 내보내기 중 오류가 발생했습니다.");
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">매출관리</h2>

      {/* 🚨 월 평균 이익률 경고 배너 (목표 15% 미만) */}
      {monthProfitRate < 15 && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2">
          <span className="font-semibold">⚠ 이번달 평균 이익률 {monthProfitRate.toFixed(1)}%</span>
          <span className="text-rose-600"> (목표 15% 미만)</span>
        </div>
      )}

      {/* 📅 필터 바 + 엑셀 다운로드 */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">시작일</label>
          <input type="date" className="border p-2 rounded" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">종료일</label>
          <input type="date" className="border p-2 rounded" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">거래처</label>
          <select className="border p-2 rounded min-w-[200px]" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">전체</option>
            {clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => { setStartDate(""); setEndDate(""); setClientFilter(""); }}
          className="px-3 py-2 rounded bg-gray-200"
        >
          필터 초기화
        </button>

        <button
          type="button"
          onClick={downloadExcel}
          className="ml-auto px-3 py-2 rounded bg-blue-600 text-white"
        >
          엑셀 다운로드
        </button>
      </div>

      {/* 🧠 대표 요약 덱 (이번달/전월/이익률) */}
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

      {/* 🧾 기간 합계 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SumCard label="기간 매출" value={won(rangeTotals.매출)} />
        <SumCard label="기간 기사운반비" value={won(rangeTotals.기사)} />
        <SumCard label="기간 수수료" value={won(rangeTotals.수수료)} highlight />
      </div>

      {/* 🔍 Top5 / 주의 거래처 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ChartPanel title="🏆 Top5 거래처 (매출 기준)">
          {topClients.length === 0 ? (
            <div className="text-gray-500 text-sm">표시할 데이터가 없습니다.</div>
          ) : (
            <SimpleBars
              data={topClients.map((d) => ({ label: d.거래처명, value: d.매출 }))}
              max={Math.max(1, ...topClients.map((d) => d.매출))}
              valueLabel={(v) => won(v)}
            />
          )}
        </ChartPanel>
        <ChartPanel title="⚠ 주의 거래처 (이익률 10% 미만)">
          {riskyClients.length === 0 ? (
            <div className="text-gray-500 text-sm">이익률 10% 미만 거래처가 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {riskyClients.map((d) => (
                <div key={d.거래처명} className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <div className="truncate font-medium text-rose-700">{d.거래처명}</div>
                  <div className="text-xs text-rose-700">
                    매출 {d.매출.toLocaleString()}원 · 수수료 {d.수수료.toLocaleString()}원 · 이익률 {(d.rate).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartPanel>
      </div>

      {/* 📊 그래프 영역: 전월 대비 라인 + 기간 트렌드 라인 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ChartPanel title={`전월 대비 일자 매출 (이번달 ${mKey} vs 전월 ${pKey})`}>
          <SimpleLine
            data={monthDaily.map((d) => ({ x: d.x, y1: d.y1, y2: d.y2 }))}
            series={[
              { key: "y1", name: "이번달 매출" },
              { key: "y2", name: "전월 매출" },
            ]}
          />
        </ChartPanel>
        <ChartPanel title="기간 일자 트렌드 (매출/수수료/기사)">
          <SimpleLine
            data={dailyTrend.map((d) => ({ x: d.date.slice(5), y1: d.매출, y2: d.수수료, y3: d.기사 }))}
            series={[
              { key: "y1", name: "매출" },
              { key: "y2", name: "수수료" },
              { key: "y3", name: "기사운반비" },
            ]}
          />
        </ChartPanel>
      </div>

      {/* 💼 거래처별 분석 테이블 (기간 필터 적용) */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">거래처별 기간 집계</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className={headBase}>거래처명</th>
                <th className={headBase}>건수</th>
                <th className={headBase}>매출</th>
                <th className={headBase}>기사운반비</th>
                <th className={headBase}>수수료</th>
                <th className={headBase}>이익률</th>
              </tr>
            </thead>
            <tbody>
              {clientAgg.length === 0 ? (
                <tr>
                  <td className="text-center text-gray-500 py-6" colSpan={6}>
                    조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                clientAgg.map((r) => {
                  const rateNum = r.매출 > 0 ? (r.수수료 / r.매출) * 100 : 0;
                  const rateStr = r.매출 > 0 ? rateNum.toFixed(1) + "%" : "-";
                  const colorClass =
                    r.매출 > 0 && rateNum < 10 ? "text-red-600 font-semibold"
                    : "text-gray-700";
                  return (
                    <tr key={r.거래처명} className="odd:bg-white even:bg-gray-50 text-center">
                      <td className={cellBase}>{r.거래처명}</td>
                      <td className={cellBase}>{r.건수}</td>
                      <td className={cellBase}>{r.매출.toLocaleString()}</td>
                      <td className={cellBase}>{r.기사.toLocaleString()}</td>
                      <td className={`${cellBase} text-blue-600 font-semibold`}>{r.수수료.toLocaleString()}</td>
                      <td className={`${cellBase} ${colorClass}`}>{rateStr}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🧾 기간 상세 목록 */}
      <div>
        <h3 className="font-semibold mb-2">기간 상세 목록</h3>
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
              </tr>
            </thead>
            <tbody>
              {rangeRows.length === 0 ? (
                <tr>
                  <td className="text-center text-gray-500 py-6" colSpan={8}>
                    기간/거래처 조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rangeRows.map((r, i) => (
                  <tr key={r._id || i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className={cellBase}>{i + 1}</td>
                    <td className={cellBase}>{r.상차일 || ""}</td>
                    <td className={cellBase}>{r.거래처명 || ""}</td>
                    <td className={cellBase}>{r.차량번호 || ""}</td>
                    <td className={cellBase}>{r.이름 || ""}</td>
                    <td className={cellBase}>{(toInt(r.청구운임)).toLocaleString()}</td>
                    <td className={cellBase}>{(toInt(r.기사운임)).toLocaleString()}</td>
                    <td className={cellBase}>{(toInt(r.청구운임) - toInt(r.기사운임)).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============= 보조 컴포넌트들 ============= */

// KPI 카드 (금액)
function KpiCard({ title, value, accent, subtle }) {
  const base = subtle
    ? "bg-gray-50 border-gray-200"
    : accent
    ? "bg-emerald-50 border-emerald-200"
    : "bg-white border-gray-200";
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${base}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-xl font-bold mt-1">{Number(value || 0).toLocaleString()}원</p>
    </div>
  );
}

// KPI 카드 (이익률 %)
function KpiMiniRate({ title, rate }) {
  const danger = rate < 10;
  const warn = rate >= 10 && rate < 15;
  const base =
    danger ? "bg-rose-50 border-rose-200 text-rose-700"
    : warn ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${base}`}>
      <p className="text-xs">{title}</p>
      <p className="text-xl font-bold mt-1">{(rate || 0).toFixed(1)}%</p>
    </div>
  );
}

// 전월 대비 증감 카드
function KpiDeltaCard({ title, diff, rate }) {
  const up = diff >= 0;
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${up ? "bg-blue-50 border-blue-200" : "bg-rose-50 border-rose-200"}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`text-xl font-bold mt-1 ${up ? "text-blue-700" : "text-rose-700"}`}>
        {`${diff >= 0 ? "+" : ""}${Number(diff || 0).toLocaleString()}원`}
      </p>
      <p className={`text-xs ${up ? "text-blue-700" : "text-rose-700"}`}>
        {`${rate >= 0 ? "+" : ""}${(rate || 0).toFixed(1)}%`}
      </p>
    </div>
  );
}

// 기간 합계 요약 카드
function SumCard({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl p-4 text-center border ${highlight ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"} shadow-sm`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

// 그래프 패널 컨테이너
function ChartPanel({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <h4 className="font-semibold mb-3">{title}</h4>
      {children}
    </div>
  );
}

// 간단 막대그래프 (Top N)
function SimpleBars({ data, max, barClass = "bg-blue-500", valueLabel }) {
  const safeMax = Math.max(1, max || 1);
  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="text-gray-500 text-sm">표시할 데이터가 없습니다.</div>
      ) : (
        data.map((d) => {
          const pct = Math.round((d.value / safeMax) * 100);
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-36 truncate text-xs text-gray-700" title={d.label}>{d.label}</div>
              <div className="flex-1 h-4 bg-gray-100 rounded">
                <div className={`h-4 rounded ${barClass}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-28 text-right text-xs text-gray-600">{valueLabel ? valueLabel(d.value) : d.value}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

// SVG 라인 차트 (다중 시리즈: y1,y2[,y3])
function SimpleLine({ data, series }) {
  const width = 560;
  const height = 280;
  const padding = { left: 40, right: 10, top: 10, bottom: 24 };

  const xs = data.map((d) => d.x);
  const xCount = xs.length || 1;

  const allY = [];
  data.forEach((d) => series.forEach((s) => allY.push(d[s.key] || 0)));
  const yMax = Math.max(1, ...allY);
  const yMin = 0;

  const xScale = (i) =>
    padding.left + (i * (width - padding.left - padding.right)) / Math.max(1, xCount - 1);
  const yScale = (v) =>
    padding.top + (height - padding.top - padding.bottom) * (1 - (v - yMin) / (yMax - yMin));

  const makePath = (key) => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(d[key] || 0)}`)
      .join(" ");
  };

  const colors = ["#2563eb", "#ef4444", "#10b981", "#6b7280"]; // 파랑/빨강/초록/회색

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[300px]">
      {/* 수평 그리드 + Y축 값 */}
      {Array.from({ length: 5 }).map((_, i) => {
        const yVal = yMin + ((yMax - yMin) * i) / 4;
        const y = yScale(yVal);
        return (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={4} y={y + 4} fontSize="10" fill="#6b7280">{Math.round(yVal).toLocaleString()}</text>
          </g>
        );
      })}
      {/* X축 라벨 (양끝 + 6등분 간격) */}
      {xs.map((d, i) => {
        const show = i === 0 || i === xCount - 1 || i % Math.ceil(xCount / 6) === 0;
        if (!show) return null;
        const x = xScale(i);
        return (
          <text key={i} x={x} y={height - 2} fontSize="10" textAnchor="middle" fill="#6b7280">
            {d}
          </text>
        );
      })}
      {/* 라인들 */}
      {series.map((s, idx) => (
        <path key={s.key} d={makePath(s.key)} fill="none" stroke={colors[idx % colors.length]} strokeWidth="2" />
      ))}
      {/* 범례 */}
      {series.map((s, idx) => (
        <g key={s.key} transform={`translate(${padding.left + idx * 140}, ${padding.top + 8})`}>
          <rect width="12" height="12" fill={colors[idx % colors.length]} rx="2" />
          <text x="16" y="11" fontSize="12" fill="#374151">{s.name}</text>
        </g>
      ))}
    </svg>
  );
}
// ===================== DispatchApp.jsx (PART 6/8) — END =====================



// ===================== DispatchApp.jsx (PART 7/8) — START =====================
function UnassignedStatus({ dispatchData, setDispatchData }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const result = (dispatchData || []).filter(
      (r) => (r.배차상태 || "") === "배차중"
    );
    if (!q.trim()) return result;
    const lower = q.toLowerCase();
    return result.filter((r) =>
      Object.values(r).some((v) =>
        String(v || "").toLowerCase().includes(lower)
      )
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
              {[
                "순번",
                "등록일",
                "상차일",
                "거래처명",
                "상차지명",
                "하차지명",
                "차량톤수",
                "차량종류",
                "화물내용",
                "배차상태",
                "메모",
              ].map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="text-center py-4" colSpan={11}>
                  모든 오더가 배차완료 상태입니다 🎉
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={r._id || i}
                  className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className={cellBase}>{i + 1}</td>
                  <td className={cellBase}>{r.등록일 || ""}</td>
                  <td className={cellBase}>{r.상차일 || ""}</td>
                  <td className={cellBase}>{r.거래처명 || ""}</td>
                  <td className={cellBase}>{r.상차지명 || ""}</td>
                  <td className={cellBase}>{r.하차지명 || ""}</td>
                  <td className={cellBase}>{r.차량톤수 || ""}</td>
                  <td className={cellBase}>{r.차량종류 || ""}</td>
                  <td className={cellBase}>{r.화물내용 || ""}</td>
                  <td className={cellBase}>
                    <StatusBadge s={r.배차상태} />
                  </td>
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

import html2canvas from "html2canvas";
import jsPDF from "jspdf";


// ===================== DispatchApp.jsx (PART 8/8) — START =====================
/* -------------------------------------------------
   거래처정산 (v12 완성형)
   - 거래처 엑셀 대용량 업로드 복원
   - PDF 저장 완벽 작동 (A4 + 확대)
   - 공급자/공급받는자 병렬형 디자인
   - 테두리 선 전체 표시
   - 꽉 찬 인쇄용 폰트, 거래기간 표시
--------------------------------------------------*/
function ClientSettlement({ dispatchData, clients = [], setClients }) {
  const [client, setClient] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [editInfo, setEditInfo] = useState({});
  const [showEdit, setShowEdit] = useState(false);

  // ✅ 거래처 찾기
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

  // ✅ 데이터 필터링
  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => (n ?? 0).toLocaleString();
  const inRange = (d) => (!start || d >= start) && (!end || d <= end);

  const rows = useMemo(() => {
    let list = Array.isArray(dispatchData) ? dispatchData : [];
    list = list.filter((r) => (r.배차상태 || "") === "배차완료");
    if (client) list = list.filter((r) => (r.거래처명 || "") === client);
    if (start || end) list = list.filter((r) => inRange(r.상차일 || ""));
    return list.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [dispatchData, client, start, end]);

  const mapped = rows.map((r, i) => {
    const 공급가 = toInt(r.청구운임);
    const 세액 = Math.round(공급가 * 0.1);
    return {
      idx: i + 1,
      상하차지: `${r.상차지명 || ""} - ${r.하차지명 || ""}`,
      화물명: r.화물내용 || "",
      기사명: r.이름 || "",
      공급가액: 공급가,
      세액,
    };
  });

  const 합계공급가 = mapped.reduce((a, b) => a + b.공급가액, 0);
  const 합계세액 = mapped.reduce((a, b) => a + b.세액, 0);

  const COMPANY = {
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

  // ✅ 거래처 엑셀 대용량 업로드
  const handleClientUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);
      const normalized = json.map((r) => ({
        거래처명: r.거래처명 || r.name || "",
        사업자번호: r.사업자번호 || "",
        대표자: r.대표자 || "",
        업태: r.업태 || "",
        종목: r.종목 || "",
        주소: r.주소 || "",
        담당자: r.담당자 || "",
        연락처: r.연락처 || "",
      }));
      setClients((prev) => [...prev, ...normalized]);
      alert(`${normalized.length}건의 거래처가 추가되었습니다.`);
    };
    reader.readAsArrayBuffer(file);
  };

  // ✅ PDF 저장 (고화질 확대)
  const savePDF = async () => {
    const area = document.getElementById("invoiceArea");
    const canvas = await html2canvas(area, { scale: 3, backgroundColor: "#fff", useCORS: true });
    const pdf = new jsPDF("p", "mm", "a4");
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 5, w, h - 5);
    pdf.save(`${client || "거래명세서"}_${new Date().toLocaleDateString("ko-KR")}.pdf`);
  };

  // ✅ 거래처 정보 수정
  const saveEdit = () => {
    const next = clients.map((c) =>
      c.거래처명 === client ? { ...c, ...editInfo } : c
    );
    setClients(next);
    alert("거래처 정보 수정 완료!");
    setShowEdit(false);
  };

  return (
    <div>
      {/* 상단 컨트롤바 */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">거래처</label>
          <select
            className="border p-2 rounded min-w-[220px]"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          >
            <option value="">거래처 선택</option>
            {clients.map((c) => (
              <option key={c.거래처명} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
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
          <label className="bg-green-600 text-white px-3 py-2 rounded cursor-pointer">
            📁 거래처 엑셀 업로드
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleClientUpload}
              className="hidden"
            />
          </label>
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

      {/* 거래명세서 본문 */}
      <div
        id="invoiceArea"
        className="bg-white border-2 border-blue-400 rounded-2xl shadow-md overflow-hidden text-[15px]"
      >
        <h2 className="text-3xl font-extrabold text-blue-800 text-center mt-6 mb-1">
          거래명세서
        </h2>
        {(start || end) && (
          <p className="text-center text-gray-600 font-medium mb-2">
            거래기간 : {start || "시작일 선택"} ~ {end || "종료일 선택"}
          </p>
        )}
        <p className="text-center text-gray-500 mb-4">
          (공급자 및 공급받는자 기재)
        </p>

        {/* 공급자/공급받는자 병렬 표 */}
        <div className="grid grid-cols-2 border-t-2 border-blue-400 mx-6 mb-6 rounded overflow-hidden">
          {/* 공급받는자 */}
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

          {/* 공급자 */}
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
                <td className="border p-2">{COMPANY.name}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  대표자
                </td>
                <td className="border p-2 relative">
                  {COMPANY.ceo} (인)
                  <img
                    src={COMPANY.seal}
                    alt="seal"
                    className="absolute right-4 top-1 h-8 w-8 opacity-80"
                  />
                </td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  사업자번호
                </td>
                <td className="border p-2">{COMPANY.bizNo}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  주소
                </td>
                <td className="border p-2">{COMPANY.addr}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  업태
                </td>
                <td className="border p-2">{COMPANY.type}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  종목
                </td>
                <td className="border p-2">{COMPANY.item}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 거래내역 */}
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full text-sm border border-blue-300">
            <thead>
              <tr className="bg-blue-50 text-blue-900 font-semibold text-center">
                {[
                  "No",
                  "상하차지",
                  "화물명",
                  "기사명",
                  "공급가액",
                  "세액(10%)",
                ].map((h) => (
                  <th key={h} className="border border-blue-300 p-2">
                    {h}
                  </th>
                ))}
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
          입금계좌: {COMPANY.bank} | 문의: {COMPANY.email}
        </div>
      </div>

      {/* 거래처 수정 팝업 */}
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
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 8/8) — END =====================
