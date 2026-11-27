// ======================= src/dispatch/RealtimeStatus.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { MonthPicker } from "../kpInputs"; // 🗓 2026-11-27 마감월 — 프로그램 달력
import { isViewerNow } from "../blind";
import { kpConfirm, kpPrompt } from "../kpDialog";
import { editLossReason, lossReasonOf } from "../lossReason";
import { buildDriverCopyText } from "../driverCopyText";
import { openCopyTemplateEditor } from "../CopyTemplateEditor";
import { imeFocusRef } from "../imeFocus";
import { mgrName } from "../mgrPlaceholder";
import React, { useState, useRef, useEffect } from "react";
import { VehicleTypePicker, withCustomVehicleTypes } from "../vehicleTypes";
import { getTenant, withCo } from "../fsTenant";
import { createPortal } from "react-dom";
import { sendText } from "../smsSend";
import { useDriverEditChoice } from "../DriverEditChoice";
import { saveWorkbook, kstFileDate } from "../xlsxSave";
import OrderLookupModal from "../OrderLookup";
import MgrBadge from "../MgrBadge";
import { isUrgentOrder, urgentRowStyle, UrgentBadge } from "../urgentOrder";
import BulkEditCopyModal from "../BulkEditCopy";
import { placeSearch } from "../placeSearch";
import { buildSimpleList } from "../copySimple";
import { getSimpleTpl } from "../copyTemplates";
import OrderStaffFields from "../OrderStaffFields";
import { payTypeStatusPatch } from "../dispatchStatus";
import { makeClientMatcher } from "../clientMatch";
import DetailFilterButton, { applyDetailFilter } from "../DetailFilter";
import { bizStripeProps, useCompanyBiz, BizLegend, bizOf, bizColorOf, BizSelect, rememberBiz } from "../companyBiz";
import CustomDatePicker from "../CustomDatePicker";
import { FixedRouteEditNotice } from "../FixedRoutes";
import { DriverAckChip } from "../driverEvents";
import { EditableText } from "../EditMode";
import { copyAccountSettleImage, copyBizImage, openDailyWorkReport, NewClientModal, PlaceConflictPopup, FareNoHistoryConfirm, AddrFareSearchModal, FareResultModal, SamePlateConflictPopup, CtxFareResultModal, ImageCopyButtons } from "../sharedDispatchUi";
import { useCompanyDropdownOptions } from "../companyDropdownOptions";
import { CompanyOptionPicker } from "../companyOptionPicker";
import { isNotificationsEnabled, useNotificationsEnabled } from "../notificationSettings";
import { CustomSelect } from "../CustomSelect";
import { LiveDriverChip, useFleetLivePublish, FleetLiveButton } from "../liveFleet";
import { useLoadFullOrderHistory } from "../orderHistory";
import { RotationBadge, withRotationMemo, RotationPicker } from "../rotation";
import { serverTimestamp, onSnapshot, collection, query, where, doc } from "firebase/firestore";
import { updateDoc } from "../orderWrite";
import { db, auth } from "../firebase";
import { OrderTimeline } from "../OrderTimeline";
import { ORDER_MGR_EMPTY, useDetailGetters, orderStaffNameRaw as _orderStaffNameRaw } from "../detailGetters";
import { CloseReportModal } from "../AutomationPanels";
import { FareTypeSelect, FareRuleHint, useFareRules, fareFormChange, FarePctInput } from "../fareRules";
import { paidOut, ForkliftMark, fkNum, profitTotals, orderProfit, forkliftApply, SpecialFareButton } from "../forklift";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { CellNote } from "../cellNote";
import { RouteGroupField } from "../routeGroups";
import { profitCls, MarginPct } from "../marginPct";
import { PlateSuggestCaret, useDriverSuggest, PlateSuggestCtx, AssignConfirm } from "../SmartDispatchUI";
import { DispatchWayPicker } from "../CallPay";
import { AddressCell, AttachStatusPanel, AttachmentViewer, BulkDateShiftModal, BulkEditModal, CargoExtraChips, ContactPickerIconButton, CopyPanelExtras, CpField, CpMemoNoteCards, CustomAlert, DriverNamePhoneEdit, FareCertModal, FareSortDropdown, HoverInfoTrigger, IGNORE_HISTORY_FIELDS, KpDeleteConfirm, KpSelectModeBar, LiveLocationPopup, MemoIconCell, NewDriverModal, NoteIconCell, OptimalMatchModal, OrderInfoModal, OrderMemoIconButton, OrderMemoModal, PalletSlipModal, REVERSED_DATE_ORDER_MSG, RoundTripBadge, SHEET_DIFF_STYLE, ScheduleChartModal, StickyHScrollbar, StopEditModal, TimeAmPmPicker, TimeBasisToggle, VEHICLE_TYPES, WaypointSection, WaypointViewModal, WorkDatesEditModal, _fmtKst, _hasRealDriverNotice, _lunchNameKey, _parseWorkDates, acknowledgeShipperEditPC, approveCancelRequestPC, buildLunchByName, copyPanelDiff, cpInputStyle, defaultDriverNoticeTemplate, displayRegDate, dokchaOn, dropFollowsPickup, fetchCompanyPrintInfo, fetchPrinterInfo, fmtDispatchTime, getEditRequestDiff, getRecentHistoryDiff, getRouteStops, getTotalPalletFromOrder, getTotalTonFromOrder, isRecentShipperEdit, isReversedDateOrder, issueUploadUrl, loadXLSX, makeOrderSortValue, makePlaceKey, mergeViaCargoText, mergeViaTonnage, nameKeyOf, nextManagerName, orderMgrName, rejectCancelRequestPC, sflowToast, sheetWayDiff, sheetWayTitle, shouldShowDriverMemoAlert, sortFareHistory, stripNoneVal, submitCopyOrderPC, submitCopyOrdersPC, toTonUnit, uniqueContactsOf, upsertPlace, useCopyPanelOrig, useKpLongPressSelect, useOrderStaffName, withPickupDate } from "./shared/dispatchCommon.jsx";

// 정렬용 값 꺼내기 — 배차담당자 칸은 위에서, 나머지는 orderSortValue

// ⚡ 큰 표를 나눠 그리기 — 표 아래에 닿으면(또는 버튼을 누르면) 다음 묶음을 붙인다
const RT_ROW_STEP = 150;
function KpMoreRows({ shown, total, onMore }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    // 📌 2026-11-17 표 머리줄 고정으로 바로 위 표 상자가 화면 높이로 묶이면(data-kp-st-wrap) 이 버튼이 늘 화면 안이라
    //   다음 묶음이 끝없이 붙는다 — 그땐 상자 안 스크롤이 끝(600px 안쪽)에 닿았을 때만 더 붙인다
    const box = () => { const w = el.previousElementSibling; return w && w.hasAttribute("data-kp-st-wrap") ? w : null; };
    const nearEnd = () => { const w = box(); return !w || w.scrollHeight - w.scrollTop - w.clientHeight < 600; };
    let fired = false; const more = () => { if (fired) return; fired = true; onMore(); }; // 한 묶음에 한 번만(다음 묶음이 그려지면 다시)
    const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting) && nearEnd()) more(); }, { rootMargin: "600px 0px" });
    io.observe(el);
    const onBoxScroll = (e) => { const w = box(); if (w && e.target === w && nearEnd()) more(); };
    document.addEventListener("scroll", onBoxScroll, { capture: true, passive: true });
    return () => { io.disconnect(); document.removeEventListener("scroll", onBoxScroll, { capture: true }); };
  }, [onMore, shown]);
  return (
    <button ref={ref} type="button" onClick={onMore}
      className="mt-2 w-full h-11 rounded-xl border border-[#E3E8F0] bg-white text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] transition">
      더 보기 <span className="tabular-nums text-[#5B6B85] font-bold">({shown.toLocaleString()} / {total.toLocaleString()}건)</span>
    </button>
  );
}

// ⭐ 오더 검색창 "통합 ▾" 검색 항목 — 배차현황·실시간배차현황 공용(값 → 오더 필드). all = 통합
const ORDER_SEARCH_FIELD = { client: "거래처명", pickup: "상차지명", drop: "하차지명", car: "차량번호", driver: "이름", pay: "지급방식", dispatch: "배차방식", fare: "운임구분" }; // ⭐ 2026-11-06 운임구분

