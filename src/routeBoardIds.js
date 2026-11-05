// src/routeBoardIds.js — 이 회사의 배차표(고정노선 구글시트) 양식 id 목록
// ⭐ 2026-11-05 PC·모바일 일치 — FixedRouteStatus.jsx에서 꺼내 작은 파일로(모바일 메뉴 숫자가 무거운 화면 파일을 미리 받지 않게)
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

// 🔒 2026-11-03 운송사 분리 — 배지·목록은 이 회사 양식의 오더만
export function useRouteBoardIds(company) {
  const [ids, setIds] = React.useState(() => new Set());
  React.useEffect(() => {
    if (!company) { setIds(new Set()); return undefined; }
    return onSnapshot(query(collection(db, "routeBoards"), where("companyName", "==", company)), (s) => setIds(new Set(s.docs.map((d) => d.id))), () => setIds(new Set()));
  }, [company]);
  return ids;
}
