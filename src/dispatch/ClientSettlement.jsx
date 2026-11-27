// ======================= src/dispatch/ClientSettlement.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { escHtml } from "../htmlSafe";
import { kpConfirm, kpPrompt } from "../kpDialog";
import { runBulkTask, deleteDocsAtomic, runDelete } from "../DeleteProgress";
import BulkUploadChooser from "../BulkUploadChooser";
import { imeFocusRef } from "../imeFocus";
import { html2canvas, loadJsPDF } from "../lazyLoad";
import React, { useRef, useState, useMemo, useEffect } from "react";
import { getTenant } from "../fsTenant";
import { createPortal } from "react-dom";
import { useCloseDaysVersion, closeRuleOf, clientPeriod, periodText } from "../clientCloseDays";
import ClientCloseDayModal, { ClientCloseDateModal } from "../ClientCloseDayModal";
import { useCompanyBiz, bizOf, printInfoForBiz } from "../companyBiz";
import { BankReviewQueue } from "../PopbillAuto";
import { arPaidMapOf, buildArMonths as buildArMonthsCore, allocArDeposit as allocArDepositCore, matchDeposits, allocKindOf } from "../arMatch";
import CustomDatePicker from "../CustomDatePicker";
import { DateTimeSelect } from "../kpTimePick";
import { useMyProfile, myNameNow } from "../userNames";
import { sendCompanyMail, isMailSetupNeeded } from "../companyMail";
import { MailSenderLine } from "../CompanyMailSettings";
import { EditableText } from "../EditMode";
import { stmtIncludePrepaidOf, monthOf as billYmOf, statementRowsOf, isSettledIn, settledDateIn, isPrepaidPay } from "../arAging";
import { CustomSelect } from "../CustomSelect";
import { monthStart, monthEnd, useLoadOrderRange, monthStartAgo } from "../orderHistory";
import { addDoc, collection, serverTimestamp, getDoc, doc, onSnapshot, query, where, deleteDoc } from "firebase/firestore";
import { updateDoc, setDoc } from "../orderWrite";
import { db, auth, DEFAULT_COMPANY } from "../firebase";
import { useIsPhone, SubNavBar } from "../KpSubNav";
import { useArDesk, arDeskId, stageIdx, viewStage, stageLabel, agingKey, AGING, StatementBoard, sdBtn, Ico, IC, PrepaidToggle, StatementClientRail, sdBtnPri, StageBadge, CloseStrip, StageStepper, StatementLineGrid, StatementHistory, KpModal, sdInp, ArOverview, AR_STATUS, ArClientList, ArAccrualMap, ArDetail, StageRecordModal } from "../SettleDesk";
import { useFareRules, FareTypeBreakdown } from "../fareRules";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { routeGroupOf, RG_NONE, rgLabel } from "../routeGroups";
import { visibleCols, pickForm, headerLabels } from "../invoiceForm";
import { closeBoard as closeBoardOf, approvePatch as closeApprovePatch, rejectPatch as closeRejectPatch, tempUnlockPatch, relockPatch } from "../closeFlow";
import { stmtDrift, stmtDriftText, stmtDriftHint } from "../settleCore";
import { COLL, COMPANY_DOC_B64_LIMIT, InvoicePreviewRows, KP_MONO, _invoiceFit, _parseWaypointList, captureInvoiceFull, expandInvoicePreview, fetchPrinterInfo, loadXLSX, mergeViaCargoText, sflowToast, shrinkImageForDoc } from "./shared/dispatchCommon.jsx";

const CompanyInboxLazy = React.lazy(() => import("../CompanyInbox")); // 📥 2026-11-14 메일함 › 받은메일


// ⭐ html2canvas로 캡처한 캔버스를 A4 PDF로 저장할 때 공용으로 쓰는 다중 페이지
// 헬퍼 — 예전엔 캡처한 이미지 전체를 페이지마다 음수 좌표로 반복해서 그대로
// 붙이는 방식이었는데, 내용이 길면(거래명세서처럼 건수가 많으면) 이미지 한
// 장이 너무 커져 일부 PDF 뷰어에서 페이지가 깨지거나, A4 폭(210mm)에 억지로
// 맞추다 보니 글씨가 통째로 조그맣게 뭉개지는 원인이었다. 대신 캔버스를 실제
// 페이지 높이만큼 "잘라서" 페이지마다 별도의 이미지로 추가한다 — 페이지 수는
// 내용 길이에 따라 자연스럽게 늘어나고(강제로 1페이지에 욱여넣지 않음), 각
// 페이지의 글씨/이미지 크기는 화면에 보이는 것과 동일한 비율로 유지된다.
function addCanvasAsMultiPagePdf(pdf, canvas, { format = "PNG", quality } = {}) {
  const pageWidthMm = 210, pageHeightMm = 297;
  const pageHeightPx = Math.floor((canvas.width * pageHeightMm) / pageWidthMm);
  let renderedPx = 0;
  let pageIdx = 0;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
    const mime = format === "JPEG" ? "image/jpeg" : "image/png";
    const sliceImgData = quality != null ? pageCanvas.toDataURL(mime, quality) : pageCanvas.toDataURL(mime);
    const sliceHeightMm = (sliceHeightPx * pageWidthMm) / canvas.width;
    if (pageIdx > 0) pdf.addPage();
    pdf.addImage(sliceImgData, format, 0, 0, pageWidthMm, sliceHeightMm);
    renderedPx += sliceHeightPx;
    pageIdx++;
  }
  return pdf;
}
const StmtCompareModal = React.lazy(() => import("../StmtCompare")); // ⭐ 2026-11-17 업체 명세서 비교(거래처정산)
const InvoiceFormEditor = React.lazy(() => import("../InvoiceFormEditor")); // 🧾 2026-11-16 거래처별 명세서 양식
// ⭐ 2026-11-17 명세서 미리보기가 반쯤 잘려 보이던 문제 — 문서가 글자 길이만큼(w-max) 넓어져 좁은 미리보기 칸에서 오른쪽이 잘렸다.
//  이제 문서는 A4 폭(820px, 내용이 더 넓으면 그만큼)으로 그리고, 칸이 좁으면 칸 폭에 맞춰 통째로 줄여 보여 준다(ResizeObserver + scale).
//  PDF · 메일 첨부(html2canvas)는 줄인 모양을 찍지 않도록 captureInvoiceFull() 안에서 잠깐 원래 크기로 돌려 찍는다.
const INVOICE_DOC_W = 820;
// ⭐ 2026-11-17 (3차) 미리보기 글씨가 뭉개지던 문제 — 원인: transform: scale() 로 820px 문서를 통째로 줄여(나란히 볼 때 0.6배 남짓)
//  11px 글씨가 6~7px 로 그려졌고, 글자가 픽셀 칸에 맞춰지지 않은 채(힌팅 없이) 축소돼 흐릿하게 깨져 보였다.
//  이제 CSS zoom 으로 줄인다 — 브라우저가 줄인 크기로 다시 글자를 배치해 또렷하다(크롬 · 엣지 · 사파리 · 파이어폭스 126+).
//  zoom 이 없는 브라우저만 예전 transform 방식. 그리고 0.85배 아래로는 줄이지 않는다(그보다 좁으면 옆으로 넘겨 본다).
const INVOICE_ZOOM_OK = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "0.5");
const INVOICE_MIN_SCALE = 0.85;
function InvoiceDocFit({ children, fit = true, maxScale = 1, minScale = INVOICE_MIN_SCALE }) {
  const outer = useRef(null), inner = useRef(null);
  const [box, setBox] = useState({ s: 1, h: null, x: 0 });
  React.useLayoutEffect(() => {
    const o = outer.current, n = inner.current;
    if (!o || !n) return undefined;
    const run = () => {
      // 원래 크기(줄이기 전)를 잰다 — zoom 은 offset* 값에도 걸리므로 잠깐 풀고 잰다
      const pz = n.style.zoom; if (pz) n.style.zoom = "";
      const cw = o.clientWidth, nw = n.offsetWidth, nh = n.offsetHeight;
      if (pz) n.style.zoom = pz;
      if (!cw || !nw) return;
      let s = fit ? Math.min(maxScale, cw / nw) : 1;
      if (fit && s < minScale) s = Math.min(1, minScale); // 글씨가 깨질 만큼 작게 줄이지 않는다 — 대신 옆으로 넘겨 본다
      s = Math.floor(s * 1000) / 1000; // ⭐ 2026-11-17 내림 — 반올림하면 칸보다 0.몇 px 넓어져 가로 스크롤이 생겼다
      const x = s > 1 ? Math.max(0, Math.round((cw - nw * s) / 2)) : 0;
      setBox((p) => (Math.abs(p.s - s) < 0.002 && p.h === Math.round(nh * s) && p.x === x ? p : { s, h: Math.round(nh * s), x }));
    };
    run();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(run); ro.observe(o); ro.observe(n); }
    else window.addEventListener("resize", run);
    const full = () => { // 찍는 동안 원래 크기(html2canvas 는 zoom · transform 을 제대로 못 그린다)
      const t = n.style.transform, z = n.style.zoom, ov = o.style.overflow, hh = o.style.height;
      n.style.transform = "none"; n.style.zoom = ""; o.style.overflow = "visible"; o.style.height = "auto";
      // ⭐ 2026-11-17 화면에서만 좁힌 종이 여백(data-kp-pad)을 찍는 동안 원래 A4 여백으로 — PDF · 메일 첨부 모양은 예전 그대로
      const pads = [...n.querySelectorAll("[data-kp-pad]")].map((el) => { const p0 = el.style.padding; el.style.padding = el.getAttribute("data-kp-pad"); return () => { el.style.padding = p0; }; });
      return () => { pads.forEach((u) => u()); n.style.transform = t; n.style.zoom = z; o.style.overflow = ov; o.style.height = hh; };
    };
    _invoiceFit.add(full);
    return () => { _invoiceFit.delete(full); if (ro) ro.disconnect(); else window.removeEventListener("resize", run); };
  }, [fit, maxScale, minScale]);
  const { s, h, x } = box;
  if (INVOICE_ZOOM_OK) {
    // zoom — 줄인 크기가 그대로 자리(폭 · 높이)가 되므로 높이 맞추기 · absolute 가 필요 없다 · 넓으면 가운데 · 좁으면 옆으로 넘김
    return (
      <div ref={outer} data-kp="inv-fit" style={{ width: "100%", overflowX: fit ? "auto" : "visible", position: "relative" }}>
        <div ref={inner} data-kp="inv-fit-doc" style={{ width: INVOICE_DOC_W, minWidth: "min-content", zoom: s !== 1 ? s : undefined, margin: "0 auto" }}>
          {children}
        </div>
      </div>
    );
  }
  const shrink = s < 0.999;
  // (예전 방식) 줄일 땐 왼쪽 위 기준으로 줄이고 바깥 높이를 줄인 높이로 맞춘다(아래 빈칸 · 잘림 없음) · 넓으면 가운데
  return (
    <div ref={outer} data-kp="inv-fit" style={{ width: "100%", height: h != null ? h : "auto", overflowX: fit ? "auto" : "visible", overflowY: fit ? "hidden" : "visible", position: "relative" }}>
      <div ref={inner} style={{ width: INVOICE_DOC_W, minWidth: "min-content", transform: s !== 1 ? `scale(${s})` : "none", transformOrigin: "top left", position: shrink || s > 1 ? "absolute" : "relative", left: x, top: 0, margin: shrink || s > 1 ? 0 : "0 auto" }}>
        {children}
      </div>
    </div>
  );
}
// ⭐ 2026-11-17 (3차) 편집 표 + 미리보기 나란히 보기 — 화면 크기(media query)가 아니라 이 자리의 실제 폭으로 정한다
//  (왼쪽 메뉴 · 거래처 목록 고정 · 브라우저 확대에 따라 남는 폭이 달라서) · 미리보기 칸이 ~740px(0.9배) 이상일 때만 나란히
const STMT_SIDE_MIN = 1440;
function useBoxWidth() {
  const [w, setW] = useState(0);
  const roRef = useRef(null);
  const ref = React.useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); roRef.current = ro; }
  }, []);
  return [ref, w];
}
// ⭐ 2026-11-17 (3차) 명세서 내역 표 칸 폭(A4 안에 들어가게) — 날짜 · 차량번호 · 금액은 한 줄, 상차지 · 하차지 · 경유지 · 화물명이 남는 폭을 나눠 쓰고 길면 줄바꿈
const INVOICE_COL_W = { 상차일: 74, 톤수: 40, 차량종류: 52, 기사명: 52, 차량번호: 86 };
function InvoiceColGroup({ form }) {
  const tax = form?.tax !== false;
  return (
    <colgroup>
      <col style={{ width: 30 }} />
      {visibleCols(form).map((c) => <col key={c.k} style={INVOICE_COL_W[c.k] ? { width: INVOICE_COL_W[c.k] } : undefined} />)}
      {tax ? [70, 62, 76].map((w, i) => <col key={`m${i}`} style={{ width: w }} />) : <col style={{ width: 84 }} />}
    </colgroup>
  );
}
function mergeViaNames(waypointLists) {
  const names = [];
  for (const list of waypointLists) {
    for (const s of _parseWaypointList(list)) {
      const name = String(s?.업체명 || "").trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names.join(", ");
}

function SentMailLogItem({ log, onDelete }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className={`rounded-lg px-4 py-2.5 border text-[12px] ${log.status === "success" ? "bg-[#f4f6f9] border-[#d0dae8]" : "bg-[#fdf4f4] border-[#e8c8c8]"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold text-[11px] px-2 py-0.5 rounded ${log.status === "success" ? "bg-[#1B2B4B] text-white" : "bg-[#7a2020] text-white"}`}>
            {log.status === "success" ? "성공" : "실패"}
          </span>
          <span className="text-[10px] text-gray-500 font-semibold px-1.5 py-0.5 bg-gray-100 rounded">{log.type || ""}</span>
          <span className="text-[11px] text-gray-500">{log.sentAt ? new Date(log.sentAt).toLocaleString("ko-KR") : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          {log.body && (
            <button onClick={() => setExpanded(v => !v)} className="text-[11px] text-blue-500 hover:text-blue-700">
              {expanded ? "접기" : "내용 보기"}
            </button>
          )}
          <button onClick={onDelete} className="text-gray-400 hover:text-red-400 transition text-[11px]"><EditableText id="misc.btn.5623.삭제" defaultText="삭제" /></button>
        </div>
      </div>
      <div className="mt-1 text-gray-600">수신: {log.to}</div>
      <div className="text-gray-500 font-semibold text-[12px]">{log.subject}</div>
      {log.attachmentNames?.length > 0 && (
        <div className="text-[11px] text-gray-500 mt-0.5">첨부: {log.attachmentNames.join(", ")}</div>
      )}
      {expanded && log.body && (
        <div className="mt-2 text-gray-600 whitespace-pre-wrap bg-white border border-gray-100 rounded p-2 text-[11px] max-h-[200px] overflow-y-auto">
          {log.body}
        </div>
      )}
      {log.error && <div className="text-[#7a2020] text-[11px] mt-0.5">{log.error}</div>}
    </div>
  );
}

// Firestore 문서 크기(1MB) 안에서 안전하게 저장 가능한 첨부파일 총량 — base64라 원본보다
// 커지는 점 감안해 여유있게 700KB로 제한한다. 초과하면 예약발송을 지원하지 않는다.
const SCHEDULED_EMAIL_ATTACH_LIMIT = 700 * 1024;
function scheduledEmailAttachSize(attachments) {
  return (attachments || []).reduce((sum, a) => sum + (a?.content?.length || 0), 0);
}
// 정산관리의 이메일 발송 지점들이 공용으로 쓰는 "예약발송 등록" — 즉시 보내는 대신
// scheduledEmails 컬렉션에 저장해두면, DispatchApp의 예약 이메일 체커가 예약시각에 맞춰
// 대신 발송한다(위쪽 useEffect 참고).
// ⭐ 2026-11-06 일반 이메일 주소 확인(보내는 사람·받는 사람)
const GEN_MAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/;
async function scheduleEmailDoc({ companyName, to, subject, html, attachments = [], fromName, replyTo = "", sendAt, type = "예약메일", meta = {} }) {
  await addDoc(collection(db, "scheduledEmails"), {
    companyName: companyName || "",
    to, subject, html,
    attachments,
    fromName: fromName || "",
    replyTo: replyTo || "", // ⭐ 2026-11-06 보내는 사람 이메일(답장 받을 주소)
    sendAt,
    status: "pending",
    type,
    meta,
    createdAt: serverTimestamp(),
    createdByUid: auth.currentUser?.uid || "",
    createdByEmail: auth.currentUser?.email || "",
  });
}
// ===================== DispatchApp.jsx (PART 7/8) — END =====================


// ===================== DispatchApp.jsx (PART 8/8) — START =====================
// 미수금관리 — 거래처 칸에서 고르는 "전체 거래처"
const AR_ALL = "전체 거래처";
// 💳 거래처 결제 조건 → 결제 예정일 (예: "익월 말일", "익월 10일", "당월 말일", "30일", "익익월 15일")
function arDueDate(yyyymm, rule) {
  const r = String(rule || "").replace(/\s+/g, "");
  if (!r || !/^\d{4}-\d{2}$/.test(String(yyyymm || ""))) return "";
  const [y, m] = yyyymm.split("-").map(Number);
  const lastOf = (yy, mm) => new Date(yy, mm, 0).getDate();
  const fmt = (yy, mm, dd) => { const d = new Date(yy, mm - 1, dd); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const add = r.startsWith("익익월") ? 2 : r.startsWith("익월") ? 1 : r.startsWith("당월") ? 0 : null;
  if (add != null) {
    const mm = m + add; const yy = y + Math.floor((mm - 1) / 12); const m2 = ((mm - 1) % 12) + 1;
    if (/말/.test(r)) return fmt(yy, m2, lastOf(yy, m2));
    const d = parseInt(r.replace(/^(익익월|익월|당월)/, ""), 10);
    return d ? fmt(yy, m2, Math.min(d, lastOf(yy, m2))) : "";
  }
  const days = parseInt(r, 10); // "30일" = 청구월 말일부터 30일 뒤
  return days ? fmt(y, m, lastOf(y, m) + days) : "";
}
// 🗓 2026-11-27 미수금관리 거래처 카드 안 — 마감일 · 이번 기간 · [마감일 설정] · [마감날짜 변경](월 마감과 같은 창)
function ArCloseBar({ name, company, isViewer }) {
  const [open, setOpen] = React.useState(""); // "" | set | date
  useCloseDaysVersion();
  const r = closeRuleOf(name);
  const k = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  const p = clientPeriod(name, k);
  return (
    <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-1.5 flex-wrap" data-kp="ar-closebar">
      <span className="text-[12.5px] font-bold text-white/60">마감</span>
      <span className="h-7 px-2 rounded-lg bg-white/[0.08] border border-white/15 text-[12.5px] font-black text-white inline-flex items-center" style={{ fontVariantNumeric: "tabular-nums" }}>
        {r?.day ? `매달 ${r.day}일` : "말일"} · {Number(k.slice(5))}월분 {periodText(p)}{p.changed ? " (변경)" : ""}
      </span>
      <button type="button" data-testid="ar-closeday-btn" onClick={() => setOpen("set")} title="매달 며칠에 마감하는지 정해요" className="h-7 px-2.5 rounded-lg bg-white text-[#0F1A30] text-[12.5px] font-black">마감일 설정</button>
      <button type="button" data-testid="ar-closedate-btn" onClick={() => setOpen("date")} title="이번 달만 끝 날짜를 바꿔요 · 다음 달은 그다음 날부터" className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[12.5px] font-black">마감날짜 변경</button>
      <ClientCloseDayModal open={open === "set"} client={name} company={company} isViewer={isViewer} onClose={() => setOpen("")} />
      <ClientCloseDateModal open={open === "date"} client={name} company={company} ym={k} isViewer={isViewer} onClose={() => setOpen("")} />
    </div>
  );
}
function ArClientInfo({ client, name, upsertClient, isViewer }) {
  const c = client || {};
  const [rule, setRule] = React.useState(c.결제일 || "");
  React.useEffect(() => { setRule(c.결제일 || ""); }, [c.결제일]);
  // ✅ 2026-11-23 결제 조건이 바뀔 때만 한 번 묻기 — 취소하면 원래 조건으로 되돌린다
  const save = async (v) => {
    if (isViewer || !client) return;
    if (v === (c.결제일 || "")) { setRule(v); return; }
    setRule(v);
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) { setRule(c.결제일 || ""); return; }
    upsertClient?.({ ...client, 결제일: v });
  };
  const rows = [["사업자번호", c.사업자번호], ["대표자", c.대표자], ["담당자", c.담당자], ["연락처", c.연락처], ["이메일", c.이메일], ["주소", c.주소]];
  return (
    <div className="mb-4 rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
        <div className="min-w-0">
          <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>CLIENT</div>
          <div className="text-[17px] font-black truncate">{name}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold text-white/70">결제 조건</span>
          {["당월 말일", "익월 10일", "익월 말일", "익익월 10일", "30일", "60일"].map((v) => (
            <button key={v} type="button" disabled={isViewer || !client} onClick={() => save(v)} className={`h-8 px-2.5 rounded-lg text-[12px] font-black ${rule === v ? "bg-white text-[#0F1A30]" : "bg-white/10 border border-white/20 text-white"} disabled:opacity-50`}>{v}</button>
          ))}
          <input value={rule} onChange={(e) => setRule(e.target.value)} onBlur={(e) => save(e.target.value.trim())} disabled={isViewer || !client} placeholder="직접 (예: 익월 25일)" className="h-8 w-36 px-2.5 rounded-lg bg-white/10 border border-white/20 text-[12.5px] font-bold text-white placeholder:text-white/40 outline-none" />
        </div>
      </div>
      {client ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-[#EEF1F6]">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-2.5 min-w-0">
              <div className="text-[11px] font-bold text-[#7A89A3]">{k}</div>
              <div className="text-[13.5px] font-black text-[#0F1A30] truncate" title={v || ""}>{v || "-"}</div>
            </div>
          ))}
        </div>
      ) : <div className="px-5 py-3 text-[12.5px] text-[#7A89A3]">기본거래처에 등록되지 않은 거래처입니다 · 거래처관리 › 기본거래처에서 등록하면 정보와 결제 조건이 여기에 보입니다</div>}
    </div>
  );
}

export default function ClientSettlement({ dispatchData, setDispatchData, userCompany = "", clients = [], setClients, upsertClient, showAlert = (m) => alert(m), patchDispatch, cardImage, setCardImage, cardImageUploading, setCardImageUploading, isViewer = false, active = true, copyPanel = false }) {
  // ⭐ 2026-11-03 여러 사업자 — 거래명세서·미수금은 청구 사업자 하나씩(공급자 정보·직인·계좌가 사업자마다 다름)
  const csBiz = useCompanyBiz(getTenant() || userCompany);
  const [csBizSel, setCsBizSel] = React.useState("");
  const csBizCur = csBizSel || csBiz.defaultName;
  const csBizOk = (r) => !csBiz.multi || bizOf(r, csBiz.defaultName) === csBizCur;
  const fareRC = useFareRules(getTenant() || userCompany); // ⭐ 2026-11-02 운임규칙
  const [bankBulkOpen, setBankBulkOpen] = React.useState(false);

  // ★ 오더 상세 팝업
  const [orderPopup, setOrderPopup] = useState(null);
  const [stmtCmpOpen, setStmtCmpOpen] = useState(false); // ⭐ 2026-11-17 업체 명세서 비교
  const [orderPopupEdit, setOrderPopupEdit] = useState({});
  const todayStr8 = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const THIS_YEAR = new Date().getFullYear();
  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => toInt(n).toLocaleString();
  const numberToKorean = (num) => {
    if (!num || num === 0) return "영";
    const units = ["", "만", "억", "조"];
    const nums = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
    const tens = ["", "십", "백", "천"];
    
    let result = "";
    let n = Math.abs(toInt(num));
    let unitIndex = 0;

    while (n > 0) {
      const chunk = n % 10000;
      if (chunk > 0) {
        let chunkStr = "";
        let c = chunk;
        for (let i = 0; i < 4; i++) {
          const digit = c % 10;
          if (digit > 0) {
            // '일'은 십, 백, 천 앞에서는 생략 (일십 → 십)
            const digitStr = (digit === 1 && i > 0) ? "" : nums[digit];
            chunkStr = digitStr + tens[i] + chunkStr;
          }
          c = Math.floor(c / 10);
        }
        result = chunkStr + units[unitIndex] + result;
      }
      n = Math.floor(n / 10000);
      unitIndex++;
    }

    return num < 0 ? "마이너스 " + result : result;
  };
const patchMonthOnDoc = async (id, yyyymm, status, dateStr) => {
  try {
    if (!id || !yyyymm) return;

    const patch = {};
    patch[`정산상태.${yyyymm}`] = status;
    patch[`정산일.${yyyymm}`]   = dateStr || "";

    // 🛠 2026-11-16 orders 먼저, 없으면 dispatch — 없는 문서 읽기가 직원 계정에서 거부(permission-denied)돼도 다음 곳을 본다
    let ref = null; let snap = null;
    for (const col of ["orders", "dispatch"]) {
      try { const sn = await getDoc(doc(db, col, id)); if (sn.exists()) { ref = sn.ref; snap = sn; break; } } catch { /* 다음 컬렉션 */ }
    }

    if (!snap) {
      console.error("patchMonthOnDoc: 문서 없음", id);
      return;
    }

    await updateDoc(ref, patch);
  } catch (e) {
    console.error("patchMonthOnDoc error:", e);
  }
};
  const [tab, setTab] = useState("invoice");

  // ── 거래명세서 상태 ──
  const [searchType, setSearchType] = useState("거래처명");
  const [searchInput, setSearchInput] = useState("");
  const [client, setClient] = useState("");
  // ⭐ 2026-11-17 구분별 명세서 — 한 거래처(예: 녹수)를 담당노선구분(녹수내수 · 보령내수 · 녹수셔틀 …)별로 따로 발행한다. "" = 거래처 전체(기본)
  //  고른 거래처가 바뀌면 저절로 전체로 돌아간다(c가 다르면 "")
  const [stmtSubSel, setStmtSubSel] = useState({ c: "", g: "" });
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [editInfo, setEditInfo] = useState({});
  const [showEdit, setShowEdit] = useState(false);
  const [searched, setSearched] = useState(false);
  // ★ 명세서 포함 오더 선택 목록 내 세부검색 (쉼표로 여러 검색어 입력 시 OR 매칭)
  // ⭐ 명세서 편집 모드 — 미리보기 안에서 줄을 빼고(휴지통) 되돌린다(2026-10-27, 위쪽 "포함할 오더 선택" 카드 대신)
  const [invoiceEdit, setInvoiceEdit] = useState(false);

  // ★ 드롭다운 상태
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownIdx, setDropdownIdx] = useState(0);
  const dropdownRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // ★ 거래처명/기사명 후보 목록 생성
  const dropdownOptions = useMemo(() => {
    const q = (searchInput || "").trim().toLowerCase();
    if (!q) return [];

    if (searchType === "거래처명") {
      const set = new Set();
      (clients || []).forEach(c => c.거래처명 && set.add(c.거래처명));
      (dispatchData || []).forEach(r => r.거래처명 && set.add(r.거래처명));
      const arr = Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));

      const exact = [];
      const startsWith = [];
      const includes = [];
      const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
      const nq = norm(q);
      arr.forEach(name => {
        const nn = norm(name);
        if (nn === nq) exact.push(name);
        else if (nn.startsWith(nq)) startsWith.push(name);
        else if (nn.includes(nq)) includes.push(name);
      });
      return [...exact, ...startsWith, ...includes].slice(0, 15);
    }

    if (searchType === "기사명") {
      const set = new Set();
      (dispatchData || []).forEach(r => {
        const name = (r.이름 || r.기사명 || "").trim();
        if (name) set.add(name);
      });
      const arr = Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
      const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
      const nq = norm(q);
      return arr.filter(name => norm(name).includes(nq)).slice(0, 15);
    }

    return [];
  }, [searchInput, searchType, clients, dispatchData]);

  // ★ 외부 클릭 시 드롭다운 닫기
  React.useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ★ 드롭다운에서 선택
  const selectDropdownItem = (value) => {
    setSearchInput(value);
    setClient(value);
    setSearched(true);
    setDropdownOpen(false);
    setDropdownIdx(0);
  };

  // ★ 키보드 네비게이션
  const handleInputKeyDown = (e) => {
    if (!dropdownOpen || dropdownOptions.length === 0) {
      if (e.key === "Enter") {
        if (!searchInput.trim()) return showAlert("검색어를 입력하세요.");
        setClient(searchInput.trim());
        setSearched(true);
        setDropdownOpen(false);
      }
      if (e.key === "ArrowDown" && dropdownOptions.length > 0) {
        setDropdownOpen(true);
        setDropdownIdx(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownIdx(i => Math.min(i + 1, dropdownOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = dropdownOptions[dropdownIdx];
      if (pick) selectDropdownItem(pick);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    } else if (e.key === "Tab") {
      const pick = dropdownOptions[dropdownIdx];
      if (pick) selectDropdownItem(pick);
    }
  };

  // ★ 드롭다운 스크롤 동기화
  const dropdownItemRefs = React.useRef([]);
  React.useEffect(() => {
    if (!dropdownOpen) return;
    const el = dropdownItemRefs.current[dropdownIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [dropdownIdx, dropdownOpen]);

  const found = useMemo(
    () => (clients || []).find((c) => c.거래처명 === client) || {},
    [client, clients]
  );
  const [cInfo, setCInfo] = useState({});
  useEffect(() => {
    setCInfo({
      거래처명: found.거래처명 || client || "",
      사업자번호: found.사업자번호 || "",
      대표자: found.대표자 || found.사업자명 || "",
      업태: found.업태 || "",
      종목: found.종목 || "",
      주소: found.주소 || "",
      담당자: found.담당자 || "",
      연락처: found.연락처 || "",
    });
  }, [found, client]);

  // ⭐ 2026-11-07 거래명세서 선불·착불 포함 여부 — 회사 기본(arDesk 설정 · 처음엔 빼기) · 명세서마다 따로(단계 기록에 저장)
  //  미수금(미수금관리 · 회계관리 등)은 지금처럼 선불·착불도 넣는다. 명세서 줄 · 합계 · 세액 · 인쇄/PDF · 메일만 이 선택을 따른다
  const desk = useArDesk((localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY).trim());
  const prepaidDefault = desk.config?.stmtIncludePrepaid === true;
  const invYmEarly = searchType === "거래처명" && client && start && end && start.slice(0, 7) === end.slice(0, 7) && start === monthStart(start.slice(0, 7)) && end === monthEnd(start.slice(0, 7)) ? start.slice(0, 7) : "";
  const stmtSub = searchType === "거래처명" && client && stmtSubSel.c === client ? stmtSubSel.g : ""; // ⭐ 2026-11-17 지금 보는 구분("" = 전체)
  const invStmtDocEarly = invYmEarly ? (stmtSub ? desk.subStmts?.get(`${csBizCur}|${client}|${invYmEarly}|${stmtSub}`) : desk.stmts.get(`${csBizCur}|${client}|${invYmEarly}`)) || null : null;
  const [invPrepaidLocal, setInvPrepaidLocal] = useState(null);
  useEffect(() => { setInvPrepaidLocal(null); }, [client, start, end, searchType, stmtSub]);
  const invIncPrepaid = invPrepaidLocal ?? stmtIncludePrepaidOf(invStmtDocEarly, prepaidDefault);

  // ★ 청구운임 0 제외 필터 추가
  const rowsInvoiceBase = useMemo(() => {
    if (!searched) return [];
    let list = Array.isArray(dispatchData) ? dispatchData : [];
    list = list.filter(r => (r.배차상태 || "") === "배차완료");
    // ★ 청구운임이 0이거나 없는 오더 제외
    list = list.filter(r => toInt(r.청구운임) > 0);
    if (searchType === "거래처명" && client) list = list.filter(r => (r.거래처명 || "") === client);
    if (searchType === "기사명" && client) list = list.filter(r => (r.이름 || "").includes(client));
    // 🗓 2026-11-25 달 단위로 조회하면(1일 ~ 말일) 청구월(마감월) 기준 — 상차 10/31 · 마감월 11월 오더는 11월 명세서에(정산 홈 · 월 마감과 같은 달)
    //  날짜를 하루 단위로 고르면 예전처럼 상차일 기준
    const wholeMonths = start && end && start === monthStart(start.slice(0, 7)) && end === monthEnd(end.slice(0, 7));
    if (wholeMonths) list = list.filter(r => { const ym = billYmOf(r); return ym >= start.slice(0, 7) && ym <= end.slice(0, 7); });
    else {
      if (start) list = list.filter(r => (r.상차일 || "") >= start);
      if (end) list = list.filter(r => (r.상차일 || "") <= end);
    }
    list = list.filter(csBizOk); // ⭐ 청구 사업자
    return list.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [dispatchData, client, start, end, searched, searchType, csBizCur, csBiz.multi]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 2026-11-17 구분별 명세서 — 이 거래처 오더의 담당노선구분 목록(2개 이상일 때만 [전체 · 구분…] 줄이 보인다) · 고른 구분이면 그 오더만
  const stmtSubOf = (r) => routeGroupOf(r) || RG_NONE;
  const stmtSubList = useMemo(() => {
    if (searchType !== "거래처명" || !client) return [];
    const m = new Map();
    rowsInvoiceBase.forEach((r) => { const g = stmtSubOf(r); const x = m.get(g) || { g, count: 0, supply: 0 }; x.count += 1; x.supply += toInt(r.청구운임); m.set(g, x); });
    return m.size > 1 ? [...m.values()].sort((a, b) => (a.g === RG_NONE) - (b.g === RG_NONE) || b.count - a.count || a.g.localeCompare(b.g)) : [];
  }, [rowsInvoiceBase, searchType, client]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsInvoiceAll = useMemo(() => (stmtSub ? rowsInvoiceBase.filter((r) => stmtSubOf(r) === stmtSub) : rowsInvoiceBase), [rowsInvoiceBase, stmtSub]); // eslint-disable-line react-hooks/exhaustive-deps
  const stmtTitle = stmtSub ? `${client}(${rgLabel(stmtSub)})` : client; // 파일 이름 · 메일 제목 · 인쇄 제목
  const rowsInvoice = useMemo(() => statementRowsOf(rowsInvoiceAll, invIncPrepaid).rows, [rowsInvoiceAll, invIncPrepaid]);
  const invPrepaidOut = rowsInvoiceAll.length - rowsInvoice.length; // 선불·착불이라 뺀 건수

  // ★ 조회결과 중 명세서에 포함할 오더만 선택 (기본값: 전체 선택)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  // ⭐ 2026-11-07 단계 보드에서 연 명세서는 작성 때 뺀 오더를 기억해 두었다가 다시 뺀다
  const stmtExRef = React.useRef([]);
  useEffect(() => {
    const ex = new Set(stmtExRef.current || []);
    setSelectedInvoiceIds(new Set(rowsInvoice.filter(r => !ex.has(r._id)).map(r => r._id)));
  }, [rowsInvoice]);

  const selectedRowsInvoice = rowsInvoice.filter(r => selectedInvoiceIds.has(r._id));

  const excludedRowsInvoice = rowsInvoice.filter(r => !selectedInvoiceIds.has(r._id));
  const excludeInvoiceRow = (id) => setSelectedInvoiceIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  const restoreInvoiceRow = (id) => setSelectedInvoiceIds(prev => new Set([...prev, id]));

  // ⭐ 2026-11-07 명세서 줄 만들기 — 편집 화면 · 일괄 발송이 같은 함수를 쓴다(예전 계산 그대로)
  const mapInvoiceRows = (list) => list.map((r, i) => {
    const viaLists = [r.경유상차목록, r.경유지_상차, r.경유하차목록, r.경유지_하차];
    return {
      idx: i + 1,
      상차일: r.상차일 || "",
      청구월: billYmOf(r), // 🗓 2026-11-25 월별 소계 = 청구월(마감월) 기준
      상차지: r.상차지명 || r.상차지 || "",
      하차지: r.하차지명 || r.하차지 || "",
      경유지: mergeViaNames(viaLists),
      화물명: mergeViaCargoText(r.화물내용, viaLists),
      기사명: r.이름 || r.기사명 || "",
      차량번호: r.차량번호 || "",
      공급가액: toInt(r.청구운임),
      세액: Math.round(toInt(r.청구운임) * 0.1),
      톤수: r.차량톤수 || "",
      차량종류: r.차량종류 || "",
    };
  });
  const mapped = mapInvoiceRows(selectedRowsInvoice);
  // 🧾 2026-11-16 거래처별 명세서 양식(거래처 전용 → 회사 기본 → 기본형)
  const invForm = useMemo(() => pickForm(desk.forms, client), [desk.forms, client]);
  const [invFormOpen, setInvFormOpen] = useState(false);
  // ⭐ 2026-11-17 명세서 [크게 보기] — 미리보기를 화면 가득 띄운다(폭 맞춤 ↔ 실제 크기) · Esc 로 닫기
  const [docBig, setDocBig] = useState(false);
  const [stmtWrapRef, stmtWrapW] = useBoxWidth(); // ⭐ 2026-11-17 (4차) 편집 표 · 미리보기 자리 폭
  const stmtSide = stmtWrapW >= STMT_SIDE_MIN;
  // ⭐ 2026-11-17 거래처 목록 — 기본은 서랍(버튼으로 열기), [고정]하면 왼쪽 칸(이 브라우저에 기억)
  const [railPin, setRailPin] = useState(() => { try { return localStorage.getItem("kpStmtRailPin") === "1"; } catch { return false; } });
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => { if (!railOpen) return undefined; const k = (e) => { if (e.key === "Escape") setRailOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [railOpen]);
  const setRailPinSave = (v) => { setRailPin(v); try { localStorage.setItem("kpStmtRailPin", v ? "1" : "0"); } catch { /* 무시 */ } };
  const [docBigFit, setDocBigFit] = useState(true);
  useEffect(() => {
    if (!docBig) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setDocBig(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docBig]);

  const 합계공급가 = mapped.reduce((a, b) => a + b.공급가액, 0);
  const 합계세액 = mapped.reduce((a, b) => a + b.세액, 0);

  // ★ 월별 소계 계산
  const monthlySubtotals = useMemo(() => {
    const map = new Map();
    mapped.forEach(m => {
      const ym = m.청구월 || m.상차일.slice(0, 7); // "2025-01" · 🗓 청구월(마감월) 기준
      if (!ym) return;
      if (!map.has(ym)) map.set(ym, { 공급가액: 0, 세액: 0, 건수: 0 });
      const entry = map.get(ym);
      entry.공급가액 += m.공급가액;
      entry.세액 += m.세액;
      entry.건수 += 1;
    });
    return map;
  }, [mapped]);

  // ★ 기간 퀵셀렉트
  const setThisMonth = () => {
    const ym = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
    setStart(`${ym}-01`);
    const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    setEnd(`${ym}-${lastDay}`);
  };
  const setLastMonth = () => {
    // ⭐ 2026-11-07 한국 날짜 · 1일 기준(예전엔 3월 31일에 setMonth가 넘쳐 "지난달"이 3월로 잡혔다)
    const k = new Date(Date.now() + 9 * 3600e3);
    const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - 1, 1));
    const ym = d.toISOString().slice(0, 7);
    setStart(`${ym}-01`);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    setEnd(`${ym}-${lastDay}`);
  };
  const setThisYear = () => {
    setStart(`${THIS_YEAR}-01-01`);
    setEnd(`${THIS_YEAR}-12-31`);
  };

  // ★ 거래명세서/이메일 발신정보에 찍히는 "우리 회사" 정보 — 예전엔 한 회사 정보로 고정돼
  // 있어서 어느 운송사가 로그인해도 항상 그 회사 정보로 인쇄/발송됐다. 로그인한 회사의
  // transportApplications(회사관리에서 등록한 사업자정보) 문서를 실시간으로 읽어와
  // 회사마다 자기 정보로 찍히게 한다.
  const [companyInfoDoc, setCompanyInfoDoc] = React.useState(null);
  React.useEffect(() => {
    const co = (userCompany || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim();
    if (!co) return;
    const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      let found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규" && d.status === "approved");
      if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규");
      if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.status === "approved");
      setCompanyInfoDoc(found || null);
    }, () => {});
    return () => unsub();
  }, [userCompany]);

  // ★ 거래명세서 미리보기에서 도장 아이콘을 바로 클릭해서 즉시 교체할 수 있게 —
  // 회사정보 탭까지 안 가도 여기서 바로 업로드하면 companyInfoDoc의 onSnapshot이
  // 자동으로 반영해서 화면이 바로 갱신된다. 회사정보 탭의 handleSealUpload와 동일한 방식.
  const sealQuickUploadRef = React.useRef(null);
  const [sealQuickUploading, setSealQuickUploading] = React.useState(false);
  // ⭐ 2026-11-02 점검 — 직인 바로 변경은 회사정보와 같은 기준(경리·인사)만 허용
  const canQuickSeal = (() => {
    try {
      const r = localStorage.getItem("role") || "";
      const t = String(window.__kpMeTeam || "");
      return ["test", "hrAcct", "allMgr", "hrManager", "acctStaff", "hrStaff", "totalMaster"].includes(r) || /경리|회계|인사/.test(t);
    } catch { return false; }
  })();
  const handleSealQuickUpload = async (file) => {
    if (!file) return;
    if (!canQuickSeal) { showAlert("직인 등록은 경리팀·인사팀만 할 수 있습니다."); return; }
    if (!companyInfoDoc?.id) { showAlert("회사 정보가 아직 등록되지 않아 도장을 저장할 수 없습니다."); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { showAlert("JPG, PNG, WEBP 이미지만 업로드 가능합니다."); return; }
    if (file.size > 10 * 1024 * 1024) { showAlert("도장 이미지가 너무 큽니다(10MB 초과)."); return; }
    setSealQuickUploading(true);
    try {
      // ⭐ 2026-11-02 점검 — 직인 축소(투명 유지) + 사업자등록증과 합친 크기가 문서 한도(1MiB)를 넘으면 저장하지 않음
      const base64 = await shrinkImageForDoc(file, { max: 600, keepAlpha: true });
      if (base64.length + (companyInfoDoc?.사업자등록증Base64?.length || 0) > COMPANY_DOC_B64_LIMIT) { showAlert("파일이 너무 큽니다. 약 600KB 이하로 줄여 주세요."); return; }
      await updateDoc(doc(db, "transportApplications", companyInfoDoc.id), { 직인이미지: base64 });
    } catch (err) {
      showAlert("도장 업로드 실패: " + (err.message || "알 수 없는 오류"));
    } finally {
      setSealQuickUploading(false);
    }
  };

  const COMPANY_PRINT_BASE = React.useMemo(() => {
    const d = companyInfoDoc || {};
    const co = (userCompany || d.companyName || "").trim();
    const phone = d.phone || d.연락처 || "";
    const fax = d.fax || d.팩스 || d.팩스번호 || "";
    const contactParts = [];
    if (phone) contactParts.push(`TEL ${phone}`);
    if (fax) contactParts.push(`FAX ${fax}`);
    return {
      name: co,
      ceo: d.representative || d.대표자 || d.ceo || "",
      bizNo: d.businessNumber || d.사업자번호 || "",
      type: d.업태 || "운수업",
      item: d.종목 || "화물운송주선",
      addr: d.address || d.주소 || "",
      phone,
      fax,
      contact: contactParts.join(" / "),
      bank: d.계좌은행 ? `${d.계좌은행} ${d.계좌번호 || ""}`.trim() : "",
      email: d.email || "",
      seal: d.직인이미지 || "/seal.png",
    };
  }, [companyInfoDoc, userCompany]);
  // ⭐ 2026-11-03 고른 청구 사업자가 추가 사업자면 공급자 정보(상호·사업자번호·대표·주소·계좌·직인)를 그 사업자로
  const COMPANY_PRINT = React.useMemo(() => { const b = csBiz.multi && csBizSel ? csBiz.find(csBizSel) : null; return b ? printInfoForBiz(COMPANY_PRINT_BASE, b) : COMPANY_PRINT_BASE; }, [COMPANY_PRINT_BASE, csBizSel, csBiz]);

  const buildBatchInvoiceHtml = (item, cp) => {
    // ⭐ 2026-11-03 리디자인 — 화면 미리보기와 같은 남색 단색 문서
    const rows = item.mapped || [];
    const cInfo = item.clientInfo || {};
    const sup = item.totals?.공급가 || 0;
    const tax = item.totals?.세액 || 0;
    const total = sup + tax;
    const n2k = numberToKorean;
    const INK = "#0F1A30", SUB = "#5B6B85", MUTE = "#9AA9C3", LINE = "#E3E8F0", HAIR = "#EEF2F8", SOFT = "#F4F6FA";
    const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
    const receiveFields = [["상호",cInfo.거래처명],["대표자",cInfo.대표자],["사업자번호",cInfo.사업자번호],["주소",cInfo.주소],["업태",cInfo.업태],["종목",cInfo.종목]];
    const supplyFields = [["사업자번호",cp.bizNo],["주소",cp.addr],["업태",cp.type],["종목",cp.item],["연락처",cp.contact]];
    const td = `padding:6px 6px;font-size:11px;color:${INK};border-bottom:1px solid ${HAIR};text-align:center;vertical-align:middle`;
    const tdNum = `${td};text-align:right;font-family:${MONO};white-space:nowrap`;
    // 🧾 2026-11-16 거래처 양식 — 화면 미리보기와 같은 칸 · 순서 · 이름
    const bForm = pickForm(desk.forms, item.name);
    const bCols = visibleCols(bForm);
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const rowsHtml = rows.map((m, i) => `
      <tr>
        <td style="${td};color:${MUTE};font-family:${MONO}">${i+1}</td>
        ${bCols.map((c) => `<td style="${td}${c.mono ? `;font-family:${MONO};white-space:nowrap` : c.small ? ";font-size:10.5px" : ""}">${esc(m[c.k])}</td>`).join("")}
        <td style="${tdNum};font-weight:700">${(m.공급가액||0).toLocaleString()}</td>
        ${bForm.tax ? `<td style="${tdNum};color:${SUB}">${(m.세액||0).toLocaleString()}</td>
        <td style="${tdNum};font-weight:900">${((m.공급가액||0)+(m.세액||0)).toLocaleString()}</td>` : ""}
      </tr>`).join("");
    const infoRow = (k, v, i) => `<tr><td style="padding:5px 10px;width:70px;color:${SUB};font-weight:700;font-size:11px;white-space:nowrap;border-top:${i?`1px solid ${HAIR}`:"none"}">${k}</td><td style="padding:5px 10px 5px 0;color:${INK};font-weight:600;font-size:11.5px;border-top:${i?`1px solid ${HAIR}`:"none"}">${escHtml(v||"-")}</td></tr>`;
    const partyHead = (ko, en) => `<div style="background:${SOFT};padding:7px 10px;border-bottom:1px solid ${LINE};display:flex;justify-content:space-between;align-items:center"><span style="font-size:11.5px;font-weight:900;color:${INK};letter-spacing:0.08em">${ko}</span><span style="font-family:${MONO};font-size:8.5px;font-weight:800;letter-spacing:0.22em;color:${MUTE}">${en}</span></div>`;
    const foot = `background:${SOFT};border-top:2px solid ${INK};border-bottom:1px solid ${LINE};padding:8px 6px`;
    return `<div style="font-family:'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif;background:#fff;width:1100px;box-sizing:border-box;padding:28px;color:${INK}">
      <table style="width:100%;border-collapse:collapse"><tbody><tr>
        <td style="padding:0;vertical-align:bottom">
          <div style="font-family:${MONO};font-size:9px;font-weight:800;letter-spacing:0.3em;color:${MUTE}">TRANSACTION STATEMENT</div>
          <div style="font-size:24px;font-weight:900;letter-spacing:0.3em;margin-top:4px">거래명세서</div>
        </td>
        <td style="padding:0;vertical-align:bottom;text-align:right">
          <div style="font-size:10px;font-weight:700;color:${SUB}">거래기간</div>
          <div style="font-family:${MONO};font-size:13px;font-weight:800;margin-top:2px">${item.start||""} ~ ${item.end||""}</div>${item.sub ? `<div style="font-size:11px;font-weight:800;color:${SUB};margin-top:3px">구분 · ${String(rgLabel(item.sub)).replace(/[<>&]/g, "")}</div>` : ""}
        </td>
      </tr></tbody></table>
      <div style="height:2px;background:${INK};margin:12px 0 14px"></div>
      <table style="width:100%;border-collapse:collapse"><tbody><tr>
        <td style="width:50%;padding:0 7px 0 0;vertical-align:top">
          <div style="border:1px solid ${LINE};border-radius:8px;overflow:hidden">${partyHead("공급받는자","RECIPIENT")}
            <table style="width:100%;border-collapse:collapse"><tbody>${receiveFields.map(([k,v],i)=>infoRow(k,v,i)).join("")}</tbody></table>
          </div>
        </td>
        <td style="width:50%;padding:0 0 0 7px;vertical-align:top">
          <div style="border:1px solid ${LINE};border-radius:8px;overflow:hidden">${partyHead("공급자","SUPPLIER")}
            <table style="width:100%;border-collapse:collapse"><tbody>
              ${infoRow("상호", cp.name, 0)}
              <tr>
                <td style="padding:1px 10px;width:70px;color:${SUB};font-weight:700;font-size:11px;white-space:nowrap;border-top:1px solid ${HAIR}">대표자</td>
                <td style="padding:1px 6px 1px 0;color:${INK};font-weight:600;font-size:11.5px;border-top:1px solid ${HAIR}">
                  <div style="display:flex;align-items:center">
                    <span style="flex:1">${cp.ceo||"-"}</span>
                    <span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px">
                      <img src="${cp.seal}" alt="" onerror="this.style.display='none'" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:42px;height:42px;opacity:0.9;pointer-events:none;mix-blend-mode:multiply" />
                      <span style="position:relative;z-index:1;font-size:11.5px;color:${SUB}">(인)</span>
                    </span>
                  </div>
                </td>
              </tr>
              ${supplyFields.map(([k,v],i)=>infoRow(k,v,i+2)).join("")}
            </tbody></table>
          </div>
        </td>
      </tr></tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;border:1.5px solid ${INK}"><tbody><tr>
        <td style="padding:9px 14px;white-space:nowrap"><span style="font-size:12px;font-weight:900">합계금액</span><span style="font-size:10.5px;color:${SUB};margin-left:6px">(공급가액+부가세)</span></td>
        <td style="padding:9px 14px;text-align:right"><span style="font-size:13px;font-weight:800">일금 ${n2k(total)} 원정</span><span style="font-family:${MONO};font-size:15px;font-weight:900;margin-left:12px;white-space:nowrap">(₩ ${total.toLocaleString()})</span></td>
      </tr></tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <thead>
          <tr>
            ${headerLabels(bForm).map(h=>`<th style="background:${INK};color:#fff;font-size:10.5px;font-weight:800;padding:7px 6px;text-align:center;white-space:nowrap">${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="${1 + bCols.length}" style="${td};${foot};font-weight:900;letter-spacing:0.4em">소 계</td>
            <td style="${tdNum};${foot};font-weight:800">${sup.toLocaleString()}</td>
            ${bForm.tax ? `<td style="${tdNum};${foot};font-weight:800;color:${SUB}">${tax.toLocaleString()}</td>
            <td style="${tdNum};${foot};font-weight:900">${total.toLocaleString()}</td>` : ""}
          </tr>
        </tfoot>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:14px;background:${SOFT}"><tbody><tr>
        <td style="padding:10px 14px;font-size:12px"><span style="font-family:${MONO};font-size:8.5px;font-weight:800;letter-spacing:0.22em;color:${MUTE};margin-right:8px">BANK</span><span style="color:${SUB};font-weight:700">입금계좌</span><span style="font-weight:900;margin-left:8px">${cp.bank||"-"}</span></td>
        <td style="padding:10px 14px;font-size:12px;text-align:right"><span style="color:${SUB};font-weight:700">문의</span><span style="font-weight:800;margin-left:8px">${cp.email||"-"}</span></td>
      </tr></tbody></table>
    </div>`;
  };

  const savePDF = async () => {
    await expandInvoicePreview(); const area = document.getElementById("invoiceArea");
    const canvas = await captureInvoiceFull(() => html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true })); // ⭐ 2026-11-17 줄여 보인 미리보기 말고 원래 크기로 찍기
    const pdf = new (await loadJsPDF())("p", "mm", "a4");
    addCanvasAsMultiPagePdf(pdf, canvas, { format: "PNG" });
    pdf.save(`${stmtTitle || "거래명세서"}.pdf`);
  };

  const downloadInvoiceExcel = async () => {
    if (!searched || !rowsInvoice.length) return showAlert("먼저 조회를 실행하세요.");

    // ★ 화면 그대로 엑셀로 내보내기 (HTML → xls)
    await expandInvoicePreview(); const area = document.getElementById("invoiceArea");
    if (!area) return showAlert("내용이 없습니다.");

    const styles = `
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #333; padding: 6px 8px; font-size: 11pt; text-align: center; }
        th { background: #1B2B4B; color: #fff; font-weight: bold; }
        .text-right { text-align: right; }
      </style>
    `;

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <!--[if gte mso 9]><xml>
          <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
            <x:Name>거래명세서</x:Name>
            <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
          </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
        </xml><![endif]-->
        ${styles}
      </head>
      <body>${area.innerHTML}</body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `거래명세서_${client || "전체"}_${start || "all"}~${end || "all"}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ★ 인쇄 기능
  const handlePrint = async () => {
    await expandInvoicePreview(); const area = document.getElementById("invoiceArea");
    if (!area) return showAlert("인쇄할 내용이 없습니다.");
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>거래명세서 - ${stmtTitle || ""}</title>
      <style>*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{margin:0;padding:20px;font-family:'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#0F1A30;background:#fff;}
      table{border-collapse:collapse;}[data-html2canvas-ignore]{display:none!important;}
      @media print{body{padding:0;}@page{size:A4;margin:10mm;}}</style></head><body>
      ${area.innerHTML}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const saveEdit = async () => {
    const targetName = editInfo.거래처명 || client;
    if (!targetName) return showAlert("거래처명을 입력하세요.");
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    const original = (clients || []).find(c => c.거래처명 === client) || {};
    const merged = { ...original, ...editInfo, 거래처명: targetName };
    if (upsertClient) {
      await upsertClient(merged).catch(e => showAlert("저장 실패: " + e.message));
    }
    showAlert("거래처 정보가 저장되었습니다.");
    setShowEdit(false);
  };

  // ── 미수금관리 상태 ──
  const clientOptions8 = useMemo(() => {
    const set = new Set((clients || []).map(c => c.거래처명).filter(Boolean));
    if (set.size === 0) (dispatchData || []).forEach(r => r.거래처명 && set.add(r.거래처명));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [clients, dispatchData]);

  const [selClient, setSelClient] = useState(AR_ALL); // ⭐ 2026-11-07 미수금 데스크 — 처음부터 전체 거래처
  const [yearFrom,  setYearFrom]  = useState(String(THIS_YEAR));
  const [monthFrom, setMonthFrom] = useState("01");
  const [yearTo,    setYearTo]    = useState(String(THIS_YEAR));
  const [monthTo,   setMonthTo]   = useState("12");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selectedMonths, setSelectedMonths] = useState(new Set());
  const [memoMap, setMemoMap] = useState({});
  const [depositGuideOpen, setDepositGuideOpen] = useState(false);
  // ⭐ 입금 기록(arPayments) — 일부입금 누계를 "거래처|월"별로 더해 둔다(입금 엑셀 자동 매칭이 남긴다)
  const arCompany = (localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY).trim();
  const [arPayments, setArPayments] = useState([]);
  useEffect(() => {
    if (!arCompany) return undefined;
    return onSnapshot(query(collection(db, "arPayments"), where("company", "==", arCompany)), (snap) => setArPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
  }, [arCompany]);
  // 💰 2026-11-08 입금자명 → 거래처 별칭(입금 확인에서 확정하면 서버가 배운다 · bankAliases/{회사}.map)
  const [bankAliasMap, setBankAliasMap] = useState({});
  useEffect(() => {
    if (!arCompany) return undefined;
    return onSnapshot(doc(db, "bankAliases", arCompany), (s) => setBankAliasMap((s.exists() && s.data()?.map) || {}), () => setBankAliasMap({}));
  }, [arCompany]);
  const arPaidMap = useMemo(() => arPaidMapOf(arPayments), [arPayments]); // 🛠 2026-11-27 서버 · 회계관리와 같은 식(입금일 목록 포함)

  // ★ 미수금관리 거래처 드롭다운
  const [arDropOpen, setArDropOpen] = useState(false);
  const [arDropIdx, setArDropIdx] = useState(0);
  const [arInput, setArInput] = useState("");
  const arDropRef = React.useRef(null);
  const arInputRef = React.useRef(null);
  const arItemRefs = React.useRef([]);

  const arOptions = useMemo(() => {
    const q = (arInput || "").trim().toLowerCase();
    if (!q) return [AR_ALL, ...clientOptions8]; // ★ 맨 위 "전체 거래처"
    const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
    const nq = norm(q);
    const exact = [], starts = [], includes = [];
    clientOptions8.forEach(name => {
      const nn = norm(name);
      if (nn === nq) exact.push(name);
      else if (nn.startsWith(nq)) starts.push(name);
      else if (nn.includes(nq)) includes.push(name);
    });
    const all = AR_ALL.includes(q.replace(/\s+/g, " ")) ? [AR_ALL] : [];
    return [...all, ...exact, ...starts, ...includes].slice(0, 15);
  }, [arInput, clientOptions8]);

  React.useEffect(() => {
    const handler = (e) => {
      if (arDropRef.current && !arDropRef.current.contains(e.target)) setArDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  React.useEffect(() => {
    if (!arDropOpen) return;
    const el = arItemRefs.current[arDropIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [arDropIdx, arDropOpen]);

  const selectArClient = (value) => {
    setArInput(value);
    setSelClient(value);
    setArDropOpen(false);
    setArDropIdx(0);
    clearSel();
  };

  const handleArKeyDown = (e) => {
    if (!arDropOpen || arOptions.length === 0) {
      if (e.key === "ArrowDown" && arOptions.length > 0) { setArDropOpen(true); setArDropIdx(0); }
      if (e.key === "Enter" && arInput.trim()) { selectArClient(arInput.trim()); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setArDropIdx(i => Math.min(i + 1, arOptions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setArDropIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const pick = arOptions[arDropIdx]; if (pick) selectArClient(pick); }
    else if (e.key === "Escape") { setArDropOpen(false); }
    else if (e.key === "Tab") { const pick = arOptions[arDropIdx]; if (pick) selectArClient(pick); }
  };

  // 선택 키 = "거래처|월" (전체 거래처로 볼 때 같은 달이 여러 거래처에 있으므로)
  const toggleMonthSelect = (k) => setSelectedMonths(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const toggleAllMonths = (rows) => setSelectedMonths(prev =>
    prev.size === rows.length ? new Set() : new Set(rows.map(r => r.k))
  );
  const clearSel = () => setSelectedMonths(new Set());

  // ⭐ 2026-11-07 같은 계산을 "고른 거래처"와 "전체 거래처(미수금 데스크 목록)" 두 곳에 쓴다 — 식은 예전 그대로
  const buildMonthRows = (selClient) => {
    if (!selClient) return [];
    const list = Array.isArray(dispatchData) ? dispatchData : [];
    const isAll = selClient === AR_ALL;
    const base = list.filter(r => (r.배차상태||"") === "배차완료" && (isAll || (r.거래처명||"") === selClient) && csBizOk(r)); // ⭐ 청구 사업자
    const nowMM = new Date().getMonth() + 1;
    const currentYYYYMM = `${THIS_YEAR}-${String(nowMM).padStart(2,"0")}`;

    // Build full month list from (yearFrom-monthFrom) to (yearTo-monthTo)
    const allMonths = [];
    const yFrom = parseInt(yearFrom, 10);
    const yTo   = parseInt(yearTo,   10);
    for (let y = yFrom; y <= yTo; y++) {
      const mStart = (y === yFrom) ? parseInt(monthFrom, 10) : 1;
      const mEnd   = (y === yTo)   ? parseInt(monthTo,   10) : 12;
      for (let m = mStart; m <= mEnd; m++) {
        allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }

    // ⭐ 전체 거래처 — 거래처마다 오더가 있는 달만 한 줄씩
    // 🗓 2026-11-25 청구월 = 마감월(없으면 상차일 달) — 정산 홈 · 월 마감 · 은행 입금 매칭과 같은 달 · 정산상태는 예전 상차월 키도 같이 본다(isSettledIn)
    const clientsInRange = isAll ? [...new Set(base.filter(r => allMonths.includes(billYmOf(r))).map(r => r.거래처명 || ""))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")) : [selClient];
    return clientsInRange.flatMap(client => allMonths.map(yyyymm => {
      const mm = yyyymm.slice(5);
      const rows = base.filter(r => billYmOf(r) === yyyymm && (!isAll || (r.거래처명||"") === client));
      if (isAll && !rows.length) return null;
      const total = rows.reduce((s, r) => s + toInt(r.청구운임), 0);
      const allDone = rows.length > 0 && rows.every(r => isSettledIn(r, yyyymm));

      let status;
      if (allDone) status = "정산완료";
      else if (yyyymm >= currentYYYYMM) status = "진행중";
      else status = "미정산";

      const dates = rows.map(r => settledDateIn(r, yyyymm)).filter(Boolean).sort();
      const k = `${client}|${yyyymm}`;
      const paid = arPaidMap.get(k) || 0; // 일부입금 누계
      // 🛠 2026-11-27 입금 확인에서 이미 받은 오더(입금상태 입금완료)는 받을 돈에서 뺀다 — 서버 · 은행 매칭(buildArMonths)과 같은 기준
      const due = Math.round(rows.filter((r) => String(r?.입금상태 || "") !== "입금완료").reduce((s, r) => s + toInt(r.청구운임), 0) * 1.1);
      if (status !== "정산완료" && paid > 0) status = "일부입금";
      return { k, yyyymm, mm, year: yyyymm.slice(0,4), 거래처명: client, 건수: rows.length, 총청구금액: total, 정산상태: status, 정산일: dates.at(-1)||"", _rows: rows, 입금누계: paid, 잔액: Math.max(0, due - paid) };
    }).filter(Boolean));
  };
  const monthRowsRaw = useMemo(() => buildMonthRows(selClient), [dispatchData, selClient, yearFrom, monthFrom, yearTo, monthTo, arPaidMap, csBizCur, csBiz.multi]); // eslint-disable-line react-hooks/exhaustive-deps
  const arAllRows = useMemo(() => (selClient === AR_ALL ? monthRowsRaw : buildMonthRows(AR_ALL)), [dispatchData, selClient, monthRowsRaw, yearFrom, monthFrom, yearTo, monthTo, arPaidMap, csBizCur, csBiz.multi]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthRows = useMemo(() => {
    let rows = [...monthRowsRaw];
    // 일부입금도 아직 다 받지 못한 달이므로 "미정산"으로 거를 때 함께 보인다
    if (statusFilter !== "전체") rows = rows.filter(r => r.정산상태 === statusFilter || (statusFilter === "미정산" && r.정산상태 === "일부입금"));
    return rows;
  }, [monthRowsRaw, statusFilter]);
  // ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억(표에 보이는 값 기준)
  const arSort = useTableSort("settlement.monthly");
  const monthRowsSorted = useMemo(() => sortRows(monthRows, arSort.sort, (row, key, i) => {
    const 청구VAT = Math.round((row.총청구금액 || 0) * 1.1);
    const 입금 = row.정산상태 === "정산완료" ? 청구VAT : (row.입금누계 || 0);
    const 잔 = row.정산상태 === "정산완료" ? 0 : Math.max(0, 청구VAT - 입금);
    switch (key) {
      case "순번": return i;
      case "거래처": return row.거래처명;
      case "청구월": return row.yyyymm;
      case "건수": return row.건수;
      case "총 청구금액": return row.총청구금액;
      case "입금액": return 입금;
      case "잔액": return 잔;
      case "결제 예정일":
      case "경과": {
        const rule = ((clients || []).find((c) => c.거래처명 === (row.거래처명 || selClient)) || {}).결제일;
        const due = arDueDate(row.yyyymm, rule);
        if (key === "결제 예정일") return due;
        return due && 잔 > 0 ? Math.floor((Date.now() - new Date(`${due}T23:59:59+09:00`).getTime()) / 86400000) : null;
      }
      case "메모": return memoMap[row.k];
      default: return row[key];
    }
  }), [monthRows, arSort.sort, clients, selClient]); // eslint-disable-line react-hooks/exhaustive-deps -- 메모는 입력 중 줄이 튀지 않게 머리글을 누를 때 기준

  const kpi = useMemo(() => ({
    전체건수: monthRows.reduce((s, r) => s + r.건수, 0),
    총청구: monthRows.reduce((s, r) => s + r.총청구금액, 0),
    미정산월: monthRows.filter(r => r.정산상태 === "미정산" || r.정산상태 === "일부입금").length,
    // 일부입금 달은 받은 만큼(공급가 기준) 빼고 남은 금액만
    미정산금: monthRows.filter(r => r.정산상태 === "미정산" || r.정산상태 === "일부입금")
      .reduce((s, r) => s + (r.정산상태 === "일부입금" ? Math.max(0, r.총청구금액 - Math.round((r.입금누계 || 0) / 1.1)) : r.총청구금액), 0),
    완료금: monthRows.filter(r => r.정산상태 === "정산완료").reduce((s, r) => s + r.총청구금액, 0),
  }), [monthRows]);

  const toggleMonthStatus = async (row) => {
  const next = row.정산상태 === "정산완료" ? "미정산" : "정산완료";
  const dateStr = next === "정산완료" ? todayStr8() : "";

  const _rs = (row._rows || []).filter((r) => r._id);
  await runBulkTask({ count: _rs.length, label: "오더", verb: next === "정산완료" ? "정산완료 처리" : "미정산 처리", task: async (progress) => {
    let k = 0;
    for (const r of _rs) { await patchMonthOnDoc(r._id, row.yyyymm, next, dateStr); progress(++k); }
  } });

  // ★ 로컬 즉시 반영 (안전한 버전)
  setDispatchData(prev => prev.map(d => {
    const isTarget = (row._rows || []).some(r => r._id === d._id);
    if (!isTarget) return d;
    const oldStatus = (typeof d.정산상태 === "object" && d.정산상태) ? d.정산상태 : {};
    const oldDate = (typeof d.정산일 === "object" && d.정산일) ? d.정산일 : {};
    return {
      ...d,
      정산상태: { ...oldStatus, [row.yyyymm]: next },
      정산일: { ...oldDate, [row.yyyymm]: dateStr },
    };
  }));

  showAlert(`${row.yyyymm} 정산 상태를 ‘${next}’(으)로 변경했습니다. (${(row._rows||[]).length}건)`);
};

  const settleSelected = async () => {
  const targets = monthRows.filter(r => selectedMonths.has(r.k));
  if (!targets.length) return showAlert("선택된 월이 없습니다.");

  const allIds = [];
  const patchMap = {}; // id → { yyyymm → status }

  const _total = targets.reduce((n, row) => n + (row._rows || []).filter((r) => r._id).length, 0);
  await runBulkTask({ count: _total, label: "오더", verb: "정산완료 처리", task: async (progress) => {
  for (const row of targets) {
    for (const r of row._rows || []) {
      if (!r._id) continue;
      allIds.push(r._id);
      if (!patchMap[r._id]) patchMap[r._id] = {};
      patchMap[r._id][row.yyyymm] = "정산완료";
      await patchMonthOnDoc(r._id, row.yyyymm, "정산완료", todayStr8());
      progress(allIds.length);
    }
  }
  } });

  // ★ 로컬 즉시 반영
  if (typeof setDispatchData === "function") {
    setDispatchData(prev => prev.map(d => {
      if (!allIds.includes(d._id)) return d;
      const newStatus = { ...(typeof d.정산상태 === "object" ? d.정산상태 : {}) };
      const newDate = { ...(typeof d.정산일 === "object" ? d.정산일 : {}) };
      Object.entries(patchMap[d._id] || {}).forEach(([ym]) => {
        newStatus[ym] = "정산완료";
        newDate[ym] = todayStr8();
      });
      return { ...d, 정산상태: newStatus, 정산일: newDate };
    }));
  }

  showAlert(`선택한 ${targets.length}개월을 정산완료 처리했습니다.`);
  clearSel();
};


  const settleAll = async () => {
  if (!monthRows.length) return showAlert("표시된 월이 없습니다.");
  if (!await kpConfirm(`${monthRows.length}개월 전체 정산완료 처리하시겠습니까?`)) return;

  const allIds = [];
  const patchMap = {};

  const _total = monthRows.reduce((n, row) => n + (row._rows || []).filter((r) => r._id).length, 0);
  await runBulkTask({ count: _total, label: "오더", verb: "정산완료 처리", task: async (progress) => {
  for (const row of monthRows) {
    for (const r of row._rows || []) {
      if (!r._id) continue;
      allIds.push(r._id);
      if (!patchMap[r._id]) patchMap[r._id] = {};
      patchMap[r._id][row.yyyymm] = "정산완료";
      await patchMonthOnDoc(r._id, row.yyyymm, "정산완료", todayStr8());
      progress(allIds.length);
    }
  }
  } });

  // ★ 로컬 즉시 반영
  if (typeof setDispatchData === "function") {
    setDispatchData(prev => prev.map(d => {
      if (!allIds.includes(d._id)) return d;
      const newStatus = { ...(typeof d.정산상태 === "object" ? d.정산상태 : {}) };
      const newDate = { ...(typeof d.정산일 === "object" ? d.정산일 : {}) };
      Object.entries(patchMap[d._id] || {}).forEach(([ym]) => {
        newStatus[ym] = "정산완료";
        newDate[ym] = todayStr8();
      });
      return { ...d, 정산상태: newStatus, 정산일: newDate };
    }));
  }

  showAlert(`전체 ${monthRows.length}개월을 정산완료 처리했습니다.`);
  clearSel();
};

  const downloadMonthExcel = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    if (!selClient) return showAlert("거래처를 선택하세요.");
    const rows = monthRows.map((row, idx) => ({
      순번: idx + 1, 청구월: row.yyyymm, 거래처명: row.거래처명,
      건수: row.건수, 총청구금액: toInt(row.총청구금액),
      정산상태: row.정산상태, 정산일: row.정산일 || "",
      메모: memoMap[row.k] || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "미수금_월집계");
    XLSX.writeFile(wb, `미수금_${selClient === AR_ALL ? "전체거래처" : selClient}_${THIS_YEAR}.xlsx`);
  };

  // ★ 입금 엑셀 업로드 → 자동 매칭 → 정산완료
  const [bankMatchResult, setBankMatchResult] = useState(null);
const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
const [emailBody, setEmailBody] = useState("");
const [editInfoClientDropOpen, setEditInfoClientDropOpen] = useState(false);
const [editInfoClientActiveIdx, setEditInfoClientActiveIdx] = useState(0);
const [generalEmailOpen, setGeneralEmailOpen] = useState(false);
const [generalEmailTo, setGeneralEmailTo] = useState("");
const [generalEmailSubject, setGeneralEmailSubject] = useState("");
const [generalEmailBody, setGeneralEmailBody] = useState("");
const [generalEmailSending, setGeneralEmailSending] = useState(false);
const [generalEmailFiles, setGeneralEmailFiles] = useState([]);
const [generalEmailAddrOpen, setGeneralEmailAddrOpen] = useState(false);
const [generalEmailAddrQuery, setGeneralEmailAddrQuery] = useState("");
const [generalEmailAddrActiveIdx, setGeneralEmailAddrActiveIdx] = useState(0);
// ⭐ 2026-11-06 일반 이메일 — 보내는 사람(이름·이메일)을 직접 입력. 마지막에 쓴 값을 이 기기에 기억한다
const [generalEmailFromName, setGeneralEmailFromName] = useState("");
const [generalEmailFromAddr, setGeneralEmailFromAddr] = useState("");
const genMailFromKey = `kpGenMailFrom:${auth.currentUser?.uid || "me"}`;
const [batchSendList, setBatchSendList] = useState([]); // [{name, email, start, end, mapped, totals, clientInfo}]
const [batchSendOpen, setBatchSendOpen] = useState(false);
const [batchSending, setBatchSending] = useState(false);
const [batchSendProgress, setBatchSendProgress] = useState({ done: 0, total: 0, failed: [] });
const [arEmailOpen, setArEmailOpen] = useState(false);
// ★ 신규: 이메일 발송 월 범위
const [arEmailFromMM, setArEmailFromMM] = useState("01");
const [arEmailToMM, setArEmailToMM]     = useState("12");

const [includeCardInvoice, setIncludeCardInvoice] = useState(true);
const [includeCardGeneral, setIncludeCardGeneral] = useState(true);
const [includeCardAr, setIncludeCardAr] = useState(true);

  const [emailLogs, setEmailLogs] = useState([]);
  const [showEmailHistory, setShowEmailHistory] = useState(false);

  // ★ 이메일 예약발송 — 거래명세서/미수금 발송(공용 상태)과 일반 이메일 발송 각각의
  // "예약발송" 체크박스 + 발송시각. 켜져 있으면 즉시 전송 대신 scheduledEmails에 저장한다.
  const [emailScheduleOn, setEmailScheduleOn] = useState(false);
  const [emailScheduleAt, setEmailScheduleAt] = useState("");
  const [generalEmailScheduleOn, setGeneralEmailScheduleOn] = useState(false);
  const [generalEmailScheduleAt, setGeneralEmailScheduleAt] = useState("");
  const [scheduledEmailListOpen, setScheduledEmailListOpen] = useState(false);
  const [scheduledEmailList, setScheduledEmailList] = useState([]);
  useEffect(() => {
    const co = (userCompany || localStorage.getItem("userCompany") || "").trim();
    if (!co) return;
    const unsub = onSnapshot(collection(db, "scheduledEmails"), (snap) => {
      const rows = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => (r.companyName || "").trim() === co)
        .sort((a, b) => {
          const at = a.sendAt?.toMillis ? a.sendAt.toMillis() : new Date(a.sendAt || 0).getTime();
          const bt = b.sendAt?.toMillis ? b.sendAt.toMillis() : new Date(b.sendAt || 0).getTime();
          return at - bt;
        });
      setScheduledEmailList(rows);
    });
    return () => unsub();
  }, [userCompany]);
// ── 이메일 발송 이력 ──
  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "emailLogs"),
      snap => {
        const arr = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0))
          .slice(0, 200);
        setEmailLogs(arr);
      }
    );
    return () => unsub();
  }, []);

  const logEmail = async ({ type, client, to, subject, body, attachmentNames, status, error, fromName, replyTo, sentFrom }) => {
    const id = crypto.randomUUID();
    await setDoc(doc(db, "emailLogs", id), {
      id, type, client, to, subject,
      body: body || "",
      attachmentNames: attachmentNames || [],
      status,
      error: error || null,
      // ⭐ 2026-11-06 보내는 사람 기록(표시 이름 · 답장 받을 주소 · 실제 발송 계정)
      ...(fromName ? { fromName } : {}), ...(replyTo ? { replyTo } : {}), ...(sentFrom ? { sentFrom } : {}),
      sentAt: Date.now(),
      sentBy: auth.currentUser?.email || "",
    });
  };
  const [sentMailboxOpen, setSentMailboxOpen] = useState(false);
  const [selectedMail, setSelectedMail] = useState(null);
  const [mailTypeFilter, setMailTypeFilter] = useState("전체");
  const [mailFolder, setMailFolder] = useState("sent"); // 📥 2026-11-14 메일함 — sent 보낸메일 · inbox 받은메일 · failed 발송 실패
  const [mailSearch, setMailSearch] = useState("");
  const [mailSort, setMailSort] = useState("newest");
  const [selectedMails, setSelectedMails] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const [deleteLogConfirm, setDeleteLogConfirm] = useState(null); // log.id to delete

  // ── 일괄 정산 모달 상태 ──
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchClients, setBatchClients] = useState(new Set());
  const [batchFromYear, setBatchFromYear] = useState(String(THIS_YEAR));
  const [batchFromMM,   setBatchFromMM]   = useState("01");
  const [batchToYear,   setBatchToYear]   = useState(String(THIS_YEAR));
  const [batchToMM,     setBatchToMM]     = useState("12");
  const [batchClientQ, setBatchClientQ] = useState("");
    const [batchLoading, setBatchLoading] = useState(false);
const [arReportOpen, setArReportOpen] = useState(false);
const [arFromYear, setArFromYear] = useState(String(THIS_YEAR));
const [arFromMM,   setArFromMM]   = useState("01");
const [arToYear,   setArToYear]   = useState(String(THIS_YEAR));
const [arToMM,     setArToMM]     = useState("12");
// ⭐ 거래처정산 — 화면에서 고른 기간만 불러온다(기간조회 / 연월 범위 / 일괄정산 / 미수현황 각각)
// 🗓 2026-11-25 청구월(마감월) 기준 — 앞달 말에 상차하고 이번 달로 마감한(이월) 오더도 보이게 한 달 앞부터 받는다
useLoadOrderRange(start && end ? (monthStartAgo(start.slice(0, 7), 1) || start) : null, end);
useLoadOrderRange(monthStartAgo(`${yearFrom}-${monthFrom}`, 1), monthEnd(`${yearTo}-${monthTo}`));
useLoadOrderRange(monthStartAgo(`${batchFromYear}-${batchFromMM}`, 1), monthEnd(`${batchToYear}-${batchToMM}`), batchModalOpen);
useLoadOrderRange(monthStartAgo(`${arFromYear}-${arFromMM}`, 1), monthEnd(`${arToYear}-${arToMM}`), arReportOpen);
const [arOnlyUnsettled, setArOnlyUnsettled] = useState(false);
// ★ 신규: 거래처 필터
const [arReportMode, setArReportMode] = useState("all"); // "all" | "selected"
const [arReportClients, setArReportClients] = useState(new Set());
const [arReportClientQ, setArReportClientQ] = useState("");

  // ── 일괄정산 모달용 사전 계산 (렌더마다 재계산 방지)
  // 모달이 닫혀 있을 땐 계산할 필요가 없다 — 거래처×기간×전체 오더를 훑는 무거운
  // 계산이라, 이 가드가 없으면 정산관리 화면에 들어오기만 해도(모달을 열지 않아도)
  // 매번 실행되어 거래처정산 탭 진입이 느려지는 원인이었다.
  const batchUnsettledMap = useMemo(() => {
    if (!batchModalOpen) return new Map();
    const map = new Map();
    const nowMM = new Date().getMonth() + 1;
    const currentYYYYMM = `${THIS_YEAR}-${String(nowMM).padStart(2,"0")}`;

    // 일괄정산 모달에서 선택한 기간으로 월 목록 생성
    const allMonths = [];
    const yFrom = parseInt(batchFromYear, 10);
    const yTo   = parseInt(batchToYear, 10);
    for (let y = yFrom; y <= yTo; y++) {
      const mStart = (y === yFrom) ? parseInt(batchFromMM, 10) : 1;
      const mEnd   = (y === yTo)   ? parseInt(batchToMM, 10) : 12;
      for (let m = mStart; m <= mEnd; m++) {
        const ym = `${y}-${String(m).padStart(2, "0")}`;
        // 현재월 미만(과거)만 미수금 계산
        if (ym < currentYYYYMM) {
          allMonths.push(ym);
        }
      }
    }

    clientOptions8.forEach(name => {
      const count = allMonths.filter(ym => {
        const rows2 = (dispatchData||[]).filter(r=>
          (r.배차상태||"")==="배차완료" && (r.거래처명||"")===name &&
          billYmOf(r) === ym // 🗓 청구월(마감월) 기준
        );
        return rows2.length > 0 && !rows2.every(r => isSettledIn(r, ym));
      }).length;
      map.set(name, count);
    });
    return map;
  }, [batchModalOpen, dispatchData, clientOptions8, THIS_YEAR, batchFromYear, batchFromMM, batchToYear, batchToMM]);

  // 미수금 있는 업체만
  const batchEligibleClients = useMemo(() =>
    clientOptions8.filter(name => (batchUnsettledMap.get(name)||0) > 0),
  [clientOptions8, batchUnsettledMap]);
// ── AR 이메일용 HTML 생성 헬퍼 ──
const buildArEmailReportHtml = (filteredRows, clientName, year, from, to, companyInfo) => {
  const rows = filteredRows.map((r, i) => {
    const bg = i % 2 === 0 ? "#fff" : "#f8f9fd";
    const statusStyle = r.정산상태 === "정산완료"
      ? "background:#d1fae5;color:#065f46"
      : "background:#fee2e2;color:#991b1b";
    return `<tr style="background:${bg}">
      <td style="padding:9px 12px;text-align:center;font-size:13px;border-bottom:1px solid #e8ecf5;font-weight:bold">${r.yyyymm}</td>
      <td style="padding:9px 12px;text-align:center;font-size:13px;border-bottom:1px solid #e8ecf5">${r.건수}건</td>
      <td style="padding:9px 12px;text-align:right;font-size:13px;border-bottom:1px solid #e8ecf5;font-weight:bold">${r.총청구금액.toLocaleString()}원</td>
      <td style="padding:9px 12px;text-align:center;border-bottom:1px solid #e8ecf5">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold;${statusStyle}">${r.정산상태}</span>
      </td>
      <td style="padding:9px 12px;text-align:center;font-size:12px;color:#6b7280;border-bottom:1px solid #e8ecf5">${r.정산일 || "-"}</td>
    </tr>`;
  }).join("");

  const totalAmt = filteredRows.reduce((s, r) => s + r.총청구금액, 0);
  const unpaidAmt = filteredRows.filter(r => r.정산상태 === "미정산").reduce((s, r) => s + r.총청구금액, 0);
  const now = new Date().toLocaleString("ko-KR");

  return `<div style="font-family:'Malgun Gothic',sans-serif;background:#f9fafb;padding:24px;min-width:700px">
    <div style="background:#1B2B4B;color:#fff;padding:16px 24px;border-radius:10px 10px 0 0">
      <div style="font-size:18px;font-weight:900">${clientName} 미수금 현황</div>
      <div style="font-size:12px;opacity:.7;margin-top:4px">${year}년 ${from}월 ~ ${to}월</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 10px 10px;overflow:hidden">
      <thead>
        <tr style="background:#e8ecf5">
          <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">월</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">건수</th>
          <th style="padding:10px 12px;text-align:right;font-size:13px;border-bottom:2px solid #c5cee0">청구금액</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">정산상태</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">정산일</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#1B2B4B">
          <td colspan="2" style="padding:11px 12px;text-align:center;color:#fff;font-weight:bold;font-size:13px">합 계</td>
          <td style="padding:11px 12px;text-align:right;color:#fde68a;font-weight:bold;font-size:14px">${totalAmt.toLocaleString()}원</td>
          <td colspan="2" style="padding:11px 12px;text-align:center;color:rgba(255,255,255,.6);font-size:12px">미정산: ${unpaidAmt.toLocaleString()}원</td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:12px;text-align:right;font-size:11px;color:#9ca3af">출력일시: ${now} | ${companyInfo.name}</div>
  </div>`;
};

// ===================== 미수금 보고서 출력 =====================
const handleARReport = async () => {
  // ★ 하단 담당자 표시용 — 출력을 누른 이 계정의 실명/직책을 그때그때 조회한다.
  const printerInfo = await fetchPrinterInfo();
  const printerLabel = [printerInfo?.name || auth.currentUser?.email?.split("@")[0] || "", printerInfo?.position || ""].filter(Boolean).join(" ") || "-";
  const fromIdx = parseInt(arFromMM, 10);
  const toIdx   = parseInt(arToMM,   10);
  const yFrom   = parseInt(arFromYear, 10);
  const yTo     = parseInt(arToYear,   10);
  if (arReportMode === "selected" && arReportClients.size === 0) return showAlert("거래처를 선택하세요.");

  // Build month list across year range
  const months = [];
  for (let y = yFrom; y <= yTo; y++) {
    const mStart = (y === yFrom) ? fromIdx : 1;
    const mEnd   = (y === yTo)   ? toIdx   : 12;
    for (let m = mStart; m <= mEnd; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  const allData = Array.isArray(dispatchData) ? dispatchData : [];

  // 거래처별 월별 집계
  const companyMap = new Map();
  // ★ 기본거래처(clients)에 등록된 업체만 대상
  const basicClientNames = new Set(
    (clients || []).map(c => c.거래처명).filter(Boolean)
  );

  // ★ 특정 거래처 모드일 때 선택된 거래처만 필터
  if (arReportMode === "selected" && arReportClients.size > 0) {
    const filtered = new Set([...basicClientNames].filter(name => arReportClients.has(name)));
    filtered.forEach(name => companyMap.set(name, {}));
  } else {
    basicClientNames.forEach(name => companyMap.set(name, {}));
  }

  const completedData = allData.filter(r => (r.배차상태 || "") === "배차완료");

  // 1단계: 금액/건수 집계 (★ 기본거래처에 없으면 스킵)
  completedData.forEach(r => {
    const name = r.거래처명 || "";
    if (!name) return;
    if (!companyMap.has(name)) return; // ★ 기본거래처 외 업체 제외
    const ym = billYmOf(r); // 🗓 2026-11-25 청구월(마감월) 기준
    if (!months.includes(ym)) return;
    const entry = companyMap.get(name);
    if (!entry[ym]) entry[ym] = { charge: 0, count: 0, status: "미정산" };
    entry[ym].charge += toInt(r.청구운임);
    entry[ym].count  += 1;
  });

  // 2단계: 정산상태 — 해당 월 모든 행이 완료여야 "정산완료"
  for (const [name, mData] of companyMap) {
    for (const ym of months) {
      if (!mData[ym]) continue;
      const monthRows3 = completedData.filter(r =>
        (r.거래처명||"") === name && billYmOf(r) === ym
      );
      mData[ym].status = (monthRows3.length > 0 && monthRows3.every(r => isSettledIn(r, ym)))
        ? "정산완료" : "미정산";
    }
  }

  // 데이터 있는 업체만
const reportRows = Array.from(companyMap.entries())
    .map(([name, mData]) => {
      const totalCharge = months.reduce((s, m) => s + (mData[m]?.charge || 0), 0);
      const totalCount  = months.reduce((s, m) => s + (mData[m]?.count  || 0), 0);
      const unsettled   = months.filter(m => mData[m] && mData[m].status === "미정산" && mData[m].charge > 0);
      return { name, mData, totalCharge, totalCount, unsettled };
    })
    .filter(r => r.totalCount > 0)
    // ★ 미수금 있는 거래처만 필터
    .filter(r => !arOnlyUnsettled || r.unsettled.length > 0)
    .sort((a, b) => b.totalCharge - a.totalCharge);

  const grandTotal   = reportRows.reduce((s, r) => s + r.totalCharge, 0);
  const grandUnsettled = reportRows.reduce((s, r) =>
    s + months.reduce((ss, m) => ss + (r.mData[m]?.status === "미정산" ? r.mData[m].charge : 0), 0), 0);
  const grandSettled = grandTotal - grandUnsettled;

  const now = new Date();
  const printDate = `${now.getFullYear()}. ${String(now.getMonth()+1).padStart(2,"0")}. ${String(now.getDate()).padStart(2,"0")}`;
  const periodLabel = arFromYear === arToYear
    ? `${arFromYear}년 ${fromIdx}월 ~ ${toIdx}월`
    : `${arFromYear}년 ${fromIdx}월 ~ ${arToYear}년 ${toIdx}월`;

  const monthHeaders = months.map(m => `<th>${parseInt(m.slice(5),10)}월</th>`).join("");

  const bodyRows = reportRows.map((r, idx) => {
    const cells = months.map(m => {
      const d = r.mData[m];
 if (!d || d.count === 0) return `<td class="zero">-</td>`;
      const cls = d.status === "정산완료" ? "settled" : "unsettled";
      const badge = d.status === "정산완료"
        ? `<span class="status-badge settled-badge">완료</span>`
        : `<span class="status-badge unsettled-badge">미수</span>`;
      return `<td class="${cls}"><div class="cell-wrap"><span class="amount">${d.charge.toLocaleString()}</span>${badge}<span class="sub">${d.count}건</span></div></td>`;
    }).join("");

    const unsettledAmt = months.reduce((s, m) =>
      s + (r.mData[m]?.status === "미정산" ? r.mData[m].charge : 0), 0);
    const settledAmt = r.totalCharge - unsettledAmt;

    return `<tr class="${idx % 2 === 0 ? "even" : "odd"}">
      <td class="center seq">${idx + 1}</td>
      <td class="name">${escHtml(r.name)}</td>
      <td class="center">${r.totalCount}건</td>
      ${cells}
      <td class="total">${r.totalCharge.toLocaleString()}</td>
      <td class="settled-total">${settledAmt > 0 ? settledAmt.toLocaleString() : "-"}</td>
      <td class="unsettled-total">${unsettledAmt > 0 ? unsettledAmt.toLocaleString() : "-"}</td>
    </tr>`;
  }).join("");

  const totalCells = months.map(m => {
    const total = reportRows.reduce((s, r) => s + (r.mData[m]?.charge || 0), 0);
    const unsett = reportRows.reduce((s, r) =>
      s + (r.mData[m]?.status === "미정산" ? r.mData[m].charge : 0), 0);
if (total === 0) return `<td class="zero">-</td>`;
    const allSettled2 = unsett === 0;
    return `<td class="total-cell">
      <span>${total.toLocaleString()}</span>
      ${allSettled2
        ? `<span style="font-size:8px;color:#86efac;margin-left:3px">✓전완</span>`
        : `<span class="unsettled-sub">(미 ${unsett.toLocaleString()})</span>`
      }
    </td>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>미수금현황_${arFromYear}${arFromMM}~${arToYear}${arToMM}</title>
<style id="orient-style">@page { size: A4 landscape; margin: 6mm 8mm; }</style>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Noto Sans KR',sans-serif; font-size:11px; color:#111827; background:#f9fafb; }

  .toolbar { position:fixed; top:0; left:0; right:0; z-index:9999; background:#1B2B4B; padding:8px 20px;
    display:flex; align-items:center; gap:10px; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
  .toolbar-title { color:#fff; font-size:12px; font-weight:700; margin-right:auto; }
  .tb-btn { padding:6px 16px; border-radius:6px; border:none; cursor:pointer;
    font-size:11px; font-weight:700; font-family:'Noto Sans KR',sans-serif; transition:opacity 0.15s; }
  .tb-btn:hover { opacity:0.85; }
  .tb-btn.orient { background:#fff; color:#1B2B4B; }
  .tb-btn.print  { background:#3b82f6; color:#fff; }
  .tb-btn.img    { background:#7c3aed; color:#fff; }
  .divider { width:1px; height:20px; background:#374151; margin:0 4px; }
  .orient-label { color:#94a3b8; font-size:10px; }

  .page-wrap { padding:24px 24px 20px; max-width:1600px; margin:0 auto; margin-top:48px; }

  .top-header { display:flex; justify-content:space-between; align-items:flex-end;
    padding-bottom:10px; border-bottom:2.5px solid #1B2B4B; margin-bottom:14px; }
  .logo { font-size:24px; font-weight:900; color:#1B2B4B; letter-spacing:-1px; }
  .tagline { font-size:9.5px; color:#9ca3af; margin-top:3px; }
  .contact { text-align:right; font-size:9.5px; color:#6b7280; line-height:1.8; }

  .title-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .doc-title { font-size:22px; font-weight:900; color:#111827; letter-spacing:-0.8px; }
  .doc-meta-box { background:#1B2B4B; border-radius:8px; padding:7px 16px;
    display:flex; gap:20px; align-items:center; }
  .doc-meta-item { display:flex; flex-direction:column; align-items:center; }
  .doc-meta-label { font-size:8.5px; color:#93c5fd; font-weight:700; letter-spacing:0.5px; margin-bottom:2px; }
  .doc-meta-value { font-size:12px; color:#fff; font-weight:700; }
  .doc-meta-divider { width:1px; height:28px; background:#374151; }

  .kpi-row { display:flex; gap:8px; margin-bottom:14px; }
  .kpi-card { flex:1; border:1px solid #e5e7eb; border-radius:10px; padding:10px 14px;
    background:#fff; position:relative; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.05); }
  .kpi-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px;
    background:#1B2B4B; border-radius:10px 10px 0 0; }
  .kpi-card.red::before   { background:#dc2626; }
  .kpi-card.green::before { background:#059669; }
  .kpi-card.amber::before { background:#2D4C82; }
  .kpi-label { font-size:9px; font-weight:700; color:#9ca3af; letter-spacing:0.4px;
    text-transform:uppercase; margin-bottom:5px; }
  .kpi-value { font-size:17px; font-weight:900; color:#111827; line-height:1.1; }
  .kpi-value.red   { color:#dc2626; }
  .kpi-value.green { color:#059669; }
  .kpi-value.amber { color:#2D4C82; }
  .kpi-sub { font-size:8.5px; color:#d1d5db; margin-top:2px; }

  .section-label { font-size:11px; font-weight:700; color:#1B2B4B;
    padding-left:8px; border-left:3px solid #1B2B4B; margin-bottom:7px; }

  table { width:100%; border-collapse:collapse; font-size:10px; table-layout:auto; }
  thead tr { background:#1B2B4B; }
  thead th { color:#fff; padding:6px 5px; font-size:9.5px; font-weight:700;
    text-align:center; white-space:nowrap; border:1px solid #263f61; }
  tbody td { padding:5px 5px; border:1px solid #e5e7eb; color:#111827;
    font-size:10px; text-align:center; vertical-align:middle; }
  tr.even td { background:#fff; }
  tr.odd  td { background:#f8fafc; }
  td.name { text-align:left; font-weight:700; padding-left:8px; white-space:nowrap; }
  td.seq  { color:#9ca3af; font-size:9px; width:28px; }
  td.zero { color:#d1d5db; font-size:9px; }
  td.settled   { background:#f0f4ff !important; }
  td.unsettled { background:#fff8f0 !important; }
  td.settled   .amount { color:#1B2B4B; font-weight:800; }
  td.unsettled .amount { color:#c2410c; font-weight:800; }
  td .sub { font-size:8px; color:#9ca3af; }
  .cell-wrap { display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:nowrap; white-space:nowrap; }
  .status-badge { font-size:7px; font-weight:800; padding:1px 4px; border-radius:3px; white-space:nowrap; flex-shrink:0; }
  .settled-badge   { background:#dbe4ff; color:#1B2B4B; border:1px solid #c0ccf0; }
  .unsettled-badge { background:#fee2d5; color:#9a3412; border:1px solid #fbc4a8; }
  td.total { font-weight:900; color:#1B2B4B; text-align:right; padding-right:6px; background:#f1f5f9 !important; }
  td.settled-total   { font-weight:700; color:#059669; text-align:right; padding-right:6px; }
  td.unsettled-total { font-weight:700; color:#dc2626; text-align:right; padding-right:6px; }

  tr.grand-total td { background:#1B2B4B !important; color:#fff !important;
    font-weight:900; border-top:2px solid #0f1f36; }
  tr.grand-total td.zero { color:#4b6cb7 !important; }
  .total-cell { }
  .total-cell div { font-weight:700; }
  .unsettled-sub { font-size:8.5px; color:#fbbf24; margin-top:1px; }
  tr.grand-total .unsettled-sub { color:#fde68a; }

  .report-footer { margin-top:12px; display:flex; justify-content:space-between; }
  .footer-note { font-size:9px; color:#d1d5db; }
  .footer-right { font-size:9px; color:#9ca3af; text-align:right; line-height:1.8; }

  .legend { display:flex; gap:12px; margin-bottom:8px; align-items:center; }
  .legend-item { display:flex; align-items:center; gap:4px; font-size:9.5px; color:#6b7280; }
  .legend-dot { width:10px; height:10px; border-radius:2px; }

  @media print {
    .toolbar { display:none !important; }
    body { background:#fff; }
    .page-wrap { margin-top:0; padding:0; max-width:100%; }
    table { border:1.5px solid #000 !important; }
    thead th { border:1px solid #000 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tbody td { border:1px solid #ccc !important; }
    td.settled   { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    td.unsettled { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tr.grand-total td { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .kpi-card::before { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .top-header { border-bottom:2px solid #000 !important; }
  }
</style>
</head>
<body>
<div class="toolbar" id="toolbar">
  <span class="toolbar-title">미수금 현황 보고서 · ${periodLabel}</span>
  <span class="orient-label">용지 방향</span>
  <button class="tb-btn orient" id="orientBtn" onclick="toggleOrient()">가로형 (현재)</button>
  <div class="divider"></div>
  <button class="tb-btn print" onclick="window.print()"><EditableText id="misc.btn.48846.인쇄" defaultText="인쇄" /></button>
  <button class="tb-btn img" onclick="saveImage()"><EditableText id="misc.btn.48847.이미지 저장" defaultText="이미지 저장" /></button>
</div>

<div class="page-wrap" id="pageWrap">
  <div class="top-header">
    <div><div class="logo">${COMPANY_PRINT.name}</div><div class="tagline">화물 운송 전문</div></div>
    <div class="contact">${COMPANY_PRINT.contact || "-"}<br>${COMPANY_PRINT.email || ""}<br>${COMPANY_PRINT.addr || ""}</div>
  </div>

  <div class="title-bar">
    <div class="doc-title">미 수 금 &nbsp; 현 황 보 고</div>
    <div class="doc-meta-box">
      <div class="doc-meta-item"><div class="doc-meta-label">대상연도</div><div class="doc-meta-value">${arFromYear === arToYear ? `${arFromYear}년` : `${arFromYear}~${arToYear}년`}</div></div>
      <div class="doc-meta-divider"></div>
      <div class="doc-meta-item"><div class="doc-meta-label">조회기간</div><div class="doc-meta-value">${periodLabel}</div></div>
      <div class="doc-meta-divider"></div>
      <div class="doc-meta-item"><div class="doc-meta-label">거래처수</div><div class="doc-meta-value">${reportRows.length}개사</div></div>
      <div class="doc-meta-divider"></div>
      <div class="doc-meta-item"><div class="doc-meta-label">출력일</div><div class="doc-meta-value">${printDate}</div></div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">조회 거래처</div>
      <div class="kpi-value">${reportRows.length}개사</div>
      <div class="kpi-sub">데이터 있는 거래처</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">총 청구금액</div>
      <div class="kpi-value">${grandTotal.toLocaleString()}원</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">정산완료 금액</div>
      <div class="kpi-value green">${grandSettled.toLocaleString()}원</div>
      <div class="kpi-sub">${grandTotal > 0 ? ((grandSettled/grandTotal)*100).toFixed(1) : 0}%</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">미수금 합계</div>
      <div class="kpi-value red">${grandUnsettled.toLocaleString()}원</div>
      <div class="kpi-sub">${grandTotal > 0 ? ((grandUnsettled/grandTotal)*100).toFixed(1) : 0}%</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-label">미수금 거래처</div>
      <div class="kpi-value amber">${reportRows.filter(r => r.unsettled.length > 0).length}개사</div>
      <div class="kpi-sub">1개월 이상 미정산</div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#ecfdf5;border:1px solid #059669"></div>정산완료</div>
    <div class="legend-item"><div class="legend-dot" style="background:#fffbeb;border:1px solid #d97706"></div>미정산</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f3f4f6;border:1px solid #ccc"></div>해당없음</div>
  </div>

  <div class="section-label">거래처별 월별 미수금 현황</div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">No</th>
        <th style="min-width:90px">거래처</th>
        <th style="width:48px">총건수</th>
        ${monthHeaders}
        <th style="width:80px">총 청구액</th>
        <th style="width:72px">정산완료</th>
        <th style="width:72px">미수금</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="grand-total">
        <td colspan="3" style="text-align:center">합 &nbsp; 계</td>
        ${totalCells}
        <td style="text-align:right;padding-right:6px">${grandTotal.toLocaleString()}</td>
        <td style="text-align:right;padding-right:6px;color:#86efac">${grandSettled.toLocaleString()}</td>
        <td style="text-align:right;padding-right:6px;color:#fca5a5">${grandUnsettled.toLocaleString()}</td>
      </tr>
    </tbody>
  </table>

  <div class="report-footer">
    <div class="footer-note">본 보고서는 LogisWeb 배차관리 시스템에서 자동 생성된 문서입니다.</div>
    <div class="footer-right">출력일시: ${printDate} &nbsp;|&nbsp; 담당자: ${printerLabel}</div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
  let isLandscape = true;
  function toggleOrient() {
    isLandscape = !isLandscape;
    const style = document.getElementById('orient-style');
    const btn   = document.getElementById('orientBtn');
    if (isLandscape) { style.textContent='@page{size:A4 landscape;margin:6mm 8mm;}'; btn.textContent='가로형 (현재)'; }
    else { style.textContent='@page{size:A4 portrait;margin:8mm 10mm;}'; btn.textContent='세로형 (현재)'; }
  }
  function saveImage() {
    const toolbar = document.getElementById('toolbar');
    toolbar.style.display = 'none';
    html2canvas(document.getElementById('pageWrap'), { scale:2, backgroundColor:'#f9fafb', useCORS:true }).then(canvas => {
      toolbar.style.display = 'flex';
      const a = document.createElement('a');
      a.download = '미수금현황_${arFromYear}${arFromMM}~${arToYear}${arToMM}.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
  }
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1400,height=900");
  win.document.write(html);
  win.document.close();
  setArReportOpen(false);
};
  // ── 일괄 정산 처리 ──
const handleBatchSettle = async (targetStatus) => {
    if (!batchClients.size) return showAlert("거래처를 선택하세요.");
    const fromIdx = parseInt(batchFromMM, 10);
    const toIdx   = parseInt(batchToMM,   10);
    const yFrom   = parseInt(batchFromYear, 10);
    const yTo     = parseInt(batchToYear,   10);

    const clientSnapshot = new Set(batchClients);
    setBatchLoading(true);

    const months = [];
    for (let y = yFrom; y <= yTo; y++) {
      const mStart = (y === yFrom) ? fromIdx : 1;
      const mEnd   = (y === yTo)   ? toIdx   : 12;
      for (let m = mStart; m <= mEnd; m++) {
        months.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
    const allData = Array.isArray(dispatchData) ? [...dispatchData] : [];
    const dateStr = targetStatus === "정산완료" ? todayStr8() : "";
    const coll = (typeof COLL !== "undefined" && COLL?.dispatch) ? COLL.dispatch : "dispatch";

    // ★ 핵심: 문서 ID별로 모든 달 업데이트를 먼저 모은 뒤 1번만 씀
    const docPatchMap = new Map(); // id → { "정산상태.2026-01": "정산완료", ... }

    for (const clientName of clientSnapshot) {
      const clientRows = allData.filter(
        r => (r.배차상태 || "") === "배차완료" && (r.거래처명 || "") === clientName
      );
      for (const yyyymm of months) {
        const targetRows2 = clientRows.filter(r =>
          billYmOf(r) === yyyymm // 🗓 2026-11-25 청구월(마감월) 기준 — 정산상태 키도 청구월
        );
        for (const r of targetRows2) {
          if (!r._id) continue;
          if (!docPatchMap.has(r._id)) docPatchMap.set(r._id, {});
          const p = docPatchMap.get(r._id);
          p[`정산상태.${yyyymm}`] = targetStatus;
          p[`정산일.${yyyymm}`]   = dateStr;
        }
      }
    }

   // ★ dispatchData의 __col로 컬렉션 판별 (getDoc 불필요)
    const docColMap = new Map();
    allData.forEach(r => {
      if (r._id && r.__col) docColMap.set(r._id, r.__col);
    });

    // ★ 모든 쓰기를 동시에 실행 (Promise.all)
    const writePromises = Array.from(docPatchMap.entries()).map(([id, patch]) => {
      const coll = docColMap.get(id) || "dispatch";
      return updateDoc(doc(db, coll, id), patch)
        .then(() => true)
        .catch(e => {
          // fallback: 반대 컬렉션 시도
          const fallback = coll === "dispatch" ? "orders" : "dispatch";
          return updateDoc(doc(db, fallback, id), patch)
            .then(() => true)
            .catch(e2 => {
              console.error("일괄정산 오류:", id, e2);
              return false;
            });
        });
    });

    const results = await Promise.all(writePromises);
    const totalDocs = results.filter(Boolean).length;

    // 로컬 반영
    setDispatchData(prev => prev.map(d => {
      if (!clientSnapshot.has(d.거래처명 || "")) return d;
      const oldStatus = (d.정산상태 && typeof d.정산상태 === "object") ? { ...d.정산상태 } : {};
      const oldDate   = (d.정산일   && typeof d.정산일   === "object") ? { ...d.정산일   } : {};
      for (const yyyymm of months) {
        if (billYmOf(d) === yyyymm) {
          oldStatus[yyyymm] = targetStatus;
          oldDate[yyyymm]   = dateStr;
        }
      }
      return { ...d, 정산상태: oldStatus, 정산일: oldDate };
    }));

    setBatchLoading(false);
    showAlert(`${batchClients.size}개 거래처 · ${months.length}개월을 ‘${targetStatus}’(으)로 변경했습니다. (총 ${totalDocs}건)`);
    setBatchModalOpen(false);
    setBatchClients(new Set());
  };
  // ⭐ 2026-11-07 입금 배분 규칙(입금 엑셀 자동 매칭 · 미수금 데스크 "입금 처리" 공용) — 식은 예전 그대로 옮겼다
  //  조회 기간의 미정산 달을 거래처별로 모으고(buildArMonths), 금액이 딱 맞는 달 → 없으면 오래된 달부터 채운다(allocArDeposit)
  //  💰 2026-11-08 식은 functions/arMatchCore.mjs로 옮겼다(서버 팝빌 계좌조회 자동 매칭과 같은 파일) — 결과는 예전과 같다
  const buildArMonths = () => buildArMonthsCore({ orders: dispatchData, paidMap: arPaidMap, inRange: (ym) => ym >= `${yearFrom}-${monthFrom}` && ym <= `${yearTo}-${monthTo}` });
  const allocArDeposit = allocArDepositCore;
  const handleBankExcelUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!json.length) return showAlert("엑셀 데이터가 없습니다.");

      // ★ 입금 내역 파싱 (기업은행 엑셀 형식 대응)
      const deposits = json.map(row => {
        // 다양한 컬럼명 대응
        const rawAmount =
          row["입금액"] || row["입금"] || row["금액"] || row["거래금액"] ||
          row["입금(원)"] || row["입금금액"] || row["credit"] || "";
        const rawName =
          row["적요"] || row["거래처"] || row["입금자명"] || row["보내는분"] ||
          row["이름"] || row["비고"] || row["메모"] || row["상대방"] || "";
        const rawDate =
          row["거래일"] || row["거래일자"] || row["날짜"] || row["일자"] || row["date"] || "";

        const amount = parseInt(String(rawAmount).replace(/[^\d]/g, ""), 10) || 0;
        const name = String(rawName).trim();
        const date = String(rawDate).trim();

        return { amount, name, date, _raw: row };
      }).filter(d => d.amount > 0);

      if (!deposits.length) return showAlert("입금 내역을 찾을 수 없습니다.\n(입금액, 적요/입금자명 컬럼이 필요합니다)");

      // ⭐ 2026-10-27 자동 매칭 — 선택한 거래처와 상관없이 조회 기간의 "모든 거래처" 미정산 월과 맞춰 본다.
      //  ① 입금자명으로 거래처를 찾고 ② 그 거래처의 미정산 달 중 금액이 딱 맞는 달 → 정산완료
      //  ③ 딱 맞는 달이 없으면 오래된 달부터 채움 — 다 채운 달은 정산완료, 모자란 달은 일부입금, 남으면 초과입금
      //  ④ 입금자명이 어느 거래처와도 안 맞으면 금액이 딱 맞는 달이 하나뿐일 때만 "이름 확인" 제안
      //  ⑤ 2026-11-08 "입금 확인"에서 확정할 때 배운 입금자명 별칭(bankAliases)도 먼저 본다 · 식은 functions/arMatchCore.mjs(matchDeposits)
      runBankMatch(deposits);
    };

    reader.readAsArrayBuffer(file);
  };
  // 🏦 2026-11-19 자금관리 › 통장 내역에서 넘어온 입금도 같은 매칭 창으로(엑셀 올리기와 같은 식)
  const runBankMatch = (deposits) => {
    const months = buildArMonths(); // client -> sorted list
    const { matches, unmatched } = matchDeposits({ deposits, months, aliases: bankAliasMap });
    setBankMatchResult({ matches, unmatched, deposits });
  };
  const runBankMatchRef = useRef(runBankMatch);
  runBankMatchRef.current = runBankMatch;

  // ★ 매칭용 정규화

  // ⭐ 매칭 결과 적용 — 다 채운 달은 정산완료, 모자란 달은 입금 기록(일부입금)으로 남긴다
  const applyOneMatch = async (m) => {
    const dateStr = todayStr8();
    const ids = new Map();
    // 🔗 2026-11-25 입금 한 번 = depositKey 하나 → 자금관리 수입 장부 한 줄(서버 arPaymentLedger · 여러 달에 나눠도 합계 한 줄)
    const depositKey = `settle_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const depDate = /^\d{4}-\d{2}-\d{2}/.test(String(m.deposit.date || "")) ? String(m.deposit.date).slice(0, 10) : String(m.deposit.date || "");
    for (const a of m.alloc) {
      await addDoc(collection(db, "arPayments"), {
        company: arCompany, client: m.client, yyyymm: a.yyyymm, amount: a.amount, full: a.full,
        depositName: m.deposit.name || "", depositDate: depDate, at: serverTimestamp(), by: auth.currentUser?.email || "",
        source: m.confidence === "직접 입력" ? "settle" : "excel", depositKey,
      });
      if (!a.full) continue;
      for (const r of a.rows || []) {
        if (!r._id) continue;
        await patchMonthOnDoc(r._id, a.yyyymm, "정산완료", dateStr);
        ids.set(r._id, a.yyyymm);
      }
    }
    if (ids.size && typeof setDispatchData === "function") {
      setDispatchData(prev => prev.map(d => {
        const ym = ids.get(d._id); if (!ym) return d;
        return { ...d,
          정산상태: { ...(typeof d.정산상태 === "object" ? d.정산상태 : {}), [ym]: "정산완료" },
          정산일: { ...(typeof d.정산일 === "object" ? d.정산일 : {}), [ym]: dateStr } };
      }));
    }
  };
  const applyBankMatch = async (m) => {
    await applyOneMatch(m);
    setBankMatchResult(prev => ({ ...prev, matches: prev.matches.filter(x => x !== m) }));
    sflowToast(`${m.client} ${m.deposit.amount.toLocaleString()}원 반영 · ${m.kind}`, "success");
  };
  // 이름까지 맞은 것만 한꺼번에(금액만 맞은 건 사람이 확인)
  const applyAllBankMatches = async () => {
    const list = (bankMatchResult?.matches || []).filter(m => m.confidence === "이름일치" || m.confidence === "별칭");
    await runBulkTask({ count: list.length, label: "입금", verb: "반영", task: async (progress) => { let k = 0; for (const m of list) { await applyOneMatch(m); progress(++k); } } });
    setBankMatchResult(prev => ({ ...prev, matches: prev.matches.filter(m => !list.includes(m)) }));
    sflowToast(`${list.length}건 입금 반영 완료`, "success");
  };

  // ★ 미수금 미정산 월 수 (배지용)
  const unsettledBadge = useMemo(() => {
    if (!selClient) return 0;
    return monthRowsRaw.filter(r => r.정산상태 === "미정산" && r.건수 > 0).length;
  }, [monthRowsRaw, selClient]);

  const filteredMails = useMemo(() => {
    let logs = [...emailLogs];
    if (mailTypeFilter !== "전체") logs = logs.filter(l => l.type === mailTypeFilter);
    if (mailFolder === "failed") logs = logs.filter(l => l.status === "failed");
    if (mailSearch.trim()) {
      const q = mailSearch.toLowerCase();
      logs = logs.filter(l =>
        (l.subject || "").toLowerCase().includes(q) ||
        (l.to || "").toLowerCase().includes(q) ||
        (l.client || "").toLowerCase().includes(q) ||
        (l.body || "").toLowerCase().includes(q)
      );
    }
    logs.sort((a, b) => mailSort === "newest" ? (b.sentAt || 0) - (a.sentAt || 0) : (a.sentAt || 0) - (b.sentAt || 0));
    return logs;
  }, [emailLogs, mailTypeFilter, mailSearch, mailSort, mailFolder]);

  // ══════════ ⭐ 2026-11-07 거래명세서 단계 보드 · 미수금 데스크 ══════════
  //  금액은 위의 식(거래명세서 mapInvoiceRows · 미수금 buildMonthRows · 입금 배분 allocArDeposit)을 그대로 쓴다
  // (desk = 회사 arDesk 구독 — 위 거래명세서 조회에서 이미 만들었다)
  const csPhone = useIsPhone();
  const kstYm = (n = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  const [pipeMonth, setPipeMonth] = useState(() => kstYm(0)); // 🗓 2026-11-16 늘 당월부터
  // ⭐ 2026-11-14 정산 홈 바로가기 — 명세서 일괄 처리(단계 보드) · 입금내역 자동 대사(미수금관리 + 올리기 창)
  useEffect(() => {
    const h = (e) => { const d = e.detail || {}; if (d.tab) setTab(d.tab); if (d.board) setInvView("board"); if (Array.isArray(d.deposits) && d.deposits.length) setTimeout(() => runBankMatchRef.current?.(d.deposits), 250); if (d.bank) setTimeout(() => setBankBulkOpen(true), 200); if (d.client && d.ym) settleOpenRef.current?.(d.client, d.ym); };
    window.addEventListener("kp-settle-open", h); return () => window.removeEventListener("kp-settle-open", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [invView, setInvView] = useState("edit"); // ⭐ 2026-11-09 기본 = 2분할 명세서 편집(왼쪽 거래처 목록) · board(단계 보드)는 버튼으로
  const [manualOpen, setManualOpen] = useState(false); // 직접 조회 팝업
  const [stageAsk, setStageAsk] = useState(null); // { stage, groups }
  const [pendingSend, setPendingSend] = useState(false);
  useLoadOrderRange(monthStartAgo(kstYm(-5) < pipeMonth ? kstYm(-5) : pipeMonth, 1), monthEnd(pipeMonth > kstYm(0) ? pipeMonth : kstYm(0))); // 🗓 이월 오더(앞달 상차)도
  // ⭐ 2026-11-17 sub(담당노선구분)가 있으면 구분별 명세서 — kind "stmtSub" · 문서 이름도 따로(거래처 전체 명세서와 섞이지 않게)
  const stmtKey = (c, ym, sub = "") => (sub ? `${csBizCur}|${c}|${ym}|${sub}` : `${csBizCur}|${c}|${ym}`);
  const stmtDocOf = (c, ym, sub = "") => (sub ? desk.subStmts?.get(stmtKey(c, ym, sub)) : desk.stmts.get(stmtKey(c, ym))) || null;
  const stmtDocId = (c, ym, sub = "") => stmtDocOf(c, ym, sub)?.id || (sub ? arDeskId(arCompany, "stmtSub", csBizCur, c, ym, sub) : arDeskId(arCompany, "stmt", csBizCur, c, ym));
  const stmtBase = (c, ym, sub = "") => ({ kind: sub ? "stmtSub" : "stmt", client: c, yyyymm: ym, biz: csBizCur, ...(sub ? { sub } : {}) });
  const clientOf = (name) => (clients || []).find((c) => c.거래처명 === name) || null;
  const emailOf = (name) => { const c = clientOf(name); return c?.연락처이메일 || c?.이메일 || ""; };
  // 청구할 오더(거래명세서 조회와 같은 조건: 배차완료 · 청구운임 > 0 · 고른 청구 사업자)
  const billRows = useMemo(() => (Array.isArray(dispatchData) ? dispatchData : []).filter(r => (r.배차상태 || "") === "배차완료" && toInt(r.청구운임) > 0 && r.거래처명 && csBizOk(r)), [dispatchData, csBizCur, csBiz.multi]); // eslint-disable-line react-hooks/exhaustive-deps
  // 👤 2026-11-16 기록에는 계정이 아니라 이름으로
  const csMyProfile = useMyProfile(auth.currentUser?.uid);
  const csMyName = () => String(csMyProfile?.name || csMyProfile?.이름 || myNameNow(auth.currentUser?.displayName || auth.currentUser?.email) || "").trim();
  // ✅ 2026-11-16 배차 마감(배차자 1차) — 마감 검증 탭 대신 여기서 거래처마다 보여 준다
  const closeMaps = useMemo(() => new Map(), [dispatchData, desk.closes]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeMapOf = (ym) => {
    if (!closeMaps.has(ym)) closeMaps.set(ym, new Map(closeBoardOf(dispatchData || [], ym, { closeOf: (c, m) => desk.closes?.get(`${c}|${m}`) || null }).map(r => [r.client, r])));
    return closeMaps.get(ym);
  };
  const closeMe = () => ({ email: auth.currentUser?.email || "", name: csMyName() });
  const closeIdOf = (r) => r.doc?.id || arDeskId(arCompany, "close", r.client, r.ym);
  // 경리가 명세서를 만들기 시작하면 배차 마감을 "경리 확인"으로(배차자 월 마감 화면에 보인다)
  const ackClose = (c, ym) => { const r = closeMapOf(ym).get(c); if (!isViewer && r && r.status === "submitted" && !r.changed) desk.save(closeIdOf(r), closeApprovePatch(r, closeMe())).catch(() => {}); };
  const returnClose = async (c, ym) => {
    const r = closeMapOf(ym).get(c); if (!r || isViewer) return;
    const why = await kpPrompt(`${c} ${Number(ym.slice(5))}월 배차마감을 반려할까요?\n반려 사유를 적어 주세요(배차 담당자 화면에 보여요).`, "", { title: "배차마감 반려", placeholder: "예: 11/12 평택 운임 확인 필요", okText: "반려" });
    if (why == null || !String(why).trim()) return;
    await desk.save(closeIdOf(r), closeRejectPatch(r, closeMe(), String(why).trim()));
    sflowToast(`${c} 배차마감 반려`, "success");
  };
  // 🔒 최종마감 일시해제 · 다시 잠금(경리팀)
  const unlockClose = async (c, ym) => {
    const r = closeMapOf(ym).get(c); if (!r || isViewer) return;
    const why = await kpPrompt(`${c} ${Number(ym.slice(5))}월 최종마감을 일시해제할까요?\n배차 담당자가 오더를 고치거나 추가 · 삭제할 수 있게 돼요. 사유를 적어 주세요.`, "", { title: "최종마감 일시해제", placeholder: "예: 11/12 운임 정정", okText: "일시해제" });
    if (why == null) return;
    await desk.save(closeIdOf(r), tempUnlockPatch(r, closeMe(), String(why || "").trim()));
    sflowToast(`${c} 잠금을 잠시 풀었어요. 끝나면 [다시 잠금]을 눌러 주세요`, "success");
  };
  const relockClose = async (c, ym) => {
    const r = closeMapOf(ym).get(c); if (!r || isViewer) return;
    await desk.save(closeIdOf(r), relockPatch(r, closeMe()));
    sflowToast(`${c} 다시 최종마감`, "success");
  };
  const groupsOfMonth = (ym) => {
    const cm = closeMapOf(ym);
    const m = new Map();
    billRows.forEach(r => { if (billYmOf(r) !== ym) return; if (!m.has(r.거래처명)) m.set(r.거래처명, []); m.get(r.거래처명).push(r); }); // 🗓 2026-11-25 청구월(마감월) 기준
    return [...m.entries()].map(([c, rows]) => {
      const d = stmtDocOf(c, ym);
      const ex = new Set(d?.excludedIds || []);
      const pp = statementRowsOf(rows, stmtIncludePrepaidOf(d, prepaidDefault)); // ⭐ 2026-11-07 선불·착불 포함 여부(명세서마다 · 없으면 회사 기본)
      const inc = pp.rows.filter(r => !ex.has(r._id)).sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
      const supply = inc.reduce((a, r) => a + toInt(r.청구운임), 0);
      const vat = inc.reduce((a, r) => a + Math.round(toInt(r.청구운임) * 0.1), 0);
      const hist = d?.history || [];
      const lastAt = hist.length ? Math.max(...hist.map(h => (typeof h.at === "number" ? h.at : h.at?.seconds ? h.at.seconds * 1000 : 0))) : 0;
      // ⭐ 2026-11-17 구분별 명세서 — 이 거래처에 담당노선구분이 몇 개고, 그중 몇 개를 작성했는지(왼쪽 목록에 "구분 1/3")
      const subs = [...new Set(rows.map((r) => routeGroupOf(r) || RG_NONE))];
      const subN = subs.length > 1 ? subs.length : 0;
      const subDone = subN ? subs.filter((g) => stageIdx(stmtDocOf(c, ym, g)?.stage) >= 1).length : 0;
      return { subN, subDone, close: cm.get(c) || null, key: `${c}|${ym}`, client: c, yyyymm: ym, rows: inc, count: inc.length, supply, vat, total: supply + vat, prepaidOut: pp.excluded.length, stage: viewStage(d?.stage), doc: d, lastAt, email: emailOf(c), settled: rows.every(r => isSettledIn(r, ym)), drift: stmtDrift(d, { supply, count: inc.length }) } // ⚠ 2026-11-25 작성 뒤 금액이 바뀌었는지;
    });
  };
  const pipeGroups = useMemo(() => groupsOfMonth(pipeMonth), [billRows, pipeMonth, desk.stmts, desk.subStmts, desk.closes, clients, prepaidDefault]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🔒 2026-11-16 명세서를 이미 작성한 뒤에 배차 1차 마감이 들어오면 바로 최종마감(경리 확인)으로
  useEffect(() => {
    if (isViewer) return;
    pipeGroups.forEach((g) => { if (g.close?.status === "submitted" && !g.close.changed && stageIdx(g.stage) >= 1) ackClose(g.client, g.yyyymm); });
  }, [pipeGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const pipeRecent = useMemo(() => Array.from({ length: 6 }, (_, i) => kstYm(i - 5)).map(ym => ({ ym, open: groupsOfMonth(ym).filter(g => g.stage !== "마감").length })), [billRows, desk.stmts, prepaidDefault]); // eslint-disable-line react-hooks/exhaustive-deps
  const stmtSnap = (g) => ({ count: g.count, supply: g.supply, vat: g.vat });
  const setStmtStage = async (c, ym, stage, { note = "", date = "", extra = null, sub = "" } = {}) => {
    const cur = stmtDocOf(c, ym, sub);
    const at = date && date !== todayStr8() ? new Date(`${date}T12:00:00+09:00`).getTime() : Date.now();
    const history = [...(cur?.history || []), { stage, at, by: auth.currentUser?.email || "", byName: csMyName(), ...(note ? { note } : {}) }].slice(-40);
    await desk.save(stmtDocId(c, ym, sub), { ...stmtBase(c, ym, sub), stage, history, ...(extra || {}) });
    if (stageIdx(stage) >= 1) ackClose(c, ym);
  };
  // 메일을 보낸 뒤 — 한 달짜리 명세서면 "발송"으로(이미 더 간 단계면 그대로)
  const markStmtSent = (c, s0, e0, sub = "") => {
    const ym = String(s0 || "").slice(0, 7);
    if (!c || !ym || ym !== String(e0 || "").slice(0, 7)) return;
    // 🧾 2026-11-16 발송은 순서에서 뺐다 — 단계는 그대로 두고 보낸 날만 기록(미작성이면 작성으로)
    const cur = stmtDocOf(c, ym, sub);
    const hist = [...(cur?.history || []), { stage: "발송", at: Date.now(), by: auth.currentUser?.email || "", byName: csMyName() }].slice(-40);
    desk.save(stmtDocId(c, ym, sub), { ...stmtBase(c, ym, sub), sentAt: Date.now(), history: hist, ...(stageIdx(cur?.stage) === 0 ? { stage: "작성" } : {}) }).catch(() => {});
  };
  const settleOpenRef = useRef(null); // 정산 홈 → 그 거래처 · 그 달 명세서 바로 열기
  useEffect(() => { settleOpenRef.current = (c, ym) => openStmt(c, ym); });
  const openStmt = (c, ym, { send = false, sub = "" } = {}) => {
    const d = stmtDocOf(c, ym, sub);
    stmtExRef.current = d?.excludedIds || [];
    setStmtSubSel({ c: sub ? c : "", g: sub }); // ⭐ 2026-11-17 다른 거래처 · 다른 달을 열면 구분은 전체로
    setSearchType("거래처명"); setSearchInput(c); setClient(c);
    setStart(monthStart(ym)); setEnd(monthEnd(ym)); setSearched(true); setDropdownOpen(false);
    setInvView("edit");
    if (send) setPendingSend(true);
    try { localStorage.setItem(`kp_stmt_last_${arCompany || ""}_${csBizCur || ""}`, c); } catch (e) { /* 저장 안 돼도 괜찮음 */ }
  };
  // 편집 중인 명세서가 한 달 · 한 거래처면 단계 기록 대상
  const stmtYm = searchType === "거래처명" && client && start && end && start.slice(0, 7) === end.slice(0, 7) && start === monthStart(start.slice(0, 7)) && end === monthEnd(start.slice(0, 7)) ? start.slice(0, 7) : "";
  const stmtCur = stmtYm ? stmtDocOf(client, stmtYm, stmtSub) : null;
  const stmtStage = viewStage(stmtCur?.stage);
  const stmtLogs = useMemo(() => (emailLogs || []).filter(l => l.client === client && String(l.type || "").startsWith("거래명세서") && (!stmtYm || String(l.subject || "").includes(stmtYm))
    && (stmtSub ? String(l.subject || "").includes(`${client}(${rgLabel(stmtSub)})`) : !String(l.subject || "").includes(`${client}(`))), [emailLogs, client, stmtYm, stmtSub]); // ⭐ 2026-11-17 구분별 명세서 메일은 그 구분에서만
  // ⭐ 2026-11-17 구분 고르기 — 그 구분 명세서에서 뺀 오더를 다시 뺀다(전체로 돌아가면 전체 명세서 기준)
  const pickStmtSub = (g) => { stmtExRef.current = (stmtYm ? stmtDocOf(client, stmtYm, g)?.excludedIds : null) || []; setStmtSubSel({ c: g ? client : "", g }); };
  const exNow = excludedRowsInvoice.map(r => r._id).sort().join(",");
  const exSaved = [...(stmtCur?.excludedIds || [])].sort().join(",");
  const saveStmtDraft = async () => {
    if (!stmtYm) return;
    const extra = { count: mapped.length, supply: 합계공급가, vat: 합계세액, excludedIds: excludedRowsInvoice.map(r => r._id), includePrepaid: invIncPrepaid };
    if (stageIdx(stmtStage) >= 1) { await desk.save(stmtDocId(client, stmtYm, stmtSub), { ...stmtBase(client, stmtYm, stmtSub), ...extra, checkedAt: Date.now() }); sflowToast("포함 오더를 저장했어요", "success"); return; } // ⚠ checkedAt = 지금 금액으로 다시 확인한 때
    await setStmtStage(client, stmtYm, "작성", { extra, sub: stmtSub });
    sflowToast(`${stmtTitle} ${Number(stmtYm.slice(5))}월 명세서 작성 완료`, "success");
  };
  // 🧾 2026-11-16 빠른 처리 — 미작성 · 작성 → 계산서 발행 → 마감(한 번씩 누르면 다음 단계) · 되돌리기
  const quickStmt = async (stage) => {
    if (!stmtYm || isViewer) return;
    const extra = stageIdx(stmtStage) === 0 ? { count: mapped.length, supply: 합계공급가, vat: 합계세액, excludedIds: excludedRowsInvoice.map(r => r._id), includePrepaid: invIncPrepaid } : null;
    await setStmtStage(client, stmtYm, stage, { extra, sub: stmtSub });
    sflowToast(`${stmtTitle} ${Number(stmtYm.slice(5))}월 ${stageLabel(stage)}`, "success");
  };
  // 🧾 2026-11-27 [계산서 발행 기록] — 바로 단계를 바꾸지 않고 확인창(발행일 · 승인번호)을 띄운다. 국세청 발행은 팝빌 · 홈택스에서
  const askStmtTax = () => {
    if (!stmtYm || isViewer) return;
    const extra = stageIdx(stmtStage) === 0 ? { count: mapped.length, supply: 합계공급가, vat: 합계세액, excludedIds: excludedRowsInvoice.map(r => r._id), includePrepaid: invIncPrepaid } : null;
    setStageAsk({ stage: "계산서발행", groups: [{ client, yyyymm: stmtYm, sub: stmtSub, stage: stmtStage, extra }] });
  };
  const revertStmt = async (stage) => {
    if (!stmtYm || isViewer) return;
    if (!(await kpConfirm(`${stmtTitle} ${Number(stmtYm.slice(5))}월 명세서를 ‘${stageLabel(stage)}’ 단계로 되돌릴까요?`))) return;
    await setStmtStage(client, stmtYm, stage, { note: `${stageLabel(stmtStage)} 취소`, extra: { autoClosed: true }, sub: stmtSub });
    sflowToast(`${stageLabel(stage)} 단계로 되돌렸어요`, "success");
  };
  // ⭐ 2026-11-07 선불·착불 포함 — 이 명세서만(한 달 · 한 거래처면 단계 기록에 저장) / 회사 기본
  const toggleInvPrepaid = (on) => {
    setInvPrepaidLocal(on);
    if (stmtYm && !isViewer) desk.save(stmtDocId(client, stmtYm, stmtSub), { ...stmtBase(client, stmtYm, stmtSub), includePrepaid: on, ...(stmtCur ? {} : { stage: "미작성" }) }).catch(() => {});
  };
  const savePrepaidDefault = (on) => { if (!isViewer) desk.saveConfig({ stmtIncludePrepaid: on }).catch(() => {}); };
  // 거래명세서 메일 창 열기(예전 "명세서 발송" 버튼과 같은 내용)
  const openInvoiceEmail = () => {
    if (!searched || !rowsInvoice.length) return showAlert("먼저 조회를 실행하세요.");
    setEmailTo(emailOf(client));
    setEmailBody(`안녕하세요, ${client} 담당자님.\n\n${COMPANY_PRINT.name}입니다.\n\n${start||""}~${end||""} 기간 거래명세서를 발송드립니다.\n\n총 ${mapped.length}건\n공급가액: ${won(합계공급가)}원\n부가세: ${won(합계세액)}원\n합계: ${won(합계공급가+합계세액)}원\n\n입금계좌: ${COMPANY_PRINT.bank}\n마감문의: ${COMPANY_PRINT.phone || "-"}\n\n확인 부탁드립니다.\n감사합니다.\n\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`);
    setEmailScheduleOn(false); setEmailScheduleAt("");
    setEmailModalOpen(true);
  };
  useEffect(() => {
    if (!pendingSend || invView !== "edit" || !rowsInvoice.length) return;
    setPendingSend(false);
    setTimeout(() => openInvoiceEmail(), 60);
  }, [pendingSend, invView, rowsInvoice.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const onStmtStage = (g, stage) => {
    if (stage === "작성") { setStmtStage(g.client, g.yyyymm, "작성", { extra: { ...stmtSnap(g), excludedIds: g.doc?.excludedIds || [] } }); sflowToast(`${g.client} 작성 완료`, "success"); return; }
    if (stage === "발송") { openStmt(g.client, g.yyyymm, { send: true }); return; }
    setStageAsk({ stage, groups: [g] });
  };
  const onStmtBulk = async (action, groups) => {
    if (action === "작성") {
      const todo = groups.filter(g => g.stage === "미작성");
      await runBulkTask({ count: todo.length, label: "명세서", verb: "작성", unitWord: "곳", task: async (progress) => { let k = 0; for (const g of todo) { await setStmtStage(g.client, g.yyyymm, "작성", { extra: { ...stmtSnap(g), excludedIds: [] } }); progress(++k); } } });
      sflowToast(todo.length ? `${todo.length}곳 작성 완료` : "이미 모두 작성했어요", "success");
      return;
    }
    if (action === "발송") {
      const items = groups.map(g => ({ name: g.client, email: g.email, start: monthStart(g.yyyymm), end: monthEnd(g.yyyymm), mapped: mapInvoiceRows(g.rows), totals: { 공급가: g.supply, 세액: g.vat }, clientInfo: clientOf(g.client) || {} }));
      setBatchSendList(prev => [...prev.filter(x => !items.some(y => y.name === x.name && y.start === x.start)), ...items]);
      setBatchSendOpen(true);
      return;
    }
    setStageAsk({ stage: action, groups });
  };
  // ⭐ 2026-11-09 입금 확인 → 자동 마감: 미수금관리에서 그 달 오더가 모두 "정산완료"(다 채운 입금 · 정산완료 처리)가 되면
  //  작성~계산서 발행 단계의 명세서를 "마감"으로 바꾼다. 일부 입금은 정산완료가 아니라서 마감되지 않는다. 한 번 마감한 곳은 다시 안 건드림
  const autoCloseDone = useRef(new Set());
  useEffect(() => {
    if (isViewer || !arCompany || !desk.stmts?.size || !billRows.length) return;
    const byKey = new Map();
    billRows.forEach(r => { const ym = billYmOf(r); const k = `${r.거래처명}|${ym}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }); // 🗓 청구월(마감월) 기준
    const todo = [];
    desk.stmts.forEach((d) => {
      if ((d.biz || "") !== (csBizCur || "") || !d.client || !d.yyyymm) return;
      const i = stageIdx(d.stage); if (i < 1 || i >= 6) return;
      if (d.autoClosed) return; // 한 번 자동 마감한 명세서는 직접 되돌리면 다시 마감하지 않는다
      const k = `${d.client}|${d.yyyymm}`; if (autoCloseDone.current.has(`${csBizCur}|${k}`)) return;
      const ex = new Set(d.excludedIds || []);
      const rows = (byKey.get(k) || []).filter(r => !ex.has(r._id));
      if (rows.length && rows.every(r => isSettledIn(r, d.yyyymm))) todo.push(d);
    });
    if (!todo.length) return;
    todo.forEach(d => autoCloseDone.current.add(`${csBizCur}|${d.client}|${d.yyyymm}`));
    (async () => {
      for (const d of todo) { try { await setStmtStage(d.client, d.yyyymm, "마감", { note: "입금 확인: 자동 마감", extra: { autoClosed: true } }); } catch (e) { /* 무시 */ } }
      sflowToast(todo.length === 1 ? `${todo[0].client} ${Number(String(todo[0].yyyymm).slice(5))}월 입금을 확인하고 마감했어요` : `입금 확인 ${todo.length}곳 마감했어요`, "success");
    })();
  }, [billRows, desk.stmts, csBizCur, isViewer, arCompany]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveStageAsk = async ({ date, note, taxNo }) => {
    const t = stageAsk; if (!t) return;
    setStageAsk(null);
    const taxExtra = t.stage === "계산서발행" ? { taxIssuedOn: date || todayStr8(), ...(taxNo ? { taxNo } : {}) } : null; // 🧾 2026-11-27 발행일 · 승인번호
    await runBulkTask({ count: t.groups.length, label: "정산", verb: `${stageLabel(t.stage)} 기록`, unitWord: "곳", task: async (progress) => { let k = 0; for (const g of t.groups) { const base = g.extra !== undefined ? g.extra : (stageIdx(g.stage) === 0 ? { ...stmtSnap(g), excludedIds: [] } : null); await setStmtStage(g.client, g.yyyymm, t.stage, { date, note, sub: g.sub || "", extra: taxExtra || base ? { ...(base || {}), ...(taxExtra || {}) } : null }); progress(++k); } } });
    sflowToast(`${t.groups.length > 1 ? `${t.groups.length}곳 ` : ""}${stageLabel(t.stage)} 기록`, "success");
  };
  const pipeNav = useMemo(() => [...pipeGroups].sort((a, b) => stageIdx(a.stage) - stageIdx(b.stage) || b.total - a.total), [pipeGroups]);
  const navIdx = stmtYm === pipeMonth ? pipeNav.findIndex(g => g.client === client) : -1;
  // ⭐ 2026-11-09 들어오면 마지막으로 본 거래처(없으면 목록 맨 위)를 바로 연다 — 항상 2분할
  const stmtLastOf = () => { try { return localStorage.getItem(`kp_stmt_last_${arCompany || ""}_${csBizCur || ""}`) || ""; } catch (e) { return ""; } };
  const pickStmtGroup = (list) => { const last = stmtLastOf(); return list.find(g => g.client === last) || list[0] || null; };
  useEffect(() => {
    if (tab !== "invoice" || invView !== "edit" || searched || manualOpen || !pipeNav.length) return;
    const g = pickStmtGroup(pipeNav);
    if (g) openStmt(g.client, g.yyyymm);
  }, [tab, invView, searched, manualOpen, pipeNav]); // eslint-disable-line react-hooks/exhaustive-deps
  // 왼쪽 목록에서 달을 바꾸면 — 같은 거래처가 그 달에도 있으면 그대로, 없으면 그 달 맨 위 거래처
  const changeStmtMonth = (ym) => {
    setPipeMonth(ym);
    const list = [...groupsOfMonth(ym)].sort((a, b) => stageIdx(a.stage) - stageIdx(b.stage) || b.total - a.total);
    const g = list.find(x => x.client === client) || pickStmtGroup(list);
    if (g) openStmt(g.client, ym);
    else { setStart(monthStart(ym)); setEnd(monthEnd(ym)); }
  };

  // ── 미수금 데스크 ──
  const [arSel, setArSel] = useState("");
  const [arQ, setArQ] = useState("");
  const [arBucket, setArBucket] = useState("");
  const [arStatusF, setArStatusF] = useState("");
  const [arView, setArView] = useState("list"); // list | map | ledger
  const [arSortBy, setArSortBy] = useState({ k: "out", d: -1 });
  const pickArClient = (c) => { setArSel(c); setArInput(c || ""); setSelClient(c || AR_ALL); clearSel(); };
  const arOverDays = (ym, rule) => { const due = arDueDate(ym, rule) || monthEnd(ym); return Math.floor((Date.now() - new Date(`${due}T23:59:59+09:00`).getTime()) / 86400000); };
  const arMonthsInRange = useMemo(() => { const out = []; let y = parseInt(yearFrom, 10), m = parseInt(monthFrom, 10); const yT = parseInt(yearTo, 10), mT = parseInt(monthTo, 10); while (y < yT || (y === yT && m <= mT)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 36) break; } return out; }, [yearFrom, monthFrom, yearTo, monthTo]);
  const arTrendMonths = useMemo(() => arMonthsInRange.filter(m => m < kstYm(0)).slice(-12), [arMonthsInRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const arClientsAll = useMemo(() => {
    const pays = new Map(); arPayments.forEach(p => { if (!pays.has(p.client)) pays.set(p.client, []); pays.get(p.client).push(p); });
    const by = new Map(); arAllRows.forEach(r => { if (!by.has(r.거래처명)) by.set(r.거래처명, []); by.get(r.거래처명).push(r); });
    return [...by.entries()].map(([c, rows]) => {
      const ci = clientOf(c) || {};
      const rule = ci.결제일 || "";
      let out = 0, supplyOut = 0, oldest = "", over = null;
      const aging = {}; const openList = []; const cells = {};
      rows.forEach(r => {
        const 청구VAT = Math.round((r.총청구금액 || 0) * 1.1);
        // 💰 2026-11-27 이번 달(진행중)도 받을 돈 — 예전엔 이번 달에 계산서를 낸 거래처가 목록에 안 나와 이번 달 입금을 넣을 곳이 없었고,
        //  미수금 합계가 경리 HOME · 경영 HOME · 회계(올해 청구 전체 − 받은 돈)보다 작았다
        const open = r.정산상태 === "미정산" || r.정산상태 === "일부입금" || (r.정산상태 === "진행중" && r.잔액 > 0);
        const od = open ? arOverDays(r.yyyymm, rule) : null;
        cells[r.yyyymm] = { st: r.정산상태, amt: open ? r.잔액 : 청구VAT, over: od };
        if (!open) return;
        out += r.잔액; // 표의 "잔액"과 같은 값(VAT 포함 − 입금 누계)
        supplyOut += r.정산상태 === "일부입금" ? Math.max(0, r.총청구금액 - Math.round((r.입금누계 || 0) / 1.1)) : r.총청구금액; // KPI "미정산금"과 같은 식
        if (!oldest || r.yyyymm < oldest) oldest = r.yyyymm;
        if (over == null || od > over) over = od;
        const k = agingKey(od); aging[k] = (aging[k] || 0) + r.잔액;
        openList.push({ k: r.k, yyyymm: r.yyyymm, remain: r.잔액 });
      });
      // 월말 미수 잔액 — 그 달 말까지 청구됐는데 그때까지 정산 안 된 금액(정산일 기준, 아직 안 받은 달은 지금 남은 금액)
      const trend = arTrendMonths.map(m => rows.reduce((a, r) => {
        if (r.yyyymm > m || r.정산상태 === "진행중") return a;
        if (r.정산상태 === "정산완료") return r.정산일 && r.정산일 <= monthEnd(m) ? a : a + Math.round(r.총청구금액 * 1.1);
        return a + r.잔액;
      }, 0));
      const ps = (pays.get(c) || []).map(p => (p.depositDate ? new Date(`${p.depositDate}T12:00:00+09:00`).getTime() : p.at?.seconds ? p.at.seconds * 1000 : 0));
      const settledDays = rows.filter(r => r.정산상태 === "정산완료" && r.정산일).map(r => new Date(`${r.정산일}T12:00:00+09:00`).getTime());
      const lastPay = Math.max(0, ...ps, ...settledDays);
      const note = desk.notes.get(`${csBizCur}|${c}`) || null;
      const autoStatus = over == null || over <= 0 ? "정상" : over <= 30 ? "주의" : over <= 90 ? "연체" : "추심";
      return { client: c, out, supplyOut, oldest, over: over ?? 0, openMonths: openList.length, openList: openList.sort((a, b) => a.yyyymm.localeCompare(b.yyyymm)), aging, cells, trend, lastPay, note, rule,
        status: note?.status || autoStatus, autoStatus, manual: !!note?.status, nextAction: note?.nextAction || "", nextDate: note?.nextDate || "",
        contact: ci.담당자 || "", phone: ci.연락처 || "", email: ci.이메일 || ci.연락처이메일 || "" };
    });
  }, [arAllRows, arPayments, clients, desk.notes, arTrendMonths, csBizCur]); // eslint-disable-line react-hooks/exhaustive-deps
  const arOpenClients = useMemo(() => arClientsAll.filter(r => r.out > 0), [arClientsAll]);
  const arKpi = useMemo(() => {
    const aging = {}; AGING.forEach(a => { aging[a.k] = { amt: 0, n: 0 }; });
    arOpenClients.forEach(r => AGING.forEach(a => { if (r.aging[a.k]) { aging[a.k].amt += r.aging[a.k]; aging[a.k].n += 1; } }));
    const total = arOpenClients.reduce((a, r) => a + r.out, 0);
    let wsum = 0; arOpenClients.forEach(r => r.openList.forEach(m => { wsum += m.remain * Math.max(0, arOverDays(m.yyyymm, r.rule)); }));
    const trend = arTrendMonths.map((_, i) => arClientsAll.reduce((a, r) => a + (r.trend[i] || 0), 0));
    return { total, supplyTotal: arOpenClients.reduce((a, r) => a + r.supplyOut, 0), overdue: total - aging.due.amt, clientCount: arOpenClients.length, avgDays: total ? Math.round(wsum / total) : 0, aging, trend, months: arTrendMonths };
  }, [arOpenClients, arClientsAll, arTrendMonths]); // eslint-disable-line react-hooks/exhaustive-deps
  const arShown = useMemo(() => {
    const nq = arQ.trim().toLowerCase().replace(/\s+/g, "");
    const list = arOpenClients.filter(r => (!arBucket || (r.aging[arBucket] || 0) > 0) && (!arStatusF || r.status === arStatusF) && (!nq || r.client.toLowerCase().replace(/\s+/g, "").includes(nq)));
    const { k, d } = arSortBy;
    const v = (r) => (k === "client" ? r.client : k === "oldest" ? r.oldest : k === "last" ? r.lastPay : k === "over" ? r.over : r.out);
    return [...list].sort((a, b) => { const x = v(a), y = v(b); return (typeof x === "string" ? x.localeCompare(y, "ko") : x - y) * d; });
  }, [arOpenClients, arQ, arBucket, arStatusF, arSortBy]);
  const arStatusCounts = useMemo(() => { const c = {}; arOpenClients.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; }); return c; }, [arOpenClients]);
  const arCur = arSel ? arClientsAll.find(r => r.client === arSel) || { client: arSel, out: 0, openList: [], cells: {}, trend: [], status: "정상", autoStatus: "정상", over: 0, note: desk.notes.get(`${csBizCur}|${arSel}`) || null } : null;
  const arTimeline = useMemo(() => {
    if (!arCur) return [];
    const c = arCur.client; const out = [];
    const ms = (t) => (typeof t === "number" ? t : t?.seconds ? t.seconds * 1000 : t ? new Date(t).getTime() || 0 : 0);
    const day = (t) => { const d = new Date(t + 9 * 3600e3); return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`; };
    arAllRows.filter(r => r.거래처명 === c && r.정산상태 !== "진행중").forEach(r => {
      out.push({ t: new Date(`${monthEnd(r.yyyymm)}T12:00:00+09:00`).getTime(), title: `${Number(r.yyyymm.slice(5))}월 청구`, body: `${r.건수}건 · ${r.정산상태}`, amt: won(Math.round(r.총청구금액 * 1.1)), color: "#C9D3E3" });
      if (r.정산상태 === "정산완료" && r.정산일) out.push({ t: new Date(`${r.정산일}T12:00:00+09:00`).getTime(), title: `${Number(r.yyyymm.slice(5))}월 정산완료`, body: "", amt: null, color: "#2E9466" });
    });
    arPayments.filter(p => p.client === c).forEach(p => out.push({ t: p.depositDate ? new Date(`${p.depositDate}T12:00:00+09:00`).getTime() : ms(p.at), title: p.full ? "입금(완납)" : "일부 입금", body: `${Number(String(p.yyyymm).slice(5))}월분${p.depositName ? ` · ${p.depositName}` : ""}`, amt: `+${won(p.amount)}`, amtColor: "#1E6B4A", color: "#2E9466" }));
    (emailLogs || []).filter(l => l.client === c).forEach(l => out.push({ t: ms(l.sentAt), title: String(l.type || "").startsWith("미수금") ? "독촉 메일" : "명세서 메일", body: `${l.to || ""}${l.status === "failed" ? " · 실패" : ""}`, amt: null, color: l.status === "failed" ? "#C93131" : "#8FB0F0" }));
    [...desk.stmts.values()].filter(d => d.client === c && (d.biz || csBizCur) === csBizCur).forEach(d => (d.history || []).forEach(h => { if (h.stage === "작성") return; out.push({ t: ms(h.at), title: `${Number(String(d.yyyymm).slice(5))}월 명세서 · ${stageLabel(h.stage)}`, body: h.note || "", amt: null, color: "#2D4C82" }); }));
    (arCur.note?.log || []).forEach(l => out.push({ t: ms(l.at), title: l.type === "call" ? "통화" : l.type === "promise" ? "입금 약속" : "메모", body: l.text, amt: null, color: "#D49B1E" }));
    return out.filter(x => x.t).sort((a, b) => b.t - a.t).map(x => ({ ...x, date: day(x.t) }));
  }, [arCur?.client, arAllRows, arPayments, emailLogs, desk.stmts, arCur?.note]); // eslint-disable-line react-hooks/exhaustive-deps
  const arQuickPlan = (amount) => {
    if (!arCur) return null;
    const months = buildArMonths();
    const list = (months.get(arCur.client) || []).filter(e => e.remain > 0);
    const { alloc, exact } = allocArDeposit(list, amount, (e) => e.remain);
    const kind = allocKindOf(alloc, exact);
    return { alloc: alloc.map(a => ({ k: a.e.k, yyyymm: a.e.yyyymm, amount: a.amount, full: a.full, due: a.e.due, rows: a.e.rows })), over: alloc.over || 0, kind };
  };
  const arQuickPay = async (amount, date, name) => {
    if (isViewer) return showAlert("조회전용 권한으로는 입금 처리를 할 수 없습니다.");
    const plan = arQuickPlan(amount); if (!plan?.alloc?.length) return;
    await applyOneMatch({ deposit: { amount, name: name || arCur.client, date: date || todayStr8() }, client: arCur.client, alloc: plan.alloc, over: plan.over, kind: plan.kind, confidence: "직접 입력" });
    sflowToast(`${arCur.client} ${won(amount)}원 반영 · ${plan.kind}`, "success");
  };
  const arSaveNote = async ({ patch, addLog }) => {
    if (!arCur || isViewer) return;
    const cur = arCur.note; const id = cur?.id || arDeskId(arCompany, "client", csBizCur, arCur.client);
    const base = { kind: "client", client: arCur.client, biz: csBizCur };
    if (patch) { await desk.save(id, { ...base, ...patch }); sflowToast("저장했어요", "success"); }
    if (addLog) await desk.save(id, { ...base, log: [...(cur?.log || []), { ...addLog, at: Date.now(), by: auth.currentUser?.email || "" }].slice(-80) });
  };
  // 미수금 메일 창 열기(예전 "이메일발송" 버튼과 같은 내용)
  const openArEmail = () => {
    if (!selClient || selClient === AR_ALL) return showAlert("거래처를 먼저 고르세요.");
    const found = (clients||[]).find(c => c.거래처명 === selClient);
    setEmailTo(found?.이메일 || found?.연락처이메일 || "");
    setArEmailFromMM(monthFrom || "01");
    setArEmailToMM(monthTo || "12");
    const unpaid = monthRows.filter(r => r.정산상태 === "미정산");
    const unpaidAmt = unpaid.reduce((s,r) => s + r.총청구금액, 0);
    setEmailBody(`안녕하세요, ${selClient} 담당자님.\n\n${COMPANY_PRINT.name}입니다.\n\n${THIS_YEAR}년 미수금 현황을 안내드립니다.\n\n미정산 월수: ${unpaid.length}개월\n미정산 금액: ${unpaidAmt.toLocaleString()}원\n\n${unpaid.map(r => `  - ${r.yyyymm} : ${r.총청구금액.toLocaleString()}원`).join("\n")}\n\n입금계좌: ${COMPANY_PRINT.bank}\n\n정산 부탁드립니다.\n감사합니다.\n\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`);
    setEmailScheduleOn(false); setEmailScheduleAt("");
    setArEmailOpen(true);
  };
  const openArReport = () => { setArFromYear(yearFrom); setArFromMM(monthFrom); setArToYear(yearTo); setArToMM(monthTo); setArReportOpen(true); };

  // ⭐ 2026-11-03 거래처정산 리디자인 — 공통 스타일(남색 단색·모노 라벨·정렬된 버튼)
  // ⭐ 2026-11-05 거래처정산 가독성 — 입력·라벨·버튼 글씨를 키우고(입력 15px·라벨 13px·버튼 14px), 조회 버튼은 다른 도구 버튼과 같은 h-10 크기로
  const csInp = "h-10 w-full rounded-lg border border-[#D5DDEA] bg-white px-3 text-[13px] font-semibold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/10";
  const csLab = "block text-[11px] font-black text-[#3A4A66] mb-1.5 tracking-tight";
  const csBtn = "h-10 px-3.5 rounded-lg border border-[#D5DDEA] bg-white text-[12.5px] font-bold text-[#1B2B4B] hover:bg-[#F4F6FA] hover:border-[#B8C4D8] transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white";
  const csBtnPri = "h-10 px-5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black hover:bg-[#1B2B4B] transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0F1A30]";
  const csCard = "bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(15,26,48,0.04)]";
  const csSeg = "inline-flex p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0]";
  const csSegBtn = (on) => `h-8 px-3 rounded-lg text-[12.5px] font-black transition whitespace-nowrap ${on ? "bg-[#0F1A30] text-white shadow-sm" : "text-[#5B6B85] hover:text-[#0F1A30]"}`;
  const csGrid = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px";
  const csHead = (en, title, right) => (
    <div className="flex items-center gap-2 mb-3 min-h-[30px]">
      <div className="min-w-0">
        <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3] leading-none" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
        <div className="text-[13.5px] font-black text-[#0F1A30] mt-1 leading-none">{title}</div>
      </div>
      {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
    </div>
  );
  const csPendingScheduled = scheduledEmailList.filter(s => s.status === "pending").length;
  // 오더 상세 팝업 열기(왼쪽 목록·오른쪽 미리보기 공용)
  const openOrderPopup = (order) => {
    if (!order) return;
    setOrderPopup(order);
    setOrderPopupEdit({
      상차지명: order.상차지명 || "",
      하차지명: order.하차지명 || "",
      화물내용: order.화물내용 || "",
      이름: order.이름 || "",
      차량번호: order.차량번호 || "",
      청구운임: String(order.청구운임 || ""),
      기사운임: String(order.기사운임 || ""),
      상차시간: order.상차시간 || "",
      하차시간: order.하차시간 || "",
      비고: order.비고 || "",
    });
  };
  // 명세서 문서(미리보기 = 인쇄·PDF·엑셀·메일 첨부 원본) — 인쇄 창에서도 같게 보이도록 인라인 스타일만 쓴다
  const DOC = { ink: "#0F1A30", sub: "#5B6B85", mute: "#9AA9C3", line: "#E3E8F0", hair: "#EEF2F8", soft: "#F4F6FA", font: "'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif", mono: KP_MONO };
  const docCellK = (i) => ({ padding: "5px 10px", width: 70, color: DOC.sub, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "middle", borderTop: i ? `1px solid ${DOC.hair}` : "none", textAlign: "left" });
  const docCellV = (i) => ({ padding: "5px 10px 5px 0", color: DOC.ink, fontSize: 11.5, fontWeight: 600, verticalAlign: "middle", borderTop: i ? `1px solid ${DOC.hair}` : "none", wordBreak: "keep-all", textAlign: "left" });
  const docPartyHead = (ko, en) => (
    <div style={{ background: DOC.soft, padding: "7px 10px", borderBottom: `1px solid ${DOC.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11.5, fontWeight: 900, color: DOC.ink, letterSpacing: "0.08em" }}>{ko}</span>
      <span style={{ fontFamily: DOC.mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.22em", color: DOC.mute }}>{en}</span>
    </div>
  );
  const docTh = { background: DOC.ink, color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "7px 6px", textAlign: "center", whiteSpace: "nowrap", border: "none" };
  const docTd = { padding: "6px 6px", fontSize: 11, color: DOC.ink, borderBottom: `1px solid ${DOC.hair}`, textAlign: "center", verticalAlign: "middle", wordBreak: "keep-all" };
  const docNum = { ...docTd, textAlign: "right", fontFamily: DOC.mono, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <>
    {/* ⭐ 2026-11-05 kp-settle — 정산 화면 글씨 크게(index.css: 표 14.5px · 금액 15.5px 굵게 · 작은 글씨 한 단계씩) */}
    <div className="kp-settle min-w-0">
      {/* ⭐ 2026-11-07 머리 — 화면 제목 · 탭은 왼쪽 메뉴 윗줄 왼쪽, 청구 사업자는 오른쪽(왼쪽 메뉴 머리와 높이·왼쪽 끝 정렬) */}
      {/* ⭐ 2026-11-09 다른 탭(용차지급 · 지입정산 · 지게차 지급)에선 숨겨져 있어도 위 줄에 거래명세서 탭이 남던 문제 → 보일 때만 */}
      {active && <SubNavBar side="left" order={0} fallbackClass="mb-3 flex items-center gap-3 flex-wrap rounded-2xl px-4 py-2.5 text-white bg-[#1B2B4B]">
        <div className="leading-tight shrink-0 hidden sm:block">
          <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontVariantNumeric: "tabular-nums" }}>{tab === "invoice" ? "STATEMENT" : tab === "unsettledMonth" ? "RECEIVABLES" : "OUTBOX"}</div>
          <div className="text-[16px] font-black text-white">{tab === "invoice" ? "거래명세서" : tab === "unsettledMonth" ? "미수금관리" : "메일함"}</div>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-white/[0.08] border border-white/15 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[["invoice", "거래명세서", pipeRecent.find(r => r.ym === pipeMonth)?.open || 0], ["unsettledMonth", "미수금관리", arOpenClients.length], ["sentmails", "메일함", 0]].map(([key, label, badge]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`h-8 px-3.5 rounded-lg text-[14px] font-black transition inline-flex items-center gap-1.5 whitespace-nowrap ${tab === key ? "bg-white text-[#0F1A30] shadow-sm" : "text-white/70 hover:text-white"}`}>
              {label}
              {badge > 0 && <span className={`min-w-[20px] h-5 px-1 rounded-md text-[12px] font-black inline-flex items-center justify-center tabular-nums ${tab === key ? "bg-[#0F1A30] text-white" : "bg-white/15 text-white"}`}>{badge > 99 ? "99+" : badge}</span>}
            </button>
          ))}
        </div>
      </SubNavBar>}
      {active && csBiz.multi && (
        <SubNavBar side="right" order={0}>
          <div className="flex items-center gap-2" title={`거래명세서 · 미수금 · 메일이 ${csBizCur} 이름 · 사업자번호 · 계좌 · 직인으로 나가요`}>
            <div className="leading-tight text-right hidden lg:block">
              <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">BILLING</div>
              <div className="text-[13px] font-black text-white/80">청구 사업자</div>
            </div>
            <div className="inline-flex p-1 rounded-xl bg-white/[0.08] border border-white/15">
              {csBiz.names.map((n) => (
                <button key={n} type="button" onClick={() => setCsBizSel(n === csBiz.defaultName ? "" : n)} className={`h-8 px-3 rounded-lg text-[14px] font-black whitespace-nowrap transition ${csBizCur === n ? "bg-white text-[#0F1A30] shadow-sm" : "text-white/70 hover:text-white"}`}>{n}</button>
              ))}
            </div>
          </div>
        </SubNavBar>
      )}

      {/* ══════════════ 거래명세서 탭 ══════════════ */}
      {/* ⭐ 2026-11-07 리디자인 — ① 단계 보드(거래처 × 청구월: 미작성 → 작성 → 발송 → 거래처 확인 → 계산서 요청 → 계산서 발행 → 마감)
           ② 명세서 편집(줄 편집 그리드 + A4 미리보기 나란히 · 한 번에 발송) — 인쇄 · PDF · 엑셀 · 메일 첨부는 예전 #invoiceArea 그대로 */}
      {tab === "invoice" && (
        <>
          {invView === "board" && (
            <StatementBoard month={pipeMonth} setMonth={setPipeMonth} recentMonths={pipeRecent} groups={pipeGroups}
              onOpen={(g) => openStmt(g.client, g.yyyymm)} onAdvance={onStmtStage} onBulk={onStmtBulk} onManual={() => setManualOpen(true)}
              bizLabel={csBiz.multi ? csBizCur : ""}
              tools={<>
                <button type="button" disabled={!batchSendList.length} onClick={() => setBatchSendOpen(true)} className={sdBtn} title="발송 목록">
                  <Ico d={IC.list} size={15} />발송 목록<span className="min-w-[20px] h-5 px-1 rounded-md bg-[#EEF2F8] text-[#0F1A30] text-[12px] font-black inline-flex items-center justify-center tabular-nums">{batchSendList.length}</span>
                </button>
                <button type="button" onClick={() => setScheduledEmailListOpen(true)} className={sdBtn}>
                  <Ico d={IC.clock} size={15} />예약메일{csPendingScheduled > 0 && <span className="min-w-[20px] h-5 px-1 rounded-md bg-[#0F1A30] text-white text-[12px] font-black inline-flex items-center justify-center tabular-nums">{csPendingScheduled}</span>}
                </button>
                <div className="h-10 px-3 rounded-xl border border-[#D5DDEA] bg-white inline-flex items-center" title="새 명세서에 선불·착불 오더를 넣을지 정해요. 명세서마다 따로 바꿀 수 있어요">
                  <PrepaidToggle compact on={prepaidDefault} onChange={savePrepaidDefault} disabled={isViewer} label="선불·착불 포함(기본)" testId="stmt-prepaid-default" />
                </div>
              </>} />
          )}

          {invView === "edit" && (
            <div className={railPin ? "grid grid-cols-1 xl:grid-cols-[272px_minmax(0,1fr)] min-[1800px]:grid-cols-[320px_minmax(0,1fr)] gap-3 items-start" : "grid grid-cols-1 gap-3 items-start"}>
              {/* ⭐ 2026-11-09 항상 2분할 — 왼쪽 거래처 목록(이 달) · 오른쪽 명세서 편집 + 미리보기 */}
              {/* ⭐ 2026-11-17 (3차) 거래처 목록이 자리를 많이 차지해 명세서가 작게 보였다 → 기본은 [거래처 목록] 버튼으로 여는 서랍(왼쪽에서 밀려 나옴)
                   · 서랍 위 [고정]을 누르면 예전처럼 왼쪽 칸에 붙여 둔다(이 브라우저에 기억) */}
              {railPin ? <StatementClientRail month={pipeMonth} setMonth={changeStmtMonth} groups={pipeNav} sel={stmtYm === pipeMonth ? client : ""}
                onSel={(g) => openStmt(g.client, g.yyyymm)} disabled={isViewer}
                onBulkSend={(gs) => onStmtBulk("발송", gs)} /> : railOpen && createPortal(
                <div className="fixed inset-0 z-[9990] flex" data-kp="stmt-rail-drawer">
                  <div className="absolute inset-0 bg-[#0B1324]/35 backdrop-blur-[1px]" data-backdrop-close onClick={() => setRailOpen(false)} />
                  <aside className="relative h-full w-[360px] max-w-[92vw] bg-white shadow-[12px_0_40px_rgba(11,19,36,.25)] flex flex-col kp-drawer-in">
                    <div className="flex items-center gap-2 px-4 h-14 border-b border-[#E3E8F0] shrink-0">
                      <div className="mr-auto"><div className="text-[10.5px] font-bold tracking-[0.18em] text-[#4B6CB7]">CLIENTS</div><div className="text-[16px] font-black text-[#0F1A30] leading-tight">거래처 목록</div></div>
                      <button type="button" onClick={() => { setRailPinSave(true); setRailOpen(false); }} className="h-8 px-2.5 rounded-lg border border-[#D5DDEA] text-[12.5px] font-bold text-[#5B6B85] hover:bg-[#F4F6FA]" title="왼쪽 칸에 붙여 두기">고정</button>
                      <button type="button" onClick={() => setRailOpen(false)} className="w-8 h-8 rounded-lg grid place-items-center text-[#5B6B85] hover:bg-[#F4F6FA]" aria-label="닫기"><Ico d={IC.x} size={16} w={2.4} /></button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <StatementClientRail drawer month={pipeMonth} setMonth={changeStmtMonth} groups={pipeNav} sel={stmtYm === pipeMonth ? client : ""}
                onSel={(g) => { openStmt(g.client, g.yyyymm); setRailOpen(false); }} disabled={isViewer}
                onBulkSend={(gs) => onStmtBulk("발송", gs)} />
                    </div>
                  </aside>
                </div>, document.body)}
            <div className="space-y-3 min-w-0">
              {/* 편집 머리 — 돌아가기 · 거래처 · 기간 · 이전/다음 · 작성 저장 · 발송 */}
              <div className={`${csCard} px-4 py-3 flex items-center gap-3 flex-wrap`}>
                <button type="button" onClick={() => { setInvView("board"); if (stmtYm) setPipeMonth(stmtYm); }} className={sdBtn}><Ico d={IC.back} size={15} w={2.4} />단계 보드</button>
                {railPin ? <button type="button" onClick={() => setRailPinSave(false)} className={sdBtn} title="왼쪽 거래처 목록을 서랍으로 접어 명세서를 넓게 봐요">목록 접기</button>
                  : <button type="button" onClick={() => setRailOpen(true)} className={sdBtnPri} data-kp="stmt-rail-open" title="이 달 거래처 목록을 열어 다른 거래처로 바꿔요">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>거래처 목록<span className="ml-0.5 px-1.5 rounded-md bg-white/15 text-[12px] tabular-nums">{pipeNav.length}</span></button>}
                <div className="min-w-0 mr-auto">
                  <div className="text-[13px] font-bold text-[#5B6B85] tabular-nums">{stmtYm ? `${stmtYm.slice(0, 4)}년 ${Number(stmtYm.slice(5))}월 청구` : searched ? `${start || "처음"} ~ ${end || "끝"}` : "조회 전"}{searchType === "기사명" ? " · 기사명 조회" : ""}</div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[19px] font-black text-[#0F1A30] truncate">{client || "거래처를 고르세요"}</span>
                    {stmtSub && <span className="shrink-0 h-7 px-2.5 rounded-lg bg-[#EEF3FB] text-[#2D4C82] text-[13.5px] font-black inline-flex items-center whitespace-nowrap" data-kp="stmt-sub-badge">{rgLabel(stmtSub)}</span>}
                    {stmtYm && <StageBadge stage={stmtStage} />}
                  </div>
                </div>
                {navIdx >= 0 && pipeNav.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={navIdx <= 0} onClick={() => openStmt(pipeNav[navIdx - 1].client, pipeMonth)} className="w-10 h-10 rounded-xl border border-[#D5DDEA] text-[#1B2B4B] flex items-center justify-center disabled:opacity-30" aria-label="이전 거래처"><Ico d={IC.back} /></button>
                    <span className="text-[13px] font-bold text-[#5B6B85] tabular-nums w-12 text-center">{navIdx + 1}/{pipeNav.length}</span>
                    <button type="button" disabled={navIdx >= pipeNav.length - 1} onClick={() => openStmt(pipeNav[navIdx + 1].client, pipeMonth)} className="w-10 h-10 rounded-xl border border-[#D5DDEA] text-[#1B2B4B] flex items-center justify-center disabled:opacity-30" aria-label="다음 거래처"><Ico d={IC.next} /></button>
                  </div>
                )}
                <button type="button" onClick={() => setManualOpen(true)} className={sdBtn}><Ico d={IC.search} size={15} />다른 조회</button>
                {/* ⭐ 2026-11-17 업체가 먼저 보낸 명세서와 이 명세서(포함한 오더)를 맞춰 본다 */}
                {searched && searchType === "거래처명" && client && <button type="button" onClick={() => setStmtCmpOpen(true)} className={sdBtn} data-kp="stmt-compare-open" title="업체가 보낸 거래명세서(엑셀 · 캡처)를 올려 우리 오더와 맞춰 봐요">업체 명세서 비교</button>}
                {stmtYm && stageIdx(stmtStage) >= 1 && exNow !== exSaved && ( /* 🧾 2026-11-16 미작성일 때 [작성]은 아래 빠른 처리 버튼으로 */
                  <button type="button" disabled={isViewer || !rowsInvoice.length} onClick={saveStmtDraft} className={sdBtn}>포함 오더 저장</button>
                )}
                <button type="button" disabled={!searched || !rowsInvoice.length} onClick={openInvoiceEmail} className={sdBtnPri}><Ico d={IC.send} size={15} />발송</button>
              </div>

              {/* ⭐ 2026-11-17 구분별 명세서 — 이 거래처 오더에 담당노선구분이 2개 이상이면 [전체 · 구분…]을 고른다(기본 = 전체 한 장)
                   구분을 고르면 줄 · 합계 · 미리보기 · 인쇄 · PDF · 엑셀 · 메일 · 단계 기록이 모두 그 구분만 따로 */}
              {stmtSubList.length > 0 && (
                <div className={`${csCard} px-4 py-3`} data-kp="stmt-sub">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-black text-[#5B6B85] mr-1 whitespace-nowrap">구분별 명세서</span>
                    {[{ g: "", count: rowsInvoiceBase.length }, ...stmtSubList].map((x) => {
                      const on = stmtSub === x.g;
                      const st = stmtYm ? viewStage(stmtDocOf(client, stmtYm, x.g)?.stage) : "";
                      return (
                        <button key={x.g || "_all"} type="button" onClick={() => pickStmtSub(x.g)} aria-pressed={on} data-kp="stmt-sub-chip"
                          title={x.g ? `${rgLabel(x.g)} 오더만 따로 명세서를 만들어요` : "이 거래처 오더 전체를 한 장으로"}
                          className={`h-9 px-3 rounded-lg border text-[13px] font-black inline-flex items-center gap-1.5 whitespace-nowrap transition ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#D5DDEA] text-[#1B2B4B] hover:bg-[#F4F6FA]"}`}>
                          {x.g ? rgLabel(x.g) : "전체"}
                          <span className={`tabular-nums font-bold ${on ? "text-white/70" : "text-[#9AA9C3]"}`}>{x.count.toLocaleString()}건</span>
                          {stmtYm && stageIdx(st) >= 1 && <span className={`text-[11.5px] px-1.5 h-5 rounded-md inline-flex items-center ${on ? "bg-white/15 text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{stageLabel(st)}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-[#9AA9C3]">{stmtSub ? `‘${rgLabel(stmtSub)}’ 오더만 따로 명세서를 만들어요. 단계 · 메일 · 인쇄도 이 구분만 따로 기록돼요` : "전체는 이 거래처 오더를 한 장으로 청구해요. 구분을 누르면 그 구분만 따로 발행할 수 있어요"}</div>
                </div>
              )}

              {/* 단계 — 한 달 · 한 거래처로 연 명세서만 */}
              {stmtYm ? (
                <div className={`${csCard} px-4 py-3`}>
                  {closeMapOf(stmtYm).get(client) && <div className="pb-2.5 mb-2.5 border-b border-[#EEF2F8]"><CloseStrip close={closeMapOf(stmtYm).get(client)} disabled={isViewer} onReturn={() => returnClose(client, stmtYm)} onUnlock={() => unlockClose(client, stmtYm)} onRelock={() => relockClose(client, stmtYm)} /></div>}
                  <StageStepper stage={stmtStage} history={stmtCur?.history || []} disabled={isViewer}
                    sentHint={stmtLogs[0]?.sentAt ? `${new Date(stmtLogs[0].sentAt + 9 * 3600e3).getUTCMonth() + 1}/${new Date(stmtLogs[0].sentAt + 9 * 3600e3).getUTCDate()}` : ""}
                    onSet={(k) => {
                      const g = { client, yyyymm: stmtYm, sub: stmtSub, stage: stmtStage, count: mapped.length, supply: 합계공급가, vat: 합계세액, doc: stmtCur };
                      if (k === "작성" && stageIdx(stmtStage) === 0) { saveStmtDraft(); return; }
                      if (stageIdx(k) < stageIdx(stmtStage)) { revertStmt(k); return; } // 계산서 발행 · 마감 → 되돌리기
                      setStageAsk({ stage: k, groups: [g] });
                    }} />
                  {(() => { // ⚠ 2026-11-25 명세서 작성 뒤 금액이 바뀌었는지(저장은 막지 않음) — 정산 홈 · 청구 현황판 · 명세서 목록에도 같은 배지
                    const dr = stmtDrift(stmtCur, { supply: 합계공급가, count: mapped.length });
                    if (!dr) return null;
                    return (
                      <div data-kp="stmt-drift-banner" className="mt-2.5 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-[220px]">
                          <div className="text-[14px] font-black text-[#B42318]" style={{ fontVariantNumeric: "tabular-nums" }}>⚠ {stmtDriftText(dr)}</div>
                          <div className="text-[12.5px] font-bold text-[#7A2E22] mt-0.5">{stmtDriftHint(dr)}</div>
                        </div>
                        {!isViewer && <button type="button" onClick={saveStmtDraft} className={`${sdBtnPri} !h-9`} data-kp="stmt-drift-resave">지금 금액으로 다시 저장</button>}
                      </div>);
                  })()}
                </div>
              ) : searched ? (
                <div className="rounded-2xl border border-dashed border-[#C9D3E3] bg-white px-4 py-3 text-[14px] text-[#5B6B85]">거래처 한 곳 · 한 달(1일~말일)로 열면 발송 · 확인 · 계산서 · 마감 단계를 기록할 수 있어요</div>
              ) : null}

              <div ref={stmtWrapRef} data-kp="stmt-split" data-side={stmtSide ? "1" : "0"} className={stmtSide ? "grid grid-cols-[minmax(0,46fr)_minmax(0,54fr)] gap-3 items-start" : "grid grid-cols-1 gap-3 items-start"}>{/* ⭐ 2026-11-17 (4차) 나란히/위아래는 이 자리 실제 폭으로(1440px~ 나란히 · 편집 46 : 미리보기 54) — 미리보기를 넓혀 글씨가 또렷하게 */}{/* ⭐ 2026-11-17 (3차) 목록을 서랍으로 접으면 1900px~ 나란히(편집 55 : 미리보기 45), 그보다 좁으면 위 · 아래(미리보기 전체 폭) */}{/* ⭐ 2026-11-09 왼쪽 거래처 목록이 늘 있으니 편집·미리보기 나란히는 넓은 화면만, 그보다 좁으면 위(편집)·아래(미리보기) · ⭐ 2026-11-17 명세서 줄 표가 칸을 나눠 넓어져 1800px~ · 편집 56 : 미리보기 44
                ⭐ 2026-11-17 (2차) 1800px 에선 미리보기 칸이 500px 남짓이라 A4 명세서가 반쯤 잘려 보였다 → 나란히는 2200px~(편집 52 : 미리보기 48), 그보다 좁으면 위 · 아래로 쌓아 미리보기가 전체 폭을 쓴다 */}
                <div className="space-y-3 min-w-0">
                  {searched && (
                    <div className="flex items-stretch gap-2 flex-wrap">
                      <div className="flex-1 min-w-[260px]">
                        <PrepaidToggle on={invIncPrepaid} onChange={toggleInvPrepaid} excluded={invPrepaidOut} disabled={isViewer}
                          hint={invIncPrepaid ? `선불·착불 ${rowsInvoiceAll.filter(isPrepaidPay).length.toLocaleString()}건 포함` : "이 명세서엔 선불·착불이 없어요"} />
                      </div>
                      {/* 🧾 2026-11-16 빠른 처리 — 단계에 따라 버튼이 바뀐다: [계산서 발행] → [마감] → 마감 완료(되돌리기) */}
                      {stmtYm && !isViewer && (
                        <div className="flex items-center gap-2" data-kp="stmt-quick">
                          {/* 🧾 2026-11-16 미작성 [작성] → 작성 [계산서 발행] → 계산서 발행 [마감] → 마감 완료 */}
                          {stageIdx(stmtStage) === 0 && <button type="button" disabled={!rowsInvoice.length} onClick={saveStmtDraft} className={`${sdBtnPri} !h-full min-h-[44px] px-6`} data-kp="stmt-quick-write">작성</button>}
                          {stageIdx(stmtStage) >= 1 && stageIdx(stmtStage) < 5 && <button type="button" disabled={!rowsInvoice.length} onClick={askStmtTax} className={`${sdBtnPri} !h-full min-h-[44px] px-6`} data-kp="stmt-quick-tax" title="팝빌 · 홈택스에서 발행한 뒤 발행일 · 승인번호를 기록해요">계산서 발행 기록</button>}
                          {stageIdx(stmtStage) === 5 && <button type="button" onClick={() => quickStmt("마감")} className={`${sdBtnPri} !h-full min-h-[44px] px-6`} data-kp="stmt-quick-close">마감</button>}
                          {stageIdx(stmtStage) === 6 && <span className="inline-flex items-center px-4 min-h-[44px] rounded-xl border border-[#0F1A30] text-[14px] font-black text-[#0F1A30]">마감 완료</span>}
                          {stageIdx(stmtStage) >= 5 && <button type="button" onClick={() => revertStmt("작성")} className={`${sdBtn} !h-full min-h-[44px]`} title="계산서 발행 · 마감을 취소하고 작성 단계로">작성으로 되돌리기</button>}
                        </div>
                      )}
                    </div>
                  )}
                  {!searched ? (
                    <div className={`${csCard} px-5 py-10 text-center`}>
                      <div className="text-[16px] font-black text-[#0F1A30]">거래처를 조회해 주세요</div>
                      <div className="text-[14px] mt-1 text-[#9AA9C3]">왼쪽 목록에서 거래처를 고르거나, 다른 조회로 기사명 · 기간을 직접 고를 수 있어요</div>
                      <button type="button" onClick={() => setManualOpen(true)} className={`${sdBtnPri} mt-4`}><Ico d={IC.search} size={15} />조회하기</button>
                    </div>
                  ) : rowsInvoice.length === 0 ? (
                    <div className={`${csCard} px-5 py-10 text-center`}>
                      <div className="text-[16px] font-black text-[#0F1A30]">조회된 오더가 없어요</div>
                      <div className="text-[14px] mt-1 text-[#9AA9C3]">배차완료 · 청구운임이 있는 오더만 명세서에 들어가요</div>
                    </div>
                  ) : (
                    <StatementLineGrid rows={rowsInvoice} included={selectedInvoiceIds} readOnly={isViewer} groupOf={stmtSubList.length && !stmtSub ? (r) => rgLabel(stmtSubOf(r)) : null}
                      onToggle={(id, on) => (on ? restoreInvoiceRow(id) : excludeInvoiceRow(id))}
                      onToggleAll={(on) => setSelectedInvoiceIds(on ? new Set(rowsInvoice.map(r => r._id)) : new Set())}
                      onOpenOrder={openOrderPopup}
                      onAmount={async (r, v) => {
                        if (isViewer) return showAlert("조회전용 권한으로는 수정할 수 없습니다.");
                        if (!r._id || typeof patchDispatch !== "function") return;
                        await patchDispatch(r._id, { 청구운임: v });
                        if (typeof setDispatchData === "function") setDispatchData(prev => prev.map(d => (d._id === r._id ? { ...d, 청구운임: v } : d)));
                      }} />
                  )}
                  {searched && fareRC.on && selectedRowsInvoice.length > 0 && <FareTypeBreakdown rows={selectedRowsInvoice} title="운임구분별 합계 (선택한 오더)" />}
              {/* ★ 월별 소계 */}
              {searched && monthlySubtotals.size > 1 && (
                <div className={`${csCard} p-4`}>
                  {csHead("MONTHLY", "월별 소계")}
                  <div className="rounded-xl border border-[#E3E8F0] overflow-hidden">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="bg-[#F4F6FA] text-[#5B6B85]">
                          <th className="px-3 py-1.5 text-left font-black">월</th>
                          <th className="px-3 py-1.5 text-right font-black">건수</th>
                          <th className="px-3 py-1.5 text-right font-black">공급가액</th>
                          <th className="px-3 py-1.5 text-right font-black">세액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(monthlySubtotals.entries())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([ym, v]) => (
                            <tr key={ym} className="border-t border-[#EEF2F8]">
                              <td className="px-3 py-1.5 font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{ym}</td>
                              <td className="px-3 py-1.5 text-right text-[#5B6B85] tabular-nums">{v.건수}건</td>
                              <td className="px-3 py-1.5 text-right font-bold text-[#0F1A30] tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{won(v.공급가액)}</td>
                              <td className="px-3 py-1.5 text-right text-[#5B6B85] tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{won(v.세액)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

                  {stmtYm && (
                    <div className={`${csCard} p-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[15px] font-black text-[#0F1A30]">이력</div>
                        <span className="text-[13px] text-[#9AA9C3]">단계 기록 · 보낸 메일</span>
                      </div>
                      <StatementHistory history={stmtCur?.history || []} logs={stmtLogs} />
                    </div>
                  )}
              {/* 발송 */}
              <div className={`${csCard} p-4`}>
                {csHead("DELIVERY", "메일 발송")}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!client) return showAlert("거래처를 먼저 검색하세요.");
                      const found = (clients||[]).find(c=>c.거래처명===client);
                      const email = found?.연락처이메일 || found?.이메일 || "";
                      if (!email) return showAlert(`${client}에 등록된 이메일이 없습니다. 거래처 정보에서 이메일을 등록해주세요.`);
                      setBatchSendList(prev => {
                        if (prev.find(x => x.name === client && (x.sub || "") === stmtSub)) return showAlert(`${stmtTitle}은 이미 발송 목록에 있습니다.`) || prev;
                        showAlert(`${stmtTitle}을(를) 발송 목록에 추가했습니다.`);
                        return [...prev, {
                          name: client,
                          ...(stmtSub ? { sub: stmtSub, label: stmtTitle } : {}), // ⭐ 2026-11-17 구분별 명세서
                          email,
                          start: start || "",
                          end: end || "",
                          mapped: [...mapped],
                          totals: { 공급가: 합계공급가, 세액: 합계세액 },
                          clientInfo: (clients||[]).find(c=>c.거래처명===client) || {},
                        }];
                      });
                    }}
                    className={csBtn}
                  >
                    목록 추가
                  </button>
                  <button type="button" disabled={!batchSendList.length} onClick={() => setBatchSendOpen(true)} className={csBtn}>
                    일괄 발송
                    <span className="min-w-[18px] h-[18px] px-1 rounded-md bg-[#EEF2F8] text-[#0F1A30] text-[10.5px] font-black inline-flex items-center justify-center tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{batchSendList.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const found = (clients||[]).find(c=>c.거래처명===client);
                      setGeneralEmailTo(found?.연락처이메일 || found?.이메일 || "");
                      setGeneralEmailSubject(client ? `${client} 관련 안내` : "");
                      setGeneralEmailBody(`안녕하세요, ${client ? `${client} 담당자님.` : "담당자님."}\n\n${COMPANY_PRINT.name}입니다.\n\n\n\n감사합니다.\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`);
                      setGeneralEmailFiles([]);
                      setGeneralEmailScheduleOn(false); setGeneralEmailScheduleAt("");
                      // ⭐ 2026-11-06 보내는 사람 — 마지막에 쓴 값 → 없으면 메일 설정 이름 · 내 로그인 이메일
                      { let saved = null; try { saved = JSON.parse(localStorage.getItem(genMailFromKey) || "null"); } catch { saved = null; }
                        setGeneralEmailFromName(saved?.name || ""); // ✉️ 2026-11-08 비우면 회사 메일 설정의 보내는 사람 이름
                        setGeneralEmailFromAddr(saved?.email ?? (auth.currentUser?.email || "")); }
                      setGeneralEmailOpen(true);
                    }}
                    className={csBtn}
                  >
                    일반 이메일
                  </button>
                  <button type="button" onClick={() => setScheduledEmailListOpen(true)} className={csBtn}>
                    예약메일함
                    {csPendingScheduled > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-md bg-[#0F1A30] text-white text-[10.5px] font-black inline-flex items-center justify-center tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{csPendingScheduled}</span>
                    )}
                  </button>
                </div>
              </div>
                </div>
            {/* ── 오른쪽: 명세서 미리보기(인쇄·PDF·엑셀·메일 첨부와 같은 모양) ── */}
            <div className={stmtSide ? "min-w-0 sticky top-3" : "min-w-0"}>{/* ⭐ 2026-11-17 따라오기(sticky) · 높이 제한은 나란히 볼 때만 — 쌓여 있을 땐 명세서 전체가 다 보이게 */}
              {docBig && (
                <div className={`${csCard} px-4 py-6 text-center`}>
                  <div className="text-[14px] font-black text-[#0F1A30]">명세서를 크게 보고 있어요</div>
                  <button type="button" onClick={() => setDocBig(false)} className={`${csBtn} mt-2`}>원래대로</button>
                </div>
              )}
              {(() => { const card = (
              <div className={docBig ? `${csCard} overflow-hidden flex flex-col w-full max-w-[1400px] mx-auto h-full` : (stmtSide ? `${csCard} overflow-hidden flex flex-col max-h-[calc(100vh-24px)]` : `${csCard} overflow-hidden flex flex-col`)} onClick={docBig ? (e) => e.stopPropagation() : undefined}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E3E8F0] bg-white flex-wrap">
                  <div className="min-w-0 mr-auto">
                    <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3] leading-none" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>STATEMENT · PREVIEW</div>
                    <div className="text-[13.5px] font-black text-[#0F1A30] mt-1 leading-none truncate">미리보기{searched && client ? <span className="ml-1.5 text-[#5B6B85] font-bold">· {client}</span> : null}</div>
                  </div>
                  <button type="button" onClick={() => { setEditInfo({ ...cInfo }); setShowEdit(true); }} className={csBtn}><EditableText id="misc.btn.49404.거래처 정보" defaultText="거래처 정보" /></button>
                  {/* 🧾 2026-11-16 거래처별 명세서 양식 — 칸 켜고 끄기 · 순서 · 이름 */}
                  <button type="button" data-kp="inv-form" onClick={() => setInvFormOpen(true)} className={csBtn} title="이 거래처 명세서에 보일 칸을 고르고 순서 · 이름을 바꿔요">양식{invForm.source === "client" ? " · 전용" : ""}</button>
                  {invFormOpen && <React.Suspense fallback={null}><InvoiceFormEditor open onClose={() => setInvFormOpen(false)} desk={desk} client={client && client !== AR_ALL ? client : ""} sample={mapped} isViewer={isViewer} /></React.Suspense>}
                  <span className="w-px h-5 bg-[#E3E8F0]" />
                  <button type="button" disabled={!searched} onClick={downloadInvoiceExcel} className={csBtn}><EditableText id="misc.btn.49332.엑셀다운로드" defaultText="엑셀" /></button>
                  <button type="button" disabled={!searched} onClick={savePDF} className={csBtn}>PDF</button>
                  <button type="button" disabled={!searched} onClick={handlePrint} className={csBtnPri}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>
                    <EditableText id="misc.btn.49334.인쇄" defaultText="인쇄" />
                  </button>
                  {/* ⭐ 2026-11-17 크게 보기 — 화면 가득 · 폭 맞춤 / 실제 크기 */}
                  <span className="w-px h-5 bg-[#E3E8F0]" />
                  {docBig && <button type="button" data-kp="inv-big-fit" onClick={() => setDocBigFit((v) => !v)} className={csBtn} title="화면 폭에 맞추기 ↔ 실제 크기(100%)">{docBigFit ? "실제 크기" : "폭 맞춤"}</button>}
                  <button type="button" data-kp="inv-big" disabled={!searched && !docBig} onClick={() => setDocBig((v) => !v)} className={docBig ? csBtnPri : csBtn} title={docBig ? "닫기(Esc)" : "명세서를 화면 가득 크게 봐요"}>{docBig ? "닫기" : "크게 보기"}</button>
                </div>
                <div className={`flex-1 min-h-0 overflow-auto bg-[#E9EDF4] ${searched ? "p-1.5" : "p-4"}`} style={{ backgroundImage: "radial-gradient(rgba(27,43,75,.08) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
                  {!searched ? (
                    <div className="mx-auto max-w-[820px] bg-white rounded-md shadow-[0_8px_28px_rgba(15,26,48,0.12)] px-8 py-10">
                      <div className="text-[9px] font-extrabold tracking-[0.3em] text-[#C9D3E3]" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>TRANSACTION STATEMENT</div>
                      <div className="text-[22px] font-black tracking-[0.32em] text-[#DCE3EE] mt-1">거래명세서</div>
                      <div className="h-[2px] bg-[#EEF2F8] my-4" />
                      <div className="grid grid-cols-2 gap-3">
                        {[0, 1].map((k) => <div key={k} className="h-28 rounded-lg border border-[#EEF2F8] bg-[#FAFBFD]" />)}
                      </div>
                      <div className="mt-3 h-12 rounded-lg border border-[#EEF2F8]" />
                      <div className="mt-3 space-y-1.5">{[0, 1, 2, 3, 4].map((k) => <div key={k} className="h-5 rounded bg-[#F4F6FA]" />)}</div>
                      <div className="mt-6 text-center text-[12.5px] font-bold text-[#9AA9C3]">왼쪽에서 거래처를 조회하면 이곳에 명세서가 그려집니다</div>
                    </div>
                  ) : (
                    <InvoiceDocFit fit={docBig ? docBigFit : true} maxScale={docBig ? 1.8 : 1.6}>{/* ⭐ 2026-11-17 칸 폭에 맞춰 문서 통째로 줄이기(잘려 보이지 않게) — 예전: w-max 로 글자 길이만큼 넓어져 반쯤 잘려 보였다 */}
                    {/* ⭐ 2026-11-17 (4차) 미리보기 양옆 회색 빈칸 없애기 — 칸이 820px보다 넓으면 폭에 맞춰 키운다(최대 1.6배 · 크게 보기 1.8배, CSS zoom 이라 또렷) ·
                        미리보기 칸 안쪽 여백(p-4 → p-1.5) · 종이 그림자 · 종이 여백(26px → 12px)을 화면에서만 줄였다. 인쇄(innerHTML) · PDF · 메일 첨부는 예전 A4 그대로 */}
                    <div className="rounded-sm shadow-[0_1px_3px_rgba(15,26,48,0.12)]">
                      <div id="invoiceArea" data-kp-pad="26px 26px 22px" style={{ background: "#fff", padding: "12px 14px 12px" }}>
                        <div style={{ fontFamily: DOC.font, color: DOC.ink, fontSize: 12 }}>
                          {/* 문서 머리 */}
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: 0, verticalAlign: "bottom", textAlign: "left", border: "none" }}>
                                  <div style={{ fontFamily: DOC.mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.3em", color: DOC.mute }}>TRANSACTION STATEMENT</div>
                                  <div style={{ fontSize: 23, fontWeight: 900, letterSpacing: "0.3em", marginTop: 4, color: DOC.ink }}><EditableText id="popup.title.거래명세서" defaultText="거래명세서" /></div>
                                </td>
                                <td style={{ padding: 0, verticalAlign: "bottom", textAlign: "right", border: "none" }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: DOC.sub }}>거래기간</div>
                                  <div style={{ fontFamily: DOC.mono, fontSize: 12.5, fontWeight: 800, color: DOC.ink, marginTop: 2, whiteSpace: "nowrap" }}>{(start || end) ? `${start || "시작일"} ~ ${end || "종료일"}` : "전체 기간"}</div>
                                  {stmtSub && <div style={{ fontSize: 11, fontWeight: 800, color: DOC.sub, marginTop: 3, whiteSpace: "nowrap" }} data-kp="stmt-sub-doc">구분 · {rgLabel(stmtSub)}</div>}{/* ⭐ 2026-11-17 구분별 명세서 */}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          <div style={{ height: 2, background: DOC.ink, margin: "12px 0 14px" }} />

                          {/* 공급받는자 / 공급자 */}
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr>
                                <td style={{ width: "50%", padding: "0 7px 0 0", verticalAlign: "top", border: "none" }}>
                                  <div style={{ border: `1px solid ${DOC.line}`, borderRadius: 8, overflow: "hidden" }}>
                                    {docPartyHead("공급받는자", "RECIPIENT")}
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                      <tbody>
                                        {[["상호", cInfo.거래처명], ["대표자", cInfo.대표자], ["사업자번호", cInfo.사업자번호], ["주소", cInfo.주소], ["업태", cInfo.업태], ["종목", cInfo.종목]].map(([k, v], i) => (
                                          <tr key={k}><td style={docCellK(i)}>{k}</td><td style={docCellV(i)}>{v || "-"}</td></tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                                <td style={{ width: "50%", padding: "0 0 0 7px", verticalAlign: "top", border: "none" }}>
                                  <div style={{ border: `1px solid ${DOC.line}`, borderRadius: 8, overflow: "hidden" }}>
                                    {docPartyHead("공급자", "SUPPLIER")}
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                      <tbody>
                                        <tr><td style={docCellK(0)}>상호</td><td style={docCellV(0)}>{COMPANY_PRINT.name || "-"}</td></tr>
                                        {/* ★ 대표자 + (인) + 도장 */}
                                        <tr>
                                          <td style={docCellK(1)}>대표자</td>
                                          <td style={{ ...docCellV(1), padding: "1px 6px 1px 0" }}>
                                            <div style={{ display: "flex", alignItems: "center" }}>
                                              <span style={{ flex: 1 }}>{COMPANY_PRINT.ceo || "-"}</span>
                                              <span
                                                title={canQuickSeal ? "클릭하여 도장 이미지 바로 변경" : undefined}
                                                onClick={canQuickSeal ? () => sealQuickUploadRef.current?.click() : undefined}
                                                style={{
                                                  position: "relative",
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  width: 44,
                                                  height: 44,
                                                  cursor: canQuickSeal ? "pointer" : "default", /* ⭐ 2026-11-02 점검 — 경리·인사만 클릭 가능 */
                                                  opacity: sealQuickUploading ? 0.4 : 1,
                                                }}
                                              >
                                                <img
                                                  src={COMPANY_PRINT.seal}
                                                  alt=""
                                                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                                                  onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
                                                  style={{
                                                    position: "absolute",
                                                    top: "50%",
                                                    left: "50%",
                                                    transform: "translate(-50%, -50%)",
                                                    width: 42,
                                                    height: 42,
                                                    opacity: 0.9,
                                                    pointerEvents: "none",
                                                    mixBlendMode: "multiply",
                                                  }}
                                                />
                                                <span style={{ position: "relative", zIndex: 1, fontSize: 11.5, color: "#5B6B85", pointerEvents: "none" }}>(인)</span>
                                                <input
                                                  autoComplete="off"
                                                  ref={sealQuickUploadRef}
                                                  type="file"
                                                  accept="image/*"
                                                  data-html2canvas-ignore="true"
                                                  style={{ display: "none" }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  onChange={(e) => handleSealQuickUpload(e.target.files?.[0])}
                                                />
                                              </span>
                                            </div>
                                          </td>
                                        </tr>
                                        {[["사업자번호", COMPANY_PRINT.bizNo], ["주소", COMPANY_PRINT.addr], ["업태", COMPANY_PRINT.type], ["종목", COMPANY_PRINT.item], ["연락처", COMPANY_PRINT.contact]].map(([k, v], i) => (
                                          <tr key={k}><td style={docCellK(i + 2)}>{k}</td><td style={docCellV(i + 2)}>{v || "-"}</td></tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          {/* ★ 합계금액 (공급자 정보와 내역 표 사이) */}
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, border: `1.5px solid ${DOC.ink}` }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "9px 14px", verticalAlign: "middle", textAlign: "left", border: "none", whiteSpace: "nowrap" }}>
                                  <span style={{ fontSize: 12, fontWeight: 900, color: DOC.ink }}>합계금액</span>
                                  <span style={{ fontSize: 10.5, color: DOC.sub, marginLeft: 6 }}>(공급가액+부가세)</span>
                                </td>
                                <td style={{ padding: "9px 14px", verticalAlign: "middle", textAlign: "right", border: "none" }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 800, color: DOC.ink }}>일금 {numberToKorean(합계공급가 + 합계세액)} 원정</span>
                                  <span style={{ fontFamily: DOC.mono, fontSize: 15, fontWeight: 900, color: DOC.ink, marginLeft: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>(₩ {won(합계공급가 + 합계세액)})</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          {/* 내역 표 */}
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                            <InvoiceColGroup form={invForm} />{/* ⭐ 2026-11-17 (3차) 칸 폭 — A4 안에 들어가게 */}
                            <thead>
                              <tr>
                                {headerLabels(invForm).map(h => (
                                  <th key={h} style={docTh}><EditableText id={`taxInvoice.table.header.${h}`} defaultText={h} /></th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {mapped.length === 0 ? (
                                <tr><td colSpan={headerLabels(invForm).length} style={{ ...docTd, padding: "28px 6px", color: DOC.mute, fontSize: 12 }}>조회 결과가 없습니다. (청구운임 0원인 오더는 제외됩니다)</td></tr>
                              ) : (
                                <InvoicePreviewRows mapped={mapped} rows={selectedRowsInvoice} onOpen={docBig ? (o) => { setDocBig(false); openOrderPopup(o); } : openOrderPopup /* ⭐ 2026-11-17 크게 보기 중엔 닫고 오더 상세(팝업이 크게 보기 뒤로 숨지 않게) */} docTd={docTd} docNum={docNum} DOC={DOC} won={won} form={invForm} />
                              )}
                              {mapped.length > 0 && (
                                <tr>
                                  <td colSpan={1 + visibleCols(invForm).length} style={{ ...docTd, background: DOC.soft, borderTop: `2px solid ${DOC.ink}`, borderBottom: `1px solid ${DOC.line}`, fontWeight: 900, letterSpacing: "0.4em", padding: "8px 6px" }}>소 계</td>
                                  <td style={{ ...docNum, background: DOC.soft, borderTop: `2px solid ${DOC.ink}`, borderBottom: `1px solid ${DOC.line}`, fontWeight: 800, padding: "8px 6px" }}>{won(합계공급가)}</td>
                                  {invForm.tax && <td style={{ ...docNum, background: DOC.soft, borderTop: `2px solid ${DOC.ink}`, borderBottom: `1px solid ${DOC.line}`, fontWeight: 800, color: DOC.sub, padding: "8px 6px" }}>{won(합계세액)}</td>}
                                  {invForm.tax && <td style={{ ...docNum, background: DOC.soft, borderTop: `2px solid ${DOC.ink}`, borderBottom: `1px solid ${DOC.line}`, fontWeight: 900, padding: "8px 6px" }}>{won(합계공급가 + 합계세액)}</td>}
                                </tr>
                              )}
                            </tbody>
                          </table>

                          {/* 입금계좌 · 문의 */}
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, background: DOC.soft }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "10px 14px", textAlign: "left", border: "none", fontSize: 12 }}>
                                  <span style={{ fontFamily: DOC.mono, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.22em", color: DOC.mute, marginRight: 8 }}>BANK</span>
                                  <span style={{ color: DOC.sub, fontWeight: 700 }}>입금계좌</span>
                                  <span style={{ color: DOC.ink, fontWeight: 900, marginLeft: 8 }}>{COMPANY_PRINT.bank || "-"}</span>
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "right", border: "none", fontSize: 12 }}>
                                  <span style={{ color: DOC.sub, fontWeight: 700 }}>문의</span>
                                  <span style={{ color: DOC.ink, fontWeight: 800, marginLeft: 8 }}>{COMPANY_PRINT.email || "-"}</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                    </InvoiceDocFit>
                  )}
                </div>
              </div>
              ); return docBig ? createPortal(
                <div className="kp-settle fixed inset-0 z-[99990] bg-[#0F1A30]/50 p-2 sm:p-6 flex" data-kp="inv-big-overlay" onClick={() => setDocBig(false)}>{card}</div>,
                document.body) : card; })()}
            </div>
              </div>
            </div>
            </div>
          )}

          {/* 직접 조회(기사명 · 여러 달 · 직접 기간) */}
          <KpModal open={manualOpen} onClose={() => setManualOpen(false)} en="QUERY" title="직접 조회" sub="거래처명 · 기사명과 기간으로 명세서를 만들어요" width={520} bodyClass="p-5 min-h-[420px]"
            footer={<>
              <button type="button" className={sdBtn} onClick={() => { setSearchInput(""); setClient(""); setStart(""); setEnd(""); setSearched(false); setDropdownOpen(false); }}>초기화</button>
              <button type="button" className={sdBtnPri} onClick={() => {
                if (!searchInput.trim()) return showAlert("검색어를 입력하세요.");
                stmtExRef.current = [];
                setClient(searchInput.trim()); setSearched(true); setDropdownOpen(false); setManualOpen(false); setInvView("edit");
              }}><Ico d={IC.search} size={15} />조회</button>
            </>}>
              {/* 조회 조건 */}
              <div>
                {csHead("QUERY", "조회 조건", (
                  <div className={csSeg}>
                    {["거래처명", "기사명"].map((t) => (
                      <button key={t} type="button" className={csSegBtn(searchType === t)}
                        onClick={() => { if (searchType === t) return; setSearchType(t); setSearchInput(""); setClient(""); setSearched(false); setDropdownOpen(false); }}>{t}</button>
                    ))}
                  </div>
                ))}
                {/* ★ 검색 입력 + 자동완성 드롭다운 */}
                <label className={csLab}>{searchType}</label>
                <div className="relative" ref={dropdownRef}>
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  <input autoComplete="off"
                    ref={inputRef}
                    className={`${csInp} pl-8`}
                    placeholder={`${searchType} 입력 (자동완성)`}
                    value={searchInput}
                    onChange={e => {
                      setSearchInput(e.target.value);
                      setDropdownOpen(true);
                      setDropdownIdx(0);
                    }}
                    onFocus={() => {
                      if (searchInput.trim()) { setDropdownOpen(true); setDropdownIdx(0); }
                    }}
                    onKeyDown={handleInputKeyDown}
                  />
                  {dropdownOpen && dropdownOptions.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#DCE3EE] rounded-xl shadow-[0_12px_32px_rgba(15,26,48,0.16)] max-h-[260px] overflow-y-auto py-1">
                      {dropdownOptions.map((name, i) => (
                        <div
                          key={name + i}
                          ref={el => dropdownItemRefs.current[i] = el}
                          className={`px-3.5 py-2 text-[13px] cursor-pointer transition ${
                            i === dropdownIdx ? "bg-[#EEF2F8] text-[#0F1A30] font-bold" : "text-[#3A4A66] hover:bg-[#F4F6FA]"
                          }`}
                          onMouseEnter={() => setDropdownIdx(i)}
                          onMouseDown={e => { e.preventDefault(); selectDropdownItem(name); }}
                        >
                          {(() => {
                            const q = searchInput.trim();
                            if (!q) return name;
                            const idx = name.toLowerCase().indexOf(q.toLowerCase());
                            if (idx < 0) return name;
                            return (
                              <>
                                {name.slice(0, idx)}
                                <span className="text-[#0F1A30] font-black underline decoration-[#8FB0F0] decoration-2 underline-offset-2">{name.slice(idx, idx + q.length)}</span>
                                {name.slice(idx + q.length)}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ★ 기간 + 퀵셀렉트 */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <label className={`${csLab} mb-0`}>기간 (상차일)</label>
                  <div className={csSeg}>
                    <button type="button" onClick={setThisMonth} className={csSegBtn(false)}><EditableText id="misc.btn.49310.이번달" defaultText="이번달" /></button>
                    <button type="button" onClick={setLastMonth} className={csSegBtn(false)}><EditableText id="misc.btn.49311.지난달" defaultText="지난달" /></button>
                    <button type="button" onClick={setThisYear} className={csSegBtn(false)}><EditableText id="misc.btn.49312.올해전체" defaultText="올해전체" /></button>
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                  <CustomDatePicker className={`${csInp} text-left tabular-nums`} placeholder="시작일" value={start} onChange={e => setStart(e.target.value)} />
                  <span className="text-[#9AA9C3] font-bold">~</span>
                  <CustomDatePicker className={`${csInp} text-left tabular-nums`} placeholder="종료일" value={end} onChange={e => setEnd(e.target.value)} />
                </div>

              </div>
          </KpModal>

          {/* ★ 오더 상세 팝업 */}
          {/* ⭐ 2026-11-17 업체 명세서 비교 — 이 명세서에 넣은 오더와 맞춘다. [수정]은 PC면 오더 복사/수정 패널, 아니면 오더 팝업 */}
          {stmtCmpOpen && searched && client && (
            <React.Suspense fallback={null}>
              <StmtCompareModal client={client} ym={stmtYm || String(start || "").slice(0, 7)} where="거래처정산" orders={selectedRowsInvoice} canEdit={!isViewer}
                onClose={() => setStmtCmpOpen(false)}
                onEdit={(o) => (copyPanel ? window.dispatchEvent(new CustomEvent("kp-open-copy-panel", { detail: { row: o } })) : openOrderPopup(o))} />
            </React.Suspense>
          )}
          {orderPopup && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* 헤더 */}
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <h3 className="text-white font-black text-[18px]"><EditableText id="popup.title.오더 상세" defaultText="오더 상세" /></h3>
                  <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={() => setOrderPopup(null)}>✕</button>
                </div>

                {/* 오더 요약 (읽기전용) */}
                <div className="px-6 py-3 bg-[#F8FAFD] border-b text-[13px] text-[#5B6B85]">
                  <span className="font-bold text-[#1B2B4B]">{orderPopup.상차일 || ""}</span>
                  <span className="mx-2">|</span>
                  <span>{orderPopup.거래처명 || ""}</span>
                  <span className="mx-2">|</span>
                  <span>{orderPopup.배차상태 || ""}</span>
                </div>

                {/* 수정 가능 필드 */}
                <div className="p-6 space-y-3">
                  {[
                    { key: "상차지명", label: "상차지" },
                    { key: "하차지명", label: "하차지" },
                    { key: "화물내용", label: "화물명" },
                    { key: "이름", label: "기사명" },
                    { key: "차량번호", label: "차량번호" },
                    { key: "청구운임", label: "청구운임" },
                    { key: "기사운임", label: "기사운임" },
                    { key: "상차시간", label: "상차시간" },
                    { key: "하차시간", label: "하차시간" },
                    { key: "비고", label: "비고" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[12px] font-semibold text-[#7A89A3] mb-1 block">{label}</label>
                      <input autoComplete="off"
                        className="border border-[#D5DDEA] rounded-xl px-3 py-2 w-full text-[13px] focus:border-[#1B2B4B] outline-none"
                        value={orderPopupEdit[key] || ""}
                        onChange={e => setOrderPopupEdit(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                {/* 하단 버튼 */}
                <div className="kp-modal-foot px-6 py-4 flex gap-3">
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold hover:bg-[#F4F6FA] transition"
                    onClick={() => setOrderPopup(null)}
                  >
                    <EditableText id="orderPopup.닫기" defaultText="닫기" />
                  </button>
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-[#0F1A30] text-white font-bold hover:bg-[#0F1A30] transition"
                    onClick={async () => {
                      if (isViewer) return showAlert("조회전용 권한으로는 수정할 수 없습니다.");
                      if (!orderPopup._id) return showAlert("저장할 수 없는 오더입니다.");
                      if (typeof patchDispatch === "function") {
                        if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
                        await patchDispatch(orderPopup._id, orderPopupEdit);
                        showAlert("수정 내용이 저장되었습니다.");
                        setOrderPopup(null);
                      } else {
                        showAlert("저장 기능이 연결되지 않아 저장할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.");
                      }
                    }}
                  >
                    <EditableText id="orderPopup.수정저장" defaultText="수정 저장" />
                  </button>
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold hover:bg-[#243a60] transition"
                    onClick={() => {
                      if (orderPopup._id && typeof window.__selectOrder === "function") {
                        setOrderPopup(null);
                        window.__selectOrder(orderPopup._id);
                      }
                    }}
                  >
                    오더로 이동
                  </button>
                </div>
              </div>
            </div>
          )}
{/* ── 일반 이메일 발송 모달 ── */}
          {generalEmailOpen && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <div className="text-white font-black text-[18px]">일반 이메일 발송</div>
                    <div className="text-white/70 text-[14px] mt-0.5">거래명세서·미수금과 무관한 자유 형식 이메일</div>
                  </div>
                  <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={() => setGeneralEmailOpen(false)}>×</button>
                </div>
                <div className="p-6 space-y-4">
                  {/* ⭐ 2026-11-06 보내는 사람(이름·이메일) 직접 입력 */}
                  <div data-genmail-from className="rounded-xl border border-[#D5E0F2] bg-[#F5F8FD] p-3.5">
                    <div className="text-[13px] font-black text-[#0F1A30] mb-2">보내는 사람</div>
                    <div className="grid grid-cols-[1fr_1.4fr] gap-2">
                      <input autoComplete="off" data-genmail-from-name className="border border-[#D5DDEA] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#1B2B4B] bg-white"
                        placeholder="이름 (비우면 메일 설정 이름)" maxLength={60} value={generalEmailFromName} onChange={e => setGeneralEmailFromName(e.target.value)} />
                      <input autoComplete="off" type="email" data-genmail-from-email className={`border-2 rounded-lg px-3 py-2.5 text-[13px] outline-none bg-white ${generalEmailFromAddr.trim() && !GEN_MAIL_RE.test(generalEmailFromAddr.trim()) ? "border-[#B42318]" : "border-[#D5DDEA] focus:border-[#1B2B4B]"}`}
                        placeholder="답장 받을 이메일 (예: me@company.com)" value={generalEmailFromAddr} onChange={e => setGeneralEmailFromAddr(e.target.value)} />
                    </div>
                    {generalEmailFromAddr.trim() && !GEN_MAIL_RE.test(generalEmailFromAddr.trim()) && <div className="mt-1.5 text-[12px] font-bold text-[#B42318]">이메일 형식이 올바르지 않습니다.</div>}
                    <div className="mt-2 text-[12px] leading-relaxed text-[#5B6B85]">
                      이름을 비우면 메일 설정의 보내는 사람 이름으로, 이메일을 비우면 메일 설정의 회신 주소로 답장이 와요.
                      실제 발송 주소는 회사정보 › 메일 설정에 등록한 우리 회사 메일이에요.
                    </div>
                    <MailSenderLine company={userCompany} className="mt-2" />
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">수신 이메일</label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <input autoComplete="off" className="flex-1 border border-[#D5DDEA] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#1B2B4B]"
                          placeholder="이메일 주소 (여러 명: 쉼표로 구분)" value={generalEmailTo} onChange={e => setGeneralEmailTo(e.target.value)} />
                        <button type="button"
                          onClick={() => { setGeneralEmailAddrOpen(p => !p); setGeneralEmailAddrQuery(""); }}
                          className="px-3 py-2 rounded-lg border-2 border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B] hover:text-white transition whitespace-nowrap">
                          주소록
                        </button>
                      </div>
                      {generalEmailAddrOpen && (
                        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-white border border-[#E3E8F0] rounded-xl shadow-xl max-h-60 overflow-y-auto">
                          <div className="p-2 border-b border-[#EEF2F8] sticky top-0 bg-white">
                            <input autoComplete="off" className="w-full border border-[#E3E8F0] rounded-lg px-3 py-1.5 text-[12px] outline-none"
                              placeholder="거래처명으로 검색" value={generalEmailAddrQuery}
                              onChange={e => { setGeneralEmailAddrQuery(e.target.value); setGeneralEmailAddrActiveIdx(0); }}
                              onKeyDown={e => {
                                const opts = (clients || []).filter(c => c.이메일 && (!generalEmailAddrQuery || (c.거래처명||"").includes(generalEmailAddrQuery)));
                                if (e.key === "ArrowDown") { e.preventDefault(); setGeneralEmailAddrActiveIdx(i => Math.min(i + 1, opts.length - 1)); }
                                else if (e.key === "ArrowUp") { e.preventDefault(); setGeneralEmailAddrActiveIdx(i => Math.max(i - 1, 0)); }
                                else if (e.key === "Enter") {
                                  e.preventDefault();
                                  const c = opts[generalEmailAddrActiveIdx];
                                  if (!c) return;
                                  const cur = generalEmailTo.trim();
                                  const existing = cur ? cur.split(",").map(s => s.trim()).filter(Boolean) : [];
                                  if (!existing.includes(c.이메일)) existing.push(c.이메일);
                                  setGeneralEmailTo(existing.join(", "));
                                  setGeneralEmailAddrQuery("");
                                  setGeneralEmailAddrOpen(false);
                                } else if (e.key === "Escape") { e.preventDefault(); setGeneralEmailAddrOpen(false); }
                              }}
                              ref={imeFocusRef} />
                          </div>
                          {(clients || []).filter(c => c.이메일 && (!generalEmailAddrQuery || (c.거래처명||"").includes(generalEmailAddrQuery))).length === 0 ? (
                            <div className="px-4 py-6 text-center text-[13px] text-[#7A89A3]">
                              {generalEmailAddrQuery ? "검색 결과 없음" : "등록된 이메일 없음 (거래처관리에서 이메일 등록)"}
                            </div>
                          ) : (clients || []).filter(c => c.이메일 && (!generalEmailAddrQuery || (c.거래처명||"").includes(generalEmailAddrQuery))).map((c, i) => (
                            <div key={i} className={`px-4 py-2.5 cursor-pointer flex items-center justify-between text-[13px] border-b border-gray-50 ${i===generalEmailAddrActiveIdx?"bg-[#EEF3FC]":"hover:bg-[#EEF3FC]"}`}
                              onMouseEnter={() => setGeneralEmailAddrActiveIdx(i)}
                              onMouseDown={e => {
                                e.preventDefault();
                                const cur = generalEmailTo.trim();
                                const existing = cur ? cur.split(",").map(s => s.trim()).filter(Boolean) : [];
                                if (!existing.includes(c.이메일)) existing.push(c.이메일);
                                setGeneralEmailTo(existing.join(", "));
                                setGeneralEmailAddrQuery("");
                                setGeneralEmailAddrOpen(false);
                              }}>
                              <span className="font-semibold text-[#1B2B4B]">{c.거래처명}</span>
                              <span className="text-[#7A89A3] text-[12px]">{c.이메일}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">제목</label>
                    <input autoComplete="off" className="w-full border border-[#D5DDEA] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#1B2B4B]"
                      placeholder="이메일 제목 입력" value={generalEmailSubject} onChange={e => setGeneralEmailSubject(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-bold text-[#3A4A66]">본문</label>
                      <span className="text-[11px] text-[#1B2B4B]">직접 작성</span>
                    </div>
                    <textarea className="w-full border border-[#D5DDEA] rounded-xl px-4 py-3 text-[13px] leading-relaxed resize-none outline-none focus:border-[#1B2B4B]"
                      rows={10} value={generalEmailBody} onChange={e => setGeneralEmailBody(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">파일 첨부 (선택)</label>
                    <div className="border-2 border-dashed border-[#D5DDEA] rounded-xl p-3">
                      <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[#1B2B4B] hover:text-[#1B2B4B]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        파일 선택 (이미지, PDF, Excel 등)
                        <input autoComplete="off" type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.doc,.docx" className="hidden"
                          onChange={e => {
                            const files = Array.from(e.target.files);
                            const compressFile = (f) => new Promise(res => {
                              if (!f.type.startsWith("image/")) {
                                const r = new FileReader();
                                r.onload = ev => res({ name: f.name, size: f.size, type: f.type, base64: ev.target.result.split(",")[1] });
                                r.readAsDataURL(f);
                                return;
                              }
                              const img = new Image();
                              const url = URL.createObjectURL(f);
                              img.onload = () => {
                                URL.revokeObjectURL(url);
                                const MAX = 1200;
                                let w = img.width, h = img.height;
                                if (w > MAX || h > MAX) {
                                  if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                                  else { w = Math.round(w * MAX / h); h = MAX; }
                                }
                                const canvas = document.createElement("canvas");
                                canvas.width = w; canvas.height = h;
                                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                                const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
                                res({ name: f.name.replace(/\.[^.]+$/, ".jpg"), size: Math.round(dataUrl.length * 0.75), type: "image/jpeg", base64: dataUrl.split(",")[1] });
                              };
                              img.onerror = () => { URL.revokeObjectURL(url); const r = new FileReader(); r.onload = ev => res({ name: f.name, size: f.size, type: f.type, base64: ev.target.result.split(",")[1] }); r.readAsDataURL(f); };
                              img.src = url;
                            });
                            Promise.all(files.map(compressFile)).then(arr => {
                              setGeneralEmailFiles(prev => {
                                const next = [...prev, ...arr];
                                const totalKB = Math.round(next.reduce((s, x) => s + (x.base64?.length || 0), 0) * 0.75 / 1024);
                                if (totalKB > 6000) alert(`총 첨부 용량이 약 ${(totalKB/1024).toFixed(1)}MB예요. 6MB를 넘으면 보내지 못할 수 있어요. 파일을 줄여 주세요.`);
                                return next;
                              });
                            });
                          }} />
                      </label>
                      {generalEmailFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {generalEmailFiles.map((f, i) => (
                            <div key={i} className="flex items-center justify-between text-[12px] bg-[#F8FAFD] rounded px-2 py-1">
                              <span className="truncate text-[#3A4A66]">{f.name}</span>
                              <span className="text-[#7A89A3] ml-2 shrink-0">{f.size > 1024*1024 ? `${(f.size/1024/1024).toFixed(1)}MB` : `${Math.round(f.size/1024)}KB`}</span>
                              <button onClick={() => setGeneralEmailFiles(prev => prev.filter((_, j) => j !== i))} className="text-[#0B1428] hover:text-[#0B1428] ml-2 shrink-0">×</button>
                            </div>
                          ))}
                          <div className="text-[11px] text-[#7A89A3] text-right pt-1">
                            총 {(generalEmailFiles.reduce((s,f)=>s+(f.size||0),0)/1024/1024).toFixed(1)}MB (6MB까지)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 명함 포함 토글 */}
                  <div className="flex items-center justify-between bg-[#F8FAFD] rounded-xl px-4 py-3 border border-[#E3E8F0]">
                    <div>
                      <div className="text-[13px] font-bold text-[#3A4A66]">명함 이미지 포함</div>
                      <div className="text-[11px] text-[#7A89A3]">{cardImage ? "내 정보에서 등록한 명함이 첨부됩니다" : "명함 미등록 (내 정보에서 업로드)"}</div>
                    </div>
                    <button onClick={() => setIncludeCardGeneral(v => !v)} disabled={!cardImage}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${includeCardGeneral && cardImage ? "bg-[#1B2B4B]" : "bg-[#C9D3E3]"} ${!cardImage ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${includeCardGeneral && cardImage ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  {/* 예약발송 */}
                  <div className="bg-[#F8FAFD] rounded-xl px-4 py-3 border border-[#E3E8F0]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]"
                        checked={generalEmailScheduleOn}
                        onChange={(e) => setGeneralEmailScheduleOn(e.target.checked)} />
                      <span className="text-[13px] font-bold text-[#3A4A66]">예약발송</span>
                    </label>
                    {generalEmailScheduleOn && (
                      <DateTimeSelect className="mt-2" dateClassName="w-full h-10 border border-[#E3E8F0] rounded-lg px-3 text-[13px] bg-white focus:outline-none focus:border-[#1B2B4B]" timeClassName="w-full h-10 border border-[#E3E8F0] rounded-lg px-3 text-[13px] bg-white"
                        value={generalEmailScheduleAt}
                        onChange={(e) => setGeneralEmailScheduleAt(e.target.value)} />
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setGeneralEmailOpen(false)} className="flex-1 py-2.5 rounded-xl bg-[#F4F6FA] hover:bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px]"><EditableText id="misc.btn.49999.취소" defaultText="취소" /></button>
                    <button
                      data-genmail-send
                      disabled={generalEmailSending || !generalEmailTo.trim() || !generalEmailSubject.trim() || (generalEmailScheduleOn && !generalEmailScheduleAt)}
                      onClick={async () => {
                        if (!generalEmailTo.trim()) return showAlert("수신 이메일을 입력하세요.");
                        if (!generalEmailSubject.trim()) return showAlert("제목을 입력하세요.");
                        if (generalEmailScheduleOn && !generalEmailScheduleAt) return showAlert("예약 발송 시각을 선택하세요.");
                        if (generalEmailScheduleOn && new Date(generalEmailScheduleAt).getTime() <= Date.now()) return showAlert("예약 시각은 현재 시각 이후여야 합니다.");
                        // ⭐ 2026-11-06 입력 확인 — 받는 주소 · 보내는 사람 이메일 형식
                        const toBad = generalEmailTo.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).filter(s => !GEN_MAIL_RE.test((/<([^>]+)>/.exec(s) || [null, s])[1].trim()));
                        if (toBad.length) return showAlert(`수신 이메일 형식을 확인하세요: ${toBad.join(", ")}`);
                        const fromAddr = generalEmailFromAddr.trim();
                        if (fromAddr && !GEN_MAIL_RE.test(fromAddr)) return showAlert("보내는 사람 이메일 형식을 확인하세요.");
                        try { localStorage.setItem(genMailFromKey, JSON.stringify({ name: generalEmailFromName.trim(), email: fromAddr })); } catch { /* 저장 실패 무시 */ }
                        setGeneralEmailSending(true);
                        const bodyLines = (generalEmailBody || "").split("\n").map(l => `<p style="margin:0 0 6px">${l || "&nbsp;"}</p>`).join("");
                        const cardSection = (includeCardGeneral && cardImage) ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/><img src="${cardImage}" alt="명함" style="width:100%;max-width:500px;border-radius:8px;display:block" onerror="this.style.display='none'"/>` : "";
                        const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;color:#333;line-height:1.8;max-width:600px">${bodyLines}${cardSection}</div>`;
                        const attachments = generalEmailFiles.map(f => ({ filename: f.name, content: f.base64, encoding: "base64" }));
                        const fromName = generalEmailFromName.trim(); // ✉️ 2026-11-08 비우면 회사 메일 설정의 보내는 사람 이름
                        try {
                          if (generalEmailScheduleOn) {
                            if (scheduledEmailAttachSize(attachments) > SCHEDULED_EMAIL_ATTACH_LIMIT) {
                              showAlert("첨부파일 용량이 너무 커서 예약발송을 지원하지 않습니다. 예약발송 체크를 해제하고 바로 보내주세요.");
                              setGeneralEmailSending(false);
                              return;
                            }
                            await scheduleEmailDoc({
                              companyName: userCompany, to: generalEmailTo, subject: generalEmailSubject, html: bodyHtml,
                              attachments, fromName, replyTo: fromAddr, sendAt: new Date(generalEmailScheduleAt),
                              type: "일반이메일", meta: { client: client || "-", body: generalEmailBody || "" },
                            });
                            showAlert(`${new Date(generalEmailScheduleAt).toLocaleString("ko-KR")}에 발송 예약되었습니다.`);
                            setGeneralEmailOpen(false);
                            setGeneralEmailSending(false);
                            return;
                          }
                          // ✉️ 2026-11-08 회사 메일 계정으로 — 기록(emailLogs)은 서버가 남긴다
                          const r = await sendCompanyMail({
                            to: generalEmailTo,
                            subject: generalEmailSubject,
                            html: bodyHtml,
                            attachments,
                            fromName,
                            replyTo: fromAddr, // ⭐ 2026-11-06 답장 받을 주소
                            log: { type: "일반이메일", client: client || "-", body: generalEmailBody || "" },
                          });
                          const logBase = { type: "일반이메일", client: client || "-", to: generalEmailTo, subject: generalEmailSubject, body: generalEmailBody || "", attachmentNames: generalEmailFiles.map(f => f.name), fromName, replyTo: fromAddr };
                          if (r.ok) {
                            if (!r.logged) logEmail({ ...logBase, status: "success", sentFrom: r.sentFrom || "" }).catch(() => {});
                            showAlert(`${generalEmailTo} 로 발송 완료${r.sentFrom ? `\n보낸 주소: ${r.sentFrom}` : ""}${fromAddr ? ` · 답장 받을 주소 ${fromAddr}` : ""}`);
                            setGeneralEmailOpen(false);
                          } else if (!isMailSetupNeeded(r)) {
                            if (!r.logged) logEmail({ ...logBase, status: "failed", error: r.error }).catch(() => {}); // ⭐ 2026-11-06 실패도 기록
                            showAlert(`발송 실패: ${r.error}`);
                          }
                        } catch (e) {
                          logEmail({ type: "일반이메일", client: client || "-", to: generalEmailTo, subject: generalEmailSubject, body: generalEmailBody || "", attachmentNames: generalEmailFiles.map(f => f.name), fromName, replyTo: fromAddr, status: "failed", error: e.message }).catch(() => {});
                          showAlert(`발송 중 오류가 발생했습니다: ${e.message}`);
                        } finally {
                          setGeneralEmailSending(false);
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] disabled:opacity-50"
                    >
                      {generalEmailSending ? "처리 중..." : generalEmailScheduleOn ? "예약발송 등록" : "발송"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

{/* 일괄 발송 목록 모달 */}
{batchSendOpen && (
  <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
    <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[600px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="text-white font-black text-[18px]">여러 업체 일괄 발송</div>
          <div className="text-white/70 text-[14px] mt-0.5">업체별 거래명세서 + 엑셀이 각 이메일로 개별 발송됩니다</div>
        </div>
        <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={() => { if (!batchSending) setBatchSendOpen(false); }}>×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {batchSendList.map((item, i) => (
          <div key={i} className="bg-[#F8FAFD] rounded-xl border border-[#E3E8F0] px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-[13px] font-bold text-[#1B2B4B]">{item.label || item.name}</span>
                <span className="ml-2 text-[11px] text-[#7A89A3]">{item.start}~{item.end} · {item.mapped?.length||0}건</span>
              </div>
              {!batchSending && (
                <button onClick={() => setBatchSendList(prev => prev.filter((_, j) => j !== i))} className="text-[#0B1428] hover:text-[#0B1428] text-[13px] font-bold px-2 py-1"><EditableText id="misc.btn.50086.삭제" defaultText="삭제" /></button>
              )}
            </div>
            <div className="text-[11px] text-[#7A89A3] mb-1.5">
              공급가: {(item.totals?.공급가||0).toLocaleString()}원 / 세액: {(item.totals?.세액||0).toLocaleString()}원 / 합계: {((item.totals?.공급가||0)+(item.totals?.세액||0)).toLocaleString()}원
            </div>
            <input autoComplete="off"
              className="w-full border border-[#D5DDEA] rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#1B2B4B]"
              placeholder="수신 이메일"
              value={item.email}
              disabled={batchSending}
              onChange={e => setBatchSendList(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
            />
          </div>
        ))}
        {batchSendList.length === 0 && (
          <div className="text-center py-8 text-[13px] text-[#7A89A3]">목록이 비어있습니다</div>
        )}
        {batchSending && batchSendProgress.total > 0 && (
          <div className="bg-[#EEF3FC] rounded-xl border border-[#C9D6EE] px-4 py-3 text-[13px]">
            <div className="font-bold text-[#1B2B4B] mb-1">발송 중... {batchSendProgress.done}/{batchSendProgress.total}</div>
            {batchSendProgress.failed.length > 0 && (
              <div className="text-[#0B1428] text-[12px] space-y-0.5 mt-1">
                {batchSendProgress.failed.map((f, i) => (
                  <div key={i}><b>{f.name}</b>: {f.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-5 border-t border-[#EEF2F8] rounded-b-2xl flex gap-3">
        <button
          disabled={batchSending}
          onClick={() => { if (!batchSending) setBatchSendOpen(false); }}
          className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] disabled:opacity-50"
        ><EditableText id="misc.btn.50122.취소" defaultText="취소" /></button>
        <button
          disabled={batchSending || !batchSendList.length}
          onClick={async () => {
            setBatchSending(true);
            setBatchSendProgress({ done: 0, total: batchSendList.length, failed: [] });
            const failed = [];
            let mailSetupNeeded = false; // ✉️ 발신 메일 설정이 없으면 멈추고 안내 창만
            for (let idx = 0; idx < batchSendList.length; idx++) {
              const item = batchSendList[idx];
              if (!item.email) {
                const reason = "이메일 없음";
                failed.push({ name: item.name, reason });
                setBatchSendProgress(p => ({ ...p, done: p.done+1, failed: [...p.failed, { name: item.name, reason }] }));
                continue;
              }
              try {
                // 엑셀 생성
                const wsData = (item.mapped||[]).map(m => ({
                  No: m.idx, 날짜: m.상차일, 상차지: m.상차지, 하차지: m.하차지, 경유지: m.경유지,
                  화물명: m.화물명, 기사명: m.기사명, 차량번호: m.차량번호,
                  공급가액: m.공급가액, "세액(10%)": m.세액, 합계: m.공급가액+m.세액,
                }));
                const XLSX = await loadXLSX();
                const wb2 = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(wsData), "거래명세서");
                const excelBase64 = XLSX.write(wb2, { bookType: "xlsx", type: "base64" });
                const attachments = [{
                  filename: `거래명세서_${item.label || item.name}_${item.start}~${item.end}.xlsx`,
                  content: excelBase64,
                  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }];

                // PDF 생성
                try {
                  const invHtml = buildBatchInvoiceHtml(item, COMPANY_PRINT);
                  const div = document.createElement("div");
                  div.style.cssText = "position:absolute;left:-9999px;top:0;width:1100px;overflow:visible;background:#fff";
                  div.innerHTML = invHtml;
                  document.body.appendChild(div);
                  await new Promise(r => setTimeout(r, 200));
                  const canvas = await html2canvas(div, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true });
                  document.body.removeChild(div);
                  const pdf = new (await loadJsPDF())("p", "mm", "a4");
                  addCanvasAsMultiPagePdf(pdf, canvas, { format: "JPEG", quality: 0.85 });
                  attachments.push({
                    filename: `거래명세서_${item.label || item.name}_${item.start}~${item.end}.pdf`,
                    content: pdf.output("datauristring").split(",")[1],
                    contentType: "application/pdf",
                  });
                } catch(pdfErr) { console.error("PDF 생성 실패:", pdfErr); }

                const subject = `[거래명세서] ${item.label || item.name} ${item.start}~${item.end}`; // ⭐ 2026-11-17 구분별 명세서는 label "녹수(녹수셔틀)"
                const totalAmt = (item.totals?.공급가||0)+(item.totals?.세액||0);
                const bodyText = `안녕하세요, ${item.name} 담당자님.\n\n${COMPANY_PRINT.name}입니다.\n\n${item.start}~${item.end} 기간 거래명세서를 발송드립니다.\n\n총 ${item.mapped?.length||0}건\n공급가액: ${(item.totals?.공급가||0).toLocaleString()}원\n부가세: ${(item.totals?.세액||0).toLocaleString()}원\n합계: ${totalAmt.toLocaleString()}원\n\n입금계좌: ${COMPANY_PRINT.bank}\n마감문의: ${COMPANY_PRINT.phone || "-"}\n\n확인 부탁드립니다.\n감사합니다.\n\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`;
                const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;color:#333;line-height:1.8;max-width:600px">${bodyText.split("\n").map(l=>`<p style="margin:0 0 4px 0">${l||"&nbsp;"}</p>`).join("")}</div>`;
                // ✉️ 2026-11-08 회사 메일 계정으로(보내는 사람 이름은 메일 설정 값) — 기록은 서버가 남긴다
                const r = await sendCompanyMail({ to: item.email, subject, html: bodyHtml, attachments, log: { type: "거래명세서", client: item.name, body: bodyText } });
                if (r.ok) {
                  if (!r.logged) logEmail({ type:"거래명세서", client: item.name, to: item.email, subject, body: bodyText, attachmentNames: attachments.map(a=>a.filename), status:"success" });
                  markStmtSent(item.name, item.start, item.end, item.sub || ""); // ⭐ 2026-11-07 단계 보드 — 발송
                } else {
                  const reason = r.error || "보내지 못했어요";
                  failed.push({ name: item.name, reason });
                  if (!r.logged && !isMailSetupNeeded(r)) logEmail({ type:"거래명세서", client: item.name, to: item.email, subject, body: bodyText, attachmentNames: attachments.map(a=>a.filename), status:"failed", error: reason });
                  if (isMailSetupNeeded(r)) { mailSetupNeeded = true; break; } // 설정이 없으면 나머지도 못 보낸다(안내 창이 뜬다)
                }
              } catch(e) {
                const reason = e.message || "네트워크 오류";
                failed.push({ name: item.name, reason });
              }
              setBatchSendProgress(p => ({ ...p, done: p.done+1, failed }));
            }
            setBatchSending(false);
            if (mailSetupNeeded) return;
            if (failed.length === 0) {
              showAlert(`${batchSendList.length}개 업체 발송 완료`);
              setBatchSendList([]);
              setBatchSendOpen(false);
            } else {
              const okN = batchSendList.length - failed.length;
              setBatchSendList(prev => prev.filter(x => failed.some(f => f.name === x.name))); // ⭐ 2026-11-09 보낸 곳은 목록에서 빼고 실패한 곳만 남겨 다시 보낼 수 있게
              showAlert(`발송 결과: 성공 ${okN}곳 · 실패 ${failed.length}곳\n\n실패: ${failed.map(f => `${f.name}(${f.reason})`).join(", ")}`);
            }
          }}
          className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px] hover:bg-[#0F1A30] disabled:opacity-50 transition"
        >{batchSending ? `발송 중 (${batchSendProgress.done}/${batchSendProgress.total})...` : `일괄 발송 (${batchSendList.length}건)`}</button>
        <button
          disabled={batchSending}
          onClick={() => { setBatchSendList([]); setBatchSendOpen(false); }}
          className="px-4 py-2.5 rounded-xl bg-[#F3F6FA] text-[#0B1428] font-bold text-[13px] hover:bg-[#E3E8F0] disabled:opacity-50 transition"
        ><EditableText id="misc.btn.50210.목록 초기화" defaultText="목록 초기화" /></button>
      </div>
    </div>
  </div>
)}

{/* 이메일 발송 모달 */}
          {/* 예약메일함 */}
          {scheduledEmailListOpen && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <div className="text-white font-black text-[18px]">예약메일함</div>
                    <div className="text-white/60 text-[12px] mt-0.5">프로그램을 열어둔 계정이 있을 때 예약시각에 자동 발송됩니다</div>
                  </div>
                  <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={() => setScheduledEmailListOpen(false)}>×</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {scheduledEmailList.length === 0 ? (
                    <div className="py-16 text-center text-[13px] text-[#7A89A3]">예약된 메일이 없습니다.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {scheduledEmailList.map((s) => {
                        const sendAtMs = s.sendAt?.toMillis ? s.sendAt.toMillis() : new Date(s.sendAt || 0).getTime();
                        const statusLabel = { pending: "대기중", sending: "발송 중", sent: "발송완료", failed: "발송실패" }[s.status] || s.status;
                        const statusCls = { pending: "text-[#2D4C82] bg-[#F3F6FA]", sending: "text-[#1B2B4B] bg-[#EEF3FC]", sent: "text-[#0F1A30] bg-[#EEF3FC]", failed: "text-[#0B1428] bg-[#F3F6FA]" }[s.status] || "text-[#7A89A3] bg-[#F8FAFD]";
                        return (
                          <div key={s.id} className="px-6 py-3 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusCls} shrink-0`}>{statusLabel}</span>
                                <span className="font-bold text-[13px] text-[#0F1A30] truncate">{s.type || "예약메일"} · {s.meta?.client || s.to}</span>
                              </div>
                              <div className="text-[11px] text-[#7A89A3] mt-0.5 truncate">
                                {s.to} · {sendAtMs ? new Date(sendAtMs).toLocaleString("ko-KR") : "-"}
                                {s.status === "failed" && s.error && <span className="text-[#0B1428]"> · {s.error}</span>}
                              </div>
                            </div>
                            {s.status === "pending" && (
                              <button
                                onClick={async () => { if (!(await kpConfirm(`${s.meta?.client || s.to} 예약 메일을 취소할까요?\n예약한 시간에 보내지 않아요.`, { title: "예약 취소", okText: "예약 취소", danger: true }))) return; deleteDoc(doc(db, "scheduledEmails", s.id)).catch(() => {}); }} // 🗑 2026-11-20 삭제 확인창
                                className="px-3 py-1.5 rounded-lg border border-[#E3E8F0] text-[11px] font-semibold text-[#7A89A3] hover:bg-[#F3F6FA] hover:text-[#0B1428] hover:border-[#C9D6EE] transition shrink-0"
                              >
                                예약취소
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-[#EEF2F8] shrink-0">
                  <button onClick={() => setScheduledEmailListOpen(false)} className="w-full py-2.5 rounded-xl bg-[#F4F6FA] hover:bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] transition"><EditableText id="misc.btn.50264.닫기" defaultText="닫기" /></button>
                </div>
              </div>
            </div>
          )}

          {emailModalOpen && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>

                {/* 헤더 */}
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <div className="text-white font-black text-[18px]">거래명세서 이메일 발송</div>
                    <div className="text-white/70 text-[14px] mt-0.5">{client} · {mapped.length}건 · {won(합계공급가+합계세액)}원</div>
                  </div>
                  <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={() => setEmailModalOpen(false)}>×</button>
                </div>

                <div className="p-6 space-y-4">
                  {/* 발신 계정 */}
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">발신 계정</label>
                    <MailSenderLine company={userCompany} />{/* ✉️ 2026-11-08 회사 메일 설정 값(예전엔 한 운송사 주소가 고정으로 적혀 있었다) */}
                  </div>

                  {/* 수신 이메일 */}
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">수신 이메일</label>
                    <input autoComplete="off"
                      className="w-full border border-[#D5DDEA] rounded-xl px-3 py-2.5 text-[13px] text-[#0F1A30] outline-none focus:border-[#1B2B4B]"
                      placeholder="거래처 이메일 입력"
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                    />
                  </div>

                  {/* 발송 내용 미리보기 — 편집 가능 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-bold text-[#3A4A66]">발송 내용 미리보기 (직접 수정 가능)</label>
                      <span className="text-[11px] text-[#1B2B4B] font-semibold">편집 가능</span>
                    </div>
                    <textarea
                      className="w-full border border-[#D5DDEA] rounded-xl px-4 py-3 text-[13px] text-[#0F1A30] leading-relaxed resize-none outline-none focus:border-[#1B2B4B] bg-white"
                      rows={10}
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                    />
                  </div>

                  {/* 명함 포함 토글 */}
                  <div className="flex items-center justify-between bg-[#F8FAFD] rounded-xl px-4 py-3 border border-[#E3E8F0]">
                    <div>
                      <div className="text-[13px] font-bold text-[#3A4A66]">명함 이미지 포함</div>
                      <div className="text-[11px] text-[#7A89A3]">{cardImage ? "내 정보에서 등록한 명함이 첨부됩니다" : "명함 미등록 (내 정보에서 업로드)"}</div>
                    </div>
                    <button onClick={() => setIncludeCardInvoice(v => !v)} disabled={!cardImage}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${includeCardInvoice && cardImage ? "bg-[#1B2B4B]" : "bg-[#C9D3E3]"} ${!cardImage ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${includeCardInvoice && cardImage ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  {/* 안내 문구 */}
                  <div className="bg-[#EEF3FC] border border-[#C9D6EE] rounded-lg px-4 py-3 text-[13px] text-[#1B2B4B] font-medium">
                    발송 버튼 클릭 시 거래명세서가 <b>PDF 파일로 자동 첨부</b>되어 발송됩니다.
                  </div>

                  {/* 예약발송 */}
                  <div className="bg-[#F8FAFD] rounded-xl px-4 py-3 border border-[#E3E8F0]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]"
                        checked={emailScheduleOn}
                        onChange={(e) => setEmailScheduleOn(e.target.checked)} />
                      <span className="text-[13px] font-bold text-[#3A4A66]">예약발송</span>
                    </label>
                    {emailScheduleOn && (
                      <DateTimeSelect className="mt-2" dateClassName="w-full h-10 border border-[#E3E8F0] rounded-lg px-3 text-[13px] bg-white focus:outline-none focus:border-[#1B2B4B]" timeClassName="w-full h-10 border border-[#E3E8F0] rounded-lg px-3 text-[13px] bg-white"
                        value={emailScheduleAt}
                        onChange={(e) => setEmailScheduleAt(e.target.value)} />
                    )}
                  </div>
                </div>

                {/* 버튼 */}
                <div className="kp-modal-foot px-6 py-4 flex gap-3">
                <button
                    className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
                    onClick={() => setEmailModalOpen(false)}><EditableText id="misc.btn.50356.취소" defaultText="취소" /></button>
                  <button
                    className="px-4 py-2.5 rounded-xl bg-[#1B2B4B]/10 text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#1B2B4B]/20 transition"
                    onClick={() => setShowEmailHistory(v => !v)}>
                    발송이력 {emailLogs.filter(l=>l.client===client).length > 0 && `(${emailLogs.filter(l=>l.client===client).length})`}
                  </button>
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
                    onClick={() => {
                      navigator.clipboard.writeText(emailBody);
                      showAlert("내용이 클립보드에 복사되었습니다.");
                    }}><EditableText id="misc.btn.50367.내용 복사" defaultText="내용 복사" /></button>
                  <button
                    disabled={!emailTo.trim() || emailSending || (emailScheduleOn && !emailScheduleAt)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-[13px] transition ${emailTo.trim() && !emailSending ? "bg-[#0F1A30] hover:bg-[#1B2B4B] text-white" : "bg-gray-200 text-[#7A89A3] cursor-not-allowed"}`}
                    onClick={async () => {
                      if (!emailTo.trim()) return;
                      if (emailScheduleOn && !emailScheduleAt) return showAlert("예약 발송 시각을 선택하세요.");
                      if (emailScheduleOn && new Date(emailScheduleAt).getTime() <= Date.now()) return showAlert("예약 시각은 현재 시각 이후여야 합니다.");
                      setEmailSending(true);

                      // ★ PDF + 엑셀 동시 생성
                      const fileAttachments = [];

                      // 1) PDF
                      try {
                        await expandInvoicePreview(); const area = document.getElementById("invoiceArea");
                        if (area) {
                          const canvas = await captureInvoiceFull(() => html2canvas(area, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true })); // ⭐ 2026-11-17 원래 크기로 찍기
                          const pdf = new (await loadJsPDF())("p", "mm", "a4");
                          addCanvasAsMultiPagePdf(pdf, canvas, { format: "JPEG", quality: 0.85 });
                          fileAttachments.push({
                            filename: `거래명세서_${stmtTitle}_${start||""}~${end||""}.pdf`,
                            content: pdf.output("datauristring").split(",")[1],
                            contentType: "application/pdf",
                          });
                        }
                      } catch (e) { console.error("PDF 생성 실패:", e); }

                      // 2) 엑셀
                      try {
                        const wsData = mapped.map(m => ({
                          No: m.idx,
                          날짜: m.상차일,
                          상차지: m.상차지,
                          하차지: m.하차지,
                          경유지: m.경유지,
                          화물명: m.화물명,
                          기사명: m.기사명,
                          차량번호: m.차량번호,
                          공급가액: m.공급가액,
                          "세액(10%)": m.세액,
                          합계: m.공급가액 + m.세액,
                        }));
                        const XLSX = await loadXLSX();
                        const wb2 = XLSX.utils.book_new();
                        const ws2 = XLSX.utils.json_to_sheet(wsData);
                        XLSX.utils.book_append_sheet(wb2, ws2, "거래명세서");
                        fileAttachments.push({
                          filename: `거래명세서_${stmtTitle}_${start||""}~${end||""}.xlsx`,
                          content: XLSX.write(wb2, { bookType: "xlsx", type: "base64" }),
                          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        });
                      } catch (e) { console.error("엑셀 생성 실패:", e); }

                      const subject = `[거래명세서] ${stmtTitle} ${start||""}~${end||""}`; // ⭐ 2026-11-17 구분별 명세서면 "녹수(녹수셔틀)"
                      const bodyLines = emailBody.split("\n").map(l => `<p style="margin:0 0 4px 0">${l || "&nbsp;"}</p>`).join("");
                      const cardSectionInvoice = (includeCardInvoice && cardImage) ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/><img src="${cardImage}" alt="명함" style="width:100%;max-width:500px;border-radius:8px;display:block" onerror="this.style.display='none'"/>` : "";
                      const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;color:#333;line-height:1.8;max-width:600px">${bodyLines}${cardSectionInvoice}</div>`;

                      try {
                        if (emailScheduleOn) {
                          if (scheduledEmailAttachSize(fileAttachments) > SCHEDULED_EMAIL_ATTACH_LIMIT) {
                            showAlert("첨부파일(PDF/엑셀) 용량이 너무 커서 예약발송을 지원하지 않습니다. 예약발송 체크를 해제하고 바로 보내주세요.");
                            setEmailSending(false);
                            return;
                          }
                          await scheduleEmailDoc({
                            companyName: userCompany, to: emailTo, subject, html: bodyHtml,
                            attachments: fileAttachments, fromName: "", // ✉️ 보내는 사람 이름은 회사 메일 설정 값 sendAt: new Date(emailScheduleAt),
                            type: "거래명세서", meta: { client, body: emailBody },
                          });
                          logEmail({ type:"거래명세서(예약)", client, to: emailTo, subject, body: emailBody, attachmentNames: fileAttachments.map(f=>f.filename), status:"success" });
                          markStmtSent(client, start, end, stmtSub); // ⭐ 2026-11-07 단계 보드 — 예약도 발송으로
                          showAlert(`${new Date(emailScheduleAt).toLocaleString("ko-KR")}에 발송 예약되었습니다.`);
                          setEmailModalOpen(false);
                          setEmailSending(false);
                          return;
                        }
                        // ✉️ 2026-11-08 회사 메일 계정으로(서버 함수 sendCompanyMail) — 기록은 서버가 남긴다
                        //  (예전 excelData는 예전 서버도 쓰지 않던 값이라 뺐다 · 첨부는 PDF/엑셀 파일 그대로)
                        const r = await sendCompanyMail({
                          to: emailTo,
                          subject,
                          html: bodyHtml,
                          attachments: fileAttachments, // PDF
                          log: { type: "거래명세서", client, body: emailBody },
                        });
                        if (r.ok) {
                          if (!r.logged) logEmail({ type:"거래명세서", client, to: emailTo, subject, body: emailBody, attachmentNames: fileAttachments.map(f=>f.filename), status:"success" });
                          markStmtSent(client, start, end, stmtSub); // ⭐ 2026-11-07 단계 보드 — 발송
                          showAlert(`${emailTo} 로 발송 완료`);
                          setEmailModalOpen(false);
                        } else if (!isMailSetupNeeded(r)) {
                          if (!r.logged) logEmail({ type:"거래명세서", client, to: emailTo, subject, body: emailBody, status:"failed", error: r.error });
                          showAlert(`발송 실패: ${r.error}`);
                        }
                      } catch (e) {
                        showAlert("네트워크 오류로 발송하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
                      } finally {
                        setEmailSending(false);
                      }
                    }}>
                    {emailSending ? "발송 중..." : "발송"}
                  </button>
                </div>
              {/* 발송 이력 */}
              {showEmailHistory && (
                <div className="border-t border-[#EEF2F8] px-6 py-4">
                  <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">발송 이력</div>
                  {emailLogs.filter(l => l.client === client).length === 0 ? (
                    <div className="text-[12px] text-[#7A89A3] text-center py-4">발송 이력이 없습니다</div>
                  ) : (
                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                      {emailLogs.filter(l => l.client === client).map(log => (
                        <SentMailLogItem key={log.id} log={log} onDelete={() => setDeleteLogConfirm(log.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
          {/* 거래처 정보 수정 팝업 */}
          {showEdit && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[460px] overflow-hidden">
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <h3 className="text-white font-black text-[18px]"><EditableText id="popup.title.거래처 정보 수정" defaultText="거래처 정보 수정" /></h3>
                  <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={()=>setShowEdit(false)}>✕</button>
                </div>
                <div className="p-6 space-y-3">
                  {/* 거래처명 - 자동완성 드롭다운 */}
                  <div className="relative">
                    <label className="text-[12px] font-semibold text-[#7A89A3] mb-1 block">거래처명 (검색하면 정보 자동 입력)</label>
                    <input autoComplete="off" className="border border-[#D5DDEA] rounded-xl px-3 py-2 w-full text-[13px] focus:border-[#1B2B4B] outline-none"
                      value={editInfo["거래처명"]||""}
                      onChange={e => { setEditInfo(p=>({...p, 거래처명: e.target.value})); setEditInfoClientDropOpen(true); setEditInfoClientActiveIdx(0); }}
                      onFocus={() => setEditInfoClientDropOpen(true)}
                      onBlur={() => setTimeout(() => setEditInfoClientDropOpen(false), 180)}
                      onKeyDown={e => {
                        const opts = (clients||[]).filter(c => (c.거래처명||"").toLowerCase().includes((editInfo["거래처명"]||"").toLowerCase())).slice(0, 12);
                        if (e.key === "Escape") { setEditInfoClientDropOpen(false); return; }
                        if (e.key === "ArrowDown" && editInfoClientDropOpen) { e.preventDefault(); setEditInfoClientActiveIdx(i => Math.min(i + 1, opts.length - 1)); return; }
                        if (e.key === "ArrowUp" && editInfoClientDropOpen) { e.preventDefault(); setEditInfoClientActiveIdx(i => Math.max(i - 1, 0)); return; }
                        if (e.key === "Enter") {
                          const match = editInfoClientDropOpen ? opts[editInfoClientActiveIdx] : opts[0];
                          if (match) {
                            setEditInfo({ 거래처명: match.거래처명, 사업자번호: match.사업자번호||"", 대표자: match.대표자||match.사업자명||"", 업태: match.업태||"", 종목: match.종목||"", 주소: match.주소||"", 담당자: match.담당자||"", 연락처: match.연락처||"", 이메일: match.이메일||"" });
                            setEditInfoClientDropOpen(false);
                          }
                        }
                        if (e.key === "Tab" && editInfoClientDropOpen) {
                          const match = opts[editInfoClientActiveIdx] || opts[0];
                          if (match) {
                            setEditInfo({ 거래처명: match.거래처명, 사업자번호: match.사업자번호||"", 대표자: match.대표자||match.사업자명||"", 업태: match.업태||"", 종목: match.종목||"", 주소: match.주소||"", 담당자: match.담당자||"", 연락처: match.연락처||"", 이메일: match.이메일||"" });
                            setEditInfoClientDropOpen(false);
                          }
                        }
                      }}
                      placeholder="거래처명 입력 또는 검색"
                    />
                    {editInfoClientDropOpen && (clients||[]).filter(c => (c.거래처명||"").toLowerCase().includes((editInfo["거래처명"]||"").toLowerCase())).length > 0 && (
                      <div className="absolute z-[300] left-0 right-0 top-full mt-1 bg-white border border-[#E3E8F0] rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {(clients||[]).filter(c => (c.거래처명||"").toLowerCase().includes((editInfo["거래처명"]||"").toLowerCase())).slice(0, 12).map((c, i) => (
                          <div key={i}
                            className={`px-4 py-2.5 text-[13px] cursor-pointer flex items-center justify-between border-b border-gray-50 ${i===editInfoClientActiveIdx?"bg-[#EEF3FC]":"hover:bg-[#EEF3FC]"}`}
                            onMouseEnter={() => setEditInfoClientActiveIdx(i)}
                            onMouseDown={e => {
                              e.preventDefault();
                              setEditInfo({ 거래처명: c.거래처명||"", 사업자번호: c.사업자번호||"", 대표자: c.대표자||c.사업자명||"", 업태: c.업태||"", 종목: c.종목||"", 주소: c.주소||"", 담당자: c.담당자||"", 연락처: c.연락처||"", 이메일: c.이메일||"" });
                              setEditInfoClientDropOpen(false);
                            }}>
                            <span className="font-semibold text-[#1B2B4B]">{c.거래처명}</span>
                            {c.이메일 && <span className="text-[#7A89A3] text-[11px]">{c.이메일}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 나머지 필드 */}
                  {["사업자번호","대표자","업태","종목","주소","담당자","연락처","이메일"].map(k=>(
                    <div key={k}>
                      <label className="text-[12px] font-semibold text-[#7A89A3] mb-1 block">{k}</label>
                      <input autoComplete="off" className="border border-[#D5DDEA] rounded-xl px-3 py-2 w-full text-[13px] focus:border-[#1B2B4B] outline-none"
                        value={editInfo[k]||""} onChange={e=>setEditInfo({...editInfo,[k]:e.target.value})} />
                    </div>
                  ))}
                </div>
                <div className="kp-modal-foot px-6 py-4 flex gap-3">
                  <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold" onClick={()=>setShowEdit(false)}><EditableText id="misc.btn.50579.취소" defaultText="취소" /></button>
                  <button className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold" onClick={saveEdit}><EditableText id="misc.btn.50580.저장" defaultText="저장" /></button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ 미수금관리 탭 ══════════════ */}
      {/* ⭐ 2026-11-07 리디자인 — 미수금 데스크: 위 요약(총 미수 · 연령 막대 · 월말 잔액 추이) → 왼쪽 거래처 목록 / 발생 지도 / 월별 원장 → 오른쪽 상세(입금 처리 · 할 일 · 타임라인)
           숫자는 예전 월별 원장(buildMonthRows)과 같은 값이다 */}
      {tab === "unsettledMonth" && (
        <div className="space-y-3">
          {/* 도구 줄 — 기간 · 상태 · 검색 · 보기 · 입금/보고 */}
          <div className={`${csCard} px-4 py-3 flex items-center gap-2 flex-wrap`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[14px] font-black text-[#3A4A66] mr-0.5">청구월</span>
              <CustomSelect className={`${sdInp} !w-[92px]`} value={yearFrom} onChange={e => { setYearFrom(e.target.value); clearSel(); }}>
                {Array.from({ length: 3 }, (_, i) => String(THIS_YEAR - 1 + i)).map(y => <option key={y} value={y}>{y}년</option>)}
              </CustomSelect>
              <CustomSelect className={`${sdInp} !w-[78px]`} value={monthFrom} onChange={e => { setMonthFrom(e.target.value); clearSel(); }}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(mm => <option key={mm} value={mm}>{parseInt(mm, 10)}월</option>)}
              </CustomSelect>
              <span className="text-[14px] font-bold text-[#9AA9C3]">~</span>
              <CustomSelect className={`${sdInp} !w-[92px]`} value={yearTo} onChange={e => { setYearTo(e.target.value); clearSel(); }}>
                {Array.from({ length: 3 }, (_, i) => String(THIS_YEAR - 1 + i)).map(y => <option key={y} value={y}>{y}년</option>)}
              </CustomSelect>
              <CustomSelect className={`${sdInp} !w-[78px]`} value={monthTo} onChange={e => { setMonthTo(e.target.value); clearSel(); }}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(mm => <option key={mm} value={mm}>{parseInt(mm, 10)}월</option>)}
              </CustomSelect>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <button type="button" onClick={() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 11); setYearFrom(String(d.getUTCFullYear())); setMonthFrom(String(d.getUTCMonth() + 1).padStart(2, "0")); setYearTo(String(THIS_YEAR)); setMonthTo("12"); clearSel(); }} className="h-8 px-2.5 rounded-lg bg-[#F4F6FA] text-[13px] font-black text-[#3A4A66] hover:bg-[#EEF2F8]">최근 12개월</button>
              <button type="button" onClick={() => { setYearFrom(String(THIS_YEAR)); setMonthFrom("01"); setYearTo(String(THIS_YEAR)); setMonthTo("12"); clearSel(); }} className="h-8 px-2.5 rounded-lg bg-[#F4F6FA] text-[13px] font-black text-[#3A4A66] hover:bg-[#EEF2F8]">올해</button>
            </div>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => setBankBulkOpen(true)} className={sdBtnPri}><Ico d={IC.upload} size={15} />입금내역 올리기</button>
              <button type="button" onClick={() => setDepositGuideOpen(true)} className={sdBtn}>양식 안내</button>
              <button type="button" onClick={openArReport} className={sdBtn}><Ico d={IC.doc} size={15} />보고서</button>
              <button type="button" onClick={downloadMonthExcel} className={sdBtn}><Ico d={IC.excel} size={15} />엑셀</button>
              <button type="button" onClick={() => { setBatchModalOpen(true); setBatchClients(new Set()); setBatchClientQ(""); }} className={sdBtn}>일괄 정산</button>
            </div>
          </div>

          {/* 🏦 2026-11-08 은행 입금 자동 조회(팝빌) — 입금 확인 필요 N건 · 자동 반영 되돌리기 */}
          <BankReviewQueue company={arCompany} clients={clientOptions8} isViewer={isViewer} />

          <ArOverview total={arKpi.total} supplyTotal={arKpi.supplyTotal} overdue={arKpi.overdue} clientCount={arKpi.clientCount} avgDays={arKpi.avgDays}
            aging={arKpi.aging} trend={arKpi.trend} months={arKpi.months} bucket={arBucket} setBucket={setArBucket} />

          {/* 🖥 2026-11-14 왼쪽 목록 : 오른쪽 상세 = 반반(예전엔 오른쪽이 440px 로 좁아 이력이 잘 안 보였다) · 오른쪽은 화면에 붙어 따라온다 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            <div className={`${csCard} overflow-hidden min-w-0`}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E3E8F0] flex-wrap">
                <div className="inline-flex p-1 rounded-xl bg-[#F4F6FA] border border-[#E3E8F0]">
                  {[["list", "거래처별"], ["map", "발생 지도"], ["ledger", "월별 원장"]].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setArView(k)} className={`h-8 px-3 rounded-lg text-[14px] font-black whitespace-nowrap ${arView === k ? "bg-[#0F1A30] text-white shadow-sm" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}</button>
                  ))}
                </div>
                {arView !== "ledger" && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <button type="button" onClick={() => setArStatusF("")} className={`h-8 px-2.5 rounded-lg text-[13px] font-black ${!arStatusF ? "bg-[#EEF3FB] text-[#0F1A30]" : "text-[#5B6B85] hover:bg-[#F4F6FA]"}`}>전체 {arOpenClients.length}</button>
                    {Object.keys(AR_STATUS).map(st => (
                      <button key={st} type="button" onClick={() => setArStatusF(arStatusF === st ? "" : st)} className={`h-8 px-2.5 rounded-lg text-[13px] font-black inline-flex items-center gap-1.5 ${arStatusF === st ? "bg-[#EEF3FB] text-[#0F1A30]" : "text-[#5B6B85] hover:bg-[#F4F6FA]"}`}>
                        <span className="w-2 h-2 rounded-full" style={{ background: AR_STATUS[st].dot }} />{st} {arStatusCounts[st] || 0}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative ml-auto w-full sm:w-[220px]">
                  <Ico d={IC.search} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" />
                  <input autoComplete="off" value={arQ} onChange={(e) => setArQ(e.target.value)} placeholder="거래처 검색" className={`${sdInp} pl-9`} />
                </div>
              </div>
              {arView === "list" && <ArClientList rows={arShown} sel={arSel} onSel={(c) => pickArClient(c === arSel ? "" : c)} sort={arSortBy} setSort={setArSortBy} />}
              {arView === "map" && <div className="p-3"><ArAccrualMap rows={arShown} months={arMonthsInRange} sel={arSel} onSel={(c) => pickArClient(c === arSel ? "" : c)} /></div>}
              {arView === "ledger" && (
                <div>
            {/* ── 오른쪽: 월별 정산 원장 ── */}
            <div className="min-w-0">
              <div className={`overflow-hidden flex flex-col max-h-[calc(100vh-420px)] min-h-[300px]`}>
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#E3E8F0] bg-white flex-wrap">
                  <div className="min-w-0 mr-auto">
                    <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3] leading-none" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>LEDGER · MONTHLY · {yearFrom}.{monthFrom} – {yearTo}.{monthTo}</div>
                    <div className="text-[13.5px] font-black text-[#0F1A30] mt-1 leading-none truncate">
                      {selClient || "거래처를 선택하세요"}
                      {selClient === AR_ALL && <span className="ml-1.5 text-[12px] font-bold text-[#5B6B85]">· 거래처별·월별로 한 줄씩</span>}
                      {selClient && selClient !== AR_ALL && <span className="ml-1.5 text-[12px] font-bold text-[#5B6B85]">· 월별 정산 현황</span>}
                    </div>
                  </div>
                  {/* ⭐ 정산 처리 버튼은 원장 바로 위 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#9AA9C3] mr-0.5" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>SETTLE</span>
                    <button type="button" onClick={settleSelected} disabled={!selectedMonths.size} className={csBtnPri}>
                      선택 정산완료{selectedMonths.size ? ` (${selectedMonths.size})` : ""}
                    </button>
                    <button type="button" onClick={settleAll} disabled={!monthRows.length} className={csBtn}>전체 정산완료</button>
                    <button type="button" onClick={() => { setBatchModalOpen(true); setBatchClients(new Set()); setBatchClientQ(""); }} className={csBtn}>일괄 정산처리</button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="text-[12.5px] w-full" style={{ tableLayout: "fixed", minWidth: selClient === AR_ALL ? 1060 : 920 }}>
                    <colgroup>
                      <col style={{width:"36px"}} />
                      {selClient === AR_ALL && <col style={{width:"140px"}} />}
                      <col style={{width:"44px"}} />
                      <col style={{width:"76px"}} />
                      <col style={{width:"50px"}} />
                      <col style={{width:"108px"}} />
                      <col style={{width:"96px"}} />
                      <col style={{width:"96px"}} />
                      <col style={{width:"92px"}} />
                      <col style={{width:"62px"}} />
                      <col style={{width:"92px"}} />
                      <col style={{width:"84px"}} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th
                          className="sticky top-0 z-10 bg-[#0F1A30] px-2 py-2.5 text-white text-center cursor-pointer select-none"
                          onClick={() => toggleAllMonths(monthRows)}
                        >
                          <input autoComplete="off"
                            type="checkbox"
                            className="accent-[#8FB0F0] cursor-pointer"
                            onChange={() => toggleAllMonths(monthRows)}
                            checked={selectedMonths.size > 0 && selectedMonths.size === monthRows.length}
                            onClick={e => e.stopPropagation()}
                          />
                        </th>
                        {[...(selClient === AR_ALL ? ["거래처"] : []), "순번","청구월","건수","총 청구금액","입금액","잔액","결제 예정일","경과","정산상태","정산일","메모"].map(label=>(
                          <SortTh key={label} k={label} sort={arSort.sort} onSort={arSort.toggle} className="sticky top-0 z-10 bg-[#0F1A30] px-2 py-2.5 text-white text-[12px] font-bold text-center whitespace-nowrap"><EditableText id={`settlement.monthly.header.${label}`} defaultText={label} /></SortTh>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!selClient ? (
                        <tr><td colSpan={13} className="text-center text-[#9AA9C3] py-16 text-[13px] font-bold">왼쪽에서 거래처를 검색하세요.</td></tr>
                      ) : monthRows.length === 0 ? (
                        <tr><td colSpan={13} className="text-center text-[#9AA9C3] py-16 text-[13px] font-bold">표시할 데이터가 없습니다.</td></tr>
                      ) : (
                        monthRowsSorted.map((row, idx) => (
                          <tr key={row.k} className={`border-b border-[#EEF2F8] transition ${selectedMonths.has(row.k) ? "bg-[#EEF2F8]" : "hover:bg-[#F8FAFD]"}`}>
                            <td
                              className="px-2 py-2.5 text-center cursor-pointer select-none"
                              onClick={() => toggleMonthSelect(row.k)}
                            >
                              <input autoComplete="off"
                                type="checkbox"
                                className="accent-[#0F1A30] cursor-pointer"
                                checked={selectedMonths.has(row.k)}
                                onChange={() => toggleMonthSelect(row.k)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            {selClient === AR_ALL && <td className="px-2 py-2.5 font-bold text-[#0F1A30] truncate" title={row.거래처명}>{row.거래처명}</td>}
                            <td className="px-2 py-2.5 text-center text-[#9AA9C3] tabular-nums">{idx+1}</td>
                            <td className="px-2 py-2.5 text-center font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{row.yyyymm}</td>
                            <td className="px-2 py-2.5 text-center text-[#5B6B85] tabular-nums">{row.건수}건</td>
                            <td className="px-2 py-2.5 text-right font-bold tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                              <span className={row.총청구금액>0?"text-[#0F1A30]":"text-[#9AA9C3]"}>
                                {won(row.총청구금액)}
                              </span>
                            </td>
                            {(() => {
                              const 공급청구 = row.총청구금액;
                              const 청구VAT = Math.round(공급청구 * 1.1);
                              const 입금 = row.정산상태 === "정산완료" ? 청구VAT : (row.입금누계 || 0);
                              const 잔 = row.정산상태 === "정산완료" ? 0 : Math.max(0, 청구VAT - 입금);
                              const rule = ((clients || []).find((c) => c.거래처명 === (row.거래처명 || selClient)) || {}).결제일;
                              const due = arDueDate(row.yyyymm, rule);
                              const over = due && 잔 > 0 ? Math.floor((Date.now() - new Date(`${due}T23:59:59+09:00`).getTime()) / 86400000) : null;
                              return (<>
                                <td className="px-2 py-2.5 text-right tabular-nums text-[#3A4A66]" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{입금 ? `${won(입금)}` : "-"}</td>
                                <td className={`px-2 py-2.5 text-right tabular-nums ${잔 ? "font-black text-[#0F1A30]" : "text-[#9AA9C3]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{잔 ? won(잔) : "0"}</td>
                                <td className="px-2 py-2.5 text-center tabular-nums text-[#3A4A66]" style={{ fontSize: 12 }}>{due || <span className="text-[#C9D3E3] text-[11px]">결제일 미설정</span>}</td>
                                <td className="px-2 py-2.5 text-center">{over == null ? <span className="text-[#C9D3E3]">-</span> : over > 0 ? <span className="px-1.5 py-0.5 rounded-md bg-[#FDECEC] text-[#B42318] text-[11px] font-black tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>D+{over}</span> : <span className="text-[11.5px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>D{over === 0 ? "-day" : over}</span>}</td>
                              </>);
                            })()}
                            <td className="px-2 py-2.5 text-center cursor-pointer select-none"
                              onClick={()=>toggleMonthStatus(row)} title="클릭하여 상태 전환">
                              <span className={`inline-flex items-center h-6 px-2.5 rounded-md text-[11.5px] font-black whitespace-nowrap ${
                                row.정산상태==="정산완료" ? "bg-[#0F1A30] text-white"
                                : row.정산상태==="진행중" || row.정산상태==="일부입금" ? "bg-[#2D4C82] text-white"
                                : "bg-white text-[#1B2B4B] border border-[#8FB0F0]"
                              }`}>
                                {row.정산상태}
                              </span>
                              {row.정산상태 === "일부입금" && <div className="mt-1 text-[10.5px] text-[#5B6B85] whitespace-nowrap tabular-nums">입금 {won(row.입금누계)} · 잔액 {won(row.잔액)}</div>}
                            </td>
                            <td className="px-2 py-2.5 text-center text-[#5B6B85] tabular-nums" style={{ fontSize: 12 }}>{row.정산일||"-"}</td>
                            <td className="px-2 py-2">
                              <input autoComplete="off"
                                className="h-8 w-full rounded-lg border border-[#DCE3EE] bg-white px-2 text-[12px] outline-none focus:border-[#1B2B4B]"
                                placeholder="메모 입력"
                                value={memoMap[row.k]||""}
                                onChange={e=>setMemoMap(p=>({...p,[row.k]:e.target.value}))}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-[#E3E8F0] bg-[#F8FAFD] text-[11px] text-[#9AA9C3]">· 정산상태 클릭 시 해당 월 전체 오더에 정산상태/정산일이 저장됩니다.</div>
              </div>
            </div>
                </div>
              )}
            </div>
            {/* 오른쪽 상세 — 휴대폰에서는 아래에서 올라오는 화면 */}
            {(() => {
              const detail = (
                <ArDetail data={arCur ? { ...arCur, timeline: arTimeline } : null} note={arCur?.note} isViewer={isViewer}
                  onClose={csPhone ? () => pickArClient("") : undefined}
                  onSaveNote={arSaveNote} onQuickPay={arQuickPay} quickPreview={arQuickPlan} onRemind={openArEmail} onReport={openArReport}
                  info={arCur ? <ArClientInfo client={(clients || []).find((c) => c.거래처명 === arCur.client)} name={arCur.client} upsertClient={upsertClient} isViewer={isViewer} /> : null}
                  closeBar={arCur && arCur.client ? <ArCloseBar name={arCur.client} company={(localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim()} isViewer={isViewer} /> : null}
                  ledger={arCur ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[13px] text-[#9AA9C3]">상태를 누르면 그 달 전체 오더가 바뀌어요</span>
                        <button type="button" onClick={settleSelected} disabled={!selectedMonths.size || isViewer} className={`${sdBtnPri} ml-auto h-9`}>선택 정산완료{selectedMonths.size ? ` (${selectedMonths.size})` : ""}</button>
                      </div>
                      <div className="rounded-xl border border-[#E3E8F0] overflow-hidden">
                        <table className="kp-sd w-full" style={{ tableLayout: "fixed" }}>
                          <colgroup><col style={{ width: 34 }} /><col style={{ width: 70 }} /><col /><col /><col style={{ width: 88 }} /></colgroup>
                          <thead><tr className="bg-[#F4F6FA] text-[13px] text-[#5B6B85]"><th className="px-2 py-2" /><th className="px-2 py-2 text-left font-black">청구월</th><th className="px-2 py-2 text-right font-black">청구(VAT)</th><th className="px-2 py-2 text-right font-black">잔액</th><th className="px-2 py-2 text-center font-black">상태</th></tr></thead>
                          <tbody>
                            {monthRows.filter(r => r.거래처명 === arCur.client).map(r => {
                              const 청구VAT = Math.round((r.총청구금액 || 0) * 1.1);
                              const 잔 = r.정산상태 === "정산완료" ? 0 : r.잔액;
                              return (
                                <tr key={r.k} className={`border-t border-[#EEF2F8] ${selectedMonths.has(r.k) ? "bg-[#EEF3FB]" : ""}`}>
                                  <td className="px-2 py-2 text-center"><input type="checkbox" aria-label={`${r.yyyymm} 선택`} className="w-4 h-4 accent-[#0F1A30]" checked={selectedMonths.has(r.k)} onChange={() => toggleMonthSelect(r.k)} /></td>
                                  <td className="px-2 py-2 text-[14px] font-black text-[#0F1A30] tabular-nums">{r.yyyymm.slice(2).replace("-", ".")}</td>
                                  <td className="px-2 py-2 text-right text-[14px] text-[#3A4A66] tabular-nums">{won(청구VAT)}</td>
                                  <td className={`px-2 py-2 text-right text-[14px] tabular-nums ${잔 ? "font-black text-[#0F1A30]" : "text-[#9AA9C3]"}`}>{won(잔)}</td>
                                  <td className="px-2 py-2 text-center">
                                    <button type="button" disabled={isViewer || r.정산상태 === "진행중"} onClick={() => toggleMonthStatus(r)} title="눌러서 정산완료 ↔ 미정산"
                                      className={`h-7 px-2 rounded-lg text-[13px] font-black whitespace-nowrap ${r.정산상태 === "정산완료" ? "bg-[#0F1A30] text-white" : r.정산상태 === "일부입금" ? "bg-[#2D4C82] text-white" : r.정산상태 === "진행중" ? "bg-[#F4F6FA] text-[#9AA9C3]" : "bg-white text-[#1B2B4B] border border-[#8FB0F0]"}`}>{r.정산상태}</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null} />
              );
              if (csPhone) return arCur ? createPortal(<div className="fixed inset-0 z-[9000] bg-[#F4F6FA] overflow-y-auto p-3 pb-24">{detail}</div>, document.body) : null;
              return <div className="min-w-0 xl:sticky xl:top-3">{detail}</div>;
            })()}
          </div>
                {bankBulkOpen && createPortal(
                  <BulkUploadChooser
                    title="입금 내역 대용량 업로드"
                    subtitle="은행 거래내역 엑셀을 올리면 미정산 월과 자동으로 맞춰 입금 처리합니다."
                    templateDesc="거래일·적요(입금자명)·입금액·잔액·비고 열이 있는 양식을 받습니다. 은행에서 받은 거래내역 엑셀을 그대로 올려도 됩니다."
                    templateTips={["입금자명이 거래처명과 같거나 포함되면 자동 매칭", "부가세 포함 금액 기준"]}
                    uploadDesc="엑셀을 고르면 매칭 결과를 먼저 보여드리고, 확인 후 정산완료·일부입금으로 반영합니다."
                    uploadTips={["입금액이 모자라면 일부입금으로", "매칭 안 된 입금은 따로 표시"]}
                    onClose={() => setBankBulkOpen(false)}
                    onTemplate={async () => {
                      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
                      const ws = XLSX.utils.aoa_to_sheet([["거래일", "적요(입금자명)", "입금액", "잔액", "비고"], ["2026-10-05", "(주)예시물류", 1100000, 5100000, "9월 운송료"], ["2026-10-06", "홍길동상사", 550000, 5650000, ""]]);
                      ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
                      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "입금내역");
                      XLSX.writeFile(wb, "입금확인_양식.xlsx");
                    }}
                    onFile={(e) => { const f = e.target.files?.[0]; setBankBulkOpen(false); if (f) handleBankExcelUpload({ target: { files: [f], value: "" } }); }}
                  />, document.body)}
                {depositGuideOpen && createPortal(
                  <div className="kp-modal fixed inset-0 z-[1000000] bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onClick={() => setDepositGuideOpen(false)}>
                    <div className="w-full max-w-[760px] max-h-[88vh] overflow-y-auto bg-white rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)]" onClick={(e) => e.stopPropagation()}>
                      <div className="sticky top-0 px-6 py-4 bg-gradient-to-r from-[#0F1A30] via-[#1B2B4B] to-[#2D4C82] text-white flex items-center justify-between">
                        <div><div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">GUIDE</div><div className="text-[17px] font-black">입금확인 엑셀 양식 안내</div></div>
                        <button onClick={() => setDepositGuideOpen(false)} className="w-8 h-8 rounded-lg bg-white/10">✕</button>
                      </div>
<div className="p-6">
            
            <p className="mb-4 text-[14px] text-[#5B6B85] leading-relaxed">
              아래와 같은 형식의 <b className="text-[#1B2B4B]">기업은행 거래내역 엑셀</b> 파일을 업로드하면 자동으로 미정산 건과 매칭합니다.
            </p>

            {/* 예시 테이블 */}
            <div className="overflow-x-auto mb-5">
              <table className="w-full border-2 border-[#D5DDEA] text-center text-[14px]">
                <thead className="bg-[#1B2B4B] text-white">
                  <tr>
                    <th className="border border-[#2d4a7a] px-4 py-3 font-bold"><EditableText id="settlement.bankSample.header.거래일" defaultText="거래일" /></th>
                    <th className="border border-[#2d4a7a] px-4 py-3 font-bold"><EditableText id="settlement.bankSample.header.적요" defaultText="적요(입금자명)" /></th>
                    <th className="border border-[#2d4a7a] px-4 py-3 font-bold"><EditableText id="settlement.bankSample.header.입금액" defaultText="입금액" /></th>
                    <th className="border border-[#2d4a7a] px-4 py-3 font-bold"><EditableText id="settlement.bankSample.header.잔액" defaultText="잔액" /></th>
                    <th className="border border-[#2d4a7a] px-4 py-3 font-bold"><EditableText id="settlement.bankSample.header.비고" defaultText="비고" /></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="border border-[#E3E8F0] px-4 py-3 font-medium text-[#3A4A66]">2026-04-25</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 font-bold text-[#1B2B4B]">거해</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 font-extrabold text-[#0F1A30]">3,234,000</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 text-[#7A89A3]">15,420,000</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 text-[#7A89A3]"></td>
                  </tr>
                  <tr className="bg-[#F8FAFD]/80">
                    <td className="border border-[#E3E8F0] px-4 py-3 font-medium text-[#3A4A66]">2026-04-28</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 font-bold text-[#1B2B4B]">㈜대한물류</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 font-extrabold text-[#0F1A30]">5,500,000</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 text-[#7A89A3]">20,920,000</td>
                    <td className="border border-[#E3E8F0] px-4 py-3 text-[#7A89A3]"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 사용 방법 */}
            <div className="space-y-2.5 mb-5">
              <div className="flex items-start gap-3 bg-white border border-[#E3E8F0] rounded-xl px-4 py-3">
                <span className="w-7 h-7 rounded-full bg-[#1B2B4B] text-white text-[13px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span className="text-[14px] text-[#3A4A66] font-medium">
                  기업은행 인터넷뱅킹 → <b className="text-[#1B2B4B]">조회</b> → <b className="text-[#1B2B4B]">거래내역조회</b> → 기간 설정 후 <b className="text-[#1B2B4B]">엑셀저장</b>
                </span>
              </div>
              <div className="flex items-start gap-3 bg-white border border-[#E3E8F0] rounded-xl px-4 py-3">
                <span className="w-7 h-7 rounded-full bg-[#1B2B4B] text-white text-[13px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span className="text-[14px] text-[#3A4A66] font-medium">
                  위 <b className="text-[#1B2B4B] bg-[#1B2B4B]/10 px-1.5 py-0.5 rounded">입금확인 (엑셀)</b> 버튼 클릭 → 저장한 파일 선택
                </span>
              </div>
              <div className="flex items-start gap-3 bg-white border border-[#E3E8F0] rounded-xl px-4 py-3">
                <span className="w-7 h-7 rounded-full bg-[#1B2B4B] text-white text-[13px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span className="text-[14px] text-[#3A4A66] font-medium">
                  <b className="text-[#0F1A30]">입금액</b>과 미정산 월 청구금액(세액포함)이 일치하면 <b className="text-[#0F1A30]">자동 매칭</b>됩니다
                </span>
              </div>
              <div className="flex items-start gap-3 bg-white border border-[#E3E8F0] rounded-xl px-4 py-3">
                <span className="w-7 h-7 rounded-full bg-[#1B2B4B] text-white text-[13px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
                <span className="text-[14px] text-[#3A4A66] font-medium">
                  <b className="text-[#1B2B4B]">적요(입금자명)</b>와 거래처명이 유사하면 신뢰도 <b className="text-[#0F1A30]">"높음"</b>으로 표시됩니다
                </span>
              </div>
            </div>

            {/* 매칭 기준 요약 */}
            <div className="p-4 bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#1B2B4B] font-semibold">
                <span>※ <b>매칭 기준:</b> 입금액 = 월 총청구금액 × 1.1 (세액포함) ±10원 허용</span>
                <span className="text-[#9AA9C3]">|</span>
                <span><b>지원 파일:</b> .xlsx, .xls, .csv</span>
                <span className="text-[#9AA9C3]">|</span>
                <span><b>필수 컬럼:</b> 입금액 + 적요(또는 입금자명)</span>
              </div>
            </div>
          </div>
                    </div>
                  </div>, document.body)}
        </div>
      )}
      {tab === "unsettledMonth" && (
        <div>

          {/* 미수금 보고서 기간 + 거래처 선택 */}
{arReportOpen && (
  <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]"
    onClick={() => setArReportOpen(false)}>
    <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[580px] max-h-[85vh] flex flex-col overflow-hidden"
      onClick={e => e.stopPropagation()}>

      {/* 헤더 */}
      <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="text-white font-black text-[18px]">미수금 보고서 출력</div>
          <div className="text-white/50 text-[12px] mt-0.5">기간과 거래처를 선택하고 출력하세요</div>
        </div>
        <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center"
          onClick={() => setArReportOpen(false)}>×</button>
      </div>

      {/* 기간 선택 */}
      <div className="px-6 pt-4 pb-3 border-b border-[#EEF2F8] shrink-0">
        <div className="text-[12px] font-bold text-[#7A89A3] mb-2">조회 기간</div>
        <div className="flex items-center gap-2">
          <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
            value={arFromYear} onChange={e => setArFromYear(e.target.value)}>
            {Array.from({length:3},(_,i)=>String(THIS_YEAR - 1 + i)).map(y=>(
              <option key={y} value={y}>{y}년</option>
            ))}
          </CustomSelect>
          <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
            value={arFromMM} onChange={e => setArFromMM(e.target.value)}>
            {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"00")).map(mm=>(
              <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
            ))}
          </CustomSelect>
          <span className="text-[#7A89A3] font-semibold">부터</span>
          <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
            value={arToYear} onChange={e => setArToYear(e.target.value)}>
            {Array.from({length:3},(_,i)=>String(THIS_YEAR - 1 + i)).map(y=>(
              <option key={y} value={y}>{y}년</option>
            ))}
          </CustomSelect>
          <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
            value={arToMM} onChange={e => setArToMM(e.target.value)}>
            {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"00")).map(mm=>(
              <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
            ))}
          </CustomSelect>
          <span className="text-[#7A89A3] font-semibold">까지</span>
        </div>
      </div>

      {/* ★ 거래처 범위 선택 */}
      <div className="px-6 pt-4 pb-3 border-b border-[#EEF2F8] shrink-0">
        <div className="text-[12px] font-bold text-[#7A89A3] mb-2">거래처 범위</div>
        <div className="flex gap-2 mb-3">
          <button
            className={`flex-1 py-2 rounded-lg text-[13px] font-bold transition ${
              arReportMode === "all"
                ? "bg-[#1B2B4B] text-white"
                : "bg-[#F4F6FA] text-[#5B6B85] hover:bg-[#F4F6FA]"
            }`}
            onClick={() => { setArReportMode("all"); setArReportClients(new Set()); }}
          >
            전체 거래처
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-[13px] font-bold transition ${
              arReportMode === "selected"
                ? "bg-[#1B2B4B] text-white"
                : "bg-[#F4F6FA] text-[#5B6B85] hover:bg-[#F4F6FA]"
            }`}
            onClick={() => setArReportMode("selected")}
          >
            특정 거래처 선택
          </button>
        </div>

        {arReportMode === "selected" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <input autoComplete="off"
                className="flex-1 border border-[#D5DDEA] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]"
                placeholder="거래처명 검색..."
                value={arReportClientQ}
                onChange={e => setArReportClientQ(e.target.value)}
              />
              <button
                className="px-3 py-2 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B] hover:text-white transition"
                onClick={() => {
                  const filtered = clientOptions8.filter(name =>
                    !arReportClientQ.trim() || name.toLowerCase().includes(arReportClientQ.toLowerCase())
                  );
                  if (arReportClients.size === filtered.length) setArReportClients(new Set());
                  else setArReportClients(new Set(filtered));
                }}
              >
                {arReportClients.size > 0 ? "전체해제" : "전체선택"}
              </button>
            </div>
            <div className="max-h-[180px] overflow-y-auto border border-[#E3E8F0] rounded-xl p-2 space-y-1">
              {clientOptions8
                .filter(name => !arReportClientQ.trim() || name.toLowerCase().includes(arReportClientQ.toLowerCase()))
                .map(name => {
                  const checked = arReportClients.has(name);
                  return (
                    <div key={name}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition select-none ${
                        checked ? "bg-[#1B2B4B]/5 border border-[#1B2B4B]/30" : "hover:bg-[#F8FAFD]"
                      }`}
                      onClick={() => setArReportClients(prev => {
                        const n = new Set(prev);
                        n.has(name) ? n.delete(name) : n.add(name);
                        return n;
                      })}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                        checked ? "border-[#1B2B4B] bg-[#1B2B4B]" : "border-[#D5DDEA]"
                      }`}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 12 12"><path d="M1 6l3.5 3.5L11 2"/></svg>}
                      </div>
                      <span className="text-[13px] font-medium text-[#0F1A30]">{name}</span>
                    </div>
                  );
                })}
            </div>
            {arReportClients.size > 0 && (
              <div className="mt-2 text-[12px] text-[#1B2B4B] font-semibold">
                {arReportClients.size}개 거래처 선택됨
              </div>
            )}
          </>
        )}
      </div>

      {/* 옵션 */}
      <div className="px-6 pt-3 pb-4 shrink-0 space-y-3">
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition select-none ${
            arOnlyUnsettled ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : "border-[#E3E8F0] bg-[#F8FAFD]"
          }`}
          onClick={() => setArOnlyUnsettled(p => !p)}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
            arOnlyUnsettled ? "border-[#1B2B4B] bg-[#1B2B4B]" : "border-[#D5DDEA]"
          }`}>
            {arOnlyUnsettled && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 12 12"><path d="M1 6l3.5 3.5L11 2"/></svg>}
          </div>
          <div>
            <div className="text-[13px] font-bold text-[#3A4A66]">미수금 있는 거래처만 출력</div>
            <div className="text-[11px] text-[#7A89A3] mt-0.5">정산완료된 거래처는 보고서에서 제외됩니다</div>
          </div>
        </div>

        <div className="text-[12px] text-[#7A89A3] bg-[#F8FAFD] rounded-lg px-4 py-3">
          {arReportMode === "all"
            ? <>거래처 <b className="text-[#1B2B4B]">{clientOptions8.length}개사</b> 전체 대상</>
            : <>선택된 <b className="text-[#1B2B4B]">{arReportClients.size}개사</b> 대상</>
          }
          <br/>선택 기간의 미정산/정산완료 금액이 월별로 표시됩니다
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="kp-modal-foot px-6 py-4 flex gap-3 shrink-0">
        <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
          onClick={() => setArReportOpen(false)}><EditableText id="misc.btn.51069.취소" defaultText="취소" /></button>
        <button
          disabled={arReportMode === "selected" && arReportClients.size === 0}
          className={`flex-1 py-2.5 rounded-xl font-bold text-[13px] transition ${
            arReportMode === "all" || arReportClients.size > 0
              ? "bg-violet-600 text-white hover:bg-violet-700"
              : "bg-gray-200 text-[#7A89A3] cursor-not-allowed"
          }`}
          onClick={handleARReport}
        >
          보고서 출력
        </button>
      </div>
    </div>
  </div>
)}

{/* 일괄 정산 로딩 */}
          {batchLoading && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[999999]">
              <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[260px]">
                <div className="w-12 h-12 border-4 border-[#1B2B4B]/20 border-t-[#1B2B4B] rounded-full animate-spin" />
                <div className="text-[15px] font-bold text-[#1B2B4B]">정산 처리 중...</div>
                <div className="text-[12px] text-[#7A89A3] text-center">
                  데이터 양에 따라 시간이 걸릴 수 있습니다.<br />잠시만 기다려 주세요.
                </div>
              </div>
            </div>
          )}
{/* ══ 일괄 정산 모달 ══ */}
          {batchModalOpen && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]"
              onClick={() => setBatchModalOpen(false)}>
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[680px] max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* 헤더 */}
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <div className="text-white font-bold text-[16px]">일괄 정산처리</div>
                    <div className="text-white/50 text-[12px] mt-0.5">
                      거래처와 기간을 선택하고 정산완료 또는 미정산으로 일괄 변경합니다
                    </div>
                  </div>
                  <button className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg"
                    onClick={() => setBatchModalOpen(false)}>×</button>
                </div>

                {/* 기간 선택 */}
                <div className="px-6 py-4 border-b border-[#EEF2F8] shrink-0">
                  <div className="text-[12px] font-bold text-[#7A89A3] mb-2">기간 선택</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
                      value={batchFromYear} onChange={e => setBatchFromYear(e.target.value)}>
                      {Array.from({length:3},(_,i)=>String(THIS_YEAR - 1 + i)).map(y=>(
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </CustomSelect>
                    <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
                      value={batchFromMM} onChange={e => setBatchFromMM(e.target.value)}>
                      {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>(
                        <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
                      ))}
                    </CustomSelect>
                    <span className="text-[#7A89A3] font-semibold">부터</span>
                    <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
                      value={batchToYear} onChange={e => setBatchToYear(e.target.value)}>
                      {Array.from({length:3},(_,i)=>String(THIS_YEAR - 1 + i)).map(y=>(
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </CustomSelect>
                    <CustomSelect className="border-2 border-[#1B2B4B] rounded-lg px-2 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
                      value={batchToMM} onChange={e => setBatchToMM(e.target.value)}>
                      {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>(
                        <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
                      ))}
                    </CustomSelect>
                    <span className="text-[#7A89A3] font-semibold">까지</span>
                  </div>
                </div>

                {/* 거래처 검색 + 전체선택 */}
                <div className="px-6 pt-4 shrink-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-[12px] font-bold text-[#7A89A3]">
                      거래처 선택
                      <span className="ml-2 text-[#1B2B4B]">({batchClients.size}/{batchEligibleClients.length})</span>
                      <span className="ml-1 text-[#7A89A3] font-normal">(미수금 있는 업체만)</span>
                    </div>
                    <button
                      className="ml-auto px-3 py-1 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-bold hover:bg-[#1B2B4B] hover:text-white transition"
                      onClick={() => {
                        if (batchClients.size === batchEligibleClients.length) setBatchClients(new Set());
                        else setBatchClients(new Set(batchEligibleClients));
                      }}>
                      {batchClients.size === batchEligibleClients.length ? "전체 해제" : "전체 선택"}
                    </button>
                  </div>
                  <input autoComplete="off"
                    className="w-full border border-[#D5DDEA] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] mb-2"
                    placeholder="거래처명 검색..."
                    value={batchClientQ}
                    onChange={e => setBatchClientQ(e.target.value)}
                  />
                </div>

                {/* 거래처 목록 */}
                <div className="flex-1 overflow-y-auto px-6 pb-4">
                  <div className="grid grid-cols-2 gap-2">
                    {batchEligibleClients
                      .filter(name => !batchClientQ.trim() || name.toLowerCase().includes(batchClientQ.toLowerCase()))
                      .map(name => {
                        const checked = batchClients.has(name);
                        const unsettledCount = batchUnsettledMap.get(name) || 0;
                        return (
                          <div key={name}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition select-none ${
                              checked
                                ? "border-[#1B2B4B] bg-[#1B2B4B]/5"
                                : "border-[#E3E8F0] hover:border-[#D5DDEA] bg-white"
                            }`}
                            onClick={() => setBatchClients(prev => {
                              const n = new Set(prev);
                              n.has(name) ? n.delete(name) : n.add(name);
                              return n;
                            })}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                              checked ? "border-[#1B2B4B] bg-[#1B2B4B]" : "border-[#D5DDEA]"
                            }`}>
                              {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 12 12"><path d="M1 6l3.5 3.5L11 2"/></svg>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-bold text-[#0F1A30] truncate">{name}</div>
                            </div>
                            {unsettledCount > 0 && (
                              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3F6FA] text-[#2D4C82]">
                                미정산 {unsettledCount}개월
                              </span>
                            )}
                          </div>
                        );
                      })}
                    {batchEligibleClients.filter(name => !batchClientQ.trim() || name.toLowerCase().includes(batchClientQ.toLowerCase())).length === 0 && (
                      <div className="col-span-2 text-center text-[#7A89A3] text-[13px] py-8">검색 결과가 없습니다</div>
                    )}
                  </div>
                </div>

                {/* 하단 버튼 */}
                <div className="px-6 py-4 border-t border-[#EEF2F8] bg-[#F8FAFD] shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="text-[12px] text-[#7A89A3] font-semibold mr-auto">
                      {batchClients.size > 0
                        ? `${batchClients.size}개 거래처 × ${batchFromYear}년 ${parseInt(batchFromMM,10)}월~${batchToYear}년 ${parseInt(batchToMM,10)}월 (전체 ${batchEligibleClients.length}개 중)`
                        : "거래처를 선택하세요"}
                    </div>
                    <button
                      className="px-5 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#5B6B85] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
                      onClick={() => setBatchModalOpen(false)}>
                      취소
                    </button>
                    <button
                      disabled={!batchClients.size}
                      className={`px-5 py-2.5 rounded-xl font-bold text-[13px] transition ${
                        batchClients.size
                          ? "bg-[#2D4C82] hover:bg-[#1B2B4B] text-white"
                          : "bg-gray-200 text-[#7A89A3] cursor-not-allowed"
                      }`}
                      onClick={() => handleBatchSettle("미정산")}>
                      미정산으로 변경
                    </button>
                    <button
                      disabled={!batchClients.size}
                      className={`px-5 py-2.5 rounded-xl font-bold text-[13px] transition ${
                        batchClients.size
                          ? "bg-[#0F1A30] hover:bg-[#1B2B4B] text-white"
                          : "bg-gray-200 text-[#7A89A3] cursor-not-allowed"
                      }`}
                      onClick={() => handleBatchSettle("정산완료")}>
                      정산완료로 변경
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ★ 입금 매칭 결과 팝업 */}

          {bankMatchResult && (() => {
            const ms = bankMatchResult.matches;
            const autoCount = ms.filter(m => m.confidence === "이름일치" || m.confidence === "별칭").length;
            const KIND = { "정산완료": "bg-[#0F1A30] text-white", "여러 달 정산": "bg-[#0F1A30] text-white", "정산+일부입금": "bg-[#2D4C82] text-white", "일부입금": "bg-[#EEF3FB] text-[#1B2B4B]", "초과입금": "border border-[#0F1A30] text-[#0F1A30]" };
            return (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]" onClick={() => setBankMatchResult(null)}>
              <div className="bg-[#F7F9FC] rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] w-full max-w-[760px] max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 bg-gradient-to-r from-[#0F1A30] via-[#1B2B4B] to-[#2D4C82] text-white flex items-start justify-between gap-3 shrink-0">
                  <div>
                    <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">DEPOSIT MATCHING</div>
                    <div className="text-[19px] font-black">입금 자동 매칭</div>
                    <div className="text-[12.5px] text-white/70 mt-0.5">입금 {bankMatchResult.deposits.length}건 · 찾음 {ms.length}건 · 확인 필요 {bankMatchResult.unmatched.length}건</div>
                  </div>
                  <button className="w-8 h-8 rounded-lg bg-white/10 text-white shrink-0" onClick={() => setBankMatchResult(null)}>✕</button>
                </div>
                <div className="overflow-y-auto p-5 space-y-3">
                  {ms.length > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] text-[#5B6B85]">다 채운 달은 <b className="text-[#0F1A30]">정산완료</b>, 모자란 달은 <b className="text-[#0F1A30]">일부입금</b>(잔액 표시)으로 반영됩니다.</div>
                      {autoCount > 0 && <button onClick={applyAllBankMatches} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black shrink-0">이름 맞은 {autoCount}건 모두 반영</button>}
                    </div>
                  )}
                  {ms.map((m, idx) => (
                    <div key={idx} className="bg-white rounded-2xl border border-[#E3E8F0] px-4 py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-black text-[#0F1A30]">{m.client}</span>
                            <span className={`text-[11.5px] font-extrabold px-2 py-0.5 rounded-full ${KIND[m.kind] || "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{m.kind}</span>
                            <span className={`text-[11px] font-bold ${m.confidence !== "금액만 일치" ? "text-[#4B6CB7]" : "text-[#0F1A30] underline"}`}>{m.confidence === "별칭" ? "배운 입금자명" : m.confidence === "이름일치" ? "입금자명 일치" : "금액만 일치 (입금자 확인)"}</span>
                          </div>
                          <div className="text-[12.5px] text-[#5B6B85] mt-0.5">{m.deposit.date} · 입금자 {m.deposit.name || "-"} · <b className="text-[#0F1A30]">{m.deposit.amount.toLocaleString()}원</b></div>
                        </div>
                        <button onClick={() => applyBankMatch(m)} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[12.5px] font-black shrink-0">반영</button>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {m.alloc.map(a => (
                          <span key={a.k} className={`text-[12px] font-bold px-2.5 py-1 rounded-lg ${a.full ? "bg-[#F5F8FD] text-[#0F1A30] border border-[#E3E8F0]" : "bg-white text-[#1B2B4B] border border-dashed border-[#4B6CB7]"}`}>
                            {a.yyyymm} · {a.amount.toLocaleString()}원 {a.full ? "→ 정산완료" : `→ 일부입금 (청구 ${a.due.toLocaleString()}원)`}
                          </span>
                        ))}
                        {m.over > 0 && <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg border border-[#0F1A30] text-[#0F1A30]">초과 {m.over.toLocaleString()}원 (확인 필요)</span>}
                      </div>
                    </div>
                  ))}
                  {bankMatchResult.unmatched.length > 0 && (
                    <div className="bg-white rounded-2xl border border-dashed border-[#C9D2E0] px-4 py-3.5">
                      <div className="text-[13.5px] font-black text-[#0F1A30] mb-2">확인 필요 {bankMatchResult.unmatched.length}건</div>
                      <div className="space-y-1.5">
                        {bankMatchResult.unmatched.map((d, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12.5px] text-[#3A4A66]">
                            <span className="font-bold text-[#0F1A30] tabular-nums">{d.amount.toLocaleString()}원</span>
                            <span>{d.name || "-"}</span>
                            <span className="text-[#9AA9C3]">{d.date}</span>
                            <span className="text-[#7A879C]">· {d.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!ms.length && !bankMatchResult.unmatched.length && <div className="py-10 text-center text-[13.5px] text-[#9AA9C3]">입금 내역이 없습니다</div>}
                </div>
              </div>
            </div>
            );
          })()}

          {/* ══ 미수금 이메일 발송 모달 ══ */}
          {arEmailOpen && (
            <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[99999]">
              <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[580px] max-h-[92vh] overflow-y-auto">

                {/* 헤더 */}
                <div className="kp-modal-head px-6 py-4 flex items-center justify-between shrink-0">
                  <div>
                    <div className="text-white font-black text-[18px]">미수금 이메일 발송</div>
                    <div className="text-white/70 text-[14px] mt-0.5">{selClient} · {THIS_YEAR}년 미수금 현황</div>
                  </div>
                  <button aria-label="닫기" className="kp-modal-x shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[20px] leading-none flex items-center justify-center" onClick={() => { setArEmailOpen(false); setShowEmailHistory(false); }}>×</button>
                </div>

                <div className="p-6 space-y-4">

                  {/* 월 범위 선택 — 이미지1 스타일 */}
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-2 block">기간 선택 ({THIS_YEAR}년)</label>
                    <div className="flex items-center gap-2">
                      <CustomSelect
                        className="border-2 border-[#1B2B4B] rounded-lg px-3 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
                        value={arEmailFromMM}
                        onChange={e => {
                          const f = e.target.value;
                          setArEmailFromMM(f);
                          const from2 = parseInt(f,10), to2 = parseInt(arEmailToMM,10);
                          const fr = monthRowsRaw.filter(r => { const m=parseInt(r.mm,10); return m>=from2&&m<=to2&&r.정산상태==="미정산"; });
                          const amt = fr.reduce((s,r)=>s+r.총청구금액,0);
                          setEmailBody(`안녕하세요, ${selClient} 담당자님.\n\n${COMPANY_PRINT.name}입니다.\n\n${THIS_YEAR}년 ${from2}월~${to2}월 미수금 현황을 안내드립니다.\n\n미정산 월수: ${fr.length}개월\n미정산 금액: ${amt.toLocaleString()}원\n\n${fr.map(r=>`  - ${r.yyyymm} : ${r.총청구금액.toLocaleString()}원`).join("\n")}\n\n입금계좌: ${COMPANY_PRINT.bank}\n\n정산 부탁드립니다.\n감사합니다.\n\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`);
                        }}
                      >
                        {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>(
                          <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
                        ))}
                      </CustomSelect>
                      <span className="text-[13px] font-semibold text-[#5B6B85]">부터</span>
                      <CustomSelect
                        className="border-2 border-[#1B2B4B] rounded-lg px-3 py-2 text-[13px] font-bold text-[#1B2B4B] outline-none"
                        value={arEmailToMM}
                        onChange={e => {
                          const t = e.target.value;
                          setArEmailToMM(t);
                          const from2 = parseInt(arEmailFromMM,10), to2 = parseInt(t,10);
                          const fr = monthRowsRaw.filter(r => { const m=parseInt(r.mm,10); return m>=from2&&m<=to2&&r.정산상태==="미정산"; });
                          const amt = fr.reduce((s,r)=>s+r.총청구금액,0);
                          setEmailBody(`안녕하세요, ${selClient} 담당자님.\n\n${COMPANY_PRINT.name}입니다.\n\n${THIS_YEAR}년 ${from2}월~${to2}월 미수금 현황을 안내드립니다.\n\n미정산 월수: ${fr.length}개월\n미정산 금액: ${amt.toLocaleString()}원\n\n${fr.map(r=>`  - ${r.yyyymm} : ${r.총청구금액.toLocaleString()}원`).join("\n")}\n\n입금계좌: ${COMPANY_PRINT.bank}\n\n정산 부탁드립니다.\n감사합니다.\n\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`);
                        }}
                      >
                        {Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(mm=>(
                          <option key={mm} value={mm}>{parseInt(mm,10)}월</option>
                        ))}
                      </CustomSelect>
                      <span className="text-[13px] font-semibold text-[#5B6B85]">까지</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {[["상반기","01","06"],["하반기","07","12"],["전체","01","12"]].map(([label,f,t])=>(
                        <button key={label}
                          className="flex-1 py-1.5 rounded-lg bg-white border border-[#D5DDEA] text-[#1B2B4B] text-[12px] font-semibold hover:bg-[#1B2B4B] hover:text-white transition"
                          onClick={() => {
                            setArEmailFromMM(f); setArEmailToMM(t);
                            const from2=parseInt(f,10), to2=parseInt(t,10);
                            const fr = monthRowsRaw.filter(r => { const m=parseInt(r.mm,10); return m>=from2&&m<=to2&&r.정산상태==="미정산"; });
                            const amt = fr.reduce((s,r)=>s+r.총청구금액,0);
                            setEmailBody(`안녕하세요, ${selClient} 담당자님.\n\n${COMPANY_PRINT.name}입니다.\n\n${THIS_YEAR}년 ${from2}월~${to2}월 미수금 현황을 안내드립니다.\n\n미정산 월수: ${fr.length}개월\n미정산 금액: ${amt.toLocaleString()}원\n\n${fr.map(r=>`  - ${r.yyyymm} : ${r.총청구금액.toLocaleString()}원`).join("\n")}\n\n입금계좌: ${COMPANY_PRINT.bank}\n\n정산 부탁드립니다.\n감사합니다.\n\n${COMPANY_PRINT.name}\n${COMPANY_PRINT.contact}`);
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const from=parseInt(arEmailFromMM,10), to=parseInt(arEmailToMM,10);
                      const fr = monthRowsRaw.filter(r=>{const m=parseInt(r.mm,10);return m>=from&&m<=to&&r.정산상태==="미정산";});
                      const amt = fr.reduce((s,r)=>s+r.총청구금액,0);
                      return fr.length > 0 ? (
                        <div className="mt-2 px-3 py-2 bg-[#F3F6FA] border border-[#C9D6EE] rounded-lg text-[12px] text-[#0B1428] font-semibold">
                          선택 범위 미정산: {fr.length}개월 / {amt.toLocaleString()}원
                        </div>
                      ) : (
                        <div className="mt-2 px-3 py-2 bg-[#EEF3FC] border border-[#8FB0F0] rounded-lg text-[12px] text-[#0F1A30] font-semibold">
                          선택 범위 내 미정산 건이 없습니다
                        </div>
                      );
                    })()}
                  </div>

                  {/* 발신 계정 */}
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">발신 계정</label>
                    <MailSenderLine company={userCompany} />{/* ✉️ 2026-11-08 회사 메일 설정 값 */}
                  </div>

                  {/* 수신 이메일 */}
                  <div>
                    <label className="text-[13px] font-bold text-[#3A4A66] mb-1 block">수신 이메일</label>
                    <input autoComplete="off"
                      className="w-full border border-[#D5DDEA] rounded-xl px-3 py-2.5 text-[13px] text-[#0F1A30] outline-none focus:border-[#1B2B4B]"
                      placeholder="거래처 이메일 입력"
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                    />
                  </div>

                  {/* 발송 내용 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-bold text-[#3A4A66]">발송 내용 (직접 수정 가능)</label>
                      <span className="text-[11px] text-[#1B2B4B] font-semibold">편집 가능</span>
                    </div>
                    <textarea
                      className="w-full border border-[#D5DDEA] rounded-xl px-4 py-3 text-[13px] text-[#0F1A30] font-medium leading-relaxed resize-none outline-none focus:border-[#1B2B4B] bg-white"
                      rows={10}
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                    />
                  </div>

                  {/* 명함 포함 토글 */}
                  <div className="flex items-center justify-between bg-[#F8FAFD] rounded-xl px-4 py-3 border border-[#E3E8F0]">
                    <div>
                      <div className="text-[13px] font-bold text-[#3A4A66]">명함 이미지 포함</div>
                      <div className="text-[11px] text-[#7A89A3]">{cardImage ? "내 정보에서 등록한 명함이 첨부됩니다" : "명함 미등록 (내 정보에서 업로드)"}</div>
                    </div>
                    <button onClick={() => setIncludeCardAr(v => !v)} disabled={!cardImage}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${includeCardAr && cardImage ? "bg-[#1B2B4B]" : "bg-[#C9D3E3]"} ${!cardImage ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${includeCardAr && cardImage ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  {/* 안내 */}
                  <div className="bg-[#EEF3FC] border border-[#C9D6EE] rounded-lg px-4 py-3 text-[13px] text-[#1B2B4B] font-medium">
                    선택한 월 범위의 미수금 내역이 <b>엑셀 + 미수금 보고서 PDF</b> 로 자동 첨부됩니다.
                  </div>

                  {/* 예약발송 */}
                  <div className="bg-[#F8FAFD] rounded-xl px-4 py-3 border border-[#E3E8F0]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#1B2B4B]"
                        checked={emailScheduleOn}
                        onChange={(e) => setEmailScheduleOn(e.target.checked)} />
                      <span className="text-[13px] font-bold text-[#3A4A66]">예약발송</span>
                    </label>
                    {emailScheduleOn && (
                      <DateTimeSelect className="mt-2" dateClassName="w-full h-10 border border-[#E3E8F0] rounded-lg px-3 text-[13px] bg-white focus:outline-none focus:border-[#1B2B4B]" timeClassName="w-full h-10 border border-[#E3E8F0] rounded-lg px-3 text-[13px] bg-white"
                        value={emailScheduleAt}
                        onChange={(e) => setEmailScheduleAt(e.target.value)} />
                    )}
                  </div>
                </div>

                {/* 버튼 */}
                <div className="px-6 pb-4 flex gap-3">
                  <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
                    onClick={() => { setArEmailOpen(false); setShowEmailHistory(false); }}><EditableText id="misc.btn.51501.취소" defaultText="취소" /></button>
                  <button className="px-4 py-2.5 rounded-xl bg-[#1B2B4B]/10 text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#1B2B4B]/20 transition"
                    onClick={() => setShowEmailHistory(v => !v)}>
                    발송이력{emailLogs.filter(l=>l.client===selClient).length>0 ? ` (${emailLogs.filter(l=>l.client===selClient).length})` : ""}
                  </button>
                  <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
                    onClick={() => { navigator.clipboard.writeText(emailBody); showAlert("복사되었습니다."); }}><EditableText id="misc.btn.51507.내용 복사" defaultText="내용 복사" /></button>
                  <button
                    disabled={!emailTo.trim() || emailSending || (emailScheduleOn && !emailScheduleAt)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-[13px] transition ${emailTo.trim()&&!emailSending ? "bg-[#0F1A30] hover:bg-[#1B2B4B] text-white" : "bg-gray-200 text-[#7A89A3] cursor-not-allowed"}`}
                    onClick={async () => {
                      if (!emailTo.trim()) return;
                      if (emailScheduleOn && !emailScheduleAt) return showAlert("예약 발송 시각을 선택하세요.");
                      if (emailScheduleOn && new Date(emailScheduleAt).getTime() <= Date.now()) return showAlert("예약 시각은 현재 시각 이후여야 합니다.");
                      setEmailSending(true);
                      const from=parseInt(arEmailFromMM,10), to=parseInt(arEmailToMM,10);
                      const filteredMonthRows = monthRowsRaw.filter(r => { const m=parseInt(r.mm,10); return m>=from&&m<=to; });
                      const subject = `[미수금현황] ${selClient} ${THIS_YEAR}년 ${from}월~${to}월`;
                      const fileAttachments = [];

                      // 1) 엑셀
                      try {
                        const wsData = filteredMonthRows.map(r => ({
                          청구월: r.yyyymm, 건수: r.건수,
                          총청구금액: r.총청구금액, 정산상태: r.정산상태, 정산일: r.정산일||"",
                        }));
                        const XLSX = await loadXLSX();
                        const wb2 = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(wsData), "미수금현황");
                        fileAttachments.push({
                          filename: `미수금현황_${selClient}_${THIS_YEAR}_${from}~${to}월.xlsx`,
                          content: XLSX.write(wb2, { bookType:"xlsx", type:"base64" }),
                          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        });
                      } catch(e) { console.error("엑셀 실패:", e); }

                      // 2) 미수금 보고서 PDF
                      try {
                        const months2 = Array.from({length: to-from+1}, (_,i) => `${THIS_YEAR}-${String(from+i).padStart(2,"0")}`);
                        const reportHtmlBody = `
                          <div style="font-family:'Malgun Gothic',sans-serif;background:#f9fafb;padding:24px;min-width:700px">
                            <div style="background:#1B2B4B;color:#fff;padding:16px 24px;border-radius:10px 10px 0 0">
                              <div style="font-size:18px;font-weight:900">${selClient} 미수금 현황</div>
                              <div style="font-size:12px;opacity:.7;margin-top:4px">${THIS_YEAR}년 ${from}월 ~ ${to}월</div>
                            </div>
                            <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 10px 10px;overflow:hidden">
                              <thead>
                                <tr style="background:#e8ecf5">
                                  <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">월</th>
                                  <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">건수</th>
                                  <th style="padding:10px 12px;text-align:right;font-size:13px;border-bottom:2px solid #c5cee0">청구금액</th>
                                  <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">정산상태</th>
                                  <th style="padding:10px 12px;text-align:center;font-size:13px;border-bottom:2px solid #c5cee0">정산일</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${filteredMonthRows.map((r,i) => `
                                  <tr style="background:${i%2===0?'#fff':'#f8f9fd'}">
                                    <td style="padding:9px 12px;text-align:center;font-size:13px;border-bottom:1px solid #e8ecf5;font-weight:bold">${r.yyyymm}</td>
                                    <td style="padding:9px 12px;text-align:center;font-size:13px;border-bottom:1px solid #e8ecf5">${r.건수}건</td>
                                    <td style="padding:9px 12px;text-align:right;font-size:13px;border-bottom:1px solid #e8ecf5;font-weight:bold">${r.총청구금액.toLocaleString()}원</td>
                                    <td style="padding:9px 12px;text-align:center;border-bottom:1px solid #e8ecf5">
                                      <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold;${r.정산상태==='정산완료'?'background:#d1fae5;color:#065f46':'background:#fee2e2;color:#991b1b'}">
                                        ${r.정산상태}
                                      </span>
                                    </td>
                                    <td style="padding:9px 12px;text-align:center;font-size:12px;color:#6b7280;border-bottom:1px solid #e8ecf5">${r.정산일||'-'}</td>
                                  </tr>
                                `).join("")}
                              </tbody>
                              <tfoot>
                                <tr style="background:#1B2B4B">
                                  <td colspan="2" style="padding:11px 12px;text-align:center;color:#fff;font-weight:bold;font-size:13px">합 계</td>
                                  <td style="padding:11px 12px;text-align:right;color:#fde68a;font-weight:bold;font-size:14px">${filteredMonthRows.reduce((s,r)=>s+r.총청구금액,0).toLocaleString()}원</td>
                                  <td colspan="2" style="padding:11px 12px;text-align:center;color:rgba(255,255,255,.6);font-size:12px">
                                    미정산: ${filteredMonthRows.filter(r=>r.정산상태==="미정산").reduce((s,r)=>s+r.총청구금액,0).toLocaleString()}원
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                            <div style="margin-top:12px;text-align:right;font-size:11px;color:#9ca3af">
                              출력일시: ${new Date().toLocaleString("ko-KR")} | ${COMPANY_PRINT.name}
                            </div>
                          </div>`;

                        const div = document.createElement("div");
                        div.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:760px;background:#f9fafb;";
                        div.innerHTML = reportHtmlBody;
                        document.body.appendChild(div);
                        await new Promise(r => setTimeout(r, 300));
                        const canvas = await html2canvas(div, { scale:1.5, backgroundColor:"#f9fafb", useCORS:true });
                        document.body.removeChild(div);
                        const imgData = canvas.toDataURL("image/jpeg", 0.88);
                        const pdf = new (await loadJsPDF())("p","mm","a4");
                        const imgW = 210, imgH = (canvas.height * imgW) / canvas.width;
                        let left = imgH, pos = 0;
                        pdf.addImage(imgData,"JPEG",0,pos,imgW,imgH);
                        left -= 297;
                        while (left > 0) { pos = left-imgH; pdf.addPage(); pdf.addImage(imgData,"JPEG",0,pos,imgW,imgH); left -= 297; }
                        fileAttachments.push({
                          filename: `미수금보고서_${selClient}_${THIS_YEAR}_${from}~${to}월.pdf`,
                          content: pdf.output("datauristring").split(",")[1],
                          contentType: "application/pdf",
                        });
                      } catch(e) { console.error("PDF 실패:", e); }

                      const bodyLines = emailBody.split("\n").map(l=>`<p style="margin:0 0 4px 0">${l||"&nbsp;"}</p>`).join("");
                      const cardSectionAr = (includeCardAr && cardImage) ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/><img src="${cardImage}" alt="명함" style="width:100%;max-width:500px;border-radius:8px;display:block" onerror="this.style.display='none'"/>` : "";
                      const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;color:#333;line-height:1.8;max-width:600px">${bodyLines}${cardSectionAr}</div>`;
                      try {
                        if (emailScheduleOn) {
                          if (scheduledEmailAttachSize(fileAttachments) > SCHEDULED_EMAIL_ATTACH_LIMIT) {
                            showAlert("첨부파일(PDF/엑셀) 용량이 너무 커서 예약발송을 지원하지 않습니다. 예약발송 체크를 해제하고 바로 보내주세요.");
                            setEmailSending(false);
                            return;
                          }
                          await scheduleEmailDoc({
                            companyName: userCompany, to: emailTo, subject, html: bodyHtml,
                            attachments: fileAttachments, fromName: "", // ✉️ 보내는 사람 이름은 회사 메일 설정 값 sendAt: new Date(emailScheduleAt),
                            type: "미수금", meta: { client: selClient, body: emailBody },
                          });
                          logEmail({ type:"미수금(예약)", client:selClient, to:emailTo, subject, body: emailBody, status:"success" });
                          showAlert(`${new Date(emailScheduleAt).toLocaleString("ko-KR")}에 발송 예약되었습니다.`);
                          setArEmailOpen(false);
                          setShowEmailHistory(false);
                          setEmailSending(false);
                          return;
                        }
                        // ✉️ 2026-11-08 회사 메일 계정으로 — 기록은 서버가 남긴다
                        const r = await sendCompanyMail({ to: emailTo, subject, html: bodyHtml, attachments: fileAttachments, log: { type: "미수금", client: selClient, body: emailBody } });
                        if (r.ok) {
                          if (!r.logged) logEmail({ type:"미수금", client:selClient, to:emailTo, subject, body: emailBody, status:"success" });
                          showAlert(`${emailTo} 로 발송 완료`);
                          setArEmailOpen(false);
                          setShowEmailHistory(false);
                        } else if (!isMailSetupNeeded(r)) {
                          if (!r.logged) logEmail({ type:"미수금", client:selClient, to:emailTo, subject, body: emailBody, status:"failed", error: r.error });
                          showAlert(`발송 실패: ${r.error || "오류"}`);
                        }
                      } catch(e) {
                        logEmail({ type:"미수금", client:selClient, to:emailTo, subject, body: emailBody, status:"failed", error: e.message });
                        showAlert("네트워크 오류로 발송하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
                      }
                      finally { setEmailSending(false); }
                    }}>
                    {emailSending ? "발송 중..." : "발송"}
                  </button>
                </div>

                {/* 발송 이력 */}
                {showEmailHistory && (
                  <div className="border-t border-[#EEF2F8] px-6 py-4">
                    <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">
                      발송 이력 · {selClient}
                    </div>
                    {emailLogs.filter(l=>l.client===selClient).length === 0 ? (
                      <div className="text-[12px] text-[#7A89A3] text-center py-4">발송 이력이 없습니다</div>
                    ) : (
                      <div className="space-y-2 max-h-[320px] overflow-y-auto">
                        {emailLogs.filter(l=>l.client===selClient).map(log => (
                          <SentMailLogItem key={log.id} log={log} onDelete={() => setDeleteLogConfirm(log.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ 메일함 탭(📥 2026-11-14 보낸메일함 → 메일함: 보낸메일 · 받은메일 · 발송 실패) ══════════════ */}
      {tab === "sentmails" && (
        <div>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap" data-mail-folders>
            {[["sent", "보낸메일", emailLogs.length], ["inbox", "받은메일", null], ["failed", "발송 실패", emailLogs.filter(l => l.status === "failed").length]].map(([k, l, c]) => (
              <button key={k} type="button" onClick={() => { setMailFolder(k); setSelectedMails(new Set()); }}
                className={`h-10 px-4 rounded-xl text-[14px] font-black inline-flex items-center gap-1.5 border transition ${mailFolder === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#D5DDEA] hover:border-[#1B2B4B]"}`}>
                {l}{c != null && <span className={`text-[12px] tabular-nums ${mailFolder === k ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`}>{c}</span>}
              </button>
            ))}
          </div>
          {mailFolder === "inbox" ? <React.Suspense fallback={<div className="py-16 text-center text-[13.5px] text-[#7A89A3]">불러오는 중…</div>}><CompanyInboxLazy company={(localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || "").trim()} /></React.Suspense> : (<div>
          {/* 상단 툴바 */}
          <div className="bg-white rounded-xl border border-[#E3E8F0] shadow-sm p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* 제목 + 통계 */}
              <div className="flex items-center gap-3 mr-auto">
                <div>
                  <div className="text-[15px] font-extrabold text-[#1B2B4B]">{mailFolder === "failed" ? "발송 실패" : "보낸메일"}</div>
                  <div className="text-[11px] text-[#7A89A3] mt-0.5">총 {emailLogs.length}건 · 성공 {emailLogs.filter(l=>l.status==="success").length}건 · 실패 {emailLogs.filter(l=>l.status==="failed").length}건</div>
                </div>
                {/* 유형별 카운트 배지 */}
                <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                  {["거래명세서","미수금","일반이메일"].map(t => {
                    const cnt = emailLogs.filter(l=>l.type===t).length;
                    return cnt > 0 ? (
                      <button key={t}
                        onClick={() => setMailTypeFilter(mailTypeFilter === t ? "전체" : t)}
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border transition ${mailTypeFilter === t ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "text-[#7A89A3] border-[#D5DDEA] hover:border-[#1B2B4B] hover:text-[#1B2B4B]"}`}
                      >{t} {cnt}</button>
                    ) : null;
                  })}
                </div>
              </div>
              {/* 검색 */}
              <div className="relative">
                <input autoComplete="off"
                  className="border border-[#D5DDEA] rounded-xl pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] min-w-[220px]"
                  placeholder="제목, 본문, 받는사람, 거래처 검색..."
                  value={mailSearch}
                  onChange={e => { setMailSearch(e.target.value); setSelectedMails(new Set()); }}
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A89A3]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              {/* 정렬 */}
              <CustomSelect
                className="border border-[#D5DDEA] rounded-xl px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]"
                value={mailSort}
                onChange={e => setMailSort(e.target.value)}
              >
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
              </CustomSelect>
              {/* 전체 유형 선택 */}
              <CustomSelect
                className="border-2 border-[#1B2B4B] rounded-lg px-3 py-2 text-[13px] font-semibold text-[#1B2B4B] outline-none"
                value={mailTypeFilter}
                onChange={e => { setMailTypeFilter(e.target.value); setSelectedMails(new Set()); }}
              >
                <option value="전체">전체 유형</option>
                <option value="거래명세서">거래명세서</option>
                <option value="미수금">미수금</option>
                <option value="일반이메일">일반이메일</option>
              </CustomSelect>
            </div>
            {/* 선택/삭제 액션 바 */}
            {selectedMails.size > 0 && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#EEF2F8]">
                <span className="text-[13px] font-semibold text-[#1B2B4B]">{selectedMails.size}건 선택됨</span>
                <button
                  onClick={() => setSelectedMails(new Set(filteredMails.map(l=>l.id)))}
                  className="text-[12px] text-[#7A89A3] hover:text-[#1B2B4B] underline"
                >전체선택 ({filteredMails.length})</button>
                <button
                  onClick={() => setSelectedMails(new Set())}
                  className="text-[12px] text-[#7A89A3] hover:text-[#3A4A66] underline"
                ><EditableText id="misc.btn.51744.선택해제" defaultText="선택해제" /></button>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="ml-auto px-4 py-1.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-bold hover:bg-[#0B1428] transition"
                ><EditableText id="misc.btn.51748.선택 삭제" defaultText="선택 삭제" /></button>
              </div>
            )}
          </div>

          {/* 메일 클라이언트 레이아웃 */}
          <div className="flex gap-4" style={{minHeight:"560px"}}>
            {/* 왼쪽: 메일 목록 */}
            <div className="w-[320px] shrink-0 bg-white rounded-xl border border-[#E3E8F0] shadow-sm overflow-hidden flex flex-col">
              <div className="bg-[#1B2B4B] px-4 py-2.5 text-white font-bold text-[13px] flex items-center gap-2">
                <input autoComplete="off"
                  type="checkbox"
                  checked={filteredMails.length > 0 && selectedMails.size === filteredMails.length}
                  onChange={() => {
                    if (selectedMails.size === filteredMails.length) setSelectedMails(new Set());
                    else setSelectedMails(new Set(filteredMails.map(l=>l.id)));
                  }}
                  className="w-3.5 h-3.5 cursor-pointer"
                />
                <span className="flex-1">발송 목록</span>
                <span className="text-white/60 font-normal text-[12px]">{filteredMails.length}건</span>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  disabled={emailLogs.length === 0}
                  title="전체 삭제"
                  className="text-white/50 hover:text-[#8FB0F0] transition disabled:opacity-30 text-[11px] font-semibold"
                ><EditableText id="misc.btn.51774.전체삭제" defaultText="전체삭제" /></button>
              </div>
              <div className="overflow-y-auto flex-1">
                {filteredMails.length === 0 ? (
                  <div className="text-center text-[#7A89A3] py-16 text-[13px]">
                    {mailSearch || mailTypeFilter !== "전체" ? "검색 결과가 없습니다" : "발송된 메일이 없습니다"}
                  </div>
                ) : (
                  filteredMails.map(log => (
                    <div
                      key={log.id}
                      className={`flex items-start px-3 py-3 border-b border-[#EEF2F8] cursor-pointer transition group ${
                        selectedMail?.id === log.id
                          ? "bg-[#e8edf5] border-l-4 border-l-[#1B2B4B]"
                          : selectedMails.has(log.id)
                          ? "bg-[#EEF3FC] border-l-4 border-l-[#2D4C82]"
                          : "hover:bg-[#F8FAFD] border-l-4 border-l-transparent"
                      }`}
                    >
                      <input autoComplete="off"
                        type="checkbox"
                        checked={selectedMails.has(log.id)}
                        onChange={e => {
                          e.stopPropagation();
                          setSelectedMails(prev => {
                            const n = new Set(prev);
                            if (n.has(log.id)) n.delete(log.id); else n.add(log.id);
                            return n;
                          });
                        }}
                        onClick={e => e.stopPropagation()}
                        className="mt-1 mr-2.5 shrink-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0" onClick={() => setSelectedMail(log)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${log.status === "success" ? "bg-[#1B2B4B] text-white" : "bg-[#0B1428] text-white"}`}>
                            {log.type || "메일"}
                          </span>
                          <span className="text-[12px] text-[#7A89A3] shrink-0 ml-1">{log.sentAt ? new Date(log.sentAt).toLocaleDateString("ko-KR", {month:"2-digit",day:"2-digit"}) : ""}</span>
                        </div>
                        <div className="text-[13px] font-semibold text-[#0F1A30] truncate">{log.subject || "(제목없음)"}</div>
                        <div className="text-[12px] text-[#7A89A3] truncate">{log.to || "-"}</div>
                        {log.client && log.client !== "-" && (
                          <div className="text-[11px] text-[#1B2B4B]/60 truncate">{log.client}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 오른쪽: 메일 상세 */}
            <div className="flex-1 bg-white rounded-xl border border-[#E3E8F0] shadow-sm overflow-hidden flex flex-col min-w-0">
              {!selectedMail ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#7A89A3]">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-30"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <div className="text-[14px]">왼쪽 목록에서 메일을 선택하세요</div>
                  {selectedMails.size > 0 && (
                    <div className="mt-2 text-[12px] text-[#1B2B4B] font-semibold">{selectedMails.size}건 선택됨 · 위의 선택삭제 버튼으로 삭제</div>
                  )}
                </div>
              ) : (
                <>
                  {/* 메일 헤더 */}
                  <div className="bg-[#f4f6f9] border-b border-[#E3E8F0] px-6 py-4 shrink-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-[16px] font-extrabold text-[#1B2B4B] leading-tight flex-1 pr-4">
                        {selectedMail.subject || "(제목없음)"}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${selectedMail.status === "success" ? "bg-[#EEF3FC] text-[#0F1A30]" : "bg-[#F3F6FA] text-[#0B1428]"}`}>
                          {selectedMail.status === "success" ? "발송완료" : "발송실패"}
                        </span>
                        <button onClick={() => setSelectedMail(null)} className="text-[#7A89A3] hover:text-[#5B6B85] text-xl leading-none w-7 h-7 flex items-center justify-center hover:bg-[#F4F6FA] rounded transition">×</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] mb-2">
                      <div className="flex gap-2"><span className="text-[#7A89A3] font-semibold w-12 shrink-0">발신</span><span className="text-[#3A4A66] truncate">{selectedMail.sentBy || "-"}</span></div>
                      <div className="flex gap-2"><span className="text-[#7A89A3] font-semibold w-12 shrink-0">수신</span><span className="text-[#3A4A66] break-all">{selectedMail.to || "-"}</span></div>
                      <div className="flex gap-2"><span className="text-[#7A89A3] font-semibold w-12 shrink-0">유형</span><span className="text-[#3A4A66]">{selectedMail.type || "-"}</span></div>
                      <div className="flex gap-2"><span className="text-[#7A89A3] font-semibold w-12 shrink-0">발송일</span><span className="text-[#3A4A66]">{selectedMail.sentAt ? new Date(selectedMail.sentAt).toLocaleString("ko-KR") : "-"}</span></div>
                      {selectedMail.client && selectedMail.client !== "-" && (
                        <div className="flex gap-2"><span className="text-[#7A89A3] font-semibold w-12 shrink-0">거래처</span><span className="text-[#3A4A66]">{selectedMail.client}</span></div>
                      )}
                    </div>
                    {selectedMail.attachmentNames?.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="text-[11px] text-[#7A89A3] font-semibold">첨부파일</span>
                        {selectedMail.attachmentNames.map((n, i) => (
                          <span key={i} className="text-[11px] bg-gray-200 text-[#5B6B85] px-2 py-0.5 rounded-full">{n}</span>
                        ))}
                      </div>
                    )}
                    {selectedMail.error && (
                      <div className="mt-2 text-[12px] text-[#0B1428] bg-[#F3F6FA] border border-[#C9D6EE] rounded-lg px-3 py-1.5">
                        오류: {selectedMail.error}
                      </div>
                    )}
                  </div>
                  {/* 메일 본문 */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="text-[11px] font-bold text-[#7A89A3] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>본문</span>
                      {!selectedMail.body && <span className="font-normal normal-case text-[#9AA9C3]">이 메일 이전 발송분은 본문이 저장되지 않았습니다</span>}
                    </div>
                    {selectedMail.body ? (
                      <div className="text-[14px] text-[#3A4A66] whitespace-pre-wrap leading-relaxed">{selectedMail.body}</div>
                    ) : (
                      <div className="text-[#7A89A3] text-[13px] italic">저장된 본문 내용이 없습니다</div>
                    )}
                  </div>
                  {/* 하단 액션 */}
                  <div className="border-t border-[#EEF2F8] px-6 py-3 flex items-center justify-between shrink-0">
                    <div className="text-[11px] text-[#7A89A3]">
                      {selectedMail.sentAt ? `발송: ${new Date(selectedMail.sentAt).toLocaleString("ko-KR")}` : ""}
                    </div>
                    <button
                      onClick={() => { setDeleteLogConfirm(selectedMail.id); }}
                      className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#0B1428] hover:bg-[#F3F6FA] border border-[#C9D6EE] transition"
                    ><EditableText id="misc.btn.51894.삭제" defaultText="삭제" /></button>
                  </div>
                </>
              )}
            </div>
          </div>
          </div>)}
        </div>
      )}
    </div>
    {/* 보낸메일함 일괄 삭제 확인 팝업 */}
    {bulkDeleteConfirm && (
      <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[999999]">
        <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[380px] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-[#0B1428] px-6 py-4 flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>
            <div className="text-white font-black text-[18px]">
              {selectedMails.size > 0 ? `${selectedMails.size}건 선택 삭제` : "전체 삭제"}
            </div>
          </div>
          <div className="px-6 py-5 text-[14px] text-[#3A4A66]">
            {selectedMails.size > 0
              ? `선택한 ${selectedMails.size}건의 발송이력을 삭제하시겠습니까?`
              : `발송이력 전체 ${emailLogs.length}건을 삭제하시겠습니까?`}
            <div className="mt-1 text-[12px] text-[#0B1428]">삭제 후 복구할 수 없습니다.</div>
          </div>
          <div className="kp-modal-foot px-6 py-4 flex gap-3">
            <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
              onClick={() => setBulkDeleteConfirm(false)}><EditableText id="misc.btn.51921.취소" defaultText="취소" /></button>
            <button className="flex-1 py-2.5 rounded-xl bg-[#0B1428] text-white font-bold text-[13px] hover:bg-[#1B2B4B] transition"
              onClick={async () => {
                const toDelete = selectedMails.size > 0 ? [...selectedMails] : emailLogs.map(l => l.id);
                setBulkDeleteConfirm(false);
                // ⭐ 2026-11-05 한 번에 삭제(writeBatch) + 삭제 진행 창 — 줄이 하나씩 사라지지 않게
                await deleteDocsAtomic(db, toDelete.map(id => doc(db, "emailLogs", id)), { label: "발송이력" }).catch(() => {});
                setSelectedMails(new Set());
                if (selectedMail && toDelete.includes(selectedMail.id)) setSelectedMail(null);
                setBulkDeleteConfirm(false);
              }}><EditableText id="misc.btn.51929.삭제" defaultText="삭제" /></button>
          </div>
        </div>
      </div>
    )}
    {/* 발송이력 삭제 확인 팝업 */}
    {deleteLogConfirm && (
      <div className="kp-modal fixed inset-0 bg-[#0B1428]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 z-[999999]">
        <div className="kp-modal-panel bg-white rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] w-full max-w-[360px] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="kp-modal-head px-6 py-4 flex items-center gap-3 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>
            <div className="text-white font-black text-[18px]">발송이력 삭제</div>
          </div>
          <div className="px-6 py-5 text-[14px] text-[#3A4A66]">이 발송이력을 삭제하시겠습니까?</div>
          <div className="kp-modal-foot px-6 py-4 flex gap-3">
            <button className="flex-1 py-2.5 rounded-xl bg-white border border-[#D5DDEA] text-[#1B2B4B] font-semibold text-[13px] hover:bg-[#F4F6FA] transition"
              onClick={() => setDeleteLogConfirm(null)}><EditableText id="misc.btn.51945.취소" defaultText="취소" /></button>
            <button className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px] hover:bg-[#243a60] transition"
              onClick={async () => {
                const _lid = deleteLogConfirm;
                setDeleteLogConfirm(null);
                await runDelete({ label: "발송이력", task: () => deleteDoc(doc(db, "emailLogs", _lid)) }).catch(() => {}); // ⭐ 2026-11-05 진행 창
                if (selectedMail?.id === _lid) setSelectedMail(null);
              }}><EditableText id="misc.btn.51951.삭제" defaultText="삭제" /></button>
          </div>
        </div>
      </div>
    )}
    {/* ⭐ 2026-11-07 명세서 단계 기록(날짜 · 메모) — 보드 · 편집 화면 공용 */}
    <StageRecordModal open={!!stageAsk} target={stageAsk} onClose={() => setStageAsk(null)} onSave={saveStageAsk} />
    </>
  );
}
