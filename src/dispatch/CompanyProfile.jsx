// ======================= src/dispatch/CompanyProfile.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import React from "react";
import { BizListEditor } from "../companyBiz";
import { PopbillMemberCard, BizCheck } from "../publicDataMain";
import { BankAccountsCard, SmsSettingsCard, AlimtalkSettingsCard } from "../PopbillAuto";
import { useMyProfile } from "../userNames";
import { CompanyMailSettingsCard } from "../CompanyMailSettings";
import { AddressField as ResumeAddressField } from "../ResumeInputs";
import { EditableText } from "../EditMode";
import { CustomSelect } from "../CustomSelect";
import { onSnapshot, query, collection, where, getDocs, doc, addDoc, serverTimestamp } from "firebase/firestore";
import { updateDoc } from "../orderWrite";
import { auth, db } from "../firebase";
import { COMPANY_DOC_B64_LIMIT, KP_CARD, shrinkImageForDoc } from "./shared/dispatchCommon.jsx";


// 📋 2026-11-10 회사정보 — 게시판처럼 한 줄씩, 누르면 그 내용만 펼친다
function CpFold({ id, no, title, sub, badge, done, open, onToggle, children }) {
  return (
    <div className={`border-b border-[#EEF1F6] last:border-b-0 ${open ? "bg-[#FAFBFD]" : ""}`} data-kp={`cp-fold-${id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-[#F5F8FD] transition">
        <span className="w-7 text-[12px] font-black text-[#9AA9C3] tabular-nums shrink-0">{String(no).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span className="text-[14.5px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span>
          <span className="text-[12.5px] text-[#7A879C] truncate">{sub}</span>
        </div>
        {badge != null && <span className={`shrink-0 h-6 px-2 inline-flex items-center rounded-md text-[11.5px] font-black tabular-nums ${done ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#7A879C]"}`}>{badge}</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-[#7A879C] transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <div className="cp-fold-body px-3 sm:px-5 pb-5">{children}</div>}
    </div>
  );
}

export default function CompanyProfile({ userCompany = "", role = "", userId = "" }) {
  const companyName = (userCompany || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim();
  const currentUserId = userId || auth?.currentUser?.uid || localStorage.getItem("uid") || "";
  const isAdmin = role === "admin" || role === "totalMaster";
  const isTotalMaster = role === "totalMaster"; // 🔒 팝빌 · 문자 · 알림톡은 아직 준비 중 — 최고관리자만 본다
  const [cpOpen, setCpOpen] = React.useState(() => { try { return sessionStorage.getItem("kpCpOpen") || ""; } catch { return ""; } });
  const cpToggle = (k) => setCpOpen((o) => { const n = o === k ? "" : k; try { sessionStorage.setItem("kpCpOpen", n); } catch { /* 무시 */ } return n; });
  // ⭐ 2026-11-01 사업자등록증·직인 등록은 경리·인사만, 정산계좌 입력·수정은 경리만(다운로드·복사는 누구나)
  const myTeamCP = (() => { try { return String(window.__kpMeTeam || ""); } catch { return ""; } })();
  const isAcctTeam = ["test", "hrAcct", "allMgr", "acctStaff", "totalMaster"].includes(role) || /경리|회계/.test(myTeamCP);
  const canEditDocs = isAcctTeam || role === "hrManager" || /인사/.test(myTeamCP);
  const canEditBank = isAcctTeam;
  const myDocMailCP = useMyProfile(currentUserId); // ✉️ 메일 설정 — 회사 마스터도 바꿀 수 있게

  const [appData, setAppData] = React.useState(null);
  const [altAddr, setAltAddr] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState("");
  const [dragOver, setDragOver] = React.useState(false);
  const [alertMsg, setAlertMsg] = React.useState("");
  const fileRef = React.useRef(null);

  // 계좌번호 상태
  const [bankForm, setBankForm] = React.useState({ bank: "", accountNumber: "", accountHolder: "" });
  const [bankConfirmOpen, setBankConfirmOpen] = React.useState(false);
  const [bankSaving, setBankSaving] = React.useState(false);
  const [bankEditOpen, setBankEditOpen] = React.useState(false);

  // 수정 요청 상태
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState({});
  const [submittingEdit, setSubmittingEdit] = React.useState(false);

  // 수정 요청 결과 알림 (이 계정의 처리된 요청)
  const [resolvedNotice, setResolvedNotice] = React.useState(null);

  const showMsg = (msg) => { setAlertMsg(msg); setTimeout(() => setAlertMsg(""), 3500); };

  // 회사 정보 로드: type === "신규" 문서 우선
  // ⭐ 2026-10-29 로딩 개선 — 예전엔 transportApplications "전체"(모든 운송사 가입신청 +
  //    사업자등록증·직인 base64 이미지, 문서당 최대 수 MB)를 실시간 구독한 뒤 화면에서 우리 회사만
  //    골라냈다. 운송사가 늘수록 다운로드가 커져 "불러오는 중"이 길어졌던 원인.
  //    이제 우리 회사 이름으로만 조회한다. 이름 앞뒤 공백이 다르게 저장된 옛 문서만 1회 전체 조회로 보완.
  const pickCompanyDoc = (docs) => {
    const same = docs.filter(d => (d.companyName || "").trim() === companyName.trim());
    return same.find(d => d.type === "신규" && d.status === "approved")   // 신규 가입 문서(최초 등록 정보) 우선
      || same.find(d => d.type === "신규")                                // 없으면 type === "신규" 중 아무거나
      || same.find(d => d.status === "approved")                          // 그래도 없으면 같은 회사명 승인 문서
      || null;
  };
  React.useEffect(() => {
    if (!companyName) { setLoading(false); return; }
    let fallbackTried = false;
    const unsub = onSnapshot(query(collection(db, "transportApplications"), where("companyName", "==", companyName)), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const found = pickCompanyDoc(all);
      // ⭐ 2026-11-01 회사 문서에 주소가 비어 있으면 같은 회사 다른 신청서의 주소로 보완(표시만)
      setAltAddr((all.find(d => String(d.address || d.주소 || "").trim()) || {}).address || "");
      if (found || fallbackTried) { setAppData(found); setLoading(false); return; }
      fallbackTried = true;
      getDocs(collection(db, "transportApplications"))
        .then((all) => setAppData(pickCompanyDoc(all.docs.map(d => ({ id: d.id, ...d.data() })))))
        .catch(() => setAppData(null))
        .finally(() => setLoading(false));
    }, () => setLoading(false)); // 읽기 실패(권한·네트워크)해도 "불러오는 중"에 멈추지 않게
    return () => unsub();
  }, [companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  // 이 계정의 처리된 수정 요청 실시간 감지 — 내 요청만 조회(예전엔 전체 회사 요청을 받았다)
  React.useEffect(() => {
    if (!currentUserId) return;
    const unsub = onSnapshot(query(collection(db, "companyEditRequests"), where("requestedByUserId", "==", currentUserId)), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const resolved = docs.find(d =>
        d.requestedByUserId === currentUserId &&
        (d.status === "approved" || d.status === "rejected") &&
        !d.notifiedRequester
      );
      if (resolved) setResolvedNotice(resolved);
    });
    return () => unsub();
  }, [currentUserId]);

  // 파일을 base64로 변환 후 Firestore 저장 (Storage quota 우회)
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!canEditDocs) { showMsg("사업자등록증 등록은 경리팀·인사팀만 할 수 있습니다."); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) { showMsg("JPG, PNG, WEBP, PDF 파일만 업로드 가능합니다."); return; }
    // ⭐ 2026-11-02 점검 — PDF는 압축할 수 없어 600KB까지만, 이미지는 아래에서 줄인 뒤 문서 한도로 다시 확인
    if (file.type === "application/pdf" && file.size > 600 * 1024) { showMsg("PDF는 600KB 이하만 저장할 수 있습니다. 사진(JPG·PNG)으로 올리면 자동으로 줄여 저장합니다."); return; }
    if (file.size > 20 * 1024 * 1024) { showMsg("파일이 너무 큽니다(20MB 초과)."); return; }
    // ⚠️ 예전엔 회사 정보(appData)를 못 찾았을 때 저장은 건너뛰고 "업로드되었습니다"만 띄웠다
    if (!appData?.id) { showMsg("회사 정보를 찾지 못해 저장할 수 없습니다. 새로고침 후 다시 시도해 주세요."); return; }
    setUploading(true);
    setUploadProgress("업로드 중...");
    try {
      // base64로 변환
      // ⭐ 2026-11-02 점검 — 이미지는 긴 변 1600px JPEG로 줄이고, 직인과 합친 크기가 문서 한도를 넘으면 저장하지 않음
      const isImg = file.type.startsWith("image/");
      const base64 = isImg ? await shrinkImageForDoc(file, { max: 1600, quality: 0.8 }) : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const saveType = isImg ? ((String(base64).match(/^data:([^;,]+)/) || [])[1] || file.type) : file.type;
      if (base64.length + (appData?.직인이미지?.length || 0) > COMPANY_DOC_B64_LIMIT) { showMsg("파일이 너무 큽니다. 약 600KB 이하로 줄여 주세요."); return; }
      if (appData?.id) {
        await updateDoc(doc(db, "transportApplications", appData.id), {
          사업자등록증Base64: base64,
          사업자등록증파일명: file.name,
          사업자등록증업로드일: new Date().toISOString(),
          사업자등록증타입: saveType,
        });
        setAppData(prev => ({ ...prev, 사업자등록증Base64: base64, 사업자등록증파일명: file.name, 사업자등록증타입: saveType }));
      }
      showMsg("사업자등록증이 업로드되었습니다.");
    } catch (err) {
      showMsg("업로드 실패: " + (err.message || "알 수 없는 오류"));
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  // ★ 직인(도장) 이미지 업로드 — 거래명세서/보고서 등 도장이 찍히는 모든 곳(COMPANY_PRINT.seal,
  // fetchCompanyPrintInfo)이 이 필드(직인이미지)를 읽어가므로, 여기서 한 번만 업로드해두면
  // 프로그램 어디든 자동으로 반영된다. 사업자등록증 업로드와 같은 방식(base64로 Firestore 저장).
  const [sealUploading, setSealUploading] = React.useState(false);
  const sealFileRef = React.useRef(null);
  const handleSealUpload = async (file) => {
    if (!file) return;
    if (!canEditDocs) { showMsg("직인 등록은 경리팀·인사팀만 할 수 있습니다."); return; }
    if (!appData?.id) { showMsg("회사 정보가 아직 등록되지 않아 도장을 저장할 수 없습니다."); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { showMsg("JPG, PNG, WEBP 이미지만 업로드 가능합니다."); return; }
    if (file.size > 10 * 1024 * 1024) { showMsg("도장 이미지가 너무 큽니다(10MB 초과)."); return; }
    setSealUploading(true);
    try {
      // ⭐ 2026-11-02 점검 — 직인은 긴 변 600px로 줄여(투명 배경 유지) 사업자등록증과 합친 크기가 문서 한도(1MiB)를 넘지 않게 확인
      const base64 = await shrinkImageForDoc(file, { max: 600, keepAlpha: true });
      if (base64.length + (appData?.사업자등록증Base64?.length || 0) > COMPANY_DOC_B64_LIMIT) { showMsg("파일이 너무 큽니다. 약 600KB 이하로 줄여 주세요."); return; }
      await updateDoc(doc(db, "transportApplications", appData.id), { 직인이미지: base64 });
      setAppData(prev => ({ ...prev, 직인이미지: base64 }));
      showMsg("도장 이미지가 저장되었습니다. 거래명세서 등에 바로 반영됩니다.");
    } catch (err) {
      showMsg("업로드 실패: " + (err.message || "알 수 없는 오류"));
    } finally {
      setSealUploading(false);
    }
  };

  const handleCopyImage = async () => {
    const src = appData?.사업자등록증Base64 || appData?.사업자등록증URL;
    if (!src) return;
    try {
      if (src.startsWith("data:image/")) {
        const res = await fetch(src);
        let blob = await res.blob();
        // 클립보드는 PNG만 받는 브라우저가 많아 JPG·WEBP는 PNG로 바꿔서 복사
        if (blob.type !== "image/png") {
          blob = await new Promise((ok, no) => { const im = new Image(); im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; cv.getContext("2d").drawImage(im, 0, 0); cv.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"); }; im.onerror = no; im.src = src; });
        }
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showMsg("이미지가 클립보드에 복사되었습니다.");
      } else {
        showMsg("PDF는 이미지 복사를 지원하지 않습니다. 다운로드를 이용하세요.");
      }
    } catch {
      showMsg("복사에 실패했습니다. 다운로드를 이용하세요.");
    }
  };

  const handleDownload = () => {
    const src = appData?.사업자등록증Base64 || appData?.사업자등록증URL;
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = appData.사업자등록증파일명 || "사업자등록증";
    if (!src.startsWith("data:")) a.target = "_blank";
    a.click();
  };

  const openEditModal = () => {
    setEditForm({
      companyName: appData?.companyName || "",
      representative: appData?.representative || appData?.대표자 || appData?.ceo || "",
      address: appData?.address || appData?.주소 || "",
      businessNumber: appData?.businessNumber || appData?.사업자번호 || "",
      phone: appData?.phone || appData?.연락처 || "",
      fax: appData?.fax || appData?.팩스 || appData?.팩스번호 || "",
      email: appData?.email || "",
    });
    setEditModalOpen(true);
  };

  const submitEditRequest = async () => {
    if (submittingEdit) return;
    setSubmittingEdit(true);
    try {
      await addDoc(collection(db, "companyEditRequests"), {
        companyName,
        requestedByUserId: currentUserId,
        requestedByEmail: appData?.email || auth?.currentUser?.email || "",
        originalData: {
          companyName: appData?.companyName || "",
          representative: appData?.representative || appData?.대표자 || "",
          address: appData?.address || appData?.주소 || "",
          businessNumber: appData?.businessNumber || appData?.사업자번호 || "",
          phone: appData?.phone || appData?.연락처 || "",
          fax: appData?.fax || appData?.팩스 || appData?.팩스번호 || "",
          email: appData?.email || "",
        },
        requestedData: editForm,
        status: "pending",
        createdAt: serverTimestamp(),
        notifiedRequester: false,
        transportApplicationId: appData?.id || "",
      });
      setEditModalOpen(false);
      showMsg("수정 요청이 제출되었습니다. 최고관리자 승인 후 반영됩니다.");
    } catch (err) {
      showMsg("요청 제출 실패: " + (err.message || "알 수 없는 오류"));
    } finally {
      setSubmittingEdit(false);
    }
  };

  // appData 로드 시 계좌 정보 초기화
  React.useEffect(() => {
    if (appData) {
      setBankForm({
        bank: appData.계좌은행 || "",
        accountNumber: appData.계좌번호 || "",
        accountHolder: appData.예금주 || "",
      });
    }
  }, [appData?.id]);

  const saveBank = async () => {
    if (!appData?.id) return;
    if (!canEditBank) { showMsg("정산계좌는 경리팀만 입력·수정할 수 있습니다."); return; }
    setBankSaving(true);
    try {
      await updateDoc(doc(db, "transportApplications", appData.id), {
        계좌은행: bankForm.bank,
        계좌번호: bankForm.accountNumber,
        예금주: bankForm.accountHolder,
      });
      setBankConfirmOpen(false);
      setBankEditOpen(false);
      setAppData(prev => ({ ...prev, 계좌은행: bankForm.bank, 계좌번호: bankForm.accountNumber, 예금주: bankForm.accountHolder }));
      showMsg("계좌 정보가 저장되었습니다.");
    } catch (err) {
      showMsg("저장 실패: " + (err.message || "알 수 없는 오류"));
    } finally {
      setBankSaving(false);
    }
  };

  const dismissNotice = async () => {
    if (resolvedNotice?.id) {
      await updateDoc(doc(db, "companyEditRequests", resolvedNotice.id), { notifiedRequester: true }).catch(() => {});
    }
    setResolvedNotice(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-[14px]">불러오는 중...</div>;

  const InfoRow = ({ label, value }) => (
    <div className="flex items-start py-3 border-b border-gray-100 last:border-0">
      <span className="w-32 text-[13px] font-semibold text-gray-500 shrink-0">{label}</span>
      <span className="text-[14px] text-gray-900">{value || "-"}</span>
    </div>
  );

  const filePreviewSrc = appData?.사업자등록증Base64 || appData?.사업자등록증URL;
  const isImage = filePreviewSrc && (
    (appData?.사업자등록증타입 || "").startsWith("image/") ||
    /\.(jpg|jpeg|png|webp)/i.test(appData?.사업자등록증파일명 || "")
  );

  return (
    <div>
      {/* 토스트 알림 */}
      {alertMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] bg-[#1B2B4B] text-white px-5 py-3 rounded-xl shadow-lg text-[13px] font-medium">
          {alertMsg}
        </div>
      )}

      {/* 수정 요청 결과 알림 팝업 */}
      {resolvedNotice && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999999]">
          <div className="bg-white rounded-2xl w-[calc(100%-24px)] max-w-[440px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="companyProfile.resultModal.title" defaultText="회사 정보 수정 요청 결과" /></h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${resolvedNotice.status === "approved" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <span className={`text-[13px] font-bold ${resolvedNotice.status === "approved" ? "text-emerald-700" : "text-red-700"}`}>
                  {resolvedNotice.status === "approved" ? "승인됨" : "거절됨"}
                </span>
              </div>
              {resolvedNotice.status === "rejected" && resolvedNotice.rejectReason && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">거절 사유</div>
                  <div className="text-[13px] text-gray-800">{resolvedNotice.rejectReason}</div>
                </div>
              )}
              {resolvedNotice.status === "approved" && (
                <div className="text-[13px] text-gray-600">회사 정보가 요청하신 내용으로 반영되었습니다.</div>
              )}
            </div>
            <div className="px-6 pb-5">
              <button className="w-full py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition" onClick={dismissNotice}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 2026-11-01 개편 — 회사 명패 → 등록 현황 → [기본 정보 | 정산 계좌] → 회사 서류 (모바일은 한 줄씩) ===== */}
      <div className="space-y-5">
        {(() => {
          const v = {
            ceo: appData?.representative || appData?.대표자 || appData?.ceo || "",
            biz: appData?.businessNumber || appData?.사업자번호 || "",
            tel: appData?.phone || appData?.연락처 || "",
            fax: appData?.fax || appData?.팩스 || appData?.팩스번호 || "",
            email: appData?.email || "",
            addr: appData?.address || appData?.주소 || altAddr || "",
          };
          const approvedDay = appData?.approvedAt ? new Date(appData.approvedAt).toLocaleDateString("ko-KR") : appData?.processedAt?.seconds ? new Date(appData.processedAt.seconds * 1000).toLocaleDateString("ko-KR") : "";
          const steps = [
            { k: "기본 정보", done: !!(v.ceo && v.biz && v.tel && v.addr), sub: "대표·사업자번호·연락처·주소" },
            { k: "사업자등록증", done: !!filePreviewSrc, sub: "거래처 제출용" },
            { k: "직인(도장)", done: !!appData?.직인이미지, sub: "명세서 자동 날인" },
            { k: "정산 계좌", done: !!appData?.계좌은행, sub: "청구서 입금 계좌" },
          ];
          const pct = Math.round((steps.filter((x) => x.done).length / steps.length) * 100);
          const copy = (t, label) => navigator.clipboard?.writeText(t).then(() => showMsg(`${label}을(를) 복사했습니다.`)).catch(() => showMsg("복사에 실패했습니다."));
          const I = ({ d }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
          const rows = [
            ["대표자", v.ceo, <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>],
            ["사업자번호", v.biz, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></>],
            ["대표 연락처", v.tel, <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />],
            ["팩스", v.fax, <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="9" rx="2" /><path d="M6 14h12v7H6z" /></>],
            ["이메일", v.email, <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>],
            ["주소", v.addr, <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>, true],
          ];
          return (<>
            {/* ===== 2026-11-07 화면 넓게 — 왼쪽: 회사 명패 · 등록 현황(고정) / 오른쪽: 기본 정보 · 회사 서류 · 정산 계좌 · 사업자 관리 ===== */}
            <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
            <aside className="space-y-5 min-w-0 xl:sticky xl:top-2">
            {/* 회사 명패 */}
            <section className="relative overflow-hidden rounded-[20px] text-white shadow-[0_8px_22px_rgba(15,26,48,0.18)]" style={{ background: "linear-gradient(150deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
              <div className="relative p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl ring-1 ring-white/25 grid place-items-center text-[22px] font-black shrink-0" style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.22),rgba(255,255,255,0.06))" }}>{(appData?.companyName || companyName || "?").slice(0, 1)}</div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">COMPANY PROFILE</div>
                    <div className="text-[20px] font-black tracking-tight leading-tight truncate">{appData?.companyName || companyName}</div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px]">
                  {v.ceo && <span className="px-2 h-[22px] inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 font-bold">대표 {v.ceo}</span>}
                  {approvedDay && <span className="px-2 h-[22px] inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 font-bold">가입 {approvedDay}</span>}
                  <span className={`px-2 h-[22px] inline-flex items-center rounded-md font-black ${pct === 100 ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-white/10 ring-1 ring-white/15"}`}>등록 {pct}%</span>
                </div>
                {(appData?.companyCode || (isAdmin && appData)) && (
                  <div className="mt-3 pt-3 border-t border-white/10 grid gap-2">
                    {appData?.companyCode && (
                      <button onClick={() => copy(appData.companyCode, "회사코드")} className="text-left rounded-xl bg-white/10 ring-1 ring-white/20 px-3.5 py-2 hover:bg-white/15 transition flex items-center gap-3" title="눌러서 복사">
                        <div className="text-[11px] font-bold text-blue-200/80 shrink-0">회사코드</div>
                        <div className="text-[16px] font-black tabular-nums tracking-wider truncate">{appData.companyCode}</div><span className="ml-auto text-[11px] font-bold text-blue-200/70 shrink-0">복사</span>
                      </button>
                    )}
                    {isAdmin && appData && (
                      <button onClick={openEditModal} className="h-9 px-4 rounded-xl bg-white text-[#1B2B4B] text-[13px] font-black hover:bg-blue-50 transition whitespace-nowrap">정보 수정 요청</button>
                    )}
                  </div>
                )}
                {!appData && <div className="mt-4 text-[13.5px] text-blue-100/80">가입 승인 후 회사 정보가 표시됩니다.</div>}
              </div>
            </section>

            {/* 등록 현황 */}
            <section className={`${KP_CARD} p-4`}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">CHECKLIST</div>
                  <div className="mt-0.5 text-[15px] font-black text-[#0F1A30]">등록 현황</div>
                </div>
                <div className="text-[20px] font-black text-[#1B2B4B] tabular-nums leading-none">{pct}<span className="text-[13px] ml-0.5">%</span></div>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#1B2B4B,#4B6CB7)" }} /></div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
                {steps.map((st) => (
                  <div key={st.k} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${st.done ? "bg-[#F5F8FD] border-[#DCE6F7]" : "bg-white border-[#E8EDF4]"}`}>
                    <span className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 ${st.done ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#9AA9C3]"}`}>
                      {st.done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg> : <span className="text-[11px] font-black">!</span>}
                    </span>
                    <div className="min-w-0 flex-1 flex items-baseline gap-2"><span className="text-[13px] font-black text-[#0F1A30] whitespace-nowrap">{st.k}</span><span className="text-[11.5px] text-[#9AA9C3] truncate">{st.sub}</span></div>
                    <span className={`shrink-0 h-5 px-1.5 inline-flex items-center rounded-md text-[11px] font-black ${st.done ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#7A879C]"}`}>{st.done ? "완료" : "미등록"}</span>
                  </div>
                ))}
              </div>
            </section>
            </aside>

            <div className="space-y-5 min-w-0">
            <div className={`${KP_CARD} overflow-hidden min-w-0`} data-kp="cp-board">
              <div className="px-4 sm:px-5 py-3 border-b border-[#EEF1F6] flex items-baseline gap-2 bg-white">
                <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">COMPANY</span>
                <span className="text-[15px] font-black text-[#0F1A30]">회사 정보</span>
                <span className="ml-auto text-[12px] text-[#9AA9C3]">항목을 누르면 펼쳐져요</span>
              </div>
            {(() => { let no = 0; const F = (id, title, sub, badge, done, body) => <CpFold key={id} id={id} no={++no} title={title} sub={sub} badge={badge} done={done} open={cpOpen === id} onToggle={() => cpToggle(id)}>{body}</CpFold>;
              const infoN = rows.filter((r) => r[1]).length; const docN = (filePreviewSrc ? 1 : 0) + (appData?.직인이미지 ? 1 : 0);
              return [
            F("info", "기본 정보", "거래명세서·명함 등에 쓰이는 회사 정보", `${infoN}/${rows.length}`, infoN === rows.length, <>
            {/* 기본 정보 */}
              <section className={`${KP_CARD} p-4 sm:p-5 min-w-0`}>
                <div className="flex items-start gap-3 pb-3 mb-3.5 border-b border-[#EEF1F6]">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">INFORMATION</div>
                    <div className="mt-0.5 text-[15px] font-black text-[#0F1A30] tracking-tight">기본 정보</div>
                    <div className="text-[12.5px] text-[#7A879C] mt-0.5">거래명세서·명함 등에 쓰이는 회사 정보 · 눌러서 복사</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2">
                  {rows.map(([k, val, ic, wide]) => (
                    <button key={k} type="button" disabled={!val} onClick={() => copy(val, k)} title={val ? "눌러서 복사" : ""}
                      className={`group text-left flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#F7F9FC] border border-[#EDF1F7] min-w-0 hover:border-[#C9D6EE] disabled:hover:border-[#EDF1F7] transition ${wide ? "sm:col-span-2 2xl:col-span-3" : ""}`}>
                      <span className="w-7 h-7 rounded-lg bg-white border border-[#E3E8F0] text-[#2D4C82] grid place-items-center shrink-0"><I d={ic} /></span>
                      <div className="min-w-0 flex-1"><div className="text-[11.5px] font-bold text-[#7A879C]">{k}</div><div className={`text-[14px] font-extrabold truncate ${val ? "text-[#0F1A30]" : "text-[#B4BFD0]"}`}>{val || "미등록"}</div></div>
                      {val && <span className="text-[11px] font-black text-[#9AA9C3] opacity-0 group-hover:opacity-100 transition shrink-0">복사</span>}
                    </button>
                  ))}
                </div>
              </section></>),
            F("docs", "회사 서류", "사업자등록증 · 직인(도장)", `${docN}/2`, docN === 2, <>
            {/* 회사 서류 */}
            <section className={`${KP_CARD} p-4 sm:p-5 min-w-0`}>
              <div className="pb-3 mb-3.5 border-b border-[#EEF1F6]">
                <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">DOCUMENTS</div>
                <div className="mt-0.5 text-[15px] font-black text-[#0F1A30] tracking-tight">회사 서류</div>
                <div className="text-[12.5px] text-[#7A879C] mt-0.5">명세서·보고서에 자동으로 쓰여요 · 끌어다 놓기 가능</div>
              </div>
            <input autoComplete="off" ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFileUpload(e.target.files?.[0])} />
            <input autoComplete="off" ref={sealFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleSealUpload(e.target.files?.[0])} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-2">
              {[
                {
                  key: "biz", title: "사업자등록증", done: !!filePreviewSrc, sub: filePreviewSrc ? (appData.사업자등록증파일명 || "등록된 파일") : "JPG·PNG·PDF / 최대 600KB(사진은 자동 축소)",
                  busy: uploading ? uploadProgress : "", onUpload: () => fileRef.current?.click(),
                  onDrop: (f) => handleFileUpload(f),
                  actions: filePreviewSrc ? [
                    ...(isImage ? [{ label: "이미지 복사", on: handleCopyImage }] : []),
                    { label: "다운로드", on: handleDownload, primary: true },
                  ] : [],
                },
                {
                  key: "seal", title: "직인(도장)", done: !!appData?.직인이미지, sub: appData?.직인이미지 ? "거래명세서·보고서에 자동으로 찍힙니다" : "배경이 투명한 PNG 권장 / 최대 600KB(자동 축소)",
                  busy: sealUploading ? "업로드 중..." : "", onUpload: () => sealFileRef.current?.click(),
                  onDrop: (f) => handleSealUpload(f),
                  actions: appData?.직인이미지 ? [
                    { label: "이미지 복사", on: async () => { try { const b = await (await fetch(appData.직인이미지)).blob(); const png = b.type === "image/png" ? b : await new Promise((res) => { const im = new Image(); im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; cv.getContext("2d").drawImage(im, 0, 0); cv.toBlob(res, "image/png"); }; im.src = appData.직인이미지; }); await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); showMsg("직인 이미지를 복사했습니다."); } catch { showMsg("복사에 실패했습니다. 다운로드를 이용하세요."); } } },
                    { label: "다운로드", primary: true, on: () => { const a = document.createElement("a"); a.href = appData.직인이미지; const ext = (appData.직인이미지.match(/^data:image\/(\w+)/)?.[1] || "png").replace("jpeg", "jpg"); a.download = `${companyName || "직인"}_직인.${ext}`; a.click(); } },
                  ] : [],
                },
              ].map((d) => (
                <div key={d.key}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(d.key); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); if (canEditDocs) d.onDrop(e.dataTransfer.files?.[0]); }}
                  className={`flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-xl border transition ${dragOver === d.key ? "border-[#1B2B4B] bg-[#F5F8FD]" : "border-[#E3E8F0] bg-white"}`}>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${d.done ? "bg-[#0F1A30] text-white" : "bg-[#F1F4F9] text-[#9AA9C3]"}`}>
                    {d.done
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">{d.title}</span>
                      <span className={`whitespace-nowrap text-[11.5px] font-extrabold px-2 py-0.5 rounded-full ${d.done ? "bg-[#0F1A30] text-white" : "border border-[#C9D2E0] text-[#7A879C]"}`}>{d.done ? "등록됨" : "미등록"}</span>
                    </div>
                    <div className="text-[12px] text-[#9AA9C3] truncate">{d.sub}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {d.actions.map((a) => (
                      <button key={a.label} onClick={a.on}
                        className={`h-8 px-3 rounded-lg text-[12.5px] font-bold transition ${a.primary ? "bg-[#1B2B4B] text-white hover:bg-[#243a60]" : "border border-[#D9E0EA] text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>{a.label}</button>
                    ))}
                    {canEditDocs ? (
                      <button onClick={d.onUpload} disabled={!!d.busy}
                        className="h-8 px-3 rounded-lg text-[12.5px] font-bold border border-[#1B2B4B]/40 text-[#1B2B4B] hover:bg-[#1B2B4B]/5 disabled:opacity-40">
                        {d.busy || (d.done ? "다시 올리기" : "등록하기")}
                      </button>
                    ) : !d.done ? (
                      <span className="h-8 px-3 inline-flex items-center rounded-lg text-[12px] font-bold text-[#7A879C] bg-[#F1F4F9]">경리·인사팀 등록</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            </section></>),
            F("bank", "정산 계좌", "청구서·거래명세서에 표시되는 입금 계좌", appData?.계좌은행 ? "등록됨" : "미등록", !!appData?.계좌은행, <>
            {/* 정산 계좌 */}
              <section className={`${KP_CARD} p-4 sm:p-5 min-w-0`}>
                <div className="flex items-start pb-3 mb-3.5 border-b border-[#EEF1F6]">
                  <div>
                    <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">BANK ACCOUNT</div>
                    <div className="mt-0.5 text-[15px] font-black text-[#0F1A30] tracking-tight">정산 계좌</div>
                    <div className="text-[12.5px] text-[#7A879C] mt-0.5">청구서·거래명세서에 표시되는 입금 계좌</div>
                  </div>
                  {canEditBank && appData?.계좌은행 && !bankEditOpen && <button onClick={() => setBankEditOpen(true)} className="ml-auto h-8 px-3 rounded-lg border border-[#D9E0EA] text-[12.5px] font-bold text-gray-700 hover:bg-gray-50">수정</button>}
                </div>
                {!canEditBank && !appData?.계좌은행 ? (
                  <div className="rounded-xl border border-dashed border-[#C9D2E0] bg-[#F7F9FC] px-4 py-5 text-center">
                    <div className="text-[14px] font-bold text-[#1B2B4B]">등록된 정산 계좌가 없습니다</div>
                    <div className="text-[12.5px] text-[#7A879C] mt-1">정산 계좌는 경리팀만 입력·수정할 수 있습니다</div>
                  </div>
                ) : (appData?.계좌은행 && (!bankEditOpen || !canEditBank)) ? (
                  <div className="relative overflow-hidden rounded-2xl text-white px-4 py-4 min-h-[128px] w-full max-w-[420px]" style={{ background: "linear-gradient(135deg, #1B2B4B 0%, #2D4C82 100%)" }}>
                    <div className="absolute -right-10 -bottom-12 w-40 h-40 rounded-full bg-white/[0.07]" />
                    <div className="relative h-full flex flex-col">
                      <div className="flex items-center"><div className="text-[16px] font-black">{appData.계좌은행}</div><div className="ml-auto w-9 h-6 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 opacity-90" /></div>
                      <div className="mt-auto pt-4 text-[20px] font-black tabular-nums tracking-wider">{appData.계좌번호}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <div className="text-[14px] font-semibold text-blue-50/90">예금주 {appData.예금주 || "-"}</div>
                        <button onClick={() => { const t = `${appData.계좌은행} ${appData.계좌번호} ${appData.예금주 || ""}`.trim(); navigator.clipboard?.writeText(t).then(() => showMsg("계좌번호를 복사했습니다.")).catch(() => showMsg("복사에 실패했습니다.")); }}
                          className="ml-auto h-8 px-3 rounded-lg bg-white/15 ring-1 ring-white/25 text-[12.5px] font-bold hover:bg-white/25 transition">계좌 복사</button>
                        <button onClick={() => { navigator.clipboard?.writeText(String(appData.계좌번호 || "").replace(/[^\d]/g, "")).then(() => showMsg("숫자만 복사했습니다.")).catch(() => {}); }}
                          className="h-8 px-3 rounded-lg bg-white/15 ring-1 ring-white/25 text-[12.5px] font-bold hover:bg-white/25 transition" title="하이픈 없이 숫자만">숫자만</button>
                      </div>
                    </div>
                  </div>
                ) : (
              <div className="space-y-3 max-w-[560px]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1.5"><EditableText id="companyProfile.bankForm.label.은행" defaultText="은행" /></label>
                    <CustomSelect
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[#1B2B4B] bg-white"
                      value={bankForm.bank}
                      onChange={e => setBankForm(p => ({ ...p, bank: e.target.value }))}
                    >
                      <option value="">은행 선택</option>
                      {["국민은행","신한은행","우리은행","하나은행","기업은행","농협은행","카카오뱅크","케이뱅크","토스뱅크","SC제일은행","씨티은행","대구은행","부산은행","경남은행","광주은행","전북은행","제주은행","우체국","새마을금고","신협"].map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1.5"><EditableText id="companyProfile.bankForm.label.예금주" defaultText="예금주" /></label>
                    <input autoComplete="off"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[#1B2B4B]"
                      placeholder="예금주 이름"
                      value={bankForm.accountHolder}
                      onChange={e => setBankForm(p => ({ ...p, accountHolder: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-500 mb-1.5"><EditableText id="companyProfile.bankForm.label.계좌번호" defaultText="계좌번호" /></label>
                  <input autoComplete="off"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[#1B2B4B]"
                    placeholder="숫자만 입력 (하이픈 제외)"
                    value={bankForm.accountNumber}
                    onChange={e => setBankForm(p => ({ ...p, accountNumber: e.target.value.replace(/[^\d-]/g, "") }))}
                  />
                </div>
                    <div className="flex justify-end gap-2">
                      {appData?.계좌은행 && <button onClick={() => setBankEditOpen(false)} className="h-10 px-4 rounded-xl border border-gray-300 text-[13px] font-bold text-gray-600">취소</button>}
                      <button
                        className="ml-auto h-10 px-6 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[14px] font-bold transition disabled:opacity-40"
                        disabled={!bankForm.bank || !bankForm.accountNumber || !bankForm.accountHolder}
                        onClick={() => { if (!bankForm.bank || !bankForm.accountNumber || !bankForm.accountHolder) return; setBankConfirmOpen(true); }}
                      >계좌 저장</button>
                    </div>
                  </div>
                )}
              </section></>),
            /* ⭐ 2026-11-03 한 회사 · 여러 사업자 — 오더마다 청구 사업자를 고른다 */
            F("biz", "사업자 목록", "한 회사가 여러 사업자를 쓰면 오더마다 청구 사업자를 골라요", null, false,
              <BizListEditor company={companyName} canEdit={isAcctTeam || isAdmin || role === "hrManager"} />),
            /* ✉️ 2026-11-08 발신 메일 — 회사마다 자기 메일 계정으로(앱 비밀번호는 서버에만 · 암호화) */
            F("mail", "발신 메일", "명세서·청구서를 보낼 회사 메일 계정", null, false,
              <CompanyMailSettingsCard company={companyName} role={role} isMaster={myDocMailCP?.isMaster === true} myEmail={auth?.currentUser?.email || ""} />),
            /* 🔒 2026-11-10 팝빌 · 입금 자동 조회 · 문자 · 알림톡 — 아직 준비 중이라 최고관리자만 */
            ...(isTotalMaster ? [
              F("popbill", "팝빌 연동회원", "세금계산서 · 알림톡 · 계좌조회 (준비 중 · 최고관리자만 보임)", null, false,
                <PopbillMemberCard company={companyName} canEdit={isAdmin || role === "hrManager"} />),
              F("bankAuto", "입금 자동 조회", "미수금 자동 매칭 (준비 중 · 최고관리자만 보임)", null, false,
                <BankAccountsCard company={companyName} canEdit={isAdmin || role === "hrManager"} />),
              F("sms", "문자 보내기", "PC에서 기사 · 거래처에게 보내는 문자 (준비 중 · 최고관리자만 보임)", null, false,
                <SmsSettingsCard company={companyName} canEdit={isAdmin || role === "hrManager"} />),
              F("alimtalk", "카카오 알림톡 배차 알림", "배차완료되면 자동으로 (준비 중 · 최고관리자만 보임)", null, false,
                <AlimtalkSettingsCard company={companyName} canEdit={isAdmin || role === "hrManager"} />),
            ] : []),
              ]; })()}
            </div>
            </div>
            </div>
          </>);
        })()}

        {/* ⭐ 2026-10-29 — "운영 설정"(결제일·연간 매출목표)은 업무에 맞는 메뉴로 옮겼다.
            결제일 → 정산관리 › 지급관리 / 연간 매출목표 → 매출관리 › 매출 대시보드. 저장 위치(companySettings)는 그대로. */}
      </div>

      {/* 계좌 확인 팝업 */}
      {bankConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999999]">
          <div className="bg-white rounded-2xl w-[calc(100%-24px)] max-w-[440px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="companyProfile.bankConfirm.title" defaultText="계좌 정보 확인" /></h3>
              <p className="text-white/55 text-[12px] mt-0.5"><EditableText id="companyProfile.bankConfirm.subtitle" defaultText="입력하신 정보가 맞는지 확인해 주세요" /></p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500 w-20"><EditableText id="companyProfile.bankConfirm.은행" defaultText="은행" /></span>
                  <span className="text-[14px] font-bold text-[#1B2B4B]">{bankForm.bank}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-[13px] font-semibold text-gray-500 w-20"><EditableText id="companyProfile.bankConfirm.계좌번호" defaultText="계좌번호" /></span>
                  <span className="text-[14px] font-bold text-[#1B2B4B] tabular-nums">{bankForm.accountNumber}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-[13px] font-semibold text-gray-500 w-20"><EditableText id="companyProfile.bankConfirm.예금주" defaultText="예금주" /></span>
                  <span className="text-[14px] font-bold text-[#1B2B4B]">{bankForm.accountHolder}</span>
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3 border-t border-gray-100 pt-4">
              <button
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
                onClick={() => setBankConfirmOpen(false)}>
                <EditableText id="companyProfile.bankConfirm.다시수정" defaultText="아니오, 다시 수정" />
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition disabled:opacity-50"
                disabled={bankSaving}
                onClick={saveBank}>
                {bankSaving ? <EditableText id="companyProfile.bankConfirm.저장중" defaultText="저장 중..." /> : <EditableText id="companyProfile.bankConfirm.저장합니다" defaultText="예, 저장합니다" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 요청 모달 */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999999]">
          <div className="bg-white rounded-2xl w-[calc(100%-24px)] max-w-[520px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]"><EditableText id="companyProfile.editModal.title" defaultText="회사 정보 수정 요청" /></h3>
                <p className="text-white/55 text-[12px] mt-0.5"><EditableText id="companyProfile.editModal.subtitle" defaultText="최고관리자 승인 후 반영됩니다" /></p>
              </div>
              <button className="text-white/50 hover:text-white text-lg transition" onClick={() => setEditModalOpen(false)}>✕</button>
            </div>
            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {[
                { label: "회사명", key: "companyName" },
                { label: "대표자", key: "representative" },
                { label: "주소", key: "address" },
                { label: "사업자번호", key: "businessNumber" },
                { label: "연락처", key: "phone" },
                { label: "팩스", key: "fax" },
                { label: "이메일", key: "email" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id={`companyProfile.editModal.label.${key}`} defaultText={label} /></label>
                  {key === "address" ? (
                    <ResumeAddressField value={editForm.address} onChange={v => setEditForm(p => ({ ...p, address: v }))} />
                  ) : (
                  <input autoComplete="off"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B]"
                    value={editForm[key] || ""}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                  />
                  )}
                  {key === "businessNumber" && <div className="mt-1.5"><BizCheck value={editForm.businessNumber} size="sm" /></div>}
                </div>
              ))}
            </div>
            <div className="px-6 pb-5 flex gap-3 border-t border-gray-100 pt-4">
              <button
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
                onClick={() => setEditModalOpen(false)}>
                <EditableText id="companyProfile.editModal.취소" defaultText="취소" />
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition disabled:opacity-50"
                disabled={submittingEdit}
                onClick={submitEditRequest}>
                {submittingEdit ? <EditableText id="companyProfile.editModal.요청중" defaultText="요청 중..." /> : <EditableText id="companyProfile.editModal.수정요청제출" defaultText="수정 요청 제출" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
