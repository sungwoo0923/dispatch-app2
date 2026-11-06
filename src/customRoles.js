import React from "react";
import { db } from "./firebase";
import { collection, onSnapshot, setDoc, deleteDoc, doc, deleteField } from "firebase/firestore";
import { getTenant } from "./fsTenant";

const COLL = "customRoles";

// 최고관리자가 커스텀 권한(역할)을 만들 때 접근 범위를 설정할 수 있는 메뉴 목록.
// 관리자메뉴/관리센터는 권한 관리 자체를 다루는 화면이라 커스텀 권한에는 항상 제외한다
// (커스텀 권한이 스스로 권한을 더 부여하는 상황을 막기 위함).
// ⭐ 2026-10-31 최신화 — 전자결재·경리(회계·자금·비품)·인사(인사관리부·증명서)·임원(직원일정·스케줄) 메뉴 추가
export const CUSTOMIZABLE_MENUS = [
  "HOME", "전자결재", "배차관리", "실시간배차현황", "배차현황", "단가표", "운임조회",
  "기사관리", "거래처관리", "지입차관리", "매출관리", "정산관리", "인사이트",
  "회계관리", "자금관리", "비품관리", "인사관리부", "증명서발급", "직원일정", "회사관리",
];
// 부서·임원 전용 메뉴 — 내장 권한은 원래 쓰던 화면 기준 기본값, 직접 만든 권한은 켜면 그 메뉴가 보인다
export const DEPT_ONLY_MENUS = ["전자결재", "회계관리", "자금관리", "비품관리", "인사관리부", "증명서발급", "직원일정"];

export function defaultMenuAccess() {
  const m = {};
  CUSTOMIZABLE_MENUS.forEach((k, i) => { m[k] = i === 0 ? "read" : "hidden"; });
  return m;
}

// 🏷 2026-11-04 역할 기본 이름(PC·모바일 공용) — 권한 관리에서 이름을 바꾸면 그 이름이 먼저 쓰인다
export const ROLE_LABELS = {
  totalMaster: "최고관리자",
  allMgr: "통합관리자", hrAcct: "통합인사관리자",
  admin: "운송관리자", user: "운송사무원",
  test: "경리관리자", acctStaff: "경리사무원",
  hrManager: "인사관리자", hrStaff: "인사사무원",
  legalMgr: "법무관리자", legalStaff: "법무사무원",
  devMgr: "개발관리자", devStaff: "개발사무원",
  viewer: "조회전용", driver: "기사", shipper: "화주",
};

// 이미 있는 내장 역할 중, 이 화면에서 최고관리자가 메뉴별 권한을 직접 편집할 수 있는
// 목록. totalMaster(여러 회사를 넘나드는 총마스터 계정)는 잠금 사고를 막기 위해
// 편집 대상에서 계속 제외한다. driver/shipper는 이 PC 화면(DispatchApp)이 아니라
// 별도의 모바일/화주 앱을 쓰므로 여기서는 제외한다.
// ⭐ 2026-11-04 통합관리자(allMgr)·통합인사관리자(hrAcct)도 기본 역할로(메뉴 편집 가능) + 부서별 사무원·법무·개발 역할 추가
export const BUILTIN_EDITABLE_ROLES = [
  "allMgr", "hrAcct", "admin", "user", "test", "acctStaff", "hrManager", "hrStaff", "legalMgr", "legalStaff", "devMgr", "devStaff", "viewer",
].map((key) => ({ key, label: ROLE_LABELS[key] }));
const isBuiltinKey = (k) => BUILTIN_EDITABLE_ROLES.some((b) => b.key === k);

