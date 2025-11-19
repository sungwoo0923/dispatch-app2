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

      {/* 테이블 */}
      <div className="overflow-x-auto">
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
                      onChange={(e) =>
                        updateRow(r.id, { 날짜: e.target.value })
                      }
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
                      onChange={(e) =>
                        updateRow(r.id, { 거래처명: e.target.value })
                      }
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
                      onChange={(e) =>
                        updateRow(r.id, { 톤수: e.target.value })
                      }
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
                      onChange={(e) =>
                        updateRow(r.id, { 수량: e.target.value })
                      }
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
                    onChange={(e) =>
                      updateRow(r.id, { 차량번호: e.target.value })
                    }
                    onKeyDown={(e) =>
                      handleCarInput(r.id, e.currentTarget.value, e)
                    }
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
    </div>
  );
}
