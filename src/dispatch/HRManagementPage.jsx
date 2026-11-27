// ======================= src/dispatch/HRManagementPage.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { kpConfirm } from "../kpDialog";
import { html2canvas, loadJsPDF } from "../lazyLoad";
import React from "react";
import { useUserProfiles } from "../userProfilesLive";
import { isHrStaffUser, masterHasHr } from "../hrHandover";
import { PeriodPicker as ResumePeriodPicker, DateField as ResumeDateField, SelectField as ResumeSelectField, BirthSelect as ResumeBirthSelect, AddressField as ResumeAddressField, EDU_STATUS as RESUME_EDU_STATUS, FAMILY_REL as RESUME_FAMILY_REL } from "../ResumeInputs";
import { useHrOptions } from "../hrConstants";
import { EditableText } from "../EditMode";
import { calcLeaveBalance } from "../leaveUtils";
import { useLeaveBasis } from "../leaveBasis";
import { useCompanyWorkWeekdays } from "../workWeekdays";
import { isHoliday, isRestDay, workWeekdaysOf, findApprovedLeaveForDate, approvalLeaveOn, hrLeaveOn } from "../attendanceUtils";
import { CustomSelect } from "../CustomSelect";
import { ROLE_LABELS } from "../customRoles";
import { query, collection, where, onSnapshot, doc, deleteField } from "firebase/firestore";
import { setDoc } from "../orderWrite";
import { db, DEFAULT_COMPANY, auth } from "../firebase";
import { isTMUser } from "../staffFilter";
import { sendInternalMail } from "../InternalMail";
import PersonnelOrder, { OrderNoticeHistory } from "../PersonnelOrder";
import { companyFleet, TeamPicker, DriverOrderPanel } from "../HrFleet";
import { ClassicResume } from "./shared/dispatchCommon.jsx";


