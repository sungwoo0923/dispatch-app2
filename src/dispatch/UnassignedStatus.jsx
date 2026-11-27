// ======================= src/dispatch/UnassignedStatus.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { isViewerNow } from "../blind";
import { kpConfirm } from "../kpDialog";
import React from "react";
import { VehicleTypePicker } from "../vehicleTypes";
import { getTenant } from "../fsTenant";
import { createPortal } from "react-dom";
import { useDriverEditChoice } from "../DriverEditChoice";
import MgrBadge from "../MgrBadge";
import { isUrgentOrder, urgentRowStyle, UrgentBadge } from "../urgentOrder";
import { placeSearch } from "../placeSearch";
import OrderStaffFields from "../OrderStaffFields";
import { makeClientMatcher } from "../clientMatch";
import DetailFilterButton, { applyDetailFilter } from "../DetailFilter";
import CustomDatePicker from "../CustomDatePicker";
import { EditableText } from "../EditMode";
import { NewClientModal } from "../sharedDispatchUi";
import { useCompanyDropdownOptions } from "../companyDropdownOptions";
import { CompanyOptionPicker } from "../companyOptionPicker";
import { useNotificationsEnabled } from "../notificationSettings";
import { CustomSelect } from "../CustomSelect";
import { useLoadOrderRange } from "../orderHistory";
import { RotationBadge } from "../rotation";
import { doc } from "firebase/firestore";
import { updateDoc, setDoc } from "../orderWrite";
import { db } from "../firebase";
import { useDetailGetters, ORDER_MGR_EMPTY } from "../detailGetters";
import { pickUnassignedOrders } from "../unassignedRule";
import { useFareRules, fareFormChange, FareRuleHint, FareTypeSelect, FarePctInput } from "../fareRules";
import { forkliftApply, paidOut, SpecialFareButton } from "../forklift";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { RouteGroupField } from "../routeGroups";
import { useDriverSuggest, AssignConfirm, DriverSuggestCell } from "../SmartDispatchUI";
import { DispatchWayPicker } from "../CallPay";
import { CargoExtraChips, ContactPickerIconButton, CpField, CpMemoNoteCards, DriverNamePhoneEdit, KpDeleteConfirm, REVERSED_DATE_ORDER_MSG, RoundTripBadge, StopBadge, TimeAmPmPicker, TimeBasisToggle, WaypointSection, WorkDatesEditModal, _parseWorkDates, copyPanelDiff, cpInputStyle, displayRegDate, dokchaOn, fmtDispatchTime, isRecentShipperEdit, isReversedDateOrder, nameKeyOf, nextManagerName, orderMgrName, orderSortValue, shouldShowDriverMemoAlert, submitCopyOrdersPC, uniqueContactsOf, upsertPlace, useCopyPanelOrig, useOrderStaffName, withPickupDate } from "./shared/dispatchCommon.jsx";


// 간단한 담당자 선택 팝업(미배차 화면 등 자체 팝업이 없는 패널용)
function ContactChooserModal({ title, contacts, onPick, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[360px] max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-3 text-white font-bold text-[14px]">{title}</div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {contacts.map((c, i) => (
            <button key={i} type="button" onClick={() => onPick(c)}
              className="w-full text-left border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
              <div className="text-[13px] font-bold text-gray-900">{c.name || "(이름 없음)"}{c.isPrimary ? <span className="ml-1 text-[10px] text-blue-600">대표</span> : null}</div>
              <div className="text-[12px] text-gray-500">{c.phone || "-"}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t"><button type="button" onClick={onClose} className="w-full py-2 rounded-lg bg-gray-100 text-gray-700 text-[13px] font-semibold">닫기</button></div>
      </div>
    </div>
  );
}
/* -------------------------------------------------
   공통
--------------------------------------------------*/
// ⭐ 2026-11-02 미배차 기준 하나로 통일 — 배차현황/미배차현황 메뉴 숫자와 미배차현황 목록이 같은 규칙을 쓴다.
//   예전엔 숫자는 "배차상태가 배차중"만 셌는데, 그 중엔 차량번호가 이미 들어간(상태값만 안 바뀐) 오더·
//   거래처/상·하차지가 모두 빈 빈 줄·취소 표시 오더·같은 오더가 두 번 들어온 경우가 섞여
//   실제 미배차는 1건인데 2로 보였다(모바일은 이미 "차량번호 없음 + 상/하차지 있음" 기준).
// ⭐ 2026-11-05 PC·모바일 일치 — 미배차 기준은 src/unassignedRule.js 하나(모바일·고정노선현황도 같은 파일)

const StatusBadge = ({ s }) => (
  <span className={`px-2 py-1 rounded text-xs ${s === "배차완료" ? "bg-green-100 text-green-700"
    : s === "취소" ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700"
    }`}>{s || ""}</span>
);
// ===================== DispatchApp.jsx (PART 6/8 — END) =====================

