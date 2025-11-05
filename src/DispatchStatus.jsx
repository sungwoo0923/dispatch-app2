// ===================== DispatchApp.jsx (PART 1/8 — 공통 import/유틸/동기화 베이스) — START =====================
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
   - 컬렉션명 고정: dispatch / drivers / clients
--------------------------------------------------*/
const COL = {
  dispatch: collection(db, "dispatch"),
  drivers: collection(db, "drivers"),
  clients: collection(db, "clients"),
};

/* -------------------------------------------------
   Firestore 헬퍼
--------------------------------------------------*/
async function getAllDocs(colRef) {
  const snap = await getDocs(query(colRef));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function upsert(colRef, id, data) {
  await setDoc(doc(colRef, id), { ...data, _updatedAt: serverTimestamp() }, { merge: true });
}

/* -------------------------------------------------
   1회 마이그레이션: localStorage → Firestore
   - Firestore가 비어 있고, 로컬에 데이터가 있으면 올려줌
   - 중복 최소화를 위해 _id(또는 조합키)로 문서ID 사용
--------------------------------------------------*/
async function migrateLocalToFirestoreIfEmpty() {
  // 1) Firestore 비어있는지 확인
  const [dRows, vRows, cRows] = await Promise.all([
    getAllDocs(COL.dispatch),
    getAllDocs(COL.drivers),
    getAllDocs(COL.clients),
  ]);
  const fsEmpty = dRows.length + vRows.length + cRows.length === 0;

  // 2) 비어있지 않으면 종료
  if (!fsEmpty) return;

  // 3) 로컬 데이터 읽기
  const localDispatch = safeLoad("dispatchData", []);
  const localDrivers = safeLoad("drivers", []);
  const localClients = safeLoad("clients", []);

  // 4) 아무것도 없으면 종료
  if (
    (!localDispatch || localDispatch.length === 0) &&
    (!localDrivers || localDrivers.length === 0) &&
    (!localClients || localClients.length === 0)
  ) {
    return;
  }

  // 5) 업로드
  const tasks = [];

  (localDispatch || []).forEach((r) => {
    const id = String(r._id || `${r.상차일 || ""}-${r.거래처명 || ""}-${r.차량번호 || ""}-${Math.random().toString(36).slice(2, 8)}`);
    tasks.push(upsert(COL.dispatch, id, r));
  });

  (localDrivers || []).forEach((r) => {
    const id = String(r.차량번호 || r.id || Math.random().toString(36).slice(2, 10));
    tasks.push(upsert(COL.drivers, id, r));
  });

  (localClients || []).forEach((r) => {
    const id = String(r.거래처명 || r.id || Math.random().toString(36).slice(2, 10));
    tasks.push(upsert(COL.clients, id, r));
  });

  await Promise.all(tasks);
  // 업로드 성공 후, 로컬은 백업용으로 유지(삭제 안 함)
  console.info("✅ Local → Firestore 마이그레이션 완료");
}

/* -------------------------------------------------
   실시간 동기화 훅
   - Firestore <-> 상태 <-> localStorage
   - 로그인 여부와 무관하게 읽기 전용 동작(보안규칙은 콘솔에서 관리)
--------------------------------------------------*/
export function useFirestoreSync() {
  const [dispatchData, setDispatchData] = useState(safeLoad("dispatchData", []));
  const [drivers, setDrivers] = useState(safeLoad("drivers", []));
  const [clients, setClients] = useState(safeLoad("clients", []));

  // 최초 1회: 로컬 → Firestore (비어있을 때만)
  useEffect(() => {
    migrateLocalToFirestoreIfEmpty().catch(console.error);
  }, []);

  // 실시간 구독
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

  // 쓰기용 헬퍼(배차/기사/거래처)
  const saveDispatch = async (row) => {
    const id = String(row._fsid || row._id || `${row.상차일 || ""}-${row.거래처명 || ""}-${row.차량번호 || ""}-${Math.random().toString(36).slice(2, 6)}`);
    await upsert(COL.dispatch, id, row);
  };
  const saveDriver = async (row) => {
    const id = String(row._fsid || row.차량번호 || row.id || Math.random().toString(36).slice(2, 8));
    await upsert(COL.drivers, id, row);
  };
  const saveClient = async (row) => {
    const id = String(row._fsid || row.거래처명 || row.id || Math.random().toString(36).slice(2, 8));
    await upsert(COL.clients, id, row);
  };

  return {
    dispatchData,
    setDispatchData, // 로컬 편집용 (실제 저장은 saveDispatch 사용 권장)
    drivers,
    setDrivers,
    clients,
    setClients,
    saveDispatch,
    saveDriver,
    saveClient,
  };
}

/* -------------------------------------------------
   날짜 유틸(공용)
--------------------------------------------------*/
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const toInt = (v) => {
  const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
};

// 이후 PART 2/8부터 실제 앱(로그인/레이아웃/메뉴) 구현이 이어집니다.
// ===================== DispatchApp.jsx (PART 1/8) — END =====================
