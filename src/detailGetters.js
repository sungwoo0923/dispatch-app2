// src/detailGetters.js — 세부검색(배차담당자·청구사업자) 값 꺼내기 · 등록 직원 이름
// ⭐ 2026-11-05 PC·모바일 일치 — DispatchApp.jsx 안에만 있던 것을 작은 파일로 꺼내 모바일 세부검색도 PC와 같은 값으로 거른다
//   (모바일은 이 파일만 받는다 — PC 배차 프로그램 묶음을 미리 받지 않게)
import React from "react";
import { isMasterKey } from "./monthCompare";
import { useCompanyBiz, bizOf } from "./companyBiz";
import { getTenant } from "./fsTenant";
import { subscribeUsersLive } from "./usersLive";

export const ORDER_MGR_EMPTY = "미지정";
export const ORDER_MGR_FIXED = "고정노선";
// ⭐ 2026-11-03 등록할 때만 쓰이는 칸(createdBy…)을 먼저 — 작성자 칸은 예전 수정 기능이 "고친 사람"으로 덮어쓴 오더가 있어서 뒤로
const ORDER_CREATOR_KEYS = ["createdByEmail", "createdByUid", "createdBy", "작성자", "등록자", "등록자명", "createdByName", "등록자이메일", "authorEmail", "author"];
export const orderStaffNameRaw = (r, nameMap) => {
  if (!r) return "";
  if (String(r.등록기기 || "").trim() === ORDER_MGR_FIXED || String(r.배차확정자 || "").trim() === ORDER_MGR_FIXED || r.source === "fixedRoute") return ORDER_MGR_FIXED;
  // ⭐ 2026-11-03 등록자 이름 칸이 실제 직원 이름이면 그게 우선(매출관리 담당자와 같은 기준)
  const nm0 = String(r.등록자명 || r.createdByName || "").trim();
  if (nm0 && !nm0.includes("@") && nm0 !== "최고관리자" && !isMasterKey(nm0) && nameMap && [...nameMap.values()].includes(nm0)) return nm0;
  // ⭐ 2026-11-03 칸 순서대로 처음 사람이 확인되는 칸이 이긴다(작성자 → …)
  for (const k of ORDER_CREATOR_KEYS) {
    const s = String(r[k] || "").trim();
    if (!s) continue;
    const n = nameMap?.get(s) || nameMap?.get(s.toLowerCase());
    if (n) return n;
    if (isMasterKey(s)) return "최고관리자"; // 계정명 대신
  }
  // 직원 목록에 없어도 이름으로 적혀 있으면(이메일·아이디가 아니면) 그대로
  const nm = String(r.등록자명 || r.createdByName || "").trim();
  return nm && !nm.includes("@") && !/^[A-Za-z0-9]{20,}$/.test(nm) ? nm : "";
};
// 🔎 2026-11-03 세부검색 — 배차담당자(등록한 직원 이름)·청구사업자 칸 값 꺼내기
export function useDetailGetters(userNameMap, company) {
  const biz = useCompanyBiz(getTenant() || company);
  return React.useMemo(() => ({
    배차담당자: (r) => orderStaffNameRaw(r, userNameMap) || ORDER_MGR_EMPTY,
    청구사업자: biz.multi ? (r) => bizOf(r, biz.defaultName) : null,
  }), [userNameMap, biz.multi, biz.defaultName]);
}
// 직원 uid/이메일 → 이름 (PC DispatchApp의 userNameMap과 같은 방식 · 앱 공용 users 구독)
export function useUserNameMap() {
  const [map, setMap] = React.useState(() => new Map());
  React.useEffect(() => subscribeUsersLive((_list, raw) => {
    const m = new Map();
    raw.forEach(({ id, data }) => {
      const name = (data.name || "").trim();
      if (!name) return;
      m.set(id, name);
      if (data.email) m.set(String(data.email).trim().toLowerCase(), name);
    });
    setMap(m);
  }), []);
  return map;
}
// 모바일용 — 이름 목록 구독 + 세부검색 값 꺼내기를 한 번에
export function useMobileDetailGetters(company) {
  const nameMap = useUserNameMap();
  return useDetailGetters(nameMap, company);
}
