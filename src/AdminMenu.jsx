// src/AdminMenu.jsx
import { MonthPicker } from "./kpInputs"; // 📅 2026-11-07 월 선택은 프로그램 달력으로
import BillingCenter from "./BillingCenter";
import { runDelete, commitDeletes } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { billingAccess } from "./billingAccess";
import { kpConfirm } from "./kpDialog";
import { guardSeat } from "./plans"; // 👥 2026-11-09 직원 계정 한도
import { CopyTemplateEditor } from "./CopyTemplateEditor";
import { openSetupWizard, openTutorial } from "./Onboarding";
import AdminShell from "./AdminShell";
import React, { useEffect, useState, useMemo } from "react";
import { WORK_SCOPES, normScope, workScopeLabel } from "./workScope";
import { subscribeUsersLive, getUsersLiveList } from "./usersLive"; // ⭐ 2026-11-02 속도 — 직원 명부 구독 공유
import { auth, db, storage, FUNCTIONS_BASE, DEFAULT_COMPANY } from "./firebase";
import { getTenant, isPreviewMode } from "./fsTenant"; // ⭐ 2026-11-02 회사 분리 — 지금 거르는 회사(최고관리자 회사 전환 포함)
import { masterHasHr } from "./hrHandover";
import { WORK_TIME_OPTIONS } from "./autoAttendance";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { setDoc, updateDoc } from "./orderWrite"; // ★ 오더 수정시각 자동 기록(여러 사용자 실시간 일치)
import { ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL } from "firebase/storage";

import { EMPLOYMENT_STATUS_OPTIONS, suggestRole, ROLE_NAME, isExecProfile, useHrOptions } from "./hrConstants";
import { CustomSelect } from "./CustomSelect";
import RolePermissionsPanel from "./RolePermissionsPanel";
import { AdminSessionsPanel } from "./LoginManager";
import SheetConnectHub from "./SheetConnectHub"; // 🔗 2026-11-07 구글시트 연동 한곳(가져오기 · 전송 · 연결 마법사)
const DataCheckPanel = React.lazy(() => import("./DataCheckPanel")); // 🩺 2026-11-10 데이터 점검(모양이 이상한 값 찾아 고치기)
import { useCustomRoles, roleScreen, ROLE_LABELS, roleOptionsFrom, rolesForTeam } from "./customRoles";
import { useCompanyFeatures } from "./companyFeatures"; // ⭐ 2026-11-04 마스터 권한 관리(회사별로 켬)
import { EditableText } from "./EditMode";
import { useLoadOrderRange, monthEnd, monthStart } from "./orderHistory";
import { fmtBizNo, fmtPhone } from "./formatInput";

// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙)
// 전화번호 하이픈 — 공용 규칙(src/formatInput.js: 02·031·010·1588 등, 입력 중에도 적용)
const formatPhone = (phone) => fmtPhone(phone);

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

const generateCompanyCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SF-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const fmtDate = (ts) => {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

// 역할 이름은 customRoles.js ROLE_LABELS(PC·모바일 공용)

const DotBadge = ({ active, label, activeLabel, inactiveLabel }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
    {label || (active ? activeLabel : inactiveLabel)}
  </span>
);

// ⚡ 직원 목록 실시간 캐시 — 한 번 구독하면 화면을 닫아도 유지하고, 다시 열면 마지막 목록을 즉시 보여준다
// ⭐ 2026-11-02 속도 — 구현은 usersLive.js로 옮겨 앱 전체가 같은 구독 하나를 나눠 쓴다(기존 import 호환용으로 다시 내보냄)
export { subscribeUsersLive };

// ⭐ 2026-11-07 회원 상태(목록 배지와 같은 기준) — 퇴사 · 승인(예전 계정은 approved 없음 = 승인) · 대기
const memberStatusOf = (u) => (u.employmentStatus === "퇴사" ? "퇴사" : u.approved !== false ? "승인" : "대기");

export default function AdminMenu({ parentRole = "", parentCompany = "", isViewer = false, dispatchData = [], places = [], deptMode = null }) {
  const [adminTab, setAdminTab] = useState("members");
  const [sessionLogs, setSessionLogs] = useState([]);
  const [sessionLogEventFilter, setSessionLogEventFilter] = useState("all");
  const [sessionLogPage, setSessionLogPage] = useState(1);
  const SESSION_LOG_PAGE_SIZE = 20;
  const [users, setUsers] = useState(() => getUsersLiveList() || []);
  const [allShipperApps, setAllShipperApps] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [memberStatus, setMemberStatus] = useState("all"); // ⭐ 2026-11-07 회원 목록 상태 필터(전체·승인·대기·퇴사)
  const [manageUser, setManageUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editScope, setEditScope] = useState(""); // 🗂 2026-11-13 업무 범위(배차 포함 / 사내업무만 / 사내업무 + 경리) — src/workScope.js
  const [editCompany, setEditCompany] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [editWorkStart, setEditWorkStart] = useState("09:00"); // ⭐ 2026-11-02 출근·퇴근 시간(가입 승인 때 지정)
  const [editWorkEnd, setEditWorkEnd] = useState("18:00");
  const [editMode, setEditMode] = useState(false);
  const [memberModal, setMemberModal] = useState(false); // 회원 관리 창(승인·거절·정보수정·마스터·퇴사·삭제)
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // 연동 운송사 탭 state
  const [managingLinkedApp, setManagingLinkedApp] = useState(null);
  const [rejectLinkedReason, setRejectLinkedReason] = useState("");
  const [showRejectLinked, setShowRejectLinked] = useState(false);
  const [linkedSearch, setLinkedSearch] = useState("");
  const [linkedStatusFilter, setLinkedStatusFilter] = useState("pending");

  // 화주사 전송 탭 state
  const monthNow = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  const [transmitCompanyQuery, setTransmitCompanyQuery] = useState("");
  const [transmitFromMonth, setTransmitFromMonth] = useState(monthNow);
  const [transmitToMonth, setTransmitToMonth] = useState(monthNow);
  useLoadOrderRange(transmitToMonth ? monthStart(transmitFromMonth) : null, monthEnd(transmitToMonth)); // ★ 고른 기간만 불러오기(월을 지우면 요청 안 함)
  const [transmitSearched, setTransmitSearched] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [transmitResult, setTransmitResult] = useState(null);

  // 화주사 문의 탭 state
  const [allInquiries, setAllInquiries] = useState([]);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [inquiryReplyText, setInquiryReplyText] = useState("");
  const [inquiryReplying, setInquiryReplying] = useState(false);

  // 도입 문의(홈페이지 랜딩페이지) 탭 state
  const [landingInquiries, setLandingInquiries] = useState([]);
  const [selectedLandingInquiry, setSelectedLandingInquiry] = useState(null);
  const [landingStatusSaving, setLandingStatusSaving] = useState(false);

  const [myRole, setMyRole] = useState("");
  const [myCompany, setMyCompany] = useState("");
  const [myCompanyCode, setMyCompanyCode] = useState("");
  const [appUserPerms, setAppUserPerms] = useState(null);

  const me = auth.currentUser;
  const isTotalMaster = parentRole === "totalMaster" || me?.email === TOTAL_MASTER_EMAIL || myRole === "totalMaster";
  const customRoles = useCustomRoles();
  const roleOpts = React.useMemo(() => roleOptionsFrom(customRoles), [customRoles]);
  const roleLabels = { ...ROLE_LABELS, ...Object.fromEntries(roleOpts) };
  const execRoleKeys = customRoles.filter((r) => roleScreen(r) === "exec").map((r) => r.key);
  // ⭐ 2026-11-04 기본 역할(통합관리자·통합인사관리자·사무원·법무·개발 포함) + 권한 관리에서 만든 역할
  const ROLES = isTotalMaster
    ? ["totalMaster", ...roleOpts.map(([k]) => k), "driver", "shipper"]
    : roleOpts.map(([k]) => k);
  // 🏢 2026-11-04 부서 → 권한 거르기(customRoles.js rolesForTeam) — 맞는 역할이 하나도 없으면 그대로
  const fitKeys = (team) => rolesForTeam(team, roleOpts, customRoles).map(([k]) => k);
  const byTeam = (list, team) => { if (!team) return list; const f = fitKeys(team); const l = list.filter((k) => f.includes(k)); return l.length ? l : list; };
  // 추천 권한이 그 부서에 맞지 않으면(또는 지정할 수 없으면) 그 부서의 첫 역할로
  const suggestR = (x) => {
    const s0 = isExecProfile(x) && execRoleKeys[0] ? execRoleKeys[0] : suggestRole(x);
    const list = byTeam(assignableRoles(), x?.team);
    return list.includes(s0) ? s0 : (list[0] || s0);
  };
  // ⭐ 2026-11-02 회사 분리 — 최고관리자는 본인 문서의 회사(예: 돌캐)가 아니라 "지금 들어가 있는 회사"(로그인 회사)를 기준으로.
  //  예전엔 최고관리자가 태진에 들어가도 연동 화주사·화주사 전송·인사 설정이 본인 문서 회사로 잡혔다.
  const effectiveCompany = isTotalMaster
    ? (String(parentCompany || localStorage.getItem("loginCompany") || myCompany || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY)
    : (myCompany || parentCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
  // 휴지통이 다루는 회사 — 최고관리자는 지금 들어가 있는 회사
  const autoCompany = (isTotalMaster && localStorage.getItem("loginCompany")) || effectiveCompany;

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, "users", me.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setMyRole(d.role || "");
        setMyCompany(d.companyName || "");
        setMyCompanyCode(d.companyCode || "");
      }
    });
    return () => unsub();
  }, [me?.uid]);

  // ⚡ 직원 목록은 앱이 켜질 때부터 받아 두고 계속 살려 둔다(관리자메뉴를 열 때마다 처음부터 받던 지연 제거)
  useEffect(() => subscribeUsersLive((l) => setUsers(l)), []);

  // 최고관리자 전용 접속이력(로그인/로그아웃) — 탭을 열었을 때만 구독한다.
  useEffect(() => {
    if (!isTotalMaster || adminTab !== "sessionLogs") return;
    const q = query(collection(db, "sessionLogs"), orderBy("at", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setSessionLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isTotalMaster, adminTab]);

  // 화주 신청 구독 (연동운송사 탭용)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "companyApplications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAllShipperApps(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!managingLinkedApp?.userId) { setAppUserPerms(null); return; }
    getDoc(doc(db, "users", managingLinkedApp.userId)).then(snap => {
      if (snap.exists()) setAppUserPerms(snap.data().permissions || {});
    });
  }, [managingLinkedApp?.userId]);

  // 화주사 문의 구독
  // 🔒 2026-11-07 보안 점검 — 운송사는 우리 회사로 들어온 문의(transportCompany)만 조회(서버 규칙도 같은 조건 · 예전엔 모든 회사 문의)
  useEffect(() => {
    const src = isTotalMaster ? collection(db, "inquiries") : query(collection(db, "inquiries"), where("transportCompany", "==", effectiveCompany));
    const unsub = onSnapshot(src, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAllInquiries(list);
    }, () => setAllInquiries([]));
    return () => unsub();
  }, [isTotalMaster, effectiveCompany]);

  // 도입 문의(홈페이지 랜딩페이지 도입문의 폼) 구독 — 최고관리자만
  useEffect(() => {
    if (!isTotalMaster) return;
    const unsub = onSnapshot(collection(db, "landingInquiries"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLandingInquiries(list);
    });
    return () => unsub();
  }, [isTotalMaster]);

  const newLandingInquiryCount = landingInquiries.filter(q => (q.status || "신규") === "신규").length;

  const updateLandingInquiryStatus = async (id, status) => {
    setLandingStatusSaving(true);
    try {
      await updateDoc(doc(db, "landingInquiries", id), { status });
      setSelectedLandingInquiry(prev => (prev && prev.id === id ? { ...prev, status } : prev));
    } finally {
      setLandingStatusSaving(false);
    }
  };

  // 👑 회사 마스터 — 신규 운송사를 처음 가입한 계정(users.isMaster). 자기 회사 직원의 승인·권한·부서·직책·퇴사를 정한다.
  const meDoc = users.find((u) => u.id === me?.uid);
  const isCompanyMaster = !isTotalMaster && meDoc?.isMaster === true && meDoc?.role !== "shipper" && meDoc?.role !== "driver";
  const canAdmin = isTotalMaster || isCompanyMaster;
  // ⭐ 2026-11-04 권한 관리 — 최고관리자가 "마스터 권한 관리"를 켠 회사(예: 태진)만 마스터에게도 보인다(자기 회사 전용으로만)
  const coFeat = useCompanyFeatures(effectiveCompany);
  const masterPerms = isCompanyMaster && coFeat.masterRolePerms !== false; // ⭐ 2026-11-11 모든 운송사 마스터에게 기본으로(최고관리자가 끈 회사만 숨김)
  const hrOpt = useHrOptions(effectiveCompany);
  const positionsForTeam = hrOpt.positionsFor;
  const TEAM_OPTIONS = hrOpt.teams;
  // ⭐ 2026-10-31 가입 승인은 관리자·경리·인사관리자부터 — 인사관리자는 인사권(승인 후 정보·권한 변경·퇴사)까지
  const myRoleEff = meDoc?.role || myRole || parentRole;
  const isHrMgr = !canAdmin && ["hrManager", "hrAcct", "allMgr"].includes(myRoleEff);
  const canApprove = canAdmin || ["admin", "hrManager", "hrAcct", "allMgr", "test"].includes(myRoleEff);
  // ⭐ 2026-11-01 마스터 인사권 자동 인계 — 인사 담당자가 생기면 마스터는 재직 직원의 부서·직책·퇴사를 바꾸지 않는다
  //  (승인·권한 지정·마스터 지정은 그대로 — 인사관리자를 지정해야 하므로). 가입 승인 대기자는 마스터도 부서·직책 지정 가능
  const hrHanded = isCompanyMaster && !isTotalMaster && !masterHasHr(meDoc, users.filter((x) => (x.companyName || DEFAULT_COMPANY) === effectiveCompany), me?.uid);
  const hrLocked = (u) => hrHanded && !!u && (u.approved !== false || u.employmentStatus === "퇴사"); // 가입 대기자만 예외
  // ⭐ 2026-11-01 회원관리에서는 가입 승인·거절만(승인 권한자) — 재직 직원 정보·권한·계정 처리는 인사관리부에서.
  //  본인 계정은 이름·핸드폰번호만 고칠 수 있다(아래 saveEdit 본인 경로). 최고관리자만 예외
  // ⭐ 2026-11-02 점검 — approved 필드가 없는 예전 계정은 승인으로 본다(App.jsx·규칙과 동일). 대기 = approved===false 이고 퇴사·삭제·탈퇴 아님
  //  ⭐ 2026-11-02 회사 분리 — 연동 화주 계정의 승인은 "연동 운송사" 탭(1차 승인 → 최고관리자 최종 승인)에서 하므로
  //  운송사 관리자 회원관리에서는 승인 대기로 세지도, 승인 창을 열지도 않는다(최고관리자만 예외)
  const isPending = (u) => !!u && u.approved === false && u.employmentStatus !== "퇴사" && !["deleted", "withdrawn"].includes(u.status) && (isTotalMaster || u.role !== "shipper");
  // ⭐ 2026-11-02 점검 — !u.approved 대신 isPending — 예전 승인 계정에 승인·거절 창이 열려 거절로 잠기던 문제
  // ⭐ 2026-11-05 회사 마스터는 재직 직원(마스터·퇴사자 제외)의 권한도 여기서 바꾼다(최고관리자 권한은 못 줌). 부서·직책은 인사 담당자가 있으면 잠김(hrLocked)
  const canEditMember = (u) => !!u && (isTotalMaster || (canApprove && isPending(u))
    || (isCompanyMaster && !u.isMaster && u.id !== me?.uid && u.employmentStatus !== "퇴사" && !["driver", "shipper", "totalMaster"].includes(u.role) && (u.companyName || DEFAULT_COMPANY) === effectiveCompany));
  // team — 고른 부서에 맞는 역할만(지금 역할 cur는 늘 남김)
  function assignableRoles(cur, team) {
    const base0 = canAdmin ? ROLES : isHrMgr ? ROLES.filter((r) => r !== "totalMaster") : myRoleEff === "admin" ? ["admin", "user", "test", "acctStaff", "hrManager", "hrStaff", "salesMgr", "salesStaff", "legalMgr", "legalStaff", "devMgr", "devStaff", "viewer"] : ["user", "test", "acctStaff", "hrStaff", "salesStaff", "viewer"];
    const all0 = base0.filter((k) => k === "totalMaster" || k === "driver" || k === "shipper" || ROLES.includes(k));
    // ⭐ 2026-11-05 회사 마스터는 부서와 상관없이 전체 권한(부서에 맞는 권한을 앞에)
    const base = isCompanyMaster ? (() => { const fit = byTeam(all0, team); return [...fit, ...all0.filter((k) => !fit.includes(k))]; })() : byTeam(all0, team);
    return cur && !base.includes(cur) ? [cur, ...base] : base;
  }
  // ⭐ 2026-10-31 부서·직책을 바꾸면 직책 드롭다운을 부서에 맞추고(임원 → 대표·전무·이사) 권한을 추천값으로 맞춘다
  const applySuggest = (team, position) => setEditRole((r) => (r === "totalMaster" ? r : suggestR({ team, position })));
  const onTeamChange = (t) => {
    setEditTeam(t);
    const pos = positionsForTeam(t).includes(editPosition) ? editPosition : "";
    if (pos !== editPosition) setEditPosition(pos);
    applySuggest(t, pos);
  };
  const onPositionChange = (p) => { setEditPosition(p); applySuggest(editTeam, p); };
  // ⭐ 2026-11-05 부관리자 — 최고관리자(본 계정)가 1명 지정. 권한은 최고관리자와 같음(role totalMaster + subAdmin 표시). 해제하면 예전 권한으로
  const isSuperMe = me?.email === TOTAL_MASTER_EMAIL;
  const toggleSubAdmin = async (u) => {
    if (!isSuperMe) return alert("부관리자는 최고관리자 본 계정만 지정할 수 있습니다.");
    if (!u || u.email === TOTAL_MASTER_EMAIL) return;
    const next = !u.subAdmin;
    if (next) {
      const other = users.find((x) => x.subAdmin === true && x.id !== u.id);
      if (other) return alert(`부관리자는 1명만 둘 수 있습니다.\n먼저 「${other.name || other.email}」님의 부관리자를 해제해 주세요.`);
    }
    if (!await kpConfirm(next ? `"${u.name || u.email}"님을 부관리자로 지정할까요?\n최고관리자와 같은 권한(모든 운송사·관리센터·요금·삭제)을 갖습니다.` : `"${u.name || u.email}"님의 부관리자를 해제할까요?\n예전 권한(${roleLabels[u.subAdminPrevRole] || u.subAdminPrevRole || "관리자"})으로 돌아갑니다.`)) return;
    const history = [...(u.personnelHistory || []), { date: todayStr(), type: next ? "부관리자 지정" : "부관리자 해제", detail: meDoc?.name || me?.email || "" }];
    const patch = next
      ? { subAdmin: true, subAdminPrevRole: u.role || "admin", role: "totalMaster", approved: true, personnelHistory: history }
      : { subAdmin: false, role: u.subAdminPrevRole && u.subAdminPrevRole !== "totalMaster" ? u.subAdminPrevRole : "admin", personnelHistory: history };
    await setDoc(doc(db, "users", u.id), patch, { merge: true });
    if (manageUser?.id === u.id) setManageUser((prev) => ({ ...prev, ...patch }));
    if (next) { setEditRole("totalMaster"); } else { setEditRole(patch.role); }
  };
  const toggleMaster = async (u) => {
    if (!canAdmin) return;
    if (u.id === me?.uid && u.isMaster) return alert("본인의 마스터는 해제할 수 없습니다. 다른 직원을 먼저 마스터로 지정해 주세요.");
    const next = !u.isMaster;
    // ⭐ 2026-11-09 마스터는 운송사마다 1명 — 회사 마스터가 다른 직원을 마스터로 지정하면 "위임"으로 처리(본인은 마스터에서 빠짐)
    if (next && !isTotalMaster) { await delegateMaster(u); return; }
    if (!await kpConfirm(next ? `"${u.name || u.email}"님을 마스터로 지정할까요?\n마스터는 직원 승인·권한을 정하고, 인사 담당자가 없을 때는 부서·직책·퇴사도 처리합니다.` : `"${u.name || u.email}"님의 마스터를 해제할까요?`)) return;
    const history = [...(u.personnelHistory || []), { date: todayStr(), type: next ? "마스터 지정" : "마스터 해제", detail: meDoc?.name || me?.email || "" }];
    await setDoc(doc(db, "users", u.id), { isMaster: next, ...(next ? { role: "admin" } : {}), personnelHistory: history }, { merge: true });
    if (next) await demoteOtherMasters(u, `마스터 변경 → ${u.name || u.email}`); // 최고관리자가 새 마스터를 지정하면 기존 마스터는 해제(1명 유지)
    if (manageUser?.id === u.id) setManageUser((prev) => ({ ...prev, isMaster: next, ...(next ? { role: "admin" } : {}), personnelHistory: history }));
  };

  // 같은 회사의 다른 마스터 해제(최고관리자가 지정·위임할 때 — 마스터 1명 유지)
  const demoteOtherMasters = async (u, detail) => {
    const co = u.companyName || DEFAULT_COMPANY; const day = todayStr();
    const others = users.filter((x) => x.id !== u.id && x.isMaster === true && x.role !== "shipper" && (x.companyName || DEFAULT_COMPANY) === co);
    for (const x of others) {
      await setDoc(doc(db, "users", x.id), { isMaster: false, personnelHistory: [...(x.personnelHistory || []), { date: day, type: "마스터 해제", detail }] }, { merge: true }).catch(() => {});
    }
  };
  // 👑 2026-11-01 마스터 위임 — 마스터(최초 가입자)가 다른 재직 직원에게 마스터를 넘기고 본인은 마스터에서 빠진다
  const canDelegateMaster = (u) => !!u && (isCompanyMaster || isTotalMaster) && u.id !== me?.uid && !u.isMaster && u.approved !== false
    && u.employmentStatus !== "퇴사" && !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role);
  const delegateMaster = async (u) => {
    if (!canDelegateMaster(u)) return;
    const who = u.name || u.email;
    if (!await kpConfirm(`"${who}"님에게 마스터 권한을 위임할까요?\n\n· ${who}님은 마스터(관리자 권한)가 됩니다\n· 본인은 마스터에서 빠지고 지금 권한(${roleLabels[meDoc?.role] || meDoc?.role || "-"})은 그대로입니다\n· 되돌리려면 새 마스터가 다시 위임해야 합니다`)) return;
    const day = todayStr(); const by = meDoc?.name || me?.email || "";
    try {
      await setDoc(doc(db, "users", u.id), { isMaster: true, role: "admin", personnelHistory: [...(u.personnelHistory || []), { date: day, type: "마스터 위임 받음", detail: by }] }, { merge: true });
      if (!isTotalMaster && meDoc) await setDoc(doc(db, "users", meDoc.id), { isMaster: false, personnelHistory: [...(meDoc.personnelHistory || []), { date: day, type: "마스터 위임", detail: who }] }, { merge: true });
      if (isTotalMaster) await demoteOtherMasters(u, `마스터 위임 → ${who}`); // ⭐ 2026-11-09 최고관리자가 위임하면 그 회사 기존 마스터 해제(예전엔 2명 남음)
      alert(`"${who}"님에게 마스터를 위임했습니다.`);
    } catch (e) { alert(`위임 실패: ${e.message}`); }
  };

  // ⭐ 2026-11-02 회사 분리 — 화주 계정은 fsTenant가 "여러 운송사와 연동되는 거래 상대"라 회사 거르기 없이 다 넘겨준다.
  //  그래서 최고관리자가 태진에 들어가면 돌캐에 연동된 화주 계정(신선대표계정·크레팜대표계정 등)까지 회원관리에 보였다.
  //  화주 계정은 "지금 회사에 연동된 것"만 남긴다 — users.linkedTransportCompany 또는 화주 가입신청(companyApplications)의 연동 운송사.
  //  연동 정보가 하나도 없는 예전 화주 계정은 기본 회사(DEFAULT_COMPANY) 것으로 본다(fsTenant의 예전 문서 규칙과 같음).
  const shipperLinkCompanies = useMemo(() => {
    const byUid = new Map(); const byCo = new Map();
    const add = (m, k, co) => { if (!k || !co) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(co); };
    allShipperApps.forEach((a) => {
      const co = String(a.linkedTransportCompany?.companyName || "").trim();
      if (!co || a.transportApprovalStatus === "rejected") return;
      add(byUid, a.userId, co);
      add(byCo, String(a.companyName || "").trim(), co);
    });
    return { byUid, byCo };
  }, [allShipperApps]);
  const shipperLinkedTo = (u, co) => {
    const own = String(u.linkedTransportCompany?.companyName || "").trim();
    const set = new Set([...(shipperLinkCompanies.byUid.get(u.id) || []), ...(shipperLinkCompanies.byCo.get(String(u.companyName || "").trim()) || [])]);
    if (own) set.add(own);
    if (!set.size) return co === DEFAULT_COMPANY;
    return set.has(co);
  };
  // 최고관리자가 회사 거르기 없이(관리센터 등) 볼 때만 화주 계정 전체
  const tenantNow = getTenant();
  // ⭐ 2026-11-05 기사앱 가입 기사(role driver)는 회원관리에 보이지 않는다(목록·승인 대기 숫자 모두) —
  //  기사 가입 승인은 기사관리 › 기사 앱 계정 › 가입 승인에서만(지입·직영·임대 지정 + 기존 기사 연동)
  const visibleUsers = useMemo(() => {
    if (isTotalMaster) {
      if (!tenantNow) return users.filter((u) => u.role !== "driver");
      return users.filter((u) => u.role !== "driver" && (u.role !== "shipper" || shipperLinkedTo(u, effectiveCompany)));
    }
    return users.filter(u =>
      u.role !== "driver" &&
      u.email !== TOTAL_MASTER_EMAIL &&
      u.role !== "totalMaster" &&
      (u.role === "shipper" ? shipperLinkedTo(u, effectiveCompany) : (u.companyName || DEFAULT_COMPANY) === effectiveCompany)
    );
  }, [users, isTotalMaster, effectiveCompany, shipperLinkCompanies, tenantNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const ROLE_ORDER = ["totalMaster", "allMgr", "hrAcct", "admin", "user", "test", "acctStaff", "hrManager", "hrStaff", "salesMgr", "salesStaff", "legalMgr", "legalStaff", "devMgr", "devStaff", "viewer", "driver", "shipper"];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleUsers
      .filter((u) => {
        const matchSearch = !q
          ? true
          : [u.email, u.name, u.phone, u.role, u.companyName].join(" ").toLowerCase().includes(q);
        const matchRole = roleFilter === "all" ? true : u.role === roleFilter;
        const matchStatus = memberStatus === "all" ? true : memberStatusOf(u) === memberStatus;
        return matchSearch && matchRole && matchStatus;
      })
      .sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a.role || "user");
        const ib = ROLE_ORDER.indexOf(b.role || "user");
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [search, visibleUsers, roleFilter, memberStatus]);

  // 연동운송사 탭 데이터
  const linkedShipperApps = useMemo(() => {
    if (isTotalMaster) {
      // 최고관리자: 1차 승인됐지만 최종 미승인인 것들
      return allShipperApps.filter(a =>
        a.transportApprovalStatus === "approved" && a.status !== "approved"
      );
    } else {
      // 운송사 관리자: 내 회사에 연결된 화주 신청 전체
      return allShipperApps.filter(a =>
        a.linkedTransportCompany?.companyName === effectiveCompany
      );
    }
  }, [allShipperApps, isTotalMaster, effectiveCompany]);

  const filteredLinked = useMemo(() => {
    const q = linkedSearch.trim().toLowerCase();
    let list = linkedShipperApps;
    if (!isTotalMaster) {
      // 운송사 관리자: 상태별 필터
      if (linkedStatusFilter === "pending") {
        list = list.filter(a => !a.transportApprovalStatus || a.transportApprovalStatus === "pending");
      } else if (linkedStatusFilter === "approved") {
        list = list.filter(a => a.transportApprovalStatus === "approved");
      } else if (linkedStatusFilter === "rejected") {
        list = list.filter(a => a.transportApprovalStatus === "rejected");
      }
    }
    if (q) {
      list = list.filter(a =>
        (a.companyName || "").toLowerCase().includes(q) ||
        (a.name || "").toLowerCase().includes(q) ||
        (a.phone || "").includes(q)
      );
    }
    return list;
  }, [linkedShipperApps, linkedSearch, linkedStatusFilter, isTotalMaster]);

  // ====== 화주사 전송 탭 ======
  // 내 회사에 연동 승인된 화주사 목록 (거래처명 매칭 대상)
  const approvedLinkedShippers = useMemo(() => {
    return allShipperApps.filter(a =>
      a.linkedTransportCompany?.companyName === effectiveCompany &&
      a.transportApprovalStatus === "approved"
    );
  }, [allShipperApps, effectiveCompany]);

  const matchedShipper = useMemo(() => {
    const q = transmitCompanyQuery.trim();
    if (!q) return null;
    return approvedLinkedShippers.find(a => (a.companyName || "").trim() === q) || null;
  }, [approvedLinkedShippers, transmitCompanyQuery]);

  // ====== 화주사 문의 탭 ======
  const linkedShipperCompanyNames = useMemo(
    () => new Set(approvedLinkedShippers.map(a => a.companyName)),
    [approvedLinkedShippers]
  );
  const myLinkedInquiries = useMemo(() => {
    return allInquiries.filter(q => {
      const author = users.find(u => u.id === q.userId);
      return author && linkedShipperCompanyNames.has(author.companyName);
    }).map(q => ({ ...q, __authorCompany: users.find(u => u.id === q.userId)?.companyName || "" }));
  }, [allInquiries, users, linkedShipperCompanyNames, isTotalMaster]);
  const unansweredInquiryCount = myLinkedInquiries.filter(q => q.status !== "답변완료").length;

  const handleReplyInquiry = async () => {
    if (isViewer) { _viewerAlert(); return; }
    if (!selectedInquiry || !inquiryReplyText.trim()) return;
    setInquiryReplying(true);
    try {
      await updateDoc(doc(db, "inquiries", selectedInquiry.id), {
        reply: inquiryReplyText.trim(),
        status: "답변완료",
        repliedAt: serverTimestamp(),
        repliedBy: me?.email || "",
      });
      setSelectedInquiry(null);
      setInquiryReplyText("");
    } catch (e) {
      alert("답변 등록 실패: " + e.message);
    } finally {
      setInquiryReplying(false);
    }
  };

  const transmitMatches = useMemo(() => {
    const q = transmitCompanyQuery.trim();
    if (!q || !transmitFromMonth || !transmitToMonth) return [];
    const fromKey = transmitFromMonth; // "YYYY-MM"
    const toKey = transmitToMonth;
    return (dispatchData || []).filter(r => {
      if ((r.거래처명 || "").trim() !== q) return false;
      const pickupDate = (r.상차일 || "").slice(0, 7);
      if (!pickupDate) return false;
      return pickupDate >= fromKey && pickupDate <= toKey;
    });
  }, [dispatchData, transmitCompanyQuery, transmitFromMonth, transmitToMonth]);

  const pendingTransmitMatches = useMemo(
    () => transmitMatches.filter(r => !r._transmittedToShipper),
    [transmitMatches]
  );
  const alreadyTransmittedCount = transmitMatches.length - pendingTransmitMatches.length;

  const combineTonString = (r) => {
    const ton = (r.차량톤수 || "").toString().trim();
    if (!ton) return "";
    if (/톤|kg|킬로/.test(ton)) return ton; // 이미 단위 포함
    const unit = (r.톤수타입 || "톤").trim();
    return `${ton}${unit}`;
  };

  const mapOrderForShipper = (r, shipperApp) => ({
    거래처명: shipperApp.companyName,
    shipperCompany: shipperApp.companyName,
    company: effectiveCompany,
    companyCode: myCompanyCode || "",
    운송사명: effectiveCompany,
    운송사코드: myCompanyCode || "",
    작성자: me?.email || "",
    상차지명: r.상차지명 || "",
    상차지주소: r.상차지주소 || "",
    상차담당자명: r.상차지담당자 || "",
    상차담당자번호: r.상차지담당자번호 || "",
    하차지명: r.하차지명 || "",
    하차지주소: r.하차지주소 || "",
    하차담당자명: r.하차지담당자 || "",
    하차담당자번호: r.하차지담당자번호 || "",
    등록일: r.등록일 || r.상차일 || "",
    상차일: r.상차일 || "",
    상차시간: r.상차시간 || "",
    상차시간구분: r.상차시간기준 || "정각",
    하차일: r.하차일 || "",
    하차시간: r.하차시간 || "",
    하차시간구분: r.하차시간기준 || "정각",
    차량종류: r.차량종류 || "",
    차량톤수: combineTonString(r),
    상차방법: r.상차방법 || "",
    하차방법: r.하차방법 || "",
    지급방식: r.지급방식 || "",
    화물내용: r.화물내용 || "",
    화물단위: r.화물타입 || "",
    청구운임: Number(r.청구운임) || 0,
    차량번호: r.차량번호 || "",
    이름: r.이름 || "",
    전화번호: r.전화번호 || "",
    배차상태: r.차량번호 ? "배차완료" : "배차중",
    경유상차목록: Array.isArray(r.경유상차목록) ? r.경유상차목록 : (Array.isArray(r.경유지_상차) ? r.경유지_상차 : []),
    경유하차목록: Array.isArray(r.경유하차목록) ? r.경유하차목록 : (Array.isArray(r.경유지_하차) ? r.경유지_하차 : []),
    source: "transport_transmit",
    originCol: r.__col || "dispatch",
    originId: r._id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const handleTransmit = async () => {
    if (isViewer) { _viewerAlert(); return; }
    if (!matchedShipper) { alert("연동 승인된 화주사 중 일치하는 거래처명이 없습니다. 화주사의 회사명과 거래처명이 정확히 일치해야 합니다."); return; }
    if (pendingTransmitMatches.length === 0) { alert("전송할 데이터가 없습니다."); return; }
    if (!await kpConfirm(`${matchedShipper.companyName}(으)로 ${pendingTransmitMatches.length}건을 전송하시겠습니까?`)) return;

    setTransmitting(true);
    let success = 0;
    let failed = 0;
    try {
      for (const r of pendingTransmitMatches) {
        try {
          const payload = mapOrderForShipper(r, matchedShipper);
          const newDocRef = await addDoc(collection(db, "orders"), payload);

          // 첨부파일 이전
          try {
            const attachSnap = await getDocs(collection(db, payload.originCol, r._id, "attachments"));
            for (const a of attachSnap.docs) {
              await setDoc(doc(db, "orders", newDocRef.id, "attachments", a.id), a.data());
            }
            if (attachSnap.size > 0) {
              await updateDoc(newDocRef, { attachCount: attachSnap.size });
            }
          } catch (e) {
            console.warn("첨부파일 이전 실패(무시하고 계속):", e);
          }

          // 하차지 → 화주사 주소록(places) 업서트
          if (payload.하차지명 && payload.하차지주소) {
            try {
              const dupKey = (payload.하차지명 || "").trim().toLowerCase();
              const existing = (places || []).find(p =>
                (p.company || "") === matchedShipper.companyName &&
                (p.name || "").trim().toLowerCase() === dupKey
              );
              if (!existing) {
                await addDoc(collection(db, "places"), {
                  name: payload.하차지명,
                  address: payload.하차지주소,
                  담당자명: payload.하차담당자명 || "",
                  담당자번호: payload.하차담당자번호 || "",
                  메모: "",
                  type: "하차",
                  company: matchedShipper.companyName,
                  userId: matchedShipper.uid || matchedShipper.userId || "",
                  createdAt: serverTimestamp(),
                });
              }
            } catch (e) {
              console.warn("주소록 이전 실패(무시하고 계속):", e);
            }
          }

          // 원본 오더에 전송 완료 표시 (중복 전송 방지)
          await updateDoc(doc(db, payload.originCol, r._id), {
            _transmittedToShipper: matchedShipper.companyName,
            _transmittedOrderId: newDocRef.id,
            _transmittedAt: Date.now(),
          });

          success++;
        } catch (e) {
          console.error("전송 실패:", r._id, e);
          failed++;
        }
      }
      setTransmitResult({ success, failed, shipper: matchedShipper.companyName });
    } finally {
      setTransmitting(false);
    }
  };

  const _viewerAlert = () => { alert("조회전용 권한으로는 수정/등록/삭제를 할 수 없습니다."); };

  // 관리 기능
  const toggleApprove = async (u) => {
    if (isViewer) return _viewerAlert();
    if (!isTotalMaster && (u.companyName || DEFAULT_COMPANY) !== effectiveCompany) return;
    const status = !u.approved;
    // 👥 2026-11-09 요금제 직원 계정 한도 — 다 찼으면 승인 막고 추가 계정 신청 안내(최고관리자는 확인 후 초과 승인)
    if (status && !["driver", "shipper"].includes(u.role) && !(await guardSeat(u.companyName || DEFAULT_COMPANY, { isSuper: isTotalMaster, by: auth.currentUser?.email || "", byName: auth.currentUser?.displayName || "" }))) return false;
    const updateData = { approved: status };
    if (u.role === "shipper" && status === true) {
      updateData.isMaster = true;
      if (!u.permissions?.master) {
        updateData.permissions = { master: true, subMaster: false, settlement: false, transport: false };
      }
    }
    await setDoc(doc(db, "users", u.id), updateData, { merge: true });
    // 기사 계정만 기사 목록 상태를 맞춘다(예전엔 직원 승인 때도 빈 기사 문서가 생겨 기사관리에 '-' 행이 보였다)
    if (u.role === "driver") await setDoc(doc(db, "drivers", u.id), { active: status, updatedAt: new Date() }, { merge: true });
    // transportApplications 상태도 동기화
    try {
      const tSnap = await getDocs(query(collection(db, "transportApplications"), where("userId", "==", u.id)));
      for (const d of tSnap.docs) {
        await updateDoc(doc(db, "transportApplications", d.id), {
          status: status ? "approved" : "pending",
          processedAt: serverTimestamp(),
        });
      }
    } catch (_) {}
    if (manageUser?.id === u.id) setManageUser(prev => ({ ...prev, approved: status }));
  };

  const removeUser = async (u) => {
    if (isViewer) return _viewerAlert();
    if (me?.uid === u.id) return alert("본인 계정은 삭제할 수 없습니다.");
    if (!isTotalMaster && (u.companyName || DEFAULT_COMPANY) !== effectiveCompany) return;
    if (!await kpConfirm(`"${u.name || u.email}" 계정을 삭제할까요?\n가입신청 내역도 함께 삭제됩니다.`, { title: "계정 삭제", okText: "삭제", danger: true })) return false;
    // ⭐ 2026-11-05 삭제 진행 창 + 가입신청 내역은 한 번에(writeBatch)
    await runDelete({ label: "계정", task: async () => {
      await deleteDoc(doc(db, "users", u.id));
      try {
        const tSnap = await getDocs(query(collection(db, "transportApplications"), where("userId", "==", u.id)));
        await commitDeletes(db, tSnap.docs.map((d) => doc(db, "transportApplications", d.id)));
      } catch (_) {}
      try {
        const cSnap = await getDocs(query(collection(db, "companyApplications"), where("userId", "==", u.id)));
        await commitDeletes(db, cSnap.docs.map((d) => doc(db, "companyApplications", d.id)));
      } catch (_) {}
    } });
    setManageUser(null);
    return true;
  };

  const openManage = (u) => {
    setManageUser(u);
    setEditName(u.name || "");
    setEditPhone(formatPhone(u.phone || ""));
    // ⭐ 2026-11-02 가입 승인 대기자는 부서·직책 기준 추천 권한으로 시작 — 임원(대표·전무·이사)이 가입하면 "관리자"로 들어와
    //  권한 필터 "임원관리자"에 안 잡히던 문제(가입 화면은 회사별 권한 목록을 몰라 관리자로 저장됨)
    setEditRole(u.approved === false && u.employmentStatus !== "퇴사" && u.role !== "totalMaster" ? suggestR(u) : (u.role || "user"));
    setEditScope(normScope(u.workScope));
    setEditCompany(u.companyName || "");
    setEditPosition(u.position || "");
    setEditTeam(u.team || "");
    setEditWorkStart(u.workStartTime || "09:00");
    setEditWorkEnd(u.workEndTime || "18:00");
    setEditMode(false);
  };

  const saveEdit = async () => {
    if (isViewer) return _viewerAlert();
    if (!editName.trim()) return alert("이름을 입력하세요.");
    // ⭐ 2026-10-27 — 최고관리자 외에는 회원관리에서 본인의 이름·핸드폰번호만 고칠 수 있다(직책·부서·권한은 인사관리부 › 인사발령)
    if (!canEditMember(manageUser)) {
      if (me?.uid !== manageUser.id) return alert("본인 정보만 수정할 수 있습니다.");
      const mine = { name: editName.trim(), phone: editPhone.trim() };
      try {
        await setDoc(doc(db, "users", manageUser.id), mine, { merge: true });
        setManageUser(prev => ({ ...prev, ...mine }));
        setEditMode(false);
      } catch { alert("저장 중 오류가 발생했습니다."); }
      return;
    }
    if (editRole === "totalMaster" && !isTotalMaster) return alert("totalMaster 권한은 부여할 수 없습니다.");
    // ⭐ 2026-10-31 임원도 권한 관리의 역할을 그대로(임원 화면은 "임원 화면" 역할만)
    if (editRole !== manageUser.role && !assignableRoles().includes(editRole)) return alert("이 권한은 지정할 수 없습니다. 마스터에게 요청해 주세요.");
    if (!isTotalMaster && (manageUser.companyName || DEFAULT_COMPANY) !== effectiveCompany) return alert("우리 회사 직원만 수정할 수 있습니다.");
    const history = [...(manageUser.personnelHistory || [])];
    const prevPosition = manageUser.position || "";
    const lockHr = hrLocked(manageUser);
    const nextPosition = lockHr ? prevPosition : editPosition.trim();
    const nextTeam = lockHr ? (manageUser.team || "") : editTeam;
    if (prevPosition !== nextPosition && nextPosition) {
      history.push({ date: todayStr(), type: "직책변경", detail: `${prevPosition || "(미지정)"} → ${nextPosition}` });
    }
    const prevTeam = manageUser.team || "";
    if (prevTeam !== nextTeam && nextTeam) {
      history.push({ date: todayStr(), type: "부서변경", detail: `${prevTeam || "미배정"} → ${nextTeam}` });
    }
    if (normScope(manageUser.workScope) !== editScope) history.push({ date: todayStr(), type: "업무 범위 변경", detail: `${workScopeLabel(manageUser.workScope)} → ${workScopeLabel(editScope)}` });
    if ((manageUser.role || "") !== editRole) history.push({ date: todayStr(), type: "권한변경", detail: `${roleLabels[manageUser.role] || manageUser.role || "-"} → ${roleLabels[editRole] || editRole}` });
    const payload = {
      name: editName.trim(),
      phone: editPhone.trim(),
      role: editRole,
      workScope: editScope,
      companyName: isTotalMaster ? editCompany.trim() : (manageUser.companyName || effectiveCompany),
      position: nextPosition,
      team: nextTeam,
      workStartTime: editWorkStart || "09:00",
      workEndTime: editWorkEnd || "18:00",
      personnelHistory: history,
    };
    try {
      await setDoc(doc(db, "users", manageUser.id), payload, { merge: true });
      setManageUser(prev => ({ ...prev, ...payload }));
      setEditMode(false);
    } catch (err) {
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const setResignStatus = async (u, resign) => {
    if (isViewer) return _viewerAlert();
    if (hrLocked(u)) return alert("인사 담당자가 있어 퇴사·복직 처리는 인사팀(인사관리부 › 인사관리 › 직원관리)에서 합니다.");
    if (resign) {
      if (!await kpConfirm(`"${u.name || u.email}" 계정을 퇴사 처리하시겠습니까?\n퇴사 처리된 계정은 즉시 로그인이 차단됩니다.`)) return;
    }
    const history = [...(u.personnelHistory || []), { date: todayStr(), type: resign ? "퇴사" : "복직", detail: resign ? "퇴사 처리" : "복직 처리" }];
    const payload = resign
      ? { employmentStatus: "퇴사", resignedAt: todayStr(), personnelHistory: history }
      : { employmentStatus: "재직", resignedAt: null, personnelHistory: history };
    try {
      await setDoc(doc(db, "users", u.id), payload, { merge: true });
      if (manageUser?.id === u.id) setManageUser(prev => ({ ...prev, ...payload }));
    } catch (err) {
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  // 운송사 관리자 1차 승인
  const approveShipper1st = async (app) => {
    if (isViewer) return _viewerAlert();
    const myName = users.find(u => u.id === me?.uid)?.name || me?.email || "관리자";
    // ⚠️ 1차 승인은 운송사 관리자 확인일 뿐 — 최종 로그인 허용(users.approved)과
    // companyApplications.status="approved"는 최고관리자의 2차 승인(approveShipper2nd)에서만
    // 설정해야 한다. 여기서 같이 켜버리면 1차만 하고도 로그인이 되고, 최고관리자의
    // "2차 승인 대기" 목록(status !== "approved" 조건)에서도 즉시 빠져버린다.
    await updateDoc(doc(db, "companyApplications", app.id), {
      transportApprovalStatus: "approved",
      transportApprovedAt: serverTimestamp(),
      transportApprovedBy: myName,
    });
    setManagingLinkedApp(prev => prev ? { ...prev, transportApprovalStatus: "approved", transportApprovedBy: myName } : null);
  };

  // 운송사 관리자 1차 거절
  const rejectShipper1st = async (app, reason) => {
    if (isViewer) return _viewerAlert();
    await updateDoc(doc(db, "companyApplications", app.id), {
      transportApprovalStatus: "rejected",
      transportRejectionReason: reason || "",
      transportApprovedAt: serverTimestamp(),
    });
    setShowRejectLinked(false);
    setRejectLinkedReason("");
    setManagingLinkedApp(null);
  };

  // 최고관리자 2차 최종 승인
  const approveShipper2nd = async (app) => {
    if (isViewer) return _viewerAlert();
    let companyCode = app.companyCode;
    if (!companyCode) {
      if (app.type === "기존") {
        const parent = allShipperApps.find(
          a => a.companyName === app.companyName && a.type === "신규" && a.status === "approved" && a.companyCode
        );
        companyCode = parent?.companyCode || generateCompanyCode();
      } else {
        companyCode = generateCompanyCode();
      }
    }
    await updateDoc(doc(db, "companyApplications", app.id), {
      status: "approved",
      companyCode,
      processedAt: serverTimestamp(),
    });
    if (app.userId) {
      const isFirstMaster = app.type === "신규";
      const updatePayload = {
        approved: true,
        companyCode,
        companyName: app.companyName,
        businessNumber: app.businessNumber || "",
      };
      if (isFirstMaster) {
        updatePayload.permissions = { master: true, subMaster: false, settlement: false, transport: false };
      }
      await updateDoc(doc(db, "users", app.userId), updatePayload);
    }
    setManagingLinkedApp(null);
  };

  // 최고관리자 2차 거절
  const rejectShipper2nd = async (app, reason) => {
    if (isViewer) return _viewerAlert();
    await updateDoc(doc(db, "companyApplications", app.id), {
      status: "rejected",
      rejectionReason: reason || "",
      processedAt: serverTimestamp(),
    });
    setShowRejectLinked(false);
    setRejectLinkedReason("");
    setManagingLinkedApp(null);
  };

  const linkedPendingCount = isTotalMaster
    ? linkedShipperApps.length
    : linkedShipperApps.filter(a => !a.transportApprovalStatus || a.transportApprovalStatus === "pending").length;

  // ⭐ 관리자메뉴 상단 버튼이 한 줄에 9개까지 늘어서 지저분해 보인다는 요청 —
  // 관련 있는 것끼리 묶어 "그룹(1단 탭) 안에 하위 탭(2단 탭)" 구조로 재구성했다.
  // REQUIRES_MASTER에 있는 하위 탭은 최고관리자에게만 보인다(기존 isTotalMaster
  // 게이팅과 동일한 기준을 그대로 옮긴 것 — 권한 자체는 안 바뀜).
  const DEPT_ADMIN_TABS = { acct: ["members", "billing", "setup"], hr: ["members", "loginSessions", "setup"] }; // ⭐ 2026-11-01 경리·인사도 초기 설정(그 팀 것만)
  const billingAcc = billingAccess(meDoc, { totalMaster: isTotalMaster, role: myRoleEff, viewer: isViewer });
  const REQUIRES_MASTER_TABS = new Set([
    "landingInquiries", "sessionLogs", "permissions",
    "landingEdit", "notifTemplate", "companyReset",
  ]);
  const TAB_LABELS = {
    members: "회원 관리",
    linked: "연동 화주사",
    transmit: "화주사 전송",
    inquiries: "화주사 문의",
    landingInquiries: "도입 문의",
    loginSessions: "로그인 관리",
    sessionLogs: "접속이력",
    sheetHub: "구글시트 연동",
    trash: "휴지통",
    dataCheck: "데이터 점검",
    permissions: "권한 관리",
    landingEdit: "랜딩페이지 편집",
    notifTemplate: "알림 문구 설정",
    setup: "초기 설정 · 튜토리얼",
    billing: "구독 · 결제",
    copyTemplate: "기사복사 문구",
  };
  const tabGroups = [
    { key: "members", label: "회원 관리", tabs: ["members"] },
    { key: "shipperMgmt", label: "화주사 관리", tabs: ["linked", "transmit", "inquiries", "landingInquiries"] },
    { key: "ops", label: "운영 관리", tabs: ["loginSessions", "sessionLogs", "permissions", "sheetHub", "dataCheck"] }, // ⭐ 2026-11-06 운송사 초기화는 관리자 관리센터(보안·데이터 › 운송사 초기화)로만 옮김 · 🔗 2026-11-07 구글시트 메뉴 셋 → "구글시트 연동" 하나 · 블라인드 모드 · 화주사 강제 업데이트는 뺌(강제 업데이트는 관리센터에 남음)
    { key: "settings", label: "환경 설정", tabs: ["billing", "setup", "copyTemplate", "landingEdit", "notifTemplate"] },
  ]
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => (!REQUIRES_MASTER_TABS.has(t) || isTotalMaster || (t === "permissions" && masterPerms)) && (t !== "billing" || billingAcc.view) && (t !== "sheetHub" || isTotalMaster || ["admin", "allMgr"].includes(myRoleEff)) && (t !== "dataCheck" || isTotalMaster || ["admin", "allMgr"].includes(myRoleEff))) })) // 💳 구독·결제는 경리·재무·임원·대표만(billingAccess.js)
    // 🏢 부서 관리자메뉴 — 경리: 회원 승인 + 구독·결제 / 인사: 회원(인사권) + 로그인 관리. 배차용(기사복사 문구·화주사 등)은 뺀다
    .map((g) => (deptMode ? { ...g, tabs: g.tabs.filter((t) => (DEPT_ADMIN_TABS[deptMode] || []).includes(t) || (t === "billing" && billingAcc.view)) } : g))
    .filter((g) => g.tabs.length > 0);
  const activeGroup = tabGroups.find((g) => g.tabs.includes(adminTab)) || tabGroups[0];
  // ⭐ 2026-11-01 회원 관리 탭에도 가입 승인 대기 숫자
  const membersPendingCount = visibleUsers.filter(isPending).length;
  const tabBadgeCounts = { members: membersPendingCount, linked: linkedPendingCount, inquiries: unansweredInquiryCount, landingInquiries: newLandingInquiryCount };
  const groupBadgeTotal = (g) => g.tabs.reduce((sum, t) => sum + (tabBadgeCounts[t] || 0), 0);

  // ⭐ 디자인 개편 — 왼쪽 메뉴바(그룹별) + 상단 인사 카드 + 숫자 카드(AdminShell 공용 레이아웃)
  const TAB_ICONS = {
    members: "users", linked: "link", transmit: "send", inquiries: "chat", landingInquiries: "inbox",
    loginSessions: "phone", companyReset: "trash", sheetHub: "sheet", trash: "trash", sessionLogs: "history", permissions: "key", dataCheck: "check",
    landingEdit: "globe", notifTemplate: "bell", setup: "check", copyTemplate: "list", billing: "money",
  };
  const shellGroups = tabGroups.map((g) => ({
    label: g.label,
    items: g.tabs.map((t) => ({ key: t, label: TAB_LABELS[t], icon: TAB_ICONS[t], badge: tabBadgeCounts[t] || 0 })),
  }));
  const myDisplayName = users.find((u) => u.id === me?.uid)?.name || me?.email || "관리자";
  // ⭐ 2026-11-02 점검 — 예전 승인 계정·퇴사·삭제 계정을 승인 대기로 세던 문제(사이드바 배지와 같은 기준)
  const pendingUserCount = visibleUsers.filter(isPending).length;
  const todoCount = pendingUserCount + (linkedPendingCount || 0) + (unansweredInquiryCount || 0);

  return (
    <AdminShell
      badgeLabel="ADMIN"
      title={`${myDisplayName}님`}
      groups={shellGroups}
      active={adminTab}
      onSelect={setAdminTab}
      heroTitle={`안녕하세요, ${myDisplayName}님`}
      heroSubtitle={deptMode ? (pendingUserCount > 0 ? `가입 승인 대기 ${pendingUserCount}명이 있어요 — 회원 관리에서 직책·부서·권한을 정하고 승인해 주세요` : `${deptMode === "hr" ? "인사" : "경리"} 관리자메뉴 — 가입 승인 대기가 없습니다`) : todoCount > 0 ? `처리할 일이 ${todoCount}건 있어요 — 승인 대기 ${pendingUserCount} · 연동 대기 ${linkedPendingCount || 0} · 미답변 문의 ${unansweredInquiryCount || 0}` : "처리할 일이 모두 끝났어요. 수고하셨어요!"}
      heroActions={[{ label: showMobilePreview ? "모바일 미리보기 닫기" : "모바일 미리보기", icon: "phone", active: showMobilePreview, onClick: () => setShowMobilePreview((v) => !v) }]}
      stats={[
        { label: "전체 사용자", value: visibleUsers.length, icon: "users", tone: "navy" },
        { label: "승인 완료", value: visibleUsers.filter((u) => u.approved !== false).length /* ⭐ 2026-11-02 점검 — approved 필드 없는 예전 계정도 승인 완료로 */, icon: "check", tone: "green" },
        { label: "승인 대기", value: pendingUserCount, icon: "hourglass", tone: "amber" },
        deptMode
          ? { label: "퇴사", value: visibleUsers.filter((u) => u.employmentStatus === "퇴사").length, icon: "user", tone: "violet" }
          : { label: "연동 대기 화주사", value: linkedPendingCount || 0, icon: "link", tone: "violet" },
      ]}
    >

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">

          {/* ====== 회원 관리 탭 (목록 + 상세) — 2026-10-23 리디자인: 왼쪽 회원 목록(이니셜 아바타) + 오른쪽 디지털 명함 ====== */}
          {adminTab === "members" && (() => {
            const initials = (u) => String(u.name || u.email || "?").trim().slice(0, u.name ? 1 : 2).toUpperCase();
            const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
            return (
            <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start" style={{ minHeight: 600 }}>
              {/* 좌측 회원 목록 */}
              <div className={`min-w-0 flex flex-col overflow-hidden lg:sticky lg:top-2 ${CARD}`} style={{ maxHeight: "max(600px, calc(100vh - 120px))" }}>
                <div className="px-4 pt-4 pb-3 border-b border-[#EEF1F6] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">MEMBERS</div>
                      <div className="text-[17px] font-black text-[#0F1A30]">회원 목록</div>
                    </div>
                    <span className="px-2.5 h-7 inline-flex items-center rounded-full bg-[#F5F8FD] border border-[#E3E8F0] text-[12px] font-extrabold text-[#1B2B4B] tabular-nums">{filtered.length}명</span>
                  </div>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-[#DCE3EE] bg-white focus-within:border-[#4B6CB7] focus-within:ring-4 focus-within:ring-[#4B6CB7]/10 transition">
                    <svg className="w-4 h-4 text-[#9AA9C3] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 · 이메일 · 회사명 검색"
                      className="flex-1 min-w-0 text-[14px] font-semibold text-[#0F1A30] outline-none bg-transparent placeholder:text-[#A7B3C6]" />
                  </div>
                  <CustomSelect
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded-xl text-[13px] font-bold border border-[#DCE3EE] bg-white text-[#1F2A44] outline-none cursor-pointer appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237A879C' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                  >
                    <option value="all">전체 권한</option>
                    {ROLES.filter((r) => r !== "driver").map(r => ( /* ⭐ 2026-11-05 기사는 회원관리에서 뺌 */
                      <option key={r} value={r}>{roleLabels[r] || r}</option>
                    ))}
                  </CustomSelect>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#F2F5FA]">
                    {[["all", "전체"], ["승인", "승인"], ["대기", "대기"], ["퇴사", "퇴사"]].map(([k, l]) => {
                      const n = k === "all" ? visibleUsers.length : visibleUsers.filter((u) => memberStatusOf(u) === k).length;
                      return (
                        <button key={k} type="button" onClick={() => setMemberStatus(k)}
                          className={`h-9 rounded-lg text-[13px] font-bold transition inline-flex items-center justify-center gap-1 ${memberStatus === k ? "bg-white text-[#0F1A30] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_10px_rgba(16,24,40,0.06)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>
                          {l}<span className={`text-[12px] tabular-nums ${memberStatus === k ? "text-[#4B6CB7]" : "text-[#9AA9C3]"}`}>{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                  {filtered.length === 0 ? (
                    <div className="py-16 text-center text-[13px] text-[#9AA9C3]">검색 결과가 없습니다</div>
                  ) : (() => {
                    // ⭐ 부서(팀)별로 묶어서 보여준다 — 팀 이름순, 미배정은 맨 아래
                    const groups = new Map();
                    filtered.forEach((u) => { const t = String(u.team || "").trim() || "미배정"; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(u); });
                    const names = [...groups.keys()].sort((a, b) => (a === "미배정") - (b === "미배정") || a.localeCompare(b, "ko"));
                    return names.map((t) => (
                      <div key={t} className="mb-2">
                        <div className="sticky top-0 z-[1] flex items-center justify-between px-3 py-1.5 mb-0.5 bg-white/95">
                          <span className="text-[12px] font-black tracking-wide text-[#1B2B4B]">{t}</span>
                          <span className="text-[11.5px] font-bold text-[#9AA9C3] tabular-nums">{groups.get(t).length}명</span>
                        </div>
                        {groups.get(t).map(u => {
                    const isMe = me?.uid === u.id;
                    const resigned = u.employmentStatus === "퇴사";
                    const on = manageUser?.id === u.id;
                    return (
                      <button key={u.id} onClick={() => openManage(u)}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-2xl transition mb-0.5 ${on ? "bg-[#0F1A30] text-white shadow-[0_8px_18px_rgba(15,26,48,0.25)]" : "hover:bg-[#F5F8FD]"} ${resigned && !on ? "opacity-50" : ""}`}>
                        <span className={`w-10 h-10 rounded-[14px] flex items-center justify-center text-[14px] font-black shrink-0 ${on ? "bg-white text-[#0F1A30]" : "text-white"}`}
                          style={on ? undefined : { background: "linear-gradient(135deg, #1B2B4B 0%, #2D4C82 100%)" }}>{initials(u)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[14px] font-extrabold truncate ${on ? "text-white" : "text-[#0F1A30]"}`}>{u.name || u.email}</span>
                            {isMe && <span className={`text-[10px] font-extrabold px-1.5 rounded ${on ? "bg-white/15 text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>나</span>}
                            {u.isMaster && u.role !== "shipper" && <span className={`text-[10px] font-extrabold px-1.5 rounded whitespace-nowrap ${on ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white"}`}>마스터</span>}
                          </span>
                          <span className={`block text-[11.5px] truncate ${on ? "text-white/60" : "text-[#7A879C]"}`}>{[u.position, roleLabels[u.role || "user"] || u.role].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={`shrink-0 text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${
                          resigned ? (on ? "bg-white/10 text-white/70" : "bg-[#F1F4F9] text-[#7A879C]")
                            : u.approved !== false ? (on ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white") /* ⭐ 2026-11-02 점검 — 예전 계정(approved 없음)은 승인 */
                            : (on ? "border border-white/40 text-white" : "border border-[#9AA9C3] text-[#3A4A66]")
                        }`}>{resigned ? "퇴사" : u.approved !== false ? "승인" : "대기"}</span>
                      </button>
                    );
                  })}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* 우측 — 디지털 명함 + 상세 */}
              <div className="flex-1 min-w-0">
                {!manageUser ? (
                  <div className={`h-full flex flex-col items-center justify-center py-28 ${CARD}`}>
                    <div className="w-14 h-14 rounded-2xl bg-[#EEF3FB] text-[#1B2B4B] flex items-center justify-center mb-3">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16c.5-1.6 1.9-2.5 3.5-2.5s3 .9 3.5 2.5M15 10h3M15 13h3" /></svg>
                    </div>
                    <div className="text-[15px] font-extrabold text-[#0F1A30]">회원을 선택하세요</div>
                    <div className="text-[13px] text-[#7A879C] mt-1">왼쪽 목록에서 고르면 명함과 상세 정보가 보입니다</div>
                  </div>
                ) : (() => {
                  const u = manageUser;
                  const canManage = isTotalMaster || (u.companyName || DEFAULT_COMPANY) === effectiveCompany;
                  const resigned = u.employmentStatus === "퇴사";
                  return (
                    <div className="space-y-4">
                      {/* 디지털 명함 */}
                      <div className="relative overflow-hidden rounded-[24px] px-7 py-6 text-white shadow-[0_18px_40px_rgba(15,26,48,0.28)]"
                        style={{ background: "linear-gradient(125deg, #0F1A30 0%, #1B2B4B 52%, #2D4C82 100%)" }}>
                        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.05]" />
                        <div className="absolute right-24 -bottom-28 w-60 h-60 rounded-full bg-white/[0.04]" />
                        <div className="relative flex items-start gap-5">
                          <div className="w-[76px] h-[76px] rounded-[22px] bg-white text-[#0F1A30] flex items-center justify-center text-[28px] font-black shadow-[0_10px_24px_rgba(0,0,0,0.25)] shrink-0">{initials(u)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">{(u.companyName || DEFAULT_COMPANY).toUpperCase()}</div>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <h3 className="text-[26px] font-black tracking-tight leading-tight">{u.name || u.email}</h3>
                              {u.email === TOTAL_MASTER_EMAIL && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 font-bold">총마스터</span>}
                              {u.subAdmin === true && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#8FB0F0] text-[#0B1428] font-black" data-subadmin-badge>부관리자</span>}
                              {resigned && <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/30 font-bold">퇴사 {u.resignedAt || ""}</span>}
                            </div>
                            <div className="text-[14px] font-semibold text-white/75 mt-0.5">{[u.position, u.team || "미배정"].filter(Boolean).join(" · ")}</div>
                            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13.5px]">
                              <span className="inline-flex items-center gap-2 text-white/90">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
                                {u.phone ? formatPhone(u.phone) : "-"}
                              </span>
                              <span className="inline-flex items-center gap-2 text-white/90">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                                {u.email}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-extrabold ${u.approved !== false && !resigned ? "bg-white text-[#0F1A30]" : "bg-white/10 text-white border border-white/25"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.approved !== false && !resigned ? "bg-[#0F1A30]" : "bg-white/70"}`} />
                              {/* ⭐ 2026-11-02 점검 — 예전 계정(approved 없음)을 승인 대기로 표시하던 문제 */}
                              {resigned ? "퇴사" : u.approved !== false ? "승인 완료" : "승인 대기"}
                            </span>
                            <div className="mt-2 text-[12px] font-bold text-white/60">{roleLabels[u.role] || u.role || "-"}</div>
                          </div>
                        </div>
                      </div>

                      <div className={CARD}>
                        {/* 버튼 줄 */}
                        <div className="px-6 py-4 border-b border-[#EEF1F6] flex flex-wrap items-center gap-2">
                          <div className="mr-auto">
                            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">PROFILE</div>
                            <div className="text-[17px] font-black text-[#0F1A30]">{editMode ? "정보 수정" : "회원 정보"}</div>
                          </div>
                          {/* ⭐ 승인·수정·퇴사·삭제는 최고관리자만. 그 외에는 본인 이름·핸드폰번호만 수정 */}
                          {!canEditMember(u) && me?.uid === u.id && !editMode && (
                            <button onClick={() => setEditMode(true)} className="h-10 px-4 rounded-xl text-[13px] font-extrabold bg-[#0F1A30] text-white hover:bg-[#1B2B4B] transition">수정</button>
                          )}
                          {!canEditMember(u) && me?.uid !== u.id && !editMode && (
                            <span className="text-[12px] font-bold text-[#9AA9C3]">직책·부서·권한 변경은 인사관리부 › 인사발령</span>
                          )}
                          {canDelegateMaster(u) && !editMode && (
                            <button onClick={() => delegateMaster(u)} title="이 직원에게 마스터를 넘기고 본인은 마스터에서 빠집니다"
                              className="h-10 px-4 rounded-xl text-[13px] font-extrabold border border-[#0F1A30] text-[#0F1A30] hover:bg-[#F5F8FD] transition whitespace-nowrap">👑 마스터 위임</button>
                          )}
                          {/* ⭐ 버튼은 하나 — 승인 전엔 "승인·거절", 승인 후엔 "정보 수정". 누르면 창 안에서 승인·거절·수정·마스터·퇴사·삭제 */}
                          {canEditMember(u) && canManage && !editMode && (
                            <button onClick={() => { openManage(u); setMemberModal(true); }}
                              className={`h-10 px-5 rounded-xl text-[13px] font-extrabold transition whitespace-nowrap ${u.approved === false && !resigned ? "bg-[#2D4C82] text-white hover:bg-[#1B2B4B]" : "bg-[#0F1A30] text-white hover:bg-[#1B2B4B]"}`}>
                              {/* ⭐ 2026-11-02 점검 — 예전 승인 계정에 "승인 · 거절"이 뜨던 문제 */}
                              {u.approved === false && !resigned ? "승인 · 거절" : "정보 수정"}
                            </button>
                          )}
                        </div>

                      {!(editMode && !memberModal) ? (
                        <div className="px-6 py-5">
                          <div className="grid grid-cols-3 gap-2.5">
                            {[
                              ["이름", u.name || "-"],
                              ["직책", u.position || "-"],
                              ["부서", u.team || "미배정"],
                              ["연락처", u.phone ? formatPhone(u.phone) : "-"],
                              ["권한", roleLabels[u.role] || u.role || "-"],
                              ["회사명", u.companyName || "-"],
                            ].map(([label, value]) => (
                              <div key={label} className="px-4 py-3 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] min-w-0">
                                <div className="text-[11.5px] font-bold text-[#7A879C]"><EditableText id={`adminMenu.members.infoLabel.${label}`} defaultText={label} /></div>
                                <div className="text-[15px] font-extrabold text-[#0F1A30] truncate mt-0.5">{value}</div>
                              </div>
                            ))}
                          </div>

                          {/* 인사발령 이력 — 타임라인 */}
                          <div className="mt-6">
                            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7] mb-2"><EditableText id="adminMenu.members.인사발령이력" defaultText="인사발령 이력" /></div>
                            {(u.personnelHistory || []).length === 0 ? (
                              <div className="px-4 py-6 rounded-2xl border border-dashed border-[#DCE3EE] text-center text-[13px] text-[#9AA9C3]">등록된 발령 이력이 없습니다</div>
                            ) : (
                              <div className="relative pl-6">
                                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#DCE3EE]" />
                                {[...(u.personnelHistory || [])].reverse().map((h, i) => (
                                  <div key={i} className="relative py-2">
                                    <span className={`absolute -left-[22px] top-3.5 w-3 h-3 rounded-full ${i === 0 ? "bg-[#0F1A30] ring-4 ring-[#EEF3FB]" : "bg-white border-2 border-[#9AA9C3]"}`} />
                                    <div className="flex items-baseline gap-3">
                                      <span className="text-[12.5px] font-bold text-[#7A879C] tabular-nums w-24 shrink-0">{h.date}</span>
                                      <span className="text-[13px] font-extrabold text-[#0F1A30] shrink-0">{h.type}</span>
                                      <span className="text-[13px] text-[#3A4A66] truncate">{h.detail}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="px-6 py-5">
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">회사명</label>
                              <input value={editCompany} onChange={e => setEditCompany(e.target.value)} disabled={!isTotalMaster}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10" />
                            </div>
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">이름</label>
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10" />
                            </div>
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">직책</label>
                              <CustomSelect value={editPosition} onChange={e => onPositionChange(e.target.value)} disabled={!canEditMember(u) || hrLocked(u)}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 bg-white">
                                <option value="">선택 안 함</option>
                                {(editPosition && !positionsForTeam(editTeam).includes(editPosition)) && (
                                  <option value={editPosition}>{editPosition}</option>
                                )}
                                {positionsForTeam(editTeam).map(p => <option key={p} value={p}>{p}</option>)}
                              </CustomSelect>
                            </div>
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">부서</label>
                              <CustomSelect value={editTeam} onChange={e => onTeamChange(e.target.value)} disabled={!canEditMember(u) || hrLocked(u)}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 bg-white">
                                <option value="">미배정</option>
                                {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                              </CustomSelect>
                            </div>
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">핸드폰번호</label>
                              <input value={editPhone}
                                inputMode="tel" onChange={e => setEditPhone(fmtPhone(e.target.value))}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10" />
                            </div>
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">권한</label>
                              <CustomSelect value={editRole} onChange={e => setEditRole(e.target.value)} disabled={!canEditMember(u)}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 bg-white">
                                {assignableRoles(editRole, editTeam).map(r => <option key={r} value={r}>{roleLabels[r] || r}</option>)}
                              </CustomSelect>
                              <p className="mt-1 text-[11px] font-bold text-[#7A879C]">{`추천: ${roleLabels[suggestR({ team: editTeam, position: editPosition })] || ROLE_NAME[suggestR({ team: editTeam, position: editPosition })]} (부서·직책 기준)`}</p>
                            </div>
                            <div>
                              <label className="block text-[11.5px] font-bold text-[#7A879C] mb-1.5">업무 범위</label>
                              <CustomSelect value={editScope} onChange={e => setEditScope(e.target.value)} disabled={!canEditMember(u)}
                                className="w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 bg-white">
                                {WORK_SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </CustomSelect>
                              <p className="mt-1 text-[11px] font-bold text-[#7A879C]">{(WORK_SCOPES.find(([k]) => k === editScope) || WORK_SCOPES[0])[2]}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditMode(false)}
                              className="flex-1 h-11 rounded-xl border border-[#E3E8F0] text-[13.5px] font-bold text-[#3A4A66] hover:bg-[#F5F8FD] transition">
                              취소
                            </button>
                            <button onClick={saveEdit}
                              className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-extrabold hover:bg-[#1B2B4B] transition">
                              저장
                            </button>
                          </div>
                        </div>
                      )}
                      </div>
                      {memberModal && canEditMember(u) && canManage && (
                        <MemberManageModal
                          u={u} me={me} isTotalMaster={isTotalMaster} roles={assignableRoles(editRole, editTeam)} roleLabels={roleLabels}
                          canMaster={isTotalMaster} canAccount={isTotalMaster} canDelete={isTotalMaster} hrOpt={hrOpt} hrLock={hrLocked(u)}
                          f={{ editScope, setEditScope, editName, setEditName, editPhone, setEditPhone, editRole, setEditRole, editCompany, setEditCompany, editWorkStart, setEditWorkStart, editWorkEnd, setEditWorkEnd, editPosition, setEditPosition: onPositionChange, editTeam, setEditTeam: onTeamChange, suggestR }}
                          onClose={() => { setMemberModal(false); setEditMode(false); }}
                          onSave={async () => { await saveEdit(); setMemberModal(false); }}
                          onApprove={async () => {
                            if (!await kpConfirm(`"${u.name || u.email}"님을 승인할까요?\n입력한 직책·부서·권한으로 저장되고 바로 로그인할 수 있습니다.`)) return;
                            await saveEdit(); if ((await toggleApprove({ ...u, approved: false })) === false) return; setMemberModal(false);
                          }}
                          onUnapprove={async () => { if (await kpConfirm(`"${u.name || u.email}"님의 승인을 해제할까요?\n해제하면 로그인이 막힙니다.`)) await toggleApprove({ ...u, approved: true }); }}
                          onReject={async () => { if (await removeUser(u)) setMemberModal(false); }}
                          onMaster={() => toggleMaster(u)}
                          canSubAdmin={isSuperMe && u.email !== TOTAL_MASTER_EMAIL && u.role !== "shipper" && u.role !== "driver"} onSubAdmin={() => toggleSubAdmin(u)}
                          onResign={async () => { if (resigned && !await kpConfirm(`"${u.name || u.email}"님을 복직 처리할까요?`)) return; await setResignStatus(u, !resigned); }}
                          onDelete={async () => { if (await removeUser(u)) setMemberModal(false); }}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            );
          })()}

          {/* ====== 연동 화주사 탭 ====== */}
          {adminTab === "linked" && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {!isTotalMaster && (
                    <div className="flex gap-1.5">
                      {[["pending", "승인 대기"], ["approved", "1차 승인"], ["rejected", "거절"], ["all", "전체"]].map(([v, l]) => (
                        <button key={v} onClick={() => setLinkedStatusFilter(v)}
                          className={`h-8 px-3.5 rounded-full text-[12px] font-semibold border transition ${linkedStatusFilter === v ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-[#DCE3EE] hover:bg-gray-50"}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl overflow-hidden bg-white min-w-[200px] max-w-[280px] focus-within:border-[#1B2B4B] transition">
                    <svg className="ml-3 w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input value={linkedSearch} onChange={e => setLinkedSearch(e.target.value)}
                      placeholder="회사명·이름 검색"
                      className="flex-1 px-2 py-2 text-[13px] outline-none" />
                  </div>
                  <div className="ml-auto text-[13px] text-gray-500">{filteredLinked.length}건</div>
                </div>
              </div>

              {isTotalMaster && filteredLinked.length > 0 && (
                <div className="bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B] shrink-0" />
                  <span className="text-[13px] font-semibold text-[#1B2B4B]">운송사 1차 승인 완료 — 최종 승인 대기 중인 화주사입니다.</span>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B]">
                      {(isTotalMaster
                        ? ["신청일시", "유형", "화주사명", "이름", "연락처", "연결 운송사", "1차 승인자", "상태", "관리"]
                        : ["신청일시", "유형", "화주사명", "이름", "연락처", "상태", "관리"]
                      ).map(h => (
                        <th key={h} className="px-3 py-3 text-center text-[12px] font-semibold text-white whitespace-nowrap"><EditableText id={`adminMenu.applyTable.header.${h}`} defaultText={h} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLinked.length === 0 ? (
                      <tr>
                        <td colSpan={isTotalMaster ? 9 : 7} className="py-16 text-center text-[13px] text-gray-500">
                          {isTotalMaster ? "2차 승인 대기 중인 화주사가 없습니다" : "연동된 화주사 신청이 없습니다"}
                        </td>
                      </tr>
                    ) : filteredLinked.map((app, idx) => {
                      const tStatus = app.transportApprovalStatus || "pending";
                      return (
                        <tr key={app.id} className={`hover:bg-blue-50/30 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                          <td className="px-3 py-3 text-center text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(app.createdAt)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${app.type === "신규" ? "bg-[#1B2B4B]/10 text-[#1B2B4B] border-[#1B2B4B]/20" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {app.type}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-gray-800">{app.companyName}</td>
                          <td className="px-3 py-3 text-center text-gray-700">
                            <div>{app.name}</div>
                            {app.linkedTransportCompany?.companyName && (
                              <span className="text-[11px] text-blue-600">연동: {app.linkedTransportCompany.companyName}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-gray-500 text-[12px]">{app.phone ? formatPhone(app.phone) : app.phone}</td>
                          {isTotalMaster && (
                            <>
                              <td className="px-3 py-3 text-center text-[12px] text-gray-600">{app.linkedTransportCompany?.companyName || "-"}</td>
                              <td className="px-3 py-3 text-center text-[12px] text-gray-600">{app.transportApprovedBy || "-"}</td>
                            </>
                          )}
                          <td className="px-3 py-3 text-center">
                            {isTotalMaster ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-[#1B2B4B]/10 text-[#1B2B4B] border-[#1B2B4B]/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B]" />
                                2차 승인 필요
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                                tStatus === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                tStatus === "rejected" ? "bg-red-50 text-red-600 border-red-200" :
                                "bg-gray-100 text-gray-500 border-gray-200"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${tStatus === "approved" ? "bg-emerald-500" : tStatus === "rejected" ? "bg-red-400" : "bg-gray-400"}`} />
                                {tStatus === "approved" ? "1차 승인" : tStatus === "rejected" ? "거절" : "대기"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => setManagingLinkedApp(app)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                            >
                              관리
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ====== 화주사 전송 탭 ====== */}
          {adminTab === "transmit" && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-4">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">화주사로 오더 전송</div>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">거래처명</div>
                    <input
                      value={transmitCompanyQuery}
                      onChange={e => { setTransmitCompanyQuery(e.target.value); setTransmitSearched(false); setTransmitResult(null); }}
                      placeholder="예) ○○물류단지"
                      list="admin-transmit-company-list"
                      className="w-[200px] border border-[#DCE3EE] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]"
                    />
                    <datalist id="admin-transmit-company-list">
                      {approvedLinkedShippers.map(a => <option key={a.id} value={a.companyName} />)}
                    </datalist>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">시작월</div>
                    <MonthPicker quick={false} value={transmitFromMonth} onChange={v => { setTransmitFromMonth(v); setTransmitSearched(false); setTransmitResult(null); }}
                      triggerClassName="h-10 px-3 border border-[#DCE3EE] rounded-lg bg-white text-[14px] font-semibold text-[#0F1A30] tabular-nums" />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">종료월</div>
                    <MonthPicker quick={false} value={transmitToMonth} onChange={v => { setTransmitToMonth(v); setTransmitSearched(false); setTransmitResult(null); }}
                      triggerClassName="h-10 px-3 border border-[#DCE3EE] rounded-lg bg-white text-[14px] font-semibold text-[#0F1A30] tabular-nums" />
                  </div>
                  <button
                    onClick={() => { setTransmitSearched(true); setTransmitResult(null); }}
                    disabled={!transmitCompanyQuery.trim()}
                    className="h-[38px] px-5 rounded-lg text-[13px] font-semibold bg-[#1B2B4B] text-white disabled:opacity-40"
                  >
                    조회
                  </button>
                </div>

                {transmitCompanyQuery.trim() && !matchedShipper && (
                  <div className="mt-3 text-[12px] text-amber-600">
                    ⚠ "{transmitCompanyQuery.trim()}"(으)로 연동 승인된 화주사를 찾을 수 없습니다. 화주사의 회사명과 거래처명이 정확히 일치해야 전송할 수 있습니다.
                  </div>
                )}

                {transmitSearched && matchedShipper && (
                  <div className="mt-4 bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                    <div className="text-[13px] text-[#1B2B4B]">
                      <span className="font-bold">{matchedShipper.companyName}</span>에 전송할 데이터 총 <span className="font-bold">{transmitMatches.length}건</span>을 찾았습니다.
                      {alreadyTransmittedCount > 0 && (
                        <span className="text-gray-500"> (이미 전송됨 {alreadyTransmittedCount}건 제외 시 {pendingTransmitMatches.length}건)</span>
                      )}
                    </div>
                    <button
                      onClick={handleTransmit}
                      disabled={transmitting || isViewer || pendingTransmitMatches.length === 0}
                      className="h-9 px-5 rounded-lg text-[13px] font-semibold bg-emerald-600 text-white disabled:opacity-40"
                    >
                      {transmitting ? "전송 중..." : `전송 (${pendingTransmitMatches.length}건)`}
                    </button>
                  </div>
                )}

                {transmitResult && (
                  <div className="mt-3 text-[12px] text-emerald-700">
                    ✓ {transmitResult.shipper}(으)로 {transmitResult.success}건 전송 완료
                    {transmitResult.failed > 0 && <span className="text-red-500"> ({transmitResult.failed}건 실패)</span>}
                  </div>
                )}
              </div>

              {transmitSearched && matchedShipper && transmitMatches.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#1B2B4B] text-white">
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.상차일" defaultText="상차일" /></th>
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.상차지" defaultText="상차지" /></th>
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.하차지" defaultText="하차지" /></th>
                        <th className="px-3 py-2 text-left font-semibold"><EditableText id="adminMenu.transmitTable.header.청구운임" defaultText="청구운임" /></th>
                        <th className="px-3 py-2 text-center font-semibold"><EditableText id="adminMenu.transmitTable.header.상태" defaultText="상태" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transmitMatches.map(r => (
                        <tr key={r._id}>
                          <td className="px-3 py-2">{r.상차일}</td>
                          <td className="px-3 py-2">{r.상차지명}</td>
                          <td className="px-3 py-2">{r.하차지명}</td>
                          <td className="px-3 py-2">{Number(r.청구운임 || 0).toLocaleString()}원</td>
                          <td className="px-3 py-2 text-center">
                            {r._transmittedToShipper
                              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">전송됨</span>
                              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">전송 대기</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ====== 화주사 문의 탭 ====== */}
          {adminTab === "inquiries" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {myLinkedInquiries.length === 0 ? (
                <div className="text-[13px] text-gray-500 text-center py-16">연동된 화주사의 문의가 없습니다.</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B] text-white">
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.inquiryTable.header.회사" defaultText="회사" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.inquiryTable.header.제목" defaultText="제목" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.inquiryTable.header.작성자" defaultText="작성자" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.inquiryTable.header.등록일" defaultText="등록일" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.inquiryTable.header.상태" defaultText="상태" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {myLinkedInquiries.map(q => (
                      <tr key={q.id} onClick={() => { setSelectedInquiry(q); setInquiryReplyText(q.reply || ""); }} className="cursor-pointer hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-600">{q.__authorCompany}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{q.title}</td>
                        <td className="px-4 py-3 text-gray-500">{q.name}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{q.createdAt?.seconds ? new Date(q.createdAt.seconds * 1000).toLocaleDateString("ko-KR") : "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${q.status === "답변완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>
                            {q.status || "접수중"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ====== 로그인 관리 탭 — 지금 로그인 중인 기기(관리자는 자기 회사만) ====== */}
          {adminTab === "loginSessions" && (
            <AdminSessionsPanel isTotalMaster={isTotalMaster} company={effectiveCompany} roleLabels={roleLabels} />
          )}

          {/* ⭐ 2026-11-06 운송사 초기화 탭 제거 — 관리자 관리센터에서만(계약종료 + 초기화 포함) */}

          {/* ====== 구글시트 연동(연결된 시트 · 가져오기 · 보내기 · 매핑 수정) ====== */}
          {adminTab === "sheetHub" && (isTotalMaster || ["admin", "allMgr"].includes(myRoleEff)) && <SheetConnectHub company={effectiveCompany} isTotalMaster={isTotalMaster} />}
          {/* 🗑 2026-11-14 휴지통 메뉴를 없앴다(사용자 요청) — 지운 오더는 보관하지 않는다 */}
          {adminTab === "dataCheck" && <React.Suspense fallback={<div className="py-16 text-center text-[#9AA9C3]">불러오는 중…</div>}><DataCheckPanel company={autoCompany} /></React.Suspense>}

          {/* ====== 접속이력 탭 (최고관리자 전용) ====== */}
          {adminTab === "sessionLogs" && isTotalMaster && (() => {
            const filteredLogs = sessionLogs.filter(l => sessionLogEventFilter === "all" || l.event === sessionLogEventFilter);
            const totalPages = Math.max(1, Math.ceil(filteredLogs.length / SESSION_LOG_PAGE_SIZE));
            const page = Math.min(sessionLogPage, totalPages);
            const pageLogs = filteredLogs.slice((page - 1) * SESSION_LOG_PAGE_SIZE, page * SESSION_LOG_PAGE_SIZE);
            return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <span className="text-[13px] font-semibold text-gray-600">최근 200건 중 {filteredLogs.length}건 · 20건씩 표시</span>
                <CustomSelect
                  value={sessionLogEventFilter}
                  onChange={e => { setSessionLogEventFilter(e.target.value); setSessionLogPage(1); }}
                  className="ml-auto h-[32px] px-2.5 rounded-lg text-[12px] font-semibold border border-[#DCE3EE] bg-white text-gray-700 outline-none"
                >
                  <option value="all">전체</option>
                  <option value="login">로그인만</option>
                  <option value="logout">로그아웃만</option>
                </CustomSelect>
              </div>
              {filteredLogs.length === 0 ? (
                <div className="text-[13px] text-gray-500 text-center py-16">접속 이력이 없습니다.</div>
              ) : (
                <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B] text-white">
                      <th className="px-2 py-2.5 text-center font-semibold w-[70px]"><EditableText id="adminMenu.sessionLogTable.header.구분" defaultText="구분" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold"><EditableText id="adminMenu.sessionLogTable.header.회사명" defaultText="회사명" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold"><EditableText id="adminMenu.sessionLogTable.header.이름" defaultText="이름" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold"><EditableText id="adminMenu.sessionLogTable.header.이메일" defaultText="이메일" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold w-[80px]"><EditableText id="adminMenu.sessionLogTable.header.권한" defaultText="권한" /></th>
                      <th className="px-2 py-2.5 text-center font-semibold w-[140px]"><EditableText id="adminMenu.sessionLogTable.header.시각" defaultText="시각" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pageLogs.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50 transition">
                        <td className="px-2 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${l.event === "login" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                            {l.event === "login" ? "로그인" : "로그아웃"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-gray-700 truncate max-w-[120px]">{l.companyName || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-700 truncate max-w-[100px]">{l.name || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500 truncate max-w-[160px]">{l.email || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500">{roleLabels[l.role] || l.role || "-"}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500 whitespace-nowrap">
                          {l.at?.seconds ? new Date(l.at.seconds * 1000).toLocaleString("ko-KR") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-center gap-1 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setSessionLogPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-md text-[12px] font-semibold border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
                  ><EditableText id="misc.btn.1269.이전" defaultText="이전" /></button>
                  <span className="text-[12px] text-gray-500 px-2">{page} / {totalPages}</span>
                  <button
                    onClick={() => setSessionLogPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 rounded-md text-[12px] font-semibold border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
                  ><EditableText id="misc.btn.1275.다음" defaultText="다음" /></button>
                </div>
                </>
              )}
            </div>
            );
          })()}

          {/* ====== 도입 문의 탭 (홈페이지 랜딩페이지, 최고관리자 전용) ====== */}
          {adminTab === "landingInquiries" && isTotalMaster && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {landingInquiries.length === 0 ? (
                <div className="text-[13px] text-gray-500 text-center py-16">홈페이지로 들어온 도입 문의가 없습니다.</div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#1B2B4B] text-white">
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.회사명" defaultText="회사명" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.담당자" defaultText="담당자" /></th>
                      <th className="px-4 py-2.5 text-left font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.연락처" defaultText="연락처" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.접수일" defaultText="접수일" /></th>
                      <th className="px-4 py-2.5 text-center font-semibold"><EditableText id="adminMenu.landingInquiryTable.header.상태" defaultText="상태" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {landingInquiries.map(q => (
                      <tr key={q.id} onClick={() => setSelectedLandingInquiry(q)} className="cursor-pointer hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-semibold text-gray-800">
                          {q.companyName}
                          {q.type === "무료체험" && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 align-middle">무료체험</span>}
                          {q.vehicles && <span className="ml-1.5 text-[11px] font-semibold text-gray-500">{q.vehicles}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{q.name}</td>
                        <td className="px-4 py-3 text-gray-600">{q.phone ? formatPhone(q.phone) : q.phone}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{q.createdAt?.seconds ? new Date(q.createdAt.seconds * 1000).toLocaleDateString("ko-KR") : "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            q.status === "완료" ? "bg-emerald-100 text-emerald-700"
                            : q.status === "상담중" ? "bg-blue-50 text-blue-600"
                            : "bg-amber-50 text-amber-600"
                          }`}>
                            {q.status || "신규"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ====== 권한 관리 탭 (최고관리자 전용) ====== */}
          {adminTab === "permissions" && isTotalMaster && (
            <RolePermissionsPanel users={users} roleLabels={roleLabels} />
          )}
          {/* ⭐ 2026-11-04 회사 마스터 — 자기 회사 전용 권한만(공통 권한·다른 운송사는 못 바꿈) */}
          {adminTab === "permissions" && !isTotalMaster && masterPerms && (
            <RolePermissionsPanel users={users.filter((u) => String(u.companyName || "").trim() === String(effectiveCompany || "").trim())} roleLabels={roleLabels} lockScope={String(effectiveCompany || "").trim()} />
          )}

          {/* ====== 랜딩페이지 편집 탭 (최고관리자 전용) ====== */}
          {adminTab === "landingEdit" && isTotalMaster && <LandingPageEditPanel />}

          {/* ====== 알림 문구 설정 탭 (최고관리자 전용) ====== */}
          {adminTab === "notifTemplate" && isTotalMaster && <NotifTemplatePanel />}
          {adminTab === "billing" && <BillingCenter userEmail={me?.email || ""} userName={myDisplayName} canView={billingAcc.view} canEdit={billingAcc.edit} users={users.filter((x) => (x.companyName || DEFAULT_COMPANY) === effectiveCompany)} orders={dispatchData} />}
          {adminTab === "copyTemplate" && (
            <div className="bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_10px_28px_rgba(16,24,40,0.06)] p-6">
              <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">COPY · TEMPLATE</div>
              <div className="text-[18px] font-black text-[#0F1A30] mb-4">기사복사 문구 설정</div>
              <CopyTemplateEditor canEdit={!isViewer} />
            </div>
          )}
          {adminTab === "setup" && (
            <div className="grid gap-4 md:grid-cols-3">
              {[["TUTORIAL", "튜토리얼 다시 보기", deptMode === "hr" ? "인사팀 주요 흐름을 둘러봅니다." : deptMode === "acct" ? "경리팀 주요 흐름을 둘러봅니다." : "프로그램 주요 흐름을 둘러봅니다.", openTutorial],
                ["SETUP WIZARD", "초기 설정 마법사", deptMode === "hr" ? "자동 출근 반경 · 직책 · 부서를 정합니다." : deptMode === "acct" ? "기사 결제일을 정합니다." : "단위 · 선택 목록 · 결제일 · 복사 문구 · 매출목표를 한 번에 정합니다.", openSetupWizard],
                ...(deptMode ? [] : [["CHECKLIST", "시작 체크리스트 다시 보기", "숨긴 시작 체크리스트(회사정보·직원 초대·권한·기사·거래처·첫 오더·요금제)를 홈 맨 위에 다시 띄웁니다.", async () => {
                  try {
                    await setDoc(doc(db, "companySettings", effectiveCompany), { masterChecklistDone: false }, { merge: true });
                    window.__setMainTab?.("HOME");
                  } catch (e) { alert("다시 띄우기 실패: " + (e?.message || e)); }
                }]])].map(([en, t, d, fn]) => (
                <button key={en} type="button" onClick={fn} className="text-left rounded-[20px] p-6 text-white shadow-[0_14px_34px_rgba(15,26,48,0.22)] hover:-translate-y-0.5 transition" style={{ background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
                  <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">{en}</div>
                  <div className="text-[19px] font-black mt-1">{t}</div>
                  <div className="text-[13px] text-white/60 mt-1">{d}</div>
                  <div className="mt-4 inline-flex h-9 items-center px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black">열기 →</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 모바일 미리보기 */}
        {showMobilePreview && (
          <div className="w-[420px] shrink-0">
            <div className="sticky top-4 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
                <span className="text-white font-semibold text-[14px]"><EditableText id="adminMenu.mobilePreview.title" defaultText="모바일 미리보기" /></span>
                <button onClick={() => setShowMobilePreview(false)} className="text-white/60 hover:text-white text-lg">✕</button>
              </div>
              <div className="p-3">
                {/* ⭐ 2026-11-06 모바일 미리보기 — 예전 주소(/mobile)는 없는 화면이라 로그인 확인 → 로그인 화면 → /app 으로 몇 번 튕겼고,
                    iframe이 저장소에 남은 다른 계정(최고관리자 등)을 먼저 집어 사무원 계정인데 최고관리자 화면이 보였다.
                    이제 /app?kpmpv=1 로 바로 열고, iframe은 "지금 이 창에 로그인한 계정"만 받아 쓴다(firebase.js IS_MOBILE_PREVIEW). */}
                <MobilePreviewFrame />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== 연동 화주사 관리 팝업 ====== */}
      {managingLinkedApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setManagingLinkedApp(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="text-white font-bold text-[15px]">
                  {isTotalMaster ? <EditableText id="adminMenu.linkedPopup.title2" defaultText="2차 최종 승인" /> : <EditableText id="adminMenu.linkedPopup.title1" defaultText="화주사 승인 관리" />}
                </h3>
                <p className="text-white/60 text-[12px] mt-0.5">{managingLinkedApp.companyName} / {managingLinkedApp.name}</p>
              </div>
              <button onClick={() => setManagingLinkedApp(null)} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-6">
              {isTotalMaster && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1B2B4B]/5 border border-[#1B2B4B]/15 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B] shrink-0" />
                  <span className="text-[12px] font-semibold text-[#1B2B4B]">
                    {managingLinkedApp.linkedTransportCompany?.companyName || "-"} 운송사에서 1차 승인 완료
                  </span>
                </div>
              )}

              {/* 신청 정보 */}
              <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="adminMenu.linkedPopup.section.신청정보" defaultText="신청 정보" /></div>
                {[
                  ["신청 유형", managingLinkedApp.type === "신규" ? "신규 가입" : "기존 회사 추가"],
                  ["화주사명", managingLinkedApp.companyName],
                  ["사업자번호", (managingLinkedApp.businessNumber && (fmtBizNo(managingLinkedApp.businessNumber) || managingLinkedApp.businessNumber)) || "-"],
                  ["이름", managingLinkedApp.name],
                  ["연락처", managingLinkedApp.phone ? formatPhone(managingLinkedApp.phone) : managingLinkedApp.phone],
                  ["직책", managingLinkedApp.position || "-"],
                  ["이메일", managingLinkedApp.email || "-"],
                  ["신청일", fmtDate(managingLinkedApp.createdAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                    <span className="text-[12px] text-gray-500 w-28 shrink-0"><EditableText id={`adminMenu.linkedPopup.label.${label}`} defaultText={label} /></span>
                    <span className="text-[13px] font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              {/* 연결 운송사 */}
              {managingLinkedApp.linkedTransportCompany && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                  <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="adminMenu.linkedPopup.section.연결운송사" defaultText="연결 운송사" /></div>
                  {[
                    ["운송사명", managingLinkedApp.linkedTransportCompany.companyName || "-"],
                    ["운송사 코드", managingLinkedApp.linkedTransportCompany.companyCode || "-"],
                    ["대표자", managingLinkedApp.linkedTransportCompany.representative || "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start px-4 py-3 border-b border-gray-50 last:border-b-0 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-500 w-28 shrink-0"><EditableText id={`adminMenu.linkedPopup.label.${label}`} defaultText={label} /></span>
                      <span className="text-[13px] font-medium text-gray-800">{value}</span>
                    </div>
                  ))}
                  {managingLinkedApp.transportApprovalStatus === "approved" && (
                    <div className="flex items-start px-4 py-3 border-t border-gray-50 odd:bg-gray-50/50">
                      <span className="text-[12px] text-gray-500 w-28 shrink-0"><EditableText id="adminMenu.linkedPopup.label.1차승인자" defaultText="1차 승인자" /></span>
                      <span className="text-[13px] font-medium text-gray-800">{managingLinkedApp.transportApprovedBy || "-"}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 권한 관리 (최고관리자 전용) */}
              {isTotalMaster && managingLinkedApp.userId && appUserPerms !== null && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
                  <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100"><EditableText id="adminMenu.linkedPopup.section.권한관리" defaultText="권한 관리" /></div>
                  <div className="px-4 py-4 space-y-3">
                    {[
                      { key: "master", label: "마스터", desc: "전체 권한" },
                      { key: "subMaster", label: "부마스터", desc: "마스터 권한 부여 제외" },
                      { key: "settlement", label: "경리", desc: "정산 탭 접근" },
                      { key: "transport", label: "운송", desc: "운송 탭 접근" },
                    ].map(({ key, label, desc }) => (
                      <label key={key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!appUserPerms[key]}
                          onChange={(e) => setAppUserPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-4 h-4 rounded"
                        />
                        <div>
                          <div className="text-[13px] font-semibold text-gray-800"><EditableText id={`adminMenu.linkedPopup.perm.${key}.label`} defaultText={label} /></div>
                          <div className="text-[11px] text-gray-500"><EditableText id={`adminMenu.linkedPopup.perm.${key}.desc`} defaultText={desc} /></div>
                        </div>
                      </label>
                    ))}
                    <button
                      onClick={async () => {
                        if (isViewer) { _viewerAlert(); return; }
                        try {
                          await updateDoc(doc(db, "users", managingLinkedApp.userId), { permissions: appUserPerms });
                          alert("권한이 저장되었습니다.");
                        } catch (err) {
                          alert("저장 중 오류가 발생했습니다: " + (err?.message || err));
                        }
                      }}
                      className="w-full py-2 mt-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold"
                    >
                      <EditableText id="adminMenu.linkedPopup.권한저장" defaultText="권한 저장" />
                    </button>
                  </div>
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="space-y-2">
                {isTotalMaster ? (
                  <>
                    <button
                      onClick={() => approveShipper2nd(managingLinkedApp)}
                      className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                    >
                      <EditableText id="adminMenu.linkedPopup.최종승인" defaultText="최종 승인" />
                    </button>
                    <button
                      onClick={() => setShowRejectLinked(true)}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                    >
                      <EditableText id="adminMenu.linkedPopup.거절" defaultText="거절" />
                    </button>
                  </>
                ) : (
                  (() => {
                    const tStatus = managingLinkedApp.transportApprovalStatus || "pending";
                    return (
                      <>
                        {tStatus !== "approved" && (
                          <button
                            onClick={() => approveShipper1st(managingLinkedApp)}
                            className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                          >
                            <EditableText id="adminMenu.linkedPopup.1차승인" defaultText="1차 승인" />
                          </button>
                        )}
                        {tStatus !== "rejected" && (
                          <button
                            onClick={() => setShowRejectLinked(true)}
                            className="w-full py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                          >
                            {tStatus === "approved" ? <EditableText id="adminMenu.linkedPopup.1차승인취소" defaultText="1차 승인 취소" /> : <EditableText id="adminMenu.linkedPopup.거절" defaultText="거절" />}
                          </button>
                        )}
                        {tStatus === "rejected" && (
                          <button
                            onClick={() => approveShipper1st(managingLinkedApp)}
                            className="w-full py-2.5 rounded-xl border border-[#1B2B4B]/40 text-[13px] font-semibold text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                          >
                            거절 취소 (대기로 변경)
                          </button>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 거절 사유 입력 */}
      {showRejectLinked && managingLinkedApp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.거절 사유 입력" defaultText="거절 사유 입력" /></h3>
              <button onClick={() => { setShowRejectLinked(false); setRejectLinkedReason(""); }} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6">
              <p className="text-[13px] text-gray-500 mb-4">{managingLinkedApp.companyName} — {managingLinkedApp.name}</p>
              <textarea
                value={rejectLinkedReason}
                onChange={e => setRejectLinkedReason(e.target.value)}
                placeholder="거절 사유를 입력해주세요 (선택사항)"
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none mb-4"
              />
              <div className="flex gap-3">
                <button onClick={() => { setShowRejectLinked(false); setRejectLinkedReason(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                  취소
                </button>
                <button
                  onClick={() => isTotalMaster
                    ? rejectShipper2nd(managingLinkedApp, rejectLinkedReason)
                    : rejectShipper1st(managingLinkedApp, rejectLinkedReason)
                  }
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                  거절 확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== 화주사 문의 답변 팝업 ====== */}
      {selectedInquiry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setSelectedInquiry(null); setInquiryReplyText(""); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <div className="font-bold text-[15px] text-[#1B2B4B]">{selectedInquiry.title}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">{selectedInquiry.__authorCompany} · {selectedInquiry.name}</div>
              </div>
              <button onClick={() => { setSelectedInquiry(null); setInquiryReplyText(""); }} className="text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">문의 내용</div>
                <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">{selectedInquiry.content}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">답변</div>
                <textarea
                  value={inquiryReplyText}
                  onChange={e => setInquiryReplyText(e.target.value)}
                  rows={5}
                  placeholder="답변 내용을 입력하세요"
                  className="w-full border border-[#DCE3EE] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
                />
              </div>
              <button
                onClick={handleReplyInquiry}
                disabled={inquiryReplying || isViewer || !inquiryReplyText.trim()}
                className="w-full py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold disabled:opacity-40"
              >
                {inquiryReplying ? "등록 중..." : (selectedInquiry.status === "답변완료" ? "답변 수정" : "답변 등록")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== 도입 문의 상세 팝업 ====== */}
      {selectedLandingInquiry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedLandingInquiry(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <div className="font-bold text-[15px] text-[#1B2B4B]">{selectedLandingInquiry.companyName}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  {selectedLandingInquiry.name} · {selectedLandingInquiry.phone ? formatPhone(selectedLandingInquiry.phone) : selectedLandingInquiry.phone}
                  {selectedLandingInquiry.createdAt?.seconds && ` · ${new Date(selectedLandingInquiry.createdAt.seconds * 1000).toLocaleString("ko-KR")}`}
                </div>
              </div>
              <button onClick={() => setSelectedLandingInquiry(null)} className="text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {selectedLandingInquiry.email && (
                <div>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">이메일</div>
                  <div className="text-[13px] text-gray-700">{selectedLandingInquiry.email}</div>
                </div>
              )}
              {/* ⭐ 무료 체험 신청 항목(홈페이지 폼) */}
              {(selectedLandingInquiry.vehicles || selectedLandingInquiry.staffCount || selectedLandingInquiry.currentTool) && (
                <div className="grid grid-cols-3 gap-2">
                  {[["운영 차량", selectedLandingInquiry.vehicles], ["배차 인원", selectedLandingInquiry.staffCount], ["현재 방식", selectedLandingInquiry.currentTool]].map(([l, v]) => (
                    <div key={l} className="bg-gray-50 rounded-lg p-2.5">
                      <div className="text-[11px] font-semibold text-gray-500 mb-0.5">{l}</div>
                      <div className="text-[13px] font-bold text-gray-800">{v || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">문의 내용</div>
                <div className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3 min-h-[48px]">
                  {selectedLandingInquiry.message || "-"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">진행 상태</div>
                <div className="flex gap-2">
                  {["신규", "상담중", "완료"].map(s => (
                    <button
                      key={s}
                      disabled={landingStatusSaving}
                      onClick={() => updateLandingInquiryStatus(selectedLandingInquiry.id, s)}
                      className={`flex-1 py-2 rounded-lg text-[13px] font-bold border transition disabled:opacity-50 ${
                        (selectedLandingInquiry.status || "신규") === s
                          ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                          : "bg-white text-gray-600 border-[#DCE3EE] hover:bg-gray-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

// ====== 화주사 강제 업데이트 (최고관리자 전용 · 관리자 관리센터 PlatformCenter.jsx에서만 씀 — 2026-11-07 관리자메뉴에서는 뺌) ======
// 화주사 클라이언트가 자체 서비스워커 갱신을 놓치는 경우에 대비해, 최고관리자가
// systemConfig/forceUpdate 문서의 minVersion을 직접 올리면 화주사 프로그램(ShipperApp.jsx)이
// 자신의 __APP_VERSION__과 비교해 뒤처진 경우 강제로 업데이트 배너를 띄운다.
// ⭐ 알림 문구 설정 — 최고관리자가 푸시 알림 본문에 어떤 필드를 넣을지 종류별로
// 고른다(제목은 고정값이라 여기선 안 건드림). 실제 발송 로직(functions/index.js)의
// NOTIF_TEMPLATE_FIELD_LABELS/NOTIF_TEMPLATE_DEFAULTS와 필드 키/순서를 반드시
// 맞춰야 한다 — 여기서 저장하는 값을 Cloud Functions가 그대로 읽어서 쓴다.
const NOTIF_FIELD_OPTIONS = [
  { key: "거래처명", label: "거래처명" },
  { key: "상차지명", label: "상차지" },
  { key: "하차지명", label: "하차지" },
  { key: "상차일", label: "상차일" },
  { key: "상차시간", label: "상차시간" },
  { key: "화물내용", label: "화물정보" },
  { key: "차량톤수", label: "차량톤수" },
  { key: "차량종류", label: "차량종류" },
  { key: "차량번호", label: "차량번호" },
  { key: "기사명", label: "기사명" },
  { key: "전화번호", label: "전화번호" },
];
const NOTIF_TYPE_DEFS = [
  { key: "배차등록", label: "배차등록 (일반 신규오더 등록)", defaultFields: ["거래처명", "상차지명", "하차지명"] },
  { key: "긴급배차", label: "긴급배차 (긴급 신규오더 등록)", defaultFields: ["거래처명", "상차지명", "하차지명"] },
  { key: "배차완료", label: "배차완료 (기사 배정됨)", defaultFields: ["거래처명", "상차지명", "하차지명", "기사명", "차량번호"] },
  { key: "미배차", label: "미배차 임박", defaultFields: ["거래처명", "상차지명", "하차지명", "상차시간"] },
];
function notifFieldsFor(cfg, typeKey, defaultFields) {
  const f = cfg?.[typeKey]?.fields;
  return Array.isArray(f) && f.length ? f : defaultFields;
}

export function NotifTemplatePanel() {
  const [config, setConfig] = useState(null); // null = 로딩중
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteConfig", "notificationTemplate"),
      (snap) => setConfig(snap.exists() ? snap.data() || {} : {}),
      () => setConfig({})
    );
    return () => unsub();
  }, []);

  const toggleField = (typeKey, defaultFields, fieldKey) => {
    setConfig((prev) => {
      const cur = new Set(notifFieldsFor(prev, typeKey, defaultFields));
      if (cur.has(fieldKey)) cur.delete(fieldKey);
      else cur.add(fieldKey);
      // 항상 NOTIF_FIELD_OPTIONS 정의 순서로 정렬해서 저장한다 — 발송 쪽에서
      // "상차지 바로 다음에 하차지가 오면 화살표로 잇는다"는 로직이 순서에
      // 의존하기 때문에, 체크한 순서가 아니라 항상 같은 순서를 유지해야 한다.
      const ordered = NOTIF_FIELD_OPTIONS.map((o) => o.key).filter((k) => cur.has(k));
      return { ...(prev || {}), [typeKey]: { fields: ordered } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "siteConfig", "notificationTemplate"), config || {}, { merge: true });
      alert("저장했습니다. 다음 알림부터 바로 반영됩니다.");
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-3xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">알림 문구 설정</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        푸시 알림의 제목은 고정이고, 본문에 어떤 정보를 넣을지만 알림 종류별로 고를 수
        있습니다. 상차지·하차지를 둘 다 선택하면 "상차지 → 하차지"로 화살표로
        이어집니다. (재배차·배차취소 알림은 정해진 안내 문구라 여기서 설정할 수
        없습니다.)
      </p>
      {config === null ? (
        <div className="text-[13px] text-gray-400 py-8 text-center">불러오는 중...</div>
      ) : (
        <div className="space-y-4">
          {NOTIF_TYPE_DEFS.map(({ key, label, defaultFields }) => {
            const selected = new Set(notifFieldsFor(config, key, defaultFields));
            return (
              <div key={key} className="border border-gray-100 rounded-lg p-4">
                <div className="text-[13px] font-bold text-gray-700 mb-2">{label}</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {NOTIF_FIELD_OPTIONS.map((opt) => {
                    const on = selected.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleField(key, defaultFields, opt.key)}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-[#DCE3EE] hover:bg-gray-50"}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-gray-400">
                  미리보기: {NOTIF_FIELD_OPTIONS.filter((o) => selected.has(o.key)).map((o) => o.label).join(" · ") || "(선택 없음)"}
                </div>
              </div>
            );
          })}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      )}
    </div>
  );
}

// ⭐ 랜딩페이지 편집 — 로그인 전 첫 화면(src/Login.jsx)의 배경/문구/색/글씨체를
// 최고관리자가 바꾼다. siteConfig/landing 문서 하나에 다 저장하고, Login.jsx가
// 그 문서를 실시간 구독해서 반영한다(firestore.rules에서 이 문서는 get은 누구나,
// write는 최고관리자만 되도록 막아뒀다).
const DEFAULT_BADGE = "물류 관리 플랫폼";
const DEFAULT_HEADLINE_1 = "더 스마트한";
const DEFAULT_HEADLINE_2 = "물류 관리";
const DEFAULT_SUBTITLE_1 = "배차 관리부터 차주 관리, 운임 정산까지";
const DEFAULT_SUBTITLE_2 = "LogisWeb 하나로 물류 업무를 최적화하세요.";
const DEFAULT_CTA_TRANSPORT = "운송사 시작하기";
const DEFAULT_CTA_DRIVER = "차주 시작하기";
const DEFAULT_CTA_SHIPPER = "화주사 시작하기";
const DEFAULT_FOOTER = "© 2025 LogisWeb. All rights reserved.";
const DEFAULT_LANDING_FEATURES = [
  { title: "배차 관리", desc: "실시간 배차 등록 및 현황 관리" },
  { title: "차주 관리", desc: "차주 정보 및 운행 현황 통합 관리" },
  { title: "운임 정산", desc: "청구운임 및 기사운임 자동 정산" },
  { title: "거래처 관리", desc: "화주사 및 거래처 통합 관리" },
];
const LANDING_FONT_OPTIONS = [
  { key: "noto", label: "Noto Sans KR (기본)" },
  { key: "nanum", label: "나눔고딕" },
  { key: "gothicA1", label: "Gothic A1" },
];

// 👤 회원 관리 창 — 버튼 하나로 열고, 그 안에서 승인·거절·정보수정·마스터·퇴사·삭제(모두 확인창)
function MemberManageModal({ u, me, isTotalMaster, roles, roleLabels, f, onClose, onSave, onApprove, onUnapprove, onReject, onMaster, onResign, onDelete, canSubAdmin = false, onSubAdmin, canMaster = true, canAccount = true, canDelete = true, hrOpt, hrLock = false }) {
  const positionsForTeam = hrOpt.positionsFor; const TEAM_OPTIONS = hrOpt.teams;
  const [busy, setBusy] = useState(false);
  const pending = u.approved === false && u.employmentStatus !== "퇴사"; // ⭐ 2026-11-02 점검 — 예전 계정(approved 없음)은 승인으로 보고 거절 버튼을 띄우지 않음
  const resigned = u.employmentStatus === "퇴사";
  const isMe = me?.uid === u.id;
  const run = (fn) => async () => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const inp = "w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 bg-white disabled:bg-[#F5F8FD] disabled:text-[#7A879C]";
  const lab = "block text-[11.5px] font-bold text-[#7A879C] mb-1.5";
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0B1428]/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto rounded-[22px] bg-[#F3F6FA] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 px-6 py-5 text-white flex items-start justify-between gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0] whitespace-nowrap">{pending ? "MEMBER · 가입 승인" : "MEMBER · 정보 수정"}</div>
            <div className="text-[20px] font-black whitespace-nowrap overflow-hidden text-ellipsis">{u.name || u.email}</div>
            <div className="text-[12.5px] text-white/70 whitespace-nowrap overflow-hidden text-ellipsis">{u.email}{u.phone ? ` · ${fmtPhone(u.phone) || u.phone}` : ""}</div>
          </div>
          <span className={`shrink-0 h-8 px-3 inline-flex items-center rounded-full text-[12px] font-black ${pending ? "bg-[#8FB0F0] text-[#0B1428]" : resigned ? "bg-white/10 text-white border border-white/25" : "bg-white text-[#0B1428]"}`}>{resigned ? "퇴사" : pending ? "승인 대기" : "승인 완료"}</span>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
            <div className="text-[13px] font-black text-[#0F1A30] mb-3">정보 {pending ? "확인 · 지정" : "수정"} <span className="text-[11.5px] font-bold text-[#9AA9C3]">직책 · 부서 · 권한</span></div>
            {hrLock && <div className="mb-3 rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-3 py-2 text-[12px] font-bold text-[#1B2B4B]">인사 담당자가 있어 부서·직책·퇴사는 인사팀(인사관리부 › 인사관리 › 직원관리)에서 바꿉니다. 승인·권한 지정은 그대로 할 수 있습니다.</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lab}>이름</label><input value={f.editName} onChange={(e) => f.setEditName(e.target.value)} className={inp} /></div>
              <div><label className={lab}>핸드폰번호</label><input value={f.editPhone} inputMode="tel" onChange={(e) => f.setEditPhone(fmtPhone(e.target.value))} className={inp} /></div>
              <div><label className={lab}>직책</label>
                <CustomSelect value={f.editPosition} onChange={(e) => f.setEditPosition(e.target.value)} disabled={hrLock} className={inp}>
                  <option value="">선택 안 함</option>
                  {(f.editPosition && !positionsForTeam(f.editTeam).includes(f.editPosition)) && <option value={f.editPosition}>{f.editPosition}</option>}
                  {positionsForTeam(f.editTeam).map((p) => <option key={p} value={p}>{p}</option>)}
                </CustomSelect></div>
              <div><label className={lab}>부서</label>
                <CustomSelect value={f.editTeam} onChange={(e) => f.setEditTeam(e.target.value)} disabled={hrLock} className={inp}>
                  <option value="">미배정</option>
                  {TEAM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </CustomSelect></div>
              <div><label className={lab}>권한</label>
                <CustomSelect value={f.editRole} onChange={(e) => f.setEditRole(e.target.value)} className={inp}>
                  {roles.map((r) => <option key={r} value={r}>{roleLabels[r] || r}</option>)}
                </CustomSelect>
                <p className="mt-1 text-[11px] font-bold text-[#7A879C]">{`추천: ${roleLabels[f.suggestR({ team: f.editTeam, position: f.editPosition })] || ROLE_NAME[f.suggestR({ team: f.editTeam, position: f.editPosition })]} · 부서·직책 기준`}</p></div>
              <div><label className={lab}>업무 범위</label>
                <CustomSelect value={f.editScope || ""} onChange={(e) => f.setEditScope(e.target.value)} className={inp}>
                  {WORK_SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </CustomSelect>
                <p className="mt-1 text-[11px] font-bold text-[#7A879C]">{(WORK_SCOPES.find(([k]) => k === (f.editScope || "")) || WORK_SCOPES[0])[2]}</p></div>
              <div><label className={lab}>회사명</label><input value={f.editCompany} onChange={(e) => f.setEditCompany(e.target.value)} disabled={!isTotalMaster} className={inp} /></div>
              {/* ⭐ 2026-11-02 출근·퇴근 시간 — 자동 출근 시간대·지각·반차 기준(직원마다 다르게) */}
              <div><label className={lab}>출근 시간</label>
                <CustomSelect value={f.editWorkStart} onChange={(e) => f.setEditWorkStart(e.target.value)} className={`${inp} tabular-nums`}>{WORK_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</CustomSelect></div>
              <div><label className={lab}>퇴근 시간</label>
                <CustomSelect value={f.editWorkEnd} onChange={(e) => f.setEditWorkEnd(e.target.value)} className={`${inp} tabular-nums`}>{WORK_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</CustomSelect></div>
            </div>
            {canSubAdmin && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#C9D6EE] bg-[#F5F8FD] px-3.5 py-2.5" data-subadmin>
                <div className="min-w-0">
                  <div className="text-[13px] font-black text-[#0F1A30]">부관리자 {u.subAdmin && <span className="ml-1 px-1.5 rounded bg-[#2D4C82] text-white text-[10.5px]">지정됨</span>}</div>
                  <div className="text-[11.5px] text-[#7A879C]">최고관리자와 같은 권한 · 1명만 · 해제하면 예전 권한으로</div>
                </div>
                <button type="button" disabled={busy} onClick={run(onSubAdmin)} className={`shrink-0 h-9 px-3.5 rounded-xl text-[12.5px] font-black ${u.subAdmin ? "border border-[#0F1A30] text-[#0F1A30]" : "bg-[#2D4C82] text-white"}`}>{u.subAdmin ? "부관리자 해제" : "부관리자 지정"}</button>
              </div>
            )}
            {u.role !== "shipper" && canMaster && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#E3E8F0] px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-black text-[#0F1A30]">마스터 계정 {u.isMaster && <span className="ml-1 px-1.5 rounded bg-[#0F1A30] text-white text-[10.5px]">지정됨</span>}</div>
                  <div className="text-[11.5px] text-[#7A879C]">직원 승인·권한 지정 · 인사 담당자가 없을 때는 부서·직책·퇴사까지</div>
                </div>
                <button type="button" disabled={busy} onClick={run(onMaster)} className={`shrink-0 h-9 px-3.5 rounded-xl text-[12.5px] font-black ${u.isMaster ? "border border-[#0F1A30] text-[#0F1A30]" : "border border-[#DCE3EE] text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>{u.isMaster ? "마스터 해제" : "마스터 지정"}</button>
              </div>
            )}
          </div>

          {!pending && canAccount && (
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
              <div className="text-[13px] font-black text-[#0F1A30] mb-2.5">계정 처리 <span className="text-[11.5px] font-bold text-[#9AA9C3]">누르면 확인창이 먼저 뜹니다</span></div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={busy || isMe} onClick={run(onResign)} className="h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] disabled:opacity-40">{resigned ? "복직 처리" : "퇴사 처리"}</button>
                <button type="button" disabled={busy || isMe} onClick={run(onUnapprove)} className="h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] disabled:opacity-40">승인 해제</button>
                <button type="button" disabled={busy || isMe || !canDelete} title={canDelete ? "" : "계정 삭제는 마스터만"} onClick={run(onDelete)} className="h-10 rounded-xl border border-[#C9D3E3] text-[13px] font-black text-[#5B6B85] hover:bg-[#F5F8FD] disabled:opacity-40">계정 삭제</button>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 px-5 py-4 bg-white border-t border-[#E3E8F0] flex gap-2">
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#3A4A66]">닫기</button>
          {pending ? (
            <>
              <button type="button" disabled={busy} onClick={run(onReject)} className="flex-1 h-11 rounded-xl border border-[#C9D3E3] text-[13.5px] font-black text-[#1B2B4B] disabled:opacity-50">거절</button>
              <button type="button" disabled={busy} onClick={run(onApprove)} className="flex-[2] h-11 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "처리 중…" : "이대로 승인"}</button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={run(onSave)} className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#DCE3EE] rounded-lg px-3 py-1.5 text-[13px]"
      />
    </div>
  );
}

export function LandingPageEditPanel() {
  const [form, setForm] = useState(null); // null = 로딩중
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteConfig", "landing"),
      (snap) => setForm(snap.exists() ? { ...snap.data() } : {}),
      () => setForm({})
    );
    return () => unsub();
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...(prev || {}), [key]: value }));
  const setFeature = (idx, key, value) => {
    setForm((prev) => {
      const base = Array.isArray(prev?.features) && prev.features.length === 4
        ? prev.features.map((f) => ({ ...f }))
        : DEFAULT_LANDING_FEATURES.map((f) => ({ ...f }));
      base[idx] = { ...base[idx], [key]: value };
      return { ...(prev || {}), features: base };
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > 8 * 1024 * 1024) { alert("이미지 용량은 8MB 이하로 올려주세요."); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `siteConfig/landing-bg-${Date.now()}.${ext}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      set("backgroundImageUrl", url);
      // 이미지는 올리자마자 바로 저장/반영 — 아래 다른 텍스트/색상은 "저장" 버튼으로 따로 적용.
      await setDoc(doc(db, "siteConfig", "landing"), { backgroundImageUrl: url }, { merge: true });
    } catch (e) {
      alert("이미지 업로드 실패: " + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  // ⭐ 사용자 요청 — 로그인 첫 화면 배경에 올린 영상이 계속(반복) 재생되게
  const [videoProgress, setVideoProgress] = useState(null); // null | 0~100
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) { alert("영상 파일(mp4 등)만 업로드할 수 있습니다."); return; }
    if (file.size > 100 * 1024 * 1024) { alert("영상 용량은 100MB 이하로 올려주세요. (로딩 속도를 위해 20MB 이하 권장)"); return; }
    setVideoProgress(0);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const r = storageRef(storage, `siteConfig/landing-video-${Date.now()}.${ext}`);
      const task = uploadBytesResumable(r, file, { contentType: file.type, cacheControl: "public,max-age=31536000" });
      await new Promise((resolve, reject) => {
        task.on("state_changed", (snap) => setVideoProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)), reject, resolve);
      });
      const url = await getDownloadURL(r);
      set("backgroundVideoUrl", url);
      await setDoc(doc(db, "siteConfig", "landing"), { backgroundVideoUrl: url }, { merge: true });
    } catch (e2) {
      alert("영상 업로드 실패: " + (e2?.message || e2));
    } finally {
      setVideoProgress(null);
    }
  };
  const handleRemoveVideo = async () => {
    set("backgroundVideoUrl", "");
    try { await setDoc(doc(db, "siteConfig", "landing"), { backgroundVideoUrl: "" }, { merge: true }); } catch {}
  };

  const handleRemoveImage = async () => {
    set("backgroundImageUrl", "");
    try {
      await setDoc(doc(db, "siteConfig", "landing"), { backgroundImageUrl: "" }, { merge: true });
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // ⭐ 2026-11-03 소개 홈페이지 편집 내용(homepage*)은 관리자센터 › 홈페이지에서만 저장 — 여기서 덮어쓰지 않게 뺀다
      const { homepage: _hp, homepageAt: _hpAt, homepageBy: _hpBy, ...rest } = form || {};
      await setDoc(doc(db, "siteConfig", "landing"), rest, { merge: true });
      alert("저장했습니다. 로그인 전 첫 화면에 바로 반영됩니다.");
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (form === null) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-[13px] text-gray-400">
        불러오는 중...
      </div>
    );
  }

  const features = Array.isArray(form.features) && form.features.length === 4 ? form.features : DEFAULT_LANDING_FEATURES;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-3xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">랜딩페이지 편집</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        로그인 전 첫 화면(PC/모바일 공통)의 배경·문구·색·글씨체를 바꿉니다. 저장하면
        방문자 화면에 새로고침 없이 바로 반영됩니다.
      </p>

      {/* 배경 이미지 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-2">배경 이미지</div>
        {form.backgroundImageUrl ? (
          <img
            src={form.backgroundImageUrl}
            alt="배경 미리보기"
            className="w-full max-w-md h-32 object-cover rounded-lg border border-gray-200 mb-2"
          />
        ) : (
          <div className="text-[11px] text-gray-400 mb-2">
            설정 안 함 — 기본 남색 배경이 나갑니다.
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-[12px] font-semibold cursor-pointer hover:bg-gray-200 transition">
            {uploading ? "업로드 중..." : "이미지 업로드"}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
          {form.backgroundImageUrl && (
            <button
              onClick={handleRemoveImage}
              className="px-4 py-2 rounded-lg bg-white border border-[#DCE3EE] text-gray-500 text-[12px] font-semibold hover:bg-gray-50 transition"
            >
              이미지 제거(영상으로 복귀)
            </button>
          )}
        </div>
      </div>

      {/* 배경 영상 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-2">배경 영상 <span className="font-normal text-gray-400">(올리면 이미지보다 우선, 소리 없이 계속 반복 재생)</span></div>
        {form.backgroundVideoUrl ? (
          <video src={form.backgroundVideoUrl} muted loop autoPlay playsInline
            className="w-full max-w-md h-32 object-cover rounded-lg border border-gray-200 mb-2 bg-black" />
        ) : (
          <div className="text-[11px] text-gray-400 mb-2">설정 안 함</div>
        )}
        <div className="flex items-center gap-2">
          <label className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-semibold cursor-pointer hover:opacity-90 transition">
            {videoProgress != null ? `업로드 중... ${videoProgress}%` : "영상 업로드"}
            <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={videoProgress != null} />
          </label>
          {form.backgroundVideoUrl && (
            <button onClick={handleRemoveVideo}
              className="px-4 py-2 rounded-lg bg-white border border-[#DCE3EE] text-gray-500 text-[12px] font-semibold hover:bg-gray-50 transition">
              영상 제거
            </button>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-1.5">영상이 잘 보이게 하려면 아래 "오버레이 투명도"를 40~60% 정도로 낮춰주세요.</div>
      </div>

      {/* 오버레이 색상 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">배경 위 오버레이 색</div>
          <input
            type="color"
            value={form.overlayColor || "#0B2554"}
            onChange={(e) => set("overlayColor", e.target.value)}
            className="w-full h-9 rounded border border-[#DCE3EE]"
          />
        </div>
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">오버레이 진하기 ({form.overlayOpacity ?? 82}%)</div>
          <input
            type="range"
            min="0"
            max="100"
            value={form.overlayOpacity ?? 82}
            onChange={(e) => set("overlayOpacity", Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* 글씨체 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-1">글씨체</div>
        <CustomSelect
          value={form.fontFamily || "noto"}
          onChange={(e) => set("fontFamily", e.target.value)}
          className="border border-[#DCE3EE] rounded-lg px-3 py-1.5 text-[13px]"
        >
          {LANDING_FONT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </CustomSelect>
      </div>

      {/* 문구 색상 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">기본 글씨 색</div>
          <input
            type="color"
            value={form.textColor || "#ffffff"}
            onChange={(e) => set("textColor", e.target.value)}
            className="w-full h-9 rounded border border-[#DCE3EE]"
          />
        </div>
        <div>
          <div className="text-[12px] font-bold text-gray-600 mb-1">강조 글씨 색(헤드라인 2번째 줄)</div>
          <input
            type="color"
            value={form.accentColor || "#93c5fd"}
            onChange={(e) => set("accentColor", e.target.value)}
            className="w-full h-9 rounded border border-[#DCE3EE]"
          />
        </div>
      </div>

      {/* 텍스트 */}
      <div className="space-y-3 mb-6">
        <FieldRow label="상단 배지 문구" value={form.badgeText} onChange={(v) => set("badgeText", v)} placeholder={DEFAULT_BADGE} />
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="헤드라인 1번째 줄" value={form.headlineLine1} onChange={(v) => set("headlineLine1", v)} placeholder={DEFAULT_HEADLINE_1} />
          <FieldRow label="헤드라인 2번째 줄(강조색)" value={form.headlineLine2} onChange={(v) => set("headlineLine2", v)} placeholder={DEFAULT_HEADLINE_2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="부제목 1번째 줄" value={form.subtitleLine1} onChange={(v) => set("subtitleLine1", v)} placeholder={DEFAULT_SUBTITLE_1} />
          <FieldRow label="부제목 2번째 줄" value={form.subtitleLine2} onChange={(v) => set("subtitleLine2", v)} placeholder={DEFAULT_SUBTITLE_2} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FieldRow label="운송사 버튼 문구" value={form.ctaTransportLabel} onChange={(v) => set("ctaTransportLabel", v)} placeholder={DEFAULT_CTA_TRANSPORT} />
          <FieldRow label="차주 버튼 문구" value={form.ctaDriverLabel} onChange={(v) => set("ctaDriverLabel", v)} placeholder={DEFAULT_CTA_DRIVER} />
          <FieldRow label="화주사 버튼 문구" value={form.ctaShipperLabel} onChange={(v) => set("ctaShipperLabel", v)} placeholder={DEFAULT_CTA_SHIPPER} />
        </div>
        <FieldRow label="하단 푸터 문구" value={form.footerText} onChange={(v) => set("footerText", v)} placeholder={DEFAULT_FOOTER} />
      </div>

      {/* 기능 카드 4개 */}
      <div className="mb-6">
        <div className="text-[12px] font-bold text-gray-600 mb-2">기능 카드 4개</div>
        <div className="grid grid-cols-2 gap-3">
          {features.map((f, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3">
              <input
                value={f.title || ""}
                onChange={(e) => setFeature(i, "title", e.target.value)}
                placeholder={DEFAULT_LANDING_FEATURES[i].title}
                className="w-full border border-[#DCE3EE] rounded px-2 py-1 text-[12px] font-bold mb-1"
              />
              <input
                value={f.desc || ""}
                onChange={(e) => setFeature(i, "desc", e.target.value)}
                placeholder={DEFAULT_LANDING_FEATURES[i].desc}
                className="w-full border border-[#DCE3EE] rounded px-2 py-1 text-[11px]"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
      >
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}

export function ShipperForceUpdatePanel({ currentVersion }) {
  const [minVersion, setMinVersion] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "systemConfig", "forceUpdate"), (snap) => {
      if (snap.exists()) {
        setMinVersion(snap.data().minVersion || null);
        setUpdatedAt(snap.data().updatedAt || null);
      }
    });
    return () => unsub();
  }, []);

  const handleForceUpdate = async () => {
    setSending(true);
    try {
      await setDoc(doc(db, "systemConfig", "forceUpdate"), {
        minVersion: currentVersion,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "",
      });
      alert(`화주사 강제 업데이트를 발송했습니다. (기준 버전 v${currentVersion})`);
    } catch (e) {
      alert("발송 실패: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const isCurrentAlreadyMin = minVersion === currentVersion;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-xl">
      <div className="text-[14px] font-bold text-gray-800 mb-1">화주사 강제 업데이트</div>
      <p className="text-[12px] text-gray-500 mb-5 leading-relaxed">
        화주사 프로그램(PC)이 새 버전을 자동으로 못 받아오는 경우를 대비한 기능입니다.
        아래 버튼을 누르면 현재 운송사 프로그램의 버전(v{currentVersion})을 기준으로,
        이보다 낮은 버전을 쓰고 있는 모든 화주사 화면 상단에 업데이트 안내가 강제로 표시됩니다.
      </p>
      <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5 text-[12px] text-gray-600 space-y-1">
        <div>현재 최신 버전 (운송사 기준): <span className="font-bold text-[#1B2B4B]">v{currentVersion}</span></div>
        <div>
          화주사 강제 최소 버전: <span className="font-bold">{minVersion ? `v${minVersion}` : "설정 안 됨"}</span>
          {isCurrentAlreadyMin && <span className="ml-2 text-emerald-600 font-semibold">(최신 상태로 반영됨)</span>}
        </div>
        <div>마지막 발송: {updatedAt?.seconds ? new Date(updatedAt.seconds * 1000).toLocaleString("ko-KR") : "-"}</div>
      </div>
      <button
        onClick={handleForceUpdate}
        disabled={sending}
        className="px-5 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition disabled:opacity-40"
      >
        {sending ? "발송 중..." : "화주사 강제 업데이트 발송"}
      </button>
    </div>
  );
}


// ⭐ 2026-11-06 관리자메뉴 › 모바일 미리보기 iframe — 현재 계정(uid)이 바뀌면 새로 연다 · 다 열릴 때까지 로딩 표시
function MobilePreviewFrame() {
  const uid = auth.currentUser?.uid || "anon";
  const [loaded, setLoaded] = useState(false);
  const src = React.useMemo(() => {
    if (isPreviewMode()) { const q = new URLSearchParams(window.location.search); q.set("kpmpv", "1"); return `/preview?${q.toString()}`; }
    return `/app?kpmpv=1&u=${encodeURIComponent(uid.slice(0, 8))}`;
  }, [uid]);
  useEffect(() => { setLoaded(false); }, [src]);
  return (
    <div className="relative">
      <iframe key={src} src={src} title="mobile-preview" onLoad={() => setLoaded(true)} className="w-full h-[760px] border border-gray-200 rounded-xl bg-[#0F1A30]" />
      {!loaded && <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-[#0F1A30] text-[#CFE0FF] text-[14px] font-bold">모바일 화면을 여는 중…</div>}
    </div>
  );
}
