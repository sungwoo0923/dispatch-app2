// ======================= src/dispatch/DispatchStatus.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { isViewerNow } from "../blind";
import { kpConfirm } from "../kpDialog";
import { editLossReason, lossReasonOf } from "../lossReason";
import { runUpload, runBulkTask } from "../DeleteProgress";
import BulkUploadChooser from "../BulkUploadChooser";
import ToolMenuButton from "../toolMenu";
import { buildDriverCopyText } from "../driverCopyText";
import { openCopyTemplateEditor } from "../CopyTemplateEditor";
import { imeFocusRef } from "../imeFocus";
import { mgrName } from "../mgrPlaceholder";
import { restAckKey } from "../holidayConfirm";
import React, { useState } from "react";
import { VehicleTypePicker, withCustomVehicleTypes } from "../vehicleTypes";
import { getTenant, withCo } from "../fsTenant";
import { createPortal } from "react-dom";
import { sendText } from "../smsSend";
import { useDriverEditChoice } from "../DriverEditChoice";
import { saveWorkbook, kstFileDate } from "../xlsxSave";
import OrderLookupModal from "../OrderLookup";
import MgrBadge from "../MgrBadge";
import { urgentRowStyle, isUrgentOrder, UrgentBadge } from "../urgentOrder";
import BulkEditCopyModal from "../BulkEditCopy";
import { placeSearch } from "../placeSearch";
import { isLockedOrder } from "../../functions/routeOwnerCore.mjs";
import { askCarryMonth } from "../carryMonth";
import { buildSimpleList } from "../copySimple";
import { getSimpleTpl } from "../copyTemplates";
import OrderStaffFields from "../OrderStaffFields";
import { dispatchStatusOf, payTypeStatusPatch } from "../dispatchStatus";
import { makeClientMatcher } from "../clientMatch";
import DetailFilterButton, { applyDetailFilter, detailGroupOrder } from "../DetailFilter";
import { useCompanyBiz, bizOf, BizLegend, bizStripeProps, bizColorOf, BizSelect, rememberBiz } from "../companyBiz";
import CustomDatePicker from "../CustomDatePicker";
import { FixedRouteEditNotice } from "../FixedRoutes";
import { fixedLookOf, useRouteEditGuard, ROUTE_LOCK_MSG, routeOwnerName, fixedHeaderOf, FixedOwnerCell, FixedRouteCells, FixedRouteContextMenu, staffNamesOf } from "../FixedRouteStatus";
import { carrierOf } from "../routeCarriers";
import { DriverAckChip } from "../driverEvents";
import { EditableText } from "../EditMode";
import { openDailyWorkReport, copyAccountSettleImage, copyBizImage, NewClientModal, PlaceConflictPopup, FareNoHistoryConfirm, AddrFareSearchModal, FareResultModal, ImageCopyButtons, SamePlateConflictPopup, CtxFareResultModal } from "../sharedDispatchUi";
import { useCompanyDropdownOptions } from "../companyDropdownOptions";
import { CompanyOptionPicker } from "../companyOptionPicker";
import { useNotificationsEnabled } from "../notificationSettings";
import { CustomSelect } from "../CustomSelect";
import { useFleetLivePublish, FleetLiveButton, LiveDriverChip } from "../liveFleet";
import { useLoadOrderRange, useLoadFullOrderHistory } from "../orderHistory";
import { ROTATION_MAX, bulkRotationOf, expandBulkRotation, RotationBadge, withRotationMemo, RotationPicker } from "../rotation";
import { onSnapshot, collection, serverTimestamp, doc, query, where } from "firebase/firestore";
import { updateDoc } from "../orderWrite";
import { DEFAULT_COMPANY, db, auth } from "../firebase";
import { OrderTimeline } from "../OrderTimeline";
import { useDetailGetters, orderStaffNameRaw as _orderStaffNameRaw, ORDER_MGR_EMPTY } from "../detailGetters";
import { fareChangeText } from "../payCore";
import { useArDesk } from "../SettleDesk";
import { CloseReportModal } from "../AutomationPanels";
import { useFareRules, findFareRule, applyFareRule, fareFormChange, FareTypeSelect, FareRuleHint, FarePctInput } from "../fareRules";
import { fkNum, orderProfit, paidOut, hasSpecial, forkliftExcelCols, profitTotals, ForkliftMark, SpecialFareButton, forkliftApply } from "../forklift";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { usePageSize, PageSizeChip } from "../pageSizePref";
import { RouteGroupField } from "../routeGroups";
import { MarginPct, profitCls } from "../marginPct";
import { useDriverSuggest, PlateSuggestCtx, PlateSuggestCaret, AssignConfirm } from "../SmartDispatchUI";
import { useBetaOn, DispatchWayPicker, PayBadge, PayPopup } from "../CallPay";
import { AddressCell, AttachStatusPanel, AttachmentViewer, BulkDateShiftModal, BulkEditModal, CargoExtraChips, ContactPickerIconButton, CopyPanelExtras, CpField, CpMemoNoteCards, CustomAlert, DriverNamePhoneEdit, FareCertModal, FareSortDropdown, HoverInfoTrigger, IGNORE_HISTORY_FIELDS, KpDeleteConfirm, KpSelectModeBar, LiveLocationPopup, MemoIconCell, NewDriverModal, NoteIconCell, OptimalMatchModal, OrderInfoModal, OrderMemoIconButton, OrderMemoModal, PalletSlipModal, REVERSED_DATE_ORDER_MSG, RoundTripBadge, SHEET_DIFF_STYLE, ScheduleChartModal, StickyHScrollbar, StopBadge, TimeAmPmPicker, TimeBasisToggle, VEHICLE_TYPES, WaypointSection, WorkDatesEditModal, _creatorLabel, _fmtKst, _hasRealDriverNotice, _lunchNameKey, _parseWaypointList, _parseWorkDates, acknowledgeShipperEditPC, approveCancelRequestPC, buildLunchByName, cpInputStyle, defaultDriverNoticeTemplate, displayRegDate, dokchaOn, dropFollowsPickup, fareCargoExact, fareCargoPartial, fetchCompanyPrintInfo, fetchPrinterInfo, fmtDispatchTime, getEditRequestDiff, getFareMatchLabel, getRecentHistoryDiff, getRouteStops, getTotalPalletFromOrder, getTotalTonFromOrder, isRecentShipperEdit, isReversedDateOrder, issueUploadUrl, loadXLSX, makeOrderSortValue, makePlaceKey, mergeViaCargoText, mergeViaTonnage, nameKeyOf, nextManagerName, orderMgrName, rejectCancelRequestPC, sflowToast, sheetWayDiff, sheetWayTitle, shouldShowDriverMemoAlert, sortFareHistory, submitCopyOrderPC, submitCopyOrdersPC, toTonUnit, uniqueContactsOf, upsertPlace, useCopyPanelOrig, useKpLongPressSelect, useOrderStaffName, withPickupDate } from "./shared/dispatchCommon.jsx";

  const Field = ({ label, children }) => (
    <div className="space-y-1">
      <div className="text-[13px] font-bold text-gray-900 min-h-[20px] flex items-center flex-wrap gap-1">
        {label}
      </div>
      {children}
    </div>
  );

// 실시간배차현황(DispatchStatus)에서 쓰는 상태뱃지 — 예전에는 컴포넌트 본문 안에 함수로
// 선언되어 있어 매 렌더마다 새 함수 정체성을 가져, React가 매번 모든 행의 배지를
// 통째로 unmount+remount 했다(수정요청/취소요청 도착 시 전체 화면이 버벅이던 원인 중 하나).
// 모듈 스코프로 옮겨 정체성을 고정한다.
const RichStatusBadge = ({ s, urgent, cancelReq, editReq, onCancelClick, onEditClick }) => {
  if (cancelReq) {
    return (
      <button type="button" onClick={onCancelClick}
        title="화주사가 배차 취소를 요청했어요. 눌러서 확인해 주세요"
        className="px-3 py-1 rounded-lg text-[13px] font-bold whitespace-nowrap text-white"
        style={{
          background: "linear-gradient(135deg,#f87171,#b91c1c)",
          boxShadow: "0 2px 6px rgba(185,28,28,0.5), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.25)",
          animation: "statusUrgentBlink 0.9s ease-in-out infinite",
        }}>
        취소요청
      </button>
    );
  }
  if (editReq) {
    return (
      <button type="button" onClick={onEditClick}
        title="화주사가 수정을 요청했어요. 눌러서 승인하거나 거절해 주세요"
        className="px-3 py-1 rounded-lg text-[13px] font-bold whitespace-nowrap text-white"
        style={{
          background: "linear-gradient(135deg,#3b5998,#0f2151)",
          boxShadow: "0 2px 6px rgba(15,33,81,0.5), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 3px rgba(0,0,0,0.3)",
          animation: "statusUrgentBlink 0.9s ease-in-out infinite",
        }}>
        수정
      </button>
    );
  }
  const color =
    urgent && s !== "배차완료"
      ? "bg-red-500 text-white"
      : s === "배차완료"
      ? "bg-[#1B2B4B] text-white"
      : s === "배차중"
      ? "bg-amber-500 text-white"
      : s === "배차취소"
      ? "bg-red-600 text-white"
      : s === "승인대기"
      ? "bg-white text-[#1B2B4B] ring-1 ring-[#9FB3D9]"
      : "hidden";
  return (
    <span className={`px-3 py-1 rounded-lg text-[13px] font-bold whitespace-nowrap ${color}`}>
      {s}
    </span>
  );
};
/* ===================== 메모 더보기 컴포넌트 ===================== */
// 🏷 2026-11-27 배차완료 뒤 운임이 바뀐 오더 — 금액 옆 작은 '변경' 표시(마우스를 올리면 누가 · 언제 · 전 → 후). 전체 기록은 [변경 이력]
function FareChangeMark({ row, k }) {
  const m = row?.운임변경;
  const s = k === "청구운임" ? "청구" : "기사";
  if (!m || typeof m !== "object" || !Array.isArray(m[s])) return null;
  const t = new Date(Number(m.at || 0) + 9 * 3600e3);
  const when = m.at ? `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}` : "";
  const who = String(m.by || "").split("@")[0];
  return (
    <span data-kp="fare-change" title={`배차완료 뒤 운임 변경${when ? ` · ${when}` : ""}${who ? ` · ${who}` : ""}\n${fareChangeText(m)}`}
      className="ml-1 inline-block align-middle px-1 rounded bg-[#FFF4E0] border border-[#F2C98A] text-[#8A5A00] text-[10px] font-black leading-[14px]">운임 변경</span>
  );
}
export default function DispatchStatus({
  role,
  userCompany = "",
  dispatchData = [],
  focusOrderId,
  clearFocusOrder,
  setDispatchData,
  drivers = [],
  clients = [],
  places = [],
  placeRows = [],
  timeOptions = [],
  tonOptions = [], // ⭐ 2026-11-09 일괄수정 톤수 목록
  addDispatch,
  patchDispatch,
  removeDispatch,
  approveEditRequest,
  rejectEditRequest,
  markEditRequestSeen = () => {},
  upsertDriver,
  upsertClient,
  isViewer = false,
  setCargoAddPopup = () => {},
  approvedShippers = [],
  // ⭐ 등록자 표시용(users/{uid}.name) 맵 — DispatchApp에서 한 번만 구독해 내려주는
  // 값이다(예전엔 이 컴포넌트가 users 컬렉션을 직접 통째로 구독해 RealtimeStatus와
  // 중복으로 읽어들였다).
  userNameMap = new Map(),
  // ⭐ 2026-11-03 배차현황 › 고정노선현황 — 배차표 양식이 오면 표의 열만 그 양식(구글시트) 순서로(버튼·합계·필터는 그대로)
  fixedForm = null,
  fixedActions = null, // ⭐ 2026-11-06 고정노선현황 오른쪽 클릭 메뉴(오더 추가·시트 열기·지금 맞추기)
}) {
  // 🗓 2026-11-27 마감월 일괄 지정 — 최종마감(잠금)된 달 오더는 빼고 바꾼다(경리 · 통합관리자는 그대로)
  const carryDesk = useArDesk((getTenant() || userCompany || DEFAULT_COMPANY || "").trim());
  const carryBypass = role === "totalMaster" || ["hrAcct", "allMgr", "acct", "accounting"].includes(role);
  // 🚚 2026-11-23 차량번호 칸 추천 기사 ▾(미배차현황 추천 기사와 같은 목록) — 고르면 배정 확인 창 → 배정
  const plateSuggestPick = useDriverSuggest(dispatchData, userCompany);
  const [plateAssignAsk, setPlateAssignAsk] = React.useState(null);
  const [plateAssignBusy, setPlateAssignBusy] = React.useState(false);
  const plateSuggestCtx = React.useMemo(() => ({ pick: plateSuggestPick, drivers, disabled: !!isViewer, onAssign: (o, d) => setPlateAssignAsk({ order: o, driver: d }) }), [plateSuggestPick, drivers, isViewer]);
  const doPlateAssign = async () => {
    if (!plateAssignAsk || plateAssignBusy) return;
    const { order: o, driver: d } = plateAssignAsk;
    setPlateAssignBusy(true);
    // 🛠 2026-11-23 배정 직후 이 줄의 "입력 중인 값"(edited)을 지운다 — 예전엔 차량번호 칸에 입력하다 만 값(빈 칸 등)이 남아
    //  저장은 됐는데 화면에는 차량번호 · 기사명 · 전화번호가 빈 칸으로 보였다(직접 입력 → 확인 창 배정과 같게)
    const assigned = { 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호 || ""), 배차상태: "배차완료", updatedAt: Date.now() };
    try {
      setEdited((prev) => { if (!prev[o._id]) return prev; const next = { ...prev }; delete next[o._id]; return next; });
      const ok = await patchDispatch(o._id, { ...assigned }, o); // 화면 줄(o)을 그대로 넘겨 컬렉션(orders · dispatch)을 정확히
      if (ok !== false) window.__sflowShowToast?.(`${d.이름} 기사 배정 완료`);
    } catch (e) { console.error(e); window.__sflowShowToast?.("배정 중 오류가 발생했습니다.", "err"); }
    setPlateAssignBusy(false); setPlateAssignAsk(null);
  };
useFleetLivePublish(drivers); // ⭐ 2026-11-05 실시간 관제 색인(같은 배열이면 아무것도 안 함)
// ⭐ 2026-11-02 운임규칙 — 오더 복사·수정 패널 / 수정 창 / 운임구분 열(규칙 사용 회사만)
const fareR = useFareRules(getTenant() || userCompany);
const fareOn = fareR.on;
// 💳 2026-11-11 정산 칸(계산서 · 지급 · 입금) — 시험 기능이 켜진 운송사만(고정노선현황 표는 제외)
const payOn = useBetaOn(getTenant() || userCompany) && !fixedForm;
const [payPopId, setPayPopId] = React.useState("");
const cpCargoTypeOptions = useCompanyDropdownOptions("화물타입", role, userCompany); // 오더복사 수정 창 단위(회사별 설정)
const cpTonTypeOptions = useCompanyDropdownOptions("톤수타입", role, userCompany);
const dsTableWrapRef = React.useRef(null);
const [companyBankData, setCompanyBankData] = React.useState(null);
React.useEffect(() => {
  const cname = userCompany || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "";
  if (!cname) return;
  const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const found = docs.find(d => (d.companyName || "").trim() === cname.trim() && d.type === "신규") ||
                  docs.find(d => (d.companyName || "").trim() === cname.trim());
    setCompanyBankData(found || null);
  });
  return () => unsub();
}, [userCompany]);
const mergedClients = React.useMemo(() => {
  const map = new Map();
  // 이름만으로 키를 잡으면 주소가 다른 기본거래처/하차지거래처가 있을 때 하나가
  // 다른 하나를 가려버린다 — 이름+주소 조합으로 키를 잡아 둘 다 살아남게 한다.
  const mkKey = (n, a) => `${(n||"").toLowerCase().replace(/\s+/g,"")}|${(a||"").toLowerCase().replace(/\s+/g,"")}`;
  // ⚠️ 기본거래처를 먼저 넣어 우선시킨다 — savePlaceSmart가 이름이 일치하는 기본거래처가
  // 있으면 항상 그쪽에 담당자를 누적 저장하므로(하차지거래처 사본은 새로 안 만듦),
  // 같은 이름+주소로 하차지거래처에도 예전 중복 문서가 남아있는 경우 그 오래된(담당자가
  // 갱신되지 않은) 하차지거래처 쪽이 여기서 이겨버리면 방금 저장한 담당자 목록이 아니라
  // 옛 담당자만 계속 자동입력되고 선택 팝업도 뜨지 않는다.
  (clients || []).forEach(c => {
    const name = c.업체명 || c.거래처명 || "";
    if (!name.trim()) return;
    const k = mkKey(name, c.주소);
    map.set(k, { id: c.id, 업체명: name, 주소: c.주소 || "", 담당자: c.담당자 || "", 담당자번호: c.연락처 || c.담당자번호 || "", 메모: c.메모 || "", 오더메모: c.오더메모 || "", 기사전달주의사항: c.기사전달주의사항 || "", 등급: c.등급 || "일반", 팝업표시: c.팝업표시 !== undefined ? c.팝업표시 : true, contacts: Array.isArray(c.contacts) ? c.contacts : undefined });
  });
  // 기본거래처와 이름이 같은 하차지거래처는 이제 서로 동기화되므로(주소가 우연히
  // 다르게 남아있어도) 자동완성 드롭다운에 기본거래처 항목 하나만 뜨도록 건너뛴다.
  const clientNameSet = new Set((clients || []).map(c => (c.업체명 || c.거래처명 || "").toLowerCase().replace(/\s+/g, "")).filter(Boolean));
  // ⭐ 2026-11-03 같은 이름의 하차지가 여러 곳이면(주소만 다름) 모두 보여준다 — 기본거래처와 1:1 사본 1곳일 때만 건너뜀
  const placeNameCnt = {}; (placeRows || []).forEach(p => { const k = (p.업체명 || "").toLowerCase().replace(/\s+/g, ""); if (k) placeNameCnt[k] = (placeNameCnt[k] || 0) + 1; });
  (placeRows || []).forEach(p => {
    const nameKey = (p.업체명 || "").toLowerCase().replace(/\s+/g, "");
    if (!nameKey || (clientNameSet.has(nameKey) && placeNameCnt[nameKey] < 2)) return;
    const k = mkKey(p.업체명, p.주소);
    if (!map.has(k)) map.set(k, p);
  });
  return Array.from(map.values());
}, [placeRows, clients]);

// 상/하차지명 옆 점심시간 표시 + 상/하차시간 겹침 경고용 조회 맵
const lunchByName = React.useMemo(() => buildLunchByName(clients, placeRows), [clients, placeRows]);

// ⭐ 등록자 표시용(users/{uid}.name) userNameMap은 이제 DispatchApp에서 한 번만
// 구독해 props로 내려받는다(중복 users 컬렉션 구독 제거 — 읽기 절감).

// ⭐ 배차확정일시 소급 보정 — "배차한시간이 항상 -로 보인다"는 신고의 원인은,
// 이 필드를 등록/배차 즉시 남기도록 고치기 전까지는 아예 기록되지 않았기
// 때문이다. 이미 배차완료 상태인데 이 필드가 없는 오더를 화면에서 발견하면,
// 같은 목적으로 이미 쓰이던 배차완료일시(없으면 지금 시각)로 한 번만 채워
// 넣어 자동으로 복구한다(세션당 같은 오더는 1회만 시도, 한 번에 과도하게
// 쓰지 않도록 상한을 둔다).
const backfilledConfirmRef = React.useRef(new Set());
// ⭐ 오류 수정: 이 화면엔 toMs가 없어 소급 보정 타이머가 매번 오류로 멈췄다
const toMs = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
  if (v instanceof Date) return v.getTime();
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
};
const backfillDispatchDataRef = React.useRef(dispatchData);
React.useEffect(() => { backfillDispatchDataRef.current = dispatchData; }, [dispatchData]);
React.useEffect(() => {
  // ⚠️ 예전엔 dispatchData가 바뀔 때마다(심지어 5초 간격 반복으로 바꿔봐도) 계속
  // patchDispatch를 실행해 dispatchData를 또 갱신하고, 그게 화면 전체를 다시
  // 그리게 만들어(검색창 타이핑, 수정창 입력 중에도 배경에서 주기적으로 전체
  // 테이블이 재계산되며) 체감 끊김의 원인이 됐다 — 과거 데이터가 많은 회사일수록
  // 소급 보정 대상이 많아 이 배경 재계산이 한참 동안 반복됐다.
  // → 이제는 화면 진입 10초 후 딱 한 번, 아주 소량(5건)만 조용히 고쳐두고
  // 완전히 끝낸다(반복 타이머 없음). 표시용 툴팁 필드일 뿐이라 남은 레거시
  // 오더는 이후 세션에서 나눠서 천천히 채워져도 문제 없다.
  const timer = setTimeout(() => {
    // ⚠️ stripUndefinedDeep이 serverTimestamp()를 손상시키던 예전 버그(수정됨) 탓에
    // 일부 레거시 오더는 배차확정일시 필드 자체는 "있지만"({_methodName: "serverTimestamp"}
    // 같은 의미 없는 값) 실제 시각을 뽑아낼 수 없다 — !r.배차확정일시만으로는 이런 값이
    // "있는 값"으로 취급돼 건너뛰어지므로, toMs()로 실제 파싱 가능 여부까지 함께 본다.
    const candidates = (backfillDispatchDataRef.current || []).filter(r =>
      r?._id && r.배차상태 === "배차완료" && toMs(r.배차확정일시) === 0 && !backfilledConfirmRef.current.has(r._id)
    ).slice(0, 5);
    candidates.forEach(r => {
      backfilledConfirmRef.current.add(r._id);
      patchDispatch(r._id, { 배차확정일시: r.배차완료일시 || serverTimestamp(), __system: true }).catch(() => {});
    });
  }, 10000);
  return () => clearTimeout(timer);
}, []);

// ===================== 하차지거래처 스마트 저장 (3파트와 동일 로직) =====================
// 선택수정/오더복사 수정패널에서 상/하차지 주소를 바꿔 저장할 때, 같은 업체명의
// 기존 거래처와 주소가 다르면 그냥 덮어쓰지 않고 "새 주소로 업데이트 / 기존 주소
// 유지(별도 저장)"를 사용자에게 먼저 물어본다 (3파트 배차관리와 동일한 UX).
const [placeConflictQueue, setPlaceConflictQueue] = React.useState([]);
const [placeConflictOpen, setPlaceConflictOpen] = React.useState(false);
const dsNormalizeKey = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");
const dsNormalizeAddr = (a = "") => String(a).trim().replace(/\s+/g, "").replace(/[-./]/g, "").toLowerCase();
const savePlaceSmart = async (name, addr, manager, phone, placeId, _conflictResolution, extraFields) => {
  if (!name) return;

  if (_conflictResolution === "keep_new") {
    const uniqueKey = makePlaceKey(name) + "_" + Date.now().toString(36);
    const contacts = manager?.trim() ? [{ name: manager.trim(), phone: phone?.trim() || "", isPrimary: true }] : [];
    await upsertPlace({ _id: uniqueKey, 업체명: name, 주소: addr || "", contacts, _forceNew: true }).catch(() => {});
    return;
  }

  // 기본거래처(clients)에 이미 있는 업체명이면 하차지거래처 사본을 만들지 않고
  // 기본거래처를 갱신한다 (placeId가 명시적으로 있으면 실제 하차지거래처 문서를
  // 직접 다루는 의도이므로 그대로 진행).
  if (!placeId) {
    const clientMatch = (clients || []).find(c => dsNormalizeKey(c.업체명 || c.거래처명) === dsNormalizeKey(name));
    if (clientMatch) {
      // 하차지거래처와 동일하게, 기존 주소와 다르면 덮어쓸지/별도 저장할지 먼저 물어본다.
      if (addr?.trim() && clientMatch.주소?.trim() &&
          dsNormalizeAddr(clientMatch.주소) !== dsNormalizeAddr(addr) &&
          _conflictResolution !== "update" && _conflictResolution !== "keep") {
        setPlaceConflictQueue(q => [...q, {
          type: "addrMismatch",
          name, addr, manager, phone, placeId,
          existingAddr: clientMatch.주소,
          existingId: clientMatch.id,
        }]);
        setPlaceConflictOpen(true);
        return;
      }

      let cContacts = Array.isArray(clientMatch.contacts) ? [...clientMatch.contacts]
        : (clientMatch.담당자 ? [{ name: clientMatch.담당자, phone: clientMatch.연락처 || "", isPrimary: true }] : []);
      const cManager = manager?.trim() || "";
      const cPhone = phone?.trim() || "";
      if (cManager) {
        const idx = cContacts.findIndex(c => c.name?.trim() === cManager);
        if (idx >= 0) cContacts = cContacts.map((c, i) => ({ ...c, phone: i === idx ? (cPhone || c.phone) : c.phone, isPrimary: i === idx }));
        else { cContacts = cContacts.map(c => ({ ...c, isPrimary: false })); cContacts.push({ name: cManager, phone: cPhone, isPrimary: true }); }
      } else if (cPhone) {
        const samePhoneIdx = cContacts.findIndex(c => c.phone?.replace(/\D/g, "") === cPhone.replace(/\D/g, "") && c.phone);
        if (samePhoneIdx >= 0) {
          cContacts = cContacts.map((c, i) => ({ ...c, isPrimary: i === samePhoneIdx }));
        } else {
          const autoName = nextManagerName(cContacts);
          cContacts = cContacts.map(c => ({ ...c, isPrimary: false }));
          cContacts.push({ name: autoName, phone: cPhone, isPrimary: true });
        }
      }
      const cPrimary = cContacts.find(c => c.isPrimary) || cContacts[0];
      const cFinalAddr = _conflictResolution === "keep" ? (clientMatch.주소 || addr || "") : (addr || clientMatch.주소 || "");
      await upsertClient?.({
        id: clientMatch.id,
        거래처명: clientMatch.거래처명 || name,
        주소: cFinalAddr,
        담당자: cPrimary?.name || clientMatch.담당자 || "",
        연락처: cPrimary?.phone || clientMatch.연락처 || "",
        contacts: cContacts,
        오더메모: extraFields?.오더메모 !== undefined ? extraFields.오더메모 : clientMatch.오더메모,
        팝업표시: extraFields?.팝업표시 !== undefined ? extraFields.팝업표시 : clientMatch.팝업표시,
        기사전달주의사항: extraFields?.기사전달주의사항 !== undefined ? extraFields.기사전달주의사항 : clientMatch.기사전달주의사항,
      }).catch(() => {});
      return;
    }
  }

  const key = placeId || makePlaceKey(name);
  const existingByName = mergedClients.find(p => dsNormalizeKey(p.업체명) === dsNormalizeKey(name));

  if (existingByName && addr?.trim() && existingByName.주소?.trim() &&
      dsNormalizeAddr(existingByName.주소) !== dsNormalizeAddr(addr) &&
      _conflictResolution !== "update" && _conflictResolution !== "keep") {
    setPlaceConflictQueue(q => [...q, {
      type: "addrMismatch",
      name, addr, manager, phone, placeId,
      existingAddr: existingByName.주소,
      existingId: existingByName._id,
    }]);
    setPlaceConflictOpen(true);
    return;
  }

  const existing = existingByName;
  // 이름·번호가 빈 자리표시 연락처는 버리고 시작한다(새 담당자/번호가 대표로 잡히게)
  let contacts = (existing?.contacts ? [...existing.contacts] : []).filter(c => c && (String(c.name || "").trim() || String(c.phone || "").trim()));
  const resolvedManager = manager?.trim() || "";
  const resolvedPhone = phone?.trim() || "";
  if (resolvedManager) {
    const sameNameIdx = contacts.findIndex(c => c.name?.trim() === resolvedManager);
    if (sameNameIdx >= 0) {
      contacts = contacts.map((c, i) => ({ ...c, phone: i === sameNameIdx ? (resolvedPhone || c.phone) : c.phone, isPrimary: i === sameNameIdx }));
    } else {
      contacts = contacts.map(c => ({ ...c, isPrimary: false }));
      contacts.push({ name: resolvedManager, phone: resolvedPhone, isPrimary: true });
    }
  } else if (resolvedPhone) {
    const samePhoneIdx = contacts.findIndex(c => c.phone?.replace(/\D/g, "") === resolvedPhone.replace(/\D/g, "") && c.phone);
    if (samePhoneIdx >= 0) {
      contacts = contacts.map((c, i) => ({ ...c, isPrimary: i === samePhoneIdx }));
    } else {
      const autoName = nextManagerName(contacts);
      contacts = contacts.map(c => ({ ...c, isPrimary: false }));
      contacts.push({ name: autoName, phone: resolvedPhone, isPrimary: true });
    }
  }

  const finalAddr = _conflictResolution === "keep" ? (existing?.주소 || addr || "") : (addr || existing?.주소 || "");

  await upsertPlace({
    _id: existing?._id || key,
    업체명: name,
    주소: finalAddr,
    contacts,
    등급: extraFields?.등급 || existing?.등급 || "일반",
    메모: extraFields?.메모 || existing?.메모 || "",
    오더메모: extraFields?.오더메모 !== undefined ? extraFields.오더메모 : existing?.오더메모,
    팝업표시: extraFields?.팝업표시 !== undefined ? extraFields.팝업표시 : existing?.팝업표시,
    기사전달주의사항: extraFields?.기사전달주의사항 !== undefined ? extraFields.기사전달주의사항 : existing?.기사전달주의사항,
  }).catch(() => {});
};

const renderTimeText = (time, cond) => {
  
  if (!time) return "-";

  // 🔥 시간 문자열 자체에 포함된 경우
  if (String(time).includes("이전")) return time;
  if (String(time).includes("이후")) return time;

  if (cond === "BEFORE") return `${time} 이전`;
  if (cond === "AFTER") return `${time} 이후`;

  return time;
};
  // ==========================
  // 🔥 거래처 자동완성 전체 풀 (clients + dispatchData)
  // ==========================
  const allClientPool = React.useMemo(() => {
    const map = new Map();

    // 거래처 관리
    (clients || []).forEach((c) => {
      const name =
        c.거래처명 || c.name || c.회사명 || c.상호 || c.title || "";
      if (!name) return;

      map.set(name, {
        거래처명: name,
        주소: c.주소 || "",
        담당자: c.담당자 || "",
        연락처: c.연락처 || "",
      });
    });

    // 기존 배차 데이터에서 보강
    (dispatchData || []).forEach((r) => {
      const name = r.거래처명;
      if (!name || map.has(name)) return;

      map.set(name, {
        거래처명: name,
        주소: r.상차지주소 || r.하차지주소 || "",
        담당자: "",
        연락처: "",
      });
    });

    return Array.from(map.values());
}, [clients, placeRows, dispatchData]);

  // 📌 오늘 날짜 정확하게 (KST 기준)
  const todayKST = () => {
    const d = new Date();
    const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return korea.toISOString().slice(0, 10);
  };

  // 📌 이번 달 1일 ~ 말일 (KST 기준, UTC 밀림 방지)
  const getMonthRange = () => {
    const now = new Date();

    // KST 기준 날짜 생성
    const firstKST = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      9, 0, 0
    );

    const lastKST = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      9, 0, 0
    );

    const toYMD = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    return {
      first: toYMD(firstKST),
      last: toYMD(lastKST),
    };
  };

  // 📌 내일 날짜 (KST 기준)
  const tomorrowKST = () => {
    const d = new Date();
    const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    korea.setDate(korea.getDate() + 1);
    return korea.toISOString().slice(0, 10);
  };
const [alertMsg, setAlertMsg] = React.useState(null);
const [attachViewer, setAttachViewer] = React.useState(null);
const [liveLocViewer, setLiveLocViewer] = React.useState(null);
const [orderInfoRow5, setOrderInfoRow5] = React.useState(null);
const [workDatesEditRow, setWorkDatesEditRow] = React.useState(null); // 근무일(묶음) 수정 팝업이 열린 행
const [localOverrides, setLocalOverrides] = React.useState({});
// ⭐ 2026-11-12 "배차방식을 바꿔도 안 바뀐다"(수정 창으로 저장했던 오더만) — 수정 창 저장 뒤 화면을 바로 바꾸려고 둔 덮어쓰기(localOverrides)가
//  세션 내내 남아, 그 뒤 표에서 바꾼 배차방식 · 정산 등 새 값이 서버에는 저장돼도 화면에선 예전 값으로 가려졌다(F5 해야 보임).
//  덮어쓰기는 서버 값이 돌아올 때까지만 — 실시간 데이터가 새로 오면 2초 넘은 덮어쓰기는 지운다.
const ovAtRef = React.useRef({});
React.useEffect(() => {
  const now = Date.now(); const at = ovAtRef.current;
  Object.keys(localOverrides).forEach((id) => { if (!at[id]) at[id] = now; });
  Object.keys(at).forEach((id) => { if (!localOverrides[id]) delete at[id]; });
  if (!Object.keys(localOverrides).length) return undefined;
  // 실시간 데이터가 안 와도 4초 뒤에는 서버 값(이미 반영된 화면 데이터)을 보이게
  const t = setTimeout(() => {
    const n2 = Date.now(); const stale = Object.keys(at).filter((id) => n2 - at[id] > 3500);
    if (stale.length) setLocalOverrides((prev) => { const n = { ...prev }; stale.forEach((id) => { delete n[id]; delete at[id]; }); return n; });
  }, 4000);
  return () => clearTimeout(t);
}, [localOverrides]);
React.useEffect(() => {
  const now = Date.now(); const at = ovAtRef.current;
  const stale = Object.keys(at).filter((id) => now - at[id] > 2000);
  if (stale.length) setLocalOverrides((prev) => { const n = { ...prev }; stale.forEach((id) => { delete n[id]; delete at[id]; }); return n; });
}, [dispatchData]); // eslint-disable-line react-hooks/exhaustive-deps
const showAlert = (msg) => setAlertMsg(msg);
const [newClientModalOpen, setNewClientModalOpen] = React.useState(false);
const [newClientModalData, setNewClientModalData] = React.useState({ name: "", addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" });
const openNewClientModal = (name) => { setNewClientModalData({ name: (name || "").trim(), addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" }); setNewClientModalOpen(true); };
const [blackAlert, setBlackAlert] = React.useState(null);
const [memoAlert, setMemoAlert] = React.useState(null);
const notificationsEnabled = useNotificationsEnabled();
React.useEffect(() => {
  const handler = (e) => setBlackAlert(e.detail);
  window.addEventListener("blackDriverDetected", handler);
  return () => window.removeEventListener("blackDriverDetected", handler);
}, []);
React.useEffect(() => {
  const handler = (e) => setMemoAlert(e.detail);
  window.addEventListener("driverMemoDetected", handler);
  return () => window.removeEventListener("driverMemoDetected", handler);
}, []);

const [warningPopup, setWarningPopup] = React.useState(null);
const [dailyCloseOpen, setDailyCloseOpen] = React.useState(false);
const [closeReportOpen, setCloseReportOpen] = React.useState(false); // ★ 마감보고 전송 창
const [dailyCloseResult, setDailyCloseResult] = React.useState(null);
const [dailyCloseFilter, setDailyCloseFilter] = React.useState("all");
const [filterErrorIds, setFilterErrorIds] = React.useState(null);
const [reVerifyToast, setReVerifyToast] = React.useState(null);
const lastWarnedRef = React.useRef(null);
const checkWarningStatus = (name, type) => {
  const now = Date.now();
  if (lastWarnedRef.current?.name === name && now - lastWarnedRef.current.time < 3000) return;

  // 거래처 목록 체크
  const foundClient = (clients || []).find(c => (c.업체명 || c.거래처명) === name);
  if (foundClient && foundClient.팝업표시 !== false) {
    const status = foundClient.업체상태 || foundClient.등급;
    const note = foundClient.오더메모;
    if (status === "블랙" || status === "주의" || status === "이탈" || (note && String(note).trim())) {
      lastWarnedRef.current = { name, time: Date.now() };
      const gradeStatus = (status === "블랙" || status === "주의" || status === "이탈") ? status : null;
      setWarningPopup({ name, status: gradeStatus, type, info: { ...foundClient, 메모: note || foundClient.메모 || "" } });
      return;
    }
  }

  // places + placeRows 둘 다 체크
  const allPlaces = [...(places || []), ...(placeRows || [])];
  const foundPlace = allPlaces.find(p => (p.업체명 || p.name) === name);
  if (foundPlace && foundPlace.팝업표시 !== false) {
    const status = foundPlace.업체상태 || foundPlace.등급;
    const note = foundPlace.오더메모;
    if (status === "블랙" || status === "주의" || status === "이탈" || (note && String(note).trim())) {
      lastWarnedRef.current = { name, time: Date.now() };
      const gradeStatus = (status === "블랙" || status === "주의" || status === "이탈") ? status : null;
      setWarningPopup({ name, status: gradeStatus, type, info: { ...foundPlace, 메모: note || foundPlace.메모 || "" } });
    }
  }
};
const yesterdayKST = () => {
  const d = new Date();
  const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  korea.setDate(korea.getDate() - 1);
  return korea.toISOString().slice(0, 10);
};
const normalizePlate = (s = "") =>
  String(s).toUpperCase().replace(/\s+/g, "").replace(/[-.]/g, "");

const emitBlackIfNeeded = (driver) => {
  if (!driver) return;
  if (String(driver.등급 || "").trim() !== "블랙") return;
  window.dispatchEvent(new CustomEvent("blackDriverDetected", { detail: driver }));
};
// ===================== 일마감 검증 로직 =====================
const driverMap = React.useMemo(() => {
  const map = new Map();
  (drivers || []).forEach(d => {
    const key = normalizePlate(d.차량번호 || "");
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  });
  return map;
}, [drivers]);

const runDailyClose = () => {
  const rangeStart = appliedStartDate || todayKST();
  const rangeEnd   = appliedEndDate   || todayKST();
  const targetDate = rangeEnd; // 보고서 기준일 (역방향 비교용)
  const viewRows = (dispatchData || []).filter(r => r.상차일 >= rangeStart && r.상차일 <= rangeEnd);
  const errors = [];
  const warnings = [];

  viewRows.forEach((row, idx) => {
    const seq = idx + 1;
    // ⭐ 조회기간이 하루가 아니라 여러 날짜에 걸칠 수 있어(범위 조회), 번호만으로는
    // 어느 날짜 오더인지 알 수 없다는 피드백 — 상차일을 라벨에 항상 표시.
    const label = `${seq}번 (${row.상차일 || "-"}) [${row.거래처명 || "-"}] ${row.상차지명 || ""} → ${row.하차지명 || ""}`;

    const requiredFields = [
      { key: "차량번호", name: "차량번호" },
      { key: "이름", name: "기사명" },
      { key: "전화번호", name: "전화번호" },
      { key: "청구운임", name: "청구운임" },
      { key: "기사운임", name: "기사운임" },
      { key: "배차방식", name: "배차방식" },
      { key: "지급방식", name: "지급방식" },
    ];

    // ⭐ "이 오더 확인함" 버튼(아래 handleAckDailyCloseIssue)으로 미리 인지해둔
    // 필드는, 아직 배차완료 전까지만(=지금 상태 그대로 있는 동안만) 오류에서
    // 뺀다. 배차완료로 바뀌면 그때는 진짜 다 채워져 있어야 하므로 다시 검사한다.
    const ackFields = new Set(Array.isArray(row._dailyCloseAckFields) ? row._dailyCloseAckFields : []);
    const missing = requiredFields.filter(f => {
      const v = String(row[f.key] || "").trim();
      if (v && v !== "0") return false;
      // 지급방식이 "손실"이면 거래처에 청구하지 않는 게 정상이라 청구운임은
      // 원래부터 비어있어야 한다 — 필수값 누락 대상에서 제외.
      if (f.key === "청구운임" && row.지급방식 === "손실") return false;
      if (ackFields.has(f.key) && row.배차상태 !== "배차완료") return false;
      return true;
    });

    if (missing.length > 0) {
      errors.push({
        rowId: row._id,
        seq, label,
        type: "missing",
        msg: `필수값 누락: ${missing.map(m => m.name).join(", ")}`,
      });
    }

    const charge = Number(String(row.청구운임 || "0").replace(/[^\d-]/g, ""));
    const pay = Number(String(row.기사운임 || "0").replace(/[^\d-]/g, ""));

    if (charge > 0 && pay > 0 && charge < pay) {
      warnings.push({ rowId: row._id, seq, label, type: "margin", msg: `마진 역전 (청구 ${charge.toLocaleString()} < 기사 ${pay.toLocaleString()})` });
    }
    if (charge === 0 && row.지급방식 !== "취소" && row.지급방식 !== "손실" && row.배차상태 !== "배차취소") {
      warnings.push({ rowId: row._id, seq, label, type: "zero", msg: "청구운임이 0원입니다" });
    }
    if (pay === 0 && row.배차상태 === "배차완료") {
      warnings.push({ rowId: row._id, seq, label, type: "zero", msg: "기사운임이 0원입니다 (배차완료 상태)" });
    }
    if (charge > 5000000) {
      warnings.push({ rowId: row._id, seq, label, type: "high", msg: `청구운임 비정상적으로 높음 (${charge.toLocaleString()}원)` });
    }

    const plate = normalizePlate(row.차량번호 || "");
    if (plate) {
      const dbMatches = driverMap.get(plate) || [];
      if (dbMatches.length > 0) {
        const rowName = String(row.이름 || "").trim();
        const rowPhone = String(row.전화번호 ?? "").replace(/[^\d]/g, "");
        const exactMatch = dbMatches.find(d => {
          const dName = String(d.이름 || "").trim();
          const dPhone = String(d.전화번호 ?? "").replace(/[^\d]/g, "");
          return dName === rowName && dPhone === rowPhone;
        });
        if (!exactMatch && rowName) {
          const dbNames = dbMatches.map(d => d.이름).join("/");
          warnings.push({ rowId: row._id, seq, label, type: "driver", msg: `기사정보 불일치: 입력 "${rowName}" / DB "${dbNames}"` });
        }
      }
      const phoneDigits = String(row.전화번호 ?? "").replace(/[^\d]/g, "");
      if (phoneDigits && phoneDigits.length !== 11) {
        warnings.push({ rowId: row._id, seq, label, type: "phone", msg: `전화번호 ${phoneDigits.length}자리 (정상: 11자리)` });
      }
    }
  });

  const clientMap = new Map();
  viewRows.forEach(row => {
    const name = row.거래처명 || "(미입력)";
    if (!clientMap.has(name)) clientMap.set(name, { count: 0, charge: 0, pay: 0 });
    const c = clientMap.get(name);
    c.count++;
    c.charge += Number(String(row.청구운임 || "0").replace(/[^\d-]/g, "")) || 0;
    c.pay += Number(String(row.기사운임 || "0").replace(/[^\d-]/g, "")) || 0;
  });

  const clientSummary = [...clientMap.entries()].map(([name, data]) => ({
    name, ...data, margin: data.charge - data.pay,
  }));

  const dateLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart} ~ ${rangeEnd}`;
  setDailyCloseResult({
    date: dateLabel,
    dateEnd: targetDate,
    total: viewRows.length,
    errors, warnings,
    passed: viewRows.length - errors.length,
    clientSummary,
  });
};

React.useEffect(() => {
  if (dailyCloseOpen) runDailyClose();
}, [dailyCloseOpen]);
// ===================== 일마감 보고서 출력 =====================
const handleDailyReport = async () => {
  if (!dailyCloseResult) return;
  // ★ 보고서 상단 회사정보/하단 담당자 — 로그인한 회사의 사업자정보와 이 계정의
  // 실명/직책을 그때그때 조회해 찍는다(예전엔 특정 회사·계정 이름이 고정 박혀있었음).
  const [companyInfo, printerInfo] = await Promise.all([
    fetchCompanyPrintInfo(userCompany),
    fetchPrinterInfo(),
  ]);
  const targetDate = dailyCloseResult.dateEnd || dailyCloseResult.date;
  const rangeStart = appliedStartDate || targetDate;
  const rangeEnd   = appliedEndDate   || targetDate;
  // 보고서 모양 · 계산은 sharedDispatchUi.jsx(openDailyWorkReport) 한 곳
  openDailyWorkReport({
    targetDate,
    targetRows: (dispatchData || []).filter(r => r.상차일 >= rangeStart && r.상차일 <= rangeEnd),
    rowsOfDate: (d) => (dispatchData || []).filter(r => r.상차일 === d),
    companyInfo, printerInfo, userCompany,
    printerFallback: auth.currentUser?.email?.split("@")[0] || "",
  });
};
// ⭐ 일마감 검증 팝업의 오류/경고 목록에서 오더를 클릭했을 때 — 팝업을
// 닫고 그리드로 스크롤만 하던 것 대신, 그 오더의 상세 내용이 담긴 "선택수정"
// 팝업을 일마감 검증보다 앞에 띄우고 어떤 문제가 있는지 배너로 보여준다.
const openDailyCloseIssueDetail = (rowId) => {
  const row = (dispatchData || []).find(r => r._id === rowId);
  if (!row) { showAlert("오더 정보를 찾을 수 없습니다."); return; }
  const issues = [
    ...(dailyCloseResult?.errors || []).filter(x => x.rowId === rowId).map(x => ({ ...x, level: "오류" })),
    ...(dailyCloseResult?.warnings || []).filter(x => x.rowId === rowId).map(x => ({ ...x, level: "경고" })),
  ];
  // 아래 정규화(화물수량/화물타입/톤수값/톤수타입 분리)는 우클릭 메뉴의 "수정"
  // 버튼이 오더복사/수정 패널(copyTarget)을 열 때 하는 것과 동일하다.
  const raw = String(row?.화물내용 || "");
  const KNOWN_SUFFIXES = [...new Set(["파레트", "파렛트", "박스", "통", ...cpCargoTypeOptions])].sort((a, b) => b.length - a.length);
  let cargoNum = "", cargoType = "";
  const rawBase = raw.split("+")[0];
  for (const s of KNOWN_SUFFIXES) {
    if (rawBase.endsWith(s)) { cargoNum = rawBase.slice(0, -s.length).trim(); cargoType = s; break; }
  }
  if (!cargoType) { cargoNum = rawBase; cargoType = ""; }
  const ton = row.차량톤수 || "";
  const tonValue = ton.match(/[\d.]+/)?.[0] || "";
  const tonType = ton.includes("kg") ? "kg" : ton.includes("톤") ? "톤" : "";
  setCopyTarget({ ...row, 화물내용: raw, 화물수량: cargoNum, 화물타입: cargoType, 톤수값: tonValue, 톤수타입: tonType });
  setDailyCloseIssueCtx(issues);
  setCopyPanelOpen(true);
};
// ⭐ "일마감 검증 — 이 오더의 문제점" 배너의 "미입력 확인" 버튼 — 아직 배차 전이라
// 차량번호/운임 등이 비어있는 게 당연한 오더를, 매번 오류 목록에 뜨지 않도록
// 지금 비어있는 필드들을 "확인함"으로 표시해둔다. 배차완료로 바뀌기 전까지만
// 유효하고(runDailyClose 참고), 실제로 배차가 끝나면 다시 검사 대상이 된다.
const handleAckDailyCloseIssue = async () => {
  if (!copyTarget?._id) return;
  const requiredKeys = ["차량번호", "이름", "전화번호", "청구운임", "기사운임", "배차방식", "지급방식"];
  const missingNow = requiredKeys.filter(k => {
    const v = String(copyTarget[k] || "").trim();
    return !v || v === "0";
  });
  if (missingNow.length === 0) {
    showAlert("지금은 비어있는 필수값이 없습니다.");
    return;
  }
  try {
    const col = copyTarget.__col || "dispatch";
    await updateDoc(doc(db, col, copyTarget._id), { _dailyCloseAckFields: missingNow });
    showAlert("확인 처리했습니다. 배차완료 전까지는 일마감 오류 목록에서 빠집니다.");
    setCopyPanelOpen(false);
    setDailyCloseIssueCtx(null);
    runDailyClose();
  } catch (e) {
    showAlert("확인 처리 실패: " + (e?.message || e));
  }
};
const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [q, setQ] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dispatchStatusState") || "{}");
      return saved.q || "";
    } catch {
      return "";
    }
  });
  const [qInput, setQInput] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dispatchStatusState") || "{}");
      return saved.q || "";
    } catch {
      return "";
    }
  });
  // ⚡ 검색어 입력창 — 글자 하나 칠 때마다 이 거대한 컴포넌트(배차현황) 전체를
  // 리렌더시키지 않도록, ref로 값만 들고 있다가 Enter/조회 시점에만 읽는다
  // (실제 검색은 q에만 반응 — 타이핑 중엔 리렌더가 전혀 필요 없다).
  const qInputRef = React.useRef(null);
  const [searchType, setSearchType] = React.useState("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [appliedStartDate, setAppliedStartDate] = React.useState("");
const [appliedEndDate, setAppliedEndDate] = React.useState("");
  // ⭐ dispatchData(부모가 내려주는 실시간 데이터)는 이제 최근 13개월치만 담겨 있다
  // (Firestore 읽기 절감을 위한 변경 — DispatchApp.jsx의 liveWindowStart 참고).
  // 조회 기간이 그보다 더 과거로 잡히면(최고관리자는 3개월 제한이 없어 더 오래된
  // 데이터도 조회할 수 있다) 실시간 데이터에는 없는 구간이므로, 그 구간만 별도로
  // getDocs로 한 번 불러와 합쳐준다.
  const [extraHistoricalRows, setExtraHistoricalRows] = React.useState([]);
  const [extraHistoricalLoading, setExtraHistoricalLoading] = React.useState(false);
  // ⭐ 조회 기간이 실시간 범위(최근 7일~) 밖이면 그 기간만 공용 보관소로 불러온다(부모 dispatchData에 합쳐짐)
  // ⭐ 2026-11-06 고정노선현황은 입고일(= 상차일 + 하차일수) 기준 조회 — 상차일로 불러오므로 하차일수(+주말 여유 3일)만큼 앞에서부터 불러온다
  //   (예전엔 고른 기간의 첫날 입고분이 안 불러와져 "삼다수 검색했는데 11건만" 나오던 원인)
  const dsLoadFrom = (() => {
    const f = appliedStartDate || appliedEndDate || null;
    if (!fixedForm || !f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
    const back = Math.max(0, parseInt(fixedForm.dropOffset, 10) || 0) + 3;
    const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10);
  })();
  useLoadOrderRange(dsLoadFrom, appliedEndDate || appliedStartDate);
  // 🔽 정렬 — ⭐ "정렬/필터" 팝업은 없앴고, 표 머리글(컬럼명)을 누르면 바로 정렬된다
  // (▲오름 → ▼내림 → 해제). 이 브라우저에만 기억하고 Firestore에는 저장하지 않는다.
  const dsSort = useTableSort(fixedForm ? "fixedRouteStatus" : "dispatchStatus"); // ⭐ 고정노선현황은 따로(배차현황 정렬이 시트 순서를 섞지 않게)
  const [fareTypeFilter, setFareTypeFilter] = React.useState(""); // ⭐ 2026-11-02 운임규칙 — 운임구분 필터("" 전체 · "__none" 미지정)
  const [selected, setSelected] = React.useState(new Set());
  // 조회 날짜(기간)를 바꾸면 화면에 보이는 행이 바뀌므로, 이전 날짜에서 선택해둔
  // 체크박스가 남아있으면 안 보이는 행을 실수로 삭제/처리하는 사고로 이어질 수 있다.
  React.useEffect(() => { setSelected(new Set()); }, [appliedStartDate, appliedEndDate]);
  const [editMode, setEditMode] = React.useState(false);
  const [copyPanelOpen, setCopyPanelOpen] = React.useState(false);
const [copyTarget, setCopyTarget] = React.useState(null);
const copyOrigRef = useCopyPanelOrig(copyPanelOpen, copyTarget); // 🛠 2026-11-27 바뀐 칸만 저장
const [copyPanelWorkDatesOpen, setCopyPanelWorkDatesOpen] = React.useState(false); // 오더복사수정패널 근무일(묶음) 수정 팝업
// 오더복사수정패널 스타일 — A: 우측 슬라이드(기본), B: 화면 중앙 드래그 가능 팝업.
// 마지막 선택을 localStorage에 저장해 유지한다 (실시간배차현황/배차현황 공용).
const [copyPanelStyle, setCopyPanelStyle] = React.useState(() => {
  try { return localStorage.getItem("copyPanelStyle") === "B" ? "B" : "A"; } catch { return "A"; }
});
const toggleCopyPanelStyle = () => {
  setCopyPanelStyle(prev => {
    const next = prev === "B" ? "A" : "B";
    try { localStorage.setItem("copyPanelStyle", next); } catch {}
    return next;
  });
};
// B스타일(중앙 팝업) 드래그 위치 — 패널을 새로 열 때마다 화면 중앙으로 리셋된다.
const [copyPanelDrag, setCopyPanelDrag] = React.useState({ x: 0, y: 0 });
const copyPanelDragRef = React.useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
React.useEffect(() => { if (copyPanelOpen) setCopyPanelDrag({ x: 0, y: 0 }); }, [copyPanelOpen]);
const handleCopyPanelDragStart = (e) => {
  if (copyPanelStyle !== "B") return;
  if (e.target.closest("button, input, textarea, select, a")) return; // 버튼/입력창 클릭은 드래그로 취급하지 않음
  copyPanelDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: copyPanelDrag.x, origY: copyPanelDrag.y };
  const onMove = (ev) => {
    if (!copyPanelDragRef.current.dragging) return;
    setCopyPanelDrag({
      x: copyPanelDragRef.current.origX + (ev.clientX - copyPanelDragRef.current.startX),
      y: copyPanelDragRef.current.origY + (ev.clientY - copyPanelDragRef.current.startY),
    });
  };
  const onUp = () => {
    copyPanelDragRef.current.dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
};
const [copyDriverPick, setCopyDriverPick] = React.useState(null); // 오더복사수정패널 기사정보: 동일 차량번호 기사 여러 명일 때 선택 팝업
const [copyClientOptions, setCopyClientOptions] = React.useState([]);
const [showCopyClientDropdown, setShowCopyClientDropdown] = React.useState(false);
const [copyClientIndex, setCopyClientIndex] = React.useState(0);
const copyClientListRef5 = React.useRef(null);
React.useEffect(() => {
  const list = copyClientListRef5.current;
  if (!list) return;
  const item = list.children[copyClientIndex];
  if (!item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  if (itemTop < viewTop) list.scrollTop = itemTop;
}, [copyClientIndex]);
const [clientApplyPopup, setClientApplyPopup] = React.useState(null);
React.useEffect(() => {
  if (!copyTarget?.차량톤수) return;

  // 🔥 이미 분리된 경우 실행 금지 (핵심)
  if (copyTarget.톤수값 && copyTarget.톤수타입) return;

  const num = copyTarget.차량톤수.match(/[\d.]+/)?.[0] || "";
  const type = copyTarget.차량톤수.includes("kg") ? "kg" : "톤";

  setCopyTarget(prev => ({
    ...prev,
    톤수값: num,
    톤수타입: type,
  }));
}, [copyTarget?.차량톤수]);
const [copyPlaceOptions, setCopyPlaceOptions] = React.useState([]);
const [copyPlaceType, setCopyPlaceType] = React.useState(null); // pickup | drop
const [showCopyPlaceDropdown, setShowCopyPlaceDropdown] = React.useState(false);
const [copyActiveIndex, setCopyActiveIndex] = React.useState(0);
const copyPlaceDropdownListRef5 = React.useRef(null);
React.useEffect(() => {
  const list = copyPlaceDropdownListRef5.current;
  if (!list) return;
  const item = list.children[copyActiveIndex];
  if (!item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  if (itemTop < viewTop) list.scrollTop = itemTop;
}, [copyActiveIndex]);
const [panelContactPopup5, setPanelContactPopup5] = React.useState(null);
const [panelContactActive5, setPanelContactActive5] = React.useState(0);
const panelContactListRef5 = React.useRef(null);
const panelContactSearchInputRef5 = React.useRef(null); // 팝업 열리면 포커스가 카드 그리드(div)에 가 있어도, 타이핑 시작하면 검색창으로 넘겨준다
React.useEffect(() => {
  const list = panelContactListRef5.current;
  if (!list) return;
  const item = list.children[panelContactActive5];
  if (!item) return;
  const itemLeft = item.offsetLeft;
  const itemRight = itemLeft + item.offsetWidth;
  const viewLeft = list.scrollLeft;
  const viewRight = viewLeft + list.clientWidth;
  if (itemRight > viewRight) list.scrollLeft = itemRight - list.clientWidth;
  if (itemLeft < viewLeft) list.scrollLeft = itemLeft;
}, [panelContactActive5]);
const [panelContactSearch5, setPanelContactSearch5] = React.useState("");
React.useEffect(() => { setPanelContactSearch5(""); }, [panelContactPopup5]);

// 오더복사/수정 패널(copyTarget) 오더메모 팝업
const [panelMemoPopupC5, setPanelMemoPopupC5] = React.useState(null);
const openPanelMemoC5 = (type) => {
  const name = (type === "pickup" ? copyTarget?.상차지명 : copyTarget?.하차지명) || "";
  if (!name.trim()) { showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`); return; }
  const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  const showKey = type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
  const noticeKey = type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
  if (copyTarget[memoKey] !== undefined || copyTarget[showKey] !== undefined || copyTarget[noticeKey] !== undefined) {
    setPanelMemoPopupC5({ type, name, memo: copyTarget[memoKey] || "", popupShow: copyTarget[showKey] !== undefined ? copyTarget[showKey] : true, notice: copyTarget[noticeKey] !== undefined ? copyTarget[noticeKey] : defaultDriverNoticeTemplate(name) });
    return;
  }
  const found = mergedClients.find(c => dsNormalizeKey(c.업체명 || "") === dsNormalizeKey(name));
  setPanelMemoPopupC5({ type, name, memo: found?.오더메모 || "", popupShow: found?.팝업표시 !== undefined ? found.팝업표시 : true, notice: found?.기사전달주의사항 !== undefined ? found.기사전달주의사항 : defaultDriverNoticeTemplate(name) });
};
const savePanelMemoC5 = (memo, show, notice) => {
  if (!panelMemoPopupC5) return;
  const memoKey = panelMemoPopupC5.type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  const showKey = panelMemoPopupC5.type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
  const noticeKey = panelMemoPopupC5.type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
  setCopyTarget(p => ({ ...p, [memoKey]: memo, [showKey]: show, [noticeKey]: notice }));
  setPanelMemoPopupC5(null);
};
const hasPanelMemoC5 = (type) => {
  const name = (type === "pickup" ? copyTarget?.상차지명 : copyTarget?.하차지명) || "";
  if (!name.trim()) return false;
  const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  if (copyTarget[memoKey] !== undefined) return !!String(copyTarget[memoKey] || "").trim();
  const found = mergedClients.find(c => dsNormalizeKey(c.업체명 || "") === dsNormalizeKey(name));
  return !!String(found?.오더메모 || "").trim();
};

// 선택수정 패널(editTarget) 오더메모 팝업
const [panelMemoPopupE5, setPanelMemoPopupE5] = React.useState(null);
const openPanelMemoE5 = (type) => {
  const name = (type === "pickup" ? editTarget?.상차지명 : editTarget?.하차지명) || "";
  if (!name.trim()) { showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`); return; }
  const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  const showKey = type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
  const noticeKey = type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
  if (editTarget[memoKey] !== undefined || editTarget[showKey] !== undefined || editTarget[noticeKey] !== undefined) {
    setPanelMemoPopupE5({ type, name, memo: editTarget[memoKey] || "", popupShow: editTarget[showKey] !== undefined ? editTarget[showKey] : true, notice: editTarget[noticeKey] !== undefined ? editTarget[noticeKey] : defaultDriverNoticeTemplate(name) });
    return;
  }
  const found = mergedClients.find(c => dsNormalizeKey(c.업체명 || "") === dsNormalizeKey(name));
  setPanelMemoPopupE5({ type, name, memo: found?.오더메모 || "", popupShow: found?.팝업표시 !== undefined ? found.팝업표시 : true, notice: found?.기사전달주의사항 !== undefined ? found.기사전달주의사항 : defaultDriverNoticeTemplate(name) });
};
const savePanelMemoE5 = (memo, show, notice) => {
  if (!panelMemoPopupE5) return;
  const memoKey = panelMemoPopupE5.type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  const showKey = panelMemoPopupE5.type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
  const noticeKey = panelMemoPopupE5.type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
  setEditTarget(p => ({ ...p, [memoKey]: memo, [showKey]: show, [noticeKey]: notice }));
  setPanelMemoPopupE5(null);
};
const hasPanelMemoE5 = (type) => {
  const name = (type === "pickup" ? editTarget?.상차지명 : editTarget?.하차지명) || "";
  if (!name.trim()) return false;
  const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  if (editTarget[memoKey] !== undefined) return !!String(editTarget[memoKey] || "").trim();
  const found = mergedClients.find(c => dsNormalizeKey(c.업체명 || "") === dsNormalizeKey(name));
  return !!String(found?.오더메모 || "").trim();
};
  // 🔔 즉시 변경 확인 팝업 + 히스토리
  const [confirmChange, setConfirmChange] = React.useState(null);
  const [smsConfirm5, setSmsConfirm5] = React.useState(null);
  const [bulkUploadConfirm5, setBulkUploadConfirm5] = React.useState(null); // { phones: string[], body } — 업로드링크 다중 전송 확인
  const [optimalMatchRow5, setOptimalMatchRow5] = React.useState(null); // 최적매칭 대상 오더
  // 화주사 수정요청 승인/거절 팝업 (T161 — window.confirm 대신 프로그램 디자인에 맞춘 모달)
  const [editReqPopup, setEditReqPopup] = React.useState(null);
  const [cancelReqPopup, setCancelReqPopup] = React.useState(null);
  // T164 — 삭제 시 스르륵 사라지는 페이드아웃, 수정으로 정렬순서가 바뀔 때 칸칸이 올라오는 느낌의
  // 하이라이트. focusOrderId 하이라이트(row-highlight)는 scrollIntoView까지 같이 하기 때문에
  // 일반 편집마다 화면이 스크롤되면 오히려 거슬려서, 스크롤 없는 별도의 justMovedIds로 처리한다.
  const [fadingIds, setFadingIds] = React.useState(() => new Set());
  const [justMovedIds, setJustMovedIds] = React.useState(() => new Set());
  const fadeOutThenDelete = (id, deleteFn) => {
    setFadingIds(prev => new Set(prev).add(id));
    setTimeout(() => { deleteFn(); }, 280);
  };
  const flashMoved = (id) => {
    setJustMovedIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setJustMovedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, 650);
  };
  /*
  {
    id,
    field,
    before,
    after
  }
  */

  // ==========================
  // 선택삭제 + 되돌리기 기능
  // ==========================
  const [showDeletePopup, setShowDeletePopup] = React.useState(false);
  const [backupDeleted, setBackupDeleted] = React.useState([]);
  const [undoVisible, setUndoVisible] = React.useState(false);
const flashRow = React.useCallback((id) => {
  requestAnimationFrame(() => {
    const el = document.getElementById(`row-${id}`);
    if (!el) return;
    el.classList.remove('row-highlight');
    void el.offsetWidth;
    el.classList.add('row-highlight');
    setTimeout(() => el.classList.remove('row-highlight'), 2500);
  });
}, []);

  const [editTarget, setEditTarget] = React.useState(null);
  // ⭐ 2026-11-05 매칭된 기사 이름·전화 [수정] — 오더 복사/수정 패널(cpDrvEdit) · 수정 창(editDrvEdit)
  const cpDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => sflowToast(m, "success") });
  const editDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => sflowToast(m, "success") });
  React.useEffect(() => { cpDrvEdit.reset(); }, [copyPanelOpen, copyTarget?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 운임조회·최적매칭·복사창은 예전 오더 전체가 필요 — 그 창을 열 때 1회 불러온다
  useLoadFullOrderHistory(!!(editTarget || copyTarget || optimalMatchRow5));
  const [edited, setEdited] = React.useState({});
  const [justSaved, setJustSaved] = React.useState([]);
  const [editPopupOpen, setEditPopupOpen] = React.useState(false);
  React.useEffect(() => { editDrvEdit.reset(); }, [editPopupOpen, editTarget?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 일마감 검증 팝업의 오류/경고 목록에서 오더를 클릭해 이 선택수정
  // 팝업을 열었을 때만 채워지는, 해당 오더의 검증 문제점 목록.
  const [dailyCloseIssueCtx, setDailyCloseIssueCtx] = React.useState(null);
  const [bulkRows, setBulkRows] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);   // ★ 복구완료 여부
  const [matchedDrivers, setMatchedDrivers] = React.useState([]);
  React.useEffect(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("dispatchDateState"));

    if (saved) {
      setStartDate(saved.startDate || "");
      setEndDate(saved.endDate || "");
      setAppliedStartDate(saved.appliedStartDate || "");
      setAppliedEndDate(saved.appliedEndDate || "");
      setLoaded(true);
      return;
    }
  } catch {}

  // 🔽 저장된 값 없을 때만 오늘
  const t = todayKST();

  setStartDate(t);
  setEndDate(t);
  setAppliedStartDate(t);
  setAppliedEndDate(t);

  setLoaded(true);
}, []);
// ==========================
// 🔥 조회 로직
// ==========================
const getMonthDiff = (start, end) => {
  const s = new Date(start);
  const e = new Date(end);

  return Math.abs(
    (e.getFullYear() - s.getFullYear()) * 12 +
    (e.getMonth() - s.getMonth())
  );
};

const handleSearch = () => {
  if (!startDate || !endDate) {
    showAlert("조회 기간을 입력해주세요.");
    return;
  }

  if (startDate > endDate) {
    showAlert("⚠ 조회 시작일이 종료일보다 늦을 수 없습니다.\n날짜를 다시 확인해주세요.");
    return;
  }

  if (role !== "totalMaster") {
    const diff = getMonthDiff(startDate, endDate);
    if (diff > 2) {
      showAlert("⚠ 조회는 최대 3개월까지만 가능합니다.");
      return;
    }
  }
setAppliedStartDate(startDate);
setAppliedEndDate(endDate);

// 🔥 추가 (여기가 핵심)
localStorage.setItem(
  "dispatchDateState",
  JSON.stringify({
    startDate,
    endDate,
    appliedStartDate: startDate,
    appliedEndDate: endDate,
  })
);

// 조회 버튼을 날짜/검색어 공용으로 합쳐서, 누르는 순간 검색어도 함께 적용한다.
setQ(qInputRef.current?.value ?? "");
setPage(0);
setLoaded(true);
};
  // ⭐ 페이지네이션 상태
  const [page, setPage] = React.useState(0);
  // 머리글 정렬을 바꾸면 1페이지부터 다시
  const dsOnSort = React.useCallback((k) => { dsSort.toggle(k); setPage(0); }, [dsSort.toggle]);
  const [pageSize, setPageSizePref] = usePageSize(fixedForm ? "fixedRoute" : "dispatchStatus", 100); // 📄 2026-11-17 한 페이지 개수 — 계정마다(페이지 번호 옆 선택칸)
  // 🔵 거래처 자동완성 상태
const [clientOptions, setClientOptions] = React.useState([]);
  const [showClientDropdown, setShowClientDropdown] = React.useState(false);
  const [clientActiveIndex, setClientActiveIndex] = React.useState(0);
  const clientListRef = React.useRef(null);

  React.useEffect(() => {
    if (!clientListRef.current) return;
    const list = clientListRef.current;
    const item = list.children[clientActiveIndex];
    if (!item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
    if (itemTop < viewTop) list.scrollTop = itemTop;
  }, [clientActiveIndex]);
  // 🔵 자동완성(상/하차지) 상태  ← ★★★ 여기 추가
  const [placeQuery, setPlaceQuery] = React.useState("");
  const [placeOptions, setPlaceOptions] = React.useState([]);
  // 🔥 PART 4와 동일한 구조
  const [activePlaceField, setActivePlaceField] = React.useState(null);
  // "상차" | "하차" | null
  // 🔽 상/하차 자동완성 키보드 네비게이션용
  const [placeActiveIndex, setPlaceActiveIndex] = React.useState(0);
  const placeListRef = React.useRef(null);
  // 🔥 방향키 이동 시 드롭다운 내부 스크롤 자동 이동
  React.useEffect(() => {
    if (!placeListRef.current) return;

    const list = placeListRef.current;
    const item = list.children[placeActiveIndex];

    if (!item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    // ⬇️ 아래로 벗어나면
    if (itemBottom > viewBottom) {
      list.scrollTop = itemBottom - list.clientHeight;
    }

    // ⬆️ 위로 벗어나면
    if (itemTop < viewTop) {
      list.scrollTop = itemTop;
    }
  }, [placeActiveIndex]);

  // ==========================
  // 🔍 거래처 자동완성 유틸
  // ==========================
  const normalizeClientKey = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[()㈜.,\-]/g, "")
      .replace(/주식회사|유한회사/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  const filterClients = (q) => {
    if (!q) return [];

    const nq = normalizeClientKey(q);

    return allClientPool
      .map((c) => {
        const name = c.거래처명 || "";
        const nk = normalizeClientKey(name);
        if (!nk) return null;

        let score = 0;
        if (nk === nq) score = 100;
        else if (nk.startsWith(nq)) score = 80;
        else if (nk.includes(nq)) score = 50;

        return score > 0 ? { ...c, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  };

  // 🔵 자동완성 검색 함수 (FIX)
  // 하차지거래처(places)뿐 아니라 기본거래처로 옮겨온 업체도 나오도록 mergedClients 사용
  const filterPlaces = (text) => {
    // ⭐ 2026-11-03 공용 검색(placeSearch) — "업체명 주소낱말"로 바로 좁히기
    return placeSearch(mergedClients, text)
      .map((p) => {
        const primary = Array.isArray(p.contacts) && p.contacts.length
          ? p.contacts.find(c => c.isPrimary) || p.contacts[0]
          : null;
        return {
          ...p,
          담당자: primary?.name || p.담당자 || "",
          담당자번호: primary?.phone || p.담당자번호 || "",
        };
      });
  };
  // 🔥 입력값과 가장 유사한 항목을 위로 정렬
  // 완전일치 > 시작일치 > 포함일치
  const rankPlaces = (list, query) => {
    const q = String(query || "").trim();
    if (!q) return list;
    return placeSearch(list, q); // ⭐ 2026-11-03 공용 검색(이미 정렬됨)
  };



  // ==========================
  // 📦 운임 조회 모달 상태 추가
  // ==========================
const [fareModalOpen, setFareModalOpen] = React.useState(false);
const [copyFarePanelOpen, setCopyFarePanelOpen] = React.useState(false);
const [fareResult, setFareResult] = React.useState(null);
const [fareSortMode, setFareSortMode] = React.useState("relevance");
const [copyFareFilter, setCopyFareFilter] = React.useState("all");
// ⭐ 오더복사/수정 패널 운임조회 — 동일 상/하차지 이력이 없을 때 주소로 검색하는 폴백(Part 4와 동일)
const [copyAddrConfirmOpen, setCopyAddrConfirmOpen] = React.useState(false);
const [copyAddrSearchOpen, setCopyAddrSearchOpen] = React.useState(false);
const [copyAddrClient, setCopyAddrClient] = React.useState("");
const [copyAddrPickup, setCopyAddrPickup] = React.useState("");
const [copyAddrDrop, setCopyAddrDrop] = React.useState("");
  const [fareSourceData, setFareSourceData] = React.useState([]);
  // 🔥 운임조회용 원본 데이터 (날짜 필터 무시)
  React.useEffect(() => {
    setFareSourceData(dispatchData);
  }, [dispatchData]);
  // ===================== 📋 기사복사 모달 상태 =====================
const [copyModalOpen, setCopyModalOpen] = React.useState(false);
const [newDriverModalOpen5, setNewDriverModalOpen5] = React.useState(false);
const [newDriverModalData5, setNewDriverModalData5] = React.useState(null);
const [driverConfirmOpen5, setDriverConfirmOpen5] = React.useState(false);
const [driverConfirmInfo5, setDriverConfirmInfo5] = React.useState(null);
const [driverConfirmRowId5, setDriverConfirmRowId5] = React.useState(null);
const driverPanelCallbackRef5 = React.useRef(null);
const openNewDriverModal = (차량번호, onConfirm) => {
  const existing = (drivers || []).filter(d =>
    (d.차량번호 || "").replace(/\s/g, "") === (차량번호 || "").replace(/\s/g, "")
  );
  if (existing.length > 0) {
    setNewDriverModalData5({ 차량번호, mode: "duplicate", existingDriver: existing[0], onConfirm });
  } else {
    setNewDriverModalData5({ 차량번호, mode: "new", existingDriver: null, onConfirm });
  }
  setNewDriverModalOpen5(true);
};
  // ===== 스마트 기사 검색 (PART 5) =====
const [smartQ5, setSmartQ5] = React.useState("");
const [smartList5, setSmartList5] = React.useState([]);
const [smart5ActiveIdx, setSmart5ActiveIdx] = React.useState(-1);
const [smart5ConflictPopup, setSmart5ConflictPopup] = React.useState(null);

const parseDriverText5 = (text) => {
 const phoneMatch = text.match(/01[016789][- .]?\d{3,4}[- .]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/[-.\s]/g,"").replace(/^(\d{3})(\d{3,4})(\d{4})$/,"$1-$2-$3") : "";
  const plateMatch = text.match(/[가-힣]{2,3}\d{2}[가-힣]\d{4}|\d{2,3}[가-힣]\d{4}|[가-힣]{4,6}\d{3,4}/);
  const plate = plateMatch ? plateMatch[0] : "";
  let name = "";
  const ownerBlock = text.match(/\[차주정보\]\s*([가-힣]{2,4})/);
  if (ownerBlock) {
    name = ownerBlock[1];
  } else {
    let stripped = text;
    if (phoneMatch?.[0]) stripped = stripped.replace(phoneMatch[0], " ");
    if (plate) stripped = stripped.replace(plate, " ");

    const excl = [
      "강원","서울","경기","인천","부산","대구","광주","대전","울산",
      "세종","경북","경남","전북","전남","충북","충남","제주",
      "냉장","냉동","카고","윙바디"
    ];
    const nameMatches = stripped.match(/[가-힣]{2,4}/g)||[];

    name = nameMatches.find(n =>
      n.length>=2 &&
      !excl.includes(n) &&
      !/[구시군동읍면로]$/.test(n)
    ) || "";

    if (!name) {
      name = nameMatches.find(n => n.length >= 2 && n.length <= 4) || "";
    }
  }
  return { phone, plate, name };
};
const nd5 = (s="") => String(s).replace(/[-.\s]/g,"").toLowerCase();

const handleSmart5Input = (text) => {
  setSmartQ5(text);
  setSmart5ActiveIdx(-1);
  if (!text.trim()) { setSmartList5([]); return; }
  const { phone, plate, name } = parseDriverText5(text);
  const q = nd5(text);
const results = plate
  ? (drivers||[])
      .filter(d => nd5(d.차량번호) === nd5(plate))
      .sort((a, b) => {
        const aExact = nd5(a.이름) === nd5(name) && nd5(a.전화번호) === nd5(phone);
        const bExact = nd5(b.이름) === nd5(name) && nd5(b.전화번호) === nd5(phone);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      })
  : (name && name.length >= 2)
  ? (drivers||[]).filter(d => d.이름 && d.이름.includes(name))
  : [];
setSmartList5(results.slice(0,8));
};
// 스마트검색 드롭다운 항목 선택 공통 처리 (마우스 클릭 / 방향키+엔터 공용)
const selectSmart5Driver = (d, setTarget) => {
  // ⚠️ 드롭다운 추천 항목을 고르는 이 경로는 예전엔 검사 없이 무조건 DB에 저장된
  // 기존 번호로 덮어썼다 — applySmart5(엔터/포커스아웃 경로)에 있는 "⚠️ 기사 정보
  // 확인" 충돌 팝업을 이 경로에도 동일하게 연결해, 검색창에 입력해둔 번호가 DB
  // 번호와 다르면 조용히 덮어쓰지 않고 사용자가 직접 선택하게 한다.
  const { phone: typedPhone } = parseDriverText5(smartQ5);
  if (typedPhone && nd5(d.전화번호) !== nd5(typedPhone)) {
    setSmartQ5(""); setSmartList5([]); setSmart5ActiveIdx(-1);
    setSmart5ConflictPopup({ existing: d, input: { plate: d.차량번호, name: d.이름, phone: typedPhone }, setTarget });
    return;
  }
  const gr = d?.등급 || d?.grade || "";
  if (gr === "블랙") setBlackAlert(d);
  else if (shouldShowDriverMemoAlert(d)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: d }));
  setTarget(p => ({ ...p, 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호), 배차상태: "배차완료" }));
  setSmartQ5(""); setSmartList5([]); setSmart5ActiveIdx(-1);
};
// 스마트검색 입력창 공용 방향키 핸들러 — ↑/↓ 이동, Enter 선택, Esc 닫기
const handleSmart5KeyDown = (e, target, setTarget) => {
  if (smartList5.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    setSmart5ActiveIdx(prev => {
      const next = e.key === "ArrowDown" ? prev + 1 : prev - 1;
      if (next < 0) return smartList5.length - 1;
      if (next >= smartList5.length) return 0;
      return next;
    });
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (smartList5.length > 0 && smart5ActiveIdx >= 0 && smart5ActiveIdx < smartList5.length) {
      selectSmart5Driver(smartList5[smart5ActiveIdx], setTarget);
    } else {
      applySmart5(target, setTarget, smartQ5);
    }
    return;
  }
  if (e.key === "Escape" && smartList5.length > 0) {
    e.preventDefault();
    setSmartList5([]); setSmart5ActiveIdx(-1);
  }
};

const applySmart5 = async (target, setTarget, text) => {
  if (!text.trim()) return;
  const { phone, plate, name } = parseDriverText5(text);
  if (!plate && !name && !phone) return;
  const byPlate = plate ? (drivers||[]).filter(d => nd5(d.차량번호)===nd5(plate)) : [];
  if (byPlate.length > 0) {
    const ex = byPlate[0];
    const sameName = nd5(ex.이름) === nd5(name);
    const samePhone = nd5(ex.전화번호) === nd5(phone);
    if (sameName && samePhone) {
      const grade = ex?.등급||ex?.grade||"";
      if (grade==="블랙") setBlackAlert(ex);
      setTarget(p=>({...p, 차량번호:ex.차량번호, 이름:ex.이름, 전화번호:formatPhone(ex.전화번호), 배차상태:"배차완료"}));
      setSmartQ5(""); setSmartList5([]);
    } else if (!sameName && name) {
      setSmart5ConflictPopup({ existing: ex, input: { plate, name, phone }, setTarget });
    } else if (sameName && !samePhone) {
      setSmart5ConflictPopup({ existing: ex, input: { plate, name, phone }, setTarget });
    } else {
      // 이름 파싱 안 됨 등 → 기존 기사 정보 사용
      const grade = ex?.등급||ex?.grade||"";
      if (grade==="블랙") setBlackAlert(ex);
      setTarget(p=>({...p, 차량번호:ex.차량번호, 이름:ex.이름, 전화번호:formatPhone(ex.전화번호), 배차상태:"배차완료"}));
      setSmartQ5(""); setSmartList5([]);
    }
} else if (plate||name||phone) {
    if (plate && !name) {
      // 차량번호만 입력 → 신규 등록 팝업
      openNewDriverModal(plate, async (driverInfo) => {
        const fmt = formatPhone(driverInfo.전화번호);
        const rawPhone = fmt.replace(/[^\d]/g, "");
        await upsertDriver({ 차량번호: plate, 이름: driverInfo.이름, 전화번호: rawPhone, 등급: driverInfo.등급, 메모: driverInfo.메모 });
        setTarget(p=>({...p, 차량번호:plate, 이름:driverInfo.이름, 전화번호:fmt, 배차상태:"배차완료"}));
      });
      setSmartQ5(""); setSmartList5([]);
      return;
    }
    // ⚠️ 여기서는 기사관리(Firestore)에 즉시 저장하지 않는다.
    // 패널을 저장하지 않고 닫으면 신규 기사 정보가 남으면 안 되므로,
    // 실제 저장은 패널의 저장 버튼(오더 저장 시점)에서만 이루어져야 한다.
    setTarget(p=>({...p, 차량번호:plate, 이름:name, 전화번호:formatPhone(phone), 배차상태:"배차완료"}));
  }
  setSmartQ5(""); setSmartList5([]);
};

  // 🚚 기사 선택 / 확인 팝업 상태 추가  ⭐⭐
const [driverSelectInfo, setDriverSelectInfo] = React.useState(null);
const [driverConfirmInfo, setDriverConfirmInfo] = React.useState(null);
const [quickRegMode5, setQuickRegMode5] = React.useState(false);
const [quickRegName5, setQuickRegName5] = React.useState("");
const [quickRegPhone5, setQuickRegPhone5] = React.useState("");
    React.useEffect(() => {
    if (!fareModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setFareModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fareModalOpen]);
  /*
  {
    rowId,
    plate,
    list: [],
    selectedDriver: null
  }
  */

  // 요일 계산
  const getYoil = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][date.getDay()];
  };
// 📦 화물내용에서 파렛트 수 추출 (운임조회용) ✅ 최종본
const getPalletCount = (text = "") => {
  const m = String(text).match(/(\d+)\s*(파렛트|파렛|파|p|P)/);
  return m ? Number(m[1]) : null;
};
  const formatPhone = (phone) => {
    const digits = String(phone ?? "").replace(/\D/g, "");

    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
    }

    if (digits.length === 10) {
      return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
    }

    // fallback
    return digits;
  };
  // ⚠️ 복사용 전화번호 포맷 (formatPhone2가 없어서 오류 발생 → 추가)
  const formatPhone2 = (phone) => {
    const digits = String(phone ?? "").replace(/\D/g, "");

    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
    }

    if (digits.length === 10) {
      return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
    }

    return digits;
  };
  // =======================
  // 📞 담당자 라인 생성 (기사복사용)
  // =======================
  const buildContactLine = (name0, phone) => {
    const name = mgrName(name0); // 고정노선 자리 채움 "담당자"는 빈 값
    if (!name && !phone) return "";

    const cleanName = String(name || "").trim();
    const cleanPhone = String(phone || "").trim();

    if (cleanPhone) {
      return `담당자 : ${cleanName} (${formatPhone(cleanPhone)})`;
    }

    return `담당자 : ${cleanName}`;
  };
  // ===============================
  // 📋 기사복사 (PART 5 최종)
  // ===============================
  // 📋 2026-11-13 간단 목록 — 고른 오더(여러 건)를 "머리말 + 기사 한 줄씩"으로 복사
  // 📋 2026-11-20 사용자 요청 — 다른 복사처럼 복사 뒤 [전달상태 → 전달완료] 팝업(고른 오더 중 미전달인 것 전부 한 번에)
  const copySimpleList = () => {
    const list = [...selected].map((id) => dispatchData.find((d) => getId(d) === id)).filter(Boolean);
    if (!list.length) { showAlert("복사할 항목을 선택하세요."); return; }
    const text = buildSimpleList(list, getSimpleTpl());
    navigator.clipboard.writeText(text);
    setCopyModalOpen(false); setSelected(new Set());
    const ids = list.filter((r) => r.업체전달상태 !== "전달완료").map((r) => getId(r));
    if (ids.length) setConfirmChange({ id: ids[0], ids, total: list.length, field: "업체전달상태", before: "미전달", after: "전달완료", reason: "copy" });
    else showAlert(`오더 ${list.length}건을 간단 목록으로 복사했습니다.`);
  setTimeout(async () => { try { if (await navigator.clipboard.readText() === text) showAlert("◷ 아직 전달되지 않은 것 같습니다.\n카카오톡 대화창에 붙여넣기(Ctrl+V) 했는지 확인해 주세요."); } catch { /* 읽기 권한 없음 */ } }, 3000);
  };
  const copyMessage = async (mode) => {
    if (mode === "simple") return copySimpleList();
    if (!selected.size) {
      showAlert("복사할 항목을 선택하세요.");
      return;
    }

    const text = [...selected]
      .map((id) => {
        const r = dispatchData.find((d) => getId(d) === id);
        if (!r) return "";

        // 📋 2026-11-18 오더 한 건 문구는 src/driverCopyText.js(모바일과 같은 글) — 상/하차지 주의사항만 여기서 찾아 넘긴다
        const _findDriverNotice5d = (placeName) => {
          const n = (placeName || "").trim();
          if (!n) return "";
          const found = (mergedClients || []).find(c => dsNormalizeKey(c.업체명 || c.거래처명 || "") === dsNormalizeKey(n));
          const notice = (found?.기사전달주의사항 || "").trim();
          return _hasRealDriverNotice(notice) ? notice : "";
        };
        const noticeBlock = [...new Set([_findDriverNotice5d(r.상차지명), _findDriverNotice5d(r.하차지명)].filter(Boolean))].join("\n\n");
        return buildDriverCopyText(r, mode, { driverNote: edited[id]?.전달사항, noticeBlock, uploadUrlOf: issueUploadUrl, company: userCompany });
      })
      .join("\n\n");

    // 기사전달용: 계산서+직접배차 → 사업자등록증 이미지 첨부
    // 기사전달용: 선불/착불+직접배차 → 계좌 정보 이미지 생성 및 첨부
    // 모든 모드 텍스트 복사
    navigator.clipboard.writeText(text);

    setSelected(new Set());
    setCopyModalOpen(false);

// 기사복사 후 처리
const rowId = [...selected][0];
const row = dispatchData.find((d) => getId(d) === rowId);

if (mode === "driver") {
  const phone = formatPhone2 ? formatPhone2(row?.전화번호 || "") : (row?.전화번호 || "");
  setSmsConfirm5({ phone, body: text, rowId });
} else if (row?.업체전달상태 !== "전달완료") {
  setConfirmChange({
    id: rowId,
    field: "업체전달상태",
    before: row?.업체전달상태 || "미전달",
    after: "전달완료",
    reason: "copy",
  });
}
};

  // 계좌 정산 이미지 복사 (Part 5) — 그리는 식은 sharedDispatchUi.jsx(copyAccountSettleImage) 한 곳
  const copyAccountImage5 = async () => {
    if (!selected.size) { showAlert("오더를 선택하세요."); return; }
    const selId = [...selected][0];
    const selRow = dispatchData.find(d => getId(d) === selId);
    await copyAccountSettleImage({ selRow, bizList: dsBiz, bankData: companyBankData, showAlert, onCopied: () => setCopyModalOpen(false) });
  };

  // 사업자등록증 이미지 복사 (Part 5) — ⭐ 2026-11-03 여러 사업자면 그 사업자 정보 카드 이미지(sharedDispatchUi.jsx copyBizImage)
  const copyBizImage5 = async () => {
    const _r5 = selected.size ? dispatchData.find(d => getId(d) === [...selected][0]) : null;
    await copyBizImage({ selRow: _r5, bizList: dsBiz, bankData: companyBankData, showAlert, onCopied: () => setCopyModalOpen(false) });
  };

  // ⭐ 다목적지 단가표 매칭 (3파트와 동일) — 선택수정 중인 오더(editTarget)의
  // 하차지명/주소가 단가표 메뉴에 등록된 하차지와 겹치면 "단가표" 버튼이
  // 천천히 깜빡이고, 눌렀을 때 그 하차지에 등록된 모든 톤수 단가를 보여준다.
  const [multiRateSheets5, setMultiRateSheets5] = React.useState([]);
  React.useEffect(() => {
    const co = (userCompany || localStorage.getItem("userCompany") || "").trim();
    if (!co) { setMultiRateSheets5([]); return; }
    const q = query(collection(db, "multiRateSheets"), where("companyName", "==", co));
    const unsub = onSnapshot(q, (snap) => {
      setMultiRateSheets5(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [userCompany]);
  const [rateSheetLookupOpen5, setRateSheetLookupOpen5] = React.useState(false);
  const normRateText5 = (s) => String(s || "").replace(/[\s()（）·]/g, "").toLowerCase();
  const rateSheetMatches5 = React.useMemo(() => {
    const dropName = normRateText5(editTarget?.하차지명);
    const dropAddr = normRateText5(editTarget?.하차지주소).slice(0, 12);
    if (!dropName && !dropAddr) return [];
    const results = [];
    (multiRateSheets5 || []).forEach(sheet => {
      (sheet.rows || []).forEach(r => {
        const rName = normRateText5(r.name);
        const rAddr = normRateText5(r.address).slice(0, 12);
        const nameHit = !!(dropName && rName && (rName.includes(dropName) || dropName.includes(rName)));
        const addrHit = !!(dropAddr && rAddr && dropAddr.length >= 6 && rAddr.length >= 6 && (rAddr.includes(dropAddr) || dropAddr.includes(rAddr)));
        if (nameHit || addrHit) results.push({ sheet, row: r, nameHit, addrHit });
      });
    });
    return results;
  }, [editTarget?.하차지명, editTarget?.하차지주소, multiRateSheets5]);

  // 🚀 운임 조회 실행 함수
  const handleFareSearch = () => {
    if (!editTarget) return;
    const pickup = String(editTarget.상차지명 || "");
    const drop = String(editTarget.하차지명 || "");
    const cargo = String(editTarget.화물내용 || "");
    const ton = String(editTarget.차량톤수 || "");

    // 1️⃣ 필터: 상/하차지(경유 포함 정확매칭) + 냉장/냉동 그룹
    const _targetVehicle = String(editTarget.차량종류 || "");
    const _isColdTarget = _targetVehicle.includes("냉장") || _targetVehicle.includes("냉동");
    const _p5EditPickup = getRouteStops(editTarget, "pickup");
    const _p5EditDrop = getRouteStops(editTarget, "drop");
    const _p5EditSame = (a, b) => a.length === b.length && a.every((n, i) => n.trim() === b[i].trim());
    const base = fareSourceData.filter((r) => {
      if (!_p5EditSame(_p5EditPickup, getRouteStops(r, "pickup"))) return false;
      if (!_p5EditSame(_p5EditDrop, getRouteStops(r, "drop"))) return false;
      const rv = String(r.차량종류 || "");
      const rCold = rv.includes("냉장") || rv.includes("냉동");
      return _isColdTarget ? rCold : !rCold;
    });

    if (!base.length) {
      showAlert("○ 유사 운임 데이터가 없습니다.");
      return;
    }

    // 2️⃣ 티어 기반 정렬
    const targetCargo5 = String(editTarget.화물내용 || "").trim();
    const targetTon5 = String(editTarget.차량톤수 || "").trim();
    const _5fDetectType = (s = "") => { const t = s.trim().toLowerCase().replace(/\s+/g,""); if (/\d+(파레트|파렛트|파렛|파레|파|plt)/.test(t)) return "pallet"; if (/\d+(박스|box)/.test(t)) return "box"; return "text"; };
    const _5fInputType = _5fDetectType(targetCargo5);
    const _5fInputPallet = getTotalPalletFromOrder(editTarget);
    const _5fInputBox = (() => { const m = targetCargo5.replace(/\s+/g,"").match(/(\d+)(박스|box)/i); return m ? Number(m[1]) : null; })();
    const _5fInputTon = getTotalTonFromOrder(editTarget);

    const _5fScored = base.map(r => {
      const rType = _5fDetectType(r.화물내용);
      const rTon = getTotalTonFromOrder(r);
      const rDate = r.상차일 || "";
      let cargoDiff = 999, tonDiff = 999;
      if (_5fInputType === "pallet" && _5fInputPallet != null && rType === "pallet") { const rp = getTotalPalletFromOrder(r); cargoDiff = rp != null ? Math.abs(rp - _5fInputPallet) : 999; }
      else if (_5fInputType === "box" && _5fInputBox != null) { const rm = (r.화물내용||"").replace(/\s+/g,"").match(/(\d+)(박스|box)/i); cargoDiff = rm ? Math.abs(Number(rm[1]) - _5fInputBox) : 999; }
      else { cargoDiff = (r.화물내용||"").trim() === targetCargo5 ? 0 : 1; }
      if (_5fInputTon != null && rTon != null) tonDiff = Math.abs(rTon - _5fInputTon);
      const exactCargo = cargoDiff === 0, exactTon = tonDiff === 0;
      const tier = exactCargo && exactTon ? 0 : exactCargo ? 1 : exactTon ? 2 : 3;
      const matchLabel = tier === 0 ? "완전일치" : tier === 1 ? "부분일치" : tier === 2 ? "톤수일치" : "경로일치";
      return { ...r, _cargoDiff: cargoDiff, _tonDiff: tonDiff, _tier: tier, _date: rDate, _match: { label: matchLabel } };
    });

    // ⚠️ 화물내용+톤수만으로 묶으면 금액이 다른 이력이 사라지므로 청구운임도 그룹 키에 포함
    const _5fGroupMap = new Map();
    _5fScored.forEach(r => { const key = `${(r.화물내용||"").trim()}|${(r.차량톤수||"").trim()}|${Number(String(r.청구운임||"0").replace(/[^\d]/g,""))}`; if (!_5fGroupMap.has(key)) _5fGroupMap.set(key, []); _5fGroupMap.get(key).push(r); });
    const records = Array.from(_5fGroupMap.values()).map(recs => { const best = [...recs].sort((a,b) => b._date.localeCompare(a._date))[0]; return { ...best, _groupSize: recs.length }; })
      .sort((a, b) => { if (a._tier !== b._tier) return a._tier - b._tier; if (a._tonDiff !== b._tonDiff) return a._tonDiff - b._tonDiff; if (a._cargoDiff !== b._cargoDiff) return a._cargoDiff - b._cargoDiff; return b._date.localeCompare(a._date); });

    const vals = records.map((r) => Number(r.청구운임 || 0));
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    setFareResult({ count: records.length, avg, min, max, records });
    setFareModalOpen(true);
  };
  // 🚀 복사패널 운임조회 함수 (5파트 신규)
  const handleCopyFareSearch = () => {
    if (!copyTarget) return showAlert("먼저 오더를 선택해주세요.");
    const pickup = copyTarget.상차지명?.trim();
    const drop = copyTarget.하차지명?.trim();
    if (!pickup || !drop) return showAlert("상/하차지를 입력해주세요.");

    try {
    const _copyVehicle = String(copyTarget.차량종류 || "");
    const _isCopyCold = _copyVehicle.includes("냉장") || _copyVehicle.includes("냉동");
    const _p5CopyPickup = getRouteStops(copyTarget, "pickup");
    const _p5CopyDrop = getRouteStops(copyTarget, "drop");
    const _p5CopySame = (a, b) => a.length === b.length && a.every((n, i) => n.trim() === b[i].trim());
    const base = (dispatchData || []).filter(r => {
      if (!r.청구운임) return false;
      if (!_p5CopySame(_p5CopyPickup, getRouteStops(r, "pickup"))) return false;
      if (!_p5CopySame(_p5CopyDrop, getRouteStops(r, "drop"))) return false;
      const rv = String(r.차량종류 || "");
      const rCold = rv.includes("냉장") || rv.includes("냉동");
      return _isCopyCold ? rCold : !rCold;
    });

    if (!base.length) {
      // ⭐ 동일 상/하차지명 이력이 없으면(신규 거래처/신규 하차지 등) 주소 기준으로
      // 검색할지 물어본다 — RealtimeStatus 컨텍스트메뉴 운임조회와 동일한 흐름.
      setCopyAddrClient(copyTarget.거래처명 || "");
      setCopyAddrPickup(extractAddrArea5(copyTarget.상차지주소 || copyTarget.상차지명));
      setCopyAddrDrop(extractAddrArea5(copyTarget.하차지주소 || copyTarget.하차지명));
      setCopyAddrConfirmOpen(true);
      return;
    }

    const targetCargo = String(copyTarget.화물내용 || "").trim();
    const targetTon = String(copyTarget.차량톤수 || "").trim();

    const _5cDetectType = (s = "") => { const t = s.trim().toLowerCase().replace(/\s+/g,""); if (/\d+(파레트|파렛트|파렛|파레|파|plt)/.test(t)) return "pallet"; if (/\d+(박스|box)/.test(t)) return "box"; return "text"; };
    const _5cInputType = _5cDetectType(targetCargo);
    const _5cInputPallet = getTotalPalletFromOrder(copyTarget);
    const _5cInputBox = (() => { const m = targetCargo.replace(/\s+/g,"").match(/(\d+)(박스|box)/i); return m ? Number(m[1]) : null; })();
    const _5cInputTon = getTotalTonFromOrder(copyTarget);

    const _5cScored = base.map(r => {
      const rType = _5cDetectType(r.화물내용);
      const rTon = getTotalTonFromOrder(r);
      const rDate = r.상차일 || r.등록일 || "";
      let cargoDiff = 999, tonDiff = 999;
      if (_5cInputType === "pallet" && _5cInputPallet != null && rType === "pallet") { const rp = getTotalPalletFromOrder(r); cargoDiff = rp != null ? Math.abs(rp - _5cInputPallet) : 999; }
      else if (_5cInputType === "box" && _5cInputBox != null) { const rm = (r.화물내용||"").replace(/\s+/g,"").match(/(\d+)(박스|box)/i); cargoDiff = rm ? Math.abs(Number(rm[1]) - _5cInputBox) : 999; }
      else { cargoDiff = (r.화물내용||"").trim() === targetCargo ? 0 : 1; }
      if (_5cInputTon != null && rTon != null) tonDiff = Math.abs(rTon - _5cInputTon);
      const exactCargo = cargoDiff === 0, exactTon = tonDiff === 0;
      const tier = exactCargo && exactTon ? 0 : exactCargo ? 1 : exactTon ? 2 : 3;
      const matchLabel = tier === 0 ? "완전일치" : tier === 1 ? "부분일치" : tier === 2 ? "톤수일치" : "경로일치";
      return { ...r, _cargoDiff: cargoDiff, _tonDiff: tonDiff, _tier: tier, _date: rDate, _match: { label: matchLabel } };
    });

    // ⚠️ 화물내용+톤수만으로 묶으면 금액이 다른 이력이 사라지므로 청구운임도 그룹 키에 포함
    const _5cGroupMap = new Map();
    _5cScored.forEach(r => { const key = `${(r.화물내용||"").trim()}|${(r.차량톤수||"").trim()}|${Number(String(r.청구운임||"0").replace(/[^\d]/g,""))}`; if (!_5cGroupMap.has(key)) _5cGroupMap.set(key, []); _5cGroupMap.get(key).push(r); });
    const scored = Array.from(_5cGroupMap.values()).map(recs => { const best = [...recs].sort((a,b) => b._date.localeCompare(a._date))[0]; return { ...best, _groupSize: recs.length }; })
      .sort((a, b) => { if (a._tier !== b._tier) return a._tier - b._tier; if (a._tonDiff !== b._tonDiff) return a._tonDiff - b._tonDiff; if (a._cargoDiff !== b._cargoDiff) return a._cargoDiff - b._cargoDiff; return b._date.localeCompare(a._date); });

    const fares = scored.map(r => Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")));
    setFareResult({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
    });
    setCopyFarePanelOpen(true);
    } catch (e) {
      console.error("운임조회 오류:", e);
      showAlert("운임조회 중 오류가 발생했습니다.\n" + (e?.message || e));
    }
  };

  // ⭐ 오더복사/수정 패널 전용 — 주소 기준 운임조회(Part 4와 동일한 흐름).
  // 거래처명 입력창을 비워두면 거래처 구분 없이 해당 상/하차 지역의 모든 이력을 검색한다.
  const handleCopyAddrSearch = () => {
    const row = copyTarget;
    if (!row) return;
    const pickupKw = copyAddrPickup.trim();
    const dropKw = copyAddrDrop.trim();
    if (!pickupKw || !dropKw) { showAlert("상차지 주소와 하차지 주소를 입력해주세요."); return; }
    const clientKw = copyAddrClient.trim();

    try {
      const targetGroup = getVehicleGroup5(row.차량종류);
      const _todayKstCopyAddr5 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const matchDir = (pk, dk) => (dispatchData || []).filter(r => {
        if ((r.상차일 || "").slice(0, 10) === _todayKstCopyAddr5) return false;
        if (!r.청구운임) return false;
        const rPickup = String(r.상차지명 || "") + " " + String(r.상차지주소 || "");
        const rDrop = String(r.하차지명 || "") + " " + String(r.하차지주소 || "");
        if (!rPickup.includes(pk)) return false;
        if (!rDrop.includes(dk)) return false;
        const rGroup = getVehicleGroup5(r.차량종류);
        if (rGroup !== targetGroup) return false;
        if (clientKw && String(r.거래처명 || "").trim() !== clientKw) return false;
        return true;
      });

      let base = matchDir(pickupKw, dropKw);
      let reversedMatch = false;
      if (!base.length) {
        base = matchDir(dropKw, pickupKw);
        reversedMatch = base.length > 0;
      }

      if (!base.length) {
        showAlert("해당 조건의 운임 이력이 없습니다.");
        return;
      }

      const scored = base.map(r => ({
        ...r,
        _score: scoreCtxFareRow5(r, row),
        _match: {
          cargo: String(row.화물내용 || "").trim() && r.화물내용 && r.화물내용.includes(String(row.화물내용 || "").trim()),
          ton: getTotalTonFromOrder(row) != null && getTotalTonFromOrder(r) === getTotalTonFromOrder(row),
        },
        _time: r.updatedAt || r.등록일 || 0,
        _reverseRoute: reversedMatch,
      }));
      scored.sort((a, b) => b._score !== a._score ? b._score - a._score : b._time - a._time);

      const fares = scored.map(r => Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")));
      setFareResult({
        records: scored,
        count: fares.length,
        avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
        min: Math.min(...fares),
        max: Math.max(...fares),
      });
      setCopyAddrSearchOpen(false);
      setCopyFarePanelOpen(true);
      if (reversedMatch) {
        showAlert(`"${pickupKw} → ${dropKw}" 방향 이력은 없어, 반대 방향 이력 ${scored.length}건을 표시합니다.`);
      }
    } catch (e) {
      console.error("주소 운임조회 오류:", e);
      showAlert("운임조회 중 오류가 발생했습니다.\n" + (e?.message || e));
    }
  };
  // ======================= 신규 오더 등록 팝업 상태 =======================
  const [showCreate, setShowCreate] = React.useState(false);
  const [newOrder, setNewOrder] = React.useState({
    상차일: "",
    상차시간: "",
    하차일: "",
    하차시간: "",
    거래처명: "",
    상차지명: "",
    상차지주소: "",
    하차지명: "",
    하차지주소: "",
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    청구운임: "",
    기사운임: "",
    지급방식: "",
    배차방식: "",
    메모: "",
    운행유형: "편도",
    혼적: false,
    독차: false,
  });

  const toInt = (v) => fkNum(v); // 🛠 2026-11-25 수수료 칩(profitTotals)과 같은 금액 읽기 — 엑셀 업로드의 소수점 금액(181818.18)이 18,181,818로 들어가던 것 고침
  const getId = (r) => r._id || r.id || r._fsid;
  // 🕘 변경 이력 1건 생성
  const makeHistory = ({ field, before, after }) => ({
    field,
    before: before ?? "",
    after: after ?? "",
    at: new Date().toISOString(),
    user: "관리자", // ▲ 나중에 로그인 사용자로 교체 가능
  });
  // ⚡ select 즉시 변경 → 확인 팝업용
  const handleImmediateSelectChange = (row, field, nextValue, extra = null) => {
    const id = getId(row);
    const before = row[field] ?? "";
    if (before === nextValue && !extra) return;
    setConfirmChange({ id, field, before, after: nextValue, ...(extra ? { extra } : {}) }); // 💳 extra = 배차방식과 함께 바뀌는 IN/OUT
  };
  // =============================================
  // ✅ 대용량 업로드 (엑셀 → Firestore)
  // =============================================
  const excelDateToISO = (value) => {
    if (!value) return "";
    if (typeof value === "number") {
      const utcDays = Math.floor(value - 25569);
      const date = new Date(utcDays * 86400 * 1000);
      return date.toISOString().slice(0, 10);
    }
    if (typeof value === "string") {
      const clean = value.replace(/[^\d]/g, "-").replace(/--+/g, "-");
      const parts = clean.split("-").filter(Boolean);
      if (parts.length === 3) {
        let [y, m, d] = parts;
        if (y.length === 2) y = "20" + y;
        if (m.length === 1) m = "0" + m;
        if (d.length === 1) d = "0" + d;
        return `${y}-${m}-${d}`;
      }
    }
    return "";
  };

  // 대용량 업로드 엑셀 양식(첫 줄 = 열 이름, 둘째 줄 = 예시)
  const [bulkChooserOpen, setBulkChooserOpen] = useState(false);
  const BULK_COLS0 = ["상차일", "상차시간", "하차일", "하차시간", "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소", "화물내용", "차량종류", "차량톤수", "차량번호", "기사명", "전화번호", "청구운임", "기사운임", "지급방식", "배차방식", "메모", "회전", "회전방식"]; // 📥 2026-11-25 회전 · 회전방식(같은 날 같은 노선 N회 — 비우면 보통 오더)
  // ⭐ 2026-11-02 운임규칙 — 규칙 사용 회사는 양식에 "운임구분" 열(비우면 예전처럼)
  const BULK_COLS = fareOn ? [...BULK_COLS0, "운임구분"] : BULK_COLS0;
  const downloadBulkTemplate = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const t1 = new Date(today.getTime() + 86400000);
    const samples = [
      [ymd(t1), "오전 9시", ymd(t1), "오후 3시 30분", "동원F&B", "동원F&B 이천센터", "경기 이천시 마장면 100", "CJ 대구센터", "대구 달서구 성서로 10", "16파레트", "윙바디", "11톤", "경기12가3456", "김기사", "010-1234-5678", 450000, 400000, "계산서", "24시", "", "", ""],
      [ymd(t1), "오후 2시", ymd(t1), "오후 6시", "오뚜기", "오뚜기 평택공장", "경기 평택시 포승읍 1", "이마트 광주센터", "광주 광산구 하남산단 5", "8파레트", "카고", "5톤", "", "", "", 320000, 280000, "착불", "직접배차", "", "", ""],
      [ymd(t1), "", ymd(t1), "", "아이플로우", "안성", "", "화성", "", "", "", "", "", "", "", 160000, 0, "계산서", "", "", 3, ""], // 회전 3 → 이 날짜에 오더 3건(1/3 · 2/3 · 3/3회차)
    ];
    const ws = XLSX.utils.aoa_to_sheet([BULK_COLS, ...(fareOn ? samples.map((x) => [...x, ""]) : samples)]);
    ws["!cols"] = BULK_COLS.map((c) => ({ wch: c === "메모" ? 40 : c.includes("주소") ? 26 : Math.max(11, c.length * 2 + 4) }));
    const guide = XLSX.utils.aoa_to_sheet([
      ["항목", "작성 방법"],
      ["예시 3줄", "예시 줄은 지우고 실제 오더를 한 줄에 하나씩 입력하세요."],
      ["상차일 · 하차일", "2026-11-03 처럼 입력 (엑셀 날짜 형식도 가능)"],
      ["상차시간 · 하차시간", "오전 9시, 오후 3시 30분 처럼 입력 (09:00 으로 써도 자동 변환)"],
      ["차량번호 · 기사명 · 전화번호", "입력하면 '배차완료', 비워두면 '배차중'으로 등록됩니다. 등록된 기사의 차량번호만 써도 기사명·전화번호가 자동으로 채워집니다."],
      ["청구운임 · 기사운임", "숫자만 입력 (수수료는 자동 계산)"],
      ["회전", `같은 날 같은 노선을 여러 번 돌면 횟수를 숫자로(예: 3). 그 날짜에 오더가 3건 등록되고 1/3 · 2/3 · 3/3회차로 표시돼요. 비우면 보통 오더(1건)예요. 최대 ${ROTATION_MAX}`],
      ["회전방식", "비우면 '나누기'(회전 수만큼 오더가 생김). '묶기'라고 쓰면 오더 1건에 '3회전'으로 표시돼요"],
      ["회전 오더의 운임", "청구운임 · 기사운임은 1회 단가를 적어요. 나누기는 건마다 그 금액, 묶기는 회전 수를 곱한 합계로 들어가요"],
      ["하차일", "비우면 상차일과 같은 날로 들어가요"],
      ...(fareOn ? [["운임구분", `회사관리 › 운임 규칙 이름(${fareR.rules.map((x) => x.name).filter(Boolean).join(", ") || "예: 일대"}). 기사운임을 비우면 규칙대로 자동 계산해요`]] : []),
      ["열 이름", "첫 줄(열 이름)은 바꾸지 마세요. 기사명 대신 '이름'이라고 써도 인식합니다."],
    ]);
    guide["!cols"] = [{ wch: 26 }, { wch: 90 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "오더"); XLSX.utils.book_append_sheet(wb, guide, "작성 안내");
    XLSX.writeFile(wb, "대용량업로드_양식.xlsx");
  };
  // 엑셀 시간 → 프로그램 표기("오전 9시", "오후 3시 30분")
  const bulkTime = (v) => {
    if (v === "" || v == null) return "";
    if (typeof v === "number" && v >= 0 && v < 1) { const mins = Math.round(v * 1440); return fmtDispatchTime(`${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`); }
    const t = String(v).trim();
    const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return fmtDispatchTime(`${Number(m[1])}:${m[2]}`);
    return t.replace(/(\d)시(\d)/, "$1시 $2");
  };

  const handleBulkFile = (e) => {
    if (!(role === "admin" || role === "totalMaster")) { showAlert("대용량 업로드는 관리자만 사용할 수 있습니다."); return; }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

      let mapped = json.filter((row) => ["상차일", "상차지명", "하차지명", "거래처명"].some((k) => String(row[k] || "").trim())).map((row) => {
        const mappedRow = {
          _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          등록일: excelDateToISO(row["상차일"]) || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
          상차일: excelDateToISO(row["상차일"]),
          상차시간: bulkTime(row["상차시간"]),
          하차일: excelDateToISO(row["하차일"]) || excelDateToISO(row["상차일"]), // 📥 2026-11-25 하차일을 비우면 상차일과 같은 날
          하차시간: bulkTime(row["하차시간"]),
          거래처명: row["거래처명"] || "",
          상차지명: row["상차지명"] || "",
          상차지주소: row["상차지주소"] || "",
          하차지명: row["하차지명"] || "",
          하차지주소: row["하차지주소"] || "",
          화물내용: row["화물내용"] || "",
          차량종류: row["차량종류"] || "",
          차량톤수: row["차량톤수"] || "",
          차량번호: row["차량번호"] || "",
          이름: String(row["기사명"] || row["이름"] || "").trim(),
          전화번호: String(row["전화번호"] || "").trim(),
          청구운임: toInt(row["청구운임"]),
          기사운임: toInt(row["기사운임"]),
          수수료: toInt(row["청구운임"]) - toInt(row["기사운임"]),
          지급방식: row["지급방식"] || "",
          배차방식: row["배차방식"] || "",
          메모: row["메모"] || "",
          배차상태: "배차중",
        };
        // ⭐ 2026-11-02 운임규칙 — "운임구분" 열이 있으면 함께(기사운임이 비어 있으면 규칙대로 계산)
        const _ft = fareOn ? String(row["운임구분"] || "").trim() : "";
        const _rule = _ft ? findFareRule(fareR.rules, _ft) : null;
        if (_rule) {
          mappedRow.운임구분 = _rule.name;
          const _blank = String(row["기사운임"] ?? "").trim() === "";
          if (_blank) { const c = applyFareRule(_rule, mappedRow.청구운임); mappedRow.기사운임 = c.기사운임; mappedRow.수수료 = c.수수료; mappedRow.운임수동 = false; }
          else mappedRow.운임수동 = mappedRow.기사운임 !== applyFareRule(_rule, mappedRow.청구운임).기사운임;
        }

        // ====================================================
        // 🚛 자동 기사 매칭 (차량번호 → 이름/전화번호 자동입력)
        // ====================================================
        const cleanCar = String(mappedRow.차량번호 || "").replace(/\s+/g, "");

        if (cleanCar) {
          const matched = drivers.find(
            (d) =>
              String(d.차량번호 || "").replace(/\s+/g, "") === cleanCar
          );

          if (matched) {
            mappedRow.이름 = mappedRow.이름 || matched.이름 || "";
            mappedRow.전화번호 = mappedRow.전화번호 || matched.전화번호 || "";
          }
        }
        // 차량번호 + (기사명 또는 전화번호)가 있으면 배차완료, 없으면 배차중
        mappedRow.배차상태 = dispatchStatusOf({ 지급방식: mappedRow.지급방식, 차량번호: cleanCar }); // 🚚 2026-11-07 차량번호만 있어도 배차완료
        mappedRow._rot = bulkRotationOf(row); // 📥 2026-11-25 회전 · 회전방식 열

        return mappedRow;
      });
      // 📥 2026-11-25 회전 열 — 한 줄을 회전 수만큼 오더로 펼친다(나누기: N건 · 묶기: 1건에 합계 운임). 줄 수(lines)와 등록 건수(mapped)가 달라진다
      const lines = mapped;
      const rotLines = lines.filter((m) => m._rot.n > 1);
      mapped = lines.flatMap(({ _rot, ...m }) => expandBulkRotation(m, _rot).map((x, i) => (i ? { ...x, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` } : x)));

      if (!mapped.length) {
        showAlert("✕ 엑셀 데이터가 없습니다.");
        return;
      }

      const _dates = mapped.map((m) => m.상차일).filter(Boolean).sort();
      const _matched = mapped.filter((m) => m.배차상태 === "배차완료").length;
      const _rotMsg = rotLines.length ? (() => {
        const sp = rotLines.filter((m) => !m._rot.bundle), bd = rotLines.filter((m) => m._rot.bundle);
        return `\n· 회전 운행 ${rotLines.length}줄${sp.length ? ` — 나누기 ${sp.length}줄 → ${sp.reduce((a, m) => a + m._rot.n, 0)}건` : ""}${bd.length ? ` · 묶기 ${bd.length}줄 → ${bd.length}건(운임은 회전 수만큼 곱함)` : ""}${rotLines.some((m) => m._rot.over) ? `\n· 회전이 ${ROTATION_MAX}을 넘는 줄은 ${ROTATION_MAX}회전으로 등록돼요` : ""}`;
      })() : "";
      if (!(await kpConfirm(`${lines.length === mapped.length ? `${mapped.length}건` : `엑셀 ${lines.length}줄 → 오더 ${mapped.length}건`}을 업로드하시겠습니까?\n\n· 상차일: ${_dates.length ? `${_dates[0]} ~ ${_dates[_dates.length - 1]}` : "없음(오늘 날짜로 등록)"}\n· 배차완료 ${_matched}건 / 배차중 ${mapped.length - _matched}건\n· 청구운임 합계: ${mapped.reduce((a, m) => a + (m.청구운임 || 0), 0).toLocaleString()}원${_rotMsg}`))) return;

      try {
        // ⭐ 새 오더는 addDispatch로 "생성"해야 한다 — 예전엔 patchDispatch(기존 문서 수정)를 써서
        // 문서가 없다는 이유로 아무것도 저장되지 않았다.
        let ok = 0, fail = 0;
        // 📥 2026-11-12 한 건씩 툭툭 생기지 않게 — 가운데 로딩 창 + 묶음으로 동시에 등록
        const upO = await runUpload({ items: mapped, label: "오더", chunk: 25, each: async (item) => {
          const { _id: _tmpId, ...rec } = item; void _tmpId;
          const r = await addDispatch({
            ...rec,
            차량톤수: toTonUnit(rec.차량톤수),
            운행유형: rec.운행유형 === "왕복" ? "왕복" : "편도", 회전수: Number(rec.회전수) > 1 ? Number(rec.회전수) : 1, 메모중요도: "일반", 긴급: false, // 📥 2026-11-25 회전 열(회차 · 회차총수 · 회전묶음ID는 rec 에 들어 있다)
            업체전달상태: "미전달", 업체전달일시: null, 업체전달방법: null,
            등록기기: "PC(대용량)",
            // 대량 등록 중 휴차 확인 팝업이 건마다 뜨지 않게 미리 확인 처리
            ...(rec.차량번호 ? { _restAck: restAckKey(rec.차량번호, rec.상차일) } : {}),
          });
          if (r === false) { fail++; return false; }
        } });
        ok = upO.ok; fail += upO.fail;
        showAlert(fail ? `✓ ${ok}건 등록 완료 · ⚠ ${fail}건 실패(하차일이 상차일보다 빠른 줄 등)` : `✓ 대용량 업로드를 마쳤어요. ${ok}건을 등록했어요.`);
      } catch (err) {
        console.error(err);
        showAlert("✕ 업로드 중 오류가 발생했습니다.\n" + (err?.message || ""));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // ================================  
  // 🔵 선택수정 / 수정완료  
  // ================================
  const toggleOne = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (rows) =>
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => getId(r)))
    );
  const dsBiz = useCompanyBiz(getTenant() || userCompany); // ⭐ 2026-11-03 여러 사업자
  const dsFixedLook = React.useMemo(() => (fixedForm ? fixedLookOf(fixedForm) : null), [fixedForm]); // ⭐ 리터·총계 머리글 색
  const [dsDetail, setDsDetail] = React.useState(null); // 🔎 세부검색(최대 3차 + 기간)
  const dsDetailGet = useDetailGetters(userNameMap, userCompany);
  // ⭐ 2026-11-06 고정노선현황 배차담당자 — 등록 직원이 없으면(시트 자동 오더) 배차한 사람(배차확정자)
  const dsStaffOf = React.useCallback((r) => {
    const n = _orderStaffNameRaw(r, userNameMap);
    return String((n && n !== "고정노선" ? n : "") || r?.배차확정자 || n || "");
  }, [userNameMap]);
  // ⭐ 2026-11-06 고정노선현황 수정 권한 — 배차담당자는 본인 오더만, 마스터는 전부(src/FixedRouteStatus.jsx useRouteEditGuard)
  const frGuard = useRouteEditGuard(role);
  const frCanEdit = React.useCallback((r) => !fixedForm || frGuard.canEdit(r), [fixedForm, frGuard]);
  const frLockAlert = (r) => showAlert(`🔒 ${ROUTE_LOCK_MSG}${routeOwnerName(r, userNameMap) ? ` (담당: ${routeOwnerName(r, userNameMap)})` : ""}\n본인이 등록·배차한 오더만 고칠 수 있어요 · 마스터는 모든 오더 수정 가능`);
  const dsDateOf = React.useCallback((r) => String(fixedForm ? (r.입고일 || r.하차일 || r.상차일 || "") : (r.상차일 || r.상차일자 || "")).slice(0, 10), [fixedForm]);
  const applyDsDetail = (v) => {
    setDsDetail(v); setPage(0);
    if (v?.from && v?.to) {
      setStartDate(v.from); setEndDate(v.to); setAppliedStartDate(v.from); setAppliedEndDate(v.to); setLoaded(true);
      if (!fixedForm) { try { localStorage.setItem("dispatchDateState", JSON.stringify({ startDate: v.from, endDate: v.to, appliedStartDate: v.from, appliedEndDate: v.to })); } catch { /* 무시 */ } }
    }
  };
  const dsLongPress = useKpLongPressSelect({ toggle: toggleOne, isSelected: (id) => selected.has(id) });
  // ⭐ 2026-11-03 고정노선현황 — 평소엔 글자만, 줄을 두 번 누르면 그 줄만 수정 모드(Esc·완료로 끝)
  const [fixedEditId, setFixedEditId] = React.useState(null);
  // ⭐ 2026-11-03 수정 모드 키보드 — ←→ 이 줄의 앞·뒤 칸 · ↑↓ 위·아래 줄의 같은 칸(그 줄이 수정 모드로) · Enter 저장하고 수정 모드 끝
  const fixedRowKey = (e, id) => {
    const t = e.target;
    if (!t || t.tagName !== "INPUT" || t.type === "checkbox") return;
    if (document.querySelector("[role=listbox]")) return; // 자동완성 목록이 열려 있으면 목록 이동·선택이 먼저
    const tr = t.closest("tr");
    const ins = [...tr.querySelectorAll("input:not([type=checkbox])")];
    const k = ins.indexOf(t);
    const len = String(t.value || "").length;
    const all = t.selectionStart === 0 && t.selectionEnd === len;
    if (e.key === "Enter") { e.preventDefault(); t.blur(); setTimeout(() => setFixedEditId((cur) => (cur === id ? null : cur)), 220); return; }
    if (e.key === "ArrowRight" && (all || t.selectionStart === len) && k < ins.length - 1) { e.preventDefault(); ins[k + 1].focus(); return; }
    if (e.key === "ArrowLeft" && (all || t.selectionEnd === 0) && k > 0) { e.preventDefault(); ins[k - 1].focus(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const at = pageRows.findIndex((x) => getId(x) === id);
      const nx = pageRows[at + (e.key === "ArrowDown" ? 1 : -1)];
      if (!nx) return;
      e.preventDefault(); t.blur();
      const nid = getId(nx);
      setTimeout(() => { setFixedEditId(nid); setTimeout(() => { const el = document.getElementById(`row-${nid}`); const list = el ? [...el.querySelectorAll("input:not([type=checkbox])")] : []; (list[k] || list[0])?.focus(); }, 60); }, 200);
    }
  };
  React.useEffect(() => {
    if (!fixedEditId) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector("[role=listbox]")) setFixedEditId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fixedEditId]);

  const updateEdited = (row, key, value) =>
    setEdited((prev) => {
      // ⭐ 2026-11-02 운임규칙 — 운임구분이 있는 오더: 청구운임 → 기사운임·수수료 자동(기사운임을 고치면 수동)
      if (fareOn && (key === "청구운임" || key === "기사운임" || key === "운임구분" || key === "__reapply")) {
        const merged = { ...row, ...(prev[getId(row)] || {}) };
        const cur0 = { ...(prev[getId(row)] || {}), ...(key === "__reapply" ? {} : { [key]: value }) };
        if (merged.운임구분 || key === "운임구분") {
          const n = fareFormChange(merged, key, value, fareR.rules, { asString: false });
          Object.assign(cur0, { 운임구분: n.운임구분 || "", 기사운임: n.기사운임, 운임수동: !!n.운임수동, ...(n.운임구분수수료율 !== undefined ? { 운임구분수수료율: n.운임구분수수료율 } : {}) });
        }
        cur0.수수료 = orderProfit({ ...merged, ...cur0 }); // ⭐ 2026-11-17 지게차·특수운임(회사 지급분)까지 뺀 수수료 — 예전엔 청구 − 기사만 저장돼 정산·매출이 틀렸다
        return { ...prev, [getId(row)]: cur0 };
      }
      const cur = { ...(prev[getId(row)] || {}), [key]: value };
      if (key === "상차일" && dropFollowsPickup(value, "하차일" in cur ? cur.하차일 : row?.하차일)) cur.하차일 = value; // 🛠 2026-11-24 상차일을 하차일보다 뒤로 옮기면 하차일도 같은 날로
      if (key === "청구운임" || key === "기사운임") {
        cur.수수료 = orderProfit({ ...row, ...cur }); // ⭐ 2026-11-17 청구 − 기사 − 지게차·특수운임(회사 지급분)
      }
      return { ...prev, [getId(row)]: cur };
    });

  // ======================= 차량번호 입력 처리 (최종 안정판) =======================
  const carClearAskRef = React.useRef(new Set()); // 차량번호 지우기 확인창이 떠 있는 줄
  const handleCarInput = async (id, rawVal) => {
    const v = (rawVal || "").trim();

    // 현재 row 찾기
    const idx = dispatchData.findIndex((r) => getId(r) === id);
    if (idx === -1) return;
    const row = dispatchData[idx];

    // 값이 변경되지 않았고 이미 기사 정보가 있으면 팝업 불필요
    if (v && v.replace(/\s+/g, "") === (row.차량번호 || "").replace(/\s+/g, "") && (row.이름 || row.전화번호)) return;

    // =====================================================
    // 1️⃣ 차량번호를 "완전히 삭제"했을 때
    // =====================================================
    if (!v) {
      // ✅ 2026-11-23 저장돼 있던 차량번호를 지울 때만 묻기(사용자 요청) — 취소하면 입력칸을 원래 차량번호로
      if (String(row.차량번호 || "").trim()) {
        if (carClearAskRef.current.has(id)) return; // 묻는 창 때문에 onBlur로 한 번 더 불린 것
        carClearAskRef.current.add(id);
        const ok = await kpConfirm("수정하시겠습니까?", { okText: "저장" });
        carClearAskRef.current.delete(id);
        if (!ok) {
          setEdited((prev) => { if (!prev[id]) return prev; const { 차량번호: _a, 이름: _b, 전화번호: _c, 배차상태: _d, ...rest } = prev[id]; return { ...prev, [id]: rest }; });
          return;
        }
      }
      setDriverConfirmInfo(null);
      setDriverSelectInfo(null);
      setTimeout(() => patchDispatch(id, {
        차량번호: "",
        이름: "",
        전화번호: "",
        배차상태: "배차중",
        긴급: row.긴급 === true,
        lastUpdated: new Date().toISOString(),
      }), 150);
      return;
    }

    // 공백 제거한 차량번호 (비교용)
    const clean = v.replace(/\s+/g, "");

    // =====================================================
    // 2️⃣ 동일 차량번호 기사 검색
    // =====================================================
    const matches = drivers.filter(
      (d) =>
        String(d.차량번호 || "")
          .replace(/\s+/g, "") === clean
    );

    // =====================================================
    // 3️⃣ 기사 여러 명 → 기사 선택 팝업
    // =====================================================
    if (matches.length > 1) {
      setDriverSelectInfo({
        rowId: id,
        plate: v,
        list: matches,
        selectedDriver: null,
      });
      return;
    }

    // =====================================================
    // 4️⃣ 기사 1명 → 기사 확인 팝업
    // =====================================================
    if (matches.length === 1) {
      const grade = matches[0]?.등급 || matches[0]?.grade || "";
      if (grade === "블랙") {
        setBlackAlert(matches[0]);
      } else if (shouldShowDriverMemoAlert(matches[0])) {
        window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: matches[0] }));
      }
      setDriverConfirmInfo({
        type: "select",
        rowId: id,
        driver: matches[0],
      });
      return;
    }

    // =====================================================
    // 5️⃣ 기사 없음 → 신규 기사 등록 유도 팝업
    // ✅ 스마트검색으로 이미 이름이 세팅된 행이면 스킵
    // =====================================================
    const currentRow = dispatchData.find((r) => getId(r) === id);
    const editedRow = edited[id];
    const currentName = editedRow?.이름 || currentRow?.이름 || "";
    if (currentName.trim()) return;

    setDriverConfirmInfo({
      type: "new",
      rowId: id,
      plate: v,
    });

  };
  const _patch =
    patchDispatch ||
    ((id, patch) =>
      setDispatchData((p) =>
        p.map((r) => (getId(r) === id ? { ...r, ...patch } : r))
      ));

  const _remove =
    removeDispatch ||
    ((row) =>
      setDispatchData((p) => p.filter((r) => getId(r) !== getId(row))));

  // 🚀 자동 기사 추천 함수
  const recommendDriver = (row) => {
    const 기준상차 = row.상차지명 || "";
    const 기준하차 = row.하차지명 || "";
    const 기준톤수 = row.차량톤수 || "";

    let scoreList = drivers.map((d) => {
      let 점수 = 0;

      const 기록 = dispatchData.filter(
        (r) => r.이름 === d.이름 || r.차량번호 === d.차량번호
      );

      if (기록.some((r) => r.상차지명 === 기준상차)) 점수 += 20;
      if (기록.some((r) => r.하차지명 === 기준하차)) 점수 += 20;

      if (String(d.차량톤수) === String(기준톤수)) 점수 += 15;

      const isBusy = 기록.some((r) => r.배차상태 === "배차완료");
      if (!isBusy) 점수 += 10;

      return { ...d, 점수 };
    });

    scoreList.sort((a, b) => b.점수 - a.점수);

    const top = scoreList.slice(0, 5)
      .map(
        (d, i) =>
          `${i + 1}위) ${d.이름} (${d.차량번호}): 점수 ${d.점수}`
      )
      .join("\n");

    showAlert(`▸ 자동 기사 추천 결과\n\n${top}`);
  };
  // ================================  
  // 🔵 선택수정 / 수정완료 (팝업 방식)  
  // ================================
  const handleEditToggle = async () => {
    if (isViewer) return showAlert("조회전용 권한으로 수정할 수 없습니다.");
    // 🔐 여러 건 선택 시 경고
    if (!editMode && selected.size > 1) {
      return showAlert("⚠ 1개의 항목만 선택해주세요.\n(지금은 선택수정 모드입니다)");
    }

    // 1) 수정 모드 OFF → 선택수정 버튼 처음 누른 상태
    if (!editMode) {
      if (!selected.size) return showAlert("수정할 항목을 선택하세요.");

      const first = filtered.find((r) => selected.has(getId(r)));

if (first) {
  const latestFirst = edited[getId(first)]
    ? { ...first, ...edited[getId(first)] }
    : first;

  const cargoRaw = String(latestFirst.화물내용 || "");

  // ✅ suffix 기반 분리만 수행 (base만 파싱)
  const KNOWN_SUFFIXES = [...new Set(["파레트", "파렛트", "박스", "통", ...cpCargoTypeOptions])].sort((a, b) => b.length - a.length);
  let cargoQty = "", cargoType = "";
  const cargoRawBase = cargoRaw.split("+")[0];
  for (const s of KNOWN_SUFFIXES) {
    if (cargoRawBase.endsWith(s)) {
      cargoQty = cargoRawBase.slice(0, -s.length).trim();
      cargoType = s;
      break;
    }
  }
  // ✅ suffix 매칭 안 되면 → base를 화물수량에 보존
  if (!cargoType) {
    cargoQty = cargoRawBase;
    cargoType = "";
  }

  const tonRaw = String(latestFirst.차량톤수 || "");
  const tonMatch = tonRaw.match(/([\d.]+)(.*)/);

  setEditTarget({
    ...latestFirst,
    화물내용: cargoRaw,     // ✓ 원본 보존
    화물수량: cargoQty,     // ✓ "케이스" → "케이스" (기존: "")
    화물타입: cargoType,    // ✓ ""
    톤수값: tonMatch ? tonMatch[1] : "",
    톤수타입: tonMatch ? tonMatch[2] : "",
    수수료: (Number(latestFirst.청구운임) || 0) - (Number(latestFirst.기사운임) || 0),
  });

  setEditPopupOpen(true);
}
      return;
    }
    // 2) 전체수정 모드일 때는 기존 저장 로직 그대로 적용
    const ids = Object.keys(edited);
    if (!ids.length) {
      setEditMode(false);
      return showAlert("변경된 내용이 없습니다.");
    }

    if (!(await kpConfirm("수정된 내용을 저장하시겠습니까?"))) return;

    // 🚫 역순 날짜(하차일 < 상차일) 검사 — 하나라도 있으면 전체 저장을 막는다.
    const reversedId = ids.find(id => {
      const orig = filtered.find(r => getId(r) === id) || dispatchData.find(r => getId(r) === id);
      const p = edited[id] || {};
      const pickup = "상차일" in p ? p.상차일 : orig?.상차일;
      const drop = "하차일" in p ? p.하차일 : orig?.하차일;
      return isReversedDateOrder(pickup, drop);
    });
    if (reversedId) return showAlert(REVERSED_DATE_ORDER_MSG);

 // ================================
    //   수정완료 → 저장 로직 (백그라운드)
    // ================================
    ids.forEach(id => {
      _patch(id, edited[id]).catch(console.error);
      flashRow(id);
    });
    setJustSaved(ids);
    setEdited({});
    setEditMode(false);
    setSelected(new Set());

    if (ids.length > 0) {
      const firstId = ids[0];

      setTimeout(() => {
        const el = document.getElementById(`row-${firstId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);  // ▲ Firestore 반영 후 스크롤 이동
    }

    setTimeout(() => setJustSaved([]), 1200);
    showAlert("수정 완료되었습니다.");
  };
  // ==========================
  // 삭제 실행(되돌리기 기능 포함)
  // ==========================
  const deleteRowsWithUndo = async () => {
    const ids = [...selected];
    if (!ids.length) return;

    // 삭제될 항목 백업
    const backup = ids.map(id => dispatchData.find(r => getId(r) === id));

    const isShipperOrder = (r) => r?.source === "shipper" || r?.source === "shipper_mobile";
    if (backup.some(r => isShipperOrder(r) && !r?.취소요청)) {
      alert("화주사가 등록한 오더는 운송사에서 임의로 삭제할 수 없습니다. 화주사가 배차취소를 요청한 건만 승인 후 삭제할 수 있습니다.");
      return;
    }

    // ⭐ 사용자 요청 — 선택한 여러 건 중 이미 "운송완료"된 오더가 있으면, 건별로
    // 반복해서 묻지 않고 한번에 모아서 한 번만 확인받는다(_remove 쪽 개별 confirm은
    // skipCompletedConfirm으로 건너뛰되, 스냅샷 기록은 그대로 남김).
    const completedInBatch = backup.filter(r => r?.기사확인상태 === "완료");
    if (completedInBatch.length > 0) {
      if (!await kpConfirm(`운송이 완료된 오더가 ${completedInBatch.length}건 포함되어 있습니다. 오더를 삭제하시겠습니까?`)) return;
    }

    setBackupDeleted(backup);

    // 선택 초기화 + 팝업 닫기 + 되돌리기 버튼 표시 — 먼저 끝내고 실제 Firestore
    // 삭제는 백그라운드로 돌린다(4파트 executeDelete와 동일한 수정 — 예전엔
    // 여러 건을 하나씩 순서대로 await해서, 선택 건수만큼 지연이 쌓여 "삭제"를
    // 눌러도 한참 있다가 화면이 반응하는 버벅임의 원인이었다).
    setSelected(new Set());
    setShowDeletePopup(false);
    setUndoVisible(true);
    setTimeout(() => setUndoVisible(false), 30000);

    // ⭐ 2026-11-05 한 번에 삭제(writeBatch) + 삭제 진행 창 — 예전엔 건별 병렬 삭제라 줄이 하나씩 사라졌다
    (removeDispatch ? Promise.resolve(removeDispatch(backup.filter(Boolean), { skipCompletedConfirm: true })) : Promise.all(backup.map(row => _remove(row, { skipCompletedConfirm: true })))).catch((e) => {
      console.error("삭제 실패:", e);
      showAlert("일부 오더 삭제에 실패했습니다. 목록에서 확인해주세요.\n" + (e?.message || ""));
    });
  };


  // 🔥 금액 변환 함수 (이거 추가)
  const toMoney = (v) => {
    if (v === undefined || v === null) return 0;
    const n = Number(String(v).replace(/[^\d-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  };
  const downloadExcel = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const _sp=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p)&&p.length>0)return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length>0&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
    const _merge=(r,f1,f2)=>[..._sp(r[f1]),..._sp(r[f2])].filter(s=>s&&(s.업체명?.trim()||s.주소?.trim())).filter((s,i,a)=>{const k=s.업체명||s.주소;return a.findIndex(x=>(x.업체명||x.주소)===k)===i;});
    const _via=(list)=>list.map(s=>s.업체명||s.주소||"").filter(Boolean).join(", ");
    const _hasVia=filtered.some(r=>_merge(r,"경유상차목록","경유지_상차").length>0||_merge(r,"경유하차목록","경유지_하차").length>0);

    const rows = filtered.map((r, i) => {
      const row = {
        순번: page * pageSize + i + 1,
        ...(dsMgrMap ? { 배차담당자: orderMgrName(dsMgrMap, r) || ORDER_MGR_EMPTY } : {}),
        ...(dsBiz.multi ? { 청구사업자: bizOf(r, dsBiz.defaultName) } : {}), // ⭐ 2026-11-03 여러 사업자
        등록일: displayRegDate(r),
        상차일: r.상차일 || "",
        상차시간: r.상차시간 || "",
        하차일: r.하차일 || "",
        하차시간: r.하차시간 || "",
        거래처명: r.거래처명 || "",
        상차지명: r.상차지명 || "",
        상차지주소: r.상차지주소 || "",
      };
      if (_hasVia) row["경유 상차지"] = _via(_merge(r,"경유상차목록","경유지_상차"));
      row["하차지명"] = r.하차지명 || "";
      row["하차지주소"] = r.하차지주소 || "";
      if (_hasVia) row["경유 하차지"] = _via(_merge(r,"경유하차목록","경유지_하차"));
      Object.assign(row, {
        화물내용: mergeViaCargoText(r.화물내용, [r.경유상차목록, r.경유하차목록]) || "",
        차량종류: r.차량종류 || "",
        차량톤수: mergeViaTonnage(r.차량톤수, [r.경유상차목록, r.경유하차목록]) || "",
        차량번호: r.차량번호 || "",
        기사명: r.이름 || "",
        전화번호: r.전화번호 || "",
        배차상태: r.배차상태 || "",
        청구운임: toMoney(r.청구운임),
        기사운임: toMoney(r.기사운임),
        수수료: toMoney(r.청구운임) - toMoney(r.기사운임) - paidOut(r), // 🏗 지게차
        ...(hasSpecial(r) ? forkliftExcelCols(r) : {}), // 🏗 2026-11-09 지게차비용·지게차기사·부담·지급
        ...(fareOn ? { 운임구분: r.운임구분 || "" } : {}), // ⭐ 2026-11-02 운임규칙
        지급방식: r.지급방식 || "",
        배차방식: r.배차방식 || "",
        메모: r.메모 || "",
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });

    // Derive column letter from header name (handles variable column count)
    const colNames = Object.keys(rows[0] || {});
    const toColLetter = (name) => {
      const i = colNames.indexOf(name);
      if (i < 0) return null;
      let n = i + 1, s = "";
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };
    const dateCols = new Set(["등록일", "상차일", "하차일"].map(toColLetter).filter(Boolean));
    const moneyCols = new Set(["청구운임", "기사운임", "수수료"].map(toColLetter).filter(Boolean));

    Object.keys(ws).forEach((cell) => {
      if (cell[0] === "!") return;
      const col = cell.replace(/[0-9]/g, "");
      const rowNum = parseInt(cell.replace(/[A-Z]/g, ""), 10);

      if (dateCols.has(col)) {
        const v = ws[cell].v;
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          ws[cell].v = v;
          ws[cell].t = "s";
        }
      }

      if (moneyCols.has(col)) {
        if (rowNum === 1) return;
        const num = Number(String(ws[cell].v).replace(/[^\d-]/g, ""));
        ws[cell].v = isNaN(num) ? 0 : num;
        ws[cell].t = "n";
        ws[cell].z = "#,##0;[Red]-#,##0";
      }
    });

    ws["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "배차현황");
    saveWorkbook(XLSX, wb, `배차현황_${kstFileDate()}.xlsx`); // 🛠 2026-11-27 파일 이름 · 확장자가 빠지지 않게(src/xlsxSave.js)
  };
  // =====================
  // 🔑 거래처명 정규화 (정렬용)
  // =====================
  const normalizeClient = (s = "") =>
    String(s)
      .normalize("NFC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/주식회사|유한회사|\(주\)|㈜/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[0-9]/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  // ✅ 배차상태 우선순위 (기본정렬에서만 사용)
const getStatusRank = (s) => {
  const v = String(s || "");
  if (v === "배차중") return 0;
  if (v === "배차완료") return 1;
  if (v === "배차취소") return 2; // 항상 맨 아래로
  return 3; // 기타 상태
};

const filteredBase = React.useMemo(() => {
    // ★ focusOrderId가 있으면 해당 오더 1건만 표시
    if (focusOrderId) {
      const found = (dispatchData || []).find(d => getId(d) === focusOrderId);
      return found ? [found] : [];
    }

    // ⚡ localOverrides는 보통 비어있거나 극소수 건만 담고 있는데, 매번 전체
    // dispatchData를 map()으로 새로 순회/복사하면 오더가 많아질수록(수천~수만 건)
    // 그 자체로 무거워진다 — 실제로 override가 있을 때만 map을 수행한다.
    const hasOverrides = Object.keys(localOverrides).length > 0;
    // ⭐ dispatchData(최근 13개월 실시간)에 없는, 그보다 오래된 구간을 조회할 때만
    // 별도로 getDocs 조회해둔 extraHistoricalRows를 여기서 합친다(평소엔 빈 배열).
    // ⭐ 2026-11-06 검색·세부검색 때도 받은 목록만 — 배차현황엔 고정노선(배차표Id) 오더가 절대 섞이지 않는다(고정노선현황에서만)
    const pool = dispatchData || [];
    const baseData = extraHistoricalRows.length > 0
      ? [...pool, ...extraHistoricalRows]
      : pool;
    let data = hasOverrides
      ? baseData.map(d => {
          const id = getId(d);
          return localOverrides[id] ? { ...d, ...localOverrides[id] } : d;
        })
      : baseData;

  // 🔥 조회 버튼 누르기 전 → 전체
  if (!loaded) return data;
  // =========================
  // 📅 날짜 필터 (조회 버튼 기준)
  // =========================
  data = data.filter((r) => {
    // ⭐ 2026-11-03 고정노선현황은 입고일(시트 탭 날짜) 기준으로 조회 — 업체가 입고일로 탭을 만든다
    const date = fixedForm ? (r.입고일 || r.하차일 || r.상차일 || "") : (r.상차일 || r.상차일자 || "");
    if (!date) return false;

    if (appliedStartDate <= appliedEndDate) {
      return date >= appliedStartDate && date <= appliedEndDate;
    }

    // 🔥 12월 → 1월
    return date >= appliedStartDate || date <= appliedEndDate;
  });
  // =========================
  // 🔵 상태 칩 필터 ← ★★★ 여기에 추가 ★★★
  // =========================
  if (statusFilter === "UNASSIGNED") {
    data = data.filter(r => r.배차상태 === "배차중");
  } else if (statusFilter === "COMPLETE") {
    data = data.filter(r => r.배차상태 === "배차완료");
  } else if (statusFilter === "UNDELIVERED") {
    data = data.filter(r => (r.업체전달상태 || "미전달") !== "전달완료");
  }
  // =========================
  // 🔍 검색 필터
  // =========================
  if (q.trim()) {
    const keyword = q.toLowerCase();
    // ⭐ 2026-11-03 거래처·상차지·하차지 검색 — 정확히 같은 이름이 있으면 그것만
    const dsField = { client: "거래처명", pickup: "상차지명", drop: "하차지명" }[searchType];
    const dsNameM = dsField ? makeClientMatcher(q, data.map((r) => r[dsField])) : () => true;

    data = data.filter((r) => {
      const get = (v) => String(v || "").toLowerCase();

      switch (searchType) {
        case "client":
          return dsNameM(r.거래처명);
        case "pickup":
          return dsNameM(r.상차지명);
        case "drop":
          return dsNameM(r.하차지명);
        case "pay":
          return get(r.지급방식).includes(keyword);
        case "dispatch":
          return get(r.배차방식).includes(keyword);
        case "fare": // ⭐ 2026-11-06 운임구분(월대·일대 등)
          return get(r.운임구분).replace(/\s+/g, "").includes(keyword.replace(/\s+/g, ""));
        case "car":
          return get(r.차량번호).replace(/\s+/g, "").includes(keyword.replace(/\s+/g, ""));
        case "driver":
          return get(r.이름).includes(keyword) || get(r.기사명).includes(keyword);
        // ⭐ 2026-11-06 배차담당자(등록·배차한 직원) · 운송사(고정노선 시트 운송업체 칸)
        case "mgr":
          return dsStaffOf(r).toLowerCase().includes(keyword);
        case "carrier":
          return carrierOf(r).toLowerCase().includes(keyword);
        default:
          return (
            get(r.거래처명).includes(keyword) ||
            get(r.상차지명).includes(keyword) ||
            get(r.하차지명).includes(keyword) ||
            get(r.차량번호).includes(keyword) ||
            get(r.이름).includes(keyword) ||
            get(r.지급방식).includes(keyword) ||
            get(r.배차방식).includes(keyword) ||
            get(r.운임구분).includes(keyword) || // ⭐ 2026-11-06 통합 검색 — 운임구분(월대 → 운임구분이 월대인 오더)
            // ⭐ 2026-11-06 고정노선현황 통합 검색 — 배차담당자·운송사·기사 전화·시군구·묶음·시트 추가 칸까지
            (!!fixedForm && (
              dsStaffOf(r).toLowerCase().includes(keyword) ||
              carrierOf(r).toLowerCase().includes(keyword) ||
              get(r.전화번호).includes(keyword) ||
              get(r.하차지주소).includes(keyword) ||
              get(r.배차표묶음).includes(keyword) ||
              Object.values(r.추가정보 || {}).some((v) => get(v).includes(keyword))
            ))
          );
      }
    });
  }

// 오류오더만 보기 필터
  if (filterErrorIds !== null) {
    data = data.filter(r => filterErrorIds.includes(r._id));
  }

  // ⭐ 2026-11-02 운임규칙 — 운임구분 필터(규칙 사용 회사만)
  if (fareOn && fareTypeFilter) {
    data = data.filter(r => fareTypeFilter === "__none" ? !String(r.운임구분 || "").trim() : String(r.운임구분 || "") === fareTypeFilter);
  }
  // 🔎 2026-11-03 세부검색 — 기간은 위 날짜 조회로, 여기선 1~3차 조건만
  if (dsDetail) data = applyDetailFilter(data, dsDetail, { getters: dsDetailGet, withDate: false });
  // =========================
  // 🔽 기본 순서(머리글 정렬이 꺼져 있을 때) — 머리글 정렬은 아래 filtered 에서 따로
  // =========================
  // ⭐ 2026-11-03 고정노선현황 — 구글시트 순서 그대로(날짜 → 묶음(1센터·2센터…) → 시트 줄)
  if (fixedForm) {
    const gi = (r) => { const i = (fixedForm.groups || []).findIndex((g) => g.name === r.배차표묶음); return i < 0 ? 999 : i; };
    const inD = (r) => String(r.입고일 || r.하차일 || r.상차일 || "");
    data.sort((a, b) => inD(a).localeCompare(inD(b)) || gi(a) - gi(b)
      || (a.시트줄 ?? 1e9) - (b.시트줄 ?? 1e9) || (a.배차표순번 || 0) - (b.배차표순번 || 0));
    return data;
  }
  // ⭐ 2026-11-18 세부검색에서 같은 칸(거래처명 등)을 여러 개 고르면 고른 값별 → 날짜별로 묶어 보여 준다
  const dsGroup = dsDetail ? detailGroupOrder(dsDetail, { getters: dsDetailGet }) : null;
  data.sort((a, b) => {
    if (dsGroup) {
      const ga = dsGroup(a), gb = dsGroup(b);
      if (ga !== gb) return ga - gb;
      const da0 = String(a.상차일 || ""), db0 = String(b.상차일 || "");
      if (da0 !== db0) return db0.localeCompare(da0);
    }
    const ra = getStatusRank(a.배차상태);
    const rb = getStatusRank(b.배차상태);
    if (ra !== rb) return ra - rb;
    const da = String(a.상차일 || "");
    const db = String(b.상차일 || "");
    if (da !== db) return db.localeCompare(da);
    const ta = Number(a.updatedAt || a.createdAt || 0);
    const tb = Number(b.updatedAt || b.createdAt || 0);
    return tb - ta;
  });

  return data;
}, [
  dispatchData,
  localOverrides,
  q,
  searchType,
  dsStaffOf,
  appliedStartDate,
  appliedEndDate,
  loaded,
  statusFilter,
  focusOrderId,
  filterErrorIds,
  fareOn,
  fareTypeFilter,
  dsDetail,
  dsDetailGet,
]);
  // ⚡ 머리글 정렬은 이미 걸러진 목록만 따로 정렬 — 정렬을 눌러도 위의 날짜·검색 필터는 다시 돌지 않는다
  const dsMgrMap = useOrderStaffName(userNameMap, userCompany); // ⭐ 배차담당자 칸(회사별 기능 꺼지면 null)
  const [lookupOpen, setLookupOpen] = React.useState(false); // ⭐ 2026-11-03 담당자·차량 조회
  const lookupNameOf = React.useCallback((r) => _orderStaffNameRaw(r, userNameMap), [userNameMap]);
  const filtered = React.useMemo(() => { const base = makeOrderSortValue(dsMgrMap); const sv = fixedForm ? (r, k, i) => (k === "담당자" ? routeOwnerName(r, userNameMap) : base(r, k, i)) : base; return sortRows(filteredBase, dsSort.sort, sv); }, [filteredBase, dsSort.sort, dsMgrMap, fixedForm, userNameMap]); // ⭐ 2026-11-06 고정노선 담당자 정렬

  // ⭐⭐⭐ 페이지 데이터 (정렬된 filtered 기준)
  const pageRows = React.useMemo(() => {
    const start = page * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  }, [filtered, page]);

  // ⭐ Shift+←/→ 로 이전/다음 페이지 이동 — 목록을 스크롤해서 아래쪽까지 내려간
  // 상태에서도(위쪽 페이지 버튼까지 다시 스크롤할 필요 없이) 바로 페이지를 넘길 수
  // 있게. 입력창(텍스트/셀렉트/textarea)에 포커스가 있을 때는 그 안에서의 커서
  // 이동/브라우저 기본 동작을 방해하지 않도록 무시한다.
  React.useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
      if (e.key === "ArrowLeft") {
        setPage((p) => Math.max(0, p - 1));
      } else {
        setPage((p) => Math.min(lastPage, p + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered.length, pageSize]);

  // 화면(현재 페이지)에 보이는 순서상 그 상/하차지명이 처음 등장하는 행의 id만
  // 모아둔다 — 같은 업체가 여러 건이어도 휴게(점심시간) 아이콘이 첫 행에만 뜨게
  // 하기 위함(RestCell의 isFirst prop으로 전달, 겹침 경고는 이 dedup과 무관하게 항상 표시).
  const lunchFirstIds = React.useMemo(() => {
    const pickup = new Set(), drop = new Set();
    const seenP = new Set(), seenD = new Set();
    for (const r of pageRows) {
      const id = getId(r);
      const pk = _lunchNameKey(r.상차지명);
      if (pk && lunchByName.get(pk) && !seenP.has(pk)) { seenP.add(pk); pickup.add(id); }
      const dk = _lunchNameKey(r.하차지명);
      if (dk && lunchByName.get(dk) && !seenD.has(dk)) { seenD.add(dk); drop.add(id); }
    }
    return { pickup, drop };
  }, [pageRows, lunchByName]);

  const statusSummary = React.useMemo(() => {
    let 미배차 = 0;
    let 완료 = 0;
    let 미전달 = 0;

    filtered.forEach(r => {
      if (r.배차상태 === "배차중") 미배차++;
      if (r.배차상태 === "배차완료") 완료++;

      if ((r.업체전달상태 || "미전달") !== "전달완료") {
        미전달++;
      }
    });

    return {
      전체: filtered.length,
      미배차,
      완료,
      미전달,
    };
  }, [filtered]);


  const summary = React.useMemo(() => {
    const totalCount = filtered.length;
    // ⭐ 2026-11-17 수수료 = 줄마다 보이는 수수료의 합(청구 − 기사 − 회사가 따로 준 지게차·특수운임) — 예전엔 "청구 합 − 기사 합"이라
    //  기사 차감 지게차가 있는 오더만큼(예: 180,000 × 15건) 칩 수수료가 줄 합보다 크게 나왔다
    const t = profitTotals(filtered);
    return { totalCount, totalSale: t.sale, totalDriver: t.drv, totalFee: t.fee, totalPaid: t.paid };
  }, [filtered]);


  // ⭐ 상태 변경될 때마다 localStorage 저장
 React.useEffect(() => {
const save = {
  q,
  page,
  selected: Array.from(selected),
  edited,
  editMode,
};
  try {
    localStorage.setItem("dispatchStatusState", JSON.stringify(save));
  } catch (err) {
    console.error("DispatchStatus 상태 저장 실패", err);
  }
}, [q, startDate, endDate, appliedStartDate, appliedEndDate, page, selected, edited, editMode, extraHistoricalRows]);
  // ★ focusOrderId 하이라이트 + 스크롤
  React.useEffect(() => {
    if (!focusOrderId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`row-${focusOrderId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("row-highlight");
        setTimeout(() => el.classList.remove("row-highlight"), 3000);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [focusOrderId]);

  // 우클릭 컨텍스트 메뉴 (배차현황)
  const [contextMenuDS, setContextMenuDS] = React.useState(null);
  const [fareCertRow, setFareCertRow] = React.useState(null); // 운임정보 미리보기 대상 오더
  const [scheduleChartRows, setScheduleChartRows] = React.useState(null); // 스케줄표 대상 오더들
  const [palletSlipRows, setPalletSlipRows] = React.useState(null); // 전표발행(물류기기 이동전표) 대상 오더(들)
  const [bulkEditRows, setBulkEditRows] = React.useState(null); // 일괄수정 대상 오더들
  const [bulkLegacy, setBulkLegacy] = React.useState(false); // 🗂 2026-11-09 [운임·전달사항 상세] — 예전 일괄수정 창
  const [dateShiftRows, setDateShiftRows] = React.useState(null); // 날짜 일괄 이동 대상 오더들
  React.useEffect(() => {
    const close = () => setContextMenuDS(null);
    const onKey = (e) => {
      if (e.key === "Delete" && contextMenuDS) {
        // ⭐ 2026-11-06 고정노선현황 — 담당자가 아닌 줄이 섞여 있으면 지우지 않는다
        { const _id = getId(contextMenuDS.row); const ids = selected.has(_id) ? [...selected] : [_id]; const bad = fixedForm && (dispatchData || []).find((x) => ids.includes(getId(x)) && !frCanEdit(x)); if (bad) { setContextMenuDS(null); frLockAlert(bad); return; } }
        { const _id = getId(contextMenuDS.row); if (!selected.has(_id)) setSelected(new Set([_id])); } // ⭐ 선택한 줄 위에서 지우면 선택한 줄 전부
        setShowDeletePopup(true);
        setContextMenuDS(null);
      }
      if (e.key === "Escape") setContextMenuDS(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [contextMenuDS, selected, dispatchData, frCanEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===================== 상차 임박 경고 (Part 5) =====================
  const [dsWarningExpanded, setDsWarningExpanded] = React.useState(false);
  const dsWarningList = React.useMemo(() => {
    const now = new Date();
    // ⚡ 상차 2시간 이내인 오더만 대상이므로 상차일이 오늘이 아니면 볼 필요가 없다 —
    // 누적 오더가 많아질수록(수천~수만 건) 매번 전체를 정규식/Date 파싱하던 게
    // 무거워서, 값싼 날짜 문자열 비교로 먼저 걸러낸다.
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return dispatchData.filter(r => {
      if (r.상차일 !== todayStr) return false;
      if (r.차량번호 && String(r.차량번호).trim()) return false;
      if (!r.상차일 || !r.상차시간) return false;
      let s = String(r.상차시간).trim()
        .replace("시 ", ":").replace("시", ":").replace("분", "");
      if (/:\s*$/.test(s)) s += "00";
      const m = s.match(/(오전|오후)\s*(\d{1,2}):?(\d{2})?/);
      if (!m) return false;
      let [, ap, hh, mm] = m;
      mm = mm ?? "00";
      hh = parseInt(hh, 10);
      if (ap === "오후" && hh < 12) hh += 12;
      if (ap === "오전" && hh === 12) hh = 0;
      const t24 = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
      const dt = new Date(`${r.상차일}T${t24}:00`);
      if (isNaN(dt.getTime())) return false;
      const diff = dt.getTime() - now.getTime();
      return diff > 0 && diff <= 2 * 60 * 60 * 1000;
    });
  }, [dispatchData]);

  // ===================== 첨부현황 =====================
  const [attachStatusDSOpen, setAttachStatusDSOpen] = React.useState(false);
  const [attachStatusDSClient, setAttachStatusDSClient] = React.useState("");

  // ===================== 운임조회 (컨텍스트메뉴 Part 5) =====================
  const [ctxFare5Target, setCtxFare5Target] = React.useState(null);
  const [ctxFare5PanelOpen, setCtxFare5PanelOpen] = React.useState(false);
  const [ctxFare5Result, setCtxFare5Result] = React.useState(null);
  const [ctxFare5SortMode, setCtxFare5SortMode] = React.useState("relevance");
  const [fare5Filter, setFare5Filter] = React.useState("all");
  const [ctxNoHistory5Open, setCtxNoHistory5Open] = React.useState(false);
  const [ctxAddrSearch5Open, setCtxAddrSearch5Open] = React.useState(false);
  const [ctxAddrPickup5, setCtxAddrPickup5] = React.useState("");
  const [ctxAddrDrop5, setCtxAddrDrop5] = React.useState("");
  const [ctxAddrAllClients5, setCtxAddrAllClients5] = React.useState(false);
  const [ctxAddrResults5, setCtxAddrResults5] = React.useState([]);

  function extractAddrArea5(addr) {
    const s = String(addr || "").trim();
    if (!s) return "";
    const parts = s.split(/\s+/);
    const result = [];
    for (const p of parts) {
      if (result.length >= 2) break;
      if (/[로길]$/.test(p) || /^\d/.test(p)) break;
      result.push(p);
    }
    return result.join(" ");
  }

  function getVehicleGroup5(vehicleType) {
    const v = String(vehicleType || "");
    if (v.includes("냉장") || v.includes("냉동")) return "cold";
    if (v.includes("오토바이") || v.includes("바이크")) return "motorcycle";
    return "general";
  }

  function scoreCtxFareRow5(r, targetRow) {
    let score = 0;
    const targetCargo = String(targetRow.화물내용 || "").trim();
    const targetTonNum = getTotalTonFromOrder(targetRow) || 0;
    if (targetCargo && r.화물내용) {
      if (r.화물내용 === targetCargo) score += 100;
      else if (r.화물내용.includes(targetCargo) || targetCargo.includes(r.화물내용)) score += 50;
    }
    const rTon = getTotalTonFromOrder(r) || 0;
    const tonDiff = Math.abs(rTon - targetTonNum);
    if (tonDiff === 0 && targetTonNum > 0) score += 80;
    else if (tonDiff <= 1) score += 40;
    else if (tonDiff <= 3) score += 10;
    return score;
  }

  const handleCtxFareSearch5 = (row) => {
    const pickup = String(row.상차지명 || "").trim();
    const drop = String(row.하차지명 || "").trim();
    if (!pickup || !drop) { showAlert("상/하차지 정보가 없습니다."); return; }

    const targetGroup = getVehicleGroup5(row.차량종류);
    const targetCargo = String(row.화물내용 || "").trim();
    const targetTon = String(row.차량톤수 || "").trim();
    const targetTonTotal = getTotalTonFromOrder(row);
    const targetPalletTotal = getTotalPalletFromOrder(row);

    const _ctx5PickupStops = getRouteStops(row, "pickup");
    const _ctx5DropStops = getRouteStops(row, "drop");
    const _ctx5Same = (a, b) => a.length === b.length && a.every((n, i) => n.trim() === b[i].trim());
    const base = (dispatchData || []).filter(r => {
      if (!r.청구운임) return false;
      if (!_ctx5Same(_ctx5PickupStops, getRouteStops(r, "pickup"))) return false;
      if (!_ctx5Same(_ctx5DropStops, getRouteStops(r, "drop"))) return false;
      const rGroup = getVehicleGroup5(r.차량종류);
      return rGroup === targetGroup;
    });

    if (!base.length) {
      setCtxFare5Target(row);
      setCtxAddrPickup5(extractAddrArea5(row.상차지주소 || row.상차지명));
      setCtxAddrDrop5(extractAddrArea5(row.하차지주소 || row.하차지명));
      setCtxAddrAllClients5(false);
      setCtxAddrResults5([]);
      setCtxNoHistory5Open(true);
      return;
    }

    const scored = base.map(r => {
      const ce = fareCargoExact(targetCargo, r.화물내용, targetPalletTotal, getTotalPalletFromOrder(r));
      const cp = fareCargoPartial(targetCargo, r.화물내용, targetPalletTotal, getTotalPalletFromOrder(r));
      const tonMatch = targetTonTotal != null && getTotalTonFromOrder(r) === targetTonTotal;
      const matchLabel = getFareMatchLabel(ce, cp, tonMatch);
      return {
        ...r,
        _score: (ce ? 200 : cp ? 100 : 0) + (tonMatch ? 80 : 0),
        _match: { cargo: ce || cp, cargoExact: ce, cargoPartial: cp, ton: tonMatch, label: matchLabel },
        _time: r.updatedAt || r.등록일 || 0,
      };
    });
    scored.sort((a, b) => b._score !== a._score ? b._score - a._score : b._time - a._time);

    const fares = scored.map(r => Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")));
    setCtxFare5Target(row);
    setCtxFare5Result({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
    });
    setCtxFare5PanelOpen(true);
  };

  const handleCtxAddrSearch5 = () => {
    const row = ctxFare5Target;
    const pickupKw = ctxAddrPickup5.trim();
    const dropKw = ctxAddrDrop5.trim();
    if (!pickupKw || !dropKw) { showAlert("상차지역과 하차지역을 입력해주세요."); return; }

    const targetGroup = row ? getVehicleGroup5(row.차량종류) : "general";
    const targetClient = row ? String(row.거래처 || "").trim() : "";

    const matchDir = (pk, dk) => (dispatchData || []).filter(r => {
      if (!r.청구운임) return false;
      const rPickup = String(r.상차지명 || "") + " " + String(r.상차지주소 || "");
      const rDrop = String(r.하차지명 || "") + " " + String(r.하차지주소 || "");
      if (!rPickup.includes(pk)) return false;
      if (!rDrop.includes(dk)) return false;
      const rGroup = getVehicleGroup5(r.차량종류);
      if (rGroup !== targetGroup) return false;
      if (!ctxAddrAllClients5 && targetClient && String(r.거래처 || "").trim() !== targetClient) return false;
      return true;
    });

    // 입력한 방향으로 이력이 없으면, 상/하차 지역을 뒤바꾼 반대노선 이력도 확인한다.
    let base = matchDir(pickupKw, dropKw);
    let reversedMatch = false;
    if (!base.length) {
      base = matchDir(dropKw, pickupKw);
      reversedMatch = base.length > 0;
    }

    if (!base.length) {
      setCtxAddrResults5([]);
      showAlert("해당 조건의 운임 이력이 없습니다.");
      return;
    }

    const scored = base.map(r => ({
      ...r,
      _score: row ? scoreCtxFareRow5(r, row) : 0,
      _match: {
        cargo: row && String(row.화물내용 || "").trim() && r.화물내용 && r.화물내용.includes(String(row.화물내용 || "").trim()),
        ton: row && getTotalTonFromOrder(row) != null && getTotalTonFromOrder(r) === getTotalTonFromOrder(row),
      },
      _time: r.updatedAt || r.등록일 || 0,
      _reverseRoute: reversedMatch,
    }));
    scored.sort((a, b) => b._score !== a._score ? b._score - a._score : b._time - a._time);

    const fares = scored.map(r => Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")));
    setCtxFare5Result({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
    });
    setCtxAddrResults5(scored);
    setCtxAddrSearch5Open(false);
    setCtxFare5PanelOpen(true);
    if (reversedMatch) {
      showAlert(`"${pickupKw} → ${dropKw}" 노선 이력은 없어, 반대 노선 "${dropKw} → ${pickupKw}" 이력 ${scored.length}건을 표시합니다.`);
    }
  };

  if (!loaded) return null;

return (
    <div className="p-3 w-full">
<CustomAlert message={alertMsg} onClose={() => setAlertMsg(null)} />
{attachViewer && (
  <AttachmentViewer
    row={attachViewer}
    db={db}
    onClose={() => setAttachViewer(null)}
    isViewed={filtered.find(r => getId(r) === getId(attachViewer))?.attachViewed ?? false}
    onToggleViewed={() => { const r2 = filtered.find(r => getId(r) === getId(attachViewer)); const nextVal = !r2?.attachViewed; const aid = getId(attachViewer); setLocalOverrides(prev => ({ ...prev, [aid]: { ...(prev[aid] || {}), attachViewed: nextVal } })); updateDoc(doc(db, attachViewer.__col || "orders", aid), { attachViewed: nextVal }).catch(() => {}); }}
    onSaved={() => { const r2 = filtered.find(r => getId(r) === getId(attachViewer)); if (r2?.attachViewed) return; const aid = getId(attachViewer); setLocalOverrides(prev => ({ ...prev, [aid]: { ...(prev[aid] || {}), attachViewed: true } })); updateDoc(doc(db, attachViewer.__col || "orders", aid), { attachViewed: true }).catch(() => {}); }}
    isViewer={isViewer}
  />
)}
{liveLocViewer && <LiveLocationPopup row={liveLocViewer} onClose={() => setLiveLocViewer(null)} />}
{orderInfoRow5 && <OrderInfoModal row={orderInfoRow5} onClose={() => setOrderInfoRow5(null)} lunchByName={lunchByName} />}
{workDatesEditRow && (
  <WorkDatesEditModal
    row={workDatesEditRow}
    confirmEdit
    companyName={userCompany}
    onClose={() => setWorkDatesEditRow(null)}
    onSave={async (patch) => {
      const wid = getId(workDatesEditRow);
      const ok = await patchDispatch(wid, patch, workDatesEditRow);
      if (ok === false) return; // 역순 날짜 등 검증 실패 — 모달을 유지해 다시 고르게 한다
      setLocalOverrides(prev => ({ ...prev, [wid]: { ...(prev[wid] || {}), ...patch } }));
      setWorkDatesEditRow(null);
    }}
  />
)}
{copyPanelWorkDatesOpen && (
  <WorkDatesEditModal
    row={copyTarget}
    companyName={userCompany}
    onClose={() => setCopyPanelWorkDatesOpen(false)}
    onSave={async (patch) => {
      setCopyTarget(p => ({ ...p, ...patch }));
      setCopyPanelWorkDatesOpen(false);
    }}
  />
)}
{attachStatusDSOpen && (
  <AttachStatusPanel
    open={attachStatusDSOpen}
    onClose={() => setAttachStatusDSOpen(false)}
    initialClient={attachStatusDSClient}
    dispatchData={dispatchData}
    db={db}
    companyName={userCompany}
    isViewer={isViewer}
  />
)}
{/* ================= 거래처 신규등록 팝업 ================= */}
<NewClientModal open={newClientModalOpen} data={newClientModalData} setData={setNewClientModalData} onClose={() => setNewClientModalOpen(false)} upsertClient={upsertClient} showAlert={showAlert} formatPhone={formatPhone} zClass="z-[9999999]" />
{notificationsEnabled && blackAlert && (
  <div
    className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999]"
    tabIndex={-1}
    ref={(el) => el && setTimeout(() => el.focus(), 0)}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setBlackAlert(null); } }}
  >
    <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden">
      <div className="bg-gray-900 px-6 py-4 flex items-center gap-3">
        <h3 className="text-white text-lg font-bold">블랙 기사 알림</h3>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-2">
          <div className="flex"><span className="text-gray-500 w-16">차량번호</span><b className="ml-2">{blackAlert.차량번호}</b></div>
          <div className="flex"><span className="text-gray-500 w-16">이름</span><b className="ml-2 text-gray-800">{blackAlert.이름 || "-"}</b></div>
          <div className="flex"><span className="text-gray-500 w-16">전화번호</span><b className="ml-2">{blackAlert.전화번호 || "-"}</b></div>
          {blackAlert.메모 && <div className="flex"><span className="text-gray-500 w-16">메모</span><span className="ml-2 text-gray-700">{blackAlert.메모}</span></div>}
        </div>
        <p className="text-sm text-gray-600 text-center font-semibold">블랙 등급으로 등록된 기사입니다. 배차 시 주의하세요.</p>
      </div>
      <div className="px-6 pb-5">
        <button className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl font-bold text-sm" onClick={() => setBlackAlert(null)}><EditableText id="misc.btn.35827.확인" defaultText="확인" /></button>
      </div>
    </div>
  </div>
)}
{notificationsEnabled && memoAlert && (
  <div
    className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]"
    tabIndex={-1}
    ref={(el) => el && setTimeout(() => el.focus(), 0)}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setMemoAlert(null); } }}
  >
    <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden">
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
        <h3 className="text-white text-[15px] font-bold">기사 메모 확인</h3>
        <span className="text-white/60 text-[12px]">{memoAlert.등급 || "일반"}</span>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-2">
          <div className="flex"><span className="text-gray-500 w-16">차량번호</span><b className="ml-2">{memoAlert.차량번호}</b></div>
          <div className="flex"><span className="text-gray-500 w-16">이름</span><b className="ml-2">{memoAlert.이름 || "-"}</b></div>
          <div className="flex"><span className="text-gray-500 w-16">전화번호</span><b className="ml-2">{memoAlert.전화번호 || "-"}</b></div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <div className="text-[11px] font-semibold text-gray-500 mb-1">메모</div>
          <div className="text-[13px] text-gray-800 leading-relaxed">{memoAlert.메모}</div>
        </div>
      </div>
      <div className="px-6 pb-5">
        <button className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl font-bold text-sm" onClick={() => setMemoAlert(null)}><EditableText id="misc.btn.35856.확인" defaultText="확인" /></button>
      </div>
    </div>
  </div>
)}
{panelMemoPopupC5 && (
  <OrderMemoModal {...panelMemoPopupC5} onCancel={() => setPanelMemoPopupC5(null)} onSave={savePanelMemoC5} />
)}
{panelMemoPopupE5 && (
  <OrderMemoModal {...panelMemoPopupE5} onCancel={() => setPanelMemoPopupE5(null)} onSave={savePanelMemoE5} />
)}
{panelContactPopup5 && (() => {
  const q5 = panelContactSearch5.trim().toLowerCase();
  // (검색어에 숫자가 없으면 "".includes("")가 항상 true라 전원 노출되고, 숫자가
  // 1~2자리뿐이면 무관한 전화번호에도 우연히 걸리는 문제 방지 — 3자리 이상일 때만
  // 전화번호로도 검색)
  const q5Digits = q5.replace(/\D/g, "");
  const visible5 = panelContactPopup5.contacts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !q5 || (c.name || "").toLowerCase().includes(q5) || (q5Digits.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(q5Digits)));
  return (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]"
    tabIndex={-1}
    ref={(el) => { if (el && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; requestAnimationFrame(() => setTimeout(() => (panelContactSearchInputRef5.current || el).focus(), 0)); } }}
    onKeyDown={(e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setPanelContactActive5(i => Math.min(i + 1, visible5.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setPanelContactActive5(i => Math.max(i - 1, 0)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPanelContactActive5(i => Math.min(i + 5, visible5.length - 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPanelContactActive5(i => Math.max(i - 5, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); const c = visible5[panelContactActive5]?.c; if (c) { const key = panelContactPopup5.type === "pickup" ? "상차" : "하차"; panelContactPopup5.setter(prev => ({ ...prev, [`${key}지담당자`]: c.name || "", [`${key}지담당자번호`]: c.phone || "" })); } setPanelContactPopup5(null); }
      else if (e.key === "Escape") { e.preventDefault(); setPanelContactPopup5(null); }
      else if (e.key.length === 1 || e.key === "Backspace") { panelContactSearchInputRef5.current?.focus(); }
    }}>
    <div className="bg-white rounded-2xl shadow-2xl w-[800px] max-w-[94vw] overflow-hidden">
      <div className="bg-[#1B2B4B] px-6 py-4">
        <h3 className="text-white font-bold text-[15px]">{panelContactPopup5.type === "pickup" ? "상차지" : "하차지"} 담당자 선택</h3>
        <p className="text-white/60 text-[12px] mt-0.5">{panelContactPopup5.place.업체명} · 총 {panelContactPopup5.contacts.length}명</p>
      </div>
      <div className="px-5 pt-4">
        <input autoComplete="off"
          ref={panelContactSearchInputRef5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]"
          placeholder="담당자 이름 또는 전화번호 검색"
          value={panelContactSearch5}
          onChange={e => { setPanelContactSearch5(e.target.value); setPanelContactActive5(0); }}
        />
      </div>
      <div ref={panelContactListRef5} className="relative p-5 grid grid-flow-col grid-rows-[repeat(5,min-content)] content-start auto-cols-[210px] gap-2 overflow-x-auto max-h-[70vh]">
        {visible5.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-10 w-[210px]">검색 결과가 없습니다</div>
        )}
        {visible5.map(({ c, i }, vi) => (
          <div key={i}
            className={`rounded-lg border-2 px-2.5 py-2 cursor-pointer transition min-w-0 ${vi === panelContactActive5 ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 hover:border-gray-300"}`}
            onMouseEnter={() => setPanelContactActive5(vi)}
            onClick={() => {
              const key = panelContactPopup5.type === "pickup" ? "상차" : "하차";
              panelContactPopup5.setter(prev => ({ ...prev, [`${key}지담당자`]: c.name || "", [`${key}지담당자번호`]: c.phone || "" }));
              setPanelContactPopup5(null);
            }}>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-bold text-gray-900 text-[12px] truncate">{c.name || "-"}</span>
              <span className="text-[11px] font-bold text-gray-900 truncate">{c.phone || "-"}</span>
              {c.isPrimary && <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded-full bg-[#1B2B4B] text-white">대표</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 text-right">
        <button className="px-4 py-2 rounded-lg bg-gray-200 text-sm" onClick={() => setPanelContactPopup5(null)}><EditableText id="misc.btn.35925.취소" defaultText="취소" /></button>
      </div>
    </div>
  </div>
  );
})()}
{/* 오류오더 필터 활성 배너 */}
      {filterErrorIds !== null && (
        <div className="flex items-center gap-3 px-4 py-2 mb-2 bg-[#1B2B4B]/8 border border-[#1B2B4B]/30 rounded-xl">
          <span className="text-[#1B2B4B] font-bold text-[13px]" style={{animation: "filterBlink 1.8s ease-in-out infinite"}}>
            오류/경고 오더만 표시 중 ({filterErrorIds.length}건)
          </span>
          <button
            className="ml-auto px-3 py-1 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition"
            onClick={() => setFilterErrorIds(null)}
          >
            전체 보기로 돌아가기
          </button>
        </div>
      )}
      <style>{`
@keyframes highlightFade {
    0%   { background-color: rgba(27, 43, 75, 0.13); }
    100% { background-color: transparent; }
  }

  .row-highlight {
    animation: highlightFade 2.5s ease-out forwards !important;
    will-change: background-color;
  }

  @keyframes filterBlink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`}</style>
      <h2 className="text-lg font-bold mb-2"><EditableText id="popup.title.배차현황 폼" defaultText="배차현황" /></h2>

      {/* ===== 상차 임박 경고 배너 — 접기/펼치기 ===== */}
      {dsWarningList.length > 0 && (
        <div className="mb-3 w-fit max-w-full select-none">
          <button
            type="button"
            onClick={() => setDsWarningExpanded(v => !v)}
            className="flex items-center gap-3 bg-[#1B2B4B] text-white rounded-xl px-4 py-2 hover:bg-[#243a60] transition-colors"
          >
            <span className="tabular-nums font-extrabold text-red-300 text-[15px] min-w-[2ch] text-right">{dsWarningList.length}</span>
            <span className="text-[13px] font-semibold tracking-wide">상차 2시간 이내 미배차</span>
            <svg
              className={`w-4 h-4 ml-1 transition-transform ${dsWarningExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {dsWarningExpanded && (
            <div className="mt-1 border border-[#1B2B4B]/20 rounded-xl overflow-hidden">
              {dsWarningList.map((r, i) => (
                <div
                  key={r._id || r.id}
                  className={`flex items-center gap-3 px-4 py-2 text-[13px] ${i % 2 === 0 ? "bg-white" : "bg-[#f7f9fc]"}`}
                >
                  <span className="tabular-nums font-semibold text-[#1B2B4B] whitespace-nowrap">{r.상차일} {r.상차시간}</span>
                  <span className="text-[#1B2B4B]/30 text-[11px]">|</span>
                  <span className="text-[#1B2B4B] font-medium">{r.상차지명}</span>
                  {r.거래처명 && <span className="text-[#1B2B4B]/50 text-[12px] ml-auto whitespace-nowrap">{r.거래처명}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== KPI + 상태 칩 한 줄 ===== */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PageSizeChip count={summary.totalCount} value={pageSize} onChange={(n) => { setPageSizePref(n); setPage(0); }} />{/* 📄 2026-11-17 "총 N건"을 누르면 몇 개씩 볼지 고르기 */}
        <div className="flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm">
          <span className="text-[12px] font-medium text-gray-500">청구</span>
          <span className="text-[15px] font-extrabold text-[#1B2B4B]">{summary.totalSale.toLocaleString()}원</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm">
          <span className="text-[12px] font-medium text-gray-500">기사</span>
          <span className="text-[15px] font-extrabold text-[#1B2B4B]">{summary.totalDriver.toLocaleString()}원</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm">
          <span className="text-[12px] font-medium text-gray-500">수수료</span>
          <span className="text-[15px] font-extrabold" style={{ color: summary.totalFee < 0 ? "#2457D6" : summary.totalFee > 0 ? "#D92D20" : "#1B2B4B" }}>{summary.totalFee.toLocaleString()}원<MarginPct profit={summary.totalFee} sales={summary.totalSale} hideZero /></span>{/* ⭐ 2026-11-17 수수료율(수수료 ÷ 청구) — 플러스 빨강 · 마이너스 파랑 */}
        </div>
        {/* 구분선 */}
        <div className="w-px h-8 bg-gray-300 mx-1 shrink-0" />
        {/* 상태 필터 드롭다운 */}
        <CustomSelect
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-[34px] px-3 rounded-lg text-[12px] font-semibold border border-gray-300 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-[#1B2B4B] transition"
        >
          <option value="ALL">전체 {statusSummary.전체}</option>
          <option value="UNASSIGNED">미배차 {statusSummary.미배차}</option>
          <option value="COMPLETE">완료 {statusSummary.완료}</option>
          <option value="UNDELIVERED">미전달 {statusSummary.미전달}</option>
        </CustomSelect>
        {/* ⭐ 2026-11-05 세부검색 — 오른쪽 끝에서 상태 필터(전체/미배차/미전달) 바로 옆으로 옮김 */}
        <DetailFilterButton rows={dispatchData} value={dsDetail} onApply={applyDsDetail} getters={dsDetailGet} dateOf={dsDateOf} dateLabel={fixedForm ? "입고일 기준" : "상차일 기준"} title={fixedForm ? "세부검색 · 고정노선현황" : "세부검색 · 배차현황"} />
        <BizLegend biz={dsBiz} className="ml-1" />{/* ⭐ 2026-11-09 청구 사업자 색 범례 */}
      </div>

      {/* ===== 페이지+검색+날짜+버튼 한 줄 ===== */}
      <div className="flex items-center gap-1 flex-wrap mb-2 w-full pb-0.5">

        {/* 페이지 이동 */}
        <button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}
          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap flex-shrink-0 ${page===0?"bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed":"bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-sm"}`}>
          ◀ 이전
        </button>
        <span className="text-[11px] font-semibold text-gray-600 px-1 whitespace-nowrap flex-shrink-0">{page+1}<span className="text-gray-500"> / {Math.ceil(filtered.length/pageSize)}</span></span>
        <button disabled={(page+1)*pageSize>=filtered.length} onClick={()=>setPage(p=>p+1)}
          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap flex-shrink-0 ${(page+1)*pageSize>=filtered.length?"bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed":"bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-sm"}`}>
          다음 ▶
        </button>

{/* 날짜 — 시작일/종료일을 다 고른 뒤 검색창의 "조회"를 눌러야 실제로 필터가
            적용된다. (예전에는 날짜를 하나만 골라도 바로 필터링되어, 시작일만
            고르고 종료일을 고르는 중에도 목록이 계속 바뀌어 보였다. 조회 버튼이
            날짜용/검색어용 2개로 따로 있던 것도 혼란스러워 하나로 합쳤다.) */}
        <CustomDatePicker className="w-[150px] border border-gray-300 rounded-lg px-2 py-1.5 text-[13px] font-semibold flex-shrink-0 bg-white" value={startDate} onChange={(e)=>{setStartDate(e.target.value);}} />
        <span className="text-gray-500 text-[13px] flex-shrink-0">~</span>
        <CustomDatePicker className="w-[150px] border border-gray-300 rounded-lg px-2 py-1.5 text-[13px] font-semibold flex-shrink-0 bg-white" value={endDate} onChange={(e)=>{setEndDate(e.target.value);}} />

        {/* 검색창 (통합) — 조회 버튼이 날짜/검색어 공용이라, 날짜만 바꾸고 아직
            조회를 누르지 않은 상태면 천천히 깜빡여 클릭을 유도한다. */}
        <div className="flex items-center border-2 border-[#1B2B4B] rounded-lg overflow-hidden bg-white h-[30px] flex-shrink-0">
          <CustomSelect className="px-1 h-full text-[11px] bg-[#1B2B4B] text-white outline-none cursor-pointer"
            value={searchType} onChange={(e)=>{setSearchType(e.target.value);setQ("");setQInput("");setPage(0);}}>
            <option value="all">통합</option>
            <option value="client">거래처</option>
            <option value="pickup">상차지</option>
            <option value="drop">하차지</option>
            <option value="car">차량번호</option>
            <option value="driver">기사명</option>
            {/* ⭐ 2026-11-06 고정노선현황 — 배차담당자·운송사로도 찾기 */}
            {fixedForm && <option value="mgr">배차담당자</option>}
            {fixedForm && <option value="carrier">운송사</option>}
            <option value="pay">지급방식</option>
            <option value="dispatch">배차방식</option>
            {fareOn && <option value="fare">운임구분</option>}{/* ⭐ 2026-11-06 운임구분 필터 버튼 대신 검색 항목으로 */}
          </CustomSelect>
          <input autoComplete="off" className="px-2 h-full text-[11px] w-24 outline-none" placeholder="검색어"
            ref={qInputRef} defaultValue={qInput}
            onKeyUp={(e)=>{ if(e.key==="Enter"){ handleSearch(); } }} />
          <button
            onClick={handleSearch}
            className={`h-full px-2 text-white text-[11px] font-bold transition ${
              startDate && endDate && (startDate !== appliedStartDate || endDate !== appliedEndDate)
                ? "bg-[#1B2B4B] animate-pulse"
                : "bg-[#1B2B4B] hover:bg-[#243a60]"
            }`}
          >
            <EditableText id="status.toolbar.조회" defaultText="조회" />
          </button>
        </div>

        {/* 날짜 버튼들 */}
        <button onClick={()=>{const t=yesterdayKST();setStartDate(t);setEndDate(t);setAppliedStartDate(t);setAppliedEndDate(t);localStorage.setItem("dispatchDateState",JSON.stringify({startDate:t,endDate:t,appliedStartDate:t,appliedEndDate:t}));setQ("");setQInput("");setPage(0);}} className="px-2 py-1 rounded-lg bg-gray-500 text-white text-[11px] font-semibold whitespace-nowrap flex-shrink-0"><EditableText id="status.toolbar.어제" defaultText="어제" /></button>
        <button onClick={()=>{const t=todayKST();setStartDate(t);setEndDate(t);setAppliedStartDate(t);setAppliedEndDate(t);localStorage.setItem("dispatchDateState",JSON.stringify({startDate:t,endDate:t,appliedStartDate:t,appliedEndDate:t}));setQ("");setQInput("");setPage(0);}} className="px-2 py-1 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-semibold whitespace-nowrap flex-shrink-0"><EditableText id="status.toolbar.당일" defaultText="당일" /></button>
        <button onClick={()=>{const t=tomorrowKST();setStartDate(t);setEndDate(t);setAppliedStartDate(t);setAppliedEndDate(t);localStorage.setItem("dispatchDateState",JSON.stringify({startDate:t,endDate:t,appliedStartDate:t,appliedEndDate:t}));setQ("");setQInput("");setPage(0);}} className="px-2 py-1 rounded-lg bg-gray-500 text-white text-[11px] font-semibold whitespace-nowrap flex-shrink-0"><EditableText id="status.toolbar.내일" defaultText="내일" /></button>
        <button onClick={()=>{const{first,last}=getMonthRange();setStartDate(first);setEndDate(last);setAppliedStartDate(first);setAppliedEndDate(last);setQ("");setQInput("");setPage(0);setLoaded(true);localStorage.setItem("dispatchDateState",JSON.stringify({startDate:first,endDate:last,appliedStartDate:first,appliedEndDate:last}));}} className="px-2 py-1 rounded-lg bg-gray-500 text-white text-[11px] font-semibold whitespace-nowrap flex-shrink-0"><EditableText id="status.toolbar.전체" defaultText="전체" /></button>
        <button onClick={() => setLookupOpen(true)} title="기간 + 배차담당자 + 차량번호·기사명으로 찾기" className="px-2 py-1 rounded-lg bg-white text-[#1B2B4B] border-2 border-[#1B2B4B] text-[11px] font-black whitespace-nowrap flex-shrink-0 hover:bg-[#EEF2F8]">담당자·차량 조회</button>
  <OrderLookupModal open={lookupOpen} onClose={() => setLookupOpen(false)} rows={dispatchData} nameOf={lookupNameOf} />

        {/* 우측 버튼들 */}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
          {/* ⭐ 2026-11-05 실시간 관제 — 예전 세부검색 자리(오른쪽)로 옮김 · 고정노선현황은 위 고정노선 머리띠에 같은 버튼이 있다 */}
          {!fixedForm && <FleetLiveButton rows={filtered} size="md" />}
          {/* ⭐ 2026-11-06 [운임구분 전체] 필터 버튼은 없앴다 — 검색 항목(통합 ▾)의 "운임구분"·세부검색·통합 검색으로 찾는다 */}
          <button onClick={()=>{if(selected.size===0)return showAlert("복사할 항목을 선택하세요.");if(selected.size>1)return copySimpleList();setCopyModalOpen(true);}} className="px-2 py-1 rounded-lg bg-gray-800 text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="status.toolbar.기사복사" defaultText="기사복사" /></button>
          <button onClick={()=>{
  const selArr=[...selected];
  const selRows = filtered.filter(r => selected.has(getId(r)));
  const phones = [...new Set(selRows.map(r => String(r.전화번호||"").replace(/[^\d]/g,"")).filter(Boolean))];
  if (phones.length === 0) {
    // 배차완료(전화번호 있는) 오더를 체크하지 않았으면 기존 동작 그대로 — 클립보드 복사만.
    const selRow=selArr.length===1?filtered.find(r=>getId(r)===selArr[0]):null;
    const url=selRow?withCo(`${window.location.origin}/driver-upload?date=${encodeURIComponent(selRow.상차일||"")}&vehicle=${encodeURIComponent((selRow.차량번호||"").replace(/\s/g,""))}&name=${encodeURIComponent((selRow.이름||"").trim())}`):withCo(`${window.location.origin}/driver-upload`);
    const msg=`[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n여기를 눌러 업로드해주세요\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
    navigator.clipboard.writeText(msg).then(()=>showAlert("업로드 안내 메시지가 복사되었습니다.\n기사에게 붙여넣기로 전달하세요.")).catch(()=>showAlert(`링크: ${url}`));
    return;
  }
  // 배차완료된 오더를 1건 이상 체크한 상태 — 여러 기사에게 한 번에 문자로 보낼지 확인.
  const url = withCo(`${window.location.origin}/driver-upload`);
  const msg=`[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n여기를 눌러 업로드해주세요\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
  setBulkUploadConfirm5({ phones, body: msg });
}} className="px-2 py-1 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="status.toolbar.업로드링크" defaultText="업로드링크" />{selected.size>1?` (${selected.size})`:""}</button>
          {bulkChooserOpen && (
            <BulkUploadChooser
              onClose={() => setBulkChooserOpen(false)}
              templateTips={['시간은 "오전 9시", "오후 3시 30분"', "차량번호·기사명·전화번호 입력 시 배차완료", "같은 날 여러 번 도는 노선은 '회전' 칸에 횟수"]}
              uploadTips={["빈 줄은 자동으로 건너뜀", "수수료(청구-기사운임) 자동 계산", "회전 3 → 그 날짜에 오더 3건(1/3 ~ 3/3회차)"]}
              onTemplate={() => { downloadBulkTemplate(); }}
              onFile={(e) => { setBulkChooserOpen(false); handleBulkFile(e); e.target.value = ""; }}
            />
          )}
          <button className="px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap" onClick={()=>{if(!selected.size)return showAlert("삭제할 항목이 없습니다.");{const bad=fixedForm&&(dispatchData||[]).find((x)=>selected.has(getId(x))&&!frCanEdit(x));if(bad)return frLockAlert(bad);}setShowDeletePopup(true);}}><EditableText id="status.toolbar.선택삭제" defaultText="선택삭제" /></button>
          {/* 🗓 2026-11-27 이월 오더 일괄 지정 — 고른 오더의 마감월(청구할 달)을 익월 · 고른 달 · 비우기로 한 번에 */}
          {!isViewer && selected.size > 0 && <button type="button" data-kp="status-carry" title="고른 오더의 마감월(청구할 달)을 한 번에 정해요(예: 10/31 상차 → 11월 청구)" className="px-2 py-1 rounded-lg bg-white border border-[#C9D6EE] text-[#1B2B4B] text-[11px] font-semibold shadow hover:bg-[#EEF3FC] whitespace-nowrap"
            onClick={() => askCarryMonth(filtered.filter((r) => selected.has(getId(r))), {
              isLocked: (o) => !carryBypass && isLockedOrder(o, carryDesk.closes),
              save: (o, patch) => patchDispatch(getId(o), { ...patch, ...(o.__col ? { __col: o.__col } : {}) }, o),
            })}>마감월 지정 ({selected.size})</button>}
          <button className="px-2 py-1 rounded-lg bg-gray-300 text-gray-800 text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap" onClick={()=>setSelected(new Set())}><EditableText id="status.toolbar.선택초기화" defaultText="선택초기화" /></button>
          {/* 🧰 2026-11-23 툴바 정리 — [대용량 업로드](관리자 · 최고관리자만) + [엑셀다운] → [엑셀 관리] */}
          <ToolMenuButton label="엑셀 관리" testId="status-excel-menu" menuTitle="엑셀로 가져오기 · 내보내기" minWidth={250}
            className="h-auto px-2 py-1 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap" items={[
            { key: "down", label: "엑셀 다운로드", desc: "지금 목록을 엑셀로 받아요", onClick: downloadExcel },
            { key: "bulk", label: "대용량 업로드", desc: "엑셀로 오더를 한꺼번에 등록해요(양식 받기 포함 · 관리자 전용)", hidden: !(role === "admin" || role === "totalMaster"), onClick: () => setBulkChooserOpen(true) },
          ]} />
          {/* 🧹 2026-11-16 일마감 버튼은 뺐다(사용자 요청) — 마감은 배차현황 › 월 마감에서 */}
        </div>
      </div>

      {/* ★ 포커스 해제 버튼 */}
      {focusOrderId && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={clearFocusOrder}
            className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow hover:bg-orange-600 transition"
          >
            ← 전체 목록으로 돌아가기
          </button>
          <span className="text-sm text-gray-500">현재 선택된 오더 1건만 표시 중</span>
        </div>
      )}

      {/* ---------------- 테이블 ---------------- */}
      <div>
      <div ref={dsTableWrapRef} className="kp-grid rounded-xl shadow border border-gray-200 overflow-x-auto">

  <table className="w-full min-w-max table-auto">
          <thead className="bg-[#1B2B4B]">
            <tr>
              {(fixedForm ? fixedHeaderOf(fixedForm) : [
                "선택", "순번", ...(dsMgrMap ? ["배차담당자"] : []), "등록일", "상차일", "상차시간", "하차일", "하차시간",
                "거래처명", "상차지명", "상차지주소", "하차지명", "하차지주소",
                "화물내용", "차량종류", "차량톤수", "혼적", "차량번호", "기사명", "전화번호",
               "배차상태", "청구운임", "기사운임", "수수료", ...(fareOn ? ["운임구분"] : []), "지급방식", "배차방식", "메모", "전달사항", "첨부", ...(payOn ? ["정산"] : []), "전달상태",

              ]).map((h) => {
                return (
                <SortTh key={h} k={h === "선택" ? "" : h} sort={dsSort.sort} onSort={dsOnSort} data-frs={dsFixedLook?.get(h) || undefined}
                  className="px-3 py-3 text-center text-[14px] font-bold text-white whitespace-nowrap border-b border-white/10 border-r border-r-white/10 last:border-r-0"
                >
                  {h === "선택" ? (
                    <input autoComplete="off"
                      type="checkbox"
                      onChange={() => toggleAll(filtered)}
                      checked={filtered.length && filtered.every((r) => selected.has(getId(r)))}
                    />
                  ) : (
                    <EditableText id={`status.table.header.${h}`} defaultText={h} />
                  )}
                </SortTh>
                );
              })}
            </tr>
          </thead>

          <tbody {...dsLongPress.tbodyProps} className={dsLongPress.selectMode ? "kp-select-mode" : ""}>
          <PlateSuggestCtx.Provider value={plateSuggestCtx}>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={29} className="py-16 text-center text-[13px] text-gray-500">
                  조회된 결과가 없습니다.
                </td>
              </tr>
            )}
            {pageRows.map((r, i) => {
  const id = getId(r);
  const row = edited[id] ? { ...r, ...edited[id] } : r;
  const fee = toInt(row.청구운임) - toInt(row.기사운임) - paidOut(row); // 🏗 지게차

  const editableKeys = [
    "상차일", "상차시간", "하차일", "하차시간",
    "거래처명", "상차지명", "상차지주소",
    "하차지명", "하차지주소", "화물내용", "차량종류",
    "차량톤수", "지급방식", "배차방식", "메모", "청구운임", "기사운임",
  ];

  // ⭐ 2026-11-03 고정노선현황 — 시트 열 순서의 칸(바로 고치기) · 오른쪽 클릭 메뉴(기사복사 등)·두 번 누르면 오더복사/수정 패널은 배차현황과 같다
  // ⭐ 2026-11-06 담당자가 아니면(마스터 제외) 이 줄은 잠금 — 글자만 보이고 두 번 눌러도 수정 모드가 안 열린다
  const frLocked = !!fixedForm && !isViewer && !frCanEdit(row);
  if (fixedForm) return (
    <tr key={id} id={`row-${id}`} data-lock={frLocked ? "1" : undefined}
      onContextMenu={(e) => { e.preventDefault(); const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1; setContextMenuDS({ x: e.clientX / _z, y: e.clientY / _z, row: r }); }}
      onDoubleClick={() => { if (isViewer) return; if (frLocked) { frLockAlert(row); return; } setFixedEditId((cur) => (cur === id ? null : id)); }}
      onKeyDownCapture={fixedEditId === id ? (e) => fixedRowKey(e, id) : undefined}
      data-gstart={i > 0 && (String(pageRows[i - 1]?.배차표묶음 || "") !== String(r.배차표묶음 || "") || String(pageRows[i - 1]?.상차일 || "") !== String(r.상차일 || "")) ? "1" : undefined}
      title={fixedEditId === id ? "수정 중: ←→ 칸 이동 · ↑↓ 위아래 줄 · Enter 저장하고 끝내기 · Esc 끝내기" : isViewer ? undefined : frLocked ? `🔒 ${ROUTE_LOCK_MSG}${routeOwnerName(row, userNameMap) ? ` (담당: ${routeOwnerName(row, userNameMap)})` : ""}` : "두 번 누르면 이 줄을 수정할 수 있어요"}
      style={urgentRowStyle(row, {}, { tint: fixedEditId !== id && !selected.has(id) })}
      className={`kp-frs-row transition-colors ${fixedEditId === id ? "bg-[#EEF4FF] outline outline-2 -outline-offset-2 outline-[#2D4C82]" : selected.has(id) ? "bg-blue-50" : !String(row.차량번호 || "").trim() && row.배차상태 !== "배차취소" ? "bg-[#FFFAF2] hover:bg-[#FFF3E0]" : i % 2 === 0 ? "bg-white hover:bg-[#F5F8FD]" : "bg-[#FAFBFD] hover:bg-[#F5F8FD]"}`}>
      <td className="px-3 py-2 text-center border-b border-[#E9EDF4] border-r border-r-[#F1F4F9]"><input autoComplete="off" type="checkbox" checked={selected.has(id)} onChange={() => toggleOne(id)} /></td>
      <td className="px-3 py-2 text-[13.5px] font-bold text-[#5B6B85] text-center border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] tabular-nums">
        {fixedEditId === id
          ? <button type="button" onClick={(e) => { e.stopPropagation(); setFixedEditId(null); }} className="h-7 px-2 rounded-lg bg-[#1B2B4B] text-white text-[11.5px] font-black whitespace-nowrap">완료</button>
          : <span className="inline-flex items-center gap-1">{(page * pageSize) + i + 1}{frLocked && <svg data-kp="frs-lock" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9AA9C3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={ROUTE_LOCK_MSG}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>}</span>}
      </td>
      <FixedOwnerCell row={row} nameMap={userNameMap} />{/* ⭐ 2026-11-06 순번 다음 담당자 */}
      <FixedRouteCells form={fixedForm} row={row} drivers={drivers} clients={clients} disabled={isViewer || frLocked} editing={fixedEditId === id && !frLocked} onPatch={(patch) => patchDispatch(id, patch)} />
    </tr>
  );

  return (
    <tr
      key={id}
      id={`row-${id}`}
      onContextMenu={(e) => { e.preventDefault(); const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1; setContextMenuDS({ x: e.clientX / _z, y: e.clientY / _z, row: r }); }}
      onDoubleClick={() => {
  const rawCargo = String(row.화물내용 || "");

  // ✅ suffix 기반 분리만 수행
  const KNOWN_S = ["파레트","파렛트","박스","통"];
  let _cNum = "", _cType = "";
  for (const s of KNOWN_S) {
    if (rawCargo.endsWith(s)) {
      _cNum = rawCargo.slice(0, -s.length).trim();
      _cType = s;
      break;
    }
  }
  // ✅ suffix 매칭 안 되면 → 원본 전체를 화물수량에 보존
  if (!_cType) {
    _cNum = rawCargo;
    _cType = "";
  }

  const rawTon = String(row.차량톤수 || "");
  const tonMatch = rawTon.match(/([\d.]+)(.*)/);

  setCopyTarget({
    ...row,
    화물내용: rawCargo,     // ✓ 원본 보존
    화물수량: _cNum,        // ✓ "케이스" → "케이스" (기존: "")
    화물타입: _cType,       // ✓ ""
    톤수값: tonMatch ? tonMatch[1] : "",
    톤수타입: tonMatch ? tonMatch[2] : "",
  });

  setCopyPanelOpen(true);
}}

      className={`cursor-pointer select-none transition-[background-color,border-color,opacity] duration-300 ${fadingIds.has(id) ? "opacity-0" : "opacity-100"} ${justMovedIds.has(id) ? "row-highlight" : ""} ${
        selected.has(id)
          ? "bg-blue-50 hover:bg-blue-100"
          : isUrgentOrder(r) // ⭐ 2026-11-06 긴급은 상태와 상관없이
          ? "bg-red-50 border-l-2 border-l-red-400 hover:bg-red-100"
          : i % 2 === 0
          ? "bg-white hover:bg-blue-50"
          : "bg-gray-50 hover:bg-blue-50"
      }`}
     style={urgentRowStyle(r, String(row.운행유형||"").trim() === "왕복" ? { backgroundColor: "#e8f4fd", borderLeft: "4px solid #1B2B4B" } : {}, { tint: !selected.has(id) })}
    >
      <td className="px-3 py-3 text-center border-b border-gray-200 border-r border-r-gray-100 last:border-r-0">
        <input autoComplete="off"
          type="checkbox"
          checked={selected.has(id)}
          onChange={() => toggleOne(id)}
        />
      </td>

      <td className="px-3 py-3 text-[14px] font-medium text-gray-800 text-center border-b border-gray-200 border-r border-r-gray-100 whitespace-nowrap"
        {...(dsBiz.multi ? bizStripeProps(bizColorOf(dsBiz, bizOf(row, dsBiz.defaultName)), bizOf(row, dsBiz.defaultName)) : {})}>{/* ⭐ 2026-11-09 청구 사업자 = 왼쪽 색 막대 */}
        {(page * pageSize) + i + 1}
      </td>
      {dsMgrMap && (() => { const mn = orderMgrName(dsMgrMap, row); return (
        <td className="px-3 py-3 text-[14px] font-medium text-gray-800 text-center border-b border-gray-200 border-r border-r-gray-100 whitespace-nowrap">
          <MgrBadge row={row} name={mn} empty={ORDER_MGR_EMPTY} />
        </td>
      ); })()}

      <td className="px-3 py-3 text-[14px] font-medium text-gray-800 text-center border-b border-gray-200 border-r border-r-gray-100 whitespace-nowrap overflow-visible">
  <HoverInfoTrigger
    className="underline decoration-dotted underline-offset-2 cursor-default"
    label={displayRegDate(row) || "-"}
    tooltipRows={<>
      <div>등록시간: <span className="text-yellow-300">{_fmtKst(row.createdAt || row.등록일시 || row.등록시간 || (row.등록일 && `${row.등록일}T00:00:00`))}</span></div>
      <div>마지막수정: <span className="text-green-300">{_fmtKst(row.updatedAt || row.lastUpdated)}</span></div>
      <div>배차한시간: <span className="text-purple-300">{row.배차확정일시 ? _fmtKst(row.배차확정일시) : "-"}</span></div>
      {row.배차확정자 && <div>배차한사람: <span className="text-purple-300">{row.배차확정자}</span></div>}
      <div>등록자: <span className="text-blue-300">{_creatorLabel(row, userNameMap)}</span></div>
      <div>등록기기: <span className="text-orange-300">{row.등록기기 || "-"}</span></div>
    </>}
  />
</td>

                  {/* -------------------- 반복 입력 컬럼 -------------------- */}
{[
  "상차일", "상차시간", "하차일", "하차시간",
  "거래처명", "상차지명", "상차지주소",
  "하차지명", "하차지주소",
  "화물내용", "차량종류", "차량톤수",
].map((key) => (
  <td
    key={`${id}-${key}`}
    className="px-3 py-3 text-[14px] font-medium text-gray-800 text-center border-b border-gray-200 border-r border-r-gray-100 last:border-r-0 whitespace-nowrap"
  >

    {/* ✅ 차량종류 즉시변경 드롭다운 — 화주사 오더는 최고관리자만 변경 가능 */}
    {key === "차량종류" && (row.source === "shipper" || row.source === "shipper_mobile") ? (
      <span className="font-extrabold text-[#1B2B4B]">{row.차량종류 || "-"}</span>

    ) : key === "차량종류" ? (
      <VehicleTypePicker className="border rounded px-1 py-0.5 w-full text-center font-extrabold text-[#1B2B4B]" value={row.차량종류 || ""} ton={row.차량톤수 || ""} onTon={(v) => handleImmediateSelectChange(row, "차량톤수", v)} base={["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이", "기타"]} placeholder="선택없음" noneLabel="선택없음" onChange={(__v) => ((e) =>
          handleImmediateSelectChange(row, "차량종류", e.target.value))({ target: { value: __v } })} />

    ) : key === "상차지주소" || key === "하차지주소" ? (
      <AddressCell text={row[key] || ""} max={5} />

    ) : editMode && selected.has(id) && editableKeys.includes(key) && !(row.source === "shipper" || row.source === "shipper_mobile") ? (
      <div className="relative w-full">
        <input autoComplete="off"
          className="border rounded px-1 py-0.5 w-full text-center"
          defaultValue={row[key] || ""}
          onChange={(e) => {
            updateEdited(row, key, e.target.value);
          }}
        />
      </div>

   ) : key === "상차지명" ? (
  <div className="inline-flex items-center gap-1">
    <AddressCell text={row.상차지명} max={8} popupTitle="상차지명 전체보기" />
    {String(row.운행유형 || "").trim() === "왕복" && <RoundTripBadge />}<RotationBadge order={row} />
    {(() => {
      const _s=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p)&&p.length>0)return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length>0&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
      const list=[..._s(row.경유상차목록),..._s(row.경유지_상차)]
        .filter(s=>s&&(s.업체명?.trim()||s.주소?.trim()))
        .filter((s,i,arr)=>{const k=s.업체명||s.주소;return arr.findIndex(x=>(x.업체명||x.주소)===k)===i;});
      return list.length>0?<StopBadge count={list.length} list={list} type="pickup" confirmEdit onSave={(newList)=>patchDispatch(row._id,{경유상차목록:newList,경유지_상차:newList,경유지상차:newList,__col:row.__col})} placeRows={placeRows} timeOptions={timeOptions} orderDate={row.상차일||""}/>:null;
    })()}
  </div>

) : key === "하차지명" ? (
  <div className="inline-flex items-center gap-1">
    <AddressCell text={row.하차지명} max={8} popupTitle="하차지명 전체보기" />
    {(() => {
      const _s=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p)&&p.length>0)return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length>0&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
      const list=[..._s(row.경유하차목록),..._s(row.경유지_하차)]
        .filter(s=>s&&(s.업체명?.trim()||s.주소?.trim()))
        .filter((s,i,arr)=>{const k=s.업체명||s.주소;return arr.findIndex(x=>(x.업체명||x.주소)===k)===i;});
      return list.length>0?<StopBadge count={list.length} list={list} type="drop" confirmEdit onSave={(newList)=>patchDispatch(row._id,{경유하차목록:newList,경유지_하차:newList,경유지하차:newList,__col:row.__col})} placeRows={placeRows} timeOptions={timeOptions} orderDate={row.하차일||""}/>:null;
    })()}
  </div>

) : key === "상차시간" ? (
  <span className="font-extrabold text-[#1B2B4B]">
    {row.상차시간
      ? fmtDispatchTime(row.상차시간, row.상차시간기준 || row.상차시간구분)
      : "즉시"}
  </span>

) : key === "하차시간" ? (
  <span className="font-extrabold text-[#1B2B4B]">
    {row.하차시간
      ? fmtDispatchTime(row.하차시간, row.하차시간기준 || row.하차시간구분)
      : "즉시"}
  </span>

) : key === "화물내용" ? (() => {
  // 중복 필드 참조로 인한 중복 합산 방지: 실시간배차현황과 동일하게 dedup 처리
  const parseDedup = (fields) => {
    const seen = new Set();
    return fields.flatMap(f => _parseWaypointList(f)).filter(s => {
      if (!s || typeof s !== "object" || (!s.업체명?.trim() && !s.주소?.trim())) return false;
      const k = s.업체명 || s.주소 || JSON.stringify(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const pickupStops = parseDedup([row.경유상차목록, row.경유지_상차, row.경유지상차]);
  const dropStops   = parseDedup([row.경유하차목록, row.경유지_하차, row.경유지하차]);
  const text = mergeViaCargoText(row.화물내용, [pickupStops, dropStops]) || row.화물내용 || "";
  // ⭐ 화물내용이 길면 칸이 커지는 대신 7글자로 자르고 "더보기"로 팝업 확인
  return <AddressCell text={text} max={7} valueClassName="font-extrabold text-[#1B2B4B]" />;
})()
: key === "차량톤수" ? (() => {
  const parseDedup = (fields) => {
    const seen = new Set();
    return fields.flatMap(f => _parseWaypointList(f)).filter(s => {
      if (!s || typeof s !== "object" || (!s.업체명?.trim() && !s.주소?.trim())) return false;
      const k = s.업체명 || s.주소 || JSON.stringify(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const pickupStops = parseDedup([row.경유상차목록, row.경유지_상차, row.경유지상차]);
  const dropStops   = parseDedup([row.경유하차목록, row.경유지_하차, row.경유지하차]);
  return <span className="font-extrabold text-[#1B2B4B]">{mergeViaTonnage(row.차량톤수, [pickupStops, dropStops]) || row.차량톤수 || ""}</span>;
})() : key === "상차일" || key === "하차일" ? (() => {
  const rowWorkDates = key === "상차일" ? _parseWorkDates(row.근무일자목록) : [];
  const isMultiWork = rowWorkDates.length > 1;
  return (
    <span className="inline-flex items-center gap-1">
      {/* ⭐ 상차일은 바로 옆 등록일과 구분이 잘 안 간다는 피드백으로 하차일보다 한 단계 더 키운다. */}
      <span className={`font-extrabold ${isMultiWork ? "text-red-600" : "text-[#1B2B4B]"} text-[15.5px]`}>{row[key] || ""}</span>
      {/* ⭐ 복수근무일(묶음) 오더 — 연속 기간이 아니라 특정 날짜들만 골라 1개의
          오더로 등록된 경우, 상차일 칸을 빨간 글씨 + 검은 뱃지로 표시. 클릭하면 전체
          근무일 목록을 볼 수 있게 오더정보(우클릭 메뉴)로 유도하는 툴팁을 붙인다. */}
      {isMultiWork && (
        <span
          className="bg-black text-white text-[10px] font-extrabold rounded px-1 py-0.5 leading-none shrink-0"
          title={`묶음 오더 · 근무일 ${rowWorkDates.length}일: ${rowWorkDates.map(d => d.slice(5).replace("-", "/")).join(", ")}\n(우클릭 → 오더정보에서 전체 확인)`}
        >
          묶음 {rowWorkDates.length}일
        </span>
      )}
    </span>
  );
})() : key === "거래처명" && isUrgentOrder(row) ? (
  /* ⭐ 2026-11-06 긴급 알약 */
  <span className="inline-flex items-center gap-1 whitespace-nowrap"><UrgentBadge row={row} />{payOn && String(row[key] || "").length > 10 ? <AddressCell text={row[key]} max={10} popupTitle="거래처명" /> : row[key]}</span>
) : key === "거래처명" && payOn && String(row[key] || "").length > 10 ? (
  /* 💳 2026-11-11 거래처명이 10자를 넘으면 더보기 */
  <AddressCell text={row[key]} max={10} popupTitle="거래처명" />
) : (
  row[key]
)}
  </td>
))}

                  {/* 혼적 여부(Y) */}
                 <td className="px-3 py-3 text-[14px] text-center border-b border-gray-200 border-r border-r-gray-100">
                    {row.혼적 ? "Y" : ""}
                  </td>

                  {/* 차량번호(항상 활성화) · ⭐ 2026-11-05 지입·직영·임대 기사앱 LIVE 표시가 붙으면 그만큼 칸이 넓어진다 */}
                  <td className="border text-center whitespace-nowrap w-[160px] max-w-[160px] relative">
                    {/* 🛠 2026-11-26 LIVE 점은 기사명 칸으로 옮김 */}
                    {/* 🛠 2026-11-23 추천 기사 ▾ 를 차량번호 칸 "안" 오른쪽 끝에(글자와 겹치지 않게 칸을 조금 넓힘) — 테두리는 바깥 상자가 그린다 */}
                    <div className="mx-auto flex items-center border rounded bg-white w-[154px] pr-0.5 focus-within:border-[#1B2B4B] focus-within:ring-1 focus-within:ring-[#1B2B4B]/30">
                    <input autoComplete="off"
                      className="flex-1 min-w-0 !border-0 !shadow-none bg-transparent px-1 py-0.5 text-center focus:outline-none"
                      value={row.차량번호 || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const isEmpty = v.trim() === "";
                        setEdited(prev => ({
                          ...prev,
                          [id]: {
                            ...(prev[id] || {}),
                            차량번호: v,
                            ...(isEmpty && { 이름: "", 전화번호: "", 배차상태: "배차중" }),
                          }
                        }));
                      }}
                      onFocus={(e) => { e.currentTarget.dataset.origVal = e.currentTarget.value; }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCarInput(id, e.target.value);
                      }}
                      onBlur={(e) => {
                        if (driverConfirmInfo || driverSelectInfo || memoAlert || blackAlert) return;
                        if (e.currentTarget.value === (e.currentTarget.dataset.origVal ?? "")) return;
                        handleCarInput(id, e.target.value);
                      }}
                    />
                    <PlateSuggestCaret order={row} />{/* 🚚 추천 기사 ▾ — 있을 때만 · 직접 입력은 그대로 */}
                    </div>
                  </td>
                  <td className="border text-center whitespace-nowrap max-w-[80px] w-[80px] overflow-hidden" title={row.이름 || ""}><span className="inline-flex items-center max-w-full align-middle"><span className="truncate">{row.이름}</span>{row.배차상태 === "배차완료" && <LiveDriverChip order={row} variant="dot" />}</span></td>
                  <td className="border text-center">
  {formatPhone(row.전화번호)}
</td>

                 <td className="border text-center">
                  <div className="relative inline-block">
                    {row.화주사확인대기 ? (
                      <button
                        onClick={async () => {
                          if (isViewer) return;
                          if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // ✅ 2026-11-23 한 번 묻기
                          // localOverrides를 직접 갱신해 클릭 즉시 뱃지가 바뀌도록 한다
                          // (dispatchData 갱신만 기다리면 반영까지 지연이 느껴졌다)
                          setLocalOverrides(prev => ({ ...prev, [row._id]: { ...(prev[row._id] || {}), 화주사확인대기: false, 배차중전환일시: Date.now() } }));
                          patchDispatch(row._id, { 화주사확인대기: false, 배차중전환일시: Date.now(), __col: row.__col });
                        }}
                        title="클릭 시 배차중으로 전환"
                        className="px-3 py-1 rounded-lg text-[13px] font-bold whitespace-nowrap bg-sky-500 text-white hover:bg-sky-600 transition"
                        style={{ animation: "shipperReqBlink 1.4s ease-in-out infinite" }}
                      >
                        {isRecentShipperEdit(row) ? "수정" : "배차요청"}
                      </button>
                    ) : (
                      <RichStatusBadge
                        s={row.배차상태}
                        urgent={row.긴급}
                        cancelReq={row.취소요청 && row.배차상태 !== "배차취소"}
                        editReq={row.수정요청 || isRecentShipperEdit(row)}
                        onCancelClick={(e) => { e.stopPropagation(); setCancelReqPopup(row); }}
                        onEditClick={(e) => { e.stopPropagation(); if (row.수정요청) markEditRequestSeen(row); setEditReqPopup(row); }}
                      />
                    )}
                    <DriverAckChip row={row} className="ml-1" hideAccept />{/* ⭐ 2026-11-05 기사앱 수락/거절 · 2026-11-10 수락 칩은 숨김(거절만) */}
                  </div>
                  </td>

                  {/* 금액 */}
                  {["청구운임", "기사운임"].map((key) => (
                    <td key={key} className="border text-right pr-2 relative">
                      {editMode && selected.has(id) ? (
                        <input autoComplete="off"
                          className="border rounded px-1 py-0.5 w-full text-right"
                          {...(fareOn && key === "기사운임" ? { value: String(toInt(row[key])) } : { defaultValue: toInt(row[key]) })}
                          onChange={(e) => updateEdited(row, key, e.target.value)}
                        />
                      ) : (
                        <>{toInt(row[key]).toLocaleString()}{key === "기사운임" && <ForkliftMark row={row} />}<FareChangeMark row={row} k={key} /></>
                      )}
                    </td>
                  ))}

                <td className="border text-right pr-2">
                    {/* 📑 2026-11-15 손실(음수)이면 눌러서 손실 사유 적기 — 팀 실적 보고서 리스크 점검에 들어간다(src/lossReason.js) */}
                    {fee < 0 && !isViewer ? (
                      <button type="button" onClick={() => editLossReason(row, fee, (v) => patchDispatch(r._id || id, { 손실사유: v, ...(r.__col ? { __col: r.__col } : {}) }))}
                        title={lossReasonOf(row) ? `손실 사유: ${lossReasonOf(row)}` : "눌러서 손실 사유 적기"} className="font-bold text-[#2D6BE0] underline decoration-dotted underline-offset-2 hover:text-[#1E4FB0]">{/* ⭐ 2026-11-17 손실(마이너스)은 파랑 */}
                        {fee.toLocaleString()}{row.손실사유 ? <span className="ml-1 text-[10.5px] no-underline px-1 rounded bg-red-50 border border-red-200">사유</span> : null}
                      </button>
                    ) : <span className={`font-bold ${profitCls(fee, "text-gray-500")}`}>{fee.toLocaleString()}</span>}{/* ⭐ 2026-11-17 플러스 빨강 · 마이너스 파랑 */}
                  </td>
                  {/* ⭐ 2026-11-02 운임규칙 — 운임구분 열(규칙 사용 회사만) */}
                  {fareOn && (
                    <td className="border text-center px-1 whitespace-nowrap" data-fare-cell="1">
                      {editMode && selected.has(id) ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <FareTypeSelect compact rules={fareR.rules} value={row.운임구분 || ""} onChange={(v) => updateEdited(row, "운임구분", v)} />
                          <FareRuleHint form={row} rules={fareR.rules} onReapply={() => updateEdited(row, "__reapply", null)} />
                        </div>
                      ) : (row.운임구분 ? <span className="inline-block whitespace-nowrap px-1.5 py-[1px] rounded bg-[#EAF0FB] text-[#2D4C82] text-[12.5px] font-extrabold">{row.운임구분}{row.운임수동 ? " ·수동" : ""}</span> : <span className="text-gray-300">-</span>)}
                    </td>
                  )}

                  {/* 지급 / 배차 방식 — 화주사 오더의 지급방식은 화주사만 변경 가능 */}
                  <td className="border text-center">
                    {(row.source === "shipper" || row.source === "shipper_mobile") ? (
                      <span title="지급방식은 화주사만 변경할 수 있습니다">{row.지급방식 || "-"}</span>
                    ) : (
                      <CompanyOptionPicker optKey="지급방식" placeholder="선택없음" noneLabel="선택없음" className="border rounded px-1 py-0.5 w-full text-center" value={row.지급방식 || ""} onChange={(__v) => ((e) =>
                          handleImmediateSelectChange(row, "지급방식", e.target.value))({ target: { value: __v } })} />
                    )}
                  </td>


                  <td className="border text-center">
                    <DispatchWayPicker scope={[row?.거래처명, row?.상차지명, row?.하차지명]} placeholder="선택없음" noneLabel="선택없음" className="border rounded px-1 py-0.5 w-full text-center" style={sheetWayDiff(row) ? SHEET_DIFF_STYLE : undefined} title={sheetWayDiff(row) ? sheetWayTitle(row) : undefined} value={row.배차방식 === "선택없음" ? "" : (row.배차방식 || "")} dir={row.콜구분 || ""}
                      onPick={(pk) => handleImmediateSelectChange(row, "배차방식", pk.배차방식 ?? "", pk.콜구분 !== undefined ? { 콜구분: pk.콜구분, 콜플랫폼: pk.콜플랫폼 || "" } : null)} />
                  </td>

                  {/* 메모 */}
                  <td className="border text-center whitespace-nowrap">
                    <MemoIconCell text={row.메모 || ""} urgency={row.메모중요도} />
                  </td>

                  {/* 전달사항 */}
                  <td className="border text-center whitespace-nowrap">
                    <NoteIconCell
                      value={edited[id]?.전달사항 ?? r.전달사항 ?? ""}
                      onSave={(val) => {
                        const patch = { 전달사항: val, updatedAt: Date.now() };
                        patchDispatch?.(id, patch).catch(console.error);
                        flashRow(id);
                      }}
                    />
                  </td>
               {/* 첨부 */}
                  <td className="border text-center whitespace-nowrap">
                    <button
                      onClick={() => setAttachViewer(row)}
                      className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto ${row.업로드잠금해제만료 && new Date(row.업로드잠금해제만료).getTime() > Date.now() ? "ring-2 ring-amber-400 animate-pulse" : ""}`}
                      title="첨부파일 보기"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke={row.attachViewed ? "#1B2B4B" : (row.attachCount || 0) > 0 ? (payOn && (row.officeAttach || 0) > 0 ? "#2563EB" : "#059669") : "#cbd5e1"}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {(row.attachCount || 0) > 0 && (
                       <span
                         title={payOn && (row.officeAttach || 0) > 0 ? `사무실에서 올린 첨부 ${row.officeAttach}개 포함` : undefined}
                         className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] ${payOn && (row.officeAttach || 0) > 0 ? "bg-blue-600" : "bg-emerald-500"} text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none`}
                         style={!row.attachViewed ? { animation: "cancelSlowBlink 1.6s ease-in-out infinite" } : undefined}
                       >
                          {row.attachCount}
                        </span>
                      )}
                      {row.재업로드완료알림 === true && (
                        <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse" />
                      )}
                    </button>
                    {row.차량번호 && (
                      <button
                        onClick={() => setLiveLocViewer(row)}
                        className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto"
                        title="실시간 위치 보기"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke={row.위치공유중 ? "#10b981" : "#cbd5e1"}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                      </button>
                    )}
                  </td>
                  {/* 💳 정산 — 계산서 · 지급 · 입금 단계(누르면 날짜) */}
                  {payOn && <td className="border text-center whitespace-nowrap px-2"><PayBadge row={row} onOpen={() => setPayPopId(id)} /></td>}
                  {/* 전달상태 (슬라이드 토글) */}
                  <td className="border text-center whitespace-nowrap px-2">
                    {(() => {
                      const today = todayKST();
                      const d = row?.상차일자 || row?.상차일 || row?.상차 || "";
                      const deliveryStatus = row.업체전달상태
                        ? row.업체전달상태
                        : d && d < today ? "전달완료" : "미전달";
                      const isOn = deliveryStatus === "전달완료";

                      return (
                        <button
                          type="button"
                          onClick={() => setConfirmChange({
                            id,
                            field: "업체전달상태",
                            before: deliveryStatus,
                            after: isOn ? "미전달" : "전달완료",
                          })}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${isOn ? "bg-[#6272C3]" : "bg-gray-300"}`}
                          title={isOn ? "전달완료 → 클릭 시 미전달" : "미전달 → 클릭 시 전달완료"}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isOn ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </PlateSuggestCtx.Provider>
          </tbody>
        </table>
        <AssignConfirm target={plateAssignAsk} busy={plateAssignBusy} onCancel={() => setPlateAssignAsk(null)} onOk={doPlateAssign} />
      </div>
      <StickyHScrollbar targetRef={dsTableWrapRef} />
      {payOn && payPopId && (() => { const pr = (dispatchData || []).find((x) => getId(x) === payPopId); return pr ? <PayPopup row={pr} onClose={() => setPayPopId("")} patchDispatch={patchDispatch} canEdit={!isViewer} company={userCompany}
        others={selected.has(payPopId) && selected.size > 1 ? (dispatchData || []).filter((x) => selected.has(getId(x))) : []} /> : null; })()}
      {dsLongPress.selectMode && (
        <KpSelectModeBar count={selected.size} onSelectAll={() => setSelected(new Set(pageRows.map((r) => getId(r))))} onClear={() => setSelected(new Set())} onExit={() => dsLongPress.setSelectMode(false)} />
      )}
      </div>

      {/* ⭐ 하단 페이지 이동 — 목록을 끝까지 스크롤한 뒤에도 맨 위로 다시 올라가지
          않고 바로 이전/다음 페이지로 넘어갈 수 있게, 상단과 동일한 버튼을 표 아래에도
          둔다(Shift+←/→ 키로도 동일하게 이동 가능). */}
      <div className="flex items-center justify-center gap-2 py-3">
        <button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border whitespace-nowrap ${page===0?"bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed":"bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-sm"}`}>
          ◀ 이전
        </button>
        <span className="text-[12px] font-semibold text-gray-600 px-1 whitespace-nowrap">{page+1}<span className="text-gray-500"> / {Math.max(1, Math.ceil(filtered.length/pageSize))}</span></span>
        <button disabled={(page+1)*pageSize>=filtered.length} onClick={()=>setPage(p=>p+1)}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border whitespace-nowrap ${(page+1)*pageSize>=filtered.length?"bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed":"bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-sm"}`}>
          다음 ▶
        </button>
      </div>

      {/* ---------------------------------------------------------
          ● 신규 오더 등록 팝업 (업그레이드 버전)
      --------------------------------------------------------- */}
      {showCreate && (
        <NewOrderPopup
          setShowCreate={setShowCreate}
          newOrder={newOrder}
          setNewOrder={setNewOrder}
          addDispatch={addDispatch}
          clients={clients}
          drivers={drivers}        // ★ 추가
          upsertDriver={upsertDriver} // ★ 신규 기사 등록에 필요
        />
      )}
      {/* ===================== 선택수정(팝업) ===================== */}
      {editPopupOpen && editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-slate-100 rounded-2xl shadow-2xl w-[780px] overflow-y-auto flex flex-col" style={{ maxHeight: `${Math.floor(88 / (parseFloat(document.getElementById("root")?.style.zoom) || 1))}vh` }}>

            {/* ===== 헤더 ===== */}
            <div className="flex justify-between items-center px-6 py-4 bg-[#1B2B4B] rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-white text-[16px] font-bold">선택한 오더 수정</h3>
                {editTarget && <p className="text-white/60 text-[13px] mt-0.5">{editTarget.거래처명} · {editTarget.상차지명} → {editTarget.하차지명}</p>}
              </div>
              <button
                className="text-white/70 hover:text-white text-xl"
                onClick={() => setEditPopupOpen(false)}
              >✕</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-[14px]">
            <FixedRouteEditNotice order={editTarget} />
            {/* ================= 상태 버튼 그룹 ================= */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
              <button type="button"
                onClick={() => setEditTarget((p) => ({ ...p, 긴급: !p.긴급 }))}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.긴급 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                긴급
              </button>
              <button type="button"
                onClick={() => setEditTarget((p) => (p.운행유형 === "왕복" ? { ...p, 운행유형: "편도", 회전수: 1, 메모: withRotationMemo(p.메모, 1) } : { ...p, 운행유형: "왕복" }))}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.운행유형 === "왕복" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                왕복
              </button>
              {editTarget.운행유형 === "왕복" && (
                <RotationPicker size="sm" allowSplit={false} count={editTarget.회전수 || 1}
                  onChange={(c) => setEditTarget((p) => ({ ...p, 회전수: c, 메모: withRotationMemo(p.메모, c) }))} />
              )}
              <button type="button"
                onClick={() => setEditTarget((p) => ({ ...p, 혼적: !p.혼적, 독차: !!p.혼적 }))} /* ⭐ 2026-11-09 혼적을 끄면 독차 */
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.혼적 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                혼적
              </button>
              <button type="button"
                onClick={() => {
                  const d = editTarget?.상차일 || "";
                  const today = todayKST();
                  const deliveryStatus = editTarget.업체전달상태 ? editTarget.업체전달상태 : (d && d < today ? "전달완료" : "미전달");
                  const next = deliveryStatus === "전달완료" ? "미전달" : "전달완료";
                  setConfirmChange({ id: getId(editTarget), field: "업체전달상태", before: deliveryStatus, after: next });
                }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${(() => { const d = editTarget?.상차일 || ""; const today = todayKST(); return (editTarget.업체전달상태 ? editTarget.업체전달상태 : (d && d < today ? "전달완료" : "미전달")) === "전달완료"; })() ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                업체전달
              </button>
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={handleFareSearch} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition">
                  운임조회
                </button>
              </div>
            </div>


            {/* ------------------------------------------------ */}
            {/* 🔵 거래처명 */}
            {/* ------------------------------------------------ */}
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <label>거래처명</label>
                <button type="button" onClick={() => openNewClientModal(editTarget?.거래처명)}
                  className="text-[11px] font-bold text-[#1B2B4B] hover:underline">+ 신규등록</button>
              </div>
              <div className="relative">
              <input autoComplete="off"
                className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
                disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
                value={editTarget.거래처명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({ ...p, 거래처명: v }));
                  setClientOptions(filterClients(v));
                  setShowClientDropdown(true);
                  setClientActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showClientDropdown) return;

                  if (e.key === "Escape") {
                    setShowClientDropdown(false);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setClientActiveIndex(i => Math.min(i + 1, clientOptions.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setClientActiveIndex(i => Math.max(i - 1, 0));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const c = clientOptions[clientActiveIndex];
                    if (!c) return;

                    setEditTarget((prev) => ({
                      ...prev,
                      거래처명: c.거래처명,

                    }));
                    checkWarningStatus(c.거래처명, "거래처");
                    setShowClientDropdown(false);
                  }

                  if (e.key === "Tab") {
                    const c = clientOptions[clientActiveIndex];
                    if (c) {
                      setEditTarget((prev) => ({
                        ...prev,
                        거래처명: c.거래처명,

                      }));
                      checkWarningStatus(c.거래처명, "거래처");
                      setShowClientDropdown(false);
                    }
                  }
                }}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              />

              {showClientDropdown && clientOptions.length > 0 && (
                <div
                  ref={clientListRef}
                  className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto"
                >
                  {clientOptions.map((c, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 cursor-pointer ${
                        i === clientActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-100"
                      }`}
                      onMouseDown={() => {
                        setEditTarget((prev) => ({
                          ...prev,
                          거래처명: c.거래처명,

                        }));
                        checkWarningStatus(c.거래처명, "거래처");
                        setShowClientDropdown(false);
                      }}
                    >
                      <div className="font-semibold">{c.거래처명}</div>
                      {c.주소 && (
                        <div className={`text-xs ${i === clientActiveIndex ? "text-white/70" : "text-gray-500"}`}>{c.주소}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
            {/* ------------------------------------------------ */}
{/* 🔵 상/하차일 & 시간 (선택수정) */}
{/* ------------------------------------------------ */}
<div className="grid grid-cols-2 gap-3 mb-3">

  {/* 상차일 */}
  <div>
    <label className="text-sm font-medium"><EditableText id="waypoint.label.상차일" defaultText="상차일" /></label>
    <CustomDatePicker
      className="border p-2 rounded w-full"
      value={editTarget.상차일 || ""}
      onChange={(e) =>
        setEditTarget((p) => withPickupDate(p, e.target.value))
      }
    />
  </div>

  {/* 상차시간 + 이전/이후 */}
  <div>
    <label className="text-sm font-medium"><EditableText id="waypoint.label.상차시간" defaultText="상차시간" /></label>
    <div className="flex items-center gap-1 flex-nowrap">
      <TimeAmPmPicker
        value={editTarget.상차시간 || ""}
        onChange={v => setEditTarget(p => ({ ...p, 상차시간: v }))}
        selectCls="border p-2 rounded flex-1 min-w-0"
      />
      {["이전", "이후"].map((v) => (
        <button
          key={v}
          type="button"
          className={`px-2 py-1 text-xs rounded border shrink-0
            ${editTarget.상차시간기준 === v
              ? "bg-gray-800 text-white border-gray-800"
              : "bg-gray-100 text-gray-600 border-gray-300"}
          `}
          onClick={() =>
            setEditTarget((p) => ({
              ...p,
              상차시간기준: p.상차시간기준 === v ? null : v,
            }))
          }
        >
          {v}
        </button>
      ))}
    </div>
  </div>

  {/* 하차일 */}
  <div>
    <label className="text-sm font-medium"><EditableText id="waypoint.label.하차일" defaultText="하차일" /></label>
    <CustomDatePicker
      className="border p-2 rounded w-full"
      value={editTarget.하차일 || ""}
      onChange={(e) =>
        setEditTarget((p) => ({ ...p, 하차일: e.target.value }))
      }
    />
  </div>

  {/* 하차시간 + 이전/이후 */}
  <div>
    <label className="text-sm font-medium"><EditableText id="waypoint.label.하차시간" defaultText="하차시간" /></label>
    <div className="flex items-center gap-1 flex-nowrap">
      <TimeAmPmPicker
        value={editTarget.하차시간 || ""}
        onChange={v => setEditTarget(p => ({ ...p, 하차시간: v }))}
        selectCls="border p-2 rounded flex-1 min-w-0"
      />
      {["이전", "이후"].map((v) => (
        <button
          key={v}
          type="button"
          className={`px-2 py-1 text-xs rounded border shrink-0
            ${editTarget.하차시간기준 === v
              ? "bg-gray-800 text-white border-gray-800"
              : "bg-gray-100 text-gray-600 border-gray-300"}
          `}
          onClick={() =>
            setEditTarget((p) => ({
              ...p,
              하차시간기준: p.하차시간기준 === v ? null : v,
            }))
          }
        >
          {v}
        </button>
      ))}
    </div>
  </div>

</div>

            {/* ------------------------------------------------ */}
            {/* 🔵 상하차지 (자동완성 동일 UX) */}
            {/* ------------------------------------------------ */}

            {/* ================= 상차지명 ================= */}
            <div className="mb-3 relative">
              <label className="flex items-center gap-1.5">상차지명<OrderMemoIconButton onClick={() => openPanelMemoE5("pickup")} hasMemo={hasPanelMemoE5("pickup")} /></label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={editTarget.상차지명 || ""}

                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({
                    ...p,
                    상차지명: v,
                    ...(v.trim() === "" && { 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "" })
                  }));
                  const ranked = rankPlaces(filterPlaces(v), v);
                  setPlaceOptions(ranked);
                  setPlaceActiveIndex(0);
                  setActivePlaceField(v.trim() ? "상차" : null);
                }}
                onKeyDown={(e) => {
                  if (!placeOptions.length) return;

                  if (e.key === "Escape") {
                    setActivePlaceField(null);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) =>
                      Math.min(i + 1, placeOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = placeOptions[placeActiveIndex];
                    if (!p) return;
                    const cts5e = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts5e = [...new Map(cts5e.map(c => [c.name.trim(), c])).values()];
                    const prim5e = ucts5e.find(c => c.isPrimary) || ucts5e[0];
                    setEditTarget((prev) => ({
                      ...prev,
                      상차지명: p.업체명,
                      상차지주소: p.주소 || "",
                      상차지담당자: prim5e?.name || p.담당자 || "",
                      상차지담당자번호: prim5e?.phone || p.담당자번호 || "",
                    }));
                    if (ucts5e.length > 1) setPanelContactPopup5({ type: "pickup", place: p, contacts: ucts5e, setter: setEditTarget });
                    checkWarningStatus(p.업체명, "상차지");
                    setActivePlaceField(null);
                  }

                  if (e.key === "Tab") {
                    const p = placeOptions[placeActiveIndex];
                    if (p) {
                      const cts5eT = (p.contacts || []).filter(c => c.name?.trim());
                      const ucts5eT = [...new Map(cts5eT.map(c => [c.name.trim(), c])).values()];
                      const prim5eT = ucts5eT.find(c => c.isPrimary) || ucts5eT[0];
                      setEditTarget((prev) => ({
                        ...prev,
                        상차지명: p.업체명,
                        상차지주소: p.주소 || "",
                        상차지담당자: prim5eT?.name || p.담당자 || "",
                        상차지담당자번호: prim5eT?.phone || p.담당자번호 || "",
                      }));
                      checkWarningStatus(p.업체명, "상차지");
                      setActivePlaceField(null);
                    }
                  }
                }}
                onBlur={() => setTimeout(() => setActivePlaceField(null), 200)}
              />

              {activePlaceField === "상차" && placeOptions.length > 0 && (
                <div
                  ref={placeListRef}
                  className="absolute left-0 top-full z-50 bg-white border rounded shadow-lg w-full max-h-40 overflow-y-auto"
                >
                  {placeOptions.slice(0, 60).map((p, idx) => (
                    <div
                      key={idx}
                      className={
                        "px-3 py-1 cursor-pointer " +
                        (idx === placeActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-100")
                      }
                      onMouseDown={() => {
                        const cts5 = (p.contacts || []).filter(c => c.name?.trim());
                        const ucts5 = [...new Map(cts5.map(c => [c.name.trim(), c])).values()];
                        const prim5 = ucts5.find(c => c.isPrimary) || ucts5[0];
                        setEditTarget((prev) => ({
                          ...prev,
                          상차지명: p.업체명,
                          상차지주소: p.주소 || "",
                          상차지담당자: prim5?.name || p.담당자 || "",
                          상차지담당자번호: prim5?.phone || p.담당자번호 || "",
                        }));
                        if (ucts5.length > 1) setPanelContactPopup5({ type: "pickup", place: p, contacts: ucts5, setter: setEditTarget });
                        checkWarningStatus(p.업체명, "상차지");
                        setActivePlaceField(null);
                      }}
                    >
                      <div className="font-medium">{p.업체명}</div>
                      <div className={`text-xs ${idx === placeActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* ================= 상차지주소 ================= */}
            <div className="mb-3">
              <label>상차지주소</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={editTarget.상차지주소 || ""}
                onChange={(e) =>
                  setEditTarget((p) => ({ ...p, 상차지주소: e.target.value }))
                }
              />
            </div>

            {/* ================= 상차지 담당자/연락처/방법 ================= */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.상차지담당자" defaultText="상차지 담당자" /></label>
                <input autoComplete="off"
                  className="border p-2 rounded w-full"
                  value={editTarget.상차지담당자 || ""}
                  onChange={(e) => setEditTarget((p) => ({ ...p, 상차지담당자: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.상차지연락처" defaultText="상차지 연락처" /></label>
                <input autoComplete="off"
                  className="border p-2 rounded w-full"
                  value={editTarget.상차지담당자번호 || ""}
                  onChange={(e) => setEditTarget((p) => ({ ...p, 상차지담당자번호: formatPhone(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.상차방법" defaultText="상차 방법" /></label>
                <CompanyOptionPicker optKey="상하차방법" title="상차방법" placeholder="선택" noneLabel="선택" className="border p-2 rounded w-full" value={editTarget.상차방법 || ""} onChange={(__v) => ((e) => setEditTarget((p) => ({ ...p, 상차방법: e.target.value })))({ target: { value: __v } })} />
              </div>
            </div>

            {/* ── 5파트 상차 경유지 표시 ── */}
            {(() => {
              const sp = (v) => {
                if (Array.isArray(v) && v.length) return v;
                if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {} }
                return [];
              };
              const stops = [...sp(editTarget?.경유상차목록), ...sp(editTarget?.경유지_상차)]
                .filter(s => s?.업체명?.trim())
                .filter((s, i, arr) => arr.findIndex(x => x.업체명 === s.업체명) === i);
              return <WaypointSection stops={stops} type="pickup" onSave={(newList) => setEditTarget(p => ({ ...p, 경유상차목록: newList, 경유지_상차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mb-3" orderDate={editTarget?.상차일 || ""} />;
            })()}

            {/* ================= 하차지명 ================= */}
            <div className="mb-3 relative">
              <label className="flex items-center gap-1.5">하차지명<OrderMemoIconButton onClick={() => openPanelMemoE5("drop")} hasMemo={hasPanelMemoE5("drop")} /></label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={editTarget.하차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({
                    ...p,
                    하차지명: v,
                    ...(v.trim() === "" && { 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "" })
                  }));
                  const ranked = rankPlaces(filterPlaces(v), v);
                  setPlaceOptions(ranked);
                  setPlaceActiveIndex(0);
                  setActivePlaceField(v.trim() ? "하차" : null);
                }}
                onKeyDown={(e) => {
                  if (!placeOptions.length) return;

                  if (e.key === "Escape") {
                    setActivePlaceField(null);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) =>
                      Math.min(i + 1, placeOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPlaceActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = placeOptions[placeActiveIndex];
                    if (!p) return;
                    const cts5de = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts5de = [...new Map(cts5de.map(c => [c.name.trim(), c])).values()];
                    const prim5de = ucts5de.find(c => c.isPrimary) || ucts5de[0];
                    setEditTarget((prev) => ({
                      ...prev,
                      하차지명: p.업체명,
                      하차지주소: p.주소 || "",
                      하차지담당자: prim5de?.name || p.담당자 || "",
                      하차지담당자번호: prim5de?.phone || p.담당자번호 || "",
                    }));
                    if (ucts5de.length > 1) setPanelContactPopup5({ type: "drop", place: p, contacts: ucts5de, setter: setEditTarget });
                    checkWarningStatus(p.업체명, "하차지");
                    setActivePlaceField(null);
                  }

                  if (e.key === "Tab") {
                    const p = placeOptions[placeActiveIndex];
                    if (p) {
                      const cts5deT = (p.contacts || []).filter(c => c.name?.trim());
                      const ucts5deT = [...new Map(cts5deT.map(c => [c.name.trim(), c])).values()];
                      const prim5deT = ucts5deT.find(c => c.isPrimary) || ucts5deT[0];
                      setEditTarget((prev) => ({
                        ...prev,
                        하차지명: p.업체명,
                        하차지주소: p.주소 || "",
                        하차지담당자: prim5deT?.name || p.담당자 || "",
                        하차지담당자번호: prim5deT?.phone || p.담당자번호 || "",
                      }));
                      checkWarningStatus(p.업체명, "하차지");
                      setActivePlaceField(null);
                    }
                  }
                }}
                onBlur={() => setTimeout(() => setActivePlaceField(null), 200)}
              />

              {activePlaceField === "하차" && placeOptions.length > 0 && (
                <div
                  ref={placeListRef}
                  className="absolute left-0 top-full z-50 bg-white border rounded shadow-lg w-full max-h-40 overflow-y-auto"
                >
                  {placeOptions.slice(0, 60).map((p, idx) => (
                    <div
                      key={idx}
                      className={
                        "px-3 py-1 cursor-pointer " +
                        (idx === placeActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-100")
                      }
                     onMouseDown={() => {
                        const cts5d = (p.contacts || []).filter(c => c.name?.trim());
                        const ucts5d = [...new Map(cts5d.map(c => [c.name.trim(), c])).values()];
                        const prim5d = ucts5d.find(c => c.isPrimary) || ucts5d[0];
                        setEditTarget((prev) => ({
                          ...prev,
                          하차지명: p.업체명,
                          하차지주소: p.주소 || "",
                          하차지담당자: prim5d?.name || p.담당자 || "",
                          하차지담당자번호: prim5d?.phone || p.담당자번호 || "",
                        }));
                        if (ucts5d.length > 1) setPanelContactPopup5({ type: "drop", place: p, contacts: ucts5d, setter: setEditTarget });
                        checkWarningStatus(p.업체명, "하차지");
                        setActivePlaceField(null);
                      }}
                    >
                      <div className="font-medium">{p.업체명}</div>
                      <div className={`text-xs ${idx === placeActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* ================= 하차지주소 ================= */}
            <div className="mb-3">
              <label>하차지주소</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={editTarget.하차지주소 || ""}
                onChange={(e) =>
                  setEditTarget((p) => ({ ...p, 하차지주소: e.target.value }))
                }
              />
            </div>

            {/* ================= 하차지 담당자/연락처/방법 ================= */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.하차지담당자" defaultText="하차지 담당자" /></label>

                <input autoComplete="off"
                  className="border p-2 rounded w-full"
                  value={editTarget.하차지담당자 || ""}
                  onChange={(e) => setEditTarget((p) => ({ ...p, 하차지담당자: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.하차지연락처" defaultText="하차지 연락처" /></label>
                <input autoComplete="off"
                  className="border p-2 rounded w-full"
                  value={editTarget.하차지담당자번호 || ""}
                  onChange={(e) => setEditTarget((p) => ({ ...p, 하차지담당자번호: formatPhone(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.하차방법" defaultText="하차 방법" /></label>
                <CompanyOptionPicker optKey="상하차방법" title="하차방법" placeholder="선택" noneLabel="선택" className="border p-2 rounded w-full" value={editTarget.하차방법 || ""} onChange={(__v) => ((e) => setEditTarget((p) => ({ ...p, 하차방법: e.target.value })))({ target: { value: __v } })} />
              </div>
            </div>

            {/* ── 5파트 하차 경유지 표시 ── */}
            {(() => {
              const sp = (v) => {
                if (Array.isArray(v) && v.length) return v;
                if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {} }
                return [];
              };
              const stops = [...sp(editTarget?.경유하차목록), ...sp(editTarget?.경유지_하차)]
                .filter(s => s?.업체명?.trim())
                .filter((s, i, arr) => arr.findIndex(x => x.업체명 === s.업체명) === i);
              return <WaypointSection stops={stops} type="drop" onSave={(newList) => setEditTarget(p => ({ ...p, 경유하차목록: newList, 경유지_하차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mb-3" orderDate={editTarget?.하차일 || ""} />;
            })()}

            {/* 🔥 화물내용 (단독 한 줄) */}
<Field label={<span className="flex items-center gap-1 flex-wrap">화물내용<button type="button" tabIndex={-1} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer" onClick={() => setCargoAddPopup({ initialValue: editTarget?.화물내용||"", onCommit: (v) => setEditTarget(p=>({...p,화물내용:v})) })}>+ 추가</button><CargoExtraChips value={editTarget?.화물내용} /></span>}>
  <div className="relative w-full">

    <input autoComplete="off"
      className="border p-2 rounded w-full pr-[95px]"
      value={
  editTarget?.화물수량 ||
  editTarget?.화물내용 ||
  ""
}
      onChange={(e) => {
        const v = e.target.value;
        setEditTarget((p) => {
          const extras = (p.화물내용 || "").replace(/^[^+]*/, "");
          return { ...p, 화물수량: v, 화물내용: (p.화물타입 ? `${v}${p.화물타입}` : v) + extras };
        });
      }}
    />

    <CustomSelect
        className="absolute right-1 top-1/2 -translate-y-1/2 h-[30px] w-[58px] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer"
        value={editTarget?.화물타입 || ""}
      onChange={(e) => {
        const type = e.target.value;
        setEditTarget((p) => {
          const extras = (p.화물내용 || "").replace(/^[^+]*/, "");
          return { ...p, 화물타입: type, 화물내용: (type ? `${p.화물수량 || ""}${type}` : (p.화물수량 || "")) + extras };
        });
      }}
    >
      <option value="">없음</option>
      <option value="파레트">파레트</option>
      <option value="박스">박스</option>
      <option value="통">통</option>
    </CustomSelect>

  </div>
</Field>


{/* 🔥 차량종류 + 차량톤수 (같은 줄) */}
<div className="grid grid-cols-2 gap-3">

  <Field label="차량종류">
    <VehicleTypePicker className="border p-2 rounded w-full" value={editTarget?.차량종류 || ""} base={["라보/다마스", "카고", "윙/카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "리프트", "오토바이", "기타"]} placeholder="선택" noneLabel="선택" onChange={(__v) => ((e) =>
        setEditTarget((p) => ({ ...p, 차량종류: e.target.value })))({ target: { value: __v } })} />
  </Field>


  <Field label="차량톤수">
    <div className="relative w-full">

      <input autoComplete="off"
        className="border p-2 rounded w-full pr-[95px]"
        value={editTarget?.톤수값 || ""}
        onChange={(e) => {
          const v = e.target.value;

          setEditTarget((p) => ({
            ...p,
            톤수값: v,
            차량톤수: p.톤수타입
              ? `${v}${p.톤수타입}`
              : v,
          }));
        }}
      />

       <CustomSelect
        className="absolute right-1 top-1/2 -translate-y-1/2 h-[30px] w-[58px] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer"
        value={editTarget?.톤수타입 || ""}
        onChange={(e) => {
          const type = e.target.value;

          setEditTarget((p) => ({
            ...p,
            톤수타입: type,
            차량톤수: type
              ? `${p.톤수값 || ""}${type}`
              : (p.톤수값 || ""),
          }));
        }}
      >
        <option value="">선택</option>
        <option value="톤">톤</option>
        <option value="kg">kg</option>
      </CustomSelect>

    </div>
  </Field>

</div>
            {/* ===== 스마트 기사 검색 ===== */}
            <div className="mb-3">
              <label className="block text-[13px] font-semibold text-[#1B2B4B] mb-1">기사 스마트 검색</label>
              <div className="relative">
                <input autoComplete="off"
                  className="w-full border-2 border-[#1B2B4B] rounded-xl px-4 py-2.5 text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-500"
                  placeholder="이름·차량번호·전화번호 또는 문자 내용 붙여넣기 (Enter로 적용)"
                  value={smartQ5}
                  onChange={e => handleSmart5Input(e.target.value)}
                  onKeyDown={e => handleSmart5KeyDown(e, editTarget, setEditTarget)}
                  onBlur={e => { setTimeout(()=>{ if(e.target.value.trim().length>4) applySmart5(editTarget,setEditTarget,e.target.value); setSmartList5([]); setSmart5ActiveIdx(-1); },200); }}
                />
                {smartList5.length > 0 && (
                  <div className="absolute z-[9999] w-full bg-white border-2 border-[#1B2B4B] rounded-xl shadow-xl mt-0.5 overflow-hidden">
                    <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-semibold">등록된 기사 {smartList5.length}명</div>
                    {smartList5.map((d,i)=>(
                      <div key={i} className={`px-4 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 flex items-center justify-between ${i===smart5ActiveIdx?"bg-blue-100":"hover:bg-blue-50"}`}
                        onMouseEnter={()=>setSmart5ActiveIdx(i)}
                        onMouseDown={()=>selectSmart5Driver(d, setEditTarget)}>
                        <div>
                          <div className="font-bold text-gray-900 text-[13px]">{d.이름||"-"}</div>
                          <div className="text-[11px] text-gray-500">{d.차량번호} | {formatPhone(d.전화번호)}</div>
                        </div>
                        {d.등급==="블랙" && <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded-full">블랙</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(editTarget.차량번호||editTarget.이름) && (
                <div className="flex items-center gap-2 mt-2 bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-lg px-3 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B] shrink-0"></div>
                  <div className="flex-1 text-[12px] text-slate-700">
                    <span className="font-bold text-[#1B2B4B]">{editTarget.이름||"-"}</span>
                    <span className="text-slate-300 mx-1.5">|</span>
                    <span>{editTarget.차량번호}</span>
                    <span className="text-slate-300 mx-1.5">|</span>
                    <span>{editTarget.전화번호}</span>
                  </div>
                  <button type="button" onClick={()=>{setEditTarget(p=>({...p,차량번호:"",이름:"",전화번호:"",배차상태:"배차중"})); setSmartQ5("");}} className="text-slate-400 hover:text-slate-600 text-[14px] leading-none transition">×</button>
                </div>
              )}
            </div>

            {/* ------------------------------------------------ */}
            {/* 🔵 차량번호 (자동매칭) */}
            {/* ------------------------------------------------ */}
            <div className="mb-3">
              <label>차량번호</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={editTarget.차량번호 || ""}
                placeholder="예: 93가1234"
                onChange={(e) => {
                  const v = e.target.value;
                  editDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
                  const clean5 = v.replace(/\s+/g, "");
                  if (clean5) {
                    const match5 = (drivers || []).find(d => String(d.차량번호 || "").replace(/\s+/g, "") === clean5);
                    if (match5) {
                      const grade5 = match5?.등급 || match5?.grade || "";
                      if (grade5 === "블랙") setBlackAlert(match5);
                      else if (shouldShowDriverMemoAlert(match5)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: match5 }));
                    }
                  }
                  setEditTarget((p) => ({
                    ...p,
                    차량번호: v,

                    // 🔥 차량번호를 전부 지우면 기사정보 즉시 초기화
                    ...(v.trim() === "" && {
                      이름: "",
                      전화번호: "",
                      배차상태: "배차중",
                    }),
                  }));
                }}
                onKeyDown={(e) => {
  if (e.key !== "Enter") return;

  const raw = e.target.value.trim();
  if (!raw) return;

  const clean = raw.replace(/\s+/g, "");

  // 🔍 동일 차량번호 기사 전부 찾기
  const matches = drivers.filter(
    (d) => String(d.차량번호).replace(/\s+/g, "") === clean
  );

  // ✅ 1명만 있으면 바로 자동 매칭
 if (matches.length === 1) {
    const d = matches[0];
    const grade = d?.등급 || d?.grade || "";
    if (grade === "블랙") {
      setBlackAlert(d);
    }
    setMatchedDrivers([]);
    setEditTarget((p) => ({
      ...p,
      이름: d.이름,
      전화번호: formatPhone(d.전화번호),
      배차상태: "배차완료",
    }));
    return;
  }

  // 🔽 2명 이상이면 → 드롭다운 선택
  if (matches.length > 1) {
    setMatchedDrivers(matches);
    return;
  }

  // ❌ 아무도 없으면 신규 등록
  driverPanelCallbackRef5.current = async (name, fmt) => {
    setMatchedDrivers([]);
    setEditTarget((p) => ({ ...p, 차량번호: raw, 이름: name, 전화번호: fmt, 배차상태: "배차완료", updatedAt: Date.now() }));
  };
  setDriverConfirmInfo5({ type: "new", 차량번호: raw, 이름: "", 전화번호: "" });
  setDriverConfirmRowId5("__panel__");
  setQuickRegMode5(true);
  setQuickRegName5(""); setQuickRegPhone5("");
  setDriverConfirmOpen5(true);
}}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const clean = raw.replace(/\s+/g, "");
                  if (!clean) return;
                  const matches = (drivers || []).filter(d => String(d.차량번호 || "").replace(/\s+/g, "") === clean);
                  if (matches.length > 0) return;
                  driverPanelCallbackRef5.current = async (name, fmt) => {
                    setMatchedDrivers([]);
                    setEditTarget((p) => ({ ...p, 차량번호: raw, 이름: name, 전화번호: fmt, 배차상태: "배차완료", updatedAt: Date.now() }));
                  };
                  setDriverConfirmInfo5({ type: "new", 차량번호: raw, 이름: "", 전화번호: "" });
                  setDriverConfirmRowId5("__panel__");
                  setQuickRegMode5(true);
                  setQuickRegName5(""); setQuickRegPhone5("");
                  setDriverConfirmOpen5(true);
                }}
              />
{matchedDrivers.length > 1 && (
  <div className="mt-2 border rounded bg-white shadow">
    <div className="text-xs px-2 py-1 text-gray-500 border-b">
      동일 차량번호 기사 선택
    </div>

    {matchedDrivers.map((d, i) => (
      <button
        key={i}
        type="button"
        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
        onClick={() => {
          setEditTarget((p) => ({
            ...p,
            이름: d.이름,
            전화번호: formatPhone(d.전화번호),
            배차상태: "배차완료",
          }));
          setMatchedDrivers([]);
        }}
      >
        <div className="font-medium">{d.이름}</div>
        <div className="text-xs text-gray-500">{formatPhone(d.전화번호)}</div>
      </button>
    ))}
  </div>
)}
            </div>

            {/* 🔵 이름/전화번호 (자동입력) — ⭐ 2026-11-05 매칭 기사면 잠금 + [수정] */}
            <DriverNamePhoneEdit variant="modal" target={editTarget} setTarget={setEditTarget} de={editDrvEdit} drivers={drivers} />

            {/* ------------------------------------------------ */}
            {/* 🔵 운임 (수수료 자동계산) */}
            {/* ------------------------------------------------ */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label>청구운임</label>
                <input autoComplete="off"
  className="border p-2 rounded w-full"
  value={editTarget.청구운임 ? Number(editTarget.청구운임).toLocaleString() : ""}
  onChange={(e) => {
    const raw = e.target.value
      .replace(/[^\d-]/g, "")   // 숫자 + -
      .replace(/(?!^)-/g, "");  // -는 맨 앞만

    setEditTarget((p) => {
      if (fareOn) { const n = fareFormChange(p, "청구운임", raw, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; } // ⭐ 2026-11-02 운임규칙
      const 청구 = parseInt(raw || "0", 10);
      const 기사 = parseInt(p.기사운임 || "0", 10);

      return {
        ...p,
        청구운임: raw, // 문자열 유지
        수수료: 청구 - 기사,
      };
    });
  }}
/>
              </div>

              <div>
                <label>기사운임</label>
                <input autoComplete="off"
  className="border p-2 rounded w-full"
  value={editTarget.기사운임 ? Number(editTarget.기사운임).toLocaleString() : ""}
  onChange={(e) => {
    const raw = e.target.value
      .replace(/[^\d-]/g, "")
      .replace(/(?!^)-/g, "");

    setEditTarget((p) => {
      if (fareOn) { const n = fareFormChange(p, "기사운임", raw, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; } // ⭐ 2026-11-02 운임규칙
      const 청구 = parseInt(p.청구운임 || "0", 10);
      const 기사 = parseInt(raw || "0", 10);

      return {
        ...p,
        기사운임: raw,
        수수료: 청구 - 기사,
      };
    });
  }}
/>
              </div>
              <div>
                <label>수수료</label>
                <input autoComplete="off"
                  className={`border p-2 rounded w-full bg-gray-100 font-bold ${profitCls(editTarget.수수료 || 0, "text-[#1B2B4B]")}`} // ⭐ 2026-11-17 수수료 — 플러스 빨강 · 마이너스 파랑(예전엔 반대)
                  value={(editTarget.수수료 || 0).toLocaleString()}
                  readOnly
                />
              </div>
            </div>
            {/* ⭐ 2026-11-02 운임규칙 — 수정 창 운임구분 */}
            {fareOn && (
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <label className="shrink-0">운임구분</label>
                <FareTypeSelect pct={editTarget.운임구분수수료율} className="min-w-[180px] !w-auto" rules={fareR.rules} value={editTarget.운임구분 || ""}
                  onChange={(v) => setEditTarget((p) => { const n = fareFormChange(p, "운임구분", v, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; })} />
                <FarePctInput form={editTarget} rules={fareR.rules} onChange={(v) => setEditTarget((p) => { const n = fareFormChange(p, "운임구분수수료율", v, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; })} />{/* ⭐ 2026-11-09 이 오더만 수수료율 */}
                <FareRuleHint form={editTarget} rules={fareR.rules} onReapply={() => setEditTarget((p) => { const n = fareFormChange(p, "__reapply", null, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; })} />
              </div>
            )}
            {/* 🏗 2026-11-09 지게차비용 */}
            <div className="mb-3"><SpecialFareButton form={editTarget} setForm={(fn) => setEditTarget((p) => { const n = typeof fn === "function" ? fn(p) : fn; return { ...n, 수수료: Number(n.수수료) || 0 }; })} /></div>
            <div className="mb-3 flex justify-end"><OrderStaffFields order={editTarget} setOrder={setEditTarget} disabled={isViewerNow()} /></div>{/* 👤 2026-11-12 배차담당자 · 차량배정자 */}

            {/* ------------------------------------------------ */}
            {/* 🔵 지급/배차 방식 */}
            {/* ------------------------------------------------ */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label>지급방식{(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile") && <span className="text-[11px] text-gray-500 ml-1">(화주사 전용)</span>}</label>
                <CompanyOptionPicker optKey="지급방식" placeholder="선택 없음" noneLabel="선택 없음" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.지급방식 || ""} onChange={(__v) => ((e) =>
                    setEditTarget((p) => ({ ...p, 지급방식: e.target.value })))({ target: { value: __v } })} />
              </div>

              {/* 🗓 2026-11-27 마감월(이월 오더) — 비우면 상차일의 달로 청구 */}
              <div>
                <label>마감월 <span className="text-[11px] text-gray-500">(이월일 때만)</span></label>
                <input type="month" className="border p-2 rounded w-full" value={String(editTarget.마감월 || "").slice(0, 7)} onChange={(e) => setEditTarget((p) => ({ ...p, 마감월: e.target.value }))} />
              </div>

              <div>
                <label>배차방식</label>
                <DispatchWayPicker scope={[editTarget?.거래처명, editTarget?.상차지명, editTarget?.하차지명]} placeholder="선택 없음" noneLabel="선택 없음" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" value={editTarget.배차방식 === "선택없음" ? "" : (editTarget.배차방식 || "")} dir={editTarget.콜구분 || ""}
                    onPick={(pk) => setEditTarget((p) => ({ ...p, ...pk }))} />
              </div>
            </div>

            {/* ------------------------------------------------ */}
            {/* 🔵 메모 + 전달사항 (2열) */}
            {/* ------------------------------------------------ */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              {/* 메모 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-sm">메모</label>
                  <div className="flex items-center gap-1">
                    <button type="button"
                      onClick={() => { setEditTarget((p) => ({ ...p, 메모중요도: "일반" })); setEdited((prev) => ({ ...prev, [getId(editTarget)]: { ...(prev[getId(editTarget)] || {}), 메모중요도: "일반" } })); }}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${editTarget.메모중요도 === "일반" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                      일반
                    </button>
                    <button type="button"
                      onClick={() => { setEditTarget((p) => ({ ...p, 메모중요도: "HIGH" })); setEdited((prev) => ({ ...prev, [getId(editTarget)]: { ...(prev[getId(editTarget)] || {}), 메모중요도: "HIGH" } })); }}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${editTarget.메모중요도 === "HIGH" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-orange-600 border-orange-300 hover:bg-orange-50"}`}>
                      중요
                    </button>
                    <button type="button"
                      onClick={() => { setEditTarget((p) => ({ ...p, 메모중요도: "CRITICAL" })); setEdited((prev) => ({ ...prev, [getId(editTarget)]: { ...(prev[getId(editTarget)] || {}), 메모중요도: "CRITICAL" } })); }}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${editTarget.메모중요도 === "CRITICAL" ? "bg-red-600 text-white border-red-600" : "bg-white text-red-600 border-red-300 hover:bg-red-50"}`}>
                      긴급
                    </button>
                  </div>
                </div>
                <textarea
                  className="border p-2 rounded w-full h-20"
                  value={editTarget.메모 || ""}
                  onChange={(e) => setEditTarget((p) => ({ ...p, 메모: e.target.value }))}
                />
              </div>
              {/* 전달사항 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-sm">전달사항</label>
                  <button type="button"
                    onClick={() => { setEditTarget((p) => ({ ...p, 전달사항고정: !p.전달사항고정 })); setEdited((prev) => ({ ...prev, [getId(editTarget)]: { ...(prev[getId(editTarget)] || {}), 전달사항고정: !editTarget.전달사항고정 } })); }}
                    className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${editTarget.전달사항고정 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                    고정
                  </button>
                </div>
                <textarea
                  className="border p-2 rounded w-full h-20"
                  placeholder="기사에게 전달할 내용"
                  value={editTarget.전달사항 || ""}
                  onChange={(e) => setEditTarget((p) => ({ ...p, 전달사항: e.target.value }))}
                />
              </div>
            </div>

            {/* 화주사 수정요청 승인/거절 */}
            {editTarget.수정요청 && editTarget.수정요청데이터 && (
              <div className="mt-4 border-t pt-3">
                <div className="text-[12px] font-bold text-sky-700 mb-2">화주사 수정요청 (승인 대기중)</div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 bg-sky-50 border border-sky-200 rounded-lg p-2.5 mb-2">
                  {Object.entries(editTarget.수정요청데이터)
                    .filter(([k, v]) => !IGNORE_HISTORY_FIELDS.has(k) && String(editTarget[k] ?? "") !== String(v ?? ""))
                    .map(([k, v]) => (
                      <div key={k} className="text-[11px] text-gray-700">
                        <span className="font-semibold">{k}</span>: <span className="text-gray-500">{String(editTarget[k] ?? "없음") || "없음"}</span> → <span className="font-semibold text-sky-700">{String(v ?? "없음") || "없음"}</span>
                      </div>
                    ))}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 rounded-lg border border-red-300 text-red-500 text-[12px] font-semibold hover:bg-red-50"
                    onClick={async () => {
                      if (!await kpConfirm("화주사의 수정요청을 거절하시겠습니까?")) return;
                      await rejectEditRequest(editTarget);
                      setEditPopupOpen(false);
                    }}
                  >
                    거절
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold"
                    style={{ background: "#1B2B4B" }}
                    onClick={async () => {
                      if (!await kpConfirm("화주사의 수정요청을 승인하고 반영하시겠습니까?")) return;
                      await approveEditRequest(editTarget);
                      setEditPopupOpen(false);
                    }}
                  >
                    승인
                  </button>
                </div>
              </div>
            )}

            {/* 수정이력 */}
            {Array.isArray(editTarget.history) &&
              editTarget.history.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="text-[12px] font-bold text-[#1B2B4B] mb-2">수정이력</div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {editTarget.history
                      .filter(h => !IGNORE_HISTORY_FIELDS.has(h.field))
                      .slice()
                      .reverse()
                      .map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] pb-1.5 border-b border-gray-50 last:border-b-0">
                          <span className="text-gray-500 whitespace-nowrap shrink-0">{new Date(h.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="text-gray-500 shrink-0">{h.user}</span>
                          <span className="text-gray-700"><span className="font-semibold">{h.field}</span>: <span className="text-gray-500">{String(h.before ?? "없음")}</span> → <span className="font-semibold text-[#1B2B4B]">{String(h.after ?? "없음")}</span></span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            {/* ------------------------------------------------ */}
            {/* 🔵 저장/취소 */}
            {/* ------------------------------------------------ */}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
              <button
                className="px-5 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold"
                onClick={() => setEditPopupOpen(false)}
              >
                취소
              </button>

             <button
  className="px-5 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#0F1A30] text-white font-semibold"
  onClick={async () => {
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    if (!(await editDrvEdit.finish(editTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택
    // 1) Firestore 저장
    const ALLOWED_FIELDS = [
      "등록일",
      "상차일", "상차시간", "상차시간기준",
      "하차일", "하차시간", "하차시간기준",
      "거래처명",
      "상차지명", "상차지주소",
      "하차지명", "하차지주소",
      "경유상차목록",
      "경유지_상차",
      "경유지상차",
      "경유하차목록",
      "경유지_하차",
      "경유지하차",
      "화물내용",
      "차량종류", "차량톤수",
      "차량번호", "이름", "전화번호",
      "청구운임", "기사운임",
      "운임구분", "운임수동", // ⭐ 2026-11-02 운임규칙
      "지게차비용", "지게차부담", "지게차기사ID", "지게차기사명", "지게차기사전화", "지게차회사", "지게차기사차감", "지게차청구추가", "특수운임", "특수기사차감", "특수청구추가", "외부지급합", // 🏗 2026-11-09 지게차비용
      "지급방식", "배차방식", "콜구분", "콜플랫폼", // 💳 2026-11-12 IN/OUT도 같이 저장(예전엔 빠져서 수정 창에서 OUT을 골라도 IN으로 남았다)
      "마감월", // 🗓 2026-11-27 이월 오더 마감월(오더 등록 · 수정에서 지정)
  "_owner", "_assignerSet", "배차확정자", // 👤 2026-11-12 배차담당자 · 차량배정자 바꾸기(patchDispatch가 처리)
      "메모",
      "메모중요도",
      "전달사항",
      "전달사항고정",
      "상차지담당자",
      "상차지담당자번호",
      "상차방법",
      "하차지담당자",
      "하차지담당자번호",
      "하차방법",
      "운행유형",
      "회전수",
      "혼적", "독차",
      "긴급",
      "운임보정",
      "배차상태",
    ];

    // ✅ 저장 직전 화물내용 최종 동기화
    const finalCargo = editTarget.화물타입
      ? `${editTarget.화물수량 || ""}${editTarget.화물타입}`
      : (editTarget.화물수량 || editTarget.화물내용 || "");

    // 🔥 editTarget이 edited보다 우선
    const _pickArr = editTarget.경유상차목록 || editTarget.경유지_상차 || [];
    const _dropArr = editTarget.경유하차목록 || editTarget.경유지_하차 || [];
    const merged = {
      ...(edited[getId(editTarget)] || {}),
      ...editTarget,
      화물내용: finalCargo,
      경유상차목록: _pickArr, 경유지_상차: _pickArr, 경유지상차: _pickArr,
      경유하차목록: _dropArr, 경유지_하차: _dropArr, 경유지하차: _dropArr,
    };

    const payload = ALLOWED_FIELDS.reduce((acc, k) => {
      const v = merged[k];
      if (v !== undefined) {
        acc[k] = v;
      }
      return acc;
    }, {});

    const targetId = getId(editTarget);
    if (!targetId) {
      showAlert("✕ 오더 정보를 찾을 수 없어 저장하지 못했습니다.");
      return;
    }

    // ✅ payload.화물내용은 이미 merged에서 설정됨 (기존 별도 라인 제거)
    const savedId = targetId;

    // ✅ UI 먼저
    showAlert("수정이 저장되었습니다.");
    React.startTransition(() => {
      setEdited(prev => { const next = { ...prev }; delete next[targetId]; return next; });
      setEditPopupOpen(false);
      setSelected(new Set());
      setLocalOverrides(prev => ({ ...prev, [savedId]: payload }));
    });

    flashRow(savedId);
    setTimeout(() => {
      const el = document.getElementById(`row-${savedId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    patchDispatch(savedId, payload).catch(console.error);
    if (payload.상차지명) savePlaceSmart(payload.상차지명, payload.상차지주소||"", payload.상차지담당자||"", payload.상차지담당자번호||"", null, undefined,
      (editTarget.상차지오더메모 !== undefined || editTarget.상차지오더메모팝업표시 !== undefined || editTarget.상차지기사전달주의사항 !== undefined) ? { 오더메모: editTarget.상차지오더메모, 팝업표시: editTarget.상차지오더메모팝업표시, 기사전달주의사항: editTarget.상차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (payload.하차지명) savePlaceSmart(payload.하차지명, payload.하차지주소||"", payload.하차지담당자||"", payload.하차지담당자번호||"", null, undefined,
      (editTarget.하차지오더메모 !== undefined || editTarget.하차지오더메모팝업표시 !== undefined || editTarget.하차지기사전달주의사항 !== undefined) ? { 오더메모: editTarget.하차지오더메모, 팝업표시: editTarget.하차지오더메모팝업표시, 기사전달주의사항: editTarget.하차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (payload.차량번호 && payload.이름) {
      const existingD = (drivers||[]).find(d => normalizePlate(d.차량번호) === normalizePlate(payload.차량번호));
      if (!existingD) {
        upsertDriver({ 차량번호: payload.차량번호, 이름: payload.이름, 전화번호: payload.전화번호||"" }).catch(console.error);
      }
    }
    const savedPlate = normalizePlate(payload.차량번호 || "");
    if (savedPlate) {
      const d = (drivers || []).find(x => normalizePlate(x.차량번호) === savedPlate);
      emitBlackIfNeeded(d);
    }
                }}
              >
                저장
              </button>
            </div>

            </div>{/* space-y-4 끝 */}
          </div>
        </div>
      )}
      {/* ===== 거래처 주소 불일치 팝업 (3파트 배차관리와 동일) ===== */}
      <PlaceConflictPopup open={placeConflictOpen} queue={placeConflictQueue} setQueue={setPlaceConflictQueue} setOpen={setPlaceConflictOpen} savePlaceSmart={savePlaceSmart} upsertPlace={upsertPlace} editableTitle />
      {fareCertRow && (
        <FareCertModal row={fareCertRow} companyName={userCompany} onClose={() => setFareCertRow(null)} />
      )}
      {scheduleChartRows && (
        <ScheduleChartModal rows={scheduleChartRows} companyName={userCompany} authorName={userNameMap.get(String(auth.currentUser?.email || "").trim().toLowerCase()) || ""} onClose={() => setScheduleChartRows(null)} />
      )}
      {palletSlipRows && (
        <PalletSlipModal rows={palletSlipRows} clients={clients} userCompany={userCompany} userNameMap={userNameMap} patchDispatch={patchDispatch} onClose={() => setPalletSlipRows(null)} />
      )}
      {bulkEditRows && !bulkLegacy && (
        <BulkEditCopyModal rows={bulkEditRows} patchDispatch={patchDispatch} onClose={() => setBulkEditRows(null)} onDateShift={() => setDateShiftRows(bulkEditRows)}
          onLegacyEdit={() => setBulkLegacy(true)} onCopyOne={(o) => submitCopyOrderPC(o, approvedShippers)}
          drivers={drivers} clients={clients} places={placeRows?.length ? placeRows : places} tonOptions={tonOptions} upsertDriver={upsertDriver}
          vehicleTypes={withCustomVehicleTypes(VEHICLE_TYPES)}
          isViewer={isViewer} toast={sflowToast} />
      )}
      {bulkEditRows && bulkLegacy && (
        <BulkEditModal rows={bulkEditRows} patchDispatch={patchDispatch} onClose={() => { setBulkLegacy(false); setBulkEditRows(null); }} onDateShift={() => setDateShiftRows(bulkEditRows)} />
      )}
      {dateShiftRows && (
        <BulkDateShiftModal rows={dateShiftRows} patchDispatch={patchDispatch} onClose={() => setDateShiftRows(null)} />
      )}
      {/* ================= 복사 슬라이드 패널 (FULL LABEL VERSION) ================= */}
{copyPanelOpen && copyTarget && (
  <div
  className={`fixed inset-0 ${dailyCloseIssueCtx ? "z-[9999999]" : "z-[99999]"}`}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.stopPropagation();
    }
  }}
>
    <div
      className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      onClick={() => { setCopyPanelOpen(false); setDailyCloseIssueCtx(null); }}
    />

    <div
      className={copyPanelStyle === "B"
        ? "absolute rounded-2xl bg-[#F4F6FA] shadow-2xl overflow-y-auto"
        : "absolute top-0 right-0 h-full w-[min(1180px,96vw)] bg-[#F4F6FA] shadow-2xl border-l overflow-y-auto"}
      style={copyPanelStyle === "B" ? {
        top: "50%", left: "50%", width: "min(1180px, 94vw)", maxHeight: "92vh",
        transform: `translate(-50%, -50%) translate(${copyPanelDrag.x}px, ${copyPanelDrag.y}px)`,
      } : undefined}
    >

      <div className="cp-compact px-5 pb-5 space-y-4 text-[14px]">

        {/* HEADER — B스타일에서는 이 영역을 드래그 손잡이로 사용 */}
<div
  className="sticky top-0 z-20 -mx-5 mb-1 flex justify-between items-center gap-3 px-5 py-2.5 text-white shadow-[0_6px_18px_rgba(11,20,40,0.25)]"
  onMouseDown={copyPanelStyle === "B" ? handleCopyPanelDragStart : undefined}
  style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)", ...(copyPanelStyle === "B" ? { cursor: "grab" } : {}) }}
>
  <div className="min-w-0 flex-1">
    <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>ORDER · COPY / EDIT</div>
    <h2 className="text-[18px] font-black leading-tight truncate"><EditableText id="copyPanel.title" defaultText="오더 복사 / 수정 패널" /> <span className="ml-1 text-[13.5px] font-semibold text-white/60">{copyTarget?.거래처명} · {copyTarget?.상차지명} → {copyTarget?.하차지명}</span></h2>
  </div>
  <div className="flex gap-2 items-center shrink-0 [&_button]:whitespace-nowrap [&_button]:shrink-0">{/* ⭐ 2026-11-11 좁은 화면에서 단추 글자가 두 줄로 꺾이지 않게(제목이 대신 줄어든다) */}
    {/* A/B 스타일 전환 */}
    <button type="button" onClick={toggleCopyPanelStyle}
      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-bold transition"
      title="패널 스타일 전환 (A: 우측고정 / B: 중앙이동)">
      {copyPanelStyle}
    </button>
    <CopyPanelExtras order={copyTarget} userNameMap={userNameMap} />
    <button
    onClick={handleCopyFareSearch}
    className="px-3.5 h-8 rounded-lg text-[13px] font-bold transition bg-white/10 hover:bg-white/20 ring-1 ring-white/25 text-white"
  >
    <EditableText id="copyPanel.운임조회" defaultText="운임조회" />
  </button>

    {/* 수정 저장 */}
<button
  onClick={async () => {
    if (isViewer) return showAlert("조회전용 권한으로 수정할 수 없습니다.");
    const id = getId(copyTarget);
    if (!id) {
      showAlert("수정할 오더 정보를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }
    if (isReversedDateOrder(copyTarget?.상차일, copyTarget?.하차일)) {
      showAlert(REVERSED_DATE_ORDER_MSG);
      return;
    }
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    if (!(await cpDrvEdit.finish(copyTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택

    // ✅ 화물내용: 이미 onChange에서 동기화되어 있음
    const finalCargo = copyTarget.화물내용 || "";

    const payload = {
      ...copyTarget,
      화물내용: finalCargo, 독차: dokchaOn(copyTarget), // ⭐ 2026-11-06 혼적·왕복이 아니면 독차(기본)
      전화번호: String(copyTarget.전화번호 || "").replace(/\D/g, ""),
      updatedAt: Date.now(),
    };

    // ✅ 임시 UI 필드 제거 (DB에 저장하면 안 됨)
    delete payload.화물수량;
    delete payload.화물타입;
    delete payload.톤수값;
    delete payload.톤수타입;

// ✅ UI 먼저
    setCopyPanelOpen(false);
    { // 🎬 2026-11-25 이번 저장으로 배차가 됐으면 "배차 완료" 알림 뒤에 이어서 뜨게 한다
      const _o = (dispatchData || []).find((r) => getId(r) === id);
      const _np = normalizePlate(copyTarget.차량번호 || "");
      sflowToast("오더 수정 완료", "success", _np && _np !== normalizePlate(_o?.차량번호 || "") ? { afterDispatch: true } : null);
    }
    setEdited(prev => { const next = { ...prev }; delete next[id]; return next; });
    // ⭐ 일마감 검증에서 열었던 수정이면, 방금 고친 내용이 반영되도록 검증을
    // 자동으로 다시 계산한다(오류/경고).
    if (dailyCloseIssueCtx) {
      setDailyCloseIssueCtx(null);
      setTimeout(() => {
        runDailyClose();
      }, 300);
    }

    // ✅ 백그라운드 저장
    patchDispatch(id, payload).catch(console.error);
    if (payload.상차지명) savePlaceSmart(payload.상차지명, payload.상차지주소||"", payload.상차지담당자||"", payload.상차지담당자번호||"", null, undefined,
      (payload.상차지오더메모 !== undefined || payload.상차지오더메모팝업표시 !== undefined || payload.상차지기사전달주의사항 !== undefined) ? { 오더메모: payload.상차지오더메모, 팝업표시: payload.상차지오더메모팝업표시, 기사전달주의사항: payload.상차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (payload.하차지명) savePlaceSmart(payload.하차지명, payload.하차지주소||"", payload.하차지담당자||"", payload.하차지담당자번호||"", null, undefined,
      (payload.하차지오더메모 !== undefined || payload.하차지오더메모팝업표시 !== undefined || payload.하차지기사전달주의사항 !== undefined) ? { 오더메모: payload.하차지오더메모, 팝업표시: payload.하차지오더메모팝업표시, 기사전달주의사항: payload.하차지기사전달주의사항 } : undefined
    ).catch(console.error);
    const plate = normalizePlate(payload.차량번호 || "");
    if (plate) {
      const d = (drivers || []).find(x => normalizePlate(x.차량번호) === plate);
      emitBlackIfNeeded(d);
      if (payload.이름 && !d) {
        upsertDriver({ 차량번호: payload.차량번호, 이름: payload.이름, 전화번호: payload.전화번호||"" }).catch(console.error);
      }
    }


  }}
  className="px-3.5 h-8 bg-white text-[#0F1A30] rounded-lg text-[13px] font-black hover:bg-[#EEF3FB] transition"
>
  <EditableText id="copyPanel.수정저장" defaultText="수정 저장" />
</button>



{/* 복사 등록 */}
<button
  onClick={async () => {

    if (!copyTarget) {
      showAlert("복사할 데이터가 없습니다.");
      return;
    }
    if (!(await cpDrvEdit.finish(copyTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택

    const ok = await submitCopyOrdersPC(copyTarget, approvedShippers, undefined, (dispatchData || []).find((r) => getId(r) === getId(copyTarget))); // ⭐ 2026-11-06 몇 건·날짜 고르기 · 🛠 2026-11-24 패널에서 바꾼 날짜로 시작
    if (ok === false) return;
    sflowToast(ok > 1 ? `${ok}건 복사 등록 완료` : "복사 등록 완료", "success");

    setCopyPanelOpen(false);
    setDailyCloseIssueCtx(null);
    if (copyTarget.상차지명) savePlaceSmart(copyTarget.상차지명, copyTarget.상차지주소 || "", copyTarget.상차지담당자 || "", copyTarget.상차지담당자번호 || "", null, undefined,
      (copyTarget.상차지오더메모 !== undefined || copyTarget.상차지오더메모팝업표시 !== undefined || copyTarget.상차지기사전달주의사항 !== undefined) ? { 오더메모: copyTarget.상차지오더메모, 팝업표시: copyTarget.상차지오더메모팝업표시, 기사전달주의사항: copyTarget.상차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (copyTarget.하차지명) savePlaceSmart(copyTarget.하차지명, copyTarget.하차지주소 || "", copyTarget.하차지담당자 || "", copyTarget.하차지담당자번호 || "", null, undefined,
      (copyTarget.하차지오더메모 !== undefined || copyTarget.하차지오더메모팝업표시 !== undefined || copyTarget.하차지기사전달주의사항 !== undefined) ? { 오더메모: copyTarget.하차지오더메모, 팝업표시: copyTarget.하차지오더메모팝업표시, 기사전달주의사항: copyTarget.하차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (copyTarget.차량번호 && copyTarget.이름) {
      const existingD = (drivers||[]).find(d => normalizePlate(d.차량번호) === normalizePlate(copyTarget.차량번호));
      if (!existingD) {
        upsertDriver({ 차량번호: copyTarget.차량번호, 이름: copyTarget.이름, 전화번호: copyTarget.전화번호||"" }).catch(console.error);
      }
    }

  }}
    className="px-3.5 h-8 bg-[#8FB0F0] text-[#0B1428] rounded-lg text-[13px] font-black hover:bg-[#CFE0FF] transition"
>
  <EditableText id="copyPanel.복사등록" defaultText="복사 등록" />
</button>



{/* 닫기 */}
<button
  onClick={() => { setCopyPanelOpen(false); setDailyCloseIssueCtx(null); }}
  className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/25 text-white/70 hover:text-white hover:bg-white/10 transition text-lg"
>
  ✕
</button>

  </div>
</div>

{/* ⭐ 일마감 검증 목록에서 클릭해 이 패널을 열었을 때만 나타나는 문제점 배너 —
    오류/경고 중 이 오더에 해당하는 항목을 전부 모아 보여준다. */}
{dailyCloseIssueCtx && dailyCloseIssueCtx.length > 0 && (
  <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
    <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
      <div className="text-[13px] font-bold text-[#1B2B4B]">일마감 검증: 이 오더의 문제점 ({dailyCloseIssueCtx.length}건)</div>
      {dailyCloseIssueCtx.some(it => it.level === "오류") && (
        <button
          type="button"
          onClick={handleAckDailyCloseIssue}
          title="아직 배차 전이라 비어있는 게 당연한 항목이면, 배차완료 전까지 일마감 오류 목록에서 뺍니다"
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white transition whitespace-nowrap"
        >
          미입력 확인 (오류에서 제외)
        </button>
      )}
    </div>
    <div className="space-y-1.5">
      {dailyCloseIssueCtx.map((it, i) => (
        <div key={i} className="text-[12px] text-gray-700 flex items-start gap-2">
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${it.level === "오류" ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-gray-600 border-gray-300"}`}>{it.level}</span>
          <span>{it.msg}</span>
        </div>
      ))}
    </div>
  </div>
)}
{/* ================= 오더 유형 버튼 ================= */}
<div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-[#E3E8F0] px-5 py-2.5">
  <span className="text-[13.5px] font-bold text-[#5B6B85] mr-1">오더 유형</span>
  {/* ⭐ 2026-11-09 독차 버튼 제거 — 혼적·왕복이 아니면 자동으로 독차 */}
  <button type="button"
    onClick={() => setCopyTarget(p => ({ ...p, 혼적: !p.혼적, 독차: !!p.혼적 }))} /* ⭐ 2026-11-06 혼적을 끄면 독차(기본) */
    className={`px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${copyTarget.혼적 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
  ><EditableText id="misc.btn.38150.혼적" defaultText="혼적" /></button>
  <button type="button"
    onClick={() => setCopyTarget(p => (p.운행유형 === "왕복" ? { ...p, 운행유형: "편도", 회전수: 1, 메모: withRotationMemo(p.메모, 1) } : { ...p, 운행유형: "왕복" }))}
    className={`px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${copyTarget.운행유형 === "왕복" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
  ><EditableText id="misc.btn.38154.왕복" defaultText="왕복" /></button>
  {/* ⭐ 왕복일 때만 회전수 선택 (기존 오더 수정/복사는 한 오더로 묶기) */}
  {copyTarget.운행유형 === "왕복" && (
    <RotationPicker size="sm" allowSplit={false} count={copyTarget.회전수 || 1}
      onChange={(c) => setCopyTarget(p => ({ ...p, 회전수: c, 메모: withRotationMemo(p.메모, c) }))} />
  )}
  <button type="button"
    onClick={() => setCopyTarget(p => ({ ...p, 긴급: !p.긴급 }))}
    className={`px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${copyTarget.긴급 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
  ><EditableText id="misc.btn.38158.긴급" defaultText="긴급" /></button>
  {/* 👤 2026-11-13 담당자 변경 — 오더 유형 줄 오른쪽 끝 */}
  <OrderStaffFields className="ml-auto" order={copyTarget} setOrder={setCopyTarget} disabled={isViewerNow()} />
</div>
{/* ================= 거래처 정보 ================= */}
<section className="bg-white rounded-xl border border-[#E3E8F0]">
  <div className="bg-[#1B2B4B] px-5 py-2 rounded-t-xl"><h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.거래처정보" defaultText="거래처 정보" /></h3></div>
  <div className="px-5 py-3">

  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <div className="text-[13px] font-bold text-gray-900">거래처명</div>
      <button type="button" onClick={() => openNewClientModal(copyTarget?.거래처명)}
        className="text-[11px] font-bold text-[#1B2B4B] hover:underline">+ 신규등록</button>
    </div>
    <div className="relative">
      <input autoComplete="off"
      disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
        className={cpInputStyle}
        value={copyTarget?.거래처명 ?? ""}
        onChange={(e)=>{
          const v = e.target.value;

          setCopyTarget(p=>({...p, 거래처명:v}));

          const list = filterClients(v);
          setCopyClientOptions(list);
          setShowCopyClientDropdown(true);
          setCopyClientIndex(0);
        }}

        onKeyDown={(e)=>{
          if(!showCopyClientDropdown) return;

          if (e.key === "Escape") {
            setShowCopyClientDropdown(false);
            return;
          }
          if(e.key==="ArrowDown"){
            e.preventDefault();
            setCopyClientIndex(i=>Math.min(i+1, copyClientOptions.length-1));
          }
          if(e.key==="ArrowUp"){
            e.preventDefault();
            setCopyClientIndex(i=>Math.max(i-1,0));
          }
          if(e.key==="Enter"){
  e.preventDefault();

  const c = copyClientOptions[copyClientIndex];
  if(!c) return;

setCopyTarget(prev=>({
    ...prev,
    거래처명: c.거래처명,
    거래처전화번호: c.연락처 || "",
    거래처담당자: c.담당자 || "",
  }));

  setClientApplyPopup(c);
  checkWarningStatus(c.거래처명, "거래처");
  setShowCopyClientDropdown(false);
}
          if(e.key==="Tab"){
            const c = copyClientOptions[copyClientIndex];
            if(c){
              setCopyTarget(prev=>({
                ...prev,
                거래처명: c.거래처명,
                거래처전화번호: c.연락처 || "",
                거래처담당자: c.담당자 || "",
              }));
              checkWarningStatus(c.거래처명, "거래처");
              setShowCopyClientDropdown(false);
            }
          }
        }}

        onBlur={()=>setTimeout(()=>setShowCopyClientDropdown(false),150)}
      />

      {showCopyClientDropdown && (
        <div ref={copyClientListRef5} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto shadow rounded-md">
          {copyClientOptions.map((c,i)=>(
            <div
              key={i}
              className={`px-3 py-2 cursor-pointer ${
                i===copyClientIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
              }`}
              onMouseDown={()=>{
                setCopyTarget(prev=>({
                  ...prev,
                  거래처명: c.거래처명,
                  거래처전화번호: c.연락처 || "",
                  거래처담당자: c.담당자 || "",
                }));
                checkWarningStatus(c.거래처명, "거래처");
                setShowCopyClientDropdown(false);
              }}
            >
              <div className="font-semibold">{c.거래처명}</div>
              <div className={`text-xs ${i===copyClientIndex ? "text-white/70" : "text-gray-500"}`}>{c.주소}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
  </div>
</section>
        {/* ================= 상하차 정보 ================= */}
<section className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
  <div className="bg-[#1B2B4B] px-5 py-2"><h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.상하차정보" defaultText="상하차 정보" /></h3></div>
  <div className="px-5 py-3">

  <div className="grid grid-cols-2 gap-x-8">

    {/* 상차 */}
    <div className="space-y-1.5">
      <div className="text-[12px] font-bold text-blue-600 pb-1 border-b border-blue-100">상차</div>
      <CpField label={<>
        상차일
        {/* ⭐ 묶음(다중근무일) 오더는 상차일 한 칸만 바꿔서는 일정 전체를 옮길 수 없다는
            피드백으로, 근무일 전체를 다시 고를 수 있는 달력 편집 버튼을 추가한다. */}
        <button
          type="button"
          title="근무일 수정(다중선택)"
          onClick={(e) => { e.stopPropagation(); setCopyPanelWorkDatesOpen(true); }}
          className="w-4 h-4 rounded flex items-center justify-center text-gray-400 hover:text-[#1B2B4B] hover:bg-gray-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      </>}>
        <CustomDatePicker
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.상차일 ?? ""}
          onChange={(e)=>setCopyTarget(p=>withPickupDate(p, e.target.value))}
          multiSelect
          multiActive={copyTarget?.복수근무일 === true ? true : copyTarget?.복수근무일 === false ? false : _parseWorkDates(copyTarget?.근무일자목록).length > 1}
          onToggleMulti={() => setCopyTarget(p => {
            const curMulti = p?.복수근무일 === true ? true : p?.복수근무일 === false ? false : _parseWorkDates(p?.근무일자목록).length > 1;
            if (curMulti) {
              // 묶음 끄기 — 근무일자목록을 비워서, 다음에 다시 열어도 과거 데이터로
              // 묶음 모드가 저절로 켜지지 않게 한다.
              return { ...p, 복수근무일: false, 근무일자목록: [] };
            }
            const seed = _parseWorkDates(p?.근무일자목록);
            return { ...p, 복수근무일: true, 근무일자목록: seed.length > 0 ? seed : (p?.상차일 ? [p.상차일] : []) };
          })}
          workDates={_parseWorkDates(copyTarget?.근무일자목록)}
          onToggleWorkDate={(dateStr) => {
            if (!dateStr) return;
            setCopyTarget(p => {
              const set = new Set(_parseWorkDates(p?.근무일자목록));
              if (set.has(dateStr)) set.delete(dateStr); else set.add(dateStr);
              const sorted = Array.from(set).sort();
              return { ...p, 근무일자목록: sorted, 상차일: sorted[0] || p?.상차일, 하차일: sorted[sorted.length - 1] || p?.하차일 };
            });
          }}
          onClearWorkDates={() => setCopyTarget(p => ({ ...p, 근무일자목록: [], 복수근무일: false }))}
          displayOverride={(() => { const wd = _parseWorkDates(copyTarget?.근무일자목록); return wd.length > 1 ? `${copyTarget?.상차일 || ""} 외 ${wd.length - 1}일` : undefined; })()}
        />
      </CpField>

      <CpField label="상차시간">
        {/* ⭐ 2026-11-06 이전/이후(시간구분) — 등록창(3파트)과 같게 */}
        <div className="flex items-center gap-2"><div className="min-w-0"><TimeAmPmPicker
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          value={copyTarget?.상차시간 ?? ""}
          onChange={v => setCopyTarget(p=>({...p, 상차시간:v}))}
          selectCls={cpInputStyle}
        /></div>
        <TimeBasisToggle value={copyTarget?.상차시간기준} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} onChange={(v) => setCopyTarget(p => ({ ...p, 상차시간기준: v }))} /></div>
      </CpField>
      <CpField label="상차방법">
  <CompanyOptionPicker optKey="상하차방법" title="상차방법" placeholder="선택" noneLabel="선택" disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} className={cpInputStyle} value={copyTarget?.상차방법 ?? ""} onChange={(__v) => ((e)=>setCopyTarget(p=>({...p, 상차방법:e.target.value})))({ target: { value: __v } })} />
</CpField>

      {/* 🔥 상차지명 자동완성 */}
      <CpField label={<span className="flex items-center gap-1.5">상차지명<OrderMemoIconButton onClick={() => openPanelMemoC5("pickup")} hasMemo={hasPanelMemoC5("pickup")} /></span>}>
        <div className="relative">
          <input autoComplete="off"
          disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
            className={cpInputStyle}
            value={copyTarget?.상차지명 ?? ""}
            onChange={(e)=>{
              const v = e.target.value;
              setCopyTarget(p=>({...p, 상차지명:v, ...(v.trim() === "" && { 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "" })}));
              setCopyPlaceType("pickup");

              const list = rankPlaces(filterPlaces(v), v);
setCopyPlaceOptions(list);
              setShowCopyPlaceDropdown(true);
              setCopyActiveIndex(0);
            }}
            onKeyDown={(e)=>{
              if(!showCopyPlaceDropdown || copyPlaceType!=="pickup") return;

              if (e.key === "Escape") {
                setShowCopyPlaceDropdown(false);
                return;
              }
              if(e.key==="ArrowDown"){
                e.preventDefault();
                setCopyActiveIndex(i=>Math.min(i+1, copyPlaceOptions.length-1));
              }
              if(e.key==="ArrowUp"){
                e.preventDefault();
                setCopyActiveIndex(i=>Math.max(i-1,0));
              }
              if(e.key==="Enter"){
                e.preventDefault();
                const p = copyPlaceOptions[copyActiveIndex];
                if(!p) return;
                const cts5ce = (p.contacts || []).filter(c => c.name?.trim());
                const ucts5ce = [...new Map(cts5ce.map(c => [c.name.trim(), c])).values()];
                const prim5ce = ucts5ce.find(c => c.isPrimary) || ucts5ce[0];
                setCopyTarget(prev=>({
                  ...prev,
                  상차지명:p.업체명,
                  상차지주소:p.주소 || "",
                  상차지담당자:prim5ce?.name || p.담당자 || "",
                  상차지담당자번호:prim5ce?.phone || p.담당자번호 || "",
                }));
                if (ucts5ce.length > 1) setPanelContactPopup5({ type: "pickup", place: p, contacts: ucts5ce, setter: setCopyTarget });
                checkWarningStatus(p.업체명, "상차지");
                setShowCopyPlaceDropdown(false);
              }
              if(e.key==="Tab"){
                const p = copyPlaceOptions[copyActiveIndex];
                if(p){
                  const cts5ceT = (p.contacts || []).filter(c => c.name?.trim());
                  const ucts5ceT = [...new Map(cts5ceT.map(c => [c.name.trim(), c])).values()];
                  const prim5ceT = ucts5ceT.find(c => c.isPrimary) || ucts5ceT[0];
                  setCopyTarget(prev=>({
                    ...prev,
                    상차지명:p.업체명,
                    상차지주소:p.주소 || "",
                    상차지담당자:prim5ceT?.name || p.담당자 || "",
                    상차지담당자번호:prim5ceT?.phone || p.담당자번호 || "",
                  }));
                  checkWarningStatus(p.업체명, "상차지");
                  setShowCopyPlaceDropdown(false);
                }
              }
            }}
            onBlur={()=>setTimeout(()=>setShowCopyPlaceDropdown(false),150)}
          />

          {showCopyPlaceDropdown && copyPlaceType==="pickup" && (
            <div ref={copyPlaceDropdownListRef5} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto shadow rounded-md">
              {copyPlaceOptions.map((p,i)=>(
                <div
                  key={i}
                  className={`px-3 py-2 cursor-pointer ${
                    i===copyActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
                  }`}
                  onMouseDown={()=>{
                    const cts5c = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts5c = [...new Map(cts5c.map(c => [c.name.trim(), c])).values()];
                    const prim5c = ucts5c.find(c => c.isPrimary) || ucts5c[0];
                    setCopyTarget(prev=>({
                      ...prev,
                      상차지명:p.업체명,
                      상차지주소:p.주소 || "",
                      상차지담당자:prim5c?.name || p.담당자 || "",
                      상차지담당자번호:prim5c?.phone || p.담당자번호 || "",
                    }));
                    if (ucts5c.length > 1) setPanelContactPopup5({ type: "pickup", place: p, contacts: ucts5c, setter: setCopyTarget });
                    checkWarningStatus(p.업체명, "상차지");
                    setShowCopyPlaceDropdown(false);
                  }}
                >
                  <div className="font-semibold">{p.업체명}</div>
                  <div className={`text-xs ${i===copyActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CpField>

      {/* 🔥 다시 추가된 칸들 */}
      <CpField label={<span className="flex items-center gap-1.5">상차지주소{(copyTarget?.상차지주소 || "").length > 30 && (
        <button type="button" tabIndex={-1} onClick={() => showAlert(copyTarget?.상차지주소 || "")} className="text-[11px] text-[#1B2B4B] font-semibold underline"><EditableText id="misc.btn.38453.더보기" defaultText="더보기" /></button>
      )}</span>}>
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.상차지주소 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 상차지주소:e.target.value}))}
        />
      </CpField>

      <CpField label={<span className="flex items-center justify-between w-full">상차지 담당자명<ContactPickerIconButton title="상차지 담당자명 선택" onClick={() => { const nm = copyTarget?.상차지명 || ""; if (!nm.trim()) return showAlert("상차지명을 먼저 입력하세요."); const p = (mergedClients || []).find(x => nameKeyOf(x.업체명) === nameKeyOf(nm)); const cs = uniqueContactsOf(p); if (!cs.length) return showAlert("등록된 담당자가 없습니다."); setPanelContactPopup5({ type: "pickup", place: p, contacts: cs, setter: setCopyTarget }); }} /></span>}>
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.상차지담당자 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 상차지담당자:e.target.value}))}
        />
      </CpField>

      <CpField label="상차지 연락처">
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.상차지담당자번호 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 상차지담당자번호:formatPhone(e.target.value)}))}
        />
      </CpField>

      {/* ── 상차 경유지 표시 ── */}
      {(() => {
        const _sp = (v) => { if (Array.isArray(v) && v.length > 0) return v; if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {} } if (v && typeof v === "object" && !Array.isArray(v)) { const ks = Object.keys(v); if (ks.length > 0 && ks.every(k => /^\d+$/.test(k))) return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]); if (v.업체명) return [v]; } return []; };
        const stops = _sp(copyTarget?.경유상차목록 || copyTarget?.경유지_상차).filter(s => s && (s.업체명?.trim() || s.주소?.trim()));
        return <WaypointSection stops={stops} type="pickup" onSave={(newList) => setCopyTarget(p => ({ ...p, 경유상차목록: newList, 경유지_상차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mt-1" orderDate={copyTarget?.상차일 || ""} />;
      })()}

    </div>

{/* 하차 */}
    <div className="space-y-1.5">
      <div className="text-[12px] font-bold text-red-500 pb-1 border-b border-red-100">하차</div>
      <CpField label="하차일">
        <CustomDatePicker
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.하차일 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 하차일:e.target.value}))}
        />
      </CpField>

      <CpField label="하차시간">
        {/* ⭐ 2026-11-06 이전/이후(시간구분) — 등록창(3파트)과 같게 */}
        <div className="flex items-center gap-2"><div className="min-w-0"><TimeAmPmPicker
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          value={copyTarget?.하차시간 ?? ""}
          onChange={v => setCopyTarget(p=>({...p, 하차시간:v}))}
          selectCls={cpInputStyle}
        /></div>
        <TimeBasisToggle value={copyTarget?.하차시간기준} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} onChange={(v) => setCopyTarget(p => ({ ...p, 하차시간기준: v }))} /></div>
      </CpField>
<CpField label="하차방법">
  <CompanyOptionPicker optKey="상하차방법" title="하차방법" placeholder="선택" noneLabel="선택" disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} className={cpInputStyle} value={copyTarget?.하차방법 ?? ""} onChange={(__v) => ((e)=>setCopyTarget(p=>({...p, 하차방법:e.target.value})))({ target: { value: __v } })} />
</CpField>
      <CpField label={<span className="flex items-center gap-1.5">하차지명<OrderMemoIconButton onClick={() => openPanelMemoC5("drop")} hasMemo={hasPanelMemoC5("drop")} /></span>}>
        <div className="relative">
          <input autoComplete="off"
          disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
            className={cpInputStyle}
            value={copyTarget?.하차지명 ?? ""}
            onChange={(e)=>{
              const v = e.target.value;
              setCopyTarget(p=>({...p, 하차지명:v, ...(v.trim() === "" && { 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "" })}));
              setCopyPlaceType("drop");

              const list = rankPlaces(filterPlaces(v), v);
setCopyPlaceOptions(list);
              setShowCopyPlaceDropdown(true);
              setCopyActiveIndex(0);
            }}
            onKeyDown={(e)=>{
              if(!showCopyPlaceDropdown || copyPlaceType!=="drop") return;

              if (e.key === "Escape") {
                setShowCopyPlaceDropdown(false);
                return;
              }
              if(e.key==="ArrowDown"){
                e.preventDefault();
                setCopyActiveIndex(i=>Math.min(i+1, copyPlaceOptions.length-1));
              }
              if(e.key==="ArrowUp"){
                e.preventDefault();
                setCopyActiveIndex(i=>Math.max(i-1,0));
              }
              if(e.key==="Enter"){
                e.preventDefault();
                const p = copyPlaceOptions[copyActiveIndex];
                if(!p) return;
                const cts5cde2 = (p.contacts || []).filter(c => c.name?.trim());
                const ucts5cde2 = [...new Map(cts5cde2.map(c => [c.name.trim(), c])).values()];
                const prim5cde2 = ucts5cde2.find(c => c.isPrimary) || ucts5cde2[0];
                setCopyTarget(prev=>({
                  ...prev,
                  하차지명:p.업체명,
                  하차지주소:p.주소 || "",
                  하차지담당자:prim5cde2?.name || p.담당자 || "",
                  하차지담당자번호:prim5cde2?.phone || p.담당자번호 || "",
                }));
                if (ucts5cde2.length > 1) setPanelContactPopup5({ type: "drop", place: p, contacts: ucts5cde2, setter: setCopyTarget });
                checkWarningStatus(p.업체명, "하차지");
                setShowCopyPlaceDropdown(false);
              }
              if(e.key==="Tab"){
                const p = copyPlaceOptions[copyActiveIndex];
                if(p){
                  const cts5cde2T = (p.contacts || []).filter(c => c.name?.trim());
                  const ucts5cde2T = [...new Map(cts5cde2T.map(c => [c.name.trim(), c])).values()];
                  const prim5cde2T = ucts5cde2T.find(c => c.isPrimary) || ucts5cde2T[0];
                  setCopyTarget(prev=>({
                    ...prev,
                    하차지명:p.업체명,
                    하차지주소:p.주소 || "",
                    하차지담당자:prim5cde2T?.name || p.담당자 || "",
                    하차지담당자번호:prim5cde2T?.phone || p.담당자번호 || "",
                  }));
                  checkWarningStatus(p.업체명, "하차지");
                  setShowCopyPlaceDropdown(false);
                }
              }
            }}
            onBlur={()=>setTimeout(()=>setShowCopyPlaceDropdown(false),150)}
          />

          {showCopyPlaceDropdown && copyPlaceType==="drop" && (
            <div ref={copyPlaceDropdownListRef5} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto shadow rounded-md">
              {copyPlaceOptions.map((p,i)=>(
                <div
                  key={i}
                  className={`px-3 py-2 cursor-pointer ${
                    i===copyActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
                  }`}
                  onMouseDown={()=>{
                    const cts5cd2 = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts5cd2 = [...new Map(cts5cd2.map(c => [c.name.trim(), c])).values()];
                    const prim5cd2 = ucts5cd2.find(c => c.isPrimary) || ucts5cd2[0];
                    setCopyTarget(prev=>({
                      ...prev,
                      하차지명:p.업체명,
                      하차지주소:p.주소 || "",
                      하차지담당자:prim5cd2?.name || p.담당자 || "",
                      하차지담당자번호:prim5cd2?.phone || p.담당자번호 || "",
                    }));
                    if (ucts5cd2.length > 1) setPanelContactPopup5({ type: "drop", place: p, contacts: ucts5cd2, setter: setCopyTarget });
                    checkWarningStatus(p.업체명, "하차지");
                    setShowCopyPlaceDropdown(false);
                  }}
                >
                  <div className="font-semibold">{p.업체명}</div>
                  <div className={`text-xs truncate ${i===copyActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CpField>

      {/* 🔥 다시 추가된 하차 칸들 */}
      <CpField label={<span className="flex items-center gap-1.5">하차지주소{(copyTarget?.하차지주소 || "").length > 30 && (
        <button type="button" tabIndex={-1} onClick={() => showAlert(copyTarget?.하차지주소 || "")} className="text-[11px] text-[#1B2B4B] font-semibold underline"><EditableText id="misc.btn.38630.더보기" defaultText="더보기" /></button>
      )}</span>}>
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.하차지주소 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 하차지주소:e.target.value}))}
        />
      </CpField>

      <CpField label={<span className="flex items-center justify-between w-full">하차지 담당자명<ContactPickerIconButton title="하차지 담당자명 선택" onClick={() => { const nm = copyTarget?.하차지명 || ""; if (!nm.trim()) return showAlert("하차지명을 먼저 입력하세요."); const p = (mergedClients || []).find(x => nameKeyOf(x.업체명) === nameKeyOf(nm)); const cs = uniqueContactsOf(p); if (!cs.length) return showAlert("등록된 담당자가 없습니다."); setPanelContactPopup5({ type: "drop", place: p, contacts: cs, setter: setCopyTarget }); }} /></span>}>
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.하차지담당자 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 하차지담당자:e.target.value}))}
        />
      </CpField>

      <CpField label="하차지 연락처">
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.하차지담당자번호 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 하차지담당자번호:formatPhone(e.target.value)}))}
        />
      </CpField>

      {/* ── 하차 경유지 표시 ── */}
      {(() => {
        const _sp = (v) => { if (Array.isArray(v) && v.length > 0) return v; if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {} } if (v && typeof v === "object" && !Array.isArray(v)) { const ks = Object.keys(v); if (ks.length > 0 && ks.every(k => /^\d+$/.test(k))) return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]); if (v.업체명) return [v]; } return []; };
        const stops = _sp(copyTarget?.경유하차목록 || copyTarget?.경유지_하차).filter(s => s && (s.업체명?.trim() || s.주소?.trim()));
        return <WaypointSection stops={stops} type="drop" onSave={(newList) => setCopyTarget(p => ({ ...p, 경유하차목록: newList, 경유지_하차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mt-1" orderDate={copyTarget?.하차일 || ""} />;
      })()}

    </div>

  </div>
</div>
</section>
{/* ===== 스마트 기사 검색 (복사패널) ===== */}
<section className="bg-white rounded-xl border border-[#E3E8F0] divide-y divide-gray-100 overflow-hidden">
  <div className="px-5 pt-3.5 pb-0"><h3 className="text-[14px] font-bold text-[#1B2B4B] flex items-center gap-1.5"><span className="w-1 h-3.5 bg-[#1B2B4B] rounded-full inline-block"></span>기사 스마트 검색</h3></div>
  <div className="px-4 py-2">
    <div className="relative">
      <input autoComplete="off"
        className="w-full border-2 border-[#1B2B4B] rounded-lg px-3 py-2 text-[14px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-500"
        placeholder="이름·차량번호·전화번호 또는 문자 내용 붙여넣기 → Enter로 자동 적용"
        value={smartQ5}
        onChange={e=>handleSmart5Input(e.target.value)}
        onKeyDown={e=>handleSmart5KeyDown(e, copyTarget, setCopyTarget)}
        onBlur={e=>{ setTimeout(()=>{ if(e.target.value.trim().length>4) applySmart5(copyTarget,setCopyTarget,e.target.value); setSmartList5([]); setSmart5ActiveIdx(-1); },200);}}
      />
      {smartList5.length>0 && (
      <div className="absolute z-[9999] w-full bg-white border-2 border-[#1B2B4B] rounded-xl shadow-xl mt-0.5 overflow-hidden">
          <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-semibold">등록된 기사 {smartList5.length}명</div>
          {smartList5.map((d,i)=>(
            <div key={i} className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 flex items-center justify-between ${i===smart5ActiveIdx?"bg-blue-100":"hover:bg-blue-50"}`}
              onMouseEnter={()=>setSmart5ActiveIdx(i)}
              onMouseDown={()=>selectSmart5Driver(d, setCopyTarget)}>
              <div>
                <div className="font-bold text-gray-900 text-[14px]">{d.이름||"-"}</div>
                <div className="text-[12px] text-gray-500">{d.차량번호} | {formatPhone(d.전화번호)}</div>
              </div>
              {d.등급==="블랙"&&<span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded-full">블랙</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>

{/* ================= 기사정보 ================= */}
  <div className="px-5 pt-3.5 pb-0"><h3 className="text-[14px] font-bold text-[#1B2B4B] flex items-center gap-1.5"><span className="w-1 h-3.5 bg-[#1B2B4B] rounded-full inline-block"></span>기사정보</h3></div>
  <div className="px-5 py-3">

  <div className="grid grid-cols-3 gap-x-6 gap-y-1.5">

   <CpField label="차량번호">
<input autoComplete="off"
  className={cpInputStyle}
  value={copyTarget?.차량번호 || ""}

  onKeyDown={(e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      const plate = normalizePlate(e.target.value);
      if (!plate) return;
      const matches = driverMap.get(plate) || [];
      if (matches.length > 0) return;
      const plateVal = e.target.value;
      driverPanelCallbackRef5.current = async (name, fmt) => {
        setCopyTarget(prev => ({ ...prev, 차량번호: plateVal, 이름: name, 전화번호: fmt, 배차상태: "배차완료" }));
      };
      setDriverConfirmInfo5({ type: "new", 차량번호: plateVal, 이름: "", 전화번호: "" });
      setDriverConfirmRowId5("__panel__");
      setQuickRegMode5(true);
      setQuickRegName5(""); setQuickRegPhone5("");
      setDriverConfirmOpen5(true);
    }
  }}

    onChange={(e) => {

      const v = e.target.value;
      const plate = normalizePlate(v);
      cpDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
      // ⚠️ 동일 차량번호로 기사님이 여러 명 등록돼 있으면(drivers.find가 임의로 1명만
      // 골라 조용히 매칭해버리던 버그) 스마트검색과 동일하게 선택 팝업을 띄운다.
      const matches = driverMap.get(plate) || [];

      if (matches.length > 1) {
        setCopyTarget(prev => ({ ...(prev || {}), 차량번호: v }));
        setCopyDriverPick({ list: matches });
        return;
      }

      const match = matches[0];

      if (match) {
        const grade = match?.등급 || match?.grade || "";
        if (grade === "블랙") {
          setBlackAlert(match);
        } else if (shouldShowDriverMemoAlert(match)) {
          window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: match }));
        }
      }

      setCopyTarget(prev => ({
        ...(prev || {}),
        차량번호: v,
        이름: match?.이름 || "",
        전화번호: formatPhone(match?.전화번호 || ""),
        배차상태: match ? "배차완료" : "배차중",
      }));

    }}

    onBlur={(e) => {

      const plateVal2 = e.target.value;
      const plate = normalizePlate(plateVal2);

      if (!plate) return;

      const matches = driverMap.get(plate) || [];

      // 기존 기사 있으면(1명이든 여러 명이든) 끝
      if (matches.length > 0) return;

      driverPanelCallbackRef5.current = async (name, fmt) => {
        setCopyTarget(prev => ({ ...prev, 차량번호: plateVal2, 이름: name, 전화번호: fmt, 배차상태: "배차완료" }));
      };
      setDriverConfirmInfo5({ type: "new", 차량번호: plateVal2, 이름: "", 전화번호: "" });
      setDriverConfirmRowId5("__panel__");
      setQuickRegMode5(true);
      setQuickRegName5(""); setQuickRegPhone5("");
      setDriverConfirmOpen5(true);

    }}
  />
</CpField>

    {/* ⭐ 2026-11-05 매칭 기사 이름·전화 잠금 + [수정] */}
    <DriverNamePhoneEdit variant="cp" target={copyTarget} setTarget={setCopyTarget} de={cpDrvEdit} drivers={drivers} />

  </div>
</div>
{/* ================= 화물정보 ================= */}
  <div className="px-5 pt-3.5 pb-0"><h3 className="text-[14px] font-bold text-[#1B2B4B] flex items-center gap-1.5"><span className="w-1 h-3.5 bg-[#1B2B4B] rounded-full inline-block"></span>화물정보</h3></div>
  <div className="px-5 py-3">

  <div className="grid grid-cols-3 gap-x-6 gap-y-1.5">

    <CpField label="차량종류">
      <VehicleTypePicker className={cpInputStyle} value={copyTarget?.차량종류 ?? ""} ton={copyTarget?.차량톤수 || ""} onTon={(v) => setCopyTarget((p) => ({ ...p, 차량톤수: v, 톤수값: (String(v).match(/[\d.]+/) || [""])[0], 톤수타입: "톤" }))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} base={["라보/다마스", "카고", "윙/카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "리프트", "오토바이", "기타"]} placeholder="선택" noneLabel="선택" onChange={(__v) => ((e)=>setCopyTarget(p=>({...p, 차량종류:e.target.value})))({ target: { value: __v } })} />
    </CpField>

 <CpField label="차량톤수">

  <div className="flex items-center border rounded-lg overflow-hidden bg-white">

    {/* 숫자 */}
    <input autoComplete="off"
    disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
      className="flex-1 min-w-0 w-0 px-3 py-2 text-[14.5px] font-bold outline-none"
      value={copyTarget?.톤수값 || ""}
      onChange={(e) => {
        const v = e.target.value;

        setCopyTarget(p => ({
          ...p,
          톤수값: v,
          차량톤수: p.톤수타입
            ? `${v}${p.톤수타입}`
            : v
        }));
      }}
      placeholder="1"
    />

    {/* 단위 */}
    <CustomSelect
    disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
      className="shrink-0 w-[78px] pl-3 pr-6 py-2 bg-[#1B2B4B] text-white text-[14px] font-bold outline-none cursor-pointer"
      value={copyTarget?.톤수타입 || ""}
      onChange={(e) => {
        const type = e.target.value;

        setCopyTarget(p => ({
          ...p,
          톤수타입: type,
          차량톤수: type
            ? `${p.톤수값 || ""}${type}`
            : (p.톤수값 || "")
        }));
      }}
    >
      <option value="">선택</option>
      {[...new Set([...cpTonTypeOptions, ...(copyTarget?.톤수타입 ? [copyTarget.톤수타입] : [])])].map((v) => <option key={v} value={v}>{v}</option>)}
    </CustomSelect>

  </div>

</CpField>

<CpField label={<span className="flex items-center gap-1 flex-wrap">화물내용<button type="button" tabIndex={-1} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer" onClick={() => setCargoAddPopup({ initialValue: copyTarget?.화물내용||"", onCommit: (v) => setCopyTarget(p=>({...p,화물내용:v})) })}>+ 추가</button><CargoExtraChips value={copyTarget?.화물내용} /></span>}>

  <div className="flex items-center border rounded-lg overflow-hidden bg-white">

    {/* 수량 */}
    <input autoComplete="off"
    disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
      className="flex-1 min-w-0 w-0 px-3 py-2 text-[14.5px] font-bold outline-none"
      value={copyTarget?.화물수량 || ""}
      onChange={(e) => {
        const v = e.target.value;
        setCopyTarget(p => {
          const extras = (p.화물내용 || "").replace(/^[^+]*/, "");
          return { ...p, 화물수량: v, 화물내용: (p.화물타입 ? `${v}${p.화물타입}` : v) + extras };
        });
      }}
      placeholder="1"
    />

    {/* 타입 */}
    <CustomSelect
    disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
      className="shrink-0 w-[96px] pl-3 pr-6 py-2 bg-[#1B2B4B] text-white text-[14px] font-bold outline-none cursor-pointer"
      value={copyTarget?.화물타입 || ""}
      onChange={(e) => {
        const type = e.target.value;
        setCopyTarget(p => {
          const extras = (p.화물내용 || "").replace(/^[^+]*/, "");
          return { ...p, 화물타입: type, 화물내용: (type ? `${p.화물수량 || ""}${type}` : (p.화물수량 || "")) + extras };
        });
      }}
    >
      <option value="">없음</option>
      {[...new Set([...cpCargoTypeOptions, ...(copyTarget?.화물타입 ? [copyTarget.화물타입] : [])])].map((v) => <option key={v} value={v}>{v}</option>)}
    </CustomSelect>

  </div>

</CpField>

  </div>
</div>
        {/* ================= 결제 정보 ================= */}
          <div className="px-5 pt-3.5 pb-0"><h3 className="text-[14px] font-bold text-[#1B2B4B] flex items-center gap-1.5"><span className="w-1 h-3.5 bg-[#1B2B4B] rounded-full inline-block"></span>결제 정보</h3></div>
          <div className="px-5 py-3">

          <div className="grid grid-cols-3 gap-x-5 gap-y-1.5">

            <CpField label="청구운임">
              <input autoComplete="off"
  className={cpInputStyle}
  value={copyTarget.청구운임 ? Number(copyTarget.청구운임).toLocaleString() : ""}
  onChange={(e)=>{
    const v = e.target.value
      .replace(/[^\d-]/g, "")
      .replace(/(?!^)-/g, "");

    setCopyTarget(p=> fareOn ? fareFormChange(p, "청구운임", v, fareR.rules) : forkliftApply(p, {...p, 청구운임: v}, "청구운임")) // ⭐ 2026-11-02 운임규칙
  }}
/>
            </CpField>

            <CpField label="기사운임">
              <input autoComplete="off"
  className={cpInputStyle}
  value={copyTarget.기사운임 ? Number(copyTarget.기사운임).toLocaleString() : ""}
  onChange={(e)=>{
    const v = e.target.value
      .replace(/[^\d-]/g, "")
      .replace(/(?!^)-/g, "");

    setCopyTarget(p=> fareOn ? fareFormChange(p, "기사운임", v, fareR.rules) : forkliftApply(p, {...p, 기사운임: v}, "기사운임")) // ⭐ 2026-11-02 운임규칙
  }}
/>
            </CpField>

            <CpField label="수수료">
              {(() => { const _f = Number(copyTarget.청구운임||0) - Number(copyTarget.기사운임||0) - paidOut(copyTarget); /* 🏗 지게차 */ return (
              <div className={`h-9 flex items-center justify-end bg-[#EEF2F8] border border-[#DCE4F0] rounded-lg px-2.5 font-black text-[15px] whitespace-nowrap tabular-nums ${_f < 0 ? "text-red-600" : "text-[#1B2B4B]"}`}>
                {_f.toLocaleString()} 원
              </div>
              ); })()}
            </CpField>
            <div className="col-span-full"><SpecialFareButton form={copyTarget} setForm={setCopyTarget} /></div>{/* 🏗 2026-11-09 지게차비용 */}
<CpField label="지급방식">
  <CompanyOptionPicker optKey="지급방식" placeholder="선택" noneLabel="선택" disabled={copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile"} className={cpInputStyle} value={copyTarget?.지급방식 ?? ""} onChange={(__v) => ((e)=>setCopyTarget(p=>({...p, 지급방식:e.target.value})))({ target: { value: __v } })} />
</CpField>
{/* ⭐ 2026-11-02 운임규칙 — 오더 복사·수정 패널 운임구분 */}
{fareOn && (
  <CpField label={<>운임구분<FareRuleHint className="ml-1" form={copyTarget} rules={fareR.rules} onReapply={() => setCopyTarget(p => fareFormChange(p, "__reapply", null, fareR.rules))} /></>}>
    <div className="flex items-center gap-1.5"><FareTypeSelect pct={copyTarget?.운임구분수수료율} className="!h-9 !rounded-lg flex-1 min-w-0" placeholder="운임구분 선택(수수료 자동)" rules={fareR.rules} value={copyTarget?.운임구분 || ""} onChange={(v) => setCopyTarget(p => fareFormChange(p, "운임구분", v, fareR.rules))} /><FarePctInput form={copyTarget} rules={fareR.rules} onChange={(v) => setCopyTarget(p => fareFormChange(p, "운임구분수수료율", v, fareR.rules))} /></div>
  </CpField>
)}

<CpField label="배차방식">
  <DispatchWayPicker scope={[copyTarget?.거래처명, copyTarget?.상차지명, copyTarget?.하차지명]} className={cpInputStyle} value={copyTarget?.배차방식 === "선택없음" ? "" : (copyTarget?.배차방식 ?? "")} dir={copyTarget?.콜구분 || ""} onPick={(pk) => setCopyTarget((p) => ({ ...p, ...pk }))} />
</CpField>
<RouteGroupField Field={CpField} className={cpInputStyle} row={copyTarget} onChange={(v) => setCopyTarget((p) => ({ ...p, 담당노선구분: v }))} />
          </div>
</div>
{/* ================= 메모 + 전달사항 ================= */}
{/* ⭐ 2026-11-06 등록창(3파트)과 같은 카드형 — 머리글·중요도·고정 토글·글자 수 */}
  <div className="px-5 pt-3.5 pb-3"><CpMemoNoteCards target={copyTarget} setTarget={setCopyTarget} /></div>
</section>

{/* ===================== 변경 이력(공용 타임라인) — 실시간 패널과 같은 모양 ===================== */}
<details className="bg-white rounded-xl border border-[#E3E8F0] px-4 py-2 group">
  <summary className="cursor-pointer select-none text-[13.5px] font-bold text-[#1B2B4B] list-none flex items-center gap-1.5"><span className="inline-block transition-transform group-open:rotate-90">›</span>변경 이력 <span className="font-semibold text-[#9AA9C3]">(눌러서 펼치기 · 위 '변경 이력' 버튼으로도 볼 수 있음)</span></summary>
  <div className="mt-2 max-h-64 overflow-y-auto pr-1"><OrderTimeline order={copyTarget} size="sm" userName={(u) => userNameMap?.get?.(String(u || "").trim().toLowerCase())} /></div>
</details>

{/* ===================== 복사패널 운임조회(Part5) - 이력없음 확인 ===================== */}
<FareNoHistoryConfirm open={copyAddrConfirmOpen} onClose={() => setCopyAddrConfirmOpen(false)} onYes={() => { setCopyAddrConfirmOpen(false); setCopyAddrSearchOpen(true); }} />

{/* ===================== 복사패널 운임조회(Part5) - 주소 검색 ===================== */}
<AddrFareSearchModal open={copyAddrSearchOpen} onClose={() => setCopyAddrSearchOpen(false)} client={copyAddrClient} setClient={setCopyAddrClient} pickup={copyAddrPickup} setPickup={setCopyAddrPickup} drop={copyAddrDrop} setDrop={setCopyAddrDrop} onSearch={handleCopyAddrSearch} />

{/* ===================== 복사패널 운임조회 모달 ===================== */}
{copyFarePanelOpen && fareResult && (
  <FareResultModal result={fareResult} target={copyTarget} records={sortFareHistory(fareResult.records || [], fareSortMode)} sortControl={<FareSortDropdown value={fareSortMode} onChange={setFareSortMode} />} filter={copyFareFilter} setFilter={setCopyFareFilter}
    onApply={(v) => { setCopyTarget(p => fareOn ? fareFormChange(p, "청구운임", String(v), fareR.rules) : ({ ...p, 청구운임: String(v) })); setCopyFarePanelOpen(false); }}
    onClose={() => setCopyFarePanelOpen(false)} />
)}

{clientApplyPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[320px] overflow-hidden border">
      <div className="bg-[#1B2B4B] px-6 py-4">
        <h3 className="text-white font-bold text-[15px]">거래처 적용</h3>
        <p className="text-white/60 text-[12px] mt-0.5">'{clientApplyPopup.거래처명}'을(를) 어디에 적용할까요?</p>
      </div>
      <div className="px-6 py-4 flex flex-col gap-2">
        <button
          className="w-full py-2.5 bg-[#1B2B4B] text-white rounded-xl font-bold text-[13px]"
          onClick={() => {
            setCopyTarget(p => ({
              ...p,
              상차지명: clientApplyPopup.거래처명,
              상차지주소: clientApplyPopup.주소 || "",
              상차지담당자: clientApplyPopup.담당자 || "",
              상차지담당자번호: clientApplyPopup.연락처 || "",
            }));
            checkWarningStatus(clientApplyPopup.거래처명, "상차지");
            setClientApplyPopup(null);
          }}
        >
          상차지 적용
        </button>

        <button
          className="w-full py-2.5 bg-[#1B2B4B] text-white rounded-xl font-bold text-[13px]"
          onClick={() => {
            setCopyTarget(p => ({
              ...p,
              하차지명: clientApplyPopup.거래처명,
              하차지주소: clientApplyPopup.주소 || "",
              하차지담당자: clientApplyPopup.담당자 || "",
              하차지담당자번호: clientApplyPopup.연락처 || "",
            }));
            checkWarningStatus(clientApplyPopup.거래처명, "하차지");
            setClientApplyPopup(null);
          }}
        >
          하차지 적용
        </button>

        <button
          className="w-full py-2.5 bg-gray-100 text-gray-800 rounded-xl font-bold text-[13px]"
          onClick={() => setClientApplyPopup(null)}
        >
          선택안함
        </button>
      </div>
    </div>
  </div>
)}

</div>
</div>
</div>
)}
      {/* ⭐ 다목적지 단가표 조회 팝업 (3파트와 동일) */}
      {rateSheetLookupOpen5 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999998]">
          <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.단가표 조회" defaultText="단가표 조회" /></h3>
                <p className="text-white/60 text-[12px] mt-0.5">
                  {(editTarget?.하차지명 || "").trim() ? `"${editTarget.하차지명}"와(과) 일치하는 등록된 단가표` : "하차지명이 있어야 단가표 메뉴에 등록된 단가와 매칭해 보여줍니다"}
                </p>
              </div>
              <button onClick={() => setRateSheetLookupOpen5(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {rateSheetMatches5.length === 0 ? (
                <div className="text-center py-16 text-gray-500 text-[13px]">
                  일치하는 단가표가 없습니다.<br/>
                  <span className="text-[12px] text-gray-400">단가표 메뉴 → 다목적지 단가표에서 해당 하차지를 등록하면 여기서 바로 확인할 수 있습니다.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {rateSheetMatches5.map(({ sheet, row, nameHit }, i) => {
                    const dropTon = normRateText5(editTarget?.차량톤수);
                    const matchedColId = dropTon
                      ? (sheet.columns || []).find(c => {
                          const cl = normRateText5(c.label);
                          return cl && (cl === dropTon || cl.includes(dropTon) || dropTon.includes(cl));
                        })?.id
                      : null;
                    return (
                    <div key={sheet.id + row.id + i} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[12.5px]">
                          <span className="text-gray-500">기준지</span>
                          <span className="font-bold text-[#1B2B4B]">{sheet.baseName || "-"}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-bold text-[#1B2B4B]">{row.name}</span>
                        </div>
                        {nameHit
                          ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1B2B4B] text-white">이름 일치</span>
                          : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">주소 일치</span>}
                      </div>
                      {row.address && <div className="px-4 py-1.5 text-[11.5px] text-gray-500">{row.address}</div>}
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                          <thead>
                            <tr className="bg-white border-b border-gray-100">
                              {(sheet.columns || []).map(c => (
                                <th key={c.id} className={`px-3 py-2 text-center text-[11px] font-bold whitespace-nowrap ${c.id === matchedColId ? "text-[#1B2B4B]" : "text-gray-500"}`}>{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {(sheet.columns || []).map(c => {
                                const v = Number(row.prices?.[c.id] || 0);
                                const isMatch = c.id === matchedColId;
                                return (
                                  <td key={c.id} className={`px-3 py-2.5 text-center whitespace-nowrap ${isMatch ? "bg-[#1B2B4B]/5 ring-2 ring-inset ring-[#1B2B4B] animate-pulse" : ""}`}>
                                    {v ? <span className="font-bold text-blue-700">{v.toLocaleString()}원</span> : <span className="text-gray-400">-</span>}
                                    {isMatch && <div className="text-[11px] font-bold text-[#1B2B4B] mt-0.5">입력한 톤수</div>}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setRateSheetLookupOpen5(false)} className="px-5 py-2 text-[13px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"><EditableText id="misc.btn.39425.닫기" defaultText="닫기" /></button>
            </div>
          </div>
        </div>
      )}
      {/* 📦 운임조회 결과 모달 (선택수정용) */}
{fareModalOpen && fareResult && (
  <FareResultModal zClass="z-[99999]" result={fareResult} target={editTarget} records={sortFareHistory(fareResult.records || [], fareSortMode)} sortControl={<FareSortDropdown value={fareSortMode} onChange={setFareSortMode} />} filter={copyFareFilter} setFilter={setCopyFareFilter}
    onApply={(v) => { setEditTarget(p => { if (fareOn) { const n = fareFormChange(p, "청구운임", v, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; } return { ...p, 청구운임: v, 수수료: v - Number(p.기사운임 || 0) }; }); setFareModalOpen(false); }}
    onClose={() => setFareModalOpen(false)} />
)}

      {/* ===================== 기사확인 팝업 ===================== */}
      {driverConfirmInfo && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]"
          tabIndex={-1}
          ref={el => { if(el && !el.contains(document.activeElement)) setTimeout(() => el.focus(), 0); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && driverConfirmInfo.type !== "new") {
              const d = driverConfirmInfo.driver;
              const rowId = driverConfirmInfo.rowId;
              setEdited(prev => ({
                ...prev,
                [rowId]: { ...(prev[rowId] || {}), 차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호, 배차상태: "배차완료" }
              }));
              patchDispatch(rowId, { 차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호, 배차상태: "배차완료", updatedAt: Date.now() });
              setDriverConfirmInfo(null);
            }
            if (e.key === "Escape") setDriverConfirmInfo(null);
          }}
          onClick={() => setDriverConfirmInfo(null)}
        >
          <div
            className="bg-white rounded-2xl w-[500px] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.기사 정보 확인" defaultText="기사 정보 확인" /></h3>
              <button
                className="text-white/50 hover:text-white text-lg transition"
                onClick={() => { setDriverConfirmInfo(null); setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5(""); }}>
                ✕
              </button>
            </div>

            {/* 상태 표시 */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-nowrap">
                {driverConfirmInfo.type === "new" ? (
                  <span className="px-2.5 py-1 rounded-lg bg-[#1B2B4B]/10 text-[#1B2B4B] text-[12px] font-bold whitespace-nowrap shrink-0">미등록 차량</span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[12px] font-bold whitespace-nowrap shrink-0">등록 기사</span>
                )}
                <span className="text-[12px] text-gray-500 whitespace-nowrap">
                  {driverConfirmInfo.type === "new"
                    ? "기사 정보가 없습니다. 빠른등록 후 배차하세요."
                    : "아래 정보로 배차를 진행합니다."}
                </span>
              </div>
            </div>

            {/* 정보 카드 */}
            <div className="px-6 py-5">
              <div className="bg-[#f8f9fb] border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500 w-20">차량번호</span>
                  <span className="flex-1 text-[14px] font-bold text-[#1B2B4B] text-right">
                    {driverConfirmInfo.driver?.차량번호 || driverConfirmInfo.plate || "-"}
                  </span>
                </div>
                <div className="border-t border-gray-200" />
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500 w-20">기사명</span>
                  <span className={`flex-1 text-[14px] font-bold text-right ${driverConfirmInfo.driver?.이름 ? "text-[#1B2B4B]" : "text-gray-500"}`}>
                    {driverConfirmInfo.driver?.이름 || "정보 없음"}
                  </span>
                </div>
                <div className="border-t border-gray-200" />
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500 w-20">연락처</span>
                  <span className={`flex-1 text-[14px] font-bold text-right ${driverConfirmInfo.driver?.전화번호 ? "text-[#1B2B4B]" : "text-gray-500"}`}>
                    {formatPhone(driverConfirmInfo.driver?.전화번호 || "") || "정보 없음"}
                  </span>
                </div>
              </div>
            </div>

            {/* 버튼 영역 */}
            <div className="px-6 pb-5 space-y-3">
              {quickRegMode5 ? (
                <div className="border border-[#1B2B4B]/20 rounded-xl overflow-hidden">
                  <div className="bg-[#1B2B4B]/5 px-4 py-2.5 border-b border-[#1B2B4B]/15">
                    <span className="text-[12px] font-bold text-[#1B2B4B]">신규 기사 정보 입력</span>
                    <span className="text-[11px] text-[#1B2B4B]/60 ml-2">{driverConfirmInfo.plate}</span>
                  </div>
                  <div className="p-4 space-y-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">기사명</label>
                      <input autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                        placeholder="홍길동"
                        value={quickRegName5}
                        onChange={e => setQuickRegName5(e.target.value)}
                        ref={imeFocusRef}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">전화번호</label>
                      <input autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                        placeholder="010-0000-0000"
                        value={quickRegPhone5}
                        onChange={e => setQuickRegPhone5(formatPhone(e.target.value))}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[12px] font-semibold transition"
                        onClick={() => { setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5(""); }}>
                        취소
                      </button>
                      <button
                        className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition text-white ${
                          quickRegName5.trim()
                            ? "bg-[#1B2B4B] hover:bg-[#243a60]"
                            : "bg-gray-300 cursor-not-allowed"
                        }`}
                        disabled={!quickRegName5.trim()}
                        onClick={async () => {
                          const formatted = formatPhone(quickRegPhone5);
                          const raw = formatted.replace(/[^\d]/g, "");
                          await upsertDriver({ 차량번호: driverConfirmInfo.plate, 이름: quickRegName5, 전화번호: raw });
                          await patchDispatch(driverConfirmInfo.rowId, {
                            차량번호: driverConfirmInfo.plate, 이름: quickRegName5, 전화번호: raw,
                            배차상태: "배차완료", updatedAt: Date.now(),
                          });
                          setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5("");
                          setDriverConfirmInfo(null);
                          showAlert(`기사 "${quickRegName5}" 등록 완료`);
                        }}>
                        등록 완료
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-[13px] transition"
                    onClick={() => { setDriverConfirmInfo(null); setQuickRegName5(""); setQuickRegPhone5(""); }}>
                    취소
                  </button>
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition"
                    onClick={() => setQuickRegMode5(true)}>
                    빠른 기사 등록
                  </button>
                  <button
                    disabled={driverConfirmInfo.type === "new"}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-[13px] transition ${
                      driverConfirmInfo.type === "new"
                        ? "bg-[#1B2B4B]/20 text-gray-500 cursor-not-allowed"
                        : "bg-[#1B2B4B] hover:bg-[#243a60] text-white"
                    }`}
                    onClick={async () => {
                      const d = driverConfirmInfo.driver;
                      const rowId = driverConfirmInfo.rowId;
                      setEdited(prev => ({
                        ...prev,
                        [rowId]: { ...(prev[rowId] || {}), 차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호, 배차상태: "배차완료" }
                      }));
                      await patchDispatch(rowId, {
                        차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호,
                        배차상태: "배차완료", updatedAt: Date.now(),
                      });
                      setDriverConfirmInfo(null);
                    }}>
                    확인 (배차완료)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ===================== 기사선택 팝업 ===================== */}
      {driverSelectInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => setDriverSelectInfo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden"
            onClick={e => e.stopPropagation()}
            tabIndex={-1}
            ref={el => { if(el) setTimeout(() => el.focus(), 0); }}
            onKeyDown={e => { if(e.key === "Escape") setDriverSelectInfo(null); }}>

            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-white font-bold text-[15px]">기사 선택</div>
                <div className="text-white/50 text-[11px] mt-0.5">
                  동일 차량번호에 기사 {driverSelectInfo.list?.length}명이 등록되어 있습니다
                </div>
              </div>
              <button
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg flex items-center justify-center transition"
                onClick={() => setDriverSelectInfo(null)}>×</button>
            </div>

            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
              <p className="text-[12px] text-amber-700 font-semibold">
                차량번호 {driverSelectInfo.list?.[0]?.차량번호}: 배차할 기사를 골라 주세요
              </p>
            </div>

            <div className="p-4 space-y-2 max-h-[340px] overflow-y-auto">
              {(driverSelectInfo.list || []).map((d, i) => (
                <button
                  key={i}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-[#f8f9fb] hover:bg-blue-50 hover:border-[#1B2B4B]/30 transition group"
                  onClick={async () => {
                    const grade = d?.등급 || d?.grade || "";
                    if (grade === "블랙") setBlackAlert(d);
                    await patchDispatch(driverSelectInfo.rowId, {
                      차량번호: d.차량번호,
                      이름: d.이름,
                      전화번호: d.전화번호,
                      배차상태: "배차완료",
                      updatedAt: Date.now(),
                    });
                    setDriverSelectInfo(null);
                    setTimeout(() => {
                      const el = document.getElementById(`row-${driverSelectInfo.rowId}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 300);
                  }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1B2B4B]/10 group-hover:bg-[#1B2B4B] flex items-center justify-center transition shrink-0">
                        <span className="text-[11px] font-bold text-[#1B2B4B] group-hover:text-white transition">
                          {(d.이름 || "-").slice(0, 1)}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-[14px] text-gray-900">{d.이름 || "-"}</div>
                        <div className="text-[12px] text-gray-500 mt-0.5">
                          {d.차량번호} &nbsp;|&nbsp; {formatPhone(d.전화번호)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.등급 === "블랙" && (
                        <span className="px-2 py-0.5 rounded-lg bg-gray-900 text-white text-[10px] font-bold">블랙</span>
                      )}
                      {d.등급 === "주의" && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">주의</span>
                      )}
                      <span className="text-gray-400 group-hover:text-[#1B2B4B] text-lg transition">›</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-[13px] transition"
                onClick={() => setDriverSelectInfo(null)}>
                취소 (ESC)
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================== 선택삭제 팝업 ========================== */}
      {showDeletePopup && (
        <KpDeleteConfirm rows={[...selected].map((id) => dispatchData.find((d) => getId(d) === id))} onCancel={() => setShowDeletePopup(false)} onConfirm={deleteRowsWithUndo} />
      )}

      {/* ========================== 되돌리기 알림 ========================== */}
      {undoVisible && (
        <div className="fixed bottom-5 right-5 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 z-[100000]">
          <span>삭제됨</span>
          <button
            className="bg-blue-500 px-3 py-1 rounded"
            onClick={async () => {
              await runBulkTask({ count: backupDeleted.length, label: "오더", verb: "되돌리기", task: async (progress) => {
                let k = 0;
                for (const row of backupDeleted) { await patchDispatch(row._id, row); progress(++k); }
              } });
              setUndoVisible(false);
              showAlert("삭제가 복구되었습니다.");
            }}
          >
            되돌리기
          </button>
        </div>
      )}

      {/* 기사복사 선택 모달 */}
      {copyModalOpen && (() => {
        // 🎨 2026-11-16 복사 형식 선택 — 실시간배차현황과 같은 모양(가운데 창 · 큰 글씨 · 두 칸)
        const close5 = () => { setCopyModalOpen(false); setSelected(new Set()); };
        const opts = [
          ["basic", "차량 · 기사 · 연락처", "차량번호 / 기사명 / 전화번호"],
          ["fare", "운임 포함", "부가세 / 선불 / 착불 형식"],
          ["full", "전체 상세", "상하차 + 화물 + 기사 정보"],
          ["simple", "간단 목록", "11/16 에이제이-벤더 당착 11톤 7대 + 차량 · 기사 · 연락처 한 줄씩"],
          ["driver", "기사 전달용", "운행 정보 + 전달 문구(⚙ 문구 설정에서 변경)", true],
        ];
        return (
        <div className="fixed inset-0 bg-[rgba(11,20,40,0.45)] flex items-center justify-center z-[99999] p-4" onClick={close5}>
          <div className="bg-white w-full max-w-[620px] rounded-2xl shadow-[0_24px_60px_rgba(11,20,40,0.35)] overflow-hidden" onClick={(e) => e.stopPropagation()} data-kp="copy-format">
            <div className="px-6 py-4 flex items-center gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
              <div className="min-w-0 mr-auto">
                <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">COPY FORMAT</div>
                <div className="text-[18px] font-black text-white leading-tight"><EditableText id="popup.title.복사 방식 선택" defaultText="복사 방식 선택" /> <span className="text-[14px] font-bold text-white/60">· 선택 {selected.size}건</span></div>
              </div>
              <button type="button" onClick={openCopyTemplateEditor} className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold text-white hover:bg-white/20" title="전체 상세 · 기사 전달용 · 간단 목록 문구를 바꿉니다">⚙ 문구 설정</button>
              <button type="button" aria-label="닫기" onClick={close5} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[16px]">✕</button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {opts.map(([type, label, desc, primary]) => (
                <button key={type} type="button" onClick={() => copyMessage(type)} data-copy-type={type}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition ${primary ? "bg-[#0F1A30] border-[#0F1A30] text-white hover:bg-[#1B2B4B] sm:col-span-2" : type === "simple" && selected.size > 1 ? "bg-white border-[#2457D6] ring-2 ring-[#2457D6]/15 hover:bg-[#F4F7FD]" : "bg-white border-[#DCE3EE] hover:border-[#8FB0F0] hover:bg-[#F8FAFD]"}`}>
                  <span className={`block text-[15px] font-black ${primary ? "text-white" : "text-[#0F1A30]"}`}>{label}{type === "simple" && selected.size > 1 && <span className="ml-1.5 text-[12px] font-black text-[#2457D6]">여러 건 추천</span>}</span>
                  <span className={`block text-[13px] mt-0.5 leading-snug break-keep ${primary ? "text-white/75" : "text-[#5B6B85]"}`}>{desc}</span>
                </button>
              ))}
            </div>
            <ImageCopyButtons onAccount={copyAccountImage5} onBiz={copyBizImage5} />
            <div className="px-5 py-3 bg-[#F8FAFD] border-t border-[#E3E8F0] flex justify-end">
              <button type="button" onClick={close5} className="h-10 px-6 rounded-xl border border-[#D5DDEA] bg-white text-[14px] font-bold text-[#3A4A66]">취소</button>
            </div>
          </div>
        </div>
        );
      })()}
      {smsConfirm5 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100002]">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.문자 메시지 전송" defaultText="문자 메시지 전송" /></h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-100 text-[13px] text-gray-700">
                <span className="font-semibold text-[#1B2B4B]">{smsConfirm5.phone || "번호 없음"}</span><br />
                으로 문자를 전송하시겠습니까?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSmsConfirm5(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-medium"
                ><EditableText id="misc.btn.40016.취소" defaultText="취소" /></button>
                <button
                  onClick={() => {
                    const phone = smsConfirm5.phone.replace(/[^\d]/g, "");
                    sendText({ phones: [phone], body: smsConfirm5.body }); // 💬 2026-11-10
                    setSmsConfirm5(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-medium"
                ><EditableText id="misc.btn.40024.문자 보내기" defaultText="문자 보내기" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 업로드링크 다중 전송 확인 팝업 (Part 5) — 체크한 배차완료 오더가 1건 이상일 때 */}
      {bulkUploadConfirm5 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100002]">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.업로드 안내 메시지 전송" defaultText="업로드 안내 메시지 전송" /></h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-100 text-[13px] text-gray-700">
                선택한 <span className="font-semibold text-[#1B2B4B]">{bulkUploadConfirm5.phones.length}명</span>의 기사에게<br />
                업로드 안내 메시지 창을 여시겠습니까?
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-medium" onClick={() => setBulkUploadConfirm5(null)}><EditableText id="misc.btn.40043.취소" defaultText="취소" /></button>
                <button
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-medium"
                  onClick={() => {
                    sendText({ phones: bulkUploadConfirm5.phones, body: bulkUploadConfirm5.body }); // 💬 2026-11-10
                    setBulkUploadConfirm5(null);
                  }}
                ><EditableText id="misc.btn.40050.메시지 창 열기" defaultText="메시지 창 열기" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {optimalMatchRow5 && (
        <OptimalMatchModal row={optimalMatchRow5} dispatchData={dispatchData} companyName={userCompany} onClose={() => setOptimalMatchRow5(null)} />
      )}
      {editReqPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 shrink-0">
              <h3 className="text-white font-bold text-[15px]">{editReqPopup.수정요청 ? "화주사 수정요청" : "화주사 수정 내역"}</h3>
              {editReqPopup.수정요청 && editReqPopup.수정요청일시 && (
                <p className="text-white/70 text-[12px] mt-0.5">{_fmtKst(editReqPopup.수정요청일시)} 요청</p>
              )}
              {!editReqPopup.수정요청 && editReqPopup.최종수정일시 && (
                <p className="text-white/70 text-[12px] mt-0.5">{_fmtKst(editReqPopup.최종수정일시)} 수정</p>
              )}
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1">
              {(() => {
                const diff = editReqPopup.수정요청 ? getEditRequestDiff(editReqPopup) : getRecentHistoryDiff(editReqPopup);
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
              {editReqPopup.수정요청 ? (
                <>
                  <button
                    onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await rejectEditRequest(o); }}
                    className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-[13px] font-bold hover:bg-red-50 transition"
                  ><EditableText id="misc.btn.40097.거절" defaultText="거절" /></button>
                  <button
                    onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await approveEditRequest(o); }}
                    className="px-4 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"
                  ><EditableText id="misc.btn.40101.승인" defaultText="승인" /></button>
                </>
              ) : (
                <button
                  onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await acknowledgeShipperEditPC(o); }}
                  className="px-4 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"
                ><EditableText id="misc.btn.40107.확인" defaultText="확인" /></button>
              )}
            </div>
          </div>
        </div>
      )}
      {cancelReqPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-red-500 to-red-800 px-6 py-4 shrink-0">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.화주사 배차취소 요청" defaultText="화주사 배차취소 요청" /></h3>
              {cancelReqPopup.취소요청일시 && (
                <p className="text-white/70 text-[12px] mt-0.5">{_fmtKst(cancelReqPopup.취소요청일시)} 요청</p>
              )}
            </div>
            <div className="px-6 py-5">
              <div className="text-[13px] text-gray-500 mb-1">거래처 / 구간</div>
              <div className="text-[14px] font-bold text-gray-900 mb-4">
                {cancelReqPopup.거래처명 || "-"} · {cancelReqPopup.상차지명 || "-"} → {cancelReqPopup.하차지명 || "-"}
              </div>
              <div className="text-[13px] text-gray-500 mb-1">취소 사유</div>
              <div className="text-[14px] text-gray-800 bg-gray-50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                {cancelReqPopup.취소요청사유 || "사유가 입력되지 않았습니다."}
              </div>
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setCancelReqPopup(null)}
                className="px-4 py-2 rounded-lg text-gray-500 text-[13px] font-bold hover:bg-gray-100 transition"
              ><EditableText id="misc.btn.40136.닫기" defaultText="닫기" /></button>
              <button
                onClick={async () => {
                  if (isViewer) return;
                  const o = cancelReqPopup; setCancelReqPopup(null); await rejectCancelRequestPC(o);
                }}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-[13px] font-bold hover:bg-red-50 transition"
              ><EditableText id="misc.btn.40143.거절" defaultText="거절" /></button>
              <button
                onClick={async () => {
                  if (isViewer) return;
                  const o = cancelReqPopup; setCancelReqPopup(null); await approveCancelRequestPC(o);
                }}
                className="px-4 py-2 bg-red-600 text-white text-[13px] font-bold rounded-lg hover:bg-red-700 transition"
              ><EditableText id="misc.btn.40150.승인" defaultText="승인" /></button>
            </div>
          </div>
        </div>
      )}
      {confirmChange && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000]"
          tabIndex={-1}
          ref={(el) => { if (el && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; setTimeout(() => el.focus(), 0); } }}
          onKeyDown={async (e) => {
            if (e.key === "Escape") { e.preventDefault(); setConfirmChange(null); return; }
            if (e.key === "Enter") {
              e.preventDefault();
              const patch = { [confirmChange.field]: confirmChange.after, ...(confirmChange.extra || {}) }; // 💳 extra = 배차방식과 함께 바뀌는 IN/OUT
              if (confirmChange.field === "업체전달상태") {
                patch.업체전달일시 = confirmChange.after === "전달완료" ? Date.now() : null;
                patch.업체전달방법 = confirmChange.after === "전달완료" ? "수동" : null;
                patch.__system = true;
              }
              if (confirmChange.field === "지급방식") {
                Object.assign(patch, payTypeStatusPatch((dispatchData || []).find(r => r._id === confirmChange.id) || {}, confirmChange.after));
              }
              for (const id of (confirmChange.ids || [confirmChange.id])) await patchDispatch(id, patch); // 📋 간단 목록 = 여러 건
              setConfirmChange(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.상태 변경" defaultText="상태 변경" /></h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 border border-gray-100">
                {confirmChange.reason === "copy" ? (
                  <div className="text-[13px] text-gray-700">{confirmChange.ids?.length > 1 || confirmChange.total > 1 ? <>간단 목록 {confirmChange.total}건 복사 · 미전달 <b className="text-[#1B2B4B]">{confirmChange.ids.length}건</b>의 </> : null}전달상태를 <span className="font-bold text-[#1B2B4B]">전달완료</span>로 변경할까요?</div>
                ) : (
                  <>
                    <div className="text-[12px] font-semibold text-gray-500 mb-1">{confirmChange.field}</div>
                    <div className="text-[13px] text-gray-800">
                      <span className="text-gray-500">{String(confirmChange.before || "없음")}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="font-bold text-[#1B2B4B]">{String(confirmChange.after || "없음")}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition" onClick={() => setConfirmChange(null)}><EditableText id="misc.btn.40198.취소" defaultText="취소" /></button>
                <button className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a] transition" onClick={() => {
                  const patch = { [confirmChange.field]: confirmChange.after, ...(confirmChange.extra || {}) }; // 💳 extra = 배차방식과 함께 바뀌는 IN/OUT
                  if (confirmChange.field === "업체전달상태") {
                    patch.업체전달일시 = confirmChange.after === "전달완료" ? Date.now() : null;
                    patch.업체전달방법 = confirmChange.after === "전달완료" ? "수동" : null;
                    patch.__system = true;
                  }
                  if (confirmChange.field === "지급방식") {
                    Object.assign(patch, payTypeStatusPatch((dispatchData || []).find(r => r._id === confirmChange.id) || {}, confirmChange.after));
                  }
                  // 저장을 기다리지 않고 즉시 팝업을 닫아 끊김 없이 반응하게 한다.
                  (confirmChange.ids || [confirmChange.id]).forEach((id) => patchDispatch(id, patch).catch(console.error)); // 📋 간단 목록 = 여러 건
                  setConfirmChange(null);
                }}><EditableText id="misc.btn.40212.변경" defaultText="변경" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
      
{/* ===== 오더복사수정패널 기사정보: 동일 차량번호 기사 여러명 선택 팝업 (PART 5) ===== */}
      {copyDriverPick && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[380px] overflow-hidden border" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.기사 선택" defaultText="기사 선택" /></h3>
                <p className="text-white/60 text-[12px] mt-0.5">동일 차량번호에 기사 {copyDriverPick.list?.length}명이 등록되어 있습니다</p>
              </div>
              <button className="text-white/60 hover:text-white text-lg" onClick={() => setCopyDriverPick(null)}>✕</button>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {(copyDriverPick.list || []).map((d, i) => (
                <button key={i}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 transition flex items-center justify-between"
                  onClick={() => {
                    const grade = d?.등급 || d?.grade || "";
                    if (grade === "블랙") setBlackAlert(d);
                    else if (shouldShowDriverMemoAlert(d)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: d }));
                    setCopyTarget(prev => ({ ...(prev || {}), 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호), 배차상태: "배차완료" }));
                    setCopyDriverPick(null);
                  }}
                >
                  <div>
                    <div className="font-bold text-[14px] text-gray-800">{d.이름 || "-"}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5">{formatPhone(d.전화번호)}</div>
                  </div>
                  {(d.등급 || d.grade) && <span className="text-[11px] font-semibold text-gray-500">{d.등급 || d.grade}</span>}
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100">
              <button className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition" onClick={() => setCopyDriverPick(null)}><EditableText id="misc.btn.40311.취소" defaultText="취소" /></button>
            </div>
          </div>
        </div>
      )}
{/* ===== 스마트 검색 충돌 팝업 (PART 5) ===== */}
      <SamePlateConflictPopup popup={smart5ConflictPopup} onClose={() => setSmart5ConflictPopup(null)} onResolved={() => { setSmartQ5(""); setSmartList5([]); setSmart5ConflictPopup(null); }} isViewer={isViewer} upsertDriver={upsertDriver} userCompany={userCompany} formatPhone={formatPhone} keepBtnTextId="misc.btn.40332.기존 정보 사용" />
      {/* ===================== 일마감 모달 ===================== */}
{dailyCloseOpen && (
  <div className="fixed inset-0 bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center z-[99999]">
    {/* ⭐ 좁은 640px 고정폭이라 라벨/메모가 줄바꿈되며 카드 하나가 너무 커져
        섹션마다 내부 스크롤이 따로 생기던 문제 — 화면을 넓게 써서 한 줄에
        들어오게 하고(가로형식), 아래 각 목록도 2열 그리드로 세로로 여러 건이
        한 번에 보이게 바꿨다. */}
    <div className="bg-[#F4F6FA] rounded-[26px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] w-[1600px] max-w-[96vw] max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

      {/* 헤더 */}
      <div className="relative px-7 py-5 flex items-center justify-between shrink-0 text-white overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}><span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div>
          <div className="relative text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DAILY CLOSE · VERIFY</div><div className="relative text-white font-black text-[22px] leading-tight mt-0.5">일마감 검증</div>
          <div className="relative text-white/60 text-[12.5px] mt-0.5 font-semibold">{dailyCloseResult?.date || ""} 기준 ({dailyCloseResult?.total || 0}건)</div>
        </div>
        <button className="relative h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-[13px] font-bold flex items-center justify-center transition" onClick={() => setDailyCloseOpen(false)}>닫기 ✕</button>
      </div>

      {dailyCloseResult && (
        <div className="flex-1 overflow-y-auto pb-6">

          {/* 요약 카드 */}
          <div className="mx-6 mt-4 p-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "전체", value: dailyCloseResult.total, active: dailyCloseFilter === "all", key: "all" },
                { label: "정상", value: dailyCloseResult.total - dailyCloseResult.errors.length, active: false, key: null },
                { label: "오류", value: dailyCloseResult.errors.length, active: dailyCloseFilter === "errors", key: "errors" },
                { label: "경고", value: dailyCloseResult.warnings.length, active: dailyCloseFilter === "warnings", key: "warnings" },
              ].map(item => (
                <div key={item.label}
                  onClick={() => { if (item.key) setDailyCloseFilter(item.key); }}
                  className={`relative rounded-2xl px-5 py-4 text-left transition border ${item.key ? "cursor-pointer hover:-translate-y-0.5" : ""} ${item.active ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_12px_28px_rgba(15,26,48,0.28)]" : "bg-[#F7F9FC] border-[#E3E8F0] text-[#0F1A30] hover:border-[#2D4C82]"}`}>
                  <div className={`text-[12px] font-black ${item.active ? "text-[#8FB0F0]" : "text-[#5B6B85]"}`}>{item.label}</div>
                  <div className="text-[30px] font-black leading-tight tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{item.value}<span className="text-[13px] font-bold opacity-50 ml-1">건</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* 오류 목록 */}
          {(dailyCloseFilter === "all" || dailyCloseFilter === "errors") && dailyCloseResult.errors.length > 0 && (
            <div className="mx-6 mt-4 p-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]">
              <div className="text-[15px] font-black text-[#0F1A30] mb-3">오류 ({dailyCloseResult.errors.length}건) - 필수 수정</div>
              <div className="grid grid-cols-2 gap-2">
                {dailyCloseResult.errors.map((e, i) => (
                  <div key={i}
                    className="flex items-start gap-3 px-4 py-3 border border-[#E3E8F0] rounded-xl cursor-pointer bg-white hover:border-[#2D4C82] hover:shadow-[0_6px_16px_rgba(15,26,48,0.08)] transition"
                    onClick={() => openDailyCloseIssueDetail(e.rowId)}>
                    <div className="w-7 h-7 rounded-lg bg-[#0F1A30] text-white text-[11.5px] font-black tabular-nums flex items-center justify-center shrink-0">{e.seq}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 break-words">{e.label}</div>
                      <div className="text-[12.5px] font-bold text-[#2D4C82] mt-0.5 break-words">{e.msg}</div>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0F1A30] text-white">누락</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 경고 목록 */}
          {(dailyCloseFilter === "all" || dailyCloseFilter === "warnings") && dailyCloseResult.warnings.length > 0 && (
            <div className="mx-6 mt-4 p-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]">
              <div className="text-[15px] font-black text-[#0F1A30] mb-3">경고 ({dailyCloseResult.warnings.length}건) - 확인 필요</div>
              <div className="grid grid-cols-2 gap-2">
                {dailyCloseResult.warnings.map((w, i) => (
                  <div key={i}
                    className="flex items-start gap-3 px-4 py-3 border border-[#E3E8F0] rounded-xl cursor-pointer bg-white hover:border-[#2D4C82] hover:shadow-[0_6px_16px_rgba(15,26,48,0.08)] transition"
                    onClick={() => openDailyCloseIssueDetail(w.rowId)}>
                    <div className="w-7 h-7 rounded-lg bg-[#EEF2F8] text-[#1B2B4B] text-[11.5px] font-black tabular-nums flex items-center justify-center shrink-0">{w.seq}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 break-words">{w.label}</div>
                      <div className="text-[12px] font-semibold text-gray-500 mt-0.5 break-words">{w.msg}</div>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EEF2F8] text-[#1B2B4B] border border-[#DCE3EE]">
                      {w.type === "margin" ? "마진" : w.type === "driver" ? "기사" : w.type === "phone" ? "번호" : w.type === "zero" ? "0원" : w.type === "high" ? "고액" : w.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* 업체별 요약 */}
          {dailyCloseResult.clientSummary?.length > 0 && (
            <div className="mx-6 mt-4 p-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]">
              <div className="text-[15px] font-black text-[#0F1A30] mb-3">업체별 요약</div>
              <div className="border border-[#E3E8F0] rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#1B2B4B]">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-white"><EditableText id="summary.header.거래처" defaultText="거래처" /></th>
                      <th className="px-3 py-2 text-center font-bold text-white"><EditableText id="summary.header.건수" defaultText="건수" /></th>
                      <th className="px-3 py-2 text-right font-bold text-white"><EditableText id="summary.header.청구합계" defaultText="청구합계" /></th>
                      <th className="px-3 py-2 text-right font-bold text-white"><EditableText id="summary.header.기사합계" defaultText="기사합계" /></th>
                      <th className="px-3 py-2 text-right font-bold text-white"><EditableText id="summary.header.마진합계" defaultText="마진합계" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyCloseResult.clientSummary.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-800">{c.name}</td>
                        <td className="px-3 py-2 text-center">{c.count}건</td>
                        <td className="px-3 py-2 text-right font-semibold">{c.charge.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-semibold">{c.pay.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-bold ${c.margin < 0 ? "text-[#2D4C82] underline decoration-[#8FB0F0] decoration-2 underline-offset-2" : ""}`}>{c.margin.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#1B2B4B] bg-[#F2F5FA] font-black text-[#0F1A30]">
                      <td className="px-3 py-2">합계</td>
                      <td className="px-3 py-2 text-center">{dailyCloseResult.clientSummary.reduce((a, c) => a + c.count, 0)}건</td>
                      <td className="px-3 py-2 text-right">{dailyCloseResult.clientSummary.reduce((a, c) => a + c.charge, 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{dailyCloseResult.clientSummary.reduce((a, c) => a + c.pay, 0).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right ${dailyCloseResult.clientSummary.reduce((a, c) => a + c.margin, 0) < 0 ? "text-[#2D4C82] underline decoration-[#8FB0F0] decoration-2 underline-offset-2" : ""}`}>
                        {dailyCloseResult.clientSummary.reduce((a, c) => a + c.margin, 0).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 재검증/복사 토스트 */}
      {reVerifyToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999999] pointer-events-none">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl text-[14px] font-bold animate-pulse">
            {reVerifyToast}
          </div>
        </div>
      )}

      {/* ★ 전달상태 일괄 토글 */}
      {(() => {
        const targetDate = dailyCloseResult?.date;
        const targets = targetDate ? (dispatchData || []).filter(r => r.상차일 === targetDate) : [];
        const allDone = targets.length > 0 && targets.every(r => r.업체전달상태 === "전달완료");
        const doneCnt = targets.filter(r => r.업체전달상태 === "전달완료").length;
        return (
          <div className="px-6 py-3 border-t border-gray-100 bg-[#1B2B4B]/5 shrink-0 flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-bold text-[#1B2B4B]">전달상태 일괄 변경</div>
              <div className="text-[13px] font-semibold text-gray-600 mt-1">{doneCnt}/{targets.length}건 전달완료</div>
            </div>
            <button
              onClick={async () => {
                if (!targetDate) return;
                if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
                const sender = auth?.currentUser?.email ?? "unknown";
                const nextState = allDone ? "미전달" : "전달완료";
                for (const r of targets) {
                  patchDispatch(r._id, {
                    업체전달상태: nextState,
                    업체전달일시: nextState === "전달완료" ? Date.now() : null,
                    업체전달방법: nextState === "전달완료" ? "일괄" : null,
                    업체전달자: nextState === "전달완료" ? sender : null,
                    __system: true,
                  });
                }
                setDailyCloseOpen(false);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[13px] transition-all ${
                allDone
                  ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${allDone ? "border-gray-400 bg-gray-400" : "border-white bg-white/20"}`}>
                {allDone && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
              </span>
              {allDone ? "전체 미전달로 변경" : "전체 전달완료로 변경"}
            </button>
          </div>
        );
      })()}

      {/* 하단 버튼 */}
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0 flex gap-3">
        {dailyCloseFilter !== "all" && (
          <button className="flex-1 py-2.5 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-[13px] transition"
            onClick={() => { setDailyCloseFilter("all"); setFilterErrorIds(null); }}>
            전체 보기
          </button>
        )}
        {(dailyCloseResult?.errors?.length > 0 || dailyCloseResult?.warnings?.length > 0) && dailyCloseFilter === "all" && (
          <button className="flex-1 py-2.5 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-[13px] transition"
            onClick={() => {
              const issueIds = [
                ...dailyCloseResult.errors.map(e => e.rowId),
                ...dailyCloseResult.warnings.map(w => w.rowId),
              ];
              const unique = [...new Set(issueIds)];
              setFilterErrorIds(unique);
              setDailyCloseOpen(false);
              setQ("");
            }}>
            오류 오더만 보기
          </button>
        )}

        <button className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px] transition"
          onClick={handleDailyReport}>
          보고서 출력
        </button>
        <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#F5F8FD] font-bold text-[13px] transition"
          onClick={() => setCloseReportOpen(true)}>
          마감보고 전송
        </button>
        {closeReportOpen && createPortal(<CloseReportModal result={dailyCloseResult} onClose={() => setCloseReportOpen(false)} />, document.body)}
        <button className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition"
          onClick={() => {
            runDailyClose();
            setReVerifyToast("↻ 재검증이 완료되었습니다");
            setTimeout(() => setReVerifyToast(null), 2500);
          }}>
          재검증
        </button>
        <button className="flex-1 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-[13px] transition"
          onClick={() => { setDailyCloseOpen(false); setDailyCloseFilter("all"); }}>
          닫기
        </button>
      </div>
    </div>
  </div>
)}
    {/* 🔥 블랙/주의업체 팝업 */}
      {notificationsEnabled && warningPopup && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50"
          tabIndex={-1}
          ref={(el) => el && setTimeout(() => el.focus(), 0)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setWarningPopup(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden">
          {(() => {
            const isBlack = warningPopup.status === "블랙";
            const isCaution = warningPopup.status === "주의";
            const isDeparture = warningPopup.status === "이탈";
            const headerCls = isBlack ? "bg-gray-900" : isCaution ? "bg-orange-500" : isDeparture ? "bg-red-600" : "bg-[#1B2B4B]";
            const icon = isBlack ? "⊘" : isCaution ? "⚠" : isDeparture ? "⊘" : "✎";
            const title = isBlack ? "블랙 거래처 알림" : isCaution ? "주의 거래처 알림" : isDeparture ? "이탈 거래처 알림" : "거래처 메모 안내";
            const boxCls = isBlack ? "bg-red-50 border-red-200" : isCaution ? "bg-orange-50 border-orange-200" : isDeparture ? "bg-red-50 border-red-200" : "bg-[#1B2B4B]/5 border-[#1B2B4B]/20";
            const memoTextCls = isBlack ? "text-red-600" : isCaution ? "text-orange-600" : isDeparture ? "text-red-600" : "text-[#1B2B4B]";
            return (
              <>
            <div className={`px-6 py-4 flex items-center gap-3 ${headerCls}`}>
              <span className="text-2xl">{icon}</span>
              <h3 className="text-white text-lg font-bold">{title}</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className={`border rounded-lg px-4 py-3 text-sm space-y-1 ${boxCls}`}>
                <div><span className="text-gray-500">거래처명</span><b className="ml-2">{warningPopup.name}</b></div>
                {warningPopup.status && (
                  <div className="flex items-center">
                    <span className="text-gray-500">등급</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold text-white ${isBlack ? "bg-gray-900" : isCaution ? "bg-orange-500" : "bg-red-600"}`}>
                      {warningPopup.status}
                    </span>
                  </div>
                )}
                {warningPopup.info?.지정일 && (
                  <div><span className="text-gray-500">지정일</span><span className="ml-2">{warningPopup.info.지정일}</span></div>
                )}
                {warningPopup.info?.주소 && (
                  <div><span className="text-gray-500">주소</span><span className="ml-2">{warningPopup.info.주소}</span></div>
                )}
                {warningPopup.info?.메모 && (
                  <div><span className="text-gray-500">메모</span><span className={`ml-2 font-semibold ${memoTextCls}`}>{warningPopup.info.메모}</span></div>
                )}
              </div>
              <p className="text-sm text-gray-600 text-center font-semibold">
                {warningPopup.status
                  ? <>해당 거래처는 <span className={`font-bold ${isBlack ? "text-red-600" : "text-orange-500"}`}>{warningPopup.status} 등급</span>으로 지정된 거래처입니다.</>
                  : "해당 거래처에 등록된 메모를 확인해주세요."}
              </p>
            </div>
            <div className="px-6 pb-5">
              <button
                className={`w-full py-3 text-white rounded-xl font-bold text-sm ${headerCls}`}
                onClick={() => setWarningPopup(null)}
              >
                확인
              </button>
            </div>
              </>
            );
          })()}
          </div>
        </div>
      )}

      {/* ⭐ 2026-11-06 고정노선현황 전용 오른쪽 클릭 메뉴 */}
      {contextMenuDS && fixedForm && (() => {
        const r = contextMenuDS.row; const _id = getId(r);
        const ids = selected.has(_id) && selected.size > 1 ? [...selected] : [_id];
        const rowsOfIds = (dispatchData || []).filter((x) => ids.includes(getId(x)));
        const close = () => setContextMenuDS(null);
        const me = auth.currentUser?.email || "";
        return (
          <FixedRouteContextMenu x={contextMenuDS.x} y={contextMenuDS.y} row={r} selCount={ids.length} staff={staffNamesOf(userNameMap)}
            owner={routeOwnerName(r, userNameMap)} locked={!isViewer && !frCanEdit(r)} disabled={isViewer} onClose={close}
            onAdd={fixedActions?.addOrder || null}
            onEdit={() => { if (!frCanEdit(r)) { frLockAlert(r); return; } setFixedEditId(_id); }}
            onAssign={async (name) => {
              const bad = rowsOfIds.find((x) => !frCanEdit(x)); if (bad) { frLockAlert(bad); return; }
              if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // ✅ 2026-11-23 한 번 묻기
              ids.forEach((x) => patchDispatch(x, { 배차확정자: name || null, 담당자지정자: me, 담당자지정일시: Date.now() }));
              showAlert(name ? `담당자를 ${name}(으)로 지정했습니다${ids.length > 1 ? ` (${ids.length}건)` : ""}` : "담당자를 비웠습니다");
            }}
            onCopyDriver={() => {
              const rawCargo = String(r.화물내용 || ""); const rawTon = String(r.차량톤수 || ""); const tonMatch = rawTon.match(/([\d.]+)(.*)/);
              setCopyTarget({ ...r, 화물내용: rawCargo, 화물수량: rawCargo, 화물타입: "", 톤수값: tonMatch ? tonMatch[1] : "", 톤수타입: tonMatch ? tonMatch[2] : "" });
              setSelected((p) => (p.size > 1 && p.has(_id) ? p : new Set([_id]))); setCopyModalOpen(true);
            }}
            onInfo={() => setOrderInfoRow5(r)}
            onOpenSheet={fixedActions?.sheetUrl ? () => window.open(fixedActions.sheetUrl, "_blank", "noopener") : null}
            onSync={fixedActions?.syncNow || null}
            onDelete={() => { const bad = rowsOfIds.find((x) => !frCanEdit(x)); if (bad) { frLockAlert(bad); return; } if (!selected.has(_id)) setSelected(new Set([_id])); setShowDeletePopup(true); }}
          />
        );
      })()}
      {/* 우클릭 컨텍스트 메뉴 (배차현황) */}
      {contextMenuDS && !fixedForm && (
        <div
          className="fixed z-[999999] bg-white/95 backdrop-blur border border-[#DCE3EE] rounded-2xl shadow-[0_18px_44px_rgba(11,20,40,0.28)] p-1.5 min-w-[188px] select-none"
          style={(() => {
            const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1;
            const vh = window.innerHeight / _z;
            const vw = window.innerWidth / _z;
            const left = Math.min(contextMenuDS.x, vw - 180);
            // 메뉴의 실제 높이는 항목 구성에 따라 달라져 미리 알 수 없으므로,
            // 클릭 지점이 화면 하단에 가까우면 top이 아닌 bottom으로 앵커해
            // 위쪽으로 펼쳐지게 한다 (bottom 앵커는 엘리먼트 높이와 무관하게
            // 항상 화면 안에 들어온다). 남은 공간이 부족하면 스크롤로 보강한다.
            return contextMenuDS.y > vh * 0.55
              ? { bottom: Math.max(8, vh - contextMenuDS.y), left, maxHeight: vh - 16, overflowY: "auto" }
              : { top: contextMenuDS.y, left, maxHeight: vh - contextMenuDS.y - 16, overflowY: "auto" };
          })()}
          onClick={e => e.stopPropagation()}
        >
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenuDS.row;
              const rawCargo = String(r.화물내용 || "");
              const KNOWN_S = ["파레트","파렛트","박스","통"];
              let _cNum = "", _cType = "";
              for (const s of KNOWN_S) { if (rawCargo.endsWith(s)) { _cNum = rawCargo.slice(0, -s.length).trim(); _cType = s; break; } }
              if (!_cType) { _cNum = rawCargo; _cType = ""; }
              const rawTon = String(r.차량톤수 || "");
              const tonMatch = rawTon.match(/([\d.]+)(.*)/);
              setCopyTarget({ ...r, 화물내용: rawCargo, 화물수량: _cNum, 화물타입: _cType, 톤수값: tonMatch ? tonMatch[1] : "", 톤수타입: tonMatch ? tonMatch[2] : "" });
              setSelected((p) => (p.size > 1 && p.has(getId(r)) ? p : new Set([getId(r)])));
              setCopyModalOpen(true);
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <EditableText id="status.ctxMenu.기사복사" defaultText="기사복사" />
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenuDS.row;
              const url = withCo(`${window.location.origin}/driver-upload?date=${encodeURIComponent(r.상차일||"")}&vehicle=${encodeURIComponent((r.차량번호||"").replace(/\s/g,""))}&name=${encodeURIComponent((r.이름||"").trim())}`);
              const msg = `[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n여기를 눌러 업로드해주세요\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
              navigator.clipboard.writeText(msg).then(() => showAlert("업로드 안내 메시지가 복사되었습니다.\n기사에게 붙여넣기로 전달하세요.")).catch(() => showAlert(`링크: ${url}`));
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <EditableText id="status.ctxMenu.업로드링크" defaultText="업로드링크" />
          </button>
          <div className="border-t border-gray-100 my-1"/>
          {/* 오더정보 */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => { setOrderInfoRow5(contextMenuDS.row); setContextMenuDS(null); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <EditableText id="status.ctxMenu.오더정보" defaultText="오더정보" />
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              // 오더복사수정패널을 연다 (선택한 오더 수정 팝업은 폐지)
              const r = contextMenuDS.row;
              if (!frCanEdit(r)) { setContextMenuDS(null); frLockAlert(r); return; } // ⭐ 2026-11-06 고정노선현황 — 담당자만 수정
              const raw = String(r.화물내용 || "");
              const KNOWN_SUFFIXES = [...new Set(["파레트", "파렛트", "박스", "통", ...cpCargoTypeOptions])].sort((a, b) => b.length - a.length);
              let cargoNum = "", cargoType = "";
              const rawBase29 = raw.split("+")[0];
              for (const s of KNOWN_SUFFIXES) { if (rawBase29.endsWith(s)) { cargoNum = rawBase29.slice(0, -s.length).trim(); cargoType = s; break; } }
              if (!cargoType) { cargoNum = rawBase29; cargoType = ""; }
              const ton = r.차량톤수 || "";
              const tonValue = ton.match(/[\d.]+/)?.[0] || "";
              const tonType = ton.includes("kg") ? "kg" : ton.includes("톤") ? "톤" : "";
              setCopyTarget({ ...r, 화물내용: raw, 화물수량: cargoNum, 화물타입: cargoType, 톤수값: tonValue, 톤수타입: tonType });
              setCopyPanelOpen(true);
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <EditableText id="status.ctxMenu.수정" defaultText="수정" />
          </button>
          {/* 운임정보 — 기사 운임 증빙서(운임확인서) 미리보기 */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              // 🧾 여러 건을 골라 두고 그중 하나에서 누르면 고른 건 전부를 운임명세서로
              const r = contextMenuDS.row;
              const picked = selected.size > 1 && selected.has(getId(r)) ? filtered.filter((x) => selected.has(getId(x))) : null;
              setFareCertRow(picked && picked.length > 1 ? picked : r);
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>
            <EditableText id="status.ctxMenu.운임정보" defaultText="운임정보" />
          </button>
          {/* 운임조회 */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenuDS.row;
              setContextMenuDS(null);
              handleCtxFareSearch5(r);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <EditableText id="status.ctxMenu.운임조회" defaultText="운임조회" />
          </button>
          {/* 첨부현황 */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              setAttachStatusDSClient(contextMenuDS.row.거래처명 || "");
              setAttachStatusDSOpen(true);
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <EditableText id="status.ctxMenu.첨부현황" defaultText="첨부현황" />
          </button>
          {/* 문자보내기 — 체크박스로 여러 건을 선택해둔 채 우클릭하면 선택된 오더 전체의
              기사 번호를 받는사람으로 한 번에 연결한다(휴대폰 연결 앱은 sms: URI에 쉼표로
              구분된 번호를 다중 수신자로 지원). 아무것도 선택 안 했으면 우클릭한 1건만. */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenuDS.row;
              const targets = selected.size > 0 ? filtered.filter(x => selected.has(getId(x))) : [r];
              const phones = [...new Set(targets.map(x => String(x.전화번호 || "").replace(/[^\d]/g, "")).filter(Boolean))];
              if (!phones.length) { showAlert("전화번호가 없습니다."); setContextMenuDS(null); return; }
              const body = targets.length > 1
                ? `안녕하세요 ${userCompany || "저희"}운송사입니다.`
                : (() => {
                    const dateStr = (() => {
                      const d = r.상차일 || "";
                      if (d.includes("-")) { const [,mo,dy] = d.split("-"); return `${Number(mo)}월 ${Number(dy)}일`; }
                      return d;
                    })();
                    return `안녕하세요. ${dateStr} ${r.상차시간||""} ${r.상차지명||""} → ${r.하차지명||""} 건 관련하여 연락드립니다.`;
                  })();
              sendText({ phones, body }); // 💬 2026-11-10 회사 설정(휴대폰과 연결 · 회사 번호 문자)
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <EditableText id="status.ctxMenu.문자보내기" defaultText="문자보내기" />{selected.size > 1 ? ` (${selected.size}명)` : ""}
          </button>
          {/* 최적매칭 — 이 노선을 과거에 다녀간 기사를 찾아 배차 가능 여부를 문자로 확인 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => { setOptimalMatchRow5(contextMenuDS.row); setContextMenuDS(null); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
            <EditableText id="status.ctxMenu.최적매칭" defaultText="최적매칭" />
          </button>
          {/* 스케줄표 — 선택한(없으면 우클릭한 1건) 오더들을 날짜별/기사별로 정리해
              미리보기하고, 이미지/PDF저장·인쇄까지 할 수 있는 팝업을 연다. */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenuDS.row;
              const targets = selected.size > 0 ? filtered.filter(x => selected.has(getId(x))) : [r];
              setScheduleChartRows(targets);
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <EditableText id="status.ctxMenu.스케줄표" defaultText="스케줄표" />{selected.size > 1 ? ` (${selected.size}건)` : ""}
          </button>
          {/* 전표발행 — 물류기기(파렛트) 이동전표를 발송처용/파렛트회사용/운송회사용
              3부로 만들어 이미지·PDF저장/인쇄할 수 있는 팝업을 연다. 여러 건을
              선택해둔 채 우클릭하면(스케줄표와 동일한 방식) 한 번에 이어서 발행한다. */}
          <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenuDS.row;
              const targets = selected.size > 0 ? filtered.filter(x => selected.has(getId(x))) : [r];
              setPalletSlipRows(targets);
              setContextMenuDS(null);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
            <EditableText id="status.ctxMenu.전표발행" defaultText="전표발행" />{selected.size > 1 ? ` (${selected.size}건)` : ""}
          </button>
          {/* 일괄수정 — 2건 이상 선택했을 때만 활성화. 선택한 오더들을 한 화면에
              늘어놓고 운임/메모/전달사항 등을 일괄 또는 개별로 고쳐 한 번에 저장. */}
          {(selected.size >= 1 || contextMenuDS?.row) && (
            <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
              onClick={() => {
                // 🗂 2026-11-09 1건부터 — 선택이 없으면 우클릭한 오더 1건
                const picked = filtered.filter(x => selected.has(getId(x)));
                setBulkLegacy(false); setBulkEditRows(picked.length ? picked : [contextMenuDS.row]);
                setContextMenuDS(null);
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <EditableText id="status.ctxMenu.일괄수정복사" defaultText="일괄수정·복사" /> ({Math.max(1, selected.size)}건)
            </button>
          )}
          {dsBiz.multi && (() => { const _id = getId(contextMenuDS.row); const ids = selected.has(_id) && selected.size > 1 ? [...selected] : [_id]; const cur = bizOf(contextMenuDS.row, dsBiz.defaultName); return (
            <div className="px-4 py-2 border-t border-gray-100">
              <div className="text-[11.5px] font-black text-gray-500 mb-1.5">청구 사업자 바꾸기{ids.length > 1 ? ` (${ids.length}건)` : ""}</div>
              <BizSelect inline biz={dsBiz} value={ids.length === 1 ? cur : null} size="sm" onClose={() => setContextMenuDS(null)}
                onChange={async (v) => { if (ids.length === 1 && v === cur) { setContextMenuDS(null); return; } if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; ids.forEach((x) => patchDispatch(x, { 청구사업자: v })); const _r = ids.length === 1 ? contextMenuDS.row : null; if (_r) rememberBiz(dsBiz, { ..._r, 청구사업자: v }); setContextMenuDS(null); }} />
            </div>
          ); })()}
          <div className="border-t border-gray-100 my-1"/>
          <button className="w-full text-left px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
            onClick={() => { const _id = getId(contextMenuDS.row); if (!selected.has(_id)) setSelected(new Set([_id])); setShowDeletePopup(true); setContextMenuDS(null); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            <EditableText id="status.ctxMenu.삭제" defaultText="삭제" />
            <span className="ml-auto text-[11px] text-gray-500 tabular-nums">Del</span>
          </button>
        </div>
      )}

{/* ===================== 운임조회 (Part 5) - 이력없음 확인 ===================== */}
<FareNoHistoryConfirm open={ctxNoHistory5Open} onClose={() => setCtxNoHistory5Open(false)} onYes={() => { setCtxNoHistory5Open(false); setCtxAddrSearch5Open(true); }} editableTitle />

{/* ===================== 운임조회 (Part 5) - 주소 검색 ===================== */}
<AddrFareSearchModal open={ctxAddrSearch5Open} onClose={() => setCtxAddrSearch5Open(false)} pickup={ctxAddrPickup5} setPickup={setCtxAddrPickup5} drop={ctxAddrDrop5} setDrop={setCtxAddrDrop5} onSearch={handleCtxAddrSearch5} allClients={ctxAddrAllClients5} setAllClients={setCtxAddrAllClients5} results={ctxAddrResults5} />

{/* ===================== 운임조회 (Part 5) - 결과 모달 ===================== */}
{ctxFare5PanelOpen && ctxFare5Result && (
  <CtxFareResultModal result={ctxFare5Result} target={ctxFare5Target} records={sortFareHistory(ctxFare5Result.records || [], ctxFare5SortMode)} sortControl={<FareSortDropdown value={ctxFare5SortMode} onChange={setCtxFare5SortMode} />} filter={fare5Filter} setFilter={setFare5Filter}
    isMoto={getVehicleGroup5(ctxFare5Target?.차량종류) === "motorcycle"} onClose={() => setCtxFare5PanelOpen(false)} />
)}

      {/* ===================== 기사확인 팝업 (DispatchStatus 패널용) ===================== */}
      {driverConfirmOpen5 && driverConfirmInfo5 && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999999]"
          onClick={() => setDriverConfirmOpen5(false)}
        >
          <div
            className="bg-white rounded-2xl w-[500px] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.기사 정보 확인" defaultText="기사 정보 확인" /></h3>
              <button className="text-white/50 hover:text-white text-lg transition" onClick={() => setDriverConfirmOpen5(false)}>✕</button>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-nowrap">
                <span className="px-2.5 py-1 rounded-lg bg-[#1B2B4B]/10 text-[#1B2B4B] text-[12px] font-bold whitespace-nowrap shrink-0">미등록 차량</span>
                <span className="text-[12px] text-gray-500 whitespace-nowrap">기사 정보가 없습니다. 빠른등록 후 배차하세요.</span>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="bg-[#f8f9fb] border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500 w-20">차량번호</span>
                  <span className="flex-1 text-[14px] font-bold text-[#1B2B4B] text-right">{driverConfirmInfo5.차량번호 || "-"}</span>
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 space-y-3">
              {quickRegMode5 ? (
                <div className="border border-[#1B2B4B]/20 rounded-xl overflow-hidden">
                  <div className="bg-[#1B2B4B]/5 px-4 py-2.5 border-b border-[#1B2B4B]/15">
                    <span className="text-[12px] font-bold text-[#1B2B4B]">신규 기사 정보 입력</span>
                    <span className="text-[11px] text-[#1B2B4B]/60 ml-2">{driverConfirmInfo5.차량번호}</span>
                  </div>
                  <div className="p-4 space-y-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">기사명</label>
                      <input autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                        placeholder="홍길동"
                        value={quickRegName5}
                        onChange={e => setQuickRegName5(e.target.value)}
                        ref={imeFocusRef}
                        onKeyDown={async e => {
                          if (e.key === "Enter" && quickRegName5.trim()) {
                            const formatted = formatPhone(quickRegPhone5);
                            const raw = formatted.replace(/[^\d]/g, "");
                            await upsertDriver({ 차량번호: driverConfirmInfo5.차량번호, 이름: quickRegName5, 전화번호: raw });
                            if (driverPanelCallbackRef5.current) {
                              await driverPanelCallbackRef5.current(quickRegName5, formatted);
                              driverPanelCallbackRef5.current = null;
                            }
                            setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5("");
                            setDriverConfirmOpen5(false);
                            showAlert(`기사 "${quickRegName5}" 등록 완료`);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-500 block mb-1">전화번호</label>
                      <input autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                        placeholder="010-0000-0000"
                        value={quickRegPhone5}
                        onChange={e => setQuickRegPhone5(formatPhone(e.target.value))}
                        onKeyDown={async e => {
                          if (e.key === "Enter" && quickRegName5.trim()) {
                            const formatted = formatPhone(quickRegPhone5);
                            const raw = formatted.replace(/[^\d]/g, "");
                            await upsertDriver({ 차량번호: driverConfirmInfo5.차량번호, 이름: quickRegName5, 전화번호: raw });
                            if (driverPanelCallbackRef5.current) {
                              await driverPanelCallbackRef5.current(quickRegName5, formatted);
                              driverPanelCallbackRef5.current = null;
                            }
                            setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5("");
                            setDriverConfirmOpen5(false);
                            showAlert(`기사 "${quickRegName5}" 등록 완료`);
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[12px] font-semibold transition"
                        onClick={() => { setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5(""); }}>
                        취소
                      </button>
                      <button
                        className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition text-white ${quickRegName5.trim() ? "bg-[#1B2B4B] hover:bg-[#243a60]" : "bg-gray-300 cursor-not-allowed"}`}
                        disabled={!quickRegName5.trim()}
                        onClick={async () => {
                          const formatted = formatPhone(quickRegPhone5);
                          const raw = formatted.replace(/[^\d]/g, "");
                          await upsertDriver({ 차량번호: driverConfirmInfo5.차량번호, 이름: quickRegName5, 전화번호: raw });
                          if (driverPanelCallbackRef5.current) {
                            await driverPanelCallbackRef5.current(quickRegName5, formatted);
                            driverPanelCallbackRef5.current = null;
                          }
                          setQuickRegMode5(false); setQuickRegName5(""); setQuickRegPhone5("");
                          setDriverConfirmOpen5(false);
                          showAlert(`기사 "${quickRegName5}" 등록 완료`);
                        }}>
                        등록 완료
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-[13px] transition"
                    onClick={() => { setDriverConfirmOpen5(false); setQuickRegName5(""); setQuickRegPhone5(""); }}>
                    취소
                  </button>
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition"
                    onClick={() => setQuickRegMode5(true)}>
                    빠른 기사 등록
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ===== 신규 기사 등록 모달 (DispatchStatus) ===== */}
      {newDriverModalOpen5 && newDriverModalData5 && (
        <NewDriverModal
          data={newDriverModalData5}
          onClose={() => { setNewDriverModalOpen5(false); setNewDriverModalData5(null); }}
          onConfirm={(driverInfo, mode) => {
            newDriverModalData5.onConfirm(driverInfo, mode);
            setNewDriverModalOpen5(false);
            setNewDriverModalData5(null);
          }}
        />
      )}
    </div>

  );
}

/* ===================== 신규 오더 등록 팝업 ===================== */
function NewOrderPopup({
  setShowCreate,
  newOrder,
  setNewOrder,
  addDispatch,
  clients,
  drivers,       // ★ 추가
  upsertDriver,  // ★ 추가
  showAlert = (m) => alert(m),
}) {
  const handleChange = (key, value) =>
    setNewOrder((prev) => ({ ...prev, [key]: value }));

  const saveOrder = async () => {
    try {
      const ok = await addDispatch({
        ...newOrder,
        독차: dokchaOn(newOrder), // ⭐ 2026-11-09 독차 버튼 제거 — 혼적·왕복이 아니면 독차
        차량톤수: toTonUnit(newOrder.차량톤수),
        메모중요도: "일반",
        운행유형: newOrder.운행유형 || "편도",
        회전수: newOrder.운행유형 === "왕복" ? Math.max(1, Number(newOrder.회전수) || 1) : 1,
        메모: withRotationMemo(newOrder.메모, newOrder.운행유형 === "왕복" ? Number(newOrder.회전수) || 1 : 1),
        등록일: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
        배차상태: "배차중",
        차량번호: "",
        이름: "",
        전화번호: "",
        긴급: false, // ★ 이거 꼭

        업체전달상태: "미전달",
        업체전달일시: null,
        업체전달방법: null,
      });
      if (ok === false) return; // 역순 날짜 등 검증 실패 — addDispatch가 이미 안내를 띄웠다


      showAlert("신규 오더가 등록되었습니다.");
      setShowCreate(false);

      // 초기화
      setNewOrder({
        상차일: "",
        상차시간: "",
        하차일: "",
        하차시간: "",
        거래처명: "",
        상차지명: "",
        상차지주소: "",
        하차지명: "",
        하차지주소: "",
        화물내용: "",      // ★ 추가
        차량종류: "",
        차량톤수: "",
        청구운임: "",
        기사운임: "",
        지급방식: "",
        배차방식: "",
        혼적: false,
        독차: false,
        메모: "",
        메모중요도: "일반",
      });
    } catch (err) {
      console.error(err);
      showAlert("오더 등록에 실패했습니다.\n" + (err?.message || ""));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-5 rounded shadow-xl w-[460px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-3">신규 오더 등록</h3>

        <div className="space-y-3">

          {/* 혼적/독차 */}
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2">
              <input autoComplete="off"
                type="checkbox"
                checked={newOrder.혼적}
                onChange={(e) => handleChange("혼적", e.target.checked)}
              />
              혼적
            </label>
{/* 왕복/편도 토글 */}
<button
  type="button"
  onClick={() => setNewOrder(prev => prev.운행유형 === "왕복" ? { ...prev, 운행유형: "편도", 회전수: 1 } : { ...prev, 운행유형: "왕복" })}
  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
    newOrder.운행유형 === "왕복"
      ? "bg-indigo-600 text-white border-indigo-600"
      : "bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50"
  }`}
>
  {newOrder.운행유형 === "왕복" ? "왕복 ✓" : "편도"}
</button>
{newOrder.운행유형 === "왕복" && (
  <RotationPicker size="sm" allowSplit={false} count={newOrder.회전수 || 1} onChange={(c) => handleChange("회전수", c)} />
)}
          </div>

          {/* 거래처명 */}
          <div>
            <label className="font-semibold text-sm">거래처명</label>
            <input autoComplete="off"
              type="text"
              value={newOrder.거래처명}
              onChange={(e) => handleChange("거래처명", e.target.value)}
              className="border p-2 rounded w-full"
            />

            {newOrder.거래처명 &&
              clients
                .filter((c) => c.거래처명.includes(newOrder.거래처명))
                .slice(0, 10)
                .map((c) => (
                  <div
                    key={c._id}
                    className="p-1 px-2 border-b cursor-pointer hover:bg-gray-100"
                    onClick={() =>
                      setNewOrder((prev) => ({
                        ...prev,
                        거래처명: c.거래처명,
                        상차지명: c.상차지명 || "",
                        상차지주소: c.상차지주소 || "",
                      }))
                    }
                  >
                    {c.거래처명}
                  </div>
                ))}
          </div>

          {/* 날짜 / 시간 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label>상차일</label>
              <CustomDatePicker
                value={newOrder.상차일}
                onChange={(e) => handleChange("상차일", e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
  <label><EditableText id="waypoint.label.상차시간" defaultText="상차시간" /></label>
  <CustomSelect
    className="border p-2 rounded w-full"
    value={newOrder.상차시간}
    onChange={(e) => handleChange("상차시간", e.target.value)}
  >
    <option value="">선택없음</option>
    <option value="오전 6시">오전 6시</option>
    <option value="오전 6시 30분">오전 6시 30분</option>
    <option value="오전 7시">오전 7시</option>
    <option value="오전 7시 30분">오전 7시 30분</option>
    <option value="오전 8시">오전 8시</option>
    <option value="오전 8시 30분">오전 8시 30분</option>
    <option value="오전 9시">오전 9시</option>
    <option value="오전 9시 30분">오전 9시 30분</option>
    <option value="오전 10시">오전 10시</option>
    <option value="오전 10시 30분">오전 10시 30분</option>
    <option value="오전 11시">오전 11시</option>
    <option value="오전 11시 30분">오전 11시 30분</option>
    <option value="오후 12시">오후 12시</option>
    <option value="오후 12시 30분">오후 12시 30분</option>
    <option value="오후 1시">오후 1시</option>
    <option value="오후 1시 30분">오후 1시 30분</option>
    <option value="오후 2시">오후 2시</option>
    <option value="오후 2시 30분">오후 2시 30분</option>
    <option value="오후 3시">오후 3시</option>
    <option value="오후 3시 30분">오후 3시 30분</option>
    <option value="오후 4시">오후 4시</option>
    <option value="오후 4시 30분">오후 4시 30분</option>
    <option value="오후 5시">오후 5시</option>
    <option value="오후 5시 30분">오후 5시 30분</option>
    <option value="오후 6시">오후 6시</option>
    <option value="오후 6시 30분">오후 6시 30분</option>
    <option value="오후 7시">오후 7시</option>
    <option value="오후 7시 30분">오후 7시 30분</option>
    <option value="오후 8시">오후 8시</option>
    <option value="오후 8시 30분">오후 8시 30분</option>
    <option value="오후 9시">오후 9시</option>
    <option value="오후 9시 30분">오후 9시 30분</option>
    <option value="오후 10시">오후 10시</option>
    <option value="오후 10시 30분">오후 10시 30분</option>
    <option value="오후 11시">오후 11시</option>
    <option value="오후 11시 30분">오후 11시 30분</option>
  </CustomSelect>
</div>

<div>
  <label>하차일</label>
  <CustomDatePicker
    value={newOrder.하차일}
    onChange={(e) => handleChange("하차일", e.target.value)}
    className="border p-2 rounded w-full"
  />
</div>

<div>
  <label><EditableText id="waypoint.label.하차시간" defaultText="하차시간" /></label>
  <CustomSelect
    className="border p-2 rounded w-full"
    value={newOrder.하차시간}
    onChange={(e) => handleChange("하차시간", e.target.value)}
  >
    <option value="">선택없음</option>
    <option value="오전 6시">오전 6시</option>
    <option value="오전 6시 30분">오전 6시 30분</option>
    <option value="오전 7시">오전 7시</option>
    <option value="오전 7시 30분">오전 7시 30분</option>
    <option value="오전 8시">오전 8시</option>
    <option value="오전 8시 30분">오전 8시 30분</option>
    <option value="오전 9시">오전 9시</option>
    <option value="오전 9시 30분">오전 9시 30분</option>
    <option value="오전 10시">오전 10시</option>
    <option value="오전 10시 30분">오전 10시 30분</option>
    <option value="오전 11시">오전 11시</option>
    <option value="오전 11시 30분">오전 11시 30분</option>
    <option value="오후 12시">오후 12시</option>
    <option value="오후 12시 30분">오후 12시 30분</option>
    <option value="오후 1시">오후 1시</option>
    <option value="오후 1시 30분">오후 1시 30분</option>
    <option value="오후 2시">오후 2시</option>
    <option value="오후 2시 30분">오후 2시 30분</option>
    <option value="오후 3시">오후 3시</option>
    <option value="오후 3시 30분">오후 3시 30분</option>
    <option value="오후 4시">오후 4시</option>
    <option value="오후 4시 30분">오후 4시 30분</option>
    <option value="오후 5시">오후 5시</option>
    <option value="오후 5시 30분">오후 5시 30분</option>
    <option value="오후 6시">오후 6시</option>
    <option value="오후 6시 30분">오후 6시 30분</option>
    <option value="오후 7시">오후 7시</option>
    <option value="오후 7시 30분">오후 7시 30분</option>
    <option value="오후 8시">오후 8시</option>
    <option value="오후 8시 30분">오후 8시 30분</option>
    <option value="오후 9시">오후 9시</option>
    <option value="오후 9시 30분">오후 9시 30분</option>
    <option value="오후 10시">오후 10시</option>
    <option value="오후 10시 30분">오후 10시 30분</option>
    <option value="오후 11시">오후 11시</option>
    <option value="오후 11시 30분">오후 11시 30분</option>
  </CustomSelect>
</div>

          </div>

          {/* 상하차지 */}
          <div>
            <label>상차지명</label>
            <input autoComplete="off"
              className="border p-2 rounded w-full"
              value={newOrder.상차지명}
              onChange={(e) => handleChange("상차지명", e.target.value)}
            />
          </div>

          <div>
            <label>상차지주소</label>
            <input autoComplete="off"
              className="border p-2 rounded w-full"
              value={newOrder.상차지주소}
              onChange={(e) => handleChange("상차지주소", e.target.value)}
            />
          </div>

          <div>
            <label>하차지명</label>
            <input autoComplete="off"
              className="border p-2 rounded w-full"
              value={newOrder.하차지명}
              onChange={(e) => handleChange("하차지명", e.target.value)}
            />
          </div>

          <div>
            <label>하차지주소</label>
            <input autoComplete="off"
              className="border p-2 rounded w-full"
              value={newOrder.하차지주소}
              onChange={(e) => handleChange("하차지주소", e.target.value)}
            />
          </div>


          {/* 화물내용 - ★ 추가됨 */}
          <div>
            <label>화물내용</label>
            <input autoComplete="off"
              className="border p-2 rounded w-full"
              value={newOrder.화물내용}
              onChange={(e) => handleChange("화물내용", e.target.value)}
              placeholder="예: 5톤 파렛트 / 냉동식품"
            />
          </div>

          {/* 차량정보 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>차량종류</label>
              <VehicleTypePicker className="border p-2 rounded w-full" value={newOrder.차량종류} base={["라보", "다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이", "기타"]} placeholder="선택 없음" noneLabel="선택 없음" onChange={(__v) => ((e) => handleChange("차량종류", e.target.value))({ target: { value: __v } })} />
            </div>


            <div>
              <label>차량톤수</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={newOrder.차량톤수}
                onChange={(e) => handleChange("차량톤수", e.target.value)}
                onBlur={(e) => handleChange("차량톤수", toTonUnit(e.target.value))}
              />
            </div>
          </div>

          {/* 운임 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>청구운임</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={newOrder.청구운임}
                onChange={(e) => handleChange("청구운임", e.target.value)}
              />
            </div>

            <div>
              <label>기사운임</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full"
                value={newOrder.기사운임}
                onChange={(e) => handleChange("기사운임", e.target.value)}
              />
            </div>
          </div>

          {/* 지급 / 배차 방식 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>지급방식</label>
              <CompanyOptionPicker optKey="지급방식" placeholder="선택없음" noneLabel="선택없음" className="border p-2 rounded w-full" value={newOrder.지급방식} onChange={(__v) => ((e) => handleChange("지급방식", e.target.value))({ target: { value: __v } })} />
            </div>


            <div>
              <label>배차방식</label>
              <DispatchWayPicker scope={[newOrder?.거래처명, newOrder?.상차지명, newOrder?.하차지명]} placeholder="선택없음" noneLabel="선택없음" className="border p-2 rounded w-full" value={newOrder.배차방식 === "선택없음" ? "" : newOrder.배차방식} dir={newOrder.콜구분 || ""} onPick={(pk) => Object.entries(pk).forEach(([k, v]) => handleChange(k, v))} />
            </div>

          </div>

          {/* 메모 */}
          <div>
            <label>메모</label>
            <textarea
              className="border p-2 rounded w-full h-20"
              value={newOrder.메모}
              onChange={(e) => handleChange("메모", e.target.value)}
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => setShowCreate(false)}
            className="px-3 py-1 rounded bg-gray-300"
          >
            취소
          </button>

          <button onClick={saveOrder} className="px-3 py-1 rounded bg-blue-600 text-white">
            저장
          </button>
        </div>
      </div>



    </div>
  );
}
