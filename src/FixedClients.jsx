// ===================== FixedClients.jsx 최종 완성본 =====================
import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";

import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

import { Dialog } from "@headlessui/react";

// ★★★ 반드시 최상단 import 구역에 있어야 함 ★★★
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
/* -------------------- KPI 카드 컴포넌트 -------------------- */
function KPI({ title, value, color = "blue" }) {
  const colorMap = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    green: "bg-green-100 text-green-700 border-green-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
  };

  return (
    <div className={`p-4 rounded-lg border shadow-sm ${colorMap[color]}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}


export default function FixedClients({ drivers = [], upsertDriver }) {
  const coll = collection(db, "fixedClients");

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");

  // 정산완료만 보기
  const [showDoneOnly, setShowDoneOnly] = useState(false);

  // 지게차 비용
  const [prepaidFee, setPrepaidFee] = useState(0);
  const [appliedFee, setAppliedFee] = useState(0);

  // 날짜 필터
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 계산기
  const [calcQty, setCalcQty] = useState(1);
  const [calcDriver, setCalcDriver] = useState(5000);
  const [calcFee, setCalcFee] = useState(2000);

  const tonList = ["다마스", "1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "11톤", "25톤"];
  const fmt = (n) => (n ? Number(n).toLocaleString() : "");

  // Firestore 실시간
  useEffect(() => {
    const unsub = onSnapshot(coll, (snap) => {
      const data = snap.docs.map((d) => d.data());
      const sorted = [...data].sort((a, b) =>
        (b.날짜 || "").localeCompare(a.날짜 || "")
      );
      setRows(sorted);
    });
    return () => unsub();
  }, []);

  const saveRow = async (r) => await setDoc(doc(coll, r.id), r, { merge: true });
  const removeRow = async (id) => await deleteDoc(doc(coll, id));

  const updateRow = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const toggleSelect = (id) =>
    setSelected((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );

  // 추가
  const addRow = async () => {
    const newRow = {
      id: crypto.randomUUID(),
      날짜: new Date().toISOString().slice(0, 10),
      정산완료: false,
      거래처명: "",
      톤수: "",
      수량: "",
      차량번호: "",
      이름: "",
      핸드폰번호: "",
      청구운임: "",
      기사운임: "",
      수수료: "",
    };
    await setDoc(doc(coll, newRow.id), newRow);
  };

  const removeSelectedRows = async () => {
    if (!selected.length) return alert("삭제할 항목을 선택하세요.");
    if (!confirm("선택된 항목을 삭제하시겠습니까?")) return;
    for (const id of selected) await removeRow(id);
    setSelected([]);
  };

  // 차량번호 자동매칭
  const handleCarInput = async (id, val, e) => {
    if (e && e.key && e.key !== "Enter") return;
    const v = String(val || "").replace(/\s+/g, "");
    const match = drivers.find((d) => d.차량번호 === v);
    if (match) {
      const patch = {
        차량번호: match.차량번호,
        이름: match.이름,
        핸드폰번호: match.전화번호,
      };
      updateRow(id, patch);
      await saveRow({ ...rows.find((r) => r.id === id), ...patch });
    }
  };

  // 계산기 추가
  const handleCalcAdd = async () => {
    const newRow = {
      id: crypto.randomUUID(),
      날짜: new Date().toISOString().slice(0, 10),
      정산완료: false,
      거래처명: "",
      톤수: "",
      수량: calcQty,
      청구운임: calcQty * (calcDriver + calcFee),
      기사운임: calcQty * calcDriver,
      수수료: calcQty * calcFee,
    };
    await setDoc(doc(coll, newRow.id), newRow);
  };

  // 정산완료 ↔ 미정산 토글
  const markSettlement = async () => {
    if (!selected.length) return alert("정산처리할 항목을 선택하세요.");

    const targets = rows.filter((r) => selected.includes(r.id));

    if (!confirm(`${targets.length}건의 정산상태를 변경하시겠습니까?`)) return;

    for (const r of targets) {
      await saveRow({
        ...r,
        정산완료: !r.정산완료,
      });
    }

    alert("정산상태가 변경되었습니다.");
    setSelected([]);
  };

  // 필터
  const filtered = useMemo(() => {
    let list = [...rows];

    if (startDate) list = list.filter((r) => r.날짜 >= startDate);
    if (endDate) list = list.filter((r) => r.날짜 <= endDate);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    if (showDoneOnly) {
      list = list.filter((r) => r.정산완료);
    }

    return list;
  }, [rows, search, startDate, endDate, showDoneOnly]);

  // 합계
  const totalSale = filtered.reduce((a, b) => a + Number(b.청구운임 || 0), 0);
  const totalDrv = filtered.reduce((a, b) => a + Number(b.기사운임 || 0), 0);
  const totalFee = totalSale - totalDrv;

  // 전체/필터 기준 실 수수료
  const realFee = appliedFee || totalFee - Number(prepaidFee || 0);
  /* -------------------- 기사별 매출 TOP5 계산 -------------------- */
const topDrivers = useMemo(() => {
  const map = {};

  filtered.forEach((r) => {
    const name = r.이름 || "미등록";
    const sale = Number(r.청구운임 || 0);

    if (!map[name]) map[name] = 0;
    map[name] += sale;
  });

  return Object.entries(map)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}, [filtered]);

/* -------------------- 최근 14일 매출 그래프 -------------------- */
const chartData = useMemo(() => {
  const now = new Date();
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);

    const daySum = filtered
      .filter((r) => r.날짜 === key)
      .reduce((a, b) => a + Number(b.청구운임 || 0), 0);

    return {
      date: key.slice(5),
      매출: daySum,
    };
  });

  return days;
}, [filtered]);
// ======================== 빠른 신규등록 팝업 상태 =========================
const [fastOpen, setFastOpen] = useState(false);

const [fastRows, setFastRows] = useState([
  {
    날짜: new Date().toISOString().slice(0, 10),
    거래처명: "",
    톤수: "",
    수량: 1,
    기사단가: 0,
    수수료단가: 0,
    차량번호: "",
    이름: "",
    핸드폰번호: "",
    기사운임: 0,
    수수료: 0,
    청구운임: 0
  }
]);

const addFastRow = () => {
  setFastRows((prev) => [
    ...prev,
    {
      날짜: new Date().toISOString().slice(0, 10),
      거래처명: "",
      톤수: "",
      수량: 1,
      기사단가: 0,
      수수료단가: 0,
      차량번호: "",
      이름: "",
      핸드폰번호: "",
      기사운임: 0,
      수수료: 0,
      청구운임: 0
    }
  ]);
};

const removeFastRow = (idx) => {
  setFastRows((prev) => prev.filter((_, i) => i !== idx));
};

const updateFastField = (idx, field, value) => {
  setFastRows((prev) => {
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

const matchFastDriver = (idx, car) => {
  const v = (car || "").replace(/\s+/g, "");

  const match = drivers.find((d) => d.차량번호 === v);

  setFastRows((prev) => {
    const updated = [...prev];

    // 기본 매칭
    if (match) {
      updated[idx].차량번호 = match.차량번호;
      updated[idx].이름 = match.이름;
      updated[idx].핸드폰번호 = match.전화번호;
    }

    // ======== ★ 차량번호별 자동 단가 설정 로직 ★ ========
    const groupA = ["인천83바5608", "경기95자4318"];   // 단가 6000 / 수수료 1000
    const groupB = ["서울85바8569", "인천81바6079"];   // 단가 5000 / 수수료 1000

    if (groupA.includes(v)) {
      updated[idx].기사단가 = 6000;
      updated[idx].수수료단가 = 1000;
    } else if (groupB.includes(v)) {
      updated[idx].기사단가 = 5000;
      updated[idx].수수료단가 = 1000;
    }

    // 자동 계산
    const qty = Number(updated[idx].수량 || 0);
    const d = Number(updated[idx].기사단가 || 0);
    const f = Number(updated[idx].수수료단가 || 0);

    updated[idx].기사운임 = qty * d;
    updated[idx].수수료 = qty * f;
    updated[idx].청구운임 = updated[idx].기사운임 + updated[idx].수수료;

    return updated;
  });
};

const submitFastRows = async () => {
  for (const row of fastRows) {
    const id = crypto.randomUUID();
    await setDoc(doc(coll, id), {
      id,
      ...row,
      정산완료: false
    });
  }

  alert(`${fastRows.length}건 등록 완료!`);

  // ★★★ 저장 후 입력값 초기화 ★★★
  setFastRows([
    {
      날짜: new Date().toISOString().slice(0, 10),
      거래처명: "",
      톤수: "",
      수량: 1,
      기사단가: 0,
      수수료단가: 0,
      차량번호: "",
      이름: "",
      핸드폰번호: "",
      기사운임: 0,
      수수료: 0,
      청구운임: 0
    }
  ]);

  setFastOpen(false);
};


  // UI
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-3">고정거래처 관리</h2>

      {/* 날짜 필터 */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <label>시작일</label>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <label>종료일</label>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <button
          className="px-3 py-1 bg-gray-300 rounded"
          onClick={() => {
            setStartDate("");
            setEndDate("");
          }}
        >
          날짜 초기화
        </button>

        <button
          onClick={markSettlement}
          className="px-3 py-1 bg-indigo-600 text-white rounded"
        >
          정산완료/미정산 처리
        </button>

        {/* 정산완료만 보기 */}
        <button
          onClick={() => setShowDoneOnly((p) => !p)}
          className={`px-3 py-1 rounded ${
            showDoneOnly ? "bg-green-600 text-white" : "bg-gray-400"
          }`}
        >
          정산완료만 보기
        </button>
      </div>

      {/* 합계 */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
        <div>
          총 청구금액 <b className="text-blue-600">{fmt(totalSale)}</b>원
        </div>

        <div>
          총 기사운임 <b className="text-green-600">{fmt(totalDrv)}</b>원
        </div>

        <div>
          총 수수료 <b className="text-amber-600">{fmt(totalFee)}</b>원
          <span className="ml-3 text-indigo-600 font-bold">
            (실 수수료 {fmt(realFee)}원)
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label>지게차선불비용</label>
          <input
            type="number"
            className="border rounded px-2 py-1 w-24 text-right"
            value={prepaidFee}
            onChange={(e) => setPrepaidFee(Number(e.target.value))}
          />

          <button
            className="px-3 py-1 bg-indigo-600 text-white rounded"
            onClick={() =>
              setAppliedFee(totalFee - Number(prepaidFee || 0))
            }
          >
            적용
          </button>
        </div>
      </div>

      {/* 계산기 */}
      <div className="flex flex-wrap items-end gap-3 mb-5 border p-3 rounded bg-gray-50">
        <div>
          <label className="block text-xs text-gray-600">수량</label>
          <input
            type="number"
            min="1"
            className="border rounded px-2 py-1 w-24 text-right"
            value={calcQty}
            onChange={(e) => setCalcQty(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600">기사 단가</label>
          <input
            type="number"
            className="border rounded px-2 py-1 w-28 text-right"
            value={calcDriver}
            onChange={(e) => setCalcDriver(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600">수수료 단가</label>
          <input
            type="number"
            className="border rounded px-2 py-1 w-28 text-right"
            value={calcFee}
            onChange={(e) => setCalcFee(Number(e.target.value))}
          />
        </div>

        <button
          onClick={handleCalcAdd}
          className="ml-3 px-3 py-2 bg-emerald-600 text-white rounded"
        >
          계산결과 추가
        </button>
      </div>

      {/* 검색 + 버튼 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          placeholder="거래처명 검색..."
          className="border p-2 rounded w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          onClick={() => setEditMode((p) => !p)}
          className={`px-3 py-1 rounded ${
            editMode ? "bg-gray-400" : "bg-blue-500 text-white"
          }`}
        >
          {editMode ? "수정종료" : "수정"}
        </button>

        <button
          onClick={addRow}
          className="px-3 py-1 bg-emerald-600 text-white rounded"
        >
          추가
        </button>
<button
  onClick={() => setFastOpen(true)}
  className="px-3 py-1 bg-orange-600 text-white rounded"
>
  빠른 신규등록   {/* ★★★ 여기 추가 ★★★ */}
</button>
        <button
          onClick={removeSelectedRows}
          className="px-3 py-1 bg-red-500 text-white rounded"
        >
          삭제
        </button>

        {/* 전체 선택 */}
        <button
          onClick={() => {
            if (selected.length === filtered.length) {
              setSelected([]);
            } else {
              setSelected(filtered.map((r) => r.id));
            }
          }}
          className="px-3 py-1 bg-purple-500 text-white rounded"
        >
          전체선택
        </button>

        <button
          onClick={() => {
            const ws = XLSX.utils.json_to_sheet(filtered);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "고정거래처관리");
            XLSX.writeFile(wb, "고정거래처관리.xlsx");
          }}
          className="px-3 py-1 bg-green-600 text-white rounded"
        >
          엑셀다운
        </button>
      </div>
{/* =================== 메인 콘텐츠 2단 레이아웃 =================== */}
<div className="w-full flex flex-col lg:flex-row items-start gap-6 mt-6">

  {/* ================= 왼쪽 테이블 영역 ================= */}
  <div className="flex-1 overflow-x-auto">
    <table className="min-w-[1100px] text-sm border">
      <thead>
        <tr className="bg-gray-100">
          {[
            "선택",
            "정산",
            "날짜",
            "거래처명",
            "톤수",
            "수량",
            "차량번호",
            "이름",
            "핸드폰번호",
            "청구운임",
            "기사운임",
            "수수료",
          ].map((h) => (
            <th key={h} className="border px-2 py-2 text-center">
              {h}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {filtered.map((r, idx) => (
          <tr key={r.id} className={idx % 2 ? "bg-gray-50" : ""}>
            <td className="border px-2 text-center">
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => toggleSelect(r.id)}
              />
            </td>

            <td className="border px-2 text-center">
              {r.정산완료 ? (
                <span className="text-green-700 font-bold">완료</span>
              ) : (
                "-"
              )}
            </td>

            <td className="border px-2 text-center">
              {editMode ? (
                <input
                  type="date"
                  className="border rounded p-1"
                  value={r.날짜}
                  onChange={(e) => updateRow(r.id, { 날짜: e.target.value })}
                  onBlur={() => saveRow(r)}
                />
              ) : (
                r.날짜
              )}
            </td>

            <td className="border px-2 text-center">
              {editMode ? (
                <input
                  value={r.거래처명}
                  onChange={(e) => updateRow(r.id, { 거래처명: e.target.value })}
                  onBlur={() => saveRow(r)}
                  className="border rounded p-1 text-center"
                />
              ) : (
                r.거래처명
              )}
            </td>

            <td className="border px-2 text-center">
              {editMode ? (
                <select
                  value={r.톤수}
                  onChange={(e) => updateRow(r.id, { 톤수: e.target.value })}
                  onBlur={() => saveRow(r)}
                  className="border rounded p-1"
                >
                  <option value="">선택</option>
                  {tonList.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              ) : (
                r.톤수
              )}
            </td>

            <td className="border px-2 text-center">
              {editMode ? (
                <input
                  type="number"
                  className="border rounded p-1 w-20 text-center"
                  value={r.수량}
                  onChange={(e) => updateRow(r.id, { 수량: e.target.value })}
                  onBlur={() => saveRow(r)}
                />
              ) : (
                r.수량
              )}
            </td>

            <td className="border px-2 text-center">
              <input
                type="text"
                className="border rounded p-1 w-28 text-center"
                value={r.차량번호}
                onChange={(e) => updateRow(r.id, { 차량번호: e.target.value })}
                onKeyDown={(e) => handleCarInput(r.id, e.currentTarget.value, e)}
                onBlur={() => saveRow(r)}
              />
            </td>

            <td className="border px-2 text-center">{r.이름}</td>
            <td className="border px-2 text-center">{r.핸드폰번호}</td>

            {["청구운임", "기사운임", "수수료"].map((f) => (
              <td key={f} className="border px-2 text-right">
                {editMode ? (
                  <input
                    type="number"
                    className="border rounded p-1 w-24 text-right"
                    value={r[f]}
                    onChange={(e) =>
                      updateRow(r.id, { [f]: Number(e.target.value) })
                    }
                    onBlur={() => saveRow(r)}
                  />
                ) : (
                  fmt(r[f])
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* ================= 오른쪽 대시보드 ================= */}
  <div className="w-full lg:max-w-[720px] p-4 bg-white rounded-lg shadow-lg border self-start">



    {/* KPI 카드 */}
    <div className="grid grid-cols-2 gap-3 mb-6">
      <KPI title="총 매출" value={fmt(totalSale) + "원"} color="blue" />
      <KPI title="총 기사비" value={fmt(totalDrv) + "원"} color="green" />
      <KPI title="총 수수료" value={fmt(totalFee) + "원"} color="amber" />
      <KPI
        title="수익률"
        value={totalSale ? ((totalFee / totalSale) * 100).toFixed(1) + "%" : "0%"}
        color="purple"
      />
    </div>

    {/* 기사별 TOP5 */}
    <div className="bg-gray-50 rounded-lg border p-4 mb-6">
      <h3 className="text-md font-bold mb-3">기사별 매출 TOP 5</h3>

      {topDrivers.length === 0 && (
        <div className="text-gray-500 text-sm">데이터가 없습니다.</div>
      )}

      <ul className="space-y-2">
        {topDrivers.map((d, idx) => (
          <li
            key={idx}
            className="flex justify-between items-center p-2 bg-white rounded border"
          >
            <span className="font-semibold">{idx + 1}위. {d.name}</span>
            <span className="text-blue-600 font-bold">{fmt(d.total)}원</span>
          </li>
        ))}
      </ul>
    </div>

    {/* 최근 14일 매출 그래프 */}
    <div className="bg-gray-50 rounded-lg border p-4">
      <h3 className="text-md font-bold mb-3">최근 14일 매출 추이</h3>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="매출"
            stroke="#2563eb"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>

  </div>
</div>


      
      <Dialog open={fastOpen} onClose={() => setFastOpen(false)} className="relative z-50">
  <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
  <div className="fixed inset-0 flex items-center justify-center p-4">
    <Dialog.Panel className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl">

      <Dialog.Title className="text-xl font-bold mb-4 flex items-center justify-between">
  빠른 신규등록

  {/* 닫기 버튼 */}
  <button
    onClick={() => setFastOpen(false)}
    className="text-gray-500 hover:text-black px-2 py-1"
  >
    ✕
  </button>
</Dialog.Title>

      {/* 반복 입력 구역 (여러 건 등록 가능) */}
      <div className="max-h-[60vh] overflow-y-auto space-y-4">
        {fastRows.map((row, idx) => (
          <div key={idx} className="border rounded p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold">등록 {idx + 1}건</span>
              {idx > 0 && (
                <button
                  className="text-red-600"
                  onClick={() => removeFastRow(idx)}
                >
                  삭제
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">

              <div>
                <label className="text-xs text-gray-600">날짜</label>
                <input
                  type="date"
                  className="border rounded w-full px-2 py-1"
                  value={row.날짜}
                  onChange={(e) =>
                    updateFastField(idx, "날짜", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">거래처명</label>
                <input
                  className="border rounded w-full px-2 py-1"
                  value={row.거래처명}
                  onChange={(e) =>
                    updateFastField(idx, "거래처명", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">톤수</label>
                <select
                  className="border rounded w-full px-2 py-1"
                  value={row.톤수}
                  onChange={(e) =>
                    updateFastField(idx, "톤수", e.target.value)
                  }
                >
                  <option value="">선택</option>
                  {tonList.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600">수량</label>
                <input
                  type="number"
                  className="border rounded w-full px-2 py-1"
                  value={row.수량}
                  onChange={(e) =>
                    updateFastField(idx, "수량", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">차량번호</label>
                
                <input
  className="border rounded w-full px-2 py-1"
  value={row.차량번호}
  onChange={(e) => updateFastField(idx, "차량번호", e.target.value)}
  onBlur={(e) => matchFastDriver(idx, e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") matchFastDriver(idx, e.target.value);
  }}
/>

              </div>

              <div>
                <label className="text-xs text-gray-600">이름</label>
                <input
                  className="border rounded w-full px-2 py-1 bg-gray-100"
                  value={row.이름}
                  readOnly
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">핸드폰번호</label>
                <input
                  className="border rounded w-full px-2 py-1 bg-gray-100"
                  value={row.핸드폰번호}
                  readOnly
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">기사단가</label>
                <input
                  type="number"
                  className="border rounded w-full px-2 py-1"
                  value={row.기사단가}
                  onChange={(e) =>
                    updateFastField(idx, "기사단가", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">수수료단가</label>
                <input
                  type="number"
                  className="border rounded w-full px-2 py-1"
                  value={row.수수료단가}
                  onChange={(e) =>
                    updateFastField(idx, "수수료단가", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">기사운임</label>
                <input
                  className="border rounded w-full px-2 py-1 bg-gray-100"
                  value={row.기사운임}
                  readOnly
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">수수료</label>
                <input
                  className="border rounded w-full px-2 py-1 bg-gray-100"
                  value={row.수수료}
                  readOnly
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">청구운임</label>
                <input
                  className="border rounded w-full px-2 py-1 bg-gray-100"
                  value={row.청구운임}
                  readOnly
                />
              </div>

            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-4">
        <button
          onClick={addFastRow}
          className="px-3 py-2 bg-blue-600 text-white rounded"
        >
          + 행 추가
        </button>

        <button
          onClick={submitFastRows}
          className="px-3 py-2 bg-emerald-600 text-white rounded"
        >
          저장하기
        </button>
      </div>

    </Dialog.Panel>
  </div>
</Dialog>

    </div>
  );
}
