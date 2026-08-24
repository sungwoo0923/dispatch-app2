// src/adminPlannerData.js
// ⭐ KP-Planner("나의 플래너") — 배차/오더 등 다른 어떤 화면·데이터와도 전혀
// 연관되지 않는 완전히 독립된 Firestore 컬렉션(adminPlanner)을 쓴다.
// PC(AdminPlanner.jsx)와 모바일(mobile/AdminPlannerMobile.jsx)이 이 모듈을
// 함께 사용해 동일한 데이터를 실시간으로 공유한다.
// ⚠️ 아래 함수들이 받는 companyName 파라미터/Firestore 필드는 이름만 그대로일 뿐,
// 실제로는 회사명이 아니라 planner/plannerAuth.js가 발급하는 "가족 코드"
// (groupId)가 들어온다 — 이 격리 키를 기준으로 데이터가 나뉜다.
import { useEffect, useState } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { plannerDb as db } from "./planner/plannerFirebase";

export const PLANNER_COLLECTION = "adminPlanner";

// entry.type: "income" | "expense" | "schedule" | "familyBudget" | "budgetTarget"
export const PLANNER_TYPE_LABEL = {
  income: "수입",
  expense: "지출",
  schedule: "일정",
  familyBudget: "가족/명절 예산",
  budgetTarget: "연간 총예산 목표",
};

export function usePlannerEntries(companyName) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!companyName) {
      setEntries([]);
      setLoaded(true);
      return;
    }
    const q = query(collection(db, PLANNER_COLLECTION), where("companyName", "==", companyName));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    return () => unsub();
  }, [companyName]);

  return { entries, loaded };
}

export async function addPlannerEntry(data) {
  return addDoc(collection(db, PLANNER_COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updatePlannerEntry(id, patch) {
  return updateDoc(doc(db, PLANNER_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deletePlannerEntry(id) {
  return deleteDoc(doc(db, PLANNER_COLLECTION, id));
}

// 연간 총예산 목표 — 연도당 budgetTarget 타입 문서 1개(없으면 새로 만들고, 있으면 갱신).
export async function upsertBudgetTarget({ companyName, year, amount, entries, actorName }) {
  const existing = (entries || []).find((e) => e.type === "budgetTarget" && String(e.year) === String(year));
  if (existing) {
    await updatePlannerEntry(existing.id, { amount: Number(amount) || 0, updatedByName: actorName || "" });
  } else {
    await addPlannerEntry({
      type: "budgetTarget",
      companyName,
      year: Number(year),
      amount: Number(amount) || 0,
      createdByName: actorName || "",
    });
  }
}

export function fmtWon(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString("ko-KR")}원`;
}

export function todayStr() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
