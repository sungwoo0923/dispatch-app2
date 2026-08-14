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

// 이미 있는 내장 역할 중, 이 화면에서 최고관리자가 메뉴별 권한을 직접 편집할 수 있는
// 목록. totalMaster(여러 회사를 넘나드는 총마스터 계정)는 잠금 사고를 막기 위해
// 편집 대상에서 계속 제외한다. driver/shipper는 이 PC 화면(DispatchApp)이 아니라
// 별도의 모바일/화주 앱을 쓰므로 여기서는 제외한다.
export const BUILTIN_EDITABLE_ROLES = [
  { key: "admin", label: "관리자" },
  { key: "hrManager", label: "인사관리자" },
  { key: "user", label: "실무자" },
  { key: "test", label: "경리/회계" },
  { key: "viewer", label: "조회전용" },
];

// 내장 역할을 처음 편집할 때, 기존 하드코딩 로직과 최대한 비슷한 값에서 시작하도록
// 하는 기본값 — DispatchApp.jsx의 userBlockedMenus/testBlockedMenus/viewerBlockedMenus와
// 동일한 기준.
export function builtinDefaultMenuAccess(roleKey) {
  const write = {};
  CUSTOMIZABLE_MENUS.forEach(k => { write[k] = "write"; });
  if (roleKey === "admin") {
    // 관리자는 기본적으로 모든 메뉴에 전체 접근 — 여기서 직접 "숨김"으로 바꾸지 않는
    // 이상 지금까지와 동일하게 전 메뉴를 다 쓸 수 있다.
    return write;
  }
  if (roleKey === "test") {
    return { ...write, "배차관리": "hidden", "실시간배차현황": "hidden", "단가표": "hidden" };
  }
  if (roleKey === "viewer") {
    const read = {};
    CUSTOMIZABLE_MENUS.forEach(k => { read[k] = "read"; });
    return read;
  }
  // user, hrManager (기존 로직상 hrManager도 user와 동일한 차단 목록을 따름)
  return { ...write, "매출관리": "hidden", "정산관리": "hidden" };
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