// ===================== DispatchApp.jsx (PART 7/8 — 미배차현황) =====================
export default function UnassignedStatus({ dispatchData, setDispatchData = () => {}, drivers = [], userNameMap = null, patchDispatch, removeDispatch, clients = [], places = [], upsertDriver, upsertClient, isViewer = false, setCargoAddPopup = () => {}, approvedShippers = [], role, userCompany = "", panelOnly = false }) {
  // ⭐ 회사별 커스텀 드롭다운 옵션(Part B) — 오더복사/수정 패널의 상/하차방법·화물타입·톤수타입에 사용.
  const fareRU = useFareRules(getTenant() || userCompany); // ⭐ 2026-11-02 운임규칙 — 오더 복사·수정 패널 운임구분(규칙 사용 회사만)
  const fareOnU = fareRU.on;
  const cargoTypeOptionsCustom = useCompanyDropdownOptions("화물타입", role, userCompany);
  const tonTypeOptionsCustom = useCompanyDropdownOptions("톤수타입", role, userCompany);
  // 오더복사/수정 패널에서 담당자를 새로 입력해도 거래처관리(기본거래처/하차지거래처)에
  // 반영되지 않던 문제 — DispatchManagement/RealtimeStatus/DispatchStatus의
  // savePlaceSmart와 동일한 우선순위(기본거래처 우선)로 담당자를 병합 저장한다.
  // 이 화면은 주소 충돌 팝업 인프라가 없어 단순 병합만 수행한다.
  const syncPlaceContactSimple = async (name, addr, manager, phone) => {
    const nm = (name || "").trim();
    const resolvedManager = (manager || "").trim();
    const resolvedPhone = (phone || "").trim();
    if (!nm || (!resolvedManager && !resolvedPhone)) return;
    const nk = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9가-힣]/g, "");
    const nameKey = nk(nm);

    const mergeContacts = (list) => {
      let contacts = Array.isArray(list) ? [...list] : [];
      if (resolvedManager) {
        const idx = contacts.findIndex(c => c.name?.trim() === resolvedManager);
        if (idx >= 0) contacts = contacts.map((c, i) => ({ ...c, phone: i === idx ? (resolvedPhone || c.phone) : c.phone, isPrimary: i === idx }));
        else { contacts = contacts.map(c => ({ ...c, isPrimary: false })); contacts.push({ name: resolvedManager, phone: resolvedPhone, isPrimary: true }); }
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
      return contacts;
    };

    const clientMatch = (clients || []).find(c => nk(c.업체명 || c.거래처명 || "") === nameKey);
    if (clientMatch && upsertClient) {
      const cContacts = mergeContacts(Array.isArray(clientMatch.contacts) ? clientMatch.contacts
        : (clientMatch.담당자 ? [{ name: clientMatch.담당자, phone: clientMatch.연락처 || "", isPrimary: true }] : []));
      const primary = cContacts.find(c => c.isPrimary) || cContacts[0];
      await upsertClient({
        id: clientMatch.id,
        거래처명: clientMatch.거래처명 || nm,
        주소: addr || clientMatch.주소 || "",
        담당자: primary?.name || clientMatch.담당자 || "",
        연락처: primary?.phone || clientMatch.연락처 || "",
        contacts: cContacts,
      }).catch(() => {});
      return;
    }

    const placeMatch = (places || []).find(p => nk(p.업체명 || "") === nameKey);
    const pContacts = mergeContacts(placeMatch?.contacts);
    await upsertPlace({
      _id: placeMatch?._id,
      업체명: nm,
      주소: addr || placeMatch?.주소 || "",
      contacts: pContacts,
    }).catch(() => {});
  };

  const [q, setQ] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
   // ⭐ 기간을 지정하면 그 기간만 불러온다(미지정 시 최근 범위의 배차중 오더)
   useLoadOrderRange(startDate && endDate ? startDate : null, endDate);
  const [unDetail, setUnDetail] = React.useState(null); // 🔎 세부검색(최대 3차 + 기간)
  const unDetailGet = useDetailGetters(userNameMap, userCompany);
  const unPending = React.useMemo(() => pickUnassignedOrders(dispatchData), [dispatchData]);
  const applyUnDetail = (v) => { setUnDetail(v); if (v?.from && v?.to) { setStartDate(v.from); setEndDate(v.to); } };
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  // 조회 날짜(기간)를 바꾸면 화면에 보이는 행이 바뀌므로, 이전 날짜에서 선택해둔
  // 체크박스가 남아있으면 안 보이는 행을 실수로 삭제/처리하는 사고로 이어질 수 있다.
  React.useEffect(() => { setSelectedIds(new Set()); }, [startDate, endDate]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [filterType, setFilterType] = React.useState("거래처명");
  const [filterValue, setFilterValue] = React.useState("");
  const [openLoadAddrs, setOpenLoadAddrs] = React.useState(new Set());
  const [openUnloadAddrs, setOpenUnloadAddrs] = React.useState(new Set());
  const [openMemos, setOpenMemos] = React.useState(new Set());
  const [vehicleNo, setVehicleNo] = React.useState("");
  const [driverName, setDriverName] = React.useState("");
  const [driverPhone, setDriverPhone] = React.useState("");
  const [matchedDriver, setMatchedDriver] = React.useState(null);
  const [newDriverPopup, setNewDriverPopup] = React.useState(false);

  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [copyPanelOpen, setCopyPanelOpen] = React.useState(false);
  const [copyContactChooser, setCopyContactChooser] = React.useState(null); // 오더복사/수정 패널 담당자 선택
  const [copyTarget, setCopyTarget] = React.useState(null);
  const copyOrigRef = useCopyPanelOrig(copyPanelOpen, copyTarget); // 🛠 2026-11-27 바뀐 칸만 저장
  // 🖱 2026-11-16 미배차현황 오른쪽 클릭 메뉴(수정 · 삭제)
  const [unCtx, setUnCtx] = React.useState(null); // { x, y, row }
  React.useEffect(() => {
    if (!unCtx) return undefined;
    const close = () => setUnCtx(null);
    const key = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", close); window.addEventListener("scroll", close, true); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", key); };
  }, [unCtx]);
  const openUnEdit = (r) => {
    const latest = (dispatchData || []).find(d => d._id === r._id) || r;
    const rawCargo = String(latest?.화물내용 || "");
    // 🛠 2026-11-24 배차현황 패널과 같은 방식으로 나눈다 — 끝이 아는 단위(파레트 · 박스 …)면 [앞부분, 단위], 아니면 글자 전체를 수량 칸에
    //  (예전엔 "숫자+나머지"로만 나눠서 "의류 박스"처럼 숫자로 시작하지 않으면 칸이 비고, 저장하면 화물내용이 지워졌다)
    const cargoBase = rawCargo.split("+")[0];
    const cargoSuffix = [...new Set(["파레트", "파렛트", "박스", "통", ...cargoTypeOptionsCustom])].sort((a, b) => b.length - a.length).find((x) => x && cargoBase.endsWith(x)) || "";
    const cargoMatch = [null, cargoSuffix ? cargoBase.slice(0, -cargoSuffix.length).trim() : cargoBase, cargoSuffix];
    const rawTon = String(latest?.차량톤수 || "");
    const tonMatch = rawTon.match(/([\d.]+)(.*)/);
    setCopyTarget({
      ...latest,
      화물내용: rawCargo,
      화물수량: cargoMatch ? cargoMatch[1] : "",
      화물타입: cargoMatch ? cargoMatch[2].trim() : "",
      톤수값: tonMatch ? tonMatch[1] : "",
      톤수타입: tonMatch ? tonMatch[2] : "",
    });
    setCopyPanelOpen(true);
  };
  // 🧩 2026-11-16 월 마감에서 오더를 누르면 이 패널로(panelOnly 일 때만 듣는다)
  React.useEffect(() => {
    if (!panelOnly) return undefined;
    const h = (e) => {
      const r = e.detail?.row; if (!r) return;
      if (e.detail?.isNew) { setCopyTarget({ 상차일: r.상차일 || "", 하차일: r.하차일 || r.상차일 || "", 거래처명: r.거래처명 || "", 배차상태: "배차중", 화물수량: "", 화물타입: "", 톤수값: "", 톤수타입: "", __newOrder: true }); setCopyPanelOpen(true); return; }
      openUnEdit(r);
    };
    window.addEventListener("kp-open-copy-panel", h);
    return () => window.removeEventListener("kp-open-copy-panel", h);
  });
  const [copyPanelWorkDatesOpen, setCopyPanelWorkDatesOpen] = React.useState(false); // 오더복사수정패널 근무일(묶음) 수정 팝업
  const [clientDropdown, setClientDropdown] = React.useState([]);
  const [clientDropdownOpen, setClientDropdownOpen] = React.useState(false);
  const [clientActiveIdx, setClientActiveIdx] = React.useState(0);
  const [loadPlaceDropdown, setLoadPlaceDropdown] = React.useState([]);
  const [loadPlaceDropdownOpen, setLoadPlaceDropdownOpen] = React.useState(false);
  const [loadPlaceActiveIdx, setLoadPlaceActiveIdx] = React.useState(0);
  const [unloadPlaceDropdown, setUnloadPlaceDropdown] = React.useState([]);
  const [unloadPlaceDropdownOpen, setUnloadPlaceDropdownOpen] = React.useState(false);
  const [unloadPlaceActiveIdx, setUnloadPlaceActiveIdx] = React.useState(0);
  const [warningPopup, setWarningPopup] = React.useState(null);
  const warningPopupRef = React.useRef(null);
  const notificationsEnabled = useNotificationsEnabled();
  const [newClientModalOpen, setNewClientModalOpen] = React.useState(false);
  const [newClientModalData, setNewClientModalData] = React.useState({ name: "", addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" });
  const openNewClientModal = (name) => { setNewClientModalData({ name: (name || "").trim(), addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" }); setNewClientModalOpen(true); };
  const [blackDriverAlert, setBlackDriverAlert] = React.useState(null);
  const [newDriverPopupOpen, setNewDriverPopupOpen] = React.useState(false);
  const [newDriverData, setNewDriverData] = React.useState({ 이름: "", 전화번호: "", 차량번호: "" });
  const [copyClientOptions, setCopyClientOptions] = React.useState([]);
  const [showCopyClientDropdown, setShowCopyClientDropdown] = React.useState(false);
  const [copyClientIndex, setCopyClientIndex] = React.useState(0);
  const copyClientListRef = React.useRef(null);
  React.useEffect(() => {
    const list = copyClientListRef.current;
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
  const [copyPlaceOptions, setCopyPlaceOptions] = React.useState([]);
  const [showCopyPlaceDropdown, setShowCopyPlaceDropdown] = React.useState(false);
  const [copyPlaceType, setCopyPlaceType] = React.useState(null);
  const [copyActiveIndex, setCopyActiveIndex] = React.useState(0);
  const copyPlaceDropdownListRefU = React.useRef(null);
  React.useEffect(() => {
    const list = copyPlaceDropdownListRefU.current;
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
  const clientListRef = React.useRef(null);
  const loadPlaceListRef = React.useRef(null);
  const unloadPlaceListRef = React.useRef(null);

  // 스마트 기사 검색 (Part 7)
  const [smartQ7, setSmartQ7] = React.useState("");
  const [smartList7, setSmartList7] = React.useState([]);
  const [smart7ActiveIdx, setSmart7ActiveIdx] = React.useState(-1);
  const [editingDriver7Id, setEditingDriver7Id] = React.useState(null);
  const [editingDriver7Data, setEditingDriver7Data] = React.useState({ 이름: "", 전화번호: "" });
  const lastWarnedRef7 = React.useRef({ key: "", time: 0 });
  const smart7Ref = React.useRef(null);

  const getPlaceField = (place, ...keys) => {
    for (const k of keys) {
      if (place[k] !== undefined && place[k] !== null && place[k] !== "") return place[k];
    }
    return "";
  };

  const getManagerName = (place) => {
  // contacts 배열 우선 확인
  if (Array.isArray(place.contacts) && place.contacts.length) {
    const primary = place.contacts.find(c => c.isPrimary) || place.contacts[0];
    if (primary?.name) return primary.name;
  }
  const keys = ["담당자","담당자명","담당","manager","managerName","상차지담당자","하차지담당자","contact","contactName","책임자","책임자명","담당자이름","이름"];
  for (const k of keys) {
    if (place[k] !== undefined && place[k] !== null && place[k] !== "") return place[k];
  }
  return "";
};

  const getManagerPhone = (place) => {
  // contacts 배열 우선 확인
  if (Array.isArray(place.contacts) && place.contacts.length) {
    const primary = place.contacts.find(c => c.isPrimary) || place.contacts[0];
    if (primary?.phone) return primary.phone;
  }
  const keys = ["담당자번호","전화번호","연락처","phone","tel","mobile","담당자연락처","담당자전화","담당자전화번호","핸드폰","휴대폰","휴대전화","contact","연락처번호"];
  for (const k of keys) {
    if (place[k] !== undefined && place[k] !== null && place[k] !== "") return place[k];
  }
  return "";
};

  const [toast, setToast] = React.useState(null);
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  // ⭐ 2026-11-13 추천 기사 — 같은 구간을 뛰어 본 기사를 눌러 바로 배정
  const pickDrivers = useDriverSuggest(dispatchData, userCompany);
  const [assignAsk, setAssignAsk] = React.useState(null);
  const [assignBusy, setAssignBusy] = React.useState(false);
  const doAssign = async () => {
    if (!assignAsk || assignBusy) return;
    const { order: o, driver: d } = assignAsk;
    setAssignBusy(true);
    try {
      const patch = { 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호 || ""), 배차상태: "배차완료", updatedAt: Date.now() };
      const ok = await patchDispatch(o._id, { ...patch, __col: o.__col });
      if (ok !== false) showToast(`${d.이름} 기사 배정 완료`);
    } catch (e) { console.error(e); showToast("배정 중 오류가 발생했습니다.", "err"); }
    setAssignBusy(false); setAssignAsk(null);
  };
  // ⭐ 2026-11-05 매칭된 기사 이름·전화 [수정] — 미배차현황 오더 복사/수정 패널
  const cpDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => showToast(m) });
  React.useEffect(() => { cpDrvEdit.reset(); }, [copyPanelOpen, copyTarget?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (warningPopup) setTimeout(() => warningPopupRef.current?.focus(), 0);
  }, [warningPopup]);

  const filterEditClients = (value) => {
    const v = value.toLowerCase();
    return (clients || []).filter(c => String(c.거래처명 || "").toLowerCase().includes(v));
  };

  const filterEditPlaces = (value) => placeSearch(places, value); // ⭐ 2026-11-03 공용 검색

  const filterClients = (value) => {
    const v = (value || "").toLowerCase();
    if (!v) return [];
    return (clients || []).filter(c => String(c.거래처명 || "").toLowerCase().includes(v)).slice(0, 10);
  };

  const filterPlaces = (value) => {
    const v = (value || "").toLowerCase();
    if (!v) return [];
    // 하차지거래처(places)뿐 아니라 기본거래처로 옮겨온 업체도 나오도록 병합해서 검색
    // ⭐ 2026-11-03 업체명+주소로(같은 이름·다른 주소도 모두) + 공용 검색(placeSearch)
    const map = new Map();
    const nk = (n, a) => `${String(n || "").toLowerCase().replace(/\s+/g, "")}|${String(a || "").toLowerCase().replace(/\s+/g, "")}`;
    (places || []).forEach(p => { if (String(p.업체명 || "").trim()) map.set(nk(p.업체명, p.주소), p); });
    const placeNames = new Set((places || []).map(p => String(p.업체명 || "").toLowerCase().replace(/\s+/g, "")).filter(Boolean));
    (clients || []).forEach(c => {
      const name = c.업체명 || c.거래처명 || "";
      const n0 = name.toLowerCase().replace(/\s+/g, "");
      if (!n0 || placeNames.has(n0)) return;
      const k = nk(name, c.주소);
      if (!map.has(k)) map.set(k, { 업체명: name, 주소: c.주소 || "", 담당자: c.담당자 || "", 담당자번호: c.연락처 || c.담당자번호 || "", 메모: c.메모 || "", contacts: Array.isArray(c.contacts) ? c.contacts : undefined });
    });
    return placeSearch(Array.from(map.values()), value);
  };

  const rankPlaces = (list, keyword) => placeSearch(list, keyword).slice(0, 60); // ⭐ 2026-11-03 10개 → 60개(목록은 스크롤) + 공용 검색

  const normalizePlate = (v = "") => {
    return String(v).toUpperCase().replace(/[\s\-]/g, "").replace(/[^0-9A-Z가-힣]/g, "");
  };

const checkWarningStatus = (name, type) => {
  name = String(name || "").trim();
  if (!name) return;
  const foundClient = (clients || []).find(c => String(c.업체명 || c.거래처명 || "").trim() === name);
  if (foundClient && foundClient.팝업표시 !== false) {
    const status = foundClient.업체상태 || foundClient.등급;
    const note = foundClient.오더메모;
    if (status === "블랙" || status === "주의" || status === "이탈" || (note && String(note).trim())) {
      const gradeStatus = (status === "블랙" || status === "주의" || status === "이탈") ? status : null;
      setWarningPopup({ name, status: gradeStatus, type, info: { ...foundClient, 메모: note || foundClient.메모 || "" } });
      return;
    }
  }
  const foundPlace = (places || []).find(p => String(p.업체명 || "").trim() === name);
  if (foundPlace && foundPlace.팝업표시 !== false) {
    const status = foundPlace.업체상태 || foundPlace.등급;
    const note = foundPlace.오더메모;
    if (status === "블랙" || status === "주의" || status === "이탈" || (note && String(note).trim())) {
      const gradeStatus = (status === "블랙" || status === "주의" || status === "이탈") ? status : null;
      setWarningPopup({ name, status: gradeStatus, type, info: { ...foundPlace, 메모: note || foundPlace.메모 || "" } });
    }
  }
};

  const formatPhone = (phone = "") => {
    const clean = String(phone).replace(/[^\d]/g, "");
    if (clean.length === 11) return clean.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
    if (clean.length === 10) return clean.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
    return clean;
  };
const nd7 = (s = "") => String(s).replace(/[-.\s]/g, "").toLowerCase();

  const parseDriverText7 = (text) => {
    let name = "", phone = "", plate = "";
    const hasTag = text.includes("[차주정보]") || text.includes("[차량정보]") || text.includes("[기사정보]");
    if (hasTag) {
      let ownerMatch = text.match(/\[(차주정보|기사정보)\]\s*([^\n/]+?)[\s/]+(\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4})/);
      if (ownerMatch) {
        name = ownerMatch[2].trim();
        phone = ownerMatch[3].replace(/[-.\s]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
      } else {
        const noSepMatch = text.match(/\[(차주정보|기사정보)\]\s*([가-힣a-zA-Z]+)(\d{10,11})/);
        if (noSepMatch) {
          name = noSepMatch[2].trim();
          phone = noSepMatch[3].replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
        }
      }
      const vehicleLine = text.match(/\[차량정보\]\s*([^\n]+)/);
      if (vehicleLine) {
        const plateInLine = vehicleLine[1].match(/[가-힣]{0,3}\d{2,3}[가-힣]\d{4}/);
        if (plateInLine) plate = plateInLine[0];
      }
      if (!phone) {
        const pm = text.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/);
        if (pm) phone = pm[0].replace(/[-.\s]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
      }
      if (!plate) {
        const plm = text.match(/[가-힣]{0,3}\d{2,3}[가-힣]\d{4}/);
        if (plm) plate = plm[0];
      }
      return { phone, plate, name };
    }
const phoneMatch = text.match(/01[016789][- .]?\d{3,4}[- .]?\d{4}/);
    phone = phoneMatch ? phoneMatch[0].replace(/[-.\s]/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : "";
    const plateMatch = text.match(/[가-힣]{2,3}\d{2}[가-힣]\d{4}|\d{2,3}[가-힣]\d{4}/);
    plate = plateMatch ? plateMatch[0] : "";
    const stripped = text.replace(phoneMatch?.[0] || "", "").replace(plate || "", "");
    const nameMatch = stripped.match(/[가-힣]{2,4}/g) || [];
    const EXCLUDE = ["강원","서울","경기","인천","부산","대구","광주","대전","울산","세종","경북","경남","전북","전남","충북","충남","제주","초장축윙","초장축","장축","윙바디","카고","탑차","냉장탑","냉동탑","냉장윙","냉동윙","냉장","냉동","리프트","다마스","라보"];
    name = nameMatch.find(n => n.length >= 2 && !EXCLUDE.includes(n) && !/[구시군동읍면로]$/.test(n)) || "";
    return { phone, plate, name };
  };

  const handleSmart7Input = (val) => {
    setSmartQ7(val);
    setSmart7ActiveIdx(-1);
    if (!val.trim()) { setSmartList7([]); return; }
    const { plate } = parseDriverText7(val);
    if (!plate) { setSmartList7([]); return; }
    const results = (drivers || [])
      .filter(d => nd7(d.차량번호) === nd7(plate))
      .sort((a, b) => {
        const { name: nm, phone: ph } = parseDriverText7(val);
        const aExact = nd7(a.이름) === nd7(nm) && nd7(a.전화번호) === nd7(ph);
        const bExact = nd7(b.이름) === nd7(nm) && nd7(b.전화번호) === nd7(ph);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
    setSmartList7(results.slice(0, 8));
  };
  // 스마트검색 드롭다운 항목 선택 공통 처리 (마우스 클릭 / 방향키+엔터 공용)
  const selectSmart7Driver = (d) => {
    setCopyTarget(prev => ({ ...prev, 차량번호: d.차량번호, 이름: d.이름 || "", 전화번호: formatPhone(d.전화번호 || ""), 배차상태: "배차완료" }));
    setSmartQ7(""); setSmartList7([]); setSmart7ActiveIdx(-1);
  };
  const handleSmart7KeyDown = (e) => {
    if (smartList7.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setSmart7ActiveIdx(prev => {
        const next = e.key === "ArrowDown" ? prev + 1 : prev - 1;
        if (next < 0) return smartList7.length - 1;
        if (next >= smartList7.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (smartList7.length > 0 && smart7ActiveIdx >= 0 && smart7ActiveIdx < smartList7.length) {
        selectSmart7Driver(smartList7[smart7ActiveIdx]);
      } else {
        applySmart7();
      }
      return;
    }
    if (e.key === "Escape" && smartList7.length > 0) {
      e.preventDefault();
      setSmartList7([]); setSmart7ActiveIdx(-1);
    }
  };

  const applySmart7 = async () => {
    const val = smartQ7;
    if (!val.trim()) return;
    const { phone: ph, plate: pl, name: nm } = parseDriverText7(val);
    if (!pl && !nm && !ph) return;

    if (!pl) {
      if (nm || ph) {
        setCopyTarget(prev => ({ ...prev, 차량번호: "", 이름: nm || "", 전화번호: formatPhone(ph || ""), 배차상태: "배차중" }));
        setSmartQ7(""); setSmartList7([]);
      }
      return;
    }

    const byPlate = (drivers || []).filter(d => nd7(d.차량번호) === nd7(pl));
    if (byPlate.length > 0) {
      const existing = byPlate[0];
      const sameName = nd7(existing.이름) === nd7(nm);
      if (sameName || !nm) {
        setCopyTarget(prev => ({ ...prev, 차량번호: existing.차량번호, 이름: existing.이름, 전화번호: formatPhone(existing.전화번호 || ""), 배차상태: "배차완료" }));
      } else {
        setCopyTarget(prev => ({ ...prev, 차량번호: existing.차량번호, 이름: existing.이름, 전화번호: formatPhone(existing.전화번호 || ""), 배차상태: "배차완료" }));
      }
    } else {
      setCopyTarget(prev => ({ ...prev, 차량번호: pl, 이름: nm || "", 전화번호: formatPhone(ph || ""), 배차상태: pl ? "배차완료" : "배차중" }));
    }
    setSmartQ7(""); setSmartList7([]);
  };
  const generateTimeOptions = () => {
    const result = [];
    for (let h = 0; h < 24; h++) {
      for (let m of [0, 30]) {
        const isPM = h >= 12;
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        result.push(`${isPM ? "오후" : "오전"} ${hour12}시${m === 30 ? " 30분" : ""}`);
      }
    }
    return result;
  };

  const filtered = React.useMemo(() => {
    let result = pickUnassignedOrders(dispatchData);
    if (startDate && endDate) {
      result = result.filter((r) => (r.상차일 || "") >= startDate && (r.상차일 || "") <= endDate);
    }
    if (unDetail) result = applyDetailFilter(result, unDetail, { getters: unDetailGet, withDate: false }); // 🔎 세부검색
    if (filterValue.trim()) {
      // ⭐ 2026-11-03 거래처·상차지·하차지는 정확히 같은 이름이 있으면 그것만
      const unNameM = ["거래처명", "상차지명", "하차지명"].includes(filterType) ? makeClientMatcher(filterValue, result.map((r) => r[filterType])) : null;
      result = result.filter((r) => (unNameM ? unNameM(r[filterType]) : String(r[filterType] || "").toLowerCase().includes(filterValue.toLowerCase())));
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      result = result.filter((r) => Object.values(r).some((v) => String(v || "").toLowerCase().includes(lower)));
    }
    return result.sort((a, b) => {
      const d1 = a.상차일 || "";
      const d2 = b.상차일 || "";
      if (d1 !== d2) return d1.localeCompare(d2);
      return (a.상차시간 || "").localeCompare(b.상차시간 || "");
    });
  }, [dispatchData, q, startDate, endDate, filterType, filterValue, unDetail, unDetailGet]);

  const unMgrMap = useOrderStaffName(userNameMap, userCompany); // ⭐ 배차담당자 칸(회사별 기능 꺼지면 null)
  const headers = [
    "순번", ...(isViewer ? [] : ["추천 기사"]), ...(unMgrMap ? ["배차담당자"] : []), "등록일","경과","상차일","상차시간","하차일","하차시간","거래처명",
    "상차지명","상차지주소","하차지명","하차지주소",
    "차량종류","차량톤수","화물내용","경유","배차상태","메모",
  ];
  // ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억. 걸러진 목록만 따로 정렬해 가볍다.
  const unSort = useTableSort("unassigned");
  const unSortValue = React.useCallback((r, key, i) => {
    if (key === "경과") return r.등록일 ? -new Date(r.등록일).getTime() : null; // 오래된 것 = 경과 큼
    if (key === "경유") return null;
    if (key === "배차담당자") return orderMgrName(unMgrMap, r);
    return orderSortValue(r, key, i);
  }, [unMgrMap]);
  const sortedRows = React.useMemo(() => sortRows(filtered, unSort.sort, unSortValue), [filtered, unSort.sort, unSortValue]);

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r._id)));
  };
  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const exitDeleteMode = () => { setDeleteMode(false); setSelectedIds(new Set()); };

  const removeDocs = async (ids) => {
    if (!ids.length) { showToast("선택된 항목이 없습니다.", "err"); return; }
    const isShipperOrder = (r) => r?.source === "shipper" || r?.source === "shipper_mobile";
    if (ids.some((id) => {
      const r = (dispatchData || []).find((d) => d._id === id);
      return isShipperOrder(r) && !r?.취소요청;
    })) {
      showToast("화주사가 등록한 오더는 운송사에서 임의로 삭제할 수 없습니다. 화주사가 배차취소를 요청한 건만 승인 후 삭제할 수 있습니다.", "err");
      return;
    }
    // ⭐ Firestore 쓰기를 다 기다린 뒤에야 팝업이 닫혀서 "삭제"를 눌러도 한참
    // 있다가 반응하는 버벅임이 있었다 — 팝업/안내는 먼저 끝내고 실제 삭제는
    // 백그라운드로 돌린다(4파트 executeDelete와 동일한 수정).
    // ⭐ 2026-11-05 한 번에 삭제(writeBatch) + 삭제 진행 창(완료 건 확인은 removeDispatch가 한 번에 묻는다)
    setDeleteConfirmOpen(false);
    exitDeleteMode();
    Promise.resolve(removeDispatch(ids)).then(() => showToast(`${ids.length}건 삭제 완료`)).catch((e) => {
      console.error(e);
      showToast("삭제 중 오류가 발생했습니다.", "err");
    });
  };

  function normalizeVehicleNo(v = "") {
    return String(v).toUpperCase().replace(/[\s\-]/g, "").replace(/[^0-9A-Z가-힣]/g, "");
  }

  function findDriverByVehicleNo(vehicleNo) {
    const key = normalizeVehicleNo(vehicleNo);
    if (!key) return null;
    return drivers.find(d => {
      const candidates = [d.차량번호, d.carNo, d.vehicle, d.차량, d.car?.number, d.car?.차량번호, d.차량정보?.차량번호, d.vehicleInfo?.number];
      return candidates.some(v => normalizeVehicleNo(v) === key);
    }) || null;
  }

  const headBase = "bg-[#1B2B4B] text-white text-center text-[13px] font-semibold px-3 py-3 whitespace-nowrap border-b border-white/10";
  const cellBase = "text-center px-3 py-2.5 whitespace-nowrap align-middle text-[13px] border-b border-gray-100";

  // 🧩 2026-11-16 오더 복사/수정 패널을 변수로 — 월 마감(panelOnly)에서도 이 패널을 그대로 연다
      const copyPanelEl = copyPanelOpen && copyTarget ? (
        <div className="fixed inset-0 z-[99999]">
          {copyContactChooser && (
            <ContactChooserModal
              title={copyContactChooser.type === "pickup" ? "상차지 담당자 선택" : "하차지 담당자 선택"}
              contacts={copyContactChooser.contacts}
              onClose={() => setCopyContactChooser(null)}
              onPick={(c) => {
                const key = copyContactChooser.type === "pickup" ? "상차" : "하차";
                setCopyTarget(prev => ({ ...prev, [`${key}지담당자`]: c.name || "", [`${key}지담당자번호`]: c.phone || "" }));
                setCopyContactChooser(null);
              }}
            />
          )}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCopyPanelOpen(false)} />
          <div className="absolute top-0 right-0 h-full w-[min(1180px,96vw)] bg-[#F4F6FA] shadow-2xl border-l overflow-y-auto">
            <div className="cp-compact px-5 pb-5 space-y-4 text-[14px]">

              {/* 패널 헤더 */}
              <div className="sticky top-0 z-20 -mx-5 mb-1 flex justify-between items-center gap-3 px-5 py-2.5 text-white shadow-[0_6px_18px_rgba(11,20,40,0.25)]" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>ORDER · COPY / EDIT</div>
                  <h2 className="text-[18px] font-black leading-tight truncate">{copyTarget.__newOrder ? "오더 등록" : <EditableText id="copyPanel.title" defaultText="오더 복사 / 수정 패널" />} <span className="ml-1 text-[13.5px] font-semibold text-white/60">{copyTarget.거래처명} · {copyTarget.상차지명} → {copyTarget.하차지명}</span></h2>
                </div>
                <div className="flex gap-2 items-center shrink-0 [&_button]:whitespace-nowrap [&_button]:shrink-0">
                  {!copyTarget.__newOrder && <button
                    onClick={async () => {
                      if (isViewer) { showToast("조회전용 권한으로는 수정할 수 없습니다.", "err"); return; }
                      if (!copyTarget?._id) { showToast("수정할 오더 정보를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.", "err"); return; }
                      if (isReversedDateOrder(copyTarget?.상차일, copyTarget?.하차일)) { showToast(REVERSED_DATE_ORDER_MSG, "err"); return; }
                      if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
                      if (!(await cpDrvEdit.finish(copyTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택
                      const finalCargo = copyTarget.화물내용 || ""; // 🛠 2026-11-24 입력할 때마다 맞춰 둔 화물내용을 그대로(예전엔 수량+단위로 다시 만들어, 숫자로 시작하지 않는 화물내용이 저장할 때 지워졌다)
                      const payload = { ...copyTarget, 화물내용: finalCargo, 독차: dokchaOn(copyTarget), updatedAt: Date.now() }; // ⭐ 2026-11-06 독차 기본
                      ["화물수량", "화물타입", "톤수값", "톤수타입"].forEach((k) => { delete payload[k]; }); // 화면용 임시 칸은 저장하지 않는다(다른 패널과 같게)
                      const ok = await patchDispatch(copyTarget._id, copyPanelDiff(payload, copyOrigRef.current)); // 🛠 2026-11-27 바뀐 칸만
                      if (ok === false) return;
                      showToast("오더 수정 완료");
                      setCopyPanelOpen(false);
                      if (copyTarget.상차지명) syncPlaceContactSimple(copyTarget.상차지명, copyTarget.상차지주소 || "", copyTarget.상차지담당자 || "", copyTarget.상차지담당자번호 || "");
                      if (copyTarget.하차지명) syncPlaceContactSimple(copyTarget.하차지명, copyTarget.하차지주소 || "", copyTarget.하차지담당자 || "", copyTarget.하차지담당자번호 || "");
                    }}
                    className="px-3.5 h-8 bg-white text-[#0F1A30] rounded-lg text-[13px] font-black hover:bg-[#EEF3FB] transition"
                  >
                    <EditableText id="copyPanel.수정저장" defaultText="수정 저장" />
                  </button>}
                  <button
                    onClick={async () => {
                      if (isViewer) { showToast("조회전용 권한으로는 등록할 수 없습니다.", "err"); return; }
                      if (!copyTarget) { showToast("복사할 데이터가 없습니다.", "err"); return; }
                      if (!(await cpDrvEdit.finish(copyTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택
                      const finalCargo = copyTarget.화물내용 || ""; // 🛠 2026-11-24 입력할 때마다 맞춰 둔 화물내용을 그대로(예전엔 수량+단위로 다시 만들어, 숫자로 시작하지 않는 화물내용이 저장할 때 지워졌다)
                      const { __newOrder: _isNew, ...copySrc } = copyTarget; // 🧩 2026-11-16 월 마감 [+ 오더 추가] — 같은 패널로 새 오더 등록
                      const ok = await submitCopyOrdersPC(copySrc, approvedShippers, finalCargo, _isNew ? {} : (dispatchData || []).find((d) => d._id === copyTarget._id)); // ⭐ 2026-11-06 몇 건·날짜 고르기 · 🛠 2026-11-24 패널에서 바꾼 날짜로 시작(새 오더는 패널 날짜 그대로)
                      if (ok === false) return;
                      showToast(_isNew ? (ok > 1 ? `${ok}건 등록 완료` : "오더 등록 완료") : ok > 1 ? `${ok}건 복사 등록 완료` : "복사 등록 완료");
                      setCopyPanelOpen(false);
                      if (copyTarget.상차지명) syncPlaceContactSimple(copyTarget.상차지명, copyTarget.상차지주소 || "", copyTarget.상차지담당자 || "", copyTarget.상차지담당자번호 || "");
                      if (copyTarget.하차지명) syncPlaceContactSimple(copyTarget.하차지명, copyTarget.하차지주소 || "", copyTarget.하차지담당자 || "", copyTarget.하차지담당자번호 || "");
                    }}
                    className="px-3.5 h-8 bg-[#8FB0F0] text-[#0B1428] rounded-lg text-[13px] font-black hover:bg-[#CFE0FF] transition"
                  >
                    {copyTarget.__newOrder ? "등록" : <EditableText id="copyPanel.복사등록" defaultText="복사 등록" />}
                  </button>
                  <button onClick={() => setCopyPanelOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/25 text-white/70 hover:text-white hover:bg-white/10 transition text-lg">✕</button>
                </div>
              </div>

              {/* 섹션 공통 스타일 */}
              {/* 거래처 정보 */}
              <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-2">
                  <h3 className="text-[14px] font-bold text-white">거래처 정보</h3>
                </div>
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
                        onChange={(e) => {
                          const v = e.target.value;
                          setCopyTarget(p => ({...p, 거래처명: v}));
                          if (v.trim()) {
                            const hasClients = (clients || []).length > 0;
                            const list = hasClients ? filterClients(v) : rankPlaces(filterPlaces(v), v);
                            setCopyClientOptions(list);
                            setShowCopyClientDropdown(list.length > 0);
                            setCopyClientIndex(0);
                          } else {
                            setShowCopyClientDropdown(false);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (!showCopyClientDropdown) return;
                          if (e.key === "ArrowDown") { e.preventDefault(); setCopyClientIndex(i => Math.min(i + 1, copyClientOptions.length - 1)); }
                          if (e.key === "ArrowUp") { e.preventDefault(); setCopyClientIndex(i => Math.max(i - 1, 0)); }
                          if (e.key === "Enter") { e.preventDefault(); const c = copyClientOptions[copyClientIndex]; if (!c) return; const name = c.거래처명 || c.업체명 || ""; setCopyTarget(prev => ({...prev, 거래처명: name})); setShowCopyClientDropdown(false); checkWarningStatus(name, "거래처"); }
                          if (e.key === "Tab") { const c = copyClientOptions[copyClientIndex]; if (c) { const name = c.거래처명 || c.업체명 || ""; setCopyTarget(prev => ({...prev, 거래처명: name})); setShowCopyClientDropdown(false); checkWarningStatus(name, "거래처"); } }
                          if (e.key === "Escape") setShowCopyClientDropdown(false);
                        }}
                        onBlur={() => setTimeout(() => setShowCopyClientDropdown(false), 150)}
                      />
                      {showCopyClientDropdown && copyClientOptions.length > 0 && (
                        <div ref={copyClientListRef} className="absolute z-50 bg-white border border-gray-200 w-full max-h-40 overflow-y-auto shadow-xl rounded-lg mt-1">
                          {copyClientOptions.map((c, i) => {
                            const name = c.거래처명 || c.업체명 || "";
                            return (
                              <div key={c._id || c.id || i} className={`px-3 py-2.5 cursor-pointer text-[13px] ${i === copyClientIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"}`} onMouseDown={() => { setCopyTarget(prev => ({...prev, 거래처명: name})); setShowCopyClientDropdown(false); checkWarningStatus(name, "거래처"); }}>
                                <div className="font-semibold">{name}</div>
                                <div className={`text-xs ${i === copyClientIndex ? "text-white/70" : "text-gray-500"}`}>{c.주소}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 상하차 정보 */}
              <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-2">
                  <h3 className="text-[14px] font-bold text-white">상하차 정보</h3>
                </div>
                <div className="px-5 py-3">
                  <div className="grid grid-cols-2 gap-x-8">
                    {/* 상차 */}
                    <div className="space-y-1.5">
                      <div className="text-[12px] font-bold text-blue-600 pb-1 border-b border-blue-100">상차</div>
                      <CpField label={<>
                        상차일
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
                        <CustomDatePicker className={cpInputStyle} value={copyTarget?.상차일 ?? ""} onChange={(e) => setCopyTarget(p => withPickupDate(p, e.target.value))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
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
                          onChange={v => setCopyTarget(p => ({...p, 상차시간: v}))}
                          selectCls="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                        /></div>
                        <TimeBasisToggle value={copyTarget?.상차시간기준} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} onChange={(v) => setCopyTarget(p => ({ ...p, 상차시간기준: v }))} /></div>
                       </CpField>
                      <CpField label="상차방법">
                        <CompanyOptionPicker optKey="상하차방법" title="상차방법" placeholder="선택" noneLabel="선택" className={cpInputStyle} value={copyTarget?.상차방법 ?? ""} onChange={(__v) => ((e) => setCopyTarget(p => ({...p, 상차방법: e.target.value})))({ target: { value: __v } })} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      <CpField label="상차지명">
                        <div className="relative">
                          <input autoComplete="off"
                          disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
                            className={cpInputStyle}
                            value={copyTarget?.상차지명 ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v.trim()) {
                                setCopyTarget(p => ({...p, 상차지명: "", 상차지주소: "", 상차지담당자: "", 상차지담당자번호: ""}));
                                setShowCopyPlaceDropdown(false);
                                return;
                              }
                              setCopyTarget(p => ({...p, 상차지명: v}));
                              setCopyPlaceType("pickup");
                              const list = rankPlaces(filterPlaces(v), v);
                              setCopyPlaceOptions(list);
                              setShowCopyPlaceDropdown(list.length > 0);
                              setCopyActiveIndex(0);
                            }}
                            onKeyDown={(e) => {
                              if (!showCopyPlaceDropdown || copyPlaceType !== "pickup") return;
                              if (e.key === "ArrowDown") { e.preventDefault(); setCopyActiveIndex(i => Math.min(i + 1, copyPlaceOptions.length - 1)); }
                              if (e.key === "ArrowUp") { e.preventDefault(); setCopyActiveIndex(i => Math.max(i - 1, 0)); }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const p = copyPlaceOptions[copyActiveIndex];
                                if (!p) return;
                                setCopyTarget(prev => ({...prev, 상차지명: p.업체명 || "", 상차지주소: p.주소 || "", 상차지담당자: getManagerName(p), 상차지담당자번호: getManagerPhone(p)}));
                                setShowCopyPlaceDropdown(false);
                                checkWarningStatus(p.업체명, "상차지");
                              }
                              if (e.key === "Tab") {
                                const p = copyPlaceOptions[copyActiveIndex];
                                if (p) {
                                  setCopyTarget(prev => ({...prev, 상차지명: p.업체명 || "", 상차지주소: p.주소 || "", 상차지담당자: getManagerName(p), 상차지담당자번호: getManagerPhone(p)}));
                                  setShowCopyPlaceDropdown(false);
                                  checkWarningStatus(p.업체명, "상차지");
                                }
                              }
                              if (e.key === "Escape") setShowCopyPlaceDropdown(false);
                            }}
                            onBlur={() => setTimeout(() => setShowCopyPlaceDropdown(false), 150)}
                          />
                          {showCopyPlaceDropdown && copyPlaceType === "pickup" && copyPlaceOptions.length > 0 && (
                            <div ref={copyPlaceDropdownListRefU} className="absolute z-50 bg-white border border-gray-200 w-full max-h-40 overflow-y-auto shadow-xl rounded-lg mt-1">
                              {copyPlaceOptions.map((p, i) => (
                                <div key={p._id || i} className={`px-3 py-2.5 cursor-pointer text-[13px] ${i === copyActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"}`}
                                  onMouseDown={() => { setCopyTarget(prev => ({...prev, 상차지명: p.업체명 || "", 상차지주소: p.주소 || "", 상차지담당자: getManagerName(p), 상차지담당자번호: getManagerPhone(p)})); setShowCopyPlaceDropdown(false); checkWarningStatus(p.업체명, "상차지"); }}>
                                  <div className="font-semibold">{p.업체명}</div>
                                  <div className={`text-xs ${i === copyActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CpField>
                      <CpField label="상차지주소">
                        <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-none leading-snug focus:outline-none focus:border-[#1B2B4B]" value={copyTarget?.상차지주소 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 상차지주소: e.target.value}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      <CpField label={<span className="flex items-center justify-between w-full">상차지 담당자명<ContactPickerIconButton title="상차지 담당자명 선택" onClick={() => { const nm = copyTarget?.상차지명 || ""; if (!nm.trim()) return alert("상차지명을 먼저 입력하세요."); const p = filterPlaces(nm).find(x => nameKeyOf(x.업체명) === nameKeyOf(nm)); const cs = uniqueContactsOf(p); if (!cs.length) return alert("등록된 담당자가 없습니다."); setCopyContactChooser({ type: "pickup", contacts: cs }); }} /></span>}>
                        <input autoComplete="off" className={cpInputStyle} value={copyTarget?.상차지담당자 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 상차지담당자: e.target.value}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      <CpField label="상차지 연락처">
                        <input autoComplete="off" className={cpInputStyle} value={copyTarget?.상차지담당자번호 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 상차지담당자번호: formatPhone(e.target.value)}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      {/* 경유 상차지 */}
                      {(() => {
                        const _sp7 = (v) => { if (Array.isArray(v)) return v; if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } } return []; };
                        const stops = [..._sp7(copyTarget?.경유상차목록), ..._sp7(copyTarget?.경유지_상차)].filter(s => s?.업체명?.trim() || s?.주소?.trim());
                        const dedup = [...new Map(stops.map(s => [(s.업체명||s.주소), s])).values()];
                        return <WaypointSection stops={dedup} type="pickup" onSave={(newList) => setCopyTarget(p => ({ ...p, 경유상차목록: newList, 경유지_상차: newList }))} placeRows={[...clients, ...places]} timeOptions={[]} className="mt-2" orderDate={copyTarget?.상차일 || ""} />;
                      })()}
                    </div>

                    {/* 하차 */}
                    <div className="space-y-1.5">
                      <div className="text-[12px] font-bold text-red-500 pb-1 border-b border-red-100">하차</div>
                      <CpField label="하차일">
                        <CustomDatePicker className={cpInputStyle} value={copyTarget?.하차일 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 하차일: e.target.value}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                       <CpField label="하차시간">
                        {/* ⭐ 2026-11-06 이전/이후(시간구분) — 등록창(3파트)과 같게 */}
                        <div className="flex items-center gap-2"><div className="min-w-0"><TimeAmPmPicker
                        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
                          value={copyTarget?.하차시간 ?? ""}
                          onChange={v => setCopyTarget(p => ({...p, 하차시간: v}))}
                          selectCls="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                        /></div>
                        <TimeBasisToggle value={copyTarget?.하차시간기준} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} onChange={(v) => setCopyTarget(p => ({ ...p, 하차시간기준: v }))} /></div>
                       </CpField>
                      <CpField label="하차방법">
                        <CompanyOptionPicker optKey="상하차방법" title="하차방법" placeholder="선택" noneLabel="선택" className={cpInputStyle} value={copyTarget?.하차방법 ?? ""} onChange={(__v) => ((e) => setCopyTarget(p => ({...p, 하차방법: e.target.value})))({ target: { value: __v } })} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      <CpField label="하차지명">
                        <div className="relative">
                          <input autoComplete="off"
                          disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
                            className={cpInputStyle}
                            value={copyTarget?.하차지명 ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v.trim()) {
                                setCopyTarget(p => ({...p, 하차지명: "", 하차지주소: "", 하차지담당자: "", 하차지담당자번호: ""}));
                                setShowCopyPlaceDropdown(false);
                                return;
                              }
                              setCopyTarget(p => ({...p, 하차지명: v}));
                              setCopyPlaceType("drop");
                              const list = rankPlaces(filterPlaces(v), v);
                              setCopyPlaceOptions(list);
                              setShowCopyPlaceDropdown(list.length > 0);
                              setCopyActiveIndex(0);
                            }}
                            onKeyDown={(e) => {
                              if (!showCopyPlaceDropdown || copyPlaceType !== "drop") return;
                              if (e.key === "ArrowDown") { e.preventDefault(); setCopyActiveIndex(i => Math.min(i + 1, copyPlaceOptions.length - 1)); }
                              if (e.key === "ArrowUp") { e.preventDefault(); setCopyActiveIndex(i => Math.max(i - 1, 0)); }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const p = copyPlaceOptions[copyActiveIndex];
                                if (!p) return;
                                setCopyTarget(prev => ({...prev, 하차지명: p.업체명 || "", 하차지주소: p.주소 || "", 하차지담당자: getManagerName(p), 하차지담당자번호: getManagerPhone(p)}));
                                setShowCopyPlaceDropdown(false);
                                checkWarningStatus(p.업체명, "하차지");
                              }
                              if (e.key === "Tab") {
                                const p = copyPlaceOptions[copyActiveIndex];
                                if (p) {
                                  setCopyTarget(prev => ({...prev, 하차지명: p.업체명 || "", 하차지주소: p.주소 || "", 하차지담당자: getManagerName(p), 하차지담당자번호: getManagerPhone(p)}));
                                  setShowCopyPlaceDropdown(false);
                                  checkWarningStatus(p.업체명, "하차지");
                                }
                              }
                              if (e.key === "Escape") setShowCopyPlaceDropdown(false);
                            }}
                            onBlur={() => setTimeout(() => setShowCopyPlaceDropdown(false), 150)}
                          />
                          {showCopyPlaceDropdown && copyPlaceType === "drop" && copyPlaceOptions.length > 0 && (
                            <div ref={copyPlaceDropdownListRefU} className="absolute z-50 bg-white border border-gray-200 w-full max-h-40 overflow-y-auto shadow-xl rounded-lg mt-1">
                              {copyPlaceOptions.map((p, i) => (
                                <div key={p._id || i} className={`px-3 py-2.5 cursor-pointer text-[13px] ${i === copyActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"}`}
                                  onMouseDown={() => { setCopyTarget(prev => ({...prev, 하차지명: p.업체명 || "", 하차지주소: p.주소 || "", 하차지담당자: getManagerName(p), 하차지담당자번호: getManagerPhone(p)})); setShowCopyPlaceDropdown(false); checkWarningStatus(p.업체명, "하차지"); }}>
                                  <div className="font-semibold">{p.업체명}</div>
                                  <div className={`text-xs ${i === copyActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CpField>
                      <CpField label="하차지주소">
                        <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-none leading-snug focus:outline-none focus:border-[#1B2B4B]" value={copyTarget?.하차지주소 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 하차지주소: e.target.value}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      <CpField label={<span className="flex items-center justify-between w-full">하차지 담당자명<ContactPickerIconButton title="하차지 담당자명 선택" onClick={() => { const nm = copyTarget?.하차지명 || ""; if (!nm.trim()) return alert("하차지명을 먼저 입력하세요."); const p = filterPlaces(nm).find(x => nameKeyOf(x.업체명) === nameKeyOf(nm)); const cs = uniqueContactsOf(p); if (!cs.length) return alert("등록된 담당자가 없습니다."); setCopyContactChooser({ type: "drop", contacts: cs }); }} /></span>}>
                        <input autoComplete="off" className={cpInputStyle} value={copyTarget?.하차지담당자 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 하차지담당자: e.target.value}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      <CpField label="하차지 연락처">
                        <input autoComplete="off" className={cpInputStyle} value={copyTarget?.하차지담당자번호 ?? ""} onChange={(e) => setCopyTarget(p => ({...p, 하차지담당자번호: formatPhone(e.target.value)}))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                      </CpField>
                      {/* 경유 하차지 */}
                      {(() => {
                        const _sp7 = (v) => { if (Array.isArray(v)) return v; if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } } return []; };
                        const stops = [..._sp7(copyTarget?.경유하차목록), ..._sp7(copyTarget?.경유지_하차)].filter(s => s?.업체명?.trim() || s?.주소?.trim());
                        const dedup = [...new Map(stops.map(s => [(s.업체명||s.주소), s])).values()];
                        return <WaypointSection stops={dedup} type="drop" onSave={(newList) => setCopyTarget(p => ({ ...p, 경유하차목록: newList, 경유지_하차: newList }))} placeRows={[...clients, ...places]} timeOptions={[]} className="mt-2" orderDate={copyTarget?.하차일 || ""} />;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

             {/* 기사정보 */}
              <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-2">
                  <h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.기사정보" defaultText="기사정보" /></h3>
                </div>
                <div className="px-5 py-3 space-y-1.5">

                  {/* 스마트 검색 */}
                  <CpField label={<>스마트 검색</>}>
                    <div className="relative">
                      <textarea
                        ref={smart7Ref}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none"
                        placeholder="차량번호 · 기사명 · 연락처 · 문자 내용 붙여넣기"
                        value={smartQ7}
                        onChange={(e) => handleSmart7Input(e.target.value)}
                        onKeyDown={handleSmart7KeyDown}
                      />
                      {smartList7.length > 0 && (
                        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                          {smartList7.map((d, i) => (
                            <div key={d.id || i} className={`border-b border-gray-100 last:border-0 ${i===smart7ActiveIdx?"bg-blue-100":""}`}
                              onMouseEnter={() => setSmart7ActiveIdx(i)}>
                              {editingDriver7Id === (d.id || i) ? (
                                <div className="px-4 py-3 bg-blue-50">
                                  <div className="text-[11px] font-semibold text-gray-500 mb-1">{d.차량번호}</div>
                                  <input autoComplete="off"
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[13px] mb-1.5 focus:outline-none focus:border-[#1B2B4B]"
                                    placeholder="기사 이름"
                                    value={editingDriver7Data.이름}
                                    onChange={e => setEditingDriver7Data(p => ({ ...p, 이름: e.target.value }))}
                                  />
                                  <input autoComplete="off"
                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-[13px] mb-2 focus:outline-none focus:border-[#1B2B4B]"
                                    placeholder="전화번호"
                                    value={editingDriver7Data.전화번호}
                                    onChange={e => setEditingDriver7Data(p => ({ ...p, 전화번호: formatPhone(e.target.value) }))}
                                  />
                                  <div className="flex gap-2">
                                    <button type="button" className="flex-1 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-xs font-bold"
                                      onClick={async () => {
                                        if (isViewer) { alert("조회전용 권한으로는 수정할 수 없습니다."); return; }
                                        if (!editingDriver7Data.이름.trim()) return;
                                        await updateDoc(doc(db, "drivers", d.id), { 이름: editingDriver7Data.이름, 전화번호: editingDriver7Data.전화번호 });
                                        setEditingDriver7Id(null);
                                      }}><EditableText id="misc.btn.47457.저장" defaultText="저장" /></button>
                                    <button type="button" className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs"
                                      onClick={() => setEditingDriver7Id(null)}><EditableText id="misc.btn.47459.취소" defaultText="취소" /></button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center hover:bg-gray-50">
                                  <button type="button" className="flex-1 text-left px-4 py-3"
                                    onClick={() => selectSmart7Driver(d)}>
                                    <div className="font-bold text-gray-900 text-[13px]">{d.이름 || "-"}</div>
                                    <div className="text-[11px] text-gray-500 mt-0.5">{d.차량번호} · {formatPhone(d.전화번호)}</div>
                                  </button>
                                  <button type="button" className="px-3 py-3 text-gray-500 hover:text-blue-500 text-xs"
                                    onClick={() => { setEditingDriver7Id(d.id || i); setEditingDriver7Data({ 이름: d.이름 || "", 전화번호: d.전화번호 || "" }); }}><EditableText id="misc.btn.47470.수정" defaultText="수정" /></button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CpField>

                  {/* 직접 입력 */}
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1.5">
                    <CpField label="차량번호">
                      <div className="flex gap-2">
                        <input autoComplete="off"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                          value={copyTarget?.차량번호 ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const plate = normalizePlate(v);
                            cpDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
                            // ⭐ 2026-11-05 같은 차량번호 기사가 여러 명이면 첫 번째로 채우고, 아래 "같은 차량번호 기사" 칩에서 바꿔 고른다
                            const match = (drivers || []).find(d => normalizePlate(d.차량번호) === plate);
                            if (match) {
                              const grade = match?.등급 || match?.grade || "";
                              if (grade === "블랙") setBlackDriverAlert(match);
                              else if (shouldShowDriverMemoAlert(match)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: match }));
                            }
                            setCopyTarget(prev => ({ ...prev, 차량번호: v, 이름: match?.이름 || "", 전화번호: formatPhone(match?.전화번호 || ""), 배차상태: match ? "배차완료" : "배차중" }));
                          }}
                        />
                        {copyTarget?.차량번호 && normalizePlate(copyTarget.차량번호).length >= 4 && !copyTarget?.이름 && (
                          <button type="button" onClick={() => { setNewDriverData({ 이름: "", 전화번호: "", 차량번호: copyTarget.차량번호 }); setNewDriverPopupOpen(true); }} className="px-3 py-2 bg-amber-500 text-white rounded-lg text-[13px] font-semibold whitespace-nowrap hover:bg-amber-600 transition"><EditableText id="misc.btn.47500.신규등록" defaultText="신규등록" /></button>
                        )}
                      </div>
                      {copyTarget?.차량번호 && normalizePlate(copyTarget.차량번호).length >= 4 && !copyTarget?.이름 && (
                        <div className="text-xs text-amber-600 mt-1">⚠ 등록되지 않은 차량입니다</div>
                      )}
                    </CpField>
                    {/* ⭐ 2026-11-05 매칭 기사 이름·전화 잠금 + [수정] */}
                    <DriverNamePhoneEdit variant="cp" target={copyTarget} setTarget={setCopyTarget} de={cpDrvEdit} drivers={drivers} />
                  </div>
                </div>
              </div>

              {/* 화물정보 */}
              <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-2">
                  <h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.화물정보" defaultText="화물정보" /></h3>
                </div>
                <div className="px-5 py-3">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1.5">
                    <CpField label="차량종류">
                      <VehicleTypePicker className={cpInputStyle} value={copyTarget?.차량종류 ?? ""} ton={copyTarget?.차량톤수 || ""} onTon={(v) => setCopyTarget((p) => ({ ...p, 차량톤수: v, 톤수값: (String(v).match(/[\d.]+/) || [""])[0], 톤수타입: "톤" }))} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} base={["라보/다마스", "카고", "윙/카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "리프트", "오토바이", "기타"]} placeholder="선택" noneLabel="선택" onChange={(__v) => ((e) => setCopyTarget(p => ({...p, 차량종류: e.target.value})))({ target: { value: __v } })} />
                    </CpField>
                    <CpField label="차량톤수">
                      <div className="flex items-center border rounded-lg overflow-hidden bg-white">
                        <input autoComplete="off" className="flex-1 min-w-0 w-0 px-3 py-2 text-[14.5px] font-bold outline-none" value={copyTarget?.톤수값 || ""} onChange={(e) => { const v = e.target.value; setCopyTarget(p => ({...p, 톤수값: v, 차량톤수: p.톤수타입 ? `${v}${p.톤수타입}` : v})); }} placeholder="1" disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                        <CustomSelect className="shrink-0 w-[78px] pl-3 pr-6 py-2 bg-[#1B2B4B] text-white text-[14px] font-bold outline-none cursor-pointer" value={copyTarget?.톤수타입 || ""} onChange={(e) => { const type = e.target.value; setCopyTarget(p => ({...p, 톤수타입: type, 차량톤수: type ? `${p.톤수값 || ""}${type}` : (p.톤수값 || "")})); }} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}>
                          <option value="">선택</option>
                          {tonTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
                        </CustomSelect>
                      </div>
                    </CpField>
                    <CpField label={<span className="flex items-center gap-1 flex-wrap">화물내용<button type="button" tabIndex={-1} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer" onClick={() => setCargoAddPopup({ initialValue: copyTarget?.화물내용||"", onCommit: (v) => setCopyTarget(p=>({...p,화물내용:v})) })}>+ 추가</button><CargoExtraChips value={copyTarget?.화물내용} /></span>}>
                      <div className="flex items-center border rounded-lg overflow-hidden bg-white">
                        <input autoComplete="off" className="flex-1 min-w-0 w-0 px-3 py-2 text-[14.5px] font-bold outline-none" value={copyTarget?.화물수량 || ""} onChange={(e) => { const v = e.target.value; setCopyTarget(p => ({...p, 화물수량: v, 화물내용: p.화물타입 ? `${v}${p.화물타입}` : v})); }} placeholder="1" disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")} />
                        <CustomSelect className="shrink-0 w-[96px] pl-3 pr-6 py-2 bg-[#1B2B4B] text-white text-[14px] font-bold outline-none cursor-pointer" value={copyTarget?.화물타입 || ""} onChange={(e) => { const type = e.target.value; setCopyTarget(p => ({...p, 화물타입: type, 화물내용: type ? `${p.화물수량 || ""}${type}` : (p.화물수량 || "")})); }} disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}>
                          <option value="">없음</option>
                          {[...new Set([...cargoTypeOptionsCustom, ...(copyTarget?.화물타입 ? [copyTarget.화물타입] : [])])].map(v => <option key={v} value={v}>{v}</option>)}
                        </CustomSelect>
                      </div>
                    </CpField>
                  </div>
                </div>
              </div>

              {/* 결제 정보 */}
              <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-2">
                  <h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.결제정보" defaultText="결제 정보" /></h3>
                </div>
                <div className="px-5 py-3">
                  <div className="grid grid-cols-3 gap-x-5 gap-y-1.5">
                    <CpField label="청구운임">
                      <input autoComplete="off" className={cpInputStyle} value={copyTarget.청구운임 ? Number(copyTarget.청구운임).toLocaleString() : ""} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setCopyTarget(p => fareOnU ? fareFormChange(p, "청구운임", v, fareRU.rules) : forkliftApply(p, {...p, 청구운임: v}, "청구운임")); }} />
                    </CpField>
                    <CpField label="기사운임">
                      <input autoComplete="off" className={cpInputStyle} value={copyTarget.기사운임 ? Number(copyTarget.기사운임).toLocaleString() : ""} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setCopyTarget(p => fareOnU ? fareFormChange(p, "기사운임", v, fareRU.rules) : forkliftApply(p, {...p, 기사운임: v}, "기사운임")); }} />
                    </CpField>
                    <CpField label="수수료">
                      <div className={`h-9 flex items-center justify-end bg-[#EEF2F8] border border-[#DCE4F0] rounded-lg px-2.5 font-black text-[15px] whitespace-nowrap tabular-nums ${(Number(copyTarget.청구운임 || 0) - Number(copyTarget.기사운임 || 0) - paidOut(copyTarget)) < 0 ? "text-red-600" : "text-[#1B2B4B]"}`}>
                        {(Number(copyTarget.청구운임 || 0) - Number(copyTarget.기사운임 || 0) - paidOut(copyTarget)).toLocaleString()} 원
                      </div>
                    </CpField>
                    <div className="col-span-full"><SpecialFareButton form={copyTarget} setForm={setCopyTarget} /></div>{/* 🏗 2026-11-09 지게차비용 */}
                    <div className="col-span-full flex justify-end"><OrderStaffFields order={copyTarget} setOrder={setCopyTarget} disabled={isViewerNow()} /></div>{/* 👤 2026-11-12 배차담당자 · 차량배정자 */}
                    <CpField label="지급방식">
                      <CompanyOptionPicker optKey="지급방식" placeholder="선택" noneLabel="선택" className={cpInputStyle} value={copyTarget?.지급방식 ?? ""} onChange={(__v) => ((e) => setCopyTarget(p => ({...p, 지급방식: e.target.value})))({ target: { value: __v } })} disabled={copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile"} />
                    </CpField>
                    {/* ⭐ 2026-11-02 운임규칙 — 운임구분(실시간·배차현황 패널과 같은 자리) */}
                    {fareOnU && (
                      <CpField label={<>운임구분<FareRuleHint className="ml-1" form={copyTarget} rules={fareRU.rules} onReapply={() => setCopyTarget(p => fareFormChange(p, "__reapply", null, fareRU.rules))} /></>}>
                        <div className="flex items-center gap-1.5"><FareTypeSelect pct={copyTarget?.운임구분수수료율} className="!h-9 !rounded-lg flex-1 min-w-0" rules={fareRU.rules} value={copyTarget?.운임구분 || ""} onChange={(v) => setCopyTarget(p => fareFormChange(p, "운임구분", v, fareRU.rules))} /><FarePctInput form={copyTarget} rules={fareRU.rules} onChange={(v) => setCopyTarget(p => fareFormChange(p, "운임구분수수료율", v, fareRU.rules))} /></div>
                      </CpField>
                    )}
                    <CpField label="배차방식">
                      <DispatchWayPicker scope={[copyTarget?.거래처명, copyTarget?.상차지명, copyTarget?.하차지명]} className={cpInputStyle} value={copyTarget?.배차방식 === "선택없음" ? "" : (copyTarget?.배차방식 ?? "")} dir={copyTarget?.콜구분 || ""} onPick={(pk) => setCopyTarget((p) => ({ ...p, ...pk }))} />
                    </CpField>
<RouteGroupField Field={CpField} className={cpInputStyle} row={copyTarget} onChange={(v) => setCopyTarget((p) => ({ ...p, 담당노선구분: v }))} />
                  </div>
                </div>
              </div>

              {/* 메모 · 전달사항 — ⭐ 2026-11-06 등록창(3파트)과 같은 카드형 */}
              <div className="bg-white rounded-xl border border-[#E3E8F0] overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-2">
                  <h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.메모" defaultText="메모" /> / 전달사항</h3>
                </div>
                <div className="px-5 py-3">
                  <CpMemoNoteCards target={copyTarget} setTarget={setCopyTarget} />
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : null;
  if (panelOnly) return (
    <>
      {toast && <div className={`fixed right-5 top-20 z-[100001] px-4 py-2 rounded-lg shadow-lg text-[13px] font-semibold ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{toast.msg}</div>}
      {copyPanelEl}
    </>
  );
  return (
    <div className="relative">
      {toast && (
        <div className={`fixed right-5 top-20 z-50 px-4 py-2 rounded-lg shadow-lg text-[13px] font-semibold ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
      <AssignConfirm target={assignAsk} busy={assignBusy} onCancel={() => setAssignAsk(null)} onOk={doAssign} />

      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[18px] font-bold text-[#1B2B4B]"><EditableText id="unassigned.title" defaultText="미배차현황" /></h2>
          <p className="text-[12px] text-gray-500 mt-0.5"><EditableText id="unassigned.subtitle" defaultText="배차 대기 중인 오더 목록이에요. 두 번 누르면 수정하거나 복사할 수 있어요" /></p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-[12px] text-gray-500">대기</span>
          <span className="text-[18px] font-bold text-red-600 ml-2">{filtered.length}</span>
          <span className="text-[12px] text-gray-500 ml-1">건</span>
        </div>
      </div>

      {/* 검색바 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="통합검색 (거래처명 / 상차지명 / 차량번호 등)"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] w-72 focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/10"
          />
          <div className="flex items-center gap-1">
            <CustomDatePicker className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="text-gray-500 text-[13px]">~</span>
            <CustomDatePicker className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <DetailFilterButton rows={unPending} value={unDetail} onApply={applyUnDetail} getters={unDetailGet} title="세부검색 · 미배차현황" size="md" />
          <div className="flex items-center gap-1">
            <CustomSelect value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]">
              <option value="거래처명">거래처명</option>
              <option value="차량종류">차량종류</option>
              {fareOnU && <option value="운임구분">운임구분</option>}{/* ⭐ 2026-11-06 */}
            </CustomSelect>
            <input autoComplete="off" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} placeholder={`${filterType} 검색`} className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] w-40 focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/10" />
          </div>
          <button onClick={() => { setQ(""); setStartDate(""); setEndDate(""); setFilterValue(""); }} className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition">
            초기화
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!deleteMode ? (
              <button onClick={() => setDeleteMode(true)} className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition">
                삭제
              </button>
            ) : (
              <>
                <span className="text-[12px] px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-semibold">선택 {selectedIds.size}건</span>
                <button onClick={() => { if (selectedIds.size === 0) { showToast("선택된 항목이 없습니다.", "err"); return; } setDeleteConfirmOpen(true); }} className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition"><EditableText id="misc.btn.46612.선택 삭제" defaultText="선택 삭제" /></button>
                <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 hover:bg-gray-50 transition"><EditableText id="misc.btn.46613.선택 해제" defaultText="선택 해제" /></button>
                <button onClick={exitDeleteMode} className="px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 hover:bg-gray-50 transition"><EditableText id="misc.btn.46614.취소" defaultText="취소" /></button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="kp-grid bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {deleteMode && (
                  <th className={headBase}>
                    <input autoComplete="off" type="checkbox" onChange={toggleAll} checked={selectedIds.size > 0 && selectedIds.size === filtered.length} />
                  </th>
                )}
                {headers.map((h) => (
                  <SortTh key={h} k={h === "경유" || h === "추천 기사" ? "" : h} sort={unSort.sort} onSort={unSort.toggle} className={headBase}><EditableText id={`generic.table.header.${h}`} defaultText={h} /></SortTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="text-center py-16 text-[13px] text-gray-500 font-medium" colSpan={headers.length + (deleteMode ? 1 : 0)}>
                    배차 대기 중인 오더가 없습니다
                  </td>
                </tr>
              ) : (
                sortedRows.map((r, i) => {
                  const isEarly = r.상차시간 && r.상차시간 >= "05:00" && r.상차시간 <= "09:00";
                  return (
                    <tr
                      key={r._id || i}
                      onDoubleClick={(e) => {
                        if (deleteMode) return;
                        if (e.target.closest("input")) return;
                        openUnEdit(r);
                      }}
                      onContextMenu={(e) => {
                        // 🖱 2026-11-16 오른쪽 클릭 — 수정(오더복사/수정 패널) · 삭제(삭제 확인 창)
                        if (deleteMode || isViewer) return;
                        e.preventDefault();
                        const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1;
                        setUnCtx({ x: e.clientX / _z, y: e.clientY / _z, row: r });
                      }}
                      className={`${isUrgentOrder(r) ? "bg-red-50 hover:bg-red-100" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} cursor-pointer hover:bg-blue-50/50 transition`}
                      style={urgentRowStyle(r, String(r.운행유형 || "").trim() === "왕복" ? { backgroundColor: "#e8f4fd", borderLeft: "4px solid #1B2B4B" } : {})}
                    >
                      {deleteMode && (
                        <td className={cellBase}>
                          <input autoComplete="off" type="checkbox" checked={selectedIds.has(r._id)} onChange={() => toggleOne(r._id)} />
                        </td>
                      )}
                      <td className={cellBase}>{i + 1}</td>
                      {!isViewer && <td className={cellBase}><DriverSuggestCell order={r} pick={pickDrivers} drivers={drivers} onAssign={(o, d) => setAssignAsk({ order: o, driver: d })} /></td>}
                      {unMgrMap && <td className={cellBase}><MgrBadge row={r} name={orderMgrName(unMgrMap, r)} empty={ORDER_MGR_EMPTY} /></td>}
                      <td className={cellBase}>{displayRegDate(r)}</td>
                      <td className={cellBase}>
                        {r.등록일 ? (() => {
                          const d = Math.floor((Date.now() - new Date(r.등록일).getTime()) / 86400000);
                          if (d <= 0) return <span className="text-gray-500 text-[12px]">오늘</span>;
                          if (d >= 3) return <span className="text-red-600 font-bold text-[12px]">{d}일</span>;
                          return <span className="text-amber-600 text-[12px]">{d}일</span>;
                        })() : ""}
                      </td>
                      <td className={`${cellBase} font-bold`}>{r.상차일 || ""}</td>
                      <td className={cellBase} style={isEarly ? { color: "red", fontWeight: 600 } : {}}>{r.상차시간 ? fmtDispatchTime(r.상차시간, r.상차시간기준 || r.상차시간구분) : ""}</td>
                      <td className={cellBase}>{r.하차일 || ""}</td>
                      <td className={cellBase}>{r.하차시간 ? fmtDispatchTime(r.하차시간, r.하차시간기준 || r.하차시간구분) : ""}</td>
                      <td className={`${cellBase} font-semibold text-gray-800`}>{/* ⭐ 2026-11-06 긴급 알약 */}{isUrgentOrder(r) ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><UrgentBadge row={r} />{r.거래처명 || ""}</span> : (r.거래처명 || "")}</td>
                      <td className={`${cellBase} font-medium`}>
                        <div className="inline-flex items-center gap-1 flex-nowrap whitespace-nowrap">
                          <span>{r.상차지명 || ""}</span>
                          {String(r.운행유형 || "").trim() === "왕복" && <RoundTripBadge />}<RotationBadge order={r} />
                        </div>
                      </td>
                      <td className={cellBase}>
                        {r.상차지주소 && r.상차지주소.length > 10 ? (
                          openLoadAddrs.has(r._id) ? (
                            <span>{r.상차지주소}{" "}<button onClick={() => setOpenLoadAddrs((prev) => { const next = new Set(prev); next.delete(r._id); return next; })} className="text-blue-500 underline text-xs"><EditableText id="misc.btn.46699.접기" defaultText="접기" /></button></span>
                          ) : (
                            <span>{r.상차지주소.slice(0, 10)}...<button onClick={() => setOpenLoadAddrs((prev) => new Set(prev).add(r._id))} className="text-blue-500 underline text-xs"><EditableText id="misc.btn.46701.더보기" defaultText="더보기" /></button></span>
                          )
                        ) : (r.상차지주소 || "")}
                      </td>
                      <td className={`${cellBase} font-medium`}>{r.하차지명 || ""}</td>
                      <td className={cellBase}>
                        {r.하차지주소 && r.하차지주소.length > 10 ? (
                          openUnloadAddrs.has(r._id) ? (
                            <span>{r.하차지주소}{" "}<button onClick={() => setOpenUnloadAddrs((prev) => { const next = new Set(prev); next.delete(r._id); return next; })} className="text-blue-500 underline text-xs"><EditableText id="misc.btn.46709.접기" defaultText="접기" /></button></span>
                          ) : (
                            <span>{r.하차지주소.slice(0, 10)}...<button onClick={() => setOpenUnloadAddrs((prev) => new Set(prev).add(r._id))} className="text-blue-500 underline text-xs"><EditableText id="misc.btn.46711.더보기" defaultText="더보기" /></button></span>
                          )
                        ) : (r.하차지주소 || "")}
                      </td>
                      <td className={cellBase}>{r.차량종류 || ""}</td>
                      <td className={cellBase}>{r.차량톤수 || ""}</td>
                      <td className={cellBase}>{r.화물내용 || ""}</td>
                      <td className={cellBase}>
                        {(() => {
                          const _sp = (v) => { if (Array.isArray(v)) return v; if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } } return []; };
                          const _dedup = (arr) => { const seen = new Set(); return arr.filter(s => { if (!s || (!s.업체명?.trim() && !s.주소?.trim())) return false; const k = s.업체명 || s.주소; if (seen.has(k)) return false; seen.add(k); return true; }); };
                          const pu = _dedup([..._sp(r.경유상차목록), ..._sp(r.경유지_상차), ..._sp(r.경유지상차)]);
                          const dr = _dedup([..._sp(r.경유하차목록), ..._sp(r.경유지_하차), ..._sp(r.경유지하차)]);
                          return (
                            <div className="flex flex-wrap gap-1">
                              {pu.length > 0 && <StopBadge count={pu.length} list={pu} type="pickup" orderDate={r.상차일 || ""} />}
                              {dr.length > 0 && <StopBadge count={dr.length} list={dr} type="drop" orderDate={r.하차일 || ""} />}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={cellBase}>
                        {r.화주사확인대기 ? (
                          <button
                            type="button"
                            title="클릭 시 배차중으로 전환"
                            className="px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap bg-sky-500 text-white hover:bg-sky-600 transition"
                            style={{ animation: "shipperReqBlink 1.4s ease-in-out infinite" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // patchDispatch 내부의 낙관적 업데이트는 startTransition(저우선순위)이라
                              // 클릭 즉시 반영되지 않고 지연되어 보였다 — dispatchData를 먼저
                              // 동기적으로(우선순위 높게) 갱신해 뱃지가 바로 바뀌게 한다.
                              setDispatchData(prev => prev.map(x => x._id === r._id ? { ...x, 화주사확인대기: false, 배차중전환일시: Date.now() } : x));
                              patchDispatch(r._id, { 화주사확인대기: false, 배차중전환일시: Date.now(), __col: r.__col });
                            }}
                          >
                            {isRecentShipperEdit(r) ? "수정" : "배차요청"}
                          </button>
                        ) : (
                          <StatusBadge s={r.배차상태} pending={r.수정요청 || r.취소요청} />
                        )}
                      </td>
                      <td className={`${cellBase} max-w-[260px] text-left`}>
                        {r.메모 && r.메모.length > 40 ? (
                          openMemos.has(r._id) ? (
                            <span className="whitespace-pre-wrap">{r.메모}{" "}<button onClick={() => setOpenMemos(prev => { const next = new Set(prev); next.delete(r._id); return next; })} className="text-blue-500 underline text-xs ml-1"><EditableText id="misc.btn.46757.접기" defaultText="접기" /></button></span>
                          ) : (
                            <span>{r.메모.slice(0, 40)}...<button onClick={() => setOpenMemos(prev => new Set(prev).add(r._id))} className="text-blue-500 underline text-xs ml-1"><EditableText id="misc.btn.46759.더보기" defaultText="더보기" /></button></span>
                          )
                        ) : (r.메모 || "")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 삭제 확인 팝업 */}
      {unCtx && createPortal(
        <div className="fixed z-[100000] min-w-[150px] rounded-xl border border-[#DCE3EE] bg-white py-1.5 shadow-[0_12px_32px_rgba(15,26,48,0.18)]"
          style={{ left: Math.min(unCtx.x, window.innerWidth - 170), top: Math.min(unCtx.y, window.innerHeight - 100) }}
          onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} data-kp="unassigned-ctx">
          <button type="button" className="w-full h-10 px-4 flex items-center gap-2.5 text-left text-[14px] font-bold text-[#0F1A30] hover:bg-[#F4F6FA]"
            onClick={() => { const r = unCtx.row; setUnCtx(null); openUnEdit(r); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>수정
          </button>
          <button type="button" className="w-full h-10 px-4 flex items-center gap-2.5 text-left text-[14px] font-bold text-[#C62F25] hover:bg-[#FDF1F0]"
            onClick={() => { const r = unCtx.row; setUnCtx(null); setSelectedIds(new Set([r._id])); setDeleteConfirmOpen(true); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>삭제
          </button>
        </div>, document.body)}
      {deleteConfirmOpen && (
        <KpDeleteConfirm rows={Array.from(selectedIds).map((id) => filtered.find((d) => d._id === id))} note="삭제된 오더는 복구되지 않습니다" onCancel={() => setDeleteConfirmOpen(false)} onConfirm={() => removeDocs(Array.from(selectedIds))} />
      )}

      {/* 기사 신규등록 팝업 */}
      {newDriverPopupOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-[400px]">
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white text-[16px] font-bold">신규 기사 등록</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">차량번호</label>
                <input autoComplete="off" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-100" value={newDriverData.차량번호} readOnly />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">기사명 *</label>
                <input autoComplete="off" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]" value={newDriverData.이름} onChange={(e) => setNewDriverData(p => ({...p, 이름: e.target.value}))} placeholder="기사명 입력" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">전화번호 *</label>
                <input autoComplete="off" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]" value={newDriverData.전화번호} onChange={(e) => setNewDriverData(p => ({...p, 전화번호: formatPhone(e.target.value)}))} placeholder="010-0000-0000" />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => { setNewDriverPopupOpen(false); setNewDriverData({ 이름: "", 전화번호: "", 차량번호: "" }); }} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.46864.취소" defaultText="취소" /></button>
              <button onClick={async () => {
                if (isViewer) { showToast("조회전용 권한으로는 등록할 수 없습니다.", "err"); return; }
                if (!newDriverData.이름.trim()) { showToast("기사명을 입력하세요.", "err"); return; }
                if (!newDriverData.전화번호.trim()) { showToast("전화번호를 입력하세요.", "err"); return; }
                try {
                  if (typeof upsertDriver === "function") {
                    await upsertDriver({ 차량번호: newDriverData.차량번호, 이름: newDriverData.이름, 전화번호: newDriverData.전화번호, createdAt: Date.now() });
                  } else if (typeof db !== "undefined" && db) {
                    await setDoc(doc(db, "drivers", crypto.randomUUID()), { 차량번호: newDriverData.차량번호, 이름: newDriverData.이름, 전화번호: newDriverData.전화번호, createdAt: Date.now() });
                  }
                  setCopyTarget(prev => ({ ...prev, 이름: newDriverData.이름, 전화번호: formatPhone(newDriverData.전화번호), 배차상태: "배차완료" }));
                  showToast("기사 등록 완료");
                  setNewDriverPopupOpen(false);
                  setNewDriverData({ 이름: "", 전화번호: "", 차량번호: "" });
                } catch (err) { console.error(err); showToast("등록 중 오류가 발생했습니다.", "err"); }
              }} className="flex-1 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"><EditableText id="misc.btn.46880.저장" defaultText="저장" /></button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 거래처 신규등록 팝업 ================= */}
      <NewClientModal open={newClientModalOpen} data={newClientModalData} setData={setNewClientModalData} onClose={() => setNewClientModalOpen(false)} upsertClient={upsertClient} showAlert={(m) => alert(m)} formatPhone={formatPhone} zClass="z-[9999999]" />

      {/* 블랙 기사 경고 팝업 */}
      {notificationsEnabled && blackDriverAlert && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999]" tabIndex={-1} ref={(el) => el && setTimeout(() => el.focus(), 0)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setBlackDriverAlert(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden">
            <div className="bg-gray-900 px-6 py-4 flex items-center gap-3">
              <span className="text-2xl">⊘</span>
              <h3 className="text-white text-lg font-bold">블랙 기사 알림</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm space-y-1">
                <div><span className="text-gray-500">차량번호</span><b className="ml-2">{blackDriverAlert.차량번호}</b></div>
                <div><span className="text-gray-500">이름</span><b className="ml-2 text-red-600">{blackDriverAlert.이름 || "-"}</b></div>
                <div><span className="text-gray-500">전화번호</span><b className="ml-2">{blackDriverAlert.전화번호 || "-"}</b></div>
                {blackDriverAlert.메모 && <div><span className="text-gray-500">메모</span><span className="ml-2 text-red-600">{blackDriverAlert.메모}</span></div>}
              </div>
              <p className="text-sm text-gray-600 text-center font-semibold">해당 기사는 <span className="text-red-600 font-bold">블랙 등급</span>으로 등록된 기사입니다.</p>
            </div>
            <div className="px-6 pb-5">
              <button className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm" onClick={() => setBlackDriverAlert(null)}>확인 (Enter)</button>
            </div>
          </div>
        </div>
      )}

      {/* 블랙/주의 업체 경고 팝업 */}
      {notificationsEnabled && warningPopup && (
  <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50" tabIndex={-1} ref={warningPopupRef} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setWarningPopup(null); } }}>
    <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden">
      <div className={`px-6 py-4 flex items-center gap-3 ${warningPopup.status === "블랙" ? "bg-gray-900" : warningPopup.status === "주의" ? "bg-orange-500" : "bg-red-600"}`}>
        <span className="text-2xl">{warningPopup.status === "블랙" ? "⊘" : warningPopup.status === "주의" ? "⚠" : "⊘"}</span>
        <h3 className="text-white text-lg font-bold">{warningPopup.status || "메모"} 거래처 알림</h3>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className={`border rounded-lg px-4 py-3 text-sm space-y-1 ${warningPopup.status === "블랙" ? "bg-red-50 border-red-200" : warningPopup.status === "주의" ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200"}`}>
          <div><span className="text-gray-500">거래처명</span><b className="ml-2">{warningPopup.name}</b></div>
          <div className="flex items-center">
            <span className="text-gray-500">등급</span>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold text-white ${warningPopup.status === "블랙" ? "bg-gray-900" : warningPopup.status === "주의" ? "bg-orange-500" : "bg-red-600"}`}>{warningPopup.status}</span>
          </div>
          {warningPopup.info?.지정일 && (
            <div><span className="text-gray-500">지정일</span><span className="ml-2">{warningPopup.info.지정일}</span></div>
          )}
          {warningPopup.info?.주소 && (
            <div><span className="text-gray-500">주소</span><span className="ml-2">{warningPopup.info.주소}</span></div>
          )}
          {warningPopup.info?.메모 && (
            <div><span className="text-gray-500">메모</span><span className={`ml-2 ${warningPopup.status === "블랙" ? "text-red-600" : warningPopup.status === "주의" ? "text-orange-500" : "text-red-600"}`}>{warningPopup.info.메모}</span></div>
          )}
        </div>
        <p className="text-sm text-gray-600 text-center font-semibold">해당 거래처는{" "}<span className={`font-bold ${warningPopup.status === "블랙" ? "text-red-600" : warningPopup.status === "주의" ? "text-orange-500" : "text-red-600"}`}>{warningPopup.status} 등급</span>으로 지정된 거래처입니다.</p>
      </div>
      <div className="px-6 pb-5">
        <button className={`w-full py-3 text-white rounded-xl font-bold text-sm ${warningPopup.status === "블랙" ? "bg-gray-900" : warningPopup.status === "주의" ? "bg-orange-500" : "bg-red-600"}`} onClick={() => setWarningPopup(null)}>확인 (Enter)</button>
      </div>
    </div>
  </div>
)}

      {copyPanelWorkDatesOpen && (
        <WorkDatesEditModal
          row={copyTarget}
          companyName={localStorage.getItem("userCompany") || localStorage.getItem("loginCompany") || ""}
          onClose={() => setCopyPanelWorkDatesOpen(false)}
          onSave={async (patch) => {
            setCopyTarget(p => ({ ...p, ...patch }));
            setCopyPanelWorkDatesOpen(false);
          }}
        />
      )}
      {/* 오더 복사/수정 패널 */}
      {copyPanelEl}
    </div>
  );
}
