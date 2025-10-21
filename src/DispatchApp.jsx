// src/DispatchApp.jsx
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* -------------------------------------------------
   유틸: 안전한 JSON 로드/저장 + 데이터 정규화
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

// Client(거래처) 정규화: 다양한 키를 표준키로 맞춤
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
    사업자번호: row.사업자번호 || row.사업자등록증 || row.사업자등록번호 || "",
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
  // 같은 거래처명 중복 제거(가장 최근 항목 우선)
  const map = new Map();
  mapped.forEach((c) => map.set(c.거래처명, c));
  return Array.from(map.values());
}

/* -------------------------------------------------
   메인 앱
--------------------------------------------------*/
export default function DispatchApp() {
  const [menu, setMenu] = useState("배차관리");

  // 데이터 로드
  const [dispatchData, setDispatchData] = useState(() =>
    safeLoad("dispatchData", [])
  );
  const [drivers, setDrivers] = useState(() =>
    safeLoad("drivers", [])
  );
  const [clients, setClients] = useState(() =>
    normalizeClients(safeLoad("clients", [
      { 거래처명: "반찬단지", 사업자번호: "", 사업자명: "", 메모: "" },
      { 거래처명: "리앤뉴", 사업자번호: "", 사업자명: "", 메모: "" },
    ]))
  );

  // 저장소 동기화
  useEffect(() => safeSave("dispatchData", dispatchData), [dispatchData]);
  useEffect(() => safeSave("drivers", drivers), [drivers]);
  useEffect(() => safeSave("clients", clients), [clients]);

  // 시간/톤수 옵션
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">배차 프로그램</h1>
        <nav className="flex gap-2">
          {["배차관리", "실시간배차현황", "배차현황", "미배차현황", "기사관리", "거래처관리"].map(
            (m) => (
              <button
                key={m}
                onClick={() => setMenu(m)}
                className={`px-3 py-2 rounded ${
                  menu === m ? "bg-blue-600 text-white" : "bg-white border"
                }`}
              >
                {m}
              </button>
            )
          )}
        </nav>
      </header>

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
          <RealtimeStatus dispatchData={dispatchData} />
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
          <UnassignedStatus dispatchData={dispatchData} />
        )}

        {menu === "기사관리" && (
          <DriverManagement drivers={drivers} setDrivers={setDrivers} />
        )}

        {menu === "거래처관리" && (
          <ClientManagement clients={clients} setClients={setClients} />
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------
   공통 테이블 유틸 클래스
   - 줄바꿈 금지(whitespace-nowrap)
   - 최소너비 부여로 한 줄 유지 + 가로스크롤 허용
--------------------------------------------------*/
const cellBase =
  "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[100px]";

const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100";
const inputBase = "border p-1 rounded w-36 text-center";

/* -------------------------------------------------
   배차관리 (입력값 유지 + 자동계산 + 기사 자동매칭)
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

  const autoFillByCar = (carNo) => {
    const normalized = (carNo || "").replace(/\s+/g, "");
    const d = drivers.find(
      (x) => (x.차량번호 || "").replace(/\s+/g, "") === normalized
    );
    if (d) {
      setForm((p) => ({ ...p, 차량번호: carNo, 이름: d.이름 || "", 전화번호: d.전화번호 || "" }));
    } else {
      setForm((p) => ({ ...p, 차량번호: carNo, 이름: "", 전화번호: "" }));
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
    setForm((p) => ({ ...p, 거래처명 }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.거래처명) return alert("거래처명을 선택/입력해주세요.");

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
        {/* 거래처 + 신규 */}
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

        <input className="border p-2 rounded" placeholder="상차지명"
          value={form.상차지명} onChange={(e) => onChange("상차지명", e.target.value)} />
        <input className="border p-2 rounded" placeholder="하차지명"
          value={form.하차지명} onChange={(e) => onChange("하차지명", e.target.value)} />
        <input className="border p-2 rounded" placeholder="화물내용"
          value={form.화물내용} onChange={(e) => onChange("화물내용", e.target.value)} />

        <select className="border p-2 rounded"
          value={form.차량종류} onChange={(e) => onChange("차량종류", e.target.value)}>
          <option value="">차량종류 선택</option>
          {["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑"].map(v=>(
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <select className="border p-2 rounded"
          value={form.차량톤수} onChange={(e) => onChange("차량톤수", e.target.value)}>
          <option value="">톤수 선택</option>
          {tonOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <input className="border p-2 rounded" placeholder="청구운임"
          value={form.청구운임} onChange={(e) => onChange("청구운임", e.target.value)} />
        <input className="border p-2 rounded" placeholder="기사운임"
          value={form.기사운임} onChange={(e) => onChange("기사운임", e.target.value)} />
        <input className="border p-2 rounded bg-gray-100" placeholder="수수료"
          value={form.수수료} readOnly />

        <input className="border p-2 rounded" placeholder="차량번호"
          value={form.차량번호} onChange={(e) => onChange("차량번호", e.target.value)} />
        <input className="border p-2 rounded bg-gray-100" placeholder="기사이름"
          value={form.이름} readOnly />
        <input className="border p-2 rounded bg-gray-100" placeholder="핸드폰번호"
          value={form.전화번호} readOnly />

        <input type="date" className="border p-2 rounded"
          value={form.상차일} onChange={(e) => onChange("상차일", e.target.value)} />
        <select className="border p-2 rounded"
          value={form.상차시간} onChange={(e) => onChange("상차시간", e.target.value)}>
          <option value="">상차시간</option>
          {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <input type="date" className="border p-2 rounded"
          value={form.하차일} onChange={(e) => onChange("하차일", e.target.value)} />
        <select className="border p-2 rounded"
          value={form.하차시간} onChange={(e) => onChange("하차시간", e.target.value)}>
          <option value="">하차시간</option>
          {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="border p-2 rounded"
          value={form.상차방법} onChange={(e) => onChange("상차방법", e.target.value)}>
          <option value="">상차방법</option>
          {["지게차","수작업","직접수작업","수도움"].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="border p-2 rounded"
          value={form.하차방법} onChange={(e) => onChange("하차방법", e.target.value)}>
          <option value="">하차방법</option>
          {["지게차","수작업","직접수작업","수도움"].map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select className="border p-2 rounded"
          value={form.지급방식} onChange={(e) => onChange("지급방식", e.target.value)}>
          <option value="">지급방식</option>
          {["계산서","착불","선불","계좌이체"].map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select className="border p-2 rounded"
          value={form.배차방식} onChange={(e) => onChange("배차방식", e.target.value)}>
          <option value="">배차방식</option>
          {["24시","인성","직접배차","24시(외부업체)"].map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <textarea className="border p-2 rounded col-span-6 h-20" placeholder="메모"
          value={form.메모} onChange={(e) => onChange("메모", e.target.value)} />

        <button type="submit" className="col-span-6 bg-blue-600 text-white p-2 rounded">
          저장
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------
   실시간 배차현황 (등록일/상차일 필터 + 검색)
   - 표는 줄바꿈 없이 한 줄 표시
   - 순번은 화면 기준 idx+1 로 리셋
--------------------------------------------------*/
function RealtimeStatus({ dispatchData }) {
  const [q, setQ] = useState("");
  const [등록일, set등록일] = useState("");
  const [상차일, set상차일] = useState("");

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
    "청구운임","기사운임","수수료","차량번호","이름","전화번호",
  ];

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">실시간 배차현황</h2>

      <div className="flex gap-3 items-end mb-3">
        <div>
          <label className="block text-sm">등록일</label>
          <input type="date" className="border p-1 rounded" value={등록일} onChange={(e)=>set등록일(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">상차일</label>
          <input type="date" className="border p-1 rounded" value={상차일} onChange={(e)=>set상차일(e.target.value)} />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어 (거래처/차량/이름/상태 등)"
          className="border p-2 rounded w-80"
        />
        <button
          onClick={()=>{ set등록일(""); set상차일(""); setQ(""); }}
          className="px-3 py-2 bg-gray-200 rounded"
        >
          초기화
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h.key} className={headBase}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx)=>(
              <tr key={idx} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{idx+1}</td>
                <td className={cellBase}>{r.등록일||""}</td>
                <td className={cellBase}>{r.상차일||""}</td>
                <td className={cellBase}>{r.상차시간||""}</td>
                <td className={cellBase}>{r.하차일||""}</td>
                <td className={cellBase}>{r.하차시간||""}</td>
                <td className={cellBase}>{r.거래처명||""}</td>
                <td className={cellBase}>{r.상차지명||""}</td>
                <td className={cellBase}>{r.하차지명||""}</td>
                <td className={cellBase}>{r.배차상태||""}</td>
                <td className={cellBase}>{r.배차방식||""}</td>
                <td className={cellBase}>{r.지급방식||""}</td>
                <td className={cellBase}>{r.청구운임||""}</td>
                <td className={cellBase}>{r.기사운임||""}</td>
                <td className={cellBase}>{r.수수료||""}</td>
                <td className={cellBase}>{r.차량번호||""}</td>
                <td className={cellBase}>{r.이름||""}</td>
                <td className={cellBase}>{r.전화번호||""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   배차현황 (수정/엑셀) — 차량번호 변경 시 기사 자동매칭
   - 줄바꿈 금지
   - 순번은 화면 기준 idx+1 로 리셋
   - 셀 수정 시: 날짜/시간/드롭다운 입력 + 수수료 자동계산
--------------------------------------------------*/
function DispatchStatus({ dispatchData, setDispatchData, clients, drivers, timeOptions, tonOptions }) {
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
      if (filters.등록일 && (r.등록일 || "").slice(0,10) !== filters.등록일) return false;
      if (filters.상차일 && (r.상차일 || "") !== filters.상차일) return false;
      if (filters.거래처명 && filters.거래처명 !== "전체" && (r.거래처명 || "") !== filters.거래처명) return false;
      if (filters.상차지명 && filters.상차지명 !== "전체" && (r.상차지명 || "") !== filters.상차지명) return false;
      if (filters.차량번호 && !(r.차량번호 || "").includes(filters.차량번호)) return false;
      if (filters.이름 && !(r.이름 || "").includes(filters.이름)) return false;
      if (filters.전화번호 && !(r.전화번호 || "").includes(filters.전화번호)) return false;
      if (filters.배차상태 && filters.배차상태 !== "전체" && (r.배차상태 || "") !== filters.배차상태) return false;
      return true;
    });
  }, [dispatchData, filters]);

  const [editIndex, setEditIndex] = useState(null);
  const [edited, setEdited] = useState({});
  const [modifiedCells, setModifiedCells] = useState(() =>
    safeLoad("modifiedCells", {})
  );
  useEffect(() => safeSave("modifiedCells", modifiedCells), [modifiedCells]);

  const clientOptions = useMemo(
    () => ["전체", ...normalizeClients(clients).map(c=>c.거래처명)],
    [clients]
  );
  const pickupOptions = useMemo(
    () => ["전체", ...Array.from(new Set(dispatchData.map(d => d.상차지명 || "").filter(Boolean)))],
    [dispatchData]
  );
  const statusOptions = useMemo(
    () => ["전체", ...Array.from(new Set(dispatchData.map(d => d.배차상태 || "").filter(Boolean)))],
    [dispatchData]
  );

  const startEdit = (row) => {
    setEditIndex(row);
    setEdited({ ...filtered[row] });
  };

  // 수수료 자동 계산 (편집 중에도 반영)
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

    const blocked = { 등록일: true, 순번: true, 배차상태: true };

    let nextRow = { ...dispatchData[idx], ...Object.fromEntries(
      Object.entries(edited).filter(([k]) => !blocked[k])
    ) };

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

  const exportExcel = () => {
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
    XLSX.writeFile(wb, `배차현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 편집용 드롭다운/입력 렌더
  const renderEditCell = (key, value) => {
    if (key === "상차일" || key === "하차일") {
      return (
        <input type="date" className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)} />
      );
    }
    if (key === "상차시간" || key === "하차시간") {
      return (
        <select className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)}>
          <option value="">선택</option>
          {timeOptions.map((t)=><option key={t} value={t}>{t}</option>)}
        </select>
      );
    }
    if (key === "거래처명") {
      const opts = normalizeClients(clients).map(c=>c.거래처명);
      return (
        <select className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)}>
          <option value="">선택</option>
          {opts.map((n)=><option key={n} value={n}>{n}</option>)}
        </select>
      );
    }
    if (key === "차량종류") {
      const opts = ["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑"];
      return (
        <select className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)}>
          <option value="">선택</option>
          {opts.map((n)=><option key={n} value={n}>{n}</option>)}
        </select>
      );
    }
    if (key === "차량톤수") {
      return (
        <select className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)}>
          <option value="">선택</option>
          {tonOptions.map((n)=><option key={n} value={n}>{n}</option>)}
        </select>
      );
    }
    if (key === "지급방식") {
      const opts = ["계산서","착불","선불","계좌이체"];
      return (
        <select className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)}>
          <option value="">선택</option>
          {opts.map((n)=><option key={n} value={n}>{n}</option>)}
        </select>
      );
    }
    if (key === "배차방식") {
      const opts = ["24시","인성","직접배차","24시(외부업체)"];
      return (
        <select className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)}>
          <option value="">선택</option>
          {opts.map((n)=><option key={n} value={n}>{n}</option>)}
        </select>
      );
    }
    // 숫자형(운임/수수료)은 일반 input
    return (
      <input className={inputBase} value={value || ""} onChange={(e)=>onEditedChange(key, e.target.value)} />
    );
  };

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간","거래처명",
    "상차지명","하차지명","화물내용","차량종류","차량톤수","차량번호",
    "이름","전화번호","지급방식","배차방식","청구운임","기사운임","수수료","메모","수정",
  ];

  const editableKeys = [
    "상차일","상차시간","하차일","하차시간","거래처명","상차지명","하차지명",
    "화물내용","차량종류","차량톤수","차량번호","이름","전화번호",
    "지급방식","배차방식","청구운임","기사운임","수수료","메모",
  ];

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차현황</h2>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-sm">등록일</label>
          <input type="date" className="border p-1 rounded w-full"
            value={filters.등록일} onChange={(e)=>setFilters(p=>({...p, 등록일: e.target.value}))} />
        </div>
        <div>
          <label className="block text-sm">상차일</label>
          <input type="date" className="border p-1 rounded w-full"
            value={filters.상차일} onChange={(e)=>setFilters(p=>({...p, 상차일: e.target.value}))} />
        </div>
        <div>
          <label className="block text-sm">거래처명</label>
          <select className="border p-1 rounded w-full"
            value={filters.거래처명 || "전체"}
            onChange={(e)=>setFilters(p=>({...p, 거래처명: e.target.value}))}>
            {["전체", ...normalizeClients(clients).map(c=>c.거래처명)].map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm">상차지명</label>
          <select className="border p-1 rounded w-full"
            value={filters.상차지명 || "전체"}
            onChange={(e)=>setFilters(p=>({...p, 상차지명: e.target.value}))}>
            {["전체", ...Array.from(new Set(dispatchData.map(d => d.상차지명 || "").filter(Boolean)))].map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm">차량번호</label>
          <input className="border p-1 rounded w-full"
            value={filters.차량번호} onChange={(e)=>setFilters(p=>({...p, 차량번호: e.target.value}))}/>
        </div>
        <div>
          <label className="block text-sm">이름</label>
          <input className="border p-1 rounded w-full"
            value={filters.이름} onChange={(e)=>setFilters(p=>({...p, 이름: e.target.value}))}/>
        </div>
        <div>
          <label className="block text-sm">전화번호</label>
          <input className="border p-1 rounded w-full"
            value={filters.전화번호} onChange={(e)=>setFilters(p=>({...p, 전화번호: e.target.value}))}/>
        </div>
        <div>
          <label className="block text-sm">배차상태</label>
          <select className="border p-1 rounded w-full"
            value={filters.배차상태 || "전체"}
            onChange={(e)=>setFilters(p=>({...p, 배차상태: e.target.value}))}>
            {["전체", ...Array.from(new Set(dispatchData.map(d => d.배차상태 || "").filter(Boolean)))].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="col-span-2 flex items-end gap-2">
          <button
            onClick={()=>setFilters({등록일:"",상차일:"",거래처명:"",상차지명:"",차량번호:"",이름:"",전화번호:"",배차상태:""})}
            className="bg-gray-200 px-3 py-1 rounded"
          >
            초기화
          </button>
          <button onClick={exportExcel} className="bg-green-600 text-white px-3 py-1 rounded">
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1600px] text-sm border">
          <thead>
            <tr>
              {headers.map(h=> <th key={h} className={headBase}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const globalIndex = dispatchData.indexOf(r);
              const mod = (k) => (modifiedCells[globalIndex]?.[k] ? "text-red-600 font-semibold" : "");

              return (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  {/* 순번: 화면 기준으로 1부터 */}
                  <td className={cellBase}>{i+1}</td>
                  <td className={cellBase}>{r.등록일||""}</td>

                  {editableKeys.map((k)=>{
                    const val = editIndex === i ? (edited[k] ?? r[k] ?? "") : (r[k] || "");
                    return (
                      <td key={k} className={`${cellBase} ${mod(k)}`}>
                        {editIndex === i
                          ? renderEditCell(k, val)
                          : val}
                      </td>
                    );
                  })}

                  <td className={cellBase}>
                    {editIndex === i ? (
                      <button onClick={saveEdit} className="bg-blue-600 text-white px-2 py-1 rounded">저장</button>
                    ) : (
                      <button onClick={()=>startEdit(i)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
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

/* -------------------------------------------------
   미배차현황
   - 요청대로 “배차 안된 건”만, 줄바꿈 금지
   - 순번은 화면 기준 idx+1 로 리셋
   - (최신 요구사항 반영) 차량번호/이름/전화번호 컬럼 제거,
     화물내용/차량종류/차량톤수 추가
--------------------------------------------------*/
function UnassignedStatus({ dispatchData }) {
  const list = dispatchData.filter((r)=>!r.차량번호 || !r.이름 || !r.전화번호);
  const [q, setQ] = useState("");
  const [상차일, set상차일] = useState("");

  const filtered = useMemo(() => {
    let data = list;
    if (상차일) data = data.filter((r) => (r.상차일 || "") === 상차일);
    if (q.trim()) {
      const lower = q.toLowerCase();
      data = data.filter((r)=>Object.values(r).some(v=>String(v||"").toLowerCase().includes(lower)));
    }
    return data;
  }, [q, list, 상차일]);

  const headers = [
    "순번","등록일","상차일","거래처명","상차지명","하차지명","화물내용","차량종류","차량톤수","메모"
  ];

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">미배차현황</h2>

      <div className="flex gap-3 items-end mb-3">
        <div>
          <label className="block text-sm">상차일</label>
          <input type="date" className="border p-1 rounded" value={상차일} onChange={(e)=>set상차일(e.target.value)} />
        </div>
        <input value={q} onChange={(e)=>setQ(e.target.value)} className="border p-2 rounded w-72" placeholder="검색어" />
        <button onClick={()=>{ set상차일(""); setQ(""); }} className="px-3 py-2 bg-gray-200 rounded">초기화</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>
              {headers.map(h=>(
                <th key={h.key} className={headBase}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r,i)=>(
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{i+1}</td>
                <td className={cellBase}>{r.등록일||""}</td>
                <td className={cellBase}>{r.상차일||""}</td>
                <td className={cellBase}>{r.거래처명||""}</td>
                <td className={cellBase}>{r.상차지명||""}</td>
                <td className={cellBase}>{r.하차지명||""}</td>
                <td className={cellBase}>{r.화물내용||""}</td>
                <td className={cellBase}>{r.차량종류||""}</td>
                <td className={cellBase}>{r.차량톤수||""}</td>
                <td className={cellBase}>{r.메모||""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   기사관리 (엑셀 업로드 + 수동등록 + 검색)
   - 이름/전화번호/차량번호/차량종류
--------------------------------------------------*/
function DriverManagement({ drivers, setDrivers }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ 이름:"", 전화번호:"", 차량번호:"", 차량종류:"" });
  const [q, setQ] = useState("");

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

  const headers = ["이름","전화번호","차량번호","차량종류"];

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
        {headers.map((k)=>(
          <input key={k} placeholder={k} className="border p-2 rounded"
            value={form[k]} onChange={(e)=>setForm(p=>({...p, [k]: e.target.value}))}/>
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
                <td className={cellBase}>{d.이름}</td>
                <td className={cellBase}>{d.전화번호}</td>
                <td className={cellBase}>{d.차량번호}</td>
                <td className={cellBase}>{d.차량종류}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   거래처관리 (거래처명/사업자번호/사업자명/메모 + 업로드/검색)
--------------------------------------------------*/
function ClientManagement({ clients, setClients }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ 거래처명:"", 사업자번호:"", 사업자명:"", 메모:"" });
  const [q, setQ] = useState("");

  const onUpload = () => {
    if (!file) return alert("엑셀 파일을 선택하세요.");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      const rows = normalizeClients(json);
      setClients((prev)=>normalizeClients([...(prev||[]), ...rows]));
      alert("업로드 완료");
    };
    reader.readAsArrayBuffer(file);
  };

  const addOne = () => {
    if (!form.거래처명) return alert("거래처명은 필수입니다.");
    setClients((prev)=>normalizeClients([...(prev||[]), form]));
    setForm({ 거래처명:"", 사업자번호:"", 사업자명:"", 메모:"" });
  };

  const list = useMemo(()=>normalizeClients(clients), [clients]);
  const filtered = useMemo(()=>{
    if(!q.trim()) return list;
    const lower = q.toLowerCase();
    return list.filter(c =>
      [c.거래처명, c.사업자번호, c.사업자명, c.메모]
        .some(v => String(v||"").toLowerCase().includes(lower))
    );
  }, [q, list]);

  const headers = ["거래처명","사업자번호","사업자명","메모"];

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>

      <div className="flex gap-2 items-center mb-3">
        <input type="file" accept=".xlsx,.xls" onChange={(e)=>setFile(e.target.files[0]||null)} />
        <button onClick={onUpload} className="bg-green-600 text-white px-3 py-1 rounded">엑셀 업로드</button>
        <input placeholder="검색 (거래처/사업자번호/사업자명/메모)" className="border p-2 rounded w-80 ml-3"
          value={q} onChange={(e)=>setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        {headers.map((k)=>(
          <input key={k} placeholder={k} className="border p-2 rounded"
            value={form[k]} onChange={(e)=>setForm(p=>({...p, [k]: e.target.value}))}/>
        ))}
      </div>
      <button onClick={addOne} className="bg-blue-600 text-white px-3 py-1 rounded mb-3">등록</button>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>{headers.map(h=><th key={h} className={headBase}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((c,i)=>(
              <tr key={`${c.거래처명}-${i}`} className="odd:bg-white even:bg-gray-50">
                <td className={cellBase}>{c.거래처명}</td>
                <td className={cellBase}>{c.사업자번호}</td>
                <td className={cellBase}>{c.사업자명}</td>
                <td className={cellBase}>{c.메모}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

