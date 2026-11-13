// ======================= src/Approval.jsx =======================
// 📝 전자결재(2026-10-28) — 홈 › 전자결재
//  - 근태·휴가 신청 / 비용·지출 결의 / 업무 기안·품의: 왼쪽에서 입력·드롭다운으로 고르면 오른쪽 결재 문서 미리보기가
//    바로 만들어진다(인사발령 화면과 같은 방식). 결재선(결재·합의)과 참조자를 정해 [결재 상신].
//  - 결재함: 내 차례(결재 대기)·진행 중·완료·반려·참조·회사 전체(관리자). 문서를 열어 승인/반려(의견)·회수·재기안·인쇄.
//  - 결재선 관리: 자주 쓰는 결재선을 저장(개인/회사 공용).
//  approvals/{id}: { company, docNo, cat, form, formLabel, title, summary, amount, days, data, images(예전 사진 base64), files(📎 Storage 첨부 정보),
//     planId(📑 관련 사업계획 문서 id · 지출결의·구매·법인카드), finIdx(📑 사업계획서 결재선의 경리·회계·재무 합의 칸 번호),
//     drafterUid, drafter{uid,name,team,position}, line:[{uid,name,position,team,kind,status(wait|pending|approved|rejected),at,comment}],
//     cc:[{uid,name}], ccUids, participants, step, status(pending|approved|rejected|withdrawn), createdAt, updatedAt, history:[…] }
//  - 알림(2026-10-28 변경): 사내메일 대신 서버 트리거(notifyApproval)가 휴대폰 푸시, BannerCenter가 화면 배너.
//    상신 → 지금 차례 결재자만 / 승인·반려·취소 결과 → 기안자만. 그 외 사람에게는 안 간다.
//  - 결과 기록 메일: 최종 승인·반려·결재 취소 결과는 기안자 사내메일(공문함)에도 남긴다(푸시·배너는 위 경로로 한 번만).
//  - 보관함에서 삭제: 끝난 문서(완료·반려·회수·취소)는 각자 자기 보관함에서만 숨긴다(hiddenBy) — 원본은 회사 기록으로 남고 "삭제한 문서"에서 되돌릴 수 있다.
//  - 수정: 첫 결재자가 문서를 열어보기 전까지만(열람하면 잠김 → 회수 후 재기안).
//  - 승인 후 취소: 기안자가 「결재 취소 요청」(사유) → 같은 결재선이 다시 승인하면 "결재 취소"로 바뀐다.
//    문서는 지우지 않고 모두의 보관함에 "결재 취소" 도장으로 남는다(감사 기록). 연차 사용일수도 자동 복구.
import { defaultFundId } from "./ledgerAuto";
import { syncExpensesWithApproval, syncExpensesPaid } from "./vehicleExpense"; // 🧾 2026-11-10 차량 비용 영수증 ↔ 지출결의 상태
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import React from "react";
import { kpConfirm, kpPrompt } from "./kpDialog";
import BankAccountInput, { ReasonTemplates } from "./BankAccountInput";
import { createPortal } from "react-dom";
import { html2canvas } from "./lazyLoad"; // ⭐ 2026-11-02 속도 — 캡처 라이브러리는 처음 캡처할 때 받는다
import { printA4, savePdf } from "./a4Export";
import { TimeSelect } from "./kpInputs";
import { useMyProfile, useUserNames, personName } from "./userNames";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp, setDoc } from "firebase/firestore";
import { ShellIcon } from "./AdminShell";
import { useCompanyStaff, compressImage, sendInternalMail } from "./InternalMail";
import CustomDatePicker from "./CustomDatePicker";
import CustomSelect from "./CustomSelect";
import { isExecProfile, isExecPosition, useHrOptions } from "./hrConstants";
import { isHrStaffUser } from "./hrHandover";
import { useLeaveGuard, draftStore, confirmLeave } from "./leaveGuard";
import {
  APPROVAL_CATS, APPROVAL_FORMS, formOf, formsOfCat, initialData, missingFields, fieldText, suggestLine,
  itemsTotal, costsTotal, fmtWon, dayDiff, bizDays, leaveEntitlement, leaveUseOf,
  blankSpendRow, spendRowTotal, spendLinesOf, spendTotals, wonKorean, rowsOf, ACCOUNTS,
} from "./approvalForms";
import { needsBizLine, suggestBizLine, validateBizLine, isFinPerson, isCeoPerson, isExecNonCeo, PLAN_LINK_FORMS, budgetTotal } from "./bizPlan"; // 📑 2026-11-08 사업계획서
import { ApprovalAttachInput, ApprovalAttachPanel, removeApFile, apUrlBlob } from "./ApprovalFiles"; // 📎 2026-11-08 첨부 파일(Storage)
import { inDocDir, fmtSize, AP_FILE_COUNT } from "./approvalFiles";
import { isPreviewMode } from "./fsTenant";
import { isDemoOn } from "./devDemoData";
import { bizPlanDemo } from "./bizPlanDemo";
import { bankText } from "./bankUtil";
import { leaveStatusOf } from "./leaveUtils"; // ⭐ 2026-11-07 연차 현황 공용 계산
import { useLeaveBasis } from "./leaveBasis";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const toMs = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);
const todayDots = () => { const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return d.replace(/-/g, "."); };
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (ms) => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const korDate = (ms) => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const mmdd = (ms) => { const d = new Date(ms); return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`; };
const STATUS = { pending: "진행 중", approved: "결재 완료", rejected: "반려", withdrawn: "회수", cancelled: "결재 취소" };
const catOf = (k) => APPROVAL_CATS.find((c) => c.key === k) || APPROVAL_CATS[0];
const isAdminRole = (r) => ["admin", "totalMaster", "hrManager", "hrAcct", "allMgr"].includes(r);

// 🗂 2026-11-04 인사발령 품의 — 인사 담당자만 쓰고(보이고), 결재가 끝나면 그 사람이 인사발령 공문을 게시한다.
//  인사 담당자 = 역할 hrManager(인사관리자)·hrAcct(통합인사관리자)·allMgr(통합관리자) 또는 부서 이름에 "인사"가 들어간 직원(hrHandover.isHrStaffUser와 같은 기준 + 통합관리자).
//  회사에 인사 담당자가 한 명도 없으면 회사 마스터(users.isMaster)만. 최고관리자(totalMaster)는 늘 가능.
const HR_DRAFT_ROLES = ["allMgr"];
const isHrPerson = (u) => !!u && u.role !== "viewer" && (isHrStaffUser(u) || (HR_DRAFT_ROLES.includes(u.role) && !u.noAccount && u.approved !== false && u.employmentStatus !== "퇴사"));
export function canHrDraft(meDoc, staff, uid) {
  if (!meDoc) return false;
  if (meDoc.role === "totalMaster") return true;
  if (isHrPerson(meDoc)) return true;
  if (meDoc.isMaster === true) return !!staff && !staff.some((u) => (u.uid || u.id) !== uid && isHrPerson(u));
  return false;
}
// 인사관리부 › 인사관리 › 인사발령 화면으로 이동(DispatchApp이 kp-go-menu를 받아 메뉴를 바꾼다) — 대상자를 골라 둔다
const goPersonnelOrder = (targetUid) => {
  try { sessionStorage.setItem("kpHrTab", "rec:인사발령"); if (targetUid) sessionStorage.setItem("kpHrFocus", targetUid); } catch { /* 무시 */ }
  window.dispatchEvent(new CustomEvent("kp-go-menu", { detail: "인사관리부" }));
};

// 💸 2026-11-04 지급완료 — 최종 승인된 비용·지출 결의(금액 있는 문서)를 재무·경리가 "지급 완료"로 표시한다.
//  대상: cat=="expense" && 금액>0 (법인카드 사용보고는 이미 카드로 결제된 건이라 제외)
//  누를 수 있는 사람: 아래 FIN_ROLES·재무 부서(2026-11-07 정리 — 운송 관리자(admin)·최종 결재자는 이제 못 누른다)
//  (firestore.rules › approvals 의 "⭐ 2026-11-04 전자결재 서명" 규칙과 같은 조건)
const PAY_SKIP_FORMS = ["card"];
export const isPayDoc = (d) => d?.cat === "expense" && !PAY_SKIP_FORMS.includes(d?.form) && Number(d?.amount) > 0;
// ⭐ 2026-11-07 지급 처리 권한 정리 — 지급은 경리 업무
//  · 경리(test)·경리사무원(acctStaff)·최고관리자 / 재무·경리·회계·총무 부서
//  · 통합관리자(allMgr)·통합인사관리자(hrAcct)는 "경리 화면"으로 전환했을 때만(운송·인사 화면에서는 안 됨)
//  · 운송 관리자(admin)·최종 결재자는 지급 처리 불가(예전엔 가능했음)
const FIN_ROLES = ["test", "acctStaff", "totalMaster"];
const FIN_TEAM = /재무|경리|회계|총무/;
const MULTI_VIEW = { allMgr: "kpAllMgrView", hrAcct: "kpHrAcctView" };
const acctViewOn = (role) => {
  const key = MULTI_VIEW[role];
  if (!key) return false;
  try { const v = localStorage.getItem(key); return role === "hrAcct" ? v !== "hr" : v === "acct"; } catch { return false; }
};
const isFinUser = (me) => FIN_ROLES.includes(me?.role) || acctViewOn(me?.role) || FIN_TEAM.test(String(me?.team || ""));
// ⭐ 2026-11-09 계정과목은 경리 권한만 정한다 — 경리관리자·경리사무원·통합관리자·통합인사관리자·최고관리자·경리/회계/재무/총무 부서
//  (통합관리자·통합인사관리자는 화면 전환과 상관없이 — 계정 분류는 지급 처리와 달리 화면을 바꿀 필요 없음. 보안 규칙의 지급 권한과 같은 역할 목록)
//  그 외 직원이 올린 지출결의는 계정과목이 비어 있고, 경리가 [지급 완료] 때 고른다(장부에도 반영)
// ⭐ 2026-11-09 계정과목 선택지 — 기본 목록 + 이 회사 문서에서 직접 입력해 쓴 계정과목(경리가 지급 때 새로 추가한 것 포함)
const _usedAccounts = new Set();
export const rememberAccounts = (docs) => { (docs || []).forEach((d) => { [d?.data?.account, d?.paid?.account].forEach((a) => { const v = String(a || "").trim(); if (v && v.length <= 30) _usedAccounts.add(v); }); }); };
export const accountOptions = () => [...new Set([...ACCOUNTS, ..._usedAccounts])];
export const isAcctEditor = (me) => ["test", "acctStaff", "allMgr", "hrAcct", "totalMaster"].includes(me?.role) || FIN_TEAM.test(String(me?.team || ""));
// null(지급 대상 아님) | "wait"(지급 대기) | "paid"(지급완료)
export const payState = (d) => (!isPayDoc(d) || d.status !== "approved" ? null : d.paid?.at ? "paid" : "wait");
// ⭐ 2026-11-07 지급완료된 지출결의는 결재 취소 요청을 막는다(경리가 지급완료를 먼저 취소) — firestore.rules apCancelReqOk와 같은 조건
export const PAID_CANCEL_MSG = "지급완료를 먼저 취소해 주세요";
export const cancelBlockedByPaid = (d) => payState(d) === "paid";
const canPay = (d, me) => !!payState(d) && d.cancel?.status !== "pending" && isFinUser(me);

// 🖼 2026-11-04 첨부 보기·저장 — 첨부는 base64 data URL이라 <a target="_blank">로는 크롬이 새 탭을 막아 아무 일도 안 일어났다.
//  화면 안 보기(라이트박스)로 열고, 저장은 blob으로 바꿔 내려받는다(휴대폰은 공유 시트 → 사진 저장).
const extOf = (src) => { const m = /^data:image\/([a-z0-9+.-]+)/i.exec(String(src || "")); const e = (m?.[1] || "jpeg").toLowerCase(); return e === "jpeg" ? "jpg" : e === "svg+xml" ? "svg" : e; };
const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 80);
const attName = (docNo, i, src) => `${safeName(docNo || "전자결재")}_첨부${i + 1}.${extOf(src)}`;
async function srcToBlob(src) {
  const s = String(src || "");
  if (/^https:\/\/firebasestorage\.googleapis\.com\//.test(s)) return apUrlBlob(s); // ⭐ 2026-11-10 저장소 사진 — 브라우저가 막으면(CORS) 중계로 받는다(예전엔 새 탭으로만 열렸다)
  if (!s.startsWith("data:")) return (await fetch(s)).blob();
  const [head, body] = s.split(",");
  const mime = /data:([^;,]+)/.exec(head)?.[1] || "image/jpeg";
  const bin = /;base64/.test(head) ? atob(body) : decodeURIComponent(body);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
const isTouchDevice = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
async function downloadAttachment(src, docNo, i, realName = "") {
  const name = realName || attName(docNo, i, src); // ⭐ 2026-11-09 새 첨부(파일)는 올린 파일 이름 그대로
  let blob;
  try { blob = await srcToBlob(src); }
  catch (e) { if (/^https?:/.test(String(src || ""))) { window.open(src, "_blank", "noopener"); return; } throw e; } // ⭐ 2026-11-09 저장소 내려받기가 막힌 환경(CORS) — 새 탭으로 열어 거기서 저장
  // 휴대폰 — 공유 시트(사진에 저장)가 되면 그쪽으로, 아니면 파일 내려받기
  if (isTouchDevice()) {
    let file = null;
    try { file = new File([blob], name, { type: blob.type }); } catch { file = null; }
    if (file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
  }
  saveBlob(blob, name);
}
async function downloadAllAttachments(images, docNo, names = []) {
  const list = (images || []).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) { await downloadAttachment(list[0], docNo, 0, names[0]); return; }
  try {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (let i = 0; i < list.length; i += 1) zip.file(names[i] || attName(docNo, i, list[i]), await srcToBlob(list[i]));
    saveBlob(await zip.generateAsync({ type: "blob" }), `${safeName(docNo || "전자결재")}_첨부${list.length}장.zip`);
  } catch {
    // 압축이 안 되면 한 장씩 차례로
    for (let i = 0; i < list.length; i += 1) { saveBlob(await srcToBlob(list[i]), attName(docNo, i, list[i])); await new Promise((r) => setTimeout(r, 350)); }
  }
}
// names: 이름이 있는 첨부(새 첨부 파일)는 그 이름으로 보이고 저장된다 — 예전 사진(images)은 비워 둔다
function ImageLightbox({ images, start = 0, docNo, onClose, names = [] }) {
  const n = (images || []).length;
  const [i, setI] = React.useState(Math.min(Math.max(0, start), Math.max(0, n - 1)));
  const [busy, setBusy] = React.useState("");
  const go = React.useCallback((dlt) => setI((p) => (n ? (p + dlt + n) % n : 0)), [n]);
  React.useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [go, onClose]);
  const touch = React.useRef(null);
  if (!n) return null;
  const src = images[i];
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { window.alert(`저장 실패: ${e.message || e}`); } finally { setBusy(""); } };
  const btn = "h-10 px-3.5 rounded-xl text-[13px] font-black inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50";
  return createPortal(
    <div className="fixed inset-0 z-[1000010] flex flex-col" style={{ background: "rgba(6,12,26,0.92)", backdropFilter: "blur(3px)" }} onClick={onClose} data-ap-lightbox>
      <div className="shrink-0 px-3 sm:px-5 py-3 flex items-center gap-2 text-white" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }} onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ATTACHMENT · {i + 1} / {n}</div>
          <div className="text-[13.5px] font-bold text-white/80 truncate">{names[i] || attName(docNo, i, src)}</div>
        </div>
        <button type="button" disabled={!!busy} onClick={() => run("one", () => downloadAttachment(src, docNo, i, names[i]))} className={`${btn} bg-white text-[#0F1A30]`}>{busy === "one" ? "저장 중…" : "이미지 저장"}</button>
        {n > 1 && <button type="button" disabled={!!busy} onClick={() => run("all", () => downloadAllAttachments(images, docNo, names))} className={`${btn} hidden sm:inline-flex bg-white/10 border border-white/20 text-white`}>{busy === "all" ? "받는 중…" : "전체 다운로드"}</button>}
        <button type="button" onClick={onClose} aria-label="닫기" className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-white font-black shrink-0">✕</button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16"
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; const x1 = e.changedTouches[0]?.clientX; if (x0 == null || x1 == null || Math.abs(x1 - x0) < 50) return; go(x1 < x0 ? 1 : -1); }}>
        <img src={src} alt={`첨부 ${i + 1}`} onClick={(e) => e.stopPropagation()} draggable={false} className="max-w-full max-h-full object-contain rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.5)] bg-white select-none" />
        {n > 1 && (
          <>
            <button type="button" aria-label="이전" onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#0F1A30]/80 border border-white/20 text-white text-[20px] font-black grid place-items-center hover:bg-[#1B2B4B]">‹</button>
            <button type="button" aria-label="다음" onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#0F1A30]/80 border border-white/20 text-white text-[20px] font-black grid place-items-center hover:bg-[#1B2B4B]">›</button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="shrink-0 py-3 flex items-center justify-center gap-2" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
          {images.map((s, k) => (
            <button key={k} type="button" onClick={() => setI(k)} className={`w-12 h-12 rounded-lg overflow-hidden border-2 ${k === i ? "border-[#CFE0FF]" : "border-transparent opacity-55 hover:opacity-90"}`}><img src={s} alt="" className="w-full h-full object-cover" /></button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ✍ 2026-11-04 개인 서명 — users/{uid}.approvalSignature(작은 PNG data URL · 40KB 미만) · approvalMarkMode("stamp"|"sign")
//  "서명"으로 해 두면 이후 내가 승인하는 결재마다 결재란에 도장 대신 내 서명이 들어간다(승인할 때 line[i].mark/sign으로 복사 — 서명을 나중에 바꿔도 예전 문서는 그대로)
const SIGN_MAX = 40000;
const STAMP_MAX = 60000; // ⭐ 2026-11-05 도장 이미지(작은 PNG/WEBP data URL)
// 도장 사진·파일 → 흰 바탕을 투명하게 빼고 작은 그림으로(결재란 66×46 표시)
async function makeStampImage(file) {
  const url = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("이미지를 열 수 없습니다")); i.src = url; });
  for (const max of [220, 170, 130, 100]) {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height);
    const px = g.getImageData(0, 0, c.width, c.height); const a = px.data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let p = 0, k = 0; p < a.length; p += 4, k += 1) {
      const lum = Math.min(a[p], a[p + 1], a[p + 2]);
      if (lum > 235) a[p + 3] = 0; else if (lum > 200) a[p + 3] = Math.round(a[p + 3] * (235 - lum) / 35); // 흰 바탕 → 투명
      if (a[p + 3] > 20) { const x = k % c.width, y = (k / c.width) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    g.putImageData(px, 0, 0);
    if (x1 < 0) throw new Error("이미지에서 도장을 찾지 못했습니다(흰 바탕만 있음)");
    const o = document.createElement("canvas"); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext("2d").drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    const out = o.toDataURL("image/png");
    if (out.length < STAMP_MAX) return out;
  }
  throw new Error("이미지가 너무 복잡합니다. 도장 부분만 잘라서 올려 주세요.");
}
function exportSignature(strokes, lw) {
  const pts = strokes.flat();
  if (!pts.length) return "";
  const pad = lw * 1.5;
  const x0 = Math.min(...pts.map((p) => p.x)) - pad; const y0 = Math.min(...pts.map((p) => p.y)) - pad;
  const x1 = Math.max(...pts.map((p) => p.x)) + pad; const y1 = Math.max(...pts.map((p) => p.y)) + pad;
  const bw = Math.max(1, x1 - x0); const bh = Math.max(1, y1 - y0);
  for (const [mw, mh] of [[320, 128], [240, 96], [180, 72]]) {
    const s = Math.min(mw / bw, mh / bh, 1);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(bw * s)); c.height = Math.max(1, Math.ceil(bh * s));
    const g = c.getContext("2d");
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0F1A30"; g.fillStyle = "#0F1A30"; g.lineWidth = Math.max(1.6, lw * s);
    strokes.forEach((st) => drawStroke(g, st.map((p) => ({ x: (p.x - x0) * s, y: (p.y - y0) * s }))));
    const url = c.toDataURL("image/png");
    if (url.length < SIGN_MAX) return url;
  }
  return "";
}
function drawStroke(g, st) {
  if (!st.length) return;
  if (st.length === 1) { g.beginPath(); g.arc(st[0].x, st[0].y, g.lineWidth / 2, 0, Math.PI * 2); g.fill(); return; }
  g.beginPath(); g.moveTo(st[0].x, st[0].y);
  for (let k = 1; k < st.length - 1; k += 1) { const mx = (st[k].x + st[k + 1].x) / 2; const my = (st[k].y + st[k + 1].y) / 2; g.quadraticCurveTo(st[k].x, st[k].y, mx, my); }
  const l = st[st.length - 1]; g.lineTo(l.x, l.y); g.stroke();
}
function MiniStamp({ name, kind = "결재" }) {
  return (
    <div className="w-[46px] h-[46px] rounded-full border-[2.5px] border-[#1B2B4B] flex flex-col items-center justify-center text-[#1B2B4B] rotate-[-8deg] leading-none shrink-0">
      <span className="text-[11px] font-black whitespace-nowrap tracking-tight">{String(name || "").slice(0, 4)}</span>
      <span className="text-[8.5px] font-black mt-0.5 tracking-wider">{kind === "합의" ? "합의" : "승인"}</span>
    </div>
  );
}
function SignatureModal({ me, onClose }) {
  const W = 640; const H = 260; const LW = 5;
  const [mode, setMode] = React.useState(me.rawMode || (me.markMode === "sign" ? "sign" : "stamp"));
  const [stampImg, setStampImg] = React.useState(me.stampImg || "");
  const [stampErr, setStampErr] = React.useState("");
  const pickStamp = async (file) => { setStampErr(""); if (!file) return; if (!/^image\//.test(file.type)) { setStampErr("이미지 파일(jpg·png)만 올릴 수 있습니다"); return; } try { setStampImg(await makeStampImage(file)); } catch (e) { setStampErr(e.message); } };
  if (me.signImg !== undefined) me = { ...me, sign: me.signImg }; // 서명 칸은 그린 서명(도장 이미지와 따로)
  const [strokes, setStrokes] = React.useState([]);
  const [redo, setRedo] = React.useState([]);
  const [drawing, setDrawing] = React.useState(!me.sign);
  const [busy, setBusy] = React.useState(false);
  const cv = React.useRef(null);
  const curr = React.useRef(null);
  const repaint = React.useCallback((list) => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d");
    g.clearRect(0, 0, W, H);
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0F1A30"; g.fillStyle = "#0F1A30"; g.lineWidth = LW;
    list.forEach((st) => drawStroke(g, st));
  }, []);
  React.useEffect(() => { if (drawing) repaint(strokes); }, [strokes, drawing, repaint]);
  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const at = (e) => { const r = cv.current.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture?.(e.pointerId); curr.current = [at(e)]; };
  const move = (e) => {
    if (!curr.current) return;
    e.preventDefault();
    const p = at(e); const st = curr.current; const last = st[st.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    st.push(p);
    const g = cv.current.getContext("2d");
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0F1A30"; g.lineWidth = LW;
    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
  };
  const up = () => { const st = curr.current; curr.current = null; if (st && st.length) { setStrokes((p) => [...p, st]); setRedo([]); } };
  const undo = () => setStrokes((p) => { if (!p.length) return p; setRedo((r) => [...r, p[p.length - 1]]); return p.slice(0, -1); });
  const redoOne = () => setRedo((r) => { if (!r.length) return r; setStrokes((p) => [...p, r[r.length - 1]]); return r.slice(0, -1); });
  const live = React.useMemo(() => (drawing && strokes.length ? exportSignature(strokes, LW) : ""), [drawing, strokes]);
  const save = async () => {
    let sig = me.sign || "";
    if (drawing && strokes.length) {
      sig = live;
      if (!sig) { window.alert("서명이 너무 복잡합니다. 조금 더 간단히 다시 그려 주세요."); return; }
    }
    if (mode === "sign" && !sig) { window.alert("서명을 먼저 그려 주세요."); return; }
    if (mode === "image" && !stampImg) { window.alert("도장 이미지를 먼저 올려 주세요."); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", me.uid), { approvalSignature: sig, approvalMarkMode: mode, ...(mode === "image" || stampImg !== (me.stampImg || "") ? { approvalStampImage: stampImg } : {}) });
      onClose();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const tab = (k, l, sub) => (
    <button type="button" onClick={() => setMode(k)} className={`flex-1 rounded-2xl border px-3 py-3 text-left transition ${mode === k ? "border-[#0F1A30] bg-[#0F1A30] text-white shadow-[0_8px_20px_rgba(15,26,48,0.22)]" : "border-[#DCE3EE] bg-white text-[#0F1A30] hover:bg-[#F5F8FD]"}`}>
      <span className="block text-[14.5px] font-black">{mode === k ? "● " : "○ "}{l}</span>
      <span className={`block text-[12px] font-bold ${mode === k ? "text-white/65" : "text-[#5B6B85]"}`}>{sub}</span>
    </button>
  );
  const sbtn = "h-9 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#3A4A66] hover:border-[#4B6CB7] disabled:opacity-40";
  return createPortal(
    <div className="fixed inset-0 z-[1000005] bg-[#0B1428]/55 flex items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-[620px] max-h-[94vh] overflow-y-auto rounded-[22px] bg-[#F4F6FA] shadow-2xl" onClick={(e) => e.stopPropagation()} data-ap-sign-modal>
        <div className="px-6 py-5 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MY SIGNATURE · APPROVAL MARK</div>
            <div className="text-[20px] font-black">내 서명 · 결재 표시</div>
            <div className="text-[12.5px] text-white/65 mt-0.5">내가 승인한 결재 문서의 결재란에 도장 또는 내 서명이 들어갑니다. 언제든 바꿀 수 있습니다.</div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 font-black">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">{tab("stamp", "도장", "이름이 들어간 원형 승인 도장")}{tab("image", "도장 이미지", "내 도장 사진·파일 올리기")}{tab("sign", "서명", "직접 그린 내 서명")}</div>
          {mode === "image" && (
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4" data-ap-stamp-upload>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>STAMP</span>
                <span className="text-[13px] font-black text-[#0F1A30]">내 도장 이미지</span>
              </div>
              <label className="block rounded-xl border-2 border-dashed border-[#C9D6EE] bg-[#FAFBFD] p-4 text-center cursor-pointer hover:border-[#4B6CB7]"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickStamp(e.dataTransfer.files?.[0]); }}>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickStamp(e.target.files?.[0]); e.target.value = ""; }} />
                {stampImg
                  ? <img src={stampImg} alt="내 도장" className="mx-auto max-h-[110px] max-w-[70%] object-contain" />
                  : <div className="py-5 text-[13.5px] font-bold text-[#5B6B85]">눌러서 도장 사진·파일 선택<br /><span className="text-[12px] text-[#9AA9C3]">(흰 종이에 찍은 도장 사진 OK · 흰 바탕은 자동으로 투명하게)</span></div>}
              </label>
              {stampErr && <div className="mt-2 text-[12.5px] font-bold text-[#B42318]">{stampErr}</div>}
              {stampImg && <div className="mt-2 flex gap-1.5"><label className={`${sbtn} inline-flex items-center cursor-pointer`}>다른 이미지<input type="file" accept="image/*" className="hidden" onChange={(e) => { pickStamp(e.target.files?.[0]); e.target.value = ""; }} /></label><button type="button" onClick={() => setStampImg("")} className={sbtn}>지우기</button></div>}
            </div>
          )}
          <div className={`rounded-2xl bg-white border border-[#E3E8F0] p-4 ${mode === "image" ? "hidden" : ""}`}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>SIGNATURE</span>
              <span className="text-[13px] font-black text-[#0F1A30]">{drawing ? "아래 칸에 서명해 주세요(마우스·손가락)" : "저장된 내 서명"}</span>
            </div>
            {drawing ? (
              <>
                <div className="relative rounded-xl border-2 border-dashed border-[#C9D6EE] bg-[#FAFBFD] overflow-hidden">
                  <canvas ref={cv} width={W} height={H} className="block w-full h-auto cursor-crosshair" style={{ touchAction: "none", aspectRatio: `${W} / ${H}` }}
                    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={(e) => { if (curr.current && e.pointerType === "mouse" && !e.buttons) up(); }} />
                  {!strokes.length && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[14px] font-bold text-[#9AA9C3]">여기에 서명</div>}
                  <div className="pointer-events-none absolute left-6 right-6 bottom-[22%] border-b border-[#DCE3EE]" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={undo} disabled={!strokes.length} className={sbtn}>↶ 되돌리기</button>
                  <button type="button" onClick={redoOne} disabled={!redo.length} className={sbtn}>↷ 다시</button>
                  <button type="button" onClick={() => { setStrokes([]); setRedo([]); }} disabled={!strokes.length} className={sbtn}>지우기</button>
                  {me.sign && <button type="button" onClick={() => { setDrawing(false); setStrokes([]); setRedo([]); }} className={`${sbtn} ml-auto`}>저장된 서명 쓰기</button>}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-[110px] rounded-xl border border-[#E3E8F0] bg-[#FAFBFD] grid place-items-center"><img src={me.sign} alt="내 서명" className="max-h-[90px] max-w-[90%] object-contain" /></div>
                <button type="button" onClick={() => setDrawing(true)} className="h-10 px-4 rounded-xl border border-[#0F1A30] text-[13px] font-black text-[#0F1A30] shrink-0">다시 그리기</button>
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white border border-[#E3E8F0] px-4 py-3 flex items-center gap-4">
            <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>PREVIEW</span>
            <div className="w-[74px] border border-[#0F1A30] flex flex-col">
              <div className="h-6 bg-[#EEF1F6] border-b border-[#0F1A30] text-[11.5px] font-black text-[#0F1A30] grid place-items-center truncate px-1">{me.position || "결재"}</div>
              <div className="h-[58px] grid place-items-center">
                {mode === "image" && stampImg ? <img src={stampImg} alt="" className="max-w-[64px] max-h-[48px] object-contain" />
                  : mode === "sign" && (drawing ? live : me.sign)
                  ? <img src={drawing ? live : me.sign} alt="" className="max-w-[64px] max-h-[44px] object-contain" />
                  : <MiniStamp name={me.name} />}
              </div>
            </div>
            <div className="text-[12.5px] text-[#5B6B85] leading-relaxed">결재란에는 이렇게 표시됩니다. 이미 승인한 문서는 그때의 표시가 그대로 남습니다.</div>
          </div>
        </div>
        <div className="sticky bottom-0 px-5 py-4 bg-white border-t border-[#E3E8F0] flex gap-2">
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#5B6B85]">취소</button>
          <button type="button" disabled={busy} onClick={save} className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{busy ? "저장 중…" : `저장 · ${mode === "sign" ? "서명" : mode === "image" ? "도장 이미지" : "도장"}으로 결재`}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────── 데이터 ───────────────────────────
export function useApprovals(uid) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("participants", "array-contains", uid)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))), () => setList([]));
  }, [uid]);
  return list;
}
// 내 결재 차례(일반 결재 또는 결재 취소 요청)
const cancelTurn = (d, uid) => d.status === "approved" && d.cancel?.status === "pending" && d.cancel.line?.[d.cancel.step]?.uid === uid;
export const myTurn = (d, uid) => (d.status === "pending" && d.line?.[d.step]?.uid === uid) || cancelTurn(d, uid);
// 기안자가 아직 확인 안 한 결과(승인 진행·완료·반려·취소 결과)
export const mineUnread = (d, uid) => d.drafterUid === uid && (d.drafterUnread === true || (d.drafterUnread === undefined && d.status === "rejected" && !(d.seenBy || []).includes(uid)));
const ccUnread = (d, uid) => (d.ccUids || []).includes(uid) && d.status === "approved" && !(d.ccReadBy || []).includes(uid);
// 첫 결재자가 열어보기 전이면 수정 가능
const canEdit = (d, uid) => d.drafterUid === uid && d.status === "pending" && !(d.line || []).some((s) => s.status !== "wait" && s.status !== "pending") && !d.line?.[0]?.viewedAt;
// 사이드바 숫자
export function useApprovalCounts() {
  const uid = auth.currentUser?.uid;
  const list = useApprovals(uid);
  return React.useMemo(() => {
    const l = (list || []).filter((d) => !(d.hiddenBy || []).includes(uid));
    return {
      todo: l.filter((d) => myTurn(d, uid)).length,
      mineNew: l.filter((d) => mineUnread(d, uid)).length,
      ccNew: l.filter((d) => ccUnread(d, uid)).length,
      myPending: l.filter((d) => d.drafterUid === uid && d.status === "pending").length,
    };
  }, [list, uid]);
}

// ─────────────────────────── 결재 문서(미리보기·보기 공용) ───────────────────────────
function Stamp({ step }) {
  // ✍ 2026-11-04 서명으로 승인한 칸 — 승인할 때 복사해 둔 서명 이미지(예전 문서·자동 승인은 도장)
  if (step.status === "approved" && step.mark === "sign" && step.sign) {
    return (
      <div className="flex flex-col items-center justify-center leading-none max-w-full px-0.5" data-ap-sign>
        {/* ⭐ 2026-11-05 올린 도장·서명 이미지만(아래 "승인" 글자 없앰) */}
        <img src={step.sign} alt={`${step.name || ""} 서명`} draggable={false} className="max-w-[70px] w-auto max-h-[56px] object-contain" />
      </div>
    );
  }
  if (step.status === "approved") {
    return (
      <div className="w-[54px] h-[54px] rounded-full border-[2.5px] border-[#1B2B4B] flex flex-col items-center justify-center text-[#1B2B4B] rotate-[-8deg] leading-none">
        <span className={`${String(step.name || "").length > 3 ? "text-[11.5px] tracking-tight" : "text-[14px]"} font-black whitespace-nowrap`}>{String(step.name || "").slice(0, 4)}</span>
        <span className="text-[9.5px] font-black mt-0.5 tracking-wider">{step.kind === "합의" ? "합의" : "승인"}</span>
      </div>
    );
  }
  if (step.status === "rejected") {
    return (
      <div className="w-[54px] h-[54px] rounded-full border-[2.5px] border-[#0F1A30] bg-[#0F1A30] flex flex-col items-center justify-center text-white rotate-[-8deg] leading-none">
        <span className="text-[14px] font-black">반려</span>
        <span className="text-[9px] font-bold mt-0.5 whitespace-nowrap tracking-tight">{String(step.name || "").slice(0, 4)}</span>
      </div>
    );
  }
  if (step.status === "pending") return <span className="text-[12px] font-black text-[#4B6CB7]">결재 중</span>;
  return null;
}

// 📱 좁은 화면(휴대폰)용 문서 배치 — 결재란을 제목 아래로, 항목 이름 칸을 좁게(2026-10-31)
const PaperCompact = React.createContext(false);
function Cell({ label, children, wide, last }) {
  const c = React.useContext(PaperCompact);
  if (c) {
    // 휴대폰 — 항목 이름은 위 띠(한 줄), 내용은 그 아래 전체 폭
    return (
      <div className={`${last ? "" : "border-b"} border-[#0F1A30]/60`}>
        <div className="bg-[#EEF1F6] border-b border-[#0F1A30]/30 px-2.5 py-1.5 text-[12.5px] font-black text-[#0F1A30] whitespace-nowrap overflow-hidden text-ellipsis">{label}</div>
        <div className="px-2.5 py-2 text-[13.5px] text-[#0F1A30] whitespace-pre-wrap break-words min-h-[34px]">{children}</div>
      </div>
    );
  }
  return (
    <div className={`flex ${last ? "" : "border-b"} border-[#0F1A30]/60`}>
      <div className={`${c ? "w-[84px] px-2.5 text-[13px]" : "w-[118px] px-3 text-[14px]"} shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 py-2.5 font-black text-[#0F1A30] flex items-center break-keep`}>{label}</div>
      <div className={`flex-1 min-w-0 ${c ? "px-2.5 text-[13.5px]" : "px-3.5 text-[14px]"} py-2.5 text-[#0F1A30] whitespace-pre-wrap break-words ${wide ? "" : ""}`}>{children}</div>
    </div>
  );
}

// ⭐ 2026-10-29 미리보기 문서가 작다는 의견 — 문서(기본 폭 780px)를 보이는 칸 폭에 맞춰 키운다(최대 1.5배).
//    인쇄·이미지 저장(html2canvas) 때는 잠깐 원래 크기(1배)로 되돌려 찍는다.
function FitPaper({ children, base = 820, max = 1.5 }) {
  const ref = React.useRef(null);
  const [z, setZ] = React.useState(1);
  const [compact, setCompact] = React.useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  // ⭐ 2026-11-02 인쇄·PDF는 칸 폭과 상관없이 늘 종이 양식(표) 모양으로 — 좁은 미리보기 칸에서 찍어도 카드로 나오지 않게
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const on = (e) => setFull(!!e.detail);
    el.addEventListener("kp-paper-full", on);
    return () => el.removeEventListener("kp-paper-full", on);
  }, []);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      // 휴대폰처럼 좁으면 축소하지 않고 좁은 화면용 배치로(글씨는 그대로 읽히게)
      if (w < 640) { setCompact(true); setZ(1); return; }
      setCompact(false);
      setZ(Math.max(1, Math.min(max, Math.floor((w / base) * 100) / 100)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [base, max]);
  return <div ref={ref} data-fithost><PaperCompact.Provider value={full ? false : compact}><div data-fitpaper style={full ? { zoom: 1, width: 780 } : { zoom: z }}>{children}</div></PaperCompact.Provider></div>;
}
// 인쇄·PDF 직전 종이 모양(표·1배)으로 바꾸고 화면이 다시 그려질 때까지 기다린다 → 끝나면 되돌린다
const paperFull = async (el, on) => {
  const host = el?.closest?.("[data-fithost]");
  if (!host) return;
  host.dispatchEvent(new CustomEvent("kp-paper-full", { detail: on }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
const captureAt1x = async (el, opts) => {
  const box = el?.closest?.("[data-fitpaper]");
  const prev = box?.style.zoom;
  if (box) box.style.zoom = "1";
  try { return await html2canvas(el, opts); } finally { if (box) box.style.zoom = prev; }
};

// 🧾 2026-11-02 지출결의 지출 내역 표(문서·인쇄) — 종이 양식(NO·발생일·업체명·적요·지출금액(공급가액·세액)·합계·비고(입금 계좌번호))과 같은 배치.
//    맨 위 「금 액」 줄에 한글 금액(金 ○○ 원整)과 숫자. 휴대폰(compact)에서는 행마다 카드로 쌓는다.
const n0 = (v) => (Number(v) ? Number(v).toLocaleString("ko-KR") : "");
const SPEND_COLS = "30px 96px minmax(0,1fr) minmax(0,1.15fr) 78px 64px 84px minmax(0,1.25fr)";
function SpendLinesPaper({ label, rows, last, compact: c }) {
  const t = spendTotals(rows);
  const list = rows.length ? rows : [{}];
  const th = "border-[#0F1A30]/40 bg-[#F5F7FB] font-black px-1.5 py-1.5 text-center whitespace-nowrap";
  const td = "border-[#0F1A30]/25 px-1.5 py-1.5 min-w-0 break-keep [overflow-wrap:anywhere]";
  return (
    <>
      <div className={`flex ${c ? "flex-col" : ""} border-b border-[#0F1A30]/60`} data-spend-total>
        <div className={`${c ? "px-2.5 py-1.5 text-[12.5px] border-b border-[#0F1A30]/30" : "w-[118px] px-3 py-3 text-[14px] border-r border-[#0F1A30]/60 flex items-center"} shrink-0 bg-[#EEF1F6] font-black text-[#0F1A30]`}>금 액</div>
        <div className={`flex-1 min-w-0 ${c ? "px-2.5 py-2" : "px-3.5 py-3"} flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[#0F1A30]`}>
          <span className={`${c ? "text-[15px]" : "text-[17px]"} font-black tracking-[0.06em] break-keep`}>{t.total ? `金 ${wonKorean(t.total)} 원整` : <span className="text-[#B4BFD0]">金 　　　　 원整</span>}</span>
          <span className={`${c ? "text-[13px]" : "text-[14.5px]"} font-bold tabular-nums text-[#3A4A66]`}>(₩ {t.total.toLocaleString("ko-KR")})</span>
        </div>
      </div>
      <div className={`${last ? "" : "border-b"} border-[#0F1A30]/60`}>
        <div className={`bg-[#EEF1F6] border-b border-[#0F1A30]/30 ${c ? "px-2.5 py-1.5 text-[12.5px]" : "px-3 py-2 text-[14px]"} font-black text-[#0F1A30] flex items-center justify-between`}>
          <span>{label}</span><span className="text-[12px] font-bold text-[#5A6A85]">{rows.length}건</span>
        </div>
        {c ? (
          <div>
            {list.map((r, i) => (
              <div key={i} className="px-2.5 py-2 border-b border-[#0F1A30]/20 last:border-b-0 text-[12.5px] text-[#0F1A30]">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 shrink-0 rounded bg-[#0F1A30] text-white text-[11px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2"><b className="text-[13.5px] break-words min-w-0">{r.vendor || "-"}</b><b className="text-[13.5px] tabular-nums whitespace-nowrap">{n0(spendRowTotal(r)) || "-"}</b></div>
                    <div className="text-[#3A4A66] break-words">{[r.date, r.memo].filter(Boolean).join(" · ")}</div>
                    {(Number(r.supply) > 0 || Number(r.vat) > 0) && <div className="text-[#5A6A85] tabular-nums">공급가액 {n0(r.supply) || 0} · 세액 {n0(r.vat) || 0}</div>}
                    {bankText(r.bank) && <div className="text-[#1B2B4B] font-bold tabular-nums break-words">입금 {bankText(r.bank)}</div>}
                    {r.note && <div className="text-[#5A6A85] break-words">비고 {r.note}</div>}
                  </div>
                </div>
              </div>
            ))}
            <div className="px-2.5 py-2 bg-[#F5F7FB] border-t border-[#0F1A30]/40 flex justify-between text-[13px] font-black"><span>합계{t.vat ? ` (세액 ${n0(t.vat)})` : ""}</span><span className="tabular-nums">{n0(t.total) || 0}</span></div>
          </div>
        ) : (
          // 표는 div 그리드로(전역 table td 스타일 — 줄바꿈 금지·15px 강제 — 을 피함)
          <div className="text-[12.5px] text-[#0F1A30]" style={{ display: "grid", gridTemplateColumns: SPEND_COLS }}>
            {[["NO", 1, 2], ["발생일", 2, 2], ["업체명", 3, 2], ["적요", 4, 2], ["지출금액", 5, 1, 2], ["합계", 7, 2]].map(([h, col, rs, cs]) => (
              <div key={h} className={`${th} border-b border-r flex items-center justify-center`} style={{ gridColumn: `${col} / span ${cs || 1}`, gridRow: `1 / span ${rs}` }}>{h}</div>
            ))}
            <div className={`${th} border-b flex flex-col items-center justify-center leading-tight`} style={{ gridColumn: "8", gridRow: "1 / span 2" }}>비고<span className="text-[11px] font-bold text-[#5A6A85]">(입금 계좌번호)</span></div>
            <div className={`${th} border-b border-r`} style={{ gridColumn: "5", gridRow: "2" }}>공급가액</div>
            <div className={`${th} border-b border-r`} style={{ gridColumn: "6", gridRow: "2" }}>세액</div>
            {list.map((r, i) => (
              <React.Fragment key={i}>
                <div className={`${td} border-b border-r text-center font-bold`}>{rows.length ? i + 1 : ""}</div>
                <div className={`${td} border-b border-r text-center tabular-nums !px-1 text-[12.5px] !whitespace-nowrap ![overflow-wrap:normal]`}>{r.date || ""}</div>
                <div className={`${td} border-b border-r font-bold`}>{r.vendor || ""}</div>
                <div className={`${td} border-b border-r whitespace-pre-wrap`}>{r.memo || ""}</div>
                <div className={`${td} border-b border-r text-right tabular-nums`}>{n0(r.supply)}</div>
                <div className={`${td} border-b border-r text-right tabular-nums`}>{n0(r.vat)}</div>
                <div className={`${td} border-b border-r text-right tabular-nums font-black`}>{n0(spendRowTotal(r))}</div>
                <div className={`${td} border-b text-[11.5px] leading-snug`}>{bankText(r.bank) && <div className="tabular-nums font-bold text-[#1B2B4B]">{bankText(r.bank)}</div>}{r.note && <div className="text-[#3A4A66]">{r.note}</div>}</div>
              </React.Fragment>
            ))}
            <div className="bg-[#F5F7FB] font-black border-r border-[#0F1A30]/25 px-2 py-1.5 text-center tracking-[0.3em]" style={{ gridColumn: "1 / span 4" }}>합 계</div>
            <div className="bg-[#F5F7FB] font-black border-r border-[#0F1A30]/25 px-1.5 py-1.5 text-right tabular-nums">{n0(t.supply)}</div>
            <div className="bg-[#F5F7FB] font-black border-r border-[#0F1A30]/25 px-1.5 py-1.5 text-right tabular-nums">{n0(t.vat)}</div>
            <div className="bg-[#F5F7FB] font-black border-r border-[#0F1A30]/25 px-1.5 py-1.5 text-right tabular-nums">{n0(t.total) || 0}</div>
            <div className="bg-[#F5F7FB]" />
          </div>
        )}
      </div>
    </>
  );
}

// 💸 2026-11-04 지급완료 도장 — 붉은 인장(인쇄·PDF에도 그대로)
// 🖨 2026-11-07 인쇄·PDF 정렬 수정 — 예전엔 문서 위 절대 위치(top 176px)라 기안자·소속·참조 표 글자를 덮었고,
//    이중 테두리를 inset box-shadow로 그려 html2canvas 캡처에서 안쪽 테두리가 회전과 어긋났다.
//    → 총액 줄(지급 금액 옆)에 흐름 배치(글자와 겹치지 않음) + 안쪽 테두리는 실제 border + 줄마다 flex 가운데·고정 line-height
function PaidSeal({ paid, compact: c }) {
  if (!paid?.at) return null;
  const date = String(paid.date || ymd(paid.at)).replace(/-/g, ".");
  const row = "flex items-center justify-center whitespace-nowrap";
  return (
    <div className="pointer-events-none select-none shrink-0" style={{ transform: "rotate(-6deg)", opacity: 0.92 }} data-paid-seal aria-label={`지급완료 ${date}`}>
      <div className="rounded-[14px] border-[3px] border-[#B42318] p-[3px] bg-white">
        <div className={`rounded-[10px] border-[1.5px] border-[#B42318] text-[#B42318] flex flex-col items-stretch ${c ? "px-2.5 py-1" : "px-3.5 py-1"}`}>
          <div className={`${row} ${c ? "text-[8.5px] h-[12px]" : "text-[9.5px] h-[13px]"} font-extrabold tracking-[0.3em] pl-[0.3em]`} style={{ lineHeight: 1, fontFamily: MONO }}>PAID · 지급</div>
          <div className={`${row} ${c ? "text-[21px] h-[26px]" : "text-[26px] h-[32px]"} font-black tracking-[0.12em] pl-[0.12em]`} style={{ lineHeight: 1 }}>지급완료</div>
          <div className={`${row} ${c ? "text-[10px] h-[15px]" : "text-[11.5px] h-[17px]"} font-black tabular-nums tracking-[0.04em] border-t-2 border-[#B42318] mt-0.5`} style={{ lineHeight: 1, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{date}{paid.byName ? ` · ${String(paid.byName).slice(0, 6)}` : ""}</div>
        </div>
      </div>
    </div>
  );
}

// 📑 2026-11-08 문서 안 작은 표(사업계획서 정량 목표 · 추진 일정 · 예산 내역)
function PaperTable({ cols, rows, total, compact: c }) {
  const tpl = cols.map((x) => x.w || "minmax(0,1fr)").join(" ");
  return (
    <div className={`border border-[#0F1A30]/40 ${c ? "text-[12.5px] -mx-1" : "text-[14px]"}`}>
      <div className="grid bg-[#F5F7FB] font-black border-b border-[#0F1A30]/40" style={{ gridTemplateColumns: tpl }}>{cols.map((x, k) => <div key={x.h} className={`px-2 py-1.5 whitespace-nowrap ${x.right ? "text-right" : ""} ${k ? "border-l border-[#0F1A30]/30" : ""}`}>{x.h}</div>)}</div>
      {(rows.length ? rows : [{}]).map((r, i) => (
        <div key={i} className="grid border-b border-[#0F1A30]/20 last:border-b-0" style={{ gridTemplateColumns: tpl }}>
          {cols.map((x, k) => <div key={x.h} className={`px-2 py-1.5 break-words min-w-0 ${x.right ? "text-right tabular-nums" : ""} ${x.bold ? "font-bold" : ""} ${k ? "border-l border-[#0F1A30]/20" : ""}`}>{rows.length ? x.get(r, i) : "\u00a0"}</div>)}
        </div>
      ))}
      {total && <div className="grid bg-[#F5F7FB] border-t border-[#0F1A30]/40 font-black" style={{ gridTemplateColumns: tpl }}>{total.map((t, k) => <div key={k} className={`px-2 py-1.5 ${cols[k]?.right ? "text-right tabular-nums" : ""} ${k ? "border-l border-[#0F1A30]/20" : ""}`}>{t}</div>)}</div>}
    </div>
  );
}
export function ApprovalPaper({ form, data, title, line, cc, drafter, docNo, createdMs, staff, status, paperRef, paid, files, images }) {
  const cols = [{ uid: drafter?.uid, name: drafter?.name, position: drafter?.position || "기안", kind: "기안", status: "approved", at: createdMs }, ...(line || [])];
  // legacy 칸(예전 양식의 칸)은 값이 있는 예전 문서에서만, legacyOf 칸은 예전 칸에 값이 있고 자기 값이 비었으면 숨김
  const has = (k) => { const x = data?.[k]; return x !== undefined && x !== null && String(x).trim() !== ""; };
  const fields = (form.fields || []).filter((f) => (f.legacy ? has(f.k) : !(f.legacyOf && has(f.legacyOf) && !has(f.k))));
  const c = React.useContext(PaperCompact);
  const lw = c ? "w-[84px] px-2.5 text-[13px]" : "w-[118px] px-3 text-[14px]";
  const lw2 = c ? "w-[84px] px-2.5 text-[13px]" : "w-[96px] px-3 text-[14px]";
  const iw = c ? "w-[50px] !px-1.5" : "w-[90px]";
  // 🖨 2026-11-07 --font-scale 1 — 사용자 글씨 크기 설정(전역 text-[12px]·[13px] 확대)이 종이 양식에 섞이면 칸마다 글자 크기가 달라져
  //    인쇄·PDF 표가 어긋났다. 결재 문서는 누가 찍어도 같은 종이 모양으로.
  return (
    <div ref={paperRef} className={`mx-auto bg-white w-full max-w-[780px] ${c ? "px-4 py-5" : "px-10 py-10"} shadow-[0_10px_30px_rgba(15,26,48,0.12)] relative`} style={{ fontFamily: "'Pretendard','Noto Sans KR',sans-serif", minHeight: c ? 0 : 1000, "--font-scale": 1 }} data-ap-paper>
      <div className={c ? "flex flex-col gap-4" : "flex items-start justify-between gap-6"}>
        <div className={`${c ? "" : "pt-4"} min-w-0`}>
          <div className="text-[12.5px] font-extrabold tracking-[0.3em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{catOf(form.cat).en} · {form.code}</div>
          {/* ⭐ 2026-11-02 점검 — 휴대폰(compact)에서는 제목을 줄이고 줄바꿈 허용(긴 양식 제목이 용지 밖으로 넘치던 문제) */}
          <div className={`${c ? "text-[19px] tracking-[0.04em] break-keep" : "text-[30px] tracking-[0.12em] whitespace-nowrap"} font-black text-[#0F1A30] mt-1`}>{form.title}</div>
          <div className="text-[13.5px] text-[#5A6A85] mt-1 flex items-center gap-2" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{docNo || "문서번호는 상신할 때 자동 부여"}
            {status && status !== "pending" && <span className="px-2 py-0.5 rounded border-2 border-[#0F1A30] text-[13px] font-black text-[#0F1A30] tracking-widest" style={{ fontFamily: "inherit" }}>{STATUS[status]}</span>}
          </div>
        </div>
        {/* 결재란 */}
        <div className={`${c ? "w-full" : "shrink-0"} flex border border-[#0F1A30]`}>
          <div className="w-7 bg-[#EEF1F6] border-r border-[#0F1A30] flex items-center justify-center text-[13px] font-black text-[#0F1A30] leading-tight text-center py-2" style={{ writingMode: "vertical-rl" }}>결 재</div>
          {cols.map((s, i) => (
            <div key={i} className={`${c ? "flex-1 min-w-0" : "w-[74px]"} flex flex-col ${i < cols.length - 1 ? "border-r border-[#0F1A30]" : ""}`}>
              <div className="h-7 bg-[#EEF1F6] border-b border-[#0F1A30] flex items-center justify-center text-[12.5px] font-black text-[#0F1A30] truncate px-1">{i === 0 ? "기안" : s.kind === "합의" ? `합의` : s.position || "결재"}</div>
              <div className="h-[66px] flex items-center justify-center">{i === 0 ? <span className="text-[14px] font-black text-[#0F1A30]">{String(s.name || "").slice(0, 4)}</span> : <Stamp step={s} />}</div>
              <div className="h-6 border-t border-[#0F1A30] flex items-center justify-center text-[11.5px] text-[#3A4A66] truncate px-1">{s.at && (i === 0 || s.status === "approved" || s.status === "rejected") ? mmdd(s.at) : s.name || "-"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${c ? "mt-4" : "mt-7"} border-t-2 border-x border-b border-[#0F1A30]`}>
        <div className={`flex ${c ? "flex-col" : ""} border-b border-[#0F1A30]/60`}>
          <div className="flex-1 flex"><div className={`${lw} shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 py-2.5 font-black`}>기안자</div><div className="flex-1 px-3.5 py-2.5 text-[14px] font-bold">{drafter?.name || "-"} {drafter?.position || ""}</div></div>
          <div className={`flex-1 flex ${c ? "border-t" : "border-l"} border-[#0F1A30]/60`}><div className={`${lw2} shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 py-2.5 font-black`}>소속</div><div className="flex-1 px-3.5 py-2.5 text-[14px]">{drafter?.team || "-"}</div></div>
        </div>
        <div className={`flex ${c ? "flex-col" : ""} border-b border-[#0F1A30]/60`}>
          <div className="flex-1 flex"><div className={`${lw} shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 py-2.5 font-black`}>기안일</div><div className="flex-1 px-3.5 py-2.5 text-[14px]">{ymd(createdMs)}</div></div>
          <div className={`flex-1 flex ${c ? "border-t" : "border-l"} border-[#0F1A30]/60`}><div className={`${lw2} shrink-0 bg-[#EEF1F6] border-r border-[#0F1A30]/60 py-2.5 font-black`}>참조</div><div className="flex-1 px-3.5 py-2.5 text-[14.5px] truncate">{(cc || []).map((c) => c.name).join(", ") || "-"}</div></div>
        </div>
        <Cell label="제목"><span className="font-black text-[15px]">{title || `${form.label}`}</span></Cell>
        {fields.map((f, i) => {
          const v = data?.[f.k];
          const last = i === fields.length - 1;
          if (f.type === "items") {
            const rows = (v || []).filter((r) => String(r.name || "").trim() || Number(r.price));
            return (
              <Cell key={f.k} label={f.label} last={last}>
                <div className={`border border-[#0F1A30]/40 ${c ? "text-[12.5px] -mx-1" : "text-[14px]"}`}>
                  <div className="flex bg-[#F5F7FB] font-black border-b border-[#0F1A30]/40">{["품목", "수량", "단가", "금액"].map((h, k) => <div key={h} className={`px-2 py-1.5 whitespace-nowrap ${k === 0 ? "flex-1 min-w-0" : `${iw} text-right`} ${k ? "border-l border-[#0F1A30]/30" : ""}`}>{h}</div>)}</div>
                  {(rows.length ? rows : [{}]).map((r, k) => (
                    <div key={k} className="flex border-b border-[#0F1A30]/20 last:border-b-0">
                      <div className="flex-1 min-w-0 px-2 py-1.5 break-words">{r.name || " "}</div>
                      <div className={`${iw} px-2 py-1.5 text-right border-l border-[#0F1A30]/20`}>{r.qty || ""}</div>
                      <div className={`${iw} px-2 py-1.5 text-right border-l border-[#0F1A30]/20`}>{Number(r.price) ? Number(r.price).toLocaleString("ko-KR") : ""}</div>
                      <div className={`${iw} px-2 py-1.5 text-right border-l border-[#0F1A30]/20 font-bold`}>{Number(r.price) ? ((Number(r.qty) || 0) * Number(r.price)).toLocaleString("ko-KR") : ""}</div>
                    </div>
                  ))}
                  <div className="flex bg-[#F5F7FB] border-t border-[#0F1A30]/40 font-black"><div className="flex-1 px-2 py-1.5 text-right">합계</div><div className={`${iw} px-2 py-1.5 text-right`}>{itemsTotal(v).toLocaleString("ko-KR")}</div></div>
                </div>
              </Cell>
            );
          }
          if (f.type === "spendLines") return <SpendLinesPaper key={f.k} label={f.label} rows={spendLinesOf(data)} last={last} compact={c} />;
          if (f.type === "costs") {
            return (
              <Cell key={f.k} label={f.label} last={last}>
                <div className={`grid ${c ? "grid-cols-1" : "grid-cols-2"} gap-x-6 gap-y-1 text-[14.5px]`}>
                  {(v || []).map((r, k) => <div key={k} className="flex justify-between border-b border-dotted border-[#0F1A30]/30 py-0.5"><span>{r.label}</span><span className="font-bold">{Number(r.amount) ? fmtWon(r.amount) : "-"}</span></div>)}
                </div>
                <div className="mt-2 text-right text-[14px] font-black">합계 {fmtWon(costsTotal(v))}</div>
              </Cell>
            );
          }
          // 📑 2026-11-08 사업계획서 표
          if (f.type === "goals") return <Cell key={f.k} label={f.label} last={last}><PaperTable compact={c} rows={rowsOf(f, v)} cols={[{ h: "No", w: "34px", get: (r, i) => i + 1 }, { h: "항목", get: (r) => r.label || "" }, { h: "목표값", w: c ? "70px" : "120px", right: true, bold: true, get: (r) => r.target || "" }, { h: "단위", w: c ? "46px" : "70px", get: (r) => r.unit || "" }]} /></Cell>;
          if (f.type === "schedule") return <Cell key={f.k} label={f.label} last={last}><PaperTable compact={c} rows={rowsOf(f, v)} cols={[{ h: "기간", w: c ? "88px" : "150px", get: (r) => r.when || "" }, { h: "내용", get: (r) => r.what || "" }, { h: "담당", w: c ? "60px" : "100px", get: (r) => r.who || "" }]} /></Cell>;
          if (f.type === "budget") { const rows = rowsOf(f, v); return <Cell key={f.k} label={f.label} last={last}><PaperTable compact={c} rows={rows} total={["합계", budgetTotal(rows).toLocaleString("ko-KR"), ""]} cols={[{ h: "항목", get: (r) => r.label || "" }, { h: "금액(원)", w: c ? "92px" : "140px", right: true, bold: true, get: (r) => (Number(r.amount) ? Number(r.amount).toLocaleString("ko-KR") : "") }, { h: "비고", w: c ? "minmax(0,0.8fr)" : "minmax(0,0.9fr)", get: (r) => r.note || "" }]} /></Cell>; }
          if (f.type === "plan") return <Cell key={f.k} label={f.label} last={last}>{data?.planName || (v ? "사업계획서" : <span className="text-[#B4BFD0]">-</span>)}</Cell>;
          return <Cell key={f.k} label={f.label} last={last}><span className={f.type === "money" ? "font-black" : ""}>{fieldText(f, v, staff) || <span className="text-[#B4BFD0]">-</span>}</span></Cell>;
        })}
        {/* 📎 2026-11-08 첨부 목록(인쇄·PDF에도 파일 이름이 남는다) */}
        {((files || []).length > 0 || (images || []).length > 0) && (
          <div className="border-t border-[#0F1A30]/60" data-ap-paper-files>
            <Cell label="첨부" last>
              <div className="space-y-0.5">
                {(files || []).map((f, i) => <div key={f.path || i} className="flex gap-2 min-w-0"><span className="shrink-0 tabular-nums text-[#5B6B85]">{i + 1}.</span><span className="min-w-0 break-all">{f.name}</span><span className="shrink-0 text-[#5B6B85] tabular-nums">({fmtSize(f.size)})</span></div>)}
                {(images || []).length > 0 && <div className="flex gap-2"><span className="shrink-0 tabular-nums text-[#5B6B85]">{(files || []).length + 1}.</span><span>증빙 사진 {images.length}장</span></div>}
              </div>
            </Cell>
          </div>
        )}
      </div>
      {(() => {
        const amt = form.amount ? form.amount(data || {}) : 0;
        const days = form.days ? form.days(data || {}) : 0;
        const seal = status === "approved" && paid?.at;
        if (!amt && !days && !seal) return null;
        return (
          <div className={`mt-4 flex justify-end ${seal ? "items-center gap-4" : "gap-2"}`}>
            {seal && <PaidSeal paid={paid} compact={c} />}
            {days > 0 && <div className="px-4 py-2 border-2 border-[#0F1A30] text-[14px] font-black">사용 일수 {days}일</div>}
            {amt > 0 && <div className="px-4 py-2 bg-[#0F1A30] text-white text-[15px] font-black">{form.amountLabel || "총액"} {fmtWon(amt)}</div>}
          </div>
        );
      })()}
      <div className={`text-center ${status === "approved" && paid?.at ? "mt-8" : "mt-12"} text-[15px] text-[#1F2A44]`}>위와 같이 {form.cat === "expense" ? "결의" : form.cat === "draft" ? "기안" : form.cat === "report" ? (form.key === "resign" ? "제출" : "보고") : "신청"}하오니 재가하여 주시기 바랍니다.</div>
      <div className="text-center mt-6 text-[14.5px] text-[#3A4A66]">{korDate(createdMs)}</div>
      <div className="text-center mt-3 text-[17px] font-black text-[#0F1A30] tracking-[0.1em]">{form.cat === "draft" ? "기안자" : "신청인"} {drafter?.name || ""} <span className="text-[14px] font-bold text-[#5B6B85]">(인)</span></div>
    </div>
  );
}

// ─────────────────────────── 입력칸 ───────────────────────────
const inp = "h-11 w-full px-3 rounded-xl border border-[#D3DBE8] bg-white text-[14.5px] font-semibold text-[#0F1A30] placeholder:text-[#8E9BB2] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#2D4C82]/15";
function StaffSelect({ value, onChange, staff, exclude = [], placeholder = "선택" }) {
  const groups = React.useMemo(() => {
    const g = new Map();
    (staff || []).filter((u) => !exclude.includes(u.uid)).forEach((u) => { const t = u.team || "미배정"; if (!g.has(t)) g.set(t, []); g.get(t).push(u); });
    return [...g.entries()];
  }, [staff, exclude]);
  return (
    <CustomSelect openOnFocus value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp}>
      <option value="">{placeholder}</option>
      {groups.map(([t, us]) => <optgroup key={t} label={t}>{us.map((u) => <option key={u.uid} value={u.uid}>{u.name}{u.position ? ` ${u.position}` : ""}</option>)}</optgroup>)}
    </CustomSelect>
  );
}
// 👥 여러 명 한 번에 고르기(결재자·참조자) — 부서별로 묶어 체크
function StaffMultiPick({ staff, exclude = [], label = "여러 명 한 번에", onAdd }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState([]);
  const [q, setQ] = React.useState("");
  const groups = React.useMemo(() => {
    const g = new Map();
    (staff || []).filter((u) => !exclude.includes(u.uid) && (!q.trim() || `${u.name}${u.team}${u.position}`.includes(q.trim()))).forEach((u) => { const t = u.team || "미배정"; if (!g.has(t)) g.set(t, []); g.get(t).push(u); });
    return [...g.entries()];
  }, [staff, exclude, q]);
  const toggle = (uid) => setSel((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  return (
    <>
      <button type="button" onClick={() => { setSel([]); setQ(""); setOpen(true); }} className="h-10 px-3 rounded-xl border border-dashed border-[#9AB0D6] text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] whitespace-nowrap">＋ {label}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-[99995] bg-[#0B1428]/55 flex items-center justify-center p-4">
          <div className="w-full max-w-[560px] max-h-[80vh] rounded-[22px] bg-white overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 text-white flex items-center gap-2" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="flex-1"><div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MULTI SELECT</div><div className="text-[18px] font-black">{label}</div></div>
              <button type="button" onClick={() => setOpen(false)} className="h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-[13.5px] font-black">닫기</button>
            </div>
            <div className="p-4 border-b border-[#EEF1F6]"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서·직책 검색" className={inp} /></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {groups.map(([t, us]) => {
                const allOn = us.every((u) => sel.includes(u.uid));
                return (
                  <div key={t}>
                    <button type="button" onClick={() => setSel((p) => (allOn ? p.filter((x) => !us.some((u) => u.uid === x)) : [...new Set([...p, ...us.map((u) => u.uid)])]))} className="text-[13px] font-black text-[#2D4C82] mb-1.5">{allOn ? "☑" : "☐"} {t} 전체</button>
                    <div className="grid grid-cols-2 gap-1.5">
                      {us.map((u) => { const on = sel.includes(u.uid); return (
                        <button key={u.uid} type="button" onClick={() => toggle(u.uid)} className={`h-11 px-3 rounded-xl border text-left text-[14px] font-bold flex items-center gap-2 ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#DCE3EE] text-[#0F1A30] hover:bg-[#F5F8FD]"}`}>
                          <span className="text-[13px]">{on ? "✓" : "＋"}</span><span className="truncate">{u.name} <span className={`text-[12.5px] ${on ? "text-white/70" : "text-[#5B6B85]"}`}>{u.position}</span></span>
                        </button>
                      ); })}
                    </div>
                  </div>
                );
              })}
              {!groups.length && <div className="py-10 text-center text-[14px] font-bold text-[#5B6B85]">고를 수 있는 직원이 없습니다</div>}
            </div>
            <div className="p-4 border-t border-[#EEF1F6] flex items-center gap-2">
              <span className="text-[14px] font-bold text-[#3A4A66]">{sel.length}명 선택 <span className="text-[12.5px] text-[#5B6B85]">(고른 순서대로 들어갑니다)</span></span>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto h-11 px-4 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#5B6B85]">취소</button>
              <button type="button" disabled={!sel.length} onClick={() => { onAdd(sel); setOpen(false); }} className="h-11 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-40">추가</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
// 사유 — 드롭다운으로 고르고(직접 입력도 가능) 아래 칸에서 이어 쓴다
function ReasonSelect({ f, value, onChange }) {
  const v = String(value || "");
  const first = v.split("\n")[0];
  // ⭐ 2026-11-02 버그수정 — "직접 입력"을 고른 뒤 글자를 다 지우면 값이 비어 "사유 선택"으로 되돌아가던 문제:
  //  직접 입력 상태를 따로 기억한다(다른 항목을 고르기 전까지 유지)
  const [direct, setDirect] = React.useState(() => !!v && !f.templates.includes(first));
  React.useEffect(() => { if (v && f.templates.includes(first)) setDirect(false); else if (v) setDirect(true); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = f.templates.includes(first) ? first : (direct || v) ? "__direct" : "";
  const rest = sel && sel !== "__direct" ? v.split("\n").slice(1).join("\n") : v;
  return (
    <div className="space-y-1.5">
      <CustomSelect openOnFocus value={sel} onChange={(e) => { const t = e.target.value; if (t === "__direct") { setDirect(true); onChange(rest); } else { setDirect(false); onChange(t ? [t, rest].filter((x) => x && x.trim()).join("\n") : rest); } }} className={inp}>
        <option value="">{f.label} 선택</option>
        {f.templates.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value="__direct">✎ 직접 입력</option>
      </CustomSelect>
      {sel && <textarea value={sel === "__direct" ? v.trimStart() : rest} onChange={(e) => onChange(sel === "__direct" ? e.target.value : [sel, e.target.value].filter((x) => x).join("\n"))} rows={f.rows || 2}
        placeholder={sel === "__direct" ? `${f.label}를 직접 입력` : "덧붙일 내용 (선택)"} className={`${inp} h-auto py-2 leading-relaxed resize-y`} />}
    </div>
  );
}
// ⭐ 2026-11-04 고르기 입력 — 정해진 목록(select)에 "✎ 직접 입력"을 붙인 드롭다운. 값은 늘 글자 그대로 저장(예전 문서 호환)
const DIRECT = "__direct";
function SelectDirect({ f, value, onChange }) {
  const v = String(value ?? "");
  const opts = f.options || [];
  const known = opts.includes(v);
  const [direct, setDirect] = React.useState(() => !!v && !known);
  React.useEffect(() => { if (v && known) setDirect(false); else if (v) setDirect(true); }, [v, known]);
  const sel = known ? v : direct ? DIRECT : "";
  return (
    <div className="space-y-1.5">
      <CustomSelect openOnFocus value={sel} onChange={(e) => { const t = e.target.value; if (t === DIRECT) { setDirect(true); onChange(known ? "" : v); } else { setDirect(false); onChange(t); } }} className={inp}>
        {!f.def && <option value="">{f.label} 선택</option>}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={DIRECT}>✎ 직접 입력</option>
      </CustomSelect>
      {sel === DIRECT && <input autoFocus={!v} value={v} onChange={(e) => onChange(e.target.value)} placeholder={`${f.label} 직접 입력`} className={inp} />}
    </div>
  );
}

// 🔎 검색 드롭다운(직원·부서·직책·거래처·차량) — 목록이 길어도 찾기 쉽게 검색칸 + 맨 아래 "✎ 직접 입력".
//  화면 위에 띄우는 창(포털)이라 카드(overflow-hidden) 안에서도 잘리지 않고, 아래 공간이 모자라면 위로 연다(휴대폰 375px 폭에 맞춤).
//  options: [{ value, label, sub?, group? }]
function PickPopover({ anchorRef, options, selected = [], multi, onPick, onDirect, onClose, allowClear }) {
  const [q, setQ] = React.useState("");
  const [pos, setPos] = React.useState(null);
  const boxRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth; const vh = window.visualViewport?.height || window.innerHeight;
      const w = Math.min(Math.max(r.width, 260), vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - w - 8));
      const below = vh - r.bottom - 10; const above = r.top - 10;
      const up = below < 240 && above > below;
      setPos({ left, width: w, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined, maxH: Math.max(160, Math.min(360, up ? above : below)) });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchorRef]);
  React.useEffect(() => {
    const out = (e) => { if (boxRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return; onClose(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", out, true); window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", out, true); window.removeEventListener("keydown", key, true); };
  }, [anchorRef, onClose]);
  const qq = q.trim().toLowerCase();
  const list = React.useMemo(() => (qq ? options.filter((o) => `${o.label} ${o.sub || ""} ${o.group || ""}`.toLowerCase().includes(qq)) : options).slice(0, 300), [options, qq]);
  const showSearch = options.length > 7;
  if (!pos) return null;
  let lastGroup = null;
  return createPortal(
    <div ref={boxRef} data-ap-pick className="fixed z-[100000] rounded-2xl border border-[#D3DBE8] bg-white shadow-[0_18px_44px_rgba(15,26,48,0.22)] flex flex-col overflow-hidden"
      style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}>
      {showSearch && (
        <div className="p-2 border-b border-[#EEF1F6] shrink-0">
          <input autoFocus={!isTouchDevice()} value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (list.length === 1) onPick(list[0].value); else if (q.trim()) onDirect(q.trim()); } }}
            className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1">
        {allowClear && !multi && <button type="button" onClick={() => onPick("")} className="w-full px-3.5 py-2 text-left text-[13.5px] font-bold text-[#8E9BB2] hover:bg-[#F5F8FD]">선택 안 함</button>}
        {list.map((o) => {
          const on = selected.includes(o.value);
          const head = o.group && o.group !== lastGroup ? o.group : null;
          if (o.group) lastGroup = o.group;
          return (
            <React.Fragment key={`${o.group || ""}|${o.value}`}>
              {head && <div className="px-3.5 pt-2 pb-1 text-[11.5px] font-extrabold tracking-[0.08em] text-[#4B6CB7]">{head}</div>}
              <button type="button" onClick={() => onPick(o.value)} className={`w-full min-h-[40px] px-3.5 py-1.5 text-left flex items-center gap-2 ${on ? "bg-[#EEF3FC]" : "hover:bg-[#F5F8FD]"}`}>
                {multi && <span className={`w-5 h-5 shrink-0 rounded-md border-2 grid place-items-center text-[11px] font-black ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "border-[#9AB0D6] text-transparent"}`}>✓</span>}
                <span className="flex-1 min-w-0"><span className={`block truncate text-[14px] text-[#0F1A30] ${on ? "font-black" : "font-bold"}`}>{o.label}</span>{o.sub && <span className="block truncate text-[12px] font-semibold text-[#5B6B85]">{o.sub}</span>}</span>
                {!multi && on && <span className="text-[13px] font-black text-[#2D4C82]">✓</span>}
              </button>
            </React.Fragment>
          );
        })}
        {!list.length && <div className="px-3.5 py-4 text-center text-[13px] font-bold text-[#8E9BB2]">{options.length ? "검색 결과가 없습니다" : "목록이 비어 있습니다"}</div>}
      </div>
      <button type="button" onClick={() => onDirect(q.trim())} className="shrink-0 h-11 px-3.5 border-t border-[#EEF1F6] text-left text-[14px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] truncate">✎ 직접 입력{q.trim() ? ` · "${q.trim()}"` : ""}</button>
    </div>,
    document.body,
  );
}
const splitNames = (v) => String(v || "").split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
function PickInput({ value, onChange, options, placeholder = "선택", multi = false, addLabel = "＋ 고르기" }) {
  const v = String(value ?? "");
  const known = options.some((o) => o.value === v);
  const [direct, setDirect] = React.useState(() => !multi && !!v && !known);
  React.useEffect(() => { if (!multi && v && known) setDirect(false); else if (!multi && v && !known) setDirect(true); }, [multi, v, known]);
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const close = React.useCallback(() => setOpen(false), []);
  if (multi) {
    const names = splitNames(v);
    return (
      <div ref={anchorRef} className="flex items-center gap-1.5">
        <input ref={inputRef} value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inp} flex-1 min-w-0`} />
        <button type="button" onClick={() => setOpen((o) => !o)} className="h-11 px-3 shrink-0 rounded-xl border border-[#9AB0D6] bg-[#F5F8FD] text-[13.5px] font-black text-[#1B2B4B] whitespace-nowrap hover:bg-[#EEF3FC]">{addLabel}</button>
        {open && <PickPopover anchorRef={anchorRef} options={options} selected={names} multi onClose={close}
          onPick={(x) => onChange((names.includes(x) ? names.filter((n) => n !== x) : [...names, x]).join(", "))}
          onDirect={(t) => { setOpen(false); if (t && !names.includes(t)) onChange([...names, t].join(", ")); else setTimeout(() => inputRef.current?.focus(), 0); }} />}
      </div>
    );
  }
  // 목록이 비어 있으면(거래처·차량 미등록 등) 바로 글자 입력
  if (!options.length && !open) return <input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inp} />;
  if (direct) {
    return (
      <div ref={anchorRef} className="flex items-center gap-1.5">
        <input ref={inputRef} autoFocus={!v} value={v} onChange={(e) => onChange(e.target.value)} placeholder={`${placeholder} · 직접 입력`} className={`${inp} flex-1 min-w-0`} />
        <button type="button" onClick={() => setOpen((o) => !o)} title="목록에서 고르기" className="h-11 px-2.5 shrink-0 rounded-xl border border-[#DCE3EE] bg-white text-[13px] font-black text-[#3A4A66] whitespace-nowrap hover:border-[#4B6CB7]">목록 ▾</button>
        {open && <PickPopover anchorRef={anchorRef} options={options} selected={[v]} allowClear onClose={close} onPick={(x) => { setOpen(false); setDirect(false); onChange(x); }} onDirect={(t) => { setOpen(false); if (t) onChange(t); setTimeout(() => inputRef.current?.focus(), 0); }} />}
      </div>
    );
  }
  const cur = options.find((o) => o.value === v);
  return (
    <div ref={anchorRef}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className={`${inp} flex items-center gap-2 text-left`}>
        <span className={`flex-1 min-w-0 truncate ${cur ? "" : "text-[#8E9BB2] font-semibold"}`}>{cur ? cur.label : placeholder}{cur?.sub ? <span className="ml-1.5 text-[12.5px] font-bold text-[#5B6B85]">{cur.sub}</span> : null}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className={`shrink-0 opacity-80 transition ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <PickPopover anchorRef={anchorRef} options={options} selected={[v]} allowClear={!!v} onClose={close} onPick={(x) => { setOpen(false); onChange(x); }} onDirect={(t) => { setOpen(false); setDirect(true); onChange(t || ""); }} />}
    </div>
  );
}
// 고르기 목록 데이터 — 거래처(clients), 차량·기사(drivers). 그 목록을 쓰는 양식을 열었을 때만 구독
function useApprovalRefs(company, need) {
  const [clients, setClients] = React.useState([]);
  const [cars, setCars] = React.useState([]);
  React.useEffect(() => {
    if (!company || !need.clients) return undefined;
    const mine = (x) => (String(x.companyName || "").trim() || DEFAULT_COMPANY) === company;
    return onSnapshot(collection(db, "clients"), (s) => {
      const names = s.docs.map((d) => d.data()).filter(mine).map((c) => String(c.거래처명 || c.업체명 || c.name || c.상호 || c.회사명 || "").trim()).filter(Boolean);
      setClients([...new Set(names)].sort((a, b) => a.localeCompare(b, "ko")));
    }, () => setClients([]));
  }, [company, need.clients]);
  React.useEffect(() => {
    if (!company || !need.cars) return undefined;
    const mine = (x) => (String(x.companyName || "").trim() || DEFAULT_COMPANY) === company;
    return onSnapshot(collection(db, "drivers"), (s) => {
      const seen = new Set();
      setCars(s.docs.map((d) => d.data()).filter((d) => mine(d) && String(d.차량번호 || "").trim())
        .map((d) => ({ carNo: String(d.차량번호).trim(), name: String(d.이름 || "").trim(), kind: String(d.차량종류 || d.톤수 || "").trim(), grade: String(d.등급 || "").trim() }))
        .filter((d) => { const k = `${d.carNo}|${d.name}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.carNo.localeCompare(b.carNo, "ko")));
    }, () => setCars([]));
  }, [company, need.cars]);
  return { clients, cars };
}
// 필드의 pick → 목록 항목
function pickOptions(f, { staff, hr, refs, data } = {}) {
  const carSub = (c) => [c.name, c.kind, c.grade].filter(Boolean).join(" · ");
  switch (f.pick) {
    case "teams": return (hr?.teams || []).map((t) => ({ value: t, label: t }));
    case "positions": return (hr?.positionsFor ? hr.positionsFor(f.pickTeam ? data?.[f.pickTeam] || "" : "") : []).map((p) => ({ value: p, label: p }));
    case "staffName":
    case "staffNames": return (staff || []).map((u) => ({ value: `${u.name || u.email || ""}${u.position ? ` ${u.position}` : ""}`.trim(), label: u.name || u.email || "", sub: u.position || "", group: u.team || "미배정" }))
      .filter((o) => o.label).sort((a, b) => String(a.group).localeCompare(String(b.group), "ko"));
    case "clients": return (refs?.clients || []).map((n) => ({ value: n, label: n }));
    case "cars": return [...new Map((refs?.cars || []).map((c) => [c.carNo, { value: c.carNo, label: c.carNo, sub: carSub(c) }])).values()];
    case "carDriver": return (refs?.cars || []).map((c) => ({ value: c.name ? `${c.carNo} / ${c.name}` : c.carNo, label: c.carNo, sub: carSub(c) }));
    default: return [];
  }
}
// 🧾 2026-11-02 지출결의 지출 내역 입력 — 행마다 카드(발생일·지출처·적요·공급가액·세액·합계·입금계좌·비고), [+ 행 추가]/[복사]/[삭제]
//    합계는 공급가액+세액으로 자동(합계만 알면 합계 칸에 바로 입력 가능). [부가세 10%]·[합계에서 나누기] 빠른 계산.
const moneyIn = (v) => String(v || "").replace(/[^\d]/g, "");
function SpendLinesInput({ value, onChange }) {
  const rows = Array.isArray(value) && value.length ? value : [blankSpendRow()];
  const set = (i, patch) => onChange(rows.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, ...patch };
    if ("supply" in patch || "vat" in patch) { const s = (Number(n.supply) || 0) + (Number(n.vat) || 0); n.total = s ? String(s) : ""; }
    return n;
  }));
  const add = () => onChange([...rows, blankSpendRow(rows[rows.length - 1]?.date)]);
  const dup = (i) => onChange([...rows.slice(0, i + 1), { ...rows[i], memo: "", supply: "", vat: "", total: "", note: "" }, ...rows.slice(i + 1)]);
  const del = async (i) => {
    const r = rows[i];
    if ((r.vendor || r.memo || spendRowTotal(r)) && !await kpConfirm(`${i + 1}번 행${r.vendor ? `(${r.vendor})` : ""}을 삭제할까요?`)) return;
    onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blankSpendRow(r.date)]);
  };
  const t = spendTotals(rows);
  const lab = "block text-[11.5px] font-extrabold text-[#5B6B85] mb-1";
  const won = (k, r, i, ph) => (
    <div className="relative">
      <input inputMode="numeric" value={n0(r[k])} onChange={(e) => set(i, { [k]: moneyIn(e.target.value) })} placeholder={ph || "0"} className={`${inp} pr-8 text-right tabular-nums`} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-[#5B6B85]">원</span>
    </div>
  );
  return (
    <div className="space-y-2.5" data-spend-lines>
      {rows.map((r, i) => {
        const sum = (Number(r.supply) || 0) + (Number(r.vat) || 0);
        const off = sum > 0 && Number(r.total) > 0 && Number(r.total) !== sum;
        return (
          <div key={i} data-spend-row={i} className="rounded-2xl border border-[#DCE3EE] bg-[#FAFBFD] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-[#E3E8F0]">
              <span className="w-6 h-6 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black flex items-center justify-center tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-[13.5px] font-black text-[#0F1A30]">{r.vendor || <span className="text-[#9AA9C3] font-bold">지출처 미입력</span>}</span>
              <span className="text-[13.5px] font-black text-[#0F1A30] tabular-nums whitespace-nowrap">{spendRowTotal(r) ? fmtWon(spendRowTotal(r)) : ""}</span>
              <button type="button" onClick={() => dup(i)} title="같은 지출처·계좌로 아래에 행 추가" className="h-7 px-2 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-black text-[#3A4A66] hover:border-[#4B6CB7] whitespace-nowrap">복사</button>
              <button type="button" onClick={() => del(i)} title="행 삭제" aria-label={`${i + 1}번 행 삭제`} className="w-7 h-7 rounded-lg text-[#5B6B85] hover:bg-[#EEF3FC] hover:text-[#0F1A30]">✕</button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-x-2 gap-y-2.5">
              <div className="col-span-2 sm:col-span-1"><span className={lab}>발생일(납입일)</span><CustomDatePicker value={r.date || ""} onChange={(e) => set(i, { date: e.target.value })} className={inp} showIcon placeholder="날짜 선택" /></div>
              <div className="col-span-2 sm:col-span-1"><span className={lab}>지출처(업체명) *</span><input value={r.vendor || ""} onChange={(e) => set(i, { vendor: e.target.value })} placeholder="예) ○○특장 김제공장" className={inp} /></div>
              <div className="col-span-2"><span className={lab}>적요</span><input value={r.memo || ""} onChange={(e) => set(i, { memo: e.target.value })} placeholder="예) 1234 홍길동 박스 고리 작업" className={inp} /></div>
              <div><span className={lab}>공급가액</span>{won("supply", r, i)}</div>
              <div><span className={lab}>세액(부가세)</span>{won("vat", r, i, "없으면 비움")}</div>
              <div className="col-span-2"><span className={lab}>합계 *</span>{won("total", r, i)}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button type="button" disabled={!(Number(r.supply) > 0)} onClick={() => set(i, { vat: String(Math.round(Number(r.supply) * 0.1)) })} className="h-7 px-2.5 rounded-lg border border-[#C9D6EE] bg-[#F3F6FA] text-[12px] font-black text-[#1B2B4B] hover:bg-[#EEF3FC] disabled:opacity-40">부가세 10%</button>
                  <button type="button" disabled={!(Number(r.total) > 0)} onClick={() => { const tt = Number(r.total); const sp = Math.round(tt / 1.1); set(i, { supply: String(sp), vat: String(tt - sp) }); }} className="h-7 px-2.5 rounded-lg border border-[#C9D6EE] bg-[#F3F6FA] text-[12px] font-black text-[#1B2B4B] hover:bg-[#EEF3FC] disabled:opacity-40">합계에서 공급가·세액 나누기</button>
                  {off && <span className="text-[12px] font-bold text-[#2D4C82]">! 공급가액+세액({n0(sum)})과 다릅니다</span>}
                </div>
              </div>
              <div className="col-span-2"><span className={lab}>입금 계좌</span><BankAccountInput value={r.bank} onChange={(b) => set(i, { bank: b })} stacked /></div>
              <div className="col-span-2"><span className={lab}>비고</span><input value={r.note || ""} onChange={(e) => set(i, { note: e.target.value })} placeholder="선택" className={inp} /></div>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={add} className="w-full h-11 rounded-2xl border-2 border-dashed border-[#9AB0D6] bg-white text-[14px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] hover:border-[#2D4C82]">+ 행 추가</button>
      <div className="rounded-2xl text-white px-4 py-3" style={{ background: "linear-gradient(120deg,#0F1A30,#1B2B4B)" }}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] font-extrabold tracking-[0.2em] text-[#9AB0D6]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>TOTAL · {rows.filter((r) => spendRowTotal(r) > 0).length}건</span>
          <span className="text-[18px] font-black tabular-nums">{fmtWon(t.total)}</span>
        </div>
        <div className="mt-0.5 text-[12.5px] font-bold text-[#C9D6EE] break-keep">金 {wonKorean(t.total)} 원整{t.vat ? ` · 공급가액 ${n0(t.supply) || 0} / 세액 ${n0(t.vat)}` : ""}</div>
      </div>
    </div>
  );
}
// 📑 2026-11-08 사업계획서 표 입력(정량 목표 · 추진 일정 · 예산 내역) — 행 추가·삭제, 금액 칸은 콤마
function RowsInput({ value, onChange, cols, blank, addLabel = "+ 행 추가", total }) {
  const rows = Array.isArray(value) && value.length ? value : [{ ...blank }];
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-1.5" data-rows-input>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {cols.map((c) => (c.money ? (
            <div key={c.k} className={`relative ${c.w || "flex-1 min-w-0"}`}>
              <input inputMode="numeric" value={r[c.k] ? Number(r[c.k]).toLocaleString("ko-KR") : ""} onChange={(e) => set(i, c.k, moneyIn(e.target.value))} placeholder={c.ph || "0"} aria-label={c.label} className={`${inp} pr-7 text-right tabular-nums`} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12.5px] font-bold text-[#5B6B85]">원</span>
            </div>
          ) : <input key={c.k} value={r[c.k] || ""} onChange={(e) => set(i, c.k, c.num ? e.target.value.replace(/[^\d.,-]/g, "") : e.target.value)} inputMode={c.num ? "decimal" : undefined} placeholder={c.ph || ""} aria-label={c.label} className={`${inp} ${c.w || "flex-1 min-w-0"} ${c.num ? "text-right tabular-nums" : ""}`} />))}
          <button type="button" onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...blank }])} aria-label={`${i + 1}번 행 삭제`} className="w-8 h-8 shrink-0 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD]">✕</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onChange([...rows, { ...blank }])} className="text-[13.5px] font-bold text-[#4B6CB7]">{addLabel}</button>
        {total}
      </div>
    </div>
  );
}
// 📑 관련 사업계획 고르기 — 회사의 최종 승인된 사업계획서(지출결의서·구매요청서·법인카드 사용보고)
function PlanSelect({ value, onChange, plans }) {
  const list = plans || [];
  return (
    <div>
      <CustomSelect openOnFocus value={value || ""} onChange={(e) => { const p = list.find((x) => x.id === e.target.value); onChange(e.target.value, p); }} className={inp}>
        <option value="">해당 없음</option>
        {list.map((p) => <option key={p.id} value={p.id}>{p.data?.name || p.title}{p.data?.period?.start ? ` (${p.data.period.start.slice(2).replace(/-/g, ".")}~)` : ""}</option>)}
        {value && !list.some((p) => p.id === value) && <option value={value}>이전에 고른 사업계획</option>}
      </CustomSelect>
      <div className="mt-1 text-[12.5px] font-semibold text-[#5B6B85]">{list.length ? "고르면 이 지출이 그 사업의 집행액으로 잡혀요" : "아직 최종 승인된 사업계획서가 없어요"}</div>
    </div>
  );
}
function FieldInput({ f, value, onChange, staff, meUid, ctx }) {
  if (f.pick) return <PickInput value={value} onChange={onChange} options={pickOptions(f, { ...ctx, staff })} placeholder={f.ph || `${f.label} 선택`} multi={f.pick === "staffNames"} addLabel={f.pick === "staffName" ? "＋ 고르기" : "＋ 직원"} />;
  if (f.type === "plan") return <PlanSelect value={value} onChange={onChange} plans={ctx?.plans} />;
  if (f.type === "goals") return <RowsInput value={value} onChange={onChange} blank={{ label: "", target: "", unit: "" }} cols={[{ k: "label", label: "항목", ph: "항목(예: 월 매출)" }, { k: "target", label: "목표값", ph: "목표값", num: true, w: "!w-24 shrink-0" }, { k: "unit", label: "단위", ph: "단위", w: "!w-16 shrink-0" }]} addLabel="+ 목표 추가" />;
  if (f.type === "schedule") return <RowsInput value={value} onChange={onChange} blank={{ when: "", what: "", who: "" }} cols={[{ k: "when", label: "기간", ph: "기간(예: 11월)", w: "!w-28 shrink-0" }, { k: "what", label: "내용", ph: "추진 내용" }, { k: "who", label: "담당", ph: "담당", w: "!w-20 shrink-0" }]} addLabel="+ 일정 추가" />;
  if (f.type === "budget") return <RowsInput value={value} onChange={onChange} blank={{ label: "", amount: "", note: "" }} cols={[{ k: "label", label: "항목", ph: "항목(예: 임차 보증금)" }, { k: "amount", label: "금액", money: true, w: "!w-32 shrink-0" }, { k: "note", label: "비고", ph: "비고", w: "!w-24 shrink-0" }]} addLabel="+ 예산 항목 추가" total={<span className="text-[14px] font-black text-[#0F1A30]">합계 {fmtWon(budgetTotal(value))}</span>} />;
  if (f.type === "spendLines") return <SpendLinesInput value={value} onChange={onChange} />;
  if (f.type === "bank") return <BankAccountInput value={value} onChange={onChange} stacked />;
  if (f.type === "textarea" && f.templates) return <ReasonSelect f={f} value={value} onChange={onChange} />;
  if (f.type === "textarea") return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={f.rows || 3} placeholder={f.ph || ""} className={`${inp} h-auto py-2 leading-relaxed resize-y`} />;
  if (f.type === "select" && f.direct) return <SelectDirect f={f} value={value} onChange={onChange} />;
  if (f.type === "select") return <CustomSelect openOnFocus value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp}>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</CustomSelect>;
  if (f.type === "staff") return <StaffSelect value={value} onChange={onChange} staff={staff} exclude={[meUid]} placeholder="선택 안 함" />;
  if (f.type === "date") return <CustomDatePicker value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp} showIcon placeholder="날짜 선택" />;
  if (f.type === "notice") return (
    <div className="rounded-xl border border-[#C9D6EE] bg-[#F5F8FD] p-3.5 space-y-1.5 max-h-[260px] overflow-y-auto">
      {(f.text || []).map((t, i) => <div key={i} className="text-[13px] leading-relaxed text-[#1B2B4B] font-semibold">{t}</div>)}
    </div>
  );
  if (f.type === "checks") {
    const v = value || [];
    return (
      <div className="space-y-1.5">
        {(f.options || []).map((o) => { const on = v.includes(o); return (
          <button key={o} type="button" onClick={() => onChange(on ? v.filter((x) => x !== o) : [...v, o])} className={`w-full min-h-11 px-3 py-2 rounded-xl border text-left text-[13.5px] font-bold flex items-center gap-2.5 ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#D3DBE8] text-[#0F1A30] hover:bg-[#F5F8FD]"}`}>
            <span className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center text-[12px] ${on ? "border-white" : "border-[#9AB0D6]"}`}>{on ? "✓" : ""}</span>{o}
          </button>
        ); })}
      </div>
    );
  }
  if (f.type === "timerange") {
    const v = value || {};
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <TimeSelect value={v.start || ""} onChange={(x) => onChange({ ...v, start: x })} emptyLabel="시작" minuteStep={10} />
        <span className="text-[#5B6B85] font-black">~</span>
        <TimeSelect value={v.end || ""} onChange={(x) => onChange({ ...v, end: x })} emptyLabel="종료" minuteStep={10} />
      </div>
    );
  }
  // ⭐ 2026-11-04 시간은 프로그램 공용 시간 고르기(오전/오후 · 시 · 분) — 값은 예전처럼 "HH:MM"
  if (f.type === "time") return <TimeSelect value={value || ""} onChange={onChange} emptyLabel="선택" minuteStep={10} className="!h-11" />;
  if (f.type === "number") return f.unit ? (
    <div className="relative"><input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`${inp} pr-12 text-right`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13.5px] font-bold text-[#5B6B85]">{f.unit}</span></div>
  ) : <input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inp} />;
  if (f.type === "money") {
    return (
      <div className="relative">
        <input inputMode="numeric" value={value ? Number(value).toLocaleString("ko-KR") : ""} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} pr-9 text-right tabular-nums`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13.5px] font-bold text-[#5B6B85]">원</span>
      </div>
    );
  }
  if (f.type === "daterange") {
    const v = value || {};
    const n = dayDiff(v);
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><CustomDatePicker value={v.start || ""} onChange={(e) => onChange({ ...v, start: e.target.value, end: v.end && v.end >= e.target.value ? v.end : e.target.value })} className={inp} showIcon placeholder="시작일" /></div>
          <span className="text-[#5B6B85] font-bold">~</span>
          <div className="flex-1 min-w-0"><CustomDatePicker value={v.end || ""} onChange={(e) => onChange({ ...v, end: e.target.value && v.start && e.target.value < v.start ? v.start : e.target.value })} className={inp} showIcon placeholder="종료일" /></div>
        </div>
        {n > 0 && <div className="mt-1 text-[13px] font-bold text-[#1B2B4B]">총 {n}일{!f.calendar && bizDays(v) !== n ? ` · 주말·공휴일 빼면 ${bizDays(v)}일` : ""}</div>}
      </div>
    );
  }
  if (f.type === "items") {
    const rows = value || [];
    const set = (i, k, val) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
    return (
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={r.name || ""} onChange={(e) => set(i, "name", e.target.value)} placeholder="품목·내용" className={`${inp} flex-1 min-w-0`} />
            <input inputMode="numeric" value={r.qty ?? ""} onChange={(e) => set(i, "qty", e.target.value.replace(/[^\d.]/g, ""))} placeholder="수량" className={`${inp} !w-14 text-center`} />
            <input inputMode="numeric" value={r.price ? Number(r.price).toLocaleString("ko-KR") : ""} onChange={(e) => set(i, "price", e.target.value.replace(/[^\d]/g, ""))} placeholder="단가" className={`${inp} !w-24 text-right`} />
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1} className="w-8 h-8 shrink-0 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD] disabled:opacity-30">✕</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => onChange([...rows, { name: "", qty: 1, price: "" }])} className="text-[13.5px] font-bold text-[#4B6CB7]">+ 행 추가</button>
          <span className="text-[14px] font-black text-[#0F1A30]">합계 {fmtWon(itemsTotal(rows))}</span>
        </div>
      </div>
    );
  }
  if (f.type === "costs") {
    const rows = value || [];
    const set = (i, k, val) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
    return (
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={r.label || ""} onChange={(e) => set(i, "label", e.target.value)} className={`${inp} !w-28 shrink-0`} />
            <div className="relative flex-1">
              <input inputMode="numeric" value={r.amount ? Number(r.amount).toLocaleString("ko-KR") : ""} onChange={(e) => set(i, "amount", e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className={`${inp} pr-8 text-right`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#5B6B85]">원</span>
            </div>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="w-8 h-8 shrink-0 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD]">✕</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => onChange([...rows, { label: "기타", amount: "" }])} className="text-[13.5px] font-bold text-[#4B6CB7]">+ 항목 추가</button>
          <span className="text-[14px] font-black text-[#0F1A30]">합계 {fmtWon(costsTotal(rows))}</span>
        </div>
      </div>
    );
  }
  return <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={f.ph || ""} className={inp} />;
}

// 📑 2026-11-08 회사의 최종 승인된 사업계획서(관련 사업계획 고르기) — firestore.rules: 같은 회사 사무 직원은 승인된 사업계획서를 읽을 수 있다
const demoApOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
export function useApprovedPlans(company, enabled = true) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    if (!enabled || !company) return undefined;
    if (demoApOn() && isPreviewMode()) { setList(bizPlanDemo(company).plans.filter((d) => d.status === "approved")); return undefined; }
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("form", "==", "bizplan"), where("status", "==", "approved")),
      (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.form === "bizplan" && d.status === "approved").sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))), () => setList([]));
  }, [company, enabled]);
  return list;
}

// ─────────────────────────── 결재선 편집 ───────────────────────────
function useLineTemplates(company, uid) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvalLines"), where("company", "==", company)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.shared || t.ownerUid === uid)), () => setList([]));
  }, [company, uid]);
  return list;
}
const pickUser = (staff, uid) => { const u = (staff || []).find((x) => x.uid === uid); return u ? { uid: u.uid, name: u.name || u.email || "", position: u.position || "", team: u.team || "" } : null; };

// 👔 대표(대표·대표이사·사장)는 최종 결재자 — 결재자를 추가해도 사용자가 직접 순서를 바꾸지 않았다면 맨 뒤로
const isCeoPos = (p) => /대표|사장/.test(String(p || "")) && !/부사장/.test(String(p || ""));
const ceoLast = (list) => [...list.filter((x) => !isCeoPos(x.position)), ...list.filter((x) => isCeoPos(x.position))];
// 📑 사업계획서 결재선 점검표(필수 구성원) — 결재선 편집 칸 위
function BizLineCheck({ line, staff, me }) {
  const v = validateBizLine(line, staff, me);
  const ppl = (line || []).map((x) => ({ ...x, ...((staff || []).find((u) => u.uid === x.uid) || {}) }));
  const items = [
    ["경리·회계·재무 합의", ppl.some((p) => isFinPerson(p) && p.kind === "합의"), "예산 검토"],
    ["임원 결재", ppl.some((p) => isExecNonCeo(p) && (p.kind || "결재") === "결재") || !(staff || []).some((u) => u.uid !== me.uid && isExecNonCeo(u)), "대표 앞"],
    ["대표 최종 결재", isCeoPerson(me) || (ppl.length > 0 && isCeoPerson(ppl[ppl.length - 1]) && (ppl[ppl.length - 1].kind || "결재") === "결재"), "맨 끝"],
  ];
  return (
    <div className={`mb-3 rounded-xl border px-3.5 py-3 ${v.ok ? "border-[#C9D6EE] bg-[#F5F8FD]" : "border-[#0F1A30] bg-white"}`} data-bizline-check={v.ok ? "ok" : "bad"}>
      <div className="text-[13px] font-black text-[#0F1A30]">사업계획서 필수 결재선</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map(([l, ok, sub]) => (
          <span key={l} className={`h-7 px-2.5 rounded-lg text-[12.5px] font-black inline-flex items-center gap-1.5 ${ok ? "bg-[#1B2B4B] text-white" : "border border-dashed border-[#9AB0D6] text-[#3A4A66] bg-white"}`}>
            <span aria-hidden>{ok ? "✓" : "○"}</span>{l}<span className={`font-semibold ${ok ? "text-white/70" : "text-[#8E9BB2]"}`}>{sub}</span>
          </span>
        ))}
      </div>
      {!v.ok && <div className="mt-2 text-[12.5px] font-semibold text-[#3A4A66] leading-relaxed break-keep" data-bizline-msg>{v.errors[0]}</div>}
      {v.ok && v.warnings[0] && <div className="mt-2 text-[12.5px] font-semibold text-[#5B6B85] break-keep">{v.warnings[0]}</div>}
    </div>
  );
}
const suggestFor = (form, staff, me) => (needsBizLine(form?.key) ? suggestBizLine(staff, me) : suggestLine(staff, me));
function LineEditor({ line, setLine, cc, setCc, staff, me, company, cat, form }) {
  const tpls = useLineTemplates(company, me.uid);
  const used = [me.uid, ...line.map((s) => s.uid)];
  const manualOrder = React.useRef(false); // ▲▼로 직접 순서를 바꿨으면 자동 정렬하지 않는다
  const addTo = (users) => setLine((p) => { const n = [...p, ...users]; return manualOrder.current ? n : ceoLast(n); });
  const move = (i, d) => setLine((p) => { manualOrder.current = true; const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const load = (id) => {
    if (id === "__auto") { manualOrder.current = false; setLine(suggestFor(form, staff, me)); return; }
    const t = tpls.find((x) => x.id === id);
    if (!t) return;
    setLine((t.steps || []).map((s) => ({ ...(pickUser(staff, s.uid) || s), kind: s.kind || "결재" })).filter((s) => s.uid !== me.uid));
    setCc((t.cc || []).filter((c) => c.uid !== me.uid));
  };
  const save = async () => {
    if (!line.length) return;
    const name = (await kpPrompt("결재선 이름", `${catOf(cat).label} 결재선`));
    if (!name) return;
    await addDoc(collection(db, "approvalLines"), { company, name, ownerUid: me.uid, ownerName: me.name, shared: false, cats: [cat], steps: line.map(({ uid, name: n, position, kind }) => ({ uid, name: n, position, kind })), cc, createdAt: serverTimestamp() }).catch((e) => window.alert(e.message));
  };
  return (
    <div className="space-y-3">
      {needsBizLine(form?.key) && <BizLineCheck line={line} staff={staff} me={me} />}
      <div className="flex items-center gap-1.5">
        <CustomSelect openOnFocus value="" onChange={(e) => { load(e.target.value); e.target.value = ""; }} className={`${inp} flex-1`}>
          <option value="">결재선 불러오기…</option>
          <option value="__auto">{needsBizLine(form?.key) ? "자동 추천(팀장 → 경리·회계·재무 합의 → 임원 → 대표)" : "자동 추천(부서장 → 임원 → 대표)"}</option>
          {tpls.filter((t) => !t.cats?.length || t.cats.includes(cat)).map((t) => <option key={t.id} value={t.id}>{t.shared ? "[공용] " : ""}{t.name}</option>)}
        </CustomSelect>
        <button type="button" onClick={save} disabled={!line.length} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#3A4A66] disabled:opacity-40 shrink-0">저장</button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]">
          <span className="w-6 h-6 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black flex items-center justify-center">기</span>
          <span className="text-[14.5px] font-black text-[#0F1A30]">{me.name}</span><span className="text-[13px] text-[#5B6B85]">{me.position} · 기안자</span>
        </div>
        {line.map((s, i) => (
          <div key={`${s.uid}-${i}`} className="flex items-center gap-1.5">
            <span className="w-6 h-6 shrink-0 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black flex items-center justify-center">{i + 1}</span>
            <div className="flex-1 min-w-0"><StaffSelect value={s.uid} staff={staff} exclude={used.filter((u) => u !== s.uid)} onChange={(uid) => { const u = pickUser(staff, uid); if (u) setLine((p) => p.map((x, j) => (j === i ? { ...x, ...u } : x))); }} /></div>
            <CustomSelect openOnFocus value={s.kind || "결재"} onChange={(e) => setLine((p) => p.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className={`${inp} !w-[74px] shrink-0 px-2`}>
              <option>결재</option><option>합의</option>
            </CustomSelect>
            <div className="flex flex-col shrink-0">
              <button type="button" onClick={() => move(i, -1)} className="w-6 h-4 text-[11px] text-[#5B6B85] hover:text-[#0F1A30]">▲</button>
              <button type="button" onClick={() => move(i, 1)} className="w-6 h-4 text-[11px] text-[#5B6B85] hover:text-[#0F1A30]">▼</button>
            </div>
            <button type="button" onClick={() => setLine((p) => p.filter((_, j) => j !== i))} className="w-7 h-8 shrink-0 rounded-lg text-[#5B6B85] hover:bg-[#F5F8FD]">✕</button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <div className="flex-1 min-w-0"><StaffSelect value="" staff={staff} exclude={used} placeholder="+ 결재자 추가" onChange={(uid) => { const u = pickUser(staff, uid); if (u) addTo([{ ...u, kind: "결재" }]); }} /></div>
          <StaffMultiPick staff={staff} exclude={used} label="결재자 여러 명" onAdd={(uids) => addTo(uids.map((x) => pickUser(staff, x)).filter(Boolean).map((u) => ({ ...u, kind: "결재" })))} />
        </div>
      </div>
      <div>
        <div className="text-[13px] font-bold text-[#5B6B85] mb-1.5">참조자 <span className="font-semibold">(결재 완료 시 알림)</span></div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {cc.map((c) => <span key={c.uid} className="h-7 pl-2.5 pr-1 rounded-lg bg-[#EEF3FB] border border-[#D5E0F2] text-[13.5px] font-bold text-[#1B2B4B] inline-flex items-center gap-1">{c.name}<button type="button" onClick={() => setCc((p) => p.filter((x) => x.uid !== c.uid))} className="w-5 h-5 text-[#5B6B85]">✕</button></span>)}
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 min-w-0"><StaffSelect value="" staff={staff} exclude={[me.uid, ...cc.map((c) => c.uid)]} placeholder="+ 참조자 추가" onChange={(uid) => { const u = pickUser(staff, uid); if (u) setCc((p) => [...p, { uid: u.uid, name: u.name }]); }} /></div>
          <StaffMultiPick staff={staff} exclude={[me.uid, ...cc.map((c) => c.uid)]} label="참조자 여러 명" onAdd={(uids) => setCc((p) => [...p, ...uids.map((x) => pickUser(staff, x)).filter(Boolean).map((u) => ({ uid: u.uid, name: u.name }))])} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 내 연차 현황 ───────────────────────────
//  입사일(userProfiles.hireDate) 기준 회기 동안 — 전자결재 연차·반차(승인=사용, 진행 중=대기)
//  + 예전 휴가/외근 게시판에 올린 휴가·반차(2026년부터, 반려 제외)도 사용으로 센다.
function useLeaveStatus(me, list, company) {
  const [hireDate, setHireDate] = React.useState(null);
  const [adjust, setAdjust] = React.useState([]); // 인사관리자 연차 조정 이력(본인에게도 보인다)
  const [olds, setOlds] = React.useState([]);
  const basis = useLeaveBasis(company); // ⭐ 2026-11-07 회사 회기 기준(입사일 / 회계연도)
  React.useEffect(() => {
    if (!me.uid) return undefined;
    const a = onSnapshot(doc(db, "userProfiles", me.uid), (s) => { setHireDate((s.exists() && s.data().hireDate) || ""); setAdjust((s.exists() && s.data().leaveAdjust) || []); }, () => setHireDate(""));
    const b = onSnapshot(query(collection(db, "schedules"), where("authorUid", "==", me.uid)), (s) => setOlds(s.docs.map((d) => d.data())), () => setOlds([]));
    return () => { a(); b(); };
  }, [me.uid]);
  // ⭐ 2026-11-07 내정보 · 인사관리부와 같은 계산(leaveUtils.leaveStatusOf) — 승인된 것만 사용 · 진행 중은 대기
  return React.useMemo(() => {
    const st = leaveStatusOf({ hireDate: hireDate || "", uid: me.uid, name: me.name, approvals: list || [], schedules: olds, adjust, basis });
    if (!st) return { ent: null, hireDate, loading: hireDate === null };
    return { ent: st.ent, hireDate, used: st.used, pending: st.pending, remain: st.remain, adj: st.adj, adjSum: st.adjSum };
  }, [hireDate, olds, list, me.uid, me.name, adjust, basis]);
}

function LeaveCard({ leave, thisDays }) {
  if (!leave || leave.loading) return null;
  if (!leave.ent) {
    return (
      <div className="rounded-2xl border border-dashed border-[#C9D2E0] bg-white p-4 text-[14px] text-[#5B6B85] leading-relaxed">
        <b className="text-[#0F1A30]">입사일이 등록되지 않아 연차를 계산할 수 없습니다.</b><br />내 정보 또는 인사관리부에서 입사일을 등록하면 발생·사용·잔여 연차가 자동으로 표시됩니다.
      </div>
    );
  }
  const { ent, used, pending, remain } = leave;
  const after = remain - pending - (thisDays || 0);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / Math.max(ent.total, 1)) * 100))}%`;
  const y = Math.floor(ent.months / 12); const m = ent.months % 12;
  return (
    <div className="rounded-2xl p-5 text-white shadow-[0_12px_28px_rgba(15,26,48,0.22)]" style={{ background: "linear-gradient(120deg,#0F1A30,#1B2B4B 60%,#2D4C82)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MY LEAVE</span>
        <span className="ml-auto text-[12.5px] font-bold text-white/55">입사 {leave.hireDate} · 근속 {y ? `${y}년 ` : ""}{m}개월</span>
      </div>
      <div className="mt-1 text-[16px] font-black">내 {ent.label} 현황 <span className="text-[13px] font-bold text-white/55">{ent.from} ~ {ent.to}</span></div>
      {leave.adjSum ? <div className="mt-1 text-[12.5px] font-bold text-[#CFE0FF]">인사 조정 {leave.adjSum > 0 ? "+" : ""}{leave.adjSum}일 · {(leave.adj || []).map((x) => x.reason).filter(Boolean).slice(-2).join(" / ")}</div> : null}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[["발생", ent.total], ["사용", used], ["결재 대기", pending], ["잔여", remain]].map(([l, v]) => (
          <div key={l} className={`rounded-xl px-2.5 py-2 ${l === "잔여" ? "bg-white text-[#0F1A30]" : "bg-white/[0.08]"}`}>
            <div className={`text-[12px] font-bold ${l === "잔여" ? "text-[#5B6B85]" : "text-white/55"}`}>{l}</div>
            <div className="text-[19px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}<span className="text-[12px] font-bold ml-0.5">일</span></div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden flex">
        <div className="h-full bg-white" style={{ width: pct(used) }} />
        <div className="h-full bg-white/45" style={{ width: pct(pending) }} />
        <div className="h-full bg-[#8FB0F0]" style={{ width: pct(thisDays || 0) }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px] font-bold">
        <span className="text-white/60">사용 · 대기 · 이번 신청</span>
        {thisDays > 0 && <span className={after < 0 ? "text-white underline" : "text-white/90"}>이번 신청 {thisDays}일 → 신청 후 잔여 {after}일{after < 0 ? " (초과)" : ""}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────── 작성 화면 ───────────────────────────
// ⚙ 결재 설정(회사별) — 일일 업무일지 자동 승인(임원이 켜고 끈다)
// 🔗 최종 승인 후 연동(장부·사직서·육아휴직) — 결재자가 승인할 때와 자동 승인될 때 모두 같은 처리
function runApprovedHooks(d, company, me) {
  // 🧾 2026-11-10 차량 비용 영수증에서 만든 지출결의 → 영수증 "승인"(기사앱에도 승인)
  if (Array.isArray(d.data?.vexIds) && d.data.vexIds.length) syncExpensesWithApproval(d, "approved");
  // 🗂 인사발령 품의 최종 승인 → 대상자 인사 정보에 "결재 완료 발령"(인사기록 › 인사발령에서 [결재 내용 불러오기] → 공문 게시)
  if (d.form === "personnel" && d.data?.target) {
    const x = d.data;
    updateDoc(doc(db, "users", x.target), {
      pendingOrder: { approvalId: d.id || "", docNo: d.docNo || "", kind: x.kind || "", toTeam: x.toTeam || "", toPosition: x.toPosition || "", date: x.date || "", reason: x.reason || "", note: x.note || "", at: Date.now() },
    }).catch(() => {});
  }
  // 🔗 2026-11-01 비용·지출 결의 최종 승인 → 수입·지출 장부에 자동 기록(경리가 [가져오기] 누를 필요 없음, 같은 문서는 한 줄)
  if (d.cat === "expense" && Number(d.amount) > 0) {
    const dd = d.data || {};
    defaultFundId(db, company, "expense").then((fundId) => setDoc(doc(db, "acctLedger", `appr_${d.id}`), {
      fundId, date: dd.date || dd.spendDate || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), type: "지출", account: dd.account || "기타",
      item: d.title || d.formLabel || "지출결의", amount: Number(d.amount) || 0, method: dd.pay || dd.method || "법인카드", vendor: dd.vendor || "",
      memo: `전자결재 ${d.docNo || ""} · ${d.drafter?.name || ""}`, evidence: "전자결재", receipt: (d.images || [])[0] || "", receiptFile: ((d.files || []).find((f) => String(f.type || "").startsWith("image/") || f.type === "application/pdf") || {}).path || "", sourceId: d.id, auto: "approval", ...(d.planId ? { planId: d.planId } : {}),
      companyName: company, createdAt: serverTimestamp(), createdBy: me?.email || "",
    }, { merge: true })).catch(() => {});
  }
  // 🔗 2026-11-01 사직서 최종 승인 → 인사 정보에 "퇴사 예정"(퇴직 희망일) 자동 등록 — 그날 인사관리부에서 [퇴사 확정]
  if (d.form === "resign" && d.drafterUid) {
    const last = d.data?.last || "";
    const reason = String(d.data?.reason || "").trim();
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    updateDoc(doc(db, "users", d.drafterUid), {
      resignPlan: { type: "자진 퇴사", date: last, reason: reason || "사직서 제출", noticeDate: today, by: "전자결재", docNo: d.docNo || "" },
      personnelHistory: arrayUnion({ date: today, type: "사직서 승인", detail: `퇴직 희망일 ${last} · 전자결재 ${d.docNo || ""}` }),
    }).catch(() => {});
  }
  // 👶 육아휴직·출산휴가 최종 승인 → 인사 정보 재직 상태 반영(권한이 없으면 인사관리부에서 직접 바꾸면 된다)
  if (["parental", "maternity"].includes(d.form) && d.drafterUid) {
    const kind = d.data?.kind || "";
    const st = d.form === "parental" ? (kind === "육아기 근로시간 단축" ? "" : "육아휴직") : (kind === "출산전후휴가" ? "출산휴가" : "");
    const pr = d.data?.period || {};
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    updateDoc(doc(db, "users", d.drafterUid), {
      ...(st ? { employmentStatus: st, leave: { type: st, from: pr.start || "", to: pr.end || "", memo: `전자결재 ${d.docNo || ""}` } } : {}),
      personnelHistory: arrayUnion({ date: today, type: kind || st, detail: `${pr.start || ""}${pr.end ? ` ~ ${pr.end}` : ""} · 전자결재 ${d.docNo || ""}` }),
    }).catch(() => {});
  }
}

// 🤖 2026-11-01 자동 승인(부재·위임) — approvalSettings/{회사}.autoApprovers[uid] = { on, from, to, maxAmount, skipForms[], name }
//  결재 차례가 켜 둔 사람에게 오면 그 자리에서 승인하고 다음 결재자로 넘긴다(기록: "자동 승인(부재·위임 설정)")
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export function autoApproveOn(cfg, uid, d) {
  const a = cfg?.autoApprovers?.[uid];
  if (!a || a.on !== true) return false;
  // ⭐ 2026-11-01 임원만 — 예전에 임원이 아닌 직원이 켜 둔 설정은 무시한다
  if (!(a.exec === true || isExecPosition(a.position))) return false;
  const t = kstToday();
  if (a.from && t < a.from) return false;
  if (a.to && t > a.to) return false;
  if (Number(a.maxAmount) > 0 && Number(d.amount || 0) > Number(a.maxAmount)) return false;
  if ((a.skipForms || []).includes(d.form)) return false;
  return true;
}
export function runAutoApprove(d, cfg) {
  const line = (d.line || []).map((x) => ({ ...x }));
  let i = Number(d.step) || 0; let changed = false; const hist = [];
  while (i < line.length && line[i].status === "pending" && autoApproveOn(cfg, line[i].uid, d)) {
    line[i] = { ...line[i], status: "approved", at: Date.now(), comment: "자동 승인(부재·위임 설정)", auto: true };
    hist.push({ at: Date.now(), uid: line[i].uid, name: line[i].name, action: "자동 승인", comment: "부재·위임 설정" });
    changed = true;
    if (i + 1 < line.length) { line[i + 1] = { ...line[i + 1], status: "pending" }; i += 1; } else return { changed, line, step: i, status: "approved", hist };
  }
  return { changed, line, step: i, status: "pending", hist };
}

export function useApprovalSettings(company) {
  const [s, setS] = React.useState({});
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "approvalSettings", company), (d) => setS(d.exists() ? d.data() : {}), () => setS({}));
  }, [company]);
  return s;
}
export async function setAutoApproveDaily(company, on, who = "") {
  const { setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "approvalSettings", company), { companyName: company, autoApproveDaily: !!on, updatedBy: who, updatedAt: serverTimestamp() }, { merge: true });
}
// ⭐ 2026-11-02 점검 — 첨부 이미지 합계를 문서 1MB 한도 안(700KB)으로 줄인다(사내메일 fitImages와 같은 방식, 결재 기록이 더 붙을 여유를 둠)
async function fitApprovalImages(images, limit = 700000) {
  let imgs = (images || []).slice(0, 3);
  for (let i = 0; i < 4 && imgs.join("").length > limit; i += 1) {
    const max = [1200, 1000, 820, 680][i];
    imgs = await Promise.all(imgs.map((src) => compressImage(src, max, 0.72)));
  }
  if (imgs.join("").length > limit) throw new Error("첨부 이미지가 너무 큽니다. 장수를 줄여 주세요.");
  return imgs;
}
function Composer({ company, me, staff, cat, preset, onDone, leave, getLive, myDocs = [], canHr = false }) {
  const apSettings = useApprovalSettings(company);
  const editId = preset?.editId || null;
  // 🗂 2026-11-04 인사발령 품의는 인사 담당자(인사 담당이 없으면 회사 마스터)만 — canHrDraft()
  const forms = formsOfCat(cat).filter((f) => f.key !== "personnel" || canHr || (editId && preset?.form === "personnel"));
  const inForms = (k) => !!k && forms.some((f) => f.key === k);
  // ✋ 2026-11-01 임시저장(이 기기) — 새 문서 작성일 때만, 다시 오면 이어서
  const draftKey = `ap:${me.uid}:${cat}`;
  const [draft] = React.useState(() => (!preset ? draftStore.get(draftKey) : null));
  const init = draft && formOf(draft.formKey)?.cat === cat ? draft : preset;
  const [formKey, setFormKey] = React.useState(inForms(init?.form) ? init.form : inForms(init?.formKey) ? init.formKey : forms[0].key);
  const form = formOf(formKey);
  const [data, setData] = React.useState(() => { const d0 = init?.data && (init.form === formKey || init.formKey === formKey) ? init.data : initialData(form); return form.normalize ? form.normalize(d0) : d0; }); // ⭐ 2026-11-02 예전 지출결의(지출처 1곳)도 지출 내역 행으로
  const [title, setTitle] = React.useState(init?.title || "");
  const [line, setLine] = React.useState(init?.line || []);
  const [cc, setCc] = React.useState(init?.cc || []);
  const [images, setImages] = React.useState(init?.images || []);
  // 📎 2026-11-08 첨부 파일(Storage) — 새 문서는 문서 id를 미리 정해 그 폴더(approvals/{회사}/{id}/)에 올린다(임시저장에도 id를 같이 남김)
  const [docId] = React.useState(() => editId || (draft?.docId && draft.formKey ? draft.docId : doc(collection(db, "approvals")).id));
  const [files, setFiles] = React.useState(() => (Array.isArray(init?.files) ? init.files.filter((f) => f?.path) : []));
  const savedPaths = React.useRef(new Set(editId ? (preset?.files || []).map((f) => f.path) : []));
  const [removed, setRemoved] = React.useState([]); // 수정 중 뺀 저장된 파일 — [수정 저장] 뒤에 지운다
  const [restored, setRestored] = React.useState(!!draft);
  const dirty = !editId && JSON.stringify({ data, title, images, cc, files }) !== JSON.stringify({ data: initialData(form), title: "", images: [], cc: [], files: [] });
  useLeaveGuard(dirty, {
    label: form.label,
    onSave: () => { if (!draftStore.set(draftKey, { formKey, data, title, line, cc, images, files, docId })) draftStore.set(draftKey, { formKey, data, title, line, cc, images: [], files, docId }); },
    onDiscard: () => { draftStore.del(draftKey); files.filter((f) => inDocDir(f, company, docId) && !savedPaths.current.has(f.path)).forEach((f) => removeApFile(f).catch(() => {})); },
  });
  const removeFile = (f) => {
    setFiles((p) => p.filter((x) => x.path !== f.path));
    if (savedPaths.current.has(f.path)) { setRemoved((p) => [...p, f]); return; } // 저장된 문서의 파일은 [수정 저장] 뒤에 지운다
    if (inDocDir(f, company, docId)) removeApFile(f).catch(() => {}); // 방금 올린 파일 · 재기안해 가져온 예전 문서 파일은 목록에서만 뺀다
  };
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [upBusy, setUpBusy] = React.useState(0); // 📎 올리는 중인 첨부 수
  const [lightbox, setLightbox] = React.useState(null); // ⭐ 2026-11-04 첨부 크게 보기
  const autoLined = React.useRef(!!init?.line?.length);

  // 결재선이 비어 있으면 직원 목록이 오는 대로 자동 추천
  React.useEffect(() => { if (!autoLined.current && staff && staff.length) { autoLined.current = true; setLine(suggestFor(form, staff, me)); } }, [staff, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickForm = (k) => {
    if (editId) return;
    const nf = formOf(k);
    // 📑 사업계획서로(또는 사업계획서에서) 바꾸면 결재선을 그 양식 규칙에 맞게 다시 추천
    if (needsBizLine(nf.key) !== needsBizLine(form.key) && staff && staff.length) setLine(suggestFor(nf, staff, me));
    setFormKey(k); setData(initialData(nf)); setTitle(""); setMsg(""); setMissing([]);
  };
  // 입력 초기화 — 같은 양식을 처음 상태로(제목·내용·첨부·결재선 추천값). 저장된 문서에는 영향 없음
  const resetAll = async () => {
    if (!await kpConfirm("입력한 내용을 모두 지우고 처음 상태로 되돌릴까요?")) return;
    files.filter((f) => inDocDir(f, company, docId) && !savedPaths.current.has(f.path)).forEach((f) => removeApFile(f).catch(() => {}));
    setData(initialData(form)); setTitle(""); setImages([]); setFiles([]); setCc([]); setMsg(""); draftStore.del(draftKey); setRestored(false);
    setLine(staff && staff.length ? suggestFor(form, staff, me) : []);
  };
  const [missing, setMissing] = React.useState([]);
  // ⭐ 2026-11-04 고르기 목록 — 부서·직책(인사 설정 hrSettings), 거래처·차량(이 양식이 쓸 때만 구독)
  const hrOpt = useHrOptions(company);
  const refs = useApprovalRefs(company, { clients: form.fields.some((f) => f.pick === "clients"), cars: form.fields.some((f) => f.pick === "cars" || f.pick === "carDriver") });
  const plans = useApprovedPlans(company, form.fields.some((f) => f.type === "plan"));
  const fieldCtx = { hr: hrOpt, refs, data, plans };
  const setField = (f, v) => setData((p) => { const n = { ...p, [f.k]: v }; const extra = form.autofill ? form.autofill(f.k, v, p, { staff }) : null; return extra ? { ...n, ...extra } : n; });
  const docName = String(form.title || form.label).replace(/\s+/g, "").replace(/·/g, "·");
  const autoTitle = `${todayDots()} ${docName}_${me.name || ""}${me.position ? ` ${me.position}` : ""}`; // ⭐ 2026-11-02 이름·직책 사이 띄어쓰기
  const finalTitle = (title || autoTitle || form.label).trim();

  const submit = async () => {
    const miss = missingFields(form, data);
    const missKeys = form.fields.filter((f) => miss.includes(f.label)).map((f) => f.k);
    setMissing(missKeys);
    if (miss.length) {
      setMsg(`빠진 필수 입력: ${miss.join(", ")}`);
      // 첫 번째 빠진 칸으로 이동 + 포커스
      setTimeout(() => {
        const el = document.getElementById(`apf-${missKeys[0]}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = el.querySelector("input:not([type=hidden]),textarea,button");
        t?.focus();
        el.classList.remove("kp-req-flash"); void el.offsetWidth; el.classList.add("kp-req-flash"); setTimeout(() => el.classList.remove("kp-req-flash"), 3200); // ⭐ 2026-11-10 빨간 테두리 깜빡임(계약서와 같게)
      }, 30);
      return;
    }
    if (!line.length) { setMsg("결재자를 1명 이상 지정해 주세요."); return; }
    // 📑 2026-11-08 사업계획서 — 경리·회계·재무 합의 · 임원 · 대표 최종 결재가 없으면 상신을 막는다(서버 규칙도 같은 검사)
    const bizV = needsBizLine(form.key) ? validateBizLine(line, staff, me) : null;
    if (bizV && !bizV.ok && !editId) { setMsg(bizV.errors.join(" ")); document.querySelector("[data-bizline-check]")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (upBusy > 0) { setMsg("첨부 파일을 올리는 중이에요. 다 올라간 뒤 다시 눌러 주세요."); return; }
    const pdRaw0 = form.prepare ? form.prepare(data) : data;
    const pdRaw = pdRaw0; // ⭐ 2026-11-09 계정과목은 작성자 누구나 고른다(경리는 지급할 때 바꾸거나 새로 추가) // ⭐ 2026-11-02 지출결의 — 빈 행 빼고 예전 칸(지출처·입금계좌·지출일) 채움
    const pd = form.fields.some((f) => f.type === "plan") && !pdRaw.planId ? { ...pdRaw, planId: "", planName: "" } : pdRaw;
    const fileMeta = files.slice(0, AP_FILE_COUNT).map(({ name, size, type, path, uploadedBy, uploadedByName, at }) => ({ name, size, type, path, uploadedBy: uploadedBy || "", uploadedByName: uploadedByName || "", at: at || Date.now() }));
    if (editId) {
      const live = getLive?.(editId);
      if (!live || !canEdit(live, me.uid)) { setMsg("결재자가 이미 문서를 열어봐서 수정할 수 없습니다. 회수 후 재기안해 주세요."); return; }
      if (!await kpConfirm("수정한 내용으로 문서를 바꿀까요?")) return;
      setBusy(true); setMsg("");
      try {
        const imgs = await fitApprovalImages(images); // ⭐ 2026-11-02 점검 — 첨부 이미지 크기 맞춤
        await updateDoc(doc(db, "approvals", editId), {
          title: finalTitle, data: pd, images: imgs, files: fileMeta, summary: form.summary ? form.summary(pd) : "", amount: form.amount ? form.amount(pd) : 0, days: form.days ? form.days(pd) : 0,
          ...(PLAN_LINK_FORMS.includes(form.key) ? { planId: pd.planId || "" } : {}),
          updatedAt: serverTimestamp(), history: arrayUnion({ at: Date.now(), uid: me.uid, name: me.name, action: "수정", comment: "" }),
        });
        removed.filter((f) => inDocDir(f, company, docId)).forEach((f) => removeApFile(f).catch(() => {}));
        onDone();
      } catch (e) { setMsg(e.message || "수정 실패"); } finally { setBusy(false); }
      return;
    }
    if (!await kpConfirm(`「${finalTitle}」 문서를 ${line.map((s) => s.name).join(" → ")} 순서로 결재 상신할까요?`)) return;
    setBusy(true); setMsg("");
    try {
      const imgs = await fitApprovalImages(images); // ⭐ 2026-11-02 점검 — 첨부 이미지 합계가 1MB 문서 한도를 넘지 않게 줄임
      const now = new Date();
      const docNo = `${form.code}-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      // 🤖 일일 업무일지 자동 승인(임원 설정) — 켜져 있으면 상신과 동시에 결재선 전원 승인 처리
      const auto = form.key === "daily" && apSettings.autoApproveDaily === true;
      const L = line.map((s, i) => (auto
        ? { uid: s.uid, name: s.name, position: s.position || "", team: s.team || "", kind: s.kind || "결재", status: "approved", at: Date.now(), comment: "자동 승인(일일 업무일지)" }
        : { uid: s.uid, name: s.name, position: s.position || "", team: s.team || "", kind: s.kind || "결재", status: i === 0 ? "pending" : "wait", at: 0, comment: "" }));
      const payload = {
        company, docNo, cat, form: form.key, formLabel: form.label, title: finalTitle,
        summary: form.summary ? form.summary(pd) : "", amount: form.amount ? form.amount(pd) : 0, days: form.days ? form.days(pd) : 0,
        data: pd, images: imgs, files: fileMeta, drafterUid: me.uid, drafter: { uid: me.uid, name: me.name, team: me.team || "", position: me.position || "" },
        ...(PLAN_LINK_FORMS.includes(form.key) && pd.planId ? { planId: pd.planId } : {}),
        ...(bizV ? { finIdx: bizV.finIdx } : {}),
        line: L, cc, ccUids: cc.map((c) => c.uid), participants: [...new Set([me.uid, ...L.map((s) => s.uid), ...cc.map((c) => c.uid)])],
        step: auto ? L.length : 0, status: auto ? "approved" : "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        history: [{ at: Date.now(), uid: me.uid, name: me.name, action: "상신", comment: "" }, ...(auto ? [{ at: Date.now(), uid: "auto", name: "자동 승인", action: "승인", comment: "임원 설정 — 일일 업무일지 자동 승인" }] : [])], redraftOf: preset?.id || null,
        ...(auto ? { autoApproved: true } : {}),
      };
      // ⭐ 2026-11-02 점검 — 자동 승인 후에도 진행 중이면 상신 전에 미리 반영(자동 승인한 첫 결재자에게 '결재 요청' 푸시가 가지 않게). 최종 승인까지 가는 경우만 상신 후 저장
      let pre = null;
      if (!auto) {
        pre = runAutoApprove(payload, apSettings);
        if (pre.changed && pre.status === "pending") Object.assign(payload, { line: pre.line, step: pre.step, history: [...payload.history, ...pre.hist] });
      }
      const ref = doc(db, "approvals", docId); // 📎 첨부를 올린 폴더와 같은 문서 id
      await setDoc(ref, payload);
      draftStore.del(draftKey);
      if (Array.isArray(pd.vexIds) && pd.vexIds.length && payload.status === "pending") syncExpensesWithApproval({ ...payload, id: ref.id }, "pending"); // 🧾 영수증 → 결재 중
      // 🤖 첫 결재자부터 자동 승인(부재·위임)이 켜져 있으면 바로 처리(상신 직후 한 번 더 저장)
      if (!auto && pre?.status === "approved") {
        const r = runAutoApprove({ ...payload, id: ref.id }, apSettings);
        if (r.changed) {
          await updateDoc(ref, { line: r.line, step: r.step, status: r.status, drafterUnread: true, history: arrayUnion(...r.hist), updatedAt: serverTimestamp() }).catch(() => {});
          if (r.status === "approved") runApprovedHooks({ ...payload, id: ref.id }, company, me);
        }
      }
      onDone();
    } catch (e) { setMsg(e.message || "상신 실패"); } finally { setBusy(false); }
  };

  const half = (f) => f.half;
  return (
    <>
    {restored && !editId && (
      <div className="mb-3 rounded-xl bg-[#EEF3FC] border border-[#C9D6EE] px-4 py-2.5 flex items-center gap-3 text-[13.5px] font-bold text-[#1B2B4B]">
        <span className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>DRAFT</span>
        <span className="flex-1 min-w-0 truncate">임시저장한 내용을 불러왔습니다{draft?.savedAt ? ` · ${new Date(draft.savedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <button type="button" onClick={() => { draftStore.del(draftKey); setRestored(false); setData(initialData(form)); setTitle(""); setImages([]); setCc([]); }} className="h-8 px-3 rounded-lg border border-[#C9D6EE] bg-white text-[12.5px] font-black text-[#B42318] shrink-0">지우고 새로 쓰기</button>
      </div>
    )}
    {editId && <div className="mb-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[14px] font-bold">문서 수정 중 · {preset.docNo} — 결재자가 열어보기 전까지만 고칠 수 있습니다. 결재선·참조자는 바꿀 수 없습니다(바꾸려면 회수 후 재기안).</div>}
    <div className={`flex flex-wrap gap-2 mb-4 ${editId ? "hidden" : ""}`}>
      {forms.map((f) => (
        <button key={f.key} type="button" onClick={() => pickForm(f.key)}
          className={`h-9 px-3.5 rounded-xl text-[14px] font-black border transition ${f.key === formKey ? "bg-[#0F1A30] text-white border-[#0F1A30] shadow-[0_6px_16px_rgba(15,26,48,0.25)]" : "bg-white text-[#3A4A66] border-[#E3E8F0] hover:border-[#4B6CB7]"}`}>{f.label}</button>
      ))}
    </div>
    <div className="kp-ap-split grid gap-5" style={{ gridTemplateColumns: "minmax(420px, 520px) 1fr" }}>
      <div className="space-y-4">
        {(formKey === "annual" || formKey === "half") && <LeaveCard leave={leave} thisDays={editId ? 0 : (leaveUseOf({ cat, form: formKey, data })?.days || 0)} />}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 space-y-3.5">
          <div>
            <div className="text-[12px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FORM</div>
            <div className="text-[16px] font-black text-[#0F1A30]">양식 · 내용</div>
          </div>
          <label className="block"><span className="text-[14.5px] font-black text-[#3A4A66]">양식</span>
            <CustomSelect openOnFocus value={formKey} disabled={!!editId} onChange={(e) => pickForm(e.target.value)} className={`${inp} !h-11 font-black disabled:bg-[#F5F7FA]`}>{forms.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</CustomSelect>
          </label>
          <label className="block"><span className="text-[14.5px] font-black text-[#3A4A66]">문서 제목 <span className="font-semibold text-[#5B6B85]">(비우면 자동 · {autoTitle})</span></span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
            {form.fields.filter((f) => !f.legacy).map((f) => {
              const bad = missing.includes(f.k);
              return (
                <div key={f.k} id={`apf-${f.k}`} className={`block rounded-xl min-w-0 ${half(f) && f.type !== "bank" && f.type !== "time" ? "" : "col-span-2"} ${bad ? "ring-2 ring-[#2D4C82] ring-offset-4 bg-[#EEF3FC]" : ""}`}>
                  <span className={`flex items-center gap-1.5 text-[14.5px] font-black ${bad ? "text-[#0B1428]" : "text-[#3A4A66]"}`}>{f.label}{f.required && <span className="text-[#2D4C82]">*</span>}{bad && <span className="ml-auto h-5 px-2 rounded-md bg-[#0F1A30] text-white text-[12px] font-black inline-flex items-center">입력 필요</span>}</span>
                  <div className="mt-1.5">{false ? null : <FieldInput f={f.k === "account" ? { ...f, options: accountOptions() } : f} value={data[f.k]} onChange={(v, extra) => { if (f.type === "plan") setData((p) => ({ ...p, [f.k]: v, planName: extra ? String(extra.data?.name || extra.title || "") : "" })); else setField(f, v); if (bad) setMissing((m) => m.filter((x) => x !== f.k)); }} staff={staff} meUid={me.uid} ctx={fieldCtx} />}</div>
                </div>
              );
            })}
          </div>
          {/* 📎 2026-11-08 첨부 파일(모든 양식) — 사진·PDF·PPT·엑셀·워드·한글·ZIP, 파일당 20MB 미만 · 10개까지(Storage). 예전 문서의 사진 첨부는 아래에 그대로 */}
          <ApprovalAttachInput company={company} docId={docId} me={me} files={files} setFiles={setFiles} onRemoveFile={removeFile} onError={setMsg} onBusy={setUpBusy}
            legacy={images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2" data-ap-legacy-images>
                {images.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#E3E8F0]">
                    <button type="button" onClick={() => setLightbox(i)} title="크게 보기" className="block w-full h-full"><img src={src} alt={`첨부 ${i + 1}`} className="w-full h-full object-cover" /></button>
                    <button type="button" onClick={() => setImages((p) => p.filter((_, k) => k !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-[#0F1A30]/80 text-white text-[12px]">✕</button>
                  </div>
                ))}
                {lightbox !== null && <ImageLightbox images={images} start={lightbox} docNo={preset?.docNo || "새문서"} onClose={() => setLightbox(null)} />}
              </div>
            )} />
        </div>
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5">
          <div className="mb-3">
            <div className="text-[12px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>APPROVAL LINE</div>
            <div className="text-[16px] font-black text-[#0F1A30]">결재선</div>
          </div>
          {editId ? (
            <div className="space-y-1.5">
              {line.map((s, i) => <div key={i} className="h-9 px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] flex items-center gap-2 text-[14px]"><span className="w-6 h-6 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black flex items-center justify-center">{i + 1}</span><b className="text-[#0F1A30]">{s.name}</b><span className="text-[#5B6B85]">{s.position} · {s.kind || "결재"}</span></div>)}
              {cc.length > 0 && <div className="text-[13.5px] text-[#5B6B85] px-1">참조 {cc.map((c) => c.name).join(", ")}</div>}
            </div>
          ) : <LineEditor line={line} setLine={setLine} cc={cc} setCc={setCc} staff={staff} me={me} company={company} cat={cat} form={form} />}
        </div>
        {msg && <div className="rounded-xl bg-[#0F1A30] text-white px-4 py-3 text-[14px] font-bold">⚠ {msg}</div>}
        {!editId && (
          <button type="button" onClick={resetAll} className="w-full h-11 rounded-2xl border border-[#DCE3EE] bg-white text-[14.5px] font-black text-[#3A4A66] hover:border-[#4B6CB7] inline-flex items-center justify-center gap-2">
            <ShellIcon name="refresh" size={15} />입력 내용 초기화
          </button>
        )}
        <button type="button" onClick={submit} disabled={busy} className="w-full h-14 rounded-2xl text-white text-[15.5px] font-black shadow-[0_12px_26px_rgba(15,26,48,0.28)] disabled:opacity-60 inline-flex items-center justify-center gap-2" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
          <ShellIcon name={editId ? "pen" : "send"} size={17} />{busy ? (editId ? "저장 중…" : "상신 중…") : editId ? "수정 저장" : "결재 상신"}
        </button>
      </div>
      <div className="rounded-2xl bg-[#E9EDF3] p-5 overflow-auto">
        <div className="sticky top-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[13px] font-extrabold tracking-[0.2em] text-[#5A6A85] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>LIVE PREVIEW</span>
            <span className="text-[13px] font-bold text-[#5B6B85]">입력하는 대로 문서가 바로 만들어집니다</span>
          </div>
          <FitPaper><ApprovalPaper form={form} data={data} title={finalTitle} line={line.map((s, i) => ({ ...s, status: i === 0 ? "pending" : "wait" }))} cc={cc} drafter={me} createdMs={Date.now()} staff={staff} files={files} images={images} /></FitPaper>
        </div>
      </div>
    </div>
    </>
  );
}

// ─────────────────────────── 문서 보기(결재·회수·재기안) ───────────────────────────
function Progress({ d }) {
  return (
    <div className="flex items-center gap-1">
      {(d.line || []).map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className={`w-3 h-[2px] ${s.status === "approved" || (d.line[i - 1].status === "approved") ? "bg-[#1B2B4B]" : "bg-[#DCE3EE]"}`} />}
          <span title={`${s.name} ${s.position} · ${s.status === "approved" ? "승인" : s.status === "rejected" ? "반려" : s.status === "pending" ? (s.viewedAt ? "열람함 · 결재 중" : "결재 중(미열람)") : "대기"}`}
            className={`w-[22px] h-[22px] rounded-full text-[11px] font-black flex items-center justify-center ${s.status === "approved" ? "bg-[#1B2B4B] text-white" : s.status === "rejected" ? "bg-[#0F1A30] text-white" : s.status === "pending" ? "bg-white text-[#1B2B4B] ring-2 ring-[#1B2B4B]" : "bg-[#EEF1F6] text-[#5B6B85]"}`}>
            {s.status === "rejected" ? "✕" : String(s.name || "?").slice(0, 1)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function Viewer({ d: d0, me, staff, company, onClose, onRedraft, onEdit, inline = false, canHr = false }) {
  // ⭐ 2026-11-09 지급완료 확정 직후 화면 반영 — 저장은 됐는데 목록 구독이 늦게 도착하면 도장이 안 찍히고 [지급 완료 확정]이 그대로 보여
  //  한 번 더 누르게 됐다(실제 테스트운송사 문서에 '지급 완료'가 두 번 기록됨). 저장이 끝나면 화면에 바로 반영하고, 서버 값이 오면 그 값을 쓴다.
  const [paidLocal, setPaidLocal] = React.useState(undefined); // undefined = 서버 값 그대로 · 객체 = 지급완료 · null = 지급 취소
  React.useEffect(() => {
    if (paidLocal === undefined) return;
    if ((paidLocal && d0?.paid?.at) || (paidLocal === null && !d0?.paid?.at)) setPaidLocal(undefined);
  }, [d0?.paid?.at, paidLocal]);
  React.useEffect(() => { setPaidLocal(undefined); }, [d0?.id]);
  const d = React.useMemo(() => (paidLocal === undefined ? d0 : { ...d0, paid: paidLocal }), [d0, paidLocal]);
  const apCfg = useApprovalSettings(company);
  const form = formOf(d.form);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cancelAsk, setCancelAsk] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(null); // ⭐ 2026-11-04 첨부 크게 보기(번호)
  const [signOpen, setSignOpen] = React.useState(false); // ✍ 내 서명·결재 표시 설정
  const [payAsk, setPayAsk] = React.useState(null); // 💸 { date, memo }
  const paperRef = React.useRef(null);
  const turn = myTurn(d, me.uid);
  const cTurn = cancelTurn(d, me.uid);
  const mine = d.drafterUid === me.uid;
  const anyApproved = (d.line || []).some((s) => s.status === "approved");
  // 열면 읽음 처리 — 기안자: 결과 확인 / 참조자: 완료 문서 확인 / 지금 차례 결재자: 열람 시각(이후 기안자 수정 잠김)
  React.useEffect(() => {
    const patch = {};
    if (mineUnread(d, me.uid)) { patch.drafterUnread = false; patch.seenBy = arrayUnion(me.uid); }
    if (ccUnread(d, me.uid)) patch.ccReadBy = arrayUnion(me.uid);
    if (d.status === "pending" && d.line?.[d.step]?.uid === me.uid && !d.line[d.step].viewedAt) patch.line = d.line.map((s, i) => (i === d.step ? { ...s, viewedAt: Date.now() } : s));
    if (Object.keys(patch).length) updateDoc(doc(db, "approvals", d.id), patch).catch(() => {});
  }, [d, me.uid]);

  const act = async (kind) => {
    const isCancelFlow = kind.startsWith("c-");
    if ((kind === "reject" || kind === "c-reject") && !comment.trim()) { window.alert("반려 사유를 적어 주세요."); return; }
    if (kind === "cancel-req" && !comment.trim()) { window.alert("취소 사유를 적어 주세요."); return; }
    if (kind === "cancel-req" && cancelBlockedByPaid(d)) { window.alert(PAID_CANCEL_MSG); return; } // ⭐ 2026-11-07 지급완료 문서
    const signMark = me.markMode === "sign" && !!me.sign;
    const ask = { approve: `승인할까요?\n결재란 표시: ${signMark ? (me.rawMode === "image" ? "내 도장 이미지" : "내 서명") : "도장"} (내 서명 설정에서 바꿀 수 있습니다)`, reject: "반려할까요?", withdraw: "결재를 회수할까요?", comment: "의견을 남길까요?", "cancel-req": "승인된 문서의 결재 취소를 요청할까요? 결재자들이 다시 승인하면 취소됩니다.", "c-approve": "결재 취소를 승인할까요?", "c-reject": "결재 취소 요청을 반려할까요?" }[kind];
    if (!await kpConfirm(ask)) return;
    setBusy(true);
    try {
      const now = Date.now();
      const h = { at: now, uid: me.uid, name: me.name, action: { approve: "승인", reject: "반려", withdraw: "회수", comment: "의견", "cancel-req": "결재 취소 요청", "c-approve": "취소 승인", "c-reject": "취소 반려" }[kind], comment: comment.trim() };
      const patch = { updatedAt: serverTimestamp(), history: arrayUnion(h) };
      if (kind === "approve" || kind === "reject") {
        const line = (d.line || []).map((x) => ({ ...x }));
        const i = d.step || 0;
        if (kind === "approve") {
          // ✍ 2026-11-04 결재 표시 — "서명"이면 지금 서명을 이 칸에 복사(문서 1MB 한도에 가까우면 도장으로)
          const room = (() => { try { return JSON.stringify(d).length + String(me.sign || "").length < 960000; } catch { return true; } })();
          const useSign = me.markMode === "sign" && !!me.sign && String(me.sign).length < STAMP_MAX + 5000 && room;
          line[i] = { ...line[i], status: "approved", at: now, comment: comment.trim(), mark: useSign ? "sign" : "stamp", ...(useSign ? { sign: me.sign } : {}) };
          const next = i + 1 < line.length ? i + 1 : -1;
          if (next >= 0) line[next] = { ...line[next], status: "pending" };
          Object.assign(patch, { line, step: next >= 0 ? next : i, status: next >= 0 ? "pending" : "approved", drafterUnread: true });
          // 🤖 다음 결재자가 자동 승인(부재·위임)을 켜 두었으면 이어서 승인
          if (next >= 0) {
            const r = runAutoApprove({ ...d, line, step: next }, apCfg);
            if (r.changed) { Object.assign(patch, { line: r.line, step: r.step, status: r.status }); patch.history = arrayUnion(h, ...r.hist); }
          }
        } else {
          line[i] = { ...line[i], status: "rejected", at: now, comment: comment.trim() };
          Object.assign(patch, { line, status: "rejected", drafterUnread: true });
        }
      } else if (kind === "withdraw") {
        Object.assign(patch, { status: "withdrawn" });
      } else if (kind === "cancel-req") {
        const cl = (d.line || []).map((x, i) => ({ uid: x.uid, name: x.name, position: x.position || "", kind: x.kind || "결재", status: i === 0 ? "pending" : "wait", at: 0, comment: "" }));
        Object.assign(patch, { cancel: { status: "pending", reason: comment.trim(), at: now, step: 0, line: cl } });
      } else if (isCancelFlow) {
        const c = { ...d.cancel, line: (d.cancel?.line || []).map((x) => ({ ...x })) };
        const i = c.step || 0;
        if (kind === "c-approve") {
          c.line[i] = { ...c.line[i], status: "approved", at: now, comment: comment.trim() };
          if (i + 1 < c.line.length) { c.step = i + 1; c.line[i + 1] = { ...c.line[i + 1], status: "pending" }; } else { c.status = "approved"; patch.status = "cancelled"; patch.drafterUnread = true; }
        } else {
          c.line[i] = { ...c.line[i], status: "rejected", at: now, comment: comment.trim() };
          c.status = "rejected"; patch.drafterUnread = true;
        }
        patch.cancel = c;
      }
      await updateDoc(doc(db, "approvals", d.id), patch);
      if (patch.status === "approved") runApprovedHooks(d, company, me);
      if (Array.isArray(d.data?.vexIds) && d.data.vexIds.length && ["rejected", "withdrawn", "cancelled"].includes(patch.status)) syncExpensesWithApproval(d, patch.status); // 🧾 영수증 → 다시 결의할 수 있게
      // ⭐ 2026-11-02 점검 — 결재 취소가 최종 승인되면 승인 때 자동 연동한 것을 되돌린다(지출 장부 줄 삭제·사직 퇴사예정·인사발령 대기 해제). 육아휴직·출산휴가 재직 상태는 이전 값을 몰라 인사관리부에서 직접 바꿔야 함
      if (patch.status === "cancelled") {
        if (d.cat === "expense") deleteDoc(doc(db, "acctLedger", `appr_${d.id}`)).catch(() => {});
        if (d.form === "resign" && d.drafterUid) updateDoc(doc(db, "users", d.drafterUid), { resignPlan: null }).catch(() => {});
        if (d.form === "personnel" && d.data?.target) updateDoc(doc(db, "users", d.data.target), { pendingOrder: null }).catch(() => {});
      }
      // 📧 결과는 기안자 사내메일(공문함)에도 기록 — 푸시·배너는 notifyApproval·BannerCenter가 따로 한 번 보낸다
      const result = patch.status === "approved" ? ["결재 완료", "문서가 최종 승인되었습니다."]
        : patch.status === "rejected" ? ["반려", `${me.name}님이 문서를 반려했습니다.\n반려 사유: ${comment.trim()}`]
          : patch.status === "cancelled" ? ["결재 취소 승인", "결재 취소 요청이 승인되어 문서가 취소되었습니다."]
            : patch.cancel?.status === "rejected" ? ["결재 취소 거부", `${me.name}님이 결재 취소 요청을 거부했습니다.\n사유: ${comment.trim()}`] : null;
      if (result && d.drafterUid !== me.uid) {
        sendInternalMail({
          company, to: [{ uid: d.drafterUid, name: d.drafter?.name || "" }], kind: "approval", fromName: me.name,
          subject: `[${result[0]}] ${d.title}`,
          body: `${result[1]}\n\n· 문서번호: ${d.docNo}\n· 양식: ${d.formLabel}\n· 내용: ${d.summary || ""}${d.amount ? `\n· 금액: ${fmtWon(d.amount)}` : ""}\n\n홈 › 전자결재 › 내 기안함에서 확인하세요.`,
        }).catch(() => {});
      }
      setComment(""); setCancelAsk(false);
    } catch (e) { window.alert(`처리 실패: ${e.message}`); } finally { setBusy(false); }
  };
  // 💸 2026-11-04 지급완료 처리·취소 — 기안자에게 알림(가운데 팝업 drafterUnread + 서버 notifyApproval 푸시 + 공문함 기록)
  const payable = canPay(d, me);
  const pstate = payState(d);
  const doPay = async () => {
    const date = payAsk?.date || kstToday();
    const memo = String(payAsk?.memo || "").trim();
    const account = String(payAsk?.account || d.data?.account || "").trim(); // ⭐ 2026-11-09 계정과목(경리가 지급 때 지정)
    if (payState(d) === "paid") return; // 이미 지급완료(두 번 처리 방지)
    if (!await kpConfirm(`「${d.title}」\n${fmtWon(d.amount)}을 ${date} 지급 완료로 처리할까요?\n기안자(${d.drafter?.name || ""})에게 알림이 갑니다.`)) return;
    setBusy(true);
    try {
      const now = Date.now();
      await updateDoc(doc(db, "approvals", d.id), {
        paid: { at: now, by: me.uid, byName: me.name || "", date, memo, ...(account ? { account } : {}) },
        ...(d.drafterUid !== me.uid ? { drafterUnread: true } : {}),
        history: arrayUnion({ at: now, uid: me.uid, name: me.name || "", action: "지급 완료", comment: `지급일 ${date}${memo ? ` · ${memo}` : ""}` }),
        updatedAt: serverTimestamp(),
      });
      if (d.drafterUid && d.drafterUid !== me.uid) {
        sendInternalMail({
          company, to: [{ uid: d.drafterUid, name: d.drafter?.name || "" }], kind: "approval", fromName: me.name,
          subject: `[지급 완료] ${d.title} — ${fmtWon(d.amount)} 지급되었습니다`,
          body: `[지급 완료] ${d.title} — ${fmtWon(d.amount)} 지급되었습니다.\n\n· 문서번호: ${d.docNo}\n· 지급일: ${date}\n· 처리: ${me.name || ""}${memo ? `\n· 메모: ${memo}` : ""}\n\n홈 › 전자결재 › 내 기안함에서 확인하세요.`,
        }).catch(() => {});
      }
      setPaidLocal({ at: now, by: me.uid, byName: me.name || "", date, memo, ...(account ? { account } : {}) }); // 화면에 바로 도장
      if (Array.isArray(d.data?.vexIds) && d.data.vexIds.length) syncExpensesPaid(d, { at: now, date, byName: me.name || "" }); // 🧾 차량 비용 영수증 → 지급완료 도장
      if (account) setDoc(doc(db, "acctLedger", `appr_${d.id}`), { account }, { merge: true }).catch(() => {}); // 장부 계정과목도 맞춘다
      setPayAsk(null);
    } catch (e) { window.alert(`지급 완료 처리 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const undoPay = async () => {
    if (!await kpConfirm(`「${d.title}」의 지급 완료를 취소할까요?\n문서가 다시 「지급 대기」로 바뀝니다.`)) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "approvals", d.id), {
        paid: null,
        history: arrayUnion({ at: Date.now(), uid: me.uid, name: me.name || "", action: "지급 취소", comment: d.paid?.date ? `지급일 ${d.paid.date} 처리 취소` : "" }),
        updatedAt: serverTimestamp(),
      });
      setPaidLocal(null); // 화면에 바로 지급 대기로
      if (Array.isArray(d.data?.vexIds) && d.data.vexIds.length) syncExpensesPaid(d, null); // 🧾 영수증도 다시 승인(지급 대기)
      // ⭐ 2026-11-04 지급 취소도 기안자에게 사내메일
      if (d.drafterUid && d.drafterUid !== me.uid) {
        sendInternalMail({
          company, to: [{ uid: d.drafterUid, name: d.drafter?.name || "" }], kind: "approval", fromName: me.name,
          subject: `[지급 취소] ${d.title} — 지급 완료가 취소되었습니다`,
          body: `[지급 취소] ${d.title} — ${fmtWon(d.amount)} 지급 완료 처리가 취소되었습니다.\n\n· 문서번호: ${d.docNo}${d.paid?.date ? `\n· 취소된 지급일: ${d.paid.date}` : ""}\n· 처리: ${me.name || ""}\n\n문서는 다시 「지급 대기」 상태입니다. 홈 › 전자결재 › 내 기안함에서 확인하세요.`,
        }).catch(() => {});
      }
    } catch (e) { window.alert(`지급 취소 실패: ${e.message}`); } finally { setBusy(false); }
  };
  // 🖨 A4 기준으로 나눠서 인쇄(긴 회의록·보고서도 글줄 중간이 잘리지 않게)
  const print = async () => {
    const box = paperRef.current?.closest?.("[data-fitpaper]"); const prev = box?.style.zoom;
    if (box) box.style.zoom = "1";
    await paperFull(paperRef.current, true);
    try { await printA4(paperRef.current, d.docNo); } finally { await paperFull(paperRef.current, false); if (box) box.style.zoom = prev; }
  };
  // ⭐ 2026-11-01 PDF 저장(A4 나눔) — 모든 결재 문서
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const pdf = async () => {
    const box = paperRef.current?.closest?.("[data-fitpaper]"); const prev = box?.style.zoom;
    if (box) box.style.zoom = "1";
    setPdfBusy(true);
    await paperFull(paperRef.current, true);
    try { await savePdf(paperRef.current, `${d.docNo || "전자결재"}_${String(d.title || d.formLabel || "").replace(/[\\/:*?"<>|]/g, "_")}`); } catch (e) { window.alert(`PDF 저장 실패: ${e.message}`); } finally { await paperFull(paperRef.current, false); if (box) box.style.zoom = prev; setPdfBusy(false); }
  };

  // ⭐ 2026-10-31 inline — 넓은 화면에서는 결재함 오른쪽에 바로 미리보기(왼쪽 목록 · 오른쪽 문서)
  const wrap = (inner) => (inline ? inner : createPortal(
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/50 flex items-center justify-center p-0 md:p-4" onClick={onClose}>{inner}</div>, document.body));
  return wrap(
      <div className={inline ? "w-full h-[calc(100vh-190px)] min-h-[640px] bg-[#F4F6FA] rounded-[20px] border border-[#E3E8F0] overflow-hidden flex flex-row" : "w-full max-w-[1280px] h-full md:h-[92vh] bg-[#F4F6FA] md:rounded-[24px] overflow-y-auto md:overflow-hidden flex flex-col md:flex-row shadow-[0_24px_60px_rgba(15,26,48,0.4)]"} onClick={(e) => e.stopPropagation()}>
        <div className="md:flex-1 md:overflow-auto p-3 md:p-6 bg-[#E9EDF3] order-2 md:order-1">
          <FitPaper><ApprovalPaper paperRef={paperRef} form={form} data={d.data} title={d.title} line={d.line} cc={d.cc} drafter={d.drafter} docNo={d.docNo} createdMs={toMs(d.createdAt)} staff={staff} status={d.status} paid={pstate === "paid" ? d.paid : null} files={d.files} images={d.images} /></FitPaper>
          {/* 📎 2026-11-08 첨부 — Storage 파일(목록·미리보기·저장) + 예전 사진 첨부(base64) · [첨부 모두 저장]은 ZIP 하나로 */}
          {/* ⭐ 2026-11-09 새로 올린 사진 파일도 예전 사진처럼 누르면 크게 보기 · 이미지 저장(onGallery) */}
          <ApprovalAttachPanel files={d.files || []} images={d.images || []} docNo={d.docNo} onImage={(i) => setLightbox(i)} onGallery={(g) => setLightbox(g)} />
          {lightbox !== null && (typeof lightbox === "object"
            ? <ImageLightbox images={lightbox.srcs} names={lightbox.names} start={lightbox.start} docNo={d.docNo} onClose={() => setLightbox(null)} />
            : <ImageLightbox images={d.images || []} start={lightbox} docNo={d.docNo} onClose={() => setLightbox(null)} />)}
          {signOpen && <SignatureModal me={me} onClose={() => setSignOpen(false)} />}
        </div>
        <aside className="w-full md:w-[360px] shrink-0 bg-white md:border-l border-[#E3E8F0] flex flex-col order-1 md:order-2">
          <div className="px-5 py-4 border-b border-[#EEF1F6] flex items-center gap-2">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{d.docNo}</div>
              <div className="text-[16px] font-black text-[#0F1A30] truncate">{d.title}</div>
            </div>
            <button type="button" onClick={onClose} className="ml-auto w-9 h-9 rounded-xl hover:bg-[#F5F8FD] text-[#5B6B85] shrink-0">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
              <div className="text-[13px] font-bold text-white/60">{d.formLabel} · {d.drafter?.name} {d.drafter?.position}</div>
              <div className="text-[20px] font-black mt-0.5">{d.cancel?.status === "pending" && d.status === "approved" ? `결재 취소 검토 중 · ${d.cancel.line?.[d.cancel.step]?.name || ""} 차례` : `${STATUS[d.status]}${d.status === "pending" && d.line?.[d.step] ? ` · ${d.line[d.step].name} 차례${d.line[d.step].viewedAt ? "(열람함)" : ""}` : ""}`}</div>
              {(d.amount > 0 || d.days > 0) && <div className="text-[14px] font-bold text-white/80 mt-1 flex items-center gap-2 flex-wrap">{d.days > 0 ? `${d.days}일` : ""}{d.days > 0 && d.amount > 0 ? " · " : ""}{d.amount > 0 ? fmtWon(d.amount) : ""}
                {pstate === "paid" && <span className="h-6 px-2 rounded-md bg-white text-[#9A1F15] text-[12px] font-black inline-flex items-center">지급완료 {String(d.paid.date || "").slice(5).replace("-", "/")}</span>}
                {pstate === "wait" && <span className="h-6 px-2 rounded-md border border-white/35 text-white text-[12px] font-black inline-flex items-center">지급 대기</span>}
              </div>}
              <div className="mt-3"><Progress d={d} /></div>
            </div>
            {/* 🗂 2026-11-04 인사발령 품의 최종 승인 → 기안한 인사 담당자(인사 담당이 없으면 마스터)가 인사발령 공문 게시 */}
            {d.form === "personnel" && d.status === "approved" && d.cancel?.status !== "pending" && (mine || canHr) && (() => {
              const tu = (staff || []).find((u) => u.uid === d.data?.target);
              const waiting = tu?.pendingOrder?.approvalId === d.id;
              return (
                <div className="rounded-2xl p-4 space-y-2.5 border-2 border-[#1B2B4B] bg-white" data-ap-hrorder>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>ANNOUNCE</span>
                    <span className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">인사발령 공문 게시</span>
                    {tu && <span className={`ml-auto h-6 px-2 rounded-md text-[12px] font-black inline-flex items-center whitespace-nowrap ${waiting ? "bg-[#0F1A30] text-white" : "border border-[#DCE3EE] text-[#5B6B85]"}`}>{waiting ? "게시 대기" : "게시 완료·처리됨"}</span>}
                  </div>
                  <div className="text-[13px] text-[#3A4A66] leading-relaxed break-keep">
                    결재가 끝났습니다. {canHr ? <>인사관리부 › 인사관리 › <b className="text-[#0F1A30]">인사발령</b>에서 {tu?.name || "대상자"}님을 고르고 [결재 내용 불러오기] → [발령 공문 발송]을 누르면 공지사항·전 직원 메일로 발령이 나가고 인사 정보가 바뀝니다.</> : <>인사발령 공문은 인사 담당자가 인사관리부 › 인사발령에서 게시합니다.</>}
                  </div>
                  {canHr && <button type="button" onClick={() => { goPersonnelOrder(d.data?.target); onClose?.(); }} className="w-full h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">인사발령 화면 열기</button>}
                </div>
              );
            })()}
            {/* 💸 2026-11-04 지급완료 — 최종 승인된 지출 문서 */}
            {pstate && (
              <div className={`rounded-2xl p-4 space-y-2.5 ${pstate === "paid" ? "border border-[#E8C9C5] bg-[#FDF6F5]" : payable ? "border-2 border-[#1B2B4B] bg-white" : "border border-[#DCE3EE] bg-[#F8FAFD]"}`} data-ap-pay>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-extrabold tracking-[0.22em] ${pstate === "paid" ? "text-[#B42318]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{pstate === "paid" ? "PAID" : "PAYMENT"}</span>
                  <span className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">{pstate === "paid" ? "지급 완료" : "지급 대기"}</span>
                  <span className="ml-auto text-[14px] font-black text-[#0F1A30] tabular-nums whitespace-nowrap">{fmtWon(d.amount)}</span>
                </div>
                {pstate === "paid" ? (
                  <>
                    <div className="text-[13px] text-[#3A4A66] leading-relaxed break-words">지급일 <b className="text-[#0F1A30] tabular-nums">{d.paid.date || ymd(d.paid.at)}</b> · 처리 {d.paid.byName || "-"}{d.paid.account ? <> · 계정과목 <b className="text-[#0F1A30]">{d.paid.account}</b></> : null}{d.paid.memo ? <><br />메모 {d.paid.memo}</> : null}</div>
                    {payable && <button type="button" disabled={busy} onClick={undoPay} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-black text-[#5B6B85] disabled:opacity-50">지급 취소</button>}
                  </>
                ) : payable ? (
                  payAsk ? (
                    <div className="space-y-2">
                      <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">지급일</div><CustomDatePicker value={payAsk.date} onChange={(e) => setPayAsk((p) => ({ ...p, date: e.target.value || kstToday() }))} className={inp} showIcon /></div>
                      {formOf(d.form)?.fields?.some((f) => f.k === "account") && (
                        <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">계정과목{!d.data?.account && <span className="ml-1 text-[#B42318]">(기안자가 비워 둠)</span>}</div>
                          {/* ⭐ 2026-11-09 경리는 틀린 계정과목을 바꾸거나 목록에 없는 계정과목을 직접 입력(새로 쓴 계정과목은 이후 회사 문서의 선택지에 같이 나온다) */}
                          <SelectDirect f={{ label: "계정과목", options: accountOptions() }} value={payAsk.account || ""} onChange={(v) => setPayAsk((p) => ({ ...p, account: v }))} /></div>
                      )}
                      <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">메모 (선택)</div><input value={payAsk.memo} onChange={(e) => setPayAsk((p) => ({ ...p, memo: e.target.value }))} placeholder="예) 국민은행 계좌이체" className={inp} /></div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setPayAsk(null)} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#5B6B85]">닫기</button>
                        <button type="button" disabled={busy} onClick={doPay} className="flex-[1.6] h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">지급 완료 확정</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => setPayAsk({ date: kstToday(), memo: "", account: d.data?.account || "" })} className="w-full h-12 rounded-xl text-white text-[15px] font-black shadow-[0_10px_22px_rgba(15,26,48,0.25)] disabled:opacity-50" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>₩ 지급 완료 처리</button>
                  )
                ) : (
                  <div className="text-[12.5px] text-[#5B6B85] leading-relaxed">결재가 끝나 재무·경리 담당자의 지급을 기다리고 있습니다. 지급되면 알림이 갑니다.</div>
                )}
              </div>
            )}
            {d.cancel && (
              <div className="rounded-2xl border border-[#DCE3EE] bg-[#F8FAFD] p-4">
                <div className="text-[14px] font-black text-[#0F1A30]">결재 취소 요청 · {d.cancel.status === "pending" ? "진행 중" : d.cancel.status === "approved" ? "취소 완료" : "취소 반려"}</div>
                <div className="text-[13.5px] text-[#3A4A66] mt-1 whitespace-pre-wrap">사유: {d.cancel.reason}</div>
                <div className="mt-2 flex flex-wrap gap-1">{(d.cancel.line || []).map((x, i) => <span key={i} className={`h-6 px-2 rounded-md text-[12.5px] font-bold inline-flex items-center ${x.status === "approved" ? "bg-[#1B2B4B] text-white" : x.status === "rejected" ? "bg-[#0F1A30] text-white" : x.status === "pending" ? "border border-[#1B2B4B] text-[#1B2B4B]" : "bg-[#EEF1F6] text-[#5B6B85]"}`}>{x.name} {x.status === "approved" ? "동의" : x.status === "rejected" ? "거부" : x.status === "pending" ? "검토 중" : "대기"}</span>)}</div>
              </div>
            )}
            {turn && (
              <div className="rounded-2xl border-2 border-[#1B2B4B] p-4 space-y-2.5">
                <div className="text-[14px] font-black text-[#0F1A30]">{cTurn ? "결재 취소 요청 — 내 검토 차례" : "내 결재 차례입니다"}</div>
                {!cTurn && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-[#F4F6FA] border border-[#E3E8F0] px-3 py-2" data-ap-mark-row>
                    <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MARK</span>
                    {me.markMode === "sign" && me.sign ? <img src={me.sign} alt="내 서명" className="h-9 max-w-[90px] object-contain" /> : <MiniStamp name={me.name} kind={d.line?.[d.step]?.kind} />}
                    <span className="text-[13px] font-black text-[#0F1A30] min-w-0 truncate">{me.markMode === "sign" && me.sign ? (me.rawMode === "image" ? "내 도장 이미지로 결재" : "내 서명으로 결재") : "도장으로 결재"}</span>
                    <button type="button" onClick={() => setSignOpen(true)} className="ml-auto h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#1B2B4B] hover:border-[#4B6CB7] shrink-0">{me.sign ? "변경" : "서명 등록"}</button>
                  </div>
                )}
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={cTurn ? "의견 (거부할 때는 사유 필수)" : "결재 의견 (반려할 때는 꼭 적어 주세요)"} className={`${inp} h-auto py-2`} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => act(cTurn ? "c-reject" : "reject")} className="flex-1 h-11 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[14px] font-black disabled:opacity-50">{cTurn ? "취소 거부" : "반려"}</button>
                  <button type="button" disabled={busy} onClick={() => act(cTurn ? "c-approve" : "approve")} className="flex-[1.6] h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{cTurn ? "취소 승인" : (d.line[d.step]?.kind || "결재") === "합의" ? "합의" : "승인"}</button>
                </div>
              </div>
            )}
            {mine && cancelAsk && (
              <div className="rounded-2xl border-2 border-[#1B2B4B] p-4 space-y-2.5">
                <div className="text-[14px] font-black text-[#0F1A30]">결재 취소 요청</div>
                <div className="text-[13.5px] text-[#5B6B85] leading-relaxed">승인된 문서를 취소하려면 결재자들의 동의가 필요합니다. 같은 결재선 순서로 다시 승인받으면 「결재 취소」로 바뀌고, 연차는 자동으로 돌려받습니다.</div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="취소 사유 (예: 일정 변경으로 휴가 취소)" className={`${inp} h-auto py-2`} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setCancelAsk(false); setComment(""); }} className="flex-1 h-10 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#5B6B85]">닫기</button>
                  <button type="button" disabled={busy} onClick={() => act("cancel-req")} className="flex-[1.6] h-10 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">취소 요청 보내기</button>
                </div>
              </div>
            )}
            {/* ⭐ 2026-11-02 점검 — 의견 등록은 참여자만(참여자가 아닌 관리자는 규칙상 저장이 막혀 권한 오류가 났음) */}
            {!turn && !cancelAsk && d.status === "pending" && (d.participants || []).includes(me.uid) && (
              <div className="space-y-2">
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="의견 남기기" className={`${inp} h-auto py-2`} />
                <button type="button" disabled={busy || !comment.trim()} onClick={() => act("comment")} className="w-full h-10 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#3A4A66] disabled:opacity-40">의견 등록</button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {canEdit(d, me.uid) && <button type="button" onClick={() => onEdit(d)} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black">수정</button>}
              {mine && d.status === "pending" && !anyApproved && <button type="button" disabled={busy} onClick={() => act("withdraw")} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#3A4A66]">회수</button>}
              {/* ⭐ 2026-11-07 지급완료된 지출결의는 결재 취소 요청 불가 — 경리가 지급완료를 먼저 취소해야 한다(규칙에서도 막음) */}
              {mine && d.status === "approved" && d.cancel?.status !== "pending" && !cancelAsk && (cancelBlockedByPaid(d)
                ? <span className="inline-flex flex-col"><button type="button" disabled aria-disabled="true" data-testid="ap-cancel-req-blocked" title={PAID_CANCEL_MSG} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#9AA9C3] cursor-not-allowed">결재 취소 요청</button><span className="mt-1 text-[12px] font-bold text-[#B42318]">{PAID_CANCEL_MSG}</span></span>
                : <button type="button" onClick={() => { setCancelAsk(true); setComment(""); }} className="h-9 px-3.5 rounded-lg border border-[#0F1A30] text-[13.5px] font-black text-[#0F1A30]">결재 취소 요청</button>)}
              {mine && ["rejected", "withdrawn"].includes(d.status) && <button type="button" onClick={() => onRedraft(d)} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black">재기안</button>}
              {mine && ["approved", "cancelled"].includes(d.status) && <button type="button" onClick={() => onRedraft({ ...d, id: null })} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#3A4A66]">복사해서 새로 쓰기</button>}
              {(() => {
                const hidden = (d.hiddenBy || []).includes(me.uid);
                const finished = d.status !== "pending" && !(d.status === "approved" && d.cancel?.status === "pending");
                if (hidden) return <button type="button" onClick={() => updateDoc(doc(db, "approvals", d.id), { hiddenBy: arrayRemove(me.uid) }).catch((e) => window.alert(e.message))} className="h-9 px-3.5 rounded-lg border border-[#0F1A30] text-[13.5px] font-black text-[#0F1A30]">보관함으로 되돌리기</button>;
                if (!finished || !((d.participants || []).includes(me.uid) || isAdminRole(me.role))) return null;
                return <button type="button" onClick={async () => { if (!await kpConfirm("내 보관함에서 이 문서를 삭제할까요?\n(회사 기록 원본은 남고, 결재함 › 삭제한 문서에서 되돌릴 수 있습니다)")) return; await updateDoc(doc(db, "approvals", d.id), { hiddenBy: arrayUnion(me.uid) }).catch((e) => window.alert(e.message)); onClose(); }} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#5B6B85]">삭제</button>;
              })()}
              <button type="button" onClick={print} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#3A4A66]">인쇄</button>
              <button type="button" disabled={pdfBusy} onClick={pdf} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{pdfBusy ? "저장 중…" : "PDF 저장"}</button>
            </div>
            {mine && d.status === "pending" && (
              <div className="text-[12.5px] text-[#5B6B85] leading-relaxed">
                {canEdit(d, me.uid) ? "· 첫 결재자가 열어보기 전이라 수정할 수 있습니다." : d.line?.[0]?.viewedAt ? `· ${d.line[0].name}님이 ${new Date(d.line[0].viewedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}에 열람해 수정이 잠겼습니다.` : ""}
                {!anyApproved ? " 아직 승인 전이라 회수 후 재기안할 수 있습니다." : " 승인이 진행된 문서는 회수할 수 없습니다 — 현재 결재자에게 반려를 요청하세요."}
              </div>
            )}
            <div>
              <div className="text-[13.5px] font-black text-[#0F1A30] mb-2">결재 이력</div>
              <div className="relative pl-4 space-y-3 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-[2px] before:bg-[#E3E8F0]">
                {(d.history || []).map((h, i) => (
                  <div key={i} className="relative">
                    <span className={`absolute -left-4 top-1 w-3 h-3 rounded-full ring-2 ring-white ${h.action === "반려" ? "bg-[#0F1A30]" : h.action === "승인" ? "bg-[#1B2B4B]" : "bg-[#9AA9C3]"}`} />
                    <div className="text-[14px]"><b className="text-[#0F1A30]">{h.name}</b> <span className="font-black text-[#1B2B4B]">{h.action}</span> <span className="text-[12.5px] text-[#5B6B85]">{new Date(h.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
                    {h.comment && <div className="mt-1 text-[13.5px] text-[#3A4A66] bg-[#F5F8FD] rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">{h.comment}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>);
}

// ─────────────────────────── 문서 목록 ───────────────────────────
function DocList({ docs, onOpen, empty, uid, compact = false }) {
  const [sortMode, setSortMode] = React.useState(() => { try { return localStorage.getItem("kpApSort") || "status"; } catch { return "status"; } });
  const pickSort = (m) => { setSortMode(m); try { localStorage.setItem("kpApSort", m); } catch { /* 무시 */ } };
  if (docs === null) return <div className="py-16 text-center text-[14.5px] text-[#5B6B85]">불러오는 중…</div>;
  if (!docs.length) return (
    <div className="py-16 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F8FD] flex items-center justify-center text-[#5B6B85]"><ShellIcon name="file" size={24} /></div>
      <div className="mt-3 text-[14.5px] font-bold text-[#5B6B85]">{empty}</div>
    </div>
  );
  // ⭐ 2026-10-31 날짜별로 묶어서(기안일 기준)
  // ⭐ 2026-11-07 같은 날짜 안에서는 처리할 것 먼저 — 내 차례 → 진행 중 → 지급 대기 → 결재 완료 → 반려 → 취소·회수 (같은 단계는 최신순)
  //  위쪽 [진행 중 먼저 | 최신순] 으로 바꿀 수 있고, 고른 값은 이 기기에 기억
  const WD = "일월화수목금토";
  const rankOf = (d) => {
    if (myTurn(d, uid)) return 0;
    if (d.status === "pending" || d.cancel?.status === "pending") return 1;
    if (d.status === "approved") return payState(d) === "wait" ? 2 : 3;
    if (d.status === "rejected") return 4;
    return 5; // cancelled · withdrawn 등
  };
  const groups = [];
  docs.forEach((d) => { const k = ymd(toMs(d.createdAt)); const g = groups.find((x) => x.k === k); if (g) g.list.push(d); else groups.push({ k, list: [d] }); });
  groups.sort((a, b) => b.k.localeCompare(a.k));
  groups.forEach((g) => g.list.sort((a, b) => (sortMode === "status" ? rankOf(a) - rankOf(b) : 0) || toMs(b.createdAt) - toMs(a.createdAt)));
  return (
    <div>
      <div className="flex items-center justify-end gap-1.5 px-3.5 md:px-5 py-2 border-b border-[#EEF1F6] bg-white" data-ap-sort>
        <span className="text-[13px] font-bold text-[#5B6B85] mr-1">정렬</span>
        {[["status", "진행 중 먼저"], ["latest", "최신순"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => pickSort(k)}
            className={`h-8 px-3 rounded-lg text-[13px] font-black border ${sortMode === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:bg-[#F5F8FD]"}`}>{l}</button>
        ))}
      </div>
      {groups.map((g) => (
      <div key={g.k}>
      <div className="sticky top-0 z-[1] px-3.5 md:px-5 py-1.5 bg-[#F5F8FD] border-y border-[#EEF1F6] flex items-center gap-2">
        <span className="text-[12.5px] font-black text-[#1B2B4B] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{g.k.replaceAll("-", ".")}</span>
        <span className="text-[12px] font-bold text-[#7A879C]">{WD[new Date(g.k + "T00:00:00").getDay()]}요일</span>
        <span className="ml-auto text-[11.5px] font-bold text-[#9AA9C3]">{g.list.length}건</span>
      </div>
      <div className="divide-y divide-[#F1F4F9]">
      {g.list.map((d) => (
        <button key={d.id} type="button" onClick={() => onOpen(d)} className="w-full text-left px-3.5 md:px-5 py-3.5 hover:bg-[#F8FAFD] flex items-center gap-2.5 md:gap-4">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}><ShellIcon name={catOf(d.cat).icon} size={18} /></span>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
              <span className="text-[12px] font-black px-1.5 py-0.5 rounded border border-[#0F1A30] text-[#0F1A30] shrink-0">{d.formLabel}</span>
              {myTurn(d, uid) && !cancelTurn(d, uid) && <span className="text-[12px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white shrink-0">내 차례</span>}
              {payState(d) === "paid" && <span className="text-[12px] font-black px-1.5 py-0.5 rounded border border-[#E8C4C0] bg-[#FDF3F2] text-[#9A1F15] shrink-0" title={`지급일 ${d.paid?.date || ""}`}>지급완료</span>}
              {payState(d) === "wait" && <span className="text-[12px] font-black px-1.5 py-0.5 rounded border border-dashed border-[#9AB0D6] bg-[#F5F8FD] text-[#2D4C82] shrink-0">지급 대기</span>}
              {(mineUnread(d, uid) || ccUnread(d, uid)) && <span className="w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shrink-0">N</span>}
              <span className="text-[14.5px] font-black text-[#0F1A30] truncate min-w-0 max-w-full">{d.title}</span>
            </div>
            <div className="text-[13.5px] text-[#5B6B85] truncate mt-0.5">{compact ? `${d.drafter?.name || ""} ${d.drafter?.position || ""} · ` : ""}{d.summary}</div>
            {/* ⭐ 2026-11-10 진행 중이면 지금 누구 차례인지(휴대폰은 결재 진행 막대가 숨겨져 '진행 중'만 보였다) */}
            {d.status === "pending" && d.line?.[d.step] && (
              <div className="mt-0.5 text-[12.5px] font-bold truncate" data-kp="ap-turn">
                {myTurn(d, uid) ? <span className="text-[#0F1A30]">내가 결재할 차례</span>
                  : <span className="text-[#2D4C82]">현재 결재 · {d.line[d.step].name || ""} {d.line[d.step].position || ""} ({(d.step || 0) + 1}/{d.line.length})</span>}
              </div>
            )}
          </div>
          <div className={`${compact ? "hidden" : "hidden xl:block"} text-right shrink-0 w-[120px]`}>
            <div className="text-[14px] font-bold text-[#3A4A66]">{d.drafter?.name} {d.drafter?.position}</div>
            <div className="text-[12.5px] text-[#5B6B85]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{ymd(toMs(d.createdAt))}</div>
          </div>
          <div className={`shrink-0 w-[150px] ${compact ? "hidden" : "hidden md:flex"} justify-end`}><Progress d={d} /></div>
          {/* ⭐ 2026-11-01 결재 완료 후 취소 요청이 들어오면 상태 칸 자체가 "취소 요청"(내가 검토할 차례면 "취소 검토")으로 바뀐다 */}
          {d.status === "approved" && d.cancel?.status === "pending"
            ? <span className={`shrink-0 w-[72px] text-center h-7 leading-7 rounded-full text-[13px] font-black ${cancelTurn(d, uid) ? "bg-[#B42318] text-white" : "bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]"}`}>{cancelTurn(d, uid) ? "취소 검토" : "취소 요청"}</span>
            : <span className={`shrink-0 w-[72px] text-center h-7 leading-7 rounded-full text-[13px] font-black ${d.status === "approved" ? "bg-[#0F1A30] text-white" : d.status === "pending" ? "bg-[#EEF3FB] text-[#1B2B4B]" : "border border-[#DCE3EE] text-[#5B6B85]"}`}>{STATUS[d.status]}</span>}
        </button>
      ))}
      </div>
      </div>
      ))}
    </div>
  );
}

// 🔎 목록 검색·기간·기안자 — 결재함·내 기안함 공용(각 탭 안에서 같이 걸러진다)
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kDay = (off = 0) => { const d = kstNow(); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
function ListTools({ f, setF, drafters }) {
  const quick = [
    ["전체", "", ""], ["오늘", kDay(0), kDay(0)], ["이번 주", kDay(-((kstNow().getUTCDay() + 6) % 7)), kDay(0)],
    ["이번 달", kDay(0).slice(0, 8) + "01", kDay(0)], ["3개월", kDay(-90), kDay(0)],
  ];
  const on = (a, b) => f.from === a && f.to === b;
  const dp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold text-[#0F1A30]";
  return (
    <div className="px-3.5 md:px-5 py-3 border-b border-[#EEF1F6] space-y-2.5 bg-white">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="제목·내용·기안자·문서번호 검색"
            className="w-full h-10 pl-9 pr-8 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] text-[13.5px] text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          {f.q && <button type="button" onClick={() => setF({ ...f, q: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[#9AA9C3]">✕</button>}
        </div>
        {drafters && drafters.length > 1 && (
          <CustomSelect value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} className="h-10 max-w-[42%] px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-bold text-[#0F1A30] outline-none">
            <option value="">기안자 전체</option>
            {drafters.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
          </CustomSelect>
        )}
      </div>
      {/* ⭐ 2026-10-31 기간 — 빠른 선택 옆에 짧게(날짜칸이 화면 끝까지 길던 문제) */}
      <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {quick.map(([l, a, b]) => (
          <button key={l} type="button" onClick={() => setF({ ...f, from: a, to: b })}
            className={`shrink-0 h-8 px-3 rounded-lg text-[12.5px] font-black border ${on(a, b) ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 w-full sm:w-[330px] sm:ml-2">
        <CustomDatePicker value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to && f.to < e.target.value ? e.target.value : f.to })} className={dp} showIcon placeholder="시작일" />
        <span className="text-[#9AA9C3] font-black">~</span>
        <CustomDatePicker value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={dp} showIcon placeholder="종료일" />
      </div>
      </div>
    </div>
  );
}
const applyListTools = (docs, f) => {
  if (!docs) return docs;
  const kw = f.q.trim().toLowerCase();
  return docs.filter((d) => {
    const day = ymd(toMs(d.createdAt));
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.who && d.drafterUid !== f.who) return false;
    if (kw && ![d.title, d.summary, d.formLabel, d.docNo, d.drafter?.name].some((v) => String(v || "").toLowerCase().includes(kw))) return false;
    return true;
  });
};

// ⭐ 2026-11-09 결재함·내 기안함 상태 필터 공용 — 같은 순서·같은 이름·같은 판정(지급 대기·지급완료는 해당 문서가 있을 때만 보인다)
export const AP_STATUS_TABS = [["all", "전체"], ["pending", "진행 중"], ["approved", "완료"], ["paywait", "지급 대기"], ["paid", "지급완료"], ["rejected", "반려"], ["cancelled", "결재 취소"], ["withdrawn", "회수"]];
const PAY_TAB_KEYS = ["paywait", "paid"];
// 상태별 묶음 — pendingFilter로 "진행 중"의 범위를 정한다(결재함은 내 차례인 문서를 '결재 대기'로 따로 빼서 진행 중에서 제외)
function apStatusSets(docs, { pendingFilter = () => true } = {}) {
  return {
    all: docs,
    pending: docs.filter((d) => d.status === "pending" && pendingFilter(d)),
    // ⭐ 2026-11-09 지급 문서(지출 결의)는 '지급 대기·지급완료'에만 — '완료'에 같은 문서가 두 번 보이던 중복 제거
    approved: docs.filter((d) => d.status === "approved" && !payState(d)),
    paywait: docs.filter((d) => payState(d) === "wait"),
    paid: docs.filter((d) => payState(d) === "paid"),
    rejected: docs.filter((d) => d.status === "rejected"),
    cancelled: docs.filter((d) => d.status === "cancelled"),
    withdrawn: docs.filter((d) => d.status === "withdrawn"),
  };
}
const apStatusKeys = (sets, showPay = false) => AP_STATUS_TABS.filter(([k]) => !PAY_TAB_KEYS.includes(k) || showPay || sets.paywait.length || sets.paid.length);

function Tabs({ tabs, tab, setTab }) {
  return (
    // ⭐ 2026-11-09 버튼이 많아 넘칠 때 좌우 스크롤바 표시(index.css .ap-tabs-scroll)
    <div className="ap-tabs-scroll flex items-center gap-1.5 px-5 pt-4 pb-2 border-b border-[#EEF1F6] overflow-x-auto">
      {tabs.map(([k, l, n, unread]) => (
        <button key={k} type="button" onClick={() => setTab(k)} className={`relative h-9 px-4 rounded-full text-[14px] font-black shrink-0 border inline-flex items-center gap-1.5 ${tab === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>
          {l}{n > 0 && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[12px] flex items-center justify-center tabular-nums ${tab === k ? "bg-white text-[#0F1A30]" : "bg-[#EEF1F6] text-[#1B2B4B]"}`}>{n}</span>}
          {unread > 0 && <span title={`새 결과 ${unread}건`} className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black grid place-items-center ring-2 ring-white">{unread}</span>}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── 결재선 관리 ───────────────────────────
function LinesPage({ company, me, staff }) {
  const tpls = useLineTemplates(company, me.uid);
  const [edit, setEdit] = React.useState(null); // { id?, name, cats, steps, cc, shared }
  const admin = isAdminRole(me.role);
  const save = async () => {
    if (!edit.name.trim() || !edit.steps.length) { window.alert("이름과 결재자를 정해 주세요."); return; }
    const data = { company, name: edit.name.trim(), cats: edit.cats, steps: edit.steps.map(({ uid, name, position, kind }) => ({ uid, name, position, kind: kind || "결재" })), cc: edit.cc, shared: admin ? !!edit.shared : false, ownerUid: edit.ownerUid || me.uid, ownerName: edit.ownerName || me.name, updatedAt: serverTimestamp() };
    try {
      if (edit.id) await updateDoc(doc(db, "approvalLines", edit.id), data); else await addDoc(collection(db, "approvalLines"), { ...data, createdAt: serverTimestamp() });
      setEdit(null);
    } catch (e) { window.alert(e.message); }
  };
  return (
    <div className="kp-ap-split grid gap-5" style={{ gridTemplateColumns: "1fr minmax(360px, 440px)" }}>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEF1F6] flex items-center">
          <div>
            <div className="text-[12px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>TEMPLATES</div>
            <div className="text-[16px] font-black text-[#0F1A30]">저장된 결재선 <span className="text-[#5B6B85] text-[14px]">{tpls.length}</span></div>
          </div>
          <button type="button" onClick={() => setEdit({ name: "", cats: [], steps: suggestLine(staff, me), cc: [], shared: admin })} className="ml-auto h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">+ 새 결재선</button>
        </div>
        {!tpls.length ? <div className="py-16 text-center text-[14.5px] text-[#5B6B85]">저장된 결재선이 없습니다. 자주 쓰는 결재 순서를 저장해 두면 문서 작성 때 바로 불러옵니다.</div> : (
          <div className="divide-y divide-[#F1F4F9]">
            {tpls.map((t) => (
              <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {t.shared && <span className="text-[12px] font-black px-1.5 py-0.5 rounded bg-[#0F1A30] text-white">회사 공용</span>}
                    <span className="text-[14.5px] font-black text-[#0F1A30]">{t.name}</span>
                    <span className="text-[13px] text-[#5B6B85]">{(t.cats || []).map((c) => catOf(c).label).join(" · ") || "모든 문서"}</span>
                  </div>
                  <div className="text-[13.5px] text-[#5B6B85] mt-0.5">{(t.steps || []).map((s) => `${s.name} ${s.position || ""}${s.kind === "합의" ? "(합의)" : ""}`).join(" → ")}{(t.cc || []).length ? ` · 참조 ${t.cc.map((c) => c.name).join(", ")}` : ""}</div>
                </div>
                {(t.ownerUid === me.uid || admin) && (
                  <>
                    <button type="button" onClick={() => setEdit({ ...t, cats: t.cats || [], cc: t.cc || [] })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66]">수정</button>
                    <button type="button" onClick={async () => (await kpConfirm("이 결재선을 지울까요?")) && runDelete({ label: "결재선", task: () => deleteDoc(doc(db, "approvalLines", t.id)) }).catch(() => {})} /* ⭐ 2026-11-05 삭제 진행 창 */ className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#5B6B85]">삭제</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-5 space-y-3.5 h-fit">
        {!edit ? (
          <div className="text-[14.5px] text-[#5B6B85] leading-relaxed">
            <div className="text-[16px] font-black text-[#0F1A30] mb-2">결재선이란?</div>
            문서가 거쳐 갈 결재자 순서입니다. <b className="text-[#0F1A30]">결재</b>는 승인·반려 권한, <b className="text-[#0F1A30]">합의</b>는 관련 부서 동의를 받는 단계입니다.
            앞 사람이 승인해야 다음 사람에게 넘어가고, 한 명이라도 반려하면 기안자에게 돌아갑니다. 최종 승인되면 참조자에게도 알림이 갑니다.
            <div className="mt-3 text-[13.5px]">· 관리자는 <b>회사 공용</b> 결재선을 만들어 전 직원이 쓰게 할 수 있습니다.<br />· 문서 작성 화면의 「결재선 불러오기」에서 바로 고릅니다.</div>
          </div>
        ) : (
          <>
            <div className="text-[16px] font-black text-[#0F1A30]">{edit.id ? "결재선 수정" : "새 결재선"}</div>
            <input value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} placeholder="예) 배차팀 휴가 결재선" className={inp} />
            <div className="flex flex-wrap gap-1.5">
              {APPROVAL_CATS.map((c) => {
                const on = edit.cats.includes(c.key);
                return <button key={c.key} type="button" onClick={() => setEdit((p) => ({ ...p, cats: on ? p.cats.filter((x) => x !== c.key) : [...p.cats, c.key] }))} className={`h-8 px-3 rounded-full text-[13px] font-bold border ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{c.label}</button>;
              })}
            </div>
            <LineEditor line={edit.steps} setLine={(fn) => setEdit((p) => ({ ...p, steps: typeof fn === "function" ? fn(p.steps) : fn }))} cc={edit.cc} setCc={(fn) => setEdit((p) => ({ ...p, cc: typeof fn === "function" ? fn(p.cc) : fn }))} staff={staff} me={me} company={company} cat={edit.cats[0] || "leave"} />
            {admin && <label className="flex items-center gap-2 text-[14px] font-bold text-[#0F1A30]"><input type="checkbox" checked={!!edit.shared} onChange={(e) => setEdit((p) => ({ ...p, shared: e.target.checked }))} className="w-4 h-4 accent-[#1B2B4B]" />회사 공용으로 공개</label>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEdit(null)} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[14.5px] font-bold text-[#5B6B85]">취소</button>
              <button type="button" onClick={save} className="flex-[1.5] h-11 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black">저장</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── 메인 ───────────────────────────
//  page: inbox | mine | leave | expense | draft | lines
// 🤖 2026-11-01 자동 승인(부재·위임) 설정 — 임원만(버튼 → 팝업). 켜면 결재 차례가 왔을 때 자동 승인
const AUTO_SKIP_FORMS = [["resign", "사직서"], ["parental", "육아휴직"], ["maternity", "출산휴가"], ["accident", "사고처리"], ["rate", "운임 변경"]];
function AutoApproveCard({ company, me, todo = [] }) {
  const cfg = useApprovalSettings(company);
  const cur = cfg?.autoApprovers?.[me.uid] || {};
  const [f, setF] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open && !f) setF({ on: !!cur.on, from: cur.from || "", to: cur.to || "", maxAmount: String(cur.maxAmount || ""), skipForms: cur.skipForms || ["resign"] }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = autoApproveOn(cfg, me.uid, { amount: 0, form: "" });
  const save = async (next) => {
    setBusy(true);
    try {
      const v = { on: !!next.on, from: next.from || "", to: next.to || "", maxAmount: Number(String(next.maxAmount || "").replace(/[^\d]/g, "")) || 0, skipForms: next.skipForms || [], name: me.name || "", position: me.position || "", exec: isExecProfile(me) || me.role === "totalMaster", updatedAt: Date.now() };
      await setDoc(doc(db, "approvalSettings", company), { companyName: company, autoApprovers: { [me.uid]: v } }, { merge: true });
      // 켜면 지금 내 차례인 문서도 바로 처리
      if (v.on) {
        const cfg2 = { autoApprovers: { [me.uid]: v } };
        let n = 0;
        for (const d of todo) {
          const r = runAutoApprove(d, cfg2);
          if (!r.changed) continue;
          await updateDoc(doc(db, "approvals", d.id), { line: r.line, step: r.step, status: r.status, drafterUnread: true, history: arrayUnion(...r.hist), updatedAt: serverTimestamp() });
          if (r.status === "approved") runApprovedHooks(d, company, me);
          n += 1;
        }
        if (n) window.alert(`지금 대기 중이던 문서 ${n}건을 자동 승인했습니다.`);
      }
      setOpen(false); setF(null);
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const summary = active ? `${cur.from || "오늘"} ~ ${cur.to || "끌 때까지"}${cur.maxAmount ? ` · ${Number(cur.maxAmount).toLocaleString()}원 이하만` : ""}${(cur.skipForms || []).length ? ` · 제외: ${(cur.skipForms || []).map((k) => (AUTO_SKIP_FORMS.find((x) => x[0] === k) || [k, k])[1]).join(", ")}` : ""}` : "";
  const close = () => { setOpen(false); setF(null); };
  // ⭐ 2026-11-01 카드 → 버튼 하나("자동 승인") + 팝업에서 설정
  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(true)} title={active ? `자동 승인 켜짐 · ${summary}` : "출장·부재로 결재가 어려울 때 켜 두면 내 결재 차례에 자동으로 승인됩니다"}
          className={`h-10 pl-2 pr-4 rounded-xl inline-flex items-center gap-2 text-[13.5px] font-black border transition ${active ? "text-[#1A1405] border-[#D7BC82]" : "bg-white text-[#0F1A30] border-[#DCE3EE] hover:bg-[#F5F8FD]"}`}
          style={active ? { background: "linear-gradient(180deg,#FFF6E2,#F6E7C4)" } : undefined}>
          <span className={`h-7 px-1.5 rounded-lg grid place-items-center text-[10.5px] font-black ${active ? "text-[#1A1405]" : "bg-[#EEF3FC] text-[#1B2B4B]"}`} style={active ? { background: "linear-gradient(180deg,#F1DFB4,#D7BC82)" } : undefined}>AUTO</span>
          자동 승인
          <span className={`h-5 px-1.5 rounded-full text-[11px] font-black grid place-items-center ${active ? "bg-[#B88A2E] text-white" : "bg-[#F1F4F9] text-[#9AA9C3]"}`}>{active ? "켜짐" : "꺼짐"}</span>
        </button>
      </div>
      {open && f && createPortal(
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/45 flex items-center justify-center p-3" onClick={close}>
          <div className="w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-[22px] bg-[#F7F9FC] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#D7BC82]">AUTO APPROVAL · 임원 전용</div>
                <div className="text-[20px] font-black">자동 승인(부재·위임)</div>
                <div className="text-[12.5px] text-white/65 mt-0.5">출장·부재로 결재가 어려울 때 켜 두면, 내 결재 차례가 오는 즉시 자동으로 승인됩니다</div>
              </div>
              <button type="button" onClick={close} className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 font-black">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <button type="button" onClick={() => setF({ ...f, on: !f.on })}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition ${f.on ? "border-[#D7BC82] bg-[#FFF8EA]" : "border-[#DCE3EE] bg-white"}`}>
                <span className={`relative w-12 h-7 rounded-full transition shrink-0 ${f.on ? "bg-[#B88A2E]" : "bg-[#CBD3E0]"}`}><span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${f.on ? "left-6" : "left-1"}`} /></span>
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-black text-[#0F1A30]">자동 승인 {f.on ? "켜기" : "끄기"}</span><span className="block text-[12px] text-[#7A879C]">{f.on ? "저장하면 지금 대기 중인 내 결재도 바로 처리됩니다" : "누르면 켜집니다"}</span></span>
              </button>
              <div className={`space-y-3 ${f.on ? "" : "opacity-50 pointer-events-none"}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">시작일(비우면 오늘부터)</div><CustomDatePicker value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inp} showIcon /></div>
                  <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">종료일(비우면 끌 때까지)</div><CustomDatePicker value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inp} showIcon /></div>
                </div>
                <div><div className="text-[12px] font-bold text-[#5B6B85] mb-1">금액 상한(지출결의)</div><input inputMode="numeric" value={f.maxAmount ? Number(f.maxAmount).toLocaleString() : ""} onChange={(e) => setF({ ...f, maxAmount: e.target.value.replace(/[^\d]/g, "") })} className={`${inp} text-right`} placeholder="제한 없음" /></div>
                <div>
                  <div className="text-[12px] font-bold text-[#5B6B85] mb-1">자동 승인하지 않을 문서(직접 결재)</div>
                  <div className="flex flex-wrap gap-1.5">{AUTO_SKIP_FORMS.map(([k, l]) => { const on = f.skipForms.includes(k); return <button key={k} type="button" onClick={() => setF({ ...f, skipForms: on ? f.skipForms.filter((x) => x !== k) : [...f.skipForms, k] })} className={`h-8 px-3 rounded-full text-[12.5px] font-black border ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{on ? "✓ " : ""}{l}</button>; })}</div>
                </div>
              </div>
              <div className="rounded-xl bg-white border border-[#E3E8F0] px-3 py-2 text-[12px] text-[#5B6B85] leading-relaxed">자동 승인된 결재는 문서에 "자동 승인(부재·위임 설정)"으로 기록되고, 기안자에게 결과가 그대로 통보됩니다. 금액 상한을 넘거나 제외한 문서는 평소처럼 직접 결재합니다.</div>
            </div>
            <div className="sticky bottom-0 px-5 py-4 bg-white border-t border-[#E3E8F0] flex gap-2">
              <button type="button" onClick={close} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#5B6B85]">취소</button>
              <button type="button" disabled={busy} onClick={() => save(f)} className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}

export default function ApprovalCenter({ company, me, page, setPage, openId, onOpened }) {
  const staff = useCompanyStaff(company);
  const rawList = useApprovals(me.uid);
  // ⭐ 2026-10-31 기안자·결재자가 계정 아이디로 보이던 문제 — 본인 문서·각 사람 문서에서 실제 이름을 찾아 쓴다
  const myProfile = useMyProfile(me.uid);
  const nameOf = useUserNames((rawList || []).flatMap((d) => [d.drafterUid, ...(d.line || []).map((x) => x.uid), ...(d.cancel?.line || []).map((x) => x.uid)]));
  const list = React.useMemo(() => (rawList ? rawList.map((d) => {
    const fixLine = (ln) => (Array.isArray(ln) ? ln.map((x) => (nameOf(x.uid) ? { ...x, name: nameOf(x.uid) } : x)) : ln);
    const dn = nameOf(d.drafterUid);
    return { ...d, drafter: dn ? { ...(d.drafter || {}), name: dn } : d.drafter, line: fixLine(d.line), ...(d.cancel ? { cancel: { ...d.cancel, line: fixLine(d.cancel.line) } } : {}) };
  }) : rawList), [rawList, nameOf]);
  const [open, setOpen] = React.useState(null);
  const [preset, setPreset] = React.useState(null);
  // 🧾 2026-11-10 다른 화면(지입차관리 › 차량 비용 영수증 [지출결의 작성])에서 넘겨준 자동 입력값 — sessionStorage kpApPreset
  React.useEffect(() => {
    const take = () => {
      let p = null;
      try { p = JSON.parse(sessionStorage.getItem("kpApPreset") || "null"); } catch { p = null; }
      if (!p || !p.cat) return;
      if (p.cat !== page) { setPage?.(p.cat); return; }
      try { sessionStorage.removeItem("kpApPreset"); } catch { /* 무시 */ }
      setPreset(p);
    };
    take();
    window.addEventListener("kp-ap-preset", take);
    return () => window.removeEventListener("kp-ap-preset", take);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  // 건별 지출결의 — 한 장 상신하면 다음 영수증 지출결의서를 이어서 연다
  const nextQueued = () => {
    let q = [];
    try { q = JSON.parse(sessionStorage.getItem("kpApPresetQueue") || "[]"); } catch { q = []; }
    if (!Array.isArray(q) || !q.length) return false;
    const [next, ...rest] = q;
    try { if (rest.length) sessionStorage.setItem("kpApPresetQueue", JSON.stringify(rest)); else sessionStorage.removeItem("kpApPresetQueue"); } catch { /* 무시 */ }
    setPreset(next);
    return true;
  };
  const [tab, setTab] = React.useState("all");
  const [companyAll, setCompanyAll] = React.useState(null);
  const [lf, setLf] = React.useState({ q: "", from: "", to: "", who: "" }); // 목록 검색·기간·기안자
  const admin = isAdminRole(me.role);
  // ⭐ 2026-11-09 결재함은 들어올 때 항상 '지급 대기'부터
  React.useEffect(() => { setTab("all"); }, [page]); // ⭐ 2026-11-10 결재함도 내 기안함처럼 '전체'부터
  React.useEffect(() => {
    // ⭐ 2026-11-09 버그수정 — 예전엔 '회사 전체' 탭을 눌렀을 때만 구독해서, 관리자가 지급완료·반려 등 다른 탭을 누르면
    //  (내가 결재선에 없는 문서는) 0건이었다 → 결재함에서는 항상 구독해 모든 상태 탭에 회사 문서를 함께 센다
    if (!admin || page !== "inbox" || !company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)),
      (s) => setCompanyAll(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))), () => setCompanyAll([]));
  }, [admin, page, company]);
  // 💸 2026-11-04 지급 대기 — 경리(test)·관리자 역할은 참여하지 않은 지출 문서도 볼 수 있어(규칙상 읽기 허용) 회사 지출 결의를 따로 구독
  const payReader = isFinUser(me); // ⭐ 2026-11-07 지급 권한과 같은 기준
  const [payPool, setPayPool] = React.useState([]);
  React.useEffect(() => {
    if (!payReader || !company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "expense")),
      (s) => setPayPool(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPayPool([]));
  }, [payReader, company]);
  const [signOpen, setSignOpen] = React.useState(false); // ✍ 내 서명 설정
  const meFull = React.useMemo(() => {
    const st = (staff || []).find((u) => u.uid === me.uid);
    const pf = myProfile || {};
    return { ...me, name: personName(pf) || personName(st) || me.name, team: pf.team || st?.team || me.team || "", position: pf.position || st?.position || me.position || "",
      // ✍ 2026-11-04 내 서명·결재 표시 · ⭐ 2026-11-05 도장 이미지(approvalStampImage · markMode "image") — 결재란엔 서명처럼 그림으로 들어간다
      ...(() => { const raw = ["sign", "image"].includes(pf.approvalMarkMode) ? pf.approvalMarkMode : "stamp"; const signImg = pf.approvalSignature || ""; const stampImg = pf.approvalStampImage || "";
        return { rawMode: raw, signImg, stampImg, sign: raw === "image" ? stampImg : signImg, markMode: raw === "image" ? (stampImg ? "sign" : "stamp") : raw }; })() };
  }, [me, staff, myProfile]);
  // 🗂 인사발령 품의 작성·공문 게시 가능 여부(역할은 실제 계정 역할 — 통합인사관리자가 경리 화면이어도 인사 담당)
  const canHr = React.useMemo(() => {
    if (!myProfile) return me.role === "totalMaster";
    const meDoc = { ...myProfile, role: me.role === "totalMaster" ? "totalMaster" : (myProfile.role || me.role), team: myProfile.team || me.team || "" };
    return canHrDraft(meDoc, staff, me.uid);
  }, [myProfile, staff, me.role, me.team, me.uid]);
  const cur = open ? ([...(list || []), ...(companyAll || []), ...payPool].find((x) => x.id === open) || null) : null;
  // ⭐ 2026-11-01 다른 메뉴(결재함↔근태 신청 등)로 옮기면 열려 있던 문서를 닫는다 — 예전엔 마지막으로 본 문서가 다른 메뉴에서 팝업으로 떴다
  React.useEffect(() => { setOpen(null); }, [page]);
  // 배너를 눌러 들어오면 그 문서를 바로 연다
  React.useEffect(() => { if (openId) { setOpen(openId); onOpened?.(); } }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = useLeaveStatus(meFull, list, company);

  const uid = me.uid;
  const isHidden = (d) => (d.hiddenBy || []).includes(uid);
  const L = (list || []).filter((d) => !isHidden(d));
  const hiddenL = (list || []).filter(isHidden);
  const inLine = (d) => (d.line || []).some((s) => s.uid === uid);
  // ⭐ 2026-11-09 결재함 필터 — 회사 전체(관리자)/전체 · 결재 대기(내 차례) · 지급 대기 · 지급완료 · 반려 · 결재 취소 · 회수 · 참조 · 삭제한 문서
  rememberAccounts(list); rememberAccounts(companyAll); rememberAccounts(payPool);
  const lineL0 = L.filter(inLine);
  // 관리자(회사 전체를 보는 사람)는 상태 탭에도 회사 문서 전체를 넣는다 — 결재 대기(내 차례)만 내 문서 기준
  const lineL = admin && companyAll ? [...new Map([...lineL0, ...companyAll.filter((d) => !isHidden(d))].map((d) => [d.id, d])).values()].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)) : lineL0;
  const payMine = [...new Map([...L, ...payPool.filter((d) => !isHidden(d))].map((d) => [d.id, d])).values()];
  const inboxStatus = apStatusSets(lineL); // ⭐ 2026-11-10 내 기안함과 같은 판정 — 진행 중 = 진행 중인 문서 전부(내 차례는 "내 차례" 표시)
  const sets = {
    todo: L.filter((d) => myTurn(d, uid)),
    ...inboxStatus,
    // 💸 지급 대기·지급완료 — 내가 결재선에 있는 문서 + 내가 지급 처리할 수 있는 회사 지출 결의(경리·재무, 오래된 것부터)
    paywait: [...new Map([...inboxStatus.paywait, ...payMine.filter((d) => payState(d) === "wait" && canPay(d, meFull))].map((d) => [d.id, d])).values()]
      .sort((a, b) => toMs(a.updatedAt || a.createdAt) - toMs(b.updatedAt || b.createdAt)),
    paid: [...new Map([...inboxStatus.paid, ...payMine.filter((d) => payState(d) === "paid" && canPay(d, meFull))].map((d) => [d.id, d])).values()],
    cc: L.filter((d) => (d.ccUids || []).includes(uid)),
    company: companyAll,
    hidden: hiddenL,
  };
  // 🛠 2026-11-14 '전체'가 비어 보이던 문제 — 결재선에는 없지만 내가 지급 처리하는 문서(경리 · 재무의 지급 대기 · 지급완료)도 전체에 넣는다
  //  (예전엔 지급 대기 3 · 지급완료 31인데 전체는 0건이었다 — 전체 = 다른 상태 탭에 보이는 문서를 모두 합친 것)
  sets.all = [...new Map([...inboxStatus.all, ...sets.paywait, ...sets.paid].map((d) => [d.id, d])).values()].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const mineL = L.filter((d) => d.drafterUid === uid);
  const mineSets = apStatusSets(mineL);
  const redraft = (d) => { setOpen(null); setPreset({ ...d, editId: null }); setPage(d.cat); };
  const edit = (d) => { setOpen(null); setPreset({ ...d, editId: d.id }); setPage(d.cat); };
  const unreadIn = (arr) => (arr || []).filter((d) => mineUnread(d, uid)).length;

  const year = new Date().getFullYear();
  void year;
  const spentMonth = mineL.filter((d) => d.status === "approved" && d.cat === "expense" && ymd(toMs(d.createdAt)).slice(0, 7) === ymd().slice(0, 7)).reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const isCat = ["leave", "expense", "draft", "report"].includes(page);
  const cat = isCat ? catOf(page) : null;
  const heroTitle = isCat ? cat.label : page === "inbox" ? "결재함" : page === "mine" ? "내 기안함" : "결재선 관리";
  const heroEn = isCat ? cat.en : page === "inbox" ? "INBOX" : page === "mine" ? "MY DOCUMENTS" : "APPROVAL LINES";
  const heroDesc = isCat ? cat.desc : page === "inbox" ? "지급 대기·결재 대기 문서를 처리하고 결재 현황을 확인합니다." : page === "mine" ? "내가 올린 문서의 결재 진행 상황을 봅니다" : "자주 쓰는 결재 순서를 저장해 두고 문서 작성 때 불러옵니다";
  const kpis = isCat
    ? (page === "leave" ? [[leave?.ent ? `잔여 ${leave.ent.label}` : "잔여 연차", leave?.ent ? `${leave.remain}일` : "-"], ["진행 중", mineSets.pending.filter((d) => d.cat === "leave").length]] : page === "expense" ? [["이번 달 승인 금액", fmtWon(spentMonth)], ["진행 중", mineSets.pending.filter((d) => d.cat === "expense").length]] : [["진행 중", mineSets.pending.filter((d) => d.cat === page).length], ["완료", mineSets.approved.filter((d) => d.cat === page).length]]) /* ⭐ 2026-11-02 점검 — 기안·품의/보고·인사 화면이 각자 자기 분류 문서 수를 세도록(page 기준) */
    : [["결재 대기", sets.todo.length], ["내 진행 문서", mineSets.pending.length], ["반려", mineSets.rejected.length]];

  // ⭐ 2026-10-31 넓은 화면(1280px+)은 왼쪽 목록 · 오른쪽 문서 미리보기
  const [wide, setWide] = React.useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);
  React.useEffect(() => { const f = () => setWide(window.innerWidth >= 1280); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const inboxList = (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          {(() => {
            // ⭐ 2026-10-31 탭 숫자는 그 탭의 문서 수(검색·기간 적용), 새 결과는 빨간 점으로 따로
            const F = (k) => applyListTools(sets[k] || [], lf) || [];
            // ⭐ 2026-11-09 결재함 순서: 회사 전체 · 결재 대기 · 지급 대기 · 지급완료 · 반려 · 결재 취소 · 회수 · 참조 문서 · 삭제한 문서
            //   '진행 중·완료'는 뺐다(회사 전체에서 상태로 보임) — 관리자가 아니면 회사 전체 대신 '전체'(내가 결재선에 있는 문서 전부)
            // ⭐ 2026-11-10 결재함 필터 = 내 기안함과 똑같이 — 전체 · 진행 중 · 완료 · (지급 대기 · 지급완료) · 반려 · 결재 취소 · 회수 + 참조 문서 · 삭제한 문서
            //   관리자의 '전체'는 회사 문서 전체(예전 '회사 전체'), 내 차례인 문서는 목록에 "내 차례" 표시로 구분
            const keys = [...apStatusKeys(sets).map(([k]) => k), "cc", "hidden"];
            const label = { ...Object.fromEntries(AP_STATUS_TABS), cc: "참조 문서", hidden: "삭제한 문서" };
            const pool = [...(list || []), ...(companyAll || [])];
            const drafters = [...new Map(pool.filter((d) => d.drafterUid).map((d) => [d.drafterUid, d.drafter?.name || "-"])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "ko"));
            return (<>
              <Tabs tab={tab} setTab={setTab} tabs={keys.map((k) => [k, label[k], F(k).length, k === "cc" ? F(k).filter((d) => ccUnread(d, uid)).length : 0])} />
              <ListTools f={lf} setF={setLf} drafters={drafters} />
              <DocList compact={wide} uid={uid} docs={list === null || (admin && companyAll === null) ? null : F(tab)} onOpen={(d) => setOpen(d.id)} empty={lf.q || lf.from || lf.who ? "조건에 맞는 문서가 없습니다" : tab === "pending" ? "진행 중인 문서가 없습니다" : tab === "paywait" ? "지급을 기다리는 문서가 없습니다" : "문서가 없습니다"} />
            </>);
          })()}
        </div>
  );
  const mineList = (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          {(() => {
            // ⭐ 2026-10-31 숫자는 문서 수(예전엔 "새 결과" 수라 목록 2건인데 1로 보이고, 열어 보면 숫자가 사라졌다) — 새 결과는 빨간 점
            const M = (k) => applyListTools(mineSets[k] || [], lf) || [];
            const keys = apStatusKeys(mineSets);
            return (<>
              <Tabs tab={tab} setTab={setTab} tabs={keys.map(([k, l]) => [k, l, M(k).length, unreadIn(M(k))])} />
              <ListTools f={lf} setF={setLf} />
              <DocList compact={wide} uid={uid} docs={list === null ? null : M(tab)} onOpen={(d) => setOpen(d.id)} empty={lf.q || lf.from ? "조건에 맞는 문서가 없습니다" : "올린 문서가 없습니다. 위 버튼으로 새 문서를 작성하세요."} />
            </>);
          })()}
        </div>
  );
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>E-APPROVAL · {heroEn}</div>
          <div className="text-[20px] md:text-[24px] font-black mt-0.5">{heroTitle}</div>
          <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">{heroDesc}</div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap md:flex-nowrap w-full md:w-auto">
          {kpis.map(([l, v]) => (
            <div key={l} className="flex-1 md:flex-none min-w-[84px] md:min-w-[110px] px-3 md:px-4 py-2 md:py-2.5 rounded-2xl bg-white/[0.07] border border-white/10">
              <div className="text-[12.5px] font-bold text-white/55 whitespace-nowrap truncate">{l}</div>
              <div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
          {/* ✍ 2026-11-04 내 서명 — 결재란에 도장 대신 내 서명 */}
          <button type="button" onClick={() => setSignOpen(true)} title="결재할 때 결재란에 넣을 표시(도장·서명)를 정합니다" data-ap-mysign
            className="w-full md:w-auto h-11 md:h-auto md:self-stretch pl-2 pr-3.5 rounded-2xl bg-white/[0.07] border border-white/15 hover:bg-white/[0.12] inline-flex items-center gap-2 text-left shrink-0">
            <span className="w-9 h-7 md:h-9 rounded-lg bg-white grid place-items-center overflow-hidden">{meFull.markMode === "sign" && meFull.sign ? <img src={meFull.sign} alt="" className="max-w-[32px] max-h-[24px] object-contain" /> : <span className="w-6 h-6 rounded-full border-2 border-[#1B2B4B] text-[#1B2B4B] text-[8px] font-black grid place-items-center">승인</span>}</span>
            <span className="leading-tight"><span className="block text-[13px] font-black">내 서명</span><span className="block text-[11px] font-bold text-white/55">{meFull.markMode === "sign" && meFull.sign ? (meFull.rawMode === "image" ? "도장 이미지로 결재" : "서명으로 결재") : "도장으로 결재"}</span></span>
          </button>
          {!isCat && page !== "lines" && (
            <div className="grid grid-cols-2 md:flex md:flex-col gap-1.5 w-full md:w-auto">
              {APPROVAL_CATS.map((c) => <button key={c.key} type="button" onClick={() => { confirmLeave().then((ok) => { if (ok) { setPreset(null); setPage(c.key); } }); }} className="h-8 px-3 rounded-lg bg-white text-[#0F1A30] text-[13px] font-black inline-flex items-center gap-1.5"><ShellIcon name={c.icon} size={13} />{c.label}</button>)}
            </div>
          )}
        </div>
      </div>

      {/* ⭐ 2026-11-01 자동 승인(부재·위임)은 임원(이사 이상·임원 부서)만 — 예전엔 관리자 권한이면 과장·팀장도 보였다 */}
      {page === "inbox" && (isExecProfile(meFull) || me.role === "totalMaster") && <AutoApproveCard company={company} me={meFull} todo={sets.todo} />}

      {isCat && (
        <>
          <Composer key={`${page}-${preset?.editId || preset?.id || preset?.presetKey || "new"}${page === "report" && canHr ? "-hr" : ""}`} canHr={canHr} myDocs={mineL} company={company} me={meFull} staff={staff} cat={page} preset={preset?.cat === page ? preset : null}
            leave={leave} getLive={(id) => (list || []).find((x) => x.id === id)}
            onDone={() => { if (preset?.presetKey && nextQueued()) return; setPreset(null); setPage("mine"); }} />
        </>
      )}

      {(page === "inbox" || page === "mine") && wide ? (
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "minmax(400px, 0.85fr) minmax(0, 1.5fr)" }}>
          <div className="min-w-0">{page === "inbox" ? inboxList : mineList}</div>
          <div className="min-w-0 sticky top-[76px]">
            {cur ? <Viewer key={cur.id} inline canHr={canHr} d={cur} me={meFull} staff={staff} company={company} onClose={() => setOpen(null)} onRedraft={redraft} onEdit={edit} />
              : <div className="h-[calc(100vh-190px)] min-h-[640px] rounded-[20px] border-2 border-dashed border-[#DCE3EE] bg-white grid place-items-center text-center"><div><div className="text-[12px] font-extrabold tracking-[0.24em] text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>PREVIEW</div><div className="text-[15px] font-black text-[#5B6B85] mt-1">왼쪽 목록에서 문서를 누르면<br />여기에 결재 문서가 바로 보입니다</div></div></div>}
          </div>
        </div>
      ) : <>{page === "inbox" && inboxList}{page === "mine" && mineList}</>}
      {page === "lines" && <LinesPage company={company} me={meFull} staff={staff} />}
      {signOpen && <SignatureModal me={meFull} onClose={() => setSignOpen(false)} />}

      {cur && !(wide && (page === "inbox" || page === "mine")) && <Viewer canHr={canHr} d={cur} me={meFull} staff={staff} company={company} onClose={() => setOpen(null)} onRedraft={redraft} onEdit={edit} />}
    </div>
  );
}

export { APPROVAL_FORMS };

// 🔔 2026-11-03 알림 팝업(NotifyCenter)용 문서 미리보기 — 결재함에서 여는 것과 같은 종이 양식(읽기 전용)
export function ApprovalDocPreview({ d, company }) {
  const staff = useCompanyStaff(company || d?.company || "");
  if (!d) return null;
  const form = formOf(d.form);
  return <FitPaper><ApprovalPaper form={form} data={d.data || {}} title={d.title} line={d.line} cc={d.cc} drafter={d.drafter} docNo={d.docNo} createdMs={toMs(d.createdAt)} staff={staff || []} status={d.status} paid={isPayDoc(d) ? d.paid : null} files={d.files} images={d.images} /></FitPaper>;
}