// 🔀 화면 전환 역할 — 상단 버튼(모바일은 메뉴)으로 화면을 바꾼다. 각 화면은 그 화면 역할로 동작
//  views: [화면 키, 화면 역할, 버튼 이름]
export const SWITCH_ROLES = {
  hrAcct: { storage: "kpHrAcctView", views: [["acct", "test", "경리"], ["hr", "hrManager", "인사"]] },
  allMgr: { storage: "kpAllMgrView", views: [["dispatch", "admin", "운송"], ["acct", "test", "경리"], ["hr", "hrManager", "인사"]] },
};
// 부서 화면을 쓰는 사무원 — 그 부서 화면(경리관리자·인사관리자 화면)으로 동작하되 메뉴는 이 역할 설정을 따른다
export const BASED_ROLES = { acctStaff: "test", hrStaff: "hrManager" };
// 메뉴 설정만으로 동작하는 역할(저장한 설정이 없으면 아래 기본값) — 전용 화면 없이 메뉴 권한대로
export const MENU_DRIVEN_ROLES = ["acctStaff", "hrStaff", "legalMgr", "legalStaff", "devMgr", "devStaff"];
export function readSwitchView(realRole) {
  const sw = SWITCH_ROLES[realRole];
  if (!sw) return "";
  let v = "";
  try { v = localStorage.getItem(sw.storage) || ""; } catch { /* 무시 */ }
  return sw.views.some(([k]) => k === v) ? v : sw.views[0][0];
}
export function saveSwitchView(realRole, v) {
  const sw = SWITCH_ROLES[realRole];
  if (!sw) return;
  try { localStorage.setItem(sw.storage, v); } catch { /* 무시 */ }
}
// 실제 역할 + 지금 화면 → 화면이 쓰는 역할(admin·test·hrManager 등)
export function viewRoleOf(realRole, view) {
  const sw = SWITCH_ROLES[realRole];
  if (sw) return (sw.views.find(([k]) => k === view) || sw.views[0])[1];
  return BASED_ROLES[realRole] || realRole;
}

// 내장 역할을 처음 편집할 때, 기존 하드코딩 로직과 최대한 비슷한 값에서 시작하도록
// 하는 기본값 — DispatchApp.jsx의 userBlockedMenus/testBlockedMenus/viewerBlockedMenus와
// 동일한 기준.
const RANK = { hidden: 0, read: 1, write: 2 };
const maxLv = (a, b) => ((RANK[a] || 0) >= (RANK[b] || 0) ? a || "hidden" : b || "hidden");
const minLv = (a, b) => ((RANK[a] ?? 2) <= (RANK[b] ?? 2) ? a || "write" : b || "write");
export function builtinDefaultMenuAccess(roleKey) {
  const write = {};
  CUSTOMIZABLE_MENUS.forEach(k => { write[k] = DEPT_ONLY_MENUS.includes(k) ? "hidden" : "write"; });
  const only = (list, readList = []) => Object.fromEntries(CUSTOMIZABLE_MENUS.map((k) => [k, list.includes(k) ? "write" : readList.includes(k) ? "read" : "hidden"]));
  const union = (...keys) => Object.fromEntries(CUSTOMIZABLE_MENUS.map((k) => [k, keys.reduce((lv, r) => maxLv(lv, builtinDefaultMenuAccess(r)[k]), "hidden")]));
  if (roleKey === "test") return only(["HOME", "전자결재", "배차현황", "정산관리", "매출관리", "회계관리", "자금관리", "비품관리", "기사관리", "회사관리"]);
  if (roleKey === "hrManager") return only(["HOME", "전자결재", "인사관리부", "증명서발급", "기사관리", "회사관리"]);
  // 경리사무원 — 경리 화면에서 자금·매출은 빼고 / 인사사무원 — 인사 화면에서 기사관리(기사 승인)는 빼고
  if (roleKey === "acctStaff") return only(["HOME", "전자결재", "배차현황", "정산관리", "회계관리", "비품관리", "회사관리"], ["기사관리"]);
  if (roleKey === "hrStaff") return only(["HOME", "전자결재", "인사관리부", "증명서발급", "회사관리"]);
  // 통합 역할 — 각 화면 역할 기본값을 합친 것(설정에서 숨기거나 조회로 낮출 수 있다)
  if (roleKey === "hrAcct") return union("test", "hrManager");
  if (roleKey === "allMgr") return union("admin", "test", "hrManager");
  // ⚖ 법무 — 결재(계약서 보관함 포함)·회사관리 + 거래처·지입차 조회 / 💻 개발 — 결재·회사관리 + 운송 업무 조회
  if (roleKey === "legalMgr") return only(["HOME", "전자결재", "회사관리"], ["거래처관리", "지입차관리", "배차현황", "직원일정"]);
  if (roleKey === "legalStaff") return only(["HOME", "전자결재", "회사관리"], ["거래처관리"]);
  if (roleKey === "devMgr") return only(["HOME", "전자결재", "회사관리"], ["배차관리", "실시간배차현황", "배차현황", "단가표", "운임조회", "기사관리", "거래처관리", "지입차관리"]);
  if (roleKey === "devStaff") return only(["HOME", "전자결재", "회사관리"], ["실시간배차현황", "배차현황", "기사관리", "거래처관리"]);
  if (roleKey === "admin") {
    // 관리자는 기본적으로 모든 메뉴에 전체 접근 — 여기서 직접 "숨김"으로 바꾸지 않는
    // 이상 지금까지와 동일하게 전 메뉴를 다 쓸 수 있다.
    return write;
  }

  if (roleKey === "viewer") {
    const read = {};
    CUSTOMIZABLE_MENUS.forEach(k => { read[k] = DEPT_ONLY_MENUS.includes(k) || k === "인사이트" ? "hidden" : "read"; });
    return read;
  }
  // user, hrManager (기존 로직상 hrManager도 user와 동일한 차단 목록을 따름)
  return { ...write, "매출관리": "hidden", "정산관리": "hidden", "인사이트": "hidden" };
}

