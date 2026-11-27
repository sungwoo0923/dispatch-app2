// ======================= src/dispatch/shared/dispatchCommon.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
//  여러 화면(배차 프로그램 본체 · 따로 떼어 낸 화면)이 같이 쓰는 도우미 · 상수 · 작은 컴포넌트. 모듈 상태(let · Map 등)도 여기 한 곳에만 둔다.
import { effectiveFareRule as fareEffRule, farePctOf as farePctOfO, toNum as fareToNum, fareBaseSale, applyFareRule as fareApply, ruleDriverFare as fareRuleDrv } from "../../fareRulesCore.js";
import { kpConfirm } from "../../kpDialog";
import { runDelete, commitDeletes } from "../../DeleteProgress";
import { SHEET_LINK_FIELDS } from "../../sheetLinkFields";
import { loadTmap } from "../../tmapLoader";
import { attachTmapTraffic } from "../../trafficTmap";
import { imeFocusRef } from "../../imeFocus";
import { isBlindHidden } from "../../blind";
import { mgrName } from "../../mgrPlaceholder";
import { lazyView, html2canvas, loadJsPDF } from "../../lazyLoad";
import React from "react";
import { VehicleTypePicker } from "../../vehicleTypes";
import { getTenant, withCo } from "../../fsTenant";
import { coDocKey } from "../../coKey";
import { createPortal } from "react-dom";
import { sendText } from "../../smsSend";
import { driversOfPlate, SamePlateChips, DriverEditButton } from "../../DriverEditChoice";
import { placeSearch } from "../../placeSearch";
import { applyOwner } from "../../orderOwner";
import { askCopyDates } from "../../CopyCountDialog";
import { makeClientMatcher } from "../../clientMatch";
import { useCompanyBiz, bizOf } from "../../companyBiz";
import CustomDatePicker, { KOREAN_HOLIDAYS, shortHolidayLabel } from "../../CustomDatePicker";
import { EditableText } from "../../EditMode";
import { useCompanyDropdownOptions } from "../../companyDropdownOptions";
import { CompanyOptionPicker } from "../../companyOptionPicker";
import { isScheduleApproved, LEAVE_TYPE_LABEL, ATTENDANCE_STATUS_COLOR } from "../../attendanceUtils";
import { CustomSelect } from "../../CustomSelect";
import { RoadviewButton } from "../../roadview";
import RouteMapModal from "../../RouteMapModal";
import { logOrderDeletion, kstToday as histToday, useLoadFullOrderHistory } from "../../orderHistory";
import { RotationBadge } from "../../rotation";
import { onSnapshot, collection, doc, deleteField, serverTimestamp, deleteDoc, getDocs, getDoc, addDoc, query, where, increment, getCountFromServer } from "firebase/firestore";
import { updateDoc, setDoc } from "../../orderWrite";
import { DEFAULT_COMPANY, db, auth } from "../../firebase";
import { OrderTimelineModal } from "../../OrderTimeline";
import { orderStaffNameRaw as _orderStaffNameRaw } from "../../detailGetters";
import { paidEditGuard } from "../../payCore";
import { useFareRules, fareFormChange, FareTypeSelect, FareRuleHint } from "../../fareRules";
import { fareBreakdown } from "../../forkliftCore";
import { fkNum, profitTotals, orderProfit } from "../../forklift";
import { useCompanyFeatures } from "../../companyFeatures";
import { visibleCols } from "../../invoiceForm";
import { DISPATCH_TOAST_TYPES, dispatchAlertsOn } from "../../notifyAudience";
import { useBetaOn, OUT_KEY } from "../../CallPay";
import { ensureUploadToken } from "../../uploadTokenClient";

// ⚡ 2026-11-27 속도 — xlsx(약 420KB)는 엑셀 버튼 · 엑셀 올리기를 누를 때 받는다(예전엔 배차 프로그램 첫 묶음에 들어 로그인 → HOME 이 늦었다).
//  쓰는 함수마다 맨 앞에서 const XLSX = await loadXLSX() — 동작 · 파일 모양은 그대로
export const loadXLSX = () => import("xlsx");
export const ClassicResume = lazyView(() => import("../../ClassicResume"));
export const MonthCompareAnalysis = lazyView(() => import("../../MonthCompareAnalysis"));
export const MonthlyReport = lazyView(() => import("../../MonthlyReport"));
export const StaffPerformance = lazyView(() => import("../../StaffPerformance"));

// 🛠 2026-11-27 오더 복사/수정 패널 — 저장할 때 "패널을 연 뒤 내가 바꾼 칸"만 보낸다.
//  (예전엔 연 순간의 오더 전체를 다시 써서, 그사이 다른 직원이 넣은 차량 · 기사 수락 · 지급완료 등이 예전 값으로 되돌아갔다)
export function copyPanelDiff(payload, orig) {
  if (!orig) return payload;
  const out = {};
  for (const k of Object.keys(payload)) {
    if (k === "updatedAt") { out[k] = payload[k]; continue; }
    let same;
    try { same = JSON.stringify(payload[k]) === JSON.stringify(orig[k]); } catch { same = false; }
    if (!same) out[k] = payload[k];
  }
  return out;
}
export function useCopyPanelOrig(copyPanelOpen, copyTarget) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!copyPanelOpen || !copyTarget?._id) { ref.current = null; return; }
    if (ref.current?._id !== copyTarget._id) ref.current = copyTarget;
  }, [copyPanelOpen, copyTarget]);
  return ref;
}

/* -------------------------------------------------
   공통 상수 (차량종류, 결제/배차 방식)
--------------------------------------------------*/
export const VEHICLE_TYPES = ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "윙/카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑", "냉장/냉동탑", "냉장/냉동윙"];


// "오전/오후 N시(30분)" 또는 이미 "HH:mm" 형태인 문자열을 24시간 "HH:mm"으로 변환.
// 파싱할 수 없으면 빈 문자열을 돌려준다.
export function lunchTimeToHHMM(t) {
  if (!t) return "";
  let s = String(t).trim().replace("시 ", ":").replace("시", ":").replace("분", "");
  if (/:\s*$/.test(s)) s += "00";
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, "0");
  const m = s.match(/(오전|오후)\s*(\d{1,2}):?(\d{2})?/);
  if (!m) return "";
  let [, ampm, hh, mm] = m;
  mm = mm ?? "00";
  hh = parseInt(hh, 10);
  if (ampm === "오후" && hh < 12) hh += 12;
  if (ampm === "오전" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
// 상/하차시간이 등록된 점심시간대(점심시작~점심종료, 종료 미포함)와 겹치는지 확인
export function isLunchTimeOverlap(orderTime, lunchStart, lunchEnd) {
  const t = lunchTimeToHHMM(orderTime);
  const s = lunchTimeToHHMM(lunchStart);
  const e = lunchTimeToHHMM(lunchEnd);
  if (!t || !s || !e) return false;
  return t >= s && t < e;
}
// 이름(거래처명/업체명) → { start, end } 조회용 맵을 만든다.
// clients(기본거래처)를 먼저 넣어 우선시키고, 하차지거래처는 겹치지 않는 이름만 보충한다.
export function buildLunchByName(clientsArr = [], placeRowsArr = []) {
  const map = new Map();
  const put = (name, start, end) => {
    if (!name) return;
    if (!start && !end) return;
    const key = String(name).toLowerCase().replace(/\s+/g, "");
    if (!key || map.has(key)) return;
    map.set(key, { start: start || "", end: end || "" });
  };
  (clientsArr || []).forEach(c => put(c.거래처명 || c.업체명, c.점심시작시간, c.점심종료시간));
  (placeRowsArr || []).forEach(p => put(p.업체명 || p.거래처명, p.점심시작시간, p.점심종료시간));
  return map;
}
export const _lunchNameKey = (s = "") => String(s || "").toLowerCase().replace(/\s+/g, "");

// ⚠️ 예전엔 여기에 상/하차지명 옆 시계 아이콘(RestCell)이 있었는데, 상/하차지 칸이
// 복잡해 보인다는 피드백으로 제거했다 — 대신 오더정보(우클릭 메뉴) 팝업에서 상세
// 휴게시간을 확인할 수 있다(OrderInfoModal 참고). isLunchTimeOverlap/buildLunchByName/
// _lunchNameKey는 그 팝업에서 계속 재사용한다.

/* -------------------------------------------------
   운임정보(운임확인서) 미리보기 팝업 — 실시간배차현황/배차현황 우클릭 메뉴의
   "운임정보"에서 연다. 해당 오더가 어느 기사에게 배차되었고 그 기사님이 운송을
   수행했으며 얼마의 운임을 지급하는지를 증빙하는 문서 형태로 보여준다.
   확대/축소 미리보기 + 이미지/PDF 저장 + 인쇄를 지원한다.
--------------------------------------------------*/
// "인천광역시 서구 ..." → "인천광역시 서구" 처럼 앞의 두 토큰만 남겨 간단주소로 축약
export function fareCertShortAddr(addr = "") {
  const s = String(addr || "").trim();
  if (!s) return "-";
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || s;
}
export function fareCertPhone(raw = "") {
  const d = String(raw || "").replace(/[^\d]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw || "-";
}

// 🧾 2026-11-25 운임명세서 운임구분 % — 오더에 넣은 운임구분(월대 10% 등)이 어떻게 계산됐는지
//  st: "rule"(규칙대로 · fee = 기본 청구운임 × %) · "manual"(기사운임을 직접 고침) · "nosale"(청구운임이 0원이라 %를 못 거는 오더) · "norule"(규칙을 찾지 못함)
//  규칙은 청구운임 → 기사운임 방향이다. 청구운임이 없으면 명세서가 임의로 숫자를 만들지 않고 알려만 준다
export function fareTypeInfo(o, rules) {
  const name = String(o?.운임구분 || "").trim();
  if (!name) return null;
  let rule = fareEffRule(o, rules);
  if (!rule) { const p = farePctOfO(o); if (p === null) return { name, label: name, st: "norule", fee: 0 }; rule = { name, type: "percent", value: p }; }
  const v = fareToNum(rule.value);
  const label = rule.type === "fixed" ? `${name} ${Math.round(v).toLocaleString()}원` : `${name} ${v}%`;
  const base = fareBaseSale(o);
  if (!(base > 0)) return { name, label, st: "nosale", fee: 0 };
  const fee = fareApply(rule, base).수수료;
  const manual = !!o?.운임수동 || fareToNum(o?.기사운임) !== fareRuleDrv(rule, o);
  return { name, label, st: manual ? "manual" : "rule", fee };
}

// 🧾 2026-11-24 운임명세서 본문 — 여러 건의 운임을 건별로 자동 계산하고(기본 운임 · 지게차 · 특수운임 · 최종) 맨 아래에 총합계를 낸다
export function FareStatementBody({ rows, issuerName, show, MONO }) {
  const fareRS = useFareRules(); // 🧾 2026-11-25 운임구분 % 표시용
  // 🛠 2026-11-25 다시 짬(사용자 요청) — 차량번호 · 기사명 칸 따로 · 줄바꿈 없이 한 줄(칸이 모자라면 문서가 넓어지고 창이 맞춰 커진다)
  //  · 금액 칸(기본운임 · 기사운임 · 청구운임 · 수수료)은 [금액 표시 설정]에서 켜고 끈다 · 수수료는 +파랑 / −빨강
  const list = rows.map((o) => ({ o, fb: fareBreakdown(o), ft: fareTypeInfo(o, fareRS.rules) }));
  // 운임구분 % — 규칙대로 계산된 오더만 묶어서 "회사 몫"을 보여 주고, 계산할 수 없는 오더는 화면에만 알린다(PDF · 이미지에는 안 들어감)
  const ftGroups = new Map();
  list.forEach(({ ft }) => { if (ft?.st !== "rule") return; const g = ftGroups.get(ft.label) || { label: ft.label, cnt: 0, fee: 0 }; g.cnt += 1; g.fee += ft.fee; ftGroups.set(ft.label, g); });
  const ftNo = (st) => list.map((x, i) => (x.ft?.st === st ? i + 1 : 0)).filter(Boolean);
  const noSaleNo = ftNo("nosale"), manualNo = ftNo("manual");
  const drivers = [...new Set(rows.map((o) => [o.이름, o.차량번호].filter(Boolean).join(" · ")).filter(Boolean))];
  const won = (n) => Math.round(n).toLocaleString();
  const sum = (f) => list.reduce((a, x) => a + f(x), 0);
  const T = { baseDrv: sum((x) => x.fb.baseDrv), baseSale: sum((x) => x.fb.baseSale), drv: sum((x) => x.fb.drv), sale: sum((x) => x.fb.sale), paid: sum((x) => x.fb.paid), profit: sum((x) => x.fb.profit) };
  const vat = Math.round(T.drv * 0.1);
  const byItem = new Map();
  list.forEach(({ fb }) => fb.lines.forEach((l) => { const k = l.name; const c = byItem.get(k) || { name: k, cnt: 0, amount: 0, drv: 0, sale: 0 }; c.cnt += 1; c.amount += l.amount; c.drv += l.drv; c.sale += l.sale; byItem.set(k, c); }));
  const items = [...byItem.values()];
  const fareTypes = [...new Set(list.map((x) => x.fb.fareType).filter(Boolean))];
  const NW = { whiteSpace: "nowrap" };
  const th = { ...NW, fontSize: 11.5, fontWeight: 800, color: "#5B6B85", padding: "9px 12px", background: "#F5F7FB", borderBottom: "1px solid #E3E8F0", textAlign: "center", verticalAlign: "middle" };
  const thR = th; // 🛠 2026-11-25 제목 줄은 모두 가운데(사용자 요청)
  const td = { ...NW, fontSize: 12, fontWeight: 700, color: "#0F1A30", padding: "9px 12px", borderBottom: "1px solid #EEF1F6", verticalAlign: "middle" };
  const num = { ...td, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
  // 합계 줄 — 굵은 글씨 · 진한 바탕 · 위 굵은 선으로 다른 줄과 확실히 구분
  const foot = { background: "#E8EEF8", borderBottom: "none", borderTop: "2px solid #0F1A30", fontWeight: 900, fontSize: 13, color: "#0F1A30" };
  // 🛠 2026-11-25 수수료 색 — 배차현황 수수료 칸과 같게 이익 빨강 · 손실(마이너스) 파랑(사용자 요청)
  const profitColor = (n) => (n < 0 ? "#1D4ED8" : n > 0 ? "#DC2626" : "#7A89A3");
  const sec = (en, title) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "20px 0 8px" }}>
      <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em", color: "#4B6CB7" }}>{en}</span>
      <span style={{ fontSize: 14, fontWeight: 900, color: "#0F1A30" }}>{title}</span>
    </div>
  );
  const sign = (n) => (n ? <span style={{ color: n > 0 ? "#2D4C82" : "#B4342A" }}>{n > 0 ? "+" : "−"}{won(Math.abs(n))}</span> : <span style={{ color: "#B7C2D3" }}>·</span>);
  const first = rows[0]?.상차일 || "", last = rows[rows.length - 1]?.상차일 || "";
  const cards = [["운송 건수", `${rows.length}건`],
    ...(show.base ? [["기본운임 합계", `${won(T.baseDrv)}원`]] : []),
    ...(show.drv ? [["기사운임 합계 (공급가)", `${won(T.drv)}원`], ["부가세 (10%)", `${won(vat)}원`]] : []),
    ...(show.sale ? [["청구운임 합계", `${won(T.sale)}원`]] : []),
    ...(show.fee ? [["수수료 합계", `${won(T.profit)}원`, profitColor(T.profit)]] : [])];
  return (
    <>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#3A4A66", lineHeight: 1.75, background: "#F5F7FB", border: "1px solid #E3E8F0", borderRadius: 10, padding: "12px 16px" }}>
        본 명세서는 <b style={{ color: "#0F1A30" }}>{issuerName || "운송사"}</b>가 {first === last ? first : `${first} ~ ${last}`} 기간에 배차한 운송 <b style={{ color: "#0F1A30" }}>{rows.length}건</b>의 운임을
        {drivers.length === 1 ? <> 기사 <b style={{ color: "#0F1A30" }}>{drivers[0]}</b> 기준으로</> : null} 건별로 계산하고 합계를 정리한 것입니다.
      </div>

      {sec("SUMMARY", "합계")}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 10 }}>
        {cards.map(([l, v, c]) => (
          <div key={l} style={{ border: "1px solid #E3E8F0", borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ ...NW, fontSize: 11, fontWeight: 800, color: "#7A89A3" }}>{l}</div>
            <div style={{ ...NW, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 17, fontWeight: 900, color: c || "#0F1A30", marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>
      {show.drv && (
        <div style={{ marginTop: 10, background: "#0F1A30", color: "#fff", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#8FB0F0" }}>기사 지급 합계 (VAT 포함)</span>
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 900 }}>{won(T.drv + vat)}원</span>
        </div>
      )}

      {sec("DETAIL", "건별 운임")}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E3E8F0" }}>
        <thead><tr>
          <th style={th}>No</th><th style={th}>상차일</th><th style={th}>상차지</th><th style={th}>하차지</th><th style={th}>차량번호</th><th style={th}>기사명</th><th style={th}>운임구분</th>
          {show.base && <th style={thR}>기본운임</th>}<th style={th}>특수운임</th>
          {show.drv && <th style={thR}>기사운임</th>}{show.sale && <th style={thR}>청구운임</th>}{show.fee && <th style={thR}>수수료</th>}
        </tr></thead>
        <tbody>
          {list.map(({ o, fb, ft }, i) => (
            <tr key={o._id || o.id || i}>
              <td style={{ ...num, textAlign: "center", color: "#7A89A3" }}>{i + 1}</td>
              <td style={{ ...num, textAlign: "left" }}>{String(o.상차일 || "").slice(5) || "-"}</td>
              <td style={td}>{o.상차지명 || "-"}</td>
              <td style={td}>{o.하차지명 || "-"}</td>
              <td style={{ ...td, fontFamily: MONO }}>{o.차량번호 || "-"}</td>
              <td style={td}>{o.이름 || "-"}</td>
              <td style={{ ...td, color: "#2D4C82" }}>{ft ? ft.label : (fb.fareType || "-")}{ft?.st === "nosale" ? <span style={{ color: "#B4342A", fontWeight: 600, fontSize: 11 }}> · 청구운임 없음</span> : ft?.st === "manual" ? <span style={{ color: "#7A89A3", fontWeight: 600, fontSize: 11 }}> · 직접 입력</span> : null}</td>
              {show.base && <td style={num}>{won(fb.baseDrv)}</td>}
              <td style={{ ...td, fontWeight: 600 }}>{fb.lines.length ? fb.lines.map((l, k) => <span key={l.key}>{k ? <span style={{ color: "#C3CDDD" }}> · </span> : null}{l.name} <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{show.drv ? sign(l.drv) : won(l.amount)}</span>{show.sale && l.sale ? <span style={{ color: "#7A89A3" }}> (청구 {sign(l.sale)})</span> : null}</span>) : <span style={{ color: "#B7C2D3" }}>없음</span>}</td>
              {show.drv && <td style={{ ...num, fontWeight: 900 }}>{won(fb.drv)}</td>}
              {show.sale && <td style={num}>{won(fb.sale)}</td>}
              {show.fee && <td style={{ ...num, fontWeight: 900, color: profitColor(fb.profit) }}>{won(fb.profit)}</td>}
            </tr>
          ))}
          <tr>
            <td colSpan={7} style={{ ...td, ...foot }}>합계 {rows.length}건</td>
            {show.base && <td style={{ ...num, ...foot }}>{won(T.baseDrv)}</td>}
            <td style={{ ...td, ...foot }} />
            {show.drv && <td style={{ ...num, ...foot }}>{won(T.drv)}</td>}
            {show.sale && <td style={{ ...num, ...foot }}>{won(T.sale)}</td>}
            {show.fee && <td style={{ ...num, ...foot, color: profitColor(T.profit) }}>{won(T.profit)}</td>}
          </tr>
        </tbody>
      </table>

      {(noSaleNo.length > 0 || manualNo.length > 0) && (
        <div data-html2canvas-ignore="true" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "#7A3A12", background: "#FFF7ED", border: "1px solid #F5D6B8", borderRadius: 10, padding: "10px 14px", lineHeight: 1.7 }}>
          <div style={{ fontWeight: 900, color: "#B4342A" }}>확인해 주세요 <span style={{ fontWeight: 600, color: "#9A6B4A" }}>(이 안내는 화면에만 보이고 PDF · 이미지에는 안 들어가요)</span></div>
          {noSaleNo.length > 0 && <div>· No {noSaleNo.join(", ")} — 운임구분은 있지만 <b>청구운임이 0원</b>이라 %를 계산할 수 없어요. 그래서 수수료가 마이너스로 나와요. 오더에 청구운임을 넣으면 기사운임이 %대로 다시 계산돼요.</div>}
          {manualNo.length > 0 && <div>· No {manualNo.join(", ")} — 기사운임을 <b>직접 고친</b> 오더예요. % 대신 입력한 금액 그대로 계산했어요. %대로 바꾸려면 오더 수정에서 [↺ 규칙대로]를 누르면 돼요.</div>}
        </div>
      )}

      {sec("BREAKDOWN", "운임 구성 합계")}
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E3E8F0" }}>
        <thead><tr><th style={th}>항목</th><th style={thR}>건수</th><th style={thR}>금액 합계</th>{show.drv && <th style={thR}>기사운임 영향</th>}{show.sale && <th style={thR}>청구운임 영향</th>}</tr></thead>
        <tbody>
          {show.base && <tr><td style={td}>기본운임{fareTypes.length ? <span style={{ color: "#7A89A3", fontWeight: 600 }}> (운임구분 {fareTypes.join(" · ")})</span> : null}</td><td style={num}>{rows.length}</td><td style={num}>{won(T.baseDrv)}</td>{show.drv && <td style={num}>{won(T.baseDrv)}</td>}{show.sale && <td style={num}>{won(T.baseSale)}</td>}</tr>}
          {[...ftGroups.values()].map((g) => <tr key={`ft-${g.label}`}><td style={td}>운임구분 수수료 <span style={{ color: "#2D4C82" }}>({g.label})</span><span style={{ color: "#7A89A3", fontWeight: 600 }}> · 기본 청구운임에서 뺀 회사 몫(기본운임에 이미 반영)</span></td><td style={num}>{g.cnt}</td><td style={num}>{won(g.fee)}</td>{show.drv && <td style={num}><span style={{ color: "#B7C2D3" }}>·</span></td>}{show.sale && <td style={num}><span style={{ color: "#B7C2D3" }}>·</span></td>}</tr>)}
          {items.map((c) => <tr key={c.name}><td style={td}>{c.name}</td><td style={num}>{c.cnt}</td><td style={num}>{won(c.amount)}</td>{show.drv && <td style={num}>{sign(c.drv)}</td>}{show.sale && <td style={num}>{sign(c.sale)}</td>}</tr>)}
          {!items.length && !show.base && <tr><td colSpan={5} style={{ ...td, color: "#9AA9C3" }}>특수운임이 없어요.</td></tr>}
          <tr><td style={{ ...td, ...foot }}>최종</td><td style={{ ...num, ...foot }} /><td style={{ ...num, ...foot, color: "#5B6B85", fontWeight: 700 }}>{T.paid ? `회사 별도 지급 ${won(T.paid)}` : ""}</td>{show.drv && <td style={{ ...num, ...foot }}>{won(T.drv)}</td>}{show.sale && <td style={{ ...num, ...foot }}>{won(T.sale)}</td>}</tr>
          {/* 🛠 2026-11-25 수수료를 표 안 마지막 줄로(이익 빨강 · 손실 파랑) — 표 아래 작은 글씨로만 있어 잘 안 보였다 */}
          {show.fee && <tr><td style={{ ...td, fontWeight: 900, fontSize: 13.5, background: "#FFF7F5" }}>수수료 합계</td><td colSpan={2} style={{ ...td, background: "#FFF7F5", color: "#7A89A3", fontWeight: 600, textAlign: "right" }}>청구운임 − 기사운임 − 회사 별도 지급</td><td colSpan={(show.drv ? 1 : 0) + (show.sale ? 1 : 0) || 1} style={{ ...num, background: "#FFF7F5", fontWeight: 900, fontSize: 15, color: profitColor(T.profit) }}>{won(T.profit)}원</td></tr>}
        </tbody>
      </table>
    </>
  );
}
// 🧾 2026-11-25 [금액 표시 설정] — 운임확인서 · 운임명세서에 보일 금액(이 PC에 기억). 예전 "청구운임 숨김"(kpFareCertShowSale=0)은 청구 · 수수료 끔으로 이어받는다
export const FARE_CERT_COLS_KEY = "kpFareCertCols";
export const FARE_CERT_COL_LIST = [["base", "기본운임"], ["drv", "기사운임"], ["sale", "청구운임"], ["fee", "수수료"]];
export function loadFareCertCols() {
  const d = { base: true, drv: true, sale: true, fee: true };
  try {
    const raw = localStorage.getItem(FARE_CERT_COLS_KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
    if (localStorage.getItem("kpFareCertShowSale") === "0") return { ...d, sale: false, fee: false };
  } catch { /* 무시 */ }
  return d;
}
export function FareCertColsButton({ show, setShow }) {
  // 🛠 2026-11-25 펼침 창을 화면 맨 위층(portal)에 띄운다 — 예전엔 창 머리(overflow-hidden)에 잘려 안 보였다
  const [rect, setRect] = React.useState(null);
  const btnRef = React.useRef(null); const popRef = React.useRef(null);
  const open = !!rect;
  React.useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!btnRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setRect(null); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); setRect(null); } };
    const move = () => setRect(null);
    document.addEventListener("mousedown", off); window.addEventListener("keydown", key, true); window.addEventListener("resize", move);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("keydown", key, true); window.removeEventListener("resize", move); };
  }, [open]);
  const on = FARE_CERT_COL_LIST.filter(([k]) => show[k]).length;
  const toggle = (k) => setShow((p) => { const n = { ...p, [k]: !p[k] }; try { localStorage.setItem(FARE_CERT_COLS_KEY, JSON.stringify(n)); } catch { /* 무시 */ } return n; });
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setRect(open ? null : btnRef.current.getBoundingClientRect())} aria-expanded={open} className={`h-9 px-3 rounded-xl border text-[12.5px] font-bold whitespace-nowrap ${open ? "bg-white text-[#0F1A30] border-white" : "bg-white/10 border-white/20 hover:bg-white/20"}`}>
        금액 표시 설정 <span className="ml-1 text-[11px] opacity-70">{on}/{FARE_CERT_COL_LIST.length}</span>
      </button>
      {open && createPortal(
        <div ref={popRef} className="fixed w-[240px] rounded-2xl bg-white text-[#0F1A30] shadow-[0_20px_50px_rgba(11,20,40,.35)] border border-[#E3E8F0] p-2"
          style={{ zIndex: 1000001, top: rect.bottom + 8, left: Math.max(8, Math.min(window.innerWidth - 248, rect.right - 240)) }}>
          <div className="px-2 pt-1 pb-2 text-[12px] font-bold text-[#7A89A3]">문서에 보일 금액을 골라요. 이 PC에 기억돼요.</div>
          {FARE_CERT_COL_LIST.map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-2 px-2 h-11 rounded-xl hover:bg-[#F4F6FA] cursor-pointer text-[14px] font-black">
              {l}
              <span className={`relative w-10 h-6 rounded-full transition ${show[k] ? "bg-[#0F1A30]" : "bg-[#D5DCE7]"}`}>
                <input type="checkbox" className="sr-only" checked={!!show[k]} onChange={() => toggle(k)} />
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${show[k] ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </label>
          ))}
        </div>, document.body)}
    </>
  );
}
export function FareCertModal({ row, companyName, onClose }) {
  const [zoom, setZoom] = React.useState(1);
  const [show, setShow] = React.useState(loadFareCertCols); // 🧾 2026-11-25 금액 표시 설정(기본운임 · 기사운임 · 청구운임 · 수수료)
  const captureRef = React.useRef(null);
  // 🧾 2026-11-25 문서 크기 — 줄바꿈 없는 명세서가 창보다 넓으면 처음 열 때 창 폭에 맞춰 줄이고, 줄인 크기만큼만 자리를 차지하게 한다(왼쪽이 잘리지 않게)
  const bodyRef = React.useRef(null);
  const [docSize, setDocSize] = React.useState({ w: 0, h: 0 });
  const fittedRef = React.useRef(false);
  React.useEffect(() => {
    const el = captureRef.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth, h = el.offsetHeight; setDocSize({ w, h });
      const avail = (bodyRef.current?.clientWidth || 0) - 48;
      if (!fittedRef.current && w && avail > 0) { fittedRef.current = true; if (w > avail) setZoom(Math.max(0.6, Math.floor((avail / w) * 100) / 100)); }
    });
    ro.observe(el); return () => ro.disconnect();
  }, [row]);
  // ⭐ 2026-11-03 여러 사업자 — 오더의 청구 사업자가 추가 사업자면 그 사업자 이름·정보로 발급
  const fcBiz = useCompanyBiz(getTenant() || companyName);
  const fareRCert = useFareRules(getTenant() || companyName); // 🧾 2026-11-25 운임구분 % 표시
  if (!row || (Array.isArray(row) && !row.length)) return null;
  // 🧾 2026-11-24 여러 건을 고르고 [운임정보]를 누르면 운임 명세서(건별 자동 계산 + 총합계)로 보여 준다(사용자 요청)
  const certRows = (Array.isArray(row) ? row : [row]).slice().sort((a, b) => String(a.상차일 || "").localeCompare(String(b.상차일 || "")) || String(a.상차시간 || "").localeCompare(String(b.상차시간 || "")));
  const multi = certRows.length > 1;
  const r = certRows[0];
  const docTitle = multi ? "운임명세서" : "운임확인서";
  const issuerBiz = fcBiz.multi ? fcBiz.find(bizOf(r, fcBiz.defaultName)) : null;
  const issuerName = issuerBiz?.name || companyName;

  const 기사운임 = Number(String(r.기사운임 || "0").replace(/[^\d-]/g, "")) || 0;
  const fb = fareBreakdown(r); // 🧾 2026-11-24 운임 내역(기본 운임 → 지게차 · 특수운임 → 최종)
  const ftC = fareTypeInfo(r, fareRCert.rules); // 🧾 2026-11-25 운임구분 %(월대 10% 등)
  const issuedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
  const docNo = `${(r.상차일 || "").replace(/-/g, "")}-${String(r._id || r.id || "").slice(-6).toUpperCase() || "000000"}`;

  const captureCanvas = () => captureRef.current
    ? html2canvas(captureRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true })
    : null;

  const saveImage = async () => {
    const canvas = await captureCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${docTitle}_${r.차량번호 || ""}_${r.상차일 || ""}${multi ? `_외${certRows.length - 1}건` : ""}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const savePdf = async () => {
    const canvas = await captureCanvas();
    if (!canvas) return;
    // 🛠 2026-11-25 PDF 용량 — PNG(약 12MB) 대신 고화질 JPEG(약 1MB)로 넣는다. 메일 · 카톡으로 보내기 좋게
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    // 🧾 2026-11-25 넓은 명세서(문서 폭 1000px 넘음)는 A4 가로로 — 글씨가 작아지지 않게
    const land = multi && (captureRef.current?.offsetWidth || 0) > 1100;
    const pdf = new (await loadJsPDF())(land ? "l" : "p", "mm", "a4");
    const pdfWidth = land ? 297 : 210; const pageH = land ? 210 : 297;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    // 🧾 명세서가 A4 한 장보다 길면 여러 장으로 나눠 담는다
    for (let y = 0, page = 0; y < imgHeight; y += pageH, page += 1) {
      if (page) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, -y, pdfWidth, imgHeight);
    }
    pdf.save(`${docTitle}_${r.차량번호 || ""}_${r.상차일 || ""}${multi ? `_외${certRows.length - 1}건` : ""}.pdf`);
  };
  const handlePrint = async () => {
    const canvas = await captureCanvas();
    if (!canvas) return;
    const imgData = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    const land = multi && (captureRef.current?.offsetWidth || 0) > 1100; // 넓은 명세서는 가로로 인쇄
    w.document.write(`<!doctype html><html><head><title>${docTitle}</title><style>
      @page { size: A4 ${land ? "landscape" : "portrait"}; margin: 10mm; }
      body { margin:0; display:flex; justify-content:center; background:#fff; }
      img { width:100%; max-width:${land ? 277 : 190}mm; }
    </style></head><body><img src="${imgData}" onload="window.print()" /></body></html>`);
    w.document.close();
  };

  const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
  const vat = Math.round(기사운임 * 0.1);
  const pTime = r.상차시간 ? fmtDispatchTime(r.상차시간, r.상차시간기준 || r.상차시간구분) : "즉시";
  const dTime = r.하차시간 ? fmtDispatchTime(r.하차시간, r.하차시간기준 || r.하차시간구분) : "즉시";
  const done = r.기사확인상태 === "완료" || !!r.기사완료일시;
  // 문서 안 표 한 칸 (html2canvas 캡처용이라 단순한 마크업만 사용)
  const cell = (label, value, opts = {}) => (
    <div style={{ display: "flex", borderBottom: "1px solid #E3E8F0", minHeight: 44, gridColumn: opts.span ? "span 2" : undefined }}>
      <div style={{ width: 104, flexShrink: 0, background: "#F5F7FB", color: "#5B6B85", fontSize: 13.5, fontWeight: 800, padding: "11px 14px", borderRight: "1px solid #E3E8F0", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{label}</div>
      <div style={{ flex: 1, padding: "11px 14px", fontSize: 15, fontWeight: opts.bold ? 900 : 700, color: "#0F1A30", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{value || "-"}</div>
    </div>
  );
  const sec = (en, title) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "18px 0 8px" }}>
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em", color: "#4B6CB7" }}>{en}</span>
      <span style={{ fontSize: 14, fontWeight: 900, color: "#0F1A30" }}>{title}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[999999] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-6">
      <div className={`bg-[#F4F6FA] rounded-[26px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] ${multi ? "w-[1480px]" : "w-[1120px]"} max-w-[96vw] max-h-[94vh] flex flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 툴바 */}
        <div className="relative flex items-center justify-between px-6 py-4 shrink-0 text-white overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative">
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FARE · CERTIFICATE</div>
            <h3 className="text-[19px] font-black leading-tight">{multi ? `운임명세서 · ${certRows.length}건` : <EditableText id="popup.title.운임정보 미리보기" defaultText="운임확인서" />}</h3>
          </div>
          <div className="relative flex items-center gap-1.5">
            <FareCertColsButton show={show} setShow={setShow} />
            <div className="flex items-center rounded-xl bg-white/10 border border-white/15 h-9">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} className="w-9 h-9 text-[16px] font-bold hover:bg-white/10 rounded-l-xl">−</button>
              <span className="text-[12px] w-12 text-center tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} className="w-9 h-9 text-[16px] font-bold hover:bg-white/10 rounded-r-xl">+</button>
            </div>
            <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-[13px] font-bold">닫기 ✕</button>
          </div>
        </div>

        {/* 본문 (확대/축소 미리보기) */}
        <div ref={bodyRef} className="flex-1 overflow-auto p-6">
          <div style={docSize.w ? { width: docSize.w * zoom, height: docSize.h * zoom, margin: "0 auto" } : undefined}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: docSize.w ? "top left" : "top center", transition: "transform .15s", width: docSize.w || undefined }}>
            <div ref={captureRef} className="mx-auto kp-fare-doc" style={{ ...(multi ? { width: "max-content", minWidth: 900 } : { width: "max-content", minWidth: 900 }), background: "#fff", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", boxShadow: "0 10px 30px rgba(15,26,48,0.12)" }}>
              {/* 문서 머리 */}
              <div style={{ background: "#0F1A30", color: "#fff", padding: "22px 34px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10, fontWeight: 800, letterSpacing: "0.3em", color: "#8FB0F0" }}>FARE CERTIFICATE</div>
                  <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.32em", marginTop: 4 }}>{docTitle}</div>
                  {issuerBiz && <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.78)", marginTop: 4, letterSpacing: "0.04em" }}>{issuerBiz.name}{issuerBiz.bizNo ? <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#8FB0F0", marginLeft: 8 }}>{issuerBiz.bizNo}</span> : null}</div>}
                </div>
                <div style={{ textAlign: "right", fontSize: 11.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
                  <div>문서번호 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{docNo}</b></div>
                  <div>발급일시 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{issuedAt}</b></div>
                </div>
              </div>
              <div style={{ height: 4, background: "linear-gradient(90deg,#2D4C82,#8FB0F0)" }} />

              <div style={{ padding: "22px 34px 30px" }}>
                {multi ? <FareStatementBody rows={certRows} issuerName={issuerName} show={show} MONO={MONO} /> : (<>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#3A4A66", lineHeight: 1.75, background: "#F5F7FB", border: "1px solid #E3E8F0", borderRadius: 10, padding: "12px 16px" }}>
                  본 확인서는 <b style={{ color: "#0F1A30" }}>{issuerName || "운송사"}</b>가 아래 운송 건을 기사 <b style={{ color: "#0F1A30" }}>{r.이름 || "-"}</b>({r.차량번호 || "-"})에게 배차하였고,
                  해당 기사님이 운송을 {done ? "완료하였음" : "수행함"}을 확인{show.drv ? "하며, 아래 기사운임을 지급함을 증명합니다." : "합니다."}
                </div>

                {sec("ROUTE", "운송 정보")}
                <div style={{ border: "1px solid #E3E8F0", borderBottom: "none", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  {cell("상차일시", `${r.상차일 || "-"} ${pTime}`)}
                  {cell("하차일시", `${r.하차일 || r.상차일 || "-"} ${dTime}`)}
                  {cell("상차지", `${r.상차지명 || "-"}`, { bold: true })}
                  {cell("하차지", `${r.하차지명 || "-"}`, { bold: true })}
                  {cell("상차 주소", r.상차지주소 || fareCertShortAddr(r.상차지주소))}
                  {cell("하차 주소", r.하차지주소 || fareCertShortAddr(r.하차지주소))}
                  {cell("화물", [r.화물내용, r.차량톤수].filter(Boolean).join(" · "))}
                  {cell("차량", [r.차량종류, r.운행유형 === "왕복" ? "왕복" : "편도"].filter(Boolean).join(" · "))}
                </div>

                {sec("DRIVER", "기사 정보")}
                <div style={{ border: "1px solid #E3E8F0", borderBottom: "none", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {cell("기사명", r.이름, { bold: true })}
                  {cell("연락처", fareCertPhone(r.전화번호))}
                  {cell("차량번호", r.차량번호, { bold: true })}
                </div>

                {sec("PAYMENT", "운임 정보")}
                {show.drv && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.25fr", gap: 10 }}>
                  {[["기사운임 (공급가)", `${기사운임.toLocaleString()}원`], ["부가세 (10%)", `${vat.toLocaleString()}원`]].map(([l, v]) => (
                    <div key={l} style={{ border: "1px solid #E3E8F0", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#7A89A3" }}>{l}</div>
                      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 18, fontWeight: 900, color: "#0F1A30", marginTop: 3 }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ background: "#0F1A30", color: "#fff", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8FB0F0" }}>합계 (VAT 포함)</div>
                    <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 900, marginTop: 2 }}>{(기사운임 + vat).toLocaleString()}원</div>
                  </div>
                </div>}
                {/* 🧾 2026-11-24 운임 내역 — 운임구분 · 기본 운임 · 지게차 · 특수운임 항목 · 최종 운임(청구운임은 숨길 수 있다) */}
                {(() => {
                  const won = (n) => `${Math.round(n).toLocaleString()}원`;
                  const delta = (n) => (n ? <span style={{ color: n > 0 ? "#2D4C82" : "#B4342A" }}>{n > 0 ? "+" : "−"}{Math.abs(Math.round(n)).toLocaleString()}</span> : <span style={{ color: "#B7C2D3" }}>·</span>);
                  const th = { fontSize: 12.5, fontWeight: 800, color: "#5B6B85", padding: "9px 12px", background: "#F5F7FB", borderBottom: "1px solid #E3E8F0", textAlign: "center", whiteSpace: "nowrap", verticalAlign: "middle" };
                  const td = { fontSize: 14, fontWeight: 700, color: "#0F1A30", padding: "10px 12px", borderBottom: "1px solid #EEF1F6", verticalAlign: "middle", whiteSpace: "nowrap" };
                  const pc = (n) => (n < 0 ? "#1D4ED8" : n > 0 ? "#DC2626" : "#7A89A3"); // 수수료 이익 빨강 · 손실 파랑(배차현황과 같게)
                  const num = { ...td, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
                  const total = { ...num, fontWeight: 900, fontSize: 15, background: "#E8EEF8", borderTop: "2px solid #0F1A30", borderBottom: "none" };
                  const totalL = { ...td, fontWeight: 900, fontSize: 15, background: "#E8EEF8", borderTop: "2px solid #0F1A30", borderBottom: "none" };
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 900, color: "#0F1A30" }}>운임 내역</span>
                        {fb.fareType && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#2D4C82", background: "#EEF3FC", borderRadius: 6, padding: "2px 8px" }}>운임구분 {ftC ? ftC.label : fb.fareType}{ftC?.st === "rule" && ftC.fee ? ` · 회사 몫 ${Math.round(ftC.fee).toLocaleString()}원` : ""}</span>}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E3E8F0" }}>
                        <thead><tr>
                          <th style={th}>항목</th><th style={th}>금액</th><th style={th}>처리</th>
                          {show.drv && <th style={th}>기사운임</th>}{show.sale && <th style={th}>청구운임</th>}
                        </tr></thead>
                        <tbody>
                          {show.base && <tr><td style={td}>기본운임</td><td style={num}>{won(fb.baseDrv)}</td><td style={{ ...td, color: "#7A89A3" }}>특수운임을 넣기 전 운임</td>{show.drv && <td style={num}>{won(fb.baseDrv)}</td>}{show.sale && <td style={num}>{won(fb.baseSale)}</td>}</tr>}
                          {fb.lines.map((l) => (
                            <tr key={l.key}><td style={td}>{l.name}</td><td style={num}>{won(l.amount)}</td><td style={{ ...td, fontWeight: 600, color: "#5B6B85" }}>{l.how}</td>{show.drv && <td style={num}>{delta(l.drv)}</td>}{show.sale && <td style={num}>{delta(l.sale)}</td>}</tr>
                          ))}
                          <tr><td style={totalL}>최종 운임</td><td style={total} /><td style={{ ...totalL, color: "#5B6B85", fontWeight: 700, fontSize: 13 }}>{fb.paid ? `회사 별도 지급 ${won(fb.paid)}` : ""}</td>{show.drv && <td style={total}>{won(fb.drv)}</td>}{show.sale && <td style={total}>{won(fb.sale)}</td>}</tr>
                          {/* 🛠 2026-11-25 수수료를 표 안 마지막 줄로(이익 빨강 · 손실 파랑) */}
                          {show.fee && <tr><td style={{ ...td, fontWeight: 900, fontSize: 15, background: "#FFF7F5" }}>수수료</td><td colSpan={2} style={{ ...td, background: "#FFF7F5", color: "#7A89A3", fontWeight: 600, textAlign: "right" }}>청구운임 − 기사운임 − 회사 별도 지급</td><td colSpan={(show.drv ? 1 : 0) + (show.sale ? 1 : 0) || 1} style={{ ...num, background: "#FFF7F5", fontWeight: 900, fontSize: 16, color: pc(fb.profit) }}>{won(fb.profit)}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
                <div style={{ border: "1px solid #E3E8F0", borderBottom: "none", display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
                  {cell("지급방식", r.지급방식)}
                  {cell("운송상태", done ? "운송완료" : (r.배차상태 || "배차완료"))}
                </div>

                </>)}
                {/* 발급처 · 확인 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 26, paddingTop: 18, borderTop: "1px dashed #CBD5E3" }}>
                  <div style={{ fontSize: 11.5, color: "#8A97AD", lineHeight: 1.7 }}>
                    본 문서는 LogisWeb 배차관리 프로그램에 등록된 배차 정보를 근거로 자동 발급되었습니다.<br />
                    {multi ? "건별 운임은 오더에 저장된 운임과 특수운임으로 자동 계산했습니다." : "문서번호로 원본 오더를 확인할 수 있습니다."}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 220 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#7A89A3", letterSpacing: "0.1em" }}>발급처</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#0F1A30", marginTop: 2, position: "relative" }}>{issuerName || "운송사"} <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "2px solid #2D4C82", borderRadius: "50%", color: "#2D4C82", fontSize: 12, fontWeight: 900, marginLeft: 6, verticalAlign: "middle" }}>(인)</span>
                      {issuerBiz?.seal && <img src={issuerBiz.seal} alt="" style={{ position: "absolute", right: -10, top: -14, width: 58, height: 58, objectFit: "contain", opacity: 0.9 }} />}</div>
                    {issuerBiz && (
                      <div style={{ fontSize: 11, color: "#5B6B85", lineHeight: 1.65, marginTop: 6 }}>
                        {[issuerBiz.bizNo && `사업자번호 ${issuerBiz.bizNo}`, issuerBiz.ceo && `대표 ${issuerBiz.ceo}`].filter(Boolean).join(" · ")}
                        {issuerBiz.addr ? <div>{issuerBiz.addr}</div> : null}
                        {(issuerBiz.phone || issuerBiz.fax) ? <div>{[issuerBiz.phone && `TEL ${issuerBiz.phone}`, issuerBiz.fax && `FAX ${issuerBiz.fax}`].filter(Boolean).join(" / ")}</div> : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center justify-between gap-2 px-6 py-3.5 border-t border-[#E3E8F0] bg-white shrink-0">
          <span className="text-[12px] font-bold text-[#8A97AD]">A4에 맞춰 저장 · 인쇄돼요. 길면 여러 장으로 나뉘고, 넓은 명세서는 가로로 저장돼요.</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={saveImage} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[#1B2B4B] text-[13px] font-black hover:border-[#2D4C82] transition"><EditableText id="misc.btn.294.이미지저장" defaultText="이미지저장" /></button>
            <button type="button" onClick={savePdf} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[#1B2B4B] text-[13px] font-black hover:border-[#2D4C82] transition">PDF저장</button>
            <button type="button" onClick={handlePrint} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black hover:bg-[#1B2B4B] transition"><EditableText id="misc.btn.298.인쇄" defaultText="인쇄" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 상차일(YYYY-MM-DD) → "8/13 (목)" 형식으로. 파싱 불가하면 원문 그대로.
export function _scheduleDateLabel(d) {
  if (!d) return "날짜 미정";
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return d;
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  return `${dt.getMonth() + 1}/${dt.getDate()} (${WD[dt.getDay()]})`;
}

/* -------------------------------------------------
   스케줄표 — 실시간배차현황/배차현황에서 여러 건을 선택 후 우클릭 →
   "스케줄표"로 열어, 어느 기사님이 어느 날짜에 이 노선(들)을 운행하는지
   날짜별/기사별로 한눈에 정리해 보여준다. 프로그램 밖에서도(업체 전달용
   등) 확인할 수 있도록 이미지/PDF 저장·인쇄·확대축소를 지원한다.
   알록달록한 배색 없이 프로그램 기본 톤(네이비/그레이)만 쓰고, 글자는
   또렷하게 굵은 글씨 위주로 구성한다.
--------------------------------------------------*/
/* --------------------------------------------------
   오더등록 캘린더 패널 — 배차관리(3파트) 등록폼 오른쪽에 있던 "TODAY" 통계
   패널 자리를 대체한다. 이번 달 달력에 현재 입력 중인 상차일/하차일을
   네이비색 동그란 표시("상"/"하")로 함께 보여주고, 달력 안에서 날짜를
   눌러 상차일·하차일을 직접 지정할 수도 있다. 공휴일/대체공휴일/명절연휴
   이름은 CustomDatePicker의 달력과 동일하게 한 줄(줄바꿈 없이)로 표시한다.
   덤으로 실시간 디지털 시계를 헤더에 넣어 데스크 시계처럼도 쓸 수 있게 했다.
--------------------------------------------------*/
// ⭐ 2026-11-02 속도 — 오더 달력 머리의 디지털 시계(매초 이 글자만 다시 그린다)
export function OrderPanelClock() {
  const [clock, setClock] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const p2 = (n) => String(n).padStart(2, "0");
  return <>{`${p2(clock.getHours())}:${p2(clock.getMinutes())}:${p2(clock.getSeconds())}`}</>;
}
export function OrderCalendarPanel({ pickupDate, dropDate, onPickupChange, onDropChange, companyName, multiMode, workDates, onToggleWorkDate, footer, variant }) {
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmt = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const parseValidDate = (s) => {
    const d = s ? new Date(s) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  };

  const [viewDate, setViewDate] = React.useState(() => parseValidDate(pickupDate) || parseValidDate(dropDate) || new Date());
  const [target, setTarget] = React.useState("pickup"); // "pickup" | "drop" — 달력 클릭 시 어느 필드에 반영할지
  // ⭐ 2026-11-02 속도 — 1초 시계를 작은 컴포넌트(OrderPanelClock)로 분리. 예전엔 매초 달력 전체(날짜칸·특수일·일정)를 다시 그려 오더 입력이 끊겼다
  const [schedules, setSchedules] = React.useState([]);

  // 휴가/외근 승인 현황(인사관리 > 출근기록부와 동일한 "schedules" 컬렉션)을 구독해서,
  // 승인 완료된 연차·외근·병가 등을 달력 날짜 칸에 함께 표시한다.
  React.useEffect(() => {
    const company = companyName || DEFAULT_COMPANY;
    const unsub = onSnapshot(collection(db, "schedules"), (snap) => {
      setSchedules(snap.docs.map(d => d.data()).filter(s => (s.companyName || DEFAULT_COMPANY) === company));
    }, () => {});
    return () => unsub();
  }, [companyName]);

  // 상차일이 바뀌면(폼에서 직접 입력해도) 그 달로 자동으로 이동해서, 별도
  // 조작 없이도 방금 고른 날짜가 바로 달력에 보이게 한다.
  React.useEffect(() => {
    const d = parseValidDate(pickupDate);
    if (!d) return;
    setViewDate((prev) => (prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth()) ? prev : d);
  }, [pickupDate]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const now = new Date();
  const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // 날짜별 승인된 휴가/외근 목록 — 날짜마다 매번 전체 스캔하지 않도록 이번 달 범위만 미리 묶어둔다.
  const leavesByDate = React.useMemo(() => {
    const map = new Map();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmt(viewYear, viewMonth, d);
      const hits = (schedules || []).filter(s =>
        s.start && dateStr >= s.start && dateStr <= (s.end || s.start) && isScheduleApproved(s)
      );
      if (hits.length) map.set(dateStr, hits);
    }
    return map;
  }, [schedules, viewYear, viewMonth, daysInMonth]);

  const goMonth = (delta) => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  // ⚠️ "오늘로 이동"을 눌렀을 때, 이미 이번 달을 보고 있는 상태(가장 흔한 경우 —
  // 상차일 기본값이 오늘이라 대부분 이미 이번 달이 떠 있음)라면 달력 화면이 그대로라
  // 눌러도 "반응이 없다"고 느껴진다. 실제로 달이 바뀌든 안 바뀌든 오늘 칸을 잠깐
  // 반짝여서(pulse) 클릭이 확실히 반영됐다는 걸 보여준다.
  const [todayPulse, setTodayPulse] = React.useState(false);
  const todayPulseTimer = React.useRef(null);
  const goToday = () => {
    const t = new Date();
    setViewDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setTodayPulse(true);
    if (todayPulseTimer.current) window.clearTimeout(todayPulseTimer.current);
    todayPulseTimer.current = window.setTimeout(() => setTodayPulse(false), 900);
  };
  React.useEffect(() => () => { if (todayPulseTimer.current) window.clearTimeout(todayPulseTimer.current); }, []);

  // ⭐ 묶음 오더(복수근무일) — 클릭할 때마다 근무일 목록에서 켜고/끄고 토글.
  // 상차일/하차일은 그 목록의 최솟값/최댓값으로 부모(toggleWorkDate)가 자동 연동한다.
  const handlePick = (dateStr) => {
    if (multiMode) { onToggleWorkDate?.(dateStr); return; }
    if (target === "pickup") onPickupChange?.(dateStr);
    else onDropChange?.(dateStr);
  };

  const workDateSet = React.useMemo(() => new Set(multiMode ? (workDates || []) : []), [multiMode, workDates]);
  const sortedWorkDates = React.useMemo(() => Array.from(workDateSet).sort(), [workDateSet]);
  const minWorkDate = sortedWorkDates[0];
  const maxWorkDate = sortedWorkDates[sortedWorkDates.length - 1];

  // 🗓 2026-11-27 사용자 요청(시안 D) — 오른쪽 "오늘 일정" 카드 안에 들어가는 사진 모양 달력.
  //  기능은 그대로: [상차일 · 하차일] 중 고른 쪽에 날짜가 들어가고, 공휴일 · 승인된 휴가 · 외근도 보인다(점 · 누르면 이름은 말풍선)
  //  색은 남색 한 계열: 상차일 = 꽉 찬 원, 하차일 = 테두리 원, 오늘 = 옅은 원
  if (variant === "deck" && !multiMode) {
    const lead = Array.from({ length: firstDay }, (_, i) => new Date(viewYear, viewMonth, i - firstDay + 1).getDate());
    const tailN = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    const pill = (on) => `flex-1 h-[34px] rounded-[10px] border text-[12.5px] font-extrabold inline-flex items-center justify-center gap-1.5 transition ${on ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#DCE3EE] text-[#1B2B4B] hover:bg-[#F5F7FB]"}`;
    return (
      <div className="kp-order-cal-deck" style={{ fontVariantNumeric: "tabular-nums" }}>
        <div className="flex items-center justify-between mb-1.5">
          <button type="button" onClick={() => goMonth(-1)} aria-label="이전 달" className="w-8 h-8 rounded-lg grid place-items-center text-[#5B6B85] hover:bg-[#F1F4F9] text-[17px]">‹</button>
          <button type="button" onClick={goToday} title="오늘로 이동" className="text-[16px] font-black text-[#0F1A30]">{viewYear}년 {viewMonth + 1}월</button>
          <button type="button" onClick={() => goMonth(1)} aria-label="다음 달" className="w-8 h-8 rounded-lg grid place-items-center text-[#5B6B85] hover:bg-[#F1F4F9] text-[17px]">›</button>
        </div>
        <div className="grid grid-cols-7">
          {["일", "월", "화", "수", "목", "금", "토"].map((w) => <div key={w} className="text-center text-[12px] font-bold text-[#8A97AD] py-1.5">{w}</div>)}
          {lead.map((d, i) => <div key={`l${i}`} className="text-center text-[12.5px] font-bold text-[#C2CBDB] py-[7px]">{d}</div>)}
          {cells.filter((d) => d != null).map((d) => {
            const dateStr = fmt(viewYear, viewMonth, d);
            const isPickup = dateStr === pickupDate, isDrop = dateStr === dropDate, isToday = dateStr === todayStr;
            const holidayName = KOREAN_HOLIDAYS[dateStr];
            const leaves = leavesByDate.get(dateStr) || [];
            const tip = [isPickup && "상차일", isDrop && "하차일", holidayName, ...leaves.map((x) => `${x.name || "직원"} ${LEAVE_TYPE_LABEL[x.type] || x.type}`)].filter(Boolean).join(" · ");
            const circle = isPickup ? "bg-[#1B2B4B] text-white" : isDrop ? "border-2 border-[#1B2B4B] text-[#1B2B4B]" : isToday ? "bg-[#EEF3FB] text-[#1B2B4B]" : holidayName ? "text-[#B4233A]" : "text-[#1B2B4B]";
            return (
              <button key={d} type="button" onClick={() => handlePick(dateStr)} title={tip || undefined} aria-label={`${viewMonth + 1}월 ${d}일${tip ? ` · ${tip}` : ""}`}
                className="relative flex flex-col items-center py-[3px] group">
                <span className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[12.5px] font-bold group-hover:ring-2 group-hover:ring-[#C9D6EC] ${circle} ${isToday && todayPulse ? "ring-4 ring-[#8FB0F0]" : ""}`}>{d}</span>
                <span className="h-[5px] flex gap-[3px] mt-[1px]" aria-hidden="true">
                  {leaves.length > 0 && <span className="w-[5px] h-[5px] rounded-full bg-[#2D4C82]" />}
                  {holidayName && <span className="w-[5px] h-[5px] rounded-full bg-[#B4233A]" />}
                </span>
              </button>
            );
          })}
          {Array.from({ length: tailN }, (_, i) => <div key={`t${i}`} className="text-center text-[12.5px] font-bold text-[#C2CBDB] py-[7px]">{i + 1}</div>)}
        </div>
        <div className="flex gap-1.5 mt-2" role="group" aria-label="달력에서 고른 날짜를 넣을 칸">
          <button type="button" onClick={() => setTarget("pickup")} aria-pressed={target === "pickup"} className={pill(target === "pickup")}>상차일{pickupDate ? ` · ${pickupDate.slice(5).replace("-", "/")}` : " 선택"}</button>
          <button type="button" onClick={() => setTarget("drop")} aria-pressed={target === "drop"} className={pill(target === "drop")}>하차일{dropDate ? ` · ${dropDate.slice(5).replace("-", "/")}` : " 선택"}</button>
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] font-bold text-[#8A97AD]">
          <button type="button" onClick={goToday} className="text-[#1B2B4B] font-extrabold hover:underline">오늘로 이동</button>
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#1B2B4B]" />상차</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-[#1B2B4B]" />하차</span>
            <span className="inline-flex items-center gap-1"><span className="w-[5px] h-[5px] rounded-full bg-[#2D4C82]" />휴가·외근</span>
            <span className="inline-flex items-center gap-1"><span className="w-[5px] h-[5px] rounded-full bg-[#B4233A]" />공휴일</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="kp-order-cal bg-white border border-[#E3E8F0] rounded-[24px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_rgba(16,24,40,0.07)] overflow-hidden flex flex-col" style={{ flex: "1 1 0%", minWidth: 240 }}>
      {/* 헤더 — 오늘 날짜 + 디지털 시계 */}
      <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ background: "linear-gradient(120deg,#0B1428,#0F1A30 50%,#1B2B4B)" }}>
        <div>
          <div className="text-[10px] text-[#8FB0F0] font-extrabold tracking-[0.28em]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>TODAY</div>
          <div className="text-[13px] text-white font-bold">{todayStr}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/50 font-semibold tracking-widest">TIME</div>
          <div className="text-[20px] font-black text-white leading-none tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>
            <OrderPanelClock />
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
        {/* ⭐ 복수근무일(묶음) 모드 — 상/하차일 대상 토글 대신, 근무일을 하나씩
            선택하는 중이라는 안내와 선택 개수/전체해제 버튼을 보여준다. */}
        {multiMode ? (
          <div className="rounded-xl py-2.5 px-3 bg-black text-white text-[12px] font-bold flex items-center justify-between shrink-0">
            <span>근무일을 클릭해 선택/해제하세요{sortedWorkDates.length ? ` (${sortedWorkDates.length}일 선택됨)` : ""}</span>
            {sortedWorkDates.length > 0 && (
              <button type="button"
                onClick={() => sortedWorkDates.forEach(d => onToggleWorkDate?.(d))}
                className="text-[11px] font-semibold text-white/70 hover:text-white underline shrink-0 ml-2">
                전체 해제
              </button>
            )}
          </div>
        ) : (
        /* 상차일/하차일 선택 대상 토글 — 누른 상태에서 달력 날짜를 클릭하면 그 필드에 반영 */
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button type="button" onClick={() => setTarget("pickup")}
            className={`rounded-xl py-2 text-[12px] font-bold border transition flex items-center justify-center gap-1.5 ${
              target === "pickup" ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}>
            <span className="w-4 h-4 rounded-full bg-white text-[#1B2B4B] text-[9px] font-black flex items-center justify-center leading-none shrink-0" style={{ opacity: target === "pickup" ? 1 : 0.6 }}>상</span>
            상차일{pickupDate ? ` · ${pickupDate.slice(5).replace("-", "/")}` : " 선택"}
          </button>
          <button type="button" onClick={() => setTarget("drop")}
            className={`rounded-xl py-2 text-[12px] font-bold border transition flex items-center justify-center gap-1.5 ${
              target === "drop" ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}>
            <span className="w-4 h-4 rounded-full bg-white text-[#1B2B4B] text-[9px] font-black flex items-center justify-center leading-none shrink-0" style={{ opacity: target === "drop" ? 1 : 0.6 }}>하</span>
            하차일{dropDate ? ` · ${dropDate.slice(5).replace("-", "/")}` : " 선택"}
          </button>
        </div>
        )}

        {/* 달력 */}
        <div className="bg-white border border-gray-100 rounded-xl p-3 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <button type="button" onClick={() => goMonth(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#1B2B4B] text-base font-bold">‹</button>
            <div className="text-[13px] font-bold text-[#1B2B4B]">{viewYear}년 {viewMonth + 1}월</div>
            <button type="button" onClick={() => goMonth(1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#1B2B4B] text-base font-bold">›</button>
          </div>
          {/* ⚠️ 요일 헤더 글씨가 너무 작아 안 보인다는 피드백 — 10px→13px, 굵게 */}
          <div className="grid grid-cols-7 gap-1 mb-1 shrink-0">
            {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
              <div key={w} className={`text-center text-[13px] font-extrabold py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 flex-1">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} />;
              const dateStr = fmt(viewYear, viewMonth, d);
              const isPickup = !multiMode && dateStr === pickupDate;
              const isDrop = !multiMode && dateStr === dropDate;
              const isWorkDate = multiMode && workDateSet.has(dateStr);
              const isWorkMin = isWorkDate && dateStr === minWorkDate;
              const isWorkMax = isWorkDate && dateStr === maxWorkDate;
              const isMarked = isPickup || isDrop || isWorkDate;
              const isToday = dateStr === todayStr;
              const dow = new Date(viewYear, viewMonth, d).getDay();
              const holidayName = KOREAN_HOLIDAYS[dateStr];
              const isSunday = dow === 0;
              const isSaturday = dow === 6;
              const numberCls = isMarked
                ? "text-white"
                : holidayName || isSunday ? "text-red-500"
                : isSaturday ? "text-blue-500"
                : "text-gray-700";
              const leaves = leavesByDate.get(dateStr) || [];
              const leaveTitle = leaves.map(s => `${s.name || "직원"} ${LEAVE_TYPE_LABEL[s.type] || s.type}`).join(", ");
              return (
                <button key={i} type="button"
                  title={[holidayName, leaveTitle].filter(Boolean).join(" · ") || undefined}
                  onClick={() => handlePick(dateStr)}
                  className={`min-h-[72px] rounded-lg text-[13px] font-semibold transition flex flex-col items-center justify-center leading-none gap-0.5 py-1 ${
                    isMarked ? (multiMode ? "bg-black" : "bg-[#1B2B4B]") :
                    isToday ? "border-2 border-[#1B2B4B]" :
                    "hover:bg-gray-100"
                  } ${isToday && todayPulse ? "ring-4 ring-emerald-300" : ""}`}
                >
                  <span className={numberCls}>{d}</span>
                  {/* ⚠️ 공휴일/대체공휴일/연휴 이름 글씨가 너무 작아 안 보인다는 피드백 —
                      7px→10px로 키우고, 굵기·색 대비를 높여 또렷하게 보이게 한다.
                      줄바꿈은 여전히 없음(한 줄, whitespace-nowrap). */}
                  {holidayName && (
                    <span className={`text-[10px] leading-none font-extrabold whitespace-nowrap ${isMarked ? "text-white" : "text-red-600"}`}>
                      {shortHolidayLabel(holidayName)}
                    </span>
                  )}
                  {/* ⭐ 상/하차일 표시 — 너무 작아 안 보인다는 피드백으로 크게(w-3→w-5) 키움 */}
                  {isMarked && !multiMode && (
                    <span className="flex gap-1">
                      {isPickup && <span className="w-5 h-5 rounded-full bg-white text-[#1B2B4B] text-[11px] font-black flex items-center justify-center leading-none shrink-0">상</span>}
                      {isDrop && <span className="w-5 h-5 rounded-full border-2 border-white text-white text-[11px] font-black flex items-center justify-center leading-none shrink-0">하</span>}
                    </span>
                  )}
                  {/* ⭐ 복수근무일(묶음) 모드 — 선택된 근무일 중 가장 빠른 날은 "상",
                      가장 늦은 날은 "하"(각각 상차일/하차일로 자동 연동되는 날짜라는 뜻),
                      그 사이 선택된 날들은 체크(✓) 표시로 근무일임을 보여준다. */}
                  {isWorkDate && (
                    <span className="flex gap-1">
                      {isWorkMin && <span className="w-5 h-5 rounded-full bg-white text-black text-[11px] font-black flex items-center justify-center leading-none shrink-0">상</span>}
                      {isWorkMax && !isWorkMin && <span className="w-5 h-5 rounded-full border-2 border-white text-white text-[11px] font-black flex items-center justify-center leading-none shrink-0">하</span>}
                      {!isWorkMin && !isWorkMax && <span className="w-5 h-5 rounded-full border-2 border-white text-white text-[11px] font-black flex items-center justify-center leading-none shrink-0">✓</span>}
                    </span>
                  )}
                  {/* ⭐ 승인된 연차/외근/병가 등 — 인사관리(출근기록부)에서 최종 승인된
                      일정만 표시. 여러 명이 겹치면 앞 2명만 보여주고 "+N"으로 요약,
                      전체 목록은 title 툴팁으로 확인 가능. */}
                  {leaves.length > 0 && (
                    <span className="flex flex-col items-center gap-[3px] mt-0.5 w-full px-0.5">
                      {leaves.slice(0, 2).map((s, li) => (
                        <span key={li}
                          className={`w-full text-center text-[11px] leading-tight font-extrabold rounded px-0.5 py-[2px] truncate ${ATTENDANCE_STATUS_COLOR[LEAVE_TYPE_LABEL[s.type] || s.type] || "bg-gray-500 text-white"}`}
                        >
                          {s.name || "직원"}·{LEAVE_TYPE_LABEL[s.type] || s.type}
                        </span>
                      ))}
                      {leaves.length > 2 && (
                        <span className={`text-[10.5px] leading-none font-extrabold ${isMarked ? "text-white/80" : "text-gray-500"}`}>+{leaves.length - 2}명</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 shrink-0">
            <button type="button" onClick={goToday} className="text-[11px] font-bold text-[#1B2B4B] hover:underline"><EditableText id="misc.btn.567.오늘로 이동" defaultText="오늘로 이동" /></button>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-400">
              {multiMode ? (
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-black" />근무일(묶음)</span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#1B2B4B]" />상차일</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-[#1B2B4B]" />하차일</span>
                </>
              )}
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-700" />휴가·외근(승인)</span>
            </div>
          </div>
        </div>
      </div>
      {/* footer가 주어지면(예: 근무일 수정 팝업의 취소/저장 버튼) 달력과 같은 카드
          안에, 구분선만 두고 붙여서 보여준다 — 굳이 카드를 따로 나눌 필요가 없다. */}
      {footer && (
        <div className="border-t border-gray-100 px-4 py-3 flex justify-end gap-2 shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}

// ⭐ 복수근무일(묶음) 오더 수정 팝업 — 등록할 때 쓰던 OrderCalendarPanel(multiMode)을
// 그대로 재사용해서, 이미 등록된 오더도 근무일을 다시 골라 수정할 수 있게 한다.
// 4파트(실시간배차현황)/5파트(배차현황)/모바일에서 공용으로 쓴다. 저장하면
// 근무일자목록 + 상차일(최솟값)/하차일(최댓값)을 함께 patchDispatch한다.
export function WorkDatesEditModal({ row, companyName, onClose, onSave, confirmEdit = false }) {
  const initWorkDates = _parseWorkDates(row?.근무일자목록);
  // ⭐ "상차일 하나 + 하차일 하나"를 그냥 순서대로 고른 것과, "근무일을 여러 날 따로
  // 골라 묶음으로 등록"하는 것은 서로 다른 조작이다. 기존엔 이 팝업이 무조건
  // 다중선택(근무일자목록) 모드였어서, 상차일·하차일을 하나씩만 골라도 "묶음 2일"로
  // 저장돼버리는 버그가 있었다. 실제로 근무일자목록이 2건 이상이었던 오더(이미
  // 묶음이었던 오더)만 다중선택 모드로 열고, 그 외(보통의 상차일~하차일 구간)는
  // 3파트 등록폼과 동일하게 "상/하차일 각각 클릭" 모드로 연다 — 다중선택은
  // 아래 "묶음(다중선택)" 버튼을 눌러야만 켜진다.
  // ⭐ 근무일자목록 길이만으로 판단하면, 예전 버그로 인해 데이터가 남아있는
  // 오더를 열었을 때 사용자가 누르지도 않았는데 묶음 모드로 켜져버릴 수 있다.
  // 이 팝업/패널로 저장한 오더는 항상 복수근무일 플래그를 명시적으로 함께
  // 저장하므로(true/false), 그 값이 있으면 그것을 최우선으로 따르고, 아예
  // 없는(과거 데이터) 경우에만 근무일자목록 길이로 추정한다.
  const initMulti = row?.복수근무일 === true ? true
    : row?.복수근무일 === false ? false
    : initWorkDates.length > 1;
  const [multiMode, setMultiMode] = React.useState(initMulti);
  const [pickupDate, setPickupDate] = React.useState(row?.상차일 || "");
  const [dropDate, setDropDate] = React.useState(row?.하차일 || "");
  const [workDates, setWorkDates] = React.useState(
    initWorkDates.length > 0 ? initWorkDates : (row?.상차일 ? [row.상차일] : [])
  );
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");

  const toggleWorkDate = (dateStr) => {
    if (!dateStr) return;
    setWorkDates(prev => {
      const set = new Set(prev);
      if (set.has(dateStr)) set.delete(dateStr); else set.add(dateStr);
      return Array.from(set).sort();
    });
  };

  const handleSave = async () => {
    setSaveError("");
    if (!multiMode && isReversedDateOrder(pickupDate, dropDate)) {
      setSaveError(REVERSED_DATE_ORDER_MSG);
      return;
    }
    // confirmEdit: 오더에 바로 저장하는 경우만 묻는다(복사/수정 패널 안의 날짜 고르기는 패널 [수정 저장]에서 묻는다)
    if (confirmEdit && !(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    setSaving(true);
    // ⚠️ 저장 응답이 영영 오지 않으면 "저장 중..."에 갇혀 아무 안내 없이 멈춰있던
    // 문제가 있었다 — 일정 시간 안에 끝나지 않으면 타임아웃 처리로 버튼을 되돌리고
    // 오류를 보여준다(실제 저장은 나중에 성공할 수도 있으니, 팝업은 닫지 않고
    // 다시 시도하게 한다). "네트워크 문제"로 단정하지 않는다 — patchDispatch는
    // knownPrev(이 행 데이터)를 넘겨받아 캐시/서버 조회 없이 즉시 진행하므로,
    // 정상적인 상황이라면 이 타임아웃은 사실상 걸릴 일이 없어야 한다.
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      setSaving(false);
      setSaveError("저장이 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
    }, 8000);
    try {
      if (multiMode) {
        if (workDates.length === 0) return;
        const sorted = [...workDates].sort();
        await onSave({
          근무일자목록: sorted,
          상차일: sorted[0],
          하차일: sorted[sorted.length - 1],
          복수근무일: true,
        });
      } else {
        if (!pickupDate || !dropDate) return;
        // 묶음이 아닌 보통 구간으로 저장 — 예전에 묶음이었다가 여기서 다시 일반
        // 구간으로 바꾼 경우까지 대비해 근무일자목록/복수근무일도 함께 비운다.
        await onSave({
          상차일: pickupDate,
          하차일: dropDate,
          근무일자목록: [],
          복수근무일: false,
        });
      }
    } catch (e) {
      if (!timedOut) setSaveError("저장에 실패했습니다. 다시 시도해주세요.");
      console.error(e);
    } finally {
      window.clearTimeout(timer);
      if (!timedOut) setSaving(false);
    }
  };

  const canSave = multiMode ? workDates.length > 0 : (!!pickupDate && !!dropDate);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[999999]" onClick={onClose}>
      <div className="w-[620px] max-w-[94vw] flex flex-col gap-2" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[14px] font-bold text-white">
            {multiMode ? "근무일 수정(묶음)" : "상/하차일 수정"}{row?.거래처명 ? ` · ${row.거래처명}` : ""}
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMultiMode(v => !v)}
              className={`text-[12px] font-bold px-2.5 py-1 rounded-lg transition ${multiMode ? "bg-black text-white" : "bg-white/15 text-white hover:bg-white/25"}`}
            >
              묶음(다중선택){multiMode ? " 켜짐" : ""}
            </button>
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
          </div>
        </div>
        <OrderCalendarPanel
          companyName={companyName}
          multiMode={multiMode}
          workDates={workDates}
          onToggleWorkDate={toggleWorkDate}
          pickupDate={multiMode ? (workDates[0] || "") : pickupDate}
          dropDate={multiMode ? (workDates[workDates.length - 1] || "") : dropDate}
          onPickupChange={setPickupDate}
          onDropChange={setDropDate}
          footer={<>
            {saveError && (
              <span className="flex-1 self-center text-[12px] font-bold text-rose-600">{saveError}</span>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"><EditableText id="misc.btn.714.취소" defaultText="취소" /></button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canSave}
              className="px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-[#1B2B4B] hover:bg-[#243a60] disabled:opacity-40"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </>}
        />
      </div>
    </div>
  );
}

// ⭐ 복수근무일(묶음 오더)의 근무일자목록을 안전하게 배열로 복원한다.
// Firestore에 저장될 때 stripUndefinedDeep이 배열을 {0:"...",1:"..."} 형태의
// 객체로 바꿔버리기 때문에(경유상차목록/경유지_상차 등 다른 배열 필드와 동일한
// 문제), onSnapshot으로 다시 읽어온 오더의 근무일자목록은 배열이 아닐 수 있다.
// 화면에서 근무일자목록을 참조하는 모든 곳은 반드시 이 함수를 거쳐야 한다.
export function _parseWorkDates(v) {
  if (Array.isArray(v)) return v.filter(Boolean).sort();
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p.filter(Boolean).sort(); } catch {}
  }
  if (v && typeof v === "object") {
    const ks = Object.keys(v);
    if (ks.length > 0 && ks.every(k => /^\d+$/.test(k)))
      return ks.sort((a, b) => Number(a) - Number(b)).map(k => v[k]).filter(Boolean).sort();
  }
  return [];
}

// 🚫 하차일이 상차일보다 빠른 "역순" 날짜 지정을 막는 공용 검사 헬퍼.
// 상차일/하차일이 둘 다 있을 때만 비교하고(하나라도 비어있으면 통과), 문자열
// 비교로 충분한 YYYY-MM-DD 형식을 그대로 사용한다. 상/하차일을 다루는 모든
// 위치(3파트 등록폼, 4/5파트 인라인수정, 오더복사/수정 패널, 근무일 수정 팝업,
// 모바일)에서 저장 직전 이 함수로 검사해야 한다.
export function isReversedDateOrder(pickup, drop) {
  return !!pickup && !!drop && String(drop) < String(pickup);
}
export const REVERSED_DATE_ORDER_MSG = "하차일은 상차일보다 빠를 수 없습니다. 날짜를 다시 확인해주세요.";
// 🛠 2026-11-24 수정 화면에서 상차일을 하차일보다 뒤로 옮기면 하차일도 같은 날로 따라간다([복사 등록] 창과 같은 규칙)
//  — 예전엔 상차일만 내일로 바꿔 저장하면 "하차일은 상차일보다 빠를 수 없습니다"로 저장이 막혀, 날짜가 안 바뀌는 것처럼 보였다
export const dropFollowsPickup = (pickup, drop) => !!pickup && !!drop && String(drop) < String(pickup);
export const withPickupDate = (p, v) => ({ ...p, 상차일: v, ...(dropFollowsPickup(v, p?.하차일) ? { 하차일: v } : {}) });

// ⭐ addDispatch/patchDispatch/submitCopyOrderPC 등은 컴포넌트 바깥(또는 DispatchApp의
// showAlert가 아직 선언되기 전)에 정의돼 있어 앱의 CustomAlert 상태(alertMsg)에 직접
// 접근할 수 없다. 그래도 브라우저 기본 alert() 대신 프로그램과 동일한 스타일의 팝업을
// 띄우기 위한 간단한 브릿지 — DispatchApp이 렌더링되면서 실제 showAlert로 교체되고,
// 그 전(아주 짧은 초기 순간)까지는 안전하게 window.alert로 대체(폴백)한다.
export let _globalShowAlert = (msg) => window.alert(msg);
export function globalShowAlert(msg) { _globalShowAlert(msg); }
// 🧩 2026-11-27 화면별 파일로 나누면서 — 다른 파일(DispatchApp)에서 브릿지를 바꿀 수 있게 setter 로(동작 같음)
export function setGlobalShowAlert(fn) { _globalShowAlert = fn; }

// 스케줄표 안에서 상세정보(기사용) 카드로 보여줄 때 쓰는 담당자 한 줄 표시.
// 이름/번호 중 있는 것만 붙이고, 번호는 항상 하이픈을 채워서 보여준다.
export function _scheduleContactLine(name, phone) {
  const n = String(name || "").trim();
  const p = String(phone || "").trim();
  if (!n && !p) return "";
  return `${n || "담당자"}${p ? ` (${formatPhone(p)})` : ""}`;
}

// ⭐ 스케줄표 "표시 항목"(청구운임/기사운임/상세정보) 다중선택 드롭다운 — 체크박스
// 3개가 툴바에 나란히 떠서 복잡해 보이던 걸 버튼 하나로 접고, 열었을 때만 그 안에서
// 체크선택/해제할 수 있게 한다. CustomDatePicker와 동일하게 fixed+portal로 띄워서
// 모달의 overflow-hidden에 잘리지 않게 한다.
export function ScheduleItemsDropdown({ items, values, onToggle }) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  const updateRect = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4 });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateRect();
    const close = () => setOpen(false);
    const onDocDown = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, updateRect]);

  const selected = items.filter((it) => values[it.key]);
  const label = selected.length === 0 ? "표시 항목 선택 안 함"
    : selected.length === items.length ? "표시 항목 전체"
    : selected.map((it) => it.label).join(", ");

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="border border-gray-300 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-gray-700 bg-white hover:bg-gray-50 max-w-[220px] truncate text-left"
      >
        {label}
      </button>
      {open && rect && createPortal(
        <div ref={menuRef} style={{ position: "fixed", left: rect.left, top: rect.top }}
          className="z-[9999999] bg-white border border-gray-200 rounded-xl shadow-2xl p-2 w-[190px]">
          {items.map((it) => (
            <label key={it.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer select-none">
              <input type="checkbox" className="w-3.5 h-3.5 accent-[#1B2B4B]" checked={!!values[it.key]} onChange={() => onToggle(it.key)} />
              <span className="text-[12px] font-semibold text-gray-700">{it.label}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export function ScheduleChartModal({ rows, companyName, authorName, onClose }) {
  const [groupBy, setGroupBy] = React.useState("date"); // "date" | "driver"
  const [showFareCharge, setShowFareCharge] = React.useState(false); // 청구운임 포함
  const [showFareDriver, setShowFareDriver] = React.useState(false); // 기사운임 포함
  const [showDetail, setShowDetail] = React.useState(false); // 상세정보(기사용) 포함
  const [zoom, setZoom] = React.useState(1);
  const [sendingKey, setSendingKey] = React.useState(null); // 현재 이미지 전송 처리중인 기사 key
  const captureRef = React.useRef(null);
  const driverRefs = React.useRef({});

  // ⭐ 경유지가 있는 오더는 스케줄표 노선 칸에 "상차지 → 경 경유지명 → 하차지"처럼
  // 원형 "경" 배지를 노선 흐름 안에 바로 표시한다 (별도 경유 뱃지/칸 없이도 한눈에 보이도록).
  const _scheduleViaName = (s) => typeof s === "string" ? s : (s?.업체명 || s?.지명 || s?.하차지명 || s?.상차지명 || s?.주소 || "");
  const getScheduleViaNames = (r) => [
    ..._parseWaypointList(r.경유상차목록 || r.경유지_상차),
    ..._parseWaypointList(r.경유하차목록 || r.경유지_하차),
  ].map(_scheduleViaName).filter(Boolean);
  const ScheduleRoute = ({ r }) => (
    <>
      {r.상차지명 || "-"}
      {getScheduleViaNames(r).map((name, vi) => (
        <React.Fragment key={vi}>
          {" → "}
          <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-amber-500 text-white text-[9px] font-extrabold align-middle mr-0.5">경</span>
          {name}
        </React.Fragment>
      ))}
      {" → "}{r.하차지명 || "-"}
    </>
  );

  // ⭐ 달력에서 특정 날짜만 골라 이미지/PDF로 저장 — 원본 rows에 실제 존재하는
  // 날짜 전체를 먼저 뽑아두고(달력 다중선택의 모집단), 선택값이 전체와 같으면
  // "필터 없음"으로 취급해 기존 동작(전체 표시)을 그대로 유지한다.
  const allScheduleDates = React.useMemo(() => {
    const set = new Set();
    for (const r of rows || []) {
      const wd = _parseWorkDates(r.근무일자목록);
      const dates = wd.length > 1 ? wd : [r.상차일 || ""];
      dates.forEach((d) => { if (d) set.add(d); });
    }
    return Array.from(set).sort();
  }, [rows]);
  const [selectedDates, setSelectedDates] = React.useState(null); // null = 전체(필터 없음)
  React.useEffect(() => { setSelectedDates(null); }, [rows]);
  const isDateFiltered = selectedDates != null;
  const activeDates = isDateFiltered ? selectedDates : allScheduleDates;
  const activeDateSet = React.useMemo(() => new Set(activeDates), [activeDates]);
  const toggleScheduleDate = (d) => {
    setSelectedDates((prev) => {
      const base = prev != null ? prev : allScheduleDates;
      const set = new Set(base);
      if (set.has(d)) set.delete(d); else set.add(d);
      return Array.from(set).sort();
    });
  };

  const dateGroups = React.useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      // ⭐ 복수근무일(묶음) 오더 — 1개의 오더가 여러 날짜에 걸쳐 근무하므로,
      // 날짜별 스케줄표에서는 근무일자목록의 모든 날짜 섹션에 각각 나타나야 한다
      // (실제 오더는 1건이지만, 그날 그 노선이 움직인다는 사실은 매일 보여야 함).
      const parsedWorkDates = _parseWorkDates(r.근무일자목록);
      const workDates = parsedWorkDates.length > 1 ? parsedWorkDates : [r.상차일 || ""];
      for (const key of workDates) {
        if (isDateFiltered && !activeDateSet.has(key)) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(r);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        list: [...list].sort((a, b) => String(a.상차시간 || "").localeCompare(String(b.상차시간 || ""))),
      }));
  }, [rows, isDateFiltered, activeDateSet]);

  // 기사별 보기에도 같은 날짜 필터가 적용되도록, 필터링된 오더 목록을 별도로 뽑아둔다.
  const filteredRows = React.useMemo(() => {
    if (!isDateFiltered) return rows;
    return (rows || []).filter((r) => {
      const wd = _parseWorkDates(r.근무일자목록);
      const dates = wd.length > 1 ? wd : [r.상차일 || ""];
      return dates.some((d) => activeDateSet.has(d));
    });
  }, [rows, isDateFiltered, activeDateSet]);

  // ⭐ 복수근무일(묶음) 오더의 근무일자목록을 "9/2, 4~5, 7~11" 형태로 압축 요약.
  // 기사별 보기에서 13일치를 13줄로 늘어놓지 않고 한 줄로 보여주기 위함.
  const _compressWorkDates = (dates) => {
    const sorted = [...(dates || [])].sort();
    if (sorted.length === 0) return "";
    const ranges = [];
    let start = sorted[0], prev = sorted[0];
    const nextDay = (d) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
    const short = (d) => d.slice(5).replace("-", "/");
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (cur && nextDay(prev) === cur) { prev = cur; continue; }
      ranges.push(start === prev ? short(start) : `${short(start)}~${short(prev)}`);
      start = cur; prev = cur;
    }
    return ranges.join(", ");
  };

  const driverGroups = React.useMemo(() => {
    const map = new Map();
    for (const r of filteredRows || []) {
      const key = `${r.이름 || "기사 미배정"}|${r.차량번호 || ""}`;
      if (!map.has(key)) map.set(key, { name: r.이름 || "기사 미배정", phone: r.전화번호 || "", car: r.차량번호 || "", list: [] });
      map.get(key).list.push(r);
    }
    return Array.from(map.values())
      .map(g => ({
        ...g,
        list: [...g.list].sort((a, b) =>
          String(a.상차일 || "").localeCompare(String(b.상차일 || "")) ||
          String(a.상차시간 || "").localeCompare(String(b.상차시간 || ""))
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows]);

  const dateRangeLabel = React.useMemo(() => {
    const dates = isDateFiltered ? [...activeDateSet].sort() : [...new Set((rows || []).map(r => r.상차일).filter(Boolean))].sort();
    if (!dates.length) return "";
    return dates.length === 1 ? _scheduleDateLabel(dates[0]) : `${_scheduleDateLabel(dates[0])} ~ ${_scheduleDateLabel(dates[dates.length - 1])}`;
  }, [rows, isDateFiltered, activeDateSet]);

  // ⭐ 총 청구운임/기사운임 — 오더 단위(filteredRows)로 합산한다. 날짜별 보기에서는
  // 복수근무일(묶음) 오더가 근무일마다 여러 날짜 섹션에 중복으로 나타나는데, 그
  // 운임은 오더 1건당 금액이지 날짜마다 새로 발생하는 금액이 아니므로 날짜별로
  // 합치면 중복 계산된다 — 실제 오더 건수 기준인 filteredRows로 합산해야 정확하다.
  const toWonNum = (v) => Number(String(v || "0").replace(/[^\d]/g, "")) || 0;
  const totalFareCharge = React.useMemo(() => (filteredRows || []).reduce((s, r) => s + toWonNum(r.청구운임), 0), [filteredRows]);
  const totalFareDriver = React.useMemo(() => (filteredRows || []).reduce((s, r) => s + toWonNum(r.기사운임), 0), [filteredRows]);

  if (!rows || rows.length === 0) return null;

  const captureCanvas = (node) => node
    ? html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true })
    : null;

  const saveImage = async () => {
    const canvas = await captureCanvas(captureRef.current);
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `스케줄표_${dateRangeLabel || "선택오더"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  // captureRef 기준 상대 offsetTop(줌/transform:scale의 영향을 받지 않는 실제 레이아웃
  // 좌표) — getBoundingClientRect는 미리보기의 확대/축소(zoom) transform이 적용된 값이라
  // html2canvas가 그리는 캔버스(줌과 무관하게 원본 크기로 렌더링됨)와 좌표계가 어긋난다.
  const offsetTopWithin = (el, ancestor) => {
    let top = 0, node = el;
    while (node && node !== ancestor) { top += node.offsetTop || 0; node = node.offsetParent; }
    return top;
  };

  // ⭐ 예전엔 캡처한 이미지를 통째로 A4 한 페이지에 폭(210mm) 기준으로만 맞춰
  // 욱여넣어서, 스케줄 기간이 길어(예: 9/2~9/14) 이미지 높이가 A4 한 페이지
  // 높이(297mm)를 넘으면 그 아래 내용이 페이지 밖으로 벗어나며 통째로 잘려서
  // PDF에 안 보이는 버그가 있었다 — 이미지 자체는 다 캡처됐는데 PDF에 담는
  // 과정에서 한 페이지만 쓰다 보니 잘린 것처럼 저장된 것. 이제 페이지 높이를
  // 넘으면 원본 캔버스를 페이지 높이 단위(px)로 나눠 여러 페이지로 이어붙인다.
  //
  // ⚠️ 처음엔 그냥 고정 픽셀 높이로 뚝뚝 잘랐는데, 그러면 표의 한 행이 하필 그
  // 경계에 걸려 반으로 잘리는 경우가 생겨(아래쪽 페이지엔 그 행의 아랫부분만
  // 남음) 글자가 칸 아래쪽에 몰려붙은 것처럼 보였다 — 실제로는 반듯하게
  // 가운데 정렬돼 있었는데 위쪽 절반이 이전 페이지에서 잘려나간 것.
  // 그래서 각 <tr>(표 행) / 카드 블록의 경계를 미리 구해두고, 페이지가 넘어가는
  // 지점을 그 중 가장 가까운(넘지 않는) 안전한 경계로 스냅해서 행이 반으로
  // 잘리는 일이 없게 한다.
  const savePdf = async () => {
    const node = captureRef.current;
    const canvas = await captureCanvas(node);
    if (!canvas) return;
    const pdf = new (await loadJsPDF())("p", "mm", "a4");
    const pdfWidth = 210;
    const pdfPageHeight = 297;
    const totalHeightMm = (canvas.height * pdfWidth) / canvas.width;

    if (totalHeightMm <= pdfPageHeight) {
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, totalHeightMm);
    } else {
      const scaleRatio = canvas.width / node.offsetWidth;
      const safeCuts = Array.from(node.querySelectorAll("tr, [data-pdf-block]"))
        .map((el) => Math.round((offsetTopWithin(el, node) + el.offsetHeight) * scaleRatio))
        .filter((v) => v > 0 && v < canvas.height)
        .sort((a, b) => a - b);

      const pageHeightPx = Math.floor((pdfPageHeight * canvas.width) / pdfWidth);
      let renderedPx = 0;
      let pageIndex = 0;
      while (renderedPx < canvas.height) {
        const naiveBreak = Math.min(renderedPx + pageHeightPx, canvas.height);
        let cut = naiveBreak;
        if (naiveBreak < canvas.height) {
          // naiveBreak를 넘지 않는 안전한 경계 중 가장 큰 값(=가장 꽉 채우는 값)을 찾는다.
          for (let i = safeCuts.length - 1; i >= 0; i--) {
            if (safeCuts[i] > renderedPx && safeCuts[i] <= naiveBreak) { cut = safeCuts[i]; break; }
          }
        }
        const sliceHeightPx = cut - renderedPx;
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, sliceHeightPx);
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        const sliceData = pageCanvas.toDataURL("image/png");
        const sliceHeightMm = (sliceHeightPx * pdfWidth) / canvas.width;
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(sliceData, "PNG", 0, 0, pdfWidth, sliceHeightMm);
        renderedPx = cut;
        pageIndex++;
      }
    }
    pdf.save(`스케줄표_${dateRangeLabel || "선택오더"}.pdf`);
  };
  const handlePrint = async () => {
    const canvas = await captureCanvas(captureRef.current);
    if (!canvas) return;
    const imgData = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>스케줄표</title><style>
      @page { size: A4; margin: 10mm; }
      body { margin:0; display:flex; justify-content:center; background:#fff; }
      img { width:100%; max-width:190mm; }
    </style></head><body><img src="${imgData}" onload="window.print()" /></body></html>`);
    w.document.close();
  };

  // 기사별 카드 하나만 이미지로 캡처해서, 가능하면 OS 공유시트(문자/카카오톡 등에
  // 이미지 그대로 첨부 가능)로 바로 전달하고, 지원 안 되는 환경(대부분의 PC 브라우저)
  // 에서는 이미지부터 저장한 뒤 그 기사 번호로 문자 앱을 열어(본문에 안내문구) 사용자가
  // 갤러리에서 이미지를 직접 첨부해 보내도록 안내한다 — 웹에서 문자 앱에 파일을
  // 프로그램적으로 첨부하는 표준 방법이 없기 때문의 현실적인 절충.
  const sendDriverImage = async (g) => {
    const key = `${g.name}|${g.car}`;
    const node = driverRefs.current[key];
    if (!node) return;
    setSendingKey(key);
    try {
      const canvas = await captureCanvas(node);
      if (!canvas) return;
      await new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(); return; }
          const fileName = `스케줄표_${g.name}.png`;
          const file = new File([blob], fileName, { type: "image/png" });
          const digits = String(g.phone || "").replace(/[^\d]/g, "");
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: "배차 스케줄표", text: `${g.name} 기사님 배차 스케줄표입니다.` });
              resolve();
              return;
            } catch (err) {
              // 사용자가 공유시트를 취소한 경우는 조용히 종료, 그 외 실패만 폴백으로 진행
              if (err?.name === "AbortError") { resolve(); return; }
            }
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = fileName;
          link.href = url;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          if (digits) {
            window.location.href = `sms:${digits}?body=${encodeURIComponent(`[${g.name} 기사님] 배차 스케줄표 이미지가 저장되었습니다. 갤러리에서 첨부해 보내주세요.`)}`;
          }
          resolve();
        }, "image/png");
      });
    } finally {
      setSendingKey(null);
    }
  };

  // table-fixed로 열 너비를 억지로 고정했더니, 좁은 칸 안에서 글자가 줄바꿈되지
  // 않고 그대로 겹쳐 보이는 문제가 있었다. 표는 원래대로 auto 레이아웃(내용 길이에
  // 맞춰 칸이 자연스럽게 늘어남) + 줄바꿈 없이 한 줄로 두고, 대신 카드/팝업 쪽을
  // 내용 너비에 맞춰 커지게(w-fit) 해서 애초에 칸이 좁아질 일이 없게 한다.
  // align-middle로 세로 정렬까지 맞춰 어떤 줄에서도 텍스트가 칸 상단에 붙어
  // 어긋나 보이지 않게 한다.
  const thCls = "border border-[#1B2B4B] px-3 py-2 font-black text-white bg-[#1B2B4B] whitespace-nowrap align-middle";
  const tdCls = "border border-[#E3E8F0] px-3 py-2 text-[#0F1A30] whitespace-nowrap align-middle";
  const showFare = showFareCharge || showFareDriver;

  // 상세정보(기사용) 카드 — 표 대신 오더 1건을 카드로 펼쳐서, 기사님이 실제로 알아야 하는
  // 정보(상/하차지 주소·담당자, 화물내용/톤수, 전달사항, 원하면 운임까지)를 한 번에 보여준다.
  // dateOverride: 날짜별 보기에서 복수근무일 오더가 특정 날짜 섹션에 펼쳐져
  // 들어올 때, 카드에는 오더의 상차일(최솟값)이 아니라 그 섹션의 날짜를 보여준다.
  const DetailCard = ({ r, dateOverride }) => {
    const pickupContact = _scheduleContactLine(r.상차지담당자, r.상차지담당자번호);
    const dropContact = _scheduleContactLine(r.하차지담당자, r.하차지담당자번호);
    const rWorkDates = _parseWorkDates(r.근무일자목록);
    const isMultiWork = rWorkDates.length > 1;
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden" data-pdf-block="1">
        <div className="bg-gray-100 px-3 py-1.5 flex items-center gap-2 border-b border-gray-200">
          <span className="text-[12px] font-extrabold text-[#1B2B4B]">
            {dateOverride ? _scheduleDateLabel(dateOverride) : isMultiWork ? _compressWorkDates(rWorkDates) : _scheduleDateLabel(r.상차일)} {r.상차시간 || "즉시"}
          </span>
          {isMultiWork && <span className="bg-black text-white text-[10px] font-extrabold rounded px-1 py-0.5 leading-none">묶음</span>}
          <span className="text-[11px] font-bold text-gray-600 ml-auto">{r.차량종류 || "-"} / {r.차량톤수 || "-"}</span>
        </div>
        <div className="px-3 py-2.5 text-[12px] space-y-1.5">
          <div className="flex gap-2">
            <span className="w-11 shrink-0 font-bold text-gray-600">상차</span>
            <div className="min-w-0">
              <div className="font-extrabold text-gray-900">{r.상차지명 || "-"}</div>
              {r.상차지주소 && <div className="text-gray-700 break-words">{r.상차지주소}</div>}
              {pickupContact && <div className="text-gray-700">담당자 {pickupContact}</div>}
            </div>
          </div>
          {getScheduleViaNames(r).length > 0 && (
            <div className="flex gap-2">
              <span className="w-11 shrink-0 font-bold text-amber-600">경유</span>
              <div className="min-w-0 space-y-0.5">
                {getScheduleViaNames(r).map((name, vi) => (
                  <div key={vi} className="flex items-center gap-1 font-semibold text-gray-700">
                    <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-amber-500 text-white text-[9px] font-extrabold shrink-0">경</span>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <span className="w-11 shrink-0 font-bold text-gray-600">하차</span>
            <div className="min-w-0">
              <div className="font-extrabold text-gray-900">{r.하차지명 || "-"}</div>
              {r.하차지주소 && <div className="text-gray-700 break-words">{r.하차지주소}</div>}
              {dropContact && <div className="text-gray-700">담당자 {dropContact}</div>}
            </div>
          </div>
          {r.화물내용 && (
            <div className="flex gap-2">
              <span className="w-11 shrink-0 font-bold text-gray-600">화물</span>
              <span className="text-gray-900 font-semibold">{r.화물내용}</span>
            </div>
          )}
          {r.전달사항 && (
            <div className="flex gap-2">
              <span className="w-11 shrink-0 font-bold text-gray-600">전달</span>
              <span className="text-gray-900 whitespace-pre-wrap break-words">{r.전달사항}</span>
            </div>
          )}
          {showFare && (
            <div className="flex gap-4 pt-1.5 mt-0.5 border-t border-gray-100">
              {showFareCharge && <span className="text-gray-800 font-bold">청구운임 {fmtWon(r.청구운임)}</span>}
              {showFareDriver && <span className="text-gray-800 font-bold">기사운임 {fmtWon(r.기사운임)}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-6">
      <div className="bg-[#F4F6FA] rounded-[26px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] w-fit max-w-[95vw] min-w-[820px] max-h-[94vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 툴바 */}
        <div className="relative flex items-center justify-between px-6 py-4 shrink-0 overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}><span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <h3 className="relative text-white"><span className="block text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DISPATCH · SCHEDULE</span><span className="text-[19px] font-black">스케줄표</span> <span className="text-white/60 font-bold text-[12.5px] ml-1">({filteredRows.length}건{isDateFiltered ? ` / 전체 ${rows.length}건` : ""})</span></h3>
          <div className="relative flex items-center gap-1.5">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/20 text-[15px] font-bold transition">−</button>
            <span className="text-white/80 text-[12px] w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/20 text-[15px] font-bold transition">+</button>
            <button type="button" onClick={onClose} className="ml-2 h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-[13px] font-bold">닫기 ✕</button>
          </div>
        </div>

        {/* 정리 기준 + 표시 항목 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 border-b border-[#E3E8F0] bg-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-gray-500">정리 기준</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button type="button" onClick={() => setGroupBy("date")}
                className={`px-3 py-1 text-[12px] font-bold transition ${groupBy === "date" ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                날짜별
              </button>
              <button type="button" onClick={() => setGroupBy("driver")}
                className={`px-3 py-1 text-[12px] font-bold transition border-l border-gray-300 ${groupBy === "driver" ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                기사별
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-gray-500">표시 날짜</span>
            <CustomDatePicker
              value={allScheduleDates[0] || ""}
              multiActive
              workDates={activeDates}
              onToggleWorkDate={toggleScheduleDate}
              onClearWorkDates={() => setSelectedDates([])}
              displayOverride={isDateFiltered ? `${activeDates.length}일 선택됨` : "전체 날짜"}
              className="border border-gray-300 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-gray-700 bg-white hover:bg-gray-50"
            />
            {isDateFiltered && (
              <button type="button" onClick={() => setSelectedDates(null)} className="text-[11px] font-bold text-[#1B2B4B] hover:underline"><EditableText id="misc.btn.1223.전체보기" defaultText="전체보기" /></button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-gray-500">표시 항목</span>
            <ScheduleItemsDropdown
              items={[
                { key: "charge", label: "청구운임 포함" },
                { key: "driver", label: "기사운임 포함" },
                { key: "detail", label: "상세정보 포함 (기사용)" },
              ]}
              values={{ charge: showFareCharge, driver: showFareDriver, detail: showDetail }}
              onToggle={(key) => {
                if (key === "charge") setShowFareCharge((v) => !v);
                else if (key === "driver") setShowFareDriver((v) => !v);
                else setShowDetail((v) => !v);
              }}
            />
          </div>
        </div>

        {/* 본문 (확대/축소 미리보기) */}
        <div className="flex-1 overflow-auto bg-[#E9EDF3] p-6">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform .15s" }}>
            <div ref={captureRef} className="bg-white mx-auto p-9 w-fit shadow-[0_10px_30px_rgba(15,26,48,0.12)]" style={{ minWidth: 720 }}>
              <div className="relative pb-4 mb-6" style={{ borderBottom: "3px solid #0F1A30" }}>
                {authorName && (
                  <div className="absolute top-0 right-0 text-[11px] font-bold text-gray-500">작성자 {authorName}</div>
                )}
                <div className="text-center">
                  <div className="text-[10px] font-extrabold tracking-[0.34em] text-[#4B6CB7]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>DISPATCH SCHEDULE</div><div className="text-[26px] font-black text-[#0F1A30] tracking-[8px] mt-1">배차 스케줄표</div>
                  <div className="text-[12px] font-semibold text-gray-500 mt-1.5">
                    {companyName ? `${companyName} · ` : ""}{dateRangeLabel} · 총 {filteredRows.length}건
                  </div>
                </div>
              </div>

              {groupBy === "date" ? (
                <div className="space-y-5">
                  {dateGroups.map((g) => (
                    <div key={g.date}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="px-3.5 py-1.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black">{_scheduleDateLabel(g.date)}</div>
                        <div className="text-[11px] font-bold text-gray-500">{g.list.length}건</div>
                      </div>
                      {showDetail ? (
                        <div className="space-y-2">
                          {g.list.map((r, i) => <DetailCard key={r._id || r.id || i} r={r} dateOverride={g.date} />)}
                        </div>
                      ) : (
                        <table className="text-[12px] border border-gray-200 border-collapse">
                          <thead>
                            <tr>
                              <th className={`${thCls} w-[64px]`}><EditableText id="schedule.table.header.상차시간" defaultText="상차시간" /></th>
                              <th className={thCls}><EditableText id="schedule.table.header.노선" defaultText="노선 (상차지 → 하차지)" /></th>
                              <th className={`${thCls} w-[72px]`}><EditableText id="schedule.table.header.기사명" defaultText="기사명" /></th>
                              <th className={`${thCls} w-[96px]`}><EditableText id="schedule.table.header.연락처" defaultText="연락처" /></th>
                              <th className={`${thCls} w-[88px]`}><EditableText id="schedule.table.header.차량번호" defaultText="차량번호" /></th>
                              <th className={`${thCls} w-[84px]`}><EditableText id="schedule.table.header.차종톤수" defaultText="차종/톤수" /></th>
                              <th className={`${thCls} w-[100px]`}><EditableText id="schedule.table.header.화물내용" defaultText="화물내용" /></th>
                              {showFareCharge && <th className={`${thCls} w-[84px]`}><EditableText id="schedule.table.header.청구운임" defaultText="청구운임" /></th>}
                              {showFareDriver && <th className={`${thCls} w-[84px]`}><EditableText id="schedule.table.header.기사운임" defaultText="기사운임" /></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {g.list.map((r, i) => (
                              <tr key={r._id || r.id || i}>
                                <td className={`${tdCls} text-center font-bold`}>{r.상차시간 || "즉시"}</td>
                                <td className={`${tdCls} font-extrabold text-[#1B2B4B]`}>
                                  <ScheduleRoute r={r} />
                                  {String(r.운행유형 || "").trim() === "왕복" && <RoundTripBadge />}<RotationBadge order={r} />
                                  {_parseWorkDates(r.근무일자목록).length > 1 && (
                                    <span className="ml-1 bg-black text-white text-[10px] font-extrabold rounded px-1 py-0.5 leading-none align-middle">묶음</span>
                                  )}
                                </td>
                                <td className={`${tdCls} text-center font-bold text-gray-900`}>{r.이름 || "-"}</td>
                                <td className={`${tdCls} text-center`}>{formatPhone(r.전화번호) || "-"}</td>
                                <td className={`${tdCls} text-center font-bold text-gray-900`}>{r.차량번호 || "-"}</td>
                                <td className={`${tdCls} text-center`}>{r.차량종류 || "-"} / {r.차량톤수 || "-"}</td>
                                <td className={`${tdCls} text-center`}>{r.화물내용 || "-"}</td>
                                {showFareCharge && <td className={`${tdCls} text-center font-bold`}>{fmtWon(r.청구운임)}</td>}
                                {showFareDriver && <td className={`${tdCls} text-center font-bold`}>{fmtWon(r.기사운임)}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {driverGroups.map((g) => {
                    const key = `${g.name}|${g.car}`;
                    return (
                      <div key={key} ref={(el) => { driverRefs.current[key] = el; }}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="px-3.5 py-1.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black">{g.name}</div>
                          <div className="text-[11px] font-bold text-gray-500">{g.car}{g.phone ? ` · ${formatPhone(g.phone)}` : ""}</div>
                          <div className="text-[11px] font-bold text-gray-500">{g.list.length}건</div>
                          {/* 캡처(html2canvas) 이미지에는 포함되지 않도록 인쇄 미리보기 밖 버튼처럼
                              보이게 두되, data-html2canvas-ignore로 실제 캡처에서도 제외한다. */}
                          <button
                            type="button"
                            data-html2canvas-ignore="true"
                            disabled={!g.phone || sendingKey === key}
                            onClick={() => sendDriverImage(g)}
                            title={g.phone ? `${g.name} 기사님에게 이 스케줄표 이미지 전송` : "등록된 연락처가 없습니다"}
                            className="ml-auto px-2.5 py-1 rounded-md bg-[#1B2B4B] text-white text-[11px] font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {sendingKey === key ? "전송 중..." : "이 기사에게 이미지 전송"}
                          </button>
                        </div>
                        {showDetail ? (
                          <div className="space-y-2">
                            {g.list.map((r, i) => <DetailCard key={r._id || r.id || i} r={r} />)}
                          </div>
                        ) : (
                          <table className="text-[12px] border border-gray-200 border-collapse">
                            <thead>
                              <tr>
                                <th className={`${thCls} w-[92px]`}>상차일</th>
                                <th className={`${thCls} w-[64px]`}>상차시간</th>
                                <th className={thCls}>노선 (상차지 → 하차지)</th>
                                <th className={`${thCls} w-[84px]`}>차종/톤수</th>
                                <th className={`${thCls} w-[100px]`}>화물내용</th>
                                {showFareCharge && <th className={`${thCls} w-[84px]`}>청구운임</th>}
                                {showFareDriver && <th className={`${thCls} w-[84px]`}>기사운임</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {g.list.map((r, i) => (
                                <tr key={r._id || r.id || i}>
                                  <td className={`${tdCls} text-center font-extrabold text-[#1B2B4B]`}>
                                    {/* ⭐ 복수근무일(묶음) 오더는 날짜 하나 대신 압축된 근무일 범위를 보여준다
                                        (예: 9/2, 4~5, 7~11) — 13일치를 13줄로 늘어놓지 않기 위함. */}
                                    {(() => {
                                      const wd = _parseWorkDates(r.근무일자목록);
                                      return wd.length > 1
                                        ? <span title={`묶음 · 근무일 ${wd.length}일`}>{_compressWorkDates(wd)}</span>
                                        : _scheduleDateLabel(r.상차일);
                                    })()}
                                  </td>
                                  <td className={`${tdCls} text-center font-bold`}>{r.상차시간 || "즉시"}</td>
                                  <td className={`${tdCls} font-bold text-gray-900`}>
                                    <ScheduleRoute r={r} />
                                    {String(r.운행유형 || "").trim() === "왕복" && <RoundTripBadge />}<RotationBadge order={r} />
                                  </td>
                                  <td className={`${tdCls} text-center`}>{r.차량종류 || "-"} / {r.차량톤수 || "-"}</td>
                                  <td className={`${tdCls} text-center`}>{r.화물내용 || "-"}</td>
                                  {showFareCharge && <td className={`${tdCls} text-center font-bold`}>{fmtWon(r.청구운임)}</td>}
                                  {showFareDriver && <td className={`${tdCls} text-center font-bold`}>{fmtWon(r.기사운임)}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 pt-3 border-t-2 border-[#1B2B4B]/20 flex items-center justify-end gap-6">
                <div className="text-[13px] font-bold text-gray-600">
                  총 건수 <span className="text-[15px] font-extrabold text-[#1B2B4B] ml-1">{filteredRows.length}건</span>
                </div>
                {showFareCharge && (
                  <div className="text-[13px] font-bold text-gray-600">
                    총 청구운임 <span className="text-[15px] font-extrabold text-[#1B2B4B] ml-1">{fmtWon(totalFareCharge)}</span>
                  </div>
                )}
                {showFareDriver && (
                  <div className="text-[13px] font-bold text-gray-600">
                    총 기사운임 <span className="text-[15px] font-extrabold text-[#1B2B4B] ml-1">{fmtWon(totalFareDriver)}</span>
                  </div>
                )}
              </div>
              {showFareCharge && (
                <div className="mt-2 text-[11px] font-bold text-gray-500 text-right">※ 상기 청구운임은 부가세 별도 금액입니다.</div>
              )}
              <div className="mt-6 pt-4 border-t border-dashed border-gray-300 text-[11px] font-semibold text-gray-500 text-center">
                본 스케줄표는 배차관리 프로그램에서 선택한 오더를 기준으로 자동 생성되었습니다.
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-white shrink-0">
          <button type="button" onClick={saveImage}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.1391.이미지저장" defaultText="이미지저장" /></button>
          <button type="button" onClick={savePdf}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition">PDF저장</button>
          <button type="button" onClick={handlePrint}
            className="px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:opacity-90 transition"><EditableText id="misc.btn.1395.인쇄" defaultText="인쇄" /></button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   일괄수정 — 실시간배차현황/배차현황에서 2건 이상 선택 후 우클릭 → "일괄수정"으로
   연다. 선택한 오더들을 한 화면에 표로 늘어놓고, 각 필드마다 맨 위 "일괄입력" 칸에
   값을 채워 "전체적용"을 누르면 선택한 오더 전부에 같은 값이 들어간다 — 오더들이
   완전히 같은 값으로 바뀌어야 할 때 쓴다. 그 아래 각 행의 칸은 따로따로 수정할 수
   있어서, 오더마다 다른 값을 넣어야 하는 "개별수정"도 같은 화면에서 한 번에
   처리하고 저장할 수 있다.
--------------------------------------------------*/
export const BULK_EDIT_FIELDS = [
  { key: "차량종류", label: "차량종류", type: "vehicle" }, // 🚚 2026-11-12 차량종류 · 톤수 추가
  { key: "차량톤수", label: "톤수", type: "text" },
  { key: "청구운임", label: "청구운임", type: "money" },
  { key: "기사운임", label: "기사운임", type: "money" },
  { key: "지급방식", label: "지급방식", type: "select", options: ["계산서", "착불", "선불", "계좌이체"] },
  { key: "배차방식", label: "배차방식", type: "select", options: ["24시", "인성", "직접배차", "24시(외부업체)", "로지스허브"] },
  { key: "메모", label: "메모", type: "text" },
  { key: "전달사항", label: "전달사항", type: "text" },
];
export function BulkEditModal({ rows, patchDispatch, onClose, onDateShift }) {
  const [edited, setEdited] = React.useState(() => {
    const init = {};
    for (const r of rows) {
      const id = r._id || r.id;
      init[id] = {};
      for (const f of BULK_EDIT_FIELDS) init[id][f.key] = r[f.key] ?? "";
      init[id].운임구분 = r.운임구분 ?? ""; init[id].운임수동 = !!r.운임수동; // ⭐ 2026-11-02 운임규칙
      init[id].콜구분 = r.콜구분 ?? ""; init[id].콜플랫폼 = r.콜플랫폼 ?? ""; // 💳 2026-11-11 IN/OUT(시험 기능)
    }
    return init;
  });
  // ⭐ 2026-11-02 운임규칙 — 규칙 사용 회사만 "운임구분" 열 + 청구운임 → 기사운임 자동
  const fareRb = useFareRules();
  // 💳 2026-11-11 IN/OUT · OUT 방식 — 여러 오더를 한 번에 OUT(외부 콜을 잡은 오더)으로 바꾼다(시험 기능이 켜진 운송사만)
  const betaBulk = useBetaOn(getTenant());
  const outOptsBulk = useCompanyDropdownOptions(OUT_KEY);
  const FIELDS = [...BULK_EDIT_FIELDS, ...(fareRb.on ? [{ key: "운임구분", label: "운임구분", type: "fare" }] : []),
    ...(betaBulk ? [{ key: "콜구분", label: "IN/OUT", type: "select", options: ["IN", "OUT"] }, { key: "콜플랫폼", label: "OUT 방식", type: "select", options: outOptsBulk }] : [])];
  const fareCell = (r, cur, key, value) => {
    const n = fareFormChange({ ...r, ...cur }, key, value, fareRb.rules, { withFee: false });
    return { ...cur, 청구운임: n.청구운임 ?? "", 기사운임: n.기사운임 ?? "", 운임구분: n.운임구분 || "", 운임수동: !!n.운임수동, ...(n.운임구분수수료율 !== undefined ? { 운임구분수수료율: n.운임구분수수료율 } : {}) };
  };
  const isFareKey = (key) => fareRb.on && (key === "청구운임" || key === "기사운임" || key === "운임구분");
  const [bulkValues, setBulkValues] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [saveProgress, setSaveProgress] = React.useState({ done: 0, total: 0 });
  const [doneCount, setDoneCount] = React.useState(null); // 저장 완료 후 "n건 수정 완료" 배너에 쓸 건수
  const closeTimerRef = React.useRef(null);
  React.useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  if (!rows || rows.length === 0) return null;

  const setCell = (id, key, value) => {
    if (isFareKey(key)) {
      const r = rows.find(x => (x._id || x.id) === id) || {};
      setEdited(prev => ({ ...prev, [id]: fareCell(r, prev[id] || {}, key, value) }));
      return;
    }
    setEdited(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };
  const applyBulk = (key) => {
    const v = bulkValues[key] ?? "";
    setEdited(prev => {
      const next = { ...prev };
      for (const r of rows) { const id = r._id || r.id; next[id] = isFareKey(key) ? fareCell(r, next[id] || {}, key, v) : { ...next[id], [key]: v }; }
      return next;
    });
  };

  // 저장을 하나씩 순서대로 반영하면(개별 patchDispatch마다 Firestore 스냅샷이
  // 그때그때 오며) 뒤에 있는 표가 한 줄씩 딱딱 끊기며 바뀌는 게 보여 지저분했다.
  // 화면 중앙에 진행 상황(몇 건 중 몇 건 완료)을 보여주는 로딩 오버레이로 가려,
  // 저장이 끝난 뒤 한 번에 자연스럽게 결과가 보이도록 한다.
  const handleSave = async () => {
    const jobs = rows.map(r => {
      const id = r._id || r.id;
      const patch = {};
      let changed = false;
      for (const f of FIELDS) {
        const newVal = edited[id]?.[f.key] ?? "";
        const oldVal = r[f.key] ?? "";
        if (String(newVal) !== String(oldVal)) { patch[f.key] = newVal; changed = true; }
      }
      if (fareRb.on && changed && String(edited[id]?.운임구분 || "")) patch.운임수동 = !!edited[id]?.운임수동; // ⭐ 2026-11-02 운임규칙
      return changed ? { id, col: r.__col, patch } : null;
    }).filter(Boolean);

    if (jobs.length === 0) { onClose(); return; }
    // ✅ 2026-11-23 수정 저장 전에 한 번 묻기(사용자 요청)
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;

    setSaveProgress({ done: 0, total: jobs.length });
    setSaving(true);
    try {
      await Promise.all(jobs.map(async (job) => {
        await patchDispatch(job.id, { ...job.patch, __col: job.col });
        setSaveProgress(p => ({ ...p, done: p.done + 1 }));
      }));
      // ⚠️ patchDispatch가 resolve되는 시점은 "Firestore에 쓰기 요청이 반영된
      // 시점"이지, 화면에 붙어있는 표(onSnapshot 구독)가 그 변경을 실제로
      // 렌더링해서 눈에 보이는 시점은 아니다 — 그 사이 짧은 시차 때문에 로딩창이
      // 사라진 뒤에도 뒤에 있는 표가 한 줄씩 바뀌는 게 보이던 문제가 있었다.
      // onSnapshot이 따라잡을 시간을 살짝 벌어준 뒤에 로딩을 닫는다.
      await new Promise(r => setTimeout(r, 500));
      setSaving(false);
      // 로딩 오버레이가 사라지자마자 곧바로 "n건 수정이 완료되었습니다" 배너를
      // 잠깐 띄운 뒤, 2초 후에 팝업을 닫는다.
      setDoneCount(jobs.length);
      closeTimerRef.current = setTimeout(onClose, 2000);
    } catch (e) {
      setSaving(false);
      window.alert("저장 중 오류가 발생했습니다.\n" + (e?.message || ""));
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/50 flex items-center justify-center p-6">
      {saving && (
        // ⚠️ 저장 중에는 뒤에 있는 표가 한 줄씩 바뀌는 게 비쳐 보이면 안 되므로
        // (완전히 다 끝나고 나서 한 번에 자연스럽게 보여야 함) 배경을 반투명이
        // 아니라 완전히 불투명하게 가린다.
        <div className="fixed inset-0 z-[9999999] bg-gray-100 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-4 w-[300px]">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1B2B4B] rounded-full animate-spin" />
            <div className="text-[14px] font-extrabold text-gray-800">저장 중입니다...</div>
            <div className="text-[13px] font-bold text-gray-600">{saveProgress.done} / {saveProgress.total}건 완료</div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1B2B4B] transition-all duration-200"
                style={{ width: `${saveProgress.total ? Math.round((saveProgress.done / saveProgress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {doneCount != null && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center pointer-events-none">
          <div className="bg-black text-white font-extrabold text-[16px] px-6 py-3.5 rounded-2xl shadow-2xl">
            {doneCount}건 수정이 완료되었습니다.
          </div>
        </div>
      )}
      {/* 🗂 2026-11-12 보기 편하게 다시 그림 — 위: 한 번에 넣기(칸마다 [전체 적용]) · 아래: 오더 카드(왼쪽 요약 + 오른쪽 칸) */}
      <div className="rounded-2xl shadow-[0_30px_80px_rgba(6,12,26,.5)] w-[min(1280px,96vw)] max-h-[92vh] flex flex-col overflow-hidden bg-[#F4F6FA]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 h-[62px] shrink-0 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="min-w-0">
            <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">BULK EDIT</div>
            <h3 className="text-[18px] font-black leading-tight"><EditableText id="bulkEdit.title" defaultText="선택 오더 일괄수정" /> <span className="text-white/60 font-semibold text-[13px] ml-1">{rows.length}건</span></h3>
          </div>
          <div className="flex items-center gap-2">
            {onDateShift && (
              <button type="button" onClick={onDateShift}
                className="px-3.5 h-9 rounded-lg bg-white/10 hover:bg-white/20 ring-1 ring-white/25 text-white text-[13px] font-bold transition flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <EditableText id="bulkEdit.날짜일괄이동" defaultText="날짜 일괄 이동" />
              </button>
            )}
            <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg font-bold transition">×</button>
          </div>
        </div>
        {(() => {
          const inp = "w-full h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#2D4C82]";
          const wide = (f) => (f.key === "메모" || f.key === "전달사항" ? "col-span-2" : "");
          // 칸 하나(일괄 입력 줄과 오더 카드가 같이 쓴다) — 함수로만 불러 입력 중 포커스가 빠지지 않는다
          const field = (f, value, onVal, r) => (
            f.type === "fare" ? <FareTypeSelect compact className="w-full" rules={fareRb.rules} value={value ?? ""} onChange={onVal} />
            : f.type === "vehicle" ? <VehicleTypePicker className={`${inp} text-left`} value={value ?? ""} onChange={onVal} placeholder="-" noneLabel="- (비움)" />
            : f.type === "select" && (f.key === "배차방식" || f.key === "지급방식") ? <CompanyOptionPicker optKey={f.key} placeholder="-" noneLabel="- (비움)" className={inp} value={value ?? ""} onChange={onVal} />
            : f.type === "select" ? <CustomSelect className={`${inp} text-left`} value={value ?? ""} onChange={(e) => onVal(e.target.value)}><option value="">-</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</CustomSelect>
            : f.type === "money" ? <input autoComplete="off" className={`${inp} text-right tabular-nums`} placeholder="0" value={value ? Number(String(value).replace(/[^\d]/g, "")).toLocaleString() : ""} onChange={(e) => onVal(e.target.value.replace(/[^\d]/g, ""))} />
            : <input autoComplete="off" className={inp} value={value ?? ""} onChange={(e) => onVal(e.target.value)} placeholder={f.key === "차량톤수" ? "예: 11톤" : ""} />
          );
          const lbl = "block text-[11px] font-extrabold text-[#5B6B85] mb-1";
          return (
            <>
              <div className="shrink-0 px-6 py-4 bg-white border-b border-[#E1E7F0]">
                <div className="flex items-baseline gap-2 mb-2.5">
                  <span className="text-[14px] font-black text-[#0F1A30]"><EditableText id="bulkEdit.table.일괄입력" defaultText="한 번에 넣기" /></span>
                  <span className="text-[12.5px] text-[#7A89A3]">값을 넣고 [전체 적용]을 누르면 아래 오더 {rows.length}건에 같은 값이 들어갑니다. 오더마다 따로 고칠 수도 있어요.</span>
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
                  {FIELDS.map((f) => (
                    <div key={f.key} className={wide(f)}>
                      <label className={lbl}><EditableText id={`bulkEdit.table.header.${f.key}`} defaultText={f.label} /></label>
                      <div className="flex gap-1.5">
                        <div className="flex-1 min-w-0">{field(f, bulkValues[f.key], (v) => setBulkValues((p) => ({ ...p, [f.key]: v })))}</div>
                        <button type="button" onClick={() => applyBulk(f.key)} className="shrink-0 h-9 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black hover:bg-[#2D4C82] transition whitespace-nowrap"><EditableText id="bulkEdit.전체적용" defaultText="전체 적용" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
                {rows.map((r, idx) => {
                  const id = r._id || r.id;
                  const dirty = FIELDS.some((f) => String(edited[id]?.[f.key] ?? "") !== String(r[f.key] ?? ""));
                  return (
                    <div key={id} className={`rounded-2xl border bg-white flex overflow-hidden ${dirty ? "border-[#2D4C82]" : "border-[#E1E7F0]"}`}>
                      <div className={`w-[250px] shrink-0 px-4 py-3 border-r border-[#EEF1F6] ${dirty ? "bg-[#EEF4FF]" : "bg-[#F9FAFC]"}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#1B2B4B] text-white text-[11px] font-black flex items-center justify-center tabular-nums">{idx + 1}</span>
                          <span className="text-[13.5px] font-black text-[#0F1A30] tabular-nums">{r.상차일 || "-"} <span className="font-bold text-[#5B6B85]">{r.상차시간 || "즉시"}</span></span>
                          {dirty && <span className="ml-auto px-1.5 h-5 inline-flex items-center rounded-full bg-[#2D4C82] text-white text-[10px] font-black">수정됨</span>}
                        </div>
                        <div className="mt-1.5 text-[13px] font-bold text-[#1B2B4B] leading-snug">{r.거래처명 || "-"}</div>
                        <div className="text-[12.5px] text-[#3A4A66] leading-snug">{r.상차지명 || "-"} → {r.하차지명 || "-"}</div>
                        <div className="mt-1 text-[12px] text-[#7A89A3]">{r.이름 || "기사 미배정"}{r.차량번호 ? ` · ${r.차량번호}` : ""}</div>
                      </div>
                      <div className="flex-1 min-w-0 px-4 py-3 grid grid-cols-4 gap-x-3 gap-y-2">
                        {FIELDS.map((f) => (
                          <div key={f.key} className={wide(f)}>
                            <label className={lbl}>{f.label}</label>
                            {field(f, f.type === "fare" ? edited[id]?.운임구분 : edited[id]?.[f.key], (v) => setCell(id, f.type === "fare" ? "운임구분" : f.key, v), r)}
                            {f.type === "fare" && <FareRuleHint form={{ ...r, ...(edited[id] || {}) }} rules={fareRb.rules} onReapply={() => { setEdited(prev => ({ ...prev, [id]: fareCell(r, prev[id] || {}, "__reapply", null) })); }} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-[#E1E7F0] bg-white shrink-0">
          <button type="button" onClick={onClose} className="px-5 h-10 rounded-xl border border-[#DCE3EE] text-[#3A4A66] text-[13.5px] font-bold hover:bg-[#F4F6FA] transition"><EditableText id="bulkEdit.취소" defaultText="취소" /></button>
          <button type="button" disabled={saving} onClick={handleSave} className="px-6 h-10 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-black hover:bg-[#2D4C82] transition disabled:opacity-50">
            {saving ? <EditableText id="bulkEdit.저장중" defaultText="저장 중..." /> : `${rows.length}건 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------
   날짜 일괄 이동 — 실시간배차현황/배차현황에서 2건 이상 선택 후 우클릭 →
   "날짜 일괄 이동"으로 연다. 거래처 쪽 일정이 통째로(예: 일주일) 밀리거나
   당겨졌을 때, 이미 등록해둔 오더들을 하나씩 고치지 않고 상차일(+선택 시
   하차일)을 한 번에 같은 일수만큼 이동시킬 수 있다.
--------------------------------------------------*/
export function _shiftDateStr(dateStr, days) {
  if (!dateStr) return dateStr;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function BulkDateShiftModal({ rows, patchDispatch, onClose }) {
  const [shiftDays, setShiftDays] = React.useState(7);
  const [shiftDrop, setShiftDrop] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveProgress, setSaveProgress] = React.useState({ done: 0, total: 0 });
  const [doneCount, setDoneCount] = React.useState(null);
  const closeTimerRef = React.useRef(null);
  React.useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  // 미리보기 — 상차일 기준으로 중복 없이 한 번씩만 보여줘서 목록이 길어지지 않게 한다.
  // 🛠 2026-11-17 Hook은 빈 목록 return 보다 먼저(순서가 바뀌면 화면 오류)
  const preview = React.useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const r of rows || []) {
      const oldD = r.상차일 || "";
      if (!oldD || seen.has(oldD)) continue;
      seen.add(oldD);
      list.push({ old: oldD, next: _shiftDateStr(oldD, shiftDays) });
    }
    return list.sort((a, b) => a.old.localeCompare(b.old));
  }, [rows, shiftDays]);
  if (!rows || rows.length === 0) return null;

  const handleApply = async () => {
    if (!shiftDays) { window.alert("이동할 일수를 입력하세요. (0은 이동이 없습니다)"); return; }
    const jobs = rows.map(r => {
      const id = r._id || r.id;
      const patch = {};
      if (r.상차일) patch.상차일 = _shiftDateStr(r.상차일, shiftDays);
      if (shiftDrop && r.하차일) patch.하차일 = _shiftDateStr(r.하차일, shiftDays);
      return Object.keys(patch).length ? { id, col: r.__col, patch } : null;
    }).filter(Boolean);
    if (jobs.length === 0) { onClose(); return; }
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;

    setSaveProgress({ done: 0, total: jobs.length });
    setSaving(true);
    try {
      await Promise.all(jobs.map(async (job) => {
        await patchDispatch(job.id, { ...job.patch, __col: job.col });
        setSaveProgress(p => ({ ...p, done: p.done + 1 }));
      }));
      // ⚠️ BulkEditModal과 동일한 이유 — onSnapshot이 표를 실제로 다시 그릴
      // 시간을 살짝 벌어준 뒤에 로딩을 닫아야 "로딩이 사라진 뒤에도 계속
      // 바뀌는" 것처럼 보이지 않는다.
      await new Promise(r => setTimeout(r, 500));
      setSaving(false);
      setDoneCount(jobs.length);
      closeTimerRef.current = setTimeout(onClose, 2000);
    } catch (e) {
      setSaving(false);
      window.alert("저장 중 오류가 발생했습니다.\n" + (e?.message || ""));
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/50 flex items-center justify-center p-6">
      {saving && (
        // ⚠️ 저장 중 뒤에 있는 표가 비쳐 보이지 않도록 완전히 불투명하게 가린다.
        <div className="fixed inset-0 z-[9999999] bg-gray-100 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-4 w-[300px]">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1B2B4B] rounded-full animate-spin" />
            <div className="text-[14px] font-extrabold text-gray-800">이동 적용 중입니다...</div>
            <div className="text-[13px] font-bold text-gray-600">{saveProgress.done} / {saveProgress.total}건 완료</div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#1B2B4B] transition-all duration-200"
                style={{ width: `${saveProgress.total ? Math.round((saveProgress.done / saveProgress.total) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      )}
      {doneCount != null && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center pointer-events-none">
          <div className="bg-black text-white font-extrabold text-[16px] px-6 py-3.5 rounded-2xl shadow-2xl">
            {doneCount}건 날짜가 이동되었습니다.
          </div>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[92vw] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-3 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold text-[15px]">날짜 일괄 이동 <span className="text-white/60 font-semibold text-[12px] ml-1">({rows.length}건)</span></h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg font-bold transition">×</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="text-[12px] text-gray-500 font-semibold leading-relaxed">
            선택한 오더들의 상차일{shiftDrop ? "·하차일" : ""}을 한 번에 같은 일수만큼 이동합니다.
            거래처 일정이 통째로 밀리거나 당겨졌을 때, 오더를 하나씩 고치지 않고 바로 반영할 수 있습니다.
          </div>
          <div>
            <label className="block text-[12px] font-bold text-gray-600 mb-1.5">이동할 일수</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShiftDays(v => v - 1)}
                className="w-9 h-9 shrink-0 rounded-lg border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 transition">−</button>
              <input autoComplete="off" inputMode="numeric"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-center text-[16px] font-extrabold text-[#1B2B4B]"
                value={shiftDays}
                onChange={(e) => setShiftDays(Number(e.target.value.replace(/[^-\d]/g, "")) || 0)}
              />
              <button type="button" onClick={() => setShiftDays(v => v + 1)}
                className="w-9 h-9 shrink-0 rounded-lg border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 transition">+</button>
            </div>
            <div className="text-[11px] text-gray-400 font-semibold mt-1">
              양수(+)는 뒤로, 음수(−)는 앞으로 이동합니다. 예: 7 = 일주일 뒤로 밀기
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none w-fit">
            <input autoComplete="off" type="checkbox" className="w-3.5 h-3.5 accent-[#1B2B4B]" checked={shiftDrop} onChange={() => setShiftDrop(v => !v)} />
            <span className="text-[12px] font-semibold text-gray-600">하차일도 함께 이동</span>
          </label>

          {preview.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">미리보기 (상차일 기준, 중복 날짜는 한 번만 표시)</div>
              <div className="border border-gray-100 rounded-lg max-h-[180px] overflow-y-auto divide-y divide-gray-50">
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                    <span className="font-semibold text-gray-500">{p.old}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-extrabold text-[#1B2B4B]">{p.next}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-white shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.1761.취소" defaultText="취소" /></button>
          <button type="button" disabled={saving} onClick={handleApply} className="px-5 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:opacity-90 transition disabled:opacity-50">
            {saving ? "적용 중..." : `${rows.length}건 이동 적용`}
          </button>
        </div>
      </div>
    </div>
  );
}

// kg/g으로 입력해도 항상 톤 단위 문자열로 통일 (예: "100kg" → "0.1톤")
export const toTonUnit = (v = "") => {
  const str = String(v ?? "").trim();
  if (!str) return "";
  const m = str.match(/^([\d.]+)\s*(kg|g|톤|ton|t)?$/i);
  if (!m) return str;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return str;
  const unit = (m[2] || "톤").toLowerCase();
  let tons;
  if (unit === "kg") tons = num / 1000;
  else if (unit === "g") tons = num / 1000000;
  else tons = num;
  let formatted = tons.toFixed(3).replace(/\.?0+$/, "");
  if (formatted === "" || formatted === "-") formatted = "0";
  return `${formatted}톤`;
};

// ⭐ 2026-10-29 오더복사/수정 패널 전용 — 라벨을 입력칸 왼쪽에 두어(세로 → 가로) 패널 높이를 절반 가까이 줄인다.
// ⭐ 지금 입력 중인 칸(클릭·Tab 이동)은 줄 전체를 네이비로 강조 — 라벨 굵게 + 왼쪽 막대 + 밑줄 두껍게
export const CpField = ({ label, children }) => (
  <div className="group relative grid grid-cols-[118px_minmax(0,1fr)] items-center gap-2 min-h-[40px] -mx-2 px-2 rounded-lg transition-colors focus-within:bg-[#EEF3FC]">
    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#2D4C82] opacity-0 group-focus-within:opacity-100 transition-opacity" />
    <div className="text-[13.5px] font-bold text-[#5B6B85] flex items-center gap-1 leading-tight whitespace-nowrap group-focus-within:text-[#0B1428] group-focus-within:font-black">{label}</div>
    <div className="min-w-0">{children}</div>
  </div>
);
// ⭐ 2026-11-02 칸 구분이 흐리다는 의견 — 밑줄(연한 1px) → 테두리 박스형(칸마다 또렷하게). 입력 중이면 네이비 테두리 + 링
export const cpInputStyle =
  "w-full h-9 border border-[#C9D5EA] rounded-lg px-2.5 py-1.5 text-[14.5px] font-bold text-gray-900 bg-[#F9FBFE] hover:border-[#9FB2D3] focus:outline-none focus:bg-white focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 focus:text-[#0B1428] disabled:bg-[#F1F4F9] disabled:text-gray-500 transition";

// ⭐ 2026-11-05 기사명·전화번호 — 등록 기사와 매칭돼 잠긴 칸 옆에 [수정] 버튼(src/DriverEditChoice.jsx)
//  variant "cp": 오더 복사/수정 패널(CpField 가로형) · "modal": 수정 창(라벨 위 세로형)
//  target/setTarget: 그 화면의 오더 상태(copyTarget/editTarget) · de: useDriverEditChoice()
export function DriverNamePhoneEdit({ variant = "cp", target, setTarget, de, drivers }) {
  const plate = target?.차량번호 || "";
  const sameList = driversOfPlate(drivers, plate);
  const registered = sameList.length > 0;
  const editing = de.editing;
  // ⭐ 2026-11-05 같은 차량번호 기사가 여러 명(별도 추가 등)이면 칩으로 바로 바꿔 고른다
  const chips = (!editing && sameList.length > 1) ? (
    <SamePlateChips drivers={drivers} plate={plate} name={target?.이름} phone={target?.전화번호}
      onPick={(d) => setTarget((p) => ({ ...p, 이름: d.이름 || "", 전화번호: formatPhone(d.전화번호 || ""), 배차상태: !p?.배차상태 || p.배차상태 === "배차중" ? "배차완료" : p.배차상태 }))} />
  ) : null;
  const cur = { 차량번호: plate, 이름: target?.이름 || "", 전화번호: target?.전화번호 || "" };
  const onKey = (e) => { if (editing && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); de.finish(cur); } };
  const btn = (registered || editing) ? (
    <DriverEditButton compact={variant === "cp"} editing={editing}
      onEdit={() => de.begin(cur)}
      onDone={() => de.finish(cur)}
      onRevert={() => { const o = de.revert(); if (o) setTarget((p) => ({ ...p, 이름: o.이름, 전화번호: o.전화번호 })); }} />
  ) : null;
  const nameInput = (cls) => (
    <input autoComplete="off" data-driver-field="name" className={cls} value={target?.이름 ?? ""} readOnly={!editing}
      placeholder={editing ? "기사명" : ""}
      onKeyDown={onKey}
      onChange={(e) => { const v = e.target.value; setTarget((p) => ({ ...p, 이름: v })); }} />
  );
  const phoneInput = (cls) => (
    <input autoComplete="off" data-driver-field="phone" className={cls} value={formatPhone(target?.전화번호 ?? "")} readOnly={!editing}
      placeholder={editing ? "010-0000-0000" : ""} inputMode="tel"
      onKeyDown={onKey}
      onChange={(e) => { const v = formatPhone(e.target.value); setTarget((p) => ({ ...p, 전화번호: v })); }} />
  );
  if (variant === "modal") {
    const cls = `border p-2 rounded w-full ${editing ? "bg-white border-[#2D4C82] ring-2 ring-[#8FB0F0]/40" : "bg-gray-100"}`;
    return (
      <div className="mb-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label>기사명</label>{nameInput(cls)}</div>
          <div>
            <label>전화번호</label>
            <div className="flex items-center gap-1.5">{phoneInput(cls)}{btn}</div>
          </div>
        </div>
        {editing && <p className="mt-1 text-[12px] text-[#2D4C82] font-semibold">이름·전화번호를 고친 뒤 [완료]를 누르면 기사관리에 반영할 방법을 고를 수 있습니다.</p>}
        {chips && <div className="mt-1.5">{chips}</div>}
        {de.modal}
      </div>
    );
  }
  const cls = `${cpInputStyle} ${editing ? "!bg-white !border-[#2D4C82] ring-2 ring-[#8FB0F0]/40" : "!bg-[#F1F4F9]"}`;
  return (
    <>
      <CpField label="기사명">{nameInput(cls)}</CpField>
      <CpField label="전화번호">
        <div className="flex items-center gap-1.5">{phoneInput(cls)}{btn}</div>
      </CpField>
      {chips && <div className="col-span-3 pl-[126px]">{chips}</div>}
      {de.modal}
      {editing && <div className="col-span-3 pl-[126px] text-[12px] text-[#2D4C82] font-semibold">이름·전화번호를 고친 뒤 [완료](또는 저장)를 누르면 기사관리에 반영할 방법을 고를 수 있습니다.</div>}
    </>
  );
}

export const todayStr = () => {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
};

// 화주사(PC/모바일) 등록 오더 중 "등록일" 필드가 없던(과거 등록분) 경우를 위한 폴백 —
// createdAt(serverTimestamp)에서 날짜만 뽑아 대신 보여준다.
export const displayRegDate = (row) => {
  if (row?.등록일) return row.등록일;
  const ts = row?.createdAt;
  const ms = ts?.seconds ? ts.seconds * 1000 : (typeof ts === "number" ? ts : 0);
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/* -------------------------------------------------
   안전 로컬 저장
--------------------------------------------------*/
export const safeLoad = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; } };
export const safeSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
// 화주사 수정요청 팝업에서 필드명을 사람이 읽기 쉬운 라벨로 표시하기 위한 매핑
export const EDIT_REQUEST_FIELD_LABELS = {
  청구운임: "금액", 상차일: "상차일자", 하차일: "하차일자",
  상차시간: "상차시간", 하차시간: "하차시간", 차량종류: "차량종류", 차량톤수: "차량톤수",
  화물내용: "화물내용", 지급방식: "지급방식", 배차방식: "배차방식", 파렛트사: "파렛트사",
  상차지명: "상차지", 하차지명: "하차지", 상차지주소: "상차지 주소", 하차지주소: "하차지 주소",
  상차지담당자: "상차지 담당자", 하차지담당자: "하차지 담당자",
  상차지담당자번호: "상차지 담당자 연락처", 하차지담당자번호: "하차지 담당자 연락처",
  전달사항: "전달사항", 요청차량: "요청차량", 추가정보: "추가정보",
};
// ⭐ 매출관리(손익보고서/YearlySummaryChart)에서 "총 운송료"와 별도로 "순수 운송료"를
// 구분해서 보여주는 기능 — 원래는 예전 운송사 전용으로 "후레쉬물류"/"채석강" 거래처명을
// 코드에 직접 박아 판별했는데, 이 프로그램은 여러 운송사가 함께 쓰기 때문에 회사마다
// 그 대상 거래처가 다를 수 있다. 그래서 거래처관리에서 거래처별로 체크하는
// "순수매출제외" 플래그로 판별하도록 일반화한다. 아직 한 번도 체크박스를 저장한
// 적 없는 기존 데이터(주로 예전 운송사)는 예전 하드코딩 이름으로 폴백해서 동작이
// 그대로 유지되게 한다 — 거래처관리에서 체크박스를 명시적으로 켜거나 끄는 순간
// 그 거래처는 폴백 대신 저장된 값을 따른다.
export const LEGACY_NET_REVENUE_EXCLUDED_NAMES = ["후레쉬물류", "채석강"];
// ⭐ 오더의 거래처명이 항상 "기본거래처"에 똑같은 이름으로 등록되어 있는 건 아니다
// (예: "채석강-더담"처럼 하차지거래처에만 그 이름으로 등록된 경우) — 그래서
// 기본거래처에 정확히 일치하는 이름이 없으면 하차지거래처에서도 찾아본다. 예전
// 하드코딩(레거시)은 이름에 "채석강"이 부분적으로만 들어가도 걸렸기 때문에(예:
// "채석강-더담"도 "채석강"을 포함), 그 레거시를 실제로 끄려면 정확히 그 이름과
// 일치하는 기본거래처 "또는" 하차지거래처 문서에 명시적으로 체크가 되어 있어야 한다.
export function isNetRevenueExcludedClient(name, clientsList, placesList) {
  const n = String(name || "").trim();
  if (!n) return false;
  const foundClient = (clientsList || []).find((c) => String(c.거래처명 || "").trim() === n);
  if (foundClient && typeof foundClient.순수매출제외 === "boolean") return foundClient.순수매출제외;
  const foundPlace = (placesList || []).find((p) => String(p.업체명 || "").trim() === n);
  if (foundPlace && typeof foundPlace.순수매출제외 === "boolean") return foundPlace.순수매출제외;
  return LEGACY_NET_REVENUE_EXCLUDED_NAMES.some((x) => n.includes(x));
}
export function getNetRevenueExcludedNames(clientsList, placesList) {
  const names = new Set();
  (clientsList || []).forEach((c) => {
    const nm = (c.거래처명 || "").trim();
    if (nm && isNetRevenueExcludedClient(nm, clientsList, placesList)) names.add(nm);
  });
  (placesList || []).forEach((p) => {
    const nm = (p.업체명 || "").trim();
    if (nm && isNetRevenueExcludedClient(nm, clientsList, placesList)) names.add(nm);
  });
  return Array.from(names);
}

// ⭐ 성능 최적화용 — isNetRevenueExcludedClient는 매번 clients/places 배열을
// find()로 스캔해서 O(거래처 수)가 드는데, 매출관리처럼 수천 건의 오더를 한 건씩
// 이 함수로 필터링하는 화면에서는 그게 O(오더 수 × 거래처 수)로 불어나 렉의 주범이
// 된다. clients/places가 바뀔 때 딱 한 번만 이름→플래그 Map을 만들어두면, 이후
// 오더 한 건당 조회는 O(1)로 끝난다. (기본거래처 플래그가 하차지거래처보다
// 우선한다는 isNetRevenueExcludedClient의 규칙과 동일하게, clients를 나중에 덮어써
// 우선순위를 맞춘다.)
export function buildNetRevenueExclusionLookup(clientsList, placesList) {
  const map = new Map();
  (placesList || []).forEach((p) => {
    const nm = String(p.업체명 || "").trim();
    if (nm && typeof p.순수매출제외 === "boolean") map.set(nm, p.순수매출제외);
  });
  (clientsList || []).forEach((c) => {
    const nm = String(c.거래처명 || "").trim();
    if (nm && typeof c.순수매출제외 === "boolean") map.set(nm, c.순수매출제외);
  });
  return (name) => {
    const n = String(name || "").trim();
    if (!n) return false;
    if (map.has(n)) return map.get(n);
    return LEGACY_NET_REVENUE_EXCLUDED_NAMES.some((x) => n.includes(x));
  };
}

// 거래처/상하차지별로 "기사전달용" 복사 시 자동으로 함께 붙는 주의사항 문구.
// 실제 값은 clients/places 문서의 기사전달주의사항 필드에 저장되며(오더메모와
// 동일한 저장 구조 재사용), 여기서는 그 값이 아직 없을 때 편집 팝업에 채워줄
// 기본 템플릿만 정의한다. 업체별 전용 하드코딩 문구는 없다 — 모든 업체가
// 동일하게 이 템플릿으로 시작해 사용자가 직접 채워 저장해야 한다.
export const defaultDriverNoticeTemplate = (name) => {
  const n = (name || "").trim();
  if (!n) return "";
  return `[${n} 주의사항]\n- `;
};

// ⭐ 위 기본 템플릿은 수정 팝업을 열면 실제 입력값(state)으로 미리 채워지기 때문에,
// 사용자가 내용을 안 채우고 그대로 저장해도 "[업체명 주의사항]\n- " 그 자체가 값으로
// 저장돼버린다. 그 상태에서 기사전달용 복사를 하면 빈 템플릿째로 끼어드는 문제가
// 있어, 헤더 줄과 빈 불릿(- 만 있는 줄)을 제외하고 실제 글자가 하나도 없으면
// "내용 없음"으로 취급한다.
export const _hasRealDriverNotice = (text) => {
  const t = String(text || "");
  if (!t.trim()) return false;
  const stripped = t
    .split("\n")
    .filter((line) => !/^\s*\[.*주의사항\]\s*$/.test(line))
    .join("\n")
    .replace(/^[\s\-•·]+$/gm, "")
    .trim();
  return stripped.length > 0;
};

// 경유지 필드는 "경유상차목록"/"경유지_상차"/"경유지상차"처럼 여러 동의어 필드명으로 저장되고
// 문자열(JSON)/배열 형태가 뒤섞여 있어, 단순 String() 비교로는 실제로 안 바뀐 경우도
// "[object Object]" 같은 값으로 오탐되어 표시된다. 두 방향(상차/하차)을 하나로 묶어
// 사람이 읽을 수 있는 요약 문자열로 정규화한 뒤에만 비교한다.
export const PICKUP_VIA_KEYS = ["경유상차목록", "경유지_상차", "경유지상차"];
export const DROP_VIA_KEYS = ["경유하차목록", "경유지_하차", "경유지하차"];
export const normalizeViaList = (v) => {
  let arr = v;
  if (typeof arr === "string" && arr.trim().startsWith("[")) {
    try { arr = JSON.parse(arr); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => s && String(s.업체명 || "").trim());
};
export const getViaFromObj = (obj, keys) => {
  for (const k of keys) {
    const norm = normalizeViaList(obj?.[k]);
    if (norm.length) return norm;
  }
  return [];
};
export const viaSummary = (list) => list.map((s) => s.업체명).filter(Boolean).join(", ");

// 화주사가 배차완료 전 오더를 직접 수정하면(승인 불필요, 즉시반영) history에 기록되고
// 최종수정출처="shipper"가 찍힌다 — 이 최근(48시간 이내) 직접수정 여부를 판단한다.
export const isRecentShipperEdit = (o) => {
  if (o?.최종수정출처 !== "shipper") return false;
  if (o?.최종수정확인) return false; // 운송사가 이미 "확인"을 눌러 처리한 수정건
  const ts = typeof o.최종수정일시 === "number" ? o.최종수정일시 : (o.최종수정일시?.seconds ? o.최종수정일시.seconds * 1000 : 0);
  return !!ts && (Date.now() - ts) < 1000 * 60 * 60 * 48;
};
// 배차완료 전 화주사 직접수정 안내 팝업에서 "확인"을 누르면, 이 건에 대해
// 다시 "수정" 배지가 뜨지 않도록 확인 처리한다(수정요청처럼 승인/거절이 필요한 건 아니므로
// 필드는 그대로 두고 확인 여부만 기록한다).
export const acknowledgeShipperEditPC = async (order) => {
  const ref = doc(db, order.__col || "orders", order._id || order.id);
  await updateDoc(ref, { 최종수정확인: true }).catch(() => {});
};
// 화주사의 직접수정(승인요청이 아닌 즉시반영건) 최근 변경내용을 history에서 추출 — 같은 저장
// 시점(at)에 함께 기록된 항목들만 하나의 변경묶음으로 간주한다.
export const getRecentHistoryDiff = (order) => {
  const hist = Array.isArray(order?.history) ? order.history.filter((h) => h && h.field) : [];
  if (hist.length === 0) return [];
  const maxAt = Math.max(...hist.map((h) => h.at || 0));
  return hist
    .filter((h) => Math.abs((h.at || 0) - maxAt) < 5000)
    .map((h) => ({ field: h.field, label: EDIT_REQUEST_FIELD_LABELS[h.field] || h.field, before: h.before, after: h.after }));
};

export const getEditRequestDiff = (order) => {
  const pending = order?.수정요청데이터 || {};
  const viaKeySet = new Set([...PICKUP_VIA_KEYS, ...DROP_VIA_KEYS]);
  const diffs = Object.entries(pending)
    .filter(([k, v]) => !IGNORE_HISTORY_FIELDS.has(k) && !viaKeySet.has(k) && String(order[k] ?? "") !== String(v ?? ""))
    .map(([k, v]) => ({ field: k, label: EDIT_REQUEST_FIELD_LABELS[k] || k, before: order[k], after: v }));

  [{ keys: PICKUP_VIA_KEYS, label: "경유지(상차)" }, { keys: DROP_VIA_KEYS, label: "경유지(하차)" }].forEach(({ keys, label }) => {
    const beforeStr = viaSummary(getViaFromObj(order, keys));
    const afterStr = viaSummary(getViaFromObj(pending, keys));
    if (beforeStr !== afterStr) {
      diffs.push({ field: keys[0], label, before: beforeStr || "없음", after: afterStr || "없음" });
    }
  });

  return diffs;
};
// 화주사의 "배차취소 요청" 승인/거절 — 승인 시 즉시 삭제하지 않고 소프트 취소(상태: "취소")로
// 전환해 화주사/운송사 양쪽의 "배차취소" 목록에 남아 재등록할 수 있게 한다.
// (모듈 최상위 스코프에 둬야 여러 하위 컴포넌트에서 prop 없이 바로 호출할 수 있다 —
//  useRealtimeCollections 안에 두면 그 훅을 호출하는 컴포넌트에서만 접근 가능해 ReferenceError가 난다.)
// 화주사의 배차취소 요청을 승인하면, 그 오더는 이제 화주사의 "배차취소" 목록에만 남아야
// 한다 — 운송사 배차현황/실시간배차현황에는 배차상태가 "배차취소"인 오더가 존재하면 안 되므로,
// 운송사 쪽 원본은 상태만 바꾸지 않고 아예 삭제한다(화주사 사본에는 취소 상태를 그대로 반영).
export const approveCancelRequestPC = async (order) => {
  const ref = doc(db, order.__col || "orders", order._id || order.id);
  const patch = {
    상태: "취소",
    배차상태: "배차취소",
    취소요청: false,
    취소요청사유: deleteField(),
    취소거절: false,
    취소처리: "승인",
    취소처리일시: serverTimestamp(),
    updatedAt: Date.now(),
  };
  // 💸 2026-11-25 이미 지급한 오더 — 장부의 지급 기록은 남고 "지급 후 취소"로 표시된다고 먼저 알린다(지급 칸은 화주사 사본에 쓰지 않는다)
  const _pg = paidEditGuard(order, { 상태: "취소", 배차상태: "배차취소" }, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  if (_pg.warn && !(await kpConfirm(_pg.warn, { title: "이미 지급한 오더예요", okText: "취소 승인", cancelText: "닫기" }))) return false;
  // 연동 화주사에게 전송된 사본이 있으면(운송사가 등록/전송한 오더), 취소 상태는
  // 화주사 사본에만 남기고 운송사 쪽 원본은 삭제한다.
  if (order._transmittedOrderId) {
    await updateDoc(doc(db, "orders", order._transmittedOrderId), patch).catch((e) =>
      console.error("화주사 전송사본 취소승인 동기화 오류:", e)
    );
    logOrderDeletion(ref.parent.id, ref.id);
    await deleteDoc(ref);
  } else {
    // 화주사가 직접 등록한 오더(사본 없음) — 이 문서 자체가 화주사의 유일한 기록이므로
    // 삭제하지 않고 취소 상태만 반영한다.
    await updateDoc(ref, { ...patch, ..._pg.extra });
  }
};
export const rejectCancelRequestPC = async (order) => {
  const ref = doc(db, order.__col || "orders", order._id || order.id);
  const patch = {
    취소요청: false,
    취소거절: true,
    취소거절일시: serverTimestamp(),
    취소처리: "거절",
    취소처리일시: serverTimestamp(),
  };
  await updateDoc(ref, patch);
  if (order._transmittedOrderId) {
    updateDoc(doc(db, "orders", order._transmittedOrderId), patch).catch((e) =>
      console.error("화주사 전송사본 취소거절 동기화 오류:", e)
    );
  }
};

// AdminMenu.jsx의 mapOrderForShipper와 동일한 규칙 — 톤수 문자열에 이미 단위가 있으면
// 그대로, 없으면 톤수타입(기본 "톤")을 붙인다.
export const combineTonStringDA = (r) => {
  const ton = (r.차량톤수 || "").toString().trim();
  if (!ton) return "";
  if (/톤|kg|킬로/.test(ton)) return ton;
  const unit = (r.톤수타입 || "톤").trim();
  return `${ton}${unit}`;
};

// 거래처명 매칭용 공백/대소문자 무시 정규화 (오더복사 등으로 기존 오더에서 그대로
// 복사된 거래처명이 실제 저장값과 공백만 다른 경우에도 연동 화주사를 정확히 찾기 위함)
export const normalizeCompanyKey = (s = "") =>
  String(s).normalize("NFC").replace(/\s+/g, "").toLowerCase();

// approvedShippers(연동 승인된 화주사 목록)는 onSnapshot으로 비동기 로딩되는 컴포넌트 state라,
// 페이지 로드 직후(리스트가 아직 채워지기 전) 곧바로 오더를 등록/복사등록하면 실제로는
// 연동되어 있어도 로컬 배열이 비어있어 매칭에 실패 — 화주사 전송이 조용히 통째로 누락되는
// 문제가 있었다("운송사엔 9건인데 화주사엔 8건"). 로컬에서 못 찾았을 때 실시간으로 한 번 더
// 확인하는 안전장치.
export const findApprovedShipperLive = async (myCompanyName, targetCompanyName) => {
  try {
    const snap = await getDocs(collection(db, "companyApplications"));
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.linkedTransportCompany?.companyName === myCompanyName && a.transportApprovalStatus === "approved");
    return list.find((a) => normalizeCompanyKey(a.companyName) === normalizeCompanyKey(targetCompanyName)) || null;
  } catch (e) {
    console.error("연동 화주사 실시간 조회 실패:", e);
    return null;
  }
};

// 운송사가 연동 승인된 화주사의 거래처명으로 오더를 등록하면, AdminMenu.jsx의 수동
// "화주사 전송"과 동일한 매핑으로 화주사가 볼 수 있는 사본을 즉시 생성한다.
// (모듈 최상위 스코프 — useRealtimeCollections 안의 addDispatch에서 호출된다)
export const autoTransmitToShipper = async (savedRecord, shipperApp) => {
  if (savedRecord?.블라인드 === true) return; // ★ 블라인드 오더는 화주사에도 전송하지 않는다
  let myCompanyCode = "";
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const meSnap = await getDoc(doc(db, "users", uid));
      myCompanyCode = meSnap.exists() ? (meSnap.data().companyCode || "") : "";
    }
  } catch {}

  const effectiveCompanyName = savedRecord.companyName || "";
  const payload = {
    거래처명: shipperApp.companyName,
    shipperCompany: shipperApp.companyName,
    company: effectiveCompanyName,
    companyCode: myCompanyCode,
    운송사명: effectiveCompanyName,
    운송사코드: myCompanyCode,
    작성자: auth.currentUser?.email || "",
    상차지명: savedRecord.상차지명 || "",
    상차지주소: savedRecord.상차지주소 || "",
    상차담당자명: savedRecord.상차지담당자 || "",
    상차담당자번호: savedRecord.상차지담당자번호 || "",
    하차지명: savedRecord.하차지명 || "",
    하차지주소: savedRecord.하차지주소 || "",
    하차담당자명: savedRecord.하차지담당자 || "",
    하차담당자번호: savedRecord.하차지담당자번호 || "",
    등록일: savedRecord.등록일 || savedRecord.상차일 || "",
    상차일: savedRecord.상차일 || "",
    상차시간: savedRecord.상차시간 || "",
    상차시간구분: savedRecord.상차시간기준 || "정각",
    하차일: savedRecord.하차일 || "",
    하차시간: savedRecord.하차시간 || "",
    하차시간구분: savedRecord.하차시간기준 || "정각",
    차량종류: savedRecord.차량종류 || "",
    차량톤수: combineTonStringDA(savedRecord),
    상차방법: savedRecord.상차방법 || "",
    하차방법: savedRecord.하차방법 || "",
    지급방식: savedRecord.지급방식 || "",
    화물내용: savedRecord.화물내용 || "",
    화물단위: savedRecord.화물타입 || "",
    청구운임: fkNum(savedRecord.청구운임), // 🛠 2026-11-25 "500,000"처럼 쉼표 있는 금액도 — 예전엔 Number()라 화주사 사본 청구운임이 0이 됐다
    차량번호: savedRecord.차량번호 || "",
    이름: savedRecord.이름 || "",
    전화번호: savedRecord.전화번호 || "",
    배차상태: savedRecord.차량번호 ? "배차완료" : "배차중",
    경유상차목록: Array.isArray(savedRecord.경유상차목록) ? savedRecord.경유상차목록 : (Array.isArray(savedRecord.경유지_상차) ? savedRecord.경유지_상차 : []),
    경유하차목록: Array.isArray(savedRecord.경유하차목록) ? savedRecord.경유하차목록 : (Array.isArray(savedRecord.경유지_하차) ? savedRecord.경유지_하차 : []),
    source: "transport_transmit",
    originCol: savedRecord.__col || "dispatch",
    originId: savedRecord._id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const newDocRef = await addDoc(collection(db, "orders"), payload);
  await updateDoc(doc(db, savedRecord.__col || "dispatch", savedRecord._id), {
    _transmittedToShipper: shipperApp.companyName,
    _transmittedOrderId: newDocRef.id,
    _transmittedAt: Date.now(),
  });
};

// "오더 복사/수정 패널"의 "복사 등록" 공용 로직 — 원본 오더 필드를 그대로 복사해
// 새 오더를 생성한다. 원본에 화주사 전송 포인터(_transmittedOrderId 등)가 있어도
// 반드시 제거해야 한다: 그대로 이어받으면 (1) 새로 만든 복사본은 autoTransmitToShipper가
// 호출되지 않아 화주사 화면에 전혀 나타나지 않고, (2) 나중에 복사본을 삭제할 때
// removeDispatch가 원본의 화주사 사본 id로 착각해 원본 쪽 화주사 사본을 대신 지워버린다.
// (모듈 최상위 스코프 — RealtimeStatus/DispatchStatus/UnassignedStatus 등 여러 하위
// 컴포넌트의 "복사 등록" 버튼에서 공통으로 호출되므로 approvedShippers를 인자로 받는다.)
// ⭐ 2026-11-06 배차 유형 — 혼적·왕복을 고르지 않았으면 독차가 기본(화면 표시·저장 모두 같은 기준)
export const dokchaOn = (p) => p?.독차 === true || (!p?.혼적 && String(p?.운행유형 || "").trim() !== "왕복");
// 🛠 2026-11-24 묶음(여러 근무일) 오더를 복사할 때 — 원본의 근무일 목록이 그대로 딸려 가서 새 오더가 "오늘 외 2일"처럼 예전 날짜를 달고 등록됐다.
//  근무일 목록을 새 상차일에 맞춰 같은 간격으로 옮기고(하차일 = 마지막 근무일), 묶음이 아니면 목록을 비운다
export const copyWorkDatesFor = (src, pickup, drop) => {
  const wd = _parseWorkDates(src?.근무일자목록);
  if (!wd.length) return {};
  const multi = src?.복수근무일 === true ? true : src?.복수근무일 === false ? false : wd.length > 1;
  if (!multi || wd.length < 2) return { 근무일자목록: [], 복수근무일: false };
  if (wd[0] === pickup && wd[wd.length - 1] === drop) return { 근무일자목록: wd, 복수근무일: true };
  const delta = Math.round((new Date(`${pickup}T00:00:00`) - new Date(`${wd[0]}T00:00:00`)) / 86400000);
  if (!Number.isFinite(delta)) return { 근무일자목록: [], 복수근무일: false };
  const moved = wd.map((s) => _shiftDateStr(s, delta));
  return { 근무일자목록: moved, 복수근무일: true, 하차일: moved[moved.length - 1] };
};
// 🛠 2026-11-24 [복사 등록] 창이 처음에 보여 줄 날짜 — 패널에서 상차일 · 하차일을 원본과 다르게 바꿨을 때만 그 날짜로 시작한다
//  (안 바꿨으면 예전처럼 오늘 · orig가 없으면 = 원본을 못 찾았으면 오늘 · 새 오더 등록은 orig를 {}로 넘겨 패널 날짜 그대로)
export const copyInitDatesOf = (target, orig) => {
  if (!target?.상차일 || !orig) return null;
  if (String(target.상차일 || "") === String(orig.상차일 || "") && String(target.하차일 || "") === String(orig.하차일 || "")) return null;
  return { 상차일: target.상차일, 하차일: target.하차일 || target.상차일 };
};
export const submitCopyOrderPC = async (copyTarget, approvedShippers, cargoOverride, opts = {}) => {
  // ⭐ 지난 날짜 오더를 복사 등록하면 오늘 날짜로(하차일도 같은 간격만큼 함께 이동) — 오늘·앞날짜는 그대로
  // 🛠 2026-11-24 "몇 건 복사?" 창에서 직접 고른 날짜(opts.keepDates)는 지난 날짜여도 그대로 — 예전엔 어제 날짜를 골라도 말없이 오늘로 등록됐다
  let _pickup = copyTarget.상차일 || todayStr();
  let _drop = copyTarget.하차일 || _pickup;
  if (!opts.keepDates && _pickup < todayStr()) {
    const gap = Math.max(0, Math.round((new Date(`${_drop}T00:00:00`) - new Date(`${_pickup}T00:00:00`)) / 86400000)) || 0;
    _pickup = todayStr();
    const d = new Date(`${_pickup}T00:00:00`); d.setDate(d.getDate() + gap);
    _drop = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (isReversedDateOrder(_pickup, _drop)) {
    globalShowAlert(REVERSED_DATE_ORDER_MSG);
    return false;
  }
  const newId = crypto.randomUUID();
  const payload = {
    ...copyTarget,
    _id: newId,
    id: newId, // ★ 2026-10-29: 원본(모바일 등록)의 id가 그대로 복사되면 모바일에서 원본·복사본이 같은 오더로 겹쳐 보였다
    화물내용: cargoOverride ?? (copyTarget.화물내용 || ""),
    독차: dokchaOn(copyTarget), // ⭐ 2026-11-06 혼적·왕복이 아니면 독차(기본)
    완료회차: 0, // 회전 운행 진행상황은 새 오더에서 처음부터
    // 복사/수정 패널에서 상차일/하차일을 수정했다면 그 값을 그대로 존중한다 — 무조건
    // 오늘 날짜로 덮어쓰면 사용자가 다른 날짜로 바꿔서 등록해도 조용히 오늘로 저장되어
    // 화주사(연동 사본)와 운송사 원본이 모두 의도한 날짜와 다르게 등록되는 문제가 있었다.
    상차일: _pickup,
    하차일: _drop,
    ...copyWorkDatesFor(copyTarget, _pickup, _drop),
    등록일: todayStr(),
    // 복사 등록도 "새로 등록"하는 행위이므로, 원본이 모바일에서 만들어졌더라도
    // 이 복사본은 지금 실제로 등록하는 기기(PC) 기준으로 다시 표시한다.
    등록기기: "PC",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    배차상태: copyTarget?.차량번호?.trim() ? "배차완료" : "배차중",
    업체전달상태: "미전달",
    // 전달사항은 패널을 열람하는 동안엔 항상 원본 그대로 보여주고(수정과 동일하게),
    // 실제로 "복사 등록"으로 새 오더를 만드는 이 시점에만 고정 여부를 확인한다 —
    // 고정을 켜둔 채로 복사한 경우에만 새 오더에도 전달사항이 함께 넘어간다.
    // 📝 2026-11-09 전달사항은 "고정"을 안 켜도 항상 복사본에 넘어간다(모바일 복사와 같게)
    전달사항: copyTarget.전달사항 || "",
  };
  delete payload.화물수량;
  delete payload.화물타입;
  delete payload.톤수값;
  delete payload.톤수타입;
  delete payload._transmittedOrderId;
  delete payload._transmittedToShipper;
  delete payload._transmittedAt;
  delete payload._owner;
  delete payload._gsheetSync; // ★ 원본의 구글시트 줄 연결값이 복사본에 딸려가면 원본 줄을 덮어쓰거나 지웠다
  SHEET_LINK_FIELDS.forEach((k) => { delete payload[k]; }); // ⭐ 2026-11-17 구글시트 실시간 연동(JY)의 줄 주소(이전출처)도 같다 — 복사본은 같은 탭에 자기 줄로 들어간다
  // 🧹 2026-11-09 원본의 운행·지급 진행값(기사 수락/완료, 상차완료, 지급완료, 수정이력)이 복사본에 딸려가면
  //  새 오더가 처음부터 "운송완료·지급완료"로 보였다 — 복사본은 새 운행으로 시작
  ["기사확인상태", "기사확인일시", "기사확인값", "상차완료일시", "하차완료일시", "기사완료일시", "배차확정일시", "배차확정자", "배차완료일시",
    "지급상태", "지급일", "지게차지급완료", "지게차지급일", "history", "최종수정자", "취소처리일시",
    "지급액", "지급액기록일", "지급조정액", "지급조정일", "지급후취소", "지급명세서ID", "외부지급", "지급부가세", "운임변경"].forEach((k) => { delete payload[k]; }); // 💸 2026-11-25 지급한 금액 기록도 복사하지 않기(외부지급 = 외부 특수운임 지급 기록 포함)
  // 📎 2026-11-12 첨부 · 증빙 · 정산 진행값은 복사하지 않는다 — 예전엔 원본의 첨부 개수(attachCount)만 딸려 와서
  //  복사본에 첨부 "1"이 떠 있는데 눌러 보면 아무것도 없었다(파일은 원본 오더에만 있다). 복사본은 첨부 없이 · 미청구로 시작
  ["attachCount", "officeAttach", "attachViewed", "업로드잠금", "업로드잠금해제만료", "재업로드완료알림", "업로드토큰", "업로드토큰발급",
    "증빙수", "계산서스캔", "입금증빙", "계산서일", "청구메모", "입금상태", "입금일", "입금자명", "입금처리자", "입금거래id", "입금메모", "지급알림",
    "전표발행이력"].forEach((k) => { delete payload[k]; });
  if ("상태" in copyTarget) payload.상태 = payload.배차상태;
  if (payload.배차상태 === "배차완료") {
    payload.배차완료일시 = Date.now();
    payload.배차확정일시 = serverTimestamp();
    payload.배차확정자 = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "";
  }
  // 👤 2026-11-09 배차담당자 — 복사 창에서 고른 사람(처음엔 원본 담당자 그대로)
  if (copyTarget._owner) applyOwner(payload, copyTarget._owner);
  // 👤 2026-11-12 차량배정자를 직접 고른 경우 그 사람으로(안 골랐으면 위처럼 지금 복사한 사람)
  delete payload._assignerSet;
  if (copyTarget._assignerSet) { if (String(copyTarget.배차확정자 || "").trim()) payload.배차확정자 = String(copyTarget.배차확정자).trim(); else delete payload.배차확정자; }
  // 💬 2026-11-08 알림톡은 화면에서 뺐다 — 복사본은 보내지 않고, 원본 발송 결과도 넘기지 않는다
  payload.알림톡 = false;
  delete payload._알림톡;
  delete payload.알림톡결과;

  const col = copyTarget.__col || "orders";
  await setDoc(doc(db, col, newId), payload);

  if (!copyTarget.source) {
    (async () => {
      let matchedShipper = (approvedShippers || []).find(
        (a) => normalizeCompanyKey(a.companyName) === normalizeCompanyKey(payload.거래처명)
      );
      if (!matchedShipper) {
        matchedShipper = await findApprovedShipperLive(payload.companyName, payload.거래처명);
      }
      if (matchedShipper) {
        autoTransmitToShipper({ ...payload, _id: newId, __col: col }, matchedShipper).catch((e) =>
          console.error("자동 화주사 전송 실패:", e)
        );
      }
    })();
  }
};

// ⭐ 2026-11-06 [복사 등록] — "몇 건 복사?" 창(건마다 상차일·하차일, 처음엔 모두 오늘) → 그 수만큼 submitCopyOrderPC
//   (지난 날짜 → 오늘, 화주사 전송 포인터 제거 등 submitCopyOrderPC 규칙은 그대로) · 취소/실패면 false, 성공이면 건수
export const submitCopyOrdersPC = async (copyTarget, approvedShippers, cargoOverride, orig) => {
  // 👤 2026-11-12 패널에서 배차담당자를 골랐으면 "몇 건 복사?" 창도 그 사람으로 시작
  const plan = await askCopyDates({ order: copyTarget?._owner && !copyTarget._owner.orig ? applyOwner({ ...copyTarget }, copyTarget._owner) : copyTarget, title: "복사 등록", dates: copyInitDatesOf(copyTarget, orig), sub: `${copyTarget?.거래처명 || ""} ${copyTarget?.상차지명 ? `· ${copyTarget.상차지명} → ${copyTarget.하차지명 || ""}` : ""}`.trim() || undefined });
  if (!plan || !plan.length) return false;
  let n = 0;
  for (const d of plan) {
    const ok = await submitCopyOrderPC({ ...copyTarget, 상차일: d.상차일, 하차일: d.하차일, ...(d.담당자 ? { _owner: d.담당자 } : {}) }, approvedShippers, cargoOverride, { keepDates: true });
    if (ok === false) return n ? n : false;
    n += 1;
  }
  return n;
};
/* -------------------------------------------------
   ○ 수정이력 제외 필드
--------------------------------------------------*/
export const IGNORE_HISTORY_FIELDS = new Set([
  "history",
  "updatedAt",
  "createdAt",
  "lastUpdated",
  "__system",
  "__col", // Firestore에 실제 저장되는 필드가 아니라 클라이언트가 붙이는 컬렉션 라우팅용 태그일 뿐이므로 이력 대상 아님
  "배차상태",
  "이름",
  "전화번호",
  // 화주사확인대기/배차중전환일시는 배차요청 승인이라는 "상태 전환"일 뿐,
  // 실제 오더 내용 수정이 아니므로 수정이력/"운송사 수정" 표시 대상에서 제외한다.
  "화주사확인대기",
  "배차거절",
  "배차거절일시",
  "배차중전환일시",
  // 경유지 필드는 값이 배열/객체라 사람이 읽을 수 없는 "[object Object]" 형태로
  // 이력에 남고, 두 필드명(경유상차목록/경유지_상차 등)을 서로 동기화하는 내부 로직
  // 때문에 실제 변경이 없어도 이력이 남는 경우가 있어 애초에 추적 대상에서 제외한다.
  "경유상차목록",
  "경유하차목록",
  "경유지_상차",
  "경유지_하차",
  "경유지상차",
  "경유지하차",
]);
// 🟪 2026-11-16 구글시트(운송사 칸)와 다른 배차방식을 프로그램에서 고른 오더 — 프로그램 값 우선 · 칸을 보라색으로
export const sheetWayDiff = (o) => !!o && !!o.이전출처 && Array.isArray(o._programKeys) && o._programKeys.includes("배차방식")
  && !(typeof o._sheetWayRaw === "string" && o._sheetWayRaw.replace(/\s+/g, "") === String(o.배차방식 || "").replace(/\s+/g, "")); // ⭐ 2026-11-19 시트 칸에 같은 글(전국특송)이 적혀 있으면 보라색 아님(규칙상 "24시"로 읽혀도)
export const SHEET_DIFF_STYLE = { background: "#EDE4FF", borderColor: "#8B5CF6", color: "#5B21B6", fontWeight: 800 };
export const sheetWayTitle = (o) => `구글시트 운송사: ${o?._sheetBase?.배차방식 || "-"} · 프로그램 값(${o?.배차방식 || "-"})을 씁니다`; // 🧭 2026-11-16 상단바 [내 메뉴] 하나로(메일 · 알림 · 내 정보 · 원격 지원)

// 기사전달용 업로드 링크 단축 — /upload?id=...&t=... (길고 낯설어 기사들이 거부감을
// 느낄 수 있는 형태)를 /u/{code} 형태로 줄인다. code는 토큰에서 파생시켜, 같은
// 오더/토큰으로 여러 번 복사해도 항상 같은 링크가 나오게 한다(중복 문서는 덮어쓰기).
// 📋 기사복사 문구 치환 값(copyVarsOf)은 src/driverCopyText.js 로 옮김(모바일과 같이 씀)
// 📋 기사복사용 업로드 링크(오더별 토큰) 발급 — 업로드 완료로 잠긴 토큰이면 새로 발급
// ⭐ 2026-11-08 보안 — 토큰 발급 시각(업로드토큰발급)도 남긴다(서버가 30일 뒤 만료 처리 · 만료 2일 전부터 새로 발급)
export function issueUploadUrl(r) {
  const { token, patch } = ensureUploadToken(r);
  if (patch) {
    // 같은 클릭에서 두 번 불려도(문구 + 공유 링크) 같은 토큰이 나오게 화면 데이터에도 바로 반영
    try { Object.assign(r, patch); } catch { /* 고칠 수 없는 객체면 무시 */ }
    updateDoc(doc(db, r.__col || "dispatch", r._id), patch).catch(() => {}); // 🛠 2026-11-16 오더가 있는 컬렉션에(예전엔 늘 dispatch)
    if (r._transmittedOrderId) {
      updateDoc(doc(db, "orders", r._transmittedOrderId), patch).catch(() => {});
    } else if (r.originCol && r.originId) {
      updateDoc(doc(db, r.originCol, r.originId), patch).catch(() => {});
    }
  }
  return buildShortUploadUrl(r._id, token);
}
export function buildShortUploadUrl(orderId, token) {
  // 🔒 2026-11-27 짧은 링크 코드를 8자 → 20자로(예전 8자는 맞혀 보기로 남의 업로드 링크를 찾을 수 있었다). 이미 보낸 8자 링크는 그대로 열린다.
  const code = String(token || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  setDoc(doc(db, "shortLinks", code), { id: orderId, t: token, createdAt: serverTimestamp() }, { merge: true }).catch(() => {});
  return `${window.location.origin}/u/${code}`;
}

/* -------------------------------------------------
   가로 스크롤 테이블 안에서도 잘리지 않는 호버 툴팁
   (position:fixed + portal로 body에 직접 그려서, 조상의
   overflow-x-auto가 overflow-y까지 auto로 만들어 버리는 것을 피한다)
--------------------------------------------------*/
export function HoverInfoTrigger({ label, tooltipRows, className }) {
  const [pos, setPos] = React.useState(null);

  // 툴팁이 떠 있는 동안 테이블을 스크롤하면(가로/세로 모두) 마우스는 그대로인데
  // 내용만 밑으로 지나가버려 위치가 안 맞는 툴팁이 남을 수 있어, 스크롤 시 닫는다.
  React.useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [pos]);

  return (
    <>
      <span
        className={className}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          // ⭐ 표 아래쪽(특히 마지막 행 근처)에서 마우스를 올리면 툴팁이 뷰포트
          // 바깥(브라우저 창 밑)으로 잘려 보이던 문제 — 아래쪽 여백이 부족하면
          // 트리거 위쪽으로 펼치도록 방향을 바꾼다. 좌우도 화면 밖으로 안 나가게 clamp.
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUp = spaceBelow < 170;
          const left = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90);
          setPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, left, openUp });
        }}
        onMouseLeave={() => setPos(null)}
      >
        {label}
      </span>
      {pos && createPortal(
        <div
          className="pointer-events-none fixed z-[99999] w-max"
          style={{ top: pos.top, left: pos.left, transform: `translate(-50%, ${pos.openUp ? "-100%" : "0"})` }}
        >
          <div className="bg-gray-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl leading-5 border border-gray-700">
            {tooltipRows}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// 기사 메모 팝업 표시 여부. 블랙 등급은 별도의 blackAlert 팝업이 항상(무조건) 뜨므로
// 여기서는 관여하지 않는다 — 일반/직영/지입 등급은 거래처관리와 달리 기본값이 꺼짐이라,
// 사용자가 기사수정 팝업에서 명시적으로 켠(팝업표시 === true) 경우에만 메모 팝업을 띄운다.
export function shouldShowDriverMemoAlert(d) {
  return !!(d && d.메모 && String(d.메모).trim() && d.팝업표시 === true);
}

// 브라우저 기본 <select>의 옵션 목록은 OS/브라우저가 직접 그려서 CSS로 꾸밀 수
// 없다 — 프로그램 전체 톤(네이비 강조, 둥근 모서리, 그림자)과 어울리도록 직접
// 구현한 대체 드롭다운. <select>와 동일하게 value/onChange/className/children
// (<option>)을 그대로 받아 기존 코드를 최소한만 바꿔도 되도록 만들었다 — onChange는
// 네이티브 select와 똑같이 { target: { value } } 형태로 호출한다.
// CustomDatePicker(공휴일 표시 포함)는 모바일과 공유하기 위해 별도 파일로 분리했다.

// 상/하차지명 라벨 옆 오더메모 아이콘 버튼 — 배차관리 등록 폼과 동일한 디자인을
// 오더복사/수정 패널, 선택수정 패널에서도 재사용한다.
// hasMemo가 true면(이 상/하차지에 등록된 오더메모가 있으면) 아이콘 자체를 앰버
// 색으로 확실히 바꾸고, 거기에 더해 우측 상단에 작은 점 배지를 얹어 천천히
// 깜빡이게 한다 — 색 변화 하나만으로는(특히 아이콘이 작을 때) 구분이 잘 안
// 되던 문제라, "색이 다르다" + "깜빡이는 배지가 있다" 두 가지 신호를 같이 준다.
export function OrderMemoIconButton({ onClick, title = "오더메모", hasMemo = false, size = 24 }) {
  return (
    <button type="button" tabIndex={-1} onClick={onClick}
      className={`relative inline-flex transition ${hasMemo ? "text-amber-600 hover:opacity-80" : "text-[#1B2B4B] hover:opacity-70"}`}
      title={hasMemo ? `${title} (등록됨)` : title}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M9 13h6" /><path d="M9 17h6" />
      </svg>
      {hasMemo && (
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white"
          style={{ animation: "cancelSlowBlink 1.6s ease-in-out infinite" }}
        />
      )}
    </button>
  );
}

// 상/하차지 담당자 라벨 옆 담당자선택 아이콘 버튼 — 등록된 거래처의 담당자 목록
// 팝업(contactPopup)을 수동으로 열기 위한 진입점.
export function ContactPickerIconButton({ onClick, title = "담당자 선택" }) {
  return (
    <button type="button" tabIndex={-1} onClick={onClick}
      className="text-[#1B2B4B] hover:opacity-70 transition" title={title}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </button>
  );
}

// ⭐ 오더복사/수정 패널용 — 거래처의 담당자 목록(이름 또는 번호가 있는 것만, 이름 중복 제거)
export function uniqueContactsOf(place) {
  const list = (Array.isArray(place?.contacts) ? place.contacts : []).filter(c => c && (String(c.name || "").trim() || String(c.phone || "").trim()));
  const flat = (!list.length && (place?.담당자 || place?.담당자번호 || place?.연락처)) ? [{ name: place.담당자 || "", phone: place.담당자번호 || place.연락처 || "", isPrimary: true }] : [];
  const all = list.length ? list : flat;
  return [...new Map(all.map(c => [String(c.name || "").trim() || String(c.phone || ""), c])).values()];
}
export const nameKeyOf = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();

// 상/하차지 오더메모 보기·수정 팝업 — 배차관리 등록 폼의 orderMemoPopup과 동일한
// UI를 오더복사/수정 패널, 선택수정 패널에서도 재사용한다. 저장은 즉시 반영하지
// 않고(onSave로 넘긴 값을 패널 자체의 상태에만 임시로 담아두고) 실제 오더가
// 등록/수정되는 시점에만 함께 반영되도록, 호출하는 쪽에서 저장 시점을 결정한다.
export function OrderMemoModal({ type, name, memo, popupShow, notice, onCancel, onSave }) {
  const [localMemo, setLocalMemo] = React.useState(memo || "");
  const [localShow, setLocalShow] = React.useState(popupShow !== false);
  // 기사전달주의사항이 아직 한 번도 저장된 적 없으면(undefined) 빈 칸 대신
  // 기본 템플릿을 채워둔다 — 반찬단지는 기존 하드코딩 문구가 그대로 기본값이 된다.
  const [localNotice, setLocalNotice] = React.useState(notice !== undefined ? notice : defaultDriverNoticeTemplate(name));
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]">
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white text-[15px] font-bold">{type === "pickup" ? "상차지" : "하차지"} 오더메모</h3>
            <p className="text-white/55 text-[12px] mt-0.5">{name}</p>
          </div>
          <button onClick={onCancel} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <textarea
            ref={imeFocusRef}
            rows={5}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
            placeholder="이 거래처를 상/하차지명에 입력할 때마다 안내 팝업으로 뜰 메모"
            value={localMemo}
            onChange={(e) => setLocalMemo(e.target.value)}
          />
          <div>
            <div className="text-[13px] font-semibold text-gray-700 mb-1.5">기사전달주의사항</div>
            <div className="text-[11px] text-gray-500 mb-1.5">이 상/하차지가 포함된 오더를 "기사전달용"으로 복사할 때 자동으로 함께 붙습니다</div>
            <textarea
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] resize-none"
              placeholder="예: 안전화 착용 필수"
              value={localNotice}
              onChange={(e) => setLocalNotice(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
            <div>
              <div className="text-[13px] font-semibold text-gray-700">등록 시 오더메모/등급 팝업 표시</div>
              <div className="text-[11px] text-gray-500 mt-0.5">꺼두면 이 거래처를 어디서 입력하든 오더메모·등급 안내 팝업이 뜨지 않습니다</div>
            </div>
            <button type="button"
              onClick={() => setLocalShow(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${localShow ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localShow ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.2591.취소" defaultText="취소" /></button>
          <button onClick={() => onSave(localMemo, localShow, localNotice)}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.2593.저장" defaultText="저장" /></button>
        </div>
      </div>
    </div>
  );
}
export const KP_MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
// 🏢 부서 모드 메뉴 — 경리·회계(test) / 인사관리자(hrManager)
// ⚡ 2026-11-13 거래명세서 미리보기 줄 — 한 달 수백 줄을 한꺼번에 그리면 정산관리를 열 때 2초 넘게 멈췄다
//  화면에는 처음 80줄만 그리고 [나머지 펼치기]로 모두 본다. 인쇄 · PDF · 엑셀 · 메일 첨부는 화면(#invoiceArea)을 그대로 쓰므로
//  내보내기 직전에 expandInvoicePreview()로 전부 펼친 뒤 진행한다(합계 줄은 언제나 전체 기준)
export const INVOICE_PREVIEW_ROWS = 80;
export let _invoiceExpand = null;
export async function expandInvoicePreview() { if (_invoiceExpand) await _invoiceExpand(); }
export const _invoiceFit = new Set();
export async function captureInvoiceFull(fn) {
  const undo = [..._invoiceFit].map((f) => f());
  try { await new Promise((r) => requestAnimationFrame(() => r())); return await fn(); }
  finally { undo.forEach((u) => u && u()); }
}
export function InvoicePreviewRows({ mapped, rows, onOpen, docTd, docNum, DOC, won, form }) {
  // 🧾 2026-11-16 거래처 양식(form) — 고른 칸만 · 고른 순서로, 세액 칸은 끌 수 있다
  const cols = visibleCols(form);
  const tax = form?.tax !== false;
  const span = 1 + cols.length + (tax ? 3 : 1);
  const [full, setFull] = React.useState(false);
  const key = mapped.length ? `${mapped.length}|${mapped[0]?.idx}|${mapped[0]?.상차일}|${mapped[mapped.length - 1]?.상차일}` : "";
  React.useEffect(() => { setFull(false); }, [key]);
  const fullRef = React.useRef(full); fullRef.current = full;
  React.useEffect(() => {
    _invoiceExpand = () => new Promise((res) => { if (fullRef.current || mapped.length <= INVOICE_PREVIEW_ROWS) return res(); setFull(true); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 30))); });
    return () => { _invoiceExpand = null; };
  }, [mapped.length]);
  const list = full ? mapped : mapped.slice(0, INVOICE_PREVIEW_ROWS);
  return (
    <>
      {list.map((m, i) => (
        <tr key={m.idx} className="cursor-pointer hover:bg-[#F4F6FA]" onClick={() => onOpen(rows[i])} title="클릭하여 상세보기">
          <td style={{ ...docTd, color: DOC.mute, fontFamily: DOC.mono }}>{m.idx}</td>
          {cols.map((c) => <td key={c.k} style={c.mono ? { ...docTd, fontFamily: DOC.mono, whiteSpace: "nowrap" } : c.small ? { ...docTd, fontSize: 10.5, whiteSpace: "nowrap" /* ⭐ 2026-11-17 (3차) 차량번호는 한 줄(경기82자 / 9732 처럼 끊기지 않게) */ } : docTd}>{m[c.k]}</td>)}
          <td style={{ ...docNum, fontWeight: 700 }}>{won(m.공급가액)}</td>
          {tax && <td style={{ ...docNum, color: DOC.sub }}>{won(m.세액)}</td>}
          {tax && <td style={{ ...docNum, fontWeight: 900 }}>{won(m.공급가액 + m.세액)}</td>}
        </tr>
      ))}
      {!full && mapped.length > INVOICE_PREVIEW_ROWS && (
        <tr data-html2canvas-ignore="true">
          <td colSpan={span} style={{ ...docTd, padding: "10px 6px" }}>
            <button type="button" onClick={() => setFull(true)} style={{ height: 34, padding: "0 16px", borderRadius: 9, border: "1px solid #C9D5EA", background: "#fff", color: "#1B2B4B", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>나머지 {(mapped.length - INVOICE_PREVIEW_ROWS).toLocaleString()}줄 펼치기 (전체 {mapped.length.toLocaleString()}줄 · 합계는 전체 기준)</button>
          </td>
        </tr>
      )}
    </>
  );
}

// ⭐ 선택삭제 확인(2026-10-27 리디자인) — 실시간배차현황·배차현황·미배차현황 공용. 한 줄 요약 목록 + 합계, 남색 계열만
export function KpDeleteConfirm({ rows = [], note = "삭제 후에도 되돌리기로 복구할 수 있습니다", onCancel, onConfirm }) {
  const list = rows.filter(Boolean);
  const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}`;
  const sum = profitTotals(list); // 🛠 2026-11-25 줄 수수료와 같은 식(청구 − 기사 − 지게차·특수운임 회사 지급분) · "500,000" 같은 글자 금액도 — 예전엔 Number()라 쉼표 있는 금액이 0이 됐다
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#0F1A30]/45 backdrop-blur-[2px]"
      tabIndex={-1}
      ref={(el) => { if (el) setTimeout(() => el.focus(), 0); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
        if (e.key === "Escape") onCancel();
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[560px] max-w-[94vw] max-h-[84vh] flex flex-col bg-white rounded-[24px] border border-[#E3E8F0] shadow-[0_24px_64px_rgba(15,26,48,0.3)] overflow-hidden">
        <div className="px-7 pt-6 pb-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF3FB] text-[#0F1A30] flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">DELETE</div>
            <div className="text-[20px] font-black text-[#0F1A30] leading-tight">오더 <span className="tabular-nums">{list.length}</span>건을 삭제할까요?</div>
            <div className="text-[13px] text-[#7A879C] mt-1">{note}</div>
          </div>
        </div>
        <div className="mx-7 grid grid-cols-3 rounded-2xl border border-[#E3E8F0] overflow-hidden">
          {[["청구 합계", sum.sale], ["기사 합계", sum.drv], ["수수료", sum.fee]].map(([k, v], i) => (
            <div key={k} className={`px-4 py-2.5 text-center ${i ? "border-l border-[#E3E8F0]" : ""}`}>
              <div className="text-[11.5px] font-bold text-[#7A879C]">{k}</div>
              <div className="text-[16px] font-black text-[#0F1A30] tabular-nums">{won(v)}<span className="text-[11px] font-bold text-[#9AA9C3] ml-0.5">원</span></div>
            </div>
          ))}
        </div>
        <div className="mx-7 mt-3 mb-1 flex-1 min-h-0 overflow-y-auto rounded-2xl border border-[#E3E8F0]">
          {list.map((r, idx) => (
            <div key={r._id || idx} className={`flex items-center gap-3 px-4 py-3 ${idx ? "border-t border-[#EEF1F6]" : ""}`}>
              <span className="w-6 text-[12px] font-extrabold text-[#9AA9C3] tabular-nums shrink-0">{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-extrabold text-[#0F1A30] truncate">{r.거래처명 || "-"}</span>
                  <span className="text-[12px] font-bold text-[#7A879C] tabular-nums shrink-0">{String(r.상차일 || "").slice(5).replace("-", ".")}</span>
                </div>
                <div className="text-[12.5px] text-[#5B6B85] truncate">{r.상차지명 || "-"} → {r.하차지명 || "-"}{r.차량번호 ? ` · ${r.차량번호}` : ""}</div>
              </div>
              <span className={`shrink-0 h-6 px-2.5 inline-flex items-center rounded-full text-[11px] font-extrabold ${r.배차상태 === "배차완료" ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] border border-[#C9D2E0]"}`}>{r.배차상태 || "배차중"}</span>
            </div>
          ))}
        </div>
        <div className="px-7 py-5 flex gap-2.5">
          <button onClick={onCancel} className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] bg-white text-[#3A4A66] text-[14.5px] font-extrabold hover:bg-[#F5F8FD] transition">취소 <span className="text-[11px] font-bold text-[#9AA9C3] ml-1">ESC</span></button>
          <button onClick={onConfirm} className="flex-1 h-12 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black hover:bg-[#1B2B4B] transition shadow-[0_8px_18px_rgba(15,26,48,0.25)]">삭제 <span className="text-[11px] font-bold text-white/50 ml-1">ENTER</span></button>
        </div>
      </div>
    </div>
  );
}

export function useKpLongPressSelect({ toggle, isSelected }) {
  const [mode, setMode] = React.useState(false);
  const timer = React.useRef(null);
  const start = React.useRef(null);
  const swallowClick = React.useRef(false);
  // ⭐ 2026-11-03 Shift 범위 선택(엑셀처럼) — 마지막으로 누른 줄 ~ Shift 누르고 누른 줄까지 전부 선택
  const lastId = React.useRef(null);
  const selectRange = (tbody, id) => {
    const ids = [...(tbody?.querySelectorAll?.('tr[id^="row-"]') || [])].map((tr) => tr.id.slice(4));
    const a = ids.indexOf(lastId.current), b = ids.indexOf(id);
    if (a < 0 || b < 0) return false;
    ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => { if (!isSelected(x)) toggle(x); });
    lastId.current = id;
    return true;
  };
  const rowIdOf = (el) => { const tr = el?.closest?.('tr[id^="row-"]'); return tr ? tr.id.slice(4) : null; };
  const interactive = (el) => !!el?.closest?.('input,select,textarea,button,a,label,[contenteditable="true"]');
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  React.useEffect(() => {
    if (!mode) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);
  React.useEffect(() => cancel, []);
  const tbodyProps = {
    onMouseDown: (e) => {
      if (e.button === 0 && e.shiftKey && rowIdOf(e.target) && (mode || e.target?.closest?.('input[type="checkbox"]'))) e.preventDefault(); // Shift 클릭 때 글자가 파랗게 긁히지 않게
      if (e.button !== 0 || interactive(e.target)) return;
      const id = rowIdOf(e.target);
      if (!id) return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        swallowClick.current = true; // 손을 뗄 때 생기는 클릭 한 번은 무시(방금 고른 줄이 바로 풀리지 않게)
        setMode(true);
        if (!isSelected(id)) toggle(id);
        lastId.current = id;
      }, 550);
    },
    onMouseMove: (e) => {
      if (timer.current && start.current && (Math.abs(e.clientX - start.current.x) > 6 || Math.abs(e.clientY - start.current.y) > 6)) cancel();
    },
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onClickCapture: (e) => {
      if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); e.preventDefault(); return; }
      const id = rowIdOf(e.target);
      if (!id) return;
      // 체크박스: Shift 누르고 누르면 범위 선택, 그냥 누르면 시작점만 기억
      if (e.target?.closest?.('input[type="checkbox"]')) {
        if (e.shiftKey && lastId.current && lastId.current !== id) { e.stopPropagation(); e.preventDefault(); selectRange(e.currentTarget, id); return; }
        lastId.current = id;
        return;
      }
      if (!mode || interactive(e.target)) return;
      e.stopPropagation();
      if (e.shiftKey && lastId.current && lastId.current !== id && selectRange(e.currentTarget, id)) return;
      toggle(id);
      lastId.current = id;
    },
    onDoubleClickCapture: (e) => { if (mode) { e.stopPropagation(); e.preventDefault(); } },
  };
  return { selectMode: mode, setSelectMode: setMode, tbodyProps };
}
export function KpSelectModeBar({ count, onSelectAll, onClear, onExit }) {
  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99990] flex items-center gap-2 pl-4 pr-2 py-2 rounded-2xl text-white shadow-[0_16px_40px_rgba(15,26,48,0.35)]"
      style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      <span className="text-[13.5px] font-extrabold">선택 모드</span>
      <span className="text-[13px] text-white/70">줄을 누르면 체크됩니다 ·</span>
      <span className="text-[14px] font-black tabular-nums">{count}건</span>
      <span className="w-px h-5 bg-white/20 mx-1" />
      <button onClick={onSelectAll} className="h-8 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-[12.5px] font-bold">전체 선택</button>
      <button onClick={onClear} className="h-8 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-[12.5px] font-bold">선택 해제</button>
      <button onClick={onExit} className="h-8 px-3 rounded-xl bg-white text-[#0F1A30] text-[12.5px] font-extrabold">끝내기 <span className="text-[10.5px] text-[#7A879C] ml-0.5">ESC</span></button>
    </div>,
    document.body
  );
}
export function useOrderStaffName(userNameMap, userCompany) {
  const on = useCompanyFeatures(getTenant() || userCompany).orderManagerCol === true;
  return React.useMemo(() => {
    if (!on) return null;
    const cache = new WeakMap();
    return (r) => {
      if (!r || typeof r !== "object") return "";
      let v = cache.get(r);
      if (v === undefined) { v = _orderStaffNameRaw(r, userNameMap); cache.set(r, v); }
      return v;
    };
  }, [on, userNameMap]);
}
export const orderMgrName = (getName, r) => (getName ? getName(r) : "");
export const makeOrderSortValue = (mgrMap) => (r, key, i) => (key === "배차담당자" ? orderMgrName(mgrMap, r) : orderSortValue(r, key, i));
export const orderSortValue = (r, key, i) => {
  switch (key) {
    case "순번": return i; // 원래(기본) 순서
    case "수수료": return orderProfit(r); // ⭐ 2026-11-17 정렬도 줄 수수료와 같은 식
    case "기사명": return r.이름;
    case "첨부": return r.attachCount || 0;
    case "전달상태": return r.업체전달상태 || "미전달";
    case "혼적": return r.혼적 ? "혼적" : "";
    default: return r[key];
  }
};

/* -------------------------------------------------
   Firestore 실시간 동기화 훅
--------------------------------------------------*/
export const COLL = {
  dispatch: "orders",
  drivers: "drivers",
  clients: "clients",
};

/* -------------------------------------------------
   하차지 Key 생성 함수 (★ 반드시 필요)
--------------------------------------------------*/
export function makePlaceKey(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\(주\)|㈜/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\uAC00-\uD7A3a-z0-9]/gi, "")
    .trim();
}

// 담당자명 없이 연락처만 입력됐을 때 자동으로 붙일 이름 — 아직 "담당자"라는 이름이
// 없으면 그대로 "담당자", 이미 있으면 담당자1, 담당자2 순으로 이어붙인다.
export const nextManagerName = (contacts) => {
  const list = Array.isArray(contacts) ? contacts : [];
  const hasBare = list.some(c => (c.name || "").trim() === "담당자");
  if (!hasBare) return "담당자";
  const nums = list
    .map(c => { const m = /^담당자(\d+)$/.exec((c.name || "").trim()); return m ? parseInt(m[1], 10) : 0; })
    .filter(n => n > 0);
  return `담당자${nums.length > 0 ? Math.max(...nums) + 1 : 1}`;
};
/* -------------------------------------------------
   하차지 저장 (upsertPlace) — Firestore (최종 안정버전)
--------------------------------------------------*/
export const upsertPlace = async (place) => {
  try {
    const name = (place?.업체명 || "").trim();
    if (!name) return;
    const addr = (place?.주소 || "").trim();
    const normAddr = addr.toLowerCase().replace(/\s+/g, "");

    let key = place._id;
    let existingData = null;
    if (!key) {
      const myCo = getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || DEFAULT_COMPANY;
      const normalizedKey = coDocKey(myCo, makePlaceKey(name)); // ⭐ 회사별 문서 이름
      // 1차: 정규화된 키로 문서 존재 확인(다른 회사 문서면 쓰지 않는다)
      const normalizedSnap = await getDoc(doc(db, "places", normalizedKey)).catch(() => null);
      if (normalizedSnap?.exists() && (normalizedSnap.data().companyName || DEFAULT_COMPANY) === myCo) {
        key = normalizedKey;
        existingData = normalizedSnap.data();
      } else {
        // 2차: 같은 업체명으로 저장된 레거시 문서 검색 (업체명+주소 우선 매칭)
        const legacySnap = await getDocs(
          query(collection(db, "places"), where("업체명", "==", name))
        );
        if (!legacySnap.empty) {
          // 주소가 같은 doc 우선 선택
          const sameAddrDoc = legacySnap.docs.find(d => {
            const existAddr = (d.data().주소 || "").trim().toLowerCase().replace(/\s+/g, "");
            return existAddr === normAddr;
          });
          const picked = sameAddrDoc || legacySnap.docs[0];
          key = picked.id;
          existingData = picked.data();
        } else {
          key = normalizedKey;
        }
      }
    } else {
      // _id 제공된 경우 기존 데이터 로드
      const existSnap = await getDoc(doc(db, "places", key));
      if (existSnap.exists()) {
        existingData = existSnap.data();
      } else if (!place._forceNew) {
        // ⚠️ 넘겨받은 _id로 문서를 찾지 못한 경우(예: 오더복사로 채워진 값이라 실제
        // 거래처 문서 id와 다른 값을 들고 있는 경우) — 그대로 새 문서를 만들면 같은
        // 업체명이 중복 생성된다. 확정 짓기 전에 업체명으로 기존 문서를 한 번 더
        // 찾아, 있으면 그 문서에 덮어쓴다(주소가 같은 문서를 우선 선택).
        // _forceNew가 true면(사용자가 "별도로 새로 만들기"를 직접 선택한 경우)
        // 이 안전장치를 건너뛰고 요청한 대로 새 문서를 만든다.
        const legacySnap = await getDocs(
          query(collection(db, "places"), where("업체명", "==", name))
        );
        if (!legacySnap.empty) {
          const sameAddrDoc = legacySnap.docs.find(d => {
            const existAddr = (d.data().주소 || "").trim().toLowerCase().replace(/\s+/g, "");
            return existAddr === normAddr;
          });
          const picked = sameAddrDoc || legacySnap.docs[0];
          key = picked.id;
          existingData = picked.data();
        }
      }
    }

    const ref = doc(db, "places", key);

    // contacts 배열 병합: 새 담당자가 있으면 기존 contacts에 추가 (중복 방지)
    let mergedContacts;
    if (Array.isArray(place.contacts)) {
      // contacts 배열 직접 제공 시 그대로 사용
      mergedContacts = place.contacts;
    } else {
      const existingContacts = Array.isArray(existingData?.contacts) ? existingData.contacts : [];
      const newName = (place.담당자 || "").trim();
      const newPhone = (place.담당자번호 || "").trim();
      if (newName) {
        const alreadyExists = existingContacts.some(c => (c.name || "").trim() === newName);
        if (alreadyExists) {
          // 이미 있는 담당자면 연락처만 업데이트
          mergedContacts = existingContacts.map(c => (c.name || "").trim() === newName ? { ...c, phone: newPhone } : c);
        } else if (existingContacts.length <= 1) {
          // 담당자가 1명뿐인 상태에서 이름을 바꾼 것은 신규 담당자 추가가 아니라
          // 그 담당자 정보를 수정한 것 — 대표 담당자를 그대로 교체한다.
          // (그렇지 않으면 이전 담당자가 primary로 남아 수정한 값이 무시되고 예전 값으로 되돌아간다)
          const prev = existingContacts[0];
          mergedContacts = [{ ...(prev || {}), name: newName, phone: newPhone, isPrimary: true }];
        } else {
          mergedContacts = [...existingContacts, { name: newName, phone: newPhone, isPrimary: existingContacts.length === 0 }];
        }
      } else if (newPhone) {
        // ☎ 2026-11-12 이름 없이 번호만 온 경우 — 예전엔 담당자 목록에 안 들어가 수정 창에서 번호가 비어 보였다
        if (!existingContacts.length) mergedContacts = [{ name: "", phone: newPhone, isPrimary: true }];
        else if (existingContacts.length === 1 && !(existingContacts[0].phone || "").trim()) mergedContacts = [{ ...existingContacts[0], phone: newPhone, isPrimary: true }];
        else mergedContacts = existingContacts;
      } else {
        mergedContacts = existingContacts;
      }
    }

    // primary contact 결정
    const primaryContact = mergedContacts.find(c => c.isPrimary) || mergedContacts[0];

    const data = {
      업체명: name,
      주소: addr,
      contacts: mergedContacts,
      담당자: primaryContact?.name || (place.담당자 || "").trim(),
      담당자번호: primaryContact?.phone || (place.담당자번호 || "").trim(),
      등급: place.등급 || existingData?.등급 || "일반",
      등급변경일: place.등급변경일 || existingData?.등급변경일 || null,
      // 메모(일반메모): 담당자가 참고용으로 자유롭게 적는 메모. 오더메모와 달리 팝업을 띄우지 않는다.
      메모: place.메모 !== undefined ? place.메모 : (existingData?.메모 || ""),
      // 오더메모: 이 거래처명을 상/하차지명 등 어디서 입력하든 팝업표시가 켜져 있으면
      // 안내 팝업으로 뜨는 메모 — 기본거래처와 동일한 의미/필드명으로 맞춘다.
      오더메모: place.오더메모 !== undefined ? place.오더메모 : (existingData?.오더메모 || ""),
      // 기사전달주의사항: 이 상/하차지가 포함된 오더를 "기사전달용"으로 복사할 때
      // 자동으로 함께 붙는 문구 — 오더메모와 동일한 저장/동기화 방식을 따른다.
      기사전달주의사항: place.기사전달주의사항 !== undefined ? place.기사전달주의사항 : (existingData?.기사전달주의사항 || ""),
      // 점심시간: 실시간배차현황/배차현황에서 상/하차지명 옆 표시 + 상/하차시간 겹침
      // 경고에 쓰인다 — 오더메모와 동일한 저장/동기화 방식을 따른다.
      점심시작시간: place.점심시작시간 !== undefined ? place.점심시작시간 : (existingData?.점심시작시간 || ""),
      점심종료시간: place.점심종료시간 !== undefined ? place.점심종료시간 : (existingData?.점심종료시간 || ""),
      // 메모/등급 안내 팝업 노출 여부 — 기본값은 켜짐(true). 거래처관리에서 끈 경우에만 false로 저장된다.
      팝업표시: place.팝업표시 !== undefined ? place.팝업표시 : (existingData?.팝업표시 !== undefined ? existingData.팝업표시 : true),
      isActive: place.isActive !== false,
      updatedAt: serverTimestamp(),
      companyName: place.companyName || existingData?.companyName || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || DEFAULT_COMPANY,
      // ⭐ 순수매출제외 — 명시적으로 true/false가 있을 때만 키를 만든다(기본거래처
      // normalizeClient와 동일한 이유: 한 번도 안 건드린 거래처는 undefined 필드 저장
      // 오류 없이 그대로 "미설정" 상태를 유지해야 이름 기반 폴백이 계속 동작한다).
      ...(typeof place.순수매출제외 === "boolean"
        ? { 순수매출제외: place.순수매출제외 }
        : typeof existingData?.순수매출제외 === "boolean"
          ? { 순수매출제외: existingData.순수매출제외 }
          : {}),
      // ⭐ 매출순위제외 — 순수매출제외와 별개인 신규 플래그, 저장 규칙은 동일.
      ...(typeof place.매출순위제외 === "boolean"
        ? { 매출순위제외: place.매출순위제외 }
        : typeof existingData?.매출순위제외 === "boolean"
          ? { 매출순위제외: existingData.매출순위제외 }
          : {}),
    };

    // ⭐ 저장 속도: setDoc의 Promise는 "서버 확인"까지 기다린다 — 로컬 캐시엔 즉시
    // 반영되므로 기다리지 않고 백그라운드로 넘긴다(upsertDriver와 동일 방식).
    setDoc(ref, data, { merge: true }).catch((e) => console.error("하차지 저장 실패:", e));

    // ═══════════════════════════════════════════════════
    // 기본거래처 ↔ 하차지거래처 동기화 — 같은 이름의 기본거래처가 있으면 주소/담당자/
    // 메모/오더메모를 그대로 반영한다. 어느 쪽에서 고치든 같이 바뀌어야 한다는 요구사항.
    // upsertClient를 다시 부르지 않고 직접 write해서 서로 재귀 호출되지 않게 한다.
    // ⭐ 기본거래처 문서는 이름이 거래처명 또는 업체명 필드에 들어있어 둘 다 찾는다
    // (거래처명만 찾으면 동기화가 빠져 배차관리 드롭다운에서 오더메모 팝업이 안 떴다).
    // 이 동기화는 화면 저장을 막지 않도록 백그라운드로 돌린다.
    // ═══════════════════════════════════════════════════
    (async () => { try {
      const [snapA, snapB] = await Promise.all([
        getDocs(query(collection(db, "clients"), where("거래처명", "==", name))),
        getDocs(query(collection(db, "clients"), where("업체명", "==", name))),
      ]);
      const seen = new Set();
      const clientDocs = [...snapA.docs, ...snapB.docs].filter(d => !seen.has(d.id) && seen.add(d.id));
      for (const d of clientDocs) {
        setDoc(doc(db, "clients", d.id), {
          주소: data.주소,
          contacts: data.contacts,
          담당자: data.담당자,
          연락처: data.담당자번호,
          메모: data.메모,
          오더메모: data.오더메모,
          기사전달주의사항: data.기사전달주의사항,
          점심시작시간: data.점심시작시간,
          점심종료시간: data.점심종료시간,
          팝업표시: data.팝업표시,
          ...(data.순수매출제외 !== undefined ? { 순수매출제외: data.순수매출제외 } : {}),
          ...(data.매출순위제외 !== undefined ? { 매출순위제외: data.매출순위제외 } : {}),
        }, { merge: true }).catch(() => {});
      }
    } catch {} })();

    return key;

  } catch (e) {
    console.error("⊘ upsertPlace 오류:", e);
  }
};
export const fmtWon = (n) => `${Number(n || 0).toLocaleString()}원`;
// 📌 전화번호 하이픈 자동 적용 함수 (프로그램 공용 — 입력 중에도 단계적으로 하이픈)
//  · 010-1234-5678 / 011-123-4567 / 02-123-4567 / 02-1234-5678 / 031-123-4567
//  · 0505-123-4567 (050X 안심번호) / 1588-1234 (대표번호) / 070-1234-5678
//  · 숫자가 없으면 "" , 규칙보다 긴 숫자는 숫자만 그대로 돌려준다(잘라내지 않음).
//  · 10·11자리 일반 번호는 예전 함수와 결과가 같아 저장 포맷이 바뀌지 않는다.
export function formatPhone(phone) {
  const raw = String(phone ?? "");
  const d = raw.replace(/[^\d]/g, "");
  if (!d) return "";
  const n = d.length;
  // 서울 02
  if (d.startsWith("02")) {
    if (n > 10) return d;
    if (n <= 2) return d;
    if (n <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (n <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  // 050X 안심번호(4자리 국번)
  if (/^050\d/.test(d)) {
    if (n > 12) return d;
    if (n <= 4) return d;
    if (n <= 7) return `${d.slice(0, 4)}-${d.slice(4)}`;
    if (n <= 11) return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
    return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
  }
  // 1588/1544 등 전국 대표번호(8자리)
  if (/^1[5-9]/.test(d)) {
    if (n > 8) return d;
    if (n <= 4) return d;
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  if (n > 11) return d;
  if (n <= 3) return d;
  // 010 휴대폰은 항상 3-4-4
  if (d.startsWith("010")) {
    if (n <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (n <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (n <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
// 차량번호 정규화 (공백 / 하이픈 제거 + 소문자)
export function normalizePlate(v = "") {
  return String(v)
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/-/g, "");
}
// ================================
// 화주사 등록 오더(raw HH:mm + 구분필드)를 운송프로그램 표기(오전 8시 이후)로 변환
// ================================
export function fmtDispatchTime(v, gubun) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":").map(Number);
    const isAM = h < 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const base = `${isAM ? "오전" : "오후"} ${h12}시${m > 0 ? ` ${m}분` : ""}`;
    return gubun && gubun !== "정각" ? `${base} ${gubun}` : base;
  }
  // ⭐ 실제 배차관리 등록폼(TimeAmPmPicker)은 상차시간을 "HH:MM"이 아니라
  // "오전 9시"/"오후 3시 30분" 형식 그대로 저장한다 — 예전엔 위 정규식에 안 걸려서
  // 그냥 raw만 돌려주고 이전/이후(gubun)를 붙이지 않았다. 이미 문자열 안에 들어있지
  // 않을 때만(중복 방지) 뒤에 붙여준다.
  if (gubun && gubun !== "정각" && !raw.includes(gubun)) {
    return `${raw} ${gubun}`;
  }
  return raw; // 이미 운송프로그램 형식으로 저장된 값
}
// ================================
// 경유지 포함 화물내용+톤수 합산 헬퍼 (모듈 스코프)
// ================================
export function _parseWaypointList(v) {
  if (Array.isArray(v) && v.length > 0) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const ks = Object.keys(v);
    if (ks.length > 0 && ks.every(k => /^\d+$/.test(k)))
      return ks.sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
    if (v.업체명) return [v];
  }
  return [];
}
export function mergeViaCargoText(mainCargo, waypointLists) {
  const mainStr = String(mainCargo || "").trim();
  const UNITS = ["파렛트", "파레트", "팔레트", "파렛", "파레", "박스", "통", "바구니"];
  const NORM = { "파렛트": "파레트", "팔레트": "파레트", "파렛": "파레트", "파레": "파레트" };
  const getType = (s) => {
    for (const u of UNITS) { if (String(s).endsWith(u)) return NORM[u] || u; }
    return null;
  };
  const getNum = (s) => { const m = String(s).match(/^([\d,.]+)/); return m ? parseFloat(m[1].replace(/,/g, "")) : null; };
  const allCargos = [];
  if (mainStr && mainStr !== "없음") allCargos.push(mainStr);
  let hasViaWithCargo = false;
  for (const list of waypointLists) {
    for (const s of _parseWaypointList(list)) {
      if (!s) continue;
      const wCargo = String(s.화물내용 || "").trim();
      if (!wCargo || wCargo === "없음") continue;
      const isTypeOnly = UNITS.some(u => wCargo === u || wCargo === (NORM[u] || u));
      if (isTypeOnly) continue;
      allCargos.push(wCargo);
      hasViaWithCargo = true;
    }
  }
  if (!hasViaWithCargo) return mainStr;
  const byUnit = {};
  const untyped = [];
  for (const cargo of allCargos) {
    const type = getType(cargo);
    if (type !== null) {
      const n = getNum(cargo);
      if (n !== null) { byUnit[type] = (byUnit[type] || 0) + n; }
      else if (!untyped.includes(cargo)) untyped.push(cargo);
    } else {
      if (!untyped.includes(cargo)) untyped.push(cargo);
    }
  }
  const parts = [...Object.entries(byUnit).map(([u, n]) => `${n}${u}`), ...untyped];
  return parts.join("+");
}
export function mergeViaTonnage(mainTon, waypointLists) {
  const parseKg = (s) => {
    const str = String(s || "").trim().replace(/,/g, "");
    const kg = str.match(/([\d.]+)\s*kg/i);
    if (kg) return parseFloat(kg[1]);
    const ton = str.match(/([\d.]+)\s*톤/);
    if (ton) return parseFloat(ton[1]) * 1000;
    return null;
  };
  const fmtKg = (kg) => (kg / 1000).toFixed(3).replace(/\.?0+$/, "") + "톤";
  const mainKg = parseKg(mainTon);
  let totalKg = mainKg || 0;
  let hasViaWithTon = false;
  for (const list of waypointLists) {
    for (const s of _parseWaypointList(list)) {
      if (!s) continue;
      const t = String(s.차량톤수 || "").trim();
      if (!t) continue;
      const kg = parseKg(t);
      if (kg !== null) { totalKg += kg; hasViaWithTon = true; }
    }
  }
  if (!hasViaWithTon) return toTonUnit(mainTon) || "";
  if (totalKg <= 0) return toTonUnit(mainTon) || "";
  return fmtKg(totalKg);
}

// ================================
// 운임조회 결과 정렬 — 3/4/5파트 운임조회 모달에서 공용으로 쓰는 정렬 헬퍼.
// "추천순"은 각 모달이 이미 계산해둔 기본 순서(화물/톤수 근접도 등)를 그대로
// 두고, 나머지 모드만 이 함수에서 재정렬한다.
// ================================
export const FARE_SORT_OPTIONS = [
  { value: "relevance", label: "추천순" },
  { value: "latest", label: "최신순" },
  { value: "price_high", label: "금액 높은순" },
  { value: "price_low", label: "금액 낮은순" },
];
export function sortFareHistory(list, mode) {
  const arr = Array.isArray(list) ? [...list] : [];
  const getDate = (r) => r._date || r.상차일 || r.등록일 || "";
  const getFare = (r) => Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
  if (mode === "latest") return arr.sort((a, b) => getDate(b).localeCompare(getDate(a)));
  if (mode === "price_high") return arr.sort((a, b) => getFare(b) - getFare(a));
  if (mode === "price_low") return arr.sort((a, b) => getFare(a) - getFare(b));
  return arr; // relevance: 원래 순서 유지
}
export function FareSortDropdown({ value, onChange }) {
  return (
    <CustomSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[11px] font-bold text-[#1B2B4B] border border-gray-200 rounded-lg px-2 py-1 outline-none cursor-pointer bg-white"
    >
      {FARE_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </CustomSelect>
  );
}

// ===================== 오더정보 모달 =====================
export function OrderInfoModal({ row, onClose, lunchByName }) {
  const [routeInfo, setRouteInfo] = React.useState(null); // { distanceKm, durationText } | "loading" | "error"
  React.useEffect(() => {
    if (!row?.상차지주소 || !row?.하차지주소) { setRouteInfo(null); return; }
    let cancelled = false;
    setRouteInfo("loading");
    const viaPoints = [
      ..._parseWaypointList(row.경유상차목록 || row.경유지_상차),
      ..._parseWaypointList(row.경유하차목록 || row.경유지_하차),
    ].map(s => s.주소).filter(Boolean);
    fetch(`${(import.meta.env.VITE_API_BASE || "")}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddr: row.상차지주소, toAddr: row.하차지주소, viaPoints }),
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const km = Number(data?.distanceKm);
        if (!km) { setRouteInfo("error"); return; }
        setRouteInfo({ distanceKm: km, durationText: data?.durationText || (data?.durationMin ? `${data.durationMin}분` : "-") });
      })
      .catch(() => { if (!cancelled) setRouteInfo("error"); });
    return () => { cancelled = true; };
  }, [row?.상차지주소, row?.하차지주소, row?.경유상차목록, row?.경유지_상차, row?.경유하차목록, row?.경유지_하차]);

  if (!row) return null;
  const orderInfoWorkDates = _parseWorkDates(row.근무일자목록);
  const _s = (v) => _parseWaypointList(v);
  const pickupStops = [..._s(row.경유상차목록), ..._s(row.경유지_상차), ..._s(row.경유지상차)]
    .filter((s, i, arr) => s && (s.업체명 || s.주소) && arr.findIndex(x => (x.업체명 || x.주소) === (s.업체명 || s.주소)) === i);
  const dropStops = [..._s(row.경유하차목록), ..._s(row.경유지_하차), ..._s(row.경유지하차)]
    .filter((s, i, arr) => s && (s.업체명 || s.주소) && arr.findIndex(x => (x.업체명 || x.주소) === (s.업체명 || s.주소)) === i);
  const mergedCargo = mergeViaCargoText(row.화물내용, [row.경유상차목록, row.경유지_상차, row.경유하차목록, row.경유지_하차]);
  const mergedTon = mergeViaTonnage(row.차량톤수, [row.경유상차목록, row.경유지_상차, row.경유하차목록, row.경유지_하차]);
  const hasWaypointCargo = pickupStops.length > 0 || dropStops.length > 0;
  const fee = orderProfit(row); // ⭐ 2026-11-17 표와 같은 수수료(청구 − 기사 − 지게차·특수운임 회사 지급분)
  const fmtPhone = (p) => formatPhone(p) || p || "-"; // 공용 formatPhone 사용
  const fmtMoney = (v) => v ? Number(v).toLocaleString() + "원" : "-";
  const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
  // ⭐ 상/하차지에 등록된 휴게(점심)시간 — 그 거래처가 실제로 설정해둔 경우에만 표시
  const pickupLunch = lunchByName?.get(_lunchNameKey(row.상차지명));
  const dropLunch = lunchByName?.get(_lunchNameKey(row.하차지명));
  const lunchValue = (lunch, orderTime) => {
    if (!lunch) return null;
    const overlap = isLunchTimeOverlap(orderTime, lunch.start, lunch.end);
    return `${lunch.start}~${lunch.end}${overlap ? " (상하차시간과 겹침)" : ""}`;
  };
  // ⭐ 2026-10-30 리디자인 — 배차요청장처럼 왼쪽 오더 내용 + 오른쪽 지도(경로)를 한 창에서 본다
  const kv = (label, value, opts = {}) => (
    <div key={label} className={`min-w-0 ${opts.span ? "col-span-2" : ""}`}>
      <div className="text-[11px] font-bold text-[#7A89A3]">{label}</div>
      <div className={`text-[14px] font-bold text-[#0F1A30] mt-0.5 ${opts.wrap ? "whitespace-pre-wrap break-words" : "truncate"}`} title={typeof value === "string" ? value : undefined}>{value || "-"}</div>
    </div>
  );
  const card = (code, title, body, right) => (
    <div className="bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_22px_rgba(16,24,40,0.05)]">
      <div className="flex items-center justify-between px-4 h-10 border-b border-[#EEF1F6]">
        <div className="flex items-center gap-2"><span className="text-[9.5px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{code}</span><span className="text-[13.5px] font-black text-[#0F1A30]">{title}</span></div>
        {right}
      </div>
      <div className="px-4 py-3">{body}</div>
    </div>
  );
  const stop = (kind, num, s, isMain) => (
    <div className="relative pl-9 pb-4 last:pb-0">
      <span className={`absolute left-0 top-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black ${isMain ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B] border border-[#DCE3EE]"}`}>{num}</span>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10.5px] font-extrabold tracking-[0.16em] text-[#4B6CB7]">{kind}</span>
        <span className="text-[15px] font-black text-[#0F1A30]">{s.name || "-"}</span>
        {s.time && <span className="px-2 py-0.5 rounded-md bg-[#EEF2F8] text-[12px] font-black text-[#1B2B4B]">{s.time}</span>}
      </div>
      <div className="flex items-start gap-2 mt-0.5">
        <div className="flex-1 min-w-0 text-[13px] font-semibold text-[#3A4A66] break-words">{s.addr || "-"}</div>
        {s.addr && <RoadviewButton addr={s.addr} name={`${s.kind} · ${s.name || ""}`} variant="inline" className="mt-px" />}
      </div>
      {(s.extra || []).filter(Boolean).length > 0 && <div className="text-[12px] font-semibold text-[#7A89A3] mt-0.5">{s.extra.filter(Boolean).join(" · ")}</div>}
    </div>
  );
  const pickupTimeTxt = row.상차시간 ? fmtDispatchTime(row.상차시간, row.상차시간기준 || row.상차시간구분) : "즉시";
  const dropTimeTxt = row.하차시간 ? fmtDispatchTime(row.하차시간, row.하차시간기준 || row.하차시간구분) : "즉시";
  const stops = [
    { kind: "상차", isMain: true, name: row.상차지명, addr: row.상차지주소, time: `${row.상차일 ? row.상차일.slice(5).replace("-", "/") + " " : ""}${pickupTimeTxt}`, extra: [row.상차방법 && `상차방법 ${row.상차방법}`, pickupLunch && `휴게 ${lunchValue(pickupLunch, row.상차시간)}`, (mgrName(row.상차지담당자) || row.상차지담당자번호) && `담당 ${mgrName(row.상차지담당자)} ${fmtPhone(row.상차지담당자번호 || "")}`.replace(/\s+/g, " ").trim()] },
    ...pickupStops.map((s) => ({ kind: "상차 경유", name: s.업체명, addr: s.주소, time: s.상차시간, extra: [(s.화물내용 || s.화물수량) && `화물 ${s.화물내용 || s.화물수량}`, s.차량톤수 && `톤수 ${s.차량톤수}`, s.방법 && `방법 ${s.방법}`] })),
    ...dropStops.map((s) => ({ kind: "하차 경유", name: s.업체명, addr: s.주소, time: s.하차시간, extra: [(s.화물내용 || s.화물수량) && `화물 ${s.화물내용 || s.화물수량}`, s.차량톤수 && `톤수 ${s.차량톤수}`, s.방법 && `방법 ${s.방법}`] })),
    { kind: "하차", isMain: true, name: row.하차지명, addr: row.하차지주소, time: `${row.하차일 && row.하차일 !== row.상차일 ? row.하차일.slice(5).replace("-", "/") + " " : ""}${dropTimeTxt}`, extra: [row.하차방법 && `하차방법 ${row.하차방법}`, dropLunch && `휴게 ${lunchValue(dropLunch, row.하차시간)}`, (mgrName(row.하차지담당자) || row.하차지담당자번호) && `담당 ${mgrName(row.하차지담당자)} ${fmtPhone(row.하차지담당자번호 || "")}`.replace(/\s+/g, " ").trim()] },
  ];
  const hasMap = !!(row.상차지주소 && row.하차지주소);
  const status = row.배차상태 || (row.차량번호 ? "배차완료" : "배차중");
  const kpis = [
    ["청구운임", fmtMoney(row.청구운임)], ["기사운임", fmtMoney(row.기사운임)], ["수수료", fee ? fee.toLocaleString() + "원" : "-"],
    ["예상거리", routeInfo && typeof routeInfo === "object" ? `${routeInfo.distanceKm.toFixed(1)} km` : routeInfo === "loading" ? "조회 중…" : "-"],
    ["예상시간", routeInfo && typeof routeInfo === "object" ? routeInfo.durationText : routeInfo === "loading" ? "조회 중…" : "-"],
  ];
  return (
    <div className="fixed inset-0 bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center z-[999999] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#F4F6FA] rounded-[26px] shadow-[0_40px_100px_rgba(0,0,0,0.45)] w-[1320px] max-w-[96vw] h-[86vh] max-h-[900px] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="relative shrink-0 px-7 pt-5 pb-4 text-white overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ORDER · DETAIL</div>
              <div className="flex items-center gap-2.5 mt-1 min-w-0">
                <h3 className="text-[21px] font-black truncate"><EditableText id="popup.title.오더정보" defaultText="오더정보" /> <span className="text-white/40 mx-1">|</span> {row.상차지명 || "-"} <span className="text-[#8FB0F0]">→</span> {row.하차지명 || "-"}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {[row.상차일, row.거래처명, status, row.배차방식, row.지급방식, row.운행유형 === "왕복" ? "왕복" : null, row.청구사업자 ? `청구 · ${row.청구사업자}` : null].filter(Boolean).map((t, i) => (
                  <span key={i} className={`px-2.5 py-0.5 rounded-md text-[12px] font-bold ${i === 2 ? "bg-white text-[#0F1A30]" : "bg-white/10 border border-white/15 text-white/85"}`}>{t}</span>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-[13px] font-bold transition">닫기 ✕</button>
          </div>
          <div className="relative grid grid-cols-5 gap-2 mt-4">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-2">
                <div className="text-[11px] font-bold text-white/50">{l}</div>
                <div className="text-[16px] font-black tabular-nums truncate" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {/* 본문: 왼쪽 오더 내용 / 오른쪽 지도 */}
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 p-4">
          <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
            {orderInfoWorkDates.length > 1 && card("DATES", `근무일 ${orderInfoWorkDates.length}일 · 묶음`, (
              <div className="flex flex-wrap gap-1.5">{orderInfoWorkDates.map((d) => <span key={d} className="bg-[#0F1A30] text-white text-[12px] font-black rounded-md px-2 py-1 tabular-nums">{d.slice(5).replace("-", "/")}</span>)}</div>
            ))}
            {card("ROUTE", `운행 경로${pickupStops.length + dropStops.length ? ` · 경유 ${pickupStops.length + dropStops.length}곳` : ""}`, (
              <div className="relative">
                <span className="absolute left-[13px] top-3 bottom-3 w-px bg-[#DCE3EE]" />
                {stops.map((s, i) => <React.Fragment key={i}>{stop(s.kind, i + 1, s, s.isMain)}</React.Fragment>)}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {card("CARGO", "화물", (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {kv(hasWaypointCargo ? "총 화물내용" : "화물내용", mergedCargo || row.화물내용)}
                  {kv(hasWaypointCargo ? "총 톤수" : "톤수", mergedTon || row.차량톤수)}
                  {kv("차량종류", row.차량종류)}
                  {kv("운행", row.운행유형 || "편도")}
                </div>
              ))}
              {card("DRIVER", "차량 · 기사", (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {kv("차량번호", row.차량번호)}
                  {kv("기사명", row.이름 || row.기사명)}
                  {kv("전화번호", row.전화번호 ? fmtPhone(row.전화번호) : "")}
                  {kv("배차상태", status)}
                </div>
              ))}
            </div>
            {(row.메모 || row.전달사항) && card("NOTE", "메모 · 전달사항", (
              <div className="grid gap-2.5">
                {row.메모 && kv("메모", row.메모, { wrap: true })}
                {row.전달사항 && kv("전달사항", row.전달사항, { wrap: true })}
              </div>
            ))}
          </div>
          <div className="min-h-0 rounded-2xl overflow-hidden border border-[#E3E8F0] bg-white flex flex-col shadow-[0_8px_22px_rgba(16,24,40,0.06)]">
            <div className="flex items-center justify-between px-4 h-10 border-b border-[#EEF1F6] shrink-0">
              <div className="flex items-center gap-2"><span className="text-[9.5px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MAP</span><span className="text-[13.5px] font-black text-[#0F1A30]">경로 지도</span></div>
              <span className="text-[11.5px] font-bold text-[#8A97AD]">실시간 교통 반영</span>
            </div>
            {hasMap ? (
              <RouteMapModal inline
                pickupAddr={row.상차지주소} dropAddr={row.하차지주소}
                pickupName={row.상차지명} dropName={row.하차지명}
                viaPickup={pickupStops.map((s) => s.주소).filter(Boolean)}
                viaDrop={dropStops.map((s) => s.주소).filter(Boolean)}
                onClose={() => {}} className="flex-1 min-h-0" />
            ) : (
              <div className="flex-1 flex items-center justify-center text-[13px] font-bold text-[#9AA9C3]">상·하차지 주소가 있어야 지도를 볼 수 있습니다</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function sflowToast(message, type, meta) {
  // ⭐ 2026-11-17 배차 토스트(오더 등록 · 배차완료 · 화주 요청 · 수정/취소 요청)는 지금 운송 일을 하는 사람에게만 — 경리 · 인사 · 영업 · 경영 화면이면 띄우지 않는다
  if (DISPATCH_TOAST_TYPES.includes(type) && !dispatchAlertsOn()) return;
  if (window.__sflowShowToast) {
    window.__sflowShowToast(message, type, meta);
  } else {
    window.__sflowToastQueue.push({ message, type, meta });
  }
}
// ===================== TOAST SYSTEM END =====================
// ===================== 커스텀 Alert 모달 =====================
export function CustomAlert({ message, onClose }) {
  // ⚠️ window 전체에 keydown을 걸면, 이 알림 밑에 다른 팝업(담당자 선택/거래처 메모 등)이
  // 동시에 떠 있을 때 Enter 한 번에 이 알림과 그 팝업이 동시에 닫혀버린다. 이 알림
  // 자신의 DOM에 포커스가 가 있을 때만 반응하도록 로컬 onKeyDown으로 범위를 좁힌다 —
  // 그래야 "지금 맨 위에 있는 팝업만" Enter에 반응하고, 확인 후에야 뒤에 있던 팝업이 보인다.
  if (!message) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]"
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onClose(); } }}
    >
      <div className="bg-[#1e2530] border border-gray-600 rounded-xl shadow-2xl p-6 w-[320px] text-center">
        <p className="text-white text-[15px] mb-5 whitespace-pre-line">{message}</p>
        <button
          autoFocus
          onClick={onClose}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[14px] font-semibold rounded-lg transition"
        >
          확인
        </button>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 1/8) — END =====================


// ===================== FloatingCalculator =====================
// 사용자가 제공한 "톤수별 차량 규격표" 원본(구분/적재함 길이/폭 참고/실무상 명칭)을
// 차량제원 팝업의 "카고 차량 제원표"에 그대로 표시하기 위한 원본 그대로의 데이터.
// LOAD_VEHICLES(계산기용, cm 단위로 환산)와 별개로 이 표는 원본 문구(범위 표기 등)를
// 그대로 보여주는 용도라 값을 가공하지 않는다.
// l(적재함 길이)·w(폭)는 cm, maxKg는 kg — LOAD_VEHICLES와 동일한 값을 그대로 들고 있어
// "최대 적재 중량/최대 적재 파렛"을 표에서 자동 계산할 수 있게 한다(calcPalletFit 참고).
// 관리자가 더블클릭으로 수정하면 이 값들이 override로 대체된다(specOverrides).
export const CARGO_VEHICLE_SPEC_TABLE = [
  { ton: "1톤",    category: "일반",        bedLength: "2.7~2.85m",   widthRef: "약 1.6m",       name: "1톤",                     l: 278,  w: 160, maxKg: 1100  },
  { ton: "",        category: "장축",        bedLength: "3.0~3.1m",    widthRef: "약 1.6m",       name: "1톤 장축",               l: 305,  w: 160, maxKg: 1150  },
  { ton: "1.4톤",  category: "일반",        bedLength: "2.9~3.1m",    widthRef: "약 1.6~1.7m",   name: "1.4톤",                   l: 300,  w: 165, maxKg: 1550  },
  { ton: "",        category: "장축",        bedLength: "3.4m 전후",   widthRef: "약 1.7m",       name: "1.4톤 장축",             l: 340,  w: 170, maxKg: 1600  },
  { ton: "2.5톤",  category: "일반",        bedLength: "4.2~4.3m",    widthRef: "약 1.8m",       name: "2.5톤",                   l: 425,  w: 180, maxKg: 2750  },
  { ton: "3.5톤",  category: "일반",        bedLength: "4.5~4.9m",    widthRef: "약 2.05m",      name: "3.5톤",                   l: 470,  w: 205, maxKg: 3850  },
  { ton: "",        category: "장축/초장축", bedLength: "5.0~5.5m 전후", widthRef: "약 2.05~2.3m", name: "3.5톤 장축",           l: 525,  w: 218, maxKg: 4000  },
  { ton: "",        category: "와이드/광폭", bedLength: "5.2~6.2m",    widthRef: "2.3m 전후",     name: "3.5톤 와이드",           l: 570,  w: 230, maxKg: 4000  },
  { ton: "5톤",    category: "일반",        bedLength: "6.2~6.3m",    widthRef: "2.15~2.3m",     name: "5톤",                     l: 625,  w: 223, maxKg: 5500  },
  { ton: "",        category: "장축/플러스", bedLength: "6.7~7.3m",    widthRef: "약 2.3m",       name: "5톤 플러스",             l: 700,  w: 230, maxKg: 5800  },
  { ton: "",        category: "축차/플러스축", bedLength: "7.3~8.5m",  widthRef: "약 2.3~2.4m",   name: "5톤 축",                 l: 790,  w: 235, maxKg: 7500  },
  { ton: "",        category: "초장축/특장", bedLength: "9.6m 전후",   widthRef: "약 2.4m",       name: "5톤/5.5톤/8.5톤 증톤 등", l: 960,  w: 240, maxKg: 8500  },
  { ton: "8톤",    category: "일반/장축",   bedLength: "7.3~8m 전후", widthRef: "약 2.35m",      name: "8톤",                     l: 765,  w: 235, maxKg: 8800  },
  { ton: "",        category: "장축/특장",   bedLength: "8~9m대",      widthRef: "약 2.4m",       name: "8톤 특장",               l: 850,  w: 240, maxKg: 9200  },
  { ton: "9.5톤",  category: "일반/장축",   bedLength: "8~9.5m 전후", widthRef: "약 2.35~2.4m",  name: "9.5톤",                   l: 875,  w: 238, maxKg: 10500 },
  { ton: "11톤",   category: "일반",        bedLength: "9.0m 전후",   widthRef: "약 2.35m",      name: "11톤",                    l: 900,  w: 235, maxKg: 12000 },
  { ton: "",        category: "장축",        bedLength: "9.6m 전후",   widthRef: "약 2.4m",       name: "11톤 장축",              l: 960,  w: 240, maxKg: 12700 },
  { ton: "",        category: "초장축/후축", bedLength: "10.2m 전후", widthRef: "2.4m 전후",     name: "11톤 후축",              l: 1020, w: 240, maxKg: 14500 },
  { ton: "14톤",   category: "일반",        bedLength: "9.0m 전후",   widthRef: "약 2.35m",      name: "14톤",                    l: 900,  w: 235, maxKg: 15400 },
  { ton: "",        category: "장축/후축",   bedLength: "9.6~10.2m",  widthRef: "약 2.4m",       name: "14톤 후축",              l: 990,  w: 240, maxKg: 18200 },
  { ton: "18톤",   category: "일반/후축",   bedLength: "10.0~10.2m", widthRef: "약 2.4m",       name: "18톤",                    l: 1010, w: 240, maxKg: 19800 },
  { ton: "22톤",   category: "일반/후축",   bedLength: "10.0~10.2m", widthRef: "약 2.4m",       name: "22톤",                    l: 1010, w: 240, maxKg: 24200 },
  { ton: "25톤",   category: "일반/후축",   bedLength: "10.0~10.2m", widthRef: "약 2.4m",       name: "25톤",                    l: 1010, w: 240, maxKg: 27500 },
  { ton: "추레라", category: "표준",        bedLength: "12m",         widthRef: "약 2.4m",       name: "24/25톤 추레라",         l: 1200, w: 240, maxKg: 27500 },
  { ton: "",        category: "특장",        bedLength: "12m 이상/별도", widthRef: "차종별",      name: "저상·평판 등",           l: 1200, w: 240, maxKg: 32000 },
];

// 파렛트 종류별 규격·자체무게 — "RUN박성우충괄팀장님의 메시지" 기준표를 그대로 반영.
// EL14처럼 무게가 범위로 안내된 경우 kg은 계산용 평균값을 쓰고 kgLabel에 원래
// 범위 문구를 별도로 남긴다.
export const PALLET_SPEC_TABLE = [
  { code: "N11",  w: 1100, d: 1100, h: 150, kg: 19.5 },
  { code: "N12",  w: 1200, d: 1000, h: 150, kg: 20 },
  { code: "N15",  w: 1460, d: 1130, h: 150, kg: 27.5 },
  { code: "P11",  w: 1100, d: 1100, h: 150, kg: 26 },
  { code: "P13",  w: 1300, d: 1100, h: 150, kg: 25 },
  { code: "P14",  w: 1350, d: 1100, h: 150, kg: 32 },
  { code: "PA11", w: 1100, d: 800,  h: 150, kg: 18 },
  { code: "L14",  w: 1437, d: 1127, h: 140, kg: 20 },
  { code: "EL14", w: 1440, d: 1130, h: 150, kg: 26.5, kgLabel: "25.5~27.5 kg" },
  { code: "EL15", w: 1500, d: 1500, h: 150, kg: 32 },
  { code: "EL18", w: 1800, d: 1600, h: 150, kg: 58 },
  { code: "EL20", w: 1960, d: 1960, h: 150, kg: 68.5 },
  { code: "N48",  w: 1219, d: 1016, h: 150, kg: 23.8, note: "코스트코" },
  { code: "W09",  w: 1100, d: 900,  h: 120, kg: 22 },
  { code: "WT11", w: 1100, d: 1100, h: 144, kg: 45 },
  { code: "WT12", w: 1200, d: 1000, h: 144, kg: 45 },
  { code: "WT13", w: 1300, d: 1100, h: 144, kg: 51 },
  { code: "C95",  w: 950,  d: 950,  h: 130, kg: 23 },
];

// ===================== DispatchApp.jsx (PART 2/8) — START =====================
// 역할 이름(ROLE_LABELS)은 customRoles.js에서 가져온다(PC·모바일 공용)

// ================================
// ⭐ 운임조회 매칭 헬퍼 (모듈 스코프 — DispatchStatus에서도 접근 가능)
// ================================
export function _getPalletNum(s) {
  const m = String(s||"").match(/(\d+)\s*(p|P|파|팔|파레|파렛|파렛트|팔레트|PL)/i);
  if (m) return Number(m[1]);
  const m2 = String(s||"").match(/^\s*(\d+)\s*$/);
  return m2 ? Number(m2[1]) : null;
}
// targetTotal/recTotal: 경유지 포함 합산 파렛트수(운임조회 전용)가 있으면 우선 사용,
// 없으면(null) 기존처럼 문자열에서 직접 추출
export function fareCargoExact(targetCargo, recCargo, targetTotal = null, recTotal = null) {
  const tc = String(targetCargo || "").trim();
  const rc = String(recCargo || "").trim();
  if (!tc || !rc) return false;
  if (tc === rc) return true;
  const tp = targetTotal != null ? targetTotal : _getPalletNum(tc);
  const rp = recTotal != null ? recTotal : _getPalletNum(rc);
  if (tp != null && rp != null) return tp === rp;
  if (/박스/.test(tc) && /박스/.test(rc)) return true;
  return false;
}
export function fareCargoPartial(targetCargo, recCargo, targetTotal = null, recTotal = null) {
  const tc = String(targetCargo || "").trim();
  const rc = String(recCargo || "").trim();
  if (!tc || !rc) return false;
  const tp = targetTotal != null ? targetTotal : _getPalletNum(tc);
  const rp = recTotal != null ? recTotal : _getPalletNum(rc);
  if (tp != null && rp != null) return Math.abs(tp - rp) <= 2;
  return false;
}
export function getFareMatchLabel(cargoExact, cargoPartial, tonExact) {
  if (cargoExact && tonExact) return "완전일치";
  if (cargoExact || cargoPartial) return "부분일치";
  if (tonExact) return "톤수일치";
  return "경로일치";
}

// ⭐ 모듈 스코프 — DispatchApp 및 하위 컴포넌트(RealtimeStatus, DispatchStatus 등) 전체에서 접근 가능
export function extractTonNum(text = "") {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  return null;
}

export function getPalletFromCargoText(cargo = "") {
  const m = cargo.match(/(\d+)\s*(p|P|파|팔|파레|파렛|파렛트|팔레트|PL)/i);
  if (m) return Number(m[1]);
  const m2 = cargo.match(/^\s*(\d+)\s*$/);
  if (m2) return Number(m2[1]);
  return null;
}

// ⭐ 운임조회 전용 — 기본 화물내용 + 모든 경유지(상차/하차) 화물내용을 합산한 총 파렛트수
export function getTotalPalletFromOrder(order = {}) {
  const nums = [];
  const base = getPalletFromCargoText(order?.화물내용 || "");
  if (base != null) nums.push(base);
  const vias = [
    ...(Array.isArray(order?.경유상차목록) ? order.경유상차목록 : []),
    ...(Array.isArray(order?.경유하차목록) ? order.경유하차목록 : []),
  ];
  vias.forEach((v) => {
    const vp = getPalletFromCargoText(v?.화물내용 || "");
    if (vp != null) nums.push(vp);
  });
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

// ⭐ 운임조회 전용 — 기본 차량톤수 + 모든 경유지(상차/하차) 톤수를 합산한 총 톤수
export function getTotalTonFromOrder(order = {}) {
  const nums = [];
  const base = extractTonNum(order?.차량톤수 || "");
  if (base != null) nums.push(base);
  const vias = [
    ...(Array.isArray(order?.경유상차목록) ? order.경유상차목록 : []),
    ...(Array.isArray(order?.경유하차목록) ? order.경유하차목록 : []),
  ];
  vias.forEach((v) => {
    const raw = v?.톤수타입 ? v?.톤수값 : v?.차량톤수;
    const vt = extractTonNum(raw || "");
    if (vt != null) nums.push(vt);
  });
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

// 화물내용 추가 항목 표시 — 1개면 내용, 2개이상이면 "N개 등록"
export function CargoExtraChips({ value }) {
  const parts = (value || "").split("+").filter(Boolean);
  const extras = parts.slice(1);
  if (!extras.length) return null;
  if (extras.length === 1) {
    return <span className="text-[12px] font-bold text-[#1B2B4B] bg-[#e8ecf5] px-2 py-0.5 rounded-full">{extras[0]}</span>;
  }
  return <span className="text-[12px] font-bold text-[#1B2B4B] bg-[#e8ecf5] px-2 py-0.5 rounded-full">{extras.length}개 등록</span>;
}
// ===================== DispatchApp.jsx (PART 2/8) — END =====================

// ===================== DispatchApp.jsx (PART 3/8) — START =====================
// ⭐ 오더복사수정패널 위쪽 버튼 — [변경 이력] 창 (2026-10-27)
export function CopyPanelExtras({ order, userNameMap }) {
  const [open, setOpen] = React.useState(""); // "" | "history"
  const nameOf = (u) => userNameMap?.get?.(String(u || "").trim().toLowerCase());
  const btn = "px-3.5 py-2 rounded-lg text-[13px] font-bold border border-[#DCE3EE] bg-white text-[#0F1A30] hover:border-[#1B2B4B] transition";
  return (
    <>
      <button type="button" className={btn} onClick={() => setOpen("history")}>변경 이력</button>
      {open === "history" && createPortal(<OrderTimelineModal order={order} userName={nameOf} onClose={() => setOpen("")} />, document.body)}
    </>
  );
}
  // ===================== DispatchApp.jsx (PART 3/8) — END =====================

// 운임조회 공용 유틸: 상/하차지 전체 경유 포함 정류장 목록 (Part 4/5 컴포넌트에서 사용)
// parseStops 로직을 자체 포함하여 DispatchManagement 스코프에 의존하지 않음
export function getRouteStops(row, type) {
  const mainName = String(type === "pickup" ? (row.상차지명 || "") : (row.하차지명 || "")).trim();
  let mainStops;
  if (mainName) {
    const matches = [...mainName.matchAll(/(\d+)\.\s*([^\d]+)/g)];
    mainStops = matches.length > 0
      ? matches.sort((a, b) => Number(a[1]) - Number(b[1])).map(m => m[2].trim())
      : [mainName];
  } else {
    mainStops = [];
  }
  const viaKey = type === "pickup" ? "경유지_상차" : "경유지_하차";
  const viaAlt = type === "pickup" ? "경유상차목록" : "경유하차목록";
  const via = row[viaKey] || row[viaAlt] || [];
  const viaNames = Array.isArray(via)
    ? via.map(s => (typeof s === "string" ? s : (s?.업체명 || "")).trim()).filter(Boolean)
    : [];
  return [...mainStops, ...viaNames];
}
// ⭐ 첨부파일을 저장(다운로드)할 때 파일명을 "날짜(YYYYMMDD)거래처명_하차지명" 형식으로
// 통일한다. 예: 2026-05-04 / 거래처 "우리찬" / 하차지 "씨제이동탄" → "20260504우리찬_씨제이동탄".
// 한 오더에 사진이 여러 장이면 뒤에 "-2","-3"처럼 순번을 붙여 구분하고, 확장자는
// 원본 파일명 또는 data URL의 MIME 타입에서 유추한다. 오더 관련 첨부파일을 저장하는
// 모든 지점(AttachmentViewer 개별/전체저장, 첨부현황 전체저장)에서 공통으로 사용한다.
export function attachFileExt(item) {
  const fromName = (item?.name || "").match(/\.([a-zA-Z0-9]+)$/);
  if (fromName) return fromName[1].toLowerCase();
  const src = item?.base64 || item?.url || "";
  const m = src.match(/^data:(image\/\w+|application\/pdf)/);
  if (m) return m[1] === "application/pdf" ? "pdf" : (m[1].split("/")[1] || "jpg");
  return "jpg";
}
export function buildAttachFileName(row, item, index = 0, total = 1) {
  const dateStr = (row?.상차일 || "").replace(/-/g, "");
  const client = (row?.거래처명 || "").trim();
  const drop = (row?.하차지명 || "").trim();
  const base = `${dateStr}${client}${client && drop ? "_" : ""}${drop}`.trim() || "첨부파일";
  const seq = total > 1 ? `-${index + 1}` : "";
  return `${base}${seq}.${attachFileExt(item)}`;
}
// 원본 오더 ↔ 화주사 전송 카피 사이에 첨부가 어느 한쪽에만 반영돼 attachCount가
// 서로 어긋나는 경우가 있어(AttachmentViewer의 getMirrorTarget과 동일 로직),
// 첨부현황 화면에서 실제 상태를 검증할 때도 짝 문서를 함께 확인한다.
export function attachMirrorTargetOf(row) {
  if (row?._transmittedOrderId) return { col: "orders", id: row._transmittedOrderId };
  if (row?.originCol && row?.originId) return { col: row.originCol, id: row.originId };
  return null;
}
// ── 첨부파일 뷰어 컴포넌트 ──
// ── 첨부파일 뷰어 컴포넌트 ──
export function AttachmentViewer({ row, onClose, db, isViewed, onToggleViewed, onSaved, isViewer = false }) {
  const payOnAv = useBetaOn(getTenant() || row?.companyName); // 💳 2026-11-11 시험 기능 — 사무실 첨부 표시 · [계산서로 올리기]
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(null);
  const [copyDone, setCopyDone] = React.useState(null);
  const [unlocking, setUnlocking] = React.useState(false);
  const [zipLoading, setZipLoading] = React.useState(false);
  const [rotations, setRotations] = React.useState({});

  // row prop은 팝업을 열 때의 스냅샷이라 이후 상태 변화(재업로드 허용/완료)가
  // 반영되지 않는다 — 잠금 관련 필드만 문서를 직접 구독해 실시간으로 따라간다.
  const [liveLock, setLiveLock] = React.useState(null);
  React.useEffect(() => {
    if (!row?._id) return;
    const col = row.__col || "orders";
    const unsub = onSnapshot(doc(db, col, row._id), (snap) => {
      const d = snap.data();
      if (d) setLiveLock({ 업로드잠금: d.업로드잠금, 업로드잠금해제만료: d.업로드잠금해제만료 ?? null, 재업로드완료알림: d.재업로드완료알림 === true });
    });
    return () => unsub();
  }, [row?._id]);
  const lockState = liveLock || row;

  // 재업로드 허용 남은시간 실시간 카운트다운 — 위 구독으로 실시간 반영되는
  // 업로드잠금해제만료가 미래 시각인 동안만 1초마다 다시 그린다.
  const [nowTick, setNowTick] = React.useState(Date.now());
  const unlockExpiryTs = lockState?.업로드잠금해제만료 ? new Date(lockState.업로드잠금해제만료).getTime() : 0;
  const unlockRemainMs = unlockExpiryTs - nowTick;
  const isUnlockActive = unlockExpiryTs > 0 && unlockRemainMs > 0;
  React.useEffect(() => {
    if (!isUnlockActive) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isUnlockActive, unlockExpiryTs]);
  const fmtRemain = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // 재업로드 완료 알림 확인(읽음) 처리 — 열려있는 동안은 배너를 계속 보여주고,
  // 팝업을 닫을 때(언마운트) 비로소 확인 처리한다.
  const lockStateRef = React.useRef(lockState);
  lockStateRef.current = lockState;
  React.useEffect(() => {
    return () => {
      const ls = lockStateRef.current;
      if (!ls?.재업로드완료알림) return;
      const col = row.__col || "orders";
      updateDoc(doc(db, col, row._id), { 재업로드완료알림: false }).catch(() => {});
      const mirror = getMirrorTarget();
      if (mirror) updateDoc(doc(db, mirror.col, mirror.id), { 재업로드완료알림: false }).catch(() => {});
    };
  }, [row?._id]);

  React.useEffect(() => {
    if (!row?._id) return;
    const col = row.__col || "orders";
    const colRef = collection(db, col, row._id, "attachments");
    const unsub = onSnapshot(colRef, (snap) => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(loaded);
      setRotations(prev => {
        const next = { ...prev };
        loaded.forEach(item => { if (item.rotation && !next[item.id]) next[item.id] = item.rotation; });
        return next;
      });
      setLoading(false);
    });
    return () => unsub();
  }, [row]);

  // 예전에(동기화 기능 추가 전) 올라간 첨부는 원본/전송카피 한쪽에만 있을 수 있어
  // 첨부창을 열 때 양쪽을 비교해 누락분을 한 번 보정한다.
  React.useEffect(() => {
    if (!row?._id) return;
    const mirror = getMirrorTarget();
    if (!mirror) return;
    const col = row.__col || "orders";
    (async () => {
      try {
        const [localSnap, mirrorSnap] = await Promise.all([
          getDocs(collection(db, col, row._id, "attachments")),
          getDocs(collection(db, mirror.col, mirror.id, "attachments")),
        ]);
        const localIds = new Set(localSnap.docs.map(d => d.id));
        const mirrorIds = new Set(mirrorSnap.docs.map(d => d.id));
        let addedLocal = 0, addedMirror = 0;
        for (const d of mirrorSnap.docs) {
          if (!localIds.has(d.id)) { await setDoc(doc(db, col, row._id, "attachments", d.id), d.data()); addedLocal++; }
        }
        for (const d of localSnap.docs) {
          if (!mirrorIds.has(d.id)) { await setDoc(doc(db, mirror.col, mirror.id, "attachments", d.id), d.data()); addedMirror++; }
        }
        if (addedLocal) await updateDoc(doc(db, col, row._id), { attachCount: localIds.size + addedLocal });
        if (addedMirror) await updateDoc(doc(db, mirror.col, mirror.id), { attachCount: mirrorIds.size + addedMirror });
      } catch (e) { console.warn("첨부 동기화 보정 실패(무시):", e); }
    })();
  }, [row?._id]);

  const getRotation = (id) => rotations[id] || 0;

  const handleRotate = async (item) => {
    if (isViewer) return;
    const newRot = (getRotation(item.id) + 90) % 360;
    setRotations(prev => ({ ...prev, [item.id]: newRot }));
    if (selected?.id === item.id) setSelected(prev => ({ ...prev, rotation: newRot }));
    try {
      const col = row.__col || "orders";
      await updateDoc(doc(db, col, row._id, "attachments", item.id), { rotation: newRot });
    } catch (e) { console.error("rotate:", e); }
  };

  // ✅ 서명 이미지는 저장 파일명 규칙(날짜/거래처_하차지) 대상에서 제외 — 첨부 "장수"에도
  // 포함되지 않는 별도 항목이라 순번이 섞이면 오히려 혼란스럽다.
  const isSignatureItem = (item) => item?.source === "driver_signature" || item?.name === "서명.png";
  const downloadTargets = items.filter(item => !isSignatureItem(item));
  const downloadFileName = (item) => {
    const idx = downloadTargets.indexOf(item);
    return idx >= 0 ? buildAttachFileName(row, item, idx, downloadTargets.length) : (item.name || "attachment.jpg");
  };

  const downloadRotated = (item) => {
    const rot = getRotation(item.id);
    if (!rot) { handleDownload(item); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth, h = img.naturalHeight;
      canvas.width = rot === 90 || rot === 270 ? h : w;
      canvas.height = rot === 90 || rot === 270 ? w : h;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rot * Math.PI / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.download = downloadFileName(item);
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      onSaved?.();
    };
    img.src = item.base64 || item.url;
  };

  React.useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        handleCopy(selected, `ctrl_${selected.id}`);
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  const handleDownload = (item) => {
    const a = document.createElement("a");
    a.href = item.base64 || item.url;
    a.download = downloadFileName(item);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    onSaved?.();
  };

  // ✅ 전체 개별 다운로드 (서명 이미지는 제외)
  const handleDownloadAll = () => {
    if (!downloadTargets.length) return;
    downloadTargets.forEach((item, i) => setTimeout(() => handleDownload(item), i * 400));
  };

  // ✅ 다운로드 폴더 열기 — 브라우저 보안 정책상 웹페이지가 OS 탐색기를 직접 실행할
  // 수는 없어서, 대신 File System Access API(Chrome/Edge)의 네이티브 폴더 선택창을
  // 다운로드 폴더로 바로 띄운다. 저장 버튼으로 받은 파일이 실제로 어디 있는지
  // 바로 확인할 수 있게 해주는 용도라 파일을 고르지 않고 닫아도 무방하다.
  const openDownloadsFolder = async () => {
    if (!window.showDirectoryPicker) {
      alert("이 브라우저에서는 지원되지 않는 기능입니다.\n다운로드 완료 후 브라우저 다운로드 목록에서 '폴더에서 표시'를 이용해주세요.");
      return;
    }
    try {
      await window.showDirectoryPicker({ startIn: "downloads" });
    } catch (e) {
      // 사용자가 선택창을 취소한 경우(AbortError)는 정상 흐름이라 조용히 무시
    }
  };

  const handleCopy = async (item, id) => {
    const src = item.base64 || item.url;
    const tryImageCopy = async (blob) => {
      const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/png";
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      } else {
        throw new Error("unsupported");
      }
    };
    try {
      let blob;
      if (src && src.startsWith("data:")) {
        const parts = src.split(",");
        const mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
        const bytes = atob(parts[1]);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        blob = new Blob([arr], { type: mime });
      } else {
        const res = await fetch(src);
        blob = await res.blob();
      }
      await tryImageCopy(blob);
      setCopyDone(id); setTimeout(() => setCopyDone(null), 2000);
    } catch {
      alert("이미지 복사를 지원하지 않는 브라우저입니다.\n이미지를 우클릭하여 저장하거나, 저장 버튼을 이용해주세요.");
    }
  };
  // ✅ 화주사 전송 카피 <-> 원본 오더 간 첨부파일 동기화용 링크 정보
  const getMirrorTarget = () => {
    if (row._transmittedOrderId) return { col: "orders", id: row._transmittedOrderId };
    if (row.originCol && row.originId) return { col: row.originCol, id: row.originId };
    return null;
  };

  // 기사님이 이미 업로드를 완료해 링크가 잠긴 뒤에도, 기존 링크(카톡/문자에 남아있는
  // 그 링크)를 그대로 30분간만 다시 열어준다 — 새 링크를 발급/재전송할 필요가 없다.
  // 업로드잠금 자체는 건드리지 않고, 별도의 임시 해제 만료시각만 기록한다
  // (UploadPage가 접근 시 이 시각이 아직 안 지났으면 잠금을 무시하도록 확인).
  // 기사님이 재업로드를 완료하면(handleUpload) 이 만료시각을 즉시 지워 바로 재잠금된다.
  const handleAllowReupload = async () => {
    if (isViewer || unlocking) return;
    setUnlocking(true);
    try {
      const col = row.__col || "orders";
      const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await updateDoc(doc(db, col, row._id), { 업로드잠금해제만료: until });
      const mirror = getMirrorTarget();
      if (mirror) {
        await updateDoc(doc(db, mirror.col, mirror.id), { 업로드잠금해제만료: until }).catch(() => {});
      }
    } catch (e) {
      alert("재업로드 허용 실패: " + e.message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleDelete = async (item) => {
    if (isViewer) { alert("조회전용 권한으로는 삭제할 수 없습니다."); return; }
    if (!await kpConfirm("이 사진을 삭제하시겠습니까?")) return;
    try {
      const col = row.__col || "orders";
      // ⭐ 2026-11-05 삭제 진행 창 + 사진 삭제·첨부 수 감소를 한 묶음으로
      await runDelete({ label: "사진", task: () => commitDeletes(db, [doc(db, col, row._id, "attachments", item.id), (b) => b.update(doc(db, col, row._id), { attachCount: increment(-1), ...(payOnAv && item.uploadedBy === "dispatch" && (row.officeAttach || 0) > 0 ? { officeAttach: increment(-1) } : {}) })]) });
      const mirror = getMirrorTarget();
      if (mirror) {
        try {
          await deleteDoc(doc(db, mirror.col, mirror.id, "attachments", item.id));
          await updateDoc(doc(db, mirror.col, mirror.id), { attachCount: increment(-1) });
        } catch (e) { console.warn("첨부 동기화 삭제 실패(무시):", e); }
      }
    } catch(e) { alert("삭제 실패: " + e.message); }
  };

  // 첨부파일은 등록 후 6개월이 지나면 서버(cleanupOldAttachments 스케줄 함수)가
  // 자동으로 삭제한다. 이 잠금 토글은 개별 파일 단위로 그 자동삭제 대상에서
  // 제외/포함시키는 스위치다 — 전체 오더/전체 첨부에 일괄 적용되지 않는다.
  const isOlderThanSixMonths = (createdAt) => {
    if (!createdAt) return false;
    const ts = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return ts < cutoff;
  };
  const daysUntilAutoDelete = (createdAt) => {
    if (!createdAt) return null;
    const ts = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    const cutoff = new Date(ts);
    cutoff.setMonth(cutoff.getMonth() + 6);
    return Math.ceil((cutoff.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };
  const handleToggleLock = async (item) => {
    if (isViewer) return;
    const nextLocked = !item.잠금;
    try {
      const col = row.__col || "orders";
      const mirror = getMirrorTarget();
      await updateDoc(doc(db, col, row._id, "attachments", item.id), { 잠금: nextLocked });
      if (mirror) {
        updateDoc(doc(db, mirror.col, mirror.id, "attachments", item.id), { 잠금: nextLocked }).catch(() => {});
      }
      // 이미 6개월이 지난 파일을 잠갔다가 풀면, 다음 자동삭제 주기를 기다리지 않고
      // 그 즉시 삭제 대상으로 처리한다.
      if (!nextLocked && isOlderThanSixMonths(item.createdAt)) {
        await deleteDoc(doc(db, col, row._id, "attachments", item.id));
        await updateDoc(doc(db, col, row._id), { attachCount: increment(-1) });
        if (mirror) {
          deleteDoc(doc(db, mirror.col, mirror.id, "attachments", item.id)).catch(() => {});
          updateDoc(doc(db, mirror.col, mirror.id), { attachCount: increment(-1) }).catch(() => {});
        }
      }
    } catch (e) { alert("잠금 설정 실패: " + e.message); }
  };

  const handleUpload = async (files, asInvoice = false) => {
    if (isViewer) { alert("조회전용 권한으로는 업로드할 수 없습니다."); return; }
    if (!files?.length) return;
    const col = row.__col || "orders";
    const mirror = getMirrorTarget();
    for (const file of files) {
      try {
        // ⭐ 2026-11-02 점검 — 이미지는 먼저 줄이고, base64는 한 번만 저장(화면은 base64 || url로 읽음), 문서 한도(1MiB) 넘는 파일은 미리 막음
        const isImg = String(file.type || "").startsWith("image/");
        const base64 = isImg ? await shrinkImageForDoc(file, { max: 1600, quality: 0.82 }) : await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        if (String(base64).length > 1_000_000) { alert(`${file.name}: 파일이 너무 큽니다(약 700KB 이하로 줄여 주세요).`); continue; }
        const payload = {
          base64,
          name: file.name,
          type: (String(base64).match(/^data:([^;,]+)/) || [])[1] || file.type || "",
          size: file.size,
          sizeKB: Math.round(String(base64).length * 0.75 / 1024),
          uploadedBy: "dispatch",
          ...(asInvoice ? { kind: "invoice" } : {}),
          createdAt: serverTimestamp(),
        };
        // 원본/전송카피 양쪽에서 동일한 첨부 ID를 공유하도록 클라이언트에서 ID 미리 생성
        const newId = doc(collection(db, col, row._id, "attachments")).id;
        await setDoc(doc(db, col, row._id, "attachments", newId), payload);
        // 💳 2026-11-11 사무실이 올린 첨부 수(아이콘 파란색) · [계산서로 올리기]면 계산서 날짜가 비어 있을 때 오늘로(정산 창에서 고칠 수 있다)
        await updateDoc(doc(db, col, row._id), { attachCount: increment(1), ...(payOnAv ? { officeAttach: increment(1) } : {}), ...(payOnAv && asInvoice && !row.계산서일 ? { 계산서일: histToday() } : {}) });
        if (mirror) {
          try {
            await setDoc(doc(db, mirror.col, mirror.id, "attachments", newId), payload);
            await updateDoc(doc(db, mirror.col, mirror.id), { attachCount: increment(1) });
          } catch (e) { console.warn("첨부 동기화 실패(무시):", e); }
        }
      } catch(e) { alert("업로드 실패: " + e.message); }
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#1B2B4B] flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[15px] text-[#1B2B4B] whitespace-nowrap">
                첨부파일 <span className="text-[13px] font-normal text-gray-500">{loading ? "" : `${items.length}장`}</span>
              </div>
              <div className="text-[12px] text-gray-500 mt-0.5 truncate">
                {row.상차지명} → {row.하차지명}{row.이름 ? ` · ${row.이름}` : ""}
              </div>
            </div>
          </div>
          {/* ⭐ 버튼이 많아 헤더가 복잡해 보이던 문제 — 자주 안 쓰는 재업로드 허용은
              하단 완료처리 영역으로 옮기고, 헤더에는 핵심 액션(파일추가/전체저장/
              폴더열기/닫기)만 남겨 상/하차지명이 잘리지 않게 한다. */}
          <div className="flex items-center gap-2 shrink-0">
            {!isViewer && (
              <label className="px-3 py-1.5 bg-emerald-600 text-white text-[12px] font-bold rounded-lg hover:opacity-90 transition cursor-pointer whitespace-nowrap shrink-0">
                파일 추가
                <input autoComplete="off" type="file" multiple accept="image/*,.pdf" className="hidden"
                  onChange={e => handleUpload(Array.from(e.target.files))} />
              </label>
            )}
            {/* 💳 2026-11-11 [계산서로 올리기]는 없앴다 — 계산서는 배차현황 [정산] 창 › 증빙서류에서 올리면 자동 스캔(src/InvoiceEvidence.jsx) */}
            {items.length > 1 && (
              <button
                onClick={handleDownloadAll}
                disabled={zipLoading}
                className="px-3 py-1.5 bg-[#1B2B4B] text-white text-[12px] font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {zipLoading ? "압축중..." : `전체저장 (${items.length}장)`}
              </button>
            )}
            <button
              onClick={openDownloadsFolder}
              title="저장한 파일이 담긴 다운로드 폴더를 엽니다"
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-[12px] font-bold rounded-lg hover:bg-gray-50 transition whitespace-nowrap shrink-0"
            >
              폴더 열기
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg transition shrink-0">
              ×
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 화주사 파렛트 등록 정보 */}
          {(() => {
            const cargoList = Array.isArray(row.화물목록) ? row.화물목록 : [];
            const palletRows = cargoList.filter(r => r?.unit === "파레트" && r?.qty);
            if (!palletRows.length && !row.파렛트사요약) return null;
            const totals = {};
            palletRows.forEach(r => {
              if (!r.palletCo) return;
              const label = r.palletCo === "KPP" ? "K" : r.palletCo === "아주" ? "AJ" : r.palletCo;
              totals[label] = (totals[label] || 0) + Number(r.qty);
            });
            const coLabel = (co) => co === "KPP" ? "K (KPP)" : co === "아주" ? "AJ (아주)" : (co || "파렛트사 미지정");
            const summary = Object.entries(totals).map(([label, n]) => `${label} ${n}장`).join("+") || row.파렛트사요약 || "";
            return (
              <div className="mb-4 rounded-xl border border-[#1B2B4B]/20 bg-[#eef1f7] px-4 py-3">
                <div className="text-[12px] font-bold text-[#1B2B4B] mb-1.5">화주사 파렛트 등록 정보</div>
                {summary && <div className="text-[13px] font-extrabold text-[#1B2B4B] mb-2">{summary}</div>}
                {palletRows.length > 0 && (
                  <div className="space-y-1">
                    {palletRows.map((r, i) => (
                      <div key={i} className="text-[12px] text-gray-600">
                        {r.qty}{r.unit} · {coLabel(r.palletCo)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
              <span className="text-[14px]">불러오는 중...</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="text-[14px] text-gray-500 font-medium">업로드된 파일이 없습니다</div>
              <div className="text-[12px] text-gray-400">기사님께 인수증 업로드를 요청하세요</div>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="aspect-[4/3] bg-gray-50 cursor-zoom-in relative group"
                    onClick={() => setSelected(item)}>
                    <img src={item.base64 || item.url} alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-200"
                      style={{ transform: `rotate(${getRotation(item.id)}deg)` }}
                      onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-400 text-[12px]">미리보기 없음</div>'; }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-[11px] font-bold bg-black/40 px-2 py-1 rounded-full transition-opacity">확대보기</span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5 bg-white">
                    <div className="text-[11px] text-gray-500 truncate mb-2">
                      {item.name || "파일"} {item.sizeKB ? `· ${item.sizeKB}KB` : ""}
                      {!item.잠금 && item.createdAt && (() => {
                        const d = daysUntilAutoDelete(item.createdAt);
                        if (d === null) return null;
                        return <span className={d <= 0 ? "text-red-500 font-semibold" : "text-gray-500"}> · {d <= 0 ? "삭제 대상" : `${d}일 후 자동삭제`}</span>;
                      })()}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => downloadRotated(item)}
                        className="flex-1 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-bold hover:opacity-90 transition">
                        저장
                      </button>
                      <button onClick={() => handleCopy(item, item.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                          copyDone === item.id
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}>
                        {copyDone === item.id ? "복사됨" : "복사"}
                      </button>
                      {!isViewer && (
                        <button onClick={e => { e.stopPropagation(); handleRotate(item); }}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] font-bold hover:bg-gray-50 transition"
                          title="90도 회전">
                          ↻
                        </button>
                      )}
                      {!isViewer && (
                        <button onClick={e => { e.stopPropagation(); handleToggleLock(item); }}
                          className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                            item.잠금 ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                          }`}
                          title={item.잠금 ? "잠금 해제 (6개월 경과 시 자동삭제 대상이 됩니다)" : "잠금 (6개월이 지나도 자동삭제되지 않습니다)"}>
                          {item.잠금 ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                            </svg>
                          )}
                        </button>
                      )}
                      {!isViewer && (
                        <button onClick={() => handleDelete(item)}
                          className="px-2 py-1.5 rounded-lg border border-red-200 text-red-500 text-[11px] font-bold hover:bg-red-50 transition">
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 완료 처리 + 재업로드 허용 푸터 */}
        {(onToggleViewed || (!isViewer && lockState?.업로드잠금)) && (
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[12px] text-gray-500">파일 확인 여부를 수동으로 표시할 수 있습니다</span>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!isViewer && lockState?.재업로드완료알림 === true && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-[12px] font-bold rounded-lg whitespace-nowrap animate-pulse">
                  ✓ 기사님이 재업로드를 완료했습니다
                </span>
              )}
              {!isViewer && lockState?.업로드잠금 && lockState?.재업로드완료알림 !== true && (
                isUnlockActive ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1B2B4B] text-white text-[12px] font-bold rounded-lg whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    재업로드 대기중 · {fmtRemain(unlockRemainMs)}
                  </span>
                ) : (
                  <button
                    onClick={handleAllowReupload}
                    disabled={unlocking}
                    title="기사님이 갖고 있는 기존 업로드 링크를 30분간 다시 열어줍니다"
                    className="px-3 py-1.5 bg-white border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold rounded-lg hover:bg-[#1B2B4B] hover:text-white transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {unlocking ? "처리중..." : "재업로드 허용 (30분)"}
                  </button>
                )
              )}
              {onToggleViewed && (
                <button
                  onClick={onToggleViewed}
                  className={`px-4 py-2 rounded-lg text-[13px] font-bold transition whitespace-nowrap ${
                    isViewed
                      ? "bg-[#1B2B4B] text-white hover:bg-[#243a60]"
                      : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {isViewed ? "미완료" : "완료처리"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 전체화면 뷰 */}
      {selected && (
        <div className="fixed inset-0 bg-black/95 z-[999999] flex items-center justify-center"
          onClick={e => { e.stopPropagation(); setSelected(null); }}>
          <img src={selected.base64 || selected.url} alt="full"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg transition-transform duration-200"
            style={{ transform: `rotate(${getRotation(selected.id)}deg)` }} />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white text-xl transition"
            onClick={e => { e.stopPropagation(); setSelected(null); }}>×</button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/40 text-[12px]">
            Ctrl+C 로 복사 &nbsp;|&nbsp; ESC 로 닫기
          </div>
          <div className="absolute bottom-6 flex gap-3">
            <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); handleCopy(selected, `fs_${selected.id}`); }}>
              {copyDone === `ctrl_${selected.id}` || copyDone === `fs_${selected.id}` ? "복사됨" : "복사"}
            </button>
            <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); handleRotate(selected); }}>
              회전 ↻
            </button>
            <button className="px-5 py-2.5 bg-[#1B2B4B] hover:opacity-90 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); downloadRotated(selected); }}>
              저장하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 기사 실시간 위치 팝업 — UploadPage.jsx(기사 업로드 링크)에서 "실시간 위치 공유"를
// 켠 동안 liveLocations 컬렉션(오더 문서와 완전히 분리된 전용 컬렉션 — GPS 갱신이
// 운송사 PC의 전체 오더 목록 리스너에 절대 영향을 주지 않도록 하기 위함)에 기록되는
// 위치/위치갱신일시 필드를 지도(Tmap)에 마커로 표시한다.
// index.html에 전역 로드된 window.Tmapv2를 그대로 사용 — 별도 API 키/스크립트 불필요.
export function LiveLocationPopup({ row, onClose }) {
  const [loc, setLoc] = React.useState(null);
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const mapObjRef = React.useRef(null);
  const markerObjRef = React.useRef(null);
  const mapElId = "dispatch-live-loc-map";

  React.useEffect(() => {
    if (!row?._id) return;
    const unsub = onSnapshot(doc(db, "liveLocations", row._id), (snap) => {
      const d = snap.data();
      if (d?.위치) { setLoc(d.위치); setUpdatedAt(d.위치갱신일시 || null); }
    });
    return () => unsub();
  }, [row?._id]);

  React.useEffect(() => {
    if (!loc) return;
    const draw = () => {
      if (!window.Tmapv2?.Map) { loadTmap().catch(() => {}); setTimeout(draw, 200); return; }
      const pos = new window.Tmapv2.LatLng(loc.lat, loc.lng);
      if (!mapObjRef.current) {
        mapObjRef.current = new window.Tmapv2.Map(mapElId, { center: pos, width: "100%", height: "600px", zoom: 15 });
        attachTmapTraffic(mapObjRef.current, mapElId); // 🚦 2026-11-22 사고 · 공사 · 통제
      } else {
        mapObjRef.current.setCenter(pos);
      }
      if (markerObjRef.current) markerObjRef.current.setMap(null);
      markerObjRef.current = new window.Tmapv2.Marker({
        position: pos,
        map: mapObjRef.current,
        iconHTML: '<div style="width:16px;height:16px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 2px #10b981,0 2px 6px rgba(0,0,0,0.35)"></div>',
      });
    };
    draw();
  }, [loc]);

  const updatedLabel = (() => {
    const ms = updatedAt?.seconds ? updatedAt.seconds * 1000 : (typeof updatedAt === "number" ? updatedAt : null);
    if (!ms) return null;
    return new Date(ms).toLocaleString("ko-KR", { hour12: false });
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]">
      <div className="bg-white rounded-2xl shadow-2xl w-[80vw] max-w-[860px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-5 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-[18px]">실시간 기사 위치</h3>
            <p className="text-white/70 text-[13px] mt-0.5">{row?.이름 || "-"} · {row?.차량번호 || "-"}</p>
          </div>
          <button className="text-white/60 hover:text-white text-2xl leading-none" onClick={onClose}>×</button>
        </div>
        {loc ? (
          <>
            <div id={mapElId} style={{ width: "100%", height: 600 }} />
            <div className="px-6 py-4 text-[13px] text-gray-500 border-t border-gray-100">
              {updatedLabel ? `${updatedLabel} 기준 위치` : "위치 정보 수신 중"}
            </div>
          </>
        ) : (
          <div className="px-5 py-16 text-center text-[13px] text-gray-500">
            아직 위치 공유 정보가 없습니다.<br />
            기사님이 업로드 링크 화면에서 "실시간 위치 공유"를 켜면 여기 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ⭐ 경유지 화물내용/톤수 정리 — 예전 버그로 아무것도 안 고르고 저장하면 문자 그대로
// "없음"이 저장됐고, 다시 열어 저장하면 단위가 붙어 "없음파레트"가 되었다.
// "없음"으로 시작하는 값은 빈 값으로 보고, 값이 없으면 단위 드롭다운도 "없음"("")으로 둔다.
export const stripNoneVal = (v) => {
  const t = String(v ?? "").replace(/^\s*없음\s*/, "").trim();
  return /^(파레트|파렛트|박스|통|롤|톤|kg)$/i.test(t) ? "" : t;
};
export function cleanStopCargo(s) {
  if (!s || typeof s !== "object") return s;
  const c = stripNoneVal(s.화물내용), t = stripNoneVal(s.차량톤수), tv = stripNoneVal(s.톤수값);
  const ct = s.화물타입 === "없음" ? "" : (s.화물타입 || "");
  const tt = s.톤수타입 === "없음" ? "" : (s.톤수타입 || "");
  return { ...s, 화물내용: c, 화물타입: c ? ct : "", 차량톤수: t, 톤수값: tv, 톤수타입: (t || tv) ? tt : "" };
}

// 왕복 오더 표시 — 행 배경 강조와는 별도로, 한눈에 띄는 진한 배지
export const RoundTripBadge = () => (
  <span
    className="
      inline-flex items-center shrink-0 align-middle ml-1 px-2 py-[3px]
      text-[12px] leading-none font-bold tracking-normal
      rounded-md
      bg-[#1B2B4B] text-white
      whitespace-nowrap
    "
  >
    왕복
  </span>
);

// 경유지 날짜(상차일/하차일)가 오더 본 날짜와 다를 때만 "MM/DD 시간"으로 보여준다 —
// A상차(당일)→C하차→C상차→B하차(다음날)처럼 경유지마다 날짜가 갈리는 케이스를
// 날짜 없이 시간만 보여주면 헷갈리니, 같을 땐 기존처럼 시간만 그대로 보여준다.
export function formatWaypointTime(stop, type, orderDate) {
  const timeKey = type === "pickup" ? "상차시간" : "하차시간";
  const dateKey = type === "pickup" ? "상차일" : "하차일";
  const time = stop?.[timeKey] || "";
  if (!time) return "";
  const date = stop?.[dateKey] || "";
  if (date && orderDate && date !== orderDate) {
    const m = String(date).match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (m) return `${parseInt(m[1], 10)}/${parseInt(m[2], 10)} ${time}`;
  }
  return time;
}

export function StopBadge({ count, list, type = "pickup", onSave, placeRows = [], timeOptions = [], orderDate = "", confirmEdit = false }) {
  const [open, setOpen] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const validList = (list || []).filter(s => s?.업체명?.trim() || s?.주소?.trim());
  if (!validList.length) return null;

  const label = type === "pickup" ? "상차경유" : "하차경유";
  const timeKey = type === "pickup" ? "상차시간" : "하차시간";
  const timeLabel = type === "pickup" ? "상차시간" : "하차시간";

  function buildCopyText() {
    return validList.map((s, i) => {
      const lines = [`${i + 1}. ${label}지 : ${s.업체명 || "-"}`];
      if (s.주소) lines.push(`  ${s.주소}`);
      if (s.담당자) {
        const tel = s.담당자번호 ? ` (${s.담당자번호})` : "";
        lines.push(`  담당자 : ${s.담당자}${tel}`);
      }
      const timeVal = s[timeKey];
      if (timeVal) lines.push(`  ${timeLabel} : ${timeVal}`);
      if (s.화물내용) lines.push(`  화물내용 : ${s.화물내용}`);
      if (s.차량톤수 || s.톤수값) lines.push(`  화물톤수 : ${toTonUnit(s.차량톤수 || s.톤수값)}`);
      return lines.join("\n");
    }).join("\n\n");
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openBadge(e) {
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openBadge}
        className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#1B2B4B] text-white whitespace-nowrap hover:bg-[#243d6a] transition"
      >
        경유+{validList.length}
      </button>

      {/* 뷰 팝업 */}
      {open && <WaypointViewModal list={validList} type={type} orderDate={orderDate} onClose={() => setOpen(false)} onCopy={handleCopy} copied={copied}
        onEdit={onSave ? () => { setOpen(false); setEditModalOpen(true); } : null} />}

      {/* 수정 팝업 (3파트와 동일) */}
      <StopEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={newList => { if (onSave) onSave(newList); }}
        confirmEdit={confirmEdit}
        list={validList}
        type={type}
        placeRows={placeRows}
        timeOptions={timeOptions}
        orderDate={orderDate}
      />
    </>
  );
}


// ===================== 경유지 보기 팝업(2026-10-31 리디자인) — 경유+N 배지 공용 =====================
//  정류지마다 순번·업체·시간·주소·담당·화물·톤수, 고정노선에서 따로 넣은 경유지 운임(청구·기사)까지
export function WaypointViewModal({ list = [], type = "drop", orderDate = "", onClose, onCopy, copied, onEdit }) {
  const isPickup = type === "pickup";
  const MONO_W = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
  const cargoOf = (s) => { const raw = stripNoneVal(s.화물내용); if (/파레트|파렛트|박스|통/.test(raw)) return raw; const qty = raw || s.화물수량 || ""; const tp = s.화물타입 || ""; if (!qty) return ""; return tp && tp !== "없음" ? `${qty}${tp}` : qty; };
  const tonOf = (s) => { const raw = stripNoneVal(s.차량톤수); if (/톤|kg/.test(raw)) return toTonUnit(raw); const val = s.톤수값 || raw || ""; const tp = s.톤수타입 || ""; if (!val) return ""; return toTonUnit(tp && tp !== "없음" ? `${val}${tp}` : val); };
  const money = (v) => (Number(v) ? `${Number(v).toLocaleString()}원` : "");
  const sumC = list.reduce((a, s) => a + (Number(s.청구운임) || 0), 0);
  const sumD = list.reduce((a, s) => a + (Number(s.기사운임) || 0), 0);
  return createPortal(
    <div className="kp-pc-pop fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-[#0B1428]/55 backdrop-blur-[2px]" onClick={onClose} onKeyDown={(e) => { if (e.key === "Enter") e.stopPropagation(); }}>
      <div className="relative w-[600px] max-w-[94vw] max-h-[86vh] rounded-[22px] bg-[#F4F6FA] shadow-[0_30px_80px_rgba(11,20,40,.45)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="relative shrink-0 px-6 py-5 text-white overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO_W, fontVariantNumeric: "tabular-nums" }}>WAYPOINTS · {isPickup ? "PICKUP" : "DROP"}</div>
              <div className="text-[20px] font-black mt-0.5">경유 {isPickup ? "상차지" : "하차지"} {list.length}곳</div>
            </div>
            <button type="button" onClick={onCopy} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-black">{copied ? "✓ 복사됨" : "복사"}</button>
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black" aria-label="닫기">닫기</button>
          </div>
          {(sumC > 0 || sumD > 0) && (
            <div className="relative grid grid-cols-2 gap-2 mt-4">
              {[["경유지 청구운임 합계", money(sumC) || "-"], ["경유지 기사운임 합계", money(sumD) || "-"]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/[0.07] border border-white/10 px-4 py-2"><div className="text-[11.5px] font-bold text-white/55">{k}</div><div className="text-[17px] font-black tabular-nums" style={{ fontFamily: MONO_W, fontVariantNumeric: "tabular-nums" }}>{v}</div></div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="relative">
            <div className="absolute left-[17px] top-4 bottom-4 w-[2px] bg-[#C9D6EE]" />
            {list.map((s, i) => {
              const time = formatWaypointTime(s, isPickup ? "pickup" : "drop", orderDate) || (isPickup ? s.상차시간 : s.하차시간);
              const cargo = cargoOf(s); const ton = tonOf(s);
              const hasFare = Number(s.청구운임) || Number(s.기사운임);
              return (
                <div key={i} className="relative flex gap-3 mb-3 last:mb-0">
                  <span className="relative z-[1] w-9 h-9 shrink-0 rounded-xl bg-[#0F1A30] text-white flex items-center justify-center text-[13px] font-black" style={{ fontFamily: MONO_W, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex-1 min-w-0 rounded-2xl bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-4">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {s.구분 && <span className="text-[11px] font-extrabold tracking-[0.12em] text-[#2D4C82]">{s.구분}</span>}
                      <span className="text-[16px] font-black text-[#0F1A30]">{s.업체명 || "-"}</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#EEF2F8] text-[12.5px] font-black text-[#1B2B4B]">{time || "즉시"}</span>
                      {/* ⭐ 2026-11-01 고정노선 정류지별 지급방식(다른 지급방식은 별도 오더로 정산) */}
                      {s.지급방식 && <span className="ml-auto px-2 py-0.5 rounded-md bg-[#0F1A30] text-white text-[12px] font-black">{s.지급방식}{s.운임별도오더 ? " · 별도 오더" : ""}</span>}
                    </div>
                    {s.주소 && <div className="text-[13.5px] font-semibold text-[#3A4A66] mt-1 break-words">{s.주소}</div>}
                    {(mgrName(s.담당자) || s.담당자번호) && <div className="text-[13px] text-[#5B6B85] mt-0.5">담당 {mgrName(s.담당자)}{s.담당자번호 ? `${mgrName(s.담당자) ? " · " : ""}${s.담당자번호}` : ""}</div>}
                    {(cargo || ton || s.메모) && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {cargo && <span className="h-7 px-2.5 rounded-lg bg-[#F3F6FA] border border-[#E3E8F0] text-[12.5px] font-bold text-[#1B2B4B] inline-flex items-center">화물 {cargo}</span>}
                        {ton && <span className="h-7 px-2.5 rounded-lg bg-[#F3F6FA] border border-[#E3E8F0] text-[12.5px] font-bold text-[#1B2B4B] inline-flex items-center">톤수 {ton}</span>}
                        {s.메모 && <span className="h-7 px-2.5 rounded-lg bg-[#F3F6FA] border border-[#E3E8F0] text-[12.5px] font-semibold text-[#3A4A66] inline-flex items-center">{s.메모}</span>}
                      </div>
                    )}
                    {hasFare ? (
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#EEF1F6]">
                        <div><div className="text-[11.5px] font-bold text-[#7A89A3]">이 곳 청구운임</div><div className="text-[15px] font-black text-[#0B1428] tabular-nums" style={{ fontFamily: MONO_W, fontVariantNumeric: "tabular-nums" }}>{money(s.청구운임) || "-"}</div></div>
                        <div><div className="text-[11.5px] font-bold text-[#7A89A3]">이 곳 기사운임</div><div className="text-[15px] font-black text-[#0B1428] tabular-nums" style={{ fontFamily: MONO_W, fontVariantNumeric: "tabular-nums" }}>{money(s.기사운임) || "-"}</div></div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="shrink-0 px-5 py-4 bg-white border-t border-[#E3E8F0] flex gap-2">
          {onEdit && <button type="button" onClick={onEdit} className="flex-1 h-12 rounded-xl border border-[#DCE3EE] text-[14.5px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">수정</button>}
          <button type="button" onClick={onClose} className="flex-[1.4] h-12 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black">닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ===================== StopEditModal (경유지 수정 팝업 — 3파트와 동일 구조) =====================
export function StopEditModal({ open, onClose, onSave, list, type, placeRows = [], timeOptions = [], orderDate = "", confirmEdit = false }) {
  // ⭐ 이 팝업은 role/userCompany를 prop으로 못 받는 위치라(여러 단계 위에서 호출됨),
  // 훅 내부의 localStorage 전용 대체 규칙을 쓴다(resolveCompany와 거의 동일한 결과).
  const cargoTypeOptionsCustom = useCompanyDropdownOptions("화물타입");
  const tonTypeOptionsCustom = useCompanyDropdownOptions("톤수타입");
  const [editList, setEditList] = React.useState([]);
  const [placeOpts, setPlaceOpts] = React.useState([]);
  const [activeIdx, setActiveIdx] = React.useState(null);
  const [placeActive, setPlaceActive] = React.useState(0);
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
  const [deleteIdx, setDeleteIdx] = React.useState(null);
  const [contactPickerIdx, setContactPickerIdx] = React.useState(null);
  const [contactPickerOpts, setContactPickerOpts] = React.useState([]);
  // Use ref to capture list at open time — prevents parent re-renders from resetting editList mid-edit
  const listRef = React.useRef(list);
  listRef.current = list;
  const prevOpenRef = React.useRef(false);

  const emptyStop = () => ({
    업체명: "", 주소: "", 담당자: "", 담당자번호: "", 메모: "",
    화물내용: "", 화물타입: "", 톤수값: "", 톤수타입: "",
    차량톤수: "",
    상차일: type === "pickup" ? (orderDate || "") : "",
    상차시간: "",
    하차일: type === "drop" ? (orderDate || "") : "",
    하차시간: "",
    방법: ""
  });

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Initialize only when modal transitions from closed to open
      const currentList = listRef.current;
      const initList = (currentList || []).filter(s => s?.업체명?.trim()).map(cleanStopCargo).map(s => {
        const cargo = s.화물내용 || "";
        let cargoVal = cargo, cargoType = "파레트";
        // ⚠️ 예전 버그로 화물내용을 비운 채 "없음"으로 저장했던 이력 데이터가
        // 문자 그대로 "없음"으로 남아있을 수 있다 — 이 경우 빈 값으로 취급한다.
        // ⚠️ 드롭다운의 "없음" 옵션은 value=""(빈 문자열)이다 — 여기서 리터럴
        // 문자열 "없음"을 타입값으로 넣으면 어떤 <option>과도 일치하지 않아 셀렉트가
        // 빈칸으로 보이는 버그가 있었다. "없음"을 의미할 땐 항상 빈 문자열로 통일한다.
        if (cargo === "없음") { cargoVal = ""; cargoType = ""; }
        else if (/파레트|파렛트/.test(cargo)) { cargoVal = cargo.replace(/파레트|파렛트/g,""); cargoType="파레트"; }
        else if (/박스/.test(cargo)) { cargoVal = cargo.replace(/박스/g,""); cargoType="박스"; }
        else if (/통/.test(cargo)) { cargoVal = cargo.replace(/통/g,""); cargoType="통"; }
        else if (!cargo.trim()) { cargoType = ""; }
        else { cargoType=""; }
        const ton = s.차량톤수 || s.톤수값 || "";
        let tonVal = ton, tonType = "톤";
        if (ton === "없음") { tonVal = ""; tonType = ""; }
        else if (/톤/.test(ton)) { tonVal = ton.replace(/톤/g,""); tonType="톤"; }
        else if (/kg/i.test(ton)) { tonVal = ton.replace(/kg/gi,""); tonType="kg"; }
        else if (!ton.trim()) { tonType = ""; }
        else { tonType=""; }
        // ⚠️ 날짜 없는 예전 경유지 데이터 — 오더 본 상차일/하차일로 대체 표시(빈 날짜로 보이지 않게).
        return {
          ...emptyStop(), ...s,
          화물내용: cargoVal, 화물타입: cargoType, 톤수값: tonVal, 톤수타입: tonType,
          상차일: type === "pickup" ? (s.상차일 || orderDate || "") : (s.상차일 || ""),
          하차일: type === "drop" ? (s.하차일 || orderDate || "") : (s.하차일 || ""),
        };
      });
      setEditList(initList.length ? initList : [emptyStop()]);
    }
    prevOpenRef.current = open;
  }, [open]); // Only re-initialize when open state changes, not on every parent re-render

  if (!open) return null;

  const label = type === "pickup" ? "상차" : "하차";

  const localTimes = timeOptions.length ? timeOptions
    : ["즉시","오전 6시","오전 6시30분","오전 7시","오전 7시30분","오전 8시","오전 8시30분",
       "오전 9시","오전 9시30분","오전 10시","오전 10시30분","오전 11시","오전 11시30분",
       "오후 12시","오후 12시30분","오후 1시","오후 1시30분","오후 2시","오후 2시30분",
       "오후 3시","오후 3시30분","오후 4시","오후 4시30분","오후 5시","오후 5시30분",
       "오후 6시","오후 6시30분","오후 7시","오후 7시30분","오후 8시","오후 8시30분",
       "오후 9시","오후 10시"];

  function filterPlaces(q) {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    void lq; return placeSearch(placeRows, q).slice(0, 30); // ⭐ 2026-11-03 공용 검색
  }

  async function handleSave() {
    // confirmEdit: 오더에 바로 저장하는 경유지 수정만 묻는다(등록 · 수정 폼 안에서 고르는 건 폼 저장 때 묻는다)
    if (confirmEdit && !(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    const CARGO_SFXS = ["파레트","파렛트","박스","통"];
    const TON_SFXS = ["톤","kg","KG"];
    const finalList = editList.map(s => {
      const cargo = s.화물내용 || "";
      const cargoType = s.화물타입 || "";
      const tonVal = s.톤수값 || "";
      const tonType = s.톤수타입 || "";
      let cargoBase = cargo;
      for (const sfx of CARGO_SFXS) { if (cargoBase.endsWith(sfx)) { cargoBase = cargoBase.slice(0, -sfx.length).trim(); break; } }
      let tonBase = tonVal;
      for (const sfx of TON_SFXS) { if (tonBase.endsWith(sfx)) { tonBase = tonBase.slice(0, -sfx.length).trim(); break; } }
      // ⚠️ "없음" 선택 + 입력 없음일 때 예전엔 문자 그대로 "없음"을 저장해, 다시 열면
      // 입력칸에 "없음"이라는 글자가 그대로 보이는 버그가 있었다 — 빈 값(빈 문자열)으로 저장한다.
      const finalCargo = (cargoType && cargoType !== "없음" && cargoBase) ? `${cargoBase}${cargoType}` : cargoBase;
      const finalTon = (tonType && tonType !== "없음" && tonBase) ? `${tonBase}${tonType}` : tonBase;
      return {
        ...s,
        화물내용: finalCargo,
        차량톤수: finalTon ? toTonUnit(finalTon) : "",
      };
    }).filter(s => s.업체명?.trim());
    onSave(finalList);
    onClose();
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white";

  // ⭐ 2026-11-02 표 안(스크롤·변형된 칸)에서 열리면 화면 가운데가 아니라 표 영역에 갇혀 잘려 보였다 → 항상 화면 맨 위(body)에 띄운다
  return createPortal(
    <div className="fixed inset-0 z-[99999]" onKeyDown={e => {
      if (e.key === "Enter") {
        if (deleteIdx !== null) {
          e.preventDefault(); e.stopPropagation();
          const next = editList.filter((_,i) => i !== deleteIdx);
          setDeleteIdx(null);
          if (next.length === 0) { onSave([]); onClose(); }
          else setEditList(next);
          return;
        }
        e.stopPropagation();
      }
      if (e.key === "Escape" && deleteIdx !== null) { e.stopPropagation(); setDeleteIdx(null); }
    }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 w-[600px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">

        <h3 className="text-lg font-bold">
          {type === "pickup" ? "경유 상차지 추가" : "경유 하차지 추가"}
        </h3>

        {editList.map((stop, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2 bg-gray-50">

            {/* 경유지명 (자동완성) */}
            <div className="relative">
              <input autoComplete="off"
                className={inputCls}
                placeholder="경유지명"
                value={stop.업체명}
                onChange={e => {
                  const v = e.target.value;
                  setEditList(prev => { const c=[...prev]; c[idx]={...c[idx],업체명:v,...(v.trim()===""&&{주소:"",담당자:"",담당자번호:""})}; return c; });
                  const opts = filterPlaces(v);
                  setPlaceOpts(opts); setActiveIdx(idx); setPlaceActive(0);
                  if (v.trim()==="") setActiveIdx(null);
                }}
                onKeyDown={e => {
                  if (e.key==="Enter") {
                    e.preventDefault(); e.stopPropagation();
                    if (activeIdx===idx && placeOpts.length>0) {
                      const p = placeOpts[placeActive];
                      if (p) {
                        const contacts=(p.contacts||[]).filter(c=>c.name?.trim());
                        const unique=[...new Map(contacts.map(c=>[c.name.trim(),c])).values()];
                        if(unique.length>1){
                          setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],업체명:p.업체명,주소:p.주소||"",담당자:"",담당자번호:""};return c;});
                          setContactPickerIdx(idx);
                          setContactPickerOpts(unique);
                        } else {
                          setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],업체명:p.업체명,주소:p.주소||"",담당자:p.담당자||"",담당자번호:p.담당자번호||""};return c;});
                        }
                        setActiveIdx(null);
                      }
                    }
                    return;
                  }
                  if (e.key==="ArrowDown"){e.preventDefault();setPlaceActive(i=>Math.min(i+1,placeOpts.length-1));}
                  else if(e.key==="ArrowUp"){e.preventDefault();setPlaceActive(i=>Math.max(i-1,0));}
                  else if (e.key==="Tab") {
                    if (activeIdx===idx && placeOpts.length>0) {
                      const p = placeOpts[placeActive];
                      if (p) {
                        const contacts=(p.contacts||[]).filter(c=>c.name?.trim());
                        const unique=[...new Map(contacts.map(c=>[c.name.trim(),c])).values()];
                        if(unique.length<=1){
                          setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],업체명:p.업체명,주소:p.주소||"",담당자:p.담당자||"",담당자번호:p.담당자번호||""};return c;});
                          setActiveIdx(null);
                        }
                      }
                    }
                  }
                }}
                onBlur={() => setTimeout(()=>setActiveIdx(null),200)}
              />
              {activeIdx===idx && placeOpts.length>0 && (
                <div ref={placeDropdownListRef} className="absolute z-50 bg-white border rounded-lg shadow-lg w-full max-h-48 overflow-auto">
                  {placeOpts.map((p,i)=>(
                    <div key={p.업체명+"_"+i}
                      className={`px-2 py-1 cursor-pointer ${i===placeActive?"bg-[#1B2B4B] text-white":"hover:bg-gray-50"}`}
                      onMouseEnter={()=>setPlaceActive(i)}
                      onMouseDown={()=>{
                        const contacts=(p.contacts||[]).filter(c=>c.name?.trim());
                        const unique=[...new Map(contacts.map(c=>[c.name.trim(),c])).values()];
                        if(unique.length>1){
                          setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],업체명:p.업체명,주소:p.주소||"",담당자:"",담당자번호:""};return c;});
                          setContactPickerIdx(idx);
                          setContactPickerOpts(unique);
                        } else {
                          setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],업체명:p.업체명,주소:p.주소||"",담당자:p.담당자||"",담당자번호:p.담당자번호||""};return c;});
                        }
                        setActiveIdx(null);
                      }}>
                      <b>{p.업체명}</b>
                      {p.주소&&<div className="text-xs text-gray-500">{p.주소}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 주소 */}
            <input autoComplete="off" className={inputCls} placeholder="주소" value={stop.주소}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}}}
              onChange={e=>{setEditList(prev=>{const c=[...prev];c[idx].주소=e.target.value;return c;});}} />

            {/* 담당자 / 연락처 — 목록에 없는 담당자를 직접 입력하기 시작하면, 아래 뜬
                "담당자 선택"(복수 담당자) 드롭다운은 더 이상 의미가 없으므로 닫는다
                (예전엔 목록에 없는 값을 입력해도 드롭다운이 계속 떠 있었다). */}
            <div className="grid grid-cols-2 gap-2">
              <input autoComplete="off" className={inputCls} placeholder="담당자" value={stop.담당자}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}}}
                onChange={e=>{
                  setEditList(prev=>{const c=[...prev];c[idx].담당자=e.target.value;return c;});
                  if (contactPickerIdx === idx) { setContactPickerIdx(null); setContactPickerOpts([]); }
                }} />
              <input autoComplete="off" className={inputCls} placeholder="연락처" value={stop.담당자번호}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}}}
                onChange={e=>{
                  const v=formatPhone(e.target.value);
                  setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],담당자번호:v};return c;});
                  if (contactPickerIdx === idx) { setContactPickerIdx(null); setContactPickerOpts([]); }
                }} />
            </div>

            {/* 담당자 선택 팝업 (복수 담당자) */}
            {contactPickerIdx === idx && contactPickerOpts.length > 0 && (
              <div className="border border-blue-200 rounded-lg p-2 bg-blue-50">
                <div className="text-[11px] font-bold text-blue-600 mb-1.5">담당자 선택</div>
                {contactPickerOpts.map((contact, ci) => (
                  <div key={ci}
                    className="px-2 py-1.5 cursor-pointer hover:bg-white rounded-lg flex items-center justify-between"
                    onClick={() => {
                      setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],담당자:contact.name||"",담당자번호:contact.phone||""};return c;});
                      setContactPickerIdx(null);
                      setContactPickerOpts([]);
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

            {/* 화물내용 + 타입 / 톤수 + 타입 */}
            {/* ⚠️ 드롭다운을 "없음"으로 선택하고 값도 비어있으면 입력칸을 비활성화하고
                비워둔다("없음"이라는 글자가 입력칸에 그대로 보이던 버그 수정). 단, 이미
                내용을 입력해둔 상태에서 드롭다운만 "없음"으로 바꾼 경우엔 그 내용을
                지우거나 잠그지 않고 그대로 수정 가능하게 유지한다. */}
            <div className="grid grid-cols-2 gap-2">
              {(() => {
                const cargoIsUnit = !!(stop.화물타입 && stop.화물타입 !== "없음");
                const cargoDisabled = false; // "없음"이면 자유 입력, 단위 선택 시엔 숫자만
                return (
              <div className="relative">
                <input autoComplete="off" className={`${inputCls} pr-[62px] ${cargoDisabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                  disabled={cargoDisabled}
                  placeholder={cargoDisabled ? "" : (cargoIsUnit?"숫자만 입력":"화물내용 (예: 2)")}
                  value={cargoDisabled ? "" : (cargoIsUnit
                    ?String(stop.화물내용||"").replace(/(파레트|파렛트|박스|통)$/,"").trim()
                    :(stop.화물내용||""))}
                  onKeyDown={e=>{
                    if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}
                    if(cargoIsUnit){
                      if(!/[\d]/.test(e.key)&&!["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();}
                    }
                  }}
                  onChange={e=>{
                    const v=cargoIsUnit?e.target.value.replace(/[^\d]/g,""):e.target.value;
                    setEditList(prev=>{const c=[...prev];c[idx].화물내용=v;return c;});
                  }} />
                <div className="absolute top-0 right-0 h-full flex items-center pr-[1px]">
                  <CustomSelect className="w-[58px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer"
                    value={stop.화물타입||""}
                    onChange={e=>{const t=e.target.value;setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],화물타입:t,화물내용:t?String(c[idx].화물내용||"").replace(/[^\d.]/g,""):c[idx].화물내용};return c;});}}>
                    <option value="">없음</option>
                    {cargoTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
                  </CustomSelect>
                </div>
              </div>
                );
              })()}
              {(() => {
                const tonIsUnit = !!(stop.톤수타입 && stop.톤수타입 !== "없음");
                const tonCurVal = tonIsUnit ? (stop.톤수값||"") : (stop.차량톤수||"");
                const tonDisabled = false; // "없음"이면 자유 입력, 단위 선택 시엔 숫자만
                return (
              <div className="relative">
                <input autoComplete="off" className={`${inputCls} pr-[52px] ${tonDisabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                  disabled={tonDisabled}
                  placeholder={tonDisabled ? "" : (tonIsUnit?"톤수 (예: 1)":"예: 5톤 또는 소형")}
                  value={tonDisabled ? "" : tonCurVal}
                  onKeyDown={e=>{
                    if(e.key==="Enter"){e.preventDefault();e.stopPropagation();}
                    if(tonIsUnit){if(!/[\d.,]/.test(e.key)&&!["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();}}
                  }}
                  onChange={e=>{
                    const v=tonIsUnit?e.target.value.replace(/[^\d.]/g,""):e.target.value;
                    setEditList(prev=>{const c=[...prev];if(tonIsUnit){c[idx].톤수값=v;c[idx].차량톤수=`${v}${c[idx].톤수타입}`;}else{c[idx].차량톤수=v;c[idx].톤수값=v;}return c;});
                  }} />
                <div className="absolute top-0 right-0 h-full flex items-center pr-[1px]">
                  <CustomSelect className="w-[48px] h-[calc(100%-2px)] px-1 text-[11px] font-bold rounded-r-lg bg-[#1B2B4B] text-white border-0 appearance-none cursor-pointer"
                    value={stop.톤수타입||""}
                    onChange={e=>{const t=e.target.value;setEditList(prev=>{const c=[...prev];const tv=t?String(c[idx].톤수값||c[idx].차량톤수||"").replace(/[^\d.]/g,""):(c[idx].톤수값||c[idx].차량톤수||"");c[idx]={...c[idx],톤수타입:t,톤수값:tv,차량톤수:t?(tv?`${tv}${t}`:""):tv};return c;});}}>
                    <option value="">없음</option>
                    {tonTypeOptionsCustom.map(v => <option key={v} value={v}>{v}</option>)}
                  </CustomSelect>
                </div>
              </div>
                );
              })()}
            </div>

            {/* 경유지 자체 날짜+시간 — 상차경유지는 상차일/상차시간만, 하차경유지는 하차일/하차시간만
                (오더 본 상차일/하차일은 전체 구간 날짜라, 경유지마다 날짜가 갈리는 케이스를 못 담던 문제) */}
            {type === "pickup" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.상차일" defaultText="상차일" /></label>
                  <CustomDatePicker
                    value={stop.상차일||""}
                    showIcon
                    className={inputCls}
                    onChange={e=>{const v=e.target.value;setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],상차일:v};return c;});}}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.상차시간" defaultText="상차시간" /></label>
                  <TimeAmPmPicker
                    value={stop.상차시간||""}
                    onChange={v=>{setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],상차시간:v};return c;});}}
                    selectCls={inputCls}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.하차일" defaultText="하차일" /></label>
                  <CustomDatePicker
                    value={stop.하차일||""}
                    showIcon
                    className={inputCls}
                    onChange={e=>{const v=e.target.value;setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],하차일:v};return c;});}}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block"><EditableText id="waypoint.label.하차시간" defaultText="하차시간" /></label>
                  <TimeAmPmPicker
                    value={stop.하차시간||""}
                    onChange={v=>{setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],하차시간:v};return c;});}}
                    selectCls={inputCls}
                  />
                </div>
              </div>
            )}

            {/* 방법 */}
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-0.5 block">{label}방법</label>
              <CompanyOptionPicker optKey="상하차방법" placeholder="선택" noneLabel="선택" className={inputCls} value={stop.방법||""} onChange={(__v) => (e=>{const v=e.target.value;setEditList(prev=>{const c=[...prev];c[idx]={...c[idx],방법:v};return c;});})({ target: { value: __v } })} />
            </div>

            {/* 삭제 */}
            <div className="text-right">
              <button type="button" className="text-xs text-red-500 hover:text-red-700"
                onClick={()=>setDeleteIdx(idx)}><EditableText id="misc.btn.20324.삭제" defaultText="삭제" /></button>
            </div>
          </div>
        ))}

        {/* 하단 버튼 */}
        <div className="flex justify-between items-center pt-3">
          <button type="button" className="text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
            onClick={()=>setEditList(prev=>[...prev,emptyStop()])}>
            + 경유 추가
          </button>
          <div className="flex gap-2">
            <button type="button" className="px-4 py-2 rounded-lg text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200" onClick={onClose}><EditableText id="misc.btn.20336.취소" defaultText="취소" /></button>
            <button type="button" className="px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-[#1B2B4B] hover:bg-[#243a60] transition" onClick={handleSave}><EditableText id="misc.btn.20337.저장" defaultText="저장" /></button>
          </div>
        </div>

        {/* 삭제 확인 다이얼로그 */}
        {deleteIdx !== null && (
          <div className="fixed inset-0 z-[200000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteIdx(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-[280px] text-center space-y-5">
              <p className="text-[15px] font-bold text-gray-800">경유지를 삭제하시겠습니까?</p>
              <div className="flex gap-3">
                <button type="button" className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-[14px] font-semibold text-gray-700 transition"
                  onClick={() => setDeleteIdx(null)}><EditableText id="misc.btn.20349.아니오" defaultText="아니오" /></button>
                <button type="button" className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[14px] font-semibold transition" autoFocus
                  onClick={() => {
                    const next = editList.filter((_,i) => i !== deleteIdx);
                    setDeleteIdx(null);
                    if (next.length === 0) { onSave([]); onClose(); }
                    else setEditList(next);
                  }}><EditableText id="misc.btn.20356.예" defaultText="예" /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
// ===================== /StopEditModal =====================

// ===================== WaypointSection (경유 추가/수정 통합) =====================
export function WaypointSection({ stops = [], type = "pickup", onSave, placeRows = [], timeOptions = [], className = "", orderDate = "" }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const label = type === "pickup" ? "상차경유지" : "하차경유지";
  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-[12px] text-gray-500 font-medium">{label}</span>
        {stops.length > 0
          ? <StopBadge count={stops.length} list={stops} type={type} placeRows={placeRows} timeOptions={timeOptions} onSave={onSave} orderDate={orderDate} />
          : <button type="button" onClick={() => setAddOpen(true)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white">
              + 경유
            </button>
        }
      </div>
      <StopEditModal open={addOpen} onClose={() => setAddOpen(false)}
        onSave={newList => { onSave(newList); setAddOpen(false); }}
        list={[]} type={type} placeRows={placeRows} timeOptions={timeOptions} orderDate={orderDate} />
    </>
  );
}

// KST 날짜 포맷 helpers (module scope, RealtimeStatus 등 독립 컴포넌트에서 사용)
export function _msFromVal(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v > 1e12 ? v : 0;
  if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
  return 0;
}
export function _fmtKst(v) {
  const ms = _msFromVal(v);
  return ms ? new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "-";
}
export function _creatorLabel(r, userNameMap) {
  // ⭐ 작성자(auth.currentUser?.email)는 addDispatch가 예외 없이 모든 오더에 항상 남기는
  // 필드라, myRealName 로딩 타이밍 문제로 등록자명/createdByName이 비어있거나 예전
  // 형식이라 매칭이 안 되는 오래된 오더도 여기로 폴백하면 이름 해석이 훨씬 더 잘 된다.
  const raw = r?.등록자명 || r?.createdByName || r?.등록자 || r?.createdByEmail || r?.createdBy || r?.작성자 || "";
  if (!raw) return "-";
  const resolved = userNameMap?.get(raw) || userNameMap?.get(String(raw).trim().toLowerCase());
  return resolved || raw;
}

/* -------------------------------------------------
   물류기기(파렛트) 이동전표 발행 — 오더 우클릭 메뉴 "전표발행"에서 연다(여러 건
   선택 후 우클릭하면 한 번에 여러 오더분을 이어서 발행할 수 있다).
   KPP/아주파렛트 같은 실제 풀회사 양식(로고·바코드·관리번호)을 그대로 복제하는
   대신, 같은 정보를 담는 우리 프로그램 자체 전표를 만든다 — 발송처용/
   파렛트회사용/운송회사용 3부가 나란히 나오는 구조는 동일하게 맞췄다.
   발송지는 상차지가 아니라 거래처(청구 대상) 기준, 도착지는 하차지 기준.
--------------------------------------------------*/
export function PalletSlipModal({ rows, clients = [], userCompany, userNameMap, patchDispatch, onClose }) {
  const list = React.useMemo(() => (rows || []).filter(Boolean), [rows]);
  const [poolCompany, setPoolCompany] = React.useState("KPP");
  const [zoom, setZoom] = React.useState(1);
  const [sending, setSending] = React.useState(false);
  const captureRef = React.useRef(null);

  // ⭐ 거래처관리에 등록된 담당자 목록에서 이 오더의 거래처명과 일치하는 담당자를
  // 찾아 기본값으로 채워준다 — 선택한 것처럼 바로 쓸 수 있고, 물론 직접 수정도 가능하다.
  const findClientContacts = React.useCallback((clientName) => {
    const name = (clientName || "").trim();
    if (!name) return [];
    const c = (clients || []).find(c => (c.거래처명 || c.업체명 || "").trim() === name);
    if (!c) return [];
    if (Array.isArray(c.contacts) && c.contacts.length) return c.contacts.filter(x => x.name || x.phone);
    if (c.담당자 || c.연락처) return [{ name: c.담당자 || "", phone: c.연락처 || "", isPrimary: true }];
    return [];
  }, [clients]);

  // 오더별 입력값(담당자/연락처/품목/비고/유형·수량) — 여러 건을 한 번에 발행할 때도
  // 오더마다 다른 값을 넣을 수 있어야 하므로 오더 id를 키로 관리한다.
  const [forms, setForms] = React.useState(() => {
    const init = {};
    list.forEach(r => {
      const id = r._id || r.id;
      const contacts = findClientContacts(r.거래처명);
      const primary = contacts.find(c => c.isPrimary) || contacts[0];
      init[id] = {
        senderManager: r.거래처담당자 || primary?.name || "",
        senderPhone: r.거래처연락처 || primary?.phone || "",
        item: "",
        note: "",
        typeRows: [{ type: "", qty: "" }],
      };
    });
    return init;
  });

  if (!list.length) return null;

  const updateForm = (id, patch) => setForms(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  const updateTypeRow = (id, i, key, val) => setForms(prev => {
    const f = prev[id]; if (!f) return prev;
    return { ...prev, [id]: { ...f, typeRows: f.typeRows.map((tr, idx) => (idx === i ? { ...tr, [key]: val } : tr)) } };
  });
  const addTypeRow = (id) => setForms(prev => { const f = prev[id]; if (!f) return prev; return { ...prev, [id]: { ...f, typeRows: [...f.typeRows, { type: "", qty: "" }] } }; });
  const removeTypeRow = (id, i) => setForms(prev => {
    const f = prev[id]; if (!f || f.typeRows.length <= 1) return prev;
    return { ...prev, [id]: { ...f, typeRows: f.typeRows.filter((_, idx) => idx !== i) } };
  });

  // 실제 물류기기 이동전표 양식과 동일하게 "2026년 9월 14일" 전체 표기로 보여준다.
  const fmtFullDate = (d) => {
    if (!d) return "-";
    const dt = new Date(`${d}T00:00:00`);
    if (isNaN(dt.getTime())) return d;
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`;
  };

  const captureCanvas = () => captureRef.current
    ? html2canvas(captureRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true })
    : null;

  const first = list[0];
  const fileTitle = (list.length > 1
    ? `물류기기이동전표_${first.상차일 || ""}_외${list.length - 1}건`
    : `물류기기이동전표_${first.상차일 || ""}_${first.거래처명 || ""}`
  ).replace(/[\s/]/g, "");

  // ⭐ 전표를 실제로 내보낼 때(이미지/PDF저장·인쇄) 오더 문서에 발행 이력을 조용히
  // 남겨둔다 — 나중에 "이 오더 파렛트 몇 개 나갔지?"를 오더복사/수정 패널이나
  // 전표발행을 다시 열었을 때 바로 확인할 수 있다. 이력/updatedAt은 건드리지 않는
  // 조용한 기록이라 __system으로 남긴다(유형/수량을 하나도 안 채운 건은 기록 안 함).
  const logIssuance = () => {
    if (!patchDispatch) return;
    const now = Date.now();
    list.forEach(r => {
      const f = forms[r._id || r.id];
      if (!f) return;
      const typeRows = f.typeRows.filter(tr => tr.type.trim() || tr.qty);
      if (!typeRows.length) return;
      const entry = { poolCompany, typeRows, item: f.item, note: f.note, issuedAt: now };
      const prevHistory = Array.isArray(r.전표발행이력) ? r.전표발행이력 : [];
      patchDispatch(r._id, { 전표발행이력: [...prevHistory, entry], __col: r.__col, __system: true });
    });
  };

  const saveImage = async () => {
    setSending(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `${fileTitle}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      logIssuance();
    } finally {
      setSending(false);
    }
  };
  const savePdf = async () => {
    setSending(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const pdf = new (await loadJsPDF())("l", "mm", "a4");
      const pdfWidth = 297, pdfPageHeight = 210;
      const totalHeightMm = (canvas.height * pdfWidth) / canvas.width;
      if (totalHeightMm <= pdfPageHeight) {
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdfWidth, totalHeightMm);
      } else {
        // ⭐ 여러 오더를 한 번에 발행하면(오더마다 3부 세트가 이어짐) 세로로 길어질
        // 수 있다 — 한 페이지를 넘으면 오더 묶음(data-pdf-block) 경계에서만 페이지를
        // 나눠서, 한 오더의 전표 3부가 페이지 중간에서 잘리지 않게 한다.
        const node = captureRef.current;
        const scaleRatio = canvas.width / node.offsetWidth;
        const offsetTopWithin = (el, ancestor) => { let top = 0, n = el; while (n && n !== ancestor) { top += n.offsetTop || 0; n = n.offsetParent; } return top; };
        const safeCuts = Array.from(node.querySelectorAll("[data-pdf-block]"))
          .map(el => Math.round((offsetTopWithin(el, node) + el.offsetHeight) * scaleRatio))
          .filter(v => v > 0 && v < canvas.height)
          .sort((a, b) => a - b);
        const pageHeightPx = Math.floor((pdfPageHeight * canvas.width) / pdfWidth);
        let renderedPx = 0, pageIndex = 0;
        while (renderedPx < canvas.height) {
          const naiveBreak = Math.min(renderedPx + pageHeightPx, canvas.height);
          let cut = naiveBreak;
          if (naiveBreak < canvas.height) {
            for (let i = safeCuts.length - 1; i >= 0; i--) {
              if (safeCuts[i] > renderedPx && safeCuts[i] <= naiveBreak) { cut = safeCuts[i]; break; }
            }
          }
          const sliceHeightPx = cut - renderedPx;
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width; pageCanvas.height = sliceHeightPx;
          const ctx = pageCanvas.getContext("2d");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, pageCanvas.width, sliceHeightPx);
          ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
          const sliceHeightMm = (sliceHeightPx * pdfWidth) / canvas.width;
          if (pageIndex > 0) pdf.addPage();
          pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pdfWidth, sliceHeightMm);
          renderedPx = cut; pageIndex++;
        }
      }
      pdf.save(`${fileTitle}.pdf`);
      logIssuance();
    } finally {
      setSending(false);
    }
  };
  const handlePrint = async () => {
    const canvas = await captureCanvas();
    if (!canvas) return;
    const imgData = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>물류기기 이동전표</title><style>
      @page { size: A4 landscape; margin: 8mm; }
      body { margin:0; display:flex; justify-content:center; background:#fff; }
      img { width:100%; max-width:281mm; }
    </style></head><body><img src="${imgData}" onload="window.print()" /></body></html>`);
    w.document.close();
    logIssuance();
  };

  const thStyle = "border border-gray-400 bg-gray-50 px-1.5 py-1 text-[10px] font-bold text-gray-700 whitespace-nowrap";
  const tdStyle = "border border-gray-400 px-1.5 py-1 text-[10px] text-gray-800";
  const inputCls = "border border-gray-300 rounded-lg px-2.5 py-1.5 text-[12px] w-[140px]";
  // ⭐ 파렛트 회사 뱃지에 실제 인쇄용 영문 표기(KPP 로고/AJ네트웍스 라벨 참고) — 화면
  // 선택 버튼은 그대로 한글이지만, 전표에 찍히는 이름만 영문으로 바꾼다.
  const POOL_COMPANY_LABEL = { KPP: "KPP", 아주파렛트: "AJ PALLET" };

  // 발송처용/파렛트회사용/운송회사용 — 세 부 모두 내용은 동일하고 표지 라벨만 다르다.
  const SlipCard = ({ r, f, label }) => {
    const senderName = r.거래처명 || "-";
    const arriveName = r.하차지명 || "-";
    const arriveManager = r.하차지담당자 || "";
    const arrivePhone = r.하차지담당자번호 || "";
    const carPlate = r.차량번호 || "";
    const carManager = _creatorLabel(r, userNameMap);
    return (
      <div className="border-2 border-[#1B2B4B]" style={{ width: 270 }}>
        <div className="text-center py-2 border-b-2 border-[#1B2B4B]">
          <div className="text-[13px] font-extrabold text-[#1B2B4B] tracking-wide">물류기기 이동전표</div>
          <div className="text-[10px] font-bold text-gray-500 mt-0.5">({label})</div>
          <div className="text-[17px] font-black text-black mt-1 tracking-wide">{POOL_COMPANY_LABEL[poolCompany] || poolCompany}</div>
        </div>
        {/* ⭐ border-collapse 테이블은 html2canvas로 캡쳐(인쇄/이미지/PDF 저장 모두 이
            캡쳐를 거침)할 때 오른쪽·아래쪽 경계선이 간헐적으로 안 그려지는 문제가
            있다 — border-separate + spacing 0으로 바꿔서 각 칸 테두리가 항상 온전히
            찍히도록 한다(카드 폭 270px에 딱 맞춰 3장 모두 오른쪽 선까지 일치). */}
        <table className="w-full border-separate border-spacing-0">
          <tbody>
            <tr><td className={`${thStyle} w-[70px]`}>발송일</td><td className={tdStyle} colSpan={2}>{fmtFullDate(r.상차일)}</td></tr>
            <tr><td className={thStyle} rowSpan={3}>발송지</td><td className={`${thStyle} w-[60px]`}>회사명</td><td className={tdStyle}>{senderName}</td></tr>
            <tr><td className={thStyle}>담당자</td><td className={tdStyle}>{f.senderManager || ""}</td></tr>
            <tr><td className={thStyle}>연락처</td><td className={tdStyle}>{f.senderPhone || ""}</td></tr>
            <tr><td className={thStyle}>도착일</td><td className={tdStyle} colSpan={2}>{fmtFullDate(r.하차일)}</td></tr>
            <tr><td className={thStyle} rowSpan={3}>도착지</td><td className={thStyle}>회사명</td><td className={tdStyle}>{arriveName}</td></tr>
            <tr><td className={thStyle}>담당자</td><td className={tdStyle}>{arriveManager}</td></tr>
            <tr><td className={thStyle}>연락처</td><td className={tdStyle}>{arrivePhone}</td></tr>
            <tr><td className={thStyle} rowSpan={3}>운송회사</td><td className={thStyle}>회사명</td><td className={tdStyle}>{bizOf(r, userCompany) || "-"}</td></tr>
            <tr><td className={thStyle}>차량번호</td><td className={tdStyle}>{carPlate}</td></tr>
            <tr><td className={thStyle}>담당자</td><td className={tdStyle}>{carManager && carManager !== "-" ? carManager : ""}</td></tr>
          </tbody>
        </table>
        <table className="w-full border-separate border-spacing-0 border-t-2 border-[#1B2B4B]">
          <thead>
            <tr><th className={thStyle}>유형</th><th className={thStyle}>수량</th></tr>
          </thead>
          <tbody>
            {f.typeRows.map((tr, i) => (
              <tr key={i}><td className={`${tdStyle} text-center`}>{tr.type || "-"}</td><td className={`${tdStyle} text-center`}>{tr.qty || "-"}</td></tr>
            ))}
          </tbody>
        </table>
        <table className="w-full border-separate border-spacing-0">
          <tbody>
            <tr><td className={`${thStyle} w-[60px]`}>품목</td><td className={tdStyle}>{f.item}</td></tr>
            <tr><td className={thStyle}>비고</td><td className={tdStyle}>{f.note}</td></tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-fit max-w-[95vw] max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-[#1B2B4B] px-5 py-3 shrink-0">
          <h3 className="text-white font-bold text-[15px]">물류기기 이동전표 발행{list.length > 1 ? ` (${list.length}건)` : ""}</h3>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="w-7 h-7 rounded bg-white/10 text-white hover:bg-white/20 text-[14px] font-bold transition">−</button>
            <span className="text-white/80 text-[12px] w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} className="w-7 h-7 rounded bg-white/10 text-white hover:bg-white/20 text-[14px] font-bold transition">+</button>
            <button type="button" onClick={onClose} className="ml-2 text-white/70 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        {/* 파렛트 회사 선택 (전체 발행분 공통) */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="text-[12px] font-bold text-gray-500 mb-1">파렛트 회사</div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
            {["KPP", "아주파렛트"].map((v) => (
              <button key={v} type="button" onClick={() => setPoolCompany(v)}
                className={`px-3 py-1.5 text-[12px] font-bold transition ${poolCompany === v ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* 오더별 입력 영역 — 여러 건을 한 번에 발행할 때도 오더마다 담당자/연락처/
            유형·수량을 따로 넣을 수 있다. */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0 max-h-[40vh] overflow-y-auto space-y-3">
          {list.map((r) => {
            const id = r._id || r.id;
            const f = forms[id];
            if (!f) return null;
            return (
              <div key={id} className="border border-gray-200 rounded-xl p-3 bg-white">
                <div className="text-[12px] font-bold text-[#1B2B4B] mb-1">
                  {fmtFullDate(r.상차일)} · {r.거래처명 || "-"} · {r.상차지명 || "-"} → {r.하차지명 || "-"}
                </div>
                {Array.isArray(r.전표발행이력) && r.전표발행이력.length > 0 && (
                  <div className="text-[11px] text-amber-600 font-semibold mb-2">
                    ⓘ 이전 발행 이력 {r.전표발행이력.length}건 (최근 {new Date(r.전표발행이력[r.전표발행이력.length - 1].issuedAt).toLocaleString("ko-KR")})
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 mb-1">발송지(거래처) 담당자</div>
                    <input value={f.senderManager} onChange={(e) => updateForm(id, { senderManager: e.target.value })} placeholder="담당자명" className={inputCls} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 mb-1">발송지(거래처) 연락처</div>
                    <input value={f.senderPhone} onChange={(e) => updateForm(id, { senderPhone: formatPhone(e.target.value) })} placeholder="010-0000-0000" inputMode="tel" className={inputCls} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 mb-1">품목</div>
                    <input value={f.item} onChange={(e) => updateForm(id, { item: e.target.value })} placeholder="선택 입력" className={inputCls} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 mb-1">비고</div>
                    <input value={f.note} onChange={(e) => updateForm(id, { note: e.target.value })} placeholder="예: 용차" className={inputCls} />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-[11px] font-bold text-gray-500 mb-1">유형 / 수량 (직접 입력)</div>
                  <div className="space-y-1.5">
                    {f.typeRows.map((tr, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={tr.type} onChange={(e) => updateTypeRow(id, i, "type", e.target.value)} placeholder="예: N11"
                          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-[12px] w-[100px]" />
                        <input value={tr.qty} onChange={(e) => updateTypeRow(id, i, "qty", e.target.value.replace(/[^\d]/g, ""))} placeholder="수량"
                          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-[12px] w-[70px]" />
                        <button type="button" onClick={() => removeTypeRow(id, i)} disabled={f.typeRows.length === 1}
                          className="w-7 h-7 rounded-lg border border-gray-300 text-gray-400 hover:bg-gray-100 disabled:opacity-30 text-[13px]">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addTypeRow(id)} className="text-[11px] font-bold text-[#1B2B4B] hover:underline">+ 유형 추가</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 미리보기 */}
        <div className="flex-1 overflow-auto bg-gray-100 p-6">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform .15s" }}>
            <div ref={captureRef} className="bg-white p-6 w-fit mx-auto space-y-6">
              {list.map((r) => {
                const id = r._id || r.id;
                const f = forms[id];
                if (!f) return null;
                return (
                  <div key={id} data-pdf-block="1" className="flex gap-4">
                    <SlipCard r={r} f={f} label="발송처용" />
                    <div className="border-l-2 border-dashed border-gray-300" />
                    <SlipCard r={r} f={f} label="파렛트회사용" />
                    <div className="border-l-2 border-dashed border-gray-300" />
                    <SlipCard r={r} f={f} label="운송회사용" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-white shrink-0">
          <button type="button" onClick={saveImage} disabled={sending} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition disabled:opacity-50">이미지저장</button>
          <button type="button" onClick={savePdf} disabled={sending} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition disabled:opacity-50">PDF저장</button>
          <button type="button" onClick={handlePrint} disabled={sending} className="px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:opacity-90 transition disabled:opacity-50">인쇄</button>
        </div>
      </div>
    </div>
  );
}

// ===== 신규 기사 등록 모달 컴포넌트 =====
export function NewDriverModal({ data, onClose, onConfirm }) {
  const [form, setForm] = React.useState({
    차량번호: data.차량번호 || "",
    이름: "",
    전화번호: "",
    등급: "일반",
    메모: "",
  });

  const isDuplicate = data.mode === "duplicate";
  const existing = data.existingDriver;

  const handleSubmit = (mode) => {
    if (!form.이름.trim()) { alert("기사명을 입력해주세요."); return; }
    onConfirm(form, mode);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
      <div className="bg-white rounded-2xl w-[460px] shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-[16px]">
              {isDuplicate ? "기사 정보 확인" : "신규 기사 등록"}
            </div>
            <div className="text-white/60 text-[12px] mt-0.5">
              {isDuplicate
                ? `차량번호 [${data.차량번호}]에 등록된 기사님이 있습니다`
                : `차량번호 [${data.차량번호}]를 신규 등록합니다`}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg transition">×</button>
        </div>

        <div className="p-6">
          {/* 중복 기사 정보 표시 */}
          {isDuplicate && existing && (
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">기존 등록 기사</div>
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-[14px] font-bold text-slate-800">{existing.이름 || "-"}</div>
                  <div className="text-[12px] text-slate-500">{existing.전화번호 || "-"}</div>
                </div>
                {existing.등급 && (
                  <span className="ml-auto px-2 py-0.5 bg-slate-200 text-slate-600 text-[11px] font-semibold rounded">{existing.등급}</span>
                )}
              </div>
            </div>
          )}

          {/* 신규 입력 폼 */}
          <div className="space-y-3" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit("new"); } }}>
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 mb-1">차량번호</label>
              <input autoComplete="off"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 text-slate-700"
                value={form.차량번호}
                readOnly
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 mb-1">기사명 <span className="text-red-400">*</span></label>
              <input autoComplete="off"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                placeholder="기사명 입력"
                value={form.이름}
                onChange={e => setForm(p => ({ ...p, 이름: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 mb-1">전화번호</label>
              <input autoComplete="off"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B]"
                placeholder="전화번호 입력"
                inputMode="numeric"
                value={form.전화번호}
                onChange={e => setForm(p => ({ ...p, 전화번호: formatPhone(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 mb-1">등급</label>
              <CustomSelect
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white"
                value={form.등급 || "일반"}
                onChange={e => setForm(p => ({ ...p, 등급: e.target.value }))}
              >
                {["일반", "우수", "VIP", "블랙", "신규"].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 mb-1">메모</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#1B2B4B] resize-none"
                placeholder="메모 입력 (선택)"
                rows={2}
                value={form.메모}
                onChange={e => setForm(p => ({ ...p, 메모: e.target.value }))}
              />
            </div>
          </div>

          {/* 버튼 */}
          <div className="mt-5 flex gap-2">
            {isDuplicate ? (
              <>
                <button
                  onClick={() => handleSubmit("new")}
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                >
                  별도 등록
                </button>
                <button
                  onClick={() => handleSubmit("overwrite")}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-bold hover:bg-slate-200 border border-slate-200 transition"
                >
                  기존 덮어쓰기
                </button>
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-[13px] font-bold hover:bg-slate-50 transition">
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleSubmit("new")}
                  className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
                >
                  등록
                </button>
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-[13px] font-bold hover:bg-slate-50 transition">
                  취소
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 오전/오후 토글 + 시간 선택 컴포넌트
// ⭐ 2026-11-06 오더 복사/수정 패널 메모·전달사항 — 등록창(3파트)과 같은 카드형(MEMO · DRIVER NOTE · 중요도 · 고정 · 글자 수)
export const CP_MEMO_FONT = { fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" };
export function CpMemoNoteCards({ target, setTarget }) {
  const t = target || {};
  const set = (k, v) => setTarget((p) => ({ ...p, [k]: v }));
  const lv = t.메모중요도 || "NORMAL";
  const card = "relative flex flex-col rounded-2xl border bg-white transition focus-within:border-[#1B2B4B] focus-within:ring-2 focus-within:ring-[#1B2B4B]/15";
  const ta = "flex-1 w-full min-h-[96px] px-4 pt-3 pb-7 bg-transparent resize-y text-[14px] leading-[1.6] font-semibold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium focus:outline-none";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch" data-kp="cp-memo-cards">
      <section className={`${card} ${lv === "CRITICAL" ? "border-[#1B2B4B]" : "border-[#E3E8F0]"}`}>
        {lv !== "NORMAL" && <span className={`absolute left-4 right-4 top-0 h-[2px] rounded-b ${lv === "CRITICAL" ? "bg-[#0F1A30]" : "bg-[#4B6CB7]"}`} />}
        <header className="flex items-center gap-2 px-4 h-11 border-b border-[#EDF1F7]">
          <span className="text-[10px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={CP_MEMO_FONT}>MEMO</span>
          <span className="text-[13.5px] font-black text-[#0F1A30] whitespace-nowrap">메모</span>
          <span className="text-[11.5px] font-semibold text-[#9AA9C3] whitespace-nowrap">내부용</span>
          <div className="ml-auto inline-flex p-0.5 rounded-xl bg-[#F2F5FA] border border-[#E3E8F0]" role="radiogroup" aria-label="메모 중요도">
            {[["NORMAL", "일반", 1], ["HIGH", "중요", 2], ["CRITICAL", "긴급", 3]].map(([key, label, bars]) => {
              const on = lv === key;
              return (
                <button key={key} type="button" role="radio" aria-checked={on} onClick={() => set("메모중요도", key)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[10px] text-[11.5px] font-extrabold transition ${on ? (key === "NORMAL" ? "bg-white text-[#0F1A30] shadow-[0_1px_3px_rgba(15,26,48,0.14)]" : "bg-[#0F1A30] text-white shadow-[0_3px_8px_rgba(15,26,48,0.25)]") : "text-[#7A8AA6] hover:text-[#0F1A30]"}`}>
                  <span className="inline-flex items-end gap-[2px] h-[10px]" aria-hidden="true">
                    {[1, 2, 3].map((b) => <span key={b} className={`w-[3px] rounded-[1px] ${b === 1 ? "h-[4px]" : b === 2 ? "h-[7px]" : "h-[10px]"} ${b <= bars ? (on ? (key === "CRITICAL" ? "bg-[#FF6B6B]" : key === "HIGH" ? "bg-[#8FB0F0]" : "bg-[#2D4C82]") : "bg-current") : (on && key !== "NORMAL" ? "bg-white/25" : "bg-[#C9D3E3]")}`} />)}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </header>
        <textarea className={ta} rows={4} placeholder="내부 메모 입력" value={t.메모 ?? ""} onChange={(e) => set("메모", e.target.value)} />
        <span className="pointer-events-none absolute right-4 bottom-2.5 text-[10.5px] font-bold text-[#A7B3C6]" style={CP_MEMO_FONT}>{String(t.메모 || "").length}자</span>
      </section>
      <section className={`${card} border-[#E3E8F0]`}>
        <header className="flex items-center gap-2 px-4 h-11 border-b border-[#EDF1F7]">
          <span className="text-[10px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={CP_MEMO_FONT}>DRIVER NOTE</span>
          <span className="text-[13.5px] font-black text-[#0F1A30] whitespace-nowrap">전달사항</span>
          <span className="text-[11.5px] font-semibold text-[#9AA9C3] whitespace-nowrap">기사님께</span>
          <button type="button" aria-pressed={!!t.전달사항고정} onClick={() => set("전달사항고정", !t.전달사항고정)}
            title="켜 두고 복사 등록하면 새 오더에도 전달사항이 그대로 넘어갑니다"
            className={`ml-auto inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-[10px] border text-[11.5px] font-extrabold transition ${t.전달사항고정 ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#DCE3EE] text-[#5B6B85] hover:border-[#2D4C82] hover:text-[#0F1A30]"}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-1 7 4 3v2H6v-2l4-3z" /></svg>
            고정
            <span className={`relative inline-flex w-7 h-4 rounded-full transition ${t.전달사항고정 ? "bg-[#8FB0F0]" : "bg-[#DCE3EE]"}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${t.전달사항고정 ? "left-[14px]" : "left-0.5"}`} />
            </span>
          </button>
        </header>
        <textarea className={ta} rows={4} placeholder="운송 기사님께 전달 내용을 입력하세요" value={t.전달사항 ?? ""} onChange={(e) => set("전달사항", e.target.value)} />
        <span className="pointer-events-none absolute right-4 bottom-2.5 text-[10.5px] font-bold text-[#A7B3C6]" style={CP_MEMO_FONT}>{String(t.전달사항 || "").length}자</span>
      </section>
    </div>
  );
}
// ⭐ 2026-11-06 오더 복사/수정 패널 — 상차·하차시간 옆 이전/이후(시간구분) · 등록창(3파트)과 같은 값(상차시간기준/하차시간기준)
export function TimeBasisToggle({ value, onChange, disabled = false }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-[#1B2B4B] overflow-hidden" role="group" aria-label="시간 기준" data-kp="time-basis">
      {["이전", "이후"].map((k, i) => (
        <button key={k} type="button" disabled={disabled} aria-pressed={value === k}
          onClick={() => onChange(value === k ? null : k)}
          className={`h-9 px-2.5 text-[12.5px] font-bold transition ${i ? "border-l border-[#1B2B4B]" : ""} ${value === k ? "bg-[#1B2B4B] text-white" : "bg-white text-[#1B2B4B] hover:bg-[#EEF3FB]"} disabled:opacity-50`}>
          {k}
        </button>
      ))}
    </div>
  );
}
export function TimeAmPmPicker({ value, onChange, selectCls, showError, disabled = false }) {
  const [ampm, setAmpm] = React.useState(() => {
    if (value && value.startsWith("오후")) return "오후";
    if (value && value.startsWith("오전")) return "오전";
    return null;
  });
  React.useEffect(() => {
    if (value && value.startsWith("오전")) setAmpm("오전");
    else if (value && value.startsWith("오후")) setAmpm("오후");
    else if (!value) setAmpm(null);
  }, [value]);

  // When ampm is selected: options have prefix "오전/오후 Xsi"; when null: bare "Xsi"
  const times = React.useMemo(() => {
    const list = [];
    for (let h = 0; h < 12; h++) {
      const hh = h === 0 ? 12 : h;
      if (ampm) {
        list.push(`${ampm} ${hh}시`);
        list.push(`${ampm} ${hh}시 30분`);
      } else {
        list.push(`${hh}시`);
        list.push(`${hh}시 30분`);
      }
    }
    return list;
  }, [ampm]);

  const handleAmpm = (ap) => {
    setAmpm(ap);
    if (value) {
      const part = value.replace(/^오전 |^오후 /, "");
      onChange(`${ap} ${part}`);
    }
  };

  const btnBase = "px-2.5 py-1 text-[12px] font-semibold rounded border transition";
  const act = "bg-[#1B2B4B] text-white border-[#1B2B4B]";
  const inact = "bg-white text-gray-600 border-gray-300 hover:border-[#1B2B4B] hover:text-[#1B2B4B]";
  const errInact = "bg-white text-red-500 border-red-400 hover:border-red-500";

  // Red borders only when: save was attempted AND time is selected without ampm
  const needsError = showError && ampm === null && !!value;

  return (
    <div className="flex items-center gap-1 flex-nowrap">
      <button type="button" disabled={disabled} className={`${btnBase} shrink-0 whitespace-nowrap ${ampm === "오전" ? act : needsError ? errInact : inact} disabled:opacity-40 disabled:cursor-not-allowed`} onClick={() => handleAmpm("오전")}><EditableText id="misc.btn.20646.오전" defaultText="오전" /></button>
      <button type="button" disabled={disabled} className={`${btnBase} shrink-0 whitespace-nowrap ${ampm === "오후" ? act : needsError ? errInact : inact} disabled:opacity-40 disabled:cursor-not-allowed`} onClick={() => handleAmpm("오후")}><EditableText id="misc.btn.20647.오후" defaultText="오후" /></button>
      <CustomSelect
        value={value || ""}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={(selectCls || "border border-gray-300 rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#1B2B4B]").replace(/\bw-full\b/, "w-[108px]") + " shrink-0 disabled:bg-gray-100 disabled:text-gray-500"}
      >
        <option value="">시간 선택</option>
        {times.map(t => (
          <option key={t} value={t}>{t.replace(/^오전 |^오후 /, "")}</option>
        ))}
      </CustomSelect>
    </div>
  );
}

export function AttachStatusPanel({ open, onClose, initialClient, dispatchData, db, companyName = "", isViewer = false }) {
  const [clientQ, setClientQ] = React.useState(initialClient || "");
  const [searched, setSearched] = React.useState(false);
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
  const lastDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()}`;
  const [dateFrom, setDateFrom] = React.useState(firstDay);
  const [dateTo, setDateTo] = React.useState(lastDay);
  const [results, setResults] = React.useState([]);
  const [sortMode, setSortMode] = React.useState("date"); // "date" | "done" | "undone"
  const [viewRow, setViewRow] = React.useState(null);
  const [sendDone, setSendDone] = React.useState(null);
  // ⭐ 첨부파일 선택삭제/전체삭제용 — 조회전용 권한은 아예 못 쓰게 막는다.
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [deletingAttach, setDeletingAttach] = React.useState(false);

  React.useEffect(() => {
    if (open && initialClient) setClientQ(initialClient);
  }, [open, initialClient]);

  // 새로 조회하면 이전 선택은 초기화한다.
  React.useEffect(() => { setSelectedIds(new Set()); }, [results]);

  // ⭐ 첨부 상태 실시간 검증 — 그리드에 보이는 attachCount(캐시된 필드)와 이 화면이
  // 신뢰하는 값이 어긋나 "그리드는 완료인데 여기는 미완료"로 보이는 문제가 있었다.
  // 검색 결과에 대해 실제 attachments 서브컬렉션 개수(+ 원본/전송카피 짝 문서)를
  // 직접 세어 확인하고, 캐시 값이 실제와 다르면 그 자리에서 문서에도 보정 반영해
  // 다음부터는 그리드/첨부현황이 항상 같은 값을 보도록 만든다.
  const [verifiedCounts, setVerifiedCounts] = React.useState({});
  const [countsLoading, setCountsLoading] = React.useState(false);
  const getCnt = (r) => verifiedCounts[r._id] ?? (r.attachCount || 0);
  // 실제 첨부파일이 없어도 "다른 방법으로 서류를 확인했다"고 수동으로 표시해둔
  // 오더(attachViewed)는 완료로 인정한다 — 그리드의 첨부 아이콘/첨부뷰어 하단
  // "완료처리" 버튼과 동일한 기준을 여기서도 그대로 따른다.
  // ⭐ 버그수정(2026-10-28) — 조회 버튼을 누른 순간의 목록을 그대로 들고 있어서, 모바일(또는 다른 PC)에서
  //   완료처리/미완료로 바꿔도 열려 있는 이 화면에는 반영되지 않았다. 실시간 오더(dispatchData)에 있는
  //   완료 표시(attachViewed)를 우선으로 겹쳐 보여준다(다른 기기에서 바꾼 것도 바로 반영).
  //   패널을 연 뒤 어느 기기에서든 수정된 오더(_lastModified)만 실시간으로 받아 겹친다 — 읽기 비용이 작다.
  const [liveViewed, setLiveViewed] = React.useState(() => new Map());
  React.useEffect(() => {
    if (!open) return undefined;
    const since = Date.now() - 60 * 1000;
    const unsubs = ["orders", "dispatch"].map((col) => onSnapshot(
      query(collection(db, col), where("_lastModified", ">=", since)),
      (snap) => {
        const ch = snap.docChanges().filter((c) => c.type !== "removed");
        if (!ch.length) return;
        setLiveViewed((prev) => {
          const m = new Map(prev);
          ch.forEach((c) => m.set(c.doc.id, (c.doc.data() || {}).attachViewed === true));
          return m;
        });
      },
      () => {},
    ));
    return () => unsubs.forEach((u) => u());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!results.length) return;
    setResults((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (!liveViewed.has(r._id)) return r;
        const v = liveViewed.get(r._id);
        if ((r.attachViewed === true) === v) return r;
        changed = true;
        return { ...r, attachViewed: v };
      });
      return changed ? next : prev;
    });
    setViewRow((prev) => (prev && liveViewed.has(prev._id) && (prev.attachViewed === true) !== liveViewed.get(prev._id) ? { ...prev, attachViewed: liveViewed.get(prev._id) } : prev));
  }, [liveViewed]); // eslint-disable-line react-hooks/exhaustive-deps
  const isDone = (r) => getCnt(r) > 0 || r.attachViewed === true;

  React.useEffect(() => {
    if (!results.length) { setVerifiedCounts({}); setCountsLoading(false); return; }
    let cancelled = false;
    setCountsLoading(true);
    (async () => {
      const entries = await Promise.all(results.map(async (r) => {
        try {
          const col = r.__col || "orders";
          const localSnap = await getCountFromServer(collection(db, col, r._id, "attachments"));
          let count = localSnap.data().count;
          const mirror = attachMirrorTargetOf(r);
          if (mirror) {
            const mirrorSnap = await getCountFromServer(collection(db, mirror.col, mirror.id, "attachments"));
            count = Math.max(count, mirrorSnap.data().count);
          }
          // ⚠️ 예전엔 여기서 어긋난 값을 바로 updateDoc으로 고쳐 썼는데, 그 write가
          // 실시간배차현황의 "파일 업로드 감지" 이펙트(원본 attachCount 증가를 감시)에
          // 그대로 잡혀서, 기간을 넓게 잡고 조회할 때마다(어긋난 문서 수만큼) "서류
          // 업로드 알림" 토스트+알림음이 한꺼번에 쏟아졌다 — 진짜 새 업로드가 아니라
          // 캐시 보정일 뿐인데 새 업로드처럼 오인된 것. 이 화면(첨부현황)에서 보여주는
          // 값은 어차피 verifiedCounts state로 항상 정확하므로, 문서 자체를 고쳐쓰지
          // 않아도 화면 표시에는 지장이 없다 — 조용히 읽기만 하고 쓰기는 하지 않는다.
          return [r._id, count];
        } catch {
          return [r._id, r.attachCount || 0];
        }
      }));
      if (!cancelled) { setVerifiedCounts(Object.fromEntries(entries)); setCountsLoading(false); }
    })();
    return () => { cancelled = true; };
    // 완료 표시만 바뀐 경우엔 첨부 개수를 다시 세지 않는다(조회 목록이 바뀔 때만)
  }, [results.map((r) => r._id).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // 전체저장(zip) 진행 상태 — 아래 handleSaveAllZip에서 사용. 훅은 조건부 return
  // 이전에 선언해야 하므로(Rules of Hooks) 여기 미리 선언해둔다.
  const [bulkSaving, setBulkSaving] = React.useState(false);
  const [bulkProgress, setBulkProgress] = React.useState("");


  // ⭐ 이 화면(첨부현황)을 여는 부모(실시간배차현황/배차현황)의 dispatchData는
  // 화면마다 스코프가 다르다 — 실시간배차현황은 어제~내일 3일치만, 배차현황도
  // 최근 13개월까지만 실시간으로 들고 있다. 그런데 첨부현황은 "아무 년/월이나
  // 골라 조회"하는 화면이라 그 범위를 넘어서면(예: 지난달) 데이터가 아예 없는
  // 것처럼 보였다 — 부모가 들고 있는 배열을 필터링하는 대신, 선택한 기간을
  // Firestore에서 직접 조회해 항상 정확하게 나오도록 고친다.
  const [searching, setSearching] = React.useState(false);
  const handleSearch = async () => {
    if (searching) return;
    const q = clientQ.trim();
    setSearching(true);
    try {
      const myCompany = companyName || DEFAULT_COMPANY;
      const fetchOne = async (colName) => {
        const qy = query(
          collection(db, colName),
          where("상차일", ">=", dateFrom),
          where("상차일", "<=", dateTo)
        );
        const snap = await getDocs(qy);
        return snap.docs.map(d => ({ __col: colName, ...d.data(), _id: d.id }));
      };
      const [orders, dispatch] = await Promise.all([fetchOne("orders"), fetchOne("dispatch")]);
      const atNameM = makeClientMatcher(q, [...orders, ...dispatch].map((r) => r.거래처명)); // ⭐ 정확히 같은 거래처가 있으면 그것만
      const merged = [...orders, ...dispatch].filter(r =>
        !isBlindHidden(r) &&
        r.source !== "transport_transmit" &&
        r.배차상태 !== "배차취소" &&
        !["취소", "배차취소", "오더취소", "취소됨"].includes(r.상태) &&
        (r.companyName || DEFAULT_COMPANY) === myCompany &&
        (!q || atNameM(r.거래처명))
      );
      setResults(merged);
      setSearched(true);
      setSortMode("date");
    } catch (e) {
      console.error("첨부현황 조회 실패:", e);
      alert("조회 중 오류가 발생했습니다: " + (e?.message || e));
    } finally {
      setSearching(false);
    }
  };

  // ⭐ 첨부파일 선택삭제/전체삭제 — 오더 자체는 그대로 두고 첨부 사진/서류만
  // 지운다. 삭제 후에도 "완료처리" 상태는 유지해야 하므로(요청사항), attachCount는
  // 0으로 낮추되 attachViewed를 true로 함께 찍어 isDone()이 계속 완료로 보이게 한다.
  // 브라우저 기본 confirm() 대신 프로그램 톤에 맞는 팝업으로 확인받고, 삭제 중에는
  // 몇 건이 끝났는지(N/전체) 실시간으로 보여준다 — 속도를 위해 건별로는 병렬 처리하되
  // (Promise.all), 하나 끝날 때마다 진행 카운터만 올려서 순차 처리처럼 느리지 않다.
  const [deleteConfirmTargets, setDeleteConfirmTargets] = React.useState(null);
  const [bulkDeleteProgress, setBulkDeleteProgress] = React.useState({ done: 0, total: 0 });
  const requestDeleteAttachments = (targets) => {
    if (isViewer) { alert("조회전용 권한으로는 삭제할 수 없습니다."); return; }
    if (!targets.length) return;
    setDeleteConfirmTargets(targets);
  };
  const executeDeleteAttachments = async () => {
    const targets = deleteConfirmTargets || [];
    setDeleteConfirmTargets(null);
    if (!targets.length) return;
    setDeletingAttach(true);
    setBulkDeleteProgress({ done: 0, total: targets.length });
    try {
      // ⭐ 2026-11-05 첨부 일괄삭제 — 오더마다 따로 지우면 목록의 첨부 수가 줄마다 차례로 바뀌었다.
      //   지울 첨부를 먼저 모두 모은 뒤 writeBatch 한 번(450개씩 동시 커밋)으로 지운다(삭제 진행 창).
      //   화주사 사본(mirror) 쪽은 예전처럼 실패해도 무시 — 따로 묶음.
      const _ok = await runDelete({ count: targets.length, label: "첨부", task: async (progress) => {
        const mainOps = []; const mirrorOps = [];
        const collect = async (colName, id, ops) => {
          const snap = await getDocs(collection(db, colName, id, "attachments"));
          snap.docs.forEach(d => ops.push(d.ref));
          ops.push((b) => b.update(doc(db, colName, id), { attachCount: 0, attachViewed: true }));
        };
        await Promise.all(targets.map(async (r) => {
          const col = r.__col || "orders";
          try { await collect(col, r._id, mainOps); } catch (e) { console.error("첨부 삭제 실패:", r._id, e); }
          const mirror = attachMirrorTargetOf(r);
          if (mirror) {
            try { await collect(mirror.col, mirror.id, mirrorOps); } catch (e) { console.warn("첨부 동기화 삭제 실패(무시):", e); }
          }
        }));
        await commitDeletes(db, mainOps, { onProgress: (n) => { progress(Math.round((n / Math.max(1, mainOps.length)) * targets.length)); setBulkDeleteProgress({ done: Math.round((n / Math.max(1, mainOps.length)) * targets.length), total: targets.length }); } });
        if (mirrorOps.length) commitDeletes(db, mirrorOps).catch((e) => console.warn("첨부 동기화 삭제 실패(무시):", e));
      } }).then(() => true).catch((e) => { console.error("첨부 삭제 실패:", e); return false; });
      if (!_ok) return;
      setVerifiedCounts(prev => {
        const next = { ...prev };
        targets.forEach(r => { next[r._id] = 0; });
        return next;
      });
      setSelectedIds(new Set());
    } finally {
      setDeletingAttach(false);
    }
  };

  const sortedResults = React.useMemo(() => {
    const arr = [...results];
    if (sortMode === "done") return arr.sort((a,b) => (isDone(b) - isDone(a)) || (getCnt(b) - getCnt(a)) || (a.상차일||"").localeCompare(b.상차일||""));
    if (sortMode === "undone") return arr.sort((a,b) => (isDone(a) - isDone(b)) || (getCnt(a) - getCnt(b)) || (a.상차일||"").localeCompare(b.상차일||""));
    return arr.sort((a,b) => (a.상차일||"").localeCompare(b.상차일||""));
  }, [results, sortMode, verifiedCounts]);

  // ⭐ 전체저장 — 검색된 오더들 중 첨부가 있는 오더 전체의 사진을, 오더마다
  // 개별 다운로드하는 대신 파일명 규칙(날짜거래처명_하차지명)을 적용해 압축파일
  // 하나로 묶어 저장한다. 오더 수가 많을 때 브라우저가 다중 다운로드를 막는
  // 문제도 자연스럽게 피할 수 있다.
  const handleSaveAllZip = async () => {
    if (bulkSaving) return;
    const targets = sortedResults.filter(r => getCnt(r) > 0);
    if (!targets.length) { alert("저장할 첨부파일이 없습니다."); return; }
    setBulkSaving(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedNames = new Set();
      for (let i = 0; i < targets.length; i++) {
        const r = targets[i];
        setBulkProgress(`${i + 1}/${targets.length}건 처리 중...`);
        const col = r.__col || "orders";
        let items = [];
        try {
          const snap = await getDocs(collection(db, col, r._id, "attachments"));
          items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { continue; }
        // 서명 이미지는 업무서류가 아니라 전체저장 대상에서 제외
        items = items.filter(it => !(it?.source === "driver_signature" || it?.name === "서명.png"));
        items.forEach((item, idx) => {
          const src = item.base64 || item.url;
          if (!src || !src.startsWith("data:")) return;
          const name = buildAttachFileName(r, item, idx, items.length);
          // 같은 날짜·거래처·하차지 조합의 오더가 여러 건이면 파일명이 겹칠 수
          // 있어, zip 안에서 중복되면 뒤에 순번을 하나 더 붙여 구분한다.
          let finalName = name, dupIdx = 1;
          while (usedNames.has(finalName)) { dupIdx++; finalName = name.replace(/(\.[^.]+)$/, `_${dupIdx}$1`); }
          usedNames.add(finalName);
          zip.file(finalName, src.split(",")[1], { base64: true });
        });
      }
      if (!usedNames.size) { alert("저장할 첨부파일이 없습니다."); return; }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const label = clientQ.trim() || "전체";
      a.download = `첨부파일_${label}_${dateFrom}~${dateTo}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error("전체저장 실패:", e);
      alert("전체저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setBulkSaving(false);
      setBulkProgress("");
    }
  };

  const handleSend = (r) => {
    const dateStr = (() => {
      const d = r.상차일 || "";
      if (d && d.includes("-")) {
        const [y, m, day] = d.split("-");
        return `${Number(y)}년 ${Number(m)}월 ${Number(day)}일`;
      }
      return d;
    })();
    const lines = [
      `안녕하세요 ${companyName || "저희"}운송사입니다.`,
      "",
      `▦ ${dateStr}`,
      `상차 : ${r.상차지명 || "-"}`,
      `하차 : ${r.하차지명 || "-"}`,
      r.화물내용 ? `화물 : ${r.화물내용}` : null,
      "파렛전표 및 거래명세서, 타코기록지 등",
      "관련 서류 업로드를 부탁드립니다.",
      "",
      "★서류 미제출 시 운임 지급이 지연될 수 있습니다★",
      "",
      "[인수증 업로드 안내]",
      "아래 링크에서 서류를 업로드해 주세요.",
      "",
      "업로드 방법",
      "① 아래 링크 클릭",
      "② 날짜·차량번호·이름 확인",
      "③ 오더 선택 후 사진 업로드",
      "",
      // ⭐ 회사별 배포(방식 B) — 각 회사 사이트 주소를 따라가도록
      withCo(`${window.location.origin}/driver-upload`),
    ].filter(l => l !== null).join("\n");
    navigator.clipboard.writeText(lines)
      .then(() => { setSendDone(r._id); setTimeout(() => setSendDone(null), 2000); })
      .catch(() => alert("클립보드 복사 실패"));
  };

  const sortBtn = (mode, label) => (
    <button
      onClick={() => setSortMode(mode)}
      className={`px-3 py-1.5 text-[12px] font-bold rounded-lg border transition ${sortMode === mode ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:border-[#1B2B4B] hover:text-[#1B2B4B]"}`}>
      <EditableText id={`attachStatus.sortBtn.${mode}`} defaultText={label} />
    </button>
  );

  const doneCount = results.filter(isDone).length;
  const undoneCount = results.length - doneCount;
  // "완료" 표시(attachViewed만으로도 완료 처리될 수 있음)와 달리, 삭제 대상 판단에는
  // 실제 첨부파일이 있는지(getCnt>0)만 본다.
  const realAttachCount = results.filter(r => getCnt(r) > 0).length;

  if (!open) return null; // 🛠 2026-11-17 Hook을 모두 부른 뒤에 닫힘 처리(Hook 순서 고정)
  return (
    <div className="fixed inset-0 bg-black/50 z-[99998] flex items-center justify-center p-4">
      {/* 컬럼(날짜/거래처/상차지/하차지/첨부 상태/처리) 6개가 900px 안에 다 안 들어가
          가로 스크롤이 생기고 "처리" 열이 잘려 보이던 문제 — 좌우 스크롤 대신 팝업
          자체를 내용에 맞게 넓혔다. */}
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col" style={{width:"min(96vw, 1200px)", maxHeight:"90vh"}} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="font-bold text-[17px] text-[#1B2B4B]"><EditableText id="attachStatus.title" defaultText="첨부현황" /></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg transition">×</button>
        </div>
        {/* 검색 */}
        <div className="px-6 py-4 border-b border-gray-200 shrink-0 bg-gray-50">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-gray-700"><EditableText id="attachStatus.label.거래처명" defaultText="거래처명" /></label>
              <input autoComplete="off" type="text" value={clientQ} onChange={e => setClientQ(e.target.value)}
                onKeyUp={e => e.key === "Enter" && handleSearch()} placeholder="거래처명 입력"
                className="border border-gray-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1B2B4B] w-[200px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-gray-700"><EditableText id="attachStatus.label.기간" defaultText="기간" /></label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 border border-gray-300 rounded-lg px-2 py-2 bg-white">
                  <CustomSelect value={dateFrom.slice(0,4)} onChange={e => setDateFrom(`${e.target.value}-${dateFrom.slice(5,7)}-${dateFrom.slice(8,10)}`)} className="text-[14px] outline-none bg-transparent">
                    {Array.from({length:5},(_,i)=>now.getFullYear()-2+i).map(y=><option key={y} value={y}>{y}년</option>)}
                  </CustomSelect>
                  <CustomSelect value={dateFrom.slice(5,7)} onChange={e => setDateFrom(`${dateFrom.slice(0,4)}-${e.target.value}-${dateFrom.slice(8,10)}`)} className="text-[14px] outline-none bg-transparent">
                    {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m=><option key={m} value={m}>{Number(m)}월</option>)}
                  </CustomSelect>
                </div>
                <span className="text-gray-500 text-[13px] font-medium">부터</span>
                <div className="flex items-center gap-1 border border-gray-300 rounded-lg px-2 py-2 bg-white">
                  <CustomSelect value={dateTo.slice(0,4)} onChange={e => setDateTo(`${e.target.value}-${dateTo.slice(5,7)}-${dateTo.slice(8,10)}`)} className="text-[14px] outline-none bg-transparent">
                    {Array.from({length:5},(_,i)=>now.getFullYear()-2+i).map(y=><option key={y} value={y}>{y}년</option>)}
                  </CustomSelect>
                  <CustomSelect value={dateTo.slice(5,7)} onChange={e => {
                    const y = dateTo.slice(0,4); const m = e.target.value;
                    const lastD = new Date(Number(y), Number(m), 0).getDate();
                    setDateTo(`${y}-${m}-${String(lastD).padStart(2,"0")}`);
                  }} className="text-[14px] outline-none bg-transparent">
                    {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(m=><option key={m} value={m}>{Number(m)}월</option>)}
                  </CustomSelect>
                </div>
                <span className="text-gray-500 text-[13px] font-medium">까지</span>
              </div>
            </div>
            <button onClick={handleSearch} disabled={searching} className="px-6 py-2 bg-[#1B2B4B] text-white text-[14px] font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {searching ? "조회 중..." : <EditableText id="attachStatus.조회" defaultText="조회" />}
            </button>
          </div>
        </div>
        {/* 결과 헤더 (정렬 + 전체저장) */}
        {searched && results.length > 0 && (
          <div className="px-6 py-3 border-b border-gray-200 shrink-0 flex items-center justify-between bg-white flex-wrap gap-2">
            <div className="text-[13px] font-semibold text-gray-600">
              <EditableText id="attachStatus.stat.총" defaultText="총" /> <span className="font-bold text-gray-900">{results.length}</span>건 &nbsp;·&nbsp;
              <EditableText id="attachStatus.stat.완료" defaultText="완료" /> <span className="font-bold text-[#1B2B4B]">{doneCount}</span>건 &nbsp;·&nbsp;
              <EditableText id="attachStatus.stat.미완료" defaultText="미완료" /> <span className="font-bold text-gray-500">{undoneCount}</span>건
              {countsLoading && <span className="ml-2 text-[11px] text-gray-400">첨부 상태 확인 중...</span>}
            </div>
            <div className="flex gap-2 items-center">
              {sortBtn("date", "날짜순")}
              {sortBtn("done", "완료순")}
              {sortBtn("undone", "미완료순")}
              <button
                onClick={handleSaveAllZip}
                disabled={bulkSaving || doneCount === 0}
                title="첨부가 있는 오더 전체를 날짜/거래처명_하차지명 파일명으로 압축해 저장합니다"
                className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-emerald-600 text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkSaving ? (bulkProgress || "저장 중...") : <EditableText id="attachStatus.전체저장" defaultText="전체저장" />}
              </button>
              {/* ⭐ 첨부파일 선택삭제/전체삭제 — 오더는 안 지워지고 첨부만 지워지며,
                  완료처리 상태는 유지된다. 조회전용 권한은 버튼 자체를 숨긴다.
                  ⚠ 삭제 대상은 "완료" 표시가 아니라 실제 첨부파일이 있는(getCnt>0)
                  오더로만 한정한다 — 파일 없이 수동으로 완료처리만 해둔 오더까지
                  "전체삭제"에 포함되면 의미 없는 삭제만 수백 건 실행하게 된다. */}
              {!isViewer && (
                <>
                  {selectedIds.size > 0 && (
                    <span className="text-[12px] font-semibold text-gray-500">{selectedIds.size}건 선택됨</span>
                  )}
                  <button
                    onClick={() => requestDeleteAttachments(sortedResults.filter(r => selectedIds.has(r._id) && getCnt(r) > 0))}
                    disabled={deletingAttach || selectedIds.size === 0}
                    className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-red-600 text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingAttach ? "삭제 중..." : "선택삭제"}
                  </button>
                  <button
                    onClick={() => requestDeleteAttachments(sortedResults.filter(r => getCnt(r) > 0))}
                    disabled={deletingAttach || realAttachCount === 0}
                    title="실제 첨부파일이 있는 오더만 대상입니다(파일 없이 완료처리만 해둔 오더는 제외)"
                    className="px-3 py-1.5 text-[12px] font-bold rounded-lg border border-red-600 text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    전체삭제
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {/* 결과 */}
        <div className="flex-1 overflow-y-auto">
          {!searched && <div className="flex items-center justify-center py-20 text-[15px] font-medium text-gray-500">거래처명과 기간을 선택 후 조회하세요</div>}
          {searched && results.length === 0 && <div className="flex items-center justify-center py-20 text-[15px] font-medium text-gray-500">해당 기간에 오더가 없습니다</div>}
          {searched && results.length > 0 && (
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {!isViewer && (
                    <th className="px-5 py-3 text-center font-bold text-gray-700 whitespace-nowrap w-10">
                      <input type="checkbox"
                        title="실제 첨부파일이 있는 오더만 선택됩니다"
                        checked={realAttachCount > 0 && selectedIds.size === realAttachCount}
                        onChange={e => setSelectedIds(e.target.checked ? new Set(sortedResults.filter(r => getCnt(r) > 0).map(r => r._id)) : new Set())}
                        className="w-4 h-4 cursor-pointer" />
                    </th>
                  )}
                  <th className="px-5 py-3 text-left font-bold text-gray-700 whitespace-nowrap"><EditableText id="attachStatus.resultTable.header.날짜" defaultText="날짜" /></th>
                  <th className="px-5 py-3 text-left font-bold text-gray-700 whitespace-nowrap"><EditableText id="attachStatus.resultTable.header.거래처" defaultText="거래처" /></th>
                  <th className="px-5 py-3 text-left font-bold text-gray-700 whitespace-nowrap"><EditableText id="attachStatus.resultTable.header.상차지" defaultText="상차지" /></th>
                  <th className="px-5 py-3 text-left font-bold text-gray-700 whitespace-nowrap"><EditableText id="attachStatus.resultTable.header.하차지" defaultText="하차지" /></th>
                  <th className="px-5 py-3 text-center font-bold text-gray-700 whitespace-nowrap"><EditableText id="attachStatus.resultTable.header.첨부상태" defaultText="첨부 상태" /></th>
                  <th className="px-5 py-3 text-center font-bold text-gray-700 whitespace-nowrap"><EditableText id="attachStatus.resultTable.header.처리" defaultText="처리" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map(r => {
                  const cnt = getCnt(r);
                  const done = isDone(r);
                  return (
                    <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                      {!isViewer && (
                        <td className="px-5 py-3.5 text-center">
                          <input type="checkbox"
                            disabled={cnt === 0}
                            title={cnt === 0 ? "실제 첨부파일이 없어 삭제 대상이 아닙니다" : undefined}
                            checked={selectedIds.has(r._id)}
                            onChange={e => setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r._id); else next.delete(r._id);
                              return next;
                            })}
                            className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" />
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-gray-800 font-medium whitespace-nowrap">{r.상차일 || "-"}</td>
                      <td className="px-5 py-3.5 text-gray-800 font-medium whitespace-nowrap">{r.거래처명 || "-"}</td>
                      <td className="px-5 py-3.5 text-gray-800">{r.상차지명 || "-"}</td>
                      <td className="px-5 py-3.5 text-gray-800">{r.하차지명 || "-"}</td>
                      <td className="px-5 py-3.5 text-center">
                        {done
                          ? <span className="inline-block px-3 py-1 rounded-full bg-[#1B2B4B] text-white text-[13px] font-bold">{cnt > 0 ? `${cnt}장 완료` : "확인완료"}</span>
                          : <span className="inline-block px-3 py-1 rounded-full bg-gray-200 text-gray-600 text-[13px] font-bold">미완료</span>}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setViewRow(r)}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-[13px] font-bold hover:bg-gray-100 transition"><EditableText id="misc.btn.20956.보기" defaultText="보기" /></button>
                          <button onClick={() => handleSend(r)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition ${sendDone === r._id ? "bg-[#1B2B4B] text-white" : "border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"}`}>
                            {sendDone === r._id ? "복사됨" : "즉시전송"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {/* 푸터 */}
        <div className="px-6 py-3 border-t border-gray-200 shrink-0 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-[#1B2B4B] text-[14px] font-bold rounded-lg transition"><EditableText id="misc.btn.20972.닫기" defaultText="닫기" /></button>
        </div>
      </div>
      {viewRow && (
        <AttachmentViewer
          row={viewRow}
          onClose={() => setViewRow(null)}
          db={db}
          isViewer={isViewer}
          isViewed={viewRow.attachViewed === true}
          onToggleViewed={() => {
            const nextVal = !viewRow.attachViewed;
            setResults(prev => prev.map(x => x._id === viewRow._id ? { ...x, attachViewed: nextVal } : x));
            setViewRow(prev => prev ? { ...prev, attachViewed: nextVal } : prev);
            const col = viewRow.__col || "orders";
            updateDoc(doc(db, col, viewRow._id), { attachViewed: nextVal }).catch(() => {});
            const mirror = attachMirrorTargetOf(viewRow);
            if (mirror) updateDoc(doc(db, mirror.col, mirror.id), { attachViewed: nextVal }).catch(() => {});
          }}
          onSaved={() => {
            // ⭐ 파일을 1장 이상 실제로 저장했을 때만 "확인" 처리한다 — 단순히 열어서
            // 미리보기만 한 경우는 확인으로 치지 않는다.
            if (viewRow.attachViewed) return;
            setResults(prev => prev.map(x => x._id === viewRow._id ? { ...x, attachViewed: true } : x));
            setViewRow(prev => prev ? { ...prev, attachViewed: true } : prev);
            const col = viewRow.__col || "orders";
            updateDoc(doc(db, col, viewRow._id), { attachViewed: true }).catch(() => {});
            const mirror = attachMirrorTargetOf(viewRow);
            if (mirror) updateDoc(doc(db, mirror.col, mirror.id), { attachViewed: true }).catch(() => {});
          }}
        />
      )}

      {/* 첨부파일 삭제 확인 — 브라우저 기본 confirm() 대신 프로그램 톤에 맞춘 팝업 */}
      {deleteConfirmTargets && (
        <div className="fixed inset-0 bg-black/50 z-[100000] flex items-center justify-center p-4" onClick={() => setDeleteConfirmTargets(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-500/25 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-[15px]">첨부파일 삭제</h3>
                <p className="text-white/60 text-[12px] mt-0.5">오더는 삭제되지 않고, 완료 처리 상태는 유지됩니다</p>
              </div>
            </div>
            <div className="px-6 py-5 text-[14px] text-gray-700">
              선택한 <b className="text-[#1B2B4B]">{deleteConfirmTargets.length}건</b>의 첨부파일을 전부 삭제하시겠습니까?
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setDeleteConfirmTargets(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-[13px] hover:bg-gray-50 transition">취소</button>
              <button onClick={executeDeleteAttachments} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-[13px] hover:bg-red-700 transition">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 첨부파일 삭제 진행 중 — 몇 건 처리됐는지 실시간으로 보여준다 */}
      {deletingAttach && (
        <div className="fixed inset-0 bg-black/50 z-[100001] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[300px] px-6 py-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1B2B4B] rounded-full animate-spin" />
            <div className="text-[14px] font-bold text-[#1B2B4B]">첨부파일 삭제 중...</div>
            <div className="text-[13px] text-gray-500 font-semibold">{bulkDeleteProgress.done} / {bulkDeleteProgress.total}건</div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1B2B4B] transition-all duration-200"
                style={{ width: `${bulkDeleteProgress.total ? (bulkDeleteProgress.done / bulkDeleteProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 가로로 긴 테이블 하단에, 세로 스크롤 중에도 화면 하단에 붙어 있는 가로 스크롤바.
// 테이블이 몇 화면씩 길어져도 맨 아래까지 내려가지 않고 바로 좌우 이동할 수 있게 해준다.
export function StickyHScrollbar({ targetRef }) {
  const barRef = React.useRef(null);
  const syncingRef = React.useRef(false);
  const [sizes, setSizes] = React.useState({ scrollWidth: 0, clientWidth: 0 });

  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    // ⚡ 표 내용이 바뀔 때마다(정렬·실시간 반영) 그 자리에서 scrollWidth를 읽으면 브라우저가 큰 표 배치를
    //   즉시 강제로 계산한다 — 다음 화면 그릴 때 한 번만 읽도록 모은다.
    let raf = 0;
    const measure = () => { raf = 0; setSizes((p) => (p.scrollWidth === el.scrollWidth && p.clientWidth === el.clientWidth ? p : { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })); };
    const update = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", update);

    const onTableScroll = () => {
      if (syncingRef.current) { syncingRef.current = false; return; }
      if (barRef.current) { syncingRef.current = true; barRef.current.scrollLeft = el.scrollLeft; }
    };
    el.addEventListener("scroll", onTableScroll);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", update);
      el.removeEventListener("scroll", onTableScroll);
    };
  }, [targetRef]);

  const onBarScroll = () => {
    if (syncingRef.current) { syncingRef.current = false; return; }
    if (targetRef.current && barRef.current) {
      syncingRef.current = true;
      targetRef.current.scrollLeft = barRef.current.scrollLeft;
    }
  };

  if (sizes.scrollWidth <= sizes.clientWidth + 1) return null;

  return (
    <div
      ref={barRef}
      onScroll={onBarScroll}
      data-kp-hbar="1" /* 📌 2026-11-17 표 상자가 화면 높이로 묶이면(머리줄 고정) 상자 자체 가로 스크롤바가 보여서 이 막대는 숨긴다(index.css) */
      className="sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden"
      style={{ height: 14 }}
    >
      <div style={{ width: sizes.scrollWidth, height: 1 }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐ 최적매칭 — 우클릭 컨텍스트메뉴에서 "이 오더와 같거나 비슷한 노선(상/하차지·
// 화물내용·톤수·차량종류)을 과거에 뛰었던 기사"를 찾아 점수순으로 보여주고,
// 개별/일괄로 "가능하신지" 문자를 바로 보낼 수 있게 하는 배차 보조 도구.
// 4/5파트 어디서든 재사용할 수 있도록 완전히 독립적인(외부 클로저에 기대지 않는)
// 컴포넌트로 만들었다 — 이 파일은 도우미 함수들이 특정 컴포넌트 안에 갇혀있는 경우가
// 많아서, props로 받은 값만으로 전부 계산하게 해 어디서 호출하든 안전하게 동작한다.
// ══════════════════════════════════════════════════════════════════════════
export function _omNormKey(s = "") {
  return String(s).toLowerCase().replace(/\s+/g, "").replace(/[()（）\-.,]/g, "");
}
export function _omExtractTon(text = "") {
  const m = String(text || "").match(/([\d.]+)\s*톤/);
  return m ? parseFloat(m[1]) : null;
}
export function _omNormVehicle(type = "") {
  const t = String(type || "");
  if (/냉동/.test(t)) return "냉동";
  if (/냉장/.test(t)) return "냉장";
  if (/윙/.test(t)) return "윙바디";
  if (/탑/.test(t)) return "탑";
  if (/카고/.test(t)) return "카고";
  return t.trim();
}
// 대상 오더(row) 대비 과거 오더(cand) 유사도 점수 — 상/하차지 일치가 절대적으로 가장
// 중요하고(둘 다 일치해야 후보로 인정), 화물내용/차량종류/톤수가 비슷할수록 가점.
export function calcOptimalMatchScore(target, cand) {
  let score = 0;
  const pickupMatch = _omNormKey(cand.상차지명) === _omNormKey(target.상차지명);
  const dropMatch = _omNormKey(cand.하차지명) === _omNormKey(target.하차지명);
  if (!pickupMatch || !dropMatch) return 0; // 노선이 다르면 아예 후보 아님
  score += 60;
  const tCargo = String(target.화물내용 || "").trim();
  const cCargo = String(cand.화물내용 || "").trim();
  if (tCargo && cCargo) {
    if (_omNormKey(tCargo) === _omNormKey(cCargo)) score += 20;
    else if (_omNormKey(cCargo).includes(_omNormKey(tCargo).slice(0, 2))) score += 8;
  }
  if (target.차량종류 && cand.차량종류 && _omNormVehicle(target.차량종류) === _omNormVehicle(cand.차량종류)) score += 12;
  const tTon = _omExtractTon(target.차량톤수);
  const cTon = _omExtractTon(cand.차량톤수);
  if (tTon != null && cTon != null && Math.abs(tTon - cTon) <= 0.5) score += 8;
  return score;
}

// 하차일이 상차일과 다르면(익일 하차 등) "8/7 오전 9시"처럼 월/일을 앞에 붙여준다.
export function _omDropTimeLabel(row) {
  const time = row.하차시간 || "즉시";
  if (!row.하차일 || row.하차일 === row.상차일) return time;
  const m = String(row.하차일).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return time;
  return `${Number(m[2])}/${Number(m[3])} ${time}`;
}
export function buildOptimalMatchSmsBody(row, companyName) {
  const co = companyName ? `${companyName}운송사입니다.` : "운송사입니다.";
  return [
    `안녕하세요 ${co}`,
    `${row.상차지명 || "-"} → ${row.하차지명 || "-"} 건`,
    `배차 가능하신지 확인 부탁드립니다.`,
    `★어려우신 경우 답장 안 주셔도 됩니다★`,
    ``,
    `${row.상차일 || ""}`,
    ``,
    `상차지 : ${row.상차지명 || "-"}`,
    `${row.상차지주소 || ""}`,
    `상차시간 : ${row.상차시간 || "즉시"}`,
    ``,
    `하차지 : ${row.하차지명 || "-"}`,
    `${row.하차지주소 || ""}`,
    `하차시간 : ${_omDropTimeLabel(row)}`,
    ``,
    `화물내용 : ${row.화물내용 || "-"}`,
    `차량톤수 : ${row.차량톤수 || "-"}`,
    `차량종류 : ${row.차량종류 || "-"}`,
  ].join("\n");
}

// 이 기사님이 이 노선을 주로 어느 요일/시간대에 뛰었는지 요약 — "주로 화,목요일 · 오후 운행"
export const _omWeekdays = ["일", "월", "화", "수", "목", "금", "토"];
export function summarizeDayPattern(records) {
  if (!records || !records.length) return null;
  const wdCount = {};
  let amCount = 0, pmCount = 0;
  records.forEach(r => {
    const m = String(r.상차일 || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const w = _omWeekdays[dt.getDay()];
      wdCount[w] = (wdCount[w] || 0) + 1;
    }
    const t = String(r.상차시간 || "");
    if (t.includes("오전")) amCount++;
    else if (t.includes("오후")) pmCount++;
  });
  const sorted = Object.entries(wdCount).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  const top = sorted[0][1];
  const topDays = sorted.filter(([, c]) => c === top).map(([w]) => w);
  const timeLabel = amCount === 0 && pmCount === 0 ? ""
    : amCount >= pmCount * 2 ? " · 주로 오전 운행"
    : pmCount >= amCount * 2 ? " · 주로 오후 운행"
    : "";
  const prefix = records.length >= 2 && top >= 2 ? "주로 " : "";
  return `${prefix}${topDays.join(",")}요일${timeLabel}`;
}

// 보고서/출력물에 찍히는 "우리 회사" 정보와 "출력한 담당자" 정보 — 예전엔 각 보고서
// 템플릿마다 특정 회사/RUN25/특정 계정 이름이 문자열로 고정 박혀있어 다른 운송사가
// 로그인해도 항상 그 정보로 인쇄됐다. 어느 컴포넌트에서 호출하든 안전하도록(외부
// 클로저에 기대지 않도록) db/auth 전역 import만 사용하는 순수 함수로 분리한다.
export async function fetchCompanyPrintInfo(companyName) {
  const co = (companyName || "").trim();
  if (!co) return null;
  try {
    const snap = await getDocs(collection(db, "transportApplications"));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규" && d.status === "approved");
    if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규");
    if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.status === "approved");
    // ⭐ 2026-11-01 주소가 비어 있으면 같은 회사 다른 신청서의 주소로 보완
    if (found && !String(found.address || found.주소 || "").trim()) {
      const withAddr = docs.find(d => (d.companyName || "").trim() === co && String(d.address || d.주소 || "").trim());
      if (withAddr) found = { ...found, address: withAddr.address || withAddr.주소 };
    }
    return found || null;
  } catch { return null; }
}
export async function fetchPrinterInfo() {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export function OptimalMatchModal({ row, dispatchData, onClose, companyName }) {
  useLoadFullOrderHistory(!!row); // ★ 최적매칭은 예전 오더 전체가 필요 — 열릴 때 1회
  const toWon = (v) => Number(String(v || "0").replace(/[^\d]/g, "")) || 0;
  const [selected, setSelected] = React.useState(() => new Set());

  const candidates = React.useMemo(() => {
    if (!row) return [];
    const map = new Map();
    (dispatchData || []).forEach(r => {
      if (r === row || r._id === row._id) return;
      const name = (r.이름 || "").trim();
      const plate = (r.차량번호 || "").trim();
      if (!name && !plate) return; // 기사 정보가 없는 이력은 후보가 될 수 없음
      const score = calcOptimalMatchScore(row, r);
      if (score <= 0) return;
      const key = `${name}|${plate}`;
      const prev = map.get(key);
      const g = prev || { 이름: name, 차량번호: plate, 전화번호: r.전화번호 || "", count: 0, bestScore: 0, totalFare: 0, totalDriverFare: 0, latest: null, records: [] };
      g.count += 1;
      g.bestScore = Math.max(g.bestScore, score);
      g.totalFare += toWon(r.청구운임);
      g.totalDriverFare += toWon(r.기사운임);
      if (!g.전화번호 && r.전화번호) g.전화번호 = r.전화번호;
      if (!g.latest || String(r.상차일 || "") > String(g.latest.상차일 || "")) g.latest = r;
      g.records.push(r);
      map.set(key, g);
    });
    return [...map.values()]
      .map(g => ({ ...g, dayPattern: summarizeDayPattern(g.records) }))
      .sort((a, b) => b.bestScore - a.bestScore || b.count - a.count);
  }, [row, dispatchData]);

  if (!row) return null;

  const smsBody = buildOptimalMatchSmsBody(row, companyName);

  const sendTo = (phones) => {
    const list = [...new Set(phones.filter(Boolean))];
    if (!list.length) return;
    sendText({ phones: list, body: smsBody }); // 💬 2026-11-10 회사 설정(휴대폰과 연결 · 회사 번호 문자)
  };

  const toggle = (key) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const selectedPhones = candidates.filter(c => selected.has(`${c.이름}|${c.차량번호}`)).map(c => c.전화번호.replace(/[^\d]/g, ""));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]">
      <div className="bg-white rounded-2xl shadow-2xl w-[840px] max-w-[95vw] max-h-[86vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-[15px] whitespace-nowrap">최적매칭</h3>
            <p className="text-white/60 text-[12px] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
              {row.상차일 || ""} · {row.상차지명 || "-"} → {row.하차지명 || "-"} 건과 같은 노선을 다녀간 기사
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none shrink-0">✕</button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 text-[12px] text-gray-500 shrink-0 whitespace-nowrap overflow-x-auto">
          화물 <span className="font-semibold text-gray-700">{row.화물내용 || "-"}</span> · 차량톤수 <span className="font-semibold text-gray-700">{row.차량톤수 || "-"}</span> · 상차시간 <span className="font-semibold text-gray-700">{row.상차시간 || "즉시"}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-gray-500">
              같은 노선을 다녀간 기사 이력이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {candidates.map((c) => {
                const key = `${c.이름}|${c.차량번호}`;
                const checked = selected.has(key);
                const avgFare = c.count ? Math.round(c.totalFare / c.count) : 0;
                return (
                  <div key={key} className="px-6 py-3 flex items-center gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(key)} className="w-4 h-4 accent-[#1B2B4B] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
                        <span className="font-bold text-[14px] text-gray-900">{c.이름 || "-"}</span>
                        <span className="text-[12px] font-semibold text-gray-500 tabular-nums">{c.차량번호 || "-"}</span>
                        <span className="text-[11px] font-semibold text-gray-500">{formatPhone(c.전화번호) || "-"}</span>
                      </div>
                      <div className="text-[12px] text-gray-500 mt-0.5 whitespace-nowrap">
                        이 노선 <span className="font-semibold text-[#1B2B4B]">{c.count}</span>회 · 최근 {c.latest?.상차일 || "-"} · 평균운임 {avgFare.toLocaleString()}원
                        {c.dayPattern && <> · {c.dayPattern}</>}
                      </div>
                    </div>
                    <button
                      onClick={() => sendTo([c.전화번호])}
                      disabled={!c.전화번호}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                    >
                      문자보내기
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-nowrap shrink-0">
          <span className="text-[12px] text-gray-500 truncate min-w-0">{selected.size > 0 ? `${selected.size}명 선택됨` : "여러 명을 체크하면 한 번에 문자를 보낼 수 있습니다"}</span>
          <div className="flex gap-2 shrink-0 whitespace-nowrap">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition whitespace-nowrap"><EditableText id="misc.btn.21801.닫기" defaultText="닫기" /></button>
            <button
              onClick={() => sendTo(selectedPhones)}
              disabled={selectedPhones.length === 0}
              className="px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243d6a] disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              선택 기사에게 문자보내기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
// ===================== PART 4/8 — END =====================

// ─── 메모 아이콘 셀 ──────────────────────────────────────────────────────────
export function MemoIconCell({ text = "", urgency = "" }) {
  const [open, setOpen] = React.useState(false);
  const clean = String(text || "").trim();
  const has = clean.length > 0;
  const iconColor = !has ? "#cbd5e1"
    : urgency === "CRITICAL" ? "#dc2626"
    : urgency === "HIGH" ? "#d97706"
    : "#1B2B4B";

  return (
    <div className="flex items-center justify-center">
      <button
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto"
        onClick={() => { if (has) setOpen(true); }}
        style={{ cursor: has ? "pointer" : "default" }}
        title={has ? (clean.length > 40 ? clean.slice(0, 40) + "…" : clean) : "메모 없음"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
        {urgency === "CRITICAL" && (
          <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-red-600 rounded-full border border-white" />
        )}
        {urgency === "HIGH" && (
          <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
        )}
      </button>

      {open && createPortal( // ★ 표 레이어 분리(끊김 개선) 뒤에도 화면 전체에 뜨도록 body에 그린다
        <div className="kp-pc-pop fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[92vw] border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-5 py-4 rounded-t-2xl flex items-center gap-3">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span className="text-white font-bold text-[15px]">메모</span>
              {urgency === "CRITICAL" && <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full">긴급</span>}
              {urgency === "HIGH" && <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full">중요</span>}
              <button onClick={() => setOpen(false)} className="ml-auto text-white/60 hover:text-white transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-5">
              <p className="text-[14px] text-gray-700 whitespace-pre-wrap leading-relaxed">{clean}</p>
            </div>
            <div className="px-5 pb-4 flex justify-end border-t border-gray-100 pt-3">
              <button onClick={() => setOpen(false)} className="px-5 py-2 bg-[#1B2B4B] text-white rounded-lg text-[13px] font-semibold hover:opacity-90 transition"><EditableText id="misc.btn.32092.닫기" defaultText="닫기" /></button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// ─── 전달사항 아이콘 셀 ───────────────────────────────────────────────────────
export function NoteIconCell({ value = "", onSave }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const clean = String(value || "").trim();
  const has = clean.length > 0;
  const iconColor = has ? "#1B2B4B" : "#cbd5e1";

  const handleOpen = () => { setDraft(clean); setEditing(false); setOpen(true); };
  const handleSave = async () => {
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    if (onSave) onSave(draft); setOpen(false);
  };

  return (
    <div className="flex items-center justify-center">
      <button
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto"
        onClick={handleOpen}
        title={has ? (clean.length > 40 ? clean.slice(0, 40) + "…" : clean) : "전달사항 없음"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </button>

      {open && createPortal( // ★ 표 레이어 분리(끊김 개선) 뒤에도 화면 전체에 뜨도록 body에 그린다
        <div className="kp-pc-pop fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[92vw] border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-5 py-4 rounded-t-2xl flex items-center gap-3">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span className="text-white font-bold text-[15px]">전달사항</span>
              <button onClick={() => { setOpen(false); setEditing(false); }} className="ml-auto text-white/60 hover:text-white transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-5">
              {editing ? (
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[14px] resize-none focus:outline-none focus:border-[#1B2B4B]"
                  rows={4}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  ref={imeFocusRef}
                  onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
                />
              ) : (
                <p className="text-[14px] text-gray-700 whitespace-pre-wrap leading-relaxed min-h-[40px]">
                  {has ? clean : <span className="text-gray-500">전달사항이 없습니다.</span>}
                </p>
              )}
            </div>
            <div className="px-5 pb-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-[13px] font-semibold hover:opacity-90 transition border border-gray-200"><EditableText id="misc.btn.32158.취소" defaultText="취소" /></button>
                  <button onClick={handleSave} className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-[13px] font-semibold hover:opacity-90 transition"><EditableText id="misc.btn.32159.저장" defaultText="저장" /></button>
                </>
              ) : (
                <>
                  {onSave && <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-[13px] font-semibold hover:opacity-90 transition border border-gray-200"><EditableText id="misc.btn.32163.수정" defaultText="수정" /></button>}
                  <button onClick={() => setOpen(false)} className="px-4 py-2 bg-[#1B2B4B] text-white rounded-lg text-[13px] font-semibold hover:opacity-90 transition"><EditableText id="misc.btn.32164.닫기" defaultText="닫기" /></button>
                </>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

/* ---------------------- 주소 더보기 ---------------------- */
export function AddressCell({ text = "", max = 5, valueClassName = "", popupTitle = "주소 전체보기" }) {
  const [open, setOpen] = React.useState(false);
  const clean = String(text || "");
  const isLong = clean.length > max;
  const short = isLong ? clean.slice(0, max) + "…" : clean;

  if (!clean) return <span className="text-gray-500">-</span>;

  return (
    <div className="relative inline-block">
      <span className={valueClassName}>{short}</span>
      {isLong && (
        <button onClick={() => setOpen(true)} className="text-[11px] text-[#1B2B4B] ml-1 underline hover:opacity-70">
          더보기
        </button>
      )}
      {open && createPortal( // ★ 표 레이어 분리(끊김 개선) 뒤에도 화면 전체에 뜨도록 body에 그린다
        <div
          className="kp-pc-pop fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]">{popupTitle}</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{clean}</p>
            </div>
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setOpen(false)} className="px-5 py-2 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition"><EditableText id="misc.btn.41467.닫기" defaultText="닫기" /></button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// ─────────── 내정보 컴포넌트 ───────────
// 내정보 화면의 카드 틀 — 화면 안에서 만들면 입력칸이 매 글자마다 다시 그려져 포커스가 빠지므로 밖에 둔다
// ⭐ 회사관리(회사정보·내정보) 공용 카드 — 영문 소제목 + 제목 + 설명, 아래 얇은 구분선. 글씨는 크고 진하게.
export const KP_CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";

// ⭐ 2026-11-02 점검 — 사업자등록증·직인 base64가 한 문서(transportApplications, 한도 1MiB)에 함께 저장되므로 저장 전에 이미지를 줄임(직인은 투명 배경 유지)
export const COMPANY_DOC_B64_LIMIT = 900000;
export function shrinkImageForDoc(file, { max = 1600, quality = 0.8, keepAlpha = false } = {}) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const src = String(fr.result || "");
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        try {
          const r = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
          const g = c.getContext("2d");
          if (!keepAlpha) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(img, 0, 0, c.width, c.height);
          let out = keepAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality);
          if (keepAlpha && out.length > 300000) {
            const webp = c.toDataURL("image/webp", 0.85);
            if (webp.startsWith("data:image/webp") && webp.length < out.length) out = webp;
          }
          resolve(out.length < src.length ? out : src);
        } catch { resolve(src); }
      };
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}
