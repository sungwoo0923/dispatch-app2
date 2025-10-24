// ===================== DispatchApp.jsx (PART 1/4) — START =====================
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { auth, provider } from "./firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";

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
   메인 앱
   - Hook은 최상단에서만 선언(조건부 X)
   - 로그인 → 메뉴 → 본문 한 번만 return
--------------------------------------------------*/
export default function DispatchApp() {
  // 로그인 상태
  const [user, setUser] = useState(null);

  // 메뉴 & 데이터
  const [menu, setMenu] = useState("배차관리");
  const [dispatchData, setDispatchData] = useState(() =>
    safeLoad("dispatchData", [])
  );
  const [drivers, setDrivers] = useState(() => safeLoad("drivers", []));
  const [clients, setClients] = useState(() =>
    normalizeClients(
      safeLoad("clients", [
        { 거래처명: "반찬단지", 사업자번호: "", 사업자명: "", 메모: "" },
        { 거래처명: "리앤뉴", 사업자번호: "", 사업자명: "", 메모: "" },
      ])
    )
  );

  // 로그인 상태 구독
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  // Firestore 사용자 등록
  const registerUserInFirestore = async (user) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await setDoc(
      ref,
      {
        name: user.displayName || "이름없음",
        email: user.email,
        photoURL: user.photoURL || "",
        lastLogin: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const login = async () => {
    const result = await signInWithPopup(auth, provider);
    await registerUserInFirestore(result.user);
  };
  const logout = () => signOut(auth);

  // 로컬 저장 동기화
  useEffect(() => safeSave("dispatchData", dispatchData), [dispatchData]);
  useEffect(() => safeSave("drivers", drivers), [drivers]);
  useEffect(() => safeSave("clients", clients), [clients]);

  // 옵션
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

  // 로그인 화면
  if (!user)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <h1 className="text-xl mb-4 font-bold">회사 배차 시스템</h1>
        <button
          onClick={login}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Google 계정으로 로그인
        </button>
      </div>
    );

  // 로그인 후 메인
  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">배차 프로그램</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-700 text-sm">{user?.displayName}</span>
          <button
            onClick={logout}
            className="bg-gray-300 px-3 py-1 rounded text-sm"
          >
            로그아웃
          </button>
        </div>
      </header>

      <nav className="flex gap-2 mb-3">
        {[
          "배차관리",
          "실시간배차현황",
          "배차현황",
          "미배차현황",
          "기사관리",
          "거래처관리",
        ].map((m) => (
          <button
            key={m}
            onClick={() => setMenu(m)}
            className={`px-3 py-2 rounded ${
              menu === m ? "bg-blue-600 text-white" : "bg-white border"
            }`}
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
          />
        )}
        {menu === "배차현황" && (
          <DispatchStatus
            dispatchData={dispatchData}
            setDispatchData={setDispatchData}
            clients={clients}
            drivers={drivers}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
          />
        )}
        {menu === "미배차현황" && (
          <UnassignedStatus
            dispatchData={dispatchData}
            setDispatchData={setDispatchData}
          />
        )}
        {menu === "기사관리" && (
          <DriverManagement drivers={drivers} setDrivers={setDrivers} />
        )}
        {menu === "거래처관리" && (
          <ClientManagement clients={clients} setClients={setClients} />
        )}
      </main>
    </>
  );
}

/* -------------------------------------------------
   공통 스타일
--------------------------------------------------*/
const cellBase =
  "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[100px]";
const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100";
const inputBase = "border p-1 rounded w-36 text-center";

// ===================== DispatchApp.jsx (PART 1/4) — END =====================
// ===================== DispatchApp.jsx (PART 2/4) — START =====================

/* -------------------------------------------------
   배차관리 (입력 + 자동계산 + 기사 자동매칭)
--------------------------------------------------*/
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
    순번: "",
    등록일: new Date().toISOString().slice(0, 10),
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

  // 차량번호 입력 시 기사 자동매칭
  const autoFillByCar = (carNo) => {
    const normalized = (carNo || "").replace(/\s+/g, "");
    const d = drivers.find(
      (x) => (x.차량번호 || "").replace(/\s+/g, "") === normalized
    );
    if (d) {
      setForm((p) => ({
        ...p,
        차량번호: carNo,
        이름: d.이름 || "",
        전화번호: d.전화번호 || "",
      }));
    } else {
      setForm((p) => ({ ...p, 차량번호: carNo, 이름: "", 전화번호: "" }));
    }
  };

  // 입력 변경 핸들러
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

  // 거래처 빠른 추가
  const addClientQuick = () => {
    const 거래처명 = prompt("신규 거래처명:");
    if (!거래처명) return;
    const 사업자번호 = prompt("사업자번호(선택):") || "";
    const 사업자명 = prompt("사업자명(선택):") || "";
    const 메모 = prompt("메모(선택):") || "";
    const newClient = normalizeClient({ 거래처명, 사업자번호, 사업자명, 메모 });
    setClients((prev) => normalizeClients([...(prev || []), newClient]));
    setForm((p) => ({ ...p, 거래처명 }));
  };

  // 등록
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.거래처명) return alert("거래처명을 입력하세요.");

    const status =
      form.차량번호 && form.이름 && form.전화번호 ? "배차완료" : "배차중";

    const newRecord = {
      ...form,
      배차상태: status,
      순번: dispatchData.length + 1,
    };

    setDispatchData((prev) => [...prev, newRecord]);
    alert("등록되었습니다.");

    const reset = { ...emptyForm, 등록일: new Date().toISOString().slice(0, 10) };
    setForm(reset);
    safeSave("dispatchForm", reset);
  };

  const clientOptions = (clients || []).map(normalizeClient);

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3">
        {/* 거래처 선택 + 신규 */}
        <div className="col-span-2 flex gap-2">
          <select
            className="border p-2 rounded w-full"
            value={form.거래처명}
            onChange={(e) => onChange("거래처명", e.target.value)}
          >
            <option value="">거래처 선택</option>
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
          <option value="">차량종류 선택</option>
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
          <option value="">톤수 선택</option>
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

        <input
          className="border p-2 rounded"
          placeholder="차량번호"
          value={form.차량번호}
          onChange={(e) => onChange("차량번호", e.target.value)}
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

        <input
          type="date"
          className="border p-2 rounded"
          value={form.상차일}
          onChange={(e) => onChange("상차일", e.target.value)}
        />
        <select
          className="border p-2 rounded"
          value={form.상차시간}
          onChange={(e) => onChange("상차시간", e.target.value)}
        >
          <option value="">상차시간</option>
          {timeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          type="date"
          className="border p-2 rounded"
          value={form.하차일}
          onChange={(e) => onChange("하차일", e.target.value)}
        />
        <select
          className="border p-2 rounded"
          value={form.하차시간}
          onChange={(e) => onChange("하차시간", e.target.value)}
        >
          <option value="">하차시간</option>
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
          <option value="">상차방법</option>
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
          <option value="">하차방법</option>
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
          <option value="">지급방식</option>
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
          <option value="">배차방식</option>
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

        <button
          type="submit"
          className="col-span-6 bg-blue-600 text-white p-2 rounded"
        >
          저장
        </button>
      </form>
    </div>
  );
}

