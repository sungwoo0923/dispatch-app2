// ===================== DispatchStatus.jsx — FULL FIXED VERSION =====================
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

export const headBase =
  "px-3 py-2 border text-xs bg-gray-50 text-gray-600 font-semibold whitespace-nowrap";
export const cellBase =
  "px-3 py-2 border text-sm text-gray-700 whitespace-nowrap";

export function StatusBadge({ s }) {
  const label = s || "미정";
  const tone =
    label === "배차완료"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : label === "배차중"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-block rounded px-2 py-1 text-xs border ${tone}`}>
      {label}
    </span>
  );
}

const onlyNum = (v) =>
  Number.parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
const toWon = (n) =>
  n === 0 || n ? Number(n).toLocaleString() + "원" : "";

export default function DispatchStatus({
  dispatchData = [],
  drivers = [],
  timeOptions = [],
  tonOptions = [],
  patchDispatch,
  removeDispatch,
}) {
// 🔥 오늘 날짜(YYYY-MM-DD)
const today = new Date().toISOString().slice(0, 10);

// 🔸 상단 제어
const [q, setQ] = useState("");
const [statusFilter, setStatusFilter] = useState("전체");
const [startDate, setStartDate] = useState(today);
const [endDate, setEndDate] = useState(today);

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [localRows, setLocalRows] = useState([]);

  const getId = (r) => r._id || r.id || r._editId;

  useEffect(() => {
    if (!editMode) setLocalRows(structuredClone(dispatchData || []));
  }, [dispatchData, editMode]);
  // 🔥 메뉴 재진입 시 날짜 필터 항상 오늘로 리셋
useEffect(() => {
  setStartDate(today);
  setEndDate(today);
}, []);

  const filtered = useMemo(() => {
    let rows = [...(editMode ? localRows : dispatchData)];

// === 날짜 비교용 (상차일 없으면 등록일 사용) ===
const getPickupDate = (o = {}) => {
  if (o.상차일) return String(o.상차일).slice(0, 10);
  if (o.상차일시) return String(o.상차일시).slice(0, 10);
  if (o.등록일) return String(o.등록일).slice(0, 10);
  return "";
};

// 🔥 기존 상차일 기준 필터 → getPickupDate 기준으로 변경
if (startDate) rows = rows.filter((r) => getPickupDate(r) >= startDate);
if (endDate) rows = rows.filter((r) => getPickupDate(r) <= endDate);


    if (statusFilter !== "전체")
      rows = rows.filter((r) => (r.배차상태 || "") === statusFilter);

    if (q.trim()) {
      const lower = q.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(lower)
        )
      );
    }

    // 🔥 getPickupDate 기준으로 정렬 (등록일/상차일 없을 때도 OK)
const getPickupDate = (o = {}) =>
  (o.상차일 && String(o.상차일).slice(0, 10)) ||
  (o.상차일시 && String(o.상차일시).slice(0, 10)) ||
  (o.등록일 && String(o.등록일).slice(0, 10)) ||
  "";

rows.sort((a, b) => {
  const d1 = getPickupDate(a);
  const d2 = getPickupDate(b);
  if (d1 !== d2) return d1.localeCompare(d2);
  const st = (s) => ((s || "") === "배차중" ? 0 : 1);
  return st(a.배차상태) - st(b.배차상태);
});


    return rows;
  }, [dispatchData, localRows, q, startDate, endDate, statusFilter, editMode]);

  const totals = useMemo(() => {
    const sale = filtered.reduce((s, r) => s + onlyNum(r.청구운임), 0);
    const drv = filtered.reduce((s, r) => s + onlyNum(r.기사운임), 0);
    return {
      sale,
      drv,
      fee: sale - drv,
    };
  }, [filtered]);

  const columns = [
    { key: "_select", label: "" },
    { key: "등록일", label: "등록일", type: "date" },
    { key: "상차일", label: "상차일", type: "date" },
    { key: "하차일", label: "하차일", type: "date" },
    { key: "거래처명", label: "거래처명", type: "text" },
    { key: "상차지명", label: "상차지명", type: "text" },
    { key: "하차지명", label: "하차지명", type: "text" },
    { key: "차량번호", label: "차량번호", type: "text" },
    { key: "배차상태", label: "배차상태", type: "select", options: ["배차중", "배차완료"] },
    { key: "청구운임", label: "청구운임", type: "number" },
    { key: "기사운임", label: "기사운임", type: "number" },
    { key: "수수료", label: "수수료", type: "calc" },
    { key: "메모", label: "메모", type: "text" },
  ];

  const handleEditChange = (id, key, value) => {
    setLocalRows((rows) =>
      rows.map((r) => {
        if (getId(r) !== id) return r;
        const draft = { ...r };

        if (key === "청구운임" || key === "기사운임") {
          draft[key] = onlyNum(value);
          draft["수수료"] = onlyNum(draft.청구운임) - onlyNum(draft.기사운임);
        } else if (key === "수수료") {
          return draft;
        } else {
          draft[key] = value;
        }
        return draft;
      })
    );
  };

  const enterEdit = () => {
    setLocalRows(structuredClone(filtered));
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setLocalRows(structuredClone(dispatchData));
  };

  // 🔥 Firestore 저장 로직 복구!!! (핵심)
  const saveAll = async () => {
    const changed = localRows.filter((r) => {
      const orig = dispatchData.find((o) => getId(o) === getId(r)) || {};
      return JSON.stringify(orig) !== JSON.stringify(r);
    });

    if (!changed.length) {
      alert("변경된 내용 없음");
      return setEditMode(false);
    }

    try {
      for (const r of changed) {
        const id = getId(r);
        const patch = {
          ...r,
          청구운임: onlyNum(r.청구운임),
          기사운임: onlyNum(r.기사운임),
          수수료: onlyNum(r.청구운임) - onlyNum(r.기사운임),
          _updatedAt: serverTimestamp(),
        };
        await patchDispatch(id, patch); // 🔥 DB 저장
      }

      alert("저장 완료!");
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert("저장 오류");
    }
  };

  const renderCell = (row, key, idx) => {
    const id = getId(row);

    if (!editMode) {
      if (key === "배차상태") return <StatusBadge s={row[key]} />;
      if (key === "_select")
        return (
          <input
            type="checkbox"
            checked={selected.has(id)}
            onChange={() =>
              setSelected((s) => {
                const n = new Set(s);
                n.has(id) ? n.delete(id) : n.add(id);
                return n;
              })
            }
          />
        );
      if (key === "청구운임" || key === "기사운임")
        return <div className="text-right">{toWon(row[key])}</div>;
      if (key === "수수료")
        return (
          <div className="text-right text-blue-700 font-semibold">
            {toWon(onlyNum(row.청구운임) - onlyNum(row.기사운임))}
          </div>
        );
      return row[key] ?? "";
    }

    const col = columns.find((c) => c.key === key);
    if (!col) return row[key] ?? "";

    if (key === "_select")
      return (
        <input
          type="checkbox"
          checked={selected.has(id)}
          onChange={() =>
            setSelected((s) => {
              const n = new Set(s);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            })
          }
        />
      );

    if (col.type === "calc")
      return (
        <input
          readOnly
          className="bg-gray-100 border rounded px-2 py-1 w-24"
          value={toWon(onlyNum(row.청구운임) - onlyNum(row.기사운임))}
        />
      );

    if (col.type === "select")
      return (
        <select
          className="border rounded px-2 py-1"
          value={row[key] || ""}
          onChange={(e) => handleEditChange(id, key, e.target.value)}
        >
          <option value="">선택</option>
          {col.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );

    const type =
      col.type === "date" ? "date" : col.type === "number" ? "text" : "text";

    return (
      <input
        type={type}
        className="border rounded px-2 py-1 w-32"
        value={row[key] || ""}
        onChange={(e) => handleEditChange(id, key, e.target.value)}
      />
    );
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-3">실시간 배차현황</h2>

      <div className="flex gap-2 mb-2">
        <input
          placeholder="검색"
          className="border p-2 rounded w-64"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          type="date"
          className="border p-2 rounded"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          type="date"
          className="border p-2 rounded"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <select
          className="border p-2 rounded"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="전체">전체</option>
          <option value="배차중">배차중</option>
          <option value="배차완료">배차완료</option>
        </select>

        {!editMode ? (
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded"
            onClick={enterEdit}
          >
            수정
          </button>
        ) : (
          <button
            className="bg-green-600 text-white px-3 py-2 rounded"
            onClick={saveAll}
          >
            저장
          </button>
        )}
        {editMode && (
          <button
            className="bg-gray-400 text-white px-3 py-2 rounded"
            onClick={cancelEdit}
          >
            취소
          </button>
        )}
      </div>

      <div className="mb-2">
        총 청구: {toWon(totals.sale)} / 총 기사: {toWon(totals.drv)} / 총 수수료:
        {toWon(totals.fee)}
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-[1600px] border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={headBase}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr
                key={getId(r)}
                className={i % 2 ? "bg-gray-50" : "bg-white"}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cellBase}>
                    {renderCell(r, c.key, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
