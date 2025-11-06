// ===================== DispatchStatus.jsx — FULL FILE (교체본) =====================
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
} from "firebase/firestore";

/* -------------------------------------------------
   안전 저장/로드 유틸
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
   공통 스타일 (테이블 head/셀)
--------------------------------------------------*/
export const headBase =
  "px-3 py-2 border text-xs bg-gray-50 text-gray-600 font-semibold whitespace-nowrap";
export const cellBase =
  "px-3 py-2 border text-sm text-gray-700 whitespace-nowrap";

/* -------------------------------------------------
   상태 배지 (배차상태)
--------------------------------------------------*/
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

/* -------------------------------------------------
   숫자 유틸
--------------------------------------------------*/
const onlyNum = (v) =>
  Number.parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
const toComma = (n) =>
  n === 0 || n ? Number(n).toLocaleString() : "";
const toWon = (n) =>
  n === 0 || n ? Number(n).toLocaleString() + "원" : "";

/* -------------------------------------------------
   Firestore 경로
--------------------------------------------------*/
const COL = {
  dispatch: collection(db, "dispatch"),
  drivers: collection(db, "drivers"),
  clients: collection(db, "clients"),
};

/* -------------------------------------------------
   메인 컴포넌트
--------------------------------------------------*/
export default function DispatchStatus({
  dispatchData,
  setDispatchData,
  drivers,
  timeOptions,
  tonOptions,
}) {
  // 🔸 상단 제어
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체"); // 전체 | 배차중 | 배차완료
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 🔸 선택/수정 모드
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // 선택삭제용
  const [localRows, setLocalRows] = useState([]);

  // 🔸 dispatchData → localRows 동기화 (수정모드 아닐 때만 따라가게)
  useEffect(() => {
    if (!editMode) {
      setLocalRows(structuredClone(dispatchData || []));
    }
  }, [dispatchData, editMode]);

  // 🔸 필터 + 정렬
  const filtered = useMemo(() => {
    let rows = Array.isArray(editMode ? localRows : dispatchData)
      ? [...(editMode ? localRows : dispatchData)]
      : [];

    // 날짜 범위 (상차일 기준)
    if (startDate) rows = rows.filter((r) => (r.상차일 || "") >= startDate);
    if (endDate) rows = rows.filter((r) => (r.상차일 || "") <= endDate);

    // 상태 필터
    if (statusFilter !== "전체") {
      rows = rows.filter((r) => (r.배차상태 || "") === statusFilter);
    }

    // 텍스트 검색 (모든 값)
    if (q.trim()) {
      const lower = q.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(lower)
        )
      );
    }

    // 정렬: 1) 상차일 오름차순 2) 같은 날짜면 배차중 → 배차완료
    const priority = (s) => ((s || "") === "배차중" ? 0 : 1);
    rows.sort((a, b) => {
      const d1 = a.상차일 || "";
      const d2 = b.상차일 || "";
      if (d1 !== d2) return d1.localeCompare(d2);
      return priority(a.배차상태) - priority(b.배차상태);
    });

    return rows;
  }, [dispatchData, localRows, q, startDate, endDate, statusFilter, editMode]);

  // 🔸 합계 (필터 반영)
  const totals = useMemo(() => {
    const sale = filtered.reduce((s, r) => s + onlyNum(r.청구운임), 0);
    const drv = filtered.reduce((s, r) => s + onlyNum(r.기사운임), 0);
    const fee = sale - drv;
    return { sale, drv, fee };
  }, [filtered]);

  // 🔸 헤더/필드 정의
  const columns = [
    { key: "_select", label: "" }, // 체크박스
    { key: "순번", label: "순번" },
    { key: "등록일", label: "등록일", type: "date" },
    { key: "상차일", label: "상차일", type: "date" },
    { key: "상차시간", label: "상차시간", type: "time" }, // 추가
    { key: "하차일", label: "하차일", type: "date" },
    { key: "하차시간", label: "하차시간", type: "time" }, // 추가
    { key: "거래처명", label: "거래처명", type: "text" },
    { key: "상차지명", label: "상차지명", type: "text" },
    { key: "하차지명", label: "하차지명", type: "text" },
    { key: "차량톤수", label: "차량톤수", type: "text" },
    { key: "차량종류", label: "차량종류", type: "text" },
    { key: "차량번호", label: "차량번호", type: "text" },
    { key: "이름", label: "이름", type: "text" },
    { key: "전화번호", label: "전화번호", type: "text" },
    { key: "배차상태", label: "배차상태", type: "select", options: ["배차중", "배차완료"] },
    { key: "청구운임", label: "청구운임", type: "number" },
    { key: "기사운임", label: "기사운임", type: "number" },
    { key: "수수료", label: "수수료", type: "calc" }, // (청구 - 기사) 자동
    { key: "지급방식", label: "지급방식", type: "text" },
    { key: "배차방식", label: "배차방식", type: "text" },
    { key: "메모", label: "메모", type: "text" },
  ];

  // 🔸 행 식별자
  const getId = (r) => r._fsid || r._id;

  // 🔸 선택 토글
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const isCheckedAll = filtered.length > 0 && filtered.every((r) => selected.has(getId(r)));
  const toggleSelectAll = () => {
    if (isCheckedAll) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => getId(r)).filter(Boolean)));
    }
  };

  // 🔸 수정 핸들러
  const handleEditChange = (id, key, value) => {
    setLocalRows((rows) =>
      rows.map((r) => {
        const rid = getId(r);
        if (rid !== id) return r;
        const draft = { ...r };

        if (key === "청구운임" || key === "기사운임") {
          // 숫자 입력
          draft[key] = onlyNum(value);
          draft["수수료"] = onlyNum(draft.청구운임) - onlyNum(draft.기사운임);
        } else if (key === "수수료") {
          // 수동 수정 허용 안함(계산필드) → 무시
          return draft;
        } else {
          draft[key] = value;
        }
        return draft;
      })
    );
  };

  // 🔸 엑셀 다운로드 (필터 반영, 현재 표준 컬럼)
  const downloadExcel = () => {
    if (!filtered.length) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }
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
      차량톤수: r.차량톤수 || "",
      차량종류: r.차량종류 || "",
      차량번호: r.차량번호 || "",
      이름: r.이름 || "",
      전화번호: r.전화번호 || "",
      배차상태: r.배차상태 || "",
      청구운임: onlyNum(r.청구운임),
      기사운임: onlyNum(r.기사운임),
      수수료: onlyNum(r.청구운임) - onlyNum(r.기사운임),
      지급방식: r.지급방식 || "",
      배차방식: r.배차방식 || "",
      메모: r.메모 || "",
      _id: getId(r) || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "실시간배차현황");
    const fn = `실시간배차현황_${startDate || "all"}~${endDate || "all"}.xlsx`;
    XLSX.writeFile(wb, fn);
  };

  // 🔸 선택 삭제 (Firestore 완전 삭제)
  const deleteSelected = async () => {
    const ids = Array.from(selected).filter(Boolean);
    if (!ids.length) return alert("삭제할 항목을 선택하세요.");
    if (!confirm(`선택된 ${ids.length}건을 삭제하시겠습니까?`)) return;

    try {
      const batch = writeBatch(db);
      ids.forEach((id) => batch.delete(doc(db, "dispatch", id)));
      await batch.commit();

      // 로컬에서도 즉시 반영
      setDispatchData((prev) => (prev || []).filter((r) => !ids.includes(getId(r))));
      setLocalRows((prev) => (prev || []).filter((r) => !ids.includes(getId(r))));
      setSelected(new Set());
      alert("삭제되었습니다.");
    } catch (e) {
      console.error(e);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // 🔸 전체 수정 모드 토글
  const enterEdit = () => {
    setLocalRows(structuredClone(filtered.length ? filtered : dispatchData || []));
    setEditMode(true);
  };
  const cancelEdit = () => {
    setEditMode(false);
    setLocalRows(structuredClone(dispatchData || []));
  };

  // 🔸 일괄 저장
  const saveAll = async () => {
    if (!editMode) return;

    // 변경된 행만 추려 저장
    const mapOrig = new Map((dispatchData || []).map((r) => [getId(r), r]));
    const changed = (localRows || []).filter((r) => {
      const id = getId(r);
      const o = mapOrig.get(id) || {};
      return JSON.stringify(o) !== JSON.stringify(r);
    });

    if (!changed.length) {
      alert("변경된 내용이 없습니다.");
      setEditMode(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      changed.forEach((r) => {
        const id = getId(r);
        // 숫자 필드 정규화
        const patch = {
          ...r,
          청구운임: onlyNum(r.청구운임),
          기사운임: onlyNum(r.기사운임),
          수수료: onlyNum(r.청구운임) - onlyNum(r.기사운임),
          _updatedAt: serverTimestamp(),
        };
        batch.set(doc(db, "dispatch", id), patch, { merge: true });
      });
      await batch.commit();
      alert(`저장 완료 (${changed.length}건)`);

      setEditMode(false);
      // 저장 후에는 onSnapshot으로 실시간 반영되지만, 즉시 감지 용도로 로컬도 업데이트
      setDispatchData((prev) =>
        (prev || []).map((r) => {
          const hit = changed.find((c) => getId(c) === getId(r));
          return hit ? { ...r, ...hit } : r;
        })
      );
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  // 🔸 입력 렌더
  const renderCell = (row, key, idx) => {
    const id = getId(row);

    if (!editMode) {
      // 보기 모드
      if (key === "_select") {
        const checked = selected.has(id);
        return (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleSelect(id)}
          />
        );
      }
      if (key === "순번") return idx + 1;
      if (key === "배차상태") return <StatusBadge s={row[key]} />;
      if (key === "청구운임") return <div className="text-right">{toWon(row[key])}</div>;
      if (key === "기사운임") return <div className="text-right">{toWon(row[key])}</div>;
      if (key === "수수료")
        return (
          <div className="text-right text-blue-700 font-semibold">
            {toWon(onlyNum(row.청구운임) - onlyNum(row.기사운임))}
          </div>
        );
      return row[key] ?? "";
    }

    // 수정 모드
    if (key === "_select") {
      const checked = selected.has(id);
      return (
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleSelect(id)}
        />
      );
    }
    if (key === "순번") return idx + 1;

    const col = columns.find((c) => c.key === key);
    if (!col) return row[key] ?? "";

    // 수수료는 계산필드 → 읽기전용 표시
    if (col.type === "calc") {
      const fee = onlyNum(row.청구운임) - onlyNum(row.기사운임);
      return (
        <input
          className="border rounded px-2 py-1 w-28 text-right bg-gray-100"
          value={toComma(fee)}
          readOnly
        />
      );
    }

    if (col.type === "select") {
      return (
        <select
          className="border rounded px-2 py-1"
          value={row[key] || ""}
          onChange={(e) => handleEditChange(id, key, e.target.value)}
        >
          <option value="">선택</option>
          {col.options.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === "number") {
      return (
        <input
          type="text"
          className="border rounded px-2 py-1 w-28 text-right"
          value={toComma(row[key])}
          onChange={(e) => handleEditChange(id, key, e.target.value)}
        />
      );
    }

    // date/time/text
    const inputType =
      col.type === "date" ? "date" : col.type === "time" ? "time" : "text";
    const widthClass =
      col.type === "date" || col.type === "time" ? "w-36" : "w-40";
    return (
      <input
        type={inputType}
        className={`border rounded px-2 py-1 ${widthClass}`}
        value={row[key] || ""}
        onChange={(e) => handleEditChange(id, key, e.target.value)}
      />
    );
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">실시간 배차현황</h2>

      {/* 🔎 필터 바 */}
      <div className="flex flex-wrap items-end gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색 (거래처명 / 상차지명 / 차량번호)"
          className="border p-2 rounded w-80"
        />

        <div className="flex items-center gap-1 text-sm">
          <label className="text-xs text-gray-500">상차일</label>
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

        <div>
          <select
            className="border p-2 rounded"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="전체">전체</option>
            <option value="배차중">배차중</option>
            <option value="배차완료">배차완료</option>
          </select>
        </div>

        <button
          onClick={() => {
            setQ("");
            setStartDate("");
            setEndDate("");
            setStatusFilter("전체");
          }}
          className="px-3 py-2 rounded bg-gray-200"
        >
          필터 초기화
        </button>

        <button
          onClick={downloadExcel}
          className="ml-auto px-3 py-2 rounded bg-blue-600 text-white"
        >
          📥 엑셀 다운로드
        </button>
      </div>

      {/* 🔢 합계 + 상단 액션 (총 수수료 옆) */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-sm">
          총 청구: <b>{toWon(totals.sale)}</b>
        </span>
        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-sm">
          총 기사: <b>{toWon(totals.drv)}</b>
        </span>
        <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-sm">
          총 수수료: <b>{toWon(totals.fee)}</b>
        </span>

        {/* 👉 버튼을 총 수수료 옆에 배치 */}
        {!editMode ? (
          <>
            <button
              onClick={enterEdit}
              className="ml-2 px-3 py-2 rounded bg-blue-600 text-white"
            >
              🔧 수정
            </button>
            <button
              onClick={deleteSelected}
              className="px-3 py-2 rounded bg-rose-600 text-white"
            >
              🗑️ 선택삭제
            </button>
          </>
        ) : (
          <>
            <button
              onClick={saveAll}
              className="ml-2 px-3 py-2 rounded bg-blue-600 text-white"
            >
              💾 저장
            </button>
            <button
              onClick={deleteSelected}
              className="px-3 py-2 rounded bg-rose-600 text-white"
            >
              🗑️ 선택삭제
            </button>
            <button
              onClick={cancelEdit}
              className="px-3 py-2 rounded border"
            >
              취소
            </button>
          </>
        )}
      </div>

      {/* 📋 테이블 */}
      <div className="overflow-auto max-h-[70vh] border rounded">
        <table className="min-w-[2000px] border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={headBase}>
                  {c.key === "_select" ? (
                    <input
                      type="checkbox"
                      checked={isCheckedAll}
                      onChange={toggleSelectAll}
                      title="현재 목록 전체 선택/해제"
                    />
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="text-center text-gray-500 py-6" colSpan={columns.length}>
                  조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={getId(r) || i} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                  {columns.map((c) => (
                    <td key={c.key} className={cellBase}>
                      {renderCell(r, c.key, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
