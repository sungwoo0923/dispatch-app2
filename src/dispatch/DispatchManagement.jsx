// ======================= src/dispatch/DispatchManagement.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { kpConfirm, kpPrompt } from "../kpDialog";
import ToolMenuButton from "../toolMenu";
import { loadTmap } from "../tmapLoader";
import { attachTmapTraffic } from "../trafficTmap";
import { imeFocusRef } from "../imeFocus";
import { canSeeBlind, isViewerNow } from "../blind";
import { restAckKey, findRestConflict, confirmRestDispatch, checkHolidayDispatch } from "../holidayConfirm";
import { drawTmapTrafficRoute, TRAFFIC_LEGEND } from "../mapStyle";
import { html2canvas } from "../lazyLoad";
import React, { useEffect } from "react";
import { withCustomVehicleTypes, VehicleTypeAddButton } from "../vehicleTypes";
import { getTenant } from "../fsTenant";
import { createPortal } from "react-dom";
import { isRegisteredCombo, pickDriverFor, useDriverEditChoice, DriverEditButton, saveDriverChoice } from "../DriverEditChoice";
import OrderLookupModal from "../OrderLookup";
import { useOrderFormFields } from "../orderFormFields";
import OrderFieldsModal from "../OrderFieldsModal";
import { SKIN_SWITCH, readSkin, nextSkin, saveSkin, skinName, ORDER_SKIN_CSS } from "../orderSkins";
import { LAYOUT_SKINS, routeGrid, SwapRouteButton, LayoutDecor, ORDER_LAYOUT_CSS, FareSummary } from "../orderLayouts";
import { placeSearch } from "../placeSearch";
import { dispatchStatusOf, payTypeStatusPatch } from "../dispatchStatus";
import { useCompanyBiz, normBizKey, resolveBiz, rememberBiz, bizOf, BizSelect } from "../companyBiz";
import CustomDatePicker from "../CustomDatePicker";
import { myNameNow } from "../userNames";
import { isJyCompany } from "../jyOnly";
import { findRate } from "../fareQuoteCore";
import { aliasKeys, aliasKey } from "../jyAliases";
import { isManse, learnManse, quoteManse } from "../manseRateCore";
import { ManualButton } from "../WorkManual";
import { EditableText } from "../EditMode";
import { PlaceConflictPopup, NewClientModal } from "../sharedDispatchUi";
import { uiFormDefaults } from "../uiConfig";
import { useCompanyDropdownOptions, dropdownList, DropdownOptionsManageButton } from "../companyDropdownOptions";
import { CompanyOptionPicker } from "../companyOptionPicker";
import { useNotificationsEnabled } from "../notificationSettings";
import { CustomSelect } from "../CustomSelect";
import { estimateDistanceFare, specialSurcharge } from "../tmapFareCalc";
import { RoadviewButton } from "../roadview";
import RouteMapModal from "../RouteMapModal";
import { IdleFleetButton } from "../fleetRecommend";
import { useLoadFullOrderHistory, useLoadOrderRange, pcLiveWindowStart } from "../orderHistory";
import { expandRotation, RotationPicker, RotationBadge } from "../rotation";
import { getDoc, doc, addDoc, collection, serverTimestamp, query, where, onSnapshot } from "firebase/firestore";
import { setDoc, updateDoc } from "../orderWrite";
import { db, auth, DEFAULT_COMPANY } from "../firebase";
import { orderStaffNameRaw as _orderStaffNameRaw } from "../detailGetters";
import OrderScanModal, { looksLikeOrder, scanDropDate } from "../OrderScanModal";
import { mainScanAi } from "../orderScanApi";
import { RecurringManagerModal } from "../AutomationPanels";
import { useFareRules, fareFormChange, farePatchOf, FareRuleHint, FareTypeSelect, FarePctInput } from "../fareRules";
import { SpecialFareTag, SpecialFareLine } from "../specialFareTag";
import { fareStats as calcFareStats, FareShell, FareCard, FareRange, FareFilterPills, FareRow, FareVias } from "../FareResultUi";
import { profitTotals, forkliftApply, paidOut, SpecialFareButton, orderProfit } from "../forklift";
import { useCompanyFeatures } from "../companyFeatures";
import { routeGroupOf } from "../routeGroups";
import { profitCls } from "../marginPct";
import { QuickOrderLine } from "../SmartDispatchUI";
import { DispatchWayPicker } from "../CallPay";
import { isFleetGrade } from "../DriverAppGuide";
import { MARKET_SHORT } from "../orderMarketConfig";
import { shareToHub } from "../hubShare";
import { CARGO_VEHICLE_SPEC_TABLE, CargoExtraChips, ContactPickerIconButton, FareSortDropdown, OrderCalendarPanel, OrderMemoIconButton, PALLET_SPEC_TABLE, REVERSED_DATE_ORDER_MSG, StopBadge, TimeAmPmPicker, WaypointSection, _parseWorkDates, cleanStopCargo, defaultDriverNoticeTemplate, dokchaOn, fareCargoExact, fareCargoPartial, fetchPrinterInfo, formatPhone, getFareMatchLabel, getTotalPalletFromOrder, getTotalTonFromOrder, isReversedDateOrder, issueUploadUrl, makePlaceKey, mergeViaCargoText, mergeViaTonnage, nextManagerName, normalizePlate, safeLoad, safeSave, sflowToast, shouldShowDriverMemoAlert, sortFareHistory, toTonUnit, todayStr } from "./shared/dispatchCommon.jsx";
import { MonthPicker } from "../kpInputs"; // 🗓 2026-11-27 마감월 — 프로그램 달력
import OrderRouteMapPanel from "./OrderRouteMapPanel.jsx"; // 🗺 2026-11-27 시안 L — 오른쪽 실시간 경로 지도
import { SideAssist } from "./OrderWorkAssist.jsx"; // 🧭 2026-11-27 오른쪽 오늘 일정(최고관리자 먼저)


// ================= 카운트 애니메이션 =================
function CountUp({ value, duration = 900 }) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const end = Number(value) || 0;

    if (end === 0) {
      setDisplay(0);
      return;
    }

    const totalFrames = Math.round(duration / 16);
    const increment = end / totalFrames;

    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      const next = Math.min(Math.round(increment * frame), end);
      setDisplay(next);

      if (frame >= totalFrames) clearInterval(timer);
    }, 16);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

// ⭐ 오늘/미래 날짜에 완전히 동일한 오더가 이미 등록돼 있는지 확인한다. 저장을
// 막는 하드 체크가 아니라, 여러 담당자가 같은 오더를 모르고 중복 등록하는 것을
// 막기 위한 안내용 알림에 쓰인다(PC/모바일 공용 로직 — 두 파일에 각각 둔다).
// 상차일·상차지명·하차지명·청구운임이 모두 같으면 "완전히 같은 오더"로
// 간주한다(취소 처리된 오더는 검사 대상에서 제외).
function findDuplicateOrders(form, existingRows) {
  if (!form?.상차일 || !form?.상차지명 || !form?.하차지명) return [];
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (form.상차일 < todayKst) return [];
  const norm = (s) => String(s || "").replace(/\s+/g, "").trim();
  const formSale = String(form.청구운임 || "").replace(/[^\d]/g, "");
  return (existingRows || []).filter((r) => {
    if (!r || (form._id && r._id === form._id)) return false; // 수정 중인 자기 자신 제외
    if (r.배차상태 === "배차취소") return false;
    if ((r.상차일 || "") !== form.상차일) return false;
    if (norm(r.상차지명) !== norm(form.상차지명)) return false;
    if (norm(r.하차지명) !== norm(form.하차지명)) return false;
    if (String(r.청구운임 || "").replace(/[^\d]/g, "") !== formSale) return false;
    return true;
  });
}

// ⭐ 중복 오더 알림 팝업 — 저장을 막지 않고 "취소"/"그래도 등록" 중 선택하게 한다.
// 알록달록한 경고색 대신, 프로그램 전체 톤(네이비 헤더 + 무채색)에 맞춘 디자인.
function DuplicateOrderModal({ matches, onCancel, onProceed }) {
  if (!matches || !matches.length) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-4">
          <div className="text-white font-bold text-[14px]">중복 등록 확인</div>
          <div className="text-white/60 text-[11px] mt-0.5">같은 조건의 오더가 이미 등록되어 있습니다</div>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[45vh] overflow-y-auto">
          <p className="text-[13px] text-gray-600 leading-relaxed">
            같은 날짜·상하차지·운임의 오더가 아래처럼 이미 등록돼 있습니다. 다른 담당자가 먼저 등록했을 수도 있으니 확인 후 진행해 주세요.
          </p>
          {matches.slice(0, 5).map((r, i) => (
            <div key={r._id || i} className="border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] space-y-1 bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#1B2B4B]">{r.상차일}</span>
                <span className="text-gray-500">{r.배차상태 || "-"}</span>
              </div>
              <div className="text-gray-700 font-semibold">{r.상차지명} → {r.하차지명}</div>
              <div className="flex justify-between text-gray-500">
                <span>{r.차량번호 ? `${r.차량번호} · ${r.이름 || ""}` : "미배차"}</span>
                <span className="font-semibold text-gray-700">{Number(r.청구운임 || 0).toLocaleString()}원</span>
              </div>
            </div>
          ))}
          {matches.length > 5 && (
            <div className="text-[11px] text-gray-400 text-center">외 {matches.length - 5}건 더 있음</div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-bold text-[13px] hover:bg-gray-50 transition"><EditableText id="misc.btn.834.취소" defaultText="취소" /></button>
          <button type="button" onClick={onProceed} className="flex-1 py-2.5 rounded-lg bg-[#1B2B4B] text-white font-bold text-[13px] hover:bg-[#243a60] transition"><EditableText id="misc.btn.835.그래도 등록" defaultText="그래도 등록" /></button>
        </div>
      </div>
    </div>
  );
}
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
};

// 파렛트가 적재함에 가로/세로 어느 방향으로 놓여야 더 많이 실리는지 계산 — 계산기
// (FloatingCalculator)와 차량제원표(최대 적재 파렛 자동계산)에서 공용으로 쓴다.
function calcPalletFit(veh, pw_mm, pd_mm) {
  const pw = pw_mm / 10; const pd = pd_mm / 10;
  if (pw <= 0 || pd <= 0) return { cols: 0, rows: 0, rotated: false };
  const o1c = Math.floor(veh.w / pw); const o1r = Math.floor(veh.l / pd);
  const o2c = Math.floor(veh.w / pd); const o2r = Math.floor(veh.l / pw);
  if (o1c * o1r >= o2c * o2r) return { cols: o1c, rows: o1r, rotated: false };
  return { cols: o2c, rows: o2r, rotated: true };
}
// 차량제원표에 "최대 적재 파렛"을 자동 표시할 때 기준으로 삼는 규격 — N11(1100×1100)이
// 현장에서 가장 흔히 쓰이는 표준 파렛트라 이 규격 기준으로 계산한다.
function maxN11PalletCount(veh) {
  if (!veh || !veh.l || !veh.w) return 0;
  const fit = calcPalletFit(veh, 1100, 1100);
  return fit.cols * fit.rows;
}
// 관리자가 더블클릭으로 수정한 값(override)을 기본 행에 덮어씌워 화면에 보여줄
// 최종 값을 만든다. 길이/폭이 override되면 표시 텍스트(bedLength/widthRef)도
// "X.XXm" 형태의 단일 값으로 바뀐다(원본의 범위 표기는 override 전까지만 유지).
function applySpecOverride(base, ov) {
  if (!ov) return base;
  const l = ov.l ?? base.l;
  const w = ov.w ?? base.w;
  const maxKg = ov.maxKg ?? base.maxKg;
  return {
    ...base,
    ton: ov.ton ?? base.ton,
    category: ov.category ?? base.category,
    name: ov.name ?? base.name,
    l, w, maxKg,
    bedLength: ov.l != null ? `${(l / 100).toFixed(2)}m` : base.bedLength,
    widthRef: ov.w != null ? `${(w / 100).toFixed(2)}m` : base.widthRef,
  };
}

// 차량제원표(카고/윙바디) 더블클릭 수정 팝업 — 관리자~최고관리자 전용. 길이/폭/최대중량을
// 고치면 최대 적재 파렛은 calcPalletFit 기준으로 자동 재계산되어 별도 입력칸이 없다.
function VehicleSpecEditModal({ initial, onSave, onCancel, onReset, hasOverride }) {
  const [ton, setTon] = React.useState(initial.ton || "");
  const [category, setCategory] = React.useState(initial.category || "");
  const [name, setName] = React.useState(initial.name || "");
  const [lengthM, setLengthM] = React.useState(initial.l ? (initial.l / 100).toFixed(2) : "");
  const [widthM, setWidthM] = React.useState(initial.w ? (initial.w / 100).toFixed(2) : "");
  const [maxT, setMaxT] = React.useState(initial.maxKg ? (initial.maxKg / 1000).toFixed(1) : "");

  const inpSt = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]";
  const lblSt = "text-[11px] font-bold text-gray-500 mb-1 block";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
      <div className="bg-white rounded-xl shadow-xl p-6 w-[380px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold">차량 제원 수정</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-black text-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lblSt}>톤수</label><input className={inpSt} value={ton} onChange={e => setTon(e.target.value)} /></div>
            <div><label className={lblSt}>구분</label><input className={inpSt} value={category} onChange={e => setCategory(e.target.value)} /></div>
          </div>
          <div><label className={lblSt}>실무상 명칭</label><input className={inpSt} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lblSt}>적재함 길이 (m)</label><input type="number" step="0.01" className={inpSt} value={lengthM} onChange={e => setLengthM(e.target.value)} /></div>
            <div><label className={lblSt}>폭 (m)</label><input type="number" step="0.01" className={inpSt} value={widthM} onChange={e => setWidthM(e.target.value)} /></div>
          </div>
          <div><label className={lblSt}>최대 적재 중량 (t)</label><input type="number" step="0.1" className={inpSt} value={maxT} onChange={e => setMaxT(e.target.value)} /></div>
          <div className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">
            최대 적재 파렛(N11 1100×1100 기준)은 길이·폭 값으로 자동 계산되어 표시됩니다.
          </div>
        </div>
        <div className="flex items-center gap-2 mt-5">
          {hasOverride && (
            <button onClick={onReset} className="px-3 py-2 rounded-lg text-[12px] font-bold text-rose-600 border border-rose-200 hover:bg-rose-50"><EditableText id="misc.btn.4892.원본으로 복원" defaultText="원본으로 복원" /></button>
          )}
          <div className="flex-1" />
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"><EditableText id="misc.btn.4895.취소" defaultText="취소" /></button>
          <button
            onClick={() => onSave({
              ton: ton.trim(), category: category.trim(), name: name.trim(),
              l: Math.round(parseFloat(lengthM) * 100) || initial.l,
              w: Math.round(parseFloat(widthM) * 100) || initial.w,
              maxKg: Math.round(parseFloat(maxT) * 1000) || initial.maxKg,
            })}
            className="px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-[#1B2B4B] hover:bg-[#243a60]"
          ><EditableText id="misc.btn.4904.저장" defaultText="저장" /></button>
        </div>
      </div>
    </div>
  );
}

// ⭐ 배차요청장 "예상 운임"용 반원 다이얼 게이지 — 최소~최대 추정범위 안에서
// 평균(추천값)이 어디쯤인지 바늘로 보여준다. 데이터가 이상하면(min>=max 등)
// 조용히 아무것도 그리지 않는다(에러로 전체 팝업이 죽는 것을 방지).
function FareGauge({ min, avg, max, size = 132 }) {
  if (![min, avg, max].every(Number.isFinite) || max <= min) return null;
  const w = size, h = Math.round(size / 2) + 30;
  const cx = w / 2, cy = Math.round(size / 2) + 4;
  const r = size / 2 - 12;
  const lo = min, hi = max;
  const toXY = (angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };
  const angleFor = (v) => {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    return 180 - t * 180; // t=0(최소) → 180°(좌측), t=1(최대) → 0°(우측)
  };
  const arcPath = (a1, a2) => {
    const p1 = toXY(a1), p2 = toXY(a2);
    return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  };
  const needleAngle = angleFor(avg);
  const needleTip = toXY(needleAngle);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mx-auto block">
      {/* 배경 트랙 */}
      <path d={arcPath(180, 0)} stroke="#e5e7eb" strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* 최소~최대 추정 구간 */}
      <path d={arcPath(180, 0)} stroke="#93c5fd" strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* 바늘 */}
      <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#1B2B4B" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4.5" fill="#1B2B4B" />
      <text x={toXY(180).x} y={h - 6} fontSize="9" fill="#6b7280" textAnchor="start">{Math.round(min / 10000)}만</text>
      <text x={toXY(0).x} y={h - 6} fontSize="9" fill="#6b7280" textAnchor="end">{Math.round(max / 10000)}만</text>
    </svg>
  );
}

// ----------------------------
// ⛽ 자동 슬라이드 유가 배너
// ----------------------------
const AREA_OPTIONS = [
  { code: "", name: "전국" },
  { code: "04", name: "인천" },
  { code: "09", name: "경기" },
  { code: "01", name: "서울" },
];

const FuelSlideWidget = React.memo(function FuelSlideWidget({ card = false } = {}) {
  const [prices, setPrices] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [area, setArea] = React.useState("01");
  const [loading, setLoading] = React.useState(true);

  // 🔹 유가 로드
  // ⚠️ "유가 정보 없음" 원인 2가지:
  //  1) opinet avgSidoPrice.do 응답에는 PRODNM(제품명)이 없고 PRODCD(제품코드)만 온다 →
  //     PRODNM.includes("경유") 가 전부 실패해 items가 빈 배열이 됐다. PRODCD로 이름을 보정한다.
  //  2) 서버는 endpoint 3개를 2.5초씩 시도(최대 7.5초+콜드스타트)하는데 프런트가 3.5초에 끊어버렸다.
  // 마지막 정상값을 localStorage에 보관해 실패해도 직전 유가를 보여준다.
React.useEffect(() => {
  let cancelled = false;
  const cacheKey = `fuelCache_${area || "01"}`;
  let hadCache = false;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (Array.isArray(cached) && cached.length) { setPrices(cached); setLoading(false); hadCache = true; }
  } catch { /* noop */ }
  if (!hadCache) setLoading(true);
  const PROD_NAME = { B034: "고급휘발유", B027: "휘발유", D047: "경유", C004: "실내등유", K015: "LPG" };
  const normalize = (oil) => oil.map(o => ({
    ...o,
    PRODNM: o?.PRODNM || PROD_NAME[o?.PRODCD] || "",
    PRICE: Number(String(o?.PRICE ?? "").replace(/,/g, "")) || 0,
    // ⛽ 2026-11-27 유가 API가 가끔 전일 대비(DIFF)에 가격 자체를 넣어 준다(▲1840원) — 하루 변동으로 말이 안 되는 값(±200원 넘음)은 0으로
    DIFF: (() => { const d = Number(String(o?.DIFF ?? "0").replace(/,/g, "")) || 0; return Math.abs(d) > 200 ? 0 : d; })(),
  })).filter(o => o.PRODNM && o.PRICE > 0);
  async function fetchOnce() {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`/api/fuel?area=${area || "01"}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const oil = normalize(Array.isArray(data?.RESULT?.OIL) ? data.RESULT.OIL : []);
      if (!oil.length) throw new Error("empty OIL");
      return { oil, fallback: !!data?._fallback };
    } finally {
      clearTimeout(tid);
    }
  }
  async function loadFuel() {
    let result = null;
    try { result = await fetchOnce(); } catch {
      try { await new Promise(r => setTimeout(r, 1500)); result = await fetchOnce(); } catch (e2) { console.warn("유가 조회 실패:", e2); }
    }
    if (cancelled) return;
    if (result) {
      // 서버 하드코딩 폴백값은 캐시가 있으면 캐시(실제 최근값)를 우선한다
      if (!(result.fallback && hadCache)) setPrices(result.oil);
      if (!result.fallback) { try { localStorage.setItem(cacheKey, JSON.stringify(result.oil)); } catch { /* noop */ } }
    }
    setLoading(false);
  }
  loadFuel();
  return () => { cancelled = true; };
}, [area]);

// 🔹 유가 정리
const premium = prices.find(o => o?.PRODNM?.includes("고급"));

const gasoline = prices.find(
  o =>
    o?.PRODNM?.includes("휘발유") &&
    !o?.PRODNM?.includes("고급")
);

const diesel = prices.find(
  o => o?.PRODNM?.includes("경유")
);

// 🔹 화면에 사용할 데이터
const items = [premium, gasoline, diesel].filter(Boolean);

// 🔹 자동 슬라이드
React.useEffect(() => {
  if (!items.length) return;

  const timer = setInterval(() => {
    setPage(p => (p + 1) % items.length);
  }, 3000);

  return () => clearInterval(timer);
}, [items.length]);

// 🔹 로딩 / 에러 UI
if (loading) {
  return <div className="h-10 flex items-center px-5 text-sm text-gray-500">유가 불러오는 중...</div>;
}
if (!prices.length || !items.length) {
  return <div className="h-10 flex items-center px-5 text-sm text-gray-500">유가 정보 없음</div>;
}

// ⛽ 2026-11-27 시안 K — 오더등록 위 오른쪽 '전국 유가' 카드(경유 · 휘발유 · 고급휘발유를 한 번에 · 같은 자료)
if (card) {
  const cols = [diesel, gasoline, premium].filter(Boolean);
  const nm = (it) => (it.PRODNM.includes("고급") ? "고급휘발유" : it.PRODNM.includes("경유") ? "경유" : "휘발유");
  return (
    <div data-kp="fuel-card" className="flex items-stretch h-[52px] rounded-[14px] overflow-hidden text-white shadow-[0_10px_24px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(125deg,#0B1428,#0F1A30 45%,#1B2B4B 80%,#2D4C82)" }}>
      <div className="flex items-center gap-2 pl-3 pr-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M14 9h2a2 2 0 012 2v5a1.5 1.5 0 003 0V8l-3-3M6 8h6" /></svg>
        <div className="leading-tight"><div className="text-[9px] font-extrabold tracking-[0.2em] text-[#8FB0F0]">FUEL · TODAY</div><div className="text-[13px] font-black whitespace-nowrap">전국 유가</div></div>
        <CustomSelect value={area} onChange={(e) => setArea(e.target.value)} className="ml-1 bg-white text-[#0F1A30] text-[12px] font-black rounded-[8px] px-2.5 py-1">
          {AREA_OPTIONS.map(a => (<option key={a.code} value={a.code}>{a.name}</option>))}
        </CustomSelect>
      </div>
      {cols.map((it, i) => { const d = Number(it.DIFF || 0); const up = d > 0; return (
        <div key={i} className={`flex flex-col justify-center px-3 border-l border-white/10 ${i === 0 ? "bg-white/[0.08]" : ""}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          <div className={`text-[10.5px] font-extrabold ${i === 0 ? "text-white" : "text-[#9AA9C3]"}`}>{nm(it)} <span className={up ? "text-[#FFB4B4]" : "text-[#9EE6B8]"}>{up ? "▲" : "▼"}{Math.abs(d)}</span></div>
          <div className="text-[15px] font-black tracking-tight whitespace-nowrap">{Number(it.PRICE).toLocaleString()}<small className="text-[10px] font-bold text-[#9AA9C3] ml-0.5">원/L</small></div>
        </div>); })}
    </div>
  );
}
return (
    <div className="flex items-center gap-4 bg-[#1B2B4B] text-white px-4 py-1.5 rounded-lg shadow text-sm overflow-hidden border border-[#243a60]">

      <CustomSelect
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className="bg-white text-black text-xs rounded px-2 py-1"
      >
        {AREA_OPTIONS.map(a => (
          <option key={a.code} value={a.code}>{a.name}</option>
        ))}
      </CustomSelect>

      <div className="relative h-6 overflow-hidden flex-1">
        <div
          className="transition-transform duration-700 ease-in-out"
          style={{
            transform: `translateY(-${page * 24}px)`
          }}
        >
          {items.map((item, idx) => {
            const diff = item?.DIFF ?? 0;
            const up = diff > 0;

            return (
              <div
                key={idx}
                className="h-6 flex items-center justify-between"
              >
                <div className="font-semibold w-24">
                  {
  item.PRODNM.includes("고급")
    ? "고급휘발유"
    : item.PRODNM.includes("경유")
    ? "경유"
    : "휘발유"
}
                </div>

                <div className="font-bold">
                  {Number(item.PRICE).toLocaleString()} 원/L
                </div>

                <div className={`font-bold ${up ? "text-rose-200" : "text-green-200"}`}>
                  {up ? "▲" : "▼"} {Math.abs(diff)}원
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ⭐ 다중등록 팝업 전용 자동완성 콤보박스 — 팝업 자체가 스크롤 컨테이너
// (overflow-y-auto) 안에 있어서, 드롭다운을 그냥 absolute로 띄우면 팝업
// 하단에서 잘려버린다(overflow 조상은 z-index와 무관하게 넘치는 자손을
// 그대로 잘라낸다). createPortal로 document.body에 직접 띄우고 입력창의
// 화면 좌표(getBoundingClientRect)를 따라 위치를 계산해 어떤 조상의
// overflow에도 잘리지 않게 한다. 방향키 이동/Enter 선택/Escape 닫기까지
// 표준 콤보박스 키보드 조작을 지원한다.
function MultiRegCombo({ id, value, onChange, onSelect, items, placeholder, className, renderItem }) {
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const wrapRef = React.useRef(null);
  const listRef = React.useRef(null);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });

  React.useEffect(() => { setActiveIdx(0); }, [items]);

  // ⭐ 방향키로 activeIdx가 바뀔 때, 목록이 스크롤 컨테이너 안에 있으니
  // 하이라이트된 항목이 화면 밖으로 밀려나면(위/아래 어느 쪽이든) 그 항목이
  // 보이도록 스크롤도 같이 따라가게 한다 — 하이라이트만 바뀌고 스크롤은 그대로면
  // 목록 아래쪽/위쪽 항목을 고를 때 커서가 어디 있는지 보이지 않는 문제가 있었다.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIdx];
    if (!item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
    else if (itemTop < viewTop) list.scrollTop = itemTop;
  }, [activeIdx]);

  React.useEffect(() => {
    if (!open) return;
    const updateCoords = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open]);

  const showList = open && items.length > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <input autoComplete="off"
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            if (!open) { setOpen(true); return; }
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            if (!open) return;
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && items[activeIdx]) {
              e.preventDefault();
              onSelect(items[activeIdx]);
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            if (open) { e.preventDefault(); setOpen(false); }
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {showList && createPortal(
        <div
          ref={listRef}
          className="fixed z-[999999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-auto"
          style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: 240 }}
        >
          {items.map((it, i) => (
            <div key={it.key ?? i}
              className={`px-3 py-2 text-[13px] cursor-pointer ${i === activeIdx ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); onSelect(it); setOpen(false); }}
            >
              {renderItem ? renderItem(it, i === activeIdx) : it.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ⭐ 2026-11-03 배차관리 입력 카드 — 버튼·토글 안의 선 아이콘(이모지·기호 대신)
const DM_ICON_PATHS = {
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>,
  fare: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path d="M8.5 9.5 10 13l1-2.5 1 2.5 1.5-3.5" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></>,
  repeat: <><path d="m17 2 3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="m7 22-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>,
  lookup: <><circle cx="10" cy="8" r="4" /><path d="M2.5 20a7.5 7.5 0 0 1 11-6.6" /><circle cx="17.5" cy="17.5" r="3" /><path d="m22 22-2.3-2.3" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></>,
  pin: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
};
function DmIcon({ name, size = 15, className = "" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">{DM_ICON_PATHS[name]}</svg>;
}
// 버튼 모양(같은 높이 · 아이콘+글자 · 주/보조) — 포커스 링은 남색 2px + 은은한 빛
const DM_FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2B4B] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(143,176,240,0.22)]";
const DM_BTN = `inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-[13px] font-extrabold whitespace-nowrap select-none transition active:scale-[0.98] ${DM_FOCUS}`;
const DM_BTN_PRIMARY = `${DM_BTN} bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,0.20)] hover:bg-[#1B2B4B]`;
const DM_BTN_SECONDARY = `${DM_BTN} bg-white text-[#1B2B4B] border border-[#DCE3EE] hover:border-[#2D4C82] hover:bg-[#F5F8FD]`;
// 켜고 끄는 칩(독차·혼적·왕복·긴급·블라인드·고정) — 켜지면 남색, 왼쪽 작은 점으로 상태 표시
const dmToggleCls = (on) => `${DM_BTN} !px-3 border ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-[0_4px_12px_rgba(27,43,75,0.22)]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#2D4C82] hover:text-[#0F1A30]"}`;
function DmDot({ on, alert = false }) {
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition ${on ? (alert ? "bg-[#FF6B6B]" : "bg-[#8FB0F0]") : "bg-[#C9D3E3]"}`} />;
}

 export default function DispatchManagement({
    dispatchData, liveDataReady = true, recentDispatchData = [], recentLiveDataReady = true, drivers, clients, menu, timeOptions, tonOptions,
    addDispatch, upsertDriver, upsertClient, upsertPlace,
    patchDispatch, removeDispatch,
    placeRows = [],
    role = "admin",
    isTest = false,
    isViewer = false,
    showAlert = (msg) => showAlert(msg),  // ★ 추가 (폴백 포함)
    userCompany = "",
    userNameMap = new Map(),
    setCargoAddPopup = () => {},
    approveEditRequest = () => {},
    rejectEditRequest = () => {},
    markEditRequestSeen = () => {},
    approvedShippers = [],
  }) {
  const [dmLookupOpen, setDmLookupOpen] = React.useState(false); // ⭐ 2026-11-03 담당자·차량 조회(배차관리 버튼)
  // 🧩 2026-11-26 오더등록 입력칸 고르기 — 회사 기본 · 내 설정(src/orderFormFields.js)
  const ofs = useOrderFormFields(getTenant() || userCompany);
  const ofShow = ofs.show;
  const [ofOpen, setOfOpen] = React.useState(false);
  // 🎨 2026-11-26 오더등록 디자인 시안 — 최고관리자만 [디자인 변경]으로 돌려 본다(입력칸 · 버튼 · 기능은 그대로, 모양만 · src/orderSkins.js)
  // 🎨 2026-11-27 모든 계정 = A 루트 보드 · 최고관리자만 [디자인 변경]으로 예전 기본 입력창과 오간다(이 기기에 기억)
  // 🧪 개발 화면(import.meta.env.DEV)에서만 localStorage kpSkinTest=1 이면 다른 계정으로도 전환 점검 — 배포 빌드에는 들어가지 않는다
  const skinAllowed = SKIN_SWITCH && (role === "totalMaster" || (import.meta.env.DEV && (() => { try { return localStorage.getItem("kpSkinTest") === "1"; } catch { return false; } })()));
  const [ofSkin, setOfSkin] = React.useState(() => readSkin(true));
  // 🎨 2026-11-27 카드형(deck) 입력창은 쓰지 않음(사용자 결정)
  //  🗓 2026-11-27 사용자 결정: 위 입력창은 원래대로 — 카드형(deck)은 끔
  const skinOn = skinAllowed ? ofSkin : readSkin(false);
  const cycleSkin = () => setOfSkin((v) => { const n = nextSkin(v); saveSkin(n); return n; });
  const layOn = LAYOUT_SKINS.has(skinOn);
  const kOn = skinOn === "k"; // 🎨 2026-11-27 시안 K(사용자 확정)
  const [kDatesEl, setKDatesEl] = React.useState(null); // 날짜 줄을 K 격자 안으로(포털)
  const [kOptEl, setKOptEl] = React.useState(null); // 운행 옵션 묶음을 K 카드 안으로(포털)
  // 🔍 2026-11-27 사용자 요청 — 브라우저를 확대 · 축소해도 오더등록 전체 구도가 그대로(글씨 · 칸 · 달력이 같이 커지고 작아짐)
  //  설계 폭(K_W)으로 그린 뒤 화면 폭에 맞춰 통째로 배율(zoom) — 글씨는 다시 그려져 흐려지지 않는다
  const K_W = 1280; // 🗺 2026-11-28 지도를 크게 — 입력창 설계 폭을 줄여(글씨 크기는 그대로) 남는 폭을 지도에
  const kFitRef = React.useRef(null);
  const [kScale, setKScale] = React.useState(1);
  const [kW, setKW] = React.useState(K_W);
  const [kPanelH, setKPanelH] = React.useState(720); // 오른쪽 지도 높이 = 화면에 남은 높이 // 높이 때문에 작게 그릴 땐 남는 폭을 채우게 설계 폭을 조금 넓힌다(최대 1.3배)
  React.useEffect(() => {
    if (!kOn) return undefined;
    const el = kFitRef.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const inner = el.firstElementChild;
    // 폭에 맞춘 배율과, 화면 높이에 오더등록 전체가 들어오는 배율 중 작은 쪽 — 단, 글씨가 너무 작아지지 않게 0.9 아래로는 줄이지 않는다
    const fit = () => {
      // 🗺 2026-11-28 사용자 요청 — 입력창은 왼쪽 메뉴에 딱 붙이고(가운데 정렬 X) 남는 폭은 전부 지도에
      const row = el.closest(".of-skin-k"); const total = row ? row.clientWidth : el.clientWidth; if (!(total > 0)) return;
      const cur = parseFloat(getComputedStyle(inner).zoom) || 1;
      const designH = inner.getBoundingClientRect().height / cur;
      const scroller = el.closest("main");
      const top = el.getBoundingClientRect().top + (scroller ? scroller.scrollTop : window.scrollY);
      const availH = window.innerHeight - top - 14;
      const byW = (total - 560 - 16) / K_W; // 지도는 최소 560px
      const byH = designH > 0 && availH > 200 ? availH / designH : byW;
      const next = Math.max(0.6, Math.min(1.6, Math.round(Math.min(byW, Math.max(0.8, byH)) * 1000) / 1000));
      setKScale((v) => (Math.abs(v - next) > 0.005 ? next : v));
      setKW(K_W);
      const ph = Math.max(560, Math.round(availH));
      setKPanelH((v) => (Math.abs(v - ph) > 4 ? ph : v));
    };
    fit(); const t = setTimeout(fit, 400);
    const ro = new ResizeObserver(fit); ro.observe(el);
    const rowEl = el.closest(".of-skin-k"); if (rowEl) ro.observe(rowEl); // 왼쪽 메뉴 접기 등으로 전체 폭이 바뀌어도
    window.addEventListener("resize", fit);
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [kOn]);
  const ofHiddenKey = [...ofs.hidden].sort().join("|");
  const ofGrid = React.useMemo(() => routeGrid(ofHiddenKey ? ofHiddenKey.split("|") : [], skinOn === "deck" || skinOn === "k" ? skinOn : "route"), [ofHiddenKey, skinOn]); // 숨긴 칸 자리는 옆 칸이 채운다
  const dmLookupNameOf = React.useCallback((r) => _orderStaffNameRaw(r, userNameMap), [userNameMap]);

      // ⭐ 회사별 커스텀 드롭다운 옵션(Part B) — 등록폼 전역에서 재사용하므로 최상위에서
      // 한 번만 구독한다. 커스터마이즈 안 한 회사는 기존 하드코딩 값 그대로 보인다.
      // ⭐ 2026-11-02 운임규칙 — 회사가 "운임 규칙 사용"을 켠 경우에만 운임구분 칸을 보인다
      const fareR = useFareRules(getTenant() || userCompany);
      const dmBiz = useCompanyBiz(getTenant() || userCompany); // ⭐ 2026-11-03 여러 사업자 — 오더 청구 사업자
      const fareOn = fareR.on;
      const cargoTypeOptionsCustom = useCompanyDropdownOptions("화물타입", role, userCompany);
      const tonTypeOptionsCustom = useCompanyDropdownOptions("톤수타입", role, userCompany);
      const [useNewForm, setUseNewForm] = React.useState(false);
      const [bottomStatusKey, setBottomStatusKey] = React.useState(0);
      // 🧭 2026-11-27 오른쪽 오늘 일정 · 새 달력 — 모든 사용자
      // ⌨️ 2026-11-27 사용자 요청 — 오더등록에서 Tab 은 입력칸 · 드롭다운만 순서대로(버튼은 건너뜀). Shift+Tab 은 거꾸로
      React.useEffect(() => {
        const SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]), select, textarea, button[aria-haspopup], [data-tab-field]';
        const onKey = (e) => {
          if (e.key !== "Tab" || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
          const root = e.target?.closest?.("[data-kp-order-form]");
          if (!root) return;
          // 순서: 날짜 줄(상차일 · 시간 · 하차일 · 시간) → 입력칸(청구 사업자 … 전달사항). 빠른 등록 · 도구 버튼 줄은 빼고
          const ok = (el) => !el.disabled && el.tabIndex !== -1 && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
          const zone = (sel) => [...root.querySelectorAll(sel)].filter((el) => el.matches(SEL) && ok(el));
          // 🎨 시안 K — 화면 순서대로(청구 사업자 · 거래처 → 상차 · 하차 일시 → 상차지 … → 메모)
          const K_TAB = ["cli", "pdate", "ptime", "ddate", "dtime", "pn", "pa", "pm", "pc", "dn", "da", "dm", "dc", "cargo", "vk", "ton", "lm", "um", "pay", "way", "closeym", "ss", "plate", "dname", "dphone", "fsale", "fdrv", "ffee", "memo"];
          const list = root.closest(".of-lay-k")
            ? K_TAB.flatMap((t) => zone(`[data-of="${t}"] *`))
            : [...zone(".kp-date-row *"), ...zone('[data-of]:not([data-of="head"]) *')];
          if (!list.length) return;
          const cur = e.target;
          let i = list.indexOf(cur);
          let next;
          if (i >= 0) next = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
          else {
            // 버튼 등 목록에 없는 곳에 있으면 — 화면 순서상 바로 다음(또는 앞) 입력칸으로
            const after = list.filter((el) => cur.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
            const before = list.filter((el) => cur.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
            next = e.shiftKey ? (before[before.length - 1] || list[list.length - 1]) : (after[0] || list[0]);
          }
          if (!next) return;
          e.preventDefault();
          next.focus();
          if (typeof next.select === "function" && next.tagName === "INPUT" && /^(text|search|tel|number|)$/.test(next.type || "")) { try { next.select(); } catch { /* 무시 */ } }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, []);
      const assistAllowed = true; // 🧭 2026-11-27 사용자 결정 — 오른쪽 오늘 일정 · 새 달력을 모든 사용자에게
      // ⏱ 상/하차 시간 + 이전/이후 표시용
function renderTimeWithCond(time, cond) {
  if (!time) return "-";
  if (cond === "BEFORE") return `${time} 이전`;
  if (cond === "AFTER")  return `${time} 이후`;
  return time; // 조건 없으면 그냥 시간
}
    function getAiRecommendedFare({ historyList, form }) {
  if (!historyList || historyList.length === 0) {
    return { fare: null, reason: "NO_HISTORY" };
  }

  const curPallet = getTotalPalletFromOrder(form);
  const curTon = getTotalTonFromOrder(form);
  const curCarType = form.차량종류 || "";
  const isCold = /냉장|냉동/.test(curCarType);

  // 🔹 1. 거의 동일 + 최신
  const exact = historyList
    .filter(r => {
      const p = getTotalPalletFromOrder(r);
      const t = getTotalTonFromOrder(r);
      const sameCold = /냉장|냉동/.test(r.차량종류 || "") === isCold;

      return (
        sameCold &&
        p != null &&
        curPallet != null &&
        p === curPallet &&
        t != null &&
        curTon != null &&
        Math.abs(t - curTon) <= 0.5
      );
    })
    .sort((a, b) => new Date(b.상차일) - new Date(a.상차일));

  if (exact.length > 0) {
    const fare = Math.round(Number(exact[0].청구운임) / 10000) * 10000;
    return { fare, reason: "EXACT" };
  }

  // 🔹 2. 전체 유사도
  const scored = historyList.map(r => {
    let score = 0;

    const p = getTotalPalletFromOrder(r);
    const t = getTotalTonFromOrder(r);
    const sameCold = /냉장|냉동/.test(r.차량종류 || "") === isCold;

    if (sameCold) score += 50;
    if (p != null && curPallet != null) {
      const d = Math.abs(p - curPallet);
      if (d === 0) score += 40;
      else if (d === 1) score += 20;
    }
    if (t != null && curTon != null) {
      const d = Math.abs(t - curTon);
      if (d === 0) score += 30;
      else if (d <= 0.5) score += 15;
    }

    return { r, score };
  });

  const best = scored
    .filter(s => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.r.상차일) - new Date(a.r.상차일);
    })[0];

  if (!best) return { fare: null, reason: "NO_MATCH" };

  const fare = Math.round(Number(best.r.청구운임) / 10000) * 10000;
  return { fare, reason: "GLOBAL_SIMILAR" };
}

    const [placeRowsTrigger, setPlaceRowsTrigger] = React.useState(0);
const [placeConflictQueue, setPlaceConflictQueue] = React.useState([]);
const [placeConflictOpen, setPlaceConflictOpen] = React.useState(false);
      const [aiRecommend, setAiRecommend] = React.useState(null);
      const [recurringOpen, setRecurringOpen] = React.useState(false); // ★ 정기오더 창
      const [areaFareHint, setAreaFareHint] = React.useState(null);
      const [distanceFareEstimate, setDistanceFareEstimate] = React.useState(null);
      const [showFareRouteMap, setShowFareRouteMap] = React.useState(false); // ★ 운임추천 바 "경로보기"
      const [fareHistoryOpen, setFareHistoryOpen] = React.useState(false);
      const [guideHistoryList, setGuideHistoryList] = React.useState([]);
      const [vehicleSpecOpen, setVehicleSpecOpen] = React.useState(false);
      const [vehicleSpecTab, setVehicleSpecTab] = React.useState("vehicle"); // "vehicle" | "pallet"
      // 차량제원표 관리자 수정(더블클릭) — 카고/윙바디 표를 회사별로 독립적으로 override.
      const [specOverrides, setSpecOverrides] = React.useState({ cargo: {}, wing: {} });
      const [vehicleSpecEdit, setVehicleSpecEdit] = React.useState(null); // { table: "cargo"|"wing", index }
      // ⭐ 차량·파렛 제원표 이미지저장용 캡처 대상 ref — 훅은 조건부 렌더 블록
      // ({vehicleSpecOpen && (...)}) 안이 아니라 항상 호출되는 이 위치에 둬야 한다
      // (안 그러면 팝업 열고 닫을 때마다 훅 호출 개수가 달라져 React error #310 발생).
      const specCaptureRef = React.useRef(null);
      React.useEffect(() => {
        if (!vehicleSpecOpen || !userCompany) return;
        let alive = true;
        getDoc(doc(db, "companySettings", userCompany.trim())).then(snap => {
          if (!alive) return;
          const data = snap.data()?.차량제원표수정 || {};
          setSpecOverrides({ cargo: data.cargo || {}, wing: data.wing || {} });
        }).catch(() => {});
        return () => { alive = false; };
      }, [vehicleSpecOpen, userCompany]);
      const saveVehicleSpecEdit = async (values) => {
        if (!vehicleSpecEdit) return;
        if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
        const { table, index } = vehicleSpecEdit;
        const nextOverrides = { ...specOverrides, [table]: { ...specOverrides[table], [index]: values } };
        setSpecOverrides(nextOverrides);
        setVehicleSpecEdit(null);
        try {
          await setDoc(doc(db, "companySettings", userCompany.trim()), { 차량제원표수정: nextOverrides }, { merge: true });
        } catch (e) {
          sflowToast("저장 실패: " + e.message, "cancel");
        }
      };
      const resetVehicleSpecEdit = async () => {
        if (!vehicleSpecEdit) return;
        if (!(await kpConfirm("수정하시겠습니까?\n이 칸을 기본 제원값으로 되돌려요.", { okText: "저장" }))) return;
        const { table, index } = vehicleSpecEdit;
        const nextTable = { ...specOverrides[table] };
        delete nextTable[index];
        const nextOverrides = { ...specOverrides, [table]: nextTable };
        setSpecOverrides(nextOverrides);
        setVehicleSpecEdit(null);
        try {
          await setDoc(doc(db, "companySettings", userCompany.trim()), { 차량제원표수정: nextOverrides }, { merge: true });
        } catch (e) {
          sflowToast("저장 실패: " + e.message, "cancel");
        }
      };
const [confirmOpen, setConfirmOpen] = React.useState(false);
const [stopPopupOpen, setStopPopupOpen] = React.useState(false);
const [stopType, setStopType] = React.useState("");
const [stopDeleteIdx, setStopDeleteIdx] = React.useState(null);
const [activeStopIdx, setActiveStopIdx] = React.useState(null);
const [stopContactPickerIdx, setStopContactPickerIdx] = React.useState(null);
const [stopContactPickerOpts, setStopContactPickerOpts] = React.useState([]);
const [stopList, setStopList] = React.useState([
  { 업체명:"", 주소:"", 담당자:"담당자", 담당자번호:"", 메모:"", 화물내용:"", 화물타입:"", 톤수값:"", 톤수타입:"", 차량톤수:"", 상차일:"", 상차시간:"", 하차일:"", 하차시간:"", 방법:"" }
]);
const [stopForm, setStopForm] = React.useState({
  업체명:"",
  주소:"",
  담당자:"",
  담당자번호:"",
  메모:""
});
 const [routeInfo, setRouteInfo] = React.useState(null);
 const [fareStats, setFareStats] = React.useState(null);
 useEffect(() => {
  let cancelled = false;

  async function loadRoute() {
    if (!stopForm?.상차지주소 || !stopForm?.하차지주소) {
      setRouteInfo(null);
      return;
    }
// 🛠 2026-11-17 예상운임 계산 useEffect가 이 함수 안(Hook 규칙 위반)에 들어 있어 지웠다 — 실행되지 않던 코드
    const res = await fetch("/api/route", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromAddr: stopForm.상차지주소,
        toAddr: stopForm.하차지주소,
        viaPoints: [
          ...(form.경유상차목록 || []).filter(s => s.주소?.trim()).map(s => s.주소),
          ...(form.경유하차목록 || []).filter(s => s.주소?.trim()).map(s => s.주소),
        ],
      }),
    });

const data = await res.json();

// 🔥 추가 (핵심)
if (!data || !data.path || data.path.length === 0) {
  console.warn("✕ 경로 없음:", data?.error);
  setRouteInfo(null);
  return;
}

if (!cancelled) setRouteInfo(data);
  }

  loadRoute();

  return () => {
    cancelled = true;
  };
}, [stopForm?.상차지주소, stopForm?.하차지주소]);
// ===== 복사패널 자동완성 =====
const [clientOptions, setClientOptions] = React.useState([]);
const [clientIndex, setClientIndex] = React.useState(0);
const [showClientDropdown, setShowClientDropdown] = React.useState(false);

const filterClients = (keyword) => {
  if (!keyword) return [];
  return clients
    .filter(c =>
      c.거래처명?.toLowerCase().includes(keyword.toLowerCase())
    )
    .sort((a, b) => a.거래처명.length - b.거래처명.length)
    .slice(0, 5);
};

      // ================================
  // 🔑 업체명 Key 정규화 함수(추가!)
  // ================================
  function normalizeKey(str = "") {
    return String(str)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9가-힣]/g, "")
.replace(/쉬/g, "시")
.replace(/씨제이/g, "cj")
.replace(/제이/g, "j")
.replace(/프레쉬/g, "프레시")
.replace(/물류/g, "")
.replace(/유통/g, "")
  }
  // ================================
// 📍 주소 → 검색 키워드 세트 생성 (곤지암 / 강서구 대응)
// ================================
function extractAreaTokens(addr = "") {
  const s = String(addr).trim();
  if (!s) return [];

  // 공백, 특수문자 제거
  const clean = s.replace(/[^\w가-힣]/g, "");

  const tokens = new Set();

  // 1️⃣ 시/도
  const sido = clean.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/
  )?.[1];
  if (sido) tokens.add(sido);

  // 2️⃣ 시/군/구
  const sigungu = clean.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/)?.[1];
  if (sigungu) tokens.add(sigungu);
  // ⭐️ [추가] "강남" → "강남구" 보정
if (!sigungu && clean.length >= 2) {
  tokens.add(clean);        // 강남
  tokens.add(clean + "구"); // 강남구
}

  // 3️⃣ 읍/면/동 (곤지암, 장지동 같은 케이스)
  const eupmyeondong = clean.match(/([가-힣]+읍|[가-힣]+면|[가-힣]+동|[가-힣]{2,})/g);
  if (eupmyeondong) {
    eupmyeondong.forEach(t => {
      if (t.length >= 2) tokens.add(t);
    });
  }
   return Array.from(tokens);
}
// ================================
// 🔍 두 주소가 같은 지역인지 판단
// ================================
function isAreaMatch(inputAddr, rowAddr) {
  const rowText = String(rowAddr || "").replace(/\s+/g, "");
  const clean = String(inputAddr || "").replace(/[^\w가-힣]/g, "");

  // 시/군/구 단위가 있으면 반드시 그 단위로 매칭해야 한다 — 예전에는 "인천"(시/도)
  // 토큰까지 후보에 포함시켜 놓고 .some()으로 아무 토큰이나 하나만 맞아도 통과시켰기
  // 때문에, "인천 서구" 입력이 "인천 남동구", "인천 연수구" 등 서구가 아닌 인천
  // 전역의 이력과도 매칭되어 통계/이력이 실제 노선과 무관하게 부풀려지는 문제가 있었다.
  const sigungu = clean.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/)?.[1];
  if (sigungu) return rowText.includes(sigungu);

  const sido = clean.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/
  )?.[1];
  if (sido) return rowText.includes(sido);

  // 시/도, 시/군/구를 못 찾은 특이한 입력(예: 동 이름만 입력)은 예전처럼 토큰 전체로 폴백
  const inputTokens = extractAreaTokens(inputAddr);
  return inputTokens.some(t => rowText.includes(t));
}
 // ================================
// 📍 주소 → 조회용 행정구 단위로 축소
// 예: "인천 서구 북항로 28-29" → "인천 서구"
// ================================
function normalizeAreaForSearch(addr = "") {
  const s = String(addr).trim();
  if (!s) return "";

  const sido =
    s.match(
      /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/
    )?.[1] || "";

  const sigungu =
    s.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/)?.[1] || "";

  // ⭐ 핵심: 행정구 추출 실패 시 → 원문 그대로
  if (!sido && !sigungu) {
    return s;
  }

  return `${sido} ${sigungu}`.trim();
}

// ================================
// 🚚 차량종류 그룹화 (최종)
// ================================
function normalizeVehicleGroup(type = "") {
  const t = String(type).replace(/\s+/g, "");

  // 오토바이 (완전 분리)
  if (t.includes("오토바이") || t.includes("바이크")) {
    return "MOTOR";
  }

  // 냉장 / 냉동 계열 (톤수·형태 무시)
  if (t.includes("냉장") || t.includes("냉동")) {
    return "COLD";
  }

  // 일반 화물차 — 라보/다마스 포함하여 모두 일반차량으로 통합
  if (
    t.includes("라보") || t.includes("다마스") ||
    t.includes("카고") || t.includes("윙") ||
    t.includes("윙바디") || t.includes("탑") ||
    t.includes("탑차") || t.includes("리프트")
  ) {
    return "GENERAL";
  }

  return "ETC";
}

// ================================
// 🚛 차량톤수 숫자 추출 (전역 공용)
// ================================

// ================================
// 🔍 날짜 문자열 판별 (오더복사용)
// ================================
const isDateLike = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ================================
// 🔥 화물타입 자동 감지 (오더복사용)
// ================================
function detectCargoType(cargo = "") {
  const s = String(cargo).trim();
  if (!s) return "";

  // "숫자 + 단위" 패턴만 매칭 (예: 3파레트, 5박스, 2통)
  // "박스짐", "변압기" 등 일반 단어는 매칭하지 않음
  if (/\d+\s*(파레트|파렛트|파렛|파레|팔레트|파|p|P|PLT|plt)/i.test(s)) return "파레트";
  if (/\d+\s*박스/.test(s)) return "박스";
  if (/\d+\s*통/.test(s)) return "통";

  return "";  // 인식 못 하면 빈 문자열 (드롭다운 "없음")
}

// ================================
// 🔥 화물내용에서 단위 suffix 제거 (순수 숫자/텍스트만 반환)
// ================================
function extractCargoBase(cargo = "") {
  const s = String(cargo).split("+")[0].trim();  // only the base, not extras
  if (!s) return "";

  // 알려진 suffix를 뒤에서부터 제거 (긴 것 먼저)
  const SUFFIXES = ["파렛트", "파레트", "팔레트", "파렛", "파레", "박스", "통", "파", "PLT", "plt", "p", "P"];
  for (const suffix of SUFFIXES) {
    if (s.endsWith(suffix)) {
      const base = s.slice(0, -suffix.length).trim();
      return base || s;  // 제거 후 빈 문자열이면 원본 반환
    }
  }

  return s;  // suffix 없으면 원본 그대로
}

// ===============================
// 📤 즉시공유 텍스트 생성
// ===============================
function makeInstantShareText(form) {

  // 날짜: 1월 15일 목요일
  const d = form.상차일 ? new Date(form.상차일) : null;
  const dateStr = d
    ? `${d.getMonth() + 1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일`
    : "";

  // 시간 기본값 처리
  const pickupTime = form.상차시간?.trim() || "즉시";
  const dropTime   = form.하차시간?.trim() || "즉시";

  // 중량 / 파렛트
  const weight = form.차량톤수 || "3,000kg";
  const pallet = form.화물내용 || "";

  return `${dateStr}

상차지 :
${form.상차지명 || "-"}
주소 : ${form.상차지주소 || "-"}
${form.상차지담당자 || ""}${form.상차지담당자번호 ? ` (${form.상차지담당자번호})` : ""}

상차시간 : ${pickupTime}
하차시간 : ${dropTime}

하차지 : ${form.하차지명 || "-"}
${form.하차지주소 || "-"}
담당자 : ${form.하차지담당자 || "-"}
${form.하차지담당자번호 || "-"}

중량 : ${weight}${pallet ? ` / ${pallet}` : ""}
${form.차량종류 || ""}
// 🔽 기사 전달사항 (있을 때만 출력)
${form.전달사항?.trim()
  ? `\n\n◆ 기사 전달사항\n${form.전달사항.trim()}`
  : ""
}

${form.차량번호 || "-"} ${form.이름 || "-"} ${form.전화번호 || "-"}
${Number(form.청구운임 || 0).toLocaleString()}원 부가세별도 배차되었습니다.`.trim();
}

const placeList = React.useMemo(() => {
  const fromFirestore = Array.isArray(placeRows) ? placeRows : [];

const toRow = (p = {}) => {
const primary =
  Array.isArray(p.contacts) && p.contacts.length
    ? p.contacts.find(c => c.isPrimary === true) || p.contacts[0]
    : null;

// 구형 포맷(담당자 직접 필드) 호환
  const legacyContact = (p.담당자?.trim() || String(p.담당자번호 || "").trim())
    ? [{ name: (p.담당자 || "").trim(), phone: p.담당자번호 || "", isPrimary: true }]
    : [];

  // 이름·번호가 모두 빈 자리표시 연락처는 버린다
  const validContacts = (Array.isArray(p.contacts) ? p.contacts : []).filter(c => c && (String(c.name || "").trim() || String(c.phone || "").trim()));
  const resolvedContacts = validContacts.length ? validContacts : legacyContact;

  const resolvedPrimary =
    resolvedContacts.find(c => c.isPrimary) || resolvedContacts[0] || null;

  return {
    _id: p._id,
    업체명: p.업체명 || "",
    주소: p.주소 || "",
    담당자: resolvedPrimary?.name || p.담당자 || "",
    담당자번호: resolvedPrimary?.phone || p.담당자번호 || "",
    등급: p.등급 || "일반",
    등급변경일: p.등급변경일 || null,
    메모: p.메모 || "",
    contacts: resolvedContacts,
  };

};

  const map = new Map();

  // ✅ Firestore 데이터만 사용
  fromFirestore.forEach(raw => {
    const row = toRow(raw);
    // ⭐ 2026-11-03 업체명+주소로 — 이름만으로 잡으면 같은 이름·다른 주소(예: (도외)위탁 55곳)가 1곳만 남아 자동완성에 1~2개만 떴다
    const nk = normalizeKey(row.업체명);
    const key = nk ? `${nk}|${String(row.주소 || "").toLowerCase().replace(/\s+/g, "")}` : "";
    if (key) map.set(key, row);
  });

  return Array.from(map.values());
}, [placeRows]);


    // 관리자 여부 체크
const isAdmin = role === "admin" || role === "totalMaster" || isViewer;
// ⭐ 2026-11-01 운임(청구·기사·수수료)은 배차 실무자(실무자·직접 만든 역할)도 입력 — 경리·인사 화면만 제외
const canMoney = isAdmin || !["test", "hrManager", "hrAcct", "acctStaff", "hrStaff", "driver", "shipper", "cafeUser"].includes(role);
const _viewerBlockDM = () => showAlert("조회전용 권한으로는 수정/등록/삭제를 할 수 없습니다.");
const addDispatchSafe = isViewer ? _viewerBlockDM : addDispatch;
const patchDispatchSafe = isViewer ? _viewerBlockDM : patchDispatch;
const removeDispatchSafe = isViewer ? _viewerBlockDM : removeDispatch;

// 기존 필터 상태 (유지)
const [filterType, setFilterType] = React.useState(null);

const [filterValue, setFilterValue] = React.useState("");
 

// ⭐ 신규 기사등록 모달 상태
const [driverModal, setDriverModal] = React.useState({
  open: false,
  carNo: "",
  name: "",
  phone: "",
});

// ⭐ 실시간배차현황(하단 테이블) 상태 변경 확인 팝업
const [confirmChange, setConfirmChange] = React.useState(null);
/*
{
  rowId,
  key,
  before,
  after
}
*/

// ================================
// 🔥 거래처/하차지 중복 확인 팝업 상태
// ================================
const [dupPopup, setDupPopup] = React.useState({
  open: false,
  input: null,      // { name, addr, manager, phone }
  candidates: [],   // normalizeKey 기준 유사 업체 목록
});

// ⭐ 신규 기사 등록시: 기본 커서 위치(기사명)
const nameInputRef = React.useRef(null);

React.useEffect(() => {
  if (!driverModal.open) return;
  const timer = setTimeout(() => {
    try {
      nameInputRef.current?.focus();
    } catch {}
  }, 30);
  return () => clearTimeout(timer);
}, [driverModal.open]);

// ⭐ Top3 팝업 상태
const [popupType, setPopupType] = React.useState(null);

const [statusPopup, setStatusPopup] = React.useState(null);
// ⭐ 전화번호 포맷은 파일 상단 공용 formatPhone(단계적 하이픈) 사용

// ========================================================
// 🔷 Today Dashboard 데이터 계산 (UI 대시보드에서 사용)
// ========================================================

// 📌 오늘 날짜 (KST)
 function todayKST() {
   const d = new Date();
   d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
   return d.toISOString().slice(0, 10);
 }
const today = todayKST();

// 📌 당일 상차 데이터만 필터링 + 📊 KPI 계산 (모두 당일 ONLY)
// ⚠️ 예전엔 이 블록의 filter() 8개가 전부 useMemo 없이 컴포넌트 본문에 그대로
// 있었다 — 이 DispatchManagement는 배차등록 폼(form)과 같은 컴포넌트라 글자 하나
// 입력할 때마다 전체 렌더가 다시 도는데, 그때마다 회사 전체 누적 오더(수천~수만 건)를
// 8번씩 훑고 있어서 타이핑이 버벅였다. dispatchData가 실제로 바뀔 때만 한 번,
// 단일 순회로 전부 계산하도록 useMemo로 묶는다.
const {
  todayRows, total, done, doing, pending, delayed,
  driverCount, newClients, newPlaces,
} = React.useMemo(() => {
  const rows = (dispatchData || []).filter(
    r => String(r.상차일 || "").slice(0, 10) === today
  );
  let done = 0, doing = 0, pending = 0, delayed = 0, newClients = 0, newPlaces = 0;
  const driverSet = new Set();
  for (const r of rows) {
    if (r.배차상태 === "배차완료") done++;
    else if (r.배차상태 === "배차중") doing++;
    else if (r.배차상태 === "지연") delayed++;
    if (!r.차량번호?.trim()) pending++;
    if (r.거래처명?.trim()) newClients++;
    if (r.하차지명?.trim()) newPlaces++;
    const nm = r.이름?.trim();
    if (nm) driverSet.add(nm);
  }
  return {
    todayRows: rows, total: rows.length, done, doing, pending, delayed,
    driverCount: driverSet.size, newClients, newPlaces,
  };
}, [dispatchData, today]);

// 🔹 시간대별 요청건수 트렌드 데이터 생성
const trendData = React.useMemo(() => {
  const hourly = {};
  todayRows.forEach(r => {
    const t = (r.상차시간 || "").match(/(\d+)/);
    const hour = t ? Number(t[1]) : null;
    if (hour != null && hour >= 0 && hour <= 23) {
      hourly[hour] = (hourly[hour] || 0) + 1;
    }
  });

  const list = [];
  for (let i = 0; i < 24; i++) {
    list.push({ hour: `${i}시`, count: hourly[i] || 0 });
  }
  return list;
}, [todayRows]);


// 진행률
const rate = total > 0 ? Math.round((done / total) * 100) : 0;

// "상태 3개" 카드(배차중/미배차/긴급)에서 쓰는 리스트 — 클릭 시 팝업에 보여줄 실제
// 행 목록이라 개수(doing/pending)와 별개로 필요하다. 예전엔 이 중 "긴급" 리스트가
// 같은 렌더 안에서 동일 조건으로 3번(개수/펄스여부/리스트) 따로 필터링됐다.
const { doingList, pendingList, urgentList } = React.useMemo(() => ({
  doingList: todayRows.filter(r => r.배차상태 === "배차중"),
  pendingList: todayRows.filter(r => !r.차량번호?.trim()),
  urgentList: todayRows.filter(r => r.긴급 && r.배차상태 !== "배차완료"),
}), [todayRows]);

// 🚚 유통 데이터
const stripUndefined = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
// 매출/기사비용/마진율
// 🛠 2026-11-25 수수료 = 줄 수수료 합(청구 − 기사 − 지게차·특수운임 회사 지급분) — 예전엔 청구 − 기사라 배차현황 칩보다 지게차비만큼 컸다
const todayFareT = profitTotals(todayRows);
const todayRevenue = todayFareT.sale;
const todayDriverCost = todayFareT.drv;
const todayFee = todayFareT.fee;
const todayMarginRate = todayRevenue
  ? (todayFee / todayRevenue) * 100
  : 0;
// 🔹 Top 거래처/하차지 통계
const topClients = Object.entries(
  todayRows.reduce((map, r) => {
    const k = r.거래처명 || "기타";
    map[k] = (map[k] || 0) + 1;
    return map;
  }, {})
).sort((a,b)=>b[1]-a[1]).slice(0,3);

const topDrops = Object.entries(
  todayRows.reduce((map, r) => {
    const k = r.하차지명 || "기타";
    map[k] = (map[k] || 0) + 1;
    return map;
  }, {})
).sort((a,b)=>b[1]-a[1]).slice(0,3);

// 🔹 알림 설정 (시간 자동감지)
const [alertTime, setAlertTime] = React.useState("10:00");
const [alertShown, setAlertShown] = React.useState(false);

React.useEffect(() => {
  const timer = setInterval(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const cur = `${hh}:${mm}`;

    if (!alertShown && cur === alertTime) {
      showAlert(`알림: ${alertTime}\n미배차 ${pending}건, 지연 ${delayed}건이 있습니다. 확인해 주세요.`);
      setAlertShown(true);
    }
  }, 10000);

  return () => clearInterval(timer);
}, [alertTime, alertShown, pending, delayed]);


// ========================================================
// ⭐ 상태 기반 필터링 실행 + 실시간배차현황 테이블로 스크롤 이동
// ========================================================
const goStatus = (type, value) => {
  setFilterType(type);
  setFilterValue(value);

  const el = document.getElementById("realtime-status-area");
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
};

// ⭐ 오더복사용 플래그 (🔥 여기 추가)
const [isCopyMode, setIsCopyMode] = React.useState(false);
    // ⭐ 여기 맨 위에 오도록
    const [clientQuery, setClientQuery] = React.useState("");
    const [isClientOpen, setIsClientOpen] = React.useState(false);
    // ⭐ 거래처 선택 대상 팝업
    

    const [clientActive, setClientActive] = React.useState(0);
    const comboRef = React.useRef(null);
    const clientDropdownListRef = React.useRef(null);
    React.useEffect(() => {
      const onDocClick = (e) => {
        if (!comboRef.current) return;
        if (!comboRef.current.contains(e.target)) setIsClientOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);
    // 방향키로 활성 항목이 바뀌면, 목록이 길어 스크롤이 생겼을 때도 항상
    // 활성 항목이 보이는 위치로 자동 스크롤한다 (CustomSelect와 동일한 동작).
    React.useEffect(() => {
      const list = clientDropdownListRef.current;
      if (!list) return;
      const item = list.children[clientActive];
      if (!item) return;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const viewTop = list.scrollTop;
      const viewBottom = viewTop + list.clientHeight;
      if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
      if (itemTop < viewTop) list.scrollTop = itemTop;
    }, [clientActive]);
// ⭐ 상차지 자동완성 상태 분리
const [showPickupDropdown, setShowPickupDropdown] = React.useState(false);
const [pickupOptions, setPickupOptions] = React.useState([]);
// 🚗 차량종류 자동완성 상태
const [vehicleQuery, setVehicleQuery] = React.useState("");
const [showVehicleDropdown, setShowVehicleDropdown] = React.useState(false);
const [vehicleActive, setVehicleActive] = React.useState(0);
const vehicleItemRefs = React.useRef([]);
React.useEffect(() => {
  if (!showVehicleDropdown) return;

  const el = vehicleItemRefs.current[vehicleActive];
  if (el) {
    el.scrollIntoView({
      block: "nearest",   // 드롭다운 내부에서만 이동
      inline: "nearest",
    });
  }
}, [vehicleActive, showVehicleDropdown]);
const [pickupActive, setPickupActive] = React.useState(0);
// ⭐ Tab을 눌렀을 때 "사용자가 방향키로 실제로 골랐는지"를 구분하기 위한 플래그.
// 이게 없으면 예를 들어 이미 등록된 "후레쉬2공장"과 비슷한 신규 거래처 "후레쉬2"를
// 입력하는 중에도 필터링된 드롭다운 맨 위 항목(후레쉬2공장)이 그냥 Tab만 눌러도
// 강제로 선택돼버려서 신규 입력이 불가능해지는 문제가 있었다.
const pickupNavTouchedRef = React.useRef(false);
const pickupDropdownListRef = React.useRef(null);
React.useEffect(() => {
  const list = pickupDropdownListRef.current;
  if (!list) return;
  const item = list.children[pickupActive];
  if (!item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  if (itemTop < viewTop) list.scrollTop = itemTop;
}, [pickupActive]);

const [showPlaceDropdown, setShowPlaceDropdown] = React.useState(false);
const [placeOptions, setPlaceOptions] = React.useState([]);
const [placeActive, setPlaceActive] = React.useState(0);
// ⭐ pickupNavTouchedRef와 동일한 이유 — 하차지명도 신규 업체명이 기존 등록된
// 비슷한 이름의 드롭다운 옵션에 가려 Tab만 눌러도 강제로 바뀌지 않도록 한다.
const dropNavTouchedRef = React.useRef(false);
const placeDropdownListRef = React.useRef(null);
React.useEffect(() => {
  const list = placeDropdownListRef.current;
  if (!list) return;
  const item = list.children[placeActive];
  if (!item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  if (itemTop < viewTop) list.scrollTop = itemTop;
}, [placeActive]);
const [stopPlaceOptions, setStopPlaceOptions] = React.useState([]);
const [stopPlaceActive, setStopPlaceActive] = React.useState(0);
const stopPlaceDropdownListRef = React.useRef(null);
React.useEffect(() => {
  const list = stopPlaceDropdownListRef.current;
  if (!list) return;
  const item = list.children[stopPlaceActive];
  if (!item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  if (itemTop < viewTop) list.scrollTop = itemTop;
}, [stopPlaceActive]);
const [showStopDropdown, setShowStopDropdown] = React.useState(false);

    // ---------- 🔧 안전 폴백 유틸(다른 파트 미정의 시 자체 사용) ----------
const _todayStr = (typeof todayStr === "function")
  ? todayStr
  : () => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    
       // ===================== 하차지(placeRows) + 로컬 병합 placeList 끝 =====================

// ⭐ 업체명 "완전 동일"만 기존으로 판단
const findPlaceByName = (name) => {
  const nk = normalizeKey(name);
  return placeList.find(
    (p) => normalizeKey(p.업체명 || "") === nk
  );
};

const [newClientModalOpen, setNewClientModalOpen] = React.useState(false);
const [newClientModalData, setNewClientModalData] = React.useState({ name: "", addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" });

const openNewPlacePrompt = (name) => {
  setNewClientModalData({ name: name || "", addr: "", manager: "", phone: "", email: "", memo: "", grade: "일반" });
  setNewClientModalOpen(true);
};

// 주소 정규화 (공백·특수문자 제거, 소문자)
const normalizeAddr = (a = "") =>
  String(a).trim().replace(/\s+/g, "").replace(/[-./]/g, "").toLowerCase();

// 주소 동일 여부 — 완전 동일 또는 한쪽이 다른쪽을 포함하는 경우 (10자 이상)
const isSameAddr = (a = "", b = "") => {
  const na = normalizeAddr(a);
  const nb = normalizeAddr(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer  = na.length <= nb.length ? nb : na;
  return shorter.length >= 10 && longer.startsWith(shorter);
};

const savePlaceSmart = async (name, addr, manager, phone, placeId, _conflictResolution, extraFields) => {
  if (!name) return;

  // "keep_new" = keep existing place unchanged, create brand new separate record
  if (_conflictResolution === "keep_new") {
    const uniqueKey = makePlaceKey(name) + "_" + Date.now().toString(36);
    const contacts = manager?.trim() ? [{name: manager.trim(), phone: phone?.trim() || "", isPrimary: true}] : [];
    // _forceNew: 사용자가 팝업에서 "별도로 새로 만들기"를 직접 선택한 경우라
    // upsertPlace의 업체명 기반 안전장치(existing 문서로 병합)를 타면 안 된다.
    await upsertPlace({ _id: uniqueKey, 업체명: name, 주소: addr || "", contacts, _forceNew: true }).catch(() => {});
    return;
  }

  // 기본거래처(clients)에 이미 등록된 업체명이면 하차지거래처(places)에 별도 사본을
  // 만들지 않고 기본거래처 쪽을 갱신한다 — 기본거래처가 있는데 같은 업체명으로
  // 하차지거래처까지 매번 자동 생성되어 둘이 항상 중복되던 문제를 막기 위함.
  // placeId가 명시적으로 주어졌다면(실제 하차지거래처 문서를 직접 선택/편집 중인
  // 경우) 그 의도를 존중해 하차지거래처를 그대로 갱신한다.
  if (!placeId) {
    const clientMatch = (clients || []).find(
      c => normalizeKey(c.업체명 || c.거래처명) === normalizeKey(name)
    );
    if (clientMatch) {
      // 하차지거래처와 동일하게, 기존 주소와 다르면 덮어쓸지/별도 저장할지 먼저 물어본다.
      if (addr?.trim() && clientMatch.주소?.trim() &&
          normalizeAddr(clientMatch.주소) !== normalizeAddr(addr) &&
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
  const existingByName = placeList.find(
    p => normalizeKey(p.업체명) === normalizeKey(name)
  );

  // Detect: same name, different address (only if existing has a stored address)
  if (existingByName && addr?.trim() && existingByName.주소?.trim() &&
      normalizeAddr(existingByName.주소) !== normalizeAddr(addr) &&
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

  // Detect: new name, same address as existing place
  if (!existingByName && addr?.trim() && _conflictResolution !== "separate") {
    const sameAddrPlace = placeList.find(p => isSameAddr(p.주소, addr));
    if (sameAddrPlace) {
      setPlaceConflictQueue(q => [...q, {
        type: "addrDuplicate",
        name, addr, manager, phone, placeId,
        existingName: sameAddrPlace.업체명,
        existingId: sameAddrPlace._id,
        existingAddr: sameAddrPlace.주소,
      }]);
      setPlaceConflictOpen(true);
      return;
    }
  }

  const existing = existingByName;
  // 이름·번호가 빈 자리표시 연락처는 버리고 시작한다(새 담당자/번호가 대표로 잡히게)
  let contacts = (existing?.contacts ? [...existing.contacts] : []).filter(c => c && (String(c.name || "").trim() || String(c.phone || "").trim()));

  const resolvedManager = manager?.trim() || "";
  const resolvedPhone = phone?.trim() || "";

  if (resolvedManager) {
    const sameNameIdx = contacts.findIndex(c => c.name?.trim() === resolvedManager);
    if (sameNameIdx >= 0) {
      contacts = contacts.map((c, i) => ({
        ...c,
        phone: i === sameNameIdx ? (resolvedPhone || c.phone) : c.phone,
        isPrimary: i === sameNameIdx,
      }));
    } else {
      contacts = contacts.map(c => ({ ...c, isPrimary: false }));
      contacts.push({ name: resolvedManager, phone: resolvedPhone, isPrimary: true });
    }
  } else if (resolvedPhone) {
    // Phone only — check if already exists by phone
    const samePhoneIdx = contacts.findIndex(c => c.phone?.replace(/\D/g,"") === resolvedPhone.replace(/\D/g,"") && c.phone);
    if (samePhoneIdx >= 0) {
      contacts = contacts.map((c, i) => ({ ...c, isPrimary: i === samePhoneIdx }));
    } else {
      // Auto-name
      const autoName = nextManagerName(contacts);
      contacts = contacts.map(c => ({ ...c, isPrimary: false }));
      contacts.push({ name: autoName, phone: resolvedPhone, isPrimary: true });
    }
  } else if (contacts.length === 0) {
    contacts = [{ name: "", phone: "", isPrimary: true }];
  }

  const finalAddr = _conflictResolution === "keep" ? (existing?.주소 || addr || "") : (addr || existing?.주소 || "");

  await upsertPlace({
    _id: existing?._id || key,
    업체명: name,
    주소: finalAddr,
    contacts,
    등급: extraFields?.등급 || existing?.등급 || "일반",
    등급변경일: existing?.등급변경일 || null,
    메모: extraFields?.메모 || existing?.메모 || "",
    이메일: extraFields?.이메일 || existing?.이메일 || "",
    오더메모: extraFields?.오더메모 !== undefined ? extraFields.오더메모 : existing?.오더메모,
    팝업표시: extraFields?.팝업표시 !== undefined ? extraFields.팝업표시 : existing?.팝업표시,
    기사전달주의사항: extraFields?.기사전달주의사항 !== undefined ? extraFields.기사전달주의사항 : existing?.기사전달주의사항,
  });
};
    // 기본 clients + 하차지 모두 포함한 통합 검색 풀
const mergedClients = React.useMemo(() => {
  const map = new Map();
  // 이름만으로 키를 잡으면, 같은 업체명이라도 주소가 다른 기본거래처/하차지거래처가
  // 있을 때 하나가 다른 하나를 가려버려서 자동완성 드롭다운에 1개만 뜬다(주소가
  // 다르면 서로 다른 거래처로 취급해야 한다) — 이름+주소 조합으로 키를 잡아 둘 다
  // 살아남게 한다.
  const mkKey = (n, a) => `${normalizeKey(n)}|${normalizeAddr(a || "")}`;

  // ✅ 1️⃣ 기본거래처(clients)를 먼저 넣어 우선시킨다 — savePlaceSmart가 이름이 일치하는
  // 기본거래처가 있으면 항상 그쪽에 담당자를 누적 저장하므로(하차지거래처 사본은 새로
  // 안 만듦), 같은 이름+주소로 하차지거래처에도 예전 중복 문서가 남아있으면 그 오래된
  // (담당자가 갱신되지 않은) 하차지거래처 쪽이 여기서 이겨버려 방금 저장한 담당자 목록이
  // 아니라 옛 담당자만 계속 자동입력되고 선택 팝업도 뜨지 않는 문제가 있었다.
  clients.forEach(c => {
    const name = c.업체명 || c.거래처명 || "";
    const key = mkKey(name, c.주소);
    if (!normalizeKey(name)) return;
    map.set(key, {
      // ⭐ id를 안 넘기면 이 기본거래처 항목으로 연 담당자선택 팝업에서 담당자를
      // 삭제/수정할 때(updateContactInPlace) 어느 문서를 갱신해야 할지 몰라 이름만으로
      // 다시 찾아야 했다 — 같은 이름에 주소가 다른 거래처가 여러 개 있으면 엉뚱한
      // 문서를 갱신해서(수정은 반영 안 되고) 원래 문서는 그대로 남아 있어 "삭제했는데
      // 다시 열면 되살아나 있다"는 버그로 이어졌다. id를 그대로 실어보내 그 문제 자체를 없앤다.
      id: c.id,
      업체명: name,
      주소: c.주소 || "",
      담당자: c.담당자 || "",
      담당자번호: c.연락처 || c.담당자번호 || "",
      메모: c.메모 || "",
      오더메모: c.오더메모 || "",
      기사전달주의사항: c.기사전달주의사항 || "",
      등급: c.등급 || "일반",
      등급변경일: c.등급변경일 || null,
      팝업표시: c.팝업표시 !== undefined ? c.팝업표시 : true,
      // 하차지거래처와 달리 기본거래처는 원래 contacts 배열이 없었지만, savePlaceSmart가
      // 이제 기본거래처에도 여러 담당자를 contacts로 저장한다 — 여기서 빠뜨리면
      // 담당자가 여러 명이어도 항상 대표 담당자 1명만 적용되고 선택 팝업이 안 뜬다.
      contacts: Array.isArray(c.contacts) ? c.contacts : undefined,
    });
  });

  // ✅ 2️⃣ placeList는 기본거래처에 이름 자체가 아예 없는(진짜 하차지 전용) 업체만
  // 보충한다 — 기본거래처와 이름이 같은 하차지거래처는 이제 서로 동기화되므로,
  // 주소가 우연히 다르게 남아있어도 자동완성 드롭다운에 기본거래처 항목 하나만
  // 뜨면 된다(같은 회사가 드롭다운에 2개로 중복되어 보이던 문제).
  const clientNameSet = new Set(clients.map(c => normalizeKey(c.업체명 || c.거래처명 || "")).filter(Boolean));
  // ⭐ 2026-11-03 같은 이름의 하차지가 여러 곳(지점·창고가 주소만 다름, 예: (도외)위탁 55곳)이면 건너뛰지 않고 모두 보여준다
  //  (기본거래처와 1:1로 동기화된 사본 1곳일 때만 건너뜀 — 예전엔 기본거래처 1건만 떠서 55곳 중 1건만 보였다)
  const placeNameCnt = {}; placeList.forEach(p => { const k = normalizeKey(p.업체명); if (k) placeNameCnt[k] = (placeNameCnt[k] || 0) + 1; });
  placeList.forEach(p => {
    const nameKey = normalizeKey(p.업체명);
    if (!nameKey || (clientNameSet.has(nameKey) && placeNameCnt[nameKey] < 2)) return;
    const key = mkKey(p.업체명, p.주소);
    if (!map.has(key)) map.set(key, p);
  });
  return Array.from(map.values());
}, [placeList, clients]);

    // 이름 기준으로 하차지/기본거래처 찾기
    const findClient = (name = "") => {
      const n = normalizeKey(name);
      return mergedClients.find(
        (c) => normalizeKey(c.업체명 || "").includes(n)
      );
    };
    // 🚗 차량종류 자동완성 필터 (★ 반드시 전역)
const filterVehicles = (q) => {
  const query = String(q || "").trim();
  const all = withCustomVehicleTypes(VEHICLE_TYPES); // 🚚 2026-11-02 회사에서 추가한 차량종류 포함
  if (!query) return all;

  const nq = normalizeKey(query);
  return all.filter((v) =>
    normalizeKey(v).includes(nq)
  );
};
    // 🔍 하차지 / 상차지 자동완성 필터 함수 (정답)
const filterPlaces = (q) => {
  // 하차지거래처(placeList)뿐 아니라 기본거래처로 옮겨온 업체도 상/하차지명
  // 자동완성에 나오고 주소/담당자/연락처가 그대로 채워지도록 mergedClients를 사용한다
  // ⭐ 2026-11-03 공용 검색(placeSearch) — "업체명 주소낱말"로 바로 좁히기
  return placeSearch(mergedClients, q);
};

    const _tomorrowStr = (typeof tomorrowStr === "function")
      ? tomorrowStr
      : () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
    const _safeLoad = (typeof safeLoad === "function")
      ? safeLoad
      : (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
    const _safeSave = (typeof safeSave === "function")
      ? safeSave
      : (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { } };

    const VEHICLE_TYPES = (typeof window !== "undefined" && window.RUN25_VEHICLE_TYPES) || [
      "라보/다마스", "카고", "윙/카고", "윙바디", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "리프트", "오토바이", "기타"
    ];
    const PAY_TYPES = (typeof window !== "undefined" && window.RUN25_PAY_TYPES) || [
      "계산서", "착불", "선불", "손실", "개인", "취소"
    ];
    const DISPATCH_TYPES = (typeof window !== "undefined" && window.RUN25_DISPATCH_TYPES) || dropdownList("배차방식", [
      "24시", "직접배차", "인성", "고정기사", "로지스허브"
    ]);
    const StatusBadge = ({ s }) => {
      const map = {
        "배차중": "bg-amber-100 text-amber-800",
        "배차완료": "bg-emerald-100 text-emerald-800",
        "미배차": "bg-rose-100 text-rose-800",
      };
      return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${map[s] || "bg-gray-100 text-gray-700"}`}>{s || "-"}</span>;
    };

    // ⭐ (삭제) 예전엔 오더 목록이 바뀔 때마다 "모든 오더"의 첨부 서브컬렉션을 한 건씩 서버에서 읽어
    // 개수를 세는 코드가 있었는데, 그 결과(attachCount)를 쓰는 곳이 하나도 없어 읽기 비용만 수천 건씩
    // 나가고 있었다 — 첨부 개수는 각 오더의 attachCount 필드/첨부현황 화면에서 따로 보여준다.

    // ⏱ 시간 옵션(오전6시~오후10시, 30분 간격) — timeOptions 미지정 시 내부 생성
    const buildHalfHour = React.useMemo(() => {
      if (Array.isArray(timeOptions) && timeOptions.length) return timeOptions;
      const list = [];
      for (let h = 0; h < 24; h++) {
        for (let m of [0, 30]) {
          const isPM = h >= 12;
          const hour12 = h % 12 === 0 ? 12 : h % 12;
          list.push(`${isPM ? "오후" : "오전"} ${hour12}시${m === 30 ? " 30분" : ""}`);
        }
      }
      return list;
    }, [timeOptions]);
    const localTimeOptions = buildHalfHour;

    // 연도 고정 도우미 (YYYY-MM-DD로 강제; "MM-DD" => "YYYY-MM-DD")
    const currentYear = new Date().getFullYear();
    const lockYear = (yyyy_mm_dd_or_mm_dd) => {
      const v = (yyyy_mm_dd_or_mm_dd || "").trim();
      if (!v) return "";
      if (/^\d{2}-\d{2}$/.test(v)) return `${currentYear}-${v}`;
      return v;
    };

    const emptyForm = uiFormDefaults("dispatch", { // ⭐ 2026-11-07 화면 편집 — 최고관리자가 정한 기본값(상/하차방법·지급방식 등)
      _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      청구사업자: "", // ⭐ 2026-11-03 여러 사업자(비면 기본 = 회사)
      순번: "",
      등록일: _todayStr(),
      거래처명: "",
      상차지명: "",
      상차지Id: "",
      상차지주소: "",
      상차지담당자: "",
      상차지담당자번호: "",
      경유상차목록: [],
      하차지명: "",
      하차지Id: "",
      하차지주소: "",
      하차지담당자: "",
      하차지담당자번호: "",
      경유하차목록: [],
      화물내용: "",
      화물타입: "파레트",
      톤수타입: "톤",
      운행유형: "편도",   // ★ 추가 (기본값)
      차량종류: "",
      차량톤수: "",
      차량번호: "",
      이름: "",
      전화번호: "",
      상차방법: "",
      하차방법: "",
      상차일: _todayStr(),
      상차시간: "",
      상차시간기준: null,
      하차일: _todayStr(),
      하차시간: "",
      하차시간기준: null,
      청구운임: "",
      기사운임: "",
      수수료: "",
      지급방식: "",
      배차방식: "",
      메모: "",
      메모중요도: "NORMAL",
      전달사항: "",
      전달사항고정: false,
      배차상태: "배차중",
      독차: false,
      혼적: false,
      긴급: false,
      운임보정: null,
      복수근무일: false,     // ★ 묶음 오더 — 연속 기간이 아니라 특정 날짜들만 골라 하나의
      근무일자목록: [],      // 오더로 등록(예: 9/2,4,5,7~11,14~18). 상차일=최소값, 하차일=최대값으로 자동 연동.
    });
    const cargoInputRef = React.useRef(null);
    const cargoTypeTabbedRef = React.useRef(false); // 화물타입 "없음" 선택이 Tab으로 확정됐는지 추적(아래 참고)
    const tonInputRef = React.useRef(null);
    const payTypeRef = React.useRef(null);
    // 필수값 미입력 필드를 빨간 테두리로 깜빡여 알려주기 위한 상태
    const [requiredErrors, setRequiredErrors] = React.useState(new Set());
    const [form, setForm] = React.useState(() => {
      
  try {
    const saved = localStorage.getItem("dispatchForm");
    if (saved) {
      return {
        ...emptyForm,
        ...JSON.parse(saved),
      };
    }
  } catch {}
  return { ...emptyForm };
});
// ⭐ 차량번호를 입력해 지입 기사님이 매칭되는 순간, 그 기사님이 휴차(지정 휴차일 또는 오늘 본인 휴차중)면
// 화면 중앙에 확인 팝업 — 진행: 그대로(저장 때 다시 묻지 않음) / 보류: 입력한 기사 정보를 비운다.
const restAskingRef = React.useRef("");
React.useEffect(() => {
  const plate = String(form?.차량번호 || "").trim();
  if (!plate) return;
  const key = restAckKey(plate, form.상차일);
  if (form._restAck === key || restAskingRef.current === key) return;
  const c = findRestConflict(drivers, plate, form.상차일);
  if (!c) return;
  const t = setTimeout(async () => {
    restAskingRef.current = key;
    const ok = await confirmRestDispatch(c);
    restAskingRef.current = "";
    if (ok) setForm(p => ({ ...p, _restAck: key }));
    else setForm(p => ({ ...p, 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중", _restAck: "" }));
  }, 500);
  return () => clearTimeout(t);
}, [form?.차량번호, form?.상차일, form?._restAck, drivers]); // eslint-disable-line react-hooks/exhaustive-deps

    // ⭐ route-map DOM 생성 대기
async function waitMapDiv() {
  for (let i = 0; i < 20; i++) {
    const el = document.getElementById("route-map");
    if (el) return el;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

// ⭐ 지도가 칸보다 작게(아래쪽에 여백을 남기고) 그려지는 문제의 진짜 원인 —
// 모달이 내용 기준 자동 높이라, DOM은 이미 있어도(waitMapDiv 통과) 그
// 순간의 실제 높이가 아직 최종 값이 아닐 수 있다. TMAP은 "생성되는 그
// 순간"의 칸 크기로 내부를 굳히는 것으로 보이고, 생성 후에 resize류
// 메서드를 불러도 확실히 안 먹혀서(실제로 이미 시도했지만 계속 재현됨),
// 아예 "지도를 만들기 전에" 높이가 더 이상 안 바뀔 때까지(연속으로 같은
// 값이 두 번 나올 때까지, 최대 1초) 기다린다 — 그러면 지도가 처음부터
// 정확한 최종 크기로 만들어져서 사후 보정 자체가 필요 없어진다.
async function waitStableMapHeight(el) {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const h = el.clientHeight;
    if (h > 80 && h === last) return h;
    last = h;
    await new Promise(r => setTimeout(r, 50));
  }
  return el.clientHeight;
}

React.useEffect(() => {

  if (!confirmOpen || !form?.상차지주소 || !form?.하차지주소) return;

  // 지오코딩 API를 여러 번 순차 호출(주소 정제/축소 재시도 포함)하다 보니 확인 팝업을
  // 닫은 뒤에도 요청이 계속 진행돼, 팝업이 닫히거나 다음 오더로 바뀐 뒤에 뒤늦게
  // 지도를 그리며(마커/폴리라인 생성) 불필요한 렉을 유발하던 문제가 있었다 —
  // effect가 다시 실행되거나 언마운트되면 이후 작업을 모두 건너뛴다.
  let cancelled = false;

  const renderTmap = async () => {

    try {

      console.log("● 지도 렌더 시작");

      // ⭐ Tmap SDK는 이제 필요할 때만 불러온다(첫 화면 로딩 속도 개선)
      await loadTmap().catch(() => {});
      if (cancelled || !window.Tmapv2?.Map) return;
      const mapDiv = await waitMapDiv();
      if (!mapDiv || cancelled) return;
      await waitStableMapHeight(mapDiv);
      if (cancelled) return;

      // ⭐ 주소 → 좌표 변환 (도로명 주소 대응 강화)
      const getCoords = async (addr) => {

        if (!addr || !addr.trim()) return null;

        const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

        // 🔥 주소 정제 함수
        const cleanAddr = (a) => {
          return String(a)
            .replace(/\(.*?\)/g, "")  // 괄호 제거
            .replace(/\s+/g, " ")      // 다중 공백 제거
            .trim();
        };

        // 🔥 기본 Geocoding
        const geocode = async (address) => {
          try {
            const url =
              "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo" +
              "?version=1&format=json&fullAddr=" +
              encodeURIComponent(address);

            const res = await fetch(url, {
              method: "GET",
              headers: {
                Accept: "application/json",
                appKey: TMAP_KEY
              }
            });

            const data = await res.json();
            const coord = data?.coordinateInfo?.coordinate?.[0];

            if (!coord) return null;

            return {
              lat: parseFloat(coord.lat),
              lon: parseFloat(coord.lon)
            };
          } catch (e) {
            console.error("Geocoding 에러:", e);
            return null;
          }
        };

        // 🔥 도로명 → 지번 변환 시도
        const convertToJibun = async (address) => {
          try {
            const res = await fetch(
              "https://apis.openapi.sk.com/tmap/geo/convertAddress?version=1&format=json",
              {
                method: "POST",
                headers: {
                  appKey: TMAP_KEY,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  address: address,
                  coordType: "WGS84GEO",
                }),
              }
            );

            if (!res.ok) return null;

            const data = await res.json();
            const jibun = data?.addressInfo?.fullAddress;
            
            return jibun || null;
          } catch {
            return null;
          }
        };

        // 🔥 주소 축소 (도/시/구/동 레벨까지 단계적으로)
        const shortenAddress = (address) => {
          const parts = address.split(" ");
          const results = [];
          
          // 예: "서울특별시 영등포구 선유로3길 10"
          // → ["서울특별시 영등포구 선유로3길 10", "서울특별시 영등포구 선유로3길", "서울특별시 영등포구"]
          
          for (let i = parts.length; i >= 2; i--) {
            results.push(parts.slice(0, i).join(" "));
          }
          
          return results;
        };

        try {
          const cleaned = cleanAddr(addr);
          
          // 1️⃣ 원본 주소로 시도
          let result = await geocode(cleaned);
          if (result) {
            console.log("✓ 원본 주소로 좌표 획득:", cleaned);
            return result;
          }

          // 2️⃣ 지번 변환 시도
          const jibun = await convertToJibun(cleaned);
          if (jibun) {
            result = await geocode(jibun);
            if (result) {
              console.log("✓ 지번 변환 후 좌표 획득:", jibun);
              return result;
            }
          }

          // 3️⃣ 주소 축소하며 재시도 (도로명 주소 대응)
          const shortened = shortenAddress(cleaned);
          for (const shortAddr of shortened) {
            result = await geocode(shortAddr);
            if (result) {
              console.log("✓ 축소 주소로 좌표 획득:", shortAddr);
              return result;
            }
          }

          console.warn("✕ 모든 방법으로 좌표 획득 실패:", addr);
          return null;

        } catch (e) {
          console.error("좌표 변환 전체 실패:", e);
          return null;
        }
      };

      // ⭐ 예전엔 여기서 상/하차지 좌표를 클라이언트가 먼저 순차로(상차지→하차지
      // 차례로, 각각 실패시 지번변환+주소축소까지 재시도) 조회한 뒤에야 지도를
      // 만들고 /api/route를 호출했다 — 그런데 이 좌표(start/end)는 지도 중심을
      // 잡는 데만 쓰이고, 실제 마커는 아래에서 /api/route가 돌려주는 경로(path)의
      // 첫/마지막 좌표로 다시 그려서 사실상 버려지는 값이었다. 게다가 서버도
      // /api/route 안에서 같은 주소를 또 geocoding하므로 완전히 중복 작업.
      // → 지도부터 즉시 만들고, 경로 요청을 바로 시작한다.
      mapDiv.innerHTML = "";

      const map = new window.Tmapv2.Map("route-map", {
        center: new window.Tmapv2.LatLng(37.5665, 126.9780), // 서울시청(경로 도착 전 기본값, 곧 fitBounds로 이동)
        width: "100%",
        height: "100%",
        zoom: 10
      });
      attachTmapTraffic(map, "route-map"); // 🚦 2026-11-22 사고 · 공사 · 통제
      // ⭐ 모달이 내용 기준 자동 높이라 지도를 만드는 시점엔 레이아웃이 아직
      // 최종 크기로 자리잡지 않았을 수 있다 — TMAP이 그 순간의(더 작은) 칸
      // 크기를 기준으로 내부 크기를 굳혀버려, 실제로는 칸이 더 큰데도 지도만
      // 작게 남아 여백이 생긴다. SDK마다 재계산 메서드 이름이 달라
      // (resize/invalidateSize 등) 확실하지 않으므로 존재하는 것들을 전부
      // 시도하고, 그래도 안 먹힐 경우를 대비해 실제로 측정한 픽셀 크기를
      // 직접 다시 넣어준다. 레이아웃이 늦게 자리잡는 경우까지 잡기 위해
      // 여러 시점(0ms/150ms/400ms)에 반복 시도한다.
      const forceMapResize = () => {
        try {
          const w = mapDiv.clientWidth, h = mapDiv.clientHeight;
          if (typeof map.resize === "function") map.resize();
          if (typeof map.invalidateSize === "function") map.invalidateSize();
          if (typeof map.setSize === "function" && w > 0 && h > 0) {
            map.setSize(new window.Tmapv2.Size(w, h));
          }
        } catch {}
        try { window.dispatchEvent(new Event("resize")); } catch {}
      };
      [0, 150, 400].forEach((ms) => setTimeout(forceMapResize, ms));
      // ⭐ 사용자 재보고 — 0/150/400ms 안에 패널(배차요청장) 쪽 비동기 데이터(운임/
      // 거리 등)가 다 안 끝나고 그 뒤에도 패널 높이가 더 늘어나는 경우, 지도는 이미
      // 그 전 크기로 굳어서 여전히 아래쪽에 여백이 남았다. 정해진 시점만 믿지 않고
      // 지도 칸 자체의 실제 크기 변화를 계속 감시해서, 바뀔 때마다 다시 맞춘다
      // (모달이 닫히면 관찰 중단).
      let roCancelled = false;
      const ro = new ResizeObserver(() => { if (!roCancelled) forceMapResize(); });
      ro.observe(mapDiv);
      const stopObserving = () => { roCancelled = true; ro.disconnect(); };
      const prevCancelCheck = () => cancelled;
      (function watchCancel() {
        if (prevCancelCheck()) { stopObserving(); return; }
        setTimeout(watchCancel, 500);
      })();

      // =========================
// ⭐🔥 도로 경로 (완성)
// =========================

const API_BASE = import.meta.env.VITE_API_BASE || "";

const viaAddrs = [
  ...(form.경유상차목록 || []).filter(s => s.주소?.trim()).map(s => s.주소),
  ...(form.경유하차목록 || []).filter(s => s.주소?.trim()).map(s => s.주소),
];

const routeRes = await fetch(`${API_BASE}/api/route`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fromAddr: form.상차지주소,
    toAddr: form.하차지주소,
    viaPoints: viaAddrs,
  })
});

if (cancelled) return;

let routeData = null;

try {
  routeData = await routeRes.json();
} catch (e) {
  console.warn("✕ route JSON 파싱 실패");

  setRouteInfo({
    distanceKm: 0,
    durationMin: 0
  });

  return;
}

if (cancelled) return;

// =========================
// 🔥 1차 방어 (핵심)
// =========================
if (!routeData?.path || routeData.path.length === 0) {
  console.warn("✕ 경로 없음:", routeData?.error);

  // 👉 경로 없을 때도 정보는 표시
  setRouteInfo({
    distanceKm: 0,
    durationMin: 0
  });

  // 👉 지도는 건드리지 않음 (에러 방지 핵심)
  return;
}

// =========================
// 🔥 path → LatLng 변환
// =========================
const linePath = routeData.path.map(
  ([lng, lat]) => new window.Tmapv2.LatLng(lat, lng)
);

// =========================
// 🔥 2차 방어 (혹시 데이터 이상)
// =========================
if (!linePath || linePath.length === 0) {
  console.warn("✕ linePath 없음");
  return;
}

// =========================
// ⭐ 경로 그리기
// =========================
// ⭐ 티맵처럼 두꺼운 선 + 구간별 교통상황 색(원활/서행/지체/정체)
drawTmapTrafficRoute(map, routeData);

// =========================
// ⭐ 거리 / 시간
// =========================
setRouteInfo({
  distanceKm: Number(routeData.distanceKm),
  durationMin: Number(routeData.durationMin)
});

// =========================
// 🔥 bounds 안전 처리 (핵심)
// =========================
const bounds = new window.Tmapv2.LatLngBounds();

linePath.forEach(p => {
  if (p) bounds.extend(p);
});

// 경로 데이터가 도착한 지금 시점(레이아웃이 가장 안정된 상태)에도 한 번 더
// 크기를 맞춰준다 — fitBounds가 실제 칸 크기를 기준으로 계산되게 하기 위해.
forceMapResize();

// 👉 bounds 비어있으면 절대 fitBounds 하지 말 것
if (!bounds.isEmpty()) {
  map.fitBounds(bounds);
  setTimeout(() => { forceMapResize(); map.fitBounds(bounds); }, 200);
} else {
  console.warn("✕ bounds 비어있음 → fitBounds 스킵");
}

console.log("✓ 지도 + 경로 완료");
// =========================
// ⭐ 출발 / 도착 마커 추가
// =========================
const makePinIcon = (label, color) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80">
      <rect x="2" y="2" width="56" height="26" rx="13" ry="13"
        fill="${color}" stroke="white" stroke-width="2"/>
      <text x="30" y="20" text-anchor="middle"
        font-size="13" font-weight="bold"
        font-family="sans-serif" fill="white">
        ${label}
      </text>
      <polygon points="25,26 35,26 30,36" fill="${color}"/>
      <circle cx="30" cy="60" r="9"
        fill="${color}" stroke="white" stroke-width="3"/>
      <line x1="30" y1="36" x2="30" y2="51"
        stroke="${color}" stroke-width="3"/>
    </svg>
  `;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
};

const markerStart = linePath[0];
const markerEnd   = linePath[linePath.length - 1];
if (markerStart && markerEnd) {
  new window.Tmapv2.Marker({
    position: markerStart,
    map,
    icon: makePinIcon("출발", "#2563eb"),
    iconSize: new window.Tmapv2.Size(60, 80),
    iconAnchor: new window.Tmapv2.Point(30, 80),
  });
  new window.Tmapv2.Marker({
    position: markerEnd,
    map,
    icon: makePinIcon("도착", "#dc2626"),
    iconSize: new window.Tmapv2.Size(60, 80),
    iconAnchor: new window.Tmapv2.Point(30, 80),
  });
}

// ✅ 경유 상차지(초록)/경유 하차지(보라) 마커 — 예전엔 하나씩 순서대로 기다려서
// (for...await) 경유지가 많을수록 느려졌다. 한꺼번에 병렬로 좌표를 가져온다.
const pickupVia = (form.경유상차목록 || []).filter(s => s.주소?.trim());
const dropVia = (form.경유하차목록 || []).filter(s => s.주소?.trim());

const [pickupViaCoords, dropViaCoords] = await Promise.all([
  Promise.all(pickupVia.map(s => getCoords(s.주소))),
  Promise.all(dropVia.map(s => getCoords(s.주소))),
]);
if (cancelled) return;

pickupViaCoords.forEach((vCoord, vi) => {
  if (vCoord) {
    new window.Tmapv2.Marker({
      position: new window.Tmapv2.LatLng(vCoord.lat, vCoord.lon),
      map,
      icon: makePinIcon(`상${vi + 1}`, "#059669"),
      iconSize: new window.Tmapv2.Size(60, 80),
      iconAnchor: new window.Tmapv2.Point(30, 80),
    });
  }
});

dropViaCoords.forEach((vCoord, vi) => {
  if (vCoord) {
    new window.Tmapv2.Marker({
      position: new window.Tmapv2.LatLng(vCoord.lat, vCoord.lon),
      map,
      icon: makePinIcon(`하${vi + 1}`, "#9333ea"),
      iconSize: new window.Tmapv2.Size(60, 80),
      iconAnchor: new window.Tmapv2.Point(30, 80),
    });
  }
});
    } catch (err) {
      console.error("경로 지도 실패:", err);
    }

  };

renderTmap();

return () => { cancelled = true; };
}, [confirmOpen, form?.상차지주소, form?.하차지주소, form?.경유상차목록, form?.경유하차목록]);
// ===============================
// 💡 주소/조건 기반 자동 운임 가이드
// ===============================
React.useEffect(() => {
  if (!form.상차지주소 || !form.하차지주소) {
    setAreaFareHint(null);
    return;
  }

  const ton = getTotalTonFromOrder(form);

  const hint = calcNationwideAvgFare({
    pickupAddr: form.상차지주소,
    dropAddr: form.하차지주소,
    ton,
    pallet: getTotalPalletFromOrder(form),
    vehicle: form.차량종류,
    dispatchData,
  });

  setAreaFareHint(hint);
}, [
  form.상차지주소,
  form.하차지주소,
  form.화물내용,
  form.차량톤수,
  form.차량종류,
  dispatchData,
]);

// ===============================
// 💡 티맵 거리 기반 운임 추정 — 실제 도로거리 × 차량/화물 조건으로 산정
// ===============================
React.useEffect(() => {
  if (!form.상차지주소 || !form.하차지주소) {
    setDistanceFareEstimate(null);
    return;
  }
  let cancelled = false;
  const t = setTimeout(async () => {
    const est = await estimateDistanceFare({
      pickupAddr: form.상차지주소,
      dropAddr: form.하차지주소,
      vehicleText: form.차량종류,
      tonText: form.차량톤수,
      cargoText: form.화물내용,
    }).catch(() => null);
    if (!cancelled) setDistanceFareEstimate(est);
  }, 500);
  return () => { cancelled = true; clearTimeout(t); };
}, [form.상차지주소, form.하차지주소, form.차량종류, form.차량톤수, form.화물내용]);

    React.useEffect(() => _safeSave("dispatchForm", form), [form]);
    const pickupStops = form.경유상차목록 || [];
const pickupCount = pickupStops.filter(s => s.업체명?.trim()).length;
const hasPickupStops = pickupCount > 0;

const dropStops = form.경유하차목록 || [];
const dropCount = dropStops.filter(s => s.업체명?.trim()).length;
const hasDropStops = dropCount > 0;
    // ===============================
// ⭐ 폼 최초 로딩 시 날짜 자동 보정
// ===============================
React.useEffect(() => {
  setForm((p) => ({
    ...p,
    등록일: _todayStr(),
    상차일: _todayStr(),
    하차일: _todayStr(),
  }));
}, []);
// 전달사항 자동완성: 상차지명+하차지명 매칭 시 고정된 전달사항 자동 입력
React.useEffect(() => {
  if (!form.상차지명 || !form.하차지명 || form.전달사항) return;
  const match = (dispatchData || []).find(r =>
    r.전달사항고정 === true &&
    r.상차지명?.trim() === form.상차지명.trim() &&
    r.하차지명?.trim() === form.하차지명.trim() &&
    r.전달사항?.trim()
  );
  if (match) {
    onChange("전달사항", match.전달사항);
    onChange("전달사항고정", true);
  }
}, [form.상차지명, form.하차지명]);
// ===============================
// 💰 주소 기반 전국 평균 운임 계산 (정확 톤수 기준)
// ===============================
function calcNationwideAvgFare({
  pickupAddr,
  dropAddr,
  ton,
  pallet,
  vehicle,
  dispatchData,
}) {

  // 1️⃣ 주소 기준 (무조건)
let base = (dispatchData || []).filter(r => {
  const pickupOk = isAreaMatch(
    pickupAddr,
    r.상차지주소 || r.상차지명
  );

  const dropOk = isAreaMatch(
    dropAddr,
    r.하차지주소 || r.하차지명
  );

  return pickupOk && dropOk && r.청구운임;
});


  if (base.length < 2) return null;

  let list = base;
  let level = "주소";
  let motorFallback = false;
  let coldSurcharge = null;

  if (vehicle) {
    const vg = normalizeVehicleGroup(vehicle);
    const vehicleFiltered = list.filter(r => normalizeVehicleGroup(r.차량종류) === vg);

    if (vehicleFiltered.length >= 2) {
      list = vehicleFiltered;
      level = "차량";
    } else if (vg === "MOTOR") {
      // 오토바이 데이터 부족 시 일반차량 기준으로 폴백 (라보/다마스급 이하)
      const generalFiltered = list.filter(r => normalizeVehicleGroup(r.차량종류) === "GENERAL");
      if (generalFiltered.length >= 2) {
        list = generalFiltered;
        level = "차량";
        motorFallback = true;
      }
    } else if (vg === "COLD") {
      // ⭐ 냉장/냉동 이력이 부족하면 일반차량 이력에 냉장·냉동 할증을 얹어 추정한다
      //   (예전엔 일반 운임 그대로 나와 특수차량 예상운임이 낮게 보였다)
      if (vehicleFiltered.length > 0) list = vehicleFiltered;
      else { coldSurcharge = specialSurcharge(vehicle, ""); level = `일반차량 + ${coldSurcharge.label} 할증 ${Math.round(coldSurcharge.rate * 100)}%`; }
    } else {
      list = vehicleFiltered.length > 0 ? vehicleFiltered : list;
    }
  }
  // 3️⃣ 톤수 (이전 단계 list 기준)
  if (ton != null) {
    const f = list.filter(r => {
      const rt = getTotalTonFromOrder(r);
      return rt != null && Math.abs(rt - ton) <= 0.5;
    });
    if (f.length >= 2) {
      list = f;
      level = "톤수";
    }
  }

  // 4️⃣ 화물내용 (파렛트, 경유지 포함 합산)
  if (pallet != null) {
    const f = list.filter(r => {
      const rp = getTotalPalletFromOrder(r);
      return rp != null && Math.abs(rp - pallet) <= 1;
    });
    if (f.length >= 2) {
      list = f;
      level = "화물";
    }
  }

  const fares = list.map(r =>
    Number(String(r.청구운임).replace(/[^\d]/g, "")) * (1 + (coldSurcharge?.rate || 0))
  ).map(v => (coldSurcharge ? Math.round(v / 5000) * 5000 : v));

return {
  level: level === "차량" || level === "톤수" || level === "화물" ? (coldSurcharge ? `${level} · ${coldSurcharge.label} 할증` : level) : level,
  surchargeLabel: coldSurcharge?.label || "",
  min: Math.min(...fares),
  max: Math.max(...fares),
  avg: Math.round(fares.reduce((a,b)=>a+b,0) / fares.length),
  count: fares.length,
  motorFallback,
  pickupLabel: normalizeAreaForSearch(pickupAddr),
  dropLabel: normalizeAreaForSearch(dropAddr),
};
}
// ===============================
// 🤖 AI 배차/운임 추천 (HERE)
// ===============================
React.useEffect(() => {
  const pickup = form.상차지명?.trim();
  const drop   = form.하차지명?.trim();
  const ton    = getTotalTonFromOrder(form);
  const vehicle = form.차량종류;

  if (!pickup || !drop || !ton) {
    setAiRecommend(null);
    return;
  }

const similar = (dispatchData || []).filter(r =>
  (r.운행유형 || "편도") === form.운행유형 &&   // ★ 추가
  normalizeKey(r.상차지명) === normalizeKey(pickup) &&
  normalizeKey(r.하차지명) === normalizeKey(drop) &&
  getTotalTonFromOrder(r) === ton &&
  r.청구운임 &&
  r.기사운임
);

  if (similar.length < 1) {
    setAiRecommend(null);
    return;
  }

  const fares = similar.map(r => Number(String(r.청구운임).replace(/[^\d]/g, "")));
  const drivers = similar.map(r => Number(String(r.기사운임).replace(/[^\d]/g, "")));

  const avg = (arr) => Math.round(arr.reduce((a,b)=>a+b,0) / arr.length);

  const fareAvg = avg(fares);
  const driverAvg = avg(drivers);

const inputFare = Number(form.청구운임 || 0);

setAiRecommend({
  vehicle: vehicle || "자동",
  fareAvg,
  fareMin: Math.round(fareAvg * 0.9),
  fareMax: Math.round(fareAvg * 1.1),
  driverAvg,
  marginPercent: Math.round(((fareAvg - driverAvg) / fareAvg) * 100),
  sampleCount: similar.length,

  hasInputFare: inputFare > 0,   // ★ 핵심
  inputFare,
  fareDiffPercent: inputFare > 0 ? Math.round(((inputFare - fareAvg) / fareAvg) * 100) : 0,

  isOutlier:
    inputFare > 0 &&
    Math.abs((inputFare - fareAvg) / fareAvg) >= 0.25,
});



}, [
  form.상차지명,
  form.하차지명,
  form.차량톤수,
  form.차량종류,
  dispatchData,
]);
// =====================================================
// 💰 기존 운임 대비 비교 표시 (🔥 여기 추가)
// =====================================================
const [fareCompare, setFareCompare] = React.useState({
  sale: null,
  driver: null,
});
const [isSaving, setIsSaving] = React.useState(false);
// ⭐ 완전히 동일한 오더 중복 등록 알림 — 저장을 막지는 않고, 사용자가 직접
// 판단할 수 있게 알림창만 띄운다(계속 등록/취소 선택). dupOrderResolveRef에
// Promise의 resolve를 담아두고, 모달에서 선택하면 그 resolve를 호출해 대기 중이던
// doSave의 await를 재개시킨다.
const [dupOrderMatches, setDupOrderMatches] = React.useState(null);
const dupOrderResolveRef = React.useRef(null);
const confirmDuplicateOrder = (matches) => new Promise((resolve) => {
  dupOrderResolveRef.current = resolve;
  setDupOrderMatches(matches);
});
const [multiCount, setMultiCount] = React.useState(1); // ★ 다중 등록 수량
const [orderDates, setOrderDates] = React.useState([]); // 오더별 개별 상차일
const [orderDropDates, setOrderDropDates] = React.useState([]); // 오더별 개별 하차일
const [useSeparateDates, setUseSeparateDates] = React.useState(false);

React.useEffect(() => {
  if (multiCount <= 1) { setUseSeparateDates(false); return; }
  setOrderDates(Array.from({ length: multiCount }, () => form.상차일 || ""));
  setOrderDropDates(Array.from({ length: multiCount }, () => form.상차일 || ""));
}, [multiCount]); // eslint-disable-line react-hooks/exhaustive-deps

// ============================================================
// ⭐ 다중등록(서로 다른 오더 일괄등록) — 위 multiCount(수량)는 "완전히 똑같은
// 오더를 N번" 등록하는 기능이라, 거래처/상차지만 같고 나머지(하차지·화물·
// 톤수·운임 등)가 전부 다른 오더 여러 건을 등록할 때는 맞지 않는다. 이 팝업은
// 거래처(=상차지)별로 "그룹"을 만들고(여러 거래처를 섞어도 됨), 그룹마다 건수를
// 정한 뒤, 오더 한 건씩 순서대로("다음") 나머지 항목만 입력해 한 번에 등록한다.
// ============================================================
const [multiRegOpen, setMultiRegOpen] = React.useState(false);
const [multiRegStep, setMultiRegStep] = React.useState("setup"); // "setup" | "fill"
const makeMultiRegGroup = () => ({
  key: Math.random().toString(36).slice(2),
  거래처명: "", 상차지명: "", 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "",
  경유상차목록: [],
  query: "", count: 1,
  청구사업자: "", _bizPicked: false, // ⭐ 2026-11-09 다중등록 — 청구 사업자를 먼저 고른다(안 고르면 자동 맞춤)
});
const [multiRegGroups, setMultiRegGroups] = React.useState(() => [makeMultiRegGroup()]);
const [multiRegSlots, setMultiRegSlots] = React.useState([]);
const [multiRegIdx, setMultiRegIdx] = React.useState(0);
const [multiRegDropQuery, setMultiRegDropQuery] = React.useState("");
const [multiRegPickQuery, setMultiRegPickQuery] = React.useState(""); // ⭐ 2026-11-09 상차지는 오더(2단계)에서 입력
const [multiRegVehicleQuery, setMultiRegVehicleQuery] = React.useState("");
const [multiRegSaving, setMultiRegSaving] = React.useState(false);
// ⭐ 팝업을 마우스로 끌어 옮길 수 있게(요청사항) — 헤더를 누른 채 드래그하면
// translate로 위치만 옮기고, 열 때마다 원위치(0,0)로 초기화한다.
const [multiRegPos, setMultiRegPos] = React.useState({ x: 0, y: 0 });
const multiRegDragRef = React.useRef(null); // { startX, startY, baseX, baseY } | null
React.useEffect(() => {
  if (!multiRegOpen) return;
  const onMove = (e) => {
    const d = multiRegDragRef.current;
    if (!d) return;
    setMultiRegPos({ x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) });
  };
  const onUp = () => { multiRegDragRef.current = null; };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}, [multiRegOpen]);
const startMultiRegDrag = (e) => {
  multiRegDragRef.current = { startX: e.clientX, startY: e.clientY, baseX: multiRegPos.x, baseY: multiRegPos.y };
};

// ⭐ 다중등록 전용 오더메모 팝업 — 단일 등록폼의 orderMemoPopup/saveOrderMemo와
// 화면은 완전히 동일하지만, 등록 시점까지 form에 대기시켰다가 반영하는 단일
// 등록폼과 달리 다중등록에는 그런 단일 제출 시점이 없어 선택한 거래처 문서에
// 바로 저장한다.
const [multiRegOrderMemoPopup, setMultiRegOrderMemoPopup] = React.useState(null);
const openMultiRegOrderMemoEditor = (type, groupKey) => {
  const name = (type === "pickup"
    ? currentMultiSlot?.상차지명 || ""
    : currentMultiSlot?.하차지명 || "").trim();
  if (!name) { showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`); return; }
  const found = mergedClients.find(c => normalizeKey(c.업체명 || "") === normalizeKey(name));
  setMultiRegOrderMemoPopup({
    type, groupKey, name,
    memo: found?.오더메모 || "",
    팝업표시: found?.팝업표시 !== undefined ? found.팝업표시 : true,
    notice: found?.기사전달주의사항 !== undefined ? found.기사전달주의사항 : defaultDriverNoticeTemplate(name),
  });
};
const hasMultiRegOrderMemoFor = (type, groupKey) => {
  const name = (type === "pickup"
    ? currentMultiSlot?.상차지명 || ""
    : currentMultiSlot?.하차지명 || "").trim();
  if (!name) return false;
  const found = mergedClients.find(c => normalizeKey(c.업체명 || "") === normalizeKey(name));
  return !!String(found?.오더메모 || "").trim();
};
const saveMultiRegOrderMemo = async (memo, popupShow, notice) => {
  if (!multiRegOrderMemoPopup) return;
  if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
  const { name } = multiRegOrderMemoPopup;
  const clientMatch = (clients || []).find(c => normalizeKey(c.업체명 || c.거래처명) === normalizeKey(name));
  if (clientMatch) {
    upsertClient?.({ id: clientMatch.id, 거래처명: clientMatch.거래처명 || name, 오더메모: memo, 팝업표시: popupShow, 기사전달주의사항: notice }).catch(() => {});
  } else {
    const placeMatch = (placeList || []).find(p => normalizeKey(p.업체명 || "") === normalizeKey(name));
    if (placeMatch) {
      upsertPlace?.({ _id: placeMatch._id, 업체명: placeMatch.업체명, 주소: placeMatch.주소 || "", 오더메모: memo, 팝업표시: popupShow, 기사전달주의사항: notice }).catch(() => {});
    }
  }
  setMultiRegOrderMemoPopup(null);
  showAlert("오더메모가 저장되었습니다.");
};

// 슬롯(오더)을 옮길 때마다 이전 슬롯에서 쓰던 하차지/차량종류 자동완성 검색어가
// 남아있으면 안 되므로 매번 비운다.
React.useEffect(() => {
  setMultiRegDropQuery("");
  setMultiRegPickQuery("");
  setMultiRegVehicleQuery("");
}, [multiRegIdx]);

// ================================================================
// ⭐ 다중등록 전용 "기사 스마트검색" + 차량번호 자동매칭 + 신규기사등록 —
// 단일 등록폼(smartDriverQuery/handleCarNoChange/checkNewDriver)과 완전히
// 동일한 로직을, form이 아니라 "현재 편집 중인 슬롯"에 반영하도록 다시 연결한다.
// ================================================================
const [mrSmartDriverQuery, setMrSmartDriverQuery] = React.useState("");
const [mrSmartDriverMatched, setMrSmartDriverMatched] = React.useState([]);
const [mrSmartDriverActiveIdx, setMrSmartDriverActiveIdx] = React.useState(-1);
const [mrDriverDropdownOpen, setMrDriverDropdownOpen] = React.useState(false);
const [mrDriverCandidates, setMrDriverCandidates] = React.useState([]);
const [mrDriverActive, setMrDriverActive] = React.useState(0);
const [mrDriverConflictPopup, setMrDriverConflictPopup] = React.useState(null);

React.useEffect(() => {
  setMrSmartDriverQuery(""); setMrSmartDriverMatched([]); setMrSmartDriverActiveIdx(-1);
  setMrDriverDropdownOpen(false); setMrDriverCandidates([]); setMrDriverActive(0);
}, [multiRegIdx]);

const applyMultiSlotDriver = (patch) => {
  setMultiRegSlots(prev => prev.map((s, i) => i === multiRegIdx ? { ...s, ...patch } : s));
};

// 📌 차량번호 입력(타이핑) — 기존 기사와 자동매칭, 여러 명이면 드롭다운
const handleMultiRegCarNoChange = (value) => {
  mrDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
  const clean = (value || "").trim().replace(/\s+/g, "");
  if (!clean) {
    applyMultiSlotDriver({ 차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중" });
    setMrDriverDropdownOpen(false);
    return;
  }
  applyMultiSlotDriver({ 차량번호: clean });

  const list = driverMap.get(clean);
  if (list && list.length > 1) {
    setMrDriverCandidates(list);
    setMrDriverActive(0);
    setMrDriverDropdownOpen(true);
    return;
  }
  if (list && list.length === 1) {
    const grade = list[0]?.등급 || list[0]?.grade || list[0]?.상태 || "";
    if (grade === "블랙") setBlackAlert(list[0]);
    else if (shouldShowDriverMemoAlert(list[0])) {
      window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: list[0] }));
    }
    applyMultiSlotDriver({ 차량번호: clean, 이름: list[0].이름 || "", 전화번호: list[0].전화번호 || "", 배차상태: "배차완료" });
    setMrDriverDropdownOpen(false);
    return;
  }
  applyMultiSlotDriver({ 이름: "", 전화번호: "", 배차상태: "배차중" });
  setMrDriverDropdownOpen(false);
};

// 📌 차량번호 확정(Enter/blur) — 매칭되는 기존 기사님이 없으면 신규등록 팝업
const checkMultiRegNewDriver = (carNo) => {
  const clean = (carNo || "").trim().replace(/\s+/g, "");
  if (!clean) return;
  const list = driverMap.get(clean);
  if (!list || list.length === 0) {
    // 스마트검색으로 이미 이름이 세팅돼있으면(=이미 대응됨) 건드리지 않는다.
    if (currentMultiSlot?.이름 && currentMultiSlot.이름.trim()) return;
    const slotKey = multiRegIdx;
    setDriverModal({
      open: true,
      carNo: clean,
      name: "",
      phone: "",
      onConfirm: (info) => {
        setMultiRegSlots(prev => prev.map((s, i) => i === slotKey ? {
          ...s, 차량번호: info.차량번호, 이름: info.이름, 전화번호: info.전화번호, 배차상태: "배차완료",
        } : s));
      },
    });
    applyMultiSlotDriver({ 차량번호: clean, 이름: "", 전화번호: "", 배차상태: "배차중" });
  }
};

// 📌 기사 스마트검색(붙여넣기) — parseDriverText/normD는 단일 등록폼의 것을 그대로 재사용
const handleMultiRegSmartDriverInput = (text) => {
  setMrSmartDriverQuery(text);
  setMrSmartDriverActiveIdx(-1);
  if (!text.trim()) { setMrSmartDriverMatched([]); return; }
  const { phone, plate, name } = parseDriverText(text);
  const results = plate
    ? (drivers || [])
        .filter(d => normD(d.차량번호) === normD(plate))
        .sort((a, b) => {
          const aExact = normD(a.이름) === normD(name) && normD(a.전화번호) === normD(phone);
          const bExact = normD(b.이름) === normD(name) && normD(b.전화번호) === normD(phone);
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        })
    : (name && name.length >= 2)
    ? (drivers || []).filter(d => d.이름 && d.이름.includes(name))
    : smartDigitsMatch(drivers, text, phone);
  setMrSmartDriverMatched(results.slice(0, 8));
  if (!plate && results.length) setMrSmartDriverActiveIdx(0);
};

const selectMultiRegSmartDriver = (d) => {
  const { phone: typedPhone } = parseDriverText(mrSmartDriverQuery);
  if (typedPhone && normD(d.전화번호) !== normD(typedPhone)) {
    setMrSmartDriverQuery(""); setMrSmartDriverMatched([]); setMrSmartDriverActiveIdx(-1);
    setMrDriverConflictPopup({ mode: "phone_diff", existing: d, input: { plate: d.차량번호, name: d.이름, phone: typedPhone } });
    return;
  }
  const grade = d?.등급 || d?.grade || "";
  if (grade === "블랙") setBlackAlert(d);
  else if (shouldShowDriverMemoAlert(d)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: d }));
  applyMultiSlotDriver({ 차량번호: d.차량번호, 이름: d.이름 || "", 전화번호: formatPhone(d.전화번호 || ""), 배차상태: "배차완료" });
  setMrSmartDriverQuery(""); setMrSmartDriverMatched([]); setMrSmartDriverActiveIdx(-1);
};

const handleMultiRegSmartDriverKeyDown = (e) => {
  if (mrSmartDriverMatched.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    setMrSmartDriverActiveIdx(prev => {
      const next = e.key === "ArrowDown" ? prev + 1 : prev - 1;
      if (next < 0) return mrSmartDriverMatched.length - 1;
      if (next >= mrSmartDriverMatched.length) return 0;
      return next;
    });
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (mrSmartDriverMatched.length > 0 && mrSmartDriverActiveIdx >= 0 && mrSmartDriverActiveIdx < mrSmartDriverMatched.length) {
      selectMultiRegSmartDriver(mrSmartDriverMatched[mrSmartDriverActiveIdx]);
    } else if (mrSmartDriverMatched.length > 0 && !parseDriverText(mrSmartDriverQuery).plate) {
      selectMultiRegSmartDriver(mrSmartDriverMatched[0]); // 🛠 2026-11-27 Enter = 첫 번째 기사
    } else {
      applyMultiRegSmartDriverInput(mrSmartDriverQuery);
    }
    return;
  }
  if (e.key === "Escape" && mrSmartDriverMatched.length > 0) {
    e.preventDefault();
    setMrSmartDriverMatched([]); setMrSmartDriverActiveIdx(-1);
  }
};

const applyMultiRegSmartDriverInput = async (text) => {
  if (!text.trim()) return;
  const { phone, plate, name } = parseDriverText(text);
  if (!plate && !name && !phone) return;
  const byPlate = plate ? (drivers || []).filter(d => normD(d.차량번호) === normD(plate)) : [];
  if (byPlate.length > 0) {
    const existing = byPlate[0];
    const sameName = normD(existing.이름) === normD(name);
    const samePhone = normD(existing.전화번호) === normD(phone);
    if (sameName && samePhone) {
      const grade = existing?.등급 || existing?.grade || "";
      if (grade === "블랙") setBlackAlert(existing);
      else if (shouldShowDriverMemoAlert(existing)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: existing }));
      applyMultiSlotDriver({ 차량번호: existing.차량번호, 이름: existing.이름, 전화번호: formatPhone(existing.전화번호), 배차상태: "배차완료" });
      setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
    } else if (sameName && !samePhone) {
      setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
      setMrDriverConflictPopup({ mode: "phone_diff", existing, input: { plate, name, phone } });
    } else if (!sameName && name) {
      setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
      setMrDriverConflictPopup({ mode: "name_diff", existing, input: { plate, name, phone } });
    } else {
      const grade = existing?.등급 || existing?.grade || "";
      if (grade === "블랙") setBlackAlert(existing);
      else if (shouldShowDriverMemoAlert(existing)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: existing }));
      applyMultiSlotDriver({ 차량번호: existing.차량번호, 이름: existing.이름, 전화번호: formatPhone(existing.전화번호), 배차상태: "배차완료" });
      setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
    }
    return;
  }
  if (plate || name || phone) {
    applyMultiSlotDriver({ 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태: plate ? "배차완료" : "배차중" });
    setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
  }
};

// 📌 기사명/전화번호를 손으로 직접 고쳐 적었을 때(blur) — 단일 등록폼의
// checkDriverConflict()와 동일하게, 차량번호는 있는데 매칭되는 기사님이 없으면
// 신규등록 확인을, 있는데 이름/전화번호가 다르면 충돌 확인을 띄운다.
const checkMultiRegDriverConflict = () => {
  const s = currentMultiSlot;
  if (!s) return;
  const plate = (s.차량번호 || "").trim().replace(/\s+/g, "");
  const name = (s.이름 || "").trim();
  const phone = (s.전화번호 || "").replace(/[^\d]/g, "");
  if (!plate || !name) return;
  const list = driverMap.get(plate);
  if (!list || list.length === 0) {
    if (name && phone) {
      setMrDriverConflictPopup({ mode: "new_driver", existing: null, input: { plate, name, phone: formatPhone(phone) } });
    }
    return;
  }
  // ⭐ 2026-11-05 같은 차량번호 기사 여러 명 — 누구와든 같으면 정상, 다르면 가장 가까운 실제 문서와 비교
  if (isRegisteredCombo(drivers, plate, name, phone)) return;
  const existing = pickDriverFor(drivers, plate, name, phone) || list[0];
  const existName = (existing.이름 || "").trim();
  const existPhone = (existing.전화번호 || "").replace(/[^\d]/g, "");
  const sameName = existName === name;
  const samePhone = existPhone === phone;
  if (sameName && samePhone) return;
  if (!sameName || !samePhone) {
    setMrDriverConflictPopup({ mode: !sameName ? "name_diff" : "phone_diff", existing, input: { plate, name, phone: formatPhone(phone) } });
  }
};

const filterMultiRegClients = (q) => {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return [];
  return mergedClients.filter(c => (c.업체명 || "").toLowerCase().includes(query)).slice(0, 15);
};

const openMultiRegister = () => {
  setMultiRegGroups([makeMultiRegGroup()]);
  setMultiRegStep("setup");
  setMultiRegSlots([]);
  setMultiRegIdx(0);
  setMultiRegPos({ x: 0, y: 0 });
  setMultiRegOpen(true);
};

const applyMultiRegGroupClient = (groupKey, clientRec) => {
  // ⭐ 2026-11-09 거래처명은 거래처명에만 — 상차지는 다음 단계에서 오더마다 따로 입력한다
  setMultiRegGroups(prev => prev.map(g => g.key === groupKey ? {
    ...g,
    거래처명: clientRec.업체명,
    query: clientRec.업체명,
  } : g));
  // 등급(블랙/주의/이탈)·메모 안내 팝업은 그대로 띄운다
  const alertTarget = getAlertTargetForSelectedPlace(clientRec);
  showClientAlertChain(
    alertTarget ? [{ ...alertTarget, 업체명: alertTarget.업체명 || alertTarget.거래처명 || clientRec.업체명 }] : [],
    { contactItems: [], finalFocusId: null }
  );
};

const makeMultiRegSlot = (group) => ({
  거래처명: group.거래처명, 상차지명: group.상차지명, 상차지주소: group.상차지주소,
  상차지담당자: group.상차지담당자, 상차지담당자번호: group.상차지담당자번호,
  경유상차목록: group.경유상차목록 || [],
  상차일: _todayStr(), 상차시간: "",
  하차지명: "", 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "",
  경유하차목록: [],
  하차일: "", 하차시간: "",
  상차방법: "", 하차방법: "",
  차량종류: "",
  화물타입: "파레트", 화물수량: "",
  톤수타입: "톤", 톤수값: "",
  운행유형: "편도",
  지급방식: "", 배차방식: "",
  차량번호: "", 이름: "", 전화번호: "",
  청구운임: "", 기사운임: "", 수수료: "",
  메모: "",
  긴급: false,
  _groupKey: group.key, _groupLabel: group.거래처명,
  청구사업자: group.청구사업자 || "", _bizPicked: !!group._bizPicked,
});

const startMultiRegisterFill = () => {
  const validGroups = multiRegGroups.filter(g => g.거래처명.trim());
  if (!validGroups.length) { showAlert("거래처를 1개 이상 선택하세요."); return; }
  const slots = validGroups.flatMap(g =>
    Array.from({ length: Math.max(1, Math.min(30, Number(g.count) || 1)) }, () => makeMultiRegSlot(g))
  );
  setMultiRegSlots(slots);
  setMultiRegIdx(0);
  setMultiRegStep("fill");
};

const updateMultiSlot = (key, value) => {
  setMultiRegSlots(prev => prev.map((s, i) => {
    if (i !== multiRegIdx) return s;
    // ⭐ 3파트 등록폼과 동일한 규칙: 상차방법을 바꾸면(하차방법이 비어있거나
    // 지금까지 상차방법과 같았다면) 하차방법도 같이 따라간다.
    if (key === "상차방법") {
      const autoSync = !s.하차방법 || s.하차방법 === s.상차방법;
      return { ...s, 상차방법: value, 하차방법: autoSync ? value : s.하차방법 };
    }
    if (key === "차량종류" && value === "오토바이") {
      return { ...s, 차량종류: value, 상차방법: "수작업", 하차방법: "수작업" };
    }
    // ⭐ 리프트 차량 선택 시 상/하차방법 기본값 제안 — 이미 다른 값을 골라둔 경우는 덮지 않음
    if (key === "차량종류" && value === "리프트") {
      return { ...s, 차량종류: value, 상차방법: s.상차방법 || "리프트", 하차방법: s.하차방법 || "리프트" };
    }
    // ⭐ 자동완성으로 채워둔 하차지명을 사용자가 지우면, 남아있는 주소/담당자도
    // 같이 비워야 한다(상차지명 handlePickupName과 동일한 규칙).
    if (key === "하차지명" && value.trim() === "") {
      return { ...s, 하차지명: "", 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "" };
    }
    if (key === "상차지명" && value.trim() === "") {
      return { ...s, 상차지명: "", 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "" };
    }
    // ⭐ 3파트 등록폼과 동일: 청구운임/기사운임을 입력할 때마다 수수료(차액)를
    // 자동으로 다시 계산한다.
    // ⭐ 2026-11-02 운임규칙 — 다중등록도 운임구분 → 기사운임·수수료 자동
    if (fareOn && (key === "운임구분" || key === "청구운임" || key === "기사운임" || key === "운임구분수수료율" || key === "__reapply")) {
      return fareFormChange(s, key, value, fareR.rules);
    }
    if (key === "청구운임" || key === "기사운임") {
      const next = { ...s, [key]: value };
      const sale = parseInt(next.청구운임 || 0, 10) || 0;
      const drv = parseInt(next.기사운임 || 0, 10) || 0;
      next.수수료 = String(sale - drv);
      return forkliftApply(s, next, key);
    }
    return { ...s, [key]: value };
  }));
};

// ⭐ 2026-11-09 다중등록 상차지(오더마다) — 하차지와 같은 방식
const applyMultiSlotPickup = (place) => {
  setMultiRegSlots(prev => prev.map((s, i) => i === multiRegIdx ? {
    ...s,
    상차지명: place.업체명, 상차지주소: place.주소 || "",
    상차지담당자: primaryContactOf(place)?.name || "", 상차지담당자번호: primaryContactOf(place)?.phone || "",
  } : s));
  const alertTarget = getAlertTargetForSelectedPlace(place);
  const contacts = (place.contacts || []).filter(c => c.name?.trim());
  const uniqueContacts = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
  const contactItems = uniqueContacts.length > 1
    ? [{ type: "pickup", place, contacts: uniqueContacts, __multiReg: "pickup" }]
    : [];
  showClientAlertChain(
    alertTarget ? [{ ...alertTarget, 업체명: alertTarget.업체명 || alertTarget.거래처명 || place.업체명 }] : [],
    { contactItems, finalFocusId: "mr-drop-input" }
  );
};

const applyMultiSlotDrop = (place) => {
  setMultiRegSlots(prev => prev.map((s, i) => i === multiRegIdx ? {
    ...s,
    하차지명: place.업체명, 하차지주소: place.주소 || "",
    하차지담당자: primaryContactOf(place)?.name || "", 하차지담당자번호: primaryContactOf(place)?.phone || "",
  } : s));

  // ⭐ 하차지도 상차지와 동일하게: 담당자 여러 명이면 선택 팝업, 등급/메모가
  // 있으면 안내 팝업을 띄운다.
  const alertTarget = getAlertTargetForSelectedPlace(place);
  const contacts = (place.contacts || []).filter(c => c.name?.trim());
  const uniqueContacts = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
  const contactItems = uniqueContacts.length > 1
    ? [{ type: "drop", place, contacts: uniqueContacts, __multiReg: "drop" }]
    : [];
  showClientAlertChain(
    alertTarget ? [{ ...alertTarget, 업체명: alertTarget.업체명 || alertTarget.거래처명 || place.업체명 }] : [],
    { contactItems, finalFocusId: null }
  );
};

const currentMultiSlot = multiRegSlots[multiRegIdx] || null;

const goMultiRegNext = async () => {
  if (!(await mrDrvEdit.finish(currentMultiSlot || {}))) return; // ⭐ 2026-11-05 [수정] 중이면 먼저 변경/별도추가 선택
  const slot = multiRegSlots[multiRegIdx];
  if (!slot?.상차지명?.trim()) { showAlert("상차지를 입력하세요."); return; }
  if (!slot?.하차지명?.trim()) { showAlert("하차지를 입력하세요."); return; }
  if (isReversedDateOrder(slot.상차일, slot.하차일 || slot.상차일)) { showAlert(REVERSED_DATE_ORDER_MSG); return; }
  if (multiRegIdx < multiRegSlots.length - 1) {
    // ⭐ 2026-11-09 같은 거래처의 다음 오더는 상차지가 비어 있으면 방금 입력한 상차지를 그대로 이어 쓴다(수정 가능)
    const ni = multiRegIdx + 1;
    setMultiRegSlots(prev => prev.map((x, i) => (i === ni && x._groupKey === slot._groupKey && !String(x.상차지명 || "").trim()) ? {
      ...x,
      상차지명: slot.상차지명, 상차지주소: slot.상차지주소, 상차지담당자: slot.상차지담당자, 상차지담당자번호: slot.상차지담당자번호,
      경유상차목록: slot.경유상차목록 || [],
    } : x));
    setMultiRegIdx(ni);
  }
};
const goMultiRegPrev = async () => { if (!(await mrDrvEdit.finish(currentMultiSlot || {}))) return; if (multiRegIdx > 0) setMultiRegIdx(i => i - 1); }; // ⭐ 2026-11-05

const submitMultiRegister = async () => {
  if (!(await mrDrvEdit.finish(currentMultiSlot || {}))) return; // ⭐ 2026-11-05 [수정] 중이면 먼저 변경/별도추가 선택
  const slot = multiRegSlots[multiRegIdx];
  if (!slot?.하차지명?.trim()) { showAlert("하차지를 입력하세요."); return; }
  { const mi = multiRegSlots.findIndex(x => !String(x.상차지명 || "").trim()); if (mi >= 0) { setMultiRegIdx(mi); showAlert(`${mi + 1}번째 오더의 상차지를 입력하세요.`); return; } }
  for (const s of multiRegSlots) {
    if (isReversedDateOrder(s.상차일, s.하차일 || s.상차일)) { showAlert(REVERSED_DATE_ORDER_MSG); return; }
  }
  setMultiRegSaving(true);
  try {
    const _mrResults = await Promise.allSettled(multiRegSlots.map(s => {
      const 화물내용 = s.화물수량 ? `${s.화물수량}${s.화물타입 || ""}` : "";
      const 차량톤수 = s.톤수값 ? `${s.톤수값}${s.톤수타입 || ""}` : "";
      // ⭐ 단일 등록폼과 동일: 스마트검색 등으로 아직 기사관리에 없는 차량번호+
      // 기사명이 입력돼있으면, 실제 오더 저장과 함께 조용히 신규 기사로도
      // upsert한다(이미 있는 차량번호면 건드리지 않음).
      if (s.차량번호 && s.이름) {
        const existing = driverMap.get(String(s.차량번호).replace(/\s+/g, ""));
        if (!existing || existing.length === 0) {
          upsertDriver({ 차량번호: s.차량번호, 이름: s.이름, 전화번호: s.전화번호 }).catch(() => {});
        }
      }
      // ⭐ 사용자 요청 — 단일 등록폼(doSave)과 동일하게, 다중등록 슬롯에도 지입
      // 기사 차량번호가 이미 입력돼 있으면 기사확인상태를 "대기"로 걸어 기사
      // 앱에서 오더수락/거절 알림(+푸시)이 뜨게 한다. 이 함수는 addDispatch를
      // 직접 호출하는 별도 등록 경로라 doSave의 처리를 그대로 복제해야 한다 —
      // 안 그러면 다중등록으로 지입 기사를 배정한 오더는 푸시가 안 간다.
      let 슬롯기사확인상태 = {};
      if (s.차량번호) {
        const assignedDriverMR = drivers.find(d => normalizePlate(d.차량번호) === normalizePlate(s.차량번호));
        if (isFleetGrade(assignedDriverMR?.등급) && !!assignedDriverMR.uid) { // ⭐ 2026-11-02 기사앱 가입한 지입 기사만 승인대기
          슬롯기사확인상태 = { 기사확인상태: "대기" };
          addDoc(collection(db, "driver_notifications"), {
            driverId: assignedDriverMR.id,
            type: "new_order",
            orderId: null,
            title: "배차오더가 도착했습니다",
            body: `${s.거래처명 || ""} ${s.상차지명 || "-"} → ${s.하차지명 || "-"}`,
            createdAt: serverTimestamp(),
            read: false,
          }).catch(() => {});
        }
      }
      // ⭐ emptyForm을 기반으로 스프레드해야 한다 — 그리드/목록 화면 곳곳이
      // 경유상차목록/경유하차목록/근무일자목록 같은 배열 필드가 항상 존재한다고
      // 가정하고 그대로 .map()을 돌리는 경우가 있어(단일 등록폼은 emptyForm을
      // 기반으로 하니 항상 채워져 있었음), 이 필드들이 아예 없는 채로 저장하면
      // 방금 등록한 오더가 목록에 반영되는 순간 "Cannot read properties of
      // undefined (reading 'map')" 에러가 난다.
      return addDispatch({
        ...emptyForm,
        ...(dmBiz.multi && s._bizPicked ? (s.청구사업자 && s.청구사업자 !== dmBiz.defaultName ? { 청구사업자: s.청구사업자 } : {}) : {}), // ⭐ 2026-11-09 1단계에서 고른 청구 사업자 우선
        ...(dmBiz.multi && !s._bizPicked ? (() => { const bc = (clients || []).find((c) => normBizKey(c.거래처명 || "") === normBizKey(s.거래처명 || "")); const r = resolveBiz(dmBiz, { client: s.거래처명, pickup: s.상차지명, drop: s.하차지명, clientDefault: bc?.기본사업자 || "" }); return r.name !== dmBiz.defaultName ? { 청구사업자: r.name } : {}; })() : {}), // ⭐ 2026-11-03 청구 사업자 — 같은 구간 기억 → 거래처 기억 → 거래처 기본 사업자
        거래처명: s.거래처명, 상차지명: s.상차지명, 상차지주소: s.상차지주소,
        상차지담당자: s.상차지담당자, 상차지담당자번호: s.상차지담당자번호,
        경유상차목록: s.경유상차목록 || [], 경유지_상차: s.경유상차목록 || [],
        하차지명: s.하차지명, 하차지주소: s.하차지주소,
        하차지담당자: s.하차지담당자, 하차지담당자번호: s.하차지담당자번호,
        경유하차목록: s.경유하차목록 || [], 경유지_하차: s.경유하차목록 || [],
        상차일: s.상차일 || _todayStr(), 상차시간: s.상차시간 || "",
        하차일: s.하차일 || s.상차일 || _todayStr(), 하차시간: s.하차시간 || "",
        상차방법: s.상차방법 || "", 하차방법: s.하차방법 || "",
        차량종류: s.차량종류 || "", 차량톤수,
        화물타입: s.화물타입 || "", 화물내용,
        운행유형: s.운행유형 || "편도",
        지급방식: s.지급방식 || "", 배차방식: s.배차방식 || "",
        차량번호: s.차량번호 || "", 이름: s.이름 || "", 전화번호: s.전화번호 || "",
        청구운임: s.청구운임 || "", 기사운임: s.기사운임 || "",
        // 🏗 2026-11-12 다중등록 [특수운임 적용](지게차 등)이 저장되지 않던 문제 — 슬롯에 적용한 칸을 그대로 넣고, 수수료 = 청구 − 기사 − 회사가 따로 주는 돈
        ...Object.fromEntries(MULTI_SPECIAL_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])),
        수수료: String((parseInt(s.청구운임 || 0, 10) || 0) - (parseInt(s.기사운임 || 0, 10) || 0) - paidOut(s)),
        메모: s.메모 || "",
        긴급: !!s.긴급,
        혼적: !!s.혼적, 독차: dokchaOn({ 혼적: !!s.혼적, 운행유형: s.운행유형 || "편도" }), // 🚚 2026-11-09 다중등록 혼적
        배차상태: s.지급방식 === "취소" ? "배차취소" : (슬롯기사확인상태.기사확인상태 === "대기" ? "승인대기" : (s.차량번호?.trim() ? "배차완료" : "배차중")),
        ...(fareOn ? farePatchOf(s) : {}), // ⭐ 2026-11-02 운임규칙
        등록일: _todayStr(),
        ...슬롯기사확인상태,
      });
    }));
    // ⭐ 2026-11-09 일부만 실패·취소돼도 "N건 등록"으로 보이고, 다시 누르면 성공한 건까지 중복 등록되던 문제 — 건수를 나눠 알린다
    const _mrOk = _mrResults.filter(r => r.status === "fulfilled" && r.value !== false).length;
    const _mrErr = _mrResults.find(r => r.status === "rejected");
    if (_mrOk === multiRegSlots.length) { setMultiRegOpen(false); showAlert(`${_mrOk}건 등록되었습니다.`); }
    else if (_mrOk > 0) { setMultiRegOpen(false); showAlert(`${_mrOk}건만 등록되었습니다(${multiRegSlots.length - _mrOk}건 실패·취소${_mrErr ? `: ${_mrErr.reason?.message || _mrErr.reason}` : ""}). 중복되지 않게 배차현황에서 확인 후 빠진 건만 다시 등록해 주세요.`); }
    else if (_mrErr) { showAlert("등록 중 오류가 발생했습니다: " + (_mrErr.reason?.message || _mrErr.reason)); }
  } catch (e) {
    showAlert("등록 중 오류가 발생했습니다: " + (e?.message || e));
  } finally {
    setMultiRegSaving(false);
  }
};

// 🏗 다중등록 슬롯에서 저장할 지게차 · 특수운임 칸(src/forkliftCore.js 칸 설명)
const MULTI_SPECIAL_KEYS = ["지게차비용", "지게차부담", "지게차기사ID", "지게차기사명", "지게차기사전화", "지게차회사", "지게차기사차감", "지게차청구추가", "특수운임", "특수기사차감", "특수청구추가", "외부지급합"];
const mrLabelCls = "flex items-center h-[20px] overflow-visible text-[13px] font-semibold text-gray-700 mb-1";
const mrInputCls = "w-full border-0 border-b-2 border-gray-300 rounded-none px-1 py-2 text-[13px] font-bold text-gray-900 bg-transparent focus:outline-none focus:border-[#1B2B4B] transition";
const mrTextareaCls = "w-full border-0 border-b-2 border-gray-300 rounded-none px-1 py-2 text-[13px] font-bold text-gray-900 bg-transparent resize-none focus:outline-none focus:border-[#1B2B4B] transition";

React.useEffect(() => {
  const pickup = normalizeKey(form.상차지명);
  const drop   = normalizeKey(form.하차지명);
  const ton    = getTotalTonFromOrder(form);

  if (!pickup || !drop || !ton) {
    setFareCompare({ sale: null, driver: null });
    return;
  }

  const similar = (dispatchData || []).filter(r =>
    normalizeKey(r.상차지명) === pickup &&
    normalizeKey(r.하차지명) === drop &&
    getTotalTonFromOrder(r) === ton &&
    r.청구운임 &&
    r.기사운임
  );

  if (similar.length === 0) {
    setFareCompare({ sale: null, driver: null });
    return;
  }

  const avg = arr =>
    Math.round(arr.reduce((a,b)=>a+b,0) / arr.length);

  const saleAvg = avg(similar.map(r =>
    Number(String(r.청구운임).replace(/[^\d]/g,""))
  ));

  const driverAvg = avg(similar.map(r =>
    Number(String(r.기사운임).replace(/[^\d]/g,""))
  ));

  const inputSale = Number(form.청구운임 || 0);
  const inputDriver = Number(form.기사운임 || 0);

  const compare = (input, avg) => {
    if (!input) return null;
    const diffRate = (input - avg) / avg;

    if (Math.abs(diffRate) < 0.05) return "similar";
    if (diffRate > 0) return "high";
    return "low";
  };

  setFareCompare({
    sale: compare(inputSale, saleAvg),
    driver: compare(inputDriver, driverAvg),
  });

}, [
  form.상차지명,
  form.하차지명,
  form.차량톤수,
  form.청구운임,
  form.기사운임,
  dispatchData,
]);
// ===============================
// 🤖 AI 설명 문장 생성
// ===============================
function makeAiExplain(ai) {
  if (!ai) return "";

  // ① 운임 미입력
  if (!ai.hasInputFare) {
    return (
      `동일한 상/하차지·톤수로 최근 ${ai.sampleCount}건이 배차됐어요. ` +
      `평균 ${ai.fareAvg.toLocaleString()}원, 적정 범위는 ` +
      `${ai.fareMin.toLocaleString()}~${ai.fareMax.toLocaleString()}원이에요.`
    );
  }

  // ② 이상치
  if (ai.isOutlier) {
    const dir = ai.fareDiffPercent > 0 ? "높아요" : "낮아요";
    return (
      `입력하신 청구운임이 최근 평균(${ai.fareAvg.toLocaleString()}원)보다 ` +
      `${Math.abs(ai.fareDiffPercent)}% ${dir}. 거래처 협의 내용을 한 번 더 확인해보세요.`
    );
  }

  // ③ 정상
  return (
    `입력하신 청구운임이 최근 평균(${ai.fareAvg.toLocaleString()}원)과 ` +
    `비슷한 적정 범위예요. 이대로 진행하셔도 좋습니다.`
  );
}
    // =====================
    // ⭐ 거래처 자동완성 — 기본거래처(clients)만 대상으로 한다. 하차지거래처(places)는
    // 배송지 주소록일 뿐 회사명 목록이 아니라서, 여기에 섞이면 관련 없는 하차지명이
    // 거래처 드롭다운에 함께 뜨는 원인이 된다.
    // =====================
    const norm = (s = "") => String(s).trim().toLowerCase();

    const basicClientsOnly = React.useMemo(() => {
      return (clients || [])
        .map(c => {
          const name = c.업체명 || c.거래처명 || "";
          if (!name) return null;
          return {
            업체명: name,
            주소: c.주소 || "",
            담당자: c.담당자 || "",
            담당자번호: c.연락처 || c.담당자번호 || "",
            메모: c.메모 || "",
            등급: c.등급 || "일반",
            등급변경일: c.등급변경일 || null,
          };
        })
        .filter(Boolean);
    }, [clients]);

    const filteredClients = React.useMemo(() => {
  const q = norm(clientQuery);
  if (!q) return basicClientsOnly;

  const nq = normalizeKey(q);

  return basicClientsOnly
    .map(p => {
      const name = p.업체명 || "";
      const nName = norm(name);
      const nk = normalizeKey(name);

      let score = 0;

      // 1️⃣ 완전 동일
      if (name === clientQuery) score = 100;
      // 2️⃣ normalizeKey 동일
      else if (nk === nq) score = 90;
      // 3️⃣ 시작 문자열
      else if (nName.startsWith(q)) score = 80;
      // 4️⃣ normalizeKey 시작
      else if (nk.startsWith(nq)) score = 70;
      // 5️⃣ 포함
      else if (nName.includes(q)) score = 60;
      else if (nk.includes(nq)) score = 50;
      else score = 0;

      return { ...p, __score: score };
    })
    .filter(p => p.__score > 0)
    .sort((a, b) => b.__score - a.__score);
}, [clientQuery, basicClientsOnly]);
const focusById = (id) => {
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.focus();
  if (typeof el.select === "function") el.select();
  return true;
};

// ⭐ 2026-11-03 청구 사업자 자동 맞춤 — 거래처·상차지·하차지가 채워질 때마다(직접 입력·거래처 선택·오더스캔·오더복사 모두)
//    1) 같은 구간으로 지난번에 저장한 사업자 2) 복사한 오더의 사업자 3) 그 거래처로 마지막에 쓴 사업자 4) 거래처 기본 사업자 5) 기본 사업자
//    · 사용자가 직접 고르면 거래처가 바뀌기 전까지는 건드리지 않는다
const bizManualRef = React.useRef(null); // { client: 고를 때의 거래처 키 } — 직접 고른 상태
const bizSeedRef = React.useRef("");     // 오더복사로 가져온 오더의 청구 사업자
const [bizAutoSrc, setBizAutoSrc] = React.useState("");
const bizClientDefault = React.useCallback((name) => {
  const k = normBizKey(name); if (!k) return "";
  return (clients || []).find((c) => normBizKey(c.거래처명 || "") === k)?.기본사업자 || "";
}, [clients]);
React.useEffect(() => {
  if (!dmBiz.multi) return;
  const c = form.거래처명 || "", p = form.상차지명 || "", d = form.하차지명 || "";
  if (!c.trim() && !p.trim() && !d.trim()) { bizManualRef.current = null; bizSeedRef.current = ""; setBizAutoSrc(""); return; }
  const man = bizManualRef.current;
  if (man && (man.client === "" || man.client === normBizKey(c))) return;
  bizManualRef.current = null;
  const r = resolveBiz(dmBiz, { client: c, pickup: p, drop: d, seed: bizSeedRef.current, clientDefault: bizClientDefault(c) });
  const v = r.name === dmBiz.defaultName ? "" : r.name;
  setForm((prev) => ((prev.청구사업자 || "") === v ? prev : { ...prev, 청구사업자: v }));
  setBizAutoSrc(r.src === "default" ? "" : r.src);
}, [dmBiz, form.거래처명, form.상차지명, form.하차지명, bizClientDefault]);
const pickBizManual = (v) => {
  bizManualRef.current = { client: normBizKey(form.거래처명 || "") };
  setBizAutoSrc("");
  setForm((p) => ({ ...p, 청구사업자: v }));
};

// ⭐ 거래처 선택 시 → 어디에 적용할지 팝업 오픈
function applyClientSelect(name) {
  // 하차지거래처(placeList)뿐 아니라 기본거래처(clients)에만 있는 업체도
  // 주소/담당자/연락처가 채워지도록 두 컬렉션을 합친 mergedClients에서 찾는다
  const p = mergedClients.find(
    x => norm(x.업체명 || "") === norm(name)
  );
  // ⭐ 2026-11-03 여러 사업자 — 청구 사업자는 아래 자동 맞춤(useEffect)이 거래처·상차지·하차지를 보고 정한다
  // ⭐ 2026-11-09 거래처명은 거래처명에만 입력 — 상차지명/주소/담당자로 자동 복사하지 않는다
  setForm(prev => ({ ...prev, 거래처명: p ? p.업체명 : name }));

  setClientQuery(name);
  setIsClientOpen(false);
 // 자동매칭 뱃지 상태 초기화

  // 거래처명에 입력/선택한 뒤에는 뜬 팝업(메모/등급 안내, 담당자 선택)이 있든 없든
  // 항상 상차지명으로 포커스가 돌아온다(하차지로 건너뛰지 않음).
  const alertTarget = findClientAlertTarget(name);
  const contactItems = []; // ⭐ 2026-11-09 상차지 자동입력을 없앴으므로 상차 담당자 선택 팝업도 띄우지 않는다
  showClientAlertChain(
    alertTarget ? [{ ...alertTarget, 업체명: alertTarget.업체명 || alertTarget.거래처명 || name }] : [],
    { contactItems, finalFocusId: "pickup-place-input", alwaysFocus: true }
  );
}
// ⭐ 상차지에 적용
function applyToPickup(place) {
  setForm(prev => ({
    ...prev,
    거래처명: place.업체명,
    상차지명: place.업체명,
    상차지주소: place.주소 || "",
    상차지담당자: primaryContactOf(place)?.name || "",
    상차지담당자번호: primaryContactOf(place)?.phone || "",
  }));

}

// ⭐ 하차지에 적용 (applyToPickup 바로 아래)
function applyToDrop(place) {

  setForm(prev => ({
    ...prev,
    거래처명: place.업체명,
    하차지명: place.업체명,
    하차지주소: place.주소,
    하차지담당자: place.담당자 || "",
하차지담당자번호: place.담당자번호 || "",
  }));

}
// 🔁 상차지 ↔ 하차지 교체
function swapPickupDrop() {
  setForm(prev => ({
    ...prev,

    // 상차 ← 하차
    상차지명: prev.하차지명,
    상차지주소: prev.하차지주소,
    상차지담당자: prev.하차지담당자,
    상차지담당자번호: prev.하차지담당자번호,
    상차시간: prev.하차시간,
    상차시간기준: prev.하차시간기준,

    // 하차 ← 상차
    하차지명: prev.상차지명,
    하차지주소: prev.상차지주소,
    하차지담당자: prev.상차지담당자,
    하차지담당자번호: prev.상차지담당자번호,
    하차시간: prev.상차시간,
    하차시간기준: prev.상차시간기준,
  }));

  // 자동매칭 뱃지 리셋
  setAutoPickMatched(false);
  setAutoDropMatched(false);
}
    // ✅ 주소 자동매칭 뱃지
    const [autoPickMatched, setAutoPickMatched] = React.useState(false);
    const [autoDropMatched, setAutoDropMatched] = React.useState(false);

    const onChange = (key, value) => {
      // ⭐ 2026-11-02 운임규칙 — 운임구분·청구운임·기사운임 → 규칙대로 기사운임·수수료 자동 계산(기사운임을 직접 고치면 유지)
      if (fareOn && canMoney && (key === "운임구분" || key === "청구운임" || key === "기사운임" || key === "운임구분수수료율" || key === "__reapply")) {
        setForm((p) => fareFormChange(p, key, value, fareR.rules)); // 🏗 지게차비용은 fareFormChange 안에서 같이 맞춤
        return;
      }
      if (canMoney && (key === "청구운임" || key === "기사운임")) {
        setForm((p) => {
          const next = { ...p, [key]: value };
          const sale = parseInt(next.청구운임 || 0, 10) || 0;
          const drv = parseInt(next.기사운임 || 0, 10) || 0;
          next.수수료 = String(sale - drv);
          return forkliftApply(p, next, key); // 🏗 지게차비용(수익 = 청구 − 기사 − 지게차)
        });
        return;
      }
      if (key === "상차방법") {
        setForm((p) => {
          const autoSync = !p.하차방법 || p.하차방법 === p.상차방법;
          return { ...p, 상차방법: value, 하차방법: autoSync ? value : p.하차방법 };
        });
        return;
      }
      if (key === "복수근무일") {
        // ⭐ 묶음 오더 토글 — 끄면 그동안 골라둔 근무일 목록은 비운다(다시 켜면
        // 처음부터 다시 고르는 게 맞다 — 상/하차일은 그대로 남겨서 헷갈리지 않게 함).
        setForm((p) => ({ ...p, 복수근무일: value, 근무일자목록: value ? p.근무일자목록 : [] }));
        return;
      }
      if (key === "차량종류" && value === "오토바이") {
        setForm((p) => ({ ...p, 차량종류: value, 상차방법: "수작업", 하차방법: "수작업", 배차방식: "인성" }));
        return;
      }
      // ⭐ 리프트 차량 선택 시 상/하차방법 기본값 제안 — 사용자가 이미 다른 값을
      // 골라둔 경우(다른 경유지용으로 의도적으로 고른 값일 수 있음)는 덮어쓰지 않음
      if (key === "차량종류" && value === "리프트") {
        setForm((p) => ({ ...p, 차량종류: value, 상차방법: p.상차방법 || "리프트", 하차방법: p.하차방법 || "리프트" }));
        return;
      }
      setForm((p) => ({ ...p, [key]: value }));
    };

    // ⭐ 묶음 오더의 근무일 다중선택 — 달력에서 날짜를 하나씩 클릭할 때마다
    // 켜고/끄고를 토글한다. 상차일/하차일은 이 목록의 최솟값/최댓값으로 항상
    // 자동 연동해서, 기존에 상차일~하차일만 보고 동작하는 다른 로직(정렬·필터
    // 등)이 그대로 잘 맞물리게 한다.
    const toggleWorkDate = (dateStr) => {
      if (!dateStr) return;
      setForm((p) => {
        // ⚠️ Firestore에서 방금 불러온(오더복사/수정) p.근무일자목록은 배열이 아니라
        // {0:"...",1:"..."} 형태의 객체일 수 있다 — _parseWorkDates로 반드시 정규화.
        const set = new Set(_parseWorkDates(p.근무일자목록));
        if (set.has(dateStr)) set.delete(dateStr);
        else set.add(dateStr);
        const sorted = Array.from(set).sort();
        return {
          ...p,
          근무일자목록: sorted,
          상차일: sorted[0] || p.상차일,
          하차일: sorted[sorted.length - 1] || p.하차일,
        };
      });
    };

    // ⭐ 드롭다운에서 거래처를 선택하면 주소/담당자가 자동으로 채워지는데, 사용자가
    // 그 이름을 다시 지우면(빈 값) 매칭되어 있던 주소/담당자 정보도 같이 초기화한다
    // — 안 그러면 상차지명은 비어있는데 예전 거래처의 주소/담당자만 남아있는
    // 어긋난 상태가 된다.
    const handlePickupName = (value) => {
      setForm((p) => ({
        ...p,
        상차지명: value,
        ...(value.trim() === "" && { 상차지주소: "", 상차지담당자: "", 상차지담당자번호: "" }),
      }));
      setAutoPickMatched(false);
    };
    const handleDropName = (value) => {
      setForm((p) => ({
        ...p,
        하차지명: value,
        ...(value.trim() === "" && { 하차지주소: "", 하차지담당자: "", 하차지담당자번호: "" }),
      }));
      setAutoDropMatched(false);
    };

    const handlePickupAddrManual = (v) => { setForm((p) => ({ ...p, 상차지주소: v })); setAutoPickMatched(false); };
    const handleDropAddrManual = (v) => { setForm((p) => ({ ...p, 하차지주소: v })); setAutoDropMatched(false); };

    // 🚗 차량번호 입력 → 항상 수정 가능 + 자동 기사정보 입력
    const driverMap = React.useMemo(() => {
  const m = new Map();

  (drivers || []).forEach((d) => {
    const key = String(d.차량번호 || "").replace(/\s+/g, "");
    if (!key) return;

    if (!m.has(key)) {
      m.set(key, []);
    }

       m.get(key).push({
      이름: d.이름 || "",
      전화번호: d.전화번호 || "",
      등급: d.등급 || d.grade || "",
      메모: d.메모 || "",
      차량번호: d.차량번호 || "",
    });
  });

  return m;
}, [drivers]);
const [blackAlert, setBlackAlert] = React.useState(null);
const [memoAlert, setMemoAlert] = React.useState(null);
const notificationsEnabled = useNotificationsEnabled();
const _menuRef = React.useRef(menu);
React.useEffect(() => { _menuRef.current = menu; }, [menu]);
React.useEffect(() => {
  const h = (e) => {
    if (_menuRef.current !== "배차관리") return;
    setMemoAlert(e.detail);
  };
  window.addEventListener("driverMemoDetected", h);
  return () => window.removeEventListener("driverMemoDetected", h);
}, []);
const [contactPopup, setContactPopup] = React.useState(null);
const [contactActive, setContactActive] = React.useState(0);
const [contactQueue, setContactQueue] = React.useState([]);
const [editingContactIdx, setEditingContactIdx] = React.useState(null);
const [editContactData, setEditContactData] = React.useState({ name: "", phone: "" });
const [contactSearchQ, setContactSearchQ] = React.useState("");
const contactSearchInputRef = React.useRef(null);
const contactListRef = React.useRef(null);
// 방향키(←/→)로 활성 카드가 바뀌면, 담당자가 많아 가로 스크롤이 생겼을 때도
// 항상 활성 카드가 보이는 위치로 자동 스크롤한다. 컨테이너 자체에 position이
// 없으면(static) offsetLeft가 이 리스트 기준이 아니라 더 바깥 조상 기준으로
// 계산돼 스크롤 위치가 엉뚱하게 튀었다 — relative를 반드시 함께 줘야 한다.
React.useEffect(() => {
  const list = contactListRef.current;
  if (!list) return;
  const item = list.children[contactActive];
  if (!item) return;
  const itemLeft = item.offsetLeft;
  const itemRight = itemLeft + item.offsetWidth;
  const viewLeft = list.scrollLeft;
  const viewRight = viewLeft + list.clientWidth;
  if (itemRight > viewRight) list.scrollLeft = itemRight - list.clientWidth;
  if (itemLeft < viewLeft) list.scrollLeft = itemLeft;
}, [contactActive]);
const [clientAlert, setClientAlert] = React.useState(null);

// 상/하차지 오더메모 버튼 — 상/하차지명에 입력된 거래처의 오더메모를 바로 보고
// 수정할 수 있게 해준다. ⚠️ 여기서 "저장"을 눌러도 거래처관리에 바로 반영되지
// 않는다 — 오더를 실제로 등록해야만 그 값이 함께 저장되도록, 우선 form에만
// 임시로 담아두고(상차지오더메모/상차지오더메모팝업표시 등) 오더 등록 시점에
// savePlaceSmart로 실제 반영한다(아래 백그라운드 저장 부분 참고).
const [orderMemoPopup, setOrderMemoPopup] = React.useState(null); // { type, name, memo, 등급, 팝업표시 }
const openOrderMemoEditor = (type) => {
  const name = (type === "pickup" ? form.상차지명 : form.하차지명 || "").trim();
  if (!name) { showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`); return; }
  const pendingMemoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  const pendingShowKey = type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
  const pendingNoticeKey = type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
  if (form[pendingMemoKey] !== undefined || form[pendingShowKey] !== undefined || form[pendingNoticeKey] !== undefined) {
    // 이미 이번 오더에서 한 번 수정해둔 값이 있으면(아직 등록 전) 그 값을 그대로 이어서 보여준다.
    setOrderMemoPopup({
      type, name,
      memo: form[pendingMemoKey] || "",
      팝업표시: form[pendingShowKey] !== undefined ? form[pendingShowKey] : true,
      notice: form[pendingNoticeKey] !== undefined ? form[pendingNoticeKey] : defaultDriverNoticeTemplate(name),
    });
    return;
  }
  const found = mergedClients.find(c => normalizeKey(c.업체명 || "") === normalizeKey(name));
  setOrderMemoPopup({
    type, name,
    memo: found?.오더메모 || "",
    팝업표시: found?.팝업표시 !== undefined ? found.팝업표시 : true,
    notice: found?.기사전달주의사항 !== undefined ? found.기사전달주의사항 : defaultDriverNoticeTemplate(name),
  });
};
// ⭐ 오더메모 아이콘 색/깜빡임 표시용 — openOrderMemoEditor와 동일한 우선순위(이번
// 오더에서 아직 저장 전인 값 → 매칭되는 거래처의 등록된 오더메모)로 확인한다.
const hasOrderMemoFor = (type) => {
  const name = (type === "pickup" ? form.상차지명 : form.하차지명 || "").trim();
  if (!name) return false;
  const pendingMemoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  if (form[pendingMemoKey] !== undefined) return !!String(form[pendingMemoKey] || "").trim();
  const found = mergedClients.find(c => normalizeKey(c.업체명 || "") === normalizeKey(name));
  return !!String(found?.오더메모 || "").trim();
};
const saveOrderMemo = (memo, popupShow, notice) => {
  if (!orderMemoPopup) return;
  const { type } = orderMemoPopup;
  const memoKey = type === "pickup" ? "상차지오더메모" : "하차지오더메모";
  const showKey = type === "pickup" ? "상차지오더메모팝업표시" : "하차지오더메모팝업표시";
  const noticeKey = type === "pickup" ? "상차지기사전달주의사항" : "하차지기사전달주의사항";
  setForm(p => ({ ...p, [memoKey]: memo, [showKey]: popupShow, [noticeKey]: notice }));
  setOrderMemoPopup(null);
  showAlert("오더를 등록하면 오더메모가 함께 저장됩니다.");
};

// 🚫 거래처/상하차지 등급·메모 알림 대상 찾기
// 하차지거래처(placeRows)뿐 아니라 기본거래처(clients)에만 등록된 업체의
// 블랙/주의 등급·메모도 동일하게 경고가 뜨도록 두 컬렉션 모두 확인한다.
// 등급이 "일반"이라도 메모가 등록돼 있으면 참고할 수 있도록 같이 띄운다.
// 거래처관리에서 해당 거래처의 "팝업표시"를 꺼둔 경우(기본값: 켜짐)에는 띄우지 않는다.
const findClientAlertTarget = (name) => {
  if (!name) return null;
  const trimmed = name.trim();
  // 하차지거래처/기본거래처 모두 "일반메모"가 아니라 "오더메모"가 있을 때만 팝업 대상이다
  // (두 컬렉션이 이제 이름이 같으면 서로 동기화되므로 판단 기준도 동일하게 맞춘다).
  const hasNote = (v) => v?.오더메모 && String(v.오더메모).trim();
  // ⚠️ 기본거래처(clients)를 먼저 확인한다 — 상/하차지명 드롭다운(mergedClients)이나
  // 실제 저장(savePlaceSmart)이나 전부 기본거래처를 우선하는데, 여기만 하차지거래처를
  // 먼저 보면, 아직 서로 동기화되지 않은 옛 하차지거래처 문서(팝업표시가 켜진 채로
  // 남아있는)가 이겨버려서 기본거래처에서 분명히 꺼둔 팝업이 거래처명 필드에서만
  // 다시 뜨는 문제가 있었다.
  const isWarnGrade = (g) => g === "블랙" || g === "주의" || g === "이탈";
  const clientTarget = (clients || []).find(
    (c) => (c.업체명 || c.거래처명 || "") === trimmed && (isWarnGrade(c.등급) || hasNote(c))
  );
  if (clientTarget) {
    // 팝업 렌더링 쪽은 target.메모를 그대로 표시하므로, 오더메모 내용을 메모 자리에 실어 보낸다.
    // 오더메모가 비어 있으면(예: 예전에 일반메모에만 적어둔 경우) 일반메모라도 참고할 수 있게 넣어준다.
    return clientTarget.팝업표시 === false ? null : { ...clientTarget, 메모: clientTarget.오더메모 || clientTarget.메모 || "" };
  }
  const placeTarget = (placeRows || []).find(
    (p) => (p.업체명 || "") === trimmed && (isWarnGrade(p.등급) || hasNote(p))
  );
  if (!placeTarget || placeTarget.팝업표시 === false) return null;
  return { ...placeTarget, 메모: placeTarget.오더메모 || placeTarget.메모 || "" };
};
// 드롭다운에서 "특정 항목"을 직접 선택한 경우 전용 — 같은 업체명이라도 기본거래처와
// 하차지거래처, 혹은 주소가 다른 하차지거래처가 각각 따로 존재할 수 있으므로, 이름으로
// 다시 검색하지 않고 사용자가 실제로 고른 그 객체 자신의 등급/오더메모만 본다.
const getAlertTargetForSelectedPlace = (place) => {
  if (!place || place.팝업표시 === false) return null;
  const note = place.오더메모;
  const hasNote = note && String(note).trim();
  if (place.등급 !== "블랙" && place.등급 !== "주의" && place.등급 !== "이탈" && !hasNote) {
    // ⭐ 드롭다운 항목(mergedClients)은 기본거래처를 우선하는데, 하차지거래처에서만
    // 오더메모를 저장한 경우 기본거래처 항목엔 오더메모가 비어 있어 팝업이 안 떴다
    // (오더복사는 이름으로 두 컬렉션을 모두 찾아 떴음). 이름으로 한 번 더 찾는다.
    return findClientAlertTarget(place.업체명 || place.거래처명 || "");
  }
  return { ...place, 메모: note || place.메모 || "" };
};
// 하위호환용 — 기존 호출부에서 그대로 쓸 수 있도록 남겨둠 (단일 대상만 체크)
const checkClientGrade = (name, nextFocusId = null) => {
  const target = findClientAlertTarget(name);
  if (target) {
    showClientAlertChain([{ ...target, 업체명: target.업체명 || target.거래처명 || name.trim() }], { finalFocusId: nextFocusId });
  }
};

// ===== 팝업 체인: 거래처 메모/등급 알림(들) → 담당자 선택(들) → 최종 포커스 이동 =====
// 상차지·하차지 양쪽 다 안내가 필요한 경우(오더복사 등) 전부 순서대로 보여주고,
// 모든 팝업이 끝난 뒤에만 지정된 위치로 포커스를 옮긴다. 아무 팝업도 뜨지 않는 경우
// alwaysFocus가 아니면 포커스를 건드리지 않고 사용자 이동에 맡긴다.
const clientAlertQueueRef = React.useRef([]);
// 오더복사 직후 뜨는 "복사되었습니다" 알림이 맨 위에 먼저 뜨고, 그걸 확인해야만
// 뒤에 있는 메모/등급/담당자 선택 팝업이 이어서 나타나도록 시작을 미뤄둔다.
const pendingCopyChainRef = React.useRef(null);
const pendingContactItemsRef = React.useRef([]);
const pendingFinalFocusRef = React.useRef(null);

const advancePopupChain = () => {
  if (clientAlertQueueRef.current.length > 0) {
    const next = clientAlertQueueRef.current[0];
    clientAlertQueueRef.current = clientAlertQueueRef.current.slice(1);
    setClientAlert(next);
    return;
  }
  if (pendingContactItemsRef.current.length > 0) {
    const items = pendingContactItemsRef.current;
    pendingContactItemsRef.current = [];
    openContactPopup(items);
    return;
  }
  if (pendingFinalFocusRef.current) {
    const id = pendingFinalFocusRef.current;
    pendingFinalFocusRef.current = null;
    setTimeout(() => focusById(id), 50);
  }
};

const showClientAlertChain = (targets, { contactItems = [], finalFocusId = null, alwaysFocus = false } = {}) => {
  const list = (targets || []).filter(Boolean);
  const hasAnything = list.length > 0 || contactItems.length > 0;
  clientAlertQueueRef.current = list.slice(1);
  pendingContactItemsRef.current = contactItems;
  pendingFinalFocusRef.current = (hasAnything || alwaysFocus) ? finalFocusId : null;
  if (list.length > 0) {
    setClientAlert(list[0]);
  } else if (contactItems.length > 0) {
    pendingContactItemsRef.current = [];
    openContactPopup(contactItems);
  } else if (alwaysFocus && finalFocusId) {
    setTimeout(() => focusById(finalFocusId), 50);
  }
};

const applyPlaceToForm = (place, type, nextFocusId = null) => {
  const contacts = (place.contacts || []).filter(c => c.name?.trim());
  const uniqueContacts = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
  // 기본거래처로 옮겨온 업체는 contacts 배열이 없고 담당자/담당자번호 평면 필드만
  // 있으므로, contacts가 비어 있으면 그 평면 필드로 대체한다
  const primary = uniqueContacts.find(c => c.isPrimary) || uniqueContacts[0] || primaryContactOf(place);

  if (type === "pickup") {
    setForm(prev => ({
      ...prev,
      상차지명: place.업체명,
      상차지Id: place._id || "",
      상차지주소: place.주소 || "",
      상차지담당자: primary?.name || "",
      상차지담당자번호: primary?.phone || "",
    }));
  } else {
    setForm(prev => ({
      ...prev,
      하차지명: place.업체명,
      하차지Id: place._id || "",
      하차지주소: place.주소 || "",
      하차지담당자: primary?.name || "",
      하차지담당자번호: primary?.phone || "",
    }));
  }

  const alertTarget = getAlertTargetForSelectedPlace(place);
  const contactItems = uniqueContacts.length > 1 ? [{ type, place, contacts: uniqueContacts }] : [];
  // 직접입력(상/하차지명 자동완성)으로 채운 경우 — 팝업이 하나라도 뜨면 그 필드로,
  // 아무 팝업도 없으면 포커스를 건드리지 않는다(사용자 이동에 맡김).
  showClientAlertChain(
    alertTarget ? [{ ...alertTarget, 업체명: alertTarget.업체명 || alertTarget.거래처명 || place.업체명 }] : [],
    { contactItems, finalFocusId: nextFocusId }
  );
};

const openContactPopup = (items) => {
  if (!items || items.length === 0) return;
  const [first, ...rest] = items;
  setContactQueue(rest);
  setContactPopup(first);
  setContactActive(0);
  setContactSearchQ("");
};

// 상/하차지 담당자 라벨 옆 아이콘을 눌러 수동으로 담당자선택 팝업을 여는 진입점.
// 자동완성 흐름과 달리 사용자가 원할 때 언제든 다시 열어볼 수 있게 한다.
const openContactPickerFor = (type) => {
  const name = (type === "pickup" ? form.상차지명 : form.하차지명 || "").trim();
  if (!name) return showAlert(`${type === "pickup" ? "상차지명" : "하차지명"}을 먼저 입력하세요.`);
  const place = findPlaceByName(name);
  if (!place) return showAlert("등록된 거래처를 찾을 수 없습니다.");
  const contacts = (place.contacts || []).filter(c => c.name?.trim());
  const uniqueContacts = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
  if (uniqueContacts.length === 0) return showAlert("등록된 담당자가 없습니다.");
  openContactPopup([{ type, place, contacts: uniqueContacts }]);
};

const closeContactPopup = (selectedContact) => {
  if (selectedContact && contactPopup) {
    // ⭐ 다중등록 팝업에서 연 담당자선택이면 form이 아니라 다중등록 쪽 상태에
    // 반영한다 — 팝업 자체(검색/키보드 이동/편집)는 완전히 같은 것을 그대로
    // 재사용하고, 선택 결과를 어디에 쓸지만 갈라준다.
    if (contactPopup.__multiReg === "pickup") {
      setMultiRegSlots(prev => prev.map((s, i) => i === multiRegIdx ? { ...s, 상차지담당자: selectedContact.name || "", 상차지담당자번호: selectedContact.phone || "" } : s));
    } else if (contactPopup.__multiReg === "group") {
      const gk = contactPopup.__multiRegKey;
      setMultiRegGroups(prev => prev.map(g => g.key === gk ? { ...g, 상차지담당자: selectedContact.name || "", 상차지담당자번호: selectedContact.phone || "" } : g));
    } else if (contactPopup.__multiReg === "drop") {
      setMultiRegSlots(prev => prev.map((s, i) => i === multiRegIdx ? { ...s, 하차지담당자: selectedContact.name || "", 하차지담당자번호: selectedContact.phone || "" } : s));
    } else {
      const field = contactPopup.type === "pickup"
        ? { 상차지담당자: selectedContact.name || "", 상차지담당자번호: selectedContact.phone || "" }
        : { 하차지담당자: selectedContact.name || "", 하차지담당자번호: selectedContact.phone || "" };
      setForm(prev => ({ ...prev, ...field }));
    }
  }
  setContactPopup(null);
  setContactSearchQ("");

  if (contactQueue.length > 0) {
    const [next, ...rest] = contactQueue;
    setContactQueue(rest);
    setTimeout(() => { setContactPopup(next); setContactActive(0); }, 80);
    return;
  }

  // 대기 중인 팝업 큐가 남아있으면(체인 방식) 이어서 진행, 없으면 지정된 포커스로 이동
  setTimeout(() => { advancePopupChain(); }, 60);
};

// place._id가 있으면(진짜 하차지거래처 문서) 그 문서를 갱신하고, place.id가 있으면
// (mergedClients에서 넘어온 기본거래처 항목) 그 id로 기본거래처 문서를 직접 갱신한다.
// 둘 다 없을 때만(아주 오래된 호출부 등) 이름으로 다시 찾는 예전 방식으로 대체한다.
// ⭐ 예전엔 place._id가 없으면 항상 이름만으로 clients를 다시 검색했는데, 같은
// 업체명에 주소가 다른 거래처가 여러 개 있으면 엉뚱한(먼저 매칭된) 문서를 갱신해버려
// "담당자를 삭제했는데 다시 열어보면 그대로 있다"는 버그로 이어졌다 — 실제로는
// 원래 보고 있던 문서가 아니라 동명이인 다른 거래처 문서가 수정된 것. mergedClients가
// 이제 기본거래처 항목에도 id를 그대로 실어보내므로, 이름 재검색 없이 그 id를 바로 쓴다.
const updateContactInPlace = async (place, newContacts) => {
  if (!place?.업체명) return;
  try {
    if (place._id) {
      await updateDoc(doc(db, "places", place._id), { contacts: newContacts });
    } else {
      const primary = newContacts.find(c => c.isPrimary) || newContacts[0];
      const clientMatch = place.id ? null : (clients || []).find(c => normalizeKey(c.업체명 || c.거래처명) === normalizeKey(place.업체명));
      await upsertClient?.({
        id: place.id || clientMatch?.id || place.업체명,
        거래처명: clientMatch?.거래처명 || place.업체명,
        주소: clientMatch?.주소 || place.주소 || "",
        담당자: primary?.name || "",
        연락처: primary?.phone || "",
        contacts: newContacts,
      });
    }
    setContactPopup(prev => prev ? { ...prev, contacts: newContacts } : null);
  } catch (e) {
   showAlert("저장 실패: " + e.message);
  }
};

React.useEffect(() => {
  const handler = (e) => setBlackAlert(e.detail);
  window.addEventListener("blackDriverDetected", handler);
  return () => window.removeEventListener("blackDriverDetected", handler);
}, []);
const [driverDropdownOpen, setDriverDropdownOpen] = React.useState(false);
const [driverCandidates, setDriverCandidates] = React.useState([]);
const [driverActive, setDriverActive] = React.useState(0);
const driverDropdownListRef = React.useRef(null);
React.useEffect(() => {
  const list = driverDropdownListRef.current;
  if (!list) return;
  const item = list.children[driverActive];
  if (!item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = list.scrollTop;
  const viewBottom = viewTop + list.clientHeight;
  if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  if (itemTop < viewTop) list.scrollTop = itemTop;
}, [driverActive]);
    const handleCarNoChange = (value) => {
  formDrvEdit.reset(); // ⭐ 2026-11-05 차량번호가 바뀌면 [수정] 상태 해제
  const clean = (value || "").trim().replace(/\s+/g, "");

  setForm((p) => ({
    ...p,
    차량번호: clean,
  }));

  if (!clean) {
    setForm((p) => ({
      ...p,
      차량번호: "",
      이름: "",
      전화번호: "",
      배차상태: "배차중",
    }));
    setDriverDropdownOpen(false);
    return;
  }

  const list = driverMap.get(clean);
  // 🔹 기존 기사 2명 이상 → 드롭다운
  if (list && list.length > 1) {
    setDriverCandidates(list);
    setDriverActive(0);
    setDriverDropdownOpen(true);
    return;
  }

  // 🔹 기존 기사 1명 → 자동세팅
   if (list && list.length === 1) {
    // 🚫 블랙 체크 (필드명 다양하게 대응)
     const grade = list[0]?.등급 || list[0]?.grade || list[0]?.상태 || "";
    if (grade === "블랙") {
      setBlackAlert(list[0]);
    } else if (shouldShowDriverMemoAlert(list[0])) {
      window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: list[0] }));
    }
    setForm((p) => ({
      ...p,
      차량번호: clean,
      이름: list[0].이름 || "",
      전화번호: formatPhone(list[0].전화번호 || ""), // 🛠 2026-11-27 010-0000-0000 형식으로(예전 기사 문서는 01000009101 처럼 숫자만)
      배차상태: "배차완료",
    }));
    setDriverDropdownOpen(false);
    return;
  }

  // 🔥 기존 기사 없음 → 입력 중에는 아무것도 안함
  //  🛠 2026-11-27 앞서 자동으로 채운 기사 정보만 지운다 — 손으로 먼저 적어 둔 기사명 · 전화는 남겨 신규 기사 등록 창에 넘긴다
  const dg = (v) => String(v || "").replace(/\D/g, "");
  const fromList = (p) => !!p.이름 && (drivers || []).some((d) => (d.이름 || "") === p.이름 && dg(d.전화번호) === dg(p.전화번호));
  setForm((p) => (fromList(p) ? { ...p, 이름: "", 전화번호: "", 배차상태: "배차중" } : { ...p, 배차상태: "배차중" }));

  setDriverDropdownOpen(false);
};
// 🛠 2026-11-27 신규 기사 등록 창을 이미 띄운 차량번호(같은 차를 두 번 묻지 않게)
const newDrvAskedRef = React.useRef("");
const checkNewDriver = (carNo) => {
  const clean = (carNo || "").trim().replace(/\s+/g, "");

  if (!clean) return;

  const list = driverMap.get(clean);

  // 🔥 기존 없으면 팝업 — 단, 이미 이름이 세팅되어 있으면 스킵
  if (!list || list.length === 0) {
    // ✅ 스마트검색에서 이미 이름을 세팅한 경우 리셋하지 않음
    setForm((p) => {
      if (p.이름 && p.이름.trim()) {
        // 이미 이름이 있으면 (스마트검색으로 세팅됨) → 건드리지 않음
        return p;
      }
      // 이름이 없을 때만 신규 기사 등록 모달 — 🛠 2026-11-27 오더 폼에 먼저 적은 전화번호는 미리 채운다 · 한 차량번호는 한 번만 묻는다
      newDrvAskedRef.current = clean;
      setDriverModal((m) => (m.open && m.carNo === clean ? m : {
        open: true,
        carNo: clean,
        name: p.이름 || "",
        phone: p.전화번호 ? formatPhone(p.전화번호) : "",
      }));
      return {
        ...p,
        차량번호: clean,
        이름: "",
        전화번호: "",
        배차상태: "배차중",
      };
    });
  }
};


// ================================
// 🔥 기사 정보 충돌 체크 (차량번호 동일 + 이름/전화 다를 때)
// ================================
const checkDriverConflict = () => {
  const plate = (form.차량번호 || "").trim().replace(/\s+/g, "");
  const name = (form.이름 || "").trim();
  const phone = (form.전화번호 || "").replace(/[^\d]/g, "");

  // 차량번호나 이름이 없으면 체크 불필요
  if (!plate || !name) return;

  const list = driverMap.get(plate);

  // 🔹 기존 기사님이 없으면 → 신규 등록 여부 확인
  if (!list || list.length === 0) {
    // 🛠 2026-11-27 이 차량번호로 신규 기사 등록 창을 이미 띄웠으면 다시 묻지 않는다(등록했거나 닫았으면 오더 저장 때 자동 등록)
    if (newDrvAskedRef.current === plate) return;
    // 차량번호 + 이름 + 전화번호가 모두 있으면 자동 등록 제안
    if (name && phone) {
      setDriverConflictPopup({
        mode: "new_driver",
        existing: null,
        input: { plate, name, phone: formatPhone(phone) },
      });
    }
    return;
  }

  // 🔹 기존 기사님이 있으면 → 이름/전화번호 비교
  // ⭐ 2026-11-05 같은 차량번호 기사가 여러 명이면 그중 누구와든 똑같으면 정상(별도 추가된 기사 선택),
  //  다르면 가장 가까운 기사(실제 문서 — id 포함)와 비교해 "덮어쓰기"가 그 문서를 정확히 바꾸게 한다
  if (isRegisteredCombo(drivers, plate, name, phone)) return;
  const existing = pickDriverFor(drivers, plate, name, phone) || list[0];
  const existName = (existing.이름 || "").trim();
  const existPhone = (existing.전화번호 || "").replace(/[^\d]/g, "");

  const sameName = existName === name;
  const samePhone = existPhone === phone;

  // 완전 동일하면 무시
  if (sameName && samePhone) return;

  // 🔥 차량번호 같은데 이름 또는 전화번호가 다름 → 충돌 팝업
  if (!sameName || !samePhone) {
    setDriverConflictPopup({
      mode: !sameName ? "name_diff" : "phone_diff",
      existing,
      input: { plate, name, phone: formatPhone(phone) },
    });
  }
};

// ⭐ 순번은 "전체 통틀어 계속 증가하는 값"이 아니라 "그 상차일 안에서 1번부터
// 시작하는 값"이어야 한다(구글시트에도 날짜별로 1번부터 다시 매겨져야 함) — 예전엔
// targetDate 구분 없이 dispatchData 전체에서 최댓값+1을 매겨서, 날짜가 섞여 들어오면
// 순번이 날짜와 무관하게 계속 커지기만 했다. 같은 상차일을 가진 오더끼리만 비교해
// 그 안에서의 최댓값+1을 매긴다.
// ⭐ 저장 시 발생하던 체감 딜레이 완화 — 예전엔 이 계산이 항상 dispatchData
// 전체(최근 13개월치, 오더 많은 회사는 수만 건)를 훑었다. 실제로 등록하는
// 날짜는 거의 항상 어제~내일(실시간배차현황과 동일 범위) 안이므로, 그 범위
// 안이면 훨씬 작은 recentDispatchData만 훑고, 범위 밖(예약 등록 등 먼 날짜)일
// 때만 예전처럼 dispatchData 전체를 쓴다.
const isWithinRecentWindow = (targetDate) => {
  if (!targetDate) return false;
  const y = new Date(); y.setMinutes(y.getMinutes() - y.getTimezoneOffset()); y.setDate(y.getDate() - 1);
  const t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); t.setDate(t.getDate() + 1);
  return targetDate >= y.toISOString().slice(0, 10) && targetDate <= t.toISOString().slice(0, 10);
};
const pickDataSourceForDate = (targetDate) =>
  (isWithinRecentWindow(targetDate) && recentDispatchData?.length) ? recentDispatchData : (dispatchData || []);

const nextSeq = (targetDate) =>
  Math.max(
    0,
    ...pickDataSourceForDate(targetDate)
      .filter((r) => r.상차일 === targetDate)
      .map((r) => Number(r.순번) || 0)
  ) + 1;
// ================================
// ⛔ 기사 중복 배차 체크 유틸
// ================================
function isTimeOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;

const toMin = (t) => {
  if (!t) return null;

  // "오전 9시 30분" 대응
  if (t.includes("오전") || t.includes("오후")) {
    const isPM = t.includes("오후");
    const nums = t.match(/\d+/g) || [];
    let h = Number(nums[0] || 0);
    const m = Number(nums[1] || 0);
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }

  // "HH:mm"
  const [h, m = "0"] = String(t).split(":");
  return Number(h) * 60 + Number(m);
};

  const aS = toMin(aStart);
  const aE = aEnd ? toMin(aEnd) : aS + 60;
  const bS = toMin(bStart);
  const bE = bEnd ? toMin(bEnd) : bS + 60;

  return Math.max(aS, bS) < Math.min(aE, bE);
}

function checkDuplicateDispatch(form, dispatchData) {
  if (!form.차량번호) return null;

  const targetDate = String(form.상차일 || "").slice(0, 10);

  return dispatchData.find((r) => {
    if (r._id === form._id) return false; // ▲ 자기 자신 제외
    if (!r?.차량번호) return false;
    if (r.차량번호 !== form.차량번호) return false;
    if (r.배차상태 !== "배차완료") return false;

    const rowDate = String(r.상차일 || "").slice(0, 10);
    if (rowDate !== targetDate) return false;

    return isTimeOverlap(
      r.상차시간,
      r.하차시간,
      form.상차시간,
      form.하차시간
    );
  });
}

    // ✅ 필수값(거래처 · 상차지명 · 하차지명) 검증
    const validateRequired = (f) => {
      const miss = [];
      const missKeys = [];
      if (!f.거래처명?.trim()) { miss.push("거래처"); missKeys.push("거래처명"); }
      if (ofShow("상차지") && !f.상차지명?.trim()) { miss.push("상차지명"); missKeys.push("상차지명"); } // 🧩 숨긴 칸은 필수 검사 안 함
      if (ofShow("하차지") && !f.하차지명?.trim()) { miss.push("하차지명"); missKeys.push("하차지명"); }
      // 🛠 2026-11-26 사용자 요청 — 필수는 거래처 · 상차지명 · 하차지명만(화물내용 · 차량톤수 · 지급방식은 비워도 저장)
      if (miss.length) {
        setRequiredErrors(new Set(missKeys));
        setTimeout(() => setRequiredErrors(new Set()), 2500);
        const refMap = { 화물내용: cargoInputRef, 차량톤수: tonInputRef, 지급방식: payTypeRef };
        const firstRefKey = missKeys.find(k => refMap[k]?.current);
        if (firstRefKey) {
          refMap[firstRefKey].current.focus?.();
          refMap[firstRefKey].current.scrollIntoView?.({ behavior: "smooth", block: "center" });
        }
        showAlert(`필수 항목 누락: ${miss.join(", ")}\n(*) 표시된 항목을 모두 입력하세요.`);
        return false;
      }
      return true;
    };
    // ⭐ 날짜/시간 필수 검증
    const validateDateTime = (f) => {
      const miss = [];
      // 🛠 2026-11-26 사용자 요청 — 필수는 거래처 · 상차지명 · 하차지명만. 날짜가 비어 있으면 막지 않고 채운다
      //  (날짜 없는 오더는 날짜별 배차현황에서 안 보이므로): 상차일 없으면 오늘 · 하차일 없으면 상차일과 같은 날
      if (!f.상차일 || !f.하차일) {
        if (!f.상차일) f.상차일 = todayStr();
        if (!f.하차일) f.하차일 = f.상차일;
        setForm((p) => ({ ...p, 상차일: f.상차일, 하차일: f.하차일 }));
      }

      const timeNoAmPm = (t) => t && !t.startsWith("오전") && !t.startsWith("오후");
      if (timeNoAmPm(f.상차시간) || timeNoAmPm(f.하차시간)) {
        setShowAmPmError(true);
        showAlert("⊘ 시간 선택 시 오전/오후를 함께 선택해주세요.");
        return false;
      }

      if (miss.length > 0) {
        showAlert(`⊘ 날짜가 입력되지 않았습니다.\n[ ${miss.join(", ")} ] 은(는) 반드시 입력해야 합니다.`);
        return false;
      }

      // 하차일이 상차일보다 앞설 수 없다 (예: 상차 7/27, 하차 7/21처럼 거꾸로 입력된 경우)
      if (f.하차일 < f.상차일) {
        showAlert(`⊘ 하차일(${f.하차일})이 상차일(${f.상차일})보다 앞설 수 없습니다.\n날짜를 다시 확인해주세요.`);
        return false;
      }

      return true;
    };

// ==================== 운임조회 보조함수 정의 ====================
const isLike = (text = "", target = "") =>
  String(text).replace(/\s+/g, "").includes(
    String(target).replace(/\s+/g, "")
  );
// ================================
// 🚚 상/하차지 경유 파싱 유틸
// ================================

// 1원진 / 1.원진 / 1 원진 모두 허용
function parseStops(text = "") {
  const raw = String(text).trim();
  if (!raw) return [];

  // ① "1.원진 2.우리유통" / "1 원진 2 우리유통"
  const regex = /(\d+)\.\s*([^\d]+)/g;
  const matches = [...raw.matchAll(regex)];

  if (matches.length > 0) {
    return matches
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map(m => m[2].trim());
  }

  // ② 숫자 패턴 없으면 단일
  return [raw];
}

// ⭐ 좌우 방향키 필드 이동 — data-arrownav-scope로 감싼 영역 안에서, 지금 포커스가
// 있는 입력창(data-arrownav 붙은 것들) 기준으로 DOM 순서상 이전/다음 칸으로 옮긴다.
// 일반 입력창은 텍스트 커서를 끝단으로 이어붙이듯 위치시키고(오른쪽으로 넘어가면
// 다음 칸 맨 앞, 왼쪽으로 넘어가면 이전 칸 맨 뒤), CustomSelect(버튼)는 그냥 포커스만
// 준다 — 드롭다운을 열지 말지는 CustomSelect 자신의 arrowNav 로직이 처리한다.
function arrowHopFocus(fromEl, dir) {
  if (!fromEl) return;
  const scope = fromEl.closest("[data-arrownav-scope]");
  if (!scope) return;
  const fields = Array.from(scope.querySelectorAll("[data-arrownav]")).filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
  const idx = fields.indexOf(fromEl);
  if (idx === -1) return;
  const target = fields[idx + dir];
  if (!target) return;
  target.focus();
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
    const pos = dir > 0 ? 0 : target.value.length;
    requestAnimationFrame(() => { try { target.setSelectionRange(pos, pos); } catch {} });
  }
}

// 경유 개수 라벨
function getStopLabel(stops = []) {
  return stops.length > 1 ? `경유 ${stops.length}곳` : "단일";
}
// ================================
// 🏷 메모 자동 태그 추출
// ================================
function extractMemoTags(memo = "") {
  const text = String(memo);

  const rules = [
    {
      key: "대기",
      match: /대기|대기시간|상차대기|하차대기/,
      className: "bg-blue-100 text-blue-700",
    },
    {
      key: "야간",
      match: /야간|심야|밤|야간작업/,
      className: "bg-purple-100 text-purple-700",
    },
    {
      key: "추가비",
      match: /추가|추가비|할증|추가요금/,
      className: "bg-rose-100 text-rose-700",
    },
  ];

  return rules
    .filter(r => r.match.test(text))
    .map(r => ({
      label: r.key,
      className: r.className,
    }));
}


// ================================
// ⭐ 오더복사용 조건 Key 생성 (중복 제거 기준)
// ================================
function makeCopyOrderKey(r) {
  const safeArr = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  };
  const pickupVia = safeArr(r.경유상차목록)
    .filter(s => s.업체명?.trim()).map(s => s.업체명.trim()).join(",");
  const dropVia = safeArr(r.경유하차목록)
    .filter(s => s.업체명?.trim()).map(s => s.업체명.trim()).join(",");
  // ⭐ 2026-10-28 사용자 요청 — 화물내용·톤수가 다르다고 같은 노선이 여러 건 뜨지 않게, 기준을
  //    "거래처명 + 상차지 + 하차지(+경유) + 차량종류(+편도/왕복)"로만 묶는다(최신 1건이 대표).
  //    화물내용·톤수는 복사 때 비워서 넣으므로 구분할 필요가 없다.
  return [
    r.운행유형 || "편도",
    normalizeKey(r.거래처명 || ""),
    normalizeKey(r.상차지명 || ""),
    pickupVia,
    normalizeKey(r.하차지명 || ""),
    dropVia,
    String(r.차량종류 || "").trim(),
  ].join("|");
}

const getDropCountFromText = (dropName = "") => {
  const list = ["푸드플래닛", "신미"];
  return list.filter((key) =>
    isLike(dropName, key)
  ).length || 1;
};

// ================================
// ⭐ 운임조회 유사도 점수 계산
// ================================
function calcFareMatchScore(row, input) {
  let score = 0;

  // 상차지 / 하차지 (가장 중요)
  if (normalizeKey(row.상차지명) === normalizeKey(input.pickup)) score += 40;
  if (normalizeKey(row.하차지명) === normalizeKey(input.drop)) score += 40;

  // 파렛트 수
  if (input.pallet != null) {
    const rowPallet = getTotalPalletFromOrder(row);
    if (rowPallet === input.pallet) score += 30;
    else if (rowPallet != null && Math.abs(rowPallet - input.pallet) === 1)
      score += 15;
  }

  // 차량종류
if (
  input.vehicle &&
  normalizeVehicleGroup(row.차량종류) ===
    normalizeVehicleGroup(input.vehicle)
) {
  score += 20;
}

  // 톤수 (±0.5)
  if (input.ton != null) {
    const rowTon = getTotalTonFromOrder(row);
    if (rowTon != null && Math.abs(rowTon - input.ton) <= 0.5)
      score += 10;
  }

  return score;
}
// ================================
// ⭐ 운임 중복 제거용 Key 생성
// ================================
function makeFareDedupKey(row) {
  const pallet = getTotalPalletFromOrder(row);
  const fare = Number(String(row.청구운임 || "0").replace(/[^\d]/g, ""));

  return [
    row.상차지명?.trim(),
row.하차지명?.trim(),
    pallet ?? "",              // ★ 파렛트 수
    row.차량종류 || "",        // ★ 차량종류
    fare                        // ★ 청구운임
  ].join("|");
}
const palletFareRules = {
  double: [ // 2곳 하차 (푸드플래닛 + 신미)
    { min: 4, max: 5, fare: 350000 },
    { min: 6, max: 7, fare: 370000 },
    { min: 8, max: 10, fare: 380000 },
  ],

  food: [ // 푸드플래닛 단일
    { min: 3, max: 3, fare: 240000 },
    { min: 4, max: 6, fare: 270000 },
    { min: 7, max: 8, fare: 280000 },
    { min: 9, max: 10, fare: 300000 },
  ],

  sinmi: [ // 신미 단일
    { min: 2, max: 2, fare: 150000 },
    { min: 3, max: 3, fare: [180000, 200000] }, // 선택
    { min: 4, max: 5, fare: 240000 },
    { min: 6, max: 8, fare: 260000 },
    { min: 9, max: 10, fare: 300000 },
  ],
};
    const handleSubmit = async (e) => {
  e.preventDefault();
  if (isViewer) return showAlert("조회전용 권한으로 저장할 수 없습니다.");
  if (!(await formDrvEdit.finish(form))) return; // ⭐ 2026-11-05 기사 이름·전화 [수정] 중이면 먼저 변경/별도추가 선택
  if (!validateRequired(form)) return;
  if (!validateDateTime(form)) return;

  setConfirmOpen(true);
};

// ⭐ 실제 저장 함수
const doSave = async (shareToCafe = false) => {
  if (isViewer) return showAlert("조회전용 권한으로 저장할 수 없습니다.");
  if (isSaving) return;
  setIsSaving(true);

  // ⚠️ 아래 저장 로직 전체를 try/catch로 감싼다 — 예전엔 여기서 네트워크 오류 등
  // 예외가 하나라도 발생하면 setIsSaving(false)에 도달하지 못해 "배차등록하기"
  // 버튼이 "저장 중..."에서 영원히 멈춰버렸다(사용자에게는 딜레이/먹통처럼 보임).
  try {
    // ⛔ 기사 중복 배차 방지
  const dup = checkDuplicateDispatch(form, pickDataSourceForDate(form.상차일));
  if (dup) {
    // 교체 후
showAlert(
  `⊘ 기사 중복 배차 감지\n\n` +
  `차량번호: ${form.차량번호}\n` +
  `기존 상차시간: ${dup.상차시간 || "-"}\n` +
  `기존 하차시간: ${dup.하차시간 || "-"}`
);
    setIsSaving(false);
    return;
  }

  // ⭐ 완전히 동일한 오더 중복 등록 알림 — 저장을 막지는 않고, 이미 같은 조건의
  // 오더가 등록돼 있으면 알려서 사용자가 직접 판단하게 한다(여러 담당자가 같은
  // 오더를 모르고 중복 등록하는 것을 방지). "그래도 등록"을 누르면 계속 진행.
  const dupOrders = findDuplicateOrders(form, pickDataSourceForDate(form.상차일));
  if (dupOrders.length > 0) {
    const proceed = await confirmDuplicateOrder(dupOrders);
    if (!proceed) { setIsSaving(false); return; }
  }

// 🚚 2026-11-07 배차완료 = 차량번호만 있으면(모바일·여러 건 등록과 같음 · 기사 이름은 기사관리에서 채움)
const status = dispatchStatusOf({ 지급방식: form.지급방식, 차량번호: form.차량번호 });

  const moneyPatch = canMoney ? {} : {
    청구운임: "0",
    기사운임: "0",
    수수료: "0"
  };
// ⭐ 긴급 단가 보정 (rec 생성 전에!)
const fareAdjustment = form.긴급
  ? {
      type: "긴급",
      rate: 0.2,        // ← 가산율 (나중에 바꿔도 됨)
      memo: "긴급 오더",
    }
  : null;
  // ⭐ 메모 prefix 자동 보정
const autoPriority =
  form.메모?.startsWith("!!") ? "CRITICAL" :
  form.메모?.startsWith("!")  ? "HIGH" :
  form.메모중요도 || "NORMAL";
 
// 🔥 경유 배열 안전 파싱 (문자열로 저장된 경우 자동 변환)
const safeParseStops = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
};

const pickupStops = safeParseStops(form.경유상차목록)
  .filter(s => s && typeof s === "object" && (s.업체명?.trim() || s.주소?.trim() || s.담당자?.trim()));
const dropStops = safeParseStops(form.경유하차목록)
  .filter(s => s && typeof s === "object" && (s.업체명?.trim() || s.주소?.trim() || s.담당자?.trim()));

const now = Date.now();
const SFXS_CARGO = ["파레트","파렛트","박스","통"];
const _fullCargo = String(form.화물내용 || "");
const _cargoExtras = _fullCargo.replace(/^[^+]*/, "");  // "+1박스" 등 추가항목 보존
let _cargoBase = _fullCargo.split("+")[0];  // 기본값만 파싱
for (const s of SFXS_CARGO) {
  if (_cargoBase.endsWith(s)) { _cargoBase = _cargoBase.slice(0, -s.length).trim(); break; }
}
const _finalCargo = form.화물타입
  ? `${_cargoBase}${form.화물타입}${_cargoExtras}`
  : _fullCargo;

const rec = {
  ...form,
  화물내용: _finalCargo, 독차: dokchaOn(form), // ⭐ 2026-11-06 혼적·왕복이 아니면 독차(기본)
  메모중요도: autoPriority,
  운임보정: fareAdjustment,
  ...moneyPatch,
  상차일: lockYear(form.상차일),
  하차일: lockYear(form.하차일),
  순번: nextSeq(lockYear(form.상차일)),
  배차상태: status,
  createdAt: now,
  updatedAt: now,
  createdByUid: auth.currentUser?.uid || null,
  createdByEmail: auth.currentUser?.email || null,
  // ★ auth 사용자 객체는 displayName을 설정한 적이 없어 항상 비어있어서(회원가입 어디서도
  // updateProfile을 호출하지 않음), 예전엔 항상 이메일이 담당자명으로 찍혔다.
  // users/{uid}.name(실명, myRealName)을 우선 사용한다.
  createdByName: myNameNow(auth.currentUser?.displayName || auth.currentUser?.email) || null,
  companyName: userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY,

  // 🔥 여기 안으로 넣어
  aiLog: aiRecommend
    ? {
        pickup: form.상차지명,
        drop: form.하차지명,
        vehicle: aiRecommend.vehicle,
        fareAvg: aiRecommend.fareAvg,
        fareMin: aiRecommend.fareMin,
        fareMax: aiRecommend.fareMax,
        driverAvg: aiRecommend.driverAvg,
        marginPercent: aiRecommend.marginPercent,
        sampleCount: aiRecommend.sampleCount,
        isOutlier: aiRecommend.isOutlier,
        appliedFare: Number(form.청구운임 || 0),
        at: new Date().toISOString(),
      }
    : null,
  경유지_상차: pickupStops,
  경유지_하차: dropStops,
  경유상차목록: pickupStops,
  경유하차목록: dropStops,
};
// ⭐ 휴차(지정 휴차일/본인 휴차중) 확인 — 기사 알림을 만들기 전에 먼저 확인한다.
// 입력 단계에서 이미 "진행"을 골랐으면 건너뛰고, "보류"면 기사 정보를 빼고 등록한다.
if (rec.차량번호) {
  const ackKey = restAckKey(rec.차량번호, rec.상차일);
  if (rec._restAck !== ackKey) {
    const okRest = await checkHolidayDispatch(drivers, rec.차량번호, rec.상차일);
    if (!okRest) { rec.차량번호 = ""; rec.이름 = ""; rec.전화번호 = ""; rec.배차상태 = "배차중"; }
  }
  if (rec.차량번호) rec._restAck = ackKey; // addDispatch에서 같은 팝업이 또 뜨지 않게
}
// ⭐ 사용자 요청 — 신규 오더 등록 시점에 이미 지입 기사 차량번호가 입력돼 있으면
// (patchDispatch를 거치는 수정과 달리 여기는 최초 등록 경로라 별도로 처리해야 함)
// 기사확인상태를 "대기"로 걸어 기사 앱에서 오더수락/거절 알림이 뜨게 한다.
if (rec.차량번호) {
  const assignedDriver = drivers.find(d => normalizePlate(d.차량번호) === normalizePlate(rec.차량번호));
  if (isFleetGrade(assignedDriver?.등급) && !!assignedDriver.uid) { // ⭐ 2026-11-02 기사앱 가입한 지입 기사만 승인대기(아니면 배차완료)
    rec.기사확인상태 = "대기";
    rec.배차상태 = "승인대기";
    addDoc(collection(db, "driver_notifications"), {
      driverId: assignedDriver.id,
      type: "new_order",
      orderId: null,
      title: "배차오더가 도착했습니다",
      body: `${rec.거래처명 || ""} ${rec.상차지명 || "-"} → ${rec.하차지명 || "-"}${rec.운행유형 === "왕복" && Number(rec.회전수) > 1 ? (rec.회전방식 === "분리" ? ` (회전운행 ${rec.회전수}회차 분리)` : ` (${rec.회전수}회전)`) : ""}`,
      createdAt: serverTimestamp(),
      read: false,
    }).catch(() => {});
  }
}
// ★ form 값 미리 캡처 (reset 전에)
const _pName = form.상차지명, _pAddr = form.상차지주소, _pMgr = form.상차지담당자, _pPhone = form.상차지담당자번호, _pId = form.상차지Id;
const _dName = form.하차지명, _dAddr = form.하차지주소, _dMgr = form.하차지담당자, _dPhone = form.하차지담당자번호, _dId = form.하차지Id;
const _carNo = form.차량번호, _name = form.이름, _tel = form.전화번호;
// 상/하차지 오더메모 버튼으로 미리 수정해둔 값(아직 거래처관리엔 반영 안 됨) — 오더가
// 실제로 등록되는 지금 시점에만 함께 반영한다.
const _pOrderMemo = form.상차지오더메모, _pOrderMemoShow = form.상차지오더메모팝업표시, _pNotice = form.상차지기사전달주의사항;
const _dOrderMemo = form.하차지오더메모, _dOrderMemoShow = form.하차지오더메모팝업표시, _dNotice = form.하차지기사전달주의사항;

// ★ 오더 병렬 저장 (순차→병렬로 속도 개선)
const saveCount = multiCount > 1 ? multiCount : 1;
// 🚫 하차일이 상차일보다 빠른 역순 등록 방지 — 다중등록(오더별 개별 날짜)까지
// 전부 미리 검사하고, 하나라도 역순이면 아무것도 저장하지 않는다.
for (let i = 0; i < saveCount; i++) {
  const dChk = (useSeparateDates && orderDates[i]) ? lockYear(orderDates[i]) : rec.상차일;
  const ddChk = (useSeparateDates && orderDropDates[i]) ? lockYear(orderDropDates[i]) : (rec.하차일 || dChk);
  if (isReversedDateOrder(dChk, ddChk)) {
    showAlert(REVERSED_DATE_ORDER_MSG);
    setIsSaving(false);
    return;
  }
}
// ⭐ 저장 버튼 클릭 후 느껴지던 딜레이/끊김의 핵심 원인 — Firestore 쓰기가 끝날
// 때까지 화면("저장 중...")이 멈춰 있었다. 실제 쓰기는 백그라운드로 넘기고
// (savePromise), 화면은 아래에서 바로 초기화한다.
const savePromise = Promise.all(Array.from({ length: saveCount }, (_, i) => {
  const dateForOrder = (useSeparateDates && orderDates[i]) ? lockYear(orderDates[i]) : rec.상차일;
  const dropDateForOrder = (useSeparateDates && orderDropDates[i]) ? lockYear(orderDropDates[i]) : (rec.하차일 || dateForOrder);
  // ⭐ 회전 운행 "나누기"면 회차별로 N건 저장(묶기/1회는 1건)
  return Promise.all(expandRotation({ ...rec, 상차일: dateForOrder, 하차일: dropDateForOrder }).map(r => addDispatch(r)));
}));
// ⭐ 2026-11-03 청구 사업자 기억 — 다음에 같은 거래처·상차지·하차지가 들어오면 이 사업자로 자동 맞춘다
if (dmBiz.multi) rememberBiz(dmBiz, rec, { clientDefault: bizClientDefault(rec.거래처명) });

// ★ 로지스웹 허브(예전 배차마당) 공유 — "저장 + 허브 등록" 버튼으로 저장하면 오더마켓에도 같은 오더를 올린다.
// (2026-10-27 — 회사정보의 공유 온/오프 스위치는 없앴다. 이 버튼을 누르는 것 자체가 공유한다는 뜻) 오더마켓은 이 프로그램과
// 완전히 분리된 별도 사이트(cafe-site)라 코드는 공유하지 않고, 같은 Firestore 프로젝트의 cafeOrders 컬렉션에 직접 기록만 한다.
// ⭐ 2026-11-06 운송사 간 오더 거래 — 정확한 주소·연락처는 비공개 문서로 나눠 저장하고(매칭된 운송사에게만 공개),
//  저장된 오더 번호를 함께 남겨 상대 운송사의 배차/운송 진행이 이 오더에 반영되게 한다(src/orderMarketShare.js).
// 실패해도 정작 오더 저장 자체는 이미 끝났으므로 여기서 막지 않고 조용히 넘어간다.
if (shareToCafe) {
  (async () => {
    try {
      const [printerInfo, savedIds] = await Promise.all([fetchPrinterInfo(), savePromise.catch(() => [])]);
      // ⭐ 2026-11-07 허브 오더는 서버가 만들고 이 오더(첫 번째 저장 id)에 연결한다 — 배차 확정 · 운송완료가 이 오더에 채워진다
      const r = await shareToHub(db, { rec, savedIds, uid: auth.currentUser?.uid || "", profile: printerInfo || {} });
      if (!r.ok) showAlert(`${MARKET_SHORT}에 올리지 못했어요. ${r.reason || ""}`.trim());
      else if (!r.pending) showAlert(`${MARKET_SHORT}에 올렸어요`);
    } catch (e) { console.error(`${MARKET_SHORT} 등록 실패:`, e); showAlert(`${MARKET_SHORT}에 올리지 못했어요`); }
  })();
}

// ★ UI 즉시 초기화 (Firestore 백그라운드 기다리지 않음)
const reset = {
  ...emptyForm,
  _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  등록일: _todayStr(),
  ...(canMoney ? {} : { 청구운임: "", 기사운임: "", 수수료: "" }),
};
setForm(reset);
mainScanAi.commit(rec).catch(() => {}); // 🧠 오더 스캔 뒤 고친 칸을 회사별로 기억(스캔으로 연 등록일 때만 기록이 있다)
setVehicleQuery("");
setClientQuery("");
setAutoPickMatched(false);
setAutoDropMatched(false);
setConfirmOpen(false);
try { localStorage.removeItem("dispatchForm"); } catch {}
const finalCount = saveCount * (rec.회전방식 === "분리" && Number(rec.회전수) > 1 ? Number(rec.회전수) : 1);
setMultiCount(1);
setUseSeparateDates(false);
setOrderDates([]);
setIsSaving(false);
showAlert(finalCount > 1 ? `${finalCount}건 등록되었습니다.` : "등록되었습니다.");
setBottomStatusKey(k => k+1);

// ★ 백그라운드 저장 (UI 블로킹 없음)
if (typeof upsertPlace === "function") {
  savePlaceSmart(_pName, _pAddr, _pMgr, _pPhone, _pId, undefined,
    (_pOrderMemo !== undefined || _pOrderMemoShow !== undefined || _pNotice !== undefined) ? { 오더메모: _pOrderMemo, 팝업표시: _pOrderMemoShow, 기사전달주의사항: _pNotice } : undefined
  ).catch(() => {});
  savePlaceSmart(_dName, _dAddr, _dMgr, _dPhone, _dId, undefined,
    (_dOrderMemo !== undefined || _dOrderMemoShow !== undefined || _dNotice !== undefined) ? { 오더메모: _dOrderMemo, 팝업표시: _dOrderMemoShow, 기사전달주의사항: _dNotice } : undefined
  ).catch(() => {});
  // 경유 하차지 자동 등록
  [...(rec.경유하차목록 || []), ...(rec.경유상차목록 || [])].forEach(s => {
    if (s?.업체명?.trim()) {
      savePlaceSmart(s.업체명.trim(), s.주소 || "", s.담당자 || "", s.담당자번호 || "", null).catch(() => {});
    }
  });
}
if (_carNo && _name) {
  const existing = driverMap.get(_carNo.replace(/\s+/g, ""));
  if (!existing || existing.length === 0) {
    upsertDriver({ 차량번호: _carNo, 이름: _name, 전화번호: _tel }).catch(() => {});
  }
}

// ⭐ 화면은 이미 초기화됐지만 실제 Firestore 쓰기는 백그라운드에서 계속 진행 중 —
// 뒤늦게 실패하면 여기서 알려준다.
savePromise.catch((err) => {
  console.error("오더 저장 실패(백그라운드):", err);
  showAlert("오더 저장 중 오류가 발생했습니다. 배차현황에서 저장 여부를 확인해주세요.\n" + (err?.message || ""));
});
  } catch (err) {
    console.error("오더 저장 실패:", err);
    setIsSaving(false);
    showAlert("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\n" + (err?.message || ""));
  }
};
const isRoundTrip = form.운행유형 === "왕복";
const ROUND_DISCOUNT = 0.9; // ★ 10% 할인 (조정 가능)
    // ⭐ 다목적지 단가표 매칭 — 지금 입력 중인 하차지명/주소가 단가표 메뉴에 등록된
    // 하차지와 겹치면 "단가표" 버튼이 천천히 깜빡인다. 팝업을 열면 사용자가 입력한
    // 차량톤수 하나만이 아니라, 그 하차지에 등록된 모든 톤수 단가를 한꺼번에 보여준다.
    // ⚠️ 이 등록 폼은 상위(DispatchApp)와 별개 클로저라 상위에 선언한 상태를 그대로
    // 참조할 수 없다 — 반드시 이 스코프 안에서 직접 구독해야 한다.
    const [multiRateSheets, setMultiRateSheets] = React.useState([]);
    React.useEffect(() => {
      const co = (userCompany || localStorage.getItem("userCompany") || "").trim();
      if (!co) { setMultiRateSheets([]); return; }
      const q = query(collection(db, "multiRateSheets"), where("companyName", "==", co));
      const unsub = onSnapshot(q, (snap) => {
        setMultiRateSheets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
      return () => unsub();
    }, [userCompany]);
    const [rateSheetLookupOpen, setRateSheetLookupOpen] = React.useState(false);
    const normRateText = (s) => String(s || "").replace(/[\s()（）·]/g, "").toLowerCase();
    const rateSheetMatches = React.useMemo(() => {
      const dropName = normRateText(form.하차지명);
      const dropAddr = normRateText(form.하차지주소).slice(0, 12);
      if (!dropName && !dropAddr) return [];
      const results = [];
      (multiRateSheets || []).forEach(sheet => {
        (sheet.rows || []).forEach(r => {
          const rName = normRateText(r.name);
          const rAddr = normRateText(r.address).slice(0, 12);
          // 💰 2026-11-12 낱말 순서만 다른 이름도 같은 곳("용인 네이버" = "네이버용인")
          const tok = (v) => String(v || "").trim().split(/\s+/).map(normRateText).filter(Boolean).sort().join("|");
          const wordHit = isJyCompany(userCompany) && !!(dropName && rName && dropName.length === rName.length && tok(form.하차지명).includes("|") && [...tok(form.하차지명).split("|")].every((w) => rName.includes(w)));
          const nameHit = !!(dropName && rName && (rName.includes(dropName) || dropName.includes(rName))) || wordHit || (isJyCompany(userCompany) && aliasKeys(form.하차지명).includes(aliasKey(r.name)));
          const addrHit = !!(dropAddr && rAddr && dropAddr.length >= 6 && rAddr.length >= 6 && (rAddr.includes(dropAddr) || dropAddr.includes(rAddr)));
          if (nameHit || addrHit) results.push({ sheet, row: r, nameHit, addrHit });
        });
      });
      return results;
    }, [form.하차지명, form.하차지주소, multiRateSheets]);
    // 💰 2026-11-12 단가표 자동 입력 — 단가표(다목적지 단가표)에 "기준지(거래처 · 상차지) → 하차지 · 톤수" 단가가 있으면
    //  청구운임을 자동으로 넣는다(단가표 줄에 매입 단가 buyPrices가 있으면 기사운임도). 사람이 직접 넣은 금액은 덮어쓰지 않는다.
    //  · 맞는 줄 고르기: 하차지명이 같고(이름 일치) 톤수 칸이 똑같은 것 → 기준지가 거래처명 · 상차지명과 맞는 것 우선
    //  · 후보가 여러 개인데 금액이 서로 다르면 넣지 않는다(단가표 버튼으로 직접 확인)
    const manseOn = isJyCompany(userCompany) && isManse(form);
    const manseLearned = React.useMemo(() => (manseOn && Array.isArray(dispatchData) && dispatchData.length ? learnManse(dispatchData) : null), [manseOn, dispatchData]); // eslint-disable-line react-hooks/exhaustive-deps
    // 🏷 2026-11-24 고르기 규칙은 src/fareQuoteCore.js findRate(운임조회 › 운임 산출과 같음) + JY 별칭(평택초저온 = 베베숲 평택 · 에이제이 = 제이글로벌 …)
    const autoRate = React.useMemo(() => {
      if (!isJyCompany(userCompany)) return null; // 🏷 JY로지스틱스만
      // 톤수 칸이 비어 있고 차량종류 칸에 톤수("11톤")를 골랐으면 그 톤수로 찾는다
      const ton = String(form.차량톤수 || "").trim() || (/^\d+(\.\d+)?\s*톤/.test(String(form.차량종류 || "").trim()) ? String(form.차량종류).trim() : "");
      // 🌾 2026-11-24 만세보령 — 지역 × 수량(포) 단가표 + 비고 추가요금 · 기사운임은 지난 오더(구글시트 기록)로 배운 값(src/manseRateCore.js)
      if (isManse(form)) {
        const m = manseLearned ? quoteManse(form, manseLearned) : null;
        return m && m.sale ? { sale: m.sale, buy: m.buy || 0, label: `만세보령 ${m.tier.label}` } : null;
      }
      const r = findRate(multiRateSheets, { 거래처명: form.거래처명, 상차지명: form.상차지명, 하차지명: form.하차지명, 하차지주소: form.하차지주소, 톤수: ton }, { aliases: true });
      if (!r || r.ambiguous) return null;
      return { ...r, label: `${r.sheetName || ""} → ${r.rowName} · ${r.tonUp ? `${ton} → ${r.ton} 단가` : r.ton}` }; // 📏 단가표에 없는 톤수는 바로 위 톤수
    }, [multiRateSheets, manseLearned, form.차량톤수, form.차량종류, form.하차지명, form.하차지주소, form.화물내용, form.경유하차목록, form.거래처명, form.상차지명]);
    const autoRateRef = React.useRef({ sale: "", buy: "" }); // 마지막으로 자동 입력한 금액(사람이 고쳤는지 구분)
    React.useEffect(() => {
      if (!autoRate || !canMoney) return;
      // 🛠 2026-11-26 "에브리데이 시화"를 처음 넣으면 다른 금액이 나오던 문제 — 노선 고정(야상 · 대행료)이 청구운임 · 기사운임에 더한 금액 때문에
      //  "사람이 고친 금액"으로 보고 단가표 금액을 더 이상 안 바꿨다 → 특수운임으로 더한 몫을 빼고(단가 부분만) 견주고, 넣을 때는 다시 더한다
      const digits = (v) => String(v ?? "").replace(/[^\d-]/g, "");
      const addC = (Number(form.지게차청구추가) || 0) + (Number(form.특수청구추가) || 0); // 청구에 더해 둔 몫
      const dedD = (Number(form.지게차기사차감) || 0) + (Number(form.특수기사차감) || 0); // 기사운임에서 뺀 몫(기사에게 더 준 것은 −)
      const curSaleT = digits(form.청구운임), curBuyT = digits(form.기사운임);
      const curSale = curSaleT ? String((Number(curSaleT) || 0) - addC) : "";
      const curBuy = curBuyT ? String((Number(curBuyT) || 0) + dedD) : "";
      const last = autoRateRef.current;
      const saleFree = !curSale || curSale === last.sale || curSale === "0"; // 비어 있거나 지난번 자동 입력 값 그대로
      const buyFree = !curBuy || curBuy === last.buy || curBuy === "0";
      if (saleFree && curSale !== String(autoRate.sale)) { autoRateRef.current = { ...autoRateRef.current, sale: String(autoRate.sale) }; onChange("청구운임", String(Number(autoRate.sale) + addC)); }
      // 지난번에 자동으로 넣은 기사운임인데 이번 단가표 줄에는 매입 단가가 없으면 비운다(다른 하차지 금액이 남지 않게)
      if (!autoRate.buy && curBuy && curBuy === last.buy) { autoRateRef.current = { ...autoRateRef.current, buy: "" }; setTimeout(() => onChange("기사운임", dedD ? String(-dedD) : ""), 0); }
      if (autoRate.buy && buyFree && curBuy !== String(autoRate.buy)) { autoRateRef.current = { ...autoRateRef.current, buy: String(autoRate.buy) }; setTimeout(() => onChange("기사운임", String(Number(autoRate.buy) - dedD)), 0); }
    }, [autoRate?.sale, autoRate?.buy, autoRate?.label]); // eslint-disable-line react-hooks/exhaustive-deps
    // ⭐ 운임조회 팝업 상태
    const [fareModalOpen, setFareModalOpen] = React.useState(false);
const [fare3Filter, setFare3Filter] = React.useState("all");
const [fareResult, setFareResult] = React.useState(null);
const [fareSortMode, setFareSortMode] = React.useState("relevance");
const [fareQuickOpen, setFareQuickOpen] = React.useState(false);
const [fareQuickMatches, setFareQuickMatches] = React.useState([]);
    const [expandedMemo, setExpandedMemo] = React.useState(null);
    // ⭐ 운임조회 (송원 전용 자동요율 → 그 다음 AI 통계)
const handleFareSearch = () => {
  // ✅ 반드시 맨 위
  const pickup = (form.상차지명 || "").trim();
  const drop   = (form.하차지명 || "").trim();
  const tonStr = (form.차량톤수 || "").trim();
  const cargo  = (form.화물내용 || "").trim();
 const vehicle = (
  vehicleQuery?.trim() || form.차량종류 || ""
).trim();

  if (!pickup || !drop) {
    showAlert("상차지명과 하차지명을 입력해주세요.");
    return;
  }
  // ⭐ 전체 데이터
  const fullData = Array.isArray(dispatchData) ? [...dispatchData] : [];
  // ================================
// 📜 순수 과거 운송 기록
// ================================
const _todayKst5 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const pastHistoryList = fullData
  .filter(r => {
    if ((r.상차일 || "").slice(0, 10) === _todayKst5) return false;
    if ((r.운행유형 || "편도") !== form.운행유형) return false;
        // ⭐ 차량 그룹 강제 추가 (이게 핵심)
    if (vehicle) {
      if (
        normalizeVehicleGroup(r.차량종류) !==
        normalizeVehicleGroup(vehicle)
      ) {
        return false;
      }
    }
    if (!r.상차지명 || !r.하차지명) return false;

    const inputPickupStops = parseStops(pickup);
    const inputDropStops   = parseStops(drop);
    const rowPickupStops   = parseStops(r.상차지명);
    const rowDropStops     = parseStops(r.하차지명);

    if (inputPickupStops.length !== rowPickupStops.length) return false;
    if (inputDropStops.length !== rowDropStops.length) return false;

    const sameStops = (a, b) =>
  a.length === b.length &&
  a.every((name, i) =>
    name.trim() === b[i].trim()
  );

    if (!sameStops(inputPickupStops, rowPickupStops)) return false;
    if (!sameStops(inputDropStops, rowDropStops)) return false;

    return true;
  })
  .sort((a, b) =>
    String(b.상차일 || "").localeCompare(String(a.상차일 || ""))
  );
      // -----------------------------
      // 🔧 공통 유틸 (기존 로직 유지)
      // -----------------------------
      const extractPalletNum = (text = "") => {
        const str = String(text).trim();
        if (!str) return null;
        const m = str.match(/(\d+)\s*(p|P|파|팔|파레|파렛|파렛트|팔레트|PL)/);
        if (m) return Number(m[1]);
        const m2 = str.match(/^\s*(\d+)\s*$/);
        if (m2) return Number(m2[1]);
        return null;
      };
      const extractLeadingNum = (text = "") => {
        const m = String(text).trim().match(/^(\d+)/);
        return m ? Number(m[1]) : null;
      };
      const inputPallets = getTotalPalletFromOrder(form);
      const inputCargoNum = extractLeadingNum(cargo);
      const inputTonNum = getTotalTonFromOrder(form);
// ================================
// 🔑 화물 유형 판별
// ================================
// pallet: 파렛트 수가 명확한 경우
// ton: 파렛트 아님 → 톤수 기준
const cargoType =
  inputPallets != null
    ? "PALLET"
    : inputTonNum != null
    ? "TON"
    : "UNKNOWN";

      // ============================================
      // ① 송원 / 신미 / 푸드플래닛 전용 자동요율 우선 적용
      // ============================================
      const palletCount =
        inputPallets != null ? inputPallets :
        inputCargoNum != null ? inputCargoNum :
        getTotalPalletFromOrder(form); // 숫자만 있으면 이것도 처리 (경유지 포함 합산)

      if (palletCount != null && isLike(pickup, "송원")) {
        const dropCount = getDropCountFromText(drop);          // 1곳/2곳/3곳
        const hasFood = (
  isLike(drop, "푸드플래닛") ||
  isLike(drop, "푸드") ||
  isLike(drop, "푸플")
);

const hasSinmi = (
  isLike(drop, "신미")
);
        let selectedFare = null;
        // 🔹 2곳 하차 (신미 + 푸드플래닛) — 순서는 상관없이
        if (dropCount >= 2 && hasFood && hasSinmi) {
          const rule = palletFareRules.double.find(
            (r) => palletCount >= r.min && palletCount <= r.max
          );
          if (rule) selectedFare = rule.fare;
        }
        // 🔹 푸드플래닛 1곳 하차
        if (!selectedFare && dropCount === 1 && hasFood && !hasSinmi) {
          const rule = palletFareRules.food.find(
            (r) => palletCount >= r.min && palletCount <= r.max
          );
          if (rule) selectedFare = rule.fare;
        }
        // 🔹 신미 1곳 하차 (3파렛은 선택)
        if (!selectedFare && dropCount === 1 && hasSinmi && !hasFood) {
          const rule = palletFareRules.sinmi.find(
            (r) => palletCount >= r.min && palletCount <= r.max
          );
          if (rule) {
            if (Array.isArray(rule.fare)) {
              // 3파렛: 18/20 둘 중 선택
              const yes = window.confirm(
                "신미 3파레트 요율 선택\n\n[확인] 180,000원\n[취소] 200,000원"
              );
              selectedFare = yes ? rule.fare[0] : rule.fare[1];
            } else {
              selectedFare = rule.fare;
            }
          }
        }

        // 👉 여기서 금액이 결정되었으면, AI추천 안 쓰고 바로 적용
        if (selectedFare != null) {
          setForm((prev) => ({
            ...prev,
            청구운임: String(selectedFare),
          }));
          showAlert(`송원 전용 자동요율이 적용되었습니다.\n\n적용 운임: ${Number(selectedFare).toLocaleString()}원`);
          return; // ⬅ AI 통계 로직으로 내려가지 않음
        }
      }
      let filtered = fullData.filter((r) => {
  if ((r.운행유형 || "편도") !== form.운행유형) return false;
        // ================================
// 🚨 경유/단일 운송 판별 (가장 먼저)
// ================================
const inputPickupStops = parseStops(pickup);
const inputDropStops   = parseStops(drop);
const rowPickupStops = parseStops(r.상차지명);
const rowDropStops   = parseStops(r.하차지명);
// ❌ 경유 개수 다르면 같은 운송 아님
if (inputPickupStops.length !== rowPickupStops.length) return false;
if (inputDropStops.length !== rowDropStops.length) return false;
// ❌ 경유 구성 다르면 제외 (순서 포함)
const sameStops = (a, b) =>
  a.length === b.length &&
  a.every((name, i) =>
    name.trim() === b[i].trim()
  );
if (!sameStops(inputPickupStops, rowPickupStops)) return false;
if (!sameStops(inputDropStops, rowDropStops)) return false;

        if (!r.상차지명 || !r.하차지명) return false;

        const rPickup = String(r.상차지명).trim();
        const rDrop = String(r.하차지명).trim();

// ✅ 상차 / 하차 "완전 동일"만 허용
// ⚠️ 예전에는 양쪽 다 상차지Id/하차지Id가 있으면 이름은 무시하고 Id만 비교했다.
// 같은 이름의 거래처가 중복 등록(거래처 중복 문서)되어 있으면 과거 오더의 Id와
// 지금 선택한 거래처의 Id가 서로 달라 이름이 완전히 같은데도 매칭에서 빠지는
// 사고가 있었다(예: 기장물산랩 2건 중 1건이 조용히 누락). 이름이 완전히 같으면
// 항상 동일 장소로 인정하고, Id 일치는 "추가로" 매칭시키는 보조 조건으로만 쓴다.
const matchPickup =
  rPickup === pickup ||
  (!!r.상차지Id && !!form.상차지Id && r.상차지Id === form.상차지Id);

const matchDrop =
  rDrop === drop ||
  (!!r.하차지Id && !!form.하차지Id && r.하차지Id === form.하차지Id);

if (!matchPickup || !matchDrop) return false;
const matchVehicle =
  !vehicle
    ? true
    : normalizeVehicleGroup(r.차량종류) ===
      normalizeVehicleGroup(vehicle);
if (!matchVehicle) return false;

        // 톤수 비교
        let matchTon = true;
        if (inputTonNum != null) {
          const rowTonNum = getTotalTonFromOrder(r);
          if (rowTonNum != null) {
            matchTon = Math.abs(rowTonNum - inputTonNum) <= 0.5;
          }
        }

        // 화물내용 비교
        let matchCargo = true;
        const rowCargo = String(r.화물내용 || "");
        const normInputCargo = norm(cargo);
        const normRowCargo = norm(rowCargo);

        if (inputPallets != null) {
  const rowPallets = getTotalPalletFromOrder(r);

  // ⭐ 파렛트 수량이 달라도 후보에 포함
  matchCargo = true;

} else if (inputCargoNum != null) {
  const rowNum = extractLeadingNum(rowCargo);

  // ⭐ 박스 수량 달라도 후보 포함
  matchCargo = true;

} else {
  if (
    normRowCargo.includes(normInputCargo) ||
    normInputCargo.includes(normRowCargo)
  ) {
    matchCargo = true;
  } else {
    matchCargo = matchTon;
  }
}
        return matchVehicle;
      });
      // Add _match labels to each filtered record
      filtered = filtered.map(r => {
        const rowTonNum = getTotalTonFromOrder(r);
        const tonExact = inputTonNum != null && rowTonNum != null && Math.abs(rowTonNum - inputTonNum) <= 0.5;
        const rowPallets = getTotalPalletFromOrder(r);
        const cargoExact = fareCargoExact(cargo, r.화물내용, inputPallets, rowPallets);
        const cargoPartial = fareCargoPartial(cargo, r.화물내용, inputPallets, rowPallets);
        const label = getFareMatchLabel(cargoExact, cargoPartial, tonExact);
        return { ...r, _match: { label, tonExact, cargoExact, cargoPartial } };
      });
      if (!filtered.length) {
        showAlert("유사한 과거 운임 데이터를 찾지 못했습니다.");

        return;
      }
      const fares = filtered
        .map((r) =>
          Number(String(r.청구운임 || "0").replace(/,/g, ""))
        )
        .filter((n) => !isNaN(n));
// ================================
// ⭐ 입력 조건 정리
// ================================
const inputCond = {
  pickup,
  drop,
  pallet: palletCount,
  vehicle,
  ton: inputTonNum,
};
// ⭐ 유사도 점수 부여
const scoredList = filtered.map(r => ({
  ...r,
  __score: calcFareMatchScore(r, inputCond),
}));

// ⭐ 거의 동일 / 유사 분리
const exactLike = scoredList.filter(r => {
  const rowPallet = getTotalPalletFromOrder(r);

  return (
    r.__score >= 90 &&
    rowPallet === inputCond.pallet   // ★ 파렛트 완전 일치
  );
});
const similarTop = scoredList
  .filter(r => r.__score >= 60 && r.__score < 90)
  .sort((a, b) => b.__score - a.__score)
  .slice(0, 3);

      if (!fares.length) {
       showAlert("해당 조건의 과거 데이터에 청구운임 정보가 없습니다.");
        return;
      }
      const avg = Math.round(
        fares.reduce((a, b) => a + b, 0) / fares.length
      );
      const min = Math.min(...fares);
      const max = Math.max(...fares);
      const latestRow = filtered
        .slice()
        .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")))[0];
      const latestCargo =
        latestRow?.화물내용?.trim() ? latestRow.화물내용 : "(기록 없음)";
// ================================
// ⭐ 운임 결과 중복 제거 (조건 + 청구운임 기준)
// ================================
const dedupMap = new Map();

// 최신순 정렬 → 먼저 들어온 것만 유지
filtered
  .slice()
  .sort((a, b) =>
    String(b.상차일 || "").localeCompare(String(a.상차일 || ""))
  )
  .forEach((r) => {
    const key = makeFareDedupKey(r);
    if (!dedupMap.has(key)) {
      dedupMap.set(key, r);
    }
  });

const dedupedList = Array.from(dedupMap.values());
// ================================
// ⭐ 과거 운송 기록도 동일 기준으로 중복 제거
// ================================
const pastDedupMap = new Map();

pastHistoryList
  .slice()
  .sort((a, b) =>
    String(b.상차일 || "").localeCompare(String(a.상차일 || ""))
  )
  .forEach((r) => {
    const key = makeFareDedupKey(r);
    if (!pastDedupMap.has(key)) {
      pastDedupMap.set(key, r);
    }
  });

const pastDedupedList = Array.from(pastDedupMap.values());
// ================================
// ⭐ 최종 운임 결과 세팅 (단 한 번만!)
// ================================
setFareResult({
  pickupStops: parseStops(pickup),
  dropStops: parseStops(drop),
  count: dedupedList.length,
  avg,
  min,
  max,
  latestFare: latestRow.청구운임,
  latestDate: latestRow.상차일,
  latestCargo,
  exactLike,
  similarTop,
  filteredList: dedupedList,
  pastHistoryList: pastDedupedList,
});

// ★ 빠른 선택: 동일 파렛수/화물 + 차량종류, 톤수근접 기준 최신 5건
const _inputPallet = getTotalPalletFromOrder(form);
const _inputCargoText = (form.화물내용 || "").trim();
const _inputVehicle = (vehicleQuery?.trim() || form.차량종류 || "").trim().toLowerCase();
const _inputTonQ = getTotalTonFromOrder(form);

const _quickMatches = (() => {
  // 1단계: 차량종류 필터
  const vehicleFiltered = pastDedupedList.filter(r => {
    if (!_inputVehicle) return true;
    const rv = (r.차량종류 || "").toLowerCase();
    const isCold = _inputVehicle.includes("냉장") || _inputVehicle.includes("냉동");
    if (isCold) return rv.includes("냉장") || rv.includes("냉동");
    return rv.includes(_inputVehicle) || _inputVehicle.includes(rv);
  });

  // 2단계: 화물+톤수 근접도 점수 부여
  const scored = vehicleFiltered.map(r => {
    const rPallet = getTotalPalletFromOrder(r);
    const rTon = getTotalTonFromOrder(r);
    let cargoDiff = 999, tonDiff = 999;
    if (_inputPallet != null && rPallet != null) cargoDiff = Math.abs(rPallet - _inputPallet);
    else cargoDiff = (r.화물내용||"").trim() === _inputCargoText ? 0 : 1;
    if (_inputTonQ != null && rTon != null) tonDiff = Math.abs(rTon - _inputTonQ);
    return { ...r, _cargoDiff: cargoDiff, _tonDiff: tonDiff };
  });

  // 3단계: 화물일치 우선, 톤수근접, 최신순으로 정렬 후 상위 5건
  return scored
    .sort((a, b) => {
      if (a._cargoDiff !== b._cargoDiff) return a._cargoDiff - b._cargoDiff;
      if (a._tonDiff !== b._tonDiff) return a._tonDiff - b._tonDiff;
      return (b.상차일||"").localeCompare(a.상차일||"");
    })
    .slice(0, 5);
})();

setFareQuickMatches(_quickMatches);

if (_quickMatches.length > 0) {
  setFareQuickOpen(true); // 빠른 선택 팝업 먼저
} else {
  setFareModalOpen(true); // 바로 전체 목록
}
};
    // ------------------ 오더복사 ------------------

// 🔎 오더복사용 상태
const [copyOpen, setCopyOpen] = React.useState(false);
const [copyQ, setCopyQ] = React.useState("");
const [copyStart, setCopyStart] = React.useState("");
const [copyEnd, setCopyEnd] = React.useState("");
const [copyFilterType, setCopyFilterType] = React.useState("전체");
const [onlyRoundTrip, setOnlyRoundTrip] = React.useState(false);
const [copyShowMore, setCopyShowMore] = React.useState(false);
const [copyDateHint, setCopyDateHint] = React.useState(null); // {origPickup, origDrop}
// ⭐ 오더복사·운임 추천/비교·운임조회는 예전 오더 전체가 필요 — 복사창을 열거나 상·하차지를 다 입력하면 1회 불러온다
useLoadFullOrderHistory(copyOpen || !!(String(form.상차지명 || "").trim() && String(form.하차지명 || "").trim()));
// 🗂 2026-11-13 담당노선구분(켠 운송사만) — 거래처 · 상차지를 넣으면 그 조합으로 가장 많이 쓴 구분을 자동으로 넣는다(비어 있을 때만 · 바꿀 수 있음)
const rgFormOn = useCompanyFeatures(getTenant() || userCompany).routeGroups === true;
const rgSuggest = React.useMemo(() => {
  if (!rgFormOn) return "";
  const c = String(form.거래처명 || "").trim(), f = String(form.상차지명 || "").trim();
  if (!c || !f) return "";
  const m = new Map();
  (Array.isArray(dispatchData) ? dispatchData : []).forEach((r) => { if (String(r.거래처명 || "").trim() !== c || String(r.상차지명 || "").trim() !== f) return; const g = routeGroupOf(r); if (g) m.set(g, (m.get(g) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}, [rgFormOn, form.거래처명, form.상차지명, dispatchData]);
React.useEffect(() => { if (rgSuggest && !String(form.담당노선구분 || "").trim()) onChange("담당노선구분", rgSuggest); }, [rgSuggest]); // eslint-disable-line react-hooks/exhaustive-deps
// 예전 날짜로 등록하면(순번·중복 확인용) 그 날짜 오더를 불러온다
useLoadOrderRange(form.상차일 && form.상차일 < pcLiveWindowStart() ? form.상차일 : null, form.상차일);
const [showAmPmError, setShowAmPmError] = React.useState(false);
// ⭐ 사용자 요청 — F4를 누르면 "오더복사" 버튼을 누른 것과 동일하게 팝업이 뜨고,
// 뜨자마자 검색어 입력칸에 바로 타이핑할 수 있어야 한다. 다른 입력칸에 포커스가
// 있는 중에 F4가 눌려도(값 입력 중 실수 등) 그대로 가로채 팝업을 연다 — F4는
// 브라우저/OS가 쓰는 키가 아니라 텍스트 입력에서 의미 있게 쓰일 일이 없다.
React.useEffect(() => {
  const onKeyDown = (e) => {
    if (e.key !== "F4") return;
    e.preventDefault();
    setCopyOpen(true);
    setCopySelected([]);
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
// 🔍 오더복사 리스트
// ⭐ 2026-10-27 속도 — 예전엔 글자 하나 칠 때마다 13개월치 오더 전체(수천~만 건)를 거르고, 경유지 글자를 풀고,
//    정렬까지 다시 했다(F4 검색이 버벅이던 원인). 창이 열려 있을 때 데이터가 바뀔 때만 한 번
//    "최신순 정렬 + 검색용 글자"를 만들어 두고, 타이핑 때는 그 글자에서 찾기만 한다. 입력도 먼저 반응하게 검색은 한 박자 늦게.
const copyIndex = React.useMemo(() => {
  if (!copyOpen) return [];
  const safeArr = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  };
  const low = (v) => String(v || "").toLowerCase();
  const arr = (Array.isArray(dispatchData) ? dispatchData : []).map((r) => ({
    r,
    hay: [r.거래처명, r.상차지명, r.하차지명, r.화물내용].map(low).join("\u0001"),
    via: [...safeArr(r.경유상차목록), ...safeArr(r.경유하차목록)].map((x) => x?.업체명 || "").join(" ").toLowerCase(),
  }));
  arr.sort((a, b) =>
    (b.r.상차일 || "").localeCompare(a.r.상차일 || "") ||
    (b.r.상차시간 || "").localeCompare(a.r.상차시간 || "")
  );
  return arr;
}, [copyOpen, dispatchData]);
const copyQDeferred = React.useDeferredValue(copyQ);
const copyList = React.useMemo(() => {
  const q = copyQDeferred.trim().toLowerCase();

  // 검색어 없으면 비표시 (기존 기능 유지)
  if (!q) return [];
  const fv = filterType && filterValue ? String(filterValue).toLowerCase() : null;
  // 최신순(이미 정렬됨) · 조건 기준 중복 제거(먼저 들어온 최신 1건이 대표)
  const dedupMap = new Map();
  for (const { r, hay, via } of copyIndex) {
    if (onlyRoundTrip && r.운행유형 !== "왕복") continue; // ★ 왕복만 보기
    if (fv !== null && String(r[filterType] || "").toLowerCase() !== fv) continue; // ★ 현황패널 필터
    const hit = copyFilterType !== "전체"
      ? String(r[copyFilterType] || "").toLowerCase().includes(q)
      : (hay.includes(q) || via.includes(q)); // ✓ 경유지명도 검색
    if (!hit) continue;
    const key = makeCopyOrderKey(r);
    if (!dedupMap.has(key)) dedupMap.set(key, r);
  }
  return Array.from(dedupMap.values());
}, [copyIndex, copyQDeferred, copyFilterType, filterType, filterValue, onlyRoundTrip]);

// 오더복사 기본 표시 목록 — ⭐ 2026-10-28: 위 기준(거래처·상차지·하차지·차량종류)으로 이미 한 건씩만 남으므로
// 그대로 다 보여준다(상차로 1건, 하차로 1건, 차량종류·거래처가 다르면 그만큼). 한 번에 300건까지만 그린다.
const copyListShort = React.useMemo(() => copyList.slice(0, 300), [copyList]);

// 검색어/필터 변경 시 더보기 초기화
React.useEffect(() => { setCopyShowMore(false); }, [copyQ, copyFilterType]);

const [copySelected, setCopySelected] = React.useState([]);

// 🔥 오더 복사 전용 (유일한 진입점)
// 🛠 2026-11-27 시간은 오전/오후가 붙은 값만 복사(예전 오더의 '09:00' · '9시'를 그대로 복사하면 시간칸엔 빈칸으로 보이는데 저장 때 "오전/오후를 함께 선택해주세요"로 막혔다)
//  quick: 한 줄 빠른 등록 — 지난 노선의 시간 · 메모 · 원본 오더에만 적힌 담당자는 가져오지 않는다(문장에 없는 값이 조용히 들어오지 않게)
const copyTimeOf = (t) => {
  const s = String(t || "").trim();
  if (/^오[전후] /.test(s)) return s;
  const m = s.match(/^(\d{1,2}):(\d{2})$/); // 24시간 표기만 오전/오후로 바꾼다("9시"처럼 오전·오후를 모르는 값은 비운다)
  if (!m) return "";
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h > 23 || mm > 59) return "";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? "오전" : "오후"} ${hh}시${mm ? ` ${mm}분` : ""}`;
};
const applyCopy = (r, opt = {}) => {
  const quick = opt.quick === true;
  bizSeedRef.current = String(r.청구사업자 || "").trim(); bizManualRef.current = null; // ⭐ 2026-11-03 청구 사업자 자동 맞춤에 복사한 오더의 사업자를 넘긴다
  const pickupPlace = findPlaceByName(r.상차지명);
  const dropPlace   = findPlaceByName(r.하차지명);

  // ✅ 복사하는 순간의 "실시간 현재 날짜" 강제 생성
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const todayStr = now.toISOString().slice(0, 10);

  // 🔥 핵심 추가: 화물내용에서 화물타입 자동 감지
  const rawCargo = r.화물내용 || "";
  const detectedType = detectCargoType(rawCargo);
  const cargoBase = extractCargoBase(rawCargo);

    const keep = {
    거래처명: isDateLike(r.거래처명) ? "" : (r.거래처명 || ""),
    청구사업자: r.청구사업자 || "", // ⭐ 2026-11-03 여러 사업자 — 복사해도 같은 사업자로

    // ✅ 상차지
    상차지명: r.상차지명 || "",
    상차지주소: pickupPlace?.주소 || r.상차지주소 || "",
    상차지담당자: pickupPlace?.담당자 || (quick ? "" : r.상차지담당자) || "",
    상차지담당자번호: pickupPlace?.담당자번호 || (quick ? "" : r.상차지담당자번호) || "",

    // ✅ 하차지
    하차지명: r.하차지명 || "",
    하차지주소: dropPlace?.주소 || r.하차지주소 || "",
    하차지담당자: dropPlace?.담당자 || (quick ? "" : r.하차지담당자) || "",
    하차지담당자번호: dropPlace?.담당자번호 || (quick ? "" : r.하차지담당자번호) || "",

// ✅ 경유지 복사 (두 필드 모두 체크 - length로 빈배열 vs 빈배열 처리)
경유상차목록: (() => { const pa=(v)=>{if(Array.isArray(v))return v;try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch{return[];}};const a=pa(r.경유상차목록);const b=pa(r.경유지_상차);return a.length?a:b; })(),
    경유하차목록: (() => { const pa=(v)=>{if(Array.isArray(v))return v;try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch{return[];}};const a=pa(r.경유하차목록);const b=pa(r.경유지_하차);return a.length?a:b; })(),
    경유지_상차: (() => { const pa=(v)=>{if(Array.isArray(v))return v;try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch{return[];}};const a=pa(r.경유지_상차);const b=pa(r.경유상차목록);return a.length?a:b; })(),
    경유지_하차: (() => { const pa=(v)=>{if(Array.isArray(v))return v;try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch{return[];}};const a=pa(r.경유지_하차);const b=pa(r.경유하차목록);return a.length?a:b; })(),

    // 기타 — ⭐ 화물내용·톤수는 오더마다 달라서 복사하지 않는다(빈칸, 2026-10-28 사용자 요청)
    화물내용: "",
    화물타입: detectedType,
    차량종류: r.차량종류 || "",
    차량톤수: "",
    상차방법: r.상차방법 || "",
    하차방법: r.하차방법 || "",
    상차일: todayStr,
    하차일: todayStr,
    상차시간: quick ? "" : copyTimeOf(r.상차시간),
    상차시간기준: quick || !copyTimeOf(r.상차시간) ? null : r.상차시간기준 ?? null,
    하차시간: quick ? "" : copyTimeOf(r.하차시간),
    하차시간기준: quick || !copyTimeOf(r.하차시간) ? null : r.하차시간기준 ?? null,
    지급방식: r.지급방식 || "",
    배차방식: "",
    메모: quick ? "" : r.메모 || "",
    // 전달사항은 원본에서 "고정"을 눌러둔 경우에만 복사본으로 함께 넘어와야 한다 —
    // 고정하지 않고 저장한 오더의 전달사항은 그 오더에만 해당하는 일회성 내용이라
    // 오더복사/동일 노선 재입력 시 그대로 따라와서는 안 된다.
    전달사항: r.전달사항고정 === true ? (r.전달사항 || "") : "",
    전달사항고정: r.전달사항고정 === true,
    운행유형: r.운행유형 || "편도",
    긴급: r.긴급 === true,
    운임보정: r.운임보정 || null,
    // ⭐ 2026-11-02 운임규칙 — 복사해 오는 오더의 운임구분도 함께(규칙 사용 회사만)
    ...(fareOn && r.운임구분 ? { 운임구분: r.운임구분, 운임수동: false } : {}),
  };
  setForm((p) => ({ ...p, ...keep }));

  // 🔥 UI 동기화
  setClientQuery(keep.거래처명);
  setVehicleQuery(keep.차량종류 || "");
  setAutoPickMatched(true);
  setAutoDropMatched(true);
setCopyOpen(false);
  setCopySelected([]);

  // 하차일 날짜 힌트: 원본 오더가 다음날 하차였으면 알림
  if (r.상차일 && r.하차일 && r.하차일 > r.상차일) {
    setCopyDateHint({ origPickup: r.상차일, origDrop: r.하차일 });
  } else {
    setCopyDateHint(null);
  }

  // 🚫 복사된 오더 거래처 등급/메모 체크 — 상차지·하차지 양쪽 다 해당되면 둘 다
  // 순서대로 안내한다(예전에는 먼저 찾은 것 하나만 뜨고 나머지는 무시됐음).
  const namesToCheck = [keep.거래처명, keep.상차지명, keep.하차지명]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i); // 중복 제거
  const alertTargets = namesToCheck
    .map(n => findClientAlertTarget(n))
    .filter(Boolean)
    .filter((v, i, arr) => arr.findIndex(x => (x.업체명 || x.거래처명) === (v.업체명 || v.거래처명)) === i);

  // 담당자 복수 선택 팝업 (오더복사) — 메모/등급 안내 뒤에 이어서 보여준다.
  const popupItems = [];
  const checkCopyContact = (place, type) => {
    if (!place) return;
    const contacts = (place.contacts || []).filter(c => c.name?.trim());
    const unique = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
    if (unique.length > 1) popupItems.push({ type, place, contacts: unique });
  };
  checkCopyContact(pickupPlace, "pickup");
  checkCopyContact(dropPlace, "drop");

  // 오더복사는 상/하차지 중 어느 쪽 안내든 전부 확인한 뒤에는 항상 상차지명으로
  // 포커스가 돌아온다. "복사되었습니다" 알림을 먼저 확인해야 이 체인이 시작되도록
  // 여기서는 바로 띄우지 않고 저장해둔다 (호출부에서 showAlert(msg, then)으로 실행).
  pendingCopyChainRef.current = () => {
    showClientAlertChain(alertTargets, { contactItems: popupItems, finalFocusId: "pickup-place-input", alwaysFocus: true });
  };
};

    // ------------------ 초기화 ------------------
    const resetForm = () => {
      const reset = { ...emptyForm, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, 등록일: _todayStr() };
      setForm(reset);
      setClientQuery("");
      setVehicleQuery("");
      setAutoPickMatched(false);
      setAutoDropMatched(false);
      setCopySelected([]);  // ★ 체크 상태 초기화
    };
    // =========================================================
    // 📤 공유 (모바일: 카톡 공유창 / PC: 텍스트 복사)
    // =========================================================
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const shareTextForRow = (r) => {
      const dStr = r.상차일 || _todayStr(); // YYYY-MM-DD 유지
      const plate = r.차량번호 || "-";
      const name = r.이름 || "-";
      // ⭐ 2026-11-08 보안 — 오더 id만 있는 링크는 전환 기간 뒤 막힌다 → 토큰이 든 짧은 링크로
      const url = issueUploadUrl(r);
      return `[${bizOf(r, userCompany) || "운송사"} 운송장 업로드 안내]

✓ 상차일: ${dStr}
✓ 거래처: ${r.거래처명 || "-"}
✓ 차량: ${plate} (${name})

아래 링크에서 운송장/인수증 사진을 업로드해주세요↓
+ ${url}`;
    };
    const shareDispatch = async (r) => {
      const text = shareTextForRow(r);
      const url = issueUploadUrl(r);
      if (isMobile && navigator.share) {
        try { await navigator.share({ title: `${userCompany || "운송사"} 업로드 안내`, text, url }); } catch { }
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
       showAlert("공유 문구가 클립보드에 복사되었습니다. 카카오톡이나 메신저에 붙여 넣으세요.");
      } catch {
        (await kpPrompt("아래 내용을 복사하세요.", text));
      }
    };
    // =========================================================
    // 📎 첨부 모달 열기 트리거
    // =========================================================
    const openAttachModal = (row) => {
      try { window.dispatchEvent(new CustomEvent("RUN25_OPEN_ATTACH", { detail: row })); } catch { }
      if (typeof window.RUN25_OPEN_ATTACH_CB === "function") {
        try { window.RUN25_OPEN_ATTACH_CB(row); } catch { }
      }
    };

    // ───── 내부 렌더: 입력폼 (그대로 유지) ─────
// =======================
// KakaoT Minimal Clean Theme
// =======================

// 오더 정보 카드 스타일 — A: 카드형, B: 밑줄형(기본 — 직접 A로 바꾼 사용자만 A 유지). 사용자가 마지막으로
// 선택한 스타일을 localStorage에 저장해 재접속/다른 탭 이동 후에도 유지한다.
// ⭐ 2026-10-28 — A: 원래 밑줄형(기본 고정), B: 둥근 박스형(디지털). 사용자가 B로 바꾼 경우에만 B 유지.
//    (예전 저장값과 뜻이 바뀌어 새 이름 "orderCardStyle2"로 저장 — 모두 A부터 시작)
const [orderCardStyle, setOrderCardStyle] = React.useState(() => {
  try { return localStorage.getItem("orderCardStyle2") === "B" ? "B" : "A"; } catch { return "A"; }
});
const toggleOrderCardStyle = () => {
  setOrderCardStyle(prev => {
    const next = prev === "A" ? "B" : "A";
    try { localStorage.setItem("orderCardStyle2", next); } catch {}
    return next;
  });
};

// 입력창 (A: 밑줄형 — 원래 디자인 / B: 둥근 박스형 — 디지털)
const inputCls = orderCardStyle === "A"
  ? "w-full border-0 border-b-2 border-gray-300 rounded-none px-1 py-2 text-[13px] font-bold text-gray-900 bg-transparent focus:outline-none focus:border-[#1B2B4B] transition"
  : "w-full h-10 px-3 rounded-[11px] border border-[#E3E8F0] bg-[#F7F9FC] text-[13.5px] font-bold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none focus:bg-white focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/15 focus:shadow-[0_0_0_6px_rgba(143,176,240,0.16)] transition"; // ⭐ 2026-11-03 포커스 링 통일(남색 2px + 은은한 빛)

// 라벨 — min-h + flex로 아이콘 버튼이 붙은 라벨과 일반 텍스트 라벨의 높이를 통일
const labelCls = orderCardStyle === "A"
  ? "flex items-center h-[22px] overflow-visible text-[15px] font-semibold text-black mb-1"
  : "flex items-center gap-1 h-[22px] overflow-visible whitespace-nowrap text-[12.5px] font-extrabold tracking-[0.01em] text-[#3A4A66] mb-1.5";

// 메모/전달사항 textarea (A: 밑줄형 / B: 박스형)
const textareaCls = orderCardStyle === "A"
  ? "w-full border-0 border-b-2 border-gray-300 rounded-none px-1 py-2 text-[13px] font-bold text-gray-900 bg-transparent resize-none focus:outline-none focus:border-[#1B2B4B] transition"
  : "w-full rounded-[12px] border border-[#E3E8F0] bg-[#F7F9FC] px-3.5 py-2.5 text-[13.5px] font-bold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium resize-none focus:outline-none focus:bg-white focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/15 focus:shadow-[0_0_0_6px_rgba(143,176,240,0.16)] transition";
    const reqStar = <span className="text-[#4B6CB7]">*</span>;
    const AutoBadge = ({ show }) => null;

function calcHistoryScore(row, form) {
  let score = 0;

  // 1️⃣ 날짜 최신 (가중치)
  const d = new Date(row.상차일 || row.등록일 || 0).getTime();
  score += d / 1e10;

  // 2️⃣ 화물 동일
  if (row.화물내용 && form.화물내용 && row.화물내용 === form.화물내용) {
    score += 1000;
  }

  // 3️⃣ 톤수 유사
  const rt = getTotalTonFromOrder(row);
  const ft = getTotalTonFromOrder(form);
  if (rt != null && ft != null) {
    const diff = Math.abs(rt - ft);
    score += Math.max(0, 500 - diff * 100);
  }

  // 4️⃣ 파렛트 유사 (5P / 5파 / 5파렛, 경유지 포함 합산)
  const rp = getTotalPalletFromOrder(row);
  const fp = getTotalPalletFromOrder(form);
  if (rp != null && fp != null) {
    const diff = Math.abs(rp - fp);
    score += Math.max(0, 500 - diff * 80);
  }

  return score;
}
// ===============================
// 🔍 스마트 기사 검색 상태
// ===============================
const [smartDriverQuery, setSmartDriverQuery] = React.useState("");
const [smartDriverMatched, setSmartDriverMatched] = React.useState([]);
const [smartDriverActiveIdx, setSmartDriverActiveIdx] = React.useState(-1);
const [driverConflictPopup, setDriverConflictPopup] = React.useState(null);
// ⭐ 2026-11-05 매칭된 기사 이름·전화 [수정] — 단일 등록폼(formDrvEdit) · 다중등록(mrDrvEdit)
const formDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => sflowToast(m, "success") });
const mrDrvEdit = useDriverEditChoice({ drivers, upsertDriver, company: userCompany, notify: (m) => sflowToast(m, "success") });
React.useEffect(() => { if (!form.차량번호) formDrvEdit.reset(); }, [form.차량번호]); // eslint-disable-line react-hooks/exhaustive-deps
React.useEffect(() => { mrDrvEdit.reset(); }, [multiRegIdx, multiRegOpen]); // eslint-disable-line react-hooks/exhaustive-deps
const formDrvLocked = !formDrvEdit.editing && isRegisteredCombo(drivers, form.차량번호, form.이름, form.전화번호);
const mrDrvLocked = !!currentMultiSlot && !mrDrvEdit.editing && isRegisteredCombo(drivers, currentMultiSlot.차량번호, currentMultiSlot.이름, currentMultiSlot.전화번호);
// cargoAddPopup is passed in via props from DispatchApp
// { mode: "overwrite"|"new", existing: driver, input: {plate,name,phone} }

const parseDriverText = (text) => {
const phoneMatch = text.match(/01[016789][- .]?\d{3,4}[- .]?\d{4}/);
  const phone = phoneMatch
    ? phoneMatch[0].replace(/[-.\s]/g,"").replace(/^(\d{3})(\d{3,4})(\d{4})$/,"$1-$2-$3")
    : "";
  const plateMatch = text.match(/[가-힣]{2,3}\d{2}[가-힣]\d{4}|\d{2,3}[가-힣]\d{4}/);
  const plate = plateMatch ? plateMatch[0] : "";

  let name = "";
  const ownerBlock = text.match(/\[차주정보\]\s*([가-힣]{2,4})/);
  if (ownerBlock) {
    name = ownerBlock[1];
  } else {
    // 차량번호, 전화번호 완전 제거 후 이름 추출
    let stripped = text;
    if (phoneMatch?.[0]) stripped = stripped.replace(phoneMatch[0], " ");
    if (plate) stripped = stripped.replace(plate, " ");

    const excludeRegions = [
      "강원","서울","경기","인천","부산","대구","광주","대전","울산",
      "세종","경북","경남","전북","전남","충북","충남","제주",
      "냉장","냉동","카고","윙바디"
    ];

    const nameMatches = stripped.match(/[가-힣]{2,4}/g) || [];

    // 1순위: 제외 목록에 없고 지역 어미도 아닌 것
    name = nameMatches.find(n =>
      n.length >= 2 &&
      !excludeRegions.includes(n) &&
      !/[구시군동읍면로]$/.test(n)
    ) || "";

    // 2순위: 그래도 못 찾으면 2~4글자 한글 첫번째
    if (!name) {
      name = nameMatches.find(n => n.length >= 2 && n.length <= 4) || "";
    }
  }
  return { phone, plate, name };
};
const normD = (s="") => String(s).replace(/[-.\s]/g,"").toLowerCase();
// 🔎 2026-11-27 스마트검색 — 차량번호 · 전화번호 뒤 4자리(예: 9101)나 전화번호 전체로도 기사를 찾는다(실무에선 "9101 차"처럼 뒷자리로 부른다)
const smartDigitsMatch = (list, text, phone) => {
  if (phone) return (list || []).filter(d => normD(d.전화번호) === normD(phone));
  const q = normD(text);
  if (!/^\d{4}$/.test(q)) return [];
  const dg = (v) => String(v || "").replace(/\D/g, "");
  return (list || []).filter(d => dg(d.차량번호).endsWith(q) || dg(d.전화번호).endsWith(q));
};

const handleSmartDriverInput = (text) => {
  setSmartDriverQuery(text);
  setSmartDriverActiveIdx(-1);
  if (!text.trim()) {
    setSmartDriverMatched([]);
    return;
  }
  const { phone, plate, name } = parseDriverText(text);
  const q = normD(text);
  // 차량번호 기준으로만 후보 추출
const results = plate
  ? (drivers||[])
      .filter(d => normD(d.차량번호) === normD(plate))
      .sort((a, b) => {
        // 이름+전화 모두 같으면 맨 위
        const aExact = normD(a.이름) === normD(name) && normD(a.전화번호) === normD(phone);
        const bExact = normD(b.이름) === normD(name) && normD(b.전화번호) === normD(phone);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      })
  : (name && name.length >= 2)
  ? (drivers||[]).filter(d => d.이름 && d.이름.includes(name))
  : smartDigitsMatch(drivers, text, phone);
setSmartDriverMatched(results.slice(0, 8));
if (!plate && results.length) setSmartDriverActiveIdx(0); // 첫 번째 기사를 강조 — Enter 로 바로 고른다
};

// 스마트 검색 결과 선택
const selectSmartDriver = (d) => {
  // ⚠️ 드롭다운 추천 항목을 고르는 이 경로는 예전엔 검사 없이 무조건 DB에 저장된
  // 기존 번호로 덮어썼다 — 그래서 사용자가 "차량번호는 같은데 번호가 바뀐 기사"의
  // 새 번호까지 검색창에 입력해놓고 드롭다운 추천(옛날 번호로 뜬 항목)을 클릭/엔터로
  // 고르면, 방금 입력한 새 번호가 조용히 옛날 번호로 되돌아가는 버그가 있었다.
  // applySmartDriverInput(엔터/포커스아웃 경로)에는 이미 있는 "⚠️ 기사 정보 확인"
  // 충돌 팝업을 이 경로에도 동일하게 연결해, 번호가 다르면 무조건 사용자가 직접
  // 셋 중 하나(기존 정보 사용/덮어쓰기/신규 등록)를 고르게 한다.
  const { phone: typedPhone } = parseDriverText(smartDriverQuery);
  if (typedPhone && normD(d.전화번호) !== normD(typedPhone)) {
    setSmartDriverQuery("");
    setSmartDriverMatched([]);
    setSmartDriverActiveIdx(-1);
    setDriverConflictPopup({
      mode: "phone_diff",
      existing: d,
      input: { plate: d.차량번호, name: d.이름, phone: typedPhone },
    });
    return;
  }
  const grade = d?.등급 || d?.grade || "";
  if (grade === "블랙") setBlackAlert(d);
  else if (shouldShowDriverMemoAlert(d)) window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: d }));
  setForm(p => ({
    ...p,
    차량번호: d.차량번호,
    이름: d.이름 || "",
    전화번호: formatPhone(d.전화번호 || ""),
    배차상태: "배차완료",
  }));
  setSmartDriverQuery("");
  setSmartDriverMatched([]);
  setSmartDriverActiveIdx(-1);
};
// 스마트검색 입력창 공용 방향키 핸들러 — ↑/↓ 이동, Enter 선택, Esc 닫기
const handleSmartDriverKeyDown = (e) => {
  if (smartDriverMatched.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    setSmartDriverActiveIdx(prev => {
      const next = e.key === "ArrowDown" ? prev + 1 : prev - 1;
      if (next < 0) return smartDriverMatched.length - 1;
      if (next >= smartDriverMatched.length) return 0;
      return next;
    });
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (smartDriverMatched.length > 0 && smartDriverActiveIdx >= 0 && smartDriverActiveIdx < smartDriverMatched.length) {
      selectSmartDriver(smartDriverMatched[smartDriverActiveIdx]);
    } else if (smartDriverMatched.length > 0 && !parseDriverText(smartDriverQuery).plate) {
      // 🛠 2026-11-27 이름 · 뒷자리로 찾은 목록에서 Enter = 첫 번째 기사 선택(예전엔 검색어만 기사명에 들어가고 차량번호 · 전화는 빈칸)
      selectSmartDriver(smartDriverMatched[0]);
    } else {
      applySmartDriverInput(smartDriverQuery);
    }
    return;
  }
  if (e.key === "Escape" && smartDriverMatched.length > 0) {
    e.preventDefault();
    setSmartDriverMatched([]); setSmartDriverActiveIdx(-1);
  }
};


// 입력값으로 자동 적용 (blur 또는 엔터)
const applySmartDriverInput = async (text) => {
  if (!text.trim()) return;
  const { phone, plate, name } = parseDriverText(text);
  if (!plate && !name && !phone) return;

  // 차량번호 기준 기존 기사 검색
  const byPlate = plate
    ? (drivers||[]).filter(d => normD(d.차량번호) === normD(plate))
    : [];

  if (byPlate.length > 0) {
    const existing = byPlate[0];
    const sameName = normD(existing.이름) === normD(name);
    const samePhone = normD(existing.전화번호) === normD(phone);

    if (sameName && samePhone) {
      // 완전히 동일 → 기존 기사 정보로 세팅
      const grade = existing?.등급 || existing?.grade || "";
      if (grade === "블랙") setBlackAlert(existing);
      else if (shouldShowDriverMemoAlert(existing)) {
        window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: existing }));
      }
      setForm(p => ({
        ...p,
        차량번호: existing.차량번호,
        이름: existing.이름,
        전화번호: formatPhone(existing.전화번호),
        배차상태: "배차완료",
      }));
      setSmartDriverQuery("");
      setSmartDriverMatched([]);

    } else if (sameName && !samePhone) {
      // 이름 같고 전화번호 다름 → 충돌 팝업
      setSmartDriverQuery("");
      setSmartDriverMatched([]);
      setDriverConflictPopup({
        mode: "phone_diff",
        existing,
        input: { plate, name, phone },
      });

    } else if (!sameName && name) {
      // 차량번호 같고 이름 다름 → 충돌 팝업
      setSmartDriverQuery("");
      setSmartDriverMatched([]);
      setDriverConflictPopup({
        mode: "name_diff",
        existing,
        input: { plate, name, phone },
      });

    } else {
      // 그 외 (이름 파싱 안 됨 등) → 기존 기사 정보로 세팅
      const grade = existing?.등급 || existing?.grade || "";
      if (grade === "블랙") setBlackAlert(existing);
      else if (shouldShowDriverMemoAlert(existing)) {
        window.dispatchEvent(new CustomEvent("driverMemoDetected", { detail: existing }));
      }
      setForm(p => ({
        ...p,
        차량번호: existing.차량번호,
        이름: existing.이름,
        전화번호: formatPhone(existing.전화번호),
        배차상태: "배차완료",
      }));
      setSmartDriverQuery("");
      setSmartDriverMatched([]);
    }
    return;
  }

  // 기존 없음 → 파싱된 정보로 form 세팅 (실제 등록은 doSave에서)
  if (plate || name || phone) {
    setForm(p => ({
      ...p,
      차량번호: plate,
      이름: name,
      전화번호: formatPhone(phone),
      배차상태: plate ? "배차완료" : "배차중",
    }));
    setSmartDriverQuery("");
    setSmartDriverMatched([]);
  }
};

// ===============================
// 📋 오더 자동 파싱 상태
// ===============================
const [showOrderParser, setShowOrderParser] = React.useState(false);
const [orderScanInit, setOrderScanInit] = React.useState(null); // 화면에서 Ctrl+V로 열 때 넘길 내용 { text } | { image }
// ⭐ 2026-10-28 — 배차관리 화면 아무 곳(입력칸 밖)에서 Ctrl+V: 캡처 이미지나 오더처럼 보이는 글이면 오더 스캔 창을 바로 연다
React.useEffect(() => {
  const onPaste = (e) => {
    if (showOrderParser) return;
    const el = e.target;
    const tag = (el?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
    if (document.querySelector(".fixed.inset-0")) return; // 다른 팝업이 떠 있으면 건드리지 않음
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find((it) => it.type?.startsWith("image/"));
    if (img) {
      e.preventDefault();
      const fr = new FileReader();
      fr.onload = () => { setOrderScanInit({ image: fr.result }); setShowOrderParser(true); };
      fr.readAsDataURL(img.getAsFile());
      return;
    }
    const t = e.clipboardData?.getData("text") || "";
    if (looksLikeOrder(t)) { e.preventDefault(); setOrderScanInit({ text: t }); setShowOrderParser(true); }
  };
  window.addEventListener("paste", onPaste);
  return () => window.removeEventListener("paste", onPaste);
}, [showOrderParser]);

// (예전 "오더 붙여넣기" 글 분석기는 OrderScanModal + orderScanParser.js로 옮겼다 — 2026-10-28)
    const renderForm = () => (
      <>
        {/* ⭐ 2026-11-13 한 줄 빠른 등록 — 지난 노선을 찾아 오더복사와 같은 방식으로 채운다 */}
        {/* 🎨 2026-11-27 시안 K — 위쪽 띠: [일반배차 | 정기배차] · 빠른 등록 · 오른쪽 전국 유가 카드 */}
        <div className={kOn ? "of-k-banner" : ""}>
        {kOn && (
          <div className="of-k-tabs" role="tablist" aria-label="배차 종류">
            <button type="button" role="tab" aria-selected="true" className="of-k-tab on">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="12" height="9" rx="1.5" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>일반배차
            </button>
            <button type="button" role="tab" aria-selected="false" className="of-k-tab" onClick={() => setRecurringOpen(true)} title="지금 입력한 오더를 요일 · 시각마다 자동 등록(정기오더)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>정기배차
            </button>
          </div>
        )}
        <div className={kOn ? "of-k-quick" : ""}>
        {!isViewer && <QuickOrderLine rows={dispatchData} userCompany={userCompany} canMoney={canMoney} onApply={(row, o) => {
          if (row) applyCopy(row, { quick: true });
          // 🚚 2026-11-15 화물내용 · 상차→하차 이름도 한 줄에서(지난 노선이 없어도 적은 값은 채운다)
          setForm((p) => ({ ...p, ...(o.date ? { 상차일: o.date, 하차일: o.date } : {}), ...(o.ton ? { 차량톤수: o.ton, 톤수값: o.ton.replace("톤", ""), 톤수타입: "톤" } : {}), ...(o.kind ? { 차량종류: o.kind } : {}), ...(o.cargo ? { 화물내용: o.cargo } : {}), ...(!row && o.from ? { 상차지명: o.from } : {}), ...(!row && o.to ? { 하차지명: o.to } : {}) }));
          if (o.kind) setVehicleQuery(o.kind);
          if (o.fare > 0 && canMoney) onChange("청구운임", String(o.fare));
        }} />}
        </div>
        {kOn && <FuelSlideWidget card />}
        </div>
        {!kOn && (<>
        <div className="flex items-center gap-4 mb-3">

  <h2 className="text-lg font-bold"><EditableText id="popup.title.배차관리 폼" defaultText="오더등록" /></h2>
  {/* 📘 2026-11-15 오더등록 매뉴얼 — 정산관리의 [정산 매뉴얼]과 같은 창 */}
  <ManualButton menu="배차관리" label="오더등록 매뉴얼" />

  <FuelSlideWidget />

</div>
        </>)}
   
   {/* ================== 통합 입력 카드 ================== */}
<div className="kp-order-card bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">

{/* 액션바 */}
<div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#EDF1F7] bg-[linear-gradient(180deg,#FBFCFE,#F5F7FB)]" style={{ minHeight: "56px" }}>
  {/* 좌측 버튼 그룹 */}
  <div className="flex items-center gap-2 flex-wrap">
    {kOn && (
      <span className="inline-flex items-center gap-2 mr-1 text-[14.5px] font-black text-[#0F1A30] tracking-[-0.02em]">
        <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center shadow-[0_3px_8px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
        </span>배차 옵션
      </span>
    )}

     {/* 오더복사 */}
    <button
      type="button"
      onClick={() => { setCopyOpen(true); setCopySelected([]); }}
      className={DM_BTN_PRIMARY}
    >
      <DmIcon name="copy" />오더복사
    </button>

    {/* 초기화 */}
    <button
      type="button"
      onClick={resetForm}
      className={DM_BTN_SECONDARY}
    >
      <DmIcon name="reset" />초기화
    </button>

    {/* 오더 자동파싱 */}
    <button
      type="button"
      onClick={() => { setOrderScanInit(null); setShowOrderParser(true); }}
      className={DM_BTN_PRIMARY}
    >
      <DmIcon name="scan" /><EditableText id="dm.btn.orderScan" defaultText="오더스캔" />
    </button>

    {/* 운임조회 */}
    <button
      type="button"
      onClick={handleFareSearch}
      className={DM_BTN_SECONDARY}
    >
      <DmIcon name="fare" />운임조회
    </button>

    {/* ⭐ 2026-11-09 단가표 버튼 제거 (단가표 메뉴는 그대로) */}

    {/* ⭐ 정기오더 — 지금 입력한 오더를 요일·시각마다 자동 등록 */}
    <button
      type="button" data-k-hide
      onClick={() => setRecurringOpen(true)}
      className={DM_BTN_SECONDARY}
    >
      <DmIcon name="repeat" />정기오더
    </button>

    {/* ⭐ 2026-11-03 담당자·차량 조회 — 기간 + 배차담당자 + 차량번호·기사명 */}
    <button type="button" onClick={() => setDmLookupOpen(true)} title="기간 + 배차담당자 + 차량번호·기사명으로 찾기"
      className={DM_BTN_SECONDARY}>
      <DmIcon name="lookup" />담당자·차량 조회
    </button>
    {/* 🎨 2026-11-27 시안 K — 배차 옵션 카드에 다중등록 · 매뉴얼 */}
    {kOn && (
      <button type="button" onClick={openMultiRegister} className={DM_BTN_SECONDARY} title="거래처(상차지)는 고정하고, 하차지·화물 등이 서로 다른 오더 여러 건을 한 번에 등록">
        <DmIcon name="layers" />다중등록
      </button>
    )}
    {kOn && <ManualButton menu="배차관리" label="매뉴얼" />}
    {/* 🧩 2026-11-26 입력칸 설정 — 필요 없는 칸 숨기기(회사 전체 · 내 설정) */}
    <button type="button" data-k-hide onClick={() => setOfOpen(true)} title="필요 없는 입력칸을 숨겨요(회사 전체 · 내 설정)" data-testid="order-fields-btn"
      className={DM_BTN_SECONDARY}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M7 9h4M7 13h6M7 17h3M15.5 9.5l1.2 1.2 2.3-2.4" /></svg>
      입력칸 설정{ofs.hidden.size > 0 && <span className="ml-0.5 text-[11px] font-black px-1.5 rounded-full bg-[#1B2B4B] text-white">{ofs.hidden.size}개 숨김</span>}
    </button>
    {ofOpen && <OrderFieldsModal state={ofs} onClose={() => setOfOpen(false)} canCompany={!isViewer} />}
    {/* 🎨 2026-11-27 디자인 변경(최고관리자만) — 누를 때마다 A 루트 보드 ↔ 기본 입력창 */}
    {skinAllowed && (
      <button type="button" onClick={cycleSkin} data-testid="order-skin-btn" title={`오더등록 화면 모양 바꾸기(최고관리자만 · 이 기기에만) — 지금: ${skinName(skinOn)}`}
        className={`${DM_BTN} border ${skinOn !== "base" ? "bg-gradient-to-r from-[#4F46E5] to-[#0891B2] text-white border-transparent shadow-[0_6px_16px_rgba(79,70,229,0.3)]" : "bg-white text-[#4F46E5] border-[#C7D2FE] hover:bg-[#EEF2FF]"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z" /></svg>
        디자인 변경 · {skinName(skinOn)}
      </button>
    )}
    <OrderLookupModal open={dmLookupOpen} onClose={() => setDmLookupOpen(false)} rows={dmLookupOpen ? (dispatchData || []).filter((r) => !r?.배차표Id) : []} nameOf={dmLookupNameOf} />{/* ⭐ 2026-11-06 고정노선(배차표) 오더는 고정노선현황에서만 */}
    {recurringOpen && createPortal(<RecurringManagerModal form={form} onClose={() => setRecurringOpen(false)} />, document.body)}

  </div>

  {/* 구분선 */}
  <span data-k-hide className="hidden md:block w-px h-6 bg-[#DCE3EE]" />
{(() => { const __optGroup = (
  <div className="flex items-center gap-2 flex-wrap">
  {/* 🎨 2026-11-27 시안 K — 운행 옵션 카드: [독차 | 혼적 | 왕복 | 긴급](독차가 기본 · 나머지는 켜고 끔) · 왕복이면 회전 */}
  {kOn && (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[12px] font-extrabold text-[#2A3852] w-[60px] shrink-0">운행 옵션</span>
      <div role="group" aria-label="운행 옵션" className="flex p-[3px] rounded-[10px] bg-[#F1F4F9] border border-[#E3E8F0]">
        {[["독차", !form.혼적 && form.운행유형 !== "왕복" && !form.긴급, () => setForm((p) => ({ ...p, 혼적: false, 독차: true, 긴급: false, ...(p.운행유형 === "왕복" ? { 운행유형: "편도", 회전수: 1, 회전방식: "묶기" } : {}) }))],
          ["혼적", !!form.혼적, () => setForm((p) => ({ ...p, 혼적: !p.혼적, 독차: !!p.혼적 }))],
          ["왕복", form.운행유형 === "왕복", () => setForm((p) => p.운행유형 === "왕복" ? { ...p, 운행유형: "편도", 회전수: 1, 회전방식: "묶기" } : { ...p, 운행유형: "왕복" })],
          ["긴급", !!form.긴급, () => onChange("긴급", !form.긴급)]].map(([l, on, fn]) => (
          <button key={l} type="button" onClick={fn} aria-pressed={on}
            className={`h-8 px-3.5 rounded-[8px] text-[12.5px] font-extrabold transition ${on ? "bg-[#1B2B4B] text-white shadow-[0_2px_6px_rgba(15,26,48,0.25)]" : "text-[#5E6B82] hover:text-[#0F1A30]"}`}>{l}</button>))}
      </div>
    </div>
  )}

  {/* ⭐ 2026-11-09 독차 버튼 제거 — 혼적·왕복이 아니면 자동으로 독차 */}

{/* 🧰 2026-11-23 [혼적] · [왕복] · [긴급] 버튼 3개 → [운행 옵션] 하나(누르면 체크 목록) — 켜고 끄는 값 · 왕복의 회전 칸은 예전 그대로 */}
{(() => {
  const optOn = [form.혼적 && "혼적", form.운행유형 === "왕복" && "왕복", form.긴급 && "긴급"].filter(Boolean);
  return (
    <ToolMenuButton testId="order-run-options" align="left" minWidth={230} menuTitle="운행 옵션: 켜고 끌 항목을 눌러요" active={optOn.length > 0}
      className={`${dmToggleCls(optOn.length > 0)} ${form.긴급 ? "!bg-[#0F1A30] !border-[#0F1A30]" : ""}`}
      label={<><DmDot on={optOn.length > 0} alert={!!form.긴급} />운행 옵션<span className={`font-bold ${optOn.length ? "opacity-90" : "opacity-60"}`}>· {optOn.length ? optOn.join(" · ") : "옵션 없음"}</span></>}
      items={[
        { key: "mix", label: "혼적", desc: "다른 짐과 같이 실어요(끄면 독차)", checked: !!form.혼적, onClick: () => setForm((p) => ({ ...p, 혼적: !p.혼적, 독차: !!p.혼적 })) /* ⭐ 2026-11-09 혼적을 끄면 독차 */ },
        { key: "round", label: "왕복", desc: "켜면 회전 수를 고를 수 있어요", checked: form.운행유형 === "왕복", onClick: () => setForm((p) => p.운행유형 === "왕복"
          ? { ...p, 운행유형: "편도", 회전수: 1, 회전방식: "묶기" }
          : { ...p, 운행유형: "왕복" }) },
        { key: "urgent", label: "긴급", desc: "급한 오더로 표시해요", checked: !!form.긴급, onClick: () => onChange("긴급", !form.긴급) },
      ]} />
  );
})()}

{/* ⭐ 회전 운행 — 같은 상/하차지를 2회 이상 반복 (묶기: 1건+회전수 / 나누기: N건 분리) */}
{form.운행유형 === "왕복" && <RotationPicker
  count={form.회전수 || 1}
  mode={form.회전방식 || "묶기"}
  onChange={(c, m) => setForm((p) => ({ ...p, 회전수: c, 회전방식: m }))}
/>}


{/* ⭐ 블라인드 — 최고관리자에게만 보이는 버튼. 켜고 등록하면 최고관리자 외 누구의 배차목록에도 안 보인다 */}
{canSeeBlind() && (
<button type="button" onClick={() => onChange("블라인드", !form.블라인드)}
  title="켜고 등록하면 최고관리자 외에는 아무도 이 오더를 볼 수 없습니다"
  aria-pressed={!!form.블라인드} className={`${dmToggleCls(!!form.블라인드)} ${form.블라인드 ? "!bg-[#0F1A30] !border-[#0F1A30]" : ""}`}>
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
  블라인드
</button>
)}
{/* 🧾 2026-11-09 특수운임 적용 — 지게차비용·대기료·경유·할증 등(팝업). 블라인드와 같은 줄, 조회전용 외 모든 직원 */}
{!isViewerNow() && <SpecialFareButton form={form} setForm={setForm} btnClass={dmToggleCls} />}
  {(areaFareHint || distanceFareEstimate) && (
    <div
      className="mt-2 flex items-center gap-3 bg-[#1B2B4B] rounded-lg px-4 py-2 text-sm cursor-pointer hover:bg-[#243a60] transition"
      onClick={() => {
        const inputTon = getTotalTonFromOrder(form);
        const inputPallet = getTotalPalletFromOrder(form);
        const vgInput = normalizeVehicleGroup(form.차량종류);

        const _todayKstGuide = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const history = (dispatchData || []).filter(r => {
          if ((r.상차일 || "").slice(0, 10) === _todayKstGuide) return false;
          if (!r.청구운임) return false;
          if (!isAreaMatch(form.상차지주소, r.상차지주소 || r.상차지명)) return false;
          if (!isAreaMatch(form.하차지주소, r.하차지주소 || r.하차지명)) return false;

          const vgRow = normalizeVehicleGroup(r.차량종류);
          // 오토바이 폴백: 일반차량도 포함
          if (vgInput === "MOTOR") {
            if (vgRow !== "MOTOR" && vgRow !== "GENERAL") return false;
          } else {
            if (vgRow !== vgInput) return false;
          }

          if (inputTon != null) {
            const rowTon = getTotalTonFromOrder(r);
            if (rowTon == null) return false;
            if (Math.abs(rowTon - inputTon) > 0.5) return false;
          }
          if (inputPallet != null) {
            const rowPallet = getTotalPalletFromOrder(r);
            if (rowPallet == null) return false;
            if (Math.abs(rowPallet - inputPallet) > 1) return false;
          }
          return true;
        });

        setGuideHistoryList(history);
        setFareHistoryOpen(true);
      }}
    >
      <span className="font-semibold text-white">
        {areaFareHint ? `${areaFareHint.pickupLabel} → ${areaFareHint.dropLabel}` : `${form.상차지주소?.slice(0, 12) || ""} → ${form.하차지주소?.slice(0, 12) || ""}`}
      </span>
      <span className="text-white/60 text-xs">
        {areaFareHint
          ? <>기준: {areaFareHint.motorFallback ? "일반차량(오토바이 참고)" : areaFareHint.level}<span className="ml-1">({areaFareHint.count}건)</span></>
          : `티맵 ${distanceFareEstimate.distance}km 기준 추정${distanceFareEstimate.surchargeLabel ? ` · ${distanceFareEstimate.surchargeLabel} 할증 +${Math.round(distanceFareEstimate.surchargeRate * 100)}%` : ""}`}
      </span>
      <span className="ml-auto font-bold text-white">
        {areaFareHint
          ? `${areaFareHint.min.toLocaleString()} ~ ${areaFareHint.max.toLocaleString()}원`
          : `${distanceFareEstimate.min.toLocaleString()} ~ ${distanceFareEstimate.max.toLocaleString()}원`}
      </span>
      {distanceFareEstimate && areaFareHint && (
        <span className="text-white/50 text-[11px] border-l border-white/20 pl-3 whitespace-nowrap">
          티맵 {distanceFareEstimate.distance}km 기준 {distanceFareEstimate.min.toLocaleString()}~{distanceFareEstimate.max.toLocaleString()}원
        </span>
      )}
      {form.상차지주소 && form.하차지주소 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowFareRouteMap(true); }}
          className="ml-2 px-2 py-0.5 text-[11px] font-bold rounded border border-white/30 text-white hover:bg-white/10 transition shrink-0"
        >
          경로보기
        </button>
      )}
    </div>
  )}
</div>
); return kOn && kOptEl ? createPortal(__optGroup, kOptEl) : __optGroup; })()}
{showFareRouteMap && (
  <RouteMapModal
    pickupAddr={form.상차지주소}
    dropAddr={form.하차지주소}
    pickupName={form.상차지명}
    dropName={form.하차지명}
    viaPickup={(form.경유상차목록 || []).map((s) => s.주소).filter(Boolean)}
    viaDrop={(form.경유하차목록 || []).map((s) => s.주소).filter(Boolean)}
    onClose={() => setShowFareRouteMap(false)}
  />
)}
  <div data-k-hide className="w-px h-7 bg-gray-200" />
  {/* 날짜 시간 ▼ */}
{(() => { const __dateRow = (
<div className="kp-date-row flex flex-nowrap items-center gap-x-2.5 text-sm min-w-0">{/* 🧭 2026-11-27 사용자 요청 — 상·하차 교체까지 한 줄(줄바꿈 금지) */}

{/* ================= 상차 ================= */}
  <label data-k-hide className="text-[13px] font-bold text-[#1B2B4B]">상차</label>
  <div data-of="pdate" className="contents-none">{(() => {
    const formWorkDates = _parseWorkDates(form.근무일자목록);
    const isMultiWork = !!form.복수근무일 && formWorkDates.length > 1;
    return (
      <CustomDatePicker
        value={form.상차일 || ""}
        showIcon
        className={`border-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-[#1B2B4B]/25 focus:shadow-[0_0_0_5px_rgba(143,176,240,0.18)] ${
          isMultiWork ? "border-red-600 text-red-600" : "border-[#1B2B4B] text-[#1B2B4B]"
        }`}
        onChange={(e) => onChange("상차일", e.target.value)}
        multiSelect
        multiActive={!!form.복수근무일}
        onToggleMulti={() => onChange("복수근무일", !form.복수근무일)}
        workDates={formWorkDates}
        onToggleWorkDate={toggleWorkDate}
        onClearWorkDates={() => onChange("근무일자목록", [])}
        displayOverride={isMultiWork ? `${form.상차일 || ""} 외 ${formWorkDates.length - 1}일` : undefined}
      />
    );
  })()}</div>
  {/* 상차 시간 + 이전/이후 */}
  <div data-of="ptime" className="flex items-center gap-1">
    <TimeAmPmPicker
      value={form.상차시간 || ""}
      onChange={v => { onChange("상차시간", v); setShowAmPmError(false); }}
      selectCls="border-2 border-[#1B2B4B] rounded-lg px-2 py-1 text-[13px] font-semibold text-[#1B2B4B] outline-none focus:ring-2 focus:ring-[#1B2B4B]/25 focus:shadow-[0_0_0_5px_rgba(143,176,240,0.18)]"
      showError={showAmPmError}
    />

    {form.상차시간 && (
      <div className="flex gap-1">
        <button
          type="button"
          className={`px-2.5 py-1 text-[12px] font-semibold rounded-lg border transition ${
            form.상차시간기준 === "이전"
              ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
              : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
          }`}
          onClick={() => onChange("상차시간기준", form.상차시간기준 === "이전" ? null : "이전")}
        >
          이전
        </button>
        <button
          type="button"
          className={`px-2.5 py-1 text-[12px] font-semibold rounded-lg border transition ${
            form.상차시간기준 === "이후"
              ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
              : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
          }`}
          onClick={() => onChange("상차시간기준", form.상차시간기준 === "이후" ? null : "이후")}
        >
          이후
        </button>
      </div>
    )}
  </div>

  {/* 상차: 당일 / 내일 */}
  <div data-of="pq" className="flex gap-1 ml-2">
    <button type="button"
      className="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#243a60] transition"
      onClick={() => onChange("상차일", _todayStr())}>
      당일
    </button>
    <button type="button"
      className="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#243a60] transition"
      onClick={() => onChange("상차일", _tomorrowStr())}>
      내일
    </button>
    <button type="button"
    className="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#0F1A30] transition"
    onClick={() => {
      const d = new Date();
      const day = d.getDay(); // 0=일 1=월 ... 6=토
      const daysUntilMon = day === 0 ? 1 : (8 - day); // 다음주 월요일까지 일수
      d.setDate(d.getDate() + daysUntilMon);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      onChange("상차일", `${yyyy}-${mm}-${dd}`);
    }}>
    월상
  </button>
</div>

 {/* ================= 하차 ================= */}
  <label data-k-hide className="text-[13px] font-bold text-[#1B2B4B] ml-4">하차</label>
  <div data-of="ddate" className="relative">
    <CustomDatePicker
      value={form.하차일 || ""}
      showIcon
      className="border-2 border-[#1B2B4B] rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[#1B2B4B] outline-none focus:ring-2 focus:ring-[#1B2B4B]/25 focus:shadow-[0_0_0_5px_rgba(143,176,240,0.18)]"
      onChange={(e) => onChange("하차일", e.target.value)}
    />
    {copyDateHint && (
      <div className="absolute z-50 left-0 top-[calc(100%+8px)] w-[340px] whitespace-normal bg-white border-2 border-[#1B2B4B] rounded-xl shadow-2xl">{/* 🛠 2026-11-16 글이 상자 밖으로 넘어가지 않게(부모 nowrap 무시) */}
        <div className="absolute -top-[9px] left-4 w-4 h-4 bg-white border-l-2 border-t-2 border-[#1B2B4B] rotate-45" />
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
          <span className="text-[13px] font-bold text-[#1B2B4B]">하차일 확인</span>
          <button type="button" onClick={() => setCopyDateHint(null)} className="text-gray-500 hover:text-gray-600 text-base w-6 h-6 flex items-center justify-center">×</button>
        </div>
        <div className="px-4 pb-4">
          <p className="text-[12.5px] text-gray-600 mb-3 leading-relaxed whitespace-normal break-keep">
            원본 오더는 <span className="font-bold text-[#1B2B4B]">{copyDateHint.origDrop}</span> 하차였습니다. 현재 하차일을 확인해 주세요.
          </p>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => { onChange("하차일", _tomorrowStr()); setCopyDateHint(null); }}
              className="flex-1 py-2 text-[12px] font-bold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#243a60] transition">
              변경
            </button>
            <button type="button"
              onClick={() => setCopyDateHint(null)}
              className="flex-1 py-2 text-[12px] font-semibold rounded-lg border-2 border-gray-300 text-gray-600 hover:border-[#1B2B4B] hover:text-[#1B2B4B] transition">
              유지
            </button>
          </div>
        </div>
      </div>
    )}
  </div>

  {/* 하차 시간 + 이전/이후 */}
  <div data-of="dtime" className="flex items-center gap-1">
    <TimeAmPmPicker
      value={form.하차시간 || ""}
      onChange={v => { onChange("하차시간", v); setShowAmPmError(false); }}
      selectCls="border-2 border-[#1B2B4B] rounded-lg px-2 py-1 text-[13px] font-semibold text-[#1B2B4B] outline-none focus:ring-2 focus:ring-[#1B2B4B]/25 focus:shadow-[0_0_0_5px_rgba(143,176,240,0.18)]"
      showError={showAmPmError}
    />

    {form.하차시간 && (
      <div className="flex gap-1">
       <button
          type="button"
          className={`px-2.5 py-1 text-[12px] font-semibold rounded-lg border transition ${
            form.하차시간기준 === "이전"
              ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
              : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
          }`}
          onClick={() => onChange("하차시간기준", form.하차시간기준 === "이전" ? null : "이전")}
        >
          이전
        </button>
        <button
          type="button"
          className={`px-2.5 py-1 text-[12px] font-semibold rounded-lg border transition ${
            form.하차시간기준 === "이후"
              ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
              : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
          }`}
          onClick={() => onChange("하차시간기준", form.하차시간기준 === "이후" ? null : "이후")}
        >
          이후
        </button>
      </div>
    )}
  </div>

 {/* 하차: 당일 / 내일 */}
  <div data-of="dq" className="flex gap-1 ml-2">
    <button type="button"
      className="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#243a60] transition"
      onClick={() => onChange("하차일", _todayStr())}>
      당일
    </button>
    <button type="button"
      className="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#243a60] transition"
      onClick={() => onChange("하차일", _tomorrowStr())}>
      내일
    </button>
    {/* ✅ 추가 */}
  <button type="button"
    className="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#0F1A30] transition"
    onClick={() => {
      const d = new Date();
      const day = d.getDay();
      const daysUntilMon = day === 0 ? 1 : (8 - day);
      d.setDate(d.getDate() + daysUntilMon);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      onChange("하차일", `${yyyy}-${mm}-${dd}`);
    }}>
    월착
  </button>
</div>

{/* 🗓 2026-11-27 오더등록 1안 — [상·하차 교체] 버튼 하나에 거리 · 시간 · 도착 예상 · 경로보기(주소 둘 다 있을 때) */}
<div data-of="sw" className="contents-none"><SwapRouteButton form={form} onSwap={swapPickupDrop} onMap={() => setShowFareRouteMap(true)} /></div>
  </div>
); return kOn && kDatesEl ? createPortal(__dateRow, kDatesEl) : __dateRow; })()}
</div>
{/* ===== 오더 자동파싱 영역 ===== */}
{showOrderParser && (
  <OrderScanModal
    places={placeList}
    clients={clients}
    initial={orderScanInit}
    ai={mainScanAi}
    onClose={() => { setShowOrderParser(false); setOrderScanInit(null); }}
    onApply={(patch, memo, info = {}) => {
      setForm((p) => ({ ...p, ...patch, ...scanDropDate(patch, info, p.상차일), ...(memo ? { 메모: [p.메모, memo].filter(Boolean).join("\n") } : {}) }));
      if (patch.상차지명) setAutoPickMatched(true);
      if (patch.하차지명) setAutoDropMatched(true);
      if (patch.차량종류) setVehicleQuery(patch.차량종류);
      if (patch.거래처명) setClientQuery(patch.거래처명);
      setShowOrderParser(false); setOrderScanInit(null);
      // ⭐ 등록 업체로 맞췄고 담당자가 여러 명인데 오더에 담당자가 안 적혀 있으면 → 담당자 선택창 먼저
      const contactItems = [];
      [["pickup", info.pickupPlace, info.pickupMgrScanned], ["drop", info.dropPlace, info.dropMgrScanned]].forEach(([type, pl, scanned]) => {
        if (!pl || scanned) return;
        const full = findPlaceByName(pl.업체명) || pl;
        const cs = (full.contacts || pl._contacts || []).filter((c) => c.name?.trim());
        const uniq = [...new Map(cs.map((c) => [c.name.trim(), c])).values()];
        if (uniq.length > 1) contactItems.push({ type, place: full, contacts: uniq });
      });
      if (contactItems.length) setTimeout(() => openContactPopup(contactItems), 60);
      else showAlert("✓ 스캔한 오더 내용이 입력되었습니다. 확인 후 저장하세요.");
    }}
  />
)}
<form
  onSubmit={handleSubmit}
  data-arrownav-scope
  onKeyDown={(e) => {
    // ⭐ 좌우 방향키 필드 이동 — 입력창에서 커서가 맨 끝/맨 앞에 있을 때만
    // 옆 칸으로 넘어간다(커서가 글자 중간에 있으면 평소처럼 커서만 움직인다).
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (!el.hasAttribute("data-arrownav")) return;
    if (el.selectionStart == null) return; // type=number 등 selectionRange 미지원 필드는 기본 동작 유지
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (e.key === "ArrowLeft" && atStart) { e.preventDefault(); arrowHopFocus(el, -1); }
    else if (e.key === "ArrowRight" && atEnd) { e.preventDefault(); arrowHopFocus(el, 1); }
  }}
/* ⭐ 2026-11-02 화면 점검 — 1280 노트북에서 8칸이 너무 좁아 버튼·라벨이 깨졌다 → 1280~1499는 6칸, 그보다 좁으면 4칸, 1500 이상은 기존 8칸 그대로 */
className="
kp-order-form
grid grid-cols-4 xl:grid-cols-6 min-[1500px]:grid-cols-8 gap-x-3.5 gap-y-4
bg-white
border border-[#E3E8F0]
rounded-[24px]
pt-0 pb-6 px-6
overflow-hidden
shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_rgba(16,24,40,0.07)]
"
>
  
  {/* ================== 오더 정보 (카드 최상단 네이비 헤더) ================== */}
<div data-of="head" className="col-span-full -mx-6 -mt-0 mb-2">{/* ⭐ 2026-11-02 화면 점검 — 칸 수가 바뀌어도 한 줄 전체 */}
  <div className="relative px-6 py-3.5 flex items-center justify-between overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
    <span className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
    <span className="relative flex items-baseline gap-2.5">
      <span className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>ORDER ENTRY</span>
      <span className="text-[15px] font-black text-white"><EditableText id="orderForm.header.오더정보" defaultText="오더 정보" /></span>
    </span>
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={openMultiRegister}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-extrabold shadow-[0_4px_12px_rgba(0,0,0,0.18)] hover:bg-[#EEF3FC] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FB0F0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1B2B4B]"
        title="거래처(상차지)는 고정하고, 하차지·화물 등이 서로 다른 오더 여러 건을 한 번에 등록">
        <DmIcon name="layers" size={14} /><EditableText id="orderForm.header.다중등록" defaultText="다중등록" />
      </button>
      <button type="button" onClick={toggleOrderCardStyle}
        className="inline-flex items-center justify-center h-8 min-w-[32px] px-2.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-[12px] font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}
        title="입력창 스타일 전환 (A: 밑줄형 / B: 박스형)">
        {orderCardStyle}
      </button>
    </div>
  </div>
</div>

{/* ================== 다중등록(서로 다른 오더 일괄등록) 팝업 ================== */}
{multiRegOpen && (
  // ⭐ 바깥(배경) 클릭으로는 닫히지 않는다 — 팝업이 떠 있는 동안은 팝업 자체에
  // 포커스/조작이 유지돼야 한다는 요청. 닫기는 오직 우측 상단 × 버튼으로만.
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[760px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden"
      style={{ transform: `translate(${multiRegPos.x}px, ${multiRegPos.y}px)` }}>
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0 cursor-move select-none"
        onMouseDown={startMultiRegDrag}
        title="드래그해서 팝업 위치를 옮길 수 있습니다">
        <div>
          <h3 className="text-white font-bold text-[16px]"><EditableText id="orderForm.multi.title" defaultText="다중등록" /></h3>
          <p className="text-white/60 text-[12px] mt-0.5">
            {multiRegStep === "setup"
              ? (dmBiz.multi ? "청구 사업자 → 거래처 → 건수 순서로 정하고 [다음]을 누르세요" : "거래처와 등록할 건수를 정하고 [다음]을 누르세요")
              : `${currentMultiSlot?._groupLabel || ""} · ${multiRegIdx + 1} / ${multiRegSlots.length}건`}
          </p>
        </div>
        <button type="button" onClick={() => setMultiRegOpen(false)} onMouseDown={e => e.stopPropagation()}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg shrink-0">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {multiRegStep === "setup" ? (
          <div className="space-y-4">
            {multiRegGroups.map((g) => (
              <div key={g.key} className="border border-gray-200 rounded-xl p-4 relative">
                {multiRegGroups.length > 1 && (
                  <button type="button"
                    onClick={() => setMultiRegGroups(prev => prev.filter(x => x.key !== g.key))}
                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-[12px] font-bold"><EditableText id="misc.btn.13388.삭제" defaultText="삭제" /></button>
                )}
                {/* ⭐ 2026-11-09 순서: 청구 사업자 → 거래처명 → 건수 (상차지는 다음 단계에서 오더마다 입력) */}
                <div className={`grid gap-4 ${dmBiz.multi ? "grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
                  {dmBiz.multi && (
                    <div className="min-w-0">
                      <label className={mrLabelCls}><EditableText id="orderForm.multi.label.청구사업자" defaultText="청구 사업자" /></label>
                      <BizSelect biz={dmBiz} value={g._bizPicked ? (g.청구사업자 || "") : null}
                        onChange={(v) => setMultiRegGroups(prev => prev.map(x => x.key === g.key ? { ...x, 청구사업자: v || "", _bizPicked: true } : x))}
                        className={mrInputCls} />
                      {!g._bizPicked && <div className="text-[11px] text-gray-400 mt-1">안 고르면 거래처 기준으로 자동</div>}
                    </div>
                  )}
                  <div className="min-w-0">
                    <label className={mrLabelCls}><EditableText id="orderForm.multi.label.거래처명" defaultText="거래처명" /> {reqStar}</label>
                    <MultiRegCombo
                      className={mrInputCls}
                      placeholder="거래처 검색/입력"
                      value={g.query}
                      onChange={(v) => {
                        // ⭐ 2026-11-09 직접 입력한 이름도 거래처명으로 그대로 쓴다(상차지와는 연결하지 않음)
                        setMultiRegGroups(prev => prev.map(x => x.key === g.key ? { ...x, query: v, 거래처명: v.trim() } : x));
                      }}
                      items={filterMultiRegClients(g.query).map((c, i) => ({ key: i, label: c.업체명, sub: c.주소, raw: c }))}
                      renderItem={(it) => (<><div className="font-medium">{it.label}</div>{it.sub && <div className="text-[11px] text-gray-500">{it.sub}</div>}</>)}
                      onSelect={(it) => applyMultiRegGroupClient(g.key, it.raw)}
                    />
                  </div>
                  <div>
                    <label className={mrLabelCls}><EditableText id="orderForm.multi.label.건수" defaultText="건수" /></label>
                    <div className="flex items-center gap-2">
                      <button type="button"
                        className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 font-bold hover:bg-gray-50"
                        onClick={() => setMultiRegGroups(prev => prev.map(x => x.key === g.key ? { ...x, count: Math.max(1, (Number(x.count) || 1) - 1) } : x))}
                      >-</button>
                      <span className="w-10 text-center font-bold text-[15px]">{g.count}</span>
                      <button type="button"
                        className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 font-bold hover:bg-gray-50"
                        onClick={() => setMultiRegGroups(prev => prev.map(x => x.key === g.key ? { ...x, count: Math.min(30, (Number(x.count) || 1) + 1) } : x))}
                      >+</button>
                      <span className="text-[12px] text-gray-400">건</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => setMultiRegGroups(prev => [...prev, makeMultiRegGroup()])}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-[13px] font-bold hover:border-[#1B2B4B] hover:text-[#1B2B4B] transition"
            >
              + 다른 거래처 추가 (서로 다른 거래처를 한 번에 등록하려면)
            </button>
          </div>
        ) : currentMultiSlot ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="px-2 py-0.5 rounded bg-[#1B2B4B] text-white text-[11px] font-bold shrink-0">거래처</span>
              <span className="font-bold text-[#1B2B4B]">{currentMultiSlot.거래처명}</span>
              {dmBiz.multi && (<><span className="text-gray-400">·</span><span className="text-gray-600">청구 {currentMultiSlot._bizPicked ? (currentMultiSlot.청구사업자 || dmBiz.defaultName) : "자동"}</span></>)}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* ⭐ 2026-11-09 상차지부터 입력(상차지 → 상차일/시간 → 하차지 …) */}
              <div>
                <div className="flex items-center h-[20px] overflow-visible justify-between mb-1">
                  <label className={`${mrLabelCls} mb-0`}><EditableText id="orderForm.multi.label.상차지" defaultText="상차지" /> {reqStar}</label>
                  <div className="flex items-center gap-1">
                    <OrderMemoIconButton onClick={() => openMultiRegOrderMemoEditor("pickup")} title="상차지 오더메모" hasMemo={hasMultiRegOrderMemoFor("pickup")} size={18} />
                    {currentMultiSlot.상차지명 && <ContactPickerIconButton onClick={() => {
                      const place = filterPlaces(currentMultiSlot.상차지명)[0] || mergedClients.find(c => normalizeKey(c.업체명 || "") === normalizeKey(currentMultiSlot.상차지명));
                      const contacts = (place?.contacts || []).filter(c => c.name?.trim());
                      const uniqueContacts = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
                      if (!uniqueContacts.length) return showAlert("등록된 담당자가 없습니다.");
                      openContactPopup([{ type: "pickup", place, contacts: uniqueContacts, __multiReg: "pickup" }]);
                    }} title="상차지 담당자 선택" />}
                  </div>
                </div>
                <MultiRegCombo
                  id="mr-pickup-input"
                  className={mrInputCls}
                  placeholder="상차지 검색/입력"
                  value={multiRegPickQuery || currentMultiSlot.상차지명}
                  onChange={(v) => { setMultiRegPickQuery(v); updateMultiSlot("상차지명", v); }}
                  items={filterPlaces(multiRegPickQuery || currentMultiSlot.상차지명).map((p, i) => ({ key: i, label: p.업체명, sub: p.주소, raw: p }))}
                  renderItem={(it) => (<><div className="font-medium">{it.label}</div>{it.sub && <div className="text-[11px] text-gray-500">{it.sub}</div>}</>)}
                  onSelect={(it) => { applyMultiSlotPickup(it.raw); setMultiRegPickQuery(it.raw.업체명); }}
                />
                <WaypointSection
                  stops={currentMultiSlot.경유상차목록 || []}
                  type="pickup"
                  onSave={(list) => updateMultiSlot("경유상차목록", list)}
                  placeRows={mergedClients}
                  timeOptions={timeOptions}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.상차지주소" defaultText="상차지주소" /></label>
                <input autoComplete="off" className={mrInputCls} value={currentMultiSlot.상차지주소 || ""} onChange={e => updateMultiSlot("상차지주소", e.target.value)} />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.상차지담당자" defaultText="상차지 담당자" /></label>
                <input autoComplete="off" className={mrInputCls} placeholder="담당자명" value={currentMultiSlot.상차지담당자 || ""} onChange={e => updateMultiSlot("상차지담당자", e.target.value)} />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.상차지담당자연락처" defaultText="상차지 담당자 연락처" /></label>
                <input autoComplete="off" className={mrInputCls} placeholder="연락처" value={currentMultiSlot.상차지담당자번호 || ""} onChange={e => updateMultiSlot("상차지담당자번호", formatPhone(e.target.value))} />
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.상차일" defaultText="상차일" /></label>
                <CustomDatePicker
                  value={currentMultiSlot.상차일 || ""}
                  showIcon
                  className={mrInputCls}
                  onChange={(e) => updateMultiSlot("상차일", e.target.value)}
                />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.상차시간" defaultText="상차시간" /></label>
                <TimeAmPmPicker
                  value={currentMultiSlot.상차시간 || ""}
                  onChange={(v) => updateMultiSlot("상차시간", v)}
                  selectCls={mrInputCls}
                />
              </div>

              <div>
                <div className="flex items-center h-[20px] overflow-visible justify-between mb-1">
                  <label className={`${mrLabelCls} mb-0`}><EditableText id="orderForm.multi.label.하차지" defaultText="하차지" /> {reqStar}</label>
                  <div className="flex items-center gap-1">
                    <OrderMemoIconButton onClick={() => openMultiRegOrderMemoEditor("drop")} title="하차지 오더메모" hasMemo={hasMultiRegOrderMemoFor("drop")} size={18} />
                    {currentMultiSlot.하차지명 && <ContactPickerIconButton onClick={() => {
                      const place = filterPlaces(currentMultiSlot.하차지명)[0] || mergedClients.find(c => normalizeKey(c.업체명 || "") === normalizeKey(currentMultiSlot.하차지명));
                      const contacts = (place?.contacts || []).filter(c => c.name?.trim());
                      const uniqueContacts = [...new Map(contacts.map(c => [c.name.trim(), c])).values()];
                      if (!uniqueContacts.length) return showAlert("등록된 담당자가 없습니다.");
                      openContactPopup([{ type: "drop", place, contacts: uniqueContacts, __multiReg: "drop" }]);
                    }} title="하차지 담당자 선택" />}
                  </div>
                </div>
                <MultiRegCombo
                  id="mr-drop-input"
                  className={mrInputCls}
                  placeholder="하차지 검색/입력"
                  value={multiRegDropQuery || currentMultiSlot.하차지명}
                  onChange={(v) => { setMultiRegDropQuery(v); updateMultiSlot("하차지명", v); }}
                  items={filterPlaces(multiRegDropQuery || currentMultiSlot.하차지명).map((p, i) => ({ key: i, label: p.업체명, sub: p.주소, raw: p }))}
                  renderItem={(it) => (<><div className="font-medium">{it.label}</div>{it.sub && <div className="text-[11px] text-gray-500">{it.sub}</div>}</>)}
                  onSelect={(it) => { applyMultiSlotDrop(it.raw); setMultiRegDropQuery(it.raw.업체명); }}
                />
                <WaypointSection
                  stops={currentMultiSlot.경유하차목록 || []}
                  type="drop"
                  onSave={(list) => updateMultiSlot("경유하차목록", list)}
                  placeRows={mergedClients}
                  timeOptions={timeOptions}
                  className="mt-1.5"
                  orderDate={currentMultiSlot.하차일 || currentMultiSlot.상차일 || ""}
                />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.하차지주소" defaultText="하차지주소" /></label>
                <input autoComplete="off" className={mrInputCls} value={currentMultiSlot.하차지주소 || ""} onChange={e => updateMultiSlot("하차지주소", e.target.value)} />
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.하차지담당자" defaultText="하차지 담당자" /></label>
                <input autoComplete="off" className={mrInputCls} placeholder="담당자명" value={currentMultiSlot.하차지담당자 || ""} onChange={e => updateMultiSlot("하차지담당자", e.target.value)} />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.하차지담당자연락처" defaultText="하차지 담당자 연락처" /></label>
                <input autoComplete="off" className={mrInputCls} placeholder="연락처" value={currentMultiSlot.하차지담당자번호 || ""} onChange={e => updateMultiSlot("하차지담당자번호", formatPhone(e.target.value))} />
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.하차일" defaultText="하차일" /></label>
                <CustomDatePicker
                  value={currentMultiSlot.하차일 || currentMultiSlot.상차일 || ""}
                  showIcon
                  className={mrInputCls}
                  onChange={(e) => updateMultiSlot("하차일", e.target.value)}
                />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.하차시간" defaultText="하차시간" /></label>
                <TimeAmPmPicker
                  value={currentMultiSlot.하차시간 || ""}
                  onChange={(v) => updateMultiSlot("하차시간", v)}
                  selectCls={mrInputCls}
                />
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.상차방법" defaultText="상차방법" /></label>
                <CompanyOptionPicker optKey="상하차방법" title="상차방법" placeholder="선택" noneLabel="선택" className={mrInputCls} value={currentMultiSlot.상차방법 || ""} onChange={(__v) => (e => updateMultiSlot("상차방법", e.target.value))({ target: { value: __v } })} />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.하차방법" defaultText="하차방법" /></label>
                <CompanyOptionPicker optKey="상하차방법" title="하차방법" placeholder="선택" noneLabel="선택" className={mrInputCls} value={currentMultiSlot.하차방법 || ""} onChange={(__v) => (e => updateMultiSlot("하차방법", e.target.value))({ target: { value: __v } })} />
              </div>

              <div>
                <label className={`${mrLabelCls} flex items-center justify-between gap-2`}><EditableText id="orderForm.multi.label.차량종류" defaultText="차량종류" />
                  <VehicleTypeAddButton label="＋ 추가" onAdded={(v) => { updateMultiSlot("차량종류", v); setMultiRegVehicleQuery(v); }} /></label>
                <MultiRegCombo
                  className={mrInputCls}
                  placeholder="차량종류 입력 또는 선택"
                  value={multiRegVehicleQuery || currentMultiSlot.차량종류}
                  onChange={(v) => { setMultiRegVehicleQuery(v); updateMultiSlot("차량종류", v); }}
                  items={(() => {
                    const q = (multiRegVehicleQuery || currentMultiSlot.차량종류 || "").trim();
                    const all = withCustomVehicleTypes(VEHICLE_TYPES); // 🚚 2026-11-02 회사 추가 차량종류 포함
                    const list = q ? all.filter(v => v.includes(q)) : all;
                    return list.map((v, i) => ({ key: i, label: v, raw: v }));
                  })()}
                  onSelect={(it) => { updateMultiSlot("차량종류", it.raw); setMultiRegVehicleQuery(it.raw); }}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={mrLabelCls}><EditableText id="orderForm.multi.label.화물내용" defaultText="화물내용" /></label>
                  <input autoComplete="off" type="text" inputMode="decimal" className={mrInputCls} placeholder="숫자만 입력"
                    value={currentMultiSlot.화물수량 || ""}
                    onChange={e => updateMultiSlot("화물수량", e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
                <div className="w-24">
                  <label className={mrLabelCls}>&nbsp;</label>
                  <CustomSelect className={mrInputCls} value={currentMultiSlot.화물타입 || ""} onChange={e => updateMultiSlot("화물타입", e.target.value)}>
                    <option value="">없음</option>
                    {cargoTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
                  </CustomSelect>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={mrLabelCls}><EditableText id="orderForm.multi.label.차량톤수" defaultText="차량톤수" /></label>
                  <input autoComplete="off" type="text" inputMode="decimal" className={mrInputCls} placeholder="예: 5"
                    value={currentMultiSlot.톤수값 || ""}
                    onChange={e => updateMultiSlot("톤수값", e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
                <div className="w-24">
                  <label className={mrLabelCls}>&nbsp;</label>
                  <CustomSelect className={mrInputCls} value={currentMultiSlot.톤수타입 || ""} onChange={e => updateMultiSlot("톤수타입", e.target.value)}>
                    <option value="">없음</option>
                    {tonTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
                  </CustomSelect>
                </div>
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.운행유형" defaultText="운행유형" /></label>
                <CustomSelect className={mrInputCls} value={currentMultiSlot.운행유형 || "편도"} onChange={e => updateMultiSlot("운행유형", e.target.value)}>
                  <option value="편도">편도</option>
                  <option value="왕복">왕복</option>
                </CustomSelect>
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.지급방식" defaultText="지급방식" /></label>
                <CompanyOptionPicker optKey="지급방식" placeholder="선택" noneLabel="선택" className={mrInputCls} value={currentMultiSlot.지급방식 || ""} onChange={(__v) => (e => updateMultiSlot("지급방식", e.target.value))({ target: { value: __v } })} />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.배차방식" defaultText="배차방식" /></label>
                <DispatchWayPicker scope={[currentMultiSlot?.거래처명, currentMultiSlot?.상차지명, currentMultiSlot?.하차지명]} className={mrInputCls} value={currentMultiSlot.배차방식 || ""} dir={currentMultiSlot.콜구분 || ""} onPick={(pk) => Object.entries(pk).forEach(([k, v]) => updateMultiSlot(k, v))} />
              </div>

              <div className="col-span-2 relative">
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.스마트검색" defaultText="스마트검색" /></label>
                <textarea
                  className="w-full border-2 border-[#1B2B4B] rounded-xl px-4 py-2.5 text-[13px] resize-none bg-white shadow-[0_0_0_1px_rgba(27,43,75,0.08),0_2px_8px_rgba(27,43,75,0.06)] focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] focus:shadow-[0_0_0_1px_rgba(27,43,75,0.15),0_4px_12px_rgba(27,43,75,0.1)] placeholder:text-gray-500 transition-all"
                  rows={1}
                  wrap="off" // 🛠 2026-11-26 한 줄로(줄바꿈 없이)
                  style={{ whiteSpace: "nowrap", overflowX: "auto", overflowY: "hidden", height: 40, lineHeight: "22px", paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 10, scrollbarWidth: "none" }}
                  placeholder="기사 검색"
                  value={mrSmartDriverQuery}
                  onChange={e => handleMultiRegSmartDriverInput(e.target.value)}
                  onKeyDown={handleMultiRegSmartDriverKeyDown}
                  onBlur={e => {
                    setTimeout(() => {
                      if (e.target.value.trim().length > 4) applyMultiRegSmartDriverInput(e.target.value);
                      setMrSmartDriverMatched([]);
                      setMrSmartDriverActiveIdx(-1);
                    }, 200);
                  }}
                />
                {mrSmartDriverMatched.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border-2 border-[#1B2B4B] rounded-xl shadow-2xl mt-0.5 overflow-hidden">
                    <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-semibold">
                      등록된 기사 {mrSmartDriverMatched.length}명
                    </div>
                    {mrSmartDriverMatched.map((d, i) => (
                      <div key={i}
                        className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 flex items-center justify-between ${i === mrSmartDriverActiveIdx ? "bg-blue-100" : "hover:bg-blue-50"}`}
                        onMouseEnter={() => setMrSmartDriverActiveIdx(i)}
                        onMouseDown={() => selectMultiRegSmartDriver(d)}
                      >
                        <div>
                          <div className="font-bold text-gray-900 text-[14px]">{d.이름 || "-"}</div>
                          <div className="text-[12px] text-gray-500 mt-0.5">{d.차량번호} &nbsp;|&nbsp; {formatPhone(d.전화번호)}</div>
                        </div>
                        {d.등급 === "블랙" && (
                          <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded-full font-bold">블랙</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.차량번호" defaultText="차량번호" /></label>
                <input autoComplete="off" className={mrInputCls} placeholder="차량번호 입력"
                  value={currentMultiSlot.차량번호 || ""}
                  onChange={e => handleMultiRegCarNoChange(e.target.value)}
                  onKeyDown={e => {
                    if (!mrDriverDropdownOpen) {
                      if (e.key === "Enter") { e.preventDefault(); checkMultiRegNewDriver(e.currentTarget.value); }
                      return;
                    }
                    if (e.key === "ArrowDown") { e.preventDefault(); setMrDriverActive(i => Math.min(i + 1, mrDriverCandidates.length - 1)); }
                    if (e.key === "ArrowUp") { e.preventDefault(); setMrDriverActive(i => Math.max(i - 1, 0)); }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const selected = mrDriverCandidates[mrDriverActive];
                      if (!selected) return;
                      applyMultiSlotDriver({ 이름: selected.이름, 전화번호: formatPhone(selected.전화번호), 배차상태: "배차완료" });
                      setMrDriverDropdownOpen(false);
                    }
                    if (e.key === "Escape") setMrDriverDropdownOpen(false);
                    if (e.key === "Tab") {
                      const selected = mrDriverCandidates[mrDriverActive];
                      if (selected) {
                        applyMultiSlotDriver({ 이름: selected.이름, 전화번호: formatPhone(selected.전화번호), 배차상태: "배차완료" });
                        setMrDriverDropdownOpen(false);
                      }
                    }
                  }}
                  onBlur={e => {
                    if (!currentMultiSlot?.이름?.trim()) checkMultiRegNewDriver(e.currentTarget.value);
                    setTimeout(() => setMrDriverDropdownOpen(false), 150);
                  }}
                />
                {mrDriverDropdownOpen && mrDriverCandidates && mrDriverCandidates.length > 1 && (
                  <div className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
                    {mrDriverCandidates.map((d, i) => (
                      <div key={i}
                        className={`px-3 py-2 text-sm cursor-pointer ${i === mrDriverActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        onMouseEnter={() => setMrDriverActive(i)}
                        onMouseDown={() => {
                          const grade = d?.등급 || d?.grade || d?.상태 || "";
                          if (grade === "블랙") setBlackAlert(d);
                          applyMultiSlotDriver({ 이름: d.이름, 전화번호: formatPhone(d.전화번호), 배차상태: "배차완료" });
                          setMrDriverDropdownOpen(false);
                        }}
                      >
                        <div className="font-medium">{d.이름} · {d.차량번호}</div>
                        <div className="text-xs text-gray-500">{formatPhone(d.전화번호)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.기사명" defaultText="기사명" /></label>
                {/* ⭐ 2026-11-05 등록 기사와 매칭되면 잠금 + 오른쪽 [수정] */}
                <input autoComplete="off" data-driver-field="name" className={`${mrInputCls}${mrDrvLocked ? " !bg-[#F1F4F9]" : mrDrvEdit.editing ? " !border-[#2D4C82] ring-2 ring-[#8FB0F0]/40" : ""}`} readOnly={mrDrvLocked} placeholder="기사명 입력" value={currentMultiSlot.이름 || ""} onChange={e => updateMultiSlot("이름", e.target.value)}
                  onKeyDown={e => { if (mrDrvEdit.editing && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); mrDrvEdit.finish(currentMultiSlot); } }}
                  onBlur={() => { if (!mrDrvEdit.editing) checkMultiRegDriverConflict(); }} />
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.전화번호" defaultText="전화번호" /></label>
                <input autoComplete="off" data-driver-field="phone" className={`${mrInputCls}${mrDrvLocked ? " !bg-[#F1F4F9]" : mrDrvEdit.editing ? " !border-[#2D4C82] ring-2 ring-[#8FB0F0]/40" : ""}`} readOnly={mrDrvLocked} placeholder="전화번호 입력" value={currentMultiSlot.전화번호 || ""} onChange={e => updateMultiSlot("전화번호", formatPhone(e.target.value))}
                  onKeyDown={e => { if (mrDrvEdit.editing && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); mrDrvEdit.finish(currentMultiSlot); } }}
                  onBlur={() => { if (!mrDrvEdit.editing) checkMultiRegDriverConflict(); }} />
              </div>
              <div className="flex items-end pb-0.5">
                {(mrDrvLocked || mrDrvEdit.editing) && (
                  <DriverEditButton editing={mrDrvEdit.editing}
                    onEdit={() => mrDrvEdit.begin(currentMultiSlot)}
                    onDone={() => mrDrvEdit.finish(currentMultiSlot)}
                    onRevert={() => { const o = mrDrvEdit.revert(); if (o) applyMultiSlotDriver({ 이름: o.이름, 전화번호: o.전화번호 }); }} />
                )}
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.청구운임" defaultText="청구운임" /></label>
                <input autoComplete="off" type="text" inputMode="numeric" className={mrInputCls} placeholder="금액"
                  value={currentMultiSlot.청구운임 ? Number(currentMultiSlot.청구운임).toLocaleString() : ""}
                  onChange={e => updateMultiSlot("청구운임", e.target.value.replace(/[^\d]/g, ""))} />
              </div>
              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.기사운임" defaultText="기사운임" /></label>
                <input autoComplete="off" type="text" inputMode="numeric" className={mrInputCls} placeholder="금액"
                  value={currentMultiSlot.기사운임 ? Number(currentMultiSlot.기사운임).toLocaleString() : ""}
                  onChange={e => updateMultiSlot("기사운임", e.target.value.replace(/[^\d]/g, ""))} />
              </div>

              <div>
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.수수료" defaultText="수수료" /></label>
                <input autoComplete="off" readOnly className={`${mrInputCls} bg-gray-100`}
                  value={currentMultiSlot.수수료 ? Number(currentMultiSlot.수수료).toLocaleString() : currentMultiSlot.수수료 || ""} />
              </div>
              {/* ⭐ 2026-11-02 운임규칙 — 다중등록 운임구분(규칙 사용 회사만, 빈 칸 자리) */}
              {fareOn ? (
                <div>
                  <label className={mrLabelCls}>운임구분 <FareRuleHint className="ml-1.5" form={currentMultiSlot} rules={fareR.rules} onReapply={() => updateMultiSlot("__reapply")} /></label>
                  <div className="flex items-center gap-1.5"><FareTypeSelect pct={currentMultiSlot.운임구분수수료율} compact className="flex-1 min-w-0" rules={fareR.rules} value={currentMultiSlot.운임구분 || ""} onChange={(v) => updateMultiSlot("운임구분", v)} /><FarePctInput compact form={currentMultiSlot} rules={fareR.rules} onChange={(v) => updateMultiSlot("운임구분수수료율", v)} /></div>
                </div>
              ) : <div />}
              {/* 🏗 2026-11-09 지게차비용 — 다중등록도 오더마다 */}
              <div className="col-span-2"><SpecialFareButton form={currentMultiSlot} setForm={(fn) => setMultiRegSlots((prev) => prev.map((s, i) => (i === multiRegIdx ? (typeof fn === "function" ? fn(s) : fn) : s)))} /></div>

              <div className="col-span-2">
                <label className={mrLabelCls}><EditableText id="orderForm.multi.label.메모" defaultText="메모" /></label>
                <textarea className={mrTextareaCls} rows={2} value={currentMultiSlot.메모 || ""} onChange={e => updateMultiSlot("메모", e.target.value)} />
              </div>

              {/* 🧰 2026-11-23 [긴급 오더] · [혼적] 체크 → [운행 옵션] 하나(단일 등록과 같은 모양) — 넣는 값은 예전 그대로 */}
              <div className="col-span-2 flex items-center gap-2">
                <ToolMenuButton testId="multi-run-options" align="left" minWidth={230} menuTitle="운행 옵션: 켜고 끌 항목을 눌러요"
                  className={`h-9 px-3 rounded-[10px] border text-[13px] font-bold transition ${(currentMultiSlot.혼적 || currentMultiSlot.긴급) ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#2D4C82]"}`}
                  label={<>운행 옵션<span className="opacity-80">· {[currentMultiSlot.혼적 && "혼적", currentMultiSlot.긴급 && "긴급"].filter(Boolean).join(" · ") || "옵션 없음"}</span></>}
                  items={[
                    /* 🚚 2026-11-09 혼적 — 단일 등록과 같게(끄면 독차) */
                    { key: "mix", label: "혼적", desc: "다른 짐과 같이 실어요(끄면 독차)", checked: !!currentMultiSlot.혼적, onClick: () => updateMultiSlot("혼적", !currentMultiSlot.혼적) },
                    { key: "urgent", label: "긴급 오더", desc: "급한 오더로 표시해요", checked: !!currentMultiSlot.긴급, onClick: () => updateMultiSlot("긴급", !currentMultiSlot.긴급) },
                  ]} />
              </div>
            </div>

            {/* 슬롯 진행상황 미리보기 */}
            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
              {multiRegSlots.map((s, i) => (
                <button type="button" key={i} onClick={async () => { if (i !== multiRegIdx && !(await mrDrvEdit.finish(currentMultiSlot || {}))) return; setMultiRegIdx(i); }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                    i === multiRegIdx ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                    : s.하차지명 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white text-gray-400 border-gray-200"
                  }`}
                  title={`${s._groupLabel} ${i + 1}건`}
                >{i + 1}</button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
        {multiRegStep === "setup" ? (
          <>
            <span className="text-[12px] text-gray-500">
              총 {multiRegGroups.reduce((sum, g) => sum + (g.거래처명 ? (Number(g.count) || 0) : 0), 0)}건 등록 예정
            </span>
            <button type="button" onClick={startMultiRegisterFill}
              className="px-5 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px] hover:opacity-90 transition">
              다음
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={multiRegIdx === 0} onClick={goMultiRegPrev}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold text-[13px] disabled:opacity-40 hover:bg-gray-50 transition">
              이전
            </button>
            {multiRegIdx < multiRegSlots.length - 1 ? (
              <button type="button" onClick={goMultiRegNext}
                className="px-5 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px] hover:opacity-90 transition">
                다음 오더 ({multiRegIdx + 2}/{multiRegSlots.length})
              </button>
            ) : (
              <button type="button" disabled={multiRegSaving} onClick={submitMultiRegister}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-[13px] hover:opacity-90 transition disabled:opacity-50">
                {multiRegSaving ? "등록 중..." : `전체 ${multiRegSlots.length}건 등록하기`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  </div>
)}

{/* 다중등록 전용 "기사 정보 충돌/신규 확인" 팝업 — 단일 등록폼의 driverConflictPopup과
    화면은 완전히 동일하되, form이 아니라 현재 편집 중인 슬롯에 반영한다. */}
{mrDriverConflictPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden border">
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between">
        <div>
          <h3 className="text-white font-bold text-[15px]">
            {mrDriverConflictPopup.existing ? "⚠ 기사 정보 충돌" : "NEW 신규 기사 등록 확인"}
          </h3>
          <p className="text-white/60 text-[12px] mt-0.5">
            {mrDriverConflictPopup.existing
              ? "동일 차량번호에 다른 기사 정보가 감지되었습니다"
              : "등록되지 않은 기사입니다. 신규 등록하시겠습니까?"}
          </p>
        </div>
        <button onClick={() => setMrDriverConflictPopup(null)} className="text-white/50 hover:text-white text-xl leading-none ml-4 mt-0.5 flex-shrink-0">✕</button>
      </div>
      <div className="px-6 py-5 space-y-4">
        {mrDriverConflictPopup.existing && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-[11px] font-semibold text-gray-500 mb-2">기존 등록 정보</div>
            <div className="text-[14px] font-bold text-gray-800">{mrDriverConflictPopup.existing.이름}</div>
            <div className="text-[13px] text-gray-600 mt-1">
              {mrDriverConflictPopup.existing.차량번호} &nbsp;|&nbsp; {formatPhone(mrDriverConflictPopup.existing.전화번호)}
            </div>
          </div>
        )}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-blue-600 mb-2">
            {mrDriverConflictPopup.existing ? "새로 입력한 정보" : "신규 등록할 정보"}
          </div>
          <div className="text-[14px] font-bold text-gray-800">{mrDriverConflictPopup.input.name}</div>
          <div className="text-[13px] text-gray-600 mt-1">
            {mrDriverConflictPopup.input.plate} &nbsp;|&nbsp; {formatPhone(mrDriverConflictPopup.input.phone)}
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 space-y-3">
        {mrDriverConflictPopup.existing && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="py-2.5 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition"
                onClick={() => {
                  const ex = mrDriverConflictPopup.existing;
                  applyMultiSlotDriver({ 차량번호: ex.차량번호, 이름: ex.이름, 전화번호: formatPhone(ex.전화번호), 배차상태: "배차완료" });
                  setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
                  setMrDriverConflictPopup(null);
                }}
              >
                기존 정보 사용
              </button>
              <button
                className="py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                onClick={async () => {
                  const { plate, name, phone } = mrDriverConflictPopup.input;
                  // ⭐ 2026-11-05 비교한 그 기사 문서(id)를 정확히 바꾼다(같은 차량번호 기사 여러 명 대비)
                  await saveDriverChoice("update", { existing: mrDriverConflictPopup.existing, plate, name, phone, upsertDriver, company: userCompany });
                  applyMultiSlotDriver({ 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태: "배차완료" });
                  setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
                  setMrDriverConflictPopup(null);
                }}
              >
                기존 정보 덮어쓰기
              </button>
            </div>
            <button
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition"
              onClick={async () => {
                const { plate, name, phone } = mrDriverConflictPopup.input;
                await saveDriverChoice("add", { plate, name, phone, upsertDriver, company: userCompany }); // ⭐ 2026-11-05 별도 문서 이름 = 회사__차량번호__x…
                applyMultiSlotDriver({ 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태: "배차완료" });
                setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
                setMrDriverConflictPopup(null);
              }}
            >
              신규 기사로 별도 등록
            </button>
          </>
        )}
        {!mrDriverConflictPopup.existing && (
          <div className="grid grid-cols-2 gap-3">
            <button
              className="py-2.5 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition"
              onClick={() => setMrDriverConflictPopup(null)}
            >
              취소
            </button>
            <button
              className="py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition"
              onClick={async () => {
                const { plate, name, phone } = mrDriverConflictPopup.input;
                await upsertDriver({ 차량번호: plate, 이름: name, 전화번호: phone });
                applyMultiSlotDriver({ 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태: "배차완료" });
                setMrSmartDriverQuery(""); setMrSmartDriverMatched([]);
                setMrDriverConflictPopup(null);
                showAlert("✓ 신규 기사님이 등록되었습니다.");
              }}
            >
              신규 기사 등록
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
)}

{/* 다중등록 전용 오더메모 팝업 — 단일 등록폼 orderMemoPopup과 화면은 동일 */}
{multiRegOrderMemoPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white text-[15px] font-bold">{multiRegOrderMemoPopup.type === "pickup" ? "상차지" : "하차지"} 오더메모</h3>
          <p className="text-white/55 text-[12px] mt-0.5">{multiRegOrderMemoPopup.name}</p>
        </div>
        <button onClick={() => setMultiRegOrderMemoPopup(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="px-6 py-5 space-y-3">
        <textarea
          ref={imeFocusRef}
          rows={5}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
          placeholder="이 거래처를 상/하차지명에 입력할 때마다 안내 팝업으로 뜰 메모"
          value={multiRegOrderMemoPopup.memo}
          onChange={(e) => setMultiRegOrderMemoPopup(p => ({ ...p, memo: e.target.value }))}
        />
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-1.5">기사전달주의사항</div>
          <div className="text-[11px] text-gray-500 mb-1.5">이 상/하차지가 포함된 오더를 "기사전달용"으로 복사할 때 자동으로 함께 붙습니다</div>
          <textarea
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
            placeholder="예: 안전화 착용 필수"
            value={multiRegOrderMemoPopup.notice ?? defaultDriverNoticeTemplate(multiRegOrderMemoPopup.name)}
            onChange={(e) => setMultiRegOrderMemoPopup(p => ({ ...p, notice: e.target.value }))}
          />
        </div>
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
          <div>
            <div className="text-[13px] font-semibold text-gray-700">등록 시 오더메모/등급 팝업 표시</div>
            <div className="text-[11px] text-gray-500 mt-0.5">꺼두면 이 거래처를 어디서 입력하든 오더메모·등급 안내 팝업이 뜨지 않습니다</div>
          </div>
          <button type="button"
            onClick={() => setMultiRegOrderMemoPopup(p => ({ ...p, 팝업표시: p.팝업표시 === false ? true : false }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${multiRegOrderMemoPopup.팝업표시 === false ? "bg-gray-300" : "bg-[#1B2B4B]"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${multiRegOrderMemoPopup.팝업표시 === false ? "translate-x-1" : "translate-x-6"}`} />
          </button>
        </div>
      </div>
      <div className="px-6 pb-5 flex gap-3">
        <button onClick={() => setMultiRegOrderMemoPopup(null)}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.13975.취소" defaultText="취소" /></button>
        <button onClick={() => saveMultiRegOrderMemo(multiRegOrderMemoPopup.memo, multiRegOrderMemoPopup.팝업표시, multiRegOrderMemoPopup.notice ?? defaultDriverNoticeTemplate(multiRegOrderMemoPopup.name))}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.13977.저장" defaultText="저장" /></button>
      </div>
    </div>
  </div>
)}

{/* 🎨 구성형 디자인 시안 — 카드 바탕 · 묶음 제목 · 가운데 경로(입력칸은 그대로) */}
{layOn && <LayoutDecor skin={skinOn} form={form} mid={ofGrid.mid} onSwap={swapPickupDrop} onMap={() => setShowFareRouteMap(true)} />}
{kOn && <>
  <div className="of-k-dates" ref={setKDatesEl} />
  <div data-of="opt" ref={setKOptEl} />
  <div data-of="cal">
    <div className="of-k-calcard">
      <div className="of-k-head" style={{ marginBottom: 10 }}>
        <span className="of-k-ci"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></span><b>상·하차일 선택</b>
      </div>
      <OrderCalendarPanel variant="deck" quick
        pickupDate={form.상차일 || ""} dropDate={form.하차일 || ""}
        onPickupChange={(v) => onChange("상차일", v)} onDropChange={(v) => onChange("하차일", v)}
        companyName={userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY} />
    </div>
  </div>
</>}

{/* 청구 사업자(여러 사업자일 때만) + 거래처 + 신규등록
    ⭐ 2026-11-03 청구 사업자를 맨 앞 칸으로 — 거래처 칸(2칸) 안을 나눠 쓰므로 뒤 칸들이 밀리지 않는다 */}
<div data-of="cli" className={`col-span-2 ${dmBiz.multi ? "grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)] gap-x-3.5" : ""}`}>
  {dmBiz.multi && (
    <div className="min-w-0">
      <label className={labelCls} htmlFor="dm-biz-select"><EditableText id="orderForm.label.청구사업자" defaultText="청구 사업자" /></label>
      <BizSelect id="dm-biz-select" biz={dmBiz} value={form.청구사업자 || ""} onChange={pickBizManual} auto={bizAutoSrc} className={inputCls} />
    </div>
  )}
  <div className="min-w-0">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <label className={labelCls}><EditableText id="orderForm.label.거래처" defaultText="거래처" /> {reqStar}</label>
    </div>
    <div className="flex gap-2">
      <div className="relative flex-1" ref={comboRef}>
        <input autoComplete="off"
          data-arrownav data-tour="order-client"
          className={inputCls}
          placeholder="거래처 검색/입력"
          value={clientQuery || form.거래처명}
          onFocus={() => setIsClientOpen(true)}
         onChange={(e) => {
  setClientQuery(e.target.value);
  onChange("거래처명", e.target.value);
  setIsClientOpen(true);
  setClientActive(0);
}}

          onKeyDown={(e) => {
  const list = filteredClients;

  if (!isClientOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
    setIsClientOpen(true);
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();

    // 🔥 1️⃣ 검색 결과 없음 → 중복 확인 → 신규 여부 판단
    if (list.length === 0) {
      const name = clientQuery.trim();
      if (!name) return;

      const key = normalizeKey(name);
    const similar = placeList.filter((p) => {
  const k = normalizeKey(p.업체명);
  return k.includes(key) || key.includes(k);
});
      if (similar.length > 0) {
        setDupPopup({
          open: true,
          input: { name },   // ← 여기 중요
          candidates: similar,
        });
      } else {
        openNewPlacePrompt(name);
      }
      return;
    }

    // 🔹 2️⃣ 검색 결과 있을 때 → 선택
    const pick = list[clientActive];
    if (pick) applyClientSelect(pick.업체명);
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setClientActive((i) => Math.min(i + 1, list.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setClientActive((i) => Math.max(i - 1, 0));
  } else if (e.key === "Escape") {
    setIsClientOpen(false);
  } else if (e.key === "Tab") {
    // ⭐ 탭은 그냥 다음 칸으로 넘어가는 키다 — 드롭다운이 열려있다고
    // 맨 위(또는 방향키로도 안 만진) 항목을 자동으로 적용해버리면 안 된다.
    // 여기서는 목록만 닫고, 실제 포커스 이동은 브라우저 기본 Tab 동작에 맡긴다.
    setIsClientOpen(false);
  }
}}

        />
        {isClientOpen && (
          <div ref={clientDropdownListRef} className="absolute left-0 right-0 mt-1 max-h-52 overflow-auto bg-white border rounded-lg shadow-xl z-50">
            {filteredClients.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                검색 결과 없음
              </div>
            ) : (
              filteredClients.map((p, idx) => (
                <div
                  key={p.업체명 + "_" + idx}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    idx === clientActive ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
                  }`}
                  onMouseEnter={() => setClientActive(idx)}
                  onMouseDown={(e) => {

                    e.preventDefault();
                    applyClientSelect(p.업체명);
                  }}
                >
                  <div className="font-medium">{p.업체명}</div>
                  {p.주소 && (
                    <div className={`text-[11px] ${idx === clientActive ? "text-white/70" : "text-gray-500"}`}>{p.주소}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <button
  type="button"
  onClick={() => {
    const name = (clientQuery || "").trim();
   if (!name) return showAlert("업체명을 입력하세요.");

  const nk = normalizeKey(name);

const similar = placeList.filter(p => {
  const pk = normalizeKey(p.업체명);
  return pk.includes(nk) || nk.includes(pk);
});

    // 🔥 1️⃣ 비슷한 거래처 있으면 → 중복 팝업 먼저
    if (similar.length > 0) {
      setDupPopup({
        open: true,
        input: { name },
        candidates: similar,
      });
      return;
    }

    // 🔥 2️⃣ 진짜 없을 때만 신규 입력 팝업
    openNewPlacePrompt(name);
  }}
  className={`${DM_BTN_PRIMARY} !h-10 !px-3`}
>
  <DmIcon name="plus" size={14} />신규등록
</button>

    </div>
  </div>
  </div>

  {/* 상차지명 + 자동완성 */}
  {ofShow("상차지") && ( /* 🧩 입력칸 설정 */
  <div data-of="pn" className="relative">
    <label className={orderCardStyle === "A" ? "flex items-center h-[22px] overflow-visible gap-1.5 text-[16px] font-bold text-blue-600 mb-1" : "flex items-center h-[22px] overflow-visible gap-1.5 whitespace-nowrap text-[12.5px] font-black text-[#0F1A30] mb-1.5"}>
  {orderCardStyle === "B" && <span className="w-2 h-2 rounded-[2px] bg-[#0F1A30] shrink-0" />}
  <EditableText id="orderForm.label.상차지" defaultText="상차지" /> {reqStar}
  <OrderMemoIconButton onClick={() => openOrderMemoEditor("pickup")} title="상차지 오더메모" hasMemo={hasOrderMemoFor("pickup")} size={20} />
</label>

    <input autoComplete="off"
      id="pickup-place-input"
      data-arrownav
      className={inputCls}
      placeholder="상차지 검색"
      value={form.상차지명}
      onChange={(e) => {
        const v = e.target.value;
        handlePickupName(v);
        setPickupOptions(filterPlaces(v));
        setShowPickupDropdown(true);
        setPickupActive(0);
        pickupNavTouchedRef.current = false; // 새로 입력하면 이전 방향키 선택 흔적을 지운다
      }}
      onKeyDown={(e) => {
        const list = pickupOptions;
        if (!list.length) return;
        if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === "Enter") {
          const p = list[pickupActive];
          if (!p) return;
          applyPlaceToForm(p, "pickup", "pickup-manager");
          setShowPickupDropdown(false);
          setPickupOptions([]);
          pickupNavTouchedRef.current = false;
        } else if (e.key === "ArrowDown") {
          pickupNavTouchedRef.current = true;
          setPickupActive((i) => Math.min(i + 1, list.length - 1));
        } else if (e.key === "ArrowUp") {
          pickupNavTouchedRef.current = true;
          setPickupActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Escape") {
          setShowPickupDropdown(false);
          setPickupOptions([]);
        } else if (e.key === "Tab") {
          const p = list[pickupActive];
          // ⭐ 방향키로 직접 고른 항목이거나, 입력한 텍스트가 그 항목 이름과
          // 정확히 일치할 때만 자동 적용한다. 그 외(신규 업체명을 타이핑 중인데
          // 비슷한 기존 업체가 드롭다운 맨 위에 걸려있는 경우)에는 그냥 목록만
          // 닫고 사용자가 입력한 텍스트를 그대로 두어 다음 칸으로 넘어가게 한다.
          const exactMatch = p && normalizeKey(p.업체명) === normalizeKey(e.target.value);
          if (p && (pickupNavTouchedRef.current || exactMatch)) {
            // finalFocusId를 같은 입력창(pickup-place-input)으로 주면, 담당자가
            // 여러 명이라 팝업이 뜨는 경우 선택을 마친 뒤 포커스가 이 필드로
            // 되돌아오는데, 아직 지우지 않은 pickupOptions가 남아있는 상태에서
            // 다시 Tab을 누르면 이 분기가 또 실행되어 팝업이 무한히 재등장했다.
            // 다음 필드(담당자)로 넘기고 옵션 목록도 비워 재트리거를 막는다.
            applyPlaceToForm(p, "pickup", "pickup-manager");
            setShowPickupDropdown(false);
            setPickupOptions([]);
          } else {
            setShowPickupDropdown(false);
          }
          pickupNavTouchedRef.current = false;
        }
      }}
      onBlur={() => setTimeout(() => setShowPickupDropdown(false), 200)}
    />

    {showPickupDropdown && pickupOptions.length > 0 && (
  <div ref={pickupDropdownListRef} className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
    {pickupOptions.map((p, i) => (
      <div
        key={i}
        className={`px-2 py-1 cursor-pointer ${
          i === pickupActive ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
        }`}
        onMouseDown={() => {
          applyPlaceToForm(p, "pickup", "pickup-manager");
          setShowPickupDropdown(false);
          setPickupOptions([]);
        }}
      >

            <b>{p.업체명}</b>
            {p.주소 && <div className="text-xs text-gray-500">{p.주소}</div>}
          </div>
        ))}
      </div>
    )}
  </div>
  )}

{/* 상차지주소 */}
{ofShow("상차지주소") && ( /* 🧩 입력칸 설정 */
<div data-of="pa">
  <div className="flex items-center h-[22px] overflow-visible justify-between mb-1">
    <label className={`${labelCls} mb-0 min-w-0 overflow-hidden`} /* ⭐ 2026-11-02 화면 점검 — 좁아지면 라벨이 버튼을 덮지 않게 */>
      <EditableText id="orderForm.label.상차지주소" defaultText="상차지주소" /> <AutoBadge show={autoPickMatched} />
    </label>

    {/* ⭐ 여기로 이동 (핵심) */}
    <div className="flex items-center gap-1.5 shrink-0">
    <RoadviewButton addr={form.상차지주소} name={form.상차지명} variant="icon" />
<button
  type="button"
  tabIndex={-1}   // ★ 탭 제외 유지
  onClick={() => {
  setStopType("pickup");

const arr = (form.경유상차목록 || []).map(s => cleanStopCargo({ ...s, 상차일: s.상차일 || form.상차일 || "" }));
  setStopList(arr.length ? arr : [
    { 업체명:"", 주소:"", 담당자:"담당자", 담당자번호:"", 메모:"", 화물내용:"", 화물타입:"", 톤수값:"", 톤수타입:"", 차량톤수:"", 상차일: form.상차일 || "", 상차시간:"", 하차일:"", 하차시간:"", 방법:"" }
  ]);

  setStopPopupOpen(true);
}}
className={`
  text-[11px] font-bold px-2 py-0.5 rounded-lg border transition whitespace-nowrap shrink-0
  ${hasPickupStops
    ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
    : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
  }
`}
>
{hasPickupStops ? `경유 ${pickupCount}곳` : "+ 경유"}
</button>
    </div>
  </div>

  <input autoComplete="off"
    data-arrownav
    className={inputCls}
    value={form.상차지주소}
    onChange={(e) => handlePickupAddrManual(e.target.value)}
    placeholder="자동매칭 또는 수기입력"
  />
</div>
)}

{/* 상차지 담당자 */}
{ofShow("상차지담당자") && ( /* 🧩 입력칸 설정 */
<div data-of="pm">
  <div className="flex items-center h-[22px] overflow-visible justify-between mb-1">
    <label className={`${labelCls} mb-0`}>
      <EditableText id="orderForm.label.상차지담당자" defaultText="상차지 담당자" />
    </label>
    <ContactPickerIconButton onClick={() => openContactPickerFor("pickup")} title="상차지 담당자 선택" />
  </div>

  {/* 담당자 입력 */}
  <div className="relative">
        <input autoComplete="off"
      id="pickup-manager"
      data-arrownav
      className={inputCls}
      value={form.상차지담당자}
      onChange={(e) => onChange("상차지담당자", e.target.value)}
      placeholder="담당자 이름"
    />
  </div>
</div>
)}

{/* 상차지 연락처 */}
{ofShow("상차지연락처") && ( /* 🧩 입력칸 설정 */
<div data-of="pc">
  <label className={labelCls}><EditableText id="orderForm.label.상차지연락처" defaultText="상차지 연락처" /></label>
  <input autoComplete="off"
    id="pickup-phone"
    data-arrownav
    className={inputCls}
    value={form.상차지담당자번호}
    onChange={(e) =>
  onChange("상차지담당자번호", formatPhone(e.target.value))
}
    placeholder="010-0000-0000"
  />
</div>
)}

{/* 하차지명 + 자동완성 */}
{ofShow("하차지") && ( /* 🧩 입력칸 설정 */
<div data-of="dn" className="relative">
  <label className={orderCardStyle === "A" ? "flex items-center h-[22px] overflow-visible gap-1.5 text-[16px] font-bold text-red-500 mb-1" : "flex items-center h-[22px] overflow-visible gap-1.5 whitespace-nowrap text-[12.5px] font-black text-[#0F1A30] mb-1.5"}>
    {orderCardStyle === "B" && <span className="w-2 h-2 rounded-[2px] bg-[#CFE0FF] ring-1 ring-[#4B6CB7] shrink-0" />}
    <EditableText id="orderForm.label.하차지" defaultText="하차지" /> {reqStar}
    <OrderMemoIconButton onClick={() => openOrderMemoEditor("drop")} title="하차지 오더메모" hasMemo={hasOrderMemoFor("drop")} size={20} />
  </label>

  <input autoComplete="off"
    className={inputCls}
       id="drop-place-input"
    data-arrownav
    placeholder="하차지 검색"
    value={form.하차지명}
    onChange={(e) => {
      const v = e.target.value
      handleDropName(v)
      setPlaceOptions(filterPlaces(v))
      setShowPlaceDropdown(true)
      setPlaceActive(0)
      dropNavTouchedRef.current = false; // 새로 입력하면 이전 방향키 선택 흔적을 지운다
    }}
    onKeyDown={(e) => {
      const list = placeOptions
      if (!list.length) return

      if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
        e.preventDefault()
      }

      if (e.key === "Enter") {
        const p = list[placeActive]
        if (!p) return
        applyPlaceToForm(p, "drop", "drop-manager");
        setShowPlaceDropdown(false);
        setPlaceOptions([]);
        dropNavTouchedRef.current = false;
      } else if (e.key === "ArrowDown") {
        dropNavTouchedRef.current = true;
        setPlaceActive((i) => Math.min(i + 1, list.length - 1))
      } else if (e.key === "ArrowUp") {
        dropNavTouchedRef.current = true;
        setPlaceActive((i) => Math.max(i - 1, 0))
      } else if (e.key === "Escape") {
        setShowPlaceDropdown(false);
        setPlaceOptions([]);
      } else if (e.key === "Tab") {
        const p = list[placeActive]
        // ⭐ 방향키로 직접 고른 항목이거나, 입력한 텍스트가 그 항목 이름과 정확히
        // 일치할 때만 자동 적용한다. 그 외(신규 업체명을 타이핑 중인데 비슷한 기존
        // 업체가 드롭다운 맨 위에 걸려있는 경우)에는 목록만 닫고 입력한 텍스트를
        // 그대로 두어 다음 칸으로 넘어가게 한다.
        const exactMatch = p && normalizeKey(p.업체명) === normalizeKey(e.target.value);
        if (p && (dropNavTouchedRef.current || exactMatch)) {
          // finalFocusId가 같은 입력창(drop-place-input)이면, 담당자가 여러 명이라
          // 팝업이 뜬 뒤 선택을 마치고 포커스가 이 필드로 되돌아왔을 때 placeOptions가
          // 아직 남아있어 Tab을 다시 누르면 이 분기가 재실행되어 팝업이 계속
          // 재등장했다. 다음 필드(담당자)로 넘기고 옵션 목록도 비워 재트리거를 막는다.
          applyPlaceToForm(p, "drop", "drop-manager");
          setShowPlaceDropdown(false);
          setPlaceOptions([]);
        } else {
          setShowPlaceDropdown(false);
        }
        dropNavTouchedRef.current = false;
      }
    }}
    onBlur={() => setTimeout(() => setShowPlaceDropdown(false), 200)}
  />

  {showPlaceDropdown && placeOptions.length > 0 && (
    <div ref={placeDropdownListRef} className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
      {placeOptions.map((p, i) => (
        <div
          key={p.업체명 + "_" + i}
          className={`px-2 py-1 cursor-pointer ${
            i === placeActive ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
          }`}
          onMouseEnter={() => setPlaceActive(i)}
          onMouseDown={() => {
            applyPlaceToForm(p, "drop", "drop-manager");
            setShowPlaceDropdown(false);
            setPlaceOptions([]);
          }}
        >
          <b>{p.업체명}</b>
          {p.주소 && (
            <div className="text-xs text-gray-500">{p.주소}</div>
          )}
        </div>
      ))}
    </div>
  )}
</div>
)}

{/* 하차지주소 */}
{ofShow("하차지주소") && ( /* 🧩 입력칸 설정 */
<div data-of="da">

  <div className="flex items-center h-[22px] overflow-visible justify-between mb-1">

    <label className={`${labelCls} mb-0 min-w-0 overflow-hidden`} /* ⭐ 2026-11-02 화면 점검 — 좁아지면 라벨이 버튼을 덮지 않게 */>
      <EditableText id="orderForm.label.하차지주소" defaultText="하차지주소" /> <AutoBadge show={autoDropMatched} />
    </label>

    {/* ⭐ 여기로 이동 */}
    <div className="flex items-center gap-1.5 shrink-0">
    <RoadviewButton addr={form.하차지주소} name={form.하차지명} variant="icon" />
<button
  type="button"
  tabIndex={-1}
  onClick={() => {
  setStopType("drop");

  const arr = (form.경유하차목록 || []).map(s => cleanStopCargo({ ...s, 하차일: s.하차일 || form.하차일 || "" }));

  setStopList(
    arr.length
      ? arr
      : [{ 업체명:"", 주소:"", 담당자:"담당자", 담당자번호:"", 메모:"", 화물내용:"", 화물타입:"", 톤수값:"", 톤수타입:"", 차량톤수:"", 상차일:"", 상차시간:"", 하차일: form.하차일 || "", 하차시간:"", 방법:"" }]
  );

  setStopPopupOpen(true);
}}
className={`
  text-[11px] font-bold px-2 py-0.5 rounded-lg border transition whitespace-nowrap shrink-0
  ${hasDropStops
    ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
    : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
  }
`}
>
{hasDropStops ? `경유 ${dropCount}곳` : "+ 경유"}
</button>
    </div>
  </div>

  <input autoComplete="off"
    className={inputCls}
    data-arrownav
    value={form.하차지주소}
    onChange={(e) => handleDropAddrManual(e.target.value)}
    placeholder="자동매칭 또는 수기입력"
  />
</div>
)}

{/* 하차지 담당자 */}
{ofShow("하차지담당자") && ( /* 🧩 입력칸 설정 */
<div data-of="dm">
  <div className="flex items-center h-[22px] overflow-visible justify-between mb-1">
    <label className={`${labelCls} mb-0`}>
      <EditableText id="orderForm.label.하차지담당자" defaultText="하차지 담당자" />
    </label>
    <ContactPickerIconButton onClick={() => openContactPickerFor("drop")} title="하차지 담당자 선택" />
  </div>

    <input autoComplete="off"
    id="drop-manager"
    data-arrownav
    className={inputCls}
    value={form.하차지담당자}
    onChange={(e) =>
      onChange("하차지담당자", e.target.value)
    }
    placeholder="담당자 이름"
  />


</div>
)}

{ofShow("하차지연락처") && ( /* 🧩 입력칸 설정 */
<div data-of="dc">
  <label className={labelCls}><EditableText id="orderForm.label.하차지연락처" defaultText="하차지 연락처" /></label>
  <input autoComplete="off"
    id="drop-phone"
    data-arrownav
    className={inputCls}
    value={form.하차지담당자번호}
    onChange={(e) =>
  onChange(
    "하차지담당자번호",
    formatPhone(e.target.value)
  )
}
    placeholder="010-0000-0000"
  />
</div>
)}

{ofShow("화물내용") && ( /* 🧩 입력칸 설정 */
<div data-of="cargo" className="relative">
  {/* ⭐ 2026-11-02 화면 점검 — 칩이 줄바꿈되면 아래 입력칸을 덮지 않게 라벨 높이를 늘린다 */}
  <label className={labelCls + " flex items-center gap-1 flex-wrap !h-auto min-h-[22px]"}>
    <EditableText id="orderForm.label.화물내용" defaultText="화물내용" />
    <button type="button"
      tabIndex={-1}
      className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white hover:bg-[#243d6a] cursor-pointer whitespace-nowrap"
      onClick={() => setCargoAddPopup({ initialValue: form.화물내용||"", onCommit: (v) => onChange("화물내용", v) })}>
      + 추가
    </button>
    <CargoExtraChips value={form.화물내용} />
  </label>

  <div className="relative">

    {/* 입력 */}
    <input autoComplete="off"
      ref={cargoInputRef}
      data-arrownav
      className={`${inputCls} pr-[62px] text-base${requiredErrors.has("화물내용") ? " border-red-500 ring-2 ring-red-300 animate-pulse" : ""}`}
      placeholder={form.화물타입 ? "숫자만 입력" : "예: 2 또는 변압기"}
      value={form.화물타입
        ? String((form.화물내용 || "").split("+")[0]).replace(/(파레트|파렛트|박스|통)$/, "").trim()
        : ((form.화물내용 || "").split("+")[0])}
      onKeyDown={(e) => {
        if (form.화물타입 && form.화물타입 !== "없음") {
          if (!/[\d]/.test(e.key) && !["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End"].includes(e.key)) {
            e.preventDefault();
          }
        }
      }}
      onChange={(e) => {
        const extras = (form.화물내용 || "").replace(/^[^+]*/, "");
        if (form.화물타입 && form.화물타입 !== "없음") {
          const v = e.target.value.replace(/[^\d]/g, "");
          onChange("화물내용", `${v}${form.화물타입}${extras}`);
        } else {
          onChange("화물내용", e.target.value + extras);
        }
      }}
    />

    {/* 드롭다운 */}
    <div className="absolute top-0 right-0 h-full flex items-center pr-[1px]">
  <CustomSelect
   className="w-[58px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 border-l border-l-[#1B2B4B] appearance-none cursor-pointer"
        value={form.화물타입 || ""}
        openOnFocus

        onKeyDown={(e) => { cargoTypeTabbedRef.current = e.key === "Tab"; }}
        onChange={(e) => {
          const type = e.target.value;
          onChange("화물타입", type);

          const full = form.화물내용 || "";
          const base = full.split("+")[0];
          const extras = full.replace(/^[^+]*/, "");
          const KNOWN = ["파레트", "파렛트", "박스", "통"];
          let cleaned = base;
          for (const s of KNOWN) {
            if (cleaned.endsWith(s)) {
              cleaned = cleaned.slice(0, -s.length).trim();
              break;
            }
          }

          if (!type) {
            onChange("화물내용", cleaned + extras);
            // Tab으로 "없음"이 확정된 경우엔 브라우저가 이미 다음 칸(차량종류)으로 포커스를
            // 옮기는 중이라, 여기서 화물내용 입력창으로 되돌리면 Tab이 씹힌 것처럼 계속
            // 화물내용으로 튕겨 돌아온다 — 마우스 클릭/Enter로 확정했을 때만(포커스가 아직
            // 이 드롭다운에 남아있는 경우) 자유 입력이 편하도록 텍스트칸으로 옮겨준다.
            if (!cargoTypeTabbedRef.current) {
              setTimeout(() => cargoInputRef.current?.focus(), 0);
            }
          } else {
            onChange("화물내용", `${cleaned}${type}${extras}`);
          }
          cargoTypeTabbedRef.current = false;
        }}
      >
        <option value="">없음</option>
        <option value="파레트">파레트</option>
        <option value="박스">박스</option>
        <option value="통">통</option>
      </CustomSelect>

    </div>

  </div>
</div>
)}


{ofShow("차량종류") && ( /* 🧩 입력칸 설정 */
<div data-of="vk" className="relative">
  <div
  className="flex items-center h-[22px] overflow-visible justify-between mb-1"
  onClick={(e) => e.stopPropagation()}
>
  <label className={`${labelCls} mb-0 min-w-0 overflow-hidden`} /* ⭐ 2026-11-02 화면 점검 — 좁아지면 라벨이 버튼을 덮지 않게 */>
    <EditableText id="orderForm.label.차량종류" defaultText="차량종류" />
  </label>

 <button
    type="button"
    tabIndex={-1}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      setVehicleSpecTab("vehicle");
      setVehicleSpecOpen(true);
    }}
   className="text-[11px] font-bold px-1.5 py-0.5 rounded-lg bg-white border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white transition whitespace-nowrap shrink-0" /* ⭐ 2026-11-02 화면 점검 — 한 글자씩 줄바꿈 방지 */
  >
    차량·파렛
  </button>
</div>
  {/* 🚚 2026-11-02 회사 공용 차량종류 추가 — 목록 맨 아래 [＋ 차량종류 추가] */}

  <input autoComplete="off"
    data-arrownav
    className={inputCls}
    placeholder="차량종류 입력 또는 선택 (예: 냉동윙)"
    value={vehicleQuery || form.차량종류}
    onChange={(e) => {
      const v = e.target.value;
      setVehicleQuery(v);          // ▸ 입력 상태
      onChange("차량종류", v);     // ▸ form에는 항상 반영
      setShowVehicleDropdown(true);
      setVehicleActive(0);
    }}
    onFocus={() => {
      setShowVehicleDropdown(true); // ▸ 클릭만 해도 목록 표시
    }}
    onKeyDown={(e) => {
      const list = filterVehicles(vehicleQuery);

      if (!list.length) return;

      if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === "Enter") {
        // 🔹 Enter → 선택지가 있으면 선택, 없으면 그냥 수기입력 유지
        const pick = list[vehicleActive];
        if (pick) {
          onChange("차량종류", pick);
          setVehicleQuery(pick);
        }
        setShowVehicleDropdown(false);
      } else if (e.key === "ArrowDown") {
        setVehicleActive((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        setVehicleActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        setShowVehicleDropdown(false);
      } else if (e.key === "Tab") {
        // ⭐ 탭은 그냥 다음 칸으로 넘어가는 키다 — 방향키로 고르지 않았는데
        // 목록 맨 위 항목이 자동으로 적용되면 안 된다. 목록만 닫는다.
        setShowVehicleDropdown(false);
      }
    }}
    onBlur={() => {
      // 🔹 수기 입력 허용 → 그냥 닫기만
      setTimeout(() => setShowVehicleDropdown(false), 150);
    }}
  />

  {showVehicleDropdown && (
    <div className="absolute z-50 bg-white border border-[#E3E8F0] rounded-xl shadow-[0_14px_34px_rgba(15,26,48,0.18)] w-full max-h-60 overflow-auto py-1" onMouseDown={(e) => e.preventDefault()}>
      {filterVehicles(vehicleQuery).map((v, i) => (
        <div
          key={`${v}-${i}`}
          ref={(el) => (vehicleItemRefs.current[i] = el)}
          className={`px-3 py-2 cursor-pointer text-sm ${
            i === vehicleActive ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
          }`}
          onMouseEnter={() => setVehicleActive(i)}
          onMouseDown={() => {
            // 🔹 마우스로 선택
            onChange("차량종류", v);
            setVehicleQuery(v);
            setShowVehicleDropdown(false);
          }}
        >
          {v}
        </div>
      ))}
      <div className="sticky bottom-0 bg-white border-t border-[#EEF2F7] px-1.5 pt-1.5 pb-1 mt-1 shadow-[0_-8px_12px_rgba(255,255,255,0.95)]">
        <VehicleTypeAddButton
          initial={(vehicleQuery || "").trim() && !filterVehicles(vehicleQuery).includes((vehicleQuery || "").trim()) ? vehicleQuery : ""}
          label="＋ 차량종류 추가"
          className="w-full h-8 rounded-lg border-[1.5px] border-dashed border-[#9FB2D3] bg-white text-[#1B2B4B] text-[12.5px] font-black hover:bg-[#F5F8FD]"
          onAdded={(v) => { onChange("차량종류", v); setVehicleQuery(v); setShowVehicleDropdown(false); }}
        />
      </div>
    </div>
  )}
  
</div>
)}

{ofShow("차량톤수") && ( /* 🧩 입력칸 설정 */
<div data-of="ton" className="relative">
  <label className={labelCls}><EditableText id="orderForm.label.차량톤수" defaultText="차량톤수" /></label>

  <div className="relative">

    {/* 입력 */}
    <input autoComplete="off"
      ref={tonInputRef}
      data-arrownav
      className={`${inputCls} pr-[52px] text-base${requiredErrors.has("차량톤수") ? " border-red-500 ring-2 ring-red-300 animate-pulse" : ""}`}
      placeholder={form.톤수타입 ? "예: 1" : "예: 5톤 또는 소형"}
      inputMode={form.톤수타입 ? "decimal" : "text"}
      value={form.톤수타입 ? (form.톤수값 || "") : (form.차량톤수 || "")}
      onKeyDown={(e) => {
        if (form.톤수타입) {
          if (!/[\d.,]/.test(e.key) && !["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End"].includes(e.key)) {
            e.preventDefault();
          }
        }
      }}
      onChange={(e) => {
        if (form.톤수타입) {
          const v = e.target.value.replace(/[^\d.]/g, "");
          onChange("톤수값", v);
          onChange("차량톤수", `${v}${form.톤수타입}`);
        } else {
          onChange("차량톤수", e.target.value);
          onChange("톤수값", e.target.value);
        }
      }}
    />

    {/* 드롭다운 */}
    <div className="absolute top-0 right-0 h-full flex items-center pr-[1px]">

      <CustomSelect
        className="w-[48px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 border-l border-l-[#1B2B4B] appearance-none cursor-pointer"
        value={form.톤수타입}
        openOnFocus

        onChange={(e) => {
          const type = e.target.value;
          onChange("톤수타입", type);

          if (!type) {
            onChange("차량톤수", form.톤수값 || "");
            return;
          }

          onChange("차량톤수", `${form.톤수값 || ""}${type}`);
        }}
      >
        <option value="">없음</option>
        <option value="톤">톤</option>
        <option value="kg">kg</option>
      </CustomSelect>

    </div>

  </div>
</div>
)}

  {/* 금액 */}
{canMoney && (
  <>
    {/* 청구운임 */}
    <div data-of="fsale">
      <div className={`${labelCls} flex items-center gap-2 flex-wrap`}>
        <EditableText id="orderForm.label.청구운임" defaultText="청구운임" />

        {fareCompare.sale === "high" && (
          <span className="text-[11px] font-semibold text-red-600">
            기존보다 높음
          </span>
        )}
        {fareCompare.sale === "low" && (
          <span className="text-[11px] font-semibold text-blue-600">
            기존보다 낮음
          </span>
        )}
        {fareCompare.sale === "similar" && (
          <span className="text-[11px] font-semibold text-emerald-600">
            기존과 유사
          </span>
        )}

      </div>

      <input autoComplete="off"
        data-arrownav
        className={inputCls}
        value={form.청구운임 ? Number(form.청구운임).toLocaleString() : ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
          onChange("청구운임", raw);
        }}
      />
    </div>

    {/* 기사운임 */}
    <div data-of="fdrv">
      <label className={`${labelCls} flex items-center gap-2`}>
        <EditableText id="orderForm.label.기사운임" defaultText="기사운임" />

        {fareCompare.driver === "high" && (
          <span className="text-[11px] font-semibold text-red-600">
            기존보다 높음
          </span>
        )}
        {fareCompare.driver === "low" && (
          <span className="text-[11px] font-semibold text-blue-600">
            기존보다 낮음
          </span>
        )}
        {fareCompare.driver === "similar" && (
          <span className="text-[11px] font-semibold text-emerald-600">
            기존과 유사
          </span>
        )}
      </label>

      <input autoComplete="off"
        data-arrownav
        className={inputCls}
        value={form.기사운임 ? Number(form.기사운임).toLocaleString() : ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
          onChange("기사운임", raw);
        }}
      />
    </div>

    {/* 수수료 */}
    <div data-of="ffee">
      {/* ⭐ 2026-11-02 운임규칙 — 운임구분은 수수료 라벨 줄 오른쪽 알약 버튼(칸 배치 그대로) */}
      <div className={`${labelCls} flex items-center gap-1.5 whitespace-nowrap`}>
        <span className="shrink-0"><EditableText id="orderForm.label.수수료" defaultText="수수료" /></span>
        {fareOn && (
          <span className="ml-auto inline-flex items-center gap-1" data-fare-row="1">
            <FareRuleHint form={form} rules={fareR.rules} onReapply={() => onChange("__reapply")} />
            <FareTypeSelect pct={form.운임구분수수료율} compact align="right" id="order-fare-type" rules={fareR.rules} value={form.운임구분 || ""} placeholder="운임구분" onChange={(v) => onChange("운임구분", v)} />
            <FarePctInput compact form={form} rules={fareR.rules} onChange={(v) => onChange("운임구분수수료율", v)} />{/* ⭐ 2026-11-09 이 오더만 수수료율 */}
          </span>
        )}
      </div>
      <input autoComplete="off"
        className={`${inputCls} bg-gray-100`}
        value={form.수수료 ? Number(form.수수료).toLocaleString() : form.수수료}
        readOnly
      />
    </div>
  </>
)}
{/* ================= 경유지 추가 팝업 (멀티 입력) ================= */}
{stopPopupOpen && (
<div
  className="fixed inset-0 z-[99999]"
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      if (stopDeleteIdx !== null) {
        e.preventDefault(); e.stopPropagation();
        const next = stopList.filter((_, i) => i !== stopDeleteIdx);
        setStopDeleteIdx(null);
        if (next.length === 0) {
          if (stopType === "pickup") onChange("경유상차목록", []);
          else onChange("경유하차목록", []);
          setStopPopupOpen(false);
        } else { setStopList(next); }
        return;
      }
      e.stopPropagation();
    }
    if (e.key === "Escape" && stopDeleteIdx !== null) {
      e.stopPropagation(); setStopDeleteIdx(null);
    }
  }}
>

  <div
    className="absolute inset-0 bg-black/40"
  />

  <div className="absolute top-1/2 left-1/2 w-[600px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">

    <h3 className="text-lg font-bold">
      {stopType === "pickup" ? "경유 상차지 추가" : "경유 하차지 추가"}
    </h3>

    {stopList.map((stop, idx) => (
      <div key={idx} className="border rounded-lg p-3 space-y-2 bg-gray-50">

        {/* 경유지명 (자동완성) */}
        <div className="relative">
          <input autoComplete="off"
            className={inputCls}
            placeholder="경유지명"
            value={stop.업체명}
            onChange={(e) => {
              const v = e.target.value;
              setStopList(prev => {
                const copy = [...prev];
                copy[idx] = {
                  ...copy[idx],
                  업체명: v,
                  ...(v.trim() === "" && {
                    주소: "",
                    담당자: "",
                    담당자번호: ""
                  })
                };
                return copy;
              });
              const _q = v.toLowerCase();
              const list = _q
                ? mergedClients
                    .filter(p => (p.업체명 || "").toLowerCase().includes(_q) || normalizeKey(p.업체명 || "").includes(normalizeKey(v)))
                    .sort((a, b) => {
                      const na = (a.업체명 || "").toLowerCase(), nb = (b.업체명 || "").toLowerCase();
                      const sa = na.startsWith(_q) ? 2 : na.includes(_q) ? 1 : 0;
                      const sb = nb.startsWith(_q) ? 2 : nb.includes(_q) ? 1 : 0;
                      return sb - sa;
                    })
                : [];
              setStopPlaceOptions(list);
              setActiveStopIdx(idx);
              setShowStopDropdown(list.length > 0);
              setStopPlaceActive(0);
            }}
            onKeyDown={(e) => {
              // 🔥 Enter 전파 차단 (핵심)
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();

                const list = stopPlaceOptions;
                if (showStopDropdown && list.length > 0) {
                  const p = list[stopPlaceActive];
                  if (p) {
                    const contacts=(p.contacts||[]).filter(c=>c.name?.trim());
                    const unique=[...new Map(contacts.map(c=>[c.name.trim(),c])).values()];
                    if(unique.length>1){
                      setStopList(prev=>{const copy=[...prev];copy[idx]={...copy[idx],업체명:p.업체명,주소:p.주소||"",담당자:"",담당자번호:""};return copy;});
                      setStopContactPickerIdx(idx);
                      setStopContactPickerOpts(unique);
                    } else {
                      setStopList(prev => {
                        const copy = [...prev];
                        copy[idx] = {
                          ...copy[idx],
                          업체명: p.업체명,
                          주소: p.주소 || "",
                          담당자: p.담당자 || "",
                          담당자번호: p.담당자번호 || ""
                        };
                        return copy;
                      });
                    }
                    setShowStopDropdown(false);
                    setActiveStopIdx(null);
                  }
                }
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setStopPlaceActive(i => Math.min(i + 1, stopPlaceOptions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setStopPlaceActive(i => Math.max(i - 1, 0));
              } else if (e.key === "Escape") {
                setShowStopDropdown(false);
                setActiveStopIdx(null);
              } else if (e.key === "Tab") {
                const list = stopPlaceOptions;
                if (showStopDropdown && list.length > 0) {
                  const p = list[stopPlaceActive];
                  if (p) {
                    const contacts=(p.contacts||[]).filter(c=>c.name?.trim());
                    const unique=[...new Map(contacts.map(c=>[c.name.trim(),c])).values()];
                    if(unique.length<=1){
                      setStopList(prev => {
                        const copy = [...prev];
                        copy[idx] = {
                          ...copy[idx],
                          업체명: p.업체명,
                          주소: p.주소 || "",
                          담당자: p.담당자 || "",
                          담당자번호: p.담당자번호 || ""
                        };
                        return copy;
                      });
                      setShowStopDropdown(false);
                      setActiveStopIdx(null);
                    }
                  }
                }
              }
            }}
            onBlur={() => setTimeout(() => setActiveStopIdx(null), 200)}
          />

          {/* 드롭다운 */}
          {activeStopIdx === idx && stopPlaceOptions.length > 0 && (
            <div ref={stopPlaceDropdownListRef} className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
              {stopPlaceOptions.map((p, i) => (
                <div
                  key={p.업체명 + "_" + i}
                  className={`px-2 py-1 cursor-pointer ${
                    i === stopPlaceActive ? "bg-[#1B2B4B] text-white" : "hover:bg-gray-50"
                  }`}
                  onMouseEnter={() => setStopPlaceActive(i)}
                  onMouseDown={() => {
                    const contacts=(p.contacts||[]).filter(c=>c.name?.trim());
                    const unique=[...new Map(contacts.map(c=>[c.name.trim(),c])).values()];
                    if(unique.length>1){
                      setStopList(prev=>{const copy=[...prev];copy[idx]={...copy[idx],업체명:p.업체명,주소:p.주소||"",담당자:"",담당자번호:""};return copy;});
                      setStopContactPickerIdx(idx);
                      setStopContactPickerOpts(unique);
                    } else {
                      setStopList(prev => {
                        const copy = [...prev];
                        copy[idx] = {
                          ...copy[idx],
                          업체명: p.업체명,
                          주소: p.주소 || "",
                          담당자: p.담당자 || "",
                          담당자번호: p.담당자번호 || ""
                        };
                        return copy;
                      });
                    }
                    setShowStopDropdown(false);
                    setActiveStopIdx(null);
                  }}
                >
                  <b>{p.업체명}</b>
                  {p.주소 && (
                    <div className="text-xs text-gray-500">{p.주소}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 주소 */}
        <input autoComplete="off"
          className={inputCls}
          placeholder="주소"
          value={stop.주소}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }}
          onChange={(e) => {
            const v = e.target.value;
            setStopList(prev => {
              const copy = [...prev];
              copy[idx].주소 = v;
              return copy;
            });
          }}
        />

        {/* 담당자 / 연락처 (한 줄) */}
        <div className="grid grid-cols-2 gap-2">
          <input autoComplete="off"
            className={inputCls}
            placeholder="담당자"
            value={stop.담당자}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }}
            onChange={(e) => {
              const v = e.target.value;
              setStopList(prev => {
                const copy = [...prev];
                copy[idx].담당자 = v;
                return copy;
              });
            }}
          />
          <input autoComplete="off"
            className={inputCls}
            placeholder="연락처"
            value={stop.담당자번호}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }}
            onChange={(e) => {
              const v = formatPhone(e.target.value);
              setStopList(prev => {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], 담당자번호: v };
                return copy;
              });
            }}
          />
        </div>

        {/* 담당자 선택 팝업 (복수 담당자) */}
        {stopContactPickerIdx === idx && stopContactPickerOpts.length > 0 && (
          <div className="border border-blue-200 rounded-lg p-2 bg-blue-50">
            <div className="text-[11px] font-bold text-blue-600 mb-1.5">담당자 선택</div>
            {stopContactPickerOpts.map((contact, ci) => (
              <div key={ci}
                className="px-2 py-1.5 cursor-pointer hover:bg-white rounded-lg flex items-center justify-between"
                onClick={() => {
                  setStopList(prev=>{const copy=[...prev];copy[idx]={...copy[idx],담당자:contact.name||"",담당자번호:contact.phone||""};return copy;});
                  setStopContactPickerIdx(null);
                  setStopContactPickerOpts([]);
                }}>
                <span className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
                  {contact.name}
                  {contact.isPrimary && <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded-full bg-[#1B2B4B] text-white">대표</span>}
                </span>
                <span className="text-[12px] text-gray-500">{contact.phone}</span>
              </div>
            ))}
          </div>
        )}

        {/* 🔥 새로 추가: 화물내용 + 드롭다운 / 톤수 + 드롭다운 */}
        <div className="grid grid-cols-2 gap-2">

          {/* 화물내용 + 타입 드롭다운 */}
          <div className="relative">
            <input autoComplete="off"
              className={`${inputCls} pr-[62px]`}
              placeholder={stop.화물타입 ? "숫자만 입력" : "화물내용 (예: 2)"}
              value={stop.화물타입
                ? String(stop.화물내용 || "").replace(/(파레트|파렛트|박스|통)$/, "").trim()
                : (stop.화물내용 || "")}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); }
                if (stop.화물타입 && stop.화물타입 !== "없음") {
                  if (!/[\d]/.test(e.key) && !["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End"].includes(e.key)) {
                    e.preventDefault();
                  }
                }
              }}
              onChange={(e) => {
                const isUnit = stop.화물타입 && stop.화물타입 !== "없음";
                const v = isUnit ? e.target.value.replace(/[^\d]/g, "") : e.target.value;
                setStopList(prev => {
                  const copy = [...prev];
                  copy[idx].화물내용 = v;
                  return copy;
                });
              }}
            />
            <div className="absolute top-0 right-0 h-full flex items-center pr-[1px]">
              <CustomSelect
                className="w-[58px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer"
                value={stop.화물타입 || ""}
                openOnFocus
                onChange={(e) => {
                  const type = e.target.value;
                  setStopList(prev => {
                    const copy = [...prev];
                    // 단위를 고르면 숫자만 남긴다(단위 선택 시엔 글자 입력 불가)
                    copy[idx] = { ...copy[idx], 화물타입: type, 화물내용: type ? String(copy[idx].화물내용 || "").replace(/[^\d.]/g, "") : copy[idx].화물내용 };
                    return copy;
                  });
                }}
              >
                <option value="">없음</option>
                {cargoTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
              </CustomSelect>
            </div>
          </div>

          {/* 톤수 + 타입 드롭다운 */}
          <div className="relative">
            <input autoComplete="off"
              className={`${inputCls} pr-[52px]`}
              placeholder={stop.톤수타입 ? "톤수 (예: 1)" : "예: 5톤 또는 소형"}
              value={stop.톤수타입 ? (stop.톤수값 || "") : (stop.차량톤수 || "")}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); }
                if (stop.톤수타입) {
                  if (!/[\d.,]/.test(e.key) && !["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End"].includes(e.key)) {
                    e.preventDefault();
                  }
                }
              }}
              onChange={(e) => {
                const hasType = !!stop.톤수타입;
                const v = hasType ? e.target.value.replace(/[^\d.]/g, "") : e.target.value;
                setStopList(prev => {
                  const copy = [...prev];
                  if (hasType) {
                    copy[idx].톤수값 = v;
                    copy[idx].차량톤수 = `${v}${copy[idx].톤수타입}`;
                  } else {
                    copy[idx].차량톤수 = v;
                    copy[idx].톤수값 = v;
                  }
                  return copy;
                });
              }}
            />
            <div className="absolute top-0 right-0 h-full flex items-center pr-[1px]">
              <CustomSelect
                className="w-[48px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer"
                value={stop.톤수타입 || ""}
                openOnFocus
                onChange={(e) => {
                  const type = e.target.value;
                  setStopList(prev => {
                    const copy = [...prev];
                    const tv = type ? String(copy[idx].톤수값 || copy[idx].차량톤수 || "").replace(/[^\d.]/g, "") : (copy[idx].톤수값 || "");
                    copy[idx] = { ...copy[idx], 톤수타입: type, 톤수값: tv, 차량톤수: type ? (tv ? `${tv}${type}` : "") : tv };
                    return copy;
                  });
                }}
              >
                <option value="">없음</option>
                {tonTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
              </CustomSelect>
            </div>
          </div>

        </div>

        {/* 🔥 경유지 자체 날짜+시간 — 상차경유지는 상차일/상차시간만, 하차경유지는
            하차일/하차시간만 쓴다(오더 본 상차일/하차일은 전체 구간 날짜라, A→C(당일)→C→B(다음날)
            처럼 경유지마다 날짜가 갈리는 경우를 표현 못 하던 문제 — 경유지 자체에 날짜를 둔다). */}
        {stopType === "pickup" ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.상차일" defaultText="상차일" /></label>
              <CustomDatePicker
                value={stop.상차일 || ""}
                showIcon
                className={inputCls}
                onChange={(e) => {
                  const v = e.target.value;
                  setStopList(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], 상차일: v }; return copy; });
                }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.상차시간" defaultText="상차시간" /></label>
              <TimeAmPmPicker
                value={stop.상차시간 || ""}
                onChange={(v) => {
                  setStopList(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], 상차시간: v }; return copy; });
                }}
                selectCls={inputCls}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.하차일" defaultText="하차일" /></label>
              <CustomDatePicker
                value={stop.하차일 || ""}
                showIcon
                className={inputCls}
                onChange={(e) => {
                  const v = e.target.value;
                  setStopList(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], 하차일: v }; return copy; });
                }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.하차시간" defaultText="하차시간" /></label>
              <TimeAmPmPicker
                value={stop.하차시간 || ""}
                onChange={(v) => {
                  setStopList(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], 하차시간: v }; return copy; });
                }}
                selectCls={inputCls}
              />
            </div>
          </div>
        )}

        {/* 방법 (상/하차방법) */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block">
            {stopType === "pickup" ? "상차방법" : "하차방법"}
          </label>
          <CompanyOptionPicker optKey="상하차방법" placeholder="선택" noneLabel="선택" className={inputCls} value={stop.방법 || ""} onChange={(__v) => ((e) => {
              const v = e.target.value;
              setStopList(prev => {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], 방법: v };
                return copy;
              });
            })({ target: { value: __v } })} />
        </div>

        {/* 삭제 버튼 */}
        <div className="text-right">
          <button
            type="button"
            className="text-[11px] font-semibold text-gray-500 hover:text-red-500 transition"
            onClick={() => setStopDeleteIdx(idx)}
          >
            삭제
          </button>
        </div>

      </div>
    ))}

    {/* 하단 버튼 */}
    <div className="flex justify-between pt-3">
      <button
        type="button"
        className="px-3 py-1.5 text-sm font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 rounded-lg hover:bg-[#1B2B4B]/5 transition"
        onClick={() => {
          setStopList(prev => [
            ...prev,
            {
              업체명: "", 주소: "", 담당자: "담당자", 담당자번호: "", 메모: "",
              화물내용: "", 화물타입: "", 톤수값: "", 톤수타입: "",
              차량톤수: "",
              상차일: stopType === "pickup" ? (form.상차일 || "") : "",
              상차시간: "",
              하차일: stopType === "drop" ? (form.하차일 || "") : "",
              하차시간: "",
              방법: ""
            }
          ]);
        }}
      >
        + 경유 추가
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          className="px-3 py-1.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          onClick={() => setStopPopupOpen(false)}
        >
          취소
        </button>

                <button
          type="button"
          className="px-3 py-1.5 text-sm font-semibold bg-[#1B2B4B] text-white rounded-lg hover:bg-[#243a60] transition"
          onClick={() => {
            // 🔥 저장 전 화물내용/톤수에 타입 합치기
            const finalList = stopList.map(s0 => {
              const s = cleanStopCargo(s0);
              const cargo = s.화물내용 || "";
              const cargoType = s.화물타입 || "";
              const tonVal = s.톤수값 || "";
              const tonType = s.톤수타입 || "";
              const CARGO_SFXS = ["파레트","파렛트","박스","통"];
              let cargoBase = cargo;
              for (const sfx of CARGO_SFXS) { if (cargoBase.endsWith(sfx)) { cargoBase = cargoBase.slice(0, -sfx.length).trim(); break; } }
              const TON_SFXS = ["톤","kg","KG"];
              let tonBase = tonVal;
              for (const sfx of TON_SFXS) { if (tonBase.endsWith(sfx)) { tonBase = tonBase.slice(0, -sfx.length).trim(); break; } }
              // 아무것도 입력하지 않았으면 "없음"이 아니라 빈칸으로 저장한다
              const tonFree = s.차량톤수 || tonVal;
              const tonRaw8 = (tonType && tonBase) ? `${tonBase}${tonType}` : (tonType ? "" : tonFree);
              return {
                ...s,
                화물내용: cargoType ? (cargoBase ? `${cargoBase}${cargoType}` : "") : cargo,
                차량톤수: tonRaw8 ? toTonUnit(tonRaw8) : "",
              };
            });

            if (stopType === "pickup") {
              onChange("경유상차목록", finalList);
            } else {
              onChange("경유하차목록", finalList);
            }
            setStopPopupOpen(false);
          }}
        >
          저장
        </button>

      </div>
    </div>

  </div>

  {/* ── 경유지 삭제 확인 ── */}
  {stopDeleteIdx !== null && (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => setStopDeleteIdx(null)} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-[280px] text-center space-y-5">
        <p className="text-[15px] font-bold text-gray-800">경유지를 삭제하시겠습니까?</p>
        <div className="flex gap-3">
          <button type="button" className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-[14px] font-semibold text-gray-700 transition"
            onClick={() => setStopDeleteIdx(null)}><EditableText id="misc.btn.15464.아니오" defaultText="아니오" /></button>
          <button type="button" className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[14px] font-semibold transition" autoFocus
            onClick={() => {
              const next = stopList.filter((_, i) => i !== stopDeleteIdx);
              setStopDeleteIdx(null);
              if (next.length === 0) {
                if (stopType === "pickup") onChange("경유상차목록", []);
                else onChange("경유하차목록", []);
                setStopPopupOpen(false);
              } else { setStopList(next); }
            }}><EditableText id="misc.btn.15474.예" defaultText="예" /></button>
        </div>
      </div>
    </div>
  )}
</div>
)}

 {/* ===== 스마트검색 (독립 컬럼) ===== */}
{ofShow("스마트검색") && ( /* 🧩 입력칸 설정 */
<div data-of="ss" className="relative">
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
    <label className={labelCls}><EditableText id="orderForm.label.스마트검색" defaultText="스마트검색" /></label>
    {/* ⭐ 빈 지입차 추천 — 오늘 배차 없는 지입·직영 기사를 상차지 가까운 순으로 (현재 최고관리자 전용) */}
    {role === "totalMaster" && <IdleFleetButton
      drivers={drivers}
      dispatchData={dispatchData}
      pickupAddr={form.상차지주소}
      onPick={(x) => selectSmartDriver({ ...x.d, 차량번호: x.plate, 이름: x.name, 전화번호: x.phone })}
    />}
  </div>

  <div className="relative">
    <textarea
      className={orderCardStyle === "A"
        ? "w-full border-2 border-[#1B2B4B] rounded-xl px-4 py-2.5 text-[13px] resize-none bg-white shadow-[0_0_0_1px_rgba(27,43,75,0.08),0_2px_8px_rgba(27,43,75,0.06)] focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30 focus:border-[#1B2B4B] placeholder:text-gray-500 transition-all"
        : "w-full rounded-[12px] border border-[#CFD8E6] bg-[#F7F9FC] px-3.5 py-2 text-[13px] font-bold text-[#0F1A30] resize-none placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none focus:bg-white focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 transition"}
      rows={1}
      wrap="off" // 🛠 2026-11-26 한 줄로(줄바꿈 없이) — 칸이 좁아 "기사 스마트 검색"이 두 줄로 꺾였다
      style={{ whiteSpace: "nowrap", overflowX: "auto", overflowY: "hidden", height: 40, lineHeight: "22px", paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 10, scrollbarWidth: "none" }}
      data-arrownav

      placeholder={"기사 검색"}
      value={smartDriverQuery}


      onChange={e => handleSmartDriverInput(e.target.value)}
      onKeyDown={handleSmartDriverKeyDown}
      onBlur={e => {
        setTimeout(() => {
          if (e.target.value.trim().length > 4) {
            applySmartDriverInput(e.target.value);
          }
          setSmartDriverMatched([]);
          setSmartDriverActiveIdx(-1);
        }, 200);
      }}
    />
    {/* 검색 결과 드롭다운 */}
    {smartDriverMatched.length > 0 && (
      <div className="absolute z-50 w-full bg-white border-2 border-[#1B2B4B] rounded-xl shadow-2xl mt-0.5 overflow-hidden">
        <div className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[11px] font-semibold">
          등록된 기사 {smartDriverMatched.length}명
        </div>
        {smartDriverMatched.map((d, i) => (
          <div key={i}
            className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 flex items-center justify-between ${i===smartDriverActiveIdx?"bg-blue-100":"hover:bg-blue-50"}`}
            onMouseEnter={() => setSmartDriverActiveIdx(i)}
            onMouseDown={() => selectSmartDriver(d)}
          >
            <div>
              <div className="font-bold text-gray-900 text-[14px]">{d.이름 || "-"}</div>
              <div className="text-[12px] text-gray-500 mt-0.5">{d.차량번호} &nbsp;|&nbsp; {formatPhone(d.전화번호)}</div>
            </div>
            {d.등급 === "블랙" && (
              <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded-full font-bold">블랙</span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>

  {/* 매칭 확인 표시 — 삭제됨 */}

</div>
)}

{/* ===== 차량번호 (독립 컬럼) ===== */}
{ofShow("차량번호") && ( /* 🧩 입력칸 설정 */
<div data-of="plate" className="relative">
  <label className={labelCls}><EditableText id="orderForm.label.차량번호" defaultText="차량번호" /></label>

  <input autoComplete="off"
    data-arrownav
    className={inputCls}
    value={form.차량번호}
    onChange={(e) => handleCarNoChange(e.target.value)}
    onKeyDown={(e) => {
      if (!driverDropdownOpen) {
        if (e.key === "Enter") {
          e.preventDefault();
          checkNewDriver(e.currentTarget.value);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDriverActive((i) =>
          Math.min(i + 1, driverCandidates.length - 1)
        );
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDriverActive((i) =>
          Math.max(i - 1, 0)
        );
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const selected = driverCandidates[driverActive];
        if (!selected) return;

        setForm((p) => ({
          ...p,
          이름: selected.이름,
          전화번호: formatPhone(selected.전화번호),
          배차상태: "배차완료",
        }));

        setDriverDropdownOpen(false);
      }

      if (e.key === "Escape") {
        setDriverDropdownOpen(false);
      }

      if (e.key === "Tab") {
        const selected = driverCandidates[driverActive];
        if (selected) {
          setForm((p) => ({
            ...p,
            이름: selected.이름,
            전화번호: formatPhone(selected.전화번호),
            배차상태: "배차완료",
          }));
          setDriverDropdownOpen(false);
        }
      }
    }}
    onBlur={(e) => {
      // ✅ 스마트검색으로 이미 세팅된 경우 checkNewDriver 스킵
      if (!form.이름?.trim()) {
        checkNewDriver(e.currentTarget.value);
      }
      setTimeout(() => setDriverDropdownOpen(false), 150);
    }}

  />

  {/* 🔽 다중 기사 선택 드롭다운 */}
  {driverDropdownOpen &&
    driverCandidates &&
    driverCandidates.length > 1 && (
      <div ref={driverDropdownListRef} className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
        {driverCandidates.map((d, i) => (
          <div
            key={i}
            className={`px-3 py-2 text-sm cursor-pointer ${
              i === driverActive
                ? "bg-blue-50"
                : "hover:bg-gray-50"
            }`}
            onMouseEnter={() => setDriverActive(i)}
            onMouseDown={() => {
              const grade = d?.등급 || d?.grade || d?.상태 || "";
              if (grade === "블랙") {
                setBlackAlert(d);
              }
              setForm((p) => ({
                ...p,
                이름: d.이름,
                전화번호: formatPhone(d.전화번호),
                배차상태: "배차완료",
              }));
              setDriverDropdownOpen(false);
            }}
          >
            <div className="font-medium">
              {d.이름} · {d.차량번호}
            </div>
            <div className="text-xs text-gray-500">
              {formatPhone(d.전화번호)}
            </div>
          </div>
        ))}
      </div>
    )}
</div>
)}

{/* ===== 기사명 — ⭐ 2026-11-05 등록 기사와 매칭되면 잠금, 옆 [수정]으로 고침(미등록이면 예전처럼 바로 입력) ===== */}
{ofShow("기사명") && ( /* 🧩 입력칸 설정 */
<div data-of="dname">
  <label className={labelCls}><EditableText id="orderForm.label.기사명" defaultText="기사명" /></label>
  <input autoComplete="off"
    data-arrownav
    data-driver-field="name"
    className={`${inputCls}${formDrvLocked ? " !bg-[#F1F4F9] !text-[#1B2B4B]" : formDrvEdit.editing ? " !border-[#2D4C82] ring-2 ring-[#8FB0F0]/40" : ""}`}
    value={form.이름}
    readOnly={formDrvLocked}
    title={formDrvLocked ? "등록된 기사 정보예요. 옆 [수정]을 누르면 고칠 수 있어요" : undefined}
    placeholder="기사명 입력"
    onChange={(e) => onChange("이름", e.target.value)}
    onKeyDown={(e) => { if (formDrvEdit.editing && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); formDrvEdit.finish(form); } }}
    onBlur={() => { if (!formDrvEdit.editing) checkDriverConflict(); }}
  />
</div>
)}

{/* ===== 전화번호 ===== */}
{ofShow("전화번호") && ( /* 🧩 입력칸 설정 */
<div data-of="dphone">
  <label className={labelCls}><EditableText id="orderForm.label.전화번호" defaultText="전화번호" />
    {(formDrvLocked || formDrvEdit.editing) && (
      <DriverEditButton tiny className="ml-auto" editing={formDrvEdit.editing}
        onEdit={() => formDrvEdit.begin(form)}
        onDone={() => formDrvEdit.finish(form)}
        onRevert={() => { const o = formDrvEdit.revert(); if (o) setForm((p) => ({ ...p, 이름: o.이름, 전화번호: o.전화번호 })); }} />
    )}
  </label>
  <input autoComplete="off"
    data-arrownav
    data-driver-field="phone"
    className={`${inputCls}${formDrvLocked ? " !bg-[#F1F4F9] !text-[#1B2B4B]" : formDrvEdit.editing ? " !border-[#2D4C82] ring-2 ring-[#8FB0F0]/40" : ""}`}
    value={form.전화번호}
    readOnly={formDrvLocked}
    placeholder="전화번호 입력"
    onChange={(e) => onChange("전화번호", formatPhone(e.target.value))}
    onKeyDown={(e) => { if (formDrvEdit.editing && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); formDrvEdit.finish(form); } }}
    onBlur={() => { if (!formDrvEdit.editing) checkDriverConflict(); }}
  />
</div>
)}

  {/* 상/하차 방법 */}
  {ofShow("상차방법") && ( /* 🧩 입력칸 설정 */
  <div data-of="lm">
    <label className={labelCls}><EditableText id="orderForm.label.상차방법" defaultText="상차방법" /><DropdownOptionsManageButton optKey="상하차방법" label="상/하차방법" role={role} userCompany={userCompany} /></label>
    <CompanyOptionPicker optKey="상하차방법" title="상차방법" placeholder="선택" noneLabel="선택" className={inputCls} value={form.상차방법} onChange={(__v) => ((e) => onChange("상차방법", e.target.value))({ target: { value: __v } })} />
  </div>
  )}

  {ofShow("하차방법") && ( /* 🧩 입력칸 설정 */
  <div data-of="um">
    <label className={labelCls}><EditableText id="orderForm.label.하차방법" defaultText="하차방법" /><DropdownOptionsManageButton optKey="상하차방법" label="상/하차방법" role={role} userCompany={userCompany} /></label>
    <CompanyOptionPicker optKey="상하차방법" title="하차방법" placeholder="선택" noneLabel="선택" className={inputCls} value={form.하차방법} onChange={(__v) => ((e) => onChange("하차방법", e.target.value))({ target: { value: __v } })} />
  </div>
  )}

  {/* 결제 */}
  {ofShow("지급방식") && ( /* 🧩 입력칸 설정 */
  <div data-of="pay">
    <label className={labelCls}><EditableText id="orderForm.label.지급방식" defaultText="지급방식" /><DropdownOptionsManageButton optKey="지급방식" label="지급방식" role={role} userCompany={userCompany} /></label>
   <CompanyOptionPicker optKey="지급방식" placeholder="선택" noneLabel="선택" ref={payTypeRef} className={`${inputCls}${requiredErrors.has("지급방식") ? " border-red-500 ring-2 ring-red-300 animate-pulse" : ""}`} value={form.지급방식} onChange={(__v) => ((e) => {
  const v = e.target.value;
  onChange("지급방식", v);
 { const sp = payTypeStatusPatch(form, v); if (sp.배차상태) onChange("배차상태", sp.배차상태); }
})({ target: { value: __v } })} />
  </div>
  )}

  {/* 🗓 2026-11-27 마감월(이월 오더) — 시뮬레이션: 운송팀이 "10/31 상차 · 11월 마감"을 정할 곳이 없어 경리에서 10월 청구로 잡혔다.
       비워 두면 예전처럼 상차일의 달(거래처 마감일이 있으면 그 기준). 정하면 명세서 · 미수금 · 매출 · 회계가 모두 이 달로 잡힌다(arCore.monthOf) */}
  {ofShow("마감월") && (
  <div data-of="closeym">
    {/* 🎨 2026-11-27 브라우저 기본 달 선택(--------- ----) 대신 프로그램 달력 · 익월 버튼은 머리줄로(칸 옆에 두면 오른쪽이 잘렸다) */}
    <label className={`${labelCls} flex items-center justify-between gap-2`} title="상차한 달과 청구할 달이 다를 때만 고르세요. 비워 두면 상차일의 달로 청구돼요.">
      <span>마감월 <span className="text-[11px] font-semibold text-gray-400">(이월일 때만)</span></span>
      {(() => { const d = String(form.상차일 || ""); if (form.마감월 || !/^\d{4}-\d{2}/.test(d)) return null; const [y, m] = d.slice(0, 7).split("-").map(Number); const nx = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
        return <button type="button" className="text-[11.5px] font-extrabold text-[#2D4C82] hover:underline whitespace-nowrap" onClick={(e) => { e.preventDefault(); onChange("마감월", nx); }} title={`${Number(nx.slice(5))}월로 넣기`}>익월</button>; })()}
    </label>
    <div>
      <MonthPicker value={String(form.마감월 || "").slice(0, 7)} onChange={(v) => onChange("마감월", v || "")} clearable placeholder="상차일의 달" quick={false} className="w-full" />
    </div>
  </div>
  )}

  {ofShow("배차방식") && ( /* 🧩 입력칸 설정 */
  <div data-of="way">
    <label className={labelCls}><EditableText id="orderForm.label.배차방식" defaultText="배차방식" /><DropdownOptionsManageButton optKey="배차방식" label="배차방식" role={role} userCompany={userCompany} /></label>
    {/* 💳 2026-11-11 배차방식 — 먼저 IN/OUT, 그다음 방식(시험 기능이 꺼진 운송사는 예전 그대로) */}
    <DispatchWayPicker scope={[form?.거래처명, form?.상차지명, form?.하차지명]} className={inputCls} value={form.배차방식} dir={form.콜구분 || ""} role={role} userCompany={userCompany}
      onPick={(p) => Object.entries(p).forEach(([k, v]) => onChange(k, v))} />
  </div>
  )}
  {/* 🗂 2026-11-13 담당노선구분(켠 운송사만) — 시트 탭처럼 나눠 보는 묶음. 비워 두면 미지정 */}
  {rgFormOn && (
    <div>
      <label className={labelCls}>담당노선구분<DropdownOptionsManageButton optKey="담당노선구분" label="담당노선구분" role={role} userCompany={userCompany} /></label>
      <CompanyOptionPicker optKey="담당노선구분" placeholder="미지정" noneLabel="미지정" className={inputCls} value={form.담당노선구분 || ""} role={role} userCompany={userCompany} onChange={(v) => onChange("담당노선구분", v)} />
    </div>
  )}

{/* ===============================
    메모 / 전달사항 — ⭐ 2026-11-03 카드형으로 정리(작은 영문 머리글 · 중요도 칩 · 고정 토글 · 글자 수)
    값·동작(메모, 메모중요도, 전달사항, 전달사항고정)은 예전과 똑같다
   =============================== */}
{ofShow("메모") && ( /* 🧩 입력칸 설정 */
<div data-of="memo" className="col-span-full grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">{/* ⭐ 2026-11-02 화면 점검 — col-span-full */}

  {/* ── 메모 ── */}
  <section className={`group relative flex flex-col rounded-2xl border bg-white transition focus-within:border-[#1B2B4B] focus-within:ring-2 focus-within:ring-[#1B2B4B]/15 focus-within:shadow-[0_0_0_6px_rgba(143,176,240,0.16)] ${form.메모중요도 === "CRITICAL" ? "border-[#1B2B4B]" : "border-[#E3E8F0]"}`}>
    {form.메모중요도 && form.메모중요도 !== "NORMAL" && <span className={`absolute left-4 right-4 top-0 h-[2px] rounded-b ${form.메모중요도 === "CRITICAL" ? "bg-[#0F1A30]" : "bg-[#4B6CB7]"}`} />}
    <header className="flex items-center gap-2 px-4 h-12 border-b border-[#EDF1F7]">
      <span className="text-[10px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>MEMO</span>
      <label htmlFor="dm-memo" className="text-[13px] font-black text-[#0F1A30] whitespace-nowrap"><EditableText id="orderForm.label.메모" defaultText="메모" /></label>
      <span className="text-[11.5px] font-semibold text-[#9AA9C3] whitespace-nowrap">내부용</span>
      <div className="ml-auto inline-flex p-0.5 rounded-xl bg-[#F2F5FA] border border-[#E3E8F0]" role="radiogroup" aria-label="메모 중요도">
        {[
          { key: "NORMAL",   label: "일반", bars: 1 },
          { key: "HIGH",     label: "중요", bars: 2 },
          { key: "CRITICAL", label: "긴급", bars: 3 },
        ].map(({ key, label, bars }) => {
          const on = form.메모중요도 === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange("메모중요도", key)}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[10px] text-[11.5px] font-extrabold transition ${DM_FOCUS} ${on ? (key === "NORMAL" ? "bg-white text-[#0F1A30] shadow-[0_1px_3px_rgba(15,26,48,0.14)]" : "bg-[#0F1A30] text-white shadow-[0_3px_8px_rgba(15,26,48,0.25)]") : "text-[#7A8AA6] hover:text-[#0F1A30]"}`}
            >
              <span className="inline-flex items-end gap-[2px] h-[10px]" aria-hidden="true">
                {[1, 2, 3].map((b) => <span key={b} className={`w-[3px] rounded-[1px] ${b === 1 ? "h-[4px]" : b === 2 ? "h-[7px]" : "h-[10px]"} ${b <= bars ? (on ? (key === "CRITICAL" ? "bg-[#FF6B6B]" : key === "HIGH" ? "bg-[#8FB0F0]" : "bg-[#2D4C82]") : "bg-current") : (on && key !== "NORMAL" ? "bg-white/25" : "bg-[#C9D3E3]")}`} />)}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </header>
    <textarea
      id="dm-memo"
      className="flex-1 w-full min-h-[104px] px-4 pt-3 pb-7 bg-transparent resize-none text-[13.5px] leading-[1.6] font-semibold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none"
      rows={4}
      placeholder="내부 메모 입력"
      value={form.메모}
      onChange={(e) => onChange("메모", e.target.value)}
    />
    <span className="pointer-events-none absolute right-4 bottom-2.5 text-[10.5px] font-bold text-[#A7B3C6] tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{String(form.메모 || "").length}자</span>
  </section>

  {/* ── 전달사항 ── */}
  <section className="relative flex flex-col rounded-2xl border border-[#E3E8F0] bg-white transition focus-within:border-[#1B2B4B] focus-within:ring-2 focus-within:ring-[#1B2B4B]/15 focus-within:shadow-[0_0_0_6px_rgba(143,176,240,0.16)]">
    <header className="flex items-center gap-2 px-4 h-12 border-b border-[#EDF1F7]">
      <span className="text-[10px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DRIVER NOTE</span>
      <label htmlFor="dm-driver-note" className="text-[13px] font-black text-[#0F1A30] whitespace-nowrap"><EditableText id="orderForm.label.전달사항" defaultText="전달사항" /></label>
      <span className="text-[11.5px] font-semibold text-[#9AA9C3] whitespace-nowrap">기사님께</span>
      <button
        type="button"
        aria-pressed={!!form.전달사항고정}
        onClick={() => onChange("전달사항고정", !form.전달사항고정)}
        title="켜 두면 저장한 뒤에도 전달사항이 지워지지 않고 다음 오더에 그대로 남습니다"
        className={`ml-auto inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-[10px] border text-[11.5px] font-extrabold transition ${DM_FOCUS} ${form.전달사항고정 ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#DCE3EE] text-[#5B6B85] hover:border-[#2D4C82] hover:text-[#0F1A30]"}`}
      >
        <DmIcon name="pin" size={13} />
        고정
        <span className={`relative inline-flex w-7 h-4 rounded-full transition ${form.전달사항고정 ? "bg-[#8FB0F0]" : "bg-[#DCE3EE]"}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${form.전달사항고정 ? "left-[14px]" : "left-0.5"}`} />
        </span>
      </button>
    </header>
    <textarea
      id="dm-driver-note"
      className="flex-1 w-full min-h-[104px] px-4 pt-3 pb-7 bg-transparent resize-none text-[13.5px] leading-[1.6] font-semibold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none"
      rows={4}
      placeholder="운송 기사님께 전달 내용을 입력하세요"
      value={form.전달사항}
      onChange={(e) => onChange("전달사항", e.target.value)}
    />
    <span className="pointer-events-none absolute right-4 bottom-2.5 text-[10.5px] font-bold text-[#A7B3C6] tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{String(form.전달사항 || "").length}자</span>
  </section>

</div>
)}


{/* ================= 차량 제원표 모달 ================= */}
{vehicleSpecOpen && (() => {
  // 관리자 override를 반영한 최종 표시값. 카고/윙바디는 원본 데이터는 같지만
  // 회사에서 각각 따로 고쳐 쓸 수 있게 override는 테이블별로 독립적으로 관리한다.
  const cargoRows = CARGO_VEHICLE_SPEC_TABLE.map((v, i) => applySpecOverride(v, specOverrides.cargo[i]));
  const wingRows = CARGO_VEHICLE_SPEC_TABLE.map((v, i) => applySpecOverride(v, specOverrides.wing[i]));
  // 차량제원표 더블클릭 수정은 관리자~최고관리자 전용 — 위쪽의 isAdmin은 조회전용(isViewer)도
  // 함께 true가 되는 별개 용도라 여기서는 role만으로 다시 엄격하게 판별한다.
  const canEditVehicleSpec = role === "admin" || role === "totalMaster";

  // ⭐ 지금 열려있는 탭(차량제원/파렛트제원) 표를 그대로 이미지로 저장 — 스케줄표
  // 이미지저장과 동일하게 html2canvas로 캡처한다. data-html2canvas-ignore를 준 버튼/탭
  // 전환 UI는 캡처에서 제외되고, 표 내용만 이미지에 담긴다. (ref 자체는 훅 규칙 때문에
  // 이 조건부 블록 밖 — 위쪽 vehicleSpecOpen state 옆 — 에 선언돼 있고 여기선 재사용만 한다.)
  const saveSpecImage = async () => {
    if (!specCaptureRef.current) return;
    const canvas = await html2canvas(specCaptureRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const link = document.createElement("a");
    link.download = `${vehicleSpecTab === "vehicle" ? "차량제원표" : "파렛트제원표"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // ⭐ 사용자 요청 — A4 용지에 맞게 인쇄. 이미지저장과 동일하게 현재 탭의 표만
  // html2canvas로 캡처한 뒤, 운임확인서 인쇄(handlePrint)와 같은 방식으로 새
  // 창에 이미지를 띄워 @page A4 크기로 바로 인쇄되게 한다.
  const printSpecTable = async () => {
    if (!specCaptureRef.current) return;
    const canvas = await html2canvas(specCaptureRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    const title = vehicleSpecTab === "vehicle" ? "차량제원표" : "파렛트제원표";
    w.document.write(`<!doctype html><html><head><title>${title}</title><style>
      @page { size: A4; margin: 10mm; }
      body { margin:0; display:flex; justify-content:center; background:#fff; }
      img { width:100%; max-width:190mm; }
    </style></head><body><img src="${imgData}" onload="window.print()" /></body></html>`);
    w.document.close();
  };

  const SpecTable = ({ title, note, rows, tableKey }) => (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm"><EditableText id={`vehicleSpec.card.${title}`} defaultText={title} /></h3>
        <span className="text-xs text-gray-500">{note}{canEditVehicleSpec ? " · 행을 더블클릭하면 수정할 수 있습니다" : ""}</span>
      </div>
      <table className="w-full text-sm border border-gray-300">
        <thead className="bg-blue-50 text-blue-900">
          <tr>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.톤수" defaultText="톤수" /></th>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.구분" defaultText="구분" /></th>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.적재함길이" defaultText="적재함 길이" /></th>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.폭참고" defaultText="폭 참고" /></th>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.실무상명칭" defaultText="실무상 명칭" /></th>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.최대적재중량" defaultText="최대 적재 중량" /></th>
            <th className="border px-2 py-1"><EditableText id="vehicleSpec.cargo.header.최대적재파렛" defaultText="최대 적재 파렛" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => (
            <tr
              key={i}
              onDoubleClick={() => { if (canEditVehicleSpec) setVehicleSpecEdit({ table: tableKey, index: i }); }}
              className={canEditVehicleSpec ? "cursor-pointer hover:bg-amber-50 transition" : ""}
              title={canEditVehicleSpec ? "더블클릭하여 수정" : undefined}
            >
              <td className="border px-2 py-1 text-center font-semibold">{v.ton}</td>
              <td className="border px-2 py-1 text-center">{v.category}</td>
              <td className="border px-2 py-1 text-center">{v.bedLength}</td>
              <td className="border px-2 py-1 text-center">{v.widthRef}</td>
              <td className="border px-2 py-1 text-center">{v.name}</td>
              <td className="border px-2 py-1 text-center">{(v.maxKg / 1000).toLocaleString()} t</td>
              <td className="border px-2 py-1 text-center">{maxN11PalletCount(v)}개</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const editingBase = vehicleSpecEdit
    ? (vehicleSpecEdit.table === "cargo" ? cargoRows : wingRows)[vehicleSpecEdit.index]
    : null;

  return (
  <>
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl shadow-xl p-6 w-[1180px] max-w-[95vw] max-h-[85vh] overflow-auto">

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold"><EditableText id="vehicleSpec.title" defaultText="차량·파렛 제원표" /></h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveSpecImage}
            className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition"
          >
            <EditableText id="vehicleSpec.btn.이미지저장" defaultText="이미지 저장" />
          </button>
          <button
            type="button"
            onClick={printSpecTable}
            className="px-3 py-1.5 rounded-lg bg-white text-[#1B2B4B] border border-[#1B2B4B] text-[12px] font-bold hover:bg-blue-50 transition"
          >
            <EditableText id="vehicleSpec.btn.인쇄" defaultText="인쇄" />
          </button>
          <button
            onClick={() => setVehicleSpecOpen(false)}
            className="text-gray-500 hover:text-black text-lg"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 차량제원 / 파렛트제원 탭 — 이미지 캡처 대상 밖(탭 전환 UI 자체는 이미지에 안 담김) */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {[["vehicle","차량제원"],["pallet","파렛트제원"]].map(([t,l]) => (
          <button
            key={t}
            type="button"
            onClick={() => setVehicleSpecTab(t)}
            className={`px-4 py-1.5 rounded-md text-[13px] font-bold transition ${vehicleSpecTab === t ? "bg-[#1B2B4B] text-white" : "text-gray-500 hover:text-[#1B2B4B]"}`}
          >
            <EditableText id={`vehicleSpec.tab.${t}`} defaultText={l} />
          </button>
        ))}
      </div>

      <div ref={specCaptureRef} className="bg-white">
      {vehicleSpecTab === "vehicle" && (<>
      {/* ================= 퀵 차량 ================= */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-sm"><EditableText id="vehicleSpec.quick.title" defaultText="퀵 차량 제원표" /></h3>
          <span className="text-xs text-gray-500">*1100 × 1100 파렛트 규격 기준</span>
        </div>

        <table className="w-full text-sm border border-gray-300">
          <thead className="bg-blue-50 text-blue-900">
            <tr>
              <th className="border px-2 py-1"><EditableText id="vehicleSpec.quick.header.차량톤수" defaultText="차량톤수" /></th>
              <th className="border px-2 py-1"><EditableText id="vehicleSpec.quick.header.길이" defaultText="길이 (mm)" /></th>
              <th className="border px-2 py-1"><EditableText id="vehicleSpec.quick.header.너비" defaultText="너비 (mm)" /></th>
              <th className="border px-2 py-1"><EditableText id="vehicleSpec.quick.header.높이" defaultText="높이 (mm)" /></th>
              <th className="border px-2 py-1"><EditableText id="vehicleSpec.quick.header.최대적재중량" defaultText="최대 적재 중량" /></th>
              <th className="border px-2 py-1"><EditableText id="vehicleSpec.quick.header.최대적재파렛" defaultText="최대 적재 파렛" /></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border px-2 py-1 text-center">오토바이</td>
              <td className="border px-2 py-1 text-center">500</td>
              <td className="border px-2 py-1 text-center">500</td>
              <td className="border px-2 py-1 text-center">500</td>
              <td className="border px-2 py-1 text-center">25 k</td>
              <td className="border px-2 py-1 text-center">서류 및 작은 박스</td>
            </tr>

            <tr>
              <td className="border px-2 py-1 text-center">다마스</td>
              <td className="border px-2 py-1 text-center">1,600</td>
              <td className="border px-2 py-1 text-center">1,100</td>
              <td className="border px-2 py-1 text-center">1,100</td>
              <td className="border px-2 py-1 text-center">300 k</td>
              <td className="border px-2 py-1 text-center">박스</td>
            </tr>

            <tr>
              <td className="border px-2 py-1 text-center">라보</td>
              <td className="border px-2 py-1 text-center">1,800</td>
              <td className="border px-2 py-1 text-center">1,100</td>
              <td className="border px-2 py-1 text-center">1,300</td>
              <td className="border px-2 py-1 text-center">550 k</td>
              <td className="border px-2 py-1 text-center">1개</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ================= 카고 차량 ================= */}
      <div className="mb-8">
        <SpecTable title="카고 차량 제원표" note="톤수별 적재함 길이·폭 참고 기준" rows={cargoRows} tableKey="cargo" />
      </div>

      {/* ================= 윙바디 차량 ================= */}
      <div>
        <SpecTable title="윙바디 차량 제원표" note="톤수별 적재함 길이·폭 참고 기준" rows={wingRows} tableKey="wing" />
      </div>
      </>)}

      {vehicleSpecTab === "pallet" && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-sm"><EditableText id="vehicleSpec.pallet.title" defaultText="파렛트 제원표" /></h3>
            <span className="text-xs text-gray-500">규격(가로×세로×높이) · 자체무게</span>
          </div>
          <table className="w-full text-sm border border-gray-300">
            <thead className="bg-blue-50 text-blue-900">
              <tr>
                <th className="border px-2 py-1"><EditableText id="vehicleSpec.pallet.header.파렛트" defaultText="파렛트" /></th>
                <th className="border px-2 py-1"><EditableText id="vehicleSpec.pallet.header.규격" defaultText="규격 (가로×세로×높이)" /></th>
                <th className="border px-2 py-1"><EditableText id="vehicleSpec.pallet.header.자체무게" defaultText="자체 무게" /></th>
              </tr>
            </thead>
            <tbody>
              {PALLET_SPEC_TABLE.map(p => (
                <tr key={p.code}>
                  <td className="border px-2 py-1 text-center font-semibold">{p.code}{p.note ? ` (${p.note})` : ""}</td>
                  <td className="border px-2 py-1 text-center">{p.w.toLocaleString()} × {p.d.toLocaleString()} × {p.h} mm</td>
                  <td className="border px-2 py-1 text-center">{p.kgLabel || `${p.kg} kg`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

    </div>
  </div>

  {vehicleSpecEdit && editingBase && (
    <VehicleSpecEditModal
      initial={editingBase}
      hasOverride={!!(specOverrides[vehicleSpecEdit.table] && specOverrides[vehicleSpecEdit.table][vehicleSpecEdit.index])}
      onCancel={() => setVehicleSpecEdit(null)}
      onSave={saveVehicleSpecEdit}
      onReset={resetVehicleSpecEdit}
    />
  )}
  </>
  );
})()}
    {/* 버튼 */}
  <div data-of="save" className="col-span-full flex justify-end gap-2.5 mt-2 pt-4 border-t border-[#EDF1F7]">{/* ⭐ 2026-11-02 화면 점검 — col-span-full */}
    <button
      type="submit" data-tour="order-save"
      className={`${DM_BTN_PRIMARY} !h-11 !px-7 !text-[13.5px]`}
    >
      <DmIcon name="check" size={15} />저장
    </button>
  </div>
</form>
</div>{/* 폼 카드 끝 - Today 패널은 외부 flex에서 처리 */}
{/* ── PLACEHOLDER: 아래 Today 패널 시작 (렌더링 안 됨) ── */}
{false && <div className="hidden">
  {/* 헤더 */}
  <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
    <div>
      <div className="text-[10px] text-white/50 font-semibold tracking-widest">TODAY</div>
      <div className="text-[12px] text-white font-bold">{today}</div>
    </div>
    <div className="text-right">
      <div className="text-[10px] text-white/50 font-semibold">진행률</div>
      <div className="flex items-baseline gap-0.5 justify-end">
        <span className="text-[20px] font-black text-white leading-none">{rate}</span>
        <span className="text-[11px] font-bold text-white/50">%</span>
      </div>
    </div>
  </div>
  {/* 진행률 바 */}
  <div className="w-full h-1 bg-gray-200">
    <div className="h-full bg-[#1B2B4B] transition-all duration-1000" style={{ width: `${rate}%` }} />
  </div>

  {/* 나머지 콘텐츠 (스크롤 없이 꽉 채움) */}
  <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-y-auto">

    {/* 상태 3개 */}
    <div className="grid grid-cols-3 gap-1.5">
      {[
        { label: "배차중", val: doing, dot: "bg-[#1B2B4B]", pulse: doing > 0, list: todayRows.filter(r => r.배차상태 === "배차중") },
        { label: "미배차", val: pending, dot: "bg-gray-400", pulse: false, list: todayRows.filter(r => !r.차량번호?.trim()) },
        { label: "긴급", val: todayRows.filter(r => r.긴급 && r.배차상태 !== "배차완료").length, dot: "bg-red-500", pulse: todayRows.filter(r => r.긴급 && r.배차상태 !== "배차완료").length > 0, list: todayRows.filter(r => r.긴급 && r.배차상태 !== "배차완료") },
      ].map(({ label, val, dot, pulse, list }) => (
        <button key={label} type="button"
          onClick={() => setStatusPopup({ title: `${label} 리스트`, list })}
          className="bg-white border border-gray-100 rounded-lg p-2 text-center hover:shadow-sm transition">
          <div className={`w-1.5 h-1.5 rounded-full ${dot} ${pulse ? "animate-pulse" : ""} mx-auto mb-1`} />
          <div className="text-[18px] font-black text-[#1B2B4B] leading-none">{val}</div>
          <div className="text-[10px] text-gray-500 font-semibold mt-0.5">{label}</div>
        </button>
      ))}
    </div>

    {/* KPI 4개 */}
    <div className="grid grid-cols-2 gap-1.5">
      {[
        { label: "총 오더", val: total, unit: "건" },
        { label: "완료", val: done, unit: "건" },
        { label: "기사수", val: driverCount, unit: "명" },
        { label: "진행중", val: doing, unit: "건" },
      ].map(({ label, val, unit }) => (
        <div key={label} className="bg-white border border-gray-100 rounded-lg py-2 px-2 text-center">
          <div className="text-[16px] font-extrabold text-[#1B2B4B] leading-none">
            {val}<span className="text-[9px] font-semibold text-gray-400 ml-0.5">{unit}</span>
          </div>
          <div className="text-[10px] text-gray-500 font-semibold mt-0.5">{label}</div>
        </div>
      ))}
    </div>

    {/* 오늘 운임 */}
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-50">
        <span className="text-[11px] font-bold text-[#1B2B4B]">오늘 운임</span>
      </div>
      {[
        { label: "청구", val: todayRevenue },
        { label: "기사비용", val: todayDriverCost },
        { label: "수수료", val: todayFee },
      ].map(({ label, val }) => (
        <div key={label} className="px-3 py-1.5 flex justify-between items-center border-b border-gray-50 last:border-0">
          <span className="text-[10px] text-gray-500 font-medium">{label}</span>
          <span className="text-[12px] font-bold text-[#1B2B4B] tabular-nums">
            {val.toLocaleString()}<span className="text-gray-400 font-normal text-[9px] ml-0.5">원</span>
          </span>
        </div>
      ))}
      <div className="px-3 py-2 bg-[#1B2B4B] flex justify-between items-center">
        <span className="text-[10px] text-white/60 font-semibold">마진율</span>
        <span className="text-[15px] font-black text-white">{todayMarginRate.toFixed(1)}%</span>
      </div>
    </div>

    {/* 거래처 TOP 5 */}
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden flex-1 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-50 flex items-center justify-between shrink-0">
        <span className="text-[11px] font-bold text-[#1B2B4B]">거래처 TOP 5</span>
        <span className="text-[11px] text-gray-400 font-medium">오늘 오더</span>
      </div>
      <div className="px-3 py-2 flex-1 flex flex-col justify-center">
        {(() => {
          const counts = {};
          todayRows.forEach(r => { const name = r.거래처명?.trim(); if (name) counts[name] = (counts[name] || 0) + 1; });
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const max = sorted[0]?.[1] || 1;
          if (sorted.length === 0) return <div className="text-center py-2 text-[11px] text-gray-400">오늘 오더 없음</div>;
          return (
            <div className="space-y-1.5">
              {sorted.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-gray-400 w-2.5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-gray-700 truncate max-w-[120px]">{name}</span>
                      <span className="text-[10px] font-bold text-[#1B2B4B] shrink-0 ml-1">{count}건</span>
                    </div>
                    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1B2B4B] rounded-full" style={{ width: `${(count / max) * 100}%`, opacity: 1 - i * 0.15 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>

  </div>
</div>}
        {/* ------------------------------
      ● 오더복사 팝업 (완성본)
-------------------------------- */}
        {copyOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-[1140px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

              {/* 헤더 */}
              <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-5 bg-blue-400 rounded-full" />
                  <div>
                    <h2 className="text-[16px] font-bold text-white"><EditableText id="popup.title.오더복사" defaultText="오더복사" /></h2>
                    <p className="text-[11px] text-white/50 mt-0.5">더블클릭으로 바로 복사 · 체크 후 복사 버튼 사용 가능</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-white/80 cursor-pointer select-none">
                    <div className={`w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${onlyRoundTrip ? "bg-blue-400" : "bg-white/20"}`}
                      onClick={() => setOnlyRoundTrip(v => !v)}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${onlyRoundTrip ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    왕복만 보기
                  </label>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition text-xl font-light"
                    onClick={() => { setCopyOpen(false); setCopySelected([]); }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* 검색바 */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 shrink-0">
                <div className="flex gap-2">
                  <CustomSelect
                    className="border border-gray-200 bg-white px-3 py-2 rounded-xl text-[13px] font-semibold text-[#1B2B4B] outline-none focus:ring-2 focus:ring-[#1B2B4B]/20 focus:border-[#1B2B4B]"
                    value={copyFilterType}
                    onChange={(e) => setCopyFilterType(e.target.value)}
                  >
                    <option value="전체">전체</option>
                    <option value="거래처명">거래처명</option>
                    <option value="상차지명">상차지명</option>
                    <option value="하차지명">하차지명</option>
                    <option value="화물내용">화물내용</option>
                  </CustomSelect>
                  <input autoComplete="off"
                    ref={imeFocusRef}
                    type="text"
                    placeholder="검색어를 입력하세요"
                    className="border border-gray-200 bg-white px-4 py-2 rounded-xl text-[13px] flex-1 outline-none focus:ring-2 focus:ring-[#1B2B4B]/20 focus:border-[#1B2B4B]"
                    value={copyQ}
                    onChange={(e) => setCopyQ(e.target.value)}
                  />
                  <button
                    className="px-5 py-2 bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold rounded-xl transition active:scale-95 disabled:opacity-40"
                    disabled={copySelected.length === 0}
                    onClick={() => {
                      if (copySelected.length === 0) return showAlert("복사할 항목을 선택하세요.");
                      const r = copySelected[0];
                      const now = new Date();
                      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                      const today = now.toISOString().slice(0, 10);
                      applyCopy(r);
                      setForm((p) => ({
                        ...p,
                        상차일: today,
                        하차일: today,
                        차량번호: "",
                        이름: "",
                        전화번호: "",
                        배차상태: "배차중",
                      }));
                      setIsCopyMode(true);
                      setCopyOpen(false);
                      showAlert("오더 내용이 입력창에 복사되었습니다.", () => {
                        pendingCopyChainRef.current?.();
                        pendingCopyChainRef.current = null;
                      });
                    }}
                  >
                    복사
                  </button>
                </div>
                {copyQ && (
                  <p className="text-[12px] text-gray-500 mt-2 font-semibold">
                    {copyList.length > 0
                      ? `${copyList.length}건${copyList.length > 300 ? " 중 최근 300건" : ""} · 같은 거래처·상하차지·차량종류는 최신 1건만 · 화물내용·톤수는 빈칸으로 복사 · 더블클릭하면 바로 복사`
                      : "검색 결과가 없습니다"}
                  </p>
                )}
              </div>

              {/* 결과 테이블 */}
              <div className="flex-1 overflow-auto px-6 py-4">
                <table className="w-full min-w-max text-[13px]">
                  <thead>
  <tr className="bg-[#1B2B4B]/5 text-[#1B2B4B]">
    <th className="px-3 py-3 text-center font-bold text-[12px] rounded-l-lg w-10"><EditableText id="dispatch.table.header.선택" defaultText="선택" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px] w-24"><EditableText id="dispatch.table.header.상차일" defaultText="상차일" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px]"><EditableText id="dispatch.table.header.거래처명" defaultText="거래처명" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px]"><EditableText id="dispatch.table.header.상차지명" defaultText="상차지명" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px]"><EditableText id="dispatch.table.header.하차지명" defaultText="하차지명" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px]"><EditableText id="dispatch.table.header.화물내용" defaultText="화물내용" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px]"><EditableText id="dispatch.table.header.차량종류" defaultText="차량종류" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px]"><EditableText id="dispatch.table.header.차량톤수" defaultText="차량톤수" /></th>
    <th className="px-3 py-3 text-left font-bold text-[12px] rounded-r-lg"><EditableText id="dispatch.table.header.메모" defaultText="메모" /></th>
  </tr>
</thead>

                  <tbody>
                    {copyList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-16 text-[13px] font-semibold text-gray-500">
                          {copyQ ? "검색 결과가 없습니다." : "검색어를 입력하면 오더 목록이 표시됩니다."}
                        </td>
                      </tr>
                    ) : (
                      (copyShowMore ? copyList.slice(0, 300) : copyListShort).map((row) => ( // ★ 한 번에 300건까지만 그림(수천 줄을 그리면 멈춤)
                        <tr
  key={row._id}
  id={`row-${row._id}`}
  className={`border-b border-gray-100 cursor-pointer transition-colors duration-100 ${
    copySelected.includes(row)
      ? "bg-[#1B2B4B]/5 hover:bg-[#1B2B4B]/8"
      : "hover:bg-blue-50/60"
  }`}
  onDoubleClick={() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const today = now.toISOString().slice(0, 10);
    applyCopy(row);
    setForm((p) => ({
      ...p,
      상차일: today,
      하차일: today,
      차량번호: "",
      이름: "",
      전화번호: "",
      배차상태: "배차중",
    }));
    setIsCopyMode(true);
    setCopyOpen(false);
    showAlert("오더 내용이 입력창에 복사되었습니다.", () => {
      pendingCopyChainRef.current?.();
      pendingCopyChainRef.current = null;
    });
  }}
>
                          <td className="px-3 py-3 text-center">
                            <input autoComplete="off"
                              type="checkbox"
                              className="w-4 h-4 accent-[#1B2B4B] cursor-pointer"
                              checked={copySelected.includes(row)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCopySelected((prev) => [...prev, row]);
                                } else {
                                  setCopySelected((prev) => prev.filter((x) => x !== row));
                                }
                              }}
                            />
                          </td>
                          <td className="px-3 py-3 text-[12px] font-semibold text-gray-500 whitespace-nowrap">{row.상차일}</td>
                          <td className="px-3 py-3 font-semibold text-[#1B2B4B] whitespace-nowrap">{row.거래처명}</td>
                          <td className="px-3 py-3">
  <div className="inline-flex items-center gap-1 whitespace-nowrap">
    <span className="font-semibold text-gray-800">{row.상차지명}</span>

    {row.운행유형 === "왕복" && (
      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200 whitespace-nowrap">왕복</span>
    )}
    <RotationBadge order={row} />
   {(() => {
  const safeParse = v => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  };
  const arr = [
    ...safeParse(row.경유상차목록),
    ...safeParse(row.경유지_상차),
    ...safeParse(row.경유지상차),
  ].filter(Boolean);
  const unique = [...new Map(arr.map(s => [JSON.stringify(s), s])).values()];
  if (unique.length === 0) return null;
  return <StopBadge count={unique.length} list={unique} type="pickup" orderDate={row.상차일 || ""} />;
})()}
                          </div>
</td>
                          <td className="px-3 py-3">
  <div className="inline-flex items-center gap-1 whitespace-nowrap">
    <span className="font-semibold text-gray-800">{row.하차지명}</span>
   {(() => {
  const safeParse = v => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  };
  const arr = [
    ...safeParse(row.경유하차목록),
    ...safeParse(row.경유지_하차),
    ...safeParse(row.경유지하차),
  ].filter(Boolean);
  const unique = [...new Map(arr.map(s => [JSON.stringify(s), s])).values()];
  if (unique.length === 0) return null;
  return <StopBadge count={unique.length} list={unique} type="drop" orderDate={row.하차일 || ""} />;
})()}
  </div>
</td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{row.화물내용}</td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{row.차량종류}</td>
                          <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{row.차량톤수}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-600 text-[12px]">{row.메모}</span>
                              {row.긴급 === true && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-600 border border-red-200">긴급</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 더보기 버튼 */}
              {!copyShowMore && copyList.length > copyListShort.length && (
                <div className="px-6 py-2 flex justify-center border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setCopyShowMore(true)}
                    className="px-5 py-1.5 text-[13px] font-bold text-[#1B2B4B] border border-[#1B2B4B] rounded-lg hover:bg-[#1B2B4B] hover:text-white transition"
                  >
                    더보기 ({copyList.length - copyListShort.length}건 더 있음) →
                  </button>
                </div>
              )}

              {/* 하단 안내 */}
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
                <span className="text-[12px] font-semibold text-gray-500">
                  {copySelected.length > 0 ? `${copySelected.length}건 선택됨` : "행을 클릭해 선택하거나 더블클릭으로 바로 복사"}
                </span>
                <button
                  className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-[#1B2B4B] text-[13px] font-bold transition active:scale-95"
                  onClick={() => { setCopyOpen(false); setCopySelected([]); setCopyShowMore(false); }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
            </>
    );  // ← renderForm() return 끝

    // ⭐ 여기부터 4파트 테이블 추가
    return (
      <>
      
           {/* ==================== 상단: 입력폼 + Today 사이드패널 ==================== */}
{skinOn !== "base" && <style>{ORDER_SKIN_CSS}</style>}{/* 🎨 디자인 시안(최고관리자) */}
{layOn && <style>{ORDER_LAYOUT_CSS + ofGrid.css}</style>}
<div className={`flex items-stretch gap-3 w-full mb-4 of-skin of-skin-${skinOn}${layOn ? ` of-lay of-lay-${skinOn}` : ""}`} style={{ minWidth: 0 }}>
  {/* 왼쪽: 폼 */}
  {/* ⭐ 2026-11-01 화면이 좁으면(노트북·125% 배율 1536px 등) 입력칸이 겹쳐 화물내용 칸을 못 누를 정도였다 — 1800px 미만은 폼을 넓게 */}
  {/* ⭐ 2026-11-02 수수료 라벨 줄(운임구분)이 좁아지지 않게 입력 칸 74→77%(넓은 화면 62→66%) · 옆 달력은 그만큼 살짝 작게 */}
  <div data-kp-order-form="1" className={kOn ? "min-w-0" : "basis-[77%] max-w-[77%] min-[1800px]:basis-[66%] min-[1800px]:max-w-[66%]"} style={kOn ? { flex: "none", width: Math.round(K_W * kScale), minWidth: 0, overflow: "visible" } : { flexGrow: 0, flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
    {kOn ? (
      <div ref={kFitRef} className="w-full min-w-0">
        <div className="of-k-fit" style={{ width: kW, zoom: kScale }}>{renderForm()}</div>
      </div>
    ) : renderForm()}
  </div>

  {/* 오른쪽: 상/하차일 캘린더 패널 (기존 Today 통계패널 자리를 대체) —
      ⚠ 복수근무일 다중선택은 이 패널이 아니라 상차일 입력칸 자체의 달력
      (CustomDatePicker)에서 처리한다. 사용자 피드백: "오른쪽 패널에 있는
      달력말고 오더정보에 있는 달력에 다중선택 버튼을 넣어달라" — 그래서
      이 패널은 원래대로 단일 상/하차일 선택 전용으로 유지한다. */}
  {kOn ? (
    // 🗺 시안 L — 오른쪽에 늘 떠 있는 실시간 경로 지도(상 · 하차 주소가 들어오면 경로 · 거리 · 시간 · 유류비 · 통행료)
    <div className="flex-1 min-w-[560px] self-start sticky top-0">
      <OrderRouteMapPanel form={form} height={kPanelH} onOpenBig={() => setShowFareRouteMap(true)} />
    </div>
  ) : skinOn === "route" ? (
    // 🎨 A 루트 보드 — 달력 위에 운임 요약(보기만 · 입력은 왼쪽 칸)
    <div className="flex flex-col gap-3" style={{ flex: "1 1 0%", minWidth: 0 }}>
      <FareSummary form={form} hint={areaFareHint ? `이 구간 최근 운임 ${areaFareHint.min.toLocaleString()} ~ ${areaFareHint.max.toLocaleString()}원 (${areaFareHint.count}건)` : distanceFareEstimate ? `거리 기준 추정 ${distanceFareEstimate.min.toLocaleString()} ~ ${distanceFareEstimate.max.toLocaleString()}원` : ""} />
  <OrderCalendarPanel
      pickupDate={form.상차일 || ""}
      dropDate={form.하차일 || ""}
      onPickupChange={(v) => onChange("상차일", v)}
      onDropChange={(v) => onChange("하차일", v)}
      companyName={userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY}
    />
    </div>
  ) : assistAllowed ? (
    // 🧭 2026-11-27 시안 D — 오른쪽 '오늘 일정' 카드(요약 · 사진 모양 달력 · 주요 일정). 사용자 요청으로 거래처 최근 노선은 뺐다
    <SideAssist rows={recentDispatchData} calendar={
      <OrderCalendarPanel variant="deck"
        pickupDate={form.상차일 || ""}
        dropDate={form.하차일 || ""}
        onPickupChange={(v) => onChange("상차일", v)}
        onDropChange={(v) => onChange("하차일", v)}
        companyName={userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY}
      />} />
  ) : (
  <OrderCalendarPanel
    pickupDate={form.상차일 || ""}
    dropDate={form.하차일 || ""}
    onPickupChange={(v) => onChange("상차일", v)}
    onDropChange={(v) => onChange("하차일", v)}
    companyName={userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY}
  />
  )}
</div>
{dupOrderMatches && (
  <DuplicateOrderModal
    matches={dupOrderMatches}
    onCancel={() => { dupOrderResolveRef.current?.(false); setDupOrderMatches(null); }}
    onProceed={() => { dupOrderResolveRef.current?.(true); setDupOrderMatches(null); }}
  />
)}
{/* ================= 담당자 선택 팝업 (가로 3단 배치) ================= */}
{contactPopup && (() => {
  const _contactNorm = (s = "") => String(s || "").trim().toLowerCase();
  const nq = _contactNorm(contactSearchQ);
  // ⚠️ 전화번호 검색은 "검색어에서 숫자만 뽑은 값"이 실제로 존재할 때만 적용한다.
  // 안 그러면 두 가지 버그가 생긴다: (1) "박상은"처럼 숫자가 전혀 없는 검색어는
  // 숫자만 뽑으면 빈 문자열이 되는데, "아무문자열".includes("")는 항상 true라서
  // 전화번호 조건이 무조건 통과돼 이름 필터링 자체가 무의미해진다(전원 노출).
  // (2) "담당자4"처럼 이름 끝에 숫자가 섞인 검색어는 숫자만 뽑으면 "4" 한 글자가
  // 되는데, 자릿수가 너무 짧으면 전혀 관련 없는 다른 사람 전화번호에도 우연히
  // "4"가 들어있어 엉뚱하게 같이 걸린다 — 그래서 숫자 3자리 이상일 때만
  // 전화번호로도 검색되게 한다.
  const nqDigits = nq.replace(/\D/g, "");
  const visible = contactPopup.contacts
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !nq || _contactNorm(c.name || "").includes(nq) || (nqDigits.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(nqDigits)));
  return (
  <div
    className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]"
    tabIndex={-1}
    ref={(el) => { if (el && editingContactIdx === null && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; requestAnimationFrame(() => setTimeout(() => (contactSearchInputRef.current || el).focus(), 0)); } }} /* ⌨ 검색칸에 바로 커서 — 바탕에 먼저 두면 첫 글자가 영문으로 들어갔다 */
    onKeyDown={(e) => {
      // ⭐ 담당자 이름/전화번호를 인라인 수정 중일 때는 이 컨테이너 레벨의
      // 방향키 이동/검색창 자동포커스 로직을 절대 가로채면 안 된다. 수정 폼의
      // input들은 onKeyDown에서 stopPropagation을 하지 않고 그대로 버블링되므로,
      // 이 가드가 없으면 이름/전화번호 입력칸에서 Backspace(또는 아무 글자)를
      // 칠 때마다 매번 검색창으로 포커스가 튕겨 나가 수정 자체가 불가능해진다.
      if (editingContactIdx !== null) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setContactActive(i => Math.min(i + 1, visible.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setContactActive(i => Math.max(i - 1, 0));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setContactActive(i => Math.min(i + 5, visible.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setContactActive(i => Math.max(i - 5, 0));
      } else if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        if (e.key === "Enter") {
          const picked = visible[contactActive]?.c;
          closeContactPopup(picked || null);
        } else {
          closeContactPopup(null);
        }
      } else if (e.key.length === 1 || e.key === "Backspace") {
        // ⭐ 카드 그리드에 포커스가 있는 상태(방향키로 카드 이동 가능하게 하려고
        // 일부러 검색창이 아니라 여기에 포커스를 준다)에서도, 글자를 치기 시작하면
        // 바로 검색창으로 넘겨서 클릭 없이 곧장 검색할 수 있게 한다. preventDefault를
        // 하지 않으므로 이 키 입력은 포커스가 넘어간 검색창에 그대로 반영된다.
        contactSearchInputRef.current?.focus();
      }
    }}
  >
    <div className="bg-white rounded-2xl shadow-2xl w-[920px] max-w-[96vw] overflow-hidden">
      <div className="bg-[#1B2B4B] px-6 py-4">
    <h3 className="text-white font-bold text-[15px]">
          {contactPopup.type === "pickup" ? "● 상차지" : "● 하차지"} 담당자 선택
          {contactQueue.length > 0 && (
            <span className="ml-2 text-[11px] text-white/50">+{contactQueue.length}건 대기</span>
          )}
        </h3>
        <p className="text-white/60 text-[12px] mt-0.5">{contactPopup.place.업체명} · 총 {contactPopup.contacts.length}명</p>
      </div>
      <div className="px-5 pt-4">
        <input autoComplete="off"
          ref={contactSearchInputRef}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B2B4B]"
          placeholder="담당자 이름 또는 전화번호 검색"
          value={contactSearchQ}
          onChange={e => { setContactSearchQ(e.target.value); setContactActive(0); }}
          onKeyDown={e => {
            if (e.key === "Escape") { e.preventDefault(); closeContactPopup(null); }
            else if (e.key === "Enter") { e.preventDefault(); const picked = visible[contactActive]?.c; closeContactPopup(picked || null); }
          }}
        />
      </div>
      <div ref={contactListRef} className="relative p-5 grid grid-flow-col grid-rows-[repeat(4,min-content)] content-start auto-cols-[260px] gap-3 overflow-x-auto max-h-[70vh]">
        {visible.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-10 w-[260px]">검색 결과가 없습니다</div>
        )}
        {visible.map(({ c, i }, vi) => (
          <div
            key={i}
            className={`relative rounded-xl border-2 px-4 py-3.5 transition ${
              vi === contactActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200"
            }`}
            onMouseEnter={() => { if (editingContactIdx === null) setContactActive(vi); }}
          >
            {editingContactIdx === i ? (
              /* ── 인라인 수정 폼 ── */
              <div className="space-y-2" onClick={e => e.stopPropagation()}>
                <input autoComplete="off"
                  ref={imeFocusRef}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                  placeholder="이름"
                  value={editContactData.name}
                  onChange={e => setEditContactData(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                />
                <input autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                  placeholder="전화번호"
                  value={editContactData.phone}
                  onChange={e => setEditContactData(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                  onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                />
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    className="flex-1 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold"
                    onClick={async () => {
                      if (!editContactData.name.trim()) return showAlert("이름을 입력하세요.");
                      if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
                      const updated = contactPopup.contacts.map((x, idx) =>
                        idx === i ? { ...x, name: editContactData.name.trim(), phone: editContactData.phone.trim() } : x
                      );
                      await updateContactInPlace(contactPopup.place, updated);
                      setEditingContactIdx(null);
                    }}
                  ><EditableText id="misc.btn.16827.저장" defaultText="저장" /></button>
                  <button
                    className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-[12px]"
                    onClick={() => setEditingContactIdx(null)}
                  ><EditableText id="misc.btn.16831.취소" defaultText="취소" /></button>
                </div>
              </div>
            ) : (
              /* ── 일반 표시: 수정/삭제는 카드 우측 상단 아이콘으로 ── */
              <div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    title="수정"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition"
                    onClick={e => {
                      e.stopPropagation();
                      setEditContactData({ name: c.name || "", phone: c.phone || "" });
                      setEditingContactIdx(i);
                      setContactActive(vi);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  <button
                    title="삭제"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition"
                    onClick={async e => {
                      e.stopPropagation();
                      if (!await kpConfirm(`"${c.name}" 담당자를 삭제할까요?`)) return;
                      const updated = contactPopup.contacts.filter((_, idx) => idx !== i);
                      if (updated.length === 0) { showAlert("담당자가 1명 이하면 삭제할 수 없습니다."); return; }
                      // 삭제 후 primary 재지정
                      const hasPrimary = updated.some(x => x.isPrimary);
                      const final = hasPrimary ? updated : updated.map((x, idx) => ({ ...x, isPrimary: idx === 0 }));
                      await updateContactInPlace(contactPopup.place, final);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
                <div
                  className="cursor-pointer min-w-0 pr-16"
                  onClick={() => closeContactPopup(c)}
                >
                  <div className="font-bold text-gray-900 text-[14px] truncate flex items-center gap-1.5">
                    {c.name || "-"}
                    {c.isPrimary && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#1B2B4B] text-white">대표</span>}
                  </div>
                  <div className="text-[13px] font-bold text-gray-700 truncate mt-1">{c.phone || "-"}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 text-right">
        <button className="px-4 py-2 rounded-lg bg-gray-200 text-sm" onClick={() => closeContactPopup(null)}>
          취소
        </button>
      </div>
    </div>
  </div>
  );
})()}
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
        <button className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl font-bold text-sm" onClick={() => setBlackAlert(null)}><EditableText id="misc.btn.16916.확인" defaultText="확인" /></button>
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
        <button className="w-full py-3 bg-[#1B2B4B] text-white rounded-xl font-bold text-sm" onClick={() => setMemoAlert(null)}><EditableText id="misc.btn.16945.확인" defaultText="확인" /></button>
      </div>
    </div>
  </div>
)}
{/* 상/하차지 오더메모 보기·수정 팝업 */}
{orderMemoPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white text-[15px] font-bold">{orderMemoPopup.type === "pickup" ? "상차지" : "하차지"} 오더메모</h3>
          <p className="text-white/55 text-[12px] mt-0.5">{orderMemoPopup.name}</p>
        </div>
        <button onClick={() => setOrderMemoPopup(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="px-6 py-5 space-y-3">
        <textarea
          ref={imeFocusRef}
          rows={5}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
          placeholder="이 거래처를 상/하차지명에 입력할 때마다 안내 팝업으로 뜰 메모"
          value={orderMemoPopup.memo}
          onChange={(e) => setOrderMemoPopup(p => ({ ...p, memo: e.target.value }))}
        />
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-1.5">기사전달주의사항</div>
          <div className="text-[11px] text-gray-500 mb-1.5">이 상/하차지가 포함된 오더를 "기사전달용"으로 복사할 때 자동으로 함께 붙습니다</div>
          <textarea
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
            placeholder="예: 안전화 착용 필수"
            value={orderMemoPopup.notice ?? defaultDriverNoticeTemplate(orderMemoPopup.name)}
            onChange={(e) => setOrderMemoPopup(p => ({ ...p, notice: e.target.value }))}
          />
        </div>
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
          <div>
            <div className="text-[13px] font-semibold text-gray-700">등록 시 오더메모/등급 팝업 표시</div>
            <div className="text-[11px] text-gray-500 mt-0.5">꺼두면 이 거래처를 어디서 입력하든 오더메모·등급 안내 팝업이 뜨지 않습니다</div>
          </div>
          <button type="button"
            onClick={() => setOrderMemoPopup(p => ({ ...p, 팝업표시: p.팝업표시 === false ? true : false }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${orderMemoPopup.팝업표시 === false ? "bg-gray-300" : "bg-[#1B2B4B]"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${orderMemoPopup.팝업표시 === false ? "translate-x-1" : "translate-x-6"}`} />
          </button>
        </div>
      </div>
      <div className="px-6 pb-5 flex gap-3">
        <button onClick={() => setOrderMemoPopup(null)}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.16995.취소" defaultText="취소" /></button>
        <button onClick={() => saveOrderMemo(orderMemoPopup.memo, orderMemoPopup.팝업표시, orderMemoPopup.notice ?? defaultDriverNoticeTemplate(orderMemoPopup.name))}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.16997.저장" defaultText="저장" /></button>
      </div>
    </div>
  </div>
)}
{/* 🚫 거래처 블랙/주의 알림 */}
{notificationsEnabled && clientAlert && (
  <div
    className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999]"
    tabIndex={-1}
    ref={(el) => { if (el && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; setTimeout(() => el.focus(), 0); } }}
   onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setClientAlert(null);
        setTimeout(() => { advancePopupChain(); }, 50);
      }
    }}
  >
    <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
      {(() => {
        const isBlack = clientAlert.등급 === "블랙";
        const isCaution = clientAlert.등급 === "주의";
        const isDeparture = clientAlert.등급 === "이탈";
        const isGraded = isBlack || isCaution || isDeparture;
        // 등급이 "일반"이라도 메모가 등록돼 있으면 참고할 수 있도록 같은 방식으로 안내한다.
        const headerCls = isBlack ? "bg-gray-900" : isCaution ? "bg-orange-500" : isDeparture ? "bg-red-600" : "bg-[#1B2B4B]";
        const icon = isBlack ? "⊘" : isCaution ? "⚠" : isDeparture ? "⊘" : "✎";
        const title = isBlack ? "블랙 거래처 알림" : isCaution ? "주의 거래처 알림" : isDeparture ? "이탈 거래처 알림" : "거래처 메모 안내";
        const boxCls = isBlack ? "bg-red-50 border-red-200" : isCaution ? "bg-orange-50 border-orange-200" : isDeparture ? "bg-red-50 border-red-200" : "bg-[#1B2B4B]/5 border-[#1B2B4B]/20";
        const badgeCls = isBlack ? "bg-gray-900 text-white" : isCaution ? "bg-orange-500 text-white" : isDeparture ? "bg-red-600 text-white" : "bg-[#1B2B4B] text-white";
        const memoTextCls = isBlack ? "text-red-600" : isCaution ? "text-orange-600" : isDeparture ? "text-red-600" : "text-[#1B2B4B]";
        const footTextCls = isBlack ? "text-red-600" : isCaution ? "text-orange-500" : isDeparture ? "text-red-600" : "text-[#1B2B4B]";
        return (
      <>
      <div className={`px-6 py-4 flex items-center gap-3 ${headerCls}`}>
        <span className="text-2xl">{icon}</span>
        <h3 className="text-white text-lg font-bold">
          {title}
        </h3>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className={`border rounded-lg px-4 py-3 text-sm space-y-1.5 ${boxCls}`}>
          <div><span className="text-gray-500">거래처명</span> <b className="ml-2">{clientAlert.업체명}</b></div>
          <div><span className="text-gray-500">등급</span>
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${badgeCls}`}>
              {clientAlert.등급 || "일반"}
            </span>
          </div>
          {clientAlert.등급변경일 && (
            <div><span className="text-gray-500">지정일</span> <span className="ml-2">{clientAlert.등급변경일}</span></div>
          )}
          {clientAlert.주소 && (
            <div><span className="text-gray-500">주소</span> <span className="ml-2 text-gray-700">{clientAlert.주소}</span></div>
          )}
          {clientAlert.메모 && (
            <div><span className="text-gray-500">메모</span> <span className={`ml-2 font-semibold ${memoTextCls}`}>{clientAlert.메모}</span></div>
          )}
        </div>
        <p className="text-sm text-gray-600 text-center font-semibold">
          {isGraded
            ? <>해당 거래처는 <span className={`font-bold ${footTextCls}`}>{clientAlert.등급}</span> 등급으로 지정된 거래처입니다.</>
            : "해당 거래처에 등록된 메모를 확인해주세요."}
        </p>
      </div>
      <div className="px-6 pb-5">
        <button className={`w-full py-3 text-white rounded-xl font-bold text-sm ${isBlack ? "bg-gray-900" : isCaution ? "bg-orange-500" : isDeparture ? "bg-red-600" : "bg-[#1B2B4B]"}`}
          onClick={() => {
            setClientAlert(null);
            setTimeout(() => { advancePopupChain(); }, 50);
          }}><EditableText id="misc.btn.17068.확인" defaultText="확인" /></button>
      </div>
      </>
        );
      })()}
    </div>
  </div>
)}
{/* ===== 거래처 주소 충돌 팝업 ===== */}
<PlaceConflictPopup open={placeConflictOpen} queue={placeConflictQueue} setQueue={setPlaceConflictQueue} setOpen={setPlaceConflictOpen} savePlaceSmart={savePlaceSmart} upsertPlace={upsertPlace} />
{/* ⭐ 2026-11-05 기사 이름·전화 [수정] → 기존 정보 변경 / 별도 추가 선택 팝업 */}
{formDrvEdit.modal}
{mrDrvEdit.modal}
{/* ===== 기사 정보 충돌 팝업 ===== */}

{driverConflictPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden border">
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between">
        <div>
          <h3 className="text-white font-bold text-[15px]">
            {driverConflictPopup.existing ? "⚠ 기사 정보 충돌" : "NEW 신규 기사 등록 확인"}
          </h3>
          <p className="text-white/60 text-[12px] mt-0.5">
            {driverConflictPopup.existing
              ? "동일 차량번호에 다른 기사 정보가 감지되었습니다"
              : "등록되지 않은 기사입니다. 신규 등록하시겠습니까?"
            }
          </p>
        </div>
        <button
          onClick={() => setDriverConflictPopup(null)}
          className="text-white/50 hover:text-white text-xl leading-none ml-4 mt-0.5 flex-shrink-0"
        >✕</button>
      </div>
      <div className="px-6 py-5 space-y-4">
        {/* 기존 정보 (있을 때만 표시) */}
        {driverConflictPopup.existing && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-[11px] font-semibold text-gray-500 mb-2">기존 등록 정보</div>
            <div className="text-[14px] font-bold text-gray-800">{driverConflictPopup.existing.이름}</div>
            <div className="text-[13px] text-gray-600 mt-1">
              {driverConflictPopup.existing.차량번호} &nbsp;|&nbsp; {formatPhone(driverConflictPopup.existing.전화번호)}
            </div>
          </div>
        )}
        {/* 신규 입력 정보 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-blue-600 mb-2">
            {driverConflictPopup.existing ? "새로 입력한 정보" : "신규 등록할 정보"}
          </div>
          <div className="text-[14px] font-bold text-gray-800">{driverConflictPopup.input.name}</div>
          <div className="text-[13px] text-gray-600 mt-1">
            {driverConflictPopup.input.plate} &nbsp;|&nbsp; {formatPhone(driverConflictPopup.input.phone)}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-3">

        {/* ===== 기존 기사님이 있는 경우: 3버튼 ===== */}
        {driverConflictPopup.existing && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="py-2.5 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition"
                onClick={() => {
                  handleCarNoChange(driverConflictPopup.existing.차량번호);
                  setSmartDriverQuery(""); setSmartDriverMatched([]);
                  setDriverConflictPopup(null);
                }}
              >
                기존 정보 사용
              </button>
              <button
                className="py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                onClick={async () => {
                  const { plate, name, phone } = driverConflictPopup.input;
                  // ⭐ 2026-11-05 같은 차량번호 기사가 여러 명일 수 있으니 비교한 그 기사 문서(id)를 정확히 바꾼다
                  await saveDriverChoice("update", { existing: driverConflictPopup.existing, plate, name, phone, upsertDriver, company: userCompany });
                  setForm(p=>({...p, 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태:"배차완료"}));
                  setSmartDriverQuery(""); setSmartDriverMatched([]);
                  setDriverConflictPopup(null);
                }}
              >
                기존 정보 덮어쓰기
              </button>
            </div>
            <button
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition"
              onClick={async () => {
                const { plate, name, phone } = driverConflictPopup.input;
                // ⚠️ 위 "기존 정보 덮어쓰기"와 똑같이 차량번호만으로 upsertDriver를 부르면
                // upsertDriver가 "같은 차량번호 = 같은 문서"로 보고 기존 기사(예: 이봉우)
                // 문서를 그대로 덮어써버려, "별도 등록"을 눌러도 실제로는 업데이트가
                // 되어버리는 버그가 있었다 — 새 기사님이 목록에 추가로 뜨지 않고, 방금 입력한
                // 이름도 사라지는 것처럼 보였던 원인. id를 직접 새로 발급해서 넘기면
                // upsertDriver가 차량번호로 기존 문서를 찾지 않고 진짜 별도 문서를 만든다.
                // ⭐ 2026-11-05 별도 문서 이름 = 회사__차량번호__x… (src/DriverEditChoice.jsx extraDriverDocId)
                await saveDriverChoice("add", { plate, name, phone, upsertDriver, company: userCompany });
                setForm(p=>({...p, 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태:"배차완료"}));
                setSmartDriverQuery(""); setSmartDriverMatched([]);
                setDriverConflictPopup(null);
              }}
            >
              신규 기사로 별도 등록
            </button>
          </>
        )}

        {/* ===== 기존 기사님이 없는 경우(완전 신규): 2버튼 ===== */}
        {!driverConflictPopup.existing && (
          <div className="grid grid-cols-2 gap-3">
            <button
              className="py-2.5 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition"
              onClick={() => {
                setDriverConflictPopup(null);
              }}
            >
              취소
            </button>
            <button
              className="py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition"
              onClick={async () => {
                const { plate, name, phone } = driverConflictPopup.input;
                await upsertDriver({ 차량번호: plate, 이름: name, 전화번호: phone });
                setForm(p=>({...p, 차량번호: plate, 이름: name, 전화번호: formatPhone(phone), 배차상태:"배차완료"}));
                setSmartDriverQuery(""); setSmartDriverMatched([]);
                setDriverConflictPopup(null);
               showAlert("✓ 신규 기사님이 등록되었습니다.");
              }}
            >
              신규 기사 등록
            </button>
          </div>
        )}

      </div>
    </div>
  </div>
)}

{/* ================= 신규 기사 등록 모달 ================= */}
{driverModal.open && (
  // ⭐ z-index를 다중등록 팝업(z-[999999])보다 높게 — 다중등록 안에서 차량번호
  // 입력으로 이 모달이 열릴 때도 뒤에 가려지지 않고 항상 위에 떠야 한다.
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999] p-4">
    <div className="bg-white rounded-2xl w-[420px] max-w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-white font-bold text-[16px]">신규 기사 등록</div>
          <div className="text-white/60 text-[12px] mt-0.5">차량번호 [{driverModal.carNo}]를 신규 등록합니다</div>
        </div>
        <button onClick={() => setDriverModal({ open: false })} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg transition">×</button>
      </div>

      <div className="p-6">
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">차량번호</label>
            <input autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 text-gray-700"
              value={driverModal.carNo}
              readOnly
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">기사명 <span className="text-red-400">*</span></label>
            <input autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
              placeholder="예: 홍길동"
              value={driverModal.name}
              onChange={(e) =>
                setDriverModal((p) => ({ ...p, name: e.target.value }))
              }
              ref={nameInputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("driver-save-btn")?.click();
                }
              }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">전화번호 <span className="text-red-400">*</span></label>
            <input autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
              placeholder="숫자(하이픈) 입력"
              inputMode="numeric"
              value={driverModal.phone}
              onChange={(e) =>
  setDriverModal((p) => ({
    ...p,
    phone: formatPhone(e.target.value),
  }))
}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("driver-save-btn")?.click();
                }
              }}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            id="driver-save-btn"
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
            onClick={async () => {
             if (!driverModal.name.trim()) return showAlert("기사명을 입력하세요.");
             if (!driverModal.phone.replace(/[^\d]/g, "").trim()) return showAlert("전화번호를 입력하세요.");

              const rawPhone = driverModal.phone.replace(/[^\d]/g, "");
             if (!rawPhone || rawPhone.length < 10) return showAlert("전화번호를 정확히 입력하세요.");

              await upsertDriver({
                _id: driverModal.carNo,
                차량번호: driverModal.carNo,
                이름: driverModal.name,
                전화번호: formatPhone(rawPhone), // 🛠 2026-11-27 다른 기사와 같은 010-0000-0000 형식으로 저장(예전엔 숫자만 저장돼 01000009101 로 보였다)
              });
              sflowToast(`기사를 등록했어요 · ${driverModal.name}`, "success");

              // ⭐ 다중등록 모달에서 열린 경우엔 form이 아니라 해당 슬롯에 반영해야
              // 해서, 호출자가 onConfirm 콜백을 넘겨줬으면 그걸 대신 사용한다 —
              // 넘기지 않은 기존 호출(단일 배차등록 폼)은 그대로 form에 반영.
              if (driverModal.onConfirm) {
                driverModal.onConfirm({
                  차량번호: driverModal.carNo,
                  이름: driverModal.name,
                  전화번호: formatPhone(rawPhone),
                });
              } else {
                setForm((p) => ({
                  ...p,
                  차량번호: driverModal.carNo,
                  이름: driverModal.name,
                  전화번호: formatPhone(rawPhone),
                  배차상태: "배차완료",
                }));
              }

              setDriverModal({ open: false });
            }}
          >
            저장
          </button>
          <button
            className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 text-[13px] font-bold hover:bg-gray-50 transition"
            onClick={() => setDriverModal({ open: false })}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  </div>
)}
{/* ================= 실시간배차 상태 변경 확인 팝업 ================= */}
{confirmChange && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden">
      <div className="bg-[#1B2B4B] px-5 py-4">
        <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.상태 변경" defaultText="상태 변경" /></h3>
      </div>
      <div className="p-5">
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 border border-gray-100">
          <div className="text-[12px] font-semibold text-gray-500 mb-1">{confirmChange.key}</div>
          <div className="text-[13px] text-gray-800">
            <span className="text-gray-500">{confirmChange.before || "미설정"}</span>
            <span className="mx-2 text-gray-400">→</span>
            <span className="font-bold text-[#1B2B4B]">{confirmChange.after || "미설정"}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            onClick={() => setConfirmChange(null)}
          >
            취소
          </button>
          <button
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243d6a] transition"
            onClick={async () => {
              const patch = { [confirmChange.key]: confirmChange.after, ...(confirmChange.extra || {}) }; // 💳 extra = 배차방식과 함께 바뀌는 IN/OUT
              // ⭐ 이미 화면에 있는 행 데이터를 알고 있으니(rows.find), patchDispatch가
              // 다시 캐시/서버 조회를 하지 않도록 knownPrev로 바로 넘긴다 — 이 팝업의
              // "변경" 버튼을 눌렀을 때 느껴지던 지연의 유력한 원인이었다.
              const row = (dispatchData || []).find(r => r._id === confirmChange.rowId);
if (confirmChange.key === "지급방식") {
  Object.assign(patch, payTypeStatusPatch(row || {}, confirmChange.after)); // 🚚 2026-11-07 공용 규칙(모바일과 같음)
}
patchDispatch(confirmChange.rowId, patch, row).catch(console.error);
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

{/* ================= 배차요청 확인 팝업 ================= */}
{confirmOpen && (
  <div
    className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("confirm-save-btn")?.click();
      }
    }}
    tabIndex={0}
    ref={(el) => { if (el && !el.dataset.autoFocused) { el.dataset.autoFocused = "1"; setTimeout(() => el.focus(), 0); } }}
  >
    <div className="bg-white rounded-xl shadow-xl w-[1400px] max-w-[95vw] h-[85vh] flex overflow-hidden border">

     {/* ================= 지도 영역 =================
          ★ min-h+max-h(내용 기준 자동 높이)로는 내용이 짧은 주문에서 지도 아래
          여백이, 내용이 길면 스크롤이 생기는 문제를 양쪽 다 못 잡았다. 오더마다
          패널 내용 분량이 달라 "모달 높이를 내용에 맞춘다"는 전제 자체가
          여백/스크롤 둘 중 하나를 항상 남긴다. 그래서 모달을 h-[85vh]로 완전히
          고정해 지도(h-full 의존, 자체 컨텐츠 없음)가 첫 렌더부터 확정된 높이를
          갖고 초기화되게 하고, 내용이 더 긴 주문은 오른쪽 패널 안쪽의
          flex-1 overflow-y-auto 스크롤 영역이 흡수한다(패널은 자체적으로
          이미 스크롤 가능한 구조라 모달 전체를 키울 필요가 없다). */}
<div className="flex-1 h-full bg-gray-200 relative" style={{ minWidth: '500px', minHeight: '600px' }}>

  <div
    id="route-map"
    className="w-full h-full"
    style={{
      width: '100%',
      height: '100%',
      position: 'absolute', 
      top: 0, 
      left: 0,
      backgroundColor: '#eeeeee' 
    }}
  />

  {/* ⭐ 교통상황 범례(티맵 색 기준) */}
  <div className="absolute top-4 left-4 bg-white/95 rounded-lg shadow px-3 py-1.5 text-[12px] font-bold text-gray-600 flex items-center gap-3" style={{ zIndex: 1001 }}>
    {TRAFFIC_LEGEND.map(t => (
      <span key={t.c} className="flex items-center gap-1"><span className="inline-block w-4 h-1.5 rounded" style={{ background: t.color }} />{t.label}</span>
    ))}
  </div>

  {/* 지도 위 경로 정보 */}
  <div 
    className="absolute bottom-6 left-6 bg-white/95 backdrop-blur px-5 py-4 rounded-xl shadow-2xl text-sm space-y-2 border border-gray-200"
    style={{ zIndex: 1001 }}
  >
    {/* 총 거리 */}
    <div className="flex justify-between items-center gap-6">
      <span className="text-gray-500 font-medium">총 거리</span>
      <b className="text-gray-900 text-base">
        {routeInfo 
          ? `${routeInfo.distanceKm.toFixed(1)} km`
          : "계산 중..."}
      </b>
    </div>

   {/* 예상 시간 */}
<div className="flex justify-between items-center gap-6">
  <span className="text-gray-500 font-medium">예상 시간</span>
  <b className="text-gray-900 text-base">
  {routeInfo
    ? (routeInfo.durationText || `${routeInfo.durationMin}분`)
    : "계산 중..."}
</b>
</div>

    {/* ================= 🔥 예상 운임 ================= */}
    <div className="pt-2 border-t border-gray-100 flex justify-between items-center gap-6 text-blue-600">
      <span className="font-bold">예상 운임</span>

      <b className="text-lg">
        {fareStats?.fare
          ? `${fareStats.fare.toLocaleString()}원~`
          : distanceFareEstimate?.avg
          ? `${distanceFareEstimate.avg.toLocaleString()}원~`
          : "데이터 없음"}
      </b>
    </div>

    {/* ================= 🔥 과거 이력 기반 데이터가 없을 때 — 티맵 거리+톤수/화물
         기준 추정치를 다이얼로 보여준다 ================= */}
    {!fareStats && distanceFareEstimate && (
      <div className="pt-1 pb-1">
        <FareGauge min={distanceFareEstimate.min} avg={distanceFareEstimate.avg} max={distanceFareEstimate.max} />
        <div className="text-[11px] text-gray-500 text-center -mt-1">
          티맵 {distanceFareEstimate.distance}km · {distanceFareEstimate.min.toLocaleString()}~{distanceFareEstimate.max.toLocaleString()}원 추정{distanceFareEstimate.surchargeLabel ? ` · ${distanceFareEstimate.surchargeLabel} 할증 +${Math.round(distanceFareEstimate.surchargeRate * 100)}% 포함` : ""}
        </div>
      </div>
    )}

    {/* ================= 🔥 추천 근거 ================= */}
    {fareStats && (
      <div className="text-[12px] text-gray-500 space-y-1 pt-1">

        <div className="flex justify-between">
          <span>최근 5건 평균</span>
          <b className="text-gray-800">
            {fareStats.avg.toLocaleString()}원
          </b>
        </div>

        <div className="flex justify-between">
          <span>최신 운임</span>
          <b className="text-gray-800">
            {fareStats.latest.toLocaleString()}원
          </b>
        </div>

        <div className="flex justify-between">
          <span>표본</span>
          <b className="text-gray-800">
            {fareStats.count}건
          </b>
        </div>

        {/* 변동 감지 */}
        {Math.abs(fareStats.latest - fareStats.avg) > 20000 && (
          <div className="text-red-500 text-[11px]">
                ⚠ 최근 운임 변동 있음
          </div>
        )}

      </div>
    )}
      </div>
    </div>


{/* ⭐ 지도 영역 닫기 */}

      {/* ================= 오른쪽 정보 패널 — 배차요청장(2026-10-28 디지털 리디자인: 글씨 크게·네이비) ================= */}
<div className="w-[480px] border-l border-[#E3E8F0] flex flex-col bg-[#F4F6FA]">

  {/* 패널 헤더 */}
  <div className="relative overflow-hidden px-6 py-5 shrink-0 text-white"
    style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DISPATCH REQUEST</div>
        <div className="text-[21px] font-black tracking-tight mt-1">배차요청장</div>
        <div className="text-[14px] text-blue-100/80 mt-1 font-semibold truncate">
          <span style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{form.상차일 || "-"}</span> · {form.거래처명 || "-"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-2 py-1.5 ring-1 ring-white/20">
          <span className="text-blue-100/75 text-[12px] font-bold mr-1">수량</span>
          <button type="button" className="w-7 h-7 rounded-lg bg-white/15 text-white text-[16px] font-bold flex items-center justify-center hover:bg-white/25"
            onClick={() => setMultiCount(v => Math.max(1, v - 1))}>-</button>
          <span className="text-white font-black text-[17px] min-w-[24px] text-center" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{multiCount}</span>
          <button type="button" className="w-7 h-7 rounded-lg bg-white/15 text-white text-[16px] font-bold flex items-center justify-center hover:bg-white/25"
            onClick={() => setMultiCount(v => Math.min(10, v + 1))}>+</button>
        </div>
        <div className="flex gap-1.5">
          {form.긴급 && <span className="px-2.5 py-0.5 bg-white text-[#1B2B4B] text-[12px] font-black rounded-md">긴급</span>}
          {form.운행유형 === "왕복" && <span className="px-2.5 py-0.5 bg-white/15 text-white text-[12px] font-bold rounded-md ring-1 ring-white/25">왕복</span>}
          {form.혼적 && <span className="px-2.5 py-0.5 bg-white/15 text-white text-[12px] font-bold rounded-md ring-1 ring-white/25">혼적</span>}
        </div>
      </div>
    </div>
  </div>

  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

    {/* 결제 금액 + 전달상태 */}
    <div className="bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-gray-600">결제예정금액 <span className="text-gray-400 font-semibold">(VAT 별도)</span></span>
        <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#94A3B8]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>FARE</span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="text-[34px] font-black text-[#0F1A30] leading-none tracking-tight" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>
          <CountUp value={Number(form.청구운임 || 0)} />
        </span>
        <span className="text-[15px] font-bold text-gray-500">원~</span>
      </div>
      {(form.기사운임 || form.지급방식) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {form.기사운임 && (
            <div className="rounded-xl bg-[#F4F7FC] border border-[#E3E8F0] px-3 py-2">
              <div className="text-[12px] font-bold text-gray-500">기사운임</div>
              <div className="text-[15px] font-black text-[#1B2B4B]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{Number(form.기사운임).toLocaleString()}원</div>
            </div>
          )}
          {form.지급방식 && (
            <div className="rounded-xl bg-[#F4F7FC] border border-[#E3E8F0] px-3 py-2">
              <div className="text-[12px] font-bold text-gray-500">지급방식</div>
              <div className="text-[15px] font-black text-[#1B2B4B]">{form.지급방식}</div>
            </div>
          )}
          {/* ⭐ 2026-11-02 운임규칙 — 등록 확인에 운임구분 */}
          {fareOn && form.운임구분 && (
            <div className="rounded-xl bg-[#EAF0FB] border border-[#C9D5EA] px-3 py-2 col-span-2">
              <div className="text-[12px] font-bold text-gray-500">운임구분</div>
              <div className="text-[15px] font-black text-[#1B2B4B]">{form.운임구분} <span className={`text-[12.5px] font-bold ${profitCls(orderProfit(form), "text-[#2D4C82]")}`}>수수료 {orderProfit(form).toLocaleString()}원</span></div>
            </div>
          )}
        </div>
      )}
      {/* 전달상태 — 기본 OFF(미전달). 켜서 등록하면 전달완료로 등록(업체전달상태 필드) */}
      <div className="mt-3 pt-3 border-t border-[#EEF1F6] flex items-center justify-between">
        <div>
          <div className="text-[14.5px] font-bold text-gray-800">전달상태</div>
          <div className="text-[12.5px] text-gray-500 mt-0.5">{form.업체전달상태 === "전달완료" ? "전달완료 상태로 등록됩니다" : "미전달 상태로 등록됩니다"}</div>
        </div>
        <button
          type="button"
          onClick={() => setForm(p => ({ ...p, 업체전달상태: p.업체전달상태 === "전달완료" ? "미전달" : "전달완료" }))}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${form.업체전달상태 === "전달완료" ? "bg-[#1B2B4B]" : "bg-gray-200"}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${form.업체전달상태 === "전달완료" ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
    </div>

    {/* 화물 정보 */}
    <div className="bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-5 py-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[14px] font-bold text-gray-600">화물 정보</span>
        <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#94A3B8]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>CARGO</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "화물", value: mergeViaCargoText(form.화물내용, [form.경유상차목록, form.경유하차목록]) },
          { label: "차량", value: form.차량종류 },
          { label: "톤수", value: mergeViaTonnage(form.차량톤수, [form.경유상차목록, form.경유하차목록]) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl py-2.5 px-1.5 bg-[#F4F7FC] border border-[#E3E8F0]">
            <div className="text-[12.5px] font-bold text-gray-500 mb-0.5">{label}</div>
            <div className="text-[16px] font-black text-[#0F1A30] break-keep">{value || "-"}</div>
          </div>
        ))}
      </div>
      {(form.상차방법 || form.하차방법) && (
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[14px]">
          <div className="flex justify-between rounded-lg px-3 py-1.5 bg-white border border-[#EEF1F6]"><span className="text-gray-500 font-semibold">상차</span><b className="text-[#1B2B4B]">{form.상차방법 || "-"}</b></div>
          <div className="flex justify-between rounded-lg px-3 py-1.5 bg-white border border-[#EEF1F6]"><span className="text-gray-500 font-semibold">하차</span><b className="text-[#1B2B4B]">{form.하차방법 || "-"}</b></div>
        </div>
      )}
    </div>

    {/* 운송 경로 — 상차 → (경유) → 하차 타임라인 */}
    <div className="bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[14px] font-bold text-gray-600">운송 경로</span>
        <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#94A3B8]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>ROUTE</span>
      </div>
      {[
        { key: "pickup", tag: "상", label: "상차지", name: form.상차지명, addr: form.상차지주소, mgr: form.상차지담당자, tel: form.상차지담당자번호, time: form.상차시간, basis: form.상차시간기준, via: form.경유상차목록, viaLabel: "경유상차지", dateKey: "상차일", filled: true },
        { key: "drop", tag: "하", label: "하차지", name: form.하차지명, addr: form.하차지주소, mgr: form.하차지담당자, tel: form.하차지담당자번호, time: form.하차시간, basis: form.하차시간기준, via: form.경유하차목록, viaLabel: "경유하차지", dateKey: "하차일", filled: false },
      ].map((P, pi) => {
        const vias = (P.via || []).filter(s => s.업체명?.trim());
        return (
          <div key={P.key} className="relative pl-11 pb-1">
            {pi === 0 && <span className="absolute left-[15px] top-8 bottom-[-6px] w-[2px] bg-gradient-to-b from-[#1B2B4B] to-[#94A3B8]" />}
            <span className={`absolute left-0 top-0 w-8 h-8 rounded-xl flex items-center justify-center text-[14px] font-black ${P.filled ? "bg-[#1B2B4B] text-white shadow-[0_4px_10px_rgba(27,43,75,0.3)]" : "bg-white text-[#1B2B4B] border-2 border-[#1B2B4B]"}`}>{P.tag}</span>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-extrabold text-gray-500">{P.label}</span>
                {P.time && <span className="px-2 py-0.5 rounded-md bg-[#EEF3FB] text-[#1B2B4B] text-[12.5px] font-bold">{P.time}{P.basis ? ` ${P.basis}` : ""}</span>}
              </div>
              {vias.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setStopType(P.key); const arr = (P.via || []).map(s => cleanStopCargo({ ...s, [P.dateKey]: s[P.dateKey] || form[P.dateKey] || "" })); setStopList(arr.length ? arr : [{ 업체명:"", 주소:"", 담당자:"담당자", 담당자번호:"", 메모:"", 화물내용:"", 화물타입:"", 톤수값:"", 톤수타입:"", 차량톤수:"", 상차일:"", 상차시간:"", 하차일:"", 하차시간:"", 방법:"" }]); setStopPopupOpen(true); }}
                  className="px-2.5 py-0.5 text-[12px] font-bold rounded-full bg-[#1B2B4B] text-white hover:bg-[#243a60] transition shrink-0"
                >
                  경유+{vias.length}
                </button>
              )}
            </div>
            <div className="mt-1 text-[17px] font-black text-[#0F1A30] leading-snug">{P.name || "-"}</div>
            <div className="text-[14px] text-gray-600 mt-0.5 leading-snug">{P.addr || "-"}</div>
            {(P.mgr || P.tel) && (
              <div className="text-[14px] text-gray-700 mt-1 font-semibold">
                {P.mgr || ""}{P.tel ? <span style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{P.mgr ? " · " : ""}{P.tel}</span> : null}
              </div>
            )}
            {vias.map((s, i) => (
              <div key={i} className="mt-2.5 ml-1 pl-3 border-l-2 border-dashed border-[#C9D3E4]">
                <div className="text-[12px] font-extrabold text-gray-500">{P.viaLabel} {i + 1}</div>
                <div className="text-[15px] font-bold text-gray-900">{s.업체명}</div>
                {s.주소 && <div className="text-[13px] text-gray-600">{s.주소}</div>}
                {s.담당자 && <div className="text-[13px] text-gray-700">{s.담당자}{s.담당자번호 ? ` · ${s.담당자번호}` : ""}</div>}
                {s.메모 && <div className="text-[13px] text-[#1B2B4B] bg-[#EEF3FB] rounded-md px-2 py-0.5 mt-1">{s.메모}</div>}
              </div>
            ))}
            {pi === 0 && <div className="h-4" />}
          </div>
        );
      })}
    </div>

    {/* 경로 정보 */}
    {routeInfo && (routeInfo.distanceKm > 0 || routeInfo.durationMin > 0) && (
      <div className="rounded-2xl px-5 py-4 text-white" style={{ background: "linear-gradient(135deg,#0F1A30 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[14px] font-bold text-blue-100/85">경로 정보</span>
          <span className="text-[10.5px] font-extrabold tracking-[0.18em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DISTANCE</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["총 거리", routeInfo.distanceKm.toFixed(1), "km"],
            ["예상 시간", routeInfo.durationMin, "분"],
            ...((fareStats?.fare > 0 || distanceFareEstimate?.avg > 0) ? [["예상 운임", (fareStats?.fare || distanceFareEstimate?.avg).toLocaleString(), "원~"]] : []),
          ].map(([k, v, u]) => (
            <div key={k} className="rounded-xl bg-white/[0.07] ring-1 ring-white/15 px-2 py-2 text-center">
              <div className="text-[12px] font-bold text-blue-100/70">{k}</div>
              <div className="text-[17px] font-black mt-0.5" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{v}<span className="text-[11.5px] font-bold text-blue-100/70 ml-0.5">{u}</span></div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* 메모 / 전달사항 */}
    {(form.메모?.trim() || form.전달사항?.trim()) && (
      <div className="bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-5 py-4 space-y-3">
        {form.메모?.trim() && (
          <div>
            <div className="text-[13.5px] text-gray-600 font-bold mb-1.5">메모</div>
            <div className="text-[14.5px] text-gray-800 leading-relaxed bg-[#F4F7FC] border border-[#E3E8F0] rounded-xl px-3.5 py-2.5 whitespace-pre-wrap">{form.메모}</div>
          </div>
        )}
        {form.전달사항?.trim() && (
          <div>
            <div className="text-[13.5px] text-gray-600 font-bold mb-1.5">기사 전달사항</div>
            <div className="text-[14.5px] text-gray-800 leading-relaxed bg-[#F4F7FC] border border-[#E3E8F0] rounded-xl px-3.5 py-2.5 whitespace-pre-wrap">{form.전달사항}</div>
          </div>
        )}
      </div>
    )}

    {/* 허브 등록 — 저장과 동시에 로지스웹 허브(운송사 간 오더 거래소)에도 공유 · ⭐ 2026-11-06 이름은 src/orderMarketConfig.js */}
    <button type="button"
      disabled={isSaving}
      className="w-full h-11 rounded-xl border-2 border-[#1B2B4B] bg-white text-[#1B2B4B] hover:bg-[#F4F7FC] font-black text-[14.5px] transition disabled:opacity-50"
      onClick={() => doSave(true)}>
      {isSaving ? "저장 중..." : `저장 + ${MARKET_SHORT} 등록`}
    </button>

  </div>

  {/* 날짜 개별 설정 (수량 2개 이상일 때) */}
  {multiCount > 1 && (
    <div className="px-5 py-3 border-t border-[#E3E8F0] bg-white shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[14px] font-black text-[#1B2B4B]">날짜 개별 설정</span>
          <span className="text-[12px] text-gray-500 ml-1.5">{multiCount}건 상차일/하차일 개별 지정</span>
        </div>
        <button
          type="button"
          onClick={() => setUseSeparateDates(v => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useSeparateDates ? "bg-[#1B2B4B]" : "bg-gray-200"}`}
        >
          <span className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${useSeparateDates ? "translate-x-5" : "translate-x-1"}`} style={{ width: 18, height: 18 }} />
        </button>
      </div>
      {useSeparateDates && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 shrink-0" />
            <span className="flex-1 text-[12px] font-bold text-gray-500 text-center">상차일</span>
            <span className="flex-1 text-[12px] font-bold text-gray-500 text-center">하차일</span>
          </div>
          {Array.from({ length: multiCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-gray-500 w-9 shrink-0 text-right">{i + 1}번</span>
              <CustomDatePicker
                value={orderDates[i] || form.상차일 || ""}
                onChange={e => {
                  const next = [...orderDates];
                  next[i] = e.target.value;
                  setOrderDates(next);
                  // 하차일이 상차일과 같으면 같이 업데이트
                  if (!orderDropDates[i] || orderDropDates[i] === (orderDates[i] || form.상차일 || "")) {
                    const nd = [...orderDropDates];
                    nd[i] = e.target.value;
                    setOrderDropDates(nd);
                  }
                }}
                className="flex-1 px-2 py-1.5 text-[13.5px] font-semibold border border-gray-200 rounded-lg focus:border-[#1B2B4B] outline-none bg-white"
              />
              <CustomDatePicker
                value={orderDropDates[i] || orderDates[i] || form.상차일 || ""}
                onChange={e => {
                  const nd = [...orderDropDates];
                  nd[i] = e.target.value;
                  setOrderDropDates(nd);
                }}
                className="flex-1 px-2 py-1.5 text-[13.5px] font-semibold border border-gray-200 rounded-lg focus:border-[#1B2B4B] outline-none bg-white"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setOrderDates(Array.from({ length: multiCount }, () => form.상차일 || ""));
              setOrderDropDates(Array.from({ length: multiCount }, () => form.상차일 || ""));
            }}
            className="w-full mt-0.5 py-1 text-[12px] font-semibold text-gray-500 hover:text-gray-700 transition text-center"
          >
            전체 날짜 초기화
          </button>
        </div>
      )}
    </div>
  )}

  {/* 하단 고정 버튼 */}
  <div className="px-4 py-4 border-t border-[#E3E8F0] bg-white flex gap-3 shrink-0">
    <button
      className="flex-1 h-12 rounded-xl bg-white hover:bg-gray-50 text-gray-700 font-bold text-[15px] transition border border-[#DCE3EF]"
      onClick={() => setConfirmOpen(false)}>
      취소
    </button>
    <button
      id="confirm-save-btn"
      disabled={isSaving}
      className={`flex-[1.4] h-12 rounded-xl text-white font-black text-[15.5px] transition shadow-[0_8px_18px_rgba(27,43,75,0.28)]
        ${isSaving ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-[#1B2B4B] to-[#2D4C82] hover:brightness-110"}`}
      onClick={() => doSave(false)}>
      {isSaving ? "저장 중..." : multiCount > 1 ? `${multiCount}건 등록하기` : "배차등록하기"}
    </button>
  </div>
</div>

    </div>
  </div>
)}
{/* ================= 거래처/하차지 중복 확인 팝업 ================= */}
{dupPopup.open && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl border">

      <h3 className="text-base font-bold mb-3">
        비슷한 거래처가 있습니다
      </h3>

      <p className="text-sm text-gray-700 mb-4">
        신규로 등록하시겠습니까?
      </p>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 mb-4">
        {/* 예 → 신규 등록 */}
        <button
          className="px-4 py-2 bg-[#1B2B4B] text-white rounded"
          onClick={() => {
  const { name } = dupPopup.input;

  setDupPopup({ open: false, input: null, candidates: [] });

  // 🔥 여기서 신규 입력 팝업을 연다
  setTimeout(() => {
    openNewPlacePrompt(name);
  }, 0);
}}

        >
          예
        </button>

        {/* 아니오 */}
        <button
  className="px-4 py-2 bg-gray-200 rounded"
  onClick={() => {
    // 🔥 신규 등록 거부 → 팝업만 닫기
    setDupPopup({ open: false, input: null, candidates: [] });
  }}
>
  아니오
</button>

      </div>

      {/* 기존 업체 선택 */}
      <div className="border-t pt-3 space-y-2">
        {dupPopup.candidates.map((p, i) => (
          <div
            key={i}
            className="p-2 border rounded cursor-pointer hover:bg-gray-50"
            onClick={() => {
  applyClientSelect(p.업체명); // ▲ 이게 정답
  setDupPopup({ open: false, input: null, candidates: [] });
}}

          >
            <div className="font-medium">{p.업체명}</div>
            {p.주소 && (
              <div className="text-xs text-gray-500">{p.주소}</div>
            )}
          </div>
        ))}
      </div>

    </div>
  </div>
)}

{/* ================= 거래처 신규등록 팝업 ================= */}
<NewClientModal open={newClientModalOpen} data={newClientModalData} setData={setNewClientModalData} onClose={() => setNewClientModalOpen(false)} upsertClient={upsertClient} showAlert={showAlert} formatPhone={formatPhone} />

{/* ================= Status Popup ================= */}
{statusPopup && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl p-6 w-[420px] shadow-xl border border-gray-200">
      <h3 className="text-base font-bold mb-4">
        {statusPopup.title}
      </h3>

      <div className="space-y-2 text-sm max-h-[300px] overflow-y-auto pr-1">
        {statusPopup.list.length > 0 ? (
          statusPopup.list.map((r, i) => (
            <div
              key={i}
              className="flex justify-between border-b pb-1"
            >
              <span className="text-[12px]">
                {r.상차지명 || "-"} → {r.하차지명 || "-"}
              </span>
              <span className="font-semibold">{r.배차상태 || "-"}</span>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 text-[12px] py-3">
            데이터 없음
          </div>
        )}
      </div>

      <button
        className="w-full bg-[#1B2B4B] hover:bg-[#0F1A30] text-white py-2 rounded-md text-sm mt-5"
        onClick={() => setStatusPopup(null)}
      >
        닫기
      </button>
    </div>
    
  </div>

)}
{/* ================= Top 3 Popup ================= */}
{popupType && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
    <div className="bg-white rounded-xl p-6 w-[360px] shadow-xl border border-gray-200">
      <h3 className="text-base font-bold mb-4">
        {popupType === "driver" && "활동 많은 기사 Top 3"}
        {popupType === "client" && "최다 상차지 Top 3"}
        {popupType === "place" && "최다 하차지 Top 3"}
      </h3>

      <div className="space-y-2 text-sm">
        {popupType === "driver" &&
          [...todayRows].slice(0, 3).map((r, i) => (
            <div key={i} className="flex justify-between">
              <span>{r.이름 || "-"}</span>
              <span className="font-semibold">{r.배차상태}</span>
            </div>
          ))}
        {popupType === "client" &&
          topClients.map(([name, count], i) => (
            <div key={i} className="flex justify-between">
              <span>{name}</span>
              <span className="font-semibold">{count}건</span>
            </div>
          ))}
        {popupType === "place" &&
          topDrops.map(([name, count], i) => (
            <div key={i} className="flex justify-between">
              <span>{name}</span>
              <span className="font-semibold">{count}건</span>
            </div>
          ))}
      </div>

      <button
        className="w-full bg-[#1B2B4B] hover:bg-[#0F1A30] text-white py-2 rounded-md text-sm mt-5"
        onClick={() => setPopupType(null)}
      >
        닫기
      </button>
    </div>
  </div>
)}
{/* ===================== 과거 운송 이력 (운임 가이드 클릭) ===================== */}
{fareHistoryOpen && (
  <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-2xl w-[680px] max-h-[82vh] overflow-hidden shadow-2xl flex flex-col">
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="text-white font-bold text-[15px]">과거 운송 이력</div>
          <div className="text-white/50 text-[11px] mt-0.5">현재 조건(구역·차량)과 유사한 이력만 표시 · 관련 건수 {guideHistoryList.length}건</div>
        </div>
        <button onClick={() => setFareHistoryOpen(false)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg">×</button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-2">
        {guideHistoryList.length > 0 ? (
          [...guideHistoryList]
            .map(r => ({
              ...r,
              __score: calcHistoryScore(r, form),
              __sameTon: getTotalTonFromOrder(r) === getTotalTonFromOrder(form),
              __sameCargo: r.화물내용 && form.화물내용 && r.화물내용 === form.화물내용,
            }))
            .sort((a, b) => b.__score - a.__score)
            .map((r, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden hover:border-[#1B2B4B]/30 transition">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-100">
                  <span className="text-[12px] font-semibold text-gray-500">{r.상차일 || r.등록일}</span>
                  <div className="flex gap-1">
                    {r.__sameTon && r.__sameCargo && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-[#1B2B4B] text-white font-bold">최적매칭</span>
                    )}
                    {r.__sameTon && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 border border-blue-200">톤수동일</span>
                    )}
                    {r.__sameCargo && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">화물동일</span>
                    )}
                    <SpecialFareTag row={r} size="sm" />
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[14px] font-bold text-gray-900 mb-1.5">{r.상차지명} → {r.하차지명}</div>
                  {(() => {
                    const _xv = (arr) => Array.isArray(arr) ? arr.map(v => typeof v==="string"?v:(v?.업체명||v?.주소||"")).filter(Boolean) : [];
                    const names = [...new Set([..._xv(r.경유지_상차),..._xv(r.경유상차목록),..._xv(r.경유지상차),..._xv(r.경유지_하차),..._xv(r.경유하차목록),..._xv(r.경유지하차)])];
                    if (!names.length) return null;
                    return <div className="text-[11px] text-gray-500 mt-0.5">경유: {names.join(" → ")}</div>;
                  })()}
                  <div className="flex gap-3 text-[12px] text-gray-500">
                    <span>{r.차량종류}{r.차량톤수 ? ` / ${r.차량톤수}` : ""}</span>
                    {r.화물내용 && <span className="text-gray-500">· {r.화물내용}</span>}
                  </div>
                  <SpecialFareLine row={r} className="mt-2" />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] text-gray-600">기사 {r.이름 || "-"}</span>
                    <span className="text-[15px] font-bold text-[#1B2B4B]">{Number(r.청구운임 || 0).toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            ))
        ) : (
          <div className="text-center text-gray-500 py-16 text-[13px]">조회된 이력이 없습니다.</div>
        )}
      </div>

      <div className="px-5 py-3 border-t shrink-0 text-right">
        <button onClick={() => setFareHistoryOpen(false)} className="px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"><EditableText id="misc.btn.18238.닫기" defaultText="닫기" /></button>
      </div>
    </div>
  </div>
)}

{/* ===== 운임 빠른 선택 팝업 ===== */}
{fareQuickOpen && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999]"
    onClick={() => setFareQuickOpen(false)}>
    <div className="bg-white rounded-2xl w-[540px] shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}>
      {/* 헤더 */}
      <div className="bg-[#1B2B4B] px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-white font-bold text-[15px] tracking-tight">동일 조건 운임 이력</div>
          <div className="text-white/50 text-[12px] mt-0.5">
            {form.상차지명} → {form.하차지명}
            {form.화물내용 && <span className="ml-2 text-white/35">· {form.화물내용}</span>}
          </div>
        </div>
        <button onClick={() => setFareQuickOpen(false)} className="text-white/40 hover:text-white text-xl px-1">×</button>
      </div>
      <div className="px-5 pt-3 pb-1">
        <div className="text-[11px] text-gray-500">클릭하면 청구운임에 바로 적용됩니다</div>
      </div>
      <div className="px-5 pb-3 space-y-2 max-h-[52vh] overflow-y-auto">
        {fareQuickMatches.map((r, i) => {
          const claim = Number(String(r.청구운임||"0").replace(/[^\d]/g,""));
          const driver = Number(String(r.기사운임||"0").replace(/[^\d]/g,""));
          const margin = claim - driver;
          const marginPct = claim > 0 ? Math.round((margin / claim) * 100) : 0;
          return (
            <button key={i}
              className="w-full text-left border border-gray-200 hover:border-[#1B2B4B] rounded-xl overflow-hidden transition group active:scale-[0.99]"
              onClick={() => { onChange("청구운임", String(claim)); setFareQuickOpen(false); }}>
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100 group-hover:bg-[#1B2B4B]/5">
                <span className="text-[12px] text-gray-500 font-medium">{r.상차일 || "-"}</span>
                <span className="text-[22px] font-black text-[#1B2B4B] leading-none">
                  {claim.toLocaleString()}<span className="text-[13px] font-semibold text-gray-500 ml-1">원</span>
                </span>
              </div>
              <div className="px-4 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {r.화물내용 && (
                    <span className="px-2 py-0.5 rounded bg-[#1B2B4B]/8 text-[#1B2B4B] text-[11px] font-bold border border-[#1B2B4B]/15">
                      {r.화물내용}
                    </span>
                  )}
                  {r.차량종류 && <span className="text-[11px] text-gray-500">{r.차량종류}</span>}
                  {r.차량톤수 && <span className="text-[11px] text-gray-500">{r.차량톤수}</span>}
                  <SpecialFareTag row={r} size="sm" />
                  {(() => {
                    const _xv2 = (arr) => Array.isArray(arr) ? arr.map(v => typeof v==="string"?v:(v?.업체명||v?.주소||"")).filter(Boolean) : [];
                    const names = [...new Set([..._xv2(r.경유지_상차),..._xv2(r.경유상차목록),..._xv2(r.경유지상차),..._xv2(r.경유지_하차),..._xv2(r.경유하차목록),..._xv2(r.경유지하차)])];
                    if (!names.length) return null;
                    return (
                      <span className="text-[11px] text-gray-500">경유: {names.join(" → ")}</span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="text-gray-500">기사 {driver.toLocaleString()}원</span>
                  <span className={`font-bold ${profitCls(margin, "text-gray-500")}`}>{/* ⭐ 2026-11-17 마진 — 플러스 빨강 · 마이너스 파랑 */}
                    마진 {margin.toLocaleString()}원 ({marginPct}%)
                  </span>
                </div>
                <SpecialFareLine row={r} />
                {r.메모 && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 border border-amber-100 truncate">
                    메모: {r.메모}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-5 pb-5">
        <button
          className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
          onClick={() => { setFareQuickOpen(false); setFareModalOpen(true); }}>
          전체 이력 보기
        </button>
      </div>
    </div>
  </div>
)}
{/* ⭐ 다목적지 단가표 조회 팝업 — 하차지명/주소가 일치하는 하차지의 모든 톤수 단가를 한번에 보여준다 */}
{rateSheetLookupOpen && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999998]">
    <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.단가표 조회" defaultText="단가표 조회" /></h3>
          <p className="text-white/60 text-[12px] mt-0.5">
            {(form.하차지명 || "").trim() ? `"${form.하차지명}"와(과) 일치하는 등록된 단가표` : "하차지명을 입력하면 단가표 메뉴에 등록된 단가와 매칭해 보여줍니다"}
          </p>
        </div>
        <button onClick={() => setRateSheetLookupOpen(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="overflow-y-auto flex-1 p-5">
        {rateSheetMatches.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-[13px]">
            일치하는 단가표가 없습니다.<br/>
            <span className="text-[12px] text-gray-400">단가표 메뉴 → 다목적지 단가표에서 해당 하차지를 등록하면 여기서 바로 확인할 수 있습니다.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {rateSheetMatches.map(({ sheet, row, nameHit }, i) => {
              // 입력한 차량톤수(form.차량톤수)와 일치하는 컬럼을 찾아 그 칸만 깜빡이는 테두리로 강조
              const dropTon = normRateText(form.차량톤수);
              const matchedColId = dropTon
                ? (sheet.columns || []).find(c => {
                    const cl = normRateText(c.label);
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
                    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1B2B4B] text-white">이름 일치</span>
                    : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">주소 일치</span>}
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
        <button onClick={() => setRateSheetLookupOpen(false)} className="px-5 py-2 text-[13px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"><EditableText id="misc.btn.18400.닫기" defaultText="닫기" /></button>
      </div>
    </div>
  </div>
)}
{fareModalOpen && fareResult && (() => {
  const fareMin = fareResult.min;
  const fareMax = fareResult.max;
  const fareAvg = fareResult.avg;
  const fareRange = fareMax - fareMin || 1;

  const aiResult = getAiRecommendedFare({ historyList: fareResult.pastHistoryList, form });

  const calcScore = (r) => {
    let score = 0;
    const pRow = getTotalPalletFromOrder(r);
    const pCur = getTotalPalletFromOrder(form);
    const tRow = getTotalTonFromOrder(r);
    const tCur = getTotalTonFromOrder(form);
    if (pRow != null && pCur != null) {
      const d = Math.abs(pRow - pCur);
      if (d === 0) score += 100; else if (d === 1) score += 60; else if (d === 2) score += 30;
    }
    if (tRow != null && tCur != null) {
      const d = Math.abs(tRow - tCur);
      if (d === 0) score += 40; else if (d <= 0.5) score += 20;
    }
    return score;
  };

// ★ 화물 타입 감지
  const _detectType = (s = "") => {
    const t = s.trim().toLowerCase().replace(/\s+/g, "");
    if (/\d+(파레트|파렛트|파렛|파레|파|plt)/.test(t)) return "pallet";
    if (/\d+(박스|box)/.test(t)) return "box";
    return "text";
  };
  const _inputType = _detectType(form.화물내용 || "");
  const _inputPalletNum = getTotalPalletFromOrder(form);
  const _inputBoxNum = (() => {
    const m = (form.화물내용 || "").replace(/\s+/g,"").match(/(\d+)(박스|box)/i);
    return m ? Number(m[1]) : null;
  })();
  const _inputCargoStr = (form.화물내용 || "").trim();

  const _inputTon = getTotalTonFromOrder(form);

  // 각 이력에 화물/톤수 근접도 점수 부여 후 정렬
  // 우선순위: 1) 화물일치+톤수일치 → 최신순
  //           2) 화물일치+톤수다름 → 톤수근접순 → 최신순
  //           3) 화물다름+톤수일치 → 최신순
  //           4) 나머지 → 화물근접+톤수근접+최신순
  const _scoredAll = (fareResult.pastHistoryList || []).map(r => {
    const rPallet = getTotalPalletFromOrder(r);
    const rType = _detectType(r.화물내용);
    const rTon = getTotalTonFromOrder(r);
    const rDate = r.상차일 || r.등록일 || "";

    let cargoScore = 0; // 화물 일치도 (높을수록 좋음)
    let tonScore = 0;   // 톤수 일치도
    let tonDiff = 999;
    let cargoDiff = 999;

    // 화물 점수
    if (_inputType === "pallet" && _inputPalletNum != null && rType === "pallet" && rPallet != null) {
      cargoDiff = Math.abs(rPallet - _inputPalletNum);
      cargoScore = cargoDiff === 0 ? 100 : Math.max(0, 80 - cargoDiff * 15);
    } else if (_inputType === "box" && _inputBoxNum != null) {
      const rm = (r.화물내용||"").replace(/\s+/g,"").match(/(\d+)(박스|box)/i);
      const rb = rm ? Number(rm[1]) : null;
      if (rb != null) { cargoDiff = Math.abs(rb - _inputBoxNum); cargoScore = cargoDiff === 0 ? 100 : Math.max(0, 80 - cargoDiff * 10); }
    } else {
      // 텍스트 일치
      cargoScore = (r.화물내용||"").trim() === _inputCargoStr ? 100 : 0;
      cargoDiff = cargoScore === 100 ? 0 : 1;
    }

    // 톤수 점수
    if (_inputTon != null && rTon != null) {
      tonDiff = Math.abs(rTon - _inputTon);
      tonScore = tonDiff === 0 ? 100 : Math.max(0, 80 - tonDiff * 20);
    }

    // 최종 우선순위 그룹 (낮을수록 상위)
    let tier;
    const exactCargo = cargoDiff === 0;
    const exactTon = tonDiff === 0;
    if (exactCargo && exactTon) tier = 0;       // 화물+톤수 완전일치
    else if (exactCargo) tier = 1;              // 화물일치, 톤수다름
    else if (exactTon) tier = 2;                // 화물다름, 톤수일치
    else tier = 3;                              // 둘다 다름

    // 같은 tier 내 정렬 키: 톤수근접→화물근접→최신순
    const matchLabel = tier === 0 ? "완전일치" : tier === 1 ? "부분일치" : tier === 2 ? "톤수일치" : "경로일치";
    return { ...r, _cargoScore: cargoScore, _tonScore: tonScore, _cargoDiff: cargoDiff, _tonDiff: tonDiff, _tier: tier, _date: rDate, _palletCount: rType==="pallet"?rPallet:null, _groupSize: 1, _match: { label: matchLabel } };
  });

  // tier 기준으로 그룹화 후 각 그룹 내 최신 1건씩 대표 선출 후 정렬
  // (같은 화물+톤수 조합은 최신 1건만)
  // ⚠️ 화물내용+톤수만으로 묶으면 금액이 다른 이력이 사라지므로 청구운임도 그룹 키에 포함
  const _groupMap = new Map();
  _scoredAll.forEach(r => {
    const key = `${(r.화물내용||"").trim()}|${(r.차량톤수||"").trim()}|${Number(String(r.청구운임||"0").replace(/[^\d]/g,""))}`;
    if (!_groupMap.has(key)) _groupMap.set(key, []);
    _groupMap.get(key).push(r);
  });

  let sortedHistory = Array.from(_groupMap.values()).map(recs => {
    const best = [...recs].sort((a, b) => b._date.localeCompare(a._date))[0];
    return { ...best, _groupSize: recs.length };
  }).sort((a, b) => {
    if (a._tier !== b._tier) return a._tier - b._tier;
    // 같은 tier 내: 톤수근접 → 화물근접 → 최신순
    if (a._tonDiff !== b._tonDiff) return a._tonDiff - b._tonDiff;
    if (a._cargoDiff !== b._cargoDiff) return a._cargoDiff - b._cargoDiff;
    return b._date.localeCompare(a._date);
  });

  const recent3 = sortedHistory.slice(0, 3).map(r => Number(String(r.청구운임||"0").replace(/[^\d]/g,"")));
  let trend = null;
  if (recent3.length >= 2) {
    const diff = recent3[0] - recent3[recent3.length - 1];
    trend = diff > 5000 ? "up" : diff < -5000 ? "down" : "flat";
  }

  // ⭐ 대표운임(최빈값) 계산 — 지금과 완전히 같은 화물/톤수(tier 0) 조건 중에서
  // 가장 자주 청구된 금액을 찾아, "평소 이 가격으로 나갔다"를 판단할 기준으로 삼는다.
  // 반복 없이 한 번만 등장한(=_groupSize 1) 금액이 대표값과 크게(5% 이상) 다르면
  // 배차지연 등으로 인한 "이례적 청구"로 보고 목록에서 따로 표시한다.
  const tier0Rows = sortedHistory.filter(r => r._tier === 0);
  const tier0Total = tier0Rows.reduce((a, r) => a + (r._groupSize || 1), 0);
  const modeRow = tier0Rows.reduce((best, r) => (!best || (r._groupSize || 1) > (best._groupSize || 1)) ? r : best, null);
  const modeFare = modeRow ? Number(String(modeRow.청구운임 || "0").replace(/[^\d]/g, "")) : null;
  const modeCount = modeRow ? (modeRow._groupSize || 1) : 0;
  const modeSharePct = tier0Total > 0 ? Math.round((modeCount / tier0Total) * 100) : 0;
  const isOutlierRow = (r) => {
    if (r._tier !== 0 || !modeFare || (r._groupSize || 1) > 1) return false;
    const f = Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
    return f > 0 && Math.abs(f - modeFare) / modeFare >= 0.05;
  };

  sortedHistory = sortFareHistory(sortedHistory, fareSortMode);

  const getBarPct = (fare) => fareRange > 0 ? Math.min(100, Math.max(0, ((fare - fareMin) / fareRange) * 100)) : 50;

  const getFareTag = (fare) => {
    const pct = getBarPct(fare);
    if (pct <= 33) return { label: "저렴", cls: "border-gray-300 text-gray-500" };
    if (pct <= 66) return { label: "보통", cls: "border-gray-300 text-gray-500" };
    return { label: "높음", cls: "border-gray-300 text-gray-500" };
  };

  // ⭐ 상단 "조회 운임 범위" 전용 통계 — 지금 입력한 톤수를 기준으로 범위를 좁힌다.
  // 화물내용(파렛/박스 등)은 무시하고 톤수만 본다. 입력 톤수보다 무거운 이력은
  // 제외하고, 가벼운 이력은 그 톤수 차량 용량 "안"에 들어가므로 포함시킨다.
  // 톤수를 입력하지 않았으면 필터 없이 기존 전체 범위를 그대로 쓴다.
  const _rangeTonInput = getTotalTonFromOrder(form);
  const _rangeFares = (fareResult.pastHistoryList || [])
    .map(r => ({ fare: Number(String(r.청구운임 || "0").replace(/[^\d]/g, "")), ton: getTotalTonFromOrder(r) }))
    .filter(x => x.fare > 0)
    .filter(x => _rangeTonInput == null ? true : (x.ton != null && x.ton <= _rangeTonInput));
  const rangeCount = _rangeFares.length;
  const rangeMin = rangeCount ? Math.min(..._rangeFares.map(x => x.fare)) : null;
  const rangeMax = rangeCount ? Math.max(..._rangeFares.map(x => x.fare)) : null;
  let rangeModeFare = null, rangeModeCount = 0;
  if (rangeCount) {
    const freq = new Map();
    _rangeFares.forEach(x => freq.set(x.fare, (freq.get(x.fare) || 0) + 1));
    freq.forEach((cnt, fare) => { if (cnt > rangeModeCount) { rangeModeCount = cnt; rangeModeFare = fare; } });
  }
  const getRangeBarPct = (fare) => {
    if (rangeMin == null || rangeMax == null) return 50;
    const range = rangeMax - rangeMin || 1;
    return Math.min(100, Math.max(0, ((fare - rangeMin) / range) * 100));
  };
  // 🎨 2026-11-24 새 디자인(src/FareResultUi.jsx) — 운임조회 › 운임 산출과 같은 모양 · 계산은 위 그대로
  const _apply = (v) => { onChange("청구운임", String(v)); setFareModalOpen(false); };
  const _stats = calcFareStats(sortedHistory);
  const _shown = sortedHistory.filter((r) => fare3Filter === "all" || (r._match?.label || "경로일치") === fare3Filter);
  return (
    <FareShell zClass="z-[99999]" from={form.상차지명} to={form.하차지명} stats={_stats} kpiLabel="대표 청구운임" onClose={() => setFareModalOpen(false)}
      chips={[form.차량톤수, form.차량종류, form.화물내용, trend ? (trend === "up" ? "최근 상승 추세" : trend === "down" ? "최근 하락 추세" : "최근 안정적") : ""]}>
      <FareCard title="운임 분포" sub={`${rangeCount}건${_rangeTonInput != null ? ` · ${form.차량톤수 || _rangeTonInput + "톤"} 이하` : ""}`}>
        {rangeCount === 0 ? <div className="py-6 text-center text-[13px] text-[#8A97AD]">입력한 톤수 이하의 과거 이력이 없어요.</div> : (
          <FareRange min={rangeMin} max={rangeMax} marker={rangeModeFare} markerLabel="대표" sales={_rangeFares.map((x) => x.fare)} onApply={_apply}
            quick={[
              { label: "최저 운임", sub: "가장 낮은 이력", value: rangeMin },
              { label: "대표 운임", sub: `가장 많이 청구(${rangeModeCount}건)`, value: rangeModeFare, strong: true },
              { label: "최고 운임", sub: "가장 높은 이력", value: rangeMax },
              ...(aiResult.fare ? [{ label: "AI 추천", sub: aiResult.reason === "EXACT" ? "동일 조건 기반" : "유사 조건 기반", value: aiResult.fare }] : []),
            ]} />
        )}
      </FareCard>
      {modeFare != null && (
        <div className="bg-white border border-[#0F1A30] rounded-[20px] px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold text-[#6B7A93]">이 톤수 · 화물의 평소 운임(최빈값)</div>
            <div className="text-[22px] font-black text-[#0F1A30] tabular-nums mt-0.5">{modeFare.toLocaleString()}원</div>
            <div className="text-[11.5px] text-[#6B7A93] mt-0.5">동일 조건 {tier0Total}건 중 {modeCount}건({modeSharePct}%)</div>
          </div>
          <button type="button" onClick={() => _apply(modeFare)} className="shrink-0 h-10 px-4 text-[13px] font-extrabold text-white bg-[#0F1A30] rounded-xl">이 금액 적용</button>
        </div>
      )}
      <FareCard title="과거 운송 기록" sub={`${_shown.length}건`} right={<FareSortDropdown value={fareSortMode} onChange={setFareSortMode} />}>
        <FareFilterPills records={sortedHistory} filter={fare3Filter} setFilter={setFare3Filter} />
        <div className="space-y-2">
          {_shown.map((r, idx) => {
            const fare = Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
            const matchLabel = r._match?.label || "경로일치";
            return (
              <FareRow key={idx} rec={r} top={idx === 0 && fare3Filter === "all"} avg={_stats?.saleAvg || 0} pct={getBarPct(fare)} onApply={() => _apply(r.청구운임)}
                tags={[
                  { text: matchLabel, strong: matchLabel === "완전일치" },
                  r._palletCount != null && { text: `${r._palletCount}파렛`, strong: r._palletCount === _inputPalletNum },
                  r._boxCount != null && r._boxCount >= 0 && { text: `${r._boxCount}박스`, strong: r._boxCount === _inputBoxNum },
                  r._cargoText && { text: r._cargoText, strong: r._cargoText === _inputCargoStr },
                  modeRow && r === modeRow && (r._groupSize || 1) > 1 ? { text: `가장 흔한 운임 ${r._groupSize}건`, strong: true } : r._groupSize > 1 ? { text: `이력 ${r._groupSize}건` } : null,
                  isOutlierRow(r) && { text: "이례적 청구(반복없음)", warn: true },
                  { text: getFareTag(fare).label },
                ]}
                vias={<FareVias rec={r} />} extra={{ tag: <SpecialFareTag row={r} size="sm" />, line: <SpecialFareLine row={r} className="mt-1" /> }} />
            );
          })}
          {!sortedHistory.length && <div className="py-10 text-center text-[13px] text-[#8A97AD]">과거 운송 기록이 없어요.</div>}
        </div>
      </FareCard>
    </FareShell>
  );
})()}
        {/* 🧭 2026-11-27 사용자 결정 — 오더등록 메뉴는 오더 등록만: 아래 작업 도우미 · 실시간배차현황 표는 없앴다(현황은 실시간배차현황 · 배차현황 메뉴에서) */}
      </>
    );
  }

// ⭐ 거래처(기본/하차지)의 대표 담당자 — contacts 배열(이름 또는 번호가 있는 것만) 중
// 대표(isPrimary) → 첫 번째 → 평면 필드(담당자/담당자번호/연락처) 순으로 찾는다.
// 예전엔 이름이 빈 연락처(번호만 저장)나, contacts가 비어 있고 번호만 평면 필드에 있는
// 거래처는 자동입력에서 빠져 "주소만 오고 담당자/연락처는 안 오는" 문제가 있었다.
function primaryContactOf(place) {
  if (!place) return null;
  const list = (Array.isArray(place.contacts) ? place.contacts : []).filter(c => c && (String(c.name || "").trim() || String(c.phone || "").trim()));
  const flatName = String(place.담당자 || "").trim();
  const flatPhone = String(place.담당자번호 || place.연락처 || "").trim();
  const c = list.find(x => x.isPrimary) || list[0];
  if (c) return { name: String(c.name || "").trim() || (String(c.phone || "").trim() ? "" : flatName), phone: String(c.phone || "").trim() || flatPhone };
  return (flatName || flatPhone) ? { name: flatName, phone: flatPhone } : null;
}
