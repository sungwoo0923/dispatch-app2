import React from "react";
import { db } from "./firebase";
import { collection, onSnapshot, setDoc, deleteDoc, doc } from "firebase/firestore";

const COLL = "customRoles";

// 최고관리자가 커스텀 권한(역할)을 만들 때 접근 범위를 설정할 수 있는 메뉴 목록.
// 관리자메뉴/관리센터는 권한 관리 자체를 다루는 화면이라 커스텀 권한에는 항상 제외한다
// (커스텀 권한이 스스로 권한을 더 부여하는 상황을 막기 위함).
export const CUSTOMIZABLE_MENUS = [
  "HOME", "배차관리", "실시간배차현황", "배차현황", "단가표", "운임조회",
  "기사관리", "거래처관리", "지입차관리", "매출관리", "정산관리", "회사관리",
];

export function defaultMenuAccess() {
  const m = {};
  CUSTOMIZABLE_MENUS.forEach((k, i) => { m[k] = i === 0 ? "read" : "hidden"; });
  return m;
}

export function useCustomRoles() {
  const [customRoles, setCustomRoles] = React.useState([]);
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, COLL), (snap) => {
      setCustomRoles(snap.docs.map(d => ({ key: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  return customRoles;
}

export async function saveCustomRole(key, data) {
  await setDoc(doc(db, COLL, key), data, { merge: true });
}

export async function deleteCustomRole(key) {
  await deleteDoc(doc(db, COLL, key));
}

// roleKey가 커스텀 권한이 아니면 null — 호출부에서 null이면 기존(내장 역할) 로직을 그대로 쓴다.
export function findCustomRole(customRoles, roleKey) {
  return (customRoles || []).find(r => r.key === roleKey) || null;
}

// 메뉴별 접근 수준: "hidden" | "read" | "write". 커스텀 권한이 아니면 항상 "write"
// (내장 역할의 기존 로직이 별도로 처리하므로 여기서는 관여하지 않는다는 의미).
export function getMenuAccess(customRoles, roleKey, menu) {
  const role = findCustomRole(customRoles, roleKey);
  if (!role) return "write";
  return role.menus?.[menu] || "hidden";
}