// ===================== DispatchApp.jsx (PART 2/4) — END =====================
// ===================== DispatchApp.jsx (PART 3/4) — START =====================

/* -------------------------------------------------
   실시간 배차현황 (등록일/상차일 필터 + 검색 + 인라인수정)
--------------------------------------------------*/
function RealtimeStatus({ dispatchData, setDispatchData }) {
  const [q, setQ] = useState("");
  const [등록일, set등록일] = useState("");
  const [상차일, set상차일] = useState("");

  const [editIndex, setEditIndex] = useState(null);
  const [edited, setEdited] = useState({});

  const filtered = useMemo(() => {
    let data = dispatchData;
    if (등록일) data = data.filter((r) => (r.등록일 || "").slice(0, 10) === 등록일);
    if (상차일) data = data.filter((r) => (r.상차일 || "") === 상차일);
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }
    return data;
  }, [dispatchData, q, 등록일, 상차일]);

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명","배차상태","배차방식","지급방식",
    "청구운임","기사운임","수수료","차량번호","이름","전화번호","수정","삭제",
  ];

  const onEditedChange = (k, v) => {
    setEdited((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "청구운임" || k === "기사운임") {
        const fare = parseInt(next.청구운임 || 0) || 0;
        const driver = parseInt(next.기사운임 || 0) || 0;
        next.수수료 = String(fare - driver);
      }
      return next;
    });
  };

  const startEdit = (row) => {
    setEditIndex(row);
    setEdited({ ...filtered[row] });
  };
  const cancelEdit = () => {
    setEditIndex(null);
    setEdited({});
  };
  const saveEdit = () => {
    if (editIndex == null) return;
    const rowObj = filtered[editIndex];
    const idx = dispatchData.indexOf(rowObj);
    if (idx < 0) return;
    const next = [...dispatchData];
    next[idx] = { ...next[idx], ...edited };
    setDispatchData(next);
    setEditIndex(null);
    setEdited({});
    alert("저장되었습니다.");
  };
  const remove = (idxInFiltered) => {
    const rowObj = filtered[idxInFiltered];
    const idx = dispatchData.indexOf(rowObj);
    if (idx < 0) return;
    if (!confirm("해당 배차 건을 삭제할까요?")) return;
    const next = [...dispatchData];
    next.splice(idx, 1);
    setDispatchData(next);
  };

  const renderEditCell = (k, v) => {
    if (k === "등록일" || k === "상차일" || k === "하차일") {
      return (
        <input
          type="date"
          className={inputBase}
          value={v || ""}
          onChange={(e) => onEditedChange(k, e.target.value)}
        />
      );
    }
    if (k === "상차시간" || k === "하차시간") {
      const times = Array.from({ length: 24 * 6 }, (_, i) => {
        const h = String(Math.floor(i / 6)).padStart(2, "0");
        const m = String((i % 6) * 10).padStart(2, "0");
        return `${h}:${m}`;
      });
      return (
        <select
          className={inputBase}
          value={v || ""}
          onChange={(e) => onEditedChange(k, e.target.value)}
        >
          <option value="">선택</option>
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    }
    if (k === "배차상태") {
      const opts = ["배차중", "배차완료", "취소"];
      return (
        <select
          className={inputBase}
          value={v || ""}
          onChange={(e) => onEditedChange(k, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    }
    if (k === "배차방식") {
      const opts = ["24시", "인성", "직접배차", "24시(외부업체)"];
      return (
        <select
          className={inputBase}
          value={v || ""}
          onChange={(e) => onEditedChange(k, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    }
    if (k === "지급방식") {
      const opts = ["계산서", "착불", "선불", "계좌이체"];
      return (
        <select
          className={inputBase}
          value={v || ""}
          onChange={(e) => onEditedChange(k, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className={inputBase}
        value={v || ""}
        onChange={(e) => onEditedChange(k, e.target.value)}
      />
    );
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">실시간 배차현황</h2>

      <div className="flex gap-3 items-end mb-3">
        <div>
          <label className="block text-sm">등록일</label>
          <input
            type="date"
            className="border p-1 rounded"
            value={등록일}
            onChange={(e) => set등록일(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm">상차일</label>
          <input
            type="date"
            className="border p-1 rounded"
            value={상차일}
            onChange={(e) => set상차일(e.target.value)}
          />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어 (거래처/차량/이름/상태 등)"
          className="border p-2 rounded w-80"
        />
        <button
          onClick={() => {
            set등록일("");
            set상차일("");
            setQ("");
          }}
          className="px-3 py-2 bg-gray-200 rounded"
        >
          초기화
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => (
              <tr key={idx} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{idx + 1}</td>

                {[
                  "등록일","상차일","상차시간","하차일","하차시간","거래처명","상차지명","하차지명",
                  "배차상태","배차방식","지급방식","청구운임","기사운임","수수료","차량번호","이름","전화번호",
                ].map((k) => {
                  const v = editIndex === idx ? edited[k] ?? r[k] ?? "" : r[k] || "";
                  return (
                    <td key={k} className={cellBase}>
                      {editIndex === idx ? renderEditCell(k, v) : v}
                    </td>
                  );
                })}

                <td className={cellBase}>
                  {editIndex === idx ? (
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={saveEdit}
                        className="bg-blue-600 text-white px-2 py-1 rounded"
                      >
                        저장
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="bg-gray-300 px-2 py-1 rounded"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(idx)}
                      className="bg-gray-300 px-2 py-1 rounded"
                    >
                      수정
                    </button>
                  )}
                </td>
                <td className={cellBase}>
                  <button
                    onClick={() => remove(idx)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   배차현황 (필터/수정/엑셀 다운로드 + 변경 셀 표시)
--------------------------------------------------*/
function DispatchStatus({
  dispatchData,
  setDispatchData,
  clients,
  drivers,
  timeOptions,
  tonOptions,
}) {
  const [filters, setFilters] = useState({
    등록일: "",
    상차일: "",
    거래처명: "",
    상차지명: "",
    차량번호: "",
    이름: "",
    전화번호: "",
    배차상태: "",
  });

  const filtered = useMemo(() => {
    return dispatchData.filter((r) => {
      if (filters.등록일 && (r.등록일 || "").slice(0, 10) !== filters.등록일) return false;
      if (filters.상차일 && (r.상차일 || "") !== filters.상차일) return false;
      if (filters.거래처명 && filters.거래처명 !== "전체" && (r.거래처명 || "") !== filters.거래처명)
        return false;
      if (filters.상차지명 && filters.상차지명 !== "전체" && (r.상차지명 || "") !== filters.상차지명)
        return false;
      if (filters.차량번호 && !(r.차량번호 || "").includes(filters.차량번호)) return false;
      if (filters.이름 && !(r.이름 || "").includes(filters.이름)) return false;
      if (filters.전화번호 && !(r.전화번호 || "").includes(filters.전화번호)) return false;
      if (filters.배차상태 && filters.배차상태 !== "전체" && (r.배차상태 || "") !== filters.배차상태)
        return false;
      return true;
    });
  }, [dispatchData, filters]);

  const [editIndex, setEditIndex] = useState(null);
  const [edited, setEdited] = useState({});
  const [modifiedCells, setModifiedCells] = useState(() => safeLoad("modifiedCells", {}));
  useEffect(() => safeSave("modifiedCells", modifiedCells), [modifiedCells]);

  const startEdit = (row) => {
    setEditIndex(row);
    setEdited({ ...filtered[row] });
  };

  const onEditedChange = (key, value) => {
    setEdited((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "청구운임" || key === "기사운임") {
        const fare = parseInt(next.청구운임 || 0) || 0;
        const driverFare = parseInt(next.기사운임 || 0) || 0;
        next.수수료 = String(fare - driverFare);
      }
      if (key === "차량번호") {
        const normalized = (value || "").replace(/\s+/g, "");
        const d = drivers.find((x) => (x.차량번호 || "").replace(/\s+/g, "") === normalized);
        if (d) {
          next.이름 = d.이름 || "";
          next.전화번호 = d.전화번호 || "";
        }
      }
      return next;
    });
  };

  const saveEdit = () => {
    if (editIndex == null) return;
    const rowObj = filtered[editIndex];
    const idx = dispatchData.indexOf(rowObj);
    if (idx < 0) return;

    const blocked = { 등록일: true, 순번: true };

    const nextRow = {
      ...dispatchData[idx],
      ...Object.fromEntries(Object.entries(edited).filter(([k]) => !blocked[k])),
    };

    const newData = [...dispatchData];
    const before = newData[idx];
    newData[idx] = nextRow;
    setDispatchData(newData);

    const newMod = { ...modifiedCells, [idx]: { ...(modifiedCells[idx] || {}) } };
    Object.keys(nextRow).forEach((k) => {
      if (blocked[k]) return;
      if (String(before[k] || "") !== String(nextRow[k] || "")) newMod[idx][k] = true;
    });
    setModifiedCells(newMod);
    setEditIndex(null);
    alert("저장되었습니다.");
  };

  const remove = (rowInFiltered) => {
    const rowObj = filtered[rowInFiltered];
    const idx = dispatchData.indexOf(rowObj);
    if (idx < 0) return;
    if (!confirm("해당 배차 건을 삭제할까요?")) return;
    const next = [...dispatchData];
    next.splice(idx, 1);
    setDispatchData(next);
  };

  const renderEditCell = (key, value) => {
    if (key === "상차일" || key === "하차일") {
      return (
        <input
          type="date"
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        />
      );
    }
    if (key === "상차시간" || key === "하차시간") {
      return (
        <select
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        >
          <option value="">선택</option>
          {timeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    }
    if (key === "거래처명") {
      const opts = normalizeClients(clients).map((c) => c.거래처명);
      return (
        <select
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    }
    if (key === "차량종류") {
      const opts = [
        "라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑",
      ];
      return (
        <select
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    }
    if (key === "차량톤수") {
      return (
        <select
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        >
          <option value="">선택</option>
          {tonOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    }
    if (key === "지급방식") {
      const opts = ["계산서","착불","선불","계좌이체"];
      return (
        <select
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    }
    if (key === "배차방식") {
      const opts = ["24시","인성","직접배차","24시(외부업체)"];
      return (
        <select
          className={inputBase}
          value={value || ""}
          onChange={(e) => onEditedChange(key, e.target.value)}
        >
          <option value="">선택</option>
          {opts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className={inputBase}
        value={value || ""}
        onChange={(e) => onEditedChange(key, e.target.value)}
      />
    );
  };

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간","거래처명",
    "상차지명","하차지명","화물내용","차량종류","차량톤수","차량번호",
    "이름","전화번호","지급방식","배차방식","청구운임","기사운임","수수료","메모","수정","삭제",
  ];

  const clientOptions = useMemo(
    () => ["전체", ...normalizeClients(clients).map((c) => c.거래처명)],
    [clients]
  );

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차현황</h2>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-sm">등록일</label>
          <input
            type="date"
            className="border p-1 rounded w-full"
            value={filters.등록일}
            onChange={(e) => setFilters((p) => ({ ...p, 등록일: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm">상차일</label>
          <input
            type="date"
            className="border p-1 rounded w-full"
            value={filters.상차일}
            onChange={(e) => setFilters((p) => ({ ...p, 상차일: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm">거래처명</label>
          <select
            className="border p-1 rounded w-full"
            value={filters.거래처명 || "전체"}
            onChange={(e) => setFilters((p) => ({ ...p, 거래처명: e.target.value }))}
          >
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm">상차지명</label>
          <select
            className="border p-1 rounded w-full"
            value={filters.상차지명 || "전체"}
            onChange={(e) => setFilters((p) => ({ ...p, 상차지명: e.target.value }))}
          >
            {[
              "전체",
              ...Array.from(new Set(dispatchData.map((d) => d.상차지명 || "").filter(Boolean))),
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm">차량번호</label>
          <input
            className="border p-1 rounded w-full"
            value={filters.차량번호}
            onChange={(e) => setFilters((p) => ({ ...p, 차량번호: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm">이름</label>
          <input
            className="border p-1 rounded w-full"
            value={filters.이름}
            onChange={(e) => setFilters((p) => ({ ...p, 이름: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm">전화번호</label>
          <input
            className="border p-1 rounded w-full"
            value={filters.전화번호}
            onChange={(e) => setFilters((p) => ({ ...p, 전화번호: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm">배차상태</label>
          <select
            className="border p-1 rounded w-full"
            value={filters.배차상태 || "전체"}
            onChange={(e) => setFilters((p) => ({ ...p, 배차상태: e.target.value }))}
          >
            {[
              "전체",
              ...Array.from(new Set(dispatchData.map((d) => d.배차상태 || "").filter(Boolean))),
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 flex items-end gap-2">
          <button
            onClick={() =>
              setFilters({
                등록일: "",
                상차일: "",
                거래처명: "",
                상차지명: "",
                차량번호: "",
                이름: "",
                전화번호: "",
                배차상태: "",
              })
            }
            className="bg-gray-200 px-3 py-1 rounded"
          >
            초기화
          </button>
          <button
            onClick={() => {
              const rows = filtered.map((r, i) => ({
                순번: i + 1,
                등록일: r.등록일 || "",
                상차일: r.상차일 || "",
                상차시간: r.상차시간 || "",
                하차일: r.하차일 || "",
                하차시간: r.하차시간 || "",
                거래처명: r.거래처명 || "",
                상차지명: r.상차지명 || "",
                하차지명: r.하차지명 || "",
                화물내용: r.화물내용 || "",
                차량종류: r.차량종류 || "",
                차량톤수: r.차량톤수 || "",
                차량번호: r.차량번호 || "",
                이름: r.이름 || "",
                전화번호: r.전화번호 || "",
                배차상태: r.배차상태 || "",
                지급방식: r.지급방식 || "",
                배차방식: r.배차방식 || "",
                청구운임: r.청구운임 || "",
                기사운임: r.기사운임 || "",
                수수료: r.수수료 || "",
                메모: r.메모 || "",
              }));
              const ws = XLSX.utils.json_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "배차현황");
              XLSX.writeFile(
                wb,
                `배차현황_${new Date().toISOString().slice(0, 10)}.xlsx`
              );
            }}
            className="bg-green-600 text-white px-3 py-1 rounded"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1700px] text-sm border">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const globalIndex = dispatchData.indexOf(r);
              const mod = (k) =>
                modifiedCells[globalIndex]?.[k] ? "text-red-600 font-semibold" : "";

              return (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{i + 1}</td>
                  <td className={cellBase}>{r.등록일 || ""}</td>

                  {[
                    "상차일","상차시간","하차일","하차시간","거래처명","상차지명","하차지명",
                    "화물내용","차량종류","차량톤수","차량번호","이름","전화번호",
                    "지급방식","배차방식","청구운임","기사운임","수수료","메모",
                  ].map((k) => {
                    const val = editIndex === i ? (edited[k] ?? r[k] ?? "") : (r[k] || "");
                    return (
                      <td key={k} className={`${cellBase} ${mod(k)}`}>
                        {editIndex === i ? renderEditCell(k, val) : val}
                      </td>
                    );
                  })}

                  <td className={cellBase}>
                    {editIndex === i ? (
                      <button
                        onClick={saveEdit}
                        className="bg-blue-600 text-white px-2 py-1 rounded"
                      >
                        저장
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(i)}
                        className="bg-gray-300 px-2 py-1 rounded"
                      >
                        수정
                      </button>
                    )}
                  </td>
                  <td className={cellBase}>
                    <button
                      onClick={() => remove(i)}
                      className="bg-red-500 text-white px-2 py-1 rounded"
                    >
                      삭제
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

// ===================== DispatchApp.jsx (PART 3/4) — END =====================
// ===================== DispatchApp.jsx (PART 4/4) — START =====================

/* -------------------------------------------------
   미배차현황 (차량/이름/전화번호 미기입 건만)
--------------------------------------------------*/
function UnassignedStatus({ dispatchData, setDispatchData }) {
  const list = dispatchData.filter((r) => !r.차량번호 || !r.이름 || !r.전화번호);
  const [q, setQ] = useState("");
  const [상차일, set상차일] = useState("");

  const [editIndex, setEditIndex] = useState(null);
  const [edited, setEdited] = useState({});

  const filtered = useMemo(() => {
    let data = list;
    if (상차일) data = data.filter((r) => (r.상차일 || "") === 상차일);
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower))
      );
    }
    return data;
  }, [q, list, 상차일]);

  const headers = [
    "순번","등록일","상차일","하차일","거래처명","상차지명","하차지명","화물내용","차량종류","차량톤수","메모","수정","삭제"
  ];

  const onEditedChange = (k, v) => {
    setEdited((p) => ({ ...p, [k]: v }));
  };

  const startEdit = (i) => { setEditIndex(i); setEdited({ ...filtered[i] }); };
  const cancelEdit = () => { setEditIndex(null); setEdited({}); };
  const saveEdit = () => {
    if (editIndex == null) return;
    const row = filtered[editIndex];
    const idx = dispatchData.indexOf(row);
    if (idx < 0) return;
    const next = [...dispatchData];
    next[idx] = { ...row, ...edited };
    setDispatchData(next);
    setEditIndex(null);
    alert("저장되었습니다.");
  };
  const remove = (i) => {
    const row = filtered[i];
    const idx = dispatchData.indexOf(row);
    if (idx < 0) return;
    if (!confirm("삭제하시겠습니까?")) return;
    const next = [...dispatchData];
    next.splice(idx, 1);
    setDispatchData(next);
  };

  const renderEditCell = (k, v) => (
    <input
      className={inputBase}
      value={v || ""}
      onChange={(e) => onEditedChange(k, e.target.value)}
    />
  );

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">미배차현황</h2>

      <div className="flex gap-3 items-end mb-3">
        <div>
          <label className="block text-sm">상차일</label>
          <input
            type="date"
            className="border p-1 rounded"
            value={상차일}
            onChange={(e) => set상차일(e.target.value)}
          />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border p-2 rounded w-72"
          placeholder="검색어"
        />
        <button
          onClick={() => { set상차일(""); setQ(""); }}
          className="px-3 py-2 bg-gray-200 rounded"
        >
          초기화
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1300px] text-sm border">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{i + 1}</td>
                {[
                  "등록일","상차일","하차일","거래처명","상차지명","하차지명","화물내용","차량종류","차량톤수","메모",
                ].map((k) => (
                  <td key={k} className={cellBase}>
                    {editIndex === i
                      ? renderEditCell(k, edited[k] ?? r[k] ?? "")
                      : r[k] || ""}
                  </td>
                ))}
                <td className={cellBase}>
                  {editIndex === i ? (
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={saveEdit}
                        className="bg-blue-600 text-white px-2 py-1 rounded"
                      >
                        저장
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="bg-gray-300 px-2 py-1 rounded"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(i)}
                      className="bg-gray-300 px-2 py-1 rounded"
                    >
                      수정
                    </button>
                  )}
                </td>
                <td className={cellBase}>
                  <button
                    onClick={() => remove(i)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   기사관리 (엑셀 업로드 + 수동등록 + 검색 + 수정/삭제)
--------------------------------------------------*/
function DriverManagement({ drivers, setDrivers }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ 이름:"", 전화번호:"", 차량번호:"", 차량종류:"" });
  const [q, setQ] = useState("");

  const [editIndex,setEditIndex]=useState(null);
  const [edited,setEdited]=useState({});

  const onUpload = () => {
    if (!file) return alert("엑셀 파일을 선택하세요.");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      const rows = json.map((r) => ({
        이름: r.이름 || r.name || r.기사명 || "",
        전화번호: r.전화번호 || r.핸드폰번호 || r.phone || "",
        차량번호: r.차량번호 || r.car || r.차량 || "",
        차량종류: r.차량종류 || r.type || "",
      }));
      setDrivers((prev)=>[...prev, ...rows]);
      alert("업로드 완료");
    };
    reader.readAsArrayBuffer(file);
  };

  const addOne = () => {
    if (!form.이름 || !form.차량번호) return alert("이름과 차량번호는 필수입니다.");
    setDrivers((prev)=>[...prev, form]);
    setForm({ 이름:"", 전화번호:"", 차량번호:"", 차량종류:"" });
  };

  const filtered = useMemo(()=>{
    if(!q.trim()) return drivers;
    const lower = q.toLowerCase();
    return drivers.filter((d)=>Object.values(d).some(v=>String(v||"").toLowerCase().includes(lower)));
  }, [q, drivers]);

  const saveEdit=()=>{
    if (editIndex == null) return;
    const row=filtered[editIndex];
    const idx=drivers.indexOf(row);
    if (idx < 0) return;
    const next=[...drivers];
    next[idx]={...row,...edited};
    setDrivers(next);
    setEditIndex(null);
  };
  const remove=(i)=>{
    const row=filtered[i];
    const idx=drivers.indexOf(row);
    if(idx<0)return;
    if(!confirm("삭제하시겠습니까?"))return;
    const next=[...drivers];
    next.splice(idx,1);
    setDrivers(next);
  };

  const headers = ["이름","전화번호","차량번호","차량종류","수정","삭제"];

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">기사관리</h2>

      <div className="flex gap-2 items-center mb-3">
        <input type="file" accept=".xlsx,.xls" onChange={(e)=>setFile(e.target.files[0]||null)} />
        <button onClick={onUpload} className="bg-green-600 text-white px-3 py-1 rounded">엑셀 업로드</button>
        <input placeholder="검색 (이름/차량번호 등)" className="border p-2 rounded w-64 ml-3"
          value={q} onChange={(e)=>setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        {["이름","전화번호","차량번호","차량종류"].map((k)=>(
          <input key={k} placeholder={k} className="border p-2 rounded"
            value={form[k]||""} onChange={(e)=>setForm(p=>({...p,[k]: e.target.value}))}/>
        ))}
      </div>
      <button onClick={addOne} className="bg-blue-600 text-white px-3 py-1 rounded mb-3">등록</button>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>{headers.map(h=><th key={h} className={headBase}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((d,i)=>(
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {["이름","전화번호","차량번호","차량종류"].map(k=>(
                  <td key={k} className={cellBase}>
                    {editIndex===i?(
                      <input className={inputBase} value={edited[k]??d[k]??""} onChange={(e)=>setEdited(p=>({...p,[k]:e.target.value}))}/>
                    ):(d[k]||"")}
                  </td>
                ))}
                <td className={cellBase}>
                  {editIndex===i?(
                    <button onClick={saveEdit} className="bg-blue-600 text-white px-2 py-1 rounded">저장</button>
                  ):(
                    <button onClick={()=>{setEditIndex(i);setEdited({...d});}} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                  )}
                </td>
                <td className={cellBase}>
                  <button onClick={()=>remove(i)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   거래처관리 (업로드/검색/수정/삭제)
--------------------------------------------------*/
function ClientManagement({ clients, setClients }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    거래처명: "",
    사업자번호: "",
    주소: "",
    사업자명: "",
    메모: "",
  });
  const [q, setQ] = useState("");

  const [editIndex,setEditIndex]=useState(null);
  const [edited,setEdited]=useState({});

  const onUpload = () => {
    if (!file) return alert("엑셀 파일을 선택하세요.");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      const rows = json.map((r) => ({
        거래처명: r.거래처명 || r.name || "",
        사업자번호: r.사업자번호 || r.사업자등록번호 || "",
        주소: r.주소 || r.address || "",
        사업자명: r.사업자명 || r.대표자명 || "",
        메모: r.메모 || r.memo || "",
      }));
      setClients((prev) => [...(prev || []), ...rows]);
      alert("업로드 완료");
    };
    reader.readAsArrayBuffer(file);
  };

  const addOne = () => {
    if (!form.거래처명) return alert("거래처명은 필수입니다.");
    setClients((prev) => [...(prev || []), form]);
    setForm({ 거래처명: "", 사업자번호: "", 주소: "", 사업자명: "", 메모: "" });
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return clients || [];
    const lower = q.toLowerCase();
    return (clients || []).filter((c) =>
      Object.values(c).some((v) => String(v || "").toLowerCase().includes(lower))
    );
  }, [q, clients]);

  const saveEdit=()=>{
    if (editIndex == null) return;
    const row=filtered[editIndex];
    const idx=clients.indexOf(row);
    if (idx < 0) return;
    const next=[...clients];
    next[idx]={...row,...edited};
    setClients(next);
    setEditIndex(null);
  };
  const remove=(i)=>{
    const row=filtered[i];
    const idx=clients.indexOf(row);
    if(idx<0)return;
    if(!confirm("삭제하시겠습니까?"))return;
    const next=[...clients];
    next.splice(idx,1);
    setClients(next);
  };

  const headers = ["거래처명","사업자번호","주소","사업자명","메모","수정","삭제"];

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>

      <div className="flex gap-2 items-center mb-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
        <button
          onClick={onUpload}
          className="bg-green-600 text-white px-3 py-1 rounded"
        >
          엑셀 업로드
        </button>
        <input
          placeholder="검색 (거래처/사업자번호/주소/사업자명/메모)"
          className="border p-2 rounded w-80 ml-3"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-5 gap-2 mb-2">
        {["거래처명", "사업자번호", "주소", "사업자명", "메모"].map((k) => (
          <input
            key={k}
            placeholder={k}
            className="border p-2 rounded"
            value={form[k]}
            onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
          />
        ))}
      </div>
      <button
        onClick={addOne}
        className="bg-blue-600 text-white px-3 py-1 rounded mb-3"
      >
        등록
      </button>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={`${c.거래처명}-${i}`} className="odd:bg-white even:bg-gray-50">
                {["거래처명","사업자번호","주소","사업자명","메모"].map((k)=>(
                  <td key={k} className={cellBase}>
                    {editIndex===i?(
                      <input className={inputBase} value={edited[k]??c[k]??""} onChange={(e)=>setEdited(p=>({...p,[k]:e.target.value}))}/>
                    ):(c[k]||"")}
                  </td>
                ))}
                <td className={cellBase}>
                  {editIndex===i?(
                    <button onClick={saveEdit} className="bg-blue-600 text-white px-2 py-1 rounded">저장</button>
                  ):(
                    <button onClick={()=>{setEditIndex(i);setEdited({...c});}} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                  )}
                </td>
                <td className={cellBase}>
                  <button onClick={()=>remove(i)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===================== DispatchApp.jsx (PART 4/4) — END =====================
