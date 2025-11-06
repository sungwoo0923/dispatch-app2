// ===================== DispatchStatus.jsx — FULL FILE =====================
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { auth } from "./firebase";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
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
   Firestore 경로/참조
--------------------------------------------------*/
const COL = {
  dispatch: collection(db, "dispatch"),
  drivers: collection(db, "drivers"),
  clients: collection(db, "clients"),
};

/* -------------------------------------------------
   숫자 유틸
--------------------------------------------------*/
const toComma = (v) =>
  v === 0 || v
    ? Number(v).toLocaleString() + "원"
    : ""; // 빈 값은 공백

/* -------------------------------------------------
   Firestore 동기화 훅
--------------------------------------------------*/
async function getAllDocs(colRef) {
  const snap = await getDocs(query(colRef));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function upsert(colRef, id, data) {
  await setDoc(
    doc(colRef, id),
    { ...data, _updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* -------------------------------------------------
   실시간 구독 + localStorage 동기화
--------------------------------------------------*/
export function useFirestoreSync() {
  const [dispatchData, setDispatchData] = useState(
    safeLoad("dispatchData", [])
  );
  const [drivers, setDrivers] = useState(safeLoad("drivers", []));
  const [clients, setClients] = useState(safeLoad("clients", []));

  useEffect(() => {
    const unsubs = [
      onSnapshot(COL.dispatch, (snap) => {
        const rows = snap.docs.map((d) => ({ _fsid: d.id, ...d.data() }));
        setDispatchData(rows);
        safeSave("dispatchData", rows);
      }),
      onSnapshot(COL.drivers, (snap) => {
        const rows = snap.docs.map((d) => ({ _fsid: d.id, ...d.data() }));
        setDrivers(rows);
        safeSave("drivers", rows);
      }),
      onSnapshot(COL.clients, (snap) => {
        const rows = snap.docs.map((d) => ({ _fsid: d.id, ...d.data() }));
        setClients(rows);
        safeSave("clients", rows);
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, []);

  return {
    dispatchData,
    setDispatchData,
    drivers,
    setDrivers,
    clients,
    setClients,
  };
}

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
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return dispatchData || [];
    const lower = q.toLowerCase();
    return (dispatchData || []).filter((r) =>
      Object.values(r).some((v) =>
        String(v || "").toLowerCase().includes(lower)
      )
    );
  }, [dispatchData, q]);

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">실시간 배차현황</h2>

      {/* 검색 */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색 (거래처명 / 상차지명 / 차량번호)"
        className="border p-2 rounded w-80 mb-3"
      />

      <div className="overflow-auto max-h-[70vh] border rounded">
        <table className="min-w-[1800px] border-collapse text-sm">
          <thead>
            <tr>
              {[
                "순번",
                "등록일",
                "상차일",
                "하차일",
                "거래처명",
                "상차지명",
                "하차지명",
                "차량톤수",
                "차량종류",
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
              ].map((h) => (
                <th key={h} className={headBase}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r, i) => (
              <tr key={r._fsid || r._id || i}>
                <td className={cellBase}>{i + 1}</td>
                <td className={cellBase}>{r.등록일 || ""}</td>
                <td className={cellBase}>{r.상차일 || ""}</td>
                <td className={cellBase}>{r.하차일 || ""}</td>
                <td className={cellBase}>{r.거래처명 || ""}</td>
                <td className={cellBase}>{r.상차지명 || ""}</td>
                <td className={cellBase}>{r.하차지명 || ""}</td>
                <td className={cellBase}>{r.차량톤수 || ""}</td>
                <td className={cellBase}>{r.차량종류 || ""}</td>
                <td className={cellBase}>{r.차량번호 || ""}</td>
                <td className={cellBase}>{r.이름 || ""}</td>
                <td className={cellBase}>{r.전화번호 || ""}</td>

                {/* 배차상태 */}
                <td className={cellBase}>
                  <StatusBadge s={r.배차상태} />
                </td>

                {/* 금액 필드: 자동 콤마 + 원 + 우측 정렬 */}
                <td className={`${cellBase} text-right`}>
                  {toComma(r.청구운임)}
                </td>
                <td className={`${cellBase} text-right`}>
                  {toComma(r.기사운임)}
                </td>
                <td className={`${cellBase} text-right`}>
                  {toComma(r.수수료)}
                </td>

                {/* 지급/배차 방식 */}
                <td className={cellBase}>{r.지급방식 || ""}</td>
                <td className={cellBase}>{r.배차방식 || ""}</td>

                {/* 메모 */}
                <td className={cellBase}>{r.메모 || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