// 🔀 화면에서 쓰는 권한 목록 — 실제 역할(realRole)의 메뉴 설정을 화면 역할(viewRole) 자리에 끼워 넣는다.
//  · 통합관리자·통합인사관리자: 저장한 설정이 있으면 "각 화면 메뉴 ∩ 이 역할 설정"(숨기거나 조회로 낮추기만)
//    저장한 설정이 없으면 예전처럼 각 화면 역할(운송관리자·경리관리자·인사관리자) 설정을 그대로 따른다
//  · 경리사무원·인사사무원: 경리/인사 화면 메뉴 ∩ 이 역할 설정(없으면 기본값)
//  · 법무·개발: 이 역할 설정(없으면 기본값)으로 일반 화면
export function applyRoleMenus(customRoles = [], realRole, viewRole) {
  if (!realRole) return customRoles;
  const own = findCustomRole(customRoles, realRole);
  const driven = MENU_DRIVEN_ROLES.includes(realRole);
  const ownMenus = { ...builtinDefaultMenuAccess(realRole), ...(own?.menus || {}) };
  if (realRole === viewRole) {
    if (own || !driven) return customRoles;
    return [...customRoles, { key: realRole, label: ROLE_LABELS[realRole] || realRole, menus: ownMenus, synthetic: true }];
  }
  if (!own && !driven) return customRoles;
  const viewSaved = findCustomRole(customRoles, viewRole);
  const viewMenus = { ...builtinDefaultMenuAccess(viewRole), ...(viewSaved?.menus || {}) };
  const menus = Object.fromEntries(CUSTOMIZABLE_MENUS.map((m) => [m, minLv(ownMenus[m], viewMenus[m])]));
  return [...customRoles.filter((r) => r.key !== viewRole), { ...(viewSaved || {}), key: viewRole, label: own?.label || ROLE_LABELS[realRole] || realRole, menus, viaRole: realRole, synthetic: true }];
}
// 화면 전환 상태를 쓰는 훅(PC·모바일 공용) — { view, setView, role(화면 역할), views }
export function useRoleView(realRole) {
  const [view, setViewState] = React.useState(() => readSwitchView(realRole));
  React.useEffect(() => { setViewState(readSwitchView(realRole)); }, [realRole]);
  const setView = React.useCallback((v) => { saveSwitchView(realRole, v); setViewState(v); }, [realRole]);
  return { view, setView, role: viewRoleOf(realRole, view), views: SWITCH_ROLES[realRole]?.views || null };
}

