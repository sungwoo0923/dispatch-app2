// ===================== FixedClients.jsx =====================
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { collection, onSnapshot, setDoc, doc, deleteDoc } from "firebase/firestore";
import { Dialog } from "@headlessui/react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const fmt = (n) => (n ? Number(n).toLocaleString() : "0");

function KpiCard({ title, value, unit = "원", color = "blue" }) {
  const colors = {
    blue: "border-l-blue-500 bg-blue-50/50",
    green: "border-l-emerald-500 bg-emerald-50/50",
    orange: "border-l-orange-500 bg-orange-50/50",
    purple: "border-l-purple-500 bg-purple-50/50",
  };
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors[color]} shadow-sm p-4`}>
      <div className="text-[12px] font-semibold text-gray-500 mb-1">{title}</div>
      <div className="text-[20px] font-bold text-gray-900">
        {value}<span className="text-[13px] font-semibold text-gray-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}

const tonList = ["다마스", "1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "11톤", "25톤"];

// 이번 달 기본값 (버튼용)
const thisMonthStart = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};
const thisMonthEnd = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
};

// ─── 기사 검색 드롭다운 (빠른등록 & 테이블 공용) ───
function DriverSearchInput({ value, onChange, onSelect, drivers, placeholder = "차량번호 또는 이름 검색", className = "" }) {

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const wrapperRef = useRef(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 부모에서 value가 변경되면 반영
  useEffect(() => { setQuery(value || ""); }, [value]);

  const suggestions = useMemo(() => {
    const q = (query || "").replace(/\s+/g, "").toLowerCase();
    if (!q) return [];
    return drivers.filter(d =>
      (d.차량번호 || "").replace(/\s+/g, "").toLowerCase().includes(q) ||
      (d.이름 || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, drivers]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[12px] text-center"
        placeholder={placeholder}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (query) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            if (suggestions.length > 0) {
              onSelect(suggestions[0]);
              setQuery(suggestions[0].차량번호);
              setOpen(false);
            }
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[200px]">

          {suggestions.map((d, i) => (
            <div
              key={i}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2 text-[12px]"
              onMouseDown={() => {
                onSelect(d);
                setQuery(d.차량번호);
                setOpen(false);
              }}
            >
              <span className="font-bold text-[#1B2B4B]">{d.이름}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">{d.차량번호}</span>
              {d.전화번호 && <span className="text-gray-400 ml-auto">{d.전화번호}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FixedClients({ drivers = [], upsertDriver }) {
  const coll = collection(db, "fixedClients");

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [showDoneOnly, setShowDoneOnly] = useState(false);

  // ★ 변경 1: 초기값 빈 문자열 → 처음 진입 시 데이터 안 보임
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [fastOpen, setFastOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ★ 변경 3: 정렬 state
  const [sortKey, setSortKey] = useState(null);      // 정렬 컬럼
  const [sortDir, setSortDir] = useState("asc");      // "asc" | "desc"

  const [fastRows, setFastRows] = useState([{
    날짜: new Date().toISOString().slice(0, 10),
    거래처명: "", 톤수: "", 수량: 1,
    기사단가: 0, 수수료단가: 0,
    차량번호: "", 이름: "", 핸드폰번호: "",
    기사운임: 0, 수수료: 0, 청구운임: 0
  }]);

  useEffect(() => {
    const unsub = onSnapshot(coll, (snap) => {
      setRows(snap.docs.map(d => d.data()).sort((a, b) => (b.날짜 || "").localeCompare(a.날짜 || "")));
    });
    return () => unsub();
  }, []);

  const saveRow = async (r) => await setDoc(doc(coll, r.id), r, { merge: true });
  const removeRow = async (id) => await deleteDoc(doc(coll, id));
  const updateRow = (id, patch) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  // ★ 변경 2-a: 테이블 내 차량번호 → 이름으로도 기사 매칭
  const handleDriverSelect = async (id, driver) => {
    const patch = { 차량번호: driver.차량번호, 이름: driver.이름, 핸드폰번호: driver.전화번호 };
    updateRow(id, patch);
    const row = rows.find(r => r.id === id);
    if (row) await saveRow({ ...row, ...patch });
  };

  // ★ 변경 1: 날짜가 둘 다 비어있으면 아무것도 표시하지 않음
  const filtered = useMemo(() => {
    // 날짜가 하나도 설정되지 않으면 빈 배열
    if (!startDate && !endDate) return [];

    let list = [...rows];
    if (startDate) list = list.filter(r => r.날짜 >= startDate);
    if (endDate) list = list.filter(r => r.날짜 <= endDate);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (showDoneOnly) list = list.filter(r => r.정산완료);

    // ★ 변경 3: 정렬 적용
    if (sortKey) {
      list.sort((a, b) => {
        let va = a[sortKey] ?? "";
        let vb = b[sortKey] ?? "";
        // 숫자 컬럼은 숫자로 비교
        if (["수량", "청구운임", "기사운임", "수수료"].includes(sortKey)) {
          va = Number(va) || 0;
          vb = Number(vb) || 0;
        } else {
          va = String(va).toLowerCase();
          vb = String(vb).toLowerCase();
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [rows, search, startDate, endDate, showDoneOnly, sortKey, sortDir]);

  const totalSale = filtered.reduce((a, b) => a + Number(b.청구운임 || 0), 0);
  const totalDrv = filtered.reduce((a, b) => a + Number(b.기사운임 || 0), 0);
  const totalFee = totalSale - totalDrv;
  const marginRate = totalSale ? ((totalFee / totalSale) * 100).toFixed(1) : "0";

  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach(r => { map[r.날짜] = (map[r.날짜] || 0) + Number(r.청구운임 || 0); });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, 매출]) => ({ date: date.slice(5), 매출 }));
  }, [filtered]);

  const topDrivers = useMemo(() => {
    const map = {};
    filtered.forEach(r => { const n = r.이름 || "미등록"; map[n] = (map[n] || 0) + Number(r.청구운임 || 0); });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [filtered]);

  const markSettlement = async () => {
    if (!selected.length) return alert("정산처리할 항목을 선택하세요.");
    const targets = rows.filter(r => selected.includes(r.id));
    if (!window.confirm(`${targets.length}건의 정산상태를 변경하시겠습니까?`)) return;
    for (const r of targets) await saveRow({ ...r, 정산완료: !r.정산완료 });
    setSelected([]);
  };

  const addRow = async () => {
    const newRow = { id: crypto.randomUUID(), 날짜: new Date().toISOString().slice(0, 10), 정산완료: false, 거래처명: "", 톤수: "", 수량: "", 차량번호: "", 이름: "", 핸드폰번호: "", 청구운임: "", 기사운임: "", 수수료: "" };
    await setDoc(doc(coll, newRow.id), newRow);
  };

  const removeSelected = async () => {
    for (const id of selected) await removeRow(id);
    setSelected([]);
    setDeleteConfirm(false);
  };

  // 빠른 등록 함수들
  const addFastRow = () => setFastRows(p => [...p, { 날짜: new Date().toISOString().slice(0, 10), 거래처명: "", 톤수: "", 수량: 1, 기사단가: 0, 수수료단가: 0, 차량번호: "", 이름: "", 핸드폰번호: "", 기사운임: 0, 수수료: 0, 청구운임: 0 }]);

  const updateFastField = (idx, field, value) => {
    setFastRows(prev => {
      const updated = [...prev];
      updated[idx][field] = value;
      const qty = Number(updated[idx].수량 || 0);
      const d = Number(updated[idx].기사단가 || 0);
      const f = Number(updated[idx].수수료단가 || 0);
      updated[idx].기사운임 = qty * d;
      updated[idx].수수료 = qty * f;
      updated[idx].청구운임 = updated[idx].기사운임 + updated[idx].수수료;
      return updated;
    });
  };

  // ★ 변경 2-b: 빠른등록에서 기사 선택 시 반영
  const selectFastDriver = (idx, driver) => {
    setFastRows(prev => {
      const updated = [...prev];
      updated[idx].차량번호 = driver.차량번호;
      updated[idx].이름 = driver.이름;
      updated[idx].핸드폰번호 = driver.전화번호;
      const qty = Number(updated[idx].수량 || 0);
      updated[idx].기사운임 = qty * Number(updated[idx].기사단가 || 0);
      updated[idx].수수료 = qty * Number(updated[idx].수수료단가 || 0);
      updated[idx].청구운임 = updated[idx].기사운임 + updated[idx].수수료;
      return updated;
    });
  };

  const submitFastRows = async () => {
    for (const row of fastRows) {
      const id = crypto.randomUUID();
      await setDoc(doc(coll, id), { id, ...row, 정산완료: false });
    }
    alert(`${fastRows.length}건 등록 완료!`);
    setFastRows([{ 날짜: new Date().toISOString().slice(0, 10), 거래처명: "", 톤수: "", 수량: 1, 기사단가: 0, 수수료단가: 0, 차량번호: "", 이름: "", 핸드폰번호: "", 기사운임: 0, 수수료: 0, 청구운임: 0 }]);
    setFastOpen(false);
  };

  // ★ 변경 3: 정렬 핸들러
  const handleSort = (key) => {
    if (sortKey === key) {
      // 같은 컬럼 다시 클릭 → 방향 전환, 3번째 클릭 → 정렬 해제
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="ml-1 text-white/30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const head = "px-3 py-3 text-center text-[13px] font-semibold text-white whitespace-nowrap bg-transparent border-b border-white/10 cursor-pointer select-none hover:bg-white/10 transition";
  const cell = "px-3 py-2.5 text-[13px] text-gray-800 text-center whitespace-nowrap border-b border-gray-100 align-middle";

  // 정렬 가능한 헤더 정의: [표시이름, 데이터키]
  const sortableHeaders = [
    ["정산", "정산완료"],
    ["날짜", "날짜"],
    ["거래처명", "거래처명"],
    ["톤수", "톤수"],
    ["수량", "수량"],
    ["차량번호", "차량번호"],
    ["기사명", "이름"],
    ["핸드폰", "핸드폰번호"],
    ["청구운임", "청구운임"],
    ["기사운임", "기사운임"],
    ["수수료", "수수료"],
  ];

  return (
    <div className="bg-gray-50 min-h-screen p-5 space-y-4">

      {/* ===== 헤더 ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#1B2B4B]">고정거래처 관리</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">고정 운송 계약 거래처 정산 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFastOpen(true)} className="px-4 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">+ 빠른 등록</button>
          <button onClick={addRow} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 transition">+ 행 추가</button>
        </div>
      </div>

      {/* ===== KPI ===== */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="총 청구금액" value={fmt(totalSale)} color="blue" />
        <KpiCard title="총 기사운임" value={fmt(totalDrv)} color="green" />
        <KpiCard title="총 수수료" value={fmt(totalFee)} color="orange" />
        <KpiCard title="수익률" value={marginRate} unit="%" color="purple" />
      </div>

      {/* ===== 검색 + 필터 ===== */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border-2 border-[#1B2B4B] rounded-xl overflow-hidden bg-white h-[36px]">
            <span className="pl-3 text-gray-400">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="거래처명 · 기사명 검색" className="flex-1 px-2 h-full text-[13px] outline-none w-48" />
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span className="text-gray-400 text-[13px]">~</span>
            <input type="date" className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <button onClick={() => { setStartDate(thisMonthStart()); setEndDate(thisMonthEnd()); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-500 hover:bg-gray-50 transition">이번 달</button>
          {/* ★ 날짜 초기화 버튼 */}
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }} className="px-3 py-1.5 rounded-lg border border-red-200 text-[13px] text-red-500 hover:bg-red-50 transition">날짜 초기화</button>
          )}
          <button onClick={() => setShowDoneOnly(p => !p)} className={`px-3 py-1.5 rounded-lg border text-[13px] font-semibold transition ${showDoneOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
            {showDoneOnly ? "✓ 정산완료만" : "정산완료만"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setEditMode(p => !p)} className={`px-3 py-1.5 rounded-lg border text-[13px] font-semibold transition ${editMode ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{editMode ? "수정 종료" : "수정"}</button>
            <button onClick={markSettlement} className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-300 text-[13px] font-semibold hover:bg-indigo-200 transition">정산 처리</button>
            <button onClick={() => { if (!selected.length) return alert("삭제할 항목을 선택하세요."); setDeleteConfirm(true); }} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 border border-red-300 text-[13px] font-semibold hover:bg-red-200 transition">삭제</button>
            <button onClick={() => { const ws = XLSX.utils.json_to_sheet(filtered); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "고정거래처"); XLSX.writeFile(wb, "고정거래처관리.xlsx"); }} className="px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 border border-teal-300 text-[13px] font-semibold hover:bg-teal-200 transition">엑셀다운</button>
          </div>
        </div>
      </div>

      {/* ===== 메인 레이아웃 ===== */}
      <div className="flex gap-4 items-start">

        {/* 테이블 */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#1B2B4B]">
                <tr>
                  <th className="px-3 py-3 text-center text-[13px] font-semibold text-white whitespace-nowrap bg-transparent border-b border-white/10">
                    <input type="checkbox" onChange={() => selected.length === filtered.length ? setSelected([]) : setSelected(filtered.map(r => r.id))} checked={selected.length > 0 && selected.length === filtered.length} />
                  </th>
                  {sortableHeaders.map(([label, key]) => (
                    <th key={label} className={head} onClick={() => handleSort(key)}>
                      {label}{sortIcon(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* ★ 변경 1: 날짜 미설정 시 안내 문구 */}
                {!startDate && !endDate ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center text-[14px] text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-3xl"></span>
                        <span>조회할 기간을 설정해주세요</span>
                        <button
                          onClick={() => { setStartDate(thisMonthStart()); setEndDate(thisMonthEnd()); }}
                          className="mt-2 px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition"
                        >
                          이번 달 조회
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={12} className="py-16 text-center text-[13px] text-gray-400">해당 기간에 데이터가 없습니다</td></tr>
                ) : filtered.map((r, idx) => (
                  <tr key={r.id} className={`transition hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${r.정산완료 ? "opacity-60" : ""}`}>
                    <td className={cell}><input type="checkbox" checked={selected.includes(r.id)} onChange={() => setSelected(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} /></td>
                    <td className={cell}>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${r.정산완료 ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-amber-100 text-amber-600 border-amber-300"}`}>
                        {r.정산완료 ? "✓ 완료" : "미정산"}
                      </span>
                    </td>
                    <td className={cell}>{editMode ? <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-[12px]" value={r.날짜} onChange={e => updateRow(r.id, { 날짜: e.target.value })} onBlur={() => saveRow(rows.find(x => x.id === r.id))} /> : r.날짜}</td>
                    <td className={`${cell} font-semibold`}>{editMode ? <input className="border border-gray-200 rounded-lg px-2 py-1 text-[12px] w-28" value={r.거래처명} onChange={e => updateRow(r.id, { 거래처명: e.target.value })} onBlur={() => saveRow(rows.find(x => x.id === r.id))} /> : r.거래처명}</td>
                    <td className={cell}>{editMode ? <select className="border border-gray-200 rounded-lg px-2 py-1 text-[12px]" value={r.톤수} onChange={e => updateRow(r.id, { 톤수: e.target.value })} onBlur={() => saveRow(rows.find(x => x.id === r.id))}><option value="">선택</option>{tonList.map(t => <option key={t}>{t}</option>)}</select> : r.톤수}</td>
                    <td className={cell}>{editMode ? <input type="number" className="border border-gray-200 rounded-lg px-2 py-1 text-[12px] w-16 text-center" value={r.수량} onChange={e => updateRow(r.id, { 수량: e.target.value })} onBlur={() => saveRow(rows.find(x => x.id === r.id))} /> : r.수량}</td>
                    {/* ★ 변경 2-a: 테이블 차량번호 → 이름/차량번호 검색 드롭다운 */}
                                        <td className={cell}>
                      <DriverSearchInput
                        value={r.차량번호}
                        drivers={drivers}
                        placeholder="차량번호·이름"
                        className="w-28"
                        onChange={(val) => updateRow(r.id, { 차량번호: val })}
                        onSelect={(d) => handleDriverSelect(r.id, d)}
                      />
                    </td>

                    <td className={`${cell} font-semibold`}>{r.이름}</td>
                    <td className={cell}>{r.핸드폰번호}</td>
                    {["청구운임","기사운임","수수료"].map(f => (
                      <td key={f} className={`${cell} text-right font-semibold ${f === "수수료" ? "text-orange-600" : f === "기사운임" ? "text-emerald-600" : "text-blue-600"}`}>
                        {editMode ? <input type="number" className="border border-gray-200 rounded-lg px-2 py-1 text-[12px] w-24 text-right" value={r[f]} onChange={e => updateRow(r.id, { [f]: Number(e.target.value) })} onBlur={() => saveRow(rows.find(x => x.id === r.id))} /> : fmt(r[f])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 사이드 대시보드 */}
        <div className="w-[300px] shrink-0 space-y-4">

          {/* 매출 차트 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1B2B4B] px-4 py-3"><h3 className="text-[14px] font-bold text-white">일별 매출</h3></div>
            <div className="p-4 h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1B2B4B" stopOpacity={0.3}/><stop offset="100%" stopColor="#1B2B4B" stopOpacity={0.02}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="매출" stroke="#1B2B4B" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 기사별 TOP 5 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1B2B4B] px-4 py-3"><h3 className="text-[14px] font-bold text-white">기사별 매출 TOP 5</h3></div>
            <div className="p-4 space-y-2">
              {topDrivers.length === 0 ? (
                <div className="text-[13px] text-gray-400 text-center py-4">데이터 없음</div>
              ) : topDrivers.map((d, i) => {
                const max = topDrivers[0]?.total || 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${i < 3 ? "bg-[#1B2B4B]" : "bg-gray-400"}`}>{i + 1}</div>
                    <div className="text-[12px] font-semibold text-gray-700 w-16 truncate">{d.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full bg-[#1B2B4B]" style={{ width: `${Math.round(d.total / max * 100)}%` }} />
                    </div>
                    <div className="text-[11px] font-bold text-gray-600 w-16 text-right">{d.total >= 1000000 ? `${(d.total/1000000).toFixed(1)}M` : fmt(d.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* 삭제 확인 팝업 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4"><h3 className="text-white font-bold text-[15px]">선택 항목을 삭제하시겠습니까?</h3><p className="text-white/60 text-[12px] mt-0.5">{selected.length}건 선택됨</p></div>
            <div className="flex gap-3 p-5">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={removeSelected} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 빠른 등록 모달 */}
      <Dialog open={fastOpen} onClose={() => setFastOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div><Dialog.Title className="text-white font-bold text-[16px]">빠른 신규등록</Dialog.Title><p className="text-white/60 text-[12px] mt-0.5">여러 건 한 번에 등록</p></div>
              <button onClick={() => setFastOpen(false)} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {fastRows.map((row, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-bold text-[#1B2B4B]">{idx + 1}번 등록</span>
                    {idx > 0 && <button onClick={() => setFastRows(p => p.filter((_, i) => i !== idx))} className="text-red-500 text-[12px] hover:text-red-700">삭제</button>}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[["날짜","date"],["거래처명","text"],["톤수","select"]].map(([label, type]) => (
                      <div key={label}>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
                        {type === "select" ? (
                          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.톤수} onChange={e => updateFastField(idx, "톤수", e.target.value)}>
                            <option value="">선택</option>{tonList.map(t => <option key={t}>{t}</option>)}
                          </select>
                        ) : (
                          <input type={type} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row[label]} onChange={e => updateFastField(idx, label, e.target.value)} />
                        )}
                      </div>
                    ))}
                    {/* ★ 변경 2-b: 빠른등록 차량번호 → 이름/차량번호 검색 드롭다운 */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">차량번호 / 기사명</label>
                      <DriverSearchInput
                        value={row.차량번호}
                        drivers={drivers}
                        placeholder="차량번호 또는 이름 입력"
                        onChange={(val) => updateFastField(idx, "차량번호", val)}
                        onSelect={(d) => selectFastDriver(idx, d)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">기사명</label>
                      <input className="w-full border border-gray-100 rounded-lg px-2 py-1.5 text-[13px] bg-gray-100" value={row.이름} readOnly />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">수량</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.수량} onChange={e => updateFastField(idx, "수량", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">기사단가</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.기사단가} onChange={e => updateFastField(idx, "기사단가", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">수수료단가</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]" value={row.수수료단가} onChange={e => updateFastField(idx, "수수료단가", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">
                    {[["기사운임", "text-emerald-600"],["수수료","text-orange-600"],["청구운임","text-blue-600"]].map(([f, cls]) => (
                      <div key={f} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-400">{f}</div>
                        <div className={`text-[14px] font-bold ${cls}`}>{fmt(row[f])}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-between shrink-0">
              <button onClick={addFastRow} className="px-4 py-2 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-semibold hover:bg-[#1B2B4B]/5 transition">+ 행 추가</button>
              <button onClick={submitFastRows} className="px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">저장하기</button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
