// ======================= src/dispatch/MyProfilePage.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { kpConfirm } from "../kpDialog";
import { html2canvas } from "../lazyLoad";
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMyProfile } from "../userNames";
import { useCompanyStaff } from "../hrHandover";
import { initialMyInfoTab, useMyInfoTabLink } from "../MyInfoTabs";
import { calcLeaveBalance } from "../leaveUtils";
import { useMyLeaveExtras } from "../leaveBasis";
import { ROLE_LABELS, useCustomRoles } from "../customRoles";
import { onSnapshot, doc, collection } from "firebase/firestore";
import { setDoc } from "../orderWrite";
import { db, DEFAULT_COMPANY } from "../firebase";
import { LoginManagerModal } from "../LoginManager";
import { TM_ORG, TM_AFFIL } from "../staffFilter";
import { useApprovalCounts } from "../Approval";
import { profitCls } from "../marginPct";
import { KP_CARD, fetchCompanyPrintInfo, formatPhone } from "./shared/dispatchCommon.jsx";

const ProfilePanel = ({ eyebrow, title: t, desc, right, children, className = "" }) => (
  <section className={`${KP_CARD} p-4 sm:p-6 ${className}`}>
    <div className="flex items-start gap-3 pb-4 mb-5 border-b border-[#EEF1F6]">
      <div className="flex-1 min-w-0">
        {eyebrow && <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{eyebrow}</div>}
        <div className="mt-0.5 text-[18px] font-black text-[#0F1A30] tracking-tight">{t}</div>
        {desc && <div className="text-[13.5px] text-gray-500 mt-1">{desc}</div>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

export default function MyProfilePage({ user, todayStats, myStats, cardImage, setCardImage, cardImageUploading, setCardImageUploading, showAlert, userCompany, role, extraTabs = [] }) {
  const [myTab, setMyTab] = React.useState(() => initialMyInfoTab()); // ⭐ 2026-11-07 오른쪽 탭(알림 [급여명세서 열기]로 바로 — MyInfoTabs.jsx)
  useMyInfoTabLink(setMyTab);
  const [loginMgrOpen, setLoginMgrOpen] = React.useState(false); // ★ 로그인 관리 창
  const co = role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || "")
    : (userCompany || localStorage.getItem("userCompany") || "");

  const navigate = useNavigate();

  const [hireDate, setHireDate] = useState("");
  const [hireDateSaving, setHireDateSaving] = useState(false);
  const [mySchedules, setMySchedules] = useState([]);
  const [myName, setMyName] = useState("");
  const [myInfo, setMyInfo] = useState({});
  // ⭐ 명함에 넣을 운송사 주소(회사정보)
  const [companyAddr, setCompanyAddr] = useState("");
  const [companyTel, setCompanyTel] = useState({ tel: "", fax: "" });
  useEffect(() => {
    if (!co) return;
    fetchCompanyPrintInfo(co).then((ci) => {
      setCompanyAddr(ci?.address || ci?.주소 || "");
      setCompanyTel({ tel: ci?.companyPhone || ci?.대표번호 || ci?.연락처 || ci?.phone || "", fax: ci?.fax || ci?.팩스 || ci?.팩스번호 || "" });
    }).catch(() => {});
  }, [co]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubProfile = onSnapshot(doc(db, "userProfiles", user.uid), snap => {
      if (snap.exists() && snap.data().hireDate) setHireDate(snap.data().hireDate);
    }, () => {});
    const unsubUser = onSnapshot(doc(db, "users", user.uid), snap => {
      if (snap.exists()) { setMyName(snap.data().name || ""); setMyInfo(snap.data()); }
    }, () => {});
    const unsub = onSnapshot(collection(db, "schedules"), snap => {
      setMySchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => (s.companyName || DEFAULT_COMPANY) === co));
    }, () => {});
    return () => { unsubProfile(); unsubUser(); unsub(); };
  }, [user?.uid, co]);


  // ⭐ 2026-11-07 전자결재 연차 현황과 같은 계산 — 승인된 전자결재 연차·반차 + 예전 게시판 · 연차 조정 · 회사 회기 기준
  const myLeaveX = useMyLeaveExtras(user?.uid, co);
  const leave = calcLeaveBalance(hireDate, mySchedules, user?.uid, myName || user?.displayName, [], new Date(), myLeaveX);

  const yearsOfService = useMemo(() => {
    if (!hireDate) return null;
    const hire = new Date(hireDate);
    const today = new Date();
    const years = today.getFullYear() - hire.getFullYear();
    const months = today.getMonth() - hire.getMonth();
    const totalMonths = years * 12 + months + (today.getDate() >= hire.getDate() ? 0 : -1);
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    if (totalMonths < 0) return null;
    if (y === 0) return `${m}개월 근속`;
    return m > 0 ? `${y}년 ${m}개월 근속` : `${y}년 근속`;
  }, [hireDate]);

  // ⭐ 2026-10-22 개편 — 디지털 명함 + 정보 카드 그리드(세로로 길던 화면을 가로 배치로)
  const ROLE_NAME = ROLE_LABELS;
  // ⭐ 2026-11-02 점검 — 권한 배지에 내부 키(hrAcct·r_xxx) 대신 한글 이름 표시(사용자 정의 역할 이름 포함)
  const customRolesMP = useCustomRoles();
  // ⭐ 2026-11-09 통합관리자·통합인사관리자는 화면(운송·경리·인사)을 바꿔도 내정보 권한은 실제 역할 그대로("통합관리자")
  const myDocMP = useMyProfile(user?.uid);
  const roleKeyMP = ["allMgr", "hrAcct"].includes(myDocMP?.role) ? myDocMP.role : role;
  const roleLabel = (customRolesMP || []).find((r) => r.key === roleKeyMP)?.label || ROLE_NAME[roleKeyMP] || "-";
  const displayName = myName || user?.displayName || (user?.email || "").split("@")[0];
  const phone = myInfo.전화번호 || myInfo.phone || "";
  const title = [myInfo.team, myInfo.position].filter(Boolean).join(" · ");
  const cardRef = React.useRef(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const fmtPhone = (v) => formatPhone(String(v || "").replace(/\D/g, "").slice(0, 12)); // 공용 formatPhone 사용
  const openEdit = () => { setDraftName(displayName || ""); setDraftPhone(phone); setEditOpen(true); };
  const saveInfo = async () => {
    if (!user?.uid) return;
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    setSavingInfo(true);
    try {
      // ⭐ 2026-11-02 점검 — 연락처를 phone·전화번호 두 필드에 함께 저장(회원관리·조직도·인사관리는 phone을 읽음)
      const p = fmtPhone(draftPhone);
      await setDoc(doc(db, "users", user.uid), { name: draftName.trim(), phone: p, 전화번호: p }, { merge: true });
      setEditOpen(false);
      showAlert("내 정보가 저장되었습니다.");
    } catch (e) { showAlert("저장 실패: " + (e?.message || e)); } finally { setSavingInfo(false); }
  };
  // ⭐ 2026-11-01 명함 이미지가 잘려 보이던 문제 — html2canvas는 글자를 브라우저보다 살짝 아래에 그려서
  //    "한 줄 말줄임(truncate)" 칸의 아래쪽이 잘렸다. 캡처용 복제본에서만 잘림을 풀고 크기를 고정한다.
  const cardCaptureOpts = (scale) => {
    const r = cardRef.current?.getBoundingClientRect();
    return {
      scale, backgroundColor: null, useCORS: true, logging: false,
      onclone: (docC) => {
        const el = docC.querySelector("[data-kp-card]");
        if (!el) return;
        if (r) { el.style.width = `${r.width}px`; el.style.height = `${r.height}px`; }
        el.style.boxShadow = "none";
        el.querySelectorAll(".truncate, [data-cap-fix]").forEach((n) => {
          n.style.overflow = "visible"; n.style.textOverflow = "clip"; n.style.lineHeight = "1.5"; n.style.paddingBottom = "1px";
        });
      },
    };
  };
  const saveCardAsImage = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, cardCaptureOpts(3));
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${displayName || "명함"}_디지털명함.png`;
      a.click();
    } catch (e) { showAlert("이미지 저장 실패: " + (e?.message || e)); }
  };
  const copyContact = async () => {
    const text = [`${role === "totalMaster" ? TM_ORG : co} ${displayName}${title ? ` (${title})` : ""}`, phone && `휴대폰 ${phone}`, companyTel.tel && `대표번호 ${companyTel.tel}`, companyTel.fax && `팩스 ${companyTel.fax}`, user?.email && `이메일 ${user.email}`, companyAddr && `주소 ${companyAddr}`].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(text); showAlert("연락처를 복사했습니다. 카카오톡이나 문자에 붙여 넣으세요."); } catch { showAlert("복사에 실패했습니다."); }
  };
  const saveVcard = () => {
    const vcf = ["BEGIN:VCARD", "VERSION:3.0", `FN:${displayName}`, `N:${displayName};;;;`, co && `ORG:${role === "totalMaster" ? TM_ORG : co}${myInfo.team ? `;${myInfo.team}` : ""}`,
      myInfo.position && `TITLE:${myInfo.position}`, phone && `TEL;TYPE=CELL:${phone}`, companyTel.tel && `TEL;TYPE=WORK:${companyTel.tel}`, companyTel.fax && `TEL;TYPE=FAX:${companyTel.fax}`,
      user?.email && `EMAIL:${user.email}`, companyAddr && `ADR;TYPE=WORK:;;${companyAddr};;;;`, "END:VCARD"].filter(Boolean).join("\r\n");
    const url = URL.createObjectURL(new Blob([vcf], { type: "text/vcard;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${displayName || "연락처"}.vcf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onCardFile = (file) => {
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
      } catch (err) {
        showAlert("저장 실패: " + err.message);
      } finally {
        setCardImageUploading(false);
      }
    };
    imgEl.onerror = () => { URL.revokeObjectURL(objUrl); showAlert("이미지 로드 실패"); setCardImageUploading(false); };
    imgEl.src = objUrl;
  };
  const Ico = ({ d, className = "" }) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
  );
  const usedPct = leave && leave.entitlement ? Math.min(100, Math.round((leave.used / leave.entitlement) * 100)) : 0;
  const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
  // ⭐ 2026-11-02 인사·경리팀은 오더·매출 실적 대신 결재·업무 현황을 보여 준다
  const teamTxt = String(myInfo.team || "");
  const officeKind = ["hrManager", "hrAcct", "hrStaff"].includes(role) || /인사/.test(teamTxt) ? "hr" : role === "test" || /경리|회계/.test(teamTxt) ? "acct" : null;
  const apc = useApprovalCounts();
  const coStaffMy = useCompanyStaff(officeKind === "hr" ? co : "");
  const workTiles = officeKind ? [
    ["결재할 차례", `${apc.todo || 0}건`, "지금 내가 결재할 문서"],
    officeKind === "hr" ? ["재직 직원", `${(coStaffMy || []).length}명`, "우리 회사 재직 인원"] : ["진행 중 내 기안", `${apc.myPending || 0}건`, "결재 진행 중인 내 문서"],
  ] : null;
  const btnGhost = "h-11 rounded-xl bg-white border border-[#D9E0EA] text-[13.5px] font-bold text-[#1B2B4B] hover:border-[#1B2B4B] hover:bg-[#F5F8FD] transition";
  // 잔여 연차 원형 그래프
  const remPct = leave && leave.entitlement ? Math.max(0, Math.min(100, Math.round((leave.remaining / leave.entitlement) * 100))) : 0;
  const Ring = ({ pct, size = 64, stroke = 7 }) => { const r = (size - stroke) / 2; const c = 2 * Math.PI * r; return (
    <svg width={size} height={size} className="-rotate-90 shrink-0"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#8FB0F0" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 600ms ease" }} /></svg>
  ); };

  // ⭐ 2026-11-07 내정보 화면 넓게 — 왼쪽: 나 요약(사진·연락처·근속·연차, 고정) / 오른쪽: 탭(내 정보 · 내 명함 …)
  //  탭을 늘리려면 myTabs에 한 줄만 더하면 된다(예: 급여명세서). 밖에서 extraTabs로 넘겨도 된다.
  const tile = "rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-4 py-3.5 min-w-0";
  const myTabs = [
    { key: "내 정보", render: () => (<div className="space-y-5">
          <ProfilePanel eyebrow="PROFILE" title="내 정보" desc="명함과 오더·기사앱에 표시되는 정보입니다"
            right={!editOpen && <button onClick={openEdit} className="h-10 px-4 rounded-xl bg-[#1B2B4B] text-white text-[13.5px] font-bold hover:bg-[#243a60] whitespace-nowrap">수정</button>}>
            {editOpen ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[720px]">
                <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">이름</span>
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="mt-1 w-full h-11 border border-[#DCE3EE] rounded-xl px-3.5 text-[14.5px] font-semibold outline-none focus:border-[#1B2B4B] focus:ring-4 focus:ring-[#1B2B4B]/10" /></label>
                <label className="block"><span className="text-[12.5px] font-bold text-[#7A879C]">연락처</span>
                  <input value={draftPhone} onChange={(e) => setDraftPhone(fmtPhone(e.target.value))} placeholder="010-0000-0000" inputMode="numeric" className="mt-1 w-full h-11 border border-[#DCE3EE] rounded-xl px-3.5 text-[14.5px] font-semibold outline-none focus:border-[#1B2B4B] focus:ring-4 focus:ring-[#1B2B4B]/10" /></label>
                <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                  <button onClick={() => setEditOpen(false)} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#5B6B85]">취소</button>
                  <button onClick={saveInfo} disabled={savingInfo} className="h-11 px-6 min-w-[120px] rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold disabled:opacity-60">{savingInfo ? "저장 중…" : "저장"}</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
                {[
                  ["이름", displayName || "-", <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>],
                  ["연락처", phone || "-", <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />],
                  ["이메일", user?.email || "-", <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>],
                  [role === "totalMaster" ? "소속" : "회사", role === "totalMaster" ? TM_AFFIL : (co || "-"), <><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1" /></>],
                  ["부서 · 직책", title || "미지정 (인사관리부에서 지정)", <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>],
                  ["권한", roleLabel /* ⭐ 2026-11-02 점검 — 한글 권한명 */, <path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" />],
                ].map(([k, v, ic]) => (
                  <div key={k} className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-white border border-[#E3E8F0] text-[#2D4C82] grid place-items-center shrink-0"><Ico d={ic} /></span>
                    <div className="min-w-0"><div className="text-[12.5px] font-bold text-[#7A879C]">{k}</div><div className="text-[15px] font-extrabold text-[#0F1A30] truncate">{v}</div></div>
                  </div>
                ))}
              </div>
            )}
          </ProfilePanel>

          <ProfilePanel eyebrow="WORK" title="근무 현황" desc={officeKind ? "휴가·외근은 결재 승인 건 기준 · 결재는 내 전자결재 기준" : "휴가·외근은 결재 승인 건 기준 · 실적은 내가 등록한 오더 기준"}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between text-[13.5px]">
                  <span className="font-black text-[#0F1A30]">{leave ? leave.leaveLabel : "연차"}</span>
                  <span className="text-[#7A879C]">{leave ? <>사용 <b className="text-[#0F1A30]">{leave.used}</b> / {leave.entitlement}일</> : "입사일 미등록"}</span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: "linear-gradient(90deg,#1B2B4B,#4B6CB7)" }} /></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[["잔여", leave?.remaining, true], ["병가", leave?.sickDays], ["외근", leave?.fieldDays]].map(([k, v, hi]) => (
                    <div key={k} className={`rounded-2xl px-2 py-2.5 ${hi ? "bg-[#1B2B4B] text-white" : "bg-[#F5F8FD] border border-[#E3E8F0] text-[#0F1A30]"}`}>
                      <div className={`text-[11.5px] font-bold ${hi ? "text-white/70" : "text-[#7A879C]"}`}>{k}</div>
                      <div className="text-[18px] font-black">{v ?? "-"}{v != null ? "일" : ""}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11.5px] text-[#9AA9C3]">입사일 변경은 인사팀(인사관리부)에서 합니다</div>
              </div>
              {officeKind ? (
                <div className="min-w-0">
                  <div className="text-[13.5px] font-black text-[#0F1A30] mb-2">결재 · 업무 현황</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[["결재할 차례", apc.todo, true], ["진행 중 내 기안", apc.myPending], ["새 결재 결과", apc.mineNew], ["참조 새 문서", apc.ccNew]].map(([k, v, hi]) => (
                      <div key={k} className={`rounded-2xl px-3 py-3 ${hi ? "bg-[#1B2B4B] text-white" : "bg-[#F5F8FD] border border-[#E3E8F0] text-[#0F1A30]"}`}>
                        <div className={`text-[11.5px] font-bold ${hi ? "text-white/70" : "text-[#7A879C]"}`}>{k}</div>
                        <div className="text-[18px] font-black tabular-nums">{v || 0}건</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[11.5px] text-[#9AA9C3]">{officeKind === "hr" ? "인사 업무는 인사관리부, 결재는 전자결재에서 처리합니다" : "정산·회계 업무는 정산관리·회계관리, 결재는 전자결재에서 처리합니다"}</div>
                </div>
              ) : (
              <div className="min-w-0">
                <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead><tr className="bg-[#F5F8FD] text-[#7A879C]"><th className="text-left font-bold px-3 py-2">구분</th><th className="text-right font-bold px-3 py-2">오더</th><th className="text-right font-bold px-3 py-2">매출</th><th className="text-right font-bold px-3 py-2">수익</th></tr></thead>
                    <tbody className="tabular-nums">
                      {[["오늘", todayStats?.count, todayStats?.revenue, todayStats?.profit], ["누적", myStats?.totalOrders, myStats?.totalRevenue, myStats?.totalProfit]].map(([k, c, r, pf]) => (
                        <tr key={k} className="border-t border-[#EEF1F6]"><td className="px-3 py-2.5 font-black text-[#0F1A30]">{k}</td><td className="px-3 py-2.5 text-right font-bold">{Number(c ?? 0).toLocaleString()}건</td><td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{won(r)}</td><td className={`px-3 py-2.5 text-right font-black whitespace-nowrap ${profitCls(pf, "text-[#2D4C82]")}`}>{won(pf)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>
          </ProfilePanel>
    </div>) },
    { key: "내 명함", render: () => (
        <ProfilePanel eyebrow="BUSINESS CARD" title="내 명함" desc="저장·공유하거나 메일 하단 명함으로 쓸 수 있습니다" className="min-w-0">
          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-5 items-start">
          <div className="min-w-0">
          <div ref={cardRef} data-kp-card className="relative overflow-hidden rounded-[22px] text-white w-full max-w-[520px] shadow-[0_18px_40px_rgba(15,26,48,0.35)]"
            style={{ aspectRatio: "1.75 / 1", background: "linear-gradient(135deg, #0F1A30 0%, #1B2B4B 45%, #2D4C82 100%)"}}>
            <div className="absolute -right-20 -top-24 w-80 h-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(147,197,253,0.22) 0%, rgba(147,197,253,0) 70%)" }} />
            <div className="absolute -left-16 -bottom-24 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)" }} />
            <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 60%)" }} />
            <div className="relative h-full flex flex-col px-[5.5%] pt-[4.5%] pb-[4%]">
              {/* ⭐ 운송사마다 쓰는 명함 — 프로그램 로고·이름은 넣지 않고 운송사 이름만 */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl ring-1 ring-white/25 flex items-center justify-center text-[18px] font-black shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>{(co || "운").slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-black tracking-tight truncate leading-[1.35]">{co || "운송사"}</div>
                  <div className="text-[10px] font-semibold tracking-[0.25em] text-blue-200/70 leading-[1.4]">LOGISTICS</div>
                </div>
                <div className="hidden sm:block text-[10px] font-bold tracking-[0.2em] text-white/40 leading-[1.4] pt-1">DIGITAL CARD</div>
              </div>
              <div className="mt-auto">
                <div className="text-[26px] sm:text-[30px] font-black tracking-tight leading-[1.15] truncate" data-cap-fix>{displayName || "이름을 등록하세요"}</div>
                <div className="mt-1 text-[13.5px] font-semibold text-blue-100/85 leading-[1.4] truncate">{title || ROLE_NAME[role] || ""}</div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/15 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] leading-[1.45]">
                {[
                  ["M", phone || "연락처 미등록", true],
                  ["E", user?.email || "-", true],
                  ["T", companyTel.tel, !!companyTel.tel && companyTel.tel.replace(/\D/g, "") !== String(phone).replace(/\D/g, "")],
                  ["F", companyTel.fax, !!companyTel.fax],
                ].filter((x) => x[2]).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-white/90 min-w-0">
                    <span className="w-4 shrink-0 text-[10.5px] font-black text-blue-200">{k}</span>
                    <span className="truncate">{v}</span>
                  </div>
                ))}
                {companyAddr && (
                  <div className="col-span-2 flex items-center gap-2 text-white/80 min-w-0">
                    <span className="w-4 shrink-0 text-[10.5px] font-black text-blue-200">A</span>
                    <span className="truncate">{companyAddr}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 max-w-[520px]">
            <button onClick={saveCardAsImage} className={btnGhost}>이미지 저장</button>
            <button onClick={copyContact} className={btnGhost}>연락처 복사</button>
            <button onClick={saveVcard} className={btnGhost}>연락처 파일</button>
          </div>
          </div>
          <div className="min-w-0 max-w-[640px] pt-5 border-t border-[#EEF1F6] 2xl:pt-0 2xl:border-t-0 2xl:pl-6 2xl:border-l">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div><div className="text-[14.5px] font-black text-[#0F1A30]">메일 첨부 명함</div><div className="text-[12px] text-[#7A879C]">이메일 보낼 때 하단에 붙는 이미지</div></div>
              <span className={`shrink-0 h-6 px-2 inline-flex items-center rounded-md text-[11px] font-black ${cardImage ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F3F6FA] text-[#7A879C]"}`}>{cardImage ? "등록됨" : "미등록"}</span>
            </div>
            <div className="flex gap-3 items-stretch">
              <div className="w-[42%] shrink-0 rounded-2xl border border-[#E3E8F0] bg-[#F5F8FD] aspect-[1.75/1] flex items-center justify-center overflow-hidden">
                {cardImage ? <img src={cardImage} alt="명함" className="w-full h-full object-contain" /> : <span className="text-[11.5px] text-[#9AA9C3]">이미지 없음</span>}
              </div>
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <button onClick={async () => {
                  try {
                    const canvas = await html2canvas(cardRef.current, cardCaptureOpts(2));
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                    setCardImage(dataUrl);
                    await setDoc(doc(db, "userProfiles", user.uid), { cardImageUrl: dataUrl }, { merge: true });
                    showAlert("디지털 명함을 메일 첨부 명함으로 등록했습니다.");
                  } catch (e) { showAlert("등록 실패: " + (e?.message || e)); }
                }} className="flex-1 min-h-[40px] rounded-xl bg-[#1B2B4B] text-white text-[12.5px] font-bold hover:bg-[#243a60]">위 명함으로 등록</button>
                <label className={`flex-1 min-h-[40px] rounded-xl grid place-items-center text-[12.5px] font-bold cursor-pointer transition border ${cardImageUploading ? "bg-gray-100 text-gray-500 border-transparent" : "bg-white border-[#D9E0EA] text-[#1B2B4B] hover:bg-[#F5F8FD]"}`}>
                  {cardImageUploading ? "업로드 중…" : "다른 이미지 선택"}
                  <input autoComplete="off" type="file" accept="image/*" className="hidden" disabled={cardImageUploading} onChange={(e) => onCardFile(e.target.files[0])} />
                </label>
                <button disabled={!cardImage} onClick={async () => {
                  setCardImage(null);
                  if (user?.uid) await setDoc(doc(db, "userProfiles", user.uid), { cardImageUrl: null }, { merge: true }).catch(() => {});
                }} className="min-h-[34px] rounded-xl text-red-500 text-[12px] font-bold hover:bg-red-50 disabled:opacity-40">삭제</button>
              </div>
            </div>
          </div>
          </div>
        </ProfilePanel>) },
    // 급여명세서 · 연차 사용 계획 — 회사관리에서 extraTabs(myInfoExtraTabs)로 넘긴다
    ...extraTabs,
  ];
  const activeTab = myTabs.find((t) => t.key === myTab) || myTabs[0];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
      {/* ── 왼쪽: 나 요약 ── */}
      <aside className="space-y-5 min-w-0 xl:sticky xl:top-2">
        <section className="relative overflow-hidden rounded-[24px] text-white shadow-[0_18px_40px_rgba(15,26,48,0.25)]" style={{ background: "linear-gradient(150deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
          <div className="relative p-5 md:p-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-[20px] grid place-items-center text-[28px] font-black shrink-0 ring-1 ring-white/25" style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.22),rgba(255,255,255,0.06))" }}>{(displayName || "?").slice(0, 1)}</div>
              <div className="min-w-0">
                <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]">MY PROFILE</div>
                <div className="text-[24px] font-black tracking-tight leading-tight truncate">{displayName || "이름을 등록하세요"}</div>
                <div className="mt-0.5 text-[13.5px] font-semibold text-blue-100/80 truncate">{title || "부서 미지정"}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {co && <span className="px-2 h-6 inline-flex items-center rounded-md bg-white/10 ring-1 ring-white/15 font-bold">{co}</span>}
              <span className="px-2 h-6 inline-flex items-center rounded-md bg-[#8FB0F0] text-[#0B1428] font-black">{roleLabel /* ⭐ 2026-11-02 점검 — 한글 권한명 */}</span>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-[14px]">
              {[["휴대폰", phone || "미등록"], ["이메일", user?.email || "-"]].map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 min-w-0"><span className="w-12 shrink-0 text-[12.5px] font-bold text-white/55">{k}</span><span className="font-bold truncate tabular-nums">{v}</span></div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className={tile}>
                <div className="text-[12px] font-bold text-white/60">근속</div>
                <div className="mt-1 text-[18px] font-black leading-tight truncate">{yearsOfService ? yearsOfService.replace(" 근속", "") : "-"}</div>
                <div className="mt-0.5 text-[12px] text-white/50 tabular-nums truncate">입사 {hireDate || "미등록"}</div>
              </div>
              <div className={`${tile} flex items-center gap-2.5`}>
                <div className="relative shrink-0"><Ring pct={remPct} size={46} stroke={5} /><span className="absolute inset-0 grid place-items-center text-[10.5px] font-black">{remPct}%</span></div>
                <div className="min-w-0"><div className="text-[12px] font-bold text-white/60">잔여 연차</div><div className="text-[18px] font-black leading-tight">{leave ? `${leave.remaining}일` : "-"}</div><div className="text-[12px] text-white/50 truncate">{leave ? `총 ${leave.entitlement}일` : "미등록"}</div></div>
              </div>
              {workTiles ? workTiles.map(([k, v, sub]) => (
                <div key={k} className={tile}>
                  <div className="text-[12px] font-bold text-white/60">{k}</div>
                  <div className="mt-1 text-[18px] font-black leading-tight tabular-nums">{v}</div>
                  <div className="mt-0.5 text-[12px] text-white/50 truncate">{sub}</div>
                </div>
              )) : (<>
              <div className={tile}>
                <div className="text-[12px] font-bold text-white/60">오늘 내 오더</div>
                <div className="mt-1 text-[18px] font-black leading-tight tabular-nums">{Number(todayStats?.count ?? 0).toLocaleString()}건</div>
                <div className="mt-0.5 text-[12px] text-white/50 tabular-nums truncate">매출 {won(todayStats?.revenue)}</div>
              </div>
              <div className={tile}>
                <div className="text-[12px] font-bold text-white/60">누적 오더</div>
                <div className="mt-1 text-[18px] font-black leading-tight tabular-nums">{Number(myStats?.totalOrders ?? 0).toLocaleString()}건</div>
                <div className="mt-0.5 text-[12px] text-white/50 tabular-nums truncate">수익 {won(myStats?.totalProfit)}</div>
              </div>
              </>)}
            </div>
          </div>
        </section>

        <section className={`${KP_CARD} px-5 py-4 flex items-center gap-3`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#1B2B4B] text-white flex items-center justify-center shrink-0"><Ico d={<><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>} /></div>
            <div className="min-w-0"><div className="text-[15px] font-black text-[#0F1A30]">계정 보안</div><div className="text-[13px] text-[#7A879C]">기기 · 비밀번호 관리</div></div>
          </div>
          <button onClick={() => setLoginMgrOpen(true)} className="h-10 px-4 shrink-0 rounded-xl bg-white border border-[#1B2B4B] text-[#1B2B4B] text-[13.5px] font-bold hover:bg-[#1B2B4B] hover:text-white transition whitespace-nowrap">로그인 · 보안</button>
          {loginMgrOpen && <LoginManagerModal user={user} onClose={() => setLoginMgrOpen(false)} />}
        </section>
      </aside>

      {/* ── 오른쪽: 탭 ── */}
      <div className="min-w-0 space-y-4">
        <div role="tablist" className={`${KP_CARD} p-1.5 flex gap-1 overflow-x-auto no-scrollbar`}>
          {myTabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === activeTab.key} onClick={() => setMyTab(t.key)}
              className={`h-11 px-5 rounded-[14px] text-[14.5px] font-black whitespace-nowrap transition ${t.key === activeTab.key ? "bg-[#0F1A30] text-white shadow-[0_6px_16px_rgba(15,26,48,0.2)]" : "text-[#5B6B85] hover:bg-[#F5F8FD] hover:text-[#0F1A30]"}`}>{t.label || t.key}</button>
          ))}
        </div>
        {activeTab.render()}
      </div>
    </div>
  );
}