// 🏢 2026-11-04 부서 → 고를 수 있는 권한(회원 관리·직원 관리·인사관리부·권한 관리 소속 직원 공용)
//  부서 이름의 낱말로 고른다(인사관리부 › 직책·부서 설정의 부서 목록 그대로). 조회전용은 늘 포함.
//  맞는 규칙이 없는 부서(미배정 포함)는 전체 권한. 직접 만든 역할은 이름에 그 부서 낱말이 들어가면 함께(임원은 "임원 화면" 역할).
export const DEPT_ROLE_RULES = [
  { re: /임원/, keys: ["allMgr"], exec: true }, // ⭐ 2026-11-05 임원도 통합관리자 고를 수 있게(임원 화면 역할 다음)
  { re: /경리|회계|재무/, keys: ["test", "acctStaff", "hrAcct", "allMgr"], label: /경리|회계|재무/ },
  { re: /인사/, keys: ["hrManager", "hrStaff", "hrAcct", "allMgr"], label: /인사/ },
  { re: /운송|배차/, keys: ["admin", "user", "allMgr"], label: /운송|배차/ },
  // 운영팀 — 운송사 운영팀은 배차·차량 운영을 같이 하므로 운송 역할을 그대로 쓴다(관리자 화면·보안 규칙이 admin 기준이라 따로 만들면 빠지는 곳이 생김)
  { re: /운영/, keys: ["admin", "user", "allMgr"], label: /운영|운송|배차/ },
  { re: /법무/, keys: ["legalMgr", "legalStaff"], label: /법무/ },
  { re: /개발/, keys: ["devMgr", "devStaff"], label: /개발/ },
];
// options: [[key, label], …] → 그 부서에 맞는 것만(규칙 순서대로, 조회전용은 맨 뒤)
export function rolesForTeam(team, options = [], customRoles = []) {
  const t = String(team || "").trim();
  const rule = t ? DEPT_ROLE_RULES.find((r) => r.re.test(t)) : null;
  if (!rule) return options;
  const isOwn = (k) => !isBuiltinKey(k) && !["totalMaster", "driver", "shipper"].includes(k);
  const picked = options.filter(([k, l]) => {
    if (rule.keys.includes(k)) return true;
    if (!isOwn(k)) return false;
    const r = customRoles.find((x) => x.key === k) || { key: k, label: l };
    if (rule.exec) return roleScreen(r) === "exec";
    return roleScreen(r) !== "exec" && rule.label.test(String(r.label || l || ""));
  }).sort((a, b) => {
    const rk = (k) => { const i = rule.keys.indexOf(k); return rule.exec ? (i < 0 ? 0 : 60 + i) : (i < 0 ? 50 : i); };
    return rk(a[0]) - rk(b[0]);
  });
  if (!picked.length) return options;
  if (rule.exec && !picked.some(([k]) => !rule.keys.includes(k))) return options; // 임원 화면 역할이 없는 회사는 예전처럼 전체 // 그 부서용 역할이 아직 없으면(예: 임원 화면 역할을 안 만든 회사) 전체
  const viewer = options.find(([k]) => k === "viewer");
  return viewer ? [...picked, viewer] : picked;
}

// 전체 운송사 공통 설정(customRoles) — 권한 관리 화면이 직접 편집
export function useGlobalCustomRoles() {
  const [customRoles, setCustomRoles] = React.useState([]);
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, COLL), (snap) => {
      setCustomRoles(snap.docs.map(d => ({ key: d.id, ...d.data() })));
    }, () => setCustomRoles([]));
    return () => unsub();
  }, []);
  return customRoles;
}

