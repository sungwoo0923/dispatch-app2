// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import MultiCompanySwitch, { useMultiCompany, CompanyToneDot } from "./MultiCompanySwitch"; // 🏢 2026-11-24 여러 회사 오가기
import { getMultiState } from "./multiCompany";
import { useFleetDispatchWayInstall } from "./fleetDispatchWay"; // 🚛 2026-11-23 지입차 배차방식 자동(회사별)
import { MENU_FEATURE, planIncludes, openPlanLock, useCompanyPlanId, PlanValueProvider, PlanValueSync, PlanLockHost, LockIcon, usePlan } from "./plans";
import { kpConfirm } from "./kpDialog";
import { runDelete, commitDeletes, deleteDocsAtomic } from "./DeleteProgress"; // ⏳ 2026-11-20 runBulkTask — 일괄 저장 · 수정 진행 창
import { stripSheetLink } from "./sheetLinkFields"; // ⭐ 2026-11-17 복사본에 구글시트 줄 주소를 넘기지 않는다 // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제(writeBatch)
import ProInsight from "./ProInsight";
import NameIdToggle from "./NameIdToggle"; // ⭐ 2026-11-09 계정 이름 ↔ 아이디
import DailyReport, { DailyReportPopupHost } from "./DailyReport"; // 📊 2026-11-06 일일 경영 보고(임원 화면 · 대표·임원 일일 보고서)
import { canSeeBriefing, BRIEF_MENU, BRIEF_LABEL } from "./dailyReport";
import { EXEC_MENUS, execMenuLabel, menuName } from "./execMenus";
import { ExecModeContext } from "./execUi"; // 👑 2026-11-17 임원 화면 디자인 시스템
const EXEC_SKIN_MENUS = ["HOME", "일일경영보고", "경영분석", "결재대기", "직원정보", "자금현황", "비공개운임", "스케줄", "영업관리", "결재함", "직원일정"]; // 임원 화면에서 남색 · 골드로 그리는 메뉴 // 📈 2026-11-08 임원 화면 · 경영 분석 · 결재 대기 · 직원 정보
import { useCopyTemplates } from "./copyTemplates";
import { CopyTemplateHost } from "./CopyTemplateEditor";
import OnboardingHost from "./Onboarding";
import PlatformNoticeBanner from "./PlatformNoticeBanner";
import { imeFocusRef } from "./imeFocus";
import { hideBlind, isBlindHidden } from "./blind";
import { cleanMgrRows } from "./mgrPlaceholder";
import { checkHolidayDispatch, restAckKey } from "./holidayConfirm";
// ⭐ 2026-11-02 속도 — 캡처·PDF 라이브러리는 저장 버튼을 누를 때 받는다(첫 로딩에서 약 580KB 제외)
import { lazyView, prefetchWhenIdle } from "./lazyLoad";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useVehicleTypes } from "./vehicleTypes"; // ⭐ 2026-11-02 회사 공용 차량종류
import { getTenant, isPreviewMode } from "./fsTenant";
import { useRevenuePw, revenuePwTexts, REVENUE_PW_NONE, REVENUE_PW_FORGOT, REVENUE_PW_MIN } from "./revenuePwApi"; // 🔐 2026-11-27 매출 비밀번호 서버 확인
// 🧪 개발 전용 — /preview?demo=1 둘러보기 점검에서는 매출관리 비밀번호 화면을 건너뛴다(배포 빌드에서는 항상 false)
const DEV_DEMO_REVENUE = import.meta.env.DEV && (() => { try { return window.location.pathname === "/preview" && new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; } })();
import { coDocKey } from "./coKey";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CartesianGrid, BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { registerCloseDays } from "./clientCloseDays"; // 🗓 2026-11-27 거래처별 마감일
import { setMgrNameMap } from "./MgrBadge";
const ReceiptCenter = React.lazy(() => import("./ReceiptCenter")); // 🧾 2026-11-09 배차현황 › 인수증관리
import { applyOwner } from "./orderOwner"; // 👤 2026-11-09 복사본 배차담당자
import { routeOwnerFill } from "./routeOwnerApply"; // ⭐ 2026-11-17 담당노선 주인 — 빈 배차담당자 채우기
import { isLockedOrder } from "../functions/routeOwnerCore.mjs";
import { payTypeStatusPatch, isPayCancel } from "./dispatchStatus"; // 🚚 2026-11-07 배차상태 공용 규칙
import { requestRouteSheetPush } from "./routeSheetPush"; // 💰 2026-11-06 고정노선 오더 고치면 바로 시트에
import { buildAliasMap, resolveOrderClient } from "./clientMerge"; // ⭐ 2026-11-17 합친 거래처의 옛 이름 → 남길 이름
import { DetailScope } from "./DetailFilter"; // 🔎 2026-11-03 세부검색(최대 3차)
import { BizScope } from "./companyBiz"; // ⭐ 2026-11-03 한 회사 · 여러 사업자 // ⭐ 2026-11-03 배차담당자 칸(등록자 + 차량 붙인 사람)
// ⚡ 2026-11-27 속도 — jszip 은 [전체저장(압축)]을 누를 때 받는다(handleSaveAllZip)
// 💬 2026-11-08 사장님 요청 — 카카오 알림톡은 PC·모바일 화면에서 모두 뺐다(새 오더는 알림톡:false → 서버 트리거가 보내지 않는다)
import CustomDatePicker from "./CustomDatePicker"; // ⭐ 2026-11-04 특수운임 제거 — specialDemandInfo·weatherUtil 사용 안 함
// ⭐ 2026-11-02 속도 — 관리자메뉴(엑셀 가져오기 등 포함)는 열 때 받는다. 직원 명부 구독은 usersLive 하나를 공유
import { subscribeUsersLive } from "./usersLive";
const AdminMenu = lazyView(() => import("./AdminMenu"));
import { useFixedRouteAutoDispatch } from "./FixedRoutes";
import { deptModeOf } from "./DeptDashboard";
import ViewSwitcher from "./ViewSwitcher"; // 🔀 2026-11-10 화면 전환 버튼 하나(팀 고르기 창)
const SalesHub = React.lazy(() => import("./SalesHub")); // 💼 2026-11-10 영업관리(처음 열 때 받는다)
import { ExecApprovals, TeamSchedule, ApprovalWorkspace, ExecScheduleBoard } from "./ExecSuite";
import { useMyProfile, myNameNow, setMyNameCache } from "./userNames";
import { nextFee } from "./forkliftCore"; // 🛠 2026-11-25 모바일 정산 저장도 PC와 같은 수수료 규칙
import { sendCompanyMail } from "./companyMail"; // ✉️ 2026-11-08 운송사별 발신 메일(예전 /api/send-email 대신)
import { MailSetupHost } from "./CompanyMailSettings";
import { useCompanyStaff, masterHasHr } from "./hrHandover";
import { CheckoutReminderHost } from "./attendanceQuick";
import { PersonalTodayHost } from "./PersonalSchedule";
import FixedRouteStatusHost, { useRouteBoardIds } from "./FixedRouteStatus"; // ⭐ 2026-11-06 담당자 칸·전용 오른쪽 클릭 메뉴
import { useRouteCarrierFilter } from "./routeCarriers"; // ⭐ 2026-11-05 고정노선 운송업체 설정 — 끈 업체 오더는 정산·매출에서 뺀다
import ColumnStyleHost from "./ColumnStyle"; // 🎨 2026-11-03 컬럼명 오른쪽 클릭 → 색 변경 // ⭐ 2026-11-03 배차현황 › 고정노선현황
import QuickNav from "./QuickNav";
import { useScreenFit, ScreenSettingsButton, BrowserZoomNotice } from "./ScreenFit"; // 🖥 2026-11-10 화면 맞춤 · 브라우저 확대 안내
import { usePendingSignups, isPendingSignupDriver } from "./pendingSignups";
import { NavHover, emitSubnav, NavGroupHover, groupNavMenus, navFlatPref } from "./navMenus";
import { publishDriverOrderRows, useDriverEventFeeds, useDriverEventCounts, setDriverSeenServer, setDriverToastsMuted, markDriverSeen, focusOrderRow, DriverEventToasts, DriverEventBell, KakaoBadge } from "./driverEvents"; // ⭐ 2026-11-05 기사앱 수락/거절·서류·긴급 알림(토스트·빨간 숫자·종)
import { AssetManager } from "./OfficeBooks";
import { FundsWorkspace, FundsBoard, isCeoPosition } from "./FundsBoard";
import { AccountingOverview, RetireDesk, useYearOrders } from "./AcctSuite";
import HrHub from "./HrHub";
import { usePayrollAccess } from "./payrollAccess"; // ⭐ 2026-11-06 직원 급여·연차 촉진 권한
const PayrollCenterLazy = React.lazy(() => import("./Payroll"));
import { AcctMenuGate } from "./PayrollGate"; // ⭐ 2026-11-18 회계관리 · 자금관리 메뉴 잠금
import AcctLedgerBooks from "./AcctLedgerBooks"; // ⭐ 2026-11-17 회계관리 › 회계 장부 — 총계정원장 모양(계산은 아래 AccountingDashboard 와 같음)
// ⭐ 2026-11-07 급여명세서 · 연차 사용 계획은 내정보 안 탭(MyInfoTabs) · 연차 사용 촉진은 인사관리부 › 연차 관리 안(LeaveArea)
import { myInfoExtraTabs } from "./MyInfoTabs";
import LeaveArea from "./LeaveArea";
// ⭐ 2026-11-02 속도 — 메뉴를 눌러야 보이는 큰 화면은 따로 떼어 처음 열 때 받는다(첫 실행 JS 감소) — 사용 안 하던 StandardFare·DispatchFormNew import 제거
const DriverAccounts = lazyView(() => import("./DriverAccounts"));
import { OnboardingBoard, CertIssuer } from "./HrTools";
const DriverDocsReview = lazyView(() => import("./DriverDocsReview"));
const StaffManager = lazyView(() => import("./StaffManager"));
const FixedClients = lazyView(() => import("./FixedClients"));
const FleetManagement = lazyView(() => import("./FleetManagement"));
import { FleetSettlementMenu } from "./FleetPayDocs";
import HomeDashboard from "./HomeDashboard";
import { EditModeProvider, EditableText, EditModeToggleButton } from "./EditMode";
import { useUiScreen, uiMenuList, uiMenuLabel } from "./uiConfig"; // ⭐ 2026-11-07 화면 편집 모드 — 메뉴 이름·순서·숨기기(권한은 그대로) · 배차등록 기본값
import { useCompanyDropdownSync } from "./companyDropdownOptions";
const RateCard = lazyView(() => import("./RateCard"));
// ⚡ 2026-11-27 속도 — AI 비서 · 메신저는 떠 있는 버튼이라 화면이 뜬 뒤 따로 받는다(자리표시 없음 — 받는 동안 버튼만 잠깐 늦게 보인다).
//  예전엔 배차 프로그램 첫 묶음에 같이 들어 로그인 → HOME 이 그만큼 늦었다
const AiAssistant = lazyView(() => import("./AiAssistant"), null);
const InternalMessenger = lazyView(() => import("./InternalMessenger"), null);
import { receivablesOf, invoiceDriverPlates, isTaxInvoiceSale, monthOf as billYmOf } from "./arAging"; // 🗓 2026-11-25 billYmOf = 청구월(마감월 → 없으면 상차일 달) · 정산상태는 예전 상차월 키도 같이 봄 // ⭐ 2026-11-07 미수금(부가세 포함) · 예상 부가세 공용 계산
const AttendanceBoard = lazyView(() => import("./AttendanceBoard"));
import { todayStr as attendanceTodayStr } from "./attendanceUtils";
const FreightRateInquiry = lazyView(() => import("./FreightRateInquiry"));
import { setNotificationsEnabled, useNotificationsEnabled } from "./notificationSettings";
import { PopupPrefsSection } from "./popupPrefs"; // ⭐ 2026-11-07 팝업 알림 켜고 끄기(계정별)
import { CustomSelect } from "./CustomSelect";
import { geocodeAddress, haversineKm } from "./tmapFareCalc";
import { useCustomRoles, findCustomRole, getMenuAccess, roleScreen, useRoleView, applyRoleMenus, ROLE_LABELS, hiddenInSwitchView, switchViewFor, builtinHidesMenu, EXEC_VIEW } from "./customRoles";
import { isExecTeam } from "./teamNames";
import { usePrivateFareGrant, PF_MENU } from "./privateFareGrant"; // 🔐 2026-11-18 비공개 운임(임원 화면 · 관리자센터에서 지정)
const PrivateFareVaultLazy = React.lazy(() => import("./PrivateFareVault")); // ⭐ 2026-11-17 임원 부서 통합관리자 → 로그인하면 경영 브리핑
import { useReadOnlyGuard } from "./readOnlyGuard";
import { confirmLeave } from "./leaveGuard";
import { useFleetLivePublish } from "./liveFleet"; // ⭐ 2026-11-05 배차완료 지입·직영·임대 기사 실시간 관제
import { subscribeOrderSync, OrderHistoryContext, pcLiveWindowStart, pcPrevDay, historyStartDate } from "./orderHistory";
import { generateMonthlyReportPPT, PPT_TEMPLATES } from "./pptReportUtil";
const PAY_TYPES = ["계산서", "착불", "선불", "계좌이체"];
// ⚠️ 이 컴포넌트를 BulkEditModal 안에 정의하면(리렌더마다 새 함수 = 새 컴포넌트
// 타입) 한 글자만 입력해도 input이 통째로 언마운트/재마운트되며 포커스가 빠지는
// 버그가 생긴다 — 반드시 모듈 스코프에 고정해서 매 렌더마다 같은 컴포넌트로
// 취급되게 한다.
const MoneyInput = ({ value, onChange }) => (
  <input autoComplete="off" className="w-full border border-gray-300 rounded px-1.5 py-1 text-[12px] text-right font-semibold"
    value={value ? Number(String(value).replace(/[^\d]/g, "")).toLocaleString() : ""}
    onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
);
const DISPATCH_TYPES = ["24시", "인성", "직접배차", "24시(외부업체)"];

const cellBase = "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[100px]";
const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100";
const inputBase = "border p-1 rounded w-36 text-center";
const inputStyle =
  "w-full border-0 border-b-2 border-gray-300 rounded-none px-1 py-2 text-[13px] font-bold text-gray-900 bg-transparent focus:outline-none focus:border-[#1B2B4B] transition";
// ⭐ 큰 목록(기사/거래처)은 화면이 바쁠 때 저장하면 잠깐 멈추므로, 연속 변경은 묶고 한가할 때 저장
const _idleSaveTimers = {};
const idleSave = (k, v) => {
  clearTimeout(_idleSaveTimers[k]);
  _idleSaveTimers[k] = setTimeout(() => {
    const run = () => safeSave(k, v);
    if (typeof window !== "undefined" && window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 5000 });
    else run();
  }, 1500);
};

/* -------------------------------------------------
   거래처 정규화
--------------------------------------------------*/
function normalizeClient(row) {
  if (!row) return null;
  if (typeof row === "string") return { 거래처명: row, 사업자번호: "", 사업자명: "", 메모: "" };
  return {
    // ⚠️ 실제 Firestore 문서 id를 여기서 빠뜨리면, 아래 normalizeClients가
    // 항상 거래처명으로 id를 재계산하게 되어 문서명(거래처명)이 실제 doc id와
    // 다른 경우(레거시/가져오기 등) 수정이 엉뚱한 새 문서에 저장되는 원인이 된다.
    id: row.id || row._id || "",
    거래처명: row.거래처명 || row.name || row.상호 || row.회사명 || row.title || "",
    사업자번호: row.사업자번호 || row.사업자등록증 || row.사업자등록번호 || "",
    사업자명: row.사업자명 || row.대표자 || row.대표자명 || row.ceo || "",
    // 메모(일반메모): 담당자가 참고용으로 자유롭게 적어두는 메모. 등록/입력 시 팝업을
    // 띄우는 데는 쓰이지 않는다 — 그 용도는 아래 오더메모가 대신한다.
    메모: row.메모 || row.memo || "",
    // 오더메모: 이 거래처명을 어디서(배차관리 상/하차지명·거래처명 등) 입력하든
    // 팝업표시가 켜져 있으면 메모 팝업으로 안내되는 메모.
    오더메모: row.오더메모 || "",
    기사전달주의사항: row.기사전달주의사항 || "",
    대표자: row.대표자 || row.사업자명 || "",
    업태: row.업태 || "",
    종목: row.종목 || "",
    주소: row.주소 || "",
    담당자: row.담당자 || "",
    연락처: row.연락처 || "",
    이메일: row.이메일 || row.email || "",
    등급: row.등급 || "일반",
    팝업표시: row.팝업표시 !== undefined ? row.팝업표시 : true,
    // 담당자가 여러 명인 기본거래처를 지원하려면 contacts 배열이 왕복(read-back)돼야
    // 한다 — 이게 빠지면 매 저장마다 "기존 담당자 목록"을 못 읽어와서 새 담당자를
    // 추가하는 대신 항상 덮어써버리고, 선택 팝업도 뜨지 않는다.
    contacts: Array.isArray(row.contacts) ? row.contacts : undefined,
    // ⭐ 순수매출제외: 매출관리에서 "순수 운송료"로 볼지 여부. true/false로 명시적으로
    // 저장된 적 있는 거래처만 키를 포함시킨다 — 한 번도 건드린 적 없는(레거시) 거래처는
    // 키 자체를 아예 안 만들어서(값이 undefined가 되지 않도록) Firestore 저장 시
    // "undefined 필드" 오류가 나지 않게 하고, isNetRevenueExcludedClient의 이름 기반
    // 폴백(후레쉬물류/채석강)이 계속 작동하게 한다.
    ...(typeof row.순수매출제외 === "boolean" ? { 순수매출제외: row.순수매출제외 } : {}),
    // ⭐ 매출순위제외: 순수매출제외와는 별개로, "총 매출/순수 운송료/신규·이탈 리스트"에는
    // 그대로 포함시키되 매출관리의 "월매출 TOP10"·"매출 감소 TOP10" 순위 집계에서만
    // 빼고 싶은 거래처용 플래그(예: 월 단위 합산청구처럼 배차 매출과 성격이 달라
    // 순위표에 넣으면 왜곡되는 거래처). 저장 규칙은 순수매출제외와 동일.
    ...(typeof row.매출순위제외 === "boolean" ? { 매출순위제외: row.매출순위제외 } : {}),
    // ⭐ 2026-11-03 여러 사업자 — 이 거래처를 고르면 자동으로 맞출 청구 사업자(비면 기본 = 회사)
    ...(row.기본사업자 ? { 기본사업자: String(row.기본사업자) } : {}),
    // 🗓 2026-11-27 거래처별 마감일(비우면 말일) · 적용 시작 청구월 — functions/arCore.mjs
    ...(row.마감일 ? { 마감일: String(row.마감일), 마감시작월: String(row.마감시작월 || "") } : {}),
    ...(row.마감변경 && typeof row.마감변경 === "object" ? { 마감변경: row.마감변경 } : {}), // [마감날짜 변경] 이번 달만
    ...(row.결제일 ? { 결제일: String(row.결제일) } : {}),
  };
}
function normalizeClients(arr) {
  if (!Array.isArray(arr)) return [];

  return arr
    .map(normalizeClient)
    .filter(c => c && c.거래처명)
    .map(c => ({
      id: c.id || c.거래처명,
      거래처명: c.거래처명 || "",
      사업자번호: c.사업자번호 || "",
      대표자: c.대표자 || "",
      업태: c.업태 || "",
      종목: c.종목 || "",
      주소: c.주소 || "",
      담당자: c.담당자 || "",
      연락처: c.연락처 || "",
      이메일: c.이메일 || "",
      메모: c.메모 || "",
      오더메모: c.오더메모 || "",
      기사전달주의사항: c.기사전달주의사항 || "",
      등급: c.등급 || "일반",
      팝업표시: c.팝업표시 !== undefined ? c.팝업표시 : true,
      contacts: Array.isArray(c.contacts) ? c.contacts : undefined,
      ...(typeof c.순수매출제외 === "boolean" ? { 순수매출제외: c.순수매출제외 } : {}),
      ...(typeof c.매출순위제외 === "boolean" ? { 매출순위제외: c.매출순위제외 } : {}),
      ...(c.기본사업자 ? { 기본사업자: c.기본사업자 } : {}),
      ...(c.마감일 ? { 마감일: c.마감일, 마감시작월: c.마감시작월 || "" } : {}), // 🗓 2026-11-27 거래처별 마감일
      ...(c.마감변경 ? { 마감변경: c.마감변경 } : {}),
      ...(c.결제일 ? { 결제일: c.결제일 } : {}),
    }));
}

/* -------------------------------------------------
   배차 수정 이력 생성 함수 (★ 반드시 필요)
--------------------------------------------------*/
function makeDispatchHistory({ userEmail, field, before, after }) {
  return {
    at: Date.now(),
    user: userEmail || "unknown",
    field,
    before,
    after,
  };
}

/* -------------------------------------------------
   Firebase
--------------------------------------------------*/
import { signOut } from "firebase/auth";
import { collection, addDoc, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, query, serverTimestamp, where, deleteField, FieldValue, Timestamp, GeoPoint, DocumentReference, Bytes, arrayUnion } from "firebase/firestore";
// 🛠 2026-11-13 Firestore 전용 값(serverTimestamp() · deleteField() · Timestamp 등) 판별 — 예전엔 클래스 "이름"으로 가렸는데,
//  배포본은 코드 압축으로 이름이 바뀌어 못 알아봤다 → 서버 시각이 { _methodName: "serverTimestamp" }라는 쓰레기 값으로 저장됐다(배차한 시간이 안 나오던 원인).
const isFsSpecialValue = (o) => o instanceof Date || o instanceof FieldValue || o instanceof Timestamp || o instanceof GeoPoint || o instanceof DocumentReference || o instanceof Bytes;
import { writeOrderDeletedNotice } from "./driverDeleteNotice"; // ⭐ 2026-11-05 기사앱 삭제 오더 팝업
import { setDoc, updateDoc } from "./orderWrite"; // ★ 오더 수정시각 자동 기록(여러 사용자 실시간 일치)
import KpBootScreen from "./KpBootScreen";
import AdminShell, { ShellIcon } from "./AdminShell";
import { FabButton, SizeButtons, DOCK_BG } from "./FloatDock";
import { pcBootStore, useMiniStore, makeBootTracker, markBootBase } from "./bootProgress";
import { auth, db, DEFAULT_COMPANY, clearFcmToken } from "./firebase";
import { LoginManagerModal } from "./LoginManager";
import "./pcTheme.css";
import "./pcColorRemap.css"; // ★ PC 알록달록 금지(남색 계열)
import { TM_AFFIL } from "./staffFilter";
import OrgChart from "./OrgChart";
import { MailHeaderButton, useMailCounts } from "./InternalMail";
import { useApprovalCounts } from "./Approval";
import { useDetailGetters } from "./detailGetters"; // ⭐ 2026-11-05 PC·모바일 일치 — 세부검색 값 공용
import { pickUnassignedOrders } from "./unassignedRule"; // ⭐ 2026-11-05 PC·모바일 일치 — 미배차 기준 공용
import { useBadgeSeenSync, useUnseenItems, useMarkSeenOnView, unionCount } from "./seenBadges"; // ⭐ 2026-11-06 메뉴 숫자 = 계정별 안 본 것
import { useMobileAlerts } from "./mobile/mobileAlerts";
import { loadAcctPayments, saveAcctPayments, loadPlManual, savePlManual } from "./acctPayments";
import { addClientCollection, removeClientCollections } from "./ledgerAuto";
import { paidEditGuard, paidDeleteWarn, fareChangeMark, paidFareLocked, PAID_FARE_LOCK_MSG } from "./payCore"; // 💸 2026-11-25 지급한 금액 기록(지급액)
// 💸 지급한 오더를 고칠 때 확인 — 여러 건을 한 번에 고쳐도 창이 줄줄이 뜨지 않게(한 번 [네]면 10초 동안은 다시 묻지 않는다)
let _paidEditAckUntil = 0; let _paidEditAsk = null;
const confirmPaidEdit = (msg) => {
  if (Date.now() < _paidEditAckUntil) return Promise.resolve(true);
  if (_paidEditAsk) return _paidEditAsk;
  _paidEditAsk = kpConfirm(msg, { title: "이미 지급한 오더예요", okText: "네", cancelText: "취소" })
    .then((ok) => { if (ok) _paidEditAckUntil = Date.now() + 10000; return ok; })
    .finally(() => { setTimeout(() => { _paidEditAsk = null; }, 0); });
  return _paidEditAsk;
};
import BannerCenter from "./BannerCenter";
import { ContractExpiryBanner } from "./companyContract"; // ⭐ 2026-11-06 계약 만료 안내 띠
import NotifyCenter from "./NotifyCenter"; // ⭐ 2026-11-03 알림 통합 — 공지·인사발령·전자결재·인수인계는 화면 가운데 팝업
import { RemoteSupportHost, openRemoteSupport, SUPPORT_ICON } from "./RemoteSupport"; // ⭐ 2026-11-02 원격지원 —
import OrderCongratsPopup from "./OrderCongratsPopup";
import BirthdayPopup from "./BirthdayPopup";
import { tryAutoCheckIn, kstToday as checkInToday } from "./autoAttendance";
import { shouldAttempt as shouldAttemptCheckIn, applyResult as applyCheckInResult, TICK_MS as CHECKIN_TICK_MS } from "./autoCheckInPlan"; // ⏰ 2026-11-09 자동 출근 재시도 규칙
import KpSubNav from "./KpSubNav";
import { useArDesk } from "./SettleDesk"; // 🧾 2026-11-07 거래명세서 단계 보드 · 미수금 데스크
// ⭐ 2026-11-02 운임규칙 — 회사별 운임 규칙(운임구분 → 기사운임·수수료 자동 계산)
import FareRulesSettings from "./FareRulesSettings";
import { useFareRules, canEditFareRules } from "./fareRules";
import { withRoutePresets } from "./routePreset"; // ⭐ 2026-11-17 노선별 고정 특수운임
import { paidOut, ForkliftDriverManager, ForkliftPayouts, orderProfit, profitTotals, fkNum } from "./forklift"; // 🏗 2026-11-09 지게차비용 · ⭐ 2026-11-17 수수료 한 식(orderProfit · profitTotals)
import { useTableSort, sortRows, SortTh } from "./tableSort";
import { useCompanyFeatures } from "./companyFeatures";
// 🧭 2026-11-12 업무 영역(내륙 · 컨테이너 · 해상 · 항공 · 통합 현황) — 회사가 쓰는 영역에 따라 상단 메뉴가 바뀐다(src/bizModules.js)
import { useBizModules, isBizMenu, parseBizMenu, bizTopMenus, bizSideGroups, bizFirstMenu, bizMenuKey, readBiz, writeBiz, BIZ_MENU_ICON, bizInfo as bizInfoOf, bizMenuLabel as bizMenuLabelOf } from "./bizModules";
import { reportScreen, installScreenVisibility } from "./screenReport";
import { useRouteGroupFilter, RouteGroupBar, SheetLiveChip, rgOnScreen, RG_TAB_OFF, RouteGroupSelect, filterRouteGroup } from "./routeGroups";
import { profitCls, profitRateCls } from "./marginPct"; // ⭐ 2026-11-17 정산관리 수익 · 수수료 옆 매출 대비 % · 이익 색(플러스 빨강 · 마이너스 파랑)
import { settleStartTab } from "./settleStart";
const SettleHome = React.lazy(() => import("./SettleHome")); // 🧭 정산 홈(처음 열 때 받는다)
const MonthClose = React.lazy(() => import("./MonthClose")); // ✅ 2026-11-16 월 마감 리디자인(배차자 1차 — 범위 고르기 · 시각화 · 그 자리에서 고치기)
import { isFinalLocked } from "./closeFlow"; // ✅ 2026-11-16 배차 마감 → 거래처정산
import UserHub from "./UserHub";
const CompanySwitcherLazy = React.lazy(() => import("./CompanySwitcher")); // 🔀 2026-11-19 운송사 전환(최고관리자 · 부관리자)
import { useCloseInbox, CloseInboxBanner, useFinalLockGuard, useCloseInboxCount } from "./closeInbox"; // 📥 2026-11-16 배차마감 도착 숫자 · 배너
import { useNewVersion } from "./VersionCheck";
import { hardReloadForUpdate } from "./UpdateBanner";
import { textifyOrder } from "./orderText"; // 🛠 2026-11-16 숫자로 저장된 글자 칸(차량번호 등) → 글자 // ✅ 2026-11-16 2단계 마감 — 배차현황 › 월 마감(배차자 1차) · 정산관리 › 마감 검증(경리 2차)
import { readHistoryCache, writeHistoryCache, fetchHistoryDelta, HISTORY_CACHE_MAX_AGE } from "./orderHistoryCache";
import { effectiveScope, scopeAllows, isOfficeBaseMenu, isOfficeScope } from "./workScope";
import { audienceAllows, activeViewOf, setDispatchAlertsOn } from "./notifyAudience"; // ⭐ 2026-11-17 알림 받는 사람(역할 · 부서 · 지금 화면)
import BizSwitcher from "./freight/BizSwitcher";
const FreightWorkspace = React.lazy(() => import("./freight/FreightWorkspace"));
const FreightHomeDeck = React.lazy(() => import("./freight/FreightHomeDeck")); // 🧭 2026-11-18 컨테이너 · 해상 · 항공 HOME
const FreightRevenueStrip = React.lazy(() => import("./freight/FreightSettle").then((m) => ({ default: m.FreightRevenueStrip })));
import { allowedModules } from "./freight/freightCore";
import { useBetaOn, CallDepositDesk } from "./CallPay";
import { BRAND, LogisMark, LogisWordmark, LogisTag } from "./brand";
import { isFleetGrade } from "./DriverAppGuide"; // ⭐ 2026-11-06 기사앱 안내 보내기
// ⭐ 2026-11-06 로지스웹 허브(운송사 간 오더 거래소) — [저장 + 허브 등록]

// ⭐ PC 화면 공통 머리말 + 탭(세그먼트) — 2026-10-22 디자인 개선 2단계
const KP_PAGE_META = {
  배차관리: { en: "DISPATCH", desc: "오더 등록과 배차 처리를 한 화면에서", icon: "M3 7h13l5 5v5h-2M3 7v10h2m0 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0m0 0h6m0 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0" },
  실시간배차현황: { en: "LIVE BOARD", desc: "어제·오늘·내일 오더를 실시간으로", icon: "M3 12h4l3-8 4 16 3-8h4" },
  배차현황: { en: "DISPATCH STATUS", desc: "기간별 배차 내역 조회·수정", icon: "M4 5h16M4 12h16M4 19h10" },
  단가표: { en: "RATE CARD", desc: "거래처·구간별 운임 단가", icon: "M4 4h16v16H4zM4 10h16M10 4v16" },
  // 운임조회는 화면 자체 머리말(FARE LOOKUP 헤더 + 전국/자사 탭)이 있어 생략
  기사관리: { en: "DRIVERS", desc: "기사 정보와 차량 관리", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" },
  거래처관리: { en: "CLIENTS", desc: "상하차지거래처·기본거래처 관리", icon: "M4 21V7l8-4 8 4v14M9 21v-6h6v6" },
  // 지입차관리는 화면 자체 머리말(지입차량 관제)이 있어 생략
  매출관리: { en: "REVENUE", desc: "매출·매입·수익 분석", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  정산관리: { en: "SETTLEMENT", desc: "거래처 정산과 기사 지급 관리", icon: "M3 6h18v12H3zM3 10h18M7 15h4" },
  관리센터: { en: "CONTROL CENTER", desc: "가입사 사용량·접속·청구 관제", icon: "M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z" },
  // 🏢 부서 모드(경리·인사) 메뉴
  회계관리: { en: "ACCOUNTING", desc: "미수금 · 미지급금 · 부가세를 담은 연간 회계 장부", icon: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" },
  인사관리부: { en: "HUMAN RESOURCES", desc: "이력서 · 인사발령 · 근태/근속 등 직원 인사 기록", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" },
  출근기록부: { en: "ATTENDANCE", desc: "출퇴근·지각·휴가·외근 현황", icon: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
  자금현황: { en: "TREASURY", desc: "통장·현금·예금·대출 잔액과 현금 흐름(조회)", icon: "M3 6h18v12H3zM3 10h18M16 15h2" },
  비공개운임: { en: "PRIVATE FARE", desc: "나만 보는 실제 청구 금액 · 차액(비밀번호로 열기)", icon: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" }, // 🔐 2026-11-18
  스케줄: { en: "EXECUTIVE SCHEDULE", desc: "임원 일정을 등록하면 모든 직원이 볼 수 있어요", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" },
  영업관리: { en: "SALES", desc: "영업 현황 · 영업 기회 · 거래처 담당 · 인센티브", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  자금관리: { en: "FINANCE", desc: "자금 현황(통장·현금·대출) · 수입·지출 장부 · 고정비", icon: "M3 6h18v12H3zM3 10h18M16 15h2" },
  비품관리: { en: "ASSETS", desc: "사무 비품·소모품·IT 자산 · 입출고", icon: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10" },
  연차관리: { en: "ANNUAL LEAVE", desc: "입사일 기준 발생·사용·잔여 연차", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" },
  입퇴사관리: { en: "ON/OFF BOARDING", desc: "입사·퇴사 체크리스트와 법정 기한", icon: "M9 11l3 3 8-8M20 12v7H4V5h11" },
  증명서발급: { en: "CERTIFICATES", desc: "재직·경력증명서 발급과 발급 대장", icon: "M6 3h9l5 5v13H6zM14 3v6h6M9 14h6M9 18h4" },
  기사서류: { en: "DRIVER DOCUMENTS", desc: "기사 필수 서류 제출·검토·만료 관리", icon: "M6 3h9l5 5v13H6zM14 3v6h6" },
  직원관리: { en: "STAFF", desc: "직원·기사 가입 승인과 권한", icon: "M16 11a4 4 0 1 0-8 0M3 21c0-4 4-6 9-6s9 2 9 6" },
  // 👔 임원 화면
  결재함: { en: "EXECUTIVE APPROVAL", desc: "최종 결재 · 결재 대기 · 회사 전체 결재 현황", icon: "M5 21h14M7 17h10l1-5H6zM12 12V4M9 4h6" },
  직원일정: { en: "TEAM SCHEDULE", desc: "연차 · 반차 · 외근 · 출장 등 직원 부재 일정 달력", icon: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" },
};
// ⭐ 2026-10-28 디지털 머리말 — 영문 태그·날짜·시계를 고정폭 디지털 글씨로, 아이콘 타일에 은은한 격자
function KpPageClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000 * 15); return () => clearInterval(t); }, []);
  const k = new Date(now.getTime() + 9 * 3600e3);
  const ymd = k.toISOString().slice(0, 10).replace(/-/g, ".");
  const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][k.getUTCDay()];
  const hm = k.toISOString().slice(11, 16);
  return (
    <div className="ml-auto hidden lg:flex items-center gap-2.5 h-10 pl-3 pr-1 rounded-[14px] bg-[#F5F8FD] border border-[#E3E8F0] shrink-0 tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7] animate-pulse" />
      <span className="text-[12.5px] font-bold text-[#3A4A66]">{ymd}</span>
      <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#9AA9C3]">{dow}</span>
      <span className="h-8 px-2.5 rounded-[10px] bg-[#0F1A30] text-white text-[13px] font-black flex items-center">{hm}</span>
    </div>
  );
}
function KpPageHeader({ menu }) {
  const meta = KP_PAGE_META[menu];
  if (!meta) return null;
  return (
    <div className="flex items-center gap-4 pb-4 mb-4 border-b border-[#EEF1F6]">
      <div className="relative w-12 h-12 rounded-[15px] flex items-center justify-center shrink-0 overflow-hidden shadow-[0_8px_20px_rgba(15,26,48,0.28)] ring-1 ring-white/10"
        style={{ background: "linear-gradient(135deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
        <span className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "8px 8px" }} />
        <svg className="relative" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={meta.icon} /></svg>
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{meta.en}</div>
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-[21px] font-black text-[#0F1A30] tracking-tight leading-tight whitespace-nowrap">{menuName(menu)}</h2>
          <span className="text-[13.5px] text-[#5B6B85] font-medium truncate">{meta.desc}</span>
        </div>
      </div>
      <KpPageClock />
    </div>
  );
}
// ⭐ 왼쪽 접이식 메뉴(2026-10-22) — 평소엔 왼쪽 끝 작은 손잡이만 보이고, 누르면 회사관리 메뉴와 같은 디자인의 메뉴가 펼쳐진다.
//    상단 메뉴와 같은 목록·같은 권한 규칙을 쓴다(목록은 DispatchApp이 넘겨준다).
const KP_SIDE_GROUPS = [
  { label: "홈", items: ["HOME"] },
  { label: "배차", items: ["배차관리", "실시간배차현황", "배차현황"] },
  { label: "운임", items: ["단가표", "운임조회"] },
  { label: "기사관리", items: ["기사관리"] },
  { label: "거래처", items: ["거래처관리"] },
  { label: "매출", items: ["매출관리", "인사이트"] },
  { label: "정산", items: ["정산관리"] },
  { label: "지입차관리", items: ["지입차관리"] },
  { label: "부서 업무", items: ["전자결재", "영업관리", "회계관리", "자금관리", "비품관리", "인사관리부", "증명서발급"] },
  { label: "회사관리", items: ["회사관리"] },
  { label: "관리자메뉴", items: ["관리자메뉴", "관리센터"] }, // 🧭 2026-11-14 회사관리에서 따로
];
// 📈 2026-11-08 임원 화면 · 경영 분석 · 결재 대기 · 직원 정보(처음 열 때 받는다)
const ExecAnalysis = React.lazy(() => import("./ExecAnalytics"));
import { AttachmentViewer, COLL, ClassicResume, CustomAlert, IGNORE_HISTORY_FIELDS, KP_MONO, MonthCompareAnalysis, MonthlyReport, PALLET_SPEC_TABLE, REVERSED_DATE_ORDER_MSG, StaffPerformance, VEHICLE_TYPES, _fmtKst, autoTransmitToShipper, buildNetRevenueExclusionLookup, dokchaOn, findApprovedShipperLive, fmtDispatchTime, formatPhone, getEditRequestDiff, getNetRevenueExcludedNames, globalShowAlert, isReversedDateOrder, normalizeCompanyKey, normalizePlate, safeLoad, safeSave, setGlobalShowAlert, sflowToast, todayStr, upsertPlace } from "./dispatch/shared/dispatchCommon.jsx"; // 🧩 2026-11-27 여러 화면이 같이 쓰는 도우미(옮김)
const ExecApprovalQueue = React.lazy(() => import("./ExecAnalytics").then((m) => ({ default: m.ExecApprovalQueue })));
const ExecStaffInfo = React.lazy(() => import("./ExecStaffInfo"));

const DEPT_MENUS = {
  // 경리: 돈(정산·회계·자금) + 확인용 배차현황 — 배차관리·실시간배차현황은 빼고
  acct: ["HOME", "전자결재", "배차현황", "정산관리", "매출관리", "회계관리", "자금관리", "비품관리", "기사관리", "관리자메뉴", "회사관리"],
  // 인사: 사람(인사관리부·출근기록부를 회사관리에서 상단으로) — 매출·정산은 빼고
  // 연차관리·직원 정보·퇴사는 인사관리부 안으로, 직원 승인은 관리자메뉴, 기사 승인은 기사관리 안으로(2026-10-31 중복 정리)
  // 🚛 2026-11-15 기사관리(배차자용)는 인사 화면에서 뺐다 — 소속 기사는 인사관리부 › 인사관리 › 지입관리에서 본다
  hr: ["HOME", "전자결재", "인사관리부", "증명서발급", "관리자메뉴", "회사관리"],
  // 💼 2026-11-10 영업: 영업관리(실적·인센티브·영업 기회) + 거래처·단가·운임 + 확인용 배차현황 — 배차 등록·정산은 빼고
  // 🧹 2026-11-15 영업은 홈 · 전자결재 · 영업관리 · 회사관리만 — 배차현황 · 운임 · 배차자용 거래처관리 · 배차 기준 매출관리는 뺐다(내 매출 · 인센 · 내 거래처는 영업관리 안에서)
  // 🧾 2026-11-27 견적서 작성(단가표 › 직접 작성 · 발행 이력, 운임조회 › 운임 산출)은 영업 일 — 단가표 · 운임조회를 다시 넣었다
  sales: ["HOME", "전자결재", "영업관리", "단가표", "운임조회", "회사관리"],
  // 👔 임원(대표·전무·이사) — 보고·결재·매출 중심
  // 결재는 홈 › 전자결재에 다 있어 상단에서 뺐다(2026-10-31)
  exec: ["HOME", "일일경영보고", "경영분석", "결재대기", "직원정보", "자금현황", "비공개운임", "스케줄", "매출관리", "영업관리", "인사이트", "관리자메뉴", "회사관리"], // 📊 2026-11-06 일일 경영 보고 — 임원 홈(경영 브리핑) 바로 다음 // 직원일정은 HOME › 사내 게시판으로(2026-11-01)
};
// 부서 모드 왼쪽 메뉴 묶음
const DEPT_SIDE_GROUPS = {
  acct: [
    { label: "경리 · 회계", items: ["HOME", "전자결재", "정산관리", "매출관리", "회계관리"] },
    { label: "자금 · 총무", items: ["자금관리", "비품관리"] },
    { label: "기사", items: ["기사관리"] },
    { label: "확인 · 관리", items: ["배차현황", "관리자메뉴", "회사관리"] },
  ],
  hr: [
    { label: "인사", items: ["HOME", "전자결재", "인사관리부", "증명서발급"] },
    { label: "관리", items: ["관리자메뉴", "회사관리"] },
  ],
  sales: [
    { label: "영업", items: ["HOME", "전자결재", "영업관리"] },
    { label: "관리", items: ["회사관리"] },
  ],
  exec: [
    { label: "경영", items: ["HOME", "일일경영보고", "경영분석", "결재대기", "직원정보", "자금현황", "비공개운임", "매출관리", "영업관리", "인사이트"] },
    { label: "일정", items: ["스케줄"] },
    { label: "관리", items: ["관리자메뉴", "회사관리"] },
  ],
};
const KP_SIDE_ICONS = {
  HOME: "dashboard", 배차관리: "truck", 실시간배차현황: "bell", 배차현황: "sheet", 단가표: "money", 운임조회: "globe",
  기사관리: "user", 거래처관리: "building", 지입차관리: "link", 매출관리: "check", 정산관리: "inbox",
  회사관리: "idcard", 관리자메뉴: "key", 관리센터: "shield", 인사이트: "chart",
  영업관리: "trend", 회계관리: "money", 인사관리부: "idcard", 출근기록부: "clock", 직원관리: "users", 기사서류: "file",
  자금관리: "wallet", 비품관리: "list", 연차관리: "flag", 입퇴사관리: "check", 증명서발급: "stamp",
  결재함: "stamp", 직원일정: "clock", 자금현황: "wallet", 비공개운임: "key", 스케줄: "pin", 전자결재: "stamp", 일일경영보고: "chart", 경영분석: "chart", 결재대기: "stamp", 직원정보: "users",
};
const kpNavIcon = (m) => KP_SIDE_ICONS[m] || (isBizMenu(m) ? BIZ_MENU_ICON[parseBizMenu(m).page] : undefined);
function KpSideMenu({ open, onOpen, onClose, menuState, active, onSelect, company, email, myName = "", groups = KP_SIDE_GROUPS }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      {/* 🧭 2026-11-27 사용자 요청 — 왼쪽 끝 손잡이(메뉴 펼치기) 바는 없앴다(메뉴는 위 상단바 · 각 화면 왼쪽 메뉴로) */}
      {/* 펼쳤을 때 */}
      <div
        className={`fixed inset-0 z-[9990] bg-[#0F1A30]/40 backdrop-blur-[2px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        data-backdrop-close /* 왼쪽 메뉴 — 바깥을 누르면 닫힘(서랍) */
        onClick={onClose}
      />
      <aside
        className={`kp-side-aside fixed left-0 top-0 bottom-0 z-[9991] w-[256px] flex flex-col text-white shadow-[12px_0_40px_rgba(15,26,48,0.35)] transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "linear-gradient(180deg, #16264A 0%, #1B2B4B 55%, #14213D 100%)" }}
      >
        <div className="px-5 pt-6 pb-5 border-b border-white/10 flex items-center gap-3">
          <LogisMark size={40} spot="sidemenu" />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.18em] text-blue-200/70"><LogisTag height={8} text="MENU" spot="sidemenu" /></div>
            <div className="text-[15px] font-bold truncate mt-0.5">{company || BRAND}</div>
          </div>
          <button onClick={onClose} title="메뉴 접기" className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0" style={{ opacity: 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
          {groups.map((g) => {
            const items = uiMenuList("pc", g.items).map((m) => ({ m, st: menuState(m) })).filter(({ st }) => st !== "hidden");
            if (!items.length) return null;
            return (
              <div key={g.label}>
                <div className="px-3 mb-1.5 text-[11px] font-bold text-blue-200/75">{g.label}</div>
                <div className="space-y-1">
                  {items.map(({ m, st }) => {
                    const on = m === active;
                    const blocked = st === "blocked";
                    return (
                      <button
                        key={m}
                        disabled={blocked}
                        onClick={() => { onSelect(m); onClose(); }}
                        data-on={on ? "1" : "0"}
                        className={`kp-side-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition ${
                          blocked ? "text-white/25 cursor-not-allowed"
                            : on ? "bg-white text-[#1B2B4B] shadow-[0_6px_16px_rgba(0,0,0,0.18)]" : "text-blue-50/80 hover:bg-white/[0.08] hover:text-white"
                        }`}
                        style={{ opacity: 1 }}
                      >
                        <ShellIcon name={kpNavIcon(m)} size={18} className={on ? "text-[#1B2B4B]" : "text-blue-200/80"} />
                        <span className="flex-1 text-left truncate">{uiMenuLabel("pc", m, m === BRIEF_MENU ? BRIEF_LABEL : execMenuLabel(m))}</span>
                        {st === "locked" && <span className="opacity-60"><LockIcon size={12} /></span>}
                        {on && <span className="w-1.5 h-1.5 rounded-full bg-[#4B6CB7]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        {(email || myName) && <div className="px-5 py-4 border-t border-white/10 text-[12px] text-blue-100/60"><NameIdToggle name={myName || ""} id={email || ""} className="w-full hover:text-white" /></div>}
      </aside>
    </>
  );
}

const kpTabWrap = "inline-flex items-center gap-1 p-1 rounded-[14px] bg-[#EEF2F8] border border-[#E3E8F0]";
const kpTabCls = (on) => `px-5 h-9 rounded-[10px] text-[13.5px] transition whitespace-nowrap ${
  on ? "bg-white text-[#0F1A30] font-extrabold shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_10px_rgba(16,24,40,0.08)]"
     : "text-[#5B6B85] font-bold hover:text-[#0F1A30] hover:bg-white/60"}`;

// ⭐ 오더 표(실시간배차현황·배차현황·미배차현황) 머리글 클릭 정렬에 쓰는 "칸 값" 꺼내기.
// 머리글 이름 = 오더 필드 이름이 대부분이고, 다른 것만 여기서 맞춰준다.
// (정렬은 src/tableSort.jsx — 이 브라우저에만 기억, Firestore 저장 안 함)
const _sortInt = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
// ⭐ 2026-11-02 배차표 "배차담당자" 칸(회사별 맞춤 기능 orderManagerCol) — 그 오더를 등록한 직원 이름.
//   오더에 남은 등록자 값(작성자 이메일·uid·등록자명 등)을 직원 목록(userNameMap: uid/이메일 → 이름)으로 실명으로 바꾼다
//   (오더 복사·수정 패널의 등록자/변경 이력과 같은 방식). 고정노선이 만든 오더는 "고정노선", 못 찾으면 "미지정".
//   이름은 오더(줄 객체)마다 한 번만 계산해 WeakMap에 담아 두고 다시 그릴 땐 꺼내기만 한다(직원 목록이 바뀔 때만 새로).
//   기능이 꺼진 회사는 null(칸 자체가 없음).
// 🔎 2026-11-03 상/하차지 검색 공용 — 업체명이 같고 주소·담당자만 다른 곳이 많을 때(예: (도외)위탁 55곳)
//  "도외 목포"처럼 띄어 쓰면 첫 낱말은 업체명, 나머지 낱말은 주소·담당자·전화번호에서 찾아 바로 좁힌다.
//  점수: 업체명 완전일치 > 앞글자 일치 > 포함, 같은 점수는 업체명 → 주소 순.
// → src/placeSearch.js 로 옮김(일괄수정 · 복사 창도 같은 검색을 쓴다)
// ⭐ 2026-11-05 PC·모바일 일치 — 등록 직원 이름·세부검색 값 꺼내기는 src/detailGetters.js(모바일도 같은 파일)
// 수정할 때 덮어쓰면 안 되는 등록자 칸(patchDispatch)
const ORDER_CREATOR_FIELDS = ["작성자", "createdByEmail", "createdByUid", "createdBy", "createdByName", "등록자", "등록자명", "등록자이메일", "authorEmail", "author", "등록기기"];
// 🔐 테스트 계정이면 다른 컬렉션 사용
const getCollectionName = (role) =>
  role === "test" ? "orders_test" : "orders";

// 경유지 필드(배열/JSON문자열/숫자키 객체)를 배열로 — 예전 오더 불러오기에서 실시간 리스너와 같은 모양으로 맞추기 위함
const parseWaypointsShared = (v) => {
  if (Array.isArray(v) && v.length > 0) return v;
  if (typeof v === "string" && v.startsWith("[")) try { const p = JSON.parse(v); if (Array.isArray(p) && p.length > 0) return p; } catch { /* 무시 */ }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const ks = Object.keys(v);
    if (ks.length > 0 && ks.every(k => /^\d+$/.test(k))) return ks.sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
    if (v.업체명) return [v];
  }
  return null;
};

// ⭐ 2026-11-05 PC·모바일 일치 — 기사·거래처 저장(PC 화면과 모바일 기사관리·거래처관리가 같은 함수를 쓴다)
async function pcUpsertDriver({ drivers = [], role, userCompany, myRealName, user }, driver) {
  const viewCompany = role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
    : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);

  // ★ id가 없을 때: 차량번호 기준으로 기존 기사 찾기 (중복 생성 방지)
  let id = driver.id;
  if (!id && driver.차량번호) {
    const normPlate = (s="") => String(s).replace(/\s+/g, "").toUpperCase();
    const existing = drivers.find(d => normPlate(d.차량번호) === normPlate(driver.차량번호));
    if (existing?.id) id = existing.id;
    // 로컬 drivers state에 아직 없는 차량번호라면(신규 기사이거나, 방금 다른 곳에서
    // upsertDriver를 호출했는데 realtime 리스너가 아직 그 결과를 반영하지 못한 경우)
    // crypto.randomUUID()로 매번 새 문서를 만들면, 짧은 시간에 같은 차량번호로 여러 번
    // 호출될 때(연속 오더 등록 등) 서로의 존재를 모른 채 완전히 동일한 내용의 문서가
    // 여러 개 생긴다 — 차량번호 자체를 문서 id로 써서 항상 같은 문서로 수렴하게 한다.
    else id = coDocKey(viewCompany, normPlate(driver.차량번호)); // 회사별 문서 이름(다른 운송사 같은 차량번호와 충돌 방지)
  }
  if (!id) id = crypto.randomUUID();

  // ★ 담당자(등록자) — 이 기사 문서를 최초로 만든 스태프 이름을 기록해둔다(기사관리
  // 목록의 "담당자" 컬럼용, 지입/직영 기사 전용). 이미 등록자가 있으면 이후 수정으로
  // 덮어쓰지 않고 최초 등록자를 그대로 유지한다.
  const existingDriverDoc = drivers.find(d => d.id === id);
  const registeredBy = existingDriverDoc?.등록자 || driver.등록자 ||
    (!existingDriverDoc ? (myRealName || user?.displayName || user?.email?.split("@")[0] || "") : undefined);

  const data = {
    ...driver,
    id,
    companyName: driver.companyName || viewCompany,
    updatedAt: serverTimestamp(),
    createdAt: driver.createdAt || serverTimestamp(),
    ...(registeredBy !== undefined ? { 등록자: registeredBy } : {}),
  };

  // ⭐ 사용자 보고: 신규 기사 등록 시 "등록완료" 팝업이 뜨기까지 딜레이가 너무 길다 —
  // Firestore 최신 SDK는 setDoc()이 반환하는 Promise를 "서버가 이 쓰기를 확인했을
  // 때"에야 resolve한다(로컬 캐시엔 이미 즉시 반영되지만, await 하는 쪽은 서버
  // 왕복이 끝날 때까지 계속 기다리게 됨). 이 화면들이 하나같이 upsertDriver를
  // await한 다음에야 팝업을 닫고 "등록완료" 알림을 띄우는 구조라, 네트워크가 느리면
  // 그 왕복 시간만큼 그대로 체감 딜레이가 된다. 이 앱 다른 곳(handleCarInput 등)의
  // "낙관적 업데이트 후 백그라운드 저장" 방식과 동일하게, 여기서도 쓰기를 기다리지
  // 않고 즉시 반환한다 — 로컬 캐시(persistentLocalCache)가 이미 즉시 반영해주므로
  // 화면(onSnapshot 기반 drivers 목록)엔 어차피 곧바로 나타나고, 실제 서버 반영은
  // 백그라운드에서 계속 진행된다.
  setDoc(
    doc(db, COLL.drivers, id),
    data,
    { merge: true }
  ).catch((e) => console.error("기사 정보 저장 실패:", e));

  return id;
}

async function pcUpsertClient({ role, userCompany, places = [] }, client) {
    // ⚠️ 거래처명을 id보다 먼저 쓰면, 이미 존재하는 문서를 수정(특히 거래처명 자체를
    // 바꾸는 경우)할 때마다 원래 문서 대신 "새 거래처명" 이름의 새 문서를 만들게 된다
    // (하차지거래처 upsertPlace는 _id를 그대로 존중하는데 여기만 예외였다) — 전달된
    // id가 있으면 그것을 최우선으로 쓴다.
    const viewCompany = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
      : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
    // ⭐ 2026-11-01 새 거래처 문서 이름은 회사별로(다른 운송사의 같은 거래처명 문서를 덮어쓰던 문제)
    const id = client.id || (client.거래처명 ? coDocKey(viewCompany, client.거래처명) : crypto.randomUUID());
    // ⭐ 2026-11-11 저장이 실패하면 이유를 알려 준다(예전엔 아무 말 없이 창만 그대로 남았다)
    try {
      await setDoc(
        doc(db, COLL.clients, id),
        { ...client, id, companyName: client.companyName || viewCompany },
        { merge: true }
      );
    } catch (e) {
      window.alert(`거래처를 저장하지 못했습니다.\n${e?.code === "permission-denied" ? "저장 권한이 없습니다." : e?.message || e}`);
      throw e;
    }

    // ═══════════════════════════════════════════════════
    // 기본거래처 ↔ 하차지거래처 동기화 — 같은 이름의 하차지거래처가 있으면 주소/담당자/
    // 메모/오더메모를 그대로 반영한다. upsertPlace를 다시 부르지 않고 직접 write해서
    // 서로 재귀 호출되지 않게 한다. 이번 호출에서 실제로 넘어온 필드만 반영한다
    // (예: 오더메모만 고친 호출이 주소/담당자를 비워버리면 안 되므로).
    // ═══════════════════════════════════════════════════
    try {
      const nameKey = normalizeCompanyKey(client.거래처명 || "");
      if (nameKey) {
        const matches = (places || []).filter(p => normalizeCompanyKey(p.업체명 || "") === nameKey);
        for (const m of matches) {
          const syncFields = {};
          if (client.주소 !== undefined) syncFields.주소 = client.주소;
          if (client.contacts !== undefined) syncFields.contacts = client.contacts;
          if (client.담당자 !== undefined) syncFields.담당자 = client.담당자;
          if (client.연락처 !== undefined) syncFields.담당자번호 = client.연락처;
          if (client.메모 !== undefined) syncFields.메모 = client.메모;
          if (client.오더메모 !== undefined) syncFields.오더메모 = client.오더메모;
          if (client.팝업표시 !== undefined) syncFields.팝업표시 = client.팝업표시;
          if (client.기사전달주의사항 !== undefined) syncFields.기사전달주의사항 = client.기사전달주의사항;
          if (client.점심시작시간 !== undefined) syncFields.점심시작시간 = client.점심시작시간;
          if (client.점심종료시간 !== undefined) syncFields.점심종료시간 = client.점심종료시간;
          if (client.순수매출제외 !== undefined) syncFields.순수매출제외 = client.순수매출제외;
          if (client.매출순위제외 !== undefined) syncFields.매출순위제외 = client.매출순위제외;
          if (Object.keys(syncFields).length) {
            await setDoc(doc(db, "places", m._id || m.id), syncFields, { merge: true }).catch(() => {});
          }
        }
      }
    } catch {}
  }

function useRealtimeCollections(user, userCompany, role) {
  // ⚡ T165 — 매번 빈 배열로 시작해 Firestore 최초 응답을 기다리는 동안 화면이 비어 보이던 문제.
  //    직전 세션에서 safeSave로 남겨둔 로컬 캐시를 초기값으로 먼저 그려주고,
  //    실시간 리스너가 응답하는 즉시 최신 데이터로 교체한다(정확성에는 영향 없음, 최초 페인트만 개선).
  // ⭐ 블라인드 오더(최고관리자 전용)는 어떤 경로로 들어오든 여기서 걸러진다.
  const [dispatchDataLive, setDispatchDataRaw] = useState(() => cleanMgrRows(hideBlind(safeLoad("dispatchData", []))));
  // ⭐ 예전 오더 보관소 — 실시간 범위(최근 7일~) 밖 오더를 화면이 필요할 때만 불러와 담는다.
  const [historyMap, setHistoryMap] = useState(() => new Map());
  const historyMapRef = React.useRef(historyMap); historyMapRef.current = historyMap;
  // 화면에서 바로 고치는 값(함수형 업데이트)은 실시간 목록·예전 오더 양쪽에 똑같이 적용한다.
  // 배열을 통째로 넣는 건 실시간 리스너뿐이라 실시간 목록만 바꾼다.
  const setDispatchData = React.useCallback((v) => {
    setDispatchDataRaw(prev => cleanMgrRows(hideBlind(typeof v === "function" ? v(prev) : v))); // 고정노선 자리 채움 "담당자" → 빈 값
    if (typeof v === "function") {
      setHistoryMap(prev => {
        if (prev.size === 0) return prev;
        const before = [...prev.values()];
        const after = v(before) || [];
        if (after.length === before.length && after.every((r, i) => r === before[i])) return prev; // 바뀐 게 없으면 그대로
        const next = new Map();
        after.forEach(r => next.set(`${r.__col}/${r._id}`, r));
        return next;
      });
    }
  }, []);
  // 화면에 주는 dispatchData = 실시간 + 불러온 예전 오더(같은 오더면 실시간 쪽 우선)
  const dispatchData = React.useMemo(() => {
    if (historyMap.size === 0) return dispatchDataLive;
    const liveKeys = new Set(dispatchDataLive.map(r => `${r.__col}/${r._id}`));
    const extra = cleanMgrRows(hideBlind([...historyMap.values()].filter(r => !liveKeys.has(`${r.__col}/${r._id}`))));
    return [...dispatchDataLive, ...extra];
  }, [dispatchDataLive, historyMap]);
  const [historyLoading, setHistoryLoading] = useState(0);
  const loadedRangesRef = React.useRef([]);
  // ⭐ 초기화·복원·가져오기 취소가 끝나면(서버가 systemConfig/dataVersion.{회사}에 시각을 남김)
  //    이미 불러와 둔 예전 오더를 비우고 다시 불러온다 — 창을 켜둔 채 초기화하면 지운 오더가 화면에 남던 문제
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const fullLoadedRef = React.useRef(false);
  const fullLoadingRef = React.useRef(null);
  const rawSinkRef = React.useRef(null); // 전체 이력을 새로 받을 때 원본 문서를 모아 이 PC에 보관(src/orderHistoryCache.js)
  const fetchHistoryRows = React.useCallback(async (makeQuery) => {
    setHistoryLoading(n => n + 1);
    try {
      // ⚡ 수만 건을 한 번에 변환하면 그동안 입력·스크롤이 멈춘다(끊김) — 400건씩 나눠 사이사이 화면에 양보한다
      const toRows = async (col, snap) => {
        const docs = snap.docs; const out = new Array(docs.length);
        for (let i = 0; i < docs.length; i++) {
          if (i && i % 400 === 0) await new Promise((r) => setTimeout(r, 0));
          const d = docs[i]; const data = textifyOrder(d.data() || {});
          out[i] = {
            __col: col, ...data, _id: d.id,
            경유지_상차: parseWaypointsShared(data.경유지_상차) || parseWaypointsShared(data.경유상차목록) || [],
            경유지_하차: parseWaypointsShared(data.경유지_하차) || parseWaypointsShared(data.경유하차목록) || [],
          };
        }
        return out;
      };
      // ⚡ 2026-11-13 makeQuery 대신 { raw: [{col,id,data}] }를 주면 이미 받아 둔 문서(이 PC 보관본)로 같은 변환을 한다
      const rawIn = makeQuery && typeof makeQuery === "object" ? makeQuery.raw : null;
      const parts = rawIn
        ? await Promise.all(["orders", "dispatch"].map(col => toRows(col, { docs: rawIn.filter(x => x.col === col).map(x => ({ id: x.id, data: () => x.data })) })))
        : await Promise.all(["orders", "dispatch"].map(col =>
          getDocs(makeQuery(collection(db, col))).then(snap => { if (rawSinkRef.current) snap.docs.forEach(d => rawSinkRef.current.push({ col, id: d.id, data: d.data() || {} })); return toRows(col, snap); })));
      // 실시간 목록과 같은 기준으로 제외(화주 전송 사본·취소건)
      const rows = parts.flat().filter(row =>
        row.source !== "transport_transmit" &&
        row.배차상태 !== "배차취소" &&
        !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태));
      // 많은 오더를 합치는 작업은 낮은 우선순위로 — 입력·스크롤이 먼저 반응하게
      if (rows.length) React.startTransition(() => setHistoryMap(prev => { const next = new Map(prev); rows.forEach(r => next.set(`${r.__col}/${r._id}`, r)); return next; }));
      return rows;
    } catch (e) {
      console.error("예전 오더 불러오기 실패:", e);
      return null; // 실패 — 호출한 쪽이 "받은 것"으로 기록하지 않게(다음에 다시 시도)
    } finally {
      setHistoryLoading(n => Math.max(0, n - 1));
    }
  }, []);
  // 기간 조회 — 실시간 범위 밖 부분만, 이미 받은 기간은 다시 받지 않는다
  const loadRange = React.useCallback(async (from, to) => {
    if (!from) return [];
    const liveStart = pcLiveWindowStart();
    const end = (!to || to >= liveStart) ? pcPrevDay(liveStart) : to;
    if (from > end) return [];
    if (loadedRangesRef.current.some(([a, b]) => a <= from && b >= end)) return [];
    const range = [from, end];
    loadedRangesRef.current.push(range);
    const rows = await fetchHistoryRows(c => query(c, where("상차일", ">=", from), where("상차일", "<=", end)));
    if (rows === null) { loadedRangesRef.current = loadedRangesRef.current.filter(r => r !== range); return null; } // 실패한 기간은 다시 받을 수 있게(실패 = null)
    return rows;
  }, [fetchHistoryRows, historyEpoch]); // eslint-disable-line react-hooks/exhaustive-deps
  // 오더복사·운임조회 등 전체 이력이 필요한 기능을 처음 쓸 때 1회
  const loadFullHistory = React.useCallback(() => {
    if (fullLoadedRef.current) return Promise.resolve();
    if (fullLoadingRef.current) return fullLoadingRef.current;
    // 예전 PC와 같은 최근 13개월(그보다 예전 기간은 날짜 조회 시 그 기간만 따로 불러온다)
    const hStart = historyStartDate();
    const liveStart = pcLiveWindowStart();
    const done = (rows) => { if (rows !== null) { fullLoadedRef.current = true; loadedRangesRef.current.push([hStart, pcPrevDay(liveStart)]); } };
    // ⚡ 2026-11-13 이 PC에 보관해 둔 13개월 오더가 있으면 그것을 쓰고, 그 뒤에 바뀐 것만 받는다(없거나 오래됐으면 전체를 받아 보관)
    const co = String(getTenant() || userCompany || localStorage.getItem("userCompany") || "").trim();
    const fullFetch = async (dv) => {
      const sink = []; const startedAt = Date.now();
      rawSinkRef.current = sink;
      let rows;
      try { rows = await fetchHistoryRows(c => query(c, where("상차일", ">=", hStart), where("상차일", "<", liveStart))); } finally { rawSinkRef.current = null; }
      if (rows !== null && co) writeHistoryCache(co, { savedAt: startedAt, fullAt: startedAt, dv, hStart, liveStart }, sink);
      return rows;
    };
    fullLoadingRef.current = (async () => {
      let dv = 0;
      try { const t = (await getDoc(doc(db, "systemConfig", "dataVersion"))).data()?.[co]; dv = t?.toMillis ? t.toMillis() : 0; } catch { dv = -1; }
      const cache = co && dv >= 0 ? await readHistoryCache(co) : null;
      const usable = cache && cache.dv === dv && cache.hStart <= hStart && Date.now() - cache.fullAt < HISTORY_CACHE_MAX_AGE && cache.liveStart <= liveStart;
      if (!usable) return fullFetch(dv < 0 ? 0 : dv);
      try {
        const startedAt = Date.now();
        const delta = await fetchHistoryDelta({ since: cache.savedAt, gapFrom: cache.liveStart, gapTo: liveStart });
        const map = new Map(cache.docs.map((x) => [`${x.col}/${x.id}`, x]));
        delta.changed.forEach((x) => map.set(`${x.col}/${x.id}`, x));
        delta.deleted.forEach((k) => map.delete(k));
        // 보관 범위 = 13개월 전 ~ 실시간 범위 시작 전(그 밖으로 옮겨진 오더는 뺀다 — 최근 7일은 실시간이 맡는다)
        const docs = [...map.values()].filter((x) => { const d = String(x.data?.상차일 || ""); return d >= hStart && d < liveStart; });
        const rows = await fetchHistoryRows({ raw: docs });
        if (rows !== null) {
          // 보관본에서 빠진 오더(지워짐 · 최근 범위로 옮겨짐)를 화면 보관소에서도 뺀다
          const keep = new Set(docs.map((x) => `${x.col}/${x.id}`));
          const gone = [...delta.deleted, ...delta.changed.map((x) => `${x.col}/${x.id}`).filter((k) => !keep.has(k))];
          if (gone.length) setHistoryMap((prev) => { let next = null; gone.forEach((k) => { if (prev.has(k)) { next = next || new Map(prev); next.delete(k); } }); return next || prev; });
          writeHistoryCache(co, { savedAt: startedAt, fullAt: cache.fullAt, dv, hStart: cache.hStart, liveStart }, docs);
        }
        return rows;
      } catch (e) { console.warn("[예전 오더 보관본] 바뀐 것만 받기 실패 → 전체 다시 받기", e?.code || e); return fullFetch(dv); }
    })().then(done).finally(() => { fullLoadingRef.current = null; });
    return fullLoadingRef.current;
  }, [fetchHistoryRows, historyEpoch]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!user) return undefined;
    const myCompany = () => (role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
      : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY));
    let seen = null;
    return onSnapshot(doc(db, "systemConfig", "dataVersion"), (snap) => {
      // ⭐ 폰/PC 저장본(캐시)의 옛 값은 무시 — 서버 값만 기준으로 삼는다(예전엔 앱을 켤 때마다 캐시→서버 값 차이를 "새 초기화"로 오인해 전체를 다시 불러와 느려졌다)
      if (snap.metadata.fromCache) return;
      const t = snap.data()?.[myCompany()];
      const ms = t?.toMillis ? t.toMillis() : 0;
      if (seen === null) { seen = ms; return; } // 처음 받은 서버 값은 기준으로만
      if (ms <= seen) return;
      seen = ms;
      if (Date.now() - ms > 10 * 60 * 1000) return; // 10분 넘게 지난 기록은 이미 반영된 것으로 본다
      loadedRangesRef.current = [];
      fullLoadedRef.current = false;
      setHistoryMap(new Map());
      safeSave("dispatchData", []);
      setHistoryEpoch(n => n + 1); // 열려 있는 화면이 자기 기간을 다시 불러오게
    }, () => {});
  }, [user?.uid, role, userCompany]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 여러 사용자 실시간 일치 — 미배차 전부 + 앱을 연 뒤 누군가 등록·수정한 오더(날짜 무관) +
  // 삭제 기록을 실시간으로 받아 예전 오더 보관소에 반영한다(최근 7일~은 원래 실시간).
  React.useEffect(() => {
    if (!user) return undefined;
    const since = Date.now() - 60 * 1000;
    return subscribeOrderSync({
      since,
      onRows: (rows) => setHistoryMap(prev => {
        // 최근 범위(7일~) 오더는 원래 실시간 리스너가 받으므로 여기선 건너뛴다(같은 변경으로 화면이 두 번 다시 계산되는 것 방지)
        const liveStart = pcLiveWindowStart();
        const outside = rows.filter(({ data }) => String(data.상차일 || "") < liveStart);
        const staleInside = rows.filter(({ col, id, data }) => String(data.상차일 || "") >= liveStart && prev.has(`${col}/${id}`));
        if (!outside.length && !staleInside.length) return prev;
        const next = new Map(prev);
        staleInside.forEach(({ col, id }) => next.delete(`${col}/${id}`)); // 최근 범위로 옮겨온 오더는 실시간 쪽만 남김
        outside.forEach(({ col, id, data: data0 }) => {
          const data = textifyOrder(data0);
          const key = `${col}/${id}`;
          const excluded = data.source === "transport_transmit" || data.배차상태 === "배차취소" ||
            ["취소", "배차취소", "오더취소", "취소됨"].includes(data.상태);
          if (excluded) { next.delete(key); return; }
          next.set(key, {
            _id: id, __col: col, ...data,
            경유지_상차: parseWaypointsShared(data.경유지_상차) || parseWaypointsShared(data.경유상차목록) || [],
            경유지_하차: parseWaypointsShared(data.경유지_하차) || parseWaypointsShared(data.경유하차목록) || [],
          });
        });
        return next;
      }),
      onDeleted: (keys) => setHistoryMap(prev => {
        if (!keys.some(k => prev.has(k))) return prev;
        const next = new Map(prev);
        keys.forEach(k => next.delete(k));
        return next;
      }),
    });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drivers, setDrivers] = useState(() => safeLoad("drivers", []));
  useFleetLivePublish(drivers); // ⭐ 2026-11-05 이미 받는 drivers로 실시간 관제 색인(차량번호별) 갱신 — 추가 읽기 없음
  useFleetDispatchWayInstall(drivers, userCompany); // 🚛 2026-11-23 지입차로 배차하면 배차방식 자동(회사 설정 · 저장 직전)
  const [clients, setClients] = useState(() => safeLoad("clients", []));
  // 🔔 위 캐시(dispatchData)는 이전 세션의 오래된 스냅샷이라, orders/dispatch 두
  // 컬렉션 모두에서 "진짜" 첫 응답을 받기 전까지는 attachCount 등을 비교해 알림을
  // 띄우는 화면들이 캐시값을 기준선으로 잘못 학습해선 안 된다(PC를 꺼둔 사이 쌓인
  // 변경사항이 재실행 시 한꺼번에 알림으로 쏟아지던 원인). 두 리스너 모두 첫 실응답을
  // 받은 시점을 하위 화면에 알려주기 위한 플래그.
  const [liveDataReady, setLiveDataReady] = useState(false);
  // ⭐ 실시간배차현황/배차관리 하단부 전용 — 어제~내일(딱 3일)만 담는 훨씬 작은
  // 실시간 데이터. 위 dispatchData(최근 13개월)보다도 훨씬 작아서, 그 화면들이
  // 매번 큰 배열을 필터링/재계산하며 겪던 버벅임과 저장 후 팝업 딜레이를 줄여준다.
  const [recentDispatchData, setRecentDispatchDataRaw] = useState([]);
  const setRecentDispatchData = React.useCallback((v) => setRecentDispatchDataRaw(prev => cleanMgrRows(hideBlind(typeof v === "function" ? v(prev) : v))), []);
  const [recentLiveDataReady, setRecentLiveDataReady] = useState(false);
  // 날짜가 바뀌면(자정 경과) 아래 "어제~내일" 실시간 구독 범위도 하루 밀려야 하므로,
  // 창을 열어둔 채 자정을 넘겨도 자동으로 갱신되도록 KST 기준 날짜가 바뀔 때만 값이
  // 바뀌는 상태를 두고, 이걸 구독 effect의 의존성으로 써서 자정에 재구독시킨다.
  const toKstDateStr = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const [todayKstKey, setTodayKstKey] = useState(() => toKstDateStr(new Date()));
  useEffect(() => {
    const t = setInterval(() => {
      const k = toKstDateStr(new Date());
      setTodayKstKey((prev) => (prev === k ? prev : k));
    }, 60000);
    return () => clearInterval(t);
  }, []);
  // ⭐ 삭제/수정 딜레이의 실제 원인 — 예전엔 이게 그냥 let 지역변수라 매 렌더마다
  // (이 훅 안의 어떤 state라도 바뀌면 함수 본문 전체가 다시 실행되므로 아주 자주)
  // 새 빈 배열로 다시 선언됐다. 그런데 실제로 캐시를 채워넣는 onSnapshot 콜백은
  // 최초 마운트 시 단 한 번 만들어진 클로저라서 "그때의" 배열만 계속 채웠고,
  // removeDispatch/patchDispatch는 매번 "그 순간 렌더"의 새 빈 배열을 참조해
  // 사실상 캐시가 거의 항상 비어있었다(→ getDoc 왕복이 매번 발생, 삭제/수정
  // 지연의 원인). useRef로 바꾸면 렌더와 무관하게 항상 같은 객체를 참조해
  // onSnapshot이 채워둔 최신 값을 그대로 볼 수 있다.
  const ordersCacheRef = React.useRef([]);
  const dispatchCacheRef = React.useRef([]);
  // 🛠 2026-11-16 큐런 문의 — 실시간 범위(최근 7일) 밖 오더를 운송관리자 · 직원이 고치거나 지우면 반영이 안 되던 문제
  //  예전엔 캐시에 없으면 dispatch → orders 순서로 getDoc 했는데, 없는 문서를 읽는 건 서버 규칙이 최고관리자 말고는 거부해서
  //  (permission-denied) 저장 · 삭제가 조용히 실패했다. 이제 ① 실시간 캐시 ② 불러온 예전 오더(어느 컬렉션인지 앎) ③ 넘겨준 줄의 __col
  //  ④ orders → dispatch 순서로 읽되 거부돼도 다음 곳을 본다.
  const findOrderDoc = React.useCallback(async (id, hint) => {
    const live = ordersCacheRef.current.find(d => d._id === id) || dispatchCacheRef.current.find(d => d._id === id);
    if (live) return { ref: doc(db, live.__col || "dispatch", id), data: live, cached: true };
    const hm = historyMapRef.current;
    const hist = hm.get(`orders/${id}`) || hm.get(`dispatch/${id}`);
    if (hist) return { ref: doc(db, hist.__col, id), data: hist, cached: true };
    if (hint && hint.__col && (hint._id === id || hint.id === id)) return { ref: doc(db, hint.__col, id), data: hint, cached: true };
    for (const col of ["orders", "dispatch"]) {
      try { const snap = await getDoc(doc(db, col, id)); if (snap.exists()) return { ref: snap.ref, data: snap.data(), cached: false }; }
      catch (e) { if (e?.code !== "permission-denied") console.warn("오더 찾기 실패:", col, id, e?.message || e); }
    }
    return null;
  }, []);
  // ⚡ localStorage 저장은 오프라인 캐시 용도일 뿐 화면 표시와 무관하므로,
  //    쓰기 한 번마다 전체 목록을 동기적으로 JSON.stringify + localStorage.setItem 하면
  //    (특히 orders 컬렉션이 커질수록) 저장 직후 메인스레드가 블로킹되어 "끊김"의 주 원인이 된다.
  //    디바운스로 묶어서 렌더링/입력에 영향 없는 시점으로 미룬다.
  // ⭐ 그래도 등록 직후 0.8초 뒤 "전체 오더"를 한 번에 문자열로 바꿔 저장하느라 화면이 잠깐
  //    멈췄다(배차등록 후 버벅임). 이 저장본은 앱을 켤 때 첫 화면을 빨리 그리는 용도뿐이라
  //    최근 오더(3일 전~)만 최대 500건, 브라우저가 한가할 때만 저장한다. 나머지는 Firestore
  //    로컬 캐시(IndexedDB)가 곧바로 채워준다.
  let dispatchSaveTimer = null;
  const scheduleDispatchSave = (v) => {
    if (dispatchSaveTimer) clearTimeout(dispatchSaveTimer);
    dispatchSaveTimer = setTimeout(() => {
      const run = () => {
        const from = new Date(Date.now() + 9 * 3600e3 - 3 * 86400e3).toISOString().slice(0, 10);
        const slim = (v || []).filter(r => String(r.상차일 || "") >= from).slice(-500);
        safeSave("dispatchData", slim);
      };
      if (typeof window !== "undefined" && window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 5000 });
      else run();
    }, 2000);
  };

  // ★ 담당자(등록자) 표시용 실명 — auth 사용자 객체는 displayName을 한 번도 설정한 적이
  // 없어(회원가입/로그인 어디서도 updateProfile을 호출하지 않음) 항상 null이라, 지금까지
  // upsertDriver의 등록자 스탬프가 이메일 앞부분(계정 아이디, 예: "tjddnqkf")으로만 찍히던
  // 버그가 있었다. users/{uid} 문서에 저장된 실제 이름(name)을 우선 가져와 사용한다.
  const [myRealName, setMyRealName] = useState("");
  // ⭐ 사용자 요청 — 배차담당자 연락처(전화 버튼)를 쓰려면 직원 본인이 설정한
  // 전화번호가 필요한데 지금까지 그런 입력 화면 자체가 없었다. "내 정보"
  // 패널에서 이름/연락처를 직접 수정할 수 있게 하고, 저장 즉시 반영되도록
  // getDoc 한 번이 아니라 onSnapshot으로 구독한다.
  const [myPhone, setMyPhone] = useState("");
  const [myTeam, setMyTeam] = useState("");
  // 🔒 2026-11-16 최종마감 잠금 — 경리 확인(최종마감)된 거래처 · 달의 오더는 배차 쪽에서 고치기 · 추가 · 삭제 불가(경리팀 일시해제 시 가능)
  const finalDesk = useArDesk((localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim());
  const finalBypass = role === "totalMaster" || ["hrAcct", "allMgr", "acct", "accounting"].includes(role) || /경리|회계|정산/.test(myTeam);
  const finalLockOf = (o) => {
    if (finalBypass || !o) return null;
    const c = String(o.거래처명 || "").trim(); if (!c) return null;
    const ym = billYmOf(o); // 🗓 2026-11-27 거래처 마감일까지(arCore 한 곳)
    const d = finalDesk.closes?.get(`${c}|${ym}`);
    return isFinalLocked(d) ? { client: c, ym } : null;
  };
  const finalLockMsg = (l) => `${l.client} ${Number(l.ym.slice(5))}월은 최종마감 이후 수정이 불가합니다.\n필요 시 경리팀에 해제요청 해주세요.`;
  useEffect(() => {
    if (!user?.uid) { setMyRealName(""); setMyPhone(""); return; }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setMyRealName(d.name || ""); setMyNameCache(d.name || ""); setMyTeam(getMultiState().guest ? "" : String(d.team || d.부서 || "")); // 🏢 다른 회사에서는 원래 회사 부서를 쓰지 않는다
      setMyPhone(d.전화번호 || d.phone || "");
    }, () => {});
    return unsub;
  }, [user?.uid]);

  // ===================== 하차지(places) Firestore 실시간 구독 =====================
const [places, setPlaces] = useState([]);

useEffect(() => {
  const coll = collection(db, "places");
  const unsub = onSnapshot(coll, (snap) => {
    const viewCompany = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
      : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
    const arr = snap.docs
      .map((d) => ({ _id: d.id, ...(d.data() || {}) }))
      .filter((d) => (d.companyName || DEFAULT_COMPANY) === viewCompany);
    setPlaces(arr);
  });

  return () => unsub();
}, [userCompany, role]);

// ===================== 연동 승인된 화주사 목록(자동 전송용) =====================
// 운송사가 오더 등록 시 거래처명이 여기 목록의 화주사 회사명과 일치하면,
// AdminMenu의 수동 "화주사 전송"과 동일한 방식으로 즉시 화주사 화면에도 사본을 생성한다.
const [approvedShippers, setApprovedShippers] = useState([]);
useEffect(() => {
  const viewCompany = role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
    : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
  const unsub = onSnapshot(collection(db, "companyApplications"), (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.linkedTransportCompany?.companyName === viewCompany && a.transportApprovalStatus === "approved");
    setApprovedShippers(list);
  });
  return () => unsub();
}, [userCompany, role]);

// ===================== 메인 실시간 =====================
useEffect(() => {
  if (!user) {
    setDispatchData([]);
    setDrivers([]);
    setClients([]);
    return;
  }

  const unsubs = [];
  const userRole = localStorage.getItem("role") || "user";
const collName = "orders";

// ⭐ Firestore 읽기 절감 — 예전엔 where() 없이 orders/dispatch 두 컬렉션을 무제한으로
// 구독해서, 회사가 쌓아온 배차 이력이 몇 년치든 로그인할 때마다(그리고 이후 누군가
// 아무 오더나 한 건만 수정해도 접속 중인 모든 사람 화면에서 다시) 전부 읽어들였다 —
// 이게 매일 무료 읽기 한도를 초과하는 주된 원인이었다. HOME 대시보드의 연매출 등
// 통계도 "올해" 데이터까지만 필요하므로(HomeDashboard.jsx의 yearRevenue 참고),
// 최근 13개월(연초부터 계산해도 여유 있게 걸치도록)만 실시간 구독한다. 그보다
// 오래된 데이터가 필요한 조회(배차현황의 기간검색 등)는 그 화면에서 필요할 때만
// 별도로 getDocs 조회한다.
const getMonthsAgoKST = (months) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};
const liveWindowStart = pcLiveWindowStart(); // ★ 13개월 → 최근 7일~(예전 오더는 화면에서 필요할 때만)
  // orders/dispatch 두 리스너 모두 "캐시가 아닌 진짜" 첫 응답을 받으면 liveDataReady를 켠다.
  let ordersRealFirstDone = false;
  let dispatchRealFirstDone = false;
  const markRealFirstLoadDone = (which) => {
    if (which === "orders") ordersRealFirstDone = true;
    else dispatchRealFirstDone = true;
    if (ordersRealFirstDone && dispatchRealFirstDone) setLiveDataReady(true);
  };
      // ✅ 1️⃣ orders (화주 + 신규) + 알림 감지
  let ordersFirstLoad = true;
  const bootTrackOrders = makeBootTracker(pcBootStore, "orders");
  const ordersPrev = new Map();
  // id -> 가공된 row 객체. 매 스냅샷마다 전체 문서를 다시 map()하면 오더가
  // 쌓일수록(수천 건) 다른 사람의 사소한 쓰기 한 건에도 전체를 재가공하게 되어
  // 그때마다 화면이 버벅였다(기사 업로드/화주사 등록/모바일 등록 등 "누군가 쓸
  // 때마다" PC 전체가 순간 렉걸리던 원인) — 실제로 변경된 문서만 다시 가공한다.
  const ordersRowMap = new Map();
  const ordersRawPrev = new Map(); // id -> 직전 raw doc.data() (위치 전용 변경 감지용)
  const driversLiveRef = { current: { sig: "", at: 0, timer: 0, arr: [] } }; // ⚡ 2026-11-23 기사 위치만 바뀐 변경 모아 반영
  // 기사님이 업로드링크 화면에서 위치공유를 켜두면 GPS 콜백마다 위치/위치갱신일시
  // 두 필드만 바뀐 채 계속 write가 들어오는데, 이 두 필드만 바뀐 경우까지 매번
  // 전체 목록을 다시 그리면 위치공유가 켜져 있는 내내 PC 화면이 계속 버벅였다.
  // 실제로 의미 있는(위치 외) 필드가 바뀌었을 때만 전체 재렌더를 트리거한다.
  const isLocationOnlyChange = (prevData, nextData) => {
    if (!prevData) return false;
    const keys = new Set([...Object.keys(prevData), ...Object.keys(nextData)]);
    for (const k of keys) {
      if (k === "위치" || k === "위치갱신일시") continue;
      const pv = prevData[k], nv = nextData[k];
      if (pv === nv) continue;
      if (typeof pv === "object" || typeof nv === "object") {
        if (JSON.stringify(pv) === JSON.stringify(nv)) continue;
      }
      return false;
    }
    return true;
  };
  const parseWaypointsShared = (v) => {
    if (Array.isArray(v) && v.length > 0) return v;
    if (typeof v === "string" && v.startsWith("[")) try { const p = JSON.parse(v); if (Array.isArray(p) && p.length > 0) return p; } catch {}
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const ks = Object.keys(v);
      if (ks.length > 0 && ks.every(k => /^\d+$/.test(k))) return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);
      if (v.업체명) return [v];
    }
    return null;
  };
  const buildOrderRow = (id, data0, data = textifyOrder(data0)) => ({ // 🛠 2026-11-16 숫자 글자 칸 맞추기
    __col: collName,
    ...data,
    _id: id, // ★ 실제 문서 번호가 항상 이긴다(복사로 딸려 온 _id 무시)
    경유지_상차: parseWaypointsShared(data.경유지_상차) || parseWaypointsShared(data.경유상차목록) || [],
    경유지_하차: parseWaypointsShared(data.경유지_하차) || parseWaypointsShared(data.경유하차목록) || [],
  });

  unsubs.push(
    // ⭐ includeMetadataChanges — 저장본(캐시) → 서버와 맞춰지는 순간을 받아 첫 진입 로딩 화면 진행률에 쓴다.
    // (예전엔 서버에 바뀐 게 없으면 그 순간이 안 와서, 알림 기준선이 "캐시본"에 계속 머물렀다)
    subscribeLiveWithFallback(collName, liveWindowStart, (snap) => {
      bootTrackOrders(snap);
      const changes = snap.docChanges();
      let hasSignificantChange = ordersFirstLoad;
      changes.forEach((ch) => {
        const id = ch.doc.id;
        if (ch.type === "removed") {
          ordersRowMap.delete(id);
          ordersRawPrev.delete(id);
          hasSignificantChange = true;
          return;
        }
        const data = ch.doc.data() || {};
        if (ch.type === "modified" && isLocationOnlyChange(ordersRawPrev.get(id), data)) {
          // 캐시는 최신화하되(나중에 열어보는 화면엔 최신 위치가 보이도록), 화면 전체
          // 재계산/재렌더는 건너뛴다 — 위치 필드는 표에서 "위치공유중" 여부만 쓰이므로
          // 이미 켜져 있던 표시가 다시 바뀔 일이 없다.
          ordersRowMap.set(id, buildOrderRow(id, data));
          ordersRawPrev.set(id, data);
          return;
        }
        ordersRawPrev.set(id, data);
        ordersRowMap.set(id, buildOrderRow(id, data));
        hasSignificantChange = true;
      });

      if (!hasSignificantChange) return;

      const arr = Array.from(ordersRowMap.values());

      // "화주사 전송"으로 새로 생성된 사본은 화주사 화면에만 보이면 되는 문서라
      // 운송사 자체 배차 화면(dispatchData)에는 섞여 나오면 안 된다 — 원본 문서는
      // 건드리지 않으므로, 여기서 사본만 제외해도 데이터 손실은 없다.
      // 배차상태가 "배차취소"인 오더(화주사가 취소한 오더)도 마찬가지로 화주사의
      // "배차취소" 목록에만 남아야 하므로 운송사 화면에서는 제외한다.
      const filteredArr = arr.filter(row =>
        row.source !== "transport_transmit" &&
        row.배차상태 !== "배차취소" &&
        !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태)
      );

      ordersCacheRef.current = filteredArr;
      // ⭐ startTransition으로 감싸면 방금 등록/수정한 오더가 배차현황에 바로 안
      // 뜨고 지연되어 보이는 원인이 된다(React가 이 업데이트를 낮은 우선순위로
      // 미룰 수 있음) — 우선순위 없이 바로 반영한다.
      setDispatchData([...ordersCacheRef.current, ...dispatchCacheRef.current]);
      scheduleDispatchSave(filteredArr);

      // 🔔 최초 로드: prevMap 구축만
      // ⚠️ persistentLocalCache를 쓰기 때문에 첫 스냅샷은 "어제 PC를 끄기 전" 상태를 담은
      // 로컬 캐시본일 수 있다. 이 캐시 스냅샷을 기준선으로 확정해버리면, 바로 뒤이어 도착하는
      // 진짜 서버 스냅샷(그 사이 오프라인 동안 모바일 등에서 쌓인 실제 변경사항 전부)이 전부
      // "방금 발생한 변경"으로 오인되어 알림이 한꺼번에 쏟아진다 — 캐시 스냅샷 동안은 계속
      // 기준선만 다시 세우고, fromCache가 아닌 "진짜" 첫 서버 응답을 받은 뒤부터만 변경 감지를 시작한다.
      if (ordersFirstLoad) {
        arr.forEach(r => {
          ordersPrev.set(r._id, {
            car: (r.차량번호 || "").trim(),
            status: (r.배차상태 || "").trim(),
            editStamp: r.최종수정일시?.seconds || 0,
            editReq: r.수정요청 === true,
            cancelReq: r.취소요청 === true,
          });
        });
        if (!snap.metadata.fromCache) {
          ordersFirstLoad = false;
          markRealFirstLoadDone("orders");
        }
        return;
      }

            // 🔔 변경 감지
      changes.forEach((ch) => {
        const d = ch.doc.data() || {};
        const id = ch.doc.id;
        if (isBlindHidden(d)) return; // ★ 블라인드 오더는 최고관리자 외에는 알림도 띄우지 않는다

        // ⚠️ addDispatch가 실제로 쓰는 컬렉션은 COLL.dispatch="orders"다 — 즉 운송사
        // 자신의 오더 등록/수기입력/오더복사도 전부 여기(orders 리스너)로 들어온다.
        // (문자 그대로의 "dispatch" 컬렉션은 별도이며 이 등록 흐름과 무관하다.)
        // 화주사가 보낸 배차요청은 회사 전체에 보여야 하므로 그대로 두고, 운송사
        // 본인의 등록은 본인 계정에게만 등록 확인 배너를 띄운다.
        if (ch.type === "added" && !ordersPrev.has(id)) {
          if ((d.상차지명 || d.거래처명) && (d.source === "shipper" || d.source === "shipper_mobile")) {
            sflowToast(
              `[화주사 배차요청] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "order",
              { orderId: id, source: d.source }
            );
          } else if ((d.상차지명 || d.거래처명) && d.작성자 && user?.email && d.작성자 === user.email && d.source !== "transport_transmit") {
            // transport_transmit(화주사 연동 자동전송 사본)은 addDispatch가 만든 원본과
            // 별개 문서로 동시에 생성되며 작성자도 동일해서, 제외하지 않으면 오더 등록
            // 배너가 원본+사본으로 두 번 뜬다.
            const isNowDoneAtAdd = (d.배차상태 || "").trim() === "배차완료" && (d.차량번호 || "").trim();
            if (isNowDoneAtAdd) {
              sflowToast(
                `${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"} | ${d.이름 || ""} (${(d.차량번호 || "").trim()})`,
                "dispatch",
                { orderId: id }
              );
            } else {
              sflowToast(
                `[오더 등록] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
                "orderRegistered",
                { orderId: id }
              );
            }
          }
        }

        if (ch.type === "modified") {
          const prev = ordersPrev.get(id);
          const wasNotDone = prev && prev.status !== "배차완료";
          const isNowDone = (d.배차상태 || "").trim() === "배차완료" && (d.차량번호 || "").trim();

          // "transport_transmit" 사본은 운송사가 방금 dispatch 컬렉션에서 직접
          // 배차완료 처리한 건의 미러 카피라, dispatch 리스너에서 이미 같은 내용의
          // 배차완료 토스트를 띄운다 — 여기서 또 띄우면 동일 알림이 2번 뜬다.
          // 배차완료 처리를 실제로 수행한 계정(작성자) 본인에게만 노출한다.
          const isOwnOrderAction = !!(d.작성자 && user?.email && d.작성자 === user.email);
          if (wasNotDone && isNowDone && d.source !== "transport_transmit" && isOwnOrderAction) {
            sflowToast(
              `${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"} | ${d.이름 || ""} (${(d.차량번호 || "").trim()})`,
              "dispatch",
              { orderId: id }
            );
          }

          const wasNotCanceled = prev && prev.status !== "배차취소";
          const isNowCanceled = (d.배차상태 || "").trim() === "배차취소";
          if (wasNotCanceled && isNowCanceled && (d.source === "shipper" || d.source === "shipper_mobile")) {
            sflowToast(
              `[화주사 취소] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "cancel",
              { orderId: id }
            );
          }

          // 화주사가 오더 정보(화물/상하차지 등)를 수정 -> 알림
          const nextEditStamp = d.최종수정일시?.seconds || 0;
          if ((d.source === "shipper" || d.source === "shipper_mobile") && d.최종수정출처 === "shipper"
            && prev && nextEditStamp && nextEditStamp !== prev.editStamp) {
            sflowToast(
              `${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "shipperEdit",
              { orderId: id, source: d.source }
            );
          }

          // 배차완료 오더에 대한 화주사의 정식 "수정요청"/"기사취소요청" -> 우하단 배너 알림
          // (badge는 이미 떠 있지만, 별도 알림이 없어 놓치기 쉬웠다)
          if (prev && !prev.editReq && d.수정요청 === true) {
            sflowToast(
              `[화주사 수정요청] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "editRequest",
              { orderId: id }
            );
          }
          if (prev && !prev.cancelReq && d.취소요청 === true) {
            sflowToast(
              `[화주사 취소요청] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "cancelRequest",
              { orderId: id }
            );
          }
        }

        if (ch.type === "removed") {
          if ((d.source === "shipper" || d.source === "shipper_mobile") && (d.상차지명 || d.거래처명)) {
            sflowToast(
              `[화주사 삭제] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "cancel",
              {}
            );
          }
          ordersPrev.delete(id);
        } else {
          ordersPrev.set(id, {
            car: (d.차량번호 || "").trim(),
            status: (d.배차상태 || "").trim(),
            editStamp: d.최종수정일시?.seconds || 0,
            editReq: d.수정요청 === true,
            cancelReq: d.취소요청 === true,
          });
        }
      });

    }, "orders")
  );

    // ✅ 2️⃣ 기존 dispatch 데이터 + 알림 감지
  let dispatchFirstLoad = true;
  const bootTrackDispatch = makeBootTracker(pcBootStore, "dispatch");
  const dispatchPrev = new Map();
  // orders 리스너와 동일한 이유로, 변경된 문서만 다시 가공한다.
  const dispatchRowMap = new Map();
  const dispatchRawPrev = new Map();
  // ⭐ 2026-10-29: 문서 안의 _id(복사로 딸려 온 값)가 실제 문서 번호를 덮지 않게 실제 번호를 마지막에 둔다
  const buildDispatchRow = (id, data0, data = textifyOrder(data0)) => ({ // 🛠 2026-11-16 숫자 글자 칸 맞추기
    __col: "dispatch",
    ...data,
    _id: id,
    경유지_상차: parseWaypointsShared(data.경유지_상차) || parseWaypointsShared(data.경유상차목록) || [],
    경유지_하차: parseWaypointsShared(data.경유지_하차) || parseWaypointsShared(data.경유하차목록) || [],
  });

  unsubs.push(
    subscribeLiveWithFallback("dispatch", liveWindowStart, (snap) => {
      bootTrackDispatch(snap);
      const changes = snap.docChanges();
      let hasSignificantChange = dispatchFirstLoad;
      changes.forEach((ch) => {
        const id = ch.doc.id;
        if (ch.type === "removed") {
          dispatchRowMap.delete(id);
          dispatchRawPrev.delete(id);
          hasSignificantChange = true;
          return;
        }
        const data = ch.doc.data() || {};
        if (ch.type === "modified" && isLocationOnlyChange(dispatchRawPrev.get(id), data)) {
          dispatchRowMap.set(id, buildDispatchRow(id, data));
          dispatchRawPrev.set(id, data);
          return;
        }
        dispatchRawPrev.set(id, data);
        dispatchRowMap.set(id, buildDispatchRow(id, data));
        hasSignificantChange = true;
      });

      if (!hasSignificantChange) return;

      const arr2 = Array.from(dispatchRowMap.values());

      // 배차상태가 "배차취소"인 오더는 화주사의 "배차취소" 목록에만 남아야 하므로 제외한다.
      dispatchCacheRef.current = arr2.filter(row =>
        row.배차상태 !== "배차취소" && !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태)
      );
      setDispatchData([...ordersCacheRef.current, ...dispatchCacheRef.current]);
      scheduleDispatchSave(arr2);

      // 🔔 최초 로드: prevMap 구축만 (fromCache 스냅샷 동안은 기준선만 계속 갱신하고,
      // 진짜 서버 스냅샷을 받은 뒤부터만 변경 감지를 시작한다 — 위 orders 리스너와 동일한 이유)
      if (dispatchFirstLoad) {
        arr2.forEach(r => {
          dispatchPrev.set(r._id, {
            car: (r.차량번호 || "").trim(),
            status: (r.배차상태 || "").trim(),
          });
        });
        if (!snap.metadata.fromCache) {
          dispatchFirstLoad = false;
          markRealFirstLoadDone("dispatch");
        }
        return;
      }

            // 🔔 변경 감지
      changes.forEach((ch) => {
        const d = ch.doc.data() || {};
        const id = ch.doc.id;

        // "dispatch" 컬렉션은 운송사 자신의 등록(PC/모바일)만 들어오는 컬렉션이라, 이 배너는
        // 이 변경을 실제로 발생시킨 계정(작성자) 본인에게만 보여준다 — 같은 회사의 다른 계정이
        // 등록/배차한 것까지 내 화면에 뜨는 걸 막아 달라는 요청에 따른 것.
        const isOwnDispatchAction = !!(d.작성자 && user?.email && d.작성자 === user.email);
        const isNowDone = (d.배차상태 || "").trim() === "배차완료" && (d.차량번호 || "").trim();

        if (ch.type === "modified") {
          const prev = dispatchPrev.get(id);
          const wasNotDone = prev && prev.status !== "배차완료";

          if (wasNotDone && isNowDone && isOwnDispatchAction) {
            sflowToast(
              `${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"} | ${d.이름 || ""} (${(d.차량번호 || "").trim()})`,
              "dispatch",
              { orderId: id }
            );
          }
        }

        // 오더 등록(added) — 예전엔 여기서 아예 배너를 안 띄웠지만, 이제 본인 계정
        // 한정으로만 보이므로 띄워도 무방하다. 등록과 동시에 기사/차량까지 채워진
        // 경우엔 "배차완료" 문구로, 아니면 "오더 등록" 문구로 보여준다.
        if (ch.type === "added" && isOwnDispatchAction) {
          if (isNowDone) {
            sflowToast(
              `${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"} | ${d.이름 || ""} (${(d.차량번호 || "").trim()})`,
              "dispatch",
              { orderId: id }
            );
          } else if (d.상차지명 || d.거래처명) {
            sflowToast(
              `[오더 등록] ${d.거래처명 || ""} | ${d.상차지명 || "-"} → ${d.하차지명 || "-"}`,
              "orderRegistered",
              { orderId: id }
            );
          }
        }

        if (ch.type === "removed") {
          dispatchPrev.delete(id);
        } else {
          dispatchPrev.set(id, {
            car: (d.차량번호 || "").trim(),
            status: (d.배차상태 || "").trim(),
          });
        }
      });

    }, "dispatch")
  );


    unsubs.push(
      onSnapshot(collection(db, COLL.drivers), (snap) => {
        const viewCompany = role === "totalMaster"
          ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
          : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
        const arr = snap.docs
          .map(d => ({ ...d.data(), id: d.id }))
          .filter(d => (d.companyName || DEFAULT_COMPANY) === viewCompany);
        // ⚡ 2026-11-23 기사 앱은 운행 중 위치를 수시로 적는다 — 위치 · 속도만 바뀐 거면 15초에 한 번만 화면에 반영(예전엔 올 때마다 배차 화면 전체를 다시 그렸다)
        const live = driversLiveRef.current;
        const sig = arr.map((d) => { const { location, speed, updatedAt, totalDistance, lastMovedAt, heartbeatAt, active, nativeTracking, ...rest } = d; return JSON.stringify(rest); }).join("\n"); // eslint-disable-line no-unused-vars
        const apply = () => { live.at = Date.now(); live.timer = 0; setDrivers(live.arr); idleSave("drivers", live.arr); };
        live.arr = arr;
        if (sig !== live.sig || Date.now() - live.at >= 15000) { live.sig = sig; clearTimeout(live.timer); apply(); }
        else if (!live.timer) live.timer = setTimeout(apply, 15000 - (Date.now() - live.at));
        markBootBase(pcBootStore, "drivers");
      }, (err) => { console.warn("[기사 목록] 구독 실패", err?.code || err); markBootBase(pcBootStore, "drivers"); })
    );
    unsubs.push(onSnapshot(collection(db, COLL.clients), (snap) => {
      const viewCompany = role === "totalMaster"
        ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
        : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => (c.companyName || DEFAULT_COMPANY) === viewCompany);
      registerCloseDays(viewCompany, arr); // 🗓 2026-11-27 거래처별 마감일 → 청구월(정산 · 명세서 · 미수금 · 매출 같은 달)
      setClients(normalizeClients(arr));
      idleSave("clients", arr);
      markBootBase(pcBootStore, "clients");
    }, (err) => { console.warn("[거래처 목록] 구독 실패", err?.code || err); markBootBase(pcBootStore, "clients"); }));

    return () => { clearTimeout(driversLiveRef.current.timer); unsubs.forEach(u => u && u()); };
  }, [user, userCompany, role]);

  // ===================== 실시간배차현황 전용 — 어제~내일만 실시간 구독 =====================
  // ⭐ 실시간배차현황(그리고 배차관리 하단부의 동일 컴포넌트)은 화면에 어제/당일/내일
  // 버튼밖에 없고 그 외 조회 기능이 없다 — 즉 이 화면이 실제로 필요한 데이터는 항상
  // 이 3일치뿐이다. 위 메인 리스너(최근 13개월)를 그대로 필터링해 쓰는 대신, 아예
  // orders/dispatch 두 컬렉션을 이 좁은 날짜범위로만 별도 구독해서 훨씬 작은 배열을
  // 유지한다 — 오더가 많은 회사일수록 저장/렌더 시 다시 계산해야 하는 배열 크기가
  // 확 줄어 체감 딜레이가 줄고, Firestore 읽기량도 더 줄어든다.
  useEffect(() => {
    if (!user) { setRecentDispatchData([]); setRecentLiveDataReady(false); return; }

    const toKstStr = (d) => {
      const x = new Date(d);
      x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
      return x.toISOString().slice(0, 10);
    };
    const now = new Date();
    const from = toKstStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const to = toKstStr(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    const parseWaypoints = (v) => {
      if (Array.isArray(v) && v.length > 0) return v;
      if (typeof v === "string" && v.startsWith("[")) try { const p = JSON.parse(v); if (Array.isArray(p) && p.length > 0) return p; } catch {}
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const ks = Object.keys(v);
        if (ks.length > 0 && ks.every(k => /^\d+$/.test(k))) return ks.sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
        if (v.업체명) return [v];
      }
      return null;
    };
    const buildRow = (id, col, data) => ({
      _id: id,
      __col: col,
      ...data,
      경유지_상차: parseWaypoints(data.경유지_상차) || parseWaypoints(data.경유상차목록) || [],
      경유지_하차: parseWaypoints(data.경유지_하차) || parseWaypoints(data.경유하차목록) || [],
    });

    let ordersPart = [];
    let dispatchPart = [];
    let ordersReady = false, dispatchReady = false;
    const recompute = () => setRecentDispatchData([...ordersPart, ...dispatchPart]);
    const markReady = (which) => {
      if (which === "orders") ordersReady = true; else dispatchReady = true;
      if (ordersReady && dispatchReady) setRecentLiveDataReady(true);
    };

    const unsub1 = onSnapshot(
      query(collection(db, "orders"), where("상차일", ">=", from), where("상차일", "<=", to)),
      (snap) => {
        ordersPart = snap.docs
          .map((d) => buildRow(d.id, "orders", d.data() || {}))
          .filter((row) =>
            row.source !== "transport_transmit" &&
            row.배차상태 !== "배차취소" &&
            !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태)
          );
        recompute();
        markReady("orders");
      },
      (err) => { console.warn("[실시간배차현황 orders] 구독 실패", err?.code || err); markReady("orders"); } // ⚡ 2026-11-23 실패해도 화면이 "불러오는 중"에 멈추지 않게
    );
    const unsub2 = onSnapshot(
      query(collection(db, "dispatch"), where("상차일", ">=", from), where("상차일", "<=", to)),
      (snap) => {
        dispatchPart = snap.docs
          .map((d) => buildRow(d.id, "dispatch", d.data() || {}))
          .filter((row) => row.배차상태 !== "배차취소" && !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태));
        recompute();
        markReady("dispatch");
      },
      (err) => { console.warn("[실시간배차현황 dispatch] 구독 실패", err?.code || err); markReady("dispatch"); } // ⚡ 2026-11-23 실패해도 화면이 "불러오는 중"에 멈추지 않게
    );

    return () => { unsub1(); unsub2(); };
  }, [user, todayKstKey]);

const addDispatch = async (recordIn) => {
  let record = recordIn;
  { const fl = finalLockOf(record); if (fl) { globalShowAlert(finalLockMsg(fl)); return false; } } // 🔒 최종마감
  // 🚫 하차일이 상차일보다 빠른 역순 등록 방지
  if (isReversedDateOrder(record?.상차일, record?.하차일)) {
    globalShowAlert(REVERSED_DATE_ORDER_MSG);
    return false;
  }

  // ⭐ 지입 기사 휴차(지정 휴차일/본인 휴차중) 배차 확인 — 입력 단계에서 이미 "진행"을 골랐으면 건너뛴다.
  // "보류"면 오더는 등록하되 기사 정보를 빼고(배차중) 저장한다 → 기사앱으로 가지 않는다.
  if (record?.차량번호 && record._restAck !== restAckKey(record.차량번호, record.상차일)) {
    const okHoliday = await checkHolidayDispatch(drivers, record.차량번호, record.상차일);
    if (!okHoliday) {
      record = { ...record, 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중", 기사확인상태: null };
    }
  }
  if (record && "_restAck" in record) { record = { ...record }; delete record._restAck; }
  if (record) record = stripSheetLink(record); // ⭐ 2026-11-17 새 오더는 다른 오더의 구글시트 줄 주소를 가지면 안 된다(그 줄을 덮어쓰거나 지웠다)
  // 💬 2026-11-08 알림톡은 화면에서 뺐다 — 새로 등록되는 오더는 모두 알림톡:false(서버가 보내지 않음) · 예전 발송 결과는 넘기지 않는다
  //  (PC · 모바일 등록 · AI 비서 · 오더 스캔 · 복사 등록이 모두 여기를 지난다)
  if (record) { record = { ...record, 알림톡: false }; delete record.알림톡결과; }
  // ⭐ 2026-11-17 거래처 합치기 — 합친 거래처의 옛 이름(예: "큐런네트웍스 주식회사")으로 등록하면 남길 이름("큐런")으로 저장
  if (record) { try { record = resolveOrderClient(record, buildAliasMap(clients)); } catch { /* 무시 */ } }
  // ⭐ 2026-11-17 노선별 고정 특수운임(회사관리 › 노선 특수운임) — 거래처 · 상차지 · 하차지가 맞으면 지게차비용 · 야상 등을 넣고 운임을 맞춘다
  //  (PC · AI 비서 · 오더 스캔 · 복사 등록이 모두 여기를 지난다 · 사람이 [특수운임]에서 직접 정한 오더는 그대로)
  if (record) record = await withRoutePresets(record, { asString: typeof record.청구운임 !== "number" });

  const _id = crypto.randomUUID(); // ★ 무조건 새로 생성

  const cleanRecord = stripUndefinedDeep({
    ...record,
    _id,
    작성자: auth.currentUser?.email || "",
    // ⭐ 등록일 hover 툴팁에서 "PC로 등록/모바일로 등록"을 보여주기 위한 등록기기 —
    // 이미 값이 있으면(예: 복사 등록으로 원본 값을 이어받은 경우) 덮어쓰지 않는다.
    등록기기: record?.등록기기 || "PC",
    // 등록과 동시에 차량번호까지 포함되어 생성되는 경우(기사 정보 포함 등록 등)에도 완료시각을 남긴다
    ...(String(record?.차량번호 || "").trim() && !record?.배차완료일시 ? { 배차완료일시: Date.now() } : {}),
    // ⭐ "배차한시간"(등록일 hover 툴팁)이 표시하는 필드는 배차완료일시가 아니라
    // 배차확정일시다. patchDispatch는 배차중→배차완료 전환 때 이걸 찍어주지만,
    // 처음부터 기사 정보를 포함해 등록되는 오더(오더복사/스마트검색 등으로 즉시
    // 배차완료 상태로 만들어지는 경우)는 patchDispatch를 거치지 않아 이 필드가
    // 영영 비어있었다 — "배차한시간이 전부 다 안 나온다"는 신고의 원인.
    ...(record?.배차상태 === "배차완료" && !record?.배차확정일시
      ? { 배차확정일시: serverTimestamp(), 배차확정자: myRealName || user?.displayName || user?.email?.split("@")[0] || "" }
      : {}),
  });

  await setDoc(
    doc(db, COLL.dispatch, _id),
    cleanRecord
  );

  // 거래처명이 연동 승인된 화주사 회사명과 일치하면, 별도의 수동 "화주사 전송" 없이
  // 등록과 동시에 화주사 화면에도 자동으로 사본을 생성한다. 이후 기사배정/금액 등
  // 수정은 patchDispatch의 _transmittedOrderId 미러 동기화가 그대로 이어받는다.
  (async () => {
    let matchedShipper = approvedShippers.find(
      (a) => normalizeCompanyKey(a.companyName) === normalizeCompanyKey(cleanRecord.거래처명)
    );
    if (!matchedShipper) {
      // approvedShippers는 onSnapshot으로 비동기 로딩되는 state라, 페이지 로드 직후
      // 목록이 채워지기 전 등록하면 여기서 빈 배열이라 매칭이 실패한다 — 실시간으로 한 번 더 확인.
      matchedShipper = await findApprovedShipperLive(cleanRecord.companyName || userCompany, cleanRecord.거래처명);
    }
    if (matchedShipper) {
      autoTransmitToShipper({ ...cleanRecord, _id, __col: COLL.dispatch }, matchedShipper).catch((e) =>
        console.error("자동 화주사 전송 실패:", e)
      );
    }
  })();

  return _id;
};
  // 🔥 undefined 깊이 제거 (중첩 객체까지 안전)
  // ⭐ "배차한시간(배차확정일시)이 항상 -로 보인다"는 신고의 진짜 원인 —
  // serverTimestamp()가 반환하는 값은 겉보기엔 평범한 object지만 실제로는
  // Object.entries에 딱 한 개(_methodName)만 노출하는 Firestore 전용 sentinel
  // 클래스 인스턴스다. 예전 코드는 이걸 그냥 "중첩 객체"로 보고 재귀적으로
  // Object.entries→Object.fromEntries를 돌려 새 plain object로 다시 조립했는데,
  // 그 순간 클래스 정체성이 사라져 Firestore가 더 이상 "서버 시각으로 채워라"는
  // 지시로 인식하지 못하고 { _methodName: "serverTimestamp" }라는 의미 없는
  // 맵 값을 그대로 저장해버린다 — 읽을 때 toMs()가 이 값에서 시각을 뽑아내지
  // 못해 항상 0(="-")으로 보였다. serverTimestamp/deleteField/increment/
  // arrayUnion 같은 FieldValue sentinel과 Date/Timestamp/GeoPoint 인스턴스는
  // 재귀하지 않고 그대로(원본 그대로) 통과시켜야 한다.
  const stripUndefinedDeep = (obj) => {
    if (obj === null || typeof obj !== "object") return obj;

    if (isFsSpecialValue(obj)) return obj; // 🛠 2026-11-13 클래스 이름이 아니라 실제 타입으로 판별(배포본에서도 동작)

    if (Array.isArray(obj)) {
      return obj.filter((v) => v !== undefined).map((v) => stripUndefinedDeep(v));
    }

    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)])
    );
  };

// ⭐ 사용자 요청 — 이미 "운송완료"(기사확인상태:완료)된 오더를 담당자가 삭제하거나
// 거기서 기사만 취소(차량번호를 비움)하면, 그 운행 기록 자체가 통째로 사라진다.
// 확인 팝업을 한번 더 받은 뒤(이 함수를 부르기 전에), 기사 운행일지가 계속
// 보여줄 수 있도록 핵심 필드만 별도 컬렉션에 스냅샷으로 남겨둔다.
const archiveCompletedOrderPC = (data, orderId, reason) => {
  const drv = drivers.find((d) => normalizePlate(d.차량번호) === normalizePlate(data?.차량번호));
  if (!drv) return;
  addDoc(collection(db, "driver_completed_archive"), {
    driverId: drv.id,
    originalOrderId: orderId,
    차량번호: data?.차량번호 || "",
    기사명: data?.이름 || data?.기사명 || drv.이름 || "",
    archivedReason: reason, // "오더삭제"(오더취소) | "기사취소"(배차취소)
    archivedAt: serverTimestamp(),
    거래처명: data?.거래처명 || "",
    상차지명: data?.상차지명 || "",
    하차지명: data?.하차지명 || "",
    상차일: data?.상차일 || "",
    하차일: data?.하차일 || "",
    상차시간: data?.상차시간 || "",
    하차시간: data?.하차시간 || "",
    화물내용: data?.화물내용 || "",
    차량톤수: data?.차량톤수 || "",
    기사운임: data?.기사운임 || "",
    기사완료일시: data?.기사완료일시 || null,
    // 운행일지 상세 팝업용 추가 정보
    상차지주소: data?.상차지주소 || "", 하차지주소: data?.하차지주소 || "",
    상차지담당자: data?.상차지담당자 || "", 상차지담당자번호: data?.상차지담당자번호 || "",
    하차지담당자: data?.하차지담당자 || "", 하차지담당자번호: data?.하차지담당자번호 || "",
    차량종류: data?.차량종류 || data?.차종 || "", 지급방식: data?.지급방식 || "",
    기사확인일시: data?.기사확인일시 || null, 상차완료일시: data?.상차완료일시 || null,
    기사확인상태: data?.기사확인상태 || "",
    등록자명: data?.등록자명 || "", createdByName: data?.createdByName || "", createdByEmail: data?.createdByEmail || data?.작성자 || "",
    전달사항: data?.전달사항 || "",
  }).catch(() => {});
};

const patchDispatch = async (_id, patch, knownPrev) => {
  if (!_id) return;
  // 🔒 2026-11-16 최종마감 — 정산 기록(__system: 계산서일 · 입금 · 지급 등)은 그대로, 오더 내용 고치기만 막는다
  if (patch && !patch.__system && !finalBypass) {
    const prev0 = knownPrev || ordersCacheRef.current.find((d) => d._id === _id) || dispatchCacheRef.current.find((d) => d._id === _id) || null;
    const fl = finalLockOf(prev0) || (prev0 ? finalLockOf({ ...prev0, ...patch }) : null);
    if (fl) { globalShowAlert(finalLockMsg(fl)); return false; }
  }

  // 🚫 블랙 기사 / 메모 기사 차량번호 입력 시 경고
  if (patch.차량번호) {
    const plate = String(patch.차량번호).replace(/\s+/g, "");
    const matched = drivers.find(
      (d) => String(d.차량번호 || "").replace(/\s+/g, "") === plate
    );
    if (matched) {
      if (matched.등급 === "블랙") {
        window.__blackDriverAlert__ = matched;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("blackDriverDetected", { detail: matched }));
        }, 100);
      }
    }
    // 화주사 배차요청 확인 없이 바로 기사님이 배정된 경우에도 "배차요청" 상태로 남지 않도록 안전장치로 해제
    patch.화주사확인대기 = false;
  }

  delete patch.createdAt;
  delete patch.등록일시;
  delete patch.등록시간;
  delete patch.createdTime;
  // 👤 2026-11-12 배차담당자 · 차량배정자 바꾸기(src/OrderStaffFields.jsx) — 화면용 표시는 문서에 쓰지 않는다
  const _ownerPick = patch._owner && !patch._owner.orig ? patch._owner : null; delete patch._owner;
  const _assignerSet = patch._assignerSet === true; delete patch._assignerSet;
  if (_ownerPick) applyOwner(patch, _ownerPick);

  // ★ 메모리 캐시에서 먼저 찾기 (getDoc 완전 제거 → 딜레이 없음)
  // (역순 날짜 검증은 prev를 구한 다음, 최신 상/하차일 기준으로 아래에서 수행한다)
  // 두 캐시를 매번 새 배열로 합치면(스프레드) 호출마다 N+M 크기 배열을 새로 할당/복사하게
  // 되어, 오더가 많은 회사에서는 전달상태 등 단순 토글 하나에도 매번 그 비용이 들어 렉으로
  // 느껴졌다 — 배열을 합치지 않고 각 캐시에서 순서대로 찾는다(첫 번째에서 찾으면 두 번째는
  // 아예 스캔하지 않는다).
  // ⭐ 호출하는 쪽이 이미 화면에 그려진 행 데이터(row)를 들고 있는 경우(근무일 수정
  // 팝업, 오더복사/수정 패널 등) knownPrev로 넘겨주면, 오더가 많은 회사에서 실시간
  // 캐시가 아직 그 문서를 못 담고 있는 드문 순간에도 getDoc 왕복 없이 바로 저장한다 —
  // 실사이트에서 "저장이 지연되고 있습니다" 타임아웃까지 걸리던 지연의 유력한 원인.
  let ref, prev;
  if (knownPrev && knownPrev.__col) {
    ref = doc(db, knownPrev.__col, _id);
    prev = knownPrev;
  } else {
    // 🛠 2026-11-16 캐시 → 불러온 예전 오더 → 서버(orders · dispatch) 순서 — findOrderDoc 설명 참고
    const found = await findOrderDoc(_id, knownPrev);
    if (!found) { console.error("✕ 문서 없음", _id); return; }
    ref = found.ref; prev = knownPrev ? { ...found.data, ...knownPrev } : found.data;
  }

  // ⭐ 사용자 요청 — 지입 기사를 근무가능요일이 아닌 날(휴차)에 배차하면 확인 팝업.
  // "휴차일이지만 배차"를 고르면 그대로 진행, "배차 취소"면 저장하지 않는다.
  const _restAck = patch._restAck; delete patch._restAck;
  if (patch.차량번호 && normalizePlate(patch.차량번호) !== normalizePlate(prev?.차량번호 || "")
      && _restAck !== restAckKey(patch.차량번호, patch.상차일 || prev?.상차일)) {
    const okHoliday = await checkHolidayDispatch(drivers, patch.차량번호, patch.상차일 || prev?.상차일);
    if (!okHoliday) {
      // "보류" — 이번에 입력한 기사 정보만 빼고 나머지 수정은 저장한다(기사에게는 가지 않음)
      ["차량번호", "이름", "전화번호", "기사명", "배차상태", "상태", "기사확인상태", "배차확정일시", "배차확정자", "배차완료일시", "화주사확인대기"].forEach(k => { delete patch[k]; });
      const META = new Set(["updatedAt", "_lastModified", "업체전달상태"]);
      if (!Object.keys(patch).some(k => !META.has(k))) return false;
    }
  }

  // ⭐ 사용자 요청 — 이미 "운송완료"된 오더에서 차량번호를 비워 기사만 취소하려는
  // 경우, 완료된 운행 기록이 사라진다는 걸 한번 더 확인받는다(그 외 상태는 기존과
  // 동일하게 즉시 처리). 아직 화면 반영/실제 저장 전이라 취소해도 되돌릴 게 없다.
  if ("차량번호" in patch && !String(patch.차량번호 || "").trim() && prev?.기사확인상태 === "완료") {
    if (!await kpConfirm("운송이 완료된 오더입니다. 기사를 취소하시겠습니까?")) return false;
    archiveCompletedOrderPC(prev, _id, "기사취소");
  } else if ("차량번호" in patch && !String(patch.차량번호 || "").trim() && prev?.기사확인상태 === "수락") {
    // ⭐ 기사님이 수락한 뒤 기사만 빠진 경우도 기사 운행기록에 "배차취소"로 남긴다
    archiveCompletedOrderPC(prev, _id, "기사취소");
  }

  // 🚫 하차일이 상차일보다 빠른 역순 저장 방지 — 이 함수를 거치는 모든 수정
  // (4/5파트 인라인수정, 오더복사/수정 패널, 근무일 수정 팝업 등)에 공통 적용된다.
  // ⚠️ 반드시 "이번 patch가 실제로 상차일/하차일을 바꾸려 할 때"만 검사해야 한다 —
  // 과거에 잘못 저장된(이 검증이 생기기 전) 레거시 데이터가 이미 역순인 채로 남아있는
  // 오더는 흔한데, 배차확정일시 소급 보정처럼 날짜와 무관한 백그라운드 패치까지 여기
  // 걸려버리면 관련 없는 오더 수만큼 window.alert가 연속으로 뜨면서 화면이 통째로
  // 멈춰버린다(alert는 동기 호출이라 확인을 누를 때까지 스크립트 실행이 막힌다).
  if ("상차일" in patch || "하차일" in patch) {
    const effPickup = "상차일" in patch ? patch.상차일 : prev?.상차일;
    const effDrop = "하차일" in patch ? patch.하차일 : prev?.하차일;
    if (isReversedDateOrder(effPickup, effDrop)) {
      globalShowAlert(REVERSED_DATE_ORDER_MSG);
      return false;
    }
  }

  // 💸 2026-11-25 지급완료 오더의 기사운임 변경 · 취소 — 한 번 묻고, 장부는 그대로(지급액 고정 · "지급 후 운임 변경 / 지급 후 취소" 표시 · src/payCore.js)
  //   (정산 기록 __system 저장은 묻지 않고 지급액 고정만)
  if (patch && (!("지급상태" in patch) || patch.지급상태 === prev?.지급상태)) { // 오더 전체 저장(같은 지급상태가 딸려 옴)도 검사
    // 🔒 2026-11-27 지급완료 오더의 기사운임은 관리자(운송 · 경리)만 바꾼다 — 사무원(user)이 바꾸려 하면 안내하고 저장하지 않는다
    if (!patch.__system && paidFareLocked(role, finalBypass, prev, patch)) { globalShowAlert(PAID_FARE_LOCK_MSG); return false; }
    const _pg = paidEditGuard(prev, patch, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
    if (_pg.warn && !patch.__system && !(await confirmPaidEdit(_pg.warn))) return false;
    Object.assign(patch, _pg.extra);
  }

  // ⭐ 2026-11-01 청구운임·기사운임을 바꾸면 저장된 수수료도 같이 맞춘다 — 오더 수정 패널·표 칸 수정 등이
  //    운임만 바꾸고 수수료는 예전 값으로 남겨, 정산·매출(저장된 수수료를 먼저 읽음)에서 수익이 틀리게 나왔다.
  if (("청구운임" in patch || "기사운임" in patch || "지게차비용" in patch || "외부지급합" in patch || "특수운임" in patch)) {
    const _n = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
    const sale = _n("청구운임" in patch ? patch.청구운임 : prev?.청구운임);
    const drv = _n("기사운임" in patch ? patch.기사운임 : prev?.기사운임);
    // 🏗 2026-11-09 지게차비용 — 수익 = 청구 − 기사 − 지게차
    // 🧾 2026-11-09 특수운임 — 회사가 따로 주는 돈 = 외부지급합(없으면 지게차비용)
    const outOf = (o) => Math.max(0, _n(o?.외부지급합 != null ? o.외부지급합 : o?.지게차비용));
    const fork = "외부지급합" in patch ? Math.max(0, _n(patch.외부지급합)) : "지게차비용" in patch ? Math.max(0, _n(patch.지게차비용)) + Math.max(0, _n(prev?.외부지급합) - _n(prev?.지게차비용)) : outOf(prev);
    const prevAuto = _n(prev?.청구운임) - _n(prev?.기사운임) - outOf(prev);
    const prevAutoP = prev ? orderProfit(prev) : 0; // ⭐ 2026-11-17 지게차·특수운임 칸에서 다시 계산한 값
    const prevAuto0 = _n(prev?.청구운임) - _n(prev?.기사운임);
    const prevFee = prev?.수수료;
    // 예전 수수료가 비어 있거나 "청구-기사"와 같았던(자동 계산) 오더만 다시 계산한다 — 직접 넣은 수수료는 그대로
    const wasAuto = prevFee == null || String(prevFee).trim() === "" || _n(prevFee) === prevAuto || _n(prevFee) === prevAuto0 || _n(prevFee) === prevAutoP;
    const feeGiven = "수수료" in patch && _n(patch.수수료) !== _n(prevFee);
    // ⭐ 2026-11-17 바뀐 뒤 오더에 지게차·특수운임 칸이 있으면 그 칸으로(orderProfit) — 없으면 예전처럼 저장된 외부지급합 기준
    const merged = { ...(prev || {}), ...patch };
    const hasCols = Array.isArray(merged.특수운임) || merged.지게차비용 != null;
    if (wasAuto && !feeGiven) patch.수수료 = String(hasCols ? orderProfit(merged) : sale - drv - fork);
  }

  // ★ UI 즉시 반영 (optimistic update — Firestore 응답 기다리지 않음)
  React.startTransition(() => {
    setDispatchData(current => current.map(d =>
      d._id === _id ? { ...d, ...patch } : d
    ));
  });

  // 차량번호가 명시적으로 빈값 → 이름/전화/배차상태 전부 초기화
  // ⭐ 2026-10-27 — 원래 차량이 있었는데 지운 경우(=배차 취소)에만. 오더복사수정 패널은 오더 전체를 저장하므로
  //    아직 배차 전(차량번호 빈값)인 오더를 저장할 때마다 여기로 들어와 배차방식(24시·직접배차)을 지워버렸다.
  if ("차량번호" in patch && !String(patch.차량번호 || "").trim() && String(prev?.차량번호 || "").trim()) {
    patch.이름 = "";
    patch.전화번호 = "";
    patch.기사명 = "";
    patch.배차상태 = "배차중";
    patch.상태 = "배차중";
    patch.업체전달상태 = "미전달";
    // 배차가 취소되어 다시 배차중으로 돌아가면 "배차한시간"도 미확정 상태로 되돌린다.
    patch.배차확정일시 = null;
    patch.배차확정자 = null;
    // 차량정보가 빠지면 그 배차 자체가 무효화되는 것이므로, 배차방식(직접배차/24시
    // 등)도 다시 미선택 상태로 되돌린다 — 남아있으면 실제로는 배차가 취소됐는데
    // 배차방식만 이전 값으로 남아있어 헷갈린다는 피드백.
    // ⭐ 예전엔 여기에 "선택없음"이라는 문자열을 그대로 저장했는데, 배차방식
    // 드롭다운들의 빈값 옵션은 전부 value=""(라벨만 "선택"/"선택없음")이라
    // "선택없음"이라는 문자열 자체와는 일치하는 옵션이 없어 드롭다운이 아무 라벨도
    // 못 찾고 완전히 공란으로 보이는 원인이었다. 실제 "미선택" 값은 다른 곳과
    // 동일하게 빈 문자열로 저장해야 드롭다운에 플레이스홀더("선택")가 정상 표시된다.
    patch.배차방식 = "";
    // 배차 자체가 취소됐으니 지입 기사 오더수락/거절 플로우 흔적도 같이 지운다.
    patch.기사확인상태 = null;
    patch.기사거절사유 = null;
    patch.기사확인일시 = null;
    patch.기사완료일시 = null;
    // ⭐ 사용자 요청 — 담당자가 배차를 취소(차량번호를 뺌)하면 원래 배정돼 있던
    // 지입 기사에게 "배차가 취소되었습니다" 알림을 남긴다(기사 앱 알림종).
    if (prev?.차량번호) {
      const canceledDriver = drivers.find(d => normalizePlate(d.차량번호) === normalizePlate(prev.차량번호));
      if (isFleetGrade(canceledDriver?.등급)) {
        addDoc(collection(db, "driver_notifications"), {
          driverId: canceledDriver.id,
          type: "canceled",
          orderId: _id,
          title: "배차가 취소되었습니다",
          body: `담당자가 ${prev.거래처명 || ""} ${prev.상차지명 || "-"} → ${prev.하차지명 || "-"} 오더에서 차량 배정을 취소했습니다.`,
          createdAt: serverTimestamp(),
          read: false,
        }).catch(() => {});
      }
    }
  } else {
    const basePlate = patch.차량번호 || prev?.차량번호;
    if (basePlate) {
      const matches = drivers.filter(
        (d) => normalizePlate(d.차량번호) === normalizePlate(basePlate)
      );
      if (matches.length === 1) {
        const driver = matches[0];
        patch.이름 = driver.이름;
        patch.전화번호 = driver.전화번호;
        // ⭐ 사용자 요청 — 지입 기사에게 새 오더가 배정되면(차량번호가 이번 저장에서
        // 실제로 "새로" 지정됐을 때만 — 이미 그 차량으로 배정돼 있던 오더를 다른
        // 필드만 고치는 저장에는 재알림하지 않는다) 기사확인상태를 "대기"로 걸어
        // 기사 앱에서 오더수락/거절 카드 + 상단 배너 알림이 뜨게 한다.
        if (
          isFleetGrade(driver.등급) && !!driver.uid && // ⭐ 2026-11-02 기사앱을 아직 안 쓰는(가입 안 한) 지입 기사는 승인대기 없이 바로 배차완료
          "차량번호" in patch &&
          !isPayCancel("지급방식" in patch ? patch.지급방식 : prev?.지급방식) && // 🛠 2026-11-27 지급방식 "취소" 오더는 기사 알림 · 승인대기 없음
          normalizePlate(patch.차량번호) !== normalizePlate(prev?.차량번호)
        ) {
          patch.기사확인상태 = "대기";
          patch.기사거절사유 = null;
          patch.기사확인일시 = null;
          patch.기사완료일시 = null;
          // ⭐ 사용자 요청 — 지입 기사님이 아직 오더를 수락하지 않은 동안에는 4/5파트
          // 배차현황을 포함해 전체적으로 "배차완료"가 아니라 "승인대기"로 보여야
          // 한다. 기사님이 수락/거절하면 각각 배차완료/배차중으로 자동 전환된다
          // (DriverHome의 handleAcceptOrder/handleRejectOrderSubmit).
          patch.배차상태 = "승인대기";
          addDoc(collection(db, "driver_notifications"), {
            driverId: driver.id,
            type: "new_order",
            orderId: _id,
            title: "배차오더가 도착했습니다",
            body: `${patch.거래처명 || prev?.거래처명 || ""} ${patch.상차지명 || prev?.상차지명 || "-"} → ${patch.하차지명 || prev?.하차지명 || "-"}`,
            createdAt: serverTimestamp(),
            read: false,
          }).catch(() => {});
        }
      }
    }
  }

  // 🛠 2026-11-27 지급방식이 "취소"인 오더는 차량을 지우거나 넣어도 배차취소 그대로(목록에 다시 나오지 않게 · 서버 보정과 같게)
  if (patch.배차상태 !== undefined && isPayCancel("지급방식" in patch ? patch.지급방식 : prev?.지급방식)) patch.배차상태 = "배차취소";

  // ⭐ "배차한시간" — 배차중 → 배차완료로 처음 넘어가는 그 순간의 시각만 기록한다
  // (등록일 hover 툴팁에서 사용). 이미 배차완료 상태였던 오더를 다른 정보만 고쳐
  // 저장할 때는 덮어쓰지 않는다 — 최초로 배차가 확정된 시각을 유지해야 하므로.
  {
    const nextStatus = patch.배차상태 !== undefined ? patch.배차상태 : prev?.배차상태;
    if (nextStatus === "배차완료" && prev?.배차상태 !== "배차완료") {
      patch.배차확정일시 = serverTimestamp();
      if (_assignerSet) { /* 차량배정자를 직접 고른 경우 그 사람 그대로 */ } else
      // ⭐ "배차완료" 뱃지 팝업(모바일)/등록일 툴팁(PC)에서 배차한 사람 이름을
      // 보여주기 위한 필드 — PC/모바일 어느 쪽에서 확정했든 같은 필드를 쓴다.
      patch.배차확정자 = myRealName || user?.displayName || user?.email?.split("@")[0] || "";
    }
  }

  const safeStops = (v) => {
    if (Array.isArray(v) && v.length > 0) return v;
    if (typeof v === "string" && v.trim().startsWith("[")) {
      try { const p = JSON.parse(v); if (Array.isArray(p) && p.length > 0) return p; } catch {}
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        return keys.sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
      }
      if (v.업체명) return [v];
    }
    return [];
  };

  const cleanPatch = stripUndefinedDeep({
    ...patch,
    경유지_상차: Array.isArray(patch.경유지_상차)
      ? safeStops(patch.경유지_상차)
      : safeStops(prev.경유지_상차 || prev.경유상차목록),
    경유지_하차: Array.isArray(patch.경유지_하차)
      ? safeStops(patch.경유지_하차)
      : safeStops(prev.경유지_하차 || prev.경유하차목록),
    경유상차목록: Array.isArray(patch.경유상차목록)
      ? safeStops(patch.경유상차목록)
      : safeStops(prev.경유상차목록 || prev.경유지_상차),
    경유하차목록: Array.isArray(patch.경유하차목록)
      ? safeStops(patch.경유하차목록)
      : safeStops(prev.경유하차목록 || prev.경유지_하차),
  });

  // 🕒 배차중 → 배차완료로 실제 전환되는 순간에만 완료시각 기록
  // (차량번호 유무로 상태를 판단 — 모바일 등록내역 상태 판정과 동일 기준)
  // 이미 배차완료 상태에서 다른 항목만 수정될 때는 찍지 않아야
  // 모바일 등록내역의 "배차완료된 순" 정렬이 편집으로 뒤섞이지 않는다
  {
    const prevPlate = String(prev.차량번호 || "").trim();
    const nextPlate = String(cleanPatch.차량번호 ?? prev.차량번호 ?? "").trim();
    if (nextPlate && !prevPlate) {
      cleanPatch.배차완료일시 = Date.now();
    } else if (!nextPlate && prevPlate) {
      cleanPatch.배차완료일시 = null;
    }
  }
  // ⭐ 2026-11-17 담당노선 주인 — 배차담당자가 빈 오더(구글시트에서 온 오더 등)에 노선(담당노선구분)이 있으면 그 노선을 맡은 직원으로 채운다
  //  (직원이 [내 담당 설정]에서 정함 · companySettings/{회사}.routeGroupOwners · src/routeOwnerApply.js) — 직접 고른 담당자 · 정산 기록 · 최종마감 오더는 그대로
  if (!_ownerPick && !cleanPatch.__system) {
    const nextRow = { ...prev, ...cleanPatch };
    const fill = isLockedOrder(prev, finalDesk.closes) || isLockedOrder(nextRow, finalDesk.closes) ? null : routeOwnerFill(nextRow);
    if (fill) Object.assign(cleanPatch, fill);
  }

  // 경유지 필드 등은 매번 safeStops()로 새 배열을 만들어 cleanPatch에 채워 넣기 때문에
  // 내용이 같아도 참조가 달라져 아래 !== 비교가 항상 "변경됨"으로 오탐한다.
  // 객체/배열 값은 내용 기준(JSON)으로, 빈 값(undefined/null/[])은 서로 동일하게 취급해 비교한다.
  const normalizeForHistoryCompare = (v) => {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v) && v.length === 0) return null;
    return v;
  };
  const historyValuesEqual = (a, b) => {
    const na = normalizeForHistoryCompare(a);
    const nb = normalizeForHistoryCompare(b);
    if (na && typeof na === "object" || nb && typeof nb === "object") {
      return JSON.stringify(na) === JSON.stringify(nb);
    }
    return na === nb;
  };

  // 경유지 필드는 cleanPatch 쪽에서 "경유지_상차 없으면 경유상차목록으로" 식의 폴백을 거쳐 만들어지는데,
  // 비교 기준(before)이 그 폴백 없이 prev[key] 원본 그대로면, 실제로는 아무 것도 안 건드렸어도
  // (레거시로 한쪽 필드명에만 값이 있던 경우) 두 필드명을 서로 동기화하는 것 자체가 "변경"으로 오탐된다.
  // before 값도 cleanPatch와 동일한 폴백 규칙으로 정규화해서 비교해야 진짜 편집만 잡힌다.
  const WAYPOINT_FALLBACK = {
    경유지_상차: () => safeStops(prev.경유지_상차 || prev.경유상차목록),
    경유지_하차: () => safeStops(prev.경유지_하차 || prev.경유하차목록),
    경유상차목록: () => safeStops(prev.경유상차목록 || prev.경유지_상차),
    경유하차목록: () => safeStops(prev.경유하차목록 || prev.경유지_하차),
  };

  const histories = [];
  Object.keys(cleanPatch).forEach((key) => {
    if (IGNORE_HISTORY_FIELDS.has(key)) return;
    if (cleanPatch.__system === true) return;
    if (key === "업체전달상태") return;
    if (key === "업체전달일시") return;
    const prevValue = WAYPOINT_FALLBACK[key] ? WAYPOINT_FALLBACK[key]() : prev[key];
    if (!historyValuesEqual(prevValue, cleanPatch[key])) {
      histories.push(makeDispatchHistory({
        userEmail: auth.currentUser?.email,
        // 🛠 2026-11-13 서버 시각 · 삭제 표시 같은 Firestore 전용 값은 배열(이력) 안에 넣을 수 없다(저장 자체가 실패) → 이력에는 지금 시각/빈 값으로 남긴다
        field: key, before: prevValue ?? null, after: cleanPatch[key] instanceof FieldValue ? (/일시$|At$/.test(key) ? Date.now() : null) : (cleanPatch[key] ?? null),
      }));
    }
  });

  // 🏷 2026-11-27 배차완료 오더의 청구운임 · 기사운임을 바꾸면 '운임 변경' 표시(배차현황 줄) — 누가 · 언제 · 전 → 후(마지막 변경). 전체 기록은 변경 이력(history)
  { const fc = fareChangeMark(prev, cleanPatch, { by: auth.currentUser?.email || "" }); if (fc) cleanPatch.운임변경 = fc.clear ? null : fc; }
  const historyArr = Array.isArray(prev.history) ? prev.history : [];
  if (!prev.createdAt) {
    cleanPatch.createdAt = prev.updatedAt || prev.createdTime || Date.now();
  }

  // Firestore는 백그라운드에서 처리
  // ⭐ 2026-11-03 배차담당자(최초 등록자)는 수정해도 절대 안 바뀜 — 예전엔 고칠 때마다 작성자 칸이 "고친 사람"으로 덮여서
  //  경리 직원이 금액만 고쳐도 배차담당자가 그 직원으로 바뀌었다. 등록자 칸은 원래 값이 있으면 건드리지 않고, 고친 사람은 최종수정자에 따로 남긴다.
  // 👤 단, 배차담당자를 직접 고른 경우(_ownerPick)는 그 값으로 바꾼다(예전 uid는 지워 새 담당자로 보이게)
  if (_ownerPick) {
    if (String(prev.createdByUid || "").trim()) cleanPatch.createdByUid = null; if (String(prev.createdBy || "").trim()) cleanPatch.createdBy = null;
    // 예전 형식 칸(등록자 · 등록자이메일)이 남아 있는 오더는 그 칸도 새 담당자로 맞춘다
    if (String(prev.등록자 || "").trim()) cleanPatch.등록자 = _ownerPick.name;
    if (String(prev.등록자이메일 || "").trim() && _ownerPick.email) cleanPatch.등록자이메일 = _ownerPick.email;
  }
  else for (const k of ORDER_CREATOR_FIELDS) { if (k in cleanPatch && String(prev[k] ?? "").trim()) delete cleanPatch[k]; }
  const _updatePayload = {
    ...cleanPatch,
    ...(String(prev.작성자 || "").trim() ? {} : { 작성자: prev.createdByEmail || auth.currentUser?.email || "" }),
    최종수정자: auth.currentUser?.email || "",
    // 🛠 2026-11-27 이력은 새 줄만 덧붙인다(예전엔 들고 있던 배열 전체를 다시 써서, 동시에 고치면 남의 이력이 지워졌다)
    ...(histories.length ? { history: arrayUnion(...histories) } : (Array.isArray(prev.history) ? {} : { history: historyArr })),
  };
  if (!cleanPatch.__system) {
    _updatePayload.updatedAt = Date.now();
  }
  // 화주사가 등록한 오더를 운송사가 수정하면, 화주사 앱에 "운송사가 수정했습니다" 알림을 띄울 수 있도록 기록
  if (histories.length > 0 && (prev.source === "shipper" || prev.source === "shipper_mobile")) {
    _updatePayload.최종수정출처 = "transport";
    _updatePayload.최종수정일시 = serverTimestamp();
  }
  updateDoc(ref, _updatePayload).catch(e => console.error("patchDispatch 저장 오류:", e));
  // 💰 2026-11-06 고정노선(배차표) 오더 — 서버 자동 맞춤이 "시트가 바뀌었을 때만" 읽게 바뀌어, 프로그램에서 고친 값은 바로 시트에 쓴다(2.5초 묶음)
  if (prev?.배차표Id) requestRouteSheetPush(prev.배차표Id, 2500, prev.상차일); // 🔗 2026-11-08 고친 오더 날짜(지난 날짜도 시트에)

  // 운송사가 직접 등록해 "화주사 전송"으로 사본을 만든 오더는, 전송 이후 원본을 수정해도
  // 사본(화주사 화면이 실제로 구독하는 문서)에는 반영되지 않고 전송 시점 값으로 멈춰있던 버그가 있었다.
  // 기사배정/차량정보/금액 등 화주사에게 노출되는 필드만 화이트리스트로 골라 사본에도 함께 반영한다.
  // (기사운임은 화주사에게 노출하지 않는 필드라 의도적으로 제외)
  {
    const SHIPPER_MIRROR_FIELDS = [
      "상차지명", "상차지주소", "상차담당자명", "상차담당자번호",
      "하차지명", "하차지주소", "하차담당자명", "하차담당자번호",
      "상차일", "상차시간", "상차시간구분", "하차일", "하차시간", "하차시간구분",
      "차량종류", "차량톤수", "상차방법", "하차방법", "지급방식",
      "화물내용", "화물단위", "청구운임",
      "차량번호", "이름", "전화번호",
      "경유상차목록", "경유하차목록",
    ];
    const mirrorPatch = {};
    SHIPPER_MIRROR_FIELDS.forEach((key) => {
      if (key in cleanPatch) mirrorPatch[key] = cleanPatch[key];
    });
    // 🛠 2026-11-20 오더 칸(상차지담당자 · 상차지담당자번호) → 화주사 사본 칸(상차담당자명 · 상차담당자번호) — 예전엔 이름이 달라 담당자를 고쳐도 사본에 안 갔다
    Object.entries({ 상차지담당자: "상차담당자명", 상차지담당자번호: "상차담당자번호", 하차지담당자: "하차담당자명", 하차지담당자번호: "하차담당자번호" }).forEach(([from, to]) => { if (from in cleanPatch) mirrorPatch[to] = cleanPatch[from]; });
    if ("차량번호" in cleanPatch || "배차완료일시" in cleanPatch) {
      const mirrorPlate = String(cleanPatch.차량번호 ?? prev.차량번호 ?? "").trim();
      mirrorPatch.배차상태 = mirrorPlate ? "배차완료" : "배차중";
      // 배차완료일시가 미러에 반영되지 않으면 화주사 쪽 정렬(같은 날짜 안에서
      // 최근 완료건이 상단에 오도록)이 등록일 기준으로 밀려 엉뚱한 위치에 표시된다.
      if ("배차완료일시" in cleanPatch) mirrorPatch.배차완료일시 = cleanPatch.배차완료일시;
    }
    if (Object.keys(mirrorPatch).length > 0) {
      mirrorPatch.updatedAt = Date.now();
      // originCol/originId 역참조로 실제 사본을 다시 찾아 갱신하고, 끊어진(또는 애초에
      // 기록되지 않은) 포인터도 함께 복구한다. addDoc→updateDoc 두 단계로 만들어지는
      // _transmittedOrderId 백포인터 쓰기가 아직 반영되지 않은 시점에 배차/재배차가
      // 일어나면(캐시에 prev._transmittedOrderId가 없음) 사본 동기화 자체가 통째로
      // 건너뛰어져 화주사 화면이 영영 갱신되지 않던 버그가 있었다 — 포인터 유무와
      // 무관하게 항상 동기화를 시도한다.
      const findMirrorId = async () => {
        const q = query(
          collection(db, "orders"),
          where("originCol", "==", prev.__col || "dispatch"),
          where("originId", "==", _id),
          limit(1)
        );
        const snap = await getDocs(q);
        return snap.empty ? null : snap.docs[0].id;
      };
      // 사본 문서 자체가 (과거 버전의 버그 등으로) 완전히 삭제되어 역참조로도 찾을 수
      // 없는 경우: 취소된 오더가 아니라면 처음 등록될 때와 동일하게 새로 전송해 복구한다.
      const recreateMirror = async () => {
        if (String(prev.상태 || "").trim() === "취소") return;
        const matchedShipper = await findApprovedShipperLive(prev.companyName || userCompany, cleanPatch.거래처명 ?? prev.거래처명);
        if (matchedShipper) {
          await autoTransmitToShipper({ ...prev, ...cleanPatch, _id, __col: prev.__col || "dispatch" }, matchedShipper);
        }
      };
      (async () => {
        try {
          if (prev._transmittedOrderId) {
            await updateDoc(doc(db, "orders", prev._transmittedOrderId), mirrorPatch);
            return;
          }
          const realMirrorId = await findMirrorId();
          if (realMirrorId) {
            await updateDoc(doc(db, "orders", realMirrorId), mirrorPatch);
            await updateDoc(ref, { _transmittedOrderId: realMirrorId }).catch(() => {});
          } else {
            await recreateMirror();
          }
        } catch (e) {
          console.error("화주사 전송사본 동기화 오류:", e);
          try {
            const realMirrorId = await findMirrorId();
            if (realMirrorId) {
              await updateDoc(doc(db, "orders", realMirrorId), mirrorPatch);
              await updateDoc(ref, { _transmittedOrderId: realMirrorId }).catch(() => {});
            } else {
              await recreateMirror();
            }
          } catch (e2) {
            console.error("화주사 전송사본 재탐색 동기화 오류:", e2);
          }
        }
      })();
    }
  }
};
// opts.skipCompletedConfirm — 다건 선택삭제(deleteRowsWithUndo/executeDelete)는
// 호출부에서 이미 "완료된 오더가 N건 포함" 확인을 한번에 받았으므로, 건별로
// 또 묻지 않도록 이 플래그로 내부 confirm만 건너뛴다(기록은 그대로 남긴다).
// 배차표 지운 줄 열쇠(서버 functions/routeBoardSync.js tombKey 와 같은 규칙)
const rbTombKey = (date, group, name) => [date, group || "", name].map((x) => String(x || "").toLowerCase().replace(/[\s()（）[\]]/g, "").replace(/[^0-9a-z가-힣_-]/g, "_")).join("__");
// ⭐ 2026-11-05 여러 건 삭제가 한 줄씩 사라지던 문제 — removeDispatch(배열)이면 모든 건을 준비한 뒤
//   writeBatch 한 번(450건씩, 동시에 커밋)으로 지워 목록이 한 번에 갱신된다. 삭제 진행 창(runDelete)도 띄운다.
//   부수 처리(운행기록 스냅샷·기사 취소 알림·삭제 기록 deletedOrders·배차표 지운 줄·화주사 사본 삭제)는 그대로 한다.
//   한 건(문자열/객체)도 같은 길로 간다(확인창은 원래대로 먼저, 그다음 진행 창).
const removeDispatch = async (arg, opts = {}) => {
  let list = (Array.isArray(arg) ? arg : [arg]).filter(Boolean);
  if (!list.length) return;
  { // 🔒 최종마감 오더는 빼고 지운다
    const of = (a) => { const id = typeof a === "string" ? a : a?._id; return (typeof a === "object" && a?.거래처명 ? a : null) || ordersCacheRef.current.find(d => d._id === id) || dispatchCacheRef.current.find(d => d._id === id) || null; };
    const locked = list.map((a) => finalLockOf(of(a))).filter(Boolean);
    if (locked.length) { globalShowAlert(`${locked.length === list.length ? "" : `${locked.length}건은 빼고 지울게요.\n`}${finalLockMsg(locked[0])}`); list = list.filter((a) => !finalLockOf(of(a))); if (!list.length) return; }
  }
  { // 💸 2026-11-25 이미 지급한 오더 — 지워도 장부의 지급 기록은 남는다고 먼저 알려 준다
    const _of = (a) => { const id = typeof a === "string" ? a : a?._id; return ordersCacheRef.current.find(d => d._id === id) || dispatchCacheRef.current.find(d => d._id === id) || (typeof a === "object" ? a : null); };
    const _w = paidDeleteWarn(list.map(_of));
    if (_w && !(await kpConfirm(_w, { title: "이미 지급한 오더예요", okText: "지우기", cancelText: "취소", danger: true }))) return;
  }
  // 운송완료 오더 확인 — 한 건이면 원래 문구, 여러 건이면 한 번에 묻는다(거절하면 완료 건만 빼고 지운다)
  //   (진행 창이 뜨기 전에 묻는다 — 캐시에 없는 건은 예전처럼 준비 단계에서 건별로 묻는다)
  let skipDone = !!opts.skipCompletedConfirm;
  let dropDone = false;
  if (!skipDone) {
    const cachedOf = (a) => { const id = typeof a === "string" ? a : a?._id; return ordersCacheRef.current.find(d => d._id === id) || dispatchCacheRef.current.find(d => d._id === id) || null; };
    const all = list.map(cachedOf);
    const doneN = all.filter((c) => c?.기사확인상태 === "완료").length;
    if (doneN > 0) {
      const ok = await kpConfirm(list.length === 1 ? "운송이 완료된 오더입니다. 오더를 삭제하시겠습니까?" : `운송이 완료된 오더가 ${doneN}건 포함되어 있습니다. 오더를 삭제하시겠습니까?`);
      if (!ok && list.length === 1) return;
      dropDone = !ok;
    }
    if (all.every(Boolean)) skipDone = true;
  }
  return runDelete({
    count: list.length, label: "오더",
    task: async (progress) => {
      const preps = (await Promise.all(list.map((a) => _prepRemoveDispatch(a, { ...opts, skipCompletedConfirm: skipDone, dropCompleted: dropDone })))).filter(Boolean);
      if (!preps.length) return 0;
      // 삭제 기록(deletedOrders) — 예전처럼 실패해도 삭제는 계속(따로 묶음, 기다리지 않음)
      commitDeletes(db, preps.map((p) => (b) => b.set(doc(db, "deletedOrders", `${p.ref.parent.id}_${p.ref.id}`), { col: p.ref.parent.id, id: p.ref.id, at: serverTimestamp(), by: auth.currentUser?.email || "" }))).catch(() => {});
      await commitDeletes(db, preps.map((p) => p.ref), { onProgress: progress });
      // 화주사 사본 — 예전처럼 실패해도 원본 삭제엔 영향 없게 따로 묶음(묶음이 거부되면 건별로 다시)
      const mirrors = preps.filter((p) => p.data?._transmittedOrderId).map((p) => doc(db, "orders", p.data._transmittedOrderId));
      if (mirrors.length) {
        commitDeletes(db, mirrors).catch(() => {
          mirrors.forEach((r) => deleteDoc(r).catch((e) => console.error("화주사 전송사본 삭제 동기화 오류:", e)));
        });
      }
      preps.forEach(_afterRemoveDispatch);
      return preps.length;
    },
  });
};
// 삭제 전 준비(대상 찾기·완료 확인·운행기록·기사 알림) — 지울 문서 {id, ref, data, cached}를 돌려준다(건너뛰면 null)
const _prepRemoveDispatch = async (arg, opts = {}) => {
  const id = typeof arg === "string" ? arg : arg?._id;
  if (!id) return null;

  // ★ 메모리 캐시에서 먼저 찾기 (patchDispatch와 동일한 이유 — getDoc 왕복을 건너뛰어
  //   여러 건 선택삭제 시 순번대로 네트워크 왕복이 쌓여 버벅이던 지연을 줄인다.
  //   배열을 매번 새로 합치지 않고 각 캐시에서 순서대로 찾는다.)
  // 🛠 2026-11-16 실시간 범위 밖(예전) 오더 삭제가 직원 계정에서 오류 나던 문제 — findOrderDoc(캐시 → 예전 오더 → 서버, 거부돼도 다음 곳)
  const _found = await findOrderDoc(id, typeof arg === "object" ? arg : null);
  const cached = _found?.cached ? _found.data : null;
  let ref, data;
  if (cached) {
    ref = _found.ref;
    data = cached;
  } else {
    ref = _found?.ref || doc(db, "orders", id);
    const snap = { exists: () => !!_found, data: () => _found?.data };
    if (!snap.exists()) {
      console.error("✕ 삭제 대상 없음", id);
      return null;
    }
    data = snap.data();
  }

  // ⭐ 사용자 요청 — 이미 "운송완료"된 오더를 삭제하면 그 운행 기록이 통째로
  // 사라지므로, 한번 더 확인받고(다건삭제는 호출부가 이미 물어봤다) 확인/스킵
  // 시 기사 운행일지가 계속 보여줄 수 있도록 스냅샷을 남긴다.
  if (data?.기사확인상태 === "완료") {
    if (opts.dropCompleted) return null;
    if (!opts.skipCompletedConfirm && !await kpConfirm("운송이 완료된 오더입니다. 오더를 삭제하시겠습니까?")) return null;
  }
  // ⭐ 기사님이 수락(또는 완료)한 오더가 삭제되면 기사 운행기록에 "오더취소"로 남긴다
  if ((data?.기사확인상태 === "수락" || data?.기사확인상태 === "완료") && data?.차량번호) {
    archiveCompletedOrderPC(data, id, "오더삭제");
  }

  // ⭐ 버그수정 — 지입 기사에게 배정(대기/수락/완료)돼 있던 오더를 이 "삭제"로
  // 취소해도 기사확인상태 등을 전혀 안 지워서, 기사 앱의 오더수락/거절 카드가
  // 계속 남아있었다(카드는 기사확인상태로 판단하는데 그 필드가 그대로였음).
  // 아래 updateDoc에서 함께 초기화하고, 알림함에도 취소 사실을 남긴다
  // (실제 OS 푸시는 배차상태→"배차취소" 전환을 보는 Cloud Function이 보낸다).
  if (data?.기사확인상태 && data.기사확인상태 !== "거절" && data?.차량번호) {
    const canceledDriver = drivers.find(d => normalizePlate(d.차량번호) === normalizePlate(data.차량번호));
    if (isFleetGrade(canceledDriver?.등급)) {
      // ⭐ 2026-11-05 기사앱 "삭제된 오더" 팝업용 안내 문서(오더 요약 포함) — 따로 저장, 삭제는 기다리지 않는다
      writeOrderDeletedNotice(db, { driverId: canceledDriver.id, orderId: id, data });
    }
  }

  // ⭐ 사용자 요청 — "취소내역"(소프트 취소)을 없애고, 삭제하면 모든 화면에서 바로
  // 사라지도록 완전삭제한다. 기사 운행기록은 위 archiveCompletedOrderPC 스냅샷으로 남는다.
  // 삭제 기록을 남겨 다른 사용자 화면(예전 날짜 오더 포함)에서도 바로 사라지게 한다
  //   (삭제 기록·실제 삭제는 removeDispatch가 묶음으로 한다)
  return { id, ref, data, cached };
};
// 삭제 뒤 처리(배차표 지운 줄 · 화주사 사본 역참조 삭제) — 사본 포인터(_transmittedOrderId)는 removeDispatch가 묶음으로 지운다
const _afterRemoveDispatch = ({ id, data, cached }) => {
  // ⭐ 2026-11-03 배차표(구글시트)에서 자동으로 만든 오더 — 지운 줄을 양식에 기억해 두면 서버가 시트에 그 줄이 남아 있어도 다시 만들지 않는다
  //   ⭐ 운송사 분리 — 양식이 이 오더와 같은 회사일 때만(다른 회사 양식에 "지운 줄"을 남기면 그 회사 시트 줄이 안 들어온다)
  if (data?.배차표Id && data?.상차일) {
    const _tk = rbTombKey(data.상차일, data.배차표묶음, data.하차지명);
    const _fref = doc(db, "routeBoards", String(data.배차표Id));
    getDoc(_fref).then((fs) => {
      if (fs.exists() && String(fs.data()?.companyName || "") === String(data.companyName || "")) return updateDoc(_fref, { [`삭제한줄.${_tk}`]: increment(1) });
      return null;
    }).catch(() => {});
  }

  // 연동 화주사에게 전송된 사본이 있으면(운송사가 등록/전송한 오더), 원본을 취소할 때
  // 화주사 화면의 사본도 함께 삭제되도록 한다.
  if (data?._transmittedOrderId) {
    // (removeDispatch에서 묶음으로 삭제)
  } else if (!data?.source) {
    // _transmittedOrderId 포인터가 없어도(백포인터 기록 전에 삭제된 경우 등) originCol/originId
    // 역참조로 실제 사본을 찾아 함께 지운다 — 그러지 않으면 화주사 화면에는 "배차중"으로
    // 영원히 남아있게 된다.
    (async () => {
      try {
        const q = query(
          collection(db, "orders"),
          where("originCol", "==", data?.__col || cached?.__col || "dispatch"),
          where("originId", "==", id),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) await deleteDoc(doc(db, "orders", snap.docs[0].id));
      } catch (e) {
        console.error("화주사 전송사본 삭제 재탐색 오류:", e);
      }
    })();
  }
};

// 화주사의 "수정요청"(배차완료 오더 수정) 승인/거절 — 승인 시에만 실제 필드에 반영되고
// history에 기록되며, 거절 시에는 요청 내용을 버리고 플래그만 정리한다.
const approveEditRequestPC = async (order) => {
  const pending = order.수정요청데이터 || {};
  const histories = [];
  Object.keys(pending).forEach((key) => {
    if (IGNORE_HISTORY_FIELDS.has(key)) return;
    const before = order[key] ?? null;
    const after = pending[key] ?? null;
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
      histories.push(makeDispatchHistory({ userEmail: auth.currentUser?.email, field: key, before, after }));
    }
  });
  const ref = doc(db, order.__col || "orders", order._id || order.id);
  await updateDoc(ref, {
    ...pending,
    ...(histories.length ? { history: arrayUnion(...histories) } : {}), // 🛠 2026-11-27 새 이력만 덧붙이기
    최종수정출처: "shipper",
    최종수정일시: serverTimestamp(),
    수정요청: false,
    수정요청데이터: deleteField(),
    수정거절: false,
    수정확인: deleteField(),
    수정처리: "승인",
    수정처리일시: serverTimestamp(),
    updatedAt: Date.now(),
  });
};
const rejectEditRequestPC = async (order) => {
  const ref = doc(db, order.__col || "orders", order._id || order.id);
  await updateDoc(ref, {
    수정요청: false,
    수정요청데이터: deleteField(),
    수정거절: true,
    수정거절일시: serverTimestamp(),
    수정확인: deleteField(),
    수정처리: "거절",
    수정처리일시: serverTimestamp(),
  });
};
// 운송사가 수정요청 팝업을 열람하면(승인/거절 결정 전) 화주사 쪽 "수정현황"에
// 요청중 → 확인함 전환이 보이도록 표시만 남긴다. 이미 확인된 경우 중복 쓰기는 생략.
const markEditRequestSeen = async (order) => {
  if (order.수정확인) return;
  const ref = doc(db, order.__col || "orders", order._id || order.id);
  await updateDoc(ref, { 수정확인: true }).catch(() => {});
};
  // ⭐ 2026-11-05 PC·모바일 일치 — 저장 내용은 모듈 함수 pcUpsertDriver 하나(모바일 기사관리도 같은 함수)
  const upsertDriver = (driver) => pcUpsertDriver({ drivers, role, userCompany, myRealName, user }, driver);


  // ⭐ 2026-11-05 기사 삭제 — 배열이면 한 번에(writeBatch) 지우고, 한 건이든 여러 건이든 삭제 진행 창을 띄운다
  const removeDriver = async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;
    return removeDriversCascade(ids, drivers); // ⭐ 2026-11-10 연결된 기사앱 계정까지 정리
  };

  // ⭐ 2026-11-05 PC·모바일 일치 — 저장 내용은 모듈 함수 pcUpsertClient 하나(모바일 거래처관리도 같은 함수)
  const upsertClient = (client) => pcUpsertClient({ role, userCompany, places }, client);

  // ⭐ 2026-11-05 거래처 삭제 — 배열 가능 · 한 번에 삭제 + 삭제 진행 창
  const removeClient = async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;
    return deleteDocsAtomic(db, ids.map((id) => doc(db, COLL.clients, id)), { label: "거래처" });
  };

  return {
    dispatchData,
    setDispatchData,   // ★ 추가
    liveDataReady,
    recentDispatchData,
    recentLiveDataReady,
    drivers,
    clients,
    places,
    addDispatch,
    patchDispatch,
    removeDispatch,
    approveEditRequestPC,
    rejectEditRequestPC,
    markEditRequestSeen,
    upsertDriver,
    removeDriver,
    upsertClient,
    removeClient,
    approvedShippers,
    myRealName,
    myPhone,
    loadRange,
    loadFullHistory,
    historyLoading,
  };
}  // ← ★ 이거 반드시 필요

// 🛠 2026-11-25 금액 읽기 = fkNum(functions/profitCore.mjs)과 같게 — 예전엔 소수점을 지워 "181818.18"(엑셀 계산 값)이 18,181,818이 됐다
export const toInt = (v) => fkNum(v);
function makeFullDetailText(r) {

  const pickupTime = r.상차시간?.trim() || "즉시";
  const dropTimeRaw = r.하차시간?.trim() || "즉시";

  const plate = r.차량번호 || "-";
  const name = r.이름 || "-";
  const phone = formatPhone(r.전화번호 || "");

  const fare = Number(r.청구운임 || 0);
  const payLabel = r.지급방식 || "";

  // =====================
  // 요일 계산
  // =====================
  const yoilList = ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"];
  let yoil = "";

  if (r.상차일) {
    const d = new Date(r.상차일);
    yoil = yoilList[d.getDay()];
  }

  // =====================
  // 하차 날짜 계산
  // =====================
  let dateNotice = "";
  let dropTimeText = dropTimeRaw;

  if (r.상차일 && r.하차일) {

    const s = new Date(r.상차일);
    const e = new Date(r.하차일);

    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

    const diffDays = Math.round(
      (e0 - s0) / (1000 * 60 * 60 * 24)
    );

    const sm = s.getMonth() + 1;
    const sd = s.getDate();

    const em = e.getMonth() + 1;
    const ed = e.getDate();

    if (diffDays === 1) {

      dateNotice =
        `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;

      dropTimeText =
        `${em}/${ed} ${dropTimeRaw}`;

    }

    else if (diffDays >= 2) {

      dateNotice =
        `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;

      dropTimeText =
        `${em}/${ed} ${dropTimeRaw}`;

    }

  }

  // =====================
  // 메시지 생성
  // =====================
  return `${dateNotice}${r.상차일 || ""} ${yoil}

상차지 : ${r.상차지명 || "-"}
${r.상차지주소 || "-"}${
  r.상차지담당자 || r.상차지담당자번호
    ? `\n담당자 : ${r.상차지담당자 || ""}${
        r.상차지담당자번호
          ? ` (${formatPhone(r.상차지담당자번호)})`
          : ""
      }`
    : ""
}
상차시간 : ${pickupTime}
상차방법 : ${r.상차방법 || "-"}

하차지 : ${r.하차지명 || "-"}
${r.하차지주소 || "-"}${
  r.하차지담당자 || r.하차지담당자번호
    ? `\n담당자 : ${r.하차지담당자 || ""}${
        r.하차지담당자번호
          ? ` (${formatPhone(r.하차지담당자번호)})`
          : ""
      }`
    : ""
}
하차시간 : ${dropTimeText}
하차방법 : ${r.하차방법 || "-"}

중량 : ${r.차량톤수 || "-"}${r.화물내용 ? ` / ${r.화물내용}` : ""} ${r.차량종류 || ""}

${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;

}

// ===================== TOAST SYSTEM (GLOBAL) =====================
const ToastContext = React.createContext(null);
window.__sflowToastQueue = window.__sflowToastQueue || [];
function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  const toastHoverRef = React.useRef(false); // 🎨 2026-11-24 라이브 알림에 마우스를 올려 둔 동안 true
  const [liveOpen, setLiveOpen] = React.useState(false); // 알림이 3종류 넘게 몰렸을 때 펼치기
  const dropTimersRef = React.useRef(new Set()); // 사라지는 타이머를 건 알림

  // 알림이 사라질 때 — 먼저 흐려지고(leaving · 0.32초) 그다음 목록에서 뺀다
  const startDrop = (id, type) => {
    if (dropTimersRef.current.has(id)) return; // 같은 알림에 타이머를 두 번 걸지 않는다(React 가 상태 함수를 두 번 부르는 경우)
    dropTimersRef.current.add(id);
    // 화주사 수정요청/기사취소요청은 승인이 필요한 중요 건이라 놓치지 않도록 더 오래 유지한다.
    const corner = type === "editRequest" || type === "cancelRequest";
    // 🎨 2026-11-24 라이브 알림 — 마우스를 올려 두면 사라지지 않고 기다린다
    const drop = () => {
      if (toastHoverRef.current && !corner) { setTimeout(drop, 600); return; }
      if (corner) { dropTimersRef.current.delete(id); setToasts((prev) => prev.filter(t => t.id !== id)); return; }
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => { dropTimersRef.current.delete(id); setToasts((prev) => prev.filter(t => t.id !== id)); }, 320);
    };
    setTimeout(drop, corner ? 8000 : 4000);
  };
  // 기다리던 알림 차례 — 배차 완료 알림이 다 사라졌으면(그리고 기다릴 시간이 지났으면) 흐린 상태에서 나타나게 한다
  React.useEffect(() => {
    const pend = toasts.filter((t) => t.pending);
    if (!pend.length || toasts.some((t) => t.type === "dispatch")) return undefined;
    const tm = setTimeout(() => {
      pend.forEach((t) => startDrop(t.id, t.type));
      setToasts((prev) => prev.map((t) => (t.pending ? { ...t, pending: false, fadeIn: true, createdAt: Date.now() } : t)));
    }, Math.max(0, ...pend.map((t) => (t.holdUntil || 0) - Date.now())));
    return () => clearTimeout(tm);
  }, [toasts]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (message, type = "success", meta = null) => {
    const id = crypto.randomUUID();
    setToasts((prev) => {
      // 같은 오더에 대한 같은 내용의 알림이 이미 떠 있으면 중복으로 추가하지 않는다.
      // Firestore 리스너가 로컬 낙관적 갱신과 서버 확정 스냅샷을 짧은 간격으로 두 번
      // 감지하는 등의 이유로, 배차완료 배너가 같은 오더에 대해 2번 뜨던 문제가 있었다.
      const isDuplicate = prev.some(t =>
        t.type === type &&
        t.message === message &&
        (meta?.orderId ? t.meta?.orderId === meta.orderId : true)
      );
      if (isDuplicate) return prev;
      // 🎬 2026-11-25 배차하고 [수정 저장]하면 알림 두 개가 한꺼번에 뜨던 것 → 차례로(사용자 요청)
      //  "배차 완료"가 먼저 뜨고 흐려지며 사라진 뒤, 같은 자리에 "오더 수정 완료"가 흐린 상태에서 진하게 나타난다.
      //  · 배차 완료 알림이 떠 있는 동안 들어온 완료 알림(success)은 기다린다(pending)
      //  · meta.afterDispatch(방금 저장으로 배차가 된 경우) — 배차 완료 알림이 조금 늦게 와도 그 뒤에 서도록 잠깐(1.5초까지) 기다린다
      const wait = type === "success" && (meta?.afterDispatch || prev.some((t) => t.type === "dispatch"));
      if (wait) return [...prev, { id, message, type, meta, createdAt: Date.now(), pending: true, holdUntil: Date.now() + (meta?.afterDispatch ? 1500 : 0) }];
      startDrop(id, type);
      return [...prev, { id, message, type, meta, createdAt: Date.now() }];
    });
    // 새로 바뀐 오더 줄은 2초 동안 은은하게 표시
    if (meta?.orderId) setTimeout(() => {
      const el = document.getElementById(`row-${meta.orderId}`);
      if (!el) return;
      el.classList.remove("kp-row-new"); void el.offsetWidth; el.classList.add("kp-row-new");
      setTimeout(() => el.classList.remove("kp-row-new"), 2300);
    }, 80);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter(t => t.id !== id));
  };

  // 🔔 showToast를 window에 노출 + 큐에 쌓인 알림 즉시 처리
  // (이 useEffect는 컴포넌트 최상위에서 마운트 시 1회만 실행되어야 한다 — 과거에
  // handleToastClick 안쪽에 잘못 중첩되어 있어서 실제로는 절대 실행되지 않았고,
  // 그 결과 window.__sflowToastQueue가 세션 내내 무한정 쌓이는 메모리 누수가 있었다.)
  React.useEffect(() => {
    window.__sflowShowToast = showToast;

    // 마운트 전에 쌓인 알림 처리
    if (window.__sflowToastQueue && window.__sflowToastQueue.length > 0) {
      window.__sflowToastQueue.forEach(({ message, type, meta }) => {
        showToast(message, type, meta);
      });
      window.__sflowToastQueue = [];
    }

    return () => { delete window.__sflowShowToast; };
  }, []);

  // 알림 클릭 → 해당 오더로 스크롤 + 하이라이트
  const handleToastClick = (toast) => {
    if (!toast.meta?.orderId) return;
    removeToast(toast.id);

    const rowEl = document.getElementById(`row-${toast.meta.orderId}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
      rowEl.classList.add("toast-flash-border");
      setTimeout(() => rowEl.classList.remove("toast-flash-border"), 2000);
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* 알림 배너 CSS */}
      <style>{`
        @keyframes toastSlideDown {
          0%   { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastSlideUp {
          0%   { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-100%); }
        }
        /* 화주사 배차요청/취소 배지 깜빡임 — 행마다 <style> 태그를 반복 삽입하지 않도록 전역에서 한 번만 정의 */
        @keyframes shipperReqBlink { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes cancelSlowBlink { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        /* 화주사 수정요청/취소요청 상태뱃지 — 입체감 있는 빠른 깜빡임 */
        @keyframes statusUrgentBlink {
          0%, 100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
          50% { opacity: 0.82; transform: translateY(-0.5px) scale(1.035); filter: brightness(1.18); }
        }
        .toast-enter {
          animation: toastSlideDown 0.35s ease-out forwards;
        }
        @keyframes versionBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .kp-newver-dot { animation: versionBlink 1.2s ease-in-out infinite; box-shadow: 0 0 8px #8FB0F0; }
        @keyframes toastFlashBorder {
          0%   { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
          30%  { box-shadow: 0 0 0 4px rgba(59,130,246,0.4), 0 0 20px rgba(59,130,246,0.3); }
          100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
        .toast-flash-border {
          animation: toastFlashBorder 1s ease-in-out 2;
        }
      `}</style>

      {/* 🎨 2026-11-24 라이브 알림(사용자 요청) — 오른쪽 위 남색 카드 → 화면 위 가운데(헤더 바로 아래) 알약
            · 한 건: 내용 한 줄 + [보기] · 여러 건: 내역 없이 "오더 12건이 등록되었습니다"처럼 숫자만 크게(숫자가 올라가고 빛이 한 번 스침)
            · 종류마다 색: 배차 완료 에메랄드 · 등록 블루 · 수정 골드 · 취소/오류 붉은색 — 왼쪽 띠와 아이콘에만
            · 마우스를 올리면 기다림 · 3종류 넘게 몰리면 "알림 N개"로 접힘 · 강제 업데이트 안내가 떠 있으면 그 아래로 */}
      {(() => {
        const UI = {
          dispatch: { label: "배차 완료", en: "DISPATCHED", c: "#2FBF8F", hi: "#7FE0B9", many: (n) => `${n}건 배차가 완료되었습니다` },
          orderRegistered: { label: "오더 등록", en: "REGISTERED", c: "#8FB0F0", hi: "#CFE0FF", many: (n) => `오더 ${n}건이 등록되었습니다` },
          order: { label: "화주사 신규 오더", en: "SHIPPER ORDER", c: "#8FB0F0", hi: "#CFE0FF", many: (n) => `화주사 신규 오더 ${n}건이 들어왔습니다` },
          shipperEdit: { label: "화주사 수정", en: "EDITED", c: "#D7BC82", hi: "#F3E3BC", many: (n) => `화주사 수정 ${n}건이 반영되었습니다` },
          cancel: { label: "오더 취소", en: "CANCELLED", c: "#E0707A", hi: "#FFB3B8", many: (n) => `오더 ${n}건이 취소되었습니다` },
          error: { label: "확인 필요", en: "CHECK", c: "#E0707A", hi: "#FFB3B8", many: (n) => `확인이 필요한 항목 ${n}건` },
          other: { label: "알림", en: "NOTICE", c: "#8FB0F0", hi: "#CFE0FF", many: (n) => `새 알림 ${n}건` },
        };
        const ICON = {
          dispatch: <path d="M5 12.5l4.2 4.2L19 7" />,
          order: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
          shipperEdit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
          cancel: <><path d="M7 7l10 10" /><path d="M17 7L7 17" /></>,
          other: <><path d="M12 3a5 5 0 0 0-5 5v3.5L5 15h14l-2-3.5V8a5 5 0 0 0-5-5z"/><path d="M10 18a2 2 0 0 0 4 0"/></>,
        };
        const hm = (ms) => new Date(ms || Date.now()).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        const keep = (e) => e.preventDefault(); // 눌러도 입력칸 포커스를 빼앗지 않는다
        const list = toasts.filter(t => t.type !== "editRequest" && t.type !== "cancelRequest" && !t.pending); // 차례를 기다리는 알림은 아직 안 보인다
        const groups = [];
        list.forEach((t) => { const g = groups.find((x) => x.type === t.type); if (g) g.items.push(t); else groups.push({ type: t.type, items: [t] }); });
        if (!groups.length) return null;
        const shown = liveOpen ? groups : groups.slice(-2);
        const hidden = groups.length - shown.length;
        return (
          <div className="kp-live fixed left-1/2 -translate-x-1/2 z-[99999] flex flex-col items-center gap-2 pointer-events-none" style={{ width: "min(560px, 94vw)" }} data-kp="sflow-toasts"
            onMouseEnter={() => { toastHoverRef.current = true; }} onMouseLeave={() => { toastHoverRef.current = false; setLiveOpen(false); }}>
            <style>{`
              .kp-live{top:72px;transition:top .3s ease}
              html[data-kp-force] .kp-live{top:136px}
              @keyframes kpLiveIn{from{opacity:0;transform:translateY(-10px) scale(.97)}to{opacity:1;transform:none}}
              @keyframes kpLiveSweep{from{transform:translateX(-160%) skewX(-18deg)}to{transform:translateX(560%) skewX(-18deg)}}
              @keyframes kpLiveBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
              @keyframes kpLiveNum{0%{transform:translateY(6px);opacity:.2}100%{transform:none;opacity:1}}
              .kp-live-pill{animation:kpLiveIn .38s cubic-bezier(.2,.8,.2,1) both}
              @keyframes kpLiveFade{from{opacity:0}to{opacity:1}}
              @keyframes kpLiveOut{from{opacity:1}to{opacity:0}}
              .kp-live-pill.kp-live-fade{animation:kpLiveFade .5s ease-out both}
              .kp-live-pill.kp-live-out{animation:kpLiveOut .32s ease-in both;pointer-events:none}
              .kp-live-pill:after{content:"";position:absolute;top:0;bottom:0;width:90px;left:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.12),transparent);animation:kpLiveSweep 1.1s ease-out .25s 1 both;pointer-events:none}
              .kp-live:hover .kp-live-bar{animation-play-state:paused}
              @keyframes kpRowNew{0%{background:rgba(47,191,143,.16)}100%{background:transparent}}
              tr.kp-row-new>td,.kp-row-new{animation:kpRowNew 2.2s ease-out 1}
              @media (prefers-reduced-motion:reduce){.kp-live-pill,.kp-live-pill:after{animation:none}}
            `}</style>
            {shown.map((g) => {
              const latest = g.items[g.items.length - 1];
              const n = g.items.length;
              const many = n > 1;
              const ui = UI[g.type] || UI.other;
              const icoKey = g.type === "orderRegistered" ? "order" : g.type === "error" ? "cancel" : g.type;
              const close = (e) => { e.stopPropagation(); g.items.forEach((t) => removeToast(t.id)); };
              return (
                <div key={g.type} role="status" aria-live="polite" onMouseDown={keep} data-kp-sftoast={g.type}
                  className={`kp-live-pill ${g.items.every((t) => t.leaving) ? "kp-live-out" : n === 1 && latest.fadeIn ? "kp-live-fade" : ""} pointer-events-auto relative overflow-hidden rounded-[22px] text-white max-w-full flex items-center gap-3 pl-3 pr-2 py-2.5 border border-white/[0.07] shadow-[0_18px_44px_rgba(11,20,40,.38)]`}
                  style={{ background: "linear-gradient(120deg,rgba(11,20,40,.97),rgba(23,36,64,.97))", backdropFilter: "blur(6px)" }}>
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: ui.c }} />
                  <span className="w-10 h-10 rounded-[14px] grid place-items-center shrink-0" style={{ background: `${ui.c}29` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ui.hi} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{ICON[icoKey] || ICON.other}</svg>
                  </span>
                  {many && <span key={n} className="text-[30px] font-black tabular-nums leading-none shrink-0" style={{ color: ui.hi, animation: "kpLiveNum .35s ease-out both" }}>{n}<span className="text-[14px] ml-0.5">건</span></span>}
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => !many && handleToastClick(latest)}>
                    <div className="flex items-center gap-1.5 text-[10.5px] font-black tracking-[0.16em]" style={{ color: ui.c }}>
                      <span>{ui.en}</span><span className="tracking-normal">· {ui.label}</span><span className="ml-1 tracking-normal font-bold text-white/40 tabular-nums">{hm(latest.createdAt)}</span>
                    </div>
                    <div className="text-[14.5px] font-black truncate mt-0.5" title={many ? "" : latest.message}>{many ? ui.many(n) : latest.message}</div>
                  </div>
                  {!many && latest.meta?.orderId && <button type="button" tabIndex={-1} onMouseDown={keep} onClick={(e) => { e.stopPropagation(); handleToastClick(latest); }} className="h-[34px] px-3.5 rounded-xl text-[12.5px] font-black bg-white/10 border border-white/[0.14] shrink-0 hover:bg-white/[0.16]">보기</button>}
                  <button type="button" tabIndex={-1} onMouseDown={keep} onClick={close} className="w-7 h-7 rounded-lg grid place-items-center text-white/45 hover:text-white/80 hover:bg-white/10 shrink-0" aria-label="닫기">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                  <span className="kp-live-bar absolute left-0 bottom-0 h-[2px] w-full origin-left opacity-80" style={{ background: ui.c, animation: "kpLiveBar 4000ms linear forwards" }} key={latest.id} />
                </div>
              );
            })}
            {hidden > 0 && <button type="button" onMouseDown={keep} onClick={() => setLiveOpen(true)} className="pointer-events-auto h-8 px-3.5 rounded-full text-[12px] font-black text-[#F3E3BC] border border-[rgba(215,188,130,.4)] shadow-[0_8px_20px_rgba(11,20,40,.3)]" style={{ background: "linear-gradient(120deg,#0B1428,#172440)" }}>알림 {hidden}개 더 · 펼치기</button>}
          </div>
        );
      })()}

      {/* 우하단 알림 배너 — 화주사 수정요청/기사취소요청 전용 (상단 알림과 별도로 항상 눈에 띄게) */}
      <div className="fixed bottom-5 right-5 z-[99999] space-y-2 pointer-events-none" style={{ width: "360px", maxWidth: "90vw" }}>
        {toasts.filter(t => t.type === "editRequest" || t.type === "cancelRequest").map(t => (
          <div
            key={t.id}
            className="toast-enter pointer-events-auto cursor-pointer rounded-2xl shadow-2xl border overflow-hidden"
            style={{
              background: t.type === "editRequest"
                ? "linear-gradient(135deg,#3b5998,#0f2151)"
                : "linear-gradient(135deg,#f87171,#b91c1c)",
            }}
            onClick={() => handleToastClick(t)}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {t.type === "editRequest" ? (
                    <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>
                  ) : (
                    <><circle cx="12" cy="12" r="9"/><line x1="7" y1="7" x2="17" y2="17"/></>
                  )}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[13px] font-bold leading-snug">
                  {t.type === "editRequest" ? "화주사 수정요청" : "화주사 오더취소요청"}
                </div>
                <div className="text-white/80 text-[12px] mt-0.5 leading-relaxed truncate">
                  {t.message}
                </div>
                <div className="text-white/50 text-[10px] mt-1">클릭하면 해당 오더로 이동합니다</div>
              </div>
              <button
                className="text-white/40 hover:text-white text-[18px] leading-none shrink-0 mt-0.5 px-1"
                onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const useToast = () => React.useContext(ToastContext);
// ============================================================
export {
  cellBase, DISPATCH_TYPES,
  headBase, inputBase, PAY_TYPES, todayStr, VEHICLE_TYPES
};

// 프로그램 전체 톤에 맞춘 단색 트럭 아이콘 — 알록달록한 이모지(🚚) 대신 사용.
function TruckIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="7" width="13" height="10" rx="1" />
      <path d="M14 10h4l3.5 3.5V17H14z" />
      <circle cx="6" cy="19" r="1.6" />
      <circle cx="17.5" cy="19" r="1.6" />
    </svg>
  );
}

// 사용자가 제공한 톤수별 차량 규격표(구분/적재함 길이/폭 참고/실무상 명칭) 기준으로
// 재작성. 장축·초장축·축차·특장 등 세부 구분까지 각각 별도 차량으로 등록해야
// "5톤 초장축이면 16파렛이 실리는데 계산기는 11톤부터라고 한다" 같은 오차가
// 안 생긴다. 적재함 길이/폭이 범위로 안내된 값은 중간값을 cm로 환산해서 쓰고,
// 자체 무게(maxKg)는 원표에 없어 톤수 표기 그대로(1톤=1,000kg 등)를 적용했다.
// 높이(h)도 원표에 없는 값이라 인접 톤수 실측치를 참고해 추정한 값이다.
// 최대 적재 중량(maxKg) 산정 기준 — 예전엔 전부 "톤수 그대로"(예: 5톤=5,000kg)였는데
// 실제로는 (1) 도로교통법상 적재중량의 110%까지는 허용되고(=5톤도 실제 5,500kg까지는
// 정상 범주), (2) 같은 톤수라도 축이 추가된 축차/후축 차량은 축이 없는 일반 차량보다
// 훨씬 더 실을 수 있다(적재함이 길어서가 아니라 차량 자체 등록중량이 다름). 그래서
// 구분(일반/장축/축차 등)별로 아래 배율을 적용해 차등을 뒀다 — 일반 ×1.1, 장축·와이드
// 처럼 축은 그대로에 적재함만 긴 경우 ×1.15, 축차/후축처럼 축이 추가된 경우 ×1.4~1.5,
// 5톤 초장축(특장)은 원표(엑셀)에 적힌 "5.5톤/8.5톤 증톤 등"의 상한을 그대로 반영했다.
const LOAD_VEHICLES = [
  { name: "다마스",       l: 170,  w: 120, h: 110, maxKg: 300   },
  { name: "라보",         l: 200,  w: 145, h: 130, maxKg: 500   },
  { name: "1톤",          l: 278,  w: 160, h: 170, maxKg: 1100  },
  { name: "1톤 장축",     l: 305,  w: 160, h: 170, maxKg: 1150  },
  { name: "1.4톤",        l: 300,  w: 165, h: 180, maxKg: 1550  },
  { name: "1.4톤 장축",   l: 340,  w: 170, h: 180, maxKg: 1600  },
  { name: "2.5톤",        l: 425,  w: 180, h: 190, maxKg: 2750  },
  { name: "3.5톤",        l: 470,  w: 205, h: 190, maxKg: 3850  },
  { name: "3.5톤 장축",   l: 525,  w: 218, h: 190, maxKg: 4000  },
  { name: "3.5톤 와이드", l: 570,  w: 230, h: 190, maxKg: 4000  },
  { name: "5톤",          l: 625,  w: 223, h: 200, maxKg: 5500  },
  { name: "5톤 플러스",   l: 700,  w: 230, h: 200, maxKg: 5800  },
  { name: "5톤 축",       l: 790,  w: 235, h: 200, maxKg: 7500  },
  { name: "5톤 초장축",   l: 960,  w: 240, h: 200, maxKg: 8500  },
  { name: "8톤",          l: 765,  w: 235, h: 210, maxKg: 8800  },
  { name: "8톤 특장",     l: 850,  w: 240, h: 210, maxKg: 9200  },
  { name: "9.5톤",        l: 875,  w: 238, h: 210, maxKg: 10500 },
  { name: "11톤",         l: 900,  w: 235, h: 210, maxKg: 12000 },
  { name: "11톤 장축",    l: 960,  w: 240, h: 210, maxKg: 12700 },
  { name: "11톤 후축",    l: 1020, w: 240, h: 210, maxKg: 14500 },
  { name: "14톤",         l: 900,  w: 235, h: 220, maxKg: 15400 },
  { name: "14톤 후축",    l: 990,  w: 240, h: 220, maxKg: 18200 },
  { name: "18톤",         l: 1010, w: 240, h: 230, maxKg: 19800 },
  { name: "22톤",         l: 1010, w: 240, h: 230, maxKg: 24200 },
  { name: "25톤",         l: 1010, w: 240, h: 240, maxKg: 27500 },
  { name: "추레라",       l: 1200, w: 240, h: 240, maxKg: 27500 },
  { name: "추레라 특장",  l: 1200, w: 240, h: 240, maxKg: 32000 },
];

function PalletDiagram({ item, qty, layers, palW_mm, palD_mm }) {
  const { veh, cols, rows, cap1, rotated } = item;
  if (!veh || cols === 0 || rows === 0) {
    return <div style={{ color: "#94a3b8", fontSize: 11, textAlign: "center", padding: 8 }}>적재 불가</div>;
  }
  const pw_cm = rotated ? palD_mm / 10 : palW_mm / 10;
  const pd_cm = rotated ? palW_mm / 10 : palD_mm / 10;
  const maxDispW = 242; const maxDispH = 88;
  const scale = Math.min(maxDispW / veh.l, maxDispH / veh.w, 0.9);
  const truckDispW = Math.round(veh.l * scale);
  const truckDispH = Math.round(veh.w * scale);
  const palDispW = pd_cm * scale;
  const palDispH = pw_cm * scale;
  const neededOnFloor = qty > 0 ? Math.min(Math.ceil(qty / layers), cap1) : cap1;
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, textAlign: "center" }}>
        {veh.name} · {(veh.l / 100).toFixed(1)}m × {(veh.w / 100).toFixed(1)}m (위에서 본 모습)
        {rotated && <span style={{ marginLeft: 4, color: "#f59e0b" }}>↺ 회전배치</span>}
      </div>
      <div style={{ position: "relative", width: truckDispW, height: truckDispH, border: "2px solid #1B2B4B", borderRadius: 3, background: "#f1f5f9", overflow: "hidden", margin: "0 auto" }}>
        {Array.from({ length: rows }).flatMap((_, ri) =>
          Array.from({ length: cols }).map((_, ci) => {
            const idx = ri * cols + ci;
            const filled = idx < neededOnFloor;
            return (
              <div key={`${ri}-${ci}`} style={{
                position: "absolute",
                left: ri * palDispW + 1,
                top: ci * palDispH + 1,
                width: palDispW - 2,
                height: palDispH - 2,
                background: filled ? "#3b82f6" : "#e2e8f0",
                border: `1px solid ${filled ? "#1d4ed8" : "#cbd5e1"}`,
                borderRadius: 2,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: palDispW > 18 ? 7 : 5,
                color: filled ? "white" : "#94a3b8",
                fontWeight: 700,
              }}>
                {filled && layers > 1 ? `${layers}단` : ""}
              </div>
            );
          })
        )}
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginTop: 4, textAlign: "center" }}>
        사용 {neededOnFloor}칸 × {layers}단 = {neededOnFloor * layers}p · 여유 {cap1 - neededOnFloor}칸
      </div>
    </div>
  );
}

function FloatingCalculator({ onClose }) {
  const [tab, setTab] = React.useState("calc"); // "calc" | "ton" | "load"
  const [display, setDisplay] = React.useState("0");
  const [prev, setPrev] = React.useState(null);
  const [op, setOp] = React.useState(null);
  const [waitNext, setWaitNext] = React.useState(false);

  // tonnage calculator state
  const [tonTotal, setTonTotal] = React.useState("");
  const [palTotal, setPalTotal] = React.useState("");
  const [palPart, setPalPart] = React.useState("");

  // loading calculator state
  const [loadMode, setLoadMode] = React.useState("pallet");
  const [palInputMode, setPalInputMode] = React.useState("manual"); // "manual" | "type" — 직접입력 vs 파렛종류 선택
  const [palW, setPalW] = React.useState("1100");
  const [palD, setPalD] = React.useState("1100");
  const [palQty, setPalQty] = React.useState("");
  const [palLayers, setPalLayers] = React.useState("1");
  const [palKg, setPalKg] = React.useState("");
  const [palResults, setPalResults] = React.useState(null);
  const [palSelected, setPalSelected] = React.useState(null);
  const [boxW, setBoxW] = React.useState("");
  const [boxD, setBoxD] = React.useState("");
  const [boxH, setBoxH] = React.useState("");
  const [boxQty, setBoxQty] = React.useState("");
  const [boxResults, setBoxResults] = React.useState(null);

  // 파렛 종류 선택 모드 — 파렛트 규격표(PALLET_SPEC_TABLE)에서 종류를 고르고
  // 수량만 입력하면 총 무게와 "몇 톤부터 상차 가능한지"를 바로 계산해준다.
  const [palTypeCode, setPalTypeCode] = React.useState(PALLET_SPEC_TABLE[0].code);
  const [palTypeQty, setPalTypeQty] = React.useState("");
  const [palTypeResult, setPalTypeResult] = React.useState(null);

  const round = (n) => Math.round(n * 1e10) / 1e10;
  const calcResult = (a, b, o) => {
    if (o === "+") return round(a + b);
    if (o === "-") return round(a - b);
    if (o === "×") return round(a * b);
    if (o === "÷") return b !== 0 ? round(a / b) : 0;
    return b;
  };

  const isCleared = display === "0" && prev === null && op === null && !waitNext;

  const handleNum = (n) => {
    if (display.replace("-", "").length >= 15) return;
    if (waitNext) { setDisplay(String(n)); setWaitNext(false); }
    else setDisplay(display === "0" ? String(n) : display + n);
  };
  const handleDot = () => {
    if (waitNext) { setDisplay("0."); setWaitNext(false); return; }
    if (!display.includes(".")) setDisplay(display + ".");
  };
  const handleOp = (o) => {
    const cur = parseFloat(display);
    if (prev !== null && !waitNext) {
      const r = calcResult(prev, cur, op);
      setDisplay(String(r));
      setPrev(r);
    } else {
      setPrev(cur);
    }
    setOp(o);
    setWaitNext(true);
  };
  const handleEqual = () => {
    if (prev === null || op === null) return;
    const r = calcResult(prev, parseFloat(display), op);
    setDisplay(String(r));
    setPrev(null);
    setOp(null);
    setWaitNext(true);
  };
  const handleClear = () => { setDisplay("0"); setPrev(null); setOp(null); setWaitNext(false); };
  const handlePercent = () => setDisplay(String(round(parseFloat(display) / 100)));
  const handlePlusMinus = () => setDisplay(String(-parseFloat(display)));
  const handleBackspace = () => {
    if (waitNext) return;
    setDisplay(display.length <= 1 || display === "-0" ? "0" : display.slice(0, -1));
  };

  React.useEffect(() => {
    if (tab !== "calc") return;
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); handleNum(e.key); return; }
      if (e.key === ".") { e.preventDefault(); handleDot(); return; }
      if (e.key === "+") { e.preventDefault(); handleOp("+"); return; }
      if (e.key === "-") { e.preventDefault(); handleOp("-"); return; }
      if (e.key === "*") { e.preventDefault(); handleOp("×"); return; }
      if (e.key === "/") { e.preventDefault(); handleOp("÷"); return; }
      if (e.key === "%") { e.preventDefault(); handlePercent(); return; }
      if (e.key === "Enter" || e.key === "=") { e.preventDefault(); handleEqual(); return; }
      if (e.key === "Backspace" || e.key === "ArrowLeft") { e.preventDefault(); handleBackspace(); return; }
      if (e.key === "Delete") { e.preventDefault(); handleClear(); return; }
      if (e.key === "Escape") {
        e.preventDefault();
        if (isCleared) { onClose(); } else { handleClear(); }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fmtDisplay = (val) => {
    const s = String(val);
    if (s.includes("e")) return s;
    const [int, dec] = s.split(".");
    const intFmt = parseInt(int, 10).toLocaleString("ko-KR");
    return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
  };

  const btns = [
    { l: "AC",  t: "func", fn: handleClear },
    { l: "+/-", t: "func", fn: handlePlusMinus },
    { l: "%",   t: "func", fn: handlePercent },
    { l: "÷",   t: "op",   fn: () => handleOp("÷") },
    { l: "7",   t: "num",  fn: () => handleNum("7") },
    { l: "8",   t: "num",  fn: () => handleNum("8") },
    { l: "9",   t: "num",  fn: () => handleNum("9") },
    { l: "×",   t: "op",   fn: () => handleOp("×") },
    { l: "4",   t: "num",  fn: () => handleNum("4") },
    { l: "5",   t: "num",  fn: () => handleNum("5") },
    { l: "6",   t: "num",  fn: () => handleNum("6") },
    { l: "-",   t: "op",   fn: () => handleOp("-") },
    { l: "1",   t: "num",  fn: () => handleNum("1") },
    { l: "2",   t: "num",  fn: () => handleNum("2") },
    { l: "3",   t: "num",  fn: () => handleNum("3") },
    { l: "+",   t: "op",   fn: () => handleOp("+") },
    { l: "0",   t: "num",  fn: () => handleNum("0"), wide: true },
    { l: "⌫",  t: "num",  fn: handleBackspace },
    { l: "=",   t: "eq",   fn: handleEqual },
  ];

  const colorsMap = {
    func: { bg: "#e5e7eb", color: "#374151" },
    op:   { bg: "#1B2B4B", color: "white" },
    eq:   { bg: "#1B2B4B", color: "white" },
    num:  { bg: "#f3f4f6", color: "#111827" },
  };

  const tonResult = React.useMemo(() => {
    const tp = parseFloat(palTotal);
    const tt = parseFloat(tonTotal);
    const pp = parseFloat(palPart);
    if (!tp || !tt || !pp || tp === 0) return null;
    return Math.round((pp / tp) * tt * 100) / 100;
  }, [palTotal, tonTotal, palPart]);

  // ── loading calculator helpers ──
  const calcPalletFit = (veh, pw_mm, pd_mm) => {
    const pw = pw_mm / 10; const pd = pd_mm / 10;
    if (pw <= 0 || pd <= 0) return { cols: 0, rows: 0, rotated: false };
    const o1c = Math.floor(veh.w / pw); const o1r = Math.floor(veh.l / pd);
    const o2c = Math.floor(veh.w / pd); const o2r = Math.floor(veh.l / pw);
    if (o1c * o1r >= o2c * o2r) return { cols: o1c, rows: o1r, rotated: false };
    return { cols: o2c, rows: o2r, rotated: true };
  };

  const calcBoxFit = (veh, bw, bd, bh) => {
    const perms = [[bw,bd,bh],[bw,bh,bd],[bd,bw,bh],[bd,bh,bw],[bh,bw,bd],[bh,bd,bw]];
    let best = 0;
    for (const [a, b, c] of perms) {
      best = Math.max(best, Math.floor(veh.w / a) * Math.floor(veh.l / b) * Math.floor(veh.h / c));
    }
    return best;
  };

  const handlePalletSearch = () => {
    const pw = parseFloat(palW); const pd = parseFloat(palD);
    const qty = parseInt(palQty, 10) || 0;
    const layers = parseInt(palLayers, 10) || 1;
    const kgPerPal = parseFloat(palKg) || 0;
    if (!pw || !pd) return;
    const results = LOAD_VEHICLES.map(veh => {
      const fit = calcPalletFit(veh, pw, pd);
      const cap1 = fit.cols * fit.rows;
      const capTotal = cap1 * layers;
      const weightOk = kgPerPal > 0 ? (kgPerPal * qty <= veh.maxKg) : true;
      const ok = capTotal >= qty && qty > 0 && weightOk;
      return { veh, ...fit, cap1, capTotal, ok, weightOk };
    });
    setPalResults({ results, qty, layers, pw, pd });
    setPalSelected(null);
  };

  const handleBoxSearch = () => {
    const bw = parseFloat(boxW); const bd = parseFloat(boxD); const bh = parseFloat(boxH);
    const qty = parseInt(boxQty, 10) || 0;
    if (!bw || !bd || !bh) return;
    const results = LOAD_VEHICLES.map(veh => {
      const cap = calcBoxFit(veh, bw, bd, bh);
      const ok = cap >= qty && qty > 0;
      return { veh, cap, ok };
    });
    setBoxResults({ results, qty, bw, bd, bh });
  };

  // 파렛 종류 선택 조회 — 규격표에서 고른 파렛트의 실제 mm 규격·자체무게로 총
  // 무게를 구하고, 그 무게와 개수를 모두 감당하는(중량 여유 + 적재칸 충분) 가장
  // 작은 차량을 LOAD_VEHICLES 순서(작은 차→큰 차)대로 찾아 "OO부터 상차 가능"으로 안내한다.
  const handlePalTypeSearch = () => {
    const spec = PALLET_SPEC_TABLE.find(p => p.code === palTypeCode);
    const qty = parseInt(palTypeQty, 10) || 0;
    if (!spec || qty <= 0) { setPalTypeResult(null); return; }
    const totalKg = round(spec.kg * qty);
    const fitVeh = LOAD_VEHICLES.find(veh => {
      const fit = calcPalletFit(veh, spec.w, spec.d);
      return fit.cols * fit.rows >= qty && totalKg <= veh.maxKg;
    });
    setPalTypeResult({ spec, qty, totalKg, fitVeh: fitVeh || null });
  };

  const inpSt = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const lblSt = { fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3, display: "block" };

  // ⭐ 2026-10-31 크기 — 작게·보통·크게(계산기 전체가 비율대로 커진다)
  const ZOOM = { S: 0.88, M: 1, L: 1.28 };
  const [calcSize, setCalcSize] = React.useState(() => { try { return localStorage.getItem("kpWin:calc") || "M"; } catch { return "M"; } });
  const pickCalcSize = (k) => { setCalcSize(k); try { localStorage.setItem("kpWin:calc", k); } catch { /* 무시 */ } };
  const z = ZOOM[calcSize] || 1;
  return (
    <div data-ro-allow style={{
      position: "fixed", bottom: 24, right: 92, zIndex: 99999,
      // ⭐ 적재/톤수 탭 내용(파렛 규격 입력·차량 목록 등)이 좁은 폭에 눌려 잘 안
      // 보인다는 피드백으로 탭별 폭을 전반적으로 넓히고, 글씨 크기도 함께 키웠다.
      width: (tab === "load" ? 460 : tab === "ton" ? 360 : 320) * z,
      background: "white", borderRadius: 22,
      boxShadow: "0 24px 60px rgba(15,26,48,0.35)",
      border: "1px solid #DCE3EE",
      fontFamily: "'Noto Sans KR', sans-serif",
      maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* 탭 헤더 — 네이비 디지털 */}
      <div style={{ background: DOCK_BG, padding: "11px 12px 11px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.08)", flex: 1, minWidth: 0 }}>
          {[["calc","계산기"],["ton","톤수"],["load","적재"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, background: tab === t ? "#fff" : "transparent", border: "none", color: tab === t ? "#0F1A30" : "rgba(255,255,255,0.75)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", padding: "6px 4px", borderRadius: 8, whiteSpace: "nowrap" }}>{l}</button>
          ))}
        </div>
        <SizeButtons preset={calcSize} onPick={pickCalcSize} />
        <button onClick={onClose} title="닫기" style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 900 }}>✕</button>
      </div>

      {/* 스크롤 본문 */}
      <div style={{ overflowY: "auto", flex: 1, zoom: z }}>

        {/* ── 계산기 탭 ── */}
        {tab === "calc" && (<>
          <div style={{ background: "#f8fafc", padding: "10px 16px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", minHeight: 16, textAlign: "right" }}>
              {prev !== null && op ? `${fmtDisplay(prev)} ${op}` : ""}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fmtDisplay(display)}
            </div>
          </div>
          <div style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
            {btns.map((btn, i) => {
              const c = colorsMap[btn.t];
              return (
                <button key={i} onClick={btn.fn} style={{ background: c.bg, color: c.color, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 16, fontWeight: 600, height: 52, transition: "opacity 0.1s", gridColumn: btn.wide ? "span 2" : undefined }}
                  onMouseDown={e => { e.currentTarget.style.opacity = "0.75"; }}
                  onMouseUp={e => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
                  {btn.l}
                </button>
              );
            })}
          </div>
        </>)}

        {/* ── 톤수 계산 탭 ── */}
        {tab === "ton" && (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
              총 파렛 수와 총 톤수를 입력하고<br/>계산할 파렛 수를 입력하면 톤수가 나옵니다.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 5 }}>총 파렛 수</div>
                  <input autoComplete="off" type="number" min="0" placeholder="예: 27" style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 9, padding: "10px 12px", fontSize: 16, outline: "none", boxSizing: "border-box" }} value={palTotal} onChange={e => setPalTotal(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 5 }}>총 톤수</div>
                  <input autoComplete="off" type="number" min="0" step="0.01" placeholder="예: 12" style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 9, padding: "10px 12px", fontSize: 16, outline: "none", boxSizing: "border-box" }} value={tonTotal} onChange={e => setTonTotal(e.target.value)} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 5 }}>계산할 파렛 수</div>
                <input autoComplete="off" type="number" min="0" placeholder="예: 16" style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 9, padding: "10px 12px", fontSize: 16, outline: "none", boxSizing: "border-box" }} value={palPart} onChange={e => setPalPart(e.target.value)} />
              </div>
              <div style={{ background: tonResult !== null ? "#1B2B4B" : "#f8fafc", border: `1px solid ${tonResult !== null ? "#1B2B4B" : "#e2e8f0"}`, borderRadius: 12, padding: "16px 14px", textAlign: "center" }}>
                {tonResult !== null ? (
                  <>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 5 }}>{palPart}파렛 = </div>
                    <div style={{ fontSize: 34, fontWeight: 700, color: "white" }}>{tonResult}<span style={{ fontSize: 15, fontWeight: 500, marginLeft: 4 }}>톤</span></div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 5 }}>({palTotal}p / {tonTotal}t 기준)</div>
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: "#94a3b8" }}>위 값을 입력하세요</div>
                )}
              </div>
              <button onClick={() => { setPalTotal(""); setTonTotal(""); setPalPart(""); }}
                style={{ width: "100%", padding: "10px", background: "#f1f5f9", border: "none", borderRadius: 9, fontSize: 14, color: "#64748b", cursor: "pointer", fontWeight: 600 }}>
                초기화
              </button>
            </div>
          </div>
        )}

        {/* ── 적재 계산 탭 ── */}
        {tab === "load" && (
          <div style={{ padding: 16 }}>
            {/* 서브탭 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#f1f5f9", borderRadius: 9, padding: 3 }}>
              {[["pallet","파렛트"],["box","박스"]].map(([m,l]) => (
                <button key={m} onClick={() => setLoadMode(m)} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: loadMode === m ? 700 : 400, background: loadMode === m ? "white" : "transparent", color: loadMode === m ? "#1B2B4B" : "#64748b", boxShadow: loadMode === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>{l}</button>
              ))}
            </div>

            {/* ── 파렛트 모드 ── */}
            {loadMode === "pallet" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* 직접입력 / 파렛종류선택 서브 토글 */}
                <div style={{ display: "flex", gap: 4, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: 3 }}>
                  {[["manual","직접입력"],["type","파렛종류 선택"]].map(([m,l]) => (
                    <button key={m} onClick={() => setPalInputMode(m)} style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: palInputMode === m ? 700 : 400, background: palInputMode === m ? "#1B2B4B" : "transparent", color: palInputMode === m ? "white" : "#64748b" }}>{l}</button>
                  ))}
                </div>

                {palInputMode === "manual" ? (<>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
                    파렛트 크기(mm)·수량을 입력 후 조회. 차량을 클릭하면 배치도를 볼 수 있습니다.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "end" }}>
                    <div><label style={lblSt}>가로 (mm)</label><input autoComplete="off" type="number" min="0" placeholder="1100" style={inpSt} value={palW} onChange={e => setPalW(e.target.value)} /></div>
                    <div style={{ paddingBottom: 9, color: "#94a3b8", fontSize: 15, fontWeight: 700, textAlign: "center" }}>×</div>
                    <div><label style={lblSt}>세로 (mm)</label><input autoComplete="off" type="number" min="0" placeholder="1100" style={inpSt} value={palD} onChange={e => setPalD(e.target.value)} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div><label style={lblSt}>수량 (개)</label><input autoComplete="off" type="number" min="0" placeholder="16" style={inpSt} value={palQty} onChange={e => setPalQty(e.target.value)} /></div>
                    <div>
                      <label style={lblSt}>단수</label>
                      <select style={inpSt} value={palLayers} onChange={e => setPalLayers(e.target.value)}>
                        {[1,2,3].map(n => <option key={n} value={n}>{n}단</option>)}
                      </select>
                    </div>
                    <div><label style={lblSt}>kg/파렛</label><input autoComplete="off" type="number" min="0" placeholder="선택" style={inpSt} value={palKg} onChange={e => setPalKg(e.target.value)} /></div>
                  </div>
                  <button onClick={handlePalletSearch} style={{ width: "100%", padding: "10px", background: "#1B2B4B", border: "none", borderRadius: 9, fontSize: 14, color: "white", cursor: "pointer", fontWeight: 700 }}><EditableText id="misc.btn.5389.조회" defaultText="조회" /></button>

                  {palResults && (
                    <div>
                      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 7, fontWeight: 600 }}>
                        {palResults.pw}×{palResults.pd}mm · {palResults.qty}개 · {palResults.layers}단
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {palResults.results.map((item, i) => {
                          const needed = palResults.qty;
                          const capOk = item.capTotal >= needed && needed > 0;
                          const ok = capOk && item.weightOk;
                          const partial = item.cap1 > 0 && !capOk && item.capTotal > 0;
                          const selected = palSelected === i;
                          const st = needed === 0
                            ? `최대 ${item.capTotal}개 (${item.cols}열×${item.rows}행)`
                            : ok
                            ? `적재가능 · ${item.capTotal}개`
                            : partial
                            ? `${item.capTotal}개까지 가능 · ${needed - item.capTotal}개 부족`
                            : !item.weightOk
                            ? "중량초과"
                            : "적재불가";
                          const warn = needed > 0 && !ok;
                          const style = selected
                            ? { bg: "#eef1f6", bc: "#1B2B4B", tc: "#1B2B4B" }
                            : ok
                            ? { bg: "#1B2B4B", bc: "#1B2B4B", tc: "white" }
                            : warn
                            ? { bg: "white", bc: "#fda4af", tc: "#be123c" }
                            : { bg: "#f1f5f9", bc: "#e2e8f0", tc: "#94a3b8" };
                          return (
                            <div key={i} onClick={() => setPalSelected(selected ? null : i)}
                              style={{ padding: "9px 12px", background: style.bg, border: `1px solid ${style.bc}`, borderRadius: 9, cursor: "pointer", transition: "all 0.15s" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: ok ? "white" : selected ? "#1B2B4B" : "#374151" }}>{item.veh.name}</span>
                                <span style={{ fontSize: 11, color: ok ? "rgba(255,255,255,0.65)" : "#94a3b8" }}>{(item.veh.l/100).toFixed(1)}m × {(item.veh.w/100).toFixed(1)}m</span>
                              </div>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: style.tc, marginTop: 3 }}>{st}</div>
                              {!item.weightOk && palKg && needed > 0 && (
                                <div style={{ fontSize: 11, color: "#be123c", marginTop: 2 }}>
                                  {(parseFloat(palKg)*needed).toLocaleString()}kg &gt; 최대 {item.veh.maxKg.toLocaleString()}kg
                                </div>
                              )}
                              {ok && item.rotated && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>회전 배치로 최적화됨</div>}
                            </div>
                          );
                        })}
                      </div>
                      {palSelected !== null && palResults.results[palSelected] && (
                        <div style={{ marginTop: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
                          <PalletDiagram item={palResults.results[palSelected]} qty={palResults.qty} layers={palResults.layers} palW_mm={palResults.pw} palD_mm={palResults.pd} />
                        </div>
                      )}
                    </div>
                  )}
                </>) : (<>
                  {/* ── 파렛종류 선택 모드 ── */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
                    파렛 종류와 수량을 고르면 총 무게와 몇 톤부터 상차 가능한지 바로 계산합니다.
                  </div>
                  <div>
                    <label style={lblSt}>파렛 종류</label>
                    <select style={inpSt} value={palTypeCode} onChange={e => { setPalTypeCode(e.target.value); setPalTypeResult(null); }}>
                      {PALLET_SPEC_TABLE.map(p => (
                        <option key={p.code} value={p.code}>
                          {p.code} ({p.w.toLocaleString()}×{p.d.toLocaleString()}×{p.h}mm · {p.kgLabel || `${p.kg}kg`}{p.note ? ` · ${p.note}` : ""})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={lblSt}>수량 (개)</label><input autoComplete="off" type="number" min="0" placeholder="예: 2" style={inpSt} value={palTypeQty} onChange={e => setPalTypeQty(e.target.value)} /></div>
                  <button onClick={handlePalTypeSearch} style={{ width: "100%", padding: "10px", background: "#1B2B4B", border: "none", borderRadius: 9, fontSize: 14, color: "white", cursor: "pointer", fontWeight: 700 }}><EditableText id="misc.btn.5461.조회" defaultText="조회" /></button>

                  {palTypeResult && (
                    <div style={{ background: "#1B2B4B", borderRadius: 12, padding: "16px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>
                        {palTypeResult.spec.code} {palTypeResult.qty}장 · 총 {palTypeResult.totalKg.toLocaleString()}kg
                      </div>
                      {palTypeResult.fitVeh ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <TruckIcon size={22} color="white" />
                          <span style={{ fontSize: 20, fontWeight: 700, color: "white" }}>
                            {(() => {
                              // "5톤 초장축" → "5톤(9.6M) 초장축부터 상차 가능" 처럼 톤수 뒤에
                              // 실측 길이(m)를 끼워 넣어 몇 미터 차량인지 바로 보이게 한다.
                              const v = palTypeResult.fitVeh;
                              const m = v.name.match(/^(\S+)(\s+.+)?$/);
                              const prefix = m ? m[1] : v.name;
                              const suffix = m && m[2] ? m[2] : "";
                              return `${prefix}(${(v.l / 100).toFixed(1)}M)${suffix}부터 상차 가능`;
                            })()}
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fda4af" }}>적재 가능한 차량이 없습니다 (중량 또는 수량 초과)</div>
                      )}
                    </div>
                  )}
                </>)}
              </div>
            )}

            {/* ── 박스 모드 ── */}
            {loadMode === "box" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>
                  박스 크기(cm)와 수량을 입력하면 차량별 최대 적재 개수를 계산합니다.
                </div>
                <div>
                  <label style={lblSt}>박스 크기 (cm, 가로 × 세로 × 높이)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 4, alignItems: "center" }}>
                    <input autoComplete="off" type="number" min="0" placeholder="가로" style={inpSt} value={boxW} onChange={e => setBoxW(e.target.value)} />
                    <span style={{ color: "#94a3b8", fontSize: 12, textAlign: "center" }}>×</span>
                    <input autoComplete="off" type="number" min="0" placeholder="세로" style={inpSt} value={boxD} onChange={e => setBoxD(e.target.value)} />
                    <span style={{ color: "#94a3b8", fontSize: 12, textAlign: "center" }}>×</span>
                    <input autoComplete="off" type="number" min="0" placeholder="높이" style={inpSt} value={boxH} onChange={e => setBoxH(e.target.value)} />
                  </div>
                </div>
                <div><label style={lblSt}>수량 (개)</label><input autoComplete="off" type="number" min="0" placeholder="예: 200" style={inpSt} value={boxQty} onChange={e => setBoxQty(e.target.value)} /></div>
                <button onClick={handleBoxSearch} style={{ width: "100%", padding: "10px", background: "#1B2B4B", border: "none", borderRadius: 9, fontSize: 14, color: "white", cursor: "pointer", fontWeight: 700 }}><EditableText id="misc.btn.5509.조회" defaultText="조회" /></button>

                {boxResults && (
                  <div>
                    <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 7, fontWeight: 600 }}>
                      {boxResults.bw}×{boxResults.bd}×{boxResults.bh}cm 박스 {boxResults.qty || "?"}개
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {boxResults.results.map((item, i) => {
                        const needed = boxResults.qty;
                        const ok = item.cap >= needed && needed > 0;
                        const partial = item.cap > 0 && !ok;
                        const st = needed === 0
                          ? `최대 ${item.cap.toLocaleString()}개`
                          : ok
                          ? `가능 · ${item.cap.toLocaleString()}개`
                          : partial
                          ? `${item.cap.toLocaleString()}개까지 가능`
                          : "적재불가";
                        const style = ok
                          ? { bg: "#1B2B4B", bc: "#1B2B4B", tc: "white" }
                          : partial
                          ? { bg: "white", bc: "#fda4af", tc: "#be123c" }
                          : { bg: "#f1f5f9", bc: "#e2e8f0", tc: "#94a3b8" };
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: style.bg, border: `1px solid ${style.bc}`, borderRadius: 9 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: ok ? "white" : "#374151", minWidth: 56 }}>{item.veh.name}</div>
                            <div style={{ fontSize: 11, color: ok ? "rgba(255,255,255,0.65)" : "#94a3b8", flex: 1, paddingLeft: 6 }}>{(item.veh.l/100).toFixed(1)}×{(item.veh.w/100).toFixed(1)}×{(item.veh.h/100).toFixed(1)}m</div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: style.tc, textAlign: "right" }}>{st}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 12px", fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
                      실제 적재량은 박스 방향, 완충재, 무게 제한에 따라 달라질 수 있습니다.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ⭐ PC 첫 진입 로딩 화면(모바일과 같은 디자인) —
//   ① 저장된 오더 불러오기: PC에 저장된 오더(캐시) 첫 응답
//   ② 서버 확인: 실시간 구독이 서버와 맞춰짐(추가 조회 없음)
//   ③ 최신 오더 반영: 그동안 바뀐 오더(신규/수정/삭제) 반영
//   ④ 화면 준비: 기사·거래처
//   ⭐ 2026-10-26 속도 개선 — 홈 통계용 "올해 지난 기간 합계"(1년치 조회)는 더 이상 기다리지 않는다.
//      로딩 화면이 걷힌 뒤 뒤에서 계산돼 홈 숫자에 더해진다(하루 1번).
// ⭐ 오더 실시간 구독 — (회사명+상차일) 색인이 아직 없거나 권한 오류로 구독이 실패해도 로딩 화면에서 멈추지 않게.
//   실패하면 회사 오더 전체를 받는 구독(색인 불필요)으로 바꿔 받고, 상차일 범위는 화면에서 거른다.
function subscribeLiveWithFallback(col, start, handler, name) {
  let unsub = () => {};
  const filtered = (snap) => {
    const inWin = (d) => String(d.get?.("상차일") || "") >= start;
    return {
      metadata: snap.metadata, size: snap.docs.filter(inWin).length,
      docs: snap.docs.filter(inWin),
      docChanges: () => snap.docChanges().filter((ch) => ch.type === "removed" || inWin(ch.doc)),
      forEach: (fn) => snap.docs.filter(inWin).forEach(fn),
      empty: !snap.docs.some(inWin),
    };
  };
  // ⚡ 2026-11-23 잠깐 끊김 · 권한 확인 중 오류에도 "전체 오더(모든 기간)" 구독으로 바꾸던 것 → 그때는 같은 범위로 잠시 뒤 다시 붙는다.
  //  색인(index)이 없다는 오류(failed-precondition)일 때만 예전처럼 대체 구독으로 바꾼다.
  let stopped = false; let tries = 0; let retryT = 0;
  const openCache = () => pcBootStore.set((st) => ({ ...st, cache: { ...st.cache, [name]: true }, server: { ...st.server, [name]: true } }));
  const subscribe = () => {
    unsub = onSnapshot(query(collection(db, col), where("상차일", ">=", start)), { includeMetadataChanges: true }, (snap) => { tries = 0; handler(snap); }, (err) => {
      try { unsub(); } catch { /* 무시 */ }
      if (stopped) return;
      if (String(err?.code || "") === "failed-precondition") {
        console.warn(`[실시간 ${name}] 색인 없음 → 대체 구독으로 전환`, err?.code || err);
        unsub = onSnapshot(query(collection(db, col)), { includeMetadataChanges: true }, (snap) => handler(filtered(snap)), (err2) => {
          console.warn(`[실시간 ${name}] 대체 구독도 실패`, err2?.code || err2);
          openCache(); // 그래도 안 되면 저장본(캐시)으로라도 화면을 연다
        });
        return;
      }
      tries += 1;
      console.warn(`[실시간 ${name}] 구독 끊김 → ${tries}번째 다시 연결`, err?.code || err);
      if (tries >= 2) openCache(); // 오래 걸리면 저장본으로 먼저 화면을 연다
      retryT = setTimeout(() => { if (!stopped) subscribe(); }, Math.min(60000, 2000 * 2 ** Math.min(tries, 5)));
    });
  };
  subscribe();
  return () => { stopped = true; clearTimeout(retryT); try { unsub(); } catch { /* 무시 */ } };
}

function PcBootOverlay({ onDone, dept = null }) {
  const team = dept === "acct" ? "acct" : dept === "hr" ? "hr" : dept === "sales" ? "sales" : dept === "exec" ? "exec" : "dispatch";
  const st = useMiniStore(pcBootStore);
  const [skipped, setSkipped] = useState(false);
  const two = (o) => (o.orders ? 50 : 0) + (o.dispatch ? 50 : 0);
  const cachePct = two(st.cache);
  const serverPct = two(st.server);
  const applyPct = serverPct === 100 ? 100 : 0;
  const readyPct = (st.base.drivers ? 50 : 0) + (st.base.clients ? 50 : 0);
  // ⚠️ 받다 만 상태로 강제로 열지 않는다 — 오래 걸리면 로딩 화면에 안내 문구, 30초 후엔 "먼저 열기" 버튼
  const targets = skipped ? [100, 100, 100, 100] : [cachePct, serverPct, applyPct, readyPct];
  // ⭐ 보여주는 건수 = 오늘(상차일) 오더 — 다른 날짜는 각 화면에서 조회할 때 불러온다
  const total = (st.todayCount?.orders || 0) + (st.todayCount?.dispatch || 0);
  const changed = st.added + st.modified + st.removed;
  const subs = team === "dispatch" ? [
    cachePct === 100 ? `오늘 ${total.toLocaleString()}건` : "",
    "",
    applyPct === 100
      ? (changed ? [st.added ? `신규 ${st.added}` : "", st.modified ? `수정 ${st.modified}` : "", st.removed ? `삭제 ${st.removed}` : ""].filter(Boolean).join(" · ") : "최신 데이터 없음")
      : "",
    readyPct >= 100 ? "기사·거래처 준비 완료" : "",
  ] : [
    cachePct === 100 ? (team === "hr" ? "준비 완료" : `오늘 운행 ${total.toLocaleString()}건`) : "",
    "",
    applyPct === 100 ? "최신 반영 완료" : "",
    readyPct >= 100 ? "준비 완료" : "",
  ];
  return <KpBootScreen team={team} targets={targets} subs={subs} onAllDone={onDone} onSkip={() => setSkipped(true)} variant="pc" zIndex={2147483000} />;
}

export default function DispatchApp({ role: realRole, user, userCompany = "", forceExec = false }) {
  // 🔀 화면 전환 역할 — 통합인사관리자(hrAcct): 경리 ↔ 인사 / 통합관리자(allMgr): 운송 ↔ 경리 ↔ 인사. 상단 버튼으로 바꾼다
  //  경리사무원·인사사무원은 경리/인사 화면 역할로 동작(메뉴는 그 역할 설정) — customRoles.js SWITCH_ROLES·BASED_ROLES
  const roleView = useRoleView(realRole);
  const role = roleView.role;
  const isTest = role === "test";
  const navigate = useNavigate();
  useCopyTemplates(); // ▤ 기사복사 문구(회사별 설정) 실시간 반영
  useVehicleTypes(getTenant() || userCompany); // 🚚 2026-11-02 회사 공용 차량종류(추가한 이름이 모든 화면 목록에 바로 보이게 구독 유지)
  // 💳 회사 요금제(미지정이면 전체 기능) — 메뉴 잠금·프로 기능 판단에 쓴다
  const planCompany = (role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany) : (userCompany || localStorage.getItem("userCompany")) || "").trim();
  const planId = useCompanyPlanId(planCompany);
  // ⭐ 고정거래처 매출 실시간 구독
  const [fixedRows, setFixedRows] = useState([]);
// ⭐ 고정거래처 매출 Firestore 실시간 구독
useEffect(() => {
  const unsub = onSnapshot(collection(db, "fixedClients"), (snap) => {
    const viewCompany = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
      : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
    const arr = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => (r.companyName || DEFAULT_COMPANY) === viewCompany);
    React.startTransition(() => setFixedRows(arr)); // ⭐ 2026-11-02 속도 — 최상위 전체를 다시 그리는 갱신이라 낮은 우선순위로(입력·클릭 먼저)
  });

  return () => unsub();
}, [userCompany, role]);

  // ⭐ 등록자 표시용 — 오더에 찍힌 등록자 값이 이메일/계정아이디여도, 그 계정이
  // users/{uid}.name에 설정해 둔 실명으로 바꿔서 보여준다. 예전엔 RealtimeStatus와
  // DispatchStatus가 각각 독립적으로 이 users 컬렉션 전체를 실시간 구독해서
  // (탭을 오갈 때마다 매번 재구독 + 전체 재다운로드) 읽기가 중복 낭비됐다 — 최상위
  // (DispatchApp)에서 한 번만 구독해 두 화면에 동일한 userNameMap을 props로 내려준다.
  const [userNameMap, setUserNameMap] = React.useState(new Map());
  React.useEffect(() => { setMgrNameMap(userNameMap); }, [userNameMap]); // ⭐ 배차담당자 이력 카드의 "마지막 수정" 이름
  React.useEffect(() => {
    // ⭐ 2026-11-02 속도 — users 전체를 따로 구독하던 것을 앱 공용 구독(usersLive)으로(받는 데이터 동일, 중복 구독 제거)
    return subscribeUsersLive((_list, raw) => {
      const map = new Map();
      raw.forEach(({ id, data }) => {
        const name = (data.name || "").trim();
        if (!name) return;
        map.set(id, name);
        if (data.email) map.set(String(data.email).trim().toLowerCase(), name);
      });
      setUserNameMap(map);
    });
  }, []);

  // ⭐ "최적화" 버튼 — 새로고침(전체 재접속/전체 재읽기) 없이, 오래 켜두고 오더를
  // 많이 등록/조회하다 보면 배차관리/실시간배차현황/배차현황 화면 안에 쌓이는
  // 렌더링 상태(행 이동 애니메이션 좌표 캐시, 하이라이트 추적, DOM 노드 등)만
  // 가볍게 비워준다. Firestore 리스너(dispatchData 등)는 DispatchApp 이 컴포넌트
  // 자체에 있어 그대로 유지되므로(추가 읽기 발생 없음), 현재 보고 있는 화면
  // 컴포넌트만 key를 바꿔 강제로 다시 마운트시키는 방식이다 — 브라우저 새로고침과
  // 달리 다른 탭에 열어둔 팝업/스크롤 위치 등은 그대로 두고 지금 화면만 초기화된다.
  const [viewResetKey] = React.useState(0); // 🧹 2026-11-10 [최적화] 버튼은 없앴다 — key는 그대로 둠(항상 0)

  // ⭐ 예약 이메일 발송 체커 — 진짜 서버 크론이 아니라, 이 회사 소속 계정이 프로그램을
  // 열어두고 있는 동안 1분마다 예약시각이 지난 이메일을 대신 발송해주는 방식이다(브라우저
  // 기반 best-effort 스케줄러). 여러 탭/계정이 동시에 켜져 있어도 상태를 먼저 "sending"으로
  // 바꿔 선점하기 때문에 중복 발송되지 않는다.
  useEffect(() => {
    const company = userCompany || localStorage.getItem("userCompany") || "";
    if (!company) return;
    let cancelled = false;
    const runScheduledEmailCheck = async () => {
      // 💰 2026-11-04 서버 비용 — 같은 PC에서 탭을 여러 개 열어 두면 탭마다 1분에 한 번씩 조회했다 → 한 PC에서는 1분에 한 탭만
      try { const k = `kpSchedMailAt_${company}`; const last = Number(localStorage.getItem(k) || 0); if (Date.now() - last < 50000) return; localStorage.setItem(k, String(Date.now())); } catch { /* 저장소를 못 쓰면 그대로 조회 */ }
      try {
        const q = query(
          collection(db, "scheduledEmails"),
          where("companyName", "==", company),
          where("status", "==", "pending")
        );
        const snap = await getDocs(q);
        const nowMs = Date.now();
        for (const d of snap.docs) {
          if (cancelled) return;
          const data = d.data();
          const sendAtMs = data.sendAt?.toMillis ? data.sendAt.toMillis() : new Date(data.sendAt).getTime();
          if (!sendAtMs || sendAtMs > nowMs) continue;
          // 선점(다른 탭/계정이 동시에 같은 메일을 또 보내지 않도록)
          try {
            await updateDoc(doc(db, "scheduledEmails", d.id), { status: "sending" });
          } catch { continue; }
          try {
            // ✉️ 2026-11-08 회사 메일 계정으로(서버 함수 sendCompanyMail · 회사정보 › 메일 설정)
            const r = await sendCompanyMail({
              to: data.to, subject: data.subject, html: data.html,
              attachments: data.attachments || [], fromName: data.fromName || "",
              replyTo: data.replyTo || "", // ⭐ 2026-11-06 일반 이메일 보내는 사람 이메일(답장 받을 주소)
              log: { type: `${data.type || "예약메일"}(예약 발송)`, client: data.meta?.client || "-", body: data.meta?.body || "" },
            });
            await updateDoc(doc(db, "scheduledEmails", d.id), r.ok
              ? { status: "sent", sentAt: serverTimestamp(), sentFrom: r.sentFrom || "" }
              : { status: "failed", error: r.error || "보내지 못했어요", ...(r.code ? { errorCode: r.code } : {}) });
          } catch (e) {
            await updateDoc(doc(db, "scheduledEmails", d.id), { status: "failed", error: e?.message || "네트워크 오류" }).catch(() => {});
          }
        }
      } catch { /* 조용히 무시 — 다음 주기에 재시도 */ }
    };
    runScheduledEmailCheck();
    const timer = setInterval(runScheduledEmailCheck, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [userCompany]);

  // ⭐ 출근기록부: 자동 출근체크 + 주말 출근여부 팝업
  const [weekendCheckPopup, setWeekendCheckPopup] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    // ⭐ 최고관리자는 출근하는 직원이 아니라 프로그램 관리 계정 — 출근 기록을 남기지 않는다
    if (role === "totalMaster" || user?.email === "tjddnqkf@naver.com") return;
    const company = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || "")
      : (userCompany || localStorage.getItem("userCompany") || "");
    if (!company) return; // 회사 정보 로딩 전에는 실행하지 않음 (잘못된 companyName 저장 방지)
    // ⭐ 2026-11-02 자동 출근 — 각자 출근시간 3시간 전 ~ 퇴근시간 사이에만(자정·새벽에 열면 출근으로 찍히던 문제), 반차 반영.
    //  PC는 위치 대신 시간으로만 판단(회사 PC를 켜는 것 = 출근). 너무 이르면 5분마다 다시 확인한다(공통 규칙: src/autoAttendance.js)
    // ⭐ 2026-11-09 열 때 한 번만 시도하던 것을 → 탭이 다시 보일 때 · 창 포커스 · 인터넷 재연결 · 5분마다도 시도(src/autoCheckInPlan.js)
    //  (브라우저를 켜 둔 채 다음날 들어오거나, 로그인 직후 저장이 한 번 실패하면 브라우저를 껐다 켜야만 출근되던 문제)
    let stop = false; let timer = null;
    let st = { doneDay: "", busy: false, nextAt: 0 };
    const userName = user?.displayName || user?.email?.split("@")[0] || "사용자";
    const attempt = async (force = false) => {
      if (stop) return;
      const today = checkInToday(); // tryAutoCheckIn과 같은 날짜 기준(KST)
      if (!shouldAttemptCheckIn(st, today, Date.now(), force)) return;
      st = { ...st, busy: true };
      const r = await tryAutoCheckIn({ uid: user.uid, name: userName, company, source: "auto" }).catch(() => ({ ok: false, reason: "error" }));
      if (stop) return;
      st = applyCheckInResult(st, today, r, Date.now());
      if (r.ok && window.__sflowShowToast) window.__sflowShowToast(`${r.leave ? `${r.leave} · ` : ""}출근 처리되었습니다 (${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`, "success");
      if (st.weekendPopup) setWeekendCheckPopup(true);
      if (!st.doneDay || st.doneDay !== today) { clearTimeout(timer); timer = setTimeout(() => attempt(), Math.max(1000, st.nextAt - Date.now())); }
    };
    const onVisible = () => { if (document.visibilityState === "visible") attempt(true); };
    const onFocus = () => attempt(true);
    const onOnline = () => attempt(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onFocus); // 뒤로가기 캐시(bfcache)로 다시 열린 경우
    const tick = setInterval(() => attempt(), CHECKIN_TICK_MS); // 켜 둔 채 자정을 넘긴 경우
    attempt(true);
    return () => {
      stop = true; clearTimeout(timer); clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [user?.uid, userCompany, role]);

  const handleWeekendCheckIn = async (checkIn) => {
    setWeekendCheckPopup(false);
    if (!user?.uid || getMultiState().guest) return; // 🏢 다른 회사 화면에서는 근태를 찍지 않는다
    const company = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || "")
      : (userCompany || localStorage.getItem("userCompany") || "");
    const today = attendanceTodayStr();
    const userName = user?.displayName || user?.email?.split("@")[0] || "사용자";
    await setDoc(doc(db, "attendance", `${today}_${user.uid}`), {
      uid: user.uid, name: userName, date: today, month: today.slice(0, 7),
      status: checkIn ? "출근" : "휴무",
      checkInTime: checkIn ? new Date().toISOString() : null,
      source: "weekend_choice", companyName: company,
    });
  };

  // ⭐ 출근 처리 실시간 알림 배너 (전사 공유)
  useEffect(() => {
    const company = role === "totalMaster"
      ? (localStorage.getItem("loginCompany") || userCompany || "")
      : (userCompany || localStorage.getItem("userCompany") || "");
    if (!company) return;
    const today = attendanceTodayStr();
    let firstLoad = true;
    const q = query(collection(db, "attendance"), where("companyName", "==", company), where("date", "==", today));
    const unsub = onSnapshot(q, snap => {
      if (firstLoad) { firstLoad = false; return; }
      snap.docChanges().forEach(ch => {
        if (ch.type === "added") {
          const d = ch.doc.data();
          // ⭐ 2026-11-02 출근 알림은 본인 것만 — 예전엔 같은 회사 누가 출근해도 전 직원 화면에 떴다.
          //  (자동 출근은 출근 처리 쪽에서 이미 본인에게 알리므로, 여기서는 다른 기기·관리자가 대신 처리한 본인 출근만 알린다)
          if (d.status === "출근" && d.uid === user?.uid && d.source !== "auto") {
            sflowToast(`출근 처리되었습니다.`, "system");
          }
        }
      });
    }, () => {});
    return () => unsub();
  }, [userCompany, role]);

  // ⭐ 여기 추가!
  const [배차현황Tab, set배차현황Tab] = useState("배차현황");
  const [거래처관리Tab, set거래처관리Tab] = useState("하차지거래처");
  const [기사관리Tab, set기사관리Tab] = useState("d:전체"); // ▸ 기사관리 허브 — d:등급 / docs:driver / docs:penalty
  const hdrNewVer = useNewVersion(); // 🧭 2026-11-16 새 버전 → 상단바 회사명 칸이 [업데이트]로
  const [coSwitchOpen, setCoSwitchOpen] = React.useState(false); // 🔀 2026-11-19 운송사 전환 창
  const multiCo = useMultiCompany(); // 🏢 2026-11-24 여러 회사 계정(오갈 회사 목록 · 지금 회사)
  const [multiCoOpen, setMultiCoOpen] = React.useState(false);
  const [정산관리Tab, set정산관리Tab] = useState(() => { const t = settleStartTab(); return t === "마감검증" ? "거래처정산" : t; }); // 🧭 2026-11-14 정산 홈이 첫 화면(예전처럼 거래처정산부터 보려면 정산 홈 아래 체크)
  const [deskAttachId, setDeskAttachId] = useState("");
  const betaPayOn = useBetaOn(getTenant() || userCompany); // 💳 2026-11-11 정산관리 › 입금 확인(시험 기능 — 테스트운송사)
  // ⭐ 내 정보 패널 ON/OFF
  const [showMyInfo, setShowMyInfo] = useState(false);
  // ⭐ 내 정보 — 이름/연락처 수정용 임시 입력값(패널 열 때마다 현재 값으로 초기화)
  const [myInfoNameDraft, setMyInfoNameDraft] = useState("");
  const [myInfoPhoneDraft, setMyInfoPhoneDraft] = useState("");
  const [myInfoSaving, setMyInfoSaving] = useState(false);

  const saveMyInfo = async () => {
    if (!user?.uid || myInfoSaving) return;
    if (!String(myInfoNameDraft || "").trim()) { alert("이름을 입력해 주세요."); return; } // ⭐ 2026-11-02 빈 이름으로 저장되던 문제
    setMyInfoSaving(true);
    try {
      // ⭐ 2026-11-02 점검 — 연락처를 phone·전화번호 두 필드에 함께 저장(회원관리·인사관리는 phone을 읽음)
      const p = formatPhone(myInfoPhoneDraft.trim());
      await setDoc(doc(db, "users", user.uid), {
        name: myInfoNameDraft.trim(),
        phone: p,
        전화번호: p,
      }, { merge: true });
      showAlert("내 정보가 저장되었습니다.");
    } catch (e) {
      showAlert("저장 실패: " + (e?.message || e));
    } finally {
      setMyInfoSaving(false);
    }
  };

  // ⭐ 명함 이미지 (per-user, Firestore 로드)
  const [cardImage, setCardImage] = useState(null);
  const [cardImageUploading, setCardImageUploading] = useState(false);
  React.useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "userProfiles", user.uid)).then(snap => {
      if (snap.exists() && snap.data().cardImageUrl) {
        setCardImage(snap.data().cardImageUrl);
      }
    }).catch(() => {});
  }, [user?.uid]);
  const darkMode = false;

  // ★ 글씨 크기 — 2026-11-10 상단바 [가] 버튼을 없애면서 예전에 바꿔 둔 배율이 남아 되돌릴 수 없게 되지 않도록 100%로 맞춘다
  //   (크게 보려면 상단바 [가+ 크게 보기])
  React.useEffect(() => {
    try { localStorage.removeItem("appFontScale"); } catch { /* 무시 */ }
    document.documentElement.style.setProperty("--font-scale", 1);
  }, []);
  // ❌ 삭제 (중복 선언 오류 원인)
  // const [dispatchData, setDispatchData] = useState([]);  
  // ---------------- Firestore 실시간 훅 ----------------
  const {
    dispatchData: dispatchDataAll, // ⭐ 2026-11-06 운송업체 설정으로 숨긴 업체 오더까지 담긴 원본(아래에서 한 번 거름)
    setDispatchData,   // ★ 추가
    liveDataReady,
    recentDispatchData: recentDispatchDataAll,
    recentLiveDataReady,
    drivers,
    clients,
    places,
    addDispatch,
    patchDispatch,
    removeDispatch,
    approveEditRequestPC,
    rejectEditRequestPC,
    markEditRequestSeen,
    upsertDriver,
    removeDriver,
    upsertClient,
    removeClient,
    approvedShippers,
    myRealName,
    myPhone,
    loadRange,
    loadFullHistory,
    historyLoading,
  } = useRealtimeCollections(user, userCompany, role);
  // 🗓 2026-11-27 거래처 마감일이 바뀌면 오더 묶음(청구월)을 다시 계산 — 배열만 새로 만들어 화면 memo 를 깨운다(저장 없음)
  React.useEffect(() => { const f = () => setDispatchData((d) => (Array.isArray(d) ? d.slice() : d)); window.addEventListener("kp-close-days", f); return () => window.removeEventListener("kp-close-days", f); }, [setDispatchData]);
  // ⭐ 2026-11-06 고정노선현황 › 운송업체 설정 — 끄거나 삭제한 업체의 오더는 프로그램 어디에도 안 보이게(데이터 입구에서 한 번)
  //   목록·건수·배지·검색·미배차·실시간·지입차관리·대시보드·엑셀이 모두 아래 dispatchData를 쓰므로 그대로 따른다.
  //   정산·매출은 원래부터 같은 기준으로 빠졌고, 시트 연동은 서버가 그대로 한다(오더는 저장소에 남음).
  const routeCarrierF = useRouteCarrierFilter(getTenant() || userCompany || localStorage.getItem("userCompany") || "");
  // 🗂 2026-11-13 담당노선구분 — 화면 위 버튼 줄에서 고른 묶음만(배차 · 정산 · 매출 화면에서만 거른다. 그 밖의 화면은 전체 · src/routeGroups.jsx RG_SCREENS)
  const rgProfile = useMyProfile(user?.uid);
  const rg = useRouteGroupFilter({ enabled: useCompanyFeatures(getTenant() || userCompany).routeGroups === true, uid: user?.uid, profile: rgProfile, company: getTenant() || userCompany }); // ⭐ 2026-11-17 company — 담당노선 주인(배차담당자 자동 지정)
  const dispatchDataPreRG = useMemo(() => routeCarrierF.filter(dispatchDataAll) || [], [dispatchDataAll, routeCarrierF]);
  const dispatchData = useMemo(() => rg.filter(dispatchDataPreRG) || [], [dispatchDataPreRG, rg.filter]);
  const recentDispatchData = useMemo(() => rg.filter(routeCarrierF.filter(recentDispatchDataAll) || []) || [], [recentDispatchDataAll, routeCarrierF, rg.filter]);
  const orderHistoryApi = React.useMemo(() => ({ loadRange, loadFullHistory }), [loadRange, loadFullHistory]);
  const [pcBootDone, setPcBootDone] = useState(false);
  // 🛣 고정노선 — 정해진 요일의 배차를 미리 만들어 배차현황·실시간배차현황·기사앱에 보이게
  useFixedRouteAutoDispatch(pcBootDone ? (role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany) : userCompany) : "");
  // ⚡ 오더복사·운임 자동매칭이 쓰는 예전 오더(13개월)를 첫 로딩이 끝난 뒤 한가할 때 미리 받아둔다.
  //   예전엔 오더복사를 열거나 상·하차지를 입력하는 "그 순간" 받기 시작해 입력이 끊기고 검색이 늦게 떴다.
  useEffect(() => {
    if (!pcBootDone || !user) return undefined;
    let idleId = null;
    const t = setTimeout(() => {
      const run = () => { loadFullHistory(); subscribeUsersLive(); };
      if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(run, { timeout: 6000 });
      else run();
    }, 4000);
    return () => { clearTimeout(t); if (idleId && window.cancelIdleCallback) window.cancelIdleCallback(idleId); };
  }, [pcBootDone, user, loadFullHistory]);
  // ⭐ 2026-11-02 속도 — 따로 떼어 둔 큰 화면들을 첫 로딩이 끝나고 한가할 때 하나씩 미리 받아 둔다(메뉴 처음 열 때 기다림 없음)
  useEffect(() => {
    if (!pcBootDone) return undefined;
    return prefetchWhenIdle([
      // 🧩 2026-11-27 DispatchApp.jsx 에서 떼어 낸 화면(src/dispatch/*) — 예전엔 첫 묶음에 있던 화면이라 먼저 받아 둔다
      DispatchManagement.preload, RealtimeStatus.preload, DispatchStatus.preload, Settlement.preload, UnassignedStatus.preload, ClientSettlement.preload, PaymentManagement.preload, DriverManagement.preload, ClientManagement.preload, MyProfilePage.preload, HRManagementPage.preload, CompanyProfile.preload,
      AdminMenu.preload, FleetManagement.preload, FreightRateInquiry.preload, StaffManager.preload, AttendanceBoard.preload,
      RateCard.preload, FixedClients.preload, DriverDocsReview.preload, DriverAccounts.preload, MonthlyReport.preload,
      StaffPerformance.preload, MonthCompareAnalysis.preload, ClassicResume.preload,
    ], 12000);
  }, [pcBootDone]);

  // ⚠️ 아래 dispatchDataFiltered에서 커스텀 권한(관리자메뉴 > 권한관리에서 만든 역할)
  // 여부를 판단하는 데 필요해서, 원래 더 아래(구 "역할별 차단 메뉴" 구역)에 있던
  // useCustomRoles() 훅을 여기로 끌어올렸다. 아래쪽의 customRole 선언은 이 값을
  // 그대로 재사용한다(중복 구독 방지).
  const customRolesRaw = useCustomRoles();
  // 🔀 통합관리자·통합인사관리자·사무원·법무·개발 — 실제 역할의 메뉴 설정을 지금 화면 역할 자리에(customRoles.js applyRoleMenus)
  const customRoles = React.useMemo(() => applyRoleMenus(customRolesRaw, realRole, role), [customRolesRaw, realRole, role]);

  // 🔍 admin = 전체 데이터, 일반 user = 본인 작성 데이터만
  // ⭐ 회사/권한 기준 필터 로직 — dispatchData(최근 13개월)와 recentDispatchData(어제~내일)
  // 양쪽에 그대로 재사용한다(둘 다 raw 배열만 다르고 걸러내는 규칙은 동일하다).
  const filterByCompanyAndRole = React.useCallback((data) => {
    if (!data || !user) return [];

    // 총마스터는 입력한 회사명 기준으로 필터
    if (role === "totalMaster") {
      const viewCompany = localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY;
      return data.filter(o => (o?.companyName || DEFAULT_COMPANY) === viewCompany);
    }

    // 회사명 기준 필터
    const myCompany = userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY;
    const byCompany = data.filter(o => {
      const docCompany = o?.companyName || DEFAULT_COMPANY;
      return docCompany === myCompany;
    });

    // 실시간배차현황/배차현황 둘 다 접근 가능한 권한(관리자/경리회계/실무자/조회전용/
    // 인사관리자)은 회사 내 전체 데이터. 커스텀 권한(관리자메뉴 > 권한관리에서 새로
    // 만든 역할, 예: 부분관리자)도 이미 해당 메뉴에 조회/조회+수정 접근권한을 부여받은
    // 상태로 여기까지 들어온 것이므로 동일하게 전체 데이터를 봐야 한다.
    // ⚠️ 예전엔 role이 "admin"/"test"/"viewer"/"user" 중 하나가 아니면 전부 "본인
    // 데이터만" 보이게 걸러졌는데, 커스텀 권한 시스템이 나중에 추가되면서 새로 만든
    // 역할(role_xxxxx)과 인사관리자(hrManager)는 이 목록에 없어서 메뉴 접근권한을
    // write로 줘도 본인이 등록한 1~2건만 보이는 버그가 있었다.
    if (
      role === "admin" || role === "test" || role === "viewer" ||
      role === "user" || role === "hrManager" ||
      findCustomRole(customRoles, role)
    ) return byCompany;

    // 그 외 권한은 회사 내 본인 데이터만
    return byCompany.filter(o =>
      !o?.작성자 || o?.작성자 === user.email
    );
  }, [user, role, userCompany, customRoles]);

  const dispatchDataFiltered = useMemo(
    () => filterByCompanyAndRole(dispatchData),
    [dispatchData, filterByCompanyAndRole]
  );

  // ⭐ 실시간배차현황/배차관리 하단부 전용 — 어제~내일만 담긴 훨씬 작은 배열을
  // 같은 규칙으로 필터링한 버전. 이 두 화면은 이 값을 쓰도록 아래에서 교체한다.
  const recentDispatchDataFiltered = useMemo(
    () => filterByCompanyAndRole(recentDispatchData),
    [recentDispatchData, filterByCompanyAndRole]
  );
  // ⭐ 2026-11-03 고정노선(배차표·구글시트) 오더는 배차현황 › 고정노선현황에서만 — 배차관리·실시간배차현황·배차현황·미배차현황 목록에서는 뺀다
  //   (매출·정산·홈 통계 등은 그대로 전체 오더 기준)
  const myRouteBoardIds = useRouteBoardIds(userCompany || localStorage.getItem("userCompany") || ""); // ⭐ 2026-11-03 운송사 분리 — 이 회사 배차표 양식
  const listDispatchData = useMemo(() => dispatchDataFiltered.filter((r) => !r?.배차표Id), [dispatchDataFiltered]);
  // ⭐ 2026-11-05 고정노선현황 › 운송업체 설정 — 끄거나 삭제한 운송업체의 고정노선 오더는 정산·매출 계산에서 뺀다(설정 전이면 전부 그대로)
  //   매출관리·정산관리(거래처정산·거래명세서·미수금·용차지급·지입정산)·인사이트·홈 통계·AI 비서 합계가 이 값을 쓴다
  //   ⭐ 2026-11-06 화면 데이터(dispatchData)에서 이미 빠져 있다 — 아래 거름은 그대로 둬도 결과가 같다(이중 안전)
  const salesDispatchData = useMemo(() => routeCarrierF.filter(dispatchDataFiltered), [dispatchDataFiltered, routeCarrierF]);
  const salesRawDispatchData = useMemo(() => routeCarrierF.filter(dispatchData) || [], [dispatchData, routeCarrierF]);
  const listRecentDispatchData = useMemo(() => recentDispatchDataFiltered.filter((r) => !r?.배차표Id), [recentDispatchDataFiltered]);
  // ⭐ 2026-11-06 운송업체 설정 창 전용 — 숨긴 업체 오더까지 센다(다시 켤 수 있게 · 화면 목록에는 안 씀)
  const routeCarrierPoolRows = useMemo(() => filterByCompanyAndRole((dispatchDataAll || []).filter((r) => r?.배차표Id)), [dispatchDataAll, filterByCompanyAndRole]);


  // ⭐ 내 정보 통계 계산
  const myStats = useMemo(() => {
    if (!dispatchData) return { totalOrders: 0, totalRevenue: 0, totalProfit: 0 };
    const salesRows = salesRawDispatchData; // ⭐ 2026-11-05 운송업체 설정 반영

    const myOrders =
      role === "admin"
        ? salesRows               // ▲ 관리자 → 전체 데이터
        : salesRows.filter(d =>   // 일반 계정 → 본인 데이터만
          !d?.작성자 || d?.작성자 === user?.email
        );

    let totalRevenue = 0;
    let totalProfit = 0;

    myOrders.forEach(o => {
      // 🛠 2026-11-25 글자 금액("500,000")도 · 수익 = 줄 수수료(orderProfit) — 예전엔 Number()라 쉼표가 있으면 NaN, 지게차·외부 지급분도 안 뺐다
      totalRevenue += fkNum(o?.청구운임);
      totalProfit += orderProfit(o);
    });

    return {
      totalOrders: myOrders.length,
      totalRevenue,
      totalProfit,
    };
  }, [dispatchData, salesRawDispatchData, user]);
  // ⭐ 오늘 날짜
  const today = todayStr();

  // ⭐ 안전한 날짜 파싱 함수 (Timestamp, string 모두 지원)
  function parseDate(v) {
    if (!v) return null;

    // Firebase Timestamp 객체면 toDate() 사용
    if (typeof v === "object" && v.toDate) {
      return v.toDate();
    }

    // 문자열이면 Date로 변환
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // ⭐ KST 기준 날짜(2025-02-14 형태로)
  function toYMD_KST(date) {
    if (!date) return "";
    const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
  /* =================================================
     • 전달상태 계산 (오늘 이전 자동 전달완료)
     ▸ DispatchStatus 내부 / 날짜 유틸 바로 아래
  ================================================= */
  const getDeliveryStatus = (row) => {
    const today = todayStr();      // ← 이미 쓰고 있는 todayStr 그대로 사용
    const d =
      row?.상차일자 ||
      row?.상차일 ||
      row?.상차 ||
      "";

    // 1️⃣ DB에 명시된 값이 있으면 그걸 최우선
    if (row.업체전달상태) return row.업체전달상태;

    // 2️⃣ 오늘 이전 상차 → 자동 전달완료
    if (d && d < today) return "전달완료";

    // 3️⃣ 오늘 / 미래
    return "미전달";
  };
  // ⭐ 오늘 통계
  const todayStats = useMemo(() => {
    if (!dispatchData || !user) return { count: 0, revenue: 0, profit: 0 };

    const todayStrKST = today; // 기존 todayStr 사용

    const list = salesRawDispatchData.filter((d) => { // ⭐ 2026-11-05 운송업체 설정 반영
      // 날짜 파싱
      const dt = parseDate(d?.상차일자 || d?.상차일 || d?.상차);
      if (!dt) return false;

      const dateKST = toYMD_KST(dt);

      // 🔥 admin이면 전체 보여주고, user는 본인 데이터만 보여줌
      const isMine =
        role === "admin" ? true : (!d?.작성자 || d.작성자 === user.email);

      return isMine && dateKST === todayStrKST;
    });


    return list.reduce(
      (acc, o) => {
        const fare = toInt(o?.청구운임);

        acc.count += 1;
        acc.revenue += fare;
        acc.profit += orderProfit(o); // 🛠 2026-11-25 지게차·외부 특수운임(회사 지급분)까지 뺀 줄 수수료 — 배차현황과 같은 식

        return acc;
      },
      { count: 0, revenue: 0, profit: 0 }
    );
  }, [dispatchData, salesRawDispatchData, user, today]);
  // ⭐ 오늘 미배차 = 처리 필요 건수
  const pendingToday = useMemo(() => {
    if (!dispatchData || !user) return 0;

    const todayStrKST = today;

    return dispatchData.filter((d) => {
      // 날짜 파싱
      const dt = parseDate(d?.상차일자 || d?.상차일 || d?.상차);
      if (!dt) return false;

      const dateKST = toYMD_KST(dt);

      // admin은 전체, user는 본인 것만
      const isMine =
        role === "admin" ? true : (!d?.작성자 || d.작성자 === user.email);

      // ⭐ 핵심: 오늘 + 차량번호 없음 = 미배차
      // ⭐ 2026-11-06 고정노선(배차표) 오더는 고정노선현황에서만 — 홈 미배차 숫자에서도 뺀다(배차현황 미배차 배지와 같은 기준)
      return (
        !d?.배차표Id &&
        isMine &&
        dateKST === todayStrKST &&
        (!d.차량번호 || !String(d.차량번호).trim())
      );
    }).length;
  }, [dispatchData, user, role, today]);

  // ===================== 홈 트렌드 데이터 (시간대별 오더 수) =====================
  const trendData = useMemo(() => {
    const hourly = {};

    dispatchData.forEach((r) => {
      const h = String(r?.상차시간 || "").match(/(\d+)/);
      const hour = h ? Number(h[1]) : null;

      if (hour !== null && hour >= 0 && hour <= 23) {
        hourly[hour] = (hourly[hour] || 0) + 1;
      }
    });

    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}시`,
      count: hourly[i] || 0,
    }));
  }, [dispatchData]);

  // ---------------- 로그아웃 ----------------
  const logout = async () => {
    // ⭐ 2026-11-02 로그아웃 지연 방지 — 알림 해제는 최대 1.2초만 기다린다
    await Promise.race([clearFcmToken(auth.currentUser?.uid).catch(() => {}), new Promise((r) => setTimeout(r, 1200))]);
    await signOut(auth).catch(() => {});
    localStorage.removeItem("role");
    try { sessionStorage.removeItem("skipLoginPopup"); sessionStorage.removeItem("transportValidating"); sessionStorage.removeItem("kpExecFull"); } catch { /* 무시 */ } // ⭐ 2026-11-17 다시 로그인하면 경영 브리핑부터
    // ⭐ 2026-11-01 로그아웃 뒤 운송사를 누르면 선택 화면이 한 번 더 뜨던 문제 — 기록을 덮어써서(/login 중복 방지) 이동
    navigate("/login", { replace: true });
  };

  // ---------------- 옵션 리스트 ----------------
  const timeOptions = useMemo(
    () =>
      Array.from({ length: 24 * 6 }, (_, i) =>
        `${String(Math.floor(i / 6)).padStart(2, "0")}:${String(
          (i % 6) * 10
        ).padStart(2, "0")}`
      ),
    []
  );

  const tonOptions = useMemo(() => Array.from({ length: 25 }, (_, i) => `${i + 1}톤`), []);

 // ⭐ 2026-11-14 새 버전 자동 새로고침 뒤에는 보던 메뉴로 돌아온다(대시보드로 튕기지 않게 — ErrorBoundary.reloadOnce가 남긴 값, 1분 안)
 const [navFlat, setNavFlat] = useState(() => navFlatPref()); // ⭐ 2026-11-14 상단 메뉴 묶음(기본) / 예전처럼 한 줄(펼침)
 const [menu, setMenu] = useState(() => { try { const j = JSON.parse(sessionStorage.getItem("kpReloadMenu") || "null"); sessionStorage.removeItem("kpReloadMenu"); if (j && j.menu && Date.now() - j.at < 60000) return j.menu; } catch { /* 무시 */ } return "HOME"; });
  // 🗂 2026-11-14 담당노선구분 탭 — 매출관리는 들어갈 때마다 [전체]부터(다른 화면에서 고른 탭 때문에 매출이 일부만 보이던 문제 · src/routeGroups.jsx)
  // 🗂 2026-11-17 배차현황의 월 마감 · 인수증관리 · 고정노선현황에서는 탭 줄을 숨기고 거르지 않는다(화면 안 [노선구분]으로 고른다)
  const rgTabOff = menu === "배차현황" && RG_TAB_OFF.includes(배차현황Tab);
  React.useEffect(() => { rg.setScreen(rgTabOff ? `배차현황:${배차현황Tab}` : menu); }, [menu, rgTabOff, 배차현황Tab, rg.setScreen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [subRg, setSubRg] = useState("all"); // 인수증관리 안에서 고른 노선구분(월 마감은 화면 안 [노선 전체] 칸이 이미 있다)
 useEffect(() => { try { window.__kpMenu = menu; } catch { /* 무시 */ } }, [menu]);
 // 📍 2026-11-13 지금 보는 화면을 로그인 기록에 적는다(관리센터 실시간 표시 — src/screenReport.js)
 useEffect(() => { installScreenVisibility(); reportScreen(isBizMenu(menu) ? `${bizInfoOf(parseBizMenu(menu).biz).short} · ${bizMenuLabelOf(menu)}` : (menu === "HOME" ? "홈" : menu), "pc"); }, [menu]);
 const screenFit = useScreenFit(menu); // 🖥 2026-11-10 화면 맞춤(계정별 기억)
 // 🔔 전자결재 배너를 누르면 홈으로 옮긴다 — 문서 열기는 HomeDashboard가 window.__kpOpenApproval을 받아서 한다
 useEffect(() => {
   const h = () => setMenu("HOME");
   window.addEventListener("kp-open-approval", h);
   return () => window.removeEventListener("kp-open-approval", h);
 }, []);
 // ✉️ 2026-11-08 [메일 설정 열기] — 회사관리 › 회사정보 › 메일 설정(src/companyMail.js openMailSettings)
 useEffect(() => {
   const h = () => { setMenu("회사관리"); setTimeout(() => { window.dispatchEvent(new Event("kp-cm-tab")); window.dispatchEvent(new Event("kp-mail-focus")); }, 0); };
   window.addEventListener("kp:open-mail-settings", h);
   return () => window.removeEventListener("kp:open-mail-settings", h);
 }, []);
  // 정산관리(거래명세서 검색/선택 상태)는 다른 메뉴로 이동했다 돌아와도 유지되도록,
  // 한 번 방문하면 언마운트하지 않고 CSS로만 숨긴다.
  const [정산관리Visited, set정산관리Visited] = useState(false);
  useEffect(() => { if (menu === "정산관리") set정산관리Visited(true); }, [menu]);
  const mainDetailGet = useDetailGetters(userNameMap, userCompany); // 🔎 세부검색(정산관리·매출관리)
  const [activeTool, setActiveTool] = useState("none"); // "none" | "calculator" | "ai" | "messenger"
  const notificationsEnabled = useNotificationsEnabled();
  const calcOpen = activeTool === "calculator";
  const setCalcOpen = (v) => setActiveTool(v ? "calculator" : "none");
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) root.style.zoom = "1";
    localStorage.removeItem("appZoom");
  }, []);
   // ★ 거래명세서에서 오더 클릭 시 해당 오더로 이동하기 위한 전역 함수
  const [highlightOrderId, setHighlightOrderId] = useState(null);

    // ★ 특정 오더 ID로 필터링 (거래명세서에서 이동 시)
  const [focusOrderId, setFocusOrderId] = useState(null);
  const [homeClickedOrder, setHomeClickedOrder] = useState(null);

  useEffect(() => {
    window.__setMainTab = (tab) => setMenu(tab);
    window.__selectOrder = (id) => {
      setFocusOrderId(id);  // ★ 해당 오더만 표시하도록 필터 설정
      setMenu("배차현황");
      setTimeout(() => {
        const rowEl = document.getElementById(`row-${id}`);
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
          rowEl.classList.add("toast-flash-border");
          setTimeout(() => {
            rowEl.classList.remove("toast-flash-border");
          }, 2500);
        }
      }, 400);
    };
    return () => {
      delete window.__setMainTab;
      delete window.__selectOrder;
    };
  }, []);

const [alertMsg, setAlertMsg] = useState(null);
// 이 알림 밑에 다른 팝업(담당자 선택/거래처 메모 안내 등)을 이어서 띄워야 할 때,
// 알림을 "확인"한 뒤에만 그 팝업이 나타나도록 하기 위한 콜백 저장소.
const alertThenRef = React.useRef(null);
const showAlert = (msg, then) => { alertThenRef.current = then || null; setAlertMsg(msg); };
// addDispatch/patchDispatch 등 컴포넌트 바깥에 정의된 함수도 이 화면과 동일한 스타일의
// CustomAlert를 띄울 수 있도록, 렌더될 때마다 최신 showAlert를 전역 브릿지에 연결한다.
setGlobalShowAlert(showAlert);
const closeAlert = () => {
  setAlertMsg(null);
  const cb = alertThenRef.current;
  alertThenRef.current = null;
  if (cb) setTimeout(cb, 50);
};
const [loginMgrOpen, setLoginMgrOpen] = React.useState(false); // ★ 로그인 관리 창
// ⭐ 2026-11-02 화면 점검 — 상단 메뉴가 화면보다 길면 좌우 흐림 + ‹ › 버튼으로 "더 있음"을 알린다(넘칠 때만 보임)
const [navOverflow, setNavOverflow] = React.useState({ l: false, r: false });
const navScrollRef = React.useRef(null);
const updateNavOverflow = React.useCallback(() => {
  const el = navScrollRef.current; if (!el) return;
  const l = el.scrollLeft > 2;
  const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
  setNavOverflow((p) => (p.l === l && p.r === r ? p : { l, r }));
}, []);
const navScrollRefCb = React.useCallback((el) => {
  if (navScrollRef.current && navScrollRef.current._kpNavCleanup) navScrollRef.current._kpNavCleanup();
  navScrollRef.current = el;
  if (!el) return;
  let ro = null;
  if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => updateNavOverflow()); ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
  window.addEventListener("resize", updateNavOverflow);
  el._kpNavCleanup = () => { if (ro) ro.disconnect(); window.removeEventListener("resize", updateNavOverflow); };
  updateNavOverflow();
}, [updateNavOverflow]);
const scrollNavBy = (dir) => { const el = navScrollRef.current; if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" }); };
// 매출관리 비밀번호 게이트
const [revenueUnlocked, setRevenueUnlocked] = React.useState(false);

  // ---------------- 역할별 차단 메뉴 ----------------
  // 최고관리자가 새로 만든 커스텀 권한(역할) — 메뉴별 접근범위(숨김/조회/조회+수정)를
  // 직접 설정할 수 있다. 내장 역할(admin/user/test/viewer 등)에는 관여하지 않는다.
  // (customRoles 자체는 위쪽 dispatchDataFiltered 근처에서 이미 구독해뒀다.)
  const customRole = findCustomRole(customRoles, role);
  // 👔 2026-10-31 임원(부서 임원 · 대표/전무/이사) — 로그인하면 임원 화면. 관리자 권한 임원은 [전체 메뉴]로 실무 화면도 볼 수 있다
  const myProfileDoc = useMyProfile(user?.uid);
  useCompanyDropdownSync(role, userCompany); // ⭐ 편집모드 옵션(배차방식 등)을 표·빠른수정에도 회사별로
  // ⭐ 2026-11-01 가입 승인 대기 — 승인할 수 있는 사람(관리자·경리·인사·마스터)에게 상단 [관리자메뉴] 숫자 + 새 신청 알림
  const canApproveSignup = ["admin", "totalMaster", "superadmin", "test", "hrManager", "hrAcct", "allMgr"].includes(realRole || role) || myProfileDoc?.isMaster === true;
  const pendingSignups = usePendingSignups(canApproveSignup ? (role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany || "") : (userCompany || localStorage.getItem("userCompany") || "")) : "");
  // ⭐ 2026-11-05 관리자메뉴 숫자는 직원 가입만 — 기사 가입은 기사관리 › 기사 앱 계정 › 가입 승인 숫자(alertsNav.signupDriver)로만
  const pendingStaffSignups = pendingSignups.filter((u) => u.role !== "driver").length;
  // ⭐ 2026-11-01 마스터 인사권 — 인사 담당자가 없을 때만(생기면 자동 인계, hrHandover.js)
  const coStaffMain = useCompanyStaff(myProfileDoc?.isMaster === true ? (userCompany || localStorage.getItem("userCompany") || "") : "");
  const masterHrMain = !!coStaffMain && masterHasHr(myProfileDoc, coStaffMain, user?.uid);
  // ⭐ 2026-10-31 임원 화면은 권한 관리에서 "임원 화면"으로 정한 역할(예: 임원관리자)만 — 관리자 권한은 직책과 무관하게 일반 화면
  // ⭐ 2026-11-17 부서가 임원인 통합관리자도 경영 브리핑 화면(사용자 요청) — 로그인하면 늘 여기서 시작하고, [화면 전환]으로 운송 · 영업 · 경리 · 인사를 본다
  const execAllMgr = realRole === "allMgr" && isExecTeam(myProfileDoc?.team);
  const pfGrant = usePrivateFareGrant(user?.uid || ""); // 🔐 2026-11-18 비공개 운임 지정 여부(메뉴만 · 금액은 화면을 열 때)
  const isExec = forceExec || execAllMgr || roleScreen(customRole) === "exec";
  // ⭐ 2026-11-17 [전체 메뉴]로 바꾼 것은 이 로그인 동안만 기억(sessionStorage) — 다시 로그인하면 경영 브리핑부터. 예전 localStorage 값은 지운다
  const [execFull, setExecFull] = React.useState(() => { try { localStorage.removeItem("kpExecFull"); return sessionStorage.getItem("kpExecFull") === "1"; } catch { return false; } });
  const setExecFullV = (v) => { setExecFull(v); try { sessionStorage.setItem("kpExecFull", v ? "1" : "0"); } catch { /* 무시 */ } };
  const toggleExecFull = () => { setExecFullV(!execFull); setMenu("HOME"); };
  const execHome = isExec && !execFull;
  // 경영 브리핑을 보는 동안 임원 통합관리자는 운송 화면 역할(관리자)로 — 마지막에 경리 · 인사 화면을 보고 나갔어도 경영 브리핑이 먼저
  useEffect(() => { if (execAllMgr && execHome && roleView.views && roleView.view !== roleView.views[0][0]) roleView.setView(roleView.views[0][0]); }, [execAllMgr, execHome, roleView.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const deptMode = execHome ? "exec" : deptModeOf(role, customRole); // ⭐ 2026-11-17 경영 브리핑이 먼저(예전: 부서 화면 → 임원 순 — 임원 역할은 부서 화면이 없어 결과는 같다)
  // 🗂 2026-11-13 업무 범위(사내업무만 / 사내업무 + 경리) — 배차 메뉴 없이 사내업무 화면만(src/workScope.js). 최고관리자는 해당 없음
  // 🛠 2026-11-15 실제 권한 기준(화면을 바꿔도 같다) · 그 권한에서 고를 수 없는 값은 무시(통합관리자 = 전체 고정 등 · src/workScope.js effectiveScope)
  const workScope = role === "totalMaster" || realRole === "totalMaster" ? "" : effectiveScope(realRole, myProfileDoc?.workScope, myProfileDoc?.isMaster === true);
  // ⭐ 2026-11-17 배차 알림(재촉 · 수정/취소 요청 · 기사 토스트 · 배차 토스트 · 메뉴 숫자)은 지금 운송 일을 하는 사람에게만(src/notifyAudience.js)
  //  · 업무 범위가 있는 계정(사내업무 · 경리업무만) · 경리 · 인사 · 영업 역할은 끔 · 통합관리자 · 최고관리자는 [운송] 화면을 보는 동안만
  const notifyCtx = { realRole, role, view: roleView.view, workScope, execHome, deptMode };
  const dispatchAlertsOff = !audienceAllows("dispatch", notifyCtx);
  const notifyActiveView = activeViewOf(notifyCtx);
  React.useEffect(() => { setDispatchAlertsOn(!dispatchAlertsOff); }, [dispatchAlertsOff]);
  // 휴대폰 푸시는 서버가 받는 사람을 고른다 — 지금 보는 화면을 users/{uid}.activeView 에 적어 둔다(바뀔 때만 · 모바일도 같은 칸)
  //  ⚡ 2026-11-23 이 기기에서 화면이 바뀌었을 때만 적는다 — 예전엔 PC · 휴대폰이 서로 다른 화면이면 상대가 적은 값을 보고 다시 덮어써 끝없이 주고받았다
  const activeViewSentRef = useRef("");
  React.useEffect(() => {
    if (!user?.uid || !myProfileDoc || activeViewSentRef.current === notifyActiveView) return;
    activeViewSentRef.current = notifyActiveView;
    if (myProfileDoc.activeView === notifyActiveView) return;
    updateDoc(doc(db, "users", user.uid), { activeView: notifyActiveView, activeViewAt: Date.now() }).catch(() => {});
  }, [user?.uid, notifyActiveView, !!myProfileDoc, myProfileDoc?.activeView]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (workScope && !scopeAllows(workScope, menu) && !isBizMenu(menu)) setMenu("HOME"); else if (workScope && isBizMenu(menu)) setMenu("HOME"); }, [workScope, menu]);
  useUiScreen(menu, deptMode); // ⭐ 2026-11-07 화면 편집 — 지금 메뉴("이 화면만")·부서(역할별 보이기)
  const deptCompany = (localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim();
  // 🧭 2026-11-12 업무 영역 — 회사가 쓰는 영역(내륙 · 컨테이너 · 해상 · 항공) 중 지금 보는 것. 내륙뿐인 회사는 예전 화면 그대로
  //  통합 현황(group)은 임원 · 관리자 · 마스터만. 고른 업무는 계정마다 기억하고, 처음엔 가입 때 고른 담당 업무(users.bizHome)
  const bizModsAll = useBizModules(deptCompany);
  const bizSeeAll = isExec || role === "admin" || role === "totalMaster" || realRole === "allMgr" || myProfileDoc?.isMaster === true;
  // 👤 직원 업무 담당(통합 › 업무 담당에서 정함) — 정해진 직원은 그 업무만 본다
  const bizAllowKey = workScope ? "inland" : allowedModules(bizModsAll.list, myProfileDoc?.bizAccess, bizSeeAll).join(","); // 🗂 사내업무 계정은 업무 영역 전환 없음
  const bizMods = React.useMemo(() => ({ ...bizModsAll, list: bizAllowKey.split(",").filter(Boolean) }), [bizAllowKey, bizModsAll.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const canBizGroup = bizMods.list.length >= 2 && (isExec || role === "admin" || role === "totalMaster" || realRole === "allMgr" || myProfileDoc?.isMaster === true);
  const [bizRaw, setBizRaw] = React.useState(() => readBiz(user?.uid));
  const bizWant = bizRaw || myProfileDoc?.bizHome || "";
  const biz = bizWant === "group" ? (canBizGroup ? "group" : bizMods.list[0]) : (bizMods.list.includes(bizWant) ? bizWant : bizMods.list[0]);
  const bizMenus = bizTopMenus(biz); // 내륙은 null(기존 메뉴)
  try { window.__kpBizNow = biz; } catch { /* 무시 */ } // F1~F3 단축키가 지금 업무를 알게
  const pickBiz = (k) => { setBizRaw(k); writeBiz(user?.uid, k); setMenu(bizFirstMenu(k)); };
  const bizLandedRef = React.useRef(false);
  React.useEffect(() => {
    if (!bizMods.loaded) return;
    // 처음 들어올 때 — 내륙이 아닌 업무를 보던 계정은 그 업무 대시보드로
    if (!bizLandedRef.current) { bizLandedRef.current = true; if (biz !== "inland" && menu === "HOME") setMenu(bizFirstMenu(biz)); return; }
    // 업무 영역이 꺼졌거나 바뀌어 지금 메뉴가 그 업무 것이 아니면 홈으로
    if (isBizMenu(menu) && parseBizMenu(menu).biz !== biz) setMenu(bizFirstMenu(biz));
  }, [bizMods.loaded, biz, menu]); // eslint-disable-line react-hooks/exhaustive-deps
  // 📊 2026-11-06 일일 경영 보고 — 임원 화면 역할(isExec: 권한 관리 › "임원 화면")만(src/dailyReport.js canSeeBriefing)
  const canBriefing = canSeeBriefing({ isExec });
  // 🔢 2026-11-02 상단 메뉴 숫자 — 새로 온 것(결재 차례·안 읽은 메일·공지·인수인계·가입 신청)을 메뉴와 세부 메뉴에 표시
  // 💸 2026-11-15 경리 화면(통합관리자 등이 경리로 바꾼 때 포함) — 지급 대기 지출결의도 전자결재 숫자에 더한다
  const apCountsRaw = useApprovalCounts({ role: realRole || role, team: myProfileDoc?.team || "", company: deptCompany, view: roleView.view });
  const apCountsNav = React.useMemo(() => ({ ...apCountsRaw, todo: (apCountsRaw.todo || 0) + (apCountsRaw.payTodo || 0) }), [apCountsRaw]);
  // 경리 화면으로 바꿨을 때 지급 대기가 있으면 한 번 알린다
  const payToastRef = React.useRef("");
  React.useEffect(() => {
    const n = apCountsRaw.payTodo || 0;
    const key = `${roleView.view || ""}`;
    if (!n || payToastRef.current === key) return;
    if (roleView.view && roleView.view !== "acct") { payToastRef.current = ""; return; }
    payToastRef.current = key;
    try { window.__sflowShowToast?.(`💸 지급 대기 지출결의 ${n}건이 있어요. 전자결재 › 결재함 › 지급 대기에서 처리해 주세요`, "info"); } catch { /* 무시 */ }
  }, [roleView.view, apCountsRaw.payTodo]);
  const mailCountsNav = useMailCounts();
  const alertsNav = useMobileAlerts({ uid: user?.uid, role: realRole || role, team: myProfileDoc?.team || "", company: deptCompany });
  // ⭐ 2026-11-05 기사앱 이벤트 — 수락/거절은 이미 구독 중인 어제~내일 오더(recentDispatchDataFiltered)에서 꺼낸다(추가 구독 없음).
  //  내가 등록/배차확정한 오더만(관리자는 종 패널에서 "모든 담당자" 켜기). 서류(검토 대기)·긴급(미처리)은 작은 구독 1개씩.
  const drvMe = React.useMemo(() => ({ uid: user?.uid || "", email: user?.email || "", name: myRealName || "", isAdmin: ["admin", "totalMaster", "superadmin", "allMgr"].includes(realRole || role) }), [user?.uid, user?.email, myRealName, realRole, role]);
  React.useEffect(() => { publishDriverOrderRows(recentDispatchDataFiltered, drvMe); }, [recentDispatchDataFiltered, drvMe]);
  useDriverEventFeeds({ uid: user?.uid, company: deptCompany, canDocs: canApproveSignup, canSos: role !== "viewer" });
  const drvCounts = useDriverEventCounts();
  React.useEffect(() => { setDriverSeenServer(myProfileDoc?.driverEventsSeen); }, [myProfileDoc?.driverEventsSeen]);
  // ⭐ 2026-11-06 계정별 안 본 숫자 — 배차현황(list)·미배차현황(unassigned)·고정노선현황(fixed) 탭 숫자는 그 탭을 1.5초 보면 사라지고,
  //  새로 생긴 오더만 다시 숫자로(seenBadges.js · 이 브라우저 + users/{uid}.badgeSeen — 모바일 등록내역·미배차현황·고정노선현황과 같은 기록)
  useBadgeSeenSync(user?.uid, myProfileDoc?.badgeSeen);
  const pcUnassigned = useMemo(() => pickUnassignedOrders(listDispatchData), [listDispatchData]);
  const pcFixedUnassigned = useMemo(() => pickUnassignedOrders(dispatchDataFiltered.filter((r) => r.배차표Id && myRouteBoardIds.has(r.배차표Id))), [dispatchDataFiltered, myRouteBoardIds]); // ⭐ 이 회사 양식의 오더만
  const unseenUnassignedArr = useUnseenItems("unassigned", pcUnassigned);
  const unseenFixedArr = useUnseenItems("fixed", pcFixedUnassigned);
  const unseenUnassigned = unseenUnassignedArr.length, unseenFixed = unseenFixedArr.length;
  // 🔢 2026-11-15 상단 숫자가 확인 뒤에도 다시 뜨던 문제 — 같은 미배차 오더를 "배차현황(list)"과 "미배차현황(unassigned)" 두 기록으로 따로 셌다.
  //  미배차현황에서 확인해도 list 기록이 남아 다른 메뉴로 가면 숫자가 되살아났다 → PC는 미배차현황 하나로만 세고, 어느 탭에서 보든 두 기록을 같이 지운다
  const unseenDispatchTotal = unionCount(unseenUnassignedArr, unseenFixedArr); // 상단 메뉴 합계 — 같은 오더는 한 번
  // ⭐ 2026-11-17 상단 메뉴 배차 숫자(기사 수락/거절 · 새 미배차 · 고정노선 미배차 · 긴급)도 운송 일을 하는 때만(경리 · 인사 화면이면 0)
  const navDrvOrders = dispatchAlertsOff ? 0 : drvCounts.orders, navDrvSos = dispatchAlertsOff ? 0 : drvCounts.sos;
  const navUnseenDispatch = dispatchAlertsOff ? 0 : unseenDispatchTotal, navUnseenUnassigned = dispatchAlertsOff ? 0 : unseenUnassigned, navUnseenFixed = dispatchAlertsOff ? 0 : unseenFixed;
  useMarkSeenOnView(menu === "배차현황" && (배차현황Tab === "배차현황" || 배차현황Tab === "미배차현황"), "list", pcUnassigned, 800);
  useMarkSeenOnView(menu === "배차현황" && 배차현황Tab === "미배차현황", "unassigned", pcUnassigned, 800);
  useMarkSeenOnView(menu === "배차현황" && 배차현황Tab === "고정노선현황", "fixed", pcFixedUnassigned, 800);
  React.useEffect(() => { setDriverToastsMuted(!notificationsEnabled || dispatchAlertsOff); }, [notificationsEnabled, dispatchAlertsOff]); // 🗂 2026-11-17 경리업무만 · 사내업무 계정은 기사 알림 끔
  // 그 화면을 보고 있으면 "봤음"으로(토스트·줄 칩 맥박은 그대로 보이고 4초 뒤 숫자만 사라짐)
  React.useEffect(() => {
    if (!["실시간배차현황", "배차현황", "배차관리"].includes(menu) || !drvCounts.orders) return undefined;
    const t = setTimeout(() => markDriverSeen("orders"), 4000);
    return () => clearTimeout(t);
  }, [menu, drvCounts.orders]);
  React.useEffect(() => { if (menu === "기사관리" && 기사관리Tab === "docs:driver" && drvCounts.docs) markDriverSeen("docs"); }, [menu, 기사관리Tab, drvCounts.docs]);
  React.useEffect(() => { if (menu === "지입차관리" && drvCounts.sosUnseen) markDriverSeen("sos"); }, [menu, drvCounts.sosUnseen]);
  const onDriverEventView = (e) => {
    if (!e) return;
    if (e.kind === "doc") { set기사관리Tab("docs:driver"); handleMenuClick("기사관리"); markDriverSeen("docs"); return; }
    if (e.kind === "sos") { handleMenuClick("지입차관리"); markDriverSeen("sos"); setTimeout(() => emitSubnav("FLEET CONTROL", "tracking"), 0); return; }
    if (e.kind === "checkout") { handleMenuClick("지입차관리"); markDriverSeen("checkout"); setTimeout(() => emitSubnav("FLEET CONTROL", "tracking"), 0); return; } // ⭐ 2026-11-10 담당 기사 퇴근 → 관제현황
    markDriverSeen("orders");
    if (e.row?.배차표Id) { handleMenuClick("배차현황"); setTimeout(() => emitSubnav("DISPATCH", "고정노선현황"), 0); return; }
    if (!["실시간배차현황", "배차관리"].includes(menu)) handleMenuClick("실시간배차현황");
    setTimeout(() => focusOrderRow(e.id), 250);
  };
  // 부서 모드에서 볼 수 없는 메뉴에 머물러 있으면 홈으로
  React.useEffect(() => { if (deptMode && !DEPT_MENUS[deptMode].includes(menu)) setMenu("HOME"); }, [deptMode, menu]);
  React.useEffect(() => { if (hiddenInSwitchView(realRole, roleView.view, menu) || builtinHidesMenu(role, menu, !!customRole)) setMenu("HOME"); }, [realRole, roleView.view, role, menu, customRole]); // 🧾 운송 화면에 정산관리가 남아 있으면 홈으로
  // viewer(조회전용): 관리센터 제외 모든 메뉴 조회 가능, 수정/등록 불가
  // 🔓 2026-11-12 권한 관리에 "조회"로 저장돼 있어도 — 마스터(최고관리자 · 회사 마스터)는 어디서나, 경리(경리관리자 · 경리사무원 · 통합)는 배차현황에서 오더를 고칠 수 있다
  const _editFree = (realRole || role) === "totalMaster" || myProfileDoc?.isMaster === true
    || (menu === "배차현황" && ["test", "acctStaff", "hrAcct", "allMgr"].includes(realRole || role));
  const isViewer = role === "viewer" || (!_editFree && !!customRole && getMenuAccess(customRoles, role, menu) === "read");
  const _viewerBlock = () => showAlert("조회전용 권한으로는 수정/등록/삭제를 할 수 없습니다.");
  // 🔒 2026-11-01 조회만 허락된 메뉴에서는 수정·저장·삭제 버튼과 표 두 번 누르기(수정 창)를 바로 막는다
  //  (HOME·전자결재·회사관리(내정보)는 본인 업무라 제외)
  useReadOnlyGuard(isViewer && !["HOME", "전자결재", "회사관리"].includes(menu), (msg) => showAlert(msg));
  const addDispatchSafe = isViewer ? _viewerBlock : addDispatch;
  const patchDispatchSafe = isViewer ? _viewerBlock : patchDispatch;
  const removeDispatchSafe = isViewer ? _viewerBlock : removeDispatch;
  // ⭐ 2026-11-02 기사앱을 아직 가입하지 않은 기사(또는 지입이 아닌 직영·임대 등)가 배정됐는데 "승인대기"로 멈춘 오더 → 배차완료로 바로잡는다.
  //   (예전 고정노선 자동 생성·서버 안전망이 가입 여부를 보지 않고 승인대기를 걸었다) 수락 화면은 기사앱에 가입한 지입 기사에게만 있다.
  const fixedAwaitRef = React.useRef(new Set());
  React.useEffect(() => {
    if (isViewer || !drivers?.length || !dispatchData?.length) return;
    const byPlate = new Map();
    drivers.forEach((d) => { const k = normalizePlate(d.차량번호 || ""); if (k) byPlate.set(k, [...(byPlate.get(k) || []), d]); });
    dispatchData.forEach((r) => {
      if (r?.배차상태 !== "승인대기" || r?.기사확인상태 !== "대기" || !r?.차량번호 || !r?._id) return;
      const key = `${r.__col || "orders"}/${r._id}`;
      if (fixedAwaitRef.current.has(key)) return;
      const list = byPlate.get(normalizePlate(r.차량번호)) || [];
      if (!list.length) return; // 기사 목록에 없는 차량은 판단하지 않는다
      if (list.some((d) => isFleetGrade(d.등급) && !!d.uid)) return; // 기사앱 가입한 지입 기사 → 수락을 기다리는 게 맞다
      fixedAwaitRef.current.add(key);
      updateDoc(doc(db, r.__col || "orders", r._id), { 기사확인상태: null, 배차상태: "배차완료", 상태: "배차완료" }).catch(() => fixedAwaitRef.current.delete(key));
    });
  }, [isViewer, drivers, dispatchData]);
  // 🤖 2026-11-07 AI 비서 저장 연결 — 손으로 고칠 때와 같은 함수(patchDispatch · addDispatch · removeDispatch)를 그대로 쓴다
  //  (수정 기록 · 화주사 사본 · 구글시트 · 허브 동기화 · 지입 기사 알림 · 수수료 계산이 똑같이 동작)
  //  권한: 지금 보고 있는 메뉴가 아니라 "배차관리" 쓰기 권한으로 판단(조회전용이면 카드의 적용 버튼이 막힌다)
  const aiCanWrite = role !== "viewer" && !(customRole && getMenuAccess(customRoles, role, "배차관리") !== "write");
  const aiOrderApi = {
    canWrite: aiCanWrite,
    // 🛠 2026-11-25 AI 비서로 지급방식을 바꾸면 배차상태도 화면 확인 창과 같은 규칙(payTypeStatusPatch)으로 — "지급방식 취소 + 배차완료" 오더가 생기지 않게
    update: (id, patch, row) => {
      if (!aiCanWrite) return _viewerBlock();
      const p = { ...patch };
      if ("지급방식" in p && !("배차상태" in p)) {
        const prev = row || (dispatchData || []).find((r) => r._id === id) || {};
        Object.assign(p, payTypeStatusPatch(prev, p.지급방식, p));
      }
      return patchDispatch(id, p, row);
    },
    remove: (ids) => (aiCanWrite ? removeDispatch(ids) : _viewerBlock()),
    create: async (recIn) => {
      if (!aiCanWrite) { _viewerBlock(); return false; }
      const rec = { ...recIn };
      // 등록 화면(doSave)과 같이 — 차량번호가 있으면 기사관리에서 이름·전화를 채우고, 기사앱 가입한 지입 기사면 승인대기 + 기사앱 알림
      if (String(rec.차량번호 || "").trim()) {
        const dv = drivers.find((d) => normalizePlate(d.차량번호) === normalizePlate(rec.차량번호));
        if (dv) { rec.이름 = rec.이름 || dv.이름 || ""; rec.전화번호 = rec.전화번호 || dv.전화번호 || ""; }
        if (isFleetGrade(dv?.등급) && !!dv.uid) {
          rec.기사확인상태 = "대기"; rec.배차상태 = "승인대기";
          addDoc(collection(db, "driver_notifications"), { driverId: dv.id, type: "new_order", orderId: null, title: "배차오더가 도착했습니다", body: `${rec.거래처명 || ""} ${rec.상차지명 || "-"} → ${rec.하차지명 || "-"}`, createdAt: serverTimestamp(), read: false }).catch(() => {});
        }
      }
      const now = Date.now();
      return addDispatch({
        ...rec, 독차: dokchaOn(rec), createdAt: now, updatedAt: now,
        createdByUid: auth.currentUser?.uid || null, createdByEmail: auth.currentUser?.email || null,
        createdByName: myRealName || myNameNow(auth.currentUser?.displayName || auth.currentUser?.email) || null,
        companyName: userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY,
      });
    },
  };
  const approveEditRequestSafe = isViewer ? _viewerBlock : approveEditRequestPC;
  const rejectEditRequestSafe = isViewer ? _viewerBlock : rejectEditRequestPC;
  const upsertDriverSafe = isViewer ? _viewerBlock : upsertDriver;
  const removeDriverSafe = isViewer ? _viewerBlock : removeDriver;
  const upsertClientSafe = isViewer ? _viewerBlock : upsertClient;
  const removeClientSafe = isViewer ? _viewerBlock : removeClient;
  const upsertPlaceSafe = isViewer ? _viewerBlock : upsertPlace;
  // user(실무자): 배차/기사/거래처 업무 가능, 재무/관리 메뉴 차단
  const userBlockedMenus = [
    "매출관리", "정산관리", "관리자메뉴",
  ];
  // test(경리/회계): 배차현황/기사/거래처/홈/정산관리 가능, 배차입력/운임표/관리 차단
  const testBlockedMenus = [
    "배차관리", "실시간배차현황", "단가표", "관리자메뉴",
  ];
  // viewer(조회전용): 관리센터만 차단
  const viewerBlockedMenus = ["관리센터"];

  const blockedMenus = role === "test" ? testBlockedMenus : isViewer ? viewerBlockedMenus : userBlockedMenus;

  // ⌨️ F1/F2/F3 단축키로 자주 쓰는 메뉴(배차관리/실시간배차현황/배차현황) 바로 이동
  useEffect(() => {
    const handler = (e) => {
      const map = { F1: "배차관리", F2: "실시간배차현황", F3: "배차현황" };
      // 🎨 2026-11-18 컨테이너 · 해상 · 항공 화면에서는 그 업무의 오더등록 · 실시간현황 · 운송현황으로
      const fb = window.__kpBizNow; const bmap = { F1: "new", F2: "live", F3: "list" };
      if (["container", "sea", "air"].includes(fb) && bmap[e.key]) { e.preventDefault(); setMenu(bizMenuKey(fb, bmap[e.key])); return; }
      const target = map[e.key];
      if (!target) return;
      e.preventDefault();
      if (role === "test" && testBlockedMenus.includes(target)) return;
      setMenu(target);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [role]);


  // 역할이 바뀌어 현재 메뉴가 차단 목록에 포함되면 HOME으로 이동
  useEffect(() => {
    if (role === "shipper" && user?.email !== "tjddnqkf@naver.com") { navigate("/shipper", { replace: true }); return; }
    if ((role === "user" || role === "test" || isViewer) && blockedMenus.includes(menu)) {
      setMenu("HOME");
    }
  }, [role]);

  // 🔎 2026-11-27 화면 전환 역할(통합관리자 · 최고관리자 · 통합인사관리자) — 다른 화면에만 있는 메뉴 → 그 화면 키
  //  통합 검색(Ctrl + K) · 도움말 센터에서 찾을 수 있게 하고, 누르면 그 화면으로 바꿔서 연다(handleMenuClick)
  const otherViewMenus = React.useMemo(() => {
    const out = {};
    const views = roleView.views;
    if (!views || execHome) return out;
    const cur = roleView.view || views[0][0];
    const DISPATCH_ONLY = ["배차관리", "실시간배차현황", "배차현황", "단가표", "운임조회", "기사관리", "거래처관리", "매출관리", "지입차관리"];
    if (cur !== "dispatch" && views.some(([k]) => k === "dispatch")) DISPATCH_ONLY.forEach((m) => { out[m] = "dispatch"; });
    views.forEach(([k]) => { if (k !== cur && DEPT_MENUS[k] && k !== "exec") DEPT_MENUS[k].forEach((m) => { if (!(m in out)) out[m] = k; }); });
    return out;
  }, [roleView.views, roleView.view, execHome]);
  // ---------------- 메뉴 클릭 제어 ----------------
  const handleMenuClick = async (m) => {
    // ✋ 작성 중인 문서(전자결재·증명서 등)가 있으면 먼저 저장할지 묻는다
    if (m !== menu && !(await confirmLeave())) return;
    if (MENU_FEATURE[m] && !planIncludes(planId, MENU_FEATURE[m])) { openPlanLock(MENU_FEATURE[m]); return; }
    // 🧾 2026-11-14 운송 화면에서 정산관리 바로가기(홈 카드 · 검색)를 누르면 경리 화면으로 바꿔서 연다
    //  🔎 2026-11-27 검색에서 고른 다른 화면 메뉴(지금 화면엔 없는 메뉴)도 그 화면으로 바꿔서 연다
    const toView = switchViewFor(realRole, roleView.view, m) || (menuState(m) !== "ok" ? otherViewMenus[m] || "" : "");
    if (toView) { roleView.setView(toView); React.startTransition(() => setMenu(m)); return; }
    if (!deptMode && (role === "user" || role === "test") && blockedMenus.includes(m)) return;
    if (m !== "매출관리") setRevenueUnlocked(false);
    React.startTransition(() => setMenu(m));
  };
  // 🗂 2026-11-04 다른 화면(전자결재 › 인사발령 품의 [인사발령 화면 열기])에서 메뉴 이동 요청 — kp-go-menu(detail: 메뉴 이름)
  const menuClickRef = React.useRef(handleMenuClick);
  menuClickRef.current = handleMenuClick;
  React.useEffect(() => {
    const h = (e) => { if (e?.detail) menuClickRef.current(e.detail); };
    window.addEventListener("kp-go-menu", h);
    return () => window.removeEventListener("kp-go-menu", h);
  }, []);
  // 🏦 2026-11-19 자금관리 › 통장 내역 [미수금과 맞추기] — 정산관리 › 거래처정산 › 미수금관리로 가서 올린 입금으로 자동 매칭 창을 연다
  React.useEffect(() => {
    // 🧩 2026-11-27 거래처정산은 따로 떼어 낸 화면(src/dispatch/ClientSettlement.jsx) — 화면 파일을 받은 뒤 열기 신호를 보낸다(받아 둔 뒤엔 예전과 같은 시간)
    const h = (e) => {
      const deps = e?.detail?.deposits;
      if (!Array.isArray(deps) || !deps.length) return;
      e.detail.handled = true;
      menuClickRef.current("정산관리");
      setTimeout(() => { set정산관리Tab("거래처정산"); ClientSettlement.preload().catch(() => {}).then(() => setTimeout(() => window.dispatchEvent(new CustomEvent("kp-settle-open", { detail: { tab: "unsettledMonth", deposits: deps } })), 160)); }, 80);
    };
    window.addEventListener("kp-bank-ar-match", h);
    return () => window.removeEventListener("kp-bank-ar-match", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 🔙 2026-11-27 PC 브라우저 [뒤로] — 메뉴 이동 · 화면 전환을 브라우저 기록에 쌓는다(예전엔 한 번 누르면 프로그램 밖으로 나갔다)
  //  주소는 그대로 두고 기록의 state(kpNav: 메뉴 · 화면)만 남긴다 — [뒤로]/[앞으로]를 누르면 그 메뉴 · 화면으로 돌아간다
  const navPopRef = React.useRef(false);
  const navNowRef = React.useRef({ m: menu, v: roleView.view || "" });
  navNowRef.current = { m: menu, v: roleView.view || "" };
  React.useEffect(() => {
    const cur = { m: menu, v: roleView.view || "" };
    if (navPopRef.current) { navPopRef.current = false; return; }
    let st = null;
    try { st = window.history.state || {}; } catch { return; }
    const was = st.kpNav;
    if (was && was.m === cur.m && was.v === cur.v) return;
    try {
      if (!was) window.history.replaceState({ ...st, kpNav: cur }, "");
      else window.history.pushState({ ...st, kpNav: cur }, "");
    } catch { /* 무시 */ }
  }, [menu, roleView.view]);
  React.useEffect(() => {
    const onPop = (e) => {
      const nav = e.state?.kpNav;
      if (!nav || !nav.m) return; // 프로그램 첫 화면보다 더 뒤 — 브라우저 기본 동작
      const now = navNowRef.current;
      const viewChange = !!nav.v && !!roleView.views && nav.v !== now.v && roleView.views.some(([k]) => k === nav.v);
      if (!viewChange && nav.m === now.m) return;
      navPopRef.current = true;
      if (viewChange) roleView.setView(nav.v);
      setMenu(nav.m);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [roleView.views, roleView.setView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sideMenuOpen, setSideMenuOpen] = React.useState(false);
  const closeSideMenu = React.useCallback(() => setSideMenuOpen(false), []);


  // 화물내용 +추가 팝업 (공통)
  const [cargoAddPopup, setCargoAddPopup] = React.useState(null);
  const [_cargoAddQty, _setCargoAddQty] = React.useState("");
  const [_cargoAddType, _setCargoAddType] = React.useState("");
  const [_cargoEditValue, _setCargoEditValue] = React.useState("");
  // ⭐ 2026-11-02 한글 입력 중(조합 중) Enter — 윈도우 크롬은 이 Enter를 "Process"(229)로 보내 추가가 안 되던 원인.
  //   조합 중 Enter면 표시만 해 두고, 글자 조합이 끝나는 순간(compositionend) 최종 글자로 추가한다.
  const _cargoComposingRef = React.useRef(false);
  const _cargoEnterAfterImeRef = React.useRef(false);
  // 화주사 수정요청 승인/거절 팝업 (T161 — window.confirm 대신 프로그램 디자인에 맞춘 모달)
  const [editReqPopup, setEditReqPopup] = React.useState(null);
  React.useEffect(() => { if (cargoAddPopup) _setCargoEditValue(cargoAddPopup.initialValue || ""); }, [cargoAddPopup]);
  // ⭐ 2026-11-02 화물내용 추가 팝업이 떠 있는 동안 Enter/Esc는 팝업 몫 — 포커스가 팝업 밖(바탕)에 있어도
  //   뒤에 깔린 등록폼·복사/수정 패널이 Enter로 저장되거나 Esc로 같이 닫히지 않게 가장 먼저(capture) 가로챈다.
  const cargoPopupOpen = !!cargoAddPopup;
  React.useEffect(() => {
    if (!cargoPopupOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
        setCargoAddPopup(null); _setCargoAddQty(""); _setCargoAddType("");
        return;
      }
      const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
      if (!isEnter) return;
      const t = e.target;
      if (t && t.closest && t.closest("[data-cargo-popup]")) return; // 팝업 안 입력칸·버튼은 각자 처리
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      document.querySelector("[data-cargo-add-input]")?.focus?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cargoPopupOpen]);

  // ---------------- 화주사 푸시 알림 (상차 임박 시 화주사가 보낸 푸시 — 확인 전까지 중앙 팝업 유지) ----------------
  // ⚡ 렌더마다 dispatchData 전체를 filter/sort 하지 않도록 useMemo로 스코프 (pendingShipperRequests와 동일 패턴)
  const pendingNudges = React.useMemo(
    () => (dispatchData || []).filter(r => r.재촉대기 === true),
    [dispatchData]
  );
  const activeNudge = React.useMemo(() => (
    pendingNudges.length > 0
      ? [...pendingNudges].sort((a, b) => {
          const ma = typeof a.재촉일시 === "number" ? a.재촉일시 : 0;
          const mb = typeof b.재촉일시 === "number" ? b.재촉일시 : 0;
          return ma - mb;
        })[0]
      : null
  ), [pendingNudges]);

  // ---------------- 화주사 수정요청/기사취소요청 중앙 팝업 (재촉 알림과 동일 패턴) ----------------
  // "확인" 버튼은 승인/거절이 아니라 알림 자체만 닫는다 — 실제 승인/거절은 기존 뱃지 클릭 팝업에서 처리한다.
  // ⚡ patchDispatch의 Firestore 왕복(onSnapshot)을 기다리면 dispatchData 전체가 갱신될 때까지
  // 팝업이 닫히지 않아 끊김처럼 느껴진다 — 클릭 즉시 로컬에서 숨기고, 실제 쓰기는 백그라운드로 보낸다.
  const [dismissedReqAlertIds, setDismissedReqAlertIds] = React.useState(() => new Set());
  const pendingReqAlerts = React.useMemo(
    () => (dispatchData || []).filter(
      r => !dismissedReqAlertIds.has(r._id) &&
        ((r.수정요청 === true && !r.수정요청알림확인) || (r.취소요청 === true && r.배차상태 !== "배차취소" && !r.취소요청알림확인))
    ),
    [dispatchData, dismissedReqAlertIds]
  );
  const activeReqAlert = React.useMemo(() => (
    pendingReqAlerts.length > 0
      ? [...pendingReqAlerts].sort((a, b) => {
          const ma = typeof a.수정요청일시?.seconds === "number" ? a.수정요청일시.seconds * 1000 : (typeof a.취소요청일시?.seconds === "number" ? a.취소요청일시.seconds * 1000 : 0);
          const mb = typeof b.수정요청일시?.seconds === "number" ? b.수정요청일시.seconds * 1000 : (typeof b.취소요청일시?.seconds === "number" ? b.취소요청일시.seconds * 1000 : 0);
          return ma - mb;
        })[0]
      : null
  ), [pendingReqAlerts]);
  const activeReqAlertIsEdit = !!activeReqAlert?.수정요청;

  // ---------------- 메뉴 UI ----------------
  // 메뉴 보이기 규칙(상단 메뉴·왼쪽 메뉴 공용) — "hidden" | "blocked" | "ok"
  const menuState = (m) => {
    // 💳 2026-11-09 요금제 잠금을 맨 먼저 — 예전엔 부서 메뉴(인사관리부·회계관리 등)·임원 메뉴가 아래에서 먼저 "ok"로 끝나 요금제와 상관없이 열렸다
    if (MENU_FEATURE[m] && !planIncludes(planId, MENU_FEATURE[m])) return "locked";
    if (hiddenInSwitchView(realRole, roleView.view, m) || builtinHidesMenu(role, m, !!customRole)) return "hidden"; // 🧾 2026-11-14 통합 · 최고관리자 운송 화면엔 정산관리 없음(경리 화면에서)
    if (workScope) { if (!scopeAllows(workScope, m)) return "hidden"; if (isOfficeBaseMenu(m)) return "ok"; } // 🗂 업무 범위 — 사내업무 계정은 배차 메뉴를 모두 숨긴다(경리 메뉴는 아래 권한 판정 그대로)
    if (isBizMenu(m)) return parseBizMenu(m).biz === biz ? "ok" : "hidden"; // 🧭 2026-11-12 업무 영역 메뉴(컨테이너 · 해상 · 항공 · 통합)
    // 📊 2026-11-06 일일 경영 보고 — 임원 화면 역할만(기존 임원 판정 isExec 그대로)
    if (m === BRIEF_MENU) return canBriefing ? "ok" : "hidden";
    if (m === PF_MENU) return pfGrant.on && !workScope ? "ok" : "hidden"; // 🔐 2026-11-18 비공개 운임 — 관리자센터에서 지정한 사람만(PrivateFareVault 가 비밀번호로 한 번 더)
    if (EXEC_MENUS.includes(m)) return deptMode === "exec" ? "ok" : "hidden"; // 📈 2026-11-08 임원 화면만
    // 🏢 2026-10-31 부서 모드 — 경리·인사 권한은 배차 메뉴 없이 부서 업무 메뉴만
    // ⚙ 권한 관리에서 경리·인사관리자 메뉴를 숨겼으면 부서 화면에서도 숨긴다
    if (deptMode && deptMode !== "exec") return (DEPT_MENUS[deptMode].includes(m) && !(customRole && getMenuAccess(customRoles, role, m) === "hidden") ? "ok" : "hidden");
    // 👔 임원 화면 — 임원 메뉴만, 그 안에서 권한 규칙은 그대로
    if (deptMode === "exec" && !DEPT_MENUS.exec.includes(m)) return "hidden";
    // 💰 자금현황은 대표 직책(대표·대표이사·사장)만
    if (m === "자금현황") return deptMode === "exec" && (forceExec || isCeoPosition(myProfileDoc?.position)) ? "ok" : "hidden";
    // ⚙ 직접 만든 권한(권한 관리 › 새 역할)은 부서 메뉴도 켜고 끌 수 있다
    // ⭐ 2026-11-01 직접 만든 역할 + 운송사별 권한 설정에서 켠 기본 역할(예: A운송사 관리자에게 인사관리부)
    const ownOk = (x) => !!customRole && getMenuAccess(customRoles, role, x) !== "hidden";
    if (["결재함", "스케줄"].includes(m)) return deptMode === "exec" ? "ok" : "hidden";
    if (m === "직원일정") return deptMode === "exec" || ownOk(m) ? "ok" : "hidden";
    if (m === "영업관리") return deptMode === "exec" || ownOk(m) ? "ok" : "hidden"; // 💼 2026-11-10 영업 화면 · 임원 화면 · 그 메뉴를 켠 역할만
    if (m === "전자결재") return ownOk(m) ? "ok" : "hidden"; // 일반 화면은 홈 › 전자결재
    // ⭐ 2026-10-31 경리·인사 부서 메뉴는 그 부서 권한(또는 그 메뉴를 켠 직접 만든 권한)에서만
    if (["회계관리", "인사관리부", "출근기록부", "직원관리", "기사서류", "자금관리", "비품관리", "연차관리", "입퇴사관리", "증명서발급"].includes(m)) return ["회계관리", "자금관리", "비품관리", "인사관리부", "증명서발급"].includes(m) && ownOk(m) ? "ok" : "hidden";
    // ⭐ 2026-11-04 회사 마스터가 권한 관리에서 관리자 메뉴를 숨겨도 본인은 잠기지 않게(다시 고칠 수 있도록)
    if (m === "관리자메뉴" && role === "admin" && myProfileDoc?.isMaster === true) return "ok";
    // 🔒 2026-11-27 눌러도 열리지 않는 메뉴는 숨긴다(handleMenuClick 과 같은 조건) — 권한 관리에 운송사무원 설정을 저장한 회사는 매출관리가 보이는데 눌러도 반응이 없었다
    if (!deptMode && (role === "user" || role === "test") && blockedMenus.includes(m)) return "hidden";
    if (customRole && getMenuAccess(customRoles, role, m) === "hidden") return "hidden";
    const isBlocked = !customRole && (role === "user" || role === "test" || isViewer) && blockedMenus.includes(m);
    if (m === "관리자메뉴" && role !== "admin" && role !== "totalMaster" && role !== "viewer") return "hidden"; // 🔒 2026-11-14 예전 !isViewer — 지금 보는 메뉴가 '조회'면 운송사무원 등에게도 관리자메뉴가 보였다
    // ⭐ 2026-10-29 관리센터는 별도 화면(/platform, 관리자 관리센터)으로 옮겼다 — 배차 프로그램 메뉴에서는 숨김
    if (m === "관리센터") return "hidden";
    // 💎 인사이트(마진 분석)는 관리자만
    if (m === "인사이트" && role !== "admin" && role !== "totalMaster" && !isExec) return "hidden";
    // 💳 요금제에 없는 메뉴는 잠금(눌러도 들어가지 않고 요금제 안내가 뜬다)
    if (MENU_FEATURE[m] && !planIncludes(planId, MENU_FEATURE[m])) return "locked";
    // 🔒 2026-11-14 막힌 메뉴는 숨긴다 — 예전엔 운송사무원에게 매출관리 · 정산관리 · 관리자메뉴가 회색으로 보였다(모바일은 원래 안 보임)
    return isBlocked ? "hidden" : "ok";
  };
  // 🛠 2026-11-13 인사이트는 요금제에 없으면 잠금 표시 대신 메뉴 자체를 안 보이게(상단 · 왼쪽 메뉴)
  const menuShown = (m) => { const st = menuState(m); return m === "인사이트" && st === "locked" ? "hidden" : st; };
  // 📥 2026-11-16 배차마감 도착 — 정산관리를 볼 수 있는 사람에게 숫자 · 배너
  const closeInbox = useCloseInbox((localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim(), menuState("정산관리") === "ok");
  const closeInboxN = closeInbox.count;
  // 🔒 최종마감 잠금(오더 저장 · 삭제 공통 검사기) — 경리 · 회계 · 정산 팀과 최고관리자는 그대로 고칠 수 있다
  useFinalLockGuard((localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim(),
    role === "totalMaster" || realRole === "totalMaster" || ["hrAcct", "allMgr"].includes(realRole) || /경리|회계|정산/.test(String(myProfileDoc?.team || "")));
  // 🛠 2026-11-17 로그인 확인 중 화면 — 모든 Hook 다음에 둔다(앞에 두면 로그인 직후 Hook 개수가 바뀌어 화면 오류가 났다)
  if (!user) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-gray-500">
        로그인 정보를 확인하고 있습니다…
      </div>
    );
  }
return (
    <PlanValueProvider planId={planId} company={planCompany}>
    <OrderHistoryContext.Provider value={orderHistoryApi}>
    <EditModeProvider role={role} userCompany={userCompany}>
    <ToastProvider>
      <CustomAlert message={alertMsg} onClose={closeAlert} />
      {/* ⭐ 첫 진입 로딩 화면 — 뒤에서 홈 화면·데이터가 다 준비되는 동안 덮고 있다가, 전부 100%가 되면 걷힌다 */}
      {!pcBootDone && <PcBootOverlay dept={deptMode} onDone={() => setPcBootDone(true)} />}
      {/* ⭐ PC는 실시간으로 계속 반영되므로 상단 중앙 "오더 불러오는 중" 표시는 띄우지 않는다(표시가 뜨고 지며 화면이 끊겼다) */}
      {false && historyLoading > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999998] px-4 py-2 rounded-full bg-[#1B2B4B] text-white text-[13px] font-bold shadow-lg flex items-center gap-2 pointer-events-none">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          오더 불러오는 중
        </div>
      )}
      {weekendCheckPopup && (
        <div className="fixed inset-0 bg-black/40 z-[999999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="text-[16px] font-black text-[#1B2B4B] mb-2">주말 출근 확인</div>
            <div className="text-[13px] text-gray-500 mb-5">오늘은 주말입니다. 출근 처리하시겠습니까?</div>
            <div className="flex gap-2">
              <button onClick={() => handleWeekendCheckIn(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-bold hover:bg-gray-50">아니오 (휴무)</button>
              <button onClick={() => handleWeekendCheckIn(true)}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60]">예 (출근)</button>
            </div>
          </div>
        </div>
      )}
      <div className={`w-full overflow-x-hidden ${darkMode ? "" : "kp-pc"} ${deptMode === "exec" ? "kp-exec" : ""}`}>
      <KpSideMenu
        open={sideMenuOpen}
        onOpen={() => setSideMenuOpen(true)}
        onClose={closeSideMenu}
        menuState={menuShown}
        active={menu}
        onSelect={handleMenuClick}
        company={role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany || "") : (userCompany || localStorage.getItem("userCompany") || "")}
        email={user?.email}
        myName={myRealName || user?.displayName || ""}
        groups={bizSideGroups(biz) || (deptMode ? DEPT_SIDE_GROUPS[deptMode] : (bizMods.list.length > 1 ? [...KP_SIDE_GROUPS.slice(0, 1).map((g) => ({ ...g, items: [...g.items, bizMenuKey("inland", "handoff")] })), ...KP_SIDE_GROUPS.slice(1)] : KP_SIDE_GROUPS))}
      />
      <BannerCenter />
      {/* ✉️ 2026-11-08 발신 메일 — 보내다가 "설정 없음"이면 안내 창 · 예전 공용 계정을 쓰던 회사 관리자에게 등록 안내 */}
      <MailSetupHost company={userCompany || localStorage.getItem("userCompany") || ""} role={realRole || role} isMaster={myProfileDoc?.isMaster === true} />
      {/* ⭐ 2026-11-03 알림 통합 — 새 공지·인사발령·결재 요청/결과·인수인계는 가운데 팝업(하나씩 · 최신 것부터) · [바로 가기]는 그 메뉴로 */}
      <NotifyCenter uid={user?.uid} role={realRole || role} team={myProfileDoc?.team || ""} company={deptCompany} exec={!!(isExec || deptMode === "exec" || isCeoPosition(myProfileDoc?.position))} name={myRealName || myProfileDoc?.name || ""}
        onGo={(it) => {
          if (it.src === "approval") { window.__kpOpenApproval = { id: it.id, page: it.page || "inbox" }; window.dispatchEvent(new Event("kp-open-approval")); return; }
          if (it.src === "handover") { window.__kpOpenHandover = it.id; setMenu("HOME"); setTimeout(() => window.dispatchEvent(new Event("kp-open-handover")), 0); return; }
          // ⭐ 2026-11-06 인사·급여 알림 — ⭐ 2026-11-07 급여명세서 · 연차 사용 계획(직원)은 회사관리 › 내정보 안의 탭, 연차 사용 촉진(인사)은 인사관리부 › 연차 관리
          if (it.src === "hrNotice") {
            if (it.link === "leavePromo") { try { sessionStorage.setItem("kpHrTab", "leave"); sessionStorage.setItem("kpLeaveTab", "promo"); } catch { /* 무시 */ } handleMenuClick("인사관리부"); setTimeout(() => { window.dispatchEvent(new Event("kp-hr-tab")); window.dispatchEvent(new Event("kp-leave-tab")); }, 0); return; }
            try { sessionStorage.setItem("kpCmTab", "내정보"); sessionStorage.setItem("kpMyInfoTab", it.link === "leavePlan" ? "연차 사용 계획" : "급여명세서"); } catch { /* 무시 */ }
            setMenu("회사관리"); setTimeout(() => { window.dispatchEvent(new Event("kp-cm-tab")); window.dispatchEvent(new Event("kp-myinfo-tab")); }, 0); return;
          }
          window.__kpOpenNotice = it.openId || it.id; setMenu("HOME"); setTimeout(() => window.dispatchEvent(new CustomEvent("kp:openNotice")), 0);
        }} />
      {!dispatchAlertsOff && <DriverEventToasts onView={onDriverEventView} />}{/* 🗂 2026-11-17 경리업무만이면 기사 알림 토스트도 숨김 · */}{/* ⭐ 2026-11-05 기사 수락/거절·서류·긴급 — 오른쪽 아래 토스트(포커스 안 뺏음 · 8초) */}
      <CheckoutReminderHost uid={user?.uid} role={role} email={user?.email} />{/* ⭐ 2026-11-03 퇴근 10분 전 알림 */}
      <PersonalTodayHost uid={user?.uid} />{/* ⭐ 2026-11-03 오늘 개인 일정 — 오른쪽 아래 배너 */}
      {/* ⭐ 2026-11-02 원격지원 — 요청 상태 막대 · 승인 배너 · 화면 공유 · 포인터(앱 전체에 한 번) */}
      <RemoteSupportHost user={user} profile={myProfileDoc} company={userCompany || localStorage.getItem("userCompany") || ""} />
      <OrderCongratsPopup uid={user?.uid} profile={myProfileDoc} />
      <BirthdayPopup uid={user?.uid} profile={myProfileDoc} company={deptCompany} />
      {/* 📊 2026-11-06 일일 경영 보고 — 받는 시간 이후 그날 첫 접속 때 요약 팝업(임원 화면 역할) */}
      {canBriefing && <DailyReportPopupHost company={deptCompany} dispatchData={salesDispatchData} drivers={drivers} me={{ uid: user?.uid }} role={realRole || role} isExec={isExec} customRole={customRole} profile={myProfileDoc} onOpenReport={() => handleMenuClick(BRIEF_MENU)} />}
      {/* ⭐ 2026-11-02 관리자센터2 — 선택한 운송사 대상 공지도 받도록 회사 전달 */}
      {/* ⭐ 2026-11-03 배너를 누르면 펼치지 않고 홈 › 공지사항의 그 글로 바로 이동 */}
      <PlatformNoticeBanner audience="carrier" onOpen={(id) => { window.__kpOpenNotice = `plat:${id}`; setMenu("HOME"); setTimeout(() => window.dispatchEvent(new CustomEvent("kp:openNotice")), 0); }} company={role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany || "") : (userCompany || localStorage.getItem("userCompany") || "")} />
      {/* ⭐ 2026-11-06 이용 계약 만료 안내(30일 전부터) — 대표·임원·경리·마스터에게만 */}
      <ContractExpiryBanner company={deptCompany} me={myProfileDoc ? { ...myProfileDoc, role: realRole || role } : null} />
      <CopyTemplateHost canEdit={role === "admin" || role === "totalMaster"} />
      <PlanValueSync planId={planId} />
      <PlanLockHost userEmail={user?.email || ""} userName={myRealName || ""} canRequest={role === "totalMaster" || ["test", "hrAcct", "allMgr"].includes(realRole) || /경리|회계/.test(String(myProfileDoc?.team || ""))} />
      <OnboardingHost role={role} realRole={realRole} userCompany={userCompany} dept={deptMode} uid={user?.uid} myDoc={myProfileDoc} />
      {/* ===== 통합 헤더 네비 ===== */}
      <header className={`kp-topnav ${deptMode === "exec" ? "kp-topnav-exec" : ""} sticky top-0 z-50 mb-6 w-full`}>

        {/* 상단바: 로고 + 메뉴 + 유저 */}
        <div className="flex items-center gap-3 px-6 h-[60px]">

          {/* 좌측 로고 */}
          {(() => {
            const co = role === "totalMaster"
              ? (localStorage.getItem("loginCompany") || userCompany || "")
              : (userCompany || localStorage.getItem("userCompany") || "");
            return (
              <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                {/* ⭐ 2026-11-03 로고·LogisWeb을 누르면 회사 홈페이지로 (2026-11-04 LogisWeb 마크 + 글자 로고) */}
                <a href="https://www.logisweb.co.kr/" title="LogisWeb 홈페이지로" className="flex items-center gap-2.5 shrink-0 rounded-xl hover:opacity-90 transition">
                  <LogisMark size={32} spot="topnav" style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))" }} />
                  <LogisWordmark height={12} sub="dispatch" spot="topnav" />
                </a>
                {/* 🧭 2026-11-16 회사명 + 내 이름 · 직급 한 칸 = [내 메뉴] — 마우스를 올리거나 누르면 사내메일함 · 알림 내역 · 내 정보 · 원격 지원
                     새 버전이 나오면 이 칸이 [새 버전 · 눌러서 업데이트]로 바뀌고, 누르면 바로 업데이트(메뉴는 마우스를 올리면 그대로 열림) */}
                {/* 🧭 2026-11-27 회사명 · 이름 칸은 오른쪽 끝으로 옮김(알림 · 이름 모양) — 화면 설정 · 로그아웃도 그 안에 */}
                {coSwitchOpen && <React.Suspense fallback={null}><CompanySwitcherLazy current={co} onClose={() => setCoSwitchOpen(false)} /></React.Suspense>}
                {multiCoOpen && <MultiCompanySwitch onClose={() => setMultiCoOpen(false)} />}
                {/* 🛰 2026-11-10 버전 표시·새 버전 안내는 왼쪽 메뉴(KpSubNav) 머리·맨 아래로 옮김 */}
                <EditModeToggleButton className="ml-1" />
              </div>
            );
          })()}

          {/* 중앙 메뉴 */}
                     {/* ★ 태블릿/PC 공용 메뉴 — 전체 가로 스크롤 보장 */}
          {/* ⭐ 2026-11-02 화면 점검 — 메뉴가 넘치면 좌우 흐림 + ‹ › 버튼 표시(감싸는 relative 상자) */}
          <div className="relative flex-1 min-w-0 flex items-center">
          <nav data-tour="nav-menu"
            ref={navScrollRefCb}
            onScroll={updateNavOverflow}
            /* ⭐ 가운데 정렬은 justify-center 대신 양끝 auto 여백으로 — justify-center는 화면이 좁으면 맨 앞(HOME)·맨 뒤 메뉴가 잘리고 스크롤로도 안 보였다 */
            className="flex-1 flex items-center overflow-x-auto [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
            /* 노트북처럼 메뉴가 다 안 들어가는 화면 — 마우스 휠을 굴리면 메뉴가 옆으로 넘어간다 */
            onWheel={(e) => { const el = e.currentTarget; if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY; }}
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              flexWrap: "nowrap",
              minWidth: 0,
            }}
          >
            <div className="kp-nav-track inline-flex items-center gap-0.5 min-[2050px]:gap-1 p-1 rounded-[14px] shrink-0">
            {(() => { const navList = uiMenuList("pc", bizMenus || (deptMode ? DEPT_MENUS[deptMode] : [
              "HOME",
              "배차관리",
              "실시간배차현황",
              "배차현황",
              ...(bizMods.list.length > 1 ? [bizMenuKey("inland", "handoff")] : []), // 🧭 다른 팀(해상 · 항공 · 컨테이너)이 넘긴 내륙 구간
              "단가표",
              "운임조회",
              "기사관리",
              "거래처관리",
              "지입차관리",
              "매출관리",
              "정산관리",
              "인사이트",
              "비공개운임", // 🔐 2026-11-18 최고관리자가 지정한 사람만(menuState)
              // 직접 만든 권한에서 켠 부서 메뉴만 보인다(그 외에는 menuState가 숨김)
              "전자결재",
              "영업관리",
              "회계관리",
              "자금관리",
              "비품관리",
              "인사관리부",
              "증명서발급",
              "회사관리",
              "관리자메뉴",
              "관리센터",
            ]));
            const navNOf = (m) => {
              const apSep = (deptMode ? DEPT_MENUS[deptMode].includes("전자결재") : true) && menuState("전자결재") !== "hidden";
              const apN = (apCountsNav.todo || 0) + (apCountsNav.mineNew || 0);
              return m === "HOME" ? (mailCountsNav.unread || 0) + (alertsNav.handover || 0) + (apSep ? 0 : apN)
                : m === "전자결재" ? apN + (alertsNav.handover || 0)
                : m === "기사관리" ? (canApproveSignup ? alertsNav.signupDriver || 0 : 0) + drvCounts.docs
                : m === "실시간배차현황" ? navDrvOrders
                : m === "배차현황" ? navDrvOrders + navUnseenDispatch
                : m === "지입차관리" ? navDrvSos
                : m === "관리자메뉴" ? pendingStaffSignups
                : m === "정산관리" ? closeInboxN : 0;
            };
            const subBadgesOf = (m) => {
              const apSep = (deptMode ? DEPT_MENUS[deptMode].includes("전자결재") : true) && menuState("전자결재") !== "hidden";
              return ({
                HOME: { 공지사항: alertsNav.notice || 0, "ap:inbox": apSep ? 0 : apCountsNav.todo, "ap:mine": apSep ? 0 : apCountsNav.mineNew, "ap:handover": alertsNav.handover || 0, mail: mailCountsNav.unread || 0, teamsched: 0 }, // 🔢 2026-11-15 상단 HOME 숫자(사내메일 · 인수인계 · 내 기안)가 어느 속메뉴 것인지 보이게
                전자결재: { inbox: apCountsNav.todo, mine: apCountsNav.mineNew, handover: alertsNav.handover },
                기사관리: { "acc:pending": canApproveSignup ? alertsNav.signupDriver : 0, "docs:driver": drvCounts.docs },
                배차현황: { 배차현황: navDrvOrders, 미배차현황: navUnseenUnassigned, 고정노선현황: navUnseenFixed },
                지입차관리: { tracking: navDrvSos },
                관리자메뉴: { members: pendingStaffSignups },
                정산관리: { 거래처정산: closeInboxN },
              })[m];
            };
            const navLabelOf = (m) => uiMenuLabel("pc", m, m === BRIEF_MENU ? BRIEF_LABEL : execMenuLabel(m));
            const renderOne = (m) => {
              const st = menuShown(m);
              if (st === "hidden") return null;
              const isBlocked = st === "blocked";
              const isActive = menu === m;
              // 🔢 메뉴 숫자 — 전자결재가 상단에 따로 없으면(일반 배차 화면) 결재 숫자는 HOME에 더한다
              const apSep = (deptMode ? DEPT_MENUS[deptMode].includes("전자결재") : true) && menuState("전자결재") !== "hidden";
              const apN = (apCountsNav.todo || 0) + (apCountsNav.mineNew || 0);
              // ⭐ 2026-11-05 기사앱 이벤트 숫자 — 수락/거절(실시간배차현황·배차현황) · 서류 제출(기사관리) · 긴급(지입차관리)
              const navN = m === "HOME" ? (mailCountsNav.unread || 0) + (alertsNav.handover || 0) + (apSep ? 0 : apN)
                : m === "전자결재" ? apN + (alertsNav.handover || 0)
                : m === "기사관리" ? (canApproveSignup ? alertsNav.signupDriver || 0 : 0) + drvCounts.docs
                : m === "실시간배차현황" ? navDrvOrders
                : m === "배차현황" ? navDrvOrders + navUnseenDispatch /* ⭐ 2026-11-06 안 본 미배차·고정노선 미배차 */
                : m === "지입차관리" ? navDrvSos
                : m === "관리자메뉴" ? pendingStaffSignups
                : m === "정산관리" ? closeInboxN : 0;
              const subBadges = {
                HOME: { 공지사항: alertsNav.notice || 0, "ap:inbox": apSep ? 0 : apCountsNav.todo, "ap:mine": apSep ? 0 : apCountsNav.mineNew, "ap:handover": alertsNav.handover || 0, mail: mailCountsNav.unread || 0, teamsched: 0 }, // 🔢 2026-11-15 상단 HOME 숫자(사내메일 · 인수인계 · 내 기안)가 어느 속메뉴 것인지 보이게
                전자결재: { inbox: apCountsNav.todo, mine: apCountsNav.mineNew, handover: alertsNav.handover },
                기사관리: { "acc:pending": canApproveSignup ? alertsNav.signupDriver : 0, "docs:driver": drvCounts.docs },
                배차현황: { 배차현황: navDrvOrders, 미배차현황: navUnseenUnassigned, 고정노선현황: navUnseenFixed }, // ⭐ 2026-11-06 안 본 것만
                지입차관리: { tracking: navDrvSos },
                관리자메뉴: { members: pendingStaffSignups },
                정산관리: { 거래처정산: closeInboxN },
              }[m];
              return (
                <NavHover key={m} menu={m} badges={subBadges} disabled={isBlocked || st === "locked"} onOpenMenu={() => handleMenuClick(m)}>
                <button
                  disabled={isBlocked}
                  onClick={() => handleMenuClick(m)}
                  data-on={isActive ? "1" : "0"}
                  className={`kp-nav-btn relative inline-flex items-center gap-1.5 ${deptMode && DEPT_MENUS[deptMode].length <= 8 ? "px-3" : "px-[6px] min-[1700px]:px-[7px]" /* ⭐ 2026-11-02 화면 점검 — 1700 미만은 조금 촘촘하게(text-[13px]은 index.css에서 15px로 바뀌므로 12.75px 사용) */} h-[34px] rounded-[10px] text-[12.75px] min-[1700px]:text-[13.5px] min-[2050px]:text-[14px] min-[2050px]:px-3 whitespace-nowrap transition-all flex-shrink-0
                    ${isBlocked
                      ? "text-white/20 cursor-not-allowed"
                      : isActive
                        ? "kp-nav-on font-extrabold"
                        : "text-white/70 font-semibold hover:text-white hover:bg-white/[0.08]"
                    }`}
                >
                  <ShellIcon name={kpNavIcon(m) || "dashboard"} size={14} className={`kp-nav-ico shrink-0 ${isActive ? "" : "opacity-70"} ${deptMode && DEPT_MENUS[deptMode].length <= 8 ? "" : "hidden min-[2050px]:inline-block"}`} />
                  <EditableText id={`nav.${m}`} defaultText={uiMenuLabel("pc", m, m === BRIEF_MENU ? BRIEF_LABEL : execMenuLabel(m))} />
                  {navN > 0 && st !== "locked" && <KakaoBadge n={navN} size="sm" className="ml-1 align-middle" title={m === "관리자메뉴" ? `가입 승인 대기 ${navN}명` : m === "실시간배차현황" ? `기사 수락/거절 ${navN}건` : m === "배차현황" ? [drvCounts.orders && `기사 수락/거절 ${drvCounts.orders}건`, unseenUnassigned && `새 미배차 ${unseenUnassigned}건`, unseenFixed && `새 고정노선 미배차 ${unseenFixed}건`].filter(Boolean).join(" · ") : m === "지입차관리" ? `긴급 상황 ${navN}건` : `새 소식 ${navN}건`} />}
                  {st === "locked" && <span className="ml-1 opacity-60"><LockIcon /></span>}
                  {m === "인사이트" && st !== "locked" && <span className="ml-1 px-1 py-px rounded bg-[#8FB0F0]/20 text-[#8FB0F0] text-[9px] font-black tracking-wider align-middle">PRO</span>}
                </button>
                </NavHover>
              );
            };
            // ⭐ 2026-11-14 상단 메뉴 묶음 — 홈/배차/운임/기사관리/거래처/매출/정산/지입차관리/회사관리(권한으로 보이는 메뉴만 · 1개면 그대로)
            if (navFlat || biz === "group") return navList.map(renderOne); // 🎨 2026-11-18 컨테이너 · 해상 · 항공도 내륙처럼 묶어서
            return groupNavMenus(navList.filter((m) => menuShown(m) !== "hidden")).map((g) => {
              if (g.menus.length === 1) return renderOne(g.menus[0]);
              const members = g.menus.map((m) => { const st = menuShown(m); return { menu: m, label: navLabelOf(m), disabled: st === "blocked" || st === "locked", badge: st === "locked" ? 0 : navNOf(m), subBadges: subBadgesOf(m) }; });
              const on = g.menus.includes(menu); const sum = members.reduce((a, x) => a + (x.badge || 0), 0);
              const first = members.find((x) => !x.disabled);
              return (
                <NavGroupHover key={`g-${g.group}`} code={String(g.group || "").toUpperCase()} label={g.label} members={members} onOpen={(m) => handleMenuClick(m)}>
                  <button type="button" data-kp-navgroup={g.group} data-on={on ? "1" : "0"} onClick={() => { if (!on && first) handleMenuClick(first.menu); }}
                    title={`${g.label}: ${members.map((x) => x.label).join(" · ")}`}
                    className={`kp-nav-btn relative inline-flex items-center gap-1.5 px-3 h-[34px] rounded-[10px] text-[12.75px] min-[1700px]:text-[13.5px] min-[2050px]:text-[14px] whitespace-nowrap transition-all flex-shrink-0 ${on ? "kp-nav-on font-extrabold" : "text-white/70 font-semibold hover:text-white hover:bg-white/[0.08]"}`}>
                    <ShellIcon name={kpNavIcon(first?.menu || g.menus[0]) || "dashboard"} size={14} className={`kp-nav-ico shrink-0 hidden min-[2050px]:inline-block ${on ? "" : "opacity-70"}`} />
                    <span>{g.label}</span>
                    {sum > 0 && <KakaoBadge n={sum} size="sm" className="ml-1 align-middle" />}
                  </button>
                </NavGroupHover>
              );
            });
            })()}
            <button type="button" data-kp="nav-flat-toggle" onClick={() => { const v = !navFlat; try { localStorage.setItem("kpNavFlat", v ? "1" : "0"); } catch { /* 무시 */ } setNavFlat(v); }}
              title={navFlat ? "메뉴를 묶어서 보기" : "메뉴를 예전처럼 한 줄로 펼쳐 보기"} aria-label="상단 메뉴 묶기/펼치기"
              className="ml-0.5 w-6 h-[34px] rounded-[10px] grid place-items-center text-white/25 hover:text-white hover:bg-white/[0.08] shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">{navFlat ? <><rect x="2" y="3" width="5" height="4" rx="1" /><rect x="9" y="3" width="5" height="4" rx="1" /><rect x="2" y="9" width="5" height="4" rx="1" /><rect x="9" y="9" width="5" height="4" rx="1" /></> : <><path d="M2 4h12M2 8h12M2 12h12" /></>}</svg>
            </button>
            </div>
          </nav>
          {/* ⭐ 2026-11-02 화면 점검 — 넘칠 때만 보이는 좌우 흐림·스크롤 버튼 */}
          {navOverflow.l && (<>
            <div className="pointer-events-none absolute left-0 inset-y-0 w-12 bg-gradient-to-r from-[#14203A] via-[#14203A]/80 to-transparent" />
            <button type="button" aria-label="이전 메뉴" title="이전 메뉴" onClick={() => scrollNavBy(-1)}
              className="absolute left-0.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full grid place-items-center bg-white/15 hover:bg-white/30 ring-1 ring-white/25 text-white text-[15px] font-black leading-none shadow">‹</button>
          </>)}
          {navOverflow.r && (<>
            <div className="pointer-events-none absolute right-0 inset-y-0 w-12 bg-gradient-to-l from-[#14203A] via-[#14203A]/80 to-transparent" />
            <button type="button" aria-label="다음 메뉴" title="다음 메뉴" onClick={() => scrollNavBy(1)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full grid place-items-center bg-white/15 hover:bg-white/30 ring-1 ring-white/25 text-white text-[15px] font-black leading-none shadow">›</button>
          </>)}
          </div>


          {/* 우측 유저 영역 */}
          <div className="flex items-center gap-2 shrink-0 justify-end min-[1800px]:min-w-[180px]">
            {/* 🧭 2026-11-16 메일 · 원격 지원 · 내 정보 · 기사 알림 → [내 메뉴] 버튼 하나(마우스를 올리면 목록). 메일함 · 알림함 창은 그대로(버튼만 숨김) */}
            <MailHeaderButton company={role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY) : (userCompany || DEFAULT_COMPANY)} myName={myRealName} className="hidden" />
            <DriverEventBell enabled={notificationsEnabled} onToggleEnabled={setNotificationsEnabled} onView={onDriverEventView} isAdmin={drvMe.isAdmin} className="hidden" />


            {/* ⭐ 최고관리자 · 부관리자 — 관리자 관리센터(플랫폼 운영 화면)로 바로 전환
                 🛠 2026-11-15 경리 · 영업 · 인사 화면으로 바꿔도 보이게(지금 화면 역할이 아니라 실제 권한으로 본다) */}
            {(realRole === "totalMaster" || role === "totalMaster") && (
              <button type="button" onClick={() => { try { sessionStorage.setItem("kpEntry", "platform"); } catch { /* 무시 */ } navigate("/platform"); }}
                className="kp-chip-btn text-[12px] transition" title="관리자 관리센터로 전환">관리센터 ↗</button>
            )}

            {/* 🔀 2026-11-10 화면 전환(통합인사관리자: 경리·인사 / 통합관리자: 운송·영업·경리·인사) — 버튼 하나, 누르면 어느 팀 화면으로 볼지 고르는 창 */}
            <BizSwitcher modules={workScope ? ["inland"] : bizMods.list} current={biz} canGroup={canBizGroup} onPick={pickBiz} />
            {/* ⭐ 2026-11-17 임원 부서 통합관리자 — 화면 전환 첫 칸이 [경영](경영 브리핑). 고르면 그 화면, 경영을 고르면 경영 브리핑으로 */}
            {roleView.views && (execAllMgr
              ? <ViewSwitcher views={[EXEC_VIEW, ...roleView.views]} current={execHome ? EXEC_VIEW[0] : roleView.view} roleLabel={ROLE_LABELS[realRole] || ""} onPick={(k) => { if (k === EXEC_VIEW[0]) setExecFullV(false); else { setExecFullV(true); roleView.setView(k); } setMenu("HOME"); }} />
              : <ViewSwitcher views={roleView.views} current={roleView.view} roleLabel={ROLE_LABELS[realRole] || ""} onPick={(k) => { roleView.setView(k); setMenu("HOME"); }} />)}
            {/* 👔 임원 — 경영 브리핑 ↔ 전체 메뉴(화면 전환이 없는 임원 역할만 · 2026-11-17 "임원 화면" 낱말은 뺐다) */}
            {isExec && !(execAllMgr && roleView.views) && (
              <button type="button" onClick={toggleExecFull} className="kp-chip-btn text-[12px] transition" title={execFull ? "경영 브리핑으로 돌아가요" : "배차·정산 등 전체 메뉴를 봐요"}>
                {execFull ? "경영 브리핑" : "전체 메뉴"}
              </button>
            )}

            {/* ⭐ 2026-11-01 출근·퇴근 버튼 — 일반 화면은 홈 관제 데크(시계 옆)에, 부서 화면(경리·인사·임원)은 홈 데크가 없어 여기 */}
            {/* 출근·퇴근 버튼은 각 팀 홈 대시보드(시계 옆)에 있다 */}

            {/* 🔎 2026-11-12 통합 검색(Ctrl + K) — 메뉴 · 세부 화면 · 도움말 찾기 */}
            {/* 🧹 2026-11-16 상단 [검색] 버튼은 뺐다 — Ctrl + K 는 그대로 */}
            {/* 🖥 2026-11-10 화면 맞춤 — 표 전체가 한 화면에 보이게 자동 배율 */}
            <ScreenSettingsButton fit={screenFit} hideButton />
            {(() => { const co = role === "totalMaster" ? (localStorage.getItem("loginCompany") || userCompany || "") : (userCompany || localStorage.getItem("userCompany") || ""); return (co || myRealName || hdrNewVer || user) && (
              <UserHub align="right" profile={{ person: [myRealName || user?.displayName || "", myProfileDoc?.position || ""].filter(Boolean).join(" "), company: co }}
                onScreen={() => window.dispatchEvent(new CustomEvent("kp-open-screen-settings"))} screenSub={screenFit?.on ? `화면 맞춤 켜짐 · ${screenFit.pct}%` : "화면 맞춤 · 표 글씨 크기"} onLogout={logout} name={[myRealName || user?.displayName || "", myProfileDoc?.position || ""].filter(Boolean).join(" ")} mailUnread={mailCountsNav.unread || 0}
                showSupport={role !== "totalMaster"} onSupport={openRemoteSupport}
                onSwitchCompany={realRole === "totalMaster" && !isPreviewMode() ? () => setCoSwitchOpen(true) : multiCo.list.length && !isPreviewMode() ? () => setMultiCoOpen(true) : null}
                switchLabel={multiCo.list.length && realRole !== "totalMaster" ? "회사 전환" : ""}
                onMyInfo={() => { setMyInfoNameDraft(myRealName); setMyInfoPhoneDraft(myPhone); setShowMyInfo(true); }}
                onTriggerClick={hdrNewVer ? () => hardReloadForUpdate() : null}
                triggerClass={`ml-1 px-3 h-8 inline-flex items-center gap-2 rounded-lg whitespace-nowrap shrink-0 transition ${hdrNewVer ? "border border-[#8FB0F0]/70 bg-white/[0.08] hover:bg-white/[0.16] text-[12.5px] font-black text-white" : `bg-white/[0.07] border border-white/10 hover:bg-white/[0.14] font-bold text-white/90 ${co.length > 8 ? "text-[12px]" : "text-[13px]"}`}`}>
                {hdrNewVer ? <span data-kp="hdr-update" className="inline-flex items-center gap-2"><span className="kp-subnav-newdot w-1.5 h-1.5 rounded-full bg-[#CFE0FF]" />새 버전{hdrNewVer.version ? ` v${hdrNewVer.version}` : ""} · 눌러서 업데이트</span> : null}
              </UserHub>
            ); })()}


            {/* 🧹 2026-11-10 [최적화]·[가](글씨 크기) 버튼은 상단바에서 뺌 — 저장된 글씨 크기는 그대로 적용 */}

            {/* 🧭 2026-11-27 로그아웃은 오른쪽 끝 [내 메뉴] 안으로 */}
          </div>

        </div>
      </header>
      <CloseInboxBanner inbox={closeInbox} onOpen={(x) => { handleMenuClick("정산관리"); setTimeout(() => { set정산관리Tab("거래처정산"); ClientSettlement.preload().catch(() => {}).then(() => setTimeout(() => window.dispatchEvent(new CustomEvent("kp-settle-open", { detail: { tab: "invoice", client: x.client, ym: x.ym } })), 120)); }, 60); }} />
      {/* ★ 2026-11-12 자주 쓰는 메뉴(접었다 펴기) · 통합 검색 창 · 도움말 센터 — 지금 이 계정에 보이는 메뉴로 자동 구성 */}
      <QuickNav menu={menu} isMaster={realRole === "totalMaster"} /* 🔒 2026-11-18 도움말 '새 기능 · 바뀐 점'은 최고관리자만 */
        menus={(() => { // 🔎 2026-11-27 지금 화면 메뉴 + (화면 전환 역할) 다른 화면에만 있는 메뉴 — 누르면 그 화면으로 바꿔서 연다
          const cur = uiMenuList("pc", deptMode ? DEPT_MENUS[deptMode] : KP_SIDE_GROUPS.flatMap((g) => g.items)).filter((m) => menuState(m) === "ok");
          const extra = Object.keys(otherViewMenus).filter((m) => !cur.includes(m) && menuState(m) !== "locked");
          return [...cur, ...extra];
        })()}
        onGo={(m, code, key) => { const sw = !!otherViewMenus[m] && menuState(m) !== "ok"; handleMenuClick(m); if (code && key) setTimeout(() => emitSubnav(code, key), sw ? 400 : 0); }} />


      {/* 화주사 푸시 알림 — 상차 예정시각이 임박했는데 미처리인 오더를 화주사가 푸시하면 중앙에 확인 전까지 표시 */}
      {activeNudge && !dispatchAlertsOff && ( /* ⭐ 2026-11-17 경리업무만(배차 알림 없음) */
        <div className="fixed inset-0 z-[9999999] bg-black/55 flex items-center justify-center p-4">
          <style>{`
            @keyframes nudgePopIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
            @keyframes nudgeHeaderBlink { 0%,100% { opacity:1; } 50% { opacity:0.65; } }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden" style={{ animation: "nudgePopIn 0.25s ease-out" }}>
            <div className="bg-red-600 px-6 py-4 flex items-center gap-2" style={{ animation: "nudgeHeaderBlink 1.2s ease-in-out infinite" }}>
              <h3 className="text-white font-black text-[17px]">화주사 푸시 알림</h3>
              {pendingNudges.length > 1 && (
                <span className="ml-auto bg-white/20 text-white text-[12px] font-bold px-2 py-0.5 rounded-full">
                  외 {pendingNudges.length - 1}건 대기
                </span>
              )}
            </div>
            <div className="px-6 py-5 space-y-2 text-[14px]">
              <div className="font-black text-[17px] text-[#1B2B4B]">{activeNudge.거래처명 || "-"}</div>
              <div className="text-gray-700 font-semibold">{activeNudge.상차지명 || "-"} → {activeNudge.하차지명 || "-"}</div>
              <div className="text-gray-500 text-[13px]">
                상차예정 : {activeNudge.상차일 || "-"} {activeNudge.상차시간 ? fmtDispatchTime(activeNudge.상차시간, activeNudge.상차시간구분) : ""}
              </div>
              <div className="text-gray-500 text-[13px]">현재 상태 : {activeNudge.배차상태 || "-"}</div>
              {Number(activeNudge.재촉횟수 || 0) > 1 && (
                <div className="text-red-600 text-[12px] font-bold">{activeNudge.재촉횟수}번째 푸시입니다.</div>
              )}
              <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2.5 text-[13px] font-semibold mt-1">
                상차 예정시간이 임박했는데 아직 배차 처리가 완료되지 않아 화주사가 푸시를 보냈습니다.
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  patchDispatch(activeNudge._id, { 재촉대기: false, 재촉확인일시: Date.now(), __col: activeNudge.__col });
                  const el = document.getElementById(`row-${activeNudge._id}`);
                  if (el) setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("toast-flash-border"); setTimeout(() => el.classList.remove("toast-flash-border"), 2000); }, 300);
                }}
                className="w-full py-3 bg-[#1B2B4B] hover:bg-[#243a60] text-white rounded-xl font-bold text-[14px] transition"
              >
                확인했습니다
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 화주사 수정요청/기사취소요청 중앙 팝업 — 확인은 알림만 닫고, 실제 승인/거절은 목록의 뱃지 클릭으로 처리 */}
      {activeReqAlert && !dispatchAlertsOff && ( /* ⭐ 2026-11-17 경리업무만(배차 알림 없음) */
        <div className="fixed inset-0 z-[9999999] bg-black/55 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden" style={{ animation: "nudgePopIn 0.25s ease-out" }}>
            <div
              className="px-6 py-4 flex items-center gap-2"
              style={{
                background: activeReqAlertIsEdit ? "linear-gradient(135deg,#3b5998,#0f2151)" : "#dc2626",
                animation: "nudgeHeaderBlink 1.2s ease-in-out infinite",
              }}
            >
              <h3 className="text-white font-black text-[17px]">{activeReqAlertIsEdit ? "화주사 수정요청" : "화주사 오더취소요청"}</h3>
              {pendingReqAlerts.length > 1 && (
                <span className="ml-auto bg-white/20 text-white text-[12px] font-bold px-2 py-0.5 rounded-full">
                  외 {pendingReqAlerts.length - 1}건 대기
                </span>
              )}
            </div>
            <div className="px-6 py-5 space-y-2 text-[14px]">
              <div className="font-black text-[17px] text-[#1B2B4B]">{activeReqAlert.거래처명 || "-"}</div>
              <div className="text-gray-700 font-semibold">{activeReqAlert.상차지명 || "-"} → {activeReqAlert.하차지명 || "-"}</div>
              <div className="text-gray-500 text-[13px]">
                {_fmtKst(activeReqAlertIsEdit ? activeReqAlert.수정요청일시 : activeReqAlert.취소요청일시)} 요청
              </div>
              <div className={`rounded-lg px-3 py-2.5 text-[13px] font-semibold mt-1 ${activeReqAlertIsEdit ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-700"}`}>
                {activeReqAlertIsEdit
                  ? "화주사가 오더 수정을 요청했습니다. 목록에서 확인 후 승인/거절해주세요."
                  : (activeReqAlert.취소요청사유 || "화주사가 기사취소(배차취소)를 요청했습니다. 목록에서 확인 후 승인/거절해주세요.")}
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  const field = activeReqAlertIsEdit ? "수정요청알림확인" : "취소요청알림확인";
                  const id = activeReqAlert._id;
                  const col = activeReqAlert.__col;
                  setDismissedReqAlertIds(prev => new Set(prev).add(id));
                  patchDispatch(id, { [field]: true, __col: col, __system: true });
                  const el = document.getElementById(`row-${id}`);
                  if (el) setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("toast-flash-border"); setTimeout(() => el.classList.remove("toast-flash-border"), 2000); }, 300);
                }}
                className={`w-full py-3 text-white rounded-xl font-bold text-[14px] transition ${
                  activeReqAlertIsEdit ? "bg-[#1B2B4B] hover:bg-[#243a60]" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                확인했습니다
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 화면 렌더링 ---------------- */}
      <ColumnStyleHost company={userCompany || localStorage.getItem("userCompany") || ""} />
      <BrowserZoomNotice fit={screenFit} />
      {rg.enabled && !workScope && rgOnScreen(menu) && !rgTabOff && <RouteGroupBar rg={rg} rows={dispatchDataPreRG} role={role} userCompany={userCompany} dark={darkMode} />}
      {!rg.enabled && ["배차현황", "실시간배차현황"].includes(menu) && <div className="mb-1 flex justify-end empty:hidden"><SheetLiveChip role={role} userCompany={userCompany} /></div>}
      {/* 👑 2026-11-17 임원 화면 — 대표 · 임원 메뉴는 깊은 남색 + 골드 디자인(src/execUi.jsx)으로 감싸고, 흰 머리말 대신 화면마다 임원용 머리말 */}
      <ExecModeContext.Provider value={deptMode === "exec" && EXEC_SKIN_MENUS.includes(menu)}>
      <main className={`kp-main ${menu === "HOME" || menu === BRIEF_MENU || EXEC_MENUS.includes(menu) || (deptMode === "exec" && EXEC_SKIN_MENUS.includes(menu)) ? "kp-main-bare" : ""} rounded shadow p-4 w-full min-w-0 ${darkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}>
        {!darkMode && !(deptMode === "exec" && EXEC_SKIN_MENUS.includes(menu)) && <KpPageHeader menu={menu} />}
        {/* 🧭 2026-11-12 컨테이너 · 해상 · 항공 · 통합 현황 화면 */}
        {isBizMenu(menu) && (
          <React.Suspense fallback={<div className="py-20 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div>}>
            <FreightWorkspace menuKey={menu} modules={bizMods.list} me={myRealName || user?.displayName || ""} canEdit={!isViewer && role !== "viewer"}
              inlandRows={salesDispatchData} clients={clients} drivers={drivers} places={places} onMenu={handleMenuClick} onBiz={pickBiz}
              canManage={bizSeeAll && !isViewer} onCreateInlandOrder={bizModsAll.list.includes("inland") ? (rec) => addDispatchSafe({ ...rec, 등록자명: myRealName || "" }) : null} />
          </React.Suspense>
        )}
        {menu === "HOME" && (
          <HomeDashboard
            role={role}
            user={user}
            userCompany={userCompany || localStorage.getItem("userCompany") || ""}
            todayStats={todayStats}
            myStats={myStats}
            pending={pendingToday}
            delayed={0}
            dispatchData={isOfficeScope(workScope) ? [] : dispatchDataFiltered}
            onOrderDoubleClick={(order) => setHomeClickedOrder(order)}
            dept={isOfficeScope(workScope) ? "office" : deptMode}
            onTodoGo={(k) => { const [m, t] = String(k).split(":"); if (m === "배차현황" && t) set배차현황Tab(t); handleMenuClick(m); }}
            bizDeck={["container", "sea", "air"].includes(biz) ? (p) => <React.Suspense fallback={<div className="py-20 text-center text-[13.5px] font-bold text-[#9AA9C3]">불러오는 중…</div>}><FreightHomeDeck biz={biz} onMenu={handleMenuClick} {...p} /></React.Suspense> : null}
            onDeptGo={(k) => { const [m, t] = String(k).split(":"); if (m === "정산관리" && t) set정산관리Tab(t); if (m === "출근기록부" || (m === "인사관리부" && t)) { try { sessionStorage.setItem("kpHrTab", m === "출근기록부" ? "attendance" : t); } catch { /* 무시 */ } handleMenuClick("인사관리부"); return; } if (m === "기사서류") { set기사관리Tab("docs:driver"); handleMenuClick("기사관리"); return; } if (m === "기사승인") { set기사관리Tab("acc:pending"); handleMenuClick("기사관리"); return; } if (m === "자금관리" && t) { try { sessionStorage.setItem("kpFundsTab", t); } catch { /* 무시 */ } } if (m === "영업관리" && t) { try { sessionStorage.setItem("kpSalesTab", t); } catch { /* 무시 */ } } if (m === "결재함") { window.__kpOpenApproval = t ? { id: t, page: "inbox" } : { page: "inbox" }; window.dispatchEvent(new Event("kp-open-approval")); return; } handleMenuClick(m); }}
          />
        )}

        {menu === "배차관리" && (
          // 🎨 2026-11-27 시안 K — 오더등록 왼쪽에도 배차 메뉴(오더등록 · 실시간배차현황 · 배차현황)
          <KpSubNav code="ORDER" title="배차" icon="truck" active="배차관리" onSelect={(k) => { if (k !== "배차관리") handleMenuClick(k); }}
            items={[{ key: "배차관리", label: "오더등록", en: "NEW ORDER", icon: "truck" }, { key: "실시간배차현황", label: "실시간배차현황", en: "LIVE", icon: "bell" }, { key: "배차현황", label: "배차현황", en: "ALL ORDERS", icon: "sheet" }].filter((it) => menuShown(it.key) !== "hidden")}>
          <DispatchManagement
          key={`dm-${viewResetKey}`}
          menu={menu}
            dispatchData={dispatchDataFiltered}
            liveDataReady={liveDataReady}
            recentDispatchData={listRecentDispatchData}
            recentLiveDataReady={recentLiveDataReady}
            userNameMap={userNameMap}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            clients={clients}
            addDispatch={addDispatchSafe}
            upsertDriver={upsertDriver}
            upsertClient={upsertClient}
            patchDispatch={patchDispatchSafe}
            removeDispatch={removeDispatchSafe}
            upsertPlace={upsertPlace}
            placeRows={places}
            role={role}
            isTest={isTest}
            isViewer={isViewer}
            showAlert={showAlert}
            userCompany={userCompany || localStorage.getItem("userCompany") || ""}
            setCargoAddPopup={setCargoAddPopup}
            approveEditRequest={approveEditRequestSafe}
            rejectEditRequest={rejectEditRequestSafe}
            markEditRequestSeen={markEditRequestSeen}
            approvedShippers={approvedShippers}
          />
          </KpSubNav>
        )}

        {menu === BRIEF_MENU && canBriefing && (
          <div className="px-0 lg:px-5 pb-7">
            <DailyReport company={deptCompany} dispatchData={salesDispatchData} drivers={drivers} me={{ uid: user?.uid, email: user?.email, name: myRealName }} role={realRole || role} profile={myProfileDoc} canGo={(m) => m === "결재함" || menuState(m) === "ok"}
              onGo={(m) => { if (m === "결재함") { window.__kpOpenApproval = { page: "inbox" }; window.dispatchEvent(new Event("kp-open-approval")); return; } if (m === "배차현황") { handleMenuClick("배차현황"); setTimeout(() => emitSubnav("DISPATCH", "미배차현황"), 0); return; } handleMenuClick(m); }} />
          </div>
        )}

        {EXEC_MENUS.includes(menu) && deptMode === "exec" && (
          <div className="px-0 lg:px-5 pb-7">
            <React.Suspense fallback={<div className="py-20 text-center text-[16px] text-[#667085]">불러오는 중</div>}>
              {menu === "경영분석" && <ExecAnalysis company={deptCompany} dispatchData={salesDispatchData} drivers={drivers} canCash={!!(forceExec || isCeoPosition(myProfileDoc?.position))} />}
              {menu === "결재대기" && <ExecApprovalQueue company={deptCompany} me={{ uid: user?.uid, name: myRealName }} />}
              {menu === "직원정보" && <ExecStaffInfo company={deptCompany} />}
            </React.Suspense>
          </div>
        )}

        {menu === "인사이트" && (role === "admin" || role === "totalMaster") && planIncludes(planId, "insight") && (
          <ProInsight data={salesDispatchData} companyName={planCompany} />
        )}

        {menu === "실시간배차현황" && (
          <RealtimeStatus
            role={role}
            userCompany={userCompany}
            menu={menu}
            dispatchData={listRecentDispatchData}
            historyDispatchData={dispatchDataFiltered}
            liveDataReady={recentLiveDataReady}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            clients={clients}
            placeRows={places}
            addDispatch={addDispatchSafe}
            patchDispatch={patchDispatchSafe}
            removeDispatch={removeDispatchSafe}
            upsertDriver={upsertDriver}
            upsertClient={upsertClient}
            userNameMap={userNameMap}
            darkMode={darkMode}
            isViewer={isViewer}
            setCargoAddPopup={setCargoAddPopup}
            approveEditRequest={approveEditRequestSafe}
            rejectEditRequest={rejectEditRequestSafe}
            markEditRequestSeen={markEditRequestSeen}
            approvedShippers={approvedShippers}
            key={`${menu}-${viewResetKey}`}
          />
        )}

        {menu === "배차현황" && (
          <KpSubNav code="DISPATCH" title="배차현황" icon="truck" active={배차현황Tab} onSelect={set배차현황Tab}
            items={(() => { const n = unseenUnassigned, fx = unseenFixed; /* ⭐ 2026-11-06 계정별 안 본 것만(전체 미배차 건수는 각 화면 안에 그대로) */ return [{ key: "배차현황", label: "배차현황", en: "ALL ORDERS", icon: "list", badge: drvCounts.orders, badgeTitle: drvCounts.orders ? `기사 수락/거절 ${drvCounts.orders}건` : "" }, { key: "미배차현황", label: "미배차현황", en: "PENDING", icon: "hourglass", badge: n, badgeTitle: `새 미배차 ${n}건 (전체 ${pcUnassigned.length}건)` }, { key: "고정노선현황", label: "고정노선현황", en: "FIXED ROUTE", icon: "route", badge: fx, badgeTitle: `새 고정노선 미배차 ${fx}건 (전체 ${pcFixedUnassigned.length}건)` }, { key: "인수증관리", label: "인수증관리", en: "RECEIPTS", icon: "receipt" }, ...(isViewer ? [] : [{ key: "월마감", label: "월 마감", en: "MONTH CLOSE", icon: "check" }])]; })()}>
            {/* ✅ 2026-11-16 월 마감(배차자 1차) — 내가 등록한 오더의 거래처를 맞춰서 경리팀에 넘긴다 */}
            {배차현황Tab === "월마감" && (
              <React.Suspense fallback={<div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>}>
                <MonthClose orders={dispatchData} isViewer={isViewer} staffName={(o) => mainDetailGet.배차담당자(o)}
                  company={(localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim()}
                  me={{ email: user?.email || "", uid: user?.uid || "", name: myRealName || userNameMap.get(user?.uid) || userNameMap.get(String(user?.email || "").toLowerCase()) || user?.displayName || String(user?.email || "").split("@")[0] }}
                  onPatch={(row, patch) => patchDispatchSafe(row._id || row.id, patch, row)}
                  onAdd={(rec) => addDispatchSafe(rec)}
                  onRemove={(row) => removeDispatchSafe(row)}
                  onOpenOrder={(row) => window.dispatchEvent(new CustomEvent("kp-open-copy-panel", { detail: { row } }))} />
              </React.Suspense>
            )}
            {/* 🧩 월 마감에서 오더를 누르면 뜨는 오더 복사/수정 패널(미배차현황과 같은 패널) */}
            {배차현황Tab === "월마감" && (
              <UnassignedStatus panelOnly role={role} userCompany={userCompany} userNameMap={userNameMap} dispatchData={dispatchData} setDispatchData={setDispatchData}
                patchDispatch={patchDispatchSafe} removeDispatch={removeDispatchSafe} drivers={drivers} clients={clients} places={places}
                upsertDriver={upsertDriver} upsertClient={upsertClientSafe} isViewer={isViewer} setCargoAddPopup={setCargoAddPopup} approvedShippers={approvedShippers} />
            )}
            {배차현황Tab === "배차현황" && (
              <DispatchStatus
                key={`ds-${viewResetKey}`}
                role={role}
                userCompany={userCompany}
                dispatchData={listDispatchData}
                timeOptions={timeOptions}
                tonOptions={tonOptions}
                drivers={drivers}
                clients={clients}
                places={places}
                placeRows={places}
                userNameMap={userNameMap}
                addDispatch={addDispatchSafe}
                patchDispatch={patchDispatchSafe}
                removeDispatch={removeDispatchSafe}
                approveEditRequest={approveEditRequestSafe}
                rejectEditRequest={rejectEditRequestSafe}
                markEditRequestSeen={markEditRequestSeen}
                upsertDriver={upsertDriver}
                upsertClient={upsertClient}
                focusOrderId={focusOrderId}
                clearFocusOrder={() => setFocusOrderId(null)}
                isViewer={isViewer}
                setCargoAddPopup={setCargoAddPopup}
                approvedShippers={approvedShippers}
              />
            )}
            {배차현황Tab === "미배차현황" && (
              <UnassignedStatus
                role={role}
                userCompany={userCompany}
                userNameMap={userNameMap}
                dispatchData={listDispatchData}
                setDispatchData={setDispatchData}
                patchDispatch={patchDispatchSafe}
                removeDispatch={removeDispatchSafe}
                drivers={drivers}
                clients={clients}
                places={places}
                upsertDriver={upsertDriver}
                upsertClient={upsertClientSafe}
                isViewer={isViewer}
                setCargoAddPopup={setCargoAddPopup}
                approvedShippers={approvedShippers}
              />
            )}
            {/* 🧾 2026-11-09 인수증관리 — 기사앱 첨부 + 운송사 직접 업로드(인수증·전표) · 운송팀·경리팀 같이 */}
            {배차현황Tab === "인수증관리" && (
              <React.Suspense fallback={<div className="py-16 text-center text-[#9AA9C3]">불러오는 중…</div>}>
                <div className="mb-2 flex justify-end"><RouteGroupSelect enabled={rg.enabled} rows={dispatchDataFiltered} value={subRg} onChange={setSubRg} /></div>
                <ReceiptCenter dispatchData={filterRouteGroup(dispatchDataFiltered, subRg)} isViewer={isViewer} toast={sflowToast} />
              </React.Suspense>
            )}
            {/* ⭐ 2026-11-03 고정노선현황 — 배차표 양식(화주사 구글시트) 오더를 배차현황과 같은 화면으로, 열은 시트 순서 · 시트 실시간 연동 */}
            {배차현황Tab === "고정노선현황" && (
              <FixedRouteStatusHost company={userCompany || localStorage.getItem("userCompany") || ""} dispatchData={dispatchDataFiltered} carrierPoolRows={routeCarrierPoolRows} places={places} drivers={drivers} disabled={isViewer}
                render={(form, rows, actions) => (
                  <DispatchStatus
                    key={`fr-${form.id}-${viewResetKey}`}
                    fixedForm={form}
                    fixedActions={actions}
                    role={role}
                    userCompany={userCompany}
                    dispatchData={rows}
                    timeOptions={timeOptions}
                    tonOptions={tonOptions}
                    drivers={drivers}
                    clients={clients}
                    places={places}
                    placeRows={places}
                    userNameMap={userNameMap}
                    addDispatch={addDispatchSafe}
                    patchDispatch={patchDispatchSafe}
                    removeDispatch={removeDispatchSafe}
                    approveEditRequest={approveEditRequestSafe}
                    rejectEditRequest={rejectEditRequestSafe}
                    markEditRequestSeen={markEditRequestSeen}
                    upsertDriver={upsertDriver}
                    upsertClient={upsertClient}
                    focusOrderId={null}
                    clearFocusOrder={() => {}}
                    isViewer={isViewer}
                    setCargoAddPopup={setCargoAddPopup}
                    approvedShippers={approvedShippers}
                  />
                )} />
            )}
          </KpSubNav>
        )}
        {menu === "단가표" && (
          <RateCard dispatchData={dispatchDataFiltered} userCompany={userCompany || localStorage.getItem("userCompany") || ""} clients={clients} />
        )}

        {menu === "기사관리" && (role === "admin" || role === "totalMaster" || role === "user" || role === "test" || role === "hrManager" || isViewer || !!customRole) && (
          <KpSubNav code="DRIVERS" title="기사관리" icon="user" active={기사관리Tab} onSelect={set기사관리Tab}
            groups={[
              { label: "기사", items: [{ key: "drv", label: "기사관리", en: "DRIVERS", icon: "user", sub: ["전체", "일반", "직영", "지입", "임대", "블랙"].map((g) => ({ key: `d:${g}`, label: g === "전체" ? "전체 기사" : g, icon: g === "블랙" ? "alert" : g === "지입" ? "link" : g === "임대" ? "key" : "user", badge: g === "전체" ? 0 : (drivers || []).filter((d) => !isPendingSignupDriver(d) && (d.등급 || "일반") === g && (String(d.이름 || "").trim() || String(d.차량번호 || "").trim())).length, soft: true })) }] },
              { label: "기사 앱 계정", items: [{ key: "acc", label: "기사 앱 계정", en: "APP ACCOUNTS", icon: "phone", badge: alertsNav.signupDriver || 0, red: true, badgeTitle: "기사 가입 승인 대기", sub: [{ key: "acc:pending", label: "가입 승인", icon: "hourglass", badge: alertsNav.signupDriver || 0, badgeTitle: "기사 가입 승인 대기" }, { key: "acc:drivers", label: "승인된 기사", icon: "idcard" }] }] },
              { label: "지게차", items: [{ key: "fork", label: "지게차 기사", en: "FORKLIFT", icon: "user" }] }, // 🏗 2026-11-09
              { label: "서류관리", items: [{ key: "docs", label: "서류관리", en: "DOCUMENTS", icon: "file", badge: drvCounts.docs || 0, red: true, sub: [{ key: "docs:driver", label: "기사 제출 서류", icon: "file", badge: drvCounts.docs || 0, red: true, badgeTitle: "새로 올라온 기사 서류" }, { key: "docs:penalty", label: "과태료 · 사고 서류", icon: "alert" }] }] },
            ]}>
            {기사관리Tab.startsWith("d:") && (
              <DriverManagement
                canEditFleetWay={(realRole || role) === "totalMaster" || myProfileDoc?.isMaster === true}
                drivers={drivers}
                upsertDriver={upsertDriverSafe}
                removeDriver={removeDriverSafe}
                showAlert={showAlert}
                userCompany={userCompany}
                grade={기사관리Tab.slice(2)}
                onGrade={(g) => set기사관리Tab(`d:${g}`)}
              />
            )}
            {기사관리Tab.startsWith("acc:") && <DriverAccounts company={deptCompany} isViewer={isViewer} tab={기사관리Tab.slice(4)} onTab={(t) => set기사관리Tab(`acc:${t}`)} />}
            {기사관리Tab === "docs:driver" && <DriverDocsReview company={deptCompany} isViewer={isViewer} />}
            {기사관리Tab === "fork" && <ForkliftDriverManager isViewer={isViewer} />}
            {기사관리Tab === "docs:penalty" && <FleetManagement dispatchData={dispatchDataFiltered} role={role} forceTab="penalty" hideChrome />}
          </KpSubNav>
        )}

        {menu === "거래처관리" && (role === "admin" || role === "totalMaster" || role === "user" || role === "test" || isViewer || !!customRole) && (
          <KpSubNav code="CLIENTS" title="거래처관리" icon="building" active={거래처관리Tab} onSelect={set거래처관리Tab}
            groups={[
              { label: "거래처", items: [{ key: "하차지거래처", label: "상하차지거래처", en: "PLACES", icon: "pin" }, { key: "기본거래처", label: "기본거래처", en: "CLIENTS", icon: "building" }] },
              // ⭐ 2026-11-02 "고정거래처관리" 탭은 쓰지 않아 메뉴에서만 뺐다(데이터·FixedClients 컴포넌트는 그대로 — 고정노선 등 다른 화면이 계속 읽는다).
              // 탭 key "하차지거래처"는 내부 값이라 그대로 두고 화면 이름만 "상하차지거래처"로 바꿨다.
            ]}>
          {(거래처관리Tab === "하차지거래처" || 거래처관리Tab === "기본거래처") && (
            <ClientManagement
              key={거래처관리Tab}
              clients={clients}
              upsertClient={upsertClientSafe}
              removeClient={removeClientSafe}
              upsertPlace={upsertPlaceSafe}
              places={places}
              showAlert={showAlert}
              initialTab={거래처관리Tab === "기본거래처" ? "기본" : "하차지"}
              hideTabs={true}
              userCompany={userCompany}
              canMerge={!isViewer && (["admin", "totalMaster", "test", "allMgr"].includes(realRole || role) || myProfileDoc?.isMaster === true)} // ⭐ 2026-11-17 거래처 합치기 — 운송관리자 · 경리관리자 · 통합관리자 · 최고관리자 · 회사 마스터
            />
          )}
          {false && 거래처관리Tab === "고정거래처관리" && (
            <div className="p-4">
              <FixedClients drivers={drivers} upsertDriver={upsertDriverSafe} userCompany={userCompany || localStorage.getItem("userCompany") || ""} role={role} isViewer={isViewer} />
            </div>
          )}
          {/* ⭐ 고정노선관리는 지입차관리 › 고정노선으로 옮겼다 */}
          </KpSubNav>
        )}

        {menu === "지입차관리" && (role === "admin" || role === "totalMaster" || role === "user" || role === "test" || isViewer || !!customRole) && (
          // ⭐ 탭이 하나뿐이라 눌러도 아무 일 없던 "지입차관리" 버튼을 없앴다(화면 자체 머리말 "지입차량 관제"가 있다)
          <div className="px-4 pt-4">
            <FleetManagement dispatchData={dispatchDataFiltered} role={role} />
          </div>
        )}

        {menu === "매출관리" && (role === "admin" || role === "totalMaster" || role === "test" || isViewer || !!customRole) && (
          (revenueUnlocked || DEV_DEMO_REVENUE) ? (
            <>
            {bizMods.list.length > 1 && <React.Suspense fallback={null}><FreightRevenueStrip modules={bizMods.list} onOpenGroup={canBizGroup ? () => { setBizRaw("group"); writeBiz(user?.uid, "group"); setMenu(bizMenuKey("group", "pnl")); } : null} /></React.Suspense>}
            <DetailScope data={salesDispatchData} getters={mainDetailGet} title="세부검색 · 매출관리">{(detRows) => ( /* 🔎 2026-11-14 세부검색 버튼은 매출관리에서 뺐다(사용자 요청) */
            <BizScope company={getTenant() || userCompany || localStorage.getItem("userCompany") || ""} data={detRows}>{(bizRows, bizSel) => (
            <Settlement
              key={`settle-${bizSel || "all"}`}
              dispatchData={bizRows}
              fixedRows={fixedRows}
              clients={clients}
              places={places}
              isViewer={isViewer}
              role={role}
              userCompany={userCompany}
            />)}</BizScope>)}</DetailScope>
            </>
          ) : (
            // 🔐 2026-11-27 매출 비밀번호는 서버가 확인한다(src/revenuePwApi.js · functions/revenuePw.js)
            <RevenuePwPanel company={(getTenant() || localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim()} onVerified={() => setRevenueUnlocked(true)} />
          )
        )}

        {정산관리Visited && (role === "admin" || role === "totalMaster" || role === "test" || isViewer || !!customRole) && (
          <div style={{ display: menu === "정산관리" ? undefined : "none" }}>
          <KpSubNav code="SETTLEMENT" title="정산관리" icon="receipt" active={정산관리Tab} onSelect={set정산관리Tab} actions={[{ key: "manual", label: "정산 매뉴얼", icon: "doc", onClick: () => window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu: "정산관리", section: { 홈: "home", 거래처정산: "billing", 지급관리: "payout", 입금확인: "deposit", 지입정산관리: "fleet", 지게차지급: "forklift" }[정산관리Tab] || "" } })) }]}
            items={[{ key: "홈", label: "정산 홈", en: "OVERVIEW", icon: "dashboard" }, { key: "거래처정산", label: "거래처정산", en: "BILLING", icon: "receipt", badge: closeInboxN || undefined }, { key: "지급관리", label: "용차지급관리", en: "PAYOUT", icon: "wallet" }, ...(betaPayOn ? [{ key: "입금확인", label: "입금 확인", en: "DEPOSIT", icon: "wallet" }] : []), { key: "지입정산관리", label: "지입정산관리", en: "FLEET PAY", icon: "wallet" }, { key: "지게차지급", label: "지게차 · 외부 지급", en: "FORKLIFT · EXT", icon: "wallet" }]}>
          <DetailScope data={salesDispatchData} getters={mainDetailGet} title="세부검색 · 정산관리">{(settleRows) => (<>
          {/* 🔎 2026-11-14 세부검색 버튼은 정산관리에서 뺐다(사용자 요청) */}
          {/* 거래명세서 검색/선택 상태 유지를 위해 지급관리 탭으로 전환해도 언마운트하지 않고 숨기기만 한다 */}
          <div style={{ display: 정산관리Tab === "거래처정산" ? undefined : "none" }}>
            <ClientSettlement
              dispatchData={settleRows}
              setDispatchData={setDispatchData}
              userCompany={userCompany}
              clients={clients}
              setClients={(next) => next.forEach(upsertClient)}
              upsertClient={upsertClient}
              showAlert={showAlert}
              patchDispatch={patchDispatchSafe}
              cardImage={cardImage}
              setCardImage={setCardImage}
              cardImageUploading={cardImageUploading}
              setCardImageUploading={setCardImageUploading}
              isViewer={isViewer}
              active={정산관리Tab === "거래처정산"}
              copyPanel
            />
          </div>
          {/* ⭐ 2026-11-17 업체 명세서 비교에서 [수정]을 누르면 뜨는 오더 복사/수정 패널(월 마감과 같은 패널) */}
          {menu === "정산관리" && 정산관리Tab === "거래처정산" && !isViewer && (
            <UnassignedStatus panelOnly role={role} userCompany={userCompany} userNameMap={userNameMap} dispatchData={dispatchData} setDispatchData={setDispatchData}
              patchDispatch={patchDispatchSafe} removeDispatch={removeDispatchSafe} drivers={drivers} clients={clients} places={places}
              upsertDriver={upsertDriver} upsertClient={upsertClientSafe} isViewer={isViewer} setCargoAddPopup={setCargoAddPopup} approvedShippers={approvedShippers} />
          )}
          {/* 🧭 정산 홈 — 월 마감 진행판 · 미수 경과 · 거래처 원장(기존 화면은 그대로, 여기서 바로 간다) */}
          {정산관리Tab === "홈" && <React.Suspense fallback={<div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>}><SettleHome orders={settleRows} drivers={drivers} company={(localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim()} onGo={(k, d) => { set정산관리Tab(k); if (d) setTimeout(() => window.dispatchEvent(new CustomEvent("kp-settle-open", { detail: d })), 60); }} depositOn={betaPayOn} /></React.Suspense>}
          {/* 🛠 2026-11-16 마감 검증 탭은 없앴다 — 배차자가 넘긴 거래처는 거래처정산에 "배차 마감"으로 보인다 */}
          {정산관리Tab === "지게차지급" && <ForkliftPayouts orders={settleRows} patchDispatch={patchDispatchSafe} isViewer={isViewer} />}
          {정산관리Tab === "입금확인" && betaPayOn && <CallDepositDesk orders={settleRows} patchDispatch={patchDispatchSafe} isViewer={isViewer} company={userCompany} onAttach={(r) => setDeskAttachId(r._id || r.id)} />}
          {/* 📎 입금 확인의 첨부 — 배차현황 첨부와 같은 창 · 같은 파일 */}
          {deskAttachId && (() => { const ar = (settleRows || []).find((x) => (x._id || x.id) === deskAttachId); return ar ? (
            <AttachmentViewer row={ar} db={db} onClose={() => setDeskAttachId("")} isViewer={isViewer} isViewed={ar.attachViewed === true}
              onToggleViewed={() => patchDispatchSafe(ar._id, { attachViewed: !ar.attachViewed, __system: true })} onSaved={() => {}} />
          ) : null; })()}
          {정산관리Tab === "지입정산관리" && (
            <FleetSettlementMenu dispatchData={settleRows} companyName={(localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim()} />
          )}
          {/* 🧾 2026-11-27 지입정산 개별 정산서 운행 내역 줄을 누르면 뜨는 오더 수정 패널(월 마감과 같은 패널) */}
          {정산관리Tab === "지입정산관리" && !isViewer && (
            <UnassignedStatus panelOnly role={role} userCompany={userCompany} userNameMap={userNameMap} dispatchData={dispatchData} setDispatchData={setDispatchData}
                patchDispatch={patchDispatchSafe} removeDispatch={removeDispatchSafe} drivers={drivers} clients={clients} places={places}
                upsertDriver={upsertDriver} upsertClient={upsertClientSafe} isViewer={isViewer} setCargoAddPopup={setCargoAddPopup} approvedShippers={approvedShippers} />
          )}
          {정산관리Tab === "지급관리" && (
            <div className="p-4">
              <PaymentManagement
                dispatchData={settleRows}
                drivers={drivers}
                patchDispatch={patchDispatchSafe}
                companyName={(localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim()}
                canEditPayDay={role === "admin" || role === "totalMaster"}
              />
            </div>
          )}
          </>)}</DetailScope>
          </KpSubNav>
          </div>
        )}

        {menu === "운임조회" && <FreightRateInquiry company={userCompany} />}

        {/* 👔 2026-10-31 임원 메뉴 */}
        {menu === "결재함" && menuState("결재함") === "ok" && <ExecApprovals company={deptCompany} me={{ uid: user?.uid, name: myProfileDoc?.name || user?.displayName || "", team: myProfileDoc?.team || "", position: myProfileDoc?.position || "", role }} />}
        {menu === "직원일정" && menuState("직원일정") === "ok" && <TeamSchedule company={deptCompany} />}
        {menu === "자금현황" && menuState("자금현황") === "ok" && <FundsBoard company={deptCompany} canEdit={false} />}
        {menu === PF_MENU && menuState(PF_MENU) === "ok" && <div className="px-0 lg:px-5 pb-7"><React.Suspense fallback={<div className="py-20 text-center text-[16px] text-[#667085]">불러오는 중</div>}><PrivateFareVaultLazy company={deptCompany} dispatchData={salesDispatchData} /></React.Suspense></div>}
        {menu === "스케줄" && menuState("스케줄") === "ok" && <ExecScheduleBoard company={deptCompany} me={{ uid: user?.uid, name: myProfileDoc?.name || user?.displayName || "", position: myProfileDoc?.position || "" }} canWrite />}
        {menu === "전자결재" && menuState("전자결재") === "ok" && <ApprovalWorkspace company={deptCompany} me={{ uid: user?.uid, name: myProfileDoc?.name || user?.displayName || "", team: myProfileDoc?.team || "", position: myProfileDoc?.position || "", role }} />}
        {/* 🏢 2026-10-31 경리·인사 부서 메뉴 */}
        {menu === "회계관리" && menuState("회계관리") === "ok" && <AcctMenuGate company={deptCompany} menuLabel="회계관리"><AccountingWorkspace company={deptCompany} fixedRows={fixedRows} clients={clients} drivers={drivers} isViewer={isViewer} role={realRole || role} /></AcctMenuGate>}{/* ⭐ 2026-11-18 메뉴 입구 비밀번호 */}
        {menu === "영업관리" && menuState("영업관리") === "ok" && <React.Suspense fallback={<div className="py-24 text-center text-[14px] font-bold text-[#9AA9C3]">영업관리를 불러오는 중…</div>}><SalesHub company={deptCompany} dispatchData={salesDispatchData} isViewer={isViewer} exec={deptMode === "exec"} onGo={(m) => handleMenuClick(m)} /></React.Suspense>}
        {menu === "자금관리" && menuState("자금관리") === "ok" && <AcctMenuGate company={deptCompany} menuLabel="자금관리"><FundsWorkspace company={deptCompany} isViewer={isViewer} /></AcctMenuGate>}
        {menu === "비품관리" && menuState("비품관리") === "ok" && <AssetManager company={deptCompany} isViewer={isViewer} />}
        {menu === "인사관리부" && menuState("인사관리부") === "ok" && (
          <HrHub company={deptCompany} canManage={role === "hrManager" || role === "totalMaster" || ["hrAcct", "allMgr"].includes(realRole) || (/인사/.test(String(myProfileDoc?.team || "")) && role !== "viewer") || masterHrMain || (!!customRole && getMenuAccess(customRoles, role, "인사관리부") === "write")} me={{ uid: user?.uid, name: myProfileDoc?.name || user?.displayName || "" }} role={realRole || role}
            drivers={drivers}
            renderRecord={(focusUid) => <HRManagementPage userCompany={deptCompany} role={role} userId={auth?.currentUser?.uid || ""} focusUid={focusUid} drivers={drivers} />}
            renderAttendance={() => <AttendanceBoard userCompany={deptCompany} role={role} user={user} />} />
        )}
        {menu === "출근기록부" && menuState("출근기록부") === "ok" && <AttendanceBoard userCompany={deptCompany} role={role} user={user} />}
        {menu === "연차관리" && menuState("연차관리") === "ok" && <LeaveArea company={deptCompany} isViewer={isViewer} canManage={role === "hrManager" || role === "totalMaster"} promoManage={["hrManager", "hrAcct", "allMgr", "hrStaff", "totalMaster"].includes(realRole || role) || /인사/.test(String(myProfileDoc?.team || "")) || myProfileDoc?.isMaster === true} />}
        {menu === "입퇴사관리" && menuState("입퇴사관리") === "ok" && <OnboardingBoard company={deptCompany} isViewer={isViewer} />}
        {menu === "증명서발급" && menuState("증명서발급") === "ok" && <CertIssuer company={deptCompany} isViewer={isViewer} />}
        {menu === "기사서류" && menuState("기사서류") === "ok" && <DriverDocsReview company={deptCompany} isViewer={isViewer} />}
        {menu === "직원관리" && menuState("직원관리") === "ok" && <StaffManager company={deptCompany} role={role} myUid={auth?.currentUser?.uid || ""} />}


        {menu === "회사관리" && (
          <CompanyManagementWrapper
            payrollInAcct={menuState("회계관리") === "ok"}
            userCompany={(localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY || "").trim()}
            role={role}
            userId={auth?.currentUser?.uid || localStorage.getItem("uid") || ""}
            user={user}
            todayStats={todayStats}
            myStats={myStats}
            cardImage={cardImage}
            setCardImage={setCardImage}
            cardImageUploading={cardImageUploading}
            setCardImageUploading={setCardImageUploading}
            showAlert={showAlert}
          />
        )}

        {menu === "관리자메뉴" && (role === "admin" || role === "totalMaster" || isViewer || deptMode === "acct" || deptMode === "hr") && <AdminMenu parentRole={role} parentCompany={userCompany || localStorage.getItem("userCompany") || ""} isViewer={isViewer} dispatchData={dispatchData} places={places} deptMode={deptMode === "acct" || deptMode === "hr" ? deptMode : null} />}

        {/* ⭐ 2026-10-28 — 관리센터는 "운송사 하나"가 아니라 프로그램 전체(가입 운송사·화주사) 관제 */}

      </main>
      </ExecModeContext.Provider>
      </div>
      {/* ===== 홈 오더 미리보기 모달 ===== */}
      {homeClickedOrder && (
        <div className="fixed inset-0 z-[99990] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-bold text-[16px]"><EditableText id="copyPanel.title" defaultText="오더 복사 / 수정 패널" /></h3>
                <p className="text-white/50 text-[12px] mt-0.5">{homeClickedOrder.거래처명} · {homeClickedOrder.상차지명} → {homeClickedOrder.하차지명}</p>
              </div>
              <button onClick={() => setHomeClickedOrder(null)} className="text-white/60 hover:text-white text-xl transition">✕</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["거래처명", homeClickedOrder.거래처명],
                  ["배차상태", homeClickedOrder.배차상태],
                  ["상차일", homeClickedOrder.상차일],
                  ["상차시간", homeClickedOrder.상차시간],
                  ["하차일", homeClickedOrder.하차일],
                  ["하차시간", homeClickedOrder.하차시간],
                  ["상차지명", homeClickedOrder.상차지명],
                  ["하차지명", homeClickedOrder.하차지명],
                  ["화물내용", homeClickedOrder.화물내용],
                  ["차량종류", homeClickedOrder.차량종류],
                  ["차량톤수", homeClickedOrder.차량톤수],
                  ["청구운임", homeClickedOrder.청구운임 ? Number(homeClickedOrder.청구운임).toLocaleString() + "원" : ""],
                  ["배차기사", homeClickedOrder.이름 || homeClickedOrder.기사명],
                  ["차량번호", homeClickedOrder.차량번호],
                  ["메모", homeClickedOrder.메모],
                ].map(([label, value]) => value ? (
                  <div key={label} className="flex items-start border-b border-gray-50 pb-2">
                    <span className="w-24 text-[12px] font-semibold text-gray-500 shrink-0">{label}</span>
                    <span className="text-[13px] text-gray-800 font-medium">{value}</span>
                  </div>
                ) : null)}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => {
                  const id = homeClickedOrder?._id || homeClickedOrder?.id || homeClickedOrder?.docId;
                  if (id) setFocusOrderId(id);
                  setMenu("배차현황");
                  setHomeClickedOrder(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"
              >
                배차현황에서 수정 / 복사
              </button>
              <button onClick={() => setHomeClickedOrder(null)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐⭐⭐ 내 정보 패널 (슬라이드 사이드바) ⭐⭐⭐ */}
      <div
        className="fixed inset-0 z-50 flex justify-end"
        style={{
          pointerEvents: showMyInfo ? "auto" : "none",
          transition: "background-color 0.3s",
          backgroundColor: showMyInfo ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0)",
        }}
        onClick={() => setShowMyInfo(false)}
      >
        <div
          className="w-[320px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col"
          style={{
            transform: showMyInfo ? "translateX(0)" : "translateX(100%)",
            transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 사이드바 헤더 */}
          <div className="bg-[#1B2B4B] px-5 py-5 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-white font-bold text-[16px]"><EditableText id="popup.title.내 정보 사이드바" defaultText="내 정보" /></h2>
              <p className="text-white/50 text-[12px] mt-0.5">{user?.email}</p>
            </div>
            <button
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition text-lg"
              onClick={() => setShowMyInfo(false)}
            >✕</button>
          </div>

          <div className="flex-1 px-5 py-5 space-y-5">
            {/* 회사 정보 */}
            {(() => {
              const co = role === "totalMaster"
                ? (localStorage.getItem("loginCompany") || userCompany || "")
                : (userCompany || localStorage.getItem("userCompany") || "");
              return co ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{role === "totalMaster" ? "소속" : "소속 회사"}</p>
                  {/* 🧑‍💻 2026-11-24 최고관리자는 어느 운송사 소속도 아님 — 들어가 보는 회사는 따로 */}
                  <p className="text-[15px] font-bold text-[#1B2B4B]">{role === "totalMaster" ? TM_AFFIL : co}</p>
                  {role === "totalMaster" && <p className="text-[11.5px] font-semibold text-gray-500 mt-0.5">지금 보는 운송사: {co}</p>}
                </div>
              ) : null;
            })()}

            {/* ⭐ 사용자 요청 — 배차담당자 이름이 이메일로 보이던 문제의 근본 원인은
                이 이름을 직접 입력할 화면이 없었다는 것. 여기서 이름/연락처를 입력해두면
                오더 등록 시 담당자명이 정확히 찍히고, 지입 기사 앱의 "배차담당자 전화"
                버튼도 이 연락처로 동작한다. */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2.5">
              <p className="text-[11px] font-semibold text-gray-500">내 이름 / 연락처</p>
              <input autoComplete="off" value={myInfoNameDraft} onChange={e => setMyInfoNameDraft(e.target.value)}
                placeholder="이름"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white" />
              <input autoComplete="off" value={myInfoPhoneDraft} onChange={e => setMyInfoPhoneDraft(formatPhone(e.target.value))}
                placeholder="연락처 (010-0000-0000)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white" />
              <button
                onClick={saveMyInfo}
                disabled={myInfoSaving}
                className="w-full py-2 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition disabled:opacity-60"
              >
                {myInfoSaving ? "저장중..." : "저장"}
              </button>
            </div>

            {/* ⭐ 로그인 · 보안(2차 인증 · 로그인된 기기 · 비밀번호 변경) — 🔐 2026-11-14 src/UserSecurity.jsx */}
            <button
              onClick={() => setLoginMgrOpen(true)}
              className="w-full py-2.5 rounded-xl border border-[#1B2B4B] text-[#1B2B4B] text-[13px] font-bold hover:bg-[#1B2B4B] hover:text-white transition inline-flex items-center justify-center gap-1.5"
              data-open-security
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>
              로그인 · 보안 (2차 인증 · 비밀번호)
            </button>
            {loginMgrOpen && <LoginManagerModal user={user} onClose={() => setLoginMgrOpen(false)} />}

            {/* ⭐ 2026-11-07 팝업 알림 — 가운데 팝업을 종류별로 켜고 끄기(계정에 저장 · 모바일과 같이 바뀜) */}
            {user?.uid && <PopupPrefsSection uid={user.uid} showBriefing={canBriefing} />}

            {/* ⭐ 2026-11-02 원격지원 — 사용이 어려울 때 관리자에게 화면 공유·원격 지원 요청 */}
            {role !== "totalMaster" && (
              <button
                onClick={() => { setShowMyInfo(false); openRemoteSupport(); }}
                data-testid="support-open-myinfo"
                className="w-full py-3 rounded-xl text-white text-[14px] font-bold transition flex items-center justify-center gap-2 hover:opacity-90"
                style={{ background: "linear-gradient(90deg,#0F1A30,#2D4C82)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{SUPPORT_ICON}</svg>
                원격 지원 요청
              </button>
            )}

            {/* 🔁 2026-11-07 중복 정리 — 명함 이미지 · 나의 통계는 회사관리 › 내정보 화면(내 정보 · 내 명함 탭)과 같은 기능이라
                 그 화면을 쓸 수 있으면 그쪽으로 보내고(한 곳에서 관리), 회사관리 메뉴가 없는 권한만 여기 예전 칸을 그대로 둔다 */}
            {menuState("회사관리") === "ok" ? (
              <button type="button" data-testid="myinfo-go-profile"
                onClick={() => { setShowMyInfo(false); handleMenuClick("회사관리"); setTimeout(() => emitSubnav("COMPANY", "내정보"), 0); }}
                className="w-full py-3 rounded-xl border border-[#DCE3EE] bg-[#F5F8FD] text-[#1B2B4B] text-[14px] font-bold hover:bg-[#EEF3FC] transition flex items-center justify-between px-4">
                <span>명함 · 나의 통계 보기</span><span className="text-[13px] text-[#5B6B85]">회사관리 › 내정보</span>
              </button>
            ) : (<>
            {/* 명함 이미지 */}
            <div>
              <p className="text-[12px] font-semibold text-gray-500 mb-2">명함 이미지</p>
              <p className="text-[11px] text-gray-500 mb-2">이메일 발송 시 하단에 첨부되는 명함 이미지입니다.</p>
              {cardImage && (
                <img src={cardImage} alt="명함" className="w-full rounded-xl mb-2 border border-gray-200 object-contain max-h-28 bg-gray-50" />
              )}
              <div className="flex gap-2">
                <label className={`flex-1 text-center py-2 rounded-lg border text-[13px] cursor-pointer font-semibold transition ${cardImageUploading ? "bg-gray-100 text-gray-500 border-gray-200" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                  {cardImageUploading ? "업로드 중..." : "이미지 선택"}
                  <input autoComplete="off" type="file" accept="image/*" className="hidden" disabled={cardImageUploading}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file || !user?.uid) return;
                      setCardImageUploading(true);
                      const imgEl = new Image();
                      const objUrl = URL.createObjectURL(file);
                      imgEl.onload = async () => {
                        URL.revokeObjectURL(objUrl);
                        const MAX = 800;
                        let w = imgEl.width, h = imgEl.height;
                        if (w > MAX || h > MAX) {
                          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                          else { w = Math.round(w * MAX / h); h = MAX; }
                        }
                        const cv = document.createElement("canvas");
                        cv.width = w; cv.height = h;
                        cv.getContext("2d").drawImage(imgEl, 0, 0, w, h);
                        const dataUrl = cv.toDataURL("image/jpeg", 0.65);
                        setCardImage(dataUrl);
                        try {
                          await setDoc(doc(db, "userProfiles", user.uid), { cardImageUrl: dataUrl }, { merge: true });
                          showAlert("명함 이미지가 저장되었습니다.");
                        } catch(err) {
                          showAlert("저장 실패: " + err.message);
                        } finally {
                          setCardImageUploading(false);
                        }
                      };
                      imgEl.onerror = () => { URL.revokeObjectURL(objUrl); showAlert("이미지 로드 실패"); setCardImageUploading(false); };
                      imgEl.src = objUrl;
                    }} />
                </label>
                {cardImage && (
                  <button className="px-3 py-2 rounded-lg border border-gray-300 text-gray-500 text-[13px] hover:bg-gray-50 transition"
                    onClick={async () => {
                      setCardImage(null);
                      if (user?.uid) {
                        await setDoc(doc(db, "userProfiles", user.uid), { cardImageUrl: null }, { merge: true }).catch(() => {});
                      }
                    }}><EditableText id="misc.btn.7206.삭제" defaultText="삭제" /></button>
                )}
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-gray-100" />

            {/* 통계 */}
            <div>
              <p className="text-[12px] font-semibold text-gray-500 mb-3">나의 통계</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "오늘 오더", value: todayStats.count, unit: "건" },
                  { label: "오늘 매출", value: todayStats.revenue.toLocaleString(), unit: "원" },
                  { label: "오늘 수익", value: todayStats.profit.toLocaleString(), unit: "원" },
                  { label: "총 오더", value: myStats.totalOrders, unit: "건" },
                  { label: "총 매출", value: myStats.totalRevenue.toLocaleString(), unit: "원" },
                  { label: "총 수익", value: myStats.totalProfit.toLocaleString(), unit: "원" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-gray-500 font-medium">{label}</p>
                    <p className="text-[14px] font-bold text-[#1B2B4B] mt-0.5">{value}<span className="text-[11px] font-normal text-gray-500 ml-0.5">{unit}</span></p>
                  </div>
                ))}
              </div>
            </div>
            </>)}
          </div>
        </div>
      </div>
    {/* AI 비서 — ⭐ 2026-11-07 Claude 비서(말로 오더 수정·등록·조회). 저장은 아래 aiOrderApi = 화면의 원래 저장 함수 */}
<AiAssistant
  dispatches={salesRawDispatchData}
  clients={clients}
  places={places}
  drivers={drivers}
  mode={deptMode}
  company={deptCompany}
  uid={user?.uid || ""}
  userName={myRealName || ""}
  screen={menu}
  orderApi={aiOrderApi}
  controlledOpen={activeTool === "ai"}
  onOpenChange={v => setActiveTool(v ? "ai" : "none")}
/>

      {/* 메신저 플로팅 버튼 */}
      <InternalMessenger
        user={user}
        userCompany={userCompany || localStorage.getItem("userCompany") || ""}
        role={role}
        controlledOpen={activeTool === "messenger"}
        onOpenChange={v => setActiveTool(v ? "messenger" : "none")}
      />

      {/* 계산기 플로팅 버튼 — 모든 탭에 표시 */}
        <>
          <FabButton bottom={88} active={calcOpen} title="계산기" onClick={() => setActiveTool(p => p === "calculator" ? "none" : "calculator")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="3" /><path d="M8 7h8" /><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" strokeWidth="2.6" /></svg>
          </FabButton>
          {calcOpen && <FloatingCalculator onClose={() => setCalcOpen(false)} />}
        </>

{/* ── 화주사 수정요청 승인/거절 팝업 (T161) ── */}
{editReqPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4 shrink-0">
        <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.화주사 수정요청" defaultText="화주사 수정요청" /></h3>
        {editReqPopup.수정요청일시 && (
          <p className="text-white/70 text-[12px] mt-0.5">{_fmtKst(editReqPopup.수정요청일시)} 요청</p>
        )}
      </div>
      <div className="px-6 py-5 overflow-y-auto flex-1">
        {(() => {
          const diff = getEditRequestDiff(editReqPopup);
          if (diff.length === 0) return <p className="text-[14px] text-gray-500">변경된 내용이 없습니다.</p>;
          return (
            <div className="space-y-3">
              {diff.map((d, i) => (
                <div key={i} className="text-[14px] text-gray-800 leading-relaxed pb-3 border-b border-gray-50 last:border-b-0 last:pb-0">
                  <span className="font-bold">{d.label}</span>
                  <div className="mt-1 text-[13px] text-gray-500">
                    {String(d.before ?? "없음") || "없음"} <span className="mx-1 text-gray-400">→</span>{" "}
                    <span className="font-semibold text-emerald-700">{String(d.after ?? "없음") || "없음"}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end gap-2 shrink-0">
        <button
          onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await rejectEditRequestPC(o); }}
          className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-[13px] font-bold hover:bg-red-50 transition"
        ><EditableText id="misc.btn.7318.거절" defaultText="거절" /></button>
        <button
          onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await approveEditRequestPC(o); }}
          className="px-4 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"
        ><EditableText id="misc.btn.7322.승인" defaultText="승인" /></button>
      </div>
    </div>
  </div>
)}

{/* ── 화물내용 +추가 팝업 ── ⭐ 2026-11-02 리디자인(프로그램 스타일 · 단위는 버튼 · 미리보기 · Enter 추가 / Esc 닫기) */}
{cargoAddPopup && (() => {
  const closeCargo = () => { setCargoAddPopup(null); _setCargoAddQty(""); _setCargoAddType(""); };
  const parts = String(_cargoEditValue || "").split("+").filter(Boolean);
  const base = parts[0] || "";
  const extras = parts.slice(1);
  const pendingOf = (qty) => { const q = String(qty || "").trim(); return q ? (_cargoAddType ? `${q}${_cargoAddType}` : q) : ""; };
  const pending = pendingOf(_cargoAddQty);
  // qtyNow: 입력칸의 지금 글자(조합이 막 끝난 한글까지 포함) — 화면 상태가 아직 안 바뀌었어도 정확히 추가
  const addCargo = (qtyNow) => {
    const add = typeof qtyNow === "string" ? pendingOf(qtyNow) : pending;
    if (!add) return;
    const newVal = _cargoEditValue ? _cargoEditValue + "+" + add : add;
    _setCargoEditValue(newVal);
    cargoAddPopup.onCommit(newVal);
    _setCargoAddQty(""); _setCargoAddType("");
    setTimeout(() => document.querySelector("[data-cargo-add-input]")?.focus?.(), 0);
  };
  const removeExtra = (i) => {
    const newEx = extras.filter((_, j) => j !== i);
    const newVal = newEx.length ? base + "+" + newEx.join("+") : base;
    _setCargoEditValue(newVal);
    cargoAddPopup.onCommit(newVal);
  };
  const UNITS = ["", "파레트", "박스", "통", "롤"];
  return createPortal(
    <div data-cargo-popup="1" className="fixed inset-0 z-[9999999] bg-[#0B1428]/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      onMouseDown={closeCargo}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeCargo(); } }}>
      <div className="w-[440px] max-w-full bg-white rounded-[22px] shadow-[0_30px_80px_rgba(8,14,30,0.45)] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        {/* 머리 */}
        <div className="relative px-6 pt-5 pb-4 text-white" style={{ background: "radial-gradient(120% 140% at 0% 0%, #2D4C82 0%, #1B2B4B 45%, #0F1A30 100%)" }}>
          <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2"><span className="text-[17px] font-black">화물내용 추가</span><span className="text-[10.5px] font-extrabold tracking-[0.14em] text-[#8FB0F0]">CARGO</span></div>
              <div className="text-[12.5px] font-semibold text-[#C9D6EE] mt-1">기본 화물에 함께 싣는 항목을 더합니다</div>
            </div>
            <button type="button" onClick={closeCargo} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[14px] font-black" title="닫기 (Esc)">✕</button>
          </div>
          {/* 지금 화물내용 미리보기 */}
          <div className="relative mt-3.5 rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5">
            <div className="text-[11px] font-bold text-[#8FB0F0] mb-1">지금 화물내용</div>
            <div className="text-[15px] font-black break-all leading-snug">{_cargoEditValue ? String(_cargoEditValue).split("+").filter(Boolean).join(" + ") : <span className="text-white/50 font-bold">아직 없음</span>}</div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 등록된 추가 항목 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13.5px] font-black text-[#0F1A30]">추가된 항목</span>
              <span className="text-[12px] font-bold text-[#8E9BB2]">{extras.length}개 · ✕ 누르면 삭제</span>
            </div>
            {extras.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {extras.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-lg border border-[#C9D5EA] bg-[#F7F9FC] text-[13.5px] font-extrabold text-[#0F1A30]">
                    {item}
                    <button type="button" onClick={() => removeExtra(i)} title="삭제"
                      className="w-6 h-6 rounded-md grid place-items-center text-[#8E9BB2] hover:bg-[#FDECEC] hover:text-[#C0352B] text-[12px] font-black">✕</button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="h-10 rounded-xl border border-dashed border-[#D5DEEC] grid place-items-center text-[13px] font-bold text-[#9AA9C3]">추가된 항목이 없습니다</div>
            )}
          </div>

          {/* 새 항목 */}
          <div>
            <div className="text-[13.5px] font-black text-[#0F1A30] mb-2">새 항목</div>
            <input autoComplete="off"
              className="w-full h-11 px-3.5 rounded-xl border border-[#C9D5EA] bg-[#F9FBFE] text-[15px] font-bold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-semibold focus:outline-none focus:bg-white focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10"
              data-cargo-add-input="1"
              placeholder="수량 또는 내용 (예: 2 · 자동차 부품)"
              value={_cargoAddQty}
              onChange={e => _setCargoAddQty(e.target.value)}
              ref={imeFocusRef}
              onCompositionStart={() => { _cargoComposingRef.current = true; }}
              onCompositionEnd={(e) => {
                _cargoComposingRef.current = false;
                if (!_cargoEnterAfterImeRef.current) return;
                _cargoEnterAfterImeRef.current = false;
                addCargo(e.currentTarget.value);
              }}
              onKeyDown={e => {
                const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
                if (!isEnter) return;
                // 뒤에 깔린 오더 등록폼·복사/수정 패널의 Enter(저장·다음 칸 이동)로 넘어가지 않게
                e.preventDefault(); e.stopPropagation();
                if (e.nativeEvent?.isComposing || e.keyCode === 229 || _cargoComposingRef.current) { _cargoEnterAfterImeRef.current = true; return; }
                addCargo(e.currentTarget.value);
              }}
            />
            <div className="mt-2.5">
              <div className="text-[12px] font-bold text-[#5B6B85] mb-1.5">단위</div>
              <div className="grid grid-cols-5 gap-1.5">
                {UNITS.map((u) => (
                  <button key={u || "none"} type="button" onClick={() => _setCargoAddType(u)}
                    className={`h-9 rounded-lg text-[13px] font-extrabold border transition ${_cargoAddType === u ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#D5DEEC] text-[#3A4A66] hover:border-[#4B6CB7]"}`}>
                    {u || "없음"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 h-10 px-3.5 rounded-xl bg-[#EEF3FC] flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-[#5B6B85]">추가될 항목</span>
              <span className={`text-[14px] font-black ${pending ? "text-[#1B2B4B]" : "text-[#A7B3C6]"}`}>{pending || "—"}</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-2">
          <button type="button" onClick={closeCargo}
            className="h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-black text-[#3A4A66] hover:bg-[#F5F8FD]"><EditableText id="misc.btn.7406.닫기" defaultText="닫기" /></button>
          <button type="button" onClick={() => addCargo()} disabled={!pending}
            className="flex-1 h-11 rounded-xl bg-[#1B2B4B] text-white text-[14.5px] font-black hover:bg-[#0F1A30] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_8px_18px_rgba(15,26,48,0.22)]">
            <EditableText id="misc.btn.7404.추가" defaultText="추가" /> <span className="ml-1 text-[11px] font-bold text-white/55">ENTER</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
})()}

    </ToastProvider>
    </EditModeProvider>
    </OrderHistoryContext.Provider>
    </PlanValueProvider>
  );
}

function ToggleBadge({ active, onClick, activeCls, inactiveCls, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-1.5
        rounded-full
        text-xs font-semibold
        border
        transition
        active:scale-95
        ${active ? activeCls : inactiveCls}
      `}
    >
      {children}
    </button>
  );
}

// 🧩 2026-11-27 DispatchManagement → src/dispatch/DispatchManagement.jsx (처음 열 때 받는다)
const DispatchManagement = lazyView(() => import("./dispatch/DispatchManagement.jsx"));

 // ===================== DispatchApp.jsx (PART 4/8 — START) =====================

/* 메뉴용 실시간배차현황 — 배차현황과 100% 동일 컬럼/순서(+주소)
   role 지원: admin | user
*/
// ✅ RealtimeStatus 컴포넌트 위 (또는 아래)
function InlineEditCell({ value, placeholder, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div
        className="min-h-[24px] max-w-[120px] truncate text-[12px] text-gray-600 cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5"
        title={value || placeholder}
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      >
        {value || <span className="text-gray-400 text-[11px]">+메모</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input autoComplete="off"
        ref={inputRef}
        className="border border-blue-400 rounded px-1.5 py-0.5 text-[12px] w-[100px] outline-none focus:ring-1 focus:ring-blue-300"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => { onSave(draft); setEditing(false); }}
      />
    </div>
  );
}
function StopCountBadge({ count }) {
  if (!count || count <= 0) return null;

  return (
    <span
      className="
        ml-1
        px-1.5 py-0.5
        text-[10px] font-bold
        rounded-full
        bg-indigo-100 text-indigo-700
        border border-indigo-300
        whitespace-nowrap
      "
    >
      경유 {count}
    </span>
  );
}

// 🧩 2026-11-27 RealtimeStatus → src/dispatch/RealtimeStatus.jsx (처음 열 때 받는다)
const RealtimeStatus = lazyView(() => import("./dispatch/RealtimeStatus.jsx"));

function MemoMore({ text = "" }) {
  const [open, setOpen] = React.useState(false);
  const str = String(text);
  const isLong = str.length > 5;
  const short = isLong ? str.slice(0, 5) + "…" : str;

  return (
    <div className="relative inline-block">
      {/* 짧게 또는 전체 표시 */}
      <span>{open ? str : short}</span>

      {/* 더보기 버튼 */}
      {!open && isLong && (
        <button
          className="text-xs text-blue-600 underline ml-1"
          onClick={() => setOpen(true)}
        >
          더보기
        </button>
      )}

      {/* 전체보기 팝업 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white p-4 rounded-lg shadow-lg w-[380px] max-w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">메모 전체보기</h3>
            <div className="text-sm whitespace-pre-wrap break-words">{str}</div>

            <div className="text-right mt-4">
              <button
                className="px-3 py-1 bg-[#1B2B4B] text-white rounded"
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ===================== DispatchApp.jsx (PART 5/8 — 차량번호 항상 활성화 + 선택수정→수정완료 통합버튼 + 주소/메모 더보기 + 대용량업로드 + 신규 오더 등록) =====================

function generateTimeOptions() {
  const result = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const isPM = h >= 12;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      result.push(`${isPM ? "오후" : "오전"} ${hour12}시${m === 30 ? " 30분" : ""}`);
    }
  }
  return result;
}
// 🧩 2026-11-27 DispatchStatus → src/dispatch/DispatchStatus.jsx (처음 열 때 받는다)
const DispatchStatus = lazyView(() => import("./dispatch/DispatchStatus.jsx"));

/* ---------------------- 메모 더보기 ---------------------- */
function MemoCell({ text }) {
  const [showFull, setShowFull] = React.useState(false);
  if (!text) return <span className="text-gray-500">-</span>;

  const clean = String(text);
  const short = clean.length > 5 ? clean.slice(0, 5) + "…" : clean;

  return (
    <>
      <span>{showFull ? clean : short}</span>

      {clean.length > 5 && !showFull && (
        <button
          onClick={() => setShowFull(true)}
          className="text-blue-600 text-xs ml-1 underline"
        >
          더보기
        </button>
      )}

      {showFull && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowFull(false)}   // ✓ 바깥 클릭 닫기
        >
          <div
            className="bg-white p-4 rounded-lg shadow-lg w-[400px]"
            onClick={(e) => e.stopPropagation()} // ✓ 내부 클릭 전파 차단
          >
            <h3 className="font-semibold mb-2">메모 내용</h3>

            <div className="text-sm whitespace-pre-wrap">
              {clean}
            </div>

            <div className="text-right mt-3">
              <button
                onClick={() => setShowFull(false)} // ✓ ▲ 이게 핵심
                className="px-3 py-1 bg-[#1B2B4B] text-white rounded"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ===================== DispatchApp.jsx (PART 5/8 — END) =====================

// ===================== 손익보고서 컴포넌트 =====================
function ProfitLossReport({ dispatchData = [], fixedRows = [], clients = [], places = [], isViewer = false }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);
  const [manualData, setManualData] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [editingCell, setEditingCell] = React.useState(null); // { rowKey, month }
  const [importPreview, setImportPreview] = React.useState(null); // { parsed, fileName }

  // ⭐ 성능 최적화 — clients/places가 바뀔 때만 이름→플래그 Map을 새로 만들어
  // 월별 오더를 순수매출제외 여부로 분류할 때 매번 배열 스캔을 하지 않게 한다.
  const isExcludedFast = React.useMemo(
    () => buildNetRevenueExclusionLookup(clients, places),
    [clients, places]
  );

  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

  // Firestore 수동 데이터 로드
  React.useEffect(() => {
    async function load() {
      try {
        setManualData(await loadPlManual(db, year)); // ⭐ 회사별 문서
      } catch (e) {
        console.error("손익보고서 로드 오류:", e);
      }
    }
    load();
  }, [year]);

  // 수동 데이터 저장
  const saveManual = async (newData) => {
    if (isViewer) { alert("조회전용 권한으로는 저장할 수 없습니다."); return; }
    setSaving(true);
    try {
      await savePlManual(db, year, "", newData);
    } catch (e) {
      console.error("손익보고서 저장 오류:", e);
      alert(`저장 실패: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const updateCell = (rowKey, month, value) => {
    const numVal = parseInt(String(value).replace(/[^\d-]/g, ""), 10) || 0;
    const updated = {
      ...manualData,
      [rowKey]: { ...(manualData[rowKey] || {}), [month]: numVal },
    };
    setManualData(updated);
    saveManual(updated);
  };

  // 배차 데이터에서 월별 집계
  // ⚠️ 예전엔 dispatchRows/fixedMapped/allRows가 useMemo 없이 렌더마다 새 배열로
  // 다시 만들어져서, 아래 getAutoMonth의 useMemo([allRows, year])가 매번 "새
  // 참조"를 보고 매번 다시 계산하는 무의미한 메모가 됐었다(updateCell로 셀 하나만
  // 고쳐도 dispatchData 전체를 다시 filter/map). dispatchData/fixedRows가 실제로
  // 바뀔 때만 다시 계산하도록 묶는다.
  const allRows = React.useMemo(() => {
    const dispatchRows = Array.isArray(dispatchData)
      ? dispatchData.filter((r) => (r.배차상태 || "") === "배차완료")
      : [];
    const fixedMapped = (fixedRows || []).map((r) => ({
      상차일: r.날짜,
      청구운임: toInt(r.청구운임),
      기사운임: toInt(r.기사운임),
      배차방식: r.배차방식 || "",
      차량종류: r.차량종류 || "",
      배차상태: "배차완료",
      지급방식: r.지급방식 || "",
      실수수료: toInt(r.실수수료 != null ? r.실수수료 : (Number(r.수수료||0) - Number(r.선결제||0))),
      거래처명: r.거래처명 || "",
      __isFixed: true,
    }));
    return [...dispatchRows.map((r) => ({ ...r, 청구운임: toInt(r.청구운임), 기사운임: toInt(r.기사운임) })), ...fixedMapped];
  }, [dispatchData, fixedRows]);

  const getAutoMonth = React.useMemo(() => {
    const result = {};
    const addRow = (key, month, sale, cost) => {
      if (!result[key]) result[key] = {};
      if (!result[key][month]) result[key][month] = { sale: 0, cost: 0 };
      result[key][month].sale += sale;
      result[key][month].cost += cost;
    };
    allRows.forEach((r) => {
      if (!r.상차일) return;
      const rowYear = r.상차일.slice(0, 4);
      if (rowYear !== String(year)) return;
      const month = r.상차일.slice(5, 7);
      const sale = r.청구운임 || 0;
      const cost = r.기사운임 || 0;
      const bm = r.배차방식 || "";
      const client = String(r.거래처명 || "");
      const pay = String(r.지급방식 || "");

      // ── 매출 분류 ──
      if (isExcludedFast(client)) {
        addRow("rev_fresh", month, sale, 0);
      } else if (pay === "선불" || pay === "착불") {
        const cashAmt = r.__isFixed ? (r.실수수료 || 0) : Math.max(0, sale - cost);
        addRow("rev_cash", month, cashAmt, 0);
      } else {
        addRow("rev_freight", month, sale, 0);
      }

      // ── 매출원가(기사운임) 분류 ──
      // ⭐ 2026-11-07 규칙 점검 — 선불·착불은 화주가 기사에게 운임을 직접 주고 회사 매출은 수수료(청구−기사)만 잡는다.
      //   예전엔 매출은 수수료만 넣고 기사운임은 운반비(원가)에 그대로 더해 매출총이익이 기사운임만큼 줄어 보였다.
      if (!isExcludedFast(client) && (pay === "선불" || pay === "착불")) {
        // 원가 없음(매출 쪽에 이미 순수수료로 반영)
      } else if (bm === "인성") {
        addRow("cost_auto", month, 0, cost);
      } else if (isExcludedFast(client)) {
        addRow("cost_fresh", month, 0, cost);
      } else {
        addRow("cost_freight", month, 0, cost);
      }
      // ⭐ 2026-11-17 지게차·외부 특수운임(회사가 따로 지급)도 매출원가 — 매출총이익 = 배차표 수수료 합(선불·착불도 회사가 낸다)
      const extra = r.__isFixed ? 0 : paidOut(r);
      if (extra) addRow(bm === "인성" ? "cost_auto" : isExcludedFast(client) ? "cost_fresh" : "cost_freight", month, 0, extra);
    });
    return result;
  }, [allRows, year, clients, places]);

  const autoVal = (key, month, field = "sale") => {
    return (getAutoMonth[key] && getAutoMonth[key][month] && getAutoMonth[key][month][field]) || 0;
  };
  const manVal = (key, month) => (manualData[key] && manualData[key][month]) || 0;

  // 행별 월 합계
  const rowMonthTotal = (key, isAuto = false, field = "sale") => {
    return MONTHS.reduce((s, m) => s + (isAuto ? autoVal(key, m, field) : manVal(key, m)), 0);
  };

  // 월별 집계 함수들
  const totalRevenue = (month) =>
    autoVal("rev_freight", month) + autoVal("rev_cash", month) +
    autoVal("rev_fresh", month) + manVal("rev_etc", month);

  const totalCost = (month) =>
    autoVal("cost_freight", month, "cost") + autoVal("cost_auto", month, "cost") +
    autoVal("cost_fresh", month, "cost") + manVal("cost_labor", month);

  const grossProfit = (month) => totalRevenue(month) - totalCost(month);

  const sgaTotal = (month) =>
    ["sga_rent","sga_util","sga_comm","sga_ins","sga_repair","sga_fuel",
     "sga_adv","sga_welfare","sga_tax","sga_depr","sga_entertainment","sga_office","sga_misc"].reduce((s, k) => s + manVal(k, month), 0);

  const opProfit = (month) => grossProfit(month) - sgaTotal(month);

  const otherNet = (month) => manVal("other_income", month) - manVal("other_expense", month);

  const netProfit = (month) => opProfit(month) + otherNet(month);

  const won = (v) => {
    if (v === 0) return "–";
    return (v < 0 ? "-" : "") + Math.abs(Math.round(v)).toLocaleString();
  };

  const pct = (profit, revenue) => {
    if (!revenue) return "–";
    return (profit / revenue * 100).toFixed(1) + "%";
  };

  // 연간 합계
  const yearTotal = (fn) => MONTHS.reduce((s, m) => s + fn(m), 0);

  const cellClass = (v) => {
    if (v === 0) return "text-gray-400";
    return v > 0 ? "text-gray-800" : "text-rose-600";
  };

  const ManualCell = ({ rowKey, month }) => {
    const isEditing = editingCell && editingCell.rowKey === rowKey && editingCell.month === month;
    const val = manVal(rowKey, month);
    if (isEditing) {
      return (
        <td className="px-1 py-0.5 text-center border-r border-gray-100">
          <input autoComplete="off"
            inputMode="numeric"
            defaultValue={val ? Number(val).toLocaleString() : ""}
            className="w-full text-center text-[12px] border border-blue-400 rounded px-1 outline-none"
            autoFocus
            onChange={(e) => {
              // 금액 입력 중 천단위 콤마 자동 — 음수(-) 허용, 저장은 updateCell에서 숫자로 변환
              const t = e.target.value.trim();
              const d = t.replace(/[^\d]/g, "");
              e.target.value = (t.startsWith("-") ? "-" : "") + (d ? Number(d).toLocaleString() : "");
            }}
            onBlur={(e) => {
              updateCell(rowKey, month, e.target.value);
              setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); updateCell(rowKey, month, e.target.value); setEditingCell(null); }
              if (e.key === "Escape") { e.preventDefault(); setEditingCell(null); }
            }}
          />
        </td>
      );
    }
    return (
      <td
        className="px-1 py-0.5 text-center border-r border-gray-100 cursor-pointer hover:bg-blue-50 text-[12px] text-gray-700"
        onClick={() => setEditingCell({ rowKey, month })}
      >
        {val ? val.toLocaleString() : ""}
      </td>
    );
  };

  const AutoCell = ({ rowKey, month, field = "sale" }) => {
    const val = autoVal(rowKey, month, field);
    return (
      <td className={`px-1 py-0.5 text-center border-r border-gray-100 text-[12px] ${val ? "text-gray-700" : "text-gray-200"}`}>
        {val ? val.toLocaleString() : ""}
      </td>
    );
  };

  const CalcCell = ({ value, highlight = false }) => (
    <td className={`px-1 py-0.5 text-center border-r border-gray-100 text-[12px] font-semibold ${
      highlight ? profitCls(value, "text-gray-400") : cellClass(value) /* ⭐ 2026-11-17 이익 줄 — 플러스 빨강 · 마이너스 파랑 */
    }`}>
      {value !== 0 ? value.toLocaleString() : "–"}
    </td>
  );

  const RateCell = ({ profit, revenue }) => (
    <td className={`px-1 py-0.5 text-center border-r border-gray-100 text-[11px] font-medium ${
      revenue ? profitRateCls((profit / revenue) * 100, "text-gray-400") : "text-gray-400" /* ⭐ 2026-11-17 이익률 — 플러스 빨강 · 마이너스 파랑 */
    }`}>
      {pct(profit, revenue)}
    </td>
  );

  const momPct = (calcFn, month) => {
    const mIdx = MONTHS.indexOf(month);
    if (mIdx === 0) return null;
    const cur = calcFn(month);
    if (!cur) return null; // 이번 달 데이터 없으면 표시 안함
    const prev = calcFn(MONTHS[mIdx - 1]);
    if (!prev) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };

  const MomRow = ({ calcFn }) => (
    <tr className="border-t border-gray-50">
      <td className="px-3 py-0.5 text-[10px] text-gray-500 whitespace-nowrap border-r border-gray-200 pl-8">전월대비</td>
      {MONTHS.map(m => {
        const p = momPct(calcFn, m);
        if (p === null) return <td key={m} className="px-1 py-0.5 text-center border-r border-gray-100 text-[10px] text-gray-400">–</td>;
        const isPos = p >= 0;
        return (
          <td key={m} className="px-1 py-0.5 text-center border-r border-gray-100 text-[10px] font-semibold"
            style={{ color: isPos ? "#ef4444" : "#3b82f6" }}>
            {isPos ? "▲" : "▼"}{Math.abs(p).toFixed(1)}%
          </td>
        );
      })}
      <td className="px-1 py-0.5 border-r border-gray-100"/>
    </tr>
  );

  const SectionHeader = ({ label, bg = "#1B2B4B" }) => (
    <tr style={{backgroundColor: bg}}>
      <td colSpan={14} className="px-4 py-2 text-[13px] font-bold text-white tracking-widest uppercase">{label}</td>
    </tr>
  );

  const SubHeader = ({ label, note = "" }) => (
    <tr className="bg-gray-100 border-t border-gray-200">
      <td className="px-3 py-1 text-[12px] font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[140px]">
        {label}
        {note && <span className="ml-1 text-[10px] text-gray-500 font-normal">{note}</span>}
      </td>
      {MONTHS.map((m, i) => (
        <td key={m} className="px-1 py-1 text-center text-[11px] text-gray-500 font-medium border-r border-gray-200 w-[72px]">
          {MONTH_LABELS[i]}
        </td>
      ))}
      <td className="px-1 py-1 text-center text-[11px] text-gray-500 font-bold w-[80px]">합계</td>
    </tr>
  );

  const DataRow = ({ label, rowKey, isAuto = false, field = "sale", calcFn, isPct = false, isHighlight = false, indent = 0 }) => (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className={`px-3 py-1 text-[12px] text-gray-600 whitespace-nowrap border-r border-gray-200 ${indent ? "pl-6" : ""}`}>
        {label}
      </td>
      {MONTHS.map((m) => {
        if (calcFn && isPct) return <RateCell key={m} profit={calcFn(m)} revenue={totalRevenue(m)} />;
        if (calcFn) return <CalcCell key={m} value={calcFn(m)} highlight={isHighlight} />;
        if (isAuto) return <AutoCell key={m} rowKey={rowKey} month={m} field={field} />;
        return <ManualCell key={m} rowKey={rowKey} month={m} />;
      })}
      <td className="px-1 py-0.5 text-center text-[12px] font-semibold text-gray-800">
        {calcFn && isPct
          ? pct(yearTotal(calcFn), yearTotal(totalRevenue))
          : calcFn
            ? (yearTotal(calcFn) !== 0 ? yearTotal(calcFn).toLocaleString() : "–")
            : isAuto
              ? (rowMonthTotal(rowKey, true, field) ? rowMonthTotal(rowKey, true, field).toLocaleString() : "–")
              : (rowMonthTotal(rowKey, false) !== 0 ? rowMonthTotal(rowKey, false).toLocaleString() : "–")
        }
      </td>
    </tr>
  );

  const TotalRow = ({ label, calcFn, isHighlight = false, isPct = false, bold = true }) => (
    <tr className="bg-gray-50 border-t-2 border-gray-300">
      <td className={`px-3 py-1.5 text-[12px] border-r border-gray-200 ${bold ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>
        {label}
      </td>
      {MONTHS.map((m) => {
        const val = calcFn(m);
        if (isPct) return <RateCell key={m} profit={calcFn(m)} revenue={totalRevenue(m)} />;
        return (
          <td key={m} className={`px-1 py-1 text-center border-r border-gray-100 text-[12px] ${bold ? "font-bold" : "font-semibold"} ${
            isHighlight ? profitCls(val, "text-gray-400") : cellClass(val) /* ⭐ 2026-11-17 이익 합계 줄 — 플러스 빨강 · 마이너스 파랑 */
          }`}>
            {val !== 0 ? val.toLocaleString() : "–"}
          </td>
        );
      })}
      <td className={`px-1 py-1 text-center text-[12px] ${bold ? "font-bold" : "font-semibold"} ${
        isPct ? profitRateCls(yearTotal(totalRevenue) ? (yearTotal(calcFn) / yearTotal(totalRevenue)) * 100 : 0) : isHighlight
          ? profitCls(yearTotal(calcFn), "text-gray-400")
          : cellClass(yearTotal(calcFn))
      }`}>
        {isPct ? pct(yearTotal(calcFn), yearTotal(totalRevenue)) : (yearTotal(calcFn) !== 0 ? yearTotal(calcFn).toLocaleString() : "–")}
      </td>
    </tr>
  );

  const SGA_ITEMS = [
    { key: "sga_rent",          label: "임차료" },
    { key: "sga_util",          label: "공과금(전기/수도/가스)" },
    { key: "sga_comm",          label: "통신비" },
    { key: "sga_ins",           label: "보험료" },
    { key: "sga_repair",        label: "수선유지비" },
    { key: "sga_fuel",          label: "유류비" },
    { key: "sga_adv",           label: "광고선전비" },
    { key: "sga_welfare",       label: "복리후생비" },
    { key: "sga_tax",           label: "세금과공과" },
    { key: "sga_depr",          label: "감가상각비" },
    { key: "sga_entertainment", label: "접대비" },
    { key: "sga_office",        label: "사무용품비" },
    { key: "sga_misc",          label: "기타 판관비" },
  ];

  const VALID_MANUAL_KEYS = [
    "rev_etc","cost_labor","sga_rent","sga_util","sga_comm","sga_ins",
    "sga_repair","sga_fuel","sga_adv","sga_welfare","sga_tax","sga_depr",
    "sga_entertainment","sga_office","sga_misc","other_income","other_expense",
  ];

  const LABEL_TO_KEY = {
    // 매출
    "기타 매출": "rev_etc", "기타매출": "rev_etc",
    // 원가
    "인건비": "cost_labor",
    // 판관비
    "임차료": "sga_rent", "차량임차료": "sga_rent",
    "공과금(전기/수도/가스)": "sga_util", "공과금": "sga_util",
    "통신비": "sga_comm",
    "보험료": "sga_ins", "보험료(산재+고용)": "sga_ins",
    "수선유지비": "sga_repair", "차량유지비": "sga_repair",
    "유류비": "sga_fuel",
    "광고선전비": "sga_adv",
    "복리후생비": "sga_welfare",
    "세금과공과": "sga_tax", "세금과공과금": "sga_tax",
    "감가상각비": "sga_depr",
    "접대비": "sga_entertainment",
    "사무용품비": "sga_office",
    "소모품비": "sga_misc", "기타 판관비": "sga_misc", "기타판관비": "sga_misc",
    // 영업외
    "영업외 수익": "other_income", "영업외수익": "other_income",
    "영업외 비용": "other_expense", "영업외비용": "other_expense",
  };
  const KEY_TO_LABEL = {
    rev_etc: "기타 매출", cost_labor: "인건비", sga_rent: "차량임차료", sga_util: "공과금",
    sga_comm: "통신비", sga_ins: "보험료", sga_repair: "차량유지비", sga_fuel: "유류비",
    sga_adv: "광고선전비", sga_welfare: "복리후생비", sga_tax: "세금과공과금",
    sga_depr: "감가상각비", sga_entertainment: "접대비", sga_office: "사무용품비",
    sga_misc: "소모품비/기타 판관비", other_income: "영업외 수익", other_expense: "영업외 비용",
  };

  const handleExcelUpload = async (file) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      // Find header row — match "항 목", "항목", "구분", "rowKey" after stripping whitespace
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const first = String(rows[i][0] || "").replace(/\s+/g, "");
        if (["항목","구분","rowKey"].includes(first)) { headerRowIdx = i; break; }
      }
      if (headerRowIdx < 0) { alert("헤더 행(항목/구분)을 찾을 수 없습니다.\n서식 다운로드 후 해당 형식으로 작성해 주세요."); return; }
      const headerRow = rows[headerRowIdx] || [];
      const monthCols = {};
      headerRow.forEach((cell, ci) => {
        const m = String(cell || "").trim().match(/^(\d{1,2})월$/);
        if (m) monthCols[ci] = String(parseInt(m[1])).padStart(2, "0");
      });
      if (Object.keys(monthCols).length === 0) { alert("월 컬럼(1월~12월)을 찾을 수 없습니다. 헤더 형식을 확인하세요."); return; }
      // Parse rows → preview items
      const parsed = {}; // key → { month → value }
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const label = String(r[0] || "").trim();
        if (!label) continue;
        const key = LABEL_TO_KEY[label] || null;
        if (!key || !VALID_MANUAL_KEYS.includes(key)) continue;
        if (!parsed[key]) parsed[key] = {};
        Object.entries(monthCols).forEach(([ci, month]) => {
          const raw = r[ci];
          if (raw === "" || raw == null) return; // skip empty cells
          const v = parseFloat(String(raw).replace(/[^\d.-]/g, "")) || 0;
          parsed[key][month] = Math.round(v);
        });
      }
      if (Object.keys(parsed).length === 0) { alert("업로드할 수 있는 항목을 찾지 못했습니다.\n서식 다운로드 후 올바른 항목명으로 입력해 주세요."); return; }
      setImportPreview({ parsed, fileName: file.name });
    } catch (e) {
      console.error("엑셀 업로드 오류:", e);
      alert("파일 처리 중 오류가 발생했습니다: " + e.message);
    }
  };

  const applyImport = async () => {
    if (!importPreview) return;
    const updated = { ...manualData };
    Object.entries(importPreview.parsed).forEach(([key, months]) => {
      if (!updated[key]) updated[key] = {};
      Object.entries(months).forEach(([month, val]) => {
        updated[key][month] = val;
      });
    });
    setManualData(updated);
    setImportPreview(null);
    await saveManual(updated);
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const header = ["항목", "1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
    const sectionRows = [
      ["[기타 매출]"],
      ["기타 매출"],
      ["[매출원가]"],
      ["인건비"],
      ["[판매비와 관리비]"],
      ["복리후생비"],
      ["접대비"],
      ["세금과공과금"],
      ["차량유지비"],
      ["차량임차료"],
      ["광고선전비"],
      ["사무용품비"],
      ["소모품비"],
      ["통신비"],
      ["보험료(산재+고용)"],
      ["[영업외]"],
      ["영업외 수익"],
      ["영업외 비용"],
    ].map(row => {
      if (row[0].startsWith("[")) return [row[0], ...Array(12).fill("")]; // section header
      return [...row, ...Array(12).fill("")];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...sectionRows]);
    ws["!cols"] = [{ wch: 26 }, ...Array(12).fill({ wch: 11 })];
    // Bold section header rows
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, ws, `${year}`);
    XLSX.writeFile(wbOut, `손익보고서_서식_${year}년.xlsx`);
  };

  // ⭐ 거래처관리에서 "순수매출제외"로 체크한 거래처 — 하나도 없으면(대부분의
  // 운송사) 이 구분 자체가 의미 없으므로 관련 행을 아예 숨긴다. 라벨은 실제
  // 거래처명 대신 "제외 거래처"로 일반화해 표시한다.
  const excludedClientNames = getNetRevenueExcludedNames(clients, places);

  return (
    <div className="px-8 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[16px] font-bold text-[#1B2B4B]"><EditableText id="settlement.profitLoss.title" defaultText="손익보고서" /></h2>
          <p className="text-[12px] text-gray-500 mt-0.5">자동 집계 항목 외 수동 입력 항목은 셀을 클릭하거나 엑셀로 업로드하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[12px] text-blue-500">저장 중...</span>}
          <button onClick={downloadTemplate}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
            서식 다운로드
          </button>
          <label className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:opacity-90 transition cursor-pointer">
            엑셀 업로드
            <input autoComplete="off" type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files[0]; if (f) handleExcelUpload(f); e.target.value = ""; }} />
          </label>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-[13px]">◀</button>
            <span className="px-3 py-1 font-bold text-[14px] text-[#1B2B4B]">{year}년</span>
            <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-[13px]">▶</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full border-collapse text-[12px]">
          <tbody>

            {/* ── 매출 ── */}
            <SectionHeader label="매출" bg="#1B2B4B" />
            <SubHeader label="구분" />
            <DataRow label="화물주선 매출" rowKey="rev_freight" isAuto field="sale" indent={0} />
            <DataRow label="선착불 수수료" rowKey="rev_cash" isAuto field="sale" />
            {excludedClientNames.length > 0 && (
              <DataRow label="제외 거래처 매출" rowKey="rev_fresh" isAuto field="sale" />
            )}
            <DataRow label="기타 매출" rowKey="rev_etc" />
            <TotalRow label="매출액 합계" calcFn={totalRevenue} />
            <MomRow calcFn={totalRevenue} />

            {/* ── 매출원가 ── */}
            <SectionHeader label="매출원가" />
            <SubHeader label="구분" />
            <DataRow label="화물주선 운반비" rowKey="cost_freight" isAuto field="cost" />
            <DataRow label="오토바이(인성) 운반비" rowKey="cost_auto" isAuto field="cost" />
            {excludedClientNames.length > 0 && (
              <DataRow label="제외 거래처 운반비" rowKey="cost_fresh" isAuto field="cost" />
            )}
            <DataRow label="인건비" rowKey="cost_labor" />
            <TotalRow label="매출원가 합계" calcFn={totalCost} />
            <MomRow calcFn={totalCost} />

            {/* ── 매출총이익 ── */}
            <SectionHeader label="매출총이익" />
            <TotalRow label="매출총이익" calcFn={grossProfit} isHighlight />
            <MomRow calcFn={grossProfit} />
            <TotalRow label="매출총이익률" calcFn={grossProfit} isPct />

            {/* ── 판매관리비 ── */}
            <SectionHeader label="판매관리비 (판관비)" />
            <SubHeader label="구분" />
            {SGA_ITEMS.map(({ key, label }) => (
              <DataRow key={key} label={label} rowKey={key} />
            ))}
            <TotalRow label="판관비 합계" calcFn={sgaTotal} />

            {/* ── 영업이익 ── */}
            <SectionHeader label="영업이익" />
            <TotalRow label="영업이익" calcFn={opProfit} isHighlight />
            <MomRow calcFn={opProfit} />
            <TotalRow label="영업이익률" calcFn={opProfit} isPct />

            {/* ── 영업외손익 ── */}
            <SectionHeader label="영업외손익" />
            <SubHeader label="구분" />
            <DataRow label="영업외 수익" rowKey="other_income" />
            <DataRow label="영업외 비용" rowKey="other_expense" />
            <TotalRow label="영업외손익 합계" calcFn={otherNet} bold={false} />

            {/* ── 당기순이익 ── */}
            <SectionHeader label="당기순이익" bg="#1B2B4B" />
            <TotalRow label="당기순이익" calcFn={netProfit} isHighlight />
            <MomRow calcFn={netProfit} />
            <TotalRow label="순이익률" calcFn={netProfit} isPct />

          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-gray-500">* 자동: 배차완료 기준 청구운임(매출) / 기사운임(운반비) 자동 집계 &nbsp;|&nbsp; 빈 셀을 클릭하면 직접 입력할 수 있고, 입력한 값은 바로 저장됩니다</p>

      {/* ── 엑셀 업로드 미리보기 모달 ── */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <div className="text-white font-bold text-[15px]"><EditableText id="settlement.uploadPreview.title" defaultText="업로드 미리보기" /></div>
                <div className="text-white/50 text-[12px] mt-0.5">{importPreview.fileName} · {Object.keys(importPreview.parsed).length}개 항목 인식됨</div>
              </div>
              <button className="text-white/50 hover:text-white text-xl leading-none" onClick={() => setImportPreview(null)}>×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 border border-gray-200 font-semibold text-gray-600 w-[160px]"><EditableText id="settlement.uploadPreview.header.항목" defaultText="항목" /></th>
                    {MONTH_LABELS.map((m, i) => (
                      <th key={m} className="px-1 py-2 border border-gray-200 font-semibold text-gray-600 text-center w-[44px]">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {VALID_MANUAL_KEYS.map(key => {
                    const importedRow = importPreview.parsed[key];
                    if (!importedRow) return null;
                    const currentRow = manualData[key] || {};
                    const hasDiff = MONTHS.some(m => (importedRow[m] ?? null) !== null && importedRow[m] !== (currentRow[m] || 0));
                    return (
                      <tr key={key} className={hasDiff ? "bg-blue-50" : ""}>
                        <td className="px-3 py-1.5 border border-gray-100 font-semibold text-gray-700">{KEY_TO_LABEL[key] || key}</td>
                        {MONTHS.map(m => {
                          const imported = importedRow[m] ?? null;
                          const current = currentRow[m] || 0;
                          const changed = imported !== null && imported !== current;
                          return (
                            <td key={m} className={`px-1 py-1.5 border border-gray-100 text-right ${changed ? "text-[#1B2B4B] font-bold" : "text-gray-500"}`}>
                              {imported !== null ? (
                                <span>
                                  {changed && current !== 0 && <span className="text-gray-400 line-through text-[10px] block">{current.toLocaleString()}</span>}
                                  <span>{imported !== 0 ? imported.toLocaleString() : "–"}</span>
                                </span>
                              ) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }).filter(Boolean)}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-500 mt-3">파란색 배경 = 변경되는 항목 · 굵은 글씨 = 현재 값과 다른 항목 · 취소선 = 기존 값</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
              <button className="px-5 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50" onClick={() => setImportPreview(null)}><EditableText id="misc.btn.42603.취소" defaultText="취소" /></button>
              <button className="px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a]" onClick={applyImport}><EditableText id="misc.btn.42604.적용" defaultText="적용" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== 회계자료 컴포넌트 =====================
// ⭐ 2026-11-17 화면은 src/AcctLedgerBooks.jsx(장부 모양)로 옮겼다 — 이 함수는 예전 모양 참고용으로 남겨 둠(계산을 바꾸면 두 곳 다)
// eslint-disable-next-line no-unused-vars
function AccountingDashboard({ dispatchData = [], fixedRows = [], clients = [], drivers = [], isViewer = false }) {
  const currentYear = new Date().getFullYear();
  const [subTab, setSubTab] = React.useState("ar");
  const [year, setYear] = React.useState(currentYear);
  const [arPayments, setArPayments] = React.useState({});
  const [apPayments, setApPayments] = React.useState({});
  const [arModal, setArModal] = React.useState(null);
  const [apModal, setApModal] = React.useState(null);
  const [arInput, setArInput] = React.useState("");
  const [apInput, setApInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [vatQuarter, setVatQuarter] = React.useState("Q1");

  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];

  React.useEffect(() => {
    async function load() {
      try {
        const d = await loadAcctPayments(db, year); // ⭐ 회사별 문서
        setArPayments(d.ar || {});
        setApPayments(d.ap || {});
      } catch (e) { console.error(e); }
    }
    load();
  }, [year]);

  const yearOrders = React.useMemo(() => {
    const all = [
      ...(dispatchData || []).filter(r => r.배차상태 === "배차완료"),
      ...(fixedRows || []).map(r => ({ ...r, 상차일: r.날짜, 배차상태: "배차완료" })),
    ];
    return all.filter(r => (r.상차일 || "").slice(0, 4) === String(year));
  }, [dispatchData, fixedRows, year]);

  // ⭐ 2026-11-07 청구액 = 부가세 포함(거래처정산 미수금과 같은 식 · 수금 기록은 실제 입금액) — 회계 개요·일일 경영 보고·경영 분석·AI 비서와 같은 계산
  //   연체 구분 = 아직 못 받은 청구 중 가장 오래된 것의 경과일(오래된 청구부터 수금된 것으로 봄)
  const arByClient = React.useMemo(() => {
    const todayK = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    return receivablesOf({ orders: yearOrders, paid: arPayments, today: todayK, year: String(year) })
      .map((x) => ({ client: x.client, invoiced: x.billed, paid: x.paid, outstanding: x.outstanding, ageDays: x.oldest }));
  }, [yearOrders, arPayments, year]);

  const apByDriver = React.useMemo(() => {
    const map = {};
    yearOrders.forEach(r => {
      const d = r.이름 || "미지정";
      if (!map[d]) map[d] = { total: 0, carNo: r.차량번호 || "", settled: 0 };
      map[d].total += toInt(r.기사운임);
      // ⭐ 2026-11-01 정산관리 › 지급관리에서 [지급완료]한 오더도 지급액으로 본다(두 화면 숫자가 달랐음)
      if ((r.지급상태 || "") === "지급완료") map[d].settled += toInt(r.기사운임);
    });
    return Object.entries(map).map(([d, v]) => {
      const paid = Math.max(apPayments[d] || 0, v.settled);
      return { driver: d, carNo: v.carNo, total: v.total, paid, outstanding: Math.max(0, v.total - paid) };
    }).sort((a, b) => b.outstanding - a.outstanding);
  }, [yearOrders, apPayments]);

  const vatData = React.useMemo(() => {
    const m = {};
    MONTHS.forEach(mo => { m[mo] = { sales: 0, costs: 0 }; });
    // ⭐ 2026-11-07 예상 부가세 — 매출 = 지급방식 계산서 오더 · 매입 = 세금계산서 발행 기사(기사관리) 운임(회계 개요와 같은 계산)
    const invPlates = invoiceDriverPlates(drivers);
    yearOrders.forEach(r => {
      const mo = (r.상차일 || "").slice(5, 7);
      if (!m[mo]) return;
      if (isTaxInvoiceSale(r)) m[mo].sales += toInt(r.청구운임);
      if (invPlates.has(String(r.차량번호 || "").replace(/\s+/g, "").toUpperCase())) m[mo].costs += toInt(r.기사운임);
    });
    const quarters = { Q1: [0,1,2], Q2: [3,4,5], Q3: [6,7,8], Q4: [9,10,11] };
    const qData = {};
    Object.entries(quarters).forEach(([q, idxs]) => {
      const mos = idxs.map(i => MONTHS[i]);
      qData[q] = {
        sales: mos.reduce((s, mo) => s + m[mo].sales, 0),
        costs: mos.reduce((s, mo) => s + m[mo].costs, 0),
        months: mos.map(mo => ({ mo, ...m[mo] })),
      };
    });
    return { monthly: m, quarters: qData };
  }, [yearOrders, drivers]);

  const costByType = React.useMemo(() => {
    const map = {};
    yearOrders.forEach(r => {
      const t = r.차량종류 || "미분류";
      if (!map[t]) map[t] = { sales: 0, costs: 0, count: 0 };
      map[t].sales += toInt(r.청구운임);
      map[t].costs += toInt(r.기사운임);
      map[t].count++;
    });
    return Object.entries(map).map(([t, v]) => ({
      type: t, ...v,
      profit: v.sales - v.costs,
      margin: v.sales > 0 ? (v.sales - v.costs) / v.sales * 100 : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [yearOrders]);

  const costByMethod = React.useMemo(() => {
    const map = {};
    yearOrders.forEach(r => {
      const t = r.배차방식 || "직접";
      if (!map[t]) map[t] = { sales: 0, costs: 0, count: 0 };
      map[t].sales += toInt(r.청구운임);
      map[t].costs += toInt(r.기사운임);
      map[t].count++;
    });
    return Object.entries(map).map(([t, v]) => ({
      method: t, ...v,
      profit: v.sales - v.costs,
      margin: v.sales > 0 ? (v.sales - v.costs) / v.sales * 100 : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [yearOrders]);

  const totalInvoiced = arByClient.reduce((s, r) => s + r.invoiced, 0);
  const totalArPaid = arByClient.reduce((s, r) => s + r.paid, 0);
  const totalAr = arByClient.reduce((s, r) => s + r.outstanding, 0);
  const totalAp = apByDriver.reduce((s, r) => s + r.total, 0);
  const totalApPaid = apByDriver.reduce((s, r) => s + r.paid, 0);
  const totalApOutstanding = apByDriver.reduce((s, r) => s + r.outstanding, 0);

  const won = (v) => v === 0 ? "–" : (v < 0 ? "-" : "") + Math.abs(Math.round(v)).toLocaleString();

  const ageLabel = (days) => {
    if (days <= 30) return { label: "30일 이내", color: "#374151" };
    if (days <= 60) return { label: "31~60일", color: "#b45309" };
    if (days <= 90) return { label: "61~90일", color: "#c2410c" };
    return { label: "90일 초과", color: "#b91c1c" };
  };

  const savePayment = async (type, name, amtStr) => {
    if (isViewer) { alert("조회전용 권한으로는 저장할 수 없습니다."); return; }
    const amt = parseInt(String(amtStr).replace(/[^\d]/g, ""), 10) || 0;
    if (!amt) return;
    setSaving(true);
    try {
      const newAr = type === "ar" ? { ...arPayments, [name]: (arPayments[name] || 0) + amt } : arPayments;
      const newAp = type === "ap" ? { ...apPayments, [name]: (apPayments[name] || 0) + amt } : apPayments;
      await saveAcctPayments(db, year, "", newAr, newAp);
      // 🔗 2026-11-01 거래처 수금 → 수입·지출 장부(수입)·자금 잔액 자동 반영. 기사 지급은 정산관리 › 지급관리 [지급완료]가 장부에 반영한다(이중 기록 방지)
      if (type === "ar") addClientCollection(db, { name, amount: amt, year }).catch(() => {});
      setArPayments(newAr);
      setApPayments(newAp);
    } catch (e) { console.error(e); alert(`저장 실패: ${e?.message || e}`); } finally { setSaving(false); }
  };

  const resetPayment = async (type, name) => {
    if (isViewer) { alert("조회전용 권한으로는 초기화할 수 없습니다."); return; }
    if (!await kpConfirm(`${name}의 ${type === "ar" ? "수금" : "지급"} 내역을 초기화하시겠습니까?`)) return;
    setSaving(true);
    try {
      const newAr = type === "ar" ? { ...arPayments, [name]: 0 } : arPayments;
      const newAp = type === "ap" ? { ...apPayments, [name]: 0 } : apPayments;
      await saveAcctPayments(db, year, "", newAr, newAp);
      if (type === "ar") removeClientCollections(db, { name, year }).catch(() => {});
      setArPayments(newAr);
      setApPayments(newAp);
    } catch (e) { console.error(e); alert(`초기화 실패: ${e?.message || e}`); } finally { setSaving(false); }
  };

  const exportVatExcel = async () => {
    const XLSX = await import("xlsx");
    const qd = vatData.quarters[vatQuarter];
    const moLabels = { "01":"1월","02":"2월","03":"3월","04":"4월","05":"5월","06":"6월","07":"7월","08":"8월","09":"9월","10":"10월","11":"11월","12":"12월" };
    const header = ["월","공급가액(매출)","매출세액(10%)","매입공급가액","매입세액(10%)","납부세액"];
    const rows = qd.months.map(({ mo, sales, costs }) => [
      moLabels[mo], sales, Math.round(sales * 0.1), costs, Math.round(costs * 0.1), Math.round(sales * 0.1) - Math.round(costs * 0.1),
    ]);
    const totalRow = ["합계", qd.sales, Math.round(qd.sales*0.1), qd.costs, Math.round(qd.costs*0.1), Math.round(qd.sales*0.1)-Math.round(qd.costs*0.1)];
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
    ws["!cols"] = [{ wch: 8 }, ...Array(5).fill({ wch: 16 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `부가세_${year}_${vatQuarter}`);
    XLSX.writeFile(wb, `부가세신고자료_${year}_${vatQuarter}.xlsx`);
  };

  const KpiCard = ({ label, value, sub, highlight }) => (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 14px", minWidth: 0 }}>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1"><EditableText id={`settlement.accounting.kpi.${label}`} defaultText={label} /></div>
      <div className={`text-[17px] sm:text-[20px] font-bold whitespace-nowrap tabular-nums ${highlight === "danger" ? "text-red-600" : highlight === "ok" ? "text-emerald-700" : "text-[#1B2B4B]"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
    </div>
  );

  // ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억
  const acArSort = useTableSort("accounting.ar");
  const acApSort = useTableSort("accounting.ap");
  const acTypeSort = useTableSort("accounting.costByType");
  const acMethodSort = useTableSort("accounting.costByMethod");
  const AC_AR_KEY = { "거래처": "client", "청구액": "invoiced", "수금액": "paid", "미수금": "outstanding", "연체 구분": "ageDays" };
  const AC_AP_KEY = { "기사명": "driver", "차량번호": "carNo", "기사운임 합계": "total", "지급액": "paid", "미지급": "outstanding" };
  const AC_COST_KEY = { "차량 종류": "type", "배차 방식": "method", "건수": "count", "매출": "sales", "원가(기사운임)": "costs", "원가": "costs", "이익": "profit", "이익률": "margin" };
  const arByClientSorted = React.useMemo(() => sortRows(arByClient, acArSort.sort, (r, k) => (k === "연체 구분" ? (r.outstanding > 0 ? r.ageDays : -1) : r[AC_AR_KEY[k]])), [arByClient, acArSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const apByDriverSorted = React.useMemo(() => sortRows(apByDriver, acApSort.sort, (r, k) => r[AC_AP_KEY[k]]), [apByDriver, acApSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const costByTypeSorted = React.useMemo(() => sortRows(costByType, acTypeSort.sort, (r, k) => r[AC_COST_KEY[k]]), [costByType, acTypeSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const costByMethodSorted = React.useMemo(() => sortRows(costByMethod, acMethodSort.sort, (r, k) => r[AC_COST_KEY[k]]), [costByMethod, acMethodSort.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const thStyle = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: ".06em", textTransform: "uppercase", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", background: "#f8f9fb" };
  const tdStyle = { padding: "9px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f0f2f5", whiteSpace: "nowrap" }; // ⭐ 2026-11-02 화면 점검 — 금액 "원"이 다음 줄로 떨어지던 문제
  const tdR = { ...tdStyle, textAlign: "right" };

  const currentQData = vatData.quarters[vatQuarter] || { sales: 0, costs: 0, months: [] };
  const vatOutput = Math.round(currentQData.sales * 0.1);
  const vatInput = Math.round(currentQData.costs * 0.1);
  const vatNet = vatOutput - vatInput;

  return (
    <div className="px-4 sm:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-[#1B2B4B]"><EditableText id="settlement.accounting.title" defaultText="회계자료" /></h2>
          <p className="text-[12px] text-gray-500 mt-0.5">미수금·지급현황·부가세·원가분석을 한 곳에서 관리하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[12px] text-blue-500">저장 중...</span>}
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-[13px]">◀</button>
            <span className="px-3 py-1 font-bold text-[14px] text-[#1B2B4B]">{year}년</span>
            <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-[13px]">▶</button>
          </div>
        </div>
      </div>

      {/* 서브탭 */}
      <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
        {[["ar","미수금 현황"],["ap","지급 현황"],["vat","부가세 자료"],["cost","원가 분석"]].map(([k, label]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`shrink-0 whitespace-nowrap px-3 sm:px-5 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${subTab === k ? "border-[#1B2B4B] text-[#1B2B4B]" : "border-transparent text-gray-500 hover:text-gray-600"}`}>
            <EditableText id={`settlement.accounting.subtab.${k}`} defaultText={label} />
          </button>
        ))}
      </div>

      {/* ── 미수금 현황 ── */}
      {subTab === "ar" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="총 청구액" value={`${won(totalInvoiced)}원`} sub="부가세 포함 · 고정거래처 포함" />
            <KpiCard label="수금 완료" value={`${won(totalArPaid)}원`} highlight="ok" />
            <KpiCard label="미수금 잔액" value={`${won(totalAr)}원`} highlight={totalAr > 0 ? "danger" : "ok"} />
            <KpiCard label="미수금 비율" value={totalInvoiced > 0 ? `${(totalAr / totalInvoiced * 100).toFixed(1)}%` : "–"} sub="미수금 / 청구액" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {["거래처","청구액","수금액","미수금","연체 구분",""].map((h, i) => (
                    <SortTh key={i} k={h} sort={acArSort.sort} onSort={acArSort.toggle} align={i >= 1 && i <= 3 ? "right" : "left"} style={{ ...thStyle, textAlign: i >= 1 && i <= 3 ? "right" : "left" }}>{h && <EditableText id={`settlement.ar.header.${h}`} defaultText={h} />}</SortTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {arByClient.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>배차완료 데이터가 없습니다</td></tr>
                ) : arByClientSorted.map(r => {
                  const age = ageLabel(r.ageDays);
                  return (
                    <tr key={r.client} style={{ background: r.outstanding > 0 ? "#fff" : "#f9fafb" }}>
                      <td style={tdStyle}><span className="font-semibold">{r.client}</span></td>
                      <td style={tdR}>{r.invoiced.toLocaleString()}</td>
                      <td style={tdR}>{r.paid > 0 ? r.paid.toLocaleString() : "–"}</td>
                      <td style={{ ...tdR, fontWeight: r.outstanding > 0 ? 700 : 400, color: r.outstanding > 0 ? "#b91c1c" : "#6b7280" }}>
                        {r.outstanding > 0 ? r.outstanding.toLocaleString() : "–"}
                      </td>
                      <td style={tdStyle}>
                        {r.outstanding > 0 ? <span style={{ fontSize: 12, fontWeight: 600, color: age.color }}>{age.label}</span> : <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>수금완료</span>}
                      </td>
                      <td style={tdStyle}>
                        <div className="flex gap-1.5">
                          <button onClick={() => { setArModal(r.client); setArInput(""); }}
                            className="px-2.5 py-1 rounded-md bg-[#1B2B4B] text-white text-[11px] font-bold hover:opacity-80 transition">
                            입금 처리
                          </button>
                          {r.paid > 0 && (
                            <button onClick={() => resetPayment("ar", r.client)}
                              className="px-2 py-1 rounded-md border border-gray-200 text-gray-500 text-[11px] hover:bg-gray-50 transition">
                              초기화
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500">* 배차완료 기준 청구운임 합계입니다. 입금 처리한 내역은 바로 저장됩니다.</p>
        </div>
      )}

      {/* ── 지급 현황 ── */}
      {subTab === "ap" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="총 기사운임" value={`${won(totalAp)}원`} />
            <KpiCard label="지급 완료" value={`${won(totalApPaid)}원`} highlight="ok" />
            <KpiCard label="미지급 잔액" value={`${won(totalApOutstanding)}원`} highlight={totalApOutstanding > 0 ? "danger" : "ok"} />
            <KpiCard label="미지급 비율" value={totalAp > 0 ? `${(totalApOutstanding / totalAp * 100).toFixed(1)}%` : "–"} sub="미지급 / 기사운임" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {["기사명","차량번호","기사운임 합계","지급액","미지급",""].map((h, i) => (
                    <SortTh key={i} k={h} sort={acApSort.sort} onSort={acApSort.toggle} align={i >= 2 && i <= 4 ? "right" : "left"} style={{ ...thStyle, textAlign: i >= 2 && i <= 4 ? "right" : "left" }}>{h && <EditableText id={`settlement.ap.header.${h}`} defaultText={h} />}</SortTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apByDriver.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>배차완료 데이터가 없습니다</td></tr>
                ) : apByDriverSorted.map(r => (
                  <tr key={r.driver} style={{ background: r.outstanding > 0 ? "#fff" : "#f9fafb" }}>
                    <td style={tdStyle}><span className="font-semibold">{r.driver}</span></td>
                    <td style={tdStyle}>{r.carNo || "–"}</td>
                    <td style={tdR}>{r.total.toLocaleString()}</td>
                    <td style={tdR}>{r.paid > 0 ? r.paid.toLocaleString() : "–"}</td>
                    <td style={{ ...tdR, fontWeight: r.outstanding > 0 ? 700 : 400, color: r.outstanding > 0 ? "#b91c1c" : "#6b7280" }}>
                      {r.outstanding > 0 ? r.outstanding.toLocaleString() : "–"}
                    </td>
                    <td style={tdStyle}>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setApModal(r.driver); setApInput(""); }}
                          className="px-2.5 py-1 rounded-md bg-[#1B2B4B] text-white text-[11px] font-bold hover:opacity-80 transition">
                          지급 처리
                        </button>
                        {r.paid > 0 && (
                          <button onClick={() => resetPayment("ap", r.driver)}
                            className="px-2 py-1 rounded-md border border-gray-200 text-gray-500 text-[11px] hover:bg-gray-50 transition">
                            초기화
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500">* 배차완료 기준 기사운임 합계입니다. 지급 처리한 내역은 바로 저장됩니다.</p>
        </div>
      )}

      {/* ── 부가세 자료 ── */}
      {subTab === "vat" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-600">분기 선택</span>
            {["Q1","Q2","Q3","Q4"].map(q => (
              <button key={q} onClick={() => setVatQuarter(q)}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold border transition ${vatQuarter === q ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {q} ({q === "Q1" ? "1~3월" : q === "Q2" ? "4~6월" : q === "Q3" ? "7~9월" : "10~12월"})
              </button>
            ))}
            <button onClick={exportVatExcel}
              className="ml-auto px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:opacity-90 transition">
              엑셀 내보내기
            </button>
          </div>

          {/* 분기 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard label="계산서 매출 공급가액" value={`${currentQData.sales.toLocaleString()}원`} />
            <KpiCard label="매출세액 (10%)" value={`${vatOutput.toLocaleString()}원`} />
            <KpiCard label="계산서 받는 기사 운임" value={`${currentQData.costs.toLocaleString()}원`} sub="기사관리 세금계산서 발행 기사" />
            <KpiCard label="매입세액 (10%)" value={`${vatInput.toLocaleString()}원`} />
            <KpiCard label="예상 납부세액" value={`${vatNet.toLocaleString()}원`} highlight={vatNet > 0 ? "danger" : "ok"} sub="매출세액 − 매입세액(추정)" />
            <KpiCard label="과세 기준" value="일반과세" sub="10% 부가가치세 적용" />
          </div>

          {/* 월별 명세 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {["월","계산서 매출","매출세액","기사 운임(계산서)","매입세액","납부세액"].map((h, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: i === 0 ? "left" : "right" }}><EditableText id={`settlement.vatMonthly.header.${h}`} defaultText={h} /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentQData.months.map(({ mo, sales, costs }) => {
                  const vOut = Math.round(sales * 0.1);
                  const vIn = Math.round(costs * 0.1);
                  const vNet = vOut - vIn;
                  const moLabel = { "01":"1월","02":"2월","03":"3월","04":"4월","05":"5월","06":"6월","07":"7월","08":"8월","09":"9월","10":"10월","11":"11월","12":"12월" }[mo];
                  return (
                    <tr key={mo}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{moLabel}</td>
                      <td style={tdR}>{sales > 0 ? sales.toLocaleString() : "–"}</td>
                      <td style={tdR}>{vOut > 0 ? vOut.toLocaleString() : "–"}</td>
                      <td style={tdR}>{costs > 0 ? costs.toLocaleString() : "–"}</td>
                      <td style={tdR}>{vIn > 0 ? vIn.toLocaleString() : "–"}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: vNet > 0 ? "#b91c1c" : vNet < 0 ? "#059669" : "#374151" }}>
                        {vNet !== 0 ? vNet.toLocaleString() : "–"}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#f8f9fb", borderTop: "2px solid #e5e7eb" }}>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>합계</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{currentQData.sales > 0 ? currentQData.sales.toLocaleString() : "–"}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{vatOutput > 0 ? vatOutput.toLocaleString() : "–"}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{currentQData.costs > 0 ? currentQData.costs.toLocaleString() : "–"}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{vatInput > 0 ? vatInput.toLocaleString() : "–"}</td>
                  <td style={{ ...tdR, fontWeight: 800, color: vatNet > 0 ? "#b91c1c" : vatNet < 0 ? "#059669" : "#374151" }}>
                    {vatNet !== 0 ? vatNet.toLocaleString() : "–"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500">* 매출세액은 지급방식 계산서 오더 청구운임, 매입세액은 기사관리에서 세금계산서 발행 기사로 켠 기사의 운임으로 셉니다. 실제 신고는 세무사 확인을 권장합니다.</p>
        </div>
      )}

      {/* ── 원가 분석 ── */}
      {subTab === "cost" && (
        <div className="space-y-5">
          {/* 차량 종류별 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-[#1B2B4B]">
              <span className="text-[13px] font-bold text-white"><EditableText id="settlement.costByType.title" defaultText="차량 종류별 원가 분석" /></span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    {["차량 종류","건수","매출","원가(기사운임)","이익","이익률"].map((h, i) => (
                      <SortTh key={i} k={h} sort={acTypeSort.sort} onSort={acTypeSort.toggle} align={i >= 1 ? "right" : "left"} style={{ ...thStyle, textAlign: i >= 1 ? "right" : "left" }}><EditableText id={`settlement.costByType.header.${h}`} defaultText={h} /></SortTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costByType.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>데이터 없음</td></tr>
                  ) : costByTypeSorted.map(r => (
                    <tr key={r.type}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.type}</td>
                      <td style={tdR}>{r.count.toLocaleString()}</td>
                      <td style={tdR}>{r.sales.toLocaleString()}</td>
                      <td style={tdR}>{r.costs.toLocaleString()}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: r.profit >= 0 ? "#1B2B4B" : "#b91c1c" }}>{r.profit.toLocaleString()}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: r.margin >= 15 ? "#059669" : r.margin >= 8 ? "#374151" : "#b91c1c" }}>
                        {r.margin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {costByType.length > 0 && (() => {
                    const ts = costByType.reduce((s, r) => s + r.sales, 0);
                    const tc = costByType.reduce((s, r) => s + r.costs, 0);
                    const tp = ts - tc;
                    return (
                      <tr style={{ background: "#f8f9fb", borderTop: "2px solid #e5e7eb" }}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>합계</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{costByType.reduce((s, r) => s + r.count, 0).toLocaleString()}</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{ts.toLocaleString()}</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{tc.toLocaleString()}</td>
                        <td style={{ ...tdR, fontWeight: 800, color: tp >= 0 ? "#1B2B4B" : "#b91c1c" }}>{tp.toLocaleString()}</td>
                        <td style={{ ...tdR, fontWeight: 800, color: ts > 0 && tp/ts*100 >= 15 ? "#059669" : "#374151" }}>{ts > 0 ? (tp/ts*100).toFixed(1) : "0.0"}%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* 배차방식별 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-[#1B2B4B]">
              <span className="text-[13px] font-bold text-white"><EditableText id="settlement.costByMethod.title" defaultText="배차 방식별 원가 분석" /></span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    {["배차 방식","건수","매출","원가","이익","이익률"].map((h, i) => (
                      <SortTh key={i} k={h} sort={acMethodSort.sort} onSort={acMethodSort.toggle} align={i >= 1 ? "right" : "left"} style={{ ...thStyle, textAlign: i >= 1 ? "right" : "left" }}><EditableText id={`settlement.costByMethod.header.${h}`} defaultText={h} /></SortTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costByMethod.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af" }}>데이터 없음</td></tr>
                  ) : costByMethodSorted.map(r => (
                    <tr key={r.method}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.method}</td>
                      <td style={tdR}>{r.count.toLocaleString()}</td>
                      <td style={tdR}>{r.sales.toLocaleString()}</td>
                      <td style={tdR}>{r.costs.toLocaleString()}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: r.profit >= 0 ? "#1B2B4B" : "#b91c1c" }}>{r.profit.toLocaleString()}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: r.margin >= 15 ? "#059669" : r.margin >= 8 ? "#374151" : "#b91c1c" }}>
                        {r.margin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 월별 이익률 추이 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-[#1B2B4B]">
              <span className="text-[13px] font-bold text-white"><EditableText id="settlement.monthlyTrend.title" defaultText="월별 매출·이익 추이" /></span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    {["월","매출","원가","이익","이익률"].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i === 0 ? "left" : "right" }}><EditableText id={`settlement.monthlyTrend.header.${h}`} defaultText={h} /></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((mo, idx) => {
                    const d = vatData.monthly[mo] || { sales: 0, costs: 0 };
                    const profit = d.sales - d.costs;
                    const margin = d.sales > 0 ? (profit / d.sales * 100) : 0;
                    return (
                      <tr key={mo} style={{ background: d.sales === 0 ? "#fafafa" : "#fff" }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: d.sales === 0 ? "#9ca3af" : "#374151" }}>{idx + 1}월</td>
                        <td style={{ ...tdR, color: d.sales === 0 ? "#d1d5db" : "#374151" }}>{d.sales > 0 ? d.sales.toLocaleString() : "–"}</td>
                        <td style={{ ...tdR, color: d.costs === 0 ? "#d1d5db" : "#374151" }}>{d.costs > 0 ? d.costs.toLocaleString() : "–"}</td>
                        <td style={{ ...tdR, fontWeight: profit !== 0 ? 700 : 400, color: profit > 0 ? "#1B2B4B" : profit < 0 ? "#b91c1c" : "#d1d5db" }}>
                          {profit !== 0 ? profit.toLocaleString() : "–"}
                        </td>
                        <td style={{ ...tdR, fontWeight: d.sales > 0 ? 700 : 400, color: margin >= 15 ? "#059669" : margin >= 8 ? "#374151" : d.sales > 0 ? "#b91c1c" : "#d1d5db" }}>
                          {d.sales > 0 ? `${margin.toFixed(1)}%` : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 입금 처리 모달 */}
      {arModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-[15px] text-[#1B2B4B] mb-1">입금 처리</div>
            <div className="text-[12px] text-gray-500 mb-4">{arModal}</div>
            <div className="mb-1 text-[12px] text-gray-500">미수금 잔액: <strong>{(arByClient.find(r => r.client === arModal)?.outstanding || 0).toLocaleString()}원</strong></div>
            <input autoComplete="off"
              inputMode="numeric"
              value={arInput ? Number(String(arInput).replace(/[^\d]/g, "") || 0).toLocaleString() : ""}
              onChange={e => setArInput(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="입금액 입력 (원)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] mb-4 outline-none focus:border-[#1B2B4B]"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setArModal(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-500 hover:bg-gray-50"><EditableText id="misc.btn.43168.취소" defaultText="취소" /></button>
              <button
                onClick={async () => { await savePayment("ar", arModal, arInput); setArModal(null); }}
                className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:opacity-90"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 지급 처리 모달 */}
      {apModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-[15px] text-[#1B2B4B] mb-1">지급 처리</div>
            <div className="text-[12px] text-gray-500 mb-4">{apModal}</div>
            <div className="mb-1 text-[12px] text-gray-500">미지급 잔액: <strong>{(apByDriver.find(r => r.driver === apModal)?.outstanding || 0).toLocaleString()}원</strong></div>
            <input autoComplete="off"
              inputMode="numeric"
              value={apInput ? Number(String(apInput).replace(/[^\d]/g, "") || 0).toLocaleString() : ""}
              onChange={e => setApInput(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="지급액 입력 (원)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] mb-4 outline-none focus:border-[#1B2B4B]"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setApModal(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-500 hover:bg-gray-50"><EditableText id="misc.btn.43196.취소" defaultText="취소" /></button>
              <button
                onClick={async () => { await savePayment("ap", apModal, apInput); setApModal(null); }}
                className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:opacity-90"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ⭐ 경영인텔리전스 — AI 월간비교분석(최고관리자 전용).
// 실제 LLM을 호출하지 않고(비용/키 불필요), 두 달의 매출·건수·평균단가·거래처·
// 차종/톤수 구성·요일 분포를 규칙 기반으로 비교해
// "건수는 늘었는데 매출은 왜 줄었나" 같은 질문에 구체적인 원인을 짚어주는
// 통계 분석 엔진. rowsA/rowsB는 이미 배차완료로 필터링된 오더 배열(Settlement의
// `rows`에서 월별로 잘라서 넘긴다).
// ⭐ 월간 이동거리 분석 — 오더에는 이동거리가 저장되어 있지 않아, 상/하차지 주소를
// 지오코딩(위경도 변환)한 뒤 직선거리에 실제 도로 보정계수(estimateDistanceFare와
// 동일하게 1.25배)를 적용한 추정값을 사용한다. 같은 주소를 매번 다시 지오코딩하면
// 느리고 API 호출도 낭비이므로, localStorage에 주소→위경도 캐시를 영구 저장해
// 두 번째 조회부터는 즉시 계산되게 한다.
const DIST_GEOCODE_CACHE_KEY = "dispatchGeocodeCacheV1";
function loadDistGeocodeCache() {
  try {
    const raw = localStorage.getItem(DIST_GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveDistGeocodeCache(cache) {
  try {
    localStorage.setItem(DIST_GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장 실패(용량 초과 등)는 무시 — 다음 세션에 다시 계산될 뿐 기능에는 지장 없음
  }
}
// 단/중/장거리 구간 기준(편도 km) — 국내 화물운송 통상 기준으로 임의 설정.
const DIST_BUCKETS = [
  { key: "short", label: "단거리 (50km 미만)", test: (km) => km < 50 },
  { key: "medium", label: "중거리 (50~150km)", test: (km) => km >= 50 && km < 150 },
  { key: "long", label: "장거리 (150km 이상)", test: (km) => km >= 150 },
];
async function estimateOrderRoadKm(pickupAddr, dropAddr, cache) {
  const pk = (pickupAddr || "").trim();
  const dk = (dropAddr || "").trim();
  if (!pk || !dk) return null;
  const getPt = async (addr) => {
    if (cache[addr]) return cache[addr];
    const pt = await geocodeAddress(addr);
    if (pt) cache[addr] = pt;
    return pt;
  };
  const [from, to] = await Promise.all([getPt(pk), getPt(dk)]);
  if (!from || !to) return null;
  return haversineKm(from.lat, from.lon, to.lat, to.lon) * 1.25;
}
// list(해당 월 오더 목록)의 이동거리를 계산해 단/중/장거리 구간별 건수·총거리를 집계한다.
// 동시에 너무 많은 지오코딩 요청을 보내지 않도록 동시 실행 수를 제한한다.
async function computeMonthlyDistanceStats(list, cache) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const items = list.filter((r) => (r.상차지주소 || "").trim() && (r.하차지주소 || "").trim());
  const samples = []; // { km, sale } — km당 단가(운송 효율) 분석을 위해 매출도 함께 담아둔다
  const CONCURRENCY = 8;
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const r = items[idx++];
      try {
        const km = await estimateOrderRoadKm(r.상차지주소, r.하차지주소, cache);
        if (Number.isFinite(km)) samples.push({ km, sale: toInt(r.청구운임) });
      } catch {
        // 개별 주소 지오코딩 실패는 그냥 표본에서 제외하고 계속 진행
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  const totalKm = samples.reduce((a, s) => a + s.km, 0);
  const totalSale = samples.reduce((a, s) => a + s.sale, 0);
  const buckets = DIST_BUCKETS.map((b) => {
    const inBucket = samples.filter((s) => b.test(s.km));
    const bTotalKm = inBucket.reduce((a, s) => a + s.km, 0);
    return { key: b.key, label: b.label, cnt: inBucket.length, totalKm: bTotalKm };
  });
  return {
    sampleCnt: samples.length,
    totalOrderCnt: list.length,
    avgKm: samples.length ? totalKm / samples.length : 0,
    totalKm,
    wonPerKm: totalKm ? totalSale / totalKm : 0,
    buckets,
  };
}

function buildMonthCompareInsight(rowsA, rowsB, labelA, labelB) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => `${Math.round(n).toLocaleString()}원`;
  const pctStr = (a, b) => {
    if (!a) return b ? "+100.0%" : "0.0%";
    const p = ((b - a) / a) * 100;
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  };

  const summarize = (list) => {
    const sale = list.reduce((a, r) => a + toInt(r.청구운임), 0);
    const driver = list.reduce((a, r) => a + toInt(r.기사운임), 0);
    const profit = profitTotals(list).fee; // ⭐ 2026-11-17 청구 − 기사 − 회사 지급분(지게차·외부 특수운임)
    const cnt = list.length;
    // 지급방식 "손실"로 등록된 오더 — 청구(회수)는 못 하면서 기사운임은 나간, 순수
    // 손실분만 집계한다. (청구운임이 일부라도 잡혀있으면 그만큼은 제외)
    const lossRows = list.filter((r) => (r.지급방식 || "").trim() === "손실");
    const lossCnt = lossRows.length;
    const lossAmount = lossRows.reduce((a, r) => a + Math.max(0, toInt(r.기사운임) - toInt(r.청구운임)), 0);
    // 총 운행대수 — 같은 차량(기사)이 여러 건을 뛴 경우, 오더 건수만큼이 아니라
    // "실제로 몇 대가 굴렀는지"를 보고 싶은 것이므로 차량번호(있으면 최우선) 또는
    // 기사명+연락처(차량번호 미기재 시 폴백) 기준으로 중복 제거한 고유 대수로 센다.
    // 오더 10건을 기사 1명이 다 했다면 "1대가 10건을 운행"으로 집계된다 — 총
    // 오더 건수는 별도 지표(오더 건수)로 이미 보여주고 있어 여기서는 겹치지 않는다.
    const vehicleKeys = new Set();
    list.forEach((r) => {
      const car = (r.차량번호 || "").trim();
      const name = (r.이름 || "").trim();
      const phone = (r.전화번호 || "").trim();
      if (!car && !name && !phone) return; // 배차 정보가 전혀 없는 오더는 집계에서 제외
      vehicleKeys.add(car || `${name}|${phone}`);
    });
    const vehicleCnt = vehicleKeys.size;
    return {
      sale, driver, profit, cnt, lossCnt, lossAmount,
      avgSale: cnt ? sale / cnt : 0,
      avgProfit: cnt ? profit / cnt : 0,
      rate: sale ? (profit / sale) * 100 : 0,
      vehicleCnt,
      orderPerVehicle: vehicleCnt ? cnt / vehicleCnt : 0,
    };
  };
  const A = summarize(rowsA);
  const B = summarize(rowsB);

  const groupBy = (list, keyFn) => {
    const map = new Map();
    list.forEach((r) => {
      const k = keyFn(r) || "미지정";
      if (!map.has(k)) map.set(k, { sale: 0, cnt: 0 });
      const o = map.get(k);
      o.sale += toInt(r.청구운임);
      o.cnt += 1;
    });
    return map;
  };

  // 거래처별 매출 증감 — 어떤 거래처가 이번 달 매출 변화를 주도했는지
  const clientA = groupBy(rowsA, (r) => r.거래처명);
  const clientB = groupBy(rowsB, (r) => r.거래처명);
  const clientKeys = new Set([...clientA.keys(), ...clientB.keys()]);
  const clientDeltas = Array.from(clientKeys)
    .map((c) => {
      const a = clientA.get(c) || { sale: 0, cnt: 0 };
      const b = clientB.get(c) || { sale: 0, cnt: 0 };
      return {
        client: c, saleA: a.sale, saleB: b.sale, delta: b.sale - a.sale, cntA: a.cnt, cntB: b.cnt,
        avgA: a.cnt ? a.sale / a.cnt : 0, avgB: b.cnt ? b.sale / b.cnt : 0,
      };
    })
    .sort((x, y) => x.delta - y.delta);
  const topDecline = clientDeltas.filter((c) => c.delta < 0).slice(0, 5);
  const topGrowth = [...clientDeltas].filter((c) => c.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, 5);

  // 차종/톤수 구성비 — 저단가 소형차 비중이 늘면 평균단가가 자연히 낮아진다
  const tonA = groupBy(rowsA, (r) => r.차량톤수 || r.차량종류);
  const tonB = groupBy(rowsB, (r) => r.차량톤수 || r.차량종류);
  const tonKeys = new Set([...tonA.keys(), ...tonB.keys()]);
  const tonMix = Array.from(tonKeys)
    .map((t) => {
      const a = tonA.get(t) || { sale: 0, cnt: 0 };
      const b = tonB.get(t) || { sale: 0, cnt: 0 };
      return {
        ton: t,
        shareA: A.cnt ? (a.cnt / A.cnt) * 100 : 0,
        shareB: B.cnt ? (b.cnt / B.cnt) * 100 : 0,
        avgA: a.cnt ? a.sale / a.cnt : 0,
        avgB: b.cnt ? b.sale / b.cnt : 0,
        cntA: a.cnt, cntB: b.cnt,
      };
    });

  // 요일별 분포 — 평일/주말 오더 비중 변화
  const weekdayOf = (r) => {
    const d = r.상차일 ? new Date(r.상차일 + "T00:00:00") : null;
    return d && !isNaN(d.getTime()) ? d.getDay() : null;
  };
  const weekendCnt = (list) => list.filter((r) => { const w = weekdayOf(r); return w === 0 || w === 6; }).length;
  const weekendA = weekendCnt(rowsA), weekendB = weekendCnt(rowsB);

  // ----- 보고서 섹션 생성 (테마별 문단 — 카드 나열이 아니라 하나로 이어지는 보고서 형식) -----
  const saleDelta = B.sale - A.sale;
  const cntDelta = B.cnt - A.cnt;
  const rateDeltaP = B.rate - A.rate;
  const weekendShareA = A.cnt ? (weekendA / A.cnt) * 100 : 0;
  const weekendShareB = B.cnt ? (weekendB / B.cnt) * 100 : 0;

  // ⭐ 핵심 요약 — "건수는 늘었는데 매출은 줄었다"류의 역설은 알고 보면 특정 거래처
  // 1곳(또는 소수)이 한 달에만 일시적으로 발생했다가 사라진 게 원인인 경우가 많다.
  // 이런 거래처는 "거래처 동향" 문단 속에 다른 여러 거래처와 나란히 나열되면 눈에
  // 잘 띄지 않으므로, 매출 증감을 가장 크게 설명하는 단일 요인을 찾아 report 맨
  // 앞에 굵은 글씨 헤드라인으로 별도 배치한다.
  let headline = "";
  if (saleDelta !== 0 && clientDeltas.length) {
    const byAbs = [...clientDeltas].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    const top = byAbs[0];
    const topShare = Math.abs(top.delta) / Math.abs(saleDelta);

    const vanished = clientDeltas.filter((c) => c.cntA > 0 && c.cntB === 0);
    const appeared = clientDeltas.filter((c) => c.cntA === 0 && c.cntB > 0);
    const netOneOff = appeared.reduce((a, c) => a + c.saleB, 0) - vanished.reduce((a, c) => a + c.saleA, 0);
    const oneOffShare = Math.abs(netOneOff) / Math.abs(saleDelta);

    if (topShare >= 0.3) {
      const isVanished = top.cntA > 0 && top.cntB === 0;
      const isAppeared = top.cntA === 0 && top.cntB > 0;
      const dirWord = top.delta < 0 ? "감소" : "증가";
      const shareText = topShare >= 1
        ? `전체 매출 변동폭(${won(saleDelta)})보다도 커서, 다른 거래처들의 증감은 서로 상쇄되었습니다`
        : `전체 매출 변동(${won(saleDelta)})의 약 ${(topShare * 100).toFixed(0)}%를 차지합니다`;
      let cause;
      if (isVanished) cause = `${labelA}에만 일시적으로 발생했던 거래처로, ${labelB}에는 오더가 전혀 없었습니다`;
      else if (isAppeared) cause = `${labelB}에 새로 발생한 거래처로, ${labelA}에는 오더가 없었습니다`;
      else cause = `${labelA} ${top.cntA}건 → ${labelB} ${top.cntB}건으로 거래 규모 자체가 바뀌었습니다`;
      headline = `**${labelB} 매출 ${dirWord}의 가장 큰 단일 요인은 '${top.client}' 거래처(${won(top.delta)})입니다.** 이 거래처는 ${shareText} — ${cause}.`;
      if (cntDelta > 0 && saleDelta < 0) {
        headline += ` 오더 건수는 늘었는데 매출이 줄어든 것도, 건당 단가 하락보다 이 거래처 하나의 변화가 더 크게 작용했을 가능성이 큽니다.`;
      }
    } else if (oneOffShare >= 0.3 && (vanished.length || appeared.length)) {
      const parts = [];
      if (vanished.length) {
        const sumV = vanished.reduce((a, c) => a + c.saleA, 0);
        const topV = [...vanished].sort((x, y) => y.saleA - x.saleA).slice(0, 3);
        parts.push(`${labelA}에만 발생하고 ${labelB}에는 없었던 거래처 ${vanished.length}곳(합계 ${won(sumV)}): 대표적으로 ${topV.map((c) => `${c.client}(${won(c.saleA)})`).join(", ")}`);
      }
      if (appeared.length) {
        const sumA = appeared.reduce((a, c) => a + c.saleB, 0);
        const topA = [...appeared].sort((x, y) => y.saleB - x.saleB).slice(0, 3);
        parts.push(`${labelB}에 새로 발생한 거래처 ${appeared.length}곳(합계 ${won(sumA)}): 대표적으로 ${topA.map((c) => `${c.client}(${won(c.saleB)})`).join(", ")}`);
      }
      headline = `**${labelA}·${labelB} 매출 차이의 상당 부분은 두 달 모두 거래하지 않은 '일시적 거래처'가 원인입니다.** ${parts.join(", ")}.`;
    }
  }

  const report = [];
  if (headline) report.push({ title: "핵심 요약", body: headline, highlight: true });

  // 1) 매출 및 수익성 — 요청의 핵심 질문(건수는 늘었는데 매출이 왜 줄었나)에 대한 직접 답변. 항상 포함.
  {
    const s = [];
    s.push(`${labelB} 매출은 ${won(B.sale)}로 ${labelA}(${won(A.sale)}) 대비 ${pctStr(A.sale, B.sale)} 변동했습니다.`);
    if (cntDelta > 0 && saleDelta < 0) {
      s.push(`오더 건수는 ${cntDelta.toLocaleString()}건(${pctStr(A.cnt, B.cnt)}) 늘었음에도 매출이 줄어든 것은, 건당 평균 운임이 ${won(A.avgSale)}에서 ${won(B.avgSale)}로 ${pctStr(A.avgSale, B.avgSale)} 하락했기 때문입니다. 저단가·근거리 오더 비중이 늘었을 가능성이 있습니다.`);
    } else if (cntDelta < 0 && saleDelta > 0) {
      s.push(`오더 건수는 ${Math.abs(cntDelta).toLocaleString()}건 줄었지만, 건당 평균 운임이 ${won(A.avgSale)}에서 ${won(B.avgSale)}로 ${pctStr(A.avgSale, B.avgSale)} 상승하며 매출이 오히려 증가했습니다. 고단가 오더 중심으로 효율이 개선된 결과로 보입니다.`);
    } else if (Math.abs(pctStrToNum(pctStr(A.avgSale, B.avgSale))) >= 5) {
      s.push(`건당 평균 운임은 ${won(A.avgSale)}에서 ${won(B.avgSale)}로 ${pctStr(A.avgSale, B.avgSale)} 변동했습니다.`);
    } else {
      s.push(`건당 평균 운임은 ${won(A.avgSale)}에서 ${won(B.avgSale)} 수준으로 큰 변동 없이 유지되었습니다.`);
    }
    if (Math.abs(rateDeltaP) >= 0.5) {
      s.push(`수익(매익)은 ${won(A.profit)}에서 ${won(B.profit)}로 ${pctStr(A.profit, B.profit)} 변동했고, 수익률은 ${A.rate.toFixed(1)}%에서 ${B.rate.toFixed(1)}%로 ${rateDeltaP >= 0 ? "개선" : "악화"}(${rateDeltaP >= 0 ? "+" : ""}${rateDeltaP.toFixed(1)}%p)되었습니다.`);
    } else {
      s.push(`수익률은 ${A.rate.toFixed(1)}%에서 ${B.rate.toFixed(1)}% 수준으로 큰 변화 없이 유지되었습니다.`);
    }
    report.push({ title: "매출 및 수익성", body: s.join(" ") });
  }

  // 2) 거래처 동향 — 매출 변화가 "건수 변화" 때문인지 "같은 거래처인데 건당 단가가
  //    바뀐 것" 때문인지 구분해서 짚어준다 (단가가 15% 이상 바뀐 경우만 별도 언급).
  const clientPriceNote = (c) => {
    const pct = c.avgA ? ((c.avgB - c.avgA) / c.avgA) * 100 : 0;
    if (c.avgA <= 0 || c.avgB <= 0 || Math.abs(pct) < 15) return "";
    return `, 건당 평균단가 ${won(c.avgA)}→${won(c.avgB)}(${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
  };
  {
    const s = [];
    if (topDecline.length) {
      s.push(`매출 감소에 가장 크게 기여한 거래처는 ${topDecline.map((c) => `${c.client}(${won(c.delta)}, ${c.cntA}건→${c.cntB}건${clientPriceNote(c)})`).join(", ")}입니다.`);
    }
    if (topGrowth.length) {
      s.push(`반면 매출이 늘어난 거래처는 ${topGrowth.map((c) => `${c.client}(+${won(c.delta)}, ${c.cntA}건→${c.cntB}건${clientPriceNote(c)})`).join(", ")}입니다.`);
    }
    if (s.length) report.push({ title: "거래처 동향", body: s.join(" ") });
  }

  // 3) 차종·톤수별 매출 기여 분석 — "건수는 늘었는데 왜 매출/평균단가가 기대만큼
  //    안 늘었나"에 대한 핵심 답변. 카테고리별 매출증감을 물량효과(건수 변화 ×
  //    직전월 단가)와 단가효과(같은 톤수 안에서 건당 단가 자체가 바뀐 몫)로 정확히
  //    분해한다 — 두 효과의 합은 항상 그 카테고리의 실제 매출증감과 정확히 일치한다.
  {
    const tonImpact = tonMix
      .filter((t) => t.cntA >= 3 || t.cntB >= 3) // 표본이 너무 적은 카테고리는 제외
      .map((t) => {
        const priceImpact = t.cntB * (t.avgB - t.avgA); // 같은 건수(B) 기준, 단가가 바뀐 몫
        const volumeImpact = t.avgA * (t.cntB - t.cntA); // 직전월 단가(A) 기준, 건수가 바뀐 몫
        return { ...t, priceImpact, volumeImpact };
      });
    const totalPriceImpact = tonImpact.reduce((a, t) => a + t.priceImpact, 0);
    const totalVolumeImpact = tonImpact.reduce((a, t) => a + t.volumeImpact, 0);
    const topPriceDown = [...tonImpact].filter((t) => t.priceImpact < -100000).sort((x, y) => x.priceImpact - y.priceImpact).slice(0, 3);
    const topPriceUp = [...tonImpact].filter((t) => t.priceImpact > 100000).sort((x, y) => y.priceImpact - x.priceImpact).slice(0, 3);
    const topVolUp = [...tonImpact].filter((t) => t.volumeImpact > 100000).sort((x, y) => y.volumeImpact - x.volumeImpact).slice(0, 3);

    const s = [];
    if (tonImpact.length && (Math.abs(totalPriceImpact) >= 100000 || Math.abs(totalVolumeImpact) >= 100000)) {
      s.push(`차량 톤수 구성 기준으로 매출 증감(${won(saleDelta)})을 나눠보면, 건수 변화에 따른 물량효과는 ${won(totalVolumeImpact)}, 같은 톤수 안에서 건당 단가 자체가 바뀐 데 따른 단가효과는 ${won(totalPriceImpact)}입니다.`);
    }
    if (topPriceDown.length) {
      s.push(`단가효과가 가장 크게 마이너스로 작용한 톤수는 ${topPriceDown.map((t) => `${t.ton}(${won(t.priceImpact)}, 건당 ${won(t.avgA)}→${won(t.avgB)}, ${t.cntA}건→${t.cntB}건)`).join(", ")}으로, 건수는 유지되거나 오히려 줄었는데도 건당 단가 하락 자체가 매출을 끌어내렸습니다.`);
    }
    if (topPriceUp.length) {
      s.push(`반대로 ${topPriceUp.map((t) => `${t.ton}(+${won(t.priceImpact)}, 건당 ${won(t.avgA)}→${won(t.avgB)})`).join(", ")}은 건당 단가 자체가 오르며 매출을 끌어올렸습니다.`);
    }
    if (topVolUp.length && cntDelta > 0) {
      s.push(`오더 건수 증가는 주로 ${topVolUp.map((t) => `${t.ton}(${t.cntA}건→${t.cntB}건)`).join(", ")}에서 나왔는데, 이 톤수들의 건당 단가는 대형차량보다 낮은 편이라 전체 건수가 늘어도 평균단가·매출 증가로는 온전히 이어지지 않는 구성비 변화가 함께 작용했습니다.`);
    }
    if (s.length) report.push({ title: "차종·톤수별 매출 기여 분석", body: s.join(" ") });
  }

  // 4) 손실(무수익) 오더 분석 — 지급방식 "손실"로 등록된 오더(청구는 못 하면서
  //    기사운임은 나간 건)가 늘었는지, 어느 거래처에서 주로 발생했는지 짚어준다.
  {
    const lossByClient = (list) => {
      const map = new Map();
      list.filter((r) => (r.지급방식 || "").trim() === "손실").forEach((r) => {
        const k = r.거래처명 || "미지정";
        const amt = Math.max(0, toInt(r.기사운임) - toInt(r.청구운임));
        if (!map.has(k)) map.set(k, { amt: 0, cnt: 0 });
        const o = map.get(k);
        o.amt += amt; o.cnt += 1;
      });
      return map;
    };
    const lossA = lossByClient(rowsA);
    const lossB = lossByClient(rowsB);
    const lossKeys = new Set([...lossA.keys(), ...lossB.keys()]);
    const lossTop = Array.from(lossKeys)
      .map((c) => {
        const a = lossA.get(c) || { amt: 0, cnt: 0 };
        const b = lossB.get(c) || { amt: 0, cnt: 0 };
        return { client: c, amtA: a.amt, amtB: b.amt, cntA: a.cnt, cntB: b.cnt };
      })
      .filter((t) => t.amtB > 0)
      .sort((x, y) => y.amtB - x.amtB)
      .slice(0, 3);

    const s = [];
    if (A.lossCnt > 0 || B.lossCnt > 0) {
      s.push(`손실로 등록된 오더는 ${labelA} ${A.lossCnt}건(${won(A.lossAmount)})에서 ${labelB} ${B.lossCnt}건(${won(B.lossAmount)})으로 변화했습니다.`);
      if (lossTop.length) {
        s.push(`${labelB} 기준 손실 금액이 가장 큰 거래처는 ${lossTop.map((t) => `${t.client}(${won(t.amtB)}, ${t.cntB}건)`).join(", ")}입니다.`);
      }
    } else {
      s.push(`${labelA}, ${labelB} 모두 손실로 등록된 오더는 없습니다.`);
    }
    report.push({ title: "손실(무수익) 오더 분석", body: s.join(" ") });
  }

  // 5) 거래처별 수익률 변화 (마진 스퀴즈 경고) — 매출 총액만으로는 안 보이는 위험 신호.
  //    매출/건수는 유지·증가했는데 수익률(마진율)이 눈에 띄게 나빠진 거래처는 원가
  //    상승이나 저마진 노선 비중 확대로 "겉보기엔 괜찮은데 실제로는 덜 남는" 상태일
  //    수 있어, 단가 재협상이 필요한 후보를 먼저 짚어준다.
  {
    const marginByClient = (list) => {
      const map = new Map();
      list.forEach((r) => {
        const k = r.거래처명 || "미지정";
        if (!map.has(k)) map.set(k, { sale: 0, driver: 0, cnt: 0 });
        const o = map.get(k);
        o.sale += toInt(r.청구운임);
        o.driver += toInt(r.기사운임);
        o.cnt += 1;
      });
      return map;
    };
    const mA = marginByClient(rowsA);
    const mB = marginByClient(rowsB);
    const marginKeys = new Set([...mA.keys(), ...mB.keys()]);
    const squeezed = Array.from(marginKeys)
      .map((c) => {
        const a = mA.get(c) || { sale: 0, driver: 0, cnt: 0 };
        const b = mB.get(c) || { sale: 0, driver: 0, cnt: 0 };
        const rateA = a.sale ? ((a.sale - a.driver) / a.sale) * 100 : null;
        const rateB = b.sale ? ((b.sale - b.driver) / b.sale) * 100 : null;
        return { client: c, rateA, rateB, cntA: a.cnt, cntB: b.cnt, saleA: a.sale, saleB: b.sale };
      })
      .filter((t) => t.cntB >= 3 && t.rateA != null && t.rateB != null)
      .map((t) => ({ ...t, rateDelta: t.rateB - t.rateA }))
      .filter((t) => t.rateDelta <= -5)
      .sort((x, y) => x.rateDelta - y.rateDelta)
      .slice(0, 3);
    if (squeezed.length) {
      const body = `매출 규모와 무관하게 수익률(마진)이 눈에 띄게 나빠진 거래처는 ${squeezed.map((t) => `${t.client}(${t.rateA.toFixed(1)}%→${t.rateB.toFixed(1)}%, 매출 ${won(t.saleA)}→${won(t.saleB)})`).join(", ")}입니다. 매출 자체는 유지·증가했더라도 기사운임(원가) 상승이나 저마진 노선 비중 확대로 실제 남는 이익은 줄고 있을 수 있어, 이 거래처들은 단가 재협상 우선순위로 검토해볼 만합니다.`;
      report.push({ title: "거래처별 수익률 변화 (마진 스퀴즈 경고)", body });
    }
  }

  // 6) 요일 분포
  {
    const s = [];
    if (Math.abs(weekendShareA - weekendShareB) >= 3) {
      s.push(`주말(토·일) 오더 비중은 ${weekendShareA.toFixed(1)}%에서 ${weekendShareB.toFixed(1)}%로 변화했습니다.`);
    }
    if (s.length) report.push({ title: "요일 분포", body: s.join(" ") });
  }

  // 7) 거래처 유지율 및 집중도 — 매출 변화가 "기존 거래처의 단가·물량 변화" 때문인지
  //    "거래처 구성 자체가 바뀐 것"(신규 유입/이탈) 때문인지 나눠서 보여주고, 상위
  //    거래처에 매출이 얼마나 쏠려 있는지(집중도)도 함께 짚어 리스크를 드러낸다.
  {
    const retained = clientDeltas.filter((c) => c.cntA > 0 && c.cntB > 0);
    const churned = clientDeltas.filter((c) => c.cntA > 0 && c.cntB === 0);
    const newClients = clientDeltas.filter((c) => c.cntA === 0 && c.cntB > 0);
    const churnedSale = churned.reduce((a, c) => a + c.saleA, 0);
    const newSale = newClients.reduce((a, c) => a + c.saleB, 0);
    const retainedSaleB = retained.reduce((a, c) => a + c.saleB, 0);

    const top5Sum = (map) => Array.from(map.values()).sort((x, y) => y.sale - x.sale).slice(0, 5).reduce((a, v) => a + v.sale, 0);
    const concShareA = A.sale ? (top5Sum(clientA) / A.sale) * 100 : 0;
    const concShareB = B.sale ? (top5Sum(clientB) / B.sale) * 100 : 0;

    const s = [];
    s.push(`${labelB} 거래처 구성은 계속거래 ${retained.length}곳(매출 ${won(retainedSaleB)}), 신규 ${newClients.length}곳(매출 ${won(newSale)}), 이탈 ${churned.length}곳(${labelA} 매출 기준 ${won(churnedSale)})입니다.`);
    if (Math.abs(newSale - churnedSale) >= 500000) {
      s.push(newSale >= churnedSale
        ? `신규 유입 매출이 이탈 매출보다 ${won(newSale - churnedSale)} 더 많아, 거래처 순증 효과가 매출에 긍정적으로 작용했습니다.`
        : `이탈 매출이 신규 유입 매출보다 ${won(churnedSale - newSale)} 더 많아, 거래처 이탈이 매출 감소에 영향을 줬습니다.`);
    }
    if (Math.abs(concShareA - concShareB) >= 3) {
      s.push(`상위 5개 거래처 매출 비중은 ${concShareA.toFixed(1)}%에서 ${concShareB.toFixed(1)}%로 변화했습니다. ${concShareB > concShareA ? "**특정 거래처에 대한 매출 의존도가 높아지고 있어, 해당 거래처 이탈 시 매출 타격이 커질 수 있습니다.**" : "소수 거래처 의존도가 낮아지며 매출 구조가 분산되고 있습니다."}`);
    } else {
      s.push(`상위 5개 거래처 매출 비중은 ${concShareB.toFixed(1)}% 수준으로 큰 변화 없이 유지되었습니다.`);
    }
    report.push({ title: "거래처 유지율 및 집중도", body: s.join(" ") });
  }

  return { A, B, clientDeltas, topDecline, topGrowth, tonMix, report };
}
// pctStr()이 반환하는 "+12.3%" 형태 문자열에서 다시 숫자만 뽑아 비교용으로 쓴다.
function pctStrToNum(s) {
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}
// report 문단 텍스트 안에 **강조할 부분** 처럼 마크다운식 볼드 표시를 심어두면
// 화면에 굵은 글씨로 렌더링해준다. 보고서 문장이 길다 보니 결정적인 숫자/원인이
// 문단 속에 묻혀 놓치기 쉬운데, 이 헬퍼로 핵심 문장만 눈에 띄게 강조할 수 있다.
function renderInlineBold(text) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-extrabold">{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}
// report 문단은 PPT에도 그대로 쓰이는 하나의 완결된 문장 형태로 만들어두고,
// 화면에 보여줄 때만 문장 단위로 잘라 체크리스트처럼 표시한다 — 긴 서술형
// 문단을 한 덩어리로 읽는 것보다 "사실 하나당 한 줄"이 눈에 훨씬 잘 들어온다.
function splitToFacts(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+(?=\S)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}
// 탭 메뉴는 폭이 좁아 원래 제목("차종·톤수별 매출 기여 분석" 등)을 그대로 쓰면
// 줄바꿈이 지저분해진다. 탭에는 줄임 이름을, 내용 영역에는 원래 제목을 그대로 쓴다.
const REPORT_TAB_SHORT_LABEL = {
  "핵심 요약": "핵심 요약",
  "매출 및 수익성": "매출·수익성",
  "거래처 동향": "거래처 동향",
  "차종·톤수별 매출 기여 분석": "차종·톤수 기여",
  "손실(무수익) 오더 분석": "손실 오더",
  "거래처별 수익률 변화 (마진 스퀴즈 경고)": "마진 스퀴즈",
  "요일 분포": "요일",
  "거래처 유지율 및 집중도": "유지율·집중도",
};
function reportTabLabel(title) {
  return REPORT_TAB_SHORT_LABEL[title] || title;
}

// ⭐ monthA/monthB/setMonthA/setMonthB는 부모(Settlement)가 상태를 들고 있다가
// 넘겨주는 controlled 방식이 기본이다 — 매출관리는 activeTab에 따라 이 탭을
// 아예 안 그리므로(다른 탭으로 갔다 오면 이 컴포넌트 자체가 unmount/remount됨),
// 선택한 월을 이 컴포넌트 내부 state로만 들고 있으면 탭을 옮길 때마다 초기화돼
// 버린다. prop이 없을 때(다른 곳에서 재사용될 경우 대비)는 내부 state로 폴백한다.
function MonthCompareInsight({ rows = [], monthA: monthAProp, setMonthA: setMonthAProp, monthB: monthBProp, setMonthB: setMonthBProp }) {
  const won = (n) => `${Math.round(n).toLocaleString()}원`;
  const pctStr = (a, b) => {
    if (!a) return b ? "+100.0%" : "0.0%";
    const p = ((b - a) / a) * 100;
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  };

  const monthsAvail = React.useMemo(() => {
    return Array.from(new Set(rows.map((r) => (r.상차일 || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))).sort();
  }, [rows]);

  const [monthAState, setMonthAState] = React.useState("");
  const [monthBState, setMonthBState] = React.useState("");
  const monthA = monthAProp !== undefined ? monthAProp : monthAState;
  const setMonthA = setMonthAProp || setMonthAState;
  const monthB = monthBProp !== undefined ? monthBProp : monthBState;
  const setMonthB = setMonthBProp || setMonthBState;

  React.useEffect(() => {
    if (!monthsAvail.length) return;
    setMonthA((prev) => (prev && monthsAvail.includes(prev)) ? prev : monthsAvail[Math.max(0, monthsAvail.length - 2)]);
    setMonthB((prev) => (prev && monthsAvail.includes(prev)) ? prev : monthsAvail[monthsAvail.length - 1]);
  }, [monthsAvail]);

  const rowsA = React.useMemo(() => rows.filter((r) => (r.상차일 || "").startsWith(monthA)), [rows, monthA]);
  const rowsB = React.useMemo(() => rows.filter((r) => (r.상차일 || "").startsWith(monthB)), [rows, monthB]);

  const insight = React.useMemo(() => {
    if (!monthA || !monthB) return null;
    return buildMonthCompareInsight(rowsA, rowsB, monthA, monthB);
  }, [rowsA, rowsB, monthA, monthB]);

  // ⭐ 월간 이동거리 분석 — 주소 지오코딩이 필요한 비동기 작업이라 buildMonthCompareInsight
  // (동기 함수)와 분리해서 별도로 계산한다. 지오코딩 결과는 캐시에 담아뒀다가 컴포넌트가
  // 언마운트돼도 localStorage에 남겨, 다음에 같은 주소를 또 조회할 때는 즉시 계산되게 한다.
  const geocodeCacheRef = React.useRef(null);
  if (geocodeCacheRef.current === null) geocodeCacheRef.current = loadDistGeocodeCache();
  const [distStats, setDistStats] = React.useState(null);
  const [distLoading, setDistLoading] = React.useState(false);
  const [distError, setDistError] = React.useState("");

  React.useEffect(() => {
    if (!monthA || !monthB) return;
    let cancelled = false;
    setDistLoading(true);
    setDistError("");
    (async () => {
      try {
        const [dA, dB] = await Promise.all([
          computeMonthlyDistanceStats(rowsA, geocodeCacheRef.current),
          computeMonthlyDistanceStats(rowsB, geocodeCacheRef.current),
        ]);
        saveDistGeocodeCache(geocodeCacheRef.current);
        if (!cancelled) setDistStats({ A: dA, B: dB });
      } catch (e) {
        console.error("월간 이동거리 분석 오류:", e);
        if (!cancelled) setDistError("거리 데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setDistLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rowsA, rowsB, monthA, monthB]);

  // 한 줄 핵심 헤드라인만 굵게 보여주고, 나머지 수치는 아래 표로 정리한다(문단을
  // 길게 늘어놓으면 좁은 우측 칸에서 글씨가 작아지고 읽기 어려워지는 문제가 있었음).
  const distHeadline = React.useMemo(() => {
    if (!distStats) return "";
    const { A: dA, B: dB } = distStats;
    return `건당 평균 이동거리는 ${monthA} ${dA.avgKm.toFixed(1)}km → ${monthB} ${dB.avgKm.toFixed(1)}km로 ${pctStr(dA.avgKm, dB.avgKm)} 변동했습니다.`;
  }, [distStats, monthA, monthB]);

  const distKpiRows = React.useMemo(() => {
    if (!distStats) return [];
    const { A: dA, B: dB } = distStats;
    const rows = [
      { label: "건당 평균 이동거리", aText: `${dA.avgKm.toFixed(1)}km`, bText: `${dB.avgKm.toFixed(1)}km` },
      { label: "총 이동거리", aText: `${Math.round(dA.totalKm).toLocaleString()}km`, bText: `${Math.round(dB.totalKm).toLocaleString()}km` },
      { label: "km당 평균단가", aText: `${Math.round(dA.wonPerKm).toLocaleString()}원`, bText: `${Math.round(dB.wonPerKm).toLocaleString()}원` },
    ];
    DIST_BUCKETS.forEach((b) => {
      const bA = dA.buckets.find((x) => x.key === b.key);
      const bB = dB.buckets.find((x) => x.key === b.key);
      rows.push({ label: b.label, aText: `${bA.cnt}건 · ${Math.round(bA.totalKm).toLocaleString()}km`, bText: `${bB.cnt}건 · ${Math.round(bB.totalKm).toLocaleString()}km` });
    });
    return rows;
  }, [distStats]);

  // 왼쪽 "비교분석 보고서"는 섹션이 많아 한 번에 다 펼치면 스크롤이 길어지므로
  // 탭으로 하나씩 골라보게 한다. "핵심 요약"만은 놓치면 안 되는 헤드라인이라
  // 탭 밖에 항상 보이게 고정해둔다.
  const [activeReportTab, setActiveReportTab] = React.useState(0);
  React.useEffect(() => { setActiveReportTab(0); }, [monthA, monthB]);
  const reportHighlight = insight?.report.find((s) => s.highlight) || null;
  const reportTabs = insight?.report.filter((s) => !s.highlight) || [];
  const activeReportSec = reportTabs[Math.min(activeReportTab, Math.max(0, reportTabs.length - 1))];

  const kpiRows = insight ? [
    { label: "매출", aText: won(insight.A.sale), bText: won(insight.B.sale), good: insight.B.sale >= insight.A.sale, deltaText: `${won(insight.B.sale - insight.A.sale)} (${pctStr(insight.A.sale, insight.B.sale)})` },
    { label: "수익", aText: won(insight.A.profit), bText: won(insight.B.profit), good: insight.B.profit >= insight.A.profit, deltaText: `${won(insight.B.profit - insight.A.profit)} (${pctStr(insight.A.profit, insight.B.profit)})` },
    { label: "수익률", aText: `${insight.A.rate.toFixed(1)}%`, bText: `${insight.B.rate.toFixed(1)}%`, good: insight.B.rate >= insight.A.rate, deltaText: `${(insight.B.rate - insight.A.rate) >= 0 ? "+" : ""}${(insight.B.rate - insight.A.rate).toFixed(1)}%p` },
    { label: "오더 건수", aText: `${insight.A.cnt}건`, bText: `${insight.B.cnt}건`, good: insight.B.cnt >= insight.A.cnt, deltaText: `${(insight.B.cnt - insight.A.cnt) >= 0 ? "+" : ""}${insight.B.cnt - insight.A.cnt}건 (${pctStr(insight.A.cnt, insight.B.cnt)})` },
    { label: "총 운행대수", aText: `${insight.A.vehicleCnt}대`, bText: `${insight.B.vehicleCnt}대`, good: insight.B.vehicleCnt >= insight.A.vehicleCnt, deltaText: `${(insight.B.vehicleCnt - insight.A.vehicleCnt) >= 0 ? "+" : ""}${insight.B.vehicleCnt - insight.A.vehicleCnt}대 (${pctStr(insight.A.vehicleCnt, insight.B.vehicleCnt)})` },
    { label: "차량당 평균 오더", aText: `${insight.A.orderPerVehicle.toFixed(1)}건`, bText: `${insight.B.orderPerVehicle.toFixed(1)}건`, good: insight.B.orderPerVehicle >= insight.A.orderPerVehicle, deltaText: `${(insight.B.orderPerVehicle - insight.A.orderPerVehicle) >= 0 ? "+" : ""}${(insight.B.orderPerVehicle - insight.A.orderPerVehicle).toFixed(1)}건` },
    { label: "평균단가/건", aText: won(insight.A.avgSale), bText: won(insight.B.avgSale), good: insight.B.avgSale >= insight.A.avgSale, deltaText: `${won(insight.B.avgSale - insight.A.avgSale)} (${pctStr(insight.A.avgSale, insight.B.avgSale)})` },
    { label: "손실 건수", aText: `${insight.A.lossCnt}건`, bText: `${insight.B.lossCnt}건`, good: insight.B.lossCnt <= insight.A.lossCnt, deltaText: `${(insight.B.lossCnt - insight.A.lossCnt) >= 0 ? "+" : ""}${insight.B.lossCnt - insight.A.lossCnt}건` },
    { label: "손실금액", aText: won(insight.A.lossAmount), bText: won(insight.B.lossAmount), good: insight.B.lossAmount <= insight.A.lossAmount, deltaText: `${won(insight.B.lossAmount - insight.A.lossAmount)}` },
  ] : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-white flex items-center gap-2">
            AI 월간비교분석
            <span className="text-[10px] font-bold bg-white/10 text-white/80 border border-white/20 px-1.5 py-0.5 rounded">최고관리자 전용</span>
          </h3>
          <p className="text-[11px] text-white/50 mt-0.5">두 달의 매출·건수·거래처·차종·요일 데이터를 비교해 변화 원인을 자동으로 짚어드립니다</p>
        </div>
        <div className="flex items-center gap-2">
          <CustomSelect
            className="bg-white/10 border border-white/20 text-white rounded-lg px-3 py-1.5 text-[13px] focus:outline-none"
            value={monthA}
            onChange={(e) => setMonthA(e.target.value)}
          >
            {monthsAvail.map((m) => <option key={m} value={m} className="text-gray-900">{m}</option>)}
          </CustomSelect>
          <span className="text-white/60 text-[12px] font-semibold">vs</span>
          <CustomSelect
            className="bg-white/10 border border-white/20 text-white rounded-lg px-3 py-1.5 text-[13px] focus:outline-none"
            value={monthB}
            onChange={(e) => setMonthB(e.target.value)}
          >
            {monthsAvail.map((m) => <option key={m} value={m} className="text-gray-900">{m}</option>)}
          </CustomSelect>
        </div>
      </div>

      {!insight ? (
        <div className="p-8 text-center text-[13px] text-gray-500">비교할 데이터가 부족합니다.</div>
      ) : (
        <div className="p-6 space-y-6">
          {/* KPI 비교 표 */}
          <table className="w-full text-[13px] border-collapse text-center">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="border p-2"><EditableText id="settlement.kpiCompare.header.지표" defaultText="지표" /></th>
                <th className="border p-2">{monthA}</th>
                <th className="border p-2">{monthB}</th>
                <th className="border p-2"><EditableText id="settlement.kpiCompare.header.증감" defaultText="증감" /></th>
              </tr>
            </thead>
            <tbody>
              {kpiRows.map((k) => (
                <tr key={k.label} className="hover:bg-gray-50">
                  <td className="border p-2 font-semibold text-gray-700">{k.label}</td>
                  <td className="border p-2 text-gray-600">{k.aText}</td>
                  <td className="border p-2 font-bold text-gray-900">{k.bText}</td>
                  <td className={`border p-2 font-bold ${k.good ? "text-emerald-600" : "text-rose-600"}`}>
                    {k.good ? "▲" : "▼"} {k.deltaText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* AI 분석 보고서 + 이동거리 분석 — 한 카드 안에 좌(비교분석 보고서)/우(이동거리
              분석) 2단으로 배치. 좌측은 섹션이 많아 한 번에 다 펼치면 산만해 보이므로
              탭으로 하나씩 골라보게 하고, "핵심 요약"만 탭 밖에 고정해 놓친다. */}
          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
              {/* 좌: 비교분석 보고서 — 모바일 사이드메뉴 형식으로 왼쪽에 세로 탭을 두고,
                  선택한 섹션만 오른쪽에 문장 단위 체크리스트로 보여준다. */}
              <div className="p-5">
                <div className="pb-3 mb-4 border-b border-gray-200">
                  <div className="text-[11px] font-bold text-gray-400 tracking-widest">비교분석 보고서</div>
                  <div className="text-[15px] font-extrabold text-[#1B2B4B] mt-0.5">{monthA} vs {monthB} 매출 비교분석</div>
                </div>
                {insight.report.length === 0 ? (
                  <p className="text-[13px] text-gray-500">두 달 사이 매출·건수·거래처 구성에서 뚜렷한 변화가 발견되지 않았습니다.</p>
                ) : (
                  <>
                    {reportHighlight && (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <div className="text-[10px] font-bold text-gray-400 tracking-widest mb-1.5">{reportHighlight.title}</div>
                        <p className="text-[14.5px] font-bold text-[#1B2B4B] leading-[1.85]">{renderInlineBold(reportHighlight.body)}</p>
                      </div>
                    )}
                    {reportTabs.length > 0 && (
                      <div className="flex gap-4 items-start">
                        {/* 세로 탭 메뉴 */}
                        <div className="flex flex-col gap-1 shrink-0 w-[108px]">
                          {reportTabs.map((sec, i) => (
                            <button
                              key={sec.title}
                              type="button"
                              onClick={() => setActiveReportTab(i)}
                              className={`text-left px-2.5 py-2 rounded-md text-[12.5px] font-bold leading-[1.35] transition ${i === Math.min(activeReportTab, reportTabs.length - 1) ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                            >
                              {reportTabLabel(sec.title)}
                            </button>
                          ))}
                        </div>
                        {/* 선택한 섹션 내용 — 서술형 문단 대신 문장 단위로 잘라 체크리스트처럼 표시 */}
                        <div className="flex-1 min-w-0">
                          {activeReportSec && (
                            <>
                              <h4 className="text-[13px] font-extrabold text-[#1B2B4B] mb-2.5 pb-1.5 border-b border-gray-100">{activeReportSec.title}</h4>
                              <ul className="space-y-2.5">
                                {splitToFacts(activeReportSec.body).map((fact, i) => (
                                  <li key={i} className="flex gap-2 text-[14.5px] text-gray-700 leading-[1.7]">
                                    <span className="text-[#1B2B4B] font-extrabold">·</span>
                                    <span>{renderInlineBold(fact)}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 우: 월간 이동거리 분석 — 상/하차지 주소 기반 추정 거리(직선거리×1.25 보정)로
                  단/중/장거리 구간별 건수·총거리·km당 단가를 비교. 지오코딩이 필요해
                  비동기로 계산된다. */}
              <div className="p-5">
                <div className="pb-3 mb-4 border-b border-gray-200">
                  <div className="text-[11px] font-bold text-gray-400 tracking-widest">이동거리 분석</div>
                  <div className="text-[15px] font-extrabold text-[#1B2B4B] mt-0.5">단/중/장거리 비교</div>
                  <div className="text-[10px] text-gray-400 mt-1">상/하차지 주소 기반 추정거리(직선거리 보정) · 저장된 실측값이 아닌 근사치입니다</div>
                </div>
                {distLoading ? (
                  <p className="text-[13px] text-gray-500">거래처 주소를 기반으로 이동거리를 계산하는 중입니다…</p>
                ) : distError ? (
                  <p className="text-[13px] text-rose-600">{distError}</p>
                ) : !distStats ? (
                  <p className="text-[13px] text-gray-500">비교할 데이터가 부족합니다.</p>
                ) : (
                  <div className="space-y-4">
                    <p className="text-[13.5px] font-bold text-[#1B2B4B] leading-[1.8]">{distHeadline}</p>
                    <table className="w-full text-[13px] border-collapse text-center">
                      <thead>
                        <tr className="bg-gray-100 text-gray-700">
                          <th className="border p-2"><EditableText id="settlement.distCompare.header.구분" defaultText="구분" /></th>
                          <th className="border p-2">{monthA}</th>
                          <th className="border p-2">{monthB}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distKpiRows.map((row) => (
                          <tr key={row.label} className="hover:bg-gray-50">
                            <td className="border p-2 font-semibold text-gray-700">{row.label}</td>
                            <td className="border p-2 text-gray-600">{row.aText}</td>
                            <td className="border p-2 font-bold text-gray-900">{row.bText}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(distStats.A.sampleCnt < distStats.A.totalOrderCnt || distStats.B.sampleCnt < distStats.B.totalOrderCnt) && (
                      <p className="text-[11px] text-gray-400 leading-[1.6]">주소 정보가 없거나 위치 확인에 실패한 오더는 집계에서 제외했어요. ({monthA} {distStats.A.sampleCnt}/{distStats.A.totalOrderCnt}건, {monthB} {distStats.B.sampleCnt}/{distStats.B.totalOrderCnt}건 반영)</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ⭐ PPT 리포트 생성 — AI 월간비교분석 탭에 마우스를 올리면 뜨는 하위 메뉴에서
// 들어오는 별도 화면. AI 월간비교분석이 계산하는 것과 동일한 buildMonthCompareInsight
// 결과를 이 화면에서 다시 계산해(두 화면은 형제 화면이라 상태를 공유하지 않음,
// monthA/monthB만 Settlement가 들고 있다가 넘겨줘서 두 화면 간 선택이 맞춰진다)
// 캔바에서 매달 수작업으로 만들던 실적 보고서를 .pptx로 즉시 다운로드한다. 화면
// 톤은 프로그램 전체와 통일되게 네이비/그레이 중심으로만 구성한다.
function MonthlyPPTReportPanel({ rows = [], monthA: monthAProp, setMonthA: setMonthAProp, monthB: monthBProp, setMonthB: setMonthBProp, companyName = "" }) {
  const monthsAvail = React.useMemo(() => {
    return Array.from(new Set(rows.map((r) => (r.상차일 || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))).sort();
  }, [rows]);

  const [monthAState, setMonthAState] = React.useState("");
  const [monthBState, setMonthBState] = React.useState("");
  const monthA = monthAProp !== undefined ? monthAProp : monthAState;
  const setMonthA = setMonthAProp || setMonthAState;
  const monthB = monthBProp !== undefined ? monthBProp : monthBState;
  const setMonthB = setMonthBProp || setMonthBState;

  React.useEffect(() => {
    if (!monthsAvail.length) return;
    setMonthA((prev) => (prev && monthsAvail.includes(prev)) ? prev : monthsAvail[Math.max(0, monthsAvail.length - 2)]);
    setMonthB((prev) => (prev && monthsAvail.includes(prev)) ? prev : monthsAvail[monthsAvail.length - 1]);
  }, [monthsAvail]);

  const rowsA = React.useMemo(() => rows.filter((r) => (r.상차일 || "").startsWith(monthA)), [rows, monthA]);
  const rowsB = React.useMemo(() => rows.filter((r) => (r.상차일 || "").startsWith(monthB)), [rows, monthB]);
  const insight = React.useMemo(() => {
    if (!monthA || !monthB) return null;
    return buildMonthCompareInsight(rowsA, rowsB, monthA, monthB);
  }, [rowsA, rowsB, monthA, monthB]);

  const [pptTemplate, setPptTemplate] = React.useState(PPT_TEMPLATES[0].id);
  const [pptAuthor, setPptAuthor] = React.useState("");
  const [pptComments, setPptComments] = React.useState("");
  const [pptBusy, setPptBusy] = React.useState(false);
  const [pptError, setPptError] = React.useState("");
  const [pptDone, setPptDone] = React.useState("");
  const handleGeneratePPT = async () => {
    if (!insight || pptBusy) return;
    setPptBusy(true);
    setPptError("");
    setPptDone("");
    try {
      const fileName = await generateMonthlyReportPPT({
        templateId: pptTemplate,
        companyName,
        monthA, monthB,
        insight,
        comments: pptComments,
        author: pptAuthor,
      });
      setPptDone(fileName);
    } catch (e) {
      console.error("PPT 리포트 생성 오류:", e);
      setPptError("PPT 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setPptBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-white flex items-center gap-2">
            PPT 리포트 생성
            <span className="text-[10px] font-bold bg-white/10 text-white/80 border border-white/20 px-1.5 py-0.5 rounded">최고관리자 전용</span>
          </h3>
          <p className="text-[11px] text-white/50 mt-0.5">두 달의 비교분석 결과를 그대로 담은 실적 보고서(.pptx)를 바로 만들어 다운로드합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <CustomSelect
            className="bg-white/10 border border-white/20 text-white rounded-lg px-3 py-1.5 text-[13px] focus:outline-none"
            value={monthA}
            onChange={(e) => setMonthA(e.target.value)}
          >
            {monthsAvail.map((m) => <option key={m} value={m} className="text-gray-900">{m}</option>)}
          </CustomSelect>
          <span className="text-white/60 text-[12px] font-semibold">vs</span>
          <CustomSelect
            className="bg-white/10 border border-white/20 text-white rounded-lg px-3 py-1.5 text-[13px] focus:outline-none"
            value={monthB}
            onChange={(e) => setMonthB(e.target.value)}
          >
            {monthsAvail.map((m) => <option key={m} value={m} className="text-gray-900">{m}</option>)}
          </CustomSelect>
        </div>
      </div>

      {!insight ? (
        <div className="p-8 text-center text-[13px] text-gray-500">비교할 데이터가 부족합니다.</div>
      ) : (
        <div className="p-6 space-y-6">
          <div>
            <div className="text-[12.5px] font-bold text-gray-700 mb-2">템플릿</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PPT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setPptTemplate(tpl.id)}
                  className={`text-left rounded-lg border px-4 py-3 transition ${
                    pptTemplate === tpl.id ? "border-[#1B2B4B] bg-gray-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-gray-800">{tpl.name}</span>
                    {pptTemplate === tpl.id && (
                      <span className="text-[10px] font-bold text-[#1B2B4B] border border-[#1B2B4B] rounded px-1.5 py-0.5">선택됨</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">{tpl.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12.5px] font-bold text-gray-700 mb-1.5 block">작성자 (선택)</label>
            <input
              type="text"
              value={pptAuthor}
              onChange={(e) => setPptAuthor(e.target.value)}
              placeholder="예: 물류팀장 홍길동"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
            />
          </div>

          <div>
            <label className="text-[12.5px] font-bold text-gray-700 mb-1.5 block">특이사항 및 참고사항 (선택)</label>
            <p className="text-[11px] text-gray-500 mb-1.5">데이터만으로는 알 수 없는 배경 설명(거래처 변동 사유, 이번 달 내부 일정/계획 등)을 한 줄에 하나씩 입력하면 보고서 마지막 슬라이드에 정리됩니다.</p>
            <textarea
              value={pptComments}
              onChange={(e) => setPptComments(e.target.value)}
              rows={4}
              placeholder={"예) ○○물류 3PL 이전 이슈로 감소했던 오더가 성수기 진입과 함께 일부 회복 중\n△△식품 9월 냉장창고 이사 계획 확정: 9일간 800파레트, 총 45대 배차 예정"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none"
            />
          </div>

          {pptError && (
            <div className="text-[12.5px] text-red-700 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pptError}</div>
          )}
          {pptDone && !pptBusy && (
            <div className="text-[12.5px] text-gray-700 font-semibold bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">{pptDone} 다운로드가 완료되었습니다.</div>
          )}

          <button
            type="button"
            onClick={handleGeneratePPT}
            disabled={pptBusy}
            className={`w-full py-3 rounded-xl text-[14px] font-bold transition ${
              pptBusy ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[#1B2B4B] text-white hover:bg-[#243860]"
            }`}
          >
            {pptBusy ? "PPT 생성 중..." : "PPT 다운로드"}
          </button>
        </div>
      )}
    </div>
  );
}
// 🧩 2026-11-27 Settlement → src/dispatch/Settlement.jsx (처음 열 때 받는다)
const Settlement = lazyView(() => import("./dispatch/Settlement.jsx"));

/* ================================================================= */
/* ================== 서브 컴포넌트 ================================== */
/* ================================================================= */

// ⭐ "거래처별 기간 조회" — 예전 "기간별 매출·운임·수수료 추이"(월별 라인차트)와
// "스마트 인사이트" 자리를 대신한다. 달력(CustomDatePicker, 프로그램 전체와 동일한
// 달력)으로 기간을 고르고, 기본거래처(clients)만 검색/드롭다운으로 선택해 조회
// 버튼을 눌러야 결과가 뜬다 — 라이브 필터가 아니라 명시적 조회 방식.
function ClientPeriodQuery({ rows = [], clients = [] }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [clientQuery, setClientQuery] = React.useState("");
  const [selectedClient, setSelectedClient] = React.useState("");
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [queryState, setQueryState] = React.useState(null);
  const wrapRef = React.useRef(null);

  const basicClientNames = React.useMemo(
    () => Array.from(new Set((clients || []).map((c) => c.거래처명).filter(Boolean))).sort(),
    [clients]
  );
  const suggestions = React.useMemo(() => {
    if (!clientQuery.trim()) return [];
    const q = clientQuery.trim().toLowerCase();
    return basicClientNames.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [clientQuery, basicClientNames]);

  React.useEffect(() => {
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runQuery = () => {
    if (!startDate || !endDate) { globalShowAlert("조회할 기간(시작일/종료일)을 선택해 주세요."); return; }
    setQueryState({ start: startDate, end: endDate, client: selectedClient });
    setSearched(true);
    setShowDropdown(false);
  };

  const results = React.useMemo(() => {
    if (!queryState) return [];
    const { start, end, client } = queryState;
    const filtered = rows.filter((r) => {
      if (!r.상차일) return false;
      if (r.상차일 < start || r.상차일 > end) return false;
      if (client && (r.거래처명 || "") !== client) return false;
      return true;
    });
    const map = new Map();
    filtered.forEach((r) => {
      const d = r.상차일;
      if (!map.has(d)) map.set(d, { date: d, sale: 0, driver: 0, fee: 0, count: 0 });
      const e = map.get(d);
      e.sale += toInt(r.청구운임);
      e.driver += toInt(r.기사운임);
      e.fee += r.__fixed ? toInt(r.수수료) : orderProfit(r); // ⭐ 2026-11-17 배차 오더는 다시 계산(고정거래처는 저장된 수수료)
      e.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, queryState]);

  // ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억
  const pqSort = useTableSort("settlement.periodQuery");
  const resultsSorted = React.useMemo(() => sortRows(results, pqSort.sort, (r, k) => (k === "rate" ? (r.sale ? r.fee / r.sale : 0) : r[k])), [results, pqSort.sort]);
  const totals = results.reduce(
    (a, r) => ({ sale: a.sale + r.sale, driver: a.driver + r.driver, fee: a.fee + r.fee, count: a.count + r.count }),
    { sale: 0, driver: 0, fee: 0, count: 0 }
  );
  const totalRate = totals.sale ? (totals.fee / totals.sale) * 100 : 0;

  return (
    <section>
      <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-0.5">거래처별 기간 조회</h4>
      <p className="text-[11px] text-gray-400 mb-4">기간과 거래처(기본거래처)를 선택해 조회하면 날짜별 매출·수익 현황을 확인할 수 있습니다</p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-3 items-end mb-2">
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-1">시작일</div>
          <CustomDatePicker
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-1">종료일</div>
          <CustomDatePicker
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="relative" ref={wrapRef}>
          <div className="text-[11px] font-semibold text-gray-500 mb-1">거래처 (기본거래처)</div>
          <input
            autoComplete="off"
            type="text"
            value={selectedClient || clientQuery}
            onChange={(e) => { setSelectedClient(""); setClientQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="전체 거래처 (검색해서 선택)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
          />
          {selectedClient && (
            <button
              type="button"
              onClick={() => { setSelectedClient(""); setClientQuery(""); }}
              className="absolute right-2.5 top-[34px] text-gray-400 hover:text-gray-600 text-[12px]"
            >
              ✕
            </button>
          )}
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-20 top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {suggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setSelectedClient(c); setClientQuery(""); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={runQuery}
          className="px-5 py-2 rounded-lg text-white text-[13px] font-bold bg-[#1B2B4B] hover:bg-[#243a60] transition h-[38px]"
        >
          <EditableText id="settlement.query.조회" defaultText="조회" />
        </button>
      </div>

      {searched && (
        results.length === 0 ? (
          <div className="mt-6 py-10 text-center text-[13px] text-gray-400">조회된 데이터가 없습니다</div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-5 gap-3 text-center">
              <Metric label="오더건수" value={`${totals.count}건`} />
              <Metric label="청구운임" value={`${totals.sale.toLocaleString()}원`} valueClass="text-[#1B2B4B]" />
              <Metric label="기사운임" value={`${totals.driver.toLocaleString()}원`} />
              <Metric label="수수료" value={`${totals.fee.toLocaleString()}원`} valueClass={profitCls(totals.fee, "text-gray-900")} />{/* ⭐ 2026-11-17 플러스 빨강 · 마이너스 파랑 */}
              <Metric label="수익률" value={`${totalRate.toFixed(1)}%`} valueClass={profitRateCls(totalRate, "text-[#1B2B4B]")} />
            </div>

            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results} barGap={4} barCategoryGap="24%">
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }}
                    formatter={(v, n) => [`${Number(v).toLocaleString()}원`, n === "sale" ? "청구운임" : "기사운임"]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, color: "#374151" }}
                    formatter={(value) => (value === "sale" ? "청구운임" : "기사운임")}
                  />
                  <Bar dataKey="sale" fill="#1B2B4B" radius={[5, 5, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="driver" fill="#AEB8C9" radius={[5, 5, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-[13px] border-collapse text-center">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {[["date","날짜"],["count","오더건수"],["sale","청구운임"],["driver","기사운임"],["fee","수수료"],["rate","수익률"]].map(([k, h]) => (
                      <SortTh key={k} k={k} sort={pqSort.sort} onSort={pqSort.toggle} className="border p-2"><EditableText id={`settlement.dateQuery.header.${h}`} defaultText={h} /></SortTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultsSorted.map((r) => {
                    const rate = r.sale ? (r.fee / r.sale) * 100 : 0;
                    return (
                      <tr key={r.date} className="hover:bg-gray-50">
                        <td className="border p-2 font-semibold">{r.date}</td>
                        <td className="border p-2">{r.count}건</td>
                        <td className="border p-2 text-[#1B2B4B] font-semibold">{r.sale.toLocaleString()}원</td>
                        <td className="border p-2 text-gray-600">{r.driver.toLocaleString()}원</td>
                        <td className={`border p-2 font-semibold ${profitCls(r.fee)}`}>{r.fee.toLocaleString()}원</td>
                        <td className={`border p-2 ${profitRateCls(rate)}`}>{rate.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr className="font-bold bg-gray-100">
                    <td className="border p-2">합계</td>
                    <td className="border p-2">{totals.count}건</td>
                    <td className="border p-2 text-[#1B2B4B]">{totals.sale.toLocaleString()}원</td>
                    <td className="border p-2 text-gray-700">{totals.driver.toLocaleString()}원</td>
                    <td className={`border p-2 ${profitCls(totals.fee)}`}>{totals.fee.toLocaleString()}원</td>
                    <td className={`border p-2 ${profitRateCls(totalRate)}`}>{totalRate.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </section>
  );
}

// ===================== 요일별 수주 분석 =====================
function WeekdayAnalysisChart({ monthRows = [] }) {
  const toInt = (v) => Number(String(v || "").replace(/[^\d]/g, "")) || 0;

  if (!monthRows.length) return null;

  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const byDay = Array(7).fill(null).map((_, i) => ({ day: days[i], 건수: 0, 매출: 0 }));

  monthRows.forEach(r => {
    if (!r.상차일) return;
    const d = new Date(r.상차일 + "T00:00:00");
    const dow = d.getDay();
    byDay[dow].건수 += 1;
    byDay[dow].매출 += toInt(r.청구운임);
  });

  const maxCount = Math.max(...byDay.map(d => d.건수), 1);

  return (
    <section>
      <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-0.5">요일별 수주 분석</h4>
      <p className="text-[11px] text-gray-400 mb-3">어느 요일에 가장 많이 출하하는지 파악</p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byDay} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#374151" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ borderRadius: 10, fontSize: 12 }}
              formatter={(v, n) => [n === "매출" ? `${v.toLocaleString()}원` : `${v}건`, n]}
            />
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="건수" fill="#1B2B4B" radius={[4, 4, 0, 0]}>
              {byDay.map((entry, i) => (
                <Cell key={i} fill={entry.건수 === maxCount ? "#1B2B4B" : "#AEB8C9"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]">
        {byDay.map((d, i) => (
          <div key={i} className={`rounded-lg py-1.5 ${d.건수 === maxCount ? "bg-[#1B2B4B]/10 text-[#1B2B4B] font-bold" : "bg-gray-50 text-gray-500"}`}>
            <div className="font-bold">{d.day}</div>
            <div>{d.건수}건</div>
          </div>
        ))}
      </div>
    </section>
  );
}


function SettlementClientAnalysis({ topRows = [], dropRows = [], newClients = [], targetMonth }) {
  return (
    <>
      <div className="border-t border-gray-200" />

      <section>
        <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-3">월 매출 Top 10 거래처</h4>
        <SettlementTop10 rows={topRows} allRows={dropRows} targetMonth={targetMonth} />
      </section>

      <div className="border-t border-gray-200" />

      <section>
        <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-3">전월 대비 매출 감소 TOP10</h4>
        <SettlementTop10Drop rows={dropRows} targetMonth={targetMonth} />
      </section>

      <div className="border-t border-gray-200" />

      <section>
        <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-3">신규 거래처 (당월)</h4>
        {newClients.length ? (
          <SettlementNewClients rows={newClients} />
        ) : (
          <div className="text-[13px] text-gray-500 text-center py-4">신규 거래처가 없습니다</div>
        )}
      </section>
    </>
  );
}

// ⭐ 매출관리 화면 개편 — 예전엔 이 컴포넌트가 "누적현황 및 월 예상지표" 카드
// 하나를 통째로(네이비 헤더+월 선택 포함) 그렸지만, 지금은 매출 현황 리포트
// 카드 하나에 여러 섹션 중 하나로 합쳐져서 렌더링된다. 월 선택은 이제 그 상위
// 카드의 공통 헤더가 담당하므로 setTargetMonth는 더 이상 받지 않는다.
function SettlementMonthlyHeader({ targetMonth, monthRows, monthPureRows, forecast, forecast2026 }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const totalSale = monthRows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const totalCnt = monthRows.length;
  const avgSale = totalCnt ? totalSale / totalCnt : 0;

  return (
    <section>
      <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-3">누적현황 및 월 예상지표</h4>
      <div className="space-y-6">

        {/* 현재 누적 실적 */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <StatCard title="총 매출" value={`${totalSale.toLocaleString()}원`} />
          <StatCard title="총 오더수" value={`${totalCnt}건`} />
          <StatCard title="평균매출/건" value={`${Math.round(avgSale).toLocaleString()}원`} />
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-3 my-2">
          <span className="text-xs font-semibold text-indigo-600">예상 지표</span>
          <div className="flex-1 border-t border-dashed border-indigo-300" />
        </div>

        {/* 월 예상 */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <StatCard title="예상 매출" value={`${forecast.sale.toLocaleString()}원`} variant="forecast" />
          <StatCard title="예상 건수" value={`${forecast.count}건`} variant="forecast" />
          <StatCard title="예상 수익" value={`${forecast.profit.toLocaleString()}원`} variant="forecast" />
        </div>


      </div>
    </section>
  );
}

function SettlementTop10({ rows = [], allRows = [], targetMonth }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const [y, m] = targetMonth.split("-").map(Number);
  const curStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const curEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const prev = new Date(y, m - 2, 1);
  const py = prev.getFullYear();
  const pm = prev.getMonth() + 1;
  const prevStart = `${py}-${String(pm).padStart(2, "0")}-01`;
  const prevEnd = `${py}-${String(pm).padStart(2, "0")}-${new Date(py, pm, 0).getDate()}`;

  const groupByClient = (list) => {
    const map = {};
    list.forEach((r) => {
      const c = r.거래처명 || "미지정";
      if (!map[c]) map[c] = { sale: 0, profit: 0, cnt: 0 };
      const sale = toInt(r.청구운임);
      const driver = toInt(r.기사운임);
      map[c].sale += sale;
      map[c].profit += sale - driver - paidOut(r); // ⭐ 2026-11-17 = orderProfit
      map[c].cnt += 1;
    });
    return map;
  };

  const curMap = groupByClient(allRows.filter((r) => r.상차일 >= curStart && r.상차일 <= curEnd));
  const prevMap = groupByClient(allRows.filter((r) => r.상차일 >= prevStart && r.상차일 <= prevEnd));

  const top10 = Object.keys(curMap)
    .map((client) => {
      const cur = curMap[client];
      const pv = prevMap[client] || { sale: 0, profit: 0, cnt: 0 };
      return {
        client,
        sale: cur.sale,
        profit: cur.profit,
        cnt: cur.cnt,
        saleRate: pv.sale === 0 ? 0 : ((cur.sale - pv.sale) / pv.sale) * 100,
        profitRate: pv.profit === 0 ? 0 : ((cur.profit - pv.profit) / pv.profit) * 100,
        cntDiff: cur.cnt - pv.cnt,
      };
    })
    .sort((a, b) => b.sale - a.sale)
    .slice(0, 10);

  const won = (n) => `${n.toLocaleString()}원`;
  const arrow = (n) => (n >= 0 ? "▲" : "▼");
  const rateCls = (n) => (n > 0 ? "text-[#E5484D]" : n < 0 ? "text-[#2D6BE0]" : "text-gray-400"); // ⭐ 2026-11-17 늘면 빨강 · 줄면 파랑

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
      <table className="w-full text-[13px] border-collapse text-center">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="border p-2"><EditableText id="settlement.newClients.header.순위" defaultText="순위" /></th>
            <th className="border p-2"><EditableText id="settlement.newClients.header.거래처" defaultText="거래처" /></th>
            <th className="border p-2"><EditableText id="settlement.newClients.header.매출" defaultText="매출" /></th>
            <th className="border p-2"><EditableText id="settlement.newClients.header.수익" defaultText="수익" /></th>
            <th className="border p-2"><EditableText id="settlement.newClients.header.건수" defaultText="건수" /></th>
          </tr>
        </thead>
        <tbody>
          {top10.map((r, i) => (
            <tr key={r.client} className="hover:bg-gray-50">
              <td className="border p-2 font-semibold">{i + 1}</td>
              <td className="border p-2 text-indigo-700 font-semibold">{r.client}</td>
              <td className="border p-2">
                <span className="inline-flex items-center gap-1">
                  <span>{won(r.sale)}</span>
                  <span className={`text-[11px] ${rateCls(r.saleRate)}`}>{arrow(r.saleRate)}{Math.abs(r.saleRate).toFixed(1)}%</span>
                </span>
              </td>
              <td className="border p-2">
                <span className="inline-flex items-center gap-1">
                  <span className={profitCls(r.profit)}>{won(r.profit)}</span>
                  <span className={`text-[11px] ${rateCls(r.profitRate)}`}>{arrow(r.profitRate)}{Math.abs(r.profitRate).toFixed(1)}%</span>
                </span>
              </td>
              <td className="border p-2">
                <span className="inline-flex items-center gap-1">
                  <span>{r.cnt}</span>
                  <span className={`text-[11px] ${r.cntDiff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    ({r.cntDiff >= 0 ? "+" : ""}{r.cntDiff})
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettlementTop10Drop({ rows = [], targetMonth }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const [y, m] = targetMonth.split("-").map(Number);
  const curStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const curEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const prev = new Date(y, m - 2, 1);
  const py = prev.getFullYear();
  const pm = prev.getMonth() + 1;
  const prevStart = `${py}-${String(pm).padStart(2, "0")}-01`;
  const prevEnd = `${py}-${String(pm).padStart(2, "0")}-${new Date(py, pm, 0).getDate()}`;

  const groupByClient = (list) => {
    const map = {};
    list.forEach((r) => {
      const c = r.거래처명 || "미지정";
      if (!map[c]) map[c] = { sale: 0, cnt: 0 };
      map[c].sale += toInt(r.청구운임);
      map[c].cnt += 1;
    });
    return map;
  };

  const curMap = groupByClient(rows.filter((r) => r.상차일 >= curStart && r.상차일 <= curEnd));
  const prevMap = groupByClient(rows.filter((r) => r.상차일 >= prevStart && r.상차일 <= prevEnd));

  const reasonTag = ({ prevCnt, curCnt, prevSale, curSale }) => {
    if (prevCnt > 0 && curCnt === 0) return "거래 중단 의심";
    if (curCnt <= prevCnt * 0.6) return "거래량 급감";
    if (curCnt > 0 && curSale / curCnt < (prevSale / Math.max(prevCnt, 1)) * 0.7) return "단가 하락";
    return "기타";
  };

  const drops = Object.keys({ ...curMap, ...prevMap })
    .map((client) => {
      const cur = curMap[client] || { sale: 0, cnt: 0 };
      const pv = prevMap[client] || { sale: 0, cnt: 0 };
      return {
        client,
        prevSale: pv.sale,
        curSale: cur.sale,
        prevCnt: pv.cnt,
        curCnt: cur.cnt,
        diff: cur.sale - pv.sale,
        reason: reasonTag({ prevCnt: pv.cnt, curCnt: cur.cnt, prevSale: pv.sale, curSale: cur.sale }),
      };
    })
    .filter((r) => r.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  if (!drops.length) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
      <div className="flex justify-between items-end mb-3">
        <span className="text-[11px] font-medium text-indigo-600">기준: 해당 월 1일 ~ 말일</span>
      </div>
      <table className="w-full text-[13px] border-collapse text-center">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.순위" defaultText="순위" /></th>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.거래처" defaultText="거래처" /></th>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.전월매출" defaultText="전월 매출" /></th>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.당월매출" defaultText="당월 매출" /></th>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.거래량" defaultText="거래량" /></th>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.감소액" defaultText="감소액" /></th>
            <th className="border p-2"><EditableText id="settlement.top10Drop.header.원인분석" defaultText="원인 분석" /></th>
          </tr>
        </thead>
        <tbody>
          {drops.map((r) => (
            <tr key={r.client} className="hover:bg-gray-50">
              <td className="border p-2 font-semibold">{r.rank}</td>
              <td className="border p-2 font-semibold">{r.client}</td>
              <td className="border p-2 text-indigo-600 font-semibold">{r.prevSale.toLocaleString()}원</td>
              <td className="border p-2 text-rose-600 font-semibold">{r.curSale.toLocaleString()}원</td>
              <td className="border p-2">{r.prevCnt} → {r.curCnt}</td>
              <td className="border p-2 text-rose-600 font-bold">{r.diff.toLocaleString()}원</td>
              <td className="border p-2 text-[11px] font-medium text-gray-700">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettlementNewClients({ rows = [] }) {
  const ncSort = useTableSort("settlement.newClients"); // ⭐ 머리글 클릭 정렬 — 이 브라우저에만 기억
  const sorted = React.useMemo(() => sortRows(rows, ncSort.sort), [rows, ncSort.sort]);
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
      <table className="w-full text-[13px] text-center border-collapse">
        <thead className="bg-gray-50">
          <tr>
            {[["client","거래처","거래처"],["firstDate","첫거래일","첫 거래일"],["cnt","건수","건수"],["sale","매출","매출"],["profit","수익","수익"]].map(([k, id, h]) => (
              <SortTh key={k} k={k} sort={ncSort.sort} onSort={ncSort.toggle} className="border p-2"><EditableText id={`settlement.newClients.header.${id}`} defaultText={h} /></SortTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.client} className="hover:bg-gray-50">
              <td className="border p-2 font-semibold">{r.client}</td>
              <td className="border p-2">{r.firstDate}</td>
              <td className="border p-2">{r.cnt}</td>
              <td className="border p-2">{r.sale.toLocaleString()}원</td>
              <td className={`border p-2 ${profitCls(r.profit)}`}>{r.profit.toLocaleString()}원</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettlementOverallStats({ rows }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => `${(n || 0).toLocaleString()}원`;
  const totalCnt = rows.length;
  const totalSale = rows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const avgSale = totalCnt ? totalSale / totalCnt : 0;
  return (
    <div className="grid grid-cols-3 gap-4 text-center">
      <StatCard title="총 매출" value={won(totalSale)} />
      <StatCard title="총 오더수" value={`${totalCnt}건`} />
      <StatCard title="평균매출/오더" value={won(avgSale)} />
    </div>
  );
}

function StatCard({ title, value, variant = "current", sub = null }) {
  const isForecast = variant === "forecast";
  return (
    <div className={`rounded-xl border p-4 transition-all hover:shadow-md ${isForecast ? "bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200" : "bg-white border-gray-200"}`}>
      <div className="flex items-center gap-2 mb-1">
        {isForecast && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
        <p className={`text-[12px] font-semibold tracking-tight ${isForecast ? "text-indigo-600" : "text-gray-500"}`}>{title}</p>
      </div>
      <p className={`tracking-tight ${isForecast ? "text-[17px] font-bold text-indigo-800" : "text-[19px] font-bold text-gray-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function Metric({ label, value, valueClass = "text-gray-900" }) {
  return (
    <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
      <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{label}</p>
      <p className={`text-[16px] font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function ScenarioCard({ title, value, tone, highlight = false }) {
  const toneMap = {
    gray: "bg-gray-50 border-gray-200 text-gray-800",
    indigo: "bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-300 text-indigo-800",
    emerald: "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300 text-emerald-800",
  };
  const labelMap = { gray: "text-gray-500", indigo: "text-indigo-600", emerald: "text-emerald-600" };

  return (
    <div className={`rounded-xl border p-5 transition-all hover:shadow-md ${toneMap[tone]} ${highlight ? "ring-2 ring-indigo-400 shadow-lg scale-[1.02]" : ""}`}>
      <p className={`text-[12px] font-semibold mb-2 ${labelMap[tone]}`}>{title}</p>
      <p className="text-[18px] font-bold">{value.toLocaleString()}원</p>
      {highlight && (
        <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">기준 시나리오</span>
      )}
    </div>
  );
}

function YearlySummaryChart({ rows = [], year, clients = [], places = [] }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  // ⭐ 성능 최적화 — clients/places가 바뀔 때만 이름→플래그 Map을 새로 만들어
  // 매달 오더를 순수매출제외 여부로 나눌 때 매번 배열 스캔을 하지 않게 한다.
  const isExcludedFast = React.useMemo(
    () => buildNetRevenueExclusionLookup(clients, places),
    [clients, places]
  );
  const isFresh = (r) => isExcludedFast(r.거래처명);
  const excludedClientNames = getNetRevenueExcludedNames(clients, places);
  const hasExcludedClients = excludedClientNames.length > 0;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const summary = months.map((m) => {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const list = rows.filter((r) => (r.상차일 || "").startsWith(key));
    const sale = list.reduce((a, r) => a + toInt(r.청구운임), 0);
    const driver = list.reduce((a, r) => a + toInt(r.기사운임), 0);
    const profit = profitTotals(list).fee; // ⭐ 2026-11-17 청구 − 기사 − 회사 지급분
    const pureList = list.filter((r) => !isFresh(r));
    const pureSale = pureList.reduce((a, r) => a + toInt(r.청구운임), 0);
    const pureDriver = pureList.reduce((a, r) => a + toInt(r.기사운임), 0);
    const pureProfit = pureSale - pureDriver - pureList.reduce((a, r) => a + paidOut(r), 0); // ⭐ 2026-11-17
    const freshList = list.filter((r) => isFresh(r));
    const freshSale = freshList.reduce((a, r) => a + toInt(r.청구운임), 0);
    const freshDriver = freshList.reduce((a, r) => a + toInt(r.기사운임), 0);
    const freshProfit = freshSale - freshDriver;
    return {
      month: `${m}월`, sale, profit,
      rate: sale ? (profit / sale) * 100 : 0,
      pureSale, pureProfit,
      pureRate: pureSale ? (pureProfit / pureSale) * 100 : 0,
      freshSale, freshProfit,
      freshRate: freshSale ? (freshProfit / freshSale) * 100 : 0,
    };
  });

  const total = summary.reduce(
    (a, r) => ({
      sale: a.sale + r.sale, profit: a.profit + r.profit,
      pureSale: a.pureSale + r.pureSale, pureProfit: a.pureProfit + r.pureProfit,
      freshSale: a.freshSale + r.freshSale, freshProfit: a.freshProfit + r.freshProfit,
    }),
    { sale: 0, profit: 0, pureSale: 0, pureProfit: 0, freshSale: 0, freshProfit: 0 }
  );

  return (
    <section>
      <h4 className="text-[13px] font-bold text-[#1B2B4B] mb-0.5">{year}년 월별 매출 · 수익 · 수익률 요약</h4>
      <p className="text-[11px] text-gray-400 mb-3">{hasExcludedClients ? "전체 / 순수 운송 / 제외 거래처 구분" : "월별 매출·수익 요약"}</p>
        <table className="w-full text-[13px] border-collapse text-center">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-[13px]">
              <th rowSpan={2} className="border p-2"><EditableText id="settlement.monthlySummary.header.월" defaultText="월" /></th>
              <th colSpan={3} className="border p-2 bg-indigo-50"><EditableText id="settlement.monthlySummary.header.전체매출" defaultText="전체 매출" /></th>
              {hasExcludedClients && (
                <>
                  <th colSpan={3} className="border p-2 bg-emerald-50"><EditableText id="settlement.monthlySummary.header.순수운송" defaultText="순수 운송 (제외 거래처 미포함)" /></th>
                  <th colSpan={3} className="border p-2 bg-rose-50"><EditableText id="settlement.monthlySummary.header.제외거래처" defaultText="제외 거래처" /></th>
                </>
              )}
            </tr>
            <tr className="bg-gray-50 text-gray-600 text-[11px]">
              <th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.매출" defaultText="매출" /></th><th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.수익" defaultText="수익" /></th><th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.수익률" defaultText="수익률" /></th>
              {hasExcludedClients && (
                <>
                  <th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.매출2" defaultText="매출" /></th><th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.수익2" defaultText="수익" /></th><th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.수익률2" defaultText="수익률" /></th>
                  <th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.매출3" defaultText="매출" /></th><th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.수익3" defaultText="수익" /></th><th className="border p-2"><EditableText id="settlement.monthlySummary.subheader.수익률3" defaultText="수익률" /></th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.month} className="hover:bg-gray-50">
                <td className="border p-2 font-semibold">{r.month}</td>
                <td className="border p-2 text-indigo-600">{r.sale.toLocaleString()}원</td>
                <td className={`border p-2 ${profitCls(r.profit)}`}>{r.profit.toLocaleString()}원</td>{/* ⭐ 2026-11-17 수익 — 플러스 빨강 · 마이너스 파랑 */}
                <td className={`border p-2 ${profitRateCls(r.rate)}`}>{r.rate.toFixed(1)}%</td>
                {hasExcludedClients && (
                  <>
                    <td className="border p-2 text-indigo-600">{r.pureSale.toLocaleString()}원</td>
                    <td className={`border p-2 ${profitCls(r.pureProfit)}`}>{r.pureProfit.toLocaleString()}원</td>
                    <td className={`border p-2 ${profitRateCls(r.pureRate)}`}>{r.pureRate.toFixed(1)}%</td>
                    <td className="border p-2 text-rose-600">{r.freshSale.toLocaleString()}원</td>
                    <td className={`border p-2 ${profitCls(r.freshProfit)}`}>{r.freshProfit.toLocaleString()}원</td>
                    <td className={`border p-2 ${profitRateCls(r.freshRate)}`}>{r.freshRate.toFixed(1)}%</td>
                  </>
                )}
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td className="border p-2">합계</td>
              <td className="border p-2 text-indigo-700">{total.sale.toLocaleString()}원</td>
              <td className={`border p-2 ${profitCls(total.profit)}`}>{total.profit.toLocaleString()}원</td>
              <td className={`border p-2 ${profitRateCls(total.sale ? (total.profit / total.sale) * 100 : 0)}`}>{total.sale ? ((total.profit / total.sale) * 100).toFixed(1) : "0.0"}%</td>
              {hasExcludedClients && (
                <>
                  <td className="border p-2 text-indigo-700">{total.pureSale.toLocaleString()}원</td>
                  <td className={`border p-2 ${profitCls(total.pureProfit)}`}>{total.pureProfit.toLocaleString()}원</td>
                  <td className={`border p-2 ${profitRateCls(total.pureSale ? (total.pureProfit / total.pureSale) * 100 : 0)}`}>{total.pureSale ? ((total.pureProfit / total.pureSale) * 100).toFixed(1) : "0.0"}%</td>
                  <td className="border p-2 text-rose-600">{total.freshSale.toLocaleString()}원</td>
                  <td className={`border p-2 ${profitCls(total.freshProfit)}`}>{total.freshProfit.toLocaleString()}원</td>
                  <td className={`border p-2 ${profitRateCls(total.freshSale ? (total.freshProfit / total.freshSale) * 100 : 0)}`}>{total.freshSale ? ((total.freshProfit / total.freshSale) * 100).toFixed(1) : "0.0"}%</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
    </section>
  );
}

function ClientInsight({ rows = [] }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;
  if (!rows.length) return <div className="text-[13px] text-gray-500 text-center py-6">데이터가 없습니다</div>;
  const sale = rows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const driver = rows.reduce((a, r) => a + toInt(r.기사운임), 0);
  const profit = profitTotals(rows).fee; // ⭐ 2026-11-17 청구 − 기사 − 회사 지급분(지게차·외부 특수운임)
  const rate = sale === 0 ? 0 : (profit / sale) * 100;
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex justify-between text-[13px]"><span className="text-gray-600">매출</span><span className="font-semibold">{sale.toLocaleString()}원</span></div>
      <div className="flex justify-between text-[13px]"><span className="text-gray-600">운반비</span><span>{driver.toLocaleString()}원</span></div>
      <div className="flex justify-between text-[13px] font-semibold"><span className="text-gray-700">수익</span><span className={profitCls(profit, "text-gray-700")}>{profit.toLocaleString()}원</span></div>{/* ⭐ 2026-11-17 플러스 빨강 · 마이너스 파랑 */}
      <div className="text-[11px] text-gray-500 text-right">수익률 <span className={profitRateCls(rate)}>{rate.toFixed(1)}%</span></div>
    </div>
  );
}
// ===================== 거래처 동향 분석 대시보드 =====================
function ClientCompareDashboard({ dispatchData = [], places = [], fixedRows = [], clients = [] }) {
  const toInt = (v) => parseInt(String(v || "0").replace(/[^\d-]/g, ""), 10) || 0;

  // 오늘 기준 날짜 계산
  const today = new Date();
  const todayStr = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const todayDay = String(today.getDate()).padStart(2, "0");

  const curYear  = today.getFullYear();
  const curMonth = today.getMonth() + 1;

  // 전월
  const prevMonthDate = new Date(curYear, curMonth - 2, 1);
  const prevYear  = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;
  const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const curMonthKey  = `${curYear}-${String(curMonth).padStart(2, "0")}`;
  const lastYearKey  = `${curYear - 1}-${String(curMonth).padStart(2, "0")}`;

  // 당월 같은 날짜
  const prevMonthSameDayMax = new Date(prevYear, prevMonth, 0).getDate();
  const sameDayPrev = Math.min(today.getDate(), prevMonthSameDayMax);
  const prevSameDayStr  = `${prevMonthKey}-${String(sameDayPrev).padStart(2, "0")}`;
  const lastYearSameDayStr = `${lastYearKey}-${todayDay}`;

  // 검색/필터
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState("curSale");
  const [sortDir, setSortDir] = React.useState("desc");
  const [selectedClient, setSelectedClient] = React.useState(null);

// 기본 거래처 업체명만 추출
  const clientNames = React.useMemo(() => {
    return Array.from(new Set(
      (clients || []).map(c => c.거래처명?.trim()).filter(Boolean)
    )).sort();
  }, [clients]);

  // dispatchData + fixedRows 병합
  const allRows = React.useMemo(() => {
    const fixed = (fixedRows || []).map(r => ({
      상차일: r.날짜,
      거래처명: r.거래처명 || "",
      하차지명: r.도착지 || "",
      청구운임: toInt(r.청구운임),
      기사운임: toInt(r.기사운임),
      배차상태: "배차완료",
    }));
    return [...(dispatchData || []).filter(r => r.배차상태 === "배차완료"), ...fixed];
  }, [dispatchData, fixedRows]);

  // 특정 기간 데이터
  const getRows = (startKey, endKey) =>
    allRows.filter(r => r.상차일 >= startKey && r.상차일 <= endKey);

  const curRows    = getRows(`${curMonthKey}-01`, todayStr);
  const prevRows   = getRows(`${prevMonthKey}-01`, prevSameDayStr);
  const lastYearRows = getRows(`${lastYearKey}-01`, lastYearSameDayStr);

  // 거래처별 집계
const aggregate = (rows) => {
    const map = {};
    rows.forEach(r => {
      const name = r.거래처명?.trim() || "";
      if (!name) return;
      if (!map[name]) map[name] = { sale: 0, driver: 0, cnt: 0 };
      map[name].sale   += toInt(r.청구운임);
      map[name].driver += toInt(r.기사운임);
      map[name].cnt    += 1;
    });
    return map;
  };

  const curMap      = aggregate(curRows);
  const prevMap     = aggregate(prevRows);
  const lastYearMap = aggregate(lastYearRows);

  // places 업체만 필터 후 비교 데이터 생성
const tableData = React.useMemo(() => {
    return clientNames
      .filter(name => !search || name.toLowerCase().includes(search.toLowerCase()))
      .map(name => {
        const cur  = curMap[name]      || { sale: 0, driver: 0, cnt: 0 };
        const prev = prevMap[name]     || { sale: 0, driver: 0, cnt: 0 };
        const ly   = lastYearMap[name] || { sale: 0, driver: 0, cnt: 0 };
        const curProfit  = cur.sale  - cur.driver;
        const prevProfit = prev.sale - prev.driver;
        const lyProfit   = ly.sale   - ly.driver;
        const saleDiff   = cur.sale  - prev.sale;
        const saleDiffLY = cur.sale  - ly.sale;
        return {
          name, curSale: cur.sale, curProfit, curCnt: cur.cnt,
          prevSale: prev.sale, prevProfit, prevCnt: prev.cnt,
          lySale: ly.sale, lyProfit, lyCnt: ly.cnt,
          saleDiff, saleDiffLY,
          trend: cur.sale > prev.sale ? "up" : cur.sale < prev.sale ? "down" : "flat",
        };
      })
      .sort((a, b) => {
        const v = (sortDir === "desc" ? -1 : 1);
        return (a[sortKey] - b[sortKey]) * v;
      });
}, [clientNames, search, sortKey, sortDir, curMap, prevMap, lastYearMap]);

  const won = (n) => n ? `${n.toLocaleString()}` : "—";
  const diff = (n) => {
    if (!n) return <span className="text-gray-400">—</span>;
    return (
      <span className={n > 0 ? "text-emerald-600" : "text-rose-500"}>
        {n > 0 ? "+" : ""}{n.toLocaleString()}
      </span>
    );
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortTh = ({ k, label }) => (
    <th
      className="border-b border-gray-200 px-3 py-3 text-[12px] font-bold text-gray-500 cursor-pointer select-none hover:text-[#1B2B4B] whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      <EditableText id={`settlement.clientCompare.header.${label}`} defaultText={label} /> {sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  // 요약 KPI
  const totalCur  = curRows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const totalPrev = prevRows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const totalLY   = lastYearRows.reduce((a, r) => a + toInt(r.청구운임), 0);
  const activeClients = tableData.filter(r => r.curSale > 0).length;
  const newClients    = tableData.filter(r => r.curSale > 0 && r.prevSale === 0).length;
  const dropClients   = tableData.filter(r => r.curSale === 0 && r.prevSale > 0).length;

  return (
    <div className="px-8 py-6 space-y-6">

      {/* ── KPI 헤더 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `당월 누계 (${curMonthKey})`, value: `${totalCur.toLocaleString()}원`, sub: `전월 대비 ${totalCur - totalPrev >= 0 ? "+" : ""}${(totalCur - totalPrev).toLocaleString()}원`, color: "text-[#1B2B4B]" },
          { label: `전월 동기 (${prevMonthKey})`, value: `${totalPrev.toLocaleString()}원`, color: "text-gray-600" },
          { label: `작년 동월 (${lastYearKey})`, value: `${totalLY.toLocaleString()}원`, sub: `YoY ${totalCur - totalLY >= 0 ? "+" : ""}${(totalCur - totalLY).toLocaleString()}원`, color: "text-gray-600" },
          { label: "거래처 현황", value: `${activeClients}개 활성`, sub: `신규 ${newClients}개 / 중단 ${dropClients}개`, color: "text-[#1B2B4B]" },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
            <div className="text-[11px] font-semibold text-gray-500 mb-1">{kpi.label}</div>
            <div className={`text-[18px] font-bold ${kpi.color}`}>{kpi.value}</div>
            {kpi.sub && <div className="text-[11px] text-gray-500 mt-1">{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── 검색 & 기준 안내 ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <input autoComplete="off"
            type="text"
            placeholder="거래처 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-[220px] focus:outline-none focus:border-[#1B2B4B]"
          />
          <div className="text-[12px] text-gray-500">
            {tableData.length}개 거래처
          </div>
        </div>
        <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          기준: 당월 1일 ~ {todayStr} / 전월 1일 ~ {prevSameDayStr} / 작년 1일 ~ {lastYearSameDayStr}
        </div>
      </div>

      {/* ── 메인 테이블 ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-white">상하차지 거래처별 동기간 비교</h3>
            <p className="text-[11px] text-white/50 mt-0.5">클릭하면 상세 추이를 확인합니다</p>
          </div>
          <div className="text-[11px] text-white/40 flex gap-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>전월 대비 증가</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block"/>전월 대비 감소</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-gray-50 text-center">
                <th className="border-b border-gray-200 px-3 py-3 text-[12px] font-bold text-gray-500 text-left sticky left-0 bg-gray-50"><EditableText id="settlement.clientCompare.거래처" defaultText="거래처" /></th>
                <th colSpan={3} className="border-b border-l border-gray-200 px-3 py-2 text-[11px] font-bold text-[#1B2B4B] bg-[#1B2B4B]/5"><EditableText id="settlement.clientCompare.당월" defaultText="당월" /></th>
                <th colSpan={3} className="border-b border-l border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-500 bg-gray-50"><EditableText id="settlement.clientCompare.전월동기" defaultText="전월 동기" /></th>
                <th colSpan={3} className="border-b border-l border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-500 bg-gray-50"><EditableText id="settlement.clientCompare.작년동월" defaultText="작년 동월" /></th>
                <th colSpan={2} className="border-b border-l border-gray-200 px-3 py-2 text-[11px] font-bold text-indigo-600 bg-indigo-50"><EditableText id="settlement.clientCompare.증감" defaultText="증감" /></th>
              </tr>
              <tr className="bg-gray-50 text-center">
                <th className="border-b border-gray-200 px-3 py-2 text-left sticky left-0 bg-gray-50 text-[11px] text-gray-500">전체 {clientNames.length}개</th>

                <SortTh k="curSale"   label="매출" />
                <SortTh k="curProfit" label="수익" />
                <SortTh k="curCnt"    label="건수" />
                <th className="border-b border-l border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-500"><EditableText id="settlement.clientCompare.header.매출" defaultText="매출" /></th>
                <th className="border-b border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-500"><EditableText id="settlement.clientCompare.header.수익" defaultText="수익" /></th>
                <th className="border-b border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-500"><EditableText id="settlement.clientCompare.header.건수" defaultText="건수" /></th>
                <th className="border-b border-l border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-500"><EditableText id="settlement.clientCompare.header.매출" defaultText="매출" /></th>
                <th className="border-b border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-500"><EditableText id="settlement.clientCompare.header.수익" defaultText="수익" /></th>
                <th className="border-b border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-500"><EditableText id="settlement.clientCompare.header.건수" defaultText="건수" /></th>
                <SortTh k="saleDiff"   label="전월比" />
                <SortTh k="saleDiffLY" label="작년比" />
              </tr>
            </thead>
            <tbody>
              {tableData.map((r) => {
                const isActive = r.curSale > 0;
                const barWidth = tableData.length ? Math.min((r.curSale / Math.max(...tableData.map(x => x.curSale), 1)) * 100, 100) : 0;
                return (
                  <tr
                    key={r.name}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      selectedClient === r.name ? "bg-[#1B2B4B]/5" : "hover:bg-gray-50"
                    } ${!isActive ? "opacity-40" : ""}`}
                    onClick={() => setSelectedClient(prev => prev === r.name ? null : r.name)}
                  >
                    <td className="px-3 py-3 font-semibold text-[#1B2B4B] sticky left-0 bg-inherit whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            r.trend === "up" ? "bg-emerald-500" : r.trend === "down" ? "bg-rose-400" : "bg-gray-300"
                          }`}
                        />
                        {r.name}
                      </div>
                      {/* 미니 바차트 */}
                      <div className="mt-1 h-1 bg-gray-100 rounded-full w-[80px]">
                        <div className="h-1 bg-[#1B2B4B]/30 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-[#1B2B4B]">{won(r.curSale)}</td>
                    <td className={`px-3 py-3 text-center font-semibold ${profitCls(r.curProfit, "text-gray-500")}`}>{won(r.curProfit)}</td>{/* ⭐ 2026-11-17 플러스 빨강 · 마이너스 파랑 */}
                    <td className="px-3 py-3 text-center text-gray-600">{r.curCnt || "—"}</td>
                    <td className="px-3 py-3 text-center text-gray-500 border-l border-gray-100">{won(r.prevSale)}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{won(r.prevProfit)}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{r.prevCnt || "—"}</td>
                    <td className="px-3 py-3 text-center text-gray-500 border-l border-gray-100">{won(r.lySale)}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{won(r.lyProfit)}</td>
                    <td className="px-3 py-3 text-center text-gray-500">{r.lyCnt || "—"}</td>
                    <td className="px-3 py-3 text-center border-l border-gray-100">{diff(r.saleDiff)}</td>
                    <td className="px-3 py-3 text-center">{diff(r.saleDiffLY)}</td>
                  </tr>
                );
              })}
              {!tableData.length && (
                <tr><td colSpan={12} className="text-center text-gray-500 py-16 text-[14px]">등록된 상하차지 거래처가 없습니다</td></tr>
              )}
            </tbody>
            {/* 합계 행 */}
            {tableData.length > 0 && (() => {
              const s = tableData.reduce((a, r) => ({
                cur: a.cur + r.curSale, curP: a.curP + r.curProfit, curC: a.curC + r.curCnt,
                prev: a.prev + r.prevSale, prevP: a.prevP + r.prevProfit, prevC: a.prevC + r.prevCnt,
                ly: a.ly + r.lySale, lyP: a.lyP + r.lyProfit, lyC: a.lyC + r.lyCnt,
              }), { cur: 0, curP: 0, curC: 0, prev: 0, prevP: 0, prevC: 0, ly: 0, lyP: 0, lyC: 0 });
              return (
                <tfoot>
                  <tr className="bg-[#1B2B4B]/5 font-bold text-[13px] text-center border-t-2 border-[#1B2B4B]/20">
                    <td className="px-3 py-3 text-left text-[#1B2B4B] sticky left-0 bg-[#1B2B4B]/5">합계</td>
                    <td className="px-3 py-3 text-[#1B2B4B]">{s.cur.toLocaleString()}</td>
                    <td className={`px-3 py-3 ${profitCls(s.curP)}`}>{s.curP.toLocaleString()}</td>
                    <td className="px-3 py-3">{s.curC}</td>
                    <td className="px-3 py-3 border-l border-gray-200">{s.prev.toLocaleString()}</td>
                    <td className="px-3 py-3">{s.prevP.toLocaleString()}</td>
                    <td className="px-3 py-3">{s.prevC}</td>
                    <td className="px-3 py-3 border-l border-gray-200">{s.ly.toLocaleString()}</td>
                    <td className="px-3 py-3">{s.lyP.toLocaleString()}</td>
                    <td className="px-3 py-3">{s.lyC}</td>
                    <td className="px-3 py-3 border-l border-gray-200">{diff(s.cur - s.prev)}</td>
                    <td className="px-3 py-3">{diff(s.cur - s.ly)}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

      {/* ── 선택된 거래처 상세 추이 ── */}
      {selectedClient && (() => {
        const clientAllRows = allRows.filter(r =>
          (r.하차지명?.trim() || r.거래처명?.trim()) === selectedClient
        );
        const monthly = {};
        clientAllRows.forEach(r => {
          const ym = (r.상차일 || "").slice(0, 7);
          if (!ym) return;
          if (!monthly[ym]) monthly[ym] = { sale: 0, profit: 0, cnt: 0 };
          monthly[ym].sale   += toInt(r.청구운임);
          monthly[ym].profit += orderProfit(r);
          monthly[ym].cnt    += 1;
        });
        const sortedMonths = Object.keys(monthly).sort().slice(-12);
        const maxSale = Math.max(...sortedMonths.map(m => monthly[m].sale), 1);

        return (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-white">{selectedClient} 월별 추이</h3>
                <p className="text-[11px] text-white/50 mt-0.5">최근 12개월</p>
              </div>
              <button onClick={() => setSelectedClient(null)} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg text-white text-lg flex items-center justify-center transition">×</button>
            </div>
            <div className="p-6">
              <div className="flex items-end gap-2 h-[120px] mb-3">
                {sortedMonths.map(ym => {
                  const d = monthly[ym];
                  const h = Math.max((d.sale / maxSale) * 100, 2);
                  const isCurrentMonth = ym === curMonthKey;
                  return (
                    <div key={ym} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1B2B4B] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-10 pointer-events-none">
                        {d.sale.toLocaleString()}원
                      </div>
                      <div
                        className={`w-full rounded-t transition-all ${isCurrentMonth ? "bg-[#1B2B4B]" : "bg-[#1B2B4B]/25 group-hover:bg-[#1B2B4B]/50"}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                {sortedMonths.map(ym => (
                  <div key={ym} className="flex-1 text-center text-[10px] text-gray-500 truncate">{ym.slice(5)}월</div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "당월 매출", v: (curMap[selectedClient] || {}).sale || 0, color: "text-[#1B2B4B]" },
                  { label: "전월 매출", v: (prevMap[selectedClient] || {}).sale || 0, color: "text-gray-500" },
                  { label: "작년 동월", v: (lastYearMap[selectedClient] || {}).sale || 0, color: "text-gray-500" },
                ].map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                    <div className="text-[11px] text-gray-500 mb-1">{item.label}</div>
                    <div className={`text-[15px] font-bold ${item.color}`}>{item.v ? item.v.toLocaleString() + "원" : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 🧩 2026-11-27 UnassignedStatus → src/dispatch/UnassignedStatus.jsx (처음 열 때 받는다)
const UnassignedStatus = lazyView(() => import("./dispatch/UnassignedStatus.jsx"));

// 🧩 2026-11-27 ClientSettlement → src/dispatch/ClientSettlement.jsx (처음 열 때 받는다)
const ClientSettlement = lazyView(() => import("./dispatch/ClientSettlement.jsx"));

// 🧩 2026-11-27 PaymentManagement → src/dispatch/PaymentManagement.jsx (처음 열 때 받는다)
const PaymentManagement = lazyView(() => import("./dispatch/PaymentManagement.jsx"));

// 🧩 2026-11-27 DriverManagement → src/dispatch/DriverManagement.jsx (처음 열 때 받는다)
const DriverManagement = lazyView(() => import("./dispatch/DriverManagement.jsx"));

// 🧩 2026-11-27 ClientManagement → src/dispatch/ClientManagement.jsx (처음 열 때 받는다)
const ClientManagement = lazyView(() => import("./dispatch/ClientManagement.jsx"));

// ─────────── 매출관리 비밀번호 잠금 화면 ───────────
// 🔐 2026-11-27 서버가 확인한다(functions/revenuePw.js) — 화면은 회사 문서의 revenuePassword 를 읽거나 비교하지 않는다
//  정하기 · 바꾸기 · 잊었을 때 새로 정하기: 회사 마스터 · 최고관리자(서버가 다시 확인) · 5번 틀리면 잠김(10 → 30 → 60분)
function RevenuePwPanel({ company, onVerified }) {
  const g = useRevenuePw({ company, onVerified });
  const [pw, setPw] = React.useState("");
  const [cur, setCur] = React.useState("");
  const [n1, setN1] = React.useState("");
  const [n2, setN2] = React.useState("");
  const [title, sub] = revenuePwTexts(g.phase);
  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-center tracking-widest focus:outline-none focus:border-[#1B2B4B] transition";
  const clear = () => { setPw(""); setCur(""); setN1(""); setN2(""); };
  const isSet = g.phase === "setup" || g.phase === "change" || g.phase === "forgot";
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-[360px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#1B2B4B] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <div className="text-[15px] font-bold text-[#1B2B4B]">{title}</div>
            <div className="text-[11px] text-gray-500">{sub}</div>
          </div>
        </div>
        {g.phase === "loading" ? (
          <div className="text-center py-4 text-gray-500 text-[13px]">확인하는 중이에요…</div>
        ) : (g.phase === "netError" || g.phase === "notStaff" || g.phase === "noCompany") ? (
          <div className="text-center py-2">
            <div className="text-[13px] text-red-500 mb-3">{g.phase === "netError" ? g.error : sub}</div>
            <button type="button" onClick={g.retry} className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold">다시 시도</button>
          </div>
        ) : g.phase === "none" ? (
          <div className="text-[13px] text-gray-500 text-center leading-relaxed">{REVENUE_PW_NONE}</div>
        ) : isSet ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (await g.save({ newPw: n1, confirmPw: n2, currentPw: cur })) clear(); }} className="space-y-2.5">
            {g.info && <div className="text-[12px] text-[#1B2B4B] bg-[#F5F8FD] rounded-lg px-3 py-2">{g.info}</div>}
            {g.phase === "change" && <input autoComplete="off" type="password" autoFocus className={inp} placeholder="지금 비밀번호" value={cur} onChange={(e) => { setCur(e.target.value); g.clearError(); }} />}
            <input autoComplete="off" type="password" autoFocus={g.phase !== "change"} className={inp} placeholder={`새 비밀번호(${REVENUE_PW_MIN}자리 이상)`} value={n1} onChange={(e) => { setN1(e.target.value); g.clearError(); }} />
            <input autoComplete="off" type="password" className={inp} placeholder="새 비밀번호 한 번 더" value={n2} onChange={(e) => { setN2(e.target.value); g.clearError(); }} />
            {g.error && <div className="text-red-500 text-[12px] text-center font-medium">{g.error}</div>}
            <button type="submit" disabled={g.busy || (g.phase === "change" && g.locked > 0)} className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl text-[14px] font-bold hover:bg-[#243860] transition disabled:opacity-50">{g.busy ? "저장하는 중…" : "저장하고 열기"}</button>
            {g.hasPw && <button type="button" onClick={() => { clear(); g.back(); }} className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-[13px] font-semibold hover:bg-gray-50 transition">비밀번호 넣기로 돌아가기</button>}
          </form>
        ) : (
          <form onSubmit={async (e) => { e.preventDefault(); const ok = await g.verify(pw); setPw(""); if (ok) clear(); }}>
            <input autoComplete="off" type="password" autoFocus disabled={g.locked > 0} className={`${inp} mb-3`} placeholder="비밀번호" value={pw} onChange={(e) => { setPw(e.target.value); g.clearError(); }} />
            {g.error && <div className="text-red-500 text-[12px] text-center mb-3 font-medium">{g.error}</div>}
            <button type="submit" disabled={g.busy || g.locked > 0} className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl text-[14px] font-bold hover:bg-[#243860] transition disabled:opacity-50">{g.busy ? "확인하는 중…" : <EditableText id="misc.btn.6942.확인" defaultText="확인" />}</button>
            {g.canSet ? (<>
              <button type="button" onClick={() => { clear(); g.openChange(); }} className="w-full mt-2 py-2.5 border border-[#1B2B4B]/30 text-[#1B2B4B] rounded-xl text-[13px] font-semibold hover:bg-[#F5F8FD] transition">비밀번호 바꾸기</button>
              <button type="button" onClick={() => { clear(); g.openForgot(); }} className="w-full mt-2 py-2 text-gray-500 text-[12px] font-semibold hover:text-[#1B2B4B] transition">잊었을 때 새로 정하기</button>
            </>) : <div className="mt-3 text-[11.5px] text-gray-400 text-center">{REVENUE_PW_FORGOT}</div>}
          </form>
        )}
      </div>
    </div>
  );
}

// 🧩 2026-11-27 MyProfilePage → src/dispatch/MyProfilePage.jsx (처음 열 때 받는다)
const MyProfilePage = lazyView(() => import("./dispatch/MyProfilePage.jsx"));

// ─────────── 회사관리 탭 래퍼 ───────────
function CompanyManagementWrapper({ payrollInAcct = false, userCompany, role, userId, user, todayStats, myStats, cardImage, setCardImage, cardImageUploading, setCardImageUploading, showAlert }) {
  // ⭐ 2026-11-06 알림 팝업 [급여명세서 열기]·[사용 계획 제출] 등 — 다른 화면에서 이 탭으로 바로(kpCmTab)
  //  (첫 값은 읽기만 하고 지우는 것은 effect에서 — 개발 모드 StrictMode가 초기값 함수를 두 번 불러도 값이 남게)
  // ⭐ 2026-11-07 예전 탭 이름(급여명세서 · 연차 사용 계획)은 내정보 안 탭으로 돌린다
  const peekCmTab = () => { try { const v = sessionStorage.getItem("kpCmTab") || ""; if (v === "급여명세서" || v === "연차 사용 계획") { sessionStorage.setItem("kpMyInfoTab", v); return "내정보"; } return v; } catch { return ""; } };
  const [tab, setTab] = React.useState(() => peekCmTab() || "회사정보");
  React.useEffect(() => {
    try { sessionStorage.removeItem("kpCmTab"); } catch { /* 무시 */ }
    const h = () => { const v = peekCmTab(); if (v) { setTab(v); try { sessionStorage.removeItem("kpCmTab"); } catch { /* 무시 */ } } };
    window.addEventListener("kp-cm-tab", h); return () => window.removeEventListener("kp-cm-tab", h);
  }, []);
  // ⭐ 2026-10-31 인사관리부는 마스터(회사 첫 가입자)·인사관리자만. 인사관리자는 상단 [인사관리부] 안에 다 있으므로 여기서는 뺀다
  const myDocCM = useMyProfile(user?.uid);
  // ⭐ 2026-11-01 마스터는 인사 담당자(인사관리자·경리+인사·인사 부서)가 없을 때만 인사관리부 — 생기면 자동으로 넘어간다
  const coStaffCM = useCompanyStaff(myDocCM?.isMaster === true ? userCompany : "");
  const canViewHR = role === "totalMaster" || role === "hrManager" || (!!coStaffCM && masterHasHr(myDocCM, coStaffCM, user?.uid));
  const tabs0 = role === "hrManager" ? ["회사정보", "조직도", "내정보", "내 이력서"] : canViewHR ? ["회사정보", "조직도", "내정보", "내 이력서", "출근기록부", "인사관리부"] : ["회사정보", "조직도", "내정보", "내 이력서", "출근기록부"];
  // ⭐ 2026-11-02 운임규칙 — 최고관리자가 이 회사에 켜 준 경우에만(관리자센터 › 회사별 맞춤 기능). 회사 직원 누구나 보고 고친다(조회전용은 보기만)
  const fareCM = useFareRules(getTenant() || userCompany);
  const tabs1a = !fareCM.feature || role === "driver" || role === "shipper" ? tabs0 : [...tabs0.slice(0, 2), "운임 규칙", ...tabs0.slice(2)];
  // ⭐ 2026-11-18 노선 특수운임 탭은 회사관리에서 뺐다 → 배차관리 [특수운임 적용] 팝업 › 고정노선운임 탭(사용자 요청)
  const tabs1 = tabs1a;
  // ⭐ 2026-11-07 급여관리는 회사관리에서 뺐다(경리 › 회계관리 › 급여 계산에서만) · 급여명세서 · 연차 사용 계획은 내정보 안 탭 ·
  //  연차 사용 촉진은 인사관리부 › 연차 관리 안. (payrollInAcct는 예전 호출 호환용으로만 남김)
  void payrollInAcct;
  const staffCM = role !== "driver" && role !== "shipper";
  // ⭐ 2026-11-09 요금제 — 출근기록부·인사관리부는 베이직부터(라이트도 회사정보·조직도·내정보는 사용)
  const { planId: planCM } = usePlan();
  const tabs = planIncludes(planCM, "hr") ? tabs1 : tabs1.filter((t) => t !== "출근기록부" && t !== "인사관리부");

  // ⭐ 디자인 개편 — 관리자메뉴와 같은 왼쪽 메뉴바 + 상단 인사 카드(AdminShell 공용 레이아웃)
  const TAB_ICONS = { 회사정보: "building", 조직도: "users", "운임 규칙": "money", "노선 특수운임": "truck", 내정보: "user", "내 이력서": "idcard", 출근기록부: "clock", 인사관리부: "idcard" };
  const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
  const myName = user?.displayName || (user?.email || "").split("@")[0] || "";
  return (
    <AdminShell
      badgeLabel="COMPANY"
      title={userCompany || "회사 관리"}
      groups={[{ label: "회사 관리", items: tabs.map((t) => ({ key: t, label: t, icon: TAB_ICONS[t] })) }]}
      active={tab}
      onSelect={setTab}
      heroTitle={`${userCompany || "우리 회사"} 회사 관리`}
      heroSubtitle={`${myName ? `${myName}님, ` : ""}회사 정보·내 정보·출근 기록을 한 곳에서 관리하세요.`}
      stats={[
        { label: "오늘 접수", value: `${todayStats?.count || 0}건`, icon: "truck", tone: "navy" },
        { label: "오늘 매출", value: won(todayStats?.revenue), icon: "money", tone: "green" },
        { label: "오늘 수익", value: won(todayStats?.profit), icon: "check", tone: "blue" },
        { label: "누적 오더", value: `${(myStats?.totalOrders || 0).toLocaleString()}건`, icon: "dashboard", tone: "violet" },
      ]}
    >
      {tab === "회사정보" && (
        <CompanyProfile userCompany={userCompany} role={role} userId={userId} />
      )}
      {tab === "조직도" && <OrgChart userCompany={userCompany} />}
      {/* ⭐ 2026-11-02 운임규칙 — 회사관리 › 운임 규칙 */}
      {tab === "운임 규칙" && fareCM.feature && <FareRulesSettings company={userCompany} canEdit={canEditFareRules(role, myDocCM?.isMaster === true)} myName={myDocCM?.name || myName} />}
      {tab === "내 이력서" && <HRManagementPage userCompany={userCompany} role={role} userId={userId} selfOnly />}
      {tab === "내정보" && (
        <MyProfilePage
          extraTabs={staffCM ? myInfoExtraTabs(userCompany, user?.uid) : []}
          user={user}
          todayStats={todayStats}
          myStats={myStats}
          cardImage={cardImage}
          setCardImage={setCardImage}
          cardImageUploading={cardImageUploading}
          setCardImageUploading={setCardImageUploading}
          showAlert={showAlert}
          userCompany={userCompany}
          role={role}
        />
      )}
      {(tab === "출근기록부" || tab === "인사관리부") && (
      <div className="bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] overflow-hidden">
      {tab === "출근기록부" && (
        <AttendanceBoard userCompany={userCompany} role={role} user={user} />
      )}
      {tab === "인사관리부" && canViewHR && (
        <HRManagementPage userCompany={userCompany} role={role} userId={userId} />
      )}
      </div>
      )}
    </AdminShell>
  );
}

// 🧩 2026-11-27 HRManagementPage → src/dispatch/HRManagementPage.jsx (처음 열 때 받는다)
const HRManagementPage = lazyView(() => import("./dispatch/HRManagementPage.jsx"));

// ─────────── PC ERP 관리 ───────────
function PCERPPage({ userCompany = "", drivers = [], clients = [], places = [], dispatchData = [], user }) {
  const [subPage, setSubPage] = React.useState(null);
  // 🛠 2026-11-17 직원 목록 Hook은 화면 분기(if) 밖에서(Hook 순서 고정)
  const [employees, setEmployees] = React.useState([]);
  React.useEffect(()=>{
    if(subPage !== "직원관리" || !userCompany) return;
    const q = query(collection(db,"users"),where("company","==",userCompany));
    const unsub = onSnapshot(q,snap=>setEmployees(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return ()=>unsub();
  },[userCompany, subPage]);
  const [search, setSearch] = React.useState("");
  const accent = "#1B2B4B";

  const allClients = [...clients, ...places].filter((c, i, arr) =>
    c.거래처명 && arr.findIndex(x => x.거래처명 === c.거래처명) === i
  );

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthOrders = dispatchData.filter(o => (o.상차일||"").startsWith(thisMonth));
  const monthRevenue = monthOrders.reduce((s,o)=>s+Number(o.청구운임||0),0);
  const monthDriverFee = monthOrders.reduce((s,o)=>s+Number(o.기사운임||0),0);

  // ── 기사 운임 집계(⭐ 2026-11-06 "급여관리"에서 이름 변경 — 직원 급여 계산과 혼동 방지) ──
  const [payYear, setPayYear] = React.useState(now.getFullYear());
  const [payMonth, setPayMonth] = React.useState(now.getMonth()+1);
  const payMonthStr = `${payYear}-${String(payMonth).padStart(2,"0")}`;
  const payOrders = dispatchData.filter(o=>(o.상차일||"").startsWith(payMonthStr)&&o.이름);
  const payByDriver = {};
  payOrders.forEach(o=>{
    const n=o.이름||"-";
    if(!payByDriver[n]) payByDriver[n]={name:n,carNo:o.차량번호||"",phone:o.전화번호||"",cnt:0,운임:0};
    payByDriver[n].cnt++;
    payByDriver[n].운임+=Number(o.기사운임||0);
  });
  const payRows = Object.values(payByDriver).sort((a,b)=>b.운임-a.운임);

  const ERPCard = ({ title, icon, badge, sub, onClick }) => (
    <div onClick={onClick} className="bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer hover:shadow-md hover:border-[#1B2B4B]/30 transition-all" style={{ minHeight: 100 }}>
      <div className="flex items-start justify-between mb-3">
        <div style={{ width:44,height:44,borderRadius:12,background:accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>{icon}</div>
        {badge!=null && badge>0 && <span style={{ background:accent,color:"#fff",fontSize:11,fontWeight:700,borderRadius:20,padding:"2px 10px" }}>{badge}</span>}
      </div>
      <div style={{ fontSize:15,fontWeight:700,color:"#111" }}>{title}</div>
      <div style={{ fontSize:12,color:"#9ca3af",marginTop:3 }}>{sub}</div>
    </div>
  );

  if (subPage === "직원관리") {
    return (
      <div className="p-6">
        <button onClick={()=>setSubPage(null)} className="flex items-center gap-1.5 text-[#1B2B4B] text-[13px] font-semibold mb-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> ERP 목록으로
        </button>
        <h3 className="text-[17px] font-bold text-gray-900 mb-4"><EditableText id="hr.erp.employee.title" defaultText="직원관리" /></h3>
        {!employees.length ? <div className="text-gray-500 text-[13px]">등록된 직원이 없습니다</div> : (
          <div className="grid grid-cols-2 gap-3">
            {employees.map(emp=>(
              <div key={emp.id} style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"16px 18px",display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ width:44,height:44,borderRadius:"50%",background:accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18,fontWeight:700,flexShrink:0 }}>
                  {(emp.name||emp.displayName||"?").charAt(0)}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:"#111" }}>{emp.name||emp.displayName||"-"}</div>
                  <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{emp.email||"-"}</div>
                </div>
                <span style={{ fontSize:11,fontWeight:700,color:accent,background:accent+"15",padding:"4px 10px",borderRadius:20,flexShrink:0 }}>{emp.role||"일반"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (subPage === "차량관리") {
    const filtered = drivers.filter(d=>!search||(d.이름||"").includes(search)||(d.차량번호||"").includes(search));
    return (
      <div className="p-6">
        <button onClick={()=>setSubPage(null)} className="flex items-center gap-1.5 text-[#1B2B4B] text-[13px] font-semibold mb-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> ERP 목록으로
        </button>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-[17px] font-bold text-gray-900"><EditableText id="hr.erp.vehicle.title" defaultText="차량관리" /></h3>
          <span style={{ background:accent+"15",color:accent,fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:20 }}>{drivers.length}대</span>
        </div>
        <input autoComplete="off" value={search} onChange={e=>setSearch(e.target.value)} placeholder="기사명 · 차량번호 검색"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] mb-4 outline-none focus:border-[#1B2B4B]" style={{ maxWidth:360 }} />
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((d,i)=>(
            <div key={d.id||i} style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",gap:12 }}>
              <div style={{ width:42,height:42,borderRadius:12,background:accent+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:14,fontWeight:700,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{d.차량번호||"-"}</div>
                <div style={{ fontSize:12,color:"#6b7280",marginTop:2 }}>{d.이름||"-"}{d.전화번호?` · ${formatPhone(d.전화번호)}`:""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (subPage === "거래처관리") {
    const filtered = allClients.filter(c=>!search||(c.거래처명||"").includes(search));
    const cnt = (name)=>dispatchData.filter(o=>o.거래처명===name).length;
    return (
      <div className="p-6">
        <button onClick={()=>setSubPage(null)} className="flex items-center gap-1.5 text-[#1B2B4B] text-[13px] font-semibold mb-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> ERP 목록으로
        </button>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-[17px] font-bold text-gray-900"><EditableText id="hr.erp.client.title" defaultText="거래처관리" /></h3>
          <span style={{ background:accent+"15",color:accent,fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:20 }}>{allClients.length}곳</span>
        </div>
        <input autoComplete="off" value={search} onChange={e=>setSearch(e.target.value)} placeholder="거래처명 검색"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] mb-4 outline-none focus:border-[#1B2B4B]" style={{ maxWidth:360 }} />
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((c,i)=>(
            <div key={i} style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",gap:12 }}>
              <div style={{ width:42,height:42,borderRadius:12,background:accent+"15",display:"flex",alignItems:"center",justifyContent:"center",color:accent,fontSize:18,fontWeight:800,flexShrink:0 }}>
                {(c.거래처명||"?").charAt(0)}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:14,fontWeight:700,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.거래처명}</div>
                <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>{c.담당자||c.연락처||""}</div>
              </div>
              {cnt(c.거래처명)>0 && <span style={{ fontSize:11,fontWeight:700,color:accent,background:accent+"15",padding:"3px 9px",borderRadius:20,flexShrink:0 }}>{cnt(c.거래처명)}건</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (subPage === "급여관리") {
    const total = payRows.reduce((s,r)=>s+r.운임,0);
    return (
      <div className="p-6">
        <button onClick={()=>setSubPage(null)} className="flex items-center gap-1.5 text-[#1B2B4B] text-[13px] font-semibold mb-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> ERP 목록으로
        </button>
        <div className="flex items-center gap-4 mb-5">
          <h3 className="text-[17px] font-bold text-gray-900"><EditableText id="hr.erp.payroll.title" defaultText="기사 운임 집계" /></h3>
          <div className="flex items-center gap-1.5">
            <button onClick={()=>{let m=payMonth-1,y=payYear;if(m<1){m=12;y--;}setPayMonth(m);setPayYear(y);}} className="w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-[13px] font-bold text-gray-700 w-24 text-center">{payYear}년 {payMonth}월</span>
            <button onClick={()=>{let m=payMonth+1,y=payYear;if(m>12){m=1;y++;}setPayMonth(m);setPayYear(y);}} className="w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,background:accent,borderRadius:16,padding:"18px 20px",marginBottom:20 }}>
          {[{l:"총 지급운임",v:total.toLocaleString()+"원"},{l:"지급 기사",v:payRows.length+"명"},{l:"총 운행건",v:payOrders.length+"건"}].map(s=>(
            <div key={s.l} style={{ textAlign:"center" }}>
              <div style={{ color:"rgba(255,255,255,0.6)",fontSize:11,marginBottom:4 }}>{s.l}</div>
              <div style={{ color:"#fff",fontSize:20,fontWeight:800 }}>{s.v}</div>
            </div>
          ))}
        </div>
        {!payRows.length ? <div className="text-gray-500 text-[13px]">이 달 운행 기록이 없습니다</div> : (
          <table style={{ width:"100%",borderCollapse:"separate",borderSpacing:"0 6px" }}>
            <thead><tr style={{ fontSize:11,color:"#9ca3af",textAlign:"left" }}>
              <th style={{ padding:"0 12px 4px" }}><EditableText id="hr.erp.payroll.header.기사명" defaultText="기사명" /></th><th><EditableText id="hr.erp.payroll.header.차량번호" defaultText="차량번호" /></th><th style={{ textAlign:"right" }}><EditableText id="hr.erp.payroll.header.운행건수" defaultText="운행건수" /></th><th style={{ textAlign:"right",paddingRight:12 }}><EditableText id="hr.erp.payroll.header.기사운임" defaultText="기사운임" /></th><th style={{ textAlign:"right",paddingRight:12 }}><EditableText id="hr.erp.payroll.header.건당평균" defaultText="건당평균" /></th>
            </tr></thead>
            <tbody>
              {payRows.map((r,i)=>(
                <tr key={i} style={{ background:"#fff",borderRadius:12 }}>
                  <td style={{ padding:"12px 12px",fontSize:13,fontWeight:700,color:"#111",borderRadius:"12px 0 0 12px",border:"1px solid #f0f0f0",borderRight:"none" }}>{r.name}</td>
                  <td style={{ padding:"12px 8px",fontSize:12,color:"#6b7280",border:"1px solid #f0f0f0",borderLeft:"none",borderRight:"none" }}>{r.carNo||"-"}</td>
                  <td style={{ padding:"12px 8px",fontSize:13,fontWeight:600,color:"#374151",textAlign:"right",border:"1px solid #f0f0f0",borderLeft:"none",borderRight:"none" }}>{r.cnt}건</td>
                  <td style={{ padding:"12px 12px",fontSize:14,fontWeight:800,color:accent,textAlign:"right",border:"1px solid #f0f0f0",borderLeft:"none",borderRight:"none" }}>{r.운임.toLocaleString()}원</td>
                  <td style={{ padding:"12px 12px",fontSize:12,color:"#9ca3af",textAlign:"right",borderRadius:"0 12px 12px 0",border:"1px solid #f0f0f0",borderLeft:"none" }}>{Math.round(r.운임/r.cnt).toLocaleString()}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // Hub
  return (
    <div className="p-6">
      {/* 이달 요약 */}
      <div style={{ background:accent,borderRadius:20,padding:"22px 24px",marginBottom:24,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16 }}>
        {[
          {l:`${now.getMonth()+1}월 매출`,v:(monthRevenue/10000).toFixed(0)+"만원",s:`${monthOrders.length}건`},
          {l:"기사운임",v:(monthDriverFee/10000).toFixed(0)+"만원",s:"지급예정"},
          {l:"수수료",v:((monthRevenue-monthDriverFee)/10000).toFixed(0)+"만원",s:"순이익"},
          {l:"등록 차량",v:drivers.length+"대",s:"기사 등록"},
        ].map(s=>(
          <div key={s.l} style={{ background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"16px 14px",textAlign:"center" }}>
            <div style={{ color:"rgba(255,255,255,0.6)",fontSize:11,marginBottom:6 }}>{s.l}</div>
            <div style={{ color:"#fff",fontSize:22,fontWeight:800 }}>{s.v}</div>
            <div style={{ color:"rgba(255,255,255,0.5)",fontSize:11,marginTop:4 }}>{s.s}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ERPCard title="직원관리" icon="◆" sub="임직원 현황 및 권한" onClick={()=>setSubPage("직원관리")} />
        <ERPCard title="차량관리" icon="▸" sub={`등록 차량 ${drivers.length}대`} badge={drivers.length} onClick={()=>setSubPage("차량관리")} />
        <ERPCard title="거래처관리" icon="◆" sub={`거래처 ${allClients.length}곳`} badge={allClients.length} onClick={()=>setSubPage("거래처관리")} />
        <ERPCard title="기사 운임 집계" icon="₩" sub="월별 기사 운임 집계 (직원 급여는 경리 › 급여 계산)" onClick={()=>setSubPage("급여관리")} />
        <ERPCard title="근태관리" icon="▤" sub="준비 중" onClick={()=>{}} />
        <ERPCard title="운행일지" icon="●" sub="준비 중" onClick={()=>{}} />
      </div>
    </div>
  );
}

// 🧩 2026-11-27 CompanyProfile → src/dispatch/CompanyProfile.jsx (처음 열 때 받는다)
const CompanyProfile = lazyView(() => import("./dispatch/CompanyProfile.jsx"));

// 📱 모바일 앱 매출관리 — PC와 같은 화면을 그대로 쓴다(MobileApp이 필요할 때만 불러옴)
export { Settlement as PcSettlement };

// 📱 2026-10-31 모바일 경리 모드 — PC 정산관리(용차지급·지입정산)·회계관리·인사관리 화면을 휴대폰에서 그대로
export function PcSettleMobile({ dispatchData = [], companyName = "", role = "", isViewer = false, clients = [] }) {
  const closeNM = useCloseInboxCount(); // 📥 배차마감 도착(경리 확인 대기) 숫자
  // ⭐ 2026-11-05 PC·모바일 일치 — PC 정산관리와 같은 3개 탭(거래처정산·용차지급관리·지입정산관리) · 첫 화면도 PC처럼 거래처정산
  const [tab, setTab] = React.useState(() => { const t = settleStartTab(); return t === "홈" ? "홈" : "거래처정산"; }); // 🧭 2026-11-16 PC와 같게 정산 홈부터
  // 지급 상태·지급일 같은 정산 칸만 고치는 간단 저장(배차 검사 없이) — 오더가 있는 컬렉션 그대로
  // 🛠 2026-11-25 PC patchDispatch 와 같은 돈 규칙 — ① 최종마감 잠금(정산 기록 __system 은 그대로 · 경리 권한은 통과)
  //  ② 청구운임 · 기사운임을 고치면 수수료도 같이(nextFee — 직접 넣은 수수료는 그대로) ③ 화주사 전송 사본에 청구운임 등 같이
  const mDesk = useArDesk((getTenant() || companyName || DEFAULT_COMPANY || "").trim());
  const mProf = useMyProfile(auth.currentUser?.uid);
  const mBypass = role === "totalMaster" || ["hrAcct", "allMgr", "acct", "accounting"].includes(role) || /경리|회계|정산/.test(String(mProf?.team || mProf?.부서 || ""));
  const patchDispatch = React.useCallback(async (_id, patch, knownPrev) => {
    if (!_id) return;
    const row = knownPrev || dispatchData.find((d) => d._id === _id || d.id === _id);
    if (patch && !patch.__system && !mBypass) {
      const lockOf = (o) => { const c = String(o?.거래처명 || "").trim(); if (!c) return null; const ym = billYmOf(o); return isFinalLocked(mDesk.closes?.get(`${c}|${ym}`)) ? { client: c, ym } : null; };
      const fl = lockOf(row) || (row ? lockOf({ ...row, ...patch }) : null);
      if (fl) { window.alert(`${fl.client} ${Number(fl.ym.slice(5))}월은 최종마감 이후 수정이 불가합니다.\n필요 시 경리팀에 해제요청 해주세요.`); return false; }
    }
    // ⭐ 2026-11-12 점검 — __system · __col 같은 화면용 표시는 문서에 쓰지 않는다(예전엔 그대로 저장됐다)
    const clean = {}; Object.entries(patch || {}).forEach(([k, v]) => { if (!k.startsWith("__")) clean[k] = v; });
    if (("청구운임" in clean || "기사운임" in clean) && !("수수료" in clean)) clean.수수료 = String(nextFee(row || null, { ...(row || {}), ...clean }));
    if (!("지급상태" in clean) || clean.지급상태 === row?.지급상태) { // 💸 2026-11-25 PC와 같은 규칙 — 지급한 오더의 기사운임 변경 · 취소는 한 번 묻고 지급액 고정(src/payCore.js)
      if (!patch?.__system && paidFareLocked(role, mBypass, row, clean)) { window.alert(PAID_FARE_LOCK_MSG); return false; } // 🔒 2026-11-27 PC와 같은 규칙
      const _pg = paidEditGuard(row, clean, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
      if (_pg.warn && !patch?.__system && !window.confirm(_pg.warn)) return false;
      Object.assign(clean, _pg.extra);
    }
    if (!patch?.__system) { const fc = fareChangeMark(row, clean, { by: auth.currentUser?.email || "" }); if (fc) clean.운임변경 = fc.clear ? null : fc; } // 🏷 2026-11-27 PC와 같은 '운임 변경' 표시
    const col = patch?.__col || row?.__col || "dispatch";
    await updateDoc(doc(db, col, _id), { ...clean, updatedAt: serverTimestamp() });
    const MIRROR = ["청구운임", "지급방식", "차량번호", "이름", "전화번호", "상차일", "하차일", "화물내용"];
    const mp = {}; MIRROR.forEach((k) => { if (k in clean) mp[k] = clean[k]; });
    if (Object.keys(mp).length && row?.source !== "transport_transmit") {
      (async () => {
        let mid = row?._transmittedOrderId || "";
        if (!mid) { const sn = await getDocs(query(collection(db, "orders"), where("originCol", "==", col), where("originId", "==", _id), limit(1))); mid = sn.empty ? "" : sn.docs[0].id; }
        if (mid) await updateDoc(doc(db, "orders", mid), { ...mp, updatedAt: Date.now() });
      })().catch((e) => console.error("화주사 전송사본 동기화 오류:", e));
    }
  }, [dispatchData, mBypass, mDesk.closes]);
  // 🔗 2026-11-25 정산 홈 기사 지급 = 용차지급관리와 같은 오더(지입차 제외) — 우리 회사 기사 목록
  const [mDrivers, setMDrivers] = React.useState(null);
  React.useEffect(() => {
    const co = String(companyName || "").trim() || DEFAULT_COMPANY;
    return onSnapshot(query(collection(db, "drivers"), where("companyName", "==", co)), (snap) => setMDrivers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMDrivers([]));
  }, [companyName]);
  const betaPayOnM = useBetaOn(getTenant() || companyName); // 💳 입금 확인 탭(PC와 같은 조건)
  const [deskAttachId, setDeskAttachId] = React.useState("");
  // 거래처정산 › 거래처 정보(계좌·담당자 등) 저장 — PC upsertClient와 같은 문서(회사별 문서 이름)
  const upsertClient = React.useCallback(async (client) => {
    if (isViewer || !client) return;
    const co = companyName || DEFAULT_COMPANY;
    const id = client.id || (client.거래처명 ? coDocKey(co, client.거래처명) : crypto.randomUUID());
    try { await setDoc(doc(db, COLL.clients, id), { ...client, id, companyName: client.companyName || co }, { merge: true }); }
    catch (e) { window.alert(`거래처를 저장하지 못했습니다.\n${e?.message || e}`); throw e; }
  }, [companyName, isViewer]);
  // 명함 이미지(거래명세서에 붙는 것) — PC와 같은 본인 프로필 값
  const [cardImage, setCardImage] = React.useState(null);
  const [cardImageUploading, setCardImageUploading] = React.useState(false);
  React.useEffect(() => {
    const uid = auth.currentUser?.uid; if (!uid) return;
    getDoc(doc(db, "userProfiles", uid)).then((snap) => { if (snap.exists() && snap.data().cardImageUrl) setCardImage(snap.data().cardImageUrl); }).catch(() => {});
  }, []);
  return (
    <KpSubNav code="SETTLEMENT" title="정산관리" icon="receipt" active={tab} onSelect={setTab}
      items={[{ key: "홈", label: "정산 홈", en: "OVERVIEW", icon: "dashboard" }, { key: "거래처정산", label: "거래처정산", en: "BILLING", icon: "receipt", badge: closeNM || undefined }, { key: "지급관리", label: "용차지급관리", en: "PAYOUT", icon: "wallet" }, ...(betaPayOnM ? [{ key: "입금확인", label: "입금 확인", en: "DEPOSIT", icon: "wallet" }] : []), { key: "지입정산관리", label: "지입정산관리", en: "FLEET PAY", icon: "wallet" }, { key: "지게차지급", label: "지게차 · 외부 지급", en: "FORKLIFT · EXT", icon: "wallet" }]}>
      {tab === "홈"
        ? <React.Suspense fallback={<div className="py-16 text-center text-[#9AA9C3]">불러오는 중…</div>}><SettleHome orders={dispatchData} drivers={mDrivers} company={companyName || DEFAULT_COMPANY} depositOn={betaPayOnM} onGo={(k, d) => { setTab(k === "마감검증" ? "거래처정산" : k); if (d) setTimeout(() => window.dispatchEvent(new CustomEvent("kp-settle-open", { detail: d })), 80); }} /></React.Suspense>
        : tab === "거래처정산"
        ? <ClientSettlement dispatchData={dispatchData} setDispatchData={() => {}} userCompany={companyName} clients={clients}
            setClients={(next) => (next || []).forEach(upsertClient)} upsertClient={upsertClient} showAlert={(m) => window.alert(m)}
            patchDispatch={isViewer ? async () => {} : patchDispatch} cardImage={cardImage} setCardImage={setCardImage}
            cardImageUploading={cardImageUploading} setCardImageUploading={setCardImageUploading} isViewer={isViewer} />
        : tab === "지급관리"
        ? <PaymentManagement mobile dispatchData={dispatchData} drivers={mDrivers} patchDispatch={isViewer ? async () => {} : patchDispatch} companyName={companyName} canEditPayDay={role === "admin" || role === "totalMaster"} />
        : tab === "지게차지급"
        ? <ForkliftPayouts orders={dispatchData} patchDispatch={isViewer ? async () => {} : patchDispatch} isViewer={isViewer} />
        : tab === "입금확인" && betaPayOnM
        ? <CallDepositDesk orders={dispatchData} patchDispatch={isViewer ? async () => {} : patchDispatch} isViewer={isViewer} company={companyName} onAttach={(r) => setDeskAttachId(r._id || r.id)} />
        : <FleetSettlementMenu dispatchData={dispatchData} companyName={companyName} />}
      {deskAttachId && (() => { const ar = (dispatchData || []).find((x) => (x._id || x.id) === deskAttachId); return ar ? (
        <AttachmentViewer row={ar} db={db} onClose={() => setDeskAttachId("")} isViewer={isViewer} isViewed={ar.attachViewed === true}
          onToggleViewed={() => (isViewer ? null : patchDispatch(ar._id, { attachViewed: !ar.attachViewed }))} onSaved={() => {}} />
      ) : null; })()}
    </KpSubNav>
  );
}
// 🗑 2026-11-10 기사 삭제 — 기사관리(drivers) 문서와 함께, 그 기사의 기사앱 계정(users/{uid}, role=driver)도 지운다.
//  예전엔 drivers만 지워서 기사 제출 서류·기사 앱 계정·기사 등록 관리 목록에 계속 남았다(users 기준 목록).
//  · 오더 기록(배차 데이터)은 그대로 둔다 · 계정은 역할이 기사(driver)인 것만 지운다(직원 계정은 절대 안 건드림)
async function removeDriversCascade(ids, drivers = []) {
  const res = await deleteDocsAtomic(db, ids.map((id) => doc(db, COLL.drivers, id)), { label: "기사" });
  const uids = new Set();
  ids.forEach((id) => {
    const d = (drivers || []).find((x) => x?.id === id) || {};
    [d.uid, id].forEach((u) => { if (u) uids.add(String(u)); });
  });
  for (const uid of uids) {
    try {
      const u = await getDoc(doc(db, "users", uid));
      if (u.exists() && u.data()?.role === "driver") await deleteDoc(doc(db, "users", uid));
    } catch (e) { console.warn("기사앱 계정 정리 실패:", uid, e?.code || e?.message); }
  }
  return res;
}
// 📱 2026-11-05 PC·모바일 일치 — 모바일 기사관리·거래처관리: PC 화면(DriverManagement·ClientManagement)을 그대로,
//   저장도 PC와 같은 함수(pcUpsertDriver·pcUpsertClient·upsertPlace) · 조회전용이면 PC처럼 막는다
const _mViewerBlock = async () => { window.alert("조회전용 권한으로는 수정/등록/삭제를 할 수 없습니다."); };
export function PcDriverMobile({ drivers = [], userCompany = "", role = "", isViewer = false, myName = "" }) {
  const [grade, setGrade] = React.useState("전체");
  const upsert = React.useCallback((d) => pcUpsertDriver({ drivers, role, userCompany, myRealName: myName, user: auth.currentUser }, d), [drivers, role, userCompany, myName]);
  const remove = React.useCallback(async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;
    return removeDriversCascade(ids, drivers); // ⭐ 2026-11-10 연결된 기사앱 계정까지 정리
  }, [drivers]);
  return <DriverManagement mobile drivers={drivers} upsertDriver={isViewer ? _mViewerBlock : upsert} removeDriver={isViewer ? _mViewerBlock : remove} showAlert={(m) => window.alert(m)} userCompany={userCompany} grade={grade} onGrade={setGrade} />;
}
export function PcClientMobile({ clients = [], places = [], userCompany = "", role = "", isViewer = false, initialTab = "하차지" }) {
  const upsert = React.useCallback((c) => pcUpsertClient({ role, userCompany, places }, c), [role, userCompany, places]);
  const remove = React.useCallback(async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;
    return deleteDocsAtomic(db, ids.map((id) => doc(db, COLL.clients, id)), { label: "거래처" });
  }, []);
  return <ClientManagement mobile key={initialTab} clients={clients} upsertClient={isViewer ? _mViewerBlock : upsert} removeClient={isViewer ? _mViewerBlock : remove} upsertPlace={isViewer ? _mViewerBlock : upsertPlace}
    places={places} showAlert={(m) => window.alert(m)} initialTab={initialTab} hideTabs userCompany={userCompany} />;
}
// 📊 경리 › 회계관리 — 회계 개요(시각화) · 회계 장부(미수·지급·부가세·원가) · 퇴직 정산
function AccountingWorkspace({ company, fixedRows = [], clients = [], drivers = [], isViewer = false, role = "" }) {
  const [tab, setTab] = React.useState("overview");
  const yearRows = useYearOrders(company, fixedRows);
  // ⭐ 2026-11-06 직원 급여 계산(급여관리 권한 — payrollAccess.js)
  const payAcc = usePayrollAccess(company, auth.currentUser?.uid || "preview", role, auth.currentUser?.email || "");
  // ⭐ 2026-11-09 급여 계산 바로 열기 — 급여 화면 묶음과 잠금 상태를 미리 받아 둔다(화면이 한가할 때)
  React.useEffect(() => {
    if (!payAcc.canView || !company) return undefined;
    const go = () => { import("./Payroll").then((m) => m.prefetchPayroll?.(company)).catch(() => {}); };
    const id = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300);
    return () => { if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id); else clearTimeout(id); };
  }, [payAcc.canView, company]);
  return (
    <KpSubNav code="ACCOUNTING" title="회계관리" icon="money" active={tab} onSelect={setTab} actions={[{ key: "manual", label: "회계 매뉴얼", icon: "doc", onClick: () => window.dispatchEvent(new CustomEvent("kp-open-manual", { detail: { menu: "회계관리", section: tab } })) }, { key: "glossary", label: "회계용어", icon: "doc", onClick: () => window.dispatchEvent(new CustomEvent("kp-open-glossary")) }]}
      items={[{ key: "overview", label: "회계 개요", en: "OVERVIEW", icon: "chart" }, { key: "book", label: "회계 장부", en: "LEDGER", icon: "sheet" }, ...(payAcc.canView ? [{ key: "payroll", label: "급여 계산", en: "PAYROLL", icon: "money" }] : []), { key: "retire", label: "퇴직 정산", en: "RETIREMENT", icon: "user" }]}>
      {tab === "payroll" && payAcc.canView && <React.Suspense fallback={<div className="py-24 text-center text-[14px] font-bold text-[#9AA9C3]">급여 화면 불러오는 중…</div>}><PayrollCenterLazy company={company} role={role} /></React.Suspense>}
      {tab === "overview" && <AccountingOverview company={company} orders={yearRows} drivers={drivers} />}
      {tab === "book" && (yearRows ? <AcctLedgerBooks dispatchData={yearRows} fixedRows={[]} clients={clients} drivers={drivers} isViewer={isViewer} /> : <div className="py-24 text-center text-[14px] font-bold text-[#9AA9C3]">올해 운행 내역을 불러오는 중…</div>)}
      {tab === "retire" && <RetireDesk company={company} isViewer={isViewer} />}
    </KpSubNav>
  );
}
export { AccountingWorkspace as PcAccounting, HRManagementPage as PcHrPage };