// ─────────── 인사관리부 ───────────
function HRResumePrintButton({ row, resume, photo }) {
  const handlePrint = () => {
    const r = resume || {};
    const win = window.open("", "_blank", "width=860,height=1000");
    if (!win) return;
    const esc = (s) => (s || "").toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const eduRows = (r.education || []).map(e => `<tr><td>${esc(e.period)}</td><td>${esc(e.school)}</td><td>${esc([e.detail, e.status].filter(Boolean).join(" · "))}</td></tr>`).join("") || `<tr><td colspan="3" style="color:#999;text-align:center;">등록된 학력사항이 없습니다</td></tr>`;
    const careerRows = (r.career || []).map(c => `<tr><td>${esc(c.period)}</td><td>${esc(c.company)}</td><td>${esc(c.detail)}</td></tr>`).join("") || `<tr><td colspan="3" style="color:#999;text-align:center;">등록된 경력사항이 없습니다</td></tr>`;
    const certRows = (r.certificates || []).map(c => `<tr><td>${esc(c.date)}</td><td>${esc(c.name)}</td><td>${esc(c.issuer)}</td></tr>`).join("") || `<tr><td colspan="3" style="color:#999;text-align:center;">등록된 자격증이 없습니다</td></tr>`;
    const familyRows = (r.family || []).map(f => `<tr><td>${esc(f.relation)}</td><td>${esc(f.name)}</td><td>${esc(f.birth)}</td><td>${esc(f.job)}</td></tr>`).join("") || `<tr><td colspan="4" style="color:#999;text-align:center;">등록된 가족관계가 없습니다</td></tr>`;
    win.document.write(`
      <html><head><title>${esc(row.name)} 이력서</title>
      <style>
        body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; padding: 32px; color: #1B2B4B; }
        h1 { text-align: center; font-size: 22px; letter-spacing: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        th, td { border: 1px solid #ccc; padding: 7px 10px; font-size: 12.5px; }
        th { background: #f3f4f6; text-align: center; width: 90px; }
        .photo-box { width: 110px; height: 140px; border: 1px solid #999; float: right; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #999; overflow: hidden; }
        .photo-box img { width: 100%; height: 100%; object-fit: cover; }
        .basic-table td { vertical-align: middle; }
        .section-title { font-size: 14px; font-weight: bold; border-left: 4px solid #1B2B4B; padding-left: 8px; margin: 18px 0 8px; }
        .intro { white-space: pre-wrap; border: 1px solid #ccc; padding: 12px; min-height: 100px; font-size: 12.5px; line-height: 1.6; }
      </style></head>
      <body>
        <h1>이 력 서</h1>
        <div class="photo-box">${photo ? `<img src="${photo}" />` : "증명사진"}</div>
        <table class="basic-table">
          <tr><th>성명</th><td>${esc(row.name)}</td><th>생년월일</th><td>${esc(r.birthDate)}</td></tr>
          <tr><th>연락처</th><td>${esc(row.phone)}</td><th>이메일</th><td>${esc(row.email)}</td></tr>
          <tr><th>주소</th><td colspan="3">${esc(r.address)}</td></tr>
          <tr><th>소속</th><td>${esc(row.team || "미배정")} / ${esc(row.position || "-")}</td><th>입사일</th><td>${esc(row.hireDate)}</td></tr>
        </table>
        <div class="section-title">학력사항</div>
        <table><tr><th>기간</th><th>학교명</th><th>내용</th></tr>${eduRows}</table>
        <div class="section-title">경력사항</div>
        <table><tr><th>기간</th><th>근무처</th><th>내용</th></tr>${careerRows}</table>
        <div class="section-title">자격/면허</div>
        <table><tr><th>취득일</th><th>자격명</th><th>발급기관</th></tr>${certRows}</table>
        <div class="section-title">가족관계</div>
        <table><tr><th>관계</th><th>성명</th><th>생년월일/연령</th><th>직업</th></tr>${familyRows}</table>
        <div class="section-title">자기소개</div>
        <div class="intro">${esc(r.intro) || ""}</div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };
  return (
    <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[12px] font-bold hover:bg-gray-50 transition"><EditableText id="misc.btn.56182.인쇄" defaultText="인쇄" /></button>
  );
}

function HRAttendancePrintButton({ row }) {
  const handlePrint = () => {
    const r = row || {};
    const win = window.open("", "_blank", "width=860,height=1000");
    if (!win) return;
    const esc = (s) => (s || "").toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    win.document.write(`
      <html><head><title>${esc(r.name)} 근태/근속 현황</title>
      <style>
        body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; padding: 32px; color: #1B2B4B; }
        h1 { text-align: center; font-size: 22px; letter-spacing: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        th, td { border: 1px solid #ccc; padding: 9px 12px; font-size: 13px; }
        th { background: #f3f4f6; text-align: left; width: 160px; }
      </style></head>
      <body>
        <h1>근태 / 근속 현황</h1>
        <table>
          <tr><th>성명</th><td>${esc(r.name)}</td></tr>
          <tr><th>소속</th><td>${esc(r.team || "미배정")} / ${esc(r.position || "-")}</td></tr>
          <tr><th>입사일</th><td>${esc(r.hireDate) || "미등록"}</td></tr>
          <tr><th>근속기간</th><td>${esc(r.tenureLabel)}</td></tr>
          <tr><th>${esc(r.leave ? r.leave.leaveLabel + " 발생/사용/잔여" : "휴가")}</th><td>${r.leave ? `${r.leave.entitlement}일 / ${r.leave.used}일 / ${r.leave.remaining}일` : "입사일 미등록"}</td></tr>
          <tr><th>이달 출근일수</th><td>${r.workDays}일</td></tr>
          <tr><th>이달 연차/반차</th><td>${r.leaveDays}일</td></tr>
          <tr><th>병가 / 외근</th><td>${r.leave ? `${r.leave.sickDays}일 / ${r.leave.fieldDays}일` : "-"}</td></tr>
          <tr><th>결재 대기 건</th><td>${r.pendingApprovals}건</td></tr>
        </table>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };
  return (
    <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[12px] font-bold hover:bg-gray-50 transition"><EditableText id="misc.btn.56220.인쇄" defaultText="인쇄" /></button>
  );
}

export default function HRManagementPage({ userCompany, role, userId, focusUid = null, selfOnly = false, view = null, drivers = [] }) {
  const company = userCompany || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "";
  const now = new Date();
  const [members, setMembers] = React.useState([]);
  // ⭐ 인사발령·직책·권한 변경은 마스터(회사 첫 가입자)·인사관리자만
  // ⭐ 2026-11-04 인사 부서 직원·통합관리자(allMgr)도 — 전자결재 인사발령 품의를 기안한 인사 담당자가 결재 후 공문을 게시할 수 있게(인사관리부 메뉴 기준과 맞춤)
  const canManage = !selfOnly && (role === "totalMaster" || role === "hrManager" || role === "allMgr" || (role !== "viewer" && isHrStaffUser(members.find((m) => m.uid === userId))) || masterHasHr(members.find((m) => m.uid === userId), members, userId));
  const hrOpt = useHrOptions(company);
  const [profiles, setProfiles] = React.useState({}); // uid -> { hireDate }
  const [schedules, setSchedules] = React.useState([]);
  const [holidays, setHolidays] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [resumes, setResumes] = React.useState({}); // uid -> resume data
  const [selectedUid, setSelectedUid] = React.useState(null);
  const hrLeaveBasis = useLeaveBasis(company); // ⭐ 2026-11-07 회사 연차 회기 기준
  const coWeekdays = useCompanyWorkWeekdays(company); // 🗓 2026-11-23 회사 근무 요일(직원별 설정이 있으면 그것)
  // 🔗 2026-11-01 전자결재 근태 승인분(연차·반차·병가·외근·육아휴직 등) → 근태/근속 현황
  const [leaveAprs, setLeaveAprs] = React.useState([]);
  React.useEffect(() => {
    if (!company || !userId) return undefined;
    const q = selfOnly ? query(collection(db, "approvals"), where("participants", "array-contains", userId)) : query(collection(db, "approvals"), where("company", "==", company), where("cat", "==", "leave"));
    return onSnapshot(q, (sn) => setLeaveAprs(sn.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.cat === "leave" && a.status === "approved")), () => setLeaveAprs([]));
  }, [company, userId, selfOnly]);
  // ⭐ 2026-11-01 view를 주면(인사관리부 왼쪽 메뉴 › 인사관리 하위 항목) 그 화면만 보여주고 안쪽 탭 줄은 숨긴다
  const [activeTab, setActiveTab] = React.useState(view || "이력서");
  React.useEffect(() => { if (view) { setActiveTab(view); setDraft(null); setEditMode(false); } }, [view]);
  const [teamFilter, setTeamFilter] = React.useState("전체");
  const [showLeftHr, setShowLeftHr] = React.useState(false); // 🛠 2026-11-27 퇴사자는 맨 아래 '퇴사자' 묶음 — 눌러야 보인다
  const [search, setSearch] = React.useState("");
  // 🚛 2026-11-15 인사발령 — 소속 기사(지입 · 직영 · 임대)도 발령할 수 있게(지입관리 › [인사발령 작성]에서 오면 그 기사를 골라 둔다)
  const [hrWho, setHrWho] = React.useState(() => { try { return sessionStorage.getItem("kpHrDriverFocus") ? "driver" : "staff"; } catch { return "staff"; } });
  const [drvSelId, setDrvSelId] = React.useState(() => { try { const v = sessionStorage.getItem("kpHrDriverFocus"); sessionStorage.removeItem("kpHrDriverFocus"); return v || null; } catch { return null; } });
  const hrFleet = React.useMemo(() => companyFleet(drivers), [drivers]);
  const [editMode, setEditMode] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!company) return;
    const q = query(collection(db, "users"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.approved !== false && !isTMUser(u) && !["driver", "shipper", "cafeUser"].includes(u.role))); // ★ 최고관리자·기사·화주는 인사 대상 아님(⭐ 2026-11-02 기사가 미배정 직원으로 보이던 문제)
    }, () => {});
    return () => unsub();
  }, [company]);

  // 🔒 2026-11-07 보안 점검 — 예전엔 userProfiles 전체(모든 회사)를 구독했다 → 우리 회사 직원 한 건씩
  const memberProfiles = useUserProfiles(React.useMemo(() => members.map((m) => m.uid), [members]));
  React.useEffect(() => { setProfiles(memberProfiles); }, [memberProfiles]);

  React.useEffect(() => {
    if (!company) return;
    const unsub = onSnapshot(collection(db, "schedules"), snap => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => (s.companyName || DEFAULT_COMPANY) === company));
    }, () => {});
    return () => unsub();
  }, [company]);

  React.useEffect(() => {
    if (!company) return;
    const q = query(collection(db, "holidays"), where("companyName", "==", company));
    const unsub = onSnapshot(q, snap => {
      setHolidays(snap.docs.map(d => d.data()));
    }, () => {});
    return () => unsub();
  }, [company]);

  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  React.useEffect(() => {
    if (!company) return;
    const q = query(collection(db, "attendance"), where("companyName", "==", company), where("month", "==", monthStr));
    const unsub = onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => d.data()));
    }, () => {});
    return () => unsub();
  }, [company, monthStr]);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "hrResumes"), snap => {
      const m = {};
      snap.docs.forEach(d => { m[d.id] = d.data(); });
      setResumes(m);
    }, () => {});
    return () => unsub();
  }, []);

  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const numDaysSoFar = now.getDate();

  const rows = React.useMemo(() => {
    // ⭐ 2026-11-01 내 이력서(selfOnly) — 본인 기록만
    return members.filter((m) => !selfOnly || m.uid === userId).map(m => {
      const hireDate = profiles[m.uid]?.hireDate || "";
      // ⭐ 2026-11-07 전자결재 연차 현황 · 내정보와 같은 계산(승인된 전자결재 연차·반차 + 예전 게시판 · 연차 조정 · 회사 회기 기준)
      const leave = hireDate ? calcLeaveBalance(hireDate, schedules, m.uid, m.name, holidays, new Date(), { approvals: leaveAprs, adjust: profiles[m.uid]?.leaveAdjust || [], basis: hrLeaveBasis }) : null;
      let workDays = 0, leaveDays = 0, sickDays = 0, lateDays = 0, fieldM = 0;
      // ⭐ 2026-11-01 근태 — 날짜별 상태(달력 시각화) + 지각(출근 시각 > 근무 시작, 기준 없으면 09:00)
      const startHm = m.workStartTime || "09:00";
      const toMin = (hm) => { const [h, mm] = String(hm || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (mm || 0) : null; };
      const hmOf = (iso) => { if (!iso) return ""; const t = new Date(iso); return isNaN(t) ? "" : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const days = []; const lates = [];
      for (let d = 1; d <= dim; d++) {
        const ds = `${monthStr}-${String(d).padStart(2, "0")}`;
        const off = isHoliday(ds, holidays) || isRestDay(ds, workWeekdaysOf(m, coWeekdays)); // 🗓 직원 근무 요일
        if (d > numDaysSoFar) { days.push({ d, ds, status: off ? "휴일" : "", future: true }); continue; }
        const rec = records.find(r => r.uid === m.uid && r.date === ds);
        let status = rec?.status;
        if (!status) {
          if (off) { days.push({ d, ds, status: "휴일" }); continue; }
          // ⭐ 2026-11-02 점검 — 기록 없는 평일을 '출근'으로 세지 않음(출근기록부와 동일하게 빈칸·근무일 제외)
          status = findApprovedLeaveForDate(schedules, m.uid, ds, m.name) || approvalLeaveOn(leaveAprs, m.uid, ds) || hrLeaveOn(m, ds) || "";
          if (!status) { days.push({ d, ds, status: "" }); continue; }
        }
        const inHm = hmOf(rec?.checkInTime); const outHm = hmOf(rec?.checkOutTime);
        const late = status === "출근" && !!inHm && toMin(inHm) > toMin(startHm);
        if (status === "출근") workDays++;
        else if (status === "연차" || status === "오전반차" || status === "오후반차") leaveDays++;
        else if (status === "병가") sickDays++;
        else if (status === "외근" || status === "출장") fieldM++;
        if (late) { lateDays++; lates.push({ ds, inHm, by: toMin(inHm) - toMin(startHm), reason: rec?.lateReason || "" }); }
        days.push({ d, ds, status, late, inHm, outHm });
      }
      const pendingApprovals = schedules.filter(s => {
        const approvers = s.approvers || [];
        return approvers.some(a => a.uid === m.uid && (a.status || "pending") === "pending");
      }).length;
      let tenureLabel = "-";
      if (hireDate) {
        const hire = new Date(hireDate + "T00:00:00");
        const months = Math.max(0, (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth()) - (now.getDate() < hire.getDate() ? 1 : 0));
        tenureLabel = months >= 12 ? `${Math.floor(months / 12)}년 ${months % 12}개월` : `${months}개월`;
      }
      return { ...m, hireDate, tenureLabel, leave, workDays, leaveDays, sickDays, lateDays, fieldM, days, lates, startHm, pendingApprovals, team: m.team || "미배정" };
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [members, profiles, schedules, holidays, records, monthStr, numDaysSoFar, selfOnly, userId, leaveAprs, hrLeaveBasis, coWeekdays]);

  const filteredRows = React.useMemo(() => {
    return rows.filter(r => {
      if (teamFilter !== "전체" && r.team !== teamFilter) return false;
      if (search && !(r.name || "").includes(search) && !(r.position || "").includes(search)) return false;
      return true;
    });
  }, [rows, teamFilter, search]);

  const grouped = React.useMemo(() => {
    const g = {};
    // 🛠 2026-11-27 퇴사자는 재직자와 섞지 않고 맨 아래 '퇴사자' 묶음으로(예전엔 같은 부서 목록에 퇴사 표시 없이 섞였다)
    [...filteredRows.filter((r) => r.employmentStatus !== "퇴사"), ...filteredRows.filter((r) => r.employmentStatus === "퇴사")].forEach(r => {
      const key = r.employmentStatus === "퇴사" ? "퇴사자" : r.team || "미배정";
      if (!g[key]) g[key] = [];
      g[key].push(r);
    });
    return g;
  }, [filteredRows]);

  React.useEffect(() => {
    if (!selectedUid && rows.length) setSelectedUid((rows.find((r) => r.employmentStatus !== "퇴사") || rows[0]).uid); // 처음엔 재직자부터
  }, [rows, selectedUid]);
  // 직원 등록 직후 → 그 사람 이력서로
  React.useEffect(() => { if (focusUid && rows.some((r) => r.uid === focusUid)) setSelectedUid(focusUid); }, [focusUid, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = rows.find(r => r.uid === selectedUid) || null;
  // 🎂 2026-11-02 가입할 때 쓴 생년월일·주소가 이력서에 비어 있으면 그 값으로 채워 보여 준다(저장하면 이력서에도 남음)
  const resume = React.useMemo(() => {
    if (!selectedUid) return {};
    const r = resumes[selectedUid] || {};
    const u = members.find((m) => m.uid === selectedUid) || {};
    return { ...r, birthDate: r.birthDate || u.birthDate || "", address: r.address || u.address || "" };
  }, [selectedUid, resumes, members]);
  // 인사팀이 새로 제출된 이력서를 열면 "확인함"
  React.useEffect(() => { if (canManage && selectedUid && resumes[selectedUid]?.hrSeen === false) setDoc(doc(db, "hrResumes", selectedUid), { hrSeen: true, hrSeenAt: Date.now() }, { merge: true }).catch(() => {}); }, [canManage, selectedUid, resumes]);
  const newResumeCount = canManage ? members.filter((m) => resumes[m.uid]?.hrSeen === false).length : 0;
  const canEditThis = canManage || selectedUid === userId;

  const resumeRef = React.useRef(null);
  const attendanceRef = React.useRef(null);
  const [exportingPdf, setExportingPdf] = React.useState(false);

  const exportPdf = async (el, filename) => {
    if (!el) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new (await loadJsPDF())("p", "mm", "a4");
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      pdf.save(filename);
    } catch (err) {
      alert("PDF 저장 실패: " + err.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const startEdit = () => { setDraft({ ...resume, education: resume.education || [], career: resume.career || [], certificates: resume.certificates || [], family: resume.family || [] }); setEditMode(true); };
  const cancelEdit = () => { setDraft(null); setEditMode(false); };
  const saveResume = async () => {
    if (!selectedUid || !draft) return;
    if (resumes[selectedUid] && !(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // 처음 쓰는 이력서는 묻지 않는다
    setSaving(true);
    try {
      // ⭐ 2026-11-01 본인이 작성·저장하면 인사팀에 "새 이력서"로 표시 + 사내메일 알림
      const bySelf = selectedUid === userId && !canManage;
      await setDoc(doc(db, "hrResumes", selectedUid), { ...draft, companyName: company, ...(bySelf ? { selfSubmittedAt: Date.now(), hrSeen: false } : {}) }, { merge: true });
      // 🎂 생년월일은 계정에도 맞춰 둔다(생일 축하·3일 전 알림이 이 값을 쓴다)
      if (draft.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(draft.birthDate)) await setDoc(doc(db, "users", selectedUid), { birthDate: draft.birthDate }, { merge: true }).catch(() => {});
      if (bySelf) {
        const me = members.find((m) => m.uid === userId) || {};
        // 인사 담당자에게 — 없으면(신규 운송사) 임시로 인사 업무를 하는 마스터에게
        const hrStaffTo = members.filter((m) => m.uid !== userId && isHrStaffUser(m));
        const hrTo = (hrStaffTo.length ? hrStaffTo : members.filter((m) => m.uid !== userId && m.isMaster === true && m.employmentStatus !== "퇴사"))
          .map((m) => ({ uid: m.uid, name: m.name || m.email || "", team: m.team || "", position: m.position || "" }));
        if (hrTo.length) sendInternalMail({ company, to: hrTo, kind: "hr", fromName: me.name || "", subject: `[이력서 제출] ${me.name || ""}${me.team ? ` · ${me.team}` : ""}`, body: `${me.name || ""}님이 본인 이력서를 작성·저장했습니다.\n\n인사관리부 › 인사관리 › 이력서에서 확인해 주세요.` }).catch(() => {}); // ⭐ 2026-11-02 점검 — 메일 안내 경로를 실제 메뉴 이름(인사관리 › 이력서)으로
        alert("이력서를 저장했습니다. 인사팀에 알림이 갔습니다.");
      }
      setEditMode(false);
      setDraft(null);
    } catch (err) {
      alert("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !selectedUid) return;
    setPhotoUploading(true);
    const imgEl = new Image();
    const objUrl = URL.createObjectURL(file);
    imgEl.onload = async () => {
      URL.revokeObjectURL(objUrl);
      const MAX = 400;
      let w = imgEl.width, h = imgEl.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(imgEl, 0, 0, w, h);
      const dataUrl = cv.toDataURL("image/jpeg", 0.75);
      try {
        await setDoc(doc(db, "hrResumes", selectedUid), { photoUrl: dataUrl }, { merge: true });
      } catch (err) {
        alert("사진 저장 실패: " + err.message);
      } finally {
        setPhotoUploading(false);
      }
    };
    imgEl.onerror = () => { URL.revokeObjectURL(objUrl); setPhotoUploading(false); };
    imgEl.src = objUrl;
  };
  // ⭐ 증명사진 빼기(2026-10-28)
  const handlePhotoRemove = async () => {
    if (!selectedUid || !await kpConfirm("증명사진을 삭제할까요?")) return;
    setPhotoUploading(true);
    try {
      await setDoc(doc(db, "hrResumes", selectedUid), { photoUrl: deleteField() }, { merge: true });
    } catch (err) {
      alert("사진 삭제 실패: " + err.message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const setTeam = async (uid, team) => {
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // ✅ 2026-11-23 팀 바꾸기 전에 한 번 묻기(취소하면 원래 팀 그대로)
    try { await setDoc(doc(db, "users", uid), { team }, { merge: true }); }
    catch (err) { alert("팀 변경 실패: " + err.message); }
  };

  // ⭐ 2026-11-01 이력서 칸 — 기간은 월 선택(~ 재직/재학중), 날짜는 달력, 구분·관계는 선택(ResumeInputs.jsx)
  //   spec 값이 글자면 그냥 입력칸, { type: "period" | "date" | "select" } 이면 선택형
  const listField = (key, label, spec) => {
    const items = draft?.[key] || [];
    const setF = (i, f, v) => setDraft(d => { const arr = [...(d[key] || [])]; arr[i] = { ...arr[i], [f]: v }; return { ...d, [key]: arr }; });
    const txt = "w-full h-11 border border-[#DCE3EE] rounded-xl px-3 text-[14.5px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10";
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[16px] font-black text-[#0F1A30]">{label}</span>
          <button onClick={() => setDraft(d => ({ ...d, [key]: [...(d[key] || []), {}] }))} className="h-9 px-3.5 rounded-xl border border-[#E3E8F0] text-[13px] text-[#0F1A30] font-extrabold hover:bg-[#F5F8FD]">+ 추가</button>
        </div>
        {items.length === 0 && <div className="px-4 py-3 rounded-2xl border border-dashed border-[#DCE3EE] text-[13.5px] text-[#9AA9C3]">항목 없음</div>}
        {items.map((it, i) => (
          <div key={i} className="relative mb-2 p-3 pr-14 rounded-2xl border border-[#E3E8F0] bg-[#FAFBFD] flex flex-wrap gap-2 items-start">
            {Object.entries(spec).map(([f, sp]) => {
              const o = typeof sp === "string" ? { ph: sp } : sp;
              return (
                <div key={f} className={o.type === "period" ? "w-full lg:w-auto" : "flex-1 min-w-[140px]"}>
                  <div className="text-[11px] font-bold text-[#7A879C] mb-1">{o.ph}</div>
                  {o.type === "period" ? <ResumePeriodPicker value={it[f]} ongoingLabel={o.ongoing || "재직중"} onChange={v => setF(i, f, v)} />
                    : o.type === "date" ? <ResumeDateField value={it[f]} placeholder={o.ph} onChange={v => setF(i, f, v)} />
                    : o.type === "select" ? <ResumeSelectField value={it[f]} options={o.options} placeholder={`${o.ph} 선택`} onChange={v => setF(i, f, v)} />
                    : <input autoComplete="off" value={it[f] || ""} placeholder={o.hint || o.ph} onChange={e => setF(i, f, e.target.value)} className={txt} />}
                </div>
              );
            })}
            <button onClick={() => setDraft(d => ({ ...d, [key]: d[key].filter((_, idx) => idx !== i) }))} title="이 줄 삭제" className="absolute top-3 right-3 w-9 h-9 rounded-xl border border-[#E3E8F0] bg-white text-[#7A879C] hover:text-[#0F1A30] hover:bg-[#F5F8FD]">✕</button>
          </div>
        ))}
      </div>
    );
  };

  // ⭐ 2026-10-23 리디자인 — 왼쪽 인원 목록(사진/이니셜) + 오른쪽 사원증(디지털 명함) 머리 + 알약 탭
  const hrCard = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
  return (
    <div className="p-2 md:p-5 flex flex-col md:flex-row gap-3 md:gap-5" style={{ minHeight: 600 }}>
      {/* 좌측: 팀별 인원 목록 */}
      <div className={`w-full md:w-[310px] flex-shrink-0 flex-col overflow-hidden ${hrCard} max-h-[340px] md:max-h-[800px] ${selfOnly ? "hidden" : "flex"}`}>
        <div className="px-4 pt-4 pb-3 border-b border-[#EEF1F6]">
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">PEOPLE</div>
          <h2 className="text-[17px] font-black text-[#0F1A30] mb-2.5 flex items-center gap-2"><EditableText id="hr.title" defaultText="인사관리부" />{newResumeCount > 0 && <span className="h-6 px-2 rounded-full bg-[#D92D20] text-white text-[12px] font-black grid place-items-center" title="직원이 새로 제출한 이력서">새 이력서 {newResumeCount}</span>}</h2>
          {activeTab === "인사발령" && canManage && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#EEF2F8] border border-[#E3E8F0] mb-2.5" role="tablist">
              {[["staff", "직원"], ["driver", `소속 기사 ${hrFleet.length}`]].map(([k, l]) => <button key={k} type="button" onClick={() => setHrWho(k)} className={`h-8 rounded-[9px] text-[12.5px] ${hrWho === k ? "bg-white text-[#0F1A30] font-black shadow-sm" : "text-[#5B6B85] font-bold"}`}>{l}</button>)}
            </div>
          )}
          {/* 🧭 2026-11-15 팀은 버튼 대신 입력형 드롭다운으로 먼저 고르고, 그 아래에서 이름 · 직책을 찾는다 */}
          {!(activeTab === "인사발령" && hrWho === "driver") && <div className="mb-2"><TeamPicker value={teamFilter} onChange={setTeamFilter} teams={[...hrOpt.teams, "미배정"]} /></div>}
          <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-[#DCE3EE] bg-white focus-within:border-[#4B6CB7] focus-within:ring-4 focus-within:ring-[#4B6CB7]/10 transition">
            <svg className="w-4 h-4 text-[#9AA9C3] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} placeholder={activeTab === "인사발령" && hrWho === "driver" ? "이름/차량번호 검색" : "이름/직책 검색"}
              className="flex-1 min-w-0 text-[13px] font-semibold text-[#0F1A30] outline-none bg-transparent placeholder:text-[#A7B3C6]" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {activeTab === "인사발령" && canManage && hrWho === "driver" ? (
            !hrFleet.length ? <div className="py-16 px-4 text-center text-[13px] text-[#9AA9C3] leading-relaxed">소속 기사가 없습니다<br />기사관리에서 등급을 지입 · 직영 · 임대로 정해 주세요</div>
            : ["지입", "직영", "임대", "분양"].map((g) => { const list = hrFleet.filter((d) => String(d.등급 || "").trim() === g && (!search || `${d.이름 || d.name || ""} ${d.차량번호 || d.carNo || ""}`.includes(search.trim()))); return list.length ? (
              <div key={g} className="mb-2">
                <div className="px-2 pt-2 pb-1 flex items-center justify-between"><span className="text-[11px] font-extrabold tracking-[0.12em] text-[#7A879C]">{g}</span><span className="text-[11px] font-bold text-[#9AA9C3] tabular-nums">{list.length}명</span></div>
                {list.map((d) => { const on = drvSelId === d.id; return (
                  <button key={d.id} type="button" onClick={() => setDrvSelId(d.id)} className={`w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-2xl transition mb-0.5 ${on ? "bg-[#0F1A30] text-white" : "hover:bg-[#F5F8FD]"}`}>
                    <div className={`w-10 h-10 rounded-[14px] flex-shrink-0 flex items-center justify-center text-[14px] font-black ${on ? "bg-white text-[#0F1A30]" : "text-white"}`} style={on ? undefined : { background: "linear-gradient(135deg, #1B2B4B 0%, #2D4C82 100%)" }}>{(d.이름 || d.name || "?").slice(0, 1)}</div>
                    <div className="min-w-0 flex-1"><div className={`text-[14px] font-extrabold truncate ${on ? "text-white" : "text-[#0F1A30]"}`}>{d.이름 || d.name || "-"}</div><div className={`text-[11.5px] truncate ${on ? "text-white/60" : "text-[#7A879C]"}`}>{d.차량번호 || d.carNo || "-"}</div></div>
                  </button>); })}
              </div>) : null; })
          ) : (<>
          {Object.keys(grouped).length === 0 && <div className="py-16 text-center text-[13px] text-[#9AA9C3]">인원이 없습니다</div>}
          {Object.entries(grouped).map(([team, members2]) => (
            <div key={team} className="mb-2">
              {team === "퇴사자" ? (
                <button type="button" onClick={() => setShowLeftHr((v) => !v)} className="w-full px-2 pt-2 pb-1 flex items-center justify-between">
                  <span className="text-[11px] font-extrabold tracking-[0.12em] text-[#7A879C]">퇴사자 {showLeftHr ? "▴" : "▾ 눌러서 보기"}</span>
                  <span className="text-[11px] font-bold text-[#9AA9C3] tabular-nums">{members2.length}명</span>
                </button>
              ) : (
              <div className="px-2 pt-2 pb-1 flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-[0.12em] text-[#7A879C]">{team}</span>
                <span className="text-[11px] font-bold text-[#9AA9C3] tabular-nums">{members2.length}명</span>
              </div>)}
              {(team !== "퇴사자" || showLeftHr || members2.some((r) => r.uid === selectedUid)) && members2.map(r => {
                const photo = resumes[r.uid]?.photoUrl;
                const on = selectedUid === r.uid;
                return (
                  <button key={r.uid} onClick={() => { setSelectedUid(r.uid); setEditMode(false); setDraft(null); }}
                    className={`w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-2xl transition mb-0.5 ${on ? "bg-[#0F1A30] text-white shadow-[0_8px_18px_rgba(15,26,48,0.25)]" : "hover:bg-[#F5F8FD]"}`}>
                    <div className={`w-10 h-10 rounded-[14px] flex-shrink-0 overflow-hidden flex items-center justify-center text-[14px] font-black ${on ? "bg-white text-[#0F1A30]" : "text-white"}`}
                      style={photo || on ? undefined : { background: "linear-gradient(135deg, #1B2B4B 0%, #2D4C82 100%)" }}>
                      {photo ? <img src={photo} className="w-full h-full object-cover" /> : (r.name || "?").slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[14px] font-extrabold truncate ${on ? "text-white" : "text-[#0F1A30]"}`}>{r.name || r.email}{r.employmentStatus === "퇴사" && <span className={`ml-1.5 align-middle text-[10px] font-black px-1.5 py-0.5 rounded ${on ? "bg-white/20 text-white" : "bg-[#F2F4F7] text-[#5B6B85]"}`}>퇴사</span>}{resumes[r.uid]?.hrSeen === false && canManage && <span className="ml-1.5 align-middle text-[10px] font-black px-1.5 py-0.5 rounded bg-[#D92D20] text-white">NEW</span>}</div>
                      <div className={`text-[11.5px] truncate ${on ? "text-white/60" : "text-[#7A879C]"}`}>{r.position || "직책 미설정"}</div>
                    </div>
                    {r.pendingApprovals > 0 && <span className={`shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-extrabold flex items-center justify-center ${on ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white"}`} title="결재 대기">{r.pendingApprovals}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          </>)}
        </div>
      </div>

      {/* 우측: 상세 패널 */}
      <div className="flex-1 flex flex-col min-w-0 gap-4">
        {activeTab === "인사발령" && canManage && hrWho === "driver" ? (
          hrFleet.find((d) => d.id === drvSelId)
            ? <DriverOrderPanel company={company} driver={hrFleet.find((d) => d.id === drvSelId)} myName={members.find(m => m.uid === userId)?.name || auth.currentUser?.email?.split("@")[0] || ""} />
            : <div className={`flex-1 flex flex-col items-center justify-center py-28 ${hrCard}`}><div className="text-[15px] font-extrabold text-[#0F1A30]">기사를 선택하세요</div><div className="text-[13px] text-[#7A879C] mt-1">왼쪽에서 고르면 구분 변경 · 채용 · 휴직 · 계약 해지 발령을 낼 수 있어요</div></div>
        ) : !selected ? (
          <div className={`flex-1 flex flex-col items-center justify-center py-28 ${hrCard}`}>
            <div className="w-14 h-14 rounded-2xl bg-[#EEF3FB] text-[#1B2B4B] flex items-center justify-center mb-3">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16c.5-1.6 1.9-2.5 3.5-2.5s3 .9 3.5 2.5M15 10h3M15 13h3" /></svg>
            </div>
            <div className="text-[15px] font-extrabold text-[#0F1A30]">{selfOnly ? "내 인사 정보를 불러오는 중입니다" : "인원을 선택하세요"}</div>
            <div className="text-[13px] text-[#7A879C] mt-1">{selfOnly ? "승인된 직원 계정이면 잠시 후 내 이력서가 보입니다" : "왼쪽에서 고르면 사원증과 이력서가 보입니다"}</div>
          </div>
        ) : (
          <>
            {/* 사원증(디지털 명함) */}
            <div className="relative overflow-hidden rounded-[24px] px-4 sm:px-7 py-6 text-white shadow-[0_18px_40px_rgba(15,26,48,0.28)]" /* ⭐ 2026-11-02 화면 점검 — 모바일은 여백·사진을 줄여 통계칸 폭 확보 */
              style={{ background: "linear-gradient(125deg, #0F1A30 0%, #1B2B4B 52%, #2D4C82 100%)" }}>
              <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.05]" />
              <div className="absolute right-28 -bottom-28 w-60 h-60 rounded-full bg-white/[0.04]" />
              <div className="relative flex items-start gap-3 sm:gap-5">
                <div className="w-[64px] h-[80px] sm:w-[84px] sm:h-[104px] rounded-[18px] bg-white overflow-hidden flex items-center justify-center text-[26px] sm:text-[30px] font-black text-[#0F1A30] shadow-[0_10px_24px_rgba(0,0,0,0.25)] shrink-0">
                  {resume.photoUrl ? <img src={resume.photoUrl} className="w-full h-full object-cover" /> : (selected.name || "?").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">{(company || "").toUpperCase()} · EMPLOYEE</div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <div className="text-[26px] font-black tracking-tight leading-tight">{selected.name || selected.email}</div>
                    <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-white/15 font-bold">{ROLE_LABELS_HR[selected.role] || selected.role}</span>
                    {selected.employmentStatus && selected.employmentStatus !== "재직" && (
                      <span className="text-[11.5px] px-2 py-0.5 rounded-full border border-white/30 font-bold">{selected.employmentStatus}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-white/75">
                    <span>{selected.position || "직책 미설정"}</span>
                    <span className="text-white/30">·</span>
                    {canManage ? (
                      <CustomSelect value={selected.team || "미배정"} onChange={e => setTeam(selected.uid, e.target.value)}
                        className="h-7 px-2 rounded-lg bg-white/10 border border-white/20 text-white text-[13px] font-bold focus:outline-none [&>option]:text-[#0F1A30]">
                        {hrOpt.teams.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="미배정">미배정</option>
                      </CustomSelect>
                    ) : <span>{selected.team || "미배정"}</span>}
                  </div>
                  {/* ⭐ 2026-11-02 화면 점검 — 모바일 390px에서 4칸이면 글자가 세로로 깨져 2칸 → sm 이상 4칸 */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-[640px]">
                    {[
                      { k: "입사일", v: selected.hireDate || "미등록" },
                      { k: "근속", v: selected.tenureLabel || "-" },
                      { k: "잔여 휴가", v: selected.leave ? `${selected.leave.remaining}일` : "-" },
                      { k: "이달 출근", v: `${selected.workDays || 0}일` },
                    ].map(({ k, v }) => (
                      <div key={k} className="px-2.5 sm:px-3 py-2 rounded-xl bg-white/[0.08] border border-white/10 min-w-0">
                        <div className="text-[10.5px] font-bold text-white/55 whitespace-nowrap break-keep truncate">{k}</div>
                        <div className="text-[14px] font-black truncate whitespace-nowrap">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={`flex-1 flex flex-col min-w-0 ${hrCard}`}>
            <div className={`px-5 py-3 border-b border-[#EEF1F6] flex items-center justify-between gap-3 ${view && !(selected.pendingApprovals > 0) ? "hidden" : ""}`}>
              <div className={`inline-flex items-center gap-1 p-1 rounded-[14px] bg-[#EEF2F8] border border-[#E3E8F0] ${view ? "!hidden" : ""}`}>
                {(selfOnly ? ["이력서", "근태/근속"] : ["이력서", "근태/근속", ...(canManage ? ["인사발령"] : []), "인사발령 이력"]).map(t => (
                  <button key={t} onClick={() => { setActiveTab(t); cancelEdit(); }}
                    className={`px-4 h-9 rounded-[10px] text-[13.5px] transition whitespace-nowrap ${activeTab === t ? "bg-white text-[#0F1A30] font-extrabold shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_10px_rgba(16,24,40,0.08)]" : "text-[#5B6B85] font-bold hover:text-[#0F1A30]"}`}>{t}</button>
                ))}
              </div>
              {selected.pendingApprovals > 0 && <span className="text-[12.5px] font-bold text-[#3A4A66]">결재 대기 <b className="text-[#0F1A30]">{selected.pendingApprovals}</b>건</span>}
            </div>

            {/* ⭐ 2026-10-23 문서 리디자인 — 화면 폭 가득, 큰 글씨, 항목별 카드 */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "이력서" ? (
                <div>
                  <div className="flex justify-end gap-2 mb-4">
                    <HRResumePrintButton row={selected} resume={resume} photo={resume.photoUrl} />
                    <button onClick={() => exportPdf(resumeRef.current, `이력서_${selected.name || selected.email}.pdf`)} disabled={exportingPdf}
                      className="h-10 px-4 rounded-xl border border-[#E3E8F0] text-[#3A4A66] text-[13.5px] font-extrabold hover:bg-[#F5F8FD] transition disabled:opacity-50">{exportingPdf ? "저장 중..." : "PDF로 저장"}</button>
                    {canEditThis && !editMode && (
                      <button onClick={startEdit} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-extrabold hover:bg-[#1B2B4B]"><EditableText id="misc.btn.56544.수정" defaultText="수정" /></button>
                    )}
                    {editMode && (
                      <>
                        <button onClick={cancelEdit} className="h-10 px-4 rounded-xl border border-[#E3E8F0] text-[#5B6B85] text-[13.5px] font-extrabold hover:bg-[#F5F8FD]"><EditableText id="misc.btn.56548.취소" defaultText="취소" /></button>
                        <button onClick={saveResume} disabled={saving} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-extrabold hover:bg-[#1B2B4B] disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
                      </>
                    )}
                  </div>

                  {!editMode ? (
                    <div ref={resumeRef}>
                      <ClassicResume company={company} person={selected} resume={resume}
                        photoSlot={canEditThis ? (
                          <div className="absolute bottom-0 inset-x-0 flex" data-html2canvas-ignore>
                            <label className={`flex-1 text-center text-[11.5px] font-bold py-1 cursor-pointer ${photoUploading ? "bg-[#DCE3EE] text-[#5B6B85]" : "bg-[#0F1A30]/80 text-white hover:bg-[#0F1A30]"}`}>
                              {photoUploading ? "처리중" : resume.photoUrl ? "사진 변경" : "사진 등록"}
                              <input autoComplete="off" type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={(e) => { handlePhotoUpload(e); e.target.value = ""; }} />
                            </label>
                            {resume.photoUrl && !photoUploading && <button type="button" onClick={handlePhotoRemove} className="px-2 text-[11.5px] font-bold py-1 bg-[#0F1A30]/60 text-white/90 border-l border-white/20">삭제</button>}
                          </div>
                        ) : null} />
                    </div>
                  ) : (
                  <div ref={resumeRef} className="w-full bg-white rounded-[22px] border border-[#E3E8F0] px-10 py-9">
                    {/* 문서 머리 */}
                    <div className="flex items-end justify-between pb-5 mb-7 border-b-2 border-[#0F1A30]">
                      <div>
                        <div className="text-[12px] font-extrabold tracking-[0.3em] text-[#4B6CB7]">RESUME</div>
                        <div className="text-[30px] font-black text-[#0F1A30] tracking-[0.2em] leading-tight">이력서</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[15px] font-extrabold text-[#0F1A30]">{company}</div>
                        <div className="text-[13px] text-[#7A879C]">{selected.team} · {selected.position || "-"}</div>
                      </div>
                    </div>

                    {/* 인적사항 */}
                    <div className="flex gap-7 mb-9">
                      <div className="w-[136px] h-[176px] flex-shrink-0 rounded-[20px] overflow-hidden bg-[#F5F8FD] border border-[#DCE3EE] flex items-center justify-center relative">
                        {resume.photoUrl ? <img src={resume.photoUrl} className="w-full h-full object-cover" /> : <span className="text-[13px] font-bold text-[#9AA9C3]">증명사진</span>}
                        {canEditThis && (
                          <div className="absolute bottom-0 inset-x-0 flex">
                            <label className={`flex-1 text-center text-[12px] font-bold py-1.5 cursor-pointer ${photoUploading ? "bg-[#DCE3EE] text-[#5B6B85]" : "bg-[#0F1A30]/80 text-white hover:bg-[#0F1A30]"}`}>
                              {photoUploading ? "처리중" : resume.photoUrl ? "사진 변경" : "사진 등록"}
                              <input autoComplete="off" type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={(e) => { handlePhotoUpload(e); e.target.value = ""; }} />
                            </label>
                            {resume.photoUrl && !photoUploading && (
                              <button type="button" onClick={handlePhotoRemove} className="px-2.5 text-[12px] font-bold py-1.5 bg-[#0F1A30]/60 text-white/90 hover:bg-[#0F1A30] border-l border-white/20">삭제</button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        {[
                          { k: "성명", v: selected.name || "-", big: true },
                          { k: "생년월일", v: resume.birthDate || "-", edit: "birthDate", ph: "YYYY-MM-DD", span: editMode ? 2 : 1 },
                          { k: "입사일", v: selected.hireDate || "미등록" },
                          { k: "연락처", v: selected.phone || "-" },
                          { k: "이메일", v: selected.email || "-", span: 2 },
                          { k: "주소", v: resume.address || "-", edit: "address", span: 2 },
                          { k: "소속", v: `${selected.team} / ${selected.position || "-"}` },
                        ].map(({ k, v, big, edit, ph, span }) => (
                          <div key={k} className={`px-4 py-3 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] min-w-0 ${span === 2 ? "col-span-2" : ""}`}>
                            <div className="text-[12.5px] font-bold text-[#7A879C]">{k}</div>
                            {editMode && edit === "birthDate" ? (
                              <div className="mt-1"><ResumeBirthSelect value={draft.birthDate} onChange={v => setDraft(d => ({ ...d, birthDate: v }))} selectClass="w-full h-10 border border-[#DCE3EE] rounded-xl px-2 text-[14px] font-semibold text-[#0F1A30] bg-white focus:outline-none focus:border-[#4B6CB7]" /></div>
                            ) : editMode && edit === "address" ? (
                              <div className="mt-1"><ResumeAddressField value={draft.address} onChange={v => setDraft(d => ({ ...d, address: v }))} /></div>
                            ) : editMode && edit ? (
                              <input autoComplete="off" value={draft[edit] || ""} placeholder={ph || ""} onChange={e => setDraft(d => ({ ...d, [edit]: e.target.value }))}
                                className="mt-1 w-full h-10 border border-[#DCE3EE] rounded-xl px-3 text-[15px] font-semibold text-[#0F1A30] bg-white focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10" />
                            ) : (
                              <div className={`${big ? "text-[20px] font-black" : "text-[16px] font-extrabold"} text-[#0F1A30] truncate mt-0.5`}>{v}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {editMode ? (
                      <div className="space-y-5">
                        {listField("education", "학력사항", { period: { type: "period", ph: "기간(입학 ~ 졸업)", ongoing: "재학중" }, school: { ph: "학교명", hint: "예) 한국고등학교" }, detail: { ph: "전공·학과", hint: "예) 물류학과" }, status: { type: "select", ph: "구분", options: RESUME_EDU_STATUS } })}
                        {listField("career", "경력사항", { period: { type: "period", ph: "기간(입사 ~ 퇴사)", ongoing: "재직중" }, company: { ph: "근무처", hint: "회사명" }, detail: { ph: "담당 업무·직위", hint: "예) 배차 담당 / 대리" } })}
                        {listField("certificates", "자격/면허", { date: { type: "date", ph: "취득일" }, name: { ph: "자격명", hint: "예) 1종 대형" }, issuer: { ph: "발급기관", hint: "예) 경찰청" } })}
                        {listField("family", "가족관계", { relation: { type: "select", ph: "관계", options: RESUME_FAMILY_REL }, name: "성명", birth: { type: "date", ph: "생년월일" }, job: "직업" })}
                        <div>
                          <div className="text-[16px] font-black text-[#0F1A30] mb-2">자기소개</div>
                          <textarea value={draft.intro || ""} onChange={e => setDraft(d => ({ ...d, intro: e.target.value }))} rows={6}
                            className="w-full border border-[#DCE3EE] rounded-2xl px-4 py-3 text-[15px] leading-relaxed text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 resize-none" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {[
                          { en: "EDUCATION", ko: "학력사항", list: resume.education, cols: (e) => [e.period, e.school, e.detail] },
                          { en: "CAREER", ko: "경력사항", list: resume.career, cols: (c) => [c.period, c.company, c.detail] },
                          { en: "LICENSE", ko: "자격 / 면허", list: resume.certificates, cols: (c) => [c.date, c.name, c.issuer] },
                          { en: "FAMILY", ko: "가족관계", list: resume.family, cols: (f) => [f.relation, f.name, [f.birth, f.job].filter(Boolean).join(" · ")] },
                        ].map(({ en, ko, list, cols }) => (
                          <div key={en}>
                            <div className="flex items-baseline gap-3 mb-3">
                              <span className="text-[17px] font-black text-[#0F1A30]">{ko}</span>
                              <span className="text-[11px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">{en}</span>
                              <span className="flex-1 h-px bg-[#E3E8F0] self-center" />
                            </div>
                            {(list || []).length === 0 ? (
                              <div className="px-5 py-4 rounded-2xl border border-dashed border-[#DCE3EE] text-[14px] text-[#9AA9C3]">등록된 정보가 없습니다</div>
                            ) : (
                              <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
                                {(list || []).map((it, i) => {
                                  const [a, b, c] = cols(it);
                                  return (
                                    <div key={i} className={`grid grid-cols-[180px_minmax(0,1fr)_minmax(0,1.4fr)] gap-4 px-5 py-3.5 items-center ${i > 0 ? "border-t border-[#EEF1F6]" : ""}`}>
                                      <span className="text-[14.5px] font-bold text-[#5B6B85] tabular-nums">{a || "-"}</span>
                                      <span className="text-[15.5px] font-extrabold text-[#0F1A30] truncate">{b || "-"}</span>
                                      <span className="text-[15px] text-[#3A4A66] truncate">{c || ""}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                        <div>
                          <div className="flex items-baseline gap-3 mb-3">
                            <span className="text-[17px] font-black text-[#0F1A30]">자기소개</span>
                            <span className="text-[11px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">ABOUT</span>
                            <span className="flex-1 h-px bg-[#E3E8F0] self-center" />
                          </div>
                          {resume.intro ? (
                            <div className="px-6 py-5 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] text-[15.5px] text-[#1F2A44] whitespace-pre-wrap leading-[1.8]">{resume.intro}</div>
                          ) : (
                            <div className="px-5 py-4 rounded-2xl border border-dashed border-[#DCE3EE] text-[14px] text-[#9AA9C3]">등록된 자기소개가 없습니다</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ) : activeTab === "인사발령" && canManage && selected.employmentStatus === "퇴사" ? (
                // 🛠 2026-11-27 퇴사자에게는 발령 공문을 내지 않는다(예전엔 [발령 공문 발송]이 그대로 열려 공지 · 전 직원 메일이 나갈 수 있었다)
                <div className="rounded-2xl border border-[#E3E8F0] bg-[#F8FAFD] px-5 py-10 text-center">
                  <div className="text-[15px] font-black text-[#0F1A30]">퇴사한 직원이에요</div>
                  <div className="text-[13px] text-[#5B6B85] mt-1.5 leading-relaxed">퇴사자에게는 인사발령 공문을 보낼 수 없어요.<br />다시 입사했다면 직원관리에서 재직으로 바꾼 뒤 발령하면 돼요.</div>
                </div>
              ) : activeTab === "인사발령" && canManage ? (
                <PersonnelOrder company={company} target={selected} isSelf={selected.uid === userId}
                  myName={members.find(m => m.uid === userId)?.name || auth.currentUser?.email?.split("@")[0] || ""} />
              ) : activeTab === "근태/근속" ? (
                <div>
                  <div className="flex justify-end gap-2 mb-4">
                    <HRAttendancePrintButton row={selected} />
                    <button onClick={() => exportPdf(attendanceRef.current, `근태근속_${selected.name || selected.email}.pdf`)} disabled={exportingPdf}
                      className="h-10 px-4 rounded-xl border border-[#E3E8F0] text-[#3A4A66] text-[13.5px] font-extrabold hover:bg-[#F5F8FD] transition disabled:opacity-50">{exportingPdf ? "저장 중..." : "PDF로 저장"}</button>
                  </div>
                  {/* ⭐ 2026-11-01 근태/근속 — 디지털 대시보드: 큰 숫자 · 이달 날짜별 근태 달력 · 지각 내역 · 휴가 게이지 */}
                  <div ref={attendanceRef} className="w-full rounded-[24px] overflow-hidden text-white" style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(150deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
                    <div className="px-6 md:px-9 pt-7 pb-5 flex items-end justify-between gap-4 flex-wrap border-b border-white/10">
                      <div>
                        <div className="text-[12px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>ATTENDANCE · TENURE · {monthStr.replace("-", ".")}</div>
                        <div className="text-[28px] font-black tracking-[0.06em] leading-tight">근태 / 근속 현황</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[18px] font-black">{selected.name}</div>
                        <div className="text-[13px] text-white/55">{selected.team} · {selected.position || "-"} · 근무 시작 {selected.startHm}</div>
                      </div>
                    </div>
                    <div className="px-6 md:px-9 py-6 space-y-5">
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
                        {[
                          ["입사일", selected.hireDate || "미등록", ""],
                          ["근속기간", selected.tenureLabel || "-", "gold"],
                          ["이달 출근", `${selected.workDays || 0}일`, ""],
                          ["이달 지각", `${selected.lateDays || 0}회`, selected.lateDays ? "warn" : ""],
                          ["연차·반차", `${selected.leaveDays || 0}일`, ""],
                          ["병가 · 외근", `${selected.sickDays || 0} · ${selected.fieldM || 0}일`, ""],
                        ].map(([k, v, tone]) => (
                          <div key={k} className="rounded-2xl px-4 py-3.5 min-w-0" style={{ background: tone === "gold" ? "linear-gradient(135deg,rgba(215,188,130,0.25),rgba(215,188,130,0.08))" : tone === "warn" ? "rgba(247,144,9,0.14)" : "rgba(255,255,255,0.06)", boxShadow: `inset 0 0 0 1px ${tone === "gold" ? "rgba(215,188,130,0.5)" : tone === "warn" ? "rgba(247,144,9,0.5)" : "rgba(255,255,255,0.1)"}` }}>
                            <div className="text-[12.5px] font-bold text-white/55">{k}</div>
                            <div className={`text-[22px] font-black tabular-nums truncate ${tone === "warn" ? "text-[#FEC84B]" : tone === "gold" ? "text-[#F1DFB4]" : ""}`} style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* 이달 근태 달력(한 칸 = 하루) */}
                      <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div className="text-[15px] font-black">이달 근태</div>
                          <div className="flex flex-wrap gap-2.5 text-[12px] font-bold text-white/65">
                            {[["출근", "#4B6CB7"], ["지각", "#F79009"], ["연차·반차", "#32D583"], ["병가", "#F04438"], ["외근·출장", "#8FB0F0"], ["휴일", "rgba(255,255,255,0.12)"]].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: c }} />{l}</span>)}
                          </div>
                        </div>
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(42px,1fr))" }}>
                          {(selected.days || []).map((x) => {
                            const c = x.late ? "#F79009" : x.status === "출근" ? "#4B6CB7" : /연차|반차/.test(x.status) ? "#32D583" : x.status === "병가" ? "#F04438" : /외근|출장/.test(x.status) ? "#8FB0F0" : x.status === "휴일" ? "rgba(255,255,255,0.10)" : x.status ? "#D7BC82" : "transparent";
                            return (
                              <div key={x.d} title={[x.ds, x.status, x.inHm && `출근 ${x.inHm}`, x.outHm && `퇴근 ${x.outHm}`, x.late && "지각"].filter(Boolean).join(" · ")}
                                className="h-[52px] rounded-lg flex flex-col items-center justify-center" style={{ background: x.future ? "transparent" : c, boxShadow: x.future || !x.status ? "inset 0 0 0 1px rgba(255,255,255,0.12)" : x.late ? "0 0 10px rgba(247,144,9,0.55)" : "none", opacity: x.future ? 0.5 : 1 }}>
                                <span className="text-[13px] font-black tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{x.d}</span>
                                <span className="text-[10px] font-bold text-white/80 tabular-nums">{x.late ? x.inHm : x.status === "휴일" ? "" : (x.status || "").slice(0, 2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
                          <div className="flex items-baseline justify-between mb-2"><div className="text-[15px] font-black">지각 내역</div><div className="text-[12.5px] text-white/50">기준 {selected.startHm} 이후 출근</div></div>
                          {!(selected.lates || []).length ? <div className="py-6 text-center text-[14px] font-bold text-white/40">이달 지각이 없습니다</div> : (
                            <div className="divide-y divide-white/10">
                              {selected.lates.map((l) => (
                                <div key={l.ds} className="py-2.5 flex items-center gap-3">
                                  <span className="text-[15px] font-black tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{l.ds.slice(5).replace("-", ".")}</span>
                                  <span className="text-[14px] font-black text-[#FEC84B] tabular-nums">{l.inHm} 출근</span>
                                  <span className="text-[13px] font-bold text-white/60">+{l.by}분</span>
                                  {l.reason && <span className="text-[13px] text-white/55 truncate">· {l.reason}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
                          <div className="flex items-baseline justify-between mb-3"><div className="text-[15px] font-black">{selected.leave ? selected.leave.leaveLabel : "휴가"}</div>{selected.leave && <div className="text-[13px] text-white/60">발생 <b className="text-white">{selected.leave.entitlement}</b> · 사용 <b className="text-white">{selected.leave.used}</b> · 잔여 <b className="text-[#6CE9A6]">{selected.leave.remaining}</b>일</div>}</div>
                          {selected.leave ? (
                            <>
                              <div className="h-4 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((Number(selected.leave.used) || 0) / Math.max(1, Number(selected.leave.entitlement) || 0) * 100))}%`, background: "linear-gradient(90deg,#4B6CB7,#8FB0F0)", boxShadow: "0 0 10px rgba(143,176,240,0.6)" }} /></div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                {[["발생", selected.leave.entitlement], ["사용", selected.leave.used], ["잔여", selected.leave.remaining]].map(([k, v]) => <div key={k} className="rounded-xl bg-white/[0.06] py-2"><div className="text-[12px] text-white/50 font-bold">{k}</div><div className="text-[20px] font-black tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{v}</div></div>)}
                              </div>
                              <div className="mt-2 text-[12.5px] text-white/50">병가 {selected.leave.sickDays}일 · 외근 {selected.leave.fieldDays}일(회기 누적) · 결재 대기 {selected.pendingApprovals || 0}건</div>
                            </>
                          ) : <div className="text-[14px] text-white/45">입사일이 등록되지 않아 계산할 수 없습니다</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-white rounded-[22px] border border-[#E3E8F0] px-10 py-9">
                  <div className="flex items-end justify-between pb-5 mb-7 border-b-2 border-[#0F1A30]">
                    <div>
                      <div className="text-[12px] font-extrabold tracking-[0.3em] text-[#4B6CB7]">PERSONNEL HISTORY</div>
                      <div className="text-[30px] font-black text-[#0F1A30] tracking-[0.12em] leading-tight">인사발령 이력</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[17px] font-black text-[#0F1A30]">{selected.name}</div>
                      <div className="text-[13px] text-[#7A879C]">{selected.team} · {selected.position || "-"}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-8">
                    {[
                      { k: "현재 재직상태", v: selected.employmentStatus || "재직", strong: true },
                      { k: "입사일", v: selected.hireDate || "미등록" },
                      { k: "퇴사일", v: selected.resignedAt || "-" },
                    ].map(({ k, v, strong }) => (
                      <div key={k} className={`px-5 py-4 rounded-2xl ${strong ? "bg-[#0F1A30] text-white" : "bg-[#F5F8FD] border border-[#EDF1F7]"}`}>
                        <div className={`text-[13px] font-bold ${strong ? "text-white/60" : "text-[#7A879C]"}`}>{k}</div>
                        <div className={`text-[22px] font-black mt-1 ${strong ? "text-white" : "text-[#0F1A30]"}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-[17px] font-black text-[#0F1A30]">발령 이력</span>
                    <span className="text-[11px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">TIMELINE</span>
                    <span className="flex-1 h-px bg-[#E3E8F0] self-center" />
                  </div>
                  {(!selected.personnelHistory || selected.personnelHistory.length === 0) ? (
                    <div className="px-5 py-8 rounded-2xl border border-dashed border-[#DCE3EE] text-center text-[14.5px] text-[#9AA9C3]">등록된 인사발령 이력이 없습니다</div>
                  ) : (
                    <div className="relative pl-9">
                      <div className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-[#E3E8F0]" />
                      {[...selected.personnelHistory].reverse().map((h, i) => (
                        <div key={i} className="relative mb-3">
                          <span className={`absolute -left-[33px] top-5 w-4 h-4 rounded-full ${i === 0 ? "bg-[#0F1A30] ring-4 ring-[#EEF3FB]" : "bg-white border-[3px] border-[#9AA9C3]"}`} />
                          <div className="flex items-center gap-5 px-5 py-4 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7]">
                            <span className="text-[15px] font-bold text-[#5B6B85] tabular-nums w-[120px] shrink-0">{h.date}</span>
                            <span className="px-3 py-1 rounded-full bg-[#0F1A30] text-white text-[13px] font-extrabold shrink-0">{h.type}</span>
                            <span className="text-[16px] font-semibold text-[#0F1A30]">{h.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* ⭐ 2026-11-02 올린 발령 공문(정정·취소) — 인사발령 화면에서 이력으로 옮겼다 */}
                  <OrderNoticeHistory company={company} target={selected} isSelf={selected.uid === userId} canManage={canManage}
                    myName={members.find(m => m.uid === userId)?.name || auth.currentUser?.email?.split("@")[0] || ""} />
                </div>
              )}
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ROLE_LABELS_HR = ROLE_LABELS; // customRoles.js 공용 이름