// 🏢 2026-11-01 운송사별 권한 설정 — companyRoleOverrides/{운송사} = { roles: { [역할키]: { menus, label?, screen? } } }
//  적용 순서: 그 운송사 설정 → 전체 운송사 설정(customRoles) → 기본값. 최고관리자만 바꿀 수 있다(보안 규칙).
export const OVR_COLL = "companyRoleOverrides";
const currentCompany = () => { try { return String(getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; } };
export function mergeCompanyRoles(globalRoles = [], ov = null) {
  const roles = ov?.roles || {};
  const keys = Object.keys(roles);
  if (!keys.length) return globalRoles;
  const out = globalRoles.map((r) => (roles[r.key] ? { ...r, ...roles[r.key], label: roles[r.key].label || r.label, companyOverride: true } : r));
  keys.filter((k) => !globalRoles.some((r) => r.key === k)).forEach((k) => {
    const b = BUILTIN_EDITABLE_ROLES.find((x) => x.key === k);
    out.push({ key: k, label: roles[k].label || b?.label || k, ...roles[k], companyOverride: true });
  });
  return out;
}
export function useCompanyRoleOverride(company) {
  const [ov, setOv] = React.useState(null);
  React.useEffect(() => {
    if (!company) { setOv(null); return undefined; }
    return onSnapshot(doc(db, OVR_COLL, company), (s) => setOv(s.exists() ? s.data() : null), () => setOv(null));
  }, [company]);
  return ov;
}
// 화면에서 쓰는 권한 목록(지금 회사의 운송사별 설정이 합쳐진 것)
export function useCustomRoles(companyArg) {
  const global = useGlobalCustomRoles();
  const co = companyArg ?? currentCompany();
  const ov = useCompanyRoleOverride(co);
  return React.useMemo(() => mergeCompanyRoles(global, ov), [global, ov]);
}
export async function saveCompanyRole(company, key, data) {
  await setDoc(doc(db, OVR_COLL, company), { companyName: company, roles: { [key]: data } }, { merge: true });
}
export async function deleteCompanyRole(company, key) {
  await setDoc(doc(db, OVR_COLL, company), { roles: { [key]: deleteField() } }, { merge: true });
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
  if (role.menus && menu in role.menus) return role.menus[menu];
  // 예전에 저장된 권한에 없는 새 메뉴 — 내장 권한은 기본값, 직접 만든 권한은 숨김
  return isBuiltinKey(roleKey) ? builtinDefaultMenuAccess(roleKey)[menu] || "write" : "hidden";
}

// 👔 2026-10-31 역할의 "기본 화면" — 권한 관리에서 역할마다 고른다(일반 업무 / 임원 화면).
//  저장값이 없으면 이름에 "임원"이 들어간 직접 만든 역할은 임원 화면으로 본다.
//  ※ 내장 역할(관리자·실무자 등)은 임원 화면으로 바꿀 수 없다 — 임원 화면은 임원 역할을 받은 직원만.
export const ROLE_SCREENS = [["", "일반 업무 화면"], ["exec", "임원 화면 (경영 브리핑)"]];
export function roleScreen(r) {
  if (!r || isBuiltinKey(r.key)) return "";
  if (typeof r.screen === "string") return r.screen;
  return /임원/.test(String(r.label || "")) ? "exec" : "";
}

// 직원 권한 드롭다운 공용 — 기본 역할 + 권한 관리에서 만든 역할(이름 바꾼 기본 역할은 바꾼 이름으로)
export const BASE_ROLE_OPTIONS = BUILTIN_EDITABLE_ROLES.map((b) => [b.key, b.label]);
const NEW_STAFF_KEYS = ["acctStaff", "hrStaff"];
export function roleOptionsFrom(customRoles = []) {
  const real = customRoles.filter((r) => !r.synthetic);
  // 회사에서 같은 이름(예: 경리사무원)의 역할을 이미 만들어 쓰고 있으면 새 기본 역할은 목록에서 뺀다(이름 중복 방지)
  const dupLabel = (k) => NEW_STAFF_KEYS.includes(k) && real.some((r) => !isBuiltinKey(r.key) && String(r.label || "").trim() === ROLE_LABELS[k]);
  const base = BASE_ROLE_OPTIONS.filter(([k]) => !dupLabel(k)).map(([k, l]) => [k, real.find((r) => r.key === k)?.label || l]);
  const own = real.filter((r) => !BASE_ROLE_OPTIONS.some(([k]) => k === r.key) && !["totalMaster", "driver", "shipper"].includes(r.key)).map((r) => [r.key, `${r.label || r.key}${roleScreen(r) === "exec" ? " · 임원 화면" : ""}`]);
  return [...base, ...own];
}
export function useRoleOptions() {
  const customRoles = useCustomRoles();
  return React.useMemo(() => {
    const options = roleOptionsFrom(customRoles);
    const label = (k) => options.find(([x]) => x === k)?.[1] || ROLE_LABELS[k] || k || "-";
    const execKeys = customRoles.filter((r) => roleScreen(r) === "exec").map((r) => r.key);
    // 🏢 부서에 맞는 권한만 — keep: 지금 권한이 목록에 없어도 맨 앞에 남겨 둘 값
    const forTeam = (team, keep) => { const l = rolesForTeam(team, options, customRoles); return keep && !l.some(([k]) => k === keep) ? [[keep, label(keep)], ...l] : l; };
    const fits = (role, team) => rolesForTeam(team, options, customRoles).some(([k]) => k === role);
    const firstFor = (team) => rolesForTeam(team, options, customRoles)[0]?.[0] || "user";
    return { options, label, customRoles, execKeys, forTeam, fits, firstFor };
  }, [customRoles]);
}