// 모듈 레벨 dismiss Set: 컴포넌트 재마운트 후에도 세션 동안 유지
const _urgentDismissed = new Set();
function StopInlineBadge({ count = 0, list = [], type = "pickup", onEdit, editable = false, placeRows = [], timeOptions = [], orderDate = "", confirmEdit = false }) {
  const [open, setOpen] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (!count) return null;
  const isPickup = type === "pickup";
  const label = isPickup ? "상차경유지" : "하차경유지";

  const buildCopyText = () => {
    return list.map((s, i) => {
      const lines = [`${i + 1}. ${label} : ${s.업체명 || "-"}`];
      if (s.주소) lines.push(`주소 : ${s.주소}`);
      if (s.담당자 || s.담당자번호) {
        let t = "담당자 : " + (s.담당자 || "");
        if (s.담당자번호) t += ` (${s.담당자번호})`;
        lines.push(t);
      }
      if (s.상차시간) lines.push(`상차시간 : ${s.상차시간}`);
      if (s.하차시간) lines.push(`하차시간 : ${s.하차시간}`);
      const cargo = (() => {
        const raw = stripNoneVal(s.화물내용);
        const hasSfx = /파레트|파렛트|박스|통/.test(raw);
        if (hasSfx) return /\d/.test(raw) ? raw : "";
        const qty = raw || s.화물수량 || "";
        const tp = s.화물타입 || "";
        if (!qty || qty === "없음") return "";
        return tp && tp !== "없음" ? `${qty}${tp}` : qty;
      })();
      if (cargo) lines.push(`화물내용 : ${cargo}`);
      const ton = (() => {
        const raw = stripNoneVal(s.차량톤수);
        if (/톤|kg/.test(raw)) return toTonUnit(raw);
        const val = s.톤수값 || raw || "";
        const tp = s.톤수타입 || "";
        if (!val) return "";
        return toTonUnit(tp && tp !== "없음" ? `${val}${tp}` : val);
      })();
      if (ton) lines.push(`화물톤수 : ${ton}`);
      if (s.메모) lines.push(`메모 : ${s.메모}`);
      return lines.join("\n");
    }).join("\n\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* fallback */ }
  };

  return (
    <>
      {/* ── 경유+N 버튼 ── */}
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded
          bg-[#1B2B4B] text-white
          hover:bg-[#243d6a] cursor-pointer whitespace-nowrap">
        경유+{count}
      </button>

      {/* ── 조회 팝업 ── */}
      {open && <WaypointViewModal list={list} type={type} orderDate={orderDate} onClose={() => setOpen(false)} onCopy={handleCopy} copied={copied}
        onEdit={(editable || onEdit) ? () => { setOpen(false); setEditModalOpen(true); } : null} />}

      {/* 수정 팝업 (3파트와 동일) */}
      <StopEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={newList => { if (onEdit) onEdit(newList); setEditModalOpen(false); }}
        confirmEdit={confirmEdit}
        list={list}
        type={type}
        placeRows={placeRows}
        timeOptions={timeOptions}
        orderDate={orderDate}
      />
    </>
  );
}
// ===================== /WaypointSection =====================

function DeliveryStatusBadge({ row, onConfirm }) {
  const status = row.업체전달상태 || "미전달";
  const isOn = status === "전달완료";

  return (
    <button
      type="button"
      onClick={() => onConfirm({
        rowId: row._id,
        before: status,
        after: isOn ? "미전달" : "전달완료",
      })}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${isOn ? "bg-[#6272C3]" : "bg-gray-300"}`}
      title={isOn ? "전달완료 → 클릭 시 미전달" : "미전달 → 클릭 시 전달완료"}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isOn ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

// 실시간배차현황 표의 행(1건) — React.memo로 감싸, 이 오더와 관련 없는 다른 오더가
// 바뀌어도(배차완료/저장 등) 이 행은 다시 렌더링되지 않도록 한다. 배차 건수가 많을 때
// 오더 하나만 바뀌어도 표 전체(수십~수백 행)가 매번 다시 그려지며 생기던 렉의 원인이었다.
// 비교 함수(realtimeRowPropsEqual)에 없는 prop(콜백 함수들)은 매 렌더마다 새로 만들어지지만,
// 그 값 자체가 outer state(예: r._id 자체, edited 등)에 의존하지 않는 "그 행 전용" 클로저라
// 이 행이 실제로 다시 렌더링될 때 항상 최신 값으로 갱신되므로 안전하다.
function RealtimeRowBase({
  r, idx, mgrName = null, bizTag = null, bizMain = false, bizColor = null,
  isSelected, isFading, isHighlighted, isDark, selectedEditMode,
  editedForRow,
  toInt, formatComma, formatPhone, getCreatedMs, getUpdatedMs, getDispatchConfirmedMs, formatKstDateTime, getCreatorLabel,
  editableInput, renderAddrCell, renderCargoCell, canEdit, handleEditChange,
  dispatchData, placeRows, timeOptions, patchDispatch, lunchByName, isFirstPickupLunch, isFirstDropLunch,
  setRows, setContextMenu, setCopyTarget, setCopyPanelOpen, toggleSelect, handleCarInput,
  driverConfirmOpen, memoAlert, blackAlert,
  setCancelReqPopup, markEditRequestSeen, setEditReqPopup, setConfirmChange,
  flashRow, setAttachViewer, setLiveLocViewer, setDeliveryConfirm, setWorkDatesEditRow,
  fareRules = null, // ⭐ 2026-11-02 운임규칙 — 규칙 사용 회사만 배열(아니면 null → 예전 그대로)
}) {
  const sale = toInt(editedForRow?.청구운임 ?? r.청구운임);
  const drv = toInt(editedForRow?.기사운임 ?? r.기사운임);
  const fee = sale - drv - paidOut(r); // 🏗 2026-11-09 지게차비용(수익 = 청구 − 기사 − 지게차)

  const cell = isDark
    ? "px-2 py-1.5 text-[14px] font-medium text-gray-100 align-middle text-center whitespace-nowrap border-b border-gray-700"
    : "px-2 py-1.5 text-[14px] font-medium text-gray-900 align-middle text-center whitespace-nowrap border-b border-gray-200";

  // 오더목록에서 특히 중요한 값(상/하차일시·화물내용·차량종류·톤수)은 다른 칸(font-medium)보다
  // 뚜렷하게 굵은 글씨로만 표시한다 — 배경색은 넣지 않는다(요청에 따라 배경 칩 제거).
  const emph = isDark ? "font-extrabold text-blue-300" : "font-extrabold text-[#1B2B4B]";

  // ⚠️ 여기 overflow-hidden/text-ellipsis/max-width를 다시 넣지 말 것 — renderAddrCell이
  // 이미 글자수(14자) 기준으로 직접 자르고 "더보기" 버튼을 붙여주는데, 이 td에 CSS
  // 말줄임까지 겹치면 "주소(14자)+더보기 버튼"의 실제 폭이 CSS max-width를 넘는
  // 행에서는 버튼째로 잘려나가 "..."만 남는 버그가 있었다(더보기 버튼이 안 보임).
  const addrCell = isDark
    ? "px-2 py-1.5 text-[14px] font-medium text-gray-100 align-middle text-center whitespace-nowrap border-b border-gray-700"
    : "px-2 py-1.5 text-[14px] font-medium text-gray-900 align-middle text-center whitespace-nowrap border-b border-gray-200";

  return (
  <tr
    key={r._id || r.id || `idx-${idx}`}
    id={`row-${r._id}`}
    onContextMenu={(e) => { e.preventDefault(); const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1; setContextMenu({ x: e.clientX / _z, y: e.clientY / _z, row: r }); }}

onDoubleClick={(e) => {
  if (e.target.closest("input")) return;

  const latest = dispatchData.find(d => d._id === r._id);

  const rawCargo = String(latest?.화물내용 || "");

  // ✅ suffix 기반 분리만 수행 (base만 파싱)
  const KNOWN_SUFFIXES = ["파레트","파렛트","박스","통"];
  let cargoQty = "", cargoType = "";
  const rawCargoBase = rawCargo.split("+")[0];
  for (const s of KNOWN_SUFFIXES) {
    if (rawCargoBase.endsWith(s)) {
      cargoQty = rawCargoBase.slice(0, -s.length).trim();
      cargoType = s;
      break;
    }
  }
  // ✅ suffix 매칭 안 되면 → base를 화물수량에 보존
  if (!cargoType) {
    cargoQty = rawCargoBase;
    cargoType = "";
  }

  const rawTon = String(latest?.차량톤수 || "");
  const tonMatch = rawTon.match(/([\d.]+)(.*)/);

  setCopyTarget({
    ...latest,
    화물내용: rawCargo,     // ✓ 원본 보존
    화물수량: cargoQty,     // ✓ "케이스" → "케이스" (기존: "")
    화물타입: cargoType,    // ✓ ""
    톤수값: tonMatch ? tonMatch[1] : "",
    톤수타입: tonMatch ? tonMatch[2] : "",
  });

  setCopyPanelOpen(true);
}}


    className={`
cursor-pointer select-none transition-[background-color,border-color,opacity] duration-300
${isFading ? "opacity-0" : "opacity-100"}
${
  /* ⭐ 2026-11-06 긴급 오더는 상태와 상관없이 빨간 막대·바탕(선택 중이면 선택색) */
  isUrgentOrder(r) && !isSelected
    ? isDark
      ? "bg-red-900/30 border-l-2 border-l-red-500 hover:bg-red-900/50"
      : "bg-red-50 border-l-2 border-l-red-400 hover:bg-red-100"
    : isSelected
    ? isDark ? "bg-blue-900/40" : "bg-blue-50"
    : isDark ? "bg-gray-900 hover:bg-gray-700" : "bg-white hover:bg-blue-50/60"
}
${isHighlighted ? "animate-pulse bg-blue-100" : ""}
`}
    style={urgentRowStyle(r, String(r.운행유형 || "").trim() === "왕복" ? { backgroundColor: "#e8f4fd", borderLeft: "4px solid #1B2B4B" } : {}, { tint: !isSelected })}
  >

                  <td className={cell}>
                    <input autoComplete="off"
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(r._id)}
                    />
                  </td>

                  {/* ⚡ 순번은 CSS 카운터로(.kp-rt-body) — 정렬로 줄 순서가 바뀌어도 줄 전체를 다시 그리지 않게 */}
                  <td className={`${cell} kp-rt-no`} {...bizStripeProps(bizMain ? null : bizColor, bizTag)} />
                  {mgrName != null && (
                    <td className={cell}><MgrBadge row={r} name={mgrName} empty={ORDER_MGR_EMPTY} /></td>
                  )}
  <td className={`${cell} overflow-visible`}>
  <HoverInfoTrigger
    className="underline decoration-dotted underline-offset-2 cursor-default"
    label={displayRegDate(r) || "-"}
    tooltipRows={<>
      <div>등록시간: <span className="text-yellow-300">{formatKstDateTime(getCreatedMs(r))}</span></div>
      <div>마지막수정: <span className="text-green-300">{formatKstDateTime(getUpdatedMs(r))}</span></div>
      <div>배차한시간: <span className="text-purple-300">{r.배차확정일시 ? formatKstDateTime(getDispatchConfirmedMs(r)) : "-"}</span></div>
      {r.배차확정자 && <div>배차한사람: <span className="text-purple-300">{r.배차확정자}</span></div>}
      <div>등록자: <span className="text-blue-300">{getCreatorLabel(r)}</span></div>
      <div>등록기기: <span className="text-orange-300">{r.등록기기 || "-"}</span></div>
    </>}
  />
</td>

                  <td className={cell}>
  <span className="inline-flex items-center gap-1">
    {(() => {
      const rWorkDates = _parseWorkDates(r.근무일자목록);
      const isMultiWork = rWorkDates.length > 1;
      return (
        <>
          {editableInput("상차일", r.상차일, r._id, isMultiWork)}
          {/* ⭐ 복수근무일(묶음) 오더 — 연속 기간이 아니라 특정 날짜들만 골라 1개의
              오더로 등록된 경우, 상차일 칸을 빨간 글씨 + 검은 뱃지로 표시. */}
          {isMultiWork && (
            <span
              className="bg-black text-white text-[10px] font-extrabold rounded px-1 py-0.5 leading-none shrink-0"
              title={`묶음 오더 · 근무일 ${rWorkDates.length}일: ${rWorkDates.map(d => d.slice(5).replace("-", "/")).join(", ")}\n(우클릭 → 오더정보에서 전체 확인)`}
            >
              묶음 {rWorkDates.length}일
            </span>
          )}
        </>
      );
    })()}
  </span>
</td>
                  <td className={cell}>
  <span className={emph}>
    {r.상차시간
      ? fmtDispatchTime(r.상차시간, r.상차시간기준 || r.상차시간구분)
      : "즉시"}
  </span>
</td>

                  <td className={cell}>{editableInput("하차일", r.하차일, r._id)}</td>
                 <td className={cell}>
  <span className={emph}>
    {r.하차시간
      ? fmtDispatchTime(r.하차시간, r.하차시간기준 || r.하차시간구분)
      : "즉시"}
  </span>
</td>

                  <td className={cell}>{/* ⭐ 2026-11-06 긴급 알약 · 2026-11-09 사업자 뱃지는 순번 칸 색 막대로 */}{isUrgentOrder(r) ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><UrgentBadge row={r} />{editableInput("거래처명", r.거래처명, r._id)}</span> : editableInput("거래처명", r.거래처명, r._id)}</td>
                  <td className={cell}>
  <div className="inline-flex items-center gap-1 flex-nowrap whitespace-nowrap">
    <AddressCell text={r.상차지명} max={8} popupTitle="상차지명 전체보기" />
    {String(r.운행유형 || "").trim() === "왕복" && <RoundTripBadge />}<RotationBadge order={r} />

{r.__pickupStops?.length > 0 && (
  <StopInlineBadge count={r.__pickupStops.length} list={r.__pickupStops} type="pickup" confirmEdit
    placeRows={placeRows} timeOptions={timeOptions} orderDate={r.상차일 || ""}
    onEdit={newList => patchDispatch(r._id, { 경유상차목록: newList, 경유지_상차: newList, 경유지상차: newList })}
  />
)}

  </div>
</td>

                  <td className={addrCell}>
                    {renderAddrCell("상차지주소", r.상차지주소, r._id)}
                  </td>

                                  <td className={cell}>
  <div className="inline-flex items-center gap-1 flex-nowrap whitespace-nowrap">
    <AddressCell text={r.하차지명} max={8} popupTitle="하차지명 전체보기" />

{r.__dropStops?.length > 0 && (
  <StopInlineBadge count={r.__dropStops.length} list={r.__dropStops} type="drop" confirmEdit
    placeRows={placeRows} timeOptions={timeOptions} orderDate={r.하차일 || ""}
    onEdit={newList => patchDispatch(r._id, { 경유하차목록: newList, 경유지_하차: newList, 경유지하차: newList })}
  />
)}

  </div>
</td>

                  <td className={addrCell}>
                    {renderAddrCell("하차지주소", r.하차지주소, r._id)}
                  </td>

                  <td className={cell}>{canEdit("화물내용", r._id) ? editableInput("화물내용", r.화물내용, r._id) : renderCargoCell(mergeViaCargoText(r.화물내용, [r.__pickupStops, r.__dropStops]) || r.화물내용 || "")}</td>
                  <td className={cell}>
                    {editableInput(
                      "차량종류",
                      editedForRow?.차량종류 ?? r.차량종류,
                      r._id
                    )}
                  </td>
                  <td className={cell}>{canEdit("차량톤수", r._id) ? editableInput("차량톤수", r.차량톤수, r._id) : <span className={emph}>{mergeViaTonnage(r.차량톤수, [r.__pickupStops, r.__dropStops]) || r.차량톤수 || ""}</span>}</td>
                  <td className={`${cell} text-center`}>
                    {r.혼적 ? "Y" : ""}
                  </td>


                  {/* 차량번호 */}
                  <td className={`${cell} relative`}>
                    {/* 🛠 2026-11-26 LIVE 점은 기사명 칸으로 옮김(차량번호 칸이 넓어진다는 의견) */}
                    {/* 🛠 2026-11-23 추천 기사 ▾ 를 차량번호 칸 "안" 오른쪽 끝에(글자와 겹치지 않게 칸을 조금 넓힘) — 테두리는 바깥 상자가 그린다 */}
                    <div className="flex items-center border rounded bg-white w-[150px] min-w-[130px] pr-0.5 focus-within:border-[#1B2B4B] focus-within:ring-1 focus-within:ring-[#1B2B4B]/30">
                    <input autoComplete="off"
                      name="차량번호"
                      data-id={r._id}
                      type="text"
                      value={r.차량번호 || ""}
                      className="flex-1 min-w-0 !border-0 !shadow-none bg-transparent p-0.5 text-[14px] font-medium focus:outline-none"
                      onChange={(e) => {
  const v = e.target.value;
  const isEmpty = v.trim() === "";
  setRows(prev =>
    prev.map(row =>
      row._id === r._id
        ? {
          ...row,
          차량번호: v,
          이름: isEmpty ? "" : row.이름,
          전화번호: isEmpty ? "" : row.전화번호,
          배차상태: isEmpty ? "배차중" : row.배차상태,
        }
        : row
    )
  );
}}
                      onFocus={(e) => { e.currentTarget.dataset.origVal = e.currentTarget.value; }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCarInput(r._id, e.currentTarget.value, e);
                      }}
                      onBlur={(e) => {
                        // 팝업 열려있으면 blur로 재트리거 방지
                        if (driverConfirmOpen || memoAlert || blackAlert) return;
                        // 값이 변경되지 않았으면 스킵
                        if (e.currentTarget.value === (e.currentTarget.dataset.origVal ?? "")) return;
                        handleCarInput(r._id, e.currentTarget.value);
                      }}
                    />
                    <PlateSuggestCaret order={r} />{/* 🚚 추천 기사 ▾ — 있을 때만 · 직접 입력은 그대로 */}
                    </div>
                    {/* ⭐ 2026-11-05 배차완료 지입·직영·임대 기사 — 기사앱 실시간 위치(LIVE) */}


                  </td>

                  <td className={`${cell} w-[80px] max-w-[80px] overflow-hidden`}>
                    {/* 🛠 2026-11-26 위치 관제 점 — 이름 바로 뒤(이름이 길면 이름만 줄이고 점은 항상 보임) */}
                    <span className="inline-flex items-center max-w-full align-middle"><span className="truncate">{r.이름}</span>{r.배차상태 === "배차완료" && <LiveDriverChip order={r} variant="dot" />}</span>
                  </td>

                  <td className={cell}>{formatPhone(r.전화번호)}</td>

                 <td className={cell}>
                  <div className="relative inline-block">
                    {r.화주사확인대기 ? (
                      <button
                        type="button"
                        title="클릭 시 배차중으로 전환"
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap bg-sky-500 text-white hover:bg-sky-600 transition"
                        style={{ animation: "shipperReqBlink 1.4s ease-in-out infinite" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // ✅ 2026-11-23 한 번 묻기
                          // rows는 dispatchData 변경 → useEffect → startTransition 을 거쳐야 반영되는
                          // 별도 로컬 상태라, patchDispatch의 낙관적 업데이트만으로는 뱃지가 즉시
                          // 바뀌지 않고 그 체인이 다 끝날 때까지 지연되어 보였다 — 여기서 직접
                          // rows를 갱신해 클릭 즉시 배지가 바뀌도록 한다.
                          setRows(prev => prev.map(x => x._id === r._id ? { ...x, 화주사확인대기: false, 배차중전환일시: Date.now() } : x));
                          patchDispatch(r._id, { 화주사확인대기: false, 배차중전환일시: Date.now(), __col: r.__col });
                        }}
                      >
                        {isRecentShipperEdit(r) ? "수정" : "배차요청"}
                      </button>
                    ) : r.취소요청 && r.배차상태 !== "배차취소" ? (
                      <button
                        type="button"
                        title="화주사가 배차 취소를 요청했어요. 눌러서 확인해 주세요"
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap text-white"
                        style={{
                          background: "linear-gradient(135deg,#f87171,#b91c1c)",
                          boxShadow: "0 2px 5px rgba(185,28,28,0.5), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.25)",
                          animation: "statusUrgentBlink 0.9s ease-in-out infinite",
                        }}
                        onClick={(e) => { e.stopPropagation(); setCancelReqPopup(r); }}
                      >
                        취소요청
                      </button>
                    ) : (r.수정요청 || isRecentShipperEdit(r)) ? (
                      <button
                        type="button"
                        title={r.수정요청 ? "화주사가 수정을 요청했어요. 눌러서 승인하거나 거절해 주세요" : "화주사가 오더를 직접 수정했어요. 눌러서 확인해 주세요"}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap text-white"
                        style={{
                          background: "linear-gradient(135deg,#3b5998,#0f2151)",
                          boxShadow: "0 2px 5px rgba(15,33,81,0.5), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 3px rgba(0,0,0,0.3)",
                          animation: "statusUrgentBlink 0.9s ease-in-out infinite",
                        }}
                        onClick={(e) => { e.stopPropagation(); if (r.수정요청) markEditRequestSeen(r); setEditReqPopup(r); }}
                      >
                        수정
                      </button>
                    ) : (
                      <button
                        type="button"
                        title={r.배차상태 === "배차완료" ? "클릭 시 배차중으로 변경" : ""}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-opacity hover:opacity-80 ${
                          r.긴급 && r.배차상태 !== "배차완료"
                            ? "bg-red-500 text-white"
                            : r.배차상태 === "배차완료"
                            ? "bg-[#1B2B4B] text-white"
                            : r.배차상태 === "배차취소"
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (r.배차상태 === "배차완료") {
                            setConfirmChange({ rowId: r._id, key: "배차상태", before: "배차완료", after: "배차중" });
                            return;
                          }
                          // 화주사 오더가 배차중인 경우 — 승인 전(화주사확인대기)이 아니라면
                          // (예: 승인 후 기사취소로 배차중이 된 경우) 배차요청으로 되돌릴 수 없다.
                        }}
                      >
                        {r.배차상태}
                      </button>
                    )}
                    {/* ⭐ 2026-11-05 기사앱 수락(초록)/거절(빨강 · 사유는 마우스 올리면) — 안 본 것은 잠깐 맥박 */}
                    <DriverAckChip row={r} className="ml-1" hideAccept />{/* ⭐ 2026-11-10 "수락" 칩은 안 보임(거절만 · 수락은 알림·토스트로) */}
                  </div>
                  </td>
                  {/* 청구운임 */}
                  <td className={cell}>
                    {canEdit("청구운임", r._id) ? (
                      <input autoComplete="off"
                        type="text"
                        className="border p-1 rounded w-full"
                        defaultValue={r.청구운임 || ""}
                        onChange={(e) =>
                          handleEditChange(r._id, "청구운임", e.target.value)
                        }
                      />
                    ) : (
                      formatComma(r.청구운임)
                    )}
                  </td>

                  {/* 기사운임 */}
                  <td className={`${cell} relative`}>
                    {canEdit("기사운임", r._id) ? (
                      <input autoComplete="off"
                        type="text"
                        className="border p-1 rounded w-full"
                        {...(fareRules ? { value: String(editedForRow?.기사운임 ?? r.기사운임 ?? "") } : { defaultValue: r.기사운임 || "" })}
                        onChange={(e) =>
                          handleEditChange(r._id, "기사운임", e.target.value)
                        }
                      />
                    ) : (
                      <>{formatComma(r.기사운임)}<ForkliftMark row={r} />{/* 🏷 2026-11-17 알약 대신 모서리 표시 — 숫자 정렬 그대로 */}</>
                    )}
                  </td>

                  {/* 수수료 */}
                  <td className={`${cell} relative text-right pr-2 whitespace-nowrap`}>
                    {/* ⭐ 2026-11-06 운임구분 알약을 수수료와 같은 줄에(줄바꿈 금지) */}
                    {fareRules && !canEdit("청구운임", r._id) && r.운임구분 ? (
                      <CellNote tone="blue" title="운임구분" lines={[`${r.운임구분}${r.운임수동 ? " · 수동 입력" : ""}`, `청구 ${formatComma(r.청구운임)} · 기사 ${formatComma(r.기사운임)}`]} testId="fare-mark" />
                    ) : null}{/* 🏷 2026-11-17 운임구분 알약 → 모서리 파란 표시 + 말풍선(숫자 정렬 그대로) */}
                    {/* 📑 2026-11-15 손실이면 눌러서 손실 사유 적기(src/lossReason.js) */}
                    {fee < 0 ? (
                      <button type="button" onClick={() => editLossReason(r, fee, (v) => patchDispatch(r._id, { 손실사유: v, __col: r.__col }))}
                        title={lossReasonOf(r) ? `손실 사유: ${lossReasonOf(r)}` : "눌러서 손실 사유 적기"} className="font-bold whitespace-nowrap text-[#2D6BE0] underline decoration-dotted underline-offset-2 hover:text-[#1E4FB0]">{/* ⭐ 2026-11-17 손실(마이너스)은 파랑 */}
                        {formatComma(fee)}{r.손실사유 ? <span className="ml-1 text-[10.5px] px-1 rounded bg-red-50 border border-red-200">사유</span> : null}
                      </button>
                    ) : (
                      <span className={`font-bold whitespace-nowrap ${profitCls(fee, "text-gray-500")}`}>{/* ⭐ 2026-11-17 수수료 — 플러스 빨강 · 마이너스 파랑(예전엔 반대) */}
                        {formatComma(fee)}
                      </span>
                    )}
                    {/* ⭐ 2026-11-02 운임규칙 — 운임구분(수정모드면 선택, 아니면 작은 표시) */}
                    {fareRules && canEdit("청구운임", r._id) ? (
                      <div className="mt-0.5 flex flex-col items-end gap-0.5">
                        <FareTypeSelect compact rules={fareRules} value={editedForRow?.운임구분 ?? r.운임구분 ?? ""} onChange={(v) => handleEditChange(r._id, "운임구분", v)} />
                        <FareRuleHint form={{ ...r, ...(editedForRow || {}) }} rules={fareRules} onReapply={() => handleEditChange(r._id, "__reapply", null)} />
                      </div>
                    ) : null}
                  </td>

                  <td className={cell} style={{maxWidth:120,minWidth:100}}>{editableInput("지급방식", r.지급방식, r._id)}</td>
                  <td className={cell} style={{maxWidth:120,minWidth:100}}>{editableInput("배차방식", r.배차방식, r._id)}</td>
                  <td className={cell}>
                    {canEdit("메모", r._id)
                      ? editableInput("메모", r.메모, r._id)
                      : <MemoIconCell text={r.메모} urgency={r.메모중요도} />}
                  </td>

                  {/* 전달사항 */}
                  <td className={cell}>
                    <NoteIconCell
                      value={editedForRow?.전달사항 ?? r.전달사항 ?? ""}
                      onSave={(val) => {
                        const patch = { 전달사항: val, updatedAt: Date.now() };
                        patchDispatch(r._id, patch).catch(console.error);
                        setRows(prev => prev.map(x => x._id === r._id ? { ...x, ...patch } : x));
                        flashRow(r._id);
                      }}
                    />
                  </td>
                  {/* 첨부 */}
                  <td className={cell}>
                    <button
                      onClick={() => setAttachViewer(r)}
                      className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto ${r.업로드잠금해제만료 && new Date(r.업로드잠금해제만료).getTime() > Date.now() ? "ring-2 ring-amber-400 animate-pulse" : ""}`}
                      title="첨부파일 보기"
                    >
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke={r.attachViewed ? "#1B2B4B" : (r.attachCount || 0) > 0 ? "#059669" : "#cbd5e1"}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {(r.attachCount || 0) > 0 && (
                        <span
                          className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none"
                          style={!r.attachViewed ? { animation: "cancelSlowBlink 1.6s ease-in-out infinite" } : undefined}
                        >
                          {r.attachCount}
                        </span>
                      )}
                      {r.재업로드완료알림 === true && (
                        <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse" />
                      )}
                    </button>
                    {r.차량번호 && (
                      <button
                        onClick={() => setLiveLocViewer(r)}
                        className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto"
                        title="실시간 위치 보기"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke={r.위치공유중 ? "#10b981" : "#cbd5e1"}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                      </button>
                    )}
                  </td>
                  {/* 전달상태 */}
                  <td className={cell}>
                    <DeliveryStatusBadge
                      row={r}
                      onConfirm={setDeliveryConfirm}
                    />
                  </td>

  </tr>
  );
}

function realtimeRowPropsEqual(prev, next) {
  return (
    prev.r === next.r &&
    // ⚡ idx(순번)는 비교하지 않는다 — 순번·줄무늬를 CSS로 그려서, 정렬해도 바뀐 줄만 다시 그린다
    prev.isSelected === next.isSelected &&
    prev.mgrName === next.mgrName &&
    prev.bizTag === next.bizTag &&
    prev.bizColor === next.bizColor &&
    prev.isFading === next.isFading &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isDark === next.isDark &&
    prev.selectedEditMode === next.selectedEditMode &&
    prev.editedForRow === next.editedForRow &&
    prev.driverConfirmOpen === next.driverConfirmOpen &&
    prev.memoAlert === next.memoAlert &&
    prev.blackAlert === next.blackAlert &&
    prev.isFirstPickupLunch === next.isFirstPickupLunch &&
    prev.isFirstDropLunch === next.isFirstDropLunch &&
    prev.fareRules === next.fareRules
  );
}

const RealtimeRow = React.memo(RealtimeRowBase, realtimeRowPropsEqual);

export default function RealtimeStatus({
  dispatchData,
  // ⭐ dispatchData는 이 화면(실시간배차현황) 표시용으로 어제~내일 3일치만 담아 전달되는
  // 좁은 창(narrow window)이다 — 화면 성능을 위해 의도적으로 좁힌 것. 문제는 운임조회/
  // 최적매칭처럼 "과거 이력"을 통째로 뒤져야 하는 기능들도 예전엔 이 dispatchData 하나만
  // 보고 동작했었는데(그때는 dispatchData 자체가 13개월치 전체였음), 좁은 창으로 바뀐 뒤에도
  // 그 함수들이 그대로 dispatchData를 참조하면서 "동일 상/하차지 운임 이력이 없습니다"가
  // 실제로는 이력이 있는데도 항상 뜨는 버그가 생겼다 — 3일 밖의 이력은 아예 안 보이니까.
  // historyDispatchData는 그 함수들 전용으로 넘겨받는 13개월 전체 범위 데이터다(호출부에서
  // 못 넘겨줘도 최소한 dispatchData로라도 동작하도록 기본값을 그것으로 둔다).
  historyDispatchData = dispatchData,
  liveDataReady = true,
  drivers,
  clients,
  placeRows,
  timeOptions,
  tonOptions,
  addDispatch,
  patchDispatch,
  removeDispatch,
  upsertDriver,
  upsertClient,
  role = "admin",
  userCompany = "",
  menu,
  darkMode = false,
  isEmbedded = false,
  isViewer = false,
  // ⭐ 등록자 표시용(users/{uid}.name) 맵 — DispatchApp에서 한 번만 구독해 내려주는
  // 값이다(예전엔 이 컴포넌트가 users 컬렉션을 직접 통째로 구독해 DispatchStatus와
  // 중복으로 읽어들였다).
  userNameMap = new Map(),
  setCargoAddPopup = () => {},
  approveEditRequest = () => {},
  rejectEditRequest = () => {},
  markEditRequestSeen = () => {},
  approvedShippers = [],
}) {
useFleetLivePublish(drivers); // ⭐ 2026-11-05 실시간 관제 색인(같은 배열이면 아무것도 안 함)
// ⭐ 2026-11-02 운임규칙 — 오더 복사·수정 패널 / 수정 창 / 운임구분 열(규칙 사용 회사만)
const fareR = useFareRules(getTenant() || userCompany);
  // 🚚 2026-11-23 차량번호 칸 추천 기사 ▾(미배차현황 추천 기사와 같은 목록) — 고르면 배정 확인 창 → 배정
  const plateSuggestPick = useDriverSuggest(historyDispatchData, userCompany);
  const [plateAssignAsk, setPlateAssignAsk] = React.useState(null);
  const [plateAssignBusy, setPlateAssignBusy] = React.useState(false);
  const plateSuggestCtx = React.useMemo(() => ({ pick: plateSuggestPick, drivers, disabled: !!isViewer, onAssign: (o, d) => setPlateAssignAsk({ order: o, driver: d }) }), [plateSuggestPick, drivers, isViewer]);
  const doPlateAssign = async () => {
    if (!plateAssignAsk || plateAssignBusy) return;
    const { order: o, driver: d } = plateAssignAsk;
    setPlateAssignBusy(true);
    // 🛠 2026-11-23 배정 직후 이 줄을 화면에서도 바로 바꾼다(차량번호 칸 직접 입력과 같게) — 예전엔 저장만 하고 화면 줄은 그대로라
    //  칸에 입력하다 만 값이 남아 있으면 차량번호 · 기사명 · 전화번호가 빈 칸으로 보였다
    const assigned = { 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호 || ""), 배차상태: "배차완료", updatedAt: Date.now() };
    try {
      setRows((prev) => prev.map((r) => (r._id === o._id ? { ...r, ...assigned } : r)));
      const ok = await patchDispatch(o._id, { ...assigned }, o); // 화면 줄(o)을 그대로 넘겨 컬렉션(orders · dispatch)을 정확히
      if (ok !== false) window.__sflowShowToast?.(`${d.이름} 기사 배정 완료`);
    } catch (e) { console.error(e); window.__sflowShowToast?.("배정 중 오류가 발생했습니다.", "err"); }
    setPlateAssignBusy(false); setPlateAssignAsk(null);
  };
const fareOn = fareR.on;
const cpCargoTypeOptions = useCompanyDropdownOptions("화물타입", role, userCompany); // 오더복사 수정 창 단위(회사별 설정)
const cpTonTypeOptions = useCompanyDropdownOptions("톤수타입", role, userCompany);
const rtTableWrapRef = React.useRef(null);
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
const rtNormalizeKey = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");
const rtNormalizeAddr = (a = "") => String(a).trim().replace(/\s+/g, "").replace(/[-./]/g, "").toLowerCase();
const rtIsSameAddr = (a = "", b = "") => {
  const na = rtNormalizeAddr(a), nb = rtNormalizeAddr(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 10 && longer.startsWith(shorter);
};
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
    const clientMatch = (clients || []).find(c => rtNormalizeKey(c.업체명 || c.거래처명) === rtNormalizeKey(name));
    if (clientMatch) {
      // 하차지거래처와 동일하게, 기존 주소와 다르면 덮어쓸지/별도 저장할지 먼저 물어본다.
      if (addr?.trim() && clientMatch.주소?.trim() &&
          rtNormalizeAddr(clientMatch.주소) !== rtNormalizeAddr(addr) &&
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
  const existingByName = mergedClients.find(p => rtNormalizeKey(p.업체명) === rtNormalizeKey(name));

  if (existingByName && addr?.trim() && existingByName.주소?.trim() &&
      rtNormalizeAddr(existingByName.주소) !== rtNormalizeAddr(addr) &&
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

const audioCtxRef = React.useRef(null);
React.useEffect(() => {
  const unlock = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {}
  };
  document.addEventListener("click", unlock, true);
  document.addEventListener("keydown", unlock, true);
  document.addEventListener("touchstart", unlock, true);
  return () => {
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    document.removeEventListener("touchstart", unlock, true);
  };
}, []);

const playNotifSound = React.useCallback(() => {
  if (!isNotificationsEnabled()) return;
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const doPlay = () => {
      const notes = [
        { freq: 698.5, t: 0,    dur: 0.14 },
        { freq: 880,   t: 0.15, dur: 0.14 },
        { freq: 1046,  t: 0.31, dur: 0.22 },
      ];
      notes.forEach(({ freq, t, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "triangle";
        osc.frequency.value = freq;
        const start = ctx.currentTime + t;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(doPlay).catch(() => {});
    } else {
      doPlay();
    }
  } catch {}
}, []);

  // ⚡ 탭 진입 시: 데이터가 이미 있으면 스피너 스킵
  const [ready, setReady] = React.useState(() => Array.isArray(dispatchData) && dispatchData.length > 0);

// 🚫 블랙 기사 알림 팝업 상태
const [blackAlert, setBlackAlert] = React.useState(null);
const [memoAlert, setMemoAlert] = React.useState(null);
const notificationsEnabled = useNotificationsEnabled();
const [newClientModalOpen, setNewClientModalOpen] = React.useState(false);
const [newClientModalData, setNewClientModalData] = React.useState({ name: "", addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" });
const openNewClientModal = (name) => { setNewClientModalData({ name: (name || "").trim(), addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" }); setNewClientModalOpen(true); };
const [alertMsg, setAlertMsg] = React.useState(null);
const showAlert = (msg) => setAlertMsg(msg);
React.useEffect(() => {
  const handler = (e) => setBlackAlert(e.detail);
  window.addEventListener("blackDriverDetected", handler);
  return () => window.removeEventListener("blackDriverDetected", handler);
}, []);
React.useEffect(() => {
  if (isEmbedded) return;  // ADD THIS LINE
  const handler = (e) => setMemoAlert(e.detail);
  window.addEventListener("driverMemoDetected", handler);
  return () => window.removeEventListener("driverMemoDetected", handler);
}, [isEmbedded]);
  // ❄️ 냉장 / 냉동 차량 판별
  const isColdVehicle = (type = "") => {
    const t = String(type);
    return t.includes("냉장") || t.includes("냉동");
  };
  const COLD_NOTICE = `인수증 업로드 (운임 지급 필수)`;
const NORMAL_NOTICE = `인수증 업로드 (운임 지급 필수)`;
const BANCHAN_NOTICE = ``;
  // 📤 업체 전달 상태 변경 확인 팝업
  const [deliveryConfirm, setDeliveryConfirm] = React.useState(null);
  // 📱 기사전달용 복사 후 SMS 팝업 (Part 4)
  const [smsConfirm4, setSmsConfirm4] = React.useState(null); // { phone, body }
  const [bulkUploadConfirm4, setBulkUploadConfirm4] = React.useState(null); // { phones: string[], body } — 업로드링크 다중 전송 확인
  const [optimalMatchRow4, setOptimalMatchRow4] = React.useState(null); // 최적매칭 대상 오더
  /*
  {
    rowId,
    before, // "미전달"
    after   // "전달완료"
  }
  */
  // 🚫 Firestore 저장용: undefined 필드 제거
  const stripUndefined = (obj) =>
    Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    );
  const isAdmin = role === "admin" || role === "totalMaster";
  // ==========================
  // 🔥 거래처 자동완성 전체 풀 (clients + dispatchData)
  // ==========================
  const allClientPool = React.useMemo(() => {
  const map = new Map();

  // 1️⃣ 기본 거래처 (clients)
  (clients || []).forEach((c) => {
    const name = c.거래처명 || c.name || "";
    if (!name) return;

    map.set(name, {
      거래처명: name,
      주소: c.주소 || "",
      담당자: c.담당자 || "",
      연락처: c.연락처 || "",
      __source: "client",
    });
  });

  // 2️⃣ 하차지 거래처 (places) 🔥🔥🔥 핵심
  (placeRows || []).forEach((p) => {
    const name = p.업체명;
    if (!name) return;

    // ⚠️ 이미 clients에 있으면 덮어쓰지 않음
    if (map.has(name)) return;

    map.set(name, {
      거래처명: name,
      주소: p.주소 || "",
      담당자: p.담당자 || "",
      연락처: p.담당자번호 || "",
      __source: "place",
    });
  });

return [...map.values()];
}, [clients, placeRows]);

  // ==========================
  // 📌 날짜 유틸 (반드시 최상단)
  // ==========================
  const yesterdayKST = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const todayKST = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  const tomorrowKST = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  // ==========================
  // 🔍 선택수정 거래처 자동완성 필터 (추가해야 함)
  // ==========================
  const normalizeClientKey = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[()㈜.,\-]/g, "")   // ! 법인표기 제거
      .replace(/주식회사|유한회사/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  const filterEditClients = (q) => {
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

  const normalizeKey = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");

  const filterEditPlaces = (q) => {
    if (!q) return [];
    // 하차지거래처(placeRows)뿐 아니라 기본거래처로만 등록된 업체도 이 패널의
    // 상/하차지명 자동완성에 나오도록 mergedClients(기본거래처+하차지거래처 통합)를 쓴다.
    // ⭐ 2026-11-03 공용 검색(placeSearch, "업체명 주소낱말") + 8개 → 60개(목록은 스크롤)
    return placeSearch(mergedClients, q).slice(0, 60).map((p) => {
      // contacts 배열에서 담당자/번호 추출
      const primary = Array.isArray(p.contacts) && p.contacts.length
        ? p.contacts.find(c => c.isPrimary) || p.contacts[0]
        : null;
      return { ...p, 담당자: primary?.name || p.담당자 || "", 담당자번호: primary?.phone || p.담당자번호 || "", score: p.__score };
    });
  };
const lastWarnedRef = React.useRef(null);
const checkWarningStatus = (name, type) => {
  const now = Date.now();
  if (lastWarnedRef.current?.name === name && now - lastWarnedRef.current.time < 3000) return;
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
    const foundPlace = (placeRows || []).find(p => p.업체명 === name);
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
  // ==========================
  // 🔵 선택수정 상/하차지 자동완성 상태
  // ==========================
  const [editPlaceOptions, setEditPlaceOptions] = React.useState([]);
  const [showEditPlaceDropdown, setShowEditPlaceDropdown] = React.useState(false);
  const [editPlaceType, setEditPlaceType] = React.useState(null); // "pickup" | "drop"
  const [editActiveIndex, setEditActiveIndex] = React.useState(0);
  const editPlaceDropdownListRef = React.useRef(null);
  React.useEffect(() => {
    const list = editPlaceDropdownListRef.current;
    if (!list) return;
    const item = list.children[editActiveIndex];
    if (!item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
    if (itemTop < viewTop) list.scrollTop = itemTop;
  }, [editActiveIndex]);
  const [panelContactPopup4, setPanelContactPopup4] = React.useState(null);
  const [panelContactActive4, setPanelContactActive4] = React.useState(0);
  const panelContactListRef4 = React.useRef(null);
  const panelContactSearchInputRef4 = React.useRef(null); // 팝업 열리면 포커스가 카드 그리드(div)에 가 있어도, 타이핑 시작하면 검색창으로 넘겨준다
  React.useEffect(() => {
    const list = panelContactListRef4.current;
    if (!list) return;
    const item = list.children[panelContactActive4];
    if (!item) return;
    const itemLeft = item.offsetLeft;
    const itemRight = itemLeft + item.offsetWidth;
    const viewLeft = list.scrollLeft;
    const viewRight = viewLeft + list.clientWidth;
    if (itemRight > viewRight) list.scrollLeft = itemRight - list.clientWidth;
    if (itemLeft < viewLeft) list.scrollLeft = itemLeft;
  }, [panelContactActive4]);
  const [panelContactSearch4, setPanelContactSearch4] = React.useState("");
  React.useEffect(() => { setPanelContactSearch4(""); }, [panelContactPopup4]);

  // 오더복사/수정 패널(copyTarget) 오더메모 팝업
  const [panelMemoPopupC4, setPanelMemoPopupC4] = React.useState(null);
  const openPanelMemoC4 = (type) => {
    const name = (type === "pickup" ? copyTarget?.상차지명 : copyTarget?.하차지명) || "";
    if (!name.trim()) { showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`); return; }
    const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
    const showKey = type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
    const noticeKey = type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
    if (copyTarget[memoKey] !== undefined || copyTarget[showKey] !== undefined || copyTarget[noticeKey] !== undefined) {
      setPanelMemoPopupC4({ type, name, memo: copyTarget[memoKey] || "", popupShow: copyTarget[showKey] !== undefined ? copyTarget[showKey] : true, notice: copyTarget[noticeKey] !== undefined ? copyTarget[noticeKey] : defaultDriverNoticeTemplate(name) });
      return;
    }
    const found = mergedClients.find(c => rtNormalizeKey(c.업체명 || "") === rtNormalizeKey(name));
    setPanelMemoPopupC4({ type, name, memo: found?.오더메모 || "", popupShow: found?.팝업표시 !== undefined ? found.팝업표시 : true, notice: found?.기사전달주의사항 !== undefined ? found.기사전달주의사항 : defaultDriverNoticeTemplate(name) });
  };
  const savePanelMemoC4 = (memo, show, notice) => {
    if (!panelMemoPopupC4) return;
    const memoKey = panelMemoPopupC4.type === "pickup" ? "상차지오더메모" : "하차지오더메모";
    const showKey = panelMemoPopupC4.type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
    const noticeKey = panelMemoPopupC4.type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
    setCopyTarget(p => ({ ...p, [memoKey]: memo, [showKey]: show, [noticeKey]: notice }));
    setPanelMemoPopupC4(null);
  };
  // ⭐ 오더메모 아이콘 색/깜빡임 표시용 — 이번 오더에서 아직 저장 전인 값이 있으면
  // 그걸, 없으면 매칭되는 거래처의 등록된 오더메모를 확인한다(openPanelMemoC4와 동일 로직).
  const hasPanelMemoC4 = (type) => {
    const name = (type === "pickup" ? copyTarget?.상차지명 : copyTarget?.하차지명) || "";
    if (!name.trim()) return false;
    const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
    if (copyTarget[memoKey] !== undefined) return !!String(copyTarget[memoKey] || "").trim();
    const found = mergedClients.find(c => rtNormalizeKey(c.업체명 || "") === rtNormalizeKey(name));
    return !!String(found?.오더메모 || "").trim();
  };

  // 선택수정 패널(editTarget) 오더메모 팝업
  const [panelMemoPopupE4, setPanelMemoPopupE4] = React.useState(null);
  const openPanelMemoE4 = (type) => {
    const name = (type === "pickup" ? editTarget?.상차지명 : editTarget?.하차지명) || "";
    if (!name.trim()) { showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`); return; }
    const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
    const showKey = type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
    const noticeKey = type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
    if (editTarget[memoKey] !== undefined || editTarget[showKey] !== undefined || editTarget[noticeKey] !== undefined) {
      setPanelMemoPopupE4({ type, name, memo: editTarget[memoKey] || "", popupShow: editTarget[showKey] !== undefined ? editTarget[showKey] : true, notice: editTarget[noticeKey] !== undefined ? editTarget[noticeKey] : defaultDriverNoticeTemplate(name) });
      return;
    }
    const found = mergedClients.find(c => rtNormalizeKey(c.업체명 || "") === rtNormalizeKey(name));
    setPanelMemoPopupE4({ type, name, memo: found?.오더메모 || "", popupShow: found?.팝업표시 !== undefined ? found.팝업표시 : true, notice: found?.기사전달주의사항 !== undefined ? found.기사전달주의사항 : defaultDriverNoticeTemplate(name) });
  };
  const savePanelMemoE4 = (memo, show, notice) => {
    if (!panelMemoPopupE4) return;
    const memoKey = panelMemoPopupE4.type === "pickup" ? "상차지오더메모" : "하차지오더메모";
    const showKey = panelMemoPopupE4.type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
    const noticeKey = panelMemoPopupE4.type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
    setEditTarget(p => ({ ...p, [memoKey]: memo, [showKey]: show, [noticeKey]: notice }));
    setPanelMemoPopupE4(null);
  };
  const hasPanelMemoE4 = (type) => {
    const name = (type === "pickup" ? editTarget?.상차지명 : editTarget?.하차지명) || "";
    if (!name.trim()) return false;
    const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
    if (editTarget[memoKey] !== undefined) return !!String(editTarget[memoKey] || "").trim();
    const found = mergedClients.find(c => rtNormalizeKey(c.업체명 || "") === rtNormalizeKey(name));
    return !!String(found?.오더메모 || "").trim();
  };
  // ==========================
  // 🔵 선택수정 거래처 자동완성 상태 (추가)
  // ==========================
  const [editClientOptions, setEditClientOptions] = React.useState([]);
  const [showEditClientDropdown, setShowEditClientDropdown] = React.useState(false);
  const [editClientActiveIndex, setEditClientActiveIndex] = React.useState(0);
  const editClientDropdownListRef = React.useRef(null);
  React.useEffect(() => {
    const list = editClientDropdownListRef.current;
    if (!list) return;
    const item = list.children[editClientActiveIndex];
    if (!item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
    if (itemTop < viewTop) list.scrollTop = itemTop;
  }, [editClientActiveIndex]);
  const [warningPopup, setWarningPopup] = React.useState(null);

  // ------------------------
  // 상태들
  // ------------------------
  // 🔎 상태 필터
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  // ALL | UNASSIGNED | ASSIGNED | URGENT | UNDELIVERED

  const [q, setQ] = React.useState("");
  const [qInput, setQInput] = React.useState("");
  // ⚡ 검색어 입력창 — 예전엔 글자 하나 칠 때마다 setQInput으로 이 거대한
  // 컴포넌트(실시간배차현황) 전체를 리렌더시켰다. 실제 검색은 Enter/조회를
  // 눌러야만 적용되므로(q에만 반응), 타이핑 중엔 이 리렌더가 전혀 필요 없다 —
  // ref로 값만 들고 있다가 Enter/조회 시점에만 읽어서(uncontrolled input)
  // 타이핑 중 리렌더 자체를 없앤다.
  const qInputRef = React.useRef(null);
  const [filterType, setFilterType] = React.useState("거래처명");
  // 🔒 실시간 배차 날짜 모드
  const [dayMode, setDayMode] = React.useState("today");
  // "yesterday" | "today" | "tomorrow"
  // 🔔 업로드 알림 리스트
  const [uploadAlerts, setUploadAlerts] = React.useState([]);
  /* =================== 기사복사 모달 상태 =================== */
const [copyModalOpen, setCopyModalOpen] = useState(false);
const [filterErrorIds, setFilterErrorIds] = useState(null); // null=전체, 배열=오류오더만
const [reVerifyToast, setReVerifyToast] = useState(null);   // 재검증 완료 토스트
const [companyBankData4, setCompanyBankData4] = React.useState(null);
React.useEffect(() => {
  const cname = localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "";
  if (!cname) return;
  const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const found = docs.find(d => (d.companyName || "").trim() === cname.trim() && d.type === "신규") ||
                  docs.find(d => (d.companyName || "").trim() === cname.trim());
    setCompanyBankData4(found || null);
  });
  return () => unsub();
}, []);

const getYoil = (dateStr) => {
  const date = new Date(dateStr);
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][
    date.getDay()
  ];
};

// 📦 화물내용에서 파렛트 수 추출
const getPalletCount = (text = "") => {
  const m = String(text).match(/(\d+)\s*파렛/);
  return m ? Number(m[1]) : null;
};

// 🔁 운임 중복 제거 Key
const makeFareDedupKey = (r) => {
  const pallet = getPalletCount(r.화물내용);
  const fare = Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
  return [r.상차지명, r.하차지명, pallet, fare].join("|");
};

const formatPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  if (digits.length === 10) {
    if (digits.startsWith("02"))
      return digits.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3");
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, "$1-$2");
  return digits;
};

const buildContactLine = (name0, phone) => {
  const name = mgrName(name0); // 고정노선 자리 채움 "담당자"는 빈 값
  if (!name && !phone) return null;

  return phone
    ? `담당자 : ${name || ""} (${formatPhone(phone)})`
    : `담당자 : ${name}`;
};

// 📋 2026-11-13 간단 목록 — 고른 오더(여러 건)를 "머리말 + 기사 한 줄씩"으로 복사(⚙ 문구 설정 › 간단 목록에서 틀 변경)
// 📋 2026-11-20 사용자 요청 — 다른 복사처럼 복사 뒤 [전달상태 → 전달완료] 팝업(고른 오더 중 미전달인 것 전부 한 번에)
const copySimpleList = () => {
  const list = selected.map((id) => rows.find((x) => x._id === id)).filter(Boolean);
  if (!list.length) { showAlert("복사할 오더를 선택하세요."); return; }
  const text = buildSimpleList(list, getSimpleTpl());
  navigator.clipboard.writeText(text);
  setCopyModalOpen(false); setSelected([]);
  const ids = list.filter((r) => r.업체전달상태 !== "전달완료").map((r) => r._id);
  if (ids.length) setDeliveryConfirm({ rowId: ids[0], ids, total: list.length, before: "미전달", after: "전달완료", reason: "copy" });
  else showAlert(`오더 ${list.length}건을 간단 목록으로 복사했습니다.`);
  setTimeout(async () => { try { if (await navigator.clipboard.readText() === text) showAlert("◷ 아직 전달되지 않은 것 같습니다.\n카카오톡 대화창에 붙여넣기(Ctrl+V) 했는지 확인해 주세요."); } catch { /* 읽기 권한 없음 */ } }, 3000);
};
const copyMessage = (mode) => {
  if (mode === "simple") return copySimpleList();
  if (!selected.length) {
    showAlert("복사할 항목을 선택하세요.");
    return;
  }

  const text = selected
    .map((id) => {
      const r = rows.find((x) => x._id === id);
      if (!r) return "";

      // 📋 2026-11-18 오더 한 건 문구는 src/driverCopyText.js(배차현황 · 모바일과 같은 글) — 상/하차지 주의사항만 여기서 찾아 넘긴다
      const _findDriverNotice4d = (placeName) => {
        const n = (placeName || "").trim();
        if (!n) return "";
        const found = (mergedClients || []).find(c => rtNormalizeKey(c.업체명 || c.거래처명 || "") === rtNormalizeKey(n));
        const notice = (found?.기사전달주의사항 || "").trim();
        return _hasRealDriverNotice(notice) ? notice : "";
      };
      const noticeBlock = [...new Set([_findDriverNotice4d(r.상차지명), _findDriverNotice4d(r.하차지명)].filter(Boolean))].join("\n\n");
      return buildDriverCopyText(r, mode, { driverNote: edited[r._id]?.전달사항, noticeBlock, uploadUrlOf: issueUploadUrl, company: userCompany });
    })
    .join("\n\n");

  // 모든 모드에서 텍스트 복사
  navigator.clipboard.writeText(text);

  setSelected([]);
  setCopyModalOpen(false);
  const rowId = selected[0];
  const row = rows.find((r) => r._id === rowId);

  if (mode === "driver") {
    // 기사전달용: SMS 전송 팝업
    const phone = formatPhone(row?.전화번호 || "");
    setSmsConfirm4({ phone, body: text, rowId });
  } else if (row && row.업체전달상태 !== "전달완료") {
    setDeliveryConfirm({
      rowId,
      before: row?.업체전달상태 || "미전달",
      after: "전달완료",
      reason: "copy",
    });
  }

  setTimeout(async () => {
    try {
      const latest = await navigator.clipboard.readText();
      if (latest === text) {
        showAlert("◷ 아직 전달되지 않은 것 같습니다.\n카카오톡 대화창에 붙여넣기(Ctrl+V) 했는지 확인해 주세요.");
      }
    } catch (e) {
      console.error("Clipboard read error", e);
    }
  }, 3000);
};

// 계좌 정산 이미지 복사 (Part 4) — 그리는 식은 sharedDispatchUi.jsx(copyAccountSettleImage) 한 곳
const copyAccountImage4 = async () => {
  if (!selected.length) { showAlert("오더를 선택하세요."); return; }
  const selRow = rows.find(r => r._id === selected[0]);
  await copyAccountSettleImage({ selRow, bizList: rtBiz, bankData: companyBankData4, showAlert, onCopied: () => setCopyModalOpen(false) });
};

// 사업자등록증 이미지 복사 (Part 4) — ⭐ 2026-11-03 여러 사업자면 그 사업자 정보 카드 이미지(sharedDispatchUi.jsx copyBizImage)
const copyBizImage4 = async () => {
  const _r4 = selected.length ? rows.find(r => r._id === selected[0]) : null;
  await copyBizImage({ selRow: _r4, bizList: rtBiz, bankData: companyBankData4, showAlert, onCopied: () => setCopyModalOpen(false) });
};

  // 이미 본 알림(id 저장)
// 🔔 알림 시스템
  const prevAttachRef = React.useRef({});      // 이전 attachCount 기억
  const viewedAttachRef = React.useRef({});    // 사용자가 열어본 attachCount 기억
  const [filterValue, setFilterValue] = React.useState("");
// ✅ 배차상태 우선순위: 배차중 -> 배차완료 -> 배차취소(맨 아래)
// ✅ 배차상태 우선순위: 배차중 -> 배차완료 -> 배차취소(맨 아래)
const getStatusRank = (s) => {
  const v = String(s || "");
  if (v === "배차중") return 0;
  if (v === "배차완료") return 1;
  if (v === "배차취소") return 2;
  return 3;
};

// 🔥 어떤 타입이 와도 ms(number)로 바꿔주는 유틸 (Firestore Timestamp 대응)
const toMs = (v) => {
  if (v == null) return 0;

  // number(ms)
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  // string(ISO 등)
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }

  // Date
  if (v instanceof Date) return v.getTime();

  // Firestore Timestamp (toMillis)
  if (typeof v?.toMillis === "function") return v.toMillis();

  // Firestore Timestamp shape {seconds, nanoseconds}
  if (typeof v?.seconds === "number") return v.seconds * 1000;

  return 0;
};

// 🔥 "등록시간"을 뽑는 함수: createdAt 최우선, 없으면 updatedAt/등록일 fallback
const getCreatedMs = (r) => {
  return (
    toMs(r?.createdAt) ||
    toMs(r?.등록일시) ||
    toMs(r?.등록시간) ||
    toMs(r?.createdTime) ||
    toMs(r?.등록일 ? `${r.등록일}T00:00:00` : null)
  );
};
// ✅ ms → 보기 좋은 문자열(한국시간)
const formatKstDateTime = (ms) => {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour12: false,
    });
  } catch {
    return "-";
  }
};

// ✅ 마지막 수정시간 후보(updatedAt / lastUpdated 등) 통합
const getUpdatedMs = (r) => {
  return (
    toMs(r?.updatedAt) ||
    toMs(r?.lastUpdated) ||
    toMs(r?.수정일시) ||
    toMs(r?.modifiedAt) ||
    0
  );
};

// ✅ 배차한시간 — 배차중 → 배차완료로 최초 확정된 시각(patchDispatch에서 기록)
const getDispatchConfirmedMs = (r) => toMs(r?.배차확정일시);

// ✅ 등록자 이름/식별자 후보 통합 (있는 것부터 표시) — 오더에 실명이 안 찍혀있고
// 이메일/계정아이디만 저장돼 있는 경우(과거 오더, 또는 실명이 아직 반영 안 된
// 등록 경로), userNameMap(uid/이메일 → users/{uid}.name)으로 실명을 다시 찾아준다.
const getCreatorLabel = (r, userNameMap) => {
  // ⭐ 작성자(auth.currentUser?.email)는 addDispatch가 예외 없이 모든 오더에 항상 남기는
  // 필드라, myRealName 로딩 타이밍 문제로 등록자명/createdByName이 비어있거나 예전
  // 형식이라 매칭이 안 되는 오래된 오더도 여기로 폴백하면 이름 해석이 훨씬 더 잘 된다.
  const raw =
    r?.등록자명 ||
    r?.createdByName ||
    r?.등록자 ||
    r?.createdByEmail ||
    r?.createdBy ||
    r?.createdByUid ||
    r?.작성자 ||
    "";
  if (!raw) return "-";
  const resolved = userNameMap?.get(raw) || userNameMap?.get(String(raw).trim().toLowerCase());
  return resolved || raw;
};

// ✅ 상태순서 고정 + 배차완료→updatedAt 최신순, 배차중→최근활동(updatedAt or createdAt) 최신순
const sortDispatchRows = (list = []) => {
  return [...list].sort((a, b) => {
    const ra = getStatusRank(a?.배차상태);
    const rb = getStatusRank(b?.배차상태);
    if (ra !== rb) return ra - rb;

    // 배차완료 → updatedAt 최신순 (배차확정 시간 기준)
    if (a?.배차상태 === "배차완료") {
      return getUpdatedMs(b) - getUpdatedMs(a);
    }
    // 배차중 → 등록/수정시간 중 최신값 (모바일 등록 오더가 상단에 오도록)
    const ta = Math.max(getCreatedMs(a), getUpdatedMs(a));
    const tb = Math.max(getCreatedMs(b), getUpdatedMs(b));
    return tb - ta;
  });
};


const [rows, setRows] = React.useState(() => {
  const relevantDates = new Set([yesterdayKST(), todayKST(), tomorrowKST()]);
  return sortDispatchRows(
    (dispatchData || []).filter(r => r?.상차일 && relevantDates.has(r.상차일))
  );
});
const [movedRowId, setMovedRowId] = React.useState(null);
React.useEffect(() => { setReady(true); }, []); // eslint-disable-line
 const [selected, setSelected] = React.useState([]);
const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  // 날짜 탭(어제/당일/내일)을 바꾸면 화면에 보이는 행 자체가 바뀌므로, 이전 날짜에서
  // 선택해둔 체크박스가 그대로 남아있으면 안 보이는 행을 실수로 함께 삭제/처리하는
  // 사고로 이어질 수 있다 — 탭이 바뀔 때마다 선택을 초기화한다.
  React.useEffect(() => { setSelected([]); }, [dayMode]);

  const [selectedEditMode, setSelectedEditMode] = React.useState(false);
  const [edited, setEdited] = React.useState({});
  // =======================
  // 🔥 즉시변경 확인 팝업 (PART 5 이식)
  // =======================
  const [confirmChange, setConfirmChange] = React.useState(null);
  /*
  {
    rowId,
    key,
    before,
    after
  }
  */

  // =======================
  // 🔵 선택삭제 팝업 + 되돌리기 상태
  // =======================
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteList, setDeleteList] = React.useState([]);

  const [undoStack, setUndoStack] = React.useState([]);
  const [showUndo, setShowUndo] = React.useState(false);

  // 우클릭 컨텍스트 메뉴
  const [contextMenu, setContextMenu] = React.useState(null); // { x, y, row }
  const [fareCertRow, setFareCertRow] = React.useState(null); // 운임정보 미리보기 대상 오더
  const [scheduleChartRows, setScheduleChartRows] = React.useState(null); // 스케줄표 대상 오더들
  const [palletSlipRows, setPalletSlipRows] = React.useState(null); // 전표발행(물류기기 이동전표) 대상 오더(들)
  const [bulkEditRows, setBulkEditRows] = React.useState(null); // 일괄수정 대상 오더들
  const [bulkLegacy, setBulkLegacy] = React.useState(false); // 🗂 2026-11-09 [운임·전달사항 상세] — 예전 일괄수정 창
  const [dateShiftRows, setDateShiftRows] = React.useState(null); // 날짜 일괄 이동 대상 오더들

  React.useEffect(() => {
    const close = () => setContextMenu(null);
    const onKey = (e) => {
      if (e.key === "Delete" && contextMenu) {
        setDeleteList(selected.includes(contextMenu.row._id) && selected.length > 1 ? rows.filter((r) => selected.includes(r._id)) : [contextMenu.row]); // ⭐ 선택한 줄 위에서 지우면 선택한 줄 전부
        setDeleteConfirmOpen(true);
        setContextMenu(null);
      }
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [contextMenu, selected, rows]);

  // ===================== 첨부현황 =====================
  const [attachStatusOpen, setAttachStatusOpen] = React.useState(false);
  const [attachStatusClient, setAttachStatusClient] = React.useState("");

  // ===================== 운임조회 (컨텍스트메뉴 Part 4) =====================
  const [ctxFare4Target, setCtxFare4Target] = React.useState(null);
  const [ctxFare4PanelOpen, setCtxFare4PanelOpen] = React.useState(false);
  const [ctxFare4Result, setCtxFare4Result] = React.useState(null);
  const [ctxFare4SortMode, setCtxFare4SortMode] = React.useState("relevance");
  const [ctxNoHistory4Open, setCtxNoHistory4Open] = React.useState(false);
  const [ctxAddrSearch4Open, setCtxAddrSearch4Open] = React.useState(false);
  const [ctxAddrPickup4, setCtxAddrPickup4] = React.useState("");
  const [ctxAddrDrop4, setCtxAddrDrop4] = React.useState("");
  const [ctxAddrAllClients4, setCtxAddrAllClients4] = React.useState(false);
  const [ctxAddrResults4, setCtxAddrResults4] = React.useState([]);

  // ===================== 일마감 상태 =====================
  const [dailyCloseOpen, setDailyCloseOpen] = React.useState(false);
const [closeReportOpen, setCloseReportOpen] = React.useState(false); // ★ 마감보고 전송 창
  const [dailyCloseResult, setDailyCloseResult] = React.useState(null);
  const [dailyCloseFilter, setDailyCloseFilter] = React.useState("all");

  // === 유사 운임조회 (선택수정 전용 업그레이드) ===
  const handleFareSearch = () => {
    const row = editTarget;
    if (!row) return showAlert("먼저 수정할 오더를 선택해주세요.");

    const pickup = row.상차지명?.trim();
    const drop = row.하차지명?.trim();
    if (!pickup || !drop) return showAlert("상/하차지를 입력해주세요.");

    const targetCargo = String(row.화물내용 || "").trim();
    const targetTon = String(row.차량톤수 || "").trim();
    const targetVehicle = String(row.차량종류 || "").trim();
    const isColdVehicle = targetVehicle.includes("냉장") || targetVehicle.includes("냉동");

    // 🔥 1단계: 상/하차지 + 차량종류(냉장/냉동 그룹) 필터 (경유지 포함 정확매칭)
    const inputPickupStops = getRouteStops(row, "pickup");
    const inputDropStops = getRouteStops(row, "drop");
    const sameStops = (a, b) => a.length === b.length && a.every((n, i) => n.trim() === b[i].trim());
    const _todayKst4sel = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const base = (historyDispatchData || []).filter(r => {
      if ((r.상차일 || "").slice(0, 10) === _todayKst4sel) return false;
      if (!r.청구운임) return false;
      const rPickupStops = getRouteStops(r, "pickup");
      const rDropStops = getRouteStops(r, "drop");
      if (!sameStops(inputPickupStops, rPickupStops)) return false;
      if (!sameStops(inputDropStops, rDropStops)) return false;
      const rv = String(r.차량종류 || "");
      const rCold = rv.includes("냉장") || rv.includes("냉동");
      return isColdVehicle ? rCold : !rCold;
    });

    if (!base.length) {
      showAlert("○ 동일 상/하차지 운임 이력이 없습니다.");
      return;
    }

    // 🔥 2단계: 티어 기반 점수
    const _4fDetectType = (s = "") => { const t = s.trim().toLowerCase().replace(/\s+/g,""); if (/\d+(파레트|파렛트|파렛|파레|파|plt)/.test(t)) return "pallet"; if (/\d+(박스|box)/.test(t)) return "box"; return "text"; };
    const _4fInputType = _4fDetectType(targetCargo);
    const _4fInputPallet = getTotalPalletFromOrder(row);
    const _4fInputBox = (() => { const m = targetCargo.replace(/\s+/g,"").match(/(\d+)(박스|box)/i); return m ? Number(m[1]) : null; })();
    const _4fInputTon = getTotalTonFromOrder(row);

    const _4fScored = base.map(r => {
      const rType = _4fDetectType(r.화물내용);
      const rTon = getTotalTonFromOrder(r);
      const rDate = r.상차일 || r.등록일 || "";
      let cargoDiff = 999, tonDiff = 999;
      if (_4fInputType === "pallet" && _4fInputPallet != null && rType === "pallet") { const rp = getTotalPalletFromOrder(r); cargoDiff = rp != null ? Math.abs(rp - _4fInputPallet) : 999; }
      else if (_4fInputType === "box" && _4fInputBox != null) { const rm = (r.화물내용||"").replace(/\s+/g,"").match(/(\d+)(박스|box)/i); cargoDiff = rm ? Math.abs(Number(rm[1]) - _4fInputBox) : 999; }
      else { cargoDiff = (r.화물내용||"").trim() === targetCargo ? 0 : 1; }
      if (_4fInputTon != null && rTon != null) tonDiff = Math.abs(rTon - _4fInputTon);
      const exactCargo = cargoDiff === 0, exactTon = tonDiff === 0;
      const tier = exactCargo && exactTon ? 0 : exactCargo ? 1 : exactTon ? 2 : 3;
      const matchLabel = tier === 0 ? "완전일치" : tier === 1 ? "부분일치" : tier === 2 ? "톤수일치" : "경로일치";
      return { ...r, _cargoDiff: cargoDiff, _tonDiff: tonDiff, _tier: tier, _date: rDate, _match: { label: matchLabel } };
    });

    // ⚠️ 화물내용+톤수만으로 묶으면 같은 조합이라도 청구운임이 다른 이력(예: 2건 중
    // 1건만 금액이 달랐던 경우)까지 최신 1건으로 뭉개져 사라진다 — 운임 금액도 그룹
    // 키에 포함해 실제로 완전히 동일한 이력만 합쳐지도록 한다.
    const _4fGroupMap = new Map();
    _4fScored.forEach(r => { const key = `${(r.화물내용||"").trim()}|${(r.차량톤수||"").trim()}|${Number(String(r.청구운임||"0").replace(/[^\d]/g,""))}`; if (!_4fGroupMap.has(key)) _4fGroupMap.set(key, []); _4fGroupMap.get(key).push(r); });
    const scored = Array.from(_4fGroupMap.values()).map(recs => { const best = [...recs].sort((a,b) => b._date.localeCompare(a._date))[0]; return { ...best, _groupSize: recs.length }; })
      .sort((a, b) => { if (a._tier !== b._tier) return a._tier - b._tier; if (a._tonDiff !== b._tonDiff) return a._tonDiff - b._tonDiff; if (a._cargoDiff !== b._cargoDiff) return a._cargoDiff - b._cargoDiff; return b._date.localeCompare(a._date); });

    // 🔥 통계
    const fares = scored.map(r =>
      Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""))
    );

    setFareResult({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
      latest: scored[0],
    });
setFarePanelOpen(true);
  };
    // === 복사/수정 패널 전용 운임조회 (업그레이드) ===
  const handleCopyFareSearch = () => {
    if (!copyTarget) return showAlert("먼저 오더를 선택해주세요.");

    const pickup = copyTarget.상차지명?.trim();
    const drop = copyTarget.하차지명?.trim();
    if (!pickup || !drop) return showAlert("상/하차지를 입력해주세요.");

    try {
    const targetCargo = String(copyTarget.화물내용 || "").trim();
    const targetTon = String(copyTarget.차량톤수 || "").trim();
    const targetVehicle = String(copyTarget.차량종류 || "").trim();
    const isColdVehicle = targetVehicle.includes("냉장") || targetVehicle.includes("냉동");

    const _todayKstCopy = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const _copyPickupStops = getRouteStops(copyTarget, "pickup");
    const _copyDropStops = getRouteStops(copyTarget, "drop");
    const _copySameStops = (a, b) => a.length === b.length && a.every((n, i) => n.trim() === b[i].trim());
    const base = (historyDispatchData || []).filter(r => {
      if ((r.상차일 || "").slice(0, 10) === _todayKstCopy) return false;
      if (!r.청구운임) return false;
      if (!_copySameStops(_copyPickupStops, getRouteStops(r, "pickup"))) return false;
      if (!_copySameStops(_copyDropStops, getRouteStops(r, "drop"))) return false;
      const rv = String(r.차량종류 || "");
      const rCold = rv.includes("냉장") || rv.includes("냉동");
      return isColdVehicle ? rCold : !rCold;
    });

    if (!base.length) {
      // ⭐ 동일 상/하차지명 이력이 없으면(신규 거래처/신규 하차지 등) 바로 포기하지
      // 않고, 주소 기준으로 검색할지 물어본다 — 실시간배차현황 컨텍스트메뉴
      // 운임조회와 동일한 흐름.
      setCopyAddrClient(copyTarget.거래처명 || "");
      setCopyAddrPickup(extractAddrArea(copyTarget.상차지주소 || copyTarget.상차지명));
      setCopyAddrDrop(extractAddrArea(copyTarget.하차지주소 || copyTarget.하차지명));
      setCopyAddrConfirmOpen(true);
      return;
    }

    const _4cDetectType = (s = "") => { const t = s.trim().toLowerCase().replace(/\s+/g,""); if (/\d+(파레트|파렛트|파렛|파레|파|plt)/.test(t)) return "pallet"; if (/\d+(박스|box)/.test(t)) return "box"; return "text"; };
    const _4cInputType = _4cDetectType(targetCargo);
    const _4cInputPallet = getTotalPalletFromOrder(copyTarget);
    const _4cInputBox = (() => { const m = targetCargo.replace(/\s+/g,"").match(/(\d+)(박스|box)/i); return m ? Number(m[1]) : null; })();
    const _4cInputTon = getTotalTonFromOrder(copyTarget);

    const _4cScored = base.map(r => {
      const rType = _4cDetectType(r.화물내용);
      const rTon = getTotalTonFromOrder(r);
      const rDate = r.상차일 || r.등록일 || "";
      let cargoDiff = 999, tonDiff = 999;
      if (_4cInputType === "pallet" && _4cInputPallet != null && rType === "pallet") { const rp = getTotalPalletFromOrder(r); cargoDiff = rp != null ? Math.abs(rp - _4cInputPallet) : 999; }
      else if (_4cInputType === "box" && _4cInputBox != null) { const rm = (r.화물내용||"").replace(/\s+/g,"").match(/(\d+)(박스|box)/i); cargoDiff = rm ? Math.abs(Number(rm[1]) - _4cInputBox) : 999; }
      else { cargoDiff = (r.화물내용||"").trim() === targetCargo ? 0 : 1; }
      if (_4cInputTon != null && rTon != null) tonDiff = Math.abs(rTon - _4cInputTon);
      const exactCargo = cargoDiff === 0, exactTon = tonDiff === 0;
      const tier = exactCargo && exactTon ? 0 : exactCargo ? 1 : exactTon ? 2 : 3;
      const matchLabel = tier === 0 ? "완전일치" : tier === 1 ? "부분일치" : tier === 2 ? "톤수일치" : "경로일치";
      return { ...r, _cargoDiff: cargoDiff, _tonDiff: tonDiff, _tier: tier, _date: rDate, _match: { label: matchLabel } };
    });

    // ⚠️ 화물내용+톤수만으로 묶으면 금액이 다른 이력이 사라지므로 청구운임도 그룹 키에 포함
    const _4cGroupMap = new Map();
    _4cScored.forEach(r => { const key = `${(r.화물내용||"").trim()}|${(r.차량톤수||"").trim()}|${Number(String(r.청구운임||"0").replace(/[^\d]/g,""))}`; if (!_4cGroupMap.has(key)) _4cGroupMap.set(key, []); _4cGroupMap.get(key).push(r); });
    const scored = Array.from(_4cGroupMap.values()).map(recs => { const best = [...recs].sort((a,b) => b._date.localeCompare(a._date))[0]; return { ...best, _groupSize: recs.length }; })
      .sort((a, b) => { if (a._tier !== b._tier) return a._tier - b._tier; if (a._tonDiff !== b._tonDiff) return a._tonDiff - b._tonDiff; if (a._cargoDiff !== b._cargoDiff) return a._cargoDiff - b._cargoDiff; return b._date.localeCompare(a._date); });

    const fares = scored.map(r =>
      Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""))
    );

    setFareResult({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
      latest: scored[0],
    });
    setCopyFarePanelOpen(true);
    } catch (e) {
      console.error("운임조회 오류:", e);
      showAlert("운임조회 중 오류가 발생했습니다.\n" + (e?.message || e));
    }
  };

  // ⭐ 오더복사/수정 패널 전용 — 주소 기준 운임조회. 거래처명 입력창을 비워두면
  // (사용자가 직접 지운 경우) 거래처 구분 없이 해당 상/하차 지역의 모든 이력을 검색한다.
  const handleCopyAddrSearch = () => {
    const row = copyTarget;
    if (!row) return;
    const pickupKw = copyAddrPickup.trim();
    const dropKw = copyAddrDrop.trim();
    if (!pickupKw || !dropKw) { showAlert("상차지 주소와 하차지 주소를 입력해주세요."); return; }
    const clientKw = copyAddrClient.trim();

    try {
      const targetGroup = getVehicleGroup(row.차량종류);
      const _todayKstCopyAddr = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const matchDir = (pk, dk) => (historyDispatchData || []).filter(r => {
        if ((r.상차일 || "").slice(0, 10) === _todayKstCopyAddr) return false;
        if (!r.청구운임) return false;
        const rPickup = String(r.상차지명 || "") + " " + String(r.상차지주소 || "");
        const rDrop = String(r.하차지명 || "") + " " + String(r.하차지주소 || "");
        if (!rPickup.includes(pk)) return false;
        if (!rDrop.includes(dk)) return false;
        const rGroup = getVehicleGroup(r.차량종류);
        if (rGroup !== targetGroup) return false;
        if (clientKw && String(r.거래처명 || "").trim() !== clientKw) return false;
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
        showAlert("해당 조건의 운임 이력이 없습니다.");
        return;
      }

      const scored = base.map(r => ({
        ...r,
        _score: scoreCtxFareRow(r, row),
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
        latest: scored[0],
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
const [editStopOpen, setEditStopOpen] = React.useState(false);
const [editStopType, setEditStopType] = React.useState("pickup");
  const [editPopupOpen, setEditPopupOpen] = React.useState(false);
  // ⭐ 일마감 검증 팝업의 오류/경고 목록에서 오더를 클릭해 오더복사/수정
  // 패널(copyTarget)을 열었을 때만 채워지는, 해당 오더의 검증 문제점 목록 —
  // 패널 상단에 "문제점" 배너로 보여주고, 저장 시 일마감 검증을 자동으로
  // 다시 계산한다.
  const [dailyCloseIssueCtx, setDailyCloseIssueCtx] = React.useState(null);
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
const [clientApplyPopup, setClientApplyPopup] = React.useState(null);
const [copyClientOptions, setCopyClientOptions] = useState([]);
const [showCopyClientDropdown, setShowCopyClientDropdown] = useState(false);
const [copyClientIndex, setCopyClientIndex] = useState(0);
const copyClientListRef = React.useRef(null);
const [copyPlaceOptions, setCopyPlaceOptions] = React.useState([]);
const [showCopyPlaceDropdown, setShowCopyPlaceDropdown] = React.useState(false);
const [copyPlaceType, setCopyPlaceType] = React.useState(null); // "pickup" | "drop"
const [copyActiveIndex, setCopyActiveIndex] = React.useState(0);
const copyPlaceDropdownListRef = React.useRef(null);
React.useEffect(() => {
  const list = copyPlaceDropdownListRef.current;
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
  const [editTarget, setEditTarget] = React.useState(null);
  // ⭐ 2026-11-05 매칭된 기사 이름·전화 [수정] — 오더 복사/수정 패널(cpDrvEdit) · 수정 창(editDrvEdit)
  const cpDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => sflowToast(m, "success") });
  const editDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => sflowToast(m, "success") });
  React.useEffect(() => { cpDrvEdit.reset(); }, [copyPanelOpen, copyTarget?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { editDrvEdit.reset(); }, [editPopupOpen, editTarget?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⭐ 다목적지 단가표 매칭 (3파트와 동일) — 선택수정 중인 오더(editTarget)의
  // 하차지명/주소가 단가표 메뉴에 등록된 하차지와 겹치면 "단가표" 버튼이
  // 천천히 깜빡이고, 눌렀을 때 그 하차지에 등록된 모든 톤수 단가를 보여준다.
  // ⚠️ editTarget보다 반드시 아래에 둬야 한다 — useMemo factory는 렌더 중
  // 즉시 실행되므로, 아직 선언되지 않은 editTarget을 참조하면 TDZ 크래시가 난다.
  const [multiRateSheets4, setMultiRateSheets4] = React.useState([]);
  React.useEffect(() => {
    const co = (userCompany || localStorage.getItem("userCompany") || "").trim();
    if (!co) { setMultiRateSheets4([]); return; }
    const q = query(collection(db, "multiRateSheets"), where("companyName", "==", co));
    const unsub = onSnapshot(q, (snap) => {
      setMultiRateSheets4(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [userCompany]);
  const [rateSheetLookupOpen4, setRateSheetLookupOpen4] = React.useState(false);
  const normRateText4 = (s) => String(s || "").replace(/[\s()（）·]/g, "").toLowerCase();
  const rateSheetMatches4 = React.useMemo(() => {
    const dropName = normRateText4(editTarget?.하차지명);
    const dropAddr = normRateText4(editTarget?.하차지주소).slice(0, 12);
    if (!dropName && !dropAddr) return [];
    const results = [];
    (multiRateSheets4 || []).forEach(sheet => {
      (sheet.rows || []).forEach(r => {
        const rName = normRateText4(r.name);
        const rAddr = normRateText4(r.address).slice(0, 12);
        const nameHit = !!(dropName && rName && (rName.includes(dropName) || dropName.includes(rName)));
        const addrHit = !!(dropAddr && rAddr && dropAddr.length >= 6 && rAddr.length >= 6 && (rAddr.includes(dropAddr) || dropAddr.includes(rAddr)));
        if (nameHit || addrHit) results.push({ sheet, row: r, nameHit, addrHit });
      });
    });
    return results;
  }, [editTarget?.하차지명, editTarget?.하차지주소, multiRateSheets4]);

  const [farePanelOpen, setFarePanelOpen] = React.useState(false);
  const [copyFarePanelOpen, setCopyFarePanelOpen] = React.useState(false);
  const [copyFareFilter, setCopyFareFilter] = React.useState("all");
  // ⭐ 오더복사/수정 패널 운임조회 — 동일 상/하차지 이력이 없을 때, 실시간배차현황
  // 컨텍스트메뉴 운임조회의 "주소로 검색" 팝업과 동일한 흐름을 여기서도 제공한다.
  // 거래처명은 기본으로 이 오더의 거래처명이 채워지되, 지우면 전체 거래처 대상으로
  // 넓혀 검색할 수 있도록 편집 가능한 입력창으로 둔다(체크박스 토글이 아님).
  const [copyAddrConfirmOpen, setCopyAddrConfirmOpen] = React.useState(false);
  const [copyAddrSearchOpen, setCopyAddrSearchOpen] = React.useState(false);
  const [copyAddrClient, setCopyAddrClient] = React.useState("");
  const [copyAddrPickup, setCopyAddrPickup] = React.useState("");
  const [copyAddrDrop, setCopyAddrDrop] = React.useState("");
  const [driverPick, setDriverPick] = React.useState(null);
  const [markDeliveredOnSave, setMarkDeliveredOnSave] = React.useState(false);
  React.useEffect(() => {
  if (!copyClientListRef.current) return;

  const list = copyClientListRef.current;
  const item = list.children[copyClientIndex];
  if (!item) return;

  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;

  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;

  if (itemBottom > viewBottom) {
    list.scrollTop = itemBottom - list.clientHeight;
  }

  if (itemTop < viewTop) {
    list.scrollTop = itemTop;
  }
}, [copyClientIndex]);
  // 🔥 운임조회 모달 ESC 닫기
React.useEffect(() => {
  if (!farePanelOpen) return;

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setFarePanelOpen(false);
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [farePanelOpen]);
// 🔥 복사패널 운임조회 모달 ESC 닫기
React.useEffect(() => {
  if (!copyFarePanelOpen) return;
  const handleKeyDown = (e) => {
    if (e.key === "Escape") setCopyFarePanelOpen(false);
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [copyFarePanelOpen]);

  // ── 운임조회 컨텍스트메뉴 유틸 ──
  function extractAddrArea(addr) {
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

  function scoreCtxFareRow(r, targetRow) {
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

  function getVehicleGroup(vehicleType) {
    const v = String(vehicleType || "");
    if (v.includes("냉장") || v.includes("냉동")) return "cold";
    if (v.includes("오토바이") || v.includes("바이크")) return "motorcycle";
    return "general";
  }

  const handleCtxFareSearch4 = (row) => {
    const pickup = String(row.상차지명 || "").trim();
    const drop = String(row.하차지명 || "").trim();
    if (!pickup || !drop) { showAlert("상/하차지 정보가 없습니다."); return; }

    const targetGroup = getVehicleGroup(row.차량종류);
    const targetClient = String(row.거래처 || "").trim();
    const targetCargo = String(row.화물내용 || "").trim();
    const targetTon = String(row.차량톤수 || "").trim();
    const targetTonTotal = getTotalTonFromOrder(row);

    const _ctx4PickupStops = getRouteStops(row, "pickup");
    const _ctx4DropStops = getRouteStops(row, "drop");
    const _todayKstCtx4 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const _ctx4Same = (a, b) => a.length === b.length && a.every((n, i) => n.trim() === b[i].trim());
    const base = (historyDispatchData || []).filter(r => {
      if ((r.상차일 || "").slice(0, 10) === _todayKstCtx4) return false;
      if (!r.청구운임) return false;
      if (!_ctx4Same(_ctx4PickupStops, getRouteStops(r, "pickup"))) return false;
      if (!_ctx4Same(_ctx4DropStops, getRouteStops(r, "drop"))) return false;
      const rGroup = getVehicleGroup(r.차량종류);
      return rGroup === targetGroup;
    });

    if (!base.length) {
      setCtxFare4Target(row);
      setCtxAddrPickup4(extractAddrArea(row.상차지주소 || row.상차지명));
      setCtxAddrDrop4(extractAddrArea(row.하차지주소 || row.하차지명));
      setCtxAddrAllClients4(false);
      setCtxAddrResults4([]);
      setCtxNoHistory4Open(true);
      return;
    }

    const scored = base.map(r => {
      const cargoMatch = targetCargo && r.화물내용 && r.화물내용.includes(targetCargo);
      const tonMatch = targetTonTotal != null && getTotalTonFromOrder(r) === targetTonTotal;
      return {
        ...r,
        _score: (cargoMatch ? 100 : 0) + (tonMatch ? 100 : 0),
        _match: { cargo: cargoMatch, ton: tonMatch },
        _time: r.updatedAt || r.등록일 || 0,
      };
    });
    scored.sort((a, b) => b._score !== a._score ? b._score - a._score : b._time - a._time);

    const fares = scored.map(r => Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")));
    setCtxFare4Target(row);
    setCtxFare4Result({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
    });
    setCtxFare4PanelOpen(true);
  };

  const handleCtxAddrSearch4 = () => {
    const row = ctxFare4Target;
    const pickupKw = ctxAddrPickup4.trim();
    const dropKw = ctxAddrDrop4.trim();
    if (!pickupKw || !dropKw) { showAlert("상차지역과 하차지역을 입력해주세요."); return; }

    const targetGroup = row ? getVehicleGroup(row.차량종류) : "general";
    const targetClient = row ? String(row.거래처 || "").trim() : "";
    const _todayKstAddr4 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const matchDir = (pk, dk) => (historyDispatchData || []).filter(r => {
      if ((r.상차일 || "").slice(0, 10) === _todayKstAddr4) return false;
      if (!r.청구운임) return false;
      const rPickup = String(r.상차지명 || "") + " " + String(r.상차지주소 || "");
      const rDrop = String(r.하차지명 || "") + " " + String(r.하차지주소 || "");
      if (!rPickup.includes(pk)) return false;
      if (!rDrop.includes(dk)) return false;
      const rGroup = getVehicleGroup(r.차량종류);
      if (rGroup !== targetGroup) return false;
      if (!ctxAddrAllClients4 && targetClient && String(r.거래처 || "").trim() !== targetClient) return false;
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
      setCtxAddrResults4([]);
      showAlert("해당 조건의 운임 이력이 없습니다.");
      return;
    }

    const scored = base.map(r => ({
      ...r,
      _score: row ? scoreCtxFareRow(r, row) : 0,
      _match: {
        cargo: row && String(row.화물내용 || "").trim() && r.화물내용 && r.화물내용.includes(String(row.화물내용 || "").trim()),
        ton: row && getTotalTonFromOrder(row) != null && getTotalTonFromOrder(r) === getTotalTonFromOrder(row),
      },
      _time: r.updatedAt || r.등록일 || 0,
      _reverseRoute: reversedMatch,
    }));
    scored.sort((a, b) => b._score !== a._score ? b._score - a._score : b._time - a._time);

    const fares = scored.map(r => Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")));
    setCtxFare4Result({
      records: scored,
      count: fares.length,
      avg: Math.round(fares.reduce((a, b) => a + b, 0) / fares.length),
      min: Math.min(...fares),
      max: Math.max(...fares),
    });
    setCtxAddrResults4(scored);
    setCtxAddrSearch4Open(false);
    setCtxFare4PanelOpen(true);
    if (reversedMatch) {
      showAlert(`"${pickupKw} → ${dropKw}" 노선 이력은 없어, 반대 노선 "${dropKw} → ${pickupKw}" 이력 ${scored.length}건을 표시합니다.`);
    }
  };

  // 🔵 동일 노선 추천 리스트
  const [similarOrders, setSimilarOrders] = React.useState([]);
  // ----------------------------
  // 🔥 수정모드 + 수정중 데이터 복원
  // ----------------------------
  React.useEffect(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("realtimeEdit") || "{}") || {}; } catch { saved = {}; } // 🛡 2026-11-24 저장값이 깨져 있어도 화면이 멈추지 않게

    // ⚠️ selectedEditMode(구 "선택수정" 인라인 편집 모드)는 더 이상 UI에서 켤 방법이
    // 없다(해당 버튼/저장 로직이 이미 제거됨) — 그런데도 예전 버전에서 localStorage에
    // true로 저장된 값이 남아있으면 새로고침할 때마다 계속 복원되어, 그 안에 들어있던
    // 행(들)만 영구히 "수정 모드" 셀(예: 하차지주소가 더보기 없이 원문 그대로 보이는
    // input)로 렌더링되는 버그가 있었다 — 이 값은 아예 복원하지 않는다.
    if (Array.isArray(saved.selected)) setSelected(saved.selected);
    if (saved.edited) setEdited(saved.edited);
  }, []);
  // ----------------------------
  // 🔥 수정모드 + 선택된행 + 수정값 자동 저장
  // ----------------------------
React.useEffect(() => {
  try {
    const compactEdited = Object.fromEntries(
      Object.entries(edited).map(([id, v]) => [
        id,
        {
          전달사항: v.전달사항,
          차량번호: v.차량번호,
        },
      ])
    );
    localStorage.setItem(
      "realtimeEdit",
      JSON.stringify({
        selectedEditMode,
        selected,
        edited: compactEdited,
      })
    );
  } catch (e) {
    console.warn("⚠ localStorage 초과 - 저장 중단");
  }
}, [selectedEditMode, selected, edited]);
  // ==========================
  // 🆕 신규 오더 거래처 자동완성 상태
  // ==========================
  const [newClientOptions, setNewClientOptions] = React.useState([]);
  const [showNewClientDropdown, setShowNewClientDropdown] = React.useState(false);
  const [newClientActiveIndex, setNewClientActiveIndex] = React.useState(0);

  // 신규 오더 등록 팝업
  const [showCreate, setShowCreate] = React.useState(false);
  const [fareResult, setFareResult] = React.useState(null);
  const [fareSortMode, setFareSortMode] = React.useState("relevance");
  const [autoList, setAutoList] = React.useState([]);


  const [newOrder, setNewOrder] = React.useState({
    상차일: "",
    상차_AMPM: "",
    상차시간: "",
    상차시간기준: "",
    하차일: "",
    하차_AMPM: "",
    하차시간: "",
    하차시간기준: "",
    거래처명: "",
    상차지명: "",
    상차지주소: "",
    경유지_상차: [],
    하차지명: "",
    하차지주소: "",
    경유지_하차: [],
    화물내용: "",
    차량종류: "",
    차량톤수: "",
    상차방법: "",
    하차방법: "",
    청구운임: "",
    기사운임: "",
    지급방식: "",
    배차방식: "",
    메모: "",
    메모중요도: "NORMAL",
    운행유형: "편도",
    혼적: false,
    독차: false,
    긴급: false,
  });
  // ⭐ 운임조회·운임계산·동일노선 추천은 예전 오더 전체가 필요 — 수정/복사/운임조회 창을 열거나
  // 신규 오더에 상·하차지를 입력하면 1회 불러온다(평소 현황 화면은 최근 범위만)
  useLoadFullOrderHistory(!!(editTarget || copyTarget || ctxFare4Target || (newOrder?.상차지명 && newOrder?.하차지명)));
  // ==========================
  // 🆕 신규 오더 상/하차지 자동완성 상태
  // ==========================
  const [newPlaceOptions, setNewPlaceOptions] = React.useState([]);
  const [showNewPlaceDropdown, setShowNewPlaceDropdown] = React.useState(false);
  const [newPlaceType, setNewPlaceType] = React.useState(null); // "pickup" | "drop"
  const [newPlaceActiveIndex, setNewPlaceActiveIndex] = React.useState(0);
  const newPlaceListRef = React.useRef(null);

  React.useEffect(() => {
    if (!newPlaceListRef.current) return;

    const list = newPlaceListRef.current;
    const item = list.children[newPlaceActiveIndex];
    if (!item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    // ⬇️ 아래로 벗어남
    if (itemBottom > viewBottom) {
      list.scrollTop = itemBottom - list.clientHeight;
    }

    // ⬆️ 위로 벗어남
    if (itemTop < viewTop) {
      list.scrollTop = itemTop;
    }
  }, [newPlaceActiveIndex]);

  // 🔥 신규 오더 입력 변경 처리
  const handleChange = (key, value) => {
    setNewOrder(prev => ({ ...prev, [key]: value }));
  };

  // 삭제된 건 재등장 방지
  const [deletedIds, setDeletedIds] = React.useState(() => new Set());

// 하이라이트
  const [highlightIds, setHighlightIds] = React.useState(() => new Set());

  const flashRow = React.useCallback((id) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`row-${id}`);
      if (!el) return;
      el.classList.remove('row-highlight');
      // 강제 동기 reflow(offsetWidth 읽기) 대신 다음 프레임으로 미뤄 애니메이션을 재시작한다 —
      // 저장 직후 큰 표를 다시 그리는 시점과 겹치면 동기 reflow가 눈에 띄는 끊김을 유발했다.
      requestAnimationFrame(() => {
        el.classList.add('row-highlight');
        setTimeout(() => el.classList.remove('row-highlight'), 2500);
      });
    });
  }, []);

  // 삭제 시 스르륵 사라지는 페이드아웃 + 화주사 수정요청 승인/거절 팝업
  const [fadingIds, setFadingIds] = React.useState(() => new Set());
  const fadeOutThenDelete = (id, deleteFn) => {
    setFadingIds(prev => new Set(prev).add(id));
    setTimeout(() => { deleteFn(); }, 280);
  };
  const [editReqPopup, setEditReqPopup] = React.useState(null);
  const [cancelReqPopup, setCancelReqPopup] = React.useState(null);

  // 신규기사 등록 중복 방지
  const [isRegistering, setIsRegistering] = React.useState(false);
  // =================== 기사 선택 모달 상태 ===================
  const [driverSelectInfo, setDriverSelectInfo] = React.useState(null);
  /*
  {
    rowId,
    list: [],
    selectedDriver: null
  }
  */


  // 주소 더보기
  const [expandedAddr, setExpandedAddr] = React.useState({});
  const [addrPopup, setAddrPopup] = React.useState(null);
  // 화물내용 더보기 (5파트 배차현황과 동일하게 길면 잘라서 팝업으로 전체 확인)
  const [cargoPopup, setCargoPopup] = React.useState(null);

  // 상차 임박 경고
  const [warningList, setWarningList] = React.useState([]);
  const [warningExpanded, setWarningExpanded] = React.useState(false);
  const [urgentPopup, setUrgentPopup] = React.useState([]);
  const urgentTimerRef = React.useRef(null);
  const [snoozeRecheckTrigger, setSnoozeRecheckTrigger] = React.useState(0);
  // 세션 내 dismiss 된 ID Set (localStorage 실패해도 재출현 방지)
  const urgentDismissedRef = React.useRef(new Set());
  // 첨부파일 개수
const [attachCount, setAttachCount] = React.useState({});
  const [attachViewer, setAttachViewer] = React.useState(null); // 열린 행
  const [liveLocViewer, setLiveLocViewer] = React.useState(null); // 실시간 위치 팝업이 열린 행
  const [orderInfoRow4, setOrderInfoRow4] = React.useState(null);
  const [workDatesEditRow, setWorkDatesEditRow] = React.useState(null); // 근무일(묶음) 수정 팝업이 열린 행
  // ------------------------
// Firestore → rows 반영
// ------------------------
React.useEffect(() => {
  const relevantDates = new Set([yesterdayKST(), todayKST(), tomorrowKST()]);
  const base = (dispatchData || []).filter(
    (r) => !!r && !deletedIds.has(r._id) && r?.상차일 && relevantDates.has(r.상차일)
  );

  React.startTransition(() => {
    setRows((prev) => {
      const map = new Map(base.map((r) => [r._id, r]));
      // prev.some(...) 안에 있던 O(n·m) 선형 탐색을 Set 조회(O(1))로 교체 —
      // 오더 수가 많을 때 화주사 수정요청/취소요청 같은 잦은 쓰기마다 매번
      // 전체 목록을 다시 스캔하며 버벅이던 원인 중 하나였다.
      const prevIds = new Set(prev.map((p) => p._id));

      // dispatchData의 원본 행 참조가 지난번과 동일하면(=그 오더는 실제로 안 바뀜)
      // 새 객체를 만들지 않고 기존 참조를 그대로 재사용한다. 예전에는 여기서 매번
      // 모든 행을 새 객체로 spread해서, 배차 하나만 바뀌어도(배차완료/저장 등)
      // 아래 waypoint 가공(useMemo)이 목록 전체를 다시 계산하며 그때마다 화면이
      // 버벅이던 원인이었다 — 배차완료 배너가 뜰 때, 수정패널 저장 후 특히 심했다.
      const kept = prev
        .filter((r) => map.has(r._id))
        .map((r) => {
          const next = map.get(r._id);
          if (r.__raw === next) return r;
          return { ...r, ...next, __raw: next };
        });

      const newOnes = base
        .filter((r) => !prevIds.has(r._id))
        .map((r) => ({ ...r, __raw: r }));

      const merged = [...kept, ...newOnes];

      return sortDispatchRows(merged);
    });
    if (!ready) setReady(true);
  });
}, [dispatchData, deletedIds]);

// 🔥 rows 갱신 후 edited 데이터 반영
React.useEffect(() => {
  if (!Object.keys(edited).length) return;

  setRows((prev) =>
    prev.map((r) =>
      edited[r._id]
        ? {
            ...r,
            ...edited[r._id],
          }
        : r
    )
  );
}, [edited]);
  // ========================
  // 🔔 파일 업로드 감지
  // liveDataReady가 false인 동안(=아직 localStorage 캐시로 그려진 화면일 뿐, orders/dispatch
  // 리스너의 진짜 첫 응답을 못 받은 상태)에는 prevAttachRef를 절대 건드리지 않는다.
  // 캐시값을 기준선으로 학습해버리면, 꺼둔 PC를 다시 켰을 때 그 사이 쌓인 실제 업로드
  // 전부가 "방금 새로 늘어난 것"으로 오인되어 알림이 한꺼번에 쏟아진다.
  const liveAlertBaselineSetRef = React.useRef(false);
  React.useEffect(() => {
    if (!liveDataReady) return;
    if (!rows.length) return;

    // liveDataReady가 막 true가 된 뒤 첫 실행: 알림 없이 기준선만 세운다.
    const isFirstRealPass = !liveAlertBaselineSetRef.current;
    liveAlertBaselineSetRef.current = true;

    const newAlerts = [];

    rows.forEach(r => {
      const id = r._id;
      const cur = r.attachCount || 0;
      const prev = prevAttachRef.current[id] ?? cur; // 첫 로드 시 현재값으로 초기화
      const viewed = viewedAttachRef.current[id] || 0;

      // 이전보다 증가 + 아직 열어보지 않은 개수 (기준선을 막 세우는 첫 실행에는 알리지 않는다)
      if (!isFirstRealPass && cur > prev && cur > viewed) {
        newAlerts.push({
          id,
          date: r.상차일,
          from: r.상차지명,
          to: r.하차지명,
          driver: r.이름,
          count: cur - prev,
          total: cur,
          time: Date.now(),
          // ⭐ time(ms)만으로 key/삭제를 구분하면, 같은 tick에 여러 건이 한꺼번에
          // 감지될 때(예: 검색 결과 여러 건이 비슷한 시점에 갱신) time 값이 겹쳐서
          // "X" 눌러 하나만 닫으려 해도 같은 time을 가진 다른 알림까지 같이 필터링
          // 되거나, React key 중복으로 클릭이 엉뚱한 토스트에 먹히는 문제가 있었다.
          uid: `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          row: r, // 클릭 시 뷰어 열기용
        });

        // 알림음
        playNotifSound();
      }

      prevAttachRef.current[id] = cur;
    });

    if (newAlerts.length > 0) {
      setUploadAlerts(prev => [...prev, ...newAlerts]);
      // 10초 후 자동 제거
      setTimeout(() => {
        setUploadAlerts(prev => prev.filter(a => Date.now() - a.time < 10000));
      }, 10000);
    }
  }, [rows, liveDataReady]);
// ------------------------
// 오전/오후 → 24시간 변환
// ------------------------
const normalizeTime = (t) => {
  if (!t) return "";

  let s = String(t).trim();

  // "오후 4시30분" → "오후 4:30"
  s = s.replace("시 ", ":")
       .replace("시", ":")
       .replace("분", "");

  // "오후 4:" → "오후 4:00"
  if (/:\s*$/.test(s)) s += "00";

  if (/^\d{1,2}:\d{2}$/.test(s)) {
    return s.padStart(5, "0");
  }

  const m = s.match(/(오전|오후)\s*(\d{1,2}):?(\d{2})?/);
  if (!m) return "";

  let [, ampm, hh, mm] = m;

  mm = mm ?? "00";
  hh = parseInt(hh, 10);

  if (ampm === "오후" && hh < 12) hh += 12;
  if (ampm === "오전" && hh === 12) hh = 0;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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

  // ------------------------
  // 상차 임박 경고 (오전·오후 지원)
  // ------------------------
  React.useEffect(() => {
    if (!rows.length) {
      setWarningList([]);
      return;
    }

    const now = new Date();
    const temp = [];

    rows.forEach((r) => {
      if (r.차량번호 && String(r.차량번호).trim() !== "") return;
      if (!r.상차일 || !r.상차시간) return;

      const t24 = normalizeTime(r.상차시간);
      if (!t24) return;

      const dt = new Date(`${r.상차일}T${t24}:00`);
      if (isNaN(dt.getTime())) return;

      const diff = dt.getTime() - now.getTime();
      if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
        temp.push(r);
      }
    });

    setWarningList(temp);
  }, [rows]);
React.useEffect(() => {
  // 실시간배차현황 탭에 있을 때만 팝업 체크 (다른 탭에서 미리 세팅되어 진입 시 뜨는 문제 방지)
  if (menu !== "실시간배차현황") return;
  if (!rows.length) return;
  const now = new Date();
  const email = auth.currentUser?.email || "guest";
  let seen = [];
  let snoozed = {};
  try { seen = JSON.parse(localStorage.getItem(`urgentSeen_${email}`) || "[]"); } catch {}
  try { snoozed = JSON.parse(localStorage.getItem(`urgentSnoozed_${email}`) || "{}"); } catch {}

  const urgent = rows.filter((r) => {
    if (r.배차상태 !== "배차중") return false;
    if (!r.상차일 || !r.상차시간) return false;
    const t24 = normalizeTime(r.상차시간);
    if (!t24) return false;
    const dt = new Date(`${r.상차일}T${t24}:00`);
    const diff = dt.getTime() - now.getTime();
    return diff > 0 && diff <= 30 * 60 * 1000;
  });

  if (!urgent.length) return;

  const newOnes = urgent.filter((r) => {
    if (!r._id) return false;
    // 모듈 레벨 Set 체크 (컴포넌트 재마운트 후에도 유지)
    if (_urgentDismissed.has(r._id)) return false;
    if (seen.includes(r._id)) return false;
    const until = snoozed[r._id];
    if (until && now.getTime() < until) return false;
    return true;
  });

  if (newOnes.length > 0) {
    setUrgentPopup(newOnes);
    playNotifSound();
  }
}, [rows, snoozeRecheckTrigger, menu]);

const handleUrgentDismiss = () => {
  const email = auth.currentUser?.email || "guest";
  const ids = urgentPopup.map((r) => r._id).filter(Boolean);
  // 모듈 레벨 Set + ref 모두에 등록 (재마운트 후에도, localStorage 실패해도 재출현 방지)
  ids.forEach((id) => { _urgentDismissed.add(id); urgentDismissedRef.current.add(id); });
  try {
    const seen = JSON.parse(localStorage.getItem(`urgentSeen_${email}`) || "[]");
    const updated = [...new Set([...seen, ...ids])];
    localStorage.setItem(`urgentSeen_${email}`, JSON.stringify(updated.slice(-500)));
  } catch {}
  setUrgentPopup([]);
};

const handleUrgentSnooze = (minutes) => {
  const email = auth.currentUser?.email || "guest";
  const snoozedKey = `urgentSnoozed_${email}`;
  const until = Date.now() + minutes * 60 * 1000;
  const ids = urgentPopup.map((r) => r._id).filter(Boolean);
  // 스누즈 기간 동안 세션 메모리에도 등록 (스누즈 만료 시 재확인 트리거로 제거)
  ids.forEach((id) => { _urgentDismissed.add(id); urgentDismissedRef.current.add(id); });
  try {
    const snoozed = JSON.parse(localStorage.getItem(snoozedKey) || "{}");
    ids.forEach((id) => { snoozed[id] = until; });
    localStorage.setItem(snoozedKey, JSON.stringify(snoozed));
  } catch {}
  setUrgentPopup([]);
  if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
  urgentTimerRef.current = setTimeout(() => {
    // 스누즈 만료: 모듈 Set과 ref 모두에서 제거 후 재확인
    ids.forEach((id) => { _urgentDismissed.delete(id); urgentDismissedRef.current.delete(id); });
    setSnoozeRecheckTrigger((n) => n + 1);
  }, minutes * 60 * 1000);
};
  // (미사용 '동일 노선 추천'/'운임조회' 함수 제거 — 정의되지 않은 orderBy·setFareOpen을 참조하던 죽은 코드)

  // ------------------------
  // 숫자 변환
  // ------------------------
  const toInt = (v) => fkNum(v); // 🛠 2026-11-25 수수료 칩(profitTotals)과 같은 금액 읽기(소수점 반올림)
  const formatComma = (n) => {
    const v = toInt(n);
    return v.toLocaleString();
  };

  // ------------------------
  // 차량번호 정규화
  // ------------------------
  const normalizePlate = React.useCallback(
    (s) =>
      String(s || "").replace(/\s+/g, "").replace(/[-.]/g, "").trim(),
    []
  );
  // ------------------------
  // 신규 등록 팝업 차량번호 입력
  // ------------------------
  const handlePopupCarInput = async (e) => {
    if (e.key !== "Enter") return;  // 엔터 아니면 반응 X

    const rawVal = e.target.value;
    const plate = normalizePlate(rawVal);

    // 🔥 차량번호를 모두 지운 경우 → 이름/전화번호도 초기화
    if (!plate) {
      setNewOrder((prev) => ({
        ...prev,
        차량번호: "",
        이름: "",
        전화번호: "",
      }));
      return;
    }

    // 🔍 기존 기사 자동 매칭
    const match = (drivers || []).find(
      (d) => normalizePlate(d.차량번호) === plate
    );

    if (match) {
      // 🔥 기존 기사면 자동 등록
      setNewOrder((prev) => ({
        ...prev,
        차량번호: rawVal,
        이름: match.이름,
        전화번호: match.전화번호,
      }));
      return;
    }

    // ---------------------------
    // 🔥 신규 기사 등록
    // ---------------------------
    const ok = await kpConfirm(
      `차량번호 [${rawVal}] 기사 정보가 없습니다.\n신규 기사로 등록할까요?`
    );
    if (!ok) return;

    const 이름 = (await kpPrompt("신규 기사 이름을 입력하세요"));
    if (!이름) return;

    const 전화번호 = (await kpPrompt("전화번호를 입력하세요"));
    if (!전화번호) return;

    // Firestore 신규 기사 저장
    await upsertDriver?.({
      _id: crypto.randomUUID(), // 신규 기사 강제 생성!
      차량번호: rawVal,
      이름,
      전화번호,
    });

    // 신규 기사 정보 입력창에 반영
    setNewOrder((prev) => ({
      ...prev,
      차량번호: rawVal,
      이름,
      전화번호,
    }));

    showAlert("신규 기사가 등록되었습니다.");
  };
  // ------------------------
// driverMap 생성  ← 🔥 여기!
// ------------------------
const driverMap = React.useMemo(() => {
  const m = new Map();
  (drivers || []).forEach((d) => {
    const k = normalizePlate(d.차량번호);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(d);
  });
  return m;
}, [drivers, normalizePlate]);
  // =====================
  // 🔑 거래처명 통합 normalize (정렬/검색/자동완성 공용)
  // =====================
  const normalizeClient = (s = "") =>
    String(s)
      .normalize("NFC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width 제거
      .replace(/\u00A0/g, " ")               // NBSP
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/주식회사|유한회사|\(주\)|㈜/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[0-9]/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");
// ===== 스마트 기사 검색 (PART 4) =====
const [smartQ4, setSmartQ4] = React.useState("");
const [smartList4, setSmartList4] = React.useState([]);
const [smart4ActiveIdx, setSmart4ActiveIdx] = React.useState(-1);
const [smart4ConflictPopup, setSmart4ConflictPopup] = React.useState(null);

const parseDriverText4 = (text) => {
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
const nd4 = (s="") => String(s).replace(/[-.\s]/g,"").toLowerCase();

const handleSmart4Input = (text) => {
  setSmartQ4(text);
  setSmart4ActiveIdx(-1);
  if (!text.trim()) { setSmartList4([]); return; }
  const { phone, plate, name } = parseDriverText4(text);
  const q = nd4(text);
const results = plate
  ? (drivers||[])
      .filter(d => nd4(d.차량번호) === nd4(plate))
      .sort((a, b) => {
        const aExact = nd4(a.이름) === nd4(name) && nd4(a.전화번호) === nd4(phone);

        const bExact = nd4(b.이름) === nd4(name) && nd4(b.전화번호) === nd4(phone);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      })
  : (name && name.length >= 2)
  ? (drivers||[]).filter(d => d.이름 && d.이름.includes(name))
  : [];
setSmartList4(results.slice(0,8));
};
// 스마트검색 드롭다운 항목 선택 공통 처리 (마우스 클릭 / 방향키+엔터 공용)
const selectSmart4Driver = (d, setTarget) => {
  // ⚠️ 드롭다운 추천 항목을 고르는 이 경로는 예전엔 검사 없이 무조건 DB에 저장된
  // 기존 번호로 덮어썼다 — applySmart4(엔터/포커스아웃 경로)에 있는 "⚠️ 기사 정보
  // 확인" 충돌 팝업을 이 경로에도 동일하게 연결해, 검색창에 입력해둔 번호가 DB
  // 번호와 다르면 조용히 덮어쓰지 않고 사용자가 직접 선택하게 한다.
  const { phone: typedPhone } = parseDriverText4(smartQ4);
  if (typedPhone && nd4(d.전화번호) !== nd4(typedPhone)) {
    setSmartQ4(""); setSmartList4([]); setSmart4ActiveIdx(-1);
    setSmart4ConflictPopup({ existing: d, input: { plate: d.차량번호, name: d.이름, phone: typedPhone }, setTarget });
    return;
  }
  const gr = d?.등급 || d?.grade || "";
  if (gr === "블랙") setBlackAlert(d);
  else if (shouldShowDriverMemoAlert(d)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: d }));
  setTarget(p => ({ ...p, 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호), 배차상태: "배차완료" }));
  setSmartQ4(""); setSmartList4([]); setSmart4ActiveIdx(-1);
};
// 스마트검색 입력창 공용 방향키 핸들러 — ↑/↓ 이동, Enter 선택, Esc 닫기
const handleSmart4KeyDown = (e, target, setTarget) => {
  if (smartList4.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    setSmart4ActiveIdx(prev => {
      const next = e.key === "ArrowDown" ? prev + 1 : prev - 1;
      if (next < 0) return smartList4.length - 1;
      if (next >= smartList4.length) return 0;
      return next;
    });
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (smartList4.length > 0 && smart4ActiveIdx >= 0 && smart4ActiveIdx < smartList4.length) {
      selectSmart4Driver(smartList4[smart4ActiveIdx], setTarget);
    } else {
      applySmart4(target, setTarget, smartQ4);
    }
    return;
  }
  if (e.key === "Escape" && smartList4.length > 0) {
    e.preventDefault();
    setSmartList4([]); setSmart4ActiveIdx(-1);
  }
};

const [newDriverModalOpen, setNewDriverModalOpen] = React.useState(false);
const [newDriverModalData, setNewDriverModalData] = React.useState(null);
const openNewDriverModal = (차량번호, onConfirm) => {
  const existing = (drivers || []).filter(d =>
    (d.차량번호 || "").replace(/\s/g, "") === (차량번호 || "").replace(/\s/g, "")
  );
  if (existing.length > 0) {
    setNewDriverModalData({ 차량번호, mode: "duplicate", existingDriver: existing[0], onConfirm });
  } else {
    setNewDriverModalData({ 차량번호, mode: "new", existingDriver: null, onConfirm });
  }
  setNewDriverModalOpen(true);
};

const applySmart4 = async (target, setTarget, text) => {
  if (!text.trim()) return;
  const { phone, plate, name } = parseDriverText4(text);
  if (!plate && !name && !phone) return;
  const byPlate = plate ? (drivers||[]).filter(d => nd4(d.차량번호)===nd4(plate)) : [];
 if (byPlate.length > 0) {
    const ex = byPlate[0];
    const sameName = nd4(ex.이름) === nd4(name);
    const samePhone = nd4(ex.전화번호) === nd4(phone);
    if (sameName && samePhone) {
      const grade = ex?.등급||ex?.grade||"";
      if (grade==="블랙") setBlackAlert(ex);
      setTarget(p=>({...p, 차량번호:ex.차량번호, 이름:ex.이름, 전화번호:formatPhone(ex.전화번호), 배차상태:"배차완료"}));
      setSmartQ4(""); setSmartList4([]);
    } else if (!sameName && name) {
      setSmart4ConflictPopup({ existing: ex, input: { plate, name, phone }, setTarget });
    } else if (sameName && !samePhone) {
      setSmart4ConflictPopup({ existing: ex, input: { plate, name, phone }, setTarget });
    } else {
      // 이름 파싱 안 됨 등 → 기존 기사 정보 사용
      const grade = ex?.등급||ex?.grade||"";
      if (grade==="블랙") setBlackAlert(ex);
      setTarget(p=>({...p, 차량번호:ex.차량번호, 이름:ex.이름, 전화번호:formatPhone(ex.전화번호), 배차상태:"배차완료"}));
      setSmartQ4(""); setSmartList4([]);
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
      setSmartQ4(""); setSmartList4([]);
      return;
    }
    // ⚠️ 여기서는 기사관리(Firestore)에 즉시 저장하지 않는다.
    // 패널을 저장하지 않고 닫으면 신규 기사 정보가 남으면 안 되므로,
    // 실제 저장은 패널의 저장 버튼(오더 저장 시점)에서만 이루어져야 한다.
    setTarget(p=>({...p, 차량번호:plate, 이름:name, 전화번호:formatPhone(phone), 배차상태:"배차완료"}));
  }
  setSmartQ4(""); setSmartList4([]);
};

  // ==========================================
  // 🚚 기사 확인 모달 상태 + 적용 함수 추가 (START)
  // ==========================================
const [driverConfirmOpen, setDriverConfirmOpen] = React.useState(false);
const [driverConfirmInfo, setDriverConfirmInfo] = React.useState(null);
const [driverConfirmRowId, setDriverConfirmRowId] = React.useState(null);
const [quickRegMode, setQuickRegMode] = React.useState(false);
const [quickRegName, setQuickRegName] = React.useState("");
const [quickRegPhone, setQuickRegPhone] = React.useState("");
const driverPanelCallbackRef = React.useRef(null);
  // 모달 포커스용
  const modalRef = useRef(null);

  // 🔥 팝업 뜰 때 자동 포커스
  useEffect(() => {
    if (driverConfirmOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [driverConfirmOpen]);

  // 🔥 팝업 뜬 상태에서 엔터 누르면 자동 적용
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!driverConfirmOpen) return;
      if (e.key === "Enter") {
        confirmDriverApply();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [driverConfirmOpen, driverConfirmInfo]);

  const confirmDriverApply = () => {
    if (!driverConfirmRowId || !driverConfirmInfo) return;
    const id = driverConfirmRowId;
    const updated = {
      차량번호: driverConfirmInfo.차량번호,
      이름: driverConfirmInfo.이름,
      전화번호: driverConfirmInfo.전화번호,
      배차상태: "배차완료",
      updatedAt: Date.now(),
    };

    // ✅ 팝업 먼저 닫기
    setDriverConfirmOpen(false);
    setDriverConfirmInfo(null);
    setDriverConfirmRowId(null);

    // ✅ 낙관적 업데이트
    setRows(prev => prev.map(r => r._id === id ? { ...r, ...updated } : r));

    // ✅ 백그라운드 저장 (약간 지연해 re-render 후 write)
    setTimeout(() => patchDispatch(id, updated).catch(console.error), 150);
  };
  // ------------------------
  // 📌 차량번호 입력(auto-match + 신규기사 등록)
  // ------------------------
  const carClearAskRef = React.useRef(new Set()); // 차량번호 지우기 확인창이 떠 있는 줄
  const handleCarInput = async (id, rawVal, keyEvent) => {
  if (keyEvent && keyEvent.key === "Enter") {
    keyEvent.preventDefault();
    keyEvent.stopPropagation();
  }

  if (isRegistering) return;
  if (carClearAskRef.current.has(id)) return; // 묻는 창이 떠서 칸에서 포커스가 빠질 때(onBlur) 한 번 더 불리는 것 막기

  const v = normalizePlate(rawVal);
  const idx = rows.findIndex((r) => r._id === id);
  if (idx === -1) return;

  const oldRow = rows[idx];

  // 값이 변경되지 않았고 이미 기사 정보가 있으면 팝업 불필요
  if (v && v === normalizePlate(oldRow.차량번호) && (oldRow.이름 || oldRow.전화번호)) return;

  // 차량번호 삭제 → 기사 정보 초기화
  if (!v) {
    // ✅ 2026-11-23 저장돼 있던 차량번호를 지울 때만 묻기(사용자 요청) — 취소하면 원래 차량번호 · 기사로 되돌린다
    //  · 입력하는 동안 rows가 같이 바뀌므로 원래 값은 dispatchData에서 찾는다
    const orig = (dispatchData || []).find((r) => r._id === id);
    if (orig && String(orig.차량번호 || "").trim()) {
      carClearAskRef.current.add(id);
      const ok = await kpConfirm("수정하시겠습니까?", { okText: "저장" });
      carClearAskRef.current.delete(id);
      if (!ok) {
        setRows((prev) => prev.map((r) => (r._id === id ? { ...r, 차량번호: orig.차량번호 || "", 이름: orig.이름 || "", 전화번호: orig.전화번호 || "", 배차상태: orig.배차상태 || r.배차상태 } : r)));
        return;
      }
    }
    const updated = {
      차량번호: "",
      이름: "",
      전화번호: "",
      배차상태: "배차중",
      updatedAt: Date.now(),
    };
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, ...updated } : r))
    );
    // 약간 지연해 UI render 후 Firestore write (즉각 write → onSnapshot → 전체 re-render 방지)
    setTimeout(() => patchDispatch?.(id, updated), 150);
    return;
  }

  const matches = driverMap.get(v) || [];

  // 🔹 기존 기사 1명 매칭
  if (matches.length === 1) {
    const match = matches[0];
    // 메모/블랙 즉시 팝업
    const g3 = match?.등급 || match?.grade || "";
    if (g3 !== "블랙" && shouldShowDriverMemoAlert(match)) {
      window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: match }));
    }
    const existingName = (oldRow.이름 || "").trim();
    const existingPhone = (oldRow.전화번호 || "").replace(/[^\d]/g, "");
    const matchPhone = (match.전화번호 || "").replace(/[^\d]/g, "");

    // ★★★ 핵심: 현재 행에 기사정보가 있고, DB 기사와 다른 경우 → 불일치 팝업
    if (
      existingName &&
      (existingName !== match.이름 || existingPhone !== matchPhone)
    ) {
      setDriverConfirmInfo({
        이름: match.이름,
        차량번호: rawVal,
        전화번호: match.전화번호,
        // ★ 불일치 관련 추가 정보
        type: "mismatch",
        currentName: existingName,
        currentPhone: oldRow.전화번호 || "",
      });
      setDriverConfirmRowId(id);
      setDriverConfirmOpen(true);
      return;
    }

    // 기존과 동일하거나 행에 기사정보 없음 → 일반 확인 팝업
    setDriverConfirmInfo({
      이름: match.이름,
      차량번호: rawVal,
      전화번호: match.전화번호,
    });
    setDriverConfirmRowId(id);
    setDriverConfirmOpen(true);
    return;
  }

  // 🔹 기존 기사 여러 명 → 기사 선택 모달
  if (matches.length > 1) {
    setDriverSelectInfo({
      rowId: id,
      list: matches,
      selectedDriver: null,
    });
    return;
  }

  // 🔹 신규 기사 → 팝업
  setDriverConfirmInfo({
    이름: "",
    차량번호: rawVal,
    전화번호: "",
    type: "new",
  });
  setDriverConfirmRowId(id);
  setDriverConfirmOpen(true);
  return;
};


  // 🔽 정렬 — ⭐ "정렬/필터" 팝업은 없앴고, 표 머리글(컬럼명)을 누르면 바로 정렬된다
  // (▲오름 → ▼내림 → 해제). 이 브라우저에만 기억하고 Firestore에는 저장하지 않는다.
  const rtSort = useTableSort("realtime");
  // ⭐ 검색 항목 선택(통합/거래처명/상차지명…) — 배차현황 검색창과 똑같이
  const [rtSearchType, setRtSearchType] = React.useState("all");
  const rtBiz = useCompanyBiz(getTenant() || userCompany); // ⭐ 2026-11-03 여러 사업자
  const [rtDetail, setRtDetail] = React.useState(null); // 🔎 세부검색(기간 없음 — 실시간)
  const rtDetailGet = useDetailGetters(userNameMap, userCompany);
  const rtDayRows = React.useMemo(() => { const t = dayMode === "yesterday" ? yesterdayKST() : dayMode === "tomorrow" ? tomorrowKST() : todayKST(); return rows.filter((r) => r.상차일 === t); }, [rows, dayMode]);

  // 경유지 가공(dedup) 결과 캐시 — 행 객체 참조가 이전과 동일하면(=그 오더는 안 바뀜)
  // 다시 계산하지 않고 재사용한다. rows의 행 참조가 안정적으로 유지되므로
  // (위 Firestore → rows 반영 useEffect 참고) 배차 하나만 바뀌어도 목록 전체를
  // 다시 가공하며 버벅이던 문제를 줄여준다.
  const waypointCacheRef = React.useRef(new WeakMap());

  // ------------------------
  // 📌 필터 + 검색 + 정렬
  // ------------------------
  const filteredBase = React.useMemo(() => {
    let data = [...rows];

    let targetDate = todayKST();
    if (dayMode === "yesterday") targetDate = yesterdayKST();
    if (dayMode === "tomorrow") targetDate = tomorrowKST();

    // 🔒 실시간배차현황은 하루만 조회
    data = data.filter((r) => r.상차일 === targetDate);
    if (rtDetail) data = applyDetailFilter(data, rtDetail, { getters: rtDetailGet, withDate: false }); // 🔎 세부검색
    // 🔎 상태 필터 적용
    if (statusFilter === "UNASSIGNED") {
      data = data.filter(r => r.배차상태 !== "배차완료");
    }

    if (statusFilter === "ASSIGNED") {
      data = data.filter(r => r.배차상태 === "배차완료");
    }

    if (statusFilter === "URGENT") {
      data = data.filter(
        r => r.긴급 === true && r.배차상태 !== "배차완료"
      );
    }

    if (statusFilter === "UNDELIVERED") {
      data = data.filter(
        r => r.업체전달상태 !== "전달완료"
      );
    }

    // 검색 — 예전에는 row 객체의 모든 필드(Object.values)를 통째로 훑어서, id/history/
    // 내부 플래그 등 화면에 보이지도 않는 값에 검색어가 우연히 포함되기만 해도 전혀
    // 상관없는 오더가 결과에 섞여 나왔다(배차현황/5파트는 이미 아래처럼 실제 표시되는
    // 필드만 검색해 이 문제가 없었다). 사용자가 보고 검색할 만한 필드로만 제한한다.
    if (q.trim()) {
      const key = q.toLowerCase();
      const get = (v) => String(v || "").toLowerCase();
      // ⭐ 검색 항목(통합 ▾) — 배차현황과 같은 동작
      const field = ORDER_SEARCH_FIELD[rtSearchType];
      // ⭐ 2026-11-03 거래처·상차지·하차지는 정확히 같은 이름이 있으면 그것만(하나 → 하나상운·하나물류 제외)
      const nameM = ["거래처명", "상차지명", "하차지명"].includes(field) ? makeClientMatcher(q, data.map((r) => r[field])) : null;
      data = field
        ? data.filter((r) => (nameM ? nameM(r[field]) : get(r[field]).includes(key)))
        : data.filter((r) =>
            get(r.거래처명).includes(key) ||
            get(r.상차지명).includes(key) ||
            get(r.하차지명).includes(key) ||
            get(r.차량번호).includes(key) ||
            get(r.이름).includes(key) ||
            get(r.지급방식).includes(key) ||
            get(r.배차방식).includes(key) ||
            get(r.운임구분).includes(key) // ⭐ 2026-11-06 통합 검색 — 운임구분(월대·일대)
          );
    }

 // 오류오더만 보기 필터
    if (filterErrorIds !== null) {
      data = data.filter(r => filterErrorIds.includes(r._id));
    }

    // 기본 순서(머리글 정렬이 꺼져 있을 때) — 머리글 정렬은 아래 filtered 에서 따로
  data.sort((a, b) => {
    const statusOrder = { 배차중: 0, 배차완료: 1, 배차취소: 2 };
    const sa = statusOrder[a.배차상태] ?? 0;
    const sb = statusOrder[b.배차상태] ?? 0;
    if (sa !== sb) return sa - sb;
    // 상차일 내림차순 (미래→과거): 같은 상태 내에서 상차일이 최신인 것이 위로
    const da = String(a.상차일 || "");
    const db = String(b.상차일 || "");
    return db.localeCompare(da);
  });

  // 경유지 사전 계산 (렌더 시 IIFE 제거)
    const safeParse = (v) => {
      if (Array.isArray(v) && v.length > 0) return v;
      if (typeof v === "string" && v.trim().startsWith("[")) {
        try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const keys = Object.keys(v);
        if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
          return keys.sort((a,b) => Number(a)-Number(b)).map(k => v[k]);
        if (v.업체명) return [v];
      }
      return [];
    };
    const dedup = (list) => list
      .filter(s => s && typeof s === "object" && (s.업체명?.trim() || s.주소?.trim()))
      .filter((s, i, arr) => {
        const key = s.업체명 || s.주소 || JSON.stringify(s);
        return arr.findIndex(x => (x.업체명||x.주소||JSON.stringify(x)) === key) === i;
      });

    return data.map(r => {
      const cached = waypointCacheRef.current.get(r);
      if (cached) return cached;
      const withStops = {
        ...r,
        __pickupStops: dedup([...safeParse(r.경유상차목록), ...safeParse(r.경유지_상차), ...safeParse(r.경유지상차)]),
        __dropStops:   dedup([...safeParse(r.경유하차목록), ...safeParse(r.경유지_하차), ...safeParse(r.경유지하차)]),
      };
      waypointCacheRef.current.set(r, withStops);
      return withStops;
    });
  }, [rows, q, rtSearchType, dayMode, statusFilter, filterErrorIds, rtDetail, rtDetailGet]);
  // ⚡ 머리글 정렬은 이미 걸러진 목록만 따로 정렬 — 정렬을 눌러도 위의 검색·필터·경유지 계산은 다시 돌지 않는다
  const rtMgrMap = useOrderStaffName(userNameMap, userCompany); // ⭐ 배차담당자 칸(회사별 기능 꺼지면 null)
  const [lookupOpen, setLookupOpen] = React.useState(false); // ⭐ 2026-11-03 담당자·차량 조회
  const lookupNameOf = React.useCallback((r) => _orderStaffNameRaw(r, userNameMap), [userNameMap]);
  const filtered = React.useMemo(() => sortRows(filteredBase, rtSort.sort, makeOrderSortValue(rtMgrMap)), [filteredBase, rtSort.sort, rtMgrMap]);
  // ⚡ 그리는 줄 수 제한 — 하루 오더가 수천 건이면 표 전체를 한꺼번에 그리고 배치하는 데만 수 초가 걸려
  //   정렬·검색 클릭이 멈춘 것처럼 보였다. 처음엔 150줄만 그리고, 아래로 내리면 150줄씩 자동으로 더 붙인다.
  //   (전체선택·엑셀·합계는 그대로 전체 목록 기준)
  const [rtShowN, setRtShowN] = React.useState(RT_ROW_STEP);
  React.useEffect(() => { setRtShowN(RT_ROW_STEP); }, [rtSort.sort, q, rtSearchType, dayMode, statusFilter, filterErrorIds]);
  const rtVisible = React.useMemo(() => (filtered.length > rtShowN ? filtered.slice(0, rtShowN) : filtered), [filtered, rtShowN]);
  const rtShowMore = React.useCallback(() => setRtShowN((n) => n + RT_ROW_STEP), []);

  // ⭐ 행 순서가 바뀔 때(수정으로 배차상태가 바뀌어 위/아래로 옮겨가는 등) 그냥
  // React가 새 순서로 다시 그려서 "뚝뚝 끊기며 순간이동"하던 것을, FLIP 기법으로
  // 이전 화면 위치 → 새 위치까지 부드럽게 슬라이드해 보이도록 한다. 실제 DOM
  // 순서는 이미 바뀐 상태에서, 각 행에 "방금 있던 자리"만큼 반대로 밀어둔 뒤
  // 다음 프레임에 transition으로 제자리(0)까지 되돌리는 방식이라 레이아웃 계산은
  // 그대로 두고 시각 효과만 추가한다 — 실패해도(엘리먼트를 못 찾는 등) 애니메이션만
  // 생략될 뿐 기능에는 전혀 영향 없다.
  const rowPositionsRef = React.useRef(new Map()); // id -> 직전 렌더의 화면상 top(px)
  const rowOrderKey = React.useMemo(() => filtered.map(r => r._id).join(","), [filtered]);
  const rowOrderPrevRef = React.useRef(null); // 직전 줄 순서(id 배열)
  const rowCaptureTimerRef = React.useRef(0);
  React.useEffect(() => () => clearTimeout(rowCaptureTimerRef.current), []);
  React.useLayoutEffect(() => {
    const prevPositions = rowPositionsRef.current;
    const nextPositions = new Map();
    // ⚡ 머리글 정렬처럼 줄 순서가 크게 바뀐 경우 — 화면을 그리기 전에 줄 위치를 재면 브라우저가
    //   표 전체 배치를 그 자리에서 강제로 계산해 클릭이 굼떴다. 몇 줄이 옮겨졌는지는 id 순서로만 세고,
    //   많이 바뀌었으면 효과 없이 바로 그린 뒤 위치 기록은 그린 다음(배치가 끝난 뒤)에 조용히 한다.
    const prevOrder = rowOrderPrevRef.current;
    const curOrder = filtered.map((r) => r._id);
    rowOrderPrevRef.current = curOrder;
    if (prevOrder) {
      const prevIdx = new Map(prevOrder.map((id, i) => [id, i]));
      // 줄 하나 추가·이동은 나머지 줄이 한 칸씩 같이 밀릴 뿐 — "밀린 정도가 바뀌는 곳" 수로 센다(정렬이면 수백 곳)
      let breaks = 0, lastDelta = null;
      for (let i = 0; i < curOrder.length && breaks <= 40; i++) {
        const pi = prevIdx.get(curOrder[i]);
        if (pi == null) continue;
        const d = pi - i;
        if (lastDelta !== null && d !== lastDelta) breaks++;
        lastDelta = d;
      }
      if (breaks > 40) {
        clearTimeout(rowCaptureTimerRef.current);
        rowPositionsRef.current = new Map();
        rowCaptureTimerRef.current = setTimeout(() => {
          const m = new Map();
          try { for (const id of curOrder) { const el = document.getElementById(`row-${id}`); if (el) m.set(id, el.getBoundingClientRect().top); } } catch { /* 무시 */ }
          rowPositionsRef.current = m;
        }, 400);
        return;
      }
    }
    try {
      // ⚡ 1단계: 위치를 먼저 전부 읽기만 한다. 예전엔 "읽기 → transform 쓰기"를 줄마다 번갈아 해서
      //   줄 하나 쓸 때마다 브라우저가 표 전체 배치를 다시 계산했다(머리글 정렬 시 수 초씩 멈추던 원인).
      const moved = [];
      for (const r of filtered) {
        const el = document.getElementById(`row-${r._id}`);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        nextPositions.set(r._id, top);
        const prevTop = prevPositions.get(r._id);
        if (prevTop != null && Math.abs(prevTop - top) > 2) moved.push([el, prevTop - top]);
      }
      // 2단계: 몇 줄만 자리를 옮긴 경우(배차상태 변경 등)에만 미끄러지는 효과. 정렬처럼 많이 바뀌면 바로 보여준다.
      if (moved.length <= 80) moved.forEach(([el, dy]) => {
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.transition = "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)";
              el.style.transform = "";
              // ⭐ 여기서 inline transition을 계속 남겨두면(원래 className이 갖고 있던
              // background-color/opacity 트랜지션을 인라인 style이 덮어써서) 삭제
              // 페이드아웃/하이라이트 배경전환이 조용히 멈춰버린다 — 애니메이션이
              // 끝나면 인라인 transition을 지워 className의 트랜지션으로 되돌린다.
              setTimeout(() => { if (el.style.transform === "") el.style.transition = ""; }, 220);
            });
          });
      });
    } catch {}
    rowPositionsRef.current = nextPositions;
  }, [rowOrderKey]);

  // 화면에 보이는 순서상 그 상/하차지명이 처음 등장하는 행의 _id만 모아둔다 —
  // 같은 업체가 여러 건이어도 휴게(점심시간) 아이콘이 첫 행에만 뜨게 하기 위함
  // (RestCell의 isFirst prop으로 전달, 겹침 경고는 이 dedup과 무관하게 항상 표시).
  const lunchFirstIds = React.useMemo(() => {
    const pickup = new Set(), drop = new Set();
    const seenP = new Set(), seenD = new Set();
    for (const r of filtered) {
      const pk = _lunchNameKey(r.상차지명);
      if (pk && lunchByName.get(pk) && !seenP.has(pk)) { seenP.add(pk); pickup.add(r._id); }
      const dk = _lunchNameKey(r.하차지명);
      if (dk && lunchByName.get(dk) && !seenD.has(dk)) { seenD.add(dk); drop.add(r._id); }
    }
    return { pickup, drop };
  }, [filtered, lunchByName]);
  // =========================
  // 📊 상태 요약 (추가 위치)
  // =========================
  const statusSummary = React.useMemo(() => {
    const 미배차 = filtered.filter(
      r => r.배차상태 !== "배차완료"
    ).length;

    const 배차완료 = filtered.filter(
      r => r.배차상태 === "배차완료"
    ).length;

    const 긴급미배차 = filtered.filter(
      r => r.긴급 === true && r.배차상태 !== "배차완료"
    ).length;

    const 업체미전달 = filtered.filter(
      r => r.업체전달상태 !== "전달완료"
    ).length;

    return {
      미배차,
      배차완료,
      긴급미배차,
      업체미전달,
    };
  }, [filtered]);


  // KPI
  // ⭐ 2026-11-17 수수료 합계 = 줄 수수료(청구 − 기사 − 회사가 따로 준 지게차·특수운임)의 합 — 예전엔 "청구 합 − 기사 합"이라 줄과 달랐다
  const kpi = React.useMemo(() => profitTotals(filtered), [filtered]);

  // ------------------------
  // 📌 선택 체크
  // ------------------------
  const toggleSelect = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const rtLongPress = useKpLongPressSelect({ toggle: toggleSelect, isSelected: (id) => selected.includes(id) });
  // ------------------------
  // 📌 선택수정 저장
  // ------------------------
  const handleSaveSelected = () => {
    const ids = Object.keys(edited);
    if (!ids.length) return showAlert("변경된 내용이 없습니다.");

    // 🛠 2026-11-24 날짜 역순은 저장 전에 먼저 확인(배차현황과 같게) — 예전엔 "저장 완료"가 뜬 뒤에 저장이 거절돼 날짜가 안 바뀌었다
    const reversedId = ids.find((id) => {
      const orig = (dispatchData || []).find((r) => r._id === id) || (rows || []).find((r) => r._id === id);
      const p = edited[id] || {};
      return isReversedDateOrder("상차일" in p ? p.상차일 : orig?.상차일, "하차일" in p ? p.하차일 : orig?.하차일);
    });
    if (reversedId) return showAlert(REVERSED_DATE_ORDER_MSG);

    // ✅ UI 먼저
    showAlert("저장 완료");
    setEdited({});
    setSelectedEditMode(false);

ids.forEach(id => flashRow(id));

    // ✅ 백그라운드 저장
    ids.forEach(id => {
      const ch = edited[id];
      if (ch && Object.keys(ch).length) {
        patchDispatch?.(id, stripUndefined(ch)).catch(console.error);
      }
    });
  };
  // ===================== 일마감 검증 로직 =====================
const runDailyClose = () => {
  let targetDate = todayKST();
  if (dayMode === "yesterday") targetDate = yesterdayKST();
  if (dayMode === "tomorrow") targetDate = tomorrowKST();

  const todayRows = rows.filter(r => r.상차일 === targetDate);
  const errors = [];
  const warnings = [];

  todayRows.forEach((row, idx) => {
    const seq = idx + 1;
    const label = `${seq}번 [${row.거래처명 || "-"}] ${row.상차지명 || ""} → ${row.하차지명 || ""}`;

    // 1. 필수값 누락 체크
    const requiredFields = [
      { key: "차량번호", name: "차량번호" },
      { key: "이름", name: "기사명" },
      { key: "전화번호", name: "전화번호" },
      { key: "청구운임", name: "청구운임" },
      { key: "기사운임", name: "기사운임" },
      { key: "배차방식", name: "배차방식" },
      { key: "지급방식", name: "지급방식" },
    ];

    const missing = requiredFields.filter(f => {
      const v = String(row[f.key] || "").trim();
      return !v || v === "0";
    });

    if (missing.length > 0) {
      errors.push({
        rowId: row._id,
        seq,
        label,
        type: "missing",
        msg: `필수값 누락: ${missing.map(m => m.name).join(", ")}`,
      });
    }

    // 2. 운임 정합성 체크
    const charge = Number(String(row.청구운임 || "0").replace(/[^\d-]/g, ""));
    const pay = Number(String(row.기사운임 || "0").replace(/[^\d-]/g, ""));

    if (charge > 0 && pay > 0 && charge < pay) {
      warnings.push({
        rowId: row._id,
        seq,
        label,
        type: "margin",
        msg: `마진 역전 (청구 ${charge.toLocaleString()} < 기사 ${pay.toLocaleString()})`,
      });
    }

    if (charge === 0 && row.지급방식 !== "취소" && row.지급방식 !== "손실" && row.배차상태 !== "배차취소") {
      warnings.push({
        rowId: row._id,
        seq,
        label,
        type: "zero",
        msg: "청구운임이 0원입니다",
      });
    }

    if (pay === 0 && row.배차상태 === "배차완료") {
      warnings.push({
        rowId: row._id,
        seq,
        label,
        type: "zero",
        msg: "기사운임이 0원입니다 (배차완료 상태)",
      });
    }

    if (charge > 5000000) {
      warnings.push({
        rowId: row._id,
        seq,
        label,
        type: "high",
        msg: `청구운임 비정상적으로 높음 (${charge.toLocaleString()}원)`,
      });
    }

        // 3. 기사정보 정합성 체크
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
          warnings.push({
            rowId: row._id,
            seq,
            label,
            type: "driver",
            msg: `기사정보 불일치: 입력 "${rowName}" / DB "${dbNames}"`,
          });
        }
      }

      // 전화번호 자릿수 체크
      const phoneDigits = String(row.전화번호 ?? "").replace(/[^\d]/g, "");
      if (phoneDigits && phoneDigits.length !== 11) {
        warnings.push({
          rowId: row._id,
          seq,
          label,
          type: "phone",
          msg: `전화번호 ${phoneDigits.length}자리 (정상: 11자리)`,
        });
      }
    }

  });

  // 업체별 요약
  const clientMap = new Map();
  todayRows.forEach(row => {
    const name = row.거래처명 || "(미입력)";
    if (!clientMap.has(name)) {
      clientMap.set(name, { count: 0, charge: 0, pay: 0 });
    }
    const c = clientMap.get(name);
    c.count++;
    c.charge += Number(String(row.청구운임 || "0").replace(/[^\d-]/g, "")) || 0;
    c.pay += Number(String(row.기사운임 || "0").replace(/[^\d-]/g, "")) || 0;
  });

  const clientSummary = [...clientMap.entries()].map(([name, data]) => ({
    name,
    ...data,
    margin: data.charge - data.pay,
  }));

  setDailyCloseResult({
    date: targetDate,
    total: todayRows.length,
    errors,
    warnings,
    passed: todayRows.length - errors.length,
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
  const targetDate = dailyCloseResult.date;
  // 보고서 모양 · 계산은 sharedDispatchUi.jsx(openDailyWorkReport) 한 곳
  openDailyWorkReport({
    targetDate,
    targetRows: rows.filter(r => r.상차일 === targetDate),
    rowsOfDate: (d) => rows.filter(r => r.상차일 === d),
    companyInfo, printerInfo, userCompany,
    printerFallback: auth.currentUser?.email?.split("@")[0] || "",
  });
};
// ⭐ 일마감 검증 팝업의 오류/경고 목록에서 오더를 클릭했을 때 — 팝업을
// 닫고 그리드로 스크롤만 하던 것 대신, 그 오더의 상세 내용이 담긴 "선택수정"
// 팝업을 일마감 검증보다 앞에 띄우고 어떤 문제가 있는지 배너로 보여준다.
const openDailyCloseIssueDetail = (rowId) => {
  const row = dispatchData.find(r => r._id === rowId) || rows.find(r => r._id === rowId);
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

  // =======================
  // 🔥 팝업에서 실제 삭제 실행
  // =======================
  const executeDelete = async () => {
    if (isViewer) return showAlert("조회전용 권한으로 삭제할 수 없습니다.");

    const isShipperOrder = (r) => r.source === "shipper" || r.source === "shipper_mobile";
    if (deleteList.some(r => isShipperOrder(r) && !r.취소요청)) {
      return showAlert("화주사가 등록한 오더는 운송사에서 임의로 삭제할 수 없습니다. 화주사가 배차취소를 요청한 건만 승인 후 삭제할 수 있습니다.");
    }

    // ⭐ 사용자 요청 — 선택한 여러 건 중 이미 "운송완료"된 오더가 있으면, 건별로
    // 반복해서 묻지 않고 한번에 모아서 한 번만 확인받는다(removeDispatch 쪽
    // 개별 confirm은 skipCompletedConfirm으로 건너뛰되, 스냅샷 기록은 그대로 남김).
    const completedInBatch = deleteList.filter(r => r?.기사확인상태 === "완료");
    if (completedInBatch.length > 0) {
      if (!await kpConfirm(`운송이 완료된 오더가 ${completedInBatch.length}건 포함되어 있습니다. 오더를 삭제하시겠습니까?`)) return;
    }

    const ids = deleteList.map(r => r._id);

    // ⭐ 삭제 팝업에서 "삭제"를 눌러도 한참 있다가 지워지던 딜레이의 원인 — 실제
    // Firestore 쓰기(여러 건이면 그만큼)를 다 기다린 뒤에야 화면에서 지웠다.
    // 화면은 먼저 지우고, 실제 삭제는 백그라운드로 돌린다.
    setRows(prev => prev.filter(r => !ids.includes(r._id)));
    setUndoStack(deleteList);
    setShowUndo(true);
    setTimeout(() => setShowUndo(false), 8000);
    setSelected([]);
    setDeleteConfirmOpen(false);

    // 여러 건 선택삭제 시 하나씩 순차 대기하면 건수만큼 지연이 쌓여 버벅였다 —
    // 서로 독립적인 삭제라 병렬로 처리한다.
    // ⭐ 2026-11-05 한 건씩 병렬 삭제하면 목록이 한 줄씩 줄어들었다 — 한 번에(writeBatch) + 삭제 진행 창
    Promise.resolve(removeDispatch(ids, { skipCompletedConfirm: true })).catch((e) => {
      console.error("삭제 실패:", e);
      showAlert("일부 오더 삭제에 실패했습니다. 목록에서 확인해주세요.\n" + (e?.message || ""));
    });
  };

  // =======================
  // 🔥 되돌리기 기능
  // =======================
  const undoDelete = async () => {
    for (const r of undoStack) {
      await addDispatch(r);
    }
    setRows(prev => [...prev, ...undoStack]);
    setUndoStack([]);
    setShowUndo(false);
  };

  // ------------------------
  // 📌 선택수정 편집 가능 여부
  // ------------------------
  const canEdit = (key, id) => {
    if (!(selectedEditMode && selectedSet.has(id))) return false;

    const readOnly = [
      "등록일",
      "순번",
      "차량번호",
      "배차상태",
      "이름",
      "전화번호",
    ];
    return !readOnly.includes(key);
  };

  // 🔒 화주사가 등록한 오더는 결제정보(청구운임/기사운임/수수료, 지급방식 제외)만 수정 가능 — 최고관리자도 예외 없음
  //    — 기사정보(차량번호/이름/전화번호)는 별도 경로(기사스마트검색 등)로만 수정되며
  //      원래도 canEdit의 readOnly 목록에 포함돼 있어 여기서 별도 처리하지 않는다.
  // ⚡ id→source 조회를 매 셀마다 O(N) find()로 하면 행×열 규모에서 체감 렉이 생기므로
  //    dispatchData가 바뀔 때만 한 번 Set을 만들어 O(1)로 조회한다.
  const shipperOrderIdSet = React.useMemo(() => {
    const s = new Set();
    (dispatchData || []).forEach(r => { if (r.source === "shipper" || r.source === "shipper_mobile") s.add(r._id); });
    return s;
  }, [dispatchData]);
  const isShipperFieldLocked = (key, id) => {
    if (!shipperOrderIdSet.has(id)) return false;
    // 지급방식은 화주사만 변경 가능 — 최고관리자 예외 없이 운송사측 전체에서 잠금
    if (key === "지급방식") return true;
    // 배차방식은 화주사 오더라도 운송사가 항상 수정 가능
    if (key === "배차방식") return false;
    const settlementAllowed = ["청구운임", "기사운임", "수수료"];
    return !settlementAllowed.includes(key);
  };

  // ------------------------
  // 📌 editable input
  // ------------------------
  const handleEditChange = (id, key, value) => {
    // ⭐ 2026-11-02 운임규칙 — 운임구분이 있는 오더는 청구운임을 고치면 기사운임·수수료도 규칙대로(기사운임을 고치면 수동 표시)
    if (fareOn && (key === "청구운임" || key === "기사운임" || key === "운임구분" || key === "__reapply")) {
      setEdited((prev) => {
        const base = (dispatchData || []).find((r) => r._id === id) || {};
        const merged = { ...base, ...(prev[id] || {}) };
        if (!merged.운임구분 && key !== "운임구분") return { ...prev, [id]: { ...(prev[id] || {}), ...(key === "__reapply" ? {} : { [key]: value }) } };
        const n = fareFormChange(merged, key, value, fareR.rules);
        return { ...prev, [id]: { ...(prev[id] || {}), ...(key === "__reapply" ? {} : { [key]: value }), 운임구분: n.운임구분 || "", 기사운임: n.기사운임, 수수료: n.수수료, 운임수동: !!n.운임수동, ...(n.운임구분수수료율 !== undefined ? { 운임구분수수료율: n.운임구분수수료율 } : {}) } };
      });
      return;
    }
    setEdited((prev) => {
      const cur = { ...(prev[id] || {}), [key]: value };
      if (key === "상차일") { // 🛠 2026-11-24 상차일을 하차일보다 뒤로 옮기면 하차일도 같은 날로
        const base = (dispatchData || []).find((r) => r._id === id) || (rows || []).find((r) => r._id === id) || {};
        if (dropFollowsPickup(value, "하차일" in cur ? cur.하차일 : base.하차일)) cur.하차일 = value;
      }
      return { ...prev, [id]: cur };
    });
  };

  // 오더목록에서 중요한 값(상/하차일·화물내용·차량종류·톤수)은 운임확인서(FareCertModal)의
  // 강조 스타일(font-extrabold + 네이비색)과 동일하게 표시해 다른 칸과 구분되도록 한다.
  // ⚠️ 아래쪽에 별도로 선언된 const isDark(= darkMode)는 이 시점에 아직 초기화 전이라
  //    여기서 참조하면 TDZ(ReferenceError: Cannot access 'isDark' before initialization)가
  //    발생한다 — 반드시 prop인 darkMode를 직접 사용할 것.
  const emphKeys = ["상차일", "하차일", "화물내용", "차량종류", "차량톤수"];
  const emphCls = darkMode ? "font-extrabold text-blue-300" : "font-extrabold text-[#1B2B4B]";

  // ⭐ redOverride: 복수근무일(묶음) 오더의 상차일 칸을 빨간 글씨로 강조할 때만
  // true로 넘긴다(emphCls 대신 적용). 그 외 모든 호출은 기존과 동일하게 동작한다.
  const editableInput = (key, val, rowId, redOverride = false) => {
    const emphClsFinal = redOverride ? "font-extrabold text-red-600" : emphCls;
    // ⭐ 상차일은 바로 옆 등록일(밑줄만 있고 굵기 없음)과 구분이 잘 안 간다는 피드백으로
    // 다른 emphKeys보다 글씨를 한 단계 더 키운다.
    const clsFor = (k) => (k === "상차일" || k === "하차일") ? `${emphClsFinal} text-[15.5px]` : emphClsFinal;
    // 🔒 화주사 오더는 결제정보(청구운임/기사운임/수수료) 외 필드는 수정 불가 (최고관리자 포함)
    //    — 차량종류/지급방식/배차방식의 "항상 드롭다운" 예외보다 우선 적용
    if (isShipperFieldLocked(key, rowId)) return emphKeys.includes(key) ? <span className={clsFor(key)}>{val}</span> : val;

    // 🔥 이 3개는 항상 드롭다운 (PART 5와 동일)
    if (
      !canEdit(key, rowId) &&
      !["차량종류", "지급방식", "배차방식"].includes(key)
    ) {
      return emphKeys.includes(key) ? <span className={clsFor(key)}>{val}</span> : val;
    }

    if (key === "상차일" || key === "하차일") {
      // ⭐ 이 위(24406/24413)의 읽기전용 분기에서만 clsFor(굵게+색)가 적용되고,
      // 편집 가능한 상태(canEdit=true)에선 CustomDatePicker가 아무 글자 스타일 없이
      // 그려져서 상차일/하차일이 다시 얇고 검은 기본 글씨로 보이던 버그 —
      // 편집 가능할 때도 동일한 스타일을 그대로 이어서 적용한다.
      return (
        <CustomDatePicker
          className={`border p-1 rounded w-full ${clsFor(key)}`}
          value={val || ""}
          onChange={(e) => handleEditChange(rowId, key, e.target.value)}
        />
      );
    }

    if (key === "지급방식") {
      return (
        <CompanyOptionPicker optKey="지급방식" placeholder="선택" noneLabel="선택" className="border rounded px-1 py-0.5 w-full text-center" value={val || ""} onChange={(__v) => ((e) => {
            const next = e.target.value;
            if (next === val) return;

            setConfirmChange({
              rowId,
              key: "지급방식",
              before: val || "",
              after: next,
            });
          })({ target: { value: __v } })} />
      );
    }

    if (key === "배차방식") {
      // ⭐ 예전에 patchDispatch가 미선택 상태를 "선택없음"이라는 문자열 그대로
      // 저장하던 시절의 잔여 데이터는 어떤 옵션의 value("")와도 일치하지 않아
      // 드롭다운이 완전히 공란으로 보였다 — 새로 저장되는 값은 빈 문자열이지만,
      // 이미 저장된 옛 데이터도 여기서 같이 정규화해 "선택"이 보이게 한다.
      const dispatchVal = val === "선택없음" ? "" : (val || "");
      return (
        <span className="block" title={sheetWayDiff((rows || []).find((r) => r._id === rowId)) ? sheetWayTitle((rows || []).find((r) => r._id === rowId)) : undefined}>
        <DispatchWayPicker scope={(() => { const o = (rows || []).find((r) => r._id === rowId); return [o?.거래처명, o?.상차지명, o?.하차지명]; })()} className="border rounded px-1 py-0.5 w-full text-center" style={sheetWayDiff((rows || []).find((r) => r._id === rowId)) ? SHEET_DIFF_STYLE : undefined} value={dispatchVal} dir={(rows || []).find((r) => r._id === rowId)?.콜구분 || ""} onPick={(pk) => {
            const next = pk.배차방식 ?? "";
            const extra = pk.콜구분 !== undefined ? { 콜구분: pk.콜구분, 콜플랫폼: pk.콜플랫폼 || "" } : null; // 💳 IN/OUT도 같이 저장
            if (next === dispatchVal && !extra) return;
            setConfirmChange({ rowId, key: "배차방식", before: dispatchVal, after: next, ...(extra ? { extra } : {}) });
          }} />
        </span>
      );
    }
    if (key === "차량종류") {
      return (
        <VehicleTypePicker className="border p-1 rounded w-full" value={val || ""} base={["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이", "기타"]} placeholder="선택" noneLabel="선택" onChange={(__v) => ((e) => {
            const next = e.target.value;
            if (next === val) return;

            setConfirmChange({
              rowId,
              key: "차량종류",
              before: val || "",
              after: next,
            });
          })({ target: { value: __v } })} />
      );
    }
    return (
      <input autoComplete="off"
        type="text"
        className="border p-1 rounded w-full"
        defaultValue={val || ""}
        onChange={(e) => handleEditChange(rowId, key, e.target.value)}
      />
    );
  };

  // ------------------------
  // 📌 주소 셀 (더보기)
  // ------------------------
  const renderAddrCell = (key, val, rowId) => {
    if (canEdit(key, rowId)) {
      return (
        <input autoComplete="off"
          type="text"
          className="border p-1 rounded w-full"
          defaultValue={val || ""}
          onChange={(e) => handleEditChange(rowId, key, e.target.value)}
        />
      );
    }

    const text = String(val || "");
    if (!text) return "";

    const LIMIT = 14;
    const isLong = text.length > LIMIT;
    const display = isLong ? text.slice(0, LIMIT) + "…" : text;

    return (
      <div className="flex items-center justify-center gap-1 min-w-0">
        <span className="whitespace-nowrap" title={text}>
          {display}
        </span>
        {isLong && (
          <button
            type="button"
            className="text-[11px] text-[#1B2B4B] underline shrink-0 hover:opacity-70"
            onClick={() => setAddrPopup(text)}
          >
            더보기
          </button>
        )}
      </div>
    );
  };

  // ------------------------
  // 📌 화물내용 셀 (더보기) — 5글자 넘으면 잘라서 팝업으로 전체 내용 확인
  // ------------------------
  const renderCargoCell = (text) => {
    const str = String(text || "");
    if (!str) return "";

    const LIMIT = 5;
    const isLong = str.length > LIMIT;
    const display = isLong ? str.slice(0, LIMIT) + "…" : str;

    return (
      <div className="flex items-center justify-center gap-1 min-w-0">
        <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${emphCls}`} style={{ maxWidth: 90 }} title={str}>
          {display}
        </span>
        {isLong && (
          <button
            type="button"
            className="text-[11px] text-[#1B2B4B] underline shrink-0 hover:opacity-70"
            onClick={() => setCargoPopup(str)}
          >
            더보기
          </button>
        )}
      </div>
    );
  };
  // ------------------------
  // 📌 공유 메시지 (기존 함수)
  // ------------------------
  const shareDispatch = (row) => {
    const url = issueUploadUrl(row); // ⭐ 2026-11-08 보안 — 토큰이 든 짧은 링크

    const msg = `
▣ [배차 정보]

■ 거래처: ${row.거래처명 || ""}
● 상차지: ${row.상차지명 || ""} / ${row.상차지주소 || ""}
● 하차지: ${row.하차지명 || ""} / ${row.하차지주소 || ""}

◷ 상차: ${row.상차일 || ""} ${row.상차시간 || ""}
◷ 하차: ${row.하차일 || ""} ${row.하차시간 || ""}

▸ 차량: ${row.차량번호 || ""} / ${row.이름 || ""} (${row.전화번호 || ""})
₩ 기사운임: ${(row.기사운임 || 0).toLocaleString()}원

✎ 메모:
${row.메모 || ""}

+ 사진 업로드:
${url}
`.trim();

    navigator.clipboard.writeText(msg);
    showAlert("▤ 공유 메시지가 복사되었습니다.");
  };


  // ------------------------
  // 테이블 스타일
  // ------------------------
  const isDark = darkMode;

const head = isDark
    ? "px-2 py-2 text-center text-[12px] font-bold text-white/90 whitespace-nowrap bg-transparent border-b border-white/10"
    : "px-2 py-2 text-center text-[12px] font-bold text-white whitespace-nowrap bg-transparent border-b border-white/10";

 const cell = isDark
    ? "px-2 py-1.5 text-[14px] font-medium text-gray-100 align-middle text-center whitespace-nowrap border-b border-gray-700"
    : "px-2 py-1.5 text-[14px] font-medium text-gray-900 align-middle text-center whitespace-nowrap border-b border-gray-200";

  // ⚠️ 여기 overflow-hidden/text-ellipsis/max-width를 다시 넣지 말 것 — renderAddrCell이
  // 이미 글자수(14자) 기준으로 직접 자르고 "더보기" 버튼을 붙여주는데, 이 td에 CSS
  // 말줄임까지 겹치면 "주소(14자)+더보기 버튼"의 실제 폭이 CSS max-width를 넘는
  // 행에서는 버튼째로 잘려나가 "..."만 남는 버그가 있었다(더보기 버튼이 안 보임).
  const addrCell = isDark
    ? "px-2 py-1.5 text-[14px] font-medium text-gray-100 align-middle text-center whitespace-nowrap border-b border-gray-700"
    : "px-2 py-1.5 text-[14px] font-medium text-gray-900 align-middle text-center whitespace-nowrap border-b border-gray-200";

  // ------------------------
  // 📌 화면 렌더링
  // ------------------------
  if (!ready) return (
    <div className="flex items-center justify-center h-48">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-[#1B2B4B] border-t-transparent rounded-full animate-spin" />
        <div className="text-[13px] font-semibold text-gray-500">데이터 불러오는 중...</div>
      </div>
    </div>
  );

 return (
<div className="px-3 pt-1 w-full" style={{overflowY: "unset"}}>
<CustomAlert message={alertMsg} onClose={() => setAlertMsg(null)} />
{attachViewer && (
  <AttachmentViewer
    row={attachViewer}
    db={db}
    onClose={() => setAttachViewer(null)}
    isViewed={rows.find(r => r._id === attachViewer?._id)?.attachViewed ?? false}
    onToggleViewed={() => { const r2 = rows.find(r => r._id === attachViewer?._id); const nextVal = !r2?.attachViewed; setRows(prev => prev.map(x => x._id === attachViewer._id ? { ...x, attachViewed: nextVal } : x)); updateDoc(doc(db, attachViewer.__col || "orders", attachViewer._id), { attachViewed: nextVal }).catch(() => {}); }}
    onSaved={() => { const r2 = rows.find(r => r._id === attachViewer?._id); if (r2?.attachViewed) return; setRows(prev => prev.map(x => x._id === attachViewer._id ? { ...x, attachViewed: true } : x)); updateDoc(doc(db, attachViewer.__col || "orders", attachViewer._id), { attachViewed: true }).catch(() => {}); }}
    isViewer={isViewer}
  />
)}
{liveLocViewer && <LiveLocationPopup row={liveLocViewer} onClose={() => setLiveLocViewer(null)} />}
{orderInfoRow4 && <OrderInfoModal row={orderInfoRow4} onClose={() => setOrderInfoRow4(null)} lunchByName={lunchByName} />}
{workDatesEditRow && (
  <WorkDatesEditModal
    row={workDatesEditRow}
    confirmEdit
    companyName={userCompany}
    onClose={() => setWorkDatesEditRow(null)}
    onSave={async (patch) => {
      const ok = await patchDispatch(workDatesEditRow._id, patch, workDatesEditRow);
      if (ok === false) return; // 역순 날짜 등 검증 실패 — 모달을 유지해 다시 고르게 한다
      setRows(prev => prev.map(x => x._id === workDatesEditRow._id ? { ...x, ...patch } : x));
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
{addrPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4">
        <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.주소 전체보기" defaultText="주소 전체보기" /></h3>
      </div>
      <div className="px-6 py-5">
        <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{addrPopup}</p>
      </div>
      <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
        <button onClick={() => setAddrPopup(null)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"><EditableText id="misc.btn.26194.닫기" defaultText="닫기" /></button>
      </div>
    </div>
  </div>
)}
{cargoPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4">
        <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.화물내용 전체보기" defaultText="화물내용 전체보기" /></h3>
      </div>
      <div className="px-6 py-5">
        <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{cargoPopup}</p>
      </div>
      <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
        <button onClick={() => setCargoPopup(null)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"><EditableText id="misc.btn.26209.닫기" defaultText="닫기" /></button>
      </div>
    </div>
  </div>
)}
{attachStatusOpen && (
  <AttachStatusPanel
    open={attachStatusOpen}
    onClose={() => setAttachStatusOpen(false)}
    initialClient={attachStatusClient}
    dispatchData={dispatchData}
    db={db}
    companyName={userCompany}
    isViewer={isViewer}
  />
)}
{/* ================= 거래처 신규등록 팝업 ================= */}
<NewClientModal open={newClientModalOpen} data={newClientModalData} setData={setNewClientModalData} onClose={() => setNewClientModalOpen(false)} upsertClient={upsertClient} showAlert={showAlert} formatPhone={formatPhone} zClass="z-[9999999]" />
{/* 🚫 블랙 기사 알림 팝업 */}
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
        <button className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl font-bold text-sm" onClick={() => setBlackAlert(null)}><EditableText id="misc.btn.26354.확인" defaultText="확인" /></button>
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
        <button className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl font-bold text-sm" onClick={() => setMemoAlert(null)}><EditableText id="misc.btn.26383.확인" defaultText="확인" /></button>
      </div>
    </div>
  </div>
)}
{panelMemoPopupC4 && (
  <OrderMemoModal {...panelMemoPopupC4} onCancel={() => setPanelMemoPopupC4(null)} onSave={savePanelMemoC4} />
)}
{panelMemoPopupE4 && (
  <OrderMemoModal {...panelMemoPopupE4} onCancel={() => setPanelMemoPopupE4(null)} onSave={savePanelMemoE4} />
)}
{panelContactPopup4 && (() => {
  const q4 = panelContactSearch4.trim().toLowerCase();
  // (검색어에 숫자가 없으면 "".includes("")가 항상 true라 전원 노출되고, 숫자가
  // 1~2자리뿐이면 무관한 전화번호에도 우연히 걸리는 문제 방지 — 3자리 이상일 때만
  // 전화번호로도 검색)
  const q4Digits = q4.replace(/\D/g, "");
  const visible4 = panelContactPopup4.contacts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !q4 || (c.name || "").toLowerCase().includes(q4) || (q4Digits.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(q4Digits)));
  return (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]"
    tabIndex={-1}
    ref={(el) => { if (el && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; requestAnimationFrame(() => setTimeout(() => (panelContactSearchInputRef4.current || el).focus(), 0)); } }}
    onKeyDown={(e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setPanelContactActive4(i => Math.min(i + 1, visible4.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setPanelContactActive4(i => Math.max(i - 1, 0)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPanelContactActive4(i => Math.min(i + 5, visible4.length - 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPanelContactActive4(i => Math.max(i - 5, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); const c = visible4[panelContactActive4]?.c; if (c) { const key = panelContactPopup4.type === "pickup" ? "상차" : "하차"; panelContactPopup4.setter(prev => ({ ...prev, [`${key}지담당자`]: c.name || "", [`${key}지담당자번호`]: c.phone || "" })); } setPanelContactPopup4(null); }
      else if (e.key === "Escape") { e.preventDefault(); setPanelContactPopup4(null); }
      else if (e.key.length === 1 || e.key === "Backspace") { panelContactSearchInputRef4.current?.focus(); }
    }}>
    <div className="bg-white rounded-2xl shadow-2xl w-[800px] max-w-[94vw] overflow-hidden">
      <div className="bg-[#1B2B4B] px-6 py-4">
        <h3 className="text-white font-bold text-[15px]">{panelContactPopup4.type === "pickup" ? "상차지" : "하차지"} 담당자 선택</h3>
        <p className="text-white/60 text-[12px] mt-0.5">{panelContactPopup4.place.업체명} · 총 {panelContactPopup4.contacts.length}명</p>
      </div>
      <div className="px-5 pt-4">
        <input autoComplete="off"
          ref={panelContactSearchInputRef4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]"
          placeholder="담당자 이름 또는 전화번호 검색"
          value={panelContactSearch4}
          onChange={e => { setPanelContactSearch4(e.target.value); setPanelContactActive4(0); }}
        />
      </div>
      <div ref={panelContactListRef4} className="relative p-5 grid grid-flow-col grid-rows-[repeat(5,min-content)] content-start auto-cols-[210px] gap-2 overflow-x-auto max-h-[70vh]">
        {visible4.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-10 w-[210px]">검색 결과가 없습니다</div>
        )}
        {visible4.map(({ c, i }, vi) => (
          <div key={i}
            className={`rounded-lg border-2 px-2.5 py-2 cursor-pointer transition min-w-0 ${vi === panelContactActive4 ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 hover:border-gray-300"}`}
            onMouseEnter={() => setPanelContactActive4(vi)}
            onClick={() => {
              const key = panelContactPopup4.type === "pickup" ? "상차" : "하차";
              panelContactPopup4.setter(prev => ({ ...prev, [`${key}지담당자`]: c.name || "", [`${key}지담당자번호`]: c.phone || "" }));
              setPanelContactPopup4(null);
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
        <button className="px-4 py-2 rounded-lg bg-gray-200 text-sm" onClick={() => setPanelContactPopup4(null)}><EditableText id="misc.btn.26452.취소" defaultText="취소" /></button>
      </div>
    </div>
  </div>
  );
})()}
    {/* 상차 임박 경고 배너 — 접기/펼치기 */}
{warningList.length > 0 && (
  <div className="mb-3 w-fit max-w-full select-none">
    {/* 헤더 줄 — 항상 표시 */}
    <button
      type="button"
      onClick={() => setWarningExpanded(v => !v)}
      className="flex items-center gap-3 bg-[#1B2B4B] text-white rounded-xl px-4 py-2 hover:bg-[#243a60] transition-colors"
    >
      <span className="tabular-nums font-extrabold text-red-300 text-[15px] min-w-[2ch] text-right">{warningList.length}</span>
      <span className="text-[13px] font-semibold tracking-wide">상차 2시간 이내 미배차</span>
      <svg
        className={`w-4 h-4 ml-1 transition-transform ${warningExpanded ? "rotate-180" : ""}`}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    {/* 상세 목록 — 펼쳤을 때만 */}
    {warningExpanded && (
      <div className="mt-1 border border-[#1B2B4B]/20 rounded-xl overflow-hidden">
        {warningList.map((r, i) => (
          <div
            key={r.id}
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

{/* ======================== KPI ======================== */}
<div className="flex items-center gap-2 mb-3 flex-wrap">
  <div className="flex items-center gap-2 bg-[#1B2B4B] text-white px-4 py-2 rounded-xl shadow-sm">
    <span className="text-[12px] font-medium text-white/70">총</span>
    <span className="text-[15px] font-extrabold">{kpi.cnt}건</span>
  </div>
  <div className="flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm">
    <span className="text-[12px] font-medium text-gray-500">청구</span>
    <span className="text-[15px] font-extrabold text-[#1B2B4B]">{kpi.sale.toLocaleString()}원</span>
  </div>
  <div className="flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm">
    <span className="text-[12px] font-medium text-gray-500">기사</span>
    <span className="text-[15px] font-extrabold text-[#1B2B4B]">{kpi.drv.toLocaleString()}원</span>
  </div>
  <div className="flex items-center gap-2 bg-white border border-[#1B2B4B]/20 px-4 py-2 rounded-xl shadow-sm">
    <span className="text-[12px] font-medium text-gray-500">수수료</span>
    <span className="text-[15px] font-extrabold" style={{ color: kpi.fee < 0 ? "#2457D6" : kpi.fee > 0 ? "#D92D20" : "#1B2B4B" }}>{kpi.fee.toLocaleString()}원<MarginPct profit={kpi.fee} sales={kpi.sale} hideZero /></span>{/* 🎨 2026-11-16 수수료 — 플러스 빨강 · 마이너스 파랑 · ⭐ 2026-11-17 옆에 수수료율(수수료 ÷ 청구) */}
  </div>
</div>

{/* ======================== 검색+필터+버튼 한 줄 ======================== */}
<div className="flex items-center gap-1 flex-wrap mb-2 pb-0.5">
  {/* 검색창 */}
  <div className="flex items-center border-2 border-[#1B2B4B] rounded-lg overflow-hidden bg-white h-[30px] flex-shrink-0">
    {/* ⭐ 검색 항목 선택 — 배차현황 검색창과 같은 모양·같은 동작 */}
    <CustomSelect className="px-1 h-full text-[11px] bg-[#1B2B4B] text-white outline-none cursor-pointer"
      value={rtSearchType} onChange={(e)=>{setRtSearchType(e.target.value);setQ("");setQInput("");if(qInputRef.current)qInputRef.current.value="";}}>
      <option value="all">통합</option>
      <option value="client">거래처</option>
      <option value="pickup">상차지</option>
      <option value="drop">하차지</option>
      <option value="car">차량번호</option>
      <option value="driver">기사명</option>
      <option value="pay">지급방식</option>
      <option value="dispatch">배차방식</option>
      {fareOn && <option value="fare">운임구분</option>}{/* ⭐ 2026-11-06 운임구분 필터 버튼 대신 검색 항목으로 */}
    </CustomSelect>
    <input autoComplete="off"
      type="text"
      ref={qInputRef}
      defaultValue={qInput}
      onKeyUp={(e) => { if (e.key === "Enter") { setQ(qInputRef.current?.value ?? ""); } }}
      placeholder="검색어"
      className="px-2 h-full text-[11px] w-20 outline-none"
    />
    <button onClick={() => setQ(qInputRef.current?.value ?? "")} className="h-full px-2 bg-[#1B2B4B] text-white text-[11px] font-bold hover:bg-[#243a60] transition"><EditableText id="misc.btn.26528.조회" defaultText="조회" /></button>
  </div>
  <DetailFilterButton rows={rtDayRows} value={rtDetail} onApply={setRtDetail} withDate={false} getters={rtDetailGet} title="세부검색 · 실시간" />
  <BizLegend biz={rtBiz} className="ml-1" />{/* ⭐ 2026-11-09 청구 사업자 색 범례 */}
  <button onClick={() => setLookupOpen(true)} title="기간 + 배차담당자 + 차량번호·기사명으로 찾기" className="px-2 py-1 rounded-lg bg-white text-[#1B2B4B] border-2 border-[#1B2B4B] text-[11px] font-black whitespace-nowrap flex-shrink-0 hover:bg-[#EEF2F8]">담당자·차량 조회</button>
  <OrderLookupModal open={lookupOpen} onClose={() => setLookupOpen(false)} rows={lookupOpen ? (historyDispatchData || []).filter((r) => !r?.배차표Id) : []} nameOf={lookupNameOf} />{/* ⭐ 2026-11-06 실시간 조회에도 고정노선(배차표) 오더는 빼기 */}
  {/* ⭐ 2026-11-05 실시간 관제 — 지금 목록의 배차완료 지입·직영·임대 기사 전체 지도 */}
  <FleetLiveButton rows={filtered} size="md" />
  {/* 날짜 버튼 */}
  {["yesterday","today","tomorrow"].map((mode,i)=>{
    const labels=["어제","당일","내일"];
    return (
      <button key={mode} onClick={()=>setDayMode(mode)}
        className={`h-[30px] px-2 rounded-lg text-[11px] font-semibold transition whitespace-nowrap flex-shrink-0 ${dayMode===mode?"bg-[#1B2B4B] text-white":"bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
        {labels[i]}
      </button>
    );
  })}
  {/* 상태 필터 드롭다운 */}
  <CustomSelect
    value={statusFilter}
    onChange={e => setStatusFilter(e.target.value)}
    className="h-[30px] px-2 rounded-lg border-2 border-[#1B2B4B] text-[11px] font-semibold text-[#1B2B4B] bg-white outline-none flex-shrink-0 cursor-pointer"
  >
    <option value="ALL">전체 {filtered.length}</option>
    <option value="UNASSIGNED">미배차 {statusSummary.미배차}</option>
    <option value="ASSIGNED">완료 {statusSummary.배차완료}</option>
    {statusSummary.업체미전달>0 && <option value="UNDELIVERED">미전달 {statusSummary.업체미전달}</option>}
  </CustomSelect>

  <div className="ml-auto flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
    <button onClick={()=>{if(!selected.length)return showAlert("복사할 오더를 선택하세요.");if(selected.length>1)return copySimpleList();setCopyModalOpen(true);}} className="px-2 py-1 rounded-lg bg-gray-800 text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="realtime.toolbar.기사복사" defaultText="기사복사" /></button>
    <button onClick={()=>{
  const selRows = rows.filter(r => selected.includes(r._id));
  const phones = [...new Set(selRows.map(r => String(r.전화번호||"").replace(/[^\d]/g,"")).filter(Boolean))];
  if (phones.length === 0) {
    // 배차완료(전화번호 있는) 오더를 체크하지 않았으면 기존 동작 그대로 — 클립보드 복사만.
    const selRow=selected.length===1?rows.find(r=>r._id===selected[0]):null;
    const url=selRow?withCo(`${window.location.origin}/driver-upload?date=${encodeURIComponent(selRow.상차일||"")}&vehicle=${encodeURIComponent((selRow.차량번호||"").replace(/\s/g,""))}&name=${encodeURIComponent((selRow.이름||"").trim())}`):withCo(`${window.location.origin}/driver-upload`);
    const msg=`[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n여기를 눌러 업로드해주세요\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
    navigator.clipboard.writeText(msg).then(()=>showAlert("업로드 안내 메시지가 복사되었습니다.\n기사에게 붙여넣기로 전달하세요.")).catch(()=>showAlert(`링크: ${url}`));
    return;
  }
  // 배차완료된 오더를 1건 이상 체크한 상태 — 여러 기사에게 한 번에 문자로 보낼지 확인.
  const url = withCo(`${window.location.origin}/driver-upload`);
  const msg=`[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n여기를 눌러 업로드해주세요\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
  setBulkUploadConfirm4({ phones, body: msg });
}} className="px-2 py-1 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="realtime.toolbar.업로드링크" defaultText="업로드링크" />{selected.length>1?` (${selected.length})`:""}</button>
    {/* 🧹 2026-11-16 일마감 버튼은 뺐다(사용자 요청) — 마감은 배차현황 › 월 마감에서 */}

    <button onClick={()=>{if(!selected.length)return showAlert("삭제할 항목을 선택하세요.");const list=rows.filter(r=>selected.includes(r._id));setDeleteList(list);setDeleteConfirmOpen(true);}} className="px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="realtime.toolbar.선택삭제" defaultText="선택삭제" /></button>
    <button onClick={()=>setSelected([])} className="px-2 py-1 rounded-lg bg-gray-300 text-gray-800 text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="realtime.toolbar.선택초기화" defaultText="선택초기화" /></button>
    <button onClick={async ()=>{
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
  if(!filtered.length)return showAlert("내보낼 데이터가 없습니다.");
  const _sp=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p)&&p.length>0)return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length>0&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
  const _merge=(r,f1,f2)=>[..._sp(r[f1]),..._sp(r[f2])].filter(s=>s&&(s.업체명?.trim()||s.주소?.trim())).filter((s,i,a)=>{const k=s.업체명||s.주소;return a.findIndex(x=>(x.업체명||x.주소)===k)===i;});
  const _via=(list)=>list.map(s=>s.업체명||s.주소||"").filter(Boolean).join(", ");
  const _hasVia=filtered.some(r=>_merge(r,"경유상차목록","경유지_상차").length>0||_merge(r,"경유하차목록","경유지_하차").length>0);
  const rowsExcel=filtered.map((r,idx)=>{
    const row={순번:idx+1,...(rtMgrMap?{배차담당자:orderMgrName(rtMgrMap,r)||ORDER_MGR_EMPTY}:{}),등록일:r.등록일||"",상차일:r.상차일||"",상차시간:r.상차시간||"",하차일:r.하차일||"",하차시간:r.하차시간||"",...(rtBiz.multi?{청구사업자:bizOf(r,rtBiz.defaultName)}:{}),거래처명:r.거래처명||"",상차지명:r.상차지명||""};
    if(_hasVia)row["경유 상차지"]=_via(_merge(r,"경유상차목록","경유지_상차"));
    row.하차지명=r.하차지명||"";
    if(_hasVia)row["경유 하차지"]=_via(_merge(r,"경유하차목록","경유지_하차"));
    row.화물내용=mergeViaCargoText(r.화물내용,[r.경유상차목록,r.경유하차목록])||"";
    row.차량종류=r.차량종류||"";
    row.차량톤수=mergeViaTonnage(r.차량톤수,[r.경유상차목록,r.경유하차목록])||"";
    Object.assign(row,{차량번호:r.차량번호||"",기사명:r.이름||"",전화번호:formatPhone(r.전화번호||""),배차상태:r.배차상태||"",청구운임:toInt(r.청구운임),기사운임:toInt(r.기사운임),수수료:orderProfit(r),...(fareOn?{운임구분:r.운임구분||""}:{}),지급방식:r.지급방식||"",배차방식:r.배차방식||"",메모:r.메모||""});
    return row;
  });
  const ws=XLSX.utils.json_to_sheet(rowsExcel);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"실시간배차현황");saveWorkbook(XLSX,wb,`실시간배차현황_${kstFileDate()}.xlsx`); /* 🛠 2026-11-27 파일 이름이 'download'로 저장되던 문제 · 날짜를 이름에 · 전화번호 010-0000-0000 */
}} className="px-2 py-1 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-semibold shadow hover:opacity-90 whitespace-nowrap"><EditableText id="realtime.toolbar.엑셀다운" defaultText="엑셀다운" /></button>
    </div>
</div>

      {/* 테이블 */}
      <div>
      <div ref={rtTableWrapRef} className={`kp-grid overflow-x-auto rounded-xl shadow border ${isDark ? "border-gray-700" : "border-gray-200"}`}>
  <table className="w-full min-w-max table-auto">
          <thead className={isDark ? "bg-[#0f172a]" : "bg-[#1B2B4B]"}>
            <tr>
              {[
                "선택",
                "순번",
                ...(rtMgrMap ? ["배차담당자"] : []),
                "등록일",
                "상차일",
                "상차시간",
                "하차일",
                "하차시간",
                "거래처명",
                "상차지명",
                "상차지주소",
                "하차지명",
                "하차지주소",
                "화물내용",
                "차량종류",
                "차량톤수",
                "혼적",
                "차량번호",
                "이름",
                "전화번호",
                "배차상태",
                "청구운임",
                "기사운임",
                "수수료",
                "지급방식",
                "배차방식",
                "메모",
                "전달사항",
               "첨부",
                "전달상태",
              ].map((h) => {
                return (
                <SortTh key={h} k={h === "선택" ? "" : h} sort={rtSort.sort} onSort={rtSort.toggle} className={head}>
                  {h === "선택" ? (
                    <input autoComplete="off" type="checkbox"
                      title="전체선택/전체해제"
                      checked={filtered.length > 0 && filtered.every(r => selected.includes(r._id))}
                      onChange={() => {
                        const allSelected = filtered.length > 0 && filtered.every(r => selected.includes(r._id));
                        const filteredIds = filtered.map(r => r._id);
                        setSelected(prev => allSelected
                          ? prev.filter(id => !filteredIds.includes(id))
                          : Array.from(new Set([...prev, ...filteredIds])));
                      }}
                    />
                  ) : (
                    <EditableText id={`realtime.table.header.${h}`} defaultText={h} />
                  )}
                </SortTh>
                );
              })}
            </tr>
          </thead>

          <tbody {...rtLongPress.tbodyProps} className={`kp-rt-body ${isDark ? "kp-rt-dark" : ""} ${rtLongPress.selectMode ? "kp-select-mode" : ""}`}>
          <PlateSuggestCtx.Provider value={plateSuggestCtx}>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={27} className="py-16 text-center text-[13px] text-gray-500">
                  조회된 결과가 없습니다.
                </td>
              </tr>
            )}
            {rtVisible.map((r, idx) => (
              <RealtimeRow
                key={r._id || r.id || `idx-${idx}`}
                r={r}
                idx={idx}
                mgrName={rtMgrMap ? orderMgrName(rtMgrMap, r) : null}
                bizTag={rtBiz.multi ? bizOf(r, rtBiz.defaultName) : null} bizMain={bizOf(r, rtBiz.defaultName) === rtBiz.defaultName} bizColor={rtBiz.multi ? bizColorOf(rtBiz, bizOf(r, rtBiz.defaultName)) : null}
                isSelected={selected.includes(r._id)}
                isFading={fadingIds.has(r._id)}
                isHighlighted={highlightIds.has(r._id)}
                isDark={isDark}
                selectedEditMode={selectedEditMode}
                editedForRow={edited[r._id]}
                toInt={toInt}
                formatComma={formatComma}
                formatPhone={formatPhone}
                getCreatedMs={getCreatedMs}
                getUpdatedMs={getUpdatedMs}
                getDispatchConfirmedMs={getDispatchConfirmedMs}
                formatKstDateTime={formatKstDateTime}
                getCreatorLabel={(r) => getCreatorLabel(r, userNameMap)}
                editableInput={editableInput}
                renderAddrCell={renderAddrCell}
                renderCargoCell={renderCargoCell}
                canEdit={canEdit}
                handleEditChange={handleEditChange}
                dispatchData={dispatchData}
                placeRows={placeRows}
                lunchByName={lunchByName}
                isFirstPickupLunch={lunchFirstIds.pickup.has(r._id)}
                isFirstDropLunch={lunchFirstIds.drop.has(r._id)}
                timeOptions={timeOptions}
                patchDispatch={patchDispatch}
                setRows={setRows}
                setContextMenu={setContextMenu}
                setCopyTarget={setCopyTarget}
                setCopyPanelOpen={setCopyPanelOpen}
                toggleSelect={toggleSelect}
                handleCarInput={handleCarInput}
                driverConfirmOpen={driverConfirmOpen}
                memoAlert={memoAlert}
                blackAlert={blackAlert}
                setCancelReqPopup={setCancelReqPopup}
                markEditRequestSeen={markEditRequestSeen}
                setEditReqPopup={setEditReqPopup}
                setConfirmChange={setConfirmChange}
                flashRow={flashRow}
                setAttachViewer={setAttachViewer}
                setLiveLocViewer={setLiveLocViewer}
                setDeliveryConfirm={setDeliveryConfirm}
                setWorkDatesEditRow={setWorkDatesEditRow}
                fareRules={fareOn ? fareR.rules : null}
              />
            ))}
          </PlateSuggestCtx.Provider>
          </tbody>
        </table>
        <AssignConfirm target={plateAssignAsk} busy={plateAssignBusy} onCancel={() => setPlateAssignAsk(null)} onOk={doPlateAssign} />
      </div>
      {filtered.length > rtVisible.length && (
        <KpMoreRows shown={rtVisible.length} total={filtered.length} onMore={rtShowMore} />
      )}
      <StickyHScrollbar targetRef={rtTableWrapRef} />
      {rtLongPress.selectMode && (
        <KpSelectModeBar count={selected.length} onSelectAll={() => setSelected(filtered.map((r) => r._id))} onClear={() => setSelected([])} onExit={() => rtLongPress.setSelectMode(false)} />
      )}
      </div>
{/* ================= 임박 미배차 팝업 ================= */}
{menu === "실시간배차현황" && notificationsEnabled && urgentPopup.length > 0 && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white w-[440px] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      <div className="bg-[#1B2B4B] px-5 py-4">
        <div className="text-[15px] font-bold text-white">미배차 임박 알림</div>
        <div className="text-[12px] text-white/55 mt-0.5">상차 30분 이내 미배차 오더</div>
      </div>
      <div className="p-5">
        <div className="text-[13px] font-semibold text-[#1B2B4B] mb-3">
          {urgentPopup.length}건의 배차가 임박했습니다
        </div>
        <div className="space-y-2 max-h-[240px] overflow-y-auto">
          {urgentPopup.map((r) => (
            <div key={r._id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-2 h-2 rounded-full bg-[#1B2B4B] flex-shrink-0" />
              <div>
                <span className="text-[13px] font-bold text-[#1B2B4B]">{r.상차시간}</span>
                <span className="text-[13px] text-gray-600 ml-2">{r.상차지명}</span>
                <span className="text-[11px] text-gray-500 ml-1">({r.거래처명})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-5 flex gap-2">
        <div className="flex gap-1.5 flex-1">
          {[5, 10, 30].map((min) => (
            <button key={min} onClick={() => handleUrgentSnooze(min)}
              className="flex-1 py-2 text-[12px] font-semibold text-gray-500 border border-gray-200 rounded-xl hover:border-[#1B2B4B]/30 hover:text-[#1B2B4B] transition">
              {min}분 후 알림
            </button>
          ))}
        </div>
        <button onClick={handleUrgentDismiss}
          className="px-5 py-2 text-[13px] font-bold text-white bg-[#1B2B4B] rounded-xl hover:bg-[#243a60] transition">
          확인
        </button>
      </div>
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
    drivers={drivers} clients={clients} places={placeRows} tonOptions={tonOptions} upsertDriver={upsertDriver}
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
    {/* 운임조회 */}
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
    if (!copyTarget?._id) {
      showAlert("수정할 오더 정보를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }
    if (isReversedDateOrder(copyTarget?.상차일, copyTarget?.하차일)) {
      showAlert(REVERSED_DATE_ORDER_MSG);
      return;
    }
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    if (!(await cpDrvEdit.finish(copyTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택

    // ✅ 화물내용: 이미 onChange에서 동기화되어 있으므로 그대로 사용
    const finalCargo = copyTarget.화물내용 || "";

    const payload = {
      ...copyTarget,
      화물내용: finalCargo, 독차: dokchaOn(copyTarget), // ⭐ 2026-11-06 혼적·왕복이 아니면 독차(기본)
      updatedAt: Date.now(),
    };
    delete payload.createdAt;
    // ✅ 임시 UI 필드 제거 (DB에 저장하면 안 됨)
    delete payload.화물수량;
    delete payload.화물타입;
    delete payload.톤수값;
    delete payload.톤수타입;

const savedId = copyTarget._id;
    { // 🎬 2026-11-25 이번 저장으로 배차가 됐으면(차량번호가 새로 들어감) "배차 완료" 알림 뒤에 이어서 뜨게 한다
      const _o = (rows || []).find((r) => r._id === copyTarget._id) || (dispatchData || []).find((r) => r._id === copyTarget._id);
      const _np = normalizePlate(copyTarget.차량번호 || "");
      sflowToast("오더 수정 완료", "success", _np && _np !== normalizePlate(_o?.차량번호 || "") ? { afterDispatch: true } : null);
    }
    setCopyPanelOpen(false);
    // ⭐ 일마감 검증에서 열었던 수정이면, 방금 고친 내용이 반영되도록 검증을
    // 자동으로 다시 계산한다(오류/경고).
    if (dailyCloseIssueCtx) {
      setDailyCloseIssueCtx(null);
      setTimeout(() => { runDailyClose(); }, 300);
    }
    React.startTransition(() => {
      setRows(prev => prev.map(r => r._id === savedId ? { ...r, ...payload } : r));
    });

flashRow(savedId);
    setTimeout(() => {
      const el = document.getElementById(`row-${savedId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);

    // 🛠 2026-11-24 저장이 거절되면(최종마감 · 날짜 역순 등 — patchDispatch가 false) 화면에 먼저 반영해 둔 값을 원래대로 되돌린다
    //  (예전엔 "수정 완료"로 보이다가 새로고침하면 예전 값으로 돌아갔다)
    const _before = rows.find((r) => r._id === savedId);
    Promise.resolve(patchDispatch(savedId, copyPanelDiff(payload, copyOrigRef.current))).then((ok) => {
      if (ok === false && _before) { setRows((prev) => prev.map((r) => (r._id === savedId ? _before : r))); sflowToast("저장되지 않았어요. 안내 창을 확인해 주세요.", "error"); }
    }).catch(console.error);
    if (payload.상차지명) savePlaceSmart(payload.상차지명, payload.상차지주소||"", payload.상차지담당자||"", payload.상차지담당자번호||"", null, undefined,
      (payload.상차지오더메모 !== undefined || payload.상차지오더메모팝업표시 !== undefined || payload.상차지기사전달주의사항 !== undefined) ? { 오더메모: payload.상차지오더메모, 팝업표시: payload.상차지오더메모팝업표시, 기사전달주의사항: payload.상차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (payload.하차지명) savePlaceSmart(payload.하차지명, payload.하차지주소||"", payload.하차지담당자||"", payload.하차지담당자번호||"", null, undefined,
      (payload.하차지오더메모 !== undefined || payload.하차지오더메모팝업표시 !== undefined || payload.하차지기사전달주의사항 !== undefined) ? { 오더메모: payload.하차지오더메모, 팝업표시: payload.하차지오더메모팝업표시, 기사전달주의사항: payload.하차지기사전달주의사항 } : undefined
    ).catch(console.error);
    if (payload.차량번호 && payload.이름) {
      const existingD = (drivers||[]).find(d => normalizePlate(d.차량번호) === normalizePlate(payload.차량번호));
      if (!existingD) {
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
    const ok = await submitCopyOrdersPC(copyTarget, approvedShippers, undefined, (rows || []).find((r) => r._id === copyTarget._id) || (dispatchData || []).find((r) => r._id === copyTarget._id)); // ⭐ 2026-11-06 몇 건·날짜 고르기 · 🛠 2026-11-24 패널에서 바꾼 날짜로 시작
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
    <div className="text-[13px] font-bold text-[#1B2B4B] mb-2">일마감 검증: 이 오더의 문제점 ({dailyCloseIssueCtx.length}건)</div>
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
{/* ================= 거래처 정보 ================= */}
<section className="bg-white rounded-xl border border-[#E3E8F0]">
  <div className="bg-[#1B2B4B] px-5 py-2 rounded-t-xl"><h3 className="text-[14px] font-bold text-white"><EditableText id="copyPanel.section.거래처정보" defaultText="거래처 정보" /></h3></div>
  <div className="px-5 py-3 grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 items-end">
{/* ================= 오더 유형 버튼 ================= */}
<div className="flex items-center gap-2 flex-wrap">
  <span className="text-[13.5px] font-bold text-[#5B6B85] mr-1">오더 유형</span>
  {/* ⭐ 2026-11-09 독차 버튼 제거 — 혼적·왕복이 아니면 자동으로 독차 */}
  <button type="button"
    onClick={() => setCopyTarget(p => ({ ...p, 혼적: !p.혼적, 독차: !!p.혼적 }))} /* ⭐ 2026-11-06 혼적을 끄면 독차(기본) */
    className={`px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${copyTarget.혼적 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
  ><EditableText id="misc.btn.26997.혼적" defaultText="혼적" /></button>
  <button type="button"
    onClick={() => setCopyTarget(p => (p.운행유형 === "왕복" ? { ...p, 운행유형: "편도", 회전수: 1, 메모: withRotationMemo(p.메모, 1) } : { ...p, 운행유형: "왕복" }))}
    className={`px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${copyTarget.운행유형 === "왕복" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
  ><EditableText id="misc.btn.27001.왕복" defaultText="왕복" /></button>
  {/* ⭐ 왕복일 때만 회전수 선택 (기존 오더 수정/복사는 한 오더로 묶기) */}
  {copyTarget.운행유형 === "왕복" && (
    <RotationPicker size="sm" allowSplit={false} count={copyTarget.회전수 || 1}
      onChange={(c) => setCopyTarget(p => ({ ...p, 회전수: c, 메모: withRotationMemo(p.메모, c) }))} />
  )}
  <button type="button"
    onClick={() => setCopyTarget(p => ({ ...p, 긴급: !p.긴급 }))}
    className={`px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${copyTarget.긴급 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
  ><EditableText id="misc.btn.27005.긴급" defaultText="긴급" /></button>
  {/* 👤 2026-11-13 담당자 변경 — 오더 유형 줄 오른쪽 끝 */}
  <OrderStaffFields className="ml-auto" order={copyTarget} setOrder={setCopyTarget} disabled={isViewerNow()} />
</div>


  <div className="space-y-1.5">
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

          const list = filterEditClients(v);   // ★ 이거 중요
          setCopyClientOptions(list);
          setShowCopyClientDropdown(true);
          setCopyClientIndex(0);
        }}

        onKeyDown={(e)=>{
          if(!showCopyClientDropdown) return;

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

  // 👉 기존처럼 값 넣고
  setCopyTarget(prev=>({
    ...prev,
    거래처명: c.거래처명,
    거래처전화번호: c.연락처 || "",
    거래처담당자: c.담당자 || "",
  }));

  // 🔥 여기 추가 (핵심)
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
          if(e.key==="Escape"){
            setShowCopyClientDropdown(false);
          }
        }}

        onBlur={()=>setTimeout(()=>setShowCopyClientDropdown(false),150)}
      />

      {showCopyClientDropdown && (
        <div ref={copyClientListRef} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto shadow rounded-md">
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
      <CpField label={<span className="flex items-center gap-1.5">상차지명<OrderMemoIconButton onClick={() => openPanelMemoC4("pickup")} hasMemo={hasPanelMemoC4("pickup")} /></span>}>
        <div className="relative">
          <input autoComplete="off"
          disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
            className={cpInputStyle}
            value={copyTarget?.상차지명 ?? ""}
            onChange={(e)=>{
              const v = e.target.value;
              setCopyTarget(p=>({...p, 상차지명:v, ...(v.trim() === "" && { 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "" })}));
              setCopyPlaceType("pickup");

              const list = filterEditPlaces(v);
              setCopyPlaceOptions(list);
              setShowCopyPlaceDropdown(true);
              setCopyActiveIndex(0);
            }}
            onKeyDown={(e)=>{
              if(!showCopyPlaceDropdown || copyPlaceType!=="pickup") return;

              if(e.key==="ArrowDown"){
                e.preventDefault();
                setCopyActiveIndex(i=>Math.min(i+1, copyPlaceOptions.length-1));
              }
              if(e.key==="ArrowUp"){
                e.preventDefault();
                setCopyActiveIndex(i=>Math.max(i-1,0));
              }
              if(e.key==="Escape"){
                setShowCopyPlaceDropdown(false);
              }
              if(e.key==="Enter"){
                e.preventDefault();
                const p = copyPlaceOptions[copyActiveIndex];
                if(!p) return;
                const cts4ce = (p.contacts || []).filter(c => c.name?.trim());
                const ucts4ce = [...new Map(cts4ce.map(c => [c.name.trim(), c])).values()];
                const prim4ce = ucts4ce.find(c => c.isPrimary) || ucts4ce[0];
                setCopyTarget(prev=>({
                  ...prev,
                  상차지명:p.업체명,
                  상차지주소:p.주소 || "",
                  상차지담당자:prim4ce?.name || p.담당자 || "",
                  상차지담당자번호:prim4ce?.phone || p.담당자번호 || "",
                }));
                if (ucts4ce.length > 1) setPanelContactPopup4({ type: "pickup", place: p, contacts: ucts4ce, setter: setCopyTarget, pickupKey: "상차", dropKey: "하차" });
                checkWarningStatus(p.업체명, "상차지");
                setShowCopyPlaceDropdown(false);
              }
              if(e.key==="Tab"){
                const p = copyPlaceOptions[copyActiveIndex];
                if(p){
                  const cts4ceT = (p.contacts || []).filter(c => c.name?.trim());
                  const ucts4ceT = [...new Map(cts4ceT.map(c => [c.name.trim(), c])).values()];
                  const prim4ceT = ucts4ceT.find(c => c.isPrimary) || ucts4ceT[0];
                  setCopyTarget(prev=>({
                    ...prev,
                    상차지명:p.업체명,
                    상차지주소:p.주소 || "",
                    상차지담당자:prim4ceT?.name || p.담당자 || "",
                    상차지담당자번호:prim4ceT?.phone || p.담당자번호 || "",
                  }));
                  checkWarningStatus(p.업체명, "상차지");
                  setShowCopyPlaceDropdown(false);
                }
              }
            }}
            onBlur={()=>setTimeout(()=>setShowCopyPlaceDropdown(false),150)}
          />

          {showCopyPlaceDropdown && copyPlaceType==="pickup" && (
            <div ref={copyPlaceDropdownListRef} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto shadow rounded-md">
              {copyPlaceOptions.map((p,i)=>(
                <div
                  key={i}
                  className={`px-3 py-2 cursor-pointer ${
                    i===copyActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
                  }`}
                  onMouseDown={()=>{
                    const cts4c = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts4c = [...new Map(cts4c.map(c => [c.name.trim(), c])).values()];
                    const prim4c = ucts4c.find(c => c.isPrimary) || ucts4c[0];
                    setCopyTarget(prev=>({
                      ...prev,
                      상차지명:p.업체명,
                      상차지주소:p.주소 || "",
                      상차지담당자:prim4c?.name || p.담당자 || "",
                      상차지담당자번호:prim4c?.phone || p.담당자번호 || "",
                    }));
                    if (ucts4c.length > 1) setPanelContactPopup4({ type: "pickup", place: p, contacts: ucts4c, setter: setCopyTarget, pickupKey: "상차", dropKey: "하차" });
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
        <button type="button" tabIndex={-1} onClick={() => showAlert(copyTarget?.상차지주소 || "")} className="text-[11px] text-[#1B2B4B] font-semibold underline"><EditableText id="misc.btn.27300.더보기" defaultText="더보기" /></button>
      )}</span>}>
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.상차지주소 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 상차지주소:e.target.value}))}
        />
      </CpField>

      <CpField label={<span className="flex items-center justify-between w-full">상차지 담당자명<ContactPickerIconButton title="상차지 담당자명 선택" onClick={() => { const nm = copyTarget?.상차지명 || ""; if (!nm.trim()) return showAlert("상차지명을 먼저 입력하세요."); const p = (mergedClients || []).find(x => nameKeyOf(x.업체명) === nameKeyOf(nm)); const cs = uniqueContactsOf(p); if (!cs.length) return showAlert("등록된 담당자가 없습니다."); setPanelContactPopup4({ type: "pickup", place: p, contacts: cs, setter: setCopyTarget, pickupKey: "상차", dropKey: "하차" }); }} /></span>}>
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

      {/* ── 상차 경유지 표시 + 수정 ── */}
      {(() => {
        const safeParse = (v) => {
          if (Array.isArray(v) && v.length > 0) return v;
          if (typeof v === "string" && v.trim().startsWith("[")) {
            try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
          }
          if (v && typeof v === "object" && !Array.isArray(v)) {
            const keys = Object.keys(v);
            if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
              return keys.sort((a,b) => Number(a) - Number(b)).map(k => v[k]);
            if (v.업체명) return [v];
          }
          return [];
        };
        const stops = [
          ...safeParse(copyTarget?.경유상차목록),
          ...safeParse(copyTarget?.경유지_상차),
        ].filter(s => s && (s.업체명?.trim() || s.주소?.trim()))
         .filter((s, i, arr) => arr.findIndex(x => (x.업체명 || x.주소) === (s.업체명 || s.주소)) === i);

        return <WaypointSection stops={stops} type="pickup" onSave={(newList) => setCopyTarget(p => ({ ...p, 경유상차목록: newList, 경유지_상차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mt-3" orderDate={copyTarget?.상차일 || ""} />;
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
      <CpField label={<span className="flex items-center gap-1.5">하차지명<OrderMemoIconButton onClick={() => openPanelMemoC4("drop")} hasMemo={hasPanelMemoC4("drop")} /></span>}>
        <div className="relative">
          <input autoComplete="off"
          disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
            className={cpInputStyle}
            value={copyTarget?.하차지명 ?? ""}
            onChange={(e)=>{
              const v = e.target.value;
              setCopyTarget(p=>({...p, 하차지명:v, ...(v.trim() === "" && { 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "" })}));
              setCopyPlaceType("drop");

              const list = filterEditPlaces(v);
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
                const cts4cde2 = (p.contacts || []).filter(c => c.name?.trim());
                const ucts4cde2 = [...new Map(cts4cde2.map(c => [c.name.trim(), c])).values()];
                const prim4cde2 = ucts4cde2.find(c => c.isPrimary) || ucts4cde2[0];
                setCopyTarget(prev=>({
                  ...prev,
                  하차지명:p.업체명,
                  하차지주소:p.주소 || "",
                  하차지담당자:prim4cde2?.name || p.담당자 || "",
                  하차지담당자번호:prim4cde2?.phone || p.담당자번호 || "",
                }));
                if (ucts4cde2.length > 1) setPanelContactPopup4({ type: "drop", place: p, contacts: ucts4cde2, setter: setCopyTarget, pickupKey: "상차", dropKey: "하차" });
                checkWarningStatus(p.업체명, "하차지");
                setShowCopyPlaceDropdown(false);
              }
              if(e.key==="Tab"){
                const p = copyPlaceOptions[copyActiveIndex];
                if(p){
                  const cts4cde2T = (p.contacts || []).filter(c => c.name?.trim());
                  const ucts4cde2T = [...new Map(cts4cde2T.map(c => [c.name.trim(), c])).values()];
                  const prim4cde2T = ucts4cde2T.find(c => c.isPrimary) || ucts4cde2T[0];
                  setCopyTarget(prev=>({
                    ...prev,
                    하차지명:p.업체명,
                    하차지주소:p.주소 || "",
                    하차지담당자:prim4cde2T?.name || p.담당자 || "",
                    하차지담당자번호:prim4cde2T?.phone || p.담당자번호 || "",
                  }));
                  checkWarningStatus(p.업체명, "하차지");
                  setShowCopyPlaceDropdown(false);
                }
              }
            }}
            onBlur={()=>setTimeout(()=>setShowCopyPlaceDropdown(false),150)}
          />

          {showCopyPlaceDropdown && copyPlaceType==="drop" && (
            <div ref={copyPlaceDropdownListRef} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto shadow rounded-md">
              {copyPlaceOptions.map((p,i)=>(
                <div
                  key={i}
                  className={`px-3 py-2 cursor-pointer ${
                    i===copyActiveIndex ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
                  }`}
                  onMouseDown={()=>{
                    const cts4cd2 = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts4cd2 = [...new Map(cts4cd2.map(c => [c.name.trim(), c])).values()];
                    const prim4cd2 = ucts4cd2.find(c => c.isPrimary) || ucts4cd2[0];
                    setCopyTarget(prev=>({
                      ...prev,
                      하차지명:p.업체명,
                      하차지주소:p.주소 || "",
                      하차지담당자:prim4cd2?.name || p.담당자 || "",
                      하차지담당자번호:prim4cd2?.phone || p.담당자번호 || "",
                    }));
                    if (ucts4cd2.length > 1) setPanelContactPopup4({ type: "drop", place: p, contacts: ucts4cd2, setter: setCopyTarget, pickupKey: "상차", dropKey: "하차" });
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
        <button type="button" tabIndex={-1} onClick={() => showAlert(copyTarget?.하차지주소 || "")} className="text-[11px] text-[#1B2B4B] font-semibold underline"><EditableText id="misc.btn.27495.더보기" defaultText="더보기" /></button>
      )}</span>}>
        <input autoComplete="off"
        disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
          className={cpInputStyle}
          value={copyTarget?.하차지주소 ?? ""}
          onChange={(e)=>setCopyTarget(p=>({...p, 하차지주소:e.target.value}))}
        />
      </CpField>

      <CpField label={<span className="flex items-center justify-between w-full">하차지 담당자명<ContactPickerIconButton title="하차지 담당자명 선택" onClick={() => { const nm = copyTarget?.하차지명 || ""; if (!nm.trim()) return showAlert("하차지명을 먼저 입력하세요."); const p = (mergedClients || []).find(x => nameKeyOf(x.업체명) === nameKeyOf(nm)); const cs = uniqueContactsOf(p); if (!cs.length) return showAlert("등록된 담당자가 없습니다."); setPanelContactPopup4({ type: "drop", place: p, contacts: cs, setter: setCopyTarget, pickupKey: "상차", dropKey: "하차" }); }} /></span>}>
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

      {/* ── 하차 경유지 표시 + 수정 ── */}
      {(() => {
        const safeParse = (v) => {
          if (Array.isArray(v) && v.length > 0) return v;
          if (typeof v === "string" && v.trim().startsWith("[")) {
            try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
          }
          if (v && typeof v === "object" && !Array.isArray(v)) {
            const keys = Object.keys(v);
            if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
              return keys.sort((a,b) => Number(a) - Number(b)).map(k => v[k]);
            if (v.업체명) return [v];
          }
          return [];
        };
        const stops = [
          ...safeParse(copyTarget?.경유하차목록),
          ...safeParse(copyTarget?.경유지_하차),
        ].filter(s => s && (s.업체명?.trim() || s.주소?.trim()))
         .filter((s, i, arr) => arr.findIndex(x => (x.업체명 || x.주소) === (s.업체명 || s.주소)) === i);

        return <WaypointSection stops={stops} type="drop" onSave={(newList) => setCopyTarget(p => ({ ...p, 경유하차목록: newList, 경유지_하차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mt-3" orderDate={copyTarget?.하차일 || ""} />;
      })()}

    </div>


  </div>
</div>
</section>
{/* ===== 스마트 기사 검색 (복사패널) ===== */}
<section className="bg-white rounded-xl border border-[#E3E8F0] divide-y divide-gray-100 overflow-hidden">
  <div className="px-5 pt-3.5 pb-0"><h3 className="text-[14px] font-bold text-[#1B2B4B] flex items-center gap-1.5"><span className="w-1 h-3.5 bg-[#1B2B4B] rounded-full inline-block"></span>기사 스마트 검색</h3></div>
<div className="px-4 py-2">
    <div className="relative" style={{overflow: "visible"}}>
      <input autoComplete="off"
        className="w-full border-2 border-[#1B2B4B] rounded-lg px-3 py-2 text-[14px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-500"
        placeholder="이름·차량번호·전화번호 또는 문자 내용 붙여넣기 → Enter로 자동 적용"
        value={smartQ4}
        onChange={e=>handleSmart4Input(e.target.value)}
        onKeyDown={e=>handleSmart4KeyDown(e, copyTarget, setCopyTarget)}
        onBlur={e=>{ setTimeout(()=>{ if(e.target.value.trim().length>4) applySmart4(copyTarget,setCopyTarget,e.target.value); setSmartList4([]); setSmart4ActiveIdx(-1); },200);}}
      />
{smartList4.length>0 && (
        <div className="absolute z-[9999] w-full bg-white border-2 border-[#1B2B4B] rounded-xl shadow-xl mt-0.5 overflow-hidden">
          <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-semibold">등록된 기사 {smartList4.length}명</div>
          {smartList4.map((d,i)=>(
            <div key={i} className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 flex items-center justify-between ${i===smart4ActiveIdx?"bg-blue-100":"hover:bg-blue-50"}`}
              onMouseEnter={()=>setSmart4ActiveIdx(i)}
              onMouseDown={()=>selectSmart4Driver(d, setCopyTarget)}>
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
        value={copyTarget?.차량번호 ?? ""}

        onKeyDown={(e) => {
          if (e.key !== "Enter") return;

          const plate = normalizePlate(e.target.value);
          if (!plate) return;
          const matches = driverMap.get(plate) || [];

          // 기존 기사면(1명이든 여러 명이든) 아무 작업 안함 — 선택/매칭은 onChange에서 처리
          if (matches.length > 0) return;

          const plateVal = e.target.value;
          driverPanelCallbackRef.current = async (name, fmt) => {
            setCopyTarget(prev => ({ ...prev, 차량번호: plateVal, 이름: name, 전화번호: fmt, 배차상태: "배차완료" }));
          };
          setDriverConfirmInfo({ type: "new", 차량번호: plateVal, 이름: "", 전화번호: "" });
          setDriverConfirmRowId("__panel__");
          setQuickRegMode(true);
          setQuickRegName(""); setQuickRegPhone("");
          setDriverConfirmOpen(true);
        }}
        onBlur={(e) => {
          const plate = normalizePlate(e.target.value);
          if (!plate) return;
          const matches = driverMap.get(plate) || [];
          if (matches.length > 0) return;
          const plateVal = e.target.value;
          driverPanelCallbackRef.current = async (name, fmt) => {
            setCopyTarget(prev => ({ ...prev, 차량번호: plateVal, 이름: name, 전화번호: fmt, 배차상태: "배차완료" }));
          };
          setDriverConfirmInfo({ type: "new", 차량번호: plateVal, 이름: "", 전화번호: "" });
          setDriverConfirmRowId("__panel__");
          setQuickRegMode(true);
          setQuickRegName(""); setQuickRegPhone("");
          setDriverConfirmOpen(true);
        }}
        onChange={(e) => {
          const v = e.target.value;
          const plate = normalizePlate(v);
          cpDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
          // ⚠️ 동일 차량번호로 기사님이 여러 명 등록돼 있으면(drivers.find가 임의로 1명만
          // 골라 조용히 매칭해버리던 버그) 스마트검색과 동일하게 선택 팝업을 띄운다.
          const matches = driverMap.get(plate) || [];

          if (matches.length > 1) {
            setCopyTarget(prev => ({ ...prev, 차량번호: v }));
            setCopyDriverPick({ list: matches });
            return;
          }

          const match = matches[0];

          // 🔥 블랙/메모 기사 팝업
          if (match) {
            const grade = match?.등급 || match?.grade || "";
            if (grade === "블랙") {
              setBlackAlert(match);
            } else if (shouldShowDriverMemoAlert(match)) {
              window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: match }));
            }
          }

          setCopyTarget(prev => ({
            ...prev,
            차량번호: v,
            이름: match?.이름 || "",
            전화번호: formatPhone(match?.전화번호 || ""),
            배차상태: match ? "배차완료" : "배차중",
          }));
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

  <div className="relative w-full">

    {/* 🔹 통합 박스 */}
    <div className="flex items-center border rounded-lg overflow-hidden bg-white">

      {/* 입력 */}
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

      {/* 드롭다운 */}
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

  </div>

</CpField>

    <CpField label={<span className="flex items-center gap-1 flex-wrap">화물내용<button type="button" tabIndex={-1} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer" onClick={() => setCargoAddPopup({ initialValue: copyTarget?.화물내용||"", onCommit: (v) => setCopyTarget(p=>({...p,화물내용:v})) })}>+ 추가</button><CargoExtraChips value={copyTarget?.화물내용} /></span>}>

  <div className="flex items-center border rounded-lg overflow-hidden bg-white">

    {/* 입력 */}
    <input autoComplete="off"
    disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
      className="flex-1 min-w-0 w-0 px-3 py-2 text-[14.5px] font-bold outline-none"
value={copyTarget?.화물수량 || ""}
      onChange={(e) => {
        const v = e.target.value;

        setCopyTarget(p => ({
          ...p,
          화물수량: v,
          화물내용: p.화물타입
            ? `${v}${p.화물타입}`
            : v
        }));
      }}
      placeholder="1"
    />

    {/* 드롭다운 */}
    <CustomSelect
    disabled={(copyTarget?.source === "shipper" || copyTarget?.source === "shipper_mobile")}
      className="shrink-0 w-[96px] pl-3 pr-6 py-2 bg-[#1B2B4B] text-white text-[14px] font-bold outline-none cursor-pointer"
      value={copyTarget?.화물타입 || ""}
      onChange={(e) => {
        const type = e.target.value;

        setCopyTarget(p => ({
          ...p,
          화물타입: type,
          화물내용: type
            ? `${p.화물수량 || ""}${type}`
            : (p.화물수량 || "")
        }));
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

          {/* ⭐ 2026-11-02 위 기사정보·화물정보와 같은 3칸 배치(5칸은 칸이 너무 좁아 입력칸이 짧게 보였다) */}
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

{/* ===================== 변경 이력(공용 타임라인) ===================== */}
<details className="bg-white rounded-xl border border-[#E3E8F0] px-4 py-2 group">
  <summary className="cursor-pointer select-none text-[13.5px] font-bold text-[#1B2B4B] list-none flex items-center gap-1.5"><span className="inline-block transition-transform group-open:rotate-90">›</span>변경 이력 <span className="font-semibold text-[#9AA9C3]">(눌러서 펼치기 · 위 '변경 이력' 버튼으로도 볼 수 있음)</span></summary>
  <div className="mt-2 max-h-64 overflow-y-auto pr-1"><OrderTimeline order={copyTarget} size="sm" userName={(u) => userNameMap?.get?.(String(u || "").trim().toLowerCase())} /></div>
</details>

{/* ===================== 복사패널 운임조회 - 이력없음 확인 ===================== */}
<FareNoHistoryConfirm open={copyAddrConfirmOpen} onClose={() => setCopyAddrConfirmOpen(false)} onYes={() => { setCopyAddrConfirmOpen(false); setCopyAddrSearchOpen(true); }} />

{/* ===================== 복사패널 운임조회 - 주소 검색 ===================== */}
<AddrFareSearchModal open={copyAddrSearchOpen} onClose={() => setCopyAddrSearchOpen(false)} client={copyAddrClient} setClient={setCopyAddrClient} pickup={copyAddrPickup} setPickup={setCopyAddrPickup} drop={copyAddrDrop} setDrop={setCopyAddrDrop} onSearch={handleCopyAddrSearch} />

{/* ===================== 복사패널 운임조회 모달 ===================== */}
{copyFarePanelOpen && fareResult && (
  <FareResultModal result={fareResult} target={copyTarget} records={sortFareHistory(fareResult.records || [], fareSortMode)} sortControl={<FareSortDropdown value={fareSortMode} onChange={setFareSortMode} />} filter={copyFareFilter} setFilter={setCopyFareFilter}
    onApply={(v) => { setCopyTarget(p => fareOn ? fareFormChange(p, "청구운임", String(v), fareR.rules) : ({ ...p, 청구운임: String(v) })); setCopyFarePanelOpen(false); }}
    onClose={() => setCopyFarePanelOpen(false)} />
)}
{/* ── 경유지 수정 모달 ── */}
<StopEditModal
  open={editStopOpen}
  onClose={() => setEditStopOpen(false)}
  onSave={(newList) => {
    if (editStopType === "pickup") {
      setEditTarget(p => ({
        ...p,
        경유상차목록: newList,
        경유지_상차: newList,
      }));
    } else {
      setEditTarget(p => ({
        ...p,
        경유하차목록: newList,
        경유지_하차: newList,
      }));
    }
  }}
  list={(() => {
    const safeParse = (v) => {
      if (Array.isArray(v) && v.length > 0) return v;
      if (typeof v === "string" && v.trim().startsWith("[")) {
        try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const keys = Object.keys(v);
        if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
          return keys.sort((a,b) => Number(a) - Number(b)).map(k => v[k]);
        if (v.업체명) return [v];
      }
      return [];
    };
    if (editStopType === "pickup") {
      return [
        ...safeParse(editTarget?.경유상차목록),
        ...safeParse(editTarget?.경유지_상차),
      ].filter(s => s?.업체명?.trim());
    }
    return [
      ...safeParse(editTarget?.경유하차목록),
      ...safeParse(editTarget?.경유지_하차),
    ].filter(s => s?.업체명?.trim());
  })()}
  type={editStopType}
  placeRows={mergedClients}
  timeOptions={timeOptions}
/>

{clientApplyPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[320px] overflow-hidden border">
      <div className="bg-[#1B2B4B] px-6 py-4">
        <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.거래처 적용" defaultText="거래처 적용" /></h3>
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
            {/* ⭐ 다목적지 단가표 조회 팝업 (3파트와 동일) */}
            {rateSheetLookupOpen4 && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999998]">
                <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.단가표 조회" defaultText="단가표 조회" /></h3>
                      <p className="text-white/60 text-[12px] mt-0.5">
                        {(editTarget?.하차지명 || "").trim() ? `"${editTarget.하차지명}"와(과) 일치하는 등록된 단가표` : "하차지명이 있어야 단가표 메뉴에 등록된 단가와 매칭해 보여줍니다"}
                      </p>
                    </div>
                    <button onClick={() => setRateSheetLookupOpen4(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
                  </div>
                  <div className="overflow-y-auto flex-1 p-5">
                    {rateSheetMatches4.length === 0 ? (
                      <div className="text-center py-16 text-gray-500 text-[13px]">
                        일치하는 단가표가 없습니다.<br/>
                        <span className="text-[12px] text-gray-400">단가표 메뉴 → 다목적지 단가표에서 해당 하차지를 등록하면 여기서 바로 확인할 수 있습니다.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {rateSheetMatches4.map(({ sheet, row, nameHit }, i) => {
                          const dropTon = normRateText4(editTarget?.차량톤수);
                          const matchedColId = dropTon
                            ? (sheet.columns || []).find(c => {
                                const cl = normRateText4(c.label);
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
                    <button onClick={() => setRateSheetLookupOpen4(false)} className="px-5 py-2 text-[13px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"><EditableText id="misc.btn.28395.닫기" defaultText="닫기" /></button>
                  </div>
                </div>
              </div>
            )}
            {/* ===================== 📦 운임조회 중앙 모달 ===================== */}
{farePanelOpen && fareResult && (
  <FareResultModal zClass="z-[99999]" result={fareResult} target={editTarget} records={sortFareHistory(fareResult.records || [], fareSortMode)} sortControl={<FareSortDropdown value={fareSortMode} onChange={setFareSortMode} />} filter={copyFareFilter} setFilter={setCopyFareFilter}
    onApply={(v) => { setEditTarget(p => { if (fareOn) { const n = fareFormChange(p, "청구운임", v, fareR.rules); return { ...n, 수수료: Number(n.수수료) || 0 }; } return { ...p, 청구운임: v, 수수료: v - Number(p.기사운임 || 0) }; }); setFarePanelOpen(false); }}
    onClose={() => setFarePanelOpen(false)} />
)}

            {/* ================= 선택수정: 상태 버튼 그룹 + 운임조회 ================= */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <button
                type="button"
                onClick={() => setEditTarget((p) => ({ ...p, 긴급: !p.긴급, 운임보정: !p.긴급 ? { type: "긴급", rate: 0.2, memo: "긴급 오더" } : null }))}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.긴급 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
              >
                긴급
              </button>
              <button
                type="button"
                onClick={() => setEditTarget((p) => {
                  const next = p.운행유형 === "왕복" ? "편도" : "왕복";
                  const rot = next === "왕복" ? {} : { 회전수: 1, 메모: withRotationMemo(p.메모, 1) };
                  setEdited((prev) => ({ ...prev, [p._id]: { ...(prev[p._id] || {}), 운행유형: next, ...rot } }));
                  return { ...p, 운행유형: next, ...rot };
                })}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.운행유형 === "왕복" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
              >
                왕복
              </button>
              {editTarget.운행유형 === "왕복" && (
                <RotationPicker size="sm" allowSplit={false} count={editTarget.회전수 || 1}
                  onChange={(c) => setEditTarget((p) => {
                    const 메모 = withRotationMemo(p.메모, c);
                    setEdited((prev) => ({ ...prev, [p._id]: { ...(prev[p._id] || {}), 회전수: c, 메모 } }));
                    return { ...p, 회전수: c, 메모 };
                  })} />
              )}
              <button
                type="button"
                onClick={() => setEditTarget((p) => ({ ...p, 혼적: !p.혼적, 독차: !!p.혼적 }))} /* ⭐ 2026-11-09 혼적을 끄면 독차 */
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.혼적 ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
              >
                혼적
              </button>
              <button
                type="button"
                onClick={() => setDeliveryConfirm({ rowId: editTarget._id, before: editTarget.업체전달상태 || "미전달", after: editTarget.업체전달상태 === "전달완료" ? "미전달" : "전달완료" })}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${editTarget.업체전달상태 === "전달완료" ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
              >
                업체전달
              </button>
              <div className="ml-auto flex gap-1.5">
                <button
                  onClick={handleFareSearch}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/10 transition"
                >
                  운임조회
                </button>
              </div>
            </div>

            {/* ------------------------------------------------ */}
            {/* 🔵 거래처명 */}
            {/* ------------------------------------------------ */}
            {/* ===================== 거래처명 ===================== */}
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
                  setShowEditPlaceDropdown(false); // ▲ 충돌 방지
                  setEditTarget((p) => ({ ...p, 거래처명: v }));
                  setEditClientOptions(filterEditClients(v));
                  setShowEditClientDropdown(true);
                  setEditClientActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showEditClientDropdown) return;

                  if (e.key === "Escape") {
                    setShowEditClientDropdown(false);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setEditClientActiveIndex((i) =>
                      Math.min(i + 1, editClientOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setEditClientActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const c = editClientOptions[editClientActiveIndex];
                    if (!c) return;

                    setEditTarget((prev) => ({
                      ...prev,

                      // 거래처
                      거래처명: c.거래처명,
                      거래처주소: c.주소 || prev.거래처주소,
                      거래처담당자: c.담당자 || prev.거래처담당자,
                      거래처연락처: c.연락처 || prev.거래처연락처,
                    }));
                    setShowEditClientDropdown(false);
                    checkWarningStatus(c.거래처명, "거래처");
                  }

                  if (e.key === "Tab") {
                    const c = editClientOptions[editClientActiveIndex];
                    if (c) {
                      setEditTarget((prev) => ({
                        ...prev,
                        거래처명: c.거래처명,
                        거래처주소: c.주소 || prev.거래처주소,
                        거래처담당자: c.담당자 || prev.거래처담당자,
                        거래처연락처: c.연락처 || prev.거래처연락처,

                      }));
                      setShowEditClientDropdown(false);
                      checkWarningStatus(c.거래처명, "거래처");
                    }
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowEditClientDropdown(false), 150)
                }
              />

              {showEditClientDropdown && (
                <div ref={editClientDropdownListRef} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {editClientOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      검색 결과 없음
                    </div>
                  ) : (
                    editClientOptions.map((c, i) => (
                      <div
                        key={i}
                        className={`px-3 py-1 cursor-pointer ${i === editClientActiveIndex ? "bg-[#1B2B4B] text-white" : ""
                          }`}
                        onMouseDown={() => {
                          setEditTarget((prev) => ({
                            ...prev,

                            거래처명: c.거래처명,
                            거래처주소: c.주소 || prev.거래처주소,
                            거래처담당자: c.담당자 || prev.거래처담당자,
                            거래처연락처: c.연락처 || prev.거래처연락처,
                          }));
                          setShowEditClientDropdown(false);
                          checkWarningStatus(c.거래처명, "거래처");
                        }}
                      >
                        <div className="font-semibold">{c.거래처명}</div>
                        {c.주소 && (
                          <div className={`text-xs ${i === editClientActiveIndex ? "text-white/70" : "text-gray-500"}`}>{c.주소}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            </div>
            {/* ------------------------------------------------ */}
{/* 🔵 상/하차일 & 시간 */}
{/* ------------------------------------------------ */}
<div className="grid grid-cols-2 gap-3 mb-3">
  {/* ================= 상차일 ================= */}
  <div>
    <label>상차일</label>
    <CustomDatePicker
      className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
      disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
      value={editTarget.상차일 || ""}
      onChange={(e) =>
        setEditTarget((p) => withPickupDate(p, e.target.value))
      }
    />
  </div>

  {/* ================= 상차시간 + 기준 ================= */}
  <div>
    <label><EditableText id="waypoint.label.상차시간" defaultText="상차시간" /></label>
    <div className="flex items-center gap-1 flex-nowrap">
      <TimeAmPmPicker
        value={editTarget.상차시간 || ""}
        onChange={v => setEditTarget(p => ({ ...p, 상차시간: v }))}
        selectCls="border p-2 rounded flex-1 min-w-0"
        disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
      />
      <CustomSelect
        className="border p-2 rounded text-sm shrink-0 disabled:bg-gray-100 disabled:text-gray-500"
        disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
        value={editTarget.상차시간기준 || ""}
        onChange={(e) =>
          setEditTarget((p) => ({ ...p, 상차시간기준: e.target.value }))
        }
      >
        <option value="">기준없음</option>
        <option value="이전">이전</option>
        <option value="이후">이후</option>
      </CustomSelect>
    </div>
  </div>

  {/* ================= 하차일 ================= */}
  <div>
    <label>하차일</label>
    <CustomDatePicker
      className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
      disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
      value={editTarget.하차일 || ""}
      onChange={(e) =>
        setEditTarget((p) => ({ ...p, 하차일: e.target.value }))
      }
    />
  </div>

  {/* ================= 하차시간 + 기준 ================= */}
  <div>
    <label><EditableText id="waypoint.label.하차시간" defaultText="하차시간" /></label>
    <div className="flex items-center gap-1 flex-nowrap">
      <TimeAmPmPicker
        value={editTarget.하차시간 || ""}
        onChange={v => setEditTarget(p => ({ ...p, 하차시간: v }))}
        selectCls="border p-2 rounded flex-1 min-w-0"
        disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
      />
      <CustomSelect
        className="border p-2 rounded text-sm shrink-0 disabled:bg-gray-100 disabled:text-gray-500"
        disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
        value={editTarget.하차시간기준 || ""}
        onChange={(e) =>
          setEditTarget((p) => ({ ...p, 하차시간기준: e.target.value }))
        }
      >
        <option value="">기준없음</option>
        <option value="이전">이전</option>
        <option value="이후">이후</option>
      </CustomSelect>
    </div>
  </div>
</div>

            {/* ------------------------------------------------ */}
            {/* 🔵 상하차지 */}
            {/* ------------------------------------------------ */}
            {/* ===================== 상차지 ===================== */}
            <div className="mb-3 relative">
              <label className="flex items-center gap-1.5">상차지명<OrderMemoIconButton onClick={() => openPanelMemoE4("pickup")} hasMemo={hasPanelMemoE4("pickup")} /></label>
              <input autoComplete="off"
                className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
                disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
                value={editTarget.상차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({
                    ...p,
                    상차지명: v,
                    ...(v.trim() === "" && { 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "" })
                  }));
                  setEditPlaceType("pickup");
                  setEditPlaceOptions(filterEditPlaces(v));
                  setShowEditPlaceDropdown(v.trim() !== "");
                  setEditActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showEditPlaceDropdown || editPlaceType !== "pickup") return;

                  if (e.key === "Escape") {
                    setShowEditPlaceDropdown(false);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setEditActiveIndex((i) =>
                      Math.min(i + 1, editPlaceOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setEditActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = editPlaceOptions[editActiveIndex];
                    if (!p) return;
                    const cts4e = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts4e = [...new Map(cts4e.map(c => [c.name.trim(), c])).values()];
                    const prim4e = ucts4e.find(c => c.isPrimary) || ucts4e[0];
                    setEditTarget((prev) => ({
                      ...prev,
                      상차지명: p.업체명,
                      상차지주소: p.주소 || "",
                      상차지담당자: prim4e?.name || p.담당자 || "",
                      상차지담당자번호: prim4e?.phone || p.담당자번호 || "",
                    }));
                    if (ucts4e.length > 1) setPanelContactPopup4({ type: "pickup", place: p, contacts: ucts4e, setter: setEditTarget, pickupKey: "상차", dropKey: "하차" });
                    setShowEditPlaceDropdown(false);
                    checkWarningStatus(p.업체명, "상차지");
                  }

                  if (e.key === "Tab") {
                    const p = editPlaceOptions[editActiveIndex];
                    if (p) {
                      const cts4eT = (p.contacts || []).filter(c => c.name?.trim());
                      const ucts4eT = [...new Map(cts4eT.map(c => [c.name.trim(), c])).values()];
                      const prim4eT = ucts4eT.find(c => c.isPrimary) || ucts4eT[0];
                      setEditTarget((prev) => ({
                        ...prev,
                        상차지명: p.업체명,
                        상차지주소: p.주소 || "",
                        상차지담당자: prim4eT?.name || p.담당자 || "",
                        상차지담당자번호: prim4eT?.phone || p.담당자번호 || "",
                      }));
                      setShowEditPlaceDropdown(false);
                      checkWarningStatus(p.업체명, "상차지");
                    }
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowEditPlaceDropdown(false), 150)
                }
              />

              {showEditPlaceDropdown && editPlaceType === "pickup" && (
                <div ref={editPlaceDropdownListRef} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {editPlaceOptions.map((p, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 cursor-pointer ${i === editActiveIndex ? "bg-[#1B2B4B] text-white" : ""
                        }`}
                      onMouseDown={() => {
                        const cts4 = (p.contacts || []).filter(c => c.name?.trim());
                        const ucts4 = [...new Map(cts4.map(c => [c.name.trim(), c])).values()];
                        const prim4 = ucts4.find(c => c.isPrimary) || ucts4[0];
                        setEditTarget((prev) => ({
                          ...prev,
                          상차지명: p.업체명,
                          상차지주소: p.주소 || "",
                          상차지담당자: prim4?.name || p.담당자 || "",
                          상차지담당자번호: prim4?.phone || p.담당자번호 || "",
                        }));
                        if (ucts4.length > 1) setPanelContactPopup4({ type: "pickup", place: p, contacts: ucts4, setter: setEditTarget, pickupKey: "상차", dropKey: "하차" });
                        setShowEditPlaceDropdown(false);
                        checkWarningStatus(p.업체명, "상차지");
                      }}
                    >
                      <div className="font-semibold">{p.업체명}</div>
                      <div className={`text-xs ${i === editActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label>상차지주소</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
                disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
                value={editTarget.상차지주소 || ""}
                onChange={(e) =>
                  setEditTarget((p) => ({ ...p, 상차지주소: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.상차지담당자" defaultText="상차지 담당자" /></label>
                <input autoComplete="off" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.상차지담당자 || ""} onChange={(e) => setEditTarget((p) => ({ ...p, 상차지담당자: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.상차지연락처" defaultText="상차지 연락처" /></label>
                <input autoComplete="off" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.상차지담당자번호 || ""} onChange={(e) => setEditTarget((p) => ({ ...p, 상차지담당자번호: formatPhone(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.상차방법" defaultText="상차방법" /></label>
                <CompanyOptionPicker optKey="상하차방법" title="상차방법" placeholder="선택" noneLabel="선택" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.상차방법 || ""} onChange={(__v) => ((e) => setEditTarget((p) => ({ ...p, 상차방법: e.target.value })))({ target: { value: __v } })} />
                            </div>
            </div>

            {/* ── 선택수정: 상차 경유지 표시 ── */}
            {(() => {
              const safeParse = (v) => {
                if (Array.isArray(v) && v.length > 0) return v;
                if (typeof v === "string" && v.trim().startsWith("[")) {
                  try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
                }
                if (v && typeof v === "object" && !Array.isArray(v)) {
                  const keys = Object.keys(v);
                  if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
                    return keys.sort((a,b) => Number(a) - Number(b)).map(k => v[k]);
                  if (v.업체명) return [v];
                }
                return [];
              };
              const stops = [
                ...safeParse(editTarget?.경유상차목록),
                ...safeParse(editTarget?.경유지_상차),
              ].filter(s => s?.업체명?.trim())
               .filter((s, i, arr) => arr.findIndex(x => x.업체명 === s.업체명) === i);

              return <WaypointSection stops={stops} type="pickup" onSave={(newList) => setEditTarget(p => ({ ...p, 경유상차목록: newList, 경유지_상차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mb-3" orderDate={editTarget?.상차일 || ""} />;
            })()}

            {/* ===================== 하차지 ===================== */}
            <div className="mb-3 relative">
              <label className="flex items-center gap-1.5">하차지명<OrderMemoIconButton onClick={() => openPanelMemoE4("drop")} hasMemo={hasPanelMemoE4("drop")} /></label>

              <input autoComplete="off"
                className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
                disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
                value={editTarget.하차지명 || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditTarget((p) => ({
                    ...p,
                    하차지명: v,
                    ...(v.trim() === "" && { 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "" })
                  }));
                  setEditPlaceType("drop");
                  setEditPlaceOptions(filterEditPlaces(v));
                  setShowEditPlaceDropdown(v.trim() !== "");
                  setEditActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!showEditPlaceDropdown || editPlaceType !== "drop") return;

                  if (e.key === "Escape") {
                    setShowEditPlaceDropdown(false);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setEditActiveIndex((i) =>
                      Math.min(i + 1, editPlaceOptions.length - 1)
                    );
                  }

                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setEditActiveIndex((i) => Math.max(i - 1, 0));
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    const p = editPlaceOptions[editActiveIndex];
                    if (!p) return;
                    const cts4de = (p.contacts || []).filter(c => c.name?.trim());
                    const ucts4de = [...new Map(cts4de.map(c => [c.name.trim(), c])).values()];
                    const prim4de = ucts4de.find(c => c.isPrimary) || ucts4de[0];
                    setEditTarget((prev) => ({
                      ...prev,
                      하차지명: p.업체명,
                      하차지주소: p.주소 || "",
                      하차지담당자: prim4de?.name || p.담당자 || "",
                      하차지담당자번호: prim4de?.phone || p.담당자번호 || "",
                    }));
                    if (ucts4de.length > 1) setPanelContactPopup4({ type: "drop", place: p, contacts: ucts4de, setter: setEditTarget, pickupKey: "상차", dropKey: "하차" });
                    setShowEditPlaceDropdown(false);
                    checkWarningStatus(p.업체명, "하차지");
                  }

                  if (e.key === "Tab") {
                    const p = editPlaceOptions[editActiveIndex];
                    if (p) {
                      const cts4deT = (p.contacts || []).filter(c => c.name?.trim());
                      const ucts4deT = [...new Map(cts4deT.map(c => [c.name.trim(), c])).values()];
                      const prim4deT = ucts4deT.find(c => c.isPrimary) || ucts4deT[0];
                      setEditTarget((prev) => ({
                        ...prev,
                        하차지명: p.업체명,
                        하차지주소: p.주소 || "",
                        하차지담당자: prim4deT?.name || p.담당자 || "",
                        하차지담당자번호: prim4deT?.phone || p.담당자번호 || "",
                      }));
                      setShowEditPlaceDropdown(false);
                      checkWarningStatus(p.업체명, "하차지");
                    }
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowEditPlaceDropdown(false), 150)
                }
              />

              {showEditPlaceDropdown && editPlaceType === "drop" && (
                <div ref={editPlaceDropdownListRef} className="absolute z-50 bg-white border w-full max-h-40 overflow-y-auto">
                  {editPlaceOptions.map((p, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 cursor-pointer ${i === editActiveIndex ? "bg-[#1B2B4B] text-white" : ""
                        }`}
                      onMouseDown={() => {
                        const cts4d = (p.contacts || []).filter(c => c.name?.trim());
                        const ucts4d = [...new Map(cts4d.map(c => [c.name.trim(), c])).values()];
                        const prim4d = ucts4d.find(c => c.isPrimary) || ucts4d[0];
                        setEditTarget((prev) => ({
                          ...prev,
                          하차지명: p.업체명,
                          하차지주소: p.주소 || "",
                          하차지담당자: prim4d?.name || p.담당자 || "",
                          하차지담당자번호: prim4d?.phone || p.담당자번호 || "",
                        }));
                        if (ucts4d.length > 1) setPanelContactPopup4({ type: "drop", place: p, contacts: ucts4d, setter: setEditTarget, pickupKey: "상차", dropKey: "하차" });
                        setShowEditPlaceDropdown(false);
                        checkWarningStatus(p.업체명, "하차지");
                      }}
                    >
                      <div className="font-semibold">{p.업체명}</div>
                      <div className={`text-xs ${i === editActiveIndex ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label>하차지주소</label>
              <input autoComplete="off"
                className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500"
                disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
                value={editTarget.하차지주소 || ""}
                onChange={(e) =>
                  setEditTarget((p) => ({ ...p, 하차지주소: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.하차지담당자" defaultText="하차지 담당자" /></label>
                <input autoComplete="off" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.하차지담당자 || ""} onChange={(e) => setEditTarget((p) => ({ ...p, 하차지담당자: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.하차지연락처" defaultText="하차지 연락처" /></label>
                <input autoComplete="off" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.하차지담당자번호 || ""} onChange={(e) => setEditTarget((p) => ({ ...p, 하차지담당자번호: formatPhone(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm font-medium"><EditableText id="selectEdit.label.하차방법" defaultText="하차방법" /></label>
                <CompanyOptionPicker optKey="상하차방법" title="하차방법" placeholder="선택" noneLabel="선택" className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} value={editTarget.하차방법 || ""} onChange={(__v) => ((e) => setEditTarget((p) => ({ ...p, 하차방법: e.target.value })))({ target: { value: __v } })} />
                            </div>
            </div>

            {/* ── 선택수정: 하차 경유지 표시 ── */}
            {(() => {
              const safeParse = (v) => {
                if (Array.isArray(v) && v.length > 0) return v;
                if (typeof v === "string" && v.trim().startsWith("[")) {
                  try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
                }
                if (v && typeof v === "object" && !Array.isArray(v)) {
                  const keys = Object.keys(v);
                  if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)))
                    return keys.sort((a,b) => Number(a) - Number(b)).map(k => v[k]);
                  if (v.업체명) return [v];
                }
                return [];
              };
              const stops = [
                ...safeParse(editTarget?.경유하차목록),
                ...safeParse(editTarget?.경유지_하차),
              ].filter(s => s?.업체명?.trim())
               .filter((s, i, arr) => arr.findIndex(x => x.업체명 === s.업체명) === i);

              return <WaypointSection stops={stops} type="drop" onSave={(newList) => setEditTarget(p => ({ ...p, 경유하차목록: newList, 경유지_하차: newList }))} placeRows={mergedClients} timeOptions={timeOptions} className="mb-3" orderDate={editTarget?.하차일 || ""} />;
            })()}

            {/* ------------------------------------------------ */}
            {/* 🔵 화물내용 */}
            {/* ------------------------------------------------ */}
            <label className="flex items-center gap-1 flex-wrap">화물내용
              <button type="button" tabIndex={-1} className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer"
                onClick={() => setCargoAddPopup({ initialValue: editTarget?.화물내용||"", onCommit: (v) => setEditTarget(p=>({...p,화물내용:v})) })}>+ 추가</button>
              <CargoExtraChips value={editTarget?.화물내용} />
            </label>


<div className="relative">

  {/* 입력 */}
  <input autoComplete="off"
    className="border p-2 rounded w-full pr-[110px] disabled:bg-gray-100 disabled:text-gray-500"
    disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
    value={editTarget.화물수량 || ""}
    onChange={(e) => {
      const v = e.target.value;
      setEditTarget((p) => {
        const extras = (p.화물내용 || "").replace(/^[^+]*/, "");
        return { ...p, 화물수량: v, 화물내용: (p.화물타입 ? `${v}${p.화물타입}` : v) + extras };
      });
    }}
  />

  {/* 버튼형 드롭다운 */}
  <div className="absolute top-0 right-0 h-full flex items-center pr-2">

    <CustomSelect
      className="w-[58px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer disabled:opacity-50"
      disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
      value={editTarget.화물타입 || ""}
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

</div>

            {/* 🔵 차량정보 */}
<div className="grid grid-cols-2 gap-3 mb-3">

  {/* ================= 차량종류 ================= */}
  <div>
    <label>차량종류</label>
    <VehicleTypePicker className="border p-2 rounded w-full disabled:bg-gray-100 disabled:text-gray-500" value={editTarget.차량종류 || ""} disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")} base={["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이", "기타"]} placeholder="선택 없음" noneLabel="선택 없음" onChange={(__v) => ((e) =>
        setEditTarget((p) => ({
          ...p,
          차량종류: e.target.value,
        })))({ target: { value: __v } })} />
  </div>

  {/* ================= 차량톤수 ================= */}
<div>
  <label>차량톤수</label>

  <div className="relative">

    {/* 🔹 입력창 */}
    <input autoComplete="off"
      className="border p-2 rounded w-full pr-[70px] disabled:bg-gray-100 disabled:text-gray-500"
      disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
      value={editTarget.톤수값 || ""}
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
      placeholder="예: 1"
    />

    {/* 🔹 내부 드롭다운 */}
    <div className="absolute top-0 right-0 h-full flex items-center pr-1">

<CustomSelect
  className="h-full px-2 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer disabled:opacity-50"
  disabled={(editTarget?.source === "shipper" || editTarget?.source === "shipper_mobile")}
        value={
          editTarget.차량톤수?.includes("kg")
            ? "kg"
            : editTarget.차량톤수?.includes("톤")
            ? "톤"
            : ""
        }
        onChange={(e) => {
          const type = e.target.value;

          const num =
            editTarget.차량톤수?.match(/[\d.]+/)?.[0] || "";

          setEditTarget((p) => ({
            ...p,
            차량톤수: num ? `${num}${type}` : type,
          }));
        }}
      >
        <option value="">선택</option>
        <option value="톤">톤</option>
        <option value="kg">kg</option>
      </CustomSelect>

    </div>

  </div>
</div>
</div>
           {/* ===== 스마트 기사 검색 ===== */}
            <div className="mb-3">
              <label className="block text-[13px] font-semibold text-[#1B2B4B] mb-1">기사 스마트 검색</label>
              <div className="relative">
                <input autoComplete="off"
                  className="w-full border-2 border-[#1B2B4B] rounded-xl px-4 py-2.5 text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-500"
                  placeholder="이름·차량번호·전화번호 또는 문자 내용 붙여넣기 (Enter로 적용)"
                  value={smartQ4}
                  onChange={e => handleSmart4Input(e.target.value)}
                  onKeyDown={e => handleSmart4KeyDown(e, editTarget, setEditTarget)}
                  onBlur={e => { setTimeout(()=>{ if(e.target.value.trim().length>4) applySmart4(editTarget,setEditTarget,e.target.value); setSmartList4([]); setSmart4ActiveIdx(-1); },200); }}
                />
                {smartList4.length > 0 && (
                  <div className="absolute z-[9999] w-full bg-white border-2 border-[#1B2B4B] rounded-xl shadow-xl mt-0.5 overflow-hidden">
                    <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-semibold">등록된 기사 {smartList4.length}명</div>
                    {smartList4.map((d,i)=>(
                      <div key={i} className={`px-4 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 flex items-center justify-between ${i===smart4ActiveIdx?"bg-blue-100":"hover:bg-blue-50"}`}
                        onMouseEnter={()=>setSmart4ActiveIdx(i)}
                        onMouseDown={()=>selectSmart4Driver(d, setEditTarget)}>
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
                  <button type="button" onClick={()=>{setEditTarget(p=>({...p,차량번호:"",이름:"",전화번호:"",배차상태:"배차중"})); setSmartQ4("");}} className="text-slate-400 hover:text-slate-600 text-[14px] leading-none transition">×</button>
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
                  const raw = e.target.value;
                  editDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
                  const clean = raw.replace(/\s+/g, "");
                  if (clean) {
                    const match = (drivers || []).find(d => String(d.차량번호 || "").replace(/\s+/g, "") === clean);
                    if (match) {
                      const grade = match?.등급 || match?.grade || "";
                      if (grade === "블랙") setBlackAlert(match);
                      else if (shouldShowDriverMemoAlert(match)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: match }));
                    }
                  }
                  setEditTarget((p) => ({
                    ...p,
                    차량번호: raw,
                    // 🔥 차량번호를 전부 지우면 기사정보도 즉시 제거
                    ...(raw.trim() === "" && {
                      이름: "",
                      전화번호: "",
                      배차상태: "배차중",
                    }),
                  }));
                }}
                onKeyDown={(e) => {
  if (e.key !== "Enter") return;

  const raw = e.target.value.trim();
  const clean = raw.replace(/\s+/g, "");
  if (!clean) return;

  const matches = drivers.filter(
    (d) => String(d.차량번호 || "").replace(/\s+/g, "") === clean
  );

  // 1명 → 바로 적용
  if (matches.length === 1) {
    const d = matches[0];
    const grade = d?.등급 || d?.grade || "";
    if (grade === "블랙") {
      setBlackAlert(d);
    }
    setEditTarget((p) => ({
      ...p,
      차량번호: raw,
      이름: d.이름 || "",
      전화번호: d.전화번호 || "",
      배차상태: "배차완료",
      updatedAt: Date.now(),
    }));
    setDriverPick(null);
    return;
  }

  // 여러 명 → 선택 UI 띄우기
  if (matches.length > 1) {
    setDriverPick({
      plate: raw,
      list: matches,
    });
    return;
  }

  // 0명 → 신규 등록
  driverPanelCallbackRef.current = async (name, fmt) => {
    setEditTarget((p) => ({ ...p, 차량번호: raw, 이름: name, 전화번호: fmt, 배차상태: "배차완료", updatedAt: Date.now() }));
  };
  setDriverConfirmInfo({ type: "new", 차량번호: raw, 이름: "", 전화번호: "" });
  setDriverConfirmRowId("__panel__");
  setQuickRegMode(true);
  setQuickRegName(""); setQuickRegPhone("");
  setDriverConfirmOpen(true);
}}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const clean = raw.replace(/\s+/g, "");
                  if (!clean) return;
                  const matches = (drivers || []).filter(d => String(d.차량번호 || "").replace(/\s+/g, "") === clean);
                  if (matches.length > 0) return;
                  driverPanelCallbackRef.current = async (name, fmt) => {
                    setEditTarget((p) => ({ ...p, 차량번호: raw, 이름: name, 전화번호: fmt, 배차상태: "배차완료", updatedAt: Date.now() }));
                  };
                  setDriverConfirmInfo({ type: "new", 차량번호: raw, 이름: "", 전화번호: "" });
                  setDriverConfirmRowId("__panel__");
                  setQuickRegMode(true);
                  setQuickRegName(""); setQuickRegPhone("");
                  setDriverConfirmOpen(true);
                }}
              />
              {driverPick && (
  <div className="mt-2 border rounded-md bg-white shadow-sm">
    <div className="px-3 py-1.5 text-xs font-semibold bg-slate-100 border-b">
      동일 차량번호 기사 선택
    </div>

    {driverPick.list.map((d) => (
      <button
        key={d.id}
        type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
        onClick={() => {
          setEditTarget((p) => ({
            ...p,
            차량번호: driverPick.plate,
            이름: d.이름,
            전화번호: d.전화번호,
            배차상태: "배차완료",
          }));
          setDriverPick(null);
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
                <MonthPicker value={String(editTarget.마감월 || "").slice(0, 7)} onChange={(v) => setEditTarget((p) => ({ ...p, 마감월: v || "" }))} clearable placeholder="상차일의 달" quick={false} className="w-full" />
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
                    <button type="button" onClick={() => setEditTarget((p) => ({ ...p, 메모중요도: "NORMAL" }))}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${editTarget.메모중요도 === "NORMAL" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                      일반
                    </button>
                    <button type="button" onClick={() => setEditTarget((p) => ({ ...p, 메모중요도: "HIGH" }))}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${editTarget.메모중요도 === "HIGH" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-orange-600 border-orange-300 hover:bg-orange-50"}`}>
                      중요
                    </button>
                    <button type="button" onClick={() => setEditTarget((p) => ({ ...p, 메모중요도: "CRITICAL" }))}
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
                    onClick={() => setEditTarget((p) => ({ ...p, 전달사항고정: !p.전달사항고정 }))}
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

            {/* 변경 이력(공용 타임라인) */}
            <div className="mt-4 border-t pt-3">
              <div className="text-[12px] font-bold text-[#1B2B4B] mb-2">변경 이력</div>
              <div className="max-h-48 overflow-y-auto pr-1"><OrderTimeline order={editTarget} size="sm" userName={(u) => userNameMap?.get?.(String(u || "").trim().toLowerCase())} /></div>
            </div>

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
    if (isViewer) return showAlert("조회전용 권한으로 저장할 수 없습니다.");
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    if (!(await editDrvEdit.finish(editTarget))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택
    // ✅ 저장 직전 경유지 + 화물내용 최종 동기화
const syncedEditTarget = {
  ...editTarget,

  // 🔥 경유지 배열 통합 저장 (신구 필드 모두)
  경유상차목록: editTarget.경유상차목록 || editTarget.경유지_상차 || [],
  경유지_상차: editTarget.경유상차목록 || editTarget.경유지_상차 || [],
  경유지상차:  editTarget.경유상차목록 || editTarget.경유지_상차 || [],
  경유하차목록: editTarget.경유하차목록 || editTarget.경유지_하차 || [],
  경유지_하차: editTarget.경유하차목록 || editTarget.경유지_하차 || [],
  경유지하차:  editTarget.경유하차목록 || editTarget.경유지_하차 || [],
  
  // 화물내용 동기화
  화물내용: editTarget.화물타입
    ? `${editTarget.화물수량 || ""}${editTarget.화물타입}`
    : (editTarget.화물수량 || editTarget.화물내용 || ""),
};

const ALLOWED_FIELDS = [
  "등록일",
  "상차일", "상차시간", "상차시간기준",
  "하차일", "하차시간", "하차시간기준",
  "거래처명",
  "상차지명", "상차지주소",
  "하차지명", "하차지주소",
  "경유상차목록",    // ← 추가
  "경유지_상차",     // ← 유지
  "경유하차목록",    // ← 추가
  "경유지_하차",     // ← 유지
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
  "긴급", "운임보정",
  "배차상태",
];

const payload = stripUndefined({
  ...ALLOWED_FIELDS.reduce((acc, k) => {
    if (syncedEditTarget[k] !== undefined) {
      acc[k] = syncedEditTarget[k];
    }
    return acc;
  }, {}),

  ...(markDeliveredOnSave && {
    업체전달상태: "전달완료",
    업체전달일시: Date.now(),
    업체전달방법: "선택수정",
    업체전달자: auth?.currentUser?.email ?? "unknown",
  }),
});

    payload.updatedAt = Date.now();
    delete payload.createdAt;
const savedId = editTarget._id;

// ✅ UI 먼저
const _savedScrollX = window.scrollX;
setMarkDeliveredOnSave(false);
showAlert("수정이 저장되었습니다.");
React.startTransition(() => {
  setEditPopupOpen(false);
  setSelected([]);
  setRows(prev => prev.map(r => r._id === savedId ? { ...r, ...payload } : r));
});

flashRow(savedId);
requestAnimationFrame(() => window.scrollTo({ left: _savedScrollX, top: window.scrollY }));
setTimeout(() => {
  const el = document.getElementById(`row-${savedId}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}, 400);

// ✅ 백그라운드 저장
if (payload.차량번호 && payload.이름) {
  const existingD = driverMap.get((payload.차량번호||"").replace(/\s+/g,""));
  if (!existingD || existingD.length === 0) {
    upsertDriver({ 차량번호: payload.차량번호, 이름: payload.이름, 전화번호: payload.전화번호||"" }).catch(console.error);
  }
}
patchDispatch(editTarget._id, payload).catch(console.error);
if (editTarget.거래처명) {
  upsertClient?.({ 거래처명: editTarget.거래처명, 주소: editTarget.상차지주소||"", 담당자: editTarget.거래처담당자||"", 연락처: editTarget.거래처연락처||"", updatedAt: Date.now() }).catch(console.error);
}
if (editTarget.상차지명) savePlaceSmart(editTarget.상차지명, editTarget.상차지주소||"", editTarget.상차지담당자||"", editTarget.상차지담당자번호||"", null, undefined,
  (editTarget.상차지오더메모 !== undefined || editTarget.상차지오더메모팝업표시 !== undefined || editTarget.상차지기사전달주의사항 !== undefined) ? { 오더메모: editTarget.상차지오더메모, 팝업표시: editTarget.상차지오더메모팝업표시, 기사전달주의사항: editTarget.상차지기사전달주의사항 } : undefined
).catch(console.error);
if (editTarget.하차지명) savePlaceSmart(editTarget.하차지명, editTarget.하차지주소||"", editTarget.하차지담당자||"", editTarget.하차지담당자번호||"", null, undefined,
  (editTarget.하차지오더메모 !== undefined || editTarget.하차지오더메모팝업표시 !== undefined || editTarget.하차지기사전달주의사항 !== undefined) ? { 오더메모: editTarget.하차지오더메모, 팝업표시: editTarget.하차지오더메모팝업표시, 기사전달주의사항: editTarget.하차지기사전달주의사항 } : undefined
).catch(console.error);
                }}
              >
                저장
              </button>
            </div>

            </div>{/* p-6 space-y-4 끝 */}
          </div>
        </div>
      )}
      
      {/* 첨부파일 업로드 알림 */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[9999] pointer-events-none">
        {notificationsEnabled && uploadAlerts.map((a) => (
          <div
            key={a.uid}
            className="pointer-events-auto w-[300px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden cursor-pointer"
            style={{ animation: "slideInRight 0.3s ease-out" }}
            onClick={() => {
              // 열어봤다고 기록
              viewedAttachRef.current[a.id] = a.total;
              // 이 알림 제거
              setUploadAlerts(prev => prev.filter(x => x.uid !== a.uid));
              // AttachmentViewer 열기
              setAttachViewer(a.row);
            }}
          >
            {/* 상단 헤더 */}
            <div className="bg-[#1B2B4B] px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-white text-[12px] font-bold tracking-wide">서류 업로드 알림</span>
              </div>
              <button
                className="text-white/50 hover:text-white text-lg leading-none px-1"
                onClick={e => {
                  e.stopPropagation();
                  setUploadAlerts(prev => prev.filter(x => x.uid !== a.uid));
                }}
              >×</button>
            </div>
            {/* 본문 */}
            <div className="px-4 py-3">
              <div className="text-[13px] font-bold text-[#1B2B4B] truncate">
                {(() => {
                  const m = String(a.date || "").match(/^\d{4}-(\d{2})-(\d{2})/);
                  const dateLabel = m ? `${Number(m[1])}월${Number(m[2])}일` : (a.date || "");
                  return `${dateLabel} ${a.to || "-"}으로 파일이 등록되었습니다`;
                })()}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="text-[12px] text-gray-500 truncate">
                  {a.from} → {a.to}{a.driver ? ` · ${a.driver}` : ""}
                </div>
                <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {a.count}장 업로드
                </div>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">클릭하면 바로 확인할 수 있습니다</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {/* =================== 기사 선택 모달 (동일 차량번호 여러 기사) =================== */}
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
              const updated = {
                차량번호: d.차량번호,
                이름: d.이름,
                전화번호: d.전화번호,
                배차상태: "배차완료",
                updatedAt: Date.now(),
              };
              await patchDispatch(driverSelectInfo.rowId, updated);
              setRows(prev => prev.map(r => r._id === driverSelectInfo.rowId ? { ...r, ...updated } : r));
              setDriverSelectInfo(null);
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
                  <span className="px-2 py-0.5 rounded-lg bg-gray-900 text-white text-[10px] font-bold">
                    블랙
                  </span>
                )}
                {d.등급 === "주의" && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">
                    주의
                  </span>
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
      {/* ===================== 기사확인 팝업 (RealtimeStatus) ===================== */}
      {driverConfirmOpen && driverConfirmInfo && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999999]"
          tabIndex={-1}
          ref={(el) => {
            if (el && !el.contains(document.activeElement)) setTimeout(() => el.focus(), 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && driverConfirmInfo.type !== "new") {
              const d = driverConfirmInfo;
              const id = driverConfirmRowId;
              const updated = { 차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호, 배차상태: "배차완료", updatedAt: Date.now() };
              setDriverConfirmOpen(false);
              setRows(prev => prev.map(r => r._id === id ? { ...r, ...updated } : r));
              patchDispatch(id, updated).catch(console.error);
            }
            if (e.key === "Escape") {
              setDriverConfirmOpen(false);
            }
          }}
          onClick={() => setDriverConfirmOpen(false)}
        >

          {/* 팝업 컨테이너 */}
          <div
            className="bg-white rounded-2xl w-[500px] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >

            {/* 헤더 */}
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.기사 정보 확인" defaultText="기사 정보 확인" /></h3>
              <button
                className="text-white/50 hover:text-white text-lg transition"
                onClick={() => setDriverConfirmOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* 상태 표시 */}
<div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
  <div className="flex items-center gap-2 flex-nowrap">
    {driverConfirmInfo.type === "new" ? (
      <span className="px-2.5 py-1 rounded-lg bg-[#1B2B4B]/10 text-[#1B2B4B] text-[12px] font-bold whitespace-nowrap shrink-0">
        미등록 차량
      </span>
    ) : driverConfirmInfo.type === "mismatch" ? (
      <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-700 text-[12px] font-bold whitespace-nowrap shrink-0">
        기사정보 불일치
      </span>
    ) : (
      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[12px] font-bold whitespace-nowrap shrink-0">
        등록 기사
      </span>
    )}
    <span className="text-[12px] text-gray-500 whitespace-nowrap">
      {driverConfirmInfo.type === "new"
        ? "기사 정보가 없습니다. 빠른등록 후 배차하세요."
        : driverConfirmInfo.type === "mismatch"
        ? "동일 차량에 다른 기사님이 등록되어 있습니다."
        : "아래 정보로 배차를 진행합니다."}
    </span>
  </div>
</div>

            {/* 정보 카드 */}
<div className="px-6 py-5">

  {/* ★ 불일치 시 비교 테이블 */}
  {driverConfirmInfo.type === "mismatch" && (
    <div className="mb-4 border border-red-200 rounded-xl overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-red-50">
          <tr>
            <th className="px-3 py-2 text-left text-gray-500 font-medium"><EditableText id="realtime.risk.header.구분" defaultText="구분" /></th>
            <th className="px-3 py-2 text-left text-gray-500 font-medium"><EditableText id="realtime.risk.header.기사명" defaultText="기사명" /></th>
            <th className="px-3 py-2 text-left text-gray-500 font-medium"><EditableText id="realtime.risk.header.연락처" defaultText="연락처" /></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-red-100">
            <td className="px-3 py-2 font-bold text-red-600">현재 입력</td>
            <td className="px-3 py-2">{driverConfirmInfo.currentName || "-"}</td>
            <td className="px-3 py-2">{formatPhone(driverConfirmInfo.currentPhone) || "-"}</td>
          </tr>
          <tr className="border-t border-red-100 bg-blue-50/50">
            <td className="px-3 py-2 font-bold text-[#1B2B4B]">DB 등록</td>
            <td className="px-3 py-2">{driverConfirmInfo.이름 || "-"}</td>
            <td className="px-3 py-2">{formatPhone(driverConfirmInfo.전화번호) || "-"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )}

  <div className="bg-[#f8f9fb] border border-gray-200 rounded-xl p-4 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-semibold text-gray-500 w-20">차량번호</span>
      <span className="flex-1 text-[14px] font-bold text-[#1B2B4B] text-right">
        {driverConfirmInfo.차량번호 || "-"}
      </span>
    </div>
    <div className="border-t border-gray-200"></div>
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-semibold text-gray-500 w-20">기사명</span>
      <span className={`flex-1 text-[14px] font-bold text-right ${
        driverConfirmInfo.이름 ? "text-[#1B2B4B]" : "text-gray-500"
      }`}>
        {driverConfirmInfo.이름 || "정보 없음"}
      </span>
    </div>
    <div className="border-t border-gray-200"></div>
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-semibold text-gray-500 w-20">연락처</span>
      <span className={`flex-1 text-[14px] font-bold text-right ${
        driverConfirmInfo.전화번호 ? "text-[#1B2B4B]" : "text-gray-500"
      }`}>
        {formatPhone(driverConfirmInfo.전화번호) || "정보 없음"}
      </span>
    </div>
  </div>
</div>

            {/* 버튼 영역 */}
<div className="px-6 pb-5 space-y-3">

  {/* 빠른기사등록 인라인 폼 */}
  {quickRegMode ? (
    <div className="border border-[#1B2B4B]/20 rounded-xl overflow-hidden">
      <div className="bg-[#1B2B4B]/5 px-4 py-2.5 border-b border-[#1B2B4B]/15">
        <span className="text-[12px] font-bold text-[#1B2B4B]">신규 기사 정보 입력</span>
        <span className="text-[11px] text-[#1B2B4B]/60 ml-2">{driverConfirmInfo.차량번호}</span>
      </div>
      <div className="p-4 space-y-2.5">
        <div>
          <label className="text-[11px] font-bold text-gray-500 block mb-1">기사명</label>
          <input autoComplete="off"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
            placeholder="홍길동"
            value={quickRegName}
            onChange={e => setQuickRegName(e.target.value)}
            ref={imeFocusRef}
            onKeyDown={async e => {
              if (e.key === "Enter" && quickRegName.trim()) {
                const formatted = formatPhone(quickRegPhone);
                const raw = formatted.replace(/[^\d]/g, "");
                await upsertDriver({ 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw });
                if (driverPanelCallbackRef.current) {
                  await driverPanelCallbackRef.current(quickRegName, formatted);
                  driverPanelCallbackRef.current = null;
                } else {
                  await patchDispatch(driverConfirmRowId, { 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw, 배차상태: "배차완료", updatedAt: Date.now() });
                  setRows(prev => prev.map(r => r._id === driverConfirmRowId ? { ...r, 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw, 배차상태: "배차완료", updatedAt: Date.now() } : r));
                }
                setQuickRegMode(false); setQuickRegName(""); setQuickRegPhone("");
                setDriverConfirmOpen(false);
                showAlert(`기사 "${quickRegName}" 등록 완료`);
              }
            }}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 block mb-1">전화번호</label>
          <input autoComplete="off"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
            placeholder="010-0000-0000"
            value={quickRegPhone}
            onChange={e => setQuickRegPhone(formatPhone(e.target.value))}
            onKeyDown={async e => {
              if (e.key === "Enter" && quickRegName.trim()) {
                const formatted = formatPhone(quickRegPhone);
                const raw = formatted.replace(/[^\d]/g, "");
                await upsertDriver({ 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw });
                if (driverPanelCallbackRef.current) {
                  await driverPanelCallbackRef.current(quickRegName, formatted);
                  driverPanelCallbackRef.current = null;
                } else {
                  await patchDispatch(driverConfirmRowId, { 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw, 배차상태: "배차완료", updatedAt: Date.now() });
                  setRows(prev => prev.map(r => r._id === driverConfirmRowId ? { ...r, 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw, 배차상태: "배차완료", updatedAt: Date.now() } : r));
                }
                setQuickRegMode(false); setQuickRegName(""); setQuickRegPhone("");
                setDriverConfirmOpen(false);
                showAlert(`기사 "${quickRegName}" 등록 완료`);
              }
            }}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            className="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[12px] font-semibold transition"
            onClick={() => { setQuickRegMode(false); setQuickRegName(""); setQuickRegPhone(""); }}>
            취소
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition text-white ${
              quickRegName.trim()
                ? "bg-[#1B2B4B] hover:bg-[#243a60]"
                : "bg-gray-300 cursor-not-allowed"
            }`}
            disabled={!quickRegName.trim()}
            onClick={async () => {
              const formatted = formatPhone(quickRegPhone);
              const raw = formatted.replace(/[^\d]/g, "");
              await upsertDriver({ 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw });
              if (driverPanelCallbackRef.current) {
                await driverPanelCallbackRef.current(quickRegName, formatted);
                driverPanelCallbackRef.current = null;
              } else {
                await patchDispatch(driverConfirmRowId, { 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw, 배차상태: "배차완료", updatedAt: Date.now() });
                setRows(prev => prev.map(r => r._id === driverConfirmRowId ? { ...r, 차량번호: driverConfirmInfo.차량번호, 이름: quickRegName, 전화번호: raw, 배차상태: "배차완료", updatedAt: Date.now() } : r));
              }
              setQuickRegMode(false); setQuickRegName(""); setQuickRegPhone("");
              setDriverConfirmOpen(false);
              showAlert(`기사 "${quickRegName}" 등록 완료`);
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
        onClick={() => { setDriverConfirmOpen(false); setQuickRegName(""); setQuickRegPhone(""); }}>
        {driverConfirmInfo.type === "mismatch" ? "현재 기사 유지" : "취소"}
      </button>

      <button
        className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition"
        onClick={() => setQuickRegMode(true)}>
        빠른 기사 등록
      </button>

      <button
        className={`flex-1 py-2.5 rounded-xl font-bold text-[13px] transition ${
          driverConfirmInfo.type === "new"
            ? "bg-[#1B2B4B]/20 text-gray-500 cursor-not-allowed"
            : "bg-[#1B2B4B] hover:bg-[#243a60] text-white"
        }`}
        disabled={driverConfirmInfo.type === "new"}
        onClick={async () => {
          const d = driverConfirmInfo;
          const updated = { 차량번호: d.차량번호, 이름: d.이름, 전화번호: d.전화번호, 배차상태: "배차완료", updatedAt: Date.now() };
          await patchDispatch(driverConfirmRowId, updated);
          setRows(prev => prev.map(r => r._id === driverConfirmRowId ? { ...r, ...updated } : r));
          setDriverConfirmOpen(false);
          if (driverConfirmInfo.type === "mismatch") showAlert(`기사정보를 "${d.이름}"(으)로 변경했습니다.`);
        }}>
        {driverConfirmInfo.type === "mismatch" ? "DB 기사로 변경" : "확인 (배차완료)"}
      </button>
    </div>
  )}
</div>
          </div>
        </div>
      )}


      {/* ===== 오더복사수정패널 기사정보: 동일 차량번호 기사 여러명 선택 팝업 (PART 4) ===== */}
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
                    setCopyTarget(prev => ({ ...prev, 차량번호: d.차량번호, 이름: d.이름, 전화번호: formatPhone(d.전화번호), 배차상태: "배차완료" }));
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
              <button className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition" onClick={() => setCopyDriverPick(null)}><EditableText id="misc.btn.30379.취소" defaultText="취소" /></button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 스마트 검색 충돌 팝업 (PART 4) ===== */}
      <SamePlateConflictPopup popup={smart4ConflictPopup} onClose={() => setSmart4ConflictPopup(null)} onResolved={() => { setSmartQ4(""); setSmartList4([]); setSmart4ConflictPopup(null); }} isViewer={isViewer} upsertDriver={upsertDriver} userCompany={userCompany} formatPhone={formatPhone} keepBtnTextId="misc.btn.30395.기존 정보 사용" />

{/* ======================= 우클릭 컨텍스트 메뉴 ======================= */}
      {contextMenu && (
        <div
          className="fixed z-[999999] bg-white/95 backdrop-blur border border-[#DCE3EE] rounded-2xl shadow-[0_18px_44px_rgba(11,20,40,0.28)] p-1.5 min-w-[188px] select-none"
          style={(() => {
            const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1;
            const vh = window.innerHeight / _z;
            const vw = window.innerWidth / _z;
            const left = Math.min(contextMenu.x, vw - 180);
            // 메뉴의 실제 높이는 항목 구성에 따라 달라져 미리 알 수 없으므로,
            // 클릭 지점이 화면 하단에 가까우면 top이 아닌 bottom으로 앵커해
            // 위쪽으로 펼쳐지게 한다 (bottom 앵커는 엘리먼트 높이와 무관하게
            // 항상 화면 안에 들어온다). 남은 공간이 부족하면 스크롤로 보강한다.
            return contextMenu.y > vh * 0.55
              ? { bottom: Math.max(8, vh - contextMenu.y), left, maxHeight: vh - 16, overflowY: "auto" }
              : { top: contextMenu.y, left, maxHeight: vh - contextMenu.y - 16, overflowY: "auto" };
          })()}
          onClick={e => e.stopPropagation()}
        >
          {/* 기사복사 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              // 📋 2026-11-16 여러 건을 골라 둔 상태면 그대로(1건만 복사되던 문제)
              if (!(selected.length > 1 && selected.includes(contextMenu.row._id))) setSelected([contextMenu.row._id]);
              setCopyModalOpen(true);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <EditableText id="realtime.ctxMenu.기사복사" defaultText="기사복사" />
          </button>
          {/* 업로드링크 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenu.row;
              const url = withCo(`${window.location.origin}/driver-upload?date=${encodeURIComponent(r.상차일||"")}&vehicle=${encodeURIComponent((r.차량번호||"").replace(/\s/g,""))}&name=${encodeURIComponent((r.이름||"").trim())}`);
              const msg = `[인수증 업로드 안내]\n운송 완료 후 아래 링크를 통해 인수증을 업로드해 주시기 바랍니다.\n\n여기를 눌러 업로드해주세요\n${url}\n\n날짜·차량번호·이름을 확인 후 검색하여 오더를 선택해 업로드해 주세요.\n미업로드 시 운임 정산이 지연될 수 있습니다.`;
              navigator.clipboard.writeText(msg).then(() => showAlert("업로드 안내 메시지가 복사되었습니다.\n기사에게 붙여넣기로 전달하세요.")).catch(() => showAlert(`링크: ${url}`));
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <EditableText id="realtime.ctxMenu.업로드링크" defaultText="업로드링크" />
          </button>
          <div className="border-t border-gray-100 my-1"/>
          {/* 오더정보 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => { setOrderInfoRow4(contextMenu.row); setContextMenu(null); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <EditableText id="realtime.ctxMenu.오더정보" defaultText="오더정보" />
          </button>
          {/* 수정 — 오더복사수정패널을 연다 (선택한 오더 수정 팝업은 폐지) */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenu.row;
              const latest = dispatchData.find(d => d._id === r._id) || r;
              const raw = String(latest?.화물내용 || "");
              const KNOWN_SUFFIXES = [...new Set(["파레트", "파렛트", "박스", "통", ...cpCargoTypeOptions])].sort((a, b) => b.length - a.length);
              let cargoNum = "", cargoType = "";
              const rawBase21 = raw.split("+")[0];
              for (const s of KNOWN_SUFFIXES) { if (rawBase21.endsWith(s)) { cargoNum = rawBase21.slice(0, -s.length).trim(); cargoType = s; break; } }
              if (!cargoType) { cargoNum = rawBase21; cargoType = ""; }
              const ton = latest.차량톤수 || "";
              const tonValue = ton.match(/[\d.]+/)?.[0] || "";
              const tonType = ton.includes("kg") ? "kg" : ton.includes("톤") ? "톤" : "";
              setCopyTarget({ ...latest, 화물내용: raw, 화물수량: cargoNum, 화물타입: cargoType, 톤수값: tonValue, 톤수타입: tonType });
              setCopyPanelOpen(true);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <EditableText id="realtime.ctxMenu.수정" defaultText="수정" />
          </button>
          {/* 운임정보 — 기사 운임 증빙서(운임확인서) 미리보기 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              // 🧾 여러 건을 골라 두고 그중 하나에서 누르면 고른 건 전부를 운임명세서로
              const r = contextMenu.row;
              const picked = selected.length > 1 && selected.includes(r._id) ? rows.filter((x) => selected.includes(x._id)) : null;
              setFareCertRow(picked && picked.length > 1 ? picked : r);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>
            <EditableText id="realtime.ctxMenu.운임정보" defaultText="운임정보" />
          </button>
          {/* 운임조회 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenu.row;
              setContextMenu(null);
              handleCtxFareSearch4(r);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <EditableText id="realtime.ctxMenu.운임조회" defaultText="운임조회" />
          </button>
          {/* 첨부현황 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              setAttachStatusClient(contextMenu.row.거래처명 || "");
              setAttachStatusOpen(true);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <EditableText id="realtime.ctxMenu.첨부현황" defaultText="첨부현황" />
          </button>
          {/* 문자보내기 — 체크박스로 여러 건을 선택해둔 채 우클릭하면 선택된 오더 전체의
              기사 번호를 받는사람으로 한 번에 연결한다(휴대폰 연결 앱은 sms: URI에 쉼표로
              구분된 번호를 다중 수신자로 지원). 아무것도 선택 안 했으면 우클릭한 1건만. */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenu.row;
              const targets = selected.length > 0 ? rows.filter(x => selected.includes(x._id)) : [r];
              const phones = [...new Set(targets.map(x => String(x.전화번호 || "").replace(/[^\d]/g, "")).filter(Boolean))];
              if (!phones.length) { showAlert("전화번호가 없습니다."); setContextMenu(null); return; }
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
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <EditableText id="realtime.ctxMenu.문자보내기" defaultText="문자보내기" />{selected.length > 1 ? ` (${selected.length}명)` : ""}
          </button>
          {/* 최적매칭 — 이 노선을 과거에 다녀간 기사를 찾아 배차 가능 여부를 문자로 확인 */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => { setOptimalMatchRow4(contextMenu.row); setContextMenu(null); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
            <EditableText id="realtime.ctxMenu.최적매칭" defaultText="최적매칭" />
          </button>
          {/* 스케줄표 — 선택한(없으면 우클릭한 1건) 오더들을 날짜별/기사별로 정리해
              미리보기하고, 이미지/PDF저장·인쇄까지 할 수 있는 팝업을 연다. */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenu.row;
              const targets = selected.length > 0 ? rows.filter(x => selected.includes(x._id)) : [r];
              setScheduleChartRows(targets);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <EditableText id="realtime.ctxMenu.스케줄표" defaultText="스케줄표" />{selected.length > 1 ? ` (${selected.length}건)` : ""}
          </button>
          {/* 전표발행 — 물류기기(파렛트) 이동전표를 발송처용/파렛트회사용/운송회사용
              3부로 만들어 이미지·PDF저장/인쇄할 수 있는 팝업을 연다. 여러 건을
              선택해둔 채 우클릭하면(스케줄표와 동일한 방식) 한 번에 이어서 발행한다. */}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
            onClick={() => {
              const r = contextMenu.row;
              const targets = selected.length > 0 ? rows.filter(x => selected.includes(x._id)) : [r];
              setPalletSlipRows(targets);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
            <EditableText id="realtime.ctxMenu.전표발행" defaultText="전표발행" />{selected.length > 1 ? ` (${selected.length}건)` : ""}
          </button>
          {/* 일괄수정 — 2건 이상 선택했을 때만 활성화. 선택한 오더들을 한 화면에
              늘어놓고 운임/메모/전달사항 등을 일괄 또는 개별로 고쳐 한 번에 저장. */}
          {(selected.length >= 1 || contextMenu?.row) && (
            <button
              className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[#2A3852] hover:bg-[#0F1A30] hover:text-white flex items-center gap-2.5 transition-colors"
              onClick={() => {
                // 🗂 2026-11-09 1건부터 — 선택이 없으면 우클릭한 오더 1건
                const picked = rows.filter(x => selected.includes(x._id));
                setBulkLegacy(false); setBulkEditRows(picked.length ? picked : [contextMenu.row]);
                setContextMenu(null);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <EditableText id="realtime.ctxMenu.일괄수정복사" defaultText="일괄수정·복사" /> ({Math.max(1, selected.length)}건)
            </button>
          )}
          {rtBiz.multi && (() => { const _id = contextMenu.row._id; const ids = selected.includes(_id) && selected.length > 1 ? [...selected] : [_id]; const cur = bizOf(contextMenu.row, rtBiz.defaultName); return (
            <div className="px-4 py-2 border-t border-gray-100">
              <div className="text-[11.5px] font-black text-gray-500 mb-1.5">청구 사업자 바꾸기{ids.length > 1 ? ` (${ids.length}건)` : ""}</div>
              <BizSelect inline biz={rtBiz} value={ids.length === 1 ? cur : null} size="sm" onClose={() => setContextMenu(null)}
                onChange={async (v) => { if (ids.length === 1 && v === cur) { setContextMenu(null); return; } if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; ids.forEach((x) => patchDispatch(x, { 청구사업자: v })); const _r = ids.length === 1 ? contextMenu.row : null; if (_r) rememberBiz(rtBiz, { ..._r, 청구사업자: v }); setContextMenu(null); }} />
            </div>
          ); })()}
          <div className="border-t border-gray-100 my-1"/>
          {/* 삭제 */}
          <button
            className="w-full text-left px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
            onClick={() => {
              setDeleteList(selected.includes(contextMenu.row._id) && selected.length > 1 ? rows.filter((r) => selected.includes(r._id)) : [contextMenu.row]); // ⭐ 선택한 줄 위에서 지우면 선택한 줄 전부
              setDeleteConfirmOpen(true);
              setContextMenu(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            <EditableText id="realtime.ctxMenu.삭제" defaultText="삭제" />
            <span className="ml-auto text-[11px] text-gray-500 tabular-nums">Del</span>
          </button>
        </div>
      )}

{/* ===================== 운임조회 (Part 4) - 이력없음 확인 ===================== */}
<FareNoHistoryConfirm open={ctxNoHistory4Open} onClose={() => setCtxNoHistory4Open(false)} onYes={() => { setCtxNoHistory4Open(false); setCtxAddrSearch4Open(true); }} editableTitle />

{/* ===================== 운임조회 (Part 4) - 주소 검색 ===================== */}
<AddrFareSearchModal open={ctxAddrSearch4Open} onClose={() => setCtxAddrSearch4Open(false)} pickup={ctxAddrPickup4} setPickup={setCtxAddrPickup4} drop={ctxAddrDrop4} setDrop={setCtxAddrDrop4} onSearch={handleCtxAddrSearch4} allClients={ctxAddrAllClients4} setAllClients={setCtxAddrAllClients4} results={ctxAddrResults4} />

{/* ===================== 운임조회 (Part 4) - 결과 모달 ===================== */}
{ctxFare4PanelOpen && ctxFare4Result && (
  <CtxFareResultModal result={ctxFare4Result} target={ctxFare4Target} records={sortFareHistory(ctxFare4Result.records || [], ctxFare4SortMode)} sortControl={<FareSortDropdown value={ctxFare4SortMode} onChange={setCtxFare4SortMode} />}
    isMoto={getVehicleGroup(ctxFare4Target?.차량종류) === "motorcycle"} onClose={() => setCtxFare4PanelOpen(false)} />
)}

{/* ======================= 선택삭제 확인 팝업 ======================= */}
      {deleteConfirmOpen && (
        <KpDeleteConfirm rows={deleteList} onCancel={() => setDeleteConfirmOpen(false)} onConfirm={executeDelete} />
      )}

      {showUndo && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg z-[99999] flex items-center gap-3">
          <span>삭제됨</span>
          <button onClick={undoDelete} className="underline font-semibold">
            되돌리기
          </button>
        </div>
      )}

      {/* 기사복사 선택 모달 */}
      {copyModalOpen && (() => {
        const copyOptions = [
          { type: "basic", label: "차량 · 기사 · 연락처", desc: "차량번호 / 기사명 / 전화번호", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> },
          { type: "fare", label: "운임 포함", desc: "부가세 / 선불 / 착불 형식", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
          { type: "full", label: "전체 상세", desc: "상하차 + 화물 + 기사 정보", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
          { type: "driver", label: "기사 전달용", desc: "운행 정보 + 전달 문구(⚙ 문구 설정에서 변경)", primary: true, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M19 8v6M22 11h-6"/></svg> },
          { type: "simple", label: "간단 목록", desc: "11/16 에이제이-벤더 당착 11톤 7대 + 차량 · 기사 · 연락처 한 줄씩", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg> },
        ];
        return (
          <div className="fixed inset-0 bg-[rgba(11,20,40,0.45)] flex items-center justify-center z-[99999] p-4" onClick={() => { setCopyModalOpen(false); setSelected([]); }}>
            {/* 🎨 2026-11-16 복사 형식 선택 — 가운데 창 · 큰 글씨 · 두 칸 */}
            <div className="bg-white w-full max-w-[620px] rounded-2xl shadow-[0_24px_60px_rgba(11,20,40,0.35)] overflow-hidden" onClick={e => e.stopPropagation()} data-kp="copy-format">
              <div className="px-6 py-4 flex items-center gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
                <div className="min-w-0 mr-auto">
                  <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">COPY FORMAT</div>
                  <div className="text-[18px] font-black text-white leading-tight">복사 형식 선택 <span className="text-[14px] font-bold text-white/60">· 선택 {selected.length}건</span></div>
                </div>
                <button type="button" onClick={openCopyTemplateEditor} className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold text-white hover:bg-white/20" title="전체 상세 · 기사 전달용 · 간단 목록 문구를 바꿉니다">⚙ 문구 설정</button>
                <button type="button" aria-label="닫기" onClick={() => { setCopyModalOpen(false); setSelected([]); }} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[16px]">✕</button>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {copyOptions.map(({ type, label, desc, icon, primary }) => (
                  <button key={type} type="button" onClick={() => copyMessage(type)} data-copy-type={type}
                    className={`group w-full flex items-start gap-3 px-4 py-3.5 rounded-xl text-left border transition ${primary ? "bg-[#0F1A30] border-[#0F1A30] text-white hover:bg-[#1B2B4B] sm:col-span-2" : type === "simple" && selected.length > 1 ? "bg-white border-[#2457D6] ring-2 ring-[#2457D6]/15 hover:bg-[#F4F7FD]" : "bg-white border-[#DCE3EE] hover:border-[#8FB0F0] hover:bg-[#F8FAFD]"}`}>
                    <span className={`mt-0.5 w-9 h-9 shrink-0 rounded-lg grid place-items-center ${primary ? "bg-white/10 text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[15px] font-black ${primary ? "text-white" : "text-[#0F1A30]"}`}>{label}{type === "simple" && selected.length > 1 && <span className="ml-1.5 text-[12px] font-black text-[#2457D6]">여러 건 추천</span>}</span>
                      <span className={`block text-[13px] mt-0.5 leading-snug break-keep ${primary ? "text-white/75" : "text-[#5B6B85]"}`}>{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              <ImageCopyButtons onAccount={copyAccountImage4} onBiz={copyBizImage4} />
              <div className="px-5 py-3 bg-[#F8FAFD] border-t border-[#E3E8F0] flex justify-end">
                <button type="button" onClick={() => { setCopyModalOpen(false); setSelected([]); }} className="h-10 px-6 rounded-xl border border-[#D5DDEA] bg-white text-[14px] font-bold text-[#3A4A66]"><EditableText id="misc.btn.31044.취소" defaultText="취소" /></button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ===================== 🔥 즉시 변경 확인 팝업 (PART 5 이식) ===================== */}
      {confirmChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000]">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.상태 변경" defaultText="상태 변경" /></h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 border border-gray-100">
                <div className="text-[12px] font-semibold text-gray-500 mb-1">{confirmChange.key}</div>
                <div className="text-[13px] text-gray-800">
                  <span className="text-gray-500">{confirmChange.before || "없음"}</span>
                  <span className="mx-2 text-gray-400">→</span>
                  <span className="font-bold text-[#1B2B4B]">{confirmChange.after}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition" onClick={() => setConfirmChange(null)}><EditableText id="misc.btn.31067.취소" defaultText="취소" /></button>
                <button className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a] transition"
                  onClick={() => {
                   const patch = {
                      [confirmChange.key]: confirmChange.after, ...(confirmChange.extra || {}),
                      updatedAt: Date.now(),
                    };
                    // ⭐ 이미 화면에 있는 행 데이터를 알고 있으니(dispatchData.find),
                    // patchDispatch가 다시 캐시/서버 조회를 하지 않도록 knownPrev로
                    // 바로 넘긴다 — 이 팝업의 "변경" 버튼을 눌렀을 때 느껴지던 지연의
                    // 유력한 원인이었다. 저장 자체도 기다리지 않고(fire-and-forget)
                    // 즉시 팝업을 닫아 끊김 없이 반응하게 한다.
                    const row = dispatchData.find(r => r._id === confirmChange.rowId);

                    if (confirmChange.key === "배차상태" && confirmChange.after === "배차중") {
                      patch.차량번호 = "";
                      patch.이름 = "";
                      patch.전화번호 = "";
                      // 기사취소로 배차중 복귀 — 화주사가 걸어둔 취소요청(기사취소요청)이 있었다면
                      // 목적이 이미 달성된 것이므로 함께 해제해, 화주사 화면이 "취소요청중"에
                      // 계속 멈춰있지 않도록 한다.
                      if (row?.취소요청) {
                        patch.취소요청 = false;
                        patch.취소요청일시 = null;
                        patch.취소요청자 = null;
                      }
                    }

                    if (confirmChange.key === "업체전달상태") {
                      patch.업체전달일시 =
                        confirmChange.after === "전달완료"
                          ? Date.now()
                          : null;
                      patch.업체전달방법 = "수동";
                      patch.__system = true;
                    }
if (confirmChange.key === "지급방식") {
  Object.assign(patch, payTypeStatusPatch(row || {}, confirmChange.after)); // 🚚 2026-11-07 공용 규칙(모바일과 같음)
}
// ⭐ 이 화면의 grid는 dispatchData가 아니라 별도 로컬 rows 상태(마운트 시점
// 스냅샷)를 그대로 filtered로 파생해서 그리는데, patchDispatch는 공용
// dispatchData만 낙관적으로 갱신하고 이 컴포넌트의 rows는 건드리지 않는다.
// 그래서 이 팝업으로 배차방식 등을 바꾸고 저장해도 Firestore엔 정상 반영되지만
// 화면(그리드)에는 그대로 예전 값이 남아있어 "안 바뀐 것처럼" 보이던 버그의
// 원인이었다 — rows도 함께 갱신해 화면이 즉시 따라오게 한다.
setRows(prev => prev.map(x => x._id === confirmChange.rowId ? { ...x, ...patch } : x));
patchDispatch(confirmChange.rowId, patch, row).catch(console.error);
flashRow(confirmChange.rowId);
setConfirmChange(null);
                  }}
                >
                  변경
                </button>
              </div>
            </div>
          </div>
        </div>
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
                  ><EditableText id="misc.btn.31168.거절" defaultText="거절" /></button>
                  <button
                    onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await approveEditRequest(o); }}
                    className="px-4 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"
                  ><EditableText id="misc.btn.31172.승인" defaultText="승인" /></button>
                </>
              ) : (
                <button
                  onClick={async () => { const o = editReqPopup; setEditReqPopup(null); await acknowledgeShipperEditPC(o); }}
                  className="px-4 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"
                ><EditableText id="misc.btn.31178.확인" defaultText="확인" /></button>
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
              ><EditableText id="misc.btn.31207.닫기" defaultText="닫기" /></button>
              <button
                onClick={async () => {
                  if (isViewer) return showAlert("조회전용 권한으로는 처리할 수 없습니다.");
                  const o = cancelReqPopup; setCancelReqPopup(null); await rejectCancelRequestPC(o);
                }}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-[13px] font-bold hover:bg-red-50 transition"
              ><EditableText id="misc.btn.31214.거절" defaultText="거절" /></button>
              <button
                onClick={async () => {
                  if (isViewer) return showAlert("조회전용 권한으로는 처리할 수 없습니다.");
                  const o = cancelReqPopup; setCancelReqPopup(null); await approveCancelRequestPC(o);
                }}
                className="px-4 py-2 bg-red-600 text-white text-[13px] font-bold rounded-lg hover:bg-red-700 transition"
              ><EditableText id="misc.btn.31221.승인" defaultText="승인" /></button>
            </div>
          </div>
        </div>
      )}
      {/* ===================== 📤 업체 전달 상태 변경 팝업 ===================== */}
      {/* SMS 전송 확인 팝업 (기사전달용) Part 4 */}
      {smsConfirm4 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100002]">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.문자 메시지 전송" defaultText="문자 메시지 전송" /></h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-100 text-[13px] text-gray-700">
                <span className="font-semibold text-[#1B2B4B]">{smsConfirm4.phone || "번호 없음"}</span><br />
                으로 문자를 전송하시겠습니까?
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition" onClick={() => setSmsConfirm4(null)}><EditableText id="misc.btn.31240.취소" defaultText="취소" /></button>
                <button
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a] transition"
                  onClick={() => {
                    const phone = smsConfirm4.phone.replace(/[^\d]/g, "");
                    sendText({ phones: [phone], body: smsConfirm4.body }); // 💬 2026-11-10
                    setSmsConfirm4(null);
                  }}
                ><EditableText id="misc.btn.31248.문자 보내기" defaultText="문자 보내기" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 업로드링크 다중 전송 확인 팝업 (Part 4) — 체크한 배차완료 오더가 1건 이상일 때 */}
      {bulkUploadConfirm4 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100002]">
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.업로드 안내 메시지 전송" defaultText="업로드 안내 메시지 전송" /></h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-100 text-[13px] text-gray-700">
                선택한 <span className="font-semibold text-[#1B2B4B]">{bulkUploadConfirm4.phones.length}명</span>의 기사에게<br />
                업로드 안내 메시지 창을 여시겠습니까?
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition" onClick={() => setBulkUploadConfirm4(null)}><EditableText id="misc.btn.31268.취소" defaultText="취소" /></button>
                <button
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a] transition"
                  onClick={() => {
                    sendText({ phones: bulkUploadConfirm4.phones, body: bulkUploadConfirm4.body }); // 💬 2026-11-10
                    setBulkUploadConfirm4(null);
                  }}
                ><EditableText id="misc.btn.31275.메시지 창 열기" defaultText="메시지 창 열기" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {optimalMatchRow4 && (
        <OptimalMatchModal row={optimalMatchRow4} dispatchData={historyDispatchData} companyName={userCompany} onClose={() => setOptimalMatchRow4(null)} />
      )}

      {deliveryConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100001]"
          tabIndex={-1}
          ref={(el) => { if (el && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; setTimeout(() => el.focus(), 0); } }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setDeliveryConfirm(null); return; }
            if (e.key === "Enter") {
              e.preventDefault();
              const sender = auth?.currentUser?.email ?? auth?.currentUser?.uid ?? "unknown";
              const patch = {
                업체전달상태: deliveryConfirm.after,
                업체전달일시: deliveryConfirm.after === "전달완료" ? Date.now() : null,
                업체전달방법: deliveryConfirm.after === "전달완료" ? "수동" : null,
                업체전달자: deliveryConfirm.after === "전달완료" ? sender : null,
                __system: true,
              };
              setDeliveryConfirm(null);
              const dcIds = new Set(deliveryConfirm.ids || [deliveryConfirm.rowId]); // 📋 간단 목록 = 여러 건
              React.startTransition(() => {
                setRows(prev => prev.map(r => dcIds.has(r._id) ? { ...r, ...patch } : r));
              });
              dcIds.forEach((id) => patchDispatch(id, patch).catch(console.error));
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-5 py-4">
              <h3 className="text-white font-bold text-[15px]">
                {deliveryConfirm.reason === "copy" ? "복사 완료" : "전달상태 변경"}
              </h3>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 border border-gray-100">
                {deliveryConfirm.reason === "copy" ? (
                  <div className="text-[13px] text-gray-700">{deliveryConfirm.ids?.length > 1 || deliveryConfirm.total > 1 ? <>간단 목록 {deliveryConfirm.total}건 복사 · 미전달 <b className="text-[#1B2B4B]">{deliveryConfirm.ids.length}건</b>의 </> : null}전달상태를 <span className="font-bold text-[#1B2B4B]">전달완료</span>로 변경할까요?</div>
                ) : (
                  <>
                    <div className="text-[12px] font-semibold text-gray-500 mb-1">업체전달상태</div>
                    <div className="text-[13px] text-gray-800">
                      <span className="text-gray-500">{String(deliveryConfirm.before || "미전달")}</span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="font-bold text-[#1B2B4B]">{String(deliveryConfirm.after || "없음")}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition" onClick={() => setDeliveryConfirm(null)}><EditableText id="misc.btn.31333.취소" defaultText="취소" /></button>
                <button className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a] transition"
                  onClick={() => {
                    const sender = auth?.currentUser?.email ?? auth?.currentUser?.uid ?? "unknown";
                    const patch = {
                      업체전달상태: deliveryConfirm.after,
                      업체전달일시: deliveryConfirm.after === "전달완료" ? Date.now() : null,
                      업체전달방법: "수동",
                      업체전달자: sender,
                      __system: true,
                    };
                    setDeliveryConfirm(null);
                    const dcIds = new Set(deliveryConfirm.ids || [deliveryConfirm.rowId]); // 📋 간단 목록 = 여러 건
                    React.startTransition(() => {
                      setRows(prev => prev.map(r => dcIds.has(r._id) ? { ...r, ...patch } : r));
                    });
                    dcIds.forEach((id) => patchDispatch(id, patch).catch(console.error));
                  }}
                ><EditableText id="misc.btn.31350.변경" defaultText="변경" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
{/* ===================== 일마감 모달 ===================== */}
{dailyCloseOpen && (
  <div
    className="fixed inset-0 bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center z-[99999]"
    onClick={() => setDailyCloseOpen(false)}
  >
    <div
      className="bg-[#F4F6FA] rounded-[26px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] w-[1600px] max-w-[96vw] max-h-[92vh] flex flex-col overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* 헤더 */}
      <div className="relative px-7 py-5 flex items-center justify-between shrink-0 text-white overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}><span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div>
          <div className="relative text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DAILY CLOSE · VERIFY</div><div className="relative text-white font-black text-[22px] leading-tight mt-0.5">일마감 검증</div>
          <div className="relative text-white/60 text-[12.5px] mt-0.5 font-semibold">
            {dailyCloseResult?.date || ""} 기준 ({dailyCloseResult?.total || 0}건)
          </div>
        </div>
        <button
          className="relative h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-[13px] font-bold flex items-center justify-center transition"
          onClick={() => setDailyCloseOpen(false)}
        >닫기 ✕</button>
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
                <div
                  key={item.label}
                  onClick={() => { if (item.key) setDailyCloseFilter(item.key); }}
                  className={`relative rounded-2xl px-5 py-4 text-left transition border ${item.key ? "cursor-pointer hover:-translate-y-0.5" : ""} ${item.active ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_12px_28px_rgba(15,26,48,0.28)]" : "bg-[#F7F9FC] border-[#E3E8F0] text-[#0F1A30] hover:border-[#2D4C82]"}`}
                >
                  <div className={`text-[12px] font-black ${item.active ? "text-[#8FB0F0]" : "text-[#5B6B85]"}`}>{item.label}</div>
                  <div className="text-[30px] font-black leading-tight tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{item.value}<span className="text-[13px] font-bold opacity-50 ml-1">건</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* 오류 목록 */}
          {(dailyCloseFilter === "all" || dailyCloseFilter === "errors") && dailyCloseResult.errors.length > 0 && (
            <div className="mx-6 mt-4 p-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]">
              <div className="text-[15px] font-black text-[#0F1A30] mb-3">
                오류 ({dailyCloseResult.errors.length}건) - 필수 수정
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dailyCloseResult.errors.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 border border-[#E3E8F0] rounded-xl cursor-pointer bg-white hover:border-[#2D4C82] hover:shadow-[0_6px_16px_rgba(15,26,48,0.08)] transition"
                    onClick={() => openDailyCloseIssueDetail(e.rowId)}
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#0F1A30] text-white text-[11.5px] font-black tabular-nums flex items-center justify-center shrink-0">
                      {e.seq}
                    </div>
                   <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 break-words">{e.label}</div>
                      <div className="text-[12.5px] font-bold text-[#2D4C82] mt-0.5 break-words">{e.msg}</div>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0F1A30] text-white">
                      누락
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 경고 목록 */}
          {(dailyCloseFilter === "all" || dailyCloseFilter === "warnings") && dailyCloseResult.warnings.length > 0 && (
            <div className="mx-6 mt-4 p-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)]">
              <div className="text-[15px] font-black text-[#0F1A30] mb-3">
                경고 ({dailyCloseResult.warnings.length}건) - 확인 필요
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dailyCloseResult.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 border border-[#E3E8F0] rounded-xl cursor-pointer bg-white hover:border-[#2D4C82] hover:shadow-[0_6px_16px_rgba(15,26,48,0.08)] transition"
                    onClick={() => openDailyCloseIssueDetail(w.rowId)}
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#EEF2F8] text-[#1B2B4B] text-[11.5px] font-black tabular-nums flex items-center justify-center shrink-0">
                      {w.seq}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 break-words">{w.label}</div>
                      <div className="text-[12px] font-semibold text-gray-500 mt-0.5 break-words">{w.msg}</div>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EEF2F8] text-[#1B2B4B] border border-[#DCE3EE]">
                      {w.type === "margin" ? "마진" :
                       w.type === "driver" ? "기사" :
                       w.type === "phone" ? "번호" :
                       w.type === "zero" ? "0원" :
                       w.type === "high" ? "고액" : w.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* 전체 정상일 때 */}
          {dailyCloseResult.errors.length === 0 && dailyCloseResult.warnings.length === 0 && (
            <div className="px-6 py-8 text-center">
              <div className="text-[16px] font-bold text-[#1B2B4B]">모든 오더가 정상입니다</div>
              <div className="text-[13px] text-gray-500 mt-1">
                {dailyCloseResult.total}건 전체 검증 통과
              </div>
            </div>
          )}

          {/* 업체별 요약 */}
          {dailyCloseFilter === "all" && dailyCloseResult.clientSummary && dailyCloseResult.clientSummary.length > 0 && (
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
                        <td className={`px-3 py-2 text-right font-bold ${c.margin < 0 ? "text-[#2D4C82] underline decoration-[#8FB0F0] decoration-2 underline-offset-2" : ""}`}>
                          {c.margin.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#1B2B4B] bg-[#F2F5FA] font-black text-[#0F1A30]">
                      <td className="px-3 py-2">합계</td>
                      <td className="px-3 py-2 text-center">
                        {dailyCloseResult.clientSummary.reduce((a, c) => a + c.count, 0)}건
                      </td>
                      <td className="px-3 py-2 text-right">
                        {dailyCloseResult.clientSummary.reduce((a, c) => a + c.charge, 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {dailyCloseResult.clientSummary.reduce((a, c) => a + c.pay, 0).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right ${
                        dailyCloseResult.clientSummary.reduce((a, c) => a + c.margin, 0) < 0 ? "text-[#2D4C82] underline decoration-[#8FB0F0] decoration-2 underline-offset-2" : ""
                      }`}>
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
        const targets = targetDate ? rows.filter(r => r.상차일 === targetDate) : [];
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
          <button
            className="flex-1 py-2.5 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-[13px] transition"
            onClick={() => { setDailyCloseFilter("all"); setFilterErrorIds(null); }}
          >
            전체 보기
          </button>
        )}
        {(dailyCloseResult?.errors?.length > 0 || dailyCloseResult?.warnings?.length > 0) && dailyCloseFilter === "all" && (
          <button
            className="flex-1 py-2.5 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-[13px] transition"
            onClick={() => {
              const issueIds = [
                ...dailyCloseResult.errors.map(e => e.rowId),
                ...dailyCloseResult.warnings.map(w => w.rowId),
              ];
              const unique = [...new Set(issueIds)];
              setFilterErrorIds(unique);
              setDailyCloseOpen(false);
              setQ("");
            }}
          >
            오류 오더만 보기
          </button>
        )}
        <button
          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px] transition"
          onClick={handleDailyReport}
        >
          보고서 출력
        </button>
        <button
          className="flex-1 py-2.5 rounded-xl bg-white border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#F5F8FD] font-bold text-[13px] transition"
          onClick={() => setCloseReportOpen(true)}
        >
          마감보고 전송
        </button>
        {closeReportOpen && createPortal(<CloseReportModal result={dailyCloseResult} onClose={() => setCloseReportOpen(false)} />, document.body)}
        <button
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition"
          onClick={() => {
            runDailyClose();
            setReVerifyToast("재검증이 완료되었습니다");
            setTimeout(() => setReVerifyToast(null), 2500);
          }}
        >
          재검증
        </button>
        <button
          className="flex-1 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-[13px] transition"
          onClick={() => { setDailyCloseOpen(false); setDailyCloseFilter("all"); }}
        >
          닫기
        </button>
      </div>
    </div>
  </div>
)}
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
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px);}
    to { opacity: 1; transform: translateY(0);}
  }

  @keyframes filterBlink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
`}</style>
      <style>{`
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px);}
    to { opacity: 1; transform: translateY(0);}
  }

@keyframes highlightFade {
    0%   { background-color: rgba(27, 43, 75, 0.13); box-shadow: inset 3px 0 0 0 #3b82f6, 0 0 16px 1px rgba(59,130,246,0.35); }
    70%  { background-color: rgba(59, 130, 246, 0.10); box-shadow: inset 3px 0 0 0 #3b82f6, 0 0 10px 1px rgba(59,130,246,0.18); }
    100% { background-color: transparent; box-shadow: inset 3px 0 0 0 transparent, 0 0 0 0 rgba(59,130,246,0); }
  }

  .row-highlight {
    animation: highlightFade 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    will-change: background-color, box-shadow;
  }
  /* ⚡ 실시간배차현황 순번 — 줄 순서대로 CSS가 매김(정렬해도 줄을 다시 그리지 않음) */
  .kp-rt-body { counter-reset: kprtno; }
  .kp-rt-body > tr { counter-increment: kprtno; }
  .kp-rt-body > tr > td.kp-rt-no::before { content: counter(kprtno); }
  /* 다크모드 줄무늬 */
  .kp-rt-body.kp-rt-dark > tr.bg-gray-900:nth-child(even) { background-color: rgb(31 41 55); }
  .kp-rt-body.kp-rt-dark > tr.bg-gray-900:hover { background-color: rgb(55 65 81); }
`}</style>

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
            {/* 헤더 */}
            <div className={`px-6 py-4 flex items-center gap-3 ${headerCls}`}>
              <span className="text-2xl">{icon}</span>
              <h3 className="text-white text-lg font-bold">{title}</h3>
            </div>

            {/* 내용 */}
            <div className="px-6 py-5 space-y-3">
              <div className={`border rounded-lg px-4 py-3 text-sm space-y-1 ${boxCls}`}>
                <div>
                  <span className="text-gray-500">거래처명</span>
                  <b className="ml-2">{warningPopup.name}</b>
                </div>
                {warningPopup.status && (
                  <div className="flex items-center">
                    <span className="text-gray-500">등급</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold text-white ${isBlack ? "bg-gray-900" : isCaution ? "bg-orange-500" : "bg-red-600"}`}>
                      {warningPopup.status}
                    </span>
                  </div>
                )}
                {warningPopup.info?.지정일 && (
                  <div>
                    <span className="text-gray-500">지정일</span>
                    <span className="ml-2">{warningPopup.info.지정일}</span>
                  </div>
                )}
                {(warningPopup.info?.주소) && (
                  <div>
                    <span className="text-gray-500">주소</span>
                    <span className="ml-2">{warningPopup.info.주소}</span>
                  </div>
                )}
                {warningPopup.info?.메모 && (
                  <div>
                    <span className="text-gray-500">메모</span>
                    <span className={`ml-2 font-semibold ${memoTextCls}`}>
                      {warningPopup.info.메모}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-600 text-center font-semibold">
                {warningPopup.status
                  ? <>해당 거래처는 <span className={`font-bold ${isBlack ? "text-red-600" : isCaution ? "text-orange-500" : "text-red-600"}`}>{warningPopup.status} 등급</span>으로 지정된 거래처입니다.</>
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

      {/* ===== 신규 기사 등록 모달 (RealtimeStatus) ===== */}
      {newDriverModalOpen && newDriverModalData && (
        <NewDriverModal
          data={newDriverModalData}
          onClose={() => { setNewDriverModalOpen(false); setNewDriverModalData(null); }}
          onConfirm={(driverInfo, mode) => {
            newDriverModalData.onConfirm(driverInfo, mode);
            setNewDriverModalOpen(false);
            setNewDriverModalData(null);
          }}
        />
      )}
    </div>
  );
}
